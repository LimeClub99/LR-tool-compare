import {
  ParamRow,
  SummaryRow,
  formatSplit,
  providersRankedByHandsFree,
  sortSplits,
} from '../lib/comparison';
import {
  METRICS,
  PARAMETER_DISPLAY_NAMES,
  PARAMETER_UNITS,
  PARAMETER_THRESHOLD_DEFAULTS,
  TARGET_PARAMETERS,
  TargetParam,
  Thresholds,
} from '../lib/config';
import { OverallBarChart } from './OverallBarChart';
import { PerParamBarChart } from './PerParamBarChart';
import { PerParamMaeChart } from './PerParamMaeChart';
import { TrainingSizeLineChart } from './TrainingSizeLineChart';
import { SummaryTable } from './SummaryTable';
import { RichText, stripMarkup } from '../lib/richText';

interface Props {
  summary: SummaryRow[];
  perParam: ParamRow[];
  thresholds?: Record<TargetParam, Thresholds>;
  /** When true, the image counts in this report have been anonymised. */
  anonymized?: boolean;
  generatedAt: string;
}

/** Format a tolerance with sensible precision for its scale. */
function fmtTol(param: TargetParam, v: number): string {
  if (param === 'Exposure2012') return v.toFixed(2);
  if (param === 'Temperature') return Math.round(v).toLocaleString();
  return v.toFixed(0);
}

/**
 * A self-contained, print-friendly report. Hidden on screen (see
 * `.report-document` in styles.css) and revealed only inside `@media print`,
 * so the browser's "Save as PDF" produces a clean, vector document.
 */
export function ReportDocument({ summary, perParam, thresholds, anonymized, generatedAt }: Props) {
  const tol = thresholds ?? PARAMETER_THRESHOLD_DEFAULTS;
  const providers = providersRankedByHandsFree(summary);
  const splits = sortSplits(Array.from(new Set(summary.map((r) => r.split))));
  const sizeList = splits.map(formatSplit);

  const providerList =
    providers.length <= 1
      ? providers.join('')
      : `${providers.slice(0, -1).join(', ')} and ${providers[providers.length - 1]}`;

  const multipleSizes = splits.length > 1;

  // Largest training-set size that EVERY tool was tested on. The per-slider
  // charts compare tools here rather than averaging across sizes, so a tool is
  // never dragged down for having run a smaller set the others never attempted.
  const splitsByProvider = new Map<string, Set<string>>();
  for (const r of summary) {
    if (!splitsByProvider.has(r.provider)) splitsByProvider.set(r.provider, new Set());
    splitsByProvider.get(r.provider)!.add(r.split);
  }
  const sharedSplits = splits.filter((sp) =>
    Array.from(splitsByProvider.values()).every((set) => set.has(sp)),
  );
  const fairSplit = sharedSplits.length ? sharedSplits[sharedSplits.length - 1] : null;
  const perSliderCaption = fairSplit
    ? `Score for each slider at ${formatSplit(fairSplit)} (the most photos every tool learned from)`
    : 'Score for each slider (averaged across the different numbers of photos it learned from)';

  return (
    <div className="report-document" aria-hidden="true">
      {/* ── Cover ─────────────────────────────────────────────── */}
      <header className="report-cover">
        <p className="report-eyebrow">AI Editing Benchmark</p>
        <h1>How closely does each AI match your edits?</h1>
        <p className="report-lede">
          A side-by-side look at {providers.length}{' '}
          {providers.length === 1 ? 'editing tool' : 'editing tools'} measured against your own
          Lightroom adjustments.
        </p>
        <dl className="report-facts">
          <div>
            <dt>Tools compared</dt>
            <dd>{providerList || '-'}</dd>
          </div>
          <div>
            <dt>Photos learned from</dt>
            <dd>{sizeList.join(', ') || '-'}</dd>
          </div>

        </dl>
        {anonymized && (
          <p className="report-note report-anon-note">
            Image counts in this report have been anonymised: every training and test figure has been
            shifted by a small random amount and rounded away from its true value.
            The shape of every result is preserved, but the exact set sizes are not disclosed.
          </p>
        )}
      </header>

      {/* ── Basis of preparation ──────────────────────────────── */}
      <section className="report-section report-basis">
        <h2>Basis of preparation</h2>
        <p>
          Every score in this report rests on one judgment call: how close is close enough? A
          prediction is counted as a hit only when it lands within a set distance of the value you
          actually chose - the <strong>tolerance</strong>. Each slider has its own, because a
          200K shift in Temperature is barely perceptible while a 200-point shift in Contrast is
          significant.
        </p>
        <p>
          These are the tolerances in force for this report. They drive both Ready to Deliver and
          Usable Sliders, and they are the dotted reference lines on the Average Accuracy
          charts. 
        </p>
        <table className="report-basis-table">
          <thead>
            <tr>
              <th>Slider</th>
              <th className="num">Tolerance (plus or minus)</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            {TARGET_PARAMETERS.map((p) => (
              <tr key={p}>
                <td>{PARAMETER_DISPLAY_NAMES[p]}</td>
                <td className="num">{fmtTol(p, tol[p].tolerance)}</td>
                <td>{PARAMETER_UNITS[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-note">
          Tolerances are set under Metric Settings in the tool and saved with your preferences;
          this table records the values active when the report was generated.
        </p>
      </section>

      {/* ── What this report measures ─────────────────────────── */}
      <section className="report-section report-intro">
        <h2>What this report measures</h2>
        <p>
          Every tool here was given a batch of your photos to learn from, then asked to edit a
          separate batch on its own. Its edits on those photos were then compared with the edits you
          made yourself. No single number captures the whole picture, so the results are scored several
          different ways, each answering a different question:
        </p>
        <dl className="report-glossary">
          {METRICS.map((m) => (
            <div key={m.key}>
              <dt>{m.fullName}</dt>
              <dd>{stripMarkup(m.description.split('\n\n')[0])}</dd>
            </div>
          ))}
        </dl>
        {multipleSizes ? (
          <div className="report-howitworks">
            <p className="report-howitworks-label">Why the amount each tool learns from is varied</p>
            <p>
              A tool should match your style more closely the more of your photos it has learned from.
              Testing it once, with a single batch, shows only where it stands at that point. So each
              tool is tested several times - learning from, say, 2,000 of your photos, then 5,000, then
              10,000 - and all edit the same photos at each step.
            </p>
            <p>
              This is important to help understand real world usage. In normal use, images are continually
              added to a tool in the hope that it will become more accurate. This test reproduces that real-world
              usage and determines whether providers are actually learning, or whether they are failing to
              improve with increasing training sizes.
            </p>
            <p>
              For every measure below, the first chart plots the score against the number of photos
              each tool learned from. The per-slider chart then compares the tools at the most photos
              they all learned from, so none is judged on a batch the others never edited.
            </p>
          </div>
        ) : (
          <div className="report-howitworks">
            <p className="report-howitworks-label">A note on how much each tool learned from</p>
            <p>
              The scores below reflect a single batch - the number of your photos each tool learned
              from. The more of your work a tool sees, the better it should get at your style, so a
              result at one size is a snapshot rather than the whole story. Running the same tools on
              several batch sizes turns that snapshot into a curve, showing whether they keep improving
              with more of your photos or plateau early; it's worth testing more than one size before
              settling on a tool to live with.
            </p>
          </div>
        )}
      </section>

      {/* ── One detailed section per metric ───────────────────── */}
      {METRICS.map((m) => (
        <section key={m.key} className="report-section report-metric">
          <h2>{m.fullName}</h2>
          <p className="report-direction">
            {m.betterNote ?? (m.direction === 'higher' ? 'Higher is better.' : 'Lower is better.')}
          </p>

          <p className="report-layer-label">What this tells you</p>
          <RichText text={m.description} />

          <div className="report-howitworks">
            <p className="report-howitworks-label">Technical</p>
            <RichText text={m.technical} />
          </div>

          {/* Overall view. Average Accuracy is native-units with no rolled-up
              score, so it skips this chart. Ready to Deliver leads with bars,
              one group per number of photos learned from, then follows with the
              same scores drawn as a trend line - rather than a per-slider chart,
              which would only repeat Sliders on Target's breakdown. */}
          {!m.noOverall && (
            m.key === 'hir' ? (
              <figure className="report-figure">
                <figcaption>
                  {multipleSizes
                    ? 'How many photos you could deliver untouched, at each number of photos it learned from'
                    : 'Overall comparison'}
                </figcaption>
                <OverallBarChart summary={summary} metric={m.key} />
              </figure>
            ) : multipleSizes ? (
              <figure className="report-figure">
                <figcaption>How the score changes as it learns from more photos</figcaption>
                <TrainingSizeLineChart summary={summary} metric={m.key} />
              </figure>
            ) : (
              <figure className="report-figure">
                <figcaption>Overall comparison</figcaption>
                <OverallBarChart summary={summary} metric={m.key} />
              </figure>
            )
          )}

          {m.key === 'hir' ? (
            multipleSizes && (
              <figure className="report-figure">
                <figcaption>How the score changes as it learns from more photos</figcaption>
                <TrainingSizeLineChart summary={summary} metric={m.key} />
              </figure>
            )
          ) : (
            <figure className="report-figure">
              <figcaption>{perSliderCaption}</figcaption>
              {m.key === 'mae' ? (
                <PerParamMaeChart
                  perParam={perParam}
                  summary={summary}
                  splitFilter={fairSplit}
                  thresholds={tol}
                />
              ) : (
                <PerParamBarChart
                  perParam={perParam}
                  summary={summary}
                  metric={m.key}
                  splitFilter={fairSplit}
                />
              )}
            </figure>
          )}
        </section>
      ))}

      {/* ── Full numbers ──────────────────────────────────────── */}
      <section className="report-section report-table">
        <h2>All the numbers</h2>
        <p>
          The table below lists every score behind the charts, broken down by tool and number of
          photos it learned from. Each metric runs from this report's earlier definitions.
        </p>
        <SummaryTable summary={summary} />
      </section>

      <footer className="report-footer">
      </footer>
    </div>
  );
}
