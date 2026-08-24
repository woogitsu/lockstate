/**
 * The scanning rules behind
 * `tests/foundation/unreachable-invariant-contract.test.ts`: which exported
 * `assert*` functions exist under `src/`, and where each one is actually
 * called from.
 *
 * The defect this exists to make visible is named in #159: an exported
 * invariant enforcer that nothing calls. `assertGaplessDeploymentSchedule`
 * has been that since it was written -- `resolveRequiredGuardCount` throws
 * `Invariant violated: ... has no block covering tick-of-day ...` when a
 * deployment schedule has a gap, the function whose entire purpose is to
 * prevent that gap is exported next to it, and no path invokes it. Nothing is
 * broken today, because `constantDeploymentSchedule` is the only builder in
 * the module and returns one full-day block. What is missing is the
 * protection the code reads as having.
 *
 * #159 names two earlier instances of the same shape -- #105 finding 5 (the
 * pgTAP suite pinned privileges exhaustively and never read the
 * `SECURITY DEFINER` declarations the schema's own comments argue are
 * load-bearing) and #138 item 3 (three of four security headers asserted by
 * nothing). Each was found by a sweep rather than by a gate, which is the
 * cost this module is meant to remove.
 *
 * The rules live here rather than as regexes inside the test that runs them,
 * the same split `tests/helpers/canonical-iteration.ts` and
 * `src/content/validate-catalog.ts` use: reading the filesystem is the test's
 * job, and keeping the scanning rules in an exported module means they are
 * typed and exercised against fixtures instead of only ever running against
 * real sources, where a pattern that quietly stopped matching would look
 * exactly like compliance.
 *
 * ## What counts as a call site, and why tests do not count
 *
 * Call sites are classified into three kinds, and only the first two make an
 * enforcer *wired*:
 *
 * 1. **cross-module** -- a call from a different `.ts` file under `src/`.
 *    `assertValidActorNamePool` is called from
 *    `src/simulation/identity/actor-identity.ts`.
 * 2. **own-module** -- a call elsewhere in the declaring file itself.
 *    `assertGaplessSchedule` is called at module load over
 *    `DEFAULT_REGIME_SCHEDULES`, in its own module. That call runs on every
 *    import of the module, so it is real protection and not a formality.
 * 3. **test** -- a call from a `.ts` file under `tests/`. Recorded, and
 *    deliberately **not** sufficient.
 *
 * That third rule is a deliberate departure from #159's own wording, which
 * proposes *"at least one call site outside its own module"*. Read literally,
 * a single test would satisfy it -- and PR #158 declined to write exactly
 * that test, for the reason it gave: *"testing a function nothing calls only
 * converts dead code into tested dead code."* A gate that can be satisfied
 * by the change its own source issue refused to make would be a gate in name
 * only, so the rule here is production reachability, and the test call sites
 * are carried in the report so a failure can say *"5 test call sites, no
 * production call site"* rather than only *"no call site"*.
 *
 * The departure runs the other way too: an own-module call satisfies this
 * gate where #159's wording would flag it. `assertGaplessSchedule`'s
 * module-load loop is the clearest possible wiring -- it cannot be skipped by
 * a caller who forgets -- and flagging it would put a permanent allow-list
 * entry in the list whose reason is "this is not what the rule is about".
 * `src/content/validate-catalog.ts` makes that argument about enum discovery
 * and `tests/helpers/canonical-iteration.ts` repeats it about locals: an
 * allow-list padded with non-hazards is the list nobody reads, and a list
 * nobody reads enforces nothing.
 *
 * ## What it does not see, stated rather than left to be discovered
 *
 * - **Only the `assert*` prefix.** An enforcer named `ensureFoo` or
 *   `requireFoo` is invisible here. Measured on the current tree: `src/` has
 *   seven exported `validate*`/`check*`/`require*` functions and every one of
 *   them *returns* a result rather than throwing
 *   (`validateRoomObjectReferences`, `checkDoorAccess`,
 *   `requirePrisonSlotMetadata`, ...), so widening the prefix would add seven
 *   entries whose reason is "this is not an invariant enforcer". The three
 *   throwing enforcers in `src/` all spell it `assert*`, which is why the
 *   naming convention is a usable proxy today; it stops being one the moment
 *   someone writes a throwing `ensure*`.
 * - **Indirect reachability.** A call site is a call site; whether the
 *   function containing it is itself ever reached is a question for the type
 *   checker and the behavioural suites, not for a text scan. #105 finding 5
 *   is the reminder that "declared" and "reached" differ, and this module
 *   only closes the outermost gap.
 * - **Aliased and re-exported calls.** `import { assertX as check }` followed
 *   by `check(...)` is not matched. No such alias exists in the tree; the
 *   limit is recorded because a scan that silently stops matching is the
 *   failure mode this whole split exists to avoid.
 */

// Comments are stripped by the helper next door rather than by a second
// implementation here. Two copies of one rule is the defect class #123 and
// #93 are about, and AGENTS.md's required workflow is explicit that existing
// implementation is inspected before a new abstraction is proposed. The
// stripper matters concretely for this scan: `src/simulation/prisoners/
// regime.ts` *mentions* `assertGaplessDeploymentSchedule` in a doc comment,
// which is a discussion of the twin and not a call to it, and reading a
// mention as a call would make this gate pass while nothing was wired.
import { stripComments } from './canonical-iteration';

/** Whether a scanned file is production code (`src/`) or a test (`tests/`). */
export type ModuleRole = 'source' | 'test';

export interface ScannedModule {
  /** Repository-relative POSIX path, e.g. `src/simulation/prisoners/regime.ts`. */
  readonly file: string;
  readonly role: ModuleRole;
  /** Raw file contents. Comments are stripped inside this module, so callers pass the file as it is on disk. */
  readonly source: string;
}

export interface EnforcerDeclaration {
  readonly name: string;
  /** 1-based line of the `export function assert...` declaration. */
  readonly line: number;
}

export interface CallSite {
  readonly file: string;
  /** 1-based line of the call. */
  readonly line: number;
}

/** Where one exported enforcer is called from, split by the three kinds that matter. */
export interface EnforcerReachability {
  /** The declaring file, repository-relative. */
  readonly file: string;
  readonly name: string;
  /** 1-based line of the declaration. */
  readonly line: number;
  /** Calls from a different file under `src/`. */
  readonly crossModuleCallSites: readonly CallSite[];
  /** Calls elsewhere in the declaring file -- module-load validation is this shape. */
  readonly ownModuleCallSites: readonly CallSite[];
  /** Calls from `tests/`. Reported, never sufficient. */
  readonly testCallSites: readonly CallSite[];
}

/**
 * An enforcer that no production path calls, and the reason it is allowed to
 * stay that way.
 *
 * The reason is the reviewable half of the claim, exactly as in
 * `tests/foundation/unconsumed-content-contract.test.ts` and
 * `tests/foundation/ci-configuration-contract.test.ts`'s
 * `INTENTIONALLY_MANUAL`. An entry with no reason records that a function is
 * unreachable and loses the only thing that makes it safe to leave alone.
 */
export interface UnwiredEnforcerEntry {
  /** Declaring file, repository-relative, exactly as `EnforcerReachability.file` reports it. */
  readonly file: string;
  readonly name: string;
  readonly reason: string;
}

export interface UnreachableEnforcerReport {
  /** Exported enforcers with no production call site and no allow-list entry. Empty is the passing state. */
  readonly unreachable: readonly EnforcerReachability[];
  /** Allow-list entries that have gained a production call site: the entry is now false and must go. */
  readonly wiredEntries: readonly UnwiredEnforcerEntry[];
  /** Allow-list entries naming an enforcer the scan no longer finds -- renamed, deleted, or un-exported. */
  readonly unknownEntries: readonly UnwiredEnforcerEntry[];
  /** Every exported enforcer found, in scan order. The denominator that makes an empty `unreachable` list mean something. */
  readonly enforcers: readonly EnforcerReachability[];
  /** Every call site of every enforcer, of all three kinds. */
  readonly callSiteCount: number;
}

/**
 * `export function assertFoo(` and `export const assertFoo =`, at any
 * indentation, with comments stripped first so a doc comment describing an
 * export is not read as one.
 *
 * `async` is tolerated because the pattern must not silently stop matching if
 * an enforcer ever becomes asynchronous; there is none today.
 */
const EXPORTED_ENFORCER = /^[ \t]*export\s+(?:(?:async\s+)?function\s+|(?:const|let)\s+)(assert[A-Za-z0-9_$]*)\s*[(<:=]/gm;

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

/** Every exported `assert*` function this source declares. */
export function findExportedEnforcers(rawSource: string): readonly EnforcerDeclaration[] {
  const source = stripComments(rawSource);
  const found: EnforcerDeclaration[] = [];
  for (const match of source.matchAll(EXPORTED_ENFORCER)) {
    found.push({ name: match[1]!, line: lineOf(source, match.index) });
  }
  return found;
}

/**
 * The 1-based lines on which `name` is *called* in this source.
 *
 * A declaration is not a call, so a match preceded by `function`, `const`,
 * `let` or `var` is skipped -- that is what makes the declaring file's own
 * `export function assertFoo(...)` line absent from its own call sites, and
 * it is done by shape rather than by comparing against the declaration's line
 * number so the same function serves files that only call.
 *
 * A member access is not a call to this function either: `other.assertFoo(`
 * is some object's method that happens to share the name, so the lookbehind
 * rejects a preceding `.`. `import { assertFoo }` carries no parenthesis and
 * never matches.
 */
export function findCallSites(rawSource: string, name: string): readonly number[] {
  const source = stripComments(rawSource);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![\\w$.])${escaped}\\s*\\(`, 'g');
  const lines: number[] = [];
  for (const match of source.matchAll(pattern)) {
    if (/\b(?:function|const|let|var)\s+$/.test(source.slice(Math.max(0, match.index - 24), match.index))) continue;
    lines.push(lineOf(source, match.index));
  }
  return lines;
}

/**
 * Compares every exported enforcer under `src/` against `allowList`.
 *
 * All three directions are reported, for the same reason
 * `reportCanonicalIterationViolations` reports two: an enforcer that loses
 * its last production call site is the failure this exists to catch; an
 * allow-list entry that gains one is how the list would slowly fill with
 * claims nobody can check; and an entry naming a function that no longer
 * exists is how it would come to describe a tree the repository left behind.
 *
 * Declarations are read only from `role: 'source'` modules -- a test helper
 * may export an `assert*` of its own and it is not part of the simulation's
 * invariant surface. Call sites are read from every module.
 */
export function reportUnreachableEnforcers(
  modules: readonly ScannedModule[],
  allowList: readonly UnwiredEnforcerEntry[],
): UnreachableEnforcerReport {
  const enforcers: EnforcerReachability[] = [];
  let callSiteCount = 0;

  for (const declaring of modules) {
    if (declaring.role !== 'source') continue;
    for (const declaration of findExportedEnforcers(declaring.source)) {
      const crossModuleCallSites: CallSite[] = [];
      const ownModuleCallSites: CallSite[] = [];
      const testCallSites: CallSite[] = [];

      for (const candidate of modules) {
        for (const line of findCallSites(candidate.source, declaration.name)) {
          const site: CallSite = { file: candidate.file, line };
          if (candidate.role === 'test') testCallSites.push(site);
          else if (candidate.file === declaring.file) ownModuleCallSites.push(site);
          else crossModuleCallSites.push(site);
        }
      }

      callSiteCount += crossModuleCallSites.length + ownModuleCallSites.length + testCallSites.length;
      enforcers.push({
        file: declaring.file,
        name: declaration.name,
        line: declaration.line,
        crossModuleCallSites,
        ownModuleCallSites,
        testCallSites,
      });
    }
  }

  const key = (file: string, name: string): string => `${file}::${name}`;
  const allowed = new Set(allowList.map((entry) => key(entry.file, entry.name)));
  const found = new Map(enforcers.map((enforcer) => [key(enforcer.file, enforcer.name), enforcer]));

  const unreachable = enforcers.filter(
    (enforcer) =>
      !isWired(enforcer) && !allowed.has(key(enforcer.file, enforcer.name)),
  );

  return {
    unreachable,
    wiredEntries: allowList.filter((entry) => {
      const enforcer = found.get(key(entry.file, entry.name));
      return enforcer !== undefined && isWired(enforcer);
    }),
    unknownEntries: allowList.filter((entry) => !found.has(key(entry.file, entry.name))),
    enforcers,
    callSiteCount,
  };
}

/**
 * Whether a production path calls this enforcer at all. Test call sites are
 * excluded on purpose -- see this module's header.
 */
export function isWired(enforcer: EnforcerReachability): boolean {
  return enforcer.crossModuleCallSites.length > 0 || enforcer.ownModuleCallSites.length > 0;
}

/** One line per enforcer, for a failure message that says what is missing rather than only that something is. */
export function describeUnreachable(enforcer: EnforcerReachability): string {
  const tests = enforcer.testCallSites.length;
  const suffix = tests === 0 ? 'no call site of any kind' : `${String(tests)} test call site(s) and no production call site`;
  return `${enforcer.file}:${String(enforcer.line)} ${enforcer.name} -- ${suffix}`;
}
