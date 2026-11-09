// All provider payloads and browser storage are untrusted input.
export const TOPICS = ['All topics', 'Science', 'Technology', 'Space', 'Nature', 'Books', 'History', 'AI', 'Computer Science', 'Medicine', 'Cybersecurity'];
export const PROVIDERS = [
  {id:'books', name:'Open Library · book discovery', docs:'https://openlibrary.org/developers/api', description:'Science book suggestions with authors and publication years. Catalog entries are not reviews or personalized recommendations.'},
  {id:'history', name:'Library of Congress · Today in History', docs:'https://www.loc.gov/apis/json-and-yaml/', description:'Historical essays and archive entries. Archive dates are not current news dates.'},
  {id:'ai', name:'AI news · HN Search', docs:'https://hn.algolia.com/api', description:'Recent community-submitted links matching artificial intelligence. Check original reporting; this is not an official announcement feed.'},
  {id:'cs', name:'Computer science · HN Search', docs:'https://hn.algolia.com/api', description:'Recent community links about computer science, algorithms, and computing.'},
  {id:'medicine', name:'Europe PMC · medical research', docs:'https://europepmc.org/RestfulWebService', description:'Recent indexed medicine journal articles. Research updates are not clinical recommendations or medical advice.'},
  {id:'cyber-news', name:'Cybersecurity reports · HN Search', docs:'https://hn.algolia.com/api', description:'Community-submitted breach reports. Reports can be incomplete or unverified and do not cover every incident.'},
  {id:'cisa', name:'CISA · exploited vulnerabilities', docs:'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', description:'Recent additions to the Known Exploited Vulnerabilities catalog. Catalog dates are addition dates, not incident dates; this is not a complete incident database.'},
  {id:'hn', name:'Hacker News', docs:'https://github.com/HackerNews/API', description:'Community technology links; evaluate claims at the original source.'},
  {id:'space', name:'Spaceflight News', docs:'https://api.spaceflightnewsapi.net/v4/docs/', description:'Space reporting with publisher attribution and original links.'},
  {id:'usgs', name:'USGS Earthquake Hazards', docs:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', description:'Recent magnitude 4.5+ earthquakes. Preliminary measurements may change; this is not an emergency alert service.'},
  {id:'crossref', name:'Crossref', docs:'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', description:'Recently published journal metadata. A publication date is not proof of a discovery or of research quality.'}
];
const HOSTS = new Set(['hacker-news.firebaseio.com','api.spaceflightnewsapi.net','earthquake.usgs.gov','api.crossref.org','openlibrary.org','www.loc.gov','hn.algolia.com','www.ebi.ac.uk','www.cisa.gov','raw.githubusercontent.com']);
export function safeUrl(value) {
  if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f\\\u202a-\u202e\u2066-\u2069]/.test(value))return '';
  try {
    const u=new URL(value),host=u.hostname;
    if(u.protocol!=='https:'||u.username||u.password||u.port||!host.includes('.')||/^[0-9.]+$/.test(host)||host.includes(':'))return '';
    if(!host.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))return '';
    if(/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host))return '';
    return u.href;
  }catch{return ''}
}
export function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const text=(v,n)=>typeof v==='string'?v.slice(0,n).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,''):'';
export function normalizeCard(c){
  if(!c||typeof c!=='object'||!TOPICS.slice(1).includes(c.topic))return null;
  if(typeof c.id!=='string'||c.id.length>100)return null;
  const id=text(c.id,100),title=text(c.title,240),url=safeUrl(c.url);
  if(!/^[a-zA-Z0-9._:/-]+$/.test(id)||!title.trim()||!url)return null;
  const rawDate=typeof c.date==='number'&&Number.isFinite(c.date)||typeof c.date==='string'&&c.date.length<=40?c.date:undefined;
  const date=new Date(rawDate).getTime();
  if(c.live&&(!Number.isFinite(date)||date<0||date>Date.now()+86400000))return null;
  return {id,title,url,topic:c.topic,author:text(c.author,300),summary:text(c.summary,700),source:text(c.source,140),symbol:text(c.symbol,4),live:c.live===true,date:Number.isFinite(date)?date:undefined,year:Number.isInteger(c.year)&&c.year>=1000&&c.year<=2100?c.year:undefined,evergreen:c.evergreen===true,kind:['Book discovery','Reading note','History archive','Historical fact','Research update','Community news','Security advisory'].includes(c.kind)?c.kind:''};
}
export function normalizeList(items){return Array.isArray(items)?items.slice(0,200).map(normalizeCard).filter(Boolean):[]}
export function dedupe(items){const seen=new Set();return items.filter(c=>{const u=new URL(c.url);u.hash='';for(const key of [...u.searchParams.keys()])if(key.startsWith('utm_'))u.searchParams.delete(key);const key=u.href;if(seen.has(key))return false;seen.add(key);return true})}
export async function fetchJson(url,fetcher=fetch){
  const u=new URL(url);if(url.length>4096||u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.port||u.username||u.password||u.hash||(u.hostname==='raw.githubusercontent.com'&&u.pathname!=='/cisagov/kev-data/develop/known_exploited_vulnerabilities.json'))throw Error('Blocked API destination');
  const routes={
    'hacker-news.firebaseio.com':/^\/v0\/(?:topstories|item\/[0-9]+)\.json$/,
    'api.spaceflightnewsapi.net':/^\/v4\/articles\/$/,
    'earthquake.usgs.gov':/^\/earthquakes\/feed\/v1\.0\/summary\/4\.5_week\.geojson$/,
    'api.crossref.org':/^\/works$/,'openlibrary.org':/^\/subjects\/science\.json$/,
    'www.loc.gov':/^\/collections\/today-in-history\/$/,'hn.algolia.com':/^\/api\/v1\/search_by_date$/,
    'www.ebi.ac.uk':/^\/europepmc\/webservices\/rest\/search$/,
    'www.cisa.gov':/^\/sites\/default\/files\/feeds\/known_exploited_vulnerabilities\.json$/,
    'raw.githubusercontent.com':/^\/cisagov\/kev-data\/develop\/known_exploited_vulnerabilities\.json$/
  };
  if(!routes[u.hostname].test(u.pathname))throw Error('Blocked API route');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const r=await fetcher(u.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-cache',headers:{Accept:'application/json'}});
    if(r.redirected)throw Error('Unexpected redirect');
    if(!r.ok)throw Error('Provider unavailable');
    const mime=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const officialRaw=u.hostname==='raw.githubusercontent.com'&&mime==='text/plain';
    if(!/^application\/(?:json|[a-z0-9.+-]+\+json)$/.test(mime)&&!officialRaw)throw Error('Unexpected response format');
    const limit=2*1024*1024;if(Number(r.headers.get('content-length'))>limit)throw Error('Response too large');
    const reader=r.body.getReader();let size=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Response too large');chunks.push(value)}}finally{await reader.cancel()}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return JSON.parse(new TextDecoder().decode(bytes));
  }finally{clearTimeout(timer)}
}
export async function loadProvider(id,get=fetchJson){
  let items;
  if(id==='hn'){
    const ids=await get('https://hacker-news.firebaseio.com/v0/topstories.json');if(!Array.isArray(ids))throw Error('Invalid story list');
    const results=await Promise.allSettled(ids.filter(Number.isSafeInteger).slice(0,8).map(n=>get(`https://hacker-news.firebaseio.com/v0/item/${n}.json`)));
    items=results.filter(r=>r.status==='fulfilled'&&r.value&&!r.value.dead&&!r.value.deleted).map(r=>r.value).map(s=>({id:'hn-'+s.id,topic:'Technology',live:true,date:s.time*1000,title:s.title,summary:'A community-submitted link. Open the original reporting for context and evidence.',source:'Hacker News · community link',url:s.url,symbol:'⌘'}));
  }else if(id==='space'){
    const data=await get('https://api.spaceflightnewsapi.net/v4/articles/?limit=6');if(!Array.isArray(data.results))throw Error('Invalid articles');
    items=data.results.slice(0,6).map(s=>({id:'space-'+s.id,topic:'Space',live:true,date:s.published_at,title:s.title,summary:s.summary,source:s.news_site,url:s.url,symbol:'✦'}));
  }else if(id==='usgs'){
    const data=await get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson');if(!Array.isArray(data.features))throw Error('Invalid earthquakes');
    items=data.features.slice(0,5).filter(s=>s?.properties&&Number.isFinite(s.properties.mag)).map(s=>({id:'usgs-'+s.id,topic:'Nature',live:true,date:s.properties.time,title:s.properties.title,summary:`USGS reports magnitude ${s.properties.mag}. Earthquake measurements can be revised as more observations arrive. Explore the event record to understand its location and seismic data.`,source:'USGS · preliminary event data',url:s.properties.url,symbol:'≋'}));
  }else if(id==='crossref'){
    const cutoff=new Date().toISOString().slice(0,10);
    const data=await get(`https://api.crossref.org/works?filter=type:journal-article,until-pub-date:${cutoff}&sort=published&order=desc&rows=5&select=DOI,title,published,container-title`);if(!Array.isArray(data.message?.items))throw Error('Invalid publications');
    items=data.message.items.slice(0,5).map(s=>{const p=s.published?.['date-parts']?.[0];return {id:'doi-'+String(s.DOI).replace(/[^a-zA-Z0-9._:/-]/g,'_'),topic:'Science',live:true,date:Array.isArray(p)?Date.UTC(p[0],(p[1]||1)-1,p[2]||1):NaN,title:s.title?.[0],summary:'Recently published journal metadata from Crossref. Read the paper and assess its methods; indexing does not independently verify its findings.',source:s['container-title']?.[0]||'Crossref · journal metadata',url:typeof s.DOI==='string'?'https://doi.org/'+encodeURIComponent(s.DOI):'',symbol:'⌬'}});
  }else if(['ai','cs','cyber-news'].includes(id)){
    const config={ai:['artificial intelligence','AI'],cs:['computer science','Computer Science'],'cyber-news':['breach','Cybersecurity']}[id];
    const data=await get('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=6&query='+encodeURIComponent(config[0]));
    if(!Array.isArray(data.hits))throw Error('Invalid search results');
    items=data.hits.slice(0,6).filter(s=>s&&typeof s.objectID==='string'&&/^\d+$/.test(s.objectID)).map(s=>({id:'hn-'+s.objectID,topic:config[1],title:s.title,url:s.url,date:s.created_at,live:true,kind:'Community news',source:'Hacker News Search · community link',summary:id==='cyber-news'?'A community-submitted security report. Follow the original source for what is confirmed, who is affected, and any corrections. Coverage is selective.':'A recent community-submitted link. Open the source to distinguish reporting, opinion, research, and announcements.',symbol:id==='ai'?'✳':id==='cs'?'⌘':'⬡'}));
  }else if(id==='books'){
    const data=await get('https://openlibrary.org/subjects/science.json?limit=6');
    if(!Array.isArray(data.works))throw Error('Invalid books');
    items=data.works.slice(0,6).filter(b=>b&&typeof b.key==='string'&&/^\/works\/OL[0-9]+W$/.test(b.key)).map(b=>({id:'book-'+b.key.split('/').pop(),topic:'Books',year:b.first_publish_year,author:Array.isArray(b.authors)?b.authors.map(a=>typeof a?.name==='string'?a.name:'').filter(Boolean).slice(0,3).join(', '):'',title:b.title,url:'https://openlibrary.org'+b.key,evergreen:true,kind:'Book discovery',source:'Open Library · catalog suggestion',summary:`By ${Array.isArray(b.authors)?b.authors.map(a=>typeof a?.name==='string'?a.name.slice(0,80):'').filter(Boolean).slice(0,3).join(', ')||'author not listed':'author not listed'}. ${Number.isInteger(b.first_publish_year)?'First published '+b.first_publish_year+'. ':''}A science shelf suggestion. Check the edition and contents, then try a chapter before committing. This catalog record is not a review.`,symbol:'▤'}));
  }else if(id==='history'){
    const data=await get('https://www.loc.gov/collections/today-in-history/?fo=json&c=6');
    if(!Array.isArray(data.results))throw Error('Invalid history archive');
    items=data.results.slice(0,6).filter(x=>x&&typeof x.url==='string'&&safeUrl(x.url)&&new URL(x.url).hostname==='www.loc.gov').map(x=>({id:'loc-history-'+String(x.id||x.url).replace(/[^a-zA-Z0-9]/g,'').slice(-65),topic:'History',title:x.title,url:x.url,evergreen:true,kind:'History archive',source:'Library of Congress · Today in History',summary:Array.isArray(x.description)?x.description.filter(d=>typeof d==='string').join(' '):typeof x.description==='string'?x.description:'Explore a historical essay and its archival sources. The archive entry is not breaking news.',symbol:'◷'}));
  }else if(id==='medicine'){
    const cutoff=new Date().toISOString().slice(0,10);
    const query=`(TITLE_ABS:medicine OR TITLE_ABS:clinical) AND SRC:MED AND FIRST_PDATE:[2020-01-01 TO ${cutoff}] sort_date:y`;
    const data=await get('https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=6&resultType=lite&query='+encodeURIComponent(query));
    if(!Array.isArray(data.resultList?.result))throw Error('Invalid medical research');
    items=data.resultList.result.slice(0,6).filter(x=>x&&typeof x.id==='string'&&/^\d+$/.test(x.id)).map(x=>({id:'med-'+x.id,topic:'Medicine',author:x.authorString,title:x.title,url:'https://europepmc.org/article/MED/'+x.id,date:x.firstPublicationDate,live:true,kind:'Research update',source:'Europe PMC · '+(typeof x.journalTitle==='string'?x.journalTitle:'medical journal'),summary:'Newly indexed medical literature. Read the methods, study population, limitations, and any corrections at the original source. One study does not establish clinical practice. For learning, not personal medical advice.',symbol:'✚'}));
  }else if(id==='cisa'){
    let data;try{data=await get('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json')}catch{data=await get('https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json')}
    if(!Array.isArray(data.vulnerabilities))throw Error('Invalid vulnerability catalog');
    items=data.vulnerabilities.filter(x=>x&&typeof x.cveID==='string'&&/^CVE-\d{4}-\d{4,}$/.test(x.cveID)).sort((a,b)=>String(b.dateAdded).localeCompare(String(a.dateAdded))).slice(0,6).map(x=>({id:'cisa-'+x.cveID,topic:'Cybersecurity',title:x.cveID+': '+(typeof x.vulnerabilityName==='string'?x.vulnerabilityName:'Known exploited vulnerability'),url:'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve='+encodeURIComponent(x.cveID),date:x.dateAdded,live:true,kind:'Security advisory',source:'CISA KEV · catalog addition',summary:(typeof x.shortDescription==='string'?x.shortDescription.slice(0,430):'A vulnerability with evidence of exploitation.')+' Defensive action: '+(typeof x.requiredAction==='string'?x.requiredAction.slice(0,180):'Review vendor guidance.'),symbol:'⬡'}));
  }else throw Error('Unknown provider');
  const valid=normalizeList(items);if(items.length&&!valid.length)throw Error('No valid articles');return valid;
}
export class FeedController{
  constructor({load=loadProvider,onChange=()=>{},now=Date.now,cooldown=30000}={}){this.load=load;this.onChange=onChange;this.now=now;this.cooldown=cooldown;this.batches=new Map();this.states=new Map();this.busy=false;this.lastAttempt=null}
  items(){return dedupe([...this.batches.values()].flat().sort((a,b)=>(b.date||0)-(a.date||0)))}
  async refresh(){
    if(this.busy)return 'busy';if(this.lastAttempt!==null&&this.now()-this.lastAttempt<this.cooldown)return 'cooldown';
    this.busy=true;this.lastAttempt=this.now();
    try{this.onChange(this);await Promise.all(PROVIDERS.map(async p=>{try{const items=normalizeList(await this.load(p.id));this.batches.set(p.id,items);this.states.set(p.id,{ok:true,updated:this.now()})}catch{this.states.set(p.id,{ok:false,updated:this.states.get(p.id)?.updated??null})}}));return 'updated'}finally{this.busy=false;this.onChange(this)}
  }
}
