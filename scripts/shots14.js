// Screenshots for Experiment 14 (testing, debugging, performance, security).
//   node scripts/shots14.js              -> runs everything for real and saves the pictures
//   node scripts/shots14.js --no-lighthouse   -> skips the two Lighthouse reports
// Every picture goes into the ONE folder: screenshots/   (raw outputs go to exp14_results/)
// Nothing here is typed by hand: the test run, the audit, the timings and the Lighthouse reports are real results.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');
const { startApp } = require('../dev_tools/test_helpers');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.SHOTS_OUT || path.join(ROOT, 'screenshots');
const RES = path.join(ROOT, 'exp14_results');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RES, { recursive: true });
const args = process.argv.slice(2);
const SHOW = args.includes('--show');
const NO_LH = args.includes('--no-lighthouse');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'student.config.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const made = [];

async function step(name, fn) {
  try { await fn(); console.log('  ok      ' + name); }
  catch (e) { failures++; console.log('  FAILED  ' + name + ' - ' + String(e.message).split('\n')[0]); }
}
async function launchBrowser() {
  const base = { headless: !SHOW };
  const tries = [{ channel: 'chrome' }, { channel: 'msedge' }];
  if (process.env.CHROME_PATH) tries.push({ executablePath: process.env.CHROME_PATH, args: (process.env.CHROME_ARGS || '--no-sandbox').split(' ') });
  let lastErr;
  for (const t of tries) { try { return await chromium.launch({ ...base, ...t }); } catch (e) { lastErr = e; } }
  throw new Error('Could not open Chrome or Edge. Install Google Chrome, or set CHROME_PATH. (' + String(lastErr.message).split('\n')[0] + ')');
}
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------------------------------------------------------------- pages that are drawn from real output
const CSS = `body{margin:0;background:#0b1020;color:#d7dce8;font:15px/1.5 Consolas,"Cascadia Mono",Menlo,monospace}
.top{background:#161c33;padding:10px 18px;color:#8fa0c8;font-size:13px;border-bottom:1px solid #26304f}
main{padding:16px 22px}.cmd{color:#7ee787;margin-bottom:10px}.ok{color:#3fb950}.bad{color:#ff7b72}.info{color:#79c0ff}.dim{color:#8b93a7}
pre{margin:0;white-space:pre-wrap;word-break:break-word}h1{font:600 18px "Segoe UI",Arial,sans-serif;margin:0 0 12px;color:#fff}
table{border-collapse:collapse;width:100%;font:13px/1.45 "Segoe UI",Arial,sans-serif}th,td{border:1px solid #26304f;padding:7px 9px;text-align:left;vertical-align:top}
th{background:#161c33;color:#9db0e0}.tag{padding:1px 8px;border-radius:9px;font-weight:700;font-size:12px}.FIXED{background:#12361f;color:#56d364}.OK{background:#10294a;color:#79c0ff}
.ACCEPTED{background:#3d2e00;color:#e3b341}.CHECKED{background:#26304f;color:#c9d1d9}.High{color:#ff7b72;font-weight:700}.Medium{color:#e3b341;font-weight:700}.Low{color:#8b93a7}
.bar{height:18px;background:#2f6feb;border-radius:3px}.barbox{background:#161c33;width:100%}.big{font:700 24px "Segoe UI",Arial;color:#56d364}`;
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body data-exp="14"><div class="top">${esc(title)}</div><main>${body}</main><script src="/shared/ribbon.js"></script></body></html>`;

function terminalHtml(title, command, output, code) {
  const lines = stripAnsi(output).split(/\r?\n/).map(l => {
    let cls = '';
    if (/^\s*[✔✓]|^\s*ok /.test(l) || /^ℹ pass/.test(l)) cls = 'ok';
    else if (/^\s*[✖✗]|^\s*not ok|^ℹ fail [1-9]/.test(l)) cls = 'bad';
    else if (/^ℹ /.test(l)) cls = 'info';
    else if (/vulnerab/i.test(l) && /[1-9]/.test(l) && !/found 0/.test(l)) cls = 'bad';
    else if (/found 0 vulnerabilities/.test(l)) cls = 'ok';
    return cls ? `<span class="${cls}">${esc(l)}</span>` : esc(l);
  }).join('\n');
  return page(title, `<div class="cmd">${esc(cfg.name)}'s computer&gt; ${esc(command)}</div><pre>${lines}</pre><div class="dim" style="margin-top:12px">exit code: ${code}</div>`);
}
function perfHtml(p) {
  const max = Math.max(...p.results.map(r => r.medianMs));
  const rows = p.results.map(r => `<tr><td>${esc(r.label)}</td><td style="width:42%"><div class="barbox"><div class="bar" style="width:${Math.max(2, r.medianMs / max * 100)}%"></div></div></td><td><b>${r.medianMs} ms</b></td><td>${r.p95Ms} ms</td></tr>`).join('');
  return page('Experiment 14 - performance: student list query', `<h1>Student list query, ${p.students.toLocaleString()} students, ${p.runsPerVariant} timed runs each</h1>
<p class="dim" style="font-family:Segoe UI,Arial">Query: ${esc(p.query)}<br>Measured ${esc(p.measuredAt)} on Node ${esc(p.node)}. Lower is better.</p>
<table><tr><th>Variant</th><th>Median time</th><th>Median</th><th>Slowest 5% (p95)</th></tr>${rows}</table>
<p style="font-family:Segoe UI,Arial">Documents MongoDB had to read to find the matching students: <b>${p.plans.withoutIndex.docsExamined.toLocaleString()}</b> without the index, <b>${p.plans.withIndex.docsExamined.toLocaleString()}</b> with it.</p>
<p class="big">${p.results[0].medianMs} ms &rarr; ${p.results[p.results.length - 1].medianMs} ms &nbsp;(${p.improvementPercent}% faster)</p>`);
}
function securityHtml(s) {
  const rows = s.rows.map(r => `<tr><td>${esc(r.id)}</td><td>${esc(r.area)}</td><td>${esc(r.finding)}</td><td class="${esc(r.severity)}">${esc(r.severity)}</td><td><span class="tag ${esc(r.status)}">${esc(r.status)}</span></td><td>${esc(r.evidence)}</td></tr>`).join('');
  return page('Experiment 14 - security analysis', `<h1>${esc(s.title)}</h1><table><tr><th>OWASP</th><th>Area</th><th>Finding</th><th>Severity</th><th>Status</th><th>Evidence</th></tr>${rows}</table>`);
}

// tiny local web server for the pages above (it also serves shared/ribbon.js and the student config, so the name bar appears)
function serve(pages) {
  const srv = http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (pages[u]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(pages[u]); }
    if (u === '/student.config.json') return res.end(fs.readFileSync(path.join(ROOT, 'student.config.json')));
    if (u === '/shared/ribbon.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(ROOT, 'shared', 'ribbon.js'))); }
    res.writeHead(404); res.end();
  });
  return new Promise(r => srv.listen(0, () => r({ srv, base: 'http://localhost:' + srv.address().port })));
}
// Opens one of the pages, makes the window exactly as tall as the content, and takes the picture (name bar at the bottom).
async function shootPage(browser, base, route, name) {
  const pg = await browser.newPage({ viewport: { width: 1280, height: 700 } });
  await pg.goto(base + route);
  await pg.waitForFunction(() => document.getElementById('labRibbon'), null, { timeout: 8000 });
  const h = await pg.evaluate(() => document.documentElement.scrollHeight);
  await pg.setViewportSize({ width: 1280, height: Math.min(Math.max(h, 400), 3200) });
  await sleep(250);
  await pg.screenshot({ path: path.join(OUT, name + '.png') });
  made.push(name + '.png'); await pg.close();
}

const run = (cmd, a, opts = {}) => spawnSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, ...opts });

// ---------------------------------------------------------------- Lighthouse (real reports of two running pages)
async function lighthouseShot(browser, url, key, name) {
  let lighthouse, chromeLauncher;
  try { ({ default: lighthouse } = await import('lighthouse')); chromeLauncher = await import('chrome-launcher'); }
  catch (e) { throw new Error('Lighthouse is not installed. Run: npm install --save-dev lighthouse   (or take it by hand: see lab_notes/exp14.md, "If Lighthouse cannot run")'); }
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  let result;
  try {
    result = await lighthouse(url, { port: chrome.port, output: 'html', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] },
      { extends: 'lighthouse:default', settings: { formFactor: 'desktop', screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 } } });
  } finally { await chrome.kill(); }
  const file = path.join(RES, 'lighthouse_' + key + '.html');
  fs.writeFileSync(file, result.report);
  const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  console.log('          ' + key + ' scores: ' + JSON.stringify(scores));
  fs.writeFileSync(path.join(RES, 'lighthouse_' + key + '.json'), JSON.stringify({ url, scores }, null, 2));
  const pg = await browser.newPage({ viewport: { width: 1200, height: 860 } });
  await pg.goto('file://' + file.replace(/\\/g, '/'));
  await pg.waitForSelector('.lh-scores-header', { timeout: 20000 });
  await pg.evaluate(c => {
    const bar = document.createElement('div');
    bar.textContent = `${c.name}  |  Roll No: ${c.rollNo}  |  Section: ${c.section}  |  ${c.course}  |  Experiment 14`;
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111827;color:#fff;font:600 13px/1 "Segoe UI",Arial,sans-serif;padding:12px 10px;text-align:center';
    document.body.appendChild(bar);
  }, cfg);
  await sleep(500);
  await pg.screenshot({ path: path.join(OUT, name + '.png') });
  made.push(name + '.png'); await pg.close();
}

// ---------------------------------------------------------------- main
(async () => {
  console.log('\nExperiment 14 for: ' + cfg.name + '\n');
  const pages = {}; const shots = [];

  console.log('Running the test suite (AI client, static security, and AegisCode AI capstone) ...');
  let testCode = null;
  await step('npm test (all suites)', async () => {
    const r = run(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=1', 'test/*.test.js', 'test_capstone/*.test.js']);
    const out = (r.stdout || '') + (r.stderr || '');
    fs.writeFileSync(path.join(RES, 'test_output.txt'), stripAnsi(out));
    testCode = r.status;
    const tail = stripAnsi(out).split(/\r?\n/).filter(l => /^ℹ (tests|pass|fail)/.test(l)).join('  ');
    console.log('          ' + tail);
    if (r.status !== 0) throw new Error('some tests failed. See exp14_results/test_output.txt and send me the FAILED lines');
    pages['/test'] = terminalHtml('Experiment 14 - automated tests', 'npm test', out, r.status); shots.push(['/test', 'exp14_01_tests_passing']);
  });

  console.log('Running npm audit ...');
  await step('npm audit', async () => {
    const r = run('npm', ['audit'], { shell: true });
    const out = (r.stdout || '') + (r.stderr || '');
    fs.writeFileSync(path.join(RES, 'audit_output.txt'), stripAnsi(out));
    if (/audit endpoint|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network/i.test(out) && !/vulnerabilit/i.test(out)) throw new Error('npm audit could not reach the internet. Check your connection and run again');
    console.log('          ' + (stripAnsi(out).split(/\r?\n/).filter(l => /vulnerabilit/i.test(l)).pop() || '').trim());
    pages['/audit'] = terminalHtml('Experiment 14 - dependency audit', 'npm audit', out, r.status); shots.push(['/audit', 'exp14_02_npm_audit']);
  });

  await step('security findings table', async () => {
    pages['/security'] = securityHtml(JSON.parse(fs.readFileSync(path.join(__dirname, 'security_findings.json'), 'utf8')));
    shots.push(['/security', 'exp14_03_security_findings_table']);
  });

  console.log('Measuring performance (inserts 50,000 students into a temporary database) ...');
  await step('performance before and after', async () => {
    const r = run(process.execPath, ['scripts/perf14.js']);
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) throw new Error(out.trim().split(/\r?\n/).pop());
    console.log(out.trim().split(/\r?\n/).filter(l => /median|faster/i.test(l)).map(l => '          ' + l).join('\n'));
    pages['/perf'] = perfHtml(JSON.parse(fs.readFileSync(path.join(RES, 'perf.json'), 'utf8'))); shots.push(['/perf', 'exp14_04_performance_before_after']);
  });

  const browser = await launchBrowser();
  try {
    const { srv, base } = await serve(pages);
    for (const [route, name] of shots) await step(name, () => shootPage(browser, base, route, name));
    srv.close();

    if (NO_LH) console.log('  skipped Lighthouse (--no-lighthouse)');
    else {
      console.log('Running Lighthouse on AegisCode AI (about a minute) ...');
      let a15;
      await step('start AegisCode AI for Lighthouse', async () => { a15 = await startApp('exp15_capstone/server.js', 4215); });
      if (a15) {
        await step('exp14_05_lighthouse_home', () => lighthouseShot(browser, a15.base + '/', 'exp15', 'exp14_05_lighthouse_home'));
        await step('exp14_06_lighthouse_auth', () => lighthouseShot(browser, a15.base + '/auth.html', 'exp15', 'exp14_06_lighthouse_auth'));
      }
      if (a15) await a15.stop();
    }
  } finally { await browser.close(); }

  console.log('\nPictures made (' + made.length + '): ' + made.join(', '));
  if (failures) {
    console.log('\n' + failures + ' step(s) FAILED. Send me only the FAILED lines above.');
    if (!made.some(m => /lighthouse/.test(m)) && !NO_LH) console.log('If only Lighthouse failed: do the 5 manual steps in lab_notes/exp14.md ("If Lighthouse cannot run").');
  } else console.log('\nAll steps worked. Check each picture once: your name bar must be visible.');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('\nStopped: ' + e.message); process.exit(1); });
