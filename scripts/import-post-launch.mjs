import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
const encoded=JSON.parse(await fs.readFile('scripts/post-launch-roster.json','utf8'));
const cfg=encoded.gzip?JSON.parse(gunzipSync(Buffer.from(encoded.gzip,'base64'))):encoded;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const pub='public/';
const reportPath=pub+'data/roster-audit.json';
try{const prev=JSON.parse(await fs.readFile(reportPath));if(prev.checkedAt===cfg.checkedAt){for(const r of JSON.parse(await fs.readFile(pub+'data/archive.json')).records)assert.equal(hash(await fs.readFile(pub+r.path)),r.sha256);console.log('Existing import validated; no network requests.');process.exit(0)}}catch(e){if(e.code!=='ENOENT')throw e}
async function get(url){for(let i=0;i<4;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok)throw Error(url+': '+r.status);return Buffer.from(await r.arrayBuffer())}catch(e){if(i===3)throw e;await new Promise(r=>setTimeout(r,1000*(i+1)))}}}
const datasetBytes=await get(cfg.millURL+'data/cars.js');assert.equal(hash(datasetBytes),cfg.millHash,'Source changed; re-review import');
const database=JSON.parse(datasetBytes.toString().replace(/^window\.FH6_CARS\s*=\s*/,'').replace(/;\s*$/,''));
let html=await fs.readFile(pub+'index.html','utf8');
let catalogue=JSON.parse(html.match(/<script[^>]*id="catalogue"[^>]*>([^]*?)<\/script>/)[1]);
const oldCount=catalogue.length;
const originalManifest=JSON.parse(await fs.readFile(pub+'data/archive.json'));
const media=new Map(originalManifest.assets.map(a=>[a.path,a]));
const slotArt=new Map();
for(const c of catalogue){const r=JSON.parse(await fs.readFile(pub+'data/cars/'+c.s+'.json'));for(const a of r.build?.areas||[])for(const slot of a.slots||[]){if(!slotArt.has(slot.slot))slotArt.set(slot.slot,slot)}}
const ident=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const toSlug=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const corrections=[];
for(const x of cfg.existing){
 const c=catalogue.find(c=>c.s===x.slug);assert(c,x.slug);const o=x.official;
 if(c.y!==o.year||c.p!==o.pi||ident(c.k+' '+c.m)!==ident(o.name))corrections.push({slug:c.s,before:{year:c.y,name:c.k+' '+c.m,pi:c.p},after:{year:o.year,name:o.name,pi:o.pi}});
 c.y=o.year;c.k=o.make;c.m=o.name.startsWith(o.make+' ')?o.name.slice(o.make.length+1):o.name;c.p=o.pi;c.c=o.class;c.q=(c.y+' '+c.k+' '+c.m).toLowerCase();c.official=true;
 const path=pub+'data/cars/'+c.s+'.json';const rec=JSON.parse(await fs.readFile(path));rec.official={...o,checkedAt:cfg.checkedAt,url:cfg.officialURL};
 if(rec.spec.pi!==o.pi){rec.previousPI=rec.spec.pi;rec.spec.pi=o.pi}
 await fs.writeFile(path,JSON.stringify(rec));
}
catalogue=catalogue.filter(c=>!cfg.hideDuplicates.includes(c.s));
async function asset(remote,path){
 if(!media.has(path)){let b;try{b=await fs.readFile(pub+path)}catch(e){if(e.code!=='ENOENT')throw e;b=await get(new URL(remote,cfg.millURL))}assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WEBP');await fs.mkdir(pub+path.slice(0,path.lastIndexOf('/')),{recursive:true});await fs.writeFile(pub+path,b);media.set(path,{path,bytes:b.length,sha256:hash(b)})}
 return '/'+path;
}
function imageFor(slot,opt){
 const art=slotArt.get(slot);
 const exact=art?.opts?.find(x=>ident(x.tier)===ident(opt.name));
 const level=art?.opts?.find(x=>x.level===opt.level&&!x.isStock);
 return exact?.img||art?.emblem||art?.icon||null;
}
function fieldsFor(detail,mode){
 const out=[];
 const field=(key,unit,value,min,max)=>{if(![value,min,max].every(Number.isFinite)||min>=max)return;out.push({l:key,u:unit,min,max,k:1,a:{key,def:String(value)},provenance:'game-database-suspension-range'})};
 const flat=detail.upgrades.flatMap(a=>a.types);
 const suspension=flat.find(t=>t.part==='SpringDamper');
 const preferred=mode==='dirt'?/Rally/i:mode==='drift'?/Drift/i:/Race/i;
 const option=suspension?.options.find(o=>!o.stock&&preferred.test(o.name))||suspension?.options.find(o=>o.stock);
 const row=detail.perf?.rows?.SpringDamper?.[option?.id];
 if(row)for(const [name,v]of [['front',row[1]],['rear',row[2]]]){
  if(!v)continue;
  field(name+'_ride_height','in',v[0]/.0254,v[1]/.0254,v[2]/.0254);
  field(name+'_spring','lb/in',v[3]/(4.4482216152605/25.4),v[4]/(4.4482216152605/25.4),v[5]/(4.4482216152605/25.4));
  field(name+'_bump','',v[6],v[7],v[8]);field(name+'_rebound','',v[9],v[10],v[11]);
 }
 for(const [part,name]of [['AntiSwayFront','front'],['AntiSwayRear','rear']]){
  const t=flat.find(t=>t.part===part),o=t?.options.find(o=>!o.stock&&/Race/i.test(o.name)),r=detail.perf?.rows?.[part]?.[o?.id]?.[0];
  if(r)field(name+'_swaybar','',r[0],r[1],r[2]);
 }
 return out;
}
const imported=[];
for(const x of cfg.newCars){
 const o=x.official,car=database.cars.find(c=>c.id===x.id);assert(car);assert.equal(car.pi,o.pi,o.name);
 const slug=toSlug(o.make+' '+(o.name.startsWith(o.make+' ')?o.name.slice(o.make.length+1):o.name)+' '+o.year);assert(!catalogue.some(c=>c.s===slug));
 const raw=await get(cfg.millURL+'data/detail/'+car.id+'.js');
 const detail=JSON.parse(raw.toString().replace(/^.*?\]\s*=\s*/,'').replace(/;\s*$/,''));
 assert(detail.upgrades?.length&&detail.perf,car.name);
 const areas=detail.upgrades.map(a=>({label:a.area,slots:a.types.map(t=>({slot:t.part,label:t.type,icon:slotArt.get(t.part)?.icon||null,emblem:slotArt.get(t.part)?.emblem||null,stockIdx:t.options.findIndex(v=>v.stock),opts:t.options.map((v,i)=>({id:v.id??car.id*10000+i,tier:v.name,level:v.level,price:v.price,isStock:v.stock,mfr:v.mfr,stats:{mass_diff:v.massKg},img:imageFor(t.part,v),sourceAttributes:v.attrs}))}))}));
 const h=await asset(car.img,'images/'+slug+'.webp');
 const logo=await asset(car.makeLogo,'brand-assets/logos/post-launch-'+toSlug(o.make)+'.webp');
 const release=cfg.future[car.id]||null;
 const sets=Object.fromEntries(['track','dirt','drift'].map(m=>[m,fieldsFor(detail,m)]));
 const rec={v:7,t:Date.parse(cfg.checkedAt+'T12:00:00Z'),slug,spec:{pi:o.pi,hp:car.hp,w:car.kg,wu:'kg',torque:car.nm,torqueUnit:'Nm',drivetrain:car.drive,fp:car.frontPct,gears:car.gears},fields:sets.track,fieldSets:sets,verifiedFieldsOnly:true,complete:false,upgradeDataAvailable:true,buildDataVersion:7,build:{carId:car.id,areas,presets:[],baseUnlocked:[]},details:[{label:'Motore',value:car.engine},{label:'Cilindrata',value:car.displacementL+' L'}],sources:[cfg.officialURL,cfg.millURL],archiveSource:'static',official:{...o,url:cfg.officialURL,checkedAt:cfg.checkedAt},availability:{releaseDate:release,statusAtCheck:release?'announced':'released',checkedAt:cfg.checkedAt},qualityNote:'Specifiche di serie e catalogo componenti verificati. Messa a punto: disponibili i limiti di sospensioni e barre; pressioni, rapporti, geometria, aerodinamica, freni e differenziale non ancora verificati per questa auto.',sourceData:{vehicle:car,detail},provenance:{checkedAt:cfg.checkedAt,carDetailURL:cfg.millURL+'data/detail/'+car.id+'.js',carDetailSHA256:hash(raw),officialRosterURL:cfg.officialURL}};
 assert(rec.spec.hp>0&&rec.spec.w>0&&rec.spec.fp>0&&['AWD','RWD','FWD'].includes(rec.spec.drivetrain));
 await fs.writeFile(pub+'data/cars/'+slug+'.json',JSON.stringify(rec));
 catalogue.push({s:slug,y:o.year,k:o.make,m:o.name.startsWith(o.make+' ')?o.name.slice(o.make.length+1):o.name,c:o.class,p:o.pi,h,q:(o.year+' '+o.name).toLowerCase(),logo,official:true,release});
 imported.push({slug,name:o.year+' '+o.name,releaseDate:release,fields:Object.fromEntries(Object.entries(sets).map(([k,v])=>[k,v.length])),parts:areas.reduce((n,a)=>n+a.slots.length,0),source:rec.provenance});
 console.log('Imported '+imported.length+'/'+cfg.newCars.length+': '+car.name);
}
catalogue.sort((a,b)=>a.k.localeCompare(b.k)||b.y-a.y||a.m.localeCompare(b.m));
html=html.replace(/(<script[^>]*id="catalogue"[^>]*>)[^]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(catalogue)+b).replace(/(garage-app|tuner-core)\.js\?v=\d+/g,'$1.js?v=17');
if(!html.includes('id="data-quality"'))html=html.replace('<div id="sheet" hidden>','<p id="data-quality" class="notice" hidden></p><div id="sheet" hidden>');
await fs.writeFile(pub+'index.html',html);
const api=[];
const records=[];
for(const c of catalogue){
 const path='data/cars/'+c.s+'.json',b=await fs.readFile(pub+path),r=JSON.parse(b);
 api.push({s:c.s,n:c.y+' '+c.k+' '+c.m,d:r.spec.drivetrain,c:c.c,p:c.p});
 records.push({slug:c.s,path,bytes:b.length,sha256:hash(b)});
}
const complete=catalogue.length-imported.length;
const upgradeCount=await Promise.all(catalogue.map(async c=>JSON.parse(await fs.readFile(pub+'data/cars/'+c.s+'.json')).upgradeDataAvailable));
await fs.writeFile(pub+'data/cars.json',JSON.stringify({cars:api}));
await fs.writeFile(pub+'data/status.json',JSON.stringify({database:false,storage:'static',independent:true,kvOperations:0,scheduledRefresh:false,salvate:catalogue.length,complete,daVerificare:imported.length,archiviate:catalogue.length,totale:catalogue.length,fallite:0,ultimo:Date.parse(cfg.checkedAt+'T12:00:00Z'),errore:null,dettagliErrori:{},componentiDisponibili:upgradeCount.filter(Boolean).length,componentiNonDisponibili:upgradeCount.filter(x=>!x).length,officialCars:cfg.existing.length+cfg.newCars.length,newCars:imported.length,checkedAt:cfg.checkedAt}));
const report={checkedAt:cfg.checkedAt,officialURL:cfg.officialURL,officialCount:cfg.existing.length+cfg.newCars.length,previousCount:oldCount,currentCount:catalogue.length,added:imported.length,removedDuplicateSlugs:cfg.hideDuplicates,legacyVariantSlugs:catalogue.filter(c=>!c.official).map(c=>c.s),corrections,imported,notes:['Catalogo ufficiale include auto annunciate; date future indicate separatamente.','Varianti speciali precedenti conservate; assenza dalla lista ufficiale non prova assenza dal gioco.','I 44 nuovi record hanno specifiche e ricambi verificati; i cursori senza limiti documentati non vengono inventati.']};
await fs.writeFile(reportPath,JSON.stringify(report));
await fs.writeFile(pub+'data/archive.json',JSON.stringify({schema:2,independent:true,generatedAt:Date.parse(cfg.checkedAt+'T12:00:00Z'),total:records.length,complete,upgradeCatalogues:upgradeCount.filter(Boolean).length,records,assets:[...media.values()]}));
for(const r of [...records,...media.values()])assert.equal(hash(await fs.readFile(pub+r.path)),r.sha256);
assert.equal(new Set(records.map(r=>r.slug)).size,records.length);assert.equal(report.officialCount,658);
console.log(JSON.stringify({cars:records.length,added:imported.length,official:report.officialCount,partialTuning:imported.length,kvOperations:0}));
