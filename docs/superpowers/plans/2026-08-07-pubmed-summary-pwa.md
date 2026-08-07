# PubMed 综述 PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个部署在 GitHub Pages、完全在浏览器中运行的 PubMed 检索与中文综述生成 PWA，并直接导出只含正文和实际引用参考文献的 DOCX。

**Architecture:** React 单页应用通过两个隔离的 API Client 直接调用 NCBI E-utilities 与 DeepSeek，工作流状态机在每个阶段向 IndexedDB 写入检查点。原 n8n 的三组提示词以原始文本和固定哈希纳入版本控制，新增的相关性筛选独立运行；XML 解析、上下文预算、引用校验和 DOCX 生成全部在浏览器端完成。

**Tech Stack:** React, TypeScript, Vite, Dexie/IndexedDB, fast-xml-parser, Zod, docx, Lucide React, vite-plugin-pwa, Vitest, Testing Library, Playwright

---

## File Structure

```text
.
├── .github/workflows/deploy-pages.yml       # GitHub Pages 构建与发布
├── .gitattributes                           # 锁定提示词 LF 换行
├── .gitignore                               # 排除构建和测试产物
├── public/icons/                            # 192/512/maskable PWA PNG 图标
├── scripts/extract-prompts.mjs              # 从本机 n8n JSON 仅提取三个提示词
├── scripts/generate-icons.mjs               # 生成可复现的 PWA PNG 图标
├── src/
│   ├── api/deepseekClient.ts                # DeepSeek 模型和补全请求
│   ├── api/ncbiClient.ts                    # ESearch/EFetch 与重试、限速
│   ├── app/App.tsx                          # 顶层页面状态与导航
│   ├── app/styles.css                       # 响应式设计系统与布局
│   ├── domain/models.ts                     # 共享领域类型和状态枚举
│   ├── export/dataExport.ts                 # JSON/CSV 运行记录导出
│   ├── export/docxExport.ts                 # DOCX 构建与下载
│   ├── history/HistoryView.tsx              # 历史列表与操作
│   ├── prompts/loadPrompts.ts               # 原提示词加载和变量绑定
│   ├── prompts/original/*.txt               # 原 n8n 提示词，内容锁定
│   ├── prompts/relevance-v1.ts              # 独立相关性筛选提示词
│   ├── pubmed/parsePubmedXml.ts              # PubMed XML 标准化
│   ├── settings/SettingsView.tsx             # 密钥、模型、默认值与清理
│   ├── storage/db.ts                         # Dexie schema 与事务
│   ├── storage/repositories.ts               # 设置、任务、文章、检查点 API
│   ├── workflow/citations.ts                 # 引用校验与重排
│   ├── workflow/contextBudget.ts             # 动态上下文预算
│   ├── workflow/relevance.ts                 # 分批筛选与结果校验
│   ├── workflow/references.ts                # 证据包与参考文献格式
│   ├── workflow/runWorkflow.ts               # 可恢复工作流编排
│   ├── workspace/Workspace.tsx               # 输入、检索式确认、进度、完成
│   ├── main.tsx                              # React/PWA 入口
│   └── vite-env.d.ts                         # `?raw` 与 Vite 类型
├── tests/fixtures/                           # XML 与 API 固定响应
├── tests/e2e/review-flow.spec.ts             # 桌面/手机/离线完整流程
├── index.html                                # CSP 与应用挂载点
├── package.json
├── playwright.config.ts
├── tsconfig*.json
├── vite.config.ts
└── vitest.setup.ts
```

### Task 1: Bootstrap the React/PWA Test Harness

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/vite-env.d.ts`
- Create: `vite.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize npm and install the exact dependency groups**

Run:

```powershell
npm init -y
npm install react react-dom dexie docx fast-xml-parser lucide-react zod
npm install -D typescript vite @vitejs/plugin-react vite-plugin-pwa vitest jsdom fake-indexeddb @testing-library/react @testing-library/user-event @testing-library/jest-dom @types/react @types/react-dom @playwright/test sharp
npm pkg set type=module
npm pkg set scripts.dev="vite"
npm pkg set scripts.build="tsc -b && vite build"
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
npm pkg set scripts.lint="tsc -b --pretty false"
npm pkg set scripts.e2e="playwright test"
npm pkg set scripts.preview="vite preview"
```

Expected: `package.json` and `package-lock.json` are created; npm reports no unresolved dependency conflict.

Append `test-results/`, `playwright-report/`, and `blob-report/` to `.gitignore`; keep `.superpowers/`, `node_modules/`, `dist/`, and `.env*` exclusions already present.

- [ ] **Step 2: Create the failing application smoke test**

```tsx
// src/app/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the focused workspace heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'PubMed 综述' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Add Vitest, TypeScript, Vite, and Playwright configuration and verify the test fails**

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    restoreMocks: true,
  },
});
```

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 4: Add the minimal application shell**

```tsx
// src/app/App.tsx
export function App() {
  return (
    <main>
      <h1>PubMed 综述</h1>
    </main>
  );
}
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

```html
<!-- index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#176b5b">
    <meta name="description" content="在浏览器中检索 PubMed 并生成中文医学综述">
    <title>PubMed 综述</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Use a composite root `tsconfig.json` that references `tsconfig.app.json` and `tsconfig.node.json`. The app config includes `ES2022`, `DOM`, `DOM.Iterable`, `jsx: react-jsx`, `moduleResolution: Bundler`, `strict: true`, and `noEmit: true`; the node config covers `vite.config.ts`. In `src/vite-env.d.ts`, reference `vite/client` and declare `module '*.txt?raw' { const content: string; export default content; }`.

- [ ] **Step 5: Run the quality gates**

Run:

```powershell
npm test -- src/app/App.test.tsx
npm run lint
npm run build
```

Expected: one passing test, TypeScript exits `0`, and Vite writes `dist/`.

- [ ] **Step 6: Commit the scaffold**

```powershell
git add package.json package-lock.json index.html src vite.config.ts vitest.setup.ts playwright.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json
git commit -m "chore: scaffold PubMed summary PWA"
```

### Task 2: Extract and Lock the Original n8n Prompts

**Files:**
- Create: `scripts/extract-prompts.mjs`
- Create: `src/prompts/original/pubmed-search-v1.txt`
- Create: `src/prompts/original/review-outline-v1.txt`
- Create: `src/prompts/original/review-writing-v1.txt`
- Create: `src/prompts/loadPrompts.ts`
- Create: `src/prompts/loadPrompts.test.ts`
- Create: `.gitattributes`

- [ ] **Step 1: Write a prompt extraction script that cannot copy credentials**

```js
// scripts/extract-prompts.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const source = process.env.PUBMED_N8N_WORKFLOW;
if (!source) throw new Error('PUBMED_N8N_WORKFLOW is required');

const workflow = JSON.parse(await readFile(source, 'utf8'));
const targets = new Map([
  ['生成PubMed检索式', 'pubmed-search-v1.txt'],
  ['综述框架agent', 'review-outline-v1.txt'],
  ['综述写作agent', 'review-writing-v1.txt'],
]);
const outputDir = path.resolve('src/prompts/original');
await mkdir(outputDir, { recursive: true });

for (const [nodeName, fileName] of targets) {
  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  const prompt = node?.parameters?.text;
  if (typeof prompt !== 'string' || prompt.length === 0) {
    throw new Error(`Prompt not found: ${nodeName}`);
  }
  await writeFile(path.join(outputDir, fileName), prompt, 'utf8');
}
```

Create `.gitattributes` before committing extracted prompts:

```gitattributes
* text=auto
*.txt text eol=lf
*.ts text eol=lf
*.tsx text eol=lf
*.mjs text eol=lf
```

- [ ] **Step 2: Run the extractor against the local workflow and inspect only the three output files**

Run:

```powershell
$env:PUBMED_N8N_WORKFLOW='D:\BaiduSyncdisk\n8n\PubMed summary.json'
node scripts/extract-prompts.mjs
Remove-Item Env:\PUBMED_N8N_WORKFLOW
node -e "const fs=require('fs');for(const f of fs.readdirSync('src/prompts/original'))console.log(f,fs.readFileSync('src/prompts/original/'+f,'utf8').length)"
```

Expected lengths in JavaScript UTF-16 code units: search `5908`, outline `1107`, writing `2088`. Do not copy the source workflow JSON into the repository.

- [ ] **Step 3: Write failing hash and binding tests**

```ts
// src/prompts/loadPrompts.test.ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';
import { renderOutlinePrompt, renderSearchPrompt, renderWritingPrompt } from './loadPrompts';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('original n8n prompts', () => {
  it('matches the approved source text exactly', () => {
    expect(sha256(searchRaw)).toBe('ff40c7f97f8b049fed98fb35e464e494e8b16b38507e05dcf6569a46bf3f858a');
    expect(sha256(outlineRaw)).toBe('2ceb8c0e94b73c3da80835d063396531d85f106fd22e4419bd8b4c65d67977c9');
    expect(sha256(writingRaw)).toBe('45f61bb69cc7cde4bdb84bc3b326ae9380e128f60ecb50fb34517884121bda7f');
  });

  it('replaces only the approved n8n bindings', () => {
    expect(renderSearchPrompt('主题', '2026-08-07')).not.toContain('{{');
    expect(renderOutlinePrompt('摘要包', '主题')).toContain('摘要包');
    expect(renderWritingPrompt('大纲', '摘要包')).toContain('大纲');
  });
});
```

Run: `npm test -- src/prompts/loadPrompts.test.ts`

Expected: FAIL because `loadPrompts.ts` does not exist.

- [ ] **Step 4: Implement exact binding replacement without rewriting prompt prose**

```ts
// src/prompts/loadPrompts.ts
import searchRaw from './original/pubmed-search-v1.txt?raw';
import outlineRaw from './original/review-outline-v1.txt?raw';
import writingRaw from './original/review-writing-v1.txt?raw';

function unwrapN8nExpression(raw: string): string {
  return raw.startsWith('=') ? raw.slice(1) : raw;
}

function bind(raw: string, values: Readonly<Record<string, string>>): string {
  let rendered = unwrapN8nExpression(raw);
  for (const [expression, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(expression, value);
  }
  if (rendered.includes('{{')) throw new Error('Unresolved n8n prompt binding');
  return rendered;
}

export const renderSearchPrompt = (query: string, currentDate: string) => bind(searchRaw, {
  '{{ $json.text }}': query,
  '{{ $json.currentDateInfo }}': currentDate,
});

export const renderOutlinePrompt = (combinedSummary: string, originalQuery: string) => bind(outlineRaw, {
  '{{ $json.combined_summary }}': combinedSummary,
  '{{ $json.original_query }}': originalQuery,
});

export const renderWritingPrompt = (outline: string, combinedSummary: string) => bind(writingRaw, {
  '{{ $json.output }}': outline,
  "{{ $('整合摘要&提取检索要求').item.json.combined_summary }}": combinedSummary,
});
```

- [ ] **Step 5: Verify prompt integrity and commit**

Run: `npm test -- src/prompts/loadPrompts.test.ts`

Expected: two passing tests and all three hashes exactly match.

```powershell
git add .gitattributes scripts/extract-prompts.mjs src/prompts
git commit -m "feat: preserve original n8n prompts"
```

### Task 3: Define Domain Types and IndexedDB Repositories

**Files:**
- Create: `src/domain/models.ts`
- Create: `src/storage/db.ts`
- Create: `src/storage/repositories.ts`
- Create: `src/storage/repositories.test.ts`

- [ ] **Step 1: Write failing persistence and secret-export tests**

```ts
// src/storage/repositories.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { clearAllLocalData, getSettings, saveSettings, saveRun, getRunBundle } from './repositories';

describe('local repositories', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('persists the selected keys and defaults locally', async () => {
    await saveSettings({ deepSeekApiKey: 'ds-key', ncbiApiKey: 'ncbi-key', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'passed', ncbi: 'passed' } });
    expect(await getSettings()).toMatchObject({ modelId: 'deepseek-v4-flash', maxResults: 300 });
  });

  it('stores and reloads a complete run bundle transactionally', async () => {
    await saveRun({ id: 'run-1', topic: '主题', query: null, modelId: 'deepseek-v4-flash', maxResults: 300, stage: 'draft', status: 'active', createdAt: 1, updatedAt: 1, stats: {} });
    expect((await getRunBundle('run-1'))?.run.id).toBe('run-1');
    await clearAllLocalData();
    expect(await getSettings()).toBeUndefined();
  });
});
```

Run: `npm test -- src/storage/repositories.test.ts`

Expected: FAIL because the storage modules do not exist.

- [ ] **Step 2: Add explicit domain types used by every later task**

```ts
// src/domain/models.ts
export type RunStage = 'draft' | 'awaiting-query-confirmation' | 'fetching' | 'screening' | 'outlining' | 'writing' | 'validating-citations' | 'exporting' | 'completed' | 'cancelled' | 'failed';
export type RunStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export interface AppSettings {
  id?: 1;
  deepSeekApiKey: string;
  ncbiApiKey: string;
  modelId: string;
  maxResults: number;
  connectionChecks: { deepSeek: 'untested' | 'passed' | 'skipped'; ncbi: 'untested' | 'passed' | 'skipped' };
}

export interface Author { lastName: string; foreName: string; collectiveName?: string }
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

export interface RunStats { matched?: number; fetched?: number; withAbstract?: number; relevant?: number; selected?: number }
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
export interface ScreeningDecision { id: string; runId: string; articleId: string; score: 0 | 1 | 2 | 3; include: boolean; reason: string; promptVersion: 'relevance-v1' }
export interface ScreenedArticle { article: Article; decision: ScreeningDecision }
export interface ValidatedReview { title: string; markdown: string; references: string[] }
export interface GenerationArtifact { runId: string; outline?: string; markdown?: string; validatedMarkdown?: string; references?: string[]; promptVersions: { search: 'v1'; outline: 'v1'; writing: 'v1'; relevance: 'v1' } }
export interface Checkpoint { id: string; runId: string; stage: RunStage; completedAt: number }
```

- [ ] **Step 3: Implement the Dexie schema and repository boundary**

```ts
// src/storage/db.ts
import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Article, Checkpoint, GenerationArtifact, ReviewRun, ScreeningDecision } from '../domain/models';

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
      settings: 'id', runs: 'id,updatedAt,status', articles: 'id,runId,pmid',
      screening: 'id,runId,articleId', artifacts: 'runId', checkpoints: 'id,runId,completedAt',
    });
  }
}

export const db = new PubMedSummaryDb();
```

```ts
// src/storage/repositories.ts
import type { AppSettings, Article, Checkpoint, GenerationArtifact, ReviewRun, ScreeningDecision } from '../domain/models';
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
    db.runs.get(runId), db.articles.where('runId').equals(runId).toArray(),
    db.screening.where('runId').equals(runId).toArray(), db.artifacts.get(runId),
    db.checkpoints.where('runId').equals(runId).sortBy('completedAt'),
  ]);
  return run ? { run, articles, screening, artifact, checkpoints } : undefined;
}

export async function deleteRun(runId: string) {
  await db.transaction('rw', db.runs, db.articles, db.screening, db.artifacts, db.checkpoints, async () => {
    await Promise.all([
      db.runs.delete(runId), db.articles.where('runId').equals(runId).delete(),
      db.screening.where('runId').equals(runId).delete(), db.artifacts.delete(runId),
      db.checkpoints.where('runId').equals(runId).delete(),
    ]);
  });
}

export async function clearAllLocalData() {
  await db.delete();
  await db.open();
}
```

When a stage needs to persist several tables, wrap the existing repository calls in one `db.transaction('rw', ...)` at the composition root so the run status and checkpoint cannot diverge.

- [ ] **Step 4: Run repository tests and commit**

Run: `npm test -- src/storage/repositories.test.ts`

Expected: both tests pass.

```powershell
git add src/domain src/storage
git commit -m "feat: add local run persistence"
```

### Task 4: Build the NCBI Client and PubMed XML Parser

**Files:**
- Create: `src/api/ncbiClient.ts`
- Create: `src/api/ncbiClient.test.ts`
- Create: `src/pubmed/parsePubmedXml.ts`
- Create: `src/pubmed/parsePubmedXml.test.ts`
- Create: `tests/fixtures/pubmed-sample.xml`

- [ ] **Step 1: Add a minimal XML fixture and failing parser assertions**

```xml
<!-- tests/fixtures/pubmed-sample.xml -->
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>123</PMID>
      <Article>
        <ArticleTitle>Preserve THIS Title</ArticleTitle>
        <Abstract><AbstractText Label="BACKGROUND">First section.</AbstractText><AbstractText Label="RESULTS">Second section.</AbstractText></Abstract>
        <AuthorList><Author><LastName>Wang</LastName><ForeName>Li</ForeName><AffiliationInfo><Affiliation>Example Hospital</Affiliation></AffiliationInfo></Author></AuthorList>
        <Journal><ISSN>0000</ISSN><JournalIssue><Volume>7</Volume><Issue>2</Issue><PubDate><Year>2026</Year><Month>Aug</Month></PubDate></JournalIssue><Title>Example Journal</Title><ISOAbbreviation>Ex J</ISOAbbreviation></Journal>
        <Pagination><MedlinePgn>10-15</MedlinePgn></Pagination>
      </Article>
    </MedlineCitation>
  </PubmedArticle>
</PubmedArticleSet>
```

```ts
// src/pubmed/parsePubmedXml.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePubmedXml } from './parsePubmedXml';

it('normalizes structured abstracts without changing title case', () => {
  const articles = parsePubmedXml(readFileSync('tests/fixtures/pubmed-sample.xml', 'utf8'), 'run-1', 0);
  expect(articles[0]).toMatchObject({ pmid: '123', title: 'Preserve THIS Title', publicationDate: '2026-08', journalAbbreviation: 'Ex J' });
  expect(articles[0].abstract).toBe('[BACKGROUND] First section.\n\n[RESULTS] Second section.');
});
```

Run: `npm test -- src/pubmed/parsePubmedXml.test.ts`

Expected: FAIL because the parser does not exist.

- [ ] **Step 2: Implement XML normalization with structured parser APIs**

Use `XMLParser` with `ignoreAttributes: false`, `attributeNamePrefix: '@_'`, `textNodeName: '#text'`, `trimValues: true`, and explicit array normalization. Implement helpers `asArray`, `textOf`, `formatPubDate`, `parseAuthors`, and return only articles with a PMID; leave no-abstract exclusion to the workflow so it can count exclusions.

```ts
// core of src/pubmed/parsePubmedXml.ts
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', trimValues: true });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const textOf = (value: unknown): string => typeof value === 'string' || typeof value === 'number'
  ? String(value)
  : value && typeof value === 'object' && '#text' in value ? String((value as Record<string, unknown>)['#text']) : '';
```

Map every result to the `Article` interface, set `id` to `${runId}:${pmid}`, and add `startOrder + index` to support paged EFetch responses.

- [ ] **Step 3: Write failing ESearch/EFetch request tests**

```ts
// src/api/ncbiClient.test.ts
import { describe, expect, it, vi } from 'vitest';
import { NcbiClient } from './ncbiClient';

it('uses history and the confirmed 300-result limit', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ esearchresult: { count: '420', idlist: [], webenv: 'env', querykey: '1' } }), { status: 200 }));
  const client = new NcbiClient('key', fetcher);
  const result = await client.search('term', 300, new AbortController().signal);
  expect(result.count).toBe(420);
  expect(String(fetcher.mock.calls[0][1]?.body)).toContain('retmax=300');
  expect(String(fetcher.mock.calls[0][1]?.body)).toContain('usehistory=y');
  expect(String(fetcher.mock.calls[0][1]?.body)).toContain('api_key=key');
});
```

- [ ] **Step 4: Implement NCBI requests, paging, and finite retry**

Implement `NcbiClient.search(term, maxResults, signal)`, `count(term, signal)`, and `fetchAbstractPages(history, total, signal, pageSize = 100)`. Send ESearch as form-urlencoded POST with `db=pubmed`, `retmode=json`, `retmax`, `usehistory=y`, `term`, `api_key`, and `tool=pubmed_summary_pwa`. Send EFetch as form-urlencoded POST with `db=pubmed`, `rettype=abstract`, `retmode=xml`, `WebEnv`, `query_key`, `retstart`, `retmax`, `api_key`, and the same tool name. Keeping both API keys in POST bodies/headers prevents them from appearing in URLs.

Use a shared `requestWithRetry` that retries only `429` and `5xx` at delays `500`, `1000`, and `2000` ms plus `0–200` ms jitter; propagate `AbortError` immediately. Execute EFetch pages sequentially so the client remains below NCBI API limits.

- [ ] **Step 5: Run tests and commit**

Run:

```powershell
npm test -- src/pubmed/parsePubmedXml.test.ts src/api/ncbiClient.test.ts
npm run lint
```

Expected: parser and client tests pass with no TypeScript errors.

```powershell
git add src/api/ncbiClient* src/pubmed tests/fixtures/pubmed-sample.xml
git commit -m "feat: fetch and parse PubMed abstracts"
```

### Task 5: Build the DeepSeek Client and Model Resolution

**Files:**
- Create: `src/api/deepseekClient.ts`
- Create: `src/api/deepseekClient.test.ts`

- [ ] **Step 1: Write failing model-list and completion tests**

```ts
// src/api/deepseekClient.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient, orderPreferredModels } from './deepseekClient';

it('prefers current flash and pro models without hard-coding one ID', () => {
  expect(orderPreferredModels([{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4-flash' }]).map((m) => m.id))
    .toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
});

it('sends a browser-safe chat completion request', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '结果' } }] }), { status: 200 }));
  const client = new DeepSeekClient('secret', fetcher);
  expect(await client.complete({ model: 'deepseek-v4-flash', prompt: '提示', signal: new AbortController().signal })).toBe('结果');
  expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: 'Bearer secret', 'Content-Type': 'application/json' });
});
```

Run: `npm test -- src/api/deepseekClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 2: Implement schema-validated model and completion responses**

```ts
// public surface of src/api/deepseekClient.ts
export interface DeepSeekModel { id: string; contextLength?: number }
export interface CompletionRequest { model: string; prompt: string; signal: AbortSignal; json?: boolean; temperature?: number }

export class DeepSeekClient {
  constructor(private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}
  listModels(signal: AbortSignal): Promise<DeepSeekModel[]>;
  complete(request: CompletionRequest): Promise<string>;
}
```

Use Zod to accept OpenAI-compatible `{ data: [{ id, context_length? }] }` and `{ choices: [{ message: { content } }] }` shapes. Request `https://api.deepseek.com/models` and `https://api.deepseek.com/chat/completions`. Set `response_format: { type: 'json_object' }` only when `json` is true. Reuse the same finite retry policy as NCBI for `429` and `5xx`, but keep API-specific error codes (`deepseek-auth`, `deepseek-rate-limit`, `deepseek-response`).

`orderPreferredModels` sorts IDs containing `flash` first, IDs containing `pro` second, and all others alphabetically. `resolveScreeningModel` chooses the first Flash model or falls back to the user's selected model.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- src/api/deepseekClient.test.ts`

Expected: both tests pass.

```powershell
git add src/api/deepseekClient*
git commit -m "feat: add DeepSeek browser client"
```

### Task 6: Implement Relevance Screening and Dynamic Context Budgeting

**Files:**
- Create: `src/prompts/relevance-v1.ts`
- Create: `src/workflow/relevance.ts`
- Create: `src/workflow/relevance.test.ts`
- Create: `src/workflow/contextBudget.ts`
- Create: `src/workflow/contextBudget.test.ts`

- [ ] **Step 1: Write failing screening validation tests**

```ts
// src/workflow/relevance.test.ts
import { describe, expect, it } from 'vitest';
import { validateScreeningBatch } from './relevance';

const articleIds = ['run:1', 'run:2'];

it('accepts one decision for every requested article', () => {
  const parsed = validateScreeningBatch(JSON.stringify({ decisions: [
    { sourceId: 'run:1', score: 3, include: true, reason: '直接相关' },
    { sourceId: 'run:2', score: 0, include: false, reason: '主题不符' },
  ] }), articleIds);
  expect(parsed).toHaveLength(2);
});

it('rejects unknown, duplicate, or missing source IDs', () => {
  expect(() => validateScreeningBatch('{"decisions":[{"sourceId":"run:1","score":3,"include":true,"reason":"相关"}]}', articleIds)).toThrow('Screening IDs do not match batch');
});
```

- [ ] **Step 2: Create the independent screening prompt and strict Zod schema**

```ts
// src/prompts/relevance-v1.ts
import type { Article } from '../domain/models';

export const RELEVANCE_PROMPT_VERSION = 'relevance-v1' as const;

export function buildRelevancePrompt(topic: string, articles: Article[]): string {
  return [
    '你是医学文献初筛助手。根据用户研究主题，仅评估每篇标题和摘要的主题相关性。',
    '评分：0=无关，1=弱相关，2=相关，3=直接相关。score>=2 时 include=true，否则为 false。',
    '必须只输出 JSON：{"decisions":[{"sourceId":"...","score":0,"include":false,"reason":"不超过40字"}]}。',
    `研究主题：${topic}`,
    JSON.stringify(articles.map(({ id, title, abstract }) => ({ sourceId: id, title, abstract }))),
  ].join('\n\n');
}
```

In `relevance.ts`, define a Zod schema with integer scores `0..3`, non-empty `sourceId`, boolean `include`, and a reason capped at 80 characters. `validateScreeningBatch` must compare sorted expected and received ID arrays exactly and reject duplicates. `batchArticlesForScreening` starts a new batch at either 20 articles or an estimated 24,000 input tokens, whichever comes first. `screenArticles` processes those batches sequentially, uses the resolved Flash model, writes each validated batch through a callback, and retries one invalid JSON response before throwing `screening-format`.

- [ ] **Step 3: Verify screening tests pass**

Run: `npm test -- src/workflow/relevance.test.ts`

Expected: both tests pass.

- [ ] **Step 4: Write failing dynamic budget tests**

```ts
// src/workflow/contextBudget.test.ts
import { describe, expect, it } from 'vitest';
import { selectWithinContext } from './contextBudget';

const article = (id: string, score: 0 | 1 | 2 | 3, abstract: string, sourceOrder: number) => ({
  article: { id, runId: 'run', pmid: id, sourceOrder, title: id, abstract, authors: [], journal: '', journalAbbreviation: '', publicationDate: '', volume: '', issue: '', pages: '', affiliation: '' },
  decision: { id, runId: 'run', articleId: id, score, include: true, reason: '', promptVersion: 'relevance-v1' as const },
});

it('selects whole articles by score then source order until the safe budget', () => {
  const result = selectWithinContext([article('a', 2, 'x'.repeat(100), 0), article('b', 3, 'x'.repeat(100), 1)], { contextWindow: 2500, promptTokens: 100, outputReserve: 1500 });
  expect(result.selected.map((item) => item.article.id)[0]).toBe('b');
  expect(result.selected.every((item) => item.article.abstract.length === 100)).toBe(true);
});
```

- [ ] **Step 5: Implement conservative token estimation and model capability fallback**

```ts
// src/workflow/contextBudget.ts
export interface ContextBudget { contextWindow: number; promptTokens: number; outputReserve: number }

export function estimateTokens(value: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const char of value) char.charCodeAt(0) <= 0x7f ? ascii++ : nonAscii++;
  return Math.ceil((ascii / 3 + nonAscii * 1.5) * 1.15);
}

export function resolveContextWindow(modelId: string, apiValue?: number): number {
  if (apiValue && Number.isFinite(apiValue) && apiValue >= 16_000) return apiValue;
  return 64_000;
}
```

Implement `selectWithinContext` to discard `include=false`, sort by score descending and source order ascending, reserve `max(12_000, floor(contextWindow * 0.25))` output tokens when no explicit reserve is supplied, add each complete article's formatted evidence token estimate, and return both `selected` and `omittedForBudget`. Never truncate an abstract.

- [ ] **Step 6: Run focused tests and commit**

Run:

```powershell
npm test -- src/workflow/relevance.test.ts src/workflow/contextBudget.test.ts
npm run lint
```

Expected: all screening and budget tests pass.

```powershell
git add src/prompts/relevance-v1.ts src/workflow/relevance* src/workflow/contextBudget*
git commit -m "feat: screen articles within model context"
```

### Task 7: Build Evidence, References, and Citation Validation

**Files:**
- Create: `src/workflow/references.ts`
- Create: `src/workflow/references.test.ts`
- Create: `src/workflow/citations.ts`
- Create: `src/workflow/citations.test.ts`

- [ ] **Step 1: Write failing evidence and reference tests**

```ts
// src/workflow/references.test.ts
import { expect, it } from 'vitest';
import { buildEvidenceBundle, formatAmaReference } from './references';

const article = { id: 'r:1', runId: 'r', pmid: '123', sourceOrder: 0, title: 'Preserve TITLE Case', abstract: 'Abstract', authors: [{ lastName: 'Wang', foreName: 'Li' }], journal: 'Example Journal', journalAbbreviation: 'Ex J', publicationDate: '2026-08', volume: '7', issue: '2', pages: '10-15', affiliation: '' };

it('keeps source numbers stable and does not lowercase titles', () => {
  const bundle = buildEvidenceBundle([article], { topic: '主题', currentDate: '2026-08-07' });
  expect(bundle).toContain('# 医学文献综述 (2026-08-07)');
  expect(bundle).toContain('检索要求：主题');
  expect(bundle).toContain('**文献 1**');
  expect(formatAmaReference(article)).toContain('Preserve TITLE Case');
  expect(formatAmaReference(article)).toContain('PMID: 123');
});
```

Implement `buildEvidenceBundle(articles, { topic, currentDate })` with the original workflow header, valid-article count, stable `文献 n` labels, title, author summary, journal, date, first affiliation, PMID, and abstract. Implement `formatAmaReference` with up to six named authors followed by `et al` when needed, journal abbreviation fallback, year from `publicationDate`, optional `volume(issue):pages`, and PMID. Do not lowercase titles and do not treat the final author as a corresponding author unless PubMed explicitly marks that role.

- [ ] **Step 2: Write failing citation validation and reorder tests**

```ts
// src/workflow/citations.test.ts
import { expect, it } from 'vitest';
import { validateAndReorderCitations } from './citations';

it('renumbers cited sources by first appearance and omits uncited references', () => {
  const result = validateAndReorderCitations('结论[3, 1]。再次引用[3]。', new Map([[1, 'Ref 1'], [2, 'Ref 2'], [3, 'Ref 3']]));
  expect(result.markdown).toBe('结论[1, 2]。再次引用[1]。');
  expect(result.references).toEqual(['Ref 3', 'Ref 1']);
});

it('rejects source numbers that do not exist', () => {
  expect(() => validateAndReorderCitations('错误[4]。', new Map([[1, 'Ref 1']]))).toThrow('Unknown citation: 4');
});
```

- [ ] **Step 3: Implement deterministic citation processing**

Extract the first `# ` line into `ValidatedReview.title` and remove it from `ValidatedReview.markdown`. Use `/\[([\d,\s]+)\]/g` to scan citations. Parse positive integers, reject unknown IDs before modifying text, collect first appearance order, map source IDs to consecutive output IDs, sort IDs within a multi-citation group, remove duplicate IDs in the same group, and return only the cited references. If the Markdown contains no valid citation while selected references exist, throw `CitationValidationError('No citations found')`.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- src/workflow/references.test.ts src/workflow/citations.test.ts`

Expected: reference formatting and citation tests pass.

```powershell
git add src/workflow/references* src/workflow/citations*
git commit -m "feat: validate and reorder review citations"
```

### Task 8: Generate DOCX, JSON, and CSV in the Browser

**Files:**
- Create: `src/export/docxExport.ts`
- Create: `src/export/docxExport.test.ts`
- Create: `src/export/dataExport.ts`
- Create: `src/export/dataExport.test.ts`

- [ ] **Step 1: Write failing export tests**

```ts
// src/export/dataExport.test.ts
import { expect, it } from 'vitest';
import { buildRunJson, buildArticlesCsv } from './dataExport';

it('never exports API keys', () => {
  const json = buildRunJson({ run: { id: 'r', topic: '主题' }, articles: [], screening: [], artifact: {} });
  expect(json).not.toContain('deepSeekApiKey');
  expect(json).not.toContain('ncbiApiKey');
});

it('escapes commas and quotes in CSV', () => {
  expect(buildArticlesCsv([{ pmid: '1', title: 'A, "B"', included: true, score: 3, reason: '相关' }])).toContain('"A, ""B"""');
});
```

```ts
// src/export/docxExport.test.ts
import { expect, it } from 'vitest';
import { buildDocxBlob, sanitizeDocxFileName } from './docxExport';

it('builds a docx and a Windows-safe file name', async () => {
  const blob = await buildDocxBlob({ title: '标题', markdown: '## 1. 引言\n\n正文[1]。', references: ['Wang L. Title. Ex J. 2026. PMID: 1'] });
  expect(blob.type).toContain('officedocument.wordprocessingml.document');
  expect(blob.size).toBeGreaterThan(1000);
  expect(sanitizeDocxFileName('A:B?C', '2026-08-07')).toBe('A_B_C-2026-08-07.docx');
});
```

- [ ] **Step 2: Implement data exports with a whitelist**

`buildRunJson` must construct a new serializable object containing only `run`, `articles`, `screening`, and `artifact` fields from the supplied bundle; never spread `AppSettings`. `buildArticlesCsv` must use the columns `pmid,title,journal,publicationDate,included,score,reason`, CRLF line endings, UTF-8 BOM, and RFC 4180 double-quote escaping.

- [ ] **Step 3: Implement DOCX generation without an in-browser preview**

Use `docx` primitives `Document`, `HeadingLevel`, `Packer`, `Paragraph`, and `TextRun`. Parse only the generated Markdown subset needed by the prompts: one `#` title line, `##` section headings, blank-line-delimited paragraphs, and reference strings supplied separately. Preserve `[n]` citation text as normal text. Create a final `参考文献` heading and one numbered paragraph per validated reference. Export `downloadBlob(blob, filename)` using an object URL and a temporary anchor, then revoke the URL.

Do not include query, model, statistics, screening reasons, or raw abstracts in `buildDocxBlob`.

- [ ] **Step 4: Run tests and commit**

Run:

```powershell
npm test -- src/export
npm run lint
```

Expected: all export tests pass.

```powershell
git add src/export
git commit -m "feat: export review and run data locally"
```

### Task 9: Implement the Recoverable Workflow Engine

**Files:**
- Create: `src/workflow/runWorkflow.ts`
- Create: `src/workflow/runWorkflow.test.ts`

- [ ] **Step 1: Write a failing orchestration test with dependency fakes**

```ts
// src/workflow/runWorkflow.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { Article, ScreeningDecision } from '../domain/models';
import { runWorkflow, type WorkflowDeps } from './runWorkflow';

const article: Article = { id: 'r:1', runId: 'r', pmid: '1', sourceOrder: 0, title: 'Title', abstract: 'Abstract', authors: [], journal: '', journalAbbreviation: '', publicationDate: '', volume: '', issue: '', pages: '', affiliation: '' };
const decision: ScreeningDecision = { id: 'r:r:1', runId: 'r', articleId: 'r:1', score: 3, include: true, reason: '相关', promptVersion: 'relevance-v1' };

it('preserves the n8n stage order around the new screening stage', async () => {
  const calls: string[] = [];
  const deps: WorkflowDeps = {
    fetchArticles: vi.fn(async () => { calls.push('fetch'); return [article]; }),
    screenArticles: vi.fn(async () => { calls.push('screen'); return [{ article, decision }]; }),
    selectArticles: vi.fn((items) => { calls.push('budget'); return items.map((item) => item.article); }),
    generateOutline: vi.fn(async () => { calls.push('outline'); return '大纲'; }),
    generateReview: vi.fn(async () => { calls.push('write'); return '# 标题\n\n正文[1]。'; }),
    validateCitations: vi.fn((markdown) => { calls.push('citations'); return { title: '标题', markdown, references: ['Ref'] }; }),
    exportDocx: vi.fn(async () => { calls.push('docx'); }),
    loadCheckpoint: vi.fn(async () => undefined),
    checkpoint: vi.fn(async () => undefined),
  };
  await runWorkflow({ runId: 'r', topic: '主题', query: 'term', modelId: 'model', maxResults: 300, signal: new AbortController().signal }, deps);
  expect(calls).toEqual(['fetch', 'screen', 'budget', 'outline', 'write', 'citations', 'docx']);
});
```

Run: `npm test -- src/workflow/runWorkflow.test.ts`

Expected: FAIL because `runWorkflow` does not exist.

- [ ] **Step 2: Define explicit workflow dependency interfaces and stage errors**

```ts
// public contract in src/workflow/runWorkflow.ts
export interface WorkflowInput { runId: string; topic: string; query: string; modelId: string; maxResults: number; signal: AbortSignal }
export interface WorkflowProgress { stage: RunStage; completed: number; total: number; message: string }
export interface WorkflowDeps {
  fetchArticles(input: WorkflowInput): Promise<Article[]>;
  screenArticles(articles: Article[], input: WorkflowInput): Promise<ScreenedArticle[]>;
  selectArticles(items: ScreenedArticle[], input: WorkflowInput): Article[];
  generateOutline(articles: Article[], input: WorkflowInput): Promise<string>;
  generateReview(outline: string, articles: Article[], input: WorkflowInput, options?: { temperature?: number }): Promise<string>;
  validateCitations(markdown: string, articles: Article[]): ValidatedReview;
  exportDocx(review: ValidatedReview, input: WorkflowInput): Promise<void>;
  loadCheckpoint<T>(stage: RunStage): Promise<T | undefined>;
  checkpoint(stage: RunStage, payload: unknown): Promise<void>;
  onProgress?(progress: WorkflowProgress): void;
}
```

Add typed `WorkflowError` codes for auth, network, rate limit, XML, no abstracts, no relevant articles, screening format, context budget, citation validation, storage quota, cancellation, and unknown failure.

- [ ] **Step 3: Implement staged execution and checkpoint resume**

Implement each stage as `load checkpoint -> execute only when absent -> persist output -> update run stage`. Filtering must remove empty abstracts before DeepSeek screening and persist their exclusion count. When citation validation fails, call `generateReview` once more with the same original writing prompt and `temperature: 0`; if the second result fails, preserve the Markdown and mark the run failed without exporting DOCX.

On `AbortError`, set status `cancelled` and keep all completed checkpoints. On retry, derive the first missing stage from persisted artifacts rather than restarting ESearch. Map `QuotaExceededError` to `storage-quota` and all API-specific errors to actionable `WorkflowError` codes.

- [ ] **Step 4: Add resume and cancellation tests**

Extend `runWorkflow.test.ts` to assert that a stored screening checkpoint skips fetch and screening, and that an already-aborted signal never calls the next dependency. Run:

```powershell
npm test -- src/workflow/runWorkflow.test.ts
npm run lint
```

Expected: stage-order, resume, retry, and cancellation tests pass.

- [ ] **Step 5: Commit the engine**

```powershell
git add src/workflow/runWorkflow*
git commit -m "feat: orchestrate recoverable review runs"
```

### Task 10: Connect Real Clients to the Workflow

**Files:**
- Create: `src/workflow/createWorkflowDeps.ts`
- Create: `src/workflow/createWorkflowDeps.test.ts`

- [ ] **Step 1: Write a failing composition test**

```ts
// src/workflow/createWorkflowDeps.test.ts
import { expect, it, vi } from 'vitest';
import { createWorkflowDeps } from './createWorkflowDeps';

it('uses original prompts for search, outline, and writing and the separate screening model', async () => {
  const complete = vi.fn().mockResolvedValueOnce('检索式').mockResolvedValueOnce('{"decisions":[]}').mockResolvedValueOnce('大纲').mockResolvedValueOnce('# 标题');
  const deps = createWorkflowDeps({ deepSeek: { complete, listModels: vi.fn() }, ncbi: {}, repositories: {} } as never);
  expect(typeof deps.generateOutline).toBe('function');
  expect(typeof deps.generateReview).toBe('function');
});
```

- [ ] **Step 2: Implement the composition root**

`createWorkflowDeps` must be the only module that knows concrete clients and repositories. It must:

1. Use `NcbiClient.search` plus paged EFetch and `parsePubmedXml`.
2. Persist parsed articles before screening.
3. Use `screenArticles` with the separate `relevance-v1` prompt and Flash resolver.
4. Build the combined summary with `buildEvidenceBundle`.
5. Use `renderOutlinePrompt` and `renderWritingPrompt` unchanged after approved binding replacement.
6. Pass the user's selected model to query, outline, and writing stages.
7. Build a source-number reference map, validate/reorder citations, and call `buildDocxBlob` plus `downloadBlob`.
8. Persist every checkpoint and final artifact through repositories.

Export a separate `generateConfirmedQuery(topic, currentDate, modelId, deepSeek, signal)` function and `countConfirmedQuery(query, ncbi, signal)` so the UI can pause for editing before creating a run.

- [ ] **Step 3: Run the composition test and the complete unit suite**

Run:

```powershell
npm test
npm run lint
```

Expected: all tests pass, and prompt hash tests remain unchanged.

- [ ] **Step 4: Commit composition**

```powershell
git add src/workflow/createWorkflowDeps*
git commit -m "feat: connect review workflow services"
```

### Task 11: Build Settings and Credential Validation

**Files:**
- Create: `src/settings/SettingsView.tsx`
- Create: `src/settings/SettingsView.test.tsx`
- Create: `src/settings/useSettings.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing settings interaction tests**

```tsx
// src/settings/SettingsView.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SettingsView } from './SettingsView';

it('uses password fields, defaults to 300, and persists only after save', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<SettingsView initial={{ deepSeekApiKey: '', ncbiApiKey: '', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'untested', ncbi: 'untested' } }} models={[]} onTestDeepSeek={vi.fn()} onTestNcbi={vi.fn()} onSave={onSave} onClearAll={vi.fn()} />);
  expect(screen.getByLabelText('DeepSeek API Key')).toHaveAttribute('type', 'password');
  expect(screen.getByLabelText('默认抓取量')).toHaveValue(300);
  await user.type(screen.getByLabelText('DeepSeek API Key'), 'secret');
  await user.click(screen.getByRole('button', { name: '保存设置' }));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deepSeekApiKey: 'secret', maxResults: 300 }));
  expect(screen.queryByText('secret')).not.toBeInTheDocument();
});
```

Run: `npm test -- src/settings/SettingsView.test.tsx`

Expected: FAIL because the settings view does not exist.

- [ ] **Step 2: Implement the settings state hook**

`useSettings` must load `AppSettings` from IndexedDB, expose `loading`, `settings`, `models`, `deepSeekStatus`, `ncbiStatus`, `save`, `testDeepSeek`, `testNcbi`, `skipDeepSeekTest`, `skipNcbiTest`, `clearDeepSeekKey`, `clearNcbiKey`, and `clearAll`. Initialize absent settings to empty keys, the first preferred Flash model when available, `maxResults: 300`, and both connection checks as `untested`. Changing or clearing either key resets its check to `untested`. Model fetch occurs only after a DeepSeek key is supplied and must not log the key or response headers.

- [ ] **Step 3: Implement the quiet, work-focused settings view**

Use labeled password inputs with show/hide icon buttons (`Eye`/`EyeOff`), separate “测试连接” and “跳过测试” actions for each provider, a model `<select>`, and a numeric input with `min=10`, `max=300`, `step=10`, default `300`. Disable save when either key is empty, either connection check remains `untested`, or the number is outside range. Show the persistent-storage warning as an alert, and require a native confirmation dialog before `clearAll`.

Use Lucide icons for clear, reveal, and connection state actions. Icon-only buttons must have `aria-label` and `title`; never render API key values as ordinary text.

- [ ] **Step 4: Add settings navigation to the app shell and verify tests**

Change `App` to hold a local view union `'workspace' | 'history' | 'settings'`, render icon buttons for History and Settings in the header, and render `SettingsView` when selected. Do not add a router or server-dependent URL paths.

Run:

```powershell
npm test -- src/settings/SettingsView.test.tsx src/app/App.test.tsx
npm run lint
```

Expected: settings and app shell tests pass.

- [ ] **Step 5: Commit settings**

```powershell
git add src/settings src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add local API settings"
```

### Task 12: Build the Focused Workspace and Run Controller

**Files:**
- Create: `src/workspace/useReviewController.ts`
- Create: `src/workspace/useReviewController.test.tsx`
- Create: `src/workspace/Workspace.tsx`
- Create: `src/workspace/Workspace.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing query-confirmation tests**

```tsx
// src/workspace/Workspace.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Workspace } from './Workspace';

it('requires editing confirmation before starting a 300-result run', async () => {
  const user = userEvent.setup();
  const generateQuery = vi.fn().mockResolvedValue({ query: '(cancer[Title])', count: 286 });
  const startRun = vi.fn();
  render(<Workspace settings={{ deepSeekApiKey: 'd', ncbiApiKey: 'n', modelId: 'deepseek-v4-flash', maxResults: 300, connectionChecks: { deepSeek: 'passed', ncbi: 'passed' } }} controller={{ generateQuery, startRun, cancel: vi.fn(), state: { kind: 'idle' } }} />);
  await user.type(screen.getByLabelText('研究主题'), '癌症研究');
  await user.click(screen.getByRole('button', { name: '生成检索式' }));
  expect(await screen.findByLabelText('PubMed 检索式')).toHaveValue('(cancer[Title])');
  expect(screen.getByText('预计命中 286 篇')).toBeInTheDocument();
  expect(startRun).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '开始生成' }));
  expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ query: '(cancer[Title])', maxResults: 300 }));
});
```

- [ ] **Step 2: Write failing completion and no-preview tests**

Add a test that renders controller state `{ kind: 'completed', stats: { fetched: 286, withAbstract: 231, relevant: 74, selected: 60 } }`, asserts “再次下载” is present, and asserts no article Markdown or editable textbox is rendered. Add a progress-state test that shows the seven named stages and exposes a “取消任务” button.

Run: `npm test -- src/workspace/Workspace.test.tsx`

Expected: FAIL because Workspace does not exist.

- [ ] **Step 3: Implement the controller as the only UI/workflow bridge**

`useReviewController` rejects generation with `connection-required` unless both saved checks are `passed` or `skipped`. It owns one `AbortController`, generates a query through `generateConfirmedQuery`, counts through `countConfirmedQuery`, creates the `ReviewRun` only after user confirmation, invokes `runWorkflow`, subscribes to `WorkflowProgress`, and exposes these discriminated states:

```ts
type ReviewControllerState =
  | { kind: 'idle' }
  | { kind: 'generating-query' }
  | { kind: 'confirming-query'; query: string; count: number }
  | { kind: 'running'; runId: string; progress: WorkflowProgress; stats: RunStats }
  | { kind: 'completed'; runId: string; stats: RunStats }
  | { kind: 'failed'; runId?: string; code: string; message: string }
  | { kind: 'cancelled'; runId: string };
```

On component unmount, abort only active network work; do not delete checkpoints. `retry` reloads the run bundle and resumes from the first missing stage.

- [ ] **Step 4: Implement the focused single-column Workspace**

The idle view contains a multiline topic input, model select, `10–300` numeric input initialized from settings, and “生成检索式”. The confirmation view contains the editable PubMed query, exact hit count, Back action, and “开始生成”. The running view contains one stable progress bar, completed/current/pending stage rows, statistics, and Cancel. The completed view triggers download once from an effect and retains “再次下载”; it must not render final Markdown.

Map workflow error codes to concrete Chinese actions: invalid key -> open settings, no abstracts/relevant articles -> edit query, quota -> open history cleanup, citation failure -> retry writing, offline -> wait for network.

- [ ] **Step 5: Wire Workspace into App and run tests**

Run:

```powershell
npm test -- src/workspace src/app
npm run lint
```

Expected: query confirmation, progress, cancellation, direct download, and no-preview tests pass.

- [ ] **Step 6: Commit workspace**

```powershell
git add src/workspace src/app/App.tsx
git commit -m "feat: add focused review workspace"
```

### Task 13: Build Local History and Re-export Actions

**Files:**
- Create: `src/history/HistoryView.tsx`
- Create: `src/history/HistoryView.test.tsx`
- Create: `src/history/useHistory.ts`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing history action tests**

```tsx
// src/history/HistoryView.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { HistoryView } from './HistoryView';

it('shows run metadata without rendering review body and exposes local actions', async () => {
  const user = userEvent.setup();
  const onDownloadDocx = vi.fn();
  render(<HistoryView runs={[{ id: 'r', topic: '癌症研究', status: 'completed', stage: 'completed', createdAt: 1, updatedAt: 2, stats: { fetched: 300, selected: 60 }, query: 'term', modelId: 'model', maxResults: 300 }]} onResume={vi.fn()} onDownloadDocx={onDownloadDocx} onExportJson={vi.fn()} onExportCsv={vi.fn()} onDelete={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByText('癌症研究')).toBeInTheDocument();
  expect(screen.queryByText(/## 1\./)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '再次下载 Word' }));
  expect(onDownloadDocx).toHaveBeenCalledWith('r');
});
```

- [ ] **Step 2: Implement history data loading and storage estimation**

`useHistory` loads runs ordered by `updatedAt` descending, exposes `refresh`, `resume`, `downloadDocx`, `exportJson`, `exportCsv`, `deleteRun`, and `clearHistory`. `downloadDocx` loads the saved validated artifact and references and rebuilds DOCX; it fails with a visible `history-incomplete` message if final content is absent. Read `navigator.storage.estimate()` when available and expose bytes used/quota without blocking history on unsupported browsers.

- [ ] **Step 3: Implement the history view**

Use an unframed list separated by borders, not nested cards. Each row shows topic, localized status, date, fetched/selected counts, and an overflow menu with icon actions. Completed runs offer Word/JSON/CSV; active or failed runs offer Resume; every row offers Delete. Clear History requires confirmation. Use `Download`, `FileJson`, `FileSpreadsheet`, `RotateCcw`, and `Trash2` Lucide icons with tooltips.

- [ ] **Step 4: Test and commit history**

Run:

```powershell
npm test -- src/history
npm run lint
```

Expected: history display, no-body rendering, re-export, resume, delete, and clear tests pass.

```powershell
git add src/history src/app/App.tsx
git commit -m "feat: add local review history"
```

### Task 14: Finish Responsive Styling, PWA Assets, CSP, and GitHub Pages Deployment

**Files:**
- Create: `src/app/styles.css`
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/pwa-192.png`
- Create: `public/icons/pwa-512.png`
- Create: `public/icons/pwa-maskable-512.png`
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `vite.config.ts`
- Modify: `index.html`
- Modify: `src/main.tsx`

- [ ] **Step 1: Add stable design tokens and responsive layout**

```css
/* opening of src/app/styles.css */
:root {
  font-family: Inter, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  color: #17211f;
  background: #f6f8f7;
  font-synthesis: none;
  letter-spacing: 0;
  --accent: #176b5b;
  --accent-strong: #0f5145;
  --surface: #ffffff;
  --border: #d7dfdc;
  --muted: #65726f;
  --warning: #9a5b00;
  --danger: #b42318;
  --focus: #2e70d1;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button, input, textarea, select { font: inherit; letter-spacing: 0; }
.app-shell { min-height: 100vh; }
.topbar { height: 60px; border-bottom: 1px solid var(--border); background: var(--surface); }
.workspace { width: min(720px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 64px; }
.icon-button { inline-size: 40px; block-size: 40px; display: inline-grid; place-items: center; border-radius: 6px; }
@media (max-width: 640px) {
  .workspace { width: min(100% - 24px, 720px); padding-top: 20px; }
  .form-grid { grid-template-columns: 1fr; }
  .mobile-nav { position: sticky; bottom: 0; min-height: 56px; }
}
```

Add these core rules, then use only these class families in the three views:

```css
.topbar__inner { width: min(960px, calc(100% - 32px)); height: 100%; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
.topbar__actions { display: flex; gap: 4px; }
.form-grid { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; }
.field { display: grid; gap: 6px; min-width: 0; }
.field > span { color: var(--muted); font-size: 14px; }
.input { width: 100%; min-height: 44px; padding: 10px 12px; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
textarea.input { min-height: 112px; resize: vertical; overflow-wrap: anywhere; }
.button { min-height: 42px; padding: 0 16px; border: 1px solid transparent; border-radius: 6px; cursor: pointer; }
.button--primary { color: #fff; background: var(--accent); }
.button--primary:hover { background: var(--accent-strong); }
.button--secondary { color: inherit; background: var(--surface); border-color: var(--border); }
.button:disabled { cursor: not-allowed; opacity: .55; }
.input:focus-visible, .button:focus-visible, .icon-button:focus-visible { outline: 3px solid color-mix(in srgb, var(--focus) 35%, transparent); outline-offset: 2px; }
.progress { height: 8px; overflow: hidden; background: #e5eae8; border-radius: 4px; }
.progress__value { height: 100%; background: var(--accent); transition: width 180ms ease; }
.stage-list { display: grid; gap: 0; border-top: 1px solid var(--border); }
.stage-row { min-height: 48px; display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; border-bottom: 1px solid var(--border); }
.alert { padding: 12px 14px; color: #5c3a00; background: #fff7e6; border-left: 4px solid var(--warning); border-radius: 4px; overflow-wrap: anywhere; }
.alert--error { color: #7a271a; background: #fff1f0; border-left-color: var(--danger); }
.run-list { border-top: 1px solid var(--border); }
.run-row { min-height: 72px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: center; border-bottom: 1px solid var(--border); }
.run-row__title, .run-row__meta { overflow-wrap: anywhere; }
.menu-actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.offline-banner { min-height: 36px; display: flex; align-items: center; justify-content: center; color: #5c3a00; background: #fff7e6; }
@media (max-width: 640px) {
  .topbar__inner { width: min(100% - 24px, 960px); }
  .run-row { grid-template-columns: 1fr; padding: 12px 0; }
  .menu-actions { justify-content: flex-start; }
}
```

Keep every border radius at or below `8px`, use no gradients or decorative blobs, keep fixed icon/control dimensions, and do not scale font sizes with viewport width. The Playwright checks in Task 15 enforce zero horizontal overflow at `320px` and `360px` widths.

- [ ] **Step 2: Generate deterministic bitmap app icons**

```js
// scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/icons', { recursive: true });
const svg = (size, inset = 0) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" rx="88" fill="#176b5b"/><rect x="${116 + inset}" y="${86 + inset}" width="${280 - inset * 2}" height="${340 - inset * 2}" rx="28" fill="#fff"/><path d="M170 180h172M170 238h172M170 296h108" stroke="#176b5b" stroke-width="24" stroke-linecap="round"/><circle cx="338" cy="330" r="58" fill="#f0b429"/><path d="m378 372 48 48" stroke="#17211f" stroke-width="24" stroke-linecap="round"/></svg>`);
await sharp(svg(512)).resize(192, 192).png().toFile('public/icons/pwa-192.png');
await sharp(svg(512)).png().toFile('public/icons/pwa-512.png');
await sharp(svg(512, 28)).png().toFile('public/icons/pwa-maskable-512.png');
```

Run: `node scripts/generate-icons.mjs`

Expected: all three PNGs exist, are non-empty, and report the requested dimensions through `sharp(...).metadata()`.

- [ ] **Step 3: Configure PWA without API runtime caching**

Extend `vite.config.ts` with `VitePWA({ registerType: 'autoUpdate', includeAssets: ['icons/*.png'], manifest: { name: 'PubMed 综述', short_name: 'PubMed综述', start_url: '.', display: 'standalone', background_color: '#f6f8f7', theme_color: '#176b5b', icons: [...] }, workbox: { globPatterns: ['**/*.{js,css,html,png,ico}'], navigateFallback: 'index.html', runtimeCaching: [] } })`.

Compute `base` from `GITHUB_REPOSITORY`: use `/` for a `<owner>.github.io` repository, otherwise `/<repository>/` during GitHub Actions, and `/` locally. In `main.tsx`, register via `virtual:pwa-register` and expose a compact update action only when a new worker is waiting.

- [ ] **Step 4: Add a restrictive static-host-compatible CSP**

Add this `http-equiv` policy to `index.html`, adjusting only Vite development allowances behind a development-only HTML transform if required:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.deepseek.com https://eutils.ncbi.nlm.nih.gov; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'">
```

Do not add analytics, remote fonts, CDN scripts, Feishu domains, or a proxy domain.

- [ ] **Step 5: Add GitHub Pages deployment**

```yaml
# .github/workflows/deploy-pages.yml
name: Deploy GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - uses: actions/configure-pages@v5
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Build, inspect the manifest, and commit**

Run:

```powershell
node scripts/generate-icons.mjs
npm run build
Get-ChildItem dist -Recurse | Select-Object FullName,Length
```

Expected: `dist/manifest.webmanifest`, a generated service worker, the three icons, and hashed JS/CSS assets exist; no output file contains `api_key`, a real key value, `feishu`, or `lark`.

```powershell
git add src/app/styles.css src/main.tsx index.html vite.config.ts scripts/generate-icons.mjs public/icons .github/workflows/deploy-pages.yml
git commit -m "feat: package app for GitHub Pages"
```

### Task 15: Add End-to-End Coverage and Final Documentation

**Files:**
- Create: `tests/e2e/review-flow.spec.ts`
- Create: `tests/e2e/offline-history.spec.ts`
- Create: `scripts/scan-workflow-secrets.mjs`
- Create: `README.md`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Configure Playwright against the production preview**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run build && npm run preview -- --host 127.0.0.1', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
```

- [ ] **Step 2: Add deterministic API routes and the complete download flow**

```ts
// core scenario in tests/e2e/review-flow.spec.ts
import { expect, test } from '@playwright/test';

test('confirms the query, screens articles, and downloads Word', async ({ page }) => {
  await page.route('https://api.deepseek.com/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'deepseek-v4-flash', context_length: 64000 }, { id: 'deepseek-v4-pro', context_length: 128000 }] } });
    const request = JSON.parse(route.request().postData() ?? '{}');
    const prompt = String(request.messages?.at(-1)?.content ?? '');
    if (prompt.includes('pubmed_search_instruction')) return route.fulfill({ json: { choices: [{ message: { content: '(cancer[Title])' } }] } });
    if (prompt.includes('医学文献初筛助手')) {
      const jsonStart = prompt.lastIndexOf('[{"sourceId"');
      const articles = JSON.parse(prompt.slice(jsonStart));
      const decisions = articles.map(({ sourceId }: { sourceId: string }) => ({ sourceId, score: 3, include: true, reason: '直接相关' }));
      return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ decisions }) } }] } });
    }
    if (prompt.includes('医学文献结构化提炼与规划师')) return route.fulfill({ json: { choices: [{ message: { content: '引言 (建议约500字)\n结论 (建议约300字)' } }] } });
    return route.fulfill({ json: { choices: [{ message: { content: '# 癌症研究综述\n\n## 1. 引言\n\n正文[1]。\n\n## 2. 结论\n\n结论[1]。' } }] } });
  });
  await page.route('https://eutils.ncbi.nlm.nih.gov/**', async (route) => {
    if (route.request().url().includes('efetch')) return route.fulfill({ path: 'tests/fixtures/pubmed-sample.xml', contentType: 'application/xml' });
    return route.fulfill({ json: { esearchresult: { count: '1', idlist: ['123'], webenv: 'env', querykey: '1' } } });
  });

  await page.goto('/');
  await page.getByTitle('设置').click();
  await page.getByLabel('DeepSeek API Key').fill('test-deepseek');
  await page.getByLabel('My NCBI API Key').fill('test-ncbi');
  await page.getByRole('button', { name: '测试 DeepSeek 连接' }).click();
  await page.getByRole('button', { name: '测试 NCBI 连接' }).click();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.getByTitle('工作台').click();
  await page.getByLabel('研究主题').fill('癌症研究');
  await page.getByRole('button', { name: '生成检索式' }).click();
  await expect(page.getByLabel('PubMed 检索式')).toHaveValue('(cancer[Title])');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '开始生成' }).click();
  expect((await download).suggestedFilename()).toMatch(/癌症研究综述.*\.docx$/);
  await expect(page.getByRole('button', { name: '再次下载' })).toBeVisible();
  await expect(page.getByText('正文[1]。')).toHaveCount(0);
});
```

- [ ] **Step 3: Add offline-history and privacy assertions**

Create one completed run online, reload with `context.setOffline(true)`, and assert the history list and “再次下载 Word” remain usable while “生成检索式” is disabled. Inspect Cache Storage from the page and assert no request URL contains `api.deepseek.com` or `eutils.ncbi.nlm.nih.gov`. Export JSON and assert neither test key is present in the download body.

- [ ] **Step 4: Add viewport and overlap checks**

For desktop `1440x900` and mobile `360x800`, capture `workspace-desktop.png` and `workspace-mobile.png` under `test-results/visual/`. Assert the main form, top bar, progress rows, and mobile navigation bounding boxes stay within the viewport and do not intersect. Assert `document.documentElement.scrollWidth === document.documentElement.clientWidth` at both sizes.

- [ ] **Step 5: Add a scanner that compares the public tree to sensitive workflow values without printing them**

```js
// scripts/scan-workflow-secrets.mjs
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const workflowPath = process.env.PUBMED_N8N_WORKFLOW;
if (!workflowPath) throw new Error('PUBMED_N8N_WORKFLOW is required');
const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
const sensitiveName = /^(api_key|encryptKey|verificationToken|webhookId|folder_token)$/i;
const secrets = new Set();

function addStringLeaves(node) {
  if (typeof node === 'string' && node.length >= 8) secrets.add(node);
  else if (Array.isArray(node)) node.forEach(addStringLeaves);
  else if (node && typeof node === 'object') Object.values(node).forEach(addStringLeaves);
}

function collect(node) {
  if (Array.isArray(node)) return node.forEach(collect);
  if (!node || typeof node !== 'object') return;
  if (typeof node.name === 'string' && sensitiveName.test(node.name)) addStringLeaves(node.value);
  for (const [key, value] of Object.entries(node)) {
    if (sensitiveName.test(key)) addStringLeaves(value);
    else collect(value);
  }
}
collect(workflow);

async function walk(directory) {
  const files = [];
  try {
    for (const entry of await readdir(directory)) {
      const candidate = path.join(directory, entry);
      (await stat(candidate)).isDirectory() ? files.push(...await walk(candidate)) : files.push(candidate);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return files;
}

const tracked = execFileSync('git', ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
const files = [...new Set([...tracked, ...await walk('dist')])];
const hits = [];
for (const file of files) {
  const content = await readFile(file);
  if ([...secrets].some((secret) => content.includes(Buffer.from(secret)))) hits.push(file);
}
if (hits.length) {
  console.error(`Sensitive workflow values found in: ${hits.join(', ')}`);
  process.exit(1);
}
console.log(`Secret scan passed for ${files.length} files.`);
```

- [ ] **Step 6: Write operational documentation**

`README.md` must include:

1. Product scope and explicit “no backend / no Feishu” statement.
2. Node.js 22 prerequisite and `npm ci`, `npm run dev`, `npm test`, `npm run e2e`, `npm run build` commands.
3. GitHub Pages enablement through GitHub Actions.
4. User instructions for My NCBI API Key and DeepSeek API Key without screenshots of real keys.
5. Local-key persistence warning and clear-data instructions.
6. Offline capabilities and the provider-CORS dependency.
7. Prompt provenance and the rule that the complete n8n JSON must never be committed.
8. A release checklist requiring rotation of the credentials exposed in the original n8n export.

- [ ] **Step 7: Run the complete verification matrix**

Run:

```powershell
npm test
npm run lint
npm run build
npx playwright install chromium
npm run e2e
git diff --check
$env:PUBMED_N8N_WORKFLOW='D:\BaiduSyncdisk\n8n\PubMed summary.json'
node scripts/scan-workflow-secrets.mjs
Remove-Item Env:\PUBMED_N8N_WORKFLOW
$matches = rg -n "feishu|lark" src public scripts .github dist
if ($LASTEXITCODE -eq 0) { $matches; throw 'Feishu runtime reference found' }
if ($LASTEXITCODE -ne 1) { throw 'Feishu scan failed to run' }
Write-Output 'FEISHU_SCAN_CLEAN'
```

Expected: unit/integration tests pass, TypeScript passes, production build succeeds, both Playwright projects pass, `git diff --check` prints nothing, the workflow-value scanner passes without printing any value, and the Feishu scan finds no application source or build artifact matches.

- [ ] **Step 8: Perform a manual local smoke test with user-entered keys**

Run `npm run dev -- --host 127.0.0.1`, open the printed URL, enter disposable/rotated keys through the UI, run a narrow one-article query, verify CORS succeeds, verify the DOCX opens in Word/LibreOffice, then use “清除全部本地数据”. Do not record Playwright traces, screenshots, HAR files, console output, or shell history containing the keys.

- [ ] **Step 9: Commit end-to-end coverage and docs**

```powershell
git add tests scripts/scan-workflow-secrets.mjs playwright.config.ts README.md
git commit -m "test: verify offline PubMed review workflow"
```

## Final Acceptance Checklist

- [ ] GitHub Pages serves the production build without a backend or server route.
- [ ] The application never imports, calls, or documents a Feishu runtime integration.
- [ ] Both API keys persist only in IndexedDB and can be cleared independently or together.
- [ ] The default maximum fetch count is `300`, with a valid range of `10–300`.
- [ ] Query generation pauses for user editing and confirmation.
- [ ] Missing abstracts and low-relevance articles are excluded before the original outline/write stages.
- [ ] Context selection has no fixed article cap and never truncates an abstract.
- [ ] Original prompt SHA-256 tests match all three approved values.
- [ ] Invalid or unknown citations block DOCX export.
- [ ] DOCX contains only title, review body, and actually cited references.
- [ ] Completed runs can re-export DOCX, JSON, and CSV offline.
- [ ] Desktop and mobile layouts have no overflow, overlap, or inaccessible controls.
- [ ] Static assets are cached, while NCBI/DeepSeek requests and responses are not.
- [ ] Public source, Git history, build output, tests, and logs contain no real credentials.
