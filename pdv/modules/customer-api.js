import { getSupabase } from '../supabase.js';

async function rpc(name,args={}){
  const client=await getSupabase();
  const{data,error}=await client.rpc(name,args);
  if(error)throw error;
  return data;
}

export async function searchCustomers(query='',limit=30){
  const data=await rpc('search_pdv_customers',{p_query:String(query||'').trim(),p_limit:Math.min(30,Math.max(1,Number(limit)||30))});
  return Array.isArray(data)?data:[];
}

export function saveCustomer(payload){
  return rpc('save_pdv_customer',{
    p_id:payload?.id||null,
    p_full_name:String(payload?.fullName||'').trim(),
    p_phone:String(payload?.phone||'').trim()||null,
    p_email:String(payload?.email||'').trim()||null,
    p_notes:String(payload?.notes||'').trim()||null,
  });
}

export async function getCustomerHistory(id,limit=30){
  const data=await rpc('get_pdv_customer_history',{p_customer_id:id,p_limit:Math.min(50,Math.max(1,Number(limit)||30))});
  return data&&typeof data==='object'?data:{customer:null,orders:[],summary:{completed_sales:0,total_spent:0}};
}
