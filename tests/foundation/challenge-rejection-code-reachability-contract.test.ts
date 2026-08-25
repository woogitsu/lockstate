import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { CHALLENGE_REJECTION_CODES } from '../../src/services/challenges/rejection-codes';

/**
 * The sibling of `fault-code-reachability-contract.test.ts` for the other
 * closed refusal vocabulary in this repository, and the larger one:
 * `ChallengeRejectionCode` has twenty-four members and sits on the trust
 * boundary [ADR 0009](../../docs/adr/0009-challenge-verification-strategy.md)
 * describes, where a code is the difference between "your build is too old"
 * and "these hashes disagree with the replay".
 *
 * Issue #264 S4-S6 measured three of the twenty-four as unreachable *by
 * test*: `evidence-too-large`, `command-after-final-tick` and
 * `objective-metric-missing` appeared nowhere in the suite. Each was mutated
 * to a no-op -- the last in the `tsc`-clean `?? 0` form, which returns
 * `verified` with `rankedScore: 0` for a run whose objective metric the replay
 * never produced, and `verified` is the one tier ADR 0009 makes eligible for
 * public ranking -- and each survived the whole suite with zero delta.
 *
 * ## Why this gate has two directions and its model has one
 *
 * The fault-code gate asks only "does something emit this code", because that
 * is the failure `ProtocolFaultCode` actually had twice: a member the worker
 * could not produce at all (#139/#184, #187 finding 2). Asking only that
 * question here would have been **green before this change and after it**: all
 * twenty-four codes have a `reject(...)` call site in the pipeline, and the
 * three #264 found were emitted by code that no test ever ran. A gate that
 * cannot fail on the defect it was written for is the "check that reads as
 * protection and is wired to nothing" shape its model exists to prevent.
 *
 * So the emission direction is kept -- it is the direction that catches a code
 * added to the vocabulary ahead of its producer, which is a real way to grow a
 * dead member -- and a second direction is added: every code must also be
 * named by the tests that drive the pipeline. Both are lists with reasons, and
 * both fail in the stale direction, so acting on an entry forces its removal.
 *
 * ## Scope, and why it is pinned rather than argued
 *
 * Its model's central lesson is that the scan must cover the **producing
 * surface only**, because a repository-wide scan counts foreign occurrences
 * and goes green for the wrong reason. That lesson is sharper here than it was
 * there, in two ways.
 *
 * First, `'invalid-shape'` is spelled by five other result unions under `src/`
 * -- `ChallengeDefinitionAuthenticationResult` in
 * `src/services/challenges/challenge.ts`, `WebhookRejectionCode` in
 * `src/services/entitlements/webhook.ts`, and the save-migration, save-decode
 * and settings-decode failures -- and by the five test files that drive those.
 * One of the `src/` five is *in the same directory* as the pipeline, so "scan
 * `src/services/challenges/`" is already too wide.
 *
 * Second, and this is why `CHALLENGE_REJECTION_CODES` is declared in
 * `src/services/challenges/rejection-codes.ts` rather than beside the pipeline
 * that emits it: the declaration lists all twenty-four literals. A producing
 * surface containing the declaration would report every code emitted no matter
 * what the pipeline does -- unconditionally, permanently green. The
 * declaration module is therefore asserted below to be *outside* the surface,
 * not merely assumed to be.
 *
 * As in the model, a widened scope cannot fail any of the main assertions
 * while the vocabulary is fully reachable -- more matches when everything
 * already matches changes nothing -- so the scope is held by a negative
 * control rather than by this paragraph.
 *
 * ## What this gate does not claim
 *
 * "Named by an exercising test file" is a textual floor, not proof that a test
 * drives the code: a bare literal in an unasserted position would satisfy it,
 * and so would one written for a different vocabulary that shares a spelling.
 * `'invalid-shape'` is the code where that could happen, since
 * `authenticateChallengeDefinition` returns a result union of its own using
 * the same word; today the exercising file spells it exactly once, in the
 * assertion that a malformed submission is refused before any replay. The
 * runtime proof is the behavioural tests in
 * `tests/unit/services-challenge-verification.test.ts`, which is why #264's
 * three findings needed both halves and why this file is not a substitute for
 * them. Stated rather than papered over: it is a limit of a text scan, and the
 * behavioural test underneath it is the real assertion.
 */

const ROOT = join(__dirname, '../..');

/**
 * Codes the vocabulary declares that the pipeline cannot produce, with why.
 *
 * **Empty, and that is the assertion**, in the same shape as its model's
 * `UNEMITTED_CODES`: every member of a closed refusal vocabulary ought to be a
 * refusal something can actually make. The list exists so that adding a code
 * before its producer is a decision someone writes down rather than a silent
 * gap.
 */
const UNEMITTED_CODES: Readonly<Record<string, string>> = {};

/**
 * Codes no test under the exercising surface names, with why.
 *
 * **Empty, and that is the assertion.** It would have held three entries
 * before this change -- `evidence-too-large`, `command-after-final-tick` and
 * `objective-metric-missing` -- and each is now driven behaviourally instead,
 * because a reachability gate satisfied by an allow-list entry is not the same
 * thing as coverage. A reason here must say what is verifiably true today and
 * must not invent a plan for the code.
 */
const UNEXERCISED_CODES: Readonly<Record<string, string>> = {};

/**
 * The producing surface: the one module that constructs a rejection.
 * `challenge.ts` and `evidence.ts` are the definition and payload tiers and
 * emit nothing from this vocabulary; `rejection-codes.ts` declares it.
 */
const PRODUCER_PATHS: readonly string[] = [join('src', 'services', 'challenges', 'verification.ts')];

/**
 * The exercising surface: the tests that drive `verifyChallengeSubmission`.
 * An explicit list rather than a glob over `tests/`, for the reason the
 * producing surface is one -- five other test files spell `'invalid-shape'`
 * against vocabularies that have nothing to do with challenges.
 */
const EXERCISER_PATHS: readonly string[] = [join('tests', 'unit', 'services-challenge-verification.test.ts')];

/** Where the vocabulary is declared. Deliberately in neither surface above. */
const DECLARATION_PATH = join('src', 'services', 'challenges', 'rejection-codes.ts');

function collectTypeScriptFiles(target: string): readonly string[] {
  const absolute = join(ROOT, target);
  if (!statSync(absolute).isDirectory()) return absolute.endsWith('.ts') ? [absolute] : [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    files.push(...collectTypeScriptFiles(join(target, entry)));
  }
  return files;
}

interface ScannedSource {
  readonly where: string;
  readonly text: string;
}

function scan(paths: readonly string[]): readonly ScannedSource[] {
  return paths
    .flatMap((target) => collectTypeScriptFiles(target))
    .map((path) => ({
      where: relative(ROOT, path).split(sep).join('/'),
      // Stripped with the shared stripper (#188), and **precautionary on
      // both surfaces rather than load-bearing** -- said plainly because the
      // difference matters and the honest answer here is the weaker one.
      // Measured: neither scanned file spells any code inside a comment
      // without also spelling it in code, so replacing this with the identity
      // function leaves all six assertions green, and that mutation survives.
      // It stays because both files discuss this vocabulary at length,
      // including sentences naming exactly which codes no test reached, and
      // the first such sentence that outlives its test would otherwise read
      // as coverage -- which is the whole failure mode of the exercise
      // direction.
      text: stripComments(readFileSync(path, 'utf8')),
    }));
}

const producerSources = scan(PRODUCER_PATHS);
const exerciserSources = scan(EXERCISER_PATHS);

const mentions = (sources: readonly ScannedSource[], code: string): boolean =>
  sources.some((source) => source.text.includes(`'${code}'`));

const unemitted = CHALLENGE_REJECTION_CODES.filter((code) => !mentions(producerSources, code));
const unexercised = CHALLENGE_REJECTION_CODES.filter((code) => !mentions(exerciserSources, code));

type ChallengeCode = (typeof CHALLENGE_REJECTION_CODES)[number];

/**
 * Both directions, as one helper: an allow-list entry with no reason, a code
 * the list forgot, a code that gained what its entry says it lacks, and a code
 * the vocabulary no longer declares.
 */
function assertAccountedFor(
  missing: readonly string[],
  allowList: Readonly<Record<string, string>>,
  what: string,
): void {
  const unlisted = missing.filter((code) => allowList[code] === undefined);
  expect(
    unlisted,
    `a challenge rejection code ${what}. Wire it, or record it with what is true about it today`,
  ).toEqual([]);

  for (const [code, reason] of Object.entries(allowList)) {
    expect(reason.trim().length, `${code} needs a reason`).toBeGreaterThan(80);
  }

  const stale = Object.keys(allowList).filter(
    (code) => CHALLENGE_REJECTION_CODES.includes(code as ChallengeCode) && !missing.includes(code),
  );
  expect(stale, `these codes no longer match their entry: delete it in the same change`).toEqual([]);

  const removed = Object.keys(allowList).filter((code) => !CHALLENGE_REJECTION_CODES.includes(code as ChallengeCode));
  expect(
    removed.map((code) => `${code}: ${allowList[code]}`),
    'a code this list accounts for is no longer in the vocabulary -- if that removal is deliberate, delete its entry in the same change',
  ).toEqual([]);
}

describe('every challenge rejection code can be produced and is driven by a test', () => {
  it('scans the surfaces it means to, and really finds the vocabulary in them', () => {
    // Vacuity guard, both halves and both surfaces. An empty file list makes
    // every code missing (loud). A scan that matched nothing -- a stripper
    // that blanked the files, a moved module -- would do the same in a way a
    // file count cannot see, so each surface is named along with a code it
    // must contain.
    expect(CHALLENGE_REJECTION_CODES.length).toBe(24);
    expect(new Set(CHALLENGE_REJECTION_CODES).size).toBe(CHALLENGE_REJECTION_CODES.length);

    expect(producerSources.map((source) => source.where)).toEqual(['src/services/challenges/verification.ts']);
    expect(producerSources[0]!.text).toContain(`'objective-metric-missing'`);

    expect(exerciserSources.map((source) => source.where)).toEqual([
      'tests/unit/services-challenge-verification.test.ts',
    ]);
    expect(exerciserSources[0]!.text).toContain(`'metrics-mismatch'`);
  });

  it('accounts for every code the pipeline cannot produce', () => {
    assertAccountedFor(unemitted, UNEMITTED_CODES, 'no `reject(...)` in the pipeline produces');
  });

  it('accounts for every code no test names', () => {
    assertAccountedFor(unexercised, UNEXERCISED_CODES, 'no test under the exercising surface names');
  });

  it('keeps the declaration out of the producing surface, which would otherwise vouch for itself', () => {
    /*
     * The sharpest scope control here, and the reason `rejection-codes.ts`
     * exists as a module at all. It lists every code as a literal, so a
     * producing surface that included it -- `src/services/challenges/`, the
     * obvious wrong choice -- would report all twenty-four emitted with the
     * pipeline gutted to a single `reject('invalid-shape', ...)`.
     *
     * Fails in both useful directions: widening PRODUCER_PATHS to the
     * directory puts this file in `producerSources`, and moving the
     * declaration into `verification.ts` fails the first assertion here.
     */
    const declaration = stripComments(readFileSync(join(ROOT, DECLARATION_PATH), 'utf8'));
    for (const code of CHALLENGE_REJECTION_CODES) {
      expect(declaration, `${DECLARATION_PATH} no longer declares '${code}'`).toContain(`'${code}'`);
    }
    expect(
      producerSources.map((source) => source.where),
      'the vocabulary declaration is inside the producing surface, so this gate now vouches for itself',
    ).not.toContain(DECLARATION_PATH.split(sep).join('/'));
  });

  it('keeps both surfaces narrow, proven against the code spelled the same elsewhere', () => {
    /*
     * The negative control. `'invalid-shape'` is the one member of this
     * vocabulary that other vocabularies also spell, and they spell it in ten
     * files across `src/` and `tests/` -- including one in the pipeline's
     * own directory. A repository-wide scan would count all nine, so if the
     * pipeline stopped emitting `invalid-shape`, or the challenge tests
     * stopped driving it, this gate would stay green on the strength of the
     * entitlement webhook and the save migrator.
     *
     * Fails in both useful directions: widening either surface puts these
     * files into it and fails the second assertion, and a foreign occurrence
     * disappearing fails the first, at which point its entry should go.
     */
    const FOREIGN_OCCURRENCES: readonly { readonly code: string; readonly file: string; readonly vocabulary: string }[] = [
      { code: 'invalid-shape', file: 'src/services/challenges/challenge.ts', vocabulary: 'ChallengeDefinitionAuthenticationResult' },
      { code: 'invalid-shape', file: 'src/services/entitlements/webhook.ts', vocabulary: 'WebhookRejectionCode' },
      { code: 'invalid-shape', file: 'src/persistence/migration.ts', vocabulary: 'save migration failure' },
      { code: 'invalid-shape', file: 'src/persistence/save-schema.ts', vocabulary: 'save decode failure' },
      { code: 'invalid-shape', file: 'src/input/settings.ts', vocabulary: 'settings decode failure' },
      { code: 'invalid-shape', file: 'tests/unit/services-entitlements.test.ts', vocabulary: 'WebhookRejectionCode' },
      { code: 'invalid-shape', file: 'tests/unit/persistence-migration.test.ts', vocabulary: 'save migration failure' },
      { code: 'invalid-shape', file: 'tests/unit/persistence-save-schema.test.ts', vocabulary: 'save decode failure' },
      { code: 'invalid-shape', file: 'tests/migrations/save-v1-to-v2.test.ts', vocabulary: 'save migration failure' },
      { code: 'invalid-shape', file: 'tests/migrations/save-v2-to-v3.test.ts', vocabulary: 'save migration failure' },
    ];

    const inScope = [...producerSources, ...exerciserSources].map((source) => source.where);
    for (const { code, file, vocabulary } of FOREIGN_OCCURRENCES) {
      const text = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      expect(
        text.includes(`'${code}'`),
        `${file} no longer spells '${code}' for ${vocabulary} -- delete its FOREIGN_OCCURRENCES entry, since it is no longer evidence that a wide scan would be wrong`,
      ).toBe(true);
      expect(
        inScope,
        `${file} is inside a scanned surface, so this gate would now count a foreign vocabulary as evidence`,
      ).not.toContain(file);
    }

    // The denominator for the control itself: ten is the number measured, so
    // an eleventh foreign spelling appearing is something a reader should see
    // rather than something that silently joins a list.
    expect(FOREIGN_OCCURRENCES.length).toBe(10);
  });

  it('measures a fully reachable vocabulary in both directions, which is the number #264 changed', () => {
    // The denominators, stated so the gate reports a fact and not only guards
    // one. The exercise figure was 20 of 23 when #264 was filed; making both
    // exact means a code that quietly loses its last producer or its last test
    // cannot be settled by adding a list entry alone -- the count has to
    // change too, and a reviewer sees that the vocabulary stopped being whole.
    //
    // The twenty-fourth is `final-tick-mismatch` (#318), and moving all three
    // numbers is what the exactness is for: a code cannot join this vocabulary
    // without a reviewer seeing the denominator move, and it cannot join
    // without arriving with both a producer and a test, which is the state
    // #264 found three codes failing in the second half of.
    expect(unemitted).toEqual([]);
    expect(unexercised).toEqual([]);
    expect(CHALLENGE_REJECTION_CODES.filter((code) => mentions(producerSources, code)).length).toBe(24);
    expect(CHALLENGE_REJECTION_CODES.filter((code) => mentions(exerciserSources, code)).length).toBe(24);
  });
});
