/** Literal independently pinned authored model, not learned from a network response. */
export const STAFF_CHAIR_ART = {
  assetId: 'furniture.staff-room.padded-chair',
  descriptor: '/game-content/oblique-furniture-staff-room-padded-chair.v1.json',
  descriptorCanonicalTextSha256: '718fda5f4874146a71622a4db9814950acd845fa79aad85c8f935d56f42814c0',
  source: 'assets/source/blender/furniture.staff-room.padded-chair.blend',
  sourceSha256: '47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109',
  exposedFrame: '/assets/environment/oblique/furniture.staff-room.padded-chair-yaw+60-elev40.3d0fd0a02317.png',
  exposedFrameSha256: '3d0fd0a023174ec0a0fa897f33a57d1e07630a5201ec093f394a65634e399646',
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
