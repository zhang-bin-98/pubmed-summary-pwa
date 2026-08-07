import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';

function unwrapN8nExpression(raw: string): string {
  return raw.startsWith('=') ? raw.slice(1) : raw;
}

function bind(raw: string, values: Readonly<Record<string, string>>): string {
  let rendered = unwrapN8nExpression(raw);
  for (const [expression, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(expression, value);
  }
  if (rendered.includes('{{')) throw new Error('Unresolved n8n prompt binding');
  return rendered;
}

export const renderSearchPrompt = (query: string, currentDate: string) =>
  bind(searchRaw, {
    '{{ $json.text }}': query,
    '{{ $json.currentDateInfo }}': currentDate,
  });

export const renderOutlinePrompt = (combinedSummary: string, originalQuery: string) =>
  bind(outlineRaw, {
    '{{ $json.combined_summary }}': combinedSummary,
    '{{ $json.original_query }}': originalQuery,
  });

export const renderWritingPrompt = (outline: string, combinedSummary: string) =>
  bind(writingRaw, {
    '{{ $json.output }}': outline,
    "{{ $('整合摘要&提取检索要求').item.json.combined_summary }}": combinedSummary,
  });
