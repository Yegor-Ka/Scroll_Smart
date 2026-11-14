import {TOPICS} from './feed-core.mjs';
import {node} from './ui.mjs';

const TOPIC_DETAILS={
 Science:['⌬','Ask how the world works'],Technology:['⌘','Meet tomorrow’s tools'],Space:['✦','Look a little further'],Nature:['❋','Notice the living world'],Books:['▤','Find your next great read'],History:['◷','Connect past and present'],AI:['⠿','Understand machine minds'],'Computer Science':['⌨','Think in systems'],Medicine:['✚','Explore health research'],Cybersecurity:['◇','Understand digital risks'],Psychology:['◌','Get to know your mind'],Philosophy:['◈','Ask the bigger questions'],Mathematics:['∞','Find the hidden patterns'],Climate:['↻','See the bigger picture'],Culture:['◎','Discover other perspectives']
};

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const dustProgress=scroll=>clamp(scroll/.45);
// Seeded motion depends only on progress, so scrolling backwards retraces every grain.
export function dustPosition(point,progress,width,height){
 const p=clamp(progress),flight=p*p*(3-2*p),seed=Math.sin(point.x*12.9898+point.y*78.233)*43758.5453;
 const n=seed-Math.floor(seed),angle=n*Math.PI*2;
 return {x:point.x+flight*(Math.cos(angle)*width*.42+width*.19)+Math.sin(p*5+n*6)*flight*24,
         y:point.y+flight*(Math.sin(angle)*height*.32-height*.22),alpha:clamp(p*7)*(1-p)**.7};
}

export function createTitleDust({canvas,heading,win,doc}){
 const ctx=canvas?.getContext?.('2d');
 if(!ctx||!heading?.querySelectorAll||!win.getComputedStyle)return {measure(){},draw(){},restore(){}};
 const mask=doc.createElement('canvas'),ink=mask.getContext('2d',{willReadFrequently:true});
 if(!ink)return {measure(){},draw(){},restore(){}};
 let width=0,height=0,points=[],left=0,top=0,dispersing=false;
 const restore=()=>{heading.classList.toggle('title-dispersing',false);dispersing=false;ctx.clearRect(0,0,width,height)};
 function measure(){
  // Temporarily expose source colors for sampling, including during a theme change.
  heading.classList.toggle('title-dispersing',false);
  const bounds=canvas.getBoundingClientRect(),title=heading.getBoundingClientRect();
  width=bounds.width;height=bounds.height;
  if(!width||!height||!title.width||!title.height){restore();return}
  const ratio=Math.min(win.devicePixelRatio||1,2,Math.sqrt(2400000/(width*height)));
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
  left=title.left-bounds.left;top=title.top-bounds.top;
  mask.width=Math.ceil(title.width);mask.height=Math.ceil(title.height);
  for(const line of heading.querySelectorAll('.banner-line')){
   const rect=line.getBoundingClientRect(),style=win.getComputedStyle(line);
   ink.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
   if('letterSpacing' in ink)ink.letterSpacing=style.letterSpacing;
   ink.fillStyle=style.color;ink.textAlign='center';ink.textBaseline='alphabetic';
   const metrics=ink.measureText(line.textContent),size=parseFloat(style.fontSize);
   const ascent=metrics.fontBoundingBoxAscent??size*.9,descent=metrics.fontBoundingBoxDescent??size*.22;
   const baseline=rect.top-title.top+(rect.height-ascent-descent)/2+ascent;
   ink.fillText(line.textContent,rect.left-title.left+rect.width/2,baseline,rect.width);
  }
  const pixels=ink.getImageData(0,0,mask.width,mask.height).data;
  points=[];
  // Bounded sampling; a larger heading uses a wider grid rather than more work per frame.
  const step=Math.max(3,Math.ceil(Math.sqrt(mask.width*mask.height/6500)));
  for(let py=0;py<mask.height;py+=step)for(let px=0;px<mask.width;px+=step){
   const offset=(py*mask.width+px)*4;
   if(pixels[offset+3]>70)points.push({x:left+px,y:top+py,size:Math.min(2.2,step*.44),color:`rgb(${pixels[offset]} ${pixels[offset+1]} ${pixels[offset+2]})`});
  }
  heading.classList.toggle('title-dispersing',dispersing);
 }
 function draw(progress,reduced=false){
  const p=clamp(progress);
  if(reduced||p<.001||!points.length){restore();return}
  heading.classList.toggle('title-dispersing',true);dispersing=true;ctx.clearRect(0,0,width,height);
  ctx.globalAlpha=clamp(1-p*7);ctx.drawImage(mask,left,top);
  if(p<1)for(const point of points){
   const particle=dustPosition(point,p,width,height);ctx.globalAlpha=particle.alpha;ctx.fillStyle=point.color;
   ctx.fillRect(particle.x,particle.y,point.size,point.size);
  }
  ctx.globalAlpha=1;
 }
 return {measure,draw,restore};
}

// Event-driven animation: stops at rest; no external assets or perpetual render loop.
export function createCuriosityScene({canvas,root,win,doc,dust=null}){
 const ctx=canvas.getContext?.('2d');
 if(!ctx)return {setActive(){}};
 const reduced=win.matchMedia('(prefers-reduced-motion: reduce)'),fine=win.matchMedia('(pointer: fine)');
 const desktop=win.matchMedia('(min-width: 651px) and (pointer: fine)');
 let active=false,visible=true,frame=null,width=0,height=0;
 let x=0,y=0,scroll=0,tx=0,ty=0,ts=0;
 const symbols=['✦','∞','⌬','?','◈','↻','▤','✧','◎'];
 const colors=['#bc9fd5','#9bb9dc','#a8c88d','#deb18c','#b1a1db','#88bdb0','#d8bf79'];
 function draw(){
  if(!width||!height)return;
  const dark=doc.documentElement.dataset.theme==='dark';
  ctx.clearRect(0,0,width,height);
  const cx=width*.5+x*24,cy=height*.44+y*20,angle=scroll*.24;
  const radius=Math.max(width*.46,height*.44);
  const glow=ctx.createRadialGradient(cx,cy,10,cx,cy,radius);
  glow.addColorStop(0,dark?'#18281c00':'#e5ebd500');glow.addColorStop(.6,dark?'#67845b18':'#aec89520');glow.addColorStop(1,'#a6ca7500');
  ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  ctx.lineWidth=1;
  for(let ring=0;ring<5;ring++){
   ctx.beginPath();ctx.ellipse(cx,cy,width*(.37+ring*.115),height*(.31+ring*.09),-.32+ring*.19+angle*.15,0,Math.PI*2);ctx.strokeStyle=dark?'#8da47b24':'#5879561c';ctx.stroke();
  }
  for(let i=0;i<100;i++){
   const px=((i*.618034)%1)*width,py=((i*.381966+.17)%1)*height;
   const drift=(i%3+1)*7;
   ctx.beginPath();ctx.arc((px+x*drift+Math.sin(angle+i)*scroll*9+width)%width,(py+y*drift-scroll*(i%4)*13+height*3)%height, .7+(i%3)*.5,0,Math.PI*2);
   ctx.fillStyle=dark?'#abc69765':'#6a815c55';ctx.fill();
  }
  // Satellites orbit the perimeter, leaving the banner's center clear.
  for(let i=0;i<symbols.length;i++){
   const a=i*Math.PI*2/symbols.length-.7+angle;
   const px=cx+Math.cos(a)*width*.46+x*(i%2?12:-12),py=cy+Math.sin(a)*height*.4+y*(i%2?9:-9);
   const size=Math.max(15,Math.min(29,width*.026));
   ctx.save();ctx.translate(px,py);ctx.rotate(Math.sin(a)*.22+x*.06);
   ctx.globalAlpha=dark?.58:.64;ctx.fillStyle=colors[i%colors.length];ctx.beginPath();ctx.roundRect(-size,-size,size*2,size*2,Math.max(7,size*.38));ctx.fill();
   ctx.globalAlpha=.85;ctx.fillStyle='#233b32';ctx.font=`${size*1.16}px Georgia, serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(symbols[i],0,2);ctx.restore();
  }
  // Desktop retains the eased, pinned reveal; mobile follows scrolling immediately.
  dust?.draw(desktop.matches?clamp((scroll-.025)/.53):dustProgress(ts),reduced.matches);
 }
 function tick(){
  frame=null;if(!active||!visible||doc.hidden)return;
  if(reduced.matches){x=0;y=0;scroll=0;draw();return}
  x+=(tx-x)*.13;y+=(ty-y)*.13;scroll+=(ts-scroll)*.13;draw();
  if(Math.abs(tx-x)+Math.abs(ty-y)+Math.abs(ts-scroll)>.0005)frame=win.requestAnimationFrame(tick);
  else {x=tx;y=ty;scroll=ts;draw()}
 }
 function schedule(){if(active&&visible&&!doc.hidden&&frame===null)frame=win.requestAnimationFrame(tick)}
 function cancel(){if(frame!==null){win.cancelAnimationFrame(frame);frame=null}}
 function resize(){
  if(!active)return;
  const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
  if(!width||!height)return;
  const ratio=Math.min(win.devicePixelRatio||1,2,Math.sqrt(2400000/(width*height)));
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);
  dust?.measure();onScroll();schedule();
 }
 function onScroll(){
  if(!active||reduced.matches)return;
  const offset=desktop.matches?-root.getBoundingClientRect().top:win.scrollY;
  ts=clamp(offset/Math.max(win.innerHeight,1),0,5);schedule();
 }
 root.addEventListener('pointermove',e=>{
  if(!active||reduced.matches||!fine.matches||e.pointerType==='touch')return;
  const rect=canvas.getBoundingClientRect();tx=clamp((e.clientX-rect.left)/Math.max(rect.width,1)*2-1,-1,1);ty=clamp((e.clientY-rect.top)/Math.max(rect.height,1)*2-1,-1,1);schedule();
 },{passive:true});
 root.addEventListener('pointerleave',()=>{tx=0;ty=0;schedule()},{passive:true});
 desktop.addEventListener('change',resize);
 win.addEventListener('scroll',onScroll,{passive:true});win.addEventListener('resize',resize,{passive:true});
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();else{onScroll();schedule()}});
 reduced.addEventListener('change',()=>{tx=0;ty=0;ts=0;onScroll();schedule()});
 if(win.IntersectionObserver){const observer=new win.IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)schedule();else cancel()});observer.observe(root)}
 if(win.MutationObserver)new win.MutationObserver(()=>{if(active){dust?.measure();schedule()}}).observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme']});
 doc.fonts?.ready.then(()=>{if(active){dust?.measure();schedule()}});
 return {setActive(value){if(active===value)return;active=value;if(active){resize()}else{cancel();dust?.restore()}}};
}

export function createHome({doc,win,onSelect,onBrowse}){
 const root=doc.querySelector('#home-screen');
 const buttons=TOPICS.slice(1).map(topic=>{
  const [symbol,description]=TOPIC_DETAILS[topic];
  const button=node(doc,'button','home-topic');button.type='button';button.dataset.learnTopic=topic;
  const icon=node(doc,'span','home-topic-icon',symbol);icon.setAttribute('aria-hidden','true');
  const copy=node(doc,'span','home-topic-copy');copy.append(node(doc,'strong','',topic),node(doc,'small','',description));
  button.append(icon,copy,node(doc,'span','home-topic-arrow','↗'));button.onclick=()=>onSelect(topic);return button;
 });
 doc.querySelector('#home-topics').replaceChildren(...buttons);
 doc.querySelector('#home-browse').onclick=onBrowse;
 const dust=createTitleDust({canvas:doc.querySelector('#title-dust'),heading:doc.querySelector('#home-title'),win,doc});
 const scene=createCuriosityScene({canvas:doc.querySelector('#curiosity-canvas'),root,win,doc,dust});
 return {setActive(value){root.hidden=!value;scene.setActive(value)}};
}
