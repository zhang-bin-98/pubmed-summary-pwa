import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/useSettings';
import { useReviewController } from './useReviewController';

it('requires saved connection decisions before query generation', async () => {
  const { result } = renderHook(() => useReviewController(DEFAULT_SETTINGS));
  await act(async () => { await result.current.generateQuery({ topic: '主题', modelId: 'deepseek-v4-flash' }); });
  expect(result.current.state).toMatchObject({ kind: 'failed', code: 'connection-required' });
});
