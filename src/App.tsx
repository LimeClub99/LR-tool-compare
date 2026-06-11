import { useState } from 'react';
import { AboutTab } from './components/AboutTab';
import { CreateTab } from './components/CreateTab';
import { SetupTab } from './components/SetupTab';
import { AnalysisTab } from './components/AnalysisTab';

const TABS = ['About', 'Create', 'Load', 'Analysis'] as const;
type Tab = (typeof TABS)[number];

export function App() {
  const [tab, setTab] = useState<Tab>('About');
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">LR AI Editing Benchmark</div>
        <nav className="topbar-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={t === tab ? 'topbar-tab is-active' : 'topbar-tab'}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {/* Right-aligned action slot. The active tab can portal buttons in
            here (e.g. the Analysis tab's exports) without App owning them. */}
        <div className="topbar-actions" id="topbar-actions" />
      </header>
      <main className={tab === 'Analysis' ? 'app-main app-main-wide' : 'app-main'}>
        {tab === 'About' && <AboutTab onNext={() => setTab('Create')} />}
        {tab === 'Create' && <CreateTab onGoLoad={() => setTab('Load')} />}
        {tab === 'Load' && <SetupTab onLoaded={() => setTab('Analysis')} />}
        {tab === 'Analysis' && <AnalysisTab onGoSetup={() => setTab('Load')} />}
      </main>
    </div>
  );
}
