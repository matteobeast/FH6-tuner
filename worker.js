// FH6 Tuner — archivio progressivo. Mantiene le risposte API usate dalla PWA.
const BASE = 'https://forzagarage.com';
const UA = 'FH6-Tuner/2.0';
const VERSION = 3;
const BATCH = 6;
const DAY = 86400000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function json(value, status = 200, ttl = 0) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json;charset=utf-8',
    'cache-control': ttl ? `public, max-age=${ttl}` : 'no-store',
    'x-content-type-options': 'nosniff',
  } });
}
function decode(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, x) => {
    const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
    if (x[0] !== '#') return named[x.toLowerCase()] ?? all;
    const n = x[1].toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : parseInt(x.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}
function strip(html) {
  return decode(html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function attrs(tag) {
  const out = Object.create(null);
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return out;
}
function number(s) {
  if (s === undefined || String(s).trim() === '') return NaN;
  return Number(String(s).replace(/,/g, ''));
}
function parseList(html) {
  const out = [], seen = new Set();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const a = attrs(m[1]);
    let url;
    try { url = new URL(a.href, BASE); } catch { continue; }
    const slug = url.pathname.match(/^\/cars\/([a-z0-9-]+)\/tune-wizard\/?$/i)?.[1];
    if (url.origin !== BASE || !slug || seen.has(slug)) continue;
    const text = strip(m[2]), d = text.match(/\s(FWD|RWD|AWD)\s+([A-Z0-9]{1,2})\s*$/);
    seen.add(slug);
    out.push({ s: slug, n: d ? text.slice(0, d.index) : text, d: d?.[1] || '', c: d?.[2] || '' });
  }
  return out;
}
function parseFields(html) {
  const out = [], seen = new Set();
  for (const tag of html.match(/<[a-z][^>]*\bdata-label\s*=[^>]*>/gi) || []) {
    const all = attrs(tag), a = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('data-')).map(([k, v]) => [k.slice(5), v]));
    const min = number(a.min), max = number(a.max), k = number(a.scale);
    const id = [a.label, a.unit, a.axle, a.side].join('|');
    if (!a.label || !Number.isFinite(min) || !Number.isFinite(max) || min > max || seen.has(id)) continue;
    seen.add(id);
    out.push({ l: a.label, u: a.unit || '', min, max, k: Number.isFinite(k) ? k : 1, a });
  }
  return out;
}
function parseSpec(text) {
  const out = {};
  const rules = [
    ['pi', /\b(\d{3,4})\s*PI\b/i], ['hp', /\b([\d,.]+)\s*(?:hp|bhp)\b/i],
    ['fp', /(?:Distribution|Balance)\W{0,12}(\d{2}(?:\.\d+)?)\s*%/i],
  ];
  for (const [key, re] of rules) { const m = text.match(re); if (m) out[key] = number(m[1]); }
  let m = text.match(/Weight\W{0,12}(\d[\d,.]*)\s*(kg|lbs?)\b/i);
  if (m) { out.w = number(m[1]); out.wu = m[2].toLowerCase(); }
  m = text.match(/\b([\d,.]+)\s*(Nm|lb-ft|lb·ft)\b/i);
  if (m) { out.torque = number(m[1]); out.torqueUnit = m[2]; }
  m = text.match(/\b(FWD|RWD|AWD)\b/); if (m) out.drivetrain = m[1];
  return out;
}
function parseDetails(html) {
  const specs = [], options = [];
  for (const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(x => strip(x[1]));
    if (cells.length >= 2 && cells[0]) specs.push({ label: cells[0], value: cells.slice(1).join(' | ') });
  }
  for (const m of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi)) specs.push({ label: strip(m[1]), value: strip(m[2]) });
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const a = attrs(m[1]);
    options.push({ name: a.name || a.id || a['aria-label'] || '', values: [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map(x => ({ value: attrs(x[1]).value || '', label: strip(x[2]) })) });
  }
  return { specs, options };
}

// Se robots.txt non e verificabile sospende le nuove letture; i dati salvati restano disponibili.
function robotRule(text, path) {
  const groups = []; let group = null, hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.split('#')[0].trim().match(/^([a-z-]+)\s*:\s*(.*)$/i); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!group || hasRules) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); hasRules = false; }
      group.agents.push(v.toLowerCase());
    } else if (group) {
      hasRules = true;
      if ((k === 'allow' || k === 'disallow') && v) group.rules.push({ allow: k === 'allow', path: v });
      if (k === 'crawl-delay' && Number.isFinite(Number(v))) group.delay = Math.max(group.delay, Number(v) * 1000);
    }
  }
  let selected = groups.filter(g => g.agents.some(a => a !== '*' && 'fh6-tuner'.includes(a)));
  if (!selected.length) selected = groups.filter(g => g.agents.includes('*'));
  let best = -1, allowed = true;
  for (const r of selected.flatMap(g => g.rules)) {
    const pattern = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    const size = r.path.replace(/[*$]/g, '').length;
    if (new RegExp('^' + pattern).test(path) && (size > best || (size === best && r.allow))) { best = size; allowed = r.allow; }
  }
  return { allowed, delay: Math.max(1500, ...selected.map(g => g.delay)) };
}
async function request(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) { const e = new Error(`forzagarage: HTTP ${response.status}`); e.status = response.status; throw e; }
  return response.text();
}
async function robots() {
  const key = new Request(BASE + '/robots.txt');
  const cache = globalThis.caches?.default;
  const hit = await cache?.match(key); if (hit) return hit.text();
  let text;
  try { text = await request(key.url); } catch (e) { if (e.status === 404) return ''; throw e; }
  if (cache) await cache.put(key, new Response(text, { headers: { 'cache-control': 'public, max-age=3600' } }));
  return text;
}
function reader(policy) {
  let last = 0;
  return async path => {
    const rule = robotRule(policy, path);
    if (!rule.allowed) { const e = new Error(`Lettura esclusa da robots.txt: ${path}`); e.status = 403; throw e; }
    if (rule.delay > 30000) throw new Error('Crawl-delay superiore al budget: raccolta sospesa');
    await pause(Math.max(0, rule.delay - (Date.now() - last)));
    last = Date.now();
    return request(BASE + path);
  };
}
async function dbGet(env, key) { return env.DB ? env.DB.get(key, 'json') : null; }
async function dbPut(env, key, value, metadata) {
  if (!env.DB) throw new Error('Database KV DB non collegato');
  await env.DB.put(key, JSON.stringify(value), metadata ? { metadata } : {});
}
async function inventory(env) {
  const keys = []; let cursor;
  do {
    const page = await env.DB.list({ prefix: 'car:', limit: 1000, ...(cursor ? { cursor } : {}) });
    keys.push(...page.keys); cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return keys;
}
async function getCars(env, read) {
  const saved = await dbGet(env, 'cars');
  const checked = await dbGet(env, 'cars:checked');
  if (saved?.length && checked && Date.now() - checked < 7 * DAY) return saved;
  try {
    read ||= reader(await robots());
    const list = parseList(await read('/tuning-wizard/'));
    if (!list.length) throw new Error('Elenco vuoto o struttura sorgente cambiata');
    if (env.DB) { await dbPut(env, 'cars', list); await dbPut(env, 'cars:checked', Date.now()); }
    return list;
  } catch (e) { if (saved?.length) return saved; throw e; }
}
async function readCar(slug, read, previous) {
  const paths = [`/cars/${slug}/garage/`, `/cars/${slug}/`];
  const pages = [], errors = [];
  for (const path of paths) {
    try { pages.push({ path, html: await read(path) }); }
    catch (e) { if ([403, 429, 503].includes(e.status)) throw e; errors.push({ path, error: e.message }); }
  }
  const fields = [...new Map(pages.flatMap(p => parseFields(p.html)).map(f => [JSON.stringify([f.l, f.u, f.a.axle, f.a.side]), f])).values()];
  const spec = Object.assign({}, ...pages.map(p => parseSpec(strip(p.html))));
  const details = pages.map(p => ({ url: BASE + p.path, ...parseDetails(p.html) }));
  if (!fields.length && !Object.keys(spec).length && !details.some(p => p.specs.length || p.options.length)) throw new Error('Nessun dato riconosciuto: verificare la struttura del sito');
  const text = pages.map(p => strip(p.html)).join(' '), i = text.search(/specifications/i);
  return {
    ...previous, v: VERSION, t: Date.now(), slug,
    fields: fields.length ? fields : previous?.fields || [],
    spec: { ...previous?.spec, ...spec },
    snip: i >= 0 ? text.slice(i, i + 1200) : previous?.snip || '',
    details, sources: pages.map(p => ({ url: BASE + p.path, retrievedAt: new Date().toISOString() })),
    complete: errors.length === 0 && fields.length > 0, errors,
  };
}
async function saveCar(env, slug, rec) {
  await dbPut(env, 'car:' + slug, rec, { v: VERSION, complete: rec.complete, t: rec.t });
}
let running = false; // evita sovrapposizioni nello stesso isolate; KV non offre lock distribuiti.
async function crawl(env) {
  if (!env.DB) throw new Error('Database KV DB non collegato');
  if (running) return;
  running = true;
  let st;
  try {
    st = await dbGet(env, 'crawl:v3') || { cursor: 0, fail: {} };
    const read = reader(await robots()), cars = await getCars(env, read);
    const known = new Map((await inventory(env)).map(k => [k.name.slice(4), k.metadata]));
    let attempted = 0, visited = 0;
    const start = Date.now();
    st.error = null;
    while (visited < cars.length && attempted < BATCH && Date.now() - start < 45000) {
      const c = cars[st.cursor % cars.length]; st.cursor = (st.cursor + 1) % cars.length; visited++;
      const meta = known.get(c.s), failure = st.fail[c.s];
      if ((meta?.v === VERSION && meta.complete) || failure?.next > Date.now()) continue;
      attempted++;
      try {
        const previous = await dbGet(env, 'car:' + c.s);
        const rec = await readCar(c.s, read, previous);
        await saveCar(env, c.s, rec); // Solo dopo questo await il salvataggio e riuscito.
        if (rec.complete) delete st.fail[c.s];
        else st.fail[c.s] = { attempts: (failure?.attempts || 0) + 1, next: Date.now() + DAY, error: 'Dati parziali; nuovo tentativo tra 24 ore' };
      } catch (e) {
        const attempts = (failure?.attempts || 0) + 1;
        st.fail[c.s] = { attempts, next: Date.now() + Math.min(DAY, 300000 * 2 ** Math.min(attempts, 8)), error: e.message };
        if ([403, 429, 503].includes(e.status)) { st.error = e.message; break; }
      }
    }
    st.t = Date.now(); st.attempted = attempted;
    await dbPut(env, 'crawl:v3', st);
  } catch (e) {
    if (st) { st.error = e.message; st.t = Date.now(); await dbPut(env, 'crawl:v3', st); }
    throw e;
  } finally { running = false; }
}
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (!u.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'GET') return json({ error: 'Metodo non consentito' }, 405);
    try {
      if (u.pathname === '/api/cars') return json({ cars: await getCars(env) }, 200, 3600);
      if (u.pathname === '/api/status') {
        if (!env.DB) return json({ database: false, error: 'KV DB non collegato', salvate: 0, totale: 0, fallite: 0, ultimo: null }, 503);
        const [keys, cars, st] = await Promise.all([inventory(env), dbGet(env, 'cars'), dbGet(env, 'crawl:v3')]);
        const current = new Set((cars || []).map(c => c.s));
        const saved = keys.filter(k => current.has(k.name.slice(4)));
        const complete = saved.filter(k => k.metadata?.v === VERSION && k.metadata.complete).length;
        return json({ database: true, salvate: saved.length, complete, daVerificare: saved.length - complete, archiviate: keys.length, totale: current.size, fallite: Object.keys(st?.fail || {}).filter(s => current.has(s)).length, ultimo: st?.t || null, errore: st?.error || null, dettagliErrori: st?.fail || {} });
      }
      if (u.pathname === '/api/export') {
        if (!env.DB) return json({ error: 'KV DB non collegato' }, 503);
        const cursor = u.searchParams.get('cursor');
        const page = await env.DB.list({ prefix: 'car:', limit: 10, ...(cursor ? { cursor } : {}) });
        const cars = await Promise.all(page.keys.map(async k => ({ slug: k.name.slice(4), record: await dbGet(env, k.name) })));
        return json({ v: VERSION, cars, cursor: page.list_complete ? null : page.cursor });
      }
      if (u.pathname === '/api/car') {
        const slug = u.searchParams.get('slug') || '';
        if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json({ error: 'Auto non valida' }, 400);
        let rec = await dbGet(env, 'car:' + slug);
        if (!rec) {
          const read = reader(await robots());
          const cars = await getCars(env, read);
          if (!cars.some(c => c.s === slug)) return json({ error: 'Auto assente dal catalogo' }, 404);
          rec = await readCar(slug, read);
          if (env.DB) await saveCar(env, slug, rec);
        }
        return json({ slug, fields: rec.fields || [], spec: rec.spec || {}, snip: rec.snip || '', details: rec.details || [], sources: rec.sources || [], aggiornato: rec.t, database: !!env.DB, complete: rec.complete ?? false }, 200, 3600);
      }
      return json({ error: 'Endpoint non trovato' }, 404);
    } catch (e) { console.error(e); return json({ error: e.message || String(e) }, 502); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(crawl(env)); },
};

export { parseList, parseFields, parseSpec, parseDetails, robotRule, readCar, crawl };
