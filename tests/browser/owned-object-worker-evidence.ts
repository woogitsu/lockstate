import { writeFile } from 'node:fs/promises';
import { expect, type Page } from './network-changed-fixture';

export interface OwnedObjectSnapshotData {
  world: { version: number };
  simulation: { objects: { placedObjects: {
    placedObjectId: string; objectId: string; sourceOrderId?: string;
    anchorTile: { x: number; y: number }; orientation: number;
  }[] } };
  construction: { orders: {
    id: string; definitionId: string; location: { x: number; y: number };
    state: string; objectOrientation?: number;
  }[] };
}
export interface ExpectedOwnedObject {
  anchorTile: { x: number; y: number }; orientation: number; sourceOrderId: string;
}
/** Only real request/reply through the spec's existing Worker observer. */
export async function recordOwnedObjectSnapshot(page: Page, path: string): Promise<OwnedObjectSnapshotData> {
  const reply = await page.evaluate(async () => {
    const ask = Reflect.get(window, 'askWorker') as ((kind: string, payload: unknown) => Promise<unknown>) | undefined;
    if (ask === undefined) throw new Error('actual worker observer absent');
    return ask('simulation/request-snapshot', { reason: 'consistency-check' });
  });
  await writeFile(path, JSON.stringify(reply, null, 2));
  return (reply as { payload: { snapshot: { data: OwnedObjectSnapshotData } } }).payload.snapshot.data;
}
/** Expected owners come from the authored template sequence or actual sent buy command, never from the object being verified. */
export function assertOwnedObjectOrders(data: OwnedObjectSnapshotData, objectId: string, definitionId: string,
  expected: readonly ExpectedOwnedObject[]): void {
  expect(data.world.version).toBe(1);
  const targets = data.simulation.objects.placedObjects.filter(object => object.objectId === objectId && object.anchorTile.x >= 20);
  expect(targets).toHaveLength(expected.length);
  for (const identity of expected) {
    const placedObjectId = `object:${identity.anchorTile.x}:${identity.anchorTile.y}`;
    const objects = targets.filter(object => object.placedObjectId === placedObjectId);
    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({ placedObjectId, objectId, ...identity });
    const orders = data.construction.orders.filter(order => order.id === identity.sourceOrderId);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ id: identity.sourceOrderId, definitionId, state: 'completed', location: identity.anchorTile });
    expect(orders[0]!.objectOrientation ?? 0).toBe(identity.orientation);
    expect(targets.filter(object => object.sourceOrderId === identity.sourceOrderId)).toHaveLength(1);
  }
  expect(new Set(targets.map(object => object.sourceOrderId)).size).toBe(targets.length);
}
