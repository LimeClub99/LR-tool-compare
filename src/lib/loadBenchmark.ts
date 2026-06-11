import {
  cellKey,
  clearAllResults,
  setCellStatus,
  setProviderResult,
  store,
} from '../state/store';
import {
  BenchmarkConfig,
  matchCatalogPath,
  parseBenchmarkJson,
} from './benchmarkJson';
import { extractSettings, openCatalog } from './catalog';
import { readFilesFromHandle } from './dropzone';

async function loadReference(file: File, cfg: BenchmarkConfig) {
  store.set({ truthFileName: file.name, truthStatus: { kind: 'loading', message: 'reading…' } });
  const db = await openCatalog(file);
  const settings = extractSettings(db, { imageIds: cfg.test_ids, onlyEdited: false });
  db.close();
  const matched = settings.size;
  store.set({
    truth: settings,
    truthStatus: { kind: 'done', matched, coverage: matched / cfg.test_ids.length, loadedAt: Date.now() },
  });
}

async function loadProvider(file: File, provider: string, split: string, cfg: BenchmarkConfig) {
  const key = cellKey(provider, split);
  setCellStatus(key, { kind: 'loading', message: 'reading…' });
  const db = await openCatalog(file);
  const settings = extractSettings(db, { imageIds: cfg.test_ids, onlyEdited: true });
  db.close();
  const matched = settings.size;
  setProviderResult(provider, split, settings);
  setCellStatus(key, { kind: 'done', matched, coverage: matched / cfg.test_ids.length, loadedAt: Date.now() });
}

/** Find the reference (truth) catalog inside the picked folder. */
function findReferenceFile(files: File[], cfg: BenchmarkConfig): File | null {
  const sourceBasename = cfg.source_catalog.replace(/\\/g, '/').split('/').pop();
  if (sourceBasename) {
    const exact = files.find((f) => f.name === sourceBasename);
    if (exact) return exact;
  }
  const masterCandidate = files.find((f) => {
    if (!/\.lrcat$/i.test(f.name)) return false;
    const rel = ((f as any).webkitRelativePath || f.name).replace(/\\/g, '/');
    return /(^|\/)(master|reference|truth)\//i.test(rel);
  });
  return masterCandidate ?? null;
}

/** Parse benchmark.json and read the reference + every matched provider catalog
 *  from the picked files. Returns an error message string, or null on success. */
export async function autoLoad(files: File[], onProgress: (m: string) => void): Promise<string | null> {
  const cfgFile = files.find((f) => /benchmark.*\.json$/i.test(f.name));
  if (!cfgFile) return 'No benchmark.json found in the picked folder.';

  let cfg: BenchmarkConfig;
  try {
    cfg = parseBenchmarkJson(await cfgFile.text());
  } catch (err: any) {
    return `Failed to parse ${cfgFile.name}: ${err?.message ?? err}`;
  }
  clearAllResults();
  store.set({ config: cfg, configFileName: cfgFile.name });

  const matches: { file: File; provider: string; split: string }[] = [];
  for (const f of files) {
    if (!/\.lrcat$/i.test(f.name)) continue;
    const rel = ((f as any).webkitRelativePath || f.name).replace(/\\/g, '/');
    const m = matchCatalogPath(rel, cfg);
    if (m) matches.push({ file: f, provider: m.provider, split: m.split });
  }

  const refFile = findReferenceFile(files, cfg);
  if (!refFile) return 'Reference (master) catalog not found inside the folder.';
  if (matches.length === 0) return 'No provider catalogs matched the paths in benchmark.json.';

  const total = matches.length + 1;
  onProgress(`Reading reference (1/${total}): ${refFile.name}`);
  await loadReference(refFile, cfg);

  let done = 1;
  for (const m of matches) {
    done++;
    onProgress(`Reading ${m.provider} / ${m.split} (${done}/${total})`);
    await loadProvider(m.file, m.provider, m.split, cfg);
  }

  return null;
}

/** Re-read the benchmark from the previously picked directory handle. Returns
 *  an error message string, or null on success. */
export async function reloadFromSource(onProgress: (m: string) => void): Promise<string | null> {
  const handle = store.get().sourceDirHandle;
  if (!handle) return 'No source folder to refresh - load a benchmark folder first.';
  const files = await readFilesFromHandle(handle);
  return autoLoad(files, onProgress);
}
