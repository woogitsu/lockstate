import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import type { EntityId } from '../entity';
import type { ActorIdentitySource } from '../identity/actor-identity';
import type { SimulationEventLog } from './event-log';

/**
 * What one relocated resident is: the entity that moved and the instance they
 * moved into.
 *
 * Structurally identical to `ExcessResidentRelocation` in
 * `src/simulation/prisoners/prisoner-operations-runtime.ts` and deliberately
 * **not** imported from it. This module is the events layer's adapter and
 * should not gain a dependency on the prisoner runtime for a two-field record;
 * `createResidentRelocationNotice`'s composition root holds both sides, which
 * is the same reason `ObjectPlacementService` re-declares its port's shape
 * rather than importing the runtime.
 */
export interface RelocatedResident {
  readonly entityId: EntityId;
  readonly toInstanceId: string;
}

/** Just enough of `RoomInstanceRegistry` to say which room type an instance is. */
export interface RelocationRoomSource {
  getById(instanceId: string): { readonly roomCatalogId: string } | undefined;
}

export interface ResidentRelocationNoticeSources {
  /**
   * Where a prisoner's name comes from (ADR 0015). Optional for the reason it
   * is optional on `PrisonerOperationsRuntime`: a fixture wired without one
   * names nobody, and the notice then reaches the player as
   * `hud.regime.roster-unnamed` -- "Prisoner 3" -- rather than not at all.
   */
  readonly identity?: ActorIdentitySource;
  readonly roomInstances: RelocationRoomSource;
  /** Resolves a room instance's catalog id to the `nameKey` the HUD renders. */
  readonly rooms: ContentRegistry<RoomCatalogDefinition>;
  readonly events: SimulationEventLog;
  /**
   * The tick the move happened on, read at announcement time.
   *
   * **A reader, not a parameter, and the reason is that the two removal routes
   * do not agree about whether they know the tick.** `RemoveObject` reaches
   * `ObjectPlacementService.remove(request, tick)` from a command handler that
   * holds `context.tick`; the `Undo` of a completed object order reaches
   * `onOrderReverted(objectId, anchor)` from `ConstructionSystem.cancelOrder`,
   * which is handed no tick and has no field to carry one. Threading a tick
   * through `undo()` and `cancelOrder()` would change three signatures in
   * `src/simulation/construction/**` to serve a notice, so the composition
   * root supplies `() => kernel.tick` instead -- the same shape `GuardRoster`
   * is already given for its RNG stream in `new-session.ts`.
   *
   * Both routes execute inside `Kernel.dispatchDue`, which dispatches at
   * `this._tick` and increments only after the step, so `kernel.tick` here is
   * the tick the command executed on and not the one after it.
   */
  readonly tick: () => number;
}

/** The one question `ObjectPlacementService` asks after a removal has rehoused somebody. */
export interface ResidentRelocationNotice {
  announceRelocations(relocated: readonly RelocatedResident[]): void;
}

/**
 * Tells the player that a named prisoner has moved cell without being asked to
 * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)).
 *
 * The debt PR #637 recorded and did not pay: relocation shipped and was
 * silent, which under issue #629 -- *"a requirement the player must discover
 * is a defect"* -- is the mirror of the thing it outlaws. The owner approved
 * the wording on 2026-08-30; this module carries the *facts* it needs to the
 * events channel, and assembles no sentence of its own.
 *
 * ## Why the assembly is here and not in either module it sits between
 *
 * `ObjectPlacementService` holds the room catalog and neither identity nor the
 * event log, and its `ExcessResidentRelocationPort` exists precisely so that
 * `src/simulation/objects/` keeps *no* dependency on who a prisoner is.
 * `PrisonerOperationsRuntime` holds identity and the event log and no room
 * catalog, and has no tick. Neither of them is short of one thing only, so the
 * adapter is a third module that both stay ignorant of, wired in the one place
 * that already holds every side.
 *
 * ## What it does not say
 *
 * **Nothing about a resident it could not move.** The port is handed only
 * `relocated`; `stranded` never reaches here. See
 * `SimulationEventLog.recordResidentRelocated` for why that silence is an open
 * question rather than an oversight.
 */
export function createResidentRelocationNotice(sources: ResidentRelocationNoticeSources): ResidentRelocationNotice {
  return {
    announceRelocations(relocated: readonly RelocatedResident[]): void {
      // Nothing moved is the ordinary case -- every removal from an
      // under-occupied room reaches here with an empty list -- so the tick is
      // not even read for one.
      if (relocated.length === 0) return;
      const tick = sources.tick();
      for (const { entityId, toInstanceId } of relocated) {
        const roomCatalogId = sources.roomInstances.getById(toInstanceId)?.roomCatalogId;
        const roomNameKey = roomCatalogId === undefined ? undefined : sources.rooms.getById(roomCatalogId)?.nameKey;
        // An instance registered under a catalog id this catalog does not
        // define has no name a player could read, and the sentence's `{room}`
        // would render as the literal placeholder -- which
        // `src/services/localization/format.ts` deliberately leaves visible.
        // `PrisonerRoomRefViewModel.roomNameKey` makes the same call by
        // omission for the same case. Nothing in `src/` can produce it: a
        // room is registered by `ZoneRoom`, which refuses an id the catalog
        // does not hold (`zone.unknown-room-type`).
        if (roomNameKey === undefined) continue;
        const name = sources.identity?.getName('prisoner', entityId);
        sources.events.recordResidentRelocated(
          { entityId, ...(name === undefined ? {} : { name: { givenName: name.givenName, familyName: name.familyName } }), roomNameKey },
          tick,
        );
      }
    },
  };
}
