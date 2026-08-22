import { describe, expect, it, vi } from 'vitest';
import type { Article } from '../domain/models';
import { screenArticleBatch, screenArticlesParallel, validateScreeningBatch } from './relevance';

const articleIds = ['run:1', 'run:2'];

describe('screening validation', () => {
  it('accepts one decision for every requested article', () => {
    const parsed = validateScreeningBatch(JSON.stringify({ decisions: [
      { sourceId: 'run:1', score: 3, include: true, reason: '直接相关' },
      { sourceId: 'run:2', score: 0, include: false, reason: '主题不符' },
    ] }), articleIds);
    expect(parsed).toHaveLength(2);
  });

  it('rejects unknown, duplicate, or missing source IDs', () => {
    expect(() => validateScreeningBatch('{"decisions":[{"sourceId":"run:1","score":3,"include":true,"reason":"相关"}]}', articleIds))
      .toThrow('Screening IDs do not match batch');
    expect(() => validateScreeningBatch(JSON.stringify({ decisions: [
      { sourceId: 'run:1', score: 3, include: true, reason: '相关' },
      { sourceId: 'run:1', score: 3, include: true, reason: '重复' },
    ] }), articleIds)).toThrow('Screening IDs do not match batch');
  });
});

function makeArticles(count: number): Article[] {
  return Array.from({ length: count }, (_, sourceOrder) => ({
    id: `run:${sourceOrder + 1}`,
    runId: 'run',
    pmid: String(sourceOrder + 1),
    sourceOrder,
    title: `Title ${sourceOrder + 1}`,
    abstract: 'Abstract',
    authors: [],
    journal: '',
    journalAbbreviation: '',
    publicationDate: '',
    volume: '',
    issue: '',
    pages: '',
    affiliation: '',
  }));
}

function responseForPrompt(prompt: string): string {
  const start = prompt.lastIndexOf('[{"sourceId"');
  const sourceIds = (JSON.parse(prompt.slice(start)) as Array<{ sourceId: string }>).map(({ sourceId }) => sourceId);
  return JSON.stringify({ decisions: [...sourceIds].reverse().map((sourceId) => ({ sourceId, score: 3, include: true, reason: '相关' })) });
}

describe('parallel relevance screening', () => {
  it('screens one batch with one format retry and restores source order', async () => {
    const articles = makeArticles(2);
    const complete = vi.fn().mockResolvedValueOnce('{broken').mockImplementationOnce(async ({ prompt }) => responseForPrompt(prompt));
    const decisions = await screenArticleBatch('主题', articles, { complete } as never, 'model', new AbortController().signal);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(decisions.map(({ articleId }) => articleId)).toEqual(articles.map(({ id }) => id));
  });

  it('launches every batch at once without staggering', async () => {
    vi.useFakeTimers();
    const articles = makeArticles(300);
    const launchTimes: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const complete = vi.fn(async ({ prompt }: { prompt: string }) => {
      launchTimes.push(Date.now());
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      inFlight -= 1;
      return responseForPrompt(prompt);
    });
    const pending = screenArticlesParallel('主题', articles, { complete } as never, 'model', {
      signal: new AbortController().signal,
    });
    expect(maxInFlight).toBe(15);
    expect(launchTimes).toHaveLength(15);
    expect(launchTimes.every((time) => time === launchTimes[0])).toBe(true);
    await vi.advanceTimersByTimeAsync(40_000);
    const decisions = await pending;
    vi.useRealTimers();
    expect(decisions.map(({ articleId }) => articleId)).toEqual(articles.map(({ id }) => id));
  });

  it('skips completed batches and checkpoints in-flight batches despite a terminal failure', async () => {
    vi.useFakeTimers();
    const articles = makeArticles(140);
    const launched: string[] = [];
    const completedIndexes: number[] = [];
    const complete = vi.fn(async ({ prompt }: { prompt: string }) => {
      const start = prompt.lastIndexOf('[{"sourceId"');
      const firstId = (JSON.parse(prompt.slice(start)) as Array<{ sourceId: string }>)[0].sourceId;
      launched.push(firstId);
      if (firstId === 'run:41') throw new Error('terminal');
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return responseForPrompt(prompt);
    });
    const pending = screenArticlesParallel('主题', articles, { complete } as never, 'model', {
      signal: new AbortController().signal,
      onBatchComplete: (batchIndex) => {
        completedIndexes.push(batchIndex);
      },
      completedBatches: new Map([[0, makeArticles(20).map((article) => ({ id: `${article.id}:screening`, runId: 'run', articleId: article.id, score: 3 as const, include: true, reason: '相关', promptVersion: 'relevance-v1' as const }))]]),
    });
    const rejection = expect(pending).rejects.toThrow('terminal');
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
    vi.useRealTimers();
    expect(launched).not.toContain('run:1');
    expect(launched).toHaveLength(6);
    expect(completedIndexes.sort()).toEqual([1, 3, 4, 5, 6]);
  });

  it('rejects with AbortError when aborted after every batch is already in flight', async () => {
    const controller = new AbortController();
    const launched: string[] = [];
    const complete = vi.fn(({ prompt, signal }: { prompt: string; signal: AbortSignal }) => new Promise<string>((resolve, reject) => {
      const start = prompt.lastIndexOf('[{"sourceId"');
      launched.push((JSON.parse(prompt.slice(start)) as Array<{ sourceId: string }>)[0].sourceId);
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      void resolve;
    }));
    const pending = screenArticlesParallel('主题', makeArticles(300), { complete } as never, 'model', {
      signal: controller.signal,
    });
    expect(launched).toHaveLength(15);
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
  });

  it('accepts completed batch indexes as a scheduler resume hint', async () => {
    const articles = makeArticles(21);
    const complete = vi.fn(async ({ prompt }: { prompt: string }) => responseForPrompt(prompt));
    const decisions = await screenArticlesParallel('主题', articles, { complete } as never, 'model', {
      signal: new AbortController().signal,
      completedBatchIndexes: new Set([0]),
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(decisions.map(({ articleId }) => articleId)).toEqual(articles.slice(20).map(({ id }) => id));
  });
});
