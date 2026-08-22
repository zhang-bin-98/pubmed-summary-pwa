import { Download, FileJson, FileSpreadsheet, RotateCcw, Share2, Trash2 } from 'lucide-react';
import type { ReviewRun } from '../domain/models';

export interface HistoryViewProps {
  runs: ReviewRun[];
  error?: string;
  storage?: { usage?: number; quota?: number };
  canShare?: boolean;
  onResume(runId: string): Promise<void> | void;
  onDownloadDocx(runId: string): Promise<void> | void;
  onShareDocx?(runId: string): Promise<void> | void;
  onExportJson(runId: string): Promise<void> | void;
  onExportCsv(runId: string): Promise<void> | void;
  onDelete(runId: string): Promise<void> | void;
  onClear(): Promise<void> | void;
}

const STATUS_LABELS: Record<ReviewRun['status'], string> = { active: '进行中', completed: '已完成', cancelled: '已取消', failed: '失败' };

function formatBytes(value?: number): string {
  if (value === undefined) return '未知';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function HistoryView({ runs, error, storage, canShare, onResume, onDownloadDocx, onShareDocx, onExportJson, onExportCsv, onDelete, onClear }: HistoryViewProps) {
  return <section className="workspace" aria-labelledby="history-heading">
    <div className="section-heading"><div><h2 id="history-heading">历史记录</h2><p>{storage ? `本地占用 ${formatBytes(storage.usage)} / ${formatBytes(storage.quota)}` : '全部保存在当前设备'}</p></div>{runs.length > 0 && <button type="button" className="button button--secondary" onClick={() => { if (window.confirm('清除全部历史记录？设置和 API Key 将保留。')) void onClear(); }}><Trash2 />清除历史</button>}</div>
    {error && <div className="alert alert--error" role="alert">{error}</div>}
    {runs.length === 0 ? <p className="empty-state">暂无历史记录</p> : <div className="run-list">{runs.map((run) => {
      const completed = run.status === 'completed';
      return <article className="run-row" key={run.id}><div><strong className="run-row__title">{run.topic}</strong><p className="run-row__meta">{STATUS_LABELS[run.status]} · {new Date(run.updatedAt).toLocaleString('zh-CN')} · 抓取 {run.stats.fetched ?? 0} · 正文引用 {run.stats.selected ?? 0}</p></div><div className="menu-actions">{completed ? <><button type="button" className="icon-button" aria-label="再次下载 Word" title="再次下载 Word" onClick={() => void onDownloadDocx(run.id)}><Download /></button>{canShare && onShareDocx && <button type="button" className="icon-button" aria-label="用其他应用打开 Word" title="用其他应用打开 Word" onClick={() => void onShareDocx(run.id)}><Share2 /></button>}<button type="button" className="icon-button" aria-label="导出 JSON" title="导出 JSON" onClick={() => void onExportJson(run.id)}><FileJson /></button><button type="button" className="icon-button" aria-label="导出 CSV" title="导出 CSV" onClick={() => void onExportCsv(run.id)}><FileSpreadsheet /></button></> : <button type="button" className="icon-button" aria-label="继续运行" title="继续运行" onClick={() => void onResume(run.id)}><RotateCcw /></button>}<button type="button" className="icon-button" aria-label="删除记录" title="删除记录" onClick={() => { if (window.confirm(`删除“${run.topic}”？`)) void onDelete(run.id); }}><Trash2 /></button></div></article>;
    })}</div>}
  </section>;
}
