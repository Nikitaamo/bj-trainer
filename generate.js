// Builds the strategy for European Black Jack (no hole card) rules, writes strategy.json and
// prints the tables + differences from the US (peek) table.
import { writeFileSync } from 'node:fs';
import { buildStrategy } from './solver.js';

export const EUROPEAN_RULES = {
  decks: 6,
  dealerHitsSoft17: false,   // dealer stands on soft 17
  dealerBJ: 'all',           // no hole card: dealer BJ takes doubles and splits too
  das: true,                 // double after split allowed (not after split aces)
  doubleOn: 'any',           // double on any first two cards
  maxSplitHands: 4,          // split up to 3 times
  resplitAces: false,        // aces: split once
  hitSplitAces: false,       // one card per split ace
  surrender: 'early',        // first two cards, half the bet back, dealer BJ changes nothing
  surrenderVsAce: false,     // not allowed against a dealer ace
  bjPays: 1.5,
};

const t0 = Date.now();
const strat = buildStrategy(EUROPEAN_RULES);
// standard US game for comparison: dealer peeks, late surrender against any card
const us = buildStrategy({ ...EUROPEAN_RULES, dealerBJ: 'original', surrender: 'late', surrenderVsAce: true });
console.log(`solved in ${Date.now() - t0}ms\n`);

const header = '        ' + strat.upcards.map(u => u.padStart(3)).join(' ');
function dump(title, table, labelFn) {
  console.log(title);
  console.log(header);
  for (const row of Object.keys(table)) {
    console.log(labelFn(row).padEnd(8) + table[row].map(c => c.action.padStart(3)).join(' '));
  }
  console.log();
}
dump('HARD', strat.hard, r => 'H' + r);
dump('SOFT', strat.soft, r => 'A,' + r);
dump('PAIRS', strat.pairs, r => (r === '1' ? 'A,A' : `${r},${r}`));

// differences vs. US peek table
const diffs = [];
for (const section of ['hard', 'soft', 'pairs']) {
  for (const row of Object.keys(strat[section])) {
    strat[section][row].forEach((cell, i) => {
      const usCell = us[section][row][i];
      if (cell.action !== usCell.action) {
        diffs.push({ section, row, up: strat.upcards[i], euro: cell.action, us: usCell.action, evs: cell.evs });
      }
    });
  }
}
console.log('Differences from the US (peek) table:');
for (const d of diffs) {
  console.log(`  ${d.section} ${d.row} vs ${d.up}: Euro=${d.euro} US=${d.us}  ` +
    Object.entries(d.evs).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(' '));
}

// close calls (best action beats runner-up by < 0.01)
console.log('\nClose calls (margin < 0.01):');
for (const section of ['hard', 'soft', 'pairs']) {
  for (const row of Object.keys(strat[section])) {
    strat[section][row].forEach((cell, i) => {
      const vals = Object.entries(cell.evs).sort((a, b) => b[1] - a[1]);
      const margin = vals[0][1] - vals[1][1];
      if (margin < 0.01) {
        console.log(`  ${section} ${row} vs ${strat.upcards[i]}: ${cell.action}  ` +
          vals.map(([k, v]) => `${k}=${v.toFixed(4)}`).join(' ') + `  margin=${margin.toFixed(4)}`);
      }
    });
  }
}

writeFileSync(new URL('./strategy.json', import.meta.url), JSON.stringify({ ...strat, diffsFromUS: diffs }, null, 1));
console.log('\nwrote strategy.json');
