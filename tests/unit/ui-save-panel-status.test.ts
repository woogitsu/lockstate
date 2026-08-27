import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import type { PrisonSlotMetadata } from '../../src/persistence/local/store';
import {
  type SaveMessage,
  describeActionFailure,
  describeImportResult,
  describeLoadFailure,
  describeRestoredScope,
  describeSaveResult,
  orderPrisonsForDisplay,
  parseImportedSave,
} from '../../src/ui/save-panel';
import { SAVE_PANEL_MESSAGE_KEY, SAVE_PANEL_MESSAGE_KEYS } from '../../src/ui/save-panel-messages';
import { CURRENT_SAVE_RESTORED_SCOPE } from '../../src/simulation/runtime/restore-session';

/**
 * Issue #19: "quota, private-mode and transaction-abort errors are
 * distinct recoverable states." These are the pure mapping functions the
 * panel uses; testing them directly keeps this in the default `node`
 * Vitest environment (no DOM), per docs/TESTING.md's rule that a browser
 * environment stays an explicit, scoped exception.
 *
 * Since issue #208 they map to *message keys* rather than to English
 * literals, so the assertions below resolve each key through the real
 * bundled default catalog. That is deliberately not weaker than asserting
 * the literal: the sentence a player reads is still pinned word for word,
 * and it now also fails when the key stops existing in the catalog.
 */

/** The real runtime over the real bundled catalog -- no stub, no fixture. */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

function resolve(message: SaveMessage): string {
  return localizer.format(message.messageKey, message.messageParameters);
}
describe('describeSaveResult: distinct, actionable recovery states', () => {
  it('reports a successful save with its generation id', () => {
    const status = describeSaveResult({ ok: true, generationId: 'gen-abc' });
    expect(status.kind).toBe('saved');
    expect(status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusSaved);
    expect(resolve(status)).toBe('Saved (generation gen-abc).');
  });

  it('maps each failure code to its own kind and distinct advice', () => {
    const quota = describeSaveResult({ ok: false, error: { code: 'quota-exceeded', message: 'full' } });
    const aborted = describeSaveResult({ ok: false, error: { code: 'transaction-aborted', message: 'aborted' } });
    const unknown = describeSaveResult({ ok: false, error: { code: 'unknown-error', message: 'boom' } });

    expect(quota.kind).toBe('quota-exceeded');
    expect(aborted.kind).toBe('transaction-aborted');
    expect(unknown.kind).toBe('error');

    // Three genuinely different messages -- not one generic "save failed".
    expect(new Set([resolve(quota), resolve(aborted), resolve(unknown)]).size).toBe(3);
    // And three different *keys*, so the distinction survives translation:
    // one key with three tones would read identically in every locale.
    expect(new Set([quota.messageKey, aborted.messageKey, unknown.messageKey]).size).toBe(3);
  });

  it('reassures the player that a failed write left the previous save intact', () => {
    // This is the actual guarantee PrisonSaveRepository.save provides, so the
    // UI is allowed to promise it -- see the repository's own retention test.
    expect(resolve(describeSaveResult({ ok: false, error: { code: 'quota-exceeded', message: 'full' } }))).toMatch(/previous save is intact/i);
    expect(resolve(describeSaveResult({ ok: false, error: { code: 'transaction-aborted', message: 'x' } }))).toMatch(/previous save is intact/i);
  });

  it('surfaces the underlying message for an unclassified failure rather than hiding it', () => {
    expect(resolve(describeSaveResult({ ok: false, error: { code: 'unknown-error', message: 'disk on fire' } }))).toContain('disk on fire');
  });

  it('carries the diagnostic as a parameter, so the sentence stays translatable', () => {
    // ADR 0011's separation, applied to a spliced `Error.message`: the text
    // around it is a catalog entry, the fragment is data. A key whose value
    // *was* the whole English sentence could not have both.
    const status = describeSaveResult({ ok: false, error: { code: 'unknown-error', message: 'disk on fire' } });
    expect(status.messageParameters).toEqual({ detail: 'disk on fire' });
    expect(status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusSaveFailed);
  });
});

/**
 * Issue #208: the panel's own ADR 0011 gate.
 *
 * `tests/unit/ui-hud-messages.test.ts` is the same gate for the HUD, and its
 * collection roots are `src/ui/hud` and `src/ui/primitives` -- which is why
 * `src/ui/save-panel.ts` sat outside every localization check while holding
 * about thirty English literals. `tests/foundation/localization-key-completeness.test.ts`
 * did not catch it either: it asks whether the keys a file *declares*
 * resolve, and a file that declares none passes it trivially.
 */
describe('save panel message keys (issue #208)', () => {
  it('collects a non-trivial number of keys, so this cannot pass vacuously', () => {
    expect(SAVE_PANEL_MESSAGE_KEYS.length).toBeGreaterThan(25);
    expect(new Set(SAVE_PANEL_MESSAGE_KEYS).size).toBe(SAVE_PANEL_MESSAGE_KEYS.length);
  });

  it('resolves every key to real text rather than to the key itself', () => {
    const missingKeys: string[] = [];
    const strict = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      // This pass calls every message without parameters, so a parameterized
      // one legitimately reports an unfilled placeholder; only an unresolved
      // key is a defect here.
      onMissingKey: (report) => {
        if (report.kind === 'missing-key') missingKeys.push(report.key);
      },
    });

    for (const key of SAVE_PANEL_MESSAGE_KEYS) {
      const text = strict.format(key);
      // ADR 0011: an unresolved key renders as itself -- correct at runtime,
      // wrong to ship.
      expect(text, `${key} has no default-locale entry`).not.toBe(key);
      expect(text.trim().length).toBeGreaterThan(0);
    }
    expect(missingKeys).toEqual([]);
  });

  it('fills every placeholder the parameterized messages declare', () => {
    const missing: string[] = [];
    const strict = new Localizer({
      locale: DEFAULT_LOCALE,
      catalogs: [defaultMessageCatalogEn],
      onMissingKey: (report) => missing.push(`${report.kind}:${report.key}`),
    });

    expect(strict.format(SAVE_PANEL_MESSAGE_KEY.listItem, { name: 'Alcatraz', count: 3 })).toBe('Alcatraz (3 gen)');
    expect(strict.format(SAVE_PANEL_MESSAGE_KEY.failureSave, { detail: 'boom' })).toBe('Saving failed: boom');
    expect(
      strict.format(SAVE_PANEL_MESSAGE_KEY.detailRestoredScope, { restored: 'a', notCarried: 'b' }),
    ).toBe('Restored: a. Not carried by this save version: b.');
    expect(missing).toEqual([]);
  });

  it('uses stable ASCII identifiers, never source text as a key', () => {
    for (const key of SAVE_PANEL_MESSAGE_KEYS) expect(key).toMatch(/^save\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
  });

  it('names one failure key per action, and a fallback for one it does not know', () => {
    const keys = (['create', 'save', 'load', 'delete', 'export', 'import'] as const).map(
      (actionId) => describeActionFailure({ actionId, error: new Error('boom') }).messageKey,
    );
    expect(new Set(keys).size, 'each action must fail in its own words').toBe(keys.length);
    // `AsyncActionFailure.actionId` is a plain string, so an id this panel
    // does not own can reach it. It must still say something.
    const unknown = describeActionFailure({ actionId: 'not-an-action', error: new Error('boom') });
    expect(unknown.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.failureUnknown);
    expect(resolve(unknown)).toContain('boom');
  });
});

/**
 * The gate hole itself, closed for every `src/ui/*.ts` module that no other
 * localization test collects -- five when issue #208 opened it, nine now
 * (and the same shape as #206 part 2 asks for the import boundaries).
 *
 * A scan rather than a registry, because the defect was a file nobody had
 * registered anywhere: the check has to be about *the directory*, or the
 * next module added lands outside it exactly as this one did.
 */
describe('no module in src/ui/ renders a hard-coded sentence (issue #208)', () => {
  const UI_ROOT = join(__dirname, '../../src/ui');

  /**
   * The modules directly under `src/ui/`. `hud/` and `primitives/` are
   * excluded because `tests/unit/ui-hud-messages.test.ts` already holds them
   * to the stricter registry rule; everything else here was ungated.
   */
  const MODULES = [
    'brand-badge.ts',
    'brand-messages.ts',
    'build-tool.ts',
    'object-tool.ts',
    'room-tool.ts',
    'save-panel.ts',
    'save-panel-messages.ts',
    'simulation-alerts.ts',
  'simulation-build-queue.ts',
    'simulation-clock.ts',
    'simulation-commands.ts',
    'simulation-counts.ts',
    'simulation-held-guards.ts',
    'simulation-intake.ts',
    'simulation-pending-deliveries.ts',
    'simulation-projections.ts',
    'simulation-room-needs.ts',
    'simulation-zoning.ts',
    'telemetry-consent-prompt.ts',
  ] as const;

  /** Source with comments removed, so prose about a rule cannot trip the rule. */
  function code(name: string): string {
    return readFileSync(join(UI_ROOT, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  it('covers every module in the directory, so a new one cannot land outside it', () => {
    // The vacuity guard that matters most here: the defect was a file nobody
    // had listed anywhere. Reading the directory means a module added to
    // `src/ui/` fails this test until it is either checked or excluded with
    // a reason, instead of quietly inheriting the hole `save-panel.ts` was in.
    const found = readdirSync(UI_ROOT)
      .filter((entry) => entry.endsWith('.ts'))
      .sort();
    expect(found).toEqual([...MODULES].sort());
    // And the scanner really reads source, not whitespace: every one of them
    // exports something.
    for (const name of MODULES) expect(code(name), name).toContain('export');
  });

  it('writes no sentence into textContent and no literal message into a status', () => {
    for (const name of MODULES) {
      const source = code(name);
      expect(
        source.match(/textContent\s*=\s*['"`][A-Z]/g) ?? [],
        `${name} writes a hard-coded sentence to the screen -- give it a message key (ADR 0011)`,
      ).toEqual([]);
      expect(
        source.match(/message:\s*['"`][A-Z]/g) ?? [],
        `${name} builds a status out of a literal -- give it a message key (ADR 0011)`,
      ).toEqual([]);
    }
  });
});

/**
 * Regression for a race found by driving the real app in Chromium: two
 * overlapping `refresh()` calls resolved out of order, so an earlier,
 * slower storage read repainted stale slot data over a newer one -- the
 * generation count visibly lagged one save behind until the next reload.
 * `refresh` now carries a monotonic token and a superseded run discards
 * its result.
 *
 * Exercised against the pure guard rather than the DOM so this stays in
 * the default `node` Vitest environment (docs/TESTING.md keeps a browser
 * environment an explicit, scoped exception).
 */
describe('refresh supersession guard', () => {
  it('a superseded in-flight read must not win over a newer one', async () => {
    let token = 0;
    const painted: string[] = [];

    // Mirrors SavePanel.refresh's guard: capture a token, await a read, bail if superseded.
    async function refresh(label: string, read: () => Promise<string>): Promise<void> {
      const mine = ++token;
      const value = await read();
      if (mine !== token) return;
      painted.push(`${label}:${value}`);
    }

    let releaseSlow: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => { releaseSlow = resolve; });

    const first = refresh('stale', () => slow);          // starts first, resolves last
    const second = refresh('fresh', async () => 'new');  // starts second, resolves first
    await second;
    releaseSlow('old');
    await first;

    expect(painted).toEqual(['fresh:new']); // the stale run discarded itself
  });
});

/**
 * Issue #287: importing a save file the player exported, and the four ways
 * that can be refused.
 *
 * These are the same pure mappings as the block at the top of this file, and
 * they are tested the same way -- through the real bundled catalog, so the
 * sentence a player reads is pinned word for word and a key that stops
 * existing fails here rather than rendering as itself.
 *
 * The property that matters is the *distinction*. A save from a newer build is
 * not a corrupt save, and neither is a file that was never a save at all: one
 * asks the player to update the game, one tells them this copy is damaged, and
 * one tells them they picked the wrong file. `SaveImportResult.rejected`
 * carries `decodeSaveEnvelope`'s own code precisely so the panel can say which,
 * and a mapping that collapsed any two of them would pass every "an error is
 * shown" assertion while telling the player something false.
 */
describe('describeImportResult: four refusals, four sentences (issue #287)', () => {
  const rejections = {
    notASave: describeImportResult({
      ok: false,
      error: { code: 'unknown-error', message: 'Import rejected: missing version' },
      rejected: { code: 'invalid-shape', message: 'Save envelope is missing a numeric saveSchemaVersion.' },
    }),
    newerBuild: describeImportResult({
      ok: false,
      error: { code: 'unknown-error', message: 'Import rejected: newer' },
      rejected: { code: 'unsupported-version', message: 'Version 99 is newer than the latest supported version 4.', atVersion: 99 },
    }),
    invalid: describeImportResult({
      ok: false,
      error: { code: 'unknown-error', message: 'Import rejected: invalid' },
      rejected: { code: 'invalid-shape', message: 'Version 4 payload failed validation: kernel: Required', atVersion: 4 },
    }),
    corrupt: describeImportResult({
      ok: false,
      error: { code: 'unknown-error', message: 'Import rejected: checksum' },
      rejected: { code: 'checksum-mismatch', message: 'Save checksum does not match its payload; the save is corrupt.', atVersion: 4 },
    }),
  } as const;

  it('reports a completed import with the generation it wrote', () => {
    const status = describeImportResult({ ok: true, generationId: 'gen-xyz', migrated: false });
    expect(status.kind).toBe('saved');
    expect(status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImported);
    expect(resolve(status)).toBe('Imported the save file into this prison (generation gen-xyz).');
  });

  it('says so when the file it imported came from an older version', () => {
    // The player-visible evidence that the migration chain ran. Nothing else
    // in the interface can tell them.
    const status = describeImportResult({ ok: true, generationId: 'gen-old', migrated: true });
    expect(status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportedMigrated);
    expect(resolve(status)).toContain('older version');
    expect(resolve(status)).toContain('gen-old');
  });

  it('tells the four refusals apart, in four sentences and four keys', () => {
    const all = Object.values(rejections);
    expect(new Set(all.map((status) => status.messageKey)).size, 'four keys').toBe(4);
    expect(new Set(all.map(resolve)).size, 'four sentences').toBe(4);
    for (const status of all) expect(status.kind).toBe('error');
  });

  it('says which of the four, in the player\'s terms rather than the decoder\'s', () => {
    expect(rejections.notASave.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportNotASave);
    expect(resolve(rejections.notASave)).toContain('not a Lockstate save');
    // A newer save is not a broken save, and the advice differs: update the
    // game rather than distrust the file.
    expect(rejections.newerBuild.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportUnsupportedVersion);
    expect(resolve(rejections.newerBuild)).toMatch(/newer version of Lockstate/i);
    expect(resolve(rejections.newerBuild)).not.toMatch(/corrupt|damaged/i);
    expect(rejections.corrupt.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportCorrupt);
    expect(resolve(rejections.corrupt)).toMatch(/checksum/i);
    // And the structural one carries the decoder's own diagnostic, as a
    // parameter, the same way every other spliced detail in this panel does.
    expect(rejections.invalid.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportInvalid);
    expect(rejections.invalid.messageParameters).toEqual({ detail: 'Version 4 payload failed validation: kernel: Required' });
    expect(resolve(rejections.invalid)).toContain('kernel: Required');
  });

  it('separates a file that is not a save from a save whose contents are invalid, by the version it declared', () => {
    // Both are `invalid-shape`. The difference is `atVersion`: the
    // missing-version refusal is raised before any schema runs, so it has no
    // version, while a structural failure is raised *at* the version the file
    // declared. Collapsing them would tell a player with a damaged save to go
    // and find a different file.
    expect(rejections.notASave.messageKey).not.toBe(rejections.invalid.messageKey);
  });

  it('hands a write failure back to the save vocabulary rather than inventing an import one', () => {
    // No `rejected`: the envelope decoded and *storage* refused it, which is
    // the state `describeSaveResult` already models with its own advice (#19).
    const quota = describeImportResult({ ok: false, error: { code: 'quota-exceeded', message: 'full' } });
    expect(quota.kind).toBe('quota-exceeded');
    expect(quota.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusQuotaExceeded);
    expect(resolve(quota)).toMatch(/previous save is intact/i);
  });
});

describe('parseImportedSave: the interface layer turns bytes into a value and nothing more', () => {
  it('hands over whatever JSON the file contained, without judging it', () => {
    // Deliberately *not* a valid save: deciding that is
    // `decodeSaveEnvelope`'s job, and a second opinion about the save format
    // in `src/ui/` is the copy that would rot.
    expect(parseImportedSave('{"saveSchemaVersion":4}')).toEqual({ ok: true, raw: { saveSchemaVersion: 4 } });
  });

  it('refuses a file that is not JSON at all as "not a Lockstate save"', () => {
    const parsed = parseImportedSave('<html>not a save</html>');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.status.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusImportNotASave);
    // The `SyntaxError` is dropped on purpose: "Unexpected token < in JSON at
    // position 0" describes the parser, not the player's mistake.
    expect(resolve(parsed.status)).not.toMatch(/JSON|token/i);
  });

  it('never throws, whatever the file holds', () => {
    for (const text of ['', '   ', 'null', '[1,2,3]', '{"a":', '\u0000']) {
      expect(() => parseImportedSave(text)).not.toThrow();
    }
    // `null` and an array are valid JSON and are the importer's problem, not
    // this function's.
    expect(parseImportedSave('null')).toEqual({ ok: true, raw: null });
  });
});

describe('describeLoadFailure: one vocabulary for both callers', () => {
  it('names the two outcomes a load can fail with, distinctly', () => {
    const missing = describeLoadFailure('not-found');
    const unreadable = describeLoadFailure('no-valid-generation');
    expect(missing.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusNotFound);
    expect(unreadable.messageKey).toBe(SAVE_PANEL_MESSAGE_KEY.statusNoReadableGeneration);
    expect(resolve(missing)).not.toBe(resolve(unreadable));
  });
});

describe('describeRestoredScope: honest about what a save carries', () => {
  it('names both what was restored and what this save version does not carry', () => {
    // The whole pipe, in the direction a player meets it: keys in the
    // simulation-owned scope, resolved by `describeRestoredScope` against the
    // real bundled catalog, spliced into the localized sentence frame. Before
    // #226 the list items were English literals from `src/simulation/**` and
    // these assertions passed without the catalog being involved at all.
    const text = resolve(describeRestoredScope(CURRENT_SAVE_RESTORED_SCOPE, localizer));
    expect(text).toContain('world terrain and ownership');
    expect(text).toContain('incidents, gangs and tunnels');
    expect(text).toContain('Not carried by this save version');
    // The right-hand list must never go empty and quietly stop being shown:
    // a save still leaves derived and in-flight state behind, and the panel
    // is where the player is told so.
    expect(text).toContain('navigation caches');
  });
});

/**
 * Issue #445: the order of the prison list.
 *
 * Reversing `SavePanel.refresh`'s comparator survived the whole suite, and
 * put the prison the player last touched at the *bottom* of their own list --
 * the row they want is the one furthest from where they are looking, and the
 * defect is visible to anyone with more than one prison. Nothing anywhere in
 * `tests/` asserted an ordering on `updatedAt` (verified by grep across
 * `tests/**` and `src/**\/*.test.ts` at the time of writing: every hit was a
 * fixture field, a schema-validation case or a migration passthrough).
 *
 * The fixture is written so that neither of the two orders that could satisfy
 * the assertion by accident does: the expected order is not the order the
 * records are given in, and it is not their id order in either direction.
 * `expectedOrder` is a written-out literal, never a sort of the fixture --
 * re-deriving it here would be the comparator under test wearing the test's
 * clothes.
 */
describe('orderPrisonsForDisplay: the player\'s most recent prison is at the top (#445)', () => {
  function slot(prisonId: string, updatedAt: number): PrisonSlotMetadata {
    return {
      prisonId,
      gameVersion: '0.0.0',
      displayName: prisonId,
      currentGenerationId: `${prisonId}-gen`,
      generationIds: [`${prisonId}-gen`],
      createdAt: 1_700_000_000_000,
      updatedAt,
    };
  }

  /** Given in an order that is neither by id nor by `updatedAt`. */
  const stored: readonly PrisonSlotMetadata[] = [
    slot('prison-d', 1_700_000_003_000),
    slot('prison-a', 1_700_000_002_000),
    slot('prison-c', 1_700_000_001_000),
    slot('prison-b', 1_700_000_004_000),
  ];
  const givenOrder = ['prison-d', 'prison-a', 'prison-c', 'prison-b'];
  const expectedOrder = ['prison-b', 'prison-d', 'prison-a', 'prison-c'];

  it('is a fixture no accidental ordering can satisfy', () => {
    // The guard that keeps the case below meaningful if this fixture is ever
    // edited: an assertion that happens to agree with the order the records
    // arrive in, or with their ids, proves nothing about the comparator.
    const ids = [...givenOrder].sort();
    expect(givenOrder).toEqual(stored.map((prison) => prison.prisonId));
    expect(expectedOrder).not.toEqual(givenOrder);
    expect(expectedOrder).not.toEqual([...givenOrder].reverse());
    expect(expectedOrder).not.toEqual(ids);
    expect(expectedOrder).not.toEqual([...ids].reverse());
    expect(new Set(stored.map((prison) => prison.updatedAt)).size).toBe(stored.length);
  });

  it('lists the prisons newest first', () => {
    expect(orderPrisonsForDisplay(stored).map((prison) => prison.prisonId)).toEqual(expectedOrder);
  });

  it('leaves the list the controller handed it untouched', () => {
    // `listPrisons` returns a view of a list the controller may keep, so
    // rendering must not reorder it as a side effect.
    orderPrisonsForDisplay(stored);
    expect(stored.map((prison) => prison.prisonId)).toEqual(givenOrder);
  });
});
