// Experiment 15 (Capstone): End-to-end API & security tests for AegisCode AI.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { mongoose } = require('../lib/common');
const { app, seedIfEmpty } = require('../exp15_capstone/server');

let mongod, server, base;
let userToken, adminToken, reviewId;

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  process.env.AI_MODE = 'demo';
  mongod = await MongoMemoryServer.create({ instance: { dbName: 'aegis_test' } });
  await mongoose.connect(mongod.getUri(), { dbName: 'aegis_test' });
  await seedIfEmpty();
  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  base = 'http://localhost:' + server.address().port;
});

after(async () => {
  delete process.env.AI_MODE;
  await new Promise(r => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('health endpoint returns ok: true and status returns demo mode', async () => {
  const h = await req('/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.ok, true);
  const s = await req('/api/status');
  assert.equal(s.status, 200);
  assert.equal(s.data.mode, 'demo');
});

test('register validates input, rejects duplicate email, and blocks role escalation', async () => {
  const bad = await req('/api/auth/register', { method: 'POST', body: { name: 'A', email: 'bad', password: '123' } });
  assert.equal(bad.status, 400);

  const ok = await req('/api/auth/register', { method: 'POST', body: { name: 'Alice Dev', email: 'alice@test.dev', password: 'Password1', role: 'admin' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.role, 'user');

  const dup = await req('/api/auth/register', { method: 'POST', body: { name: 'Alice', email: 'alice@test.dev', password: 'Password1' } });
  assert.equal(dup.status, 409);
});

test('login rejects NoSQL injection objects and issues JWT for valid credentials', async () => {
  const inj = await req('/api/auth/login', { method: 'POST', body: { email: { $ne: null }, password: { $ne: null } } });
  assert.equal(inj.status, 401);

  const u = await req('/api/auth/login', { method: 'POST', body: { email: 'alice@test.dev', password: 'Password1' } });
  assert.equal(u.status, 200);
  assert.ok(u.data.token);
  userToken = u.data.token;

  const a = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@aegiscode.local', password: 'Admin1234' } });
  assert.equal(a.status, 200);
  adminToken = a.data.token;
});

test('reviews API requires auth, creates AI audit, updates stats, supports mentor chat & public toggle', async () => {
  const unauth = await req('/api/reviews', { method: 'POST', body: { title: 'Test', language: 'javascript', focus: 'owasp', code: 'const x = 1; console.log(x);' } });
  assert.equal(unauth.status, 401);

  const created = await req('/api/reviews', {
    method: 'POST',
    token: userToken,
    body: { title: 'Login Route Audit', language: 'javascript', focus: 'owasp', code: "app.get('/u', (req, res) => db.query('SELECT * FROM u WHERE id=' + req.query.id));" }
  });
  assert.equal(created.status, 201);
  assert.ok(created.data.review._id);
  assert.ok(created.data.review.findings.length > 0);
  reviewId = created.data.review._id;

  const stats = await req('/api/reviews/stats', { token: userToken });
  assert.equal(stats.status, 200);
  assert.equal(stats.data.total, 1);

  const chat = await req(`/api/reviews/${reviewId}/chat`, { method: 'POST', token: userToken, body: { question: 'How do I fix this?' } });
  assert.equal(chat.status, 200);
  assert.equal(chat.data.chat.length, 2);

  const priv = await req(`/api/public/reviews/${reviewId}`);
  assert.equal(priv.status, 404);

  const vis = await req(`/api/reviews/${reviewId}/visibility`, { method: 'PATCH', token: userToken, body: { isPublic: true } });
  assert.equal(vis.status, 200);
  assert.equal(vis.data.isPublic, true);

  const pub = await req(`/api/public/reviews/${reviewId}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.report.title, 'Login Route Audit');
});

test('admin route enforces RBAC (403 for user, 200 for admin)', async () => {
  const forbidden = await req('/api/admin/users', { token: userToken });
  assert.equal(forbidden.status, 403);

  const allowed = await req('/api/admin/users', { token: adminToken });
  assert.equal(allowed.status, 200);
  assert.ok(allowed.data.users.length >= 3);
});
