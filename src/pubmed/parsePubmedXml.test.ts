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

  it('decodes numeric character entities preserved by PubMed XML', () => {
    const xml = `
      <PubmedArticleSet>
        <PubmedArticle>
          <MedlineCitation>
            <PMID>42450303</PMID>
            <Article>
              <ArticleTitle>R&amp;#233;sum&amp;#233; of aging</ArticleTitle>
              <AuthorList><Author><LastName>C&amp;#x105;ka&amp;#x142;a-Jakimowicz</LastName><ForeName>Maria</ForeName></Author></AuthorList>
              <Journal><ISOAbbreviation>Example J</ISOAbbreviation><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
            </Article>
          </MedlineCitation>
        </PubmedArticle>
      </PubmedArticleSet>`;

    const [article] = parsePubmedXml(xml, 'run-1', 0);

    expect(article.title).toBe('R\u00e9sum\u00e9 of aging');
    expect(article.authors[0].lastName).toBe('C\u0105ka\u0142a-Jakimowicz');
  });
});
