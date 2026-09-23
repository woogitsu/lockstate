import type { TilePosition } from '../world/coordinates';
import { Container, type ContainerRegistry } from './inventory';
import type { JobBoard } from './job';

/**
 * The two room types [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 4 names as *"the intended physical route"* for procured materials,
 * and which `docs/adr/0093-a-carry-is-an-action.md` decision 2 makes real.
 *
 * Both have been zonable content with no reader since #141 flagged them, and
 * this module is the reader.
 *
 * **What gates on what, because there are two different gates here and
 * conflating them is easy.** The *route* gates on each room holding its own
 * authored capability -- see `DELIVERY_BAY_CAPABILITY` below for the gate and
 * the prison that measured why it has to exist. The *action* does not:
 * ADR 0093 decision 1 gives `action.carry` no `requiredObjectCapability`,
 * because there is no room ceiling to read and the ceiling on how many
 * prisoners carry is how many jobs are on the board.
 */
export const DELIVERY_BAY_ROOM_CATALOG_ID = 'room.delivery-bay';
export const STORAGE_ROOM_ROOM_CATALOG_ID = 'room.storage-room';

/**
 * The object capability each end of the route has to actually hold, and **the
 * measured reason this gate exists at all.**
 *
 * ADR 0093 decision 2 says the route applies *"when a delivery comes due and
 * both rooms exist"*. Built to the letter, that reading **bricks a new prison**,
 * and it was measured rather than reasoned about: zone a bay and a storeroom
 * before the first cell is furnished, and every delivery lands in the bay
 * needing a carrier -- but the only carriers are prisoners, a prisoner is not
 * admitted without a bed, and the bed is a build order waiting on the bricks
 * sitting in the bay. On a probe prison the population never reached intake at
 * all: `intakeStage` stayed short of `completed`, `actionIndex` stayed `-1`, and
 * 24 delivery jobs sat `available` for ever.
 *
 * The gate is therefore *"both rooms **work**"* rather than *"both rooms
 * exist"*, and the test is the one every other room-gated behaviour in this
 * repository already uses: **is the capability the room's own authored
 * requirement names actually standing in it** (`RoomInstance.objectCapabilities`,
 * derived by `deriveRoomCapacity` from the objects the player placed). A bay
 * with no loading dock door is not a delivery bay yet; a storeroom with no
 * racks is not a storeroom yet.
 *
 * That dissolves the bootstrap by construction rather than by a number: the
 * door and the racks are themselves build orders, so they are paid for by
 * deliveries that still land directly -- and by the time both ends are
 * furnished the prison has a population that can work them. It also introduces
 * no balance value, which is what ADR 0017 decision 5 reserves.
 *
 * **Both capabilities are the ones this repository wrote down as waiting for
 * exactly this consumer**, which is why neither is invented here.
 * `tests/foundation/content-vocabulary-contract.test.ts` records
 * `'delivery-access'` as declared by `object.loading-dock-door` and required
 * by `room.delivery-bay` with no action gating on it, naming ADR 0017's
 * procurement route as *"the system that would consume it"*; and
 * `'item-storage'` as declared by `object.storage-rack` and required by
 * `room.storage-room`, listed among the capabilities that *"appear in no
 * `DEFAULT_ACTIONS` entry and in no other room's requirements"*. This is that
 * system.
 */
export const DELIVERY_BAY_CAPABILITY = 'delivery-access';
export const STORAGE_ROOM_CAPABILITY = 'item-storage';

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
  allByRoomCatalogId(roomCatalogId: string): readonly {
    readonly instanceId: string;
    readonly anchorTile: TilePosition;
    readonly width?: number;
    readonly height?: number;
    /** The union of the capabilities of the objects standing in the rectangle. Derived by `deriveRoomCapacity`, never authored per instance. */
    readonly objectCapabilities: readonly string[];
  }[];
}

/**
 * The gate and warehouse share one finite stock budget. An incoming purchase
 * claims space before it is charged, so neither the direct fallback nor a
 * later carry can turn an accepted delivery into an overflowing one.
 * Pending deliveries are added by ProcurementSystem, which owns that queue.
 */
export class DeliveryGateCapacity {
  // #587's first fixture is 625 bricks for all 25,000 opening funds. A 600-unit
  // unfurnished gate refuses that press while still fitting a large ordinary
  // build order; even 600 bricks leave 1,000 for the first plank and staff.
  public static readonly BASE_UNITS = 600;
  // A furnished storage room needs two racks, so its first useful step raises
  // the ceiling to 1,000. Each additional rack keeps adding physical space.
  public static readonly UNITS_PER_RACK = 200;

  public constructor(
    private readonly rooms: RoomInstanceSource,
    private readonly objects: {
      inRect(bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): readonly { readonly objectId: string }[];
    },
    private readonly containers: ContainerRegistry,
    private readonly jobs: JobBoard,
  ) {}

  public capacityUnits(): number {
    let racks = 0;
    for (const room of this.rooms.allByRoomCatalogId(STORAGE_ROOM_ROOM_CATALOG_ID)) {
      if (room.width === undefined || room.height === undefined || room.width < 1 || room.height < 1) continue;
      racks += this.objects.inRect({ x: room.anchorTile.x, y: room.anchorTile.y, width: room.width, height: room.height })
        .filter((object) => object.objectId === 'object.storage-rack').length;
    }
    return DeliveryGateCapacity.BASE_UNITS + racks * DeliveryGateCapacity.UNITS_PER_RACK;
  }

  public stockedUnits(): number {
    const inContainers = this.containers.all().reduce((total, container) => total + container.totalUnits(), 0);
    // After pickup, a carry's stock is in neither container until drop-off.
    // Keeping that quantity claimed closes a mid-route overbooking gap.
    const inHands = this.jobs.activeJobs()
      .filter((job) => job.leg === 'dropoff')
      .reduce((total, job) => total + job.quantity, 0);
    return inContainers + inHands;
  }
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
 * iteration order, so this takes the first *furnished* element in that order
 * rather than sorting again. See `DELIVERY_BAY_CAPABILITY` for why "furnished"
 * and not merely "zoned", and for the prison that measured the difference.
 *
 * ## When either room is missing or unfurnished
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
    private readonly roomInstances: RoomInstanceSource,
    private readonly containers: ContainerRegistry,
    private readonly board: JobBoard,
    /** `CONSTRUCTION_MATERIALS_CONTAINER_ID`, passed in rather than imported: the constant lives in the composition root, which imports this module. */
    private readonly storageContainerId: string,
  ) {}

  /** The bay a delivery lands in, with its container created on first use. */
  private bay(): { readonly containerId: string; readonly tile: TilePosition } | undefined {
    const instance = this.roomInstances
      .allByRoomCatalogId(DELIVERY_BAY_ROOM_CATALOG_ID)
      .find((candidate) => candidate.objectCapabilities.includes(DELIVERY_BAY_CAPABILITY));
    if (instance === undefined) return undefined;
    const containerId = deliveryBayContainerId(instance.instanceId);
    if (this.containers.getById(containerId) === undefined) this.containers.register(new Container(containerId));
    return { containerId, tile: instance.anchorTile };
  }

  /** The storeroom a delivery is carried to, bound to the container construction draws from. */
  private storeroom(): { readonly containerId: string; readonly tile: TilePosition } | undefined {
    const instance = this.roomInstances
      .allByRoomCatalogId(STORAGE_ROOM_ROOM_CATALOG_ID)
      .find((candidate) => candidate.objectCapabilities.includes(STORAGE_ROOM_CAPABILITY));
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
