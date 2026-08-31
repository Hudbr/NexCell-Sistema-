import{BUILD_VERSION}from'./build-version.js'

const CHECK_INTERVAL=60000
let pendingVersion=''
let timer=null

function normalizeNavigation(){
 document.title='Nexcell PDV'
 let icon=document.querySelector('link[rel~="icon"]')
 if(!icon){icon=document.createElement('link');icon.rel='icon';document.head.appendChild(icon)}
 icon.type='image/svg+xml';icon.href='./favicon.svg'
 document.querySelectorAll('a[href]').forEach(anchor=>{
  const raw=anchor.getAttribute('href')||''
  if(raw.includes('control'))anchor.setAttribute('href','/adm')
  else if(raw.includes('store')||raw==='../' || raw==='..')anchor.setAttribute('href','/')
  else if(raw.includes('finance'))anchor.setAttribute('href','/fin')
 })
}

function hasActiveWork(){
 const cart=document.getElementById('saleCart')
 if(cart&&cart.children.length>0)return true
 if(document.querySelector('#paymentModal.open,#budgetModal.open,#variantModal.open'))return true
 if(document.querySelector('button:disabled[id="finishSale"],button:disabled[id="saveBudget"]'))return true
 return false
}

function showUpdateNotice(){
 if(document.getElementById('pdvUpdateNotice'))return
 const notice=document.createElement('button')
 notice.id='pdvUpdateNotice'
 notice.type='button'
 notice.textContent='Atualização pronta · concluir atendimento para aplicar'
 notice.style.cssText='position:fixed;right:14px;bottom:76px;z-index:250;border:1px solid #d8c18b;background:#fff8df;color:#594716;border-radius:10px;padding:10px 12px;font:700 11px/1.3 Plus Jakarta Sans,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.15);max-width:260px;text-align:left'
 notice.addEventListener('click',()=>{if(!hasActiveWork())applyUpdate()})
 document.body.appendChild(notice)
}

function applyUpdate(){
 if(!pendingVersion||hasActiveWork()){showUpdateNotice();return}
 const url=new URL(location.href)
 url.searchParams.set('pdv_build',String(pendingVersion).slice(0,12))
 location.replace(url.toString())
}

async function checkVersion(){
 try{
  const response=await fetch(`./version.json?check=${Date.now()}`,{cache:'no-store',headers:{'cache-control':'no-cache'}})
  if(!response.ok)return
  const data=await response.json()
  const next=String(data?.version||'').trim()
  if(!next||next==='development'||BUILD_VERSION==='development'||next===BUILD_VERSION)return
  pendingVersion=next
  applyUpdate()
 }catch(_){/* a operação continua mesmo sem a checagem de versão */}
}

function registerOfflineShell(){
 if(!('serviceWorker'in navigator))return
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(error=>console.warn('Continuidade offline indisponível',error))
}

function start(){
 normalizeNavigation()
 registerOfflineShell()
 checkVersion()
 timer&&clearInterval(timer)
 timer=setInterval(()=>{if(!document.hidden){normalizeNavigation();if(pendingVersion)applyUpdate();else checkVersion()}},CHECK_INTERVAL)
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){normalizeNavigation();pendingVersion?applyUpdate():checkVersion()}})
 window.addEventListener('focus',()=>{normalizeNavigation();pendingVersion?applyUpdate():checkVersion()})
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true})
else start()
