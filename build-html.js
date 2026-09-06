// Injects strategy.json into template.html -> strategija.html
import { readFileSync, writeFileSync } from 'node:fs';
import { bestAction, actionLabel } from './solver.js';

const strat = JSON.parse(readFileSync(new URL('./strategy.json', import.meta.url), 'utf8'));
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const roundEvs = (evs) => Object.fromEntries(Object.entries(evs).map(([k, v]) => [k, r4(v)]));

const data = { up: strat.upcards, hard: {}, soft: {}, pairs: {}, diffs: [], close: [] };

for (const [t, cells] of Object.entries(strat.hard)) {
  data.hard[t] = cells.map(c => ({
    a: c.action,
    ev: roundEvs(c.evs),
    comps: c.comps.map(k => ({ cards: k.cards, a: actionLabel(k.evs), best: r4(k.evs[bestAction(k.evs)]) })),
  }));
}
for (const [v, cells] of Object.entries(strat.soft)) {
  data.soft[v] = cells.map(c => ({ a: c.action, ev: roundEvs(c.evs) }));
}
for (const [v, cells] of Object.entries(strat.pairs)) {
  data.pairs[v] = cells.map(c => ({ a: c.action, na: c.noSplitAction, ev: roundEvs(c.evs) }));
}
data.diffs = strat.diffsFromUS.map(d => ({ ...d, evs: roundEvs(d.evs) }));

for (const section of ['hard', 'soft', 'pairs']) {
  for (const [row, cells] of Object.entries(strat[section])) {
    if (section === 'hard' && +row < 5) continue;
    cells.forEach((cell, i) => {
      const vals = Object.entries(cell.evs).sort((a, b) => b[1] - a[1]);
      const margin = vals[0][1] - vals[1][1];
      if (margin < 0.01) data.close.push({ section, row, up: strat.upcards[i], a: cell.action, second: vals[1][0], margin: r4(margin) });
    });
  }
}

const template = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
writeFileSync(new URL('./strategija.html', import.meta.url), template.replace('__DATA__', json));
console.log(`strategija.html written (${(json.length / 1024).toFixed(1)} KB of data, ${data.close.length} close calls, ${data.diffs.length} diffs)`);
