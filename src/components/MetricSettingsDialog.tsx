import { useState } from 'react';
import {
  PARAMETER_DISPLAY_NAMES,
  PARAMETER_THRESHOLD_DEFAULTS,
  PARAMETER_UNITS,
  TARGET_PARAMETERS,
  TargetParam,
  Thresholds,
} from '../lib/config';

interface Props {
  thresholds: Record<TargetParam, Thresholds>;
  onClose: () => void;
  onApply: (t: Record<TargetParam, Thresholds>) => void;
}

export function MetricSettingsDialog({ thresholds, onClose, onApply }: Props) {
  const [local, setLocal] = useState<Record<TargetParam, Thresholds>>(structuredClone(thresholds));

  function update(p: TargetParam, value: number) {
    setLocal((prev) => ({ ...prev, [p]: { tolerance: value } }));
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Metric Settings - Per-Parameter Thresholds</h3>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">
          Values are in the slider's native units (stops for Exposure, Kelvin for
          Temperature, points for all others). <strong>Tolerance</strong>: the AI's
          prediction must be within this range to count as acceptable. A single tolerance
          drives both <strong>Usable Sliders</strong> (counts each slider that passes)
          and <strong>Ready to Deliver</strong> (counts whole images where every slider passes).
        </p>
        <table className="thresholds-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Tolerance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TARGET_PARAMETERS.map((p) => {
              const unit = PARAMETER_UNITS[p];
              const step = p === 'Exposure2012' ? 0.01 : p === 'Temperature' ? 50 : 1;
              return (
                <tr key={p}>
                  <td>{PARAMETER_DISPLAY_NAMES[p]}</td>
                  <td>
                    <input
                      type="number"
                      step={step}
                      min={0}
                      value={local[p].tolerance}
                      onChange={(e) => update(p, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="muted">{unit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <footer className="modal-foot">
          <button
            type="button"
            onClick={() => {
              const defaults = structuredClone(PARAMETER_THRESHOLD_DEFAULTS);
              setLocal(defaults);
              onApply(defaults);
            }}
          >
            Reset defaults
          </button>
          <div className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={() => onApply(local)}>
            Apply & re-analyze
          </button>
        </footer>
      </div>
    </div>
  );
}
