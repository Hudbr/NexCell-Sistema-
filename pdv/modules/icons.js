const ICONS={
  'shopping-cart':'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h7.72a2 2 0 0 0 2-1.58L20.05 7H5.12"/>',
  'clipboard-list':'<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  'user':'<path d="M19 21a7 7 0 0 0-14 0"/><circle cx="12" cy="7" r="4"/>',
  'settings':'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  'store':'<path d="M3 9l1-5h16l1 5"/><path d="M5 13v8h14v-8"/><path d="M9 21v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>',
  'log-out':'<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/>',
  'package':'<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  'banknote':'<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  'boxes':'<path d="M2.97 12.92 7 15.24l4.03-2.32L7 10.6zM8.97 3.92 13 6.24l4.03-2.32L13 1.6zM13 13.6l4.03 2.32L21 13.6l-3.97-2.28z"/><path d="M7 15.24V20l4-2.3v-4.78M13 6.24V11l4-2.3V3.92M17.03 15.92V20L21 17.7v-4.1"/>',
  'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  'receipt-text':'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6M16 12h-6M13 16h-3"/>',
  'chart':'<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16V5"/>',
  'layout-dashboard':'<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'ellipsis':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  'x':'<path d="M18 6 6 18M6 6l12 12"/>',
  'scan-line':'<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/>',
  'history':'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'
};

export function iconMarkup(name,label=''){
  const body=ICONS[name]||ICONS['layout-dashboard'];
  return `<svg class="nex-icon" viewBox="0 0 24 24" aria-hidden="${label?'false':'true'}"${label?` aria-label="${String(label).replaceAll('"','&quot;')}"`:''}>${body}</svg>`;
}

const LEGACY={
  '🛒':'shopping-cart','📋':'clipboard-list','👤':'user','⚙️':'settings','🏪':'store','↪':'log-out',
  '📦':'package','💵':'banknote','📊':'boxes','👥':'users','🧾':'receipt-text','📈':'chart','•••':'ellipsis','▥':'scan-line'
};

export function replaceLegacyIcons(root=document){
  for(const node of root.querySelectorAll('span,button')){
    const text=(node.textContent||'').trim();
    const name=LEGACY[text];
    if(!name||node.querySelector?.('svg'))continue;
    if(node.childNodes.length===1&&node.firstChild?.nodeType===Node.TEXT_NODE)node.innerHTML=iconMarkup(name);
  }
  for(const button of root.querySelectorAll('[data-close-modal], [data-more-close]')){
    if((button.textContent||'').trim()==='×')button.innerHTML=iconMarkup('x');
  }
}

export function observeLegacyIcons(){
  replaceLegacyIcons(document);
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    replaceLegacyIcons(node.matches?.('span,button')?node.parentElement||node:node);
  })));
  observer.observe(document.body,{childList:true,subtree:true});
  return observer;
}
