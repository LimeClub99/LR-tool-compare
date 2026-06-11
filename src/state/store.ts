import { useSyncExternalStore } from 'react';
import {
  PARAMETER_THRESHOLD_DEFAULTS,
  TARGET_PARAMETERS,
  TargetParam,
  Thresholds,
} from '../lib/config';
import type { BenchmarkConfig } from '../lib/benchmarkJson';
import type { DevelopSettings } from '../lib/catalog';

export type CellStatus =
  | { kind: 'pending' }
  | { kind: 'loading'; message: string }
  | { kind: 'done'; matched: number; coverage: number; loadedAt: number }
  | { kind: 'error'; error: string };

export interface AppState {
  config: BenchmarkConfig | null;
  configFileName: string | null;
  // FileSystemDirectoryHandle of the last picked folder, kept so Analysis can
  // re-read (refresh) from disk. Null when unavailable (drag-drop / fallback).
  sourceDirHandle: any | null;

  truth: Map<number, DevelopSettings> | null;
  truthFileName: string | null;
  truthStatus: CellStatus;

  // provider -> split -> { id_local -> DevelopSettings }
  providerSettings: Map<string, Map<string, Map<number, DevelopSettings>>>;
  // key = `${provider}__${split}`
  cellStatus: Map<string, CellStatus>;

  thresholds: Record<TargetParam, Thresholds>;
  paramFilter: TargetParam[];

  // When true, image counts (training sizes and matched test counts) shown in
  // the dashboard and PDF are nudged by +/- up to 250 images. The seed makes
  // those offsets deterministic, so they stay stable across re-renders and
  // match between the dashboard and the exported report. See lib/anonymize.ts.
  anonymize: boolean;
  anonymizeSeed: number;
}

const PREFS_KEY = 'lr-benchmark-prefs.v1';

interface SavedPrefs {
  thresholds?: Record<TargetParam, Thresholds>;
  paramFilter?: TargetParam[];
  anonymize?: boolean;
  anonymizeSeed?: number;
}

function loadPrefs(): Pick<AppState, 'thresholds' | 'paramFilter' | 'anonymize' | 'anonymizeSeed'> {
  const thresholds = structuredClone(PARAMETER_THRESHOLD_DEFAULTS);
  const paramFilter = [...TARGET_PARAMETERS];
  let anonymize = false;
  let anonymizeSeed = 0;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { thresholds, paramFilter, anonymize, anonymizeSeed };
    const parsed = JSON.parse(raw) as SavedPrefs;
    if (typeof parsed.anonymize === 'boolean') anonymize = parsed.anonymize;
    if (typeof parsed.anonymizeSeed === 'number') anonymizeSeed = parsed.anonymizeSeed;
    if (parsed.thresholds) {
      for (const p of TARGET_PARAMETERS) {
        const v = parsed.thresholds[p] as { tolerance?: number; fine?: number } | undefined;
        if (v && typeof v.tolerance === 'number') {
          thresholds[p] = { tolerance: v.tolerance };
        } else if (v && typeof v.fine === 'number') {
          // Migrate older prefs that stored separate fine/intervention values.
          thresholds[p] = { tolerance: v.fine };
        }
      }
    }
    let filter = paramFilter;
    if (Array.isArray(parsed.paramFilter) && parsed.paramFilter.length > 0) {
      filter = parsed.paramFilter.filter((p): p is TargetParam =>
        (TARGET_PARAMETERS as readonly string[]).includes(p),
      );
      if (filter.length === 0) filter = paramFilter;
    }
    return { thresholds, paramFilter: filter, anonymize, anonymizeSeed };
  } catch {
    return { thresholds, paramFilter, anonymize, anonymizeSeed };
  }
}

function savePrefs(s: AppState) {
  try {
    const data: SavedPrefs = {
      thresholds: s.thresholds,
      paramFilter: s.paramFilter,
      anonymize: s.anonymize,
      anonymizeSeed: s.anonymizeSeed,
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

const prefs = loadPrefs();

const initial: AppState = {
  config: null,
  configFileName: null,
  sourceDirHandle: null,
  truth: null,
  truthFileName: null,
  truthStatus: { kind: 'pending' },
  providerSettings: new Map(),
  cellStatus: new Map(),
  thresholds: prefs.thresholds,
  paramFilter: prefs.paramFilter,
  anonymize: prefs.anonymize,
  anonymizeSeed: prefs.anonymizeSeed,
};

let state: AppState = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const store = {
  get: () => state,
  set: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    if (
      p.thresholds ||
      p.paramFilter ||
      p.anonymize !== undefined ||
      p.anonymizeSeed !== undefined
    )
      savePrefs(state);
    emit();
  },
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function cellKey(provider: string, split: string): string {
  return `${provider}__${split}`;
}

export function setCellStatus(key: string, status: CellStatus) {
  store.set((s) => {
    const m = new Map(s.cellStatus);
    m.set(key, status);
    return { cellStatus: m };
  });
}

export function setProviderResult(
  provider: string,
  split: string,
  result: Map<number, DevelopSettings>,
) {
  store.set((s) => {
    const next = new Map(s.providerSettings);
    const inner = new Map(next.get(provider) ?? new Map());
    inner.set(split, result);
    next.set(provider, inner);
    return { providerSettings: next };
  });
}

export function clearAllResults() {
  store.set({
    truth: null,
    truthFileName: null,
    truthStatus: { kind: 'pending' },
    providerSettings: new Map(),
    cellStatus: new Map(),
  });
}
