import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, Trash2, X } from 'lucide-react';
import type { DeepSeekModel } from '../api/deepseekClient';
import type { AppSettings } from '../domain/models';

export interface SettingsViewProps {
  initial: AppSettings;
  models: DeepSeekModel[];
  onTestDeepSeek(settings: AppSettings): Promise<boolean | void> | boolean | void;
  onTestNcbi(settings: AppSettings): Promise<boolean | void> | boolean | void;
  onSave(settings: AppSettings): Promise<void> | void;
  onClearAll(): Promise<void> | void;
  onClearDeepSeekKey?(): Promise<void> | void;
  onClearNcbiKey?(): Promise<void> | void;
}

export function SettingsView({ initial, models, onTestDeepSeek, onTestNcbi, onSave, onClearAll, onClearDeepSeekKey, onClearNcbiKey }: SettingsViewProps) {
  const [draft, setDraft] = useState(initial);
  const [showDeepSeek, setShowDeepSeek] = useState(false);
  const [showNcbi, setShowNcbi] = useState(false);
  const [testing, setTesting] = useState<'deepSeek' | 'ncbi' | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const setKey = (provider: 'deepSeek' | 'ncbi', value: string) => {
    setDraft((current) => ({
      ...current,
      [provider === 'deepSeek' ? 'deepSeekApiKey' : 'ncbiApiKey']: value,
      connectionChecks: { ...current.connectionChecks, [provider]: 'untested' },
    }));
  };

  const testConnection = async (provider: 'deepSeek' | 'ncbi') => {
    setTesting(provider);
    try {
      const passed = provider === 'deepSeek' ? await onTestDeepSeek(draft) : await onTestNcbi(draft);
      if (passed !== false) {
        setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, [provider]: 'passed' } }));
      }
    } finally {
      setTesting(null);
    }
  };

  const canSave = Boolean(draft.deepSeekApiKey.trim() && draft.ncbiApiKey.trim())
    && draft.connectionChecks.deepSeek !== 'untested'
    && draft.connectionChecks.ncbi !== 'untested'
    && Number.isInteger(draft.maxResults)
    && draft.maxResults >= 10
    && draft.maxResults <= 300;

  return (
    <section className="workspace" aria-labelledby="settings-heading">
      <div className="section-heading">
        <KeyRound aria-hidden="true" />
        <div><h2 id="settings-heading">设置</h2><p>API 凭据与检索默认值</p></div>
      </div>
      <div className="alert" role="alert">API Key 将保存在当前浏览器的 IndexedDB 中。共用设备或浏览器扩展可能读取本地数据，请仅在可信设备上使用。</div>

      <div className="settings-form">
        <label className="field">
          <span>DeepSeek API Key</span>
          <span className="input-with-actions">
            <input className="input" type={showDeepSeek ? 'text' : 'password'} autoComplete="off" value={draft.deepSeekApiKey} onChange={(event) => setKey('deepSeek', event.target.value)} />
            <button type="button" className="icon-button" aria-label={showDeepSeek ? '隐藏 DeepSeek API Key' : '显示 DeepSeek API Key'} title={showDeepSeek ? '隐藏 Key' : '显示 Key'} onClick={() => setShowDeepSeek((value) => !value)}>{showDeepSeek ? <EyeOff /> : <Eye />}</button>
            <button type="button" className="icon-button" aria-label="清除 DeepSeek API Key" title="清除 Key" onClick={() => { setKey('deepSeek', ''); void onClearDeepSeekKey?.(); }}><X /></button>
          </span>
        </label>
        <div className="setting-actions">
          <button type="button" className="button button--secondary" disabled={!draft.deepSeekApiKey || testing !== null} onClick={() => void testConnection('deepSeek')}>{testing === 'deepSeek' ? '测试中...' : '测试 DeepSeek 连接'}</button>
          <button type="button" className="button button--secondary" aria-label="跳过 DeepSeek 测试" onClick={() => setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, deepSeek: 'skipped' } }))}>跳过测试</button>
          {draft.connectionChecks.deepSeek !== 'untested' && <span className="connection-status"><CheckCircle2 />{draft.connectionChecks.deepSeek === 'passed' ? '已通过' : '已跳过'}</span>}
        </div>

        <label className="field">
          <span>My NCBI API Key</span>
          <span className="input-with-actions">
            <input className="input" type={showNcbi ? 'text' : 'password'} autoComplete="off" value={draft.ncbiApiKey} onChange={(event) => setKey('ncbi', event.target.value)} />
            <button type="button" className="icon-button" aria-label={showNcbi ? '隐藏 My NCBI API Key' : '显示 My NCBI API Key'} title={showNcbi ? '隐藏 Key' : '显示 Key'} onClick={() => setShowNcbi((value) => !value)}>{showNcbi ? <EyeOff /> : <Eye />}</button>
            <button type="button" className="icon-button" aria-label="清除 My NCBI API Key" title="清除 Key" onClick={() => { setKey('ncbi', ''); void onClearNcbiKey?.(); }}><X /></button>
          </span>
        </label>
        <div className="setting-actions">
          <button type="button" className="button button--secondary" disabled={!draft.ncbiApiKey || testing !== null} onClick={() => void testConnection('ncbi')}>{testing === 'ncbi' ? '测试中...' : '测试 NCBI 连接'}</button>
          <button type="button" className="button button--secondary" aria-label="跳过 NCBI 测试" onClick={() => setDraft((current) => ({ ...current, connectionChecks: { ...current.connectionChecks, ncbi: 'skipped' } }))}>跳过测试</button>
          {draft.connectionChecks.ncbi !== 'untested' && <span className="connection-status"><CheckCircle2 />{draft.connectionChecks.ncbi === 'passed' ? '已通过' : '已跳过'}</span>}
        </div>

        <div className="form-grid">
          <label className="field"><span>DeepSeek 模型</span><select className="input" value={draft.modelId} onChange={(event) => setDraft((current) => ({ ...current, modelId: event.target.value }))}>{models.length === 0 && <option value={draft.modelId}>{draft.modelId}</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select></label>
          <label className="field"><span>默认抓取量</span><input className="input" type="number" min={10} max={300} step={10} value={draft.maxResults} onChange={(event) => setDraft((current) => ({ ...current, maxResults: Number(event.target.value) }))} /></label>
        </div>
      </div>
      <div className="form-actions">
        <button type="button" className="button button--primary" disabled={!canSave} onClick={() => void onSave(draft)}>保存设置</button>
        <button type="button" className="button button--danger" onClick={() => { if (window.confirm('清除全部本地设置、历史和凭据？')) void onClearAll(); }}><Trash2 />清除全部本地数据</button>
      </div>
    </section>
  );
}
