import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../public/tuner-core.js';
const core=globalThis.TunerCore;
const base=new URL('../public/',import.meta.url);
const audit=JSON.parse(await readFile(new URL('data/roster-audit.json',base)));
const catalogue=JSON.parse((await readFile(new URL('index.html',base),'utf8')).match(/<script[^>]*id="catalogue"[^>]*>([^]*?)<\/script>/)[1]);
test('official roster matched once, variants preserved, future releases distinguished',()=>{
 assert.equal(audit.officialCount,658);assert.equal(audit.added,44);assert.equal(catalogue.length,665);
 assert.equal(catalogue.filter(c=>c.official).length,658);
 assert.equal(new Set(catalogue.map(c=>c.s)).size,665);
 assert.equal(audit.legacyVariantSlugs.length,7);
 assert(!catalogue.some(c=>c.s==='gr-gt-prototype-2026-2'));
 assert.equal(audit.imported.filter(c=>c.releaseDate).length,4);
 assert(catalogue.some(c=>c.k==='Chevrolet'&&c.m==='Camaro ZL1'&&c.y===2017));
 assert(catalogue.some(c=>c.k==='Chevrolet'&&c.m==='Camaro ZL1'&&c.y===2024));
});
test('new recommendations use only verified parameters and bounds for each terrain',async()=>{
 for(const entry of audit.imported){
  const r=JSON.parse(await readFile(new URL('data/cars/'+entry.slug+'.json',base)));
  assert.equal(r.complete,false);assert(r.qualityNote);assert(r.provenance.carDetailSHA256);
  assert(r.spec.hp>0&&r.spec.w>0&&r.spec.fp>0&&r.build.areas.length);
  for(const mode of ['track','dirt','drift'])for(const metric of [true,false]){
   const rows=core.tune(r,mode,metric,{drive:r.spec.drivetrain,frontPercent:r.spec.fp,weight:r.spec.w,powerCV:r.spec.hp*1.0138697});
   const keys=new Set(r.fieldSets[mode].map(f=>f.a.key));
   assert(rows.length>0,entry.slug);
   for(const row of rows){assert(keys.has(row.key),entry.slug+': invented '+row.key);assert(Number.isFinite(row.value));assert(row.value>=row.min-.1&&row.value<=row.max+.1)}
  }
 }
 const bmw=JSON.parse(await readFile(new URL('data/cars/bmw-m4-cs-2025.json',base)));
 for(const [mode,min,max]of [['track',40,200],['dirt',20,100]]){
  const row=core.tune(bmw,mode,true,{drive:'AWD'}).find(r=>r.key==='front_spring');
  assert.equal(row.unit,'N/MM');assert.equal(row.min,min);assert.equal(row.max,max);
 }
});
