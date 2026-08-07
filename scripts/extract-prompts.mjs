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
