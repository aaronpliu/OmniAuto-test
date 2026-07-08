import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.getByRole('textbox', { name: 'usernameInput' }).click();
  await page.getByRole('textbox', { name: 'usernameInput' }).fill('admin');
  await page.getByRole('textbox', { name: 'passwordInput' }).click();
  await page.getByRole('textbox', { name: 'passwordInput' }).fill('123456');
  await page.getByRole('button', { name: 'loginButton' }).click();
  await page.getByLabel('navCalculator').click();
  await page.getByRole('button', { name: 'calcDigit_8' }).click();
  await page.getByRole('button', { name: 'calcDigit_8' }).click();
  await page.getByRole('button', { name: 'calcDigit_8' }).click();
  await page.getByRole('button', { name: 'calcAdd' }).click();
  await page.getByRole('button', { name: 'calcDigit_1' }).click();
  await page.getByRole('button', { name: 'calcDigit_2' }).click();
  await page.getByRole('button', { name: 'calcDigit_3' }).click();
  await page.getByRole('button', { name: 'calcMultiply' }).click();
  await page.getByRole('button', { name: 'calcDigit_9' }).click();
  await page.getByRole('button', { name: 'calcEquals' }).click();
  await expect(page.getByLabel('calcDisplay')).toContainText('9099');
});