import { describe, expect, it } from 'vitest';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization';
import { projectPrisonerPopulationCounts } from '../../src/simulation/presentation/prisoner-projection';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud';
import { formatIntakeWithoutPlaceText, isIntakeWithoutPlaceWorthShowing } from '../../src/ui/hud/intake-panel';
import { intakePipelineFromProjection } from '../../src/ui/simulation-intake';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A prison with one bed takes twelve prisoners, and the Intake panel now says
 * so** (issue #549).
 *
 * ## The measurement this file reproduces
 *
 * The issue was found by playing, with a mouse: a walled box zoned `room.cell`
 * with one bed in it, and then twelve presses of *Admit a prisoner*. All twelve
 * were accepted, no refusal was ever shown, the admit control never disabled,
 * and the state grant was paid on every one of them. Eleven of the twelve then
 * sat at Cell Assignment indefinitely while the only sentence on screen that
 * mentioned accommodation said *"A prisoner can only be admitted into a prison
 * that has a room to hold them."*
 *
 * Every step below goes through the real kernel, the real command decoder and
 * the real projection, and ends at the sentence the panel puts on screen,
 * resolved through the bundled `en` catalog -- the shape
 * `prisoner-roster-readout.test.ts` established. Nothing here calls
 * `admitPrisoner` or `RoomInstanceRegistry.register` by hand, because a fixture
 * that did would prove the counter works and say nothing about whether a player
 * can reach the state it counts.
 *
 * ## What is deliberately *not* being fixed
 *
 * The admission is still accepted. That is the owner's decision on #549 and it
 * is a playability one rather than an oversight: an arrival with no
 * accommodation is the term that pushes a sector's needs pressure past
 * `DEFAULT_SECTOR_RISK_POLICY`'s `hotThreshold`, so over-admission is the
 * ordinary route into the incident content, and refusing it would close the
 * route. `records no refusal` below pins the acceptance rather than leaving it
 * to be quietly changed by a later reading of the same issue.
 *
 * ## The assertion that would have caught the defect, and the one that would not
 *
 * "Eleven are at Cell Assignment" was already true before this change, and the
 * panel already displayed it. An assertion written to that would have certified
 * the defect. What a player could not find out is whether the prison had
 * anywhere to *put* those eleven, and that is what every expectation below is
 * written to -- including `a prison with a bed to spare warns about nobody`,
 * which fails for any implementation that reports the stage count.
 */

const SEED = 0x549;
const CELL = 'room.cell';
/** `room.cell`'s authored minimum, and the smallest rectangle zoning accepts for one. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** Two 1x2 bed footprints that both lie wholly inside `CELL_RECT` and share no tile. */
const BED_TILES = [
  { x: 4, y: 6 },
  { x: 5, y: 6 },
] as const;
/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** What one press of the Intake panel's control asks for (`ADMISSION_REQUEST` in `src/main.ts`), plus a fixed sentence so the timings here do not move with a draw. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 };

const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * A zoned cell with `beds` finished beds in it, reached the way a player
 * reaches one: buy the planks, wall and zone the rectangle, order the objects,
 * and wait for the deliveries and the build.
 *
 * The planks are bought first because `ProcurementSystem` delivers after a
 * delay and an object order against an empty container simply waits, which
 * would make the wait two deliveries long instead of one.
 */
function prisonWithBeds(beds: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(
    runtime,
    'buy-planks',
    packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: beds }),
  );
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  for (let index = 0; index < beds; index += 1) {
    submit(
      runtime,
      `place-bed-${String(index)}`,
      packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', ...BED_TILES[index]! }),
    );
  }
  stepTo(runtime, 400);
  return runtime;
}

function admit(runtime: SimulationRuntime, ordinal: number): void {
  submit(runtime, `admit-${String(ordinal)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
}

function stageCount(runtime: SimulationRuntime, stage: string): number {
  return projectPrisonerPopulationCounts(runtime.prisoners).byIntakeStage.find((entry) => entry.intakeStage === stage)
    ?.count ?? 0;
}

/** How many beds the prison offers an arrival, read from the projection the status strip publishes. */
function accommodationCapacity(runtime: SimulationRuntime): number {
  return projectStatusStrip({ tick: runtime.kernel.tick, prisoners: runtime.prisoners, rooms: runtime.prisoners }).counts
    .accommodationCapacity;
}

describe('twelve admissions into a one-bed cell (issue #549)', () => {
  it('accepts every one of them, houses one, and counts the other eleven as having no bed', () => {
    const runtime = prisonWithBeds(1);
    // One bed is one place. Stated before the admissions, because every figure
    // below is a statement about the difference between this number and twelve.
    expect(accommodationCapacity(runtime), 'a cell with one bed offers one place').toBe(1);

    for (let ordinal = 1; ordinal <= 12; ordinal += 1) admit(runtime, ordinal);

    // Accepted, all twelve, and this is deliberate -- see the file header. A
    // refusal here would be the *other* fix to #549, which was considered and
    // declined because it closes the route into the incident content.
    expect(runtime.refusals.count, 'no admission is refused above capacity').toBe(0);
    expect(runtime.prisoners.entityStore.maxActiveIndex, 'twelve prisoners exist').toBe(11);

    // Long enough for every arrival to pass queued, reception and
    // classification and be offered the cell: `IntakeSystem` advances one stage
    // per prisoner per scheduled tick, every five ticks.
    stepTo(runtime, 500);

    const counts = projectPrisonerPopulationCounts(runtime.prisoners);
    expect(counts.total).toBe(12);
    // The state the issue photographed: one housed, eleven at Cell Assignment,
    // nobody in the terminal stage. `failed` is zero because the prison *does*
    // hold a cell -- the arrivals are waiting, not stranded.
    expect(counts.byIntakeStage).toEqual([
      { intakeStage: 'queued', count: 0 },
      { intakeStage: 'reception', count: 0 },
      { intakeStage: 'classification', count: 0 },
      { intakeStage: 'accommodation-assignment', count: 11 },
      { intakeStage: 'completed', count: 1 },
      { intakeStage: 'failed', count: 0 },
    ]);

    // And the figure that is new: eleven people the prison has no bed for.
    expect(counts.waitingWithoutPlace).toBe(11);
  });

  it('puts a true sentence on the panel, in the words a player reads', () => {
    const runtime = prisonWithBeds(1);
    for (let ordinal = 1; ordinal <= 12; ordinal += 1) admit(runtime, ordinal);
    stepTo(runtime, 500);

    const pipeline = intakePipelineFromProjection(projectPrisonerPopulationCounts(runtime.prisoners));
    expect(isIntakeWithoutPlaceWorthShowing(pipeline)).toBe(true);

    // The bundled catalog, not a sentinel: this is the sentence on screen. It
    // is written out rather than formatted through the same helper, because an
    // expectation built by the code under test holds for any implementation.
    const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
      parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);
    expect(formatIntakeWithoutPlaceText(t, pipeline)).toBe(
      '11 waiting with no bed to sleep in',
    );

    // And the standing note no longer denies that this can happen. The sentence
    // it replaced -- "A prisoner can only be admitted into a prison that has a
    // room to hold them" -- was false about exactly this prison.
    const hint = localizer.format(HUD_MESSAGE_KEY.intakeHint);
    expect(hint).not.toContain('can only be admitted');
    expect(hint).toContain('It does not need a free bed');
  });

  it('warns about nobody in a prison with a bed to spare, while they are still at Cell Assignment', () => {
    // The assertion the defect could not have survived and the current
    // behaviour cannot pass by accident. Every arrival passes through
    // `accommodation-assignment` -- including every arrival that is housed
    // without trouble -- so a warning taken from that stage's count would fire
    // here, on a prison that is working.
    const runtime = prisonWithBeds(2);
    expect(accommodationCapacity(runtime), 'two beds are two places').toBe(2);

    // Both presses at one tick, which is what `admit` cannot do: `submit`
    // steps the kernel after each command, and `IntakeSystem` runs inside that
    // step whenever the tick is one of its scheduled ones -- so two `admit`
    // calls leave the two arrivals a stage apart for the whole of intake and
    // they never stand in `accommodation-assignment` together. Measured on this
    // tree: staggered, the pair reads `[0,0,0,1,1,0]`; together, `[0,0,0,2,0,0]`
    // for the five ticks between the stage being entered and the placement run.
    // The lockstep is the point of this case, so it is arranged rather than
    // hoped for.
    for (const id of ['admit-1', 'admit-2']) {
      runtime.kernel.submitCommand(
        id,
        runtime.kernel.expectedSequence,
        runtime.kernel.tick,
        packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }),
      );
    }
    runtime.kernel.step();

    // Walk to the first tick at which both arrivals are actually standing in
    // the stage, rather than assuming which tick that is: the stage machine's
    // interval is its own business and a hard-coded tick would make this test a
    // statement about the schedule.
    let sawBothWaiting = false;
    for (let step = 0; step < 200 && !sawBothWaiting; step += 1) {
      runtime.kernel.step();
      if (stageCount(runtime, 'accommodation-assignment') === 2) sawBothWaiting = true;
    }
    expect(sawBothWaiting, 'both arrivals must reach Cell Assignment for this test to mean anything').toBe(true);

    const counts = projectPrisonerPopulationCounts(runtime.prisoners);
    expect(counts.byIntakeStage.find((entry) => entry.intakeStage === 'accommodation-assignment')?.count).toBe(2);
    expect(counts.waitingWithoutPlace, 'two arrivals, two free beds, nobody without one').toBe(0);
    expect(isIntakeWithoutPlaceWorthShowing(intakePipelineFromProjection(counts))).toBe(false);

    // And they really were housed, so the zero above was a place existing and
    // not the count having been dropped.
    stepTo(runtime, runtime.kernel.tick + 100);
    expect(stageCount(runtime, 'completed')).toBe(2);
  });

  it('releases one of the waiting arrivals when a second bed is finished', () => {
    // What the warning promises by implication: a bed is what ends this. The
    // count has to fall when one arrives, or the sentence beside the admit
    // control is telling a player to do something that does not help.
    const runtime = createNewSimulationRuntime(SEED);
    submit(
      runtime,
      'buy-planks',
      packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 2 }),
    );
    wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
    submit(runtime, 'place-bed-0', packCommand({ type: 'PlaceObject', orderId: 'bed-0', definitionId: 'bed-wooden', ...BED_TILES[0] }));
    stepTo(runtime, 400);

    for (let ordinal = 1; ordinal <= 4; ordinal += 1) admit(runtime, ordinal);
    stepTo(runtime, 500);
    expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(3);

    submit(runtime, 'place-bed-1', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILES[1] }));
    stepTo(runtime, 900);
    expect(accommodationCapacity(runtime), 'the second bed must actually have been built').toBe(2);

    expect(projectPrisonerPopulationCounts(runtime.prisoners).waitingWithoutPlace).toBe(2);
    expect(stageCount(runtime, 'completed')).toBe(2);
  });
});
