import { useCallback, useEffect, useRef, useState } from 'react';
import { DeepSeekClient } from '../api/deepseekClient';
import { NcbiClient } from '../api/ncbiClient';
import type { AppSettings, ReviewMode, ReviewRun, RunStats } from '../domain/models';
import { downloadBlob } from '../export/dataExport';
import { getRunBundle, saveArtifact, saveArticles, saveCheckpoint, saveRun, saveScreening } from '../storage/repositories';
import { countConfirmedQuery, createWorkflowDeps, generateConfirmedQuery } from '../workflow/createWorkflowDeps';
import { runWorkflow, type WorkflowProgress } from '../workflow/runWorkflow';

export type ReviewControllerState =
  | { kind: 'idle' }
  | { kind: 'generating-query' }
  | { kind: 'confirming-query'; query: string; count: number }
  | { kind: 'running'; runId: string; progress: WorkflowProgress; stats: RunStats }
  | { kind: 'completed'; runId: string; stats: RunStats }
  | { kind: 'failed'; runId?: string; code: string; message: string }
  | { kind: 'cancelled'; runId: string };

export interface GenerateQueryInput { topic: string; modelId: string }
export interface StartRunInput { topic: string; query: string; modelId: string; maxResults: number; mode?: ReviewMode; queryCount?: number; runId?: string }

function hasConnectionDecision(value: string): boolean {
  return value === 'passed' || value === 'skipped';
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useReviewController(settings: AppSettings) {
  const [state, setState] = useState<ReviewControllerState>({ kind: 'idle' });
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => () => activeController.current?.abort(), []);

  const requireConnections = useCallback(() => {
    if (!settings.deepSeekApiKey || !settings.ncbiApiKey || !hasConnectionDecision(settings.connectionChecks.deepSeek) || !hasConnectionDecision(settings.connectionChecks.ncbi)) {
      setState({ kind: 'failed', code: 'connection-required', message: '请先在设置中保存 API Key，并完成或跳过连接测试。' });
      return false;
    }
    return true;
  }, [settings]);

  const generateQuery = useCallback(async ({ topic, modelId }: GenerateQueryInput) => {
    if (!requireConnections()) return undefined;
    if (!navigator.onLine) {
      setState({ kind: 'failed', code: 'offline', message: '当前离线，无法请求 PubMed 或 DeepSeek。' });
      return undefined;
    }
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setState({ kind: 'generating-query' });
    try {
      const deepSeek = new DeepSeekClient(settings.deepSeekApiKey);
      const ncbi = new NcbiClient(settings.ncbiApiKey);
      const currentDate = new Date().toISOString().slice(0, 10);
      const query = await generateConfirmedQuery(topic, currentDate, modelId, deepSeek, controller.signal);
      const count = await countConfirmedQuery(query, ncbi, controller.signal);
      setState({ kind: 'confirming-query', query, count });
      return { query, count };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : error instanceof Error && error.name === 'AbortError' ? 'cancellation' : 'query-generation';
      setState({ kind: 'failed', code, message: error instanceof Error ? error.message : '检索式生成失败' });
      return undefined;
    }
  }, [requireConnections, settings.deepSeekApiKey, settings.ncbiApiKey]);

  const startRun = useCallback(async ({ topic, query, modelId, maxResults, mode, queryCount, runId: resumedRunId }: StartRunInput) => {
    if (!requireConnections()) return;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    const runId = resumedRunId ?? createRunId();
    const now = Date.now();
    const existingBundle = resumedRunId ? await getRunBundle(resumedRunId) : undefined;
    const isLegacyResume = Boolean(existingBundle?.run && existingBundle.run.mode === undefined && existingBundle.run.screeningConcurrency === undefined);
    let run: ReviewRun = {
      id: runId,
      topic,
      query,
      modelId,
      maxResults,
      ...(isLegacyResume ? {} : { mode: mode ?? 'confirm-query', queryCount, screeningConcurrency: 5 }),
      stage: 'fetching',
      status: 'active',
      createdAt: existingBundle?.run.createdAt ?? now,
      updatedAt: now,
      stats: {},
    };
    await saveRun(run);
    const stats: RunStats = {};
    const deepSeek = new DeepSeekClient(settings.deepSeekApiKey);
    const ncbi = new NcbiClient(settings.ncbiApiKey);
    const deps = createWorkflowDeps({ deepSeek, ncbi, repositories: { saveArticles, saveScreening, saveArtifact, saveCheckpoint, getRunBundle } });
    deps.onProgress = (progress) => {
      Object.assign(stats, progress.stats);
      setState({ kind: 'running', runId, progress, stats: { ...stats } });
      run = { ...run, stage: progress.stage, updatedAt: Date.now(), stats: { ...stats } };
      void saveRun(run);
    };
    try {
      const result = await runWorkflow({ runId, topic, query, modelId, maxResults, signal: controller.signal }, deps);
      const stored = await getRunBundle(runId);
      stats.fetched = stored?.articles.length ?? result.screenedArticles.length;
      stats.withAbstract = stored?.articles.filter((article) => article.abstract.trim().length > 0).length ?? result.screenedArticles.length;
      stats.relevant = result.screenedArticles.filter((item) => item.decision.include).length;
      stats.contextSelected = result.articles.length;
      stats.selected = result.review.references.length;
      run = { ...run, stage: 'completed', status: 'completed', updatedAt: Date.now(), stats };
      await saveRun(run);
      setState({ kind: 'completed', runId, stats });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : 'unknown';
      const cancelled = code === 'cancellation';
      run = { ...run, stage: cancelled ? 'cancelled' : 'failed', status: cancelled ? 'cancelled' : 'failed', updatedAt: Date.now(), errorCode: code, errorMessage: error instanceof Error ? error.message : '运行失败' };
      await saveRun(run);
      setState(cancelled ? { kind: 'cancelled', runId } : { kind: 'failed', runId, code, message: run.errorMessage ?? '运行失败' });
    }
  }, [requireConnections, settings.deepSeekApiKey, settings.ncbiApiKey]);

  const cancel = useCallback(() => activeController.current?.abort(), []);

  const download = useCallback(async (runId: string) => {
    const bundle = await getRunBundle(runId);
    const artifact = bundle?.artifact;
    if (!bundle || !artifact?.validatedMarkdown || !artifact.references) throw new Error('history-incomplete');
    const { buildDocxBlob, sanitizeDocxFileName } = await import('../export/docxExport');
    const blob = await buildDocxBlob({ title: artifact.title || bundle.run.topic, markdown: artifact.validatedMarkdown, references: artifact.references });
    downloadBlob(blob, sanitizeDocxFileName(bundle.run.topic, new Date(bundle.run.updatedAt).toISOString().slice(0, 10)));
  }, []);

  const retry = useCallback(async (runId: string) => {
    const bundle = await getRunBundle(runId);
    if (!bundle?.run.query) return;
    await startRun({ runId, topic: bundle.run.topic, query: bundle.run.query, modelId: bundle.run.modelId, maxResults: bundle.run.maxResults, mode: bundle.run.mode, queryCount: bundle.run.queryCount });
  }, [startRun]);

  return { state, generateQuery, startRun, cancel, download, retry, reset: () => setState({ kind: 'idle' }) };
}
