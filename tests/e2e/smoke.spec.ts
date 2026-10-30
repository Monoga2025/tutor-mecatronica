import { test, expect } from '@playwright/test';

test('arranca, ready y sin errores de consola', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?test=1');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.step(1 / 60, 10));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tests/e2e/screens/0-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
