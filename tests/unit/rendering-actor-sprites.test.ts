import { describe, expect, it } from 'vitest';
import { ATLAS_DIRECTIONS } from '../../src/rendering/assets/atlas-manifest';
import {
  IDLE_SPEED_THRESHOLD,
  actorAnimationPhase,
  actorFrameOrdinal,
  createActorPose,
  selectActorPose,
} from '../../src/rendering/actors/actor-pose';
import { createSpritePlacement, placeFootPivotSprite } from '../../src/rendering/actors/sprite-placement';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';

/**
 * The whole "which picture, where" decision, tested without Phaser and
 * without a clock: given a movement vector and an animation time, the answers
 * are fixed. `docs/BENCHMARKING.md` rules out timing assertions, and none of
 * this needs one -- time is an argument here, not a measurement.
 */

/** The production frame geometry, from `assets/contracts/character-8-direction.contract.json`. */
const CONTRACT_FRAME = {
  rect: { x: 2, y: 2, width: 256, height: 384 },
  footPivotPx: { x: 128, y: 352 },
} as const;

describe('actor pose selection', () => {
  it('maps every movement octant to the authored direction for that octant', () => {
    const cases: readonly (readonly [number, number, string])[] = [
      [1, 0, 'east'],
      [1, 1, 'southEast'],
      [0, 1, 'south'],
      [-1, 1, 'southWest'],
      [-1, 0, 'west'],
      [-1, -1, 'northWest'],
      [0, -1, 'north'],
      [1, -1, 'northEast'],
    ];

    for (const [deltaX, deltaY, expected] of cases) {
      const pose = selectActorPose({ deltaX, deltaY });
      expect(pose.direction, `movement (${deltaX}, ${deltaY})`).toBe(expected);
      expect(pose.clipId).toBe('walk');
    }
  });

  it('covers all eight authored directions and nothing else', () => {
    const seen = new Set<string>();
    for (let step = 0; step < 64; step += 1) {
      const angle = (Math.PI * 2 * step) / 64;
      seen.add(selectActorPose({ deltaX: Math.cos(angle), deltaY: Math.sin(angle) }).direction);
    }
    expect([...seen].sort()).toEqual([...ATLAS_DIRECTIONS].sort());
  });

  it('holds the last facing and the idle clip when barely moving', () => {
    const nudge = IDLE_SPEED_THRESHOLD / 2;
    const pose = selectActorPose({ deltaX: nudge, deltaY: -nudge, facing: 'west' });
    expect(pose).toEqual({ clipId: 'idle', direction: 'west' });
    expect(selectActorPose({ deltaX: 0, deltaY: 0 })).toEqual({ clipId: 'idle', direction: 'south' });
  });

  it('walks as soon as movement is real, at the same threshold in every direction', () => {
    const speed = IDLE_SPEED_THRESHOLD * 1.01;
    for (const [deltaX, deltaY] of [
      [speed, 0],
      [0, speed],
      [-speed, 0],
      [0, -speed],
    ] as const) {
      expect(selectActorPose({ deltaX, deltaY }).clipId).toBe('walk');
    }
  });

  it('fills a caller-owned pose, so the hot path allocates nothing per actor', () => {
    const reused = createActorPose();
    expect(selectActorPose({ deltaX: 0, deltaY: 2 }, reused)).toBe(reused);
    expect(reused.direction).toBe('south');
    selectActorPose({ deltaX: -2, deltaY: 0 }, reused);
    expect(reused.direction).toBe('west');
  });

  it('rejects a non-finite movement vector rather than guessing a direction', () => {
    expect(() => selectActorPose({ deltaX: Number.NaN, deltaY: 0 })).toThrow(RangeError);
  });
});

describe('clip frame selection over time', () => {
  it('advances one frame per 1/fps and wraps a looping clip', () => {
    expect(actorFrameOrdinal(0, 10, 8, true)).toBe(0);
    expect(actorFrameOrdinal(0.09, 10, 8, true)).toBe(0);
    expect(actorFrameOrdinal(0.1, 10, 8, true)).toBe(1);
    expect(actorFrameOrdinal(0.35, 10, 8, true)).toBe(3);
    expect(actorFrameOrdinal(0.8, 10, 8, true)).toBe(0);
    expect(actorFrameOrdinal(1.25, 10, 8, true)).toBe(4);
  });

  it('clamps a non-looping clip on its last frame', () => {
    expect(actorFrameOrdinal(99, 10, 8, false)).toBe(7);
  });

  it('keeps a single-frame idle clip on frame zero forever', () => {
    for (const elapsed of [0, 1, 7.5, 600]) expect(actorFrameOrdinal(elapsed, 1, 1, true)).toBe(0);
  });

  it('offsets actors by a stable per-actor phase so a crowd does not march in lockstep', () => {
    const phases = [1, 2, 3, 4, 5].map(actorAnimationPhase);
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
    expect(new Set(phases).size).toBe(phases.length);
    // Deterministic: the same actor gets the same phase every time, so this
    // can never become a source of client-to-client divergence.
    expect(actorAnimationPhase(4)).toBe(phases[3]);
  });

  it('still selects a valid frame once the phase is applied', () => {
    for (const actorId of [0, 1, 17, 4_242]) {
      const ordinal = actorFrameOrdinal(3.3, 10, 8, true, actorAnimationPhase(actorId));
      expect(Number.isInteger(ordinal)).toBe(true);
      expect(ordinal).toBeGreaterThanOrEqual(0);
      expect(ordinal).toBeLessThan(8);
    }
  });

  it('rejects impossible clip parameters', () => {
    expect(() => actorFrameOrdinal(-1, 10, 8, true)).toThrow(RangeError);
    expect(() => actorFrameOrdinal(1, 0, 8, true)).toThrow(RangeError);
    expect(() => actorFrameOrdinal(1, 10, 0, true)).toThrow(RangeError);
    expect(() => actorFrameOrdinal(1, 10, 8, true, -0.5)).toThrow(RangeError);
  });
});

describe('foot pivot placement', () => {
  it('puts the foot pivot exactly on the actor position', () => {
    const placement = placeFootPivotSprite(100, 200, CONTRACT_FRAME);

    // 256px of authored frame drawn across one tile.
    expect(placement.scale).toBe(TILE_SIZE_PX / 256);
    expect(placement.displayWidth).toBe(TILE_SIZE_PX);
    expect(placement.displayHeight).toBe((384 / 256) * TILE_SIZE_PX);

    // The pivot sits 128px right and 352px down from the frame corner, so the
    // corner lands that far up and left of the actor, at the drawn scale.
    expect(placement.topLeftX).toBe(100 - 128 * placement.scale);
    expect(placement.topLeftY).toBe(200 - 352 * placement.scale);
    expect(placement.x).toBe(100);
    expect(placement.y).toBe(200);
  });

  it('expresses the pivot as a normalised origin, so the drawn position is the pivot', () => {
    const placement = placeFootPivotSprite(0, 0, CONTRACT_FRAME);
    expect(placement.originX).toBe(0.5);
    expect(placement.originY).toBeCloseTo(352 / 384, 12);

    // Reconstructing the pivot from the origin and the drawn size must land
    // back on the actor position -- that is the invariant a wrong origin breaks.
    expect(placement.topLeftX + placement.originX * placement.displayWidth).toBeCloseTo(0, 10);
    expect(placement.topLeftY + placement.originY * placement.displayHeight).toBeCloseTo(0, 10);
  });

  it('keeps the sprite anchored as the actor moves, not stretched', () => {
    const first = placeFootPivotSprite(10, 10, CONTRACT_FRAME);
    const second = placeFootPivotSprite(74, 10, CONTRACT_FRAME);
    expect(second.topLeftX - first.topLeftX).toBe(64);
    expect(second.displayHeight).toBe(first.displayHeight);
  });

  it('honours a differently authored pivot without special-casing the role', () => {
    const stubby = { rect: { x: 0, y: 0, width: 8, height: 12 }, footPivotPx: { x: 4, y: 11 } };
    const placement = placeFootPivotSprite(50, 50, stubby, { tileSizePx: 16 });
    expect(placement.scale).toBe(2);
    expect(placement.topLeftX).toBe(50 - 8);
    expect(placement.topLeftY).toBe(50 - 22);
  });

  it('fills a caller-owned placement, so the hot path allocates nothing per actor', () => {
    const reused = createSpritePlacement();
    expect(placeFootPivotSprite(1, 2, CONTRACT_FRAME, undefined, reused)).toBe(reused);
    expect(reused.x).toBe(1);
    placeFootPivotSprite(3, 4, CONTRACT_FRAME, undefined, reused);
    expect(reused.x).toBe(3);
  });

  it('rejects impossible geometry rather than drawing an invisible sprite', () => {
    expect(() => placeFootPivotSprite(Number.NaN, 0, CONTRACT_FRAME)).toThrow(RangeError);
    expect(() => placeFootPivotSprite(0, 0, CONTRACT_FRAME, { tileSizePx: 0 })).toThrow(RangeError);
    expect(() =>
      placeFootPivotSprite(0, 0, { rect: { x: 0, y: 0, width: 0, height: 4 }, footPivotPx: { x: 0, y: 0 } }),
    ).toThrow(RangeError);
  });
});
