import { toast } from '../../assets/js/utils.js';

const LOCK_NAME='nexcell-pdv-terminal';
const FALLBACK_KEY='nexcell.pdv.terminal-lock';
const tabId=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
let secondary=false;
let releaseWebLock=null;
let retryTimer=null;
let fallbackTimer=null;
let usingFallback=false;

const blockedClickSelectors=['#openPayment','#saveBudget','[data-open-register]','[data-complete-online]','[data-cancel-online]','[data-stock-adjust]','[data-cancel-sale]','[data-cancel-quote]'];
const blockedForms=new Set(['paymentForm','budgetForm','cashForm','closeRegisterForm','stockAdjustForm','onlineCompleteForm','registerForm','cancelSaleForm']);

function setSecondary(value){
 const next=Boolean(value);if(next===secondary)return;secondary=next;document.body.toggleAttribute('data-pdv-secondary-tab',secondary);
 let banner=document.getElementById('pdvSecondaryTabBanner');
 if(!secondary){banner?.remove();return}
 if(!banner){banner=document.createElement('div');banner.id='pdvSecondaryTabBanner';banner.setAttribute('role','status');banner.style.cssText='position:sticky;top:0;z-index:95;padding:10px 16px;background:#eef4ff;border-bottom:1px solid #b8ccf5;color:#173b70;font:700 12px/1.4 Plus Jakarta Sans,sans-serif;text-align:center';banner.textContent='MODO DE CONSULTA — este PDV já está operacional em outra aba deste aparelho.';document.querySelector('.workspace-main')?.prepend(banner)}
}
function blockMessage(){toast('Este aparelho já possui outra aba do PDV operando. Use esta aba apenas para consulta ou feche a outra aba.','error')}
function installGuards(){
 document.addEventListener('click',event=>{if(!secondary)return;if(blockedClickSelectors.some(selector=>event.target.closest(selector))){event.preventDefault();event.stopImmediatePropagation();blockMessage()}},true);
 document.addEventListener('submit',event=>{if(!secondary||!blockedForms.has(event.target?.id))return;event.preventDefault();event.stopImmediatePropagation();blockMessage()},true);
}

function scheduleWebRetry(){clearTimeout(retryTimer);retryTimer=setTimeout(acquireWebLock,3500)}
function acquireWebLock(){
 if(!navigator.locks||usingFallback)return startFallback();
 navigator.locks.request(LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
  if(!lock){setSecondary(true);scheduleWebRetry();return}
  clearTimeout(retryTimer);setSecondary(false);
  await new Promise(resolve=>{releaseWebLock=resolve});releaseWebLock=null;
 }).catch(()=>startFallback());
}

function readFallback(){try{return JSON.parse(localStorage.getItem(FALLBACK_KEY)||'null')}catch(_){return null}}
function writeFallback(){try{localStorage.setItem(FALLBACK_KEY,JSON.stringify({id:tabId,ts:Date.now()}));return true}catch(_){return false}}
function fallbackTick(){
 const current=readFallback();const stale=!current||Date.now()-Number(current.ts||0)>30000;
 if(stale||current.id===tabId){writeFallback();setSecondary(false)}else setSecondary(true)
}
function startFallback(){
 if(usingFallback)return;usingFallback=true;fallbackTick();fallbackTimer=setInterval(fallbackTick,5000);
 window.addEventListener('storage',event=>{if(event.key===FALLBACK_KEY)fallbackTick()});
}
function release(){
 if(releaseWebLock)releaseWebLock();clearTimeout(retryTimer);clearInterval(fallbackTimer);
 if(usingFallback){const current=readFallback();if(current?.id===tabId)try{localStorage.removeItem(FALLBACK_KEY)}catch(_){}}
}

export function initTerminalLock(){installGuards();acquireWebLock();window.addEventListener('pagehide',release,{once:true})}
