// Inlines solver.js and the strategy-table letters into game-template.html -> zaidimas.html
import { readFileSync, writeFileSync } from 'node:fs';

const solver = readFileSync(new URL('./solver.js', import.meta.url), 'utf8')
  .replace(/^export (const|function|let) /gm, '$1 ');

// compact strategy table for the in-game menu: one letter per cell
const strat = JSON.parse(readFileSync(new URL('./strategy.json', import.meta.url), 'utf8'));
const letters = (rows, min = 0) => Object.fromEntries(
  Object.entries(rows).filter(([k]) => +k >= min).map(([k, cells]) => [k, cells.map(c => c.action)]));
const table = {
  up: strat.upcards,
  hard: letters(strat.hard, 5),
  soft: letters(strat.soft),
  pairs: letters(strat.pairs),
};

const template = readFileSync(new URL('./game-template.html', import.meta.url), 'utf8');
for (const ph of ['__SOLVER__', '__TABLE__']) {
  if (!template.includes(ph)) throw new Error(`template has no ${ph} placeholder`);
}
const out = template
  .replace('__SOLVER__', () => solver)
  .replace('__TABLE__', () => JSON.stringify(table));
writeFileSync(new URL('./zaidimas.html', import.meta.url), out);
console.log(`zaidimas.html written (${(out.length / 1024).toFixed(1)} KB)`);
