import type { AtlasDirection } from '../assets/atlas-manifest';
import { DEFAULT_FACING, clipFrameOrdinal, directionFromMovement } from '../assets/direction';

/**
 * Chooses which authored clip and direction an actor is drawn with.
 *
 * Every input is something the simulation already decided (where the actor is
 * and which way it is moving); nothing here influences it. That is what makes
 * this a presentation lookup rather than a second, renderer-side movement
 * model -- `AGENTS.md` boundary 1.
 *
 * Pure, allocation-light and Phaser-free, so the whole selection rule is
 * unit-testable without a canvas.
 */

/** Clip ids authored in the base and guard-response eight-direction contracts. */
export const IDLE_CLIP_ID = 'idle';
export const WALK_CLIP_ID = 'walk';
export const RESPOND_CLIP_ID = 'respond';
export const SEARCH_CLIP_ID = 'search';

/**
 * Speed below which an actor is drawn idle rather than walking, in world
 * units per second.
 *
 * It exists because a movement vector that is *almost* zero carries no
 * reliable direction: normalising it would make a standing actor spin as
 * floating-point noise crossed the axes. A twentieth of a tile per second is
 * far below any real walk speed and far above that noise.
 */
export const IDLE_SPEED_THRESHOLD = 0.05;

export interface ActorMotion {
  /** Movement per second in world space, `+x` east and `+y` south (the direction contract's frame). */
  readonly deltaX: number;
  readonly deltaY: number;
  /** Direction to keep when standing still; defaults to the contract's authored front view. */
  readonly facing?: AtlasDirection;
  readonly incidentResponse?: boolean;
  readonly contrabandSearch?: boolean;
}

/**
 * Mutable and filled in place: the actor layer selects a pose per visible
 * actor per frame, so returning a fresh object would be per-frame garbage
 * proportional to the crowd. Callers treat it as a value.
 */
export interface ActorPose {
  clipId: string;
  direction: AtlasDirection;
}

export function createActorPose(): ActorPose {
  return { clipId: IDLE_CLIP_ID, direction: DEFAULT_FACING };
}

export function selectActorPose(motion: ActorMotion, out: ActorPose = createActorPose()): ActorPose {
  const { deltaX, deltaY } = motion;
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError('Actor movement components must be finite.');
  }

  const facing = motion.facing ?? DEFAULT_FACING;
  if (motion.incidentResponse) {
    out.clipId = RESPOND_CLIP_ID;
    out.direction = facing;
    return out;
  }
  if (motion.contrabandSearch) {
    out.clipId = SEARCH_CLIP_ID;
    out.direction = facing;
    return out;
  }
  const speed = Math.hypot(deltaX, deltaY);
  if (speed < IDLE_SPEED_THRESHOLD) {
    out.clipId = IDLE_CLIP_ID;
    out.direction = facing;
    return out;
  }

  out.clipId = WALK_CLIP_ID;
  out.direction = directionFromMovement(deltaX, deltaY, facing);
  return out;
}

/**
 * Frame within a clip at a given animation time.
 *
 * Re-exported through this module so the actor layer has one import for "which
 * pose, which frame", and so the phase offset that stops a crowd of actors from
 * stepping in perfect unison lives next to the rule it perturbs.
 */
export function actorFrameOrdinal(
  elapsedSeconds: number,
  fps: number,
  frameCount: number,
  loop: boolean,
  phaseSeconds = 0,
): number {
  if (!Number.isFinite(phaseSeconds) || phaseSeconds < 0) {
    throw new RangeError('Animation phase must be finite and non-negative.');
  }
  return clipFrameOrdinal(elapsedSeconds + phaseSeconds, fps, frameCount, loop);
}

/**
 * A stable per-actor animation phase in [0, 1) seconds, derived from the
 * actor id alone.
 *
 * Deterministic on purpose: the same actor gets the same phase in every
 * session and on every client, so this cannot become a hidden source of
 * client-side divergence. It is only ever used to pick a frame.
 */
export function actorAnimationPhase(actorId: number): number {
  if (!Number.isSafeInteger(actorId)) throw new RangeError('Actor id must be a safe integer.');
  // Integer hash (Knuth's multiplicative constant), mapped into [0, 1).
  const hashed = Math.imul(actorId | 0, 2_654_435_761) >>> 0;
  return hashed / 4_294_967_296;
}
