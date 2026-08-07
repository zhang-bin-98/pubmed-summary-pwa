import type { ScreenedArticle } from '../domain/models';

export interface ContextBudget {
  contextWindow: number;
  promptTokens: number;
  outputReserve?: number;
}

export interface ContextSelection {
  selected: ScreenedArticle[];
  omittedForBudget: ScreenedArticle[];
  estimatedTokens: number;
  availableTokens: number;
}

export function estimateTokens(value: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const char of value) {
    if (char.charCodeAt(0) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil((ascii / 3 + nonAscii * 1.5) * 1.15);
}

export function resolveContextWindow(_modelId: string, apiValue?: number): number {
  if (apiValue && Number.isFinite(apiValue) && apiValue >= 16_000) return apiValue;
  return 1_000_000;
}

export function selectWithinContext(items: ScreenedArticle[], budget: ContextBudget): ContextSelection {
  const outputReserve = budget.outputReserve ?? Math.max(12_000, Math.floor(budget.contextWindow * 0.25));
  const availableTokens = Math.max(0, budget.contextWindow - budget.promptTokens - outputReserve);
  const candidates = items
    .filter((item) => item.decision.include)
    .slice()
    .sort((left, right) => right.decision.score - left.decision.score || left.article.sourceOrder - right.article.sourceOrder);
  const selected: ScreenedArticle[] = [];
  const omittedForBudget: ScreenedArticle[] = [];
  let estimatedTokens = 0;
  for (const item of candidates) {
    const itemTokens = estimateTokens(JSON.stringify(item.article));
    if (estimatedTokens + itemTokens <= availableTokens) {
      selected.push(item);
      estimatedTokens += itemTokens;
    } else {
      omittedForBudget.push(item);
    }
  }
  return { selected, omittedForBudget, estimatedTokens, availableTokens };
}
