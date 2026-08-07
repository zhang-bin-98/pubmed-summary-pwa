import type { ValidatedReview } from '../domain/models';

export class CitationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CitationValidationError';
  }
}

export function validateAndReorderCitations(markdown: string, referencesBySource: Map<number, string>): ValidatedReview {
  const titleMatch = markdown.match(/^#\s+([^\n]+)\s*\n?/);
  const title = titleMatch?.[1]?.trim() ?? '';
  const body = titleMatch ? markdown.slice(titleMatch[0].length) : markdown;
  const citationPattern = /\[([\d,\s]+)\]/g;
  const firstAppearance: number[] = [];
  const seen = new Set<number>();
  const groups: number[][] = [];
  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(body)) !== null) {
    const group = [...new Set(match[1].split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0))];
    if (group.length === 0) continue;
    group.forEach((sourceId) => {
      if (!referencesBySource.has(sourceId)) throw new CitationValidationError(`Unknown citation: ${sourceId}`);
      if (!seen.has(sourceId)) {
        seen.add(sourceId);
        firstAppearance.push(sourceId);
      }
    });
    groups.push(group);
  }
  if (referencesBySource.size > 0 && firstAppearance.length === 0) throw new CitationValidationError('No citations found');
  const outputNumberBySource = new Map(firstAppearance.map((sourceId, index) => [sourceId, index + 1]));
  const reordered = body.replace(citationPattern, (_full, content: string) => {
    const outputIds = [...new Set(content.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0))]
      .map((sourceId) => outputNumberBySource.get(sourceId))
      .filter((value): value is number => value !== undefined)
      .sort((left, right) => left - right);
    return `[${outputIds.join(', ')}]`;
  });
  return {
    title,
    markdown: reordered.trim(),
    references: firstAppearance.map((sourceId) => referencesBySource.get(sourceId)!),
  };
}
