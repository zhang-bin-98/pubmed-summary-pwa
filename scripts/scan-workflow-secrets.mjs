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
