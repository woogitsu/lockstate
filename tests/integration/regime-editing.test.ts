import { describe, expect, it } from 'vitest';
import { GENERAL_POPULATION_REGIME } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusStrip } from '../../src/simulation/presentation/status-strip-projection';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

/**
 * `EditRegimeBlock` through the real command path
 * ([ADR 0113](../../docs/adr/0113-how-a-regime-is-edited-and-whose-day-it-is.md)
 * §3), including both refusals and the one thing a refusal must not do.
 *
 * The refusal assertions are the reason this file exists. `AGENTS.md` article
 * 5 is checked as three separate claims per refusal, because a failure of any
 * one of them is a refusal reading as a success: the `RefusalLog` records the
 * right reason, the schedules are unchanged, and the projection the player
 * reads still reports the day it reported before the press.
 */

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * The status strip's regime rows with `blockProgress` dropped.
 *
 * Dropped rather than asserted around: it is how far the clock has travelled
 * through the current block, so it moves on every tick and would make "the
 * projection did not change across a refused command" false for a reason that
 * has nothing to do with the refusal. What is left is exactly the schedule the
 * row states -- the group, the two boundaries and the categories.
 */
function regimeRows(runtime: SimulationRuntime): unknown {
  const entry = PROJECTION_CATALOG['hud/status-strip'];
  const projected = entry.project(runtime, runtime.kernel.tick, undefined as never) as {
    view: { regime: readonly Record<string, unknown>[] };
  };
  return projected.view.regime.map(({ blockProgress: _progress, ...row }) => row);
}

describe('EditRegimeBlock', () => {
  it('changes the named block, and the status strip then reports the edited day', () => {
    const runtime = createNewSimulationRuntime(0xed17);
    const before = regimeRows(runtime);

    submit(
      runtime,
      'edit',
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: 'general-population',
        startTickOfDay: 0,
        allowedCategories: ['work', 'meal'],
      }),
    );

    expect(runtime.refusals.last).toBeUndefined();
    expect(
      runtime.prisoners.regimes.all().find((s) => s.classificationGroupId === 'general-population')?.blocks[0]?.allowedCategories,
    ).toEqual(['meal', 'work']);
    expect(regimeRows(runtime)).not.toEqual(before);

    // The projection defaulted to `DEFAULT_REGIME_SCHEDULES` before this ADR;
    // it must now disagree with that default, which is what proves the source
    // is the session's own registry rather than the module constant.
    const fromDefaults = projectStatusStrip({
      tick: runtime.kernel.tick,
      prisoners: runtime.prisoners,
      rooms: runtime.prisoners,
      staff: runtime.securityGuards,
      incidents: runtime.incidents,
      searchSystem: runtime.searchSystem,
      treasury: runtime.treasury,
    } as never);
    expect(fromDefaults.regime.map(({ blockProgress: _progress, ...row }) => row)).not.toEqual(regimeRows(runtime));
  });

  it('refuses an unknown group: records `edit-regime-block.unknown-group`, and nothing moves', () => {
    const runtime = createNewSimulationRuntime(0xed17);
    const before = runtime.prisoners.regimes.getSnapshot();
    const projectedBefore = regimeRows(runtime);

    submit(
      runtime,
      'edit',
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: 'medium-risk',
        startTickOfDay: 0,
        allowedCategories: ['work'],
      }),
    );

    expect(runtime.refusals.last?.reason).toBe('edit-regime-block.unknown-group');
    expect(runtime.prisoners.regimes.getSnapshot()).toEqual(before);
    expect(regimeRows(runtime)).toEqual(projectedBefore);
  });

  it('refuses a tick that is inside a block but is not its start, rather than editing that block', () => {
    const runtime = createNewSimulationRuntime(0xed17);
    const before = runtime.prisoners.regimes.getSnapshot();
    const projectedBefore = regimeRows(runtime);

    // 1,100 lies inside general population's [1,000, 1,200) recreation block.
    submit(
      runtime,
      'edit',
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: 'general-population',
        startTickOfDay: 1_100,
        allowedCategories: ['sleep'],
      }),
    );

    expect(runtime.refusals.last?.reason).toBe('edit-regime-block.unknown-block');
    expect(runtime.prisoners.regimes.getSnapshot()).toEqual(before);
    expect(regimeRows(runtime)).toEqual(projectedBefore);
    expect(
      runtime.prisoners.regimes.all().find((s) => s.classificationGroupId === 'general-population')?.blocks.find((b) => b.startTickOfDay === 1_000)
        ?.allowedCategories,
    ).toEqual(GENERAL_POPULATION_REGIME.blocks.find((b) => b.startTickOfDay === 1_000)?.allowedCategories);
  });

  it('withdraws a standing refusal only for the group and boundary that was refused', () => {
    const runtime = createNewSimulationRuntime(0xed17);

    submit(
      runtime,
      'bad',
      packCommand({ type: 'EditRegimeBlock', classificationGroupId: 'general-population', startTickOfDay: 1_100, allowedCategories: ['sleep'] }),
    );
    expect(runtime.refusals.last?.reason).toBe('edit-regime-block.unknown-block');

    // A successful edit of a *different* boundary must leave the standing
    // refusal about 1,100 alone (issue #492's rule).
    submit(
      runtime,
      'other',
      packCommand({ type: 'EditRegimeBlock', classificationGroupId: 'general-population', startTickOfDay: 400, allowedCategories: ['meal'] }),
    );
    expect(runtime.refusals.last?.reason).toBe('edit-regime-block.unknown-block');
  });

  it('refuses an empty category list at the schema, before any command is composed', () => {
    expect(() =>
      packCommand({
        type: 'EditRegimeBlock',
        classificationGroupId: 'general-population',
        startTickOfDay: 0,
        allowedCategories: [],
      }),
    ).toThrow();
  });
});
