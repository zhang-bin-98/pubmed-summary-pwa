import { expect, it, vi } from 'vitest';
import { countConfirmedQuery, createWorkflowDeps, generateConfirmedQuery } from './createWorkflowDeps';

it('uses original prompts for search, outline, and writing and the separate screening model', async () => {
  const complete = vi.fn().mockResolvedValueOnce('检索式').mockResolvedValueOnce('{"decisions":[]}').mockResolvedValueOnce('大纲').mockResolvedValueOnce('# 标题');
  const deps = createWorkflowDeps({ deepSeek: { complete, listModels: vi.fn() }, ncbi: {}, repositories: {} } as never);
  expect(typeof deps.generateOutline).toBe('function');
  expect(typeof deps.generateReview).toBe('function');
});

it('generates and counts a query before a run is created', async () => {
  const complete = vi.fn().mockResolvedValue('(cancer[Title])');
  const signal = new AbortController().signal;
  expect(await generateConfirmedQuery('癌症', '2026-08-07', 'deepseek-v4-flash', { complete } as never, signal)).toBe('(cancer[Title])');
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-v4-flash' }));
  const count = vi.fn().mockResolvedValue(286);
  expect(await countConfirmedQuery('(cancer[Title])', { count } as never, signal)).toBe(286);
});
