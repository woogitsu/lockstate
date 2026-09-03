import { describe, expect, it } from 'vitest';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { claimableGuardIds } from '../../src/simulation/security/post-eligibility';
import { describeStaffCoverage } from '../../src/ui/hud/staff-panel';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What the guard requirement is a requirement *for***
 * ([issue #893](https://github.com/matmaxalez/lockstate/issues/893);
 * [ADR 0095](../../docs/adr/0095-what-the-guard-requirement-is-a-requirement-for.md)
 * proposes what to do about it and is `Proposed`, so nothing below asserts a
 * decision).
 *
 * ## What this file is
 *
 * A **measurement instrument**, not a fix. It runs one prison at five hire
 * counts and records, at each, the three numbers a player can see and the four
 * they cannot. Its assertions are a characterisation of the ladder as built --
 * so that whichever way ADR 0095 is settled, the change is visible here as a
 * diff to a table rather than as an argument.
 *
 * ## The finding, and it is a relation rather than a bug in a function
 *
 * Every module is doing exactly what it says. `DeploymentSystem` posts guards
 * up to `requiredGuardCountFor` and stops; a posted guard's phase is
 * `'on-post'`; `GuardRoster.unassignedGuardIds()` answers `'unassigned'` only;
 * and `claimableGuardIds` -- what `IncidentResponseSystem`,
 * `SectorSearchDutySystem` and `SearchSystem` all claim from -- filters that
 * pool by role (ADR 0053). Compose those four facts and **posting spends the
 * whole requirement out of the pool that answers incidents and walks searches,
 * and never gives any of it back.**
 *
 * The panel speaks about the first of those and is silent about the second.
 * `describeStaffCoverage` reads `required`/`assigned`/`shortage` and nothing
 * else, so *Covered* means "every post is filled" and is published in every
 * column of the table below -- including the one where nothing was ever
 * answered.
 *
 * ## The ladder, measured here, seed `0x893`, sixteen in-game days
 *
 * Twelve prisoners in a one-bed cell, so `resolveOccupancyScaledGuardCount`
 * asks for `ceil(12 / 8) = 2`:
 *
 * | hired | panel badge | spare pool | resolved | lapsed | dispatched | contraband |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | 1 | `Understaffed` | 0 | 0 | 9 | 0 | 0 |
 * | **2** -- *what the panel asks for* | **`Covered`** | 0 | **0** | 9 | **0** | **0** |
 * | 3 | `Covered` | 1 | 0 | 9 | 0 | **2** |
 * | 4 | `Covered` | 2 | 3 | 6 | 6 | 2 |
 * | 6 | `Covered` | 4 | **10** | **0** | **34** | 2 |
 *
 * Three things in that table are the whole finding.
 *
 * **The panel's own advice buys nothing it speaks about.** Rows 1 and 2 differ
 * by exactly the hire the `Understaffed` hint asks for, and every outcome
 * column is identical. Following the advice moves the badge and moves nothing
 * else.
 *
 * **There is not one hidden threshold above the requirement, there are three.**
 * They are not a mystery once the pool is understood -- each is
 * `required` plus what a claimant asks for at the moment it claims:
 *
 * - `required + 1` to search, from the `'sector'` policy's
 *   `requiredGuardCount: 1` (`src/simulation/contraband/default-search-policies.ts:65`,
 *   read at `src/simulation/contraband/sector-search-duty.ts:126`);
 * - `required + 2` to answer a severity-3 assault and
 *   `required + 4` to answer a severity-8 riot, from
 *   `max(1, ceil(severity * 0.5))`
 *   (`IncidentResponseSystem.requiredResponderCount`, read at
 *   `src/simulation/incidents/response-system.ts:463`).
 *
 * The arithmetic is exact rather than approximate, which is why this is
 * characterisable at all: row 6's 34 dispatches are 3 assaults x 2 plus 7 riots
 * x 4.
 *
 * **Only the first of the three is documented anywhere.** `docs/CONTRABAND.md`
 * "Who orders a search" and `SectorSearchDutySystem`'s own docblock both state
 * the search coupling in terms and call it deliberate. Nothing states the
 * response coupling for a prison with no shortage -- and
 * `docs/INCIDENTS.md` said the opposite until #893, asserting that the pool is
 * empty *exactly when* there is a staffing shortfall. Row 2 is the
 * counter-example: shortage `0`, pool `0`.
 *
 * ## Why an integration test and not a unit test
 *
 * Because there is no wrong function to unit-test. A unit test supplies the
 * roster whose composition is the finding. Every figure below comes from
 * `createNewSimulationRuntime` driven by real commands through the real
 * handler, and the panel reading comes from the production
 * `describeStaffCoverage` rather than from a restatement of its rungs.
 *
 * ## What is deliberately not claimed
 *
 * Not that the ladder is wrong. Whether coverage and response *should* draw
 * from one pool is ADR 0095's question and it is open. Not that the copy should
 * say something in particular either: `hud.security.coverage-met-hint` is
 * player-visible text and `AGENTS.md`'s fourth exclusion reserves it.
 */

/** Distinct from every other seed in the suite, so a shared fixture cannot make these figures true by accident. */
const SEED = 0x893;

/** `room.cell`'s authored minimum -- the same rectangle every security and contraband loop in this directory builds. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const BED_TILE = { x: 4, y: 6 } as const;
/** `NEW_PRISON_ORIGIN_TILE` in `src/main.ts`, written out -- the tile a hire stands on and an admission arrives at. */
const ORIGIN = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;
const DAY_LENGTH = 2_400;
/** Sixteen in-game days, the window `contraband-search-duty.test.ts` uses -- long enough for riots to open, lapse and reopen several times over. */
const SIXTEEN_DAYS = DAY_LENGTH * 16;
/** Twelve prisoners against one bed: enough population that `ceil(occupants / 8)` asks for two guards, and enough unmet need to riot. */
const POPULATION = 12;
/** What `resolveOccupancyScaledGuardCount` asks of the derived sector at `POPULATION`, and therefore what the panel calls *Covered*. */
const REQUIRED_AT_POPULATION = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function hireGuards(runtime: SimulationRuntime, count: number, idPrefix: string): void {
  for (let index = 0; index < count; index += 1) {
    submit(runtime, `${idPrefix}-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ORIGIN }));
  }
}

/**
 * One prison, `guardCount` guards, twelve prisoners and one bed.
 *
 * The *only* difference between any two columns of the table above is this
 * argument, which is what makes the comparison a comparison rather than two
 * prisons. Admissions are spaced by 40 ticks exactly as
 * `contraband-search-duty.test.ts` spaces them, so intake is not a single
 * simultaneous shock.
 */
function prisonHiring(guardCount: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  submit(runtime, 'place-bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', ...BED_TILE }));
  stepTo(runtime, 200); // delivery delay plus build progress, the margin every furnished-cell loop here uses
  hireGuards(runtime, guardCount, 'hire');
  for (let index = 0; index < POPULATION; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN }));
    stepTo(runtime, runtime.kernel.tick + 40);
  }
  // Not an `expect`: a silently refused command here would leave a prison with
  // the wrong population or the wrong roster, and every assertion below would
  // then be measuring a prison nobody described.
  if (runtime.refusals.count > 0) throw new Error('A command this fixture depends on was refused.');
  return runtime;
}

interface Reading {
  /** What the Staff panel's coverage block decides, from the production function rather than a restatement of its rungs. */
  readonly badgeKey: string;
  readonly required: number;
  readonly assigned: number;
  readonly shortage: number;
  /** Post-eligible staff no duty is holding -- what a response, a sweep and a search job all claim from. */
  readonly spare: number;
  readonly resolved: number;
  readonly lapsed: number;
  readonly dispatched: number;
  readonly routeFailures: number;
  readonly contraband: number;
}

function read(runtime: SimulationRuntime): Reading {
  const coverage = runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick);
  const totals = coverage.reduce(
    (accumulator, entry) => ({
      required: accumulator.required + entry.required,
      assigned: accumulator.assigned + entry.assigned,
      shortage: accumulator.shortage + entry.shortage,
    }),
    { required: 0, assigned: 0, shortage: 0 },
  );
  // Exactly the shape `projectStaff` sums into `StaffViewModel.totals` and
  // `staffCoverageFromProjection` copies across the worker boundary, so the
  // badge below is the badge a player is shown.
  const readout = describeStaffCoverage(totals);
  const metrics = runtime.incidentResponseSystem.getMetrics();
  const strip = projectStatusStrip({
    tick: runtime.kernel.tick,
    prisoners: runtime.prisoners,
    staff: runtime.securityGuards,
    searchSystem: runtime.searchSystem,
    confiscations: runtime.confiscations,
  }).counts;
  return {
    badgeKey: readout.badgeKey,
    ...totals,
    spare: claimableGuardIds(runtime.securityGuards).length,
    resolved: metrics.incidentsResolved,
    lapsed: metrics.incidentsLapsed,
    dispatched: metrics.respondersDispatched,
    routeFailures: metrics.routeFailures,
    contraband: strip.contrabandDiscovered,
  };
}

function readAfterSixteenDays(guardCount: number): Reading {
  const runtime = prisonHiring(guardCount);
  stepTo(runtime, SIXTEEN_DAYS);
  return read(runtime);
}

const COVERED = 'hud.security.coverage-met';
const UNDERSTAFFED = 'hud.security.coverage-short';

describe('coverage and response draw from one pool, and the panel speaks about the first', () => {
  it('reports the prison Covered at the exact hire count that leaves nothing able to respond', () => {
    const reading = readAfterSixteenDays(REQUIRED_AT_POPULATION);

    // What a player sees.
    expect(reading.badgeKey).toBe(COVERED);
    expect([reading.assigned, reading.required, reading.shortage]).toEqual([2, 2, 0]);

    // What a player does not.
    expect(reading.spare).toBe(0);
    expect(reading.dispatched).toBe(0);
    expect(reading.resolved).toBe(0);
    expect(reading.lapsed).toBe(9);
    expect(reading.contraband).toBe(0);

    // The obvious confound, refuted rather than assumed: nobody failed to
    // *reach* an incident, so this is a claim that was never made and not a
    // route that could not be walked.
    expect(reading.routeFailures).toBe(0);
  });

  it('answers exactly as many incidents one hire below the requirement as at it, so the advice buys nothing it speaks about', () => {
    const short = readAfterSixteenDays(REQUIRED_AT_POPULATION - 1);
    const covered = readAfterSixteenDays(REQUIRED_AT_POPULATION);

    // The badge moves. It is the only thing that moves.
    expect(short.badgeKey).toBe(UNDERSTAFFED);
    expect(covered.badgeKey).toBe(COVERED);
    expect(short.shortage).toBe(1);

    expect([short.resolved, short.lapsed, short.dispatched, short.contraband]).toEqual([
      covered.resolved,
      covered.lapsed,
      covered.dispatched,
      covered.contraband,
    ]);
  });

  it('publishes the same badge, character for character, across every hire count from the requirement to three times it', () => {
    // The panel's whole vocabulary for this block is three rungs, and the top
    // rung covers the entire interesting range. Six guards contains every riot
    // and two guards answers nothing; a player reading the badge cannot tell
    // those two prisons apart.
    const badges = [2, 3, 4, 6].map((count) => readAfterSixteenDays(count).badgeKey);
    expect(badges).toEqual([COVERED, COVERED, COVERED, COVERED]);
  });
});

describe('the thresholds above the requirement, which are three and not one', () => {
  /**
   * Measured as a ladder rather than as two columns, because two columns cannot
   * distinguish "one hidden threshold" from "several". These four readings are
   * what say the search gate and the two response gates are different numbers.
   */
  it('switches searching on at the first spare guard, and answering on later', () => {
    const atRequirement = readAfterSixteenDays(REQUIRED_AT_POPULATION);
    const oneSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 1);

    // `required + 1`: the `'sector'` search policy asks for one guard, so the
    // first spare hire makes contraband findable -- which `docs/CONTRABAND.md`
    // and `SectorSearchDutySystem`'s docblock both state deliberately.
    expect([atRequirement.spare, oneSpare.spare]).toEqual([0, 1]);
    expect(atRequirement.contraband).toBe(0);
    expect(oneSpare.contraband).toBeGreaterThan(0);

    // And it is *not* the same threshold: one spare guard cannot answer a
    // severity-3 assault, which asks for `ceil(3 * 0.5) = 2`.
    expect(oneSpare.dispatched).toBe(0);
    expect(oneSpare.resolved).toBe(0);
    expect(oneSpare.lapsed).toBe(atRequirement.lapsed);
  });

  it('answers assaults two spare guards above the requirement and riots four above it', () => {
    const twoSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 2);
    const fourSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 4);

    // Two spare: `ceil(3 * 0.5) = 2` is met, so the three assaults are
    // answered -- and `ceil(8 * 0.5) = 4` is not, so every riot still lapses.
    expect(twoSpare.spare).toBe(2);
    expect(twoSpare.resolved).toBe(3);
    expect(twoSpare.dispatched).toBe(6); // 3 assaults x 2 responders
    expect(twoSpare.lapsed).toBe(6);

    // Four spare: every incident this prison produces is answerable.
    expect(fourSpare.spare).toBe(4);
    expect(fourSpare.resolved).toBe(10);
    expect(fourSpare.lapsed).toBe(0);
    // 3 assaults x 2 plus 7 riots x 4. Exact arithmetic, not a range: it is
    // what makes the two gates identifiable as `requiredResponderCount` rather
    // than as an unexplained step.
    expect(fourSpare.dispatched).toBe(34);
  });
});

describe('what a prison at its requirement can still do about a riot, and is never told', () => {
  /**
   * `docs/INCIDENTS.md` offers one escape from the shared pool: *"it is
   * answered by guards hired after it starts, inside the 600-tick
   * `responseDeadlineTicks`"*. That is true, and this case is what makes the
   * correction to the surrounding paragraph honest -- the mechanism works, and
   * no channel in the game says it exists.
   *
   * Hiring mid-incident works for a structural reason worth stating:
   * `DeploymentSystem` posts only up to a shortage it has, and a prison at its
   * requirement has none, so a hire made during a riot stays `'unassigned'` and
   * is therefore claimable on the response system's next update.
   */
  it('resolves a riot that was lapsing, from hires made while it was open', () => {
    const runtime = prisonHiring(REQUIRED_AT_POPULATION);
    stepTo(runtime, SIXTEEN_DAYS);
    const before = read(runtime);
    expect(before.resolved).toBe(0);
    expect(before.spare).toBe(0);

    // An incident is open right now, so this is a rescue rather than a fresh
    // prison: the run above ends with `incident.riot.10` still `'active'`.
    const open = runtime.incidents.openIncidents();
    expect(open.length).toBeGreaterThan(0);
    const severity = Math.max(...open.map((incident) => incident.severity));
    const needed = runtime.incidentResponseSystem.requiredResponderCount(severity);

    hireGuards(runtime, needed, 'rescue');
    // Well inside `responseDeadlineTicks` of this update, and long enough for
    // `containmentTicks` to elapse once they arrive.
    stepTo(runtime, runtime.kernel.tick + 400);

    const after = read(runtime);
    expect(after.resolved).toBeGreaterThan(0);
    expect(after.dispatched).toBeGreaterThanOrEqual(needed);
    // And the badge said `Covered` before the rescue and says it after: the
    // one gesture that changed the outcome is invisible to the block that is
    // supposed to be about having enough guards.
    expect([before.badgeKey, after.badgeKey]).toEqual([COVERED, COVERED]);
  });
});
