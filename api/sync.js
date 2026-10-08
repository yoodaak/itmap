// Vercel Function: syncs IT MAP records between devices using Upstash Redis (free plan).
// Connect a store in Vercel → Storage → Upstash Redis (Marketplace). It injects KV_REST_API_URL / KV_REST_API_TOKEN
// (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN); both naming styles are detected.
// Protected by the same SITE_PASSWORD as /api/ai.
export const config = { maxDuration: 30 };

const KEY = 'itmap:docs';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function store() {
  const e = process.env;
  let url = e.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL;
  let token = e.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN;
  if (!url || !token) {
    for (const k of Object.keys(e)) {
      if (!url && /(KV_REST_API_URL|REDIS_REST_URL)$/.test(k)) url = e[k];
      if (!token && /(KV_REST_API_TOKEN|REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k)) token = e[k];
    }
  }
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}
async function redis(cfg, cmd) {
  const r = await fetch(cfg.url, { method: 'POST', headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}
const authed = (request) => !process.env.SITE_PASSWORD || request.headers.get('x-site-password') === process.env.SITE_PASSWORD;

export async function GET(request) {
  const url = new URL(request.url);
  const cfg = store();
  if (url.searchParams.get('check') === '1') return json({ storage: !!cfg });
  if (!authed(request)) return json({ error: 'unauthorized' }, 401);
  if (!cfg) return json({ error: '저장소(Upstash Redis)가 연결되지 않았어요.' }, 501);
  try {
    const since = Number(url.searchParams.get('since')) || 0;
    const flat = (await redis(cfg, ['HGETALL', KEY])) || [];
    const changes = [];
    for (let i = 0; i < flat.length; i += 2) {
      try { const v = JSON.parse(flat[i + 1]); if ((v.s || 0) > since) changes.push({ id: flat[i], d: v.d, t: v.t }); } catch {}
    }
    return json({ now: Date.now(), changes });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}

export async function POST(request) {
  if (!authed(request)) return json({ error: 'unauthorized' }, 401);
  const cfg = store();
  if (!cfg) return json({ error: '저장소(Upstash Redis)가 연결되지 않았어요.' }, 501);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const changes = (Array.isArray(body.changes) ? body.changes : []).filter((c) => c && typeof c.id === 'string' && c.id.length < 200 && Number.isFinite(c.t)).slice(0, 2000);
  if (!changes.length) return json({ now: Date.now(), applied: 0 });
  try {
    const cur = await redis(cfg, ['HMGET', KEY, ...changes.map((c) => c.id)]);
    const now = Date.now();
    const args = [];
    changes.forEach((c, i) => {
      let old = null; try { old = cur[i] ? JSON.parse(cur[i]) : null; } catch {}
      if (!old || c.t > (old.t || 0)) args.push(c.id, JSON.stringify({ d: c.d ?? null, t: c.t, s: now }));
    });
    if (args.length) await redis(cfg, ['HSET', KEY, ...args]);
    return json({ now, applied: args.length / 2 });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
