import { expect, it } from 'vitest';
import { obliqueAssetIdForPlacedObject } from '../../src/rendering/assets/oblique-object-mapping';
import type { RenderRoom } from '../../src/rendering/feed/render-feed';

const room: RenderRoom = { instanceId: 'laundry', roomCatalogId: 'room.laundry', anchorTileX: 21, anchorTileY: 6, width: 4, height: 4 };
it('uses the full Laundry occupied rectangle while retaining default and Storage Room rack contexts', () => {
  const select = (x: number, y: number, width: number, height: number, rooms: readonly RenderRoom[] = [room]) => obliqueAssetIdForPlacedObject('object.storage-rack', x, y, { width, height }, rooms);
  expect(select(21, 8, 1, 1)).toBe('furniture.laundry.linen-rack');
  expect(select(24, 9, 1, 1)).toBe('furniture.laundry.linen-rack');
  for (const [x, y, w, h] of [[20, 8, 1, 1], [25, 8, 1, 1], [22, 5, 1, 1], [22, 10, 1, 1], [24, 8, 2, 1], [22, 9, 1, 2]] as const) expect(select(x, y, w, h)).toBe('furniture.storage.rack.wooden');
  expect(select(24, 8, 2, 1, [room, { ...room, instanceId: 'adjacent', anchorTileX: 25 }])).toBe('furniture.storage.rack.wooden');
  expect(select(21, 8, 1, 1, [])).toBe('furniture.storage.rack.wooden');
  expect(select(21, 8, 1, 1, [{ ...room, roomCatalogId: 'room.storage-room' }])).toBe('furniture.storage-room.timber-rack');
  expect(select(21, 8, 1, 1, [{ ...room, roomCatalogId: 'room.kitchen' }])).toBe('furniture.storage.rack.wooden');
  expect(obliqueAssetIdForPlacedObject('object.washing-machine', 21, 6, { width: 2, height: 1 }, [room])).toBe('utility.washing-machine.variants');
});
