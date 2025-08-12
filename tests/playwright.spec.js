const { test, expect } = require('@playwright/test');

// API endpoint tests

test('healthz endpoint responds', async ({ request }) => {
  const res = await request.get('/healthz');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
});

test('readyz endpoint responds', async ({ request }) => {
  const res = await request.get('/readyz');
  expect(res.status()).toBe(200);
});

// Login page UI checks

test('login page has form inputs', async ({ page }) => {
  await page.goto('/static/Login.html');
  await expect(page.getByRole('heading', { name: /login to renn.ai crm/i })).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

// Dashboard theme toggle

test('dashboard theme toggle switches dark mode', async ({ page }) => {
  await page.goto('/static/dashboard.html');
  const toggle = page.locator('#dark-mode-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/dark-mode/);
});
