import { describe, expect, it } from 'vitest';
import { buildFixtureGraph, buildTwoRoomFixture } from '../helpers/navigation-fixture';
import { expectOk } from '../helpers/expect-ok';
import { findRoute } from '../../src/simulation/navigation/router';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { resolveEscortedPrisonerRouteContext, resolvePrisonerRouteContext, resolveStaffRouteContext } from '../../src/simulation/security/access-policy';

describe('resolveStaffRouteContext: staff-role catalog is the single source of truth', () => {
  it('a warden gets the catalog\'s clearance and permissions verbatim', () => {
    const context = resolveStaffRouteContext('staff-role.warden');
    expect(context).toEqual({ role: 'staff', securityClearance: 10, permissions: ['facility-override', 'medical-wing', 'security-wing', 'records'] });
  });

  it('emergencyOverride is only present when explicitly requested', () => {
    expect(resolveStaffRouteContext('staff-role.guard').emergencyOverride).toBeUndefined();
    expect(resolveStaffRouteContext('staff-role.guard', { emergencyOverride: true }).emergencyOverride).toBe(true);
  });

  it('throws for an unknown staff role id', () => {
    expect(() => resolveStaffRouteContext('staff-role.nonexistent')).toThrow(/Unknown staff role id/);
  });
});

describe('resolvePrisonerRouteContext: formalized classification policy', () => {
  it('general-population holds the general-population permission', () => {
    expect(resolvePrisonerRouteContext('general-population', 0)).toEqual({ role: 'prisoner', securityClearance: 0, permissions: ['general-population'] });
  });

  it('high-risk holds no permissions', () => {
    expect(resolvePrisonerRouteContext('high-risk', 2)).toEqual({ role: 'prisoner', securityClearance: 0, permissions: [] });
  });

  it('throws for an unknown classification group', () => {
    expect(() => resolvePrisonerRouteContext('nonexistent-group', 0)).toThrow(/No access policy defined/);
  });
});

describe('resolveEscortedPrisonerRouteContext: borrows the escort\'s access, not the prisoner\'s own', () => {
  it('a high-risk prisoner escorted by a nurse can cross the medical-wing door a bare high-risk context cannot', () => {
    // buildTwoRoomFixture: rooms split at x=4, 'door-medical' at (4,2) requires
    // the 'medical-wing' permission (0 clearance) -- exactly what a nurse holds.
    const { world, doors, chunkA, chunkB } = buildTwoRoomFixture();
    const graph = buildFixtureGraph(world, doors, [chunkA, chunkB]);
    const from = { x: tileCoordinate(3), y: tileCoordinate(2) };
    const to = { x: tileCoordinate(4), y: tileCoordinate(2) };

    const unescorted = resolvePrisonerRouteContext('high-risk', 3);
    const escorted = resolveEscortedPrisonerRouteContext('staff-role.nurse');
    expect(escorted).toEqual({ role: 'prisoner', securityClearance: 4, permissions: ['medical-wing'] });

    expect(findRoute(world, doors, graph, from, to, unescorted).ok).toBe(false);
    expectOk(findRoute(world, doors, graph, from, to, escorted), "the escorted prisoner's route through the medical-wing door");
  });
});
