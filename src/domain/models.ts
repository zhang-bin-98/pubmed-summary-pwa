export type RunStage =
  | 'draft'
  | 'awaiting-query-confirmation'
  | 'fetching'
  | 'screening'
  | 'outlining'
  | 'writing'
  | 'validating-citations'
  | 'exporting'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type RunStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export interface AppSettings {
  id?: 1;
  deepSeekApiKey: string;
  ncbiApiKey: string;
  modelId: string;
  maxResults: number;
  connectionChecks: {
    deepSeek: 'untested' | 'passed' | 'skipped';
    ncbi: 'untested' | 'passed' | 'skipped';
  };
}

export interface Author {
  lastName: string;
  foreName: string;
  collectiveName?: string;
}

export interface Article {
  id: string;
  runId: string;
  pmid: string;
  sourceOrder: number;
  title: string;
  abstract: string;
  authors: Author[];
  journal: string;
  journalAbbreviation: string;
  publicationDate: string;
  volume: string;
  issue: string;
  pages: string;
  affiliation: string;
}

export interface RunStats {
  matched?: number;
  fetched?: number;
  withAbstract?: number;
  relevant?: number;
  selected?: number;
}

export interface ReviewRun {
  id: string;
  topic: string;
  query: string | null;
  modelId: string;
  maxResults: number;
  stage: RunStage;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  stats: RunStats;
  errorCode?: string;
  errorMessage?: string;
}

export interface ScreeningDecision {
  id: string;
  runId: string;
  articleId: string;
  score: 0 | 1 | 2 | 3;
  include: boolean;
  reason: string;
  promptVersion: 'relevance-v1';
}

export interface ScreenedArticle {
  article: Article;
  decision: ScreeningDecision;
}

export interface ValidatedReview {
  title: string;
  markdown: string;
  references: string[];
}

export interface GenerationArtifact {
  runId: string;
  title?: string;
  outline?: string;
  markdown?: string;
  validatedMarkdown?: string;
  references?: string[];
  promptVersions: {
    search: 'v1';
    outline: 'v1';
    writing: 'v1';
    relevance: 'v1';
  };
}

export interface Checkpoint {
  id: string;
  runId: string;
  stage: RunStage;
  completedAt: number;
  payload?: unknown;
}
