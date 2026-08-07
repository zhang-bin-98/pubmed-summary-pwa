import { describe, expect, it } from 'vitest';
import sampleXml from '../../tests/fixtures/pubmed-sample.xml?raw';
import { parsePubmedXml } from './parsePubmedXml';

describe('parsePubmedXml', () => {
  it('normalizes structured abstracts without changing title case', () => {
    const articles = parsePubmedXml(sampleXml, 'run-1', 0);
    expect(articles[0]).toMatchObject({
      pmid: '123',
      title: 'Preserve THIS Title',
      publicationDate: '2026-08',
      journalAbbreviation: 'Ex J',
    });
    expect(articles[0].abstract).toBe('[BACKGROUND] First section.\n\n[RESULTS] Second section.');
  });
});
