// Shared login check for IT MAP functions (files starting with "_" are not deployed as routes).
// SITE_PASSWORD  → the owner's password (owner keeps the original data space)
// USERS          → extra people, each with their own separate data: "동생:비번1, 친구:비번2"
export function users() {
  const m = new Map();
  String(process.env.USERS || '').split(/[,\n;]/).forEach((p) => {
    const i = p.indexOf(':');
    if (i > 0) { const n = p.slice(0, i).trim(), w = p.slice(i + 1).trim(); if (n && w) m.set(n, w); }
  });
  return m;
}
export const authRequired = () => !!process.env.SITE_PASSWORD || users().size > 0;
export function whoami(request) {
  if (!authRequired()) return { name: '', owner: true, open: true };
  let name = '';
  try { name = decodeURIComponent(request.headers.get('x-itmap-user') || '').trim(); } catch {}
  const pw = request.headers.get('x-site-password') || '';
  const us = users();
  if (name && us.has(name) && us.get(name) === pw) return { name, owner: false };
  if (process.env.SITE_PASSWORD && pw === process.env.SITE_PASSWORD) return { name: name || '나', owner: true };
  return null;
}
export const dataKey = (u) => (u.owner ? 'itmap:docs' : 'itmap:docs:u:' + encodeURIComponent(u.name));
