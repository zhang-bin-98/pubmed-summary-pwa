import { describe, expect, it, vi } from 'vitest';
import { NcbiClient } from './ncbiClient';

describe('NcbiClient', () => {
  it('uses history and the confirmed 300-result limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ esearchresult: { count: '420', idlist: [], webenv: 'env', querykey: '1' } }), { status: 200 }),
    );
    const client = new NcbiClient('key', fetcher);
    const result = await client.search('term', 300, new AbortController().signal);
    expect(result.count).toBe(420);
    const request = fetcher.mock.calls[0]?.[1];
    expect(String(request?.body)).toContain('retmax=300');
    expect(String(request?.body)).toContain('usehistory=y');
    expect(String(request?.body)).toContain('api_key=key');
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  });
});
