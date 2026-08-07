import type { DeepSeekClient, DeepSeekModel } from '../api/deepseekClient';
import type { NcbiClient } from '../api/ncbiClient';
import type { Article, Checkpoint, GenerationArtifact, ScreeningDecision, ScreenedArticle, ValidatedReview } from '../domain/models';
import { downloadBlob } from '../export/dataExport';
import { renderOutlinePrompt, renderSearchPrompt, renderWritingPrompt } from '../prompts/loadPrompts';
import { parsePubmedXml } from '../pubmed/parsePubmedXml';
import { buildEvidenceBundle, formatAmaReference } from './references';
import { validateAndReorderCitations } from './citations';
import { selectWithinContext, estimateTokens, resolveContextWindow } from './contextBudget';
import { resolveScreeningModel } from '../api/deepseekClient';
import { batchArticlesForScreening, screenArticles as screenArticlesCore } from './relevance';
import type { ScreeningProgress, WorkflowDeps, WorkflowInput } from './runWorkflow';

export interface WorkflowRepositories {
  saveArticles?(articles: Article[]): Promise<unknown>;
  saveScreening?(decisions: ScreeningDecision[]): Promise<unknown>;
  saveArtifact?(artifact: GenerationArtifact): Promise<unknown>;
  saveCheckpoint?(checkpoint: Checkpoint): Promise<unknown>;
  getRunBundle?(runId: string): Promise<{ checkpoints: Checkpoint[] } | undefined>;
}

export interface WorkflowServices {
  deepSeek: Pick<DeepSeekClient, 'complete' | 'listModels'>;
  ncbi: Pick<NcbiClient, 'search' | 'fetchAbstractPages'>;
  repositories: WorkflowRepositories;
}

export function createWorkflowDeps(services: WorkflowServices): WorkflowDeps {
  const modelsById = new Map<string, DeepSeekModel>();
  const repositories = services.repositories ?? {};
  const artifacts = new Map<string, { outline?: string; markdown?: string }>();

  const fetchArticles = async (input: WorkflowInput): Promise<Article[]> => {
    const history = await services.ncbi.search(input.query, input.maxResults, input.signal);
    const total = Math.min(history.count, input.maxResults);
    if (total === 0) return [];
    const pages = await services.ncbi.fetchAbstractPages(history, total, input.signal, 100);
    const articles = pages.flatMap((page, index) => {
      try {
        return parsePubmedXml(page, input.runId, index * 100);
      } catch (error) {
        throw Object.assign(new Error(error instanceof Error ? error.message : 'PubMed XML 解析失败'), { code: 'xml' });
      }
    });
    await repositories.saveArticles?.(articles);
    return articles;
  };

  const screenArticles = async (articles: Article[], input: WorkflowInput, onProgress?: (progress: ScreeningProgress) => void): Promise<ScreenedArticle[]> => {
    const models = (await services.deepSeek.listModels(input.signal)) ?? [];
    models.forEach((model) => modelsById.set(model.id, model));
    const screeningModel = resolveScreeningModel(models, input.modelId);
    const total = batchArticlesForScreening(articles).length;
    let completed = 0;
    let processed = 0;
    let included = 0;
    const decisions = await screenArticlesCore(input.topic, articles, services.deepSeek, screeningModel, input.signal, async (batch) => {
      await repositories.saveScreening?.(batch);
      completed += 1;
      processed += batch.length;
      included += batch.filter((decision) => decision.include).length;
      onProgress?.({ completed, total, processed, included });
    });
    const byArticleId = new Map(articles.map((article) => [article.id, article]));
    return decisions.flatMap((decision) => {
      const article = byArticleId.get(decision.articleId);
      return article ? [{ article, decision }] : [];
    });
  };

  const selectArticles = (items: ScreenedArticle[], input: WorkflowInput): Article[] => {
    const model = modelsById.get(input.modelId);
    const contextWindow = resolveContextWindow(input.modelId, model?.contextLength);
    const promptTokens = estimateTokens(buildEvidenceBundle([], { topic: input.topic, currentDate: new Date().toISOString().slice(0, 10) }));
    return selectWithinContext(items, { contextWindow, promptTokens }).selected.map((item) => item.article);
  };

  const generateOutline = async (articles: Article[], input: WorkflowInput): Promise<string> => {
    const evidence = buildEvidenceBundle(articles, { topic: input.topic, currentDate: new Date().toISOString().slice(0, 10) });
    const prompt = renderOutlinePrompt(evidence, input.topic);
    return services.deepSeek.complete({ model: input.modelId, prompt, signal: input.signal, temperature: 0 });
  };

  const generateReview = async (outline: string, articles: Article[], input: WorkflowInput, options?: { temperature?: number }): Promise<string> => {
    const evidence = buildEvidenceBundle(articles, { topic: input.topic, currentDate: new Date().toISOString().slice(0, 10) });
    const prompt = renderWritingPrompt(outline, evidence);
    const markdown = await services.deepSeek.complete({ model: input.modelId, prompt, signal: input.signal, temperature: options?.temperature ?? 0 });
    const artifact = artifacts.get(input.runId) ?? {};
    artifacts.set(input.runId, { ...artifact, outline, markdown });
    return markdown;
  };

  const validateCitations = (markdown: string, articles: Article[]): ValidatedReview => {
    const references = new Map(articles.map((article, index) => [index + 1, formatAmaReference(article)]));
    return validateAndReorderCitations(markdown, references);
  };

  const exportDocx = async (review: ValidatedReview, input: WorkflowInput): Promise<void> => {
    const { buildDocxBlob, sanitizeDocxFileName } = await import('../export/docxExport');
    const blob = await buildDocxBlob({ title: review.title || input.topic, markdown: review.markdown, references: review.references });
    downloadBlob(blob, sanitizeDocxFileName(review.title || input.topic, new Date().toISOString().slice(0, 10)));
    await repositories.saveArtifact?.({
      runId: input.runId,
      title: review.title || input.topic,
      outline: artifacts.get(input.runId)?.outline,
      markdown: artifacts.get(input.runId)?.markdown,
      validatedMarkdown: review.markdown,
      references: review.references,
      promptVersions: { search: 'v1', outline: 'v1', writing: 'v1', relevance: 'v1' },
    });
  };

  const loadCheckpoint = async <T,>(stage: Parameters<WorkflowDeps['loadCheckpoint']>[0], runId = ''): Promise<T | undefined> => {
    if (!runId || !repositories.getRunBundle) return undefined;
    const bundle = await repositories.getRunBundle(runId);
    return bundle?.checkpoints.find((checkpoint) => checkpoint.stage === stage)?.payload as T | undefined;
  };

  const checkpoint = async (stage: Parameters<WorkflowDeps['checkpoint']>[0], payload: unknown, runId = ''): Promise<void> => {
    if (!runId || !repositories.saveCheckpoint) return;
    await repositories.saveCheckpoint({ id: `${runId}:${stage}`, runId, stage, completedAt: Date.now(), payload });
  };

  return { fetchArticles, screenArticles, selectArticles, generateOutline, generateReview, validateCitations, exportDocx, loadCheckpoint, checkpoint };
}

export async function generateConfirmedQuery(topic: string, currentDate: string, modelId: string, deepSeek: Pick<DeepSeekClient, 'complete'>, signal: AbortSignal): Promise<string> {
  return deepSeek.complete({ model: modelId, prompt: renderSearchPrompt(topic, currentDate), signal, temperature: 0 });
}

export async function countConfirmedQuery(query: string, ncbi: Pick<NcbiClient, 'count'>, signal: AbortSignal): Promise<number> {
  return ncbi.count(query, signal);
}
