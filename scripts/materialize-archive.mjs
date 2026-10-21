
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const ROOT=process.cwd(), PUB=join(ROOT,'public'), ORIGIN='https://fh6.sev4s3d.it', MEDIA='https://pub-b1b0dda9cb0644008ffedffa8be50cbf.r2.dev';
const manifestPath=join(PUB,'data/archive.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const assert=(test,message)=>{if(!test)throw Error(message)};
async function validateExisting(manifest){
 for(const item of [...manifest.records,...manifest.assets]){
  const bytes=await readFile(join(PUB,item.path));
  assert(hash(bytes)===item.sha256,'Checksum non valido: '+item.path);
 }
 console.log('Archivio già presente e verificato: nessun recupero esterno.');
}
async function fetchOnce(url){
 for(let attempt=0;attempt<4;attempt++){
  let response;
  try{response=await fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error'})}
  catch(error){if(attempt===3)throw error;await new Promise(r=>setTimeout(r,1000*(attempt+1)));continue}
  if(response.ok)return response;
  if(![429,500,502,503,504].includes(response.status)||attempt===3)throw Error('HTTP '+response.status+' — '+url);
  const seconds=Math.min(30,Number(response.headers.get('retry-after'))||attempt+1);
  await response.body?.cancel();await new Promise(r=>setTimeout(r,seconds*1000));
 }
}
function localImage(value){
 if(typeof value!=='string')return value;
 let p=value;if(p.startsWith(MEDIA+'/'))p=p.slice(MEDIA.length);
 if(/^\/(logos|upgrades\/icons)\/[a-zA-Z0-9_./-]+\.webp$/.test(p)&&!p.includes('..'))return '/brand-assets'+p;
 throw Error('Percorso immagine non previsto: '+value);
}
async function main(){
 if(existsSync(manifestPath)){await validateExisting(JSON.parse(await readFile(manifestPath,'utf8')));return}
 const html=await readFile(join(PUB,'index.html'),'utf8');
 const catalogue=JSON.parse(html.match(/<script id="catalogue"[^>]*>([\s\S]*?)<\/script>/)[1]);
 const app=await readFile(join(PUB,'garage-app.js'),'utf8');
 const logos=JSON.parse(app.match(/const brandLogos=(\{[^;]+\});/)[1]);
 const records=new Map(),seenCursors=new Set();let cursor=null,pages=0;
 do{
  const page=await(await fetchOnce(ORIGIN+'/api/export'+(cursor?'?cursor='+encodeURIComponent(cursor):''))).json();
  assert(Array.isArray(page.cars),'Esportazione non valida');
  for(const item of page.cars){assert(/^[a-z0-9-]{3,120}$/.test(item.slug)&&item.record,'Scheda non valida');assert(!records.has(item.slug),'Scheda duplicata');records.set(item.slug,item.record)}
  cursor=page.cursor;pages++;assert(pages<1000,'Paginazione infinita');
  if(cursor){assert(!seenCursors.has(cursor),'Cursore duplicato');seenCursors.add(cursor)}
  if(pages%10===0)console.log('Esportate '+records.size+' schede');
 }while(cursor);
 const overrides=JSON.parse(await readFile(join(ROOT,'scripts/archive-overrides.json'),'utf8'));
 for(const [slug,encoded]of Object.entries(overrides))records.set(slug,JSON.parse(gunzipSync(Buffer.from(encoded,'base64'))));
 assert(records.size===catalogue.length,'Numero schede diverso dal catalogo');
 const assets=new Set(Object.values(logos).filter(Boolean).map(name=>'/logos/'+name));
 for(const car of catalogue){
  const rec=records.get(car.s);assert(rec?.fields?.length&&rec.build?.areas?.length&&rec.complete,'Scheda incompleta: '+car.s);
  assert(Number(rec.spec?.pi)>0&&Number(rec.spec?.w)>0,'Specifiche mancanti: '+car.s);
  for(const area of rec.build.areas){if(area.icon)assets.add(area.icon);for(const slot of area.slots||[]){if(slot.icon)assets.add(slot.icon);if(slot.emblem)assets.add(slot.emblem);for(const opt of slot.opts||[])if(opt.img)assets.add(opt.img)}}
 }
 const files=[],assetFiles=[],paths=[...assets].sort();let next=0,done=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(next<paths.length){
   const source=paths[next++],local=localImage(source),relative=local.slice(1);
   const response=await fetchOnce(MEDIA+source),bytes=Buffer.from(await response.arrayBuffer());
   assert(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP','Immagine non WebP: '+source);
   await mkdir(join(PUB,relative,'..'),{recursive:true});await writeFile(join(PUB,relative),bytes);
   assetFiles.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});done++;
   if(done%50===0)console.log('Salvate '+done+'/'+paths.length+' immagini');
  }
 }));
 await mkdir(join(PUB,'data/cars'),{recursive:true});
 for(const car of catalogue){
  const rec=records.get(car.s);
  for(const area of rec.build.areas){if(area.icon)area.icon=localImage(area.icon);for(const slot of area.slots||[]){if(slot.icon)slot.icon=localImage(slot.icon);if(slot.emblem)slot.emblem=localImage(slot.emblem);for(const opt of slot.opts||[])if(opt.img)opt.img=localImage(opt.img)}}
  rec.slug=car.s;rec.archiveSource='static';
  const bytes=Buffer.from(JSON.stringify(rec)),relative='data/cars/'+car.s+'.json';
  await writeFile(join(PUB,relative),bytes);files.push({slug:car.s,path:relative,bytes:bytes.length,sha256:hash(bytes)});
 }
 const generatedAt=new Date().toISOString();
 const manifest={schema:1,independent:true,generatedAt,total:files.length,complete:files.length,records:files,assets:assetFiles.sort((a,b)=>a.path.localeCompare(b.path))};
 const carList=catalogue.map(c=>({s:c.s,n:c.y+' '+c.k+' '+c.m,d:records.get(c.s).spec.drivetrain,c:c.c,p:c.p}));
 await writeFile(join(PUB,'data/cars.json'),JSON.stringify({cars:carList}));
 await writeFile(join(PUB,'data/status.json'),JSON.stringify({database:false,storage:'static',independent:true,kvOperations:0,scheduledRefresh:false,salvate:files.length,complete:files.length,daVerificare:0,archiviate:files.length,totale:files.length,fallite:0,ultimo:Date.parse(generatedAt),errore:null,dettagliErrori:{}}));
 await writeFile(manifestPath,JSON.stringify(manifest));
 await validateExisting(manifest);console.log('Archivio indipendente pronto: '+files.length+' auto, '+assetFiles.length+' immagini.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
