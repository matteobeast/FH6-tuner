const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('public/tuner-core.js','utf8'),ctx);
const C=ctx.TunerCore;
const field=(key,min,max,u='',k=1,def=(min+max)/2)=>({l:key,min,max,u,k,a:{key,def:String(def)}});
const fields=[field('front_tire_pressure',15,55,'psi'),field('rear_tire_pressure',15,55,'psi'),field('final_drive',2.2,6.1),...Array.from({length:6},(_,i)=>field('gear_'+(i+1),.48,6)),field('front_camber',-5,5,'°'),field('rear_camber',-5,5,'°'),field('front_toe',-5,5,'°'),field('rear_toe',-5,5,'°'),field('caster',1,7,'°'),field('front_swaybar',1,65),field('rear_swaybar',1,65),field('front_spring',20,200,'lb/in',7.9593129659876),field('rear_spring',31.1,200,'lb/in',7.9593129659876),field('front_ride_height',.1628,.2155,'in',39.3701),field('rear_ride_height',.1678,.2201,'in',39.3701),field('front_bump',1,20),field('rear_bump',1,20),field('front_rebound',1,20),field('rear_rebound',1,20),field('front_downforce',70.6,117.6),field('rear_downforce',114.6,229.9),field('brake_balance',30,70,'%'),field('brake_pressure',50,150,'%'),field('front_accel',0,1,'%',100),field('front_decel',0,1,'%',100)];
const record={spec:{fp:60,w:1394,wu:'kg',drivetrain:'FWD',pi:484},fields};
let count=0;
for(const stock of ['FWD','RWD'])for(const mode of ['track','dirt','drift'])for(const drive of ['FWD','RWD','AWD'])for(const style of ['stable','balanced','sharp'])for(const metric of [true,false]){
 const rec={...record,spec:{...record.spec,drivetrain:stock}};
 const rows=C.tune(rec,mode,metric,{drive,style});
 assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
 assert(rows.length>=30);
 for(const r of rows){assert(Number.isFinite(r.value));assert(r.value>=r.min&&r.value<=r.max);}
 const diff=rows.filter(r=>r.section==='diff');
 assert.equal(diff.length,drive==='AWD'?5:2);
 assert(diff.every(r=>drive==='AWD'||r.key.startsWith(drive==='FWD'?'front_':'rear_')));
 count++;
}
const tune=(mode='track',opts={},metric=true)=>C.tune(record,mode,metric,opts);
const value=(rows,key)=>rows.find(r=>r.key===key).value;
assert(value(tune('dirt'),'front_ride_height')>value(tune(),'front_ride_height'));
assert(value(tune('dirt'),'front_spring')<value(tune(),'front_spring'));
assert.notEqual(value(tune('track',{style:'stable'}),'rear_swaybar'),value(tune('track',{style:'sharp'}),'rear_swaybar'));
assert.notEqual(value(tune('track',{frontPercent:55,weight:1500}),'front_spring'),value(tune(),'front_spring'));
assert.equal(value(tune('track',{},false),'front_tire_pressure'),29);
assert.equal(value(tune(),'front_tire_pressure'),2);
assert(tune().some(r=>r.key==='gear_1'&&r.kind==='default'));
assert(!C.tune({...record,fields:[...fields.filter(f=>f.a.key!=='caster'),field('unknown',0,10),field('caster',7,7)]},'track',true).some(r=>r.key==='unknown'||r.key==='caster'));
const build={areas:[{slots:[{slot:'SpringDamper',label:'Suspension',stockIdx:0,opts:[{id:1,isStock:true,tier:'Stock'},{id:2,tier:'Race'},{id:3,tier:'Rally'}]}]}]};
assert.equal(C.upgradePlan({...record,build},'dirt',800,false).items[0].id,3);
assert.equal(C.upgradePlan({...record,build},'track',800,true).items.length,0);
console.log(`PASS ${count} configuration combinations; terrain, traction, units, mounted data and upgrade plans.`);
module.exports={record};
