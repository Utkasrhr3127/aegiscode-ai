// Small AI REST client used by Experiments 9 to 12 and 15.
// Supports Groq (recommended for higher free-tier rate limits) and Google Gemini via Node's built-in fetch.
// API keys live only in the .env file on this computer and are never sent to the browser.
const fs = require('fs');
const path = require('path');

// Tiny .env reader (same idea as lib/common.js, repeated so this file can be used on its own).
(function loadEnv() {
  const file = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const BASE = () => (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
const GROQ_BASE = () => (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const apiKey = () => (process.env.GEMINI_API_KEY || '').trim();
const groqKey = () => (process.env.GROQ_API_KEY || '').trim();

function provider() {
  if (String(process.env.AI_MODE || '').toLowerCase() === 'demo') return 'demo';
  const forced = String(process.env.AI_PROVIDER || '').toLowerCase().trim();
  if (forced === 'groq' && groqKey()) return 'groq';
  if (forced === 'gemini' && apiKey()) return 'gemini';
  if (groqKey()) return 'groq';
  if (apiKey()) return 'gemini';
  return 'demo';
}

// "live" = a key is present. AI_MODE=demo forces demo mode even when a key exists.
const isLive = () => provider() !== 'demo';

const sleep = ms => new Promise(r => setTimeout(r, ms));
class AiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function mapError(status, data) {
  const msg = (data && data.error && data.error.message) || '';
  if (status === 400 && /api key/i.test(msg)) return new AiError(502, 'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.', 'KEY');
  if (status === 401 || status === 403) return new AiError(502, 'Gemini refused the request (' + status + '). The key may be wrong, or it is not allowed to use this model.', 'KEY');
  if (status === 429) return new AiError(429, 'Gemini rate limit reached on the free plan. Wait about a minute and try again.', 'RATE');
  if (status === 404) return new AiError(502, 'Gemini could not find that model. ' + msg, 'MODEL');
  if (status >= 500) return new AiError(502, 'Gemini is having a problem right now (' + status + '). Try again in a moment.', 'UPSTREAM');
  return new AiError(502, 'Gemini returned an error: ' + (msg || status), 'UPSTREAM');
}

function mapGroqError(status, data) {
  const msg = (data && data.error && data.error.message) || '';
  if (status === 401 || status === 403) return new AiError(502, 'Groq rejected the API key. Check GROQ_API_KEY in your .env file.', 'KEY');
  if (status === 429) return new AiError(429, 'Groq rate limit reached. Wait a moment and try again.', 'RATE');
  if (status === 404) return new AiError(502, 'Groq could not find that model. ' + msg, 'MODEL');
  if (status >= 500) return new AiError(502, 'Groq is having a problem right now (' + status + '). Try again in a moment.', 'UPSTREAM');
  return new AiError(502, 'Groq returned an error: ' + (msg || status), 'UPSTREAM');
}

async function call(pathname, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(BASE() + pathname, {
      method,
      headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000)
    });
  } catch (e) {
    throw new AiError(504, e.name === 'TimeoutError' ? 'Gemini took too long to answer. Try again.' : 'Could not reach the Gemini API. Check your internet connection.', 'NETWORK');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) throw mapError(res.status, data);
  return data;
}

async function callGroq(pathname, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(GROQ_BASE() + pathname, {
      method,
      headers: { Authorization: 'Bearer ' + groqKey(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45000)
    });
  } catch (e) {
    throw new AiError(504, e.name === 'TimeoutError' ? 'Groq took too long to answer. Try again.' : 'Could not reach the Groq API. Check your internet connection.', 'NETWORK');
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok) throw mapGroqError(res.status, data);
  return data;
}

// Model names change often, so instead of hard-coding one we ask the API which models this key can use,
// and keep an ordered list. If the first model is overloaded or out of free quota, the next one is tried.
// Set GEMINI_MODEL in .env to force one model (then there is no fallback).
let chain = null;
const version = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [0, 0])[1]);
const newest = (a, b) => version(b) - version(a);
async function modelChain(force) {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL.trim()];
  if (chain && !force) return chain;
  const data = await call('/v1beta/models?pageSize=200');
  const names = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
  const alias = names.filter(n => n === 'gemini-flash-latest');
  const flash = names.filter(n => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort(newest);
  const lite = names.filter(n => /^gemini-\d+(\.\d+)?-flash-lite$/.test(n)).sort(newest);
  const other = names.filter(n => /flash/.test(n) && !/(image|tts|live|audio|embed|thinking)/.test(n));
  const list = [...new Set([...alias, ...flash, ...lite, ...other])];
  if (!list.length) throw new AiError(502, 'This API key cannot use any Gemini model that can generate text.', 'MODEL');
  // put one stable model second, so the fallback is a different model from the alias
  chain = list.slice(0, 4);
  return chain;
}

let groqChain = null;
let groqVisionChain = null;
const GROQ_SKIP = /(whisper|tts|guard|embed|moderation|orpheus|safeguard)/i;
const GROQ_VISION_RE = /(vision|llama-4|scout|maverick)/i;
const GROQ_PREF = [
  /^llama-3\.3-70b/i,
  /^llama-3\.1-8b/i,
  /^openai\/gpt-oss/i,
  /^qwen/i,
  /^llama-4/i,
  /^meta-llama\/llama-4/i,
  /^gemma/i,
  /^groq\/compound/i
];
const groqRank = id => {
  const idx = GROQ_PREF.findIndex(re => re.test(id));
  return idx === -1 ? GROQ_PREF.length : idx;
};

async function groqModelChain(hasImage, force) {
  if (hasImage && process.env.GROQ_VISION_MODEL) return [process.env.GROQ_VISION_MODEL.trim()];
  if (!hasImage && process.env.GROQ_MODEL) return [process.env.GROQ_MODEL.trim()];
  if (!force && (hasImage ? groqVisionChain : groqChain)) return hasImage ? groqVisionChain : groqChain;

  const data = await callGroq('/models');
  const ids = (data.data || [])
    .filter(m => m && m.id && m.active !== false && !GROQ_SKIP.test(m.id))
    .map(m => m.id);

  if (!ids.length) throw new AiError(502, 'This Groq API key cannot use any text generation model.', 'MODEL');

  const ranked = [...new Set(ids)].sort((a, b) => groqRank(a) - groqRank(b));
  const vision = ranked.filter(id => GROQ_VISION_RE.test(id));
  const text = ranked.filter(id => !GROQ_VISION_RE.test(id));

  groqChain = (text.length ? [...text, ...vision] : ranked).slice(0, 5);
  groqVisionChain = (vision.length ? vision : ranked).slice(0, 4);
  return hasImage ? groqVisionChain : groqChain;
}

const pickModel = async force => {
  if (provider() === 'groq') {
    return (await groqModelChain(false, force))[0];
  }
  return (await modelChain(force))[0];
};

function toOpenAiMessages(system, contents) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  for (const c of (contents || [])) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts = c.parts || [];
    const hasImage = parts.some(p => p.inlineData);
    if (hasImage) {
      const content = [];
      for (const p of parts) {
        if (p.inlineData) {
          content.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
        } else if (p.text) {
          content.push({ type: 'text', text: p.text });
        }
      }
      messages.push({ role, content });
    } else {
      const text = parts.filter(p => p.text).map(p => p.text).join('\n');
      messages.push({ role, content: text });
    }
  }
  return messages;
}

async function generateWithGroq({ system, contents, temperature = 0.7, maxOutputTokens = 2048, json = false }) {
  const hasImage = (contents || []).some(c => (c.parts || []).some(p => p.inlineData));
  const messages = toOpenAiMessages(system, contents);
  let models = await groqModelChain(hasImage);
  const t0 = Date.now();

  const tryModel = async m => {
    const body = { model: m, messages, temperature, max_tokens: maxOutputTokens };
    if (json) body.response_format = { type: 'json_object' };
    for (const wait of [2000, 5000, 0]) {
      try { return await callGroq('/chat/completions', { method: 'POST', body }); }
      catch (e) { if (e.code !== 'UPSTREAM' || !wait) throw e; await sleep(wait); }
    }
  };

  let data, model, lastErr;
  for (let i = 0; i < models.length && !data; i++) {
    model = models[i];
    try { data = await tryModel(model); }
    catch (e) {
      lastErr = e;
      if (e.code === 'MODEL' && i === 0 && !(hasImage ? process.env.GROQ_VISION_MODEL : process.env.GROQ_MODEL)) {
        models = await groqModelChain(hasImage, true);
        i = -1;
        continue;
      }
      if (!['UPSTREAM', 'RATE', 'MODEL'].includes(e.code) || i === models.length - 1) throw e;
      console.log('Groq model ' + model + ' failed (' + e.message.slice(0, 60) + '). Trying ' + models[i + 1] + '.');
    }
  }
  if (!data) throw lastErr;
  const choice = data.choices && data.choices[0];
  const text = ((choice && choice.message && choice.message.content) || '').trim();
  if (!text) {
    const r = choice && choice.finish_reason;
    throw new AiError(422, 'Groq sent back an empty answer' + (r === 'length' ? ' (it ran out of room to write)' : '') + '.', 'EMPTY');
  }
  return { text, model: data.model || model, ms: Date.now() - t0, finishReason: choice && choice.finish_reason };
}

// contents: [{ role: 'user' | 'model', parts: [{ text } | { inlineData: { mimeType, data } }] }]
async function generate({ system, contents, temperature = 0.7, maxOutputTokens = 2048, json = false }) {
  if (provider() === 'groq') {
    return generateWithGroq({ system, contents, temperature, maxOutputTokens, json });
  }
  const body = { contents, generationConfig: { temperature, maxOutputTokens } };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  const t0 = Date.now();
  const url = m => '/v1beta/models/' + encodeURIComponent(m) + ':generateContent';
  // One model: retry short Google hiccups (500/503) after 2 s and 5 s.
  const tryModel = async m => {
    for (const wait of [2000, 5000, 0]) {
      try { return await call(url(m), { method: 'POST', body }); }
      catch (e) { if (e.code !== 'UPSTREAM' || !wait) throw e; await sleep(wait); }
    }
  };
  let models = await modelChain(), data, model, lastErr;
  for (let i = 0; i < models.length && !data; i++) {
    model = models[i];
    try { data = await tryModel(model); }
    catch (e) {
      lastErr = e;
      if (e.code === 'MODEL' && i === 0 && !process.env.GEMINI_MODEL) { models = await modelChain(true); i = -1; continue; }   // model list changed: reload it once
      if (!['UPSTREAM', 'RATE', 'MODEL'].includes(e.code) || i === models.length - 1) throw e;   // key problems and bad input are not retried
      console.log('Gemini model ' + model + ' failed (' + e.message.slice(0, 60) + '). Trying ' + models[i + 1] + '.');
    }
  }
  if (!data) throw lastErr;
  const cand = data.candidates && data.candidates[0];
  if (!cand) {
    const why = data.promptFeedback && data.promptFeedback.blockReason;
    throw new AiError(422, why ? 'Gemini blocked this prompt (' + why + '). Try different wording.' : 'Gemini sent back no answer.', 'EMPTY');
  }
  const text = ((cand.content && cand.content.parts) || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
  if (!text) {
    const r = cand.finishReason;
    throw new AiError(422, r === 'SAFETY' ? 'Gemini stopped because of its safety filter. Try different wording.' : 'Gemini sent back an empty answer' + (r === 'MAX_TOKENS' ? ' (it ran out of room to write)' : '') + '.', 'EMPTY');
  }
  return { text, model: data.modelVersion || model, ms: Date.now() - t0, finishReason: cand.finishReason };
}

// What the page badge shows. In live mode it also checks the key by asking for the model list.
async function statusPayload() {
  const p = provider();
  if (p === 'demo') {
    return { mode: 'demo', model: null, note: 'No GROQ_API_KEY or GEMINI_API_KEY found in .env, so answers come from a built-in demo and no AI model is called.' };
  }
  try { return { mode: 'live', provider: p, model: await pickModel(), ok: true }; }
  catch (e) { return { mode: 'live', provider: p, model: null, ok: false, error: e.message }; }
}
const statusRoute = async (req, res) => res.json(await statusPayload());

// A simple limit so a page that is left open (or a loop) cannot burn the free quota.
function limiter({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), k = req.ip || 'local';
    const list = (hits.get(k) || []).filter(t => now - t < windowMs);
    if (list.length >= max) return res.status(429).json({ error: 'Too many requests from this browser. Wait a minute and try again.' });
    list.push(now); hits.set(k, list);
    next();
  };
}

function listen(app, { port, label }) {
  const p = Number(process.env.PORT) || port;
  const prov = provider();
  app.listen(p, () => {
    console.log(prov === 'groq'
      ? 'Mode: LIVE (GROQ_API_KEY found, answers come from Groq)'
      : prov === 'gemini'
        ? 'Mode: LIVE (GEMINI_API_KEY found, answers come from Google Gemini)'
        : 'Mode: DEMO (no GROQ_API_KEY or GEMINI_API_KEY in .env, answers are built-in samples and no AI model is called)');
    console.log('READY ' + label + ' on http://localhost:' + p);
    if (prov !== 'demo') {
      const name = prov === 'groq' ? 'Groq' : 'Gemini';
      pickModel().then(m => console.log(name + ' model in use: ' + m)).catch(e => console.log(name + ' check failed: ' + e.message));
    }
  });
}

module.exports = { generate, isLive, provider, statusPayload, statusRoute, limiter, listen, pickModel, AiError, sleep, call, apiKey, groqKey, BASE, GROQ_BASE };
