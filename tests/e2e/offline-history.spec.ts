import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { configureAndCompleteReview, mockReviewApis } from './helpers';

test('keeps history and exports offline without caching API responses', async ({ context, page }) => {
  await mockReviewApis(page);
  await configureAndCompleteReview(page);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/当前离线/)).toBeVisible();
  await page.getByTitle('历史').click();
  await expect(page.getByText('癌症研究')).toBeVisible();
  await expect(page.getByRole('button', { name: '再次下载 Word' })).toBeVisible();

  const jsonPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  const jsonDownload = await jsonPromise;
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).not.toBeNull();
  const json = await readFile(jsonPath!, 'utf8');
  expect(json).not.toContain('test-deepseek');
  expect(json).not.toContain('test-ncbi');

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const cacheName of await caches.keys()) {
      for (const request of await (await caches.open(cacheName)).keys()) urls.push(request.url);
    }
    return urls;
  });
  expect(cachedUrls.some((url) => url.includes('api.deepseek.com') || url.includes('eutils.ncbi.nlm.nih.gov'))).toBe(false);

  await page.getByTitle('工作台').click();
  await page.getByLabel('研究主题').fill('离线主题');
  await expect(page.getByRole('button', { name: '一键生成综述' })).toBeDisabled();
});
