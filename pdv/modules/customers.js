import { getCustomerHistory, saveCustomer, searchCustomers } from './customer-api.js';
import { clearSelectedCustomer, getSelectedCustomer, setSelectedCustomer } from './customer-state.js';
import { iconMarkup } from './icons.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
let rows=[];

function renderSelected(customer=getSelectedCustomer()){
  const badge=$('selectedSaleCustomer');
  if(!badge)return;
  badge.innerHTML=customer
    ?`<span>Cliente</span><strong>${esc(customer.full_name)}</strong><button type="button" data-clear-sale-customer aria-label="Remover cliente">${iconMarkup('x')}</button>`
    :'<span>Cliente</span><strong>Balcão</strong>';
}

function mount(){
  const side=document.querySelector('.side-nav');
  const profile=side?.querySelector('[data-view="profile"]');
  if(side&&profile&&!side.querySelector('[data-view="customers"]'))profile.insertAdjacentHTML('beforebegin',`<button class="side-link" type="button" data-view="customers">${iconMarkup('users')}<span>Clientes</span></button>`);

  const mobile=document.querySelector('.mobile-nav');
  const mobileProfile=mobile?.querySelector('[data-view="profile"]');
  if(mobile&&mobileProfile&&!mobile.querySelector('[data-view="customers"]'))mobileProfile.insertAdjacentHTML('beforebegin',`<button class="mobile-link" type="button" data-view="customers">${iconMarkup('users')}<span>Clientes</span></button>`);

  const content=document.querySelector('.workspace-content');
  if(content&&!$('view-customers'))content.insertAdjacentHTML('beforeend',`<section class="workspace-view" id="view-customers">
    <div class="view-head"><div><h2>Clientes</h2><p>Cadastro rápido e histórico de compras.</p></div><button class="btn btn-primary" id="newCustomer" type="button">Novo cliente</button></div>
    <div class="pdv-customer-grid">
      <article class="card"><div class="card-body"><input class="input" id="customerSearch" type="search" placeholder="Buscar por nome, telefone ou e-mail"><div id="customerList" class="pdv-customer-list"></div></div></article>
      <article class="card"><div class="card-head"><h3 id="customerDetailTitle">Selecione um cliente</h3></div><div class="card-body" id="customerDetail"><div class="empty-state"><strong>Histórico do cliente</strong><span>Selecione alguém na lista.</span></div></div></article>
    </div>
  </section>`);

  if(!$('customerModal'))document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="customerModal"><div class="modal-card" role="dialog" aria-modal="true">
    <div class="modal-header"><h2 id="customerModalTitle">Novo cliente</h2><button class="icon-btn" type="button" data-customer-close aria-label="Fechar">${iconMarkup('x')}</button></div>
    <form id="customerForm"><input type="hidden" id="customerId"><div class="modal-body">
      <div class="field"><label for="customerName">Nome</label><input class="input" id="customerName" required maxlength="120"></div>
      <div class="field-row"><div class="field"><label for="customerPhone">Telefone</label><input class="input" id="customerPhone" inputmode="tel"></div><div class="field"><label for="customerEmail">E-mail</label><input class="input" id="customerEmail" type="email"></div></div>
      <div class="field"><label for="customerNotes">Observação</label><textarea class="input" id="customerNotes" rows="3"></textarea></div>
    </div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-customer-close>Cancelar</button><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form>
  </div></div>`);

  const paymentBody=$('paymentForm')?.querySelector('.modal-body');
  if(paymentBody&&!$('selectedSaleCustomer'))paymentBody.insertAdjacentHTML('afterbegin','<div id="selectedSaleCustomer" class="pdv-selected-customer"><span>Cliente</span><strong>Balcão</strong></div>');
  wire();
  renderSelected();
  window.addEventListener('nexcell:customer-selected',event=>renderSelected(event.detail));
}

async function load(query=''){
  const root=$('customerList');if(!root)return;
  root.innerHTML='<div class="empty-state"><span>Buscando…</span></div>';
  try{
    rows=await searchCustomers(query,30);
    root.innerHTML=rows.length?rows.map(row=>`<button class="pdv-customer-row" type="button" data-customer-id="${esc(row.id)}"><span><strong>${esc(row.full_name)}</strong><small>${esc(row.phone||row.email||'Sem contato')}</small></span><b>Ver histórico</b></button>`).join(''):'<div class="empty-state"><strong>Nenhum cliente</strong><span>Cadastre o primeiro cliente.</span></div>';
  }catch(error){root.innerHTML=`<div class="empty-state"><strong>Falha ao carregar</strong><span>${esc(error.message)}</span></div>`}
}

async function showCustomer(id){
  const row=rows.find(item=>item.id===id);if(!row)return;
  $('customerDetailTitle').textContent=row.full_name;
  const root=$('customerDetail');root.innerHTML='<div class="empty-state"><span>Carregando histórico…</span></div>';
  try{
    const history=await getCustomerHistory(id,30);
    const orders=Array.isArray(history.orders)?history.orders:[];
    const summary=history.summary||{};
    root.innerHTML=`<div class="pdv-customer-summary"><div><span>Telefone</span><strong>${esc(row.phone||'—')}</strong></div><div><span>E-mail</span><strong>${esc(row.email||'—')}</strong></div><div><span>Compras concluídas</span><strong>${Number(summary.completed_sales||0)}</strong></div><div><span>Total comprado</span><strong>${money(summary.total_spent||0)}</strong></div></div>
      <div class="pdv-customer-history">${orders.length?orders.map(order=>`<div><span><strong>#${esc(order.code||'—')}</strong><small>${date(order.created_at)} · ${esc(order.payment_method||'')} · ${esc(order.status||'')}</small></span><b>${money(order.total)}</b></div>`).join(''):'<div class="empty-state"><span>Sem compras registradas.</span></div>'}</div>
      <div class="pdv-customer-actions"><button class="btn btn-primary" type="button" data-use-customer="${esc(row.id)}">Usar na próxima venda</button><button class="btn btn-secondary" type="button" data-edit-customer="${esc(row.id)}">Editar cadastro</button></div>`;
  }catch(error){root.innerHTML=`<div class="empty-state"><strong>Falha no histórico</strong><span>${esc(error.message)}</span></div>`}
}

function openEditor(row=null){
  $('customerModalTitle').textContent=row?'Editar cliente':'Novo cliente';
  $('customerId').value=row?.id||'';$('customerName').value=row?.full_name||'';$('customerPhone').value=row?.phone||'';$('customerEmail').value=row?.email||'';$('customerNotes').value=row?.notes||'';
  $('customerModal').classList.add('open');$('customerModal').setAttribute('aria-hidden','false');
}
function closeEditor(){$('customerModal')?.classList.remove('open');$('customerModal')?.setAttribute('aria-hidden','true')}

function wire(){
  let timer=null;
  $('customerSearch')?.addEventListener('input',event=>{clearTimeout(timer);timer=setTimeout(()=>load(event.target.value.trim()),180)});
  document.addEventListener('click',event=>{
    const view=event.target.closest('[data-view="customers"]');if(view)setTimeout(()=>load($('customerSearch')?.value||''),0);
    const select=event.target.closest('[data-customer-id]');if(select)showCustomer(select.dataset.customerId);
    const edit=event.target.closest('[data-edit-customer]');if(edit)openEditor(rows.find(row=>row.id===edit.dataset.editCustomer));
    const use=event.target.closest('[data-use-customer]');if(use){setSelectedCustomer(rows.find(row=>row.id===use.dataset.useCustomer)||null);document.querySelector('[data-view="sale"]')?.click()}
    if(event.target.closest('[data-clear-sale-customer]'))clearSelectedCustomer();
    if(event.target.closest('[data-customer-close]'))closeEditor();
  });
  $('newCustomer')?.addEventListener('click',()=>openEditor());
  $('customerForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter;button.disabled=true;
    try{
      const idBefore=$('customerId').value||null;
      const saved=await saveCustomer({id:idBefore,fullName:$('customerName').value,phone:$('customerPhone').value,email:$('customerEmail').value,notes:$('customerNotes').value});
      closeEditor();await load($('customerSearch')?.value||'');
      const id=saved?.id||idBefore;if(id)showCustomer(id);
    }catch(error){alert(error.message||'Não foi possível salvar o cliente.')}finally{button.disabled=false}
  });
}

export { getSelectedCustomer } from './customer-state.js';
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();