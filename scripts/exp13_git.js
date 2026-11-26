// scripts/exp13_git.js  –  Automates all git steps for Experiment 13.
// Runs git init, three commits, branch, PR push, main merge, v1.0.0 tag.
// User only needs to: (1) have Git installed, (2) create an empty GitHub repo, (3) paste the repo URL.
const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const run = (cmd, opts) => {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: 'pipe', ...opts });
    return String(out || '').trim();
  } catch (e) {
    throw new Error(String(e.stderr || e.stdout || e.message).trim().split('\n')[0]);
  }
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));

function checkGit() {
  try { run('git --version'); return true; } catch (e) { return false; }
}

function configuredUser() {
  try { run('git config user.name'); return true; } catch (e) { return false; }
}

function isAlreadyRepo() {
  try { run('git rev-parse --git-dir'); return true; } catch (e) { return false; }
}

function getCurrentRemote() {
  try { return run('git remote get-url origin'); } catch (e) { return ''; }
}

function step(label, fn) {
  process.stdout.write(`  ${label} ... `);
  try { const r = fn(); console.log('done' + (r ? ' (' + r.slice(0, 60) + ')' : '')); }
  catch (e) { console.log('FAILED\n  ' + e.message); throw e; }
}

(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   Experiment 13 — Git & GitHub Automation for AegisCode   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // ── 0. Prerequisites ───────────────────────────────────────────────────────
  if (!checkGit()) {
    console.log('  Git is not installed. Install from https://git-scm.com and run again.');
    rl.close(); process.exit(1);
  }

  // ── 1. Git identity ────────────────────────────────────────────────────────
  if (!configuredUser()) {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'student.config.json'), 'utf8'));
    const name = c.name || 'Developer';
    const email = await ask(`  Your Git email (used for commits): `);
    run(`git config user.name "${name}"`);
    run(`git config user.email "${email.trim()}"`);
    console.log(`  Git identity set: ${name} <${email.trim()}>`);
  }

  // ── 2. Init repo ───────────────────────────────────────────────────────────
  if (!isAlreadyRepo()) {
    step('git init', () => run('git init'));
    step('rename branch to main', () => run('git branch -M main'));
  } else {
    console.log('  Git repository already initialised — skipping init.');
  }

  // ── 3. Verify .env is ignored ──────────────────────────────────────────────
  const status = run('git status --porcelain');
  if (/(?:^|\s)\.env(?:\r?\n|$)/m.test(status)) {
    console.log('\n  ⚠  WARNING: .env appears in git status. Check .gitignore and remove it before proceeding.\n');
    rl.close(); process.exit(1);
  }

  // ── 4. Three structured commits ────────────────────────────────────────────
  // commit 1
  try {
    step('commit 1/3 (chore: project setup)', () => {
      run('git add package.json .gitignore .env.example README.md lib shared student.config.json dev_tools');
      return run('git commit -m "chore: setup shared libs, Groq client and config"');
    });
  } catch (e) { if (!e.message.includes('nothing to commit')) throw e; }

  // commit 2
  try {
    step('commit 2/3 (feat: AegisCode AI capstone)', () => {
      run('git add exp15_capstone');
      return run('git commit -m "feat: add AegisCode AI full-stack security auditor"');
    });
  } catch (e) { if (!e.message.includes('nothing to commit')) throw e; }

  // commit 3
  try {
    step('commit 3/3 (test: tests, scripts, lab notes)', () => {
      run('git add .');
      return run('git commit -m "test: add automated tests, scripts and lab notes"');
    });
  } catch (e) { if (!e.message.includes('nothing to commit')) throw e; }

  // ── 5. Remote & push ───────────────────────────────────────────────────────
  const existingRemote = getCurrentRemote();
  let repoUrl = '';
  if (existingRemote) {
    console.log(`\n  Remote already set: ${existingRemote}`);
    repoUrl = existingRemote;
  } else {
    console.log('\n  ── STEP: Create a GitHub repository ──────────────────────────────────');
    console.log('  1. Open https://github.com/new in your browser.');
    console.log('  2. Name: aegiscode-ai   │  Private or Public, your choice.');
    console.log('  3. Do NOT tick "Add a README" — the repo must be empty.');
    console.log('  4. Press "Create repository" and copy the HTTPS URL shown.');
    console.log('  Example: https://github.com/Utkasrhr3127/aegiscode-ai.git\n');
    repoUrl = (await ask('  Paste your GitHub repo HTTPS URL and press Enter: ')).trim();
    if (!repoUrl) { console.log('  Skipped — run this script again once the repo is created.'); rl.close(); process.exit(0); }
    step('add remote origin', () => run(`git remote add origin ${repoUrl}`));
  }

  step('push main to GitHub', () => run('git push -u origin main'));

  // ── 6. Feature branch → PR push ───────────────────────────────────────────
  const branchExists = (() => { try { run('git rev-parse --verify feature/deploy-config'); return true; } catch (e) { return false; } })();
  if (!branchExists) {
    step('create feature/deploy-config branch', () => run('git switch -c feature/deploy-config'));
    step('append deployment note to README', () => {
      fs.appendFileSync(path.join(ROOT, 'README.md'), '\n\nDeployed on Render + MongoDB Atlas with Groq AI.\n');
      run('git add README.md');
      return run('git commit -m "docs: add deployment note to README"');
    });
    step('push feature branch', () => run('git push -u origin feature/deploy-config'));
  } else {
    console.log('  feature/deploy-config already exists — skipping.');
  }

  // ── 7. Tell user to open PR ────────────────────────────────────────────────
  const repoWeb = repoUrl.replace(/\.git$/, '');
  console.log('\n  ── ACTION REQUIRED (browser, 30 seconds) ─────────────────────────────');
  console.log(`  1. Open: ${repoWeb}/compare/feature/deploy-config`);
  console.log('  2. Click "Create pull request" → "Merge pull request" → "Confirm merge".');
  console.log('  3. Come back here and press Enter.\n');
  await ask('  Press Enter once you have merged the PR: ');

  // ── 8. Pull merged main & tag v1.0.0 ──────────────────────────────────────
  step('switch to main', () => run('git switch main'));
  step('pull merged changes', () => run('git pull'));

  const tagExists = (() => { try { run('git rev-parse v1.0.0'); return true; } catch (e) { return false; } })();
  if (!tagExists) {
    step('create annotated tag v1.0.0', () => run('git tag -a v1.0.0 -m "v1.0.0: AegisCode AI production release"'));
    step('push tag to GitHub', () => run('git push origin v1.0.0'));
  } else {
    console.log('  Tag v1.0.0 already exists — skipping.');
  }

  // ── 9. Generate JWT secret ─────────────────────────────────────────────────
  const jwtSecret = run(`node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"`);
  console.log('\n  ── GENERATED VALUES (copy these into Render Environment Variables) ────');
  console.log('  JWT_SECRET=' + jwtSecret);
  console.log('\n  ── WHAT TO DO NEXT ───────────────────────────────────────────────────');
  console.log('  1. Create MongoDB Atlas M0 cluster → get MONGODB_URI.');
  console.log('  2. On Render: New Web Service → connect ' + repoWeb);
  console.log('     Build: npm install --omit=dev  │  Start: npm start  │  Health: /health');
  console.log('  3. Add Environment Variables on Render:');
  console.log('     NODE_ENV         = production');
  console.log('     MONGODB_URI      = <your Atlas URI>');
  console.log(`     JWT_SECRET       = ${jwtSecret}`);
  console.log('     GROQ_API_KEY     = <your gsk_... key>');
  console.log('     ADMIN_EMAIL      = <your email>');
  console.log('     ADMIN_PASSWORD   = <strong password>');
  console.log('  4. Run option 15 in run.bat to take all screenshots.\n');

  console.log('  Git automation complete! Commits, branch, PR push, and tag are done.\n');
  rl.close();
})().catch(e => { console.error('\n  Error: ' + e.message); rl.close(); process.exit(1); });
