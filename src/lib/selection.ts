// Image selection criteria - combine folder / rating / flag / color / keyword
// filters with AND to produce the eligible pool for splitting.

import type { Database } from 'sql.js';

export type Flag = 'flagged' | 'unflagged' | 'rejected';

export interface SelectionCriteria {
  /** null/undefined = all folders */
  folderIds?: number[] | null;
  /** null/undefined = any rating. Values 0-5; 0 includes NULL/unrated. */
  ratings?: number[] | null;
  /** null/undefined = any flag */
  flag?: Flag | null;
  /** null/undefined = any color. "" = no color label. */
  colors?: string[] | null;
  /** null/undefined = any keyword. Array = require at least one. */
  keywordIds?: number[] | null;
}

export const COLOR_LABELS = ['Red', 'Yellow', 'Green', 'Blue', 'Purple'] as const;

export interface KeywordInfo {
  id: number;
  name: string;
  imageCount: number;
}

export function getAllKeywords(db: Database): KeywordInfo[] {
  const out: KeywordInfo[] = [];
  const stmt = db.prepare(`
    SELECT id_local, name, COALESCE(imageCountCache, 0) AS cnt
    FROM AgLibraryKeyword
    WHERE name IS NOT NULL AND name != ''
    ORDER BY name COLLATE NOCASE
  `);
  while (stmt.step()) {
    const r = stmt.get();
    out.push({
      id: Number(r[0]),
      name: String(r[1]),
      imageCount: Number(r[2] ?? 0),
    });
  }
  stmt.free();
  return out;
}

/** Resolve the eligible image pool for the given criteria. Empty/omitted
 *  criteria fields are treated as "no restriction". */
export function getEligibleImageIds(db: Database, c: SelectionCriteria): number[] {
  const where: string[] = [];
  const params: any[] = [];

  if (c.folderIds && c.folderIds.length) {
    where.push(`fi.folder IN (${c.folderIds.map(() => '?').join(',')})`);
    params.push(...c.folderIds);
  }

  if (c.ratings && c.ratings.length) {
    const wantsZero = c.ratings.includes(0);
    const numeric = c.ratings.filter((r) => r > 0);
    const parts: string[] = [];
    if (numeric.length) {
      parts.push(`img.rating IN (${numeric.map(() => '?').join(',')})`);
      params.push(...numeric);
    }
    if (wantsZero) parts.push('(img.rating IS NULL OR img.rating = 0)');
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  }

  if (c.flag) {
    if (c.flag === 'flagged') where.push('img.pick = 1');
    else if (c.flag === 'rejected') where.push('img.pick = -1');
    else where.push('(img.pick IS NULL OR img.pick = 0)');
  }

  if (c.colors && c.colors.length) {
    const wantsNone = c.colors.includes('');
    const named = c.colors.filter((s) => s !== '');
    const parts: string[] = [];
    if (named.length) {
      parts.push(`img.colorLabels IN (${named.map(() => '?').join(',')})`);
      params.push(...named);
    }
    if (wantsNone) parts.push("(img.colorLabels IS NULL OR img.colorLabels = '')");
    if (parts.length) where.push(`(${parts.join(' OR ')})`);
  }

  if (c.keywordIds && c.keywordIds.length) {
    where.push(
      `img.id_local IN (SELECT image FROM AgLibraryKeywordImage WHERE tag IN (${c.keywordIds
        .map(() => '?')
        .join(',')}))`,
    );
    params.push(...c.keywordIds);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT DISTINCT img.id_local
    FROM Adobe_images img
    LEFT JOIN AgLibraryFile fi ON fi.id_local = img.rootFile
    ${whereSql}
  `;

  const ids: number[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) ids.push(Number(stmt.get()[0]));
  stmt.free();
  return ids;
}

/** Minimum training images a provider realistically needs to learn a style. */
export const MIN_TRAIN_SIZE = 2000;

export interface SplitPlan {
  testSize: number;
  trainSizes: number[];
}

/**
 * Suggest default test/training sizes from the size of the eligible pool, so
 * the form auto-adjusts to each photographer's library and (by default) never
 * trips the "not enough photos" warning.
 *
 * Test set: aim for ~1,000 photos, nudged by a deterministic +/- 100 so it
 * reads as a derived figure rather than a round default; shrunk on small
 * libraries so training still gets a fair share.
 *
 * Training: 20% / 50% / 100% of the trainable pool, with a 2,000-image floor on
 * the smallest (the minimum a provider needs). The largest is the whole
 * trainable pool, so the default uses all their photos and fits exactly. Taking
 * percentages of a real-world (rarely round) pool naturally yields non-round
 * sizes. Returns fewer points when the pool can't support three distinct ones.
 */
export function suggestSplitPlan(total: number): SplitPlan | null {
  if (!Number.isFinite(total) || total <= 0) return null;

  // --- Test set ---
  let testSize: number;
  const cap = Math.floor(total / 3); // never let the test set exceed a third
  if (cap >= 1100) {
    const jitter = (total % 201) - 100; // [-100, +100], stable for a given pool
    testSize = 1000 + jitter;
  } else {
    testSize = Math.max(1, Math.min(1000, cap));
  }

  // --- Training sizes ---
  const pool = total - testSize; // images left to train on after the test set
  if (pool < MIN_TRAIN_SIZE) {
    // Too small for a proper run; offer the whole pool and let the warning
    // surface only if it's genuinely short once they tweak things.
    return { testSize, trainSizes: [Math.max(1, pool)] };
  }

  const raw = [Math.round(total * 0.2), Math.round(total * 0.5), pool];
  const trainSizes: number[] = [];
  for (const r of raw) {
    const v = Math.max(MIN_TRAIN_SIZE, Math.min(r, pool));
    if (!trainSizes.includes(v)) trainSizes.push(v);
  }
  trainSizes.sort((a, b) => a - b);
  return { testSize, trainSizes };
}
