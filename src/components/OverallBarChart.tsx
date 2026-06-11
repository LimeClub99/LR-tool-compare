import { useMemo } from 'react';
import {
  SummaryRow,
  formatBarPct,
  formatSplit,
  providersRankedByHandsFree,
  sortSplits,
} from '../lib/comparison';
import { MetricKey, metricFor } from '../lib/config';
import { colorForIndex } from './chartColors';
import { niceAxisRange } from '../lib/axis';

interface Props {
  summary: SummaryRow[];
  metric: MetricKey;
}

export function OverallBarChart({ summary, metric }: Props) {
  const data = useMemo(() => {
    const providers = providersRankedByHandsFree(summary);
    const splits = sortSplits(Array.from(new Set(summary.map((r) => r.split))));
    return { providers, splits };
  }, [summary]);

  const info = metricFor(metric);
  const W = 880;
  const H = 360;
  const margin = { top: 16, right: 16, bottom: 60, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  if (data.providers.length === 0) return <p className="muted">No data.</p>;

  const groupW = innerW / data.splits.length;
  const barW = Math.min(40, (groupW - 16) / Math.max(1, data.providers.length));

  // False-origin y so bar-height differences read clearly.
  const allValues = summary
    .map((r) => (r as any)[metric] as number)
    .filter((v) => isFinite(v));
  const { min: yMin, max: yMax, ticks: yTicks } = niceAxisRange(allValues, 100);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  // Bars grow from a baseline: the bottom when the axis is all-positive, or
  // the zero line when the data dips negative (e.g. negative R²).
  const baseV = yMin > 0 ? yMin : 0;
  const yBase = y(baseV);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${info.fullName} by provider and split`}>
        <g transform={`translate(${margin.left} ${margin.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="grid" />
              <text x={-8} y={y(t) + 4} textAnchor="end" className="tick">{t}%</text>
            </g>
          ))}
          {yMin < 0 && <line x1={0} x2={innerW} y1={yBase} y2={yBase} className="zero-axis" />}

          {data.splits.map((sp, gi) => {
            const cx = gi * groupW + groupW / 2;
            return (
              <g key={sp}>
                <text x={cx} y={innerH + 18} textAnchor="middle" className="tick">{formatSplit(sp)}</text>
                {data.providers.map((p, pi) => {
                  const row = summary.find((r) => r.provider === p && r.split === sp);
                  if (!row) return null;
                  const v = (row as any)[metric] as number;
                  if (!isFinite(v)) return null;
                  const x = cx - (data.providers.length * barW) / 2 + pi * barW;
                  const yV = y(v);
                  const yTop = Math.min(yV, yBase);
                  const bh = Math.max(0, Math.abs(yV - yBase));
                  const labelY = v >= baseV ? yTop - 5 : yTop + bh + 13;
                  return (
                    <g key={p}>
                      <rect
                        x={x}
                        y={yTop}
                        width={barW - 2}
                        height={bh}
                        fill={colorForIndex(pi)}
                      >
                        <title>{`${p} - ${formatSplit(sp)}: ${v.toFixed(1)}%`}</title>
                      </rect>
                      <text
                        x={x + (barW - 2) / 2}
                        y={labelY}
                        textAnchor="middle"
                        className="bar-label"
                      >
                        {formatBarPct(v)}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
        <g transform={`translate(${margin.left} ${H - 28})`}>
          {data.providers.map((p, i) => (
            <g key={p} transform={`translate(${i * 110} 0)`}>
              <rect x={0} y={0} width={12} height={12} fill={colorForIndex(i)} />
              <text x={18} y={10} className="legend">{p}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
