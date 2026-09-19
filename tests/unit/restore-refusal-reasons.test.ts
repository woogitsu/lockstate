import { describe, expect, it } from 'vitest';
import { createNewSimulationRuntime, DEFAULT_PRISONER_CAPACITY } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import {
  declaredRestoreFailureReason,
  restoreFailureReasonOf,
  SnapshotRefusedError,
  type RestoreFailureReason,
} from '../../src/simulation/runtime/restore-refusal';

/**
 * #431: a restore refusal now says *whose* fault it is, and every case below
 * drives a real payload through the real `restoreSimulationRuntime` to find
 * out. None of them constructs a `SnapshotRefusedError` and reads its own
 * `reason` back — that would hold for any implementation, including one that
 * classified nothing, and it is the exact shape `docs/TESTING.md` calls a
 * fixture supplying both sides of the comparison.
 *
 * What is asserted is the *reason a real refusal produced*, and separately
 * that the reason does not come from the message: the last two cases take the
 * verbatim text of a real refusal, put it on an ordinary `RangeError`, and
 * require the answer to change.
 */

/** A bundle a fresh session would write, as the starting point every mutation below edits one field of. */
function healthyBundle(): SessionSnapshotBundle {
  return captureSessionSnapshot(createNewSimulationRuntime(7));
}

/** Restores `bundle` and reports the classifier's verdict, or `'restored'` when it did not fail at all. */
function reasonFor(bundle: SessionSnapshotBundle): RestoreFailureReason | 'restored' {
  try {
    restoreSimulationRuntime(bundle);
    return 'restored';
  } catch (error) {
    return restoreFailureReasonOf(error);
  }
}

/** The message a real refusal produced, so a later case can reuse the words without the class. */
function messageFor(bundle: SessionSnapshotBundle): string {
  try {
    restoreSimulationRuntime(bundle);
    throw new Error('This bundle restored; it was supposed to be refused.');
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('a restore refusal names the side the fault is on', () => {
  /**
   * The control. Every case below differs from this one in exactly one field,
   * so a reason that came back for the wrong reason — a bundle that was
   * broken before the mutation — would show up here first.
   */
  it('restores an unmutated bundle, so every refusal below is caused by its own mutation', () => {
    expect(reasonFor(healthyBundle())).toBe('restored');
  });

  describe('the save is coherent and this build cannot read it', () => {
    /**
     * The specimen #433 left behind. That issue made the checked-in V1 fixture
     * *restorable* — `tests/integration/session-restore-failure.test.ts`
     * restores it and reads both entity ids back — by replacing a comparison of
     * two array lengths with a comparison of the written prefix against the
     * capacity. What survives as a genuine refusal is the case that comparison
     * still refuses: a ledger whose written slots outnumber the ones this build
     * can address. Nothing is wrong with those bytes and a build with a wider
     * store reads them, which is what makes this the other reason and not
     * `damaged-payload`.
     */
    it('refuses an entity ledger wider than this build allocates as unsupported-by-this-build', () => {
      const bundle = healthyBundle();
      const capacity = DEFAULT_PRISONER_CAPACITY + 1;
      // Rebuilt without `simulation` rather than with `simulation: undefined`:
      // `exactOptionalPropertyTypes` is on, and an absent section is what a
      // V2-shaped bundle actually looks like.
      const { simulation: _dropped, ...withoutSystems } = bundle;
      const wide: SessionSnapshotBundle = {
        ...withoutSystems,
        entities: {
          capacity,
          nextAvailableIndex: capacity,
          maxActiveIndex: capacity - 1,
          generations: [[0, capacity]],
          freeIndices: [],
          alive: [[0, capacity]],
        },
      };
      expect(reasonFor(wide)).toBe('unsupported-by-this-build');
      expect(messageFor(wide)).toContain(`${capacity} written slots`);
    });

    it('refuses a world snapshot version it does not implement as unsupported-by-this-build', () => {
      const bundle = healthyBundle();
      const future = { ...bundle, world: { ...bundle.world, version: 2 } } as unknown as SessionSnapshotBundle;
      expect(reasonFor(future)).toBe('unsupported-by-this-build');
    });

    it('refuses an actor-identity snapshot version it does not implement as unsupported-by-this-build', () => {
      const bundle = healthyBundle();
      if (bundle.identity === undefined) throw new Error('A fresh capture carries an identity section; this fixture is wrong.');
      const future = { ...bundle, identity: { ...bundle.identity, version: 99 } } as unknown as SessionSnapshotBundle;
      expect(reasonFor(future)).toBe('unsupported-by-this-build');
    });

    it('refuses an RNG algorithm it does not implement as unsupported-by-this-build', () => {
      const bundle = healthyBundle();
      const [first, ...rest] = bundle.kernel.rngStates;
      if (first === undefined) throw new Error('A fresh capture carries four RNG streams; this fixture is wrong.');
      const future = {
        ...bundle,
        kernel: { ...bundle.kernel, rngStates: [{ ...first, state: { ...first.state, algorithm: 'xoshiro256++' } }, ...rest] },
      } as unknown as SessionSnapshotBundle;
      expect(reasonFor(future)).toBe('unsupported-by-this-build');
    });
  });

  describe('the save contradicts itself', () => {
    it('refuses a terrain run that does not fill its chunk as damaged-payload', () => {
      const bundle = healthyBundle();
      const damaged = {
        ...bundle,
        world: {
          ...bundle.world,
          chunks: [{ x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 4]] }],
        },
      } as unknown as SessionSnapshotBundle;
      expect(reasonFor(damaged)).toBe('damaged-payload');
    });

    it('refuses an RNG stream that is not four words as damaged-payload', () => {
      const bundle = healthyBundle();
      const [first, ...rest] = bundle.kernel.rngStates;
      if (first === undefined) throw new Error('A fresh capture carries four RNG streams; this fixture is wrong.');
      const damaged = {
        ...bundle,
        kernel: { ...bundle.kernel, rngStates: [{ ...first, state: { ...first.state, words: [1, 2, 3] } }, ...rest] },
      } as unknown as SessionSnapshotBundle;
      expect(reasonFor(damaged)).toBe('damaged-payload');
    });

    it('refuses prisoner components with no ledger beside them as damaged-payload', () => {
      const { entities: _dropped, ...withoutLedger } = healthyBundle();
      expect(reasonFor(withoutLedger)).toBe('damaged-payload');
    });

    /**
     * ADR 0038 deferred this one by name — *"`construction/system.ts` has the
     * same replace-without-checking shape and produces a **`TypeError`** on a
     * plausible corruption ... its right home is #403 mitigation (a), where a
     * `TypeError` from our own restore code is the motivating example for
     * classifying code-fault against data-fault."* Before the guard this
     * payload produced `Cannot read properties of undefined (reading 'map')`,
     * which this taxonomy would have had to read as *our* defect.
     */
    it('refuses a construction section with no orders array as damaged-payload, where it used to throw a TypeError', () => {
      const bundle = healthyBundle();
      const damaged = { ...bundle, construction: { ...bundle.construction, orders: undefined } } as unknown as SessionSnapshotBundle;
      expect(reasonFor(damaged)).toBe('damaged-payload');
      expect(messageFor(damaged)).not.toContain('Cannot read properties');
    });
  });

  describe('nothing declared a refusal, so the fault is ours', () => {
    /**
     * A real one, not a stub, and deliberately a case
     * `src/simulation/runtime/restore-refusal.ts` says it leaves undeclared:
     * `NamedRngStreams`' uniqueness rule is shared with a live session, so
     * relabelling it would tell a developer who mistyped a stream name in code
     * that a save was bad. The consequence is recorded here rather than left
     * to be rediscovered — such a payload is blamed on this build, which costs
     * the player nothing (the walk in `SessionController.loadPrison` retires
     * no generation for it) and costs us an honest "we do not know".
     */
    it('blames this build for an exception no check on the restore path declared', () => {
      const bundle = healthyBundle();
      const [first] = bundle.kernel.rngStates;
      if (first === undefined) throw new Error('A fresh capture carries four RNG streams; this fixture is wrong.');
      const duplicated: SessionSnapshotBundle = { ...bundle, kernel: { ...bundle.kernel, rngStates: [first, first] } };
      expect(reasonFor(duplicated)).toBe('restore-code-fault');
    });
  });
});

describe('the reason comes from the class that raised it, never from its words', () => {
  /**
   * The pair that makes the claim falsifiable. The message is the *same
   * string* in both cases — read out of a real refusal rather than written
   * here — and the answer differs, so no implementation that read the message
   * could pass both.
   */
  const bundle = healthyBundle();
  const damaged = {
    ...bundle,
    world: {
      ...bundle.world,
      chunks: [{ x: 0, y: 0, lifecycle: 'loaded', geometryRevision: 0, contentRevision: 0, dirty: false, terrain: [[1, 4]] }],
    },
  } as unknown as SessionSnapshotBundle;
  const realMessage = messageFor(damaged);

  it('reads a real refusal as a refusal', () => {
    expect(realMessage.length).toBeGreaterThan(0);
    expect(reasonFor(damaged)).toBe('damaged-payload');
  });

  it('reads the identical words on an ordinary error as this build faulting', () => {
    expect(restoreFailureReasonOf(new RangeError(realMessage))).toBe('restore-code-fault');
  });

  it('reads a declared refusal carrying no recognisable words at all as the reason it declared', () => {
    expect(restoreFailureReasonOf(new SnapshotRefusedError('unsupported-by-this-build', 'xyzzy'))).toBe('unsupported-by-this-build');
  });

  it('blames this build for a thrown value that is not an error at all', () => {
    expect(restoreFailureReasonOf('damaged-payload')).toBe('restore-code-fault');
  });
});

describe('a reason read back off the wire is narrowed, not cast', () => {
  it('accepts each declared value', () => {
    expect(declaredRestoreFailureReason({ snapshotRestore: 'damaged-payload' })).toBe('damaged-payload');
    expect(declaredRestoreFailureReason({ snapshotRestore: 'unsupported-by-this-build' })).toBe('unsupported-by-this-build');
    expect(declaredRestoreFailureReason({ snapshotRestore: 'restore-code-fault' })).toBe('restore-code-fault');
  });

  it('reports no reason for details that declare none, so the caller decides rather than guessing', () => {
    expect(declaredRestoreFailureReason(undefined)).toBeUndefined();
    expect(declaredRestoreFailureReason({})).toBeUndefined();
    expect(declaredRestoreFailureReason({ snapshotRestore: 'damaged payload' })).toBeUndefined();
    expect(declaredRestoreFailureReason({ snapshotRestore: 7 })).toBeUndefined();
    expect(declaredRestoreFailureReason('damaged-payload')).toBeUndefined();
    expect(declaredRestoreFailureReason(null)).toBeUndefined();
  });
});
