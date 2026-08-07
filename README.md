# PubMed 综述 PWA

这是一个纯前端、无后端服务的 PubMed 检索与中文医学综述生成工具。应用部署在 GitHub Pages，浏览器直接调用 NCBI E-utilities 和 DeepSeek API；不接入飞书，也不使用代理、Webhook、远程数据库或分析脚本。

## 本地开发

需要 Node.js 22。

```bash
npm ci
npm run dev
npm test
npm run e2e
npm run build
```

生产构建位于 `dist/`。推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会运行测试、构建并发布 GitHub Pages；仓库的 Pages Source 应选择 GitHub Actions。

## 使用方法

1. 在“设置”中填写自己的 DeepSeek API Key 和 My NCBI API Key。
2. 分别测试连接，或明确选择跳过测试，然后保存。
3. 在工作台输入研究主题。默认最多抓取 300 篇，可调整为 10–300。
4. AI 生成 PubMed 检索式后，先检查和编辑，再开始生成。
5. 完成后浏览器直接下载 DOCX。文档只含标题、综述正文和正文实际引用的参考文献。
6. 历史记录可在本机重新导出 Word、JSON 和 CSV。

DeepSeek 模型从 `/models` 动态读取，优先显示 Flash 和 Pro；上下文能力优先采用 API 返回值，缺失时按当前 1,000,000 token 能力回退。相关性筛选在原 n8n 大纲与写作步骤之前运行。

## 本地数据与离线

API Key、历史、摘要、筛选结果和最终内容保存在当前浏览器的 IndexedDB。它们不是安全保险库：共用设备、浏览器扩展或本机恶意软件可能访问这些数据。设置页可分别清除两把 Key，也可清除全部本地数据。

PWA 只缓存静态应用资源。离线时可查看历史并重新导出，不能发起新的 PubMed 或 DeepSeek 请求。线上请求是否可用还取决于服务提供方保持浏览器 CORS 支持。

## 提示词来源与安全

`src/prompts/original/` 的三组提示词从本地 n8n 导出中定向提取，并由固定 SHA-256 测试锁定。完整的 n8n JSON 含敏感凭据，禁止复制或提交到仓库。提取脚本只读取三个指定节点的 `parameters.text`。

发布前必须：

- 轮换原 n8n 导出中已经暴露的 NCBI 与飞书凭据。
- 运行 `npm test`、`npm run build` 和 `npm run e2e`。
- 设置 `PUBMED_N8N_WORKFLOW` 后运行 `node scripts/scan-workflow-secrets.mjs`。
- 确认源码、Git 历史、构建产物、测试报告和日志均不含真实凭据。
