import { test } from '@playwright/test';
import type { HudAlertViewModel, HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { openApp } from './playtest-harness';
import './ui-harness-api';

/**
 * Issue #739's column, measured before and after the fix on the same tree.
 *
 * A `.playtest.ts` and not a gate: every number here exists to be *changed* by
 * the decision it informs, which is exactly why
 * `tests/browser/ui-strip-badged-width.spec.ts` refuses to pin its own figures.
 * The gate this pass does add is `tests/browser/ui-alerts-column.spec.ts`,
 * which pins the property rather than the reading.
 *
 * Two pages are read, because they disagree and only one of them is the game:
 * the `ui-harness` (where a view model with `occurrences` on it can be handed
 * to the HUD directly) and the assembled `/index.html` (where `.hud__rail`
 * measures 288px at every desktop viewport and the harness's does not, per
 * `docs/research/2026-09-01-the-measurements-that-were-owed.md` §2).
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const VIEWPORTS = [
  [1280, 720],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [900, 600],
] as const;

/** `hud.alert.refusal.zone.not-enclosed`, the longest sentence in the refusal namespace. */
const LONGEST_REFUSAL_KEY = 'hud.alert.refusal.zone.not-enclosed';
const LONGEST_SENTENCE =
  'The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side.';

const POPULATED: HudCountsViewModel = {
  prisoners: 178,
  prisonerCapacity: 180,
  occupiedPlaces: 178,
  staff: 27,
  rooms: 61,
  prisonersCovered: 178,
  prisonersUnderstaffed: 0,
  prisonersUnguarded: 0,
  prisonersHighRisk: 24,
  activeIncidents: 0,
  contrabandFound: 47,
  treasuryMinorUnits: 1_284_500,
  stateIncomeAccruedTodayMinorUnits: 284_500,
};

function hudModel(alerts: readonly HudAlertViewModel[]): HudViewModel {
  return {
    counts: POPULATED,
    clock: { day: 17, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [...alerts],
  };
}

/**
 * Rows carrying `occurrences`, so every one of them draws the dismiss control
 * ADR 0084 decision 2 put on the row — the geometry `ui-shell.spec.ts`'s own
 * fixtures cannot show, because they build alerts with no `occurrences` and
 * `hud.ts` reads `alert.occurrences !== undefined` to decide.
 *
 * All three severities, because the badge is the severity word and the label
 * is the only `flex: 1` child, so the label is a *range* and the worst case is
 * whichever severity draws the widest badge.
 */
function refusalRows(count: number): HudAlertViewModel[] {
  const severities = ['danger', 'warning', 'info'] as const;
  return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, count).map((id, index) => ({
    id,
    labelKey: LONGEST_REFUSAL_KEY,
    severity: severities[index % severities.length]!,
    occurrences: {
      count: 3,
      lastAt: { day: 17, progressPercent: 25 },
      firstSequence: 1,
      lastSequence: 3,
      statement: `statement-${id}`,
    },
  }));
}

interface RowReading {
  readonly id: string;
  readonly badgeText: string;
  readonly rowWidth: number;
  readonly rowHeight: number;
  readonly label: number;
  readonly lines: number;
  readonly badge: number;
  readonly control: number;
}

interface CornerReading {
  readonly rootWidth: number;
  readonly corner: number;
  readonly panel: number;
  readonly rail: number;
  readonly minimapSurface: { readonly width: number; readonly height: number };
  readonly listClientHeight: number;
  readonly listScrollHeight: number;
  readonly rows: readonly RowReading[];
  /** Line boxes the 109-character sentence takes at each swept label width. */
  readonly sweep: readonly { readonly width: number; readonly lines: number }[];
}

function readCorner(input: { readonly sweepWidths: readonly number[]; readonly sentence: string }): CornerReading {
  const { sweepWidths, sentence } = input;
  const round = (n: number): number => Math.round(n * 100) / 100;
  const box = (el: Element | null | undefined): DOMRect =>
    el === null || el === undefined ? new DOMRect(0, 0, 0, 0) : el.getBoundingClientRect();

  const corner = document.querySelector<HTMLElement>('.hud__corner');
  const rail = document.querySelector<HTMLElement>('.hud__rail');
  if (corner === null || rail === null) throw new Error('the HUD corner is not on this page');
  const list = corner.querySelector<HTMLElement>('.hud-alerts__list');

  const lineBoxesOf = (el: HTMLElement): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
        .map((rect) => Math.round(rect.top * 2) / 2),
    );
    range.detach();
    return tops.size;
  };

  const rows: RowReading[] = [];
  for (const row of corner.querySelectorAll<HTMLElement>('[data-alert]')) {
    const label = row.querySelector<HTMLElement>('.ui-row__label');
    if (label === null) continue;
    rows.push({
      id: row.dataset['alert'] ?? '?',
      badgeText: (row.querySelector('.ui-badge')?.textContent ?? '').trim(),
      rowWidth: round(box(row).width),
      rowHeight: round(box(row).height),
      label: label.clientWidth,
      lines: lineBoxesOf(label),
      badge: round(box(row.querySelector('.ui-badge')).width),
      control: round(box(row.querySelector('.ui-icon-button')).width),
    });
  }

  const sweep: { width: number; lines: number }[] = [];
  const sample = corner.querySelector<HTMLElement>('.ui-row--wrap .ui-row__label');
  if (sample !== null) {
    const probe = sample.cloneNode(false) as HTMLElement;
    probe.textContent = sentence;
    probe.style.flex = '0 0 auto';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    (sample.parentElement ?? corner).append(probe);
    for (const width of sweepWidths) {
      probe.style.width = `${width}px`;
      sweep.push({ width, lines: lineBoxesOf(probe) });
    }
    probe.remove();
  }

  const surface = corner.querySelector<HTMLElement>('.hud-minimap__surface');
  return {
    rootWidth: document.documentElement.clientWidth,
    corner: round(box(corner).width),
    panel: round(box(corner.querySelector('.ui-panel')).width),
    rail: round(box(rail).width),
    minimapSurface: { width: round(box(surface).width), height: round(box(surface).height) },
    listClientHeight: list?.clientHeight ?? 0,
    listScrollHeight: list?.scrollHeight ?? 0,
    rows,
    sweep,
  };
}

const SWEEP = [36, 61, 88, 120, 140, 160, 180, 195, 200, 216, 240, 260] as const;

function report(label: string, r: CornerReading): void {
  const world = r.rootWidth - r.rail - r.corner;
  console.log(
    `  ${label}: root=${r.rootWidth} rail=${r.rail} corner=${r.corner} panel=${r.panel} ` +
      `world=${world}px  minimap surface=${r.minimapSurface.width}x${r.minimapSurface.height}`,
  );
  console.log(`    list clientHeight=${r.listClientHeight} scrollHeight=${r.listScrollHeight}`);
  for (const row of r.rows) {
    const taller = row.rowHeight > r.listClientHeight ? '  <-- TALLER THAN THE LIST BOX' : '';
    console.log(
      `    ${row.id} ${row.badgeText.padEnd(9)} row=${row.rowWidth}x${row.rowHeight} label=${row.label} ` +
        `lines=${row.lines} badge=${row.badge} control=${row.control}${taller}`,
    );
  }
  if (r.sweep.length > 0) {
    console.log(`    sweep: ${r.sweep.map((s) => `${s.width}px:${s.lines}`).join('  ')}`);
  }
}

test.describe('#739: what the alerts column measures', () => {
  test('the harness, three severities and one long alert, at five viewports', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      console.log(`\n=== ${width}x${height} (ui-harness) ===`);

      // Remounted for every reading: `hud.ts` builds the dismiss control only
      // in the branch that *creates* a row, so a reused row never grows one.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(3)));
      const three = await page.evaluate(readCorner, { sweepWidths: [...SWEEP], sentence: LONGEST_SENTENCE });
      if (three.rows.length !== 3) throw new Error(`expected three rows, drew ${three.rows.length}`);
      if (three.rows.some((row) => row.control === 0)) throw new Error('a row drew no dismiss control');
      report('three severities', three);

      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(1)));
      const one = await page.evaluate(readCorner, { sweepWidths: [...SWEEP], sentence: LONGEST_SENTENCE });
      report('one alert alone', one);

      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(8)));
      const eight = await page.evaluate(readCorner, { sweepWidths: [], sentence: LONGEST_SENTENCE });
      report('eight alerts', eight);
    }
  });

  test('the assembled page, for the rail and the world-view budget', async ({ page }) => {
    await openApp(page);
    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const r = await page.evaluate(readCorner, { sweepWidths: [], sentence: LONGEST_SENTENCE });
      console.log(`\n=== ${width}x${height} (/index.html) ===`);
      report('assembled', r);
    }
  });
});
