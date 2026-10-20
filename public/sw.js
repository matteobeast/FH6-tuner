const CACHE='fh6-garage-v9-brand-logos-20261020';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png','/tuner-core.js','/garage-app.js'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all(ASSETS.map(async path=>{try{const response=await fetch(path,{cache:'reload'});if(response.ok)await cache.put(path,response)}catch{}}));await self.skipWaiting()})())});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim()})())});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(req.mode==='navigate'){event.respondWith((async()=>{try{const response=await fetch(req);if(response.ok){const cache=await caches.open(CACHE);await cache.put('/index.html',response.clone())}return response}catch{const cache=await caches.open(CACHE);return await cache.match('/index.html')||new Response('Connessione non disponibile. Apri il sito online almeno una volta.',{status:503,headers:{'content-type':'text/plain;charset=utf-8'}})}})());return}
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const hit=await cache.match(req);if(hit)return hit;const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response})());
});
