import type { ContentRegistry } from '../../content/registry';
import type { RoomCatalogDefinition } from '../../content/room-catalog';
import type { EntityId } from '../entity';
import type { ActorIdentitySource } from '../identity/actor-identity';
import type { IntakeHousedNotice } from '../prisoners/intake-system';
import type { SimulationEventLog } from './event-log';

export interface IntakeHousedNoticeSources {
  /**
   * Where a prisoner's name comes from (ADR 0015). Optional for the reason it
   * is optional on `PrisonerOperationsRuntime`: a fixture wired without one
   * names nobody, and the notice then reaches the player as
   * `hud.regime.roster-unnamed` -- "Prisoner 3" -- rather than not at all.
   *
   * Typed as the narrow *read* port rather than as `ActorIdentityMinter`,
   * which is what `IntakeSystem` itself already holds for minting. The same
   * concrete registry is handed to both -- `IntakeSystem` cannot read a name
   * back through the port it has, and this module is where that capability is
   * composed instead, exactly as `ResidentRelocationNoticeSources.identity` is
   * for the same reason.
   */
  readonly identity?: ActorIdentitySource;
  /** Resolves a room catalog id to the `nameKey` the HUD renders. */
  readonly rooms: ContentRegistry<RoomCatalogDefinition>;
  readonly events: SimulationEventLog;
}

/**
 * Tells the player that a queued arrival finally got a bed
 * ([#966](https://github.com/matmaxalez/lockstate/issues/966) site 3) -- the
 * housing mirror of `createResidentRelocationNotice`
 * (`src/simulation/events/resident-relocation-notice.ts`), which announces the
 * same fact for a resident who already had a place and had it taken away.
 *
 * ## Why the assembly is here and not inside `IntakeSystem`
 *
 * `IntakeSystem` holds `RoomInstanceRegistry` and, at most, an
 * `ActorIdentityMinter` -- the mint-only half of actor identity, deliberately
 * narrow so that intake "cannot rename or release, only name a new arrival"
 * (`ActorIdentityMinter`'s own comment). Naming this prisoner in a sentence
 * needs a *read* of whatever name was minted at reception, and it needs the
 * room catalog to turn a `roomCatalogId` into a `nameKey` -- neither of which
 * `IntakeSystem` may hold without widening a boundary this change is not
 * about. This adapter is composed at the session root, where the identity
 * registry, the room catalog and the event log already meet for
 * `createResidentRelocationNotice`.
 *
 * ## What it does not say
 *
 * Nothing about an arrival still waiting, still being classified, or resolved
 * `'failed'` for want of any instance of its room type. Those are silence this
 * change does not touch; see `IntakeSystem`'s own accommodation-assignment
 * stage for where each one lands.
 */
export function createIntakeHousedNotice(sources: IntakeHousedNoticeSources): IntakeHousedNotice {
  return {
    announce(entityId: EntityId, roomCatalogId: string, tick: number): void {
      const roomNameKey = sources.rooms.getById(roomCatalogId)?.nameKey;
      // A room catalog id `IntakeSystem` resolved a moment ago against its own
      // `AccommodationPolicy`, so this catalog holding no definition for it
      // would be a content mismatch between the two registries rather than
      // anything a player did -- the same defensive omission
      // `createResidentRelocationNotice` makes for the identical reason, and
      // for the same reason nothing in `src/` can produce it today.
      if (roomNameKey === undefined) return;
      const name = sources.identity?.getName('prisoner', entityId);
      sources.events.recordPrisonerHoused(
        { entityId, ...(name === undefined ? {} : { name: { givenName: name.givenName, familyName: name.familyName } }), roomNameKey },
        tick,
      );
    },
  };
}
