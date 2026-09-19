import { describe, expect, it } from 'vitest';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { RoomInstanceRegistry, TILES_PER_OPEN_GROUND_PLACE } from '../../src/simulation/prisoners/room-instance-registry';

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

      expect(registry.findAvailableForUse('room.canteen', 'dining')?.instanceId).toBe('canteen-1');
      // **Asked with no capability at all, the canteen offers nothing**, and
      // this line used to answer `'canteen-1'`. Since the owner's ruling of
      // 2026-08-29 (#585) a no-capability question is answered from floor area
      // and floor area is a resource only a room type tagged as an open area
      // supplies. `room.canteen` is not tagged, so it derives 0 -- and that is
      // the point of the ruling rather than a loss: a canteen seats diners at
      // its tables, and it has never been somewhere a prisoner does something
      // that consumes no object.
      expect(registry.findAvailableForUse('room.canteen')).toBeUndefined();
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

    it('bounds an action that names no capability by the room\'s own ground, not by nothing and not by zero', () => {
      /*
       * The yard, and the third answer this case has had.
       *
       * **Both previous directions are kept rather than overwritten**, because
       * each was right about what it denied:
       *
       * 1. Before issue #326 the *object-footprint* rule applied to an
       *    objectless room and read as a ceiling of **zero** -- 64 tiles of
       *    empty ground that admitted nobody, while the same yard holding one
       *    three-tile delivery door admitted three.
       * 2. #326 replaced that with **no ceiling at all**, on the reading that
       *    an undefined *object* ceiling means "this rule does not bound it".
       *    True of that rule, and it is still true: nothing below consults an
       *    object.
       * 3. Issue #532 measured what "not bounded by that rule" turned into in
       *    a running prison -- the only room in the game that admitted every
       *    prisoner at once, for ever, however small it was -- and gave the
       *    room the ceiling its own resource supports. A room whose activity
       *    is people on open ground is bounded by how much ground there is.
       *
       * `TILES_PER_OPEN_GROUND_PLACE` is 16, so the 8x8 minimum yard below
       * derives **4** -- and 4 is read off that constant and the rectangle
       * rather than typed in, because a test that hard-codes the product of a
       * balance figure it is also asserting would agree with any value of it.
       */
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'yard-1',
        roomCatalogId: 'room.yard',
        anchorTile: TILE,
        // Explicitly tagged, because since the owner's ruling of 2026-08-29
        // (#585) that is what gives floor area a domain here at all --
        // `RoomZoningService.zone` reads the tag off `room.yard`'s catalogue
        // entry, and a hand-registered instance has to carry it too.
        openArea: true,
        width: 8,
        height: 8,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        concurrentUseCapacityByCapability: [],
        objectCapabilities: [],
      });
      const yard = registry.getById('yard-1')!;
      const expectedPlaces = Math.floor((8 * 8) / TILES_PER_OPEN_GROUND_PLACE);

      expect(expectedPlaces, 'a minimum yard must admit somebody, or this asserts the pre-#326 defect').toBeGreaterThan(0);
      expect(registry.concurrentUseCapacityFor(yard, undefined)).toBe(expectedPlaces);
      expect(registry.concurrentUseCapacityFor(yard, undefined)).not.toBe(Number.POSITIVE_INFINITY);

      // Admits exactly that many and then refuses, which is the half that used
      // to be unreachable: before this, the 65th prisoner got in too.
      for (let entity = 1; entity <= expectedPlaces; entity += 1) {
        expect(registry.findAvailableForUse('room.yard')?.instanceId, `place ${entity} must still be offered`).toBe('yard-1');
        expect(registry.claimUse('yard-1', entity as never)).toBe(true);
      }
      expect(registry.totalUseClaims).toBe(expectedPlaces);
      expect(registry.claimUse('yard-1', (expectedPlaces + 1) as never), 'a full yard refuses').toBe(false);
      expect(registry.findAvailableForUse('room.yard'), 'and offers nothing').toBeUndefined();
      expect(registry.totalUseClaims).toBe(expectedPlaces);

      // Bigger ground, more places: the ceiling is the rectangle the player
      // drew and not a per-room-type number, so enlarging the yard is the
      // response to a full one.
      registry.register({
        instanceId: 'yard-2',
        roomCatalogId: 'room.yard',
        anchorTile: { x: tileCoordinate(96), y: TILE.y },
        openArea: true,
        width: 16,
        height: 16,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        concurrentUseCapacityByCapability: [],
        objectCapabilities: [],
      });
      expect(registry.concurrentUseCapacityFor(registry.getById('yard-2')!, undefined)).toBe(
        Math.floor((16 * 16) / TILES_PER_OPEN_GROUND_PLACE),
      );
      expect(registry.concurrentUseCapacityFor(registry.getById('yard-2')!, undefined)).toBeGreaterThan(expectedPlaces);

      // **Bounded is still not "the room supplies everything".** The empty
      // yard admits nobody to anything a room needs an object for, so this is
      // not a hole a capability-naming action could fall through -- #326's
      // half, unchanged.
      expect(registry.findAvailableForUse('room.yard', 'recreation')).toBeUndefined();
      expect(registry.claimUse('yard-1', 500 as never, 'recreation')).toBe(false);
    });

    it('keeps the unbounded answer for an instance that records no rectangle', () => {
      /*
       * The rule reads `width * height`, and an instance that records neither
       * has nothing to derive from. Inventing a rectangle would assert a room
       * the player did not zone -- `roomBoundsOf` in
       * `src/simulation/objects/room-capacity.ts` refuses to for that reason --
       * so the honest answer is the one this case had before #532.
       *
       * **This test was named "... which is what a V4 save is" and no longer
       * is** (issue #559, ADR 0074). The assertion is unchanged and still
       * correct -- this registry answers `Infinity` for an instance with no
       * rectangle, and that is what it should do. What was wrong was the
       * example: a V4 *row* records no rectangle, but the same payload's world
       * section carries the zoning plane the room was painted into, so
       * `restoreSessionSystems` recovers it
       * (`src/simulation/rooms/bounds-recovery.ts`) and a restored V4 yard
       * arrives here bounded. Naming a V4 save here made a defect look like a
       * decision: `tests/migrations/save-v4-room-bounds.test.ts` measures what
       * a V4 save actually gets. What still reaches this branch is an instance
       * no plane can support, which is exactly what is registered below.
       */
      const registry = new RoomInstanceRegistry();
      registry.register({
        instanceId: 'yard-v4',
        roomCatalogId: 'room.yard',
        anchorTile: TILE,
        openArea: true,
        residentCapacity: 0,
        concurrentUseCapacity: 0,
        concurrentUseCapacityByCapability: [],
        objectCapabilities: [],
      });
      const yard = registry.getById('yard-v4')!;

      expect(yard.width).toBeUndefined();
      expect(registry.concurrentUseCapacityFor(yard, undefined)).toBe(Number.POSITIVE_INFINITY);
      for (let entity = 1; entity <= 64; entity += 1) expect(registry.claimUse('yard-v4', entity as never)).toBe(true);
      expect(registry.totalUseClaims).toBe(64);
    });

    it('never derives zero for an OPEN-AREA room that has a rectangle, which is the defect #326 removed', () => {
      /*
       * ADR 0071 decision 3's clamp, **as scoped by the owner's ruling of
       * 2026-08-29** (#585): it is a floor under the open-ground arithmetic,
       * and the arithmetic now runs only for a room type tagged as an open
       * area. `floor(4 / 16)` is 0, so a 2x2 holding cell would admit nobody
       * without it, and "a room that exists and admits nobody" is precisely
       * what an object-footprint ceiling on an objectless room used to
       * produce.
       *
       * **This case used to be hypothetical and is now real, which is the one
       * thing the ruling improved here.** It was written over `room.cell`
       * rectangles -- 1x1, 2x3, 3x3 -- with the note that "no legal
       * `room.yard` reaches the clamp; every smaller room type does". That
       * note is now false in the useful direction: a cell derives 0 because it
       * is not an open area, and `room.holding-cell`'s authored minimum of
       * 2x2 is a legal, zonable, tagged room that lands on the clamp.
       */
      const registry = new RoomInstanceRegistry();
      for (const [instanceId, width, height] of [['holding-min', 2, 2], ['holding-3x3', 3, 3]] as const) {
        registry.register({
          instanceId,
          roomCatalogId: 'room.holding-cell',
          anchorTile: { x: TILE.x, y: TILE.y },
          openArea: true,
          width,
          height,
          residentCapacity: 0,
          concurrentUseCapacity: 0,
          concurrentUseCapacityByCapability: [],
          objectCapabilities: [],
        });
        expect(width * height, 'this case is only interesting below one place').toBeLessThan(TILES_PER_OPEN_GROUND_PLACE);
        expect(
          registry.concurrentUseCapacityFor(registry.getById(instanceId)!, undefined),
          `${instanceId} is ${width}x${height} and must still admit one`,
        ).toBe(1);
        expect(registry.claimUse(instanceId, 1 as never)).toBe(true);
        expect(registry.claimUse(instanceId, 2 as never), 'and only one').toBe(false);
      }
    });

    /**
     * **The owner's ruling of 2026-08-29 (issue #585), which amends
     * [ADR 0071](../../docs/adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md):
     * capacity derived from a room's own ground applies only to room types
     * explicitly tagged as open areas.**
     *
     * The tag is authored in `src/content/room-catalog.ts` on `room.yard`,
     * `room.holding-cell` and `room.delivery-bay`, and carried onto the
     * instance at registration. What is asserted here is the rule, not the
     * list: the list is `content-catalogs.test.ts`'s, and a rule tested
     * against the same catalogue it is read from would agree with any tagging.
     */
    describe('floor area bounds only a room tagged as an open area (#585)', () => {
      /** One instance of `roomCatalogId`, `width` x `height`, tagged or not, with no objects in it. */
      function bareRoom(roomCatalogId: string, openArea: boolean, width = 8, height = 8): RoomInstanceRegistry {
        const registry = new RoomInstanceRegistry();
        registry.register({
          instanceId: 'room-1',
          roomCatalogId,
          anchorTile: TILE,
          ...(openArea ? { openArea: true } : {}),
          width,
          height,
          residentCapacity: 0,
          concurrentUseCapacity: 0,
          concurrentUseCapacityByCapability: [],
          objectCapabilities: [],
        });
        return registry;
      }

      it('derives nothing for an untagged room, however much ground it has', () => {
        // 32x32 is 1,024 tiles -- 64 open-ground places under the arithmetic --
        // so this fails on any implementation that still reads the rectangle
        // for an untagged room, and it cannot be satisfied by a clamp or a
        // rounding accident.
        const registry = bareRoom('room.cell', false, 32, 32);
        const cell = registry.getById('room-1')!;
        expect(Math.floor((32 * 32) / TILES_PER_OPEN_GROUND_PLACE), 'the arithmetic this room does not get to use').toBe(64);
        expect(registry.concurrentUseCapacityFor(cell, undefined)).toBe(0);
        expect(registry.claimUse('room-1', 1 as never), 'and admits nobody at all').toBe(false);
        expect(registry.hasPlaceForUse('room.cell')).toBe(false);
        expect(registry.findAvailableForUse('room.cell')).toBeUndefined();
      });

      it('derives nothing for an untagged room that records no rectangle either, rather than falling through to unbounded', () => {
        // The order of the two tests inside `openGroundCapacityOf` is the
        // subject: a missing rectangle answers `POSITIVE_INFINITY`, so an
        // implementation that asked about the rectangle first would hand an
        // untagged room the *unbounded* answer -- the exact behaviour the
        // ruling exists to remove, reached through the back door.
        const registry = new RoomInstanceRegistry();
        registry.register({
          instanceId: 'room-1', roomCatalogId: 'room.cell', anchorTile: TILE,
          residentCapacity: 0, concurrentUseCapacity: 0, concurrentUseCapacityByCapability: [], objectCapabilities: [],
        });
        const cell = registry.getById('room-1')!;
        expect(cell.width, 'this case is only interesting with no rectangle').toBeUndefined();
        expect(registry.concurrentUseCapacityFor(cell, undefined)).toBe(0);
      });

      it('derives the same ground for a tagged room as it always did', () => {
        // The other half, and the reason this is a scoping and not a nerf:
        // nothing a tagged room derives moves.
        const registry = bareRoom('room.yard', true, 8, 8);
        expect(registry.concurrentUseCapacityFor(registry.getById('room-1')!, undefined)).toBe(
          Math.floor((8 * 8) / TILES_PER_OPEN_GROUND_PLACE),
        );
      });

      it('leaves the capability-scoped ceiling alone in both directions', () => {
        // The ruling is about the *no-capability* case only. A room's objects
        // still bound what they bound, tagged or untagged -- otherwise this
        // would have taken the dining ceiling off every canteen.
        for (const openArea of [true, false]) {
          const registry = new RoomInstanceRegistry();
          registry.register({
            instanceId: 'canteen-1', roomCatalogId: 'room.canteen', anchorTile: TILE,
            ...(openArea ? { openArea: true } : {}),
            width: 6, height: 6,
            residentCapacity: 0, concurrentUseCapacity: 6,
            concurrentUseCapacityByCapability: [['dining', 6]],
            objectCapabilities: ['dining'],
          });
          expect(registry.concurrentUseCapacityFor(registry.getById('canteen-1')!, 'dining')).toBe(6);
          expect(registry.concurrentUseCapacityFor(registry.getById('canteen-1')!, 'hygiene')).toBe(0);
        }
      });
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

  /**
   * `totalResidentCapacity` -- the "fresh, unfurnished" predicate ADR 0017's
   * starter-rung amendment reads. `tests/integration/economy-liquidity-hard-lock.test.ts`
   * is the gate that proves it drives the rung through the real kernel; this
   * pins the registry-level facts that predicate depends on.
   */
  describe('totalResidentCapacity', () => {
    it('is zero for an empty registry -- the state every fresh prison starts in', () => {
      expect(new RoomInstanceRegistry().totalResidentCapacity).toBe(0);
    });

    it('is zero for a zoned room with nothing furnishing it, whatever its room type', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] });
      registry.register({ instanceId: 'yard-1', roomCatalogId: 'room.yard', anchorTile: TILE, residentCapacity: 0, concurrentUseCapacity: 10, objectCapabilities: [] });
      expect(registry.totalResidentCapacity).toBe(0);
    });

    it('sums across every registered instance, not the first one found', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'infirmary-1', roomCatalogId: 'room.infirmary', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      expect(registry.totalResidentCapacity).toBe(4);
    });

    it('counts a medical bed`s capacity too -- unlike `accommodationCapacity`, deliberately', () => {
      // The whole reason this is a new accessor rather than a reuse of the
      // accommodation-scoped figure `IntakeSystem` uses: a prison that has
      // furnished only an infirmary has still proven it can buy and place a
      // plank-priced sleep surface, which is what "unfurnished" means here.
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'infirmary-1', roomCatalogId: 'room.infirmary', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      expect(registry.totalResidentCapacity).toBe(1);
    });

    it('rises the moment `updateDerived` gives an instance its first sleep surface, live rather than cached', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 0, concurrentUseCapacity: 0, objectCapabilities: [] });
      expect(registry.totalResidentCapacity, 'zoned, not yet furnished').toBe(0);

      registry.updateDerived('cell-1', {
        residentCapacity: 1,
        concurrentUseCapacity: 1,
        concurrentUseCapacityByCapability: [['sleep-surface', 1]],
        objectCapabilities: ['sleep-surface'],
      });
      expect(registry.totalResidentCapacity, 'the very next read, with nothing else touched').toBe(1);
    });

    it('falls back to zero if the bed is taken out again, exactly the reverse transition', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      expect(registry.totalResidentCapacity).toBe(1);
      registry.updateDerived('cell-1', { residentCapacity: 0, concurrentUseCapacity: 0, concurrentUseCapacityByCapability: [], objectCapabilities: [] });
      expect(registry.totalResidentCapacity).toBe(0);
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

    it('gives a tie above the floor to the lowest instance id, not to the last candidate rated (#445)', () => {
      // **The rating has to exceed zero or this case is vacuous, and that is
      // exactly why every other case here misses what it guards.** The tie
      // cases above all rate candidates `0`, and `if (rating <= 0) break;` on
      // the line after the comparison fires on the very first candidate, so no
      // second rating is ever produced and `<` and `<=` cannot be told apart.
      // The one case that rates above the floor uses a strictly decreasing
      // 3, 2, 1 and so never ties. Reversing the comparison to `<=` -- which
      // hands a tie to the *highest* instance id -- therefore survived the
      // whole suite.
      //
      // It is reachable in ordinary play, not a contrived rating:
      // `rateCellSharing` returns `max |riskTier difference|`, an integer 0-3
      // (`src/simulation/prisoners/cell-sharing.ts`), so once no empty cell is
      // free, two occupied cells one tier away from the arrival both rate `1`
      // and which prisoner gets which cellmate -- the whole subject of #79 --
      // flips.
      //
      // Registration order is deliberately not sorted order, so the answer
      // depends on the comparison and `allByRoomCatalogId`'s sort rather than
      // on which instance happened to be registered first.
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-3', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: [] });

      const visited: string[] = [];
      const chosen = registry.findBestAvailable('room.cell', (_occupants, instance) => {
        visited.push(instance.instanceId);
        return 2;
      });

      // A tie is not a reason to stop: every candidate is still rated, and the
      // first one seen keeps the win.
      expect(visited).toEqual(['cell-1', 'cell-2', 'cell-3']);
      expect(chosen?.instanceId).toBe('cell-1');
    });

    it('returns undefined when no instance of the room type exists at all', () => {
      const registry = new RoomInstanceRegistry();
      expect(registry.findBestAvailable('room.cell', () => 0)).toBeUndefined();
    });
  });

  describe('loadSnapshot', () => {
    /**
     * **A save is a file the player's browser produced, and the occupancy list
     * inside it is not a set.** `src/persistence/save-schema.ts:646` validates
     * `roomInstanceOccupancy` as
     * `z.array(z.tuple([z.string().min(1), z.array(entityIdSchema)]))` -- there
     * is no uniqueness constraint anywhere on that inner array, so a corrupt or
     * hand-edited save carrying the same entity id twice inside one instance's
     * list passes validation and reaches this method intact.
     *
     * `loadSnapshot` recounts `occupiedPlaceCount` from the restored `Set`
     * rather than from the payload's length, and that is the whole of the
     * defence. Changing `this.occupiedPlaceCount += target.size` to
     * `+= occupants.length` leaves the entire suite green while this happens:
     *
     * ```text
     * CLEAN     [occupancyOf, totalOccupancy] = [1, 1]
     * MUTATED   [occupancyOf, totalOccupancy] = [1, 2]
     * ```
     *
     * The divergence is money, not bookkeeping. **This paragraph read
     * "`StateIncomeSystem` bills the state per in-game day off `totalOccupancy`
     * (`src/simulation/economy/income.ts:321` and `:325`)" and that is no longer
     * how the state is billed.** Issue #585 took `totalOccupancy` off
     * `OccupiedPlaceSource` on purpose -- `income.ts`'s
     * `OccupiedPlaceSource.residentIdsWithExistingPlace` declaration carries the
     * reasoning -- so the income line now walks a list of resident ids rather
     * than reading a count. The defence this test pins is unchanged and the
     * reason for it is stronger: the restored `Set` is what both the count and
     * that id list are derived from, so a duplicated id in a save would inflate
     * whichever of the two the economy happens to read, while `occupancyOf`,
     * which every capacity gate reads, still says one. The two counts must not
     * be able to disagree.
     */
    it('recounts occupancy from the restored set, so a duplicated entity id in a save is not an extra occupied place', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'room.cell:0:0', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });

      registry.loadSnapshot([['room.cell:0:0', [7, 7]]]);

      expect(registry.occupancyOf('room.cell:0:0'), 'one entity is one resident however many times the payload names it').toBe(1);
      expect(registry.totalOccupancy, 'the economy input must agree with the per-instance count').toBe(1);
      expect(registry.occupantsOf('room.cell:0:0')).toEqual([7]);

      // And the room still has the free bed the honest count says it has: a
      // second resident is admitted rather than refused against a capacity the
      // duplicate had already eaten.
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('room.cell:0:0');
      expect(registry.assign('room.cell:0:0', 9)).toBe(true);
      expect(registry.totalOccupancy).toBe(2);
    });

    it('keeps the two counts equal for an ordinary payload, so the case above is about the duplicate and not about restoring at all', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'cell-2', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });

      registry.loadSnapshot([['cell-1', [3, 4]], ['cell-2', [5]]]);

      expect(registry.occupancyOf('cell-1')).toBe(2);
      expect(registry.occupancyOf('cell-2')).toBe(1);
      expect(registry.totalOccupancy).toBe(3);

      // A second load replaces rather than accumulates, which is what makes
      // `totalOccupancy` a function of the payload and not of the load history.
      registry.loadSnapshot([['cell-1', [3]]]);
      expect(registry.totalOccupancy).toBe(1);
      expect(registry.occupancyOf('cell-2')).toBe(0);
    });

    it('throws rather than silently dropping occupants for an instance id the registry does not have', () => {
      const registry = new RoomInstanceRegistry();
      expect(() => registry.loadSnapshot([['room.cell:9:9', [1]]])).toThrow(RangeError);
    });
  });

  /**
   * **The last line of defence against the second half of issue #337** -- a
   * prisoner left naming a room that no longer exists.
   *
   * `RoomZoningService.unzone` is the *first* line: it checks `claimCountOf`
   * and answers the player `unzone.room-occupied`
   * (`src/simulation/rooms/zoning.ts:880`), and
   * `tests/unit/rooms-zoning.test.ts` and
   * `tests/integration/room-zoning-loop.test.ts` guard that. The throw below is
   * what stands behind it, for any *other* caller that unregisters without
   * asking first -- and this describe block exists because nothing asserted it.
   * `unregister` is the only method that can destroy a room instance
   * (`grep -rn '\.unregister(' src/` finds one room-instance caller,
   * `src/simulation/rooms/zoning.ts:908`), a prisoner's
   * `accommodationInstanceId` is a plain string in cold state with no
   * referential integrity behind it
   * (`src/simulation/prisoners/components.ts:314`), and a mutation deleting the
   * guard survived the whole suite.
   *
   * Two claim kinds, one guard, because ADR 0029 made both of them references:
   * a resident holds `accommodationInstanceId` and a performer holds
   * `currentActionTargetInstanceId`, and each dangles the same way.
   */
  describe('unregister', () => {
    it('refuses a room a resident still names, and leaves that reference resolvable', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'room.cell:0:0', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities: ['sleep-surface'] });
      expect(registry.assign('room.cell:0:0', 7)).toBe(true);

      expect(() => registry.unregister('room.cell:0:0')).toThrow(RangeError);

      // Stated as the dangling reference rather than as a count: the id the
      // prisoner's cold state holds still resolves to a registered room, that
      // room still holds them, and every index still lists it.
      expect(registry.getById('room.cell:0:0'), 'the room the resident names must still exist').toBeDefined();
      expect(registry.occupantsOf('room.cell:0:0')).toEqual([7]);
      expect(registry.occupancyOf('room.cell:0:0')).toBe(1);
      expect(registry.totalOccupancy).toBe(1);
      expect(registry.allByRoomCatalogId('room.cell').map((instance) => instance.instanceId)).toEqual(['room.cell:0:0']);
      expect(registry.instancesOccupiedBy(7)).toEqual(['room.cell:0:0']);

      // And the refusal is not permanent: it is a statement about the claim,
      // so releasing the resident makes the same call succeed.
      registry.release('room.cell:0:0', 7);
      expect(registry.unregister('room.cell:0:0')).toBe(true);
      expect(registry.getById('room.cell:0:0')).toBeUndefined();
    });

    it('refuses a room somebody is only *using*, not living in (ADR 0029)', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'room.canteen:8:8', roomCatalogId: 'room.canteen', anchorTile: TILE, residentCapacity: 0, concurrentUseCapacity: 1, objectCapabilities: ['dining'] });
      expect(registry.claimUse('room.canteen:8:8', 4, 'dining')).toBe(true);
      expect(registry.occupancyOf('room.canteen:8:8'), 'nobody lives here; the guard must not be reading residency alone').toBe(0);

      expect(() => registry.unregister('room.canteen:8:8')).toThrow(RangeError);
      expect(registry.getById('room.canteen:8:8')).toBeDefined();
      expect(registry.useOccupancyOf('room.canteen:8:8')).toBe(1);

      // Transient by construction -- a use claim lasts one action.
      registry.releaseUse('room.canteen:8:8', 4);
      expect(registry.unregister('room.canteen:8:8')).toBe(true);
    });

    it('drops an unclaimed room out of every index, so a removed room is never handed to an arrival', () => {
      const registry = new RoomInstanceRegistry();
      registry.register({ instanceId: 'room.cell:0:0', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      registry.register({ instanceId: 'room.cell:9:9', roomCatalogId: 'room.cell', anchorTile: TILE, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: ['sleep-surface'] });
      // Warms the sorted cache before the removal, which is the state the
      // intake hot path is actually in: `findAvailableResidence` reads
      // `allByRoomCatalogId`, and a cache left behind would go on offering the
      // removed room to the next arrival.
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId).toBe('room.cell:0:0');

      expect(registry.unregister('room.cell:0:0')).toBe(true);

      expect(registry.getById('room.cell:0:0')).toBeUndefined();
      expect(registry.allByRoomCatalogId('room.cell').map((instance) => instance.instanceId)).toEqual(['room.cell:9:9']);
      expect(registry.findAvailableResidence('room.cell', 'sleep-surface')?.instanceId, 'the survivor, never the room that is gone').toBe('room.cell:9:9');
      expect(registry.findAvailableForUse('room.cell', 'sleep-surface')?.instanceId).toBe('room.cell:9:9');
    });

    it('reports rather than throws for an id it never had', () => {
      const registry = new RoomInstanceRegistry();
      expect(registry.unregister('room.cell:1:1')).toBe(false);
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
