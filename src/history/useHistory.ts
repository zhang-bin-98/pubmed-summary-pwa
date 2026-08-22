import { useCallback, useEffect, useState } from 'react';
import type { ReviewRun } from '../domain/models';
import { buildArticlesCsv, buildRunJson, downloadBlob, shareOrDownloadBlob } from '../export/dataExport';
import { clearHistoryData, deleteRun as deleteStoredRun, getArtifact, getRunBundle, listRuns, saveRun } from '../storage/repositories';

export function normalizeCompletedRunStats(run: ReviewRun, referenceCount: number): ReviewRun {
  if (run.status !== 'completed') return run;
  const contextSelected = run.stats.contextSelected ?? run.stats.selected;
  if (run.stats.contextSelected === contextSelected && run.stats.selected === referenceCount) return run;
  return {
    ...run,
    stats: { ...run.stats, contextSelected, selected: referenceCount },
  };
}

export async function repairLegacyRunStats(
  runs: ReviewRun[],
  loadReferenceCount: (runId: string) => Promise<number | undefined>,
  persist: (run: ReviewRun) => Promise<unknown>,
): Promise<ReviewRun[]> {
  return Promise.all(runs.map(async (run) => {
    if (run.status !== 'completed' || run.stats.contextSelected !== undefined) return run;
    let referenceCount: number | undefined;
    try {
      referenceCount = await loadReferenceCount(run.id);
    } catch {
      return run;
    }
    if (referenceCount === undefined) return run;
    const normalized = normalizeCompletedRunStats(run, referenceCount);
    try {
      await persist(normalized);
    } catch {
      // The repaired value can still be shown for this session if IndexedDB rejects the write.
    }
    return normalized;
  }));
}

export function useHistory(onResume?: (runId: string) => Promise<void> | void) {
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [error, setError] = useState<string>();
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>();

  const refresh = useCallback(async () => {
    const storedRuns = await listRuns();
    setRuns(storedRuns);
    const normalizedRuns = await repairLegacyRunStats(
      storedRuns,
      async (runId) => (await getArtifact(runId))?.references?.length,
      saveRun,
    );
    const normalizedById = new Map(normalizedRuns.map((run) => [run.id, run]));
    setRuns((currentRuns) => currentRuns.map((run) => normalizedById.get(run.id) ?? run));
    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        setStorage({ usage: estimate.usage, quota: estimate.quota });
      } catch {
        setStorage(undefined);
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Warm the dynamic docx module so the share sheet opens close to the tap,
  // before the iOS user-gesture window can expire.
  useEffect(() => { void import('../export/docxExport'); }, []);

  const resume = useCallback(async (runId: string) => { await onResume?.(runId); }, [onResume]);

  const downloadDocx = useCallback(async (runId: string) => {
    try {
      const bundle = await getRunBundle(runId);
      if (!bundle?.artifact?.validatedMarkdown || !bundle.artifact.references) throw new Error('history-incomplete');
      const { buildDocxBlob, sanitizeDocxFileName } = await import('../export/docxExport');
      const blob = await buildDocxBlob({ title: bundle.artifact.title || bundle.run.topic, markdown: bundle.artifact.validatedMarkdown, references: bundle.artifact.references });
      downloadBlob(blob, sanitizeDocxFileName(bundle.artifact.title || bundle.run.topic, new Date(bundle.run.updatedAt).toISOString().slice(0, 10)));
      setError(undefined);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'history-incomplete' ? '历史记录缺少最终正文或参考文献，无法重新导出 Word。' : 'Word 导出失败。');
    }
  }, []);

  const shareDocx = useCallback(async (runId: string) => {
    try {
      const bundle = await getRunBundle(runId);
      if (!bundle?.artifact?.validatedMarkdown || !bundle.artifact.references) throw new Error('history-incomplete');
      const { buildDocxBlob, sanitizeDocxFileName } = await import('../export/docxExport');
      const title = bundle.artifact.title || bundle.run.topic;
      const blob = await buildDocxBlob({ title, markdown: bundle.artifact.validatedMarkdown, references: bundle.artifact.references });
      const outcome = await shareOrDownloadBlob(blob, sanitizeDocxFileName(title, new Date(bundle.run.updatedAt).toISOString().slice(0, 10)), title);
      setError(outcome === 'downloaded' ? '系统分享不可用，已改为下载 Word 文档。' : undefined);
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'history-incomplete' ? '历史记录缺少最终正文或参考文献，无法导出 Word。' : 'Word 导出失败。');
    }
  }, []);

  const exportJson = useCallback(async (runId: string) => {
    const bundle = await getRunBundle(runId);
    if (!bundle) return;
    const body = buildRunJson({ run: bundle.run, articles: bundle.articles, screening: bundle.screening, artifact: bundle.artifact });
    downloadBlob(new Blob([body], { type: 'application/json;charset=utf-8' }), `${runId}.json`);
  }, []);

  const exportCsv = useCallback(async (runId: string) => {
    const bundle = await getRunBundle(runId);
    if (!bundle) return;
    const decisions = new Map(bundle.screening.map((decision) => [decision.articleId, decision]));
    const body = buildArticlesCsv(bundle.articles.map((article) => {
      const decision = decisions.get(article.id);
      return { pmid: article.pmid, title: article.title, journal: article.journalAbbreviation || article.journal, publicationDate: article.publicationDate, included: decision?.include ?? false, score: decision?.score ?? '', reason: decision?.reason ?? '' };
    }));
    downloadBlob(new Blob([body], { type: 'text/csv;charset=utf-8' }), `${runId}.csv`);
  }, []);

  const deleteRun = useCallback(async (runId: string) => { await deleteStoredRun(runId); await refresh(); }, [refresh]);
  const clearHistory = useCallback(async () => { await clearHistoryData(); await refresh(); }, [refresh]);

  return { runs, error, storage, refresh, resume, downloadDocx, shareDocx, exportJson, exportCsv, deleteRun, clearHistory };
}
