import { CLASSIFICATION_GROUP_IDS } from './components';
import {
  ACTION_CATEGORIES,
  DEFAULT_REGIME_SCHEDULES,
  assertGaplessSchedule,
  type ActionCategory,
  type RegimeBlock,
  type RegimeSchedule,
} from './regime';

/**
 * The session's own timetables, and the one thing in the prison that a
 * `EditRegimeBlock` command may rewrite
 * ([ADR 0113](../../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)).
 *
 * ## Why this exists at all, when `ActionSystem` already held an array
 *
 * It held a **build-time constant**. `DEFAULT_REGIME_SCHEDULES` (`regime.ts`)
 * is two hardcoded schedules asserted gapless at module load, no production
 * call site has ever supplied another value, and `grep -rn "regimeSchedules"
 * src/persistence/` was empty -- a regime was not in the save at all. ADR 0113
 * moves it into the save, and `ActionSystem`'s own docblock says exactly why
 * that is the precondition for making it writable:
 *
 * > A setter makes the live array mutable state that no snapshot carries, so a
 * > save taken mid-riot would come back on the base timetable with the
 * > incident still open
 *
 * That objection is answered by `getSnapshot`/`loadSnapshot` below and by the
 * V6 `simulation.regimeSchedules` section, not by ignoring it. The override
 * mechanism the same docblock protects (`PrisonerRegimeOverrideResolver`, ADR
 * 0057) is untouched: an override still replaces a prisoner's day at the point
 * of use and is still never written here.
 *
 * ## Canonical order, and why it is an array rather than a `Map`
 *
 * `docs/DETERMINISM.md`'s "Canonical iteration order" rule binds every
 * `Map`/`Set` enumeration under `src/simulation/`, and
 * `tests/determinism/canonical-iteration-contract.test.ts` enforces it
 * statically. A `Map<string, RegimeSchedule>` here would have needed an
 * allow-list entry; an array kept in a canonical order needs none, and the
 * order is then a property of the data rather than of the history of writes
 * that produced it.
 *
 * The canonical order is `CLASSIFICATION_GROUP_IDS` declaration order
 * (`components.ts`), which is the order every other group-keyed structure in
 * the codebase already uses -- `classificationGroupIndex` literally indexes
 * into it. Ids outside that closed catalogue sort after the known ones, by
 * code-unit comparison rather than `localeCompare` (which the ambient
 * nondeterminism contract forbids in this tree, correctly: ICU collation is
 * environment state). That second clause exists for fixtures and for the
 * unknown-group refusal path, not because production has such an id.
 *
 * The order matters because it reaches the save: `captureSessionSystems`
 * writes `getSnapshot()` straight into `payload.simulation.regimeSchedules`
 * and `computeSaveChecksum` hashes it. An insertion-ordered array would make a
 * save's checksum depend on the sequence of edits that produced it, which is
 * precisely the failure `#177` extended the static scanner to `src/persistence/`
 * for.
 */
export type EditRegimeBlockRefusalReason = 'unknown-group' | 'unknown-block';

export type EditRegimeBlockOutcome =
  | { readonly kind: 'applied'; readonly schedule: RegimeSchedule }
  | { readonly kind: 'refused'; readonly reason: EditRegimeBlockRefusalReason };

/** The persisted row shape. Structurally `RegimeSchedule`, named separately so the save boundary owns its own type. */
export interface EncodedRegimeBlock {
  readonly startTickOfDay: number;
  readonly endTickOfDay: number;
  readonly allowedCategories: readonly ActionCategory[];
}

export interface EncodedRegimeSchedule {
  readonly classificationGroupId: string;
  readonly blocks: readonly EncodedRegimeBlock[];
}

function catalogueRank(classificationGroupId: string): number {
  const index = CLASSIFICATION_GROUP_IDS.indexOf(classificationGroupId as (typeof CLASSIFICATION_GROUP_IDS)[number]);
  return index === -1 ? CLASSIFICATION_GROUP_IDS.length : index;
}

/**
 * The canonical order described in this module's docblock, as a pure function
 * so a test can state it without standing a registry up.
 *
 * Total and stable: every pair of distinct ids is separated either by rank or,
 * within the "not in the catalogue" rank, by code-unit comparison. Two rows
 * with the *same* id cannot reach this function -- `RegimeScheduleRegistry`'s
 * constructor and `loadSnapshot` both reject a duplicate before ordering.
 */
export function orderRegimeSchedules(schedules: readonly RegimeSchedule[]): readonly RegimeSchedule[] {
  return [...schedules].sort((a, b) => {
    const rankDelta = catalogueRank(a.classificationGroupId) - catalogueRank(b.classificationGroupId);
    if (rankDelta !== 0) return rankDelta;
    if (a.classificationGroupId < b.classificationGroupId) return -1;
    if (a.classificationGroupId > b.classificationGroupId) return 1;
    return 0;
  });
}

/**
 * `ACTION_CATEGORIES` declaration order, duplicates removed.
 *
 * The command carries a player's selection, which has no order of its own: a
 * block's categories are read by `isActionCategoryAllowed`, a membership test,
 * so `['work', 'meal']` and `['meal', 'work']` are the same day. They are *not*
 * the same bytes, and `projectStatusStrip` copies the array into the view model
 * verbatim -- so leaving click order in the payload would put an arbitrary
 * sequence into the checksum and into what the panel lists. Canonicalising here
 * makes the two commands produce one state.
 */
function canonicalCategories(selected: readonly ActionCategory[]): readonly ActionCategory[] {
  return ACTION_CATEGORIES.filter((category) => selected.includes(category));
}

function copyBlock(block: RegimeBlock): RegimeBlock {
  return {
    startTickOfDay: block.startTickOfDay,
    endTickOfDay: block.endTickOfDay,
    allowedCategories: canonicalCategories(block.allowedCategories),
  };
}

function copySchedule(schedule: RegimeSchedule): RegimeSchedule {
  return {
    classificationGroupId: schedule.classificationGroupId,
    blocks: [...schedule.blocks].sort((a, b) => a.startTickOfDay - b.startTickOfDay).map(copyBlock),
  };
}

function assertNoDuplicateGroups(schedules: readonly RegimeSchedule[]): void {
  const seen: string[] = [];
  for (const schedule of schedules) {
    if (seen.includes(schedule.classificationGroupId)) {
      throw new RangeError(`Duplicate regime schedule for classification group "${schedule.classificationGroupId}".`);
    }
    seen.push(schedule.classificationGroupId);
  }
}

export class RegimeScheduleRegistry {
  private schedules: readonly RegimeSchedule[];

  /**
   * Seeded from `DEFAULT_REGIME_SCHEDULES` unless a caller supplies its own,
   * which is exactly what `PrisonerOperationsRuntimeOptions.regimeSchedules`
   * did before this class existed -- a new session therefore starts on the same
   * two timetables it always has, and a restore overwrites them with
   * `loadSnapshot`.
   *
   * Every seeded schedule is asserted gapless here. `regime.ts`'s module-load
   * assertion covers only its own two constants and says so; a caller-supplied
   * array was previously checked by nobody.
   */
  constructor(seed: readonly RegimeSchedule[] = DEFAULT_REGIME_SCHEDULES) {
    assertNoDuplicateGroups(seed);
    for (const schedule of seed) assertGaplessSchedule(schedule);
    this.schedules = orderRegimeSchedules(seed.map(copySchedule));
  }

  /** The live timetables, in canonical order. Never the caller's array: every row is this registry's own copy. */
  all(): readonly RegimeSchedule[] {
    return this.schedules;
  }

  /**
   * The one write ADR 0113 §3 allows: one block's `allowedCategories`, in one
   * group's schedule, identified by the tick that block starts on.
   *
   * **A boundary is never moved**, which is what keeps `assertGaplessSchedule`
   * a fact rather than something to re-prove mid-edit: the returned schedule
   * has the same block boundaries it had, so a schedule that tiled the day
   * still tiles it.
   *
   * **Both refusals are refusals and neither is a near miss that gets applied.**
   * Snapping to the nearest block, or inserting a boundary at an unnamed tick,
   * would both move a block the player did not name while reporting success --
   * the failure `AGENTS.md` article 5 names.
   */
  editBlock(
    classificationGroupId: string,
    startTickOfDay: number,
    allowedCategories: readonly ActionCategory[],
  ): EditRegimeBlockOutcome {
    const index = this.schedules.findIndex((candidate) => candidate.classificationGroupId === classificationGroupId);
    if (index === -1) return { kind: 'refused', reason: 'unknown-group' };

    const schedule = this.schedules[index] as RegimeSchedule;
    const blockIndex = schedule.blocks.findIndex((block) => block.startTickOfDay === startTickOfDay);
    if (blockIndex === -1) return { kind: 'refused', reason: 'unknown-block' };

    const edited: RegimeSchedule = {
      classificationGroupId: schedule.classificationGroupId,
      blocks: schedule.blocks.map((block, position) =>
        position === blockIndex
          ? {
              startTickOfDay: block.startTickOfDay,
              endTickOfDay: block.endTickOfDay,
              allowedCategories: canonicalCategories(allowedCategories),
            }
          : block,
      ),
    };

    // Cheap and deliberate: boundaries did not move, so this cannot fail today.
    // It is what makes that sentence checked rather than asserted, and it is
    // the assertion a future boundary-moving command would inherit.
    assertGaplessSchedule(edited);

    const next = [...this.schedules];
    next[index] = edited;
    this.schedules = next;
    return { kind: 'applied', schedule: edited };
  }

  /** The save payload's rows, in canonical order, detached from this registry. */
  getSnapshot(): readonly EncodedRegimeSchedule[] {
    return this.schedules.map((schedule) => ({
      classificationGroupId: schedule.classificationGroupId,
      blocks: schedule.blocks.map((block) => ({
        startTickOfDay: block.startTickOfDay,
        endTickOfDay: block.endTickOfDay,
        allowedCategories: [...block.allowedCategories],
      })),
    }));
  }

  /**
   * Replaces every timetable with the save's.
   *
   * Re-ordered rather than trusted: the rows arrive from JSON, and ADR 0113 §4
   * requires the live array to be reconstructed in canonical order rather than
   * in whatever order the file happened to list. Re-asserted gapless rather
   * than trusted for the reason the constructor gives -- a hand-edited save is
   * exactly the input `resolveActiveRegimeBlock`'s "no block covering tick" invariant
   * would otherwise discover, one tick at a time, in the middle of a session.
   */
  loadSnapshot(rows: readonly EncodedRegimeSchedule[]): void {
    const schedules: RegimeSchedule[] = rows.map((row) => ({
      classificationGroupId: row.classificationGroupId,
      blocks: row.blocks.map((block) => ({
        startTickOfDay: block.startTickOfDay,
        endTickOfDay: block.endTickOfDay,
        allowedCategories: [...block.allowedCategories],
      })),
    }));
    assertNoDuplicateGroups(schedules);
    for (const schedule of schedules) assertGaplessSchedule(schedule);
    this.schedules = orderRegimeSchedules(schedules.map(copySchedule));
  }
}
