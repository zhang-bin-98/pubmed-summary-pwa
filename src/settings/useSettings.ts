import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_BASE_URL, DEFAULT_CONTEXT_WINDOW, DeepSeekClient, type DeepSeekModel, MIN_CONTEXT_WINDOW, normalizeBaseUrl } from '../api/deepseekClient';
import { NcbiClient } from '../api/ncbiClient';
import type { AppSettings } from '../domain/models';
import { clearAllLocalData, getSettings, saveSettings } from '../storage/repositories';

export const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

export const DEFAULT_SETTINGS: AppSettings = {
  deepSeekApiKey: '',
  ncbiApiKey: '',
  baseUrl: DEFAULT_BASE_URL,
  modelId: DEFAULT_MODEL_ID,
  maxResults: 300,
  contextWindow: DEFAULT_CONTEXT_WINDOW,
  connectionChecks: { deepSeek: 'untested', ncbi: 'untested' },
};

export interface DeepSeekTestResult {
  selectedModel: DeepSeekModel;
}

export function normalizeSettings(saved?: Partial<AppSettings> | null): AppSettings {
  const candidate = saved ?? {};
  let baseUrl = DEFAULT_BASE_URL;
  try { baseUrl = normalizeBaseUrl(typeof candidate.baseUrl === 'string' ? candidate.baseUrl : DEFAULT_BASE_URL); } catch { /* fallback keeps legacy settings loadable */ }
  const contextWindow = typeof candidate.contextWindow === 'number' && Number.isInteger(candidate.contextWindow) && candidate.contextWindow >= MIN_CONTEXT_WINDOW
    ? candidate.contextWindow
    : DEFAULT_CONTEXT_WINDOW;
  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    baseUrl,
    contextWindow,
    connectionChecks: { ...DEFAULT_SETTINGS.connectionChecks, ...(candidate.connectionChecks ?? {}) },
  };
}

export function useSettings() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<DeepSeekModel[]>([]);

  useEffect(() => {
    let active = true;
    void getSettings().then((saved) => { if (active) setSettings(normalizeSettings(saved)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!settings.deepSeekApiKey) { setModels([]); return; }
    setModels([]);
    const controller = new AbortController();
    void new DeepSeekClient(settings.deepSeekApiKey, settings.baseUrl).listModels(controller.signal)
      .then((available) => {
        setModels(available);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [settings.deepSeekApiKey, settings.baseUrl]);

  const save = useCallback(async (next: AppSettings) => {
    const normalized = normalizeSettings(next);
    await saveSettings(normalized);
    setSettings(normalized);
  }, []);

  const loadDeepSeekModels = useCallback(async (next: AppSettings, signal = new AbortController().signal) => {
    const client = new DeepSeekClient(next.deepSeekApiKey, next.baseUrl);
    setModels([]);
    const available = await client.listModels(signal);
    setModels(available);
    return available;
  }, []);

  const testDeepSeek = useCallback(async (next: AppSettings) => {
    const client = new DeepSeekClient(next.deepSeekApiKey, next.baseUrl);
    const signal = new AbortController().signal;
    let available: DeepSeekModel[] = [];
    let modelError: unknown;
    try {
      available = await loadDeepSeekModels(next, signal);
    } catch (error) {
      setModels([]);
      modelError = error;
    }
    const requestedModel = next.modelId.trim();
    const selectedModel = available.find((model) => model.id === requestedModel)
      ?? available[0]
      ?? (requestedModel ? { id: requestedModel } : undefined);
    if (!selectedModel) throw modelError instanceof Error ? modelError : new Error('未获取到可用模型，请手动填写模型 ID 后重试');
    await client.complete({ model: selectedModel.id, prompt: 'Reply with OK.', signal, maxTokens: 8 });
    return { selectedModel } satisfies DeepSeekTestResult;
  }, [loadDeepSeekModels]);

  const testNcbi = useCallback(async (next: AppSettings) => {
    await new NcbiClient(next.ncbiApiKey).count('all[sb]', new AbortController().signal);
    return true;
  }, []);

  const clearAll = useCallback(async () => {
    await clearAllLocalData();
    setSettings(DEFAULT_SETTINGS);
    setModels([]);
  }, []);

  const clearDeepSeekKey = useCallback(() => save({ ...settings, deepSeekApiKey: '', connectionChecks: { ...settings.connectionChecks, deepSeek: 'untested' } }), [save, settings]);
  const clearNcbiKey = useCallback(() => save({ ...settings, ncbiApiKey: '', connectionChecks: { ...settings.connectionChecks, ncbi: 'untested' } }), [save, settings]);
  const skipDeepSeekTest = useCallback(() => save({ ...settings, connectionChecks: { ...settings.connectionChecks, deepSeek: 'skipped' } }), [save, settings]);
  const skipNcbiTest = useCallback(() => save({ ...settings, connectionChecks: { ...settings.connectionChecks, ncbi: 'skipped' } }), [save, settings]);

  return {
    loading,
    settings,
    models,
    deepSeekStatus: settings.connectionChecks.deepSeek,
    ncbiStatus: settings.connectionChecks.ncbi,
    save,
    loadDeepSeekModels,
    testDeepSeek,
    testNcbi,
    skipDeepSeekTest,
    skipNcbiTest,
    clearDeepSeekKey,
    clearNcbiKey,
    clearAll,
  };
}
