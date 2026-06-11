import { useMemo } from 'react';
import { ParamRow, SummaryRow, formatBarPct, providersRankedByHandsFree, sharedSplits } from '../lib/comparison';
import { MetricKey, metricFor, PARAMETER_DISPLAY_NAMES, TARGET_PARAMETERS, TargetParam } from '../lib/config';
import { colorForIndex } from './chartColors';
import { niceAxisRange } from '../lib/axis';

interface Props {
  perParam: ParamRow[];
  summary: SummaryRow[];
  metric: MetricKey;
  splitFilter: string | null; // null = average across splits
}

export function PerParamBarChart({ perParam, summary, metric, splitFilter }: Props) {
  const info = metricFor(metric);
  const providers = useMemo(
    () => providersRankedByHandsFree(summary),
    [summary],
  );
  const visibleParams = useMemo(
    () => TARGET_PARAMETERS.filter((p) => perParam.some((r) => r.param === p)),
    [perParam],
  );

  // When averaging (splitFilter === null), only include sizes every provider
  // shares, so the average isn't skewed by a split only one tool ran.
  const shared = useMemo(() => sharedSplits(perParam), [perParam]);

  // build value matrix: param -> provider -> value
  const matrix = useMemo(() => {
    const m = new Map<TargetParam, Map<string, number>>();
    for (const param of visibleParams) {
      const inner = new Map<string, number>();
      for (const prov of providers) {
        const rows = perParam.filter((r) => r.provider === prov && r.param === param && (splitFilter === null ? shared.has(r.split) : r.split === splitFilter));
        if (rows.length === 0) continue;
        const vals = rows.map((r) => (r as any)[metric] as number).filter((v) => isFinite(v));
        if (vals.length === 0) continue;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        inner.set(prov, avg);
      }
      m.set(param, inner);
    }
    return m;
  }, [perParam, metric, splitFilter, providers, visibleParams, shared]);

  const W = 980;
  const H = 360;
  const margin = { top: 16, right: 16, bottom: 80, left: 48 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  if (visibleParams.length === 0) return <p className="muted">No data.</p>;

  const groupW = innerW / visibleParams.length;
  const barW = Math.min(28, (groupW - 12) / Math.max(1, providers.length));

  // False-origin y so differences read clearly across parameters of very
  // different scales (e.g. range-normalized accuracy clusters near the top).
  const allValues: number[] = [];
  for (const inner of matrix.values()) {
    for (const v of inner.values()) if (isFinite(v)) allValues.push(v);
  }
  const { min: yMin, max: yMax, ticks: yTicks } = niceAxisRange(allValues, 100);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  // Bars grow from the bottom when all-positive, or from the zero line when
  // the data dips negative (e.g. negative R²).
  const baseV = yMin > 0 ? yMin : 0;
  const yBase = y(baseV);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${info.fullName} per parameter`}>
        <g transform={`translate(${margin.left} ${margin.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="grid" />
              <text x={-8} y={y(t) + 4} textAnchor="end" className="tick">{t}%</text>
            </g>
          ))}
          {yMin < 0 && <line x1={0} x2={innerW} y1={yBase} y2={yBase} className="zero-axis" />}

          {visibleParams.map((param, gi) => {
            const cx = gi * groupW + groupW / 2;
            const inner = matrix.get(param)!;
            return (
              <g key={param}>
                <text x={cx} y={innerH + 20} textAnchor="middle" className="tick">
                  {PARAMETER_DISPLAY_NAMES[param]}
                </text>
                {providers.map((prov, pi) => {
                  const v = inner.get(prov);
                  if (v === undefined || !isFinite(v)) return null;
                  const x = cx - (providers.length * barW) / 2 + pi * barW;
                  const yV = y(v);
                  const yTop = Math.min(yV, yBase);
                  const bh = Math.max(0, Math.abs(yV - yBase));
                  const labelY = v >= baseV ? yTop - 5 : yTop + bh + 13;
                  return (
                    <g key={prov}>
                      <rect
                        x={x}
                        y={yTop}
                        width={barW - 2}
                        height={bh}
                        fill={colorForIndex(pi)}
                      >
                        <title>{`${prov} - ${PARAMETER_DISPLAY_NAMES[param]}: ${v.toFixed(1)}%`}</title>
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
          {providers.map((p, i) => (
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
