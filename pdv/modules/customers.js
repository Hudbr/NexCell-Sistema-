import { getSupabase } from '../supabase.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=value=>value?new Date(value).toLocaleString('pt-BR'):'—';

async function rpc(name,args={}){const client=await getSupabase();const{data,error}=await client.rpc(name,args);if(error)throw error;return data}
const searchCustomers=(query='')=>rpc('search_pdv_customers',{p_query:query,p_limit:30});
const saveCustomer=payload=>rpc('save_pdv_customer',{p_id:payload.id||null,p_full_name:payload.fullName,p_phone:payload.phone||null,p_email:payload.email||null,p_notes:payload.notes||null});
const getHistory=id=>rpc('get_pdv_customer_history',{p_customer_id:id,p_limit:30});

function mount(){
 const side=document.querySelector('.side-nav');
 const profile=side?.querySelector('[data-view="profile"]');
 if(side&&profile&&!side.querySelector('[data-view="customers"]')) profile.insertAdjacentHTML('beforebegin','<button class="side-link" type="button" data-view="customers"><span>👥</span>Clientes</button>');
 const mobile=document.querySelector('.mobile-nav');
 const mobileProfile=mobile?.querySelector('[data-view="profile"]');
 if(mobile&&mobileProfile&&!mobile.querySelector('[data-view="customers"]')) mobileProfile.insertAdjacentHTML('beforebegin','<button class="mobile-link" type="button" data-view="customers"><span>👥</span><span>Clientes</span></button>');
 const content=document.querySelector('.workspace-content');
 if(content&&!$('view-customers')) content.insertAdjacentHTML('beforeend',`<section class="workspace-view" id="view-customers">
  <div class="view-head"><div><h2>Clientes</h2><p>Cadastro rápido e histórico de compras sem poluir a tela de venda.</p></div><button class="btn btn-primary" id="newCustomer" type="button">Novo cliente</button></div>
  <div class="pdv-customer-grid"><article class="card"><div class="card-body"><input class="input" id="customerSearch" type="search" placeholder="Buscar por nome, telefone ou e-mail"><div id="customerList" class="pdv-customer-list"></div></div></article><article class="card"><div class="card-head"><h3 id="customerDetailTitle">Selecione um cliente</h3></div><div class="card-body" id="customerDetail"><div class="empty-state"><strong>Histórico do cliente</strong><span>Selecione alguém na lista.</span></div></div></article></div>
 </section>`);
 if(!$('customerModal')) document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="customerModal"><div class="modal-card" role="dialog" aria-modal="true"><div class="modal-header"><h2 id="customerModalTitle">Novo cliente</h2><button class="icon-btn" type="button" data-customer-close>×</button></div><form id="customerForm"><input type="hidden" id="customerId"><div class="modal-body"><div class="field"><label for="customerName">Nome</label><input class="input" id="customerName" required maxlength="120"></div><div class="field-row"><div class="field"><label for="customerPhone">Telefone</label><input class="input" id="customerPhone" inputmode="tel"></div><div class="field"><label for="customerEmail">E-mail</label><input class="input" id="customerEmail" type="email"></div></div><div class="field"><label for="customerNotes">Observação</label><textarea class="input" id="customerNotes" rows="3"></textarea></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-customer-close>Cancelar</button><button class="btn btn-primary" type="submit">Salvar cliente</button></div></form></div></div>`);
 wire();
}

let rows=[];
async function load(query=''){const root=$('customerList');if(!root)return;root.innerHTML='<div class="empty-state"><span>Buscando…</span></div>';try{rows=await searchCustomers(query)||[];root.innerHTML=rows.length?rows.map(row=>`<button class="pdv-customer-row" type="button" data-customer-id="${esc(row.id)}"><span><strong>${esc(row.full_name)}</strong><small>${esc(row.phone||row.email||'Sem contato')}</small></span><b>${Number(row.orders_count||0)} compra(s)</b></button>`).join(''):'<div class="empty-state"><strong>Nenhum cliente</strong><span>Cadastre o primeiro cliente.</span></div>'}catch(error){root.innerHTML=`<div class="empty-state"><strong>Falha ao carregar</strong><span>${esc(error.message)}</span></div>`}}
async function showCustomer(id){const row=rows.find(item=>item.id===id);if(!row)return;$('customerDetailTitle').textContent=row.full_name;const root=$('customerDetail');root.innerHTML='<div class="empty-state"><span>Carregando histórico…</span></div>';try{const history=await getHistory(id)||{};const sales=Array.isArray(history.sales)?history.sales:Array.isArray(history)?history:[];root.innerHTML=`<div class="pdv-customer-summary"><div><span>Telefone</span><strong>${esc(row.phone||'—')}</strong></div><div><span>E-mail</span><strong>${esc(row.email||'—')}</strong></div><div><span>Compras</span><strong>${Number(history.orders_count??row.orders_count??sales.length)}</strong></div><div><span>Total</span><strong>${money(history.total_spent||0)}</strong></div></div><div class="pdv-customer-history">${sales.length?sales.map(s=>`<div><span><strong>#${esc(s.code||'—')}</strong><small>${date(s.processed_at||s.created_at)} · ${esc(s.payment_method||'')}</small></span><b>${money(s.total)}</b></div>`).join(''):'<div class="empty-state"><span>Sem compras registradas.</span></div>'}</div><button class="btn btn-secondary" type="button" data-edit-customer="${esc(row.id)}" style="margin-top:12px;">Editar cadastro</button>`}catch(error){root.innerHTML=`<div class="empty-state"><strong>Falha no histórico</strong><span>${esc(error.message)}</span></div>`}}
function openEditor(row=null){$('customerModalTitle').textContent=row?'Editar cliente':'Novo cliente';$('customerId').value=row?.id||'';$('customerName').value=row?.full_name||'';$('customerPhone').value=row?.phone||'';$('customerEmail').value=row?.email||'';$('customerNotes').value=row?.notes||'';$('customerModal').classList.add('open');$('customerModal').setAttribute('aria-hidden','false')}
function closeEditor(){$('customerModal')?.classList.remove('open');$('customerModal')?.setAttribute('aria-hidden','true')}
function wire(){
 let timer=null;$('customerSearch')?.addEventListener('input',event=>{clearTimeout(timer);timer=setTimeout(()=>load(event.target.value.trim()),180)});
 document.addEventListener('click',event=>{const view=event.target.closest('[data-view="customers"]');if(view){setTimeout(()=>load($('customerSearch')?.value||''),0)}const select=event.target.closest('[data-customer-id]');if(select)showCustomer(select.dataset.customerId);const edit=event.target.closest('[data-edit-customer]');if(edit)openEditor(rows.find(row=>row.id===edit.dataset.editCustomer));if(event.target.closest('[data-customer-close]'))closeEditor()});
 $('newCustomer')?.addEventListener('click',()=>openEditor());
 $('customerForm')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const saved=await saveCustomer({id:$('customerId').value||null,fullName:$('customerName').value.trim(),phone:$('customerPhone').value.trim(),email:$('customerEmail').value.trim(),notes:$('customerNotes').value.trim()});closeEditor();await load($('customerSearch')?.value||'');const id=saved?.id||$('customerId').value;if(id)showCustomer(id)}catch(error){alert(error.message||'Não foi possível salvar o cliente.')}finally{button.disabled=false}});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
