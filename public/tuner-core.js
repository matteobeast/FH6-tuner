
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const sectionNames={tires:'Pneumatici',gearing:'Rapporti',alignment:'Allineamento',bars:'Barre antirollio',springs:'Molle e altezza',damping:'Ammortizzatori',aero:'Aerodinamica',brake:'Freni',diff:'Differenziale'};
const labels={front_tire_pressure:'Pressione anteriore',rear_tire_pressure:'Pressione posteriore',final_drive:'Rapporto finale',front_camber:'Campanatura anteriore',rear_camber:'Campanatura posteriore',front_toe:'Convergenza anteriore',rear_toe:'Convergenza posteriore',caster:'Incidenza',front_swaybar:'Barra anteriore',rear_swaybar:'Barra posteriore',front_spring:'Molle anteriori',rear_spring:'Molle posteriori',front_ride_height:'Altezza anteriore',rear_ride_height:'Altezza posteriore',front_bump:'Compressione anteriore',rear_bump:'Compressione posteriore',front_rebound:'Estensione anteriore',rear_rebound:'Estensione posteriore',front_downforce:'Carico anteriore',rear_downforce:'Carico posteriore',brake_balance:'Bilanciamento anteriore',brake_pressure:'Pressione freni',front_accel:'Ant. accelerazione',rear_accel:'Post. accelerazione',front_decel:'Ant. decelerazione',rear_decel:'Post. decelerazione',center_balance:'Ripartizione centrale · posteriore',center_diff:'Ripartizione centrale · posteriore'};
const slotNames={Intake:'Aspirazione',FuelSystem:'Alimentazione',Ignition:'Accensione',Exhaust:'Scarico',Camshaft:'Albero a camme',Valves:'Valvole',Displacement:'Cilindrata',PistonsCompression:'Pistoni',Flywheel:'Volano',OilCooling:'Raffreddamento',Intercooler:'Intercooler',SingleTurbo:'Turbo',TwinTurbo:'Doppio turbo',Brakes:'Freni',SpringDamper:'Sospensioni',AntiSwayFront:'Barre anteriori',AntiSwayRear:'Barre posteriori',ChassisStiffness:'Irrigidimento telaio',WeightReduction:'Riduzione peso',Clutch:'Frizione',Transmission:'Cambio',Driveline:'Albero trasmissione',Differential:'Differenziale',TireCompound:'Mescola gomme',TireWidthFront:'Larghezza gomme anteriori',TireWidthRear:'Larghezza gomme posteriori',FrontBumper:'Paraurti anteriore',RearWing:'Alettone',Engine:'Cambio motore',Drivetrain:'Conversione trazione',CarBody:'Carrozzeria'};
function group(key){
if(/tire_pressure/.test(key))return 'tires';if(/gear_|final_drive/.test(key))return 'gearing';if(/camber|toe|caster/.test(key))return 'alignment';if(/swaybar/.test(key))return 'bars';if(/spring|ride_height/.test(key))return 'springs';if(/bump|rebound/.test(key))return 'damping';if(/downforce/.test(key))return 'aero';if(/brake/.test(key))return 'brake';return 'diff';
}
function convert(unit,x,metric){
if(!metric)return [x,unit];
if(unit==='psi')return [x/14.5037738,'bar'];if(unit==='lb/in')return [x*0.017857967,'kgf/mm'];if(unit==='in')return [x*2.54,'cm'];if(/^lbs?$/.test(unit))return [x*0.45359237,'kg'];return [x,unit];
}
function tune(record,mode,metric,options={}){
const dr=mode==='drift',dirt=mode==='dirt',drive=['FWD','RWD','AWD'].includes(options.drive)?options.drive:(record.spec?.drivetrain||'RWD');
const style=options.style||'balanced',bias=style==='stable'?.06:style==='sharp'?-.06:0;
const fp=Number(options.frontPercent||record.spec?.fp||50),front=clamp(fp/100,.1,.9);
const stockWeight=Number(record.spec?.w)*(/^lb/.test(record.spec?.wu||'')?.45359237:1);
const weightFactor=options.weight&&stockWeight>0?clamp(options.weight/stockWeight,.5,2):1;
const powerRatio=Number(options.powerCV)>0&&Number(options.weight)>0?options.powerCV/options.weight:null;
const powerLoad=powerRatio===null?0:clamp((powerRatio-.25)*40,-6,12);
const fields=(record.fields||[]).filter(f=>!/^(front|rear)_(accel|decel)$|^center_(balance|diff)$/.test(f.a?.key||''));
const diffSource=(record.fields||[]).filter(f=>/^(front|rear)_(accel|decel)$|^center_(balance|diff)$/.test(f.a?.key||''));
const keys=drive==='AWD'?['front_accel','front_decel','rear_accel','rear_decel','center_balance']:drive==='FWD'?['front_accel','front_decel']:['rear_accel','rear_decel'];
for(const key of keys){
 const found=diffSource.find(f=>f.a.key===key||(key==='center_balance'&&f.a.key==='center_diff'));
 const template=found||diffSource.find(f=>f.a.key.endsWith(key.split('_')[1]))||diffSource[0];
 if(template)fields.push({...template,l:labels[key],a:{...template.a,key},derived:!found});
 else fields.push({l:labels[key],u:'%',min:0,max:1,k:100,a:{key,def:'0'},derived:true});
}
return fields.map(f=>{
 const key=f.a?.key||'',min=Number(f.min),max=Number(f.max),scale=Number(f.k??1),def=Number(f.a?.def);
 if(![min,max,scale].every(Number.isFinite)||min>=max||scale<=0||(!labels[key]&&!/^gear_\d+$/.test(key)))return null;
 let raw=Number.isFinite(def)?def:null,kind='default';
 const mix=x=>min+clamp(x,0,1)*(max-min),frontAx=key.startsWith('front_');
 const axle=frontAx?front:1-front,sign=frontAx?1:-1;
 const traction=(drive==='FWD'?-.07:drive==='RWD'?.035:0)*sign;
 if(/tire_pressure/.test(key)){raw=f.u==='psi'?(dirt?26:dr?(frontAx?27.6:34.8):29)+(powerRatio!==null&&!frontAx&&!dirt&&!dr?powerLoad*.04:0)+(drive==='RWD'&&!frontAx?-.5:0):raw;kind='suggested';}
 else if(/camber/.test(key)){raw=dirt?(frontAx?-.8:-.5):dr?(frontAx?-5:-1):(frontAx?-1.5:-.8);kind='suggested';}
 else if(/toe/.test(key)){raw=dr?(frontAx?-.5:.1):frontAx?0:(style==='stable'?.15:style==='sharp'?0:.1);kind='suggested';}
 else if(key==='caster'){raw=dr?7:dirt?5.5:6;kind='suggested';}
 else if(/swaybar/.test(key)){raw=mix((dr?(frontAx?.5:.25):dirt?axle*.5:axle)+traction+bias*sign);kind='suggested';}
 else if(/spring$/.test(key)){raw=mix((dr?(frontAx?.85:.35):dirt?axle*.55:axle)+traction*.4+bias*sign*.3)*weightFactor;kind='suggested';}
 else if(/ride_height/.test(key)){raw=mix(dirt?(frontAx?.78:.82):dr?(frontAx?0:.08):(frontAx?.03:.06));kind='suggested';}
 else if(/rebound|bump/.test(key)){raw=mix((dr?(frontAx?.55:.35):dirt?axle*.65:axle)*(/bump/.test(key)?(dirt?.45:.6):1)+bias*sign*.25);kind='suggested';}
 else if(/downforce/.test(key)){raw=mix(dr?0:dirt?(frontAx?.4:.55):(frontAx?.55:.65));kind='suggested';}
 else if(key==='final_drive'){raw=mix(dr?.72:dirt?.62:(.5-powerLoad*.006));kind='suggested';}
 else if(key==='brake_balance'){raw=dr?clamp(fp-8,38,52):clamp(fp+(dirt?5:3),47,62);kind='suggested';}
 else if(key==='brake_pressure'){raw=dirt?95:100;kind='suggested';}
 else if(/accel|decel|center/.test(key)){
  let percent;
  if(/center/.test(key))percent=(dr?85:dirt?60:68)+(style==='stable'?-5:style==='sharp'?5:0);
  else if(/decel/.test(key))percent=(dr?(frontAx?10:75):dirt?(frontAx?8:15):(frontAx?6:18))+(style==='stable'?5:style==='sharp'?-3:0);
  else percent=dr?(drive==='FWD'?50:frontAx?15:95):dirt?(frontAx?30:50):(frontAx?22:65);
  if(/accel/.test(key)&&!dr)percent+=powerLoad*(frontAx?.35:.7);
  raw=max<=1?percent/100:percent;kind='suggested';
 }
 if(raw===null)return null;raw=clamp(raw,min,max);
 const [value,unit]=convert(f.u,raw*scale,metric),[lo]=convert(f.u,min*scale,metric),[hi]=convert(f.u,max*scale,metric);
 const digits=unit==='bar'?2:/gear_|final_drive/.test(key)?2:unit==='%'?0:1;
 return {key,label:labels[key]||key.replace('gear_','Marcia '),section:group(key),value:Number(value.toFixed(digits)),unit,min:Number(lo.toFixed(digits)),max:Number(hi.toFixed(digits)),kind,raw,derived:!!f.derived};
}).filter(Boolean);
}

function upgradePlan(record,mode,target,currentOnly){
const build=record.build;if(!build?.areas)return {items:[],reason:'I componenti di questa auto non sono ancora disponibili nel database.',exactPI:false};
const slots=build.areas.flatMap(a=>a.slots||[]), stockPI=Number(record.spec?.pi);
if(currentOnly)return {items:[],reason:'Mantieni la configurazione attuale: nessuna modifica ai componenti proposta.',exactPI:false};
if(stockPI>0&&target<=stockPI)return {items:[],reason:target<stockPI?'Il PI richiesto è inferiore a quello di serie. Non è disponibile un calcolo verificato delle modifiche necessarie.':'Obiettivo uguale al PI di serie: mantieni i componenti originali.',exactPI:target===stockPI};
const preset=(build.presets||[]).find(p=>new RegExp(mode==='drift'?'drift':mode==='dirt'?'rally|dirt|off.?road':'track|race|circuit','i').test(p.title||''));
let items=[],unresolved=0;
if(preset){
for(const slot of slots){const id=preset.picks?.[slot.slot];if(id===undefined)continue;const option=slot.opts.find(o=>o.id===id);if(!option){unresolved++;continue}if(slot.opts[slot.stockIdx]?.id===id)continue;items.push({slot:slot.slot,label:slotNames[slot.slot]||slot.label,tier:option.tier,price:option.price||0,id:option.id,source:'preset'});}
return {items,preset:preset.title,cost:preset.cost,unresolved,reason:'Preset reale '+(mode==='drift'?'drift':mode==='dirt'?'sterrato':'pista')+' del catalogo. Il PI finale del preset non è pubblicato: non certifica il raggiungimento di '+target+' PI.',exactPI:false};
}
const wanted=new Set(['Brakes','SpringDamper','AntiSwayFront','AntiSwayRear','Transmission','Differential','TireCompound']);
for(const slot of slots){
if(!wanted.has(slot.slot))continue;
const candidates=slot.opts.filter(o=>o.id!==slot.opts[slot.stockIdx]?.id&&!o.isStock);
let option=candidates.find(o=>new RegExp(mode==='drift'?'Drift':mode==='dirt'?'Rally|Off.?road':'Race','i').test(o.tier));
if(!option&&mode==='dirt'&&slot.slot!=='TireCompound')option=candidates.find(o=>/Race/i.test(o.tier));
if(!option&&slot.slot==='TireCompound'&&mode!=='dirt')option=candidates.find(o=>/Sport|Semi.Slick/i.test(o.tier));if(!option)continue;
items.push({slot:slot.slot,label:slotNames[slot.slot]||slot.label,tier:option.tier,price:option.price||0,id:option.id,source:'suggested'});
}
return {items,reason:'Componenti disponibili per questo uso. Manca il PI delle combinazioni: raggiungimento di '+target+' PI non verificabile.',exactPI:false};
}
root.TunerCore={tune,upgradePlan,sectionNames,slotNames};
})(globalThis);
