export interface Bottle {
  id: string;
  name: string;
  price: number;
}

export interface BottleCombination {
  bottles: Bottle[];
  total: number;
}

export interface CheckinCalculation {
  required: number;            // persone * quota
  best: BottleCombination;     // miglior combinazione entro budget
  upsell: {
    combination: BottleCombination;
    extraTotal: number;        // quanto in più rispetto a required
    extraPerPerson: number;
  } | null;
}

/**
 * Trova la combinazione di bottiglie (ripetizioni permesse) che massimizza
 * il numero di bottiglie servite con totale <= budget. A parità di numero
 * di bottiglie, massimizza il totale (avvicinandosi al budget).
 *
 * Discretizza i prezzi a centesimi per fare DP esatto.
 */
function bestComboUnderBudget(bottles: Bottle[], budget: number): BottleCombination {
  if (bottles.length === 0 || budget <= 0) return { bottles: [], total: 0 };

  const B = Math.round(budget * 100);
  // dp[v] = { count, total, choice (bottle index) } — al massimo "count" bottiglie con totale "total" per spesa esatta v
  // Usiamo unbounded knapsack su capienza B.
  const dpCount = new Int32Array(B + 1);
  const dpTotal = new Int32Array(B + 1);
  const choice = new Int32Array(B + 1).fill(-1);

  const prices = bottles.map((b) => Math.round(b.price * 100));

  for (let v = 1; v <= B; v++) {
    // Inherit best from v-1 (non spendere fino a v)
    dpCount[v] = dpCount[v - 1];
    dpTotal[v] = dpTotal[v - 1];
    choice[v] = -2; // marker "skip"

    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      if (p <= 0 || p > v) continue;
      const c = dpCount[v - p] + 1;
      const t = dpTotal[v - p] + p;
      if (c > dpCount[v] || (c === dpCount[v] && t > dpTotal[v])) {
        dpCount[v] = c;
        dpTotal[v] = t;
        choice[v] = i;
      }
    }
  }

  // Ricostruisci
  const picked: Bottle[] = [];
  let v = B;
  while (v > 0) {
    const ch = choice[v];
    if (ch === -2 || ch === -1) {
      v -= 1;
      continue;
    }
    picked.push(bottles[ch]);
    v -= prices[ch];
  }

  return {
    bottles: picked,
    total: dpTotal[B] / 100,
  };
}

/**
 * Trova la più piccola combinazione (>= best.count + 1 bottiglie) che superi
 * il budget di poco. Restituisce la combo con totale minimo possibile che
 * abbia strettamente più bottiglie.
 */
function smallestComboAboveBudget(
  bottles: Bottle[],
  targetCount: number,
  maxExtra = 200, // €200 di upsell massimo, oltre non ha senso
): BottleCombination | null {
  if (bottles.length === 0) return null;

  // Greedy: prendi targetCount bottiglie partendo dalla più economica.
  // Non ottimale assoluto ma rapido e ragionevole per un upsell.
  const sorted = [...bottles].sort((a, b) => a.price - b.price);
  if (sorted[0].price <= 0) return null;

  const picked: Bottle[] = [];
  let total = 0;
  for (let i = 0; i < targetCount; i++) {
    picked.push(sorted[0]);
    total += sorted[0].price;
  }
  if (total > maxExtra * 1000) return null;
  return { bottles: picked, total };
}

export function calculateCheckin(
  peopleCount: number,
  minPerPerson: number,
  bottles: Bottle[],
): CheckinCalculation {
  const required = +(peopleCount * minPerPerson).toFixed(2);
  const best = bestComboUnderBudget(bottles, required);

  // Cerca upsell: una bottiglia in più
  let upsell: CheckinCalculation["upsell"] = null;
  if (bottles.length > 0) {
    const targetCount = best.bottles.length + 1;
    const candidate = smallestComboAboveBudget(bottles, targetCount);
    if (candidate && candidate.total > required) {
      const extraTotal = +(candidate.total - required).toFixed(2);
      // Mostra upsell solo se "piccolo" (<=30% in più rispetto al required, o <=50€ assoluti)
      if (extraTotal <= Math.max(50, required * 0.3)) {
        upsell = {
          combination: candidate,
          extraTotal,
          extraPerPerson: +(extraTotal / Math.max(1, peopleCount)).toFixed(2),
        };
      }
    }
  }

  return { required, best, upsell };
}
