import type { ContentRegistry } from '../../content/registry';
import type { StaffDepartment, StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { ActorIdentitySource } from '../identity/actor-identity';
import type { DeploymentPhase } from '../security/guard-roster';
import {
  displayedDeploymentPhase,
  type DisplayedDeploymentPhase,
  type SectorPostSource,
} from '../security/deployment-phase';
import type { CoverageReportEntry } from '../security/deployment-system';
import { isPostEligibleStaffRoleId } from '../security/post-eligibility';
import { responseReserveGuardCount, spareGuardCount, type ResponderCountSource } from '../security/response-reserve';
import type { TilePosition } from '../world/coordinates';
import {
  compareStableIds,
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toActorNameViewModel,
  toTileViewModel,
  type ActorNameViewModel,
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
  /**
   * Where a sector's post tile is read from, so a row can say `'returning'`
   * rather than assert a post the guard is not standing on
   * (`src/simulation/security/deployment-phase.ts`).
   *
   * **Optional, and absent means the stored phase is reported as it stands.**
   * A projection is not the place to refuse a source: a fixture that hands
   * over a roster and no sectors is measuring the roster, and the honest
   * answer for it is `GuardRoster`'s own word. A session supplies it
   * (`projection-catalog.ts`, `hud/staff`).
   */
  readonly sectors?: SectorPostSource;
  /**
   * `IncidentResponseSystem`, asked one question: how many responders the
   * worst incident needs (`responseReserveGuardCount`, ADR 0095 decision 1).
   *
   * **Optional, and absent means `totals.reserve` is absent** -- not zero. A
   * reserve of `0` would say the prison needs nobody free to answer anything,
   * which is a claim about incident response a session without a response
   * system cannot make; the Staff panel reads an absent reserve as "no reserve
   * rung to decide" and falls back to the three rungs it had before.
   */
  readonly responders?: ResponderCountSource;
}

export interface StaffProjectionOptions {
  readonly staffRoles?: ContentRegistry<StaffRoleDefinition>;
  /**
   * Actor names (`src/simulation/identity/`). Optional for the same reason
   * as on the prisoner projection: identity is a session-level registry,
   * not part of `GuardRoster`. A staff entity id and a prisoner entity id
   * come from two different `EntityStore`s and collide numerically, which
   * is why the lookup is by `('staff', entityId)` and not by id alone.
   */
  readonly identity?: ActorIdentitySource;
}

export interface StaffAssignmentViewModel {
  /**
   * `DisplayedDeploymentPhase`, not `DeploymentPhase`: `'returning'` is
   * derived here and is stored nowhere. See
   * `src/simulation/security/deployment-phase.ts`.
   */
  readonly deploymentPhase: DisplayedDeploymentPhase;
  readonly sectorId?: string;
  /** `-1` is the simulation's "final leg back to post" sentinel; absent while not patrolling. */
  readonly patrolWaypointIndex?: number;
  readonly patrolLoopStartedAtTick?: number;
}

export interface StaffRosterRowViewModel {
  readonly entityId: EntityId;
  /** Absent when no identity source was supplied, or this staff member was hired without one being minted. */
  readonly name?: ActorNameViewModel;
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
  readonly countsByDeploymentPhase: readonly { readonly deploymentPhase: DisplayedDeploymentPhase; readonly count: number }[];
  /** Per sector at the given tick, ascending sector id. Empty when no deployment system was supplied. */
  readonly coverage: readonly StaffCoverageRowViewModel[];
  readonly totals: {
    readonly hired: number;
    readonly unassigned: number;
    readonly required: number;
    readonly assigned: number;
    readonly shortage: number;
    /**
     * Guards an incident response could claim now: `claimableGuardIds`'
     * size, post-eligible roles in phase `'unassigned'` only
     * (`spareGuardCount`). **Not `unassigned`**, which counts every role --
     * a nurse standing free is not a spare guard (ADR 0053 decision 3).
     */
    readonly spare: number;
    /**
     * Free guards the worst incident needs before any responder is claimed
     * for it (`responseReserveGuardCount`, ADR 0095 decision 1): prison-wide,
     * not summed over sectors (that ADR's open question 2). Absent when no
     * response system was supplied.
     */
    readonly reserve?: number;
  };
  /** Absent unless the corresponding system was supplied. */
  readonly patrolMetrics?: {
    readonly loopsCompletedOnTime: number;
    readonly loopsCompletedLate: number;
    readonly loopsMissed: number;
  };
  readonly deploymentMetrics?: { readonly deploymentFailures: number };
}

/**
 * The four the simulation declares, in `DeploymentPhase`'s own order, and
 * then the derived one.
 *
 * `'returning'` is appended rather than slotted next to `'travelling'`, which
 * is where it belongs by meaning, precisely so the list keeps saying which
 * four are the enum's: a reader comparing this against
 * `src/simulation/security/guard-roster.ts` sees a prefix and one addition,
 * not five members it has to diff. The rows this counts are counted here or
 * nowhere -- `countsByDeploymentPhase` sums to the whole roster, so a phase a
 * row can hold and this list omits would quietly lose a head.
 */
const DISPLAYED_DEPLOYMENT_PHASES: readonly DisplayedDeploymentPhase[] = [
  'unassigned',
  'travelling',
  'on-post',
  'on-search',
  'returning',
];

function projectRow(
  source: StaffRosterSource,
  entityId: EntityId,
  staffRoles: ContentRegistry<StaffRoleDefinition>,
  identity: ActorIdentitySource | undefined,
  sectors: SectorPostSource | undefined,
): StaffRosterRowViewModel {
  const name = identity?.getName('staff', entityId);
  const staffRoleId = source.getStaffRoleId(entityId);
  const role = staffRoles.getById(staffRoleId);
  const sectorId = source.getSectorId(entityId);
  const tile = source.getTile(entityId);
  const waypointIndex = source.getPatrolWaypointIndex(entityId);
  const loopStartedAtTick = source.getPatrolLoopStartedAtTick(entityId);

  return {
    entityId,
    ...(name !== undefined ? { name: toActorNameViewModel(name) } : {}),
    staffRoleId,
    ...(role !== undefined
      ? {
          staffRoleNameKey: role.nameKey,
          department: role.department,
          baseSecurityClearance: role.baseSecurityClearance,
          permissions: [...role.permissions].sort(compareStableIds),
        }
      : {}),
    tile: toTileViewModel(tile),
    assignment: {
      deploymentPhase: displayedDeploymentPhase(source.getDeploymentPhase(entityId), sectorId, tile, sectors),
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
  const rows = entityIds.map((entityId) => projectRow(source.staff, entityId, staffRoles, options.identity, source.sectors));

  const countsByRoleId = new Map<string, number>();
  const countsByPhase = new Map<DisplayedDeploymentPhase, number>();
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
  const reserve = source.responders === undefined ? undefined : responseReserveGuardCount(source.responders);

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    roster: pageOf(rows, request),
    countsByRoleId: staffRoles.all().map((role) => ({
      staffRoleId: role.id,
      staffRoleNameKey: role.nameKey,
      department: role.department,
      count: countsByRoleId.get(role.id) ?? 0,
    })),
    countsByDeploymentPhase: DISPLAYED_DEPLOYMENT_PHASES.map((phase) => ({
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
      spare: spareGuardCount(source.staff, (staffRoleId) => isPostEligibleStaffRoleId(staffRoleId, staffRoles)),
      ...(reserve !== undefined ? { reserve } : {}),
    },
    ...(patrolMetrics !== undefined ? { patrolMetrics } : {}),
    ...(deploymentMetrics !== undefined ? { deploymentMetrics } : {}),
  };
}
