import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, orderPreferredModels } from './deepseekClient';

describe('DeepSeekClient', () => {
  it('prefers current flash and pro models without hard-coding one ID', () => {
    expect(orderPreferredModels([{ id: 'deepseek-v4-pro' }, { id: 'other' }, { id: 'deepseek-v4-flash' }]).map((model) => model.id))
      .toEqual(['deepseek-v4-flash', 'deepseek-v4-pro', 'other']);
  });

  it('sends a browser-safe chat completion request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '结果' } }] }), { status: 200 }),
    );
    const client = new DeepSeekClient('secret', fetcher);
    expect(await client.complete({ model: 'deepseek-v4-flash', prompt: '提示', signal: new AbortController().signal })).toBe('结果');
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.deepseek.com/chat/completions');
  });
});
