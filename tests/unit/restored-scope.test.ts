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
  type RestoredScopeEntry,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { type SaveMessage, describeRestoredScope } from '../../src/ui/save-panel';
import { expectOk } from '../helpers/expect-ok';

/**
 * The panel maps a scope to a message key and its parameters since issue
 * #208; the sentence a player reads is what this file is about, so it
 * resolves the key through the real bundled catalog rather than asserting on
 * the descriptor.
 */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

function restoredSentence(message: SaveMessage): string {
  return localizer.format(message.messageKey, message.messageParameters);
}

/**
 * The scope lists carry `labelKey`s and never text since #226, so the
 * assertions below name keys. The *sentence* assertions are unchanged and are
 * the ones that still pin English: they resolve through the real bundled
 * catalog, so a key that lost its entry fails there rather than rendering as
 * itself.
 */
function labelKeys(entries: readonly RestoredScopeEntry[]): readonly string[] {
  return entries.map((entry) => entry.labelKey);
}

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

    for (const key of [
      'save.scope.prisoners',
      'save.scope.operations',
      'save.scope.security',
      'save.scope.contraband',
      'save.scope.incidents',
    ]) {
      expect(labelKeys(scope.restored), `${key} must not be reported as restored`).not.toContain(key);
      expect(labelKeys(scope.notCarriedByThisSaveVersion), `${key} must be reported as absent`).toContain(key);
    }

    // The sections a V3 payload always carries are unaffected.
    expect(labelKeys(scope.restored)).toContain('save.scope.world');
    expect(labelKeys(scope.restored)).toContain('save.scope.construction');
    expect(labelKeys(scope.restored)).toContain('save.scope.entity-liveness');
    expect(labelKeys(scope.restored)).toContain('save.scope.names');
  });

  it('moves only the names when a save predates the identity registry', () => {
    const scope = restoredScopeFor(bundleWith({ entities: true, simulation: true }));

    expect(labelKeys(scope.restored)).not.toContain('save.scope.names');
    expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.names');
    // A pre-#75 save still carried every subsystem, so nothing else moves.
    expect(labelKeys(scope.restored)).toContain('save.scope.prisoners');
  });

  it('moves entity liveness when a save carries no entities section', () => {
    const scope = restoredScopeFor(bundleWith({ simulation: true, identity: true }));
    expect(labelKeys(scope.restored)).not.toContain('save.scope.entity-liveness');
    expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.entity-liveness');
  });

  it('keeps the derived-state exclusions whatever the bundle carries', () => {
    // These two are absent because they are caches, not because of the save
    // version -- so they must survive in every reduced scope, or the reason
    // the right-hand list exists at all is lost.
    for (const bundle of [COMPLETE, bundleWith({}), bundleWith({ entities: true })]) {
      const scope = restoredScopeFor(bundle);
      expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.room-caches');
      expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.navigation-caches');
    }
  });

  it('never loses or duplicates an entry, whichever sections are absent', () => {
    // The reduced scope is a partition of the complete one. Without this, a
    // rename in one list and not the other would drop an entry silently --
    // which is the shape of the original defect.
    const complete = labelKeys([
      ...CURRENT_SAVE_RESTORED_SCOPE.restored,
      ...CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion,
    ]);
    for (const bundle of [
      COMPLETE,
      bundleWith({}),
      bundleWith({ entities: true }),
      bundleWith({ simulation: true }),
      bundleWith({ identity: true }),
      bundleWith({ entities: true, simulation: true }),
    ]) {
      const scope = restoredScopeFor(bundle);
      const all = labelKeys([...scope.restored, ...scope.notCarriedByThisSaveVersion]);
      expect([...all].sort()).toEqual([...complete].sort());
      expect(new Set(all).size, 'no entry may appear in both lists').toBe(all.length);
    }
  });

  it('produces a player-facing sentence that does not claim the absent subsystems', () => {
    // The end of the pipe. `describeRestoredScope` is what the save panel
    // renders, and the defect was only ever visible there.
    const sentence = restoredSentence(describeRestoredScope(restoredScopeFor(bundleWith({ entities: true })), localizer));

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

    expect(labelKeys(scope.restored)).not.toContain('save.scope.prisoners');
    expect(labelKeys(scope.restored)).not.toContain('save.scope.names');
    expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.prisoners');
    expect(labelKeys(scope.notCarriedByThisSaveVersion)).toContain('save.scope.names');
  });

  it('loadPrison reports the reduced scope, which is the value the save panel renders', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    const controller = new SessionController(repository, new InProcessSessionHost(), { gameVersion: 'test-version' });

    // Create through the real controller, then rewrite that generation into
    // the legacy shape and store it through the ordinary write path, so it is
    // only accepted if it is genuinely schema- and checksum-valid. Hand-writing
    // an envelope would test the fixture rather than the path.
    expectOk(await controller.createPrison('prison-legacy', 'Old Wing'), 'the legacy prison');

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

    expectOk(await repository.save('prison-legacy', legacy as unknown as SaveEnvelope), 'the legacy generation written through the ordinary path');

    const outcome = await controller.loadPrison('prison-legacy');
    if (!outcome.ok) throw new Error(`the legacy save must load for this test to be meaningful: ${outcome.reason}`);

    expect(labelKeys(outcome.scope.restored)).not.toContain('save.scope.prisoners');
    expect(labelKeys(outcome.scope.notCarriedByThisSaveVersion)).toContain('save.scope.prisoners');

    const sentence = restoredSentence(describeRestoredScope(outcome.scope, localizer));
    const claimed = sentence.slice(0, sentence.indexOf('Not carried by this save version:'));
    expect(claimed).not.toContain('prisoners, needs, actions and cell assignments');
  });
});

/**
 * The half of #226 that a green `restoredScopeFor` cannot prove.
 *
 * A key with no catalog entry resolves to itself (ADR 0011: "an unresolved key
 * returns the key itself"), which is correct runtime behaviour and the wrong
 * thing to ship -- the player would read "Restored: save.scope.kernel,
 * save.scope.rng-streams, ...". `tests/foundation/localization-key-completeness.test.ts`
 * catches that repository-wide by scanning `labelKey: '...'` declarations, and
 * these thirteen are inside that gate deliberately. This block is the local,
 * legible version of the same check, and adds the thing the foundation gate
 * cannot know: that the text behind each key is the *same* text
 * `restore-session.ts` used to hold, character for character.
 *
 * That exact-text pin is the executable form of the owner's decision on #226 --
 * one key per existing string, the restore report unchanged. Rewording an entry
 * fails here, which is the point: the wording is a product decision and this
 * change was not it.
 */
describe('every restored-scope key resolves in the bundled default locale', () => {
  const ALL_ENTRIES = [...CURRENT_SAVE_RESTORED_SCOPE.restored, ...CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion];

  it('carries thirteen entries, eleven restored and two not', () => {
    // The count #226 measured. A fourteenth line arriving without an entry in
    // the table below would otherwise be checked by nothing.
    expect(CURRENT_SAVE_RESTORED_SCOPE.restored).toHaveLength(11);
    expect(CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion).toHaveLength(2);
    expect(new Set(labelKeys(ALL_ENTRIES)).size, 'two entries share a key').toBe(13);
  });

  it('resolves each key to real text rather than to the key itself', () => {
    const unresolved = labelKeys(ALL_ENTRIES).filter((key) => {
      const text = localizer.format(key);
      return text === key || text.trim().length === 0;
    });
    expect(unresolved, 'these would render as raw identifiers in the save panel').toEqual([]);
  });

  it('resolves each key to the exact string restore-session.ts used to hold', () => {
    const resolved = Object.fromEntries(labelKeys(ALL_ENTRIES).map((key) => [key, localizer.format(key)]));
    expect(resolved).toEqual({
      'save.scope.kernel': 'kernel tick and command queue',
      'save.scope.rng-streams': 'RNG stream states',
      'save.scope.world': 'world terrain and ownership',
      'save.scope.construction': 'construction orders and undo/redo',
      'save.scope.entity-liveness': 'entity id liveness',
      'save.scope.prisoners': 'prisoners, needs, actions and cell assignments',
      'save.scope.operations': 'jobs, containers and utility networks',
      'save.scope.security': 'doors, security sectors, guards and patrols',
      'save.scope.contraband': 'contraband, intelligence and searches',
      'save.scope.incidents': 'incidents, gangs and tunnels',
      'save.scope.names': 'prisoner and staff names',
      'save.scope.room-caches': 'room and topology caches (recomputed from the world)',
      'save.scope.navigation-caches': 'navigation cache results (rebuilt after loading)',
    });
  });

  it('uses stable ASCII identifiers, never source text as a key', () => {
    // The same shape `tests/unit/ui-save-panel-status.test.ts` requires of
    // SAVE_PANEL_MESSAGE_KEYS. These keys are not in that registry -- they
    // belong to a simulation-owned structure, not to the panel -- so the rule
    // is restated here rather than assumed.
    for (const key of labelKeys(ALL_ENTRIES)) expect(key).toMatch(/^save\.scope\.[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('never lets a scope entry travel as text', () => {
    // The ADR 0011 direction the boundary tests do not check: they assert the
    // simulation does not *import* the localization runtime, which was always
    // true here because the violation was a string literal. This asserts the
    // structure itself -- every value in a scope entry is a key that resolves,
    // so a future entry reintroducing prose fails rather than rendering.
    for (const entry of ALL_ENTRIES) {
      expect(Object.keys(entry)).toEqual(['labelKey']);
      expect(localizer.format(entry.labelKey), `${entry.labelKey} must be a key, not text`).not.toBe(entry.labelKey);
    }
  });
});
