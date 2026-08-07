# One-Click Generation and Parallel Screening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click review mode and a browser-side relevance scheduler that runs at most five screening requests concurrently with a one-second launch interval while preserving the existing n8n stage order and local resume behavior.

**Architecture:** Keep query generation, PubMed retrieval, outline generation, writing, citation validation, and DOCX export in their existing dependency-injected workflow. Extend run metadata with optional mode/count/concurrency fields, and replace the serial relevance loop with a bounded scheduler that persists each completed batch before reporting progress. Completed batch metadata is stored as checkpoint payloads alongside the existing full screening checkpoint, so refresh/resume only re-runs incomplete batches.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright, Dexie/IndexedDB, existing DeepSeek and NCBI clients.

---

### Task 1: Extend run metadata and workflow progress contracts

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/workspace/useReviewController.ts`
- Modify: `src/workflow/runWorkflow.ts`
- Test: `src/history/useHistory.test.ts`
- Test: `src/workspace/useReviewController.test.tsx`

- [ ] **Step 1: Write failing type/behavior tests**

Add a `ReviewMode` union test fixture and assert that a run created by `startRun` preserves `mode`, `queryCount`, and `screeningConcurrency` while an old run without those fields still normalizes as confirm-query with no fabricated count.

```ts
expect(run).toMatchObject({ mode: 'one-click', queryCount: 286, screeningConcurrency: 5 });
expect(normalizeCompletedRunStats({ ...legacyRun, mode: undefined }, 2).mode).toBe('confirm-query');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- src/workspace/useReviewController.test.tsx src/history/useHistory.test.ts`

Expected: FAIL because `ReviewRun` and `StartRunInput` do not yet expose the new metadata.

- [ ] **Step 3: Add optional backward-compatible fields and input propagation**

In `src/domain/models.ts`, add:

```ts
export type ReviewMode = 'confirm-query' | 'one-click';

// inside ReviewRun
mode?: ReviewMode;
queryCount?: number;
screeningConcurrency?: 5;
```

In `StartRunInput`, add `mode?: ReviewMode`, `queryCount?: number`, and write `mode: mode ?? 'confirm-query'`, `queryCount`, and `screeningConcurrency: 5` only for new one-click/parallel runs. Pass stored metadata from `retry`/resume without inventing values for legacy runs.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npm test -- src/workspace/useReviewController.test.tsx src/history/useHistory.test.ts && npm run lint`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/models.ts src/workspace/useReviewController.ts src/workflow/runWorkflow.ts src/history/useHistory.test.ts src/workspace/useReviewController.test.tsx
git commit -m "feat: record review mode and screening metadata"
```

### Task 2: Add the workspace mode segmented control and one-click handoff

**Files:**
- Modify: `src/workspace/Workspace.tsx`
- Modify: `src/workspace/Workspace.test.tsx`
- Modify: `src/workspace/useReviewController.ts`

- [ ] **Step 1: Write failing component tests**

Cover both modes: confirm-query still renders the editable query and waits for `开始生成`; one-click renders the selected mode, calls `generateQuery`, then immediately calls `startRun` with the generated query, count, `mode: 'one-click'`, and `maxResults: 300`.

```ts
await user.click(screen.getByRole('radio', { name: '一键生成' }));
await user.click(screen.getByRole('button', { name: '一键生成综述' }));
expect(startRun).toHaveBeenCalledWith(expect.objectContaining({ mode: 'one-click', queryCount: 286, maxResults: 300 }));
expect(screen.queryByLabelText('PubMed 检索式')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the component tests and verify RED**

Run: `npm test -- src/workspace/Workspace.test.tsx`

Expected: FAIL because there is no mode control or one-click action.

- [ ] **Step 3: Implement the mode control and automatic handoff**

Use a stable `mode` state (`'confirm-query'` by default) and a labeled radio/segmented control. Keep topic, model, and max-results fields unchanged. In one-click mode, await `controller.generateQuery`, then call `controller.startRun({ topic, query: result.query, queryCount: result.count, mode, modelId, maxResults })`; in confirm mode retain the current confirmation screen and call with `mode: 'confirm-query'`.

- [ ] **Step 4: Update progress text for parallel screening**

When `progress.stage === 'screening'`, render the scheduler message supplied by the controller and ensure it includes `并行最多 5 路` and `启动间隔 1 秒`; keep the cancel button available in every active stage.

- [ ] **Step 5: Run component tests and lint**

Run: `npm test -- src/workspace/Workspace.test.tsx && npm run lint`

Expected: PASS with no layout/type regressions.

- [ ] **Step 6: Commit**

```bash
git add src/workspace/Workspace.tsx src/workspace/Workspace.test.tsx src/workspace/useReviewController.ts
git commit -m "feat: add one-click review mode"
```

### Task 3: Extract and test a single screening batch operation

**Files:**
- Modify: `src/workflow/relevance.ts`
- Modify: `src/workflow/relevance.test.ts`

- [ ] **Step 1: Write failing batch-operation tests**

Test that one batch sends the existing relevance prompt, validates every source ID, retries one malformed response, returns decisions in source order, and propagates abort/errors.

```ts
const result = await screenArticleBatch('主题', batch, client, 'deepseek-v4-flash', signal);
expect(result.map((item) => item.articleId)).toEqual(batch.map((item) => item.id));
expect(client.complete).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Run focused relevance tests and verify RED**

Run: `npm test -- src/workflow/relevance.test.ts`

Expected: FAIL because `screenArticleBatch` is not exported.

- [ ] **Step 3: Extract the minimal reusable function**

Move the existing request, JSON validation, format retry, and `ScreeningDecision` mapping into:

```ts
export async function screenArticleBatch(
  topic: string,
  batch: Article[],
  client: Pick<DeepSeekClient, 'complete'>,
  model: string,
  signal: AbortSignal,
): Promise<ScreeningDecision[]>;
```

Keep `batchArticlesForScreening` unchanged at a maximum of 20 articles and retain `screenArticles` as a compatibility wrapper that calls the scheduler introduced in Task 4.

- [ ] **Step 4: Run relevance tests and lint**

Run: `npm test -- src/workflow/relevance.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workflow/relevance.ts src/workflow/relevance.test.ts
git commit -m "refactor: extract screening batch operation"
```

### Task 4: Implement the bounded five-worker, one-second staggered scheduler

**Files:**
- Modify: `src/workflow/relevance.ts`
- Modify: `src/workflow/relevance.test.ts`

- [ ] **Step 1: Write scheduler RED tests**

Add deterministic fake-timer tests for: maximum five in-flight calls, 1000 ms minimum between launches, fifteen batches all completing, completion-order-independent source ordering, stopping new launches after a terminal batch failure, and aborting all in-flight work.

```ts
const decisions = await screenArticlesParallel(topic, articles, client, model, signal, {
  concurrency: 5,
  launchIntervalMs: 1000,
  onBatchComplete: onComplete,
});
expect(maxInFlight).toBe(5);
expect(launchTimes.slice(1).every((time, i) => time - launchTimes[i] >= 1000)).toBe(true);
expect(decisions.map((d) => d.articleId)).toEqual(sourceOrderIds);
```

- [ ] **Step 2: Run the scheduler tests and verify RED**

Run: `npm test -- src/workflow/relevance.test.ts`

Expected: FAIL because the scheduler is not implemented.

- [ ] **Step 3: Implement `screenArticlesParallel` with bounded workers**

Add:

```ts
export interface ScreeningSchedulerOptions {
  concurrency: 5;
  launchIntervalMs: 1000;
  signal: AbortSignal;
  onBatchComplete?: (batchIndex: number, decisions: ScreeningDecision[]) => Promise<void> | void;
  completedBatchIndexes?: Set<number>;
}
```

Partition once, skip only indexes in `completedBatchIndexes`, and coordinate at most five async workers. Before each launch, await the required interval from the previous launch. On each success, store results by batch index and await `onBatchComplete`; on the first non-abort terminal error, stop assigning new work, let active requests settle, then throw the original error. On abort, reject with the cancellation/AbortError and never report an incomplete batch. Return all collected decisions sorted by each article's `sourceOrder`.

- [ ] **Step 4: Keep the compatibility wrapper behavior**

Make `screenArticles(...)` call `screenArticlesParallel(...)` with `{ concurrency: 5, launchIntervalMs: 1000, signal, onBatchComplete: (_index, decisions) => onBatch?.(decisions) }`, preserving its existing public signature for current workflow callers.

- [ ] **Step 5: Run scheduler tests and typecheck**

Run: `npm test -- src/workflow/relevance.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workflow/relevance.ts src/workflow/relevance.test.ts
git commit -m "feat: parallelize relevance screening with bounded scheduler"
```

### Task 5: Persist per-batch checkpoints and resume only incomplete batches

**Files:**
- Modify: `src/workflow/createWorkflowDeps.ts`
- Modify: `src/workflow/runWorkflow.ts`
- Modify: `src/storage/repositories.ts`
- Modify: `src/workflow/runWorkflow.test.ts`
- Modify: `src/workflow/createWorkflowDeps.test.ts`

- [ ] **Step 1: Write failing checkpoint/resume tests**

Verify that each completed batch is saved before progress advances, the full screening checkpoint is written only after all batches finish, and a resumed run passes valid completed batch indexes/results to the scheduler while malformed or duplicate checkpoint payloads are ignored and re-fetched.

```ts
expect(saveCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ stage: 'screening', payload: expect.objectContaining({ batchIndex: 0 }) }));
expect(screenArticlesParallel).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ completedBatchIndexes: new Set([0]) }));
```

- [ ] **Step 2: Run workflow tests and verify RED**

Run: `npm test -- src/workflow/runWorkflow.test.ts src/workflow/createWorkflowDeps.test.ts`

Expected: FAIL because the current dependency contract only stores a final screening array.

- [ ] **Step 3: Add checkpoint payload helpers without changing the Dexie schema**

Use the existing `Checkpoint` table. Define a validated payload shape in `createWorkflowDeps.ts`/`runWorkflow.ts`:

```ts
interface ScreeningBatchCheckpoint {
  runId: string;
  batchIndex: number;
  totalBatches: number;
  articleIds: string[];
  decisions: ScreeningDecision[];
  completedAt: number;
}
```

Expose a repository-backed callback that writes one checkpoint ID per batch (`${runId}:screening-batch:${batchIndex}`), then writes the existing `screening` checkpoint after merge. Validate run ID, batch index, total, exact article IDs, decision IDs, and duplicate indexes before reuse.

- [ ] **Step 4: Feed scheduler metadata and deterministic progress into the workflow**

Pass `screeningConcurrency: 5` from `WorkflowInput`/run metadata, compute total batches once, include `并行最多 5 路，启动间隔 1 秒` in each screening progress message, and update `processed`/`included` from the completed batch callback. Keep the later outline, writing, citation, and export stages serial.

- [ ] **Step 5: Run workflow tests and lint**

Run: `npm test -- src/workflow/runWorkflow.test.ts src/workflow/createWorkflowDeps.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workflow/createWorkflowDeps.ts src/workflow/runWorkflow.ts src/storage/repositories.ts src/workflow/runWorkflow.test.ts src/workflow/createWorkflowDeps.test.ts
git commit -m "feat: checkpoint completed screening batches"
```

### Task 6: Wire controller metadata, cancellation, and history resume

**Files:**
- Modify: `src/workspace/useReviewController.ts`
- Modify: `src/history/useHistory.ts`
- Modify: `src/workspace/useReviewController.test.tsx`
- Modify: `src/history/useHistory.test.ts`

- [ ] **Step 1: Write failing controller tests**

Assert one-click query generation automatically starts exactly one run, cancellation changes the run to `cancelled` and aborts all request slots, a terminal batch failure marks the run `failed` while preserving completed decisions, and retry uses saved query/mode metadata.

- [ ] **Step 2: Run focused controller/history tests and verify RED**

Run: `npm test -- src/workspace/useReviewController.test.tsx src/history/useHistory.test.ts`

Expected: FAIL on the new mode, cancellation, and resume assertions.

- [ ] **Step 3: Implement controller handoff and metadata persistence**

Extend `generateQuery` to accept the selected mode through the caller, and in one-click mode invoke `startRun` only after both query and NCBI count resolve. Set `ReviewRun.mode`, `queryCount`, and `screeningConcurrency: 5` before saving. Reuse one `AbortController` for every stage and map `AbortError`/`cancellation` to `cancelled` without overwriting completed checkpoints.

- [ ] **Step 4: Preserve history compatibility**

When loading legacy runs, default only `mode` to `'confirm-query'`; leave missing `queryCount` and `screeningConcurrency` absent. `retry` passes saved fields when present and otherwise keeps the legacy serial-compatible wrapper defaults. Keep API keys out of run/checkpoint/artifact payloads.

- [ ] **Step 5: Run focused tests and lint**

Run: `npm test -- src/workspace/useReviewController.test.tsx src/history/useHistory.test.ts && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workspace/useReviewController.ts src/history/useHistory.ts src/workspace/useReviewController.test.tsx src/history/useHistory.test.ts
git commit -m "feat: preserve one-click cancellation and resume metadata"
```

### Task 7: Add integration and end-to-end coverage for one-click and staggered parallelism

**Files:**
- Modify: `tests/e2e/helpers.ts`
- Modify: `tests/e2e/review-flow.spec.ts`
- Modify: `src/workflow/createWorkflowDeps.test.ts`

- [ ] **Step 1: Add a one-click E2E scenario**

Extend the API mock to emit fifteen 20-article batches, record request start times/in-flight count, and return responses out of order. Drive the segmented control, click `一键生成综述`, wait for the automatic download, and assert the progress text contains `并行最多 5 路` and `启动间隔 1 秒`.

- [ ] **Step 2: Add E2E assertions for scheduler guarantees**

After the run, assert the mock observed `maxInFlight <= 5`, every adjacent launch gap is at least 1000 ms, all 300 source IDs were merged in PubMed order, and exactly one DOCX download occurred.

- [ ] **Step 3: Add refresh/resume integration coverage**

Pause after several completed batches, reload the page, resume the active history item, and assert completed batch IDs receive no second API request while the remaining batches complete and the final DOCX downloads.

- [ ] **Step 4: Run the complete validation suite**

Run: `npm test && npm run lint && npm run build && npm run e2e && git diff --check`

Expected: all Vitest tests pass, TypeScript/build succeed, desktop and mobile Playwright projects pass, and `git diff --check` prints no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/helpers.ts tests/e2e/review-flow.spec.ts src/workflow/createWorkflowDeps.test.ts
git commit -m "test: cover one-click parallel review flow"
```

---

## Self-review

- Spec coverage: mode selection and automatic handoff are covered by Tasks 1-2; five-way/one-second scheduling, ordering, retry, cancellation, and failure are covered by Tasks 3-4; local checkpoints and refresh resume are covered by Task 5; controller/history compatibility is covered by Task 6; UI and API behavior are covered by Task 7.
- Placeholder scan: no TBD/TODO steps are used; every implementation task names concrete files, interfaces, tests, and commands.
- Type consistency: `ReviewMode`, `StartRunInput`, `ScreeningSchedulerOptions`, `ScreeningBatchCheckpoint`, `screenArticleBatch`, and `screenArticlesParallel` are defined before later tasks consume them.
- Scope: no backend, worker, prompt-text, Feishu, or export-preview changes are included.
