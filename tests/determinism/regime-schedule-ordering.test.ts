import { describe, expect, it } from 'vitest';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import { CLASSIFICATION_GROUP_IDS } from '../../src/simulation/prisoners/components';
import { DAY_LENGTH_TICKS, findRegimeSchedule } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import type { JsonValue } from '../../src/shared/json';

/**
 * What the per-group regime lookup iterates, and how it stays ordered
 * ([ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
 * §4).
 *
 * ## The argument these tests are the evidence for
 *
 * `ActionSystem` asks `findRegimeSchedule(this.regimeSchedules(), groupId)` per
 * idle prisoner per reconsideration cycle. That is a linear `.find()` over the
 * registry's array -- **not** a `Map`/`Set` enumeration, so
 * `docs/DETERMINISM.md`'s canonical-iteration rule has nothing to bind and
 * `canonical-iteration-contract.test.ts` needs no allow-list entry for it.
 * `.find()`'s *result* does not depend on array order at all: ids are unique
 * (`RegimeScheduleRegistry` rejects a duplicate) so there is exactly one match
 * whatever the order.
 *
 * Order still matters, for one reason, and it is the reason ADR 0113 §4 gives:
 * the array is **serialised**. `captureSessionSystems` writes it into
 * `payload.simulation.regimeSchedules` and `computeSaveChecksum` hashes it, so
 * an insertion-ordered array would make a save's checksum depend on the
 * history of writes that produced it -- the failure #177 extended the static
 * scanner to `src/persistence/` to catch. The rule is therefore that the array
 * is reconstructed in `CLASSIFICATION_GROUP_IDS` declaration order rather than
 * in whatever order the save listed, and these tests state that as an outcome.
 *
 * Command ordering itself is untouched: `EditRegimeBlock` is dispatched like
 * every other command, ordered by `(executeAtTick, sequence)`, and this adds no
 * `SystemRegistration`, so the kernel's `(order, id)` system sort is untouched
 * too. The same-tick test below is the check on the first half.
 */

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
}

function edit(group: string, startTickOfDay: number, allowedCategories: readonly ('sleep' | 'meal' | 'work' | 'recreation' | 'education' | 'hygiene' | 'free-association')[]) {
  return packCommand({ type: 'EditRegimeBlock', classificationGroupId: group, startTickOfDay, allowedCategories: [...allowedCategories] });
}

describe('regime schedule ordering', () => {
  it('reconstructs the array in `CLASSIFICATION_GROUP_IDS` order whatever order the save listed the rows in', () => {
    const runtime = createNewSimulationRuntime(0x0d1e);
    const bundle = captureSessionSnapshot(runtime);
    if (bundle.simulation === undefined) throw new Error('a captured session must carry a simulation section');

    const reversed = {
      ...bundle,
      simulation: { ...bundle.simulation, regimeSchedules: [...bundle.simulation.regimeSchedules].reverse() },
    };
    expect(reversed.simulation.regimeSchedules.map((s) => s.classificationGroupId)).toEqual(
      [...CLASSIFICATION_GROUP_IDS].reverse(),
    );

    const { runtime: restored } = restoreSimulationRuntime(reversed);
    expect(restored.prisoners.regimes.all().map((s) => s.classificationGroupId)).toEqual([...CLASSIFICATION_GROUP_IDS]);

    // And the whole point of the rule: the same state serialises to the same
    // bytes, so the checksum does not remember which order the file listed.
    expect(computeSaveChecksum(captureSessionSnapshot(restored).simulation as unknown as JsonValue)).toBe(
      computeSaveChecksum(bundle.simulation as unknown as JsonValue),
    );
  });

  it('reaches one state, and one checksum, from two orders of the same two edits', () => {
    const forwards = createNewSimulationRuntime(0x0d1e);
    submit(forwards, 'a', edit('general-population', 1_000, ['recreation']));
    submit(forwards, 'b', edit('high-risk', 2_000, ['education']));
    forwards.kernel.step();

    const backwards = createNewSimulationRuntime(0x0d1e);
    submit(backwards, 'a', edit('high-risk', 2_000, ['education']));
    submit(backwards, 'b', edit('general-population', 1_000, ['recreation']));
    backwards.kernel.step();

    expect(backwards.prisoners.regimes.getSnapshot()).toEqual(forwards.prisoners.regimes.getSnapshot());
    expect(computeSaveChecksum(backwards.prisoners.regimes.getSnapshot() as unknown as JsonValue)).toBe(
      computeSaveChecksum(forwards.prisoners.regimes.getSnapshot() as unknown as JsonValue),
    );
  });

  it('applies two edits of the same block on one tick in `sequence` order, last submitted winning', () => {
    const runtime = createNewSimulationRuntime(0x0d1e);
    const tick = runtime.kernel.tick;

    submit(runtime, 'first', edit('general-population', 0, ['work']));
    submit(runtime, 'second', edit('general-population', 0, ['hygiene']));
    expect(runtime.kernel.tick).toBe(tick);
    runtime.kernel.step();

    const block = findRegimeSchedule(runtime.prisoners.regimes.all(), 'general-population').blocks.find(
      (candidate) => candidate.startTickOfDay === 0,
    );
    expect(block?.allowedCategories).toEqual(['hygiene']);
  });

  it('answers `findRegimeSchedule` identically from the canonical array and from a reversed copy', () => {
    const runtime = createNewSimulationRuntime(0x0d1e);
    submit(runtime, 'a', edit('high-risk', 0, ['sleep', 'meal']));
    runtime.kernel.step();

    const canonical = runtime.prisoners.regimes.all();
    const reversed = [...canonical].reverse();
    for (const groupId of CLASSIFICATION_GROUP_IDS) {
      expect(findRegimeSchedule(reversed, groupId)).toEqual(findRegimeSchedule(canonical, groupId));
    }
  });

  it('keeps every schedule tiling the day exactly once after an edit', () => {
    const runtime = createNewSimulationRuntime(0x0d1e);
    submit(runtime, 'a', edit('general-population', 500, ['sleep']));
    runtime.kernel.step();

    for (const schedule of runtime.prisoners.regimes.all()) {
      let cursor = 0;
      for (const block of schedule.blocks) {
        expect(block.startTickOfDay).toBe(cursor);
        cursor = block.endTickOfDay;
      }
      expect(cursor).toBe(DAY_LENGTH_TICKS);
    }
  });
});
