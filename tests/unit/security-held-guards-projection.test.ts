import { describe, expect, it } from 'vitest';
import { projectHeldGuards } from '../../src/simulation/presentation/guard-release-projection';
import { GuardReleaseService } from '../../src/simulation/security/guard-release';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import type { EntityId } from '../../src/simulation/entity/entity-store';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * `hud/held-guards`, the read model a release control aims with
 * ([ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md)).
 *
 * The claim resolver is the **real** `GuardReleaseService` over the **real**
 * `GuardRoster`, with the two `'on-search'` claimants stubbed to a pair of
 * explicit id lists. That split is deliberate: what has to be proven here is
 * that the projection reports the claim the *release* would act on, and the only
 * way to prove that is to hand both the same resolver -- a stubbed `claimOf`
 * would let the row and the command disagree and this file would not notice.
 * The claimants are stubbed because `SearchSystem` and `IncidentResponseSystem`
 * need a navigation system, a content catalogue and a kernel to say anything,
 * and `tests/integration/security-guard-release.test.ts` drives the real ones.
 */

function claimSource(ids: readonly EntityId[]): { claimedGuardIds: () => readonly EntityId[]; releaseGuard: () => boolean; releaseResponder: () => boolean } {
  return { claimedGuardIds: () => ids, releaseGuard: () => true, releaseResponder: () => true };
}

interface Fixture {
  readonly guards: GuardRoster;
  readonly claims: GuardReleaseService;
}

/**
 * Six guards. `searchIds` and `responseIds` are what each claimant says it
 * holds; the phases are set explicitly, because the phase and the claim are two
 * facts and this projection carries both.
 */
function fixture(options: {
  readonly searchIds?: readonly EntityId[];
  readonly responseIds?: readonly EntityId[];
  readonly onSearch?: readonly EntityId[];
  readonly deployed?: readonly { readonly id: EntityId; readonly sectorId: string; readonly onPost: boolean }[];
  readonly roleIds?: readonly string[];
} = {}): Fixture {
  const guards = new GuardRoster(16);
  const roleIds = options.roleIds ?? ['staff-role.guard', 'staff-role.guard', 'staff-role.guard', 'staff-role.guard', 'staff-role.guard', 'staff-role.guard'];
  for (const roleId of roleIds) guards.hire(roleId, { x: tileCoordinate(0), y: tileCoordinate(0) });

  for (const id of options.onSearch ?? []) guards.setDeploymentPhase(id, 'on-search');
  for (const entry of options.deployed ?? []) {
    guards.assignToSector(entry.id, entry.sectorId);
    if (entry.onPost) guards.setDeploymentPhase(entry.id, 'on-post');
  }

  const claims = new GuardReleaseService(
    guards,
    claimSource(options.searchIds ?? []),
    claimSource(options.responseIds ?? []),
  );
  return { guards, claims };
}

describe('the projection lists what is held, and nothing that is free', () => {
  it('omits an unassigned guard entirely and counts it as free', () => {
    // The list is about what is *held*: a free guard has no claim to release and
    // a row offering to release one would be a control with nothing behind it.
    const { guards, claims } = fixture();
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.held.rows).toEqual([]);
    expect(view.totals).toEqual({ hired: 6, held: 0, unassigned: 6 });
    // Absent as a *row*, present as a *count*: "six hired, none held" is the
    // sentence the header needs, and it is not the same as "nothing has asked".
    expect(view.countsByClaim.map((entry) => entry.count)).toEqual([0, 0, 0, 0]);
  });

  it('reports the claim kind the release would act on, resolved by the same rule', () => {
    const { guards, claims } = fixture({
      onSearch: [0, 1, 2],
      responseIds: [0],
      searchIds: [1],
      deployed: [{ id: 3, sectorId: 'sector-a', onPost: true }],
    });
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.held.rows.map((row) => [row.entityId, row.claim])).toEqual([
      [0, 'incident-response'],
      [1, 'search'],
      // `'on-search'` and named by neither claimant -- ADR 0033's residue, and a
      // real state rather than a bug: a save taken during a response records the
      // claim without the attribution.
      [2, 'unattributed'],
      [3, 'deployment'],
    ]);
    // And the projection agrees with the service it was handed, row for row,
    // which is the property that keeps a press from acting on a claim the row
    // did not name.
    for (const row of view.held.rows) expect(claims.claimOf(row.entityId)).toBe(row.claim);
  });

  it('carries the phase beside the claim, because one claim covers two states', () => {
    // Not redundant: `'travelling'` (on the way to a post) and `'on-post'`
    // (standing on it) are one `'deployment'` claim and two things the guard is
    // doing, and a player deciding whether to pull somebody off a post may
    // reasonably care which.
    const { guards, claims } = fixture({
      deployed: [
        { id: 0, sectorId: 'sector-a', onPost: false },
        { id: 1, sectorId: 'sector-a', onPost: true },
      ],
    });
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.held.rows.map((row) => [row.claim, row.deploymentPhase])).toEqual([
      ['deployment', 'travelling'],
      ['deployment', 'on-post'],
    ]);
  });

  it('reports a sector only for a deployment claim, so a stale sector id cannot say a responder is posted', () => {
    /*
     * The trap this closes is a fact about `GuardRoster`, not a hypothesis:
     * `setDeploymentPhase` does not clear `sectorId`, so a guard that was posted
     * to a sector and then claimed onto `'on-search'` still carries it. Reporting
     * that would tell a player a responder is standing at a post it left.
     */
    const { guards, claims } = fixture({ responseIds: [0], searchIds: [1] });
    guards.assignToSector(0, 'sector-a');
    guards.assignToSector(1, 'sector-a');
    guards.setDeploymentPhase(0, 'on-search');
    guards.setDeploymentPhase(1, 'on-search');
    guards.assignToSector(2, 'sector-b');

    const view = projectHeldGuards({ staff: guards, claims });
    const rows = new Map(view.held.rows.map((row) => [row.entityId, row]));

    // The stale ids really are there on the roster, so this test is not vacuous.
    expect(guards.getSectorId(0)).toBe('sector-a');
    expect(guards.getSectorId(1)).toBe('sector-a');
    expect(rows.get(0)?.sectorId).toBeUndefined();
    expect(rows.get(1)?.sectorId).toBeUndefined();
    expect(rows.get(2)?.sectorId).toBe('sector-b');
  });
});

describe('the projection is deterministic and canonical', () => {
  it('reports ascending entity id, whatever order the claims were made in', () => {
    const { guards, claims } = fixture({ onSearch: [5, 0, 3], responseIds: [5, 3], searchIds: [0] });
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.held.rows.map((row) => row.entityId)).toEqual([0, 3, 5]);
  });

  it('declares every claim kind in a fixed order, so a count reaching zero cannot reorder the header', () => {
    const { guards, claims } = fixture({ onSearch: [0], searchIds: [0] });
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.countsByClaim.map((entry) => entry.claim)).toEqual([
      'deployment',
      'incident-response',
      'search',
      'unattributed',
    ]);
    expect(view.countsByClaim).toEqual([
      { claim: 'deployment', count: 0 },
      { claim: 'incident-response', count: 0 },
      { claim: 'search', count: 1 },
      { claim: 'unattributed', count: 0 },
    ]);
  });

  it('counts over the whole roster while the page is a window onto it', () => {
    // The header has to tell the truth about the prison while the rows tell the
    // truth about the panel -- the rule `projectPendingDeliveries` follows for
    // the same reason: the reader asks for one row budget's worth of rows.
    const { guards, claims } = fixture({ onSearch: [0, 1, 2, 3], searchIds: [0, 1, 2, 3] });
    const view = projectHeldGuards({ staff: guards, claims }, { limit: 2 });

    expect(view.held.rows.map((row) => row.entityId)).toEqual([0, 1]);
    expect(view.held.total).toBe(4);
    expect(view.totals).toEqual({ hired: 6, held: 4, unassigned: 2 });
  });

  it('emits identical output for two projections of the same state', () => {
    const build = (): ReturnType<typeof projectHeldGuards> => {
      const { guards, claims } = fixture({ onSearch: [1, 4], responseIds: [1], searchIds: [4], deployed: [{ id: 2, sectorId: 'sector-a', onPost: true }] });
      return projectHeldGuards({ staff: guards, claims });
    };
    expect(build()).toEqual(build());
  });
});

describe('the projection names nothing it may not name', () => {
  it('carries a role key rather than a role name, and drops it for a role the catalogue does not define', () => {
    // ADR 0011: no translated text crosses the worker boundary. A guard hired
    // with an unknown role id still gets a row, because it is still a held guard
    // whose claim a player may want to release -- the panel names it by entity
    // id instead of dropping the only control that frees it.
    const { guards, claims } = fixture({
      roleIds: ['staff-role.guard', 'staff-role.not-a-role'],
      onSearch: [0, 1],
      searchIds: [0, 1],
    });
    const view = projectHeldGuards({ staff: guards, claims });

    expect(view.held.rows[0]?.staffRoleNameKey).toBeDefined();
    expect(view.held.rows[0]?.staffRoleNameKey).not.toContain(' ');
    expect(view.held.rows[1]?.staffRoleId).toBe('staff-role.not-a-role');
    expect(view.held.rows[1]).not.toHaveProperty('staffRoleNameKey');
    // The row is still aimable, which is the point of keeping it.
    expect(view.held.rows[1]?.entityId).toBe(1);
    expect(view.held.rows[1]?.claim).toBe('search');
  });

  it('carries no incident id, search order id or tile', () => {
    // Deliberate omissions, asserted rather than described: the release command
    // names the guard and never the claim, so a particular job's id would be a
    // second id space on the boundary with nothing able to aim at it.
    const { guards, claims } = fixture({ onSearch: [0], responseIds: [0] });
    const [row] = projectHeldGuards({ staff: guards, claims }).held.rows;

    expect(Object.keys(row!).sort()).toEqual(['claim', 'deploymentPhase', 'entityId', 'staffRoleId', 'staffRoleNameKey']);
  });
});
