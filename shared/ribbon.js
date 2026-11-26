// Puts the student's name on every page (read from student.config.json).
(async () => {
  try {
    const c = await (await fetch('/student.config.json')).json();
    c.initials = c.name.split(/\s+/).map(w => w[0]).join('').toUpperCase();
    document.querySelectorAll('[data-student]').forEach(e => { e.textContent = c[e.dataset.student] || ''; });
    const bar = document.createElement('div');
    bar.id = 'labRibbon';
    bar.textContent = `${c.name}  |  Roll No: ${c.rollNo}  |  Section: ${c.section}  |  ${c.course}  |  Experiment ${document.body.dataset.exp || ''}`;
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111827;color:#fff;font:600 13px/1 "Segoe UI",Arial,sans-serif;padding:12px 10px;text-align:center;letter-spacing:.2px';
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '40px';
    document.title = document.title.replace(/ \|.*$/, '') + ' | ' + c.name;
  } catch (e) { console.warn('ribbon.js:', e); }
})();
