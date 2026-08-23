import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { computeSaveChecksum } from '../../src/persistence/checksum';
import type { SaveEnvelope } from '../../src/persistence/save-schema';
import { SessionController } from '../../src/persistence/session/session-controller';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  CURRENT_SAVE_RESTORED_SCOPE,
  captureSessionSnapshot,
  restoreSimulationRuntime,
  restoredScopeFor,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { describeRestoredScope } from '../../src/ui/save-panel';

/**
 * The restored scope is what the save panel tells the player came back.
 *
 * It used to be a module constant returned on every restore path, including
 * the legacy one, so a V2 save that carried no prisoners at all was described
 * as having restored "prisoners, needs, actions and cell assignments" (issue
 * #109). Two tests exercised that legacy path and asserted only
 * `scope.restored.length > 0`, which any non-empty array satisfies -- so the
 * suite named the contract and then declined to test it.
 *
 * These assertions are about the *reduced* scope specifically, because the
 * complete one was never the broken case.
 */

/** Only the three sections a V3 payload may omit matter here. */
function bundleWith(sections: {
  readonly entities?: boolean;
  readonly simulation?: boolean;
  readonly identity?: boolean;
}): SessionSnapshotBundle {
  // The restore path is not exercised here, so the required sections can be
  // structurally minimal: `restoredScopeFor` reads presence, never contents.
  const bundle = {
    kernel: {},
    world: {},
    construction: {},
    ...(sections.entities === true ? { entities: {} } : {}),
    ...(sections.simulation === true ? { simulation: {} } : {}),
    ...(sections.identity === true ? { identity: {} } : {}),
  };
  return bundle as unknown as SessionSnapshotBundle;
}

const COMPLETE = bundleWith({ entities: true, simulation: true, identity: true });

describe('the restored scope describes the bundle, not the save version', () => {
  it('reports the full scope for a bundle carrying every section', () => {
    // Pins that the derived answer and the constant cannot drift apart: the
    // determinism suite asserts on the constant by name, so if these two ever
    // disagreed, one of the two layers would be reporting a fiction.
    expect(restoredScopeFor(COMPLETE)).toEqual(CURRENT_SAVE_RESTORED_SCOPE);
    // The same object, so a caller comparing by identity keeps working.
    expect(restoredScopeFor(COMPLETE)).toBe(CURRENT_SAVE_RESTORED_SCOPE);
  });

  it('moves the prisoner subsystems out of restored when a save carries no simulation section', () => {
    const scope = restoredScopeFor(bundleWith({ entities: true, identity: true }));

    for (const entry of [
      'prisoners, needs, actions and cell assignments',
      'jobs, containers and utility networks',
      'doors, security sectors, guards and patrols',
      'contraband, intelligence and searches',
      'incidents, gangs and tunnels',
    ]) {
      expect(scope.restored, `${entry} must not be reported as restored`).not.toContain(entry);
      expect(scope.notCarriedByThisSaveVersion, `${entry} must be reported as absent`).toContain(entry);
    }

    // The sections a V3 payload always carries are unaffected.
    expect(scope.restored).toContain('world terrain and ownership');
    expect(scope.restored).toContain('construction orders and undo/redo');
    expect(scope.restored).toContain('entity id liveness');
    expect(scope.restored).toContain('prisoner and staff names');
  });

  it('moves only the names when a save predates the identity registry', () => {
    const scope = restoredScopeFor(bundleWith({ entities: true, simulation: true }));

    expect(scope.restored).not.toContain('prisoner and staff names');
    expect(scope.notCarriedByThisSaveVersion).toContain('prisoner and staff names');
    // A pre-#75 save still carried every subsystem, so nothing else moves.
    expect(scope.restored).toContain('prisoners, needs, actions and cell assignments');
  });

  it('moves entity liveness when a save carries no entities section', () => {
    const scope = restoredScopeFor(bundleWith({ simulation: true, identity: true }));
    expect(scope.restored).not.toContain('entity id liveness');
    expect(scope.notCarriedByThisSaveVersion).toContain('entity id liveness');
  });

  it('keeps the derived-state exclusions whatever the bundle carries', () => {
    // These two are absent because they are caches, not because of the save
    // version -- so they must survive in every reduced scope, or the reason
    // the right-hand list exists at all is lost.
    for (const bundle of [COMPLETE, bundleWith({}), bundleWith({ entities: true })]) {
      const scope = restoredScopeFor(bundle);
      expect(scope.notCarriedByThisSaveVersion).toContain('room and topology caches (recomputed from the world)');
      expect(scope.notCarriedByThisSaveVersion).toContain(
        'navigation caches and in-flight path requests (re-issued on the next tick)',
      );
    }
  });

  it('never loses or duplicates an entry, whichever sections are absent', () => {
    // The reduced scope is a partition of the complete one. Without this, a
    // rename in one list and not the other would drop an entry silently --
    // which is the shape of the original defect.
    const complete = [...CURRENT_SAVE_RESTORED_SCOPE.restored, ...CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion];
    for (const bundle of [
      COMPLETE,
      bundleWith({}),
      bundleWith({ entities: true }),
      bundleWith({ simulation: true }),
      bundleWith({ identity: true }),
      bundleWith({ entities: true, simulation: true }),
    ]) {
      const scope = restoredScopeFor(bundle);
      const all = [...scope.restored, ...scope.notCarriedByThisSaveVersion];
      expect([...all].sort()).toEqual([...complete].sort());
      expect(new Set(all).size, 'no entry may appear in both lists').toBe(all.length);
    }
  });

  it('produces a player-facing sentence that does not claim the absent subsystems', () => {
    // The end of the pipe. `describeRestoredScope` is what the save panel
    // renders, and the defect was only ever visible there.
    const sentence = describeRestoredScope(restoredScopeFor(bundleWith({ entities: true })));

    expect(sentence).toContain('Not carried by this save version:');
    // The exact claim #109 measured a real panel making about a save that
    // contained none of it.
    const claimed = sentence.slice(0, sentence.indexOf('Not carried by this save version:'));
    expect(claimed).not.toContain('prisoners, needs, actions and cell assignments');
    expect(claimed).not.toContain('prisoner and staff names');
    expect(sentence).toContain('prisoners, needs, actions and cell assignments');
  });
});

/**
 * The two call sites, which are the whole point.
 *
 * `restoredScopeFor` being correct is not the fix: #109 measured that
 * returning the derived value from `restoreSimulationRuntime` alone leaves the
 * player-facing sentence unchanged, because `SessionController.loadPrison`
 * never reads the restore call's scope and built its own from the constant.
 * Both mutations -- either call site reverting to `CURRENT_SAVE_RESTORED_SCOPE`
 * -- survive every assertion in the block above. These are the ones that catch
 * them.
 */
describe('both restore paths report the bundle they were given', () => {
  /** A real bundle, with the two optional sections a legacy save lacks removed. */
  function legacyBundle(): SessionSnapshotBundle {
    const complete = captureSessionSnapshot(createNewSimulationRuntime());
    const { simulation: _simulation, identity: _identity, ...legacy } = complete;
    return legacy as SessionSnapshotBundle;
  }

  it('restoreSimulationRuntime reports the reduced scope for a bundle with no simulation section', () => {
    const { runtime, scope } = restoreSimulationRuntime(legacyBundle());

    // The state really is absent -- otherwise the scope would be right to
    // claim it, and this test would be asserting the wrong thing.
    expect(runtime.actorIdentity.size).toBe(0);
    expect(runtime.securityGuards.allGuardIds()).toEqual([]);

    expect(scope.restored).not.toContain('prisoners, needs, actions and cell assignments');
    expect(scope.restored).not.toContain('prisoner and staff names');
    expect(scope.notCarriedByThisSaveVersion).toContain('prisoners, needs, actions and cell assignments');
    expect(scope.notCarriedByThisSaveVersion).toContain('prisoner and staff names');
  });

  it('loadPrison reports the reduced scope, which is the value the save panel renders', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const controller = new SessionController(repository, new InProcessSessionHost(), { gameVersion: 'test-version' });

    // Create through the real controller, then rewrite that generation into
    // the legacy shape and store it through the ordinary write path, so it is
    // only accepted if it is genuinely schema- and checksum-valid. Hand-writing
    // an envelope would test the fixture rather than the path.
    expect((await controller.createPrison('prison-legacy', 'Old Wing')).ok).toBe(true);

    const current = await repository.loadCurrent('prison-legacy');
    if (!current.ok) throw new Error('the fresh prison must be readable for this test to be meaningful');

    const { simulation: _simulation, identity: _identity, ...legacyPayload } = current.envelope.payload as Record<string, unknown>;
    const legacy = {
      ...current.envelope,
      payload: legacyPayload,
      revision: current.envelope.revision + 1,
      updatedAt: current.envelope.updatedAt + 1,
    } as unknown as { payload: never; checksum: string };
    legacy.checksum = computeSaveChecksum(legacy.payload);

    expect((await repository.save('prison-legacy', legacy as unknown as SaveEnvelope)).ok).toBe(true);

    const outcome = await controller.loadPrison('prison-legacy');
    if (!outcome.ok) throw new Error(`the legacy save must load for this test to be meaningful: ${outcome.reason}`);

    expect(outcome.scope.restored).not.toContain('prisoners, needs, actions and cell assignments');
    expect(outcome.scope.notCarriedByThisSaveVersion).toContain('prisoners, needs, actions and cell assignments');

    const sentence = describeRestoredScope(outcome.scope);
    const claimed = sentence.slice(0, sentence.indexOf('Not carried by this save version:'));
    expect(claimed).not.toContain('prisoners, needs, actions and cell assignments');
  });
});
