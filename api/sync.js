// Vercel Function: syncs IT MAP records between devices using Upstash Redis (free plan).
// Connect a store in Vercel → Storage → Upstash Redis (Marketplace). It injects KV_REST_API_URL / KV_REST_API_TOKEN
// (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN); both naming styles are detected.
// Protected by the same SITE_PASSWORD as /api/ai.
import { whoami, dataKey, store, redis } from './_auth.js';
export const config = { maxDuration: 30 };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function GET(request) {
  const url = new URL(request.url);
  const cfg = store();
  if (url.searchParams.get('check') === '1') return json({ storage: !!cfg });
  const me = await whoami(request);
  if (!me) return json({ error: 'unauthorized' }, 401);
  if (!cfg) return json({ error: '저장소(Upstash Redis)가 연결되지 않았어요.' }, 501);
  const KEY = dataKey(me);
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
  const me = await whoami(request);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const KEY = dataKey(me);
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
