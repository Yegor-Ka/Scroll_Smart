import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl,escapeHtml,normalizeList,normalizeCard,fetchJson,loadProvider,FeedController,dedupe,PROVIDERS} from '../dist/feed-core.mjs';
const card=(id='one')=>({id,title:'A discovery',summary:'Read this',topic:'Science',source:'Test',url:`https://example.org/${id}`,live:true,date:Date.now()-1000});
test('blocks executable URLs, credentials, HTTP and control characters',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,evil','http://example.org','https://user:secret@example.org','https://example.org/\nx','/relative'])assert.equal(safeUrl(url),'');
 assert.equal(safeUrl('https://example.org/a'),'https://example.org/a');
 assert.equal(escapeHtml('<img src=x onerror="evil">'), '&lt;img src=x onerror=&quot;evil&quot;&gt;');
});
test('validates tampered storage and API records before rendering',()=>{
 assert.deepEqual(normalizeList([null,4,{}, {...card(),topic:'Science" onclick="evil'}, {...card(),url:'javascript:evil'}, {...card(),date:'invalid'}]),[]);
 const good=normalizeCard({...card(),title:'x'.repeat(1000),summary:'x'.repeat(5000),injected:'unwanted'});
 assert.equal(good.title.length,240);assert.equal(good.summary.length,700);assert.equal(good.injected,undefined);
 assert.deepEqual(normalizeList(null),[]);assert.equal(normalizeList(Array(1000).fill(card())).length,200);
});
test('request boundary blocks unexpected hosts, redirects, cookies and large bodies',async()=>{
 await assert.rejects(fetchJson('https://evil.test',()=>assert.fail('must not fetch')));
 const fetcher=async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');return new Response('{"ok":true}',{headers:{'content-type':'application/json'}})};
 assert.deepEqual(await fetchJson('https://api.crossref.org/works',fetcher),{ok:true});
 await assert.rejects(fetchJson('https://api.crossref.org/works',async()=>new Response('oops',{headers:{'content-type':'text/html'}})));
 await assert.rejects(fetchJson('https://api.crossref.org/works',async()=>new Response('x'.repeat(2097153),{headers:{'content-type':'application/json'}})));
 await assert.rejects(fetchJson('https://api.crossref.org/works',async()=>new Response('{bad',{headers:{'content-type':'application/json'}})));
});
test('refresh retains failed provider results, updates others, and enforces cooldown',async()=>{
 let now=100000,fail=false;
 const c=new FeedController({now:()=>now,load:async id=>{if(fail&&id==='space')throw Error('down');return [card(id)]}});
 assert.equal(await c.refresh(),'updated');assert.equal(c.items().length,PROVIDERS.length);
 assert.equal(await c.refresh(),'cooldown');now+=30000;fail=true;
 await c.refresh();assert.equal(c.states.get('space').ok,false);assert.equal(c.items().length,PROVIDERS.length);assert.equal(c.busy,false);
});
test('refresh prevents overlapping requests and clears loading state',async()=>{
 let release;const gate=new Promise(r=>release=r);const c=new FeedController({load:async id=>{await gate;return [card(id)]}});
 const first=c.refresh();assert.equal(await c.refresh(),'busy');release();await first;assert.equal(c.busy,false);
});
test('deduplicates original links ignoring campaign tracking and fragments',()=>{
 const a=card();assert.equal(dedupe([a,{...a,url:a.url+'?utm_source=news#top'}]).length,1);
});
test('all four adapters normalize fixture responses and reject malformed schemas',async()=>{
 const fixtures={hn:[123],space:{results:[{id:2,title:'Space',summary:'News',news_site:'Publisher',published_at:new Date(Date.now()-1000).toISOString(),url:'https://example.org/space'}]},usgs:{features:[{id:'event',properties:{mag:5,title:'Earthquake',time:Date.now()-1000,url:'https://earthquake.usgs.gov/earthquakes/eventpage/event'}}]},crossref:{message:{items:[{DOI:'10.1234/test(a)',title:['Paper'],'container-title':['Journal'],published:{'date-parts':[[2025,1,1]]}}]}}};
 for(const p of PROVIDERS.filter(p=>['hn','space','usgs','crossref'].includes(p.id))){const items=await loadProvider(p.id,async url=>url.includes('/item/')?{id:123,title:'Tech',time:Math.floor(Date.now()/1000)-1,url:'https://example.org/tech'}:fixtures[p.id]);assert.equal(items.length,1,p.id);assert.ok(items[0].url.startsWith('https:'));await assert.rejects(loadProvider(p.id,async()=>({})));}
});

test('new topic adapters preserve attribution, type and publication-date semantics',async()=>{
 const recent=new Date(Date.now()-86400000).toISOString();
 const fixtures={
  books:{works:[{key:'/works/OL123W',title:'A Science Book',authors:[{name:'An Author'}],first_publish_year:1950}]},
  history:{results:[{id:'history-1',title:'A historical essay',url:'https://www.loc.gov/item/history/',description:['An archive description.']}]},
  ai:{hits:[{objectID:'200',title:'AI reporting',url:'https://example.org/ai',created_at:recent}]},
  cs:{hits:[{objectID:'201',title:'Computing research',url:'https://example.org/cs',created_at:recent}]},
  'cyber-news':{hits:[{objectID:'202',title:'A breach report',url:'https://example.org/breach',created_at:recent}]},
  medicine:{resultList:{result:[{id:'123456',title:'A clinical study',journalTitle:'A Journal',firstPublicationDate:recent.slice(0,10)}]}},
  cisa:{vulnerabilities:[{cveID:'CVE-2025-12345',dateAdded:recent.slice(0,10),vulnerabilityName:'A vulnerability',shortDescription:'Description',requiredAction:'Apply vendor mitigations.'}]}
 };
 const expected={books:'Books',history:'History',ai:'AI',cs:'Computer Science','cyber-news':'Cybersecurity',medicine:'Medicine',cisa:'Cybersecurity'};
 for(const [id,fixture] of Object.entries(fixtures)){
  const result=await loadProvider(id,async()=>fixture);assert.equal(result.length,1,id);assert.equal(result[0].topic,expected[id]);assert.ok(result[0].kind);assert.ok(result[0].source);
  if(['books','history'].includes(id)){assert.equal(result[0].live,false);assert.equal(result[0].evergreen,true)}else assert.equal(result[0].live,true);
  await assert.rejects(loadProvider(id,async()=>({})),id);
 }
 const medical=(await loadProvider('medicine',async()=>fixtures.medicine))[0];assert.match(medical.summary,/not personal medical advice/);
});
test('new adapters discard unsafe URLs and malicious IDs; CISA uses only official fallback',async()=>{
 assert.deepEqual(await loadProvider('books',async()=>({works:[{key:'//evil.test/path',title:'Bad'}]})),[]);
 assert.deepEqual(await loadProvider('history',async()=>({results:[{title:'Bad',url:'https://evil.test'}]})),[]);
 await assert.rejects(loadProvider('ai',async()=>({hits:[{objectID:'99',title:'Bad',url:'javascript:evil',created_at:new Date().toISOString()}]})));
 const called=[];await loadProvider('cisa',async url=>{called.push(url);if(url.includes('www.cisa.gov'))throw Error('blocked');return {vulnerabilities:[]}});
 assert.equal(called[1],'https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json');
});
test('security policies include exactly the provider hosts used by the adapters',async()=>{
 const {readFile}=await import('node:fs/promises');
 const files=['../dist/index.html','../dist/_headers','../serve.py'];
 for(const file of files){const content=await readFile(new URL(file,import.meta.url),'utf8');for(const host of ['openlibrary.org','www.loc.gov','hn.algolia.com','www.ebi.ac.uk','www.cisa.gov','raw.githubusercontent.com'])assert.ok(content.includes('https://'+host),`${file}: ${host}`);assert.ok(!content.includes("script-src 'unsafe-inline'"));}
});

test('official CISA mirror accepts JSON served as text, but no arbitrary raw files',async()=>{
 const url='https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json';
 assert.deepEqual(await fetchJson(url,async()=>new Response('{"vulnerabilities":[]}',{headers:{'content-type':'text/plain; charset=utf-8'}})),{vulnerabilities:[]});
 await assert.rejects(fetchJson('https://raw.githubusercontent.com/other/repo/main/data.json',()=>assert.fail('must not fetch')));
});

test('links reject local network destinations, unusual ports and misleading URL syntax',()=>{
 for(const value of ['https://localhost','https://localhost.example.local','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::1]','https://10.0.0.2','https://192.168.1.1','https://service.internal','https://router.lan','https://example.org:8443/a','https://example.org\\@evil.org','https://example.org/\u202eevil'])assert.equal(safeUrl(value),'',value);
 assert.equal(safeUrl('https://www.nasa.gov:443/example'),'https://www.nasa.gov/example');
});
test('API requests reject unexpected ports, paths, fragments and ambiguous MIME types',async()=>{
 for(const url of ['https://api.crossref.org:8443/works','https://api.crossref.org/private','https://api.crossref.org/works#fragment','https://www.loc.gov/private','https://hacker-news.firebaseio.com/v0/users.json'])await assert.rejects(fetchJson(url,()=>assert.fail('must not request this route')));
 for(const mime of ['text/html','application/notjson','application/jsonp','text/plain'])await assert.rejects(fetchJson('https://api.crossref.org/works',async()=>new Response('{}',{headers:{'content-type':mime}})));
 assert.deepEqual(await fetchJson('https://api.crossref.org/works',async()=>new Response('{}',{headers:{'content-type':'Application/JSON; charset=utf-8'}})),{});
});
test('schema rejects oversized IDs and object dates; strips visual spoofing characters',()=>{
 assert.equal(normalizeCard({...card(),id:'x'.repeat(101)}),null);
 assert.equal(normalizeCard({...card(),date:{valueOf:()=>Date.now()}}),null);
 const c=normalizeCard({...card(),title:'Trusted\u202e publisher\u0000'});assert.equal(c.title,'Trusted publisher');
});
