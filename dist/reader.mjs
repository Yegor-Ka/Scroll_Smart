import {OPEN_ARTICLES} from './discovery.mjs';
import {safeUrl} from './feed-core.mjs';
import {node} from './ui.mjs';

export function readerPayload(data){
 if(!data||!['full','record','description','excerpt'].includes(data.mode)||!Array.isArray(data.blocks)||data.blocks.length>1000)return null;
 let size=0;
 const blocks=[];
 for(const b of data.blocks){if(!b||!['p','h2'].includes(b.type)||typeof b.text!=='string')return null;size+=b.text.length;if(size>120000)return null;blocks.push({type:b.type,text:b.text})}
 if(data.mode!=='excerpt'&&!blocks.length)return null;
 const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
 return {mode:data.mode,blocks,reason:text(data.reason,500),author:text(data.author,300),date:text(data.date,40),source:text(data.source,140),license:safeUrl(data.license)||'',originalUrl:safeUrl(data.originalUrl)||'',image:null};
}

export function renderReader(doc,container,{item,payload=null,loading=false,saved=false}){
 const paper=node(doc,'article','reader-paper');paper.dataset.cardId=item.id;paper.tabIndex=0;
 paper.setAttribute('aria-label',item.title);paper.setAttribute('aria-describedby','reader-gesture-hint');
 const tools=node(doc,'div','reader-tools'),back=node(doc,'button','reader-back','← Back to feed');back.type='button';back.dataset.readerClose='';
 const save=node(doc,'button','reader-save'+(saved?' saved':''),saved?'✓ Saved':'＋ Save for later');save.type='button';save.dataset.save=item.id;save.setAttribute('aria-pressed',String(saved));
 tools.append(back,save);paper.append(tools);
 paper.append(node(doc,'p','eyebrow',item.topic));const title=node(doc,'h1','',item.title);title.id='reader-title';paper.append(title);
 const date=payload?.date||item.date||((!item.evergreen||item.topic==='Books')&&item.year?String(item.year):null);
 const parsed=typeof date==='string'&&/^\d{4}$/.test(date)?date:date?new Date(date):null;
 const dateText=parsed instanceof Date?(Number.isNaN(parsed.getTime())?'Not provided':parsed.toLocaleDateString()):parsed||'Not provided';
 const author=payload?.author||item.author;
 const meta=node(doc,'div','reader-meta');meta.append(node(doc,'span','',item.source),node(doc,'span','',(item.id.startsWith('cisa-')?'Added to catalog: ':item.id.startsWith('usgs-')?'Event date: ':item.topic==='Books'?'First published: ':'Published: ')+dateText));if(author)meta.append(node(doc,'span','','By '+author));
 paper.append(meta);
 const bodyBlocks=payload?.mode!=='excerpt'&&payload?.blocks.length?payload.blocks:[{type:'p',text:item.summary||'No excerpt is available. Read this story on its original source.'}];
 const words=bodyBlocks.reduce((n,b)=>n+b.text.trim().split(/\s+/).filter(Boolean).length,0);
 const reading=node(doc,'p','reader-reading-time',`${Math.max(1,Math.ceil(words/220))} min read${!payload||payload.mode==='excerpt'?' · excerpt estimate':''}`);paper.append(reading);
 const original=node(doc,'a','reader-original','Read on original source ↗'),href=safeUrl(payload?.originalUrl||item.url);
 if(href){original.href=href;original.target='_blank';original.rel='noopener noreferrer';original.referrerPolicy='no-referrer';original.title=href}
 paper.append(original,node(doc,'p','reader-domain',href?new URL(href).hostname:''));
 const notice=node(doc,'div','reader-notice');notice.setAttribute('role','status');
 notice.textContent=loading?'Loading the approved source…':payload?.mode==='full'?'Main article text · attribution retained':payload?.mode==='record'?'Official source record · not a full news article':payload?.mode==='description'?'Catalog description · not the complete book':'Excerpt only · the full article could not be retrieved';
 paper.append(notice);
 if(payload?.reason&&!loading)paper.append(node(doc,'p','reader-explanation',payload.reason));
 const content=node(doc,'div','reader-body');content.setAttribute('aria-busy',String(loading));
 if(loading){const skeleton=node(doc,'div','reader-skeleton');skeleton.setAttribute('aria-hidden','true');skeleton.append(node(doc,'span'),node(doc,'span'),node(doc,'span'));content.append(skeleton)}
 else {
  const sections=[];
  for(const [index,block] of bodyBlocks.entries()){
   const el=node(doc,block.type,'',block.text);
   if(block.type==='h2'){el.id='reader-section-'+index;sections.push({id:el.id,text:block.text})}
   content.append(el);
  }
  if(sections.length>1){const toc=node(doc,'details','reader-toc');toc.append(node(doc,'summary','','In this article · '+sections.length+' sections'));
   for(const section of sections){const b=node(doc,'button','',section.text);b.type='button';b.onclick=()=>{const target=doc.getElementById(section.id);target?.scrollIntoView({behavior:'smooth',block:'start'});};toc.append(b)}
   paper.append(toc);
  }
 }
 paper.append(content);
 const entry=OPEN_ARTICLES.find(c=>c.id===item.id);
 if(entry&&!loading){const reflection=node(doc,'aside','reader-reflection');reflection.append(node(doc,'p','eyebrow','MAKE IT YOURS'),node(doc,'p','',entry.prompt));paper.append(reflection)}
 if(payload?.source)paper.append(node(doc,'p','reader-attribution','Text provided by '+payload.source+'.'));
 if(payload?.license){const license=node(doc,'a','reader-license','Source license / reuse terms ↗');license.href=payload.license;license.target='_blank';license.rel='noopener noreferrer';paper.append(license)}
 const hint=node(doc,'p','reader-gesture-hint','Double-click or double-tap the reading area to save or unsave. Focus the reading area and press S.');hint.id='reader-gesture-hint';paper.append(hint);
 container.replaceChildren(paper);
 return paper;
}

export async function requestArticle(id,signal,fetcher=fetch){
 // Same-origin ID-only endpoint. Never fetch item.url or publisher pages in the browser.
 const r=await fetcher('/api/reader?id='+encodeURIComponent(id),{signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json'}});
 if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Reader unavailable');
 const limit=512000;
 if(Number(r.headers.get('content-length'))>limit||!r.body)throw Error('Reader response too large');
 const stream=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await stream.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('Reader response too large');chunks.push(value)}}finally{await stream.cancel()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 const raw=new TextDecoder().decode(bytes);
 const payload=readerPayload(JSON.parse(raw));if(!payload)throw Error('Invalid reader response');return payload;
}

export function createArticleReader({doc,win,dialog,content,isSaved,onSave,onOpen,request=requestArticle}){
 let current=null,payload=null,loading=false,controller=null,previous=null,opener=null,pending=null,suppressed=null,sequence=0,closing=false;
 const draw=()=>{
  if(!current)return;
  const active=doc.activeElement,hadFocus=content.contains?.(active);
  const selector=active?.dataset.save?'[data-save]':active?.dataset.readerClose!==undefined?'[data-reader-close]':active?.className==='reader-original'?'.reader-original':null;
  const paper=renderReader(doc,content,{item:current,payload,loading,saved:isSaved(current.id)});
  if(hadFocus)(selector?content.querySelector(selector):paper)?.focus({preventScroll:true});
 };
 const cancelPending=(id=null)=>{if(pending!==null){win.clearTimeout(pending);pending=null}if(id)suppressed={id,until:Date.now()+700}};
 const close=()=>{
  cancelPending();controller?.abort();sequence++;closing=false;current=null;payload=null;loading=false;
  if(dialog.open)dialog.close();
  if(previous){win.scrollTo({top:previous.y,left:0,behavior:'instant'});if(opener?.isConnected)opener.focus({preventScroll:true})}
 };
 function back(){if(closing)return;closing=true;if(current&&win.location.hash.startsWith('#reader/'))win.history.back();else close()}
 async function open(item,element=null){
  cancelPending();if(current?.id===item.id)return;
  controller?.abort();const requestSequence=++sequence;
  if(!current){previous={url:win.location.pathname+win.location.search+win.location.hash,y:win.scrollY};opener=element||doc.activeElement}
  current=item;payload=null;loading=true;draw();
  if(!dialog.open)dialog.showModal();
  content.querySelector?.('[data-reader-close]')?.focus();
  win.history.pushState({scrollSmartReader:true},'', '#reader/'+encodeURIComponent(item.id));onOpen(item.id);
  controller=new AbortController();const thisController=controller;
  const timeout=win.setTimeout(()=>thisController.abort(),22000);
  try{const data=await request(item.id,thisController.signal);if(requestSequence===sequence&&current?.id===item.id){payload=readerPayload(data);loading=false;draw()}}
  catch{if(requestSequence===sequence&&current?.id===item.id){payload={mode:'excerpt',blocks:[],reason:'The reader is temporarily unavailable. Try again shortly or read the original source.'};loading=false;draw()}}
  finally{win.clearTimeout(timeout)}
 }
 doc.addEventListener('click',e=>{
  if(!current)return;
  if(e.target.closest?.('[data-reader-close]'))back();
 });
 let backdropPress=null;
 const outside=e=>{
  if(e.target!==dialog)return false;
  const r=dialog.getBoundingClientRect();
  return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;
 };
 dialog.addEventListener('pointerdown',e=>{
  backdropPress=current&&e.button===0&&e.isPrimary!==false&&outside(e)?{x:e.clientX,y:e.clientY}:null;
 });
 dialog.addEventListener('pointermove',e=>{
  if(backdropPress&&Math.hypot(e.clientX-backdropPress.x,e.clientY-backdropPress.y)>8)backdropPress=null;
 },{passive:true});
 dialog.addEventListener('pointercancel',()=>{backdropPress=null});
 dialog.addEventListener('click',e=>{
  const dismiss=backdropPress&&outside(e);backdropPress=null;
  if(dismiss&&current)back();
 });
 dialog.addEventListener('cancel',e=>{e.preventDefault();back()});
 doc.addEventListener('scroll',()=>cancelPending(),{passive:true,capture:true});
 win.addEventListener('popstate',()=>{if(current)close()});
 doc.addEventListener('keydown',e=>{
  if(!current||e.key?.toLowerCase()!=='s'||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  if(e.target.closest?.('input, textarea, select, [contenteditable]'))return;
  if(e.target.closest?.('[data-card-id]')&&!e.target.closest?.('a, button'))return;
  e.preventDefault();onSave(current.id);
 });
 return {get item(){return current},get isOpen(){return Boolean(current)},open,close:back,cancelPending,updateSaved:draw,
  cardClick(item,e){
   if(current||!item||e.target.closest?.('a, button, input, textarea, select, [contenteditable]'))return;
   if(suppressed?.id===item.id&&Date.now()<suppressed.until)return;
   cancelPending();if(e.detail>1)return;
   const element=e.target.closest?.('[data-card-id]');pending=win.setTimeout(()=>{pending=null;open(item,element)},500);
  }};
}
