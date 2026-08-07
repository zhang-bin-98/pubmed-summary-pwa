import { describe, expect, it, vi } from 'vitest';
import type { Article, ScreenedArticle, ScreeningDecision } from '../domain/models';
import { runWorkflow, type WorkflowDeps } from './runWorkflow';

const article: Article = { id: 'r:1', runId: 'r', pmid: '1', sourceOrder: 0, title: 'Title', abstract: 'Abstract', authors: [], journal: '', journalAbbreviation: '', publicationDate: '', volume: '', issue: '', pages: '', affiliation: '' };
const decision: ScreeningDecision = { id: 'r:r:1', runId: 'r', articleId: 'r:1', score: 3, include: true, reason: '相关', promptVersion: 'relevance-v1' };

describe('runWorkflow', () => {
  it('publishes screening batch progress with live article statistics', async () => {
    const progress = vi.fn();
    const deps: WorkflowDeps = {
      fetchArticles: vi.fn(async () => [article]),
      screenArticles: vi.fn(async (_articles, _input, onBatchProgress) => {
        onBatchProgress?.({ completed: 2, total: 15, processed: 40, included: 20 });
        return [{ article, decision }];
      }),
      selectArticles: vi.fn((items: ScreenedArticle[]) => items.map((item) => item.article)),
      generateOutline: vi.fn(async () => '大纲'),
      generateReview: vi.fn(async () => '# 标题\n\n正文[1]。'),
      validateCitations: vi.fn((markdown) => ({ title: '标题', markdown, references: ['Ref'] })),
      exportDocx: vi.fn(async () => undefined),
      loadCheckpoint: vi.fn(async () => undefined),
      checkpoint: vi.fn(async () => undefined),
      onProgress: progress,
    };
    await runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: new AbortController().signal }, deps);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'screening',
      message: expect.stringContaining('第 2/15 批'),
      stats: expect.objectContaining({ fetched: 1, withAbstract: 1, relevant: 20 }),
    }));
  });

  it('preserves the n8n stage order around the new screening stage', async () => {
    const calls: string[] = [];
    const deps: WorkflowDeps = {
      fetchArticles: vi.fn(async () => { calls.push('fetch'); return [article]; }),
      screenArticles: vi.fn(async () => { calls.push('screen'); return [{ article, decision }]; }),
      selectArticles: vi.fn((items: ScreenedArticle[]) => { calls.push('budget'); return items.map((item) => item.article); }),
      generateOutline: vi.fn(async () => { calls.push('outline'); return '大纲'; }),
      generateReview: vi.fn(async () => { calls.push('write'); return '# 标题\n\n正文[1]。'; }),
      validateCitations: vi.fn((markdown) => { calls.push('citations'); return { title: '标题', markdown, references: ['Ref'] }; }),
      exportDocx: vi.fn(async () => { calls.push('docx'); }),
      loadCheckpoint: vi.fn(async () => undefined),
      checkpoint: vi.fn(async () => undefined),
    };
    await runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: new AbortController().signal }, deps);
    expect(calls).toEqual(['fetch', 'screen', 'budget', 'outline', 'write', 'citations', 'docx']);
  });

  it('resumes from a screening checkpoint without fetching or screening again', async () => {
    const calls: string[] = [];
    const deps: WorkflowDeps = {
      fetchArticles: vi.fn(async () => { calls.push('fetch'); return [article]; }),
      screenArticles: vi.fn(async () => { calls.push('screen'); return [{ article, decision }]; }),
      selectArticles: vi.fn((items: ScreenedArticle[]) => { calls.push('budget'); return items.map((item) => item.article); }),
      generateOutline: vi.fn(async () => { calls.push('outline'); return '大纲'; }),
      generateReview: vi.fn(async () => { calls.push('write'); return '# 标题\n\n正文[1]。'; }),
      validateCitations: vi.fn((markdown) => { calls.push('citations'); return { title: '标题', markdown, references: ['Ref'] }; }),
      exportDocx: vi.fn(async () => { calls.push('docx'); }),
      loadCheckpoint: vi.fn(async (stage: string) => stage === 'screening' ? [{ article, decision }] : undefined) as WorkflowDeps['loadCheckpoint'],
      checkpoint: vi.fn(async () => undefined),
    };
    await runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: new AbortController().signal }, deps);
    expect(calls).toEqual(['budget', 'outline', 'write', 'citations', 'docx']);
  });

  it('retries citation generation once and cancels before starting a dependency', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchArticles = vi.fn();
    const deps: WorkflowDeps = {
      fetchArticles,
      screenArticles: vi.fn(),
      selectArticles: vi.fn(),
      generateOutline: vi.fn(),
      generateReview: vi.fn(),
      validateCitations: vi.fn(),
      exportDocx: vi.fn(),
      loadCheckpoint: vi.fn(async () => undefined),
      checkpoint: vi.fn(async () => undefined),
    };
    await expect(runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: controller.signal }, deps))
      .rejects.toMatchObject({ code: 'cancellation' });
    expect(fetchArticles).not.toHaveBeenCalled();
  });

  it('rewrites once with temperature zero when citation validation fails', async () => {
    const calls: string[] = [];
    let validationAttempts = 0;
    const deps: WorkflowDeps = {
      fetchArticles: vi.fn(async () => [article]),
      screenArticles: vi.fn(async () => [{ article, decision }]),
      selectArticles: vi.fn((items: ScreenedArticle[]) => items.map((item) => item.article)),
      generateOutline: vi.fn(async () => '大纲'),
      generateReview: vi.fn(async (_outline, _articles, _input, options) => {
        calls.push(options?.temperature === 0 ? 'rewrite' : 'write');
        return '# 标题\n\n正文[1]。';
      }),
      validateCitations: vi.fn((markdown) => {
        if (validationAttempts++ === 0) throw new Error('引用错误');
        return { title: '标题', markdown, references: ['Ref'] };
      }),
      exportDocx: vi.fn(async () => { calls.push('docx'); }),
      loadCheckpoint: vi.fn(async () => undefined),
      checkpoint: vi.fn(async () => undefined),
    };
    await runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: new AbortController().signal }, deps);
    expect(calls).toEqual(['write', 'rewrite', 'docx']);
  });
});
