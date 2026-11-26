// Frontend controller for AegisCode AI. Uses h() and mdToDom() only (no innerHTML anywhere).
const TOKEN_KEY = 'aegis_token';
const USER_KEY = 'aegis_user';
const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const getUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (e) { return null; } };
const saveAuth = (token, user) => { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); };
const clearAuth = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };

async function apiAuth(path, opts) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers.Authorization = 'Bearer ' + t;
  let res;
  try {
    res = await fetch(path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  } catch (e) {
    const err = new Error('Could not reach server'); err.status = 0; throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/auth/login')) { clearAuth(); }
    const err = new Error((data && data.error) || res.statusText || 'Request failed');
    err.status = res.status; err.details = data && data.details;
    throw err;
  }
  return data;
}

function showMsg(box, text, ok) {
  box.replaceChildren(text ? h('div', { class: ok ? 'ok-box' : 'err-box' }, text) : '');
}

function initNav() {
  const badge = document.getElementById('badge');
  let statusPromise = badge ? showStatus(badge) : Promise.resolve(null);
  const u = getUser();
  const show = (id, yes) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !yes); };
  show('navAuth', !u);
  show('navDash', !!u);
  show('navAudit', !!u);
  show('navAdmin', !!(u && u.role === 'admin'));
  show('navLogout', !!u);
  const logoutBtn = document.getElementById('navLogout');
  if (logoutBtn) logoutBtn.onclick = () => { clearAuth(); location.href = '/auth.html'; };
  return statusPromise;
}

function requireLogin() {
  if (!getToken()) { location.href = '/auth.html'; return false; }
  return true;
}

function renderFindings(box, findings) {
  box.replaceChildren();
  if (!findings || !findings.length) {
    box.append(h('p', { class: 'muted' }, 'No vulnerabilities or issues reported.'));
    return;
  }
  for (const f of findings) {
    box.append(h('div', { class: 'finding' }, [
      h('div', { class: 'finding-head' }, [
        h('span', { class: 'sev sev-' + (f.severity || 'MEDIUM') }, f.severity || 'MEDIUM'),
        h('strong', {}, f.title || 'Finding'),
        h('span', { class: 'muted', style: 'font-size:12px' }, f.lineHint || '')
      ]),
      h('p', { style: 'margin:4px 0;font-size:13.5px' }, f.issue || ''),
      h('p', { style: 'margin:4px 0 0;font-size:13px;color:#34d399' }, 'Fix: ' + (f.fix || ''))
    ]));
  }
}

async function initAuth(statusPromise) {
  const s = await statusPromise;
  const demoUserBtn = document.getElementById('demoUserBtn');
  const demoAdminBtn = document.getElementById('demoAdminBtn');
  if (s && s.demoAccounts) {
    demoUserBtn.classList.remove('hidden');
    demoAdminBtn.classList.remove('hidden');
    demoUserBtn.onclick = () => {
      document.getElementById('loginEmail').value = 'dev@aegiscode.local';
      document.getElementById('loginPass').value = 'Student123';
    };
    demoAdminBtn.onclick = () => {
      document.getElementById('loginEmail').value = 'admin@aegiscode.local';
      document.getElementById('loginPass').value = 'Admin1234';
    };
  }

  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('loginMsg');
    try {
      const r = await apiAuth('/api/auth/login', {
        method: 'POST',
        body: { email: document.getElementById('loginEmail').value, password: document.getElementById('loginPass').value }
      });
      saveAuth(r.token, r.user);
      location.href = '/dashboard.html';
    } catch (err) {
      showMsg(msg, err.message, false);
    }
  };

  document.getElementById('regForm').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('regMsg');
    try {
      const r = await apiAuth('/api/auth/register', {
        method: 'POST',
        body: {
          name: document.getElementById('regName').value,
          email: document.getElementById('regEmail').value,
          password: document.getElementById('regPass').value
        }
      });
      showMsg(msg, r.message, true);
      document.getElementById('loginEmail').value = document.getElementById('regEmail').value;
    } catch (err) {
      const extra = err.details ? ' — ' + Object.values(err.details).join(', ') : '';
      showMsg(msg, err.message + extra, false);
    }
  };
}

async function initDashboard() {
  if (!requireLogin()) return;
  const u = getUser();
  if (u) document.getElementById('dashTitle').textContent = `${u.name}'s Security Dashboard`;

  async function loadStats() {
    const st = await apiAuth('/api/reviews/stats');
    document.getElementById('kpiTotal').textContent = String(st.total);
    document.getElementById('kpiScore').textContent = st.total ? `${st.avgScore}/100` : '—';
    document.getElementById('kpiCrit').textContent = String(st.severity.CRITICAL || 0);
    document.getElementById('kpiHigh').textContent = String(st.severity.HIGH || 0);

    const chart = document.getElementById('sevChart');
    const maxVal = Math.max(1, ...Object.values(st.severity));
    const colors = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981' };
    chart.replaceChildren(...Object.entries(st.severity).map(([sev, count]) =>
      h('div', { class: 'bar-row' }, [
        h('span', { style: 'width:76px;font-weight:700' }, sev),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${Math.round((count / maxVal) * 100)}%;background:${colors[sev]}` })),
        h('span', { style: 'width:28px;text-align:right' }, String(count))
      ])
    ));
  }

  async function loadReviews() {
    const q = encodeURIComponent(document.getElementById('searchReviews').value.trim());
    const lang = encodeURIComponent(document.getElementById('filterLang').value);
    const data = await apiAuth(`/api/reviews?q=${q}&language=${lang}`);
    const list = document.getElementById('reviewsList');
    if (!data.reviews.length) {
      list.replaceChildren(h('p', { class: 'muted' }, 'No audits found. Click "+ New AI Code Audit" to run your first security scan.'));
      return;
    }
    list.replaceChildren(...data.reviews.map(r => {
      const delBtn = h('button', { class: 'btn sm danger', type: 'button' }, 'Delete');
      delBtn.onclick = async () => { await apiAuth('/api/reviews/' + r._id, { method: 'DELETE' }); await Promise.all([loadStats(), loadReviews()]); };
      return h('div', { class: 'finding', style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap' }, [
        h('div', {}, [
          h('strong', {}, r.title),
          h('div', { class: 'muted', style: 'font-size:12.5px' }, `${r.language.toUpperCase()} • ${r.focus} • Grade ${r.grade} (${r.score}/100) • ${(r.findings || []).length} findings`)
        ]),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
          h('a', { class: 'btn sm primary', href: '/auditor.html?id=' + r._id }, 'Open & Mentor'),
          r.isPublic ? h('a', { class: 'btn sm', href: '/report.html?id=' + r._id, target: '_blank' }, 'Public Link') : '',
          delBtn
        ].filter(Boolean))
      ]);
    }));
  }

  document.getElementById('searchReviews').oninput = () => loadReviews();
  document.getElementById('filterLang').onchange = () => loadReviews();
  await Promise.all([loadStats(), loadReviews()]);
}

async function initAuditor() {
  if (!requireLogin()) return;
  let activeReview = null;

  function renderChat(chat) {
    const box = document.getElementById('chatBox');
    box.replaceChildren(...(chat || []).map(m =>
      h('div', { class: 'msg ' + (m.role === 'user' ? 'user' : 'model') }, m.role === 'user' ? m.text : mdToDom(m.text))
    ));
    box.scrollTop = box.scrollHeight;
  }

  function showReview(r, metaText) {
    activeReview = r;
    document.getElementById('resultEmpty').classList.add('hidden');
    document.getElementById('resultBody').classList.remove('hidden');
    const scoreBadge = document.getElementById('resScoreBadge');
    scoreBadge.textContent = `Score: ${r.score}/100 (Grade ${r.grade})`;
    scoreBadge.className = 'sev ' + (r.score >= 80 ? 'sev-LOW' : r.score >= 60 ? 'sev-MEDIUM' : 'sev-CRITICAL');
    document.getElementById('resComplexity').textContent = r.complexity || '';
    document.getElementById('resSummary').textContent = r.summary;
    document.getElementById('resMeta').textContent = metaText || (`Model: ${r.model || 'demo'} • Language: ${r.language}`);
    renderFindings(document.getElementById('resFindings'), r.findings);
    document.getElementById('resCode').textContent = r.refactoredCode || r.code;
    renderChat(r.chat || []);

    const pubBtn = document.getElementById('togglePublicBtn');
    const pubLink = document.getElementById('publicLinkBtn');
    const syncPublic = () => {
      pubBtn.textContent = activeReview.isPublic ? 'Make Private' : 'Make Public';
      pubLink.classList.toggle('hidden', !activeReview.isPublic);
      pubLink.href = '/report.html?id=' + activeReview._id;
    };
    syncPublic();
    pubBtn.onclick = async () => {
      const res = await apiAuth(`/api/reviews/${activeReview._id}/visibility`, { method: 'PATCH', body: { isPublic: !activeReview.isPublic } });
      activeReview.isPublic = res.isPublic;
      syncPublic();
    };
  }

  document.getElementById('sampleBtn').onclick = () => {
    document.getElementById('auditTitle').value = 'Express User Lookup & Auth Route';
    document.getElementById('auditLang').value = 'javascript';
    document.getElementById('auditFocus').value = 'owasp';
    document.getElementById('auditCode').value =
      "app.post('/api/login', async (req, res) => {\n" +
      "  const user = await db.collection('users').findOne({ email: req.body.email, password: req.body.password });\n" +
      "  if (!user) return res.status(401).send('Wrong email: ' + req.body.email);\n" +
      "  const token = jwt.sign({ id: user._id, role: user.role }, 'hardcoded-secret');\n" +
      "  res.json({ token });\n" +
      "});";
  };

  document.getElementById('copyCodeBtn').onclick = async () => {
    if (await copyText(document.getElementById('resCode').textContent)) {
      document.getElementById('copyCodeBtn').textContent = 'Copied!';
      setTimeout(() => { document.getElementById('copyCodeBtn').textContent = 'Copy Code'; }, 1500);
    }
  };

  document.getElementById('auditForm').onsubmit = async e => {
    e.preventDefault();
    const errBox = document.getElementById('auditErr');
    const btn = document.getElementById('runAuditBtn');
    const stText = document.getElementById('auditStatusText');
    showMsg(errBox, '', false);
    btn.disabled = true;
    stText.textContent = 'Analyzing code with AI...';
    try {
      const data = await apiAuth('/api/reviews', {
        method: 'POST',
        body: {
          title: document.getElementById('auditTitle').value,
          language: document.getElementById('auditLang').value,
          focus: document.getElementById('auditFocus').value,
          code: document.getElementById('auditCode').value
        }
      });
      showReview(data.review, `Model: ${data.review.model || 'demo'} • ${data.ms} ms • Saved to MongoDB`);
      stText.textContent = 'Saved!';
    } catch (err) {
      const extra = err.details ? ' — ' + Object.values(err.details).join(', ') : '';
      showMsg(errBox, err.message + extra, false);
      stText.textContent = '';
    } finally {
      btn.disabled = false;
    }
  };

  document.getElementById('chatForm').onsubmit = async e => {
    e.preventDefault();
    if (!activeReview) return;
    const inp = document.getElementById('chatInput');
    const btn = document.getElementById('chatBtn');
    const q = inp.value.trim();
    if (!q) return;
    btn.disabled = true;
    try {
      const r = await apiAuth(`/api/reviews/${activeReview._id}/chat`, { method: 'POST', body: { question: q } });
      activeReview.chat = r.chat;
      renderChat(r.chat);
      inp.value = '';
    } catch (err) {
      showMsg(document.getElementById('auditErr'), err.message, false);
    } finally {
      btn.disabled = false;
    }
  };

  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    try {
      const data = await apiAuth('/api/reviews/' + encodeURIComponent(id));
      const r = data.review;
      document.getElementById('auditTitle').value = r.title;
      document.getElementById('auditLang').value = r.language;
      document.getElementById('auditFocus').value = r.focus;
      document.getElementById('auditCode').value = r.code;
      showReview(r);
    } catch (err) {
      showMsg(document.getElementById('auditErr'), err.message, false);
    }
  }
}

async function initReport() {
  const out = document.getElementById('reportOut');
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { out.textContent = 'Missing report ID.'; return; }
  try {
    const data = await callApi('/api/public/reviews/' + encodeURIComponent(id));
    const r = data.report;
    const findingsBox = h('div');
    renderFindings(findingsBox, r.findings);
    out.replaceChildren(
      h('h1', { style: 'margin-top:0' }, r.title),
      h('p', { class: 'muted' }, `Author: ${r.author} • ${r.language.toUpperCase()} • Score: ${r.score}/100 (Grade ${r.grade}) • ${r.complexity}`),
      h('p', {}, r.summary),
      h('h3', {}, 'Findings'),
      findingsBox,
      h('h3', {}, 'Refactored Code'),
      h('pre', { class: 'code-view' }, r.refactoredCode)
    );
  } catch (err) {
    out.replaceChildren(h('div', { class: 'err-box' }, err.message));
  }
}

async function initAdmin() {
  if (!requireLogin()) return;
  let page = 1;
  async function load() {
    try {
      const q = encodeURIComponent(document.getElementById('admSearch').value.trim());
      const sort = encodeURIComponent(document.getElementById('admSort').value);
      const data = await apiAuth(`/api/admin/users?q=${q}&sort=${sort}&page=${page}`);
      document.getElementById('adminBody').classList.remove('hidden');
      document.getElementById('admUsers').textContent = String(data.stats.totalUsers);
      document.getElementById('admAudits').textContent = String(data.stats.totalAudits);
      document.getElementById('admPageInfo').textContent = `Page ${data.page} of ${data.pages} (${data.total} users)`;
      document.getElementById('admPrev').disabled = data.page <= 1;
      document.getElementById('admNext').disabled = data.page >= data.pages;

      const me = getUser();
      document.getElementById('admRows').replaceChildren(...data.users.map(u => {
        const isSelf = me && String(me.id) === String(u.id);
        const roleBtn = h('button', { class: 'btn sm', type: 'button', disabled: isSelf }, u.role === 'admin' ? 'Make User' : 'Make Admin');
        roleBtn.onclick = async () => {
          await apiAuth(`/api/admin/users/${u.id}/role`, { method: 'PATCH', body: { role: u.role === 'admin' ? 'user' : 'admin' } });
          load();
        };
        return h('tr', {}, [
          h('td', {}, u.name),
          h('td', {}, u.email),
          h('td', {}, h('span', { class: 'sev ' + (u.role === 'admin' ? 'sev-HIGH' : 'sev-LOW') }, u.role.toUpperCase())),
          h('td', {}, String(u.audits)),
          h('td', {}, u.audits ? `${u.avgScore}/100` : '—'),
          h('td', {}, u.isActive ? 'Active' : 'Disabled'),
          h('td', {}, roleBtn)
        ]);
      }));
    } catch (err) {
      showMsg(document.getElementById('adminErr'), err.message, false);
    }
  }
  document.getElementById('admSearch').oninput = () => { page = 1; load(); };
  document.getElementById('admSort').onchange = () => { page = 1; load(); };
  document.getElementById('admPrev').onclick = () => { if (page > 1) { page--; load(); } };
  document.getElementById('admNext').onclick = () => { page++; load(); };
  await load();
}

(async () => {
  const statusPromise = initNav();
  const page = document.body.dataset.page;
  if (page === 'auth') await initAuth(statusPromise);
  else if (page === 'dashboard') await initDashboard();
  else if (page === 'auditor') await initAuditor();
  else if (page === 'report') await initReport();
  else if (page === 'admin') await initAdmin();
})();
