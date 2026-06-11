// Ordered to match Lightroom's Basic panel, top to bottom: White Balance
// (Temp, Tint), Tone (Exposure, Contrast, Highlights, Shadows, Whites, Blacks),
// then Presence (Vibrance, Saturation). Charts, the summary table, and the
// parameter-filter dialog all read this order.
export const TARGET_PARAMETERS = [
  'Temperature',
  'Tint',
  'Exposure2012',
  'Contrast2012',
  'Highlights2012',
  'Shadows2012',
  'Whites2012',
  'Blacks2012',
  'Vibrance',
  'Saturation',
] as const;

export type TargetParam = (typeof TARGET_PARAMETERS)[number];

export const PARAMETER_RANGES: Record<TargetParam, [number, number]> = {
  Exposure2012: [-5, 5],
  Shadows2012: [-100, 100],
  Highlights2012: [-100, 100],
  Whites2012: [-100, 100],
  Blacks2012: [-100, 100],
  Temperature: [2000, 50000],
  Tint: [-150, 150],
  Contrast2012: [-100, 100],
  Saturation: [-100, 100],
  Vibrance: [-100, 100],
};

export const PARAMETER_DEFAULTS: Record<TargetParam, number> = {
  Exposure2012: 0,
  Shadows2012: 0,
  Highlights2012: 0,
  Whites2012: 0,
  Blacks2012: 0,
  Temperature: 5500,
  Tint: 0,
  Contrast2012: 0,
  Saturation: 0,
  Vibrance: 0,
};

export const PARAMETER_DISPLAY_NAMES: Record<TargetParam, string> = {
  Exposure2012: 'Exposure',
  Shadows2012: 'Shadows',
  Highlights2012: 'Highlights',
  Whites2012: 'Whites',
  Blacks2012: 'Blacks',
  Temperature: 'Temperature',
  Tint: 'Tint',
  Contrast2012: 'Contrast',
  Saturation: 'Saturation',
  Vibrance: 'Vibrance',
};

export const PARAMETER_UNITS: Record<TargetParam, string> = {
  Exposure2012: 'stops',
  Shadows2012: 'pts',
  Highlights2012: 'pts',
  Whites2012: 'pts',
  Blacks2012: 'pts',
  Temperature: 'K',
  Tint: 'pts',
  Contrast2012: 'pts',
  Saturation: 'pts',
  Vibrance: 'pts',
};

export interface Thresholds {
  // A single per-parameter tolerance (native units) shared by both
  // % Within Tolerance (per-slider) and Hands-Free Rate (per-image).
  tolerance: number;
}

export const PARAMETER_THRESHOLD_DEFAULTS: Record<TargetParam, Thresholds> = {
  Exposure2012: { tolerance: 0.2 },
  Shadows2012: { tolerance: 5 },
  Highlights2012: { tolerance: 5 },
  Whites2012: { tolerance: 5 },
  Blacks2012: { tolerance: 5 },
  Temperature: { tolerance: 150 },
  Tint: { tolerance: 4 },
  Contrast2012: { tolerance: 5 },
  Saturation: { tolerance: 4 },
  Vibrance: { tolerance: 4 },
};

export function getNormalizedThresholds(
  native: Record<TargetParam, Thresholds>,
): Record<TargetParam, number> {
  const out = {} as Record<TargetParam, number>;
  for (const p of TARGET_PARAMETERS) {
    const [lo, hi] = PARAMETER_RANGES[p];
    out[p] = native[p].tolerance / (hi - lo);
  }
  return out;
}

export type MetricKey = 'hir' | 'pwt' | 'r2' | 'mae';

export interface MetricInfo {
  key: MetricKey;
  fullName: string;
  shortName: string;
  /** Two-line summary-table column header: a clear primary label... */
  columnLabel: string;
  /** ...and a small qualifier line beneath it, so the header is self-explaining. */
  columnSub: string;
  /** One plain-language sentence: the real-world question this column answers.
   *  Drives the summary-table explainer and the column tooltips. */
  question: string;
  /** Photographer-friendly layer: what it tells you, in plain terms. */
  description: string;
  /** High-level "how it works" layer: the math, kept accessible. */
  technical: string;
  direction: 'higher' | 'lower';
  /** Overrides the "Higher/Lower is better" line - e.g. for the MAE chart,
   *  where bars are read against the tolerance line and shorter is better. */
  betterNote?: string;
  /** True for metrics that live in native units and have no single rolled-up
   *  score (Average Accuracy): they only make sense per slider. */
  noOverall?: boolean;
}

export const METRICS: MetricInfo[] = [
  {
    key: 'hir',
    fullName: 'Ready to Deliver',
    shortName: 'Ready',
    columnLabel: 'Ready to deliver',
    columnSub: 'whole images, no touch-ups',
    question:
      'What share of the photos it edited were close enough on every single slider at once that you could send them out untouched?',
    direction: 'higher',
    description:
      'Of all the photos it edited, how many could you accept and deliver without touching a single slider?\n\nAn image only counts if every slider lands close enough; one bad prediction fails the whole image. A score of 30% means 300 of every 1,000 images can be delivered as they are.',
    technical:
      'This is the share of images on which every slider passes at once. It is the hardest metric to pass, because a single slider that marginally fails takes the whole image down with it.\n\nThe effect compounds quickly. If every slider were individually accurate to:\n\n- **85%** Only about 20% of images come out ready to deliver (0.85 to the tenth power).\n- **90%** About 35%.\n- **95%** About 60%.\n- **99%** Still only about 90%.\n\nThat steep curve is why this is almost always the lowest number on the board, it takes near-perfect per-slider accuracy to send most images out with no touch-ups at all.',
  },
  {
    key: 'pwt',
    fullName: 'Sliders on Target',
    shortName: 'Sliders',
    columnLabel: 'Sliders on target',
    columnSub: 'single sliders within tolerance',
    question:
      'Counting every slider on every photo, what share landed close enough to your value that you would leave them alone?',
    direction: 'higher',
    description:
      "Of every individual slider prediction, how many landed close enough that you would leave them alone?\n\nThis counts sliders, not whole images. A score of 85% means 15 of every 100 predictions still need fixing.",
    technical:
      'This is the per-slider pass rate: the share of individual slider predictions that fall within tolerance. It counts individual sliders rather than whole images, so one photo with five bad sliders adds five failures here. That is the difference from Ready to Deliver, which marks that same photo as a single failure once any slider misses.',
  },
  {
    key: 'r2',
    fullName: 'Matched Your Style',
    shortName: 'Style',
    columnLabel: 'Matched your style',
    columnSub: 'vs blindly repeating your average',
    question:
      'How much better than just repeating your average edit every time - did the tool actually read each photo and learn your style?',
    direction: 'higher',
    description:
      'How much better is the tool than blindly applying your average edit to every photo, the way a fixed preset would?\n\n- **100%** Reproduces your edits perfectly.\n- **0%** No better than your flat average.\n- **Negative** Worse than the average, which points to a fixed house style rather than yours.\n\nPut simply, a high score means it has learned your style; a negative score means it is imposing its own.',
    technical:
      "This is the standard coefficient of determination (R²). For each slider it weighs the tool's error against how much your own edits naturally vary, then averages those scores across all sliders. The yardstick it has to beat is your own average edit: the best possible one-size-fits-all version of you.\n\nMeasuring each slider against its own variation makes them directly comparable. Temperature in Kelvin and Exposure in stops land on the same chart, and genuine differences between providers stay visible instead of being squashed toward 100% the way a simple range-based score would be.",
  },
  {
    key: 'mae',
    fullName: 'Average Accuracy',
    shortName: 'Avg Acc',
    columnLabel: 'Average miss',
    columnSub: 'in each slider’s own units',
    question:
      'On average, how far off was each slider in its own units (stops, points, Kelvin), with nothing scaled or normalized?',
    direction: 'lower',
    betterNote:
      'Taller is better (a smaller miss). The dotted line is the tolerance you set - a bar that rises above it is within tolerance.',
    noOverall: true,
    description:
      "On average, how far off is each tool's slider, in the slider's own units? If you would have set Exposure to +0.50 and it predicted +0.30, that is a miss of 0.20 stops. This is the plain, traditional average error, with no normalizing or scaling.\n\nEach slider is anchored to the tolerance you set, drawn as a dotted line: a bar above the line is within tolerance, one below it misses. Taller is more accurate. Heights are scaled per slider, because a 200K Temperature miss and a 0.2-stop Exposure miss cannot share an axis; the number on each bar is the real average miss in native units.",
    technical:
      "This is the mean absolute error (MAE): the average of |predicted - your value| across all matched photos, computed per slider and kept in native units.\n\nUnlike R², nothing is divided by how much you moved the slider, so a slider you barely touched is not punished; the number is simply how far off the tool was, on average. For the same reason there is no single overall figure: averaging stops with Kelvin would be meaningless.",
  },
];

export function metricFor(key: MetricKey): MetricInfo {
  return METRICS.find((m) => m.key === key)!;
}
