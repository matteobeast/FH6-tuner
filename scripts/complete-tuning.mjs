import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const root='public/';
const report=JSON.parse(await fs.readFile(root+'data/roster-audit.json'));
const manifest=JSON.parse(await fs.readFile(root+'data/archive.json'));
try{const previous=JSON.parse(await fs.readFile(root+'data/tuning-completion.json'));if(previous.completed.length===44){for(const m of manifest.records)assert.equal(hash(await fs.readFile(root+m.path)),m.sha256);console.log('Completed archive validated; no source requests.');process.exit(0)}}catch(e){if(e.code!=='ENOENT')throw e}
const sharedURL='https://forza6-db.milleni.me/data/perf-shared.js',paramsURL='https://forza6-db.milleni.me/perf/params.js';
const sharedBytes=Buffer.from(await(await fetch(sharedURL)).arrayBuffer());
const paramsBytes=Buffer.from(await(await fetch(paramsURL)).arrayBuffer());
assert.equal(hash(sharedBytes),'9d30d700b7897f9b1386df03427dc59d5f34c846cae1bf43eb9a55da5fafbf0d','Game tables changed; review required');assert.equal(hash(paramsBytes),'1034343f82c1003c20dd47ccf2d1298202592b84eed23a4e359b9e49736ad877','Global settings changed; review required');
const S=JSON.parse(sharedBytes.toString().replace(/^window\.FH6_PERF_SHARED\s*=\s*/,'').replace(/;\s*$/,''));
assert(S.schema.sub.FrontSpring.includes('MinSpringRate'));
const globalMatch=paramsBytes.toString().match(/const GLOBAL_TUNING_RANGES = \{([^]*?)\n  \};/);assert(globalMatch);
const G=Object.fromEntries([...globalMatch[1].matchAll(/(\w+): \[(-?[\d.]+),\s*(-?[\d.]+)\]/g)].map(m=>[m[1],[+m[2],+m[3]]]));
for(const k of ['tirePressurePsi','finalDrive','gearRatio','camberDeg','toeDeg','casterDeg','lsdAccelDecel','centerTorqueSplit'])assert(G[k]);
const capturedUI='https://github.com/mondrianaire/FH6-Compendium/blob/master/data/meta-cars.json';
const sources={shared:{url:sharedURL,sha256:hash(sharedBytes)},globals:{url:paramsURL,sha256:hash(paramsBytes),gameFile:'media/Physics/PhysicsSettings.ini CarTuning'},brakesUI:{url:capturedUI,scope:'UI capture, 2026-08-10: balance 0–100%; pressure 0–200%'}};
const completed=[];
for(const item of report.imported){
 const file=root+'data/cars/'+item.slug+'.json',r=JSON.parse(await fs.readFile(file)),d=r.sourceData.detail,car=r.sourceData.vehicle;
 const flat=d.upgrades.flatMap(a=>a.types),byDrive={};
 for(const driveOption of d.drivetrainOptions||[]){
  const drive=driveOption.attrs.Drive||car.drive,parts=driveOption.parts||[],sets={};
  const find=part=>parts.find(p=>p.part===part)||flat.find(p=>p.part===part);
  for(const mode of ['track','dirt','drift']){
   const fields=[];
   const add=(key,u,def,range,source,part)=>{
    if(!Number.isFinite(def)||!range?.every(Number.isFinite)||range[0]>=range[1])return;
    fields.push({l:key,u,min:range[0],max:range[1],k:1,a:{key,def:String(Math.min(range[1],Math.max(range[0],def)))},provenance:source,part:part?.name||null,partId:part?.id||null,sourceDefault:def});
   };
   const sd=flat.find(t=>t.part==='SpringDamper');
   const opt=sd?.options.find(o=>!o.stock&&(mode==='dirt'?/Rally/i:mode==='drift'?/Drift/i:/^Race/i).test(o.name))
    ||sd?.options.find(o=>/^Race/i.test(o.name))||sd?.options.find(o=>o.level>=3)||sd?.options.find(o=>o.stock);
   const sr=d.perf.rows.SpringDamper?.[opt?.id];
   if(sr)for(const [side,v]of [['front',sr[1]],['rear',sr[2]]]){
    add(side+'_spring','lb/in',v[3]/(4.4482216152605/25.4),[v[4]/(4.4482216152605/25.4),v[5]/(4.4482216152605/25.4)],'part-database',opt);
    add(side+'_ride_height','in',v[0]/.0254,[v[1]/.0254,v[2]/.0254],'part-database',opt);
    add(side+'_bump','',v[6],[v[7],v[8]],'part-database',opt);add(side+'_rebound','',v[9],[v[10],v[11]],'part-database',opt);
    if(opt?.level>=3){add(side+'_camber','°',v[12],G.camberDeg,'game-global-settings',opt);add(side+'_toe','°',v[13],G.toeDeg,'game-global-settings',opt);if(side==='front')add('caster','°',v[14],G.casterDeg,'game-global-settings',opt)}
   }
   for(const [part,side]of [['AntiSwayFront','front'],['AntiSwayRear','rear']]){
    const o=flat.find(t=>t.part===part)?.options.find(o=>/^Race/i.test(o.name)),v=d.perf.rows[part]?.[o?.id]?.[0];
    if(v)add(side+'_swaybar','',v[0],[v[1],v[2]],'part-database',o);
   }
   const tc=flat.find(t=>t.part==='TireCompound'),to=tc?.options.find(o=>o.stock),tv=d.perf.rows.TireCompound?.[to?.id];
   if(tv){add('front_tire_pressure','psi',tv[1],G.tirePressurePsi,'game-global-settings',to);add('rear_tire_pressure','psi',tv[2],G.tirePressurePsi,'game-global-settings',to)}
   const tr=find('Transmission');
   const trans=mode==='drift'?tr?.options.find(o=>/^Drift/i.test(o.name)):null;
   const transOpt=trans||tr?.options.find(o=>/^Race Transmission$/.test(o.name))||tr?.options.find(o=>o.stock);
   const tx=S.rows.Transmission?.[transOpt?.id];
   if(tx&&transOpt?.level>=2)add('final_drive','',tx[1],G.finalDrive,'game-global-settings',transOpt);
   if(tx&&transOpt?.level>=3)tx[6].slice(1).slice(0,10).forEach((v,i)=>add('gear_'+(i+1),'',v,G.gearRatio,'game-global-settings',transOpt));
   const df=find('Differential'),diffOpt=df?.options.find(o=>(mode==='dirt'?/^Rally/:mode==='drift'?/^Drift/:/^Race/).test(o.name))||df?.options.find(o=>/^Race/.test(o.name))||df?.options.find(o=>o.stock);
   const dv=S.rows.Differential?.[diffOpt?.id];
   if(dv&&diffOpt?.level>=2){
    if(drive!=='RWD'){add('front_accel','%',dv[0]*100,G.lsdAccelDecel.map(v=>v*100),'game-global-settings',diffOpt);add('front_decel','%',dv[1]*100,G.lsdAccelDecel.map(v=>v*100),'game-global-settings',diffOpt)}
    if(drive!=='FWD'){add('rear_accel','%',dv[2]*100,G.lsdAccelDecel.map(v=>v*100),'game-global-settings',diffOpt);add('rear_decel','%',dv[3]*100,G.lsdAccelDecel.map(v=>v*100),'game-global-settings',diffOpt)}
    if(drive==='AWD')add('center_balance','%',dv[6]*100,G.centerTorqueSplit.map(v=>v*100),'game-global-settings',diffOpt);
   }
   const brakes=flat.find(t=>t.part==='Brakes'),bo=brakes?.options.find(o=>/^Race/.test(o.name))||brakes?.options.find(o=>o.stock);
   if(bo?.level>=3){add('brake_balance','%',50,[0,100],'captured-game-ui',bo);add('brake_pressure','%',100,[0,200],'captured-game-ui',bo)}
   for(const [part,side]of [['FrontBumper','front'],['RearWing','rear']]){
    const ao=flat.find(t=>t.part===part)?.options.find(o=>/^Race/.test(o.name))||flat.find(t=>t.part===part)?.options.find(o=>o.stock);
    const av=d.perf.rows[part]?.[ao?.id]?.[0];
    if(av)add(side+'_downforce','lb',av[0]+(av[1]-av[0])*av[4],[av[0],av[1]],'part-database-lbf-at-100mph',ao);
   }
   assert(fields.some(f=>f.a.key==='front_tire_pressure'),item.slug+' missing tires');
   assert(new Set(fields.map(f=>f.a.key)).size===fields.length);
   sets[mode]=fields;
  }
  byDrive[drive]=sets;
 }
 if(!byDrive[car.drive])throw Error('Missing stock drivetrain '+item.slug);
 r.fieldSetsByDrive=byDrive;r.fieldSets=byDrive[car.drive];r.fields=r.fieldSets.track;
 r.allowedDrivetrains=Object.keys(byDrive);r.parameterSources=sources;r.complete=true;r.tuningDataVersion=8;r.tuningOptimality='calculated-baseline';
 r.qualityNote='Regolazioni disponibili per i componenti indicati: limiti delle parti dal database di gioco; limiti comuni dalle impostazioni del gioco e dalle schermate documentate. Valori consigliati calcolati, da affinare guidando.';
 const bytes=Buffer.from(JSON.stringify(r));await fs.writeFile(file,bytes);
 const mr=manifest.records.find(x=>x.slug===r.slug);mr.bytes=bytes.length;mr.sha256=hash(bytes);
 completed.push({slug:r.slug,drives:r.allowedDrivetrains,cursors:Object.fromEntries(Object.entries(byDrive).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([m,fs])=>[m,fs.length]))]))});
}
assert.equal(completed.length,44);
manifest.complete=manifest.total;await fs.writeFile(root+'data/archive.json',JSON.stringify(manifest));
const status=JSON.parse(await fs.readFile(root+'data/status.json'));status.complete=manifest.total;status.daVerificare=0;status.tuningParametersCompleted=44;await fs.writeFile(root+'data/status.json',JSON.stringify(status));
await fs.writeFile(root+'data/tuning-completion.json',JSON.stringify({checkedAt:'2026-10-21',sources,completed,notes:['Complete means documented parameter coverage for available components, not a measured optimal tune.','Part selection changes limits; generated values remain starting points.','Aero data are lbf at 100 mph, converted to kgf for metric display.']}));
console.log('Completed documented tuning parameters for '+completed.length+' cars.');
