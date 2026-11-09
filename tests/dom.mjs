// Minimal DOM test double: deliberately exposes no HTML parser or innerHTML setter.
export class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.className='';this._text='';this.open=false;this.hidden=false;this.disabled=false;this.classList={toggle(){}}}
 set textContent(value){this._text=String(value);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 setAttribute(key,value){this.attributes[key]=String(value)}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this._text='';this.children=nodes}
 addEventListener(){}
 showModal(){this.open=true}
 close(){this.open=false}
 focus(){}
 scrollIntoView(){}
}
export const document={createElement:tag=>new Element(tag)};
export function descendants(el){return [el,...el.children.flatMap(descendants)]}

export function eventRegistry(){const registry={};return {registry,addEventListener(name,fn){const old=registry[name];registry[name]=old?(e=>{old(e);fn(e)}):fn}}}
export function browserWindow(){return {addEventListener(){},setTimeout,clearTimeout,scrollY:0,scrollTo(){},location:{pathname:'/',search:'',hash:''},history:{pushState(){},back(){}}}}
