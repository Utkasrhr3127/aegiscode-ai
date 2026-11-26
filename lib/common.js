// Small helpers shared by Experiments 5 to 8 (one Express app per experiment).
const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');

const ROOT = path.join(__dirname, '..');
let memoryServer = null;

// Tiny .env reader so we do not need an extra package.
(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

function createApp(publicDir, opts) {
  const app = express();
  app.disable('x-powered-by');                                           // security: do not tell the world which framework runs here
  app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });   // security: browsers must trust the declared file type
  app.use(express.json({ limit: (opts && opts.jsonLimit) || '100kb' }));
  app.get('/student.config.json', (req, res) => res.sendFile(path.join(ROOT, 'student.config.json')));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.get('/base.css', (req, res) => res.sendFile(path.join(__dirname, 'base.css')));
  app.get('/base.js', (req, res) => res.sendFile(path.join(__dirname, 'base.js')));
  app.get('/ai.css', (req, res) => res.sendFile(path.join(__dirname, 'ai.css')));   // Experiments 9 to 12
  app.get('/ai.js', (req, res) => res.sendFile(path.join(__dirname, 'ai.js')));
  app.get('/json.html', (req, res) => res.sendFile(path.join(__dirname, 'json.html')));
  app.get('/health', (req, res) => res.json({ ok: true }));
  // used by scripts/shots2.js to stop the server (and the local MongoDB) cleanly; only answers on this computer
  app.post('/__shutdown', async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return res.status(403).end();
    res.json({ bye: true });
    try { await mongoose.disconnect(); if (memoryServer) await memoryServer.stop(); } catch (e) {}
    process.exit(0);
  });
  if (publicDir) app.use(express.static(publicDir));
  return app;
}

// Turns Mongoose / MongoDB errors into clean JSON answers.
function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    const details = {};
    for (const [k, v] of Object.entries(err.errors)) details[k] = v.message;
    return res.status(400).json({ error: 'Validation failed', details });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: 'Invalid ' + err.path + ': ' + err.value });
  if (err.code === 11000) {
    // real MongoDB gives keyPattern; some servers only put the index name in the message
    let field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    if (!field) { const m = String(err.message).match(/index:\s*([A-Za-z0-9]+?)_\d/) || String(err.message).match(/dup key:\s*\{\s*"?(\w+)"?\s*:/); field = m ? m[1] : 'value'; }
    return res.status(409).json({ error: 'Duplicate ' + field, details: { [field]: field + ' already exists' } });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

function notFoundApi(req, res) {
  res.status(404).json({ error: 'Route not found: ' + req.method + ' ' + req.originalUrl });
}

async function connectDb(dbName) {
  let uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('Starting a local MongoDB (the very first run downloads about 100 MB, please wait)...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create({ instance: { dbName } });
    uri = memoryServer.getUri();
  } else {
    console.log('Using MONGODB_URI from your .env file');
  }
  await mongoose.connect(uri, { dbName });
  console.log('MongoDB connected (database: ' + dbName + ')');
}

async function start(app, { port, dbName, onReady, label }) {
  await connectDb(dbName);
  if (onReady) await onReady();
  const p = Number(process.env.PORT) || port;
  app.listen(p, () => console.log('READY ' + label + ' on http://localhost:' + p));
}

module.exports = { createApp, errorHandler, notFoundApi, start, mongoose, express };

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { try { if (memoryServer) await memoryServer.stop(); } catch (e) {} process.exit(0); });
