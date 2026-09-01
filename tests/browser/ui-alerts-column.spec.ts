import type { HudAlertViewModel, HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * The gate `tests/browser/playtest-739-a-column-a-sentence-fits-in.playtest.ts`
 * promises in its own docblock: issue #739 pinned as a property rather than a
 * reading.
 *
 * ## What #739 was
 *
 * A 109-character refusal sentence (`hud.alert.refusal.zone.not-enclosed`, the
 * longest in the refusal namespace) wrapped to **11 line boxes in an 88px
 * label**, identically at every desktop viewport and at 900x600 — and once
 * ADR 0084 decision 2's dismiss control landed beside it, the label narrowed
 * further (36-61px depending on severity, #720's own measured range,
 * previously undocumented anywhere in this codebase) and the sentence measured
 * **26-27 line boxes, 407-422px of row** — taller than the list box that held
 * it at 1280x800, 1280x720 and 900x600
 * (`docs/research/2026-09-01-the-measurements-that-were-owed.md` §1).
 * `src/ui/hud/hud.css` widened `.hud-minimap` from 224px to 396px to fix it;
 * this file is what keeps that fix from quietly regressing.
 *
 * ## Why the harness, and why three severities
 *
 * `ui-shell.spec.ts`'s own alert fixtures carry no `occurrences`, so they
 * never render the dismiss control and never measure this geometry — the
 * harness's `setHudViewModel` is the only way to put a control on a row.
 * `.ui-row__label` is the row's only `flex: 1` child, so the label's width is
 * whatever the severity badge does not take, and the three severities draw
 * three different badge widths — `warning` (64.31px) is the narrowest label
 * and the one this file's bound has to hold for, not `danger` or `info`,
 * which are both roomier. `hud.css`'s own arithmetic block above
 * `.hud-alerts__list > .ui-row` derives the same range and is where the next
 * reader should look for why it exists.
 *
 * ## What is pinned, and what deliberately is not
 *
 * **Pinned:** the 109-character sentence, at the narrowest severity badge, at
 * every one of #739's five measured viewports, wraps to **at most 4 line
 * boxes** — the property the corner was widened to buy, not the 396px
 * declaration that buys it. A future pass that finds a cheaper way to hold 4
 * line boxes (a different font stack, a shorter sentence, a narrower badge)
 * passes this file without touching it. **Also pinned:** a single alert never
 * measures taller than the list box that holds it, at any of the five
 * viewports — the property that failed at three of them before this fix, and
 * the bar issue #739 itself states: *"a player can read an alert without it
 * becoming a tower taller than the box it sits in."* **Not pinned:** the
 * 396px declaration, the 422px corner, or the exact row height in pixels —
 * pinning the implementation rather than the property is what made
 * `ui-strip-badged-width.spec.ts`'s own docblock refuse to pin a chip count,
 * for the same reason: it would make the next legitimate change fail this
 * file instead of the regression this file exists to catch.
 *
 * ## The CI-versus-container caveat this suite states once, here, rather than
 * per assertion
 *
 * Line-box counts are a function of the resolved font stack. If this file
 * disagrees between this container and CI, CI is the authority — a font
 * substitution here would change wrap points without changing anything this
 * repository controls. Nothing here reads wall-clock timing, so machine load
 * does not touch it either way.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

const VIEWPORTS = [
  [1280, 720],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [900, 600],
] as const;

/** The maximum line boxes the worst-case severity badge may leave the
 * 109-character sentence wrapped into. #739's own regression was 26-27; the
 * fix holds this at 4. A value at or below this bound is a pass -- see the
 * docblock above for why a *lower* number found some other way should not
 * have to touch this file. */
const MAX_LINE_BOXES = 4;

/** `hud.alert.refusal.zone.not-enclosed`, the longest sentence in the refusal
 * namespace -- see `src/content/default-locale-en.ts`. */
const LONGEST_REFUSAL_KEY = 'hud.alert.refusal.zone.not-enclosed';

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
 * ADR 0084 decision 2 put on the row -- the geometry `ui-shell.spec.ts`'s own
 * fixtures cannot show (`hud.ts` reads `alert.occurrences !== undefined` to
 * decide). All three severities, so the row this file measures is whichever
 * one draws the narrowest label, not an arbitrary one.
 */
function refusalRows(count: number): HudAlertViewModel[] {
  const severities = ['danger', 'warning', 'info'] as const;
  return ['a', 'b', 'c'].slice(0, count).map((id, index) => ({
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
  readonly rowHeight: number;
  readonly lines: number;
}

interface Reading {
  readonly rows: readonly RowReading[];
  readonly listClientHeight: number;
}

function readAlerts(): Reading {
  const round = (n: number): number => Math.round(n * 100) / 100;
  const box = (el: Element | null | undefined): DOMRect =>
    el === null || el === undefined ? new DOMRect(0, 0, 0, 0) : el.getBoundingClientRect();
  const corner = document.querySelector<HTMLElement>('.hud__corner');
  if (corner === null) throw new Error('the HUD corner is not on this page');
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
    rows.push({ rowHeight: round(box(row).height), lines: lineBoxesOf(label) });
  }

  return { rows, listClientHeight: list?.clientHeight ?? 0 };
}

async function mountThreeSeverities(page: Page): Promise<Reading> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(3)));
  return page.evaluate(readAlerts);
}

async function mountOneAlert(page: Page, severity: HudAlertViewModel['severity']): Promise<Reading> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  const rows: HudAlertViewModel[] = [
    {
      id: 'solo',
      labelKey: LONGEST_REFUSAL_KEY,
      severity,
      occurrences: {
        count: 1,
        lastAt: { day: 17, progressPercent: 25 },
        firstSequence: 1,
        lastSequence: 1,
        statement: 'statement-solo',
      },
    },
  ];
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(rows));
  return page.evaluate(readAlerts);
}

test.describe('#739: the alerts column holds the longest sentence to a readable height', () => {
  test('the narrowest severity badge still wraps the 109-character sentence to at most 4 line boxes, at every viewport', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const reading = await mountThreeSeverities(page);
      expect(reading.rows.length, `${width}x${height}: expected 3 alert rows`).toBe(3);
      const worst = Math.max(...reading.rows.map((row) => row.lines));
      expect(
        worst,
        `${width}x${height}: the worst-case severity badge wrapped the sentence past ${MAX_LINE_BOXES} line boxes`,
      ).toBeLessThanOrEqual(MAX_LINE_BOXES);
    }
  });

  test('a single alert never measures taller than the list box that holds it, at every viewport and every severity', async ({
    page,
  }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      for (const severity of ['danger', 'warning', 'info'] as const) {
        const reading = await mountOneAlert(page, severity);
        expect(reading.rows.length, `${width}x${height} ${severity}: expected 1 alert row`).toBe(1);
        const row = reading.rows[0]!;
        expect(
          row.rowHeight,
          `${width}x${height} ${severity}: a single alert (${row.rowHeight}px) is taller than its list box (${reading.listClientHeight}px)`,
        ).toBeLessThanOrEqual(reading.listClientHeight);
      }
    }
  });
});
