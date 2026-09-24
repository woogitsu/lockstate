import { describe, expect, it } from 'vitest';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { IntakeCandidateBoard, candidateBountyMinorUnits } from '../../src/simulation/prisoners/intake-candidate-board';

const categories = [
  { id: 'currency', severity: 1 },
  { id: 'phone', severity: 2 },
  { id: 'tool', severity: 3 },
  { id: 'drugs', severity: 4 },
  { id: 'weapon', severity: 5 },
];

describe('intake candidate board (#594)', () => {
  it('offers one to three screened candidates each day, with a bounded two-day lifetime', () => {
    const board = new IntakeCandidateBoard(categories);
    const rng = new Xoshiro128StarStar([1, 2, 3, 4]);
    board.advanceToTick(0, rng);
    const first = board.snapshot();
    expect(first.candidates.length).toBeGreaterThanOrEqual(1);
    expect(first.candidates.length).toBeLessThanOrEqual(3);
    expect(first.candidates.every((candidate) => candidate.priorIncidents === 0)).toBe(true);
    expect(first.candidates.every((candidate) => candidate.expiresAtTick === 2 * DAY_LENGTH_TICKS)).toBe(true);
    board.advanceToTick(DAY_LENGTH_TICKS, rng);
    expect(board.snapshot().candidates.length).toBeGreaterThan(first.candidates.length);
    board.advanceToTick(2 * DAY_LENGTH_TICKS, rng);
    expect(board.snapshot().candidates.some((candidate) => first.candidates.some((original) => original.id === candidate.id))).toBe(false);
    expect(board.snapshot().candidates.length).toBeLessThanOrEqual(6);
  });

  it('delays an offer without admitting it and accepts it only once before expiry', () => {
    const board = new IntakeCandidateBoard(categories);
    board.advanceToTick(0, new Xoshiro128StarStar([1, 2, 3, 4]));
    const id = board.snapshot().candidates[0]!.id;
    expect(board.delay(id, 0)).toBe(true);
    expect(board.snapshot().candidates[0]!.status).toBe('delayed');
    const accepted = board.accept(id, DAY_LENGTH_TICKS);
    expect(accepted?.id).toBe(id);
    expect(board.accept(id, DAY_LENGTH_TICKS)).toBeUndefined();
  });

  it('pays at most three days of 300 for a high-risk offer', () => {
    expect([0, 1, 2, 3].map(candidateBountyMinorUnits)).toEqual([0, 150, 350, 750]);
  });
});
