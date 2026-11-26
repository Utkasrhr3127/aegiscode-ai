// Experiment 14 - performance measurement (real numbers, measured on this computer).
// Question: how much do `.lean()` and the {branch, semester} index (both used in Experiment 8) really save?
// The same 50,000 students are stored in two collections, one with the index and one without.
// The query is the one behind the student list page: filter + sort + first page of 50 + total count.
//   node scripts/perf14.js          -> prints a table and saves exp14_results/perf.json
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ROOT = path.join(__dirname, '..');
const N = 50000, RUNS = 30, PAGE = 50;
const BRANCHES = ['CSE', 'IT', 'ECE', 'ME', 'CE'];

const fields = {
  name: String, rollNo: { type: String, unique: true }, email: { type: String, unique: true },
  branch: String, semester: Number, cgpa: Number
};
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const p95 = a => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; };
const round = n => Math.round(n * 100) / 100;

async function time(fn) {
  await fn(); await fn();   // warm up
  const t = [];
  for (let i = 0; i < RUNS; i++) { const a = process.hrtime.bigint(); await fn(); t.push(Number(process.hrtime.bigint() - a) / 1e6); }
  return { medianMs: round(median(t)), p95Ms: round(p95(t)), runs: RUNS };
}

(async () => {
  console.log('Starting a temporary MongoDB ...');
  const server = await MongoMemoryServer.create({ instance: { dbName: 'perf14' } });
  await mongoose.connect(server.getUri(), { dbName: 'perf14' });

  const plainSchema = new mongoose.Schema(fields, { timestamps: true });
  const indexedSchema = new mongoose.Schema(fields, { timestamps: true });
  indexedSchema.index({ branch: 1, semester: 1 });
  const Plain = mongoose.model('PlainStudent', plainSchema, 'students_plain');
  const Indexed = mongoose.model('IndexedStudent', indexedSchema, 'students_indexed');
  await Promise.all([Plain.init(), Indexed.init()]);

  console.log('Inserting ' + N + ' students into both collections ...');
  const rows = [];
  for (let i = 0; i < N; i++) {
    const b = BRANCHES[i % 5];
    rows.push({ name: 'Student ' + i, rollNo: '26' + b + String(i).padStart(5, '0'), email: 'student' + i + '@college.test', branch: b, semester: 1 + (i % 8), cgpa: round(5 + (i % 50) / 10) });
  }
  for (let i = 0; i < N; i += 5000) { const part = rows.slice(i, i + 5000); await Promise.all([Plain.insertMany(part), Indexed.insertMany(part)]); }

  const filter = { branch: 'CSE', semester: 5 };
  const page = (M, lean) => async () => {
    let q = M.find(filter).sort({ rollNo: 1 }).limit(PAGE);
    if (lean) q = q.lean();
    return Promise.all([q, M.countDocuments(filter)]);
  };
  const variants = [
    { key: 'before', label: 'Before: no index, normal Mongoose documents', run: page(Plain, false) },
    { key: 'lean', label: 'Change 1: .lean() only', run: page(Plain, true) },
    { key: 'index', label: 'Change 2: {branch, semester} index only', run: page(Indexed, false) },
    { key: 'both', label: 'After: .lean() + index (Experiment 8)', run: page(Indexed, true) }
  ];
  const results = [];
  for (const v of variants) { const r = await time(v.run); results.push({ key: v.key, label: v.label, ...r }); console.log('  ' + v.label.padEnd(48) + ' median ' + r.medianMs + ' ms   p95 ' + r.p95Ms + ' ms'); }

  const explain = async M => { const e = await M.find(filter).sort({ rollNo: 1 }).limit(PAGE).explain('executionStats'); const s = e.executionStats; return { docsExamined: s.totalDocsExamined, keysExamined: s.totalKeysExamined, returned: s.nReturned }; };
  const countExplain = async M => { const e = await M.find(filter).explain('executionStats'); const s = e.executionStats; return { docsExamined: s.totalDocsExamined, keysExamined: s.totalKeysExamined, returned: s.nReturned }; };
  const plans = { withoutIndex: await countExplain(Plain), withIndex: await countExplain(Indexed) };
  console.log('Documents MongoDB had to read to find the matching students: ' + plans.withoutIndex.docsExamined + ' without the index, ' + plans.withIndex.docsExamined + ' with it');

  const base = results.find(r => r.key === 'before').medianMs, after = results.find(r => r.key === 'both').medianMs;
  const out = { measuredAt: new Date().toISOString(), node: process.version, students: N, runsPerVariant: RUNS, pageSize: PAGE, query: 'find({branch:"CSE",semester:5}).sort({rollNo:1}).limit(50) + countDocuments(same filter)', results, plans, improvementPercent: round((base - after) / base * 100) };
  fs.mkdirSync(path.join(ROOT, 'exp14_results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'exp14_results', 'perf.json'), JSON.stringify(out, null, 2));
  console.log('Median time went from ' + base + ' ms to ' + after + ' ms (' + out.improvementPercent + '% faster). Saved exp14_results/perf.json');
  await mongoose.disconnect(); await server.stop(); process.exit(0);
})().catch(e => { console.error('perf14 failed: ' + e.message); process.exit(1); });
