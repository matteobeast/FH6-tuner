import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseMetaHTML,parsePatches,assessPatch,buildMeta,updateMeta,META_URL,PATCH_URL} from '../scripts/update-meta.mjs';
const pub=new URL('../public/',import.meta.url),data=JSON.parse(await fs.readFile(new URL('data/meta.json',pub)));
const rows=JSON.parse(await fs.readFile(new URL('./fixtures/meta/rows.json',import.meta.url)));
const html='<script>self.__next_f.push('+JSON.stringify([1,'17:'+JSON.stringify(['$','$L1a',null,{entries:rows}])+'\n'])+')</script>';
const now=new Date('2026-10-21T17:37:00Z');
const article=(title,body,id=1)=>({id,title,body,html_url:'https://support.forza.net/hc/en-us/articles/'+id+'-test',draft:false});
const patchRaw=JSON.stringify({next_page:null,articles:[article('FH6 Release Notes: October 5, 2026','<p>New Engine Swaps:</p><table><tr><td>Racing V12</td><td>2020 Lamborghini Essenza SCV12 &amp; 2008 Maserati MC12 Versione Corsa</td></tr></table><ul><li>Fixed tyre scrub audio while stationary; improved engine power sound.</li></ul>'),article('FH6 Release Notes: November 5, 2026','<p>A future patch must never be applied early. This synthetic fixture tests the release-date boundary independently of the creation date.</p>',2)]});
const patches=parsePatches(patchRaw,now);
test('published meta codes identify real local cars, photos and stock polygons',async()=>{
 assert(data.entries.length>=20);assert.equal(new Set(data.entries.map(e=>e.id)).size,data.entries.length);
 assert.equal(new Set(data.entries.map(e=>e.discipline)).size,3);
 for(const e of data.entries){const c=data.profiles[e.slug];assert(c);assert.equal(Number(e.carId),Number(c.source.carId));assert(Number.isInteger(Number(e.carId)));assert(/^\d{3} \d{3} \d{3}$/.test(e.code));assert(['Meta+','Meta'].includes(e.tier));assert.equal(e.finalRatings,null);assert.equal(e.finalPI,null);assert(e.source.startsWith('https://fhstats.com/metacars/'));assert.equal(e.cap,{C:500,B:600,A:700,S1:800,S2:900,R:998}[e.class]);}
 for(const c of Object.values(data.profiles)){for(const k of ['speed','handling','accel','launch','braking','offroad'])assert(Number.isFinite(c.stock.ratings[k])&&c.stock.ratings[k]>=.1&&c.stock.ratings[k]<=10);assert((await fs.stat(new URL('.'+c.image,pub))).size>0)}
});
test('published JSON is decoded without executing scripts and malformed payloads fail closed',()=>{
 assert.equal(parseMetaHTML(html).length,rows.length);
 assert.throws(()=>parseMetaHTML('<script>throw new Error("do not execute")</script>'),/incompleto/);
 assert.throws(()=>parsePatches('{"articles":[],"next_page":null}',now),/non riconosciuto/);
 assert.throws(()=>parsePatches('{"articles":[{}],"next_page":"more"}',now),/incompleto/);
 assert.equal(patches.length,1);assert.equal(patches[0].date,'2026-10-05');assert.equal(patches[0].changes.length,1);assert.equal(patches[0].changes[0].kind,'engine-options');
});
test('patch assessment uses the exact car variant, source date and tyre type, without inventing buffs',()=>{
 const car={year:2020,name:'Lamborghini Essenza SCV12'};
 assert.equal(assessPatch({updatedAt:'2026-08-19'},car,patches).status,'review');
 assert.equal(assessPatch({updatedAt:'2026-10-06'},car,patches).status,'source-updated');
 assert.equal(assessPatch({}, {year:2004,name:'Maserati MC12'},patches).status,'listed');
 const tyrePatch=[{date:'2026-06-15',url:PATCH_URL,changes:[{kind:'mechanics',tyres:'drag',matchText:'Adjustments to the physics of Drag Tires.',summary:'Drag tyre physics change'}]}];
 assert.equal(assessPatch({buildType:'Drift tyres'},car,tyrePatch).status,'listed');
 assert.equal(assessPatch({buildType:'Drag tyres'},car,tyrePatch).status,'review');
});
test('weekly diffs track additions, removed recommendations, tier changes and new codes',()=>{
 const baseline=buildMeta({rows,patches,profiles:data.profiles,now});
 const target=baseline.entries[0],changed=rows.map(r=>r.id===target.id?{...r,tier:r.tier==='S+'?'S':'S+',tuneCode:'123 456 789'}:r);
 const next=buildMeta({rows:changed,patches,profiles:data.profiles,previous:baseline,now:new Date('2026-10-22T17:37:00Z')});
 assert.equal(next.entries.find(e=>e.id===target.id).change,'tune');assert.equal(next.changes.tunes,1);
 const downgraded=buildMeta({rows:rows.filter(r=>r.id!==target.id),patches,profiles:data.profiles,previous:baseline,now});assert(downgraded.changes.removed.some(e=>e.id===target.id));
 const invalid=buildMeta({rows:rows.map(r=>r.id===target.id?{...r,tuneCode:'not a code'}:r),patches,profiles:data.profiles,now});assert(!invalid.entries.some(e=>e.id===target.id));
});
async function temporaryRoot(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'fh6-meta-'));await fs.mkdir(path.join(root,'public/data'),{recursive:true});await fs.writeFile(path.join(root,'public/data/meta.json'),JSON.stringify({...data,startsAt:'2026-10-08T14:30:00Z'}));await fs.writeFile(path.join(root,'public/data/cars.json'),'{"cars":[]}');await fs.writeFile(path.join(root,'public/data/eventi.json'),JSON.stringify({profiles:data.profiles}));return root}
test('weekly update performs two source reads, then zero on any same-week rerun',async t=>{
 const root=await temporaryRoot();t.after(()=>fs.rm(root,{recursive:true,force:true}));const calls=[];
 const fetchSource=async url=>{calls.push(url);return url===META_URL?html:patchRaw};
 assert.equal((await updateMeta({root,now,fetchSource})).requests,2);assert.deepEqual(calls.sort(),[META_URL,PATCH_URL].sort());
 const file=path.join(root,'public/data/meta.json'),saved=await fs.readFile(file,'utf8');
 assert.equal((await updateMeta({root,now,fetchSource})).requests,0);assert.equal(calls.length,2);assert.equal(await fs.readFile(file,'utf8'),saved);
});
test('a failed or malformed source cannot overwrite the previous archive',async t=>{
 const root=await temporaryRoot();t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'public/data/meta.json'),saved=await fs.readFile(file,'utf8');
 await assert.rejects(updateMeta({root,now,fetchSource:async url=>{if(url===PATCH_URL)throw Error('offline');return html}}),/conservato/);assert.equal(await fs.readFile(file,'utf8'),saved);
 await assert.rejects(updateMeta({root,now,fetchSource:async url=>url===META_URL?'<html>maintenance</html>':patchRaw}),/incompleto/);assert.equal(await fs.readFile(file,'utf8'),saved);
});
