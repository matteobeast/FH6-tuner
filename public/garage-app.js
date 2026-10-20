
(async function(){
'use strict';
const $=id=>document.getElementById(id),C=globalThis.TunerCore,cars=JSON.parse($('catalogue').textContent);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let brand='',query='',limit=60,selected=null,record=null,rows=[],plan=null,requestId=0,modelId=0,view3d=false,modelReady=false,libraryPromise=null,retryTimer=null,mode='track',driveChoice='',style='balanced',toastTimer;
const params=new URLSearchParams(location.search);
if(['track','dirt','drift'].includes(params.get('mode')))mode=params.get('mode');
if(['stable','balanced','sharp'].includes(params.get('style')))style=params.get('style');
$('style').value=style;
if(/^\d{3}$/.test(params.get('pi')||''))$('target').value=params.get('pi');
if(params.get('type')==='current')$('pi-type').value='current';
if(params.get('units')==='imperial')$('units').value='imperial';
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2600)}
const brandLogos={"Abarth":"ABA.webp","Acura":"ACU.webp","Alfa Romeo":"ALF.webp","Alumicraft":"AC.webp","AMG Transport Dynamics":"AMG.webp","Apollo":"APO.webp","Ariel":"ARI.webp","Aston Martin":"AST.webp","Audi":"AUD.webp","Austin-Healey":"AH.webp","Autozam":"AZM.webp","BAC":"BAC.webp","Bentley":"BEN.webp","BMW":"BMW.webp","Buick":"BUI.webp","Cadillac":"CAD.webp","Can-Am":"CAN.webp","Casey Currie Motorsports":"CCM.webp","Chevrolet":"CHE.webp","Datsun":"DAT.webp","DeBerti":"DEB.webp","DeLorean":"DEL.webp","Dodge":"DOD.webp","Ferrari":"FER.webp","Ford":"FOR.webp","Formula Drift":"FD.webp","Funco Motorsports":"FUN.webp","GMC":"GMC.webp","Gordon Murray Automotive":"GMA.webp","GR":"GR.webp","Hennessey":"HEN.webp","Holden":"HOL.webp","Honda":"HON.webp","HSV":"HSV.webp","Hyundai":"HYU.webp","Jaguar":"JAG.webp","Jeep":"JEE.webp","Jimco":"JIM.webp","Koenigsegg":"KOE.webp","KTM":"KTM.webp","Lamborghini":"LAM.webp","Lancia":"LAN.webp","Land Rover":"LR.webp","Lexus":"LEX.webp","Lincoln":"LIN.webp","Lotus":"LOT.webp","Lucid":"LUC.webp","Maserati":"MAS.webp","Mazda":"MAZ.webp","McLaren":"MCL.webp","Mercedes-AMG":"MA.webp","Mercedes-Benz":"MER.webp","Meyers":"MEY.webp","MG":"MG.webp","MINI":"MIN.webp","Mitsubishi":"MIT.webp","Nissan":"NIS.webp","Noble":"NOB.webp","Opel":"OPE.webp","Pagani":"PAG.webp","Peel":"PEE.webp","Penhall":"PEN.webp","Peugeot":"PEU.webp","Plymouth":"PLY.webp","Polaris":"POL.webp","Pontiac":"PON.webp","Porsche":"POR.webp","Radical":"RAD.webp","Ram":"RAM.webp","Reliant":"REL.webp","Renault":"REN.webp","Rimac":"RIM.webp","RIVIAN":"RIV.webp","RJ Anderson":"RJ.webp","Saleen":"SAL.webp","Schuppan":null,"Shelby":"SHE.webp","SIERRA Cars":"SIE.webp","SRT":"SRT.webp","Subaru":"SUB.webp","Toyota":"TOY.webp","TVR":"TVR.webp","Ultima":"ULT.webp","Volkswagen":"VW.webp","Volvo":"VOL.webp","Wuling":"WUL.webp","Zenvo":"ZEN.webp"};
function brandMark(name){
 const file=brandLogos[name],initials=name.split(/[\s-]+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
 if(!name)return '<span class="brand-mark brand-all" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z"/></svg></span>';
 return '<span class="brand-mark" aria-hidden="true">'+(file?'<img data-brand-logo src="https://pub-b1b0dda9cb0644008ffedffa8be50cbf.r2.dev/logos/'+esc(file)+'" alt="" width="32" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'<span class="brand-initials" '+(file?'hidden':'title="Logo non disponibile"')+'>'+esc(initials)+'</span></span>';
}

function brands(){
const counts=new Map();for(const c of cars)counts.set(c.k,(counts.get(c.k)||0)+1);
$('brands').innerHTML=[['',cars.length],...[...counts].sort((a,b)=>a[0].localeCompare(b[0]))].map(([name,n])=>'<button class="brand" data-brand="'+esc(name)+'" aria-pressed="'+(brand===name)+'">'+brandMark(name)+'<span class="brand-name">'+esc(name||'Tutte le marche')+'</span><span class="brand-count">'+n+'</span></button>').join('');
logoFallbacks();
}
function logoFallbacks(){ $('brands').querySelectorAll('img[data-brand-logo]').forEach(img=>{const fallback=()=>{img.hidden=true;img.parentNode.querySelector('.brand-initials').hidden=false;};img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();}); }
function gallery(){
const results=cars.filter(c=>(!brand||c.k===brand)&&(!query||((c.k+' '+c.m+' '+c.y).toLowerCase().includes(query))));
$('catalog-title').textContent=brand||'Il prossimo assetto parte da qui.';
$('gallery-count').textContent=results.length+' AUTO'+(brand?' / '+brand.toUpperCase():' / TUTTE LE MARCHE');
$('gallery').innerHTML=results.slice(0,limit).map((c,i)=>'<button class="car" data-car="'+esc(c.s)+'" aria-label="'+esc(c.k+' '+c.m+' '+c.y)+'"><div class="photo"><img src="'+esc(c.h)+'" alt="'+esc(c.k+' '+c.m)+'" loading="'+(i<8?'eager':'lazy')+'" decoding="async" referrerpolicy="no-referrer"><span class="badge">'+esc(c.c)+' · '+esc(c.p)+' PI</span></div><div class="cardtext"><small>'+esc(c.k)+'</small><h3>'+esc(c.m)+'</h3><span class="year">'+esc(c.y)+' / FORZA HORIZON 6</span></div></button>').join('')||'<div class="empty">Nessuna auto trovata. Prova un altro nome o scegli Tutte le marche.</div>';
$('more').hidden=results.length<=limit;
$('gallery').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;const span=document.createElement('span');span.className='fallbackcar';span.textContent='Anteprima non disponibile';img.parentNode.prepend(span)},{once:true}));
}
function showCatalog(){
requestId++;modelId++;clearTimeout(retryTimer);selected=null;record=null;$('car-model').removeAttribute('src');$('detail').hidden=true;$('catalog').hidden=false;history.replaceState(null,'',location.pathname);brands();gallery();window.scrollTo({top:0,behavior:'instant'});
}
function syncURL(){if(!selected)return;const q=new URLSearchParams({car:selected.s,pi:$('target').value,mode,drive:driveChoice||'',style,type:$('pi-type').value,units:$('units').value,...($('mounted-front').value?{front:$('mounted-front').value}:{}),...($('mounted-weight').value?{weight:$('mounted-weight').value}:{})});history.replaceState(null,'','?'+q.toString())}
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
const data=[['PI DI SERIE',sp.pi||selected?.p,'PI'],['POTENZA DI SERIE',sp.hp,'hp'],['PESO DI SERIE',weight,'kg'],['TRAZIONE DI SERIE',sp.drivetrain,'']];
$('stockstats').innerHTML=data.map(([label,v,u])=>'<div class="stat"><small>'+label+'</small><strong>'+esc(v||'—')+' <em>'+esc(v?u:'')+'</em></strong></div>').join('');
}
async function loadRecord(c){
const id=++requestId;record=null;$('data-state').hidden=false;$('data-error').hidden=true;$('sheet').hidden=true;stats();
try{
const r=await fetch('/api/garage?slug='+encodeURIComponent(c.s),{cache:'no-cache',signal:AbortSignal.timeout(55000)});
if(!r.ok)throw Error(r.status===404?'La scheda dettagliata non è disponibile.':'Il recupero dei dati non è riuscito ('+r.status+').');
const d=await r.json();if(id!==requestId)return;if(!d.fields?.length)throw Error('I limiti di questa auto non sono ancora disponibili.');
record=d;driveChoice=driveChoice||record.spec?.drivetrain||'RWD';$('drive').value=driveChoice;$('drive').disabled=false;$('drive-note').textContent='Di serie: '+(record.spec?.drivetrain||'non disponibile')+'. Scegli la trazione effettivamente montata nel gioco.';$('data-state').hidden=true;$('sheet').hidden=false;stats();renderSheet();
}catch(e){if(id!==requestId)return;$('data-state').hidden=true;$('data-error').hidden=false;$('data-error').querySelector('span').textContent=e.name==='TimeoutError'?'Il catalogo sta impiegando troppo tempo. Riprova.':e.message;}
}
function selectCar(c){
selected=c;brand=c.k;record=null;driveChoice=c.s===params.get('car')&&['FWD','RWD','AWD'].includes(params.get('drive'))?params.get('drive'):'';$('drive').disabled=true;$('drive').value=driveChoice||'RWD';$('mounted-front').value=c.s===params.get('car')?(params.get('front')||''):'';$('mounted-weight').value=c.s===params.get('car')?(params.get('weight')||''):'';modelReady=false;view3d=false;modelId++;clearTimeout(retryTimer);
$('car-model').removeAttribute('src');$('car-model').hidden=true;$('hero-image').hidden=false;$('hero-image').src=c.h;$('hero-image').alt=c.k+' '+c.m;
$('toggle-view').hidden=true;$('view-label').textContent='ANTEPRIMA AUTO';$('model-note').textContent='Controllo del modello 3D…';
$('catalog').hidden=true;$('detail').hidden=false;$('car-brand').textContent=c.k+' / GARAGE';$('car-name').textContent=c.m;$('car-year').textContent=c.y+' · '+c.c+' '+c.p+' PI di serie';
brands();syncModes();syncURL();loadRecord(c);loadModel(c,modelId);window.scrollTo({top:0,behavior:'instant'});
}
function syncModes(){document.querySelectorAll('#mode button').forEach(b=>b.setAttribute('aria-pressed',String(mode===b.dataset.mode)))}
function translatedTier(s){return String(s||'').replaceAll('Chassis Reinforcement / Roll Cage','rinforzo telaio / roll-bar').replaceAll('Front Anti-roll Bars','barre anteriori').replaceAll('Rear Anti-roll Bars','barre posteriori').replaceAll('Pistons / Compression','pistoni / compressione').replaceAll('Cams and Valves','albero a camme e valvole').replaceAll('Spring and Dampers','molle e ammortizzatori').replaceAll('Tire Compound','mescola gomme').replaceAll('Weight Reduction','riduzione peso').replaceAll('Front Bumper','paraurti anteriore').replaceAll('Rear Wing','alettone posteriore').replaceAll('Oil / Cooling','raffreddamento').replaceAll('Fuel System','alimentazione').replaceAll('Engine Block','blocco motore').replaceAll('Ignition','accensione').replaceAll('Intake','aspirazione').replaceAll('Exhaust','scarico').replaceAll('Valves','valvole').replaceAll('Flywheel','volano').replaceAll('Brakes','freni').replaceAll('Clutch','frizione').replaceAll('Driveline','albero trasmissione').replaceAll('Transmission','cambio').replaceAll('Differential','differenziale').replaceAll('Diff','differenziale').replaceAll('Stock','Serie').replaceAll('Street','Stradale').replaceAll('Race','Gara')}
const modeLabels={track:'Pista',dirt:'Sterrato',drift:'Drift'},styleLabels={stable:'Stabile',balanced:'Bilanciata',sharp:'Reattiva'};
const requirements={tires:'Pressioni gomme',gearing:'Cambio regolabile; le singole marce restano ai valori di serie',alignment:'Sospensioni regolabili',bars:'Barre antirollio regolabili',springs:'Sospensioni regolabili adatte al fondo',damping:'Sospensioni regolabili adatte al fondo',aero:'Elementi aerodinamici regolabili',brake:'Freni regolabili',diff:'Differenziale regolabile per la trazione selezionata'};
function renderSheet(){
syncModes();syncURL();if(!record)return;
const target=Number($('target').value);
if(!Number.isInteger(target)||target<100||target>999){$('pi-warning').textContent='Inserisci un PI intero tra 100 e 999.';$('parts').replaceChildren();$('tunings').replaceChildren();$('copy').disabled=true;return}
$('copy').disabled=false;
const frontValue=Number($('mounted-front').value),weightValue=Number($('mounted-weight').value);
if(($('mounted-front').value&&(!Number.isFinite(frontValue)||frontValue<10||frontValue>90))||($('mounted-weight').value&&(!Number.isFinite(weightValue)||weightValue<200||weightValue>10000))){$('config-note').textContent='Inserisci una distribuzione anteriore tra 10 e 90% e un peso tra 200 e 10.000 kg.';$('tunings').replaceChildren();rows=[];$('copy').disabled=true;return;}
$('config-note').textContent=driveChoice!==record.spec?.drivetrain?'Conversione '+driveChoice+': conferma peso e distribuzione dopo le modifiche. I limiti di catalogo possono cambiare; controllali nel gioco.':'Usa componenti regolabili per sbloccare i rispettivi cursori nel gioco.';
rows=C.tune(record,mode,$('units').value==='metric',{drive:driveChoice,style,frontPercent:frontValue||undefined,weight:weightValue||undefined});plan=C.upgradePlan(record,mode,target,$('pi-type').value==='current');
if(driveChoice!==record.spec?.drivetrain){plan.items=plan.items.filter(it=>it.slot!=='Drivetrain');plan.reason+=' La trazione '+driveChoice+' è quella selezionata: il preset non verifica la conversione né il suo PI.';}
$('parts-source').textContent=plan.preset?'Preset catalogato: '+plan.preset:'Selezione dalla disponibilità reale di questa auto';
$('parts-cost').textContent=plan.cost?'Costo indicativo: ≈ '+Number(plan.cost).toLocaleString('it-IT')+' CR':'';
$('pi-warning').textContent=plan.reason+(plan.unresolved?' '+plan.unresolved+' componenti del preset non sono risolti: la lista non è completa.':'');
$('parts').innerHTML=plan.items.map(it=>'<div class="part"><small>'+esc(it.label)+'</small><strong>'+esc(translatedTier(it.tier))+'</strong><em>'+Number(it.price).toLocaleString('it-IT')+' CR'+'</em></div>').join('');
$('baseline').textContent='Base da provare: '+modeLabels[mode]+' · '+driveChoice+' · '+styleLabels[style]+'. '+($('mounted-front').value||$('mounted-weight').value?'Calcolo con i dati montati che hai inserito.':'Calcolo con peso e distribuzione di serie.')+' Il PI da solo non determina i dati dopo gli upgrade.';
$('tune-context').textContent=modeLabels[mode]+' / '+driveChoice+' / '+styleLabels[style];
$('limits-status').textContent=rows.length+' cursori · '+driveChoice;
$('tunings').innerHTML=Object.entries(C.sectionNames).map(([key,label],idx)=>{
const items=rows.filter(r=>r.section===key);if(!items.length)return '';
return '<article class="tuning"><span class="num">'+String(idx+1).padStart(2,'0')+' / '+esc(modeLabels[mode].toUpperCase())+'</span><h3>'+label+'</h3><p class="requirement">'+esc(requirements[key])+'</p>'+(items.length?items.map(r=>'<div class="tunerow"><span>'+esc(r.label)+(r.kind==='default'?' · serie':'')+'</span><b>'+r.value.toLocaleString('it-IT',{maximumFractionDigits:2})+'<small>'+esc(r.unit)+'</small></b></div>').join(''):'<p class="sub">Non regolabile o dati non disponibili per questa auto.</p>')+(items.length?'<details><summary>Limiti di catalogo · da verificare dopo upgrade</summary>'+items.map(r=>'<div class="limitrow"><span>'+esc(r.label)+(r.derived?' · trazione selezionata':'')+'</span><span>'+r.min+' – '+r.max+' '+esc(r.unit)+'</span></div>').join('')+'</details>':'')+'</article>';
}).join('');
$('sheet-summary').textContent=selected.k+' '+selected.m+' · '+modeLabels[mode]+' · '+driveChoice+' · '+styleLabels[style]+' · '+target+' PI '+($('pi-type').value==='current'?'attuali':'obiettivo');
}
$('brands').onclick=e=>{const b=e.target.closest('[data-brand]');if(!b)return;brand=b.dataset.brand;query='';$('search').value='';limit=60;showCatalog()};
$('gallery').onclick=e=>{const c=e.target.closest('[data-car]');if(c)selectCar(cars.find(x=>x.s===c.dataset.car))};
$('search').oninput=()=>{query=$('search').value.toLowerCase().trim();limit=60;gallery()};
$('more').onclick=()=>{limit+=60;gallery()};
$('back').onclick=showCatalog;$('home').onclick=e=>{e.preventDefault();brand='';showCatalog()};
$('retry').onclick=()=>{if(selected)loadRecord(selected)};
$('mode').onclick=e=>{const b=e.target.closest('[data-mode]');if(b){mode=b.dataset.mode;renderSheet()}};
$('drive').onchange=()=>{driveChoice=$('drive').value;renderSheet()};$('style').onchange=()=>{style=$('style').value;renderSheet()};$('mounted-front').oninput=renderSheet;$('mounted-weight').oninput=renderSheet;
$('target').oninput=renderSheet;$('pi-type').onchange=renderSheet;$('units').onchange=renderSheet;
async function copyText(text){try{await navigator.clipboard.writeText(text);notify('Copiato negli appunti')}catch{const a=document.createElement('textarea');a.value=text;document.body.append(a);a.select();const ok=document.execCommand('copy');a.remove();notify(ok?'Copiato negli appunti':'Copia non disponibile in questo browser')}}
$('share').onclick=()=>{syncURL();copyText(location.href)};
$('copy').onclick=()=>copyText([selected.k+' '+selected.m+' '+selected.y,$('sheet-summary').textContent,$('baseline').textContent,'','MESSA A PUNTO',...rows.map(r=>r.label+': '+r.value+' '+r.unit),'',plan.reason,'','COMPONENTI',...plan.items.map(i=>i.label+': '+translatedTier(i.tier)),location.href].join('\n'));
$('hero-image').onerror=()=>{$('model-note').textContent='Anteprima non disponibile. Controllo il modello 3D.'};
brands();gallery();syncModes();
const initial=cars.find(c=>c.s===params.get('car'));if(initial)selectCar(initial);
if('serviceWorker'in navigator){try{const reg=await navigator.serviceWorker.register('/sw.js');reg.update().catch(()=>{})}catch{}}
})();
