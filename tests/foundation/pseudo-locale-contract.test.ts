import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { PRODUCTION_ENTRY_POINTS, reachableModules, readFromDisk } from '../helpers/production-reachability';
import { findPseudoLocaleResidue } from '../helpers/pseudo-locale-residue';
import { SIMULATION_ENUM_GROUPS, deriveSimulationMessageKey } from '../../src/content/simulation-message-keys';
import type { MessageEntry } from '../../src/services/localization/catalog';
import { createPlaceholderPattern, interpolate } from '../../src/services/localization/format';
import { PSEUDO_LOCALE } from '../../src/services/localization/locale';
import { Localizer } from '../../src/services/localization/localizer';
import { buildPseudoLocaleCatalog } from '../../src/services/localization/pseudo';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';

/**
 * The pseudo-locale, held to the promise the rest of the localization work
 * rests on (#664).
 *
 * ADR 0011 calls `en-XA` "a first-class test tool" and says it "is asserted in
 * tests rather than being a manual step". It was, in three places, and it is
 * worth being exact about what each of them reaches because this file exists
 * for the gap between them:
 *
 * - `tests/unit/services-localization.test.ts` asserts the transform's own
 *   behaviour over a **four-key fixture** catalogue;
 * - `tests/unit/simulation-message-keys.test.ts` runs it over the **real**
 *   catalogue, but only for the 176 keys `simulationEnumMessages()` derives,
 *   and only asks that each comes back bracketed and changed;
 * - `tests/browser/pseudo-locale-sweep.spec.ts` runs the assembled
 *   application, which is the strongest of the three and needs a browser, a
 *   Playwright run and a reachable UI state per string.
 *
 * So the other ~412 messages -- everything a browser state did not reach -- had
 * the transform applied to them by nobody, and "bracketed and changed" is
 * satisfied by a message with English still in it.
 *
 * ## Why the promise needs a gate rather than a comment
 *
 * Everything built on the pseudo-locale -- the 2026-08-30 sweep, the residue
 * classifier, the save panel's `⟦…⟧` assertion in `ui-shell.spec.ts` -- is
 * built on one sentence: **no character of a catalogue-derived string is an
 * ASCII letter**. That is not a property of the transform alone. It is a
 * property of the transform *applied to this catalogue*: one message
 * containing a character class `ACCENTS` does not map, or one entry the
 * builder walks past, and every sweep downstream reports the resulting English
 * as a defect somewhere else or, worse, stops reporting anything.
 *
 * ## Each gate here has a control, and the controls are the point
 *
 * A gate that cannot fail reports safety it does not provide, which is the
 * failure class `tests/foundation/localization-key-completeness.test.ts` and
 * `tests/browser/alert-dwell.ts` each carry their own guard against. So:
 *
 * - the residue sweep is run over the **untransformed** catalogue as well, and
 *   must find hundreds of hits there -- a classifier that had stopped firing
 *   would pass the transformed sweep silently;
 * - every floor is the measured value at the commit that set it, so any loss
 *   of coverage fails immediately rather than after it has halved;
 * - the "never offered to players" scan proves it can see the symbols by
 *   finding them where they are supposed to be.
 */

const pseudoCatalog = buildPseudoLocaleCatalog(defaultMessageCatalogEn);

/** Every string in an entry: a plain message, or each plural form of one. */
function formsOf(entry: MessageEntry): readonly string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

function placeholderNames(text: string): readonly string[] {
  return [...text.matchAll(createPlaceholderPattern())].map((match) => match[1]!);
}

describe('the pseudo-locale transforms the catalogue the game actually ships (#664)', () => {
  it('covers every key and every plural form of the default catalogue', () => {
    expect(Object.keys(pseudoCatalog.messages).sort()).toEqual(Object.keys(defaultMessageCatalogEn.messages).sort());

    for (const [key, entry] of Object.entries(defaultMessageCatalogEn.messages)) {
      const pseudoEntry = pseudoCatalog.messages[key];
      expect(pseudoEntry, `${key} is missing from the pseudo-locale`).toBeDefined();
      expect(
        typeof pseudoEntry === 'string' ? 'string' : Object.keys(pseudoEntry as object).sort().join(','),
        `${key} changed plural shape under the transform`,
      ).toEqual(typeof entry === 'string' ? 'string' : Object.keys(entry as object).sort().join(','));
    }
  });

  it('leaves no ASCII word in any message except inside a parameter marker', () => {
    const offenders: string[] = [];
    let messagesSwept = 0;

    for (const [key, entry] of Object.entries(pseudoCatalog.messages)) {
      for (const form of formsOf(entry as MessageEntry)) {
        messagesSwept += 1;
        for (const finding of findPseudoLocaleResidue(form)) {
          // A template's placeholder is `⟨{count}⟩` until a call site fills
          // it, so `interpolated-parameter` is the expected state here and the
          // gate below is the one that proves the filling works.
          if (finding.kind === 'interpolated-parameter') continue;
          offenders.push(`${key}: ${finding.kind} "${finding.text}" in "${form}"`);
        }
      }
    }

    // FLOOR at the measured value: 588 keys, of which two carry plural forms
    // (`save-slots.available`, `save-slots.over-capacity`) of two categories
    // each, giving 590 strings.
    expect(messagesSwept, 'fewer strings than when this floor was set -- the sweep is covering less').toBeGreaterThanOrEqual(590);
    expect(offenders, 'these survived the pseudo-locale transform as readable English').toEqual([]);
  });

  it('finds that same English before the transform, so the sweep above is not vacuous', () => {
    // The control. The assertion above is "the classifier finds nothing",
    // which is exactly what a classifier that has stopped working also
    // reports. Run it over the untransformed source and it must find the
    // whole catalogue.
    let flagged = 0;
    for (const entry of Object.values(defaultMessageCatalogEn.messages)) {
      for (const form of formsOf(entry as MessageEntry)) {
        if (findPseudoLocaleResidue(form).some((finding) => finding.kind === 'hard-coded')) flagged += 1;
      }
    }
    // FLOOR at the measured value. Not every message qualifies -- a few are
    // short enough to hold no two-letter run -- so this is deliberately not
    // the string count above.
    expect(flagged, 'the classifier no longer fires on plain English, so the sweep above proves nothing').toBeGreaterThanOrEqual(575);
  });
});

/**
 * ## What this block does *not* prove, established by mutating for it
 *
 * `tests/unit/simulation-message-keys.test.ts` already pins the derivation
 * rule against hand-written expectations (`deriveSimulationMessageKey('need',
 * 'hunger')` is `'need.hunger.name'`) and already resolves every derived key
 * through a pseudo-localizer. Changing the rule's suffix from `.name` to
 * `.label` turns **that** file red and leaves this one green, which was
 * measured rather than assumed -- and correctly so: `simulationEnumMessages()`
 * builds the catalogue with the same function a lookup derives with, so the
 * two agree for any rule at all. A gate here that claimed to catch it would be
 * a fixture supplying both sides of its own comparison.
 *
 * What this adds over the sibling is the *classifier*: the sibling asks that
 * each derived label comes back bracketed and different, which a label with
 * English still inside it satisfies. Dropping one letter from `ACCENTS` leaves
 * the sibling green and turns this red.
 */
describe('every derived key survives the pseudo-locale with no English left in it (#664)', () => {
  const localizer = new Localizer({ locale: PSEUDO_LOCALE, catalogs: [defaultMessageCatalogEn, pseudoCatalog] });

  it('resolves every key `deriveSimulationMessageKey` computes to transformed text', () => {
    const unresolved: string[] = [];
    let derived = 0;

    for (const group of SIMULATION_ENUM_GROUPS) {
      for (const id of Object.keys(group.labels)) {
        derived += 1;
        const key = deriveSimulationMessageKey(group.namespace, id);
        const text = localizer.format(key);
        if (text === key || findPseudoLocaleResidue(text).length > 0) {
          unresolved.push(`${group.namespace}/${id} -> ${key} -> "${text}"`);
        }
      }
    }

    // FLOOR at the measured value: 176 derived keys across 40 groups.
    expect(derived, 'fewer derived keys than when this floor was set').toBeGreaterThanOrEqual(176);
    expect(SIMULATION_ENUM_GROUPS.length, 'fewer enum groups than when this floor was set').toBeGreaterThanOrEqual(40);
    expect(unresolved, 'these derived keys did not resolve to catalogue text in the pseudo-locale').toEqual([]);
  });

  it('reports a key the derivation rule would miss, so the sweep above is not vacuous', () => {
    // The control, and it is the same shape as the defect: a namespace
    // qualified twice is what a hand-written key looks like when someone
    // "helpfully" repeats the prefix the rule already adds.
    const wrong = `need.need.hunger.name`;
    expect(localizer.format(wrong)).toBe(wrong);
    expect(findPseudoLocaleResidue(localizer.format(wrong))).toEqual([{ kind: 'unresolved-key', text: wrong }]);
  });
});

describe('the pseudo-locale proves interpolation survives the transform (#664)', () => {
  it('fills every placeholder in every message, and the value is attributable', () => {
    const broken: string[] = [];
    let withPlaceholders = 0;

    for (const [key, entry] of Object.entries(pseudoCatalog.messages)) {
      const sourceForms = formsOf(defaultMessageCatalogEn.messages[key] as MessageEntry);
      for (const [index, form] of formsOf(entry as MessageEntry).entries()) {
        const names = placeholderNames(sourceForms[index] ?? '');
        if (names.length === 0) continue;
        withPlaceholders += 1;

        // Values chosen to be plain ASCII words: an accented value would be
        // indistinguishable from the transformed template and this would pass
        // for a transform that had mangled the placeholder into nothing.
        const parameters = Object.fromEntries(names.map((name) => [name, `value${name}`]));
        const rendered = interpolate(form, parameters);

        if (rendered.missingParameters.length > 0) {
          broken.push(`${key}: unfilled ${rendered.missingParameters.join(', ')} in "${form}"`);
          continue;
        }
        for (const name of names) {
          if (!rendered.text.includes(`value${name}`)) broken.push(`${key}: {${name}} did not reach the output`);
        }
        for (const finding of findPseudoLocaleResidue(rendered.text)) {
          if (finding.kind !== 'interpolated-parameter') {
            broken.push(`${key}: ${finding.kind} "${finding.text}" after interpolation`);
          }
        }
      }
    }

    // FLOOR at the measured value: 78 entries carry at least one placeholder.
    expect(withPlaceholders, 'fewer messages carry placeholders than when this floor was set').toBeGreaterThanOrEqual(78);
    expect(broken, 'the transform broke interpolation for these messages').toEqual([]);
  });
});

describe('the pseudo-locale is never offered to a player (#664)', () => {
  /** The tree that is allowed to name it: the runtime that defines it. */
  const OWNING_TREE = 'src/services/localization/';
  const SYMBOLS = ['PSEUDO_LOCALE', 'buildPseudoLocaleCatalog', 'pseudoLocalizeText'] as const;

  const reachable = [...reachableModules(readFromDisk, PRODUCTION_ENTRY_POINTS)].sort();

  function namesAPseudoSymbol(modulePath: string): readonly string[] {
    const source = readFromDisk(modulePath);
    if (source === undefined) return [];
    const stripped = stripComments(source);
    return SYMBOLS.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(stripped));
  }

  it('is not named by anything the shipped build reaches outside the localization runtime', () => {
    // `locale.ts` says it plainly -- "never offered to players" -- and
    // `AGENTS.md`'s fourth exclusion makes a player-visible promise the code
    // does not keep the owner's call. A language picker (#663) that built its
    // list from every locale the runtime can produce would put a deliberately
    // unreadable locale in front of a player, and nothing else in the tree
    // would notice.
    const offenders = reachable
      .filter((modulePath) => !modulePath.startsWith(OWNING_TREE))
      .flatMap((modulePath) => namesAPseudoSymbol(modulePath).map((symbol) => `${modulePath} names ${symbol}`));

    expect(offenders, 'the pseudo-locale is reachable from the shipped build; it must never be offerable').toEqual([]);
  });

  it('finds the symbols where they do live, so the scan above is not vacuous', () => {
    // The control. The assertion above is an emptiness claim over a scan, and
    // a scan that resolved no modules, or a `stripComments` that returned an
    // empty string, would satisfy it perfectly.
    // FLOOR at the measured value of the production import graph.
    expect(reachable.length, 'the reachability walk resolved fewer modules than when this floor was set').toBeGreaterThanOrEqual(200);

    const owning = reachable.filter((modulePath) => modulePath.startsWith(OWNING_TREE));
    expect(owning.length, 'the localization runtime is no longer in the production import graph').toBeGreaterThanOrEqual(1);

    const found = new Set(owning.flatMap((modulePath) => namesAPseudoSymbol(modulePath)));
    expect([...found].sort(), 'the scan cannot see the symbols it is supposed to be looking for').toEqual(
      [...SYMBOLS].sort(),
    );
  });
});
