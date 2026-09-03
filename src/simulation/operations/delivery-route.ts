import type { TilePosition } from '../world/coordinates';
import { Container, type ContainerRegistry } from './inventory';
import type { JobBoard } from './job';

/**
 * The two room types [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 4 names as *"the intended physical route"* for procured materials,
 * and which `docs/adr/0093-a-carry-is-an-action.md` decision 2 makes real.
 *
 * Both have been zonable content with no reader since #141 flagged them.
 * `room.delivery-bay` also carries `object.loading-dock-door`'s
 * `'delivery-access'` capability, which `construction/definition.ts` records as
 * gating nothing; this route does not gate on it either, and that is
 * deliberate -- ADR 0093 decision 1 gives `action.carry` no
 * `requiredObjectCapability`, because there is no room ceiling to read and the
 * ceiling on how many prisoners carry is how many jobs are on the board.
 */
export const DELIVERY_BAY_ROOM_CATALOG_ID = 'room.delivery-bay';
export const STORAGE_ROOM_ROOM_CATALOG_ID = 'room.storage-room';

/**
 * The container id a `room.delivery-bay` instance is bound to.
 *
 * **Derived from the instance id and never stored** (ADR 0093 decision 2 and
 * decision 5). A binding table would be a second source of truth for something
 * the room registry already answers, and it would need a save key and a
 * migration; a derived id needs neither. What *is* stored is the container's
 * **stock**, which appears in the existing `operations.containers` array the
 * moment the container is registered -- so a delivery sitting in a bay
 * survives a save without one new key.
 *
 * The `container:` prefix rather than the bare instance id, so that nothing can
 * confuse a container id with a room instance id in a log line or a snapshot
 * row: `CONSTRUCTION_MATERIALS_CONTAINER_ID` is `'construction-materials'` and
 * every other container id in this repository is a bare word.
 */
export function deliveryBayContainerId(instanceId: string): string {
  return `container:${instanceId}`;
}

/**
 * The room instances this route reads, as a structural port.
 *
 * `RoomInstanceRegistry` (in `prisoners/`) satisfies it, and the narrow port is
 * what keeps `operations/` from importing the prisoner module for one query --
 * the convention `PrisonerRouteCancelPort` states from the other side. It is
 * also the whole of what this module knows about rooms: no capability, no
 * occupancy, no claim.
 */
export interface RoomInstanceSource {
  allByRoomCatalogId(roomCatalogId: string): readonly { readonly instanceId: string; readonly anchorTile: TilePosition }[];
}

/**
 * Where a delivery physically lands and where it has to be carried, when the
 * player has built both ends.
 *
 * Declared here rather than in `economy/` so that the *decision* -- which bay,
 * which storeroom, what the carry job looks like -- lives in one place with the
 * board it writes to. `ProcurementSystem` holds only this one-method port and
 * therefore knows nothing about containers, jobs or rooms.
 */
export interface DeliveryCarryRoute {
  /**
   * Lands `quantity` of `itemId` in the delivery bay and raises the carry to
   * the storeroom, answering `true` when it did.
   *
   * `false` means *there is no route*, and the caller keeps today's direct
   * deposit into the construction container.
   */
  landAndRaiseCarry(orderId: string, itemId: string, quantity: number, tick: number): boolean;
}

/**
 * ADR 0017 decision 4's physical route, built out of the rooms the player has
 * actually zoned.
 *
 * ## The bindings, and why neither is stored
 *
 * - **A `room.delivery-bay` instance is bound to `container:<instanceId>`.**
 *   The container is registered the first time a delivery needs it, which is
 *   the one moment both facts are known and the one place that cannot be
 *   forgotten: room instances are registered from two paths (zoning and
 *   restore), and a hook on either would leave the other silently
 *   unbound. ADR 0093 decision 2 says *"registered when the room is zoned"*;
 *   this is the same derived binding reached at first use instead, which is
 *   strictly harder to get wrong and keeps `RoomZoningService` free of a
 *   container collaborator.
 * - **A `room.storage-room` instance is bound to the construction container**
 *   the caller names, so `ContainerMaterialsProvider` and `ConstructionSystem`
 *   keep drawing from exactly the container they draw from today and are not
 *   touched.
 *
 * **The lowest instance id wins at each end** when more than one such room
 * exists -- a total order derived from state, which is what ADR 0020 and ADR
 * 0029 decision 7 require of anything that decides an outcome.
 * `allByRoomCatalogId` is documented as sorted by `instanceId` and never Map
 * iteration order, so this reads the first element rather than sorting again.
 *
 * ## When either room is missing
 *
 * `landAndRaiseCarry` answers `false` and the caller deposits directly, which
 * is ADR 0093 decision 2's graceful fallback and #811's *decision 1*. It is
 * zero regression for every existing save and every roomless early prison; the
 * hard gate would strand both and re-create the shape
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * exists to prevent; and the surcharge-or-delay variant needs a balance number
 * ADR 0017 decision 5 reserves.
 *
 * **The cost is stated rather than hidden.** A bayed prison whose population is
 * outside a work block leaves a delivery waiting in the bay for up to 1,100
 * ticks -- from the end of the 1,300-1,800 block to the start of the next day's
 * 500-1,000 block -- and a build order waits with it. That *is* the labour
 * budget being real. ADR 0093 decision 2 requires it to be **visible**, as an
 * [ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
 * standing condition, and **that condition is deliberately not added here**:
 * its sentence is one of the three ADR 0093 owes the repository owner under
 * `AGENTS.md`'s fourth exclusion, and a `PrisonCondition` member with no
 * authored sentence behind it is exactly the defect that exclusion exists for.
 */
export class DeliveryBayCarryRoute implements DeliveryCarryRoute {
  public constructor(
    private readonly rooms: RoomInstanceSource,
    private readonly containers: ContainerRegistry,
    private readonly board: JobBoard,
    /** `CONSTRUCTION_MATERIALS_CONTAINER_ID`, passed in rather than imported: the constant lives in the composition root, which imports this module. */
    private readonly storageContainerId: string,
  ) {}

  /** The bay a delivery lands in, with its container created on first use. */
  private bay(): { readonly containerId: string; readonly tile: TilePosition } | undefined {
    const instance = this.rooms.allByRoomCatalogId(DELIVERY_BAY_ROOM_CATALOG_ID)[0];
    if (instance === undefined) return undefined;
    const containerId = deliveryBayContainerId(instance.instanceId);
    if (this.containers.getById(containerId) === undefined) this.containers.register(new Container(containerId));
    return { containerId, tile: instance.anchorTile };
  }

  /** The storeroom a delivery is carried to, bound to the container construction draws from. */
  private storeroom(): { readonly containerId: string; readonly tile: TilePosition } | undefined {
    const instance = this.rooms.allByRoomCatalogId(STORAGE_ROOM_ROOM_CATALOG_ID)[0];
    if (instance === undefined) return undefined;
    return { containerId: this.storageContainerId, tile: instance.anchorTile };
  }

  public landAndRaiseCarry(orderId: string, itemId: string, quantity: number, tick: number): boolean {
    const bay = this.bay();
    const storeroom = this.storeroom();
    if (bay === undefined || storeroom === undefined) return false;
    // A bay and a storeroom zoned on the same rectangle would send a carrier
    // from a tile to itself, which the board would accept and the executor
    // would resolve in one dwell. Nothing forbids it and nothing needs to: it
    // is a prison the player built that way, and the goods still arrive.

    const jobId = `delivery.${orderId}.${tick}`;
    /*
     * **Unreachable, and defended anyway, because the alternative is a throw
     * out of a scheduled system update.** `JobBoard.submitCarryItem` throws
     * `RangeError` for a duplicate id, and `JobBoard` never prunes a completed
     * job -- so an id that has ever been used is used for ever. The tick is in
     * the id for exactly that reason: `ProcurementSystem.purchase` already
     * refuses a second *pending* delivery with the same `orderId`
     * (`this.pending.some(...)`), so one order id can have at most one arrival
     * in flight, and two arrivals of the same order id cannot land on the same
     * tick. If that ever stops being true the delivery falls back to the direct
     * deposit rather than faulting the session -- the same leniency
     * `CarryJobExecutor`'s container lookups keep for the same reason (#419).
     */
    if (this.board.getById(jobId) !== undefined) return false;

    // The deposit first, so the job's `Container.reserve` has something to
    // reserve on the very next `prisoners.actions` cycle rather than finding
    // the bay empty and leaving the job `'available'` for twenty ticks.
    this.containers.require(bay.containerId).deposit(itemId, quantity);
    this.board.submitCarryItem(
      {
        id: jobId,
        // `1` is the priority `JobSystem.beginLeg` already handed
        // `NavigationSystem.requestRoute` for every leg, so it is a value moved
        // rather than a new number (ADR 0093 decision 2).
        priority: 1,
        itemId,
        quantity,
        sourceContainerId: bay.containerId,
        sourceTile: bay.tile,
        destinationContainerId: storeroom.containerId,
        destinationTile: storeroom.tile,
      },
      tick,
    );
    return true;
  }
}
