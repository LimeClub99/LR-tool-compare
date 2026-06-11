export interface BenchmarkConfig {
  source_catalog: string;
  output_dir?: string;
  providers: string[];
  test_size?: number;
  /** Always normalized to a list of split names like ["1000_train", "4000_train"]. */
  splits: string[];
  /** Optional original split objects (`{name, train_size}`) for richer display. */
  splitDetails?: { name: string; train_size?: number }[];
  catalog_map: Record<string, Record<string, string>>;
  seed?: number;
  test_ids: number[];
}

const REQUIRED = ['providers', 'splits', 'catalog_map', 'test_ids'] as const;

export function parseBenchmarkJson(text: string): BenchmarkConfig {
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err: any) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }
  for (const k of REQUIRED) {
    if (parsed[k] === undefined) {
      throw new Error(
        `benchmark.json is missing required key "${k}".`,
      );
    }
  }
  if (!Array.isArray(parsed.test_ids) || parsed.test_ids.length === 0) {
    throw new Error('benchmark.json has no test_ids - nothing to compare.');
  }

  // Normalize splits: accept either ["1000_train", ...] or [{name, train_size}, ...].
  const rawSplits: any[] = Array.isArray(parsed.splits) ? parsed.splits : [];
  const splits: string[] = [];
  const splitDetails: { name: string; train_size?: number }[] = [];
  for (const s of rawSplits) {
    if (typeof s === 'string') {
      splits.push(s);
      splitDetails.push({ name: s });
    } else if (s && typeof s === 'object' && typeof s.name === 'string') {
      splits.push(s.name);
      splitDetails.push({ name: s.name, train_size: s.train_size });
    }
  }

  return {
    ...parsed,
    splits,
    splitDetails,
  } as BenchmarkConfig;
}

/**
 * Match an uploaded file's webkitRelativePath against the catalog_map entries.
 * Returns the (provider, split) pair if a match is found, otherwise null.
 * We normalize both sides by stripping the leading root folder and comparing
 * the trailing path.
 */
export function matchCatalogPath(
  relativePath: string,
  config: BenchmarkConfig,
): { provider: string; split: string } | null {
  const norm = relativePath.replace(/\\/g, '/');
  for (const provider of config.providers) {
    const splits = config.catalog_map[provider] ?? {};
    for (const [split, mappedPath] of Object.entries(splits)) {
      const m = mappedPath.replace(/\\/g, '/');
      if (norm.endsWith(m)) return { provider, split };
    }
  }
  return null;
}

export function isSourceCatalogPath(
  relativePath: string,
  config: BenchmarkConfig,
): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  const src = config.source_catalog.replace(/\\/g, '/');
  return norm.endsWith(src) || norm.endsWith(src.split('/').pop() ?? src);
}
