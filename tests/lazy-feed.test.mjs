import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLazyFeed} from '../dist/ui.mjs';
import {Element} from './dom.mjs';
function setup(Observer){const container=new Element('section'),trigger=new Element('button'),states=[];const pager=createLazyFeed({container,trigger,Observer,renderItem:n=>{const el=new Element('article');el.textContent=n;return el},onChange:s=>states.push(s)});return {container,trigger,states,pager}}
test('renders eight at a time and appends without replacing the first cards',()=>{
 const h=setup();h.pager.setItems(Array.from({length:19},(_,i)=>i),{reset:true});assert.equal(h.container.children.length,8);const first=h.container.children[0];
 h.trigger.onclick();assert.equal(h.container.children.length,16);assert.equal(h.container.children[0],first);assert.equal(h.trigger.hidden,false);
 h.trigger.onclick();assert.equal(h.container.children.length,19);assert.equal(h.trigger.hidden,true);h.trigger.onclick();assert.equal(h.container.children.length,19);
});
test('loads when approaching the sentinel and ignores nonintersecting or unrelated entries',()=>{
 let callback;class Observer{constructor(cb,options){callback=cb;assert.equal(options.rootMargin,'300px 0px')}observe(){}unobserve(){}disconnect(){}}
 const h=setup(Observer);h.pager.setItems(Array.from({length:20},(_,i)=>i));callback([{target:h.trigger,isIntersecting:false}]);assert.equal(h.container.children.length,8);
 callback([{target:{},isIntersecting:true}]);assert.equal(h.container.children.length,8);callback([{target:h.trigger,isIntersecting:true}]);assert.equal(h.container.children.length,16);
});
test('retains loaded depth during a save update and resets it for changed filters',()=>{
 const h=setup(),items=Array.from({length:30},(_,i)=>i);h.pager.setItems(items);h.pager.loadMore();h.pager.setItems(items.slice(1));assert.equal(h.container.children.length,16);
 h.pager.setItems(items,{reset:true});assert.equal(h.container.children.length,8);h.pager.setItems([]);assert.equal(h.container.children.length,0);assert.equal(h.trigger.hidden,true);
});
test('late observer notifications after clearing cannot append old feed cards',()=>{
 let callback;class Observer{constructor(cb){callback=cb}observe(){}unobserve(){}disconnect(){}}
 const h=setup(Observer);h.pager.setItems(Array.from({length:20},(_,i)=>i));h.pager.setItems([]);callback([{target:h.trigger,isIntersecting:true}]);assert.equal(h.container.children.length,0);
});
