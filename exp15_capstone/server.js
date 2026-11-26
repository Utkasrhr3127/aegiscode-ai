// Experiment 15 (Capstone): AegisCode AI — Full-Stack AI Code Security Auditor & Architecture Platform.
// One Express 5 server serves both the REST API and the frontend pages, deploying as a single service (Experiment 13).
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp, errorHandler, notFoundApi, start, express, mongoose } = require('../lib/common');
const ai = require('../lib/gemini');
const { SYSTEM_AUDIT, SYSTEM_MENTOR, validateAudit, buildAuditPrompt, normalizeAuditResult, demoAudit } = require('./audit');

const PROD = process.env.NODE_ENV === 'production';
if (PROD && !process.env.JWT_SECRET) { console.error('JWT_SECRET is not set. Refusing to start in production with the lab secret.'); process.exit(1); }
if (PROD && !process.env.MONGODB_URI) { console.error('MONGODB_URI is not set. Refusing to start in production without a real database.'); process.exit(1); }
const JWT_SECRET = process.env.JWT_SECRET || 'lab-only-secret-change-me';

// ---- Database Models -------------------------------------------------------
const User = mongoose.model('User', new mongoose.Schema({
  name:         { type: String, required: [true, 'Name is required'], trim: true, minlength: [2, 'Name needs at least 2 characters'], maxlength: [60, 'Name is too long'] },
  email:        { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'] },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ['user', 'admin'], default: 'user' },
  isActive:     { type: Boolean, default: true }
}, { timestamps: true }));

const findingSchema = new mongoose.Schema({
  severity: { type: String, enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], required: true },
  title:    { type: String, required: true },
  lineHint: String,
  issue:    String,
  fix:      String
}, { _id: false });

const chatMsgSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'model'], required: true },
  text: { type: String, required: true },
  at:   { type: Date, default: Date.now }
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:          { type: String, required: true, trim: true, maxlength: 100 },
  language:       { type: String, required: true },
  focus:          { type: String, required: true },
  code:           { type: String, required: true },
  score:          { type: Number, min: 0, max: 100, required: true },
  grade:          { type: String, enum: ['A', 'B', 'C', 'D', 'F'], required: true },
  complexity:     { type: String, default: '' },
  summary:        { type: String, required: true },
  findings:       [findingSchema],
  refactoredCode: { type: String, default: '' },
  chat:           [chatMsgSchema],
  isPublic:       { type: Boolean, default: false },
  model:          String
}, { timestamps: true });

reviewSchema.index({ user: 1, createdAt: -1 });
const AuditReview = mongoose.model('AuditReview', reviewSchema);

const publicUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, isActive: u.isActive !== false, createdAt: u.createdAt });

// ---- Auth & RBAC Middleware ------------------------------------------------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required: no token was sent' });
  try { req.auth = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Your session has expired, please log in again' : 'Invalid token' }); }
}

const requireRole = role => (req, res, next) =>
  req.auth.role === role ? next() : res.status(403).json({ error: 'Forbidden: this area is only for ' + role + 's' });

// ---- Express App -----------------------------------------------------------
const app = createApp(path.join(__dirname, 'public'), { jsonLimit: '150kb' });
if (PROD) app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.get('/api/status', async (req, res) => res.json({ ...(await ai.statusPayload()), demoAccounts: !PROD }));

// ---- Auth Routes -----------------------------------------------------------
app.post('/api/auth/register', ai.limiter({ max: 10 }), async (req, res) => {
  const { name, email, password } = req.body || {};
  const details = {};
  if (typeof password !== 'string' || password.length < 8) details.password = 'Password needs at least 8 characters';
  else if (password.length > 72) details.password = 'Password can be at most 72 characters';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) details.password = 'Password needs at least one letter and one number';
  try { await new User({ name, email, passwordHash: 'x' }).validate(); }
  catch (e) { for (const [k, v] of Object.entries(e.errors || {})) if (k !== 'passwordHash') details[k] = v.message; }
  if (Object.keys(details).length) return res.status(400).json({ error: 'Validation failed', details });
  if (await User.findOne({ email: String(email).toLowerCase().trim() }))
    return res.status(409).json({ error: 'Duplicate email', details: { email: 'This email is already registered' } });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ message: 'Account created. You can log in now.', user: publicUser(user) });
});

app.post('/api/auth/login', ai.limiter({ max: 20 }), async (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' && typeof password === 'string' && email && password
    ? await User.findOne({ email: email.toLowerCase().trim() })
    : null;
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.isActive === false) return res.status(403).json({ error: 'Account is deactivated. Contact an administrator.' });
  const token = jwt.sign({ sub: String(user._id), name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const u = await User.findById(req.auth.sub).lean();
  if (!u) return res.status(401).json({ error: 'User not found' });
  res.json({ user: publicUser(u) });
});

// ---- AI Code Audit Routes --------------------------------------------------
app.post('/api/reviews', requireAuth, ai.limiter({ max: 20 }), async (req, res) => {
  const { d, title, code, language, focus } = validateAudit(req.body || {});
  if (Object.keys(d).length) return res.status(400).json({ error: 'Validation failed', details: d });

  let result, model = null, demo = false, ms = 600;
  if (!ai.isLive()) {
    await ai.sleep(600);
    result = demoAudit({ title, language, focus, code });
    demo = true;
  } else {
    const out = await ai.generate({
      system: SYSTEM_AUDIT,
      contents: [{ role: 'user', parts: [{ text: buildAuditPrompt({ title, language, focus, code }) }] }],
      temperature: 0.25,
      maxOutputTokens: 3072,
      json: true
    });
    result = normalizeAuditResult(out.text, code);
    model = out.model;
    ms = out.ms;
  }

  const saved = await AuditReview.create({
    user: req.auth.sub,
    title,
    language,
    focus,
    code,
    ...result,
    model
  });

  res.status(201).json({ review: saved, demo, ms });
});

app.get('/api/reviews/stats', requireAuth, async (req, res) => {
  const rows = await AuditReview.find({ user: req.auth.sub }).select('score grade language findings').lean();
  const total = rows.length;
  const avgScore = total ? Math.round(rows.reduce((s, r) => s + r.score, 0) / total) : 0;
  const severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const byLanguage = {};
  for (const r of rows) {
    byLanguage[r.language] = (byLanguage[r.language] || 0) + 1;
    for (const f of (r.findings || [])) {
      if (f.severity in severity) severity[f.severity]++;
    }
  }
  res.json({ total, avgScore, severity, byLanguage });
});

app.get('/api/reviews', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const lang = String(req.query.language || '').trim();
  const filter = { user: req.auth.sub };
  if (lang) filter.language = lang;
  if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const reviews = await AuditReview.find(filter).sort({ createdAt: -1 }).limit(30).lean();
  res.json({ reviews });
});

app.get('/api/reviews/:id', requireAuth, async (req, res) => {
  const r = await AuditReview.findOne({ _id: req.params.id, user: req.auth.sub }).lean();
  if (!r) return res.status(404).json({ error: 'Audit review not found' });
  res.json({ review: r });
});

app.delete('/api/reviews/:id', requireAuth, async (req, res) => {
  const r = await AuditReview.findOneAndDelete({ _id: req.params.id, user: req.auth.sub });
  if (!r) return res.status(404).json({ error: 'Audit review not found' });
  res.json({ deleted: true });
});

app.patch('/api/reviews/:id/visibility', requireAuth, async (req, res) => {
  const r = await AuditReview.findOne({ _id: req.params.id, user: req.auth.sub });
  if (!r) return res.status(404).json({ error: 'Audit review not found' });
  r.isPublic = Boolean(req.body && req.body.isPublic);
  await r.save();
  res.json({ isPublic: r.isPublic, id: r._id });
});

app.post('/api/reviews/:id/chat', requireAuth, ai.limiter({ max: 25 }), async (req, res) => {
  const question = String((req.body && req.body.question) || '').trim();
  if (question.length < 2 || question.length > 600) {
    return res.status(400).json({ error: 'Question must be between 2 and 600 characters' });
  }
  const r = await AuditReview.findOne({ _id: req.params.id, user: req.auth.sub });
  if (!r) return res.status(404).json({ error: 'Audit review not found' });

  let answer = '';
  let model = null;
  if (!ai.isLive()) {
    await ai.sleep(400);
    answer = `**Demo Mentor:** For "${r.title}", focus first on the highest-severity finding (${(r.findings[0] && r.findings[0].title) || 'input validation'}). Add a GROQ_API_KEY in .env for live mentoring.`;
  } else {
    const context = `Audited Code (${r.language}, Score ${r.score}/100):\n\`\`\`${r.language}\n${r.code.slice(0, 4000)}\n\`\`\`\nFindings:\n` +
      r.findings.map(f => `- [${f.severity}] ${f.title}: ${f.issue}`).join('\n');
    const history = (r.chat || []).slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    const contents = [
      { role: 'user', parts: [{ text: context + '\n\nFirst question or context acknowledgement:' }] },
      { role: 'model', parts: [{ text: 'I have reviewed the code and findings. Ask any follow-up question.' }] },
      ...history,
      { role: 'user', parts: [{ text: question }] }
    ];
    const out = await ai.generate({ system: SYSTEM_MENTOR, contents, temperature: 0.4, maxOutputTokens: 1024 });
    answer = out.text;
    model = out.model;
  }

  r.chat.push({ role: 'user', text: question }, { role: 'model', text: answer });
  if (r.chat.length > 30) r.chat = r.chat.slice(-30);
  await r.save();
  res.json({ answer, model, chat: r.chat });
});

// ---- Public Shareable Report -----------------------------------------------
app.get('/api/public/reviews/:id', async (req, res) => {
  const r = await AuditReview.findOne({ _id: req.params.id, isPublic: true }).populate('user', 'name').lean();
  if (!r) return res.status(404).json({ error: 'Public audit report not found or private' });
  res.json({
    report: {
      id: r._id,
      title: r.title,
      language: r.language,
      focus: r.focus,
      score: r.score,
      grade: r.grade,
      complexity: r.complexity,
      summary: r.summary,
      findings: r.findings,
      refactoredCode: r.refactoredCode,
      author: (r.user && r.user.name) || 'Developer',
      createdAt: r.createdAt,
      model: r.model
    }
  });
});

// ---- Admin RBAC Routes -----------------------------------------------------
app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = safe ? { $or: [{ name: { $regex: safe, $options: 'i' } }, { email: { $regex: safe, $options: 'i' } }] } : {};
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
  const sort = ({ newest: { createdAt: -1 }, name: { name: 1 }, email: { email: 1 } }[req.query.sort]) || { createdAt: -1 };

  const [users, total, totalAudits] = await Promise.all([
    User.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    AuditReview.countDocuments()
  ]);

  const counts = await AuditReview.aggregate([
    { $match: { user: { $in: users.map(u => u._id) } } },
    { $group: { _id: '$user', count: { $sum: 1 }, avgScore: { $avg: '$score' } } }
  ]);
  const byUser = Object.fromEntries(counts.map(c => [String(c._id), { count: c.count, avgScore: Math.round(c.avgScore || 0) }]));

  res.json({
    users: users.map(u => ({ ...publicUser(u), audits: (byUser[String(u._id)] && byUser[String(u._id)].count) || 0, avgScore: (byUser[String(u._id)] && byUser[String(u._id)].avgScore) || 0 })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    stats: { totalUsers: await User.countDocuments(), totalAudits }
  });
});

app.patch('/api/admin/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  if (String(req.params.id) === String(req.auth.sub)) {
    return res.status(400).json({ error: 'You cannot modify your own admin role or status' });
  }
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const { role, isActive } = req.body || {};
  if (role && ['user', 'admin'].includes(role)) u.role = role;
  if (typeof isActive === 'boolean') u.isActive = isActive;
  await u.save();
  res.json({ user: publicUser(u) });
});

app.use('/api', notFoundApi);
app.use(errorHandler);

async function seedIfEmpty() {
  if (PROD) {
    const email = process.env.ADMIN_EMAIL, pass = process.env.ADMIN_PASSWORD;
    if (email && pass && !(await User.findOne({ email: email.toLowerCase() }))) {
      await User.create({ name: 'Platform Admin', email, passwordHash: await bcrypt.hash(pass, 10), role: 'admin' });
      console.log('Created production admin:', email);
    }
    return;
  }
  if (await User.countDocuments() > 0) return;
  const [admin, dev] = await User.create([
    { name: 'Admin Reviewer', email: 'admin@aegiscode.local', passwordHash: await bcrypt.hash('Admin1234', 10), role: 'admin' },
    { name: 'Utkarsh Shrivastava', email: 'dev@aegiscode.local', passwordHash: await bcrypt.hash('Student123', 10), role: 'user' }
  ]);
  await AuditReview.create([
    {
      user: dev._id,
      title: 'Express Login SQLi & Weak Hash Check',
      language: 'javascript',
      focus: 'owasp',
      code: "app.post('/login', (req, res) => {\n  const q = `SELECT * FROM users WHERE email='${req.body.email}'`;\n  db.query(q);\n});",
      score: 42,
      grade: 'F',
      complexity: 'Time: O(1) | Space: O(1)',
      summary: 'Critical SQL injection vulnerability via string interpolation in SQL query, plus missing password verification.',
      findings: [
        { severity: 'CRITICAL', title: 'SQL Injection (CWE-89)', lineHint: 'Line 2', issue: 'req.body.email is interpolated directly into SQL.', fix: 'Use parameterized queries: db.query("SELECT * FROM users WHERE email = ?", [email]).' },
        { severity: 'HIGH', title: 'Missing password hash check', lineHint: 'Line 3', issue: 'No bcrypt password comparison is performed.', fix: 'Verify password with bcrypt.compare before issuing a JWT.' }
      ],
      refactoredCode: "app.post('/login', async (req, res) => {\n  const email = String(req.body.email || '').trim();\n  const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);\n  if (!user || !(await bcrypt.compare(req.body.password, user.hash))) return res.status(401).end();\n  res.json({ ok: true });\n});",
      isPublic: true,
      model: 'seed-baseline'
    }
  ]);
  console.log('Demo accounts ready: dev@aegiscode.local / Student123, admin@aegiscode.local / Admin1234');
}

if (require.main === module) {
  start(app, { port: 3015, dbName: 'aegiscode_ai', onReady: seedIfEmpty, label: 'Experiment 15 (AegisCode AI)' })
    .then(() => console.log('AI mode:', ai.isLive() ? 'LIVE (' + ai.provider() + ')' : 'DEMO'));
}

module.exports = { app, User, AuditReview, seedIfEmpty };
