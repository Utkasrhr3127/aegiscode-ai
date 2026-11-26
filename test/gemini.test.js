// Experiment 14 - tests for lib/gemini.js (error mapping, retry, model fallback, limiter).
// No internet and no real key are used: a local stand-in for Gemini (dev_tools/mock_gemini.js) answers instead.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startMock } = require('../dev_tools/test_helpers');

const PORTS = { main: 4411, retry: 4412, fallback: 4413 };
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.GEMINI_MODEL;      // a model forced in .env would switch the fallback off
delete process.env.AI_MODE;
const gemini = require('../lib/gemini');
const use = port => { process.env.GEMINI_BASE_URL = 'http://localhost:' + port; };
const ask = text => gemini.generate({ contents: [{ role: 'user', parts: [{ text }] }] });
const posts = log => log.filter(l => /generateContent/.test(l)).length;

let main, retry, fallback;
before(async () => {
  main = await startMock(PORTS.main);
  retry = await startMock(PORTS.retry, { MOCK_FAIL503: '1' });
  fallback = await startMock(PORTS.fallback, { MOCK_FAIL_MODEL: 'gemini-flash-latest' });
});
after(async () => { await main.stop(); await retry.stop(); await fallback.stop(); });

test('a normal request returns the answer text and the model name', async () => {
  use(PORTS.main);
  const r = await ask('Say hello');
  assert.equal(r.text, 'Mock answer.');
  assert.match(r.model, /gemini/);
});

test('a rejected API key is mapped to a clear 502 (code KEY)', async () => {
  use(PORTS.main);
  const old = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = 'BADKEY';
  try { await assert.rejects(ask('hi'), e => e instanceof gemini.AiError && e.code === 'KEY' && e.status === 502 && /API key/.test(e.message)); }
  finally { process.env.GEMINI_API_KEY = old; }
});

test('a rate limit (429) is mapped to code RATE with status 429', async () => {
  use(PORTS.main);
  await assert.rejects(ask('please [[429]]'), e => e.code === 'RATE' && e.status === 429 && /rate limit/i.test(e.message));
});

test('an unreachable Gemini is mapped to code NETWORK (504)', async () => {
  process.env.GEMINI_BASE_URL = 'http://localhost:4499';   // nothing listens here
  await assert.rejects(gemini.call('/v1beta/models'), e => e.code === 'NETWORK' && e.status === 504);
});

test('one 503 is retried and the request then succeeds', async () => {
  use(PORTS.retry);
  const r = await ask('Say hello');
  assert.equal(r.text, 'Mock answer.');
  assert.equal(posts(await retry.log()), 2, 'expected the failed call plus one retry');
});

test('when the first model keeps failing, the next model answers (fallback)', { timeout: 60000 }, async () => {
  use(PORTS.fallback);
  const r = await ask('Say hello');
  assert.equal(r.text, 'Mock answer.');
  assert.doesNotMatch(r.model, /^gemini-flash-latest/);
  assert.ok(posts(await fallback.log()) >= 4, 'first model was tried three times before the second one');
});

test('demo mode: AI_MODE=demo turns live mode off even when a key exists', () => {
  assert.equal(gemini.isLive(), true);
  process.env.AI_MODE = 'demo';
  assert.equal(gemini.isLive(), false);
  delete process.env.AI_MODE;
});

test('limiter lets 3 requests through and answers the 4th with 429', () => {
  const lim = gemini.limiter({ windowMs: 60000, max: 3 });
  const req = { ip: '1.2.3.4' };
  let passed = 0, blocked = null;
  const res = { status(c) { blocked = c; return this; }, json() { return this; } };
  for (let i = 0; i < 4; i++) lim(req, res, () => passed++);
  assert.equal(passed, 3);
  assert.equal(blocked, 429);
});

test('groq provider: handles text, json, vision inlineData, and 429 fallback', async () => {
  const http = require('http');
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      const send = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.headers.authorization !== 'Bearer gsk_test') return send(401, { error: { message: 'Invalid API key' } });
      if (req.url === '/models') return send(200, { data: [
        { id: 'whisper-large-v3' },
        { id: 'llama-3.3-70b-versatile' },
        { id: 'llama-3.1-8b-instant' },
        { id: 'meta-llama/llama-4-scout-17b-16e-instruct' }
      ] });
      if (req.url === '/chat/completions') {
        const p = JSON.parse(body);
        seen.push(p);
        if (p.model === 'llama-3.3-70b-versatile') return send(429, { error: { message: 'Rate limit' } });
        return send(200, { model: p.model, choices: [{ message: { content: 'Groq ok.' }, finish_reason: 'stop' }] });
      }
      send(404, {});
    });
  });
  await new Promise(r => srv.listen(4414, r));
  const prevKey = process.env.GROQ_API_KEY, prevUrl = process.env.GROQ_BASE_URL;
  try {
    process.env.GROQ_API_KEY = 'gsk_test';
    process.env.GROQ_BASE_URL = 'http://localhost:4414';
    assert.equal(gemini.provider(), 'groq');
    const st = await gemini.statusPayload();
    assert.equal(st.provider, 'groq');
    assert.equal(st.ok, true);

    const r = await gemini.generate({
      system: 'Be brief.',
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }, { role: 'model', parts: [{ text: 'Hello' }] }, { role: 'user', parts: [{ text: 'Next' }] }],
      json: true
    });
    assert.equal(r.text, 'Groq ok.');
    assert.equal(r.model, 'llama-3.1-8b-instant');
    assert.equal(seen[1].messages[0].role, 'system');
    assert.equal(seen[1].messages[2].role, 'assistant');
    assert.deepEqual(seen[1].response_format, { type: 'json_object' });

    const rv = await gemini.generate({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: 'Caption' }] }]
    });
    assert.equal(rv.text, 'Groq ok.');
    assert.equal(seen[2].model, 'meta-llama/llama-4-scout-17b-16e-instruct');
    assert.equal(seen[2].messages[0].content[0].type, 'image_url');

    process.env.GROQ_API_KEY = 'bad';
    await assert.rejects(gemini.generate({ contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] }), e => e.code === 'KEY' && e.status === 502);
  } finally {
    if (prevKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.GROQ_BASE_URL; else process.env.GROQ_BASE_URL = prevUrl;
    await new Promise(r => srv.close(r));
  }
});
