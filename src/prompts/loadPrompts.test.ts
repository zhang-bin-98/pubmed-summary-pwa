import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';
import { renderOutlinePrompt, renderSearchPrompt, renderWritingPrompt } from './loadPrompts';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('original n8n prompts', () => {
  it('matches the approved source text exactly', () => {
    expect(sha256(searchRaw)).toBe('ff40c7f97f8b049fed98fb35e464e494e8b16b38507e05dcf6569a46bf3f858a');
    expect(sha256(outlineRaw)).toBe('2ceb8c0e94b73c3da80835d063396531d85f106fd22e4419bd8b4c65d67977c9');
    expect(sha256(writingRaw)).toBe('45f61bb69cc7cde4bdb84bc3b326ae9380e128f60ecb50fb34517884121bda7f');
  });

  it('replaces only the approved n8n bindings', () => {
    expect(renderSearchPrompt('主题', '2026-08-07')).not.toContain('{{');
    expect(renderOutlinePrompt('摘要包', '主题')).toContain('摘要包');
    expect(renderWritingPrompt('大纲', '摘要包')).toContain('大纲');
  });
});
