import type { ComparisonResult } from './comparison';

/**
 * Optional anonymisation of the image counts shown in the dashboard and report.
 *
 * Photographers may want to share their results publicly without revealing the
 * exact size of their training and test sets - partly for privacy, partly so
 * that AI providers can't single out (and potentially penalise) individuals by
 * the precise numbers they ran. Enabling anonymisation nudges every image count
 * by a small random amount (+/- up to 250 images).
 *
 * Two rules keep the anonymised numbers honest rather than misleading:
 *   1. Consistency - a given training size gets ONE offset applied everywhere,
 *      so the same point lines up across every provider and across the
 *      dashboard and PDF. The shape of each learning curve is preserved.
 *   2. Order - offsets never reorder the training sizes; a larger set always
 *      reads as larger.
 *
 * The offsets are derived deterministically from a per-session seed, so the
 * numbers stay stable across re-renders and between the dashboard and the
 * exported report.
 */

/** FNV-1a hash -> unsigned 32-bit int. Deterministic, no dependencies. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic offset in the inclusive range [-250, +250] for a given key. */
export function offsetFor(key: string, seed: number): number {
  return (hashStr(`${seed}:${key}`) % 501) - 250;
}

/** Generate a fresh seed when the user turns anonymisation on. */
export function newAnonymizeSeed(): number {
  return Math.floor(Math.random() * 1_000_000_000);
}

/**
 * Map each original training-size split (e.g. "2000_train") to an anonymised
 * one (e.g. "2137_train"). The same original always maps to the same result,
 * and the mapping is forced to stay strictly increasing so the order of
 * training sizes can never flip. Non-numeric split names pass through unchanged.
 */
function buildSplitMap(splits: string[], seed: number): Map<string, string> {
  const parsed = splits.map((orig) => {
    const m = /^(\d+)_train$/.exec(orig);
    return { orig, n: m ? parseInt(m[1], 10) : null };
  });
  const numeric = parsed
    .filter((p): p is { orig: string; n: number } => p.n !== null)
    .sort((a, b) => a.n - b.n);

  const map = new Map<string, string>();
  let prev = 0;
  for (const p of numeric) {
    let v = p.n + offsetFor(`train:${p.n}`, seed);
    if (v < 1) v = 1;
    if (v <= prev) v = prev + 1; // never collide or reorder
    prev = v;
    map.set(p.orig, `${v}_train`);
  }
  for (const p of parsed) if (p.n === null) map.set(p.orig, p.orig);
  return map;
}

/**
 * Return a copy of the comparison result with every image count anonymised.
 * Training sizes are rewritten in the split labels (so every downstream chart,
 * table and the PDF pick the change up automatically) and the matched test
 * count is shifted by a single shared offset, keeping the gap between providers
 * intact.
 */
export function anonymizeResult(result: ComparisonResult, seed: number): ComparisonResult {
  const splits = Array.from(new Set(result.summary.map((r) => r.split)));
  const splitMap = buildSplitMap(splits, seed);
  const testDelta = offsetFor('test', seed);
  const mapMatched = (m: number) => Math.max(1, m + testDelta);

  return {
    summary: result.summary.map((r) => ({
      ...r,
      split: splitMap.get(r.split) ?? r.split,
      matched: mapMatched(r.matched),
    })),
    perParam: result.perParam.map((r) => ({
      ...r,
      split: splitMap.get(r.split) ?? r.split,
    })),
  };
}
