// Experiment 15 screenshot runner for AegisCode AI.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const ai = require('../lib/gemini');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const SHOW = process.argv.includes('--show');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function findBrowser() {
  for (const p of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]) if (fs.existsSync(p)) return p;
  return null;
}

async function startServer(port) {
  const proc = spawn(process.execPath, ['exp15_capstone/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let ready = false;
  proc.stdout.on('data', d => {
    const s = String(d);
    if (/READY/.test(s)) ready = true;
  });
  for (let i = 0; i < 60 && !ready; i++) await sleep(500);
  if (!ready) { proc.kill(); throw new Error('Server did not start on port ' + port); }
  const base = 'http://localhost:' + port;
  return {
    base,
    stop: async () => {
      try { await fetch(base + '/__shutdown', { method: 'POST' }); } catch (e) {}
      try { proc.kill(); } catch (e) {}
    }
  };
}

(async () => {
  if (!ai.isLive()) {
    console.log('WARNING: Running in DEMO mode (no GROQ_API_KEY in .env). Add a Groq key for live AI screenshots.');
  } else {
    console.log('AI provider:', ai.provider(), '| model:', await ai.pickModel());
  }

  const exe = findBrowser();
  if (!exe) throw new Error('Chrome or Edge not found');
  const srv = await startServer(4215);
  const browser = await chromium.launch({ executablePath: exe, headless: !SHOW });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 840 } });
  const page = await ctx.newPage();
  const snap = async (name, full = false) => {
    await sleep(350);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
    console.log('  saved', name + '.png');
  };

  try {
    await page.goto(srv.base + '/', { waitUntil: 'networkidle' });
    await snap('exp15_01_home_page');

    await page.goto(srv.base + '/auth.html', { waitUntil: 'networkidle' });
    await page.fill('#regName', 'Utkarsh Dev');
    await page.fill('#regEmail', 'utkarsh.demo@aegiscode.dev');
    await page.fill('#regPass', 'SecurePass1');
    await page.click('#regForm button[type="submit"]');
    await page.waitForSelector('.ok-box');
    await snap('exp15_02_register_success');

    await page.fill('#loginEmail', 'utkarsh.demo@aegiscode.dev');
    await page.fill('#loginPass', 'SecurePass1');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForURL('**/dashboard.html');
    await page.waitForSelector('#kpiTotal');
    await snap('exp15_03_dashboard_empty');

    await page.goto(srv.base + '/auditor.html', { waitUntil: 'networkidle' });
    await page.click('#sampleBtn');
    await snap('exp15_04_auditor_input');

    await page.click('#runAuditBtn');
    await page.waitForSelector('#resultBody:not(.hidden)', { timeout: 60000 });
    await snap('exp15_05_ai_audit_result', true);

    await page.fill('#chatInput', 'How do I fix the JWT secret issue in production?');
    await page.click('#chatBtn');
    await page.waitForSelector('#chatBox .msg.model', { timeout: 45000 });
    await snap('exp15_06_ai_mentor_chat', true);

    await page.click('#togglePublicBtn');
    await page.waitForSelector('#publicLinkBtn:not(.hidden)');
    const href = await page.getAttribute('#publicLinkBtn', 'href');
    await page.goto(srv.base + href, { waitUntil: 'networkidle' });
    await snap('exp15_07_public_report', true);

    await page.goto(srv.base + '/dashboard.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#reviewsList .finding');
    await snap('exp15_08_dashboard_analytics');

    await page.goto(srv.base + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#adminErr .err-box');
    await snap('exp15_09_admin_forbidden_403');

    await page.evaluate(() => { localStorage.clear(); });
    await page.goto(srv.base + '/auth.html', { waitUntil: 'networkidle' });
    await page.fill('#loginEmail', 'admin@aegiscode.local');
    await page.fill('#loginPass', 'Admin1234');
    await page.click('#loginForm button[type="submit"]');
    await page.waitForURL('**/dashboard.html');
    await page.goto(srv.base + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#admRows tr');
    await snap('exp15_10_admin_rbac_console');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(srv.base + '/dashboard.html', { waitUntil: 'networkidle' });
    await snap('exp15_11_mobile_view');
  } finally {
    await browser.close();
    await srv.stop();
  }
  console.log('\nDone. Screenshots saved in screenshots\\');
})();
