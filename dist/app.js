import {createHome} from './home.mjs';
import {OPEN_ARTICLES, OPEN_IDS, TRAILS, selectDiscoveries, interleaveDiscoveries} from './discovery.mjs';
import {TOPICS, PROVIDERS, normalizeList, FeedController, dedupe} from './feed-core.mjs';
import {node, cardNode, sourceNodes, bindCardSaving, createLazyFeed} from './ui.mjs';
import {createArticleReader} from './reader.mjs';
const curated=[...OPEN_ARTICLES,
{id:'book-frankenstein',topic:'Books',evergreen:true,kind:'Reading note',title:'Frankenstein: ambition is only half the story',summary:'Scroll Smart mini-review: the compelling question is what a creator owes a creation. The novel rewards readers interested in responsibility, rejection, and the social cost of invention. Best for: science ethics and reflective fiction. The nested narration and older prose take patience. Try one chapter, then ask whose account you trust. This is an original editorial note, not a community rating.',source:'Scroll Smart reading note · Mary Shelley',url:'https://www.gutenberg.org/ebooks/84',symbol:'▤'},
{id:'book-pride',topic:'Books',evergreen:true,kind:'Reading note',title:'Pride and Prejudice: practice changing your mind',summary:'Scroll Smart mini-review: Austen makes social perception entertaining and unreliable. The sharp dialogue invites you to notice how confidence, money, and first impressions shape judgment. Best for: readers who enjoy character and social observation. The slow build may not suit an action-first mood. Read a chapter and track one assumption a character makes.',source:'Scroll Smart reading note · Jane Austen',url:'https://www.gutenberg.org/ebooks/1342',symbol:'▤'},
{id:'book-holmes',topic:'Books',evergreen:true,kind:'Reading note',title:'Sherlock Holmes: swap one scrolling session for a mystery',summary:'Scroll Smart mini-review: a short-case format makes this collection an approachable alternative to a long novel. Best for: readers who enjoy clues, inference, and compact stories. Treat Holmes’s certainty as fiction, not a model of scientific proof; some period attitudes also deserve a critical eye. Start with one story and separate observed evidence from the detective’s interpretation.',source:'Scroll Smart reading note · Arthur Conan Doyle',url:'https://www.gutenberg.org/ebooks/1661',symbol:'▤'},
{id:'history-apollo',topic:'History',evergreen:true,kind:'Historical fact',title:'1969: a Moon landing planned minute by minute',summary:'Apollo 11 landed on the Moon on July 20, 1969. The National Archives preserves its flight plan: a detailed schedule for the astronauts and Mission Control. Looking at the original document reveals the coordination behind the famous moment.',source:'U.S. National Archives · Apollo 11 flight plan',url:'https://www.archives.gov/exhibits/featured-documents/apollo-11-flight-plan',symbol:'◷'},
{id:'history-web',topic:'History',evergreen:true,kind:'Historical fact',title:'1989: the Web began as a way to share information',summary:'Tim Berners-Lee proposed the World Wide Web at CERN in 1989. CERN made the Web software available in the public domain in 1993. The Web is one application built on the Internet, rather than another name for the entire network.',source:'CERN · history of the Web',url:'https://home.cern/science/computing/the-birth-of-the-web/',symbol:'◷'},
{id:'blackhole',topic:'Space',year:2019,title:'The first time we saw a black hole',summary:'A planet-sized network of telescopes turned an invisible object into an image. The breakthrough revealed the shadow of the black hole at the heart of galaxy M87.',source:'Event Horizon Telescope',url:'https://eventhorizontelescope.org/press-release-april-10-2019-astronomers-capture-first-image-black-hole',symbol:'◎'},
{id:'crispr',topic:'Science',year:2020,title:'The tiny molecular scissors that changed biology',summary:'CRISPR gave researchers a precise way to edit DNA. Understanding how it works helps explain one of the most consequential scientific tools of the decade.',source:'Nobel Prize',url:'https://www.nobelprize.org/prizes/chemistry/2020/summary/',symbol:'⌬'},
{id:'transformer',topic:'AI',year:2017,title:'Eight researchers. One paper. A new era of AI.',summary:'“Attention Is All You Need” introduced the Transformer architecture. The core idea lets a model weigh relationships across a sequence, laying foundations for modern language models.',source:'Original research · arXiv',url:'https://arxiv.org/abs/1706.03762',symbol:'✳'},
{id:'webb',topic:'Space',year:2022,title:'A deeper look into our cosmic past',summary:'The first full-color images from the James Webb Space Telescope opened a new window on the universe, from stellar nurseries to the atmospheres of distant planets.',source:'NASA',url:'https://science.nasa.gov/mission/webb/webbs-first-images/',symbol:'✦'},
{id:'waves',topic:'Science',year:2016,title:'Listening to ripples in the fabric of space',summary:'The first direct detection of gravitational waves came from two merging black holes. It gave astronomy a completely new way to observe the universe.',source:'LIGO',url:'https://www.ligo.caltech.edu/page/what-are-gw',symbol:'≋'},
{id:'coral',topic:'Nature',year:2016,title:'Why a coral reef is an entire living city',summary:'Corals are animals with tiny partners: algae that help supply their energy. Explore the relationship that supports some of the most diverse ecosystems on Earth.',source:'NOAA · evergreen explainer',url:'https://oceanservice.noaa.gov/facts/coral.html',symbol:'❋',evergreen:true},
{id:'alphago',topic:'AI',year:2016,title:'The move that made the world rethink AI',summary:'AlphaGo’s match against Lee Sedol showed how machine learning could discover strategies beyond familiar human patterns. Revisit a turning point in computing.',source:'Google DeepMind',url:'https://deepmind.google/research/alphago/',symbol:'⠿'},
{id:'rosetta',topic:'Space',year:2016,title:'What a comet can tell us about our origins',summary:'The Rosetta mission followed a comet around the Sun and investigated the material left over from the formation of our solar system.',source:'European Space Agency',url:'https://www.esa.int/missions/about-us/directorates/science/rosetta/rosetta',symbol:'☄'}];
const $=s=>document.querySelector(s);const topics=TOPICS;let view='home',topic='All topics',live=[],query='',openOnly=false,trail='';
function getLocal(k,fallback){try{const raw=localStorage.getItem(k);return typeof raw==='string'&&raw.length<=1024*1024?JSON.parse(raw)??fallback:fallback}catch{return fallback}}function persist(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}
let reader=null,home=null;
let saved=normalizeList(getLocal('ss-saved',[]));
const day=()=>new Date().toLocaleDateString('en-CA');
let progress=getLocal('ss-progress',{});
function resetDay(){if(!progress||progress.date!==day()||!Array.isArray(progress.ids))progress={date:day(),ids:[]};progress.ids=[...new Set(progress.ids.slice(0,200).filter(v=>typeof v==='string'&&v.length<=100))].slice(0,200)}
resetDay();
$('#date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
function stats(){resetDay();$('#save-count').textContent=saved.length;$('#read-count').textContent=progress.ids.length;$('#progress').value=Math.min(5,progress.ids.length);$('#goal-note').textContent=progress.ids.length>=5?'Daily goal reached. Let an idea sink in — you’ve earned a pause.':'Five ideas. A fresh perspective. That’s a good day of scrolling.'}
function announce(message){$('#save-feedback-message').textContent=message;$('#save-feedback').hidden=false;}
function saveStory(id){
 const item=[...live,...curated,...saved,...(reader?.item?[reader.item]:[])].find(c=>c.id===id);if(!item)return;
 const exists=saved.some(c=>c.id===id);
 if(!exists&&saved.length>=200){announce('Your collection is full. Remove a saved story to make room.');return}
 saved=exists?saved.filter(c=>c.id!==id):[...saved,item];
 const restoreCardFocus=!reader?.isOpen&&document.activeElement?.dataset.cardId===id;
 const durable=persist('ss-saved',saved);render();reader?.updateSaved();
 if(restoreCardFocus){const replacement=[...document.querySelectorAll('[data-card-id]')].find(el=>el.dataset.cardId===id);replacement?.focus({preventScroll:true})}
 announce(durable?(exists?'Removed from Saved for later.':'✓ Saved for later. Find it in your collection.'):'Saved collection updated for this session. Browser storage is unavailable.');
}
let feedKey='';
const lazyFeed=createLazyFeed({container:$('#feed'),trigger:$('#load-more'),renderItem:c=>cardNode(document,c,saved.some(x=>x.id===c.id)),onChange:({visible,total,hasMore})=>{
 $('#feed-count').textContent=total?`${visible} of ${total} stories`:'';
 $('#feed-end').hidden=hasMore||view==='sources';
}});
function render(){stats();
const atHome=view==='home';home?.setActive(atHome);$('.layout').hidden=atHome;
$('.skip-link').href=atHome?'#home-title':'#discover';
document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});
if(atHome)return;

$('#discovery-controls').hidden=view==='sources';$('#trail-section').hidden=view!=='feed';$('#library-note').hidden=view!=='saved';
$('#open-only').setAttribute('aria-pressed',String(openOnly));
$('#filter-note').textContent=trail?'Trail: '+TRAILS.find(t=>t.id===trail)?.title:openOnly?'Openly licensed articles · loaded on demand. Availability depends on the source.':'';
$('#trails').replaceChildren(...TRAILS.map(t=>{const b=node(document,'button','trail trail-'+t.id);b.type='button';b.dataset.trail=t.id;b.setAttribute('aria-pressed',String(trail===t.id));b.append(node(document,'span','trail-symbol',t.symbol),node(document,'strong','',t.title),node(document,'span','',t.description),node(document,'small','',t.ids.filter(id=>progress.ids.includes(id)).length+' / 3 explored →'));return b}));
$('#feed-pagination').hidden=view==='sources';document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false')});$('#topics').replaceChildren(...topics.map(t=>{const button=node(document,'button',topic===t?'active':'',(t==='All topics'?'✳ ':'')+t);button.type='button';button.dataset.filter=t;button.setAttribute('aria-pressed',String(topic===t));return button}));$('#topics').hidden=view==='sources';$('#topic-context').hidden=view==='sources';$('#refresh').hidden=view!=='feed';$('#feed-title').textContent=({feed:'A world of things to know',decade:'The ideas that shaped a decade',saved:'Your collection of discoveries',sources:'Good information starts at the source'})[view];$('#feed-description').textContent=view==='decade'?'Selected milestones since 2016 · newest first':view==='saved'?'Your saved stories, kept on this device.':view==='sources'?'Public APIs. Clear attribution. No secret keys in your browser.':'Handpicked ideas + live discoveries.';
if(view==='sources'){lazyFeed.setItems([],{reset:true});feedKey='sources';$('#feed').replaceChildren(...sourceNodes(document,PROVIDERS,controller.states));return}
let items=view==='saved'?saved:view==='decade'?curated.filter(c=>!c.evergreen).sort((a,b)=>b.year-a.year):dedupe(interleaveDiscoveries(OPEN_ARTICLES,[...live,...curated.filter(c=>!OPEN_IDS.has(c.id))]));items=selectDiscoveries(items,{query,openOnly,trail,topic});$('#topic-context').textContent=({Books:'Catalog discoveries plus original Scroll Smart reading notes. Notes are editorial opinions, not reader ratings.',History:'Historical facts and archive essays with source links. Historical material is separate from current news.',AI:'Community-submitted AI news and discussion. Check the original reporting for confirmation.','Computer Science':'Computer science reporting, research, and community discussion. Open each source for context.',Medicine:'Research updates for learning, not medical advice. A single paper does not establish treatment guidance.',Cybersecurity:'Selected incident reports and known exploited vulnerabilities. This feed cannot cover every case. Catalog addition dates are not incident dates.'})[topic]||'';const nextKey=[view,topic,query,openOnly,trail].join(':');lazyFeed.setItems(items,{reset:nextKey!==feedKey});feedKey=nextKey;
if(!items.length)$('#feed').replaceChildren(node(document,'div','empty',view==='saved'?'Your next discovery belongs here. Save a story using the bookmark button.':'No matches yet. Clear filters or try another question.'));

}
const controller=new FeedController({onChange:state=>{
  live=state.items();
  $('#refresh').disabled=state.busy;
  $('#refresh').textContent=state.busy?'↻ Refreshing…':'↻ Refresh feed';
  $('#feed').setAttribute('aria-busy',String(state.busy));
  const failed=PROVIDERS.filter(p=>state.states.get(p.id)?.ok===false).map(p=>p.name);
  const successes=[...state.states.values()].filter(s=>s.ok).length;
  $('#status').textContent=state.busy?`Checking ${PROVIDERS.length} content feeds…`:failed.length?`${successes}/${PROVIDERS.length} sources updated · unavailable: ${failed.join(', ')} · previous results may be stale`:`● All ${PROVIDERS.length} sources checked at `+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  if(!reader?.isOpen)render();
}});
async function refresh(){const result=await controller.refresh();if(result==='cooldown')$('#status').textContent='Please wait 30 seconds between refreshes.'}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){if(!['home','feed','decade','saved','sources'].includes(nav.dataset.view))return;reader?.cancelPending();view=nav.dataset.view;topic='All topics';trail='';query='';openOnly=false;$('#search').value='';render();window.scrollTo({top:0,left:0,behavior:'instant'});if(view==='home')$('#home-title').focus({preventScroll:true});return}const filter=e.target.closest('[data-filter],[data-topic]');if(filter){const selected=filter.dataset.filter||filter.dataset.topic;if(!topics.includes(selected))return;reader?.cancelPending();topic=selected;trail='';if(view==='sources')view='feed';render();return}const save=e.target.closest('[data-save]');if(save){saveStory(save.dataset.save);return}const read=e.target.closest('[data-read]');if(read&&![...live,...curated,...saved].some(c=>c.id===read.dataset.read))return;if(read){resetDay();}if(read&&!progress.ids.includes(read.dataset.read)&&progress.ids.length<200){progress.ids.push(read.dataset.read);persist('ss-progress',progress);stats()}});
function markExplored(id){resetDay();if(!progress.ids.includes(id)&&progress.ids.length<200){progress.ids.push(id);persist('ss-progress',progress);stats()}}
reader=createArticleReader({doc:document,win:window,dialog:$('#reader'),content:$('#reader-content'),isSaved:id=>saved.some(c=>c.id===id),onSave:saveStory,onOpen:markExplored});
const findStory=id=>[...live,...curated,...saved].find(c=>c.id===id);
document.addEventListener('click',e=>{
 const openButton=e.target.closest?.('[data-open]');
 if(openButton){const item=findStory(openButton.dataset.open);if(item)reader.open(item,openButton);return}
 const card=e.target.closest?.('[data-card-id]');if(card)reader.cardClick(findStory(card.dataset.cardId),e);
});
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.target.closest?.('a, button, input, textarea, select, [contenteditable]'))return;
 const card=e.target.closest?.('[data-card-id]'),item=card&&findStory(card.dataset.cardId);if(item){e.preventDefault();reader.open(item,card)}
});
bindCardSaving(document,id=>{reader.cancelPending(id);saveStory(id)});
$('#search').oninput=e=>{query=String(e.target.value).slice(0,160);reader.cancelPending();render()};
$('#open-only').onclick=()=>{openOnly=!openOnly;reader.cancelPending();render()};
$('#reset-discovery').onclick=()=>{query='';openOnly=false;trail='';topic='All topics';$('#search').value='';reader.cancelPending();render()};
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-trail]');if(!button||!TRAILS.some(t=>t.id===button.dataset.trail))return;reader.cancelPending();trail=trail===button.dataset.trail?'':button.dataset.trail;topic='All topics';query='';$('#search').value='';openOnly=false;view='feed';render();$('#feed-title').scrollIntoView({behavior:'smooth',block:'start'})});
$('#surprise').onclick=()=>{const pool=OPEN_ARTICLES.filter(c=>!progress.ids.includes(c.id));const choices=pool.length?pool:OPEN_ARTICLES;reader.open(choices[Math.floor(Math.random()*choices.length)],$('#surprise'))};
function enterDiscoveries(selected='All topics'){
 if(!topics.includes(selected))return;
 reader.cancelPending();view='feed';topic=selected;query='';trail='';openOnly=false;$('#search').value='';render();
 $('#feed-title').scrollIntoView({behavior:'instant',block:'start'});$('#feed-title').focus({preventScroll:true});
}
home=createHome({doc:document,win:window,onSelect:enterDiscoveries,onBrowse:()=>enterDiscoveries()});
$('#dismiss-feedback').onclick=()=>{$('#save-feedback').hidden=true};
$('#explore').onclick=()=>{view='decade';topic='All topics';query='';trail='';openOnly=false;$('#search').value='';render();$('#feed-title').scrollIntoView({behavior:'smooth',block:'start'})};$('#refresh').onclick=refresh;render();refresh();setInterval(()=>{if(!document.hidden)refresh()},15*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(controller.lastAttempt===null||Date.now()-controller.lastAttempt>=15*60*1000))refresh()});
