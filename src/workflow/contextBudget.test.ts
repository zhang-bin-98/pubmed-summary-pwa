import { describe, expect, it } from 'vitest';
import type { ScreenedArticle } from '../domain/models';
import { resolveContextWindow, selectWithinContext } from './contextBudget';

const article = (id: string, score: 0 | 1 | 2 | 3, abstract: string, sourceOrder: number): ScreenedArticle => ({
  article: { id, runId: 'run', pmid: id, sourceOrder, title: id, abstract, authors: [], journal: '', journalAbbreviation: '', publicationDate: '', volume: '', issue: '', pages: '', affiliation: '' },
  decision: { id, runId: 'run', articleId: id, score, include: true, reason: '', promptVersion: 'relevance-v1' },
});

describe('context budget', () => {
  it('selects whole articles by score then source order until the safe budget', () => {
    const result = selectWithinContext([
      article('a', 2, 'x'.repeat(100), 0),
      article('b', 3, 'x'.repeat(100), 1),
    ], { contextWindow: 2500, promptTokens: 100, outputReserve: 1500 });
    expect(result.selected.map((item) => item.article.id)[0]).toBe('b');
    expect(result.selected.every((item) => item.article.abstract.length === 100)).toBe(true);
  });

  it('uses only the manually configured context window', () => {
    expect(resolveContextWindow()).toBe(1_000_000);
    expect(resolveContextWindow(1_048_576)).toBe(1_048_576);
    expect(resolveContextWindow(15_999)).toBe(1_000_000);
  });
});
