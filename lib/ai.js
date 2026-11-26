// Browser helpers shared by Experiments 9 to 12. Needs /base.js first (it provides h() and toast()).

// Turns the plain markdown Gemini sends back into DOM nodes. Nothing is ever put in with innerHTML,
// so text from the model cannot add a script or a tag to the page.
function inlineMd(text) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(h('strong', {}, t.slice(2, -2)));
    else if (t.startsWith('`')) out.push(h('code', {}, t.slice(1, -1)));
    else out.push(h('em', {}, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function mdToDom(src) {
  const box = h('div', { class: 'md' });
  const lines = String(src).replace(/\r/g, '').split('\n');
  let para = [], list = null, lastLi = null, blank = false;
  const flushPara = () => { if (para.length) { box.append(h('p', {}, inlineMd(para.join(' ')))); para = []; } };
  const flushList = () => { if (list) { box.append(list); list = null; lastLi = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); blank = true; continue; }   // a blank line does not end a list yet: more items may follow
    const isUl = line.match(/^\s*[-*\u2022]\s+(.*)$/), isOl = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (list && blank && !isUl && !isOl && !/^\s+\S/.test(line)) flushList();
    blank = false;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); flushList(); box.append(h('h' + Math.min(m[1].length + 2, 5), {}, inlineMd(m[2]))); continue; }
    if (isUl) { flushPara(); if (!list || list.tagName !== 'UL') { flushList(); list = h('ul'); } lastLi = h('li', {}, inlineMd(isUl[1])); list.append(lastLi); continue; }
    if (isOl) { flushPara(); if (!list || list.tagName !== 'OL') { flushList(); list = h('ol'); } lastLi = h('li', { value: isOl[1] }, inlineMd(isOl[2])); list.append(lastLi); continue; }
    if (list && /^\s+\S/.test(line)) { lastLi.append(h('div', { class: 'li-sub' }, inlineMd(line.trim()))); continue; }   // an indented line belongs to the item above
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); box.append(h('hr')); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return box;
}

// A row of small facts (model, seconds, words). Each fact is its own span so they never run together.
function metaLine(...parts) { return h('div', { class: 'meta-line' }, parts.filter(Boolean).map(t => h('span', {}, t))); }

// POST/GET JSON and throw an Error whose message is the server's own message.
async function callApi(path, opts) {
  opts = opts || {};
  let res;
  try {
    res = await fetch(path, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch (e) { const err = new Error('Could not reach the server. Is the app still running?'); err.status = 0; throw err; }
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status; err.details = data && data.details;
    throw err;
  }
  return data;
}

// Fills the badge in the page header: "Live | model name" or "Demo mode".
async function showStatus(badge, extra) {
  try {
    const s = await callApi('/api/status');
    if (extra) extra(s);
    if (s.mode === 'live' && s.ok) { badge.className = 'ai-badge live'; badge.textContent = 'Live: ' + s.model; badge.title = 'Answers come from the ' + (s.provider === 'groq' ? 'Groq' : 'Gemini') + ' API'; }
    else if (s.mode === 'live') { badge.className = 'ai-badge bad'; badge.textContent = 'Key problem'; badge.title = s.error || ''; }
    else { badge.className = 'ai-badge demo'; badge.textContent = 'Demo mode: no API key'; badge.title = s.note || ''; }
    return s;
  } catch (e) { badge.className = 'ai-badge bad'; badge.textContent = 'Server not reachable'; return null; }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove(); return ok;
  }
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
  const a = h('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const wordCount = t => (String(t).trim().match(/\S+/g) || []).length;
