import importlib.util
import io
import json
from pathlib import Path
import socket
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from article_reader import (ArticleReader, SafeFetcher, ReaderError, UpstreamStatus,
                            sanitize_blocks, validate_url, public_addresses, MainArticle, PinnedHTTPSConnection)
import test_server as server_tests
preview=server_tests.preview

PUBLIC = '93.184.216.34'
def dns(ip=PUBLIC):
    return lambda *args: [(socket.AF_INET6 if ':' in ip else socket.AF_INET, socket.SOCK_STREAM, 6, '', (ip,443))]

class Response:
    def __init__(self, body=b'{}', status=200, headers=None):
        self.body=io.BytesIO(body);self.status=status
        self.headers=headers or {'Content-Type':'application/json'}
    def getheader(self, key):return self.headers.get(key)
    def read1(self,n):return self.body.read(n)

class Transport:
    def __init__(self, responses):self.responses=list(responses);self.connected=[];self.sock=None
    def connector(self, host, addresses, deadline):self.connected.append((host,addresses));return self
    def request(self, method, path, headers):
        assert method=='GET';assert 'Cookie' not in headers;assert 'Authorization' not in headers
    def getresponse(self):return self.responses.pop(0)
    def close(self):pass

class Fixtures:
    def __init__(self, records=None, raw=None):self.records=records or {};self.raw=raw or {};self.urls=[]
    def json(self,url,deadline):
        self.urls.append(url)
        for key,value in self.records.items():
            if key in url:return value
        raise ReaderError('Unsupported fixture')
    def get(self,url,types,deadline,**kwargs):
        self.urls.append(url)
        for key,value in self.raw.items():
            if key in url:
                if isinstance(value,Exception):raise value
                return value,'application/xml' if 'fullTextXML' in url else 'text/html'
        raise ReaderError('Unsupported fixture')

class ReaderSecurityTests(unittest.TestCase):
    def test_url_rejections(self):
        for url in ['http://www.ebi.ac.uk/a','https://localhost/a','https://127.0.0.1/a','https://[::1]/a',
                    'https://10.0.0.1','https://169.254.169.254/latest/meta-data', 'https://192.168.0.1',
                    'file:///etc/passwd','data:text/html,bad','javascript:alert(1)','https://evil.test',
                    'https://www.ebi.ac.uk:443/a','https://www.ebi.ac.uk:8443/a','https://user:pass@www.ebi.ac.uk/a',
                    'https://www.ebi.ac.uk:/a','https://www.ebi.ac.uk\\@evil.test/a','https://www.ebi.ac.uk/a\n',
                    'https://[malformed','not a URL']:
            with self.subTest(url=url):self.assertRaises(ReaderError,validate_url,url)
        self.assertEqual(validate_url('https://www.ebi.ac.uk/a').hostname,'www.ebi.ac.uk')

    def test_dns_blocks_every_nonpublic_address_and_mixed_results(self):
        for ip in ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','100.64.0.1',
                   '0.0.0.0','224.0.0.1','240.0.0.1','::1','fc00::1','fe80::1','ff02::1',
                   '::ffff:127.0.0.1','64:ff9b::7f00:1']:
            with self.subTest(ip=ip):self.assertRaises(ReaderError,public_addresses,'www.ebi.ac.uk',time.monotonic()+2,dns(ip))
        mixed=lambda *args:dns()()+dns('127.0.0.1')()
        self.assertRaises(ReaderError,public_addresses,'www.ebi.ac.uk',time.monotonic()+2,mixed)

    def test_real_transport_uses_numeric_socket_address_and_original_tls_hostname(self):
        calls={}
        class Sock:
            def settimeout(self,value):pass
            def connect(self,address):calls['address']=address
            def close(self):pass
        sock=Sock()
        conn=PinnedHTTPSConnection('openlibrary.org',dns()(),time.monotonic()+2)
        conn._context=SimpleNamespace(wrap_socket=lambda value,server_hostname:calls.update(host=server_hostname) or sock)
        with patch('article_reader.socket.socket',return_value=sock):conn.connect()
        self.assertEqual(calls['address'],(PUBLIC,443));self.assertEqual(calls['host'],'openlibrary.org')

    def test_dns_pinning_and_redirect_revalidation(self):
        t=Transport([Response()]);f=SafeFetcher(dns(),t.connector)
        self.assertEqual(f.get('https://openlibrary.org/works/OL1W.json',{'application/json'},time.monotonic()+2)[0],b'{}')
        self.assertEqual(t.connected[0][1][0][4][0],PUBLIC)
        for location in ['https://evil.test/a','http://openlibrary.org/a','https://127.0.0.1/a']:
            t=Transport([Response(status=302,headers={'Location':location})]);f=SafeFetcher(dns(),t.connector)
            self.assertRaises(ReaderError,f.get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+2)
            self.assertEqual(len(t.connected),1)
        calls=[]
        def rebinding(*args):
            calls.append(1);return dns(PUBLIC if len(calls)==1 else '127.0.0.1')()
        t=Transport([Response(status=302,headers={'Location':'/next'})]);f=SafeFetcher(rebinding,t.connector)
        self.assertRaises(ReaderError,f.get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+2)
        self.assertEqual(len(t.connected),1)

    def test_response_limits_types_timeouts_and_redirect_limit(self):
        cases=[Response(b'x'*33,headers={'Content-Type':'application/json'}),
               Response(headers={'Content-Type':'application/json','Content-Length':'100'}),
               Response(headers={'Content-Type':'application/json','Content-Encoding':'gzip'}),
               Response(headers={'Content-Type':'text/html'})]
        for response in cases:
            f=SafeFetcher(dns(),Transport([response]).connector)
            self.assertRaises(ReaderError,f.get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+2,32)
        t=Transport([Response(status=302,headers={'Location':'/again'}) for _ in range(4)])
        self.assertRaises(ReaderError,SafeFetcher(dns(),t.connector).get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+2)
        self.assertEqual(len(t.connected),4)
        self.assertRaises(ReaderError,SafeFetcher(dns(),t.connector).get,'https://openlibrary.org/a',{'application/json'},time.monotonic()-1)
        t=Transport([])
        def timeout():raise socket.timeout()
        t.getresponse=timeout
        self.assertRaises(ReaderError,SafeFetcher(dns(),t.connector).get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+2)

    def test_sanitizer_drops_active_content_tracking_and_attributes(self):
        blocks=sanitize_blocks('<p onclick="evil()">Good <a href="javascript:evil()">text</a><img src="https://tracker.test/pixel"></p><script>bad()</script><style>bad</style><iframe>bad</iframe><form>bad</form><svg>bad</svg><object>bad</object><aside>tracking</aside>')
        self.assertEqual(blocks,[{'type':'p','text':'Good text'}])

    def test_medical_full_text_requires_verified_open_record_and_reuse_license(self):
        meta={'resultList':{'result':[{'id':'123','source':'MED','isOpenAccess':'Y','pmcid':'PMC123','authorString':'A. Researcher'}]}}
        xml=b'<article xmlns:xlink="http://www.w3.org/1999/xlink"><front><permissions><license><ext-link xlink:href="https://creativecommons.org/licenses/by/4.0/"/></license></permissions></front><body><sec><title>Findings</title><p>Publicly licensed text.</p><script>evil()</script></sec></body></article>'
        f=Fixtures({'/search?':meta},{'/fullTextXML':xml});r=ArticleReader(f).read('med-123')
        self.assertEqual(r['mode'],'full');self.assertEqual(r['author'],'A. Researcher');self.assertEqual(r['blocks'][0]['type'],'h2')
        for altered in [xml.replace(b'creativecommons.org',b'evil.test'),b'<!DOCTYPE article [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><article><body><p>&xxe;</p></body></article>']:
            self.assertEqual(ArticleReader(Fixtures({'/search?':meta},{'/fullTextXML':altered})).read('med-123')['mode'],'excerpt')
        meta['resultList']['result'][0]['isOpenAccess']='N';f=Fixtures({'/search?':meta})
        self.assertEqual(ArticleReader(f).read('med-123')['mode'],'excerpt');self.assertEqual(len(f.urls),1)

    def test_source_specific_records_and_book_description_are_not_called_full_articles(self):
        f=Fixtures({'/detail/':{'id':'us123','properties':{'mag':4.9,'place':'Ocean','status':'reviewed'},'geometry':{'coordinates':[1,2,3]}}})
        self.assertEqual(ArticleReader(f).read('usgs-us123')['mode'],'record')
        f=Fixtures({'kev-data':{'vulnerabilities':[{'cveID':'CVE-2025-12345','requiredAction':'Patch','shortDescription':'Issue'}]}})
        self.assertEqual(ArticleReader(f).read('cisa-CVE-2025-12345')['mode'],'record')
        f=Fixtures({'OL123W':{'key':'/works/OL123W','description':'A catalog description.'}})
        self.assertEqual(ArticleReader(f).read('book-OL123W')['mode'],'description')

    def test_unapproved_publishers_and_metadata_only_ids_do_not_trigger_requests(self):
        f=Fixtures();r=ArticleReader(f)
        for ident in ['hn-123','space-123','doi-10.1234/paper','loc-history-example','blackhole']:
            self.assertEqual(r.read(ident)['mode'],'excerpt')
        self.assertEqual(f.urls,[])
        for ident in ['https://evil.test','file:///etc/passwd','javascript:alert(1)','../.env','']:
            self.assertRaises(ValueError,r.read,ident)

    def test_robots_access_restrictions_and_main_article_extraction(self):
        good=b'<html><nav>noise</nav><main><p>'+b'A public educational paragraph. '*8+b'</p><p>'+b'More explanation. '*8+b'</p></main><footer>noise</footer></html>'
        f=Fixtures(raw={'robots.txt':b'User-agent: *\nAllow: /','coral.html':good})
        r=ArticleReader(f).read('coral');self.assertEqual(r['mode'],'full');self.assertNotIn('noise',str(r['blocks']))
        # Live NOAA layout uses a Bootstrap article column, not <main>/<article>.
        noaa=good.replace(b'<main>',b'<div class="col-md-9">').replace(b'</main>',b'</div><div class="col-md-3 pl-4"><p>Sidebar noise</p></div>')
        f=Fixtures(raw={'robots.txt':b'User-agent: *\nAllow: /','coral.html':noaa})
        r=ArticleReader(f).read('coral')
        self.assertEqual(r['mode'],'full');self.assertNotIn('noise',str(r['blocks']))
        generic=MainArticle();generic.feed(noaa.decode())
        self.assertEqual(generic.fragments,[])  # This selector applies only to NOAA.
        blocked=Fixtures(raw={'robots.txt':b'User-agent: *\nDisallow: /'})
        self.assertEqual(ArticleReader(blocked).read('coral')['mode'],'excerpt');self.assertEqual(len(blocked.urls),1)
        for page in [b'<html><p>No main content</p></html>',good.replace(b'<main>',b'<meta name="robots" content="nosnippet"><main>'),good.replace(b'<main>',b'<main class="paywall">')]:
            f=Fixtures(raw={'robots.txt':b'User-agent: *\nAllow: /','coral.html':page})
            self.assertEqual(ArticleReader(f).read('coral')['mode'],'excerpt')

    def test_cache_concurrency_and_rate_limits(self):
        f=Fixtures({'OL1W':{'key':'/works/OL1W','description':'Description'}});r=ArticleReader(f)
        r.read('book-OL1W');r.read('book-OL1W');self.assertEqual(len(f.urls),1)
        for _ in range(4):r.slots.acquire()
        self.assertIn('busy',r.read('book-OL2W')['reason'])
        for _ in range(4):r.slots.release()
        with r.lock:r.inflight.add('book-OL3W')
        self.assertIn('busy',r.read('book-OL3W')['reason'])
        for i in range(25):r.read('hn-'+str(i))
        self.assertLessEqual(len(r.admissions),20)

    def test_deadline_watchdog_interrupts_a_stalled_transfer(self):
        from threading import Event
        stopped=Event()
        class Stalled(Response):
            def read1(self,n):
                if not stopped.wait(.5):raise AssertionError('watchdog did not close transfer')
                return b''
        t=Transport([Stalled()]);t.close=stopped.set
        self.assertRaises(ReaderError,SafeFetcher(dns(),t.connector).get,'https://openlibrary.org/a',{'application/json'},time.monotonic()+.03)
        self.assertTrue(stopped.is_set())

    def test_malformed_provider_payloads_fail_to_excerpt_without_exposing_errors(self):
        for meta in [{'resultList':None},{'resultList':{'result':[None]}},{'resultList':{'result':'wrong'}}]:
            r=ArticleReader(Fixtures({'/search?':meta})).read('med-123')
            self.assertEqual(r['mode'],'excerpt');self.assertNotIn('Traceback',str(r))

class ReaderEndpointTests(unittest.TestCase):
    def request(self,*args,**kwargs):
        # Base tests instantiate a fake server; inject a nonnetwork reader into it.
        original=preview.Handler.serve_asset
        def serve(handler,head=False):
            handler.server.article_reader=ArticleReader(Fixtures())
            return original(handler,head)
        with patch.object(preview.Handler,'serve_asset',serve):return server_tests.ServerSecurityTests.request(self,*args,**kwargs)

    def test_reader_endpoint_accepts_only_an_id_and_returns_json_fallback(self):
        status,headers,body=self.request('/api/reader?id=hn-123');self.assertEqual(status,200)
        self.assertEqual(json.loads(body)['mode'],'excerpt');self.assertEqual(headers['X-Content-Type-Options'],'nosniff')
        for path in ['/api/reader?url=https://evil.test','/api/reader?id=hn-1&id=hn-2','/api/reader?id=hn-1&url=x','/api/reader?id=https://evil.test','/api/reader']:
            self.assertEqual(self.request(path)[0],400,path)
        self.assertEqual(self.request('/api/reader?id=hn-1',headers=['Host: evil.test:8080'])[0],403)
