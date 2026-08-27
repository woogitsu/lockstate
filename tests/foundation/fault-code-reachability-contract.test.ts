import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import { PROTOCOL_FAULT_CODES } from '../../src/simulation/protocol/types';

/**
 * A fault code the worker cannot emit is a reason the main thread can never be
 * given.
 *
 * `ProtocolFaultCode` is a closed twelve-member vocabulary, and it has three
 * times been found carrying members nothing could produce:
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
 * - #444 item 1: `shutting-down` has never had a producer, and **this gate
 *   reported it emitted** on the strength of a name collision inside its own
 *   producing surface. See "What counts as emitting" below: the matcher used
 *   to accept the code anywhere in the file text, and
 *   `src/simulation/worker/state-machine.ts` spells `'shutting-down'` three
 *   times as the `WorkerState` of that name. It is now recorded in
 *   `UNEMITTED_CODES`.
 *
 * The first two were found by a person reading the enum, the third by renaming
 * a worker state, and in all three cases the whole suite was green. This makes
 * it a checked state instead: a member that nothing emits must be recorded with
 * a reason, and a recorded member that gains an emitter must have its entry
 * removed.
 *
 * ## What counts as emitting
 *
 * An **emitting position**, not an occurrence. The distinction is the whole of
 * #444 item 1: `emits` used to be `text.includes("'" + code + "'")` over the
 * producing surface, so any string spelled like a fault code counted -- and the
 * one that did was in `state-machine.ts` itself, where scoping the surface
 * narrowly could not help. Renaming the `WorkerState` label `'shutting-down'`,
 * a refactor that changes no fault behaviour at all, turned the gate red.
 *
 * The three positions, all of them read out of `.ts` files under the
 * **producing** surface with comments stripped:
 *
 * 1. **A `fault(` argument** -- `this.fault('not-initialized', ...)` and
 *    `stateMachine.fault('internal-error', ...)`. `SimulationWorkerStateMachine.fault`
 *    is the only thing in the repository that posts a `protocol/error`, so a
 *    literal in its first argument is an emission by construction.
 * 2. **A value in `COMMAND_REJECTION_FAULT_CODES`** (`state-machine.ts`) -- the
 *    kernel-refusal mapping, reached through `commandRejectionFaultCode` and
 *    handed to `fault()` as a variable.
 * 3. **An entry in `PROTOCOL_DECODE_ERROR_CODES`** (`decode.ts`) -- the four
 *    decode classifications, reported verbatim by `worker.ts` as
 *    `stateMachine.fault(result.error.code, ...)`, again as a variable.
 *
 * Positions 2 and 3 exist because 1 alone cannot see a code that reaches
 * `fault()` through a table. Nothing else counts: a key, a comparison, a union
 * member and a HUD label are not emissions no matter which file they are in.
 *
 * The producing surface stays narrow on top of that, and the two guards are
 * independent:
 *
 * - `src/simulation/protocol/decode.ts` -- the four decode classifications;
 * - `src/simulation/worker/**` -- every `fault()` call site and the
 *   command-result mapping.
 *
 * Three same-named strings elsewhere in `src/` are **not** this vocabulary, and
 * were each checked:
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
 * There is a fourth: `'sequence-gap'` is *also* a `CommandRejectionKind`
 * discriminant in `src/simulation/kernel/kernel.ts`. Two vocabularies, one
 * spelling, for the same real condition -- which is why the mapping in
 * `state-machine.ts` looks like an identity for that one entry.
 *
 * Under the tightened matcher none of those four sits in an emitting position,
 * so widening the scope would no longer report them emitted; the negative
 * control below now measures exactly that rather than asserting it in prose,
 * and still fails if `PRODUCER_PATHS` is widened.
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
 * It held two entries until #187 finding 2 was fixed, was empty until #444
 * item 1 tightened the matcher below, and holds one now. Every member of a
 * closed refusal vocabulary ought to be a refusal something can actually make;
 * the list exists so that a code without a producer is a decision someone
 * writes down rather than a silent gap -- the same shape as
 * `tests/unit/services-layer-boundaries.test.ts`'s deliberately empty
 * `MODULES_PERFORMING_IO`.
 *
 * A reason must say what is verifiably true today and must not invent a plan
 * for the code; that is the invented-consequence defect this repository spends
 * the most effort on.
 */
const UNEMITTED_CODES: Readonly<Record<string, string>> = {
  'shutting-down':
    'No producer, and no producer has been found in any revision this gate has run against. ' +
    'It is in neither `COMMAND_REJECTION_FAULT_CODES` nor `PROTOCOL_DECODE_ERROR_CODES`, and ' +
    '`grep -rn "fault(\'shutting-down\'" src` returns nothing. The three occurrences in ' +
    '`src/simulation/worker/state-machine.ts` are the `WorkerState` of the same name: the union ' +
    'member, the `handleSubmitCommand` guard and the `handleShutdown` transition. That guard is ' +
    'what a producer would replace -- it reads `if (this._state === \'shutting-down\' || ' +
    'this._state === \'faulted\') return;`, so a command sent during shutdown is answered with ' +
    'silence rather than with this code, and the main thread waits out its own timeout. The ' +
    'consumer side is already wired for a code nothing sends: `src/ui/simulation-alerts.ts` maps ' +
    'it to `hud.alert.fault.shutting-down` and `src/content/default-locale-en.ts` has the string. ' +
    'Whether that guard should fault instead of returning is #444 item 2. It changes session ' +
    'lifetime, it is an ADR-level decision, and it is not made here: this entry records the ' +
    'absence and claims nothing about how it should be resolved.',
};

/** The producing surface. Everything else in `src/` is a consumer or a coincidence. */
const PRODUCER_PATHS: readonly string[] = [
  join('src', 'simulation', 'protocol', 'decode.ts'),
  join('src', 'simulation', 'worker'),
];

/**
 * The tables whose *values* reach `fault()` as a variable.
 *
 * `shape` says which literals in the block are emissions: every literal in an
 * array, and only the values in an object. `COMMAND_REJECTION_FAULT_CODES`
 * needs that distinction -- its keys are `CommandRejectionKind`, a different
 * vocabulary that happens to share the spelling `sequence-gap`.
 */
const EMITTING_TABLES = [
  { declaration: 'PROTOCOL_DECODE_ERROR_CODES', shape: 'array', size: 4 },
  { declaration: 'COMMAND_REJECTION_FAULT_CODES', shape: 'object', size: 3 },
] as const;

/** How many `fault(` call sites pass a literal code today, across the producing surface. */
const LITERAL_FAULT_CALL_SITES = 15;

function collectTypeScriptFiles(target: string): readonly string[] {
  const absolute = join(ROOT, target);
  if (!statSync(absolute).isDirectory()) return absolute.endsWith('.ts') ? [absolute] : [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute)) {
    files.push(...collectTypeScriptFiles(join(target, entry)));
  }
  return files;
}

/**
 * The `[ ... ]` or `{ ... }` a `const <declaration>` is assigned, brackets
 * included, or `undefined` if this text does not declare it.
 *
 * Depth-counted rather than matched with a regex, and string literals are
 * skipped whole, so neither a nested object nor a bracket inside a quoted code
 * can end the block early. It reads a slice rather than the file, which is the
 * point: a literal outside the table is not a value of the table.
 */
function declarationBlock(text: string, declaration: string): string | undefined {
  const declared = text.indexOf(`const ${declaration}`);
  if (declared === -1) return undefined;
  const assigned = text.indexOf('=', declared);
  if (assigned === -1) return undefined;
  const offset = text.slice(assigned).search(/[[{]/);
  if (offset === -1) return undefined;

  const from = assigned + offset;
  const open = text[from]!;
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let at = from; at < text.length; at += 1) {
    const character = text[at]!;
    if (character === `'` || character === '"' || character === '`') {
      const end = text.indexOf(character, at + 1);
      if (end === -1) return undefined;
      at = end;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return text.slice(from, at + 1);
    }
  }
  return undefined;
}

interface Emission {
  readonly code: string;
  readonly where: string;
  /** Which of the three emitting positions this came out of. */
  readonly position: string;
}

const producerSources = PRODUCER_PATHS.flatMap((target) => collectTypeScriptFiles(target)).map((path) => ({
  where: relative(ROOT, path).split(sep).join('/'),
  // Stripped with the shared stripper, and **load-bearing since #444 item 1**
  // in one direction it was not before: `worker.ts` and `state-machine.ts`
  // discuss `fault()` calls in prose, and a comment reading
  // `stateMachine.fault('internal-error', ...)` matches the call-site pattern
  // exactly. Before the matcher looked at position, a comment could only add a
  // code that the surrounding code already emitted (#188); now it can invent
  // an emitting position outright.
  text: stripComments(readFileSync(path, 'utf8')),
}));

function emissionsIn(source: { readonly where: string; readonly text: string }): readonly Emission[] {
  const found: Emission[] = [];

  // Position 1: a literal in `fault()`'s first argument. `\s*` spans newlines,
  // because four of these call sites put the code on its own line.
  for (const match of source.text.matchAll(/\bfault\(\s*'([^']*)'/g)) {
    found.push({ code: match[1]!, where: source.where, position: 'fault() argument' });
  }

  // Positions 2 and 3: a value of a table `fault()` is called with.
  for (const table of EMITTING_TABLES) {
    const block = declarationBlock(source.text, table.declaration);
    if (block === undefined) continue;
    const literals = table.shape === 'object' ? block.matchAll(/:\s*'([^']*)'/g) : block.matchAll(/'([^']*)'/g);
    for (const match of literals) {
      found.push({ code: match[1]!, where: source.where, position: table.declaration });
    }
  }

  return found;
}

const emissions = producerSources.flatMap((source) => emissionsIn(source));
const emittedCodes = new Set(emissions.map((emission) => emission.code));
const emits = (code: string): boolean => emittedCodes.has(code);
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

  it('finds all three emitting positions, so a matcher that stopped matching is loud', () => {
    /*
     * The vacuity guard the text scan did not need and this one does.
     *
     * `emits` reads three syntactic shapes. Any of them can stop matching
     * silently -- `fault()` renamed, a table renamed or moved out of the
     * surface, `declarationBlock` failing to find its brackets -- and the
     * failure mode is a code reported unemitted for a reason that has nothing
     * to do with its producer. Each position is therefore pinned at what it
     * finds today, so the gate says which shape broke rather than which code
     * "lost" its emitter.
     *
     * The call-site count is a floor: adding a `fault()` call is ordinary work
     * and should not fail here. The two table sizes are exact, because both are
     * closed vocabularies -- four decode classifications, three
     * `CommandRejectionKind` members -- and a table that grew or shrank is
     * something a reader of this gate should see.
     */
    const at = (position: string): readonly Emission[] => emissions.filter((emission) => emission.position === position);

    expect(at('fault() argument').length, 'no `fault(<literal>)` call site matched: has `fault` been renamed?').toBeGreaterThanOrEqual(
      LITERAL_FAULT_CALL_SITES,
    );
    for (const table of EMITTING_TABLES) {
      expect(at(table.declaration).length, `${table.declaration} is no longer readable where this gate looks for it`).toBe(table.size);
    }

    // And the shape of the object reader, stated as the thing it must not do:
    // `'sequence-gap'` is a key of `COMMAND_REJECTION_FAULT_CODES` as well as a
    // value of it, and `'duplicate-sequence'` is only ever a key. A reader that
    // took both sides would report a `CommandRejectionKind` as a fault code.
    const rejectionValues = at('COMMAND_REJECTION_FAULT_CODES').map((emission) => emission.code);
    expect(rejectionValues).not.toContain('duplicate-sequence');
    expect(rejectionValues).toContain('duplicate-message');
  });

  it('reads each producer as emitting exactly the codes it emits', () => {
    /*
     * #444 item 1, as an assertion rather than a docblock, and stated per file
     * so the diff on a break names the producer.
     *
     * These two sets are read out of the emitting positions, not out of the
     * file text, and that is the whole difference: `state-machine.ts` spells
     * `'shutting-down'` three times -- the `WorkerState` union member, the
     * `handleSubmitCommand` guard and the `handleShutdown` transition -- and
     * none of them is here. Renaming that worker state, which changes no fault
     * behaviour, must move nothing in this test; under the old text matcher it
     * turned the gate red.
     *
     * Written out rather than derived from `PROTOCOL_FAULT_CODES`: a set
     * computed from the vocabulary would be true of any matcher that found the
     * vocabulary somewhere in the file.
     */
    const codesFrom = (where: string): readonly string[] => {
      const source = producerSources.find((candidate) => candidate.where === where);
      expect(source, `${where} is no longer where this gate looks for it`).toBeDefined();
      return [...new Set(emissionsIn(source!).map((emission) => emission.code))].sort();
    };

    expect(codesFrom('src/simulation/protocol/decode.ts')).toEqual([
      'invalid-message',
      'invalid-payload',
      'unknown-message-kind',
      'unsupported-protocol-version',
    ]);
    expect(codesFrom('src/simulation/worker/state-machine.ts')).toEqual([
      'already-initialized',
      'duplicate-message',
      'internal-error',
      'invalid-payload',
      'invalid-state',
      'not-initialized',
      'sequence-gap',
      'snapshot-incompatible',
    ]);
  });

  it('does not read a worker state, a key or a comparison as an emission', () => {
    /*
     * The matcher against the three shapes that fooled the one it replaced,
     * written out rather than read from `src/` so the case survives the
     * refactor that exposed it. Each line below is a real line of
     * `state-machine.ts` with its identifier left as it stands today; the
     * expectation is that the matcher reads no emission in any of them.
     */
    const collisions = [
      `type WorkerState = 'uninitialized' | 'shutting-down' | 'faulted';`,
      `if (this._state === 'shutting-down' || this._state === 'faulted') { return; }`,
      `this.transition('shutting-down');`,
      `const HUD_LABELS = { 'shutting-down': 'Shutting Down' };`,
      `if (error.code === 'snapshot-incompatible') throw new SnapshotRestoreRejectedError(error);`,
    ].join('\n');
    expect(emissionsIn({ where: 'synthetic', text: collisions })).toEqual([]);

    // And the positive half, so the fixture above is not passing because the
    // matcher reads nothing at all: the same file with one real call site and
    // one real table entry in it.
    const withProducers = [
      collisions,
      `return this.fault('not-initialized', 'Kernel is not initialized.', { replyTo: msg.messageId });`,
      `const COMMAND_REJECTION_FAULT_CODES = { 'duplicate-sequence': 'duplicate-message' };`,
    ].join('\n');
    expect(emissionsIn({ where: 'synthetic', text: withProducers }).map((emission) => emission.code).sort()).toEqual([
      'duplicate-message',
      'not-initialized',
    ]);
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
     * It used to rest on the claim that a wide scan would count these four as
     * emissions. That claim was true of the text matcher and is **false of the
     * one above**: none of these occurrences is a `fault()` argument or a value
     * of either table, so widening the scope would leave every count unchanged.
     * The control is kept and re-aimed rather than deleted, because the two
     * guards are independent and each is cheap: the matcher is what stops a
     * foreign spelling counting, and the scope is what stops a foreign *file*
     * being read at all. #444 item 1 is what happens when only one of them is
     * doing work.
     *
     * So it now measures both. Per file: the spelling is still there (else the
     * entry is stale evidence and should go), the file is still outside
     * `PRODUCER_PATHS` -- which is what fails if the scope is widened -- and
     * the matcher finds no emission in it, which is what fails if the matcher
     * loosens back towards a text scan.
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
      expect(
        emissionsIn({ where: file, text }).map((emission) => emission.code),
        `${file} spells '${code}' in a position this gate reads as an emission, so the matcher is no longer distinguishing the two vocabularies`,
      ).not.toContain(code);
    }

    // And the denominator for the control itself: four is the number measured,
    // so a fifth foreign spelling appearing is something a reader should see
    // rather than something that silently joins a list.
    expect(Object.keys(FOREIGN_OCCURRENCES).length).toBe(4);
  });

  it('measures a vocabulary that is reachable but for one recorded code', () => {
    // The denominator, stated so the gate reports a fact and not only guards
    // one. It was 10 of 12 before #187 finding 2, read as 12 of 12 until #444
    // item 1 stopped the `WorkerState` label counting, and is 11 of 12
    // measured. Making it exact means a code that quietly loses its last
    // producer cannot be fixed by adding a list entry alone -- the count has to
    // be changed too, and a reviewer sees that the vocabulary got smaller.
    expect(unemitted).toEqual(['shutting-down']);
    expect(PROTOCOL_FAULT_CODES.filter((code) => emits(code)).length).toBe(11);
  });
});
