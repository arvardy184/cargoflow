import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.E2E_PASSWORD ?? 'CargoFlow!2026';

async function signIn(page: Page, email: string) {
  await page.goto('/shipments');
  // Unauthenticated visitors are sent to /login and returned afterwards.
  await expect(page).toHaveURL(/\/login\?next=%2Fshipments/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/shipments$/);
}

function localDateTime(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

test('operations user creates a shipment, moves it to delivered and sees the full timeline', async ({
  page,
}) => {
  await signIn(page, 'ops@cargoflow.local');
  await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);

  // Create
  await page.getByRole('link', { name: 'New shipment' }).click();
  const customer = page.getByLabel('Customer');
  await expect(customer.locator('option')).not.toHaveCount(1);
  await customer.selectOption({ index: 1 });
  const container = page.getByLabel('Container');
  await expect(container.locator('option').nth(1)).toBeAttached();
  await container.selectOption({ index: 1 });
  await page.getByLabel('Origin').fill('Bitung');
  await page.getByLabel('Destination').fill('Sorong');
  await page.getByLabel('Estimated delivery (ETA)').fill(localDateTime(5));
  await page.getByLabel(/Notes/).fill('E2E smoke test');
  await page.getByRole('button', { name: 'Create shipment' }).click();

  // The success alert (the timeline also contains a "Shipment created" remark).
  await expect(page.getByRole('status').filter({ hasText: 'Shipment created' })).toBeVisible();
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText(/CF-\d{4}-\d{5}/);
  await expect(heading).toContainText('Draft');

  // Lifecycle: each step needs confirmation; the next action appears once the API agrees.
  for (const [action, status] of [
    ['Confirm booking', 'Booked'],
    ['Mark as departed', 'In transit'],
    ['Mark as delivered', 'Delivered'],
  ] as const) {
    await page.getByRole('button', { name: action }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Remarks/).fill(`E2E: ${status}`);
    await dialog.getByRole('button', { name: action }).click();
    await expect(dialog).toBeHidden();
    await expect(heading).toContainText(status);
  }

  await expect(page.getByText('Delivered shipments are final.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);

  // Timeline shows creation plus three transitions, with remarks.
  const history = page.locator('section', {
    has: page.getByRole('heading', { name: 'Status history' }),
  });
  for (const line of [
    'Created as draft',
    'Draft → Booked',
    'Booked → In transit',
    'In transit → Delivered',
    'E2E: Delivered',
  ]) {
    await expect(history.getByText(line)).toBeVisible();
  }
});

test('operations user cannot open the audit log', async ({ page }) => {
  await signIn(page, 'ops@cargoflow.local');
  await page.goto('/audit-logs');
  await expect(page.getByText('Administrators only')).toBeVisible();
  const status = await page.evaluate(async () => (await fetch('/api/audit-logs')).status);
  expect(status).toBe(403);
});
