import type { JsonValue } from '../../src/shared/json';

/**
 * Field-sensitivity fixtures for hashing and signing functions.
 *
 * A hash or signing test written as `expect(f(x)).toEqual(f(x))` -- or as
 * `expect(seen[0]).toEqual(bytesOf(definition))`, which is the same shape with
 * one step of indirection -- proves nothing about *which* of `x`'s fields
 * reached the output. It holds for any function of `x`, including one that
 * discards everything except an id. Issue #264 measured exactly that against
 * `src/services/challenges/`: reducing the signed bytes to `{id, version}`,
 * the definition hash to `{id, version, seed}`, and the evidence hash to
 * evidence-with-no-commands each left the whole suite green.
 *
 * Tampering one named field instead is better and still not enough -- #264's
 * second and third survivors are both cases where the guard happened to tamper
 * a field the mutation kept. The property a signing or hashing function
 * actually owes its callers is that **every** field it is given reaches its
 * output, so this module produces one perturbed copy per leaf and lets the
 * caller assert that all of them differ.
 *
 * Enumerating rather than naming is deliberate: a field added to
 * `challengeDefinitionSchema` tomorrow is covered by the same assertion with no
 * edit, which is the direction that matters when the risk is a definition that
 * "can lie about its own limits and allow-lists" ([ADR 0009](../../docs/adr/0009-challenge-verification-strategy.md)).
 *
 * ## What a leaf is
 *
 * Leaves are the JSON primitives, reached through objects and arrays alike:
 * `limits.maxTicks` rather than `limits`, `allowedGameVersions[0]` rather than
 * `allowedGameVersions`, `commands[1].payload.type` rather than `commands`.
 * That distinction is the whole point of nesting the walk -- a function that
 * keeps `limits` as an opaque blob is not what #264 found; a function that
 * keeps the object *shape* while dropping a field inside it is.
 *
 * An empty array or empty object has no leaves under it, so it is treated as a
 * leaf itself and perturbed by gaining an entry. Without that, a field that
 * happens to be empty in the fixture would be silently uncovered, which is the
 * quiet-gap failure this module exists to remove.
 *
 * `undefined` is not a JSON value and is not produced: every perturbation is a
 * `JsonValue`, so it can be fed to `canonicalJson`, `deterministicStateHash` or
 * a zod parse without a cast that hides a type error.
 *
 * ## What it is not
 *
 * It does not know any schema. A perturbed copy is *structurally* different,
 * not necessarily *valid*: appending to a 16-hex `configHash` makes a string
 * that no longer parses. Callers that push perturbations through a parsing
 * boundary must therefore partition rather than assume, and the challenge
 * tests do. Strings gain a `-x` suffix rather than an arbitrary character
 * precisely so that the common case -- an `identifierSchema` field -- stays
 * valid and does reach the far side of such a boundary.
 */
export type FieldPath = readonly (string | number)[];

/**
 * A readable rendering of a path, for failure messages and for de-duplicating
 * paths in a `Set`.
 *
 * It is deliberately not reversible: an object key containing a `.` -- such as
 * the metric id in `claimedMetrics` -- renders indistinguishably from nesting.
 * Navigation always uses the `FieldPath` array, never this string, so the
 * ambiguity costs nothing beyond how a failure reads.
 */
export function formatFieldPath(path: FieldPath): string {
  return path.map((segment) => String(segment)).join('.');
}

const isJsonObject = (value: JsonValue): value is { readonly [key: string]: JsonValue } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every leaf in `value`, in a stable order (object keys sorted, so the list
 * does not depend on how a fixture literal was typed).
 */
export function leafFieldPaths(value: JsonValue): readonly FieldPath[] {
  const paths: FieldPath[] = [];

  const walk = (node: JsonValue, prefix: FieldPath): void => {
    if (Array.isArray(node)) {
      // An empty array is a leaf: there is nothing under it to perturb, and
      // leaving it unvisited would leave the field uncovered.
      if (node.length === 0) {
        paths.push(prefix);
        return;
      }
      node.forEach((entry, index) => walk(entry, [...prefix, index]));
      return;
    }

    if (isJsonObject(node)) {
      const keys = Object.keys(node).sort();
      if (keys.length === 0) {
        paths.push(prefix);
        return;
      }
      for (const key of keys) walk(node[key]!, [...prefix, key]);
      return;
    }

    paths.push(prefix);
  };

  walk(value, []);
  return paths;
}

/**
 * A different value of the same JSON kind, so the perturbation changes the
 * document rather than its shape. Empty containers are the exception and gain
 * an entry, because that is the only way to change them at all.
 */
function perturbLeafValue(leaf: JsonValue): JsonValue {
  if (typeof leaf === 'string') return `${leaf}-x`;
  if (typeof leaf === 'number') return leaf + 1;
  if (typeof leaf === 'boolean') return !leaf;
  if (leaf === null) return 0;
  if (Array.isArray(leaf)) return [0];
  return { perturbed: 0 };
}

/** A copy of `value` with the leaf at `path` replaced by a different value. */
export function perturbField(value: JsonValue, path: FieldPath): JsonValue {
  if (path.length === 0) return perturbLeafValue(value);

  const [segment, ...rest] = path;

  if (Array.isArray(value)) {
    if (typeof segment !== 'number' || segment < 0 || segment >= value.length) {
      throw new Error(`Field path ${formatFieldPath(path)} does not address an element of this array.`);
    }
    const copy = [...value];
    copy[segment] = perturbField(value[segment]!, rest);
    return copy;
  }

  if (isJsonObject(value)) {
    if (typeof segment !== 'string' || !Object.hasOwn(value, segment)) {
      throw new Error(`Field path ${formatFieldPath(path)} does not address a key of this object.`);
    }
    return { ...value, [segment]: perturbField(value[segment]!, rest) };
  }

  throw new Error(`Field path ${formatFieldPath(path)} descends into a ${typeof value}, which has no fields.`);
}

export interface FieldPerturbation {
  readonly path: FieldPath;
  /** `formatFieldPath(path)`, carried so callers can report and key on it without re-deriving it. */
  readonly label: string;
  readonly perturbed: JsonValue;
}

/**
 * One perturbed copy of `value` per leaf. The list a field-sensitivity
 * assertion iterates: every entry must change the output of the function under
 * test, or that function is not a function of the whole document.
 */
export function fieldPerturbations(value: JsonValue): readonly FieldPerturbation[] {
  return leafFieldPaths(value).map((path) => ({
    path,
    label: formatFieldPath(path),
    perturbed: perturbField(value, path),
  }));
}
