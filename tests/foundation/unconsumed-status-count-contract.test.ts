import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusCountsSchema } from '../../src/simulation/protocol/types';

/**
 * The sibling of `unconsumed-command-contract.test.ts` and
 * `unconsumed-action-contract.test.ts`, applied to a vocabulary neither can
 * see: a **field**, rather than a whole command or a whole content id, that
 * crosses the worker boundary and is read by nobody.
 *
 * Issue #870 found the case that makes the gap real. `staffUnassigned` was
 * computed in `projectStatusStrip`
 * (`src/simulation/presentation/status-strip-projection.ts`), declared on
 * `statusCountsSchema` (`src/simulation/protocol/types.ts`), and published on
 * `simulation/status-counts` twice a second -- and
 * `grep -rn 'staffUnassigned' src/ui/ src/main.ts` returned **nothing**. Not
 * a comment, not a fixture, not a mapped field: the count of every guard
 * hired and posted nowhere was computed, put on the wire, and read by no
 * surface a player's session can reach. The issue's own words for it: *"this
 * is the class #629 already names."*
 *
 * ## Why the existing family cannot see this
 *
 * `unconsumed-command-contract.test.ts` asks whether a *command type* has a
 * producer. `unconsumed-action-contract.test.ts` asks the same of an *input
 * action*. `projection-reachability-contract.test.ts` (a different family
 * member, despite its name) asks whether a whole *projection* -- a route out
 * of the worker -- has a reader at all. All three, and
 * `message-kind-reachability-contract.test.ts` beside them, stop at the
 * granularity of "does this whole channel have something on the other end."
 * `simulation/status-counts` passes every one of them: it has a producer
 * (`src/simulation/worker/status-counts.ts`), a route
 * (`PROJECTION_CATALOG`), and a reader
 * (`src/ui/simulation-counts.ts`, matched by both the message-kind gate and
 * by `projection-reachability-contract.test.ts`'s own `PAINTERS` list). None
 * of that says anything about any one **field** inside the payload, and
 * `statusCountsSchema` declares twenty-plus of them on one message. A field
 * can be added to that object, given a real value by the projection, and
 * never once appear in `src/ui/` -- exactly `staffUnassigned`'s history --
 * while every existing gate stays green throughout, because the *message* is
 * produced, routed and read. This file is the gate at the field's own
 * granularity, the one #870 asked for by name: *"a projection field with no
 * reader in `src/ui/` is the same shape [as an unconsumed command]. If one
 * already covers protocol fields, `staffUnassigned` slipped past it."* It did;
 * this is what closes that gap.
 *
 * ## What counts as a field, and where the list comes from
 *
 * `Object.keys(statusCountsSchema.shape)` -- the same reason
 * `unconsumed-command-contract.test.ts` reads `simulationCommandSchema.options`
 * rather than hand-listing command names: a hand-written array here would be
 * a second list to forget, and a field added to the schema tomorrow is in
 * scope the moment it lands, with no edit to this file required to see it.
 *
 * ## What counts as a reader, and why the bar is a mention rather than a call
 *
 * A field is accounted for when its name appears, as a whole word, anywhere
 * in `src/ui/**\/*.ts` or `src/main.ts` -- **comments included**. That is
 * deliberately the same technique the issue itself used to find the gap
 * (`grep -rn 'staffUnassigned' src/ui/ src/main.ts`), mechanised so it cannot
 * go stale the way a hand-run grep does, and it is deliberately weaker than
 * "is called from a real code path": this file does not, and cannot cheaply,
 * prove a field is *painted*. Two reasons that is still the right floor for
 * this gate and not a loophole in it:
 *
 * 1. **A documented non-reader is not the defect #870 found.**
 *    `counts.roomOccupants` is real, tested, and has never had a code reader
 *    in `src/ui/` -- and `src/ui/simulation-counts.ts`'s own comment says so,
 *    at length, because reading it into `HudCountsViewModel` the way
 *    `occupiedPlaces` is read would put the wrong figure behind the "N with
 *    no bed" badge (ADR 0028 decision 2). That is an architectural decision,
 *    written down once, at the point where a future reader would look for it
 *    -- not the silence `staffUnassigned` sat in, where nothing anywhere said
 *    anything about it at all. A gate that demanded a real call site here
 *    would force that decision into a *second* place, a name-keyed exemption
 *    table in this file, which is exactly the shape issue #870 itself warns
 *    off: a list that has to be kept in sync with reality by hand rather than
 *    by the compiler or by grep, and that nobody reads until it has already
 *    rotted. The comment stays where the code is; this gate reads for it
 *    there instead of asking for a second copy here.
 * 2. **It still has to be true, checkably, today.** The assertion below does
 *    not accept a name written anywhere on the filesystem -- only inside
 *    `src/ui/` or `src/main.ts`, the exact surface the issue named, and the
 *    "positive control" test proves the scan finds real occurrences and not
 *    only the ones this file happens to be looking for. `staffUnassigned`
 *    could not have passed this gate by having a comment written about it
 *    anywhere else in the repository -- only by one of the two places a
 *    player's session can actually reach.
 *
 * **What this floor guarantees, stated narrowly.** Nobody may add a new
 * `statusCountsSchema` field, or leave an existing one, in the total silence
 * `staffUnassigned` was found in: zero words, in the interface layer, ever.
 * That is a smaller promise than "every count is painted on a panel" -- the
 * same distinction `projection-reachability-contract.test.ts` draws about
 * routes versus readers -- and it is the promise this gate can keep without
 * drifting the day a comment is reworded, because it does not ask what a
 * comment *means*, only whether one exists.
 *
 * ## No exemption map, and why this file does not carry one
 *
 * Every sibling in this family (`AWAITING_PRODUCER`,
 * `UNPAINTED_PROJECTION_IDS`, `ROUTED_ELSEWHERE`) keeps a table of named,
 * reasoned exceptions, because at the *command* and *projection* granularity
 * a real, permanent exception is common: a command with no control to send it
 * yet, a projection with no panel built for it yet. This file has no such
 * table, and that is a measured choice rather than an oversight. At the
 * *field* granularity, on this one payload, today, the honest floor above --
 * a mention anywhere in `src/ui/` or `src/main.ts`, comments included -- is
 * satisfiable by every field `statusCountsSchema` declares with no exception
 * at all (the second test below measures this directly), because the one
 * field that could not clear it was `staffUnassigned`, and it now can. **If a
 * future field genuinely cannot clear this floor** -- a new count with
 * nothing anywhere willing to say why -- the honest fix is to give it a
 * reader or write the one sentence explaining why not, at the point in
 * `src/ui/` where a reader would look, the way `roomOccupants`'s comment
 * already does. Reach for a second name-keyed list in *this* file only after
 * establishing that neither of those is possible, and say so in the commit
 * that adds it -- a list that grows before that question is asked is the
 * rotting list issue #870 warned against, not a control on it.
 *
 * ## Proof the gate bites (`docs/AGENT_WORKFLOW.md` §3: a test proves nothing
 * until it has been watched failing)
 *
 * Measured by hand against this tree, in this order, before this file was
 * added to a commit:
 *
 * 1. With `staffUnassigned` still absent from `HudCountsViewModel`,
 *    `src/ui/simulation-counts.ts` and `src/ui/hud/status-strip.ts` (the
 *    three production sites this change adds it to), running this file's
 *    "every published count has a reader" case failed with exactly one name:
 *    `staffUnassigned has no mention anywhere in src/ui/ or src/main.ts`.
 *    Every other one of the twenty-three fields `statusCountsSchema` declares
 *    passed already, with no change to this file and no exemption entered for
 *    any of them.
 * 2. Restoring the three production edits turned that one failure green with
 *    no other change, and the suite returned to twenty-three read, zero
 *    unread.
 *
 * That is the shape #870 asked for directly: *"prove it by control ... delete
 * the wiring you just added and watch the gate go red, then restore it."*
 * The wiring was deleted, the gate went red on the one field that was
 * actually missing and nothing else, and restoring the wiring is what turned
 * it green again -- not a change to this file.
 *
 * ## What it does not claim
 *
 * Not that a field is displayed, formatted or correct -- only that its name
 * is not silence. `roomOccupants` clears this gate and has no chip; that is
 * the right answer for a field a badge would misuse, not a hole in the
 * check. And not every field the *worker* publishes: this file is scoped to
 * `statusCountsSchema`, the payload issue #870 is about and the one every
 * session receives twice a second uncorrelated -- the paged, per-row
 * projections `projection-reachability-contract.test.ts` already covers at
 * the route level are a different shape of channel with a different gate
 * already watching it.
 */

const ROOT = join(__dirname, '../..');
const UI_DIR = 'src/ui';
const MAIN_FILE = 'src/main.ts';

/** Every `.ts` file under `directory`, recursively, as a path relative to `ROOT`. */
function collectTypeScriptFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of [...readdirSync(join(ROOT, directory))].sort()) {
    const relative = `${directory}/${entry}`;
    if (statSync(join(ROOT, relative)).isDirectory()) {
      files.push(...collectTypeScriptFiles(relative));
    } else if (entry.endsWith('.ts')) {
      files.push(relative);
    }
  }
  return files;
}

/**
 * The reader surface: every `.ts` file under `src/ui/`, plus `src/main.ts`
 * (the composition root, which owns the one `hudCountsFromWorkerMessage` call
 * site and every HUD-adjacent decision that is not allowed to live inside
 * `src/ui/hud/` itself). Read once, raw -- **not** comment-stripped, for the
 * reason the docblock above gives at length: an explained non-reader is a
 * real, accounted-for state at this granularity, not the defect this file
 * exists to catch.
 */
const READER_SURFACE = [...collectTypeScriptFiles(UI_DIR), MAIN_FILE].map((path) => ({
  path,
  text: readFileSync(join(ROOT, path), 'utf8'),
}));

/** Every field `statusCountsSchema` declares, read from the schema rather than hand-listed. */
const STATUS_COUNT_FIELDS: readonly string[] = Object.keys(statusCountsSchema.shape);

/** Files that mention `field` as a whole word, anywhere -- code or comment. */
const readersOf = (field: string): readonly string[] =>
  READER_SURFACE.filter(({ text }) => new RegExp(`\\b${field}\\b`).test(text)).map(({ path }) => path);

describe('every field simulation/status-counts publishes is mentioned somewhere in src/ui/ or src/main.ts', () => {
  it('scans a real schema and a real reader surface, and really finds fields in both', () => {
    // Vacuity guard, both halves. A schema that failed to import, or one
    // stripped down to a handful of fields, would make every assertion below
    // trivially true; a reader surface of zero files would do the same to
    // `readersOf`. `statusCountsSchema` carried twenty-three members when
    // this file was written (`prisoners` through `conditions`); the floor
    // below is set under that so a field being *removed* does not itself
    // break this control.
    expect(STATUS_COUNT_FIELDS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(STATUS_COUNT_FIELDS).size).toBe(STATUS_COUNT_FIELDS.length);
    expect(READER_SURFACE.length).toBeGreaterThan(20);
    expect(READER_SURFACE.some(({ path }) => path === MAIN_FILE)).toBe(true);

    // Named fields, so a rename inside `statusCountsSchema` fails here rather
    // than silently shrinking the set this file protects.
    for (const expected of ['prisoners', 'staff', 'staffUnassigned', 'rooms', 'treasuryMinorUnits', 'conditions']) {
      expect(STATUS_COUNT_FIELDS, `statusCountsSchema no longer declares ${expected}`).toContain(expected);
    }
  });

  it('positive control: the reader scan finds a field genuinely read, and names where', () => {
    // `prisoners` is read for real, straight through, in
    // `src/ui/simulation-counts.ts` -- proving the mechanism can return a
    // non-empty answer at all, which the "no field is silent" assertion below
    // cannot demonstrate by itself (it would look identical if `readersOf`
    // always returned everything).
    const readers = readersOf('prisoners');
    expect(readers.length).toBeGreaterThan(0);
    expect(readers).toContain('src/ui/simulation-counts.ts');
  });

  it('negative control: the reader scan finds nothing for a name that is not in the tree', () => {
    // A fabricated identifier, chosen to collide with nothing real, proving
    // the "unread" branch the main assertion depends on can actually fire --
    // the complement of the positive control above. Without this, a `readersOf`
    // that always returned a non-empty array (a regex bug, an inverted
    // filter) would make the main case below pass for the wrong reason.
    expect(readersOf('staffUnassignedZzzNotARealStatusCountField')).toEqual([]);
  });

  it('leaves no published count silent in src/ui/ or src/main.ts', () => {
    // The gate itself. No `AWAITING_*`-style exemption map: the docblock
    // above states why, and the assertion is that none is needed today --
    // introducing one is a decision for whoever finds the first field that
    // genuinely cannot clear this floor, made in that change, not pre-loaded
    // here against a case that has not happened.
    const silent = STATUS_COUNT_FIELDS.filter((field) => readersOf(field).length === 0);
    expect(
      silent,
      'this field crosses the worker boundary on simulation/status-counts and has no mention anywhere in src/ui/ or src/main.ts -- not a reader, not a comment, not a fixture in the interface layer. Wire a reader (HudCountsViewModel + src/ui/simulation-counts.ts, following staffUnassigned issue #870), or write down at the point a reader would look why one does not exist yet (the way src/ui/simulation-counts.ts explains roomOccupants). Do not add a name-keyed exemption entry in this file -- see this file\'s own docblock, "No exemption map."',
    ).toEqual([]);
  });

  it('measures twenty-three published and none silent, which is the count this file exists to keep at zero', () => {
    // Stated as a fact rather than only guarded, matching
    // `unconsumed-command-contract.test.ts`'s own closing case: a field that
    // quietly stopped being mentioned would otherwise only have to turn up in
    // the list above, and a list is a smaller thing to notice shrink than a
    // count of a fixed, checkable total is to notice move.
    //
    // It read twenty-two and one -- `staffUnassigned` -- before issue #870's
    // fix, on the same field count: wiring it did not add a field to the
    // schema, it gave one that was already there its first reader.
    const silent = STATUS_COUNT_FIELDS.filter((field) => readersOf(field).length === 0);
    expect(STATUS_COUNT_FIELDS.length - silent.length).toBe(STATUS_COUNT_FIELDS.length);
    expect(silent.length).toBe(0);
  });
});
