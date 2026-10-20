// FH6 Tuner: legge i limiti degli slider dalle pagine pubbliche di forzagarage.com
// e li restituisce come JSON alla tua app (stesso dominio, nessun problema CORS).
const BASE = "https://forzagarage.com";
const UA = "FH6-Tuner/1.0 (uso personale; cache lunga)";

function json(obj, status, ttl) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      "content-type": "application/json;charset=utf-8",
      "cache-control": ttl ? "public, max-age=" + ttl : "no-store",
    },
  });
}

function strip(h) {
  return h.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

async function getText(url, ttl) {
  const cache = caches.default, key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return hit.text();
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" } });
  if (!r.ok) throw new Error("forzagarage ha risposto " + r.status);
  const t = await r.text();
  await cache.put(key, new Response(t, { headers: { "cache-control": "public, max-age=" + ttl } }));
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
    out.push({
      s: m[1],
      n: d ? text.slice(0, d.index) : text,
      d: d ? d[1] : "",
      c: d ? d[2] : "",
    });
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
    out.push({ l: a.label, u: a.unit || "", min, max, k: isFinite(k) ? k : 1 });
  }
  return out;
}

// Archivio permanente (KV). Se il collegamento "DB" manca, il programma funziona lo stesso
// usando solo la cache temporanea.
async function dbGet(env, k) {
  if (!env.DB) return null;
  try { return await env.DB.get(k, "json"); } catch (e) { return null; }
}
async function dbPut(env, k, v, ttl) {
  if (!env.DB) return;
  try { await env.DB.put(k, JSON.stringify(v), ttl ? { expirationTtl: ttl } : undefined); } catch (e) {}
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    try {
      if (u.pathname === "/api/cars") {
        let cars = await dbGet(env, "cars");
        if (!cars || !cars.length) {
          cars = parseList(await getText(BASE + "/tuning-wizard/", 86400));
          if (cars.length) await dbPut(env, "cars", cars, 604800);
        }
        return cars.length ? json({ cars }, 200, 86400) : json({ error: "elenco non trovato" }, 404);
      }
      if (u.pathname === "/api/car") {
        const slug = u.searchParams.get("slug") || "";
        if (!/^[a-z0-9-]{3,120}$/.test(slug)) return json({ error: "auto non valida" }, 400);
        let rec = await dbGet(env, "car:" + slug);
        if (!rec || !rec.fields || !rec.fields.length) {
          const fields = parseFields(await getText(BASE + "/cars/" + slug + "/garage/", 604800));
          if (!fields.length) return json({ error: "nessun dato" }, 404);
          rec = { t: Date.now(), fields };
          await dbPut(env, "car:" + slug, rec);
        }
        return json({ slug, fields: rec.fields }, 200, 604800);
      }
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 502);
    }
    return env.ASSETS.fetch(req);
  },
};
