// Shared login + storage helpers for IT MAP functions (files starting with "_" are not deployed as routes).
// SITE_PASSWORD → the owner's password (owner keeps the original data space)
// Extra people can be added two ways:
//   1) in the site: My Space → 사용자 관리 (owner only; stored in Upstash Redis, passwords hashed)
//   2) env var USERS="동생:비번1, 친구:비번2"
export function store() {
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
export async function redis(cfg, cmd) {
  const r = await fetch(cfg.url, { method: 'POST', headers: { authorization: 'Bearer ' + cfg.token, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}
export const USERS_KEY = 'itmap:users';
export function usersRaw() {
  if (process.env.USERS) return process.env.USERS;
  const k = Object.keys(process.env).find((x) => x.trim().toUpperCase() === 'USERS');
  return k ? process.env[k] : '';
}
export function users() {
  const m = new Map();
  String(usersRaw() || '').replace(/[​﻿]/g, '').split(/[,，\n;]/).forEach((p) => {
    const s = p.replace(/：/g, ':').replace(/^["'\s]+|["'\s]+$/g, '');
    let i = s.search(/[:=]/);
    if (i < 0) i = s.search(/\s/);
    if (i > 0) { const n = s.slice(0, i).trim(), w = s.slice(i + 1).trim(); if (n && w) m.set(n.toLowerCase(), w); }
  });
  return m;
}
export async function hashPw(salt, pw) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const authRequired = () => !!process.env.SITE_PASSWORD || users().size > 0;
export async function whoami(request) {
  if (!authRequired()) return { name: '', owner: true, open: true };
  let name = '';
  try { name = decodeURIComponent(request.headers.get('x-itmap-user') || '').trim(); } catch {}
  const pw = (request.headers.get('x-site-password') || '').trim();
  if (!pw) return null;
  const key = name.toLowerCase();
  const us = users();
  if (name && us.has(key) && us.get(key) === pw) return { name, owner: false };
  if (process.env.SITE_PASSWORD && pw === process.env.SITE_PASSWORD.trim()) return { name: name || '나', owner: true };
  if (name) {
    const cfg = store();
    if (cfg) {
      try {
        const v = await redis(cfg, ['HGET', USERS_KEY, key]);
        if (v) { const u = JSON.parse(v); if ((await hashPw(u.salt, pw)) === u.hash) return { name: u.name, owner: false }; }
      } catch {}
    }
  }
  return null;
}
export const dataKey = (u) => (u.owner ? 'itmap:docs' : 'itmap:docs:u:' + encodeURIComponent(u.name));
