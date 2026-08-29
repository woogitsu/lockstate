import type { EntityId } from '../entity/entity-store';
import type { GuardClaimKind, GuardReleaseService } from '../security/guard-release';
import type { GuardRoster } from '../security/guard-roster';

/**
 * Dismissing a staff member: the `DismissStaff` consumer (issue #533, the
 * owner's decision on issue #535 decision 4).
 *
 * ## What this closes
 *
 * `StaffHiringService` is the only way anybody enters `GuardRoster`, and until
 * this module **nothing in `src/` ever left it**. `hiring.ts` said so in its
 * own words -- *"nothing in `src/` ever removes a staff member from it"* -- and
 * used the sentence as an argument for a *refusal*: a role no duty can claim is
 * refused at hire precisely because the charge would otherwise be
 * unrecoverable. `PayrollSystem` bills every id the roster holds at every
 * in-game day boundary, so an unwanted hire was a standing cost with no way
 * back, measured at 80 minor units on the click and the same again that day.
 *
 * The other half of the same defect is in
 * `src/simulation/security/sector-staffing.ts`: an empty prison used to demand
 * a guard, so a player following the Staff panel's own instruction walked into
 * the trap by being obedient. Both halves are needed and neither is sufficient
 * -- one gives the player a way out, the other stops them going in.
 *
 * ## Not `ReleaseGuardAssignment`, and the two are complements
 *
 * `ReleaseGuardAssignment` (ADR 0034) says in its own schema comment that it is
 * *"Not a dismissal ... The guard stays hired. What is released is the claim,
 * not the employment -- firing destroys an entity, which is ADR 0026's subject
 * and needs its own decision about id reuse."* This is that decision, taken;
 * and the honest consequence ADR 0034 recorded -- *"`DeploymentSystem` will
 * re-assign a released guard on its next cycle if the sector is still short, so
 * releasing a deployed guard is a re-shuffle rather than a dismissal"* -- is
 * what makes a release insufficient on its own. A player who wants to stop
 * paying somebody cannot get there from a command that leaves them on the
 * payroll.
 *
 * So this **routes through** `GuardReleaseService` rather than around it. That
 * service is the one place that knows how to take a claim apart, and ADR 0034
 * argues at length why unassigning without telling the claimant is *worse* than
 * leaving the claim alone: a search job would keep routing somebody who is no
 * longer there and record a confiscation as found by them, and a response would
 * keep counting them toward `arrivedGuardIds`. All of that is true of a guard
 * who has been deleted, and more sharply -- the id names nobody at all.
 *
 * ## What happens to a guard mid-task, step by step
 *
 * The ordering is the whole correctness argument, and it is
 * `src/simulation/prisoners/release.ts`'s with one step added at the front:
 *
 * 1. **The roster is asked first.** Everything below reads the id; an id the
 *    roster does not hold is refused and nothing is touched.
 * 2. **The path request is read before anything can clear it**, because
 *    `GuardReleaseService.release` calls `GuardRoster.unassign`, which sets
 *    `pathRequestId` to `undefined` without telling navigation.
 * 3. **The route is cancelled, both halves.** `cancelRequest` drops a request
 *    still queued and `clearResult` drops one already resolved and waiting to
 *    be collected; a travelling guard can be in either state and the one left
 *    behind is a `Map` entry nothing would ever remove.
 *
 *    **This is the mistake this module exists to not repeat.** Before this
 *    change `NavigationSystem.cancelRequest` had exactly one caller in all of
 *    `src/` -- `releasePrisoner` -- so no guard's route had ever been
 *    cancelled by anything, because no guard had ever gone away. A dismissal
 *    that skipped it would leak one entry per travelling guard dismissed, for
 *    the life of the session and, through the navigation snapshot, of the save.
 * 4. **The claim is released through its claimant**, and only when there is one.
 *    `GuardReleaseService.release` refuses `'not-held'` for an `'unassigned'`
 *    guard, which is a correct answer to *that* command and the wrong shape for
 *    this one -- dismissing an idle guard is the ordinary case, not a race. So
 *    `claimOf` decides whether to call it, exactly as the service's own
 *    `release` does internally.
 * 5. **Contraband leaves with them.** A staff member is a `ContrabandHolder`
 *    kind (`src/simulation/contraband/item.ts`) and the registry is keyed by the
 *    *stringified* id, which is the one store `dismissStaffCompletely`'s
 *    reflection gate structurally cannot see -- `release.ts` documents the same
 *    hole for prisoners and it is repeated here for the same reason.
 * 6. **The name is given back.** `ActorIdentityRegistry.release`'s own contract
 *    says it is *"**Required** when the actor is destroyed"*, and
 *    `GuardRoster.hire` names this module as the thing that would have to do it:
 *    *"`release` on destroy is what actually prevents that"*.
 * 7. **The roster record**, once nothing else needs to read it.
 * 8. **The entity last**, after which the id names nobody.
 *
 * ## Entity ids, and why generation wrap is not this change's problem
 *
 * It would have been. `EntityStore` packs 20 index bits and 12 generation bits
 * -- 32 of 32, no spare -- and before ADR 0026 question 1 was answered a slot's
 * 4,096th death wrapped its generation back to the value its first life carried
 * and put the index straight back on the free list, so the next `spawn()` there
 * produced an id indistinguishable from a handle a caller might still hold.
 * Adding the first staff destroy path would have made that reachable for staff
 * for the first time.
 *
 * **It was answered separately, before this** (#169, ADR 0026 question 1 option
 * A): `EntityStore.destroy` now *retires* a slot dying at generation 4,095
 * rather than recycling it, so the id genuinely never comes back and there is
 * no stale handle to confuse with a live one. Nothing here has to widen the
 * generation field, which could only be paid for out of the index field and
 * would halve capacity.
 *
 * What this change does newly reach is the **other** end of retirement, and it
 * is a real defect this module fixes rather than a theoretical one: see
 * `StaffHiringService`'s `roster-full` check, which compared a live headcount
 * against capacity. A headcount is not the question `spawn()` asks. With
 * retirement, a store can be out of indices while the headcount is well below
 * capacity -- so a headcount gate would pass and `spawn()` would throw out of
 * the kernel's command handler, which is a crashed tick rather than a refusal.
 * `EntityStore.canSpawn` was written for exactly this and says so.
 *
 * ## Money: neither refund nor severance, and that is deliberate
 *
 * Nothing here touches the treasury. A hire pays one day's wage at the click
 * and payroll bills the same figure again at the day boundary, so a guard's
 * first day costs two days' wage; the money that stops is the *future* payroll,
 * which stops by itself the moment the roster no longer holds the id.
 *
 * A refund would make hire-then-dismiss a way to get money back for a day
 * already worked, and it would interact with the double charge in a way nobody
 * chose. A severance charge would take money from a player whose whole reason
 * for pressing this is that they cannot afford the wage -- which is exactly the
 * state issue #533 was measured in, 25,000 spent down to 0 with arrears
 * accruing. Both of those are *balance*, and balance is the owner's
 * (`AGENTS.md`, "The owner's standing mandate"); the neutral option is the one
 * that decides nothing on their behalf. This is stated rather than left
 * implicit so that a later balance pass has something to disagree with, exactly
 * as `DEFAULT_SECTOR_PRISONERS_PER_GUARD` does.
 *
 * ## Persistence
 *
 * **No save-format change, no `SAVE_SCHEMA_VERSION` bump, no migration**, and
 * the reason is that a dismissal writes no new *kind* of value. The guard
 * roster's payload is an `EncodedEntityStoreSnapshot` plus a list of
 * `[EntityId, GuardRecord]` pairs; a dismissal shortens the list and marks a
 * slot dead in the ledger, both of which that payload has always been able to
 * express. `entity-codec.ts` run-length encodes `generations` and `alive` in
 * full and writes the free list's live prefix verbatim, so a recycled staff
 * index round-trips at the same index under the same id.
 *
 * A save written **before** this command loads unchanged: there is no field to
 * be absent. A save written **after** it loads on an older build for the same
 * reason -- ADR 0038's rule is that a build refuses a *value it cannot
 * interpret*, and a dead slot with a bumped generation is a value every build
 * since the store was written interprets, and has interpreted for prisoners
 * since #441. ADR 0065's quarantine covers the case where an older build
 * *does* refuse a newer save; nothing here adds a refusal for it to catch.
 *
 * ## Determinism
 *
 * Draws nothing, reads no clock of its own, and every step is a keyed delete
 * whose result does not depend on the order a `Map` happens to hold. The tick
 * is taken as a parameter for the contraband step alone, which writes a
 * movement-log entry that must be stamped with the tick the departure actually
 * happened on.
 */

/**
 * Cancelling the route a departing staff member was walking. `NavigationSystem`
 * satisfies it; a narrow port keeps `staff/` from depending on the navigation
 * module for one call it makes at most once per dismissal. Identical in shape
 * to `PrisonerRouteCancelPort` and deliberately not shared with it -- the two
 * name different departures, and a single type would make a change to one a
 * silent change to the other.
 */
export interface StaffRouteCancelPort {
  cancelRequest(id: string): boolean;
  clearResult(id: string): void;
}

/** Dropping a departing staff member's name. `ActorIdentityRegistry` satisfies it. */
export interface StaffNameReleasePort {
  release(kind: 'staff', entityId: EntityId): boolean;
}

/**
 * Taking a departing staff member's contraband out of the prison with them.
 * `ContrabandRegistry` satisfies it through `departHolder`.
 *
 * Keyed by the *stringified* entity id, which is why this port is documented
 * rather than added quietly: `ContrabandHolder.id` is a string, so the
 * reflection gate in `tests/unit/staff-dismissal-completeness.test.ts` -- which
 * walks the session graph looking for the numeric id -- cannot see a leak here.
 * `PrisonerContrabandReleasePort` carries the same warning for the same reason.
 */
export interface StaffContrabandReleasePort {
  departHolder(kind: 'staff', id: string, atTick: number): readonly string[];
}

/**
 * The claim view and the one release this dismissal delegates.
 * `GuardReleaseService` satisfies it, and a structural type is used rather than
 * the class so a test can measure the ordering without standing up two
 * claimants.
 */
export type StaffClaimReleasePort = Pick<GuardReleaseService, 'claimOf' | 'release'>;

/**
 * Every store a departing staff member has to be dropped from, named in one
 * place -- `PrisonerReleaseSurfaces`' counterpart, and it exists for the reason
 * that type states: ADR 0026 question 2 does not ask whether release should
 * drop these, it asks **what mechanism keeps the list complete**. This type is
 * the weaker half of the answer; the executable half is
 * `tests/unit/staff-dismissal-completeness.test.ts`, which walks the real
 * session's object graph and does not read this file at all.
 *
 * `roster` and `claims` are required because a dismissal without either is not
 * a dismissal. The three ports below are optional for the reason
 * `PrisonerReleaseSurfaces`' four are: they are session-level stores that span
 * staff and prisoners, no fixture standing up the roster alone has them, and an
 * absent store holds no entry to leak. `exactOptionalPropertyTypes` is on, so an
 * omitted key and an explicit `undefined` are different things and neither can
 * be a silently skipped required store.
 */
export interface StaffDismissalSurfaces {
  readonly roster: GuardRoster;
  readonly claims: StaffClaimReleasePort;
  readonly navigation?: StaffRouteCancelPort;
  readonly identity?: StaffNameReleasePort;
  readonly contraband?: StaffContrabandReleasePort;
}

/**
 * Why a dismissal was refused.
 *
 * **One**, and the shape of the union matters more than its size: a bare
 * `boolean` could not be reported to the player at all, because
 * `tests/unit/simulation-refusals.test.ts` requires every wire reason to come
 * from an exhaustive `Record` over a closed union. `GuardReleaseRefusalReason`
 * gained a named union for exactly this reason and this follows it.
 *
 * `'unknown-staff'` covers both ways the roster can fail to hold the id -- never
 * hired, and already dismissed -- and they are deliberately one reason rather
 * than two. A player pressing Dismiss twice on a row a cadence-stale projection
 * still shows has done nothing wrong and needs one sentence, not a distinction
 * between two states that are both "there is nobody here". `EntityStore.destroy`
 * already collapses the same pair into one no-op, on the same grounds.
 *
 * There is no `'still-on-duty'` refusal, and its absence is a decision:
 * dismissing a guard mid-patrol is the case a player most wants and the whole
 * subject of the ordering above. A prison that could only sack idle staff would
 * have re-created the trap for anybody whose one guard is permanently posted --
 * which is the state issue #533 was measured in.
 */
export type StaffDismissRefusalReason = 'unknown-staff';

/** What a dismissal did. `dismissed` is not a refusal. */
export type StaffDismissOutcome =
  | {
      readonly kind: 'dismissed';
      /** The role the departed staff member held. The one fact the caller cannot recompute afterwards. */
      readonly staffRoleId: string;
      /** What had been holding them, or `undefined` if nothing had. Carried for the reason `GuardReleaseOutcome.releasedFrom` is. */
      readonly releasedFrom: GuardClaimKind | undefined;
    }
  | { readonly kind: 'refused'; readonly reason: StaffDismissRefusalReason };

/**
 * Removes one staff member from the prison completely: the claim holding them
 * is given back through its claimant, every store keyed by their id forgets
 * them, and the entity is destroyed so its index returns to the free list.
 *
 * Answers `refused` -- and touches nothing -- for an id the roster does not
 * hold, so a double dismissal and a stale handle are both refusals rather than
 * a partial teardown of whoever occupies that slot now.
 *
 * See the module comment above for why each step is where it is.
 */
export function dismissStaff(
  surfaces: StaffDismissalSurfaces,
  entityId: EntityId,
  atTick = 0,
): StaffDismissOutcome {
  const { roster, claims } = surfaces;
  if (!roster.allGuardIds().includes(entityId)) return { kind: 'refused', reason: 'unknown-staff' };

  const staffRoleId = roster.getStaffRoleId(entityId);

  // Read before step 4 can clear it: `GuardReleaseService.release` unassigns,
  // and `GuardRoster.unassign` drops the request id without telling navigation.
  const pathRequestId = roster.getPathRequestId(entityId);
  if (pathRequestId !== undefined && surfaces.navigation !== undefined) {
    surfaces.navigation.cancelRequest(pathRequestId);
    surfaces.navigation.clearResult(pathRequestId);
  }

  // Only where there is a claim: `release` answers `'not-held'` for an
  // `'unassigned'` guard, which is the right answer to `ReleaseGuardAssignment`
  // and the wrong shape for this command.
  const releasedFrom = claims.claimOf(entityId);
  if (releasedFrom !== undefined) claims.release(entityId);

  surfaces.contraband?.departHolder('staff', String(entityId), atTick);
  surfaces.identity?.release('staff', entityId);

  roster.forget(entityId);
  return { kind: 'dismissed', staffRoleId, releasedFrom };
}

/**
 * The `DismissStaff` consumer, as a service.
 *
 * A class for `StaffHiringService`'s and `GuardReleaseService`'s reason rather
 * than a new one: it owns no tick work and no state, so it is constructed on
 * the runtime and called from the session's command handler rather than
 * registered on the kernel. What it holds is the surfaces, so the command
 * handler names a guard id and nothing else -- the same division
 * `ReleaseGuardAssignment` already draws, and for the same reason: which stores
 * a departure touches is not something the main thread's stale copy may decide.
 */
export class StaffDismissalService {
  public constructor(private readonly surfaces: StaffDismissalSurfaces) {}

  public dismiss(entityId: EntityId, atTick = 0): StaffDismissOutcome {
    return dismissStaff(this.surfaces, entityId, atTick);
  }
}
