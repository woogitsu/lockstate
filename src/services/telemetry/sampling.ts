import { deterministicStateHash } from '../../simulation/determinism/canonical';

/**
 * Sampling is deterministic per (session, event name), not per event
 * occurrence: a session either reports an event type consistently for its
 * whole lifetime or never reports it. Random per-occurrence sampling
 * produces partial sequences -- half a crash loop, a third of a scenario's
 * steps -- which misrepresent what actually happened.
 *
 * It reuses the simulation's canonical hash rather than any RNG: no
 * simulation RNG stream may be consumed for a non-simulation concern
 * (docs/DETERMINISM.md), and `Math.random()` would make the decision
 * unstable within a session.
 */
export function samplingScore(sessionId: string, eventName: string): number {
  const hash = deterministicStateHash([sessionId, eventName]);
  // Top 32 bits of the 64-bit hash, normalized to [0, 1).
  return Number.parseInt(hash.slice(0, 8), 16) / 0x1_0000_0000;
}

export function shouldSample(sessionId: string, eventName: string, sampleRate: number): boolean {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return samplingScore(sessionId, eventName) < sampleRate;
}
