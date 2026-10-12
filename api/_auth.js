// Shared login check for IT MAP functions (files starting with "_" are not deployed as routes).
// SITE_PASSWORD  → the owner's password (owner keeps the original data space)
// USERS          → extra people, each with their own separate data: "동생:비번1, 친구:비번2"
export function users() {
  const m = new Map();
  String(process.env.USERS || '').replace(/[\u200b\ufeff]/g, '').split(/[,，\n;]/).forEach((p) => {
    const s = p.replace(/：/g, ':').replace(/^["'\s]+|["'\s]+$/g, '');
    const i = s.search(/[:=]/);
    if (i > 0) { const n = s.slice(0, i).trim(), w = s.slice(i + 1).trim(); if (n && w) m.set(n.toLowerCase(), w); }
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
  const key = name.toLowerCase();
  if (name && us.has(key) && us.get(key) === pw.trim()) return { name, owner: false };
  if (process.env.SITE_PASSWORD && pw.trim() === process.env.SITE_PASSWORD.trim()) return { name: name || '나', owner: true };
  return null;
}
export const dataKey = (u) => (u.owner ? 'itmap:docs' : 'itmap:docs:u:' + encodeURIComponent(u.name));
