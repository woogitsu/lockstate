import type { ContentRegistry } from '../../content/registry';
import type { StaffDepartment, StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { DeploymentPhase } from '../security/guard-roster';
import type { CoverageReportEntry } from '../security/deployment-system';
import type { TilePosition } from '../world/coordinates';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toTileViewModel,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type TileViewModel,
  type ViewModelPage,
} from './view-model';

/**
 * Read-only slice of `GuardRoster`. Named "staff" rather than "guards"
 * because the roster stores whatever `staffRoleId` it was hired with --
 * every role in `src/content/staff-role-catalog.ts` is representable. It
 * is nonetheless the *only* staff store that exists; there is no separate
 * employment, shift or payroll system.
 */
export interface StaffRosterSource {
  allGuardIds(): readonly EntityId[];
  getStaffRoleId(entityId: EntityId): string;
  getTile(entityId: EntityId): TilePosition;
  getSectorId(entityId: EntityId): string | undefined;
  getDeploymentPhase(entityId: EntityId): DeploymentPhase;
  getPatrolWaypointIndex(entityId: EntityId): number | undefined;
  getPatrolLoopStartedAtTick(entityId: EntityId): number | undefined;
}

export interface StaffCoverageSource {
  getCoverageReport(tick: number): readonly CoverageReportEntry[];
  getMetrics(): { readonly deploymentFailures: number };
}

export interface StaffPatrolMetricsSource {
  getMetrics(): {
    readonly loopsCompletedOnTime: number;
    readonly loopsCompletedLate: number;
    readonly loopsMissed: number;
  };
}

export interface StaffProjectionSource {
  readonly staff: StaffRosterSource;
  readonly deployment?: StaffCoverageSource;
  readonly patrol?: StaffPatrolMetricsSource;
}

export interface StaffProjectionOptions {
  readonly staffRoles?: ContentRegistry<StaffRoleDefinition>;
}

export interface StaffAssignmentViewModel {
  readonly deploymentPhase: DeploymentPhase;
  readonly sectorId?: string;
  /** `-1` is the simulation's "final leg back to post" sentinel; absent while not patrolling. */
  readonly patrolWaypointIndex?: number;
  readonly patrolLoopStartedAtTick?: number;
}

export interface StaffRosterRowViewModel {
  readonly entityId: EntityId;
  readonly staffRoleId: string;
  /** Absent when hired with a role id the catalog does not define. */
  readonly staffRoleNameKey?: string;
  readonly department?: StaffDepartment;
  readonly baseSecurityClearance?: number;
  readonly permissions?: readonly string[];
  readonly tile: TileViewModel;
  readonly assignment: StaffAssignmentViewModel;
}

export interface StaffCoverageRowViewModel {
  readonly sectorId: string;
  readonly required: number;
  /** Assigned to the sector, whether already on post or still travelling there. */
  readonly assigned: number;
  readonly shortage: number;
}

export interface StaffViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  readonly roster: ViewModelPage<StaffRosterRowViewModel>;
  /** Declared catalog order; roles with nobody hired still appear with `count: 0`. */
  readonly countsByRoleId: readonly {
    readonly staffRoleId: string;
    readonly staffRoleNameKey: string;
    readonly department: StaffDepartment;
    readonly count: number;
  }[];
  /** Fixed declared order, so a phase never appears and vanishes between frames. */
  readonly countsByDeploymentPhase: readonly { readonly deploymentPhase: DeploymentPhase; readonly count: number }[];
  /** Per sector at the given tick, ascending sector id. Empty when no deployment system was supplied. */
  readonly coverage: readonly StaffCoverageRowViewModel[];
  readonly totals: {
    readonly hired: number;
    readonly unassigned: number;
    readonly required: number;
    readonly assigned: number;
    readonly shortage: number;
  };
  /** Absent unless the corresponding system was supplied. */
  readonly patrolMetrics?: {
    readonly loopsCompletedOnTime: number;
    readonly loopsCompletedLate: number;
    readonly loopsMissed: number;
  };
  readonly deploymentMetrics?: { readonly deploymentFailures: number };
}

const DEPLOYMENT_PHASES: readonly DeploymentPhase[] = ['unassigned', 'travelling', 'on-post', 'on-search'];

function projectRow(
  source: StaffRosterSource,
  entityId: EntityId,
  staffRoles: ContentRegistry<StaffRoleDefinition>,
): StaffRosterRowViewModel {
  const staffRoleId = source.getStaffRoleId(entityId);
  const role = staffRoles.getById(staffRoleId);
  const sectorId = source.getSectorId(entityId);
  const waypointIndex = source.getPatrolWaypointIndex(entityId);
  const loopStartedAtTick = source.getPatrolLoopStartedAtTick(entityId);

  return {
    entityId,
    staffRoleId,
    ...(role !== undefined
      ? {
          staffRoleNameKey: role.nameKey,
          department: role.department,
          baseSecurityClearance: role.baseSecurityClearance,
          permissions: [...role.permissions].sort(compareStableIds),
        }
      : {}),
    tile: toTileViewModel(source.getTile(entityId)),
    assignment: {
      deploymentPhase: source.getDeploymentPhase(entityId),
      ...(sectorId !== undefined ? { sectorId } : {}),
      ...(waypointIndex !== undefined ? { patrolWaypointIndex: waypointIndex } : {}),
      ...(loopStartedAtTick !== undefined ? { patrolLoopStartedAtTick: loopStartedAtTick } : {}),
    },
  };
}

/**
 * The staff panel: who is hired, in what role, where they are assigned,
 * and where coverage falls short.
 *
 * `tick` is required because required headcount varies by time of day
 * (`DeploymentSchedule`), so "coverage" is only meaningful at a stated
 * tick -- there is no ambient clock to read one from
 * (`docs/DETERMINISM.md`).
 *
 * **Cost.** `O(staff)` -- `GuardRoster.allGuardIds()` sorts its whole key
 * set on every call. Realistic headcounts are tens to low hundreds
 * (`docs/SECURITY.md`), which is why the roster is a `Map` rather than a
 * typed-array component in the first place; this projection inherits that
 * assumption rather than working around it.
 */
export function projectStaff(
  source: StaffProjectionSource,
  tick: number,
  request: PageRequest = {},
  options: StaffProjectionOptions = {},
): StaffViewModel {
  const staffRoles = options.staffRoles ?? defaultStaffRoleRegistry;
  const entityIds = source.staff.allGuardIds();
  const rows = entityIds.map((entityId) => projectRow(source.staff, entityId, staffRoles));

  const countsByRoleId = new Map<string, number>();
  const countsByPhase = new Map<DeploymentPhase, number>();
  for (const row of rows) {
    countsByRoleId.set(row.staffRoleId, (countsByRoleId.get(row.staffRoleId) ?? 0) + 1);
    const phase = row.assignment.deploymentPhase;
    countsByPhase.set(phase, (countsByPhase.get(phase) ?? 0) + 1);
  }

  const coverage: readonly StaffCoverageRowViewModel[] =
    source.deployment === undefined
      ? []
      : source.deployment.getCoverageReport(tick).map((entry) => ({
          sectorId: entry.sectorId,
          required: entry.required,
          assigned: entry.assigned,
          shortage: entry.shortage,
        }));

  let required = 0;
  let assigned = 0;
  let shortage = 0;
  for (const entry of coverage) {
    required += entry.required;
    assigned += entry.assigned;
    shortage += entry.shortage;
  }

  const patrolMetrics = source.patrol?.getMetrics();
  const deploymentMetrics = source.deployment?.getMetrics();

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    roster: pageOf(rows, request),
    countsByRoleId: staffRoles.all().map((role) => ({
      staffRoleId: role.id,
      staffRoleNameKey: role.nameKey,
      department: role.department,
      count: countsByRoleId.get(role.id) ?? 0,
    })),
    countsByDeploymentPhase: DEPLOYMENT_PHASES.map((phase) => ({
      deploymentPhase: phase,
      count: countsByPhase.get(phase) ?? 0,
    })),
    coverage,
    totals: {
      hired: rows.length,
      unassigned: countsByPhase.get('unassigned') ?? 0,
      required,
      assigned,
      shortage,
    },
    ...(patrolMetrics !== undefined ? { patrolMetrics } : {}),
    ...(deploymentMetrics !== undefined ? { deploymentMetrics } : {}),
  };
}
