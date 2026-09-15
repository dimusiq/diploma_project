import { expect, test } from '@playwright/test';

test('страница 3D склада открывается с вкладками хаба', async ({
  page,
}) => {
  await page.goto('/warehouse-3d');
  await expect(
    page.getByRole('heading', { name: '3D модель склада' }),
  ).toBeVisible();
  const hub = page.getByRole('navigation', {
    name: 'Разделы склада',
  });
  await expect(
    hub.getByRole('link', { name: 'Остатки' }),
  ).toBeVisible();
  await expect(
    hub.getByRole('link', { name: 'Задания' }),
  ).toBeVisible();
  await expect(
    hub.getByRole('link', { name: '3D модель' }),
  ).toBeVisible();
  await expect(
    hub.getByRole('link', { name: 'Twin' }),
  ).toBeVisible();
});

test('клик по канвасу не сдвигает заголовок страницы', async ({
  page,
}) => {
  await page.goto('/warehouse-3d');
  const heading = page.getByRole('heading', {
    name: '3D модель склада',
  });
  await expect(heading).toBeVisible();
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  const before = await heading.boundingBox();
  await canvas.click({
    position: { x: 48, y: 48 },
    force: true,
  });
  await expect(heading).toBeVisible();
  const after = await heading.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(
    Math.abs((after?.y ?? 0) - (before?.y ?? 0)),
  ).toBeLessThan(2);
});
