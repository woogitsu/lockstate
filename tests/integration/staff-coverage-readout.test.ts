import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { claimableGuardIds } from '../../src/simulation/security/post-eligibility';
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

/**
 * Named here, not drawn: long enough that nobody is released mid-measurement.
 *
 * It used to be described as copied from `ADMISSION_REQUEST` in `src/main.ts`, which since #535
 * decision 5 carries no sentence at all -- a press leaves the length to the simulation, and a
 * drawn one can be as short as two in-game days.
 */
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

/**
 * **Why the sentence on the top rung states a rule and not a state**
 * (issue [#941](https://github.com/matmaxalez/lockstate/issues/941)).
 *
 * `hud.security.coverage-met-hint` used to read *"This prison has the guards it
 * asks for."* -- true, and measured in the five-tester round of 2026-09-04 on
 * the Security tab of a prison that lapsed **7 of 7** fights over in-game days
 * 10-15: `3 of 3 / Covered` beside `3 held * 1 free`.
 *
 * The two cases below are what that sentence could not tell apart, driven
 * through the production command path rather than argued: a prison at exactly
 * the requirement, whose responder pool is **empty**, and the same prison one
 * hire later, whose pool holds one. `describeStaffCoverage` answers identically
 * for both -- same badge, same figures, same shortage -- because the coverage
 * view model carries `required`/`assigned`/`shortage` and nothing about the
 * pool. So no wording on this rung may assert a state of the reserve; the only
 * honest thing it can say is where a responder comes from, which is what
 * *"Only free guards answer incidents."* says.
 *
 * **This asserts nothing about balance and must not.** How large the reserve
 * should be is issue #941 option 1 and `AGENTS.md` reserves it to the owner;
 * `src/simulation/staff/dismissal.ts` is the precedent. What is asserted here
 * is only that the panel's figures do not distinguish the two prisons.
 */
describe('the rung the panel calls covered does not say whether anyone can answer (#941)', () => {
  it('has an empty responder pool at exactly the requirement, and reads the same one hire later', () => {
    const runtime = twelveCellPrison();
    for (let ordinal = 1; ordinal <= NINTH; ordinal += 1) admit(runtime, ordinal);
    stepTo(runtime, runtime.kernel.tick + 60);
    // Nine prisoners is two guards' worth, which the block above establishes.
    expect(readout(runtime).required).toBe(2);

    hire(runtime, 1);
    hire(runtime, 2);
    // 20 ticks: `DeploymentSystem` runs every 10 and posts a hire on its next
    // update, which is the same window the walk below this block uses.
    stepTo(runtime, runtime.kernel.tick + 20);

    const atRequirement = readout(runtime);
    expect(atRequirement).toMatchObject({
      required: 2,
      assigned: 2,
      shortage: 0,
      badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
      tone: 'success',
      hireCount: 0,
    });
    /*
     * **The whole defect, in one figure.** `claimableGuardIds` is the function
     * `IncidentResponseSystem.claimableResponders` calls -- not a re-derivation
     * of it -- and it answers `0` in a prison the panel has just called
     * `Covered`. `DEFAULT_SECURITY_SECTOR_REQUIRED_GUARD_COUNT` predicts
     * exactly this in words: a player who hires exactly the requirement "will
     * watch every incident lapse."
     */
    expect(claimableGuardIds(runtime.securityGuards)).toHaveLength(0);

    hire(runtime, 3);
    stepTo(runtime, runtime.kernel.tick + 20);

    // One guard free -- and the coverage readout is byte-identical to the
    // prison above it, which is why the sentence cannot be about the reserve.
    expect(claimableGuardIds(runtime.securityGuards)).toHaveLength(1);
    expect(readout(runtime)).toEqual(atRequirement);
  });

  it('needs two of that pool for the mildest incident the simulation can open', () => {
    /*
     * The real method and the real policy: `requiredResponderCount` is
     * `max(1, ceil(severity * respondersPerSeverityPoint))`, and `3` is the
     * floor severity of an assault -- `ASSAULT_SEVERITY_CEILING`'s own docblock
     * says *"A threshold-grazing assault is severity 3 and asks for two
     * guards; the worst possible one is severity 5 and asks for three."*
     * Written out as `3` rather than recomputed from
     * `DEFAULT_ASSAULT_POLICY.threshold`, for `NINTH`'s reason: a test that
     * derived it would hold for any threshold, and a reviewer has to see this
     * number move if the policy does.
     *
     * It is here rather than in the wording test because it is the measurement
     * that stops the sentence naming a figure: the honest reserve runs from two
     * (a grazing assault) to five (a severity-10 riot), so a sentence promising
     * one number would be false for some prisons. Sizing it is the owner's.
     */
    const runtime = twelveCellPrison();
    expect(runtime.incidentResponseSystem.requiredResponderCount(3)).toBe(2);
    // The top of the scale, so the range the sentence declines to quote is the
    // one this build actually has rather than an assumed one.
    expect(runtime.incidentResponseSystem.requiredResponderCount(10)).toBe(5);
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
    // command landed.
    //
    // **The sentence that closed this comment is kept and corrected rather
    // than overwritten (2026-09-02, issues #718 and #765).** It read: *"Two
    // cadences of the HUD's own 500ms poll, at worst."* There is no 500 ms
    // poll: `refreshStaffCoverage` is one of the nine *pulled* readouts, and
    // what makes the main thread ask is the worker's clock heartbeat, not the
    // change-gated counts channel -- `CLOCK_STATE_PUBLISH_INTERVAL_MS` is 250,
    // and because `publishClockState` can only publish on a tick-loop wake the
    // real spacing is `ceil(250 / 15) * 15` = 255 ms on the harness, measured
    // at a 292.8-299.6 ms tail in a browser (PR #762, issue #765). So 20 ticks
    // is a whole second, which is roughly **four** heartbeats rather than two
    // counts cadences. What the old sentence was reaching for is unchanged and
    // is why it is kept: the readout is refreshed several times inside this
    // window, so the assertion below is not racing the cadence.
    // `tests/foundation/hud-refresh-cadence-contract.test.ts` is the gate, and
    // ADR 0086 is where the heartbeat is proposed as the contract.
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
