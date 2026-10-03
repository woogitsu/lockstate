/** Literal independently pinned authored model, not learned from a network response. */
export const LAUNDRY_LINEN_ART = {
  assetId: 'furniture.laundry.linen-rack',
  descriptor: '/game-content/oblique-furniture-laundry-linen-rack.v1.json',
  descriptorCanonicalTextSha256: '92928c0b7ce2e9d18959940fd0f70509ab0e09d3a2816bf4bc8a55d9fcc3eb14',
  source: 'assets/source/blender/furniture.laundry.linen-rack.soft-light.blend',
  sourceSha256: '2916717c4dd17d7be39a5725858b2356e53181cb735f2faeb28963d0adafa299',
  exposedFrame: '/assets/environment/oblique/furniture.laundry.linen-rack-yaw+60-elev40.65f80634dc02.png',
  exposedFrameSha256: '65f80634dc026fa83c95fcf81ee40e539f0f947ab8dc0b03f0c0eb377b883716',
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
