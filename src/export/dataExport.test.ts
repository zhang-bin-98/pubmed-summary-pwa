import { expect, it } from 'vitest';
import { buildArticlesCsv, buildRunJson } from './dataExport';

it('never exports API keys', () => {
  const json = buildRunJson({ run: { id: 'r', topic: '主题' }, articles: [], screening: [], artifact: {} });
  expect(json).not.toContain('deepSeekApiKey');
  expect(json).not.toContain('ncbiApiKey');
});

it('escapes commas and quotes in CSV', () => {
  expect(buildArticlesCsv([{ pmid: '1', title: 'A, "B"', journal: 'J', publicationDate: '2026', included: true, score: 3, reason: '相关' }]))
    .toContain('"A, ""B"""');
});
