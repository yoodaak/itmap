// Vercel Function: login check for IT MAP.
import { authRequired, whoami, users, usersRaw } from './_auth.js';
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('check') === '1') return json({ required: authRequired(), ownerPassword: !!process.env.SITE_PASSWORD, extraUsers: users().size, usersVariableFound: !!usersRaw(), usersVariableLength: String(usersRaw() || '').length });
  const u = whoami(request);
  return u ? json(u) : json({ error: 'unauthorized' }, 401);
}
