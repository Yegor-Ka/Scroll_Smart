import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {OPEN_ARTICLES,TRAILS,selectDiscoveries,interleaveDiscoveries} from '../dist/discovery.mjs';
import {normalizeList} from '../dist/feed-core.mjs';
import {Element,document,descendants} from './dom.mjs';
import {renderReader} from '../dist/reader.mjs';

test('browser catalog matches the server allowlist and survives saved-record validation',async()=>{
 const server=JSON.parse(await readFile(new URL('../open_articles.json',import.meta.url),'utf8'));
 assert.deepEqual(OPEN_ARTICLES,server);assert.equal(new Set(server.map(c=>c.id)).size,16);
 assert.equal(normalizeList(OPEN_ARTICLES).length,16);
 assert.ok(normalizeList(OPEN_ARTICLES).every(c=>c.kind==='Open article'));
});
test('search, trails and open-article filters compose without evaluating user input',()=>{
 assert.equal(selectDiscoveries(OPEN_ARTICLES,{query:'memory'})[0].id,'wiki-spacing');
 assert.equal(selectDiscoveries(OPEN_ARTICLES,{query:'spacing memory'})[0].id,'wiki-spacing');
 assert.equal(selectDiscoveries(OPEN_ARTICLES,{query:'<script>.*'}).length,0);
 assert.equal(selectDiscoveries(OPEN_ARTICLES,{trail:'mind'}).length,3);
 assert.equal(selectDiscoveries(OPEN_ARTICLES,{trail:'mind',topic:'Philosophy'})[0].id,'wiki-razor');
 assert.equal(selectDiscoveries([...OPEN_ARTICLES,{id:'hn-1',title:'link'}],{openOnly:true}).length,16);
 for(const t of TRAILS)assert.ok(t.ids.every(id=>OPEN_ARTICLES.some(c=>c.id===id)));
 assert.deepEqual(interleaveDiscoveries([1,2],[3,4,5]),[1,3,2,4,5]);
});
test('theme follows the system, persists overrides, and tolerates blocked storage',async()=>{
 const source=await readFile(new URL('../dist/theme.js',import.meta.url),'utf8');
 for(const blocked of [false,true]){
  const button=new Element('button'),root=new Element('html'),events={},media={matches:true,addEventListener:(n,f)=>events.system=f};let stored='garbage';
  vm.runInNewContext(source,{window:{matchMedia:()=>media},localStorage:{getItem:()=>{if(blocked)throw Error();return stored},setItem:(k,v)=>{if(blocked)throw Error();stored=v}},document:{documentElement:root,querySelector:()=>button,addEventListener:(n,f)=>events[n]=f}});
  assert.equal(root.dataset.theme,'dark');
  button.addEventListener=(n,f)=>events.toggle=f;events.DOMContentLoaded();
  events.toggle();assert.equal(root.dataset.theme,'light');if(!blocked)assert.equal(stored,'light');
  media.matches=true;events.system();assert.equal(root.dataset.theme,'light');
  events.toggle();assert.equal(root.dataset.theme,'dark');events.toggle();media.matches=false;events.system();assert.equal(root.dataset.theme,'light');
 }
});
test('article navigation and reflection keep source content as text',()=>{
 const root=new Element('div');let scrolled=false;
 const doc={...document,getElementById:id=>({scrollIntoView(){scrolled=id==='reader-section-0'}})};
 renderReader(doc,root,{item:OPEN_ARTICLES[0],payload:{mode:'full',blocks:[{type:'h2',text:'<img src=x onerror=evil()>'},{type:'p',text:'Body'},{type:'h2',text:'More'}]}});
 const nodes=descendants(root);assert.ok(nodes.some(n=>n.className==='reader-reflection'));
 const toc=nodes.find(n=>n.className==='reader-toc');assert.ok(toc);toc.children[1].onclick();assert.equal(scrolled,true);
 assert.equal(nodes.some(n=>n.tagName==='IMG'),false);
});
