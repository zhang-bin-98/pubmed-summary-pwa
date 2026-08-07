import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';

function unwrapN8nExpression(raw: string): string {
  return raw.startsWith('=') ? raw.slice(1) : raw;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bind(raw: string, values: Readonly<Record<string, string>>): string {
  const template = unwrapN8nExpression(raw);
  const expressions = Object.keys(values);
  const templateBindings = template.match(/\{\{[\s\S]*?\}\}/g) ?? [];
  const unknownBinding = templateBindings.find((binding) => !expressions.includes(binding));
  if (unknownBinding) {
    throw new Error(`Unresolved n8n prompt binding: ${unknownBinding}`);
  }

  const pattern = new RegExp(expressions.map(escapeRegExp).join('|'), 'g');
  return template.replace(pattern, (expression) => values[expression]);
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
