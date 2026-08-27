import { describe, expect, it } from 'vitest';
import { IntelligenceLedger } from '../../src/simulation/contraband/intelligence';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { createSaveEnvelope, decodeSaveEnvelope } from '../../src/persistence/save-schema';

/**
 * ADR 0012 category 1 for `IntelligenceLedger`: the counter that mints
 * `intel.<n>` is part of this subsystem's snapshot, so a restored session
 * continues the writing session's numbering instead of re-deriving it.
 *
 * ADR 0012's Decision asserted that `EntityStore`, `IntelligenceLedger` and
 * `IncidentTriggerSystem` "already satisfy this". Two of the three did.
 * `IntelligenceLedger` re-derived the counter from the maximum surviving id
 * suffix -- and `decayAll` *deletes* expired records, so the surviving maximum
 * is a lower bound on what has been minted, not the counter. The ADR's own
 * Context table says as much in the same document ("restored from max
 * suffix"), which is the two halves of one ADR disagreeing rather than a
 * hidden defect.
 *
 * The ids are persisted -- they are the key of every row in the payload's
 * `intelligence` array -- so this is a save-boundary divergence and not a
 * private counter, which is exactly the condition ADR 0012's Context names as
 * the moment this shape becomes a defect.
 *
 * ### What is asserted, and what is deliberately not
 *
 * The expected ids are **literals**. Comparing a restored ledger's next id
 * against a continuous ledger's next id would be the right shape of question,
 * but `intel.4` is written out here as well so a change that moved *both*
 * runs together still fails.
 */
const SEED = 4242;

/** Three tips, the third weak enough that one decay pass expires it. */
function reportAndDecay(ledger: IntelligenceLedger): void {
  ledger.report('cell', 'cell-1', 0.9, 'informant', 0);
  ledger.report('cell', 'cell-2', 0.9, 'informant', 0);
  ledger.report('cell', 'cell-3', 0.2, 'observation', 0);
  ledger.decayAll(0.2);
}

describe('intel.<n> is an allocated identity that survives a save boundary', () => {
  it('continues the writing session\'s numbering instead of re-deriving it from surviving ids', () => {
    const continuous = new IntelligenceLedger();
    reportAndDecay(continuous);

    // The premise, asserted rather than assumed: the third record is gone, so
    // the maximum surviving suffix is 2 while three ids have been minted.
    expect(continuous.all().map((record) => record.id)).toEqual(['intel.1', 'intel.2']);
    expect(continuous.getSequence()).toBe(3);

    const restored = new IntelligenceLedger();
    restored.loadSnapshot(
      JSON.parse(JSON.stringify(continuous.getSnapshot())) as ReturnType<IntelligenceLedger['getSnapshot']>,
      continuous.getSequence(),
    );

    expect(restored.report('sector', 'sector-a', 0.5, 'observation', 1)).toBe('intel.4');
    expect(continuous.report('sector', 'sector-a', 0.5, 'observation', 1)).toBe('intel.4');
  });

  it('falls back to the maximum surviving suffix when a save does not record the counter', () => {
    // A save written before the field existed. Absence means what every build
    // did then, which is the whole of why this needed no version bump
    // (ADR 0038 §1) -- and it is a *divergence that remains*, recorded in
    // `docs/DETERMINISM.md`, not a case that is now repaired.
    const source = new IntelligenceLedger();
    reportAndDecay(source);

    const older = new IntelligenceLedger();
    older.loadSnapshot(JSON.parse(JSON.stringify(source.getSnapshot())) as ReturnType<IntelligenceLedger['getSnapshot']>);

    expect(older.report('sector', 'sector-a', 0.5, 'observation', 1)).toBe('intel.3');
  });

  it('treats a recorded counter below the ids it carries as a floor, never re-minting a live id', () => {
    // ADR 0012 category 1 requires the counter be restored "such that no
    // future id can collide with a restored one". A hand-edited or corrupted
    // counter must not be able to break that.
    const source = new IntelligenceLedger();
    source.report('cell', 'cell-1', 0.9, 'informant', 0);
    source.report('cell', 'cell-2', 0.9, 'informant', 0);

    const restored = new IntelligenceLedger();
    restored.loadSnapshot(
      JSON.parse(JSON.stringify(source.getSnapshot())) as ReturnType<IntelligenceLedger['getSnapshot']>,
      0,
    );

    expect(restored.report('sector', 'sector-a', 0.5, 'observation', 1)).toBe('intel.3');
    // And both restored records are still the ones they were.
    expect(restored.get('intel.1')?.targetId).toBe('cell-1');
    expect(restored.get('intel.2')?.targetId).toBe('cell-2');
  });

  it('carries the counter through the real save boundary, not only through captureSessionSnapshot', () => {
    const runtime = createNewSimulationRuntime(SEED);
    reportAndDecay(runtime.intelligence);

    const bundle = captureSessionSnapshot(runtime);
    const envelope = createSaveEnvelope({
      ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'intel-prison',
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
      ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });

    // The counter is in the bytes, at its declared place, not merely in the
    // in-memory bundle: `JSON.stringify` drops nothing it does not know about,
    // and a `.strict()` schema would have refused a key it had not declared.
    expect(envelope.payload.simulation?.contraband.intelligenceSequence).toBe(3);

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const { runtime: restored } = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle);
    expect(restored.intelligence.all().map((record) => record.id)).toEqual(['intel.1', 'intel.2']);
    expect(restored.intelligence.report('sector', 'sector-a', 0.5, 'observation', 1)).toBe('intel.4');
  });
});
