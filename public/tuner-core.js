
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
if(unit==='psi')return [x/14.5037738,'bar'];if(unit==='lb/in')return [x*4.4482216152605/25.4,'N/MM'];if(unit==='kgf/mm')return [x*9.80665,'N/MM'];if(unit==='in')return [x*2.54,'cm'];if(/^lbs?$/.test(unit))return [x*0.45359237,'kg'];return [x,unit];
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
 if(/tire_pressure/.test(key)){raw=f.u==='psi'?(dirt?26:dr?(frontAx?27.6:34.8-powerLoad*.08):29)+(powerRatio!==null&&!frontAx&&!dirt&&!dr?powerLoad*.04:0)+(drive==='RWD'&&!frontAx?-.5:0):raw;kind='suggested';}
 else if(/camber/.test(key)){raw=dirt?(frontAx?-.8:-.5):dr?(frontAx?-5:-1):(frontAx?-1.5:-.8);kind='suggested';}
 else if(/toe/.test(key)){raw=dr?(frontAx?-.5:.1):frontAx?0:(style==='stable'?.15:style==='sharp'?0:.1);kind='suggested';}
 else if(key==='caster'){raw=dr?7:dirt?5.5:6;kind='suggested';}
 else if(/swaybar/.test(key)){raw=mix((dr?(frontAx?.5:.25):dirt?axle*.5:axle)+traction+bias*sign);kind='suggested';}
 else if(/spring$/.test(key)){raw=mix((dr?(frontAx?.85:.35):dirt?axle*.55:axle)+traction*.4+bias*sign*.3)*weightFactor;kind='suggested';}
 else if(/ride_height/.test(key)){raw=mix(dirt?(frontAx?.78:.82):dr?(frontAx?0:.08):(frontAx?.03:.06));kind='suggested';}
 else if(/rebound|bump/.test(key)){raw=mix((dr?(frontAx?.55:.35):dirt?axle*.65:axle)*(/bump/.test(key)?(dirt?.45:.6):1)+bias*sign*.25);kind='suggested';}
 else if(/downforce/.test(key)){raw=mix(dr?0:dirt?(frontAx?.4:.55):(frontAx?.55:.65));kind='suggested';}
 else if(key==='final_drive'){raw=mix(dr?(.72-powerLoad*.004):dirt?(.62-powerLoad*.003):(.5-powerLoad*.006));kind='suggested';}
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


const classes=[{id:'D',min:100,max:400},{id:'C',min:401,max:500},{id:'B',min:501,max:600},{id:'A',min:601,max:700},{id:'S1',min:701,max:800},{id:'S2',min:801,max:900},{id:'R',min:901,max:998},{id:'X',min:999,max:999}];
function classForPI(pi){return classes.find(c=>Number(pi)>=c.min&&Number(pi)<=c.max)?.id||'—'}
function upgradePlan(record,mode,target,currentOnly,options={}){
 const result={items:[],exactPI:false,steps:[],warnings:[]};
 if(currentOnly)return {...result,reason:'Mantieni i tuoi componenti: qui modifichi soltanto la messa a punto.'};
 const stockPI=Number(record.spec?.pi),targetClass=classes.find(c=>c.id===options.targetClass)||classes.find(c=>c.max===target);
 const cap=targetClass?.max||Number(target),gap=cap-stockPI,high=cap>=800;
 result.targetClass=targetClass?.id||classForPI(cap);result.cap=cap;
 if(stockPI>cap)return {...result,blocked:true,reason:'Di serie questa auto è già '+classForPI(stockPI)+' '+stockPI+', oltre il limite '+cap+'. Non posso verificare una preparazione per questa classe: scegli una classe superiore o un’altra auto.'};
 if(stockPI===cap)return {...result,atCap:true,exactPI:true,reason:'Di serie è già al limite della classe '+result.targetClass+'. Parti dai componenti originali: qualsiasi upgrade va verificato per non superare '+cap+' PP.'};
 const slots=record.build?.areas?.flatMap(a=>a.slots||[])||[];
 if(!slots.length)return {...result,reason:'Il catalogo dei componenti di questa auto non è disponibile. Nessuna lista inventata.'};
 const drive=options.drive||record.spec?.drivetrain||'RWD',dirt=mode==='dirt',drift=mode==='drift',stable=options.style==='stable';
 const get=key=>slots.find(s=>s.slot===key);
 const choose=(key,patterns)=>{
  const slot=get(key);if(!slot)return null;
  const choices=slot.opts.filter(o=>!o.isStock&&o.id!==slot.opts[slot.stockIdx]?.id&&(!o.mfr||!options.make||o.mfr.toLowerCase()===options.make.toLowerCase()));
  for(const pattern of patterns){const matches=choices.filter(o=>pattern.test(o.tier||'')).sort((a,b)=>(a.level||0)-(b.level||0)||(a.price||0)-(b.price||0)||a.id-b.id);if(matches[0])return matches[0]}
  return null;
 };
 const add=(key,patterns,phase,why,optional=false)=>{
  const option=choose(key,patterns);if(!option)return;
  result.items.push({slot:key,label:slotNames[key]||get(key).label,tier:option.tier,price:Number(option.price)||0,id:option.id,img:option.img||null,icon:get(key).emblem||get(key).icon||null,source:'class-plan',phase,why,optional});
 };
 add('TireCompound',drift?[/Drift/i]:dirt?[/Rally/i,/Off.?road/i]:high?[/^Semi.Slick/i,/^Slick Race/i,/Sport/i]:[/Sport/i,/Street/i],1,drift?'Mescola dedicata al controllo della derapata.':dirt?'Priorità alla trazione sui fondi sconnessi.':'Priorità al grip in curva; controlla quanto PI assorbono le gomme.');
 add('SpringDamper',drift?[/Drift/i]:dirt?[/Rally/i]:[/Race/i],1,dirt?'Escursione e regolazioni adatte allo sterrato.':drift?'Angolo di sterzo e assetto dedicati al drift.':'Sblocca molle, altezza, geometria e ammortizzatori.');
 add('Differential',drift?[/Drift/i,/Race/i]:dirt?[/Rally/i,/Off.?road/i,/Race/i]:[/Race/i],1,'Permette di regolare bloccaggio e trazione in uscita.');
 for(const key of ['AntiSwayFront','AntiSwayRear'])add(key,[/Race/i],2,stable?'Bilancia gli assi per un comportamento più prevedibile.':'Permette di correggere sottosterzo e sovrasterzo.');
 add('Transmission',drift?[/Drift.*4 Speed/i,/Race Transmission$/i]:[/Race Transmission$/i,/Sport/i],2,'Rapporti regolabili per il percorso scelto; evita marce in più se non servono.');
 add('Brakes',[/Race/i,/Sport/i],2,'Più controllo e possibilità di regolare la frenata.',gap<50);
 add('WeightReduction',high?[/Race/i,/Sport/i]:[/Sport/i,/Street/i],2,'Riduce la massa: confronta il beneficio con il PI richiesto.',true);
 if(!drift&&high){add('RearWing',[/Race/i],2,dirt?'Stabilità nei tratti veloci, da confrontare con la velocità massima.':'Appoggio nelle curve veloci, a costo di resistenza aerodinamica.',true);if(!stable)add('FrontBumper',[/Race/i],2,'Bilancia il carico anteriore se monti l’aerodinamica regolabile.',true)}
 const axle=drive==='FWD'?'TireWidthFront':'TireWidthRear';
 add(axle,[/Upgraded/i],2,drive==='FWD'?'Valuta più impronta sulle ruote anteriori motrici.':'Valuta più impronta sulle ruote posteriori per scaricare la potenza.',true);
 const grades=gap>180?[/Race/i,/Sport/i]:gap>70?[/Sport/i,/Street/i,/Race/i]:[/Street/i,/Sport/i];
 for(const key of ['Intake','Exhaust','Flywheel'])add(key,grades,3,'Solo se rimangono PP: monta un livello alla volta e controlla il contatore.',true);
 if(gap>100)for(const key of ['Camshaft','SingleTurbo'])add(key,grades,3,'Alternativa per aggiungere potenza. Fermati prima di oltrepassare il limite; verifica la compatibilità con il motore montato.',true);
 result.cost=result.items.filter(i=>!i.optional).reduce((sum,i)=>sum+i.price,0);
 result.steps=['Monta prima gomme, sospensioni e differenziale. Controlla i PP dopo ogni pezzo.','Completa telaio e trasmissione solo finché resti nella classe. Gli elementi facoltativi sono alternative.','Usa i PP rimasti per la potenza, un upgrade alla volta. Se superi il limite, riduci prima il livello degli upgrade facoltativi.','Inserisci PP, CV, peso e distribuzione effettivi per calcolare l’assetto dopo il montaggio.'];
 if(drive!==record.spec?.drivetrain)result.warnings.push('Hai scelto '+drive+' al posto di '+record.spec?.drivetrain+': la conversione e la compatibilità dei pezzi vanno verificate nel gioco. Il catalogo non identifica con certezza il kit di conversione.');
 if(gap>200)result.warnings.push('Il salto dalla classe di serie è ampio: questa auto potrebbe non essere competitiva o raggiungere il limite scelto. Valuta anche un’auto che nasce più vicina alla classe desiderata.');
 if(gap<30)result.warnings.push('Restano solo '+gap+' PP prima del limite: non montare tutta la lista. Confronta singolarmente i benefici dei pezzi.');
 result.reason='Piano per '+result.targetClass+' · limite '+cap+' PP. Priorità e livelli sono consigliati per l’uso scelto; il PI finale delle combinazioni non è disponibile, quindi il raggiungimento del limite e la competitività non sono certificati.';
 return result;
}
root.TunerCore={tune,upgradePlan,sectionNames,slotNames,classes,classForPI};
})(globalThis);
