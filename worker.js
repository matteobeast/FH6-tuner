// FH6 Tuner — archivio statico indipendente. Nessun KV e nessuna raccolta periodica.
function json(value,status=200,ttl=3600){
 return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':ttl?'public, max-age='+ttl:'no-store','x-content-type-options':'nosniff'}});
}
const validSlug=slug=>/^[a-z0-9-]{3,120}$/.test(slug);
async function archiveAsset(req,env,path){
 const response=await env.ASSETS.fetch(new Request(new URL(path,req.url),{method:'GET'}));
 if(response.status===404)return null;
 if(!response.ok)throw Error('Archivio locale non disponibile');
 return response;
}
async function archiveJSON(req,env,path){
 const response=await archiveAsset(req,env,path);
 return response?response.json():null;
}
async function garageResponse(req,env,slug){
 if(!validSlug(slug))return json({error:'Auto non valida'},400,0);
 const response=await archiveAsset(req,env,'/data/cars/'+slug+'.json');
 if(!response)return json({error:'Auto non presente nell’archivio'},404,0);
 const headers=new Headers(response.headers);headers.set('content-type','application/json;charset=utf-8');headers.set('cache-control','public, max-age=3600');headers.set('x-content-type-options','nosniff');
 return new Response(response.body,{status:200,headers});
}
const MODEL_ARCHIVE = 'https://modelli.sev4s3d.it';
async function serveModel(req, slug) {
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json({ error: 'Auto non valida' }, 400);
  const headers = new Headers();
  for (const name of ['range','if-range','if-none-match','if-modified-since']) {
    const value = req.headers.get(name); if (value) headers.set(name,value);
  }
  let upstream;
  try {
    upstream = await fetch(MODEL_ARCHIVE + '/models/' + slug + '.glb', {
      method:req.method, headers, redirect:'manual', signal:AbortSignal.timeout(30000)
    });
  } catch { return json({error:'Archivio ZimaOS momentaneamente non raggiungibile'},503); }
  if (upstream.status === 404) { await upstream.body?.cancel(); return json({error:'Modello non ancora archiviato'},404); }
  if (![200,206,304,416].includes(upstream.status)) {
    await upstream.body?.cancel(); return json({error:'Archivio ZimaOS momentaneamente non disponibile'},503);
  }
  const output = new Headers({'x-content-type-options':'nosniff'});
  for (const name of ['content-type','content-length','content-range','accept-ranges','etag','last-modified']) {
    const value=upstream.headers.get(name); if(value) output.set(name,value);
  }
  if ([200,206].includes(upstream.status)) output.set('content-type','model/gltf-binary');
  output.set('cache-control',upstream.status===416?'no-store':'public, max-age=3600');
  const empty=req.method==='HEAD'||upstream.status===304;
  if(empty) await upstream.body?.cancel();
  return new Response(empty?null:upstream.body,{status:upstream.status,headers:output});
}

export default {
 async fetch(req,env){
  const u=new URL(req.url);
  if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
  if(req.method!=='GET'&&!(u.pathname==='/api/model'&&req.method==='HEAD'))return json({error:'Metodo non consentito'},405,0);
  try{
   if(u.pathname==='/api/model')return await serveModel(req,u.searchParams.get('slug')||'');
   if(u.pathname==='/api/garage')return await garageResponse(req,env,u.searchParams.get('slug')||'');
   if(u.pathname==='/api/cars'||u.pathname==='/api/status'){
    const path=u.pathname==='/api/cars'?'/data/cars.json':'/data/status.json';
    const response=await archiveAsset(req,env,path);if(!response)return json({error:'Archivio non disponibile'},503,0);
    const headers=new Headers(response.headers);headers.set('cache-control','public, max-age=3600');headers.set('content-type','application/json;charset=utf-8');return new Response(response.body,{headers});
   }
   if(u.pathname==='/api/car'){
    const slug=u.searchParams.get('slug')||'';if(!validSlug(slug))return json({error:'Auto non valida'},400,0);
    const rec=await archiveJSON(req,env,'/data/cars/'+slug+'.json');if(!rec)return json({error:'Auto non presente nell’archivio'},404,0);
    return json({slug,fields:rec.fields||[],spec:rec.spec||{},snip:rec.snip||'',details:rec.details||[],sources:rec.sources||[],aggiornato:rec.t,database:false,storage:'static',complete:rec.complete??false});
   }
   if(u.pathname==='/api/export'){
    const raw=u.searchParams.get('cursor')||'0';if(!/^\d{1,6}$/.test(raw))return json({error:'Cursore non valido'},400,0);
    const manifest=await archiveJSON(req,env,'/data/archive.json');if(!manifest)return json({error:'Archivio non disponibile'},503,0);
    const offset=Number(raw),records=manifest.records.slice(offset,offset+10);
    const cars=await Promise.all(records.map(async item=>({slug:item.slug,record:await archiveJSON(req,env,'/'+item.path)})));
    return json({v:6,cars,cursor:offset+10<manifest.records.length?String(offset+10):null});
   }
   return json({error:'Endpoint non trovato'},404,0);
  }catch(error){console.error(error);return json({error:'Archivio temporaneamente non disponibile'},503,0)}
 }
};
export { garageResponse, serveModel };
