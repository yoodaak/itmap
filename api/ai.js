// Vercel Function: proxies IT MAP's AI requests to the Google Gemini API.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   GEMINI_API_KEY  (required)  key from https://aistudio.google.com/apikey
//   SITE_PASSWORD   (optional)  if set, the site asks for this password before using AI
//   GEMINI_MODEL    (optional)  defaults to gemini-flash-latest
export const config = { maxDuration: 300 };

const TR = '\u0000[[TRUNCATED]]';
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

function explain(status, detail) {
  let msg = '', reason = '';
  try { const e = JSON.parse(detail).error || {}; msg = e.message || ''; reason = ((e.details || []).find((d) => d.reason) || {}).reason || e.status || ''; } catch {}
  const t = (msg + ' ' + reason).toLowerCase();
  if (t.includes('api_key_invalid') || t.includes('api key not valid')) return 'Gemini API 키가 올바르지 않아요. Vercel의 GEMINI_API_KEY 값을 다시 복사해 넣고 Redeploy 하세요.';
  if (status === 404 || t.includes('not found') || t.includes('is not supported')) return `모델을 찾을 수 없어요 (${process.env.GEMINI_MODEL || 'gemini-flash-latest'}). Vercel에 GEMINI_MODEL=gemini-2.5-flash 를 추가하고 Redeploy 해 보세요.`;
  if (status === 429 || t.includes('quota') || t.includes('resource_exhausted')) return 'Gemini 무료 사용량 한도에 걸렸어요. 1분쯤 뒤에 다시 시도하거나, 하루 한도라면 내일 다시 시도하세요.';
  if (status === 403 || t.includes('permission')) return 'Gemini API 사용 권한이 없어요. Google AI Studio에서 키를 새로 만들어 넣어 보세요.';
  if (status === 400 && t.includes('location')) return '이 지역에서는 Gemini API를 쓸 수 없다고 나와요.';
  return `Gemini 오류 ${status}: ${msg.slice(0, 200)}`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const info = { ok: true, hasKey: !!process.env.GEMINI_API_KEY, passwordProtected: !!process.env.SITE_PASSWORD, model: process.env.GEMINI_MODEL || 'gemini-flash-latest' };
  if (url.searchParams.get('test') !== '1') return json(info);
  if (process.env.SITE_PASSWORD && url.searchParams.get('pw') !== process.env.SITE_PASSWORD) return json({ ...info, test: '비밀번호(pw)가 맞지 않아요. 주소 끝에 &pw=내비밀번호 를 붙여 주세요.' }, 401);
  if (!info.hasKey) return json({ ...info, test: 'GEMINI_API_KEY 가 없어요.' }, 500);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(info.model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: '"OK" 한 단어로만 답하세요.' }] }], generationConfig: { maxOutputTokens: 256 } }),
  });
  const text = await r.text();
  if (!r.ok) return json({ ...info, test: '실패', status: r.status, reason: explain(r.status, text), raw: text.slice(0, 400) }, 200);
  let answer = ''; try { answer = JSON.parse(text).candidates[0].content.parts.map((p) => p.text || '').join(''); } catch {}
  return json({ ...info, test: '성공', answer });
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
    return json({ error: explain(upstream.status, detail), detail }, upstream.status === 429 ? 429 : 502);
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
