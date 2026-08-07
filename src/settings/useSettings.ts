import { useCallback, useEffect, useState } from 'react';
import { DeepSeekClient, type DeepSeekModel } from '../api/deepseekClient';
import { NcbiClient } from '../api/ncbiClient';
import type { AppSettings } from '../domain/models';
import { clearAllLocalData, getSettings, saveSettings } from '../storage/repositories';

export const DEFAULT_SETTINGS: AppSettings = {
  deepSeekApiKey: '',
  ncbiApiKey: '',
  modelId: 'deepseek-v4-flash',
  maxResults: 300,
  connectionChecks: { deepSeek: 'untested', ncbi: 'untested' },
};

export function useSettings() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [models, setModels] = useState<DeepSeekModel[]>([]);

  useEffect(() => {
    let active = true;
    void getSettings().then((saved) => { if (active) setSettings(saved ?? DEFAULT_SETTINGS); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!settings.deepSeekApiKey) { setModels([]); return; }
    const controller = new AbortController();
    void new DeepSeekClient(settings.deepSeekApiKey).listModels(controller.signal)
      .then((available) => {
        setModels(available);
        if (!available.some((model) => model.id === settings.modelId) && available[0]) {
          setSettings((current) => ({ ...current, modelId: available[0].id }));
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [settings.deepSeekApiKey, settings.modelId]);

  const save = useCallback(async (next: AppSettings) => {
    await saveSettings(next);
    setSettings(next);
  }, []);

  const testDeepSeek = useCallback(async (next: AppSettings) => {
    const available = await new DeepSeekClient(next.deepSeekApiKey).listModels(new AbortController().signal);
    setModels(available);
    return true;
  }, []);

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
    testDeepSeek,
    testNcbi,
    skipDeepSeekTest,
    skipNcbiTest,
    clearDeepSeekKey,
    clearNcbiKey,
    clearAll,
  };
}
