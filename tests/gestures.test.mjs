import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bindCardSaving} from '../dist/ui.mjs';
function harness(){
 const listeners={},saved=[];bindCardSaving({addEventListener:(type,fn)=>listeners[type]=fn},id=>saved.push(id));
 const target=(id='one',interactive=false)=>({closest:selector=>selector==='[data-card-id]'?{dataset:{cardId:id}}:interactive?{}:null});
 const emit=(type,time,extra={})=>listeners[type]({target:target(),timeStamp:time,pointerType:'touch',pointerId:1,isPrimary:true,clientX:20,clientY:20,...extra});
 const tap=(time,extra={})=>{emit('pointerdown',time,extra);emit('pointerup',time+40,extra)};
 return {saved,emit,tap,target};
}
test('desktop double-click saves a card while source links and controls are excluded',()=>{
 const h=harness();h.emit('dblclick',100,{pointerType:'mouse'});assert.deepEqual(h.saved,['one']);
 h.emit('dblclick',1000,{pointerType:'mouse',target:h.target('two',true)});assert.deepEqual(h.saved,['one']);
});
test('two quick mobile taps save once, including when a synthetic dblclick follows',()=>{
 const h=harness();h.tap(100);assert.deepEqual(h.saved,[]);h.tap(270);assert.deepEqual(h.saved,['one']);
 h.emit('dblclick',340,{pointerType:'mouse'});assert.deepEqual(h.saved,['one']);
});
test('a scroll or swipe never counts as double-tap',()=>{
 const h=harness();h.tap(100);h.emit('pointerdown',200);h.emit('pointermove',220,{clientY:70});h.emit('pointerup',240,{clientY:70});assert.deepEqual(h.saved,[]);
 h.tap(500);h.emit('scroll',560);h.tap(650);assert.deepEqual(h.saved,[]);
});
test('taps must target the same card and remain close together',()=>{
 const h=harness();h.tap(100);h.tap(250,{target:h.target('two')});assert.deepEqual(h.saved,[]);
 h.tap(800);h.tap(950,{clientX:100});assert.deepEqual(h.saved,[]);
});
test('long presses and slow taps do not save',()=>{
 const h=harness();h.tap(100);h.tap(600);assert.deepEqual(h.saved,[]);
 h.emit('pointerdown',1000);h.emit('pointerup',1500);h.tap(1600);assert.deepEqual(h.saved,[]);
});
test('pointer cancellation, multi-touch, and touching controls reset a pending tap',()=>{
 for(const cancel of ['pointercancel','multitouch','control']){
  const h=harness();h.tap(100);
  if(cancel==='pointercancel')h.emit('pointercancel',180);
  if(cancel==='multitouch')h.emit('pointerdown',180,{pointerId:2,isPrimary:false});
  if(cancel==='control')h.tap(180,{target:h.target('one',true)});
  h.tap(260);assert.deepEqual(h.saved,[],cancel);
 }
});
test('focused cards support the S shortcut without intercepting fields or browser shortcuts',()=>{
 const h=harness();let prevented=0;
 h.emit('keydown',100,{key:'s',preventDefault:()=>prevented++});assert.deepEqual(h.saved,['one']);assert.equal(prevented,1);
 h.emit('keydown',200,{key:'s',ctrlKey:true});h.emit('keydown',300,{key:'s',repeat:true});h.emit('keydown',400,{key:'s',target:h.target('two',true)});assert.equal(h.saved.length,1);
});

test('distinct rapid double-tap gestures each toggle, while synthetic mouse events are ignored',()=>{
 const h=harness();h.tap(100);h.tap(240);h.tap(400);h.tap(540);assert.deepEqual(h.saved,['one','one']);
 h.emit('dblclick',600,{pointerType:'mouse'});assert.equal(h.saved.length,2);
});
