import { useState } from 'react';
import { PARAMETER_DISPLAY_NAMES, TARGET_PARAMETERS, TargetParam } from '../lib/config';

interface Props {
  selected: TargetParam[];
  onClose: () => void;
  onApply: (selected: TargetParam[]) => void;
}

export function ParameterFilterDialog({ selected, onClose, onApply }: Props) {
  const [local, setLocal] = useState<Set<TargetParam>>(new Set(selected));

  function toggle(p: TargetParam) {
    setLocal((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>Parameter filter</h3>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">
          Deselect parameters to remove them from all metrics. Useful for
          excluding sliders you rarely adjust (e.g. Saturation, Vibrance) that
          may obscure other results.
        </p>
        <ul className="checklist">
          {TARGET_PARAMETERS.map((p) => (
            <li key={p}>
              <label>
                <input type="checkbox" checked={local.has(p)} onChange={() => toggle(p)} />
                {PARAMETER_DISPLAY_NAMES[p]}
              </label>
            </li>
          ))}
        </ul>
        <footer className="modal-foot">
          <button type="button" onClick={() => setLocal(new Set(TARGET_PARAMETERS))}>Select all</button>
          <button type="button" onClick={() => setLocal(new Set())}>Deselect all</button>
          <div className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={local.size === 0}
            onClick={() => onApply(TARGET_PARAMETERS.filter((p) => local.has(p)))}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
