import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {weekAt,officialRows,tuneGroups,buildSnapshot,updateSeasonal} from '../scripts/update-seasonal.mjs';
const fixture=new URL('./fixtures/seasonal/',import.meta.url);
const html=await fs.readFile(new URL('official.html',fixture),'utf8');
const csv=await fs.readFile(new URL('tunes.csv',fixture),'utf8');
const previous=JSON.parse(await fs.readFile(new URL('snapshot.json',fixture)));
const now=new Date('2026-10-21T17:17:00Z');
test('rotation uses the game UTC boundary, including daylight saving and next series',()=>{
 assert.equal(weekAt(new Date('2026-10-22T14:29:59Z')).englishSeason,'Autumn');
 assert.equal(weekAt(new Date('2026-10-22T14:30:00Z')).englishSeason,'Winter');
 assert.equal(weekAt(new Date('2026-10-29T14:30:00Z')).season,'Primavera');
 const next=weekAt(new Date('2026-11-05T14:30:00Z'));assert.equal(next.seriesNumber,7);assert.equal(next.englishSeason,'Summer');
});
test('official table and multiline CSV reproduce all currently documented configurations',()=>{
 assert(officialRows(html).length>10);assert(tuneGroups(csv).length>5);
 const result=buildSnapshot({html,csv,profiles:previous.profiles,now,previous});
 assert.equal(result.events.length,7);assert.equal(result.events.reduce((n,e)=>n+e.recommendations.length,0),26);
 assert.equal(result.events.find(e=>e.id==='take-it-from-the-top').mode,'dirt');
 assert.equal(result.events.find(e=>e.id==='coming-in-hot').recommendations[0].code,'175 605 880');
 assert.deepEqual(result.automation.pendingEvents,[]);
});
test('next week never inherits old codes and publishes official requirements when the tuner is absent',()=>{
 const future=html.replaceAll('Autumn','Winter').replaceAll('Coming In Hot','New Weekly Race');
 const result=buildSnapshot({html:future,csv:'not published',profiles:previous.profiles,now:new Date('2026-10-22T17:17:00Z'),previous});
 assert.equal(result.season,'Inverno');
 assert.equal(result.events.find(e=>e.name==='New Weekly Race').recommendations.length,0);
 assert(result.events.filter(e=>e.label!=='Rivali mensili').every(e=>!e.recommendations.length));
 assert(result.automation.pendingEvents.length>0);
 assert.throws(()=>buildSnapshot({html,csv,profiles:previous.profiles,now:new Date('2026-10-22T17:17:00Z'),previous}),/settimana corrente/);
 assert.throws(()=>officialRows('<html>maintenance</html>'),/non riconosciuto/);
});
test('unmatched cars, wrong classes and incompatible restrictions cannot become recommendations',()=>{
 const bad=csv.replaceAll('"1986","Honda","Civic SI"','"2026","Fake","Unreleased"').replaceAll('"Retro Hot Hatch","C","AWD"','"Retro Hot Hatch","S2","AWD"');
 const result=buildSnapshot({html,csv:bad,profiles:previous.profiles,now,previous});
 assert(result.events.find(e=>e.id==='coming-in-hot').recommendations.every(r=>r.slug!=='honda-civic-si-1986'));
 assert(result.excluded.length>0);
});
async function temporaryRoot(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fh6-weekly-'));
 await fs.mkdir(path.join(root,'public/data/cars'),{recursive:true});await fs.mkdir(path.join(root,'public/images'),{recursive:true});await fs.mkdir(path.join(root,'scripts'));
 const catalog=[];
 for(const p of Object.values(previous.profiles)){
  catalog.push({s:p.slug,n:p.year+' '+p.name,p:p.stock.pi,c:p.stock.class});
  await fs.writeFile(path.join(root,'public/images',p.slug+'.webp'),'fixture');
  await fs.writeFile(path.join(root,'public/data/cars',p.slug+'.json'),JSON.stringify({official:{make:p.make,type:p.type,year:p.year,name:p.name,country:p.country,checkedAt:'2026-10-21'},spec:{hp:p.stock.hp,w:p.stock.weight,wu:'kg',fp:p.stock.frontPercent,drivetrain:p.stock.drive},sourceData:{vehicle:{ratings:p.stock.ratings,ev:p.electric,id:p.source.carId}}}));
 }
 await fs.writeFile(path.join(root,'public/data/cars.json'),JSON.stringify({cars:catalog}));await fs.writeFile(path.join(root,'public/data/eventi.json'),JSON.stringify(previous));return root;
}
test('one normal retrieval costs two requests; reruns cost zero and do not rewrite files',async t=>{
 const root=await temporaryRoot();t.after(()=>fs.rm(root,{recursive:true,force:true}));let calls=[];
 const fetchText=async url=>{calls.push(url);return url.includes('forza.net')?html:csv};
 assert.equal((await updateSeasonal({root,now,fetchText})).requests,2);assert.equal(calls.length,2);
 const file=path.join(root,'public/data/eventi.json'),saved=await fs.readFile(file,'utf8');
 assert.equal((await updateSeasonal({root,now,fetchText})).requests,0);assert.equal(calls.length,2);assert.equal(await fs.readFile(file,'utf8'),saved);
});
test('only one conditional recovery fetches the tuner; network or schema failure preserves the published archive',async t=>{
 const root=await temporaryRoot();t.after(()=>fs.rm(root,{recursive:true,force:true}));const future=html.replaceAll('Autumn','Winter'),date=new Date('2026-10-22T17:17:00Z');let calls=[];
 const fetchText=async url=>{calls.push(url);return url.includes('forza.net')?future:'not ready'};
 await updateSeasonal({root,now:date,fetchText});assert.equal(calls.length,2);
 assert.equal((await updateSeasonal({root,now:date,fetchText})).requests,1);assert.equal(calls.length,3);assert(calls.at(-1).includes('gviz'));
 assert.equal((await updateSeasonal({root,now:date,fetchText})).requests,0);assert.equal(calls.length,3);
 const file=path.join(root,'public/data/eventi.json'),saved=await fs.readFile(file,'utf8');
 await assert.rejects(updateSeasonal({root,now:new Date('2026-10-29T17:17:00Z'),fetchText:async()=>{throw Error('offline')}}),/offline/);
 assert.equal(await fs.readFile(file,'utf8'),saved);
});
test('a delayed tuner publication fills the new week on the one permitted recovery',async t=>{
 const root=await temporaryRoot();t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const future=html.replaceAll('Autumn','Winter'),date=new Date('2026-10-22T17:17:00Z');
 await updateSeasonal({root,now:date,fetchText:async url=>url.includes('forza.net')?future:'not published'});
 let calls=0;await updateSeasonal({root,now:new Date('2026-10-23T17:17:00Z'),fetchText:async url=>{calls++;assert(url.includes('gviz'));return csv}});
 assert.equal(calls,1);const result=JSON.parse(await fs.readFile(path.join(root,'public/data/eventi.json')));
 assert.deepEqual(result.automation.pendingEvents,[]);assert.equal(result.events.reduce((n,e)=>n+e.recommendations.length,0),26);
 assert.equal((await updateSeasonal({root,now:date,fetchText:async()=>{throw Error('must not fetch')}})).requests,0);
});
