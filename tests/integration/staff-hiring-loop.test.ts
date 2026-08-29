import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { defaultStaffRoleRegistry } from '../../src/content/staff-role-catalog';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { Treasury, TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { projectStaff } from '../../src/simulation/presentation/staff-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { SIMULATION_PROTOCOL_VERSION, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { GuardRoster } from '../../src/simulation/security';
import { StaffHiringService, staffHireCostMinorUnits } from '../../src/simulation/staff';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { hudAlertsFromWorkerMessage } from '../../src/ui/simulation-alerts';
import { hudCountsFromWorkerMessage } from '../../src/ui/simulation-counts';

/**
 * Hiring a guard through the real command path
 * ([ADR 0025](../../docs/adr/0025-guard-hiring-surface.md)).
 *
 * `GuardRoster.hire` was complete, snapshotted and restored, and **every call
 * in the repository was in a test**. So `DeploymentSystem`, `PatrolSystem`,
 * `IncidentResponseSystem` and `SearchSystem` iterated an empty collection in
 * every session a player could start, the status strip's `Staff` count was
 * structurally zero, and the whole staff projection was reachable only from
 * the suite. This is the loop that closes it, driven end to end.
 *
 * Everything below goes through the real kernel, the real decoder and the real
 * session command router. Nothing calls `GuardRoster.hire` or
 * `Treasury.spend` by hand to set up the thing being measured: a test that did
 * would prove the roster works and say nothing about whether a command can
 * reach it. The one exception is the insufficient-funds case, which spends the
 * treasury down first -- stated where it happens, and it is the *precondition*
 * rather than the behaviour under test.
 *
 * No figure here is written down. The wage comes from the catalogue, the
 * opening balance from `TREASURY_STARTING_BALANCE_MINOR_UNITS`, and the
 * refusal sentence from the bundled locale, so #29 moving the guard's band
 * moves this test with it rather than breaking it.
 */

const SEED = 0x6ea2d;
const GUARD = 'staff-role.guard';
const ORIGIN = { x: 16, y: 16 };

/** What one hire costs, from content -- never a literal in this file. */
const WAGE = staffHireCostMinorUnits(GUARD)!;

/** Dispatches one `HireStaff` through the kernel, at the sequence the kernel is expecting. */
function submitHire(
  runtime: SimulationRuntime,
  id: string,
  hire: { readonly staffRoleId: string; readonly x: number; readonly y: number },
): void {
  runtime.kernel.submitCommand(
    id,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'HireStaff', ...hire }),
  );
  runtime.kernel.step();
}

/**
 * The `simulation/status-counts` publication the worker would send for this
 * runtime, assembled exactly as `WorkerStateMachine.publishStatusCounts` does:
 * the projection beside the session's most recent refusal, and the refusal
 * absent rather than null when there has been none.
 *
 * Built here rather than by driving the worker shell because the shell adds a
 * rate limit and a `postMessage`, and neither is what these tests are about --
 * what they need is the payload the main thread reads, which is this.
 */
function publication(runtime: SimulationRuntime): WorkerToMainMessage {
  const refusal = runtime.refusals.last;
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-under-test',
    kind: 'simulation/status-counts',
    payload: {
      tick: runtime.kernel.tick,
      schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
      counts: projectStatusCounts(runtime, runtime.kernel.tick),
      ...(refusal === undefined ? {} : { refusal }),
    },
  } as WorkerToMainMessage;
}

describe('hiring a guard through the real command path (ADR 0025)', () => {
  it('debits the treasury by the role\'s authored wage, and by exactly that', () => {
    const runtime = createNewSimulationRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    submitHire(runtime, 'cmd-hire-1', { staffRoleId: GUARD, x: ORIGIN.x, y: ORIGIN.y });

    // The whole of the money claim, in three parts: something was spent, it
    // was the catalogue's figure, and it was spent once. Asserting only the
    // difference would pass for a debit of the wrong amount if the opening
    // balance were also wrong, and asserting only the balance would pass for a
    // hire that spent nothing if the opening balance happened to match.
    expect(WAGE).toBe(defaultStaffRoleRegistry.getById(GUARD)!.wageBand.minPerDay);
    expect(WAGE).toBeGreaterThan(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - WAGE);

    // A second hire is a second debit, so the charge is per hire rather than a
    // one-off the first one happened to pay.
    submitHire(runtime, 'cmd-hire-2', { staffRoleId: GUARD, x: ORIGIN.x, y: ORIGIN.y });
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - 2 * WAGE);

    // And nothing was refused on the way, so the balance moved because the
    // hires succeeded rather than in spite of them.
    expect(runtime.refusals.count).toBe(0);
    expect(runtime.securityGuards.allGuardIds()).toHaveLength(2);
  });

  it('puts the hired guard in the staff readout, which nothing in the application could move before', () => {
    const runtime = createNewSimulationRuntime(SEED);

    // The structural zero this closes, stated before it moves.
    expect(projectStatusCounts(runtime, runtime.kernel.tick).staff).toBe(0);
    expect(runtime.securityGuards.allGuardIds()).toEqual([]);

    submitHire(runtime, 'cmd-hire-1', { staffRoleId: GUARD, x: ORIGIN.x, y: ORIGIN.y });

    // 1. The projection the worker publishes.
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.staff).toBe(1);
    /*
     * **Unassigned, and this line has now been all three things** -- which is
     * why both earlier readings are kept rather than overwritten.
     *
     * It first read `staffUnassigned === 1`, with a comment saying "honestly
     * so: a new session registers no deployment schedule, so
     * `DeploymentSystem` has no sector to send anybody to". That was true and
     * it was issue #396's bug: `securitySectors.register` had one caller in all
     * of `src/`, the restore path, so the whole security tier was inert in
     * every session a player could start.
     *
     * ADR 0036 fixed that and the line became `0` / `'on-post'`: a session
     * carries one derived sector asking for one guard all day, and the first
     * hire filled it on the tick the command landed.
     *
     * Issue #533 moves it back to `1`, for a reason that is *not* #396's and
     * must not be read as its return. The tier is still wired -- the sector,
     * the schedule and the watch entry are all registered, and
     * `tests/integration/security-default-sector.test.ts` measures a guard
     * posted the moment the prison holds anybody. What changed is the demand:
     * this fixture's prison has **no prisoners**, and a sector with nobody in
     * it asks for no guards, so the hire lands in the pool
     * `IncidentResponseSystem` and `SearchSystem` claim from rather than on a
     * post nobody needs. The distinction is checkable rather than rhetorical,
     * and the next three lines check it: the sector exists, it asks for
     * nobody, and it reports no shortage.
     */
    expect(counts.staffUnassigned).toBe(1);
    expect(runtime.securityGuards.getDeploymentPhase(runtime.securityGuards.allGuardIds()[0]!)).toBe('unassigned');
    expect(runtime.securityGuards.getSectorId(runtime.securityGuards.allGuardIds()[0]!)).toBeUndefined();
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 0, assigned: 0, shortage: 0 },
    ]);

    // 2. The view model the status strip actually renders, off the wire.
    expect(hudCountsFromWorkerMessage(publication(runtime))?.staff).toBe(1);

    // 3. The staff projection's own row, which carries who they are rather
    //    than how many. It is the only place the role survives the hire.
    const roster = projectStaff({ staff: runtime.securityGuards }, runtime.kernel.tick);
    expect(roster.roster.rows).toHaveLength(1);
    expect(roster.roster.rows[0]?.staffRoleId).toBe(GUARD);
    expect(roster.roster.rows[0]?.staffRoleNameKey).toBe(defaultStaffRoleRegistry.getById(GUARD)!.nameKey);
    expect(roster.roster.rows[0]?.department).toBe('security');
    // The tile is where the hire was placed and stays there, which is now true
    // for a duller reason than it used to be: `NEW_PRISON_ORIGIN_TILE` is also
    // the derived sector's post tile (ADR 0036), so a posted hire would not have
    // moved either. See the `staffUnassigned` block above for why this prison
    // posts nobody -- it holds no prisoners, and issue #533 stopped an empty
    // sector demanding a guard.
    expect(roster.roster.rows[0]?.tile).toEqual({ x: ORIGIN.x, y: ORIGIN.y });
    expect(roster.roster.rows[0]?.assignment.deploymentPhase).toBe('unassigned');
    expect(roster.roster.rows[0]?.assignment.sectorId).toBeUndefined();
    expect(roster.countsByRoleId.find((entry) => entry.staffRoleId === GUARD)?.count).toBe(1);
    expect(roster.totals).toMatchObject({ hired: 1, unassigned: 1 });
  });

  it('refuses a hire the treasury cannot cover with exactly one player-visible message, and hires nobody', () => {
    const runtime = createNewSimulationRuntime(SEED);

    // The precondition, and the one thing here that is set up by hand rather
    // than driven: spend the treasury down to one unit under the wage. Doing
    // it with `Treasury.spend` rather than by hiring 312 guards keeps the
    // measurement about the refusal instead of about the roster.
    expect(runtime.treasury.spend(TREASURY_STARTING_BALANCE_MINOR_UNITS - (WAGE - 1))).toBe(true);
    expect(runtime.treasury.balanceMinorUnits).toBe(WAGE - 1);

    // The tick the command is *dispatched* at, which is the one the refusal
    // carries -- not the tick the kernel has reached by the time it is read.
    // `RefusalLog` records at `context.tick`, and `SimulationRefusal.tick`
    // says outright that it is not necessarily the tick on the envelope
    // around it.
    const dispatchTick = runtime.kernel.tick;
    submitHire(runtime, 'cmd-hire-broke', { staffRoleId: GUARD, x: ORIGIN.x, y: ORIGIN.y });
    expect(runtime.kernel.tick).toBeGreaterThan(dispatchTick);

    // Nothing happened to the prison. Both halves: no staff member, and no
    // money -- a refusal that spent the wage and hired nobody would satisfy
    // the roster assertion alone.
    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    expect(runtime.treasury.balanceMinorUnits).toBe(WAGE - 1);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).staff).toBe(0);

    // Exactly one refusal, and it is this one. `sequence` is both the ordinal
    // and the total (`RefusalLog`), so this is the count as well as the
    // identity: a second refusal recorded for one press would read 2 here.
    expect(runtime.refusals.count).toBe(1);
    expect(runtime.refusals.last).toEqual({
      sequence: 1,
      tick: dispatchTick,
      reason: 'hire.insufficient-funds',
    });

    // And exactly one row reaches the player, carrying a *key* and not a
    // sentence (ADR 0011) -- with the bundled locale resolving that key to
    // real text rather than to its own dotted self, which is the failure a
    // `Record` value can ship as.
    const alerts = hudAlertsFromWorkerMessage(publication(runtime));
    expect(alerts).toEqual([
      { id: 'refusal-1', labelKey: 'hud.alert.refusal.hire.insufficient-funds', severity: 'warning' },
    ]);
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(alerts![0]!.labelKey);
    expect(sentence).not.toBe(alerts![0]!.labelKey);
    expect(sentence.trim().length).toBeGreaterThan(0);
    // Not the purchase sentence. The two refusals share a condition and must
    // not share a message, or a player who pressed Hire is sent to the Build
    // panel to look for materials they never ordered.
    expect(sentence).not.toBe(localizer.format('hud.alert.refusal.purchase.insufficient-funds'));
  });

  it('refuses a role the catalogue does not declare, and records it as its own reason', () => {
    const runtime = createNewSimulationRuntime(SEED);

    submitHire(runtime, 'cmd-hire-ghost', { staffRoleId: 'staff-role.dragon-tamer', x: ORIGIN.x, y: ORIGIN.y });

    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(runtime.refusals.last?.reason).toBe('hire.unknown-role');
  });

  it('refuses a hire into a full roster rather than throwing out of the command handler', () => {
    /*
     * The one refusal a session cannot reach through the command path -- the
     * default roster holds 500 and the opening balance buys 312 -- so it is
     * driven against the service directly, with a roster small enough to fill.
     *
     * It is not a policy and it is worth a test for that reason:
     * `EntityStore.spawn()` *throws* when its capacity is exhausted, and a
     * throw out of the kernel's command handler is a crashed tick on a command
     * the worker has already acknowledged as queued. Without the check this
     * would not be a refused hire, it would be a dead session.
     */
    const roster = new GuardRoster(2);
    const treasury = new Treasury(10 * WAGE);
    const hiring = new StaffHiringService(roster, treasury);

    expect(hiring.hire({ staffRoleId: GUARD, originTile: { x: tileCoordinate(1), y: tileCoordinate(1) } }).kind).toBe('hired');
    expect(hiring.hire({ staffRoleId: GUARD, originTile: { x: tileCoordinate(1), y: tileCoordinate(1) } }).kind).toBe('hired');

    const refused = hiring.hire({ staffRoleId: GUARD, originTile: { x: tileCoordinate(1), y: tileCoordinate(1) } });
    expect(refused).toEqual({ kind: 'refused', reason: 'roster-full' });
    // And it changed nothing: the third hire took no money and left the store
    // exactly as full as it was.
    expect(roster.allGuardIds()).toHaveLength(2);
    expect(treasury.balanceMinorUnits).toBe(10 * WAGE - 2 * WAGE);
  });
});
