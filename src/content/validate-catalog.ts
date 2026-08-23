import type { ItemDefinition } from './item-catalog';
import type { ObjectDefinition } from './object-catalog';
import type { ContentRegistry } from './registry';
import type { RoomCatalogDefinition } from './room-catalog';
import type { ScenarioDefinition } from './scenario-catalog';
import type { SimulationEnumForm, SimulationEnumGroup } from './simulation-message-keys';

export type CatalogCrossReferenceError = {
  readonly kind: 'missing-object-reference';
  readonly roomId: string;
  readonly objectId: string;
};

export type ScenarioCrossReferenceError = {
  readonly kind: 'missing-item-reference';
  readonly scenarioId: string;
  readonly itemId: string;
};

/**
 * Cross-catalog validation issue #23 requires beyond each catalog's own
 * schema/duplicate checks: every room requirement of type `'object'` must
 * name a real, registered object definition. A dangling reference here
 * would only surface later as a room that can never validate, with no
 * indication why -- this makes it a clear, startup-time error instead.
 */
export function validateRoomObjectReferences(
  rooms: ContentRegistry<RoomCatalogDefinition>,
  objects: ContentRegistry<ObjectDefinition>,
): readonly CatalogCrossReferenceError[] {
  const errors: CatalogCrossReferenceError[] = [];

  for (const room of rooms.all()) {
    for (const requirement of room.requirements) {
      if (requirement.type !== 'object') continue;
      if (!objects.has(requirement.objectId)) {
        errors.push({ kind: 'missing-object-reference', roomId: room.id, objectId: requirement.objectId });
      }
    }
  }

  return errors;
}

/**
 * Every item a scenario proposes to stock must be a real item definition
 * (ADR 0018).
 *
 * This is the check that makes a supply route trustworthy rather than
 * merely present. A scenario naming an item id nothing declares deposits
 * stock nobody can spend, and the only symptom is a build order that waits
 * in `'materials-pending'` forever -- indistinguishable, from the outside,
 * from having declared no stock at all. Startup is the last moment that
 * failure is still legible, so it fails here.
 */
export function validateScenarioItemReferences(
  scenarios: readonly ScenarioDefinition[],
  items: ContentRegistry<ItemDefinition>,
): readonly ScenarioCrossReferenceError[] {
  const errors: ScenarioCrossReferenceError[] = [];

  for (const scenario of scenarios) {
    for (const stock of scenario.startingStock) {
      if (!items.has(stock.itemId)) {
        errors.push({ kind: 'missing-item-reference', scenarioId: scenario.id, itemId: stock.itemId });
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Message-key completeness for the simulation's enumerations
// ---------------------------------------------------------------------------

/**
 * `simulation-message-keys.ts` labels values that have no definition object
 * to hang a `nameKey` on -- needs, incident types, job states and the rest.
 * A label map like that is only worth having if it *cannot* fall behind the
 * enums it labels, so the source declarations stay the authority and this is
 * the machinery that compares the two.
 *
 * Everything here is pure string work on source text: reading files is the
 * test's job (`tests/unit/simulation-message-keys.test.ts`), the same split
 * `tests/determinism/ambient-nondeterminism-contract.test.ts` uses. Keeping
 * the rules here rather than inside the test means they are exported,
 * type-checked and unit-testable against fixtures, instead of being regexes
 * that only ever run against real files and can therefore quietly stop
 * matching.
 *
 * The scan is deliberately textual rather than type-level. A `satisfies
 * Record<NeedId, string>` on the label map would be checked by `tsc` and
 * would be stronger *for the forms TypeScript can see* -- but it only works
 * where the enum is a union type reachable from `src/content/`, and
 * `src/content/` must not import `src/simulation/`: the catalogs stay
 * importable from anywhere, and the simulation imports them, not the
 * reverse. A textual scan is weaker per declaration and strictly broader --
 * it covers zod schemas, `as const` arrays and definition arrays uniformly,
 * and it also answers the question a type cannot: "is there an enum here
 * that nobody labelled at all?"
 */

/**
 * Comments are removed before scanning, so a rule can still be *discussed*
 * in prose without the prose reading as a declaration.
 */
export function stripSourceComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Reads the `[...]` starting at `openIndex`, tracking nesting and skipping
 * string literals, and returns its contents. A naive `[^\]]*` regex stops at
 * the first `]` inside a nested array and silently truncates the value list
 * -- which would hide a missing label, the one failure this whole mechanism
 * exists to prevent.
 */
function readBracketSpan(source: string, openIndex: number): string | undefined {
  if (source[openIndex] !== '[') return undefined;
  let depth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index]!;

    if (character === "'" || character === '"' || character === '`') {
      const end = skipStringLiteral(source, index);
      if (end === undefined) return undefined;
      index = end;
      continue;
    }

    if (character === '[') depth += 1;
    else if (character === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }

  return undefined;
}

/** Index of the closing quote of the literal starting at `openIndex`, or `undefined` if it is unterminated. */
function skipStringLiteral(source: string, openIndex: number): number | undefined {
  const quote = source[openIndex]!;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (character === quote) return index;
  }
  return undefined;
}

/** Index just past `export const NAME` / `export type NAME`, or `undefined` when the declaration is absent. */
function findDeclarationHead(source: string, keyword: 'const' | 'type', declaration: string): number | undefined {
  const pattern = new RegExp(`\\bexport\\s+${keyword}\\s+${escapeForPattern(declaration)}\\b`);
  const match = pattern.exec(source);
  return match === null ? undefined : match.index + match[0].length;
}

function escapeForPattern(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Body of a `type X = ...;` declaration: after the `=`, up to the terminating `;`. */
function readTypeAliasBody(source: string, headEnd: number): string | undefined {
  const assignment = source.indexOf('=', headEnd);
  if (assignment === -1) return undefined;
  const terminator = source.indexOf(';', assignment);
  if (terminator === -1) return undefined;
  return source.slice(assignment + 1, terminator);
}

function singleQuotedLiterals(body: string): readonly string[] {
  return [...body.matchAll(/'([^'\\]*)'/g)].map((match) => match[1]!);
}

/** True when `body` is *only* single-quoted literals joined by `|`, so `'a' | 'b' | string` is rejected rather than read as two values. */
function isPureStringUnion(body: string): boolean {
  return singleQuotedLiterals(body).length >= 1 && /^[\s|]*$/.test(body.replace(/'[^'\\]*'/g, ''));
}

/** True when `body` is only single-quoted literals separated by commas: an `as const` value list, not an array of objects. */
function isPureStringList(body: string): boolean {
  return singleQuotedLiterals(body).length >= 1 && /^[\s,]*$/.test(body.replace(/'[^'\\]*'/g, ''));
}

export type EnumIdExtractionFailure =
  /** No `export const NAME` / `export type NAME` in this file: renamed, moved, or the group is stale. */
  | 'declaration-not-found'
  /** Found, but not readable in the declared form -- an unterminated span, or a union that is not purely literal. */
  | 'declaration-not-in-declared-form'
  /** Read successfully and yielded nothing, which is never a legitimate enum. */
  | 'declaration-has-no-values';

export type EnumIdExtraction =
  | { readonly ok: true; readonly ids: readonly string[] }
  | { readonly ok: false; readonly reason: EnumIdExtractionFailure };

/**
 * Extracts the stable ids a declaration defines, in source order. One
 * extractor per `SimulationEnumForm`; a declaration that cannot be read
 * cleanly fails loudly instead of returning a plausible-looking short list.
 */
export function extractEnumDeclarationIds(
  source: string,
  declaration: string,
  form: SimulationEnumForm,
): EnumIdExtraction {
  const ids = extractIdsForForm(source, declaration, form);
  if (typeof ids === 'string') return { ok: false, reason: ids };
  if (ids.length === 0) return { ok: false, reason: 'declaration-has-no-values' };
  return { ok: true, ids };
}

function extractIdsForForm(
  source: string,
  declaration: string,
  form: SimulationEnumForm,
): readonly string[] | EnumIdExtractionFailure {
  switch (form) {
    case 'string-union':
    case 'numeric-union': {
      const head = findDeclarationHead(source, 'type', declaration);
      if (head === undefined) return 'declaration-not-found';
      const body = readTypeAliasBody(source, head);
      if (body === undefined) return 'declaration-not-in-declared-form';

      if (form === 'string-union') {
        return isPureStringUnion(body) ? singleQuotedLiterals(body) : 'declaration-not-in-declared-form';
      }

      const members = body.split('|').map((member) => member.trim());
      if (!members.every((member) => /^-?\d+$/.test(member))) return 'declaration-not-in-declared-form';
      return members;
    }

    case 'const-array':
    case 'zod-enum':
    case 'zod-literal-union':
    case 'definition-id-field': {
      const head = findDeclarationHead(source, 'const', declaration);
      if (head === undefined) return 'declaration-not-found';

      // Start after the `=`, never at the declaration head: a type
      // annotation such as `readonly ActionDefinition[]` contains a `[` of
      // its own, and reading that as the value list yields nothing.
      const assignment = source.indexOf('=', head);
      if (assignment === -1) return 'declaration-not-in-declared-form';
      const anchor = form === 'zod-enum' ? source.indexOf('z.enum(', assignment) : assignment;
      if (anchor === -1) return 'declaration-not-in-declared-form';
      const open = source.indexOf('[', anchor);
      if (open === -1) return 'declaration-not-in-declared-form';
      const body = readBracketSpan(source, open);
      if (body === undefined) return 'declaration-not-in-declared-form';

      if (form === 'const-array' || form === 'zod-enum') {
        return isPureStringList(body) ? singleQuotedLiterals(body) : 'declaration-not-in-declared-form';
      }
      if (form === 'zod-literal-union') {
        return [...body.matchAll(/z\s*\.\s*literal\s*\(\s*'([^'\\]*)'/g)].map((match) => match[1]!);
      }
      // `definition-id-field`: each definition object's own `id` property,
      // anchored on a preceding `{`, `,` or line start so that a sibling
      // `objectId: '...'` cannot be mistaken for it.
      return [...body.matchAll(/(?:^|[{,])\s*id\s*:\s*'([^'\\]*)'/gm)].map((match) => match[1]!);
    }
  }
}

export type SimulationEnumSourceError =
  | {
      readonly kind: 'declaration-unreadable';
      readonly namespace: string;
      readonly sourceFile: string;
      readonly declaration: string;
      readonly reason: EnumIdExtractionFailure;
    }
  /** The source declares this id and nothing labels it: the HUD would render a raw id. */
  | { readonly kind: 'missing-label'; readonly namespace: string; readonly id: string }
  /** A label whose id the source no longer declares, and which is not an approved `additionalIds` entry. */
  | { readonly kind: 'stale-label'; readonly namespace: string; readonly id: string }
  /** An `additionalIds` exemption for an id the source *does* declare: obsolete, and should be deleted. */
  | { readonly kind: 'obsolete-additional-id'; readonly namespace: string; readonly id: string };

/**
 * Compares one group's labels against the real source text of the
 * declaration it claims to label. Both directions are checked: an unlabelled
 * value is the failure this exists to catch, and a label for a value that no
 * longer exists is how the table would slowly fill with fiction.
 */
export function validateSimulationEnumGroupSource(
  group: SimulationEnumGroup,
  source: string,
): readonly SimulationEnumSourceError[] {
  const extraction = extractEnumDeclarationIds(stripSourceComments(source), group.declaration, group.form);
  if (!extraction.ok) {
    return [
      {
        kind: 'declaration-unreadable',
        namespace: group.namespace,
        sourceFile: group.sourceFile,
        declaration: group.declaration,
        reason: extraction.reason,
      },
    ];
  }

  const errors: SimulationEnumSourceError[] = [];
  const declared = new Set(extraction.ids);
  const exempt = new Set((group.additionalIds ?? []).map((entry) => entry.id));

  for (const id of declared) {
    if (!Object.hasOwn(group.labels, id)) errors.push({ kind: 'missing-label', namespace: group.namespace, id });
  }
  for (const id of Object.keys(group.labels)) {
    if (!declared.has(id) && !exempt.has(id)) errors.push({ kind: 'stale-label', namespace: group.namespace, id });
  }
  for (const id of exempt) {
    if (declared.has(id)) errors.push({ kind: 'obsolete-additional-id', namespace: group.namespace, id });
  }

  return errors;
}

export interface DiscoveredEnumDeclaration {
  readonly declaration: string;
  readonly form: SimulationEnumForm;
  readonly ids: readonly string[];
}

/**
 * Finds the enum-shaped exported declarations in a source file, so a whole
 * *new* enum cannot appear with no group covering it. Per-group checking
 * only proves that the groups which exist are complete; this is what stops
 * the table from being complete and irrelevant.
 *
 * It recognizes the three self-evident shapes: an `as const` array of
 * strings, a union of string or integer literals, and `z.enum([...])`. The
 * remaining two forms (`zod-literal-union`, `definition-id-field`) are
 * supported for groups but deliberately *not* discovered -- every
 * discriminated union and every definition array in the repository has that
 * shape, so discovering them would produce a false-positive list long enough
 * that nobody reads it, and a list nobody reads enforces nothing.
 */
export function findEnumShapedDeclarations(source: string): readonly DiscoveredEnumDeclaration[] {
  const stripped = stripSourceComments(source);
  const found: DiscoveredEnumDeclaration[] = [];

  for (const match of stripped.matchAll(/\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*(z\s*\.\s*enum\s*\(\s*)?\[/g)) {
    const declaration = match[1]!;
    const form: SimulationEnumForm = match[2] === undefined ? 'const-array' : 'zod-enum';
    const body = readBracketSpan(stripped, match.index + match[0].length - 1);
    if (body === undefined || !isPureStringList(body)) continue;
    const ids = singleQuotedLiterals(body);
    // A one-element `as const` array is a list that happens to be short, not
    // an enumeration; `z.enum` is unambiguous even with one member.
    if (form === 'const-array' && ids.length < 2) continue;
    found.push({ declaration, form, ids });
  }

  for (const match of stripped.matchAll(/\bexport\s+type\s+([A-Za-z_$][\w$]*)\s*=([^;]*);/g)) {
    const declaration = match[1]!;
    const body = match[2]!;

    if (isPureStringUnion(body)) {
      const ids = singleQuotedLiterals(body);
      if (ids.length >= 2) found.push({ declaration, form: 'string-union', ids });
      continue;
    }

    const members = body.split('|').map((member) => member.trim());
    if (members.length >= 2 && members.every((member) => /^-?\d+$/.test(member))) {
      found.push({ declaration, form: 'numeric-union', ids: members });
    }
  }

  return found;
}
