import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { PROTOCOL_FAULT_CODES } from '../../src/simulation/protocol/types';

/**
 * A fault code the worker cannot emit is a reason the main thread can never be
 * given.
 *
 * `ProtocolFaultCode` is a closed twelve-member vocabulary, and it has twice
 * been found carrying members nothing could produce:
 *
 * - #139/#184: `unsupported-protocol-version` and `unknown-message-kind` were
 *   unreachable because `src/simulation/worker/worker.ts` computed the
 *   decoder's classification and then reported a hard-coded `'invalid-message'`
 *   instead. Two lines of fix.
 * - #187 finding 2: `duplicate-message` and `sequence-gap` were unreachable
 *   because every kernel refusal reported `'invalid-state'`. The kernel decided
 *   all three cases in adjacent `if` branches and put the answer in the `Error`
 *   *message* -- so a rejected gap reached the main thread as
 *   `code: 'invalid-state'`, `message: 'Command sequence gap: expected 0, got 1'`.
 *
 * Both were found by a person reading the enum, and in both cases the whole
 * suite was green. This makes it a checked state instead: a member that nothing
 * emits must be recorded with a reason, and a recorded member that gains an
 * emitter must have its entry removed.
 *
 * ## What counts as emitting
 *
 * The code as a single-quoted literal, comments stripped, in a `.ts` file under
 * the **producing** surface only:
 *
 * - `src/simulation/protocol/decode.ts` -- the four decode classifications;
 * - `src/simulation/worker/**` -- every `fault()` call site and the
 *   command-result mapping.
 *
 * Scoping this narrowly is the whole measurement, and a repository-wide scan
 * would be actively wrong rather than merely loose. Three same-named strings
 * elsewhere are **not** this vocabulary, and were each checked:
 *
 * - `src/persistence/cloud/sync-engine.ts` has `reason: 'invalid-payload'` on
 *   its own `PullResult` union -- a different type, a different meaning
 *   (a cloud save that would not decode), and nothing to do with the protocol.
 * - `src/content/simulation-message-keys.ts` has `'shutting-down'` as a
 *   *worker-state* label for the HUD, not a fault.
 * - `src/persistence/session/worker-session-host.ts` has
 *   `error.code === 'snapshot-incompatible'`, which is a **consumer** reading a
 *   fault, not a producer emitting one.
 *
 * There is a fourth, and it is this change's own: `'sequence-gap'` is *also* a
 * `CommandRejectionKind` discriminant in `src/simulation/kernel/kernel.ts`. Two
 * vocabularies, one spelling, for the same real condition -- which is why the
 * mapping in `state-machine.ts` looks like an identity for that one entry.
 *
 * A wide scan would count all four, and the consequence is specific: if the
 * worker stopped emitting `invalid-payload`, the gate would stay green on the
 * strength of an unrelated union in the persistence tree. That is the "check
 * that reads as protection and is wired to nothing" shape this file exists to
 * prevent, so it must not be this file's own shape -- and because a fully
 * reachable vocabulary makes a widened scope harmlessly invisible, the scope is
 * pinned by a **negative control** below rather than left as an argument.
 *
 * The gate deliberately does not assert that each code is *reachable at
 * runtime* -- only that something produces it. Driving every producer would
 * mean a test per fault, and `tests/unit/worker-state-machine.test.ts` already
 * drives the three command refusals end to end.
 */

const ROOT = join(__dirname, '../..');

/**
 * Codes the vocabulary declares that nothing emits, with why.
 *
 * **Empty, and that is the assertion.** It held two entries until #187 finding
 * 2 was fixed and it should stay empty: every member of a closed refusal
 * vocabulary ought to be a refusal something can actually make. The list exists
 * so that adding a code before its producer is a decision someone writes down
 * rather than a silent gap -- the same shape as
 * `tests/unit/services-layer-boundaries.test.ts`'s deliberately empty
 * `MODULES_PERFORMING_IO`.
 *
 * A reason must say what is verifiably true today and must not invent a plan
 * for the code; that is the invented-consequence defect this repository spends
 * the most effort on.
 */
const UNEMITTED_CODES: Readonly<Record<string, string>> = {};

/** The producing surface. Everything else in `src/` is a consumer or a coincidence. */
const PRODUCER_PATHS: readonly string[] = [
  join('src', 'simulation', 'protocol', 'decode.ts'),
  join('src', 'simulation', 'worker'),
];

function collectTypeScriptFiles(target: string): readonly string[] {
  const absolute = join(ROOT, target);
  if (!statSync(absolute).isDirectory()) return absolute.endsWith('.ts') ? [absolute] : [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    files.push(...collectTypeScriptFiles(join(target, entry)));
  }
  return files;
}

const producerSources = PRODUCER_PATHS.flatMap((target) => collectTypeScriptFiles(target)).map((path) => ({
  where: relative(ROOT, path).split(sep).join('/'),
  // Stripped with the shared stripper, and **precautionary here rather than
  // load-bearing** -- said plainly because the difference matters. Measured
  // across the producing surface: no fault code currently appears in a comment
  // without also appearing in code, so replacing this with the identity
  // function changes nothing the gate can see, and that mutation survives. It
  // stays because these two files discuss the vocabulary at length, including
  // sentences naming which codes were unreachable, and the first such sentence
  // that outlives its code would otherwise read as an emission (#188).
  text: stripComments(readFileSync(path, 'utf8')),
}));

const emits = (code: string): boolean => producerSources.some((source) => source.text.includes(`'${code}'`));
const unemitted = PROTOCOL_FAULT_CODES.filter((code) => !emits(code));

describe('every protocol fault code can actually be emitted', () => {
  it('scans the producing surface it means to, and really finds emissions in it', () => {
    // Vacuity guard, both halves. An empty file list makes every code unemitted
    // (loud). A scan that matched nothing -- a stripper that blanked the files,
    // a moved module -- would do the same in a way a file count cannot see, so
    // the positive control names the producers and a code each must contain.
    expect(PROTOCOL_FAULT_CODES.length).toBe(12);
    expect(new Set(PROTOCOL_FAULT_CODES).size).toBe(PROTOCOL_FAULT_CODES.length);
    expect(producerSources.length).toBeGreaterThanOrEqual(3);

    const decode = producerSources.find((source) => source.where === 'src/simulation/protocol/decode.ts');
    expect(decode, 'the decoder is no longer where this gate looks for it').toBeDefined();
    expect(decode!.text).toContain(`'unsupported-protocol-version'`);

    const stateMachine = producerSources.find((source) => source.where === 'src/simulation/worker/state-machine.ts');
    expect(stateMachine, 'the worker state machine is no longer where this gate looks for it').toBeDefined();
    expect(stateMachine!.text).toContain(`'already-initialized'`);
  });

  it('accounts for every code nothing emits', () => {
    const unlisted = unemitted.filter((code) => UNEMITTED_CODES[code] === undefined);
    expect(
      unlisted,
      'a fault code nothing under the producing surface emits. A code the worker cannot report is a reason the main thread can never be given (#139, #187): wire a producer, or record it in UNEMITTED_CODES with what is true about it today',
    ).toEqual([]);

    for (const [code, reason] of Object.entries(UNEMITTED_CODES)) {
      expect(reason.trim().length, `${code} needs a reason`).toBeGreaterThan(80);
    }
  });

  it('holds no entry for a code that has since gained a producer', () => {
    // The direction that makes the list a gate rather than a note.
    const declared = new Set<string>(PROTOCOL_FAULT_CODES);
    const stale = Object.keys(UNEMITTED_CODES).filter(
      (code) => declared.has(code) && !unemitted.includes(code as (typeof PROTOCOL_FAULT_CODES)[number]),
    );
    expect(stale, 'these codes now have a producer: delete their UNEMITTED_CODES entries in the same change').toEqual([]);
  });

  it('still declares every code the list names', () => {
    const declared = new Set<string>(PROTOCOL_FAULT_CODES);
    const removed = Object.keys(UNEMITTED_CODES).filter((code) => !declared.has(code));
    expect(
      removed.map((code) => `${code}: ${UNEMITTED_CODES[code]}`),
      'a code this list accounts for is no longer in the vocabulary -- if that removal is deliberate, delete its entry in the same change',
    ).toEqual([]);
  });

  it('keeps the producing surface narrow, proven against the codes spelled the same elsewhere', () => {
    /*
     * The negative control, and the reason it exists rather than a comment.
     *
     * While every code is emitted, widening the scope to all of `src/` cannot
     * make any assertion above fail -- more matches with everything already
     * matched changes nothing. Measured: that mutation survives. So the scope
     * is asserted directly, as the property that makes it necessary: these four
     * codes occur outside the producing surface, under a *different*
     * vocabulary each time, so a wide scan would report them emitted on
     * evidence that has nothing to do with the worker.
     *
     * This fails in both useful directions. Widening PRODUCER_PATHS puts these
     * files in `producerSources` and fails the second assertion; a foreign
     * occurrence disappearing fails the first, and its entry should then go.
     */
    const FOREIGN_OCCURRENCES: Readonly<Record<string, string>> = {
      'invalid-payload': 'src/persistence/cloud/sync-engine.ts',
      'shutting-down': 'src/content/simulation-message-keys.ts',
      'snapshot-incompatible': 'src/persistence/session/worker-session-host.ts',
      'sequence-gap': 'src/simulation/kernel/kernel.ts',
    };

    for (const [code, file] of Object.entries(FOREIGN_OCCURRENCES)) {
      const text = stripComments(readFileSync(join(ROOT, file), 'utf8'));
      expect(
        text.includes(`'${code}'`),
        `${file} no longer spells '${code}' -- delete its FOREIGN_OCCURRENCES entry, since it is no longer evidence that a wide scan would be wrong`,
      ).toBe(true);
      expect(
        producerSources.map((source) => source.where),
        `${file} is inside the producing surface, so this gate would now count a foreign vocabulary as an emission`,
      ).not.toContain(file);
    }

    // And the denominator for the control itself: four is the number measured,
    // so a fifth foreign spelling appearing is something a reader should see
    // rather than something that silently joins a list.
    expect(Object.keys(FOREIGN_OCCURRENCES).length).toBe(4);
  });

  it('measures a fully reachable vocabulary, which is the number #187 changed', () => {
    // The denominator, stated so the gate reports a fact and not only guards
    // one. It was 10 of 12 before #187 finding 2; making it exact means a code
    // that quietly loses its last producer cannot be fixed by adding a list
    // entry alone -- the count has to be changed too, and a reviewer sees that
    // the vocabulary stopped being whole.
    expect(unemitted).toEqual([]);
    expect(PROTOCOL_FAULT_CODES.filter((code) => emits(code)).length).toBe(12);
  });
});
