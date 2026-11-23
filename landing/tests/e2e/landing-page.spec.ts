import { expect, test } from '@playwright/test';

test.describe('Landing site', () => {
  test('home shows the hero, install block and both feature groups', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Wrangle every agent.');
    await expect(page.getByRole('link', { name: 'Install Wrangl' }).first()).toHaveAttribute(
      'href',
      '/install/',
    );
    await expect(page.getByRole('heading', { name: 'One line. Or the installer.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Crypto' })).toBeVisible();
    // TOKEN_CA is empty until launch, so the CA slot stays hidden.
    await expect(page.locator('#ca')).toBeHidden();
  });

  test('home install tabs switch the command', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'npm' }).click();
    await expect(page.locator('#cmd')).toHaveText('npx @wrangl-dev/wrangl');
  });

  test('features page switches tabs by click, arrow key and hash', async ({ page }) => {
    await page.goto('/features/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everything Wrangl does.');
    await expect(page.locator('#panel-wrangl')).toBeVisible();
    await page.getByRole('tab', { name: /^Crypto/ }).click();
    await expect(page.locator('#panel-crypto')).toBeVisible();
    await expect(page).toHaveURL(/#crypto$/);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#panel-wrangl')).toBeVisible();
    await page.goto('/features/#crypto');
    await expect(page.locator('#panel-crypto')).toBeVisible();
  });

  test('install page picks an OS tab and lists the five steps', async ({ page }) => {
    await page.goto('/install/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Install Wrangl.');
    await page.getByRole('tab', { name: 'Windows' }).click();
    await expect(page.locator('#os-cmd')).toContainText('install.ps1');
    await expect(page.locator('section.step')).toHaveCount(5);
  });

  test('privacy and terms render inside the site shell', async ({ page }) => {
    for (const [path, title] of [
      ['/privacy/', 'Privacy'],
      ['/terms/', 'Terms'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    }
  });
});
