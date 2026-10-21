import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../public/',import.meta.url);
const data=JSON.parse(await readFile(new URL('data/eventi.json',base)));
test('all seasonal recommendations match the official class and game vehicle requirements',()=>{
 assert(data.events.length>=3);
 assert.equal(new Set(data.events.map(e=>e.id)).size,data.events.length);
 let count=0;
 for(const e of data.events){
  assert(e.source.url.startsWith('https://forza.net/'));
  if(e.cap!==null)assert(e.cap>=100&&e.cap<=999);assert(Date.parse(e.endsAt));
  for(const r of e.recommendations){
   count++;const c=data.profiles[r.slug];assert(c);assert.equal(r.class,e.class);
   const rule=e.requirements;
   if(rule.kind==='type')assert.equal(c.type,rule.value,c.name);
   if(rule.kind==='country')assert.equal(c.country,rule.value,c.name);
   if(rule.kind==='electric')assert.equal(c.electric,true,c.name);
   if(rule.kind==='make')assert.equal(c.make,rule.value,c.name);
   if(rule.kind==='fixed')assert.equal(c.slug,rule.value);
   if(!r.fixed){assert(/^\d{3} \d{3} \d{3}$/.test(r.code));assert(r.source.startsWith('https://docs.google.com/'));assert.equal(r.finalPI,null);assert.equal(r.finalRatings,null);assert.equal(r.completePartsList,false);assert(r.components.length>=4)}
   else{assert.deepEqual(r.finalRatings,c.stock.ratings);assert.equal(r.finalPI,c.stock.pi)}
  }
 }
 assert(count>=0);
});
test('polygons contain actual stock game ratings and never simulated upgraded values',()=>{
 const axes=['speed','handling','accel','launch','braking','offroad'];
 for(const c of Object.values(data.profiles)){assert(c.source.carId);assert(c.source.captured);for(const k of axes)assert(Number.isFinite(c.stock.ratings[k])&&c.stock.ratings[k]>=.1&&c.stock.ratings[k]<=10)}
 assert.equal(data.profiles['bmw-m4-cs-2025'].stock.ratings.speed,7.5);
 assert.equal(data.profiles['bmw-m4-cs-2025'].stock.pi,733);
});
test('navigation, local assets and snapshots work without KV or a runtime source dependency',async()=>{
 const html=await readFile(new URL('gare.html',base),'utf8'),js=await readFile(new URL('seasonal.js',base),'utf8'),home=await readFile(new URL('index.html',base),'utf8');
 assert(home.includes('href="/gare.html"'));assert(html.includes('href="/"'));assert(html.includes('width=device-width'));
 assert(js.includes("fetch('/data/eventi.json'"));assert(!/fetch\(['"]https?:/.test(js));
 assert(js.includes('Europe/Rome'));assert(js.includes('Settimana archiviata'));assert(js.includes('non descrive l’auto modificata'));
 assert(!/forzagarage|env\.DB/.test(js+html));
 for(const c of Object.values(data.profiles)){assert(/^\/images\/[a-z0-9-]+\.webp$/.test(c.image));assert((await readFile(new URL('.'+c.image,base))).length>0)}
});
