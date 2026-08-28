import { describe, expect, it } from 'vitest';
import {
  extrapolateActors,
  MAX_ACTOR_EXTRAPOLATION_SECONDS,
  type PublishedActorPosition,
} from '../../src/rendering/feed/actor-extrapolation';
import type { MutableRenderActor } from '../../src/rendering/feed/render-feed';

/**
 * What the renderer draws between two publications
 * ([ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md)).
 *
 * The worker publishes on a 100 ms ceiling and the scene draws every frame, so
 * without this an actor walking at five tiles a second moves in half-tile steps
 * ten times a second -- the same stutter #414 describes, an order of magnitude
 * smaller. Pure and Phaser-free, so the rule is testable in the node
 * environment `vitest.config.ts` runs in.
 */

function actor(overrides: Partial<MutableRenderActor> = {}): MutableRenderActor {
  return { id: 1, assetId: 'actor.prisoner.base', tileX: 0, tileY: 0, deltaX: 0, deltaY: 0, ...overrides };
}

const from = (tileX: number, tileY: number): PublishedActorPosition => ({ tileX, tileY });

describe('a published actor is advanced by its published velocity', () => {
  it('moves by velocity times elapsed time, from where it was published', () => {
    const walking = actor({ tileX: 4, tileY: 9, deltaX: 5, deltaY: 0 });
    extrapolateActors([walking], [from(4, 9)], 0.05);
    expect(walking).toMatchObject({ tileX: 4.25, tileY: 9 });
  });

  it('measures from the publication rather than from the last frame, so frames cannot accumulate error', () => {
    const walking = actor({ tileX: 0, tileY: 0, deltaX: 0, deltaY: -4 });
    const published = [from(0, 0)];

    // Three frames at irregular intervals, each measured from the same base.
    extrapolateActors([walking], published, 0.016);
    extrapolateActors([walking], published, 0.033);
    extrapolateActors([walking], published, 0.05);

    expect(walking.tileY).toBeCloseTo(-0.2, 10);
    // And a fourth frame that arrives *earlier* than the third -- a clock that
    // went backwards -- puts it back where 0.02s belongs rather than adding.
    extrapolateActors([walking], published, 0.02);
    expect(walking.tileY).toBeCloseTo(-0.08, 10);
  });

  it('leaves a standing actor exactly where it was published', () => {
    const standing = actor({ tileX: -3, tileY: 7 });
    extrapolateActors([standing], [from(-3, 7)], 10);
    expect(standing).toMatchObject({ tileX: -3, tileY: 7 });
  });

  it('clamps how far it will go, so a silent worker leaves the prison standing rather than sliding', () => {
    const walking = actor({ deltaX: 5 });
    extrapolateActors([walking], [from(0, 0)], 60);
    expect(walking.tileX).toBe(5 * MAX_ACTOR_EXTRAPOLATION_SECONDS);
    // The clamp is longer than one publication interval (ADR 0040's 100 ms
    // ceiling), so an ordinary late message does not make an actor stop and
    // start.
    expect(MAX_ACTOR_EXTRAPOLATION_SECONDS).toBeGreaterThan(0.1);
  });

  it('treats a negative or non-finite elapsed time as no time at all', () => {
    for (const elapsed of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const walking = actor({ tileX: 2, deltaX: 5 });
      extrapolateActors([walking], [from(2, 0)], elapsed);
      // Including `Infinity`, which the clamp would otherwise turn into the
      // maximum advance: a clock that has produced a non-number has not told
      // us how much time passed, and guessing "as much as allowed" is a worse
      // answer than "none".
      expect(walking.tileX, String(elapsed)).toBe(2);
    }
  });

  it('advances every actor it was given, and stops at the shorter of the two lists', () => {
    const first = actor({ id: 1, deltaX: 1 });
    const second = actor({ id: 2, deltaY: 2 });
    extrapolateActors([first, second], [from(0, 0), from(10, 10)], 0.1);
    expect([first.tileX, second.tileY]).toEqual([0.1, 10.2]);

    // A base list shorter than the actor list is a bug in the caller, not a
    // reason to read past the end of an array.
    const third = actor({ id: 3, deltaX: 1 });
    expect(() => extrapolateActors([first, third], [from(0, 0)], 0.1)).not.toThrow();
    expect(third.tileX).toBe(0);
  });
});
