import { type Page, expect, test } from './network-changed-fixture';
import type { HudViewModel } from '../../src/ui/hud';
import './ui-harness-api'; // pulls in the `Window.lockstateUiHarness` global augmentation

/**
 * **Every operational control is still reachable after the navigation move**
 * (issue [#1161](https://github.com/matmaxalez/lockstate/issues/1161), stage 5
 * of the 2026-09-13 identity rollout, epic #1155).
 *
 * ## The claim this file exists to settle
 *
 * `docs/IDENTITY_V5_ROLLOUT.md` stage 5: *"Staff, intake, schedule,
 * deliveries, security, contraband and incidents keep full function."* Issue
 * #1161's exit criterion states the same thing in the form a test can hold:
 * *"No command that was issuable before is unreachable after."*
 *
 * Seven of the seventeen commands in `src/simulation/protocol/commands.ts` are
 * issued from the surfaces this file covers -- `AdmitPrisoner`, `HireStaff`,
 * `DismissStaff`, `ReleaseGuardAssignment`, `PurchaseMaterials`,
 * `SellMaterials` and `CancelMaterialPurchase` -- and on 2026-09-14 four of
 * them changed which tab they are behind. The two panels that carry them are
 * now laid out **together**, which no tab had ever done before that day:
 * `hud.ts`'s `.hud__side` comment records it, and
 * `tests/browser/ui-shell.spec.ts`'s rail-slot test pins that Manage is the tab
 * where it happens.
 *
 * ## Why laid out and enabled is not the assertion
 *
 * This repository has shipped a control that was present, enabled, aimed at the
 * right entity and impossible for a player to press, four separate times
 * (#220, #285, #703, #912). Two panels sharing one bottom-anchored flex column
 * is exactly the arrangement that produces a fifth, because the height one
 * panel takes is height the other does not get. So each control here is put
 * through three questions and not one:
 *
 * 1. **Does the browser give it a box**, by `getClientRects()` rather than by
 *    the `hidden` attribute -- `hud.css` gives several of these blocks an
 *    author `display`, which beats the user agent's `[hidden] { display: none }`.
 * 2. **Can a player get to it** -- either its box is already inside its panel's
 *    client box, or the panel is a scroll container that can bring it there.
 *    A control below the fold of a panel that cannot scroll is not reachable,
 *    and that is `ui-staff-payroll-reachable.spec.ts`'s finding restated for a
 *    column that now holds two panels.
 * 3. **Is the press the player's** -- `elementFromPoint` at the control's own
 *    centre, once it has been brought into view, has to answer the control or
 *    something inside it. Anything else means a second layer is over it, which
 *    is #88's question and the one the tab bar has failed before.
 *
 * ## Three device widths, and a fourth viewport that is not one
 *
 * `hud-layout-shell.spec.ts` names the three tiers the delivery's
 * `DOKUMENTACJA/03-INTERAKCJE-I-URZADZENIA.md` distinguishes, and this file
 * uses the same three so the two agree: 1440x900, 1024x768, 375x812.
 *
 * **900x600 is a fourth entry and it is not a tier** -- it is the shortest rail
 * in the browser suite, the viewport `hud.css`'s `max-height: 700px` block
 * exists for, and the one where the Intake panel came out 42px shorter than its
 * own content on the day it moved (`.hud-intake`'s docblock in `hud.css`).
 * A stage that promises nothing was lost cannot skip the viewport where the
 * loss was measured.
 *
 * ## What was watched going red
 *
 * Four mutations of production code, each reverted by hand before the next and
 * the file checked with `git diff --stat` before re-running. Baseline:
 * `12 passed`.
 *
 * | mutation | result |
 * | --- | --- |
 * | `.ui-panel.hud-intake { flex: 0 0 auto }` -> `flex: 0 1 auto` in `hud.css` | **2 failed** -- "the Intake panel never has to scroll" at 900x600 and 375x812 |
 * | `.ui-panel.hud-staff`'s `overflow-y: auto` -> `hidden` | **3 failed** -- every viewport whose rail is shorter than the Staff panel's content |
 * | `intakePanel.setVisible(state.activeTab === 'manage')` -> `'overview'` in `hud.ts` | **6 failed** |
 * | `if (activeTab === 'manage') refreshIntakePipeline();` -> `'overview'` in `main.ts` | **0 failed** -- survivor, and reported rather than covered: this file drives the panel through the harness, which publishes to the panel directly and never goes through `src/main.ts`'s gate. `tests/unit/main-projection-gates.test.ts` is where that literal belongs. |
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/**
 * The three device tiers, plus the shortest rail the suite visits.
 *
 * Named rather than swept, so a failure message says which of the four it is
 * and a reader knows immediately whether they are looking at a tier problem or
 * a height problem.
 */
const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['tablet', 1024, 768],
  ['phone', 375, 812],
  ['short rail', 900, 600],
] as const;

/**
 * A prison under pressure, in one view model.
 *
 * One `setHudViewModel` rather than the harness's per-block `report*` helpers,
 * and that is load-bearing rather than tidy: each of those helpers publishes
 * `{ ...BASE_VIEW_MODEL, <its one block> }` (`ui-harness.ts`), so calling two
 * of them in a row leaves only the second block standing. The whole point of
 * this file is the two panels being full **at the same time**, which no
 * sequence of those calls can produce.
 *
 * Every figure is chosen to make a block as tall as that block can be, because
 * the tallest version is the one the rail has to afford:
 *
 * - `heldGuards` at five held with three rows drawn is the window plus the
 *   "and 2 more" line (`ui-held-guards.spec.ts` uses the same shape for the
 *   same reason).
 * - `staffRoster` at nine hired with three rows is the roster window plus its
 *   own overflow line, and `hired > 0` is what makes `paintRoster` draw the
 *   block at all (`staff-panel.ts:1561`).
 * - `intakePipeline` holds three stage lines **and** the over-admission
 *   warning (`waitingWithoutPlace > 0`, issue #549), which is the tallest the
 *   Intake panel can be: `INTAKE_STAGES` bounds it and nothing else does.
 * - `staffCoverage` short by two draws the consequence sentence under the
 *   summary rather than the one-line green form.
 */
function busyPrison(): HudViewModel {
  return {
    counts: {
      prisoners: 12,
      prisonerCapacity: 8,
      occupiedPlaces: 8,
      staff: 9,
      staffUnassigned: 3,
      rooms: 3,
      prisonersCovered: 4,
      prisonersUnderstaffed: 5,
      prisonersUnguarded: 3,
      prisonersHighRisk: 2,
      activeIncidents: 1,
      contrabandFound: 2,
      treasuryMinorUnits: 25_000,
      stateIncomeAccruedTodayMinorUnits: 1_200,
      dailyWageBillMinorUnits: 4_800,
    },
    clock: { day: 9, tickOfDay: 600, dayLengthTicks: 2_400, mode: 'running', speed: 1 },
    alerts: [],
    heldGuards: {
      held: 5,
      unassigned: 3,
      guards: [
        { entityId: 0, claimLabelKey: 'guard-claim.incident-response.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 1, claimLabelKey: 'guard-claim.search.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 2, claimLabelKey: 'guard-claim.deployment.name', roleLabelKey: 'staff-role.guard.name' },
      ],
    },
    staffCoverage: { required: 6, assigned: 4, shortage: 2 },
    staffRoster: {
      hired: 9,
      staff: [
        { entityId: 7, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 8, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
        { entityId: 9, statusLabelKey: 'deployment-phase.unassigned.name', roleLabelKey: 'staff-role.guard.name' },
      ],
    },
    intakePipeline: {
      waiting: 4,
      failed: 1,
      total: 12,
      waitingWithoutPlace: 4,
      stages: [
        { stageId: 'arrival', labelKey: 'intake-stage.arrival.name', count: 2 },
        { stageId: 'registration', labelKey: 'intake-stage.registration.name', count: 1 },
        { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 1 },
      ],
    },
  };
}

/** One control, read the way a player meets it rather than the way the DOM holds it. */
interface ControlReading {
  /** The control's own rendered words, which is the only name a player has for it. */
  readonly label: string;
  /** Which panel of `.hud__side` it belongs to. */
  readonly panel: string;
  /** The DOM property. `true` removes the press. */
  readonly disabled: boolean;
  /** Whether the browser laid the control out at all. */
  readonly laidOut: boolean;
  /**
   * Whether the control's box lies inside its panel's client box **after** the
   * panel has been asked to bring it into view. False here means the panel
   * could not: either it does not scroll, or the control is not in its scroll
   * flow.
   */
  readonly reachable: boolean;
  /** `elementFromPoint` at the control's centre answers the control or a child of it. */
  readonly ownsItsCentre: boolean;
  /** What answered instead, so a failure names the layer that is over the control. */
  readonly coveredBy: string;
}

/**
 * Every control inside `.hud__side`, brought into view and then hit-tested.
 *
 * The scroll is `scrollIntoView({ block: 'nearest' })`, which is the gesture
 * `app-shell.spec.ts`'s `controlReachability` makes and the one a player makes
 * with a finger or a wheel. Doing it before the hit test is what separates the
 * two failures this file has to tell apart: *below the fold of a panel that can
 * scroll* is reachable, *covered by another layer* is not.
 */
async function railControls(page: Page): Promise<readonly ControlReading[]> {
  return page.evaluate(() => {
    const side = document.querySelector<HTMLElement>('.hud__side');
    if (side === null) return [];
    const readings: ControlReading[] = [];
    for (const child of [...side.children]) {
      const panel = child as HTMLElement;
      if (!panel.classList.contains('ui-panel')) continue;
      if (panel.getClientRects().length === 0) continue;
      const panelName = [...panel.classList].find((name) => name.startsWith('hud-')) ?? panel.className;
      for (const control of panel.querySelectorAll<HTMLElement>('button')) {
        const laidOut = control.getClientRects().length > 0;
        if (!laidOut) continue;
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const box = control.getBoundingClientRect();
        const fold = panel.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        readings.push({
          label: (control.textContent ?? '').trim(),
          panel: panelName,
          disabled: (control as HTMLButtonElement).disabled,
          laidOut,
          reachable: box.top >= fold.top - 1 && box.bottom <= fold.bottom + 1,
          ownsItsCentre: hit !== null && (control === hit || control.contains(hit)),
          coveredBy: hit === null ? 'nothing' : ((hit as HTMLElement).closest('[class]')?.className ?? hit.nodeName),
        });
      }
    }
    return readings;
  });
}

/** Opens every folded section in the rail, which is the gesture that reveals a windowed list. */
async function openEveryFold(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const header of document.querySelectorAll<HTMLElement>(
      '.hud__side .ui-section__header[aria-expanded="false"]',
    )) {
      header.click();
    }
  });
}

async function openManage(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('manage'))).toBe(true);
  await page.evaluate((model) => window.lockstateUiHarness.setHudViewModel(model), busyPrison());
  await openEveryFold(page);
}

const intents = (page: Page): Promise<readonly string[]> =>
  page.evaluate(() => window.lockstateUiHarness.hudIntents());

test.describe('the operational surfaces after the navigation move (#1161)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  for (const [tier, width, height] of VIEWPORTS) {
    test(`every control on Manage is pressable at ${tier} (${String(width)}x${String(height)})`, async ({ page }) => {
      await openManage(page, width, height);
      const controls = await railControls(page);
      const where = `${tier} ${String(width)}x${String(height)}`;

      /*
       * The two panels are both there. Asserted as a set of panel names rather
       * than as a count, so a run where the Staff panel silently took the
       * Intake panel's place reads as a different failure from one where a
       * third panel appeared.
       */
      expect(new Set(controls.map((control) => control.panel)), `panels laid out at ${where}`).toEqual(
        new Set(['hud-intake', 'hud-staff']),
      );

      /*
       * The eleven controls the Manage tab carries, named by the words a player
       * reads. `Collapse` is each panel's own disclosure and belongs to the
       * shell rather than to this stage, so it is excluded by name rather than
       * by a pattern -- a control that stopped being a command control would
       * otherwise vanish from this list silently.
       */
      const commandControls = controls.filter((control) => control.label !== 'Collapse');
      expect(commandControls.map((control) => control.label).join(' | '), `controls at ${where}`).toBe(
        [
          'Admit a prisoner',
          'Who to hire',
          'GuardSelected',
          'Hire Guard · 80',
          'Release',
          'Release',
          'Release',
          'On the payroll4,800 a day',
          'Dismiss',
          'Dismiss',
          'Dismiss',
        ].join(' | '),
      );

      for (const control of commandControls) {
        expect(control.disabled, `"${control.label}" is disabled at ${where}`).toBe(false);
        expect(
          control.reachable,
          `"${control.label}" in .${control.panel} cannot be brought inside its panel at ${where}`,
        ).toBe(true);
        expect(
          control.ownsItsCentre,
          `"${control.label}" in .${control.panel} is covered by ${control.coveredBy} at ${where}`,
        ).toBe(true);
      }
    });
  }

  /**
   * The rule the 2026-09-14 move wrote into `hud.css` beside `.hud-intake`, as
   * an assertion rather than as prose: **this panel never has to scroll**. It
   * is the panel whose height is bounded by `INTAKE_STAGES`, so it is the one
   * that keeps its natural height while the Staff panel -- whose height grows
   * with a roster, and which already scrolls -- gives way.
   *
   * A player pressing Admit must be able to read how many arrivals have
   * nowhere to sleep without scrolling for it, which is why the warning line
   * is asserted on screen here and not merely present.
   */
  for (const [tier, width, height] of VIEWPORTS) {
    test(`the Intake panel pays for its own content at ${tier} (${String(width)}x${String(height)})`, async ({
      page,
    }) => {
      await openManage(page, width, height);
      const where = `${tier} ${String(width)}x${String(height)}`;
      const intake = await page.evaluate(() => window.lockstateUiHarness.intakeProbe());

      expect(intake.laidOut, `the Intake panel has no box at ${where}`).toBe(true);
      expect(intake.panelOverflow, `the Intake panel is shorter than its content at ${where}`).toBe(0);
      expect(intake.bodyOverflow, `the Intake panel's body is shorter than its content at ${where}`).toBe(0);
      // The tallest thing it draws, on screen rather than merely in the DOM.
      expect(intake.noPlaceBox, `the over-admission warning has no box at ${where}`).not.toBeNull();
      expect(intake.pipelineBox, `the arrivals readout has no box at ${where}`).not.toBeNull();
      expect(intake.pipelineStages.length, `stage lines drawn at ${where}`).toBe(3);
    });
  }

  /**
   * And the other half of that decision: the Staff panel is the one that gives
   * way, so wherever the rail cannot afford both it has to be **able** to. A
   * panel that is shorter than its content and does not scroll is where every
   * control below its fold goes.
   */
  test('the Staff panel scrolls wherever the rail cannot afford it whole', async ({ page }) => {
    const readings: string[] = [];
    for (const [tier, width, height] of VIEWPORTS) {
      await openManage(page, width, height);
      const staff = await page.evaluate(() => window.lockstateUiHarness.staffProbe());
      readings.push(`${tier}: overflow ${String(staff.panelOverflow)}`);
      if (staff.panelOverflow > 0) {
        const scrolls = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('.hud-staff');
          return panel === null ? '' : getComputedStyle(panel).overflowY;
        });
        expect(scrolls, `the Staff panel is ${String(staff.panelOverflow)}px short at ${tier} and does not scroll`).toBe(
          'auto',
        );
      }
    }
    // Recorded in the message of a passing assertion so the four figures are in
    // the run log rather than only in a document that can go stale.
    expect(readings.length, readings.join(' / ')).toBe(4);
  });

  /**
   * Wiring, not geometry: each press still raises the intent that names it.
   *
   * A panel can move tab, keep every pixel, and arrive with its handler bound
   * to a closure the new mount never runs. Nothing above would catch that, and
   * it is the failure a mount move makes most easily.
   */
  test('each press on Manage still raises the intent it names', async ({ page }) => {
    await openManage(page, 1440, 900);

    expect(await page.evaluate(() => window.lockstateUiHarness.clickAdmitPrisoner())).toBe(true);
    expect(await page.evaluate(() => window.lockstateUiHarness.clickHireStaff())).toBe(true);
    expect(await page.evaluate(() => window.lockstateUiHarness.pressGuardRelease(1))).toBe(true);

    /*
     * `hudIntents()` returns each intent as the JSON the harness stringified,
     * so the assertion is on the `kind` each press produced -- and on the
     * payload where the press names somebody, because a release aimed at the
     * wrong guard is the defect #912 is about and a bare `kind` cannot see it.
     */
    const raised = (await intents(page)).map((intent) => JSON.parse(intent) as { readonly kind: string });
    expect(raised.map((intent) => intent.kind)).toEqual([
      'select-tab',
      'admit-prisoner',
      'hire-staff',
      'release-guard',
    ]);
    expect(JSON.parse((await intents(page))[3]!)).toEqual({ kind: 'release-guard', guardId: 1 });
  });

  /**
   * The two surfaces the owner's second ruling of 2026-09-14 left on Buduj --
   * *"Buduj"* against Zarządzaj for materials and deliveries. Stage 5 names
   * deliveries among the things that keep full function, so the ruling being
   * honoured is not the same claim as the controls being reachable, and this is
   * the second.
   */
  for (const [tier, width, height] of VIEWPORTS) {
    test(`materials and deliveries are still on Build and pressable at ${tier}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
      expect(await page.evaluate(() => window.lockstateUiHarness.clickTab('build'))).toBe(true);
      await page.evaluate(() =>
        window.lockstateUiHarness.reportPendingDeliveries({
          total: 2,
          refundableMinorUnits: 640,
          deliveries: [
            { orderId: 'delivery-1', labelKey: 'material.brick.name', quantity: 4, paidMinorUnits: 320 },
            { orderId: 'delivery-2', labelKey: 'material.timber.name', quantity: 4, paidMinorUnits: 320 },
          ],
        }),
      );
      await openEveryFold(page);

      const where = `${tier} ${String(width)}x${String(height)}`;
      const controls = await railControls(page);
      expect(new Set(controls.map((control) => control.panel)), `panels laid out at ${where}`).toEqual(
        new Set(['hud-build']),
      );

      // The buy control, and the delivery rows the ruling kept beside it.
      const named = (label: string): readonly ControlReading[] =>
        controls.filter((control) => control.label === label);
      expect(named('Buy').length, `the Buy control at ${where}`).toBe(1);
      expect(named('Cancel').length, `delivery cancel controls at ${where}`).toBeGreaterThanOrEqual(2);

      for (const control of [...named('Buy'), ...named('Cancel')]) {
        expect(
          control.reachable,
          `"${control.label}" cannot be brought inside the Build panel at ${where}`,
        ).toBe(true);
        expect(control.ownsItsCentre, `"${control.label}" is covered by ${control.coveredBy} at ${where}`).toBe(true);
      }
    });
  }
});
