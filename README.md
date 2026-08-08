# PubMed 综述 PWA

纯前端、无后端的 PubMed 中文医学综述生成工具。用户在浏览器中使用自己的 DeepSeek API Key 和 My NCBI API Key，输入研究主题后完成 PubMed 检索、相关性筛选、综述生成，并导出可编辑的 Word 文档。API Key、历史记录和中间数据只保存在当前浏览器中，不会上传到本项目服务器。

## 网页

[打开 PubMed 综述](https://zhang-bin-98.github.io/pubmed-summary-pwa/)

## 使用方法

1. 打开“设置”，填写 DeepSeek API Key 和 My NCBI API Key，完成连接测试或跳过测试后保存。模型列表会从 DeepSeek API 自动获取。
2. 回到“工作台”输入研究主题，在“DeepSeek 模型”下拉框中选择可用模型。默认使用“一键生成”模式，最多抓取 300 篇 PubMed 文献。
3. 点击“一键生成综述”。相关性筛选最多并行 5 路请求，随后自动完成大纲、正文和引用校验。
4. 任务完成后自动下载 DOCX。文档包含综述正文及其实际引用的参考文献，可用 Word 等应用查看和编辑。
5. 需要检查检索式时，可切换为“确认检索式”模式；“历史记录”支持重新导出 Word、JSON 和 CSV。若工作台没有显示预期模型，请返回“设置”重新测试 DeepSeek 连接。
