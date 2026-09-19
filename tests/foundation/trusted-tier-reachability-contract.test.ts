import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ENTRY_POINTS,
  reachableModules,
  readFromDisk,
  repositoryRoot,
} from '../helpers/production-reachability';

/**
 * Which modules under `src/services/` and `src/persistence/` the shipped build
 * never loads, and whether each absence is a decision or an accident.
 *
 * ## The defect, which is that this keeps being *discovered*
 *
 * Three separate inventories have now measured the same four trees outside the
 * production import graph — #141 (2026-08-23), #315/#376 (which walked the
 * graph and reported 47 of 287 modules unreachable) and #378 (2026-08-26) —
 * and nothing between them changed, because none of them left behind anything
 * a build could read. #141 said what was missing in one sentence: *"What is
 * missing is anywhere that says which of these is awaiting a consumer and which
 * is speculative."* [ADR 0044](../../docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md)
 * is that statement, and this file is the executable half of it.
 *
 * The numbers are worth stating because they are the reason "keep" needs a gate
 * rather than a note: between #141 and #378 the four trees **grew by 294 lines
 * while remaining unreachable** — `src/services/challenges/` from 552 to 681
 * and `src/persistence/cloud/` from 324 to 481 (`wc -l`, measured at `95acb8c`
 * and at this commit). Hardening kept landing on code no code path reaches.
 * That is a legitimate choice; #378's own words are that it *"should be a
 * choice, made knowing that the client has no constructor, rather than a
 * default"*, and a choice is what a checked-in list with reasons makes it.
 *
 * ## What this gate asserts, and why both directions matter
 *
 * The `AWAITING_PRODUCER` shape this repository already trusts
 * (`tests/foundation/unconsumed-content-contract.test.ts`,
 * `tests/foundation/fault-code-reachability-contract.test.ts`): a list with a
 * reason per entry, failing in **both** directions.
 *
 * - Forward — an unreachable module under either tree that no entry accounts
 *   for is a new orphan, and fails. This is the half that would have caught all
 *   four trees on the commit that orphaned them.
 * - Reverse — a parked tree that *gains* a production consumer fails. That is a
 *   milestone rather than a mistake, and the failure message names the ADR and
 *   the documents that have to move with it. Without this half the list is a
 *   note that rots: `src/services/localization/` was in exactly this state and
 *   was wired by #229, and nothing anywhere recorded that one of the four had
 *   left the set.
 *
 * ## One of the four has left, and this is the record of it
 *
 * **`src/services/telemetry/` was wired** — consent surface, host pump and a
 * configuration-driven transport — and this gate is what said so: it failed on
 * the commit that did it, in the reverse direction, naming all thirteen of the
 * tree's modules. That is the half working exactly as designed, and unlike
 * #229's it did not pass unnoticed.
 *
 * The tree is therefore out of `PARKED_TREES` and into the positive control
 * below, which is the stronger statement: it is now asserted *reachable*, so
 * un-wiring it fails here too. Three trees remain parked and all three still
 * have a live server half, which was ADR 0044's discriminator — telemetry was
 * the one exception, and it is no longer in the list.
 *
 * **Four remain parked, not three, and have since `e876245f` (#512) —
 * corrected 2026-09-02.** The sentence above is kept because it is what was
 * true when telemetry left, and its point stands: telemetry was the exception
 * that had a server half and got wired. What rotted is the count, and it
 * rotted in the same commit that fixed it elsewhere — `e876245f` added
 * `src/ui/account/` to `PARKED_TREES` and rewrote the two paragraphs below to
 * read "the four trees" and "three of these four have a live server half",
 * and left this one alone. So the live reading is four parked, three of them
 * with a server half. `PARKED_TREES` is the authority and the case that pins
 * each entry's module count reads it directly; no assertion in this file
 * counts the trees, which is why one paragraph could say three while the two
 * below it said four.
 *
 * ## Scope, stated rather than assumed
 *
 * `src/services/**` and `src/persistence/**`, plus one named exception below.
 * #378 proposes generalising the walk to the whole of `src/`, and that is the
 * right end state — the walk is already general, and `reachableModules` takes
 * the entry points as an argument. It is not done wholesale here because the
 * remaining unreachable modules live under `src/simulation/`, `src/rendering/`,
 * most of `src/ui/` and `src/content/`, and each needs a reason written by
 * somebody who knows why that particular barrel has no importer. An allow-list
 * of eleven entries whose reasons are all "a barrel nobody imports" would be
 * the list nobody reads that `tests/helpers/simulation-enum-source.ts` argues
 * against. ADR 0044 records the wider widening as the follow-up and what it
 * costs.
 *
 * ## One more tree, added 2026-08-29 rather than waiting for that follow-up
 *
 * `src/ui/account/` did not exist when ADR 0044 scoped this gate to
 * `src/services/**` and `src/persistence/**` — it landed two days later
 * (`fee6115`, "the pure account-session and save-list layer for #34 (phase
 * 1)"), and it is the same shape as the four trees above: real capability
 * code with its own tests (`tests/unit/ui-account-session.test.ts`,
 * `tests/unit/ui-account-save-list.test.ts`,
 * `tests/foundation/account-metadata-boundaries.test.ts`), no production
 * caller, and a stated reason. Its own commit message says why it stayed
 * unreachable on purpose: *"None of the four imports `src/persistence/cloud/`,
 * so ADR 0044's parked-tree gate stays green"* — but nothing made *this* tree's
 * own absence a checked fact, which is exactly the gap #378 is about. Rather
 * than wait for someone to widen the walk to all of `src/ui/` — which would
 * still have to explain eleven unrelated barrels first — this one self-
 * contained, non-barrel tree is added to `SCANNED_ROOTS` and `PARKED_TREES`
 * directly. That is a narrower fix than #378's proposal and a faster one: it
 * closes the one drift this re-measurement actually found, without taking on
 * the barrel inventory ADR 0044 deferred.
 *
 * ## What it cannot prove
 *
 * Reachable is not emitted, and unreachable is not dead —
 * `tests/helpers/production-reachability.ts` argues both. The second is why
 * `TYPE_ONLY_REACHABLE` exists: a module reached only through `import type` is
 * erased, not absent, and reporting it beside a tree with no consumer at all
 * would invite deleting an interface every reachable module depends on.
 */

/**
 * `src/services/**` and `src/persistence/**`: the two trees ADR 0044 scoped
 * this gate to. `src/ui/account` is the one named exception, added 2026-08-29
 * — see "One more tree" above for why it, and not the rest of `src/ui/`.
 */
const SCANNED_ROOTS = ['src/services', 'src/persistence', 'src/ui/account'] as const;

interface ParkedTree {
  /** Repository-relative directory prefix, with a trailing slash. */
  readonly prefix: string;
  /** How many `.ts` modules it holds. Pinned so a file added to parked code is something a reviewer sees. */
  readonly modules: number;
  /** What the tree is, and where its design lives. */
  readonly what: string;
  /** The named thing that has to happen before it can have a production consumer. */
  readonly waitingOn: string;
  /** The event after which keeping it is no longer defensible. ADR 0044 argues each of these. */
  readonly whatWouldMakeItDead: string;
}

/**
 * The four trees ADR 0044 decides to keep, each with the decision's own terms.
 *
 * The `waitingOn`/`whatWouldMakeItDead` pair is the part that makes "keep" an
 * argument rather than a deferral: a reason that names no condition can never
 * be discharged, and every one of these has been sitting unnamed for long
 * enough to be re-measured three times.
 *
 * The discriminator ADR 0044 turns on is in the reasons and is not decorative:
 * three of these four have a **live server half** — tables, RLS policies and
 * `SECURITY DEFINER` RPCs under `supabase/`, executed by 287 pgTAP assertions
 * on every CI run through `pnpm verify:sql`. The fourth has none.
 */
const PARKED_TREES: readonly ParkedTree[] = [
  {
    prefix: 'src/persistence/cloud/',
    modules: 5,
    what: 'The client half of Supabase cloud save (#20, ADR 0008, ADR 0013; `docs/CLOUD_SAVE.md`). `CloudSaveClient`, its Supabase adapter, an in-memory double and `PrisonSyncEngine`.',
    waitingOn:
      "A signed-in account. `src/ui/account/account-session.ts` (#34 phase 1, `src/ui/account/` below) is the reducer for that and says outright it does not talk to Supabase; the effectful caller -- actually calling `createClient`, `signInAnonymously` or `linkIdentity` -- still does not exist in `src/` at all, and `@supabase/supabase-js` is imported type-only in the two modules that name it. The server half is live -- 23 migrations and 11 pgTAP suites run in CI -- and `scripts/verify-supabase-stack.mjs` drives the whole contract over real HTTP with its own `fetch` calls rather than through this client.",
    whatWouldMakeItDead:
      'The owner deciding cloud save is out of scope. That deletion is much larger than these five modules: `supabase/`, the migrations and the 287 pgTAP assertions go with it, and this tree is the smallest part of it.',
  },
  {
    prefix: 'src/services/challenges/',
    modules: 5,
    what: 'Challenge definitions, evidence and the verification pipeline behind a public ranking (#36, ADR 0009, `docs/TRUSTED_SERVICES.md`).',
    waitingOn:
      "ADR 0009's gate list, which its own Status refuses to discharge: `Accepted — implementation gated (see \"Gates before public ranking\")`. This is the only one of the four whose parking is written down as a numbered condition rather than inferred. Its server half is live: `20260823090100_create_challenge_tables.sql` plus four hardening migrations, and `submit_challenge_evidence` is exercised by `supabase/tests/002` in CI.",
    whatWouldMakeItDead: 'The owner deciding there will be no public ranking, which supersedes ADR 0009.',
  },
  {
    prefix: 'src/services/entitlements/',
    modules: 7,
    what: 'Product catalogue, grant/revoke ledger, webhook verification and the offline-safe client projection for paid save-slot capacity (#36, ADR 0008, ADR 0013).',
    waitingOn:
      "A payment provider, which #36's own Out of scope requires a separate commercial and legal review to choose, and — for the free-tier half, which needs no provider — cloud save, because the slots being counted are cloud slots. Its server half is live: `entitlements`, `entitlement_events`, `record_entitlement_event`, and `supabase/tests/002`, `003` and `004` in CI.",
    whatWouldMakeItDead: 'The owner deciding there will be no paid tier.',
  },
  {
    prefix: 'src/ui/account/',
    modules: 4,
    what: "The pure account-session and save-list layer for #34 phase 1 (ADR 0043): `account-session.ts` (a five-state reducer, no Supabase call), `account-preferences.ts`, `save-list-projection.ts` and `cloud-slot-availability.ts`. Its own commit message (`fee6115`) states it stays out of the graph on purpose: none of the four imports `src/persistence/cloud/`, so wiring cloud save and wiring this tree are the same event.",
    waitingOn:
      "Two things, neither of which this tree can supply on its own. First, the DOM save/account panel (#34 phase 2) that would call it -- deliberately not built alongside phase 1 because `vitest.config.ts` runs in `environment: 'node'` with no jsdom, so a module touching `document` is unreachable from `pnpm test` and needs the browser suite instead. Second, the same owner decision `src/persistence/cloud/` is waiting on: `account-session.ts` says outright that 'nothing here talks to Supabase' and that performing the effect -- calling `signInAnonymously`, calling `linkIdentity` -- 'belongs to the caller, which does not exist yet'.",
    whatWouldMakeItDead:
      "The same event that would kill `src/persistence/cloud/`: the owner deciding cloud save is out of scope. Short of that, this tree is a phase of work already in flight and not a candidate for deletion on its own terms.",
  },
];

/**
 * Trees that were in `PARKED_TREES` and are not any more, with the change that
 * discharged each.
 *
 * Kept rather than deleted, because the failure this gate exists for is a fact
 * being *rediscovered*: three inventories measured the same four trees and
 * none left anything behind, and `src/services/localization/` left the set
 * with nothing recording it. A removed row with no successor is the same
 * defect one step later. Each entry is asserted reachable below, so this list
 * is a gate rather than a note in both directions.
 */
const WIRED_TREES: Readonly<Record<string, string>> = {
  'src/services/telemetry/':
    'Wired 2026-08-27 (#36, #446). ADR 0044 open question 2 -- "does Lockstate collect telemetry at all?" -- was the owner\'s and was answered yes, so the tree gained the three things it was waiting on: a consent surface (`src/ui/telemetry-consent-prompt.ts` over `src/services/telemetry/consent-flow.ts`), a host pump called from `src/main.ts`\'s idle callback, and a transport whose destination comes from deployment configuration and which is not constructed at all when that configuration is absent. `tests/unit/services-layer-boundaries.test.ts`\'s I/O allow-list -- the "deliberately empty" one ADR 0044 named as the structural obstacle -- now holds exactly one entry, `services/telemetry/http-transport.ts`.',
};

/**
 * The unreachable modules that are not part of a parked tree.
 *
 * Every one is a barrel or a test-only module rather than a capability, which
 * is the fact worth having written down: it is what makes the four entries
 * above the whole of the finding rather than the largest part of a longer tail.
 */
const UNREACHABLE_MODULES: Readonly<Record<string, string>> = {
  'src/persistence/index.ts':
    'A barrel with no importer anywhere — not `src/`, not `tests/`. Every consumer writes the direct specifier, which is what `content-validation-reachability-contract.test.ts` argues is the barrel\'s structural problem: it is the module a direct import is always free to skip.',
  'src/persistence/local/index.ts': 'The same, one directory down. No importer in `src/` or `tests/`.',
  'src/persistence/session/index.ts': 'The same. No importer in `src/` or `tests/`.',
  'src/services/index.ts':
    'The trusted-services barrel. It states this layer\'s boundary rules in prose and re-exports all four subsystems, so it is unreachable for the same reason three of those four are — and would stay unreachable even after one of them was wired, since nothing writes the barrel specifier.',
  'src/services/telemetry/index.ts':
    'The telemetry subsystem\'s own barrel, unreachable for exactly the reason `src/services/index.ts` is and *not* because the tree is parked -- the tree was wired (see `WIRED_TREES`) and `src/main.ts` reaches it by the direct specifiers `./services/telemetry/pipeline` and `./services/telemetry/pump`, which is what every other consumer in `src/` does too. One test file writes the barrel specifier (`tests/unit/services-telemetry.test.ts`), so it is exercised; nothing in the production graph does, so it contributes no code. Deleting it would be a change to how tests import, not a removal of dead capability.',
  'src/persistence/size.ts':
    '`estimateSaveEnvelopeByteSize` — the size hook #18 and `docs/BENCHMARKING.md` call for. Three test files call it; nothing in `src/` does, because no storage backend has had to decide whether compression is worth it yet. It is one exported function, so this is a tail rather than a tier.',
  'src/persistence/local/memory-store.ts':
    'The in-memory `LocalSaveStore`, used by nine test files to exercise repository policy without a real or polyfilled IndexedDB. Its own header says "Not exported for production use", so being outside the production graph is the module working as designed.',
};

/**
 * Unreachable by the value-import walk and reached when type-only imports are
 * followed, which is a different fact and must not be read as the same one.
 *
 * `src/persistence/local/store.ts` declares `LocalSaveStore`,
 * `LocalSaveTransaction`, `PrisonSlotMetadata` and `PendingSyncState` — the
 * boundary `PrisonSaveRepository` holds all its policy against. It contributes
 * no code because it is erased, not because nothing depends on it, and it is
 * the module a reader skimming an "unreachable" list is most likely to delete
 * by mistake.
 */
const TYPE_ONLY_REACHABLE: Readonly<Record<string, string>> = {
  'src/persistence/local/store.ts':
    'Interfaces only. `repository.ts`, `indexeddb-store.ts`, `session-controller.ts` and `src/ui/save-panel.ts` all name types from it; every one of those imports is `import type` and is erased.',
};

/** Every `.ts` module under a root, repository-relative, excluding tests. */
function modulesUnder(root: string): readonly string[] {
  const found: string[] = [];
  const absolute = path.join(repositoryRoot, root);
  for (const entry of readdirSync(absolute)) {
    const relative = path.posix.join(root, entry);
    if (statSync(path.join(repositoryRoot, relative)).isDirectory()) {
      found.push(...modulesUnder(relative));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) found.push(relative);
  }
  return found.sort();
}

const scanned = SCANNED_ROOTS.flatMap((root) => modulesUnder(root));
const reachedByValue = reachableModules(readFromDisk, PRODUCTION_ENTRY_POINTS);
const reachedIncludingTypes = reachableModules(readFromDisk, PRODUCTION_ENTRY_POINTS, { followTypeOnly: true });
const unreachable = scanned.filter((module) => !reachedByValue.has(module));
const inAParkedTree = (module: string): ParkedTree | undefined =>
  PARKED_TREES.find((tree) => module.startsWith(tree.prefix));

describe('the walk this gate rules on reaches a real graph', () => {
  it('starts from readable entry points and follows imports out of them', () => {
    for (const entry of PRODUCTION_ENTRY_POINTS) {
      expect(readFromDisk(entry), `${entry} is not readable; the production entry points have moved`).toBeDefined();
      expect(reachedByValue.has(entry)).toBe(true);
    }
    // A walk that stopped following imports would report the two entry points
    // and pass every assertion below by finding nothing reachable to contrast
    // the parked trees against.
    expect(reachedByValue.size, 'the walk reached almost nothing; it is not following imports any more').toBeGreaterThan(
      150,
    );
  });

  it('reaches the persistence and services modules the application really does load', () => {
    // The positive control for the scanned roots specifically. Without it,
    // "everything unreachable is accounted for" would pass just as well on a
    // walk that reached nothing under either root -- and both roots are more
    // reachable than not, which is the fact that makes the parked four
    // interesting rather than ordinary.
    for (const module of [
      'src/persistence/local/repository.ts',
      'src/persistence/local/indexeddb-store.ts',
      'src/persistence/session/session-controller.ts',
      'src/persistence/save-schema.ts',
      'src/services/localization/localizer.ts',
      'src/services/localization/default-catalog.ts',
      /*
       * The Polish catalogue, and it is here because this gate's reverse
       * direction fired on the commit that wired it (#662, 2026-09-14) --
       * exactly as it did for `src/services/telemetry/`.
       *
       * `UNREACHABLE_MODULES` carried `src/services/localization/pl-catalog.ts`
       * from 2026-09-14 with a discharge condition written into its own reason:
       * *"the first `pl` entry in a chunk loader, at which point this gate
       * fails in its reverse direction and the entry is deleted in the same
       * change"*. `src/main.ts`'s `CATALOG_CHUNKS` is that entry --
       * `pl: () => import('./services/localization/pl-catalog')` -- and a
       * dynamic `import()` is a value import the walk follows
       * (`tests/helpers/module-boundaries.ts`, `DYNAMIC_IMPORT`), so the module
       * is in the production graph. Asserting it here rather than merely
       * deleting the row is what makes the discharge a gate: un-registering the
       * thunk fails this line instead of quietly restoring the parked state.
       */
      'src/services/localization/pl-catalog.ts',
      // The chunk's own content half. It is outside `SCANNED_ROOTS`, so nothing
      // above would notice it leaving the graph; the catalogue is only
      // *delivered* if both halves arrive.
      'src/content/locale-pl.ts',
      // The tree that left PARKED_TREES. Asserting it reachable is what makes
      // `WIRED_TREES` a gate: un-wiring telemetry fails here rather than
      // quietly restoring the state three inventories kept re-measuring.
      'src/services/telemetry/pipeline.ts',
      'src/services/telemetry/http-transport.ts',
      'src/services/telemetry/consent-flow.ts',
    ]) {
      expect(readFromDisk(module), `${module} has moved; this control names a module that no longer exists`).toBeDefined();
      expect(reachedByValue.has(module), `${module} is no longer in the production graph, which is a finding of its own`).toBe(
        true,
      );
    }
    expect(unreachable.length, 'nothing under either root is reachable; the walk or the roots are wrong').toBeLessThan(
      scanned.length,
    );
  });
});

describe('every unreachable module under src/services and src/persistence is accounted for', () => {
  it('names no module that neither a parked tree nor the list explains', () => {
    const unexplained = unreachable.filter(
      (module) =>
        inAParkedTree(module) === undefined &&
        UNREACHABLE_MODULES[module] === undefined &&
        TYPE_ONLY_REACHABLE[module] === undefined,
    );

    expect(
      unexplained,
      'a module under src/services/ or src/persistence/ is outside the production import graph and nothing says why. That is the state issues #141, #315 and #378 each re-measured from scratch: it compiles, its tests are green, and no code path reaches it. Either give it a production consumer, or add it to PARKED_TREES / UNREACHABLE_MODULES with the reason and the condition that would discharge it -- and see docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md for what the four existing entries argue',
    ).toEqual([]);
  });

  it('reaches every tree recorded as wired, so a removed parked entry cannot rot either', () => {
    // The direction `src/services/localization/` slipped through: it left the
    // parked set and nothing anywhere said so, which is how a "keep" decision
    // and the code it describes drift apart. A tree recorded as wired that
    // stops being reachable is that drift running backwards.
    const notReached = Object.keys(WIRED_TREES).filter(
      (prefix) => !scanned.some((module) => module.startsWith(prefix) && reachedByValue.has(module)),
    );
    expect(
      notReached,
      'a tree WIRED_TREES records as having a production consumer no longer has one. Either restore the wiring, or move it back into PARKED_TREES with the reason -- and amend docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md and the tier\'s own document in the same change',
    ).toEqual([]);

    // And a wired tree must not also be listed as parked, which would let both
    // assertions hold while the list said two contradictory things.
    const both = Object.keys(WIRED_TREES).filter((prefix) => PARKED_TREES.some((tree) => tree.prefix === prefix));
    expect(both, 'a tree is in both PARKED_TREES and WIRED_TREES').toEqual([]);
  });

  it('holds no entry for a module that has since been wired', () => {
    // The direction that makes the list a gate rather than a note.
    const wired = [...Object.keys(UNREACHABLE_MODULES)].filter((module) => reachedByValue.has(module));
    expect(
      wired,
      'these modules now have a production consumer: delete their UNREACHABLE_MODULES entries in the same change',
    ).toEqual([]);
  });

  it('holds no entry for a module that no longer exists', () => {
    const gone = [...Object.keys(UNREACHABLE_MODULES), ...Object.keys(TYPE_ONLY_REACHABLE)].filter(
      (module) => readFromDisk(module) === undefined,
    );
    expect(gone, 'these files are gone: remove their entries in the same change').toEqual([]);
  });
});

describe('the four parked trees are parked, wholly and deliberately', () => {
  it('reaches no module in any of them, even following type-only imports', () => {
    // Stronger than the value-import walk on purpose. A parked tree that some
    // reachable module type-imports from is still contributing nothing at
    // runtime, but it is no longer isolated -- the production graph would then
    // name its types, which is the first step of wiring it and is worth seeing.
    const touched = PARKED_TREES.flatMap((tree) =>
      scanned
        .filter((module) => module.startsWith(tree.prefix))
        .filter((module) => reachedIncludingTypes.has(module))
        .map((module) => `${module} (${tree.prefix})`),
    );

    expect(
      touched,
      'the production graph now reaches a tree ADR 0044 records as parked. That is a milestone rather than a regression -- but it is one that has to be written down: move the tree out of PARKED_TREES, amend docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md, and correct docs/ARCHITECTURE.md and the tier\'s own document (docs/CLOUD_SAVE.md, docs/TRUSTED_SERVICES.md or docs/TELEMETRY.md) in the same change. tests/foundation/documentation-claims-contract.test.ts holds the Supabase half of that sentence and will fail beside this one',
    ).toEqual([]);
  });

  it('still holds the module count each entry claims', () => {
    // Not a line count: a line count fails on a reflowed comment, and this has
    // to fail on the event that matters -- a file added to or removed from code
    // nothing calls. Between #141 and #378 exactly that happened once, when
    // `src/services/challenges/rejection-codes.ts` was added to a tree already
    // known to have no consumer.
    const measured = PARKED_TREES.map((tree) => ({
      prefix: tree.prefix,
      modules: scanned.filter((module) => module.startsWith(tree.prefix)).length,
    }));

    expect(
      measured,
      'a parked tree has gained or lost a module. Adding one is work landing on code no code path reaches, which ADR 0044 says should be a choice rather than a default -- update the count here and say in the pull request why the tree is still worth growing',
    ).toEqual(PARKED_TREES.map((tree) => ({ prefix: tree.prefix, modules: tree.modules })));
  });

  it('gives every parked tree a condition that would discharge it and one that would end it', () => {
    // A "keep" whose reason names no condition can never be acted on, which is
    // how these four survived three inventories. Asserted as a shape rather
    // than judged: the words are ADR 0044's, and this only refuses an entry
    // that forgot to carry them.
    for (const tree of PARKED_TREES) {
      expect(scanned.some((module) => module.startsWith(tree.prefix)), `${tree.prefix} no longer holds any module`).toBe(
        true,
      );
      expect(tree.waitingOn.length, `${tree.prefix} states no condition it is waiting on`).toBeGreaterThan(80);
      expect(
        tree.whatWouldMakeItDead.length,
        `${tree.prefix} names nothing that would make keeping it indefensible`,
      ).toBeGreaterThan(40);
    }
  });
});

describe('erased is not the same as absent', () => {
  it('reaches every type-only module when type-only imports are followed, and not otherwise', () => {
    // Both directions, because the whole point of the list is that these two
    // modules are *not* deletion candidates and the value walk cannot say so.
    for (const module of Object.keys(TYPE_ONLY_REACHABLE)) {
      expect(reachedByValue.has(module), `${module} is now reached by a value import: remove its TYPE_ONLY_REACHABLE entry`).toBe(
        false,
      );
      expect(
        reachedIncludingTypes.has(module),
        `${module} is not reached even by a type-only import any more, so it is now unreachable in the ordinary sense: move it to UNREACHABLE_MODULES with a reason, or delete it`,
      ).toBe(true);
    }
  });

  it('finds the distinction real on this tree, so the option is not decoration', () => {
    // The negative control for the option itself. If following type-only
    // imports reached nothing the value walk did not, `TYPE_ONLY_REACHABLE`
    // would be an empty distinction and every assertion above would hold
    // vacuously.
    expect(reachedIncludingTypes.size).toBeGreaterThan(reachedByValue.size);
  });
});
