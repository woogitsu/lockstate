import { describe, expect, it } from 'vitest';
import { simulationEnumIds } from '../../src/content/simulation-message-keys';
import { lockedCategoryIdsFor, nextAllowedCategories } from '../../src/ui/hud';
import { regimeFromProjection } from '../../src/ui/simulation-regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import type { ActionCategory } from '../../src/simulation/prisoners/regime';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import type { StatusStripViewModel } from '../../src/simulation/presentation/status-strip-projection';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

/**
 * **The half of `EditRegimeBlock` that nothing could send** (issue #1167,
 * ADR 0113 slice 1).
 *
 * `tests/integration/regime-editing.test.ts` beside this one drives the
 * command through the real kernel from a hand-written payload, and it proved
 * the consumer. What it could not prove is that anything a *player* touches
 * can compose one: the command was the sole entry in
 * `AWAITING_PRODUCER` (`tests/foundation/unconsumed-command-contract.test.ts`),
 * which is that gate's own phrase for a command only a test can send.
 *
 * So this file starts where the panel starts -- the projection reply the
 * Regime panel is handed -- runs the two pure decisions a toggle press makes,
 * composes the command exactly as `src/main.ts` composes it, and ends by
 * reading the *same projection* back. Everything between is production code.
 *
 * ## Why an integration test and not a unit test of the helpers
 *
 * The helpers are pure and could be tested against a literal. That would prove
 * the arithmetic and miss the thing that was actually missing, which is
 * agreement between four vocabularies that are declared in four different
 * files: `ACTION_CATEGORIES`, the `action-category` labels in
 * `src/content/simulation-message-keys.ts` (the only one the HUD may read),
 * `editRegimeBlockSchema`'s `z.enum`, and the ids the projection puts on the
 * wire. A fixture agrees with whoever wrote it.
 */

/**
 * A session standing inside a regime block that does **not** start at tick 0.
 *
 * Every test below runs here rather than on a fresh runtime, and that is the
 * difference between an assertion and a decoration. `GENERAL_POPULATION_REGIME`
 * opens with `[0, 400) sleep`, so at tick 0 the boundary the panel would send
 * is `0` -- and a translator that published a hard-coded `0` for every row
 * would pass a test taken there. Measured: pinning
 * `HudRegimeBlockViewModel.startTickOfDay` to `0` leaves this file green at
 * tick 0 and red at tick 500.
 *
 * 500 is the start of `[500, 1,000) work / education / free-association`, and
 * having three categories there is also what gives the removal case below
 * anything to remove: the opening block allows one, and removing that one is
 * the case the lock exists for rather than a case of ordinary editing.
 */
function runtimeInABlockThatDoesNotStartTheDay(seed: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  while (runtime.kernel.tick < 500) runtime.kernel.step();
  return runtime;
}

function statusStrip(runtime: SimulationRuntime): StatusStripViewModel {
  const entry = PROJECTION_CATALOG['hud/status-strip'];
  const projected = entry.project(runtime, runtime.kernel.tick, undefined as never) as unknown as { view: StatusStripViewModel };
  return projected.view;
}

/** What the Regime panel is handed, through the real translator. */
function panelRegime(runtime: SimulationRuntime) {
  return regimeFromProjection(statusStrip(runtime));
}

function group(runtime: SimulationRuntime, classificationGroupId: string) {
  const row = panelRegime(runtime).groups.find((candidate) => candidate.classificationGroupId === classificationGroupId);
  expect(row, `no ${classificationGroupId} row on the projection`).toBeDefined();
  return row!;
}

/**
 * The submission `src/main.ts` performs for an `edit-regime-block` intent,
 * spelled out here rather than imported: that module mounts a HUD and touches
 * `document`, and the default Vitest environment is `node` (`docs/TESTING.md`).
 * The three fields and the widening cast are copied from its `case` arm, so a
 * change there that this stopped matching is a change worth noticing.
 */
function submitEdit(runtime: SimulationRuntime, id: string, intent: {
  readonly classificationGroupId: string;
  readonly startTickOfDay: number;
  readonly allowedCategoryIds: readonly string[];
}): void {
  const payload = packCommand({
    type: 'EditRegimeBlock',
    classificationGroupId: intent.classificationGroupId,
    startTickOfDay: intent.startTickOfDay,
    allowedCategories: [...(intent.allowedCategoryIds as readonly ActionCategory[])],
  });
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

describe("the Regime panel's editor, from the projection it reads to the day it changes", () => {
  it('is handed the block boundary and the category ids the command is built out of', () => {
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const row = group(runtime, 'general-population');

    // Not a fixture's idea of the running block: the same figures the
    // session's own registry holds, found by the boundary the row states.
    const schedule = runtime.prisoners.regimes.all().find((s) => s.classificationGroupId === 'general-population');
    const block = schedule?.blocks.find((candidate) => candidate.startTickOfDay === row.startTickOfDay);
    expect(block, 'the tick the panel would send names no block in the session registry').toBeDefined();
    expect(row.allowedCategoryIds).toEqual(block?.allowedCategories);
    // And it is the *running* block's own boundary rather than the day's:
    // this is the assertion a hard-coded `0` fails.
    expect(row.startTickOfDay).toBe(500);
    expect(row.startTickOfDay).toBeGreaterThan(0);

    // And the two forms of the same fact agree, which is what lets the panel
    // render one and send the other.
    expect(row.allowedCategoryLabelKeys).toEqual(row.allowedCategoryIds.map((id) => `action-category.${id}.name`));
  });

  it('offers every category the simulation has, not only the ones the block already allows', () => {
    // The vocabulary the panel builds its toggles from. If this were the
    // block's own list a player could switch categories off and never back on.
    const categoryIds = simulationEnumIds('action-category');
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const row = group(runtime, 'general-population');

    expect(categoryIds.length).toBeGreaterThan(row.allowedCategoryIds.length);
    for (const id of row.allowedCategoryIds) expect(categoryIds).toContain(id);
  });

  it('turns one toggle press into an edit the same projection reports back', () => {
    const categoryIds = simulationEnumIds('action-category');
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const before = group(runtime, 'general-population');

    // The category the block does not allow, so the press is an addition and
    // the assertion afterwards cannot pass by accident.
    const added = categoryIds.find((id) => !before.allowedCategoryIds.includes(id));
    expect(added, 'the running block already allows every category').toBeDefined();

    submitEdit(runtime, 'edit', {
      classificationGroupId: before.classificationGroupId,
      startTickOfDay: before.startTickOfDay,
      allowedCategoryIds: nextAllowedCategories(before.allowedCategoryIds, added!, true, categoryIds),
    });

    expect(runtime.refusals.last).toBeUndefined();
    const after = group(runtime, 'general-population');
    expect(after.allowedCategoryIds).toContain(added);
    for (const id of before.allowedCategoryIds) expect(after.allowedCategoryIds).toContain(id);
    // The rendered sentence moved with it, which is the half a player sees.
    expect(after.allowedCategoryLabelKeys).not.toEqual(before.allowedCategoryLabelKeys);
  });

  it('takes a category away again, and the block the player did not name does not move', () => {
    const categoryIds = simulationEnumIds('action-category');
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const untouched = group(runtime, 'high-risk');
    const before = group(runtime, 'general-population');
    // Three categories in this block, so removing one is not the last-category
    // case the next test is about.
    expect(before.allowedCategoryIds.length).toBeGreaterThan(1);
    const removed = before.allowedCategoryIds[0];
    expect(removed, 'the running block allows nothing to remove').toBeDefined();

    submitEdit(runtime, 'edit', {
      classificationGroupId: before.classificationGroupId,
      startTickOfDay: before.startTickOfDay,
      allowedCategoryIds: nextAllowedCategories(before.allowedCategoryIds, removed!, false, categoryIds),
    });

    expect(runtime.refusals.last).toBeUndefined();
    expect(group(runtime, 'general-population').allowedCategoryIds).not.toContain(removed);
    // ADR 0113's per-group ruling, measured rather than asserted: editing one
    // group's day leaves the other group's alone.
    expect(group(runtime, 'high-risk').allowedCategoryIds).toEqual(untouched.allowedCategoryIds);
  });

  it('locks the last remaining category, because the command the unlocked press would send is refused at decode', () => {
    const categoryIds = simulationEnumIds('action-category');
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const row = group(runtime, 'general-population');

    // Empty the block down to one category the way a player would: one press
    // per category, each one a real command through the real kernel.
    let allowed = row.allowedCategoryIds;
    for (const id of row.allowedCategoryIds.slice(1)) {
      allowed = nextAllowedCategories(allowed, id, false, categoryIds);
      submitEdit(runtime, `edit-${id}`, {
        classificationGroupId: row.classificationGroupId,
        startTickOfDay: row.startTickOfDay,
        allowedCategoryIds: allowed,
      });
    }

    const last = group(runtime, 'general-population');
    expect(last.allowedCategoryIds).toHaveLength(1);
    // The panel locks exactly that toggle and nothing else.
    expect(lockedCategoryIdsFor(last.allowedCategoryIds)).toEqual(last.allowedCategoryIds);

    // And this is what the lock is worth: the press it prevents composes a
    // command the schema refuses, so an unlocked toggle would be a control
    // that did nothing and said nothing.
    expect(() =>
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: last.classificationGroupId,
        startTickOfDay: last.startTickOfDay,
        allowedCategories: [
          ...(nextAllowedCategories(
            last.allowedCategoryIds,
            last.allowedCategoryIds[0]!,
            false,
            categoryIds,
          ) as readonly ActionCategory[]),
        ],
      }),
    ).toThrow();
  });

  it('sends the same categories whatever order they were pressed in', () => {
    const categoryIds = simulationEnumIds('action-category');
    const runtime = runtimeInABlockThatDoesNotStartTheDay(0x11_67);
    const row = group(runtime, 'general-population');
    const [first, second] = categoryIds.filter((id) => !row.allowedCategoryIds.includes(id));
    expect(second, 'fewer than two categories are off in the running block').toBeDefined();

    const forwards = nextAllowedCategories(
      nextAllowedCategories(row.allowedCategoryIds, first!, true, categoryIds),
      second!,
      true,
      categoryIds,
    );
    const backwards = nextAllowedCategories(
      nextAllowedCategories(row.allowedCategoryIds, second!, true, categoryIds),
      first!,
      true,
      categoryIds,
    );
    expect(forwards).toEqual(backwards);
  });
});
