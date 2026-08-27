import { expect, it, vi } from 'vitest';
import type { Article, Checkpoint, ScreeningDecision } from '../domain/models';
import { countConfirmedQuery, createWorkflowDeps, generateConfirmedQuery } from './createWorkflowDeps';

it('uses original prompts for search, outline, and writing and the separate screening model', async () => {
  const complete = vi.fn().mockResolvedValueOnce('检索式').mockResolvedValueOnce('{"decisions":[]}').mockResolvedValueOnce('大纲').mockResolvedValueOnce('# 标题');
  const deps = createWorkflowDeps({ deepSeek: { complete }, ncbi: {}, repositories: {} } as never);
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

const articles: Article[] = Array.from({ length: 21 }, (_, sourceOrder) => ({
  id: `r:${sourceOrder + 1}`, runId: 'r', pmid: String(sourceOrder + 1), sourceOrder,
  title: `Title ${sourceOrder + 1}`, abstract: 'Abstract', authors: [], journal: '', journalAbbreviation: '', publicationDate: '', volume: '', issue: '', pages: '', affiliation: '',
}));

function screeningResponse(prompt: string): string {
  const start = prompt.lastIndexOf('[{"sourceId"');
  const batch = JSON.parse(prompt.slice(start)) as Array<{ sourceId: string }>;
  return JSON.stringify({ decisions: batch.map(({ sourceId }) => ({ sourceId, score: 3, include: true, reason: '相关' })) });
}

it('persists decisions before a completed-batch checkpoint and reports progress', async () => {
  vi.useFakeTimers();
  const writes: string[] = [];
  const saveScreening = vi.fn(async (batch: ScreeningDecision[]) => { writes.push(`decisions:${batch[0].articleId}`); });
  const saveCheckpoint = vi.fn(async (checkpoint: Checkpoint) => { writes.push(checkpoint.id); });
  const complete = vi.fn(async ({ prompt }: { prompt: string }) => screeningResponse(prompt));
  const deps = createWorkflowDeps({
    deepSeek: { complete },
    ncbi: {} as never,
    repositories: { saveScreening, saveCheckpoint, getRunBundle: vi.fn(async () => undefined) },
  });
  const progress = vi.fn();
  const pending = deps.screenArticles(articles, { runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, contextWindow: 1_000_000, signal: new AbortController().signal }, progress);
  await vi.runAllTimersAsync();
  await pending;
  vi.useRealTimers();
  expect(writes).toEqual(expect.arrayContaining(['decisions:r:1', 'decisions:r:21', 'r:screening-batch:0', 'r:screening-batch:1']));
  expect(writes.indexOf('decisions:r:1')).toBeLessThan(writes.indexOf('r:screening-batch:0'));
  expect(writes.indexOf('decisions:r:21')).toBeLessThan(writes.indexOf('r:screening-batch:1'));
  expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, processed: 21, included: 21 });
});

it('resumes only batches whose checkpoint and saved decisions exactly match', async () => {
  vi.useFakeTimers();
  const firstBatchDecisions: ScreeningDecision[] = articles.slice(0, 20).map((article) => ({
    id: `${article.id}:screening`, runId: 'r', articleId: article.id, score: 3, include: true, reason: '相关', promptVersion: 'relevance-v1',
  }));
  const checkpoint: Checkpoint = {
    id: 'r:screening-batch:0', runId: 'r', stage: 'screening', completedAt: 1,
    payload: { runId: 'r', batchIndex: 0, totalBatches: 2, articleIds: articles.slice(0, 20).map(({ id }) => id), completedAt: 1 },
  };
  const complete = vi.fn(async ({ prompt }: { prompt: string }) => screeningResponse(prompt));
  const deps = createWorkflowDeps({
    deepSeek: { complete },
    ncbi: {} as never,
    repositories: { getRunBundle: vi.fn(async () => ({ checkpoints: [checkpoint], screening: firstBatchDecisions })) },
  });
  const pending = deps.screenArticles(articles, { runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, contextWindow: 1_000_000, signal: new AbortController().signal });
  await vi.runAllTimersAsync();
  const result = await pending;
  vi.useRealTimers();
  expect(complete).toHaveBeenCalledTimes(1);
  expect(result.map(({ article }) => article.id)).toEqual(articles.map(({ id }) => id));
});

it('loads only the complete stage checkpoint when batch checkpoints share its stage', async () => {
  const completeCheckpoint: Checkpoint = { id: 'r:screening', runId: 'r', stage: 'screening', completedAt: 3, payload: 'complete' };
  const deps = createWorkflowDeps({
    deepSeek: { complete: vi.fn() },
    ncbi: {} as never,
    repositories: { getRunBundle: vi.fn(async () => ({ checkpoints: [
      { id: 'r:screening-batch:0', runId: 'r', stage: 'screening' as const, completedAt: 1, payload: { batchIndex: 0 } },
      completeCheckpoint,
    ] })) },
  });
  await expect(deps.loadCheckpoint('screening', 'r')).resolves.toBe('complete');
});
