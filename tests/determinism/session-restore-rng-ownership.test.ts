import { describe, expect, it } from 'vitest';
import { ACTOR_IDENTITY_RNG_STREAM } from '../../src/simulation/identity';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { tileCoordinate, type TilePosition } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * Who owns a session's RNG streams after a restore (DET-01).
 *
 * `Kernel.restoreState` **replaces** the instance --
 * `this._rng = new NamedRngStreams(snapshot.rngStates)` -- and it is the only
 * place in the whole restore path that replaces a collaborator rather than
 * loading a snapshot into the one the session already holds.
 * `restoreSessionSystems` is written the other way round throughout, and says
 * so at the two places it would be tempting not to be: *"Schedules are read
 * live off the runtime's own array, so restoring means refilling that array,
 * not replacing it."*
 *
 * That asymmetry is only safe if nothing captured the pre-restore instance.
 * `createNewSimulationRuntime` did:
 *
 * ```
 * const securityGuards = new GuardRoster(..., () => rng.get(ACTOR_IDENTITY_RNG_STREAM));
 * ```
 *
 * closes over the **local `rng` binding**, not over `kernel.rng`. So after any
 * restore the roster drew names from an orphaned `NamedRngStreams` that no
 * snapshot observes and no restore rebuilds, while every system drew from the
 * new one through `SimulationContext.rng`. Prisoner and guard names share the
 * `identity.actor-name` stream, so a continuous session and a save/load
 * session diverged in **persisted** state -- `SessionSnapshotBundle.identity`
 * -- which is a replay break under ADR 0009 rather than a cosmetic one.
 *
 * ### Why every case below hires through `GuardRoster`, and none through `assign`
 *
 * `tests/integration/session-save-round-trip.test.ts` already re-assigns a
 * name after a restore and asserts the stream is **unchanged**. That is
 * correct and it is why it could not see this: `assign` for an actor that
 * already has a name returns it without drawing, so the case pins a
 * no-change, and a no-change is what the defect also produces. Reaching the
 * mechanism needs a *new* actor, hired after the load, whose name is a draw
 * that has to come from somewhere.
 *
 * ### Why the seed is passed rather than defaulted
 *
 * **This paragraph used to read:** *"`restoreSimulationRuntime`'s `masterSeed`
 * defaults to `0` and both production restores take that default, because
 * `masterSeed` is not in the save payload at all (DET-03, reported separately
 * and deliberately not changed here -- it is a save-schema decision). Passing
 * the real seed keeps these cases measuring one defect: with `0` they would
 * also fail, for the second reason, and would stop being evidence about this
 * one."*
 *
 * **#412 falsified its premise on this branch, and the correction is kept
 * beside it rather than overwriting it**, because a correction is no more
 * durable than the claim it corrected and a reader needs to see which
 * direction moved. `masterSeed` **is** in the save payload
 * (`savePayloadV5Schema.masterSeed`, `src/persistence/save-schema.ts`) and in
 * the bundle (`SessionSnapshotBundle.masterSeed`), and production restores
 * take the recorded value: `restoreSimulationRuntime` opens with
 * `createNewSimulationRuntime(bundle.masterSeed ?? masterSeed, ...)`, so the
 * *bundle* wins wherever it records one.
 *
 * ### What the `masterSeed` parameter's authority actually is, measured
 *
 * Every call in this file passes `SCENARIO_SEED` against a bundle produced by
 * `captureSessionSnapshot` of a runtime built at `SCENARIO_SEED`, so the
 * bundle carries `10` and the argument is `10`. Instrumenting
 * `restoreSimulationRuntime` and running this file reported
 * `bundle-agrees value=10` four times and nothing else: **the argument here is
 * inert, and these cases would read identically without it.** It is kept
 * because it states the intent -- these cases are about stream ownership, not
 * about seed plumbing -- and because it costs nothing.
 *
 * The parameter is *not* inert in general, and it is worth being exact rather
 * than tidy about that. The same instrumentation over the whole suite found:
 *
 * - **no production caller passes it.** `runtime-host.ts` and
 *   `simulation/worker/state-machine.ts` both call
 *   `restoreSimulationRuntime(bundle)`, so production always takes the `= 0`
 *   default -- which is the right value for a save that records none, by the
 *   corpus fact ADR 0038 §4 states.
 * - **36 test calls reach it with a bundle carrying no `masterSeed` and a
 *   non-zero argument**, where it alone decides the seed: 20 at `0xbeef`
 *   (`tests/integration/incident-response-restore.test.ts`, whose
 *   `envelopeFor` helper does not forward `masterSeed` into the envelope), 8
 *   at 10, 4 at 11, 3 at 728775 and 1 at 852001.
 *
 * So the parameter is the default for a bundle that records no seed, it is
 * reachable, and it is overridden -- never consulted -- wherever the bundle
 * does record one.
 */

const HIRE_TILE: TilePosition = { x: tileCoordinate(0), y: tileCoordinate(0) };
const GUARD_ROLE = 'staff-role.guard';
const RESTORE_AT_TICK = 120;

/**
 * The scenario's five guards plus its admitted prisoners, as the identity
 * section carries them at the restore point.
 *
 * A fixture guard, in the shape `docs/TESTING.md` prescribes for a test that
 * states its outcome as a literal: the names pinned below were written
 * against *this* population, and a scenario change that mints a different
 * number of them must fail here rather than quietly agreeing again on a
 * different draw sequence.
 */
const IDENTITY_ENTRIES_AT_RESTORE_POINT = 9;

function actorNameStreamWords(runtime: SimulationRuntime): readonly number[] {
  const stream = runtime.kernel.snapshot().rngStates.find((entry) => entry.name === ACTOR_IDENTITY_RNG_STREAM);
  if (stream === undefined) throw new Error(`the session must register the ${ACTOR_IDENTITY_RNG_STREAM} stream`);
  return stream.state.words;
}

/** One scenario, run to a fixed tick. The reference side: it never restores, so it is unaffected by anything this file measures. */
function runToRestorePoint(): SimulationRuntime {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  for (let step = 0; step < RESTORE_AT_TICK; step += 1) runtime.kernel.step();
  return runtime;
}

describe('RNG stream ownership across a restore', () => {
  it('draws a name for a guard hired after a load from the stream the restore rebuilt', () => {
    const continuous = runToRestorePoint();
    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(continuous), SCENARIO_SEED);

    // The control, on the side that never restored: hiring really does
    // advance this stream, so the assertion below is reachable rather than
    // a claim about a stream nothing draws from.
    const liveBefore = actorNameStreamWords(continuous);
    continuous.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    expect(actorNameStreamWords(continuous), 'hiring must advance `identity.actor-name` at all').not.toEqual(liveBefore);

    const restoredBefore = actorNameStreamWords(restored);
    restored.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    expect(actorNameStreamWords(restored), 'the draw must reach the kernel stream, not an orphan').not.toEqual(restoredBefore);
  });

  it('leaves the shared `identity.actor-name` stream at the same position a continuous session leaves it', () => {
    const continuous = runToRestorePoint();
    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(continuous), SCENARIO_SEED);

    // Equal before, which is `restoreState` doing its job and is what makes
    // the inequality after a hire attributable to the hire.
    expect(actorNameStreamWords(restored)).toEqual(actorNameStreamWords(continuous));

    continuous.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    restored.securityGuards.hire(GUARD_ROLE, HIRE_TILE);

    // This is also the statement about *prisoners*: intake draws its names
    // from this same stream through `SimulationContext.rng`, so a guard hire
    // that left this position untouched would hand the next arrival the name
    // the guard should have taken.
    expect(actorNameStreamWords(restored)).toEqual(actorNameStreamWords(continuous));
  });

  it('gives a guard hired after a load the same name a continuous session gives them', () => {
    const continuous = runToRestorePoint();
    const bundle = captureSessionSnapshot(continuous);
    const { runtime: restored } = restoreSimulationRuntime(bundle, SCENARIO_SEED);

    // The fixture guard the literals below are written against.
    expect(bundle.identity?.entries.length).toBe(IDENTITY_ENTRIES_AT_RESTORE_POINT);

    const liveId = continuous.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    const restoredId = restored.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    // Same slot on both sides, so the names below are compared for the same guard.
    expect(restoredId).toBe(liveId);

    // Stated as a literal rather than read off the continuous run, so the
    // comparison has a side no implementation of the restore path can move.
    const expectedName = { givenName: 'Jonas', familyName: 'Zielen' };
    expect(continuous.actorIdentity.getName('staff', liveId)).toEqual(expectedName);
    expect(restored.actorIdentity.getName('staff', restoredId)).toEqual(expectedName);
  });

  it('writes the same identity section to a save taken after a load as to one taken without it', () => {
    const continuous = runToRestorePoint();
    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(continuous), SCENARIO_SEED);

    continuous.securityGuards.hire(GUARD_ROLE, HIRE_TILE);
    restored.securityGuards.hire(GUARD_ROLE, HIRE_TILE);

    const liveIdentity = captureSessionSnapshot(continuous).identity;
    const restoredIdentity = captureSessionSnapshot(restored).identity;

    // Non-vacuous: both sections carry the whole named population and not an
    // empty registry compared against another empty one.
    expect(liveIdentity?.entries.length).toBe(IDENTITY_ENTRIES_AT_RESTORE_POINT + 1);
    // The replay break, on the surface that actually reaches a save file.
    expect(restoredIdentity).toEqual(liveIdentity);
  });
});
