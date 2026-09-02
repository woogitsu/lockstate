import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { defaultMessageCatalogEn } from '../../src/services/localization/default-catalog';
import type { MessageEntry } from '../../src/services/localization/catalog';

/**
 * One multiplication sign, and it is `×` (U+00D7) -- the owner's ruling of
 * 2026-09-01.
 *
 * ## What was diverging, and how it was found
 *
 * `hud.alert.occurrences` was authored as `{count}×` with the typographic
 * sign; `hud.clock.speed` was authored as `Speed {speed}x` with the ASCII
 * letter. `src/content/default-locale-en.ts` had **already written the
 * divergence down** -- *"Two spellings of one convention is the kind of thing
 * that reads as a defect on screen, so it is recorded rather than quietly
 * harmonised in either direction -- changing the speed readout is a
 * player-visible wording change and is the owner's"* -- and left it for the
 * owner, which is the only reason it did not have to be found again. The
 * ruling resolved it in favour of `×`, so the speed sentence moved and the
 * counter did not. This file is what stops the letter coming back.
 *
 * ## Two rules, because the two surfaces cannot be measured the same way
 *
 * **Rule A -- the shipped catalogue.** Every sentence a player can read is a
 * value in `defaultMessageCatalogEn`: `src/content/default-locale-en.ts`'s
 * authored keys, the simulation's derived enum labels, and
 * `src/services/localization/default-catalog.ts`'s product and consent
 * strings, merged. Every one of them is prose written for a player, so the
 * rule can be absolute -- no allow-list, no accounted exceptions -- and any
 * finding here is a defect by construction. **`hud.alert.occurrences` on its
 * own would not have caught the divergence**, and neither would any check of
 * *one* key: the point is the catalogue being one convention, so the scan is
 * over all of it.
 *
 * **Rule B -- hard-coded literals under `src/`.** These are not all
 * player-facing and cannot be made so by a regex: the one finding today is a
 * developer `RangeError` about atlas geometry, where `1024x1024` is ordinary
 * and correct. So this half is a **census with reasons**, in the shape
 * `content-vocabulary-contract.test.ts` and `unconsumed-content-contract.test.ts`
 * already use in this directory, and it fails in both directions -- an
 * unaccounted literal, and an accounted one that has since changed.
 *
 * ## Why this is not the flaky gate the brief warned about
 *
 * A naive `/x/` over player copy flags **box, exit, next, maximum, six**. The
 * detector below cannot: it fires only where the `x` has a *quantity* on one
 * side and no letter on the other, having first replaced every placeholder --
 * `{count}`, `${width}` -- with a stand-in for the number it will hold. That
 * masking is what makes `${w}x${h}` visible at all, and it is also what keeps
 * `'{width} × {height} tiles at {x}, {y}'` clean: the `x` in `{x}` is a
 * placeholder *name*, never a sign, and it is gone before the regex runs.
 *
 * Measured rather than argued: over the 8,671 string literals under `src/`
 * with comments stripped, the detector returns **exactly one** -- the atlas
 * message accounted for below -- and over the whole shipped catalogue it
 * returns none. The false-positive rate on this corpus is zero, and the
 * controls below pin the shape of both answers rather than only the count.
 *
 * ## What this deliberately does not check
 *
 * *Comments.* `src/simulation/economy/income.ts` reasons in prose about
 * `300 - 6 x 40`, `room-instance-registry.ts` draws a table of `3x3` and
 * `4x4` rooms, and `docs/research/` holds dated transcripts that read
 * `Speed 1x` because that is what the screen said on the day. None of it
 * reaches a player, all of it would fire, and rewriting a record of a past
 * measurement is worse than the inconsistency. Comments are therefore
 * stripped before Rule B runs -- with the repository's single pinned scanner,
 * for the reason `comment-symbol-existence-contract.test.ts` gives.
 *
 * *Typography beyond this one sign.* The em dash, the middle dot and the
 * apostrophe have their own conventions in this catalogue and none of them is
 * ruled on. This file is about `×`.
 *
 * ## The two rules overlap, and the overlap is not the redundancy it looks
 *
 * Rule B reads `src/content/default-locale-en.ts` like any other file, so an
 * authored sentence that regressed would fail *both* -- and mutation 1 below
 * shows it doing exactly that. Neither rule contains the other. Rule A also
 * covers the labels `simulationEnumMessages()` **computes** from ids, which
 * are in no literal anywhere and are invisible to a source scan; Rule B also
 * covers every string under `src/` that no catalogue holds, which is where
 * the ruling's next violation would most plausibly appear, since a hard-coded
 * sentence is the thing nobody reviews as copy.
 *
 * ## Watched going red, each mutation reverted before the next
 *
 * - `hud.clock.speed` put back to `'Speed {speed}x'`: **3 failed | 28
 *   passed**, the first naming `hud.clock.speed: "Speed {speed}x"`, the second
 *   the catalogue no longer spelling that key with `×`, and the third Rule B
 *   finding the same text as an unaccounted literal.
 * - The atlas literal's `${w}x${h}` edited to `${w} x ${h}` -- still a times
 *   sign, differently spaced: **2 failed | 29 passed**, the census failing in
 *   both directions at once, the new text unaccounted and the accounted text
 *   gone.
 * - `MASK` set to the empty string instead of a stand-in, so placeholders
 *   vanish rather than becoming quantities: **5 failed | 26 passed** -- four
 *   detector controls (`Speed {speed}x`, `{count}x`, `${w}x${h}`,
 *   `x {count} Bench`) plus the accounted-but-absent side of the census. That
 *   is the detector's own worst failure mode, a scan that quietly stops
 *   finding things, caught by its own gate.
 *
 * Green on the branch as it stands: **31 passed**.
 */

const ROOT = join(__dirname, '../..');
const SOURCE_ROOT = join(ROOT, 'src');

/**
 * What a placeholder becomes before the detector reads the sentence: one
 * character standing for "a number goes here".
 *
 * It has to be *something* rather than nothing. `${w}x${h}` with the
 * placeholders deleted is the bare letter `x` with no quantity beside it, and
 * the detector would rightly ignore it -- which is the one real times sign
 * under `src/` going missing. U+0001 is used because no source file in this
 * repository contains it, so it cannot collide with authored text.
 */
const MASK = '\u0001';

const PLACEHOLDER = /\$\{[^}]*\}|\{[^}]*\}/g;

/**
 * An ASCII `x` or `X` used as a times sign: a quantity on one side, and no
 * letter on the other.
 *
 * Both directions, because both spellings exist in the wild and the ruling
 * covers both: `{count}x` and `2 x 3` are the first, `x2` and `x {count}` the
 * second. The negative look-around on the letter side is the whole of the
 * false-positive defence -- `box`, `exit`, `six`, `Maximum` all have a letter
 * against the `x` and none of them can match.
 */
const TIMES_SIGN_AS_LETTER = /(?:[0-9\u0001] ?[xX](?![A-Za-z])|(?<![A-Za-z])[xX] ?[0-9\u0001])/;

/** True when `text` spells a multiplication sign with an ASCII letter. */
export function usesLetterAsTimesSign(text: string): boolean {
  return TIMES_SIGN_AS_LETTER.test(text.replace(PLACEHOLDER, MASK));
}

// ---------------------------------------------------------------------------
// 0. The detector itself
// ---------------------------------------------------------------------------

describe('the detector fires on a times sign and on nothing else', () => {
  /**
   * Every spelling the ruling is about, including the two that were actually
   * in the tree.
   */
  it.each([
    'Speed {speed}x',
    'Speed 1x',
    '{count}x',
    '2x Day 3',
    'Designate 2 x 3',
    'Needs at least 2x3 tiles',
    'Buy 3 X Brick',
    '${w}x${h}',
    'x2 speed',
    'x {count} Bench',
  ])('finds the sign in %j', (sample) => {
    expect(usesLetterAsTimesSign(sample)).toBe(true);
  });

  /**
   * The words that make a naive `/x/` unusable, plus the real catalogue
   * sentences whose shape is closest to a false positive: a placeholder
   * literally *named* `x`, beside a real `×`.
   */
  it.each([
    'Export',
    'Next',
    'Exit',
    'Maximum security',
    'Six benches',
    'Box',
    'Toilet',
    '{width} × {height} tiles at {x}, {y}',
    'Designate {width} × {height}',
    'Buy {count} × {material} · {total}',
    '{count}×',
    'Speed {speed}×',
    'Prison X',
    'tile X',
  ])('leaves %j alone', (sample) => {
    expect(usesLetterAsTimesSign(sample)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 1. The shipped catalogue
// ---------------------------------------------------------------------------

function formsOf(entry: MessageEntry): readonly string[] {
  return typeof entry === 'string' ? [entry] : Object.values(entry);
}

const catalogueForms: readonly { readonly key: string; readonly form: string }[] = Object.entries(
  defaultMessageCatalogEn.messages,
).flatMap(([key, entry]) => formsOf(entry as MessageEntry).map((form) => ({ key, form })));

describe('no sentence a player reads spells a times sign with a letter', () => {
  it('holds for every form of every key in the bundled default locale', () => {
    const offenders = catalogueForms
      .filter(({ form }) => usesLetterAsTimesSign(form))
      .map(({ key, form }) => `${key}: ${JSON.stringify(form)}`);
    expect(
      offenders,
      'a player-facing sentence uses an ASCII x as a multiplication sign. The owner ruled on 2026-09-01 that the sign is U+00D7 (×) everywhere -- see the comment on hud.alert.occurrences in src/content/default-locale-en.ts',
    ).toEqual([]);
  });

  /**
   * The floor that stops an empty scan reading as a clean one, and the
   * control that stops a *broken* scan reading as one.
   *
   * The catalogue is nearly six hundred keys; a merge that emptied it, or a
   * change to `MessageCatalog`'s shape that made `messages` unreadable here,
   * would take the assertion above to `[]` for the wrong reason.
   */
  it('scanned a catalogue of the size the game actually ships', () => {
    expect(Object.keys(defaultMessageCatalogEn.messages).length).toBeGreaterThan(400);
    expect(catalogueForms.length).toBeGreaterThan(400);
    expect(catalogueForms.some(({ key }) => key === 'hud.clock.speed')).toBe(true);
    expect(catalogueForms.some(({ key }) => key === 'hud.alert.occurrences')).toBe(true);
  });

  /**
   * The convention is used rather than merely not violated.
   *
   * A catalogue that had removed every multiplier would pass the rule above
   * while saying nothing at all, so the sign itself is required to be present
   * and in more than one place -- it is in the alert counter, the speed
   * readout, the buy and delivery lines and every room dimension.
   */
  it('spells its multipliers with U+00D7, in more than one sentence', () => {
    const withSign = catalogueForms.filter(({ form }) => form.includes('×'));
    expect(withSign.length).toBeGreaterThan(5);
    expect(withSign.map(({ key }) => key)).toContain('hud.clock.speed');
    expect(withSign.map(({ key }) => key)).toContain('hud.alert.occurrences');
  });
});

// ---------------------------------------------------------------------------
// 2. Hard-coded literals under src/
// ---------------------------------------------------------------------------

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

/**
 * A single-line `'...'` or `"..."`, or a template literal.
 *
 * Deliberately textual and deliberately not a parser. It runs over
 * comment-stripped source, so the quote characters it finds are real string
 * delimiters rather than apostrophes in prose, and the worst a mis-lex can do
 * is move a boundary inside code that has no times sign in it either way. A
 * finding is always checked by eye against the file before it is accounted
 * for.
 */
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

interface SourceLiteral {
  readonly where: string;
  readonly literal: string;
}

const sourceFiles = collectTypeScriptFiles(SOURCE_ROOT);

const sourceLiterals: readonly SourceLiteral[] = sourceFiles.flatMap((path) => {
  const text = stripComments(readFileSync(path, 'utf8'));
  return [...text.matchAll(STRING_LITERAL)].map((match) => ({
    where: relative(ROOT, path),
    literal: match[1] ?? match[2] ?? match[3] ?? '',
  }));
});

const literalsWithLetterSign = sourceLiterals.filter(({ literal }) => usesLetterAsTimesSign(literal));

/**
 * A hard-coded literal that spells a times sign with a letter, and the reason
 * it is not the ruling's business.
 *
 * Keyed by the literal **verbatim**, not by the file: an entry that says
 * "this file is allowed one" would let a second one in beside it, and editing
 * the accounted message would leave the reason attached to text that no
 * longer exists. Both are caught below.
 *
 * Each reason has to say what is verifiably true today, in
 * `content-vocabulary-contract.test.ts`'s sense: **not** that somebody will
 * get to it, and **not** that it is fine because it is old.
 */
const ACCOUNTED_LETTER_SIGNS: Readonly<Record<string, string>> = {
  'Environment sprite "${spriteId}" reads ${w}x${h} at (${x}, ${y}) from "${definition.assetId}", which is only ${entry.dimensionsPx.width}x${entry.dimensionsPx.height}.':
    'Reaches no player. It is the message of a `RangeError` thrown by `planEnvironmentAtlas` (`src/rendering/assets/environment-atlas-plan.ts`) while packing source art, so it is read by whoever authored a sprite rectangle that does not fit its sheet, at build or boot time, in a console. `${w}x${h}` is pixel geometry in the idiom the art pipeline already writes -- `docs/ART_PIPELINE.md` and the catalogue both spell dimensions this way -- and the owner ruled about the sign a player reads, not about developer diagnostics.',
};

describe('a hard-coded times sign under src/ is accounted for', () => {
  it('finds every literal that spells one, and each is on the list', () => {
    const unaccounted = literalsWithLetterSign
      .filter(({ literal }) => ACCOUNTED_LETTER_SIGNS[literal] === undefined)
      .map(({ where, literal }) => `${where}: ${JSON.stringify(literal)}`);
    expect(
      unaccounted,
      'a hard-coded string literal uses an ASCII x as a multiplication sign. If a player can read it, spell it × (U+00D7) per the owner\'s ruling of 2026-09-01; if nobody can, add it to ACCOUNTED_LETTER_SIGNS with the reason',
    ).toEqual([]);
  });

  it('holds no entry for a literal that is no longer in the tree', () => {
    const present = new Set(literalsWithLetterSign.map(({ literal }) => literal));
    const stale = Object.keys(ACCOUNTED_LETTER_SIGNS).filter((literal) => !present.has(literal));
    expect(
      stale.map((literal) => JSON.stringify(literal)),
      'an accounted literal is gone or has changed: delete its entry if the string went away, or restate the reason against the new text',
    ).toEqual([]);
  });

  it('gives every listed literal a non-empty reason', () => {
    for (const [literal, reason] of Object.entries(ACCOUNTED_LETTER_SIGNS)) {
      expect(reason.trim().length, `${literal} needs a reason`).toBeGreaterThan(20);
    }
  });

  /**
   * The floors, in the shape this directory uses them: a walk that stopped
   * walking, a lexer that stopped lexing or a stripper that blanked whole
   * files each takes the census to zero, which is the value the comfortable
   * direction is supposed to have.
   */
  it('cannot pass vacuously on an empty walk or an empty lex', () => {
    expect(sourceFiles.length).toBeGreaterThan(200);
    expect(sourceLiterals.length).toBeGreaterThan(4000);

    /*
     * **Neither floor above closes a *partial* walk, and that is a third
     * direction the docblock did not name.** `src/` holds 372 `.ts` files;
     * `src/ui/` is 66 of them. Measured rather than reasoned: with one line in
     * `collectTypeScriptFiles` skipping `ui`, a planted `'Speed 4x now'` in
     * `src/ui/simulation-clock.ts` left this whole file **31 passed (31)** --
     * both floors held (306 files, well over 4,000 literals) and the anchor
     * literal that proves the lexer ran lives in `src/content/`, so it was
     * still found. The owner's `×` ruling was enforced only for the
     * directories the walk happened to reach.
     *
     * A count cannot see that, because a partial walk still returns a large
     * number. The set of subtrees can, and it fails **by name**.
     *
     * **Adding a directory under `src/` is meant to fail here.** A new subtree
     * is a new place a letter `x` can be used as a times sign, and this
     * contract should not silently stop covering it. Add the name.
     */
    const required = ['content', 'input', 'persistence', 'rendering', 'services', 'shared', 'simulation', 'ui'];
    const reached = new Set(sourceFiles.map((file) => relative(SOURCE_ROOT, file).split(sep)[0]));
    expect(
      required.filter((subtree) => !reached.has(subtree)),
      'the walk under src/ never reached these subtrees, so no literal in them was checked for a letter times sign',
    ).toEqual([]);
    // The stripper really ran: this sentence is in a comment in
    // `src/content/default-locale-en.ts` and must not survive into the scan.
    expect(sourceLiterals.some(({ literal }) => literal.includes('quietly harmonised'))).toBe(false);
    // And it did not eat the code: an ordinary authored sentence is still there.
    expect(sourceLiterals.some(({ literal }) => literal === 'Designate {width} × {height}')).toBe(true);
  });
});
