const DB_NAME='nexcell-pdv-offline';
const DB_VERSION=1;
const CACHE='cache';
const QUEUE='sales_queue';
const ARCHIVE='sales_archive';
let dbPromise=null;

function openDb(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  if(!('indexedDB'in globalThis))return reject(new Error('Armazenamento offline não é suportado neste navegador.'));
  const request=indexedDB.open(DB_NAME,DB_VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(CACHE))db.createObjectStore(CACHE,{keyPath:'key'});
   if(!db.objectStoreNames.contains(QUEUE)){const store=db.createObjectStore(QUEUE,{keyPath:'id'});store.createIndex('status','status');store.createIndex('created_at','created_at');}
   if(!db.objectStoreNames.contains(ARCHIVE)){const store=db.createObjectStore(ARCHIVE,{keyPath:'id'});store.createIndex('synced_at','synced_at');}
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Não foi possível abrir o armazenamento offline.'));
 });
 return dbPromise;
}

async function transaction(storeName,mode,runner){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(storeName,mode);const store=tx.objectStore(storeName);let output;
  try{output=runner(store,tx)}catch(error){reject(error);return}
  tx.oncomplete=()=>resolve(output);
  tx.onerror=()=>reject(tx.error||new Error('Falha no armazenamento offline.'));
  tx.onabort=()=>reject(tx.error||new Error('Operação offline cancelada.'));
 });
}

function requestValue(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function announce(){if(typeof window==='undefined')return;getOfflineQueueSummary().then(detail=>window.dispatchEvent(new CustomEvent('nexcell:offline-queue-change',{detail}))).catch(()=>{})}

export async function putOfflineCache(key,value){await transaction(CACHE,'readwrite',store=>store.put({key,value,updated_at:new Date().toISOString()}));return value}
export async function getOfflineCache(key){const db=await openDb();const tx=db.transaction(CACHE,'readonly');return (await requestValue(tx.objectStore(CACHE).get(key)))?.value??null}
export const cacheCatalog=rows=>putOfflineCache('catalog',Array.isArray(rows)?rows:[]);
export const getCachedCatalog=()=>getOfflineCache('catalog');
export const cacheProfile=profile=>putOfflineCache('profile',profile||null);
export const getCachedProfile=()=>getOfflineCache('profile');
export const cacheRegisterState=state=>putOfflineCache('register_state',state||null);
export const getCachedRegisterState=()=>getOfflineCache('register_state');

export async function queueOfflineSale(record){
 if(!record?.id)throw new Error('Venda offline sem identificador.');
 const existing=await getQueuedSale(record.id);if(existing)return existing;
 const row={...record,status:'pending',attempts:0,last_error:null,created_at:record.created_at||new Date().toISOString(),updated_at:new Date().toISOString()};
 try{await transaction(QUEUE,'readwrite',store=>store.add(row))}catch(error){
  const duplicate=await getQueuedSale(record.id).catch(()=>null);if(duplicate)return duplicate;
  throw new Error(`Não foi possível guardar a venda neste aparelho: ${error?.message||'armazenamento local indisponível'}.`);
 }
 announce();return row;
}
export async function getQueuedSale(id){if(!id)return null;const db=await openDb();const tx=db.transaction(QUEUE,'readonly');return await requestValue(tx.objectStore(QUEUE).get(id))||null}
export async function listQueuedSales(){const db=await openDb();const tx=db.transaction(QUEUE,'readonly');const rows=await requestValue(tx.objectStore(QUEUE).getAll());return (rows||[]).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))}
export async function updateQueuedSale(id,patch){const current=await getQueuedSale(id);if(!current)return null;const next={...current,...patch,id,updated_at:new Date().toISOString()};await transaction(QUEUE,'readwrite',store=>store.put(next));announce();return next}
export async function retryQueuedSale(id){const current=await getQueuedSale(id);if(!current)return null;return updateQueuedSale(id,{status:'retry',last_error:null})}
export async function removeQueuedSale(id){await transaction(QUEUE,'readwrite',store=>store.delete(id));announce()}

async function archiveSyncedSale(row,result){
 const archived={...row,status:'synced',server_result:result,synced_at:new Date().toISOString()};await transaction(ARCHIVE,'readwrite',store=>store.put(archived));await removeQueuedSale(row.id);
 try{const db=await openDb();const tx=db.transaction(ARCHIVE,'readwrite');const store=tx.objectStore(ARCHIVE);const all=await requestValue(store.getAll());const extra=(all||[]).sort((a,b)=>String(b.synced_at).localeCompare(String(a.synced_at))).slice(500);extra.forEach(item=>store.delete(item.id))}catch(_){/* limpeza não impede sincronização */}
}

export async function getOfflineQueueSummary(){
 const rows=await listQueuedSales();return{total:rows.length,pending:rows.filter(row=>['pending','retry','syncing'].includes(row.status)).length,conflicts:rows.filter(row=>row.status==='conflict').length,rows}
}

function variantIndex(catalog){
 const map=new Map();for(const product of Array.isArray(catalog)?catalog:[]){for(const variant of Array.isArray(product.variants)?product.variants:[]){if(!variant?.variant_id)continue;map.set(String(variant.variant_id),{id:String(variant.variant_id),productName:product.product_name||'Produto',variantName:variant.option_1||variant.name||'Padrão',price:Number(variant.price)||0,available:Math.max(0,Number(variant.available_stock)||0)})}}return map
}
async function queuedQuantities(){const rows=await listQueuedSales();const totals=new Map();for(const row of rows){for(const item of row.payload?.items||[]){const id=String(item.variant_id||'');if(!id)continue;totals.set(id,(totals.get(id)||0)+Math.max(1,Number(item.quantity)||1))}}return totals}

export async function prepareOfflineSale(payload){
 const requestId=String(payload?.client_request_id||'').trim();if(!requestId)throw new Error('Venda sem identificador de sincronização.');
 const [catalog,registerState,alreadyQueued]=await Promise.all([getCachedCatalog(),getCachedRegisterState(),getQueuedSale(requestId)]);
 if(alreadyQueued)return alreadyQueued.offline_result;
 if(!Array.isArray(catalog)||!catalog.length)throw new Error('O catálogo ainda não foi sincronizado neste aparelho. Conecte à internet antes de usar o modo offline.');
 if(!registerState?.open||!registerState?.register?.code)throw new Error('Não existe um caixa aberto sincronizado neste aparelho. Não é seguro vender offline.');
 const operator=(registerState.operators||[]).find(item=>String(item.code)===String(payload.operator_code));if(!operator)throw new Error('O operador informado não está no último quadro sincronizado. Conecte à internet para atualizar os operadores.');
 const index=variantIndex(catalog);const pending=await queuedQuantities();const grouped=new Map();
 for(const item of payload.items||[]){const id=String(item.variant_id||'');if(!id)throw new Error('Item sem variação.');grouped.set(id,(grouped.get(id)||0)+Math.max(1,Number(item.quantity)||1))}if(!grouped.size)throw new Error('Carrinho vazio.');
 let subtotal=0;for(const[id,qty]of grouped){const variant=index.get(id);if(!variant)throw new Error('Um item do carrinho não está disponível no catálogo offline.');const localAvailable=variant.available-(pending.get(id)||0);if(localAvailable<qty)throw new Error(`Estoque offline insuficiente para ${variant.productName}. Disponível neste aparelho: ${Math.max(0,localAvailable)}.`);subtotal+=variant.price*qty}
 const discount=Math.max(0,Number(payload.discount)||0);if(discount>subtotal)throw new Error('Desconto maior que o subtotal.');
 const total=Number((subtotal-discount+Math.max(0,Number(payload.payment_fee)||0)).toFixed(2));
 const payments=Array.isArray(payload.payments)&&payload.payments.length?payload.payments:[{method:payload.payment_method||'PIX',amount:total,meta:payload.payment_meta||{}}];const paymentTotal=payments.reduce((sum,payment)=>sum+Math.max(0,Number(payment.amount)||0),0);if(Math.abs(paymentTotal-total)>0.01)throw new Error('A soma dos pagamentos não corresponde ao total da venda.');
 const result={id:`offline:${requestId}`,code:`OFF-${requestId.replace(/[^a-z0-9]/gi,'').slice(0,6).toUpperCase()||Date.now().toString().slice(-6)}`,status:'queued',offline_queued:true,saved:true,test_mode:false,operator_code:String(payload.operator_code),operator_name:operator.name||'Operador',register_code:registerState.register.code,settlement_status:'offline_pending',subtotal,discount,total,payments,customer_id:payload.customer_id||null,customer_name:payload.customer_name||'Cliente Balcão'};
 await queueOfflineSale({id:requestId,payload:{...payload,test_mode_expected:false},offline_result:result,register_code:registerState.register.code});return result;
}

export async function syncOfflineSales(sender,{isNetworkError}={}){
 const rows=await listQueuedSales();const report={synced:0,conflicts:0,pending:0};
 for(const row of rows){if(row.status==='conflict'){report.conflicts++;continue}try{await updateQueuedSale(row.id,{status:'syncing',attempts:Number(row.attempts||0)+1,last_error:null});const result=await sender(row.payload);await archiveSyncedSale(row,result);report.synced++}catch(error){if(isNetworkError?.(error)){await updateQueuedSale(row.id,{status:'retry',last_error:error?.message||'Sem conexão'});report.pending++;break}await updateQueuedSale(row.id,{status:'conflict',last_error:error?.message||'Conflito ao sincronizar'});report.conflicts++}}
 announce();return report;
}

export async function offlineStorageReady(){try{await openDb();return true}catch(_){return false}}
export async function requestOfflinePersistence(){
 try{if(!navigator?.storage?.persist)return false;return await navigator.storage.persist()}catch(_){return false}
}
