import{getSupabase}from'../supabase.js';

let cleanupCurrent=null;

export async function initOperationsRealtime(){
 cleanupCurrent?.();
 const client=await getSupabase();
 let orderTimer=null,cashTimer=null;
 const refreshOrders=()=>{clearTimeout(orderTimer);orderTimer=setTimeout(()=>document.getElementById('refreshOnlineOrders')?.click(),300)};
 const refreshCash=()=>{clearTimeout(cashTimer);cashTimer=setTimeout(()=>document.getElementById('refreshCash')?.click(),300)};
 const channel=client.channel(`nexcell-pdv-ops-${Date.now()}`)
  .on('postgres_changes',{event:'*',schema:'public',table:'orders'},refreshOrders)
  .on('postgres_changes',{event:'*',schema:'public',table:'pos_settlements'},refreshCash)
  .subscribe();
 const cleanup=()=>{clearTimeout(orderTimer);clearTimeout(cashTimer);client.removeChannel(channel);if(cleanupCurrent===cleanup)cleanupCurrent=null};
 cleanupCurrent=cleanup;
 window.addEventListener('beforeunload',cleanup,{once:true});
 return cleanup;
}
