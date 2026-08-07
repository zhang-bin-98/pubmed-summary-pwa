import { expect, it, vi } from 'vitest';
import type { ReviewRun } from '../domain/models';
import { normalizeCompletedRunStats, repairLegacyRunStats } from './useHistory';

const run: ReviewRun = {
  id: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300,
  stage: 'completed', status: 'completed', createdAt: 1, updatedAt: 2,
  stats: { fetched: 299, withAbstract: 299, relevant: 133, selected: 133 },
};

it('keeps context count and repairs final reference count from the saved artifact', () => {
  expect(normalizeCompletedRunStats(run, 95).stats).toEqual({
    fetched: 299,
    withAbstract: 299,
    relevant: 133,
    contextSelected: 133,
    selected: 95,
  });
});

it('repairs legacy runs independently without blocking current history', async () => {
  const broken = { ...run, id: 'broken' };
  const current = { ...run, id: 'current', stats: { ...run.stats, contextSelected: 120, selected: 80 } };
  const loadReferenceCount = vi.fn(async (runId: string) => {
    if (runId === 'broken') throw new Error('read-failed');
    return 95;
  });
  const persist = vi.fn(async (candidate: ReviewRun) => {
    if (candidate.id === 'r') throw new Error('write-failed');
  });

  const repaired = await repairLegacyRunStats([run, broken, current], loadReferenceCount, persist);

  expect(repaired[0].stats).toMatchObject({ contextSelected: 133, selected: 95 });
  expect(repaired[1]).toBe(broken);
  expect(repaired[2]).toBe(current);
  expect(loadReferenceCount).toHaveBeenCalledTimes(2);
});
