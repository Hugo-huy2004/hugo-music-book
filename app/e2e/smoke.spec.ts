import { test, expect } from '@playwright/test';

// Khách mở trang chủ, bấm phát một bài: app xin được vé nghe từ Edge Function.
test('guest can open home and play a song', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Trang chủ').first()).toBeVisible();
  const playback = page.waitForResponse((r) => r.url().includes('/functions/v1/playback') && r.ok());
  await page.getByText('Mới phát hành').first().scrollIntoViewIfNeeded();
  await page.locator('[aria-label^="Phát"]').first().click();
  await playback;
});
