import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Trash2, X } from 'lucide-react';
import { MIN_CONTEXT_WINDOW, normalizeBaseUrl, type DeepSeekModel } from '../api/deepseekClient';
import type { AppSettings } from '../domain/models';
import { DEFAULT_MODEL_ID, type DeepSeekTestResult } from './useSettings';

export interface SettingsViewProps {
  initial: AppSettings;
  models: DeepSeekModel[];
  onLoadDeepSeekModels?(settings: AppSettings, signal: AbortSignal): Promise<DeepSeekModel[]>;
  onTestDeepSeek(settings: AppSettings): Promise<boolean | DeepSeekTestResult | void> | boolean | DeepSeekTestResult | void;
  onTestNcbi(settings: AppSettings): Promise<boolean | void> | boolean | void;
  onSave(settings: AppSettings): Promise<void> | void;
  onClearAll(): Promise<void> | void;
  onClearDeepSeekKey?(): Promise<void> | void;
  onClearNcbiKey?(): Promise<void> | void;
  showApiKeyPrompt?: boolean;
}

function settingsChanged(current: AppSettings, saved: AppSettings): boolean {
  return current.deepSeekApiKey !== saved.deepSeekApiKey
    || current.ncbiApiKey !== saved.ncbiApiKey
    || current.baseUrl !== saved.baseUrl
    || current.modelId !== saved.modelId
    || current.maxResults !== saved.maxResults
    || current.contextWindow !== saved.contextWindow
    || current.connectionChecks.deepSeek !== saved.connectionChecks.deepSeek
    || current.connectionChecks.ncbi !== saved.connectionChecks.ncbi;
}

export function SettingsView({ initial, models, onLoadDeepSeekModels, onTestDeepSeek, onTestNcbi, onSave, onClearAll, onClearDeepSeekKey, onClearNcbiKey, showApiKeyPrompt = false }: SettingsViewProps) {
  const [draft, setDraft] = useState(initial);
  const [showDeepSeek, setShowDeepSeek] = useState(false);
  const [showNcbi, setShowNcbi] = useState(false);
  const [testing, setTesting] = useState<'deepSeek' | 'ncbi' | null>(null);
  const [testError, setTestError] = useState<string>();

  useEffect(() => setDraft(initial), [initial]);
  useEffect(() => {
    if (!onLoadDeepSeekModels || !draft.deepSeekApiKey.trim()) return;
    let normalizedBaseUrl: string;
    try { normalizedBaseUrl = normalizeBaseUrl(draft.baseUrl); } catch { return; }
    if (
      draft.modelId.trim()
      && draft.deepSeekApiKey.trim() === initial.deepSeekApiKey.trim()
      && normalizedBaseUrl === normalizeBaseUrl(initial.baseUrl)
    ) return;

    const controller = new AbortController();
    const snapshot = { key: draft.deepSeekApiKey, baseUrl: draft.baseUrl, modelId: draft.modelId };
    const timeout = window.setTimeout(() => {
      void onLoadDeepSeekModels(draft, controller.signal)
        .then((available) => {
          if (controller.signal.aborted) return;
          setDraft((current) => {
            if (current.deepSeekApiKey !== snapshot.key || current.baseUrl !== snapshot.baseUrl) return current;
            const selected = available.find((model) => model.id === current.modelId)
              ?? (current.modelId === snapshot.modelId ? available[0] : undefined);
            if (!selected) return current.modelId.trim() ? current : { ...current, modelId: DEFAULT_MODEL_ID };
            return {
              ...current,
              modelId: selected.id,
              contextWindow: Number.isInteger(selected.contextLength) && (selected.contextLength ?? 0) >= MIN_CONTEXT_WINDOW
                ? selected.contextLength!
                : current.contextWindow,
            };
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setDraft((current) => current.deepSeekApiKey === snapshot.key && current.baseUrl === snapshot.baseUrl && !current.modelId.trim()
            ? { ...current, modelId: DEFAULT_MODEL_ID }
            : current);
        });
    }, 350);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [draft.baseUrl, draft.deepSeekApiKey, initial.baseUrl, initial.deepSeekApiKey, onLoadDeepSeekModels]);

  const setKey = (provider: 'deepSeek' | 'ncbi', value: string) => {
    setDraft((current) => ({
      ...current,
      [provider === 'deepSeek' ? 'deepSeekApiKey' : 'ncbiApiKey']: value,
      connectionChecks: { ...current.connectionChecks, [provider]: 'untested' },
    }));
  };

  const setBaseUrl = (value: string) => {
    setDraft((current) => ({
      ...current,
      baseUrl: value,
      connectionChecks: { ...current.connectionChecks, deepSeek: 'untested' },
    }));
  };

  const testConnection = async (provider: 'deepSeek' | 'ncbi') => {
    setTesting(provider);
    setTestError(undefined);
    try {
      const result = provider === 'deepSeek' ? await onTestDeepSeek(draft) : await onTestNcbi(draft);
      if (result !== false) {
        const selectedModel = provider === 'deepSeek' && result && typeof result === 'object' ? result.selectedModel : undefined;
        setDraft((current) => ({
          ...current,
          ...(selectedModel ? {
            modelId: selectedModel.id,
            contextWindow: Number.isInteger(selectedModel.contextLength) && (selectedModel.contextLength ?? 0) >= MIN_CONTEXT_WINDOW
              ? selectedModel.contextLength!
              : current.contextWindow,
          } : {}),
          connectionChecks: { ...current.connectionChecks, [provider]: 'passed' },
        }));
      }
    } catch (error) {
      setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, [provider]: 'untested' } }));
      setTestError(error instanceof Error ? error.message : '连接测试失败');
    } finally {
      setTesting(null);
    }
  };

  let validBaseUrl = false;
  try { validBaseUrl = Boolean(normalizeBaseUrl(draft.baseUrl)); } catch { validBaseUrl = false; }
  const canSave = settingsChanged(draft, initial)
    && Boolean(draft.deepSeekApiKey.trim() && draft.modelId.trim())
    && validBaseUrl
    && draft.connectionChecks.deepSeek !== 'untested'
    && draft.connectionChecks.ncbi !== 'untested'
    && Number.isInteger(draft.contextWindow)
    && draft.contextWindow >= MIN_CONTEXT_WINDOW
    && Number.isInteger(draft.maxResults)
    && draft.maxResults >= 10
    && draft.maxResults <= 300;

  return (
    <section className="workspace" aria-labelledby="settings-heading">
      <div className="section-heading">
        <KeyRound aria-hidden="true" />
        <div><h2 id="settings-heading">设置</h2><p>AI 供应商、API 凭据与检索默认值</p></div>
      </div>
      {showApiKeyPrompt && <div className="alert alert--setup" role="alert"><strong>需要先完成设置</strong><p>请填写 AI API Key，并完成或跳过 AI 与 NCBI 连接测试，保存后即可开始生成综述。</p></div>}
      <div className="alert" role="alert">API Key 将保存在当前浏览器的 IndexedDB 中。共用设备或浏览器扩展可能读取本地数据，请仅在可信设备上使用。</div>
      <div className="alert" role="note">自定义 AI 供应商必须支持 OpenAI-compatible Chat Completions API、Bearer API Key 和浏览器 CORS。</div>
      {testError && <div className="alert alert--error" role="alert">{testError}</div>}

      <div className="settings-form">
        <label className="field" htmlFor="provider-base-url"><span>Chat Completions Base URL</span><input id="provider-base-url" className="input" type="url" inputMode="url" autoComplete="url" value={draft.baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <div className="field">
          <label htmlFor="deepseek-api-key">AI API Key</label>
          <span className="input-with-actions">
            <input id="deepseek-api-key" className="input" type={showDeepSeek ? 'text' : 'password'} autoComplete="off" value={draft.deepSeekApiKey} onChange={(event) => setKey('deepSeek', event.target.value)} />
            <button type="button" className="icon-button" aria-label={showDeepSeek ? '隐藏 AI API Key' : '显示 AI API Key'} title={showDeepSeek ? '隐藏 Key' : '显示 Key'} onClick={() => setShowDeepSeek((value) => !value)}>{showDeepSeek ? <EyeOff /> : <Eye />}</button>
            <button type="button" className="icon-button" aria-label="清除 AI API Key" title="清除 Key" onClick={() => { setKey('deepSeek', ''); void onClearDeepSeekKey?.(); }}><X /></button>
          </span>
        </div>
        <div className="form-grid">
          <label className="field"><span>AI 模型 ID</span><input className="input" list="provider-model-options" autoComplete="off" value={draft.modelId} onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))} /><datalist id="provider-model-options">{models.map((model) => <option key={model.id} value={model.id} />)}</datalist></label>
          <label className="field"><span>上下文长度</span><input className="input" type="number" min={MIN_CONTEXT_WINDOW} step={1000} value={draft.contextWindow} onChange={(event) => setDraft((current) => ({ ...current, contextWindow: Number(event.target.value) }))} /></label>
        </div>
        <div className="setting-actions">
          <button type="button" className="button button--secondary" disabled={!draft.deepSeekApiKey.trim() || !validBaseUrl || testing !== null} onClick={() => void testConnection('deepSeek')}>{testing === 'deepSeek' ? '测试中...' : '测试 AI 连接'}</button>
          <button type="button" className="button button--secondary" aria-label="跳过 AI 测试" onClick={() => setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, deepSeek: 'skipped' } }))}>跳过测试</button>
          {draft.connectionChecks.deepSeek !== 'untested' && <span className="connection-status"><CheckCircle2 />{draft.connectionChecks.deepSeek === 'passed' ? '已通过' : '已跳过'}</span>}
        </div>

        <div className="field">
          <label htmlFor="ncbi-api-key">My NCBI API Key（可选）</label>
          <span className="input-with-actions">
            <input id="ncbi-api-key" className="input" type={showNcbi ? 'text' : 'password'} autoComplete="off" value={draft.ncbiApiKey} onChange={(event) => setKey('ncbi', event.target.value)} />
            <button type="button" className="icon-button" aria-label={showNcbi ? '隐藏 My NCBI API Key' : '显示 My NCBI API Key'} title={showNcbi ? '隐藏 Key' : '显示 Key'} onClick={() => setShowNcbi((value) => !value)}>{showNcbi ? <EyeOff /> : <Eye />}</button>
            <button type="button" className="icon-button" aria-label="清除 My NCBI API Key" title="清除 Key" onClick={() => { setKey('ncbi', ''); void onClearNcbiKey?.(); }}><X /></button>
          </span>
          <small>留空时使用匿名访问，NCBI 请求速率限制为每秒 3 次。</small>
        </div>
        <div className="setting-actions">
          <button type="button" className="button button--secondary" disabled={testing !== null} onClick={() => void testConnection('ncbi')}>{testing === 'ncbi' ? '测试中...' : '测试 NCBI 连接'}</button>
          <button type="button" className="button button--secondary" aria-label="跳过 NCBI 测试" onClick={() => setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, ncbi: 'skipped' } }))}>跳过测试</button>
          {draft.connectionChecks.ncbi !== 'untested' && <span className="connection-status"><CheckCircle2 />{draft.connectionChecks.ncbi === 'passed' ? '已通过' : '已跳过'}</span>}
        </div>

        <label className="field"><span>默认抓取量</span><input className="input" type="number" min={10} max={300} step={10} value={draft.maxResults} onChange={(event) => setDraft((current) => ({ ...current, maxResults: Number(event.target.value) }))} /></label>
      </div>
      <div className="form-actions">
        <button type="button" className="button button--primary" disabled={!canSave} onClick={() => void onSave({ ...draft, baseUrl: normalizeBaseUrl(draft.baseUrl) })}>保存设置</button>
        <button type="button" className="button button--danger" onClick={() => { if (window.confirm('清除全部本地设置、历史和凭据？')) void onClearAll(); }}><Trash2 />清除全部本地数据</button>
      </div>
    </section>
  );
}
