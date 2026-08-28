import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry, isPostEligibleStaffRole } from '../../content/staff-role-catalog';
import type { Treasury } from '../economy/treasury';
import { staffDailyWageForRole, staffDailyWageMinorUnits } from '../economy/wages';
import type { EntityId } from '../entity/entity-store';
import type { GuardRoster } from '../security/guard-roster';
import type { TilePosition } from '../world/coordinates';

/**
 * Hiring a staff member: the `HireStaff` consumer
 * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
 *
 * ## What this closes
 *
 * `GuardRoster.hire` was complete and had **zero callers anywhere in `src/`**.
 * Every call in the repository was in `tests/`, so the four systems that read
 * the roster -- `DeploymentSystem`, `PatrolSystem`, `IncidentResponseSystem`
 * and `SearchSystem` -- iterated an empty collection in every session a player
 * could start, and the status strip's `Staff` count was structurally zero. The
 * roster is still the only staff store there is; this is the way to put
 * somebody in it.
 *
 * ## A service, not a system
 *
 * It owns no tick work, exactly like `RoomZoningService` and `Treasury`: a
 * hire happens at the tick its command is dispatched and nothing about it
 * needs revisiting on a later one. So it is constructed on the runtime and
 * called from the session's command handler rather than registered on the
 * kernel.
 *
 * It holds **no state of its own** either, which is why nothing here is
 * snapshotted: the money is the treasury's and the staff are the roster's, and
 * both are already in the save.
 *
 * ## What it costs, and who owns that number
 *
 * One day at the bottom of the role's authored wage band -- `wageBand.minPerDay`
 * from `src/content/staff-role-catalog.ts`, read as the treasury's minor units
 * because that is the only money scale in this tree. **No number is chosen
 * here.** ADR 0025 decision 2 records which authored field is read and states
 * that what the field holds is content owned by issue #29, which the
 * catalogue's own comment on `wageBand` says as well.
 *
 * It is an engagement charge **beside** the payroll rather than instead of it,
 * and that sentence used to read the other way. It said: *"It is an engagement
 * charge and **not a payroll**: it does not recur, it creates no schedule, and
 * it is therefore not [ADR 0017] decision 3's standing cost. That matters
 * beyond tidiness -- decision 8's insolvency ladder is unreachable precisely
 * because no charge a player cannot decline exists."* The last clause was true
 * when it was written and stopped being true with
 * `src/simulation/economy/payroll.ts`, which charges the same authored figure
 * at every in-game day boundary the role is on the roster for. The charge here
 * has not changed and neither has ADR 0025 decision 2; what changed is the
 * world around it.
 *
 * **The consequence worth naming rather than hiding:** a hire pays one day's
 * wage up front and the day boundary bills the same day again, so a guard
 * engaged at any point during a day costs two days' wage for that day. The
 * alternative is a per-guard hire tick in the save so payroll can skip a
 * same-day hire, which is a persisted field bought for a rounding difference
 * of one day's wage on a hire that is already a standing cost.
 *
 * Nothing here can produce a negative balance, and neither can payroll: it
 * pays what the treasury holds and carries the rest as arrears, for reasons
 * `payroll.ts` gives at length.
 */

/**
 * Why a hire was refused.
 *
 * Four, and they are the four this service can produce. Mapped onto the wire
 * through an exhaustive `Record` in `src/simulation/refusals/refusal-log.ts`,
 * so a fifth added here fails to compile until somebody decides what the
 * player is told about it.
 *
 * **`no-duty-for-role` is the fourth**
 * ([ADR 0053](../../../docs/adr/0053-who-may-stand-a-security-post.md)
 * decision 2, issue #456). The sentence above is why it is a refusal rather
 * than a hire that quietly does nothing: this service is the only way anybody
 * reaches `GuardRoster`, nothing in `src/` ever removes a staff member from
 * it, and `PayrollSystem` bills every id it holds at every in-game day
 * boundary -- so hiring a role no duty can claim is an unrecoverable standing
 * cost for no effect, and the player has no channel that would tell them.
 * A refusal has one: `src/simulation/refusals/refusal-log.ts` carries it to the
 * status strip, where `src/ui/simulation-alerts.ts` maps the id onto an
 * authored sentence -- a resolved message key and never a raw dotted id, which
 * is what issue #409 asks of a refusal the player did not expect.
 */
export type StaffHireRefusalReason = 'unknown-role' | 'no-duty-for-role' | 'insufficient-funds' | 'roster-full';

/** What a hire did. `hired` is not a refusal. */
export type StaffHireOutcome =
  | { readonly kind: 'hired'; readonly entityId: EntityId; readonly paidMinorUnits: number }
  | { readonly kind: 'refused'; readonly reason: StaffHireRefusalReason };

export interface StaffHireRequest {
  /** A stable `staff-role.*` id from the staff-role catalogue, never a message key. */
  readonly staffRoleId: string;
  /** Where the new staff member first stands. See ADR 0025 decision 4 for why the producer, and not this service, decides it. */
  readonly originTile: TilePosition;
}

/**
 * What one hire costs, in the treasury's minor units.
 *
 * Exported so a producer can render the figure it is about to spend without
 * reaching into the catalogue and re-deciding which end of the band to read --
 * one definition of the charge, on both sides of the worker boundary.
 * `undefined` for a role the registry does not declare, which is the same
 * answer `hire` refuses on.
 */
export function staffHireCostMinorUnits(
  staffRoleId: string,
  staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
): number | undefined {
  return staffDailyWageMinorUnits(staffRoleId, staffRoles);
}

export class StaffHiringService {
  public constructor(
    private readonly roster: GuardRoster,
    private readonly treasury: Treasury,
    private readonly staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
  ) {}

  /**
   * Hires, or refuses and changes nothing.
   *
   * The order of the four checks is the whole of the correctness argument:
   * every refusal has to leave the treasury, the roster and the entity store
   * exactly as it found them, so the money is spent only once the role has
   * resolved and the roster has been shown to have room. There is no ordering
   * of these in which money leaves and nobody arrives.
   */
  public hire(request: StaffHireRequest): StaffHireOutcome {
    const role = this.staffRoles.getById(request.staffRoleId);
    if (role === undefined) return { kind: 'refused', reason: 'unknown-role' };

    /*
     * The department gate (ADR 0053 decision 2), second because it needs the
     * resolved role and nothing else -- no money has moved and no entity has
     * been spawned, so the "every refusal leaves the world as it found it"
     * argument above covers it without any new reasoning.
     *
     * It is checked here rather than only where staff are claimed for duty
     * because the two answer different questions. `claimableGuardIds` decides
     * who may be *sent*; this decides who the prison may *take on*, and a
     * prison that took on a nurse it can never send anywhere would be paying
     * for her for the rest of the save. Both are needed: a save written before
     * this change can carry an ineligible staff member, and no refusal can
     * reach backwards into one.
     */
    if (!isPostEligibleStaffRole(role)) return { kind: 'refused', reason: 'no-duty-for-role' };

    /*
     * A guard against a throw, not a policy.
     *
     * `EntityStore.spawn()` throws `'EntityStore capacity exhausted'`, and a
     * throw out of the kernel's command handler is not a refusal -- it is a
     * crashed tick, on a command the worker has already acknowledged as
     * queued. Comparing the headcount with the capacity turns that structural
     * fault into the ordinary refusal the player is told about, which is the
     * reading `Treasury.spend` already takes of a purchase nobody can afford.
     *
     * `allGuardIds().length` is the live headcount rather than a high-water
     * mark: nothing dismisses a guard, so this store's occupancy cannot yet
     * disagree with it. **The guard store, specifically** -- this comment used
     * to say "nothing in `src/` destroys an entity (#31)", and since #441 gave
     * a prisoner's sentence an end that is false of the *prisoner* store, which
     * recycles indices in an ordinary session. Staff and prisoners are two
     * `EntityStore`s, and no path in `src/` destroys a staff entity. The
     * reading was already the one that survives a destroy path arriving here,
     * which is why nothing needs to change but the sentence.
     */
    if (this.roster.allGuardIds().length >= this.roster.entityStore.capacity) {
      return { kind: 'refused', reason: 'roster-full' };
    }

    const paidMinorUnits = staffDailyWageForRole(role);
    if (!this.treasury.spend(paidMinorUnits)) return { kind: 'refused', reason: 'insufficient-funds' };

    return { kind: 'hired', entityId: this.roster.hire(role.id, request.originTile), paidMinorUnits };
  }
}
