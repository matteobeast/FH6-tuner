
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import worker from '../worker.js';
const publicRoot=new URL('../public/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('data/archive.json',publicRoot),'utf8'));
test('all archived car records and media are complete, local and intact',async()=>{
 assert.equal(manifest.total,622);assert.equal(manifest.records.length,622);
 assert.equal(new Set(manifest.records.map(r=>r.slug)).size,622);
 const assets=new Set(manifest.assets.map(a=>'/'+a.path));
 for(const item of [...manifest.records,...manifest.assets]){
  const bytes=await readFile(new URL(item.path,publicRoot));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path);
  if(!item.slug)continue;
  const car=JSON.parse(bytes);assert(car.complete);assert(car.fields.length>0);assert(car.spec.pi>0);
  assert.equal(car.slug,item.slug);
  for(const area of car.build.areas){
   const paths=[area.icon,...(area.slots||[]).flatMap(s=>[s.icon,s.emblem,...(s.opts||[]).map(o=>o.img)])].filter(Boolean);
   for(const path of paths)assert(assets.has(path),'Missing local upgrade asset: '+path);
  }
 }
});
test('all 622 garage APIs work with KV and external network prohibited',async()=>{
 let kv=0,external=0;
 const env={get DB(){kv++;throw Error('KV must not be used')},ASSETS:{async fetch(req){
  const path=new URL(req.url).pathname;
  try{return new Response(await readFile(new URL('.'+path,publicRoot)),{headers:{'content-type':'application/json'}})}
  catch{return new Response('Not found',{status:404})}
 }}};
 const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{external++;throw Error('External fetch prohibited')};
 const api=(path,method='GET')=>worker.fetch(new Request('https://site.test'+path,{method}),env);
 try{
  for(const item of manifest.records){const response=await api('/api/garage?slug='+item.slug);assert.equal(response.status,200,item.slug);const car=await response.json();assert.equal(car.slug,item.slug);assert(car.fields.length)}
  assert.equal((await api('/api/garage?slug=missing-car-1900')).status,404);
  assert.equal((await api('/api/garage?slug=../bad')).status,400);
  assert.equal((await api('/api/status','POST')).status,405);
  assert.equal((await api('/api/unknown')).status,404);
  const status=await(await api('/api/status')).json();assert(status.independent);assert.equal(status.kvOperations,0);assert.equal(status.scheduledRefresh,false);
  assert.equal((await(await api('/api/cars')).json()).cars.length,622);
  const legacy=await(await api('/api/car?slug='+manifest.records[0].slug)).json();assert.equal(legacy.storage,'static');assert(legacy.fields.length);
  const page=await(await api('/api/export')).json();assert.equal(page.cars.length,10);assert.equal(page.cursor,'10');
  assert.equal((await api('/api/export?cursor=invalid')).status,400);
  assert.equal(kv,0);assert.equal(external,0);
 }finally{globalThis.fetch=savedFetch}
});
test('3D models still use the owner archive and preserve range requests',async()=>{
 let called;const prior=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{called={url,options};return new Response(new Uint8Array([1,2,3,4]),{status:206,headers:{'content-type':'model/gltf-binary','content-range':'bytes 0-3/100'}})};
 try{
  const request=new Request('https://site.test/api/model?slug=abarth-695-biposto-2016',{headers:{range:'bytes=0-3'}});
  const response=await worker.fetch(request,{});
  assert.equal(response.status,206);assert.equal(called.url,'https://modelli.sev4s3d.it/models/abarth-695-biposto-2016.glb');
  assert.equal(called.options.headers.get('range'),'bytes=0-3');assert.equal(response.headers.get('content-range'),'bytes 0-3/100');
 }finally{globalThis.fetch=prior}
});
