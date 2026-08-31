import{getSupabase}from'../supabase.js';

let cleanupCurrent=null;

export async function initCatalogRealtime(){
 cleanupCurrent?.();
 const client=await getSupabase();
 let timer=null;
 const refresh=()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>document.getElementById('refreshStock')?.click(),180);
 };
 const channel=client.channel(`nexcell-pdv-catalog-${Date.now()}`)
  .on('postgres_changes',{event:'*',schema:'public',table:'products'},refresh)
  .on('postgres_changes',{event:'*',schema:'public',table:'product_variants'},refresh)
  .subscribe();
 const cleanup=()=>{clearTimeout(timer);client.removeChannel(channel);if(cleanupCurrent===cleanup)cleanupCurrent=null};
 cleanupCurrent=cleanup;
 window.addEventListener('beforeunload',cleanup,{once:true});
 return cleanup;
}
