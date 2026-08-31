import { getSupabase, isNetworkError } from '../supabase.js';
import { getOfflineCache, putOfflineCache } from './offline-store.js';

async function rpc(name,args={}){
 const client=await getSupabase();const{data,error}=await client.rpc(name,args);if(error)throw error;return data;
}
function normalize(value){return String(value||'').trim().toLocaleLowerCase('pt-BR')}
function matches(customer,query){
 const q=normalize(query);if(!q)return true;const digits=q.replace(/\D/g,'');
 return normalize(customer.full_name).includes(q)||normalize(customer.email).includes(q)||(digits&&String(customer.phone||'').replace(/\D/g,'').includes(digits));
}
async function rememberCustomers(rows){
 const current=await getOfflineCache('customers_recent').catch(()=>[])||[];const map=new Map(current.map(row=>[row.id,row]));
 for(const row of rows||[])if(row?.id)map.set(row.id,row);
 const merged=[...map.values()].slice(-300);await putOfflineCache('customers_recent',merged).catch(()=>{});return merged;
}

export async function searchCustomers(query='',limit=30){
 const clean=String(query||'').trim();const safeLimit=Math.min(30,Math.max(1,Number(limit)||30));
 try{const data=await rpc('search_pdv_customers',{p_query:clean,p_limit:safeLimit});const rows=Array.isArray(data)?data:[];rememberCustomers(rows).catch(()=>{});return rows}
 catch(error){if(!isNetworkError(error))throw error;const cached=await getOfflineCache('customers_recent').catch(()=>[])||[];return cached.filter(row=>matches(row,clean)).slice(0,safeLimit)}
}

export async function saveCustomer(payload){
 try{
  const saved=await rpc('save_pdv_customer',{p_id:payload?.id||null,p_full_name:String(payload?.fullName||'').trim(),p_phone:String(payload?.phone||'').trim()||null,p_email:String(payload?.email||'').trim()||null,p_notes:String(payload?.notes||'').trim()||null});
  if(saved?.saved!==false&&saved?.id)rememberCustomers([saved]).catch(()=>{});return saved;
 }catch(error){if(isNetworkError(error))throw new Error('Cadastrar ou editar cliente exige conexão. Clientes já sincronizados continuam disponíveis para consulta.');throw error}
}

export async function getCustomerHistory(id,limit=30){
 const key=`customer_history:${id}`;
 try{const data=await rpc('get_pdv_customer_history',{p_customer_id:id,p_limit:Math.min(50,Math.max(1,Number(limit)||30))});const normalized=data&&typeof data==='object'?data:{customer:null,orders:[],summary:{completed_sales:0,total_spent:0}};putOfflineCache(key,normalized).catch(()=>{});return normalized}
 catch(error){if(!isNetworkError(error))throw error;const cached=await getOfflineCache(key).catch(()=>null);if(cached)return{...cached,offline_cached:true};return{customer:null,orders:[],summary:{completed_sales:0,total_spent:0},offline_cached:true}}
}
