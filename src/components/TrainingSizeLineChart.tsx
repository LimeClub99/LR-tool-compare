import { useMemo } from 'react';
import { SummaryRow, providersRankedByHandsFree } from '../lib/comparison';
import { MetricKey, metricFor } from '../lib/config';
import { colorForIndex } from './chartColors';
import { niceAxisRange } from '../lib/axis';

function trainSize(split: string): number | null {
  const m = split.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function TrainingSizeLineChart({
  summary,
  metric,
}: {
  summary: SummaryRow[];
  metric: MetricKey;
}) {
  const info = metricFor(metric);
  const series = useMemo(() => {
    const byProvider = new Map<string, { x: number; y: number }[]>();
    for (const r of summary) {
      const x = trainSize(r.split);
      const y = (r as any)[metric] as number;
      if (x === null || !isFinite(y)) continue;
      if (!byProvider.has(r.provider)) byProvider.set(r.provider, []);
      byProvider.get(r.provider)!.push({ x, y });
    }
    for (const arr of byProvider.values()) arr.sort((a, b) => a.x - b.x);
    const order = providersRankedByHandsFree(summary);
    return order
      .filter((p) => byProvider.has(p))
      .map((provider) => ({ provider, points: byProvider.get(provider)! }));
  }, [summary, metric]);

  const W = 880;
  const H = 360;
  const margin = { top: 16, right: 16, bottom: 60, left: 56 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  const allX = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort((a, b) => a - b);
  if (allX.length === 0) return <p className="muted">No data.</p>;

  const xMin = allX[0];
  const xMax = allX[allX.length - 1];
  const xRange = Math.max(1, xMax - xMin);
  const x = (v: number) => ((v - xMin) / xRange) * innerW;

  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const { min: yMin, max: yMax, ticks: yTicks } = niceAxisRange(allY, 100);
  const y = (v: number) => innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${info.fullName} by number of photos learned from`}>
        <g transform={`translate(${margin.left} ${margin.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className="grid" />
              <text x={-8} y={y(t) + 4} textAnchor="end" className="tick">{t}%</text>
            </g>
          ))}
          {yMin < 0 && <line x1={0} x2={innerW} y1={y(0)} y2={y(0)} className="zero-axis" />}
          {allX.map((v) => (
            <text key={v} x={x(v)} y={innerH + 18} textAnchor="middle" className="tick">
              {v.toLocaleString()}
            </text>
          ))}
          {series.map((s, i) => {
            const color = colorForIndex(i);
            const d = s.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.x)} ${y(p.y)}`).join(' ');
            return (
              <g key={s.provider}>
                <path d={d} fill="none" stroke={color} strokeWidth={2} />
                {s.points.map((p, idx) => (
                  <circle key={idx} cx={x(p.x)} cy={y(p.y)} r={4} fill={color}>
                    <title>{`${s.provider} @ ${p.x.toLocaleString()}: ${p.y.toFixed(1)}%`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </g>
        <g transform={`translate(${margin.left} ${H - 28})`}>
          {series.map((s, i) => (
            <g key={s.provider} transform={`translate(${i * 110} 0)`}>
              <rect x={0} y={0} width={12} height={12} fill={colorForIndex(i)} />
              <text x={18} y={10} className="legend">{s.provider}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
