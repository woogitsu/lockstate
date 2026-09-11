import { describe, expect, it } from 'vitest';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { SimulationEventLog } from '../../src/simulation/events';
import { createIntakeHousedNotice } from '../../src/simulation/events/intake-housed-notice';
import type { ActorIdentitySource } from '../../src/simulation/identity/actor-identity';

/**
 * The composition-root adapter for issue #966 site 3 -- the one place the
 * identity registry's read side, the room catalog and the event log meet, so
 * `IntakeSystem` itself needs none of the three.
 */
describe('createIntakeHousedNotice (#966 site 3)', () => {
  it('records a housed prisoner with the room catalog’s own nameKey and a resolved name', () => {
    const events = new SimulationEventLog();
    const identity: ActorIdentitySource = {
      getName: (kind, entityId) => (kind === 'prisoner' && entityId === 7 ? { givenName: 'Ada', familyName: 'Bell' } : undefined),
    };
    const notice = createIntakeHousedNotice({ identity, rooms: defaultRoomContentRegistry, events });

    notice.announce(7, 'room.cell', 42);

    expect(events.since(0)).toEqual([
      {
        sequence: 1,
        tick: 42,
        type: 'prisoners.housed',
        entityId: 7,
        name: { givenName: 'Ada', familyName: 'Bell' },
        roomNameKey: 'room.cell.name',
      },
    ]);
  });

  it('falls back to no name when the identity registry has none for this entity, exactly as the relocation notice does', () => {
    const events = new SimulationEventLog();
    const notice = createIntakeHousedNotice({ rooms: defaultRoomContentRegistry, events });

    notice.announce(9, 'room.solitary-cell', 10);

    expect(events.since(0)).toEqual([{ sequence: 1, tick: 10, type: 'prisoners.housed', entityId: 9, roomNameKey: 'room.solitary-cell.name' }]);
  });

  /**
   * Defensive rather than reachable: `IntakeSystem` resolves
   * `target.roomCatalogId` against its own `AccommodationPolicy`, which
   * `DEFAULT_ACCOMMODATION_POLICY` only ever points at catalogued types, so
   * this catalog holding no definition for one would be a content mismatch
   * rather than anything a player did -- the same reasoning
   * `createResidentRelocationNotice` gives for the identical omission.
   */
  it('records nothing for a room catalog id this catalog does not define', () => {
    const events = new SimulationEventLog();
    const notice = createIntakeHousedNotice({ rooms: defaultRoomContentRegistry, events });

    notice.announce(1, 'room.does-not-exist', 5);

    expect(events.since(0)).toEqual([]);
  });
});
