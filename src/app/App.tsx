import { useState } from 'react';
import { History, LibraryBig, Settings } from 'lucide-react';
import { SettingsView } from '../settings/SettingsView';
import { useSettings } from '../settings/useSettings';
import { useReviewController } from '../workspace/useReviewController';
import { Workspace } from '../workspace/Workspace';

type AppView = 'workspace' | 'history' | 'settings';

export function App() {
  const [view, setView] = useState<AppView>('workspace');
  const settingsState = useSettings();
  const reviewController = useReviewController(settingsState.settings);
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <h1>PubMed 综述</h1>
          <nav className="topbar__actions" aria-label="主导航">
            <button type="button" className="icon-button" aria-pressed={view === 'workspace'} aria-label="工作台" title="工作台" onClick={() => setView('workspace')}><LibraryBig /></button>
            <button type="button" className="icon-button" aria-pressed={view === 'history'} aria-label="历史" title="历史" onClick={() => setView('history')}><History /></button>
            <button type="button" className="icon-button" aria-pressed={view === 'settings'} aria-label="设置" title="设置" onClick={() => setView('settings')}><Settings /></button>
          </nav>
        </div>
      </header>
      <main>
        {view === 'workspace' && <Workspace settings={settingsState.settings} controller={reviewController} onOpenSettings={() => setView('settings')} />}
        {view === 'history' && <section className="workspace"><h2>历史记录</h2></section>}
        {view === 'settings' && !settingsState.loading && (
          <SettingsView
            initial={settingsState.settings}
            models={settingsState.models}
            onTestDeepSeek={settingsState.testDeepSeek}
            onTestNcbi={settingsState.testNcbi}
            onSave={settingsState.save}
            onClearAll={settingsState.clearAll}
            onClearDeepSeekKey={settingsState.clearDeepSeekKey}
            onClearNcbiKey={settingsState.clearNcbiKey}
          />
        )}
      </main>
    </div>
  );
}
