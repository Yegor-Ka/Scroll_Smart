import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHome,createCuriosityScene,createTitleDust,dustProgress,dustPosition} from '../dist/home.mjs';
import {TOPICS} from '../dist/feed-core.mjs';
import {Element} from './dom.mjs';

test('home offers every supported topic and keyboard-usable buttons invoke the selection',()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,new Element('div'));return elements.get(id)};
 let selected,browsed=false;
 const home=createHome({doc:{querySelector:el,createElement:tag=>new Element(tag)},win:{},onSelect:value=>selected=value,onBrowse:()=>browsed=true});
 const buttons=el('#home-topics').children;assert.equal(buttons.length,TOPICS.length-1);
 for(const button of buttons){assert.equal(button.tagName,'BUTTON');button.onclick();assert.ok(TOPICS.includes(selected))}
 el('#home-browse').onclick();assert.equal(browsed,true);
 home.setActive(true);assert.equal(el('#home-screen').hidden,false);home.setActive(false);assert.equal(el('#home-screen').hidden,true);
});

test('scene reacts to pointer and scroll, settles, pauses when hidden, and respects reduced motion',()=>{
 const rootEvents={},winEvents={},docEvents={},frames=new Map();let next=0,draws=0,top=0,observer;
 const reduced={matches:false,addEventListener:(type,fn)=>reduced.change=fn},fine={matches:true},desktop={matches:false,addEventListener:(type,fn)=>desktop.change=fn};
 const context=new Proxy({clearRect(){draws++},createRadialGradient(){return {addColorStop(){}}}},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
 const canvas={width:0,height:0,getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:500,height:400})};
 const root={addEventListener:(type,fn)=>rootEvents[type]=fn,getBoundingClientRect:()=>({left:0,top,width:800,height:900})};
 const doc={documentElement:{dataset:{theme:'light'}},hidden:false,addEventListener:(type,fn)=>docEvents[type]=fn};
 const win={get scrollY(){return -top},devicePixelRatio:3,innerHeight:800,matchMedia:q=>q.includes('reduced')?reduced:q.includes('min-width')?desktop:fine,requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(type,fn)=>winEvents[type]=fn,IntersectionObserver:class{constructor(fn){observer=fn}observe(){}}};
 const dustFrames=[];
 const scene=createCuriosityScene({canvas,root,win,doc,dust:{measure(){},restore(){},draw:p=>dustFrames.push(p)}});
 function settle(){let count=0;while(frames.size){assert.ok(++count<200,'animation should stop at rest');const [id,fn]=frames.entries().next().value;frames.delete(id);fn()}return count}
 scene.setActive(true);assert.equal(canvas.width,1000);assert.equal(settle(),1);
 top=-1;winEvents.scroll();const [firstId,firstFrame]=frames.entries().next().value;frames.delete(firstId);firstFrame();assert.equal(dustFrames.at(-1),dustProgress(1/800));assert.ok(dustFrames.at(-1)>0);settle();
 top=0;winEvents.scroll();settle();
 desktop.matches=true;desktop.change();settle();
 top=-1;winEvents.scroll();settle();assert.equal(dustFrames.at(-1),0);
 top=-160;winEvents.scroll();const [desktopId,desktopFrame]=frames.entries().next().value;frames.delete(desktopId);desktopFrame();assert.ok(dustFrames.at(-1)<(.2-.025)/.53);settle();assert.equal(dustFrames.at(-1),(.2-.025)/.53);
 desktop.matches=false;desktop.change();settle();assert.equal(dustFrames.at(-1),dustProgress(.2));
 top=0;winEvents.scroll();settle();
 rootEvents.pointermove({clientX:700,clientY:200,pointerType:'mouse'});assert.ok(settle()>1);
 fine.matches=false;top=-350;winEvents.scroll();assert.ok(settle()>1);
 top=0;winEvents.scroll();assert.ok(settle()>1);
 observer([{isIntersecting:false}]);winEvents.scroll();assert.equal(frames.size,0);
 observer([{isIntersecting:true}]);settle();
 doc.hidden=true;docEvents.visibilitychange();assert.equal(frames.size,0);doc.hidden=false;docEvents.visibilitychange();settle();
 reduced.matches=true;reduced.change();settle();const before=draws;
 fine.matches=true;rootEvents.pointermove({clientX:1,clientY:1,pointerType:'mouse'});top=-400;winEvents.scroll();assert.equal(frames.size,0);assert.equal(draws,before);
 scene.setActive(false);winEvents.resize();assert.equal(frames.size,0);
});

test('dust is reversible, fully disappears, and returns to the accessible HTML heading',()=>{
 const painted=[];let concealed=false;
 const ctx={clearRect(){},setTransform(){},drawImage(){},fillRect:(...args)=>painted.push(args)};
 const canvas={getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:400,height:500})};
 const line={textContent:'Curiosity',getBoundingClientRect:()=>({left:160,top:120,width:80,height:30})};
 const heading={querySelectorAll:()=>[line],getBoundingClientRect:line.getBoundingClientRect,classList:{toggle:(name,value)=>concealed=value}};
 const ink={measureText:()=>({fontBoundingBoxAscent:20,fontBoundingBoxDescent:4}),fillText(){},getImageData:(x,y,w,h)=>{
  const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<data.length;i+=4){data[i]=25;data[i+1]=65;data[i+2]=40;data[i+3]=255}return {data};
 }};
 const mask={getContext:()=>ink};
 const dust=createTitleDust({canvas,heading,doc:{createElement:()=>mask},win:{devicePixelRatio:2,getComputedStyle:()=>({fontStyle:'normal',fontWeight:'500',fontSize:'24px',fontFamily:'serif',color:'#194128',letterSpacing:'0px'})}});
 dust.measure();dust.draw(0);assert.equal(concealed,false);
 dust.draw(.5);assert.equal(concealed,true);assert.ok(painted.length>0);const midway=painted.splice(0);
 dust.draw(.8);assert.notDeepEqual(painted,midway);painted.length=0;
 dust.draw(.5);assert.deepEqual(painted,midway);painted.length=0;
 dust.draw(1);assert.equal(painted.length,0);assert.equal(concealed,true);
 dust.draw(0);assert.equal(concealed,false);
 dust.draw(.5,true);assert.equal(concealed,false);assert.equal(painted.length,0);
 dust.draw(.5);dust.measure();assert.equal(concealed,true);dust.restore();assert.equal(concealed,false);
});

test('dust progress has a readable starting state, reaches disappearance, and clamps overscroll',()=>{
 assert.equal(dustProgress(-1),0);assert.equal(dustProgress(0),0);assert.ok(dustProgress(.001)>0);
 assert.ok(dustProgress(.2)>0&&dustProgress(.2)<1);assert.equal(dustProgress(1),1);
 const point={x:40,y:30};const start=dustPosition(point,0,400,500);
 assert.equal(start.x,40);assert.equal(start.y,30);assert.equal(start.alpha,0);
 assert.deepEqual(dustPosition(point,.5,400,500),dustPosition(point,.5,400,500));
 assert.equal(dustPosition(point,1,400,500).alpha,0);
});
