import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { HudAlertViewModel, HudCountsViewModel, HudViewModel } from '../../src/ui/hud';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS } from '../../src/simulation/economy';
import { buildAndPopulate, installTee, openApp, tab } from './playtest-harness';
import './ui-harness-api';

/**
 * The five measurements five documents on `main` say they are owed, taken.
 *
 * **A `.playtest.ts` and not a `.spec.ts`, deliberately.** Every block below
 * *reports a number*; none of them pins a contract. Four of the five exist to
 * answer a question an ADR left open — how wide the corner should be, whether
 * a wording fits, how many chips survive — and a wording or a width that is
 * about to change is exactly what `ui-strip-badged-width.spec.ts` says must
 * not be turned into an expectation: *"An expectation reading '6 of 9 at 1280'
 * would make the next person's fix fail this file."* The one assertion each
 * block does carry is its own premise (the fixture really is in the state the
 * measurement claims), so a silently-empty reading cannot be reported as a
 * figure.
 *
 * The findings are in
 * `docs/research/2026-09-01-the-measurements-that-were-owed.md`.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The longest sentence in the refusal namespace — `hud.alert.refusal.zone.not-enclosed`. */
const LONGEST_REFUSAL_KEY = 'hud.alert.refusal.zone.not-enclosed';

const VIEWPORTS = [
  [1920, 1080],
  [1280, 800],
  [1280, 720],
  [900, 600],
] as const;

const POPULATED: HudCountsViewModel = {
  prisoners: 178,
  prisonerCapacity: 180,
  occupiedPlaces: 178,
  staff: 27,
  staffUnassigned: 0,
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

/** `ui-strip-badged-width.spec.ts`'s `EVERY_BADGE`, copied so this file reads the same prison. */
const EVERY_BADGE: HudCountsViewModel = {
  ...POPULATED,
  occupiedPlaces: 142,
  prisonersCovered: 100,
  prisonersUnderstaffed: 42,
  prisonersUnguarded: 36,
  activeIncidents: 3,
  activeIncidentTypeLabelKey: 'incident-type.gang-retaliation.name',
  contrabandNameKey: 'contraband.currency.name',
};

function hudModel(alerts: readonly HudAlertViewModel[], counts: HudCountsViewModel = POPULATED): HudViewModel {
  return {
    counts,
    clock: { day: 17, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [...alerts],
  };
}

/** Eight rows of the longest refusal sentence; the first `dismissable` of them carry `occurrences`. */
function refusalRows(count: number, dismissable: number): HudAlertViewModel[] {
  return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, count).map((id, index) => ({
    id,
    labelKey: LONGEST_REFUSAL_KEY,
    severity: index === 0 ? 'danger' : index === 1 ? 'warning' : 'info',
    ...(index < dismissable
      ? {
          occurrences: {
            count: 3,
            lastAt: { day: 17, progressPercent: 25 },
            firstSequence: 1,
            lastSequence: 3,
            statement: `statement-${id}`,
          },
        }
      : {}),
  }));
}

/* ------------------------------------------------------------------ */
/* 1 + 2: the alerts row, the label, the corner and the rail           */
/* ------------------------------------------------------------------ */

interface RowReading {
  readonly selector: string;
  readonly dismissible: boolean;
  readonly rowWidth: number;
  readonly rowHeight: number;
  readonly labelClientWidth: number;
  readonly labelScrollWidth: number;
  readonly labelHeight: number;
  readonly labelLineBoxes: number;
  readonly labelLineHeight: number;
  readonly labelText: string;
  readonly iconWidth: number;
  readonly badgeWidth: number;
  readonly actionWidth: number;
  readonly gap: number;
  readonly paddingX: number;
}

interface AlertsReading {
  readonly rows: readonly RowReading[];
  readonly listClientHeight: number;
  readonly listScrollHeight: number;
  readonly listOverflowY: string;
  readonly cornerWidth: number;
  readonly cornerHeight: number;
  readonly panelWidth: number;
  readonly railWidth: number;
  readonly railHeight: number;
  readonly rootWidth: number;
  readonly uiScale: string;
  /** Line boxes the 109-character sentence takes at each candidate label width. */
  readonly candidates: readonly { readonly labelWidth: number; readonly lines: number; readonly height: number }[];
  readonly sentence: string;
  readonly sentenceLength: number;
}

/**
 * Everything measurements 1 and 2 need, read out of one painted page.
 *
 * The candidate sweep is measured, not modelled: a clone of the real
 * `.ui-row__label` — same element, same class chain, same resolved font,
 * `word-break` and `line-height` — is put in the same list at an explicit
 * width, and its line boxes are counted with `Range.getClientRects()`, which
 * is the browser's own answer to "how many lines is this". `scrollHeight /
 * lineHeight` would round a fractional leading into a wrong integer; the range
 * rects do not.
 */
function readAlerts(candidateWidths: readonly number[]): AlertsReading {
  const box = (el: Element | null | undefined): number => (el === null || el === undefined ? 0 : el.getBoundingClientRect().width);

  const list = document.querySelector<HTMLElement>('.hud-alerts__list');
  const corner = document.querySelector<HTMLElement>('.hud__corner');
  const rail = document.querySelector<HTMLElement>('.hud__rail');
  const panel = corner?.querySelector<HTMLElement>('.ui-panel') ?? null;
  if (list === null || corner === null || rail === null) throw new Error('the HUD corner is not on this page');

  const lineBoxesOf = (label: HTMLElement): number => {
    const range = document.createRange();
    range.selectNodeContents(label);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0.5 && rect.height > 0.5);
    // Rects on the same baseline are one line box: a label with an inline
    // child would otherwise be counted twice on the line they share.
    const tops = new Set(rects.map((rect) => Math.round(rect.top * 2) / 2));
    range.detach();
    return tops.size;
  };

  const rows: RowReading[] = [];
  for (const row of list.querySelectorAll<HTMLElement>('[data-alert]')) {
    const label = row.querySelector<HTMLElement>('.ui-row__label');
    if (label === null) continue;
    const rowStyle = getComputedStyle(row);
    const labelStyle = getComputedStyle(label);
    rows.push({
      selector: `[data-alert="${row.dataset['alert'] ?? '?'}"]`,
      dismissible: row.dataset['alertDismissible'] === 'true',
      rowWidth: Math.round(row.getBoundingClientRect().width * 100) / 100,
      rowHeight: Math.round(row.getBoundingClientRect().height * 100) / 100,
      labelClientWidth: label.clientWidth,
      labelScrollWidth: label.scrollWidth,
      labelHeight: Math.round(label.getBoundingClientRect().height * 100) / 100,
      labelLineBoxes: lineBoxesOf(label),
      labelLineHeight: Math.round(Number.parseFloat(labelStyle.lineHeight) * 100) / 100,
      labelText: (label.textContent ?? '').trim(),
      // `:scope >` matters: the dismiss control carries an icon of its own.
      iconWidth: Math.round(box(row.querySelector(':scope > .ui-icon')) * 100) / 100,
      badgeWidth: Math.round(box(row.querySelector('.ui-badge')) * 100) / 100,
      // The dismiss control -- `createIconButton`, whose own min-width is
      // `--tap-target`. Not the badge, and not the row (a row is only a
      // `button` when it is interactive, which these are not).
      actionWidth: Math.round(box(row.querySelector('.ui-icon-button')) * 100) / 100,
      gap: Math.round(Number.parseFloat(rowStyle.columnGap) * 100) / 100,
      paddingX:
        Math.round((Number.parseFloat(rowStyle.paddingLeft) + Number.parseFloat(rowStyle.paddingRight)) * 100) / 100,
    });
  }

  // The candidate sweep, in a clone of a real label so nothing about the type
  // is guessed at.
  const sample = list.querySelector<HTMLElement>('.ui-row--wrap .ui-row__label') ?? list.querySelector<HTMLElement>('.ui-row__label');
  const sentence = 'The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side.';
  const candidates: { labelWidth: number; lines: number; height: number }[] = [];
  if (sample !== null) {
    const probe = sample.cloneNode(false) as HTMLElement;
    probe.textContent = sentence;
    probe.style.flex = '0 0 auto';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    (sample.parentElement ?? list).append(probe);
    for (const width of candidateWidths) {
      probe.style.width = `${width}px`;
      candidates.push({
        labelWidth: width,
        lines: lineBoxesOf(probe),
        height: Math.round(probe.getBoundingClientRect().height * 100) / 100,
      });
    }
    probe.remove();
  }

  return {
    rows,
    listClientHeight: list.clientHeight,
    listScrollHeight: list.scrollHeight,
    listOverflowY: getComputedStyle(list).overflowY,
    cornerWidth: Math.round(corner.getBoundingClientRect().width * 100) / 100,
    cornerHeight: Math.round(corner.getBoundingClientRect().height * 100) / 100,
    panelWidth: Math.round(box(panel) * 100) / 100,
    railWidth: Math.round(rail.getBoundingClientRect().width * 100) / 100,
    railHeight: Math.round(rail.getBoundingClientRect().height * 100) / 100,
    rootWidth: document.documentElement.clientWidth,
    uiScale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
    candidates,
    sentence,
    sentenceLength: sentence.length,
  };
}

/*
 * 36, 61 and 88 are the label widths this codebase actually renders (the two
 * ends of the with-a-control range, and #720's figure); 160-400 are ADR 0085
 * §5 item 1's candidates; 216 is what the ADR's own 430px guardrail leaves for
 * the label once the measured 214px of corner around it is subtracted.
 */
const CANDIDATE_WIDTHS = [36, 61, 88, 160, 200, 216, 260, 320, 400] as const;

test.describe('1 and 2: the alerts row with a dismiss control, and what the corner would need', () => {
  test('the label width, the line count and the rail, at four viewports', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });

      // --- the geometry the fixtures on `main` cannot show: rows 0 and 1
      // carry `occurrences`, so they render the control; rows 2..7 do not.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate(
        (model) => window.lockstateUiHarness.setHudViewModel(model),
        hudModel(refusalRows(8, 2)),
      );
      await expect(page.locator('.hud-alerts__list [data-alert-dismissible="true"]')).toHaveCount(2);

      const mixed = await page.evaluate(readAlerts, [...CANDIDATE_WIDTHS]);
      const withControl = mixed.rows.find((row) => row.dismissible);
      const without = mixed.rows.find((row) => !row.dismissible);

      // The premise. Without this the numbers below could be two readings of
      // the same row shape, which is the failure ADR 0084 names.
      expect(withControl, `no dismissable row at ${width}x${height}`).toBeDefined();
      expect(without, `no plain row at ${width}x${height}`).toBeDefined();
      expect(withControl?.actionWidth ?? 0, 'the dismissable row drew no control').toBeGreaterThan(0);
      expect(without?.actionWidth ?? -1, 'the plain row drew a control it should not have').toBe(0);

      console.log(`\n=== ${width}x${height} — ui-harness, mounted HUD shell ===`);
      console.log(`--ui-scale=${mixed.uiScale} rootWidth=${mixed.rootWidth}`);
      console.log(
        `.hud__corner ${mixed.cornerWidth}px x ${mixed.cornerHeight}px | .hud__corner .ui-panel ${mixed.panelWidth}px | .hud__rail ${mixed.railWidth}px x ${mixed.railHeight}px`,
      );
      console.log(
        `.hud-alerts__list clientHeight=${mixed.listClientHeight} scrollHeight=${mixed.listScrollHeight} overflow-y=${mixed.listOverflowY}`,
      );
      console.log(`sentence: ${mixed.sentenceLength} characters`);
      for (const row of mixed.rows.slice(0, 3)) {
        console.log(
          `  ${row.selector} dismissible=${String(row.dismissible)} row=${row.rowWidth}x${row.rowHeight} ` +
            `label client/scroll=${row.labelClientWidth}/${row.labelScrollWidth} labelHeight=${row.labelHeight} ` +
            `lines=${row.labelLineBoxes} lineHeight=${row.labelLineHeight} icon=${row.iconWidth} badge=${row.badgeWidth} ` +
            `control=${row.actionWidth} gap=${row.gap} paddingX=${row.paddingX}`,
        );
        console.log(`      text: ${JSON.stringify(row.labelText)}`);
      }
      console.log(
        `  candidate label widths -> line boxes / rendered height: ` +
          mixed.candidates.map((c) => `${c.labelWidth}px:${c.lines} lines/${c.height}px`).join('  '),
      );

      // --- and the same list with every row dismissable, which is what the
      // channel's own producer actually emits.
      /*
       * **Remounted, and the reason is a finding in itself.**
       * `hud.ts` reuses a row by `id` and only ever *builds* the control
       * (`createListRow`'s `action`) in the branch that creates the row --
       * `setLabel`, `setBadge` and `setActionLabel` are all a reused row gets.
       * So updating the same eight ids from "no occurrences" to "occurrences"
       * left rows c..h with their labels updated and **no control**: the first
       * run of this block reported an info row at 113px in a list where every
       * row was supposed to carry one. Not reachable from the live producer --
       * `simulation-events.ts` gives a row `occurrences` from its first
       * arrival and the refusal rows never gain them -- but it is what a
       * measurement taken without a remount would have reported.
       */
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(8, 8)));
      const all = await page.evaluate(readAlerts, [...CANDIDATE_WIDTHS]);
      console.log(
        `  all-eight-dismissable: list clientHeight=${all.listClientHeight} scrollHeight=${all.listScrollHeight}`,
      );
      // Three rows, because the three severities draw three badge widths and
      // the label is the only flexible child -- so "the label with a control on
      // it" is a *range* and not one number, which ADR 0084's single figure
      // does not say.
      for (const row of all.rows.slice(0, 3)) {
        console.log(
          `    ${row.selector} label=${row.labelClientWidth} badge=${row.badgeWidth} control=${row.actionWidth}` +
            ` icon=${row.iconWidth} row=${row.rowHeight}px over ${row.labelLineBoxes} lines`,
        );
      }

      // --- one long alert alone, which is ADR 0084's "taller than the list box" claim.
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), hudModel(refusalRows(1, 1)));
      const single = await page.evaluate(readAlerts, [...CANDIDATE_WIDTHS]);
      const only = single.rows[0];
      console.log(
        `  one dismissable alert alone: row=${only?.rowHeight ?? 0}px in a list box of ${single.listClientHeight}px` +
          ` (scrollHeight ${single.listScrollHeight}), label ${only?.labelClientWidth ?? 0}px over ${only?.labelLineBoxes ?? 0} lines`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* 3 + 4: the strip's worst case, and the funds badge                  */
/* ------------------------------------------------------------------ */

interface StripReading {
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly contentWidth: number;
  readonly gap: number;
  readonly chips: readonly { readonly id: string; readonly width: number; readonly visible: boolean; readonly badge: string | null }[];
  readonly fullyVisible: number;
  readonly badges: readonly string[];
  readonly stripHeight: number;
  readonly fundsIndex: number;
  readonly fundsBadgeWidth: number | null;
  readonly fundsChipWidth: number | null;
  readonly fundsBadgeLines: number | null;
}

/**
 * The strip, chip by chip, with `funds` called out.
 *
 * `alternativeBadgeText` is written into the `funds` badge's text node before
 * the reading is taken, which is how a wording nobody has authored yet can be
 * measured without touching `src/`. The box is the same element with the same
 * class, the same padding and the same resolved font, so its width is the
 * width that wording would render at.
 */
function readStrip(alternativeBadgeText: string | null): StripReading {
  const strip = document.querySelector<HTMLElement>('.hud-strip');
  const row = document.querySelector<HTMLElement>('.hud-strip__metrics');
  if (strip === null || row === null) throw new Error('no status strip in the mounted HUD');

  const fundsChip = row.querySelector<HTMLElement>('[data-metric="funds"]');
  const fundsBadge = fundsChip?.querySelector<HTMLElement>('.ui-badge') ?? null;
  if (alternativeBadgeText !== null && fundsBadge !== null) fundsBadge.textContent = alternativeBadgeText;

  const rowBox = row.getBoundingClientRect();
  const gap = Number.parseFloat(getComputedStyle(row).columnGap);
  const chipEls = [...row.querySelectorAll<HTMLElement>('[data-metric]')];
  const chips = chipEls.map((chip) => {
    const chipBox = chip.getBoundingClientRect();
    return {
      id: chip.dataset['metric'] ?? '?',
      width: Math.round(chipBox.width * 100) / 100,
      visible: chipBox.left >= rowBox.left - 0.5 && chipBox.right <= rowBox.right + 0.5,
      badge: chip.querySelector<HTMLElement>('.ui-badge')?.textContent?.trim() ?? null,
    };
  });

  const lineBoxesOf = (el: HTMLElement): number => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set(
      [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => Math.round(r.top * 2) / 2),
    );
    range.detach();
    return tops.size;
  };

  return {
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
    contentWidth:
      Math.round(
        (chips.reduce((sum, chip) => sum + chip.width, 0) + Math.max(0, chips.length - 1) * gap) * 10,
      ) / 10,
    gap,
    chips,
    fullyVisible: chips.filter((chip) => chip.visible).length,
    badges: [...row.querySelectorAll<HTMLElement>('.ui-badge')].map((badge) => (badge.textContent ?? '').trim()),
    stripHeight: Math.round(strip.getBoundingClientRect().height * 100) / 100,
    fundsIndex: chips.findIndex((chip) => chip.id === 'funds'),
    fundsBadgeWidth: fundsBadge === null ? null : Math.round(fundsBadge.getBoundingClientRect().width * 100) / 100,
    fundsChipWidth: fundsChip === null ? null : Math.round(fundsChip.getBoundingClientRect().width * 100) / 100,
    fundsBadgeLines: fundsBadge === null ? null : lineBoxesOf(fundsBadge),
  };
}

/**
 * Remount, paint, read.
 *
 * **The remount is load-bearing and was found by a wrong reading.** `readStrip`
 * writes the candidate wording into the badge's own text node, and the HUD does
 * not rewrite a badge whose *view model* value has not changed — so a second
 * `setHudViewModel` left the mutated string in place and the next reading
 * appended to it. The first run of this block reported a 1,301px badge reading
 * `2,499 left before deliveries stop left before deliveries stop …`, seven
 * times over. `mountHudShell()` destroys the HUD and builds a new one, which is
 * the only thing here that guarantees the DOM is the view model's again.
 */
async function paintAndRead(page: Page, model: HudViewModel, alternativeBadgeText: string | null): Promise<StripReading> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate((viewModel) => window.lockstateUiHarness.setHudViewModel(viewModel), model);
  return page.evaluate(readStrip, alternativeBadgeText);
}

function report(at: string, what: string, reading: StripReading): void {
  console.log(`\n--- ${at} ${what} ---`);
  console.log(
    `row client/scroll = ${reading.clientWidth}/${reading.scrollWidth} | content ${reading.contentWidth} (gap ${reading.gap}) | strip height ${reading.stripHeight}`,
  );
  console.log(`badges: ${JSON.stringify(reading.badges)}`);
  console.log(
    `chips (${reading.fullyVisible} of ${reading.chips.length} fully on screen): ` +
      reading.chips
        .map((chip, index) => `${index + 1}.${chip.id}=${chip.width}${chip.visible ? '' : ' OFF'}${chip.badge === null ? '' : ` [${chip.badge}]`}`)
        .join('  '),
  );
  console.log(
    `funds is chip ${reading.fundsIndex + 1} of ${reading.chips.length}; chip ${String(reading.fundsChipWidth)}px, badge ${String(reading.fundsBadgeWidth)}px over ${String(reading.fundsBadgeLines)} line(s)`,
  );
}

/**
 * `POPULATED` with the treasury under the floor, so the FUNDS badge draws.
 *
 * `treasuryOverdraftFloorMinorUnits` is what makes the badge exist at all
 * (`ui-overdraft-badge.spec.ts`'s own fixture) — a first pass of this file left
 * it out and measured no badge at any viewport, which is the reading that
 * would have been reported as "the badge is not there".
 */
function overdrawn(base: HudCountsViewModel, balance: number): HudCountsViewModel {
  return {
    ...base,
    treasuryMinorUnits: balance,
    treasuryOverdraftFloorMinorUnits: TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  };
}

test.describe('3 and 4: the strip after #723, and the funds badge', () => {
  test('EVERY_BADGE chip by chip, and the FUNDS badge under both wordings', async ({ page }) => {
    await page.goto(HARNESS_URL);
    await page.waitForFunction(() => 'lockstateUiHarness' in window);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    for (const [width, height] of [
      [1280, 720],
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [900, 600],
    ] as const) {
      await page.setViewportSize({ width, height });
      const at = `${width}x${height}`;

      report(at, 'POPULATED (an ordinary prison)', await paintAndRead(page, hudModel([], POPULATED), null));

      const badged = await paintAndRead(page, hudModel([], EVERY_BADGE), null);
      // The premise: this really is the four-badge state #723 left behind.
      expect(badged.badges, `the four-badge state at ${at}`).toEqual([
        '36 with no bed',
        'Unguarded',
        'Gang Retaliation',
        'Currency',
      ]);
      report(at, 'EVERY_BADGE (post-#723 worst case)', badged);
    }

    /*
     * The FUNDS badge. Its own worst case is a *different* prison from
     * `EVERY_BADGE` — a chip cannot be at seven figures and below zero at
     * once, which is why `ui-strip-badged-width.spec.ts` leaves this state to
     * `ui-overdraft-badge.spec.ts`. Two balances, because the badge's width
     * follows its number: the shallowest remainder and the widest the floor
     * allows.
     */
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080],
      [900, 600],
    ] as const) {
      await page.setViewportSize({ width, height });
      // -1 renders the widest remainder the floor allows; the floor itself
      // renders the shortest (`0 left`).
      for (const balance of [-1, TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS]) {
        const model = hudModel([], overdrawn(POPULATED, balance));
        const incumbent = await paintAndRead(page, model, null);
        if (incumbent.fundsBadgeWidth === null) {
          console.log(`\n--- ${width}x${height} balance ${balance}: NO FUNDS BADGE DRAWN (no floor in this view model) ---`);
          continue;
        }
        report(`${width}x${height} balance ${balance}`, `incumbent "{remaining} left"`, incumbent);

        const remainder = incumbent.chips[incumbent.fundsIndex]?.badge?.replace(/ left$/, '') ?? '';
        const long = await paintAndRead(page, model, `${remainder} left before deliveries stop`);
        report(`${width}x${height} balance ${balance}`, `candidate "{remaining} left before deliveries stop"`, long);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2b: the same corner and rail on the assembled page                  */
/* ------------------------------------------------------------------ */

/**
 * `.hud__rail` measured where the application puts it, not where the harness
 * does.
 *
 * `hud.css:1604-1606` says the two differ and by how much: *"On the assembled
 * page — where `.hud__rail` also holds the save panel, which `ui-shell.spec.ts`'s
 * harness does not, so that harness hands this panel 128.7px more rail than the
 * application ever gives it."* That is a claim about the rail's **height**, and
 * ADR 0085 decision 1 is about its **width** — the two are not the same reading
 * and a width taken only in the harness would be quoted for a page that does
 * not exist. So it is taken in both.
 */
test.describe('2b: the corner and the rail on the assembled page', () => {
  test('.hud__rail and .hud__corner at four viewports, in the real application', async ({ page }) => {
    await openApp(page);

    for (const [width, height] of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const reading = await page.evaluate(() => {
        const read = (selector: string) => {
          const el = document.querySelector<HTMLElement>(selector);
          if (el === null) return null;
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            width: Math.round(box.width * 100) / 100,
            height: Math.round(box.height * 100) / 100,
            paddingX: Math.round((Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)) * 100) / 100,
            display: style.display,
          };
        };
        return {
          rail: read('.hud__rail'),
          corner: read('.hud__corner'),
          cornerPanel: read('.hud__corner .ui-panel'),
          savePanel: read('.hud__rail .save-panel'),
          world: Math.round(((document.documentElement.clientWidth) - (document.querySelector('.hud__rail')?.getBoundingClientRect().width ?? 0) - (document.querySelector('.hud__corner')?.getBoundingClientRect().width ?? 0)) * 100) / 100,
          viewportWidth: document.documentElement.clientWidth,
        };
      });
      console.log(`\n=== ${width}x${height} — assembled page (/index.html) ===`);
      console.log(JSON.stringify(reading));
      expect(reading.rail, `no .hud__rail on the assembled page at ${width}x${height}`).not.toBeNull();
    }
  });
});

/* ------------------------------------------------------------------ */
/* 5: ADR 0086 §2's prediction                                          */
/* ------------------------------------------------------------------ */

interface RosterPullWindow {
  lockstateRosterPulls?: number[];
  lockstateAllProjectionPulls?: { id: string; t: number }[];
}

/**
 * Records the page-clock time of every `simulation/request-projection` the
 * host posts to the worker, by projection id.
 *
 * The tee in `playtest-harness.ts` keeps the messages but not *when* they were
 * sent, and the whole of ADR 0086 §2's prediction is about when. This is the
 * same `Worker.prototype.postMessage` interception with a `performance.now()`
 * beside each message, installed as an init script so it is in place before
 * the application constructs its worker.
 */
async function installProjectionClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const roster: number[] = [];
    const all: { id: string; t: number }[] = [];
    (window as unknown as RosterPullWindow).lockstateRosterPulls = roster;
    (window as unknown as RosterPullWindow).lockstateAllProjectionPulls = all;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function patched(
      this: Worker,
      message: unknown,
      transfer?: Transferable[] | StructuredSerializeOptions,
    ): void {
      const envelope = message as { kind?: string; payload?: { projectionId?: string } };
      if (envelope?.kind === 'simulation/request-projection') {
        const id = envelope.payload?.projectionId ?? '?';
        const now = performance.now();
        all.push({ id, t: now });
        if (id === 'hud/prisoner-roster') roster.push(now);
      }
      if (transfer === undefined) original.call(this, message);
      else original.call(this, message, transfer as StructuredSerializeOptions);
    } as typeof Worker.prototype.postMessage;
  });
}

test.describe("5: ADR 0086 §2's browser prediction", () => {
  test('two admitted unhoused prisoners, Regime tab, clock ×1, 30 s of hud/prisoner-roster pulls', async ({
    page,
  }) => {
    await installProjectionClock(page);
    await installTee(page);
    await openApp(page);

    // `beds: 0` is the state the ADR names: two admitted, no bed, nobody
    // housed, so `occupiedPlaces === 0` and the counts channel has no
    // per-tick mover left in it.
    await buildAndPopulate(page, { beds: 0, admits: 2, guards: 0, label: 'adr0086' });

    // Clock ×1, which `buildAndPopulate` leaves at ×4.
    await page.getByRole('button', { name: 'Play at normal speed' }).click();
    await expect(page.locator('.hud-clock__speed')).toHaveText('×1');

    await tab(page, 'day-plan').click();
    await expect(page.locator('.hud-regime__roster')).toBeVisible();

    // Let the tab-select pull and anything it chains settle, then start the
    // window from a clean mark so the `select-tab` refresh is not counted as
    // part of the heartbeat's cadence.
    await page.waitForTimeout(2_000);
    // The row content at both ends of the window, because the prediction has
    // three parts and "visibly moving need bars" is the third. A count and a
    // gap say the request was made; only the painted row says the readout
    // changed.
    // `data-need-permille` and not the row's words: the need's *word* is a rung
    // and a rung need not move in thirty seconds, so reading the text alone
    // would answer "did the bar move" with "the label did not".
    const rowsNow = async (): Promise<readonly string[]> =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row:not([hidden])')].map(
          (node) =>
            `${node.dataset['prisoner'] ?? '?'} need=${node.dataset['need'] ?? '?'} permille=${node.dataset['needPermille'] ?? '?'} | ${(node.innerText ?? '').replace(/\s+/g, ' ').trim()}`,
        ),
      );
    const rowsAtStart = await rowsNow();
    const mark = await page.evaluate(() => {
      const pulls = (window as unknown as RosterPullWindow).lockstateRosterPulls ?? [];
      return { start: performance.now(), before: pulls.length };
    });

    await page.waitForTimeout(15_000);
    const rowsAtHalf = await rowsNow();
    await page.waitForTimeout(15_000);

    const window30 = await page.evaluate((started: number) => {
      const pulls = ((window as unknown as RosterPullWindow).lockstateRosterPulls ?? []).filter(
        (t) => t >= started && t <= started + 30_000,
      );
      const gaps: number[] = [];
      for (let index = 1; index < pulls.length; index += 1) gaps.push((pulls[index] ?? 0) - (pulls[index - 1] ?? 0));
      const all = (window as unknown as RosterPullWindow).lockstateAllProjectionPulls ?? [];
      const byId: Record<string, number> = {};
      for (const entry of all) {
        if (entry.t < started || entry.t > started + 30_000) continue;
        byId[entry.id] = (byId[entry.id] ?? 0) + 1;
      }
      const rows = [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row:not([hidden])')].map((node) => ({
        prisoner: node.dataset['prisoner'] ?? '?',
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
      }));
      return {
        requests: pulls.length,
        firstGap: gaps[0] ?? null,
        longestGap: gaps.length === 0 ? null : Math.round(Math.max(...gaps) * 100) / 100,
        shortestGap: gaps.length === 0 ? null : Math.round(Math.min(...gaps) * 100) / 100,
        medianGap:
          gaps.length === 0
            ? null
            : Math.round([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]! * 100) / 100,
        gapsOver260: gaps.filter((gap) => gap > 260).length,
        gapHistogram: gaps
          .map((gap) => Math.round(gap / 50) * 50)
          .reduce<Record<string, number>>((acc, bucket) => ({ ...acc, [bucket]: (acc[String(bucket)] ?? 0) + 1 }), {}),
        byProjection: byId,
        rosterTotal: document.querySelector('.hud-regime__roster')?.getAttribute('data-total') ?? null,
        rows,
      };
    }, mark.start);

    console.log(`\n=== ADR 0086 §2, measured in a real browser ===`);
    console.log(`pulls before the 30 s window opened: ${mark.before}`);
    console.log(`hud/prisoner-roster requests in 30 s: ${window30.requests}   (ADR 0086 §3 predicts ~118)`);
    console.log(
      `gaps: shortest ${String(window30.shortestGap)} ms, median ${String(window30.medianGap)} ms, longest ${String(window30.longestGap)} ms; ` +
        `${window30.gapsOver260} gap(s) above 260 ms   (ADR 0086 §3 predicts none)`,
    );
    console.log(`gap histogram (50 ms buckets): ${JSON.stringify(window30.gapHistogram)}`);
    console.log(`every projection pulled in the window: ${JSON.stringify(window30.byProjection)}`);
    console.log(`roster data-total=${String(window30.rosterTotal)}`);
    console.log(`rows at t=0:    ${JSON.stringify(rowsAtStart)}`);
    console.log(`rows at t=15s:  ${JSON.stringify(rowsAtHalf)}`);
    console.log(`rows at t=30s:  ${JSON.stringify(await rowsNow())}`);
    for (const row of window30.rows) console.log(`  row ${row.prisoner}: ${row.text}`);

    // The premise, and the only assertion: the measurement really was taken
    // on the state the ADR names. Whether it agrees with the prediction is
    // the finding, not the gate.
    expect(window30.rosterTotal, 'the roster is not the two-prisoner prison the ADR names').toBe('2');
    expect(window30.requests, 'nothing pulled the roster at all, so the window measured nothing').toBeGreaterThan(0);
  });
});
