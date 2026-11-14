import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderReader,readerPayload,requestArticle,createArticleReader} from '../dist/reader.mjs';
import {Element,document,descendants,eventRegistry} from './dom.mjs';
const item={id:'med-123',title:'A public research paper',source:'Europe PMC',topic:'Medicine',summary:'An available excerpt.',url:'https://europepmc.org/article/MED/123',author:'An Author',date:Date.UTC(2025,0,1)};
const full={mode:'full',blocks:[{type:'h2',text:'Findings'},{type:'p',text:'A clean full-text paragraph.'}],source:'Europe PMC',author:'A. Scientist',license:'https://creativecommons.org/licenses/by/4.0/'};
test('reader displays source text, author/date/topic, estimate, safe original link and bookmark',()=>{
 const root=new Element('div');renderReader(document,root,{item,payload:readerPayload(full),saved:true});
 assert.match(root.textContent,/A public research paper/);assert.match(root.textContent,/A\. Scientist/);assert.match(root.textContent,/Published:/);assert.match(root.textContent,/Medicine/);assert.match(root.textContent,/1 min read/);assert.match(root.textContent,/Main article text/);
 const nodes=descendants(root),link=nodes.find(n=>n.className==='reader-original');assert.equal(link.href,item.url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.equal(link.referrerPolicy,'no-referrer');
 assert.equal(nodes.find(n=>n.dataset.save).attributes['aria-pressed'],'true');assert.equal(nodes.some(n=>n.tagName==='IFRAME'||n.tagName==='IMG'),false);
});
test('fallback, structured record and book description never claim to be complete articles',()=>{
 for(const mode of ['excerpt','record','description']){
  const root=new Element('div');renderReader(document,root,{item,payload:{mode,blocks:mode==='excerpt'?[]:[{type:'p',text:'Record text'}]}});
  assert.doesNotMatch(root.textContent,/Main article text/);assert.match(root.textContent,/Read on original source/);
  if(mode==='excerpt'){assert.match(root.textContent,/Excerpt only/);assert.match(root.textContent,/An available excerpt/)}
 }
});
test('loading state is distinct, content is text-only, untrusted images/markup are not embedded',()=>{
 const root=new Element('div');renderReader(document,root,{item,loading:true});assert.match(root.textContent,/Loading the approved source/);assert.equal(descendants(root).find(n=>n.className==='reader-body').attributes['aria-busy'],'true');
 renderReader(document,root,{item,payload:readerPayload({...full,image:'https://evil.test/pixel',blocks:[{type:'p',text:'<script>alert(1)</script>'}]})});
 assert.equal(descendants(root).some(n=>['SCRIPT','IMG','SVG'].includes(n.tagName)),false);
 assert.equal(readerPayload({mode:'full',blocks:[{type:'iframe',text:'bad'}]}),null);
});
test('requests use only an ID on the same-origin endpoint and malformed replies fail closed',async()=>{
 let requested;const fetcher=async(url,opts)=>{requested=url;assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');return new Response(JSON.stringify(full),{headers:{'content-type':'application/json'}})};
 assert.equal((await requestArticle('med-123',undefined,fetcher)).mode,'full');assert.equal(requested,'/api/reader?id=med-123');
 await assert.rejects(requestArticle('med-123',undefined,async()=>new Response('<html>',{headers:{'content-type':'text/html'}})));
 await assert.rejects(requestArticle('med-123',undefined,async()=>new Response('x'.repeat(512001),{headers:{'content-type':'application/json'}})));
});
function harness(request=async()=>full){
 const events=eventRegistry(),pop={},timers=new Map(),saved=new Set(),opens=[];let next=0;
 const doc={...document,addEventListener:events.addEventListener,activeElement:null};
 const dialog=new Element('dialog'),content=new Element('div');dialog.addEventListener=(type,fn)=>pop['dialog-'+type]=fn;
 const win={location:{pathname:'/',search:'',hash:''},scrollY:430,scrollTo:value=>win.returned=value,
 addEventListener:(type,fn)=>pop[type]=fn,setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),history:{pushState:(state,title,url)=>{win.location.hash=url},back:()=>{win.location.hash='';pop.popstate()}}};
 const reader=createArticleReader({doc,win,dialog,content,isSaved:id=>saved.has(id),onSave:id=>{saved.has(id)?saved.delete(id):saved.add(id);reader.updateSaved()},onOpen:id=>opens.push(id),request});
 return {reader,events,pop,timers,dialog,content,win,saved,opens};
}
test('reader opens supported text, updates bookmarks, and browser back restores feed position',async()=>{
 const h=harness();await h.reader.open(item);assert.equal(h.dialog.open,true);assert.match(h.content.textContent,/A clean full-text paragraph/);assert.deepEqual(h.opens,['med-123']);
 h.saved.add(item.id);h.reader.updateSaved();assert.equal(descendants(h.content).find(n=>n.dataset.save).attributes['aria-pressed'],'true');
 h.reader.close();assert.equal(h.dialog.open,false);assert.equal(h.win.returned.top,430);assert.equal(h.reader.isOpen,false);
});
test('network failure falls back and late responses after closing cannot reopen the reader',async()=>{
 const bad=harness(async()=>{throw Error('blocked')});await bad.reader.open(item);assert.match(bad.content.textContent,/Excerpt only/);
 let release;const h=harness(()=>new Promise(r=>release=r));const open=h.reader.open(item);h.reader.close();release(full);await open;assert.equal(h.dialog.open,false);assert.equal(h.reader.isOpen,false);
});
test('card click waits for double gestures; explicit quick-save cancellation prevents opening',()=>{
 const h=harness(),target={closest:selector=>selector==='[data-card-id]'?{dataset:{cardId:item.id}}:null};
 h.reader.cardClick(item,{target,detail:1});assert.equal([...h.timers.values()].some(t=>t.delay===500),true);
 h.reader.cancelPending(item.id);assert.equal(h.timers.size,0);h.reader.cardClick(item,{target,detail:1});assert.equal(h.timers.size,0);
});
test('reader has a native modal and responsive full-screen mobile rules without weakening CSP',async()=>{
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),css=await readFile(new URL('../dist/style.css',import.meta.url),'utf8');
 assert.match(html,/<dialog id="reader"[^>]+aria-labelledby="reader-title"/);
 assert.match(css,/@media\(max-width:650px\)\{\.reader-dialog\{width:100vw/);assert.match(css,/min-height:44px/);
 assert.match(html,/require-trusted-types-for 'script'/);assert.doesNotMatch(html,/<iframe/);
});

test('backdrop click closes the reader while inside clicks and text-selection drags do not',async()=>{
 const h=harness();h.dialog.getBoundingClientRect=()=>({left:100,right:700,top:50,bottom:600});
 let focused=false;const opener={isConnected:true,focus(){focused=true}};
 await h.reader.open(item,opener);
 const event=(x,y,target=h.dialog)=>({target,clientX:x,clientY:y,button:0,isPrimary:true});
 h.pop['dialog-pointerdown'](event(150,100));h.pop['dialog-click'](event(150,100));assert.equal(h.reader.isOpen,true);
 h.pop['dialog-pointerdown'](event(150,100,h.content));h.pop['dialog-click'](event(10,100));assert.equal(h.reader.isOpen,true);
 h.pop['dialog-pointerdown'](event(10,100));h.pop['dialog-pointermove'](event(10,130));h.pop['dialog-click'](event(10,130));assert.equal(h.reader.isOpen,true);
 h.pop['dialog-pointerdown'](event(10,100));h.pop['dialog-pointercancel']();h.pop['dialog-click'](event(10,100));assert.equal(h.reader.isOpen,true);
 h.pop['dialog-pointerdown'](event(10,100));h.pop['dialog-click'](event(10,100));assert.equal(h.reader.isOpen,false);assert.equal(h.dialog.open,false);assert.equal(focused,true);assert.equal(h.win.returned.top,430);
});
