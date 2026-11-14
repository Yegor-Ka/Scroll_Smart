import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localDayKey,normalizeLearningState,parseLearningState,rememberTopic,ensureDailyQuest,markQuestExplored,weekHistory,saveTakeaway,deleteTakeaway,reviewTakeaway,dueTakeaways,curiosityChains,TAKEAWAY_LIMIT} from '../dist/learning.mjs';

const day=value=>new Date(value+'T12:00:00');
const card=(id,topic='Science',extra={})=>({id,title:`${topic} story ${id}`,summary:'An educational explanation of patterns and ideas.',topic,source:'Source '+id,url:`https://example.org/${id}`,evergreen:false,...extra});
const collection=[card('s1'),card('s2'),card('s3'),card('a1','AI'),card('h1','History'),card('b1','Books'),card('n1','Nature')];

test('local date utility and daily quest persist for a day and renew the next day',()=>{
 assert.equal(localDayKey(day('2026-02-03')),'2026-02-03');
 let state=rememberTopic(normalizeLearningState(null),'Science');
 state=ensureDailyQuest(state,collection,day('2026-02-03'));const first=state.currentQuest;
 state=ensureDailyQuest(state,[...collection].reverse(),day('2026-02-03'));assert.deepEqual(state.currentQuest,first);
 state=ensureDailyQuest(state,collection,day('2026-02-04'));assert.equal(state.currentQuest.day,'2026-02-04');assert.notStrictEqual(state.currentQuest,first);
});

test('daily quest has five distinct items with preference, outside-topic, surprise, and safe fallback',()=>{
 let state=rememberTopic(normalizeLearningState(null),'Science');state=ensureDailyQuest(state,collection,day('2026-02-03'));
 assert.equal(state.currentQuest.items.length,5);assert.equal(new Set(state.currentQuest.items.map(item=>item.id)).size,5);
 assert.equal(state.currentQuest.items.filter(item=>item.topic==='Science').length,3);
 assert.ok(new Set(state.currentQuest.items.map(item=>item.topic)).size>=3);
 const small=ensureDailyQuest(normalizeLearningState(null),collection.slice(0,2),day('2026-02-03')).currentQuest;
 assert.equal(small.items.length,2);assert.equal(new Set(small.items.map(item=>item.id)).size,2);
});

test('quest completion is explicit and weekly history records only completed days',()=>{
 let state=ensureDailyQuest(normalizeLearningState(null),collection,day('2026-02-03')),id=state.currentQuest.items[0].id;
 assert.equal(state.currentQuest.completedIds.length,0);
 state=markQuestExplored(state,'not-in-quest',day('2026-02-03'));assert.equal(state.currentQuest.completedIds.length,0);
 state=markQuestExplored(state,id,day('2026-02-03'));state=markQuestExplored(state,id,day('2026-02-03'));assert.equal(state.currentQuest.completedIds.length,1);
 for(const item of state.currentQuest.items)state=markQuestExplored(state,item.id,day('2026-02-03'));
 const week=weekHistory(state.history,day('2026-02-04'));assert.equal(week.length,7);assert.equal(week.find(row=>row.date==='2026-02-03').completed,true);
});

test('takeaways create, edit, delete, reject excess text, and corrupted storage fails safely',()=>{
 let state=saveTakeaway(null,collection[0],'<b>My own plain-text insight</b>',day('2026-02-03'),true);
 assert.equal(state.takeaways[0].note,'<b>My own plain-text insight</b>');assert.equal(state.takeaways[0].nextReview,'2026-02-04');assert.equal(state.takeaways[0].saved,true);
 state=saveTakeaway(state,collection[0],'Edited insight',day('2026-02-03'));assert.equal(state.takeaways.length,1);assert.equal(state.takeaways[0].note,'Edited insight');
 assert.throws(()=>saveTakeaway(state,collection[0],'x'.repeat(TAKEAWAY_LIMIT+1),day('2026-02-03')),RangeError);
 assert.deepEqual(parseLearningState('{broken').takeaways,[]);assert.deepEqual(parseLearningState('x'.repeat(512001)).takeaways,[]);
 const polluted=normalizeLearningState({preferences:JSON.parse('{"__proto__":99,"Science":2}')});assert.equal(polluted.preferences.Science,2);assert.equal(Object.getPrototypeOf(polluted.preferences),Object.prototype);
 state=deleteTakeaway(state,'s1');assert.equal(state.takeaways.length,0);
});

test('review answers follow 1, 3, 7, 21 day intervals and finish after final success',()=>{
 let state=saveTakeaway(null,collection[0],'A useful insight',day('2026-02-03'));
 assert.equal(dueTakeaways(state,day('2026-02-03')).length,0);assert.equal(dueTakeaways(state,day('2026-02-04')).length,1);
 state=reviewTakeaway(state,'s1','remember',day('2026-02-04'));assert.equal(state.takeaways[0].stage,1);assert.equal(state.takeaways[0].nextReview,'2026-02-07');
 state=reviewTakeaway(state,'s1','partly',day('2026-02-07'));assert.equal(state.takeaways[0].nextReview,'2026-02-10');
 state=reviewTakeaway(state,'s1','partly',day('2026-02-10'));assert.equal(state.takeaways[0].nextReview,'2026-02-11');
 state=reviewTakeaway(state,'s1','again',day('2026-02-11'));assert.equal(state.takeaways[0].nextReview,'2026-02-12');
 state=reviewTakeaway(state,'s1','remember',day('2026-02-12'));assert.equal(state.takeaways[0].stage,2);assert.equal(state.takeaways[0].nextReview,'2026-02-19');
 state=reviewTakeaway(state,'s1','remember',day('2026-02-19'));assert.equal(state.takeaways[0].stage,3);assert.equal(state.takeaways[0].nextReview,'2026-03-12');
 state=reviewTakeaway(state,'s1','remember',day('2026-03-12'));assert.equal(state.takeaways[0].completed,true);assert.equal(state.takeaways[0].nextReview,'');
});

test('curiosity chains are deterministic, distinct, exclude the current item, and prefer intended paths',()=>{
 const current=card('current','Science',{title:'How patterns shape science'});
 const items=[current,card('deep','Science',{live:true,title:'New patterns in science'}),card('foundation','Science',{evergreen:true,kind:'Open article',title:'Understanding the foundations of science'}),card('connection','Mathematics',{title:'Patterns in mathematics'}),card('other','Books')];
 const first=curiosityChains(current,items),second=curiosityChains(current,[...items].reverse());
 assert.deepEqual(first,second);assert.deepEqual(first.map(row=>row.kind),['deeper','foundation','connection']);
 assert.equal(new Set(first.map(row=>row.item.id)).size,3);assert.ok(first.every(row=>row.item.id!=='current'));
 assert.deepEqual(curiosityChains(current,[current]),[]);
});
test('recommendation utility performs no network requests',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('../dist/learning.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(/);
});
