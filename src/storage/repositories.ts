import type {
  AppSettings,
  Article,
  Checkpoint,
  GenerationArtifact,
  ReviewRun,
  ScreeningDecision,
} from '../domain/models';
import { db } from './db';

export const saveSettings = (settings: AppSettings) => db.settings.put({ ...settings, id: 1 });
export const getSettings = () => db.settings.get(1);
export const saveRun = (run: ReviewRun) => db.runs.put(run);
export const saveArticles = (articles: Article[]) => db.articles.bulkPut(articles);
export const saveScreening = (decisions: ScreeningDecision[]) => db.screening.bulkPut(decisions);
export const saveArtifact = (artifact: GenerationArtifact) => db.artifacts.put(artifact);
export const saveCheckpoint = (checkpoint: Checkpoint) => db.checkpoints.put(checkpoint);
export const listRuns = () => db.runs.orderBy('updatedAt').reverse().toArray();

export async function getRunBundle(runId: string) {
  const [run, articles, screening, artifact, checkpoints] = await Promise.all([
    db.runs.get(runId),
    db.articles.where('runId').equals(runId).toArray(),
    db.screening.where('runId').equals(runId).toArray(),
    db.artifacts.get(runId),
    db.checkpoints.where('runId').equals(runId).sortBy('completedAt'),
  ]);
  return run ? { run, articles, screening, artifact, checkpoints } : undefined;
}

export async function deleteRun(runId: string) {
  await db.transaction('rw', db.runs, db.articles, db.screening, db.artifacts, db.checkpoints, async () => {
    await Promise.all([
      db.runs.delete(runId),
      db.articles.where('runId').equals(runId).delete(),
      db.screening.where('runId').equals(runId).delete(),
      db.artifacts.delete(runId),
      db.checkpoints.where('runId').equals(runId).delete(),
    ]);
  });
}

export async function clearAllLocalData() {
  await db.delete();
  await db.open();
}

export async function clearHistoryData() {
  await db.transaction('rw', db.runs, db.articles, db.screening, db.artifacts, db.checkpoints, async () => {
    await Promise.all([
      db.runs.clear(),
      db.articles.clear(),
      db.screening.clear(),
      db.artifacts.clear(),
      db.checkpoints.clear(),
    ]);
  });
}
