// Runs before CSS to avoid a bright flash. Only three constant theme values are accepted.
(()=>{
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 let preference='system';
 try{const value=localStorage.getItem('ss-theme');if(['light','dark','system'].includes(value))preference=value}catch{}
 function apply(){
  const dark=preference==='dark'||(preference==='system'&&media.matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  const button=document.querySelector('#theme-toggle');
  if(button){button.textContent=preference==='system'?'◐ Auto':dark?'☾ Dark':'☀ Light';button.setAttribute('aria-label','Color theme: '+preference+'. Switch to '+({system:'light',light:'dark',dark:'system'})[preference]);}
 }
 apply();media.addEventListener('change',apply);
 document.addEventListener('DOMContentLoaded',()=>{
  apply();document.querySelector('#theme-toggle').addEventListener('click',()=>{
   preference=({system:'light',light:'dark',dark:'system'})[preference];
   try{localStorage.setItem('ss-theme',preference)}catch{}
   apply();
  });
 });
})();
