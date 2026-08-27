import { expect, test } from '@playwright/test';
import { configureAndCompleteAnonymousOneClickReview, configureAndCompleteReview, mockReviewApis } from './helpers';

test('confirms the query, screens articles, and downloads Word', async ({ page }, testInfo) => {
  await mockReviewApis(page);
  const download = await configureAndCompleteReview(page);
  expect(download.suggestedFilename()).toMatch(/癌症研究综述.*\.docx$/);
  await expect(page.getByText('正文[1]。')).toHaveCount(0);
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(width.scroll).toBe(width.client);
  await page.screenshot({ path: `test-results/visual/workspace-${testInfo.project.name}.png`, fullPage: true });
  const topbar = await page.locator('.topbar').boundingBox();
  const workspace = await page.locator('.workspace').boundingBox();
  expect(topbar).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(workspace!.x).toBeGreaterThanOrEqual(0);
  expect(workspace!.x + workspace!.width).toBeLessThanOrEqual(width.client);
  expect(workspace!.y).toBeGreaterThanOrEqual(topbar!.y + topbar!.height);
});

test('runs one-click mode with anonymous NCBI access and downloads Word', async ({ page }) => {
  const { ncbiPostBodies } = await mockReviewApis(page);
  const download = await configureAndCompleteAnonymousOneClickReview(page);
  expect(download.suggestedFilename()).toMatch(/癌症研究综述.*\.docx$/);
  await expect(page.getByRole('heading', { name: '确认 PubMed 检索式' })).toHaveCount(0);
  expect(ncbiPostBodies.length).toBeGreaterThan(0);
  for (const body of ncbiPostBodies) expect(new URLSearchParams(body).has('api_key')).toBe(false);
});
