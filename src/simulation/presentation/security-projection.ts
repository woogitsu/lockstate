import type { ContentRegistry } from '../../content/registry';
import type { SecurityGradeDefinition } from '../../content/security-grade-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { DoorDefinition, DoorSide, DoorState } from '../navigation/door';
import { PRISONER_CLASSIFICATION_ACCESS_POLICY } from '../security/access-policy';
import type { SectorControlState, SecuritySectorDefinition } from '../security/sector';
import type { StaffCoverageSource, StaffPatrolMetricsSource, StaffRosterSource } from './staff-projection';
import {
  compareEntityIds,
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  toTileViewModel,
  type HudViewModelSchemaVersion,
  type TileViewModel,
} from './view-model';

export interface SecuritySectorSource {
  all(): readonly SecuritySectorDefinition[];
  getControlState(id: string): SectorControlState;
}

export interface SecurityDoorSource {
  getById(id: string): DoorDefinition | undefined;
}

export interface SecurityIncidentSource {
  openIncidentsInSector(sectorId: string): readonly { readonly id: string }[];
}

export interface SecurityProjectionSource {
  readonly sectors: SecuritySectorSource;
  readonly doors?: SecurityDoorSource;
  readonly staff?: StaffRosterSource;
  readonly deployment?: StaffCoverageSource;
  readonly patrol?: StaffPatrolMetricsSource;
  readonly incidents?: SecurityIncidentSource;
}

export interface SecurityProjectionOptions {
  readonly grades?: ContentRegistry<SecurityGradeDefinition>;
  readonly staffRoles?: ContentRegistry<StaffRoleDefinition>;
}

export interface SecurityDoorViewModel {
  readonly doorId: string;
  readonly state: DoorState;
  readonly position: TileViewModel;
  readonly side: DoorSide;
  readonly requiredSecurityClearance: number;
  readonly requiredPermission?: string;
  readonly costMultiplier: number;
}

export interface SectorPatrolViewModel {
  readonly hasRoute: boolean;
  readonly waypointCount: number;
  readonly waypoints: readonly TileViewModel[];
  readonly expectedLoopTicks?: number;
  /** Guards currently walking a leg of this sector's route. */
  readonly patrollingGuardCount: number;
}

export interface SectorStaffingViewModel {
  readonly required: number;
  readonly assigned: number;
  readonly shortage: number;
  readonly onPost: number;
  readonly travelling: number;
  /** Pulled onto search or incident-response duty; still counted as assigned to this sector. */
  readonly onSearch: number;
  readonly guardEntityIds: readonly EntityId[];
}

export interface SecuritySectorViewModel {
  readonly sectorId: string;
  readonly gradeId: string;
  readonly gradeNameKey?: string;
  readonly minSecurityClearance?: number;
  readonly requiredPermission?: string;
  readonly controlState: SectorControlState;
  readonly postTile: TileViewModel;
  /** Ascending door id, from sorting the sector's own `doorIds` -- this projection resolves doors by id and never enumerates the registry. */
  readonly doors: readonly SecurityDoorViewModel[];
  readonly patrol: SectorPatrolViewModel;
  readonly staffing: SectorStaffingViewModel;
  readonly openIncidentCount: number;
}

export interface SecurityAccessPolicyViewModel {
  /** How a prisoner of each classification group is routed through doors. */
  readonly prisonerClassifications: readonly {
    readonly classificationGroupId: string;
    readonly securityClearance: number;
    readonly permissions: readonly string[];
  }[];
  /** Each staff role's clearance and permissions, straight from the content catalog. */
  readonly staffRoles: readonly {
    readonly staffRoleId: string;
    readonly staffRoleNameKey: string;
    readonly baseSecurityClearance: number;
    readonly permissions: readonly string[];
  }[];
  /** Every security grade the catalog defines, whether or not a sector uses it. */
  readonly grades: readonly {
    readonly gradeId: string;
    readonly gradeNameKey: string;
    readonly minSecurityClearance: number;
    readonly requiredPermission?: string;
  }[];
}

export interface SecurityViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Ascending sector id (`SecuritySectorRegistry.all()` already sorts). */
  readonly sectors: readonly SecuritySectorViewModel[];
  readonly accessPolicy: SecurityAccessPolicyViewModel;
  readonly totals: {
    readonly sectors: number;
    readonly sectorsUnderLockdown: number;
    readonly sectorsRestricted: number;
    readonly required: number;
    readonly assigned: number;
    readonly shortage: number;
  };
  readonly patrolMetrics?: {
    readonly loopsCompletedOnTime: number;
    readonly loopsCompletedLate: number;
    readonly loopsMissed: number;
  };
  readonly deploymentMetrics?: { readonly deploymentFailures: number };
}

interface SectorGuardTally {
  readonly onPost: number;
  readonly travelling: number;
  readonly onSearch: number;
  readonly patrolling: number;
  readonly guardEntityIds: readonly EntityId[];
}

const EMPTY_TALLY: SectorGuardTally = { onPost: 0, travelling: 0, onSearch: 0, patrolling: 0, guardEntityIds: [] };

/**
 * One pass over the roster, bucketed by sector, instead of re-scanning the
 * roster once per sector. `allGuardIds()` is already ascending entity id,
 * so each bucket comes out ascending without a second sort.
 */
function tallyGuardsBySector(staff: StaffRosterSource | undefined): ReadonlyMap<string, SectorGuardTally> {
  const tallies = new Map<string, { onPost: number; travelling: number; onSearch: number; patrolling: number; guardEntityIds: EntityId[] }>();
  if (staff === undefined) return tallies;

  for (const entityId of staff.allGuardIds()) {
    const sectorId = staff.getSectorId(entityId);
    if (sectorId === undefined) continue;
    let tally = tallies.get(sectorId);
    if (tally === undefined) {
      tally = { onPost: 0, travelling: 0, onSearch: 0, patrolling: 0, guardEntityIds: [] };
      tallies.set(sectorId, tally);
    }
    tally.guardEntityIds.push(entityId);
    const phase = staff.getDeploymentPhase(entityId);
    if (phase === 'on-post') tally.onPost += 1;
    else if (phase === 'travelling') tally.travelling += 1;
    else if (phase === 'on-search') tally.onSearch += 1;
    if (phase === 'travelling' && staff.getPatrolWaypointIndex(entityId) !== undefined) tally.patrolling += 1;
  }
  return tallies;
}

/**
 * The security panel: sectors, their access policy, their patrol routes
 * and their deployment.
 *
 * `tick` is required for the same reason as `projectStaff`: required
 * headcount is a function of time of day, and simulation code may not read
 * an ambient clock.
 *
 * **Cost.** `O(staff + sectors * doorsPerSector)`. Guards are bucketed by
 * sector in a single roster pass; door lookups are `Map` hits by id.
 */
export function projectSecurity(
  source: SecurityProjectionSource,
  tick: number,
  options: SecurityProjectionOptions = {},
): SecurityViewModel {
  const grades = options.grades ?? defaultSecurityGradeRegistry;
  const staffRoles = options.staffRoles ?? defaultStaffRoleRegistry;

  const tallies = tallyGuardsBySector(source.staff);
  const coverage = source.deployment?.getCoverageReport(tick) ?? [];
  const requiredBySector = new Map(coverage.map((entry) => [entry.sectorId, entry] as const));

  const sectors = source.sectors.all().map((sector): SecuritySectorViewModel => {
    const grade = grades.getById(sector.gradeId);
    const tally = tallies.get(sector.id) ?? EMPTY_TALLY;
    const coverageEntry = requiredBySector.get(sector.id);
    const assigned = coverageEntry?.assigned ?? tally.guardEntityIds.length;
    const required = coverageEntry?.required ?? 0;

    const doors = [...sector.doorIds]
      .sort(compareStableIds)
      .map((doorId) => source.doors?.getById(doorId))
      .filter((door): door is DoorDefinition => door !== undefined)
      .map((door): SecurityDoorViewModel => ({
        doorId: door.id,
        state: door.state,
        position: toTileViewModel(door.position),
        side: door.side,
        requiredSecurityClearance: door.requiredSecurityClearance,
        ...(door.requiredPermission !== undefined ? { requiredPermission: door.requiredPermission } : {}),
        costMultiplier: door.costMultiplier,
      }));

    const route = sector.patrolRoute ?? [];

    return {
      sectorId: sector.id,
      gradeId: sector.gradeId,
      ...(grade !== undefined
        ? {
            gradeNameKey: grade.nameKey,
            minSecurityClearance: grade.minSecurityClearance,
            ...(grade.requiredPermission !== undefined ? { requiredPermission: grade.requiredPermission } : {}),
          }
        : {}),
      controlState: source.sectors.getControlState(sector.id),
      postTile: toTileViewModel(sector.postTile),
      doors,
      patrol: {
        hasRoute: route.length > 0,
        waypointCount: route.length,
        waypoints: route.map(toTileViewModel),
        ...(sector.expectedPatrolLoopTicks !== undefined ? { expectedLoopTicks: sector.expectedPatrolLoopTicks } : {}),
        patrollingGuardCount: tally.patrolling,
      },
      staffing: {
        required,
        assigned,
        shortage: coverageEntry?.shortage ?? Math.max(0, required - assigned),
        onPost: tally.onPost,
        travelling: tally.travelling,
        onSearch: tally.onSearch,
        guardEntityIds: [...tally.guardEntityIds].sort(compareEntityIds),
      },
      openIncidentCount: source.incidents?.openIncidentsInSector(sector.id).length ?? 0,
    };
  });

  let required = 0;
  let assigned = 0;
  let shortage = 0;
  let underLockdown = 0;
  let restricted = 0;
  for (const sector of sectors) {
    required += sector.staffing.required;
    assigned += sector.staffing.assigned;
    shortage += sector.staffing.shortage;
    if (sector.controlState === 'lockdown') underLockdown += 1;
    if (sector.controlState === 'restricted') restricted += 1;
  }

  const patrolMetrics = source.patrol?.getMetrics();
  const deploymentMetrics = source.deployment?.getMetrics();

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    sectors,
    accessPolicy: {
      prisonerClassifications: Object.keys(PRISONER_CLASSIFICATION_ACCESS_POLICY)
        .sort(compareStableIds)
        .map((classificationGroupId) => {
          const policy = PRISONER_CLASSIFICATION_ACCESS_POLICY[classificationGroupId]!;
          return {
            classificationGroupId,
            securityClearance: policy.securityClearance,
            permissions: [...policy.permissions].sort(compareStableIds),
          };
        }),
      staffRoles: staffRoles.all().map((role) => ({
        staffRoleId: role.id,
        staffRoleNameKey: role.nameKey,
        baseSecurityClearance: role.baseSecurityClearance,
        permissions: [...role.permissions].sort(compareStableIds),
      })),
      grades: grades.all().map((grade) => ({
        gradeId: grade.id,
        gradeNameKey: grade.nameKey,
        minSecurityClearance: grade.minSecurityClearance,
        ...(grade.requiredPermission !== undefined ? { requiredPermission: grade.requiredPermission } : {}),
      })),
    },
    totals: {
      sectors: sectors.length,
      sectorsUnderLockdown: underLockdown,
      sectorsRestricted: restricted,
      required,
      assigned,
      shortage,
    },
    ...(patrolMetrics !== undefined ? { patrolMetrics } : {}),
    ...(deploymentMetrics !== undefined ? { deploymentMetrics } : {}),
  };
}
