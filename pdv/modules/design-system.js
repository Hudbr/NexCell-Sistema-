import{observeLegacyIcons,replaceLegacyIcons}from'./icons.js';

function ensureStyles(){
 if(document.querySelector('link[data-nexcell-design-system]'))return;
 const link=document.createElement('link');
 link.rel='stylesheet';
 link.href='./modules/nexcell-design-system.css';
 link.dataset.nexcellDesignSystem='1';
 document.head.appendChild(link);
}

ensureStyles();
replaceLegacyIcons(document);
const observer=observeLegacyIcons();
window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
