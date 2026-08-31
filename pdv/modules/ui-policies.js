import { getOperationalProfile, setRegisterClosedHandler, setSangriaPasswordProvider } from '../supabase.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let manualRegisterOpenUntil=0;
let pendingCloseReceipt=null;

function applyBranding(){
 document.querySelectorAll('.brand-copy,.sidebar-brand-copy').forEach(node=>node.remove());
 document.querySelectorAll('.brand-mark').forEach(mark=>{
  if(mark.dataset.nexcellBrand==='1')return;
  mark.dataset.nexcellBrand='1';mark.textContent='';mark.style.cssText='width:72px;height:58px;padding:0;border:0;background:transparent;border-radius:0;box-shadow:none';
  const image=document.createElement('img');image.src='./favicon.svg';image.alt='Nexcell';image.decoding='async';image.style.cssText='width:100%;height:100%;object-fit:contain;display:block';mark.appendChild(image);
 });
}

function sanitizeReceipt(root=$('receiptContent')){
 if(!root)return;
 root.querySelectorAll('span').forEach(label=>{
  if(label.textContent.trim()!=='Operador')return;
  const strong=label.parentElement?.querySelector('strong');const match=strong?.textContent?.match(/#\s*([A-Za-z0-9_-]+)/);if(!match)return;
  const safe=`#${match[1]}`;if(strong.textContent!==safe)strong.textContent=safe;
 });
 root.querySelectorAll('p').forEach(paragraph=>{const current=paragraph.textContent||'';const match=current.match(/^(.*?Operador\s*#\s*[A-Za-z0-9_-]+)/);if(match&&current!==match[1])paragraph.textContent=match[1]});
}

function mountReceiptPrivacy(){
 const root=$('receiptContent');if(!root||root.dataset.identityPrivacy==='1')return;
 root.dataset.identityPrivacy='1';sanitizeReceipt(root);
 new MutationObserver(()=>sanitizeReceipt(root)).observe(root,{childList:true,subtree:true,characterData:true});
}

function mountSangriaUi(){
 const actor=$('cashActorCode');const target=$('cashTargetCode');
 if(actor&&!$('cashPassword')){
  const actorField=actor.closest('.field');const row=actor.closest('.field-row');actor.required=false;actor.type='hidden';actor.value='';if(actorField)actorField.style.display='none';
  const passwordField=document.createElement('div');passwordField.className='field';passwordField.innerHTML='<label for="cashPassword">Senha de quem está fazendo a sangria</label><input class="input" id="cashPassword" type="password" required autocomplete="current-password" placeholder="Digite sua senha"><small>Confirma a identidade da conta atualmente logada.</small>';
  if(row)row.appendChild(passwordField);else target?.closest('.field')?.insertAdjacentElement('afterend',passwordField);
 }
 const fiscal=$('fiscalDocument');if(fiscal){fiscal.required=false;fiscal.type='hidden';fiscal.value='';const field=fiscal.closest('.field');if(field)field.style.display='none'}
 setSangriaPasswordProvider(()=>String($('cashPassword')?.value||''));
}

function isAdminViewer(profile){return Boolean(profile?.is_root_owner||['owner','admin'].includes(String(profile?.role||'').toLowerCase())||profile?.permissions?.['*']===true||profile?.permissions?.['finance.write']===true)}

function mountAdminViewer(){
 const modal=$('registerModal');if(!modal||modal.dataset.adminPolicy==='1')return;
 modal.dataset.adminPolicy='1';
 document.addEventListener('click',event=>{if(event.target.closest('[data-open-register],#openRegisterButton'))manualRegisterOpenUntil=Date.now()+8000},true);
 const inspect=async()=>{
  if(!modal.classList.contains('open')||Date.now()<manualRegisterOpenUntil)return;
  try{
   const profile=await getOperationalProfile();if(!isAdminViewer(profile)||Date.now()<manualRegisterOpenUntil)return;
   modal.classList.remove('open');modal.setAttribute('aria-hidden','true');
   const root=$('registerStatus');if(root&&!root.querySelector('[data-admin-viewer-note]'))root.insertAdjacentHTML('afterbegin','<div data-admin-viewer-note class="auth-message show" style="margin-bottom:12px;"><strong>Modo ADM · visualização liberada.</strong><br>O caixa pode ser acompanhado mesmo fechado. Abrir caixa continua sendo uma ação separada.</div>');
  }catch(_){/* sessão ainda inicializando */}
 };
 new MutationObserver(inspect).observe(modal,{attributes:true,attributeFilter:['class']});
 setTimeout(inspect,0);
}

function operatorRows(rows){const list=Array.isArray(rows)?rows:[];return list.length?list.map(item=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #eee;"><span><strong>#${esc(item.operator_code||'—')}</strong> · ${Number(item.sales_count||0)} venda(s)</span><strong>${money(item.total)}</strong></div>`).join(''):'<div style="padding:8px 0;color:#667085;">Nenhuma venda registrada.</div>'}
function dayLabel(value){const parts=String(value||'').split('-');return parts.length===3?`${parts[2]}/${parts[1]}/${parts[0]}`:String(value||'hoje')}
function presentRegisterCloseReceipt(data){
 if(!data)return;const modal=$('receiptModal'),root=$('receiptContent'),title=$('receiptTitle');if(!modal||!root||!title)return;
 $('registerModal')?.classList.remove('open');$('registerModal')?.setAttribute('aria-hidden','true');
 const register=data.register_summary||{},day=data.day_summary||{};title.textContent='Fechamento do caixa';
 root.innerHTML=`<div style="text-align:center;"><strong>Caixa #${esc(data.code||'')}</strong><p>Fechamento concluído</p></div><hr><section><strong style="display:block;margin-bottom:7px;">Vendas deste caixa</strong>${operatorRows(register.operators)}<div style="display:flex;justify-content:space-between;gap:12px;padding-top:10px;font-size:15px;"><span>Total do caixa · ${Number(register.sales_count||0)} venda(s)</span><strong>${money(register.total)}</strong></div></section><hr><section><strong style="display:block;margin-bottom:7px;">Geral do dia · ${esc(dayLabel(day.date))}</strong>${operatorRows(day.operators)}<div style="display:flex;justify-content:space-between;gap:12px;padding-top:12px;font-size:17px;border-top:2px solid #111;margin-top:5px;"><span><strong>TOTAL GERAL DO DIA</strong><br><small>${Number(day.sales_count||0)} venda(s), somando toda a equipe</small></span><strong>${money(day.total)}</strong></div></section>`;
 sanitizeReceipt(root);modal.classList.add('open');modal.setAttribute('aria-hidden','false');pendingCloseReceipt=null;
}
function mountRegisterCloseReceipt(){
 const registerModal=$('registerModal');if(!registerModal)return;
 setRegisterClosedHandler(data=>{pendingCloseReceipt=data;setTimeout(()=>{if(pendingCloseReceipt&&!registerModal.classList.contains('open'))return;presentRegisterCloseReceipt(pendingCloseReceipt)},0)});
 new MutationObserver(()=>{if(pendingCloseReceipt&&registerModal.classList.contains('open'))presentRegisterCloseReceipt(pendingCloseReceipt)}).observe(registerModal,{attributes:true,attributeFilter:['class']});
}

export function initPdvUiPolicies(){
 applyBranding();mountSangriaUi();mountReceiptPrivacy();mountAdminViewer();mountRegisterCloseReceipt();
}
