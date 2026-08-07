# 一键生成与并行相关性筛选设计规格

日期：2026-08-07

## 1. 目标

在现有纯前端 PubMed 综述 PWA 中增加两个能力：

1. 工作台提供“一键生成”模式，自动完成检索式生成、PubMed 查询、相关性筛选、综述生成、引用校验和 Word 导出。
2. 相关性筛选阶段使用浏览器端可取消的异步并发调度，固定最多 5 个在途请求，并以 1 秒间隔错峰启动批次，减少 300 篇文献的等待时间，同时保留限流、取消、重试和本地恢复能力。

## 2. 已确认的产品决策

- 保留现有“确认检索式”模式，默认仍要求用户查看和编辑 DeepSeek 生成的 PubMed 检索式。
- 新增“一键生成”模式；该模式跳过检索式确认页面，但仍保存最终检索式和命中数。
- 两种模式复用同一检索式提示词、`generateQuery()`、`startRun()` 和 `runWorkflow()`，不复制工作流逻辑。
- 相关性筛选固定最多 5 路在途请求，不增加用户配置项；相邻批次的启动间隔为 1 秒。
- 每个筛选批次仍最多 20 篇文章，并沿用现有 token 上限和格式校验。
- 并行只发生在相关性筛选阶段；抓取、上下文预算、大纲、正文、引用校验和 Word 导出保持现有顺序。
- “协程”采用浏览器端 `async/await + Promise` 调度。网络请求等待时，其他工作槽继续运行；不引入后端队列、SharedWorker 或 Web Worker 作为本功能前提。
- 批次结果按 PubMed 原始 `sourceOrder` 合并，完成先后顺序不影响上下文选择、引用编号或 Word 内容。
- 某批次超过现有限制的重试次数后，停止派发新的批次，等待在途请求结束并以真实错误结束任务；已完成批次仍保存在本地。

## 3. 用户界面

工作台在研究主题输入区增加一个二选一的 segmented control：

- `确认检索式`
- `一键生成`

控件使用稳定的 `mode` 状态，不改变主题、模型和最大抓取量字段。按钮文案随模式变化：

- 确认检索式：`生成检索式`
- 一键生成：`一键生成综述`

确认检索式模式的流程保持现状：

`生成检索式 -> 编辑/确认检索式 -> 开始生成`

一键生成模式的流程为：

`生成检索式 -> 立即开始任务`

页面进入运行状态后，筛选阶段的实时消息显示：

`正在筛选相关文献（第 N/总批次批，并行最多 5 路，启动间隔 1 秒；已处理 X/Y，相关 Z 篇）`

五路并发上限和 1 秒启动间隔不是用户可编辑设置，避免不同设备产生不可预测的限流行为。取消按钮在多个工作槽有请求时都必须中止对应 `fetch`，并保持当前任务的 cancelled 状态。

## 4. 状态与数据模型

### 4.1 ReviewRun 元数据

在不破坏旧历史的前提下扩展 `ReviewRun`：

```ts
type ReviewMode = 'confirm-query' | 'one-click';

interface ReviewRun {
  // existing fields...
  mode?: ReviewMode;
  queryCount?: number;
  screeningConcurrency?: 5;
}
```

新任务写入：

- `mode`：用户选中的模式。
- `query`：最终实际运行的检索式。
- `queryCount`：生成检索式后 NCBI 返回的预计命中数。
- `screeningConcurrency`：固定写入 `5`，用于历史可解释性和未来兼容。

旧任务缺少这些字段时按以下方式展示：

- `mode` 显示为 `confirm-query`，不改变原任务执行行为。
- `screeningConcurrency` 显示为空，不回填虚假的运行配置。
- `queryCount` 缺失时不显示命中数。

### 4.2 Screening checkpoint

保留现有 `screening` 阶段 checkpoint 作为完整筛选结果。并行期间每个批次单独保存到已有的 `ScreeningDecision` 表，并可保存轻量批次进度元数据：

```ts
interface ScreeningBatchCheckpoint {
  runId: string;
  batchIndex: number;
  totalBatches: number;
  articleIds: string[];
  completedAt: number;
}
```

如果现有 schema 不能安全增加表，则批次元数据作为 `Checkpoint` 的 payload 保存，不能覆盖完整 `screening` checkpoint。恢复时只有拥有完整 ID 集合的批次才算完成；缺失、重复或格式错误的批次必须重新请求。

## 5. 并发调度设计

### 5.1 工作槽

新增一个纯函数/异步函数负责筛选调度，接口保持依赖注入，便于测试：

```ts
interface ScreeningSchedulerOptions {
  concurrency: 5;
  launchIntervalMs: 1000;
  signal: AbortSignal;
  onBatchComplete?(batchIndex: number, decisions: ScreeningDecision[]): Promise<void> | void;
  completedBatchIndexes?: Set<number>;
}
```

调度器将 `batchArticlesForScreening(articles)` 产生的批次放入索引队列，启动最多 5 个异步 worker。调度器在每次启动新批次前等待距离上一次启动至少 1 秒；如果已有 5 个请求在途，则等待任一请求完成后再继续。每个 worker 的行为是：

1. 检查 `signal.aborted` 和停止派发标记。
2. 领取下一个未完成批次。
3. 调用现有单批筛选逻辑，包括 JSON 校验和一次格式重试。
4. 先保存该批次决定，再更新进度和 checkpoint。
5. 领取下一批，直到队列为空或出现不可恢复错误。

Promise 的完成顺序只影响进度事件顺序，不影响最终结果。调度器等待所有已在途 worker 收尾后再返回或抛出首个真实错误。

### 5.2 限流与资源边界

- 并发上限恒为 5，不能被单次任务输入覆盖。
- 批次启动间隔恒为 1000ms，不能被单次任务输入覆盖。
- 每个 worker 复用同一个 DeepSeek client 和同一个 `AbortSignal`。
- 现有 client 层的 429/5xx 重试保持不变；并发调度器不额外添加指数退避，避免两层重试叠加导致不可预测等待。
- 不使用 `Promise.all` 一次性提交全部批次；必须使用有限 worker 池和启动间隔，避免同时创建 15 个请求和大量 prompt 字符串。
- XML 解析和 IndexedDB 写入仍在主线程异步阶段执行；若后续真实 profiling 发现 300 篇解析造成明显卡顿，再单独评估 Web Worker，不作为本需求范围。

## 6. 一键模式数据流

工作台调用控制器的统一入口：

```ts
generateQuery({ topic, modelId })
  -> { query, count }
  -> mode === 'one-click'
       ? startRun({ topic, query, queryCount: count, mode, modelId, maxResults })
       : showConfirmation({ query, count })
```

`startRun()` 接受可选的 `mode` 和 `queryCount`，恢复历史任务时从 `ReviewRun` 读取已有值。对于一键模式，检索式生成和命中数查询成功但正式任务保存失败时，页面显示任务创建失败，不重复自动提交。

## 7. 恢复与错误处理

- 任务取消：所有在途 `fetch` 接收同一个 abort signal；已保存批次保持在 IndexedDB，任务状态为 cancelled。
- 页面刷新：历史恢复只复用完整且 ID 集合匹配的筛选批次，未完成批次按原顺序重新进入最多 5 路 worker，并继续遵守 1 秒启动间隔。
- 网络中断或 429：沿用 DeepSeek client 的有限重试。单批最终失败时不把该批标记为完成。
- 任一批次失败：停止领取新批次，等待其他已在途批次写完或取消，任务进入 failed；历史中保留已完成筛选决定和失败摘要。
- 无相关文献：保持现有 `no-relevant-articles` 终止，不执行大纲和正文调用。
- 并发批次全部完成后，按 `sourceOrder` 排序决定，写入完整筛选 checkpoint，随后进入原有上下文预算阶段。

## 8. 兼容性

- 旧 `ReviewRun`、旧 `ScreeningDecision` 和旧 `Checkpoint` 无需删除或重建。
- 新字段全部可选，IndexedDB schema 仅在确实新增批次表时增加版本迁移；优先复用已有表，避免无必要的 schema 变更。
- 历史重新下载行为不变，仍由保存的最终 Markdown 和 references 生成 DOCX。
- API Key 不进入模式字段、进度消息、checkpoint payload 或导出文件。

## 9. 验收测试

### 单元测试

- 一键模式在生成检索式并拿到命中数后，直接调用 `startRun()`，不显示确认页。
- 确认模式仍显示检索式确认页，点击开始后才调用 `startRun()`。
- scheduler 最多同时执行 5 个 batch 请求，相邻启动间隔为 1 秒，15 批输入最终全部完成。
- 批次完成顺序乱序时，返回决定按 `sourceOrder` 排序。
- 某批失败时不再派发新批次，已在途批次正确收尾并抛出错误。
- abort signal 会取消全部工作槽，且不会把未完成批次写入完整 checkpoint。
- 已完成批次集合被传入恢复调度器时，只请求未完成批次。
- 旧历史缺少新元数据时仍能读取和重新导出。

### 集成与端到端测试

- 模拟 DeepSeek/NCBI 完成一键模式，验证自动下载 DOCX。
- 记录并断言并行筛选阶段进度包含 `并行最多 5 路`、`启动间隔 1 秒`、批次序号和已处理统计。
- 运行中刷新后，历史可以继续未完成批次，不重复调用已完成批次。
- 桌面和 360px 手机视口下模式切换、运行进度和取消按钮无溢出或遮挡。
- 离线时一键生成按钮禁用；已完成历史仍可重新导出。

## 10. 非目标

- 不允许用户自定义并发数。
- 不把大纲、正文或 Word 导出并行化。
- 不增加后端任务队列、服务端代理、云同步或飞书集成。
- 不修改原 n8n 的搜索、大纲和写作提示词正文。
