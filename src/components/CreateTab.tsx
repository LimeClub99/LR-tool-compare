import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { extractSettings, loadSql } from '../lib/catalog';
import {
  getFolderHierarchy,
  RootFolderInfo,
} from '../lib/folderTree';
import {
  COLOR_LABELS,
  Flag,
  KeywordInfo,
  getAllKeywords,
  getEligibleImageIds,
  suggestSplitPlan,
} from '../lib/selection';
import { generateSplits, SplitConfig, SplitResult } from '../lib/splitter';
import {
  buildAllCatalogs,
  buildBenchmarkJson,
  BuildProgress,
} from '../lib/catalogFactory';
import { pickOutputSink, supportsDirectoryPicker } from '../lib/download';
import { parseBenchmarkJson } from '../lib/benchmarkJson';
import { clearAllResults, store } from '../state/store';

const DEFAULT_PROVIDERS = ['Aftershoot', 'FotoLab', 'Imagen', 'Neaurapix'];
const DEFAULT_TRAIN_SIZES = '4000, 10000';

interface MasterInfo {
  fileName: string;
  filePath: string;
  bytes: Uint8Array;
  roots: RootFolderInfo[];
  totalImages: number;
  keywords: KeywordInfo[];
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

interface CreateTabProps {
  onGoLoad: () => void;
}

export function CreateTab({ onGoLoad }: CreateTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [master, setMaster] = useState<MasterInfo | null>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [useAllFolders, setUseAllFolders] = useState(true);
  const [selectedRatings, setSelectedRatings] = useState<Set<number>>(new Set());
  const [selectedFlag, setSelectedFlag] = useState<Flag | ''>('');
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [selectedKeywords, setSelectedKeywords] = useState<Set<number>>(new Set());
  const [keywordFilter, setKeywordFilter] = useState('');
  const [eligibleCount, setEligibleCount] = useState<number | null>(null);
  const [countingPool, setCountingPool] = useState(false);

  const [providers, setProviders] = useState<string[]>(DEFAULT_PROVIDERS);
  const [newProvider, setNewProvider] = useState('');
  const [testSize, setTestSize] = useState('1000');
  const [trainSizesRaw, setTrainSizesRaw] = useState(DEFAULT_TRAIN_SIZES);
  const [seed, setSeed] = useState('42');
  // Until the photographer edits the sizes themselves, we keep them in sync with
  // the eligible pool (see the suggestSplitPlan effect below). Once they type,
  // we stop overriding their choice.
  const [sizesEdited, setSizesEdited] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [doneInfo, setDoneInfo] = useState<{
    benchmarkJson: any;
    sinkLabel: string;
  } | null>(null);

  useEffect(() => {
    // Reset selection state when master changes.
    setSelectedFolders(new Set());
    setUseAllFolders(true);
    setSelectedRatings(new Set());
    setSelectedFlag('');
    setSelectedColors(new Set());
    setSelectedKeywords(new Set());
    setKeywordFilter('');
    setEligibleCount(null);
    setSizesEdited(false);
  }, [master?.fileName]);

  async function onPickMaster(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLoadingMaster(true);
    setError(null);
    setMaster(null);
    setDoneInfo(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const SQL = await loadSql();
      const db = new SQL.Database(bytes);
      const roots = getFolderHierarchy(db);
      const total = getEligibleImageIds(db, {}).length;
      const keywords = getAllKeywords(db);
      db.close();
      setMaster({
        fileName: file.name,
        filePath: (file as any).webkitRelativePath || file.name,
        bytes,
        roots,
        totalImages: total,
        keywords,
      });
    } catch (err: any) {
      setError(`Failed to open master: ${err?.message ?? err}`);
    } finally {
      setLoadingMaster(false);
    }
  }

  function toggleFolder(id: number) {
    setUseAllFolders(false);
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInRoot(root: RootFolderInfo) {
    setUseAllFolders(false);
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      for (const f of root.subfolders) next.add(f.folderId);
      return next;
    });
  }

  function clearRootSelection(root: RootFolderInfo) {
    setSelectedFolders((prev) => {
      const next = new Set(prev);
      for (const f of root.subfolders) next.delete(f.folderId);
      return next;
    });
  }

  const currentCriteria = useMemo(
    () => ({
      folderIds: useAllFolders ? null : [...selectedFolders],
      ratings: selectedRatings.size ? [...selectedRatings] : null,
      flag: selectedFlag === '' ? null : selectedFlag,
      colors: selectedColors.size ? [...selectedColors] : null,
      keywordIds: selectedKeywords.size ? [...selectedKeywords] : null,
    }),
    [useAllFolders, selectedFolders, selectedRatings, selectedFlag, selectedColors, selectedKeywords],
  );

  // Live recount whenever criteria change. Debounced so rapid checkbox
  // clicks don't open a SQL handle per tick.
  useEffect(() => {
    if (!master) return;
    if (
      useAllFolders &&
      !selectedRatings.size &&
      !selectedFlag &&
      !selectedColors.size &&
      !selectedKeywords.size
    ) {
      setEligibleCount(master.totalImages);
      return;
    }
    if (!useAllFolders && selectedFolders.size === 0) {
      setEligibleCount(0);
      return;
    }
    let canceled = false;
    setCountingPool(true);
    const handle = setTimeout(async () => {
      try {
        const SQL = await loadSql();
        const db = new SQL.Database(master.bytes);
        const count = getEligibleImageIds(db, currentCriteria).length;
        db.close();
        if (!canceled) setEligibleCount(count);
      } finally {
        if (!canceled) setCountingPool(false);
      }
    }, 150);
    return () => {
      canceled = true;
      clearTimeout(handle);
    };
  }, [master, currentCriteria, useAllFolders, selectedFolders, selectedRatings, selectedFlag, selectedColors, selectedKeywords]);

  const selectedImageCount = eligibleCount ?? 0;

  // Auto-fit the default test/training sizes to the photographer's pool. Skips
  // once they've edited the sizes themselves, and waits until we have a count.
  useEffect(() => {
    if (sizesEdited || eligibleCount === null || eligibleCount <= 0) return;
    const plan = suggestSplitPlan(eligibleCount);
    if (!plan) return;
    setTestSize(String(plan.testSize));
    setTrainSizesRaw(plan.trainSizes.join(', '));
  }, [eligibleCount, sizesEdited]);

  const parsedTrainSizes = useMemo(() => {
    return trainSizesRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.floor(n));
  }, [trainSizesRaw]);

  const parsedTestSize = useMemo(() => {
    const n = Number(testSize);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }, [testSize]);

  const parsedSeed = useMemo(() => {
    const n = Number(seed);
    return Number.isFinite(n) ? Math.floor(n) : 42;
  }, [seed]);

  function addProvider() {
    const name = newProvider.trim();
    if (!name) return;
    if (providers.includes(name)) {
      setNewProvider('');
      return;
    }
    setProviders([...providers, name]);
    setNewProvider('');
  }

  function removeProvider(name: string) {
    setProviders(providers.filter((p) => p !== name));
  }

  const maxTrainSize = parsedTrainSizes.length ? Math.max(...parsedTrainSizes) : 0;
  const requiredImages = parsedTestSize + maxTrainSize;
  const enoughImages = selectedImageCount >= requiredImages && requiredImages > 0;

  const canGenerate =
    !!master &&
    !generating &&
    providers.length > 0 &&
    parsedTrainSizes.length > 0 &&
    parsedTestSize > 0 &&
    enoughImages;

  async function onGenerate() {
    if (!master) return;

    // Open the folder picker first, while the click's transient activation is
    // still fresh. Loading the master into sql.js below can take several
    // seconds for large catalogs and would otherwise expire the gesture,
    // causing showDirectoryPicker to silently refuse.
    let sink;
    try {
      sink = await pickOutputSink();
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError(err?.message ?? String(err));
      }
      return;
    }

    setGenerating(true);
    setError(null);
    setStatusMessages([]);
    setProgress(null);
    setDoneInfo(null);

    try {
      const SQL = await loadSql();
      const db = new SQL.Database(master.bytes);
      const pool = getEligibleImageIds(db, currentCriteria);
      db.close();
      if (pool.length < requiredImages) {
        throw new Error(
          `Selected pool has ${pool.length} images but the splits need ${requiredImages}.`,
        );
      }

      // Build splits.
      const splitConfigs: SplitConfig[] = parsedTrainSizes.map((trainSize) => ({
        name: `${trainSize}_train`,
        trainSize,
        testSize: parsedTestSize,
      }));
      const splits: SplitResult[] = generateSplits(pool, splitConfigs, parsedSeed);
      const testIds = splits[0].testIds;

      // Write benchmark.json first so the user has the manifest even if a
      // catalog write fails midway.
      const benchmarkJson = buildBenchmarkJson({
        sourceCatalog: master.filePath,
        providers,
        splits,
        seed: parsedSeed,
        testIds,
        selectedFolderIds: useAllFolders ? null : [...selectedFolders],
      });
      await sink.write('benchmark.json', JSON.stringify(benchmarkJson, null, 2));
      setStatusMessages((m) => [...m, `Wrote benchmark.json → ${sink.label}`]);

      // Bundle the master as Reference/reference.lrcat so the benchmark
      // folder is self-contained and Load can auto-discover it.
      await sink.write('Reference/reference.lrcat', master.bytes);
      setStatusMessages((m) => [
        ...m,
        `Wrote Reference/reference.lrcat (${(master.bytes.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
      ]);

      // Generate catalogs sequentially.
      await buildAllCatalogs(
        {
          masterBytes: master.bytes,
          providers,
          splits,
          yieldBetween: true,
          onProgress: (p) => setProgress(p),
        },
        async (built) => {
          await sink.write(built.relativePath, built.bytes);
          setStatusMessages((m) => [
            ...m,
            `Wrote ${built.relativePath} (${(built.bytes.byteLength / (1024 * 1024)).toFixed(1)} MB)`,
          ]);
        },
      );

      setProgress(null);
      setDoneInfo({ benchmarkJson, sinkLabel: sink.label });
    } catch (err: any) {
      // AbortError when user cancels the folder picker - treat as a quiet
      // user action rather than an error.
      if (err?.name === 'AbortError') {
        setError(null);
      } else {
        setError(err?.message ?? String(err));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function loadGeneratedIntoAnalyzer() {
    if (!doneInfo || !master) return;
    try {
      const cfg = parseBenchmarkJson(JSON.stringify(doneInfo.benchmarkJson));
      clearAllResults();
      store.set({ config: cfg, configFileName: 'benchmark.json (just created)' });

      // Pre-load the master we already have as the reference (truth).
      store.set({
        truthFileName: master.fileName,
        truthStatus: { kind: 'loading', message: 'reading…' },
      });
      try {
        const SQL = await loadSql();
        const db = new SQL.Database(master.bytes);
        const settings = extractSettings(db, {
          imageIds: cfg.test_ids,
          onlyEdited: false,
        });
        db.close();
        const matched = settings.size;
        const coverage = matched / cfg.test_ids.length;
        store.set({
          truth: settings,
          truthStatus: { kind: 'done', matched, coverage, loadedAt: Date.now() },
        });
      } catch (err: any) {
        store.set({
          truth: null,
          truthStatus: { kind: 'error', error: err?.message ?? String(err) },
        });
      }
      onGoLoad();
    } catch (err: any) {
      setError(`Could not load generated benchmark.json: ${err?.message ?? err}`);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>1. Choose your portfolio</h2>
        <p className="muted">
          Your portfolio is the Lightroom catalog (a <code>.lrcat</code> file)
          containing the finished, edited photos that represent your style -
          the edits you want the AI services to be measured against. Pick it
          here and the tool reads your folders and photo counts so you can
          choose which images to use.
        </p>
        <p className="muted small">
          Already created packages in a previous run and just want to look at
          the results? Skip this tab - go straight to <strong>Load</strong>.
        </p>
        <div className="row gap">
          <label className="filebutton primary">
            <input
              ref={inputRef}
              type="file"
              accept=".lrcat"
              onChange={onPickMaster}
              disabled={loadingMaster}
            />
            <span>{master ? 'Choose a different catalog…' : 'Choose your portfolio (.lrcat)…'}</span>
          </label>
          {loadingMaster && <span className="muted">Reading your catalog…</span>}
          {master && (
            <div className="master-summary">
              <div><strong>{master.fileName}</strong></div>
              <div className="muted small">
                {formatNum(master.totalImages)} images in {master.roots.length} root folder
                {master.roots.length === 1 ? '' : 's'}
              </div>
            </div>
          )}
        </div>
      </section>

      {master && (
        <section className="panel">
          <h2>2. Which photos to use</h2>
          <p className="muted">
            Use your whole catalog, or pick specific folders - maybe a
            particular style of work, like weddings or portraits. Only photos in
            the folders you choose here will be used for training and testing.
          </p>
          <div className="folder-mode">
            <label>
              <input
                type="radio"
                name="folder-mode"
                checked={useAllFolders}
                onChange={() => {
                  setUseAllFolders(true);
                  setSelectedFolders(new Set());
                }}
              />
              <span>Use all images ({formatNum(master.totalImages)})</span>
            </label>
            <label>
              <input
                type="radio"
                name="folder-mode"
                checked={!useAllFolders}
                onChange={() => setUseAllFolders(false)}
              />
              <span>Pick folders</span>
            </label>
          </div>

          {!useAllFolders && (
            <div className="folder-tree">
              {master.roots.map((root) => {
                const inRoot = root.subfolders.filter((f) =>
                  selectedFolders.has(f.folderId),
                ).length;
                return (
                  <div key={root.rootId} className="folder-root">
                    <div className="folder-root-head">
                      <div>
                        <strong>{root.rootName}</strong>
                        <span className="muted small">
                          {' '}- {formatNum(root.totalImages)} images, {root.subfolders.length} folders
                        </span>
                      </div>
                      <div className="row gap">
                        <button
                          type="button"
                          className="link"
                          onClick={() => selectAllInRoot(root)}
                        >
                          select all
                        </button>
                        <button
                          type="button"
                          className="link"
                          onClick={() => clearRootSelection(root)}
                        >
                          clear
                        </button>
                        <span className="muted small">
                          {inRoot}/{root.subfolders.length} selected
                        </span>
                      </div>
                    </div>
                    <div className="folder-list">
                      {root.subfolders.map((f) => {
                        const id = f.folderId;
                        const label = f.path || '(root)';
                        return (
                          <label key={id} className="folder-row">
                            <input
                              type="checkbox"
                              checked={selectedFolders.has(id)}
                              onChange={() => toggleFolder(id)}
                            />
                            <span className="folder-path">{label}</span>
                            <span className="muted small">{formatNum(f.imageCount)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </section>
      )}

      {master && (
        <section className="panel">
          <h2>3. Narrow it down further (optional)</h2>
          <p className="muted">
            Optionally narrow your selection using the ratings, flags, color
            labels and keywords you already set in Lightroom - for example, only
            your 5-star keepers. A photo has to match every filter you set.
            Leave them untouched to use everything.
          </p>

          <div className="filter-group">
            <div className="form-label">Star rating</div>
            <div className="provider-chips">
              {[0, 1, 2, 3, 4, 5].map((r) => {
                const on = selectedRatings.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={on ? 'chip chip-on' : 'chip'}
                    onClick={() => {
                      const next = new Set(selectedRatings);
                      if (on) next.delete(r);
                      else next.add(r);
                      setSelectedRatings(next);
                    }}
                  >
                    {r === 0 ? 'unrated' : '★'.repeat(r)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-group">
            <div className="form-label">Flag</div>
            <div className="provider-chips">
              {(['', 'flagged', 'unflagged', 'rejected'] as const).map((f) => (
                <button
                  key={f || 'any'}
                  type="button"
                  className={selectedFlag === f ? 'chip chip-on' : 'chip'}
                  onClick={() => setSelectedFlag(f)}
                >
                  {f === '' ? 'any' : f}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <div className="form-label">Color label</div>
            <div className="provider-chips">
              {(['', ...COLOR_LABELS] as const).map((c) => {
                const on = selectedColors.has(c);
                const label = c === '' ? 'none' : c;
                return (
                  <button
                    key={label}
                    type="button"
                    className={on ? 'chip chip-on' : 'chip'}
                    onClick={() => {
                      const next = new Set(selectedColors);
                      if (on) next.delete(c);
                      else next.add(c);
                      setSelectedColors(next);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-group">
            <div className="form-label">Keywords ({selectedKeywords.size} selected)</div>
            <input
              type="text"
              placeholder="Filter keyword list…"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              style={{ width: '100%', marginBottom: 8 }}
            />
            <div className="keyword-list">
              {master.keywords
                .filter((k) =>
                  keywordFilter
                    ? k.name.toLowerCase().includes(keywordFilter.toLowerCase())
                    : true,
                )
                .slice(0, 200)
                .map((k) => (
                  <label key={k.id} className="folder-row">
                    <input
                      type="checkbox"
                      checked={selectedKeywords.has(k.id)}
                      onChange={() => {
                        const next = new Set(selectedKeywords);
                        if (next.has(k.id)) next.delete(k.id);
                        else next.add(k.id);
                        setSelectedKeywords(next);
                      }}
                    />
                    <span className="folder-path">{k.name}</span>
                    <span className="muted small">{formatNum(k.imageCount)}</span>
                  </label>
                ))}
              {master.keywords.length > 200 && !keywordFilter && (
                <div className="muted small">
                  Showing first 200 of {master.keywords.length} - type to filter.
                </div>
              )}
            </div>
          </div>

          <div className="selection-summary">
            <strong>{formatNum(selectedImageCount)}</strong> images match{' '}
            {countingPool && <span className="muted small">(counting…)</span>}
          </div>
        </section>
      )}

      {master && (
        <section className="panel">
          <h2>4. Set up the comparison</h2>
          <p className="muted">
            Decide how many photos the AI services learn from, how many they
            edit on their own, and which services you want to compare.
          </p>
          <div className="form-grid">
            <label>
              <span>Photos to edit</span>
              <input
                type="number"
                min={1}
                value={testSize}
                onChange={(e) => {
                  setSizesEdited(true);
                  setTestSize(e.target.value);
                }}
              />
              <span className="hint">
                How many photos each service edits and gets scored on. The same
                photos are used for every service.
              </span>
            </label>
            <label>
              <span>Photos to learn from</span>
              <input
                type="text"
                value={trainSizesRaw}
                onChange={(e) => {
                  setSizesEdited(true);
                  setTrainSizesRaw(e.target.value);
                }}
                placeholder="e.g. 100, 1000, 4000"
              />
              <span className="hint">
                How many of your edited photos the AI learns from. Enter several
                numbers (separated by commas) to see whether feeding it more
                examples improves the match.
              </span>
            </label>
            <label>
              <span>Shuffle seed</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
              <span className="hint">
                Photos are picked at random. Keep the same number here to get the
                exact same selection again next time.
              </span>
            </label>
          </div>

          <div className="providers">
            <div className="form-label">AI services to compare</div>
            <div className="provider-chips">
              {providers.map((p) => (
                <span key={p} className="chip">
                  {p}
                  <button
                    type="button"
                    className="chip-x"
                    onClick={() => removeProvider(p)}
                    aria-label={`Remove ${p}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add an AI service…"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addProvider();
                  }
                }}
              />
              <button
                type="button"
                className="link"
                onClick={addProvider}
                disabled={!newProvider.trim()}
              >
                add
              </button>
            </div>
            <div className="hint">
              You'll get one package for each service, at each size it learns
              from. With {providers.length} service
              {providers.length === 1 ? '' : 's'} ×{' '}
              {parsedTrainSizes.length} size
              {parsedTrainSizes.length === 1 ? '' : 's'}, that's{' '}
              <strong>{providers.length * parsedTrainSizes.length}</strong>{' '}
              packages to hand out.
            </div>
          </div>

          <div className="check-summary">
            {parsedTrainSizes.length === 0 && (
              <div className="warning">Enter at least one size to learn from.</div>
            )}
            {parsedTestSize === 0 && (
              <div className="warning">Enter how many photos to edit.</div>
            )}
            {providers.length === 0 && (
              <div className="warning">Add at least one AI service to compare.</div>
            )}
            {requiredImages > 0 && !enoughImages && (
              <div className="warning">
                You need {formatNum(requiredImages)} photos for this
                ({formatNum(parsedTestSize)} to edit +{' '}
                {formatNum(maxTrainSize)} to learn from), but only{' '}
                {formatNum(selectedImageCount)} are selected. Pick more folders,
                relax the filters, or lower the numbers above.
              </div>
            )}
          </div>
        </section>
      )}

      {master && (
        <section className="panel">
          <h2>5. Create the packages</h2>
          {!supportsDirectoryPicker() && (
            <p className="warning">
              This browser can't save a folder directly, so it will try to
              download the files one by one - which most browsers block after
              the first. Please use Chrome, Edge or Brave to create your
              packages.
            </p>
          )}
          <p className="muted">
            The tool now builds one package per AI service and saves everything
            into a folder you choose. Each package holds the photos that service
            learns from (your edited versions) and the photos it edits (reset to
            unedited). Inside Lightroom you'll be able to spot them easily: the
            photos to learn from are tagged 5★ with a <code>train</code> keyword,
            the photos to edit 1★ with a <code>test</code> keyword. A copy of your
            portfolio is saved
            alongside them as the reference the results get scored against, so
            the folder has everything the Analysis step needs.
          </p>
          <p className="muted small">
            Total size to save: roughly{' '}
            <strong>
              {(() => {
                const masterGB = master.bytes.byteLength / (1024 * 1024 * 1024);
                if (!master.totalImages) return '0.00';
                const perSplitFraction =
                  parsedTrainSizes.reduce((sum, t) => sum + t + parsedTestSize, 0) /
                  master.totalImages;
                const catalogsGB = masterGB * providers.length * perSplitFraction;
                return (catalogsGB + masterGB).toFixed(2);
              })()}{' '}
              GB
            </strong>
            .
          </p>

          <div className="row gap">
            <button
              type="button"
              className="filebutton primary"
              onClick={onGenerate}
              disabled={!canGenerate}
            >
              <span>
                {generating ? 'Creating…' : `Create ${providers.length * parsedTrainSizes.length} packages`}
              </span>
            </button>
            {generating && progress && (
              <div className="muted small">
                {progress.index} / {progress.total} - {progress.provider} / {progress.split}
              </div>
            )}
          </div>

          {generating && progress && (
            <div className="progress" style={{ marginTop: 12 }}>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(progress.index / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {statusMessages.length > 0 && (
            <ul className="output-log">
              {statusMessages.slice(-10).map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}

          {error && <p className="warning">{error}</p>}

          {doneInfo && !generating && (
            <div className="done-banner">
              <strong>All done.</strong> Saved{' '}
              {providers.length * parsedTrainSizes.length} packages to{' '}
              <em>{doneInfo.sinkLabel}</em>. Hand each one to its AI service;
              once they send back their edited catalogs, come back and load the
              folder to see the results.
              <div className="row gap" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="filebutton primary"
                  onClick={loadGeneratedIntoAnalyzer}
                >
                  <span>Open this in Analysis</span>
                </button>
                <span className="muted small">
                  (do this once the AI services return their edited catalogs)
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
