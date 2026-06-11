import { ChangeEvent, useRef, useState } from 'react';
import {
  clearAllResults,
  store,
  useStore,
} from '../state/store';
import { sortSplits } from '../lib/comparison';
import {
  pickDirectoryFiles,
  supportsDirectoryPicker,
} from '../lib/dropzone';
import { autoLoad } from '../lib/loadBenchmark';

interface SetupTabProps {
  onLoaded?: () => void;
}

export function SetupTab({ onLoaded }: SetupTabProps) {
  const s = useStore();
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function runWithFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setProgressMsg('Scanning…');
    try {
      const err = await autoLoad(files, setProgressMsg);
      if (err) {
        setError(err);
      } else {
        setDone(true);
        onLoaded?.();
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
      setProgressMsg(null);
    }
  }

  async function onPickFolder() {
    try {
      if (supportsDirectoryPicker()) {
        const picked = await pickDirectoryFiles();
        if (picked) {
          store.set({ sourceDirHandle: picked.handle });
          await runWithFiles(picked.files);
        }
      } else {
        // Trigger hidden webkitdirectory input.
        const input = fallbackInputRef.current!;
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
        input.click();
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(err?.message ?? String(err));
    }
  }

  function onFallbackFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    // Fallback input gives no re-readable handle, so refresh won't be offered.
    store.set({ sourceDirHandle: null });
    void runWithFiles(files);
  }

  const cfg = s.config;
  const splits = cfg ? sortSplits(cfg.splits) : [];

  return (
    <section className="panel">
      <h2>Load your results</h2>
      <p className="muted">
        Once the AI services have sent back their edited catalogs, gather them
        back into the folder you created in the Create step, then pick that
        folder here. The tool reads your portfolio reference and every service's
        edits in one pass - then it's straight to Analysis.
      </p>

      <div className="row gap">
        <button
          type="button"
          className="filebutton primary"
          onClick={onPickFolder}
          disabled={busy}
        >
          <span>{busy ? 'Loading…' : 'Pick your results folder…'}</span>
        </button>
        <input
          ref={fallbackInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={onFallbackFiles}
        />
        {progressMsg && <span className="muted">{progressMsg}</span>}
      </div>

      {error && <p className="warning" style={{ marginTop: 12 }}>{error}</p>}

      {done && cfg && (
        <div className="done-banner" style={{ marginTop: 16 }}>
          <strong>Loaded.</strong> {cfg.providers.length} AI service
          {cfg.providers.length === 1 ? '' : 's'} × {splits.length} training
          size{splits.length === 1 ? '' : 's'}, plus your portfolio reference.
          Head to the Analysis tab to see how they compare.
          <button
            type="button"
            className="link"
            style={{ marginLeft: 12 }}
            onClick={() => {
              if (confirm('Discard loaded benchmark and start over?')) {
                store.set({ config: null, configFileName: null, sourceDirHandle: null });
                clearAllResults();
                setDone(false);
              }
            }}
          >
            load a different one
          </button>
        </div>
      )}
    </section>
  );
}
