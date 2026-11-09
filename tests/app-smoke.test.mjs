import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as core from '../dist/feed-core.mjs';
import * as ui from '../dist/ui.mjs';
import {Element} from './dom.mjs';
test('app starts with malformed storage, handles refresh failure, and navigates safely',async()=>{
 const elements=new Map();const listeners={};
 const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 let callbacks;
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>{throw Error('offline')}});callbacks=this}}
 const context=vm.createContext({console,Date,URL,Set,Map,Promise,JSON,Number,String,Array,localStorage:{getItem:key=>key==='ss-progress'?'null':'[null,{"topic":"Science\\\" onclick=evil","id":"x"}]',setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn,hidden:false},setInterval(){},...core,...ui,FeedController:Controller});
 let source=await readFile(new URL('../dist/app.js',import.meta.url),'utf8');source=source.replace(/^import .*?;\n/gm,'');
 vm.runInContext(source,context);await new Promise(r=>setImmediate(r));
 assert.equal(callbacks.busy,false);assert.equal(element('#refresh').disabled,false);assert.match(element('#status').textContent,/unavailable/);assert.match(element('#feed').textContent,/black hole/);
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
 const elements=new Map(),listeners={};let largeParsed=false;
 const element=key=>{if(!elements.has(key))elements.set(key,new Element('div'));return elements.get(key)};
 class Controller extends core.FeedController{constructor(options){super({...options,load:async()=>[]})}}
 const oversized=' '.repeat(1024*1024+1);
 const context=vm.createContext({Date,URL,Set,Map,Promise,Number,String,Array,JSON:{...JSON,parse:value=>{if(value.length>1024*1024)largeParsed=true;return JSON.parse(value)},stringify:JSON.stringify},localStorage:{getItem:()=>oversized,setItem(){}},document:{createElement:tag=>new Element(tag),querySelector:element,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn,hidden:false},setInterval(){},...core,...ui,FeedController:Controller});
 const source=(await readFile(new URL('../dist/app.js',import.meta.url),'utf8')).replace(/^import .*?;\n/gm,'');
 vm.runInContext(source,context);await new Promise(r=>setImmediate(r));assert.equal(largeParsed,false);
 const before=element('#feed').textContent;
 listeners.click({target:{closest:selector=>selector==='[data-view]'?{dataset:{view:'__proto__'}}:null}});
 assert.equal(element('#feed').textContent,before);
 listeners.click({target:{closest:selector=>selector==='[data-filter],[data-topic]'?{dataset:{filter:'<script>'}}:null}});
 assert.equal(element('#feed').textContent,before);
});
