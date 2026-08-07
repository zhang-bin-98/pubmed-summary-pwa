import { useEffect, useState } from 'react';
import { History, LibraryBig, Settings } from 'lucide-react';
import { HistoryView } from '../history/HistoryView';
import { useHistory } from '../history/useHistory';
import { SettingsView } from '../settings/SettingsView';
import { useSettings } from '../settings/useSettings';
import { useReviewController } from '../workspace/useReviewController';
import { Workspace } from '../workspace/Workspace';

type AppView = 'workspace' | 'history' | 'settings';

export function App() {
  const [view, setView] = useState<AppView>('workspace');
  const [online, setOnline] = useState(() => navigator.onLine);
  const settingsState = useSettings();
  const reviewController = useReviewController(settingsState.settings);
  const historyState = useHistory(async (runId) => {
    setView('workspace');
    await reviewController.retry(runId);
  });

  useEffect(() => { if (view === 'history') void historyState.refresh(); }, [historyState.refresh, view]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
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
      {!online && <div className="offline-banner" role="status">当前离线：可查看历史并重新导出，不能发起新的 PubMed 或 DeepSeek 请求。</div>}
      <main>
        {view === 'workspace' && <Workspace settings={settingsState.settings} controller={reviewController} onOpenSettings={() => setView('settings')} online={online} />}
        {view === 'history' && <HistoryView runs={historyState.runs} error={historyState.error} storage={historyState.storage} onResume={historyState.resume} onDownloadDocx={historyState.downloadDocx} onExportJson={historyState.exportJson} onExportCsv={historyState.exportCsv} onDelete={historyState.deleteRun} onClear={historyState.clearHistory} />}
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
