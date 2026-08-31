const CACHE='nexcell-pdv-shell-v1';
const SHELL=[
 './','./index.html','./app-v2.js','./app.js','./supabase.js','./runtime.js','./test-mode.js','./operations.js','./operations.css','./favicon.svg',
 './modules/checkout.js','./modules/checkout.css','./modules/customer-api.js','./modules/customer-state.js','./modules/customers.js','./modules/customers.css',
 './modules/mobile-nav.js','./modules/mobile-nav.css','./modules/ui-policies.js','./modules/offline-store.js','./modules/offline-status.js',
 '../assets/css/base.css','../assets/css/workspace.css','../assets/js/utils.js'
];

self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.allSettled(SHELL.map(url=>cache.add(new Request(url,{cache:'reload'}))));
  await self.skipWaiting();
 })());
});

self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('nexcell-pdv-shell-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});

async function networkFirst(request,fallback){
 const cache=await caches.open(CACHE);
 try{
  const response=await fetch(request);
  if(response?.ok)cache.put(request,response.clone()).catch(()=>{});
  return response;
 }catch(error){
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  if(fallback){const shell=await cache.match(fallback,{ignoreSearch:true});if(shell)return shell;}
  throw error;
 }
}

async function cacheFirst(request){
 const cache=await caches.open(CACHE);const cached=await cache.match(request,{ignoreSearch:true});if(cached)return cached;
 const response=await fetch(request);if(response?.ok||response?.type==='opaque')cache.put(request,response.clone()).catch(()=>{});return response;
}

self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.hostname.endsWith('supabase.co')||url.pathname.endsWith('/version.json'))return;
 if(request.mode==='navigate'){event.respondWith(networkFirst(request,'./index.html'));return;}
 if(url.hostname==='esm.sh'){event.respondWith(cacheFirst(request));return;}
 if(url.origin===self.location.origin){event.respondWith(networkFirst(request));return;}
 if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')event.respondWith(cacheFirst(request));
});
