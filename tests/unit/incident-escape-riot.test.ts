import { describe, expect, it } from 'vitest';
import { DoorRegistry } from '../../src/simulation/navigation/door';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { TunnelRegistry, resolveEscapeOpportunity } from '../../src/simulation/incidents/escape';
import { RIOT_ALLOWED_CATEGORIES, buildRiotRegimeSchedule, createRiotRegimeOverride } from '../../src/simulation/incidents/riot-regime';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { assertGaplessSchedule, DAY_LENGTH_TICKS, DEFAULT_REGIME_SCHEDULES, resolveActiveRegimeBlock } from '../../src/simulation/prisoners/regime';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { isActionCategoryAllowed } from '../../src/simulation/prisoners/utility-ai';

function perimeterDoors(states: readonly ('open' | 'closed' | 'locked')[]): DoorRegistry {
  const doors = new DoorRegistry();
  states.forEach((state, index) => {
    doors.register({
      id: `perimeter-${index}`,
      position: { x: tileCoordinate(index), y: tileCoordinate(0) },
      side: 'left',
      state,
      requiredSecurityClearance: 0,
      costMultiplier: 1,
    });
  });
  return doors;
}

describe('TunnelRegistry: initial data model, explicit progress only', () => {
  it('starts at zero progress and only advances through explicit calls', () => {
    const tunnels = new TunnelRegistry();
    tunnels.start('tunnel-1', { x: tileCoordinate(1), y: tileCoordinate(1) }, { x: tileCoordinate(9), y: tileCoordinate(1) });

    expect(tunnels.get('tunnel-1')!.progress).toBe(0);
    expect(tunnels.isComplete('tunnel-1')).toBe(false);

    tunnels.advance('tunnel-1', 0.6);
    expect(tunnels.get('tunnel-1')!.progress).toBeCloseTo(0.6, 10);
    expect(tunnels.isComplete('tunnel-1')).toBe(false);

    tunnels.advance('tunnel-1', 0.6); // clamps at 1
    expect(tunnels.get('tunnel-1')!.progress).toBe(1);
    expect(tunnels.isComplete('tunnel-1')).toBe(true);
  });

  it('rejects duplicate and unknown tunnel ids', () => {
    const tunnels = new TunnelRegistry();
    const a = { x: tileCoordinate(0), y: tileCoordinate(0) };
    tunnels.start('tunnel-1', a, a);
    expect(() => tunnels.start('tunnel-1', a, a)).toThrow(/Duplicate tunnel id/);
    expect(() => tunnels.advance('tunnel-nope', 0.1)).toThrow(/Unknown tunnel id/);
  });

  it('snapshot/restore preserves in-progress tunnels', () => {
    const tunnels = new TunnelRegistry();
    tunnels.start('tunnel-1', { x: tileCoordinate(1), y: tileCoordinate(1) }, { x: tileCoordinate(9), y: tileCoordinate(1) });
    tunnels.advance('tunnel-1', 0.35);

    const restored = new TunnelRegistry();
    restored.loadSnapshot(tunnels.getSnapshot());
    expect(restored.all()).toEqual(tunnels.all());
    expect(restored.get('tunnel-1')!.progress).toBeCloseTo(0.35, 10);
  });
});

describe('resolveEscapeOpportunity: real doors and completed tunnels only', () => {
  it('a fully locked perimeter with no completed tunnel offers no opportunity', () => {
    const doors = perimeterDoors(['locked', 'locked']);
    const tunnels = new TunnelRegistry();
    const opportunity = resolveEscapeOpportunity(doors, ['perimeter-0', 'perimeter-1'], tunnels, [], 1);

    expect(opportunity).toEqual({ exploitableDoorIds: [], completedTunnelIds: [], score: 0 });
  });

  it('an open or merely-closed perimeter door is exploitable; a locked one never is', () => {
    const doors = perimeterDoors(['open', 'closed', 'locked']);
    const tunnels = new TunnelRegistry();
    const opportunity = resolveEscapeOpportunity(doors, ['perimeter-0', 'perimeter-1', 'perimeter-2'], tunnels, [], 0);

    expect(opportunity.exploitableDoorIds).toEqual(['perimeter-0', 'perimeter-1']);
    expect(opportunity.score).toBeGreaterThan(0);
  });

  it('only completed tunnels count toward opportunity', () => {
    const doors = perimeterDoors(['locked']);
    const tunnels = new TunnelRegistry();
    const a = { x: tileCoordinate(0), y: tileCoordinate(0) };
    tunnels.start('tunnel-partial', a, a);
    tunnels.advance('tunnel-partial', 0.9);
    tunnels.start('tunnel-done', a, a);
    tunnels.advance('tunnel-done', 1);

    const opportunity = resolveEscapeOpportunity(doors, ['perimeter-0'], tunnels, ['tunnel-partial', 'tunnel-done'], 0);
    expect(opportunity.completedTunnelIds).toEqual(['tunnel-done']);
  });

  it('staffing shortfall amplifies an existing weakness but never creates one', () => {
    const tunnels = new TunnelRegistry();
    const watched = resolveEscapeOpportunity(perimeterDoors(['open']), ['perimeter-0'], tunnels, [], 0);
    const unwatched = resolveEscapeOpportunity(perimeterDoors(['open']), ['perimeter-0'], tunnels, [], 1);
    expect(unwatched.score).toBeGreaterThan(watched.score);

    // No weakness at all -> shortfall is irrelevant.
    const noWeakness = resolveEscapeOpportunity(perimeterDoors(['locked']), ['perimeter-0'], tunnels, [], 1);
    expect(noWeakness.score).toBe(0);
  });

  it('clamps to [0, 1] with many simultaneous weaknesses', () => {
    const doors = perimeterDoors(['open', 'open', 'open', 'open', 'open']);
    const tunnels = new TunnelRegistry();
    const opportunity = resolveEscapeOpportunity(doors, ['perimeter-0', 'perimeter-1', 'perimeter-2', 'perimeter-3', 'perimeter-4'], tunnels, [], 1);
    expect(opportunity.score).toBe(1);
  });
});

/**
 * Issue #28's "riot-specific candidate actions/regime override using the
 * existing utility/action framework" -- a riot must be expressible as an
 * ordinary RegimeSchedule, requiring no new branch in ActionSystem or
 * utility-ai.ts.
 */
describe('riot regime override: reuses the existing regime/action framework', () => {
  /**
   * "Gapless" was asserted by sampling seven ticks (issue #140's shape, in a
   * neighbouring file): a gap between two of them was invisible, and a
   * *runtime-built* schedule is precisely the case the module-load check in
   * `regime.ts` cannot see. So the exported invariant check runs on it
   * directly, and the categories are checked at every tick of the day rather
   * than at seven of them.
   */
  it('the riot schedule is gapless across the whole day and allows only riot categories', () => {
    const schedule = buildRiotRegimeSchedule('general-population');

    // The same check the two default schedules get at module load.
    expect(() => assertGaplessSchedule(schedule)).not.toThrow();

    for (let tickOfDay = 0; tickOfDay < DAY_LENGTH_TICKS; tickOfDay += 1) {
      expect(resolveActiveRegimeBlock(schedule, tickOfDay).allowedCategories).toEqual(RIOT_ALLOWED_CATEGORIES);
    }

    // Wraparound: a riot does not end at midnight.
    for (const tick of [DAY_LENGTH_TICKS, DAY_LENGTH_TICKS * 3 + 7]) {
      expect(resolveActiveRegimeBlock(schedule, tick).allowedCategories).toEqual(RIOT_ALLOWED_CATEGORIES);
    }
  });

  /**
   * The override's *output* is what `ActionSystem` resolves against, so the
   * invariant has to survive the substitution, not merely hold for each input.
   *
   * **This used to iterate `applyRiotRegimeOverride`'s returned array.** That
   * function swapped whole classification groups, had no caller in `src/`, and
   * was deleted by ADR 0057 in favour of the per-participant resolver below;
   * the invariant it was asserting is the one that matters and is kept, asked
   * of every group the resolver can produce a schedule for.
   */
  it('leaves every schedule the resolver can return gapless', () => {
    const incidents = new IncidentLog();
    const override = createRiotRegimeOverride(incidents);
    incidents.open({ id: 'i-1', type: 'riot', sectorId: 's', participantIds: [7], severity: 5, causeFactors: [] }, 0);

    for (const { classificationGroupId } of DEFAULT_REGIME_SCHEDULES) {
      const schedule = override(7, classificationGroupId);
      expect(schedule, classificationGroupId).toBeDefined();
      expect(schedule!.classificationGroupId).toBe(classificationGroupId);
      expect(() => assertGaplessSchedule(schedule!), classificationGroupId).not.toThrow();
    }
  });

  /**
   * **This test's own title outlived its assertions by the length of the
   * repository.** It said "free-association and recreation remain" and checked
   * only recreation, because until
   * [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
   * decision 1 appended `action.free-association` there was no action in that
   * category to check — so the half of the sentence naming the category with
   * no content was the half nothing held. A category "remaining" legal with
   * nothing authored under it is exactly the state that left a rioting
   * prisoner with an empty candidate list; `tests/unit/prisoners-free-association.test.ts`
   * drives what one now does with it.
   */
  it('work, education, meals and sleep all become illegal under a riot; free-association and recreation remain', () => {
    const block = resolveActiveRegimeBlock(buildRiotRegimeSchedule('general-population'), 600);
    const legalActionIds = DEFAULT_ACTIONS.filter((action) => isActionCategoryAllowed(action, block.allowedCategories)).map((action) => action.id);

    expect(legalActionIds).toContain('action.yard-recreation');
    expect(legalActionIds).toContain('action.common-room-recreation');
    expect(legalActionIds).toContain('action.free-association');
    expect(legalActionIds).not.toContain('action.sleep');
    expect(legalActionIds).not.toContain('action.eat-meal');
    expect(legalActionIds).not.toContain('action.classroom-education');
  });

  it('overrides a participant of an open riot, and nobody else', () => {
    const incidents = new IncidentLog();
    const override = createRiotRegimeOverride(incidents);

    // Nothing has happened yet: every prisoner runs their own timetable.
    expect(override(7, 'general-population')).toBeUndefined();

    incidents.open({ id: 'i-1', type: 'riot', sectorId: 's', participantIds: [7, 9], severity: 5, causeFactors: [] }, 0);

    // The two the record names, and only them. `8` is a prisoner who was not in
    // the sector; asserting on them is what makes this a statement about the
    // participant list rather than about the log being non-empty.
    expect(resolveActiveRegimeBlock(override(7, 'general-population')!, 600).allowedCategories).toEqual(RIOT_ALLOWED_CATEGORIES);
    expect(resolveActiveRegimeBlock(override(9, 'high-risk')!, 600).allowedCategories).toEqual(RIOT_ALLOWED_CATEGORIES);
    expect(override(8, 'general-population')).toBeUndefined();

    // The shipped array is never touched, so there is nothing to lift: the
    // list gained `'free-association'` in ADR 0054 and is read verbatim off the
    // shipped schedule for that reason. What this asserts is that resolving an
    // override did not mutate it, not what the block happens to allow.
    const originalBlock = resolveActiveRegimeBlock(DEFAULT_REGIME_SCHEDULES.find((s) => s.classificationGroupId === 'general-population')!, 600);
    expect(originalBlock.allowedCategories).toEqual(['work', 'education', 'free-association']);
  });

  it('stops overriding the moment the riot reaches a terminal state, on both routes out', () => {
    for (const terminal of ['resolved', 'lapsed'] as const) {
      const incidents = new IncidentLog();
      const override = createRiotRegimeOverride(incidents);
      incidents.open({ id: 'i-1', type: 'riot', sectorId: 's', participantIds: [7], severity: 5, causeFactors: [] }, 0);

      // Through the whole non-terminal lifecycle, not merely at `'active'`.
      expect(override(7, 'general-population'), `${terminal}: active`).toBeDefined();
      incidents.transition('i-1', 'notified', 10);
      expect(override(7, 'general-population'), `${terminal}: notified`).toBeDefined();
      if (terminal === 'resolved') {
        incidents.transition('i-1', 'responding', 20);
        expect(override(7, 'general-population'), 'resolved: responding').toBeDefined();
      }

      incidents.transition('i-1', terminal, 30);
      expect(override(7, 'general-population'), terminal).toBeUndefined();
    }
  });

  it('keeps a participant overridden while a second open riot still names them', () => {
    /*
     * Two sectors can riot at once and one prisoner can be an occupant of both
     * -- the derived default sector is the whole prison (ADR 0048) and any
     * other registered sector keeps the post-tile rule -- so the index counts
     * rather than sets. With a set, closing the first riot would end the
     * second one's override for this prisoner while it is still running.
     */
    const incidents = new IncidentLog();
    const override = createRiotRegimeOverride(incidents);
    incidents.open({ id: 'i-1', type: 'riot', sectorId: 'prison', participantIds: [7], severity: 5, causeFactors: [] }, 0);
    incidents.open({ id: 'i-2', type: 'riot', sectorId: 'wing', participantIds: [7, 9], severity: 5, causeFactors: [] }, 0);

    incidents.transition('i-1', 'lapsed', 30);

    expect(override(7, 'general-population')).toBeDefined();
    incidents.transition('i-2', 'lapsed', 40);
    expect(override(7, 'general-population')).toBeUndefined();
  });

  it('does not override a participant of an incident that is not a riot', () => {
    // `RIOT_ALLOWED_CATEGORIES` is authored for a riot. The only other type
    // anything in `src/` opens is `'gang-retaliation'`, and reading a riot's
    // categories onto it would be a content decision nothing has measured.
    const incidents = new IncidentLog();
    const override = createRiotRegimeOverride(incidents);
    incidents.open({ id: 'i-1', type: 'gang-retaliation', sectorId: 's', participantIds: [7], severity: 5, causeFactors: [] }, 0);

    expect(override(7, 'general-population')).toBeUndefined();
  });
});
