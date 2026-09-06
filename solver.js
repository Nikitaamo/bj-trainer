// Blackjack expected-value solver (composition-dependent, exact dealer
// probabilities for a finite shoe). Works in Node and in the browser.
//
// Card ranks are indexes 0..9 -> values 1 (Ace), 2, 3, ..., 9, 10 (all
// ten-valued cards are merged into index 9).

export const ACE = 0;
export const TEN = 9;

// Dealer outcome indexes
export const OUT_17 = 0; // 0..4 -> 17..21
export const OUT_BJ = 5;
export const OUT_BUST = 6;

export const DEFAULT_RULES = {
  decks: 6,
  dealerHitsSoft17: false,
  // 'all'      = no hole card, dealer blackjack takes every bet (doubles and splits included)
  // 'original' = only the original bet is lost to a dealer blackjack (US peek / OBO)
  dealerBJ: 'all',
  das: true,                 // double after split
  doubleOn: 'any',           // 'any' | 'hard9-11' | 'hard10-11'
  maxSplitHands: 4,          // 4 hands = split up to 3 times
  resplitAces: false,
  hitSplitAces: false,
  // 'none'  = no surrender
  // 'early' = half the bet is returned at once, a later dealer blackjack changes nothing
  // 'late'  = surrender stands only if the dealer does not make blackjack
  surrender: 'none',
  surrenderVsAce: true,      // may the player surrender against a dealer ace
  bjPays: 1.5,
};

export function fullShoe(decks) {
  const s = new Array(10).fill(4 * decks);
  s[TEN] = 16 * decks;
  return s;
}

export function handInfo(counts) {
  let hard = 0, n = 0;
  for (let r = 0; r < 10; r++) { hard += counts[r] * (r + 1); n += counts[r]; }
  const soft = counts[ACE] > 0 && hard + 10 <= 21;
  return { hard, total: soft ? hard + 10 : hard, soft, n };
}

export function countsFromValues(values) {
  const c = new Array(10).fill(0);
  for (const v of values) c[Math.min(v, 10) - 1]++;
  return c;
}

// ---------------------------------------------------------------------------
// Dealer: enumerate every multiset of drawn cards that ends the dealer's hand,
// together with the number of card orders that reach it without stopping
// early. Probability of a given order depends only on the multiset, so
// P(outcome) = sum over terminals of count * prod_r ff(shoe_r, m_r) / ff(N, k).
// ---------------------------------------------------------------------------
const terminalCache = new Map();

export function dealerTerminals(upIdx, hitsSoft17) {
  const cacheKey = upIdx + ':' + (hitsSoft17 ? 'H17' : 'S17');
  if (terminalCache.has(cacheKey)) return terminalCache.get(cacheKey);

  const map = new Map();
  const m = new Uint8Array(10);
  const record = (k, outcome) => {
    const key = m.join(',');
    let t = map.get(key);
    if (!t) { t = { m: Array.from(m), k, outcome, count: 0 }; map.set(key, t); }
    t.count++;
  };
  const dfs = (hard, hasAce, k) => {
    for (let r = 0; r < 10; r++) {
      m[r]++;
      const h2 = hard + r + 1, a2 = hasAce || r === ACE, k2 = k + 1;
      if (h2 > 21) {
        record(k2, OUT_BUST);
      } else {
        const soft = a2 && h2 + 10 <= 21;
        const t = soft ? h2 + 10 : h2;
        if (t >= 17 && !(hitsSoft17 && soft && t === 17)) {
          record(k2, (k2 === 1 && t === 21) ? OUT_BJ : t - 17);
        } else {
          dfs(h2, a2, k2);
        }
      }
      m[r]--;
    }
  };
  dfs(upIdx + 1, upIdx === ACE, 0);

  let maxMult = 0, maxK = 0;
  const list = [...map.values()].map(t => {
    const pairs = [];
    t.m.forEach((c, r) => { if (c > 0) { pairs.push(r, c); if (c > maxMult) maxMult = c; } });
    if (t.k > maxK) maxK = t.k;
    return { pairs, k: t.k, outcome: t.outcome, count: t.count };
  });
  const result = { list, maxMult, maxK };
  terminalCache.set(cacheKey, result);
  return result;
}

export function dealerProbs(terminals, shoe) {
  const { list, maxMult, maxK } = terminals;
  let N = 0;
  for (let r = 0; r < 10; r++) N += shoe[r];

  // falling factorials per rank
  const ff = new Array(10);
  for (let r = 0; r < 10; r++) {
    const a = new Float64Array(maxMult + 1);
    a[0] = 1;
    for (let c = 1; c <= maxMult; c++) a[c] = a[c - 1] * Math.max(0, shoe[r] - c + 1);
    ff[r] = a;
  }
  const invDen = new Float64Array(maxK + 1);
  let den = 1;
  invDen[0] = 1;
  for (let k = 1; k <= maxK; k++) { den *= (N - k + 1); invDen[k] = 1 / den; }

  const out = new Float64Array(7);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const p = t.pairs;
    let prob = t.count;
    for (let j = 0; j < p.length; j += 2) {
      prob *= ff[p[j]][p[j + 1]];
      if (prob === 0) break;
    }
    if (prob !== 0) out[t.outcome] += prob * invDen[t.k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Player analysis for one dealer up-card. All EVs are in units of the bet on
// the hand being evaluated.
// ---------------------------------------------------------------------------
export function createContext(rules, upIdx) {
  rules = { ...DEFAULT_RULES, ...rules };
  const terminals = dealerTerminals(upIdx, rules.dealerHitsSoft17);
  const S0 = fullShoe(rules.decks);
  S0[upIdx]--;

  const dealerMemo = new Map();
  const standMemo = new Map();
  const hitMemo = new Map();

  const ZERO = new Array(10).fill(0);
  const keyOf = (hand, extra) => {
    let k = '';
    for (let r = 0; r < 10; r++) k += (hand[r] + extra[r]) + ',';
    return k;
  };
  const handKey = (hand, extra) => hand.join(',') + '|' + extra.join(',');

  function shoeFor(hand, extra) {
    const s = new Array(10);
    let N = 0;
    for (let r = 0; r < 10; r++) { s[r] = S0[r] - hand[r] - extra[r]; N += s[r]; }
    return { s, N };
  }

  // raw dealer distribution (includes blackjack as its own outcome)
  function dealerRaw(hand, extra) {
    const key = keyOf(hand, extra);
    let D = dealerMemo.get(key);
    if (!D) {
      const { s } = shoeFor(hand, extra);
      D = dealerProbs(terminals, s);
      if (rules.dealerBJ === 'original') {
        // play is conditional on "no dealer blackjack"; BJ handled at top level
        const p = D[OUT_BJ];
        const C = new Float64Array(7);
        for (let o = 0; o < 7; o++) C[o] = D[o] / (1 - p);
        C[OUT_BJ] = 0;
        C.pBJ = p;
        D = C;
      }
      dealerMemo.set(key, D);
    }
    return D;
  }

  function standEV(hand, extra = ZERO) {
    const info = handInfo(hand);
    if (info.hard > 21) return -1;
    const key = handKey(hand, extra);
    let ev = standMemo.get(key);
    if (ev !== undefined) return ev;
    const D = dealerRaw(hand, extra);
    ev = D[OUT_BUST] - D[OUT_BJ];
    for (let o = 0; o < 5; o++) {
      const dt = 17 + o;
      ev += D[o] * (info.total > dt ? 1 : info.total < dt ? -1 : 0);
    }
    standMemo.set(key, ev);
    return ev;
  }

  // best of stand/hit for a hand that can no longer double or split
  function bestPlay(hand, extra = ZERO) {
    const info = handInfo(hand);
    if (info.hard > 21) return -1;
    const s = standEV(hand, extra);
    if (info.total === 21) return s;
    return Math.max(s, hitEV(hand, extra));
  }

  function hitEV(hand, extra = ZERO) {
    const key = handKey(hand, extra);
    let ev = hitMemo.get(key);
    if (ev !== undefined) return ev;
    const { s, N } = shoeFor(hand, extra);
    ev = 0;
    for (let r = 0; r < 10; r++) {
      if (s[r] <= 0) continue;
      const h = hand.slice();
      h[r]++;
      ev += (s[r] / N) * bestPlay(h, extra);
    }
    hitMemo.set(key, ev);
    return ev;
  }

  function doubleAllowed(hand) {
    const info = handInfo(hand);
    if (info.n !== 2) return false;
    switch (rules.doubleOn) {
      case 'hard9-11': return !info.soft && info.hard >= 9 && info.hard <= 11;
      case 'hard10-11': return !info.soft && info.hard >= 10 && info.hard <= 11;
      default: return true;
    }
  }

  function surrenderAllowed() {
    return rules.surrender !== 'none' && (rules.surrenderVsAce || upIdx !== ACE);
  }

  // EV of giving up half the bet (first two cards only)
  function surrenderEV(hand, extra = ZERO) {
    if (rules.dealerBJ === 'original') {
      // play EVs are conditional on "no dealer BJ"; make the total come out right
      const p = dealerRaw(hand, extra).pBJ;
      return rules.surrender === 'early' ? (p - 0.5) / (1 - p) : -0.5;
    }
    if (rules.surrender === 'early') return -0.5;
    const p = dealerRaw(hand, extra)[OUT_BJ];
    return -0.5 * (1 - p) - p;
  }

  function doubleEV(hand, extra = ZERO) {
    const { s, N } = shoeFor(hand, extra);
    let ev = 0;
    for (let r = 0; r < 10; r++) {
      if (s[r] <= 0) continue;
      const h = hand.slice();
      h[r]++;
      ev += (s[r] / N) * standEV(h, extra);
    }
    return 2 * ev;
  }

  // EV of splitting a pair of rank x (in units of the original bet).
  // Each hand is played with the other split card removed from the shoe.
  // Re-splits are approximated per hand with the hand-count cap.
  // opts.extra  = other cards known to be out of the shoe (e.g. other hands)
  // opts.nHands = hands on the table before this split (default 1)
  function splitEV(x, opts = {}) {
    const extra1 = (opts.extra || ZERO).slice();
    extra1[x] += 1;
    const startHands = (opts.nHands || 1) + 1;
    const memo = new Map();
    const splitHand = (nHands) => {
      if (memo.has(nHands)) return memo.get(nHands);
      const hand0 = ZERO.slice();
      hand0[x] = 1;
      const { s, N } = shoeFor(hand0, extra1);
      let ev = 0;
      for (let r = 0; r < 10; r++) {
        if (s[r] <= 0) continue;
        const h = hand0.slice();
        h[r]++;
        let v;
        if (x === ACE) {
          if (r === ACE && rules.resplitAces && nHands < rules.maxSplitHands) {
            v = Math.max(standEV(h, extra1), 2 * splitHand(nHands + 1));
          } else {
            v = rules.hitSplitAces ? bestPlay(h, extra1) : standEV(h, extra1);
          }
        } else {
          v = Math.max(standEV(h, extra1), hitEV(h, extra1));
          if (rules.das && doubleAllowed(h)) v = Math.max(v, doubleEV(h, extra1));
          if (r === x && nHands < rules.maxSplitHands) v = Math.max(v, 2 * splitHand(nHands + 1));
        }
        ev += (s[r] / N) * v;
      }
      memo.set(nHands, ev);
      return ev;
    };
    return 2 * splitHand(startHands);
  }

  // Full option list for a hand that is still in its initial state
  // (two cards, no split yet). Returns EVs keyed by action.
  function initial(a, b) {
    const hand = ZERO.slice();
    hand[a]++; hand[b]++;
    const res = { stand: standEV(hand), hit: hitEV(hand) };
    if (doubleAllowed(hand)) res.double = doubleEV(hand);
    if (a === b) res.split = splitEV(a);
    if (surrenderAllowed()) res.surrender = surrenderEV(hand);
    if (rules.dealerBJ === 'original') {
      const p = dealerRaw(hand, ZERO).pBJ;
      for (const k of Object.keys(res)) res[k] = -p + (1 - p) * res[k];
    }
    return res;
  }

  // EVs for an arbitrary in-play hand (multi-card allowed). The caller decides
  // which actions the table rules allow right now. `opts`:
  //   extra       counts of other cards out of the shoe (other hands)
  //   canDouble   doubling is allowed for this hand (2 cards, not split aces)
  //   canSplit    splitting is allowed (pair, hand cap, aces only once)
  //   isSplitAces hand is one card of split aces (stand only)
  //   nHands      hands on the table right now (for the re-split cap)
  //   canSurrender surrender is allowed for this hand (initial two cards)
  function evaluate(handCounts, opts = {}) {
    const info = handInfo(handCounts);
    const extra = opts.extra || ZERO;
    if (info.hard > 21) return { bust: true };
    const res = { stand: standEV(handCounts, extra) };
    if (!opts.isSplitAces || rules.hitSplitAces) res.hit = hitEV(handCounts, extra);
    if (opts.canDouble && !opts.isSplitAces && doubleAllowed(handCounts)) res.double = doubleEV(handCounts, extra);
    if (opts.canSplit && info.n === 2) {
      const x = handCounts.findIndex(c => c === 2);
      if (x >= 0) res.split = splitEV(x, { extra, nHands: opts.nHands || 1 });
    }
    if (opts.canSurrender && info.n === 2 && surrenderAllowed()) res.surrender = surrenderEV(handCounts, extra);
    if (rules.dealerBJ === 'original') {
      const p = dealerRaw(handCounts, extra).pBJ;
      for (const k of Object.keys(res)) res[k] = -p + (1 - p) * res[k];
    }
    return res;
  }

  return { rules, upIdx, S0, standEV, hitEV, doubleEV, splitEV, surrenderEV, surrenderAllowed, initial, evaluate, dealerRaw, doubleAllowed };
}

// ---------------------------------------------------------------------------
// Total-dependent basic strategy table
// ---------------------------------------------------------------------------
export const UPCARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; // indexes for 2..10, A
export const UPCARD_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];

export const ACTIONS = ['stand', 'hit', 'double', 'split', 'surrender'];

export function bestAction(evs) {
  let best = null;
  for (const k of ACTIONS) {
    if (evs[k] !== undefined && (best === null || evs[k] > evs[best])) best = k;
  }
  return best;
}

// H, S, D (double else hit), Ds (double else stand), P (split),
// Rh / Rs (surrender, else hit / stand)
export function actionLabel(evs) {
  const best = bestAction(evs);
  if (best === 'surrender') return evs.stand > evs.hit ? 'Rs' : 'Rh';
  if (best === 'split') return 'P';
  if (best === 'double') return evs.stand > evs.hit ? 'Ds' : 'D';
  return best === 'stand' ? 'S' : 'H';
}

export function buildStrategy(rulesIn) {
  const rules = { ...DEFAULT_RULES, ...rulesIn };
  const hard = {};   // total -> cells[]
  const soft = {};   // second card value -> cells[]
  const pairs = {};  // rank value -> cells[]
  for (let t = 4; t <= 20; t++) hard[t] = [];
  for (let v = 2; v <= 9; v++) soft[v] = [];
  for (let v = 1; v <= 10; v++) pairs[v] = [];

  for (const up of UPCARDS) {
    const ctx = createContext(rules, up);
    const S0 = ctx.S0;

    // hard totals from two non-ace cards, weighted by dealing probability
    for (let t = 4; t <= 20; t++) {
      const comps = [];
      for (let a = 1; a <= 9; a++) {
        const b = t - (a + 1) - 1; // index of second card
        if (b < a || b > 9) continue;
        const w = a === b ? S0[a] * (S0[a] - 1) / 2 : S0[a] * S0[b];
        comps.push({ a, b, w, pair: a === b });
      }
      const nonPair = comps.filter(c => !c.pair);
      const use = nonPair.length ? nonPair : comps;
      const acc = {}, present = {};
      let W = 0;
      const byComp = [];
      for (const c of use) {
        const evs = ctx.initial(c.a, c.b);
        byComp.push({ cards: [c.a + 1, c.b + 1], w: c.w, evs });
        for (const k of ACTIONS) {
          if (k === 'split') continue; // hard-total rows are played as non-split hands
          if (evs[k] === undefined) { present[k] = false; continue; }
          if (present[k] === undefined) present[k] = true;
          acc[k] = (acc[k] || 0) + c.w * evs[k];
        }
        W += c.w;
      }
      const evs = {};
      for (const k of ACTIONS) if (present[k]) evs[k] = acc[k] / W;
      hard[t].push({ action: actionLabel(evs), evs, comps: byComp });
    }

    // soft hands A + v
    for (let v = 2; v <= 9; v++) {
      const evs = ctx.initial(ACE, v - 1);
      soft[v].push({ action: actionLabel(evs), evs });
    }

    // pairs
    for (let v = 1; v <= 10; v++) {
      const evs = ctx.initial(v - 1, v - 1);
      const { split, ...rest } = evs;
      pairs[v].push({ action: actionLabel(evs), noSplitAction: actionLabel(rest), evs });
    }
  }
  return { rules, upcards: UPCARD_LABELS, hard, soft, pairs };
}
