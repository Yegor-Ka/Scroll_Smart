import * as homeUI from '../dist/home.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/feed-core.mjs';
import * as ui from '../dist/ui.mjs';
import {Element,eventRegistry,browserWindow} from './dom.mjs';
import * as discovery from '../dist/discovery.mjs';
import * as readerUI from '../dist/reader.mjs';
test('app starts with malformed storage, handles refresh failure, and navigates safely',async()=>{
 const elements=new Map();const events=eventRegistry(),listeners=events.registry;
 const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 let callbacks;
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>{throw Error('offline')}});callbacks=this}}
 const context=vm.createContext({console,Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:key=>key==='ss-progress'?'null':'[null,{"topic":"Science\\\" onclick=evil","id":"x"}]',setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,window:browserWindow(),FeedController:Controller});
 let source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');source=source.replace(/^import .*?;\n/gm,'');
 vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
 listeners.click({target:{closest:s=>s==='[data-view]'?{dataset:{view:'feed'}}:null}});
 assert.equal(callbacks.busy,false);assert.equal(element('#refresh').disabled,false);assert.match(element('#status').textContent,/unavailable/);assert.match(element('#feed').textContent,/Remember more/);
 listeners.click({target:{closest:selector=>selector==='[data-view]'?{dataset:{view:'sources'}}:null}});
 assert.match(element('#feed').textContent,/Crossref/);assert.match(element('#feed').textContent,/USGS/);
 for(const topic of ['Books','History','AI','Computer Science','Medicine','Cybersecurity']){
  listeners.click({target:{closest:selector=>selector==='[data-view]'?{dataset:{view:'feed'}}:null}});
  listeners.click({target:{closest:selector=>selector==='[data-filter],[data-topic]'?{dataset:{filter:topic}}:null}});
  assert.ok(element('#topic-context').textContent.length>0,topic);
  assert.match(element('#topics').textContent,new RegExp(topic));
  if(topic==='Books')assert.match(element('#feed').textContent,/Reading note/);
  if(topic==='History')assert.match(element('#feed').textContent,/Apollo 11/);
 }

});

test('oversized stored JSON is rejected before parsing and invalid UI actions are ignored',async()=>{
 const elements=new Map(),events=eventRegistry(),listeners=events.registry;let largeParsed=false;
 const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
 const oversized=' '.repeat(1024*1024+1);
 const context=vm.createContext({Date,URL,Set,Map,Promise,Number,String,Array,JSON:{...JSON,parse:value=>{if(value.length>1024*1024)largeParsed=true;return JSON.parse(value)},stringify:JSON.stringify},localStorage:{getItem:()=>oversized,setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,window:browserWindow(),FeedController:Controller});
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,'');
 vm.runInContext(source,context);await new Promise(r=>setImmediate(r));assert.equal(largeParsed,false);
 const before=element('#feed').textContent;
 listeners.click({target:{closest:selector=>selector==='[data-view]'?{dataset:{view:'__proto__'}}:null}});
 assert.equal(element('#feed').textContent,before);
 listeners.click({target:{closest:selector=>selector==='[data-filter],[data-topic]'?{dataset:{filter:'<script>'}}:null}});
 assert.equal(element('#feed').textContent,before);
});

test('quick saving toggles, persists across reloads, and supports bookmark removal',async()=>{
 const storage=new Map();
 async function launch(){
  const elements=new Map(),events=eventRegistry(),listeners=events.registry;const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
  class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
  const context=vm.createContext({Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,window:browserWindow(),FeedController:Controller});
  const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,'');vm.runInContext(source,context);await new Promise(r=>setImmediate(r));return {element,listeners};
 }
 const first=await launch();const target={closest:selector=>selector==='[data-card-id]'?{dataset:{cardId:'blackhole'}}:null};
 first.listeners.dblclick({target,timeStamp:100,pointerType:'mouse'});
 assert.equal(JSON.parse(storage.get('ss-saved')).length,1);assert.equal(first.element('#save-count').textContent,'1');assert.match(first.element('#save-feedback-message').textContent,/Saved for later/);
 first.listeners.dblclick({target,timeStamp:1000,pointerType:'mouse'});assert.equal(JSON.parse(storage.get('ss-saved')).length,0);assert.match(first.element('#save-feedback-message').textContent,/Removed/);
 first.listeners.dblclick({target,timeStamp:2000,pointerType:'mouse'});assert.equal(JSON.parse(storage.get('ss-saved')).length,1);
 const second=await launch();second.listeners.click({target:{closest:s=>s==='[data-view]'?{dataset:{view:'saved'}}:null}});
 assert.match(second.element('#feed').textContent,/black hole/);assert.equal(second.element('#save-count').textContent,'1');
 second.listeners.click({target:{closest:s=>s==='[data-save]'?{dataset:{save:'blackhole'}}:null}});
 assert.equal(JSON.parse(storage.get('ss-saved')).length,0);assert.equal(second.element('#save-count').textContent,'0');
});

test('Read here opens the reader, counts the daily idea once, and bookmark toggles use shared storage',async()=>{
 const elements=new Map(),events=eventRegistry(),listeners=events.registry,storage=new Map();const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
 const win=browserWindow();win.scrollY=430;
 const createReader=options=>readerUI.createArticleReader({...options,request:async()=>({mode:'full',source:'Test source',blocks:[{type:'p',text:'An approved article body.'}]})});
 const context=vm.createContext({Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,createArticleReader:createReader,window:win,FeedController:Controller});
 vm.runInContext((await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,''),context);await new Promise(r=>setImmediate(r));
 const open={target:{closest:s=>s==='[data-open]'?{dataset:{open:'blackhole'}}:null}};listeners.click(open);await new Promise(r=>setImmediate(r));
 assert.equal(element('#reader').open,true);assert.match(element('#reader-content').textContent,/approved article body/);assert.equal(element('#read-count').textContent,'1');
 listeners.click({target:{closest:s=>s==='[data-save]'?{dataset:{save:'blackhole'}}:null}});assert.equal(JSON.parse(storage.get('ss-saved')).length,1);assert.match(element('#reader-content').textContent,/✓ Saved/);
 listeners.click(open);await new Promise(r=>setImmediate(r));assert.equal(element('#read-count').textContent,'1');
});

test('discovery controls search, select a trail, reset, and clear when navigating',async()=>{
 const elements=new Map(),events=eventRegistry();const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
 const context=vm.createContext({Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,window:browserWindow(),FeedController:Controller});
 vm.runInContext((await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,''),context);await new Promise(r=>setImmediate(r));
 element('#home-browse').onclick();
 element('#search').oninput({target:{value:'memory'}});
 assert.match(element('#feed').textContent,/Remember more/);assert.doesNotMatch(element('#feed').textContent,/Frankenstein/);
 element('#open-only').onclick();assert.equal(element('#open-only').attributes['aria-pressed'],'true');
 element('#reset-discovery').onclick();assert.equal(element('#search').value,'');
 events.registry.click({target:{closest:s=>s==='[data-trail]'?{dataset:{trail:'planet'}}:null}});
 assert.match(element('#filter-note').textContent,/Think like a planet/);assert.match(element('#feed-count').textContent,/3 of 3/);
 events.registry.click({target:{closest:s=>s==='[data-view]'?{dataset:{view:'saved'}}:null}});
 assert.equal(element('#library-note').hidden,false);assert.equal(element('#filter-note').textContent,'');assert.match(element('#feed').textContent,/Your next discovery/);
});

test('welcome is the default screen and topic selection opens the matching feed',async()=>{
 const elements=new Map(),events=eventRegistry();const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
 const context=vm.createContext({Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:events.addEventListener,hidden:false},setInterval(){},...core,...ui,...readerUI,...discovery,...homeUI,window:browserWindow(),FeedController:Controller});
 vm.runInContext((await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,''),context);await new Promise(r=>setImmediate(r));
 assert.equal(element('#home-screen').hidden,false);assert.equal(element('.layout').hidden,true);
 element('#home-topics').children.find(b=>b.dataset.learnTopic==='Psychology').onclick();
 assert.equal(element('#home-screen').hidden,true);assert.equal(element('.layout').hidden,false);assert.match(element('#feed').textContent,/Remember more/);assert.doesNotMatch(element('#feed').textContent,/Frankenstein/);
 events.registry.click({target:{closest:s=>s==='[data-view]'?{dataset:{view:'home'}}:null}});
 assert.equal(element('#home-screen').hidden,false);assert.equal(element('.layout').hidden,true);
 element('#home-browse').onclick();assert.equal(element('.layout').hidden,false);assert.match(element('#feed').textContent,/Frankenstein/);
});
