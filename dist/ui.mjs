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
 const symbol=node(doc,'span','art-symbol',c.symbol||'✦');symbol.setAttribute('aria-hidden','true');
 art.append(symbol,node(doc,'span','art-badge',c.topic.toUpperCase()));
 const body=node(doc,'div','card-body'),meta=node(doc,'div','card-meta');
 const date=c.live?new Date(c.date).toLocaleDateString():c.evergreen?'Evergreen':String(c.year||'');
 meta.append(node(doc,'span','',c.source),node(doc,'span','','· '+date));body.append(meta);
 if(c.kind)body.append(node(doc,'div','content-kind',c.kind));
 body.append(node(doc,'h3','',c.title),node(doc,'p','',c.summary));
 const destination=safeUrl(c.url);if(destination)body.append(node(doc,'p','destination','External site: '+new URL(destination).hostname));
 const bottom=node(doc,'div','card-bottom'),read=link(doc,'Explore the original ↗',c.url,'read-link');read.dataset.read=c.id;
 const save=node(doc,'button','save'+(isSaved?' saved':''),isSaved?'▣':'▧');save.type='button';save.dataset.save=c.id;
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
 const info=node(doc,'div','source-card');info.append(node(doc,'h3','','How updates work'),node(doc,'p','','Refresh on opening, every 15 minutes while visible, and on returning after 15 minutes. Use Refresh feed for an immediate check (at most once every 30 seconds). Failed providers retain previous results, which may be out of date. No updates run while closed. Your browser contacts providers directly; they receive your IP address. Saved stories stay on this device.'));nodes.push(info);return nodes;
}
