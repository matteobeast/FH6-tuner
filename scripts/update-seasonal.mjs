import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const OFFICIAL='https://forza.net/fh6playlists';
const SHEET='https://docs.google.com/spreadsheets/d/1ZDLQ1Jg6E6VWfMZUZX-GWflVRl75xSYPj4NHUYwZnLo/';
const WEEK=7*86400000, anchor=Date.parse('2026-10-15T14:30:00Z');
const seasons=['Summer','Autumn','Winter','Spring'];
const italian=['Estate','Autunno','Inverno','Primavera'];
const caps={D:400,C:500,B:600,A:700,S1:800,S2:900,R:998,X:999};
const axes=['speed','handling','accel','launch','braking','offroad'];
export const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/g,'');
const hash=s=>createHash('sha256').update(s).digest('hex');
const decode=s=>s.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n])).replace(/\s+/g,' ').trim();

export function weekAt(now=new Date()){
 const index=21+Math.floor((+now-anchor)/WEEK),offset=((index%4)+4)%4;
 return {seriesNumber:Math.floor(index/4)+1,seasonIndex:offset,season:italian[offset],englishSeason:seasons[offset],startsAt:new Date(anchor+(index-21)*WEEK).toISOString().replace('.000Z','Z'),endsAt:new Date(anchor+(index-20)*WEEK).toISOString().replace('.000Z','Z'),seriesEndsAt:new Date(anchor+(index-21+4-offset)*WEEK).toISOString().replace('.000Z','Z')};
}
export function officialRows(html){
 const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>decode(c[1]))).filter(r=>r.length===6&&/^S\d+ /.test(r[0]));
 if(rows.length<10)throw Error('Formato della playlist ufficiale non riconosciuto: archivio conservato.');
 return rows;
}
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}
 if(quoted)throw Error('CSV incompleto');if(cell||row.length){row.push(cell);rows.push(row)}return rows;
}
export function tuneGroups(csv){
 const rows=parseCSV(csv);if(rows[0]?.[0]!=='Event'||rows[0]?.[16]!=='Share Code')throw Error('Scheda assetti non riconosciuta');
 const groups=[];let group;
 for(const r of rows.slice(1)){if(r[0]?.trim()){group={title:r[0],restriction:r[1]||'',rows:[]};groups.push(group)}if(group&&/^\d{3}\s?\d{3}\s?\d{3}$/.test(r[16]?.trim()))group.rows.push(r)}
 return groups;
}
export async function loadProfiles(root,previous={}){
 const catalog=JSON.parse(await fs.readFile(path.join(root,'public/data/cars.json'),'utf8')).cars,profiles={...previous};
 for(const entry of catalog){if(profiles[entry.s])continue;const c=JSON.parse(await fs.readFile(path.join(root,'public/data/cars',entry.s+'.json'),'utf8')),v=c.sourceData?.vehicle,o=c.official;
  const specs=Object.fromEntries((c.details||[]).flatMap(d=>d.specs||[]).map(s=>[s.label,s.value]));
  const ratings=v?.ratings||Object.fromEntries(Object.entries({speed:'Speed',handling:'Handling',accel:'Acceleration',launch:'Launch',braking:'Braking',offroad:'Offroad'}).map(([k,l])=>[k,Math.round(parseFloat(specs[l])*10)/10]));
  if(!axes.every(k=>Number.isFinite(ratings[k])&&ratings[k]>=.1&&ratings[k]<=10))continue;
  if(!o?.type&&!v?.type)continue;
  try{await fs.access(path.join(root,'public/images',entry.s+'.webp'))}catch{continue}
  const year=o?.year||v?.year||Number(entry.n.slice(0,4)),name=o?.name||entry.n.replace(/^\d+ /,'');
  profiles[entry.s]={slug:entry.s,name,year,image:'/images/'+entry.s+'.webp',make:o?.make||v?.make||specs.Make,type:o?.type||v?.type,country:o?.country||v?.country||specs.Country,electric:v?.ev??/Electric/i.test(c.snip||''),stock:{pi:entry.p,class:entry.c,hp:c.spec.hp,weight:c.spec.wu==='lb'?c.spec.w*.45359237:c.spec.w,frontPercent:c.spec.fp,drive:c.spec.drivetrain,ratings},source:{url:v?'https://forza6-db.milleni.me/data/cars.js':'https://forza.net/en-GB/fh6cars',captured:o?.checkedAt||'2026-10-21',carId:v?.id||c.build?.carId||Number(specs['Model ID'])}};
 }
 return profiles;
}
function findCar(text,profiles){const key=norm(text),matches=Object.values(profiles).filter(p=>norm(p.year+' '+p.name)===key||norm(p.name)===key);return matches.length===1?matches[0]:null}
export function eligible(car,rule){
 if(rule.kind==='type')return norm(car.type)===norm(rule.value);
 if(rule.kind==='make')return norm(car.make)===norm(rule.value);
 if(rule.kind==='country')return norm(car.country)===norm(rule.value);
 if(rule.kind==='electric')return car.electric===true;
 if(rule.kind==='fixed')return car.slug===rule.value;
 return false;
}
function ruleFor(raw,profiles){
 const label=raw.split(/\s+-\s+(?:D|C|B|A|S1|S2|R|X)\s+Class/i)[0].trim(),cars=Object.values(profiles);
 if(/^Electric Vehicles$/i.test(label))return {kind:'electric',value:true,label};
 for(const [kind,key]of [['country','country'],['make','make'],['type','type']]){const p=cars.find(c=>norm(c[key])===norm(label));if(p)return {kind,value:p[key],label}}
 const fixed=findCar(label,profiles);return fixed?{kind:'fixed',value:fixed.slug,label}:{kind:'unverified',value:label,label};
}
function modeFor(row){return /Drift Zone/i.test(row[2])?'drift':/^(Dirt|Cross Country):/i.test(row[5])?'dirt':'track'}
function labelFor(row){return /Trial/i.test(row[2])?'The Trial':/Monthly Rivals/i.test(row[2])?'Rivali mensili':/Championship/i.test(row[2])?(/Dirt:/i.test(row[5])?'Stagionale sterrato':/Cross Country:/i.test(row[5])?'Stagionale cross country':'Stagionale asfalto'):row[2].replace('PR Stunt - ','')}
export function buildSnapshot({html,csv,profiles,now=new Date(),previous={}}){
 const week=weekAt(now),rows=officialRows(html),seasonRows=rows.filter(r=>new RegExp('^S0?'+week.seriesNumber+' .+ - '+week.englishSeason+'$').test(r[0]));
 if(!seasonRows.length)throw Error('La fonte ufficiale non contiene ancora la settimana corrente: archivio conservato.');
 const seriesLabel=seasonRows[0][0].replace(/ - (Summer|Autumn|Winter|Spring)$/,'');
 const eventRows=seasonRows.filter(r=>/Championship|The Trial|PR Stunt|Time Attack|Drag Meet/.test(r[2])).concat(rows.filter(r=>r[0]===seriesLabel&&r[2]==='Monthly Rivals'));
 if(eventRows.length<3)throw Error('Playlist incompleta: archivio conservato.');
 let groups=[];let tunerError=null;try{groups=tuneGroups(csv);if(/work in progress|WIP|not ready/i.test(csv.slice(0,500)))throw Error('Scheda in preparazione')}catch(e){tunerError=e.message}
 const tab='Series '+week.seriesNumber+' '+(week.englishSeason==='Autumn'?'Autumn/Fall':week.englishSeason),source=SHEET+'edit?sheet='+encodeURIComponent(tab),excluded=[],usedProfiles={},events=[];
 for(const row of eventRows){
  const monthly=row[2]==='Monthly Rivals',fixed=monthly?findCar(row[4],profiles):null,requirements=ruleFor(row[4],profiles),cls=row[4].match(/\b(D|C|B|A|S1|S2|R|X)\s+Class/i)?.[1].toUpperCase()||fixed?.stock.class||null,cap=caps[cls]||null;
  const id=row[3].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),group=groups.find(g=>norm(g.title.split('\n')[0].replace(/^.*? - /,''))===norm(row[3]));
  const recommendations=[];
  if(fixed){usedProfiles[fixed.slug]=fixed;recommendations.push({slug:fixed.slug,code:null,author:'Playground Games',name:'Auto fornita dall’evento',class:cls,drive:fixed.stock.drive,components:[],source:OFFICIAL,finalPI:fixed.stock.pi,finalRatings:fixed.stock.ratings,completePartsList:true,fixed:true})}
  if(!monthly&&group&&!tunerError)for(const r of group.rows){
   const car=findCar(r[2]+' '+r[3]+' '+r[4],profiles);
   if(!car||r[6]!==cls||!eligible(car,requirements)||!['AWD','RWD','FWD'].includes(r[7])){excluded.push({event:id,car:[r[2],r[3],r[4]].join(' '),reason:!car?'Auto non identificata univocamente nel catalogo':'Classe, categoria o trazione non verificata'});continue}
   usedProfiles[car.slug]=car;recommendations.push({slug:car.slug,code:r[16].replace(/\s/g,'').replace(/(\d{3})(\d{3})(\d{3})/,'$1 $2 $3'),author:r[13]||'LogikJ',name:r[14],class:cls,drive:r[7],components:[{label:'Motore',value:r[8]||'Non specificato'},{label:'Trazione',value:r[7]},{label:'Pneumatici',value:r[10]||'Non specificato'},{label:'Carrozzeria e cerchi',value:r[9]||'Non specificato'}],publishedDate:r[15]?.trim()||null,source,finalPI:null,finalRatings:null,completePartsList:false})
  }
  // Preserve reviewed ordering and rationale only for the exact same week, code and requirements.
  const old=previous.startsAt===week.startsAt?previous.events?.find(e=>e.id===id&&e.officialRequirement===row[4]):null;
  if(old){const order=new Map(old.recommendations.map((r,i)=>[r.code||'fixed',i]));recommendations.sort((a,b)=>(order.get(a.code||'fixed')??1000)-(order.get(b.code||'fixed')??1000))}
  events.push({id,name:row[3],label:labelFor(row),class:cls,cap,mode:modeFor(row),requirements,officialRequirement:row[4],reward:row[1],routes:row[5]?row[5].replace(/^(Road|Street|Dirt|Cross Country):\s*/,'').split(/,\s*/):[],objective:monthly?'Registra un giro pulito':/Championship|Trial/.test(row[2])?'Completa il campionato':row[4],reason:old?.reason||(fixed?'Il gioco fornisce l’auto e fissa la preparazione.': 'Prima scelta pubblicata da '+(recommendations[0]?.author||'un preparatore')+' per questa gara; non è un primato cronometrico verificato.'),recommendations,source:{url:OFFICIAL,row},endsAt:monthly?week.seriesEndsAt:week.endsAt});
 }
 const pending=events.filter(e=>!e.recommendations.length).map(e=>e.id);
 return {schema:2,checkedAt:now.toISOString().slice(0,10),startsAt:week.startsAt,endsAt:week.endsAt,series:seriesLabel.replace(/^S\d+ /,''),season:week.season,seriesNumber:week.seriesNumber,profiles:usedProfiles,events,provenance:{official:{url:OFFICIAL,sha256:hash(html)},tuner:{url:source,author:'LogikJ',sha256:hash(csv||''),error:tunerError}},limitations:previous.limitations||[],excluded,automation:{scheduleUTC:'Thursday 17:17; Friday 17:17 only if incomplete',pendingEvents:pending,sourceRequests:'2 weekly; 1 additional tuner request only if incomplete',updatedAt:now.toISOString()}};
}
async function getText(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'FH6-Tuner seasonal snapshot (weekly; matteobeast/FH6-tuner)'}});if(!r.ok)throw Error('Fonte HTTP '+r.status);return r.text()}
export async function updateSeasonal({root=fileURLToPath(new URL('../',import.meta.url)),now=new Date(),fetchText=getText,force=false}={}){
 const file=path.join(root,'public/data/eventi.json'),previous=JSON.parse(await fs.readFile(file,'utf8')),week=weekAt(now);
 const statePath=path.join(root,'scripts/seasonal-state.json');let state={};try{state=JSON.parse(await fs.readFile(statePath,'utf8'))}catch{}
 const same=previous.startsAt===week.startsAt;
 if(!force&&same&&state.startsAt===week.startsAt&&(state.complete||state.attempts>=2)){console.log('Settimana già acquisita: zero richieste alle fonti.');return {requests:0,changed:false}}
 const profiles=await loadProfiles(root,previous.profiles);
 // The recovery run reuses the saved official rows; never refetch the official table.
 const retry=!force&&same&&state.startsAt===week.startsAt&&state.attempts===1;
 const html=retry?state.officialHTML:await fetchText(OFFICIAL);
 const rows=officialRows(html),seasonRows=rows.filter(r=>new RegExp('^S0?'+week.seriesNumber+' .+ - '+week.englishSeason+'$').test(r[0]));
 if(!seasonRows.length)throw Error('Nuova settimana assente nella fonte ufficiale. Nessuna modifica pubblicata.');
 const tab='Series '+week.seriesNumber+' '+(week.englishSeason==='Autumn'?'Autumn/Fall':week.englishSeason);
 let csv='';try{csv=await fetchText(SHEET+'gviz/tq?tqx=out:csv&sheet='+encodeURIComponent(tab))}catch(e){console.warn('Assetti non ancora disponibili: '+e.message)}
 const next=buildSnapshot({html,csv,profiles,now,previous});
 // Never discard a valid recommendation if a same-week source temporarily regresses.
 if(same)for(const e of next.events){const old=previous.events.find(o=>o.id===e.id&&o.officialRequirement===e.officialRequirement);if(!e.recommendations.length&&old?.recommendations.length){e.recommendations=old.recommendations;e.reason=old.reason;for(const r of e.recommendations)next.profiles[r.slug]=previous.profiles[r.slug]}}
 next.automation.pendingEvents=next.events.filter(e=>!e.recommendations.length).map(e=>e.id);
 const compact='<table>'+rows.filter(r=>r[0].startsWith(seasonRows[0][0].split(' - ')[0])).map(r=>'<tr>'+r.map(c=>'<td>'+c.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</td>').join('')+'</tr>').join('')+'</table>';
 const nextState={startsAt:week.startsAt,attempts:retry?2:1,complete:next.automation.pendingEvents.length===0,officialHTML:compact};
 await fs.writeFile(file+'.tmp',JSON.stringify(next)+'\n');await fs.rename(file+'.tmp',file);
 await fs.writeFile(statePath,JSON.stringify(nextState)+'\n');
 console.log(JSON.stringify({week:next.startsAt,events:next.events.length,tunes:next.events.reduce((n,e)=>n+e.recommendations.length,0),pending:next.automation.pendingEvents,requests:retry?1:2}));
 return {requests:retry?1:2,changed:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await updateSeasonal({force:process.argv.includes('--force')});
