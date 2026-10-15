'use strict';

/** Syntax-checks every server file and refuses TypeScript in the backend. */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})(root);

const ts = files.filter((f) => /\.tsx?$/.test(f));
if (ts.length) {
  console.error('TypeScript files are not allowed in the backend:\n' + ts.join('\n'));
  process.exit(1);
}
const js = files.filter((f) => f.endsWith('.js'));
for (const f of js) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`✓ ${js.length} backend files OK (plain JavaScript)`);
