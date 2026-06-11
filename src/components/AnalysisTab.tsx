import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { store, useStore } from '../state/store';
import {
  METRICS,
  MetricKey,
  metricFor,
  PARAMETER_DISPLAY_NAMES,
  PARAMETER_UNITS,
  TARGET_PARAMETERS,
} from '../lib/config';
import { compareAll, formatSplit, sortSplits } from '../lib/comparison';
import { anonymizeResult, newAnonymizeSeed } from '../lib/anonymize';
import { reloadFromSource } from '../lib/loadBenchmark';
import { SummaryTable, SummaryExplainer } from './SummaryTable';
import { MetricCharts } from './MetricCharts';
import { RichText } from '../lib/richText';
import { MetricSettingsDialog } from './MetricSettingsDialog';
import { ParameterFilterDialog } from './ParameterFilterDialog';
import { ProviderFilterDialog } from './ProviderFilterDialog';
import { ReportDocument } from './ReportDocument';

// Top-level navigation: an Overview (the summary table) followed by one tab per
// metric (each showing that metric's charts stacked). This replaces the old
// metric dropdown + sub-tabs: the tab is the metric.
type View = 'overview' | MetricKey;

export function AnalysisTab({ onGoSetup }: { onGoSetup: () => void }) {
  const s = useStore();
  const [view, setView] = useState<View>('hir');
  const [showSettings, setShowSettings] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showProviderFilter, setShowProviderFilter] = useState(false);
  // Provider names to show. Empty Set = "not chosen yet" -> show all.
  const [shownProviders, setShownProviders] = useState<Set<string>>(new Set());
  // Empty = "not chosen yet"; we resolve that to the largest run below, so the
  // Per Parameter chart opens on the most-trained run. Any explicit choice
  // (including "Averaged across all") is non-empty and sticks across tabs.
  const [perParamSplit, setPerParamSplit] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  // The topbar's right-aligned action slot (rendered by App). We portal the
  // export buttons into it so they sit top-right in the shared bar while their
  // logic stays here.
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setActionsSlot(document.getElementById('topbar-actions'));
  }, []);

  // Once the report has been mounted into the DOM, open the print dialog. The
  // browser's "Save as PDF" turns the (screen-hidden) report into a clean PDF.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 100);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const ready = !!(s.truth && s.providerSettings.size > 0);

  async function refresh() {
    if (!s.sourceDirHandle) {
      // No re-readable handle (drag-drop / fallback input) - send them to Load.
      onGoSetup();
      return;
    }
    setRefreshing(true);
    setRefreshError(null);
    try {
      const err = await reloadFromSource(() => {});
      if (err) setRefreshError(err);
    } catch (err: any) {
      setRefreshError(err?.message ?? String(err));
    } finally {
      setRefreshing(false);
    }
  }

  const allProviders = useMemo(
    () => Array.from(s.providerSettings.keys()).sort((a, b) => a.localeCompare(b)),
    [s.providerSettings],
  );
  // Resolve the "show all when nothing chosen" rule, and drop any stale names
  // (e.g. after reloading a different benchmark).
  const visibleProviders = allProviders.filter(
    (p) => shownProviders.size === 0 || shownProviders.has(p),
  );

  const rawResult = useMemo(() => {
    if (!s.truth || s.providerSettings.size === 0) return null;
    const filtered =
      visibleProviders.length === s.providerSettings.size
        ? s.providerSettings
        : new Map(
            Array.from(s.providerSettings).filter(([p]) =>
              visibleProviders.includes(p),
            ),
          );
    return compareAll(s.truth, filtered, s.thresholds, s.paramFilter);
  }, [s.truth, s.providerSettings, s.thresholds, s.paramFilter, visibleProviders.join('|')]);

  // Everything the user sees - tables, charts, CSV export and the PDF - reads
  // from this view of the data, so anonymisation applies everywhere at once and
  // stays consistent across providers and between screen and report.
  const result = useMemo(
    () => (rawResult && s.anonymize ? anonymizeResult(rawResult, s.anonymizeSeed) : rawResult),
    [rawResult, s.anonymize, s.anonymizeSeed],
  );

  function toggleAnonymize() {
    if (s.anonymize) {
      store.set({ anonymize: false });
    } else {
      // Mint a fresh seed the first time so the offsets aren't predictable, but
      // keep any existing seed so previously shared numbers stay reproducible.
      store.set({ anonymize: true, anonymizeSeed: s.anonymizeSeed || newAnonymizeSeed() });
    }
  }

  if (!ready) {
    return (
      <section className="panel">
        <h2>Nothing to analyze yet</h2>
        <p>
          Load the reference catalog and at least one provider catalog on the{' '}
          <button type="button" className="link" onClick={onGoSetup}>Setup</button> tab.
        </p>
      </section>
    );
  }

  // Resolve the per-slider chart's default to the largest run.
  const splitsInResult = result
    ? sortSplits(Array.from(new Set(result.summary.map((r) => r.split))))
    : [];
  const largestSplit = splitsInResult.length ? splitsInResult[splitsInResult.length - 1] : '__all__';
  const effectivePerParamSplit = perParamSplit || largestSplit;

  // One flat CSV that drops straight into a spreadsheet for pivots and charts.
  // Long-ish schema: an "overall" row per tool/batch carrying the rolled-up
  // scores, plus one "slider" row per tool/batch/slider with the per-slider
  // scores (including Average miss in native units). This replaces the former
  // separate summary and per-parameter exports.
  function exportAllCsv() {
    if (!result) return;
    const cols = [
      'ai_tool',
      'photos_learned_from',
      'level',
      'slider',
      'matched_photos',
      'ready_to_deliver_pct',
      'sliders_on_target_pct',
      'matched_your_style_pct',
      'average_miss_native',
      'average_miss_units',
    ];
    const lines = [cols.join(',')];
    for (const r of result.summary) {
      lines.push(
        [
          r.provider,
          photosLearnedFrom(r.split),
          'overall',
          '',
          r.matched,
          num(r.hir),
          num(r.pwt),
          num(r.r2),
          '',
          '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    for (const r of result.perParam) {
      lines.push(
        [
          r.provider,
          photosLearnedFrom(r.split),
          'slider',
          PARAMETER_DISPLAY_NAMES[r.param],
          '',
          num(r.hir),
          num(r.pwt),
          num(r.r2),
          num(r.mae),
          PARAMETER_UNITS[r.param],
        ]
          .map(csvCell)
          .join(','),
      );
    }
    downloadFile('benchmark-data.csv', lines.join('\n'));
  }

  const metricInfo = view === 'overview' ? null : metricFor(view);

  return (
    <>
      <div className="analysis-layout">
        {/* ── Left: controls + context. Stays put while the right scrolls. ── */}
        <aside className="analysis-context">
          <section className="panel analysis-controls">
            <button
              type="button"
              className="cta"
              onClick={() => setShowSettings(true)}
              title="Set the per-slider tolerances that decide what counts as a good prediction"
            >
              Metric Settings: set your tolerances
            </button>
            <button type="button" onClick={() => setShowFilter(true)}>
              Parameter Filter ({s.paramFilter.length}/{TARGET_PARAMETERS.length})
            </button>
            <button
              type="button"
              onClick={() => setShowProviderFilter(true)}
              title="Choose which AI services to include in the tables and charts"
            >
              AI Service Filter ({visibleProviders.length}/{allProviders.length})
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              title={s.sourceDirHandle ? 'Re-read the catalogs from the source folder' : 'Reload from the Load tab'}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <label
              className="control anon-toggle"
              title="Nudge every photo count by a small random amount (+/- up to 250) so you can share results without revealing your exact set sizes. Applies to the dashboard and the PDF."
            >
              <input
                type="checkbox"
                role="switch"
                checked={s.anonymize}
                onChange={toggleAnonymize}
              />
              <span className="control-label">Anonymise my results</span>
            </label>
            {refreshError && <p className="warning" style={{ margin: '4px 0 0' }}>{refreshError}</p>}
          </section>

          <section className="panel analysis-explainer">
            {view === 'overview' || !metricInfo ? (
              <SummaryExplainer />
            ) : (
              <div className="metric-description">
                <p className="layer-label">What this tells you</p>
                <RichText text={metricInfo.description} />
                <p className="layer-label layer-label-technical">Technical</p>
                <RichText text={metricInfo.technical} pClassName="metric-technical" />
                <p className="muted">
                  {metricInfo.betterNote ??
                    (metricInfo.direction === 'higher' ? 'Higher is better.' : 'Lower is better.')}{' '}
                  {(view === 'pwt' || view === 'hir') && (
                    <span>Current tolerances: {thresholdSummary(s.thresholds)}</span>
                  )}
                </p>
              </div>
            )}
          </section>
        </aside>

        {/* ── Right: tabs + exports (fixed) over a scrolling content box. ── */}
        <main className="panel analysis-main">
          <div className="analysis-main-head">
            <nav className="primary-tabs">
              <button
                type="button"
                className={view === 'overview' ? 'primary-tab is-active' : 'primary-tab'}
                onClick={() => setView('overview')}
              >
                Overview
              </button>
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={view === m.key ? 'primary-tab is-active' : 'primary-tab'}
                  onClick={() => setView(m.key)}
                >
                  {m.fullName}
                </button>
              ))}
            </nav>
            {/* Per-slider batch selector lives on the tab bar so it stays in
                view rather than scrolling away with the charts. It only drives
                the "Per parameter" chart, so it is hidden on the Overview. */}
            {view !== 'overview' && (
              <label className="control analysis-head-control">
                <span className="control-label">Photos learned from</span>
                <select
                  value={effectivePerParamSplit}
                  onChange={(e) => setPerParamSplit(e.target.value)}
                >
                  <option value="__all__">Averaged across all</option>
                  {splitsInResult.map((sp) => (
                    <option key={sp} value={sp}>{formatSplit(sp)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="analysis-scroll">
            {result && view === 'overview' && <SummaryTable summary={result.summary} />}
            {result && view !== 'overview' && (
              <MetricCharts
                summary={result.summary}
                perParam={result.perParam}
                metric={view}
                thresholds={s.thresholds}
                perParamSplit={effectivePerParamSplit}
              />
            )}
          </div>
        </main>
      </div>

      {actionsSlot &&
        createPortal(
          <>
            <button
              type="button"
              className="primary"
              onClick={() => setPrinting(true)}
              disabled={printing || !result}
              title="Build a print-ready PDF report of the full analysis"
            >
              {printing ? 'Preparing report…' : 'Export PDF report'}
            </button>
            <button
              type="button"
              className="topbar-action"
              onClick={exportAllCsv}
              disabled={!result}
              title="Download every score - overall and per slider - as one spreadsheet-ready CSV"
            >
              Export all data (CSV)
            </button>
          </>,
          actionsSlot,
        )}

      {showSettings && (
        <MetricSettingsDialog
          thresholds={s.thresholds}
          onClose={() => setShowSettings(false)}
          onApply={(t) => {
            store.set({ thresholds: t });
            setShowSettings(false);
          }}
        />
      )}
      {showFilter && (
        <ParameterFilterDialog
          selected={s.paramFilter}
          onClose={() => setShowFilter(false)}
          onApply={(sel) => {
            store.set({ paramFilter: sel });
            setShowFilter(false);
          }}
        />
      )}
      {showProviderFilter && (
        <ProviderFilterDialog
          providers={allProviders}
          selected={visibleProviders}
          onClose={() => setShowProviderFilter(false)}
          onApply={(sel) => {
            // Selecting all collapses back to the "show all" empty-set state.
            setShownProviders(sel.length === allProviders.length ? new Set() : new Set(sel));
            setShowProviderFilter(false);
          }}
        />
      )}
      {printing && result &&
        createPortal(
          <ReportDocument
            summary={result.summary}
            perParam={result.perParam}
            thresholds={s.thresholds}
            anonymized={s.anonymize}
            generatedAt={new Date().toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          />,
          document.body,
        )}
    </>
  );
}

function thresholdSummary(thresholds: ReturnType<typeof useStore>['thresholds']): string {
  const groups = new Map<string, string[]>();
  for (const p of TARGET_PARAMETERS) {
    const v = thresholds[p].tolerance;
    const unit = PARAMETER_UNITS[p];
    const key = p === 'Exposure2012' ? `±${v.toFixed(2)} ${unit}` : `±${v.toFixed(0)} ${unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(PARAMETER_DISPLAY_NAMES[p]);
  }
  return Array.from(groups.entries())
    .map(([k, names]) => `${names.length <= 3 ? names.join(', ') : `${names[0]}, ${names[1]} +${names.length - 2}`}: ${k}`)
    .join(' | ');
}

/** Numeric training-set size for the CSV (e.g. "10125_train" -> 10125); falls
 *  back to the raw label for non-numeric split names. */
function photosLearnedFrom(split: string): string | number {
  const m = /^(\d+)_train$/.exec(split);
  return m ? parseInt(m[1], 10) : split;
}

/** Round a score to 2 decimals for the CSV; blank for non-finite values. */
function num(v: number): string {
  return isFinite(v) ? String(Math.round(v * 100) / 100) : '';
}

/** Minimal CSV escaping: quote anything with a comma, quote or newline. */
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadFile(name: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
