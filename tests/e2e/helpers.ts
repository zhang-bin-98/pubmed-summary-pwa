import type { Page } from '@playwright/test';

export async function mockReviewApis(page: Page) {
  const ncbiPostBodies: string[] = [];
  await page.route('https://api.deepseek.com/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/models')) {
      await route.fulfill({ json: { data: [{ id: 'deepseek-v4-flash', context_length: 1_000_000 }, { id: 'deepseek-v4-pro', context_length: 1_000_000 }] } });
      return;
    }
    const request = JSON.parse(route.request().postData() ?? '{}');
    const prompt = String(request.messages?.at(-1)?.content ?? '');
    if (prompt.includes('pubmed_search_instruction')) {
      await route.fulfill({ json: { choices: [{ message: { content: '(cancer[Title])' } }] } });
      return;
    }
    if (prompt.includes('医学文献初筛助手')) {
      const jsonStart = prompt.lastIndexOf('[{"sourceId"');
      const articles = JSON.parse(prompt.slice(jsonStart)) as Array<{ sourceId: string }>;
      const decisions = articles.map(({ sourceId }) => ({ sourceId, score: 3, include: true, reason: '直接相关' }));
      await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ decisions }) } }] } });
      return;
    }
    if (prompt.includes('医学文献结构化提炼与规划师')) {
      await route.fulfill({ json: { choices: [{ message: { content: '引言 (建议约500字)\n结论 (建议约300字)' } }] } });
      return;
    }
    await route.fulfill({ json: { choices: [{ message: { content: '# 癌症研究综述\n\n## 1. 引言\n\n正文[1]。\n\n## 2. 结论\n\n结论[1]。' } }] } });
  });
  await page.route('https://eutils.ncbi.nlm.nih.gov/**', async (route) => {
    if (route.request().method() === 'POST') ncbiPostBodies.push(route.request().postData() ?? '');
    if (route.request().url().includes('efetch')) {
      await route.fulfill({ path: 'tests/fixtures/pubmed-sample.xml', contentType: 'application/xml' });
      return;
    }
    await route.fulfill({ json: { esearchresult: { count: '1', idlist: ['123'], webenv: 'env', querykey: '1' } } });
  });
  return { ncbiPostBodies };
}

export async function configureAndCompleteReview(page: Page) {
  await page.goto('/');
  await page.getByTitle('设置').click();
  await page.getByLabel('AI API Key', { exact: true }).fill('test-deepseek');
  await page.getByLabel(/^My NCBI API Key/).fill('test-ncbi');
  await page.getByRole('button', { name: '测试 AI 连接' }).click();
  await page.getByRole('button', { name: '测试 NCBI 连接' }).click();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForTimeout(50);
  await page.getByTitle('工作台').click();
  await page.getByLabel('研究主题').fill('癌症研究');
  await page.getByText('确认检索式', { exact: true }).click();
  await page.getByRole('button', { name: '生成检索式' }).click();
  await page.getByRole('textbox', { name: 'PubMed 检索式', exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '开始生成' }).click();
  const download = await downloadPromise;
  await page.getByRole('button', { name: '再次下载' }).waitFor();
  return download;
}

export async function configureAndCompleteAnonymousOneClickReview(page: Page) {
  await page.goto('/');
  await page.getByTitle('设置').click();
  await page.getByLabel('AI API Key', { exact: true }).fill('test-deepseek');
  await page.getByRole('button', { name: '测试 AI 连接' }).click();
  await page.getByRole('button', { name: '测试 NCBI 连接' }).click();
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForTimeout(50);
  await page.getByTitle('工作台').click();
  await page.getByLabel('研究主题').fill('癌症研究');
  await page.getByText('一键生成', { exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键生成综述' }).click();
  await page.getByRole('textbox', { name: 'PubMed 检索式', exact: true }).waitFor({ state: 'detached' });
  const download = await downloadPromise;
  await page.getByRole('button', { name: '再次下载' }).waitFor();
  return download;
}
