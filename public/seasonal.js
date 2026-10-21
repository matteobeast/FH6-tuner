(()=>{
'use strict';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const axes=[['speed','Velocità'],['handling','Tenuta'],['accel','Accelerazione'],['launch','Partenza'],['braking','Frenata'],['offroad','Fuoristrada']];
const minPI={D:100,C:401,B:501,A:601,S1:701,S2:801,R:901,X:999};
let data,current,choice,toastTimer;
const safeURL=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'#'}catch{return '#'}};
const localImage=s=>/^\/images\/[a-z0-9-]+\.webp$/.test(s||'')?s:'';
const date=s=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',timeZone:'Europe/Rome'}).format(new Date(s));
const endDate=s=>new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}).format(new Date(s));
const number=v=>Number(v).toLocaleString('it-IT',{maximumFractionDigits:1});
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2600)}
function captureKey(){return 'fh6-race-ratings-'+current.id+'-'+choice.slug+'-'+(choice.code||'stock')}
function validCapture(v){return v&&Number.isInteger(v.pi)&&v.pi>=minPI[current.class]&&v.pi<=current.cap&&axes.every(([k])=>Number.isFinite(v.ratings?.[k])&&v.ratings[k]>=.1&&v.ratings[k]<=10)}
function savedCapture(){try{const v=JSON.parse(localStorage.getItem(captureKey()));return validCapture(v)?v:null}catch{return null}}
function point(i,r){const a=-Math.PI/2+i*Math.PI/3;return [200+Math.cos(a)*r,180+Math.sin(a)*r]}
function polygon(values,r){return values.map((v,i)=>point(i,r*v).map(n=>n.toFixed(2)).join(',')).join(' ')}
function radarSVG(values,title){
 if(!axes.every(([k])=>Number.isFinite(values?.[k])&&values[k]>=.1&&values[k]<=10))return '<p>Dati del poligono non disponibili.</p>';
 let svg='<svg viewBox="0 0 400 360" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title><desc>'+axes.map(([k,l])=>esc(l)+' '+number(values[k])).join('; ')+'</desc>';
 svg+='<polygon points="'+polygon([1,1,1,1,1,1],112)+'" fill="#fafbfe"/>';
 for(const step of [.2,.4,.6,.8,1])svg+='<polygon points="'+polygon([step,step,step,step,step,step],112)+'" fill="'+'none'+'" stroke="#e4e8ee" stroke-width="1"/>';
 for(let i=0;i<6;i++){const p=point(i,112);svg+='<line x1="200" y1="180" x2="'+p[0]+'" y2="'+p[1]+'" stroke="#e4e8ee"/>'}
 svg+='<polygon points="'+polygon(axes.map(([k])=>values[k]/10),112)+'" fill="#0071e326" stroke="#0071e3" stroke-width="2.5"/>';
 axes.forEach(([k,label],i)=>{const p=point(i,112*values[k]/10),l=point(i,150);const anchor=i===0||i===3?'middle':i<3?'start':'end';svg+='<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.4" fill="#0071e3"><title>'+esc(label)+' '+number(values[k])+'</title></circle><text x="'+l[0]+'" y="'+l[1]+'" text-anchor="'+anchor+'" fill="#6e6e73" font-size="10" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">'+esc(label)+'<tspan x="'+l[0]+'" dy="16" fill="#1d1d1f" font-weight="650" font-size="13">'+number(values[k])+'</tspan></text>'});
 return svg+'</svg>';
}
function drawChart(){
 const car=data.profiles[choice.slug],capture=savedCapture();
 const fixed=choice.fixed;
 const ratings=capture?.ratings||(fixed?choice.finalRatings:car.stock.ratings);
 const title=capture?'Il tuo assetto · dati inseriti da te':fixed?'Auto della prova · prestazioni effettive':'Poligono di serie';
 $('chart-title').textContent=title;$('radar').innerHTML=radarSVG(ratings,title);
 $('ratings-list').innerHTML=axes.map(([k,label])=>'<div><dt>'+label+'</dt><dd>'+number(ratings[k])+'</dd></div>').join('');
 $('chart-note').textContent=capture?'Dati riportati da te dal gioco · '+current.class+' '+capture.pi+' PI · associati al codice '+choice.code+'.':fixed?'Valori del database di gioco per l’auto originale fornita dalla prova.':'Valori effettivi di serie del database di gioco. I sei valori dopo il codice '+choice.code+' non sono pubblicati dall’autore: questo poligono non descrive l’auto modificata.';
 $('capture-details').hidden=!!fixed;
 $('capture-inputs').innerHTML=axes.map(([k,l])=>'<label>'+l+'<input name="'+k+'" aria-label="'+l+' dopo assetto" type="number" step="0.1" min="0.1" max="10" required value="'+(capture?.ratings[k]??'')+'"></label>').join('');
 $('capture-pi').value=capture?.pi??'';$('capture-pi').min=minPI[current.class];$('capture-pi').max=current.cap;$('capture-error').textContent='';
}
function renderList(){
 const q=$('event-search').value.trim().toLocaleLowerCase('it'),cls=$('class-filter').value;
 const events=data.events.filter(e=>(!cls||e.class===cls)&&(!q||(e.name+' '+e.label+' '+e.requirements.label+' '+e.recommendations.map(r=>data.profiles[r.slug].name).join(' ')).toLocaleLowerCase('it').includes(q)));
 $('event-count').textContent=events.length+' / '+data.events.length;
 $('event-list').innerHTML=events.map(e=>'<button class="event-button" data-event="'+esc(e.id)+'" aria-pressed="'+(e.id===current?.id)+'"><small>'+esc(e.label)+'</small><strong>'+esc(e.name)+'</strong><span>'+esc(e.class?e.class+' · '+e.cap+' PI':'Prova speciale')+' / '+esc(e.requirements.label)+'</span></button>').join('')||'<p class="empty">Nessuna gara con questi filtri nella settimana indicata.</p>';
 $('event-list').querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>selectEvent(b.dataset.event,true)));
}
function selectEvent(id,scroll){
 current=data.events.find(e=>e.id===id)||data.events[0];choice=current.recommendations[0]||null;renderList();renderEvent();
 const url=new URL(location.href);url.searchParams.set('gara',current.id);history.replaceState(null,'',url);
 if(scroll&&matchMedia('(max-width:760px)').matches)$('event-detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
}
function translatePart(s){return String(s||'Non specificato').replace(/^Offroad$/,'Fuoristrada').replace(/^Rally$/,'Rally').replace(/^Vintage WW$/,'Vintage con fascia bianca').replace(/^Stock$/,'Originale').replace(/AWD Full Aero/,'AWD con aerodinamica completa').replace(/Lightest Rims/,'Cerchi più leggeri').replace(/Purist \+ Asanti AF 134 Rims/,'Originale con cerchi Asanti AF 134')}
function renderEvent(){
 const e=current,expired=Date.now()>=Date.parse(e.endsAt);
 $('event-type').textContent=e.label.toUpperCase();$('event-name').textContent=e.name;
 $('requirements').innerHTML='<span class="tag class">'+(e.class?e.class+' · massimo '+e.cap+' PI':'Requisiti della prova')+'</span><span class="tag">'+esc(e.requirements.label)+'</span><span class="tag">'+(expired?'Scaduta il ':'Fino al ')+esc(endDate(e.endsAt))+'</span>';
 $('objective').textContent=e.objective;$('routes').innerHTML=(e.routes.length?e.routes:['Percorso della prova']).map((r,i)=>'<span class="route">'+(e.routes.length>1?(i+1)+'. ':'')+esc(r)+'</span>').join('');
 $('reward').textContent=e.reward.replace(/^Car: /,'Auto: ');
 $('pending-tunes').hidden=!!choice;$('recommendation-content').hidden=!choice;
 if(!choice){$('pending-tunes').innerHTML='Requisiti ufficiali aggiornati. Nessun assetto documentato e compatibile è ancora disponibile per questa gara. <a href="'+esc(safeURL(e.source.url))+'" target="_blank" rel="noopener noreferrer">Consulta la playlist ufficiale ↗</a>';return}
 const car=data.profiles[choice.slug],s=car.stock,fixed=choice.fixed;
 $('car-image').src=localImage(car.image);$('car-image').alt=car.year+' '+car.name+' · anteprima di serie';$('car-make').textContent=car.year+' / '+car.make.toUpperCase();$('car-name').textContent=car.name;
 $('stock-line').textContent='Di serie: '+s.class+' '+s.pi+' PI · '+number(s.hp*1.0138697)+' CV · '+number(s.weight)+' kg · '+s.drive;
 $('pick-label').textContent=fixed?'Auto fornita dalla prova':choice===e.recommendations[0]?'Scelta per questa gara':'Alternativa documentata';
 $('pick-reason').textContent=choice===e.recommendations[0]?e.reason:'Alternativa pubblicata per questo evento da '+choice.author+'. Controlla la preparazione documentata qui sotto e scegli in base alla tua guida.';
 $('target').innerHTML='<strong>'+(fixed?'Preparazione originale · '+s.pi+' PI':'Preparazione '+e.class+' · '+esc(choice.drive))+'</strong><span>'+(fixed?'La prova fissa auto e configurazione.':'Classe pubblicata dal preparatore; limite gara '+e.cap+' PI. Il PI finale esatto non è riportato nella fonte.')+'</span>';
 $('copy-code').hidden=fixed;$('copy-code').textContent='Copia '+(choice.code||'codice assetto');
 const g=new URL('/',location.origin);g.searchParams.set('car',car.slug);g.searchParams.set('type','current');g.searchParams.set('class',e.class);g.searchParams.set('mode',e.mode);g.searchParams.set('drive',choice.drive);$('open-garage').href=g.pathname+g.search;
 $('tuner-source').innerHTML='Preparazione: <a target="_blank" rel="noopener noreferrer" href="'+esc(safeURL(choice.source))+'">'+esc(choice.author)+'</a>'+(!fixed?' · '+esc(choice.name):'');
 $('installation').textContent=fixed?'Entra nella prova Rivali: il gioco mette a disposizione la vettura originale. Nessun componente da acquistare.':'Per riprodurre l’assetto documentato, applica il codice '+choice.code+' su questa esatta auto. Il gioco carica la preparazione e propone l’acquisto dei componenti necessari.';
 $('hardware').hidden=fixed;$('hardware').innerHTML=choice.components.map(p=>'<div><small>'+esc(p.label.toUpperCase())+'</small><strong>'+esc(translatePart(p.value))+'</strong></div>').join('');
 $('parts-note').textContent=fixed?'Il poligono corrisponde alla configurazione della prova.':'Componenti esplicitamente pubblicati dall’autore. La fonte non elenca ogni pezzo e livello: la preparazione completa si riproduce tramite il codice, non aggiungendo pezzi stimati.';
 const steps=fixed?['Avvia Rivali mensili: '+e.name+'.','Usa '+car.year+' '+car.name+' fornita dalla prova.','Registra un giro pulito, senza collisioni o riavvolgimenti.']:['Seleziona '+car.year+' '+car.name+' nel tuo garage.','Apri Potenziamenti e messa a punto → Trova assetti.','Cerca il codice '+choice.code+', controlla auto e classe '+e.class+', poi scarica e applica.','Accetta l’acquisto dei componenti proposto dal gioco e verifica il requisito '+e.requirements.label+' prima di entrare in gara.'];
 $('install-steps').innerHTML=steps.map(s=>'<li>'+esc(s)+'</li>').join('');
 $('sources').innerHTML='<a href="'+esc(safeURL(e.source.url))+'" target="_blank" rel="noopener noreferrer">Requisiti e percorsi · Forza ufficiale ↗</a><a href="'+esc(safeURL(choice.source))+'" target="_blank" rel="noopener noreferrer">'+(fixed?'Auto della prova · Forza ufficiale':'Assetto e componenti pubblicati · '+esc(choice.author))+' ↗</a><a href="'+esc(safeURL(car.source.url))+'" target="_blank" rel="noopener noreferrer">Specifiche e prestazioni di serie · database di gioco ↗</a>';
 const alts=e.recommendations;
 $('alternatives').innerHTML=fixed?'<p class="fixed-note">La vettura è fissata dal gioco per questa prova.</p>':alts.map((r,i)=>{const p=data.profiles[r.slug];return '<button class="alternative" data-code="'+esc(r.code)+'" aria-pressed="'+(r.code===choice.code)+'"><img src="'+esc(localImage(p.image))+'" alt="" width="72" height="55" loading="lazy"><span><strong>'+esc(p.year+' '+p.name)+'</strong><small>'+e.class+' · '+esc(r.drive)+' · '+esc(r.author)+(i===0?' · scelta principale':'')+'</small><small>'+esc(r.code)+'</small></span></button>'}).join('');
 $('alternatives').querySelectorAll('[data-code]').forEach(b=>b.addEventListener('click',()=>{choice=e.recommendations.find(r=>r.code===b.dataset.code);renderEvent()}));
 drawChart();
}
async function load(){
 $('load').hidden=false;$('error').hidden=true;
 try{
  const response=await fetch('/data/eventi.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('archive');data=await response.json();
  if(!data.events?.length||!data.profiles)throw Error('data');
  $('season-title').textContent='SERIE '+data.seriesNumber+' / '+data.series.toUpperCase()+' / '+data.season.toUpperCase();
  $('week-dates').textContent=date(data.startsAt)+' — '+date(data.endsAt)+' '+new Date(data.endsAt).getUTCFullYear();
  $('checked-at').textContent='Fonti controllate il '+date(data.checkedAt+'T12:00:00Z')+' '+data.checkedAt.slice(0,4)+(data.automation?' · aggiornamento settimanale automatico':'');
  const expired=Date.now()>=Date.parse(data.endsAt);$('week-status').textContent=expired?'Settimana archiviata':'Questa settimana';$('week-status').classList.toggle('archived',expired);
  $('expired').hidden=!expired;$('expired').textContent='Questa selezione si riferisce al periodo indicato. Gli eventi settimanali sono scaduti; prima di usare un assetto per una nuova playlist, confronta i requisiti attuali nel gioco. Le prove mensili hanno la propria scadenza.';
  $('workspace').hidden=false;selectEvent(new URLSearchParams(location.search).get('gara'),false);
 }catch(e){$('error').hidden=false}finally{$('load').hidden=true}
}
$('event-search').addEventListener('input',renderList);$('class-filter').addEventListener('change',renderList);$('retry').addEventListener('click',load);
$('copy-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(choice.code);toast('Codice copiato: '+choice.code)}catch{toast('Codice assetto: '+choice.code)}});
$('capture-form').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),ratings=Object.fromEntries(axes.map(([k])=>[k,Number(fd.get(k))])),v={pi:Number($('capture-pi').value),ratings,source:'user-game-screen',savedAt:new Date().toISOString()};
 if(!validCapture(v)){$('capture-error').textContent='Inserisci i sei valori tra 0,1 e 10 e un PI compatibile con la classe '+current.class+'.';return}
 try{localStorage.setItem(captureKey(),JSON.stringify(v));drawChart();toast('Poligono del tuo assetto salvato su questo dispositivo.')}catch{$('capture-error').textContent='Salvataggio locale non disponibile.'}
});
$('clear-capture').addEventListener('click',()=>{try{localStorage.removeItem(captureKey())}catch{}drawChart()});
load();
})();