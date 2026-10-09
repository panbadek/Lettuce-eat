// Shared between the browser and the server.
// Conversion: 1 small Żabka hot dog = 4 toast halves = 3 medium-pizza slices.

export const UNITS = {
  toast: {
    label: 'połówki tosta',
    short: 'połówek tosta',
    emoji: '🥪',
    perHotdog: 4,
  },
  hotdog: {
    label: 'małe hot dogi z Żabki',
    short: 'hot dogów',
    emoji: '🌭',
    perHotdog: 1,
  },
  pizza: {
    label: 'kawałki średniej pizzy',
    short: 'kawałków pizzy',
    emoji: '🍕',
    perHotdog: 3,
  },
};

export const UNIT_KEYS = Object.keys(UNITS);

export const MAX_AMOUNT = 100;

export function round1(x) {
  return Math.round(x * 10) / 10;
}

/** Accepts "2,5", "2.5", " 3 " etc. Returns a number rounded to 1 decimal or NaN. */
export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round1(value) : NaN;
  if (typeof value !== 'string') return NaN;
  const s = value.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return round1(Number(s));
}

/** Converts `amount` of `unit` into all three units (unrounded). */
export function convert(amount, unit) {
  const hotdogs = amount / UNITS[unit].perHotdog;
  const out = {};
  for (const key of UNIT_KEYS) out[key] = hotdogs * UNITS[key].perHotdog;
  return out;
}

/** Sums entries [{amount, unit}] into all three units (unrounded). */
export function totals(entries) {
  const sum = { toast: 0, hotdog: 0, pizza: 0 };
  for (const e of entries) {
    const c = convert(e.amount, e.unit);
    for (const key of UNIT_KEYS) sum[key] += c[key];
  }
  return sum;
}

export function formatAmount(x) {
  return round1(x).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}
