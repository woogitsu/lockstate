import { describe, expect, it } from 'vitest';
import { defaultObjectRegistry } from '../../src/content/object-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { resolveAccommodationTargets } from '../../src/simulation/prisoners/intake-system';
import { SOLITARY_SANCTION_ROOM_CATALOG_ID } from '../../src/simulation/prisoners/sanction-system';

/**
 * Which catalogue rooms a prisoner's day can actually route through, computed
 * from the shipped content rather than counted by hand.
 *
 * ## Why this is not `unconsumed-content-contract.test.ts`
 *
 * That file measures whether a content id appears as a single-quoted literal
 * anywhere under `src/` or `tests/`. It is the right measure for "could this id
 * be deleted without someone reading why it is there", and it is the wrong one
 * for "does the game do anything with this room" -- **and the gap between the
 * two is six rooms wide.** `room.reception`, `room.security-office` and
 * `room.infirmary` each graduated that file's `AWAITING_CONSUMER` list by
 * gaining a *test* that furnishes one; `room.delivery-bay` and
 * `room.storage-room` sit in its `PROTECTED_BY_DECISION` list; and
 * `room.holding-cell` graduated by being named in a zoning test. All six read
 * as consumed there. Not one of them is somewhere a prisoner can go.
 *
 * **`room.delivery-bay` left that list at `71617799` (2026-08-30), and the
 * sentence above is corrected rather than replaced -- 2026-09-02.** It gained
 * a test consumer at that commit and graduated out of *both* of that file's
 * lists, so `room.storage-room` alone sits in `PROTECTED_BY_DECISION` and
 * `room.delivery-bay` reads as consumed there for the same reason the other
 * four do. **The six-room count and every word about the gap are unaffected:**
 * all six still read as consumed one directory over and none of them is
 * anywhere a prisoner can go, which is the whole claim. Only the route by
 * which one of the six got there changed.
 *
 * So this file asks the other question, and asks it of the mechanisms rather
 * than of the text: **for each room type in `src/content/room-catalog.ts`, is
 * there any authored route by which a prisoner ends up in it?** There are
 * exactly three such mechanisms in `src/simulation/`, and each contributes its
 * own list below so that losing one is visible on its own line:
 *
 * 1. `DEFAULT_ACTIONS` entries whose `target.kind` is `'room-catalog-id'`
 *    (`ActionSystem.resolveTargetInstance` -> `findAvailableForUse`).
 * 2. The `AccommodationPolicy`'s targets, over every classification group
 *    (`IntakeSystem` -> `findAvailableResidence`).
 * 3. `SanctionSystem`'s solitary relocation.
 *
 * An `own-accommodation` action names no room and therefore adds nothing here:
 * it resolves by the instance id mechanism 2 assigned, so the rooms it reaches
 * are exactly mechanism 2's.
 *
 * ## What the tally on issue #553 said, and what it left out
 *
 * *"Nine of eighteen rooms still have no action targeting them."* Re-derived
 * here, that number is right -- and `docs/AGENT_WORKFLOW.md` §4 is right that a
 * sentence stating a count rots first, which is the whole reason it is computed
 * below instead of repeated. What the sentence leaves out is that the nine are
 * not an arbitrary nine: **every unrouted room but two sits in a room *category*
 * no routed room shares** (`operations`, `medical`, `administration`,
 * `logistics`, `utility`), and those five categories describe work the prison
 * does rather than anything a prisoner needs. The two exceptions are
 * `room.holding-cell` (`housing`, beside `room.cell`) and `room.security-office`
 * (`security`, beside `room.solitary-cell`), and each has its own blocker
 * recorded in `UNROUTED` below.
 *
 * That is why this file's allowlist carries a *mechanical* reason per room --
 * the capability with no reader, the derived capacity that is always zero, the
 * system that was never wired -- and not a plan. Inventing the plan is the
 * defect this repository spends the most effort on.
 */

const rooms = defaultRoomContentRegistry.all();
const declaredRoomIds = rooms.map((room) => room.id);

const sorted = (ids: Iterable<string>): readonly string[] => [...new Set(ids)].sort();

const routedByAction = sorted(
  DEFAULT_ACTIONS.flatMap((action) =>
    action.target.kind === 'room-catalog-id' ? [action.target.roomCatalogId] : [],
  ),
);

const routedByAccommodation = sorted(resolveAccommodationTargets().map((target) => target.roomCatalogId));

const routedBySanction = sorted([SOLITARY_SANCTION_ROOM_CATALOG_ID]);

const routed = new Set([...routedByAction, ...routedByAccommodation, ...routedBySanction]);
const unrouted = declaredRoomIds.filter((id) => !routed.has(id)).sort();

/**
 * A room a player can zone, furnish to its authored requirements and see
 * reported complete, which no prisoner can be routed into -- with the reason
 * stated as a fact about this tree today.
 *
 * **Not a roadmap.** Each entry says what is verifiably true now: which
 * capability has no reader, which derived number is always zero, which system
 * is constructed and never fed. Where a decision names the room, the decision
 * is cited rather than paraphrased.
 *
 * The exit from this list is the same one `unconsumed-content-contract.test.ts`
 * describes: an id leaves because something started using it, and its entry is
 * deleted in that change rather than reworded. The stale-entry gate below is
 * what makes that mandatory.
 */
const UNROUTED: Readonly<Record<string, string>> = {
  // **This entry's reason was falsified by ADR 0093 and is rewritten rather
  // than deleted, because the room is still unrouted**: the membership rule
  // this list applies is *"no prisoner can be routed into it"*, and a carry
  // routes a prisoner to a **tile**, not to a room instance. What it used to
  // say is kept so the change is visible, and both of its clauses are now
  // false -- it read *"`src/simulation/runtime/new-session.ts` records that the
  // purchase path delivers straight into the construction container instead:
  // 'No session instantiates that room ... so there is no bay to deliver to'.
  // `object.loading-dock-door`'s `delivery-access` capability has no reader."*
  'room.delivery-bay':
    'ADR 0017 names it the physical route for procured materials and ADR 0093 built it, so `delivery-access` now has a reader: `DeliveryBayCarryRoute` (`src/simulation/operations/delivery-route.ts`) takes the first bay instance holding it and binds `container:<instanceId>` to it. No prisoner is *routed into* the bay even so -- `action.carry`\'s target is `{ kind: \'job-board\' }`, `resolveTargetInstance` answers a job rather than a `RoomInstance`, the carrier walks to `job.sourceTile` (which happens to be the bay\'s anchor), and `currentActionTargetInstanceId` is deliberately not written for a carry (ADR 0093 decision 1). No `DEFAULT_ACTIONS` entry names `room.delivery-bay`, no `AccommodationPolicy` does, and no sanction does.',
  'room.garbage-room':
    '`object.waste-bin`\'s `waste-disposal` capability has no reader, and nothing in `src/simulation/` produces waste for it to take: there is no quantity a bin could hold and no job that empties one.',
  'room.holding-cell':
    'Its only authored object requirement is `object.bench`, which declares `seating` and `recreation` and not `sleep-surface` -- so `deriveRoomCapacity` gives every holding cell `residentCapacity: 0` and `findAvailableResidence` can never answer one. Naming it in an `AccommodationPolicy` alone would change nothing.',
  'room.infirmary':
    '`object.medical-bed`\'s `medical-treatment` capability has no reader, and nothing in `src/simulation/` models injury or illness -- `IncidentResponseSystem` records an assault\'s instigator and no victim state at all. Its `sleep-surface` beds do give it a `residentCapacity`, which no `AccommodationPolicy` names; `protocol/types.ts` records that asymmetry on `accommodationCapacity`.',
  'room.reception':
    "`INTAKE_STAGES`' `'reception'` is a stage of the arrival record rather than a place (`src/simulation/prisoners/components.ts`), and the only room ids `IntakeSystem` names are its accommodation targets.",
  'room.security-office':
    '`object.security-console`\'s `surveillance` capability has no reader. A guard stands on their sector\'s `postTile`, which `deriveDefaultSecuritySector` derives from the world\'s owned chunks and which names no room.',
  'room.staff-room':
    'Staff have no needs and no day: `DeploymentSystem` posts a guard to a sector, `PayrollSystem` pays them, and neither reads a room instance. `object.desk`\'s `workstation` capability has no reader.',
  // **Rewritten for the same reason as `room.delivery-bay` above, and the same
  // way.** It read: *"`ContainerRegistry` holds exactly one container in a new
  // session, the construction materials one, and no container is bound to a
  // room instance. `object.storage-rack`'s `item-storage` capability has no
  // reader."* The first clause is still true of a *new* session; the other two
  // are not true of any session whose player has built the route.
  'room.storage-room':
    'ADR 0017 names it the destination for procured materials and ADR 0093 built that half, so `item-storage` now has a reader: `DeliveryBayCarryRoute` (`src/simulation/operations/delivery-route.ts`) takes the first storeroom instance holding it and binds it to `CONSTRUCTION_MATERIALS_CONTAINER_ID`. #99\'s dismantle salvage is still unbuilt. No prisoner is *routed into* it either -- a carrier walks to `job.destinationTile` under an action whose target is the job board, so no `DEFAULT_ACTIONS` entry, `AccommodationPolicy` or sanction names this room.',
  'room.utility-room':
    '`UtilityNetwork` is constructed twice in `src/simulation/runtime/new-session.ts` and `addNode` is never called from `src/`, so both networks are permanently empty and nothing binds a node to a placed object. `object.utility-panel`\'s `utility-control` capability has no reader.',
};

/**
 * The concurrent-use ceiling a room furnished to exactly its authored
 * `minQuantity` requirements derives for the capability its action consumes,
 * by ADR 0028 decision 2 as amended by issue #326: the summed `footprint.width`
 * of the objects declaring that capability.
 *
 * Computed from the two catalogues, not from the registry, because the question
 * is about what the *content* promises a player who furnishes the room the
 * panel told them to furnish -- no session, no placement, no instance.
 */
function ceilingAtAuthoredMinimum(roomId: string, capability: string): number {
  const room = defaultRoomContentRegistry.getById(roomId);
  if (room === undefined) return 0;
  let total = 0;
  for (const requirement of room.requirements) {
    if (requirement.type !== 'object') continue;
    const object = defaultObjectRegistry.getById(requirement.objectId);
    if (object === undefined || !object.capabilities.includes(capability)) continue;
    total += requirement.minQuantity * object.footprint.width;
  }
  return total;
}

describe('every catalogue room is either routed into a prisoner day or accounted for', () => {
  it('reports each routing mechanism separately, so losing one is visible on its own line', () => {
    /*
     * Exact lists rather than counts, and one list per mechanism, because the
     * failure this guards is a *room* quietly leaving a prisoner's reach --
     * which a total would hide whenever another room arrived in the same
     * change. `unconsumed-content-contract.test.ts` gives the argument for
     * exactness ("a number drifting quietly"); this adds that the three
     * mechanisms are separately falsifiable, so deleting the sanction
     * relocation or emptying the accommodation policy fails on the line that
     * names it rather than on a total that could be made to balance.
     *
     * `room.solitary-cell` deliberately appears twice. It is reachable by two
     * different mechanisms and collapsing them would mean the test could not
     * tell a prison where sanctions relocate nobody from one where they work.
     */
    expect({
      declared: declaredRoomIds.length,
      routedByAction,
      routedByAccommodation,
      routedBySanction,
      unrouted,
    }).toEqual({
      declared: 18,
      routedByAction: [
        'room.canteen',
        'room.classroom',
        'room.common-room',
        'room.kitchen',
        'room.laundry',
        'room.shower-room',
        'room.yard',
      ],
      routedByAccommodation: ['room.cell', 'room.solitary-cell'],
      routedBySanction: ['room.solitary-cell'],
      unrouted: [
        'room.delivery-bay',
        'room.garbage-room',
        'room.holding-cell',
        'room.infirmary',
        'room.reception',
        'room.security-office',
        'room.staff-room',
        'room.storage-room',
        'room.utility-room',
      ],
    });
  });

  it('scans a non-trivial catalogue and a non-trivial action set, so this cannot pass vacuously', () => {
    // Each half can fail *silently* rather than loudly. An empty room registry
    // would make every list empty and `unrouted` empty with them, which reads
    // as "nothing is wrong"; an empty `DEFAULT_ACTIONS` would move every room
    // into `unrouted`, where the allowlist below would then have to grow -- but
    // the exact-list assertion above would already have caught that one. This
    // is the check for the direction that would otherwise assert about nothing.
    expect(declaredRoomIds.length).toBeGreaterThan(10);
    expect(new Set(declaredRoomIds).size).toBe(declaredRoomIds.length);
    expect(DEFAULT_ACTIONS.filter((action) => action.target.kind === 'room-catalog-id').length).toBeGreaterThan(3);
    expect(resolveAccommodationTargets().length).toBeGreaterThan(0);
  });

  it('lists every unrouted room with a reason, and holds no entry for one that has since gained a route', () => {
    const unlisted = unrouted.filter((id) => UNROUTED[id] === undefined);
    expect(
      unlisted,
      'a room a prisoner can no longer be routed into: add it to UNROUTED with the mechanical reason, not a plan',
    ).toEqual([]);

    // The allow-list-that-fails-when-an-entry-goes-stale shape, for the reason
    // `unconsumed-content-contract.test.ts` gives: without this the list only
    // grows and would eventually describe a prison the game left behind.
    // Restricted to declared ids so that a *deleted* room fails the next case
    // with its reason rather than failing here with a wrong diagnosis.
    const declared = new Set(declaredRoomIds);
    const stale = Object.keys(UNROUTED).filter((id) => declared.has(id) && routed.has(id));
    expect(stale, 'these rooms now have a route into a prisoner day: delete their entries in the same change').toEqual([]);

    for (const [id, reason] of Object.entries(UNROUTED)) {
      expect(reason.trim().length, `${id} needs a reason`).toBeGreaterThan(40);
    }
  });

  it('still declares every room the list names', () => {
    const declared = new Set(declaredRoomIds);
    const removed = Object.keys(UNROUTED).filter((id) => !declared.has(id));
    expect(
      removed.map((id) => `${id}: ${UNROUTED[id]}`),
      'a room this list accounts for is no longer declared -- if the removal is deliberate, delete its entry in the same change',
    ).toEqual([]);
  });

  /**
   * The player-facing invariant, and the only assertion here that is not a
   * statement about the status quo: **a room furnished to exactly the
   * requirements the Rooms panel enumerates must admit at least one prisoner.**
   *
   * It is the content half of issue #326's defect. That issue measured a
   * capability-blind ceiling admitting nineteen diners to a canteen that seats
   * six; the mirror image is an action naming a capability that *none* of its
   * room's authored requirements declares, which derives a ceiling of zero and
   * makes the room refuse everybody while every requirement reads satisfied.
   * Nothing in `src/` can catch that: `concurrentUseCapacityFor` reads the
   * objects that are standing in the room, and a player who has furnished the
   * room exactly as told is the only one who finds out.
   *
   * The figures are the ones ADR 0071's density table is derived from, quoted
   * there per room, and they are asserted rather than recomputed here so that
   * an authored `minQuantity` or a footprint changing under one of these rooms
   * fails with the number it moved to.
   */
  it('admits at least one prisoner to every room furnished to exactly its authored requirements', () => {
    const ceilings = Object.fromEntries(
      DEFAULT_ACTIONS.flatMap((action) =>
        action.target.kind === 'room-catalog-id' && action.requiredObjectCapability !== undefined
          ? [[action.id, ceilingAtAuthoredMinimum(action.target.roomCatalogId, action.requiredObjectCapability)] as const]
          : [],
      ),
    );

    expect(ceilings).toEqual({
      'action.eat-meal': 6,
      'action.shower': 2,
      'action.common-room-recreation': 4,
      'action.classroom-education': 2,
      'action.laundry-work': 4,
      'action.kitchen-work': 4,
    });

    for (const [actionId, ceiling] of Object.entries(ceilings)) {
      expect(ceiling, `${actionId} names a capability no authored requirement of its room declares`).toBeGreaterThan(0);
    }

    // `action.yard-recreation` is the one room action naming no capability, so
    // it has no object-derived ceiling to check: ADR 0071 bounds it by the
    // room's own ground instead. Asserted so that a capability added to it
    // arrives here rather than silently leaving this case empty.
    expect(
      DEFAULT_ACTIONS.filter(
        (action) => action.target.kind === 'room-catalog-id' && action.requiredObjectCapability === undefined,
      ).map((action) => action.id),
    ).toEqual(['action.yard-recreation']);
  });
});
