import { z } from 'zod';

const DEEPSEEK_BASE = 'https://api.deepseek.com';
const RETRY_DELAYS = [500, 1000, 2000] as const;

export interface DeepSeekModel {
  id: string;
  contextLength?: number;
}

export interface CompletionRequest {
  model: string;
  prompt: string;
  signal: AbortSignal;
  json?: boolean;
  temperature?: number;
}

export class DeepSeekError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

const modelResponseSchema = z.object({
  data: z.array(z.object({ id: z.string(), context_length: z.number().optional() })),
});

const completionResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function requestWithRetry(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(input, { ...init, signal });
      if (response.ok) return response;
      if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt] + Math.floor(Math.random() * 201));
        continue;
      }
      const code = response.status === 401 || response.status === 403
        ? 'deepseek-auth'
        : response.status === 429
          ? 'deepseek-rate-limit'
          : 'deepseek-response';
      throw new DeepSeekError(code, `DeepSeek request failed (${response.status})`, response.status);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof DeepSeekError) throw error;
      throw new DeepSeekError('deepseek-network', error instanceof Error ? error.message : 'DeepSeek network request failed');
    }
  }
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>, code: string): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DeepSeekError(code, 'DeepSeek returned invalid JSON');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new DeepSeekError(code, 'DeepSeek returned an unexpected response');
  return parsed.data;
}

export function orderPreferredModels(models: DeepSeekModel[]): DeepSeekModel[] {
  const rank = (id: string) => {
    const normalized = id.toLowerCase();
    if (normalized.includes('flash')) return 0;
    if (normalized.includes('pro')) return 1;
    return 2;
  };
  return [...models].sort((left, right) => rank(left.id) - rank(right.id) || left.id.localeCompare(right.id));
}

export function resolveScreeningModel(models: DeepSeekModel[], selectedModel: string): string {
  return orderPreferredModels(models).find((model) => model.id.toLowerCase().includes('flash'))?.id ?? selectedModel;
}

export class DeepSeekClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  async listModels(signal: AbortSignal): Promise<DeepSeekModel[]> {
    const response = await requestWithRetry(this.fetcher, `${DEEPSEEK_BASE}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }, signal);
    const payload = await parseJson(response, modelResponseSchema, 'deepseek-response');
    return orderPreferredModels(payload.data.map((model) => ({ id: model.id, contextLength: model.context_length })));
  }

  async complete(request: CompletionRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: 'user', content: request.prompt }],
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.json) body.response_format = { type: 'json_object' };
    const response = await requestWithRetry(this.fetcher, `${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, request.signal);
    const payload = await parseJson(response, completionResponseSchema, 'deepseek-response');
    return payload.choices[0].message.content;
  }
}
