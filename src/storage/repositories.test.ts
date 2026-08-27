import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { clearAllLocalData, getRunBundle, getSettings, saveRun, saveSettings } from './repositories';

describe('local repositories', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('persists the selected keys and defaults locally', async () => {
    await saveSettings({
      deepSeekApiKey: 'ds-key',
      ncbiApiKey: 'ncbi-key',
      baseUrl: 'https://api.deepseek.com',
      modelId: 'deepseek-v4-flash',
      maxResults: 300,
      contextWindow: 1_000_000,
      connectionChecks: { deepSeek: 'passed', ncbi: 'passed' },
    });
    expect(await getSettings()).toMatchObject({ modelId: 'deepseek-v4-flash', maxResults: 300 });
  });

  it('stores and reloads a complete run bundle transactionally', async () => {
    await saveRun({
      id: 'run-1',
      topic: '主题',
      query: null,
      modelId: 'deepseek-v4-flash',
      maxResults: 300,
      stage: 'draft',
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
      stats: {},
    });
    expect((await getRunBundle('run-1'))?.run.id).toBe('run-1');
    await clearAllLocalData();
    expect(await getSettings()).toBeUndefined();
  });
});
