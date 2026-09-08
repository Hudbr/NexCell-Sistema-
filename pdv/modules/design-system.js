import{replaceLegacyIcons}from'./icons.js';

function ensureStyles(){
 const styles=[
  ['nexcell-design-system','./modules/nexcell-design-system.css'],
  ['pdv-mobile-fixes','./modules/mobile-fixes.css'],
 ];
 styles.forEach(([key,href])=>{
  if(document.querySelector(`link[data-pdv-style="${key}"]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=href;
  link.dataset.pdvStyle=key;
  document.head.appendChild(link);
 });
}

ensureStyles();
/* Executa depois que as dependências do app terminam a montagem síncrona. */
queueMicrotask(()=>replaceLegacyIcons(document));

export function refreshDesignSystemIcons(root=document){replaceLegacyIcons(root)}
