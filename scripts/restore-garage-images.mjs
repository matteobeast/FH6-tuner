import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const manifest = JSON.parse(await fs.readFile('.github/garage-images.json', 'utf8'));
let next = 0, done = 0;
async function restore(item) {
  if (!/^public\/images\/[a-z0-9-]+\.webp$/.test(item.path)) throw Error('Invalid asset path');
  const url = new URL(item.url);
  if (url.origin !== 'https://pub-b1b0dda9cb0644008ffedffa8be50cbf.r2.dev' || !url.pathname.startsWith('/heros/')) throw Error('Unexpected image source');
  let data;
  for (let attempt=0; attempt<3; attempt++) {
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(30000), redirect:'error'});
      if (!response.ok) throw Error('HTTP '+response.status);
      data=Buffer.from(await response.arrayBuffer());
      const sha=crypto.createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
      if (sha!==item.sha) throw Error('Image differs from verified release: '+item.path);
      break;
    } catch(error) { if(attempt===2) throw error; await new Promise(r=>setTimeout(r,1000*(attempt+1))); }
  }
  await fs.mkdir(path.dirname(item.path),{recursive:true});
  await fs.writeFile(item.path,data);
  if(++done % 50 === 0) console.log(done+'/'+manifest.length+' images verified');
}
await Promise.all(Array.from({length:8},async()=>{while(next<manifest.length)await restore(manifest[next++]);}));
console.log('All '+done+' release images restored and verified.');
