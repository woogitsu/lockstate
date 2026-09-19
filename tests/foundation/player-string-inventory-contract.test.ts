import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultLocaleEnCatalog } from '../../src/content/default-locale-en';
import { buildInventory, extractAuthoredStrings, INVENTORY_PATH, LOCALE_SOURCE_PATH } from '../../tooling/player-string-inventory.mjs';

/**
 * `docs/PLAYER_STRINGS.md` is the record `AGENTS.md`'s partial release of
 * reservation 4 promises the owner: every string authored under it recorded
 * *"so the harmonising pass is one reading rather than an excavation"*.
 *
 * ## The defect
 *
 * The record was hand-maintained in `docs/adr/STATUS-QUEUE.md`, and on
 * 2026-09-09 an anchor pass opened all four coordinates it gave and **all four
 * were wrong at both ends of the window**: `:1917`, `:2273`, `:1026` and
 * `:1100`, against real locations of `:2145`/`:2175`, `:2543`/`:2573`,
 * `:1104`/`:1134` and `:1190`/`:1220`.
 *
 * One was worse than a bad number. `hud.security.coverage-met-hint` was
 * recorded as *"Only free guards answer incidents."* and the game had shipped
 * *"Incidents and searches need free guards."* since `377f17f6` (#941) and
 * `f466d022` (#989) -- **both older than every anchor window that could have
 * reported it**, so no delta pass in that chain could ever have caught it.
 *
 * So the record ages in two independent ways: the coordinate drifts, and the
 * string itself is edited by a change with no reason to look at the record.
 * Only the second makes it actively misleading to the person it was written
 * for, and neither is survivable by hand.
 *
 * ## What this asserts, and the one thing it cannot
 *
 * **It cannot tell whether a sentence is TRUE of the code that renders it.**
 * Nothing mechanical can, and that is the half of reservation 4 the owner never
 * released. The argument for a sentence's truth belongs in a docblock beside
 * the code that raises it.
 *
 * What it asserts is the half that rotted:
 *
 * 1. **The committed record is current.** Regenerated from the live locale
 *    source and compared byte-for-byte.
 * 2. **Every key and value in it is the one the running game loads.** Not the
 *    scanner's opinion of the source -- `defaultLocaleEnCatalog`, the map
 *    `src/main.ts` resolves against, whose builder is
 *    `new Map(Object.entries(entries))` and passes values through verbatim. The
 *    scanner supplies coordinates; the game supplies the truth they are checked
 *    against.
 * 3. **Every coordinate resolves.** Each line is opened in the locale source and
 *    must carry that key.
 *
 * ## It bites, and it is not vacuous
 *
 * Proved by controls run against the tree that landed it, not asserted:
 *
 * - Editing one value in `src/content/default-locale-en.ts` without
 *   regenerating fails `the committed record is current`, naming the file and
 *   the command.
 * - Editing one value in `docs/PLAYER_STRINGS.md` by hand fails the same
 *   assertion from the other side.
 * - Making the scanner skip a property instead of throwing (the failure mode
 *   the generator's header is about) fails `every authored key the running game
 *   loads appears in the record`, naming the dropped key.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');

/**
 * Keys derived from simulation enums rather than authored by hand
 * (`simulationEnumMessages()`), which the inventory deliberately does not list.
 * Told apart by absence from the authored object rather than by a prefix, so a
 * renamed enum cannot quietly move a key into the authored set unnoticed.
 */
function derivedKeys(authored: ReadonlySet<string>): readonly string[] {
  return [...defaultLocaleEnCatalog.keys()].filter((key) => !authored.has(key));
}

describe('docs/PLAYER_STRINGS.md: the record reservation 4 owes the owner', () => {
  const localeSource = readFileSync(join(REPOSITORY_ROOT, LOCALE_SOURCE_PATH), 'utf8');
  const { entries } = extractAuthoredStrings(localeSource);
  const authoredKeys = new Set(entries.map((entry) => entry.key));

  it('is current: the committed file is what the generator produces from the locale source today', () => {
    const committed = readFileSync(join(REPOSITORY_ROOT, INVENTORY_PATH), 'utf8');
    expect(
      committed,
      `${INVENTORY_PATH} disagrees with ${LOCALE_SOURCE_PATH}. Run \`pnpm content:player-strings\` and commit the result -- do not edit ${INVENTORY_PATH} by hand, and do not edit this test to make it pass, because a stale record is the entire defect this file exists to prevent`,
    ).toBe(`${buildInventory(localeSource)}\n`);
  });

  it('every authored key the running game loads appears in the record, with the value the game loads', () => {
    // The strongest check available: not the scanner against itself, but the
    // scanner against `defaultLocaleEnCatalog` -- the map the game resolves
    // against at runtime.
    const wrong = entries
      .filter((entry) => defaultLocaleEnCatalog.get(entry.key) !== entry.value)
      .map((entry) => `${entry.key}: record has ${JSON.stringify(entry.value)}, the game loads ${JSON.stringify(defaultLocaleEnCatalog.get(entry.key))}`);

    expect(
      wrong,
      'a value in the record that is not the value the game ships is the exact failure this replaces -- hud.security.coverage-met-hint was recorded as "Only free guards answer incidents." long after the game had stopped saying it',
    ).toEqual([]);
  });

  it('lists every authored key and no derived one, so nothing the owner would harmonise is missing', () => {
    const missing = [...defaultLocaleEnCatalog.keys()].filter(
      (key) => !authoredKeys.has(key) && localeSource.includes(`  '${key}':`),
    );
    expect(
      missing,
      'these keys are declared in the authored object but the scanner did not record them -- the generator must throw on a shape it cannot read, never skip it',
    ).toEqual([]);

    // Two-sided: the derived set must be non-empty, or "lists no derived key"
    // would be a claim about nothing.
    expect(derivedKeys(authoredKeys).length, 'no derived keys found, so the authored/derived split this test asserts is unreachable').toBeGreaterThan(0);
    expect(entries.length, 'the authored set must be non-trivial for the assertions above to mean anything').toBeGreaterThan(100);
  });

  it('every coordinate it prints resolves to the key it names', () => {
    const sourceLines = localeSource.split('\n');
    const broken = entries
      .filter((entry) => !(sourceLines[entry.line - 1] ?? '').includes(`'${entry.key}'`))
      .map((entry) => `${entry.key} -> ${LOCALE_SOURCE_PATH}:${String(entry.line)} reads ${JSON.stringify(sourceLines[entry.line - 1] ?? '')}`);

    expect(
      broken,
      'a coordinate that does not resolve is what made the hand-maintained record an excavation rather than one reading',
    ).toEqual([]);
  });

  it('stays invokable: package.json still carries the script that regenerates it', () => {
    // Issue #141's lesson, applied to this generator: a generator invoked by
    // nothing is "the shape that silently goes stale", and the assertions above
    // would all keep passing on a record nobody could regenerate. The same pin
    // `ci-configuration-contract.test.ts` puts on `test:perf`.
    const manifest = JSON.parse(readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8')) as { readonly scripts: Readonly<Record<string, string>> };
    expect(
      manifest.scripts['content:player-strings'],
      'the record is only maintainable if a documented command rebuilds it; this test names that command in its own failure message and would be lying if the script were gone',
    ).toBe('node tooling/player-string-inventory.mjs');
  });

  it('carries the four keys whose hand-written coordinates were all wrong, so the repair is visible in the thing that replaced it', () => {
    // Named rather than counted: these four are the measured failure this file
    // was written against, and a later reader should be able to check them.
    for (const key of [
      'hud.security.coverage-met-hint',
      'hud.rooms.needs-doorway',
      'hud.alert.event.construction.undone-spend-destroyed',
      'hud.alert.event.objects.removed-spend-destroyed',
    ]) {
      const entry = entries.find((candidate) => candidate.key === key);
      expect(entry, `${key} must be in the record`).toBeDefined();
      expect(defaultLocaleEnCatalog.get(key)).toBe(entry!.value);
    }
  });
});
