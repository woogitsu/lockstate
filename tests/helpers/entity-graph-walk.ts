/**
 * **Where an entity id is still mentioned in a session's object graph.**
 *
 * Extracted from `tests/unit/prisoner-release-completeness.test.ts` (ADR 0050)
 * when issue #533 gave the staff roster a departure path of its own and needed
 * the identical gate. It is shared rather than copied for the reason the
 * repository states as a rule -- fix the class, not the instance -- and because
 * the two copies would have drifted at the first container family either of
 * them learned about: a `WeakRef`, a nested typed array, a `Map` keyed by a
 * boxed id. One walk, two departures, one place to teach.
 *
 * `Hit` is a path string rather than a structured location on purpose: it is
 * read by a human staring at a failing assertion, and the whole value of this
 * gate is that a store nobody told it about **names its own path** when it
 * leaks.
 */

/** One place in the graph at which the target id appears, as a readable path. */
export type Hit = string;

/**
 * Every path in `root`'s object graph at which `target` appears, as a `Map`
 * key, a `Set` member, an array element or a numeric property.
 *
 * Deliberately blunt. It descends into plain objects, arrays, `Map`s and
 * `Set`s, and it does **not** know what any of them are for -- which is the
 * only way it can notice a store nobody told it about. Typed arrays are the one
 * family it skips, and they are skipped because they are index-keyed rather
 * than id-keyed: `PrisonerRecordComponent`'s six arrays are reset when an index
 * is *allocated* (the #111 fix) and deliberately not on release, so a residual
 * value in a freed slot is the documented behaviour rather than a leak. They
 * also cannot hold an `EntityId` above `0xffff` in a `Uint8Array` at all.
 */
export function pathsMentioning(root: object, target: number): readonly Hit[] {
  const hits: Hit[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 10 || node === null || typeof node !== 'object') return;
    if (ArrayBuffer.isView(node)) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (node instanceof Map) {
      for (const [key, value] of node) {
        if (key === target) hits.push(`${path}{key ${String(key)}}`);
        if (value === target) hits.push(`${path}{value at ${String(key)}}`);
        walk(value, `${path}.get(${String(key)})`, depth + 1);
      }
      return;
    }

    if (node instanceof Set) {
      for (const member of node) {
        if (member === target) hits.push(`${path}{member}`);
        else walk(member, `${path}<member>`, depth + 1);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((element, index) => {
        if (element === target) hits.push(`${path}[${index}]`);
        else walk(element, `${path}[${index}]`, depth + 1);
      });
      return;
    }

    // Sorted rather than in insertion order, so the path a store is reported
    // at is a function of the graph and not of construction order: the first
    // route to a shared object wins, and `seen` blocks the rest.
    for (const [key, value] of Object.entries(node).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (typeof value === 'function') continue;
      if (value === target) hits.push(`${path}.${key}`);
      else walk(value, `${path}.${key}`, depth + 1);
    }
  };

  walk(root, '', 0);
  return hits.sort();
}
