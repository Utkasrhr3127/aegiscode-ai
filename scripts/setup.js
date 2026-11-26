// Shows your saved details every time and lets you change them.
// Saved in student.config.json (name, roll number, section appear on every page and screenshot).
const readline = require('readline'), fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'student.config.json');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const forceChange = process.argv.includes('--change');
const placeholder = /^ENTER/.test(cfg.rollNo || '') || /^ENTER/.test(cfg.section || '');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q, d) => {
  process.stdout.write(`  ${q}${d ? ' [' + d + ']' : ''}: `);
  const { value } = await lines.next();
  return (value || '').trim() || d || '';
};

(async () => {
  console.log('\n  Your saved details:');
  console.log(`    Name    : ${cfg.name}`);
  console.log(`    Roll No : ${cfg.rollNo}`);
  console.log(`    Section : ${cfg.section}\n`);

  let change = forceChange || placeholder;
  if (!change) {
    const a = await ask('Press Enter to keep these, or type C to change them');
    change = /^c/i.test(a);
  }
  if (change) {
    console.log('\n  Press Enter on any line to keep the value shown in [brackets].\n');
    cfg.name = await ask('Your full name', cfg.name);
    cfg.rollNo = await ask('Your roll number', /^ENTER/.test(cfg.rollNo) ? '' : cfg.rollNo);
    cfg.section = await ask('Your section', /^ENTER/.test(cfg.section) ? '' : cfg.section);
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    console.log('\n  Saved. Every page and screenshot will now use these details.\n');
  }
  rl.close();
})();
