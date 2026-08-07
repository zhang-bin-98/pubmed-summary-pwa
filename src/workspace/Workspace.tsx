import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, Download, LoaderCircle, OctagonX, RotateCcw } from 'lucide-react';
import type { AppSettings, RunStats } from '../domain/models';
import type { GenerateQueryInput, ReviewControllerState, StartRunInput } from './useReviewController';

export interface WorkspaceController {
  state: ReviewControllerState;
  generateQuery(input: GenerateQueryInput): Promise<{ query: string; count: number } | undefined>;
  startRun(input: StartRunInput): Promise<void> | void;
  cancel(): void;
  download?(runId: string): Promise<void> | void;
  reset?(): void;
}

export interface WorkspaceProps {
  settings: AppSettings;
  controller: WorkspaceController;
  onOpenSettings?(): void;
}

const STAGES = [
  ['fetching', '获取 PubMed 文献'],
  ['screening', '筛选相关性'],
  ['outlining', '选择上下文并生成大纲'],
  ['writing', '撰写综述正文'],
  ['validating-citations', '校验并重排引用'],
  ['exporting', '生成 Word 文档'],
  ['completed', '完成'],
] as const;

function Stats({ stats }: { stats: RunStats }) {
  return <dl className="stats"><div><dt>已抓取</dt><dd>{stats.fetched ?? 0}</dd></div><div><dt>有摘要</dt><dd>{stats.withAbstract ?? 0}</dd></div><div><dt>相关</dt><dd>{stats.relevant ?? 0}</dd></div><div><dt>入选</dt><dd>{stats.selected ?? 0}</dd></div></dl>;
}

export function Workspace({ settings, controller, onOpenSettings }: WorkspaceProps) {
  const [topic, setTopic] = useState('');
  const [modelId, setModelId] = useState(settings.modelId);
  const [maxResults, setMaxResults] = useState(settings.maxResults);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const downloadedRunId = useRef<string | undefined>(undefined);
  const confirming = count !== null && controller.state.kind !== 'running' && controller.state.kind !== 'completed';

  useEffect(() => {
    if (controller.state.kind === 'confirming-query') {
      setQuery(controller.state.query);
      setCount(controller.state.count);
    }
  }, [controller.state]);

  useEffect(() => {
    if (controller.state.kind === 'completed' && downloadedRunId.current !== controller.state.runId) {
      downloadedRunId.current = controller.state.runId;
      void controller.download?.(controller.state.runId);
    }
  }, [controller, controller.state]);

  const runningState = controller.state.kind === 'running' ? controller.state : undefined;
  const currentStageIndex = useMemo(() => runningState
    ? Math.max(0, STAGES.findIndex(([stage]) => stage === runningState.progress.stage))
    : 0, [runningState]);

  if (controller.state.kind === 'running') {
    return <section className="workspace" aria-labelledby="workspace-heading"><h2 id="workspace-heading">正在生成综述</h2><div className="progress" aria-label="任务进度"><div className="progress__value" style={{ width: `${Math.round((controller.state.progress.completed / controller.state.progress.total) * 100)}%` }} /></div><div className="stage-list">{STAGES.map(([stage, label], index) => <div className="stage-row" key={stage}>{index < currentStageIndex ? <Check aria-hidden="true" /> : index === currentStageIndex ? <LoaderCircle aria-hidden="true" /> : <Circle aria-hidden="true" />}<span>{label}</span><small>{index < currentStageIndex ? '已完成' : index === currentStageIndex ? '进行中' : '等待中'}</small></div>)}</div><Stats stats={controller.state.stats} /><button type="button" className="button button--secondary" onClick={controller.cancel}><OctagonX />取消任务</button></section>;
  }

  if (controller.state.kind === 'completed') {
    const runId = controller.state.runId;
    return <section className="workspace" aria-labelledby="workspace-heading"><h2 id="workspace-heading">综述已完成</h2><Stats stats={controller.state.stats} /><div className="form-actions"><button type="button" className="button button--primary" onClick={() => void controller.download?.(runId)}><Download />再次下载</button><button type="button" className="button button--secondary" onClick={controller.reset}><RotateCcw />新建综述</button></div></section>;
  }

  if (controller.state.kind === 'failed' && !confirming) {
    const settingsError = controller.state.code === 'connection-required' || controller.state.code.includes('auth');
    return <section className="workspace"><div className="alert alert--error"><strong>任务未完成</strong><p>{controller.state.message}</p></div><div className="form-actions">{settingsError && <button type="button" className="button button--primary" onClick={onOpenSettings}>打开设置</button>}<button type="button" className="button button--secondary" onClick={controller.reset}>返回工作台</button></div></section>;
  }

  if (confirming) {
    return <section className="workspace" aria-labelledby="workspace-heading"><h2 id="workspace-heading">确认 PubMed 检索式</h2><label className="field"><span>PubMed 检索式</span><textarea className="input query-editor" value={query} onChange={(event) => setQuery(event.target.value)} /></label><p className="query-count">预计命中 {count} 篇</p><div className="form-actions"><button type="button" className="button button--secondary" onClick={() => { setCount(null); setQuery(''); controller.reset?.(); }}>返回修改</button><button type="button" className="button button--primary" disabled={!query.trim()} onClick={() => void controller.startRun({ topic, query, modelId, maxResults })}>开始生成</button></div></section>;
  }

  return <section className="workspace" aria-labelledby="workspace-heading"><div className="section-heading"><div><h2 id="workspace-heading">生成医学综述</h2><p>输入研究主题，确认检索式后开始</p></div></div><label className="field"><span>研究主题</span><textarea className="input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：近五年糖尿病视网膜病变的治疗进展" /></label><div className="form-grid"><label className="field"><span>DeepSeek 模型</span><select className="input" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value={settings.modelId}>{settings.modelId}</option></select></label><label className="field"><span>最大抓取量</span><input className="input" type="number" min={10} max={300} step={10} value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))} /></label></div><button type="button" className="button button--primary" disabled={!topic.trim() || maxResults < 10 || maxResults > 300 || controller.state.kind === 'generating-query'} onClick={async () => { const result = await controller.generateQuery({ topic, modelId }); if (result) { setQuery(result.query); setCount(result.count); } }}>{controller.state.kind === 'generating-query' ? '正在生成...' : '生成检索式'}</button></section>;
}
