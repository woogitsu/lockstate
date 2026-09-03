import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * The gate on ADR 0007's deferred-status decision, in both directions.
 *
 * ## What was decided, and what was deleted
 *
 * ADR 0007's "Cancellation and deferred status are explicit, not implicit"
 * section decides two things: `cancel(id)` is a no-op on an id that is
 * unknown or already resolved, and a request's status is *"simply 'in the
 * queue' or 'resolved'"* -- no deferred event stream, no third state machine.
 * It then names the mechanism:
 *
 * > `getPending(id)`/`pendingIds()` expose enqueue tick (hence age) and
 * > queue depth directly
 *
 * That sentence was written before any real entity model existed. When six of
 * them arrived, none of them read either accessor. #177 measured it: zero
 * callers in `src/`, and -- before #251 -- zero tests, so both were free to
 * return nothing with the entire suite green.
 *
 * The 2026-08-25 amendment to that ADR deleted both and recorded why the
 * decision is nonetheless satisfied. This file is the check that keeps those
 * two facts attached to each other.
 *
 * ## Why a source scan and not a type error
 *
 * `tsc` fails on a *call* to a method that does not exist. It says nothing
 * about re-adding the method, which is the direction that matters: an
 * accessor re-added with no caller is exactly the state #177 was filed about,
 * and it type-checks perfectly. Only a scan for the declaration catches that.
 *
 * ## What it does not claim
 *
 * It matches names textually, so an accessor re-added under a different name
 * (`peekPending`, `queuedIds`) passes. That is honest rather than
 * comprehensive: the deleted pair is what the ADR names and what a revert
 * would restore, and a differently-named accessor is a new decision that
 * should reach a reviewer as new code rather than as a restored line. The
 * positive controls below fail loudly if the scan ever stops reading real
 * files, which is the failure mode that would make the rest vacuous.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SOURCE_ROOT = join(REPOSITORY_ROOT, 'src');
const ADR_PATH = join(REPOSITORY_ROOT, 'docs/adr/0007-navigation-work-budgets-and-flow-fields.md');

/** The two accessors ADR 0007 named and its amendment removed. */
const REMOVED_ACCESSORS = ['getPending', 'pendingIds'] as const;

/**
 * The sentence in the accepted Decision that the amendment amends.
 *
 * Asserted present, not absent. An ADR is a historical record: the fix for a
 * decision the code outgrew is an amendment underneath it, never a quiet edit
 * of the paragraph that was accepted. Anyone rewriting this sentence to match
 * the current tree would erase the fact that a decision changed at all, and
 * that is the drift this repository keeps finding.
 */
const ORIGINAL_DECISION_SENTENCE =
  '`getPending(id)`/`pendingIds()` expose enqueue tick (hence\nage) and queue depth directly; there is no separate "deferred" event\nstream; a request\'s status is simply "in the queue" or "resolved,"';

/** The amendment heading, in the form `docs/adr/0006-…` established. */
const AMENDMENT_HEADING = '## Amendment, 2026-08-25:';

/**
 * The production callers of `NavigationSystem.requestRoute`, which ADR
 * 0007's own Context section enumerates.
 *
 * They are the reason the deletion is safe: each holds the single request id
 * it is waiting on and reads `getResult(id) === undefined` as "still in the
 * queue". That *is* the ADR's two-state contract, wired. If this list ever
 * disagrees with the tree, the amendment's central claim has stopped being
 * true and the deletion needs revisiting -- which is why the disagreement is
 * a failure here rather than a comment somewhere.
 *
 * **There were six and there are five, because one of them was deleted rather
 * than because one stopped reading the two-state status.**
 * `operations/job-system.ts` -- **a file that no longer exists** -- held this
 * list's third entry and requested a route for each of a carry's two legs;
 * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 3 gives both
 * legs to `prisoners.actions`, which is the fourth entry and is still here. So
 * the amendment's claim is *narrower in surface and unchanged in substance*:
 * one fewer module asks for a route, and no module asks in a new way. That is
 * the direction this gate exists to distinguish -- a consumer leaving is
 * different from a consumer changing its mind, and only the second would put
 * the deleted accessors back in question.
 */
const TWO_STATE_CONSUMERS: readonly string[] = [
  'src/simulation/contraband/search-system.ts',
  'src/simulation/incidents/response-system.ts',
  'src/simulation/prisoners/action-system.ts',
  'src/simulation/security/deployment-system.ts',
  'src/simulation/security/patrol-system.ts',
];

/**
 * The three restore paths that close the one case where "in the queue" could
 * have been ambiguous.
 *
 * A snapshot restored into a freshly built `NavigationSystem` leaves a
 * consumer holding an id the new queue never received. `getPending(id)` is
 * precisely the accessor that would diagnose it; instead each of these clears
 * the stale id on load and re-requests. That is the amendment's strongest
 * argument, so it is pinned: if a fourth consumer appears without doing this,
 * or one of these stops, the argument is no longer sound.
 */
const STALE_ID_CLEARING_RESTORES: readonly string[] = [
  'src/simulation/operations/job.ts',
  'src/simulation/prisoners/components.ts',
  'src/simulation/security/guard-roster.ts',
];

interface ScannedSource {
  readonly where: string;
  /**
   * Comments stripped, and that is load-bearing rather than tidy: the queue's
   * own module, the ADR-facing tests and this repository's prose all name the
   * deleted accessors in sentences explaining that they are gone. An
   * unstripped scan would report them present, cited by the comments saying
   * they are not.
   */
  readonly text: string;
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
      continue;
    }
    if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

const sources: readonly ScannedSource[] = collectTypeScriptFiles(SOURCE_ROOT).map((path) => ({
  where: relative(REPOSITORY_ROOT, path).split('\\').join('/'),
  text: stripComments(readFileSync(path, 'utf8')),
}));

const sourceAt = (where: string): ScannedSource => {
  const found = sources.find((source) => source.where === where);
  expect(found, `${where} is not where this gate looks for it; the module moved and this list needs updating`).toBeDefined();
  return found!;
};

/** The bare name as an identifier -- a declaration, a call or a re-export all match. */
const mentionsOf = (name: string): readonly string[] =>
  sources.filter((source) => new RegExp(`\\b${name}\\b`).test(source.text)).map((source) => source.where);

const adrBody = readFileSync(ADR_PATH, 'utf8');

describe('ADR 0007 deferred status: the accessors are gone and the decision is still kept', () => {
  it('scans a real source tree, and finds the accessors that do exist there', () => {
    // The vacuity guard, and the second half is the one that matters: a
    // pattern that matched nothing, or a stripper that blanked every file,
    // would make the absence assertions below pass for the wrong reason.
    // `size` and `getMetrics` are the queue accessors that survived, so they
    // are the positive control for a scan that can still see a method.
    expect(sources.length).toBeGreaterThan(50);
    expect(mentionsOf('getMetrics')).toContain('src/simulation/navigation/path-request-queue.ts');
    expect(mentionsOf('processTick')).toContain('src/simulation/navigation/path-request-queue.ts');
    expect(mentionsOf('requestRoute')).toContain('src/simulation/navigation/navigation-system.ts');
  });

  it('holds no declaration of and no reference to either deleted accessor anywhere in src/', () => {
    // The regression this file exists for. A re-added accessor type-checks
    // and, with no caller, breaks nothing -- so nothing else in the suite
    // fails, which is exactly how it got here the first time.
    for (const accessor of REMOVED_ACCESSORS) {
      expect(
        mentionsOf(accessor),
        `\`${accessor}\` is back in src/. ADR 0007's 2026-08-25 amendment removed it because the decision it served -- "a request's status is simply 'in the queue' or 'resolved'" -- is answered by NavigationSystem.getResult(id) and PathRequestQueue.size(). Re-adding it re-decides that: amend the ADR again, in the same change, and say what reads it.`,
      ).toEqual([]);
    }
  });

  it('strips comments, so prose about the removal is not read as the removal being undone', () => {
    // The control on the control. The queue module and this very file discuss
    // both accessors by name; if `stripComments` stopped working, the
    // assertion above would fail with a diagnosis pointing at documentation.
    const queueRaw = readFileSync(join(SOURCE_ROOT, 'simulation/navigation/path-request-queue.ts'), 'utf8');
    expect(queueRaw).toContain('getPending(id)');
    expect(sourceAt('src/simulation/navigation/path-request-queue.ts').text).not.toContain('getPending');
  });

  it('keeps the sentence the amendment amends, verbatim, in the accepted Decision', () => {
    // An ADR records what was decided. Editing the original paragraph to
    // match today's code would hide that a decision ever changed, which is
    // the failure mode this whole issue is about one level up.
    expect(
      adrBody,
      'ADR 0007\'s original deferred-status sentence has been edited or removed. Amend an ADR underneath; never rewrite what was accepted.',
    ).toContain(ORIGINAL_DECISION_SENTENCE);
  });

  it('carries the dated amendment that accounts for the deletion, naming both accessors', () => {
    // The other direction, and what makes the pair a gate rather than two
    // separate notes: the API is absent *because* the ADR says so, so
    // deleting the explanation fails just as re-adding the API does.
    const amendmentIndex = adrBody.indexOf(AMENDMENT_HEADING);
    expect(amendmentIndex, `ADR 0007 must carry a "${AMENDMENT_HEADING}" section recording why the two accessors were removed`).toBeGreaterThan(-1);

    const amendment = adrBody.slice(amendmentIndex);
    for (const accessor of REMOVED_ACCESSORS) {
      expect(amendment, `the amendment must name \`${accessor}\` as removed`).toContain(accessor);
    }
    // It has to argue, not merely announce: the decision the accessors served
    // is kept, and the amendment is where a reader finds out how.
    expect(amendment).toContain('NavigationSystem.getResult(id)');
    expect(amendment).toContain('size()');
    expect(amendment.length).toBeGreaterThan(1_000);
  });

  it('keeps the ADR itself Accepted, because an amended decision is still the decision', () => {
    // A removal that quietly downgraded the ADR's status would make the
    // amendment read as a retraction of the whole thing. Only the mechanism
    // sentence changed.
    expect(/^## Status\n+Accepted\b/m.test(adrBody)).toBe(true);
  });

  it('still reads the two-state status through getResult in every one of the six consumers the ADR names', () => {
    // The consumer-path half. This is what replaced the accessors, so if it
    // stops being true the deletion loses its justification -- and a consumer
    // that invented its own deferred-tracking side channel would be the third
    // state machine the ADR refused, arriving by the back door.
    for (const where of TWO_STATE_CONSUMERS) {
      const consumer = sourceAt(where);
      expect(consumer.text, `${where} no longer requests a route`).toMatch(/\bnavigation\.requestRoute\(/);
      expect(consumer.text, `${where} no longer reads its request's status through getResult`).toMatch(/\bnavigation\.getResult\(/);
      expect(consumer.text, `${where} no longer treats an absent result as "still in the queue"`).toMatch(
        /getResult\([^)]*\)[\s\S]{0,120}?===\s*undefined|outcome\s*===\s*undefined/,
      );
    }
  });

  it('clears a stale request id on restore instead of asking the queue about it', () => {
    // The amendment's strongest claim, pinned. `getPending(id)` would have
    // diagnosed a consumer holding an id a freshly constructed queue never
    // received; these three prevent the situation instead.
    //
    // Scoped to the `loadSnapshot` body rather than the whole file, and that
    // is not tidiness: `guard-roster.ts` declares
    // `setPathRequestId(entityId, requestId: string | undefined)` above it, so
    // a whole-file search for "the id being set to undefined" matches the
    // *setter's signature* and passes even when the restore path stops
    // clearing anything. Measured -- with the clearing line neutered, the
    // unscoped form of this assertion stayed green.
    for (const where of STALE_ID_CLEARING_RESTORES) {
      const restore = sourceAt(where);
      const definition = restore.text.indexOf('loadSnapshot(');
      expect(definition, `${where} no longer has a loadSnapshot`).toBeGreaterThan(-1);
      expect(restore.text.slice(definition), `${where}'s loadSnapshot no longer clears its stale path request id`).toMatch(
        /(pathRequestId\s*=\s*undefined|currentActionPathRequestId\.clear\(\))/,
      );
    }
  });

  it('exposes queue depth and the resolved age, which is what the ADR asked the accessors for', () => {
    // "queue depth directly" and "enqueue tick (hence age)" -- the two things
    // the deleted pair reported. Depth survived on the queue and on the
    // system; age survived as `waitedTicks` on the resolved payload, computed
    // from the enqueue tick the queue still records.
    const queue = sourceAt('src/simulation/navigation/path-request-queue.ts');
    expect(queue.text).toMatch(/public size\(\): number/);
    expect(queue.text).toMatch(/waitedTicks: params\.tick - entry\.enqueuedAtTick/);

    const system = sourceAt('src/simulation/navigation/navigation-system.ts');
    expect(system.text).toMatch(/public pendingCount\(\): number/);
    expect(system.text).toMatch(/public getResult\(/);
  });
});
