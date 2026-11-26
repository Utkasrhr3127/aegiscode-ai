// Small helpers used by the front ends of Experiments 5, 6 and 8.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));   // textContent style: never innerHTML
  }
  return e;
}
async function api(path, opts) {
  opts = opts || {};
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status; err.details = data && data.details;
    throw err;
  }
  return data;
}
function toast(msg, type) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + (type || 'ok') }, msg);
  box.append(t);
  setTimeout(() => t.remove(), 3500);
}
function confirmBox(title, text, okLabel) {
  return new Promise(resolve => {
    const close = v => { back.remove(); resolve(v); };
    const back = h('div', { class: 'backdrop', id: 'confirm' },
      h('div', { class: 'modal' },
        h('h3', {}, title), h('p', {}, text),
        h('div', { class: 'row end' },
          h('button', { class: 'btn ghost', id: 'confirm-no', onclick: () => close(false) }, 'Cancel'),
          h('button', { class: 'btn danger', id: 'confirm-yes', onclick: () => close(true) }, okLabel || 'Delete'))));
    document.body.append(back);
  });
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'; }
function showErrors(form, details) {
  form.querySelectorAll('.field-error').forEach(e => e.remove());
  form.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
  for (const [k, msg] of Object.entries(details || {})) {
    const input = form.querySelector('[name="' + k + '"]');
    if (!input) continue;
    input.classList.add('invalid');
    input.insertAdjacentElement('afterend', h('div', { class: 'field-error' }, msg));
  }
}
