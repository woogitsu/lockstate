import { describe, expect, it } from 'vitest';
import {
  PRISON_CONDITIONS,
  SIMULATION_PROTOCOL_VERSION,
  type PrisonCondition,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { PRISON_CONDITION_PRESENTATION, isPostUnreachable } from '../../src/ui/simulation-conditions';
import { reportedCounts } from '../helpers/hud-counts';

/**
 * The reader `statusCountsSchema.conditions` finally got, held to the two
 * claims the compiler cannot hold.
 *
 * ## Why this file exists
 *
 * Issue #930 filed `conditions` as computed, emitted, diffed and read by
 * nobody, and asked in its §7 for the assertion that would have caught it: a
 * **field-level** reachability check, with the surviving mutation stated as
 * *"delete the new renderer's call site and watch the new assertion go red"*.
 * The reader was built on 2026-09-17 for ADR 0117's fifth member
 * (`src/ui/simulation-conditions.ts`), and the mutation it names was still
 * uncovered at the unit level: the end-to-end proof lives in
 * `tests/integration/security-post-unreachable-condition.test.ts`, which
 * builds a prison, seals a guard post with four real `BuildWall` commands and
 * runs 1,500 ticks to get there. That is the right test and it is not the
 * cheap one, and it is not the one that speaks about the *table*.
 *
 * `tests/foundation/unconsumed-status-count-contract.test.ts` cannot speak
 * about it either, and says so in its own words: its floor is a **mention** of
 * a field's name anywhere under `src/ui/` or `src/main.ts`, comments included.
 * `conditions` cleared that floor for two days on a comment alone, and a table
 * built and never rendered would clear it too -- issue #930's own *"a gate
 * whose unit is an id cannot see an orphan inside an object that has a
 * reader"*, one level further in.
 *
 * ## The claim that is not bookkeeping
 *
 * `isPostUnreachable` answers `true` for **any** member the table files under
 * `'coverage-chip'`, and the sentence that boolean reaches a player through
 * names one member: `hud.security.post-unreachable`, *"a sector's post cannot
 * be reached"*. So a sixth `PrisonCondition` about guard coverage, filed under
 * the same presentation because the coverage chip is plainly where it belongs,
 * paints that sentence over a prison whose post is perfectly reachable --
 * with `tsc` green, because the value is a legal member of the union, and with
 * every other test green, because none of them publishes a condition other
 * than the one. `AGENTS.md`'s fourth reservation is about exactly that: a
 * sentence that reaches a player as a promise the code does not keep. The
 * wording of it is ours since 2026-09-04; its truth is not.
 *
 * ## Watched failing (`docs/AGENT_WORKFLOW.md` §3)
 *
 * Both mutations were run by hand on this tree, with this file untouched:
 *
 * 1. `'treasury.deliveries-refused'` flipped from `'painted-elsewhere'` to
 *    `'coverage-chip'` in `PRISON_CONDITION_PRESENTATION` -- a one-word edit
 *    that `tsc` accepts. `1 failed | 5 passed` here, and **the rest of
 *    `tests/unit`, `tests/integration` and `tests/foundation` stayed green**,
 *    which is the finding rather than a footnote: nothing else in the suite
 *    can see it.
 * 2. `postUnreachable: isPostUnreachable(counts.conditions)` deleted from
 *    `src/ui/simulation-counts.ts` -- the mutation #930 §7 names. `1 failed |
 *    5 passed` here.
 *
 * The outputs are quoted in the pull request that landed this file.
 */

const paintedElsewhere = PRISON_CONDITIONS.filter(
  (condition) => PRISON_CONDITION_PRESENTATION[condition] === 'painted-elsewhere',
);

/**
 * A `simulation/status-counts` publication naming exactly the conditions
 * given, and otherwise the ordinary figures of a prison in no particular
 * trouble.
 *
 * The counts below are the schema's required members and nothing turns on
 * their values -- what is measured is what `conditions` does to the row that
 * comes out, so every other figure is held still.
 */
function publicationNaming(conditions: readonly PrisonCondition[]): WorkerToMainMessage {
  return {
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: 'counts-conditions',
    kind: 'simulation/status-counts',
    payload: {
      tick: 1_234,
      schemaVersion: 1,
      counts: {
        prisoners: 4,
        prisonersInIntake: 0,
        prisonersHighRisk: 0,
        staff: 2,
        staffUnassigned: 0,
        rooms: 1,
        roomCapacity: 8,
        isFreshUnfurnishedPrison: false,
        accommodationCapacity: 8,
        roomOccupants: 4,
        occupiedPlaces: 4,
        prisonersCovered: 4,
        prisonersUnderstaffed: 0,
        prisonersUnguarded: 0,
        activeIncidents: 0,
        conditions,
      },
    },
  } as unknown as WorkerToMainMessage;
}

describe('the standing conditions have a reader, and it may only say what it means', () => {
  it('files exactly one member under the coverage chip, and it is the one the chip names', () => {
    const coverageChip = PRISON_CONDITIONS.filter(
      (condition) => PRISON_CONDITION_PRESENTATION[condition] === 'coverage-chip',
    );

    expect(
      coverageChip,
      "`isPostUnreachable` collapses every 'coverage-chip' member to one boolean, and the sentence that boolean paints -- hud.security.post-unreachable -- names `security.post-unreachable` alone. A second member here makes the COVERAGE chip assert that a sector's post cannot be reached about a prison where it can, which is AGENTS.md reservation 4. Give the new member its own presentation and its own sentence, or file it as 'painted-elsewhere' beside the surface that already speaks for it.",
    ).toEqual(['security.post-unreachable']);
  });

  it('declares a presentation for exactly the published vocabulary, in its canonical order', () => {
    expect(
      Object.keys(PRISON_CONDITION_PRESENTATION),
      'the table is the list of conditions a player may be told about; a member on the wire and not here has nobody deciding whether it is said',
    ).toEqual([...PRISON_CONDITIONS]);
  });

  it('answers false for a publication that named no condition at all', () => {
    // `conditions` is `.optional()` on the wire, so absence is the ordinary
    // case and not a malformed payload: a prison in no trouble publishes
    // nothing here, and the honest reading of that is "no post is stranded".
    expect(isPostUnreachable(undefined)).toBe(false);
    expect(isPostUnreachable([])).toBe(false);
  });

  it('answers false for every condition that is painted somewhere else, one at a time', () => {
    // One at a time rather than as a set: a reader that answered `true` for
    // any non-empty array would pass a set-shaped assertion that happened to
    // include the real member, and this is the shape that catches it.
    expect(paintedElsewhere.length, 'the four conditions ADR 0087 decision 2 shipped').toBeGreaterThan(0);
    for (const condition of paintedElsewhere) {
      expect(isPostUnreachable([condition]), `${condition} is painted elsewhere and must not reach the coverage chip`).toBe(
        false,
      );
    }
  });

  it('carries the one member all the way to the view model the status strip reads', () => {
    // The mutation issue #930 section 7 names, stated as an assertion: this
    // goes through the production translator (`hudCountsFromWorkerMessage`),
    // so deleting its `isPostUnreachable(counts.conditions)` call turns this
    // red rather than leaving the field an orphan again.
    expect(reportedCounts(publicationNaming(['security.post-unreachable'])).postUnreachable).toBe(true);
    expect(reportedCounts(publicationNaming([...paintedElsewhere])).postUnreachable).toBe(false);
    expect(reportedCounts(publicationNaming([])).postUnreachable).toBe(false);
  });
});
