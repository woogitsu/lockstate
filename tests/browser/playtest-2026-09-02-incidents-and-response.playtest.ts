import { expect, type Page, test } from '@playwright/test';
import { buildAndPopulate, currentTick, fastForwardToMax, installTee, openApp, panelText, tab } from './playtest-harness';

/**
 * **Playing incidents, contraband and security response, end to end, for the
 * playtest brief of 2026-09-02.** Not a gate: see `playtest-harness.ts`'s own
 * docblock for why this suffix exists and what collects it (nothing in CI).
 *
 * Run one act at a time:
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5341 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-02-incidents-and-response.playtest.ts -g "act 1"
 * ```
 *
 * Findings live in `docs/research/2026-09-02-playing-incidents-and-response.md`.
 */

const log = (act: string, line: string): void => {
  console.log(`[${act}] ${line}`);
};

/** `hud.alert.event.incidents.riot-opened` / `.all-clear`'s own words, watched for rather than imported, so a locale edit shows up here as a miss instead of a false pass. */
const RIOT_OPENED_FRAGMENT = 'riot has broken out';
const ALL_CLEAR_FRAGMENT = 'under control again';

interface AlertsSample {
  readonly tick: number;
  readonly band: string;
  readonly list: readonly string[];
}

async function readAlerts(page: Page): Promise<AlertsSample> {
  const band = await panelText(page, '.hud__event');
  const list = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]')].map((row) => (row.innerText ?? '').trim()),
  );
  return { tick: await currentTick(page), band, list };
}

/** Polls the alerts band + list until `fragment` shows up in either, or gives up. */
async function waitForAlertContaining(page: Page, fragment: string, timeoutMs: number): Promise<AlertsSample> {
  const started = Date.now();
  for (;;) {
    const sample = await readAlerts(page);
    if (sample.band.includes(fragment) || sample.list.some((row) => row.includes(fragment))) return sample;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`"${fragment}" never appeared. Last band: ${JSON.stringify(sample.band)}, list: ${JSON.stringify(sample.list)}`);
    }
    await page.waitForTimeout(1000);
  }
}

/**
 * Opens the Security tab, expands the collapsed Roster section, and reads
 * both the Held-guards block and the full Roster block as text -- what a
 * player scrolling the Staff panel during a live incident actually sees.
 */
async function readStaffPanel(page: Page): Promise<{ held: string; roster: string }> {
  await tab(page, 'manage').click();
  const rosterHeader = page.locator('.hud-staff__roster .ui-section__header');
  if ((await rosterHeader.getAttribute('aria-expanded')) !== 'true') await rosterHeader.click();
  await page.waitForTimeout(200);
  return {
    held: await panelText(page, '.hud-staff__held'),
    roster: await panelText(page, '.hud-staff__roster'),
  };
}

async function hireGuards(page: Page, count: number): Promise<void> {
  await tab(page, 'manage').click();
  const guardRow = page.locator('.hud-staff__list [data-staff-role="staff-role.guard"]');
  if ((await guardRow.count()) > 0) await guardRow.first().click();
  for (let index = 0; index < count; index += 1) {
    await page.locator('.hud-staff__hire').click();
    await page.waitForTimeout(250);
  }
}

test.describe.configure({ mode: 'serial' });

test('act 1: a riot the player answers in reaction -- opening sentence, mid-response panels, closing sentence', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 1, admits: 3, guards: 0, label: 'act1' });
  await fastForwardToMax(page);

  log('act1', `after build, tick ${await currentTick(page)}`);

  const opened = await waitForAlertContaining(page, RIOT_OPENED_FRAGMENT, 480_000);
  log('act1', `riot opened -- tick ${opened.tick}, band=${JSON.stringify(opened.band)}, list=${JSON.stringify(opened.list)}`);

  // React: hire five guards the moment the riot is on screen, the same
  // reaction `security-default-sector.test.ts` proves resolves a severity-7
  // riot from this exact fixture shape (five hires, minimum for the pool a
  // shortfall-triggered riot leaves empty).
  await hireGuards(page, 5);
  log('act1', `hired 5 guards at tick ${await currentTick(page)}`);

  // Poll for a guard to show up in the Held block -- the moment a response is
  // actually under way, not merely dispatched.
  const heldAppearedAt = Date.now();
  let midResponse: { held: string; roster: string } | undefined;
  for (;;) {
    const read = await readStaffPanel(page);
    if (read.held.includes('Incident Response') || /\d/.test(read.held)) {
      midResponse = read;
      break;
    }
    if (Date.now() - heldAppearedAt > 120_000) break;
    await page.waitForTimeout(1000);
  }
  log('act1', `mid-response Staff panel at tick ${await currentTick(page)} -- held: ${JSON.stringify(midResponse?.held)}`);
  log('act1', `mid-response Staff panel roster: ${JSON.stringify(midResponse?.roster)}`);

  const closed = await waitForAlertContaining(page, ALL_CLEAR_FRAGMENT, 480_000);
  log('act1', `all-clear -- tick ${closed.tick}, band=${JSON.stringify(closed.band)}, list=${JSON.stringify(closed.list)}`);

  const finalStaff = await readStaffPanel(page);
  log('act1', `Staff panel after all-clear -- held: ${JSON.stringify(finalStaff.held)}, roster: ${JSON.stringify(finalStaff.roster)}`);

  // Recorded rather than asserted: this is a playtest, and the finding is the
  // log line, not a red/green.
  expect(closed.band.length > 0 || closed.list.length > 0).toBe(true);
});

test('act 2: the same riot, never answered -- does the closing sentence say anything different?', async ({ page }) => {
  await installTee(page);
  await openApp(page);
  await buildAndPopulate(page, { beds: 1, admits: 3, guards: 0, label: 'act2' });
  await fastForwardToMax(page);

  const opened = await waitForAlertContaining(page, RIOT_OPENED_FRAGMENT, 480_000);
  log('act2', `riot opened -- tick ${opened.tick}, band=${JSON.stringify(opened.band)}, list=${JSON.stringify(opened.list)}`);

  // No reaction at all. The response deadline is 600 ticks
  // (`DEFAULT_INCIDENT_RESPONSE_POLICY.responseDeadlineTicks`); at speed 4
  // (80 ticks/s) that is under 8 real seconds past opening, so the poll below
  // is generous.
  const closed = await waitForAlertContaining(page, ALL_CLEAR_FRAGMENT, 480_000);
  log('act2', `all-clear -- tick ${closed.tick}, band=${JSON.stringify(closed.band)}, list=${JSON.stringify(closed.list)}`);

  expect(closed.band.length > 0 || closed.list.length > 0).toBe(true);
});
