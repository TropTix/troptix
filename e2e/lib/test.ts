import { test as base, type Page } from '@playwright/test';
import { EventFactory } from './events';

export const test = base.extend<{ factory: EventFactory; chapter: Chapter }>({
  factory: async ({}, use) => {
    const factory = new EventFactory();
    await use(factory);
    await factory.cleanup();
  },
  // Third parties the flow does not need: analytics (keeps test runs out of
  // the funnel) and the venue map. Stripe stays live — it is what we test.
  page: async ({ page }, use) => {
    await page.route('**/ingest/**', (route) => route.abort());
    await page.route('https://*.posthog.com/**', (route) => route.abort());
    await page.route('https://maps.googleapis.com/**', (route) =>
      route.abort()
    );
    await use(page);
  },
  chapter: async ({ page }, use) => {
    await use(makeChapter(page));
  },
});

type Chapter = <T>(title: string, body: () => Promise<T>) => Promise<T>;

// A named step that also stamps a title card into the recording, so the
// proof video narrates itself.
function makeChapter(page: Page): Chapter {
  return (title, body) =>
    test.step(title, async () => {
      await page.screencast.showChapter(title, { duration: 1200 });
      await page.waitForTimeout(1200);
      return body();
    });
}

export { expect } from '@playwright/test';
