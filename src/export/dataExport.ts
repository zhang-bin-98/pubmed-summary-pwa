export interface RunExportBundle {
  run: unknown;
  articles: unknown[];
  screening: unknown[];
  artifact: unknown;
}

export function buildRunJson(bundle: RunExportBundle): string {
  return JSON.stringify({ run: bundle.run, articles: bundle.articles, screening: bundle.screening, artifact: bundle.artifact }, null, 2);
}

export interface ArticleCsvRow {
  pmid: string;
  title: string;
  journal: string;
  publicationDate: string;
  included: boolean;
  score: number | '';
  reason: string;
}

const CSV_COLUMNS = ['pmid', 'title', 'journal', 'publicationDate', 'included', 'score', 'reason'] as const;

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildArticlesCsv(rows: ArticleCsvRow[]): string {
  const lines = [CSV_COLUMNS.join(','), ...rows.map((row) => CSV_COLUMNS.map((column) => escapeCsv(row[column])).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
