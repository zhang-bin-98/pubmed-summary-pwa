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
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function canShareFiles(): boolean {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([0])], 'probe.docx', { type: DOCX_MIME_TYPE })] });
  } catch {
    return false;
  }
}

export async function shareBlob(blob: Blob, filename: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator.canShare !== 'function' || typeof navigator.share !== 'function') return 'unsupported';
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare({ files: [file] })) return 'unsupported';
  try {
    await navigator.share({ files: [file], ...(title ? { title } : {}) });
    return 'shared';
  } catch (error) {
    const aborted = (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError');
    if (aborted) return 'cancelled';
    throw error;
  }
}
