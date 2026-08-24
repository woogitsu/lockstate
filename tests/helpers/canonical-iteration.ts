/**
 * The static form of `docs/DETERMINISM.md`, "Canonical iteration order":
 *
 * > *"Anything that feeds simulation state must iterate in a canonical order
 * > derived from state ... never `Map`/`Set` insertion order."*
 *
 * Every canonical sort in the simulation was held in place by review
 * attention alone (#132). Reverting one to insertion order is invisible
 * wherever the computation happens to be order-independent today -- and it
 * stays invisible until someone makes that computation order-dependent, at
 * which point a save fingerprint diverges with no proximate cause.
 *
 * The rules live here rather than as regexes inside the test that runs them,
 * the same split `src/content/validate-catalog.ts` and
 * `tests/unit/simulation-message-keys.test.ts` use: reading files is the
 * test's job, and keeping the scanning rules in an exported module means they
 * are typed and exercised against fixtures instead of only ever running
 * against real sources, where they can quietly stop matching. This module is
 * test-only static analysis with no runtime consumer, so it lives under
 * `tests/helpers/` (still inside `tsconfig.json`'s `include`) rather than in
 * `src/`, which would ship it.
 *
 * ## What is checked, and what is deliberately not
 *
 * Flagging every `for (const x of map)` in the repository would produce a
 * list nobody reads, and a list nobody reads enforces nothing --
 * `validate-catalog.ts` makes that argument about enum discovery and it
 * applies here too. So the scan recognises exactly the two shapes by which a
 * `Map`/`Set` in this codebase is actually enumerated:
 *
 * 1. an explicit view -- `x.values()`, `x.keys()`, `x.entries()`;
 * 2. a `for ... of` over `this.field` where that field is declared in the
 *    same file as a `Map` or `Set`, which is the one-character way to evade
 *    rule 1.
 *
 * Rule 2 is restricted to fields on purpose. The rule in
 * `docs/DETERMINISM.md` is about what feeds simulation *state*, and a field
 * is state; a local `Set` frontier inside one function is a step of an
 * algorithm whose determinism is a property of that algorithm -- both
 * pathfinding searches here pick their next node by an explicit total
 * tie-break rather than by iteration order, which no textual rule can see and
 * which their own behavioural tests already pin. Flagging every local would
 * add entries whose reason is "this is not what the rule is about", and an
 * allow-list padded with those is the list nobody reads.
 *
 * An occurrence is accepted when the enumeration reaches a sort, in either of
 * the two forms the codebase writes:
 *
 * - `.sort(` later in the same statement --
 *   `[...this.jobs.values()].filter(...).sort(...)`;
 * - a `const`/`let` binding of the enumeration that is `.sort()`ed later in
 *   the same block -- `const entries = [...this.pending.values()];
 *   entries.sort(...)`.
 *
 * Anything else is a violation, to be either sorted or recorded in the
 * caller's allow-list with the reason it is safe. Membership tests,
 * `.size`, `.get`, `.has` and `.delete` are not enumerations and are not
 * matched at all.
 *
 * ## Arrays call their views the same thing
 *
 * `array.entries()`, `array.keys()` and `array.values()` are written exactly
 * like the `Map` views above, and an array's iteration order *is* canonical --
 * it is the array. `src/persistence/save-schema.ts` has one
 * (`value.freeIndices.entries()`, which numbers the free list so a zod issue
 * can name the offending position), so bringing `src/persistence/` into scope
 * without handling this would have produced a violation that is not one. An
 * exemption would have been the cheap answer and the wrong one: the allow-list
 * is a list of *audited hazards*, and padding it with entries whose reason is
 * "this is an array" is how it becomes the list nobody reads.
 *
 * So a view call is skipped when the same file uses **the same receiver
 * expression** in a way no `Map` or `Set` supports -- `.length`, `.push(`,
 * `[index]` and the rest of `ARRAY_ONLY_MEMBERS`. Under `strict` TypeScript
 * that evidence cannot appear on a `Map` or `Set`: `map.length` does not
 * compile. It is deliberately keyed on the whole receiver expression rather
 * than on the last property name, so `other.ids.length` cannot vouch for
 * `this.ids.values()`, and a `Map`/`Set` *declaration* of the receiver's final
 * name (rule 2's `findCollectionNames`) overrides the evidence and flags the
 * site anyway. Both directions err toward flagging, and both are pinned by
 * fixtures in the caller's tests -- a tightening that stopped matching real
 * `Map` iteration would otherwise look exactly like compliance.
 *
 * It follows that an array view with no such evidence in its file is still
 * flagged. That is the residual cost of a text scan, and the honest remedy
 * there is to give the reviewer a real choice rather than to widen the
 * evidence list until it guesses.
 *
 * One shape it does **not** see, stated rather than left to be discovered: a
 * spread of a collection reached through a lookup, as in
 * `RoomInstanceRegistry.occupantsOf`'s `[...(this.occupants.get(id) ?? [])]`.
 * Whether that expression is a `Set` or an array is known to `tsc` and not to
 * a text scan. That particular accessor is a documented insertion-order
 * accessor whose consumer sorts, guarded by
 * `tests/determinism/projection-ordering.test.ts`; the general case is a
 * genuine limit of a textual rule.
 */

/**
 * Comments are stripped before scanning so the rule can still be *discussed*
 * in prose without the prose reading as code -- several of the modules this
 * scans explain in a doc comment why they sort.
 *
 * A block comment is replaced by its own newlines rather than by a space, so
 * every reported line number is the line in the real file. Reporting a line
 * that is dozens of lines off the offending code would make the failure
 * message worse than no line number at all.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export type EnumerationShape =
  /** `x.values()` / `x.keys()` / `x.entries()`. */
  | 'collection-view'
  /** `for (const entry of x)` over a `Map`/`Set` declared in this file. */
  | 'bare-for-of';

export interface EnumerationSite {
  /** The enumerated expression as written, e.g. `this.doorsById.values()` or `this.parcels`. Used as the allow-list key, so renaming the field makes an entry go stale. */
  readonly expression: string;
  readonly shape: EnumerationShape;
  /** 1-based line of the occurrence, for the failure message only -- never part of the allow-list key, which would then need editing on every unrelated edit above it. */
  readonly line: number;
  /** Whether the enumeration reaches a `.sort(` in one of the two recognised forms. */
  readonly ordered: boolean;
}

/**
 * Names declared in this file as a `Map` or `Set`.
 *
 * Declarations only: `private readonly parcels = new Map<...>`, `private byId:
 * Map<string, T>`, `map: ReadonlyMap<string, TilePosition>` (a parameter). A
 * name that is a `Map` only through inference from a function return is not
 * found, which is why `collection-view` remains the primary rule and this is
 * the anti-evasion backstop rather than the main check.
 */
export function findCollectionNames(source: string): readonly string[] {
  const names = new Set<string>();
  const declared = /([A-Za-z_$][\w$]*)\s*(?::\s*(?:Readonly)?(?:Map|Set|WeakMap|WeakSet)\s*<|=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\s*[<(])/g;
  for (const match of source.matchAll(declared)) names.add(match[1]!);
  return [...names].sort();
}

/** Offset of the character after the statement containing `index`: the next `;`, `{` or `}` at the depth the statement starts at. */
function statementEnd(source: string, index: number): number {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor]!;
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (depth <= 0 && (character === ';' || character === '{' || character === '}')) return cursor;
  }
  return source.length;
}

/** Offset of the `}` closing the block that contains `index`, so a follow-up `entries.sort(...)` is looked for in that block and not in the next function down the file. */
function blockEnd(source: string, index: number): number {
  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const character = source[cursor]!;
    if (character === '{') depth += 1;
    else if (character === '}') {
      if (depth === 0) return cursor;
      depth -= 1;
    }
  }
  return source.length;
}

/** The `NAME` of a `const`/`let`/`var NAME =` declaration that the statement starting before `index` binds, if any. */
function boundName(source: string, statementStart: number, index: number): string | undefined {
  const head = source.slice(statementStart, index);
  const match = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*[^=]*$/.exec(head);
  return match?.[1];
}

/** Start of the statement containing `index`: just past the previous `;`, `{` or `}`. */
function statementStart(source: string, index: number): number {
  for (let cursor = index; cursor > 0; cursor -= 1) {
    const character = source[cursor - 1]!;
    if (character === ';' || character === '{' || character === '}') return cursor;
  }
  return 0;
}

const SORT_CALL = /\.\s*sort\s*\(/;

function reachesSort(source: string, occurrenceEnd: number): boolean {
  const start = statementStart(source, occurrenceEnd);
  const end = statementEnd(source, occurrenceEnd);
  if (SORT_CALL.test(source.slice(occurrenceEnd, end))) return true;

  const binding = boundName(source, start, occurrenceEnd);
  if (binding === undefined) return false;
  const rest = source.slice(end, blockEnd(source, end));
  // Both forms the codebase writes: `entries.sort(...)` in place, and
  // `[...itemIds].sort(...)` where the binding is a `Set` being materialised.
  return new RegExp(`(?:\\b|\\.\\.\\.\\s*)${binding}\\s*\\]?\\s*\\.\\s*sort\\s*\\(`).test(rest);
}

const VIEW_CALL = /\b((?:this\s*\.\s*)?[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*(values|keys|entries)\s*\(\s*\)/g;

/**
 * Members that exist on an array and on no `Map` or `Set`. Reading one off a
 * `Map` is a compile error under this repository's `strict` TypeScript, so
 * their presence on an expression is evidence about that expression's type
 * that a text scan can actually rely on.
 */
const ARRAY_ONLY_MEMBERS = ['length', 'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat', 'indexOf', 'join', 'at'] as const;

/**
 * Whether `source` uses `receiver` -- the normalised receiver expression of a
 * view call, e.g. `value.freeIndices` -- in a way only an array supports.
 *
 * Exported so the rule is testable on its own, in both directions: the point
 * of the whole module is that a pattern which quietly stops matching is worse
 * than no pattern.
 *
 * `receiver` is matched as a whole dotted expression, tolerating the
 * whitespace a formatter may put around the dots, and indexing counts as
 * evidence because `map[key]` does not compile either.
 */
export function hasArrayOnlyUsage(source: string, receiver: string): boolean {
  const escaped = receiver
    .split('.')
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s*\\.\\s*');
  const members = ARRAY_ONLY_MEMBERS.join('|');
  return new RegExp(`(?<![\\w$.])${escaped}\\s*(?:\\.\\s*(?:${members})\\b|\\[)`).test(source);
}

const lineOf = (source: string, index: number): number => source.slice(0, index).split('\n').length;

const normalise = (expression: string): string => expression.replace(/\s+/g, '');

/**
 * Every place this source enumerates a `Map`/`Set`, with whether it reaches a
 * sort. Callers decide what to do with the unordered ones; this function
 * makes no judgement, so it can be tested against fixtures in both
 * directions.
 */
export function findEnumerationSites(rawSource: string): readonly EnumerationSite[] {
  const source = stripComments(rawSource);
  const sites: EnumerationSite[] = [];
  const collections = findCollectionNames(source);

  for (const match of source.matchAll(VIEW_CALL)) {
    const receiver = normalise(match[1]!);
    // `this.entries()` is a method on the class, not a view of a collection:
    // `ActorIdentityRegistry` has one. A collection view always has a
    // property between `this` and the view call.
    if (receiver === 'this') continue;
    // An array names its views the same way, and its order is canonical. A
    // `Map`/`Set` declaration of the same name wins, so the evidence can only
    // ever remove a site this file has no other reason to think is a
    // collection.
    const declaredCollection = collections.includes(receiver.split('.').at(-1) ?? '');
    if (!declaredCollection && hasArrayOnlyUsage(source, receiver)) continue;
    const end = match.index + match[0].length;
    sites.push({
      expression: `${receiver}.${match[2]!}()`,
      shape: 'collection-view',
      line: lineOf(source, match.index),
      ordered: reachesSort(source, end),
    });
  }

  if (collections.length > 0) {
    const alternatives = collections.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const bareForOf = new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s[^)]*?\\bof\\s+(this\\s*\\.\\s*(?:${alternatives}))\\s*\\)`, 'g');
    for (const match of source.matchAll(bareForOf)) {
      sites.push({
        expression: normalise(match[1]!),
        shape: 'bare-for-of',
        line: lineOf(source, match.index),
        // A `for ... of` cannot sort what it is already iterating: the only
        // ordered form is iterating a sorted array, which is the
        // `collection-view` shape above.
        ordered: false,
      });
    }
  }

  return sites;
}

export interface CanonicalIterationExemption {
  /** Repository-relative path, e.g. `src/simulation/navigation/door.ts`. */
  readonly file: string;
  /** The enumerated expression, exactly as `EnumerationSite.expression` reports it. */
  readonly expression: string;
  /** Why insertion order is safe here. Not decoration: it is the reviewable half of the claim. */
  readonly reason: string;
}

export interface CanonicalIterationViolation {
  readonly file: string;
  readonly expression: string;
  readonly shape: EnumerationShape;
  readonly line: number;
}

export interface ScannedFile {
  readonly file: string;
  readonly source: string;
}

export interface CanonicalIterationReport {
  /** Unordered enumerations with no exemption. Empty is the passing state. */
  readonly violations: readonly CanonicalIterationViolation[];
  /** Exemptions that no longer describe an unordered enumeration -- the file was sorted, renamed or deleted. Stale entries are a failure, or the allow-list becomes fiction. */
  readonly staleExemptions: readonly CanonicalIterationExemption[];
  /** Every unordered enumeration found, exempt or not: the denominator that makes an empty violation list meaningful rather than merely quiet. */
  readonly unorderedCount: number;
  /** Every enumeration found, ordered or not. */
  readonly siteCount: number;
}

/**
 * Compares the enumerations in `files` against `exemptions`.
 *
 * Both directions are reported, for the same reason
 * `validateSimulationEnumGroupSource` checks both: an unexplained insertion-
 * order walk is the failure this exists to catch, and an exemption for a walk
 * that no longer exists is how the allow-list would slowly fill with claims
 * nobody can check.
 *
 * An exemption is keyed by `(file, expression)` and therefore covers every
 * occurrence of that expression in that file. Two occurrences of the same
 * view over the same field share one justification, which is why the reason
 * must justify the *field*, not one call site.
 */
export function reportCanonicalIterationViolations(
  files: readonly ScannedFile[],
  exemptions: readonly CanonicalIterationExemption[],
): CanonicalIterationReport {
  const violations: CanonicalIterationViolation[] = [];
  const used = new Set<string>();
  const key = (file: string, expression: string): string => `${file}::${expression}`;
  const exempt = new Set(exemptions.map((entry) => key(entry.file, entry.expression)));

  let unorderedCount = 0;
  let siteCount = 0;

  for (const { file, source } of files) {
    for (const site of findEnumerationSites(source)) {
      siteCount += 1;
      if (site.ordered) continue;
      unorderedCount += 1;
      const entryKey = key(file, site.expression);
      if (exempt.has(entryKey)) {
        used.add(entryKey);
        continue;
      }
      violations.push({ file, expression: site.expression, shape: site.shape, line: site.line });
    }
  }

  return {
    violations,
    staleExemptions: exemptions.filter((entry) => !used.has(key(entry.file, entry.expression))),
    unorderedCount,
    siteCount,
  };
}
