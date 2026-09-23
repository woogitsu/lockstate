import { describe, expect, it } from 'vitest';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { constantDeploymentSchedule } from '../../src/simulation/security/deployment-schedule';
import { claimableGuardIds } from '../../src/simulation/security/post-eligibility';
import { describeStaffCoverage } from '../../src/ui/hud';
import { staffCoverageFromProjection } from '../../src/ui/simulation-staff-coverage';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What the guard requirement is a requirement *for***
 * ([issue #893](https://github.com/matmaxalez/lockstate/issues/893);
 * [ADR 0095](../../docs/adr/0095-what-the-guard-requirement-is-a-requirement-for.md)
 * proposes what to do about it. It was `Proposed` when this file was written,
 * so nothing below asserts a decision. The owner accepted its decision 1 on
 * 2026-09-23 -- a published reserve and a new coverage rung, no simulation
 * change -- and nothing below asserts that either: this file characterises
 * the behaviour the decision is about, which the decision leaves as it is).
 *
 * ## What this file is
 *
 * A **measurement instrument**, not a fix. It runs one prison at five hire
 * counts and one authored schedule, and records at each the three numbers a
 * player can see and the five they cannot. Its assertions are a characterisation of the ladder as built --
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
 * and one row that is not a hire count at all -- the same six guards under an
 * authored `scheduled: 6` schedule, so all six are posted and none is spare:
 *
 * | 6, `scheduled: 6` | `Covered` | 0 | **0** | 9 | **0** | **0** |
 *
 * Four things in those tables are the whole finding.
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
 * `docs/INCIDENTS.md` asserted the opposite until this branch corrected it --
 * that the pool is empty *exactly when* there is a staffing shortfall. Row 2 is
 * the counter-example: shortage `0`, pool `0`.
 *
 * **And the obvious fix is refuted by the last row rather than by an argument.**
 * `requiredGuardCountFor` is read by `assignUnassignedGuards` as well as by
 * `getCoverageReport` (ADR 0048 decision 3, deliberately), so it is the posting
 * cap *and* the advice: raising it to the number a player should hire posts
 * exactly the reserve the raise was meant to buy, and the same six guards go
 * from containing everything to containing nothing at an identical wage bill.
 *
 * ## The ladder since issue #586, and why it moved
 *
 * Twelve prisoners on one bed is twelve times this prison's accommodation, so
 * since #586 crowding runs at its cap for everybody in it: `safety` falls at
 * 0.25 a tick and `hygiene` at 0.06. The prison riots more and harder -- eight
 * riots rather than seven, severities 7, 9, 9, 10, 10, 10, 10, 10 rather than
 * 7s and 8s, and one assault rather than three. Re-measured on the same seed
 * and window:
 *
 * | hired | panel badge | spare pool | resolved | lapsed | dispatched | contraband |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | 1 | `Understaffed` | 0 | 0 | 9 | 0 | 0 |
 * | **2** | **`Covered`** | 0 | **0** | 8, and one still open | **0** | **0** |
 * | 3 | `Covered` | 1 | 0 | 8 | 0 | 0 |
 * | 4 | `Covered` | 2 | 1 | 7 | 2 | 2 |
 * | 6 | `Covered` | 4 | 2 | 6 | 6 | 2 |
 * | 7 | `Covered` | 5 | **9** | **0** | **41** | 2 |
 * | 7, `scheduled: 7` | `Covered` | 0 | **0** | 8 | **0** | **0** |
 *
 * **Every one of the four findings above survives, and the ladder is one rung
 * taller.** The advice still buys nothing (rows 1 and 2 answer nothing; they
 * differ only in whether the last riot of the window has lapsed yet). The
 * thresholds are still `required` plus what a claimant asks for -- but a
 * severity-9 or -10 riot asks for `ceil(10 * 0.5) = 5`, so "everything
 * answerable" is `required + 5` now where it was `+ 4`, and the severity-7
 * riot is the only one four spare guards can take. 41 is exact: one assault x
 * 2, one severity-7 riot x 4, seven severity-9-or-10 riots x 5. And raising the
 * requirement still posts the reserve it was raised to buy, shown at seven
 * guards rather than six because seven is now the wage bill that answers
 * everything.
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
 *
 * **Superseded 2026-09-24:** ADR 0095 decision 1 is accepted. The simulation
 * still draws both duties from one pool, but the panel now marks the zero-free
 * row as `No reserve` and keeps `Covered` for rows with a free guard. The
 * historical measurements above remain the evidence for that distinction.
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
/** `applyDefaultSecuritySector`'s derived sector -- the only one a session a player can start has. */
const DEFAULT_SECTOR_ID = 'security-sector.prison';

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
function prisonHiring(guardCount: number, scheduledGuardCount?: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  if (scheduledGuardCount !== undefined) {
    /*
     * An authored schedule, which is what ADR 0048 decision 3 says a schedule
     * is -- `resolveOccupancyScaledGuardCount` *only ever raises*, so
     * `max(scheduled, 2)` is `scheduled` here. Replaced in place rather than
     * rewritten by a system, because `requiredGuardCountFor` reads this array
     * every time and a system that wrote it would destroy the authored value
     * (`sector-staffing.ts` records that first draft and why it was wrong).
     */
    runtime.securitySchedules.length = 0;
    runtime.securitySchedules.push(constantDeploymentSchedule(DEFAULT_SECTOR_ID, scheduledGuardCount));
  }
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
  /** Incidents still open when the window closes -- neither resolved nor lapsed yet (added for #586, whose riots last long enough to straddle the end). */
  readonly open: number;
}

function read(runtime: SimulationRuntime): Reading {
  /*
   * The whole production chain rather than a reduction of `getCoverageReport`
   * by hand -- `projectStaff` sums the per-sector rows into
   * `StaffViewModel.totals`, `staffCoverageFromProjection` copies the three
   * figures across the worker boundary, and `describeStaffCoverage` picks the
   * rung. That is the same route `staff-coverage-readout.test.ts` takes, and it
   * is what makes the badge below *the badge a player is shown* rather than a
   * restatement of how one is chosen.
   */
  const view = projectStaff(
    { staff: runtime.securityGuards, deployment: runtime.deploymentSystem, patrol: runtime.patrolSystem },
    runtime.kernel.tick,
  );
  const totals = staffCoverageFromProjection(view);
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
    open: runtime.incidents.openIncidents().length,
  };
}

function readAfterSixteenDays(guardCount: number, scheduledGuardCount?: number): Reading {
  const runtime = prisonHiring(guardCount, scheduledGuardCount);
  stepTo(runtime, SIXTEEN_DAYS);
  return read(runtime);
}

const COVERED = 'hud.security.coverage-met';
const NO_RESERVE = 'hud.security.coverage-no-reserve';
const UNDERSTAFFED = 'hud.security.coverage-short';

describe('coverage and response draw from one pool, and the panel speaks about the first', () => {
  it('reports filled posts and no reserve at the exact hire count that leaves nothing able to respond', () => {
    const reading = readAfterSixteenDays(REQUIRED_AT_POPULATION);

    // What a player sees.
    expect(reading.badgeKey).toBe(NO_RESERVE);
    expect([reading.assigned, reading.required, reading.shortage]).toEqual([2, 2, 0]);

    // What a player does not.
    expect(reading.spare).toBe(0);
    expect(reading.dispatched).toBe(0);
    expect(reading.resolved).toBe(0);
    // 9 lapsed until #586; 8 since, with the ninth riot still open when the
    // sixteen days end -- crowding's riots are longer and start earlier.
    expect(reading.lapsed).toBe(8);
    expect(reading.open).toBe(1);
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
    expect(covered.badgeKey).toBe(NO_RESERVE);
    expect(short.shortage).toBe(1);

    // `lapsed + open` rather than `lapsed` since #586: the two prisons now
    // differ in whether the window's last riot has lapsed by day sixteen (9 +
    // 0 against 8 + 1), which is a question of when it opened and not of
    // anything the extra hire answered.
    expect([short.resolved, short.lapsed + short.open, short.dispatched, short.contraband]).toEqual([
      covered.resolved,
      covered.lapsed + covered.open,
      covered.dispatched,
      covered.contraband,
    ]);
  });

  it('separates the empty reserve from every hire count above the requirement', () => {
    // The accepted fourth presentation rung makes the two-guard prison legible;
    // the incident outcomes below remain a separate simulation measurement.
    const badges = [2, 3, 4, 6].map((count) => readAfterSixteenDays(count).badgeKey);
    expect(badges).toEqual([NO_RESERVE, COVERED, COVERED, COVERED]);
  });
});

describe('the thresholds above the requirement, which are three and not one', () => {
  /**
   * Measured as a ladder rather than as two columns, because two columns cannot
   * distinguish "one hidden threshold" from "several". These four readings are
   * what say the search gate and the two response gates are different numbers.
   */
  /**
   * **This case measured `required + 1` when it was written against `ac58c457`
   * and measures `required + 2` on the base this branch was brought up to.**
   * The reading is corrected rather than the case deleted, because *what moved
   * it* is the finding: `claimableSearchGuardIds` in
   * `src/simulation/security/post-eligibility.ts` holds
   * `INCIDENT_RESPONSE_GUARD_RESERVE` free guards back from a sweep, so the
   * first spare hire is reserved for response and the second is what makes
   * contraband findable. That constant landed for issue #996 after this
   * document's measurements were taken.
   *
   * **It narrows the search gate and leaves the subject of ADR 0095 exactly
   * where it was.** `IncidentResponseSystem` still calls `claimableGuardIds`
   * unnarrowed, so posting still spends the whole requirement out of the pool
   * a riot is answered from, and the prison at its requirement still reads
   * `Covered` with nothing spare and answers nothing. The reserve moved one
   * rung of the ladder; it did not move the rung the document is about.
   */
  it('switches searching on two spare guards above the requirement, and answering on later', () => {
    const atRequirement = readAfterSixteenDays(REQUIRED_AT_POPULATION);
    const oneSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 1);
    const twoSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 2);

    // The `'sector'` search policy asks for one guard and the search pool is
    // `claimableGuardIds` less one, so a prison with a single spare guard
    // still cannot sweep. Both figures are asserted, not just the live one:
    // the zero at one spare is what says the reserve is doing the holding.
    expect([atRequirement.spare, oneSpare.spare, twoSpare.spare]).toEqual([0, 1, 2]);
    expect([atRequirement.contraband, oneSpare.contraband]).toEqual([0, 0]);
    expect(twoSpare.contraband).toBeGreaterThan(0);

    // And it is *not* the same threshold as answering: one spare guard cannot
    // answer a severity-3 assault, which asks for `ceil(3 * 0.5) = 2`.
    expect(oneSpare.dispatched).toBe(0);
    expect(oneSpare.resolved).toBe(0);
    expect(oneSpare.lapsed).toBe(atRequirement.lapsed);
  });

  /*
   * **Titled "answers assaults two spare guards above the requirement and
   * riots four above it" until issue #586**, when every riot here was
   * severity 7 or 8. Crowding made seven of this prison's eight riots severity
   * 9 or 10, which ask for five responders, so the riot gate splits in two and
   * the case pins three rungs where it pinned two.
   */
  it('answers assaults two spare guards above the requirement, a severity-7 riot four above it, and every riot five above it', () => {
    const twoSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 2);
    const fourSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 4);
    const fiveSpare = readAfterSixteenDays(REQUIRED_AT_POPULATION + 5);

    // Two spare: `ceil(3 * 0.5) = 2` is met, so the one assault is answered --
    // and no riot's `ceil(severity * 0.5)` is, so every riot still lapses.
    expect(twoSpare.spare).toBe(2);
    expect(twoSpare.resolved).toBe(1);
    expect(twoSpare.dispatched).toBe(2); // 1 assault x 2 responders
    expect(twoSpare.lapsed).toBe(7);

    // Four spare: `ceil(7 * 0.5) = 4` is met for the one severity-7 riot, and
    // `ceil(9 * 0.5) = 5` is not for the rest.
    expect(fourSpare.spare).toBe(4);
    expect(fourSpare.resolved).toBe(2);
    expect(fourSpare.lapsed).toBe(6);
    expect(fourSpare.dispatched).toBe(6); // 1 x 2 + 1 x 4

    // Five spare: every incident this prison produces is answerable.
    expect(fiveSpare.spare).toBe(5);
    expect(fiveSpare.resolved).toBe(9);
    expect(fiveSpare.lapsed).toBe(0);
    // 1 assault x 2, 1 severity-7 riot x 4, 7 severity-9-or-10 riots x 5.
    // Exact arithmetic, not a range: it is what makes the gates identifiable
    // as `requiredResponderCount` rather than as an unexplained step.
    expect(fiveSpare.dispatched).toBe(41);
  });
});

describe('raising the requirement to the number a player should hire makes it strictly worse', () => {
  /**
   * The obvious fix -- *"the requirement should account for both budgets"* --
   * refuted by measurement rather than by argument, and it is the load-bearing
   * evidence in ADR 0095's rejection of that option.
   *
   * `requiredGuardCountFor` is read by `assignUnassignedGuards` *and* by
   * `getCoverageReport` (ADR 0048 decision 3, deliberately, so that what is
   * enforced and what is published cannot disagree). So the same number is the
   * posting cap and the advice, and raising it posts exactly the reserve it was
   * raised to buy.
   */
  /*
   * **Seven guards since issue #586, where it was six**: seven is now the
   * wage bill that answers everything (see the ladder in the file's
   * docblock), and the finding is about that wage bill. Six still reads the
   * same way at a smaller scale -- 2 resolved against 0 -- but "answered
   * everything" would no longer be true of it.
   */
  it('posts the whole force and answers nothing, at the same wage bill that answered everything', () => {
    const sevenSpare = readAfterSixteenDays(7);
    const sevenPosted = readAfterSixteenDays(7, 7);

    // Seven guards, one seed, one population, and the only difference is what
    // the sector asks for.
    expect([sevenSpare.required, sevenSpare.assigned, sevenSpare.spare]).toEqual([2, 2, 5]);
    expect([sevenPosted.required, sevenPosted.assigned, sevenPosted.spare]).toEqual([7, 7, 0]);

    // The same seven hires now read differently because all seven are posted
    // under the authored requirement, leaving no free responder.
    expect([sevenSpare.badgeKey, sevenPosted.badgeKey]).toEqual([COVERED, NO_RESERVE]);

    expect([sevenSpare.resolved, sevenSpare.lapsed, sevenSpare.dispatched]).toEqual([9, 0, 41]);
    expect([sevenPosted.resolved, sevenPosted.lapsed, sevenPosted.dispatched]).toEqual([0, 8, 0]);
    expect([sevenSpare.contraband, sevenPosted.contraband]).toEqual([2, 0]);
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
    // prison: the run above ends with `incident.riot.10` still `'active'`
    // (`incident.riot.9` since #586, severity 10, on the same seed).
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
    // The response hire also changes the badge: the empty reserve is no longer
    // hidden behind a posting-only `Covered` state.
    expect([before.badgeKey, after.badgeKey]).toEqual([NO_RESERVE, COVERED]);
  });
});
