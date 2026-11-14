import {OPEN_IDS} from './discovery.mjs';
// Feed and stored text is assigned only through textContent, never parsed as HTML.
import {safeUrl} from './feed-core.mjs';
export function node(doc,tag,className='',text=''){
 const el=doc.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;
}
function link(doc,label,url,className=''){
 const el=node(doc,'a',className,label);const href=safeUrl(url);
 if(href){el.href=href;el.target='_blank';el.rel='noopener noreferrer';el.referrerPolicy='no-referrer';el.title=href}
 return el;
}
export function cardNode(doc,c,isSaved){
 const article=node(doc,'article','card'),art=node(doc,'div','art '+c.topic.toLowerCase().replace(/ /g,'-'));
 article.dataset.cardId=c.id;article.tabIndex=0;article.setAttribute('aria-describedby','save-hint');
 const symbol=node(doc,'span','art-symbol',c.symbol||'✦');symbol.setAttribute('aria-hidden','true');
 art.append(symbol,node(doc,'span','art-badge',c.topic),node(doc,'span','quick-save-hint',isSaved?'✓ Saved':'↗ Explore an idea'));
 if(isSaved){article.className+=' is-saved';art.append(node(doc,'span','saved-marker','✓ Saved for later'))}
 const body=node(doc,'div','card-body'),meta=node(doc,'div','card-meta');
 const date=c.live?new Date(c.date).toLocaleDateString():c.evergreen?'Evergreen':String(c.year||'');
 meta.append(node(doc,'span','',c.source),node(doc,'span','','· '+date));body.append(meta);
 body.append(node(doc,'span','access-label',OPEN_IDS.has(c.id)||c.id==='coral'?'◇ Open article · read in app':c.id.startsWith('book-OL')?'Catalog description':c.id.startsWith('usgs-')||c.id.startsWith('cisa-')?'Official record':c.id.startsWith('med-')?'Full text when licensed':'Summary + source link'));
 if(c.kind)body.append(node(doc,'div','content-kind',c.kind));
 body.append(node(doc,'h3','',c.title),node(doc,'p','',c.summary));
 const destination=safeUrl(c.url);if(destination)body.append(node(doc,'p','destination','External site: '+new URL(destination).hostname));
 const bottom=node(doc,'div','card-bottom'),read=node(doc,'button','read-link','Read here →');read.type='button';read.dataset.open=c.id;read.setAttribute('aria-haspopup','dialog');
 const save=node(doc,'button','save'+(isSaved?' saved':''),isSaved?'✓':'＋');save.type='button';save.dataset.save=c.id;
 save.title=isSaved?'Remove from saved stories':'Save for later';
 save.setAttribute('aria-label',(isSaved?'Unsave ':'Save ')+c.title);save.setAttribute('aria-pressed',String(isSaved));
 bottom.append(read,save);body.append(bottom);article.append(art,body);return article;
}
export function sourceNodes(doc,providers,states){
 const nodes=providers.map(p=>{
  const state=states.get(p.id),card=node(doc,'div','source-card');
  card.append(node(doc,'h3','',p.name+' · No key required'),node(doc,'p','',p.description));
  card.append(node(doc,'p','',state?(state.ok?'Last fetch succeeded':'Unavailable — previous results retained')+(state.updated?' · Last successful check: '+new Date(state.updated).toLocaleString():''):'Not checked yet'));
  card.append(node(doc,'p','source-caveat','Source identity and link format are separate from article accuracy or malware screening. External pages may change.'));card.append(link(doc,'Provider documentation ↗',p.docs));return card;
 });
 for(const [name,url,description] of [
 ['Wikipedia · open knowledge','https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use','Curated articles across psychology, philosophy, science, mathematics, history, and culture. CC BY-SA 4.0 text with contributor and revision attribution.'],
 ['Wikivoyage · explore the world','https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft','Curated astronomy, archaeology, and rail guides. CC BY-SA 4.0 text; community-edited information may change.']]){
 const card=node(doc,'div','source-card');card.append(node(doc,'h3','',name),node(doc,'p','',description),node(doc,'p','','Loaded when opened through the local reader, cached for 10 minutes. Images and original formatting are omitted.'),link(doc,'License and reuse policy ↗',url));nodes.push(card);
 }
 const info=node(doc,'div','source-card');info.append(node(doc,'h3','','How updates work'),node(doc,'p','','Refresh on opening, every 15 minutes while visible, and on returning after 15 minutes. Use Refresh feed for an immediate check (at most once every 30 seconds). Failed providers retain previous results, which may be out of date. No updates run while closed. Your browser contacts providers directly; they receive your IP address. Saved stories stay on this device.'));nodes.push(info);return nodes;
}

// Delegated gestures survive feed redraws. No timers or synthetic clicks required.
export function bindCardSaving(root,onSave){
 let active=null,lastTap=null,lastTouchHandled=null;
 const cardFor=e=>{
  if(e.target?.closest?.('a, button, input, textarea, select, summary, [contenteditable]'))return null;
  const card=e.target?.closest?.('[data-card-id]');return card?.dataset.cardId?card:null;
 };
 const reset=()=>{active=null;lastTap=null};
 const trigger=(card,time,touch=false)=>{
  if(!touch&&lastTouchHandled?.id===card.dataset.cardId&&time-lastTouchHandled.time<700)return;
  if(touch)lastTouchHandled={id:card.dataset.cardId,time};
  onSave(card.dataset.cardId);
 };
 root.addEventListener('dblclick',e=>{
  if(e.pointerType&&e.pointerType!=='mouse')return;
  const card=cardFor(e);if(card)trigger(card,e.timeStamp);
 });
 root.addEventListener('pointerdown',e=>{
  if(!['touch','pen'].includes(e.pointerType))return;
  const card=cardFor(e);
  if(!card||e.isPrimary===false){reset();return}
  active={id:e.pointerId,card,time:e.timeStamp,x:e.clientX,y:e.clientY};
 },{passive:true});
 root.addEventListener('pointermove',e=>{
  if(active?.id===e.pointerId&&Math.hypot(e.clientX-active.x,e.clientY-active.y)>12)reset();
 },{passive:true});
 root.addEventListener('pointerup',e=>{
  if(!active||active.id!==e.pointerId)return;
  const start=active,card=cardFor(e);active=null;
  if(!card||card.dataset.cardId!==start.card.dataset.cardId||e.timeStamp-start.time>350||Math.hypot(e.clientX-start.x,e.clientY-start.y)>12){lastTap=null;return}
  if(lastTap?.id===card.dataset.cardId&&e.timeStamp-lastTap.time<=320&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<=32){lastTap=null;trigger(card,e.timeStamp,true)}
  else lastTap={id:card.dataset.cardId,time:e.timeStamp,x:e.clientX,y:e.clientY};
 },{passive:true});
 root.addEventListener('pointercancel',reset,{passive:true});
 root.addEventListener('scroll',reset,{passive:true,capture:true});
 root.addEventListener('keydown',e=>{
  if(e.key?.toLowerCase()!=='s'||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const card=cardFor(e);if(card){e.preventDefault();onSave(card.dataset.cardId)}
 });
}

// Only construct visible batches; appended batches leave existing card nodes intact.
export function createLazyFeed({container,trigger,renderItem,batchSize=8,onChange=()=>{},Observer=globalThis.IntersectionObserver}){
 let items=[],visible=0;
 const observer=typeof Observer==='function'?new Observer(entries=>{
  if(entries.some(e=>e.target===trigger&&e.isIntersecting))loadMore();
 },{rootMargin:'300px 0px'}):null;
 function notify(){
  trigger.hidden=visible>=items.length;
  observer?.unobserve(trigger);
  if(!trigger.hidden)observer?.observe(trigger);
  onChange({visible,total:items.length,hasMore:visible<items.length});
 }
 function loadMore(){
  if(visible>=items.length)return;
  const next=Math.min(visible+batchSize,items.length);
  container.append(...items.slice(visible,next).map(renderItem));visible=next;notify();
 }
 function setItems(next,{reset=false}={}){
  items=next;visible=Math.min(reset||visible===0?batchSize:visible,items.length);
  container.replaceChildren(...items.slice(0,visible).map(renderItem));notify();
 }
 trigger.onclick=loadMore;
 return {setItems,loadMore,disconnect:()=>observer?.disconnect()};
}
