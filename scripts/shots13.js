// scripts/shots13.js  –  Automates all 8 Experiment 13 screenshots.
// User provides: GitHub username/reponame + live Render URL.
// Script visits GitHub and the live site in Playwright and saves all pictures.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const SHOW = process.argv.includes('--show');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, v => r(v.trim())));

function findBrowser() {
  for (const p of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ]) if (fs.existsSync(p)) return p;
  return null;
}

async function snap(page, name, full = false) {
  await sleep(1800);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
  console.log('  saved  ' + name + '.png');
}

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Experiment 13 — Automated Deployment Screenshots            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const ghUser = await ask('  Your GitHub username (e.g. Utkasrhr3127): ');
  const ghRepo = await ask('  Your GitHub repo name (e.g. aegiscode-ai): ');
  let liveUrl  = await ask('  Your Render live URL (e.g. https://aegiscode-ai.onrender.com): ');
  liveUrl = liveUrl.replace(/\/$/, '');
  rl.close();

  if (!ghUser || !ghRepo || !liveUrl) {
    console.log('  Please provide all three values and run again.');
    process.exit(1);
  }

  const GH = `https://github.com/${ghUser}/${ghRepo}`;
  const exe = findBrowser();
  if (!exe) { console.log('  Chrome or Edge not found. Install Chrome and try again.'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: exe, headless: !SHOW });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 840 } });
  const page = await ctx.newPage();

  try {
    // 1 – GitHub repo (shows folders)
    console.log('\n  Taking GitHub screenshots...');
    await page.goto(GH, { waitUntil: 'networkidle' });
    await snap(page, 'exp13_01_github_repo');

    // 2 – Commit history
    await page.goto(GH + '/commits/main', { waitUntil: 'networkidle' });
    await snap(page, 'exp13_02_commit_history');

    // 3 – Merged pull request (Closed tab)
    await page.goto(GH + '/pulls?state=closed', { waitUntil: 'networkidle' });
    await snap(page, 'exp13_03_pull_request_merged');

    // 4 – Release v1.0.0
    await page.goto(GH + '/releases/tag/v1.0.0', { waitUntil: 'networkidle' });
    await snap(page, 'exp13_04_release_tag');

    // 5 – Atlas cluster (user must navigate manually or we just leave it open)
    console.log('\n  ── Atlas screenshot (manual, ~30 seconds) ─────────────────────────');
    console.log('  The browser will open MongoDB Atlas now.');
    console.log('  Navigate to your cluster page (the one showing the green "Active" label).');
    console.log('  Do NOT show any connection string window.');
    await page.goto('https://cloud.mongodb.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    console.log('  Waiting 45 seconds — navigate to your cluster page, then we screenshot...');
    await sleep(45000);
    await snap(page, 'exp13_05_atlas_cluster');

    // 6 – Render environment variables
    console.log('\n  Navigate to your Render service Environment tab now...');
    await page.goto('https://dashboard.render.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    console.log('  Waiting 45 seconds — click your service → Environment tab...');
    await sleep(45000);
    await snap(page, 'exp13_06_render_env_vars');

    // 7 – Render live status (green)
    console.log('\n  Navigate to your Render service overview (showing green Live label)...');
    await sleep(45000);
    await snap(page, 'exp13_07_render_live');

    // 8 – Live site in browser
    console.log('\n  Taking live site screenshot from Render URL...');
    await page.goto(liveUrl, { waitUntil: 'networkidle', timeout: 90000 });
    await snap(page, 'exp13_08_live_site_name_bar');

    console.log('\n  Done! All 8 Experiment 13 screenshots saved to screenshots\\');
    console.log('  Check each one: your name bar must be visible.\n');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error('\n  Error: ' + e.message); process.exit(1); });
