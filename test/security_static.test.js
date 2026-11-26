// Experiment 14 - static security checks that read the project files (no server needed).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'screenshots', 'screenshots_demo', 'exp14_results', '.git'].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    f.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

test('.gitignore keeps .env (API key) and node_modules out of Git', () => {
  const g = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  assert.ok(g.includes('.env'), '.env is not ignored');
  assert.ok(g.includes('node_modules/') || g.includes('node_modules'), 'node_modules is not ignored');
});

test('no AI key or key variable appears in any file the browser can download', () => {
  const files = walk(ROOT).filter(f => /[\\/]public[\\/]|[\\/]shared[\\/]/.test(f) && /\.(js|html|css|json)$/.test(f));
  assert.ok(files.length >= 5, 'expected to scan the public folders');
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /AIza[0-9A-Za-z_-]{20,}/, 'looks like a Google API key in ' + f);
    assert.doesNotMatch(t, /gsk_[0-9A-Za-z_-]{20,}/, 'looks like a Groq API key in ' + f);
    assert.doesNotMatch(t, /GEMINI_API_KEY|GROQ_API_KEY/, 'key variable name used in browser file ' + f);
  }
});

test('no real API key is written in any source file', () => {
  for (const f of walk(ROOT).filter(f => /\.(js|json|md|bat|txt)$/.test(f) && !/package-lock/.test(f))) {
    const t = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(t, /AIza[0-9A-Za-z_-]{30,}/, 'looks like a Google API key in ' + f);
    assert.doesNotMatch(t, /gsk_[0-9A-Za-z_-]{30,}/, 'looks like a Groq API key in ' + f);
  }
});

test('front-end code never uses innerHTML (cross-site scripting guard)', () => {
  const files = walk(ROOT).filter(f => /[\\/]public[\\/][^\\/]*\.js$/.test(f) || /[\\/]lib[\\/](base|ai)\.js$/.test(f));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\.innerHTML\s*=|insertAdjacentHTML|document\.write\(/, 'unsafe HTML insertion in ' + f);
  }
});
