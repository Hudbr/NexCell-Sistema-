const $=id=>document.getElementById(id);
const PRIMARY=['sale','orders','cash'];
const MORE=[
  ['saved','📋','Orçamentos'],
  ['stock','📊','Estoque'],
  ['customers','👥','Clientes'],
  ['history','🧾','Histórico'],
  ['dashboard','📈','Resumo'],
  ['profile','👤','Meu acesso'],
];

function ensureStyles(){
  if(document.querySelector('link[data-pdv-module="mobile-nav"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href='./modules/mobile-nav.css';link.dataset.pdvModule='mobile-nav';document.head.appendChild(link);
}

function mount(){
  ensureStyles();
  const nav=document.querySelector('.mobile-nav');if(!nav||nav.dataset.compact==='1')return;
  nav.dataset.compact='1';
  [...nav.querySelectorAll('[data-view]')].forEach(button=>{if(!PRIMARY.includes(button.dataset.view))button.remove()});
  if(!nav.querySelector('[data-view="orders"]')){
    const sale=nav.querySelector('[data-view="sale"]');
    sale?.insertAdjacentHTML('afterend','<button class="mobile-link" type="button" data-view="orders"><span>📦</span><span>Pedidos</span></button>');
  }
  if(!nav.querySelector('[data-view="cash"]'))nav.insertAdjacentHTML('beforeend','<button class="mobile-link" type="button" data-view="cash"><span>💵</span><span>Caixa</span></button>');
  nav.insertAdjacentHTML('beforeend','<button class="mobile-link" id="mobileMoreButton" type="button" aria-expanded="false"><span>•••</span><span>Mais</span></button>');
  if(!$('mobileMoreSheet'))document.body.insertAdjacentHTML('beforeend',`<div class="pdv-more-backdrop" id="mobileMoreSheet" hidden><section class="pdv-more-sheet" role="dialog" aria-modal="true" aria-label="Mais opções"><header><div><strong>Mais opções</strong><span>Acesse funções menos usadas sem lotar a barra.</span></div><button type="button" data-more-close aria-label="Fechar">×</button></header><div>${MORE.map(([view,icon,label])=>`<button type="button" data-more-view="${view}" data-view="${view}"><span>${icon}</span><strong>${label}</strong></button>`).join('')}</div></section></div>`);
  wire();
}

function openSheet(open=true){const sheet=$('mobileMoreSheet');const button=$('mobileMoreButton');if(!sheet||!button)return;sheet.hidden=!open;button.setAttribute('aria-expanded',String(open));document.body.classList.toggle('pdv-more-open',open)}
function syncActive(view){document.querySelectorAll('.mobile-nav [data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));const more=$('mobileMoreButton');if(more)more.classList.toggle('active',MORE.some(([name])=>name===view))}
function wire(){
  $('mobileMoreButton')?.addEventListener('click',()=>openSheet(true));
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-more-close]')||event.target.id==='mobileMoreSheet')openSheet(false);
    const item=event.target.closest('[data-more-view]');if(item){syncActive(item.dataset.moreView);openSheet(false)}
    const primary=event.target.closest('.mobile-nav [data-view]');if(primary)syncActive(primary.dataset.view);
  });
  window.addEventListener('keydown',event=>{if(event.key==='Escape')openSheet(false)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,0),{once:true});else setTimeout(mount,0);
