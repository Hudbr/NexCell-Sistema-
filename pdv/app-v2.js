import './app.js';
import { createCheckoutController } from './modules/checkout.js';
import { createSale } from './supabase.js';
import { escapeHtml, formatMoney, setBusy, toast } from '../assets/js/utils.js';

const $=id=>document.getElementById(id);
const moneyNumber=value=>{
 const clean=String(value||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');
 return Number(clean)||0;
};
const subtotal=()=>moneyNumber($('saleSubtotal')?.textContent);
const discount=()=>Math.min(subtotal(),Math.max(0,Number($('saleDiscount')?.value)||0));
const total=()=>Math.max(0,subtotal()-discount());

const checkout=createCheckoutController({getTotal:total,onSummaryChange:()=>renderExtendedSummary()});
let activeQuoteId=sessionStorage.getItem('nexcell.pdv.activeQuote')||null;

function cartItems(){
 const seen=new Set();const rows=[];
 document.querySelectorAll('#saleCart .pdv-cart-item').forEach(article=>{
  const control=article.querySelector('[data-cart-key]');const key=control?.dataset.cartKey||'';if(!key||seen.has(key))return;seen.add(key);
  const parts=key.split('::');const variantId=parts.at(-1);const qty=Math.max(1,Number(article.querySelector('.qty-control span')?.textContent)||1);
  if(variantId)rows.push({variant_id:variantId,quantity:qty});
 });
 return rows;
}
function receiptItems(){return [...document.querySelectorAll('#saleCart .pdv-cart-item')].map(article=>({name:article.querySelector('h4')?.textContent||'Produto',detail:article.querySelector('p')?.textContent||'',qty:Number(article.querySelector('.qty-control span')?.textContent)||1,total:article.querySelector('.pdv-cart-price')?.textContent||''}))}
function clearLegacyCart(){[...document.querySelectorAll('#saleCart .remove-item')].forEach(button=>button.click())}
function setModal(id,open){const node=$(id);if(!node)return;node.classList.toggle('open',open);node.setAttribute('aria-hidden',open?'false':'true')}
function paymentLabel(payments){return payments.map(row=>`${row.method} ${formatMoney(row.amount)}`).join(' + ')}
function renderExtendedSummary(){
 const root=$('paymentSummary');if(!root)return;
 const customer=checkout.customer();
 const extra=customer?`<div><span>Cliente</span><strong>${escapeHtml(customer.full_name)}</strong></div>`:'';
 if(extra&&!root.querySelector('[data-customer-summary]'))root.insertAdjacentHTML('beforeend',`<div data-customer-summary>${extra}</div>`);
 else if(!customer)root.querySelector('[data-customer-summary]')?.remove();
}
function renderReceipt(result,items,paymentData){
 const root=$('receiptContent');if(!root)return;
 $('receiptTitle').textContent=result.test_mode?'Venda simulada':'Venda concluída';
 root.innerHTML=`<div style="text-align:center;"><strong>Nexcell</strong><p>Venda #${escapeHtml(result.code||'TESTE')}</p>${result.test_mode?'<small>MODO TESTE · nada foi gravado</small>':''}</div><hr><div>${items.map(item=>`<div style="display:flex;justify-content:space-between;gap:12px;margin:6px 0;"><span>${item.qty}× ${escapeHtml(item.name)}<small style="display:block;">${escapeHtml(item.detail)}</small></span><strong>${escapeHtml(item.total)}</strong></div>`).join('')}</div><hr><div style="display:grid;gap:5px;"><div style="display:flex;justify-content:space-between;"><span>Total</span><strong>${formatMoney(result.total)}</strong></div><div style="display:flex;justify-content:space-between;gap:12px;"><span>Pagamento</span><strong style="text-align:right;">${escapeHtml(paymentLabel(paymentData.payments))}</strong></div>${paymentData.customer_id?`<div style="display:flex;justify-content:space-between;"><span>Cliente</span><strong>${escapeHtml(paymentData.customer_name)}</strong></div>`:''}<div style="display:flex;justify-content:space-between;"><span>Operador</span><strong>#${escapeHtml(result.operator_code||'—')}</strong></div></div>`;
}

document.addEventListener('click',event=>{
 const resume=event.target.closest('[data-resume-quote]');
 if(resume){activeQuoteId=resume.dataset.resumeQuote;sessionStorage.setItem('nexcell.pdv.activeQuote',activeQuoteId)}
 const customerView=event.target.closest('[data-view="customers"]');
 if(customerView)setTimeout(()=>{if($('viewTitle'))$('viewTitle').textContent='Clientes';if($('viewSubtitle'))$('viewSubtitle').textContent='Cadastro rápido e histórico de compras.'},0);
},true);

$('openPayment')?.addEventListener('click',()=>{checkout.reset();setTimeout(renderExtendedSummary,0)});
$('saleDiscount')?.addEventListener('input',()=>checkout.refresh());

$('paymentForm')?.addEventListener('submit',async event=>{
 const hasCustomer=Boolean(checkout.customer()?.id);const split=checkout.isSplit();
 if(!hasCustomer&&!split)return;
 event.preventDefault();event.stopImmediatePropagation();
 const items=cartItems();if(!items.length)return toast('Carrinho vazio.','error');
 const operatorCode=$('saleOperatorCode')?.value.trim();if(!operatorCode)return toast('Informe o código de quem está vendendo.','error');
 let paymentData;
 try{paymentData=checkout.collect({legacyMethod:$('paymentMethod')?.value,legacyReceived:$('cashReceived')?.value,legacyInstallments:$('installments')?.value})}catch(error){return toast(error.message,'error')}
 const snapshots=receiptItems();const button=$('finishSale');
 const payload={operator_code:operatorCode,customer_id:paymentData.customer_id,customer_name:paymentData.customer_name,customer_phone:paymentData.customer_phone,discount:discount(),payment_method:paymentData.label,payments:paymentData.payments,quote_id:activeQuoteId||null,items};
 setBusy(button,true,'Registrando…');
 try{
  const result=await createSale(payload);renderReceipt(result,snapshots,paymentData);clearLegacyCart();activeQuoteId=null;sessionStorage.removeItem('nexcell.pdv.activeQuote');setModal('paymentModal',false);setModal('receiptModal',true);toast(result.test_mode?'Venda simulada. Nenhum dado foi salvo.':'Venda concluída.','success');
  window.dispatchEvent(new CustomEvent('nexcell:pdv-sale-complete',{detail:{result}}));
 }catch(error){toast(error?.message||'Não foi possível concluir a venda.','error')}
 finally{setBusy(button,false)}
},true);

window.addEventListener('nexcell:pdv-sale-complete',()=>{checkout.reset({clearCustomer:true})});
window.addEventListener('load',()=>import('./modules/mobile-nav.js').catch(error=>console.warn('Menu mobile',error)),{once:true});
