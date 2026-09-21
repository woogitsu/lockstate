/**
 * The static half of *"every present action has a reachable route"*, and the
 * piece that was missing when this file was written.
 *
 * Two enumerations argue that criterion and nothing joined them:
 *
 * - `tests/browser/app-shell.spec.ts`'s `#88` sweep enumerates the **controls
 *   laid out on the page** -- everything its `INTERACTIVE_SELECTOR` matches in
 *   the live DOM -- and presses each one at five viewports.
 * - `tests/foundation/unconsumed-command-contract.test.ts` enumerates the
 *   **command submission sites** -- `type: 'X'` for each literal in
 *   `simulationCommandSchema`, all of them in `src/main.ts`.
 *
 * Neither says the two ends are the same chain. A command whose only producer
 * is a control the sweep's inventory never collects satisfies both halves and
 * is still unreachable; so does a command whose `src/main.ts` submission site
 * is reached from nothing but a keyboard chord. The join was done by a person
 * reading the two lists side by side.
 *
 * This module walks the chain instead:
 *
 *     command literal
 *       -> the `case '<intent kind>':` clause in `src/main.ts` that builds it
 *       -> the site in `src/ui/` that dispatches that intent kind
 *       -> zero or more callback-option hops: `onFoo:` written here, called as
 *          `options.onFoo(` inside the panel that declares it
 *       -> a DOM event listener attached to an element whose tag
 *          `INTERACTIVE_SELECTOR` matches.
 *
 * The last step is the join itself. The sweep's inventory is *defined* by that
 * selector, so a producer that bottoms out on a `<div>` with a click handler
 * is a producer the sweep cannot see, and this reports it as
 * `'non-interactive'` rather than as a control -- which is exactly the shape
 * of the defect #903 fixed on the minimap surface, found then by a person and
 * findable now by a test.
 *
 * ## Why this is a text scan and not an AST walk
 *
 * Stated because it is the honest limit and because the next reader will
 * reach for the compiler first, as this one did. **There is no JavaScript AST
 * for TypeScript available in this repository's toolchain.** The installed
 * `typescript` is 7.0.2, whose package no longer exports the
 * `ts.createSourceFile` API this walk would have used (`require('typescript')`
 * returns an object with two keys), and no `acorn`, `@babel/parser`,
 * `@typescript-eslint/parser`, `ts-morph` or `espree` is installed -- only
 * `esbuild`, which transforms without exposing a tree. So the walk is a
 * brace-balanced scan over comment-stripped source, which is the house idiom
 * (`tests/helpers/invariant-enforcers.ts`, `canonical-iteration.ts`) for the
 * same reason.
 *
 * ## What the scan cannot see, stated rather than left to be discovered
 *
 * - **A dispatch whose kind is a variable is invisible.** `dispatchCommand({
 *   kind: direction })` in `src/ui/hud/hud.ts` is the only one today, and it
 *   is the undo/redo pair; the gate's exception list names them for that
 *   reason and the count assertion fails if a third appears.
 * - **It answers "can a press reach this", not "is the press ever offered".**
 *   A control built but never appended, or appended inside a region CSS drops,
 *   is still a control here. That half is the `#88` sweep's, which is why the
 *   gate that uses this module also reads the sweep's own exemption lists.
 * - **Resolution of a callback option is by name, inside the module declaring
 *   the factory it was handed to.** Two factories with the same option name
 *   are told apart (`onToggle` on `createToggleGroup` against `onToggle` on
 *   `createCollapsibleSection`); two *options* of the same name on the same
 *   factory would not be.
 *
 * All three err toward reporting a producer as reachable, so a red raised by
 * this module is a real one.
 */

/** A tag `app-shell.spec.ts`'s `INTERACTIVE_SELECTOR` matches by element name. */
export const INTERACTIVE_TAGS: readonly string[] = ['button', 'a', 'input', 'select', 'textarea'];

export interface ScannedSource {
  /** Repository-relative POSIX path. */
  readonly file: string;
  /** File contents with comments already stripped by the caller. */
  readonly text: string;
}

/**
 * Blanks the *contents* of every string literal, preserving length and
 * newlines, so a brace inside a string is not counted as a block.
 *
 * Length preservation is load-bearing: every index this module computes is an
 * index into the comment-stripped source, and the two views have to agree on
 * where things are. Labels are read from the unblanked text for the opposite
 * reason -- `addEventListener('click', …)` is recognised by its quoted event
 * name, which blanking would erase.
 */
export function blankStringContents(source: string): string {
  let out = '';
  let index = 0;
  let quote: string | undefined;
  while (index < source.length) {
    const character = source[index] as string;
    if (quote === undefined) {
      if (character === "'" || character === '"' || character === '`') quote = character;
      out += character;
      index += 1;
      continue;
    }
    if (character === '\\') {
      out += '  ';
      index += 2;
      continue;
    }
    if (character === quote) {
      quote = undefined;
      out += character;
      index += 1;
      continue;
    }
    out += character === '\n' ? '\n' : ' ';
    index += 1;
  }
  return out;
}

/**
 * What a `{` opens, read off the text in front of it.
 *
 * The order matters: an `addEventListener` handler is also a bare arrow
 * function, and an object literal passed to a call is also a `{`, so the more
 * specific shapes are tried first or every listener would be reported as an
 * anonymous callback and every intent as its own scope.
 */
function labelFor(before: string): string | undefined {
  const event = /(\w+)\s*\.addEventListener\s*\(\s*['"`](\w+)['"`]\s*,\s*(?:async\s*)?(?:\([^()]*\)|\w+)\s*=>\s*$/.exec(before);
  if (event !== null) return `event:${event[2]}:${event[1]}`;
  const property = /(\w+)\s*:\s*(?:async\s*)?(?:\([^()]*\)|\w+)\s*=>\s*$/.exec(before);
  if (property !== null) return `prop:${property[1]}`;
  const binding = /(?:const|let|var)\s+(\w+)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^()]*\)|\w+)\s*=>\s*$/.exec(before);
  if (binding !== null) return `const:${binding[1]}`;
  const declaration = /function\s+(\w+)\s*\([^()]*\)\s*(?::[^{]*)?$/.exec(before);
  if (declaration !== null) return `function:${declaration[1]}`;
  const argument = /\b(\w+)\s*\(\s*$/.exec(before);
  if (argument !== null) return `call:${argument[1]}`;
  return undefined;
}

interface Frame {
  readonly label: string | undefined;
  /** Index of the `{` that opens this block. */
  readonly start: number;
  /** Index of the `}` that closes it, absent only for an unbalanced file. */
  readonly end: number | undefined;
}

/** How far back `labelFor` reads: long enough for a wrapped arrow signature, short enough not to run into the statement before. */
const LOOKBEHIND = 220;

/** The stack of open blocks at each of `targets`, outermost first. */
function framesAt(source: string, targets: readonly number[]): ReadonlyMap<number, readonly Frame[]> {
  const braces = blankStringContents(source);
  /*
   * Where every `{` closes, computed up front.
   *
   * Up front rather than as the walk passes each `}`, and the difference is
   * not stylistic: a frame is captured while it is still *open*, so on the
   * incremental version every enclosing block came back with no end and every
   * block's text ran to the end of the file. `classesIn` then reported the
   * class names of the whole module for every control in it, which is the
   * shape of wrongness that reads as a pass.
   */
  const closes = new Map<number, number>();
  const open: number[] = [];
  for (let index = 0; index < braces.length; index += 1) {
    if (braces[index] === '{') open.push(index);
    else if (braces[index] === '}') {
      const start = open.pop();
      if (start !== undefined) closes.set(start, index);
    }
  }

  const stack: Frame[] = [];
  const result = new Map<number, readonly Frame[]>();
  const sorted = [...new Set(targets)].sort((left, right) => left - right);
  let next = 0;
  for (let index = 0; index < braces.length; index += 1) {
    while (next < sorted.length && sorted[next] === index) {
      result.set(sorted[next] as number, stack.map((frame) => ({ ...frame })));
      next += 1;
    }
    const character = braces[index];
    if (character === '{') {
      stack.push({
        label: labelFor(source.slice(Math.max(0, index - LOOKBEHIND), index)),
        start: index,
        end: closes.get(index),
      });
    } else if (character === '}') stack.pop();
  }
  while (next < sorted.length) {
    result.set(sorted[next] as number, stack.map((frame) => ({ ...frame })));
    next += 1;
  }
  return result;
}

export interface Site {
  readonly source: ScannedSource;
  readonly index: number;
  readonly line: number;
  readonly frames: readonly Frame[];
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** Every match of `pattern` in `sources`, with the block stack it sits in. */
export function sitesMatching(sources: readonly ScannedSource[], pattern: string): readonly Site[] {
  const found: Site[] = [];
  for (const source of sources) {
    const indices: number[] = [];
    for (const match of source.text.matchAll(new RegExp(pattern, 'g'))) indices.push(match.index);
    if (indices.length === 0) continue;
    const frames = framesAt(source.text, indices);
    for (const index of indices) {
      found.push({ source, index, line: lineOf(source.text, index), frames: frames.get(index) ?? [] });
    }
  }
  return found;
}

const isFunctionish = (label: string | undefined): boolean =>
  label !== undefined &&
  (label.startsWith('event:') || label.startsWith('prop:') || label.startsWith('const:') || label.startsWith('function:'));

/**
 * The function a site sits in, and the call that function was handed to.
 *
 * Two cases, and the second is why this is not simply "the top of the stack".
 * `onActivate: () => { options.onAdmit(); }` opens a block, so it is a frame;
 * `onActivate: () => options.onAdmit()` does not, so the same property has to
 * be recognised from the text in front of the *call*. `call:` frames -- the
 * object literals intents and option bags are written as -- are stepped over
 * in both cases, because an object literal is not a function.
 */
function enclosing(site: Site): { readonly label: string | undefined; readonly factory: string | undefined } {
  const before = site.source.text.slice(Math.max(0, site.index - LOOKBEHIND), site.index);
  const concise = labelFor(before);
  const ordered = [...site.frames].reverse();

  if (concise !== undefined && (concise.startsWith('event:') || concise.startsWith('prop:'))) {
    const owner = ordered.find((frame) => frame.label?.startsWith('call:') === true);
    return { label: concise, factory: owner?.label?.slice('call:'.length) };
  }

  const position = ordered.findIndex((frame) => isFunctionish(frame.label));
  if (position < 0) return { label: undefined, factory: undefined };
  const own = ordered[position] as Frame;
  const parent = ordered[position + 1];
  return {
    label: own.label,
    factory: parent?.label?.startsWith('call:') === true ? parent.label.slice('call:'.length) : undefined,
  };
}

/**
 * The `className: '...'` tokens written in the blocks around a hop: the
 * control's own neighbourhood, which is what says whether the `#88` sweep can
 * lay it out.
 *
 * The outermost frame is dropped, and that is the whole of what makes this
 * usable. It is the panel's own `createStaffPanel` body, so keeping it would
 * report every class that panel writes anywhere for every control in it --
 * the Hire button would come back carrying `hud-staff__held-row`, which is
 * the one region of that panel it is *not* in.
 */
function classesIn(site: Site): readonly string[] {
  const found = new Set<string>();
  for (const frame of site.frames.slice(1)) {
    const segment = site.source.text.slice(frame.start, frame.end ?? site.source.text.length);
    for (const match of segment.matchAll(/className\s*:\s*'([^']+)'/g)) {
      for (const token of (match[1] ?? '').split(/\s+/)) if (token !== '') found.add(token);
    }
  }
  return [...found];
}

/** The tag `element('tag', …)` gave the variable an event listener was attached to. */
function tagOf(text: string, receiver: string): string | undefined {
  return new RegExp(`\\b${receiver}\\s*(?::[^=;]*)?=\\s*element\\s*\\(\\s*'(\\w+)'`).exec(text)?.[1];
}

export type RouteOutcome =
  /** Bottoms out on a DOM listener attached to an element `INTERACTIVE_SELECTOR` matches. The passing shape. */
  | 'control'
  /** Bottoms out on a DOM listener attached to something that selector does not match: a producer the sweep cannot see. */
  | 'non-interactive'
  /** A callback option nothing in the panel that declares it ever calls. */
  | 'unwired-callback'
  /** Reached module scope, a plain function, or a tool seam: no DOM control on this route. */
  | 'no-control'
  /** The walk hit its depth or cycle guard before reaching either end. */
  | 'inconclusive';

export interface Route {
  readonly intent: string;
  readonly outcome: RouteOutcome;
  /** Where the walk stopped, repository-relative `file:line`. */
  readonly at: string;
  /** The element tag the listener is on, when the walk reached one. */
  readonly tag?: string;
  /** Every hop, outermost first, for a reader of a failure. */
  readonly trail: readonly string[];
  /** Class tokens written in the blocks the walk passed through, outside `src/ui/primitives/`. */
  readonly classes: readonly string[];
}

/** Deep enough for the deepest chain measured (three hops) with room to spare, shallow enough to terminate. */
const MAX_HOPS = 6;

function walk(
  sources: readonly ScannedSource[],
  site: Site,
  intent: string,
  depth: number,
  seen: ReadonlySet<string>,
  trail: readonly string[],
  classes: readonly string[],
): Route {
  const { label, factory } = enclosing(site);
  const at = `${site.source.file}:${site.line}`;
  // The primitives are shared, so their own class names say nothing about
  // which region of the shell this particular control sits in.
  const gathered = site.source.file.startsWith('src/ui/primitives/')
    ? classes
    : [...new Set([...classes, ...classesIn(site)])];

  if (label === undefined) return { intent, outcome: 'no-control', at, trail: [...trail, `${at} (module scope)`], classes: gathered };

  if (label.startsWith('event:')) {
    const [, type, receiver] = label.split(':') as [string, string, string];
    const tag = tagOf(site.source.text, receiver);
    return {
      intent,
      outcome: tag !== undefined && INTERACTIVE_TAGS.includes(tag) ? 'control' : 'non-interactive',
      at,
      ...(tag === undefined ? {} : { tag }),
      trail: [...trail, `${at} ${receiver}.addEventListener('${type}') on <${tag ?? 'unresolved'}>`],
      classes: gathered,
    };
  }

  if (label.startsWith('prop:')) {
    const name = label.slice('prop:'.length);
    const hop = `${at} ${factory ?? 'an unresolved factory'}({ ${name} })`;
    if (depth >= MAX_HOPS || seen.has(name)) return { intent, outcome: 'inconclusive', at, trail: [...trail, hop], classes: gathered };
    const owners = factory === undefined ? [] : sources.filter((source) => new RegExp(`export function ${factory}\\b`).test(source.text));
    const next = sitesMatching(owners.length > 0 ? owners : sources, `(?:\\boptions|\\bprops)\\.${name}\\??\\.?\\s*\\(`);
    if (next.length === 0) return { intent, outcome: 'unwired-callback', at, trail: [...trail, hop], classes: gathered };
    const results = next.map((onward) => walk(sources, onward, intent, depth + 1, new Set([...seen, name]), [...trail, hop], gathered));
    return results.find((result) => result.outcome === 'control') ?? (results[0] as Route);
  }

  return { intent, outcome: 'no-control', at, trail: [...trail, `${at} ${label}`], classes: gathered };
}

/** Every route from one intent kind to a control, or to wherever it stops short of one. */
export function routesForIntent(sources: readonly ScannedSource[], intent: string): readonly Route[] {
  return (
    sitesMatching(sources, `\\bkind\\s*:\\s*'${intent}'`)
      // A `kind: 'x'` in the `HudIntent` union itself is a declaration and not
      // a dispatch: it is at module scope and opens no block.
      .filter((site) => site.frames.some((frame) => frame.label !== undefined))
      .map((site) => walk(sources, site, intent, 0, new Set(), [], []))
  );
}
