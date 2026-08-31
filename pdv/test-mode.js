import'./runtime.js'
import{getSession,getSupabase}from'./supabase.js'

let enabled=null
let timer=null

function render(active){
 enabled=!!active
 let banner=document.getElementById('pdvTestModeBanner')
 const main=document.querySelector('.workspace-main')
 if(!active){
  banner?.remove()
  document.body.removeAttribute('data-pdv-test-mode')
  return
 }
 document.body.dataset.pdvTestMode='1'
 if(!main||banner)return
 banner=document.createElement('div')
 banner.id='pdvTestModeBanner'
 banner.setAttribute('role','status')
 banner.style.cssText='position:sticky;top:0;z-index:80;padding:10px 16px;background:#fff4cc;border-bottom:1px solid #e0bd55;color:#5a4500;font:700 13px/1.4 Plus Jakarta Sans,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.06)'
 banner.innerHTML='<strong>MODO TESTE</strong> — nenhuma venda, sangria, ajuste de estoque, orçamento, pedido ou fechamento feito aqui será gravado.'
 main.insertBefore(banner,main.firstChild)
}

async function refresh(){
 try{
  const session=await getSession()
  if(!session){render(false);return}
  const client=await getSupabase()
  const{data,error}=await client.rpc('get_pdv_test_mode')
  if(error)throw error
  if(enabled!==!!data?.enabled||!document.getElementById('pdvTestModeBanner'))render(!!data?.enabled)
 }catch(_){
  if(enabled===true)render(true)
 }
}

function start(){
 refresh()
 if(timer)clearInterval(timer)
 timer=setInterval(()=>{if(!document.hidden)refresh()},10000)
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()})
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true})
else start()
