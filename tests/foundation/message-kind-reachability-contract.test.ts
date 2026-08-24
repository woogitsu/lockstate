import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';
import {
  MAIN_TO_WORKER_MESSAGE_KINDS,
  WORKER_TO_MAIN_MESSAGE_KINDS,
} from '../../src/simulation/protocol/types';

/**
 * The third member of the reachability family, after
 * `fault-code-reachability-contract.test.ts` (twelve fault codes) and
 * `challenge-rejection-code-reachability-contract.test.ts` (twenty-three
 * rejection codes). `tests/foundation/` gates commands, content ids, input
 * actions, fault codes and challenge rejection codes, and has never gated the
 * eighteen **protocol message kinds** that carry all of them -- which #274 A2
 * called *"the single highest-value test this audit found missing"*, asking
 * for it as `unconsumed-message-kind-contract.test.ts`. It is named for the
 * family it belongs to instead, because what it measures is reachability and
 * its two nearest models are the two files above.
 *
 * Issue #274 finding A2 established that the gap is live:
 *
 * > **Nothing in `src/` has ever sent a `protocol/handshake`.** [...] Every one
 * > is the **receiver**, the kind list, or the schema. There is no sender. The
 * > only senders are in `tests/contract/` and `tests/unit/worker-state-machine.test.ts`.
 *
 * So [ADR 0003](../../docs/adr/0003-simulation-worker-protocol.md) decision 4
 * -- *"A version-1 handshake advertises supported versions and capabilities
 * before initialization"* -- and
 * [ADR 0006](../../docs/adr/0006-simulation-worker-adapter.md) state 1 --
 * *"The worker has loaded but is waiting for the `protocol/handshake`"* --
 * describe a negotiation that happens for nobody:
 * `WorkerSessionHost.initialize` (`src/persistence/session/worker-session-host.ts:142`)
 * sends `simulation/initialize` as the first message the worker ever receives.
 * Both findings were re-verified against this tree before this gate was
 * written, and the sweep found two more the audit did not name:
 * `protocol/ping` has no sender either, and neither does `simulation/event`.
 *
 * **This gate decides none of that.** Whether the handshake should be sent,
 * deleted, or folded into `simulation/initialize` is an ADR 0003 decision-4
 * question for the repository owner; the gate's job is to stop the state being
 * invisible, and to make the entries below go stale the moment it changes.
 *
 * ## The trap, which is the whole design
 *
 * The obvious gate -- "does the string `'protocol/handshake'` appear under
 * `src/`" -- is green today, on five occurrences that are all the receiver, the
 * kind list, the schema or the transfer switch. That much A2 already says. The
 * trap is one level down, and it is the reason the assertion below is a shape
 * and not a substring:
 *
 * ```ts
 * // src/simulation/worker/state-machine.ts:393
 * private handleHandshake(msg: Extract<MainToWorkerMessage, { kind: 'protocol/handshake' }>): void {
 * ```
 *
 * That line contains the exact substring `kind: 'protocol/handshake'`. So does
 * the handler for every other main-to-worker kind -- seven annotations, seven
 * kinds, all of them **receivers**. A gate that looked for `kind: '<K>'` would
 * report all seven sent, from inside the worker, which is the one place that by
 * construction can never send them. It would have been **green on A2 the day it
 * was written**, and green in exactly the "proves a symbol is named rather than
 * used" shape this family exists to prevent -- the same lesson its challenge-code
 * sibling learned from an emission-only check that could not fail on the defect
 * that motivated it.
 *
 * So a **send** here is `kind: '<K>'` **terminated by a comma** -- an object
 * literal property, the shape every one of the seventeen real send sites in
 * `src/` (fourteen distinct kinds) is written in. That excludes, mechanically:
 *
 * - `{ kind: 'protocol/handshake' }` in an `Extract<...>` type position, which
 *   ends in `}` and not `,` (the trap above, asserted below);
 * - `case 'simulation/delta':` in a receiving `switch` or in
 *   `src/simulation/protocol/transferables.ts`'s transfer-list switch;
 * - `'protocol/handshake',` in the kind lists themselves -- a bare literal with
 *   no `kind:` before it;
 * - `kind: z.literal('protocol/handshake'),` in the schemas, where `z.literal(`
 *   sits between the `kind:` and the quote;
 * - `message.kind === 'protocol/error'` and `reply.kind !== 'simulation/ready'`,
 *   which are consumers reading a kind.
 *
 * The rule's own bound, stated rather than papered over: a send written as the
 * **last** property of its object literal, with no trailing comma, would not be
 * counted. Nothing in `src/` is written that way today, and the failure is in
 * the safe direction -- the gate reports the kind unsent and demands an entry,
 * rather than reporting an absent send as present. The residual risk runs the
 * other way, and the direction check below is its backstop: a *type* literal
 * with a second member (`{ kind: 'K', payload: P }`) does carry a comma, so it
 * would read as a send -- but only from whichever file it is written in, and a
 * main-to-worker kind "sent" from inside `src/simulation/worker/` is refused.
 *
 * ## The second direction, and why a send is not yet a reachable message
 *
 * Its challenge-code sibling found that its model's single question would have
 * been green throughout the audit that motivated it, and added a second. The
 * equivalent here is not coverage but **provocation**, and it is derived rather
 * than asserted by hand:
 *
 * `protocol/handshake-accepted` and `protocol/pong` *are* sent -- `state-machine.ts:402`
 * and `:416` construct them. Both sites sit inside `handleHandshake` and
 * `handlePing`, which run only in answer to `protocol/handshake` and
 * `protocol/ping`, which nothing sends. A send-only gate reports both fine.
 * They are dead in production for the same reason and by the same one line of
 * fix, and a gate that says so is worth more than one that counts them.
 *
 * So the file is split into class members, each member's *handled* kind is read
 * from its `Extract<MainToWorkerMessage, { kind: '<K>' }>` parameter type -- the
 * trap's own annotation, used for the one thing it is honest evidence of -- and
 * a worker-to-main kind counts as reachable when at least one of its send sites
 * is either unprompted (`fault`, `publishClockState`, `publishStatusCounts`) or
 * inside a handler for a kind the main thread actually sends. Wire the
 * handshake and both entries go stale in the same run.
 *
 * ## What this gate does not claim
 *
 * It is a text scan, and the floor it asserts is "something constructs this
 * message", not "this message is exchanged at runtime". It does not follow a
 * call graph beyond the one hop above, does not know whether a sender is
 * itself reachable from `src/main.ts` (`composition-root-contract.test.ts` is
 * the gate for that), and cannot see a send built by spreading a partial
 * envelope. The runtime proof is `tests/contract/` and
 * `tests/unit/worker-state-machine.test.ts`, which drive the real state machine
 * -- and which are deliberately outside the scanned surface, since they send
 * all four of the kinds `src/` does not.
 */

const ROOT = join(__dirname, '../..');

/**
 * Main-to-worker kinds nothing under `src/` sends, with why.
 *
 * A reason must state what is verifiably true today and must not invent a plan
 * for the kind; deciding what happens to the handshake is ADR 0003 decision 4's
 * business and #274's open-decision queue, not this file's.
 */
const UNSENT_MAIN_TO_WORKER_KINDS: Readonly<Record<string, string>> = {
  'protocol/handshake':
    "#274 A2. Every occurrence in `src/` is the receiver (`state-machine.ts:366`, `:393`), the kind list, the schema or the transfer switch; `WorkerSessionHost.initialize` sends `simulation/initialize` as the worker's first message and `handleInitialize`'s guard accepts it because the state is still `uninitialized`. ADR 0003 decision 4's version and capability negotiation therefore runs for nobody, and `WorkerState`'s `'ready'` (`state-machine.ts:27`) is a state no `transition(...)` call reaches. Whether to send it, delete it, or fold it into `simulation/initialize` is an owner decision recorded on #274 and deliberately not taken here.",
  'protocol/ping':
    'Found by this gate rather than by #274, which named only the handshake. The five occurrences in `src/` are the kind list (`types.ts:8`), the schema (`:221`), the transfer-list case (`transferables.ts:31`), the dispatch case (`state-machine.ts:369`) and the handler annotation (`:411`); no main-thread module constructs one. It is a liveness probe with no caller, and the main thread has a different answer to the question it asks: every request `WorkerSessionHost` makes carries its own `DEFAULT_REPLY_TIMEOUT_MS = 15_000` timer (`worker-session-host.ts:15`, `:83-86`).',
};

/**
 * Worker-to-main kinds nothing under `src/` sends, with why.
 *
 * `simulation/delta` is the half of #274 A1 that the audit found true; A1's
 * point was that the *other* half of that ADR sentence ("no schema") is false.
 */
const UNSENT_WORKER_TO_MAIN_KINDS: Readonly<Record<string, string>> = {
  'simulation/delta':
    '#274 A1, the half of that finding which holds. The kind has a full schema with a `superRefine` enforcing `tick > baseTick` (`types.ts:400-421`), is a member of `workerToMainMessageSchema` (`:576`) and has a transfer-list case (`transferables.ts:24`), and no module constructs one: the worker publishes whole snapshots on request and `simulation/status-counts` unprompted. `SimulationSnapshotFeed` says so in its own header -- "Only the snapshot path is implemented today -- nothing emits a delta".',
  'simulation/event':
    'Declared in the kind union with a schema (`types.ts:539`) and a transfer-list case that unwraps an `ArrayBuffer` payload (`transferables.ts:28`), and constructed by nothing. It has no main-thread reader either: the four main-thread modules that `switch (message.kind)` -- `simulation-snapshot-feed.ts:107`, `simulation-commands.ts:223`, `simulation-clock.ts:26` and `simulation-counts.ts:22`, the complete set in `src/` outside `transferables.ts` -- each have a `default` and no case for it, so one that did arrive would be dropped. ADR 0003 lists "asynchronous domain events" among the families the protocol must support.',
};

/**
 * Worker-to-main kinds that `src/` constructs but that no production path can
 * provoke, with why.
 *
 * Both are here for one reason and go away with one change, which is the point
 * of deriving the list instead of writing it: they are the replies to the two
 * unsent main-to-worker kinds above.
 */
const UNREACHABLE_WORKER_TO_MAIN_KINDS: Readonly<Record<string, string>> = {
  'protocol/handshake-accepted':
    "Constructed at `state-machine.ts:402`, inside `handleHandshake`, which the dispatch switch reaches only on a `protocol/handshake` -- a kind nothing in `src/` sends (see UNSENT_MAIN_TO_WORKER_KINDS). So the message exists, is schema-checked and is unreachable in production; it carries `selectedProtocolVersion` and `capabilities: []`, which is the negotiation ADR 0003 decision 4 describes. Deleting this entry is part of whatever answer #274's open decision gets.",
  'protocol/pong':
    'Constructed at `state-machine.ts:416`, inside `handlePing`, whose only trigger is a `protocol/ping` that nothing sends. The reply echoes the request nonce, so it can be provoked by nothing else: there is no unprompted path to it and no other call site for `handlePing` than the dispatch switch at `state-machine.ts:369-370`.',
};

/**
 * The scanned surface: every `.ts` file under `src/`.
 *
 * Deliberately **not** narrowed by file, and the reason is a measured
 * difference from this gate's two models rather than a preference. Their scope
 * had to be pinned because their vocabularies are spelled by other
 * vocabularies -- `'invalid-payload'` on a `PullResult`, `'invalid-shape'` on
 * five unrelated result unions -- so a wide scan counts a foreign occurrence
 * and goes green for the wrong reason. These eighteen strings have no such
 * twin: each is a slash-namespaced protocol kind and appears nowhere in `src/`
 * under any other meaning. What separates a send from a mention here is the
 * *shape*, not the file, so that is what the negative controls pin.
 *
 * The boundary that does matter is `src/` itself, and it is load-bearing in a
 * way its models' scope is not: `tests/` sends all four of the kinds `src/`
 * does not, in the exact shape this scan matches, so widening the surface to
 * the repository turns every entry above green. TEST_ONLY_SENDERS asserts that.
 */
const SENDER_SURFACE = 'src';

/** The worker side of the boundary. Nothing else may send a worker-to-main kind. */
const WORKER_SENDER_PREFIX = 'src/simulation/worker/';

function collectTypeScriptFiles(target: string): readonly string[] {
  const absolute = join(ROOT, target);
  if (!statSync(absolute).isDirectory()) return absolute.endsWith('.ts') ? [absolute] : [];
  const files: string[] = [];
  // Sorted, because `sendingFiles` is compared as an ordered list below and
  // `readdirSync` does not promise an order across filesystems.
  for (const entry of [...readdirSync(absolute)].sort()) {
    files.push(...collectTypeScriptFiles(join(target, entry)));
  }
  return files;
}

interface ScannedSource {
  readonly where: string;
  readonly text: string;
}

function read(path: string): ScannedSource {
  return {
    where: relative(ROOT, join(ROOT, path)).split(sep).join('/'),
    // Stripped with the shared stripper (#188), and **precautionary here
    // rather than load-bearing** -- said plainly because the difference
    // matters and the honest answer is the weaker one. Measured across all 259
    // files under `src/`: no comment anywhere spells the send shape
    // `kind: '<K>',` at all, so replacing this with the identity function
    // leaves every assertion in this file green, and that mutation survives.
    // It stays because `state-machine.ts`, `worker-channel.ts` and
    // `simulation-snapshot-feed.ts` discuss these kinds at length, including
    // sentences naming which ones are not implemented, and the first such
    // sentence rewritten into the send shape would otherwise read as a sender.
    text: stripComments(readFileSync(join(ROOT, path), 'utf8')),
  };
}

const scanned: readonly ScannedSource[] = collectTypeScriptFiles(SENDER_SURFACE).map((path) =>
  read(relative(ROOT, path)),
);

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A construction of a message of this kind: `kind: '<K>'` as an object-literal
 * property, terminated by a comma. See the header for what the comma excludes
 * and what it costs.
 */
const sendPattern = (kind: string): RegExp => new RegExp(`\\bkind:\\s*'${escapeForRegExp(kind)}'\\s*,`, 'g');

const sends = (text: string, kind: string): boolean => sendPattern(kind).test(text);

const sendingFiles = (kind: string): readonly string[] =>
  scanned.filter((source) => sends(source.text, kind)).map((source) => source.where);

const unsentMainToWorker = MAIN_TO_WORKER_MESSAGE_KINDS.filter((kind) => sendingFiles(kind).length === 0);
const unsentWorkerToMain = WORKER_TO_MAIN_MESSAGE_KINDS.filter((kind) => sendingFiles(kind).length === 0);
const sentMainToWorker = new Set<string>(MAIN_TO_WORKER_MESSAGE_KINDS.filter((kind) => sendingFiles(kind).length > 0));

/** A `public`/`private`/`protected` member of a class, as written. */
interface ClassMember {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

const MEMBER_HEAD = /^ {2}(?:public|private|protected)\s+(?:readonly\s+|static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)/gm;

function classMembers(text: string): readonly ClassMember[] {
  const heads = [...text.matchAll(MEMBER_HEAD)].map((match) => ({ name: match[1]!, index: match.index }));
  return heads.map((head, position) => ({
    name: head.name,
    start: head.index,
    end: heads[position + 1]?.index ?? text.length,
  }));
}

/**
 * The main-to-worker kind a member receives, read from its
 * `Extract<MainToWorkerMessage, { kind: '<K>' }>` parameter type -- the very
 * annotation that makes a substring scan wrong, used for the one thing it is
 * honest evidence of. `undefined` means the member is not a handler, which for
 * a sender means unprompted.
 */
function handledKind(memberText: string): string | undefined {
  return MAIN_TO_WORKER_MESSAGE_KINDS.find((kind) =>
    new RegExp(`\\{\\s*kind:\\s*'${escapeForRegExp(kind)}'\\s*\\}`).test(memberText),
  );
}

interface SendSite {
  readonly file: string;
  /** The enclosing class member, or `undefined` for a send at module scope. */
  readonly member: string | undefined;
  /** The main-to-worker kind that provokes the enclosing member, if it is a handler. */
  readonly provokedBy: string | undefined;
}

function sendSites(kind: string): readonly SendSite[] {
  const sites: SendSite[] = [];
  for (const source of scanned) {
    const members = classMembers(source.text);
    for (const match of source.text.matchAll(sendPattern(kind))) {
      const member = members.find((candidate) => match.index >= candidate.start && match.index < candidate.end);
      sites.push({
        file: source.where,
        member: member?.name,
        provokedBy: member === undefined ? undefined : handledKind(source.text.slice(member.start, member.end)),
      });
    }
  }
  return sites;
}

/**
 * A worker-to-main kind is reachable when at least one of its send sites is
 * unprompted or sits in a handler for a kind the main thread actually sends.
 */
const unreachableWorkerToMain = WORKER_TO_MAIN_MESSAGE_KINDS.filter((kind) => {
  const sites = sendSites(kind);
  if (sites.length === 0) return false; // Unsent, and accounted for by the other list.
  return !sites.some((site) => site.provokedBy === undefined || sentMainToWorker.has(site.provokedBy));
});


const ALL_KINDS: readonly string[] = [...MAIN_TO_WORKER_MESSAGE_KINDS, ...WORKER_TO_MAIN_MESSAGE_KINDS];

/**
 * Both directions, as one helper, in the shape the challenge-code gate settled
 * on: an entry with no reason, a kind the list forgot, a kind that gained what
 * its entry says it lacks, and a kind the union no longer declares.
 */
function assertAccountedFor(
  missing: readonly string[],
  declared: readonly string[],
  allowList: Readonly<Record<string, string>>,
  what: string,
): void {
  const unlisted = missing.filter((kind) => allowList[kind] === undefined);
  expect(
    unlisted,
    `a protocol message kind ${what}. Wire a sender, or record it with what is true about it today -- and record only that, without inventing what should happen to it`,
  ).toEqual([]);

  for (const [kind, reason] of Object.entries(allowList)) {
    expect(reason.trim().length, `${kind} needs a reason`).toBeGreaterThan(80);
  }

  const stale = Object.keys(allowList).filter((kind) => declared.includes(kind) && !missing.includes(kind));
  expect(
    stale,
    'these kinds no longer match their entry -- delete it in the same change that made it false',
  ).toEqual([]);

  const removed = Object.keys(allowList).filter((kind) => !declared.includes(kind));
  expect(
    removed.map((kind) => `${kind}: ${allowList[kind]}`),
    'a kind this list accounts for is no longer in its union -- if that removal is deliberate, delete its entry in the same change',
  ).toEqual([]);
}

describe('every protocol message kind has a sender, and every sent kind can be provoked', () => {
  it('scans the surface it means to, and really finds sends in it', () => {
    // Vacuity guard, both halves. An empty file list makes every kind unsent
    // (loud). A scan that matched nothing -- a stripper that blanked the
    // files, a moved module, a regex that no longer matches the codebase's
    // send shape -- would do the same in a way a file count cannot see, so the
    // positive control names a sender on each side of the boundary and the
    // kind it must be found constructing.
    expect(MAIN_TO_WORKER_MESSAGE_KINDS.length).toBe(7);
    expect(WORKER_TO_MAIN_MESSAGE_KINDS.length).toBe(11);
    expect(new Set(ALL_KINDS).size).toBe(18);
    expect(scanned.length).toBeGreaterThanOrEqual(200);

    expect(sendingFiles('simulation/initialize')).toEqual(['src/persistence/session/worker-session-host.ts']);
    expect(sendingFiles('simulation/ready')).toEqual(['src/simulation/worker/state-machine.ts']);
    expect(sendingFiles('simulation/request-snapshot')).toEqual([
      'src/persistence/session/worker-session-host.ts',
      'src/rendering/feed/simulation-snapshot-feed.ts',
    ]);
  });

  it('accounts for every main-to-worker kind nothing sends', () => {
    assertAccountedFor(
      unsentMainToWorker,
      MAIN_TO_WORKER_MESSAGE_KINDS,
      UNSENT_MAIN_TO_WORKER_KINDS,
      'no module under `src/` constructs, so the worker can never receive it',
    );
  });

  it('accounts for every worker-to-main kind nothing sends', () => {
    assertAccountedFor(
      unsentWorkerToMain,
      WORKER_TO_MAIN_MESSAGE_KINDS,
      UNSENT_WORKER_TO_MAIN_KINDS,
      'no module under `src/` constructs, so the main thread can never receive it',
    );
  });

  it('accounts for every sent kind that no production path can provoke', () => {
    assertAccountedFor(
      unreachableWorkerToMain,
      WORKER_TO_MAIN_MESSAGE_KINDS,
      UNREACHABLE_WORKER_TO_MAIN_KINDS,
      'the worker constructs only inside a handler for a main-to-worker kind nothing sends, so no production path reaches it',
    );
  });

  it('reads the worker as a set of members, so a reply can be tied to the request that provokes it', () => {
    /*
     * The vacuity guard for the provocation direction, which is the half of
     * this gate that is derived rather than read off a string. If the member
     * split stopped matching -- a reformat, a decorator, a move to standalone
     * functions -- `handledKind` would return `undefined` everywhere, every
     * send would read as unprompted, and the third list would silently empty
     * itself while the file still looked like a gate. So the parse is asserted
     * against what it must find: all seven main-to-worker kinds handled, and
     * the two provoked replies tied to the two requests that provoke them.
     */
    const stateMachine = scanned.find((source) => source.where === 'src/simulation/worker/state-machine.ts');
    expect(stateMachine, 'the worker state machine is no longer where this gate looks for it').toBeDefined();

    const members = classMembers(stateMachine!.text);
    const handlers = new Map<string, string>();
    for (const member of members) {
      const handled = handledKind(stateMachine!.text.slice(member.start, member.end));
      if (handled !== undefined) handlers.set(handled, member.name);
    }
    expect([...handlers.keys()].sort()).toEqual([...MAIN_TO_WORKER_MESSAGE_KINDS].sort());
    expect(handlers.get('protocol/handshake')).toBe('handleHandshake');
    expect(handlers.get('protocol/ping')).toBe('handlePing');

    expect(sendSites('protocol/handshake-accepted')).toEqual([
      { file: 'src/simulation/worker/state-machine.ts', member: 'handleHandshake', provokedBy: 'protocol/handshake' },
    ]);
    expect(sendSites('protocol/pong')).toEqual([
      { file: 'src/simulation/worker/state-machine.ts', member: 'handlePing', provokedBy: 'protocol/ping' },
    ]);

    // And the control that proves the derivation is not vacuously true of
    // everything: `protocol/error` is sent from `fault`, which is not a
    // handler, so it is provoked by nothing and reachable by every path.
    expect(sendSites('protocol/error').map((site) => site.member)).toEqual(['fault']);
    expect(sendSites('protocol/error').map((site) => site.provokedBy)).toEqual([undefined]);
  });

  it('does not read a receiver\'s type annotation as a send, which is how this gate would have been born green', () => {
    /*
     * The negative control for the shape rule, and the sharpest one in this
     * file, because it names the exact line that would have made the gate
     * useless.
     *
     * `state-machine.ts` annotates each handler's parameter as
     * `Extract<MainToWorkerMessage, { kind: '<K>' }>`. That is a literal
     * `kind: '<K>'` for all seven main-to-worker kinds, inside the worker --
     * the one module that by construction sends none of them. A substring
     * scan would report every one of them sent, including the two that no
     * module anywhere in `src/` sends, so it would have been green on #274 A2
     * on the day it was written.
     *
     * Fails in both useful directions. Dropping the comma from `sendPattern`
     * fails the second assertion here (and takes the stale check in
     * `UNSENT_MAIN_TO_WORKER_KINDS` with it); rewriting the annotations into
     * some other form fails the first, at which point this control needs a new
     * subject rather than deleting.
     */
    const stateMachine = scanned.find((source) => source.where === 'src/simulation/worker/state-machine.ts')!;
    for (const kind of MAIN_TO_WORKER_MESSAGE_KINDS) {
      expect(
        stateMachine.text,
        `${kind} is no longer named in a handler annotation -- this control has lost its subject`,
      ).toContain(`kind: '${kind}'`);
      expect(
        sends(stateMachine.text, kind),
        `the worker reads as a sender of ${kind}, which it cannot be: a substring scan is counting a receiver's type annotation`,
      ).toBe(false);
    }
  });

  it('counts the declaration, the schemas and the transfer switch as naming, not sending', () => {
    /*
     * The control that makes moving `MAIN_TO_WORKER_MESSAGE_KINDS` out of
     * `types.ts` unnecessary, asserted rather than assumed -- its
     * challenge-code sibling needed exactly that move, because a producing
     * surface containing the declaration reports every member emitted
     * unconditionally.
     *
     * Here the declaration is *inside* the scanned surface and still vouches
     * for nothing, because the shape rule and not the file list is what
     * separates a send from a mention: the kind lists are bare literals with
     * no `kind:`, the schemas put `z.literal(` between the `kind:` and the
     * quote, and `transferables.ts` writes `case '<K>':`. All three spell all
     * eighteen kinds; none of them contributes a send.
     */
    const declaration = scanned.find((source) => source.where === 'src/simulation/protocol/types.ts')!;
    const transferables = scanned.find((source) => source.where === 'src/simulation/protocol/transferables.ts')!;

    for (const kind of ALL_KINDS) {
      expect(declaration.text, `types.ts no longer declares '${kind}'`).toContain(`'${kind}',`);
      expect(declaration.text, `types.ts no longer schematises '${kind}'`).toContain(`kind: z.literal('${kind}')`);
      expect(transferables.text, `transferables.ts no longer switches on '${kind}'`).toContain(`case '${kind}':`);
      expect(
        sends(declaration.text, kind),
        `the kind declaration reads as a sender of ${kind}, so this gate now vouches for itself`,
      ).toBe(false);
      expect(
        sends(transferables.text, kind),
        `the transfer-list switch reads as a sender of ${kind}, so a receiver's switch now counts as a send`,
      ).toBe(false);
    }
  });

  it('keeps the surface at `src/`, proven against the tests that really do send the unsent kinds', () => {
    /*
     * The scope control, and the one that is load-bearing rather than
     * precautionary: unlike this gate's two models, where widening the scope
     * could not fail anything while the vocabulary was whole, widening this
     * one to the repository turns all four UNSENT entries stale and guts the
     * gate. #274 A2 says where the senders are -- "The only senders are in
     * `tests/contract/` and `tests/unit/worker-state-machine.test.ts`" -- and
     * this asserts it.
     *
     * It doubles as the positive control for `sendPattern` itself. The same
     * regex that finds zero sends of these four kinds under `src/` finds real
     * ones in these files, so "no sender" is a measurement and not a regex
     * that matches nothing.
     *
     * Fails in both useful directions: adding `tests` to the scanned surface
     * fails the second assertion, and a test that stops sending one of these
     * kinds fails the first, at which point the entry should go -- that test
     * is the only thing exercising the message at all.
     */
    const TEST_ONLY_SENDERS: Readonly<Record<string, readonly string[]>> = {
      'protocol/handshake': [
        'tests/unit/worker-state-machine.test.ts',
        'tests/contract/simulation-worker-protocol.test.ts',
        'tests/contract/simulation-worker-entry.test.ts',
        'tests/contract/worker-integration.test.ts',
      ],
      'protocol/ping': [
        'tests/contract/simulation-worker-protocol.test.ts',
        'tests/contract/simulation-worker-entry.test.ts',
      ],
      'simulation/delta': ['tests/contract/simulation-worker-protocol.test.ts'],
      'simulation/event': ['tests/contract/simulation-worker-protocol.test.ts'],
    };

    const inScope = scanned.map((source) => source.where);
    for (const [kind, files] of Object.entries(TEST_ONLY_SENDERS)) {
      for (const file of files) {
        expect(
          sends(read(file).text, kind),
          `${file} no longer sends '${kind}' -- delete it from TEST_ONLY_SENDERS, since it is no longer evidence that a wider scan would be wrong, and note that the message now has nothing exercising it at all`,
        ).toBe(true);
        expect(
          inScope,
          `${file} is inside the scanned surface, so a test sending a message now counts as production sending it`,
        ).not.toContain(file);
      }
    }

    // The scanned surface is `src/` and only `src/`, which is the property the
    // control above is evidence about.
    expect(inScope.every((where) => where.startsWith('src/'))).toBe(true);

    // And the denominator for the control itself: eight sending test files
    // across four kinds is what was measured, so a fifth kind that only tests
    // send is something a reader should see rather than something that
    // silently joins a list.
    expect(Object.values(TEST_ONLY_SENDERS).flat().length).toBe(8);
  });

  it('requires each kind to be sent from the side of the boundary that owns it', () => {
    /*
     * ADR 0003 decision 3: "Main-to-worker and worker-to-main messages are
     * separate TypeScript unions and separate Zod schemas." The direction is
     * therefore a property of the kind, and a send from the wrong side is a
     * defect however well-formed it is.
     *
     * This is also the backstop for the one false-positive the shape rule can
     * have. A *type* literal with a second member -- `{ kind: 'K', payload: P }`
     * -- carries a comma and would read as a send; written where such
     * annotations actually live, inside the worker, it is a main-to-worker
     * kind and this refuses it.
     */
    for (const kind of MAIN_TO_WORKER_MESSAGE_KINDS) {
      expect(
        sendingFiles(kind).filter((file) => file.startsWith(WORKER_SENDER_PREFIX)),
        `${kind} travels main-to-worker, so the worker cannot be constructing one`,
      ).toEqual([]);
    }
    for (const kind of WORKER_TO_MAIN_MESSAGE_KINDS) {
      expect(
        sendingFiles(kind).filter((file) => !file.startsWith(WORKER_SENDER_PREFIX)),
        `${kind} travels worker-to-main, so only ${WORKER_SENDER_PREFIX} may construct one`,
      ).toEqual([]);
    }
  });

  it('measures the state #274 A1 and A2 describe, exactly', () => {
    // The denominators, stated so the gate reports a fact and not only guards
    // one. Four of eighteen kinds have no sender and two more are sent but
    // unprovokable, so a third of the protocol is declared and dead. Making
    // the figures exact means a kind that quietly loses its last sender cannot
    // be settled by adding a list entry alone -- the count has to change too,
    // and a reviewer sees that the protocol got emptier.
    expect([...unsentMainToWorker]).toEqual(['protocol/handshake', 'protocol/ping']);
    expect([...unsentWorkerToMain]).toEqual(['simulation/delta', 'simulation/event']);
    expect([...unreachableWorkerToMain]).toEqual(['protocol/handshake-accepted', 'protocol/pong']);

    const sent = ALL_KINDS.filter((kind) => sendingFiles(kind).length > 0);
    expect(sent.length).toBe(14);
    expect(ALL_KINDS.length - sent.length).toBe(4);
    expect(sent.length - unreachableWorkerToMain.length).toBe(12);
  });

  it('names only kinds the protocol declares, in both lists and in the union itself', () => {
    // The keys of all three lists are plain strings, so a typo would produce
    // an entry that accounts for nothing and can never go stale. This is the
    // check that a mistyped key is a failure rather than a silent no-op.
    const declared = new Set<string>(ALL_KINDS);
    const keys = [
      ...Object.keys(UNSENT_MAIN_TO_WORKER_KINDS),
      ...Object.keys(UNSENT_WORKER_TO_MAIN_KINDS),
      ...Object.keys(UNREACHABLE_WORKER_TO_MAIN_KINDS),
    ];
    expect(
      keys.filter((kind) => !declared.has(kind)),
      'this key is not a declared message kind, so its entry accounts for nothing and can never go stale',
    ).toEqual([]);
    expect(
      new Set(keys).size,
      'a kind is recorded in two of the three lists, so acting on one entry would leave the other standing',
    ).toBe(keys.length);
  });
});
