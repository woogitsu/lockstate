import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { HUD_MESSAGE_KEY, describeStaffCoverage } from '../../src/ui/hud';
import { staffCoverageFromProjection } from '../../src/ui/simulation-staff-coverage';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **The staffing warning, from the prison that produces it to the sentence a
 * player reads** ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1).
 *
 * ## Why this is not a unit test
 *
 * ADR 0048's Consequences record the gap this closes and describe it as a
 * *reachability* problem rather than a wrong function:
 *
 * > `StaffCoverageRowViewModel` carries `required`/`assigned`/`shortage` per
 * > sector, and no panel renders it -- so the requirement rising from 1 to 2 at
 * > the ninth prisoner, which is the clearest warning the simulation now
 * > produces, is invisible.
 *
 * Every piece was already correct: `resolveOccupancyScaledGuardCount` has unit
 * tests, `DeploymentSystem.getCoverageReport` has unit tests, and `projectStaff`
 * has unit tests. What nothing asserted was that the three of them, driven by
 * the five commands a player can actually send, produce a figure that *moves*
 * before a riot -- which is the only thing that makes rendering it worth doing
 * rather than decoration. So this file starts at `createNewSimulationRuntime`
 * and ends at the message key the panel would put on screen, and the only
 * things between them are production modules.
 *
 * ## What it deliberately does not assert
 *
 * That a riot follows. It does not, always: measured on this tree with this
 * fixture, 12 prisoners in 12 beds with one guard sits at a shortage of 1 for
 * 30,000 ticks and never riots, while 16 prisoners in the same prison with one
 * guard riots at tick 13,400 and stops entirely at two guards. The readout is a
 * statement about staffing, not a prediction, and a test asserting the
 * prediction would be pinning something the copy is careful not to claim.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x448;

/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out -- the tile an admission arrives at and a hire starts on. */
const ORIGIN = { x: 16, y: 16 } as const;

/** Copied from `ADMISSION_REQUEST` in `src/main.ts`: long enough that nobody is released mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;

/**
 * `DEFAULT_SECTOR_PRISONERS_PER_GUARD`, written out rather than imported.
 *
 * Importing it would make the assertions below true for any value of it, which
 * is exactly the fixture-supplies-both-sides failure `docs/TESTING.md` forbids.
 * The ninth prisoner is a *fact about this build* and a reviewer has to see the
 * number move if the constant does.
 */
const NINTH = 9;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * Twelve cells, each with a bed, built and furnished through the real command
 * path -- so every prisoner admitted below is *housed* and the requirement is
 * rising for the only reason this readout is about: population.
 *
 * Twelve rather than eight because the interesting boundary is the ninth
 * prisoner, and a prison with eight beds would confound "the requirement went
 * up" with "there is nowhere left to sleep". `IntakeSystem` would leave the
 * ninth arrival homeless, which is a different warning with a different surface
 * (the Prisoners chip's over-capacity badge) and would make it impossible to say
 * which of the two this block is reacting to.
 */
function twelveCellPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 60 }));
  for (let index = 0; index < 12; index += 1) {
    const rect = { x: 4 + (index % 6) * 3, y: 6 + Math.floor(index / 6) * 4, width: 2, height: 3 };
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
    submit(runtime, `bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
  }
  // 100 ticks of delivery delay plus build progress; 400 is the margin the
  // security and consequence loops both admit after.
  stepTo(runtime, 400);
  return runtime;
}

/** What the Staff panel would be handed, through the two production modules that decide it. */
function readout(runtime: SimulationRuntime): {
  readonly required: number;
  readonly assigned: number;
  readonly shortage: number;
  readonly badgeKey: string;
  readonly tone: string;
  readonly hireCount: number;
} {
  const view = projectStaff(
    { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
    runtime.kernel.tick,
  );
  const coverage = staffCoverageFromProjection(view);
  const described = describeStaffCoverage(coverage);
  return { ...coverage, badgeKey: described.badgeKey, tone: described.tone, hireCount: described.hireCount };
}

function admit(runtime: SimulationRuntime, ordinal: number): void {
  submit(runtime, `admit-${String(ordinal)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
}

function hire(runtime: SimulationRuntime, ordinal: number): void {
  submit(runtime, `hire-${String(ordinal)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
}

describe('the requirement a player has to act on moves, and the panel is told', () => {
  it('asks for one guard from the first prisoner through the eighth', () => {
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal < NINTH; ordinal += 1) {
      admit(runtime, ordinal);
      stepTo(runtime, runtime.kernel.tick + 60);
      expect(readout(runtime), `after prisoner ${String(ordinal)}`).toMatchObject({
        required: 1,
        assigned: 0,
        shortage: 1,
      });
    }
  });

  it('asks for two on the tick the ninth prisoner is admitted, before any tick passes', () => {
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal < NINTH; ordinal += 1) {
      admit(runtime, ordinal);
      stepTo(runtime, runtime.kernel.tick + 60);
    }
    // Written out rather than read back: eight prisoners is one guard's worth.
    expect(readout(runtime).required).toBe(1);

    admit(runtime, NINTH);
    // No `stepTo`. The requirement is derived at read time from occupancy
    // (ADR 0048 decision 3), so it is already 2 on the tick the command landed
    // -- which is what lets the panel warn on the next cadence rather than on
    // the next sampling point 50 ticks later.
    expect(readout(runtime)).toMatchObject({ required: 2, assigned: 0, shortage: 2 });
  });

  it('turns the ninth prisoner into a different sentence, not a bigger number', () => {
    const runtime = twelveCellPrison();
    // One guard hired first, so the prison is *covered* rather than unguarded
    // and the crossing below is the one this block exists for: the population
    // outgrowing the staffing, with nothing else changing.
    hire(runtime, 1);
    stepTo(runtime, runtime.kernel.tick + 20);
    for (let ordinal = 1; ordinal < NINTH; ordinal += 1) {
      admit(runtime, ordinal);
      stepTo(runtime, runtime.kernel.tick + 60);
    }

    expect(readout(runtime)).toMatchObject({
      required: 1,
      assigned: 1,
      shortage: 0,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
      tone: 'success',
      hireCount: 0,
    });

    admit(runtime, NINTH);
    stepTo(runtime, runtime.kernel.tick + 20);

    expect(readout(runtime)).toMatchObject({
      required: 2,
      assigned: 1,
      shortage: 1,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageShort,
      tone: 'warning',
      hireCount: 1,
    });
  });

  it('says unguarded, not understaffed, in a prison with nobody hired', () => {
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal <= NINTH; ordinal += 1) admit(runtime, ordinal);
    stepTo(runtime, runtime.kernel.tick + 60);

    expect(readout(runtime)).toMatchObject({
      required: 2,
      assigned: 0,
      shortage: 2,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageUnguarded,
      tone: 'danger',
      hireCount: 2,
    });
  });
});

describe('hiring visibly fixes it, through the same command a player presses', () => {
  it('walks the block from unguarded to understaffed to covered, one hire at a time', () => {
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal <= NINTH; ordinal += 1) admit(runtime, ordinal);
    stepTo(runtime, runtime.kernel.tick + 60);
    expect(readout(runtime).badgeKey).toBe(HUD_MESSAGE_KEY.securityCoverageUnguarded);

    hire(runtime, 1);
    // 20 ticks, because `DeploymentSystem` runs every 10 and a hire standing on
    // the post tile is assigned on its next update rather than on the tick the
    // command landed. Two cadences of the HUD's own 500ms poll, at worst.
    stepTo(runtime, runtime.kernel.tick + 20);
    expect(readout(runtime)).toMatchObject({
      required: 2,
      assigned: 1,
      shortage: 1,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageShort,
      hireCount: 1,
    });

    hire(runtime, 2);
    stepTo(runtime, runtime.kernel.tick + 20);
    expect(readout(runtime)).toMatchObject({
      required: 2,
      assigned: 2,
      shortage: 0,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
      hireCount: 0,
    });
  });

  it('renders the sentence a player acts on, as real text from the bundled catalog', () => {
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal <= NINTH; ordinal += 1) admit(runtime, ordinal);
    hire(runtime, 1);
    stepTo(runtime, runtime.kernel.tick + 20);

    const current = readout(runtime);
    expect(current.hireCount).toBe(1);
    const sentence = localizer.format(HUD_MESSAGE_KEY.securityCoverageShortHint, {
      count: localizer.formatNumber(current.hireCount),
    });
    // The number in the sentence is the number of presses, and the sentence is
    // text rather than a key with a hole in it.
    expect(sentence).toContain('1');
    expect(sentence).not.toContain('{');

    const summary = localizer.format(HUD_MESSAGE_KEY.securityCoverageSummary, {
      assigned: localizer.formatNumber(current.assigned),
      required: localizer.formatNumber(current.required),
    });
    expect(summary).toBe('1 of 2');
  });
});
