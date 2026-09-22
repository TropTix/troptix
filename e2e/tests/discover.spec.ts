import { test, expect } from '../lib/test';
import type { Page } from '@playwright/test';

// Card links wrap an <article>, which stops name-from-content, so the link
// has no accessible name; find it by the heading inside it.
function eventCard(page: Page, name: string) {
  return page
    .getByRole('link')
    .filter({ has: page.getByRole('heading', { name, level: 3 }) });
}

// The seeded demo events (supabase/seed.sql) carry relative dates, so they
// are always upcoming and always listed.
test('events load on the discover page and open their event page', async ({
  page,
  chapter,
}) => {
  await chapter('Open the discover page', async () => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: 'Discover' })).toBeVisible();
  });

  await chapter('Seeded events are listed', async () => {
    await expect(eventCard(page, 'TropTix Demo Festival')).toBeVisible();
    await expect(eventCard(page, 'TropTix Free Community Day')).toBeVisible();
    await expect(eventCard(page, 'TropTix Private Preview')).toHaveCount(0);
  });

  await chapter('An event card opens its page', async () => {
    await eventCard(page, 'TropTix Demo Festival').click();
    await page.waitForURL(/\/e\/seed_event_1/);
    await expect(
      page.getByRole('heading', { name: 'TropTix Demo Festival' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Get Tickets/ })
    ).toBeEnabled();
  });
});
