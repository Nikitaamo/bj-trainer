// Sanity checks for solver.js
//  1. dealer probabilities vs. published infinite-deck S17 values
//  2. dealer probabilities sum to 1 for a 6-deck shoe
//  3. US (peek, S17, DAS, 6 decks) table vs. the well-known published table
import { dealerTerminals, dealerProbs, fullShoe, buildStrategy, UPCARDS } from './solver.js';

let failures = 0;
const check = (ok, msg) => { if (!ok) { failures++; console.log('FAIL', msg); } };

// --- 1. infinite deck dealer probabilities (S17), unconditional -------------
// columns: 17 18 19 20 21 BJ bust  (Wizard of Odds)
const REF = {
  2: [.1398, .1349, .1297, .1240, .1180, 0, .3536],
  3: [.1350, .1305, .1256, .1203, .1147, 0, .3739],
  4: [.1305, .1259, .1214, .1165, .1112, 0, .3945],
  5: [.1223, .1223, .1177, .1131, .1082, 0, .4164],
  6: [.1654, .1063, .1063, .1017, .0972, 0, .4232],
  7: [.3686, .1378, .0786, .0786, .0741, 0, .2623],
  8: [.1286, .3593, .1286, .0694, .0694, 0, .2447],
  9: [.1200, .1200, .3508, .1200, .0608, 0, .2284],
  10: [.1114, .1114, .1114, .3422, .0345, .0769, .2121],
  1: [.1308, .1308, .1308, .1308, .0539, .3077, .1153],
};
console.log('--- dealer probabilities, ~infinite deck, S17 ---');
for (const up of UPCARDS) {
  const t0 = Date.now();
  const terms = dealerTerminals(up, false);
  const D = dealerProbs(terms, fullShoe(100000));
  const ref = REF[up + 1];
  const maxErr = Math.max(...ref.map((v, i) => Math.abs(v - D[i])));
  const sum = D.reduce((a, b) => a + b, 0);
  console.log(`up ${String(up + 1).padStart(2)}: terminals=${terms.list.length} ` +
    Array.from(D).map(x => x.toFixed(4)).join(' ') + `  sum=${sum.toFixed(6)} maxErr=${maxErr.toFixed(4)} (${Date.now() - t0}ms)`);
  check(maxErr < 0.0015, `dealer probs up ${up + 1}`);
  check(Math.abs(sum - 1) < 1e-9, `dealer probs sum up ${up + 1}`);
}

// --- 2. finite shoe sums --------------------------------------------------
for (const up of UPCARDS) {
  const D = dealerProbs(dealerTerminals(up, false), fullShoe(6));
  const sum = D.reduce((a, b) => a + b, 0);
  check(Math.abs(sum - 1) < 1e-9, `6-deck sum up ${up + 1} = ${sum}`);
  const DH = dealerProbs(dealerTerminals(up, true), fullShoe(6));
  const sumH = DH.reduce((a, b) => a + b, 0);
  check(Math.abs(sumH - 1) < 1e-9, `6-deck H17 sum up ${up + 1} = ${sumH}`);
}

// --- 3. US table (peek) ---------------------------------------------------
const US = {
  hard: {
    4: 'H H H H H H H H H H', 5: 'H H H H H H H H H H', 6: 'H H H H H H H H H H',
    7: 'H H H H H H H H H H', 8: 'H H H H H H H H H H',
    9: 'H D D D D H H H H H',
    10: 'D D D D D D D D H H',
    11: 'D D D D D D D D D H',
    12: 'H H S S S H H H H H',
    13: 'S S S S S H H H H H', 14: 'S S S S S H H H H H',
    15: 'S S S S S H H H H H', 16: 'S S S S S H H H H H',
    17: 'S S S S S S S S S S', 18: 'S S S S S S S S S S',
    19: 'S S S S S S S S S S', 20: 'S S S S S S S S S S',
  },
  soft: {
    2: 'H H H D D H H H H H', 3: 'H H H D D H H H H H',
    4: 'H H D D D H H H H H', 5: 'H H D D D H H H H H',
    6: 'H D D D D H H H H H',
    7: 'S Ds Ds Ds Ds S S H H H',
    8: 'S S S S S S S S S S', 9: 'S S S S S S S S S S',
  },
  pairs: {
    1: 'P P P P P P P P P P',
    2: 'P P P P P P H H H H', 3: 'P P P P P P H H H H',
    4: 'H H H P P H H H H H',
    5: 'D D D D D D D D H H',
    6: 'P P P P P H H H H H',
    7: 'P P P P P P H H H H',
    8: 'P P P P P P P P P P',
    9: 'P P P P P S P P S S',
    10: 'S S S S S S S S S S',
  },
};

console.log('\n--- building US (peek) 6D S17 DAS table ---');
let t0 = Date.now();
const us = buildStrategy({ decks: 6, dealerHitsSoft17: false, dealerBJ: 'original', das: true, doubleOn: 'any' });
console.log(`built in ${Date.now() - t0}ms`);

function compare(section, table, ref) {
  for (const row of Object.keys(ref)) {
    const got = table[row].map(c => c.action).join(' ');
    if (got !== ref[row]) {
      failures++;
      console.log(`DIFF ${section} ${row}:\n   got ${got}\n   ref ${ref[row]}`);
      table[row].forEach((c, i) => {
        const g = c.action, r = ref[row].split(' ')[i];
        if (g !== r) console.log(`      up ${us.upcards[i]}: got ${g} ref ${r}  evs=` +
          Object.entries(c.evs).map(([k, v]) => `${k}=${v.toFixed(4)}`).join(' '));
      });
    }
  }
}
compare('hard', us.hard, US.hard);
compare('soft', us.soft, US.soft);
compare('pairs', us.pairs, US.pairs);

// --- 4. US late surrender (6D S17) --------------------------------------
console.log('\n--- US late surrender checks ---');
const usR = buildStrategy({ decks: 6, dealerHitsSoft17: false, dealerBJ: 'original', das: true, doubleOn: 'any', surrender: 'late', surrenderVsAce: true });
const upI = (u) => usR.upcards.indexOf(u);
const expectR = [
  ['hard', 16, '9', 'Rh'], ['hard', 16, '10', 'Rh'], ['hard', 16, 'A', 'Rh'],
  ['hard', 15, '10', 'Rh'], ['hard', 15, '9', 'H'], ['hard', 15, 'A', 'H'],
  ['hard', 14, '10', 'H'], ['hard', 17, 'A', 'S'], ['pairs', 8, 'A', 'P'], ['pairs', 8, '10', 'P'],
];
for (const [sec, row, up, want] of expectR) {
  const got = usR[sec][row][upI(up)].action;
  console.log(`  ${sec} ${row} vs ${up}: ${got} (expected ${want})`);
  check(got === want, `surrender ${sec} ${row} vs ${up}`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
