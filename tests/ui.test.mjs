import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cardNode,sourceNodes,takeawayCardNode} from '../dist/ui.mjs';
import {normalizeCard} from '../dist/feed-core.mjs';
import {document,descendants} from './dom.mjs';
test('attacker strings remain text and cannot create markup or event attributes',()=>{
 const attack='<img src=x onerror=alert(1)><script>evil()</script>';
 const c=normalizeCard({id:'test',topic:'Science',title:attack,source:attack,summary:attack,url:'https://example.org'});
 const el=cardNode(document,c,false),nodes=descendants(el);
 assert.ok(el.textContent.includes(attack));assert.ok(!nodes.some(n=>['IMG','SCRIPT','IFRAME'].includes(n.tagName)));
 assert.ok(!nodes.some(n=>Object.keys(n.attributes).some(a=>a.startsWith('on'))));
 const read=nodes.find(n=>n.dataset.open==='test');assert.equal(read.tagName,'BUTTON');assert.equal(read.attributes['aria-haspopup'],'dialog');
});
test('source details also use DOM text assignment',()=>{
 const els=sourceNodes(document,[{id:'x',name:'<img onerror=evil>',description:'<script>evil</script>',docs:'javascript:evil'}],new Map());
 const nodes=els.flatMap(descendants);assert.ok(!nodes.some(n=>n.tagName==='SCRIPT'||n.tagName==='IMG'));assert.equal(nodes.find(n=>n.tagName==='A').href,undefined);
});
test('application has no HTML parsing sinks, eval or dynamic script construction',async()=>{
 for(const file of ['../dist/app.js','../dist/ui.mjs','../dist/feed-core.mjs','../dist/reader.mjs','../dist/discovery.mjs','../dist/learning.mjs','../dist/theme.js','../dist/home.mjs']){
  const source=await readFile(new URL(file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(/);
 }
});

test('cards show the actual destination instead of hiding it behind an aggregator name',()=>{
 const c=normalizeCard({id:'outbound',topic:'Technology',title:'An article',summary:'Summary',source:'Hacker News',url:'https://publisher.example.org/article'});
 const el=cardNode(document,c,false),nodes=descendants(el);
 assert.ok(el.textContent.includes('External site: publisher.example.org'));
 const read=nodes.find(n=>n.dataset.open==='outbound');assert.equal(read.tagName,'BUTTON');assert.equal(read.textContent,'Read here →');
});
test('personal takeaways render as plain text with safe links and bounded controls',()=>{
 const attack='<img src=x onerror=evil()> Remember this';
 const card=takeawayCardNode(document,{articleId:'one',title:'Article',source:'Source',topic:'Science',note:attack,url:'https://example.org/article',completed:false},{due:true});
 const nodes=descendants(card);assert.ok(card.textContent.includes(attack));assert.equal(nodes.some(node=>node.tagName==='IMG'),false);
 assert.equal(nodes.find(node=>node.className==='review-original').href,'https://example.org/article');assert.equal(nodes.filter(node=>node.dataset.reviewAnswer).length,3);
});
test('product logo and favicon are wired as local application assets',async()=>{
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),manifest=JSON.parse(await readFile(new URL('../dist/manifest.json',import.meta.url),'utf8'));
 assert.match(html,/<link rel="icon" type="image\/png" href="\/favicon\.png">/);assert.match(html,/class="brand-logo" src="\/logo\.png"/);assert.match(html,/class="mobile-logo" src="\/logo\.png"/);
 assert.equal(manifest.icons[0].src,'/favicon.png');assert.equal(manifest.icons[0].type,'image/png');
});
