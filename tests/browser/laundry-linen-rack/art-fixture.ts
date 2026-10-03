/** Literal independently pinned authored model, not learned from a network response. */
export const LAUNDRY_LINEN_ART = {
  assetId: 'furniture.laundry.linen-rack',
  descriptor: '/game-content/oblique-furniture-laundry-linen-rack.v1.json',
  descriptorCanonicalTextSha256: 'acd29a2829e2577fa4c528facd4417735bfcede4bd6be00036a2f2f900993751',
  source: 'assets/source/blender/furniture.laundry.linen-rack.blend',
  sourceSha256: '779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec',
  exposedFrame: '/assets/environment/oblique/furniture.laundry.linen-rack-yaw+60-elev40.e2f44421aff0.png',
  exposedFrameSha256: 'e2f44421aff04ef5dbe7ea36f9c1102bffaa10b88ab498ad02e7a6b74b78dda1',
  cameraTarget: [.5, .5, .7039999961853027],
} as const;


export const LAUNDRY_RACK_SLOTS = { 0: { x: 21, y: 8 }, 1: { x: 22, y: 6 } } as const;
export const LAUNDRY_WASHER_OWNERS = {
  0: [
    { anchorTile: { x: 21, y: 6 }, orientation: 0, sourceOrderId: 'room-template-000000000002-2-object-000' },
    { anchorTile: { x: 23, y: 6 }, orientation: 0, sourceOrderId: 'room-template-000000000002-2-object-001' },
  ],
  1: [
    { anchorTile: { x: 24, y: 6 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-000' },
    { anchorTile: { x: 24, y: 8 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-001' },
  ],
} as const;
