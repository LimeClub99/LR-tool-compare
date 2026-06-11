import {
  ParamRow,
  SummaryRow,
  formatSplit,
  sortSplits,
} from '../lib/comparison';
import { MetricKey, metricFor, TargetParam, Thresholds } from '../lib/config';
import { OverallBarChart } from './OverallBarChart';
import { TrainingSizeLineChart } from './TrainingSizeLineChart';
import { PerParamBarChart } from './PerParamBarChart';
import { PerParamMaeChart } from './PerParamMaeChart';

interface Props {
  summary: SummaryRow[];
  perParam: ParamRow[];
  metric: MetricKey;
  thresholds: Record<TargetParam, Thresholds>;
  /** Current "Photos learned from" choice for the per-slider chart; '__all__'
   *  means averaged across every batch size. Chosen on the tab bar (see
   *  AnalysisTab) so it stays in view, and lifted to the parent so the choice
   *  survives switching between metric tabs. */
  perParamSplit: string;
}

/**
 * The stacked chart column for a single metric tab. The leaf charts are the
 * same components the PDF report uses; this component only owns the on-screen
 * arrangement (all views stacked, scrollable, with an interactive per-slider
 * batch selector). The report keeps its own print-specific layout, so neither
 * medium has to bend to the other.
 */
export function MetricCharts({
  summary,
  perParam,
  metric,
  thresholds,
  perParamSplit,
}: Props) {
  const info = metricFor(metric);
  const splits = sortSplits(Array.from(new Set(summary.map((r) => r.split))));
  const multipleSizes = splits.length > 1;
  const effectiveSplit = perParamSplit || '__all__';

  const perSliderFigure = (
    <figure className="analysis-figure">
      <figcaption className="analysis-figure-head">
        <span className="analysis-figure-title">Per parameter</span>
        <span className="analysis-figure-sub muted small">
          {effectiveSplit === '__all__' ? 'Averaged across all batches' : formatSplit(effectiveSplit)}
        </span>
      </figcaption>
      {metric === 'mae' ? (
        <PerParamMaeChart
          perParam={perParam}
          summary={summary}
          splitFilter={effectiveSplit === '__all__' ? null : effectiveSplit}
          thresholds={thresholds}
        />
      ) : (
        <PerParamBarChart
          perParam={perParam}
          summary={summary}
          metric={metric}
          splitFilter={effectiveSplit === '__all__' ? null : effectiveSplit}
        />
      )}
    </figure>
  );

  // Average Accuracy lives in each slider's own units and has no rolled-up
  // score, so it is per-slider only.
  if (info.noOverall) {
    return (
      <div className="analysis-figures">
        <p className="muted analysis-figures-note">
          {info.fullName} has no single overall score - it lives in each slider's own units, so it
          is shown per slider only.
        </p>
        {perSliderFigure}
      </div>
    );
  }

  return (
    <div className="analysis-figures">
      <figure className="analysis-figure">
        <figcaption className="analysis-figure-head">
          <span className="analysis-figure-title">Overall comparison</span>
        </figcaption>
        <OverallBarChart summary={summary} metric={metric} />
      </figure>

      <figure className="analysis-figure">
        <figcaption className="analysis-figure-head">
          <span className="analysis-figure-title">As it learns more</span>
        </figcaption>
        {multipleSizes ? (
          <TrainingSizeLineChart summary={summary} metric={metric} />
        ) : (
          <p className="muted">
            Only one batch size was tested, so there is no trend to plot yet. Run the same tools on
            more batch sizes to see how the score moves as they learn from more of your photos.
          </p>
        )}
      </figure>

      {perSliderFigure}
    </div>
  );
}
