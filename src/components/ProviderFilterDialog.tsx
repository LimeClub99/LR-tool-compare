import { useState } from 'react';

interface Props {
  providers: string[];
  selected: string[];
  onClose: () => void;
  onApply: (selected: string[]) => void;
}

export function ProviderFilterDialog({ providers, selected, onClose, onApply }: Props) {
  const [local, setLocal] = useState<Set<string>>(new Set(selected));

  function toggle(p: string) {
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
          <h3>AI service filter</h3>
          <button type="button" className="link" onClick={onClose}>Close</button>
        </header>
        <p className="muted small">
          Deselect a service to hide it from every table and chart. Useful for
          comparing just a few at a time.
        </p>
        <ul className="checklist">
          {providers.map((p) => (
            <li key={p}>
              <label>
                <input type="checkbox" checked={local.has(p)} onChange={() => toggle(p)} />
                {p}
              </label>
            </li>
          ))}
        </ul>
        <footer className="modal-foot">
          <button type="button" onClick={() => setLocal(new Set(providers))}>Select all</button>
          <button type="button" onClick={() => setLocal(new Set())}>Deselect all</button>
          <div className="spacer" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="primary"
            disabled={local.size === 0}
            onClick={() => onApply(providers.filter((p) => local.has(p)))}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}
