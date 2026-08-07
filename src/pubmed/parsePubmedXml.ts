import { XMLParser } from 'fast-xml-parser';
import type { Article, Author } from '../domain/models';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const textOf = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
};

function formatPubDate(value: unknown): string {
  const date = (value ?? {}) as Record<string, unknown>;
  const year = textOf(date.Year);
  if (!year) return textOf(value);
  const month = textOf(date.Month);
  const day = textOf(date.Day);
  const monthNumber = month
    ? /^\d+$/.test(month)
      ? month.padStart(2, '0')
      : String(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(month.slice(0, 3)) + 1).padStart(2, '0')
    : '';
  const dayNumber = day ? day.padStart(2, '0') : '';
  return [year, monthNumber, dayNumber].filter(Boolean).join('-');
}

function parseAuthors(authorList: unknown): Author[] {
  return asArray((authorList as Record<string, unknown> | undefined)?.Author).map((authorValue) => {
    const author = (authorValue ?? {}) as Record<string, unknown>;
    const affiliationInfo = asArray((author.AffiliationInfo as Record<string, unknown> | undefined)?.AffiliationInfo ?? author.AffiliationInfo);
    const affiliation = affiliationInfo.length > 0
      ? textOf((affiliationInfo[0] as Record<string, unknown>).Affiliation)
      : '';
    return {
      lastName: textOf(author.LastName),
      foreName: textOf(author.ForeName),
      ...(textOf(author.CollectiveName) ? { collectiveName: textOf(author.CollectiveName) } : {}),
      ...(affiliation ? { affiliation } : {}),
    } as Author & { affiliation?: string };
  });
}

function parseAbstract(value: unknown): string {
  const parts = asArray((value as Record<string, unknown> | undefined)?.AbstractText).map((partValue) => {
    const part = (partValue ?? {}) as Record<string, unknown>;
    const body = textOf(partValue);
    const label = textOf(part['@_Label']);
    return body ? (label ? `[${label}] ${body}` : body) : '';
  }).filter(Boolean);
  return parts.join('\n\n');
}

export function parsePubmedXml(xml: string, runId: string, startOrder: number): Article[] {
  const root = parser.parse(xml)?.PubmedArticleSet as Record<string, unknown> | undefined;
  return asArray(root?.PubmedArticle).flatMap((entry, index) => {
    const pubmedArticle = entry as Record<string, unknown>;
    const citation = pubmedArticle.MedlineCitation as Record<string, unknown> | undefined;
    const article = citation?.Article as Record<string, unknown> | undefined;
    const pmid = textOf(citation?.PMID);
    if (!pmid || !article) return [];
    const journal = (article.Journal ?? {}) as Record<string, unknown>;
    const issue = (journal.JournalIssue ?? {}) as Record<string, unknown>;
    const pubDate = issue.PubDate;
    const pagination = (article.Pagination ?? {}) as Record<string, unknown>;
    const authorValues = parseAuthors(article.AuthorList);
    const authors: Author[] = authorValues.map(({ lastName, foreName, collectiveName }) => ({ lastName, foreName, collectiveName }));
    const affiliation = authorValues
      .map((author) => (author as Author & { affiliation?: string }).affiliation ?? '')
      .find(Boolean) ?? '';
    return [{
      id: `${runId}:${pmid}`,
      runId,
      pmid,
      sourceOrder: startOrder + index,
      title: textOf(article.ArticleTitle),
      abstract: parseAbstract(article.Abstract),
      authors,
      journal: textOf(journal.Title),
      journalAbbreviation: textOf(journal.ISOAbbreviation),
      publicationDate: formatPubDate(pubDate),
      volume: textOf(issue.Volume),
      issue: textOf(issue.Issue),
      pages: textOf(pagination.MedlinePgn),
      affiliation,
    }];
  });
}
