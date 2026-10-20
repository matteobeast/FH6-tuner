// FH6 Tuner: legge i dati pubblici di forzagarage.com, li salva nel tuo archivio (KV)
// e li serve alla tua app. Un lettore lento in background riempie l'archivio.
const BASE = "https://forzagarage.com";
const UA = "FH6-Tuner/1.0 (uso personale; lettura lenta)";
const BATCH = 6; // auto lette ogni 5 minuti

function json(obj, status, ttl) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json;charset=utf-8", "cache-control": ttl ? "public, max-age=" + ttl : "no-store" },
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function strip(h) {
  return h.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}
function pageText(h) {
  return strip(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
}
async function getText(url, ttl, nocache) {
  const cache = caches.default, key = new Request(url);
  if (!nocache) { const hit = await cache.match(key); if (hit) return hit.text(); }
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!r.ok) throw new Error("forzagarage ha risposto " + r.status);
  const t = await r.text();
  if (!nocache) await cache.put(key, new Response(t, { headers: { "cache-control": "public, max-age=" + ttl } }));
  return t;
}

function parseList(html) {
  const out = [], seen = new Set();
  const re = /<a\b[^>]*href="[^"]*\/cars\/([a-z0-9-]+)\/tune-wizard\/?"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const text = strip(m[2]);
    const d = text.match(/\s(FWD|RWD|AWD)\s+([A-Z0-9]{1,2})\s*$/);
    out.push({ s: m[1], n: d ? text.slice(0, d.index) : text, d: d ? d[1] : "", c: d ? d[2] : "" });
  }
  return out;
}
function parseFields(html) {
  const out = [], seen = new Set();
  const tags = html.match(/<[a-z][^>]*\bdata-label="[^"]*"[^>]*>/gi) || [];
  for (const tag of tags) {
    const a = {};
    tag.replace(/\bdata-([a-z-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; return ""; });
    const min = parseFloat(a.min), max = parseFloat(a.max);
    if (!a.label || !isFinite(min) || !isFinite(max) || seen.has(a.label)) continue;
    seen.add(a.label);
    const k = parseFloat(a.scale);
    out.push({ l: a.label, u: a.unit || "", min, max, k: isFinite(k) ? k : 1, a });
  }
  return out;
}
function parseSpec(t) {
  const o = {};
  let m;
  if ((m = t.match(/(?<!\d)(\d{3})\s*PI\b/i))) o.pi = +m[1];
  if ((m = t.match(/\b(\d{2,4})\s*hp\b/i))) o.hp = +m[1];
  if ((m = t.match(/Weight\W{0,12}(\d[\d,.]*)\s*(kg|lbs?)\b/i))) { o.w = parseFloat(m[1].replace(/,/g, "")); o.wu = m[2].toLowerCase(); }
  if ((m = t.match(/(?:Distribution|Balance)\W{0,12}(\d{2}(?:\.\d+)?)\s*%/i))) o.fp = parseFloat(m[1]);
  return o;
}

async function readCar(slug, nocache) {
  const g = await getText(BASE + "/cars/" + slug + "/garage/", 604800, nocache);
  const fields = parseFields(g);
  if (!fields.length) return null;
  let spec = parseSpec(pageText(g)), snip = "";
  try {
    const t = pageText(await getText(BASE + "/cars/" + slug + "/", 604800, nocache));
    const s2 = parseSpec(t);
    for (const k in s2) spec[k] = s2[k];
    const i = t.search(/specifications/i);
    snip = i >= 0 ? t.slice(i, i + 1200) : "";
  } catch (e) {}
  return { v: 2, t: Date.now(), fields, spec, snip };
}

async function dbGet(env, k) { if (!env.DB) return null; try { return await env.DB.get(k, "json"); } catch (e) { return null; } }
async function dbPut(env, k, v, ttl) { if (!env.DB) return; try { await env.DB.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined); } catch (e) {} }

async function robotsOk(path) {
  try {
    const r = await fetch(BASE + "/robots.txt", { headers: { "user-agent": UA } });
    if (!r.ok) return true;
    let applies = false, prevUA = false;
    const dis = [];
    for (const raw of (await r.text()).split(/\r?\n/)) {
      const m = raw.split("#")[0].trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const k = m[1].toLowerCase(), v = m[2].trim();
      if (k === "user-agent") { if (!prevUA) applies = false; applies = applies || v === "*" || /fh6-tuner/i.test(v); prevUA = true; }
      else { prevUA = false; if (k === "disallow" && applies && v) dis.push(v); }
    }
    return !dis.some((d) => path.startsWith(d));
  } catch (e) { return true; }
}

async function getCars(env) {
  let cars = await dbGet(env, "cars");
  if (!cars || !cars.length) {
    cars = parseList(await getText(BASE + "/tuning-wizard/", 86400));
    if (cars.length) await dbPut(env, "cars", cars, 604800);
  }
  return cars;
}

async function crawl(env) {
  if (!env.DB || !(await robotsOk("/cars/"))) return;
  const cars = await getCars(env);
  const st = (await dbGet(env, "crawl")) || { done: {}, fail: {} };
  let n = 0;
  for (const c of cars) {
    if (n >= BATCH) break;
    if (st.done[c.s] || (st.fail[c.s] || 0) >= 3) continue;
    n++;
    try {
      const rec = await readCar(c.s, true);
      if (rec) { await dbPut(env, "car:" + c.s, rec); st.done[c.s] = 1; } else st.fail[c.s] = (st.fail[c.s] || 0) + 1;
    } catch (e) { st.fail[c.s] = (st.fail[c.s] || 0) + 1; }
    await wait(1500);
  }
  st.t = Date.now();
  await dbPut(env, "crawl", st);
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      if (u.pathname === "/api/cars") {
        const cars = await getCars(env);
        return cars.length ? json({ cars }, 200, 86400) : json({ error: "elenco non trovato" }, 404);
      }
      if (u.pathname === "/api/status") {
        const st = (await dbGet(env, "crawl")) || { done: {}, fail: {} };
        const cars = (await dbGet(env, "cars")) || [];
        return json({ salvate: Object.keys(st.done).length, totale: cars.length, fallite: Object.keys(st.fail).length, ultimo: st.t || null });
      }
      if (u.pathname === "/api/car") {
        const slug = u.searchParams.get("slug") || "";
        if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json({ error: "auto non valida" }, 400);
        let rec = await dbGet(env, "car:" + slug);
        if (!rec || rec.v !== 2) {
          rec = await readCar(slug, false);
          if (!rec) return json({ error: "nessun dato" }, 404);
          await dbPut(env, "car:" + slug, rec);
        }
        return json({ slug, fields: rec.fields, spec: rec.spec, snip: rec.snip }, 200, 604800);
      }
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502);
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(crawl(env)); },
};
