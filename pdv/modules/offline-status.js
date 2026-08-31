import { getOfflineStatus, syncOfflineNow } from '../supabase.js';
import { offlineStorageReady, requestOfflinePersistence, retryQueuedSale } from './offline-store.js';

const $=id=>document.getElementById(id);
let syncing=false;
let storageReady=null;
let persistentStorage=null;

async function mount(){
 storageReady=await offlineStorageReady();
 if(storageReady)persistentStorage=await requestOfflinePersistence();
 const actions=document.querySelector('.topbar-actions');
 if(actions&&!$('pdvConnectivity'))actions.insertAdjacentHTML('afterbegin','<button id="pdvConnectivity" type="button" class="clock-pill" style="cursor:pointer;border:1px solid var(--border);background:#fff;"><span class="status-dot"></span><span id="pdvConnectivityText">Conectando…</span></button>');
 if(!$('offlineQueueModal'))document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="offlineQueueModal"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="offlineQueueTitle"><div class="modal-header"><h2 id="offlineQueueTitle">Continuidade do PDV</h2><button class="icon-btn" type="button" data-offline-close>×</button></div><div class="modal-body"><div id="offlineQueueBody"></div></div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-offline-close>Fechar</button><button class="btn btn-primary" id="syncOfflineNow" type="button">Sincronizar agora</button></div></div></div>`);
 $('pdvConnectivity')?.addEventListener('click',openModal);
 $('syncOfflineNow')?.addEventListener('click',syncNow);
 document.addEventListener('click',async event=>{
  if(event.target.closest('[data-offline-close]'))closeModal();
  const retry=event.target.closest('[data-offline-retry]');
  if(retry){retry.disabled=true;await retryQueuedSale(retry.dataset.offlineRetry).catch(()=>{});await syncNow();retry.disabled=false;}
 });
 window.addEventListener('online',()=>{render();syncOfflineNow().then(render).catch(()=>{})});
 window.addEventListener('offline',render);
 window.addEventListener('nexcell:offline-queue-change',render);
 render();
}

async function syncNow(){
 if(syncing)return;syncing=true;const button=$('syncOfflineNow');if(button){button.disabled=true;button.textContent='Sincronizando…'}
 try{await syncOfflineNow()}finally{syncing=false;if(button)button.textContent='Sincronizar agora';await render()}
}
function openModal(){const modal=$('offlineQueueModal');modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');render()}
function closeModal(){const modal=$('offlineQueueModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true')}
function esc(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}

async function render(){
 let status={total:0,pending:0,conflicts:0,rows:[]};if(storageReady!==false){try{status=await getOfflineStatus()}catch(_){storageReady=false}}
 const online=navigator.onLine!==false;const controlled=Boolean(navigator.serviceWorker?.controller);const button=$('pdvConnectivity');const dot=button?.querySelector('.status-dot');const text=$('pdvConnectivityText');
 const contingencyReady=storageReady===true;
 if(dot){dot.classList.toggle('online',online&&status.conflicts===0&&contingencyReady);dot.style.background=!contingencyReady?'#dc2626':!online?'#dc2626':status.conflicts?'#d97706':''}
 if(text)text.textContent=!contingencyReady?'Offline indisponível':!online?`Offline${status.total?` · ${status.total} pendente(s)`:''}`:status.conflicts?`${status.conflicts} conflito(s)`:status.total?`${status.total} aguardando sync`:'Online';
 if(button)button.title=!contingencyReady?'Este navegador não conseguiu preparar o armazenamento local de contingência.':!online?'Somente vendas em Dinheiro podem ser registradas offline e ficam salvas neste aparelho.':status.total?'Existem vendas locais aguardando sincronização.':'Conectado ao servidor.';
 document.body.toggleAttribute('data-pdv-offline',!online);
 const root=$('offlineQueueBody');if(!root)return;const rows=Array.isArray(status.rows)?status.rows:[];
 const readiness=!contingencyReady?'<div class="auth-message show" style="margin-bottom:12px;color:var(--danger);"><strong>Contingência local indisponível.</strong><br>Não faça venda offline neste aparelho até o armazenamento local voltar a funcionar.</div>':!controlled?'<div class="auth-message show" style="margin-bottom:12px;"><strong>Primeira preparação do modo offline.</strong><br>O armazenamento já está pronto. O Service Worker passa a proteger também uma reabertura sem internet depois que a página for controlada pelo navegador.</div>':`<div class="auth-message show" style="margin-bottom:12px;"><strong>Contingência preparada.</strong><br>Dados operacionais ficam em IndexedDB${persistentStorage===true?' com solicitação de armazenamento persistente':''}; vendas pendentes não são apagadas depois de uma falha de sincronização.</div>`;
 root.innerHTML=`${readiness}<div class="auth-message show" style="margin-bottom:14px;"><strong>${online?'Rede disponível':'Sem conexão detectada'}</strong><br>${!online?'Venda presencial pode continuar somente em Dinheiro, usando dados já sincronizados. Sangria, fechamento, PIX, cartões, pedidos online e ajuste de estoque ficam bloqueados.':'Vendas guardadas offline são enviadas automaticamente quando possível.'}</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:14px;"><div class="card"><div class="card-body"><span class="stat-label">Na fila</span><strong style="display:block;font-size:20px;margin-top:4px;">${Number(status.total||0)}</strong></div></div><div class="card"><div class="card-body"><span class="stat-label">Aguardando</span><strong style="display:block;font-size:20px;margin-top:4px;">${Number(status.pending||0)}</strong></div></div><div class="card"><div class="card-body"><span class="stat-label">Conflitos</span><strong style="display:block;font-size:20px;margin-top:4px;">${Number(status.conflicts||0)}</strong></div></div></div>${rows.length?`<div style="display:grid;gap:8px;">${rows.map(row=>`<article style="padding:10px 12px;border:1px solid var(--border);border-radius:10px;"><div style="display:flex;justify-content:space-between;gap:10px;"><strong>${esc(row.offline_result?.code||'Venda offline')}</strong><span class="badge ${row.status==='conflict'?'badge-danger':'badge-warning'}">${row.status==='conflict'?'Revisar':'Aguardando'}</span></div><small style="display:block;margin-top:5px;">Operador #${esc(row.payload?.operator_code||'—')} · ${new Date(row.created_at).toLocaleString('pt-BR')}</small>${row.last_error?`<small style="display:block;margin-top:5px;color:var(--danger);">${esc(row.last_error)}</small>`:''}${row.status==='conflict'?`<button class="btn btn-secondary" style="margin-top:8px;" type="button" data-offline-retry="${esc(row.id)}">Tentar novamente após corrigir</button>`:''}</article>`).join('')}</div>`:'<div class="empty-state"><strong>Nenhuma venda pendente</strong><span>A fila local está sincronizada.</span></div>'}`;
 if($('syncOfflineNow'))$('syncOfflineNow').disabled=!online||syncing||!status.pending;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
