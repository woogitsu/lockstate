import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  SIMULATION_PROTOCOL_VERSION,
  workerToMainMessageSchema,
  type SimulationEvent,
  type SimulationStatusCounts,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import type { HudAlertViewModel, HudCountsViewModel, HudEventNoticeViewModel, HudViewModel } from '../../src/ui/hud';
import { reportedCounts } from '../helpers/hud-counts';
import { hudEventAlertsFromWorkerMessage, hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { wallRoomPerimeter } from '../helpers/room-walls';
import { type Page, expect, test } from './network-changed-fixture';
import './ui-harness-api';

/**
 * **The name of the contraband a search found, on the screen** -- the owner's
 * ruling 3 on [#703](https://github.com/matmaxalez/lockstate/issues/703),
 * 2026-08-31: *"The message names what contraband was found."*
 *
 * The five `contraband.*.name` labels have been authored in
 * `src/content/contraband-catalog.ts` since issue #27 and until this change
 * nothing on screen read one: `grep -rn "contraband\.weapon\.name" src/ui/`
 * returned nothing, so a found phone and a found weapon both rendered as the
 * character `1`. After
 * [ADR 0080](../../docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md)
 * a weapon has a producer a player's own neglect reaches, which is what makes
 * that the difference between "somebody had a mobile" and "somebody is armed".
 *
 * ## Why a browser is required and `pnpm test` cannot cover this
 *
 * `tests/unit/ui-hud-projection.test.ts` proves the descriptor carries the
 * badge and `tests/integration/contraband-search-duty.test.ts` proves a real
 * prison publishes the key. Neither can reach the DOM: `vitest.config.ts` is
 * `environment: 'node'` with no jsdom, so `status-strip.ts` -- the module that
 * turns `HudMetricBadge` into an element, and the only place `createStatusBadge`
 * is actually *called* -- is not merely untested there, it is **unreachable**.
 *
 * `docs/TESTING.md` is explicit that `toContainText` does not imply visibility,
 * and that is how a defect hid in this repository before. So the assertions
 * below are a measured box and `offsetParent !== null`, not the presence of a
 * string in the document.
 *
 * ## The prison is real, and it is built in this process
 *
 * A Playwright spec runs in Node and may import `src/**`
 * (`ui-relocation-notice.spec.ts` and `app-shell.spec.ts` already do). So the
 * fixture is not a hand-written view model: it builds a prison with
 * `createNewSimulationRuntime`, walls and furnishes a cell, hires the four
 * guards a sweep needs a spare from, admits twelve prisoners, runs sixteen
 * in-game days until its own sector-search duty confiscates something, then
 * puts the result through the production projection, the production wire
 * schema and the production translator. Only the finished `HudViewModel`
 * crosses into the page -- which is exactly what `src/main.ts` puts there.
 *
 * **What is therefore not covered here** is the worker `postMessage` itself:
 * `workerToMainMessageSchema.parse` stands in for it, the same guard
 * `ui-relocation-notice.spec.ts` uses for the same reason.
 *
 * ## Two prisons, because the honest half of the rule needs one too
 *
 * A badge beside a count qualifies the whole count, so the projection names a
 * category only when every confiscation shares it. Seed `0xc` finds two items
 * and both are phones; seed `0x552` -- the contraband loop's own fixture seed
 * -- finds a drug and a phone, and must therefore show **no** badge rather
 * than pick one of them. Both are measured, because the second is the case
 * that would make the chip lie.
 *
 * ## And the width, because a prior ruling measured what the strip has left
 *
 * Issue #639 measured 0 of 8 chips visible at 768px, so a change that widens
 * the strip is not free. The layout probe is read in both states at the
 * desktop viewport this suite uses, and the numbers are asserted rather than
 * argued.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** `room.cell`'s authored minimum, and the rectangle the contraband loop uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out. */
const ORIGIN = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;
const SIXTEEN_DAYS = 2_400 * 16;

/** Two items, both `contraband.phone` -- so it fails if the rule degrades to "name the first thing found". */
const ONE_CATEGORY_SEED = 0xc;
/** A drug and a phone: no one word is true of the count. */
const MIXED_SEED = 0x552;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * The prison of `tests/integration/contraband-search-duty.test.ts`, kept in
 * step with it deliberately: four guards, twelve admissions spread out,
 * sixteen in-game days.
 *
 * **It was three until issue #996**, and the fourth hire is that change's
 * price rather than a fixture preference: two of the four stand the derived
 * sector's posts, the third is the reserve `claimableSearchGuardIds` withholds
 * for incident response, and the fourth is the spare a sweep is walked by.
 * With three this prison confiscates nothing at all and every assertion below
 * would be about an empty chip.
 */
function playedPrison(seed: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  stepTo(runtime, 200);
  for (let index = 0; index < 4; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
  }
  for (let index = 0; index < 12; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
    stepTo(runtime, runtime.kernel.tick + 40);
  }
  if (runtime.refusals.count > 0) throw new Error('A command this fixture depends on was refused.');
  stepTo(runtime, SIXTEEN_DAYS);
  return runtime;
}

/**
 * What the main thread would hold about a prison that has searched itself.
 *
 * The whole production chain: the projection reads the session, the wire
 * schema validates the publication, and the translator produces the counts.
 * Nothing here writes a key or a count by hand.
 */
function countsFor(seed: number): {
  readonly counts: HudCountsViewModel;
  readonly categories: readonly string[];
  /** The session itself, so a caller that also needs what it *announced* does not build a second prison for it (#703 ruling 13). */
  readonly runtime: SimulationRuntime;
} {
  const runtime = playedPrison(seed);
  const projected: SimulationStatusCounts = projectStatusStrip({
    tick: runtime.kernel.tick,
    prisoners: runtime.prisoners,
    rooms: runtime.prisoners,
    staff: runtime.securityGuards,
    incidents: runtime.incidents,
    searchSystem: runtime.searchSystem,
    confiscations: runtime.confiscations,
  }).counts;

  const message = workerToMainMessageSchema.parse({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: '00000000-0000-4000-8000-000000000703',
    kind: 'simulation/status-counts',
    payload: { tick: runtime.kernel.tick, schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION, counts: projected },
  }) as WorkerToMainMessage;

  // Through the shared narrowing helper since #1191 made the translator's
  // answer three-state: a row, `'none'` for a stopped session, `undefined` for
  // a message that said nothing.
  const counts = reportedCounts(message);
  return {
    counts,
    categories: [...new Set(runtime.confiscations.all().map((event) => event.categoryId))].sort(),
    runtime,
  };
}

function viewModelFor(counts: HudCountsViewModel): HudViewModel {
  return {
    counts,
    clock: { day: 17, tickOfDay: 0, dayLengthTicks: 2_400, mode: 'paused', speed: 1 },
    alerts: [],
  };
}

interface BadgeReading {
  /** `null` when the chip carries no badge element at all. */
  readonly text: string | null;
  readonly tone: string | null;
  /** `offsetParent !== null`: laid out, not merely in the document. */
  readonly onScreen: boolean;
  readonly width: number;
  readonly height: number;
  /** The chip's own number, so a badge cannot be read off the wrong chip. */
  readonly chipValue: string | null;
  /** The strip's rendered text, for the raw-key sweep. */
  readonly stripText: string;
  readonly stripHeight: number;
  readonly metricsScrollWidth: number;
  readonly metricsClientWidth: number;
}

async function showCounts(page: Page, counts: HudCountsViewModel): Promise<BadgeReading> {
  await page.evaluate((model) => {
    window.lockstateUiHarness.setHudViewModel(model);
  }, viewModelFor(counts));

  return page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('[data-metric="contraband"]');
    if (chip === null) throw new Error('no contraband chip in the mounted HUD');
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    if (strip === null) throw new Error('no status strip in the mounted HUD');
    const metrics = document.querySelector<HTMLElement>('.hud-strip__metrics');
    if (metrics === null) throw new Error('no metrics row in the mounted HUD');
    const badge = chip.querySelector<HTMLElement>('.ui-badge');
    const box = badge?.getBoundingClientRect();
    return {
      text: badge === null || badge === undefined ? null : (badge.textContent ?? ''),
      tone: badge?.dataset['tone'] ?? null,
      onScreen: badge !== null && badge !== undefined && badge.offsetParent !== null,
      width: box === undefined ? 0 : Math.round(box.width * 100) / 100,
      height: box === undefined ? 0 : Math.round(box.height * 100) / 100,
      chipValue: chip.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? null,
      stripText: strip.innerText,
      stripHeight: Math.round(strip.getBoundingClientRect().height * 100) / 100,
      metricsScrollWidth: metrics.scrollWidth,
      metricsClientWidth: metrics.clientWidth,
    };
  });
}

test.describe('the contraband chip names what was found (#703 ruling 3)', () => {
  // The desktop-first viewport the owner's standing directive puts first, and
  // the one the strip's other layout specs use.
  test.use({ viewport: { width: 1_280, height: 800 } });

  test('paints the found category as a laid-out word beside the count, and leaks no message key', async ({ page }) => {
    const named = countsFor(ONE_CATEGORY_SEED);
    const mixed = countsFor(MIXED_SEED);

    // The premise, asserted before anything is painted: these two prisons
    // really are the one-category and the mixed case. A run that stopped
    // finding what it found would fail here rather than make the DOM
    // assertions below vacuous.
    expect(named.categories, 'seed 0xc must confiscate one category for the named case to mean anything').toEqual([
      'contraband.phone',
    ]);
    expect(mixed.categories, 'seed 0x552 must confiscate two categories for the silent case to mean anything').toEqual([
      'contraband.drug',
      'contraband.phone',
    ]);
    expect(named.counts.contrabandFound).toBe(2);
    expect(mixed.counts.contrabandFound).toBe(2);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());

    // ---- nothing found: the chip is what it always was --------------------
    // The key is *removed* rather than set to `undefined`: `HudCountsViewModel`
    // declares it optional under `exactOptionalPropertyTypes`, and absent is
    // the only spelling of "no category to name" this HUD accepts -- the same
    // property the projection and the translator are both careful about.
    const { contrabandNameKey: _named, ...withoutName } = named.counts;
    const empty = await showCounts(page, { ...withoutName, contrabandFound: 0 });
    expect(empty.text, 'an empty prison drew a contraband badge').toBeNull();

    // ---- one category: the word is on screen -----------------------------
    const withName = await showCounts(page, named.counts);

    // The word itself, resolved by the real localizer out of the authored
    // catalog. Written out rather than looked up here: an expectation read
    // back through the same catalog the HUD reads would hold for any string
    // at all.
    expect(withName.text?.trim()).toBe('Phone');
    expect(withName.tone).toBe('warning');
    // Beside the right number, so the badge cannot have been read off another
    // chip: two items found, both phones.
    expect(withName.chipValue?.trim()).toBe('2');

    // **On screen, not merely in the DOM.** `docs/TESTING.md`: `toContainText`
    // does not imply visibility. A non-zero box and a non-null `offsetParent`
    // are the two facts that together mean a player can read it.
    expect(withName.onScreen, 'the badge is in the document but has no offsetParent, so nothing lays it out').toBe(true);
    expect(withName.width, 'the badge measured zero width, so the word is on screen only in the DOM sense').toBeGreaterThan(0);
    expect(withName.height, 'the badge measured zero height').toBeGreaterThan(0);

    // **No raw message key reaches the screen.** The failure mode this guards
    // is real and specific: `resolveLocalizationKey` falls back to the key
    // itself when a locale has no entry, so a mis-spelled or unauthored key
    // is painted as `contraband.phone.name` and every text assertion above
    // would still pass a `toContainText('Phone')`.
    expect(withName.stripText, 'a raw contraband key reached the screen').not.toContain('contraband.');
    expect(withName.stripText, 'a raw message key reached the screen').not.toContain('.name');
    expect(withName.stripText, 'the strip rendered an unsubstituted placeholder').not.toContain('{');
    expect(withName.stripText, 'the word is not in the strip text at all, so the reading above came from somewhere else').toContain(
      'Phone',
    );

    // ---- two categories: silence, not a guess ----------------------------
    const withMixed = await showCounts(page, mixed.counts);
    expect(
      withMixed.text,
      'a prison holding a confiscated drug and a confiscated phone put one of the two words on the chip, which is a claim about the other',
    ).toBeNull();
    expect(withMixed.chipValue?.trim()).toBe('2');
    expect(withMixed.stripText).not.toContain('Phone');
    expect(withMixed.stripText).not.toContain('Drugs');

    // ---- what the badge costs the strip, measured ------------------------
    /*
     * Issue #639 measured 0 of 8 chips visible at 768px, so width on this
     * strip is not free and this ruling must not be paid for with it.
     *
     * **The first version of this block asserted the wrong thing and the
     * browser said so, which is why the numbers are written down here.** It
     * asserted the metrics row must not scroll at 1280x800. Measured, with
     * `clientWidth` 1256 at that viewport:
     *
     * | state | `scrollWidth` |
     * | --- | --- |
     * | every count zero (badges "Covered" and "Clear") | 1256 -- fits exactly |
     * | this prison, no contraband name | **1264** |
     * | this prison, badge reading "Phone" | **1316** |
     *
     * So the row was already 8px past its client width *before* this change,
     * driven by an existing state-driven badge -- the Prisoners chip's "11
     * with no place" (issue #609). The assertion was false of `main`, not of the
     * badge. **That is a finding about the strip at desktop width and it is
     * handed over rather than fixed here**: eight chips plus their badges do
     * not fit 1280x800, and nothing in the repository measured that until this
     * spec.
     *
     * Swept across widths, with the badge on and off (`off` / `on`
     * `scrollWidth`/`clientWidth`):
     *
     * | viewport | off | on |
     * | --- | --- | --- |
     * | 1280 | 1264 / 1256 | 1316 / 1256 |
     * | 1366 | 1342 / 1342 | 1342 / 1342 |
     * | 1440 | 1416 / 1416 | 1416 / 1416 |
     * | 1600 | 1576 / 1576 | 1576 / 1576 |
     * | 1920 | 1522 / 1522 | 1522 / 1522 |
     *
     * **At 1366 and above the row fits with the badge and without it**, because
     * the chips have room to lay out; the whole cost is at 1280 and it is 52px
     * of scroll on a row that is `overflow-x: auto` by design. So what is
     * asserted below is what was measured rather than what would be nice:
     */

    // 1. **The badge costs its own width and nothing else.** This is the
    //    property that would break if the word made a chip re-lay-out, pushed
    //    a margin, or wrapped: the row would grow by more than the pill.
    expect(
      withName.metricsScrollWidth - withMixed.metricsScrollWidth,
      'the contraband badge cost the metrics row more than the badge itself measures, so it is not the pill that grew -- something re-laid out around it',
    ).toBeCloseTo(withName.width, 0);
    expect(withMixed.metricsScrollWidth, 'the silent case must cost exactly what no badge costs').toBe(
      empty.metricsScrollWidth,
    );

    // 2. **The strip does not get taller in any state.** A chip that grew
    //    enough to wrap would move every row under it, which is a layout
    //    change fired by a game state -- the objection
    //    `ui-occupancy-overflow.spec.ts` records about a bar that widens when
    //    the prison is in trouble.
    expect(withName.stripHeight, 'the badge made the status strip taller').toBe(empty.stripHeight);
    expect(withMixed.stripHeight, 'the strip height depends on whether a category could be named').toBe(empty.stripHeight);

    // 3. **At the desktop width the repository's own layout specs use, the row
    //    fits with the badge.** 1440x900 is #650's viewport. `scrollWidth ===
    //    clientWidth` is the row not scrolling at all, which is the claim.
    await page.setViewportSize({ width: 1_440, height: 900 });
    const wide = await showCounts(page, named.counts);
    expect(wide.text?.trim(), 'the badge stopped naming the category at a wider viewport').toBe('Phone');
    expect(
      wide.metricsScrollWidth,
      'eight chips and a contraband badge do not fit 1440x900, so this ruling was paid for in width after all',
    ).toBe(wide.metricsClientWidth);
    expect(wide.metricsClientWidth, 'the metrics row measured zero width, so the comparison above is vacuous').toBeGreaterThan(0);
  });
});

/**
 * **The alerts list says what a search found** -- the owner's **ruling 13** on
 * issue #703, 2026-08-31: the list gains *"Contraband found: {item}."*, at
 * severity `warning`, with a weapon in the same band as any other item.
 *
 * ## Why this is here rather than in `pnpm test`
 *
 * `tests/integration/contraband-search-duty.test.ts` and
 * `tests/unit/ui-simulation-events.test.ts` prove the whole main-thread chain
 * headlessly: a real prison emits the event, the wire schema accepts it, the
 * translator maps `categoryNameKey` onto `{item}`, and the localizer resolves
 * the pair to "Contraband found: Phone.". What they cannot reach is the DOM.
 * `vitest.config.ts` is `environment: 'node'` with no jsdom, so `hud.ts` -- the
 * module that turns a row into an element, and the **only** place
 * `resolveHudLabelParameters` is actually called for an alerts row -- is
 * unreachable from `pnpm test` rather than merely untested. A row the
 * translator describes perfectly and the list never paints would pass every
 * headless test in this repository, and so would one painted with `{item}`
 * still in it.
 *
 * That is not hypothetical for this sentence in particular: `{item}` is a
 * *message-valued* parameter, the third in the repository after ADR 0076's
 * `{room}`/`{name}`, and the mechanism that fills one in is a line in `hud.ts`
 * that nothing headless executes.
 *
 * ## The prison is real, and the alerts section is deliberately opened
 *
 * `playedPrison` above is the fixture the chip cases use, so the row under test
 * is a find a real sweep made rather than a hand-built payload; seed
 * `ONE_CATEGORY_SEED` is the two-phone prison. The events come off the
 * session's own `SimulationEventLog`, go through the production wire schema and
 * the production translator, and only the finished view model crosses into the
 * page -- which is what `src/main.ts` puts there.
 *
 * `alertProbe().texts` reads `textContent`, which is populated whether or not
 * the section is folded (the probe's own comment says so), so the text
 * assertions hold without opening it. The band is asserted beside the list
 * because it is the surface laid out at every viewport, and because it is a
 * *second* call site for the same nested parameter: one filled in for the band
 * and not for the row would put "Contraband found: {item}." in the log alone.
 */
test.describe('the alerts list says what a search found (#703 ruling 13)', () => {
  test.use({ viewport: { width: 1_280, height: 800 } });

  test('paints the sentence with the found item`s own word in it, at warning, and leaks no key', async ({ page }) => {
    const { counts, runtime } = countsFor(ONE_CATEGORY_SEED);
    const discoveries = runtime.events
      .since(0)
      .filter((event): event is Extract<SimulationEvent, { type: 'contraband.discovered' }> => event.type === 'contraband.discovered');
    // The premise: this prison really found something, and it really is a
    // phone, so the word below is the catalog's answer rather than a constant.
    expect(discoveries.length, 'the fixture prison announced no contraband discovery to paint').toBeGreaterThan(0);
    expect([...new Set(discoveries.map((event) => event.categoryNameKey))]).toEqual(['contraband.phone.name']);

    const publications = discoveries.map(
      (event) =>
        workerToMainMessageSchema.parse({
          protocolVersion: SIMULATION_PROTOCOL_VERSION,
          messageId: '00000000-0000-4000-8000-000000000713',
          kind: 'simulation/event',
          payload: { tick: event.tick + 1, event },
        }) as WorkerToMainMessage,
    );

    let alerts: readonly HudAlertViewModel[] = [];
    let notice: HudEventNoticeViewModel | undefined;
    for (const message of publications) {
      alerts = hudEventAlertsFromWorkerMessage(message, alerts) ?? alerts;
      const next = hudEventNoticeFromWorkerMessage(message);
      if (next !== undefined && next !== 'none') notice = next;
    }
    if (notice === undefined) throw new Error('the band was given nothing to say');
    /*
     * **One row, however many finds of the same category there were.**
     *
     * This read `expect(alerts.length).toBe(discoveries.length)` until the
     * owner's decisions of 2026-09-01 on
     * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md),
     * and it was measuring the right thing at the time: every discovery reaches
     * the list. It still does -- what changed is that discoveries saying the
     * *same sentence* are one row that counts them, so the assertion is now on
     * the count rather than on the row tally. Both directions are checked, so a
     * find that went missing entirely still fails here.
     */
    expect(alerts.length, 'one sentence, one row').toBe(1);
    expect(alerts[0]?.occurrences?.count, 'and every discovery is counted on it').toBe(discoveries.length);

    await page.goto(HARNESS_URL);
    await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
    await page.evaluate(
      (model) => {
        window.lockstateUiHarness.setHudViewModel(model);
      },
      { ...viewModelFor(counts), alerts: [...alerts], event: notice } satisfies HudViewModel,
    );

    const probe = await page.evaluate(() => window.lockstateUiHarness.alertProbe());
    expect(probe.order, 'the discoveries must reach the alerts list').toEqual(alerts.map((row) => row.id));
    for (const text of probe.texts) {
      // `textContent` runs the row's label and its severity badge together with
      // no separator, which is why this contains rather than equals.
      expect(text, 'the sentence the owner ruled on, whole').toContain('Contraband found: Phone.');
      expect(text, 'an unfilled placeholder is what a nested parameter fails as').not.toContain('{');
      expect(text, 'a key that resolves to itself is what an unauthored sentence looks like').not.toContain('hud.alert.event');
    }

    // The band, which is the same sentence through a second call site, plus the
    // grade: ruling 13 puts every category in one band, so this is `warning`
    // for a phone and would be `warning` for a weapon.
    const band = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('.hud__event');
      if (element === null) throw new Error('the mounted HUD has no events band');
      const box = element.getBoundingClientRect();
      return {
        text: element.textContent,
        severity: element.dataset['severity'] ?? null,
        hidden: element.hidden === true,
        onScreen: element.offsetParent !== null,
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
      };
    });

    expect(band.text).toBe('Contraband found: Phone.');
    expect(band.severity, 'ruling 13: warning, and a weapon is not louder').toBe('warning');
    expect(band.hidden, 'the band was left hidden, so the sentence is in the page and on nobody`s screen').toBe(false);
    expect(band.onScreen, 'the band has no offset parent: it is inside something that is not displayed').toBe(true);
    expect(band.width, 'the band measured zero width').toBeGreaterThan(0);
    expect(band.height, 'the band measured zero height').toBeGreaterThan(0);
  });
});
