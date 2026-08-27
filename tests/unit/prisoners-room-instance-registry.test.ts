import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { RoomInstanceRegistry } from '../../src/simulation/prisoners/room-instance-registry';

const TILE = { x: tileCoordinate(0), y: tileCoordinate(0) };

describe('RoomInstanceRegistry', () => {
  it('registers and looks up instances by id', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
    expect(registry.getById('cell-1')?.roomCatalogId).toBe('room.cell');
    expect(registry.getById('missing')).toBeUndefined();
  });

  it('throws on a duplicate instance id', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    expect(() => registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] })).toThrow(/Duplicate room instance/);
  });

  it('allByRoomCatalogId is sorted by instance id, filtered by room type', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    registry.register({ instanceId: 'yard-1', roomCatalogId: 'room.yard', anchorTile: TILE, residentCapacity: 10, concurrentUseCapacity: 10, objectCapabilities: [] });
    expect(registry.allByRoomCatalogId('room.cell').map((i) => i.instanceId)).toEqual(['cell-1', 'cell-2']);
  });

  it('assign fills capacity and rejects beyond it', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'canteen-0', roomCatalogId: 'room.canteen', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['dining'] });
    expect(registry.assign('canteen-0', 1)).toBe(true);
    expect(registry.assign('canteen-0', 2)).toBe(true);
    expect(registry.assign('canteen-0', 3)).toBe(false);
    expect(registry.occupancyOf('canteen-0')).toBe(2);
  });

  it('release frees capacity for reassignment', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    registry.assign('cell-1', 1);
    expect(registry.assign('cell-1', 2)).toBe(false);
    registry.release('cell-1', 1);
    expect(registry.assign('cell-1', 2)).toBe(true);
  });

  it('assign throws for an unknown instance id (a real bug, not a capacity condition)', () => {
    const registry = new RoomInstanceRegistry();
    expect(() => registry.assign('nope', 1)).toThrow(/Unknown room instance/);
  });

  describe('findAvailableResidence', () => {
    it('returns the first (by sorted id) instance with free capacity', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      expect(registry.findAvailableResidence('room.cell')?.instanceId).toBe('cell-1');
    });

    it('skips a full instance in favor of the next available one', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      registry.assign('cell-1', 1);
      expect(registry.findAvailableResidence('room.cell')?.instanceId).toBe('cell-2');
    });

    it('returns undefined when no instance of that room type has free capacity', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      registry.assign('cell-1', 1);
      expect(registry.findAvailableResidence('room.cell')).toBeUndefined();
    });

    it('filters by required object capability', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'shower-0', roomCatalogId: 'room.shower-room', anchorTile: TILE, residentCapacity: 5, concurrentUseCapacity: 5, objectCapabilities: [] });
      expect(registry.findAvailableResidence('room.shower-room', 'hygiene')).toBeUndefined();
      registry.register({ instanceId: 'shower-1', roomCatalogId: 'room.shower-room', anchorTile: TILE, residentCapacity: 5, concurrentUseCapacity: 5, objectCapabilities: ['hygiene'] });
      expect(registry.findAvailableResidence('room.shower-room', 'hygiene')?.instanceId).toBe('shower-1');
    });
  });

  /**
   * The other half of ADR 0028 decision 3's split, and the reason the two are
   * separate methods rather than one with a mode flag: they read *different
   * fields*, so an instance can be available for use and full for residency at
   * the same time. A canteen is exactly that -- fourteen seats and no beds.
   */
  describe('findAvailableForUse', () => {
    it('gates on concurrent-use capacity, not on resident capacity', () => {
      const registry = new RoomInstanceRegistry();
      // A canteen: nobody lives here, and fourteen can dine here at once.
      //
      // Registered by hand with a total and no per-capability breakdown, which
      // is `concurrentUseCapacityFor`'s stated fallback: an instance nobody has
      // resolved has only its total to offer, so the total bounds the
      // capabilities it claims. That is the pre-#326 rule, and this is the shape
      // of fixture it survives for. It is deliberately **not** what
      // `deriveRoomCapacity` produces for two dining tables and four benches --
      // that gives `[['dining', 6], ['recreation', 8], ['seating', 8]]`, since
      // a bench is not dining furniture -- and the block below drives the
      // resolved shape.
      registry.register({
        instanceId: 'canteen-1',
        roomCatalogId: 'room.canteen',
        anchorTile: TILE,
        residentCapacity: 0,
        concurrentUseCapacity: 14,
        objectCapabilities: ['dining', 'seating'],
      });

      expect(registry.findAvailableForUse('room.canteen')?.instanceId).toBe('canteen-1');
      expect(registry.findAvailableForUse('room.canteen', 'dining')?.instanceId).toBe('canteen-1');
      // The same instance, asked the residency question, is not available at
      // all: `residentCapacity` is 0 and `0 >= 0` refuses.
      expect(registry.findAvailableResidence('room.canteen')).toBeUndefined();
    });

    it('refuses a room whose objects offer no concurrent use, even when people live in it', () => {
      const registry = new RoomInstanceRegistry();
      // The inverse asymmetry, which cannot be produced by the derivation rule
      // (every sleep surface counts toward both sums) and *can* be produced by
      // a restored save or a scenario. Asserted so the two gates are known to
      // be independent rather than assumed to be.
      registry.register({
        instanceId: 'cell-1',
        roomCatalogId: 'room.cell',
        anchorTile: TILE,
        residentCapacity: 2,
        concurrentUseCapacity: 0,
        objectCapabilities: ['sleep-surface'],
      });

      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('cell-1');
      expect(registry.findAvailableForUse('room.cell', 'sleep-surface')).toBeUndefined();
    });
  });

  /**
   * Issue #326: the ceiling and the headcount are scoped to the same capability.
   *
   * Before this, `findAvailableForUse` asked two questions of two different
   * things -- the capability had to be present *somewhere* in the room, and the
   * headcount was compared against the summed footprint width of **every**
   * object in it. Measured on the real gate at `9d0a125`: ADR 0028's worked
   * canteen plus four toilets and a storage rack admitted 19 diners to tables
   * that seat 6, and an empty 8x8 yard admitted nobody while the same yard
   * holding one loading-dock door admitted three.
   *
   * Every instance in this block carries a resolved breakdown, which is what
   * every instance in a running session carries.
   */
  describe('a capability-scoped concurrent-use ceiling', () => {
    /** The canteen `deriveRoomCapacity` really produces for two dining tables, four benches, four toilets and a storage rack. */
    function clutteredCanteen(): RoomInstanceRegistry {
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'canteen-1',
        roomCatalogId: 'room.canteen',
        anchorTile: TILE,
        residentCapacity: 0,
        concurrentUseCapacity: 19,
        concurrentUseCapacityByCapability: [['dining', 6], ['item-storage', 1], ['recreation', 8], ['sanitation', 4], ['seating', 8]],
        objectCapabilities: ['dining', 'item-storage', 'recreation', 'sanitation', 'seating'],
      });
      return registry;
    }

    it('admits a capability up to its own sum and not to the all-objects total', () => {
      const registry = clutteredCanteen();
      const canteen = registry.getById('canteen-1')!;

      expect(registry.concurrentUseCapacityFor(canteen, 'dining')).toBe(6);
      expect(registry.concurrentUseCapacityFor(canteen, 'sanitation')).toBe(4);
      // A capability no object in the room carries. Zero rather than the total,
      // which is what makes the separate "is this capability present" test
      // `findAvailableForUse` used to make redundant.
      expect(registry.concurrentUseCapacityFor(canteen, 'hygiene')).toBe(0);
      expect(registry.findAvailableForUse('room.canteen', 'hygiene')).toBeUndefined();

      let seated = 0;
      for (let entity = 1; entity <= 19; entity += 1) {
        if (registry.claimUse('canteen-1', entity as never, 'dining')) seated += 1;
      }
      expect(seated, 'the toilets and the rack are not seats').toBe(6);
      expect(registry.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    });

    it('does not let one capability filling up close another', () => {
      // The reason the headcount had to be scoped as well as the ceiling. With
      // one pooled count against one pooled ceiling, six diners already exceed
      // `'sanitation'`'s 4 and the room's toilets would read as busy because
      // lunch was on.
      const registry = clutteredCanteen();
      for (let entity = 1; entity <= 6; entity += 1) expect(registry.claimUse('canteen-1', entity as never, 'dining')).toBe(true);

      expect(registry.useOccupancyOf('canteen-1', 'dining')).toBe(6);
      expect(registry.useOccupancyOf('canteen-1', 'sanitation')).toBe(0);
      // Without a capability: every claim, whatever it consumes. That is
      // `claimCountOf`'s question and no ceiling's.
      expect(registry.useOccupancyOf('canteen-1')).toBe(6);

      expect(registry.findAvailableForUse('room.canteen', 'sanitation')?.instanceId).toBe('canteen-1');
      for (let entity = 100; entity < 104; entity += 1) expect(registry.claimUse('canteen-1', entity as never, 'sanitation')).toBe(true);
      expect(registry.claimUse('canteen-1', 104 as never, 'sanitation')).toBe(false);
      // Ten claims on a room whose largest single ceiling is 8, and every one
      // of them legal.
      expect(registry.totalUseClaims).toBe(10);
    });

    it('admits nobody to a capability the room has at a ceiling of zero', () => {
      // A state the derivation cannot produce -- `objectFootprintSchema` bounds
      // `width` below at 1, so a capability a room has always sums to at least
      // one -- and a state a restored or hand-built instance can. Asserted so
      // the gate is known to refuse on the number rather than on the presence
      // of the key.
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'canteen-1',
        roomCatalogId: 'room.canteen',
        anchorTile: TILE,
        residentCapacity: 0,
        concurrentUseCapacity: 40,
        concurrentUseCapacityByCapability: [['dining', 0]],
        objectCapabilities: ['dining'],
      });

      expect(registry.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
      expect(registry.claimUse('canteen-1', 1 as never, 'dining')).toBe(false);
      expect(registry.totalUseClaims).toBe(0);
    });

    it('gives an action that names no capability no object-derived ceiling, rather than a ceiling of zero', () => {
      /*
       * The yard, and the reason it is a derivation rather than an exemption.
       * An action that names no capability consumes no object, so a rule that
       * sums object footprints has no domain for it -- and an undefined ceiling
       * means "this rule does not bound it", not "it bounds it at zero". Zero is
       * what the old rule said about 64 tiles of empty ground.
       */
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'yard-1',
        roomCatalogId: 'room.yard',
        anchorTile: TILE,
        width: 8,
        height: 8,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        concurrentUseCapacityByCapability: [],
        objectCapabilities: [],
      });
      const yard = registry.getById('yard-1')!;

      expect(registry.concurrentUseCapacityFor(yard, undefined)).toBe(Number.POSITIVE_INFINITY);
      expect(registry.findAvailableForUse('room.yard')?.instanceId).toBe('yard-1');
      for (let entity = 1; entity <= 64; entity += 1) expect(registry.claimUse('yard-1', entity as never)).toBe(true);
      expect(registry.totalUseClaims).toBe(64);
      expect(registry.findAvailableForUse('room.yard')?.instanceId).toBe('yard-1');

      // **Unbounded is not the same as "anything goes".** The empty yard still
      // admits nobody to anything a room needs an object for, so this is not a
      // hole that a capability-naming action could fall through.
      expect(registry.findAvailableForUse('room.yard', 'recreation')).toBeUndefined();
      expect(registry.claimUse('yard-1', 500 as never, 'recreation')).toBe(false);
    });

    it('is idempotent for a claim already held against the same capability', () => {
      // `Set.add` gave this for free before a claim carried a capability.
      // Without it, re-claiming would compare a count that already includes
      // this entity against the ceiling and refuse the seat its own holder is
      // sitting in.
      const registry = clutteredCanteen();
      expect(registry.claimUse('canteen-1', 7 as never, 'item-storage')).toBe(true);
      expect(registry.claimUse('canteen-1', 7 as never, 'item-storage')).toBe(true);
      expect(registry.totalUseClaims).toBe(1);
      expect(registry.useOccupancyOf('canteen-1', 'item-storage')).toBe(1);
      // And a different entity is still refused, so the idempotence is not a
      // hole in the ceiling.
      expect(registry.claimUse('canteen-1', 8 as never, 'item-storage')).toBe(false);
    });

    it('rebuilds a claim against its capability, above the ceiling, for a restore', () => {
      const registry = clutteredCanteen();
      // Eight diners in a room that seats six -- the legal over-capacity state
      // ADR 0028 decision 2 names, which a restore must reproduce exactly
      // rather than silently trim.
      for (let entity = 1; entity <= 8; entity += 1) {
        expect(registry.reinstateUseClaim('canteen-1', entity as never, 'dining')).toBe(true);
      }
      expect(registry.useOccupancyOf('canteen-1', 'dining')).toBe(8);
      // And the door is shut behind them: nobody new dines, while the toilets
      // are untouched by the overflow.
      expect(registry.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
      expect(registry.findAvailableForUse('room.canteen', 'sanitation')?.instanceId).toBe('canteen-1');
    });

    it('falls back to the all-objects total only for an instance nobody has resolved', () => {
      // The one place the pre-#326 rule survives, stated at
      // `concurrentUseCapacityFor` and pinned here so it cannot spread. No
      // command reaches it: `zone` resolves inside the same dispatch and a
      // restore resolves every instance before a tick runs.
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'canteen-1',
        roomCatalogId: 'room.canteen',
        anchorTile: TILE,
        residentCapacity: 0,
        concurrentUseCapacity: 3,
        objectCapabilities: ['dining'],
      });
      const canteen = registry.getById('canteen-1')!;

      expect(registry.concurrentUseCapacityFor(canteen, 'dining')).toBe(3);
      // Still nothing for a capability the instance does not claim, so the
      // fallback is bounded by `objectCapabilities` rather than open.
      expect(registry.concurrentUseCapacityFor(canteen, 'sanitation')).toBe(0);
    });
  });

  describe('updateDerived', () => {
    it('rewrites the four derived fields and nothing else, and is visible to the sorted lookup', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'cell-1',
        roomCatalogId: 'room.cell',
        anchorTile: TILE,
        width: 2,
        height: 3,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        objectCapabilities: [],
      });
      // Nothing is available before the objects are counted, which is the state
      // `RoomZoningService.zone` leaves a fresh rectangle in.
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')).toBeUndefined();

      expect(
        registry.updateDerived('cell-1', {
          residentCapacity: 1,
          concurrentUseCapacity: 1,
          concurrentUseCapacityByCapability: [['sleep-surface', 1]],
          objectCapabilities: ['sleep-surface'],
        }),
      ).toBe(true);

      const updated = registry.getById('cell-1');
      expect(updated).toMatchObject({
        instanceId: 'cell-1',
        roomCatalogId: 'room.cell',
        width: 2,
        height: 3,
        residentCapacity: 1,
        concurrentUseCapacity: 1,
        concurrentUseCapacityByCapability: [['sleep-surface', 1]],
        objectCapabilities: ['sleep-surface'],
      });
      expect(updated?.anchorTile).toEqual(TILE);

      // Through the *cached* sorted lookup as well as through `getById`. This
      // is the assertion that would fail if `updateDerived` were only a
      // `Map.set`: `allByRoomCatalogId` would keep answering from a row whose
      // capacity had moved, and `findAvailableResidence` reads that cache.
      expect(registry.allByRoomCatalogId('room.cell')[0]?.residentCapacity).toBe(1);
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('cell-1');
    });

    it('warms the sorted cache first, so a stale cache would be observable', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] });
      // The read that populates the cache, made *before* the update rather than
      // after, because a cache that is only ever filled after a write cannot
      // demonstrate invalidation.
      expect(registry.allByRoomCatalogId('room.cell')).toHaveLength(1);
      registry.updateDerived('cell-1', { residentCapacity: 3, concurrentUseCapacity: 3, concurrentUseCapacityByCapability: [], objectCapabilities: [] });
      expect(registry.allByRoomCatalogId('room.cell')[0]?.residentCapacity).toBe(3);
    });

    it('answers false for an instance that does not exist, rather than throwing', () => {
      const registry = new RoomInstanceRegistry();
      expect(registry.updateDerived('nobody', { residentCapacity: 1, concurrentUseCapacity: 1, concurrentUseCapacityByCapability: [], objectCapabilities: [] })).toBe(false);
    });
  });

  describe('findBestAvailable', () => {
    /** Two shared cells of the same room type, both with the required capability. */
    function twoSharedCells(): RoomInstanceRegistry {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'shared-a', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'shared-b', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      return registry;
    }

    it('consults the occupants, so an arrival is not put in with an incompatible cellmate when another cell is free (#79)', () => {
      // This is the whole of #79 at the decision function. `findAvailable`
      // returns 'shared-a' here -- it sorts first and has a free bed, and a
      // capacity count is every question it asks. Asserted alongside, so the
      // difference is the test rather than the claim.
      const registry = twoSharedCells();
      registry.assign('shared-a', 7); // entity 7 is the occupant we must not pair with

      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('shared-a');

      const chosen = registry.findBestAvailable('room.cell', (occupants) => (occupants.includes(7) ? 10 : 0), 'sleep-surface');
      expect(chosen?.instanceId).toBe('shared-b');
    });

    it('is identical to findAvailableResidence when every free instance rates the same', () => {
      // The condition every scenario in this repository is in: single-
      // occupancy cells, so every *free* instance holds nobody and every
      // rating is 0. Ties go to the lowest instance id.
      //
      // Both answers are now written out instead of one being compared to the
      // other (#375). Two production methods asserted to agree is a comparison
      // whose expected side the code under test produced -- and the fixture it
      // stood on, two identical free cells with nobody in them, rejected no
      // candidate at all, so "the pair agrees about who is *eligible*" was a
      // claim nothing here could reach. Every instance below is one the two
      // must rule out for a different stated reason, or keep for one:
      // `cell-1` sorts first and is full, `cell-2` sorts next and has no bed,
      // `cell-3` is the tie winner and `cell-4` the tie loser. Registration
      // order is deliberately not sorted order, so the id sort is load-bearing
      // rather than incidental.
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-4', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'cell-3', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      registry.assign('cell-1', 11);

      // With a bed required, `cell-1` is out on capacity and `cell-2` on the
      // capability, so agreeing means agreeing on `cell-3` and not merely on
      // whatever both happen to say.
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('cell-3');
      expect(registry.findBestAvailable('room.cell', () => 0, 'sleep-surface')?.instanceId).toBe('cell-3');

      // And with nothing required, which is the form the old case tested:
      // `cell-1` is still full, and `cell-2`'s missing bed no longer matters.
      expect(registry.findAvailableResidence('room.cell')?.instanceId).toBe('cell-2');
      expect(registry.findBestAvailable('room.cell', () => 0)?.instanceId).toBe('cell-2');
    });

    it('still respects capacity and the required object capability', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'full', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'no-bed', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 4, concurrentUseCapacity: 4, objectCapabilities: [] });
      registry.register({ instanceId: 'usable', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 4, concurrentUseCapacity: 4, objectCapabilities: ['sleep-surface'] });
      registry.assign('full', 1);

      expect(registry.findBestAvailable('room.cell', () => 0, 'sleep-surface')?.instanceId).toBe('usable');
    });

    it('treats a non-finite rating as "not a permissible placement" and skips the instance', () => {
      const registry = twoSharedCells();
      registry.assign('shared-a', 7);

      const chosen = registry.findBestAvailable(
        'room.cell',
        (occupants) => (occupants.includes(7) ? Number.POSITIVE_INFINITY : 0),
        'sleep-surface',
      );
      expect(chosen?.instanceId).toBe('shared-b');

      // Every candidate refused is the backlog condition, not a wrong answer.
      registry.assign('shared-b', 7);
      expect(registry.findBestAvailable('room.cell', () => Number.POSITIVE_INFINITY, 'sleep-surface')).toBeUndefined();
    });

    it('hands occupants over sorted ascending by entity id, never in assignment order', () => {
      // Assignment order here is deliberately not ascending, so a rating
      // function that received the `Set` untouched would see a list this
      // assertion does not accept. `canonical-iteration-contract.test.ts`
      // structurally cannot see the expression that sorts (its own header
      // says so), which is why the guard is behavioural.
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'dorm', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 8, concurrentUseCapacity: 8, objectCapabilities: [] });
      registry.assign('dorm', 1_048_576);
      registry.assign('dorm', 3);
      registry.assign('dorm', 42);

      // This asserted `[1_048_576, 3, 42]` -- assignment order -- for as long
      // as `occupantsOf` returned its backing `Set` untouched, with the
      // comment "as documented". It was a true description of a hazard: the
      // same prison answered ascending id after a save/load, so the accessor
      // was not a function of state. The accessor sorts now, and
      // `tests/determinism/room-occupant-ordering.test.ts` is where that is
      // proved across histories rather than merely stated here.
      expect(registry.occupantsOf('dorm')).toEqual([3, 42, 1_048_576]);

      const seen: (readonly number[])[] = [];
      registry.findBestAvailable('room.cell', (occupants) => {
        seen.push([...occupants]);
        return 0;
      });
      expect(seen).toEqual([[3, 42, 1_048_576]]);
    });

    it('stops at the first candidate rated 0, so it costs what findAvailable costs on the common path', () => {
      // Not a micro-optimisation: `docs/PRISONER_OPERATIONS.md` records that
      // this is a per-tick, potentially-thousands-of-instances hot path that
      // has already produced a severe super-linear slowdown once, and
      // replacing an early-exit `.find` with an unconditional full scan is
      // the shape that did it. An empty room rates 0, so in a prison with a
      // free empty room the scan exits where `.find` would have.
      const registry = new RoomInstanceRegistry();
      for (let n = 0; n < 50; n += 1) {
        registry.register({ instanceId: `cell-${String(n).padStart(2, '0')}`, roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
      }

      let rated = 0;
      const chosen = registry.findBestAvailable('room.cell', () => {
        rated += 1;
        return 0;
      });

      expect(chosen?.instanceId).toBe('cell-00');
      expect(rated).toBe(1);
    });

    it('does not stop early while every candidate so far rates above the floor', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-3', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });

      const ratings = new Map([['cell-1', 3], ['cell-2', 2], ['cell-3', 1]]);
      const visited: string[] = [];
      const chosen = registry.findBestAvailable('room.cell', (_occupants, instance) => {
        visited.push(instance.instanceId);
        return ratings.get(instance.instanceId)!;
      });

      expect(visited).toEqual(['cell-1', 'cell-2', 'cell-3']);
      expect(chosen?.instanceId).toBe('cell-3');
    });

    it('returns undefined when no instance of the room type exists at all', () => {
      const registry = new RoomInstanceRegistry();
      expect(registry.findBestAvailable('room.cell', () => 0)).toBeUndefined();
    });
  });

  it('instancesOccupiedBy lists every instance holding an entity, sorted', () => {
    const registry = new RoomInstanceRegistry();
    registry.register({ instanceId: 'a', roomCatalogId: 'room.yard', anchorTile: TILE, residentCapacity: 5, concurrentUseCapacity: 5, objectCapabilities: [] });
    registry.register({ instanceId: 'b', roomCatalogId: 'room.common-room', anchorTile: TILE, residentCapacity: 5, concurrentUseCapacity: 5, objectCapabilities: [] });
    registry.assign('b', 7);
    registry.assign('a', 7);
    expect(registry.instancesOccupiedBy(7)).toEqual(['a', 'b']);
    expect(registry.instancesOccupiedBy(999)).toEqual([]);
  });
});
