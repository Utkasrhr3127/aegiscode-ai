// Asks for a Groq (recommended) or Gemini API key once and saves it in the .env file.
// The key stays on this computer. Never share the .env file and never put it in the lab record.
const fs = require('fs'), path = require('path'), readline = require('readline');
const envFile = path.join(__dirname, '..', '.env');
const read = () => (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '');
const getVar = name => {
  const m = read().match(new RegExp('^\\s*' + name + '\\s*=\\s*(.*)\\s*$', 'm'));
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : '';
};
function saveVar(name, val) {
  const re = new RegExp('^\\s*' + name + '\\s*=');
  const text = read().split(/\r?\n/).filter(l => !re.test(l)).join('\n').replace(/\n+$/, '');
  fs.writeFileSync(envFile, (text ? text + '\n' : '') + name + '=' + val + '\n');
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async q => { process.stdout.write(q); const { value } = await lines.next(); return (value || '').trim(); };

async function check(key) {
  const isGroq = /^gsk_/i.test(key);
  if (isGroq) {
    process.env.GROQ_API_KEY = key;
    delete process.env.AI_PROVIDER;
  } else {
    process.env.GEMINI_API_KEY = key;
    process.env.AI_PROVIDER = 'gemini';
  }
  const g = require('../lib/gemini');
  try { return { ok: true, varName: isGroq ? 'GROQ_API_KEY' : 'GEMINI_API_KEY', model: await g.pickModel(true) }; }
  catch (e) { return { ok: false, msg: e.message }; }
}

(async () => {
  console.log('\n  Experiments 9 to 12 and 15 call an AI API, so they need a free API key.');
  console.log('  Recommended (higher free-tier rate limits): Groq key at https://console.groq.com');
  console.log('  Alternative: Gemini key at https://aistudio.google.com\n');
  let key = getVar('GROQ_API_KEY') || getVar('GEMINI_API_KEY');
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!key) {
      key = await ask('  Paste your Groq (gsk_...) or Gemini API key and press Enter (or press Enter to skip): ');
      if (!key) { console.log('\n  Skipped. The apps will run in DEMO mode.\n'); break; }
    }
    process.stdout.write('  Checking the key... ');
    const r = await check(key);
    if (r.ok) { saveVar(r.varName, key); console.log('accepted (' + r.varName + '). Model that will be used: ' + r.model + '\n'); break; }
    console.log('FAILED\n  ' + r.msg + '\n');
    if (/internet|reach|too long/i.test(r.msg)) { console.log('  The key was not checked. Fix the internet connection and run again.\n'); break; }
    key = ''; if (attempt === 2) console.log('  Too many tries. Run this again when you have the right key.\n');
  }
  rl.close();
})();
