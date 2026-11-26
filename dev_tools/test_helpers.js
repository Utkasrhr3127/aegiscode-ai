// Small helpers for the test suites in test/ (Experiment 14). Uses only Node's built-in modules.
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Starts one of the lab apps on a spare port (its own temporary MongoDB) and waits until it says READY.
async function startApp(file, port, env = {}) {
  const e = { ...process.env, PORT: String(port), ...env };
  delete e.MONGODB_URI;   // tests must never touch a real database
  if (process.env.TEST_DB_URI) e.MONGODB_URI = process.env.TEST_DB_URI;   // development only: use a MongoDB that is already running
  const child = spawn(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false, output = '', exited = false;
  const onData = d => { output += d.toString(); if (output.includes('READY')) ready = true; };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  child.on('exit', () => { exited = true; });
  const limit = Date.now() + 120000;
  while (!ready) {
    if (exited) throw new Error('The server stopped before it was ready.\n' + output.slice(-600));
    if (Date.now() > limit) { child.kill(); throw new Error('The server took more than two minutes to start.'); }
    await sleep(250);
  }
  const base = 'http://localhost:' + port;
  return {
    base,
    stop: async () => {
      try { await fetch(base + '/__shutdown', { method: 'POST' }); } catch (err) { /* already gone */ }
      for (let i = 0; i < 24 && !exited; i++) await sleep(250);
      if (!exited) child.kill();
    }
  };
}

// fetch that returns { status, body, headers }. `body` is the JSON answer (or null), `json` is sent as a JSON body.
async function api(base, method, url, { json, token, raw, headers } = {}) {
  const h = { ...(headers || {}) };
  if (json !== undefined || raw !== undefined) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { method, headers: h, body: raw !== undefined ? raw : json !== undefined ? JSON.stringify(json) : undefined });
  let body = null;
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  return { status: res.status, body, headers: res.headers };
}

// A stand-in Gemini service (dev_tools/mock_gemini.js) for testing lib/gemini.js without internet or a key.
async function startMock(port, env = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, 'mock_gemini.js')], { cwd: ROOT, env: { ...process.env, MOCK_PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false; child.stdout.on('data', d => { if (d.toString().includes('Mock Gemini')) ready = true; });
  for (let i = 0; i < 60 && !ready; i++) await sleep(100);
  if (!ready) { child.kill(); throw new Error('The mock Gemini service did not start.'); }
  const base = 'http://localhost:' + port;
  return { base, stop: async () => child.kill(), log: async () => (await fetch(base + '/__log')).json() };
}

module.exports = { startApp, api, startMock, sleep, ROOT };
