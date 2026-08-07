import type { Article } from '../domain/models';

function authorLabel(lastName: string, foreName: string): string {
  const initial = foreName.trim().split(/[-\s]+/).filter(Boolean).map((part) => part[0]).join('');
  return [lastName.trim(), initial].filter(Boolean).join(' ');
}

export function formatAmaReference(article: Article): string {
  const namedAuthors = article.authors
    .filter((author) => author.lastName || author.foreName)
    .map((author) => authorLabel(author.lastName, author.foreName));
  const authors = namedAuthors.length > 6 ? `${namedAuthors.slice(0, 6).join(', ')}, et al` : namedAuthors.join(', ');
  const journal = article.journalAbbreviation || article.journal;
  const year = article.publicationDate.split('-')[0] || article.publicationDate;
  const volumeAndPages = article.volume
    ? `${article.volume}${article.issue ? `(${article.issue})` : ''}${article.pages ? `:${article.pages}` : ''}`
    : article.pages;
  const publication = [year, volumeAndPages].filter(Boolean).join(';');
  return `${authors ? `${authors}. ` : ''}${article.title}. ${journal}${publication ? ` ${publication}` : ''}. PMID: ${article.pmid}`;
}

export function buildEvidenceBundle(articles: Article[], context: { topic: string; currentDate: string }): string {
  const sections = [
    `# 医学文献综述 (${context.currentDate})`,
    `检索要求：${context.topic}`,
    `有效文献数：${articles.length}`,
  ];
  articles.forEach((article, index) => {
    sections.push([
      `**文献 ${index + 1}**`,
      `标题：${article.title}`,
      `作者：${article.authors.map((author) => author.collectiveName || authorLabel(author.lastName, author.foreName)).join(', ') || '未提供'}`,
      `期刊：${article.journalAbbreviation || article.journal}`,
      `发表日期：${article.publicationDate || '未提供'}`,
      `第一作者单位：${article.affiliation || '未提供'}`,
      `PMID：${article.pmid}`,
      `摘要：${article.abstract || '无摘要'}`,
    ].join('\n'));
  });
  return sections.join('\n\n');
}
