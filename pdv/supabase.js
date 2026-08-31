import {
  cacheCatalog,cacheProfile,cacheRegisterState,getCachedCatalog,getCachedProfile,getCachedRegisterState,
  getOfflineQueueSummary,offlineStorageReady,prepareOfflineSale,syncOfflineSales
} from './modules/offline-store.js';

const SUPABASE_URL='https://phhncvufnufroyifaghe.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_OqKmeAMX4B_9rAgFpOzwig_qwN3WZxL';
const SUPABASE_MODULE='https://esm.sh/@supabase/supabase-js@2.57.4';

let activeUserId=null;
let cachedProfile=null;
let cachedProfileUserId=null;
let profilePromise=null;
let profilePromiseUserId=null;
let sangriaPasswordProvider=()=>'';
let registerClosedHandler=null;
let syncPromise=null;

const clientPromise=import(SUPABASE_MODULE).then(({createClient})=>createClient(
  SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,
  {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}
));

export async function getSupabase(){return clientPromise}
function fail(error){if(error)throw error}
export function isNetworkError(error){
 const raw=String(error?.message||error||'').toLowerCase();
 return (typeof navigator!=='undefined'&&navigator.onLine===false)||error instanceof TypeError||raw.includes('failed to fetch')||raw.includes('network')||raw.includes('load failed')||raw.includes('networkerror')||raw.includes('fetch failed');
}
function offlineOnlyMessage(action){return new Error(`${action} exige conexão com o servidor para evitar divergência de caixa ou estoque.`)}
function rememberUser(session){
 const next=session?.user?.id||null;
 if(next!==activeUserId){activeUserId=next;cachedProfile=null;cachedProfileUserId=null;profilePromise=null;profilePromiseUserId=null}
}

export async function getSession(){const client=await getSupabase();const{data,error}=await client.auth.getSession();fail(error);rememberUser(data.session);return data.session}
export function onAuthChange(callback){
 let subscription=null,disposed=false;
 getSupabase().then(client=>{
  if(disposed)return;
  const result=client.auth.onAuthStateChange((event,session)=>{rememberUser(session);if(event==='INITIAL_SESSION')return;callback(event,session)});
  subscription=result?.data?.subscription||null;
 }).catch(error=>console.error('Falha ao iniciar autenticação',error));
 return{unsubscribe(){disposed=true;subscription?.unsubscribe?.()}}
}
export async function signIn(email,password){const client=await getSupabase();const{data,error}=await client.auth.signInWithPassword({email,password});fail(error);rememberUser(data.session);return data.session}
export async function signOut(){const client=await getSupabase();const{error}=await client.auth.signOut();fail(error);rememberUser(null)}
export async function requestStaffAccess({fullName,email,password}){const client=await getSupabase();const{data,error}=await client.functions.invoke('staff-register',{body:{fullName,email,password}});fail(error);if(!data?.ok)throw new Error(data?.error||'Não foi possível criar o cadastro.');return signIn(email,password)}
export async function resetPassword(email){const client=await getSupabase();const{error}=await client.auth.resetPasswordForEmail(email);fail(error)}

export async function getOperationalProfile(){
 if(cachedProfile&&cachedProfileUserId===activeUserId)return cachedProfile;
 if(profilePromise&&profilePromiseUserId===activeUserId)return profilePromise;
 const userIdAtStart=activeUserId;profilePromiseUserId=userIdAtStart;
 profilePromise=(async()=>{
  try{
   const client=await getSupabase();const{data,error}=await client.rpc('get_my_operational_profile');fail(error);
   if(activeUserId===userIdAtStart){cachedProfile=data;cachedProfileUserId=userIdAtStart;cacheProfile(data).catch(()=>{})}
   return data;
  }catch(error){
   if(!isNetworkError(error))throw error;
   const local=await getCachedProfile().catch(()=>null);if(!local)throw error;
   cachedProfile={...local,offline_cached:true};cachedProfileUserId=userIdAtStart;return cachedProfile;
  }
 })();
 try{return await profilePromise}finally{if(profilePromiseUserId===userIdAtStart){profilePromise=null;profilePromiseUserId=null}}
}

export async function listCatalog(){
 try{const client=await getSupabase();const{data,error}=await client.rpc('list_pdv_catalog');fail(error);const rows=Array.isArray(data)?data:[];cacheCatalog(rows).catch(()=>{});return rows}
 catch(error){if(!isNetworkError(error))throw error;const rows=await getCachedCatalog().catch(()=>null);if(!Array.isArray(rows))throw error;return rows}
}

async function rawCreateSale(payload){const client=await getSupabase();const{data,error}=await client.rpc('create_pdv_sale',{payload});fail(error);return data}
function offlineTestResult(payload){
 const payments=Array.isArray(payload.payments)?payload.payments:[];const total=payments.reduce((sum,row)=>sum+Math.max(0,Number(row.amount)||0),0);
 return{id:null,code:'TESTE',status:'completed',operator_code:String(payload.operator_code||'—'),operator_name:'Operador',register_code:'01',settlement_status:'test',subtotal:total+Math.max(0,Number(payload.discount)||0),discount:Math.max(0,Number(payload.discount)||0),total,payments,test_mode:true,saved:false,offline_simulation:true};
}
export async function createSale(payload){
 try{
  const result=await rawCreateSale(payload);
  if(typeof navigator==='undefined'||navigator.onLine!==false)setTimeout(()=>syncOfflineNow().catch(()=>{}),300);
  return result;
 }catch(error){
  if(!isNetworkError(error))throw error;
  if(payload?.test_mode_expected===true)return offlineTestResult(payload);
  return prepareOfflineSale(payload);
 }
}

export async function listSales(onlyPendingSettlement=false,limit=300){const client=await getSupabase();const{data,error}=await client.rpc('list_pdv_sales',{p_only_pending_settlement:Boolean(onlyPendingSettlement),p_limit:Number(limit)||300});fail(error);return Array.isArray(data)?data:[]}
export async function cancelSale(saleId,reason){const client=await getSupabase();const{data,error}=await client.rpc('cancel_pdv_sale',{p_sale_id:saleId,p_reason:String(reason||'').trim()});if(error&&isNetworkError(error))throw offlineOnlyMessage('Cancelar venda');fail(error);return data}
export async function getDashboard(from=null,to=null){const client=await getSupabase();const{data,error}=await client.rpc('get_pdv_dashboard',{p_from:from,p_to:to});fail(error);return data||{}}
export async function createQuote(payload){const client=await getSupabase();const{data,error}=await client.rpc('create_pdv_quote',{payload});if(error&&isNetworkError(error))throw offlineOnlyMessage('Salvar orçamento');fail(error);return data}
export async function listQuotes(includeClosed=false){const client=await getSupabase();const{data,error}=await client.rpc('list_pdv_quotes',{p_include_closed:includeClosed});fail(error);return Array.isArray(data)?data:[]}
export async function cancelQuote(quoteId){const client=await getSupabase();const{data,error}=await client.rpc('cancel_pdv_quote',{p_quote_id:quoteId});if(error&&isNetworkError(error))throw offlineOnlyMessage('Cancelar orçamento');fail(error);return data}

export async function openRegister(){
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Abrir ou reabrir caixa');
 const client=await getSupabase();const{data,error}=await client.rpc('open_pdv_register',{p_opening_float:0});if(error&&isNetworkError(error))throw offlineOnlyMessage('Abrir ou reabrir caixa');fail(error);return data
}
export async function getRegisterState(){
 try{const client=await getSupabase();const{data,error}=await client.rpc('get_pdv_register_state');fail(error);cacheRegisterState(data).catch(()=>{});return data}
 catch(error){if(!isNetworkError(error))throw error;const local=await getCachedRegisterState().catch(()=>null);if(!local)throw error;return{...local,offline_cached:true}}
}
export async function resolveOperator(code){
 const clean=String(code||'').trim();
 try{const client=await getSupabase();const{data,error}=await client.rpc('resolve_pdv_operator',{p_operator_code:clean});fail(error);return data}
 catch(error){
  if(!isNetworkError(error))throw error;const state=await getCachedRegisterState().catch(()=>null);const row=(state?.operators||[]).find(item=>String(item.code)===clean);
  if(!row)throw new Error('Operador não encontrado no último quadro sincronizado.');return{code:row.code,name:row.name,role:row.role,offline_cached:true};
 }
}

async function verifyCurrentPassword(password){
 const clean=String(password||'');if(!clean)throw new Error('Informe sua senha para confirmar a sangria.');
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Sangria');
 const client=await getSupabase();const{data:userData,error:userError}=await client.auth.getUser();fail(userError);const currentUser=userData?.user;
 if(!currentUser?.email||!currentUser?.id)throw new Error('Sessão inválida. Entre novamente no PDV.');
 const{createClient}=await import(SUPABASE_MODULE);const verifier=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const{data,error}=await verifier.auth.signInWithPassword({email:currentUser.email,password:clean});
 if(error){if(String(error.message||'').toLowerCase().includes('invalid login credentials'))throw new Error('Senha incorreta.');throw error}
 try{if(data?.user?.id!==currentUser.id)throw new Error('A senha não pertence à conta que está logada.')}finally{try{await verifier.auth.signOut()}catch(_){}}
}
export function setSangriaPasswordProvider(provider){sangriaPasswordProvider=typeof provider==='function'?provider:()=>''}
export async function closeOperatorCash({targetCode,cash,pix,credit,debit,notes}){
 const password=sangriaPasswordProvider();await verifyCurrentPassword(password);const profile=await getOperationalProfile();const actor=String(profile?.operator_code||'').trim();if(!actor)throw new Error('Sua conta não possui código operacional válido.');
 const client=await getSupabase();const{data,error}=await client.rpc('close_operator_cash',{p_actor_code:actor,p_target_code:String(targetCode||actor).trim(),p_declared_cash:Number(cash)||0,p_declared_pix:Number(pix)||0,p_declared_card_credit:Number(credit)||0,p_declared_card_debit:Number(debit)||0,p_fiscal_document_number:null,p_notes:String(notes||'').trim()||null});if(error&&isNetworkError(error))throw offlineOnlyMessage('Sangria');fail(error);return data
}
export function setRegisterClosedHandler(handler){registerClosedHandler=typeof handler==='function'?handler:null}
export async function closeRegister(actorCode,notes=''){
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Fechar caixa');
 const client=await getSupabase();const{data,error}=await client.rpc('close_pdv_register',{p_actor_code:String(actorCode||'').trim(),p_notes:String(notes||'').trim()||null});if(error&&isNetworkError(error))throw offlineOnlyMessage('Fechar caixa');fail(error);registerClosedHandler?.(data);return data
}

export async function listOnlineOrders(includeResolved=false){const client=await getSupabase();const{data,error}=await client.rpc('list_pdv_online_orders',{p_include_resolved:includeResolved});fail(error);return Array.isArray(data)?data:[]}
export async function completeOnlineOrder(orderId,operatorCode,note=''){
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Concluir pedido online');
 const client=await getSupabase();const{data,error}=await client.rpc('complete_online_order',{p_order_id:orderId,p_note:String(note||'').trim()||null,p_operator_code:String(operatorCode||'').trim()});if(error&&isNetworkError(error))throw offlineOnlyMessage('Concluir pedido online');fail(error);return data
}
export async function cancelOnlineOrder(orderId,reason=''){
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Cancelar pedido online');
 const client=await getSupabase();const{data,error}=await client.rpc('cancel_online_order',{p_order_id:orderId,p_reason:String(reason||'').trim()||null});if(error&&isNetworkError(error))throw offlineOnlyMessage('Cancelar pedido online');fail(error);return data
}
export async function adjustStock(operatorCode,variantId,delta,reason='Ajuste no PDV',note=''){
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw offlineOnlyMessage('Ajustar estoque');
 const client=await getSupabase();const{data,error}=await client.rpc('pdv_adjust_stock',{p_actor_code:String(operatorCode||'').trim(),p_variant_id:variantId,p_delta:Number(delta),p_reason:String(reason||'Ajuste no PDV'),p_note:String(note||'').trim()||null});if(error&&isNetworkError(error))throw offlineOnlyMessage('Ajustar estoque');fail(error);return data
}

export async function getStorefrontSettings(){const client=await getSupabase();const{data,error}=await client.from('storefront_settings').select('store_name, whatsapp, footer_text').eq('id',1).maybeSingle();fail(error);return data}

export async function getOfflineStatus(){return getOfflineQueueSummary()}
export async function syncOfflineNow(){
 if(syncPromise)return syncPromise;
 if(typeof navigator!=='undefined'&&navigator.onLine===false)return{synced:0,pending:(await getOfflineQueueSummary()).total,conflicts:0,offline:true};
 syncPromise=(async()=>{
  try{
   if(!(await offlineStorageReady()))return{synced:0,pending:0,conflicts:0,storage:false};
   const session=await getSession();if(!session)return{synced:0,pending:0,conflicts:0,session:false};
   const client=await getSupabase();const{data:mode,error:modeError}=await client.rpc('get_pdv_test_mode');fail(modeError);
   if(mode?.enabled)return{synced:0,pending:(await getOfflineQueueSummary()).total,conflicts:0,test_mode:true};
   return await syncOfflineSales(rawCreateSale,{isNetworkError});
  }finally{syncPromise=null}
 })();
 return syncPromise;
}

if(typeof window!=='undefined'){
 window.addEventListener('online',()=>setTimeout(()=>syncOfflineNow().catch(()=>{}),1200));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine!==false)syncOfflineNow().catch(()=>{})});
}
