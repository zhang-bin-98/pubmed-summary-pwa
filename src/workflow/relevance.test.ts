import { describe, expect, it } from 'vitest';
import { validateScreeningBatch } from './relevance';

const articleIds = ['run:1', 'run:2'];

describe('screening validation', () => {
  it('accepts one decision for every requested article', () => {
    const parsed = validateScreeningBatch(JSON.stringify({ decisions: [
      { sourceId: 'run:1', score: 3, include: true, reason: '直接相关' },
      { sourceId: 'run:2', score: 0, include: false, reason: '主题不符' },
    ] }), articleIds);
    expect(parsed).toHaveLength(2);
  });

  it('rejects unknown, duplicate, or missing source IDs', () => {
    expect(() => validateScreeningBatch('{"decisions":[{"sourceId":"run:1","score":3,"include":true,"reason":"相关"}]}', articleIds))
      .toThrow('Screening IDs do not match batch');
    expect(() => validateScreeningBatch(JSON.stringify({ decisions: [
      { sourceId: 'run:1', score: 3, include: true, reason: '相关' },
      { sourceId: 'run:1', score: 3, include: true, reason: '重复' },
    ] }), articleIds)).toThrow('Screening IDs do not match batch');
  });
});
