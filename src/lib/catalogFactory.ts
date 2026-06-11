// Orchestrates per-(provider, split) sub-catalog creation in-browser.
//
// For each combination we instantiate a *fresh* sql.js Database from the
// master bytes, apply the train/test markers + develop-settings reset, export
// it back to a Uint8Array, and either write it to a user-picked directory (via
// the File System Access API) or trigger an individual download.

import { loadSql } from './catalog';
import {
  markTestImages,
  markTrainImages,
  pruneCatalog,
  resetDevelopSettings,
  updateRootFolderPaths,
} from './catalogWriter';
import type { SplitResult } from './splitter';

export interface BuildProgress {
  provider: string;
  split: string;
  index: number;
  total: number;
}

export interface BuildOptions {
  masterBytes: Uint8Array;
  providers: string[];
  splits: SplitResult[];
  imageRootPath?: string;
  onProgress?: (p: BuildProgress) => void;
  /** Yield to the UI between catalogs so the progress UI can render. */
  yieldBetween?: boolean;
}

export interface BuiltCatalog {
  provider: string;
  split: string;
  bytes: Uint8Array;
  /** e.g. "Provider/1000_train/catalog.lrcat" */
  relativePath: string;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build one provider/split catalog as a Uint8Array. Caller is responsible
 * for writing it out and freeing memory afterwards.
 */
export async function buildOneCatalog(
  masterBytes: Uint8Array,
  split: SplitResult,
  imageRootPath?: string,
): Promise<Uint8Array> {
  const SQL = await loadSql();
  // sql.js copies the buffer internally, so the master bytes are not mutated.
  const db = new SQL.Database(masterBytes);
  try {
    if (imageRootPath) updateRootFolderPaths(db, imageRootPath);
    markTrainImages(db, split.trainIds);
    markTestImages(db, split.testIds);
    resetDevelopSettings(db, split.testIds);
    pruneCatalog(db, [...split.trainIds, ...split.testIds]);
    return db.export();
  } finally {
    db.close();
  }
}

/**
 * Build catalogs for every (provider, split) pair sequentially. Each catalog
 * is yielded via `onCatalog` as it's produced so the caller can stream it to
 * disk and immediately let GC reclaim the buffer.
 */
export async function buildAllCatalogs(
  opts: BuildOptions,
  onCatalog: (c: BuiltCatalog) => Promise<void> | void,
): Promise<void> {
  const total = opts.providers.length * opts.splits.length;
  let i = 0;
  for (const provider of opts.providers) {
    for (const split of opts.splits) {
      i++;
      opts.onProgress?.({ provider, split: split.config.name, index: i, total });
      const bytes = await buildOneCatalog(opts.masterBytes, split, opts.imageRootPath);
      await onCatalog({
        provider,
        split: split.config.name,
        bytes,
        relativePath: `${provider}/${split.config.name}/catalog.lrcat`,
      });
      if (opts.yieldBetween) await nextTick();
    }
  }
}

export interface BenchmarkJsonInput {
  sourceCatalog: string;
  providers: string[];
  splits: SplitResult[];
  seed: number;
  testIds: number[];
  selectedFolderIds?: number[] | null;
  outputDir?: string;
}

/** Build the benchmark.json payload. */
export function buildBenchmarkJson(input: BenchmarkJsonInput): unknown {
  const splitsOut = input.splits.map((sr) => ({
    name: sr.config.name,
    train_size: sr.config.trainSize,
  }));
  const catalogMap: Record<string, Record<string, string>> = {};
  for (const p of input.providers) {
    catalogMap[p] = {};
    for (const sr of input.splits) {
      catalogMap[p][sr.config.name] = `${p}/${sr.config.name}/catalog.lrcat`;
    }
  }
  return {
    version: 1,
    created: new Date().toISOString(),
    source_catalog: input.sourceCatalog,
    output_dir: input.outputDir ?? '',
    providers: input.providers,
    test_size: input.testIds.length,
    test_ids: input.testIds,
    selected_folder_ids: input.selectedFolderIds ?? null,
    seed: input.seed,
    splits: splitsOut,
    catalog_map: catalogMap,
  };
}
