import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/useSettings';
import { useReviewController } from './useReviewController';

afterEach(() => vi.restoreAllMocks());

it('requires an NCBI connection decision before starting a run without an NCBI key', async () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    deepSeekApiKey: 'ai-key',
    ncbiApiKey: '',
    connectionChecks: { deepSeek: 'passed' as const, ncbi: 'untested' as const },
  };
  const { result } = renderHook(() => useReviewController(settings));
  await act(async () => {
    await result.current.startRun({ topic: '主题', query: 'term', modelId: 'deepseek-v4-flash', maxResults: 300 });
  });
  expect(result.current.state).toMatchObject({ kind: 'failed', code: 'connection-required' });
});

it('accepts an empty NCBI key after both connection decisions are saved', async () => {
  vi.spyOn(globalThis.navigator, 'onLine', 'get').mockReturnValue(false);
  const settings = {
    ...DEFAULT_SETTINGS,
    deepSeekApiKey: 'ai-key',
    ncbiApiKey: '',
    connectionChecks: { deepSeek: 'passed' as const, ncbi: 'skipped' as const },
  };
  const { result } = renderHook(() => useReviewController(settings));
  await act(async () => { await result.current.generateQuery({ topic: '主题', modelId: 'deepseek-v4-flash' }); });
  expect(result.current.state).toMatchObject({ kind: 'failed', code: 'offline' });
});
