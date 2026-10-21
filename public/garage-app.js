
(async function(){
'use strict';
const $=id=>document.getElementById(id),C=globalThis.TunerCore,cars=JSON.parse($('catalogue').textContent);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let brand='',query='',catalogClass='',limit=60,selected=null,record=null,rows=[],plan=null,requestId=0,modelId=0,view3d=false,modelReady=false,libraryPromise=null,retryTimer=null,mode='track',driveChoice='',style='balanced',initialConfig=true,toastTimer,upgradeChoices={},activeUpgradePhase='all',sharedPartsApplied=false;
const params=new URLSearchParams(location.search);
if(['track','dirt','drift'].includes(params.get('mode')))mode=params.get('mode');
if(['stable','balanced','sharp'].includes(params.get('style')))style=params.get('style');
$('target-class').innerHTML=C.classes.map(c=>'<option value="'+c.id+'">'+c.id+' · '+c.min+'–'+c.max+' PP</option>').join('');
$('catalog-class').innerHTML='<option value="">Tutte le classi</option>'+C.classes.map(c=>'<option value="'+c.id+'">'+c.id+'</option>').join('');
$('style').value=style;
if(/^\d{3}$/.test(params.get('pi')||''))$('target').value=params.get('pi');
if(params.get('type')==='target')$('pi-type').value='target';
if(params.get('units')==='imperial')$('units').value='imperial';
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600)}
const brandLogos={"Abarth":"ABA.webp","Acura":"ACU.webp","Alfa Romeo":"ALF.webp","Alumicraft":"AC.webp","AMG Transport Dynamics":"AMG.webp","Apollo":"APO.webp","Ariel":"ARI.webp","Aston Martin":"AST.webp","Audi":"AUD.webp","Austin-Healey":"AH.webp","Autozam":"AZM.webp","BAC":"BAC.webp","Bentley":"BEN.webp","BMW":"BMW.webp","Buick":"BUI.webp","Cadillac":"CAD.webp","Can-Am":"CAN.webp","Casey Currie Motorsports":"CCM.webp","Chevrolet":"CHE.webp","Datsun":"DAT.webp","DeBerti":"DEB.webp","DeLorean":"DEL.webp","Dodge":"DOD.webp","Ferrari":"FER.webp","Ford":"FOR.webp","Formula Drift":"FD.webp","Funco Motorsports":"FUN.webp","GMC":"GMC.webp","Gordon Murray Automotive":"GMA.webp","GR":"GR.webp","Hennessey":"HEN.webp","Holden":"HOL.webp","Honda":"HON.webp","HSV":"HSV.webp","Hyundai":"HYU.webp","Jaguar":"JAG.webp","Jeep":"JEE.webp","Jimco":"JIM.webp","Koenigsegg":"KOE.webp","KTM":"KTM.webp","Lamborghini":"LAM.webp","Lancia":"LAN.webp","Land Rover":"LR.webp","Lexus":"LEX.webp","Lincoln":"LIN.webp","Lotus":"LOT.webp","Lucid":"LUC.webp","Maserati":"MAS.webp","Mazda":"MAZ.webp","McLaren":"MCL.webp","Mercedes-AMG":"MA.webp","Mercedes-Benz":"MER.webp","Meyers":"MEY.webp","MG":"MG.webp","MINI":"MIN.webp","Mitsubishi":"MIT.webp","Nissan":"NIS.webp","Noble":"NOB.webp","Opel":"OPE.webp","Pagani":"PAG.webp","Peel":"PEE.webp","Penhall":"PEN.webp","Peugeot":"PEU.webp","Plymouth":"PLY.webp","Polaris":"POL.webp","Pontiac":"PON.webp","Porsche":"POR.webp","Radical":"RAD.webp","Ram":"RAM.webp","Reliant":"REL.webp","Renault":"REN.webp","Rimac":"RIM.webp","RIVIAN":"RIV.webp","RJ Anderson":"RJ.webp","Saleen":"SAL.webp","Schuppan":null,"Shelby":"SHE.webp","SIERRA Cars":"SIE.webp","SRT":"SRT.webp","Subaru":"SUB.webp","Toyota":"TOY.webp","TVR":"TVR.webp","Ultima":"ULT.webp","Volkswagen":"VW.webp","Volvo":"VOL.webp","Wuling":"WUL.webp","Zenvo":"ZEN.webp"};
function brandMark(name){
 const file=brandLogos[name],initials=name.split(/[\s-]+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
 if(!name)return '<span class="brand-mark brand-all" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg></span>';
 return '<span class="brand-mark" aria-hidden="true">'+(file?'<img data-brand-logo src="/brand-assets/logos/'+esc(file)+'" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'<span class="brand-initials" '+(file?'hidden':'title="Logo non disponibile"')+'>'+esc(initials)+'</span></span>';
}

function brands(){
const counts=new Map();for(const c of cars)counts.set(c.k,(counts.get(c.k)||0)+1);
$('brands').innerHTML=[['',cars.length],...[...counts].sort((a,b)=>a[0].localeCompare(b[0]))].map(([name,n])=>'<button class="brand" data-brand="'+esc(name)+'" aria-pressed="'+(brand===name)+'">'+brandMark(name)+'<span class="brand-name">'+esc(name||'Tutte le marche')+'</span><span class="brand-count">'+n+'</span></button>').join('');
logoFallbacks();
}
function logoFallbacks(){ $('brands').querySelectorAll('img[data-brand-logo]').forEach(img=>{const fallback=()=>{img.hidden=true;img.parentNode.querySelector('.brand-initials').hidden=false;};img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();}); }
function gallery(){
const results=cars.filter(c=>(!brand||c.k===brand)&&(!catalogClass||c.c===catalogClass)&&(!query||((c.k+' '+c.m+' '+c.y).toLowerCase().includes(query))));
$('catalog-title').textContent=brand||'La tua prossima messa a punto.';
$('gallery-count').textContent=results.length+' AUTO'+(brand?' / '+brand.toUpperCase():' / TUTTE LE MARCHE');
$('gallery').innerHTML=results.slice(0,limit).map((c,i)=>'<button class="car" data-car="'+esc(c.s)+'" aria-label="'+esc(c.k+' '+c.m+' '+c.y)+'"><div class="photo"><img src="'+esc(c.h)+'" alt="'+esc(c.k+' '+c.m)+'" loading="'+(i<8?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"><span class="badge">'+esc(c.c)+' · '+esc(c.p)+' PI</span></div><div class="cardtext"><small>'+esc(c.k)+'</small><h3>'+esc(c.m)+'</h3><span class="year">'+esc(c.y)+' / FORZA HORIZON 6</span></div></button>').join('')||'<div class="empty">Nessuna auto trovata. Prova un altro nome o scegli Tutte le marche.</div>';
$('more').hidden=results.length<=limit;
$('gallery').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const span=document.createElement('span');span.className='fallbackcar';span.textContent='Anteprima non disponibile';img.parentNode.prepend(span)},{once:true}));
}
function showCatalog(){
requestId++;modelId++;clearTimeout(retryTimer);selected=null;record=null;$('car-model').removeAttribute('src');$('detail').hidden=true;$('catalog').hidden=false;history.replaceState(null,'',location.pathname);brands();gallery();window.scrollTo({top:0,behavior:'instant'});
}
function syncURL(){if(!selected)return;const q=new URLSearchParams({car:selected.s,pi:$('target').value,mode,class:$('target-class').value,drive:driveChoice||'',style,type:$('pi-type').value,units:$('units').value,...($('mounted-front').value?{front:$('mounted-front').value}:{}),...($('mounted-weight').value?{weight:$('mounted-weight').value}:{}),...($('mounted-power').value?{power:$('mounted-power').value}:{})});if($('pi-type').value==='target'&&plan)q.set('parts',plan.items.filter(includedUpgrade).map(it=>it.slot).join(','));history.replaceState(null,'','?'+q.toString())}
function setView(on){
view3d=!!on&&modelReady;$('car-model').hidden=!view3d;$('hero-image').hidden=view3d;$('toggle-view').textContent=view3d?'Mostra foto':'Mostra 3D';$('view-label').textContent=view3d?'MODELLO 3D / TRASCINA PER RUOTARE':'ANTEPRIMA AUTO';
}
function library(){
if(libraryPromise)return libraryPromise;
libraryPromise=new Promise((resolve,reject)=>{
const s=document.createElement('script');s.type='module';s.src='/vendor/model-viewer.min.js';s.onload=()=>customElements.whenDefined('model-viewer').then(resolve);s.onerror=()=>reject(Error('viewer'));document.head.append(s);
}).catch(e=>{libraryPromise=null;throw e});return libraryPromise;
}
async function loadModel(c,id){
clearTimeout(retryTimer);
const url='/api/model?slug='+encodeURIComponent(c.s);
try{
const r=await fetch(url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(25000)});
if(id!==modelId)return;
if(!r.ok){$('model-note').textContent=r.status===404?'Modello non ancora scaricato: l’anteprima resta disponibile. Riprovo automaticamente.':'Archivio 3D momentaneamente non raggiungibile. Riprovo automaticamente.';retryTimer=setTimeout(()=>{if(id===modelId)loadModel(c,id)},60000);return}
$('model-note').textContent='Caricamento del modello 3D…';await library();if(id!==modelId)return;
$('car-model').setAttribute('src',url);$('car-model').setAttribute('alt',c.k+' '+c.m+' — modello 3D');$('car-model').setAttribute('poster',c.h);$('car-model').hidden=false;$('hero-image').hidden=true;$('view-label').textContent='MODELLO 3D / CARICAMENTO';
}catch(e){if(id!==modelId)return;$('model-note').textContent='Il 3D non è disponibile al momento. La scheda e la foto restano utilizzabili.';retryTimer=setTimeout(()=>{if(id===modelId)loadModel(c,id)},60000)}
}
$('car-model').addEventListener('load',()=>{modelReady=true;$('toggle-view').hidden=false;setView(true);$('model-note').textContent='Trascina per ruotare · Scorri o pizzica per ingrandire'});
$('car-model').addEventListener('error',()=>{modelReady=false;setView(false);$('toggle-view').hidden=true;$('model-note').textContent='Visualizzazione 3D non riuscita. Riprovo automaticamente.';clearTimeout(retryTimer);const id=modelId,c=selected;retryTimer=setTimeout(()=>{if(c&&id===modelId){$('car-model').removeAttribute('src');loadModel(c,id)}},60000)});
$('toggle-view').onclick=()=>setView(!view3d);
function stats(){
 const sp=record?.spec||{},weight=sp.w?Math.round(sp.w*(/^lb/.test(sp.wu||'')?.45359237:1)):null;
 const pi=sp.pi??selected?.p,cls=C.classForPI(pi),cv=sp.hp?Math.round(Number(sp.hp)*1.0138697):null;
 const data=[['CLASSE E PP ORIGINALI',cls+' · '+(pi??'—'),'PP'],['POTENZA DI SERIE',cv,'CV'],['PESO DI SERIE',weight,'kg'],['TRAZIONE DI SERIE',sp.drivetrain,''],['DISTRIBUZIONE DI SERIE',sp.fp?sp.fp+' / '+Number((100-sp.fp).toFixed(1)):null,'% ant. / post.'],['COPPIA DI SERIE',sp.torque?Math.round(sp.torque*(/lb|ft/i.test(sp.torqueUnit||'')?1.35581795:1)):null,'Nm'],['CAMBIO DI SERIE',sp.gears,'marce'],['RAPPORTO PESO/POTENZA',cv&&weight?(weight/cv).toFixed(2):null,'kg/CV']];
 $('stockstats').innerHTML=data.map(([label,v,u])=>'<div class="stat"><small>'+label+'</small><strong><output'+(label==='CLASSE E PP ORIGINALI'?' id="stock-pi"':'')+'>'+esc(v??'—')+'</output> <em>'+esc(v!=null?u:'')+'</em></strong></div>').join('');
 const specs=(record?.details||[]).flatMap(d=>d.specs||[]),get=(...labels)=>specs.find(s=>labels.includes(s.label))?.value;
 let top=get('Top Speed','Top speed');if(top&&/mph/.test(top))top=Math.round(parseFloat(top)*1.609344)+' km/h';
 const details=[['Motore',get('Engine')],['Schema',get('Layout')],['Categoria',get('Family','Family - body')],['Paese',get('Origin','Country')],['Velocità massima',top],['0–60 mph',get('0-60 mph')],['Pneumatici anteriori',get('Front tire')],['Pneumatici posteriori',get('Rear tire')],['Mescola di serie',get('Stock tire compound')]];
 $('stock-details').innerHTML=details.map(([label,v])=>'<div><small>'+label+'</small><span>'+esc(v||'Non disponibile')+'</span></div>').join('');
 $('stock-ratings').innerHTML=[['Speed','Velocità'],['Handling','Tenuta'],['Acceleration','Accelerazione'],['Launch','Partenza'],['Braking','Frenata'],['Offroad','Fuoristrada']].map(([key,label])=>{const v=Number(get(key));return Number.isFinite(v)&&get(key)?'<div><small>'+label+' · '+v.toLocaleString('it-IT')+' / 10</small><meter min="0" max="10" value="'+Math.min(10,Math.max(0,v))+'" aria-label="'+label+'"></meter></div>':''}).join('');
}
async function loadRecord(c){
const id=++requestId;record=null;$('data-state').hidden=false;$('data-error').hidden=true;$('sheet').hidden=true;stats();
try{
const r=await fetch('/data/cars/'+encodeURIComponent(c.s)+'.json',{signal:AbortSignal.timeout(15000)});
if(!r.ok)throw Error(r.status===404?'La scheda dettagliata non è disponibile.':'Il recupero dei dati non è riuscito ('+r.status+').');
const d=await r.json();if(id!==requestId)return;if(!d.fields?.length)throw Error('I limiti di questa auto non sono ancora disponibili.');
record=d;driveChoice=driveChoice||record.spec?.drivetrain||'RWD';$('drive').value=driveChoice;$('drive').disabled=false;$('drive-note').textContent='Di serie: '+(record.spec?.drivetrain||'non disponibile')+'. Scegli la trazione effettivamente montata nel gioco.';$('data-state').hidden=true;$('sheet').hidden=false;stats();renderSheet();
}catch(e){if(id!==requestId)return;$('data-state').hidden=true;$('data-error').hidden=false;$('data-error').querySelector('span').textContent=e.name==='TimeoutError'?'Il catalogo sta impiegando troppo tempo. Riprova.':e.message;}
}
function selectCar(c){
selected=c;brand=c.k;record=null;plan=null;rows=[];activeUpgradePhase='all';try{upgradeChoices=JSON.parse(localStorage.getItem('fh6-upgrade-plan-'+c.s)||'{}')}catch{upgradeChoices={}}
let saved={};try{saved=JSON.parse(localStorage.getItem('fh6-current-'+c.s)||'{}')}catch{}
const linked=initialConfig&&c.s===params.get('car');initialConfig=false;const pick=(key,fallback='')=>linked&&params.has(key)?params.get(key):(saved[key]??fallback);
driveChoice=['FWD','RWD','AWD'].includes(pick('drive'))?pick('drive'):'';
$('drive').disabled=true;$('drive').value=driveChoice||'RWD';
$('pi-type').value=pick('type','current');$('target').value=pick('pi');
$('target-class').value=C.classes.some(cl=>cl.id===pick('class'))?pick('class'):(Number(c.p)<=800?'S1':C.classForPI(c.p));
$('mounted-front').value=pick('front');$('mounted-weight').value=pick('weight');$('mounted-power').value=pick('power');
mode=pick('mode',mode);style=pick('style',style);$('style').value=style;
modelReady=false;view3d=false;modelId++;clearTimeout(retryTimer);
$('car-model').removeAttribute('src');$('car-model').hidden=true;$('hero-image').hidden=false;$('hero-image').src=c.h;$('detail-thumb').src=c.h;$('detail-thumb').hidden=false;$('hero-image').alt=c.k+' '+c.m;
$('toggle-view').hidden=true;$('view-label').textContent='ANTEPRIMA AUTO';$('model-note').textContent='Controllo del modello 3D…';
$('catalog').hidden=true;$('detail').hidden=false;$('car-brand').textContent=c.k+' / GARAGE';$('car-name').textContent=c.m;$('car-year').textContent=c.y+' · '+c.c+' '+c.p+' PI di serie';
brands();syncModes();syncURL();loadRecord(c);loadModel(c,modelId);window.scrollTo({top:0,behavior:'instant'});
}
function syncModes(){document.querySelectorAll('#mode button').forEach(b=>b.setAttribute('aria-pressed',String(mode===b.dataset.mode)))}
function translatedTier(s){return String(s||'').replaceAll('Chassis Reinforcement / Roll Cage','rinforzo telaio / roll-bar').replaceAll('Front Anti-roll Bars','barre anteriori').replaceAll('Rear Anti-roll Bars','barre posteriori').replaceAll('Pistons / Compression','pistoni / compressione').replaceAll('Cams and Valves','albero a camme e valvole').replaceAll('Spring and Dampers','molle e ammortizzatori').replaceAll('Tire Compound','mescola gomme').replaceAll('Weight Reduction','riduzione peso').replaceAll('Front Bumper','paraurti anteriore').replaceAll('Rear Wing','alettone posteriore').replaceAll('Oil / Cooling','raffreddamento').replaceAll('Fuel System','alimentazione').replaceAll('Engine Block','blocco motore').replaceAll('Ignition','accensione').replaceAll('Intake','aspirazione').replaceAll('Exhaust','scarico').replaceAll('Valves','valvole').replaceAll('Flywheel','volano').replaceAll('Brakes','freni').replaceAll('Clutch','frizione').replaceAll('Driveline','albero trasmissione').replaceAll('Transmission','cambio').replaceAll('Differential','differenziale').replaceAll('Diff','differenziale').replaceAll('Stock','Serie').replaceAll('Street','Stradale').replaceAll('Race','Gara')}
const modeLabels={track:'Pista',dirt:'Sterrato',drift:'Drift'},styleLabels={stable:'Stabile',balanced:'Bilanciata',sharp:'Reattiva'};
const requirements={tires:'Pressioni gomme',gearing:'Cambio regolabile; le singole marce restano ai valori di serie',alignment:'Sospensioni regolabili',bars:'Barre antirollio regolabili',springs:'Sospensioni regolabili adatte al fondo',damping:'Sospensioni regolabili adatte al fondo',aero:'Elementi aerodinamici regolabili',brake:'Freni regolabili',diff:'Differenziale regolabile per la trazione selezionata'};
function rememberConfig(){
 if(!selected)return;
 try{localStorage.setItem('fh6-current-'+selected.s,JSON.stringify({type:$('pi-type').value,pi:$('target').value,power:$('mounted-power').value,weight:$('mounted-weight').value,class:$('target-class').value,front:$('mounted-front').value,drive:driveChoice,mode,style}))}catch{}
}
function renderSheet(){
 syncModes();syncURL();rememberConfig();
 const current=$('pi-type').value==='current',targetClass=C.classes.find(c=>c.id===$('target-class').value)||C.classes[4];
 $('mounted-data').hidden=!current;$('class-control').hidden=current;$('class-limit').hidden=current;
 $('class-limit').innerHTML='<small>LIMITE DELLA CLASSE</small><output>'+targetClass.id+' · '+targetClass.max+' PP</output>';
 $('drive-label').textContent=current?'Trazione montata':'Trazione desiderata';
 $('components').hidden=current;$('settings').hidden=!current;
 $('result-title').textContent=current?'La tua messa a punto':'La tua preparazione '+targetClass.id;
 $('copy').textContent=current?'Copia tutti i valori':'Copia il piano';
 const target=Number($('target').value),frontValue=Number($('mounted-front').value),weightValue=Number($('mounted-weight').value),powerValue=Number($('mounted-power').value);
 $('rear-weight').textContent=frontValue>=10&&frontValue<=90?'Posteriore: '+Number((100-frontValue).toFixed(1)).toLocaleString('it-IT')+'%':'Posteriore: —';
 if(!record)return;
 rows=[];plan=null;$('tunings').replaceChildren();$('parts').replaceChildren();$('copy').disabled=true;$('parts-cost').textContent='';$('parts-source').textContent='';$('pi-warning').textContent='';$('baseline').textContent='';$('sheet-summary').textContent='';$('limits-status').textContent='In attesa dei dati';
 $('drive-note').textContent='Di serie: '+(record.spec?.drivetrain||'non disponibile')+'. '+(current?'Seleziona la trazione effettivamente montata.':'Verifica nel gioco le conversioni disponibili.');
 $('tune-context').textContent=modeLabels[mode]+' / '+driveChoice+' / '+styleLabels[style];
 if(!current){
  $('config-note').textContent='Scegli la classe e segui le priorità del piano qui sotto.';
  plan=C.upgradePlan(record,mode,targetClass.max,false,{targetClass:targetClass.id,drive:driveChoice,style,make:selected.k});
  if(!sharedPartsApplied&&params.get('car')===selected.s&&params.has('parts')){const picks=new Set(params.get('parts').split(','));for(const it of plan.items)upgradeChoices[upgradeKey(it)]=picks.has(it.slot);saveUpgradeChoices();sharedPartsApplied=true;}
  $('baseline').textContent='Obiettivo '+targetClass.id+' · '+targetClass.max+' PP — '+modeLabels[mode]+' · '+driveChoice+' · '+styleLabels[style]+'. Di serie: '+selected.c+' '+record.spec.pi+' PP.';
  $('plan-title').textContent=plan.blocked?'Classe non verificabile per questa auto':'Upgrade per la tua '+targetClass.id;
  $('parts-source').textContent='Scegli i pezzi per la tua preparazione. Immagini e livelli dal catalogo dell’auto.';
  $('pi-warning').textContent=plan.reason;
  $('build-warnings').innerHTML=plan.warnings.length?'<details class="plan-check"><summary>Da verificare per questa auto · '+plan.warnings.length+'</summary><ul>'+plan.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></details>':'';
  $('parts-cost').textContent=plan.cost?'Pezzi prioritari: ≈ '+Number(plan.cost).toLocaleString('it-IT')+' CR · facoltativi esclusi':'';
  renderUpgradeCards();
  $('build-steps').hidden=!plan.steps.length;$('build-steps').innerHTML='<details class="build-guide"><summary>Come completare la preparazione</summary><ol>'+plan.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol></details>';
  $('build-ready').hidden=!!plan.blocked;
  $('build-ready').textContent=plan.atCap?'Regola l’auto di serie':'Passa alla messa a punto';
  $('copy').disabled=false;$('sheet-summary').textContent=selected.k+' '+selected.m+' · Obiettivo '+targetClass.id+' '+targetClass.max+' PP · PI finale da verificare nel gioco';
  return;
 }
 let error='';
 if(!Number.isInteger(target)||target<100||target>999)error='Inserisci i PP / PI attuali della tua configurazione, tra 100 e 999.';
 else if(!powerValue||!weightValue||!frontValue)error='Inserisci potenza, peso e distribuzione anteriore della tua auto attuale.';
 else if(!Number.isFinite(powerValue)||powerValue<1||powerValue>5000||!Number.isFinite(frontValue)||frontValue<10||frontValue>90||!Number.isFinite(weightValue)||weightValue<200||weightValue>10000)error='Controlla i dati: potenza 1–5.000 CV, peso 200–10.000 kg e distribuzione anteriore 10–90%.';
 if(error){$('config-note').textContent=error;return}
 $('copy').disabled=false;
 $('config-note').textContent='Mantieni i componenti montati. Le regolazioni richiedono i componenti regolabili corrispondenti.';
 rows=C.tune(record,mode,$('units').value==='metric',{drive:driveChoice,style,frontPercent:frontValue,weight:weightValue,powerCV:powerValue});
 plan=C.upgradePlan(record,mode,target,true);
 $('baseline').textContent='Configurazione attuale: '+C.classForPI(target)+' '+target+' PP · '+powerValue+' CV · '+weightValue+' kg · '+frontValue+'% ant. / '+Number((100-frontValue).toFixed(1))+'% post. Valori iniziali da affinare in pista: verifica i limiti dopo gli upgrade.';
 $('limits-status').textContent=rows.length+' cursori · '+driveChoice;
 $('tunings').innerHTML=Object.entries(C.sectionNames).map(([key,label],idx)=>{
const items=rows.filter(r=>r.section===key);if(!items.length)return '';
return '<article class="tuning"><span class="num">'+String(idx+1).padStart(2,'0')+' / '+esc(modeLabels[mode].toUpperCase())+'</span><h3>'+label+'</h3><p class="requirement">'+esc(requirements[key])+'</p>'+(items.length?items.map(r=>'<div class="tunerow"><span>'+esc(r.label)+(r.kind==='default'?' · serie':'')+'</span><b>'+r.value.toLocaleString('it-IT',{maximumFractionDigits:2})+'<small>'+esc(r.unit)+'</small></b></div>').join(''):'<p class="sub">Non regolabile o dati non disponibili per questa auto.</p>')+(items.length?'<details><summary>Limiti di catalogo · da verificare dopo upgrade</summary>'+items.map(r=>'<div class="limitrow"><span>'+esc(r.label)+(r.derived?' · trazione selezionata':'')+'</span><span>'+r.min+' – '+r.max+' '+esc(r.unit)+'</span></div>').join('')+'</details>':'')+'</article>';
}).join('');

 $('sheet-summary').textContent=selected.k+' '+selected.m+' · '+C.classForPI(target)+' '+target+' PP attuali · '+modeLabels[mode]+' · '+driveChoice+' · '+styleLabels[style];
}

function upgradeKey(item){return [$('target-class').value,mode,driveChoice,style,item.slot,item.id].join('|')}
function includedUpgrade(item){const saved=upgradeChoices[upgradeKey(item)];return typeof saved==='boolean'?saved:!item.optional}
function saveUpgradeChoices(){try{localStorage.setItem('fh6-upgrade-plan-'+selected.s,JSON.stringify(upgradeChoices))}catch{}}
function upgradeAsset(value){
 if(typeof value!=='string')return '';
 let path=value;
 if(/^https?:/.test(path)){try{path=new URL(path).pathname}catch{return ''}}
 if(path.includes('..'))return '';
 if(/^\/brand-assets\/upgrades\/icons\/[a-zA-Z0-9_./-]+\.webp$/.test(path))return path;
 if(/^\/upgrades\/icons\/[a-zA-Z0-9_./-]+\.webp$/.test(path))return '/brand-assets'+path;
 return '';
}

function renderUpgradeCards(){
 const phaseNames={1:'Grip e controllo',2:'Telaio e trasmissione',3:'Potenza'};
 $('parts').innerHTML=plan.items.map(it=>{
  const on=includedUpgrade(it),url=upgradeAsset(it.img),fallback=upgradeAsset(it.icon);
  return '<article class="upgrade-card'+(on?' is-included':'')+'" data-phase="'+it.phase+'" data-upgrade-id="'+it.id+'"><div class="upgrade-art"><span class="upgrade-phase">'+phaseNames[it.phase]+'</span>'+
   (url||fallback?'<img data-upgrade-img src="'+esc(url||fallback)+'" data-fallback="'+esc(url!==fallback?fallback:'')+'" alt="'+esc(it.label+' · '+translatedTier(it.tier))+'" width="256" height="128" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
   '<span class="upgrade-image-missing" '+(url||fallback?'hidden':'')+'>Immagine non disponibile</span></div><div class="upgrade-content"><div class="upgrade-meta"><span>'+(it.optional?'Facoltativo':'Priorità')+'</span><span>'+Number(it.price).toLocaleString('it-IT')+' CR</span></div><h3>'+esc(it.label)+'</h3><p class="upgrade-tier">'+esc(translatedTier(it.tier))+'</p><details class="upgrade-details"><summary>Perché questo pezzo <span aria-hidden="true">+</span></summary><p>'+esc(it.why)+'</p>'+'</details><label class="upgrade-toggle"><input type="checkbox" data-include="'+esc(it.slot)+'" aria-label="Includi '+esc(it.label)+' nel piano" '+(on?'checked':'')+'><span>'+(on?'Nel tuo piano':'Aggiungi al piano')+'</span></label></div></article>';
 }).join('');
 document.querySelectorAll('#parts img[data-upgrade-img]').forEach(img=>{
  img.addEventListener('error',()=>{if(img.dataset.fallback){const src=img.dataset.fallback;delete img.dataset.fallback;img.src=src}else{img.hidden=true;img.nextElementSibling.hidden=false}});
 });
 filterUpgradeCards();updateUpgradeSummary();
}
function filterUpgradeCards(){
 document.querySelectorAll('#upgrade-filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.phase===activeUpgradePhase)));
 document.querySelectorAll('#parts .upgrade-card').forEach(card=>card.hidden=activeUpgradePhase!=='all'&&card.dataset.phase!==activeUpgradePhase);
 $('upgrade-empty').hidden=!plan.items.length||activeUpgradePhase==='all'||plan.items.some(it=>String(it.phase)===activeUpgradePhase);
}
function updateUpgradeSummary(){
 if(!plan)return;const items=plan.items.filter(includedUpgrade),cost=items.reduce((sum,it)=>sum+it.price,0);
 $('selected-count').textContent=items.length+' '+(items.length===1?'componente':'componenti');
 $('selected-cost').textContent=cost.toLocaleString('it-IT')+' CR';
 $('parts-cost').textContent=plan.items.length+' proposte nel catalogo';
 $('selected-parts').innerHTML=items.length?items.map(it=>'<li><span>'+esc(it.label)+'</span><span>'+Number(it.price).toLocaleString('it-IT')+'</span></li>').join(''):'<li class="basket-empty">Aggiungi i pezzi dalle schede per comporre il tuo piano.</li>';
 $('clear-plan').disabled=!items.length;
 syncURL();
 $('basket-note').textContent=plan.blocked?'Scegli una classe compatibile.':'Costo dei pezzi selezionati. PI, compatibilità dopo conversioni e risultato finale da controllare nel gioco.';
}
$('parts').onchange=e=>{
 const input=e.target.closest('[data-include]');if(!input||!plan)return;
 const item=plan.items.find(it=>it.slot===input.dataset.include);if(!item)return;
 upgradeChoices[upgradeKey(item)]=input.checked;saveUpgradeChoices();
 const card=input.closest('.upgrade-card');card.classList.toggle('is-included',input.checked);input.nextElementSibling.textContent=input.checked?'Nel tuo piano':'Aggiungi al piano';updateUpgradeSummary();
};
$('upgrade-filters').onclick=e=>{const button=e.target.closest('[data-phase]');if(button){activeUpgradePhase=button.dataset.phase;filterUpgradeCards()}};
$('select-priority').onclick=()=>{if(!plan)return;for(const it of plan.items)upgradeChoices[upgradeKey(it)]=!it.optional;saveUpgradeChoices();renderUpgradeCards()};
$('clear-plan').onclick=()=>{if(!plan)return;for(const it of plan.items)upgradeChoices[upgradeKey(it)]=false;saveUpgradeChoices();renderUpgradeCards()};
function useStock(){
 if(!record)return;const sp=record.spec||{};
 $('target').value=sp.pi??selected.p;$('mounted-power').value=sp.hp?Math.round(Number(sp.hp)*1.0138697):'';$('mounted-weight').value=sp.w?Math.round(sp.w*(/^lb/.test(sp.wu||'')?.45359237:1)):'';$('mounted-front').value=sp.fp??'';
 driveChoice=sp.drivetrain||driveChoice;$('drive').value=driveChoice;renderSheet();
}
$('use-stock').onclick=useStock;
$('build-ready').onclick=()=>{const stock=plan?.atCap;$('pi-type').value='current';if(stock)useStock();else renderSheet();$('pi-type').scrollIntoView({behavior:'smooth',block:'center'});};
$('target-class').onchange=renderSheet;
$('catalog-class').onchange=()=>{catalogClass=$('catalog-class').value;limit=60;gallery()};
$('brands').onclick=e=>{const b=e.target.closest('[data-brand]');if(!b)return;brand=b.dataset.brand;query='';$('search').value='';limit=60;showCatalog()};
$('gallery').onclick=e=>{const c=e.target.closest('[data-car]');if(c)selectCar(cars.find(x=>x.s===c.dataset.car))};
$('search').oninput=()=>{query=$('search').value.toLowerCase().trim();limit=60;gallery()};
$('more').onclick=()=>{limit+=60;gallery()};
$('back').onclick=showCatalog;$('home').onclick=e=>{e.preventDefault();brand='';showCatalog()};
$('retry').onclick=()=>{if(selected)loadRecord(selected)};
$('mode').onclick=e=>{const b=e.target.closest('[data-mode]');if(b){mode=b.dataset.mode;renderSheet()}};
$('drive').onchange=()=>{driveChoice=$('drive').value;renderSheet()};$('style').onchange=()=>{style=$('style').value;renderSheet()};$('mounted-power').oninput=renderSheet;$('mounted-front').oninput=renderSheet;$('mounted-weight').oninput=renderSheet;
$('target').oninput=renderSheet;$('pi-type').onchange=renderSheet;$('units').onchange=renderSheet;
async function copyText(text){try{await navigator.clipboard.writeText(text);notify('Copiato negli appunti')}catch{const a=document.createElement('textarea');a.value=text;document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();notify(ok?'Copiato negli appunti':'Copia non disponibile in questo browser')}}
$('share').onclick=()=>{syncURL();copyText(location.href)};
$('copy').onclick=()=>{
 if(!plan)return;
 const lines=[selected.k+' '+selected.m+' '+selected.y,$('sheet-summary').textContent,$('baseline').textContent,''];
 if($('pi-type').value==='current')lines.push('MESSA A PUNTO',...rows.map(r=>r.label+': '+r.value+' '+r.unit));
 else lines.push(plan.reason,...plan.warnings,'','COMPONENTI SELEZIONATI',...plan.items.filter(includedUpgrade).map(i=>(i.optional?'[Facoltativo] ':'')+i.label+': '+translatedTier(i.tier)+' · '+Number(i.price).toLocaleString('it-IT')+' CR — '+i.why),'',...plan.steps);
 lines.push('',location.href);copyText(lines.join('\n'));
};
$('detail-thumb').onerror=()=>{$('detail-thumb').hidden=true};
$('hero-image').onerror=()=>{$('model-note').textContent='Anteprima non disponibile. Controllo il modello 3D.'};
brands();gallery();syncModes();
const initial=cars.find(c=>c.s===params.get('car'));if(initial)selectCar(initial);
if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.register('/sw.js');reg.update().catch(()=>{})}catch{}}
})();
