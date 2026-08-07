import { expect, it } from 'vitest';
import { validateAndReorderCitations } from './citations';

it('renumbers cited sources by first appearance and omits uncited references', () => {
  const result = validateAndReorderCitations('结论[3, 1]。再次引用[3]。', new Map([[1, 'Ref 1'], [2, 'Ref 2'], [3, 'Ref 3']]));
  expect(result.markdown).toBe('结论[1, 2]。再次引用[1]。');
  expect(result.references).toEqual(['Ref 3', 'Ref 1']);
});

it('rejects source numbers that do not exist', () => {
  expect(() => validateAndReorderCitations('错误[4]。', new Map([[1, 'Ref 1']]))).toThrow('Unknown citation: 4');
});
