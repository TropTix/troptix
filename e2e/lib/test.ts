import fs from 'node:fs';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { EventFactory } from './events';
import { FAKE_STRIPE_URL } from './env';

const stripeJsShim = fs
  .readFileSync(path.join(__dirname, 'fake-stripe-js.js'), 'utf8')
  .replace('__FAKE_STRIPE_URL__', FAKE_STRIPE_URL);

export const test = base.extend<{ factory: EventFactory }>({
  factory: async ({}, use) => {
    const factory = new EventFactory();
    await use(factory);
    await factory.cleanup();
  },
  // No request leaves for a third party. Stripe.js is replaced by the shim,
  // the rest of Stripe's domains, analytics and the venue map are cut off.
  // Routes match in reverse registration order, so the shim goes last.
  page: async ({ page }, use) => {
    await page.route('https://*.stripe.com/**', (route) => route.abort());
    await page.route('https://js.stripe.com/**', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: stripeJsShim,
      })
    );
    await page.route('**/ingest/**', (route) => route.abort());
    await page.route('https://*.posthog.com/**', (route) => route.abort());
    await page.route('https://maps.googleapis.com/**', (route) =>
      route.abort()
    );
    await use(page);
  },
});

export { expect } from '@playwright/test';
