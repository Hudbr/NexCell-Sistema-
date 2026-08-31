import { searchCustomers } from './customer-api.js';
import { clearSelectedCustomer, getSelectedCustomer, onSelectedCustomerChange, setSelectedCustomer } from './customer-state.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const METHODS=['PIX','Dinheiro','Cartão de Débito','Cartão de Crédito'];

export function createCheckoutController({getTotal,onSummaryChange}={}){
 let timer=null;let searchToken=0;
 const body=$('paymentForm')?.querySelector('.modal-body');
 if(body&&!$('checkoutCustomerBlock')){
  const operator=$('saleOperatorCode')?.closest('.field');
  operator?.insertAdjacentHTML('afterend',`<div id="checkoutCustomerBlock" class="pdv-checkout-customer"><div class="field"><label for="saleCustomerSearch">Cliente <span class="pdv-optional">opcional</span></label><div class="pdv-inline-field"><input class="input" id="saleCustomerSearch" type="search" autocomplete="off" placeholder="Buscar cliente rapidamente"><button class="btn btn-secondary" id="clearSaleCustomer" type="button" hidden>Limpar</button></div><div id="saleCustomerResults" class="pdv-customer-results"></div><small id="saleCustomerSelected">Venda balcão.</small></div></div>`);
  const methodRow=$('paymentMethod')?.closest('.field-row');
  methodRow?.insertAdjacentHTML('afterend',`<section class="pdv-split-box"><label class="pdv-split-toggle"><span><strong>Pagamento misto</strong><small>Use duas ou mais formas na mesma venda.</small></span><input id="splitPaymentToggle" type="checkbox"></label><div id="splitPaymentPanel" class="pdv-split-panel" hidden>${METHODS.map(method=>`<label><span>${esc(method)}</span><input class="input" data-split-method="${esc(method)}" type="number" min="0" step="0.01" value="0.00"></label>`).join('')}<div class="pdv-split-credit" id="splitCreditOptions" hidden><label>Parcelas do crédito<select class="select" id="splitCreditInstallments"><option value="1">1x</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option><option value="5">5x</option><option value="6">6x</option><option value="10">10x</option><option value="12">12x</option></select></label></div><div class="pdv-split-status" id="splitPaymentStatus"></div></div></section>`);
 }

 function total(){return Math.max(0,Number(getTotal?.()||0))}
 function splitInputs(){return [...document.querySelectorAll('[data-split-method]')]}
 function splitRows(){return splitInputs().map(input=>({method:input.dataset.splitMethod,amount:Math.max(0,Number(input.value)||0)})).filter(row=>row.amount>0)}
 function updateCustomerUi(customer=getSelectedCustomer()){
  if($('saleCustomerSearch'))$('saleCustomerSearch').value=customer?.full_name||'';
  if($('clearSaleCustomer'))$('clearSaleCustomer').hidden=!customer;
  if($('saleCustomerResults'))$('saleCustomerResults').innerHTML='';
  if($('saleCustomerSelected'))$('saleCustomerSelected').textContent=customer?`${customer.full_name}${customer.phone?` · ${customer.phone}`:''}`:'Venda balcão.';
  onSummaryChange?.();
 }
 function updateSplitStatus(){const root=$('splitPaymentStatus');if(!root)return;const rows=splitRows();const sum=rows.reduce((acc,row)=>acc+row.amount,0);const remaining=total()-sum;root.className=`pdv-split-status ${Math.abs(remaining)<=0.01?'ok':remaining<0?'error':''}`;root.innerHTML=`<span>Distribuído <strong>${money(sum)}</strong></span><span>${Math.abs(remaining)<=0.01?'Pagamento fechado':remaining>0?`Falta ${money(remaining)}`:`Excedeu ${money(Math.abs(remaining))}`}</span>`;if($('splitCreditOptions'))$('splitCreditOptions').hidden=!rows.some(row=>row.method==='Cartão de Crédito');onSummaryChange?.()}
 function seedSplit(){splitInputs().forEach(input=>{input.value='0.00'});const first=splitInputs().find(input=>input.dataset.splitMethod==='PIX');if(first)first.value=total().toFixed(2);updateSplitStatus()}
 async function runSearch(query){const token=++searchToken;const root=$('saleCustomerResults');if(!root)return;if(!query||query.length<2){root.innerHTML='';return}root.innerHTML='<div class="pdv-searching">Buscando…</div>';try{const rows=await searchCustomers(query,8);if(token!==searchToken)return;root.innerHTML=rows.length?rows.map(row=>`<button type="button" data-checkout-customer="${esc(row.id)}" data-name="${esc(row.full_name)}" data-phone="${esc(row.phone||'')}" data-email="${esc(row.email||'')}"><span><strong>${esc(row.full_name)}</strong><small>${esc(row.phone||row.email||'Sem contato')}</small></span><b>Usar</b></button>`).join(''):'<div class="pdv-searching">Nenhum cliente encontrado. Cadastre na aba Clientes.</div>'}catch(error){if(token===searchToken)root.innerHTML=`<div class="pdv-searching">${esc(error.message||'Falha ao buscar')}</div>`}}

 $('saleCustomerSearch')?.addEventListener('input',event=>{const selected=getSelectedCustomer();if(selected&&event.target.value!==selected.full_name)clearSelectedCustomer();clearTimeout(timer);timer=setTimeout(()=>runSearch(event.target.value.trim()),180)});
 $('clearSaleCustomer')?.addEventListener('click',clearSelectedCustomer);
 $('splitPaymentToggle')?.addEventListener('change',event=>{const enabled=event.target.checked;$('splitPaymentPanel').hidden=!enabled;$('paymentMethod').closest('.field').style.display=enabled?'none':'';$('cashFields').hidden=true;$('installmentField').hidden=true;if(enabled)seedSplit();onSummaryChange?.()});
 splitInputs().forEach(input=>input.addEventListener('input',updateSplitStatus));
 document.addEventListener('click',event=>{const button=event.target.closest('[data-checkout-customer]');if(button)setSelectedCustomer({id:button.dataset.checkoutCustomer,full_name:button.dataset.name,phone:button.dataset.phone,email:button.dataset.email})});
 onSelectedCustomerChange(updateCustomerUi);

 return {
  reset({clearCustomer=false}={}){if(clearCustomer)clearSelectedCustomer();else updateCustomerUi();const toggle=$('splitPaymentToggle');if(toggle){toggle.checked=false;$('splitPaymentPanel').hidden=true;$('paymentMethod').closest('.field').style.display='';}splitInputs().forEach(input=>{input.value='0.00'});if($('splitPaymentStatus'))$('splitPaymentStatus').textContent='';},
  customer(){return getSelectedCustomer()},
  isSplit(){return Boolean($('splitPaymentToggle')?.checked)},
  refresh(){if(this.isSplit())updateSplitStatus()},
  collect({legacyMethod,legacyReceived,legacyInstallments}={}){
   const saleTotal=total();const customer=getSelectedCustomer();
   if(!this.isSplit()){
    const method=legacyMethod||'PIX';const received=Number(legacyReceived)||saleTotal;
    if(method==='Dinheiro'&&received<saleTotal)throw new Error('O valor recebido é menor que o total.');
    return {customer_id:customer?.id||null,customer_name:customer?.full_name||'Cliente Balcão',customer_phone:customer?.phone||'',payments:[{method,amount:saleTotal,meta:{installments:method==='Cartão de Crédito'?Number(legacyInstallments||1):1,cash_received:method==='Dinheiro'?received:saleTotal,change:method==='Dinheiro'?Math.max(0,received-saleTotal):0}}],label:method};
   }
   const rows=splitRows();if(rows.length<2)throw new Error('Pagamento misto precisa de pelo menos duas formas.');const sum=rows.reduce((acc,row)=>acc+row.amount,0);if(Math.abs(sum-saleTotal)>0.01)throw new Error(`Distribua exatamente ${money(saleTotal)} entre as formas de pagamento.`);
   const payments=rows.map(row=>({method:row.method,amount:Number(row.amount.toFixed(2)),meta:{installments:row.method==='Cartão de Crédito'?Number($('splitCreditInstallments')?.value||1):1}}));
   return {customer_id:customer?.id||null,customer_name:customer?.full_name||'Cliente Balcão',customer_phone:customer?.phone||'',payments,label:'Misto'};
  }
 }
}
