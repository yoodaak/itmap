// Vercel Function: login check + owner-only user management for IT MAP.
import { authRequired, whoami, users, usersRaw, store, redis, hashPw, USERS_KEY } from './_auth.js';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function storedUsers(cfg) {
  if (!cfg) return [];
  const flat = (await redis(cfg, ['HGETALL', USERS_KEY])) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) { try { const u = JSON.parse(flat[i + 1]); out.push({ name: u.name, created: u.created }); } catch {} }
  return out;
}

export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('check') === '1') {
    let stored = 0; try { stored = (await storedUsers(store())).length; } catch {}
    return json({ required: authRequired(), ownerPassword: !!process.env.SITE_PASSWORD, extraUsers: users().size + stored, siteUsers: stored, envUsers: users().size, usersVariableFound: !!usersRaw() });
  }
  const u = await whoami(request);
  return u ? json(u) : json({ error: 'unauthorized' }, 401);
}

export async function POST(request) {
  const me = await whoami(request);
  if (!me) return json({ error: 'unauthorized' }, 401);
  if (!me.owner || me.open) return json({ error: '사용자 관리는 사이트 주인만 할 수 있어요.' }, 403);
  const cfg = store();
  if (!cfg) return json({ error: '저장소(Upstash Redis)가 연결되어 있어야 사용자를 추가할 수 있어요.' }, 501);
  let body = {};
  try { body = await request.json(); } catch {}
  const action = body.action;
  try {
    if (action === 'list') return json({ users: await storedUsers(cfg), envUsers: [...users().keys()] });
    const name = String(body.name || '').trim();
    const key = name.toLowerCase();
    if (!name || name.length > 20 || /[:,;]/.test(name)) return json({ error: '이름은 1~20자이고 : , ; 는 쓸 수 없어요.' }, 400);
    if (action === 'remove') { await redis(cfg, ['HDEL', USERS_KEY, key]); return json({ ok: true }); }
    if (action === 'add' || action === 'reset') {
      const pw = String(body.pw || '').trim();
      if (pw.length < 4) return json({ error: '비밀번호는 4자 이상으로 정해 주세요.' }, 400);
      if (action === 'add' && (await redis(cfg, ['HEXISTS', USERS_KEY, key]))) return json({ error: '이미 있는 이름이에요. 비밀번호를 바꾸려면 "비밀번호 재설정"을 쓰세요.' }, 409);
      const salt = crypto.randomUUID();
      await redis(cfg, ['HSET', USERS_KEY, key, JSON.stringify({ name, salt, hash: await hashPw(salt, pw), created: new Date().toISOString() })]);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
}
