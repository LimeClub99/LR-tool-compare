import {
  getNormalizedThresholds,
  TARGET_PARAMETERS,
  TargetParam,
  Thresholds,
} from './config';
import type { DevelopSettings } from './catalog';
import { alignArrays, hir, maeNative, r2, pwt } from './metrics';

export interface SummaryRow {
  provider: string;
  split: string;
  matched: number;
  pwt: number;
  hir: number;
  r2: number;
}

export interface ParamRow {
  provider: string;
  split: string;
  param: TargetParam;
  pwt: number;
  hir: number;
  r2: number;
  /** Mean absolute error in the slider's native units (stops, pts, K). */
  mae: number;
}

export interface ComparisonResult {
  summary: SummaryRow[];
  perParam: ParamRow[];
}

export type ProviderResults = Map<string, Map<string, Map<number, DevelopSettings>>>;

export function compareAll(
  truth: Map<number, DevelopSettings>,
  results: ProviderResults,
  thresholds: Record<TargetParam, Thresholds>,
  paramFilter: TargetParam[],
): ComparisonResult {
  // Single shared tolerance drives both per-slider (pwt) and per-image (hir).
  const tol = getNormalizedThresholds(thresholds);
  const filterSet = new Set(paramFilter);
  const summary: SummaryRow[] = [];
  const perParam: ParamRow[] = [];

  for (const [provider, splits] of results) {
    for (const [split, predictions] of splits) {
      if (predictions.size === 0) continue;
      const aligned = alignArrays(truth, predictions);
      const matched = aligned.matchedIds.length;
      if (matched === 0) continue;
      const a = pwt(aligned.pred, aligned.truth, tol, filterSet);
      const b = hir(aligned.pred, aligned.truth, tol, filterSet);
      const d = r2(aligned.pred, aligned.truth, aligned.present, filterSet);
      const g = maeNative(aligned.pred, aligned.truth, aligned.present, filterSet);
      summary.push({
        provider,
        split,
        matched,
        pwt: a.overall,
        hir: b.overall,
        r2: d.overall,
      });
      for (const p of TARGET_PARAMETERS) {
        if (!filterSet.has(p)) continue;
        perParam.push({
          provider,
          split,
          param: p,
          pwt: a.perParam[p] ?? NaN,
          hir: b.perParam[p] ?? NaN,
          r2: d.perParam[p] ?? NaN,
          mae: g.perParam[p] ?? NaN,
        });
      }
    }
  }
  return { summary, perParam };
}

export function formatSplit(name: string): string {
  if (name.endsWith('_train')) {
    const n = parseInt(name.slice(0, -6), 10);
    if (!isNaN(n)) return `${n.toLocaleString()} photos`;
  }
  return name;
}

/** Format a percentage for a compact bar label: one decimal below 10% so
 *  small values stay legible, whole numbers above. */
export function formatBarPct(v: number): string {
  return `${Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0)}%`;
}

/** Rank providers by their best Hands-Free Rate at the largest training
 *  size they have a result for. Used to order providers everywhere in the
 *  Analysis tab so the strongest one is always leftmost / topmost. */
export function providersRankedByHandsFree(summary: SummaryRow[]): string[] {
  const byProv = new Map<string, { trainSize: number; hir: number }>();
  for (const r of summary) {
    const m = r.split.match(/^(\d+)/);
    const ts = m ? parseInt(m[1], 10) : 0;
    const cur = byProv.get(r.provider);
    if (!cur || ts > cur.trainSize) {
      byProv.set(r.provider, { trainSize: ts, hir: r.hir });
    } else if (ts === cur.trainSize && r.hir > cur.hir) {
      byProv.set(r.provider, { trainSize: ts, hir: r.hir });
    }
  }
  return Array.from(byProv.entries())
    .sort((a, b) => {
      const ah = isFinite(a[1].hir) ? a[1].hir : -Infinity;
      const bh = isFinite(b[1].hir) ? b[1].hir : -Infinity;
      if (bh !== ah) return bh - ah;
      return a[0].localeCompare(b[0]);
    })
    .map(([p]) => p);
}

export function sortSplits(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

/**
 * Training sizes that EVERY provider was tested on. Averaging across these
 * (rather than each provider's own splits) keeps the comparison fair: a tool
 * isn't dragged down by a smaller set the others never ran.
 */
export function sharedSplits(rows: { provider: string; split: string }[]): Set<string> {
  const byProvider = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byProvider.has(r.provider)) byProvider.set(r.provider, new Set());
    byProvider.get(r.provider)!.add(r.split);
  }
  const sets = Array.from(byProvider.values());
  if (sets.length === 0) return new Set();
  const shared = new Set(sets[0]);
  for (const s of sets.slice(1)) {
    for (const x of Array.from(shared)) if (!s.has(x)) shared.delete(x);
  }
  return shared;
}
