import { describe, expect, it } from 'vitest';
import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';
import { renderOutlinePrompt, renderSearchPrompt, renderWritingPrompt } from './loadPrompts';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('original n8n prompts', () => {
  it('matches the approved source text exactly', async () => {
    expect(await sha256(searchRaw)).toBe('ff40c7f97f8b049fed98fb35e464e494e8b16b38507e05dcf6569a46bf3f858a');
    expect(await sha256(outlineRaw)).toBe('2ceb8c0e94b73c3da80835d063396531d85f106fd22e4419bd8b4c65d67977c9');
    expect(await sha256(writingRaw)).toBe('45f61bb69cc7cde4bdb84bc3b326ae9380e128f60ecb50fb34517884121bda7f');
  });

  it('replaces every approved n8n binding', () => {
    const search = renderSearchPrompt('检索主题标记', '日期标记');
    expect(search).toContain('检索主题标记');
    expect(search).toContain('日期标记');

    const outline = renderOutlinePrompt('摘要包标记', '原始主题标记');
    expect(outline).toContain('摘要包标记');
    expect(outline).toContain('原始主题标记');

    const writing = renderWritingPrompt('大纲标记', '写作摘要标记');
    expect(writing).toContain('大纲标记');
    expect(writing).toContain('写作摘要标记');
  });

  it('preserves binding-like and mustache text supplied by the user', () => {
    const search = renderSearchPrompt('主题 {{ $json.currentDateInfo }}', '2026-08-07');
    expect(search).toContain('主题 {{ $json.currentDateInfo }}');

    const outline = renderOutlinePrompt('摘要 {{保留原样}}', '主题');
    expect(outline).toContain('摘要 {{保留原样}}');
  });
});
