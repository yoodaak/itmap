// Vercel Function: proxies IT MAP's AI requests to the Google Gemini API.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   GEMINI_API_KEY  (required)  key from https://aistudio.google.com/apikey
//   SITE_PASSWORD   (optional)  if set, the site asks for this password before using AI
//   GEMINI_MODEL    (optional)  defaults to gemini-flash-latest
export const config = { maxDuration: 60 };

const TR = '\u0000[[TRUNCATED]]';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export function GET() {
  return json({ ok: true, hasKey: !!process.env.GEMINI_API_KEY, passwordProtected: !!process.env.SITE_PASSWORD });
}

export async function POST(request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' }, 500);
  const pw = process.env.SITE_PASSWORD;
  if (pw && request.headers.get('x-site-password') !== pw) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const contents = [];
  let size = 0;
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const role = m && m.role === 'assistant' ? 'model' : 'user';
    const text = String((m && m.content) || '');
    if (!text) continue;
    size += text.length;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += '\n\n' + text;
    else contents.push({ role, parts: [{ text }] });
  }
  if (!contents.length) return json({ error: 'empty prompt' }, 400);
  if (size > 300000) return json({ error: 'prompt too large' }, 413);

  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const generationConfig = { maxOutputTokens: 16384, temperature: 0.7 };
  if (body.json) generationConfig.responseMimeType = 'application/json';

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents, generationConfig }),
      signal: request.signal,
    }
  );
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 600);
    console.error('Gemini error', upstream.status, detail);
    return json({ error: `Gemini ${upstream.status}`, detail }, upstream.status === 429 ? 429 : 502);
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '';
  const stream = new ReadableStream({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) { ctrl.close(); return; }
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const d = JSON.parse(line.slice(5));
          const cand = d.candidates && d.candidates[0];
          const parts = (cand && cand.content && cand.content.parts) || [];
          const txt = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
          if (txt) ctrl.enqueue(enc.encode(txt));
          if (cand && cand.finishReason === 'MAX_TOKENS') ctrl.enqueue(enc.encode(TR));
        } catch {}
      }
    },
    cancel() { reader.cancel(); },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
