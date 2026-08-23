import type { Page } from '@playwright/test';
import './harness-api'; // pulls in the `Window.lockstateHarness` global augmentation

const HARNESS_URL = '/tests/browser/harness.html';

async function attachHarness(page: Page, keepGenerations: number | undefined): Promise<void> {
  await page.waitForFunction(() => 'lockstateHarness' in window);
  await page.evaluate((keep) => window.lockstateHarness.openRepository(keep), keepGenerations);
}

/** Loads the harness page and opens a repository over the real IndexedDB adapter. */
export async function openHarness(page: Page, keepGenerations?: number): Promise<void> {
  await page.goto(HARNESS_URL);
  await attachHarness(page, keepGenerations);
}

/**
 * Reloads the page and re-opens the repository. Everything the previous load
 * held — the module graph, the repository instance and every `IDBDatabase`
 * connection — is discarded, so what comes back must have reached storage.
 */
export async function reloadHarness(page: Page, keepGenerations?: number): Promise<void> {
  await page.reload();
  await attachHarness(page, keepGenerations);
}
