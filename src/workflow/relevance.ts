import { z } from 'zod';
import type { Article, ScreeningDecision } from '../domain/models';
import type { CompletionRequest, DeepSeekClient } from '../api/deepseekClient';
import { buildRelevancePrompt, RELEVANCE_PROMPT_VERSION } from '../prompts/relevance-v1';

const decisionSchema = z.object({
  sourceId: z.string().min(1),
  score: z.number().int().min(0).max(3),
  include: z.boolean(),
  reason: z.string().min(1).max(80),
});
const batchSchema = z.object({ decisions: z.array(decisionSchema) });

export interface ScreeningDecisionPayload {
  sourceId: string;
  score: 0 | 1 | 2 | 3;
  include: boolean;
  reason: string;
}

export class ScreeningFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreeningFormatError';
  }
}

export function validateScreeningBatch(raw: string, expectedIds: string[]): ScreeningDecisionPayload[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ScreeningFormatError('Screening response is not valid JSON');
  }
  const parsed = batchSchema.safeParse(value);
  if (!parsed.success) throw new ScreeningFormatError('Screening response does not match the required schema');
  const decisions = parsed.data.decisions as ScreeningDecisionPayload[];
  const receivedIds = decisions.map(({ sourceId }) => sourceId);
  const uniqueIds = new Set(receivedIds);
  const expected = [...expectedIds].sort();
  const received = [...receivedIds].sort();
  if (uniqueIds.size !== receivedIds.length || expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
    throw new ScreeningFormatError('Screening IDs do not match batch');
  }
  return decisions;
}

export function batchArticlesForScreening(articles: Article[], maxTokens = 24_000): Article[][] {
  const batches: Article[][] = [];
  let current: Article[] = [];
  let currentTokens = 0;
  for (const article of articles) {
    const articleTokens = estimateInputTokens(article);
    const exceedsCount = current.length >= 20;
    const exceedsTokens = current.length > 0 && currentTokens + articleTokens > maxTokens;
    if (exceedsCount || exceedsTokens) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(article);
    currentTokens += articleTokens;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function estimateInputTokens(article: Article): number {
  return Math.ceil((article.title.length + article.abstract.length) * 1.15);
}

export async function screenArticleBatch(
  topic: string,
  batch: Article[],
  client: Pick<DeepSeekClient, 'complete'>,
  model: string,
  signal: AbortSignal,
): Promise<ScreeningDecision[]> {
  const expectedIds = batch.map((article) => article.id);
  const request = (prompt: string): CompletionRequest => ({ model, prompt, signal, json: true, temperature: 0 });
  let payload: ScreeningDecisionPayload[] | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await client.complete(request(buildRelevancePrompt(topic, batch)));
    try {
      payload = validateScreeningBatch(raw, expectedIds);
      break;
    } catch (error) {
      if (!(error instanceof ScreeningFormatError) || attempt === 1) {
        if (error instanceof ScreeningFormatError) throw Object.assign(error, { code: 'screening-format' });
        throw error;
      }
    }
  }
  if (!payload) throw Object.assign(new Error('Screening response was empty'), { code: 'screening-format' });
  const bySourceId = new Map(payload.map((decision) => [decision.sourceId, decision]));
  return batch.map((article) => {
    const decision = bySourceId.get(article.id)!;
    return {
      id: `${article.id}:screening`,
      runId: article.runId,
      articleId: article.id,
      score: decision.score,
      include: decision.include,
      reason: decision.reason,
      promptVersion: RELEVANCE_PROMPT_VERSION,
    } satisfies ScreeningDecision;
  });
}

export interface ScreeningSchedulerOptions {
  concurrency: 5;
  launchIntervalMs: 1000;
  signal: AbortSignal;
  onBatchComplete?: (batchIndex: number, decisions: ScreeningDecision[]) => Promise<void> | void;
  completedBatchIndexes?: Set<number>;
  completedBatches?: Map<number, ScreeningDecision[]>;
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function screenArticlesParallel(
  topic: string,
  articles: Article[],
  client: Pick<DeepSeekClient, 'complete'>,
  model: string,
  options: ScreeningSchedulerOptions,
): Promise<ScreeningDecision[]> {
  const batches = batchArticlesForScreening(articles);
  const results = new Map(options.completedBatches ?? []);
  const completedBatchIndexes = options.completedBatchIndexes ?? new Set(results.keys());
  const pendingIndexes = batches.map((_, index) => index).filter((index) => !completedBatchIndexes.has(index));
  const active = new Set<Promise<void>>();
  let terminalError: unknown;
  let lastLaunchAt: number | undefined;

  const launch = (batchIndex: number) => {
    const task = screenArticleBatch(topic, batches[batchIndex], client, model, options.signal)
      .then(async (decisions) => {
        await options.onBatchComplete?.(batchIndex, decisions);
        results.set(batchIndex, decisions);
      })
      .catch((error: unknown) => {
        terminalError ??= error;
      })
      .finally(() => active.delete(task));
    active.add(task);
  };

  try {
    for (const batchIndex of pendingIndexes) {
      if (terminalError) break;
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (active.size >= options.concurrency) await Promise.race(active);
      if (terminalError) break;
      if (lastLaunchAt !== undefined) {
        const remaining = options.launchIntervalMs - (Date.now() - lastLaunchAt);
        await abortableDelay(remaining, options.signal);
      }
      if (terminalError) break;
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      lastLaunchAt = Date.now();
      launch(batchIndex);
    }
  } catch (error) {
    terminalError ??= error;
  }

  await Promise.all(active);
  if (terminalError) throw terminalError;

  const articleOrder = new Map(articles.map((article) => [article.id, article.sourceOrder]));
  return [...results.values()].flat().sort((left, right) =>
    (articleOrder.get(left.articleId) ?? Number.MAX_SAFE_INTEGER) - (articleOrder.get(right.articleId) ?? Number.MAX_SAFE_INTEGER));
}

export async function screenArticles(
  topic: string,
  articles: Article[],
  client: Pick<DeepSeekClient, 'complete'>,
  model: string,
  signal: AbortSignal,
  onBatch?: (decisions: ScreeningDecision[]) => Promise<void> | void,
): Promise<ScreeningDecision[]> {
  return screenArticlesParallel(topic, articles, client, model, {
    concurrency: 5,
    launchIntervalMs: 1000,
    signal,
    onBatchComplete: (_batchIndex, decisions) => onBatch?.(decisions),
  });
}
