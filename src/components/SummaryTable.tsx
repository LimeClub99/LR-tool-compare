import {
  SummaryRow,
  formatSplit,
  sortSplits,
} from '../lib/comparison';
import { METRICS } from '../lib/config';

function fmtPct(v: number): string {
  if (!isFinite(v)) return '-';
  return `${v.toFixed(1)}%`;
}

// Average Accuracy lives in native units and has no rolled-up score, so it
// gets no column here - it only appears in the per-slider chart.
const TABLE_METRICS = METRICS.filter((m) => !m.noOverall);

/**
 * Plain-language guide to the summary table. Shown in the static left-hand
 * context column while the Overview tab is active (the metric tabs show the
 * per-metric write-up there instead), so it never duplicates against the table.
 */
export function SummaryExplainer() {
  return (
    <div className="table-explainer">
      <p className="table-explainer-lede">
        Your scorecard at a glance. Every figure is a percentage and{' '}
        <strong>higher is always better</strong> - but each column answers a different question, so
        read them together rather than trusting any single one.
      </p>
      <dl className="table-explainer-legend">
        {TABLE_METRICS.map((m) => (
          <div key={m.key}>
            <dt>{m.columnLabel}</dt>
            <dd>{m.question}</dd>
          </div>
        ))}
      </dl>
      <p className="table-explainer-foot muted small">
        <strong>Ready to deliver</strong> is the hardest test of all - a whole image only counts if
        every slider passes at once - so it is normally the lowest number here, and a figure in the
        tens of percent is a strong result.
      </p>
    </div>
  );
}

interface Props {
  summary: SummaryRow[];
}

export function SummaryTable({ summary }: Props) {
  // Group by how many photos each tool learned from, largest batch first.
  // sortSplits is ascending, so reverse it for largest-on-top.
  const splitsDesc = sortSplits(Array.from(new Set(summary.map((r) => r.split)))).reverse();
  const splitRank = new Map(splitsDesc.map((s, i) => [s, i]));
  const rows = [...summary].sort((a, b) => {
    const ra = splitRank.get(a.split) ?? 0;
    const rb = splitRank.get(b.split) ?? 0;
    if (ra !== rb) return ra - rb;
    // Within a batch, rank tools by Ready to Deliver (hir), best on top.
    const ah = isFinite(a.hir) ? a.hir : -Infinity;
    const bh = isFinite(b.hir) ? b.hir : -Infinity;
    if (bh !== ah) return bh - ah;
    return a.provider.localeCompare(b.provider);
  });

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Photos learned from</th>
            <th>AI Tool</th>
            <th className="num">Matched</th>
            {TABLE_METRICS.map((m) => (
              <th key={m.key} className="num" title={m.question}>
                <span className="th-label">{m.columnLabel}</span>
                <span className="th-sub">{m.columnSub}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prevSplit = i > 0 ? rows[i - 1].split : null;
            const groupStart = r.split !== prevSplit;
            return (
              <tr key={`${r.split}-${r.provider}`} className={groupStart && i > 0 ? 'row-group-start' : ''}>
                <td>{groupStart ? formatSplit(r.split) : ''}</td>
                <td>{r.provider}</td>
                <td className="num">{r.matched.toLocaleString()}</td>
                {TABLE_METRICS.map((m) => (
                  <td key={m.key} className="num">{fmtPct((r as any)[m.key] as number)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {summary.length === 0 && <p className="muted">No data yet.</p>}
    </div>
  );
}
