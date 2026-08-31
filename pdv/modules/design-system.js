import{replaceLegacyIcons}from'./icons.js';

function ensureStyles(){
 if(document.querySelector('link[data-nexcell-design-system]'))return;
 const link=document.createElement('link');
 link.rel='stylesheet';
 link.href='./modules/nexcell-design-system.css';
 link.dataset.nexcellDesignSystem='1';
 document.head.appendChild(link);
}

ensureStyles();
/* Executa depois que as dependências do app terminam a montagem síncrona. */
queueMicrotask(()=>replaceLegacyIcons(document));

export function refreshDesignSystemIcons(root=document){replaceLegacyIcons(root)}
