// Pick a tight, honest y-axis range:
//   - Upper cap = smallest "nice" step at-or-above the data max (no slack).
//   - Lower bound stays at 0 unless the data minimum is well above zero,
//     in which case we floor below it for a true false origin.
//   - "Nice" step is chosen from the data span so ticks land on round %s.
//
// Bar charts must never zoom past their data: a bar's height should still
// reflect magnitude. A false origin only kicks in when it genuinely helps
// (data sits high above zero) rather than for cosmetic stretching.
export interface NiceRange {
  min: number;
  max: number;
  ticks: number[];
}

export function niceAxisRange(values: number[], fallbackMax: number): NiceRange {
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) {
    return { min: 0, max: fallbackMax, ticks: niceTicks(0, fallbackMax, 10) };
  }
  const dataMin = Math.min(...finite);
  const dataMax = Math.max(...finite);
  const span = Math.max(0.01, dataMax - dataMin);

  const step = pickStep(span);

  // Tight upper cap at the next step above dataMax. If dataMax already sits
  // exactly on a step boundary, leave one step of breathing room.
  let hi = Math.ceil(dataMax / step) * step;
  if (hi - dataMax < step * 0.05) hi += step;
  hi = Math.min(100, hi);

  // When data dips below zero (e.g. negative R²), extend the axis down to a
  // nice step below the minimum so those bars are drawn, not clipped.
  let lo: number;
  if (dataMin < 0) {
    lo = Math.floor(dataMin / step) * step;
  } else {
    // False origin only when the data minimum is far enough above zero that
    // suppressing the [0, dataMin) band actually reveals more detail.
    const useFalseOrigin = dataMin >= step * 2;
    lo = useFalseOrigin ? Math.floor(dataMin / step) * step : 0;
    if (useFalseOrigin && dataMin - lo < step * 0.05) lo = Math.max(0, lo - step);
  }

  return { min: lo, max: hi, ticks: niceTicks(lo, hi, step) };
}

function pickStep(span: number): number {
  if (span <= 10) return 2;
  if (span <= 25) return 5;
  if (span <= 60) return 10;
  return 20;
}

function niceTicks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi + 0.0001; v += step) {
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}
