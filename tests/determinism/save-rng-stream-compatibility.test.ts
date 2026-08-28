import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * What a save has to carry for this build to load it, on the one section that
 * had no answer: the kernel's named RNG streams (issue #415, ADR 0038).
 *
 * ### The defect these cases were written against
 *
 * `Kernel.restoreState` used to do `this._rng = new NamedRngStreams(snapshot.rngStates)`
 * -- replace, not merge -- discarding the streams the runtime factory had
 * just derived from the master seed. A bundle that omitted a stream therefore
 * restored **clean**, played **clean**, and threw `RangeError: Unknown RNG
 * stream` out of `Kernel.step()` at the first draw, which the worker's
 * tick-loop catch turns into a non-recoverable `internal-error` and a terminal
 * `faulted` state.
 *
 * Measured on the unfixed tree, from a capture of this same scenario at tick 0:
 * removing `identity.actor-name` survives 5 further ticks, `prisoners.classification`
 * 10, `contraband.detection` 20, and `contraband.intelligence` all 600 that
 * were tried -- and the *same* removals from a capture at tick 40 survive 600
 * ticks each, because that scenario has already made every draw it is going to
 * make. **So no case below asserts that stepping did not throw**, and one that
 * did would have passed on the unfixed code for four scenarios out of eight.
 * Each asserts the restored kernel's stream set and the words in it.
 *
 * ### Why the expected stream set is written out longhand
 *
 * `docs/TESTING.md` and #415's own Required Verification: an expected value the
 * code under test produced holds for any implementation of it. Asking
 * `createNewSimulationRuntime` which streams it registers would agree with
 * `Kernel.restoreState` however wrong both were. The four names and the words
 * they derive to are literals here, so **adding a stream to `new-session.ts`
 * must fail this file** -- which is exactly the delivery hazard #415 is about,
 * made loud at the one place that can see it.
 *
 * **It did exactly that, once, on purpose.** ADR 0061 added a fifth stream,
 * `contraband.introduction`, and every case below failed until the list and
 * both word tables were extended by hand. That is this file working, and the
 * extension is the deliberate, reviewed edit the paragraph above asks for --
 * an old save that omits the stream still restores, seeded from its own
 * `masterSeed`, which is the property the fifth entry now also pins.
 */

/**
 * The streams a session registers, in the order `NamedRngStreams.snapshot()`
 * emits them (sorted by name).
 *
 * Written out, never read from `new-session.ts`. If this list is wrong the
 * cases below fail; if it goes stale the cases below fail. That is the point.
 */
const REGISTERED_STREAMS = ['contraband.detection', 'contraband.intelligence', 'contraband.introduction', 'identity.actor-name', 'prisoners.classification'] as const;

/**
 * `deriveXoshiroState(seed, name).words` for the two seeds these cases use,
 * as literals rather than as a call to the deriving function.
 *
 * A re-seed is only worth anything if it puts the stream at the state *this
 * build's own session-creation path* would have put it at, and if every client
 * loading the same bundle gets the same one. Pinning the words is what says so:
 * an implementation that seeded from the stream name alone, from a counter, or
 * from `Math.random()` would satisfy "the stream exists" and fail here.
 */
const DERIVED_WORDS_AT_SCENARIO_SEED: Readonly<Record<string, readonly number[]>> = {
  'contraband.detection': [621309470, 3931153762, 2125939972, 1520548512],
  'contraband.intelligence': [2519336100, 114212703, 3399945750, 2853866658],
  'contraband.introduction': [3484590104, 358788944, 3779368715, 3836528074],
  'identity.actor-name': [1389004806, 3929526187, 801062818, 758337395],
  'prisoners.classification': [3766015752, 2847574757, 3141289015, 3676423178],
};

const DERIVED_WORDS_AT_SEED_ZERO: Readonly<Record<string, readonly number[]>> = {
  'contraband.detection': [3390858590, 1748548753, 4190260694, 3918636925],
  'contraband.intelligence': [2712648297, 2312656903, 3076870406, 3014949915],
  'contraband.introduction': [4191607977, 1599308922, 1831874870, 2722278899],
  'identity.actor-name': [53358203, 2080006951, 2778740427, 1505507477],
  'prisoners.classification': [1731836178, 401524879, 2842153704, 1358188498],
};

/**
 * A stream name no build in this repository registers -- and not an invented
 * one: `tests/fixtures/persistence/save-v1-in-progress.json` really carries it,
 * so "a save from a build that had a stream this one does not" is a shape that
 * has already happened here rather than a hypothetical.
 */
const UNREGISTERED_STREAM = 'world.terrain';

const V1_FRESH_PRISON_FIXTURE = new URL('../fixtures/persistence/save-v1-fresh-prison.json', import.meta.url);

function streamNames(bundle: SessionSnapshotBundle): readonly string[] {
  return bundle.kernel.rngStates.map((entry) => entry.name);
}

function wordsOf(bundle: SessionSnapshotBundle, name: string): readonly number[] {
  const entry = bundle.kernel.rngStates.find((state) => state.name === name);
  if (entry === undefined) throw new Error(`the bundle carries no "${name}" stream`);
  return entry.state.words;
}

/** The scenario, captured at `ticks`. Its `masterSeed` is `SCENARIO_SEED`, which the bundle now records. */
function scenarioBundle(ticks: number): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
  return captureSessionSnapshot(runtime);
}

function without(bundle: SessionSnapshotBundle, ...names: readonly string[]): SessionSnapshotBundle {
  return { ...bundle, kernel: { ...bundle.kernel, rngStates: bundle.kernel.rngStates.filter((entry) => !names.includes(entry.name)) } };
}

describe('a save that omits a named RNG stream this build registers', () => {
  it('restores with every registered stream present, seeded from the master seed', () => {
    const saved = scenarioBundle(0);
    // Non-vacuous: the capture really did carry the stream that is about to be
    // removed, so the case measures a removal and not an absence.
    expect(streamNames(saved)).toEqual([...REGISTERED_STREAMS]);

    const { runtime } = restoreSimulationRuntime(without(saved, 'prisoners.classification'));
    const restored = captureSessionSnapshot(runtime);

    expect(streamNames(restored)).toEqual([...REGISTERED_STREAMS]);
    expect(wordsOf(restored, 'prisoners.classification')).toEqual(DERIVED_WORDS_AT_SCENARIO_SEED['prisoners.classification']);
  });

  it('leaves every stream the save does carry exactly where the save left it', () => {
    // The other half of "merge": a stream the bundle carries must win over the
    // derived state, or a restore would silently rewind three streams to
    // session-creation while repairing the fourth.
    const saved = scenarioBundle(120);
    const { runtime } = restoreSimulationRuntime(without(saved, 'prisoners.classification'));
    const restored = captureSessionSnapshot(runtime);

    for (const name of REGISTERED_STREAMS) {
      if (name === 'prisoners.classification') continue;
      expect(wordsOf(restored, name), `${name} must come from the save`).toEqual(wordsOf(saved, name));
    }

    // Non-vacuity, and it can only be claimed for the streams this scenario
    // actually draws: by tick 120 these two have moved off their derived state,
    // so the two assertions above are the save winning and not the re-seed
    // agreeing with it by coincidence.
    for (const name of ['contraband.detection', 'identity.actor-name'] as const) {
      expect(wordsOf(saved, name), `${name} must have been drawn from by tick 120`).not.toEqual(DERIVED_WORDS_AT_SCENARIO_SEED[name]);
    }

    // `contraband.intelligence` is the exception and it is a finding, not an
    // oversight: it is registered, snapshotted and **drawn by nothing** in
    // `src/` -- `rng.get`'s four call sites name the other three -- so at tick
    // 120 it still sits on its derived words and cannot serve as a control.
    // ADR 0038's open question 3 asks whether it should still exist; this line
    // is the evidence that question rests on.
    expect(wordsOf(saved, 'contraband.intelligence')).toEqual(DERIVED_WORDS_AT_SCENARIO_SEED['contraband.intelligence']);
  });

  it('re-seeds from the seed the save records, not from the seed the caller happens to pass', () => {
    // #415 and #412 meet here. The moment a restore has to *seed* a stream, the
    // master seed stops being superseded by the snapshot and becomes the only
    // input that stream has -- so a save that does not report its seed can only
    // be re-seeded at 0, and this build's saves report it.
    const saved = scenarioBundle(0);
    expect(saved.masterSeed).toBe(SCENARIO_SEED);

    const { runtime } = restoreSimulationRuntime(without(saved, 'prisoners.classification'));
    expect(wordsOf(captureSessionSnapshot(runtime), 'prisoners.classification')).toEqual(DERIVED_WORDS_AT_SCENARIO_SEED['prisoners.classification']);

    // The same bundle as an older build wrote it: no `masterSeed` field at all.
    // Absence means 0 (ADR 0038 §4), so the repair lands on the seed-0 state --
    // which is what every save written before the field existed was played at.
    const { masterSeed: _dropped, ...seedless } = saved;
    const older = restoreSimulationRuntime(without(seedless, 'prisoners.classification'));
    expect(wordsOf(captureSessionSnapshot(older.runtime), 'prisoners.classification')).toEqual(DERIVED_WORDS_AT_SEED_ZERO['prisoners.classification']);
  });

  it('restores the same state on every client, which is the property being claimed', () => {
    // Deterministic, and deliberately the *weaker* property: same bundle, same
    // state, every load. A restored session that seeds a stream at tick T is
    // **not** equal to a continuous run under a build that had that stream from
    // tick 0 -- that run would have been drawing from it all along. ADR 0038
    // records the divergence rather than claiming it away.
    const stripped = without(scenarioBundle(40), 'contraband.detection', 'identity.actor-name');
    const first = captureSessionSnapshot(restoreSimulationRuntime(stripped).runtime);
    const second = captureSessionSnapshot(restoreSimulationRuntime(stripped).runtime);
    expect(second.kernel.rngStates).toEqual(first.kernel.rngStates);
  });
});

describe('a save that carries a named RNG stream this build does not register', () => {
  /**
   * Stated as a guard rather than as a repair, and it passed on the unfixed
   * tree too: replacing the instance kept an unregistered stream for the same
   * reason it lost a registered one -- whatever the bundle said, went. What
   * this case denies is the *other* way a merge could have been written, where
   * the build's own set is the authority and anything outside it is discarded.
   * That would make loading a save lossy in a way no error reports, and it is
   * the direction a reader of `restoreState` might reasonably take it next.
   */
  it('keeps it rather than dropping it, so loading a save is never lossy', () => {
    const saved = scenarioBundle(0);
    const withExtra: SessionSnapshotBundle = {
      ...saved,
      kernel: {
        ...saved.kernel,
        rngStates: [...saved.kernel.rngStates, { name: UNREGISTERED_STREAM, state: { algorithm: 'xoshiro128**', version: 1, words: [11, 22, 33, 44] } }],
      },
    };

    const { runtime } = restoreSimulationRuntime(withExtra);
    const recaptured = captureSessionSnapshot(runtime);

    expect(streamNames(recaptured)).toEqual([...REGISTERED_STREAMS, UNREGISTERED_STREAM].sort());
    // Untouched, not merely present: nothing in this build draws from it, and a
    // player who rolls back to the build that did must find their session where
    // they left it.
    expect(wordsOf(recaptured, UNREGISTERED_STREAM)).toEqual([11, 22, 33, 44]);
  });
});

describe("the repository's own V1 fixture", () => {
  /**
   * `save-v1-fresh-prison.json:13` carries `"rngStates": []` and no migration
   * step repairs it -- every step in `save-migrations.ts` copies `kernel`
   * through verbatim. On the unfixed tree it restored clean, played 600 quiet
   * ticks, and threw `Unknown RNG stream: identity.actor-name` five ticks after
   * the player's first Admit.
   */
  it('loads with every stream this build registers, and admitting a prisoner names them', () => {
    const decoded = decodeSaveEnvelope(JSON.parse(readFileSync(V1_FRESH_PRISON_FIXTURE, 'utf8')));
    if (!decoded.ok) throw new Error(`the fixture no longer decodes: ${decoded.error.code}`);
    expect(decoded.migrated).toBe(true);
    // The state of the corpus this case exists for: a real save carrying none
    // of the streams this build needs.
    expect(decoded.value.payload.kernel.rngStates).toEqual([]);

    const { runtime } = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle);
    expect(streamNames(captureSessionSnapshot(runtime))).toEqual([...REGISTERED_STREAMS]);
    // A V1 save records no seed, so 0 -- the seed every session that could have
    // written it was played at.
    expect(wordsOf(captureSessionSnapshot(runtime), 'identity.actor-name')).toEqual(DERIVED_WORDS_AT_SEED_ZERO['identity.actor-name']);

    // The player's first Admit, which is what used to detonate. The assertion
    // is on the *drawn* result -- a name minted from `identity.actor-name` --
    // rather than on having survived some number of ticks.
    const prisoner = runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, { x: 1, y: 1 });
    for (let step = 0; step < 60; step += 1) runtime.kernel.step();

    const name = runtime.actorIdentity.getName('prisoner', prisoner);
    expect(name?.givenName.length).toBeGreaterThan(0);
    expect(name?.familyName.length).toBeGreaterThan(0);
    expect(runtime.kernel.tick).toBe(60);
  });
});

/**
 * A stripped bundle driven through the **real worker entry module** --
 * `src/simulation/worker/worker.ts`, what `src/main.ts` loads and what the
 * production build emits -- because the code path being denied is the one that
 * only exists there: `onTickLoop`'s catch, which calls `fault('internal-error',
 * ...)` with no options and so takes `recoverable = false` and transitions to
 * `faulted`, out of which no transition exists.
 *
 * ADR 0024 §1 is why this is the right shape of fix rather than making
 * `internal-error` recoverable: an unhandled exception "may have left a system
 * part-way through its work" and those are real faults. What may never be one
 * is a statement about which build wrote the save.
 */
interface WorkerGlobalStub {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: readonly Transferable[]) => void;
  addEventListener: (type: string, listener: unknown) => void;
}

describe('a save-compatibility condition never reaches the worker as an internal error', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('runs a stream-short save past every tick at which it used to fault', async () => {
    const posted: unknown[] = [];
    const stub: WorkerGlobalStub = { onmessage: null, postMessage: (message) => void posted.push(message), addEventListener: () => {} };
    vi.stubGlobal('self', stub);
    vi.resetModules();
    await import('../../src/simulation/worker/worker');
    const handler = stub.onmessage;
    if (handler === null) throw new Error('the worker entry point installed no onmessage handler');
    const deliver = (data: unknown): void => handler(new MessageEvent('message', { data }));
    const lastOfKind = (kind: string): { readonly payload: Record<string, unknown> } | undefined =>
      [...posted].reverse().find((message) => (message as { kind: string }).kind === kind) as { readonly payload: Record<string, unknown> } | undefined;

    // Every registered stream removed, from a capture at tick 0 -- the worst
    // row of the measured table, where the unfixed build faulted after 5.
    const stripped = without(scenarioBundle(0), ...REGISTERED_STREAMS);
    expect(stripped.kernel.rngStates).toEqual([]);

    deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'initialize-1',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-415',
        source: { kind: 'snapshot', snapshot: { transport: 'structured-clone', schemaId: SESSION_SNAPSHOT_SCHEMA_ID, schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION, data: stripped as unknown as null } },
      },
    });
    expect(lastOfKind('simulation/ready'), 'the worker must accept the save at all').toBeDefined();

    deliver({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'run-1', kind: 'simulation/set-clock', payload: { mode: 'running', speed: 1 } });
    // 120 wakes at 50 ms is 120 ticks: past 5, 10 and 20, the three measured
    // distances between the load and the throw it used to cause.
    for (let wake = 0; wake < 120; wake += 1) vi.advanceTimersByTime(50);

    const faults = posted.filter((message) => (message as { kind: string }).kind === 'protocol/error') as readonly { readonly payload: { readonly code: string; readonly recoverable: boolean } }[];
    expect(faults, `the worker faulted: ${JSON.stringify(faults.map((fault) => fault.payload))}`).toEqual([]);

    // Asserted through the protocol rather than by surviving: the session the
    // worker is holding has every registered stream, so there is no later tick at
    // which this save can start throwing either.
    deliver({ protocolVersion: SIMULATION_PROTOCOL_VERSION, messageId: 'snapshot-1', kind: 'simulation/request-snapshot', payload: { reason: 'consistency-check' } });
    const reply = lastOfKind('simulation/snapshot');
    if (reply === undefined) throw new Error('the worker returned no snapshot');
    const bundle = (reply.payload as { readonly snapshot: { readonly data: SessionSnapshotBundle } }).snapshot.data;
    expect(streamNames(bundle)).toEqual([...REGISTERED_STREAMS]);
    expect(bundle.kernel.tick).toBeGreaterThanOrEqual(120);
  });
});
