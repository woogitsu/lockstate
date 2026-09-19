import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { ActorIdentitySource } from '../identity/actor-identity';
import type { GuardClaimKind } from '../security/guard-release';
import type { DeploymentPhase } from '../security/guard-roster';
import {
  HUD_VIEW_MODEL_SCHEMA_VERSION,
  pageOf,
  toActorNameViewModel,
  type ActorNameViewModel,
  type HudViewModelSchemaVersion,
  type PageRequest,
  type ViewModelPage,
} from './view-model';

/**
 * Which guards are held, and by what — the read model a release control needs
 * in order to aim ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
 *
 * ## The gap this closes, and why a button alone would not have
 *
 * `GuardRoster.unassign` is complete, has been since #26, and **every caller of
 * it in `src/` is inside the system that made the claim being released**. So a
 * claim whose owner had lost track of it was permanent, which is exactly what
 * [ADR 0033](./0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * measured (*"`GuardRoster.unassign`'s callers in `src/` are all unreachable for
 * an `'on-search'` guard, and no dismiss command exists"*) and what its open
 * question 3 says will recur.
 *
 * A command can fix that only if something can name a guard, and the shape of
 * the missing piece is the one `CancelBuildOrder` and `CancelMaterialPurchase`
 * were each blocked on for as long as they were: **a read model, not a control.**
 * `hud/staff` already carries `entityId` and `assignment.deploymentPhase`, and it
 * is not enough, because the fact a player needs is the one the roster cannot
 * answer: `'on-search'` is a *shared* phase, and telling a responder from a
 * searcher requires asking both claimants live, inside the simulation (ADR 0033
 * decision 4). A row saying "On Search" would leave the player to guess which of
 * two things they were about to take a guard away from.
 *
 * So this projection resolves the claim through `GuardReleaseService.claimOf` —
 * the *same* resolution the release itself performs, not a second opinion about
 * it — and reports the kind. One rule, one implementation, so the row and the
 * command can never disagree about what is holding a guard.
 *
 * ## Why it is its own projection and not more fields on `hud/staff`
 *
 * Because they answer different questions on different cadences. `hud/staff` is
 * the whole roster with names, roles, permissions, clearances, coverage and
 * patrol metrics — a panel a player opens. This is the *held* subset, which is
 * usually a handful of rows out of tens, and it is read on the counts cadence
 * while the Security tab shows, exactly as `hud/pending-deliveries` is read
 * while the Build tab shows. Widening `hud/staff` would put a per-guard claim
 * resolution — two live claimant reads per row — on every request for the full
 * roster, and would make a projection that is a *report* also be the backing
 * store for a set of controls.
 *
 * ## What it deliberately does not carry
 *
 * **No label.** `staffRoleNameKey` is the catalogue's key and `claim` is a stable
 * id; what either is *called* is resolved by the HUD at render time from
 * `deriveSimulationMessageKey('guard-claim', claim)` (ADR 0011). No sentence
 * crosses the worker boundary.
 *
 * **No incident id, search order id or sector id.** The claim *kind* is what a
 * player is deciding against — "this guard is on a contraband search" is the
 * fact that makes releasing it a choice — and naming the particular job would
 * put a second id space on the boundary with nothing able to aim at it: the
 * release command names the guard, never the claim. `docs/HUD_PROJECTIONS.md`
 * records that as a deliberate omission rather than an oversight.
 *
 * **No tile.** For `projectPendingDeliveries`'s reason: it would be a second
 * copy of a position on the boundary and needs a decision about how the HUD
 * renders it.
 *
 * ## Cost
 *
 * `O(staff x claimants)`. `claimOf` asks each `'on-search'` claimant for its
 * live claim list, and each of those builds a `Set` over its own records, so a
 * roster of *n* guards of which *k* are `'on-search'` costs *k* claim-list
 * builds. Realistic headcounts are tens to low hundreds (`docs/SECURITY.md`) and
 * *k* is bounded by the responders and searchers a session can actually staff,
 * so this inherits `projectStaff`'s own assumption rather than working around
 * it. It is a read and only a read: nothing here steps a system, advances a
 * clock or writes simulation state.
 */
export interface HeldGuardRosterSource {
  allGuardIds(): readonly EntityId[];
  getStaffRoleId(entityId: EntityId): string;
  getDeploymentPhase(entityId: EntityId): DeploymentPhase;
  getSectorId(entityId: EntityId): string | undefined;
}

/** The claim resolution, injected rather than reimplemented. `GuardReleaseService` satisfies this. */
export interface GuardClaimResolver {
  claimOf(guardId: EntityId): GuardClaimKind | undefined;
}

export interface HeldGuardProjectionSource {
  readonly staff: HeldGuardRosterSource;
  readonly claims: GuardClaimResolver;
}

export interface HeldGuardProjectionOptions {
  readonly staffRoles?: ContentRegistry<StaffRoleDefinition>;
  /**
   * Actor names (`src/simulation/identity/`). Optional for `projectStaff`'s
   * reason, and looked up by `('staff', entityId)` because a staff id and a
   * prisoner id come from two different `EntityStore`s and collide numerically.
   */
  readonly identity?: ActorIdentitySource;
}

export interface HeldGuardViewModel {
  /**
   * The staff `EntityId`, and the whole point of this read model.
   *
   * `ReleaseGuardAssignment { guardId }` names one guard, so a surface that can
   * aim it needs the ids.
   */
  readonly entityId: EntityId;
  /** Absent when no identity source was supplied, or this guard was hired without one being minted. */
  readonly name?: ActorNameViewModel;
  readonly staffRoleId: string;
  /** Absent when hired with a role id the catalog does not define. */
  readonly staffRoleNameKey?: string;
  /** What is holding this guard. Resolved by the same rule the release uses. */
  readonly claim: GuardClaimKind;
  /**
   * The roster's phase, carried beside the claim rather than instead of it.
   *
   * Not redundant: the claim says *who* holds the guard and the phase says what
   * the guard is *doing*, and the two are genuinely different for a
   * `'deployment'` claim -- `'travelling'` (on the way to a post) and
   * `'on-post'` (standing on it) are one claim and two states, and a player
   * deciding whether to pull somebody off a post may reasonably care which.
   */
  readonly deploymentPhase: DeploymentPhase;
  /** The sector a `'deployment'` claim names. Absent for the two `'on-search'` claims and for `'unattributed'`. */
  readonly sectorId?: string;
}

export interface HeldGuardsViewModel {
  readonly schemaVersion: HudViewModelSchemaVersion;
  /** Ascending entity id — canonical, and the same order the roster itself reports. */
  readonly held: ViewModelPage<HeldGuardViewModel>;
  /**
   * Fixed declared order, so a claim kind never appears and vanishes between
   * frames -- the same rule `projectStaff.countsByDeploymentPhase` follows, and
   * for the same reason: a header summarising the list must not reorder itself
   * when a count reaches zero.
   */
  readonly countsByClaim: readonly { readonly claim: GuardClaimKind; readonly count: number }[];
  readonly totals: {
    readonly hired: number;
    /** Held by anything at all. The page above may be a window onto this. */
    readonly held: number;
    /** Free right now. `hired - held`, carried rather than left to be subtracted on the far side of the wire. */
    readonly unassigned: number;
  };
}

/**
 * Declared order, not iteration order. Deliberately the same order
 * `GUARD_CLAIM_KINDS` declares, restated here for the reason
 * `projectStaff`'s `DEPLOYMENT_PHASES` is: this list is what the counts are
 * emitted in, so it is part of this projection's contract rather than a
 * borrowed detail of another module's tuple.
 */
const CLAIM_KINDS: readonly GuardClaimKind[] = ['deployment', 'incident-response', 'search', 'unattributed'];

export function projectHeldGuards(
  source: HeldGuardProjectionSource,
  request: PageRequest = {},
  options: HeldGuardProjectionOptions = {},
): HeldGuardsViewModel {
  const staffRoles = options.staffRoles ?? defaultStaffRoleRegistry;
  const entityIds = source.staff.allGuardIds();

  const rows: HeldGuardViewModel[] = [];
  const countsByClaim = new Map<GuardClaimKind, number>();

  for (const entityId of entityIds) {
    const claim = source.claims.claimOf(entityId);
    if (claim === undefined) continue; // free, and this list is about what is held

    const staffRoleId = source.staff.getStaffRoleId(entityId);
    const role = staffRoles.getById(staffRoleId);
    const name = options.identity?.getName('staff', entityId);
    // Only for a `'deployment'` claim. A responder or a searcher may still have
    // a stale `sectorId` from an earlier deployment -- `setDeploymentPhase` does
    // not clear it -- and reporting that would say a guard is posted somewhere
    // it is not.
    const sectorId = claim === 'deployment' ? source.staff.getSectorId(entityId) : undefined;

    rows.push({
      entityId,
      ...(name !== undefined ? { name: toActorNameViewModel(name) } : {}),
      staffRoleId,
      ...(role !== undefined ? { staffRoleNameKey: role.nameKey } : {}),
      claim,
      deploymentPhase: source.staff.getDeploymentPhase(entityId),
      ...(sectorId !== undefined ? { sectorId } : {}),
    });
    countsByClaim.set(claim, (countsByClaim.get(claim) ?? 0) + 1);
  }

  return {
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    held: pageOf(rows, request),
    countsByClaim: CLAIM_KINDS.map((claim) => ({ claim, count: countsByClaim.get(claim) ?? 0 })),
    totals: {
      hired: entityIds.length,
      held: rows.length,
      unassigned: entityIds.length - rows.length,
    },
  };
}
