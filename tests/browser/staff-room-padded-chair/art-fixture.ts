/** Literal independently pinned authored model, not learned from a network response. */
export const STAFF_CHAIR_ART = {
  assetId: 'furniture.staff-room.padded-chair',
  descriptor: '/game-content/oblique-furniture-staff-room-padded-chair.v1.json',
  descriptorCanonicalTextSha256: 'd5d4c3a0db3a371aee7cddadaa7f5ef8f7ea9be86bc251b4947be3cf992d9bd9',
  source: 'assets/source/blender/furniture.staff-room.padded-chair.soft-light.blend',
  sourceSha256: '2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934',
  exposedFrame: '/assets/environment/oblique/furniture.staff-room.padded-chair-yaw+60-elev40.a200ce9518d2.png',
  exposedFrameSha256: 'a200ce9518d232a2ef0f6bdac0343738042804f87fb3e57f67c9f648345682f8',
  cameraTarget: [.5, .5, .6600000262260437],
} as const;

export const STAFF_CHAIR_OWNERS = {
  0: [
    { anchorTile: { x: 21, y: 7 }, orientation: 0, sourceOrderId: 'room-template-000000000002-2-object-001' },
    { anchorTile: { x: 23, y: 8 }, orientation: 0, sourceOrderId: 'room-template-000000000002-2-object-002' },
  ],
  1: [
    { anchorTile: { x: 22, y: 8 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-002' },
    { anchorTile: { x: 23, y: 6 }, orientation: 1, sourceOrderId: 'room-template-000000000002-2-object-001' },
  ],
} as const;
