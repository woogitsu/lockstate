import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  mainToWorkerMessageSchema,
  workerToMainMessageSchema,
} from '../../src/simulation/protocol/types';

/**
 * A document that enumerates a wire shape must name every member that shape has.
 *
 * ## The defect this exists for
 *
 * `docs/adr/0003-simulation-worker-protocol.md`'s 2026-08-24 amendment said
 * the status-counts payload *"gains an optional `refusal`: `{ sequence, tick,
 * reason }`"*. That was exact for twenty-three days. #1261 added
 * `routeDecidedSince` to `refusalSchema` and the sentence became a false
 * enumeration of a live wire shape (#1263).
 *
 * **No delta method reaches it**, which is why it is a gate rather than a
 * sweep. The `STATUS-QUEUE.md` entry quoting that amendment cites
 * `tests/unit/ui-simulation-zoning.test.ts` and
 * `src/simulation/protocol/transferables.ts`, and neither was in the change
 * window: what the window falsified was a *quoted enumeration of a wire
 * shape*, named in prose as `simulation/status-counts` rather than as a path.
 * A path-scan intersection returns it for nothing, however wide the window.
 *
 * ## What it checks, and what it deliberately does not
 *
 * It checks **membership**, not the enumeration itself: every member the
 * schema declares has to appear *somewhere* in the document, not inside the
 * braces. That is not a weaker check chosen for convenience -- it is the only
 * form compatible with `docs/AGENT_WORKFLOW.md` section 4's "mark both
 * directions rather than overwriting". Both documents that enumerate
 * `refusal` today keep the three-member sentence exactly as written and
 * correct it in the paragraph beneath; an equality check would call both of
 * them defects for following the method this repository requires.
 *
 * So the false negative is stated rather than discovered later: a document
 * that mentions a new member in passing while leaving a stale enumeration
 * *uncorrected* passes here. What cannot pass is a member that no document
 * enumerating that shape mentions at all, which is exactly #1263 and exactly
 * what a diff cannot see.
 *
 * ## Why there is no hand-maintained ADR-to-schema table
 *
 * Both halves are derived. The shapes come from walking
 * `workerToMainMessageSchema` and `mainToWorkerMessageSchema` at runtime, so
 * the schema side is whatever the wire actually declares. The documents come
 * from matching a backticked brace enumeration against those shapes **by key
 * set** rather than by name or proximity: a document listing `{ sequence,
 * tick, reason }` is claiming to enumerate a shape that has those keys, and
 * there is exactly one on the wire.
 *
 * Measured on the tree this was written against: 17 backticked brace
 * enumerations under `docs/`, of which 3 resolve to a wire field -- all three
 * to `refusal`, none ambiguously. `{ tile, edge }`, `{ x, y }`,
 * `{ locale, version, messages }` and the rest resolve to nothing and are
 * skipped, because nothing on the wire has those keys.
 *
 * **Re-measured on the merge with `main` that this branch was rebuilt on:
 * 19 enumerations, of which 5 resolve** -- still all to `refusal`, still none
 * ambiguously. The two new ones are in `docs/adr/STATUS-QUEUE.md`, which now
 * quotes the ADR 0003 amendment twice while recording the very defect this
 * contract exists for. Both figures are kept rather than overwritten, per
 * `docs/AGENT_WORKFLOW.md` section 4: the movement between them is the
 * evidence that the pin below is derived and not hand-kept.
 *
 * **Re-measured a third time, two merges later: 20 enumerations, of which 6
 * resolve.** The sixth is in `docs/AGENT_WORKFLOW.md` itself -- #1264 added a
 * section 4 bullet naming *"a live claim whose subject is a message kind or a
 * schema rather than a file"*, and illustrated it by quoting this very
 * enumeration. So the method document that describes the blind spot is now
 * inside the gate that closes it, which is the strongest evidence available
 * that the derivation is reading documents rather than a list someone typed.
 * Three figures, three commits, none overwritten: that the set moves on almost
 * every merge is the fact, and a pin that stopped moving would be the thing to
 * distrust.
 *
 * **Re-derived a fourth time, at `1ad064f9` (2026-09-17), after four further
 * merges including #1230's 184 lines into `docs/HUD_PROJECTIONS.md` and
 * #1282's into `docs/AGENT_WORKFLOW.md` -- both files that carry a resolving
 * enumeration: 20 enumerations, of which 6 resolve.** Unchanged, and the first
 * re-derivation that did not move. That is not evidence the derivation has
 * stopped working, because `RESOLVED_ENUMERATIONS` below is asserted exactly
 * and would fail on a lost row; it is the ordinary case the three moves above
 * make look unusual.
 *
 * **Re-derived a fifth time, at `eeda2e53` (2026-09-18), across a 53-commit
 * top-up that included #1293's re-anchor pass over `docs/adr/STATUS-QUEUE.md`
 * -- one of the two documents carrying a resolving enumeration: 20
 * enumerations, of which 6 resolve.** Unchanged again, and the re-anchor is
 * the interesting half: #1293 added 375 lines to that file and removed 5, and
 * both quotations of the ADR 0003 amendment came through it untouched --
 * which is what the `file:line`-versus-quotation rule in
 * `docs/AGENT_WORKFLOW.md` section 4 predicts, and what this pin measures
 * rather than assumes.
 *
 * `RESOLVED_ENUMERATIONS` below is not that table. It is the *output* of the
 * derivation, pinned, so that a resolution which stops happening -- a renamed
 * field, a reworded sentence, a regex that quietly stops matching -- fails
 * loudly instead of shrinking the gate to nothing. A new resolution fails it
 * too, and the fix is to add the row.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Separator for comparing key sets as strings; no identifier can contain it. */
const KEY_SET_SEPARATOR = '\u0000';

/**
 * Every backticked brace enumeration under `docs/` that resolves to a wire shape.
 *
 * Pinned because every substantive assertion below is a "found nothing" claim,
 * and a scanner that resolves nothing satisfies all of them. Rows repeat
 * because a document may carry the same enumeration more than once: ADR 0003
 * carries it twice, and `STATUS-QUEUE.md` quotes that ADR twice.
 */
const RESOLVED_ENUMERATIONS: readonly string[] = [
  'docs/HUD_PROJECTIONS.md {reason, sequence, tick} -> refusal',
  'docs/adr/0003-simulation-worker-protocol.md {reason, sequence, tick} -> refusal',
  'docs/adr/0003-simulation-worker-protocol.md {reason, sequence, tick} -> refusal',
  'docs/adr/STATUS-QUEUE.md {reason, sequence, tick} -> refusal',
  'docs/adr/STATUS-QUEUE.md {reason, sequence, tick} -> refusal',
  'docs/AGENT_WORKFLOW.md {reason, sequence, tick} -> refusal',
  // **A seventh row, and the first that resolves to something other than
  // `refusal`** (2026-09-22). `refusalSchema.tile` put the first `x`/`y` pair
  // on the validated wire -- commands ride as an opaque `versionedPayload`, so
  // until now nothing declared either key -- and the docblock above records
  // that `{ x, y }` "resolves to nothing" as a measurement of the tree it was
  // written against. It resolves now, and it resolves to the new shape.
  //
  // **It is a false positive of the resolution rule and it is added rather
  // than excluded, deliberately.** ADR 0106's enumeration is describing
  // `RemoveObject`'s *command* payload, not a refusal's place; it matches
  // because the rule is subset-by-key-set and the two shapes genuinely share
  // their whole key set. Teaching the contract to tell them apart would need
  // the very ADR-to-schema table the docblock above declines to keep, so the
  // row is pinned instead -- which costs nothing here, because the membership
  // assertion below is satisfied without touching ADR 0106: it names `x` and
  // `y` twice each, and `tile` declares nothing else.
  //
  // What this row does buy is the failure a reader would want: a `width` or a
  // `height` added to `tile` later makes ADR 0106 -- a document about walls,
  // which contains neither word -- fail the membership check, and that is the
  // honest signal that a rectangle on this member needs a decision rather
  // than an edit.
  'docs/adr/0106-how-a-finished-wall-comes-down-without-a-keyboard.md {x, y} -> tile',
];

/**
 * Wire fields the walk must reach, by name.
 *
 * A count floor cannot close this direction: a walk that stopped unwrapping
 * `.optional()` still returns a large number of fields and would silently drop
 * every optional sibling -- `refusal` among them, which is the one field this
 * contract was written for. These fail by name instead.
 */
const REQUIRED_WIRE_FIELDS: readonly string[] = ['counts', 'refusal', 'zoning', 'page'];

/** The floor on enumerations the document scan sees, resolved or not. */
const MINIMUM_DOCUMENT_ENUMERATIONS = 12;

type WireShapes = ReadonlyMap<string, readonly (readonly string[])[]>;

/**
 * Every object shape reachable from either wire union, keyed by the field name
 * that carries it.
 *
 * A name can carry more than one shape (two messages may both have a
 * `payload`), so the value is a list of distinct key sets rather than one set.
 * Merging them would invent a shape no message sends.
 */
function collectWireShapes(): WireShapes {
  const shapes = new Map<string, string[][]>();
  const visited = new Set<unknown>();

  const walk = (fieldName: string, node: unknown): void => {
    if (node === null || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    const candidate = node as {
      readonly shape?: Record<string, unknown>;
      readonly options?: readonly unknown[];
      readonly _zod?: { readonly def?: Record<string, unknown> };
      readonly def?: Record<string, unknown>;
    };

    if (candidate.shape !== undefined && typeof candidate.shape === 'object') {
      const keys = Object.keys(candidate.shape).sort();
      const known = shapes.get(fieldName) ?? [];
      if (!known.some((set) => set.join(KEY_SET_SEPARATOR) === keys.join(KEY_SET_SEPARATOR))) {
        known.push(keys);
      }
      shapes.set(fieldName, known);
      for (const [key, value] of Object.entries(candidate.shape)) walk(key, value);
      return;
    }

    // Not an object schema: unwrap whatever container this is and keep the
    // field name, because `refusal` is an *optional* object and the name lives
    // on the wrapper rather than on the shape inside it.
    const def = candidate._zod?.def ?? candidate.def;
    const children: unknown[] = [];
    if (Array.isArray(candidate.options)) children.push(...candidate.options);
    if (def !== undefined) {
      if (def['innerType'] !== undefined) children.push(def['innerType']);
      if (def['element'] !== undefined) children.push(def['element']);
      if (Array.isArray(def['options'])) children.push(...(def['options'] as unknown[]));
    }
    for (const child of children) walk(fieldName, child);
  };

  walk('<root>', workerToMainMessageSchema);
  walk('<root>', mainToWorkerMessageSchema);
  return shapes;
}

async function collectMarkdownFiles(directory: string): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectMarkdownFiles(entryPath)));
    else if (entry.name.endsWith('.md')) files.push(entryPath);
  }
  return files.sort();
}

/** A backticked `{ a, b, c }` of two or more plain identifiers. */
const ENUMERATION = /`\{ ([a-zA-Z][a-zA-Z0-9_]*(?:, [a-zA-Z][a-zA-Z0-9_]*)+) \}`/gu;

interface Enumeration {
  readonly file: string;
  readonly members: readonly string[];
}

interface Resolution extends Enumeration {
  readonly field: string;
  readonly declared: readonly string[];
}

function resolveEnumeration(
  enumeration: Enumeration,
  shapes: WireShapes,
): { readonly resolution?: Resolution; readonly ambiguous?: string } {
  const hits: { readonly field: string; readonly declared: readonly string[] }[] = [];
  for (const [field, sets] of shapes) {
    for (const declared of sets) {
      if (enumeration.members.every((member) => declared.includes(member))) {
        hits.push({ field, declared });
      }
    }
  }
  const [first] = hits;
  if (first === undefined) return {};
  const distinct = new Set(hits.map((hit) => hit.declared.join(KEY_SET_SEPARATOR)));
  if (distinct.size > 1) {
    return {
      ambiguous:
        `${enumeration.file} {${enumeration.members.join(', ')}} matches ${hits.length} wire shapes ` +
        `(${hits.map((hit) => hit.field).join(', ')}) -- teach this contract which one it means`,
    };
  }
  return { resolution: { ...enumeration, field: first.field, declared: first.declared } };
}

async function collectResolutions(): Promise<{
  readonly resolutions: readonly Resolution[];
  readonly ambiguous: readonly string[];
  readonly enumerationsSeen: number;
}> {
  const shapes = collectWireShapes();
  const files = await collectMarkdownFiles(path.join(repositoryRoot, 'docs'));
  const resolutions: Resolution[] = [];
  const ambiguous: string[] = [];
  let enumerationsSeen = 0;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(ENUMERATION)) {
      enumerationsSeen += 1;
      const members = (match[1] ?? '').split(', ').sort();
      const outcome = resolveEnumeration(
        { file: path.relative(repositoryRoot, file), members },
        shapes,
      );
      if (outcome.ambiguous !== undefined) ambiguous.push(outcome.ambiguous);
      if (outcome.resolution !== undefined) resolutions.push(outcome.resolution);
    }
  }
  return { resolutions, ambiguous, enumerationsSeen };
}

describe('documented wire schema membership', () => {
  it('reaches every wire field this contract names, so an unwrap that stops working fails by name', () => {
    const shapes = collectWireShapes();
    expect(REQUIRED_WIRE_FIELDS.filter((field) => !shapes.has(field))).toEqual([]);
    // The one shape the whole contract turns on, asserted in full rather than
    // by presence: this is the positive control for the walk itself, and it is
    // what goes red first if `.optional()` stops being unwrapped.
    expect(shapes.get('refusal')).toEqual([['reason', 'routeDecidedSince', 'sequence', 'tick', 'tile']]);
    // And the shape `tile` itself declares, asserted for the reason `refusal`
    // is: it is the first nested object this record has ever carried, so it is
    // also the first thing here that the walk has to descend *into* rather
    // than merely unwrap an `.optional()` off.
    expect(shapes.get('tile')).toEqual([['x', 'y']]);
  });

  it('still sees brace enumerations in the documents, so a regex that stops matching fails', async () => {
    const { enumerationsSeen } = await collectResolutions();
    expect(enumerationsSeen).toBeGreaterThanOrEqual(MINIMUM_DOCUMENT_ENUMERATIONS);
  });

  it('resolves exactly the enumerations it is pinned to resolve', async () => {
    const { resolutions, ambiguous } = await collectResolutions();
    expect(ambiguous).toEqual([]);
    expect(
      resolutions
        .map((row) => `${row.file} {${row.members.join(', ')}} -> ${row.field}`)
        .sort(),
    ).toEqual([...RESOLVED_ENUMERATIONS].sort());
  });

  it('finds every member of a documented wire shape named in the document that enumerates it', async () => {
    const { resolutions } = await collectResolutions();
    const violations: string[] = [];
    for (const resolution of resolutions) {
      const text = await readFile(path.join(repositoryRoot, resolution.file), 'utf8');
      for (const declared of resolution.declared) {
        if (new RegExp(`\\b${declared}\\b`, 'u').test(text)) continue;
        violations.push(
          `${resolution.file} enumerates the wire shape \`${resolution.field}\` as ` +
            `{${resolution.members.join(', ')}} and never names \`${declared}\`, ` +
            `which that shape declares`,
        );
      }
    }
    expect([...new Set(violations)].sort()).toEqual([]);
  });
});
