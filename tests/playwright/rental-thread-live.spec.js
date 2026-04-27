import { test, expect } from '@playwright/test';

const customerEmail = process.env.PW_CUSTOMER_EMAIL || '';
const customerPassword = process.env.PW_CUSTOMER_PASSWORD || '';
const ownerEmail = process.env.PW_OWNER_EMAIL || '';
const ownerPassword = process.env.PW_OWNER_PASSWORD || '';

const requestId = '102d5a39-bcc6-4a1e-baba-7a25e66a8f2d';
const ownerHistoricalRentalId = '72c34162-69a0-4f58-885e-4e3b04259554';

const requireCredential = (value, name) => {
  if (!String(value || '').trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
};

const login = async (page, { email, password }) => {
  requireCredential(email, 'email');
  requireCredential(password, 'password');

  await page.goto('/login');
  await page.getByLabel(/email|e-mail/i).fill(email);
  await page.getByLabel(/password|mot de passe/i).fill(password);
  await page.getByRole('button', { name: /sign in|se connecter/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });
};

test.describe('Rental thread live QA', () => {
  test('owner message sent from the canonical request thread is visible in the customer deep-linked thread', async ({ browser }) => {
    requireCredential(customerEmail, 'PW_CUSTOMER_EMAIL');
    requireCredential(customerPassword, 'PW_CUSTOMER_PASSWORD');
    requireCredential(ownerEmail, 'PW_OWNER_EMAIL');
    requireCredential(ownerPassword, 'PW_OWNER_PASSWORD');

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();
    const messageToken = `owner-live-probe-${Date.now()}`;

    try {
      await login(ownerPage, { email: ownerEmail, password: ownerPassword });
      await ownerPage.goto(`/account/messages?requestId=${requestId}`);
      await expect(ownerPage).toHaveURL(new RegExp(`/account/messages\\?requestId=${requestId}`));
      await expect(ownerPage.getByText(/want-to-rent/i).first()).toBeVisible({ timeout: 20_000 });

      const ownerComposer = ownerPage.locator('textarea[placeholder*="Write a public message"]').first();
      await expect(ownerComposer).toBeVisible({ timeout: 20_000 });
      await ownerComposer.fill(messageToken);
      await ownerPage.getByRole('button', { name: /Send message/i }).click();
      await expect(ownerPage.getByText(messageToken).last()).toBeVisible({ timeout: 20_000 });

      await login(customerPage, { email: customerEmail, password: customerPassword });
      await customerPage.goto(`/account/messages?requestId=${requestId}`);
      await expect(customerPage).toHaveURL(new RegExp(`/account/messages\\?requestId=${requestId}`));
      await expect(customerPage.getByText(/Waiting for approval/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(customerPage.getByText(messageToken).last()).toBeVisible({ timeout: 20_000 });
      await expect(customerPage.locator('textarea')).toHaveCount(0);
    } finally {
      await ownerContext.close();
      await customerContext.close();
    }
  });

  test('customer sees the shared request thread but cannot reply before approval', async ({ page }) => {
    requireCredential(customerEmail, 'PW_CUSTOMER_EMAIL');
    requireCredential(customerPassword, 'PW_CUSTOMER_PASSWORD');

    await login(page, { email: customerEmail, password: customerPassword });

    await page.goto('/account/rentals');
    await expect(page).toHaveURL(/\/account\/rentals/);
    await expect(page.getByText(/Current request|Demande actuelle/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Waiting for owner review|En attente de la revue du propriétaire/i)).toBeVisible({ timeout: 20_000 });

    await page.goto('/account/messages');
    await expect(page).toHaveURL(/\/account\/messages/);

    const sharedThread = page.getByRole('button', { name: /Owner:\s*want-to-rent[\s\S]*Segway AT6/i }).first();
    await expect(sharedThread).toBeVisible({ timeout: 20_000 });
    await sharedThread.click();

    await expect(page.getByText(/Waiting for approval/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/You’ll be able to continue once approved|Vous pourrez continuer une fois approuvée/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('textarea')).toHaveCount(0);
  });

  test('vehicle owner can open the request from hosting and gets a composer in messenger', async ({ page }) => {
    requireCredential(ownerEmail, 'PW_OWNER_EMAIL');
    requireCredential(ownerPassword, 'PW_OWNER_PASSWORD');

    await login(page, { email: ownerEmail, password: ownerPassword });

    await page.goto('/account/overview');
    await expect(page).toHaveURL(/\/account\/overview/);
    await expect(page.getByText(/Incoming owner request/i)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/account/vehicles?requestId=${requestId}#requests`);
    await expect(page).toHaveURL(new RegExp(`/account/vehicles\\?requestId=${requestId}`));
    await expect(page.getByText(/Incoming renter requests/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /want-to-rent/i }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Approve, decline, and counter-offer now happen inside Messenger/i).first()).toBeVisible({ timeout: 20_000 });

    const openInMessages = page.getByRole('button', { name: /Open in messages/i }).first();
    await expect(openInMessages).toBeVisible({ timeout: 20_000 });
    await openInMessages.click();

    await expect(page.locator('textarea[placeholder*=\"Write a public message\"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Send message/i })).toBeVisible({ timeout: 20_000 });
  });

  test('vehicle owner keeps approve and reject actions visible after reload in messenger', async ({ page }) => {
    requireCredential(ownerEmail, 'PW_OWNER_EMAIL');
    requireCredential(ownerPassword, 'PW_OWNER_PASSWORD');

    await login(page, { email: ownerEmail, password: ownerPassword });

    await page.goto(`/account/vehicles?requestId=${requestId}#requests`);
    await expect(page).toHaveURL(new RegExp(`/account/vehicles\\?requestId=${requestId}`));

    const openInMessages = page.getByRole('button', { name: /Open in messages/i }).first();
    await expect(openInMessages).toBeVisible({ timeout: 20_000 });
    await openInMessages.click();

    const approveButton = page.getByRole('button', { name: /^Approve$|^Approuver$/i }).first();
    const rejectButton = page.getByRole('button', { name: /^Reject$|^Refuser$/i }).first();

    await expect(approveButton).toBeVisible({ timeout: 20_000 });
    await expect(rejectButton).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page).toHaveURL(new RegExp(`/account/vehicles\\?requestId=${requestId}`));
    await expect(page.getByText(/Incoming renter requests/i)).toBeVisible({ timeout: 20_000 });

    await expect(approveButton).toBeVisible({ timeout: 20_000 });
    await expect(rejectButton).toBeVisible({ timeout: 20_000 });
  });

  test('historical rental detail renders even when the canonical rental thread is missing', async ({ page }) => {
    requireCredential(ownerEmail, 'PW_OWNER_EMAIL');
    requireCredential(ownerPassword, 'PW_OWNER_PASSWORD');

    await login(page, { email: ownerEmail, password: ownerPassword });

    await page.goto(`/account/rentals/${ownerHistoricalRentalId}`);
    await expect(page).toHaveURL(new RegExp(`/account/rentals/${ownerHistoricalRentalId}`));

    await expect(page.getByText(/Rental details|Détails de location/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Segway AT6/i })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/RNT-2026-f51/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Rental summary|Résumé de la location/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/canonical conversation thread is not linked yet|fil de conversation canonique n’est pas encore lié/i)
    ).toBeVisible({ timeout: 20_000 });
  });
});
