import { afterEach, describe, expect, it, vi } from 'vitest';
import { NcbiClient } from './ncbiClient';

const esearchResponse = () => new Response(JSON.stringify({
  esearchresult: { count: '420', idlist: [], webenv: 'env', querykey: '1' },
}), { status: 200 });

const bodyAt = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index: number) =>
  new URLSearchParams(String(fetcher.mock.calls[index]?.[1]?.body));

afterEach(() => vi.useRealTimers());

describe('NcbiClient', () => {
  it('sends a trimmed API key with search, count, and fetch requests', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => (
      String(input).endsWith('/efetch.fcgi') ? new Response('<PubmedArticleSet />') : esearchResponse()
    ));
    const client = new NcbiClient('  key  ', fetcher);
    const signal = new AbortController().signal;

    const result = await client.search('term', 300, signal);
    await client.count('term', signal);
    await client.fetchAbstractPages({ webEnv: 'env', queryKey: '1' }, 1, signal);

    expect(result.count).toBe(420);
    expect(bodyAt(fetcher, 0).get('retmax')).toBe('300');
    expect(bodyAt(fetcher, 0).get('usehistory')).toBe('y');
    expect(fetcher.mock.calls.map((_, index) => bodyAt(fetcher, index).get('api_key'))).toEqual(['key', 'key', 'key']);
  });

  it('omits api_key from every request when the key is blank', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    vi.resetModules();
    const { NcbiClient: FreshNcbiClient } = await import('./ncbiClient');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => (
      String(input).endsWith('/efetch.fcgi') ? new Response('<PubmedArticleSet />') : esearchResponse()
    ));
    const client = new FreshNcbiClient('   ', fetcher);
    const signal = new AbortController().signal;

    const search = client.search('term', 300, signal);
    await vi.advanceTimersByTimeAsync(0);
    await search;
    const count = client.count('term', signal);
    await vi.advanceTimersByTimeAsync(350);
    await count;
    const pages = client.fetchAbstractPages({ webEnv: 'env', queryKey: '1' }, 1, signal);
    await vi.advanceTimersByTimeAsync(350);
    await pages;

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every((_, index) => !bodyAt(fetcher, index).has('api_key'))).toBe(true);
  });

  it('shares anonymous throttling across instances and cancels queued work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-01-01T00:00:00Z'));
    vi.resetModules();
    const { NcbiClient: FreshNcbiClient } = await import('./ncbiClient');
    const attemptedAt: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      attemptedAt.push(Date.now());
      return esearchResponse();
    });
    const first = new FreshNcbiClient('', fetcher).count('first', new AbortController().signal);
    const second = new FreshNcbiClient('', fetcher).count('second', new AbortController().signal);
    const queuedController = new AbortController();
    const cancelled = new FreshNcbiClient('', fetcher).count('cancelled', queuedController.signal);

    queuedController.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(350);
    await Promise.all([first, second]);

    const start = Date.parse('2031-01-01T00:00:00Z');
    expect(attemptedAt).toEqual([start, start + 350]);
  });
});
