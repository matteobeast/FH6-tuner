import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadProfiles,norm,weekAt} from './update-seasonal.mjs';

export const META_URL='https://fhstats.com/metacars/horizon-racing';
export const PATCH_URL='https://support.forza.net/api/v2/help_center/en-us/sections/51701872316947/articles.json?per_page=100';
const hash=s=>createHash('sha256').update(s).digest('hex');
const caps={C:500,B:600,A:700,S1:800,S2:900,R:998};
const text=s=>String(s??'').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n])).replace(/\s+/g,' ').trim();
const day=s=>/^\d{4}-\d{2}-\d{2}/.test(s||'')?s.slice(0,10):null;

// Decode the page's published JSON payload. Never execute remote JavaScript.
export function parseMetaHTML(html){
 let flight='';
 for(const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)){try{const a=JSON.parse(m[1]);if(a[0]===1&&typeof a[1]==='string')flight+=a[1]}catch{}}
 const arrays=[];
 function visit(v){if(!v||typeof v!=='object')return;if(Array.isArray(v)&&v.some(x=>x?.tuneCode&&x?.tier))arrays.push(v);else for(const x of Object.values(v))visit(x)}
 for(const line of flight.split('\n')){try{visit(JSON.parse(line.slice(line.indexOf(':')+1)))}catch{}}
 const rows=arrays.sort((a,b)=>b.length-a.length)[0];
 if(!rows||rows.length<20||!rows.some(r=>r.discipline==='road')||!rows.some(r=>r.discipline==='dirt'))throw Error('Catalogo meta incompleto o formato cambiato.');
 return rows;
}
export function parsePatches(raw,now=new Date()){
 const data=JSON.parse(raw);if(!Array.isArray(data.articles)||!data.articles.length||data.next_page)throw Error('Indice patch incompleto o non riconosciuto.');
 const patches=[];
 for(const a of data.articles){
  if(!/^FH6 Release Notes:/i.test(a.title)||a.draft)continue;
  const stamp=Date.parse(a.title.replace(/^FH6 Release Notes:\s*/i,'').replace(/(\d)(st|nd|rd|th)\b/g,'$1')+' UTC');
  if(!Number.isFinite(stamp))throw Error('Data della patch non riconosciuta');
  if(stamp>+now)continue;
  if(typeof a.body!=='string'||a.body.length<100||!/^https:\/\/support\.forza\.net\/hc\//.test(a.html_url))throw Error('Patch non valida');
  const changes=[];
  // Mechanical changes only. Audio, rendering and cosmetics are not balance changes.
  for(const m of a.body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)){
   const value=text(m[1]);
   if(/audio|sound|scrub|speedometer|render|graphics|raytrac|collectible|photo|visual|cosmetic|clip through|clipping/i.test(value))continue;
   if(!/\b(physics|grip|torque|downforce|drag (?:tires|tyres)|performance index|aerodynamics|braking|handling|suspension|acceleration|top speed|power output|engine power|horsepower)\b/i.test(value))continue;
   if(!/adjust|fix|increas|reduc|chang|updat|rebalanc|buff|nerf/i.test(value))continue;
   const tyres=/drag (?:tires|tyres)/i.test(value)?'drag':null;
   changes.push({kind:'mechanics',tyres,matchText:value,summary:tyres?'Modifica alla fisica degli pneumatici drag':/power-to-weight/i.test(value)?'Correzione del rapporto peso/potenza':'Modifica tecnica alle prestazioni'});
  }
  if(/New Engine Swaps/i.test(a.body))for(const row of a.body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
   if(cells.length===2&&/^\d{4}\b/.test(cells[1]))changes.push({kind:'engine-options',matchText:cells[1],engine:cells[0],summary:'Nuova conversione motore: '+cells[0]});
  }
  patches.push({id:a.id,date:new Date(stamp).toISOString().slice(0,10),title:a.title,url:a.html_url,hash:hash(a.body),changes});
 }
 if(!patches.length)throw Error('Nessuna patch FH6 riconosciuta');
 return patches.sort((a,b)=>b.date.localeCompare(a.date));
}
function carMatch(row,profiles){
 const all=Object.values(profiles),byId=Number.isInteger(row.carId)?all.filter(p=>Number(p.source.carId)===row.carId):[];
 if(byId.length===1)return byId[0];
 if(byId.length>1)return null;
 const byName=all.filter(p=>p.year===row.year&&norm(p.name)===norm(row.make+' '+row.model));
 return byName.length===1?byName[0]:null;
}
export function assessPatch(row,car,patches){
 const sourceDate=[day(row.updatedAt),day(row.tuneDate)].filter(Boolean).sort().at(-1)||null;
 for(const patch of patches){
  const hits=patch.changes.filter(c=>{
   if(c.tyres&&!new RegExp('\\b'+c.tyres+'\\b','i').test(row.buildType||''))return false;
   const mentions=norm(c.matchText).includes(norm(car.year+' '+car.name));
   if(c.kind==='engine-options')return c.matchText.split(/,\s*(?=\d{4})|\s+&\s+(?=\d{4})/).some(n=>norm(n)===norm(car.year+' '+car.name));
   // Unscoped mechanical changes conservatively cover all builds; named-car changes are scoped.
   return mentions||!(/\b(?:19|20)\d{2}\b/.test(c.matchText));
  });
  if(hits.length)return {status:sourceDate&&sourceDate>=patch.date?'source-updated':'review',date:patch.date,url:patch.url,summary:hits.map(c=>c.summary).slice(0,3),sourceDate};
 }
 return {status:'listed',sourceDate,summary:[]};
}
export function buildMeta({rows,patches,profiles,previous=null,now=new Date()}){
 const entries=[],used={},excluded=[];
 for(const r of rows){
  if(!['S+','S'].includes(r.tier))continue;
  const car=carMatch(r,profiles),match=String(r.className).match(/^(C|B|A|S1|S2|R)\s+(\d+)$/),code=String(r.tuneCode||'').replace(/\s/g,'');
  if(!car||!match||caps[match[1]]!==Number(match[2])||!/^\d{9}$/.test(code)||!['road','dirt','cross-country'].includes(r.discipline)||!r.tuner||!/^[-a-z0-9]+$/.test(r.id)){
   excluded.push({id:r.id,reason:!car?'Identità dell’auto non verificata':'Codice, classe o disciplina non validi'});continue;
  }
  used[car.slug]=car;
  const patch=assessPatch(r,car,patches),old=previous?.entries.find(e=>e.id===r.id);
  const entry={id:r.id,slug:car.slug,carId:car.source.carId,discipline:r.discipline,class:match[1],cap:Number(match[2]),tier:r.tier==='S+'?'Meta+':'Meta',sourceTier:r.tier,order:Number.isFinite(r.displayOrder)?r.displayOrder:0,code:code.replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3'),tuner:r.tuner,name:r.tuneName||'Assetto condiviso',build:r.buildType||'Preparazione non specificata',difficulty:{Low:'Facile',Medium:'Intermedia',Hard:'Impegnativa'}[r.difficulty]||'Non indicata',drive:r.buildType?.match(/\b(AWD|RWD|FWD)\b/)?.[1]||null,updatedAt:day(r.updatedAt),tuneDate:day(r.tuneDate),source:META_URL.replace('/horizon-racing','/')+r.id,patch,finalRatings:null,finalPI:null};
  entry.change=!previous?'baseline':!old?'added':old.code!==entry.code?'tune':old.tier!==entry.tier?'tier':'unchanged';
  entries.push(entry);
 }
 if(entries.length<20||new Set(entries.map(e=>e.discipline)).size!==3)throw Error('Troppi dati mancanti nel catalogo meta: aggiornamento interrotto.');
 if(new Set(entries.map(e=>e.id)).size!==entries.length)throw Error('Identificativi meta duplicati');
 entries.sort((a,b)=>(a.patch.status==='review')-(b.patch.status==='review')||(a.tier==='Meta')-(b.tier==='Meta')||a.order-b.order||a.id.localeCompare(b.id));
 const week=weekAt(now),changes={added:entries.filter(e=>e.change==='added').length,tunes:entries.filter(e=>e.change==='tune').length,tiers:entries.filter(e=>e.change==='tier').length,removed:previous?previous.entries.filter(e=>!entries.some(n=>n.id===e.id)).map(e=>({id:e.id,slug:e.slug,tier:e.tier})):[]};
 return {schema:1,checkedAt:now.toISOString(),startsAt:week.startsAt,endsAt:week.endsAt,entries,profiles:used,patches:patches.slice(0,4).map(p=>({id:p.id,date:p.date,title:p.title,url:p.url,hash:p.hash,mechanicalChanges:p.changes.length,engineOptions:p.changes.filter(c=>c.kind==='engine-options').length})),changes,excluded,method:'Livelli Meta+ e Meta del catalogo FHStats. Il controllo delle patch segnala possibili impatti tecnici, senza simulare nuovi tempi o nuovi livelli meta.',automation:{scheduleUTC:'Thursday 17:37',requestsPerWeek:2}};
}
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'FH6-Tuner weekly meta archive (matteobeast/FH6-tuner)'}});if(!r.ok)throw Error('Fonte HTTP '+r.status);return r.text()}
export async function updateMeta({root=fileURLToPath(new URL('../',import.meta.url)),now=new Date(),fetchSource=fetchText}={}){
 const file=path.join(root,'public/data/meta.json'),week=weekAt(now);let previous=null;
 try{previous=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 if(previous?.startsAt===week.startsAt){console.log('Meta già acquisito questa settimana: zero richieste.');return {requests:0,changed:false}}
 const results=await Promise.allSettled([fetchSource(META_URL),fetchSource(PATCH_URL)]);
 if(results.some(r=>r.status==='rejected'))throw Error('Una fonte meta/patch non è disponibile: archivio precedente conservato.');
 const [html,raw]=results.map(r=>r.value),rows=parseMetaHTML(html),patches=parsePatches(raw,now);
 const seasonal=JSON.parse(await fs.readFile(path.join(root,'public/data/eventi.json'),'utf8'));
 const profiles=await loadProfiles(root,seasonal.profiles),next=buildMeta({rows,patches,profiles,previous,now});
 next.sources={meta:{url:META_URL,sha256:hash(html)},patches:{url:PATCH_URL,sha256:hash(raw)}};
 await fs.writeFile(file+'.tmp',JSON.stringify(next)+'\n');await fs.rename(file+'.tmp',file);
 console.log(JSON.stringify({entries:next.entries.length,cars:Object.keys(next.profiles).length,review:next.entries.filter(e=>e.patch.status==='review').length,requests:2}));
 return {requests:2,changed:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await updateMeta();
