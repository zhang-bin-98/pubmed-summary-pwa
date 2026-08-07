import type { Article, RunStage, RunStats, ScreenedArticle, ValidatedReview } from '../domain/models';

export interface ScreeningProgress {
  completed: number;
  total: number;
  processed: number;
  included: number;
}

export interface WorkflowInput {
  runId: string;
  topic: string;
  query: string;
  modelId: string;
  maxResults: number;
  signal: AbortSignal;
}

export interface WorkflowProgress {
  stage: RunStage;
  completed: number;
  total: number;
  message: string;
  stats?: RunStats;
}

export interface WorkflowDeps {
  fetchArticles(input: WorkflowInput): Promise<Article[]>;
  screenArticles(articles: Article[], input: WorkflowInput, onProgress?: (progress: ScreeningProgress) => void): Promise<ScreenedArticle[]>;
  selectArticles(items: ScreenedArticle[], input: WorkflowInput): Article[];
  generateOutline(articles: Article[], input: WorkflowInput): Promise<string>;
  generateReview(outline: string, articles: Article[], input: WorkflowInput, options?: { temperature?: number }): Promise<string>;
  validateCitations(markdown: string, articles: Article[]): ValidatedReview;
  exportDocx(review: ValidatedReview, input: WorkflowInput): Promise<void>;
  loadCheckpoint<T>(stage: RunStage, runId?: string): Promise<T | undefined>;
  checkpoint(stage: RunStage, payload: unknown, runId?: string): Promise<void>;
  onProgress?(progress: WorkflowProgress): void;
}

export type WorkflowErrorCode =
  | 'auth'
  | 'network'
  | 'rate-limit'
  | 'xml'
  | 'no-abstracts'
  | 'no-relevant-articles'
  | 'screening-format'
  | 'context-budget'
  | 'citation-validation'
  | 'storage-quota'
  | 'cancellation'
  | 'unknown';

export class WorkflowError extends Error {
  constructor(public readonly code: WorkflowErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WorkflowError';
  }
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError');
}

function mapWorkflowError(error: unknown): WorkflowError {
  if (error instanceof WorkflowError) return error;
  if (isAbortError(error)) return new WorkflowError('cancellation', '工作流已取消', { cause: error });
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const normalizedCode: WorkflowErrorCode | undefined =
    code === 'deepseek-auth' || code === 'ncbi-auth' ? 'auth' :
      code === 'deepseek-rate-limit' || code === 'ncbi-rate-limit' ? 'rate-limit' :
        code === 'deepseek-network' || code === 'ncbi-network' ? 'network' :
          code === 'deepseek-response' || code === 'ncbi-response' ? 'network' :
            code === 'storage-quota' || (error instanceof Error && error.name === 'QuotaExceededError') ? 'storage-quota' :
              ['auth', 'network', 'rate-limit', 'xml', 'no-abstracts', 'no-relevant-articles', 'screening-format', 'context-budget', 'citation-validation', 'cancellation'].includes(code)
                ? code as WorkflowErrorCode
                : undefined;
  if (normalizedCode) return new WorkflowError(normalizedCode, error instanceof Error ? error.message : code, { cause: error });
  return new WorkflowError('unknown', error instanceof Error ? error.message : '工作流执行失败', { cause: error });
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new WorkflowError('cancellation', '工作流已取消');
}

export interface WorkflowResult {
  review: ValidatedReview;
  articles: Article[];
  screenedArticles: ScreenedArticle[];
}

export async function runWorkflow(input: WorkflowInput, deps: WorkflowDeps): Promise<WorkflowResult> {
  try {
    assertNotAborted(input.signal);
    deps.onProgress?.({ stage: 'fetching', completed: 0, total: 7, message: '正在获取 PubMed 摘要' });
    const screeningCheckpoint = await deps.loadCheckpoint<ScreenedArticle[]>('screening', input.runId);
    let articles: Article[];
    let screenedArticles: ScreenedArticle[];
    let withAbstractCount = 0;

    if (screeningCheckpoint) {
      screenedArticles = screeningCheckpoint;
      articles = screenedArticles.map(({ article }) => article);
      withAbstractCount = articles.length;
    } else {
      const fetchedCheckpoint = await deps.loadCheckpoint<Article[]>('fetching', input.runId);
      articles = fetchedCheckpoint ?? await deps.fetchArticles(input);
      if (!fetchedCheckpoint) await deps.checkpoint('fetching', articles, input.runId);
      assertNotAborted(input.signal);
      const withAbstract = articles.filter((article) => article.abstract.trim().length > 0);
      if (withAbstract.length === 0) throw new WorkflowError('no-abstracts', '没有可用于综述的摘要');
      withAbstractCount = withAbstract.length;
      deps.onProgress?.({
        stage: 'screening',
        completed: 1,
        total: 7,
        message: `正在筛选相关文献（共 ${withAbstract.length} 篇；并行最多 5 路，启动间隔 1 秒）`,
        stats: { fetched: articles.length, withAbstract: withAbstract.length },
      });
      screenedArticles = await deps.screenArticles(withAbstract, input, (progress) => {
        const fraction = progress.total > 0 ? progress.completed / progress.total : 1;
        deps.onProgress?.({
          stage: 'screening',
          completed: 1 + fraction,
          total: 7,
          message: `正在筛选相关文献（第 ${progress.completed}/${progress.total} 批，已处理 ${progress.processed}/${withAbstract.length} 篇；并行最多 5 路，启动间隔 1 秒）`,
          stats: {
            fetched: articles.length,
            withAbstract: withAbstract.length,
            relevant: progress.included,
          },
        });
      });
      await deps.checkpoint('screening', screenedArticles, input.runId);
    }

    assertNotAborted(input.signal);
    const relevantCount = screenedArticles.filter((item) => item.decision.include).length;
    const selectedArticles = deps.selectArticles(screenedArticles, input);
    if (selectedArticles.length === 0) throw new WorkflowError('no-relevant-articles', '没有筛选出相关文献');
    deps.onProgress?.({
      stage: 'outlining',
      completed: 2,
      total: 7,
      message: `正在选择上下文并生成大纲（${selectedArticles.length} 篇入选，${relevantCount} 篇相关）`,
      stats: { fetched: articles.length, withAbstract: withAbstractCount, relevant: relevantCount, contextSelected: selectedArticles.length },
    });
    assertNotAborted(input.signal);
    const outlineCheckpoint = await deps.loadCheckpoint<string>('outlining', input.runId);
    const outline = outlineCheckpoint ?? await deps.generateOutline(selectedArticles, input);
    if (!outlineCheckpoint) await deps.checkpoint('outlining', outline, input.runId);
    assertNotAborted(input.signal);
    const writingCheckpoint = await deps.loadCheckpoint<string>('writing', input.runId);
    let markdown = writingCheckpoint ?? await deps.generateReview(outline, selectedArticles, input);
    if (!writingCheckpoint) await deps.checkpoint('writing', markdown, input.runId);
    deps.onProgress?.({ stage: 'validating-citations', completed: 5, total: 7, message: '正在校验引用' });
    const validationCheckpoint = await deps.loadCheckpoint<ValidatedReview>('validating-citations', input.runId);
    let review: ValidatedReview;
    if (validationCheckpoint) {
      review = validationCheckpoint;
    } else {
      try {
        review = deps.validateCitations(markdown, selectedArticles);
      } catch (firstError) {
        if (isAbortError(firstError)) throw firstError;
        markdown = await deps.generateReview(outline, selectedArticles, input, { temperature: 0 });
        try {
          review = deps.validateCitations(markdown, selectedArticles);
        } catch (secondError) {
          throw new WorkflowError('citation-validation', secondError instanceof Error ? secondError.message : '引用校验失败', { cause: secondError });
        }
      }
      await deps.checkpoint('validating-citations', review, input.runId);
    }
    assertNotAborted(input.signal);
    deps.onProgress?.({
      stage: 'exporting',
      completed: 6,
      total: 7,
      message: `正在导出 Word 文档（正文实际引用 ${review.references.length} 篇）`,
      stats: { fetched: articles.length, withAbstract: withAbstractCount, relevant: relevantCount, contextSelected: selectedArticles.length, selected: review.references.length },
    });
    await deps.exportDocx(review, input);
    await deps.checkpoint('exporting', review, input.runId);
    deps.onProgress?.({ stage: 'completed', completed: 7, total: 7, message: '综述已完成' });
    return { review, articles: selectedArticles, screenedArticles };
  } catch (error) {
    throw mapWorkflowError(error);
  }
}
