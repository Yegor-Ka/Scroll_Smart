"""ID-only, source-specific reader. No arbitrary-URL endpoint or publisher proxy."""
from collections import OrderedDict, deque
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urlsplit, urljoin, quote
from urllib.robotparser import RobotFileParser
from threading import BoundedSemaphore, Lock, Timer
import http.client
import ipaddress
import json
import re
import socket
import ssl
import time

import nh3
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

# Subset of existing feed/source domains. No wildcard or caller-controlled host.
HOSTS = frozenset({'www.ebi.ac.uk', 'earthquake.usgs.gov', 'openlibrary.org',
                   'raw.githubusercontent.com', 'oceanservice.noaa.gov'})
MAX_BODY = 2 * 1024 * 1024
MAX_TEXT = 120000
USER_AGENT = 'ScrollSmartReader/1.0'
_DNS_SLOTS = BoundedSemaphore(4)
_DNS_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix='reader-dns')

class ReaderError(Exception):
    """Safe classification, never return an upstream body or URL in an error."""

class UpstreamStatus(ReaderError):
    def __init__(self, status):
        self.status = status
        super().__init__('Source unavailable')


def validate_url(value):
    if (not isinstance(value, str) or len(value) > 2048
            or re.search(r'[\x00-\x20\x7f\\\u202a-\u202e\u2066-\u2069]', value)):
        raise ReaderError('Invalid destination')
    try:
        u = urlsplit(value)
        if (u.scheme != 'https' or u.hostname not in HOSTS or u.username is not None
                or u.password is not None or u.port is not None or u.fragment
                or u.netloc.lower() != u.hostname):
            raise ReaderError('Destination not permitted')
    except ValueError as exc:
        raise ReaderError('Invalid destination') from exc
    return u


def public_addresses(host, deadline, resolver=None):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise ReaderError('Source timed out')
    try:
        if resolver is None:
            if not _DNS_SLOTS.acquire(blocking=False):
                raise ReaderError('DNS busy')
            try:
                future = _DNS_POOL.submit(socket.getaddrinfo, host, 443, 0, socket.SOCK_STREAM)
            except Exception:
                _DNS_SLOTS.release()
                raise
            future.add_done_callback(lambda _: _DNS_SLOTS.release())
            try:
                rows = future.result(timeout=min(2, remaining))
            except FutureTimeout:
                future.cancel()
                raise ReaderError('DNS timed out')
        else:
            rows = resolver(host, 443, 0, socket.SOCK_STREAM)
        if not rows or len(rows) > 32:
            raise ReaderError('Invalid DNS response')
        for family, _, _, _, address in rows:
            ip = ipaddress.ip_address(address[0])
            if (family not in (socket.AF_INET, socket.AF_INET6) or not ip.is_global
                    or ip.is_multicast or ip.is_reserved or ip.is_unspecified
                    or getattr(ip, 'ipv4_mapped', None) is not None
                    or getattr(ip, 'sixtofour', None) is not None
                    or getattr(ip, 'teredo', None) is not None
                    or '%' in address[0]
                    or (ip.version==6 and ip in ipaddress.ip_network('64:ff9b::/96'))):
                raise ReaderError('Nonpublic destination')
        return rows
    except (OSError, ValueError) as exc:
        raise ReaderError('DNS unavailable') from exc


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, addresses, deadline):
        super().__init__(host, timeout=min(6, max(.01, deadline-time.monotonic())),
                         context=ssl.create_default_context())
        self.addresses, self.deadline = addresses, deadline

    def connect(self):
        # Connect to an already validated numeric address; TLS still verifies host/SNI.
        family, socktype, proto, _, address = self.addresses[0]
        sock = socket.socket(family, socktype, proto)
        try:
            sock.settimeout(min(6, max(.01, self.deadline-time.monotonic())))
            sock.connect(address)
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


class SafeFetcher:
    def __init__(self, resolver=None, connector=PinnedHTTPSConnection):
        self.resolver, self.connector = resolver, connector

    def get(self, url, types, deadline, limit=MAX_BODY, follow_redirects=True):
        for redirects in range(4):
            u = validate_url(url)
            addresses = public_addresses(u.hostname, deadline, self.resolver)
            if time.monotonic() >= deadline:
                raise ReaderError('Source timed out')
            conn = self.connector(u.hostname, addresses, deadline)
            stream_socket = [None]
            def stop_transfer():
                sock = stream_socket[0] or getattr(conn,'sock',None)
                if sock:
                    try:
                        sock.shutdown(socket.SHUT_RDWR)
                    except OSError:
                        pass
                conn.close()
            watchdog = Timer(max(.001,deadline-time.monotonic()), stop_transfer)
            watchdog.daemon = True
            watchdog.start()
            try:
                target = u.path or '/'
                if u.query:
                    target += '?' + u.query
                conn.request('GET', target, headers={'User-Agent': USER_AGENT,
                    'Accept': ', '.join(sorted(types)), 'Accept-Encoding': 'identity',
                    'Connection': 'close'})
                stream_socket[0] = conn.sock
                remaining = deadline-time.monotonic()
                if remaining<=0:
                    raise ReaderError('Source timed out')
                if conn.sock:
                    conn.sock.settimeout(min(6,remaining))
                response = conn.getresponse()
                if response.status in (301, 302, 303, 307, 308):
                    if not follow_redirects:
                        raise ReaderError('Redirect requires a new source policy review')
                    if redirects == 3:
                        raise ReaderError('Too many redirects')
                    location = response.getheader('Location')
                    if not location:
                        raise ReaderError('Invalid redirect')
                    url = urljoin(url, location)
                    validate_url(url)  # next iteration resolves/validates DNS again
                    continue
                if response.status != 200:
                    raise UpstreamStatus(response.status)
                mime = (response.getheader('Content-Type') or '').split(';')[0].strip().lower()
                if mime not in types:
                    raise ReaderError('Unsupported content type')
                if (response.getheader('Content-Encoding') or 'identity').lower() != 'identity':
                    raise ReaderError('Compressed content unsupported')
                length = response.getheader('Content-Length')
                if length is not None and (not length.isdigit() or int(length) > limit):
                    raise ReaderError('Source response too large')
                chunks, size = [], 0
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise ReaderError('Source timed out')
                    if conn.sock:
                        conn.sock.settimeout(min(6, remaining))
                    chunk = response.read1(min(65536, limit-size+1))
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > limit:
                        raise ReaderError('Source response too large')
                    chunks.append(chunk)
                if time.monotonic() >= deadline:
                    raise ReaderError('Source timed out')
                return b''.join(chunks), mime
            except (OSError, http.client.HTTPException) as exc:
                raise ReaderError('Source unavailable') from exc
            finally:
                watchdog.cancel()
                conn.close()
        raise ReaderError('Too many redirects')

    def json(self, url, deadline):
        data, _ = self.get(url, {'application/json', 'text/plain'} if
            url.startswith('https://raw.githubusercontent.com/cisagov/kev-data/') else
            {'application/json'}, deadline)
        try:
            result = json.loads(data)
            if not isinstance(result, dict):
                raise ReaderError('Invalid source record')
            return result
        except (ValueError, UnicodeError) as exc:
            raise ReaderError('Invalid source record') from exc


DROP_TAGS = {'script','style','iframe','object','embed','svg','math','form','input','button',
             'select','textarea','nav','footer','header','aside','noscript','template'}
BLOCK_TAGS = {'p','h2','h3','h4','li','blockquote','pre'}

class TextBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.parts, self.kind = [], [], 'p'

    def flush(self):
        text = re.sub(r'\s+', ' ', ''.join(self.parts)).strip()
        self.parts = []
        if text:
            self.blocks.append({'type': self.kind, 'text': text})

    def handle_starttag(self, tag, attrs):
        if tag in BLOCK_TAGS:
            self.flush()
            self.kind = 'h2' if tag in {'h2','h3','h4'} else 'p'

    def handle_endtag(self, tag):
        if tag in BLOCK_TAGS:
            self.flush()
            self.kind = 'p'

    def handle_data(self, data):
        self.parts.append(data)


def sanitize_blocks(fragment):
    if not isinstance(fragment, str) or len(fragment) > MAX_TEXT * 4:
        raise ReaderError('Text too large')
    # Established HTML5 sanitizer removes executable/unwanted subtrees and ALL attrs/URLs.
    cleaned = nh3.clean(fragment, tags=BLOCK_TAGS, attributes={}, clean_content_tags=DROP_TAGS,
                        url_schemes=set(), link_rel=None, strip_comments=True)
    parser = TextBlocks()
    parser.feed(cleaned)
    parser.flush()
    if len(parser.blocks) > 1000 or sum(len(x['text']) for x in parser.blocks) > MAX_TEXT:
        raise ReaderError('Text too large')
    return parser.blocks


class MainArticle(HTMLParser):
    """Select article/main or the fixed NOAA article column; never a whole page."""
    def __init__(self, noaa_layout=False):
        super().__init__(convert_charrefs=False)
        self.noaa_layout = noaa_layout
        self.depth = 0
        self.capture = False
        self.fragments = []
        self.restricted = False

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'meta' and values.get('name','').lower() in {'robots','scrollsmartreader'}:
            if re.search(r'noarchive|nosnippet|noindex', values.get('content',''), re.I):
                self.restricted = True
        if not self.capture and not self.fragments and (tag in {'main','article'} or (self.noaa_layout and tag == 'div' and values.get('class','').split() == ['col-md-9'])):
            self.capture = True
        if self.capture:
            if tag not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:
                self.depth += 1
            self.fragments.append(self.get_starttag_text())

    def handle_startendtag(self, tag, attrs):
        if self.capture:
            self.fragments.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if self.capture:
            self.fragments.append(f'</{tag}>')
            self.depth -= 1
            if self.depth <= 0:
                self.capture = False

    def handle_data(self, text):
        if self.capture:
            self.fragments.append(text)

    def handle_entityref(self, name):
        if self.capture:
            self.fragments.append('&'+name+';')

    def handle_charref(self, name):
        if self.capture:
            self.fragments.append('&#'+name+';')


def fallback(reason='This feed supplies summaries or metadata. Full-text retrieval is not supported for this source; open the original to read the article.'):
    return {'mode':'excerpt', 'blocks':[], 'reason':reason, 'image':None}


def result(blocks, mode, source, **metadata):
    if not blocks:
        return fallback()
    return {'mode':mode, 'blocks':blocks, 'source':source, 'image':None, **metadata}


class ArticleReader:
    def __init__(self, fetcher=None, clock=time.monotonic):
        self.fetcher = fetcher or SafeFetcher()
        self.clock, self.lock = clock, Lock()
        self.cache, self.admissions = OrderedDict(), deque()
        self.slots, self.inflight = BoundedSemaphore(4), set()

    def read(self, article_id):
        if not isinstance(article_id, str) or not re.fullmatch(r'[A-Za-z0-9._:/-]{1,100}', article_id):
            raise ValueError('Invalid article identifier')
        # These are internal feed IDs, not paths, URLs, or client-provided destinations.
        curated = {'book-frankenstein','book-pride','book-holmes','history-apollo','history-web',
                   'blackhole','crispr','transformer','webb','waves','coral','alphago','rosetta'}
        if article_id not in curated and not re.fullmatch(
                r'(?:(?:hn|space|med)-[0-9]{1,15}|usgs-[A-Za-z0-9]{1,32}|'
                r'cisa-CVE-[0-9]{4}-[0-9]{4,12}|book-OL[0-9]+W|'
                r'doi-[A-Za-z0-9._:/-]+|loc-history-[A-Za-z0-9._-]+)', article_id):
            raise ValueError('Unknown article identifier')
        with self.lock:
            now = self.clock()
            cached = self.cache.get(article_id)
            if cached and cached[0] > now:
                self.cache.move_to_end(article_id)
                return cached[1]
            while self.admissions and now-self.admissions[0] > 60:
                self.admissions.popleft()
            if article_id in self.inflight or len(self.admissions) >= 20:
                return fallback('Reader is busy. You can still read the excerpt or open the original.')
            if not self.slots.acquire(blocking=False):
                return fallback('Reader is busy. Please try again shortly.')
            self.inflight.add(article_id)
            self.admissions.append(now)
        try:
            try:
                value = self._read(article_id, time.monotonic()+18)
            except (ReaderError, ValueError, TypeError, KeyError, ElementTree.ParseError,
                    DefusedXmlException, RecursionError, AttributeError, IndexError, UnicodeError):
                value = fallback('The reader could not retrieve or safely process this source. It may be temporarily unavailable; try again or open the original.')
            with self.lock:
                self.cache[article_id] = (self.clock()+(600 if value['mode']!='excerpt' else 60), value)
                self.cache.move_to_end(article_id)
                while len(self.cache) > 64:
                    self.cache.popitem(last=False)
            return value
        finally:
            with self.lock:
                self.inflight.discard(article_id)
            self.slots.release()

    def _read(self, ident, deadline):
        if re.fullmatch(r'med-[0-9]{1,12}', ident):
            pmid = ident[4:]
            data = self.fetcher.json('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&query='+quote('EXT_ID:'+pmid+' AND SRC:MED'), deadline)
            records = data.get('resultList',{}).get('result',[])
            record = next((x for x in records if str(x.get('id'))==pmid and x.get('source')=='MED'), None)
            if not record or record.get('isOpenAccess')!='Y' or not re.fullmatch(r'PMC[0-9]+',record.get('pmcid','')):
                return fallback('The source does not offer approved open-access full text for this record.')
            if record.get('isRetracted')=='Y':
                return fallback('This record is marked retracted. Review the original source and corrections.')
            raw, _ = self.fetcher.get('https://www.ebi.ac.uk/europepmc/webservices/rest/'+record['pmcid']+'/fullTextXML', {'application/xml','text/xml'}, deadline)
            tree = ElementTree.fromstring(raw, forbid_dtd=True, forbid_entities=True, forbid_external=True)
            license_url = None
            for license_node in tree.findall('.//permissions/license'):
                for el in license_node.iter():
                    for key, val in el.attrib.items():
                        if key.endswith('href') and re.fullmatch(r'https?://creativecommons.org/(?:licenses/by/|publicdomain/zero/)[0-9.]+/?',val):
                            license_url = val.replace('http://','https://')
            if not license_url:
                return fallback('The full-text reuse license could not be verified. Open the original to read it.')
            body = tree.find('body')
            if body is None:
                return fallback()
            for el in body.iter():
                name = el.tag.rsplit('}',1)[-1]
                el.tag = 'h2' if name=='title' else name if name in BLOCK_TAGS | DROP_TAGS else 'div' if name in {'sec','list'} else 'span'
            blocks = sanitize_blocks(''.join(ElementTree.tostring(child,encoding='unicode') for child in body))
            return result(blocks,'full','Europe PMC',license=license_url,originalUrl='https://europepmc.org/article/MED/'+pmid,
                          author=record.get('authorString','')[:300], date=record.get('firstPublicationDate','')[:40])
        if re.fullmatch(r'usgs-[A-Za-z0-9]{1,32}', ident):
            event = ident[5:]
            data = self.fetcher.json('https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/'+event+'.geojson', deadline)
            if data.get('id')!=event:
                return fallback()
            p = data['properties']
            # Encode data values before making a sanitizer input fragment.
            from html import escape
            fragment = '<h2>Earthquake observation</h2>'+''.join('<p>'+escape(str(k)+': '+str(v))+'</p>' for k,v in {
                'Magnitude':p.get('mag'),'Location':p.get('place'),'Event timestamp (milliseconds)':p.get('time'),
                'Review status':p.get('status'),'Depth (km)':data.get('geometry',{}).get('coordinates',[None,None,None])[2],
                'Felt reports':p.get('felt'),'Tsunami flag':p.get('tsunami')}.items() if v is not None)
            return result(sanitize_blocks(fragment),'record','USGS',originalUrl='https://earthquake.usgs.gov/earthquakes/eventpage/'+event,reason='Official event record, not a news article. Measurements may be revised.')
        if re.fullmatch(r'cisa-CVE-[0-9]{4}-[0-9]{4,12}',ident):
            data = self.fetcher.json('https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json', deadline)
            row = next((x for x in data.get('vulnerabilities',[]) if x.get('cveID')==ident[5:]),None)
            if not row:
                return fallback()
            from html import escape
            blocks = sanitize_blocks(''.join('<p>'+escape(label+': '+str(row[key]))+'</p>' for key,label in {
                'cveID':'CVE','vulnerabilityName':'Vulnerability','vendorProject':'Vendor','product':'Product',
                'shortDescription':'Description','requiredAction':'Required action','dateAdded':'Added to catalog',
                'dueDate':'Federal remediation due date','knownRansomwareCampaignUse':'Known ransomware use'}.items() if row.get(key)))
            return result(blocks,'record','CISA KEV',originalUrl='https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve='+ident[5:],reason='Official catalog entry, not a complete incident report.')
        if re.fullmatch(r'book-OL[0-9]+W',ident):
            key='/works/'+ident[5:]
            data = self.fetcher.json('https://openlibrary.org'+key+'.json', deadline)
            if data.get('key')!=key:
                return fallback()
            description = data.get('description','')
            if isinstance(description,dict):
                description=description.get('value','')
            return result(sanitize_blocks(description),'description','Open Library',originalUrl='https://openlibrary.org'+key,reason='Catalog description only; this is not the full book.')
        if ident == 'coral':
            url='https://oceanservice.noaa.gov/facts/coral.html'
            try:
                robots, _ = self.fetcher.get('https://oceanservice.noaa.gov/robots.txt', {'text/plain'}, deadline, limit=65536, follow_redirects=False)
            except UpstreamStatus as exc:
                if exc.status != 404:
                    raise
                robots=b''
            policy=RobotFileParser();policy.parse(robots.decode('utf-8',errors='replace').splitlines())
            if robots and not policy.can_fetch(USER_AGENT,url):
                return fallback('The source does not permit automated reading of this page.')
            raw, _ = self.fetcher.get(url,{'text/html'},deadline,limit=1024*1024,follow_redirects=False)
            html_text=raw.decode('utf-8',errors='replace')
            if re.search(r'(?:isAccessibleForFree[\"\']?\s*:\s*false|class=[\"\'][^\"\']*(?:paywall|login-wall|captcha|cf-challenge))',html_text,re.I):
                return fallback('The publisher restricts access to this page. Read it on the original site.')
            page=MainArticle(noaa_layout=True);page.feed(html_text)
            if page.restricted or page.capture:
                return fallback('The publisher limits reuse of this page. Read it on the original site.')
            blocks=sanitize_blocks(''.join(page.fragments))
            if len(blocks)<2 or sum(len(x['text']) for x in blocks)<200:
                return fallback('A complete main article could not be safely identified.')
            return result(blocks,'full','NOAA National Ocean Service',license='https://oceanservice.noaa.gov/disclaimer.html',originalUrl=url)
        # Other providers expose links, metadata, or excerpts, not a reuse license.
        # Do not fetch DOI redirects, arbitrary HN submissions, publisher pages or PDFs.
        return fallback()
