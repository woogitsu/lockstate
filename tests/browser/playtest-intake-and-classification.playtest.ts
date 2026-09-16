import { expect, type Page, test } from '@playwright/test';
import {
  buildAndPopulate,
  currentTick,
  fastForwardToMax,
  installTee,
  latestCounts,
  openApp,
  panelText,
  showPanel,
  tab,
} from './playtest-harness';

/**
 * Playing INTAKE and CLASSIFICATION on `main` (v0.0.380) to answer the
 * playtest brief: what a player sees when there is nowhere to house an
 * arrival, and what a `Medium`-tier badge actually looks like next to a
 * `Minimal`/`Low` one on the Regime roster -- including what a viewer who
 * cannot use colour gets from it.
 *
 * One test, one page session, deliberately -- `buildAndPopulate` alone costs
 * 1.5-2.5 minutes of real time even with no contention, and this box runs
 * several other agents' suites at once, so a second built prison for a
 * second act was a second multi-minute tax this instrument does not need to
 * pay. All three questions are asked of the one prison instead:
 * headroom (Act 1), a forced shortfall on the same prison (Act 2), and the
 * classification badges as the clock keeps running (Act 3).
 *
 * An *instrument*, not a gate -- `playwright.playtest.config.ts` only,
 * never `run-suite.ts`.
 */

function log(act: string, line: string): void {
  console.log(`[${act}] ${line}`);
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function relLuminance(hex: string): number {
  const n = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
}
function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
}

async function snapshotIntakeAndStrip(page: Page, act: string, label: string): Promise<void> {
  const prisonersBadge = await page
    .locator('.hud-strip__metrics [data-metric="prisoners"] .ui-badge__text')
    .textContent()
    .catch(() => null);
  const noPlaceEl = page.locator('.hud-intake__no-place');
  const noPlaceHidden = await noPlaceEl.evaluate((el) => (el as HTMLElement).hidden).catch(() => null);
  const noPlaceText = (await noPlaceEl.textContent().catch(() => '')) ?? '';
  const tick = await currentTick(page);
  log(act, `${label} @ tick ${tick}: PRISONERS-chip-badge=${JSON.stringify(prisonersBadge)} no-place-hidden=${noPlaceHidden} no-place-text=${JSON.stringify(noPlaceText)}`);
}

test('intake shortage, then classification tones over time (#549, #609, #788)', async ({ page }) => {
  test.setTimeout(595_000);
  const testStartedMs = Date.now();
  const act = 'main';
  await installTee(page);
  await openApp(page);

  // 3 beds, 8 admits: a real, immediate shortfall, built and admitted in one
  // pass. `buildAndPopulate`'s own logging already prints
  // `hud.intake.no-place`'s `data-without-place` and the full status strip
  // text right after the admits, which is exactly Act 2's question -- no
  // separate step needed, and every extra step here is real minutes on a
  // contended box (`buildAndPopulate` alone measured 9+ minutes earlier this
  // session; see the research note for that number).
  await buildAndPopulate(page, { beds: 3, admits: 8, guards: 0, label: `${act}.build` });
  await showPanel(page, 'manage', '.hud-intake');
  await snapshotIntakeAndStrip(page, act, 'shortage (3 beds, 8 admits) right after build returns');
  await page.waitForTimeout(3000);
  await snapshotIntakeAndStrip(page, act, 'shortage +3s');
  log(act, `settled intake panel full text: ${await panelText(page, '.hud-intake')}`);
  log(act, `settled strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  log(act, `settled counts: ${JSON.stringify(await latestCounts(page))}`);
  log(act, `build phase took ${Date.now() - testStartedMs}ms of the ${595_000}ms test budget`);

  // ---- Act 3: whatever real time is left, watch the roster's badges as the
  // clock runs -- best-effort, bounded so the test reports rather than
  // getting killed mid-poll.
  const remainingMs = 595_000 - (Date.now() - testStartedMs);
  log(act, `remaining budget for classification watch: ${remainingMs}ms`);
  if (remainingMs < 30_000) {
    log(act, `too little budget left to watch classification -- stopping here with the shortage findings above.`);
    return;
  }

  await fastForwardToMax(page);
  await tab(page, 'day-plan').click();

  interface RowSnap {
    readonly tick: number;
    readonly prisoner: string | null;
    readonly riskTier: string | null;
    readonly group: string | null;
    readonly badgeText: string | null;
    readonly badgeTone: string | null;
    readonly hasTitle: boolean;
    readonly hasAriaLabel: boolean;
    readonly hasAriaDescribedBy: boolean;
  }

  const seenTiers = new Set<string>();
  const firstSeenAt = new Map<string, number>();
  const rowSnapsByTier = new Map<string, RowSnap>();

  const deadlineMs = Date.now() + Math.max(10_000, remainingMs - 20_000); // leave 20s for the final report below
  let lastTick = -1;
  while (Date.now() < deadlineMs && seenTiers.size < 3) {
    const tick = await currentTick(page);
    if (tick !== lastTick) {
      const rows = page.locator('.hud-regime__roster-row:not([hidden])');
      const count = await rows.count();
      for (let i = 0; i < count; i += 1) {
        const row = rows.nth(i);
        const riskTier = await row.getAttribute('data-risk-tier');
        if (riskTier === null) continue;
        if (!seenTiers.has(riskTier)) {
          seenTiers.add(riskTier);
          firstSeenAt.set(riskTier, tick);
        }
        if (!rowSnapsByTier.has(riskTier)) {
          const badge = row.locator('.ui-badge');
          const snap: RowSnap = {
            tick,
            prisoner: await row.getAttribute('data-prisoner'),
            riskTier,
            group: await row.getAttribute('data-classification-group'),
            badgeText: await badge.locator('.ui-badge__text').textContent(),
            badgeTone: await badge.getAttribute('data-tone'),
            hasTitle: (await badge.getAttribute('title')) !== null,
            hasAriaLabel: (await badge.getAttribute('aria-label')) !== null,
            hasAriaDescribedBy: (await badge.getAttribute('aria-describedby')) !== null,
          };
          rowSnapsByTier.set(riskTier, snap);
        }
      }
      lastTick = tick;
    }
    await page.waitForTimeout(1500);
  }

  log(act, `tiers observed on the visible roster window: ${JSON.stringify([...seenTiers].sort())}`);
  log(act, `first tick each tier was seen at: ${JSON.stringify(Object.fromEntries(firstSeenAt))}`);
  for (const [tier, snap] of [...rowSnapsByTier.entries()].sort()) {
    log(act, `tier ${tier} row snapshot: ${JSON.stringify(snap)}`);
  }

  await page
    .locator('.hud-regime__roster')
    .screenshot({ path: 'test-results/playtest-classification-roster.png' })
    .catch((e) => log(act, `screenshot failed: ${String(e)}`));

  const toneColours: Record<string, { bg: string; fg: string } | undefined> = {};
  for (const tone of ['neutral', 'caution', 'warning'] as const) {
    const el = page.locator(`.hud-regime__roster-row:not([hidden]) .ui-badge[data-tone="${tone}"]`).first();
    if ((await el.count()) === 0) {
      toneColours[tone] = undefined;
      continue;
    }
    const styles = await el.evaluate((node) => {
      const cs = getComputedStyle(node);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    toneColours[tone] = styles;
  }
  log(act, `computed colours actually painted, per tone present on screen: ${JSON.stringify(toneColours)}`);

  const STRAW = '#bba881';
  const AMBER = '#e8b463';
  const PAPER_400 = '#a8b1bc';
  log(act, `contrast ratio caution-fg vs warning-fg (straw vs amber): ${contrastRatio(STRAW, AMBER).toFixed(2)}:1`);
  log(act, `contrast ratio caution-fg vs neutral-fg (straw vs paper-400): ${contrastRatio(STRAW, PAPER_400).toFixed(2)}:1`);
  log(act, `contrast ratio warning-fg vs neutral-fg (amber vs paper-400): ${contrastRatio(AMBER, PAPER_400).toFixed(2)}:1`);

  log(act, `final counts: ${JSON.stringify(await latestCounts(page))}`);
});
