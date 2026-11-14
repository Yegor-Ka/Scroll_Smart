import {safeUrl} from './feed-core.mjs';

export const LEARNING_STORAGE_KEY='ss-learning-v1';
export const LEARNING_VERSION=1;
export const TAKEAWAY_LIMIT=280;
export const REVIEW_INTERVALS=[1,3,7,21];

const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,max):'';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9._:/-]{1,100}$/.test(value)?value:'';
const unique=values=>[...new Set(values)];

export function localDayKey(value=new Date()){
 const date=value instanceof Date?value:new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}

export function addLocalDays(day,amount){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isInteger(amount))return '';
 const [year,month,date]=day.split('-').map(Number),next=new Date(year,month-1,date+amount,12);
 return localDayKey(next);
}

function compactCard(card){
 const url=safeUrl(card?.url),cardId=id(card?.id),title=text(card?.title,240),topic=text(card?.topic,40),source=text(card?.source,140);
 if(!cardId||!title||!topic||!source||!url)return null;
 return {id:cardId,title,topic,source,url,summary:text(card.summary,700),symbol:text(card.symbol,4),kind:text(card.kind,40),date:typeof card.date==='number'&&Number.isFinite(card.date)?card.date:null,year:Number.isInteger(card.year)?card.year:null,evergreen:Boolean(card.evergreen),live:Boolean(card.live)};
}

function normalizeQuest(raw){
 if(!raw||typeof raw!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.day)||!Array.isArray(raw.items))return null;
 const items=[],seen=new Set();
 for(const value of raw.items.slice(0,5)){const item=compactCard(value);if(item&&!seen.has(item.id)){seen.add(item.id);items.push(item)}}
 if(!items.length)return null;
 return {day:raw.day,items,completedIds:unique(Array.isArray(raw.completedIds)?raw.completedIds.map(id).filter(value=>value&&seen.has(value)):[]).slice(0,5)};
}

function normalizeTakeaway(raw){
 if(!raw||typeof raw!=='object')return null;
 const articleId=id(raw.articleId),note=text(raw.note,TAKEAWAY_LIMIT),url=safeUrl(raw.url),title=text(raw.title,240),source=text(raw.source,140),topic=text(raw.topic,40);
 const created=typeof raw.created==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.created)?raw.created:'';
 const stage=Number.isInteger(raw.stage)&&raw.stage>=0&&raw.stage<REVIEW_INTERVALS.length?raw.stage:0;
 const nextReview=raw.completed?'':typeof raw.nextReview==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(raw.nextReview)?raw.nextReview:'';
 if(!articleId||!note||!url||!title||!source||!topic||!created||(!raw.completed&&!nextReview))return null;
 return {articleId,note,url,title,source,topic,articleDate:text(raw.articleDate,40),created,saved:Boolean(raw.saved),stage,nextReview,completed:Boolean(raw.completed),partialRepeated:Boolean(raw.partialRepeated)};
}

function normalizeHistory(raw){
 if(!Array.isArray(raw))return [];
 const byDay=new Map();
 for(const row of raw){
  if(!row||typeof row!=='object'||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))continue;
  const count=Math.max(0,Math.min(5,Number.isInteger(row.count)?row.count:0));
  const topics=unique(Array.isArray(row.topics)?row.topics.map(v=>text(v,40)).filter(Boolean):[]).slice(0,5);
  byDay.set(row.date,{date:row.date,count,topics,completed:count===5});
 }
 return [...byDay.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
}

export function normalizeLearningState(raw){
 const value=raw&&typeof raw==='object'?raw:{};
 const preferences={};
 const source=value.preferences&&typeof value.preferences==='object'?value.preferences:{};
 for(const [topic,count] of Object.entries(source).slice(0,30)){const key=text(topic,40);if(key&&!['__proto__','prototype','constructor'].includes(key)&&Number.isInteger(count)&&count>0)preferences[key]=Math.min(count,1000)}
 const takeaways=[];
 for(const row of Array.isArray(value.takeaways)?value.takeaways.slice(0,200):[]){const record=normalizeTakeaway(row);if(record&&!takeaways.some(item=>item.articleId===record.articleId))takeaways.push(record)}
 const exploredIds=unique(Array.isArray(value.exploredIds)?value.exploredIds.map(id).filter(Boolean):[]).slice(0,200);
 return {version:LEARNING_VERSION,preferences,currentQuest:normalizeQuest(value.currentQuest),history:normalizeHistory(value.history),takeaways,exploredIds};
}

export function parseLearningState(raw){
 if(typeof raw!=='string'||raw.length>512000)return normalizeLearningState(null);
 try{return normalizeLearningState(JSON.parse(raw))}catch{return normalizeLearningState(null)}
}

export function rememberTopic(state,topic){
 const next=normalizeLearningState(state),key=text(topic,40);
 if(key&&key!=='All topics')next.preferences[key]=Math.min(1000,(next.preferences[key]||0)+1);
 return next;
}

function hash(value){let n=2166136261;for(const char of value){n^=char.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0}
function ordered(cards,seed){return [...cards].sort((a,b)=>hash(seed+':'+a.id)-hash(seed+':'+b.id)||a.id.localeCompare(b.id))}

export function createDailyQuest({items=[],state=null,now=new Date()}={}){
 const clean=normalizeLearningState(state),day=localDayKey(now);
 if(clean.currentQuest?.day===day)return clean.currentQuest;
 const candidates=[],seen=new Set();
 for(const value of items){const card=compactCard(value);if(card&&!seen.has(card.id)){seen.add(card.id);candidates.push(card)}}
 const preferred=Object.entries(clean.preferences).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([topic])=>topic).slice(0,5),chosen=[];
 const take=(pool,count,seed)=>{if(count<=0)return;for(const card of ordered(pool.filter(item=>!chosen.some(c=>c.id===item.id)),seed)){chosen.push(card);if(--count===0)break}};
 if(preferred.length)take(candidates.filter(card=>preferred.includes(card.topic)),3,day+':preferred');
 else take(candidates,3,day+':starting');
 take(candidates.filter(card=>!preferred.includes(card.topic)),1,day+':outside');
 const usedTopics=new Set(chosen.map(card=>card.topic)),usedSources=new Set(chosen.map(card=>card.source));
 const surprise=candidates.filter(card=>!usedTopics.has(card.topic)&&!usedSources.has(card.source));
 take(surprise.length?surprise:candidates.filter(card=>!usedTopics.has(card.topic)),1,day+':surprise');
 take(candidates,5-chosen.length,day+':fallback');
 return {day,items:chosen.slice(0,5),completedIds:[]};
}

export function ensureDailyQuest(state,items,now=new Date()){
 const next=normalizeLearningState(state);next.currentQuest=createDailyQuest({items,state:next,now});return next;
}

export function markQuestExplored(state,articleId,now=new Date()){
 const next=normalizeLearningState(state),quest=next.currentQuest,day=localDayKey(now);
 const cleanId=id(articleId);if(!cleanId)return next;next.exploredIds=unique([cleanId,...next.exploredIds]).slice(0,200);
 if(!quest||quest.day!==day||!quest.items.some(item=>item.id===cleanId))return next;
 quest.completedIds=unique([...quest.completedIds,cleanId]).slice(0,5);
 const topics=unique(quest.items.filter(item=>quest.completedIds.includes(item.id)).map(item=>item.topic));
 next.history=normalizeHistory([{date:day,count:quest.completedIds.length,topics},...next.history.filter(row=>row.date!==day)]);
 return next;
}

export function weekHistory(history,now=new Date()){
 const today=localDayKey(now),byDay=new Map(normalizeHistory(history).map(row=>[row.date,row]));
 return Array.from({length:7},(_,index)=>{const date=addLocalDays(today,index-6);return byDay.get(date)||{date,count:0,topics:[],completed:false}});
}

export function saveTakeaway(state,item,note,now=new Date(),saved=false){
 const next=normalizeLearningState(state),cleanNote=text(note,TAKEAWAY_LIMIT);
 if(!cleanNote)throw new RangeError('Write a takeaway before saving.');
 if(typeof note!=='string'||note.trim().length>TAKEAWAY_LIMIT)throw new RangeError(`Keep your takeaway to ${TAKEAWAY_LIMIT} characters.`);
 const card=compactCard(item);if(!card)throw new TypeError('This article cannot be saved for review.');
 const today=localDayKey(now),existing=next.takeaways.find(row=>row.articleId===card.id);
 const articleDate=card.date?new Date(card.date).toISOString().slice(0,10):card.year?String(card.year):'';
 const record=existing?{...existing,note:cleanNote,title:card.title,source:card.source,topic:card.topic,url:card.url,articleDate,saved:Boolean(saved)}:{articleId:card.id,note:cleanNote,title:card.title,source:card.source,topic:card.topic,url:card.url,articleDate,created:today,saved:Boolean(saved),stage:0,nextReview:addLocalDays(today,REVIEW_INTERVALS[0]),completed:false,partialRepeated:false};
 next.takeaways=[record,...next.takeaways.filter(row=>row.articleId!==card.id)].slice(0,200);return next;
}

export function deleteTakeaway(state,articleId){const next=normalizeLearningState(state);next.takeaways=next.takeaways.filter(row=>row.articleId!==articleId);return next}

export function reviewTakeaway(state,articleId,answer,now=new Date()){
 const next=normalizeLearningState(state),record=next.takeaways.find(row=>row.articleId===articleId);
 if(!record||record.completed||!['remember','partly','again'].includes(answer))return next;
 const today=localDayKey(now);
 if(answer==='again'){record.nextReview=addLocalDays(today,1);record.partialRepeated=false}
 else if(answer==='partly'){
  record.nextReview=addLocalDays(today,record.partialRepeated?1:REVIEW_INTERVALS[record.stage]);record.partialRepeated=true;
 }else if(record.stage===REVIEW_INTERVALS.length-1){record.completed=true;record.nextReview='';record.partialRepeated=false}
 else {record.stage++;record.nextReview=addLocalDays(today,REVIEW_INTERVALS[record.stage]);record.partialRepeated=false}
 return next;
}

export function dueTakeaways(state,now=new Date()){
 const today=localDayKey(now);return normalizeLearningState(state).takeaways.filter(row=>!row.completed&&row.nextReview<=today).sort((a,b)=>a.nextReview.localeCompare(b.nextReview)||a.title.localeCompare(b.title));
}

const RELATED={AI:['Computer Science','Technology','Mathematics','Philosophy'],Technology:['Computer Science','AI','History'],Science:['Medicine','Nature','Space','Mathematics'],Medicine:['Science','Psychology'],History:['Culture','Philosophy','Technology'],Nature:['Climate','Science'],Space:['Science','Mathematics'],Books:['Culture','History','Philosophy'],Psychology:['Philosophy','Medicine'],Cybersecurity:['Computer Science','Technology']};
const words=value=>new Set(text(value,1000).toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>3));
const overlap=(a,b)=>{let count=0;for(const word of a)if(b.has(word))count++;return count};
const pick=(pool,score,used)=>pool.filter(item=>!used.has(item.id)).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id))[0]||null;

export function curiosityChains(current,items=[]){
 const base=compactCard(current);if(!base)return [];
 const candidates=[],seen=new Set([base.id]);
 for(const value of items){const card=compactCard(value);if(card&&!seen.has(card.id)){seen.add(card.id);candidates.push(card)}}
 const used=new Set(),baseWords=words(base.title+' '+base.summary),result=[];
 const deeper=pick(candidates.filter(item=>item.topic===base.topic),item=>overlap(baseWords,words(item.title+' '+item.summary))*8+(item.live?5:0)+(item.source!==base.source?2:0)+(item.date||0)/1e15,used);
 if(deeper){used.add(deeper.id);result.push({kind:'deeper',label:'Go deeper',item:deeper})}
 const foundation=pick(candidates.filter(item=>item.topic===base.topic),item=>(item.evergreen?8:0)+(item.kind==='Open article'?6:0)+(/\b(introduction|foundation|beginner|basics|understand|what|how|history)\b/i.test(item.title+' '+item.summary)?5:0)+overlap(baseWords,words(item.title+' '+item.summary))*2,used);
 if(foundation){used.add(foundation.id);result.push({kind:'foundation',label:'Learn the foundation',item:foundation})}
 const related=RELATED[base.topic]||[];
 const connection=pick(candidates.filter(item=>item.topic!==base.topic&&(related.includes(item.topic)||overlap(baseWords,words(item.title+' '+item.summary))>0)),item=>(related.includes(item.topic)?10-related.indexOf(item.topic):0)+overlap(baseWords,words(item.title+' '+item.summary))*6+(item.source!==base.source?2:0),used);
 if(connection){used.add(connection.id);result.push({kind:'connection',label:'Make a connection',item:connection})}
 return result;
}
