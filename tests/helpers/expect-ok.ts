import { expect } from 'vitest';

/**
 * Assert that a discriminated `{ ok }` result succeeded, **and keep the reason
 * when it did not**.
 *
 * ### The failure this exists to stop being opaque
 *
 * `expect((await controller.createPrison('prison')).ok).toBe(true)` is a
 * precondition written as a bare boolean, and its failure message is
 * `expected false to be true`. That is the whole record. On 2026-09-08 exactly
 * that line -- `tests/integration/session-master-seed-variety.test.ts:96` --
 * went red once in CI and nowhere else: green on the base commit, green on a
 * sibling branch eight minutes earlier, and green in twenty consecutive local
 * runs of the file plus four whole-suite runs. What it did *not* leave behind
 * was the one thing that would have made it diagnosable, because the `.ok`
 * threw it away: `SaveResult`'s false arm carries a `SaveWriteError`, which
 * distinguishes `quota-exceeded` from `transaction-aborted` from
 * `unknown-error` **and carries the message the refusal was written with**.
 * `PrisonSaveRepository.writeGeneration` has three separate refusal arms and
 * the log could not say which one fired.
 *
 * So the reader had to reason from the shape of the code to three candidates
 * and could rule out only one of them. The next occurrence would have cost the
 * same, which is what makes this a defect in the test rather than a
 * preference about style.
 *
 * ### Why it asserts on the whole result rather than on `ok`
 *
 * The pass condition is **identical** -- `ok === true` and nothing else -- so
 * nothing here is loosened. What changes is what vitest prints when it does
 * not hold: the received value is the result object, so the `error` (or
 * `reason`, for the result types that carry one) is in the failure message
 * beside the label the caller gave. `expected undefined, received { ok: false,
 * error: { code: 'quota-exceeded', message: ... } }` is a bug report;
 * `expected false to be true` is a puzzle.
 *
 * ### Why it narrows
 *
 * The `asserts` signature means a caller that goes on to read `generationId`
 * or `envelope` needs no second check and no `!`, which is the other half of
 * why the bare-boolean form spread: narrowing by hand was more typing than
 * asserting the boolean.
 *
 * Deliberately **not** a matcher and deliberately not clever: it takes the
 * result and a noun phrase, and the noun phrase is what a reader who has never
 * seen this file needs first ("the second controller's prison", not
 * "createPrison").
 */
export function expectOk<T extends { readonly ok: boolean }>(
  result: T,
  what: string,
): asserts result is T & { readonly ok: true } {
  expect(result.ok ? undefined : result, `${what} did not succeed`).toBeUndefined();
}

/*
 * **There is deliberately no `expectNotOk`.** The symmetric helper was written
 * first and then deleted unused, which is the shape this repository's
 * composition-root gate exists to catch: a seam joined to nothing. It is also
 * not needed, and that is the more useful half of the reason. A test asserting
 * a *refusal* almost always goes on to say which refusal --
 * `expect(result.error.code).toBe('quota-exceeded')` and the like -- so the
 * false arm is already read rather than discarded, and `expect(x.ok).toBe(false)`
 * loses nothing a reader wanted. Twelve such sites were counted in the
 * persistence family on 2026-09-08 and every one of them reads its error. Add
 * the helper when a caller needs it, not before.
 */
