import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../public/tuner-core.js';
const core=globalThis.TunerCore;
const base=new URL('../public/',import.meta.url);
const audit=JSON.parse(await readFile(new URL('data/roster-audit.json',base)));
const catalogue=JSON.parse((await readFile(new URL('index.html',base),'utf8')).match(/<script[^>]*id="catalogue"[^>]*>([^]*?)<\/script>/)[1]);
test('official roster remains reconciled, variants and future releases preserved',()=>{
 assert.equal(audit.officialCount,658);assert.equal(audit.added,44);assert.equal(catalogue.length,665);
 assert.equal(catalogue.filter(c=>c.official).length,658);assert.equal(new Set(catalogue.map(c=>c.s)).size,665);
 assert.equal(audit.legacyVariantSlugs.length,7);assert(!catalogue.some(c=>c.s==='gr-gt-prototype-2026-2'));
 assert.equal(audit.imported.filter(c=>c.releaseDate).length,4);
 assert(catalogue.some(c=>c.k==='Chevrolet'&&c.m==='Camaro ZL1'&&c.y===2017));
 assert(catalogue.some(c=>c.k==='Chevrolet'&&c.m==='Camaro ZL1'&&c.y===2024));
});
test('all 44 new cars use documented part and game-global limits for every available drive and terrain',async()=>{
 for(const entry of audit.imported){
  const r=JSON.parse(await readFile(new URL('data/cars/'+entry.slug+'.json',base)));
  assert.equal(r.complete,true);assert.equal(r.tuningDataVersion,8);assert(r.parameterSources.globals.gameFile);
  assert(r.spec.hp>0&&r.spec.w>0&&r.spec.fp>0);
  assert(r.allowedDrivetrains.includes(r.spec.drivetrain));
  for(const drive of r.allowedDrivetrains)for(const mode of ['track','dirt','drift'])for(const metric of [true,false]){
   const fields=r.fieldSetsByDrive[drive][mode],keys=new Set(fields.map(f=>f.a.key));
   assert(keys.has('front_tire_pressure'));assert(keys.has('rear_tire_pressure'));
   const rows=core.tune(r,mode,metric,{drive,frontPercent:r.spec.fp,weight:r.spec.w,powerCV:r.spec.hp*1.0138697});
   assert(rows.length>=13,entry.slug);assert.equal(rows.length,fields.length,entry.slug+' dropped a parameter');
   for(const row of rows){assert(keys.has(row.key));assert(Number.isFinite(row.value));assert(row.value>=row.min-.1&&row.value<=row.max+.1);assert(row.provenance)}
   if(drive==='FWD')assert(!rows.some(r=>r.key.startsWith('rear_accel')||r.key==='center_balance'));
   if(drive==='RWD')assert(!rows.some(r=>r.key.startsWith('front_accel')||r.key==='center_balance'));
  }
 }
 const bmw=JSON.parse(await readFile(new URL('data/cars/bmw-m4-cs-2025.json',base)));
 for(const [mode,min,max]of [['track',40,200],['dirt',20,100]]){
  const rows=core.tune(bmw,mode,true,{drive:'AWD'}),spring=rows.find(r=>r.key==='front_spring');
  assert.equal(spring.unit,'N/MM');assert.equal(spring.min,min);assert.equal(spring.max,max);
  assert.equal(rows.find(r=>r.key==='center_balance').min,1);assert.equal(rows.find(r=>r.key==='center_balance').max,99);
 }
 const status=JSON.parse(await readFile(new URL('data/status.json',base)));assert.equal(status.complete,665);assert.equal(status.daVerificare,0);
});
