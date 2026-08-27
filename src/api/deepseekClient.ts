import { z } from 'zod';

export const DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_CONTEXT_WINDOW = 1_000_000;
export const MIN_CONTEXT_WINDOW = 16_000;
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
  maxTokens?: number;
}

export class ProviderError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = 'DeepSeekError';
  }
}

/** Kept as an export alias for consumers of the original DeepSeek-specific client. */
export const DeepSeekError = ProviderError;

const modelResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    context_length: z.number().optional(),
    context_window: z.number().optional(),
    max_context_length: z.number().optional(),
  }).passthrough()),
}).passthrough();

const completionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.unknown().optional() }).passthrough(),
  }).passthrough()).min(1),
}).passthrough();

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ProviderError('provider-config', 'Base URL 不能为空');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ProviderError('provider-config', 'Base URL 必须是有效的 HTTPS 地址');
  }
  if (parsed.protocol !== 'https:') throw new ProviderError('provider-config', 'Base URL 必须使用 HTTPS');
  return parsed.href.replace(/\/+$/, '');
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

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
        ? 'provider-auth'
        : response.status === 429
          ? 'provider-rate-limit'
          : 'provider-response';
      throw new ProviderError(code, `AI provider request failed (${response.status})`, response.status);
    } catch (error) {
      if ((error instanceof DOMException || error instanceof Error) && error.name === 'AbortError') throw error;
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('provider-network', error instanceof Error ? error.message : 'AI provider network request failed');
    }
  }
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>, code: string): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError(code, 'AI provider returned invalid JSON');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ProviderError(code, 'AI provider returned an unexpected response');
  return parsed.data;
}

function extractContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new ProviderError('provider-response', 'AI provider returned no text content');
  const text = value.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    const candidate = part as { text?: unknown; type?: unknown };
    return typeof candidate.text === 'string' && (candidate.type === undefined || candidate.type === 'text') ? candidate.text : '';
  }).join('');
  if (!text) throw new ProviderError('provider-response', 'AI provider returned no text content');
  return text;
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
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrlOrFetcher: string | typeof fetch = DEFAULT_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (typeof baseUrlOrFetcher === 'function') {
      this.baseUrl = DEFAULT_BASE_URL;
      this.fetcher = baseUrlOrFetcher;
    } else {
      this.baseUrl = normalizeBaseUrl(baseUrlOrFetcher);
    }
  }

  async listModels(signal: AbortSignal): Promise<DeepSeekModel[]> {
    const response = await requestWithRetry(this.fetcher, endpoint(this.baseUrl, '/models'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    }, signal);
    const payload = await parseJson(response, modelResponseSchema, 'provider-response');
    return orderPreferredModels(payload.data.map((model) => ({
      id: model.id,
      contextLength: model.context_length ?? model.context_window ?? model.max_context_length,
    })));
  }

  async complete(request: CompletionRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [{ role: 'user', content: request.prompt }],
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.json) body.response_format = { type: 'json_object' };
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    const response = await requestWithRetry(this.fetcher, endpoint(this.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, request.signal);
    const payload = await parseJson(response, completionResponseSchema, 'provider-response');
    return extractContent(payload.choices[0].message.content);
  }
}
