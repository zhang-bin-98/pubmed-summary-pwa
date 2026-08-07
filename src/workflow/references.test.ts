import { expect, it } from 'vitest';
import type { Article } from '../domain/models';
import { buildEvidenceBundle, formatAmaReference } from './references';

const article: Article = {
  id: 'r:1', runId: 'r', pmid: '123', sourceOrder: 0, title: 'Preserve TITLE Case', abstract: 'Abstract',
  authors: [{ lastName: 'Wang', foreName: 'Li' }], journal: 'Example Journal', journalAbbreviation: 'Ex J',
  publicationDate: '2026-08', volume: '7', issue: '2', pages: '10-15', affiliation: '',
};

it('keeps source numbers stable and does not lowercase titles', () => {
  const bundle = buildEvidenceBundle([article], { topic: '主题', currentDate: '2026-08-07' });
  expect(bundle).toContain('# 医学文献综述 (2026-08-07)');
  expect(bundle).toContain('检索要求：主题');
  expect(bundle).toContain('**文献 1**');
  expect(formatAmaReference(article)).toContain('Preserve TITLE Case');
  expect(formatAmaReference(article)).toContain('2026;7(2):10-15');
  expect(formatAmaReference(article)).toContain('PMID: 123');
});
