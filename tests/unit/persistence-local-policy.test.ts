import { describe, expect, it } from 'vitest';
import {
  applyConfirmedRetention,
  applyGenerationRetention,
  applyProvisionalRetention,
} from '../../src/persistence/local/generation-policy';
import { classifyStoreError } from '../../src/persistence/local/errors';

describe('applyGenerationRetention', () => {
  it('keeps every generation while under the retention window', () => {
    const result = applyGenerationRetention(['a', 'b'], 'c', 3);
    expect(result).toEqual({ generationIds: ['a', 'b', 'c'], toDelete: [] });
  });

  it('prunes the oldest generations once the window overflows, oldest first', () => {
    const result = applyGenerationRetention(['a', 'b', 'c'], 'd', 3);
    expect(result).toEqual({ generationIds: ['b', 'c', 'd'], toDelete: ['a'] });
  });

  it('prunes more than one generation if the window shrinks below the existing count', () => {
    const result = applyGenerationRetention(['a', 'b', 'c', 'd'], 'e', 2);
    expect(result).toEqual({ generationIds: ['d', 'e'], toDelete: ['a', 'b', 'c'] });
  });

  it('rejects a non-positive keep count', () => {
    expect(() => applyGenerationRetention([], 'a', 0)).toThrow(RangeError);
    expect(() => applyGenerationRetention([], 'a', -1)).toThrow(RangeError);
  });
});

/**
 * #438. `applyGenerationRetention` evicts the oldest generation because the
 * one arriving is a save the session was running a moment ago -- it restores
 * by construction. An import has decoded, migrated and checksummed and still
 * has not been shown to restore, so it may not spend one of the player's
 * saves on the strength of that. It takes the window's one spare slot
 * instead.
 */
describe('applyProvisionalRetention', () => {
  it('adds an unproven generation without evicting anything while the window is within budget', () => {
    expect(applyProvisionalRetention(['a', 'b', 'c'], 'd', 3)).toEqual({
      generationIds: ['a', 'b', 'c', 'd'],
      toDelete: [],
    });
  });

  it('reuses the spare slot rather than granting a second one', () => {
    expect(applyProvisionalRetention(['a', 'b', 'c', 'd'], 'e', 3)).toEqual({
      generationIds: ['a', 'b', 'c', 'e'],
      toDelete: ['d'],
    });
  });

  /**
   * A window over budget for some other reason -- a build that lowered
   * `keepGenerations` between sessions -- converges one import at a time
   * instead of having its newest saves trimmed off in a single write, and
   * never loses `a`, which is what an import must never touch.
   */
  it('retires exactly one generation per call, never a run of them', () => {
    expect(applyProvisionalRetention(['a', 'b', 'c', 'd'], 'e', 1)).toEqual({
      generationIds: ['a', 'b', 'c', 'e'],
      toDelete: ['d'],
    });
  });

  it('rejects a non-positive keep count', () => {
    expect(() => applyProvisionalRetention([], 'a', 0)).toThrow(RangeError);
  });
});

describe('applyConfirmedRetention', () => {
  it('leaves a window already within budget alone', () => {
    expect(applyConfirmedRetention(['a', 'b', 'c'], 3)).toEqual({ generationIds: ['a', 'b', 'c'], toDelete: [] });
  });

  it('closes the spare slot from the oldest end, exactly as the ordinary write would have', () => {
    expect(applyConfirmedRetention(['a', 'b', 'c', 'd'], 3)).toEqual({
      generationIds: ['b', 'c', 'd'],
      toDelete: ['a'],
    });
  });

  it('rejects a non-positive keep count', () => {
    expect(() => applyConfirmedRetention(['a'], 0)).toThrow(RangeError);
  });
});

describe('classifyStoreError', () => {
  it('classifies a QuotaExceededError distinctly', () => {
    const error = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    expect(classifyStoreError(error)).toMatchObject({ code: 'quota-exceeded' });
  });

  /**
   * Real Chromium raises `QuotaExceededError` with an **empty** message
   * (measured in tests/browser/local-save-quota.spec.ts), which would
   * otherwise leave the player-facing failure evidence blank for the most
   * likely storage failure of all.
   */
  it('never yields an empty message, falling back to the error name', () => {
    const error = Object.assign(new Error(''), { name: 'QuotaExceededError' });
    expect(classifyStoreError(error)).toEqual({ code: 'quota-exceeded', message: 'QuotaExceededError' });
  });

  it('classifies AbortError and related transaction-lifecycle errors as transaction-aborted', () => {
    for (const name of ['AbortError', 'TransactionInactiveError', 'InvalidStateError']) {
      const error = Object.assign(new Error(name), { name });
      expect(classifyStoreError(error)).toMatchObject({ code: 'transaction-aborted' });
    }
  });

  it('falls back to unknown-error for anything else, including non-Error throws', () => {
    expect(classifyStoreError(new Error('boom'))).toMatchObject({ code: 'unknown-error' });
    expect(classifyStoreError('boom')).toMatchObject({ code: 'unknown-error', message: 'boom' });
  });
});
