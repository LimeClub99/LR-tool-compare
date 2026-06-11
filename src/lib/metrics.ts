import {
  PARAMETER_RANGES,
  TARGET_PARAMETERS,
  TargetParam,
} from './config';
import type { DevelopSettings } from './catalog';

export interface MetricResult {
  overall: number; // 0-100% (higher is better, after display transform)
  perParam: Partial<Record<TargetParam, number>>;
}

export interface AlignedArrays {
  pred: Record<TargetParam, number[]>;
  truth: Record<TargetParam, number[]>;
  matchedIds: number[];
  /**
   * Per-row flag: true where the provider actually produced an edit. Rows that
   * are false are images the provider left untouched - they still count as test
   * images (the photographer has to edit them by hand), so they are scored as a
   * miss rather than dropped. This stops a tool from flattering itself by
   * declining the hard photos.
   */
  present: boolean[];
}

export function alignArrays(
  truth: Map<number, DevelopSettings>,
  pred: Map<number, DevelopSettings>,
): AlignedArrays {
  // Score over EVERY test image we have a ground truth for, not just the ones
  // the provider chose to edit.
  const ids = Array.from(truth.keys()).sort((a, b) => a - b);
  const present = ids.map((id) => pred.has(id));
  const matchedIds = ids.filter((id) => pred.has(id));

  const p = {} as Record<TargetParam, number[]>;
  const t = {} as Record<TargetParam, number[]>;
  for (const param of TARGET_PARAMETERS) {
    p[param] = new Array(ids.length);
    t[param] = new Array(ids.length);
  }
  for (let i = 0; i < ids.length; i++) {
    const ps = pred.get(ids[i]);
    const ts = truth.get(ids[i])!;
    for (const param of TARGET_PARAMETERS) {
      // A missing edit becomes an infinite error: it fails every tolerance
      // check below, so it lands as a miss in pwt and Hands-Free Rate without
      // any special-casing in those metrics.
      p[param][i] = ps ? ps[param] : Infinity;
      t[param][i] = ts[param];
    }
  }
  return { pred: p, truth: t, matchedIds, present };
}

function normalizedErrors(
  pred: Record<TargetParam, number[]>,
  truth: Record<TargetParam, number[]>,
  paramFilter: ReadonlySet<TargetParam>,
): Partial<Record<TargetParam, number[]>> {
  const out: Partial<Record<TargetParam, number[]>> = {};
  for (const p of TARGET_PARAMETERS) {
    if (!paramFilter.has(p)) continue;
    const [lo, hi] = PARAMETER_RANGES[p];
    const range = hi - lo;
    const a = pred[p];
    const b = truth[p];
    const e = new Array<number>(a.length);
    for (let i = 0; i < a.length; i++) e[i] = Math.abs(a[i] - b[i]) / range;
    out[p] = e;
  }
  return out;
}

export function pwt(
  pred: Record<TargetParam, number[]>,
  truth: Record<TargetParam, number[]>,
  thresholds: Record<TargetParam, number>,
  paramFilter: ReadonlySet<TargetParam>,
): MetricResult {
  const errs = normalizedErrors(pred, truth, paramFilter);
  const perParam: Partial<Record<TargetParam, number>> = {};
  const scores: number[] = [];
  for (const p of TARGET_PARAMETERS) {
    const e = errs[p];
    if (!e) continue;
    const t = thresholds[p];
    let within = 0;
    for (const v of e) if (v <= t) within++;
    const score = (within / e.length) * 100;
    perParam[p] = score;
    scores.push(score);
  }
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return { overall, perParam };
}

export function hir(
  pred: Record<TargetParam, number[]>,
  truth: Record<TargetParam, number[]>,
  thresholds: Record<TargetParam, number>,
  paramFilter: ReadonlySet<TargetParam>,
): MetricResult {
  // Returns Hands-Free Rate (display): 100 - intervention rate.
  const errs = normalizedErrors(pred, truth, paramFilter);
  const keys = (Object.keys(errs) as TargetParam[]).filter((k) => errs[k]);
  if (keys.length === 0) return { overall: 0, perParam: {} };
  const n = errs[keys[0]]!.length;
  if (n === 0) return { overall: 0, perParam: {} };

  const perParam: Partial<Record<TargetParam, number>> = {};
  for (const p of keys) {
    const e = errs[p]!;
    const t = thresholds[p];
    let exceed = 0;
    for (const v of e) if (v > t) exceed++;
    perParam[p] = 100 - (exceed / n) * 100;
  }

  let needsIntervention = 0;
  for (let i = 0; i < n; i++) {
    let bad = false;
    for (const p of keys) {
      if (errs[p]![i] > thresholds[p]) {
        bad = true;
        break;
      }
    }
    if (bad) needsIntervention++;
  }
  const overall = 100 - (needsIntervention / n) * 100;
  return { overall, perParam };
}

export function r2(
  pred: Record<TargetParam, number[]>,
  truth: Record<TargetParam, number[]>,
  present: boolean[],
  paramFilter: ReadonlySet<TargetParam>,
): MetricResult {
  // Coefficient of determination per slider (×100), then averaged across
  // sliders. Each slider's residual error is measured against that slider's
  // own variance, so the ratio is dimensionless - parameters on very different
  // scales are directly comparable, and a fixed-style model that ignores the
  // photo scores low or negative (worse than predicting the mean edit).
  const perParam: Partial<Record<TargetParam, number>> = {};
  const scores: number[] = [];
  for (const p of TARGET_PARAMETERS) {
    if (!paramFilter.has(p)) continue;
    const a = pred[p];
    const b = truth[p];
    const n = a.length;
    if (n === 0) continue;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += b[i];
    mean /= n;
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      // A missing edit carries no information, so it is scored as if the
      // provider had predicted the mean edit: it contributes nothing to the
      // explained variance instead of being silently ignored.
      const ai = present[i] ? a[i] : mean;
      const e = ai - b[i];
      ssRes += e * e;
      const d = b[i] - mean;
      ssTot += d * d;
    }
    // No variance in the truth (you never moved this slider) → R² undefined.
    if (ssTot === 0) continue;
    const value = (1 - ssRes / ssTot) * 100;
    perParam[p] = value;
    scores.push(value);
  }
  const overall = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return { overall, perParam };
}

export function maeNative(
  pred: Record<TargetParam, number[]>,
  truth: Record<TargetParam, number[]>,
  present: boolean[],
  paramFilter: ReadonlySet<TargetParam>,
): MetricResult {
  // Mean absolute error per slider, in that slider's NATIVE units (stops,
  // points, Kelvin) - no scaling, no normalization. Lower is better. There is
  // deliberately no meaningful `overall`: you cannot average stops with Kelvin.
  // Unlike the headline metrics, this is measured only over images the provider
  // actually edited: there is no native-unit slider distance for a photo it
  // never touched. Read it as "when it does edit, how close" - coverage is
  // reported separately.
  const perParam: Partial<Record<TargetParam, number>> = {};
  for (const p of TARGET_PARAMETERS) {
    if (!paramFilter.has(p)) continue;
    const a = pred[p];
    const b = truth[p];
    let s = 0;
    let cnt = 0;
    for (let i = 0; i < a.length; i++) {
      if (!present[i]) continue;
      s += Math.abs(a[i] - b[i]);
      cnt++;
    }
    if (cnt === 0) continue;
    perParam[p] = s / cnt;
  }
  return { overall: NaN, perParam };
}

