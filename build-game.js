// Inlines solver.js into game-template.html -> zaidimas.html
import { readFileSync, writeFileSync } from 'node:fs';

const solver = readFileSync(new URL('./solver.js', import.meta.url), 'utf8')
  .replace(/^export (const|function|let) /gm, '$1 ');
const template = readFileSync(new URL('./game-template.html', import.meta.url), 'utf8');
if (!template.includes('__SOLVER__')) throw new Error('template has no __SOLVER__ placeholder');
const out = template.replace('__SOLVER__', () => solver);
writeFileSync(new URL('./zaidimas.html', import.meta.url), out);
console.log(`zaidimas.html written (${(out.length / 1024).toFixed(1)} KB)`);
