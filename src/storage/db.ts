import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  Article,
  Checkpoint,
  GenerationArtifact,
  ReviewRun,
  ScreeningDecision,
} from '../domain/models';

export class PubMedSummaryDb extends Dexie {
  settings!: EntityTable<AppSettings, 'id'>;
  runs!: EntityTable<ReviewRun, 'id'>;
  articles!: EntityTable<Article, 'id'>;
  screening!: EntityTable<ScreeningDecision, 'id'>;
  artifacts!: EntityTable<GenerationArtifact, 'runId'>;
  checkpoints!: EntityTable<Checkpoint, 'id'>;

  constructor(name = 'pubmed-summary-pwa') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      runs: 'id,updatedAt,status',
      articles: 'id,runId,pmid',
      screening: 'id,runId,articleId',
      artifacts: 'runId',
      checkpoints: 'id,runId,completedAt',
    });
  }
}

export const db = new PubMedSummaryDb();
