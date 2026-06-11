import { useMemo } from 'react';
import { ParamRow, SummaryRow, providersRankedByHandsFree, sharedSplits } from '../lib/comparison';
import {
  PARAMETER_DISPLAY_NAMES,
  PARAMETER_THRESHOLD_DEFAULTS,
  PARAMETER_UNITS,
  TARGET_PARAMETERS,
  TargetParam,
  Thresholds,
} from '../lib/config';
import { colorForIndex } from './chartColors';

interface Props {
  perParam: ParamRow[];
  summary: SummaryRow[];
  splitFilter: string | null; // null = average across splits
  /** The per-slider tolerances the user set (native units). Drawn as a dotted
   *  reference line so every bar can be read against the user's own target. */
  thresholds?: Record<TargetParam, Thresholds>;
}

/** Format a native miss with sensible precision for its scale. */
function fmtVal(param: TargetParam, v: number): string {
  if (param === 'Exposure2012') return v.toFixed(2);
  if (param === 'Temperature') return Math.round(v).toLocaleString();
  return v.toFixed(1);
}

/**
 * Average miss (MAE) per slider, in each slider's NATIVE units. Because a
 * 200K Temperature miss and a 0.2-stop Exposure miss cannot share an axis,
 * every slider is framed on its OWN scale, sized to that slider's data and
 * tolerance so the bars fill the height instead of collapsing into a sliver.
 * Bar height encodes accuracy, so the smallest miss stands tallest; the dotted
 * line is the tolerance the user set, and a bar that rises above it is within
 * tolerance while one that falls short misses. Taller is better.
 */
export function PerParamMaeChart({ perParam, summary, splitFilter, thresholds }: Props) {
  const tol = thresholds ?? PARAMETER_THRESHOLD_DEFAULTS;
  const providers = useMemo(() => providersRankedByHandsFree(summary), [summary]);
  const visibleParams = useMemo(
    () => TARGET_PARAMETERS.filter((p) => perParam.some((r) => r.param === p)),
    [perParam],
  );

  // When averaging (splitFilter === null), only include sizes every provider
  // shares, so the average isn't skewed by a split only one tool ran.
  const shared = useMemo(() => sharedSplits(perParam), [perParam]);

  const matrix = useMemo(() => {
    const m = new Map<TargetParam, Map<string, number>>();
    for (const param of visibleParams) {
      const inner = new Map<string, number>();
      for (const prov of providers) {
        const rows = perParam.filter(
          (r) =>
            r.provider === prov &&
            r.param === param &&
            (splitFilter === null ? shared.has(r.split) : r.split === splitFilter),
        );
        const vals = rows.map((r) => r.mae).filter((v) => isFinite(v));
        if (vals.length === 0) continue;
        inner.set(prov, vals.reduce((a, b) => a + b, 0) / vals.length);
      }
      m.set(param, inner);
    }
    return m;
  }, [perParam, splitFilter, providers, visibleParams, shared]);

  const W = 980;
  const H = 380;
  const margin = { top: 34, right: 16, bottom: 96, left: 16 };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  if (visibleParams.length === 0) return <p className="muted">No data.</p>;

  const groupW = innerW / visibleParams.length;
  const barW = Math.min(26, (groupW - 14) / Math.max(1, providers.length));

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Average miss per slider, anchored to the tolerance you set"
      >
        <text x={margin.left} y={15} className="chart-note">
          Each slider has its own scale (Kelvin and points cannot share an axis). Taller is more
          accurate; a bar above the dotted tolerance line is within tolerance. Numbers are the real
          miss in native units.
        </text>
        <g transform={`translate(${margin.left} ${margin.top})`}>
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="zero-axis" />

          {visibleParams.map((param, gi) => {
            const cx = gi * groupW + groupW / 2;
            const inner = matrix.get(param)!;
            const vals = Array.from(inner.values()).filter((v) => isFinite(v));
            const target = tol[param].tolerance;
            // Each slider gets its OWN independent vertical scale: Temperature in
            // Kelvin has nothing to do with Vibrance in points. We frame the
            // visible range around THIS slider's own data and its tolerance, with
            // 15% breathing room, so the most accurate bar nearly fills the height
            // and the worst sits low - no dead band at the top the way anchoring
            // to a (never-achieved) zero miss left behind. Folding the tolerance
            // into the frame keeps its line on-screen - near the top when the
            // tolerance is stricter than every tool, near the bottom when it is
            // looser - and stops a cluster of tiny misses from being zoomed into
            // meaningless differences.
            const pts = vals.length ? vals : [target];
            const lo = Math.min(target, ...pts);
            const hi = Math.max(target, ...pts);
            const pad = (hi - lo) * 0.15 || Math.max(hi * 0.1, 1e-6);
            const axisLo = lo - pad;
            const span = hi + pad - axisLo || 1;
            // Taller = more accurate (a smaller miss). Rise above the tolerance
            // line and you are within tolerance; fall short of it and you miss.
            const accH = (v: number) =>
              Math.max(0, Math.min(innerH, ((hi + pad - v) / span) * innerH));
            const yTol = innerH - accH(target);
            const lineX1 = gi * groupW + 6;
            const lineX2 = gi * groupW + groupW - 6;
            return (
              <g key={param}>
                <text x={cx} y={innerH + 20} textAnchor="middle" className="tick">
                  {PARAMETER_DISPLAY_NAMES[param]}
                </text>
                <text x={cx} y={innerH + 33} textAnchor="middle" className="tick tick-unit">
                  ({PARAMETER_UNITS[param]})
                </text>
                {providers.map((prov, pi) => {
                  const v = inner.get(prov);
                  if (v === undefined || !isFinite(v)) return null;
                  const bh = accH(v);
                  const yTop = innerH - bh;
                  const x = cx - (providers.length * barW) / 2 + pi * barW;
                  const withinTol = v <= target;
                  return (
                    <g key={prov}>
                      <rect
                        x={x}
                        y={yTop}
                        width={barW - 2}
                        height={bh}
                        fill={colorForIndex(pi)}
                        opacity={withinTol ? 1 : 0.82}
                      >
                        <title>
                          {`${prov} - ${PARAMETER_DISPLAY_NAMES[param]}: ${fmtVal(param, v)} ${PARAMETER_UNITS[param]} (tolerance ${fmtVal(param, target)})`}
                        </title>
                      </rect>
                      <text
                        x={x + (barW - 2) / 2}
                        y={yTop - 5}
                        textAnchor="middle"
                        className="bar-label"
                      >
                        {fmtVal(param, v)}
                      </text>
                    </g>
                  );
                })}

                {/* Tolerance reference line for this slider, drawn LAST so it sits
                    on top of the bars. A white casing keeps the dashed accent line
                    and its number legible even where they cross a colored bar. */}
                <line x1={lineX1} x2={lineX2} y1={yTol} y2={yTol} className="tolerance-casing" />
                <line x1={lineX1} x2={lineX2} y1={yTol} y2={yTol} className="tolerance-line" />
                <text x={lineX2} y={yTol - 4} textAnchor="end" className="tolerance-label">
                  {fmtVal(param, target)}
                </text>
              </g>
            );
          })}
        </g>
        <g transform={`translate(${margin.left} ${H - 26})`}>
          {providers.map((p, i) => (
            <g key={p} transform={`translate(${i * 120} 0)`}>
              <rect x={0} y={0} width={12} height={12} fill={colorForIndex(i)} />
              <text x={18} y={10} className="legend">{p}</text>
            </g>
          ))}
          <g transform={`translate(${providers.length * 120} 0)`}>
            <line x1={0} x2={14} y1={6} y2={6} className="tolerance-line" />
            <text x={20} y={10} className="legend">Your tolerance</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
