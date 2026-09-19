import { describe, expect, it } from 'vitest';
import {
  applyConfirmedRetention,
  applyGenerationRetention,
  applyProvisionalRetention,
  isQuarantinedGenerationId,
  quarantinedGenerationId,
  readableGenerationIds,
  releasedGenerationId,
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

/**
 * #432. A quarantined generation is one this build has refused as
 * `unsupported-by-this-build` and kept for the build that can read it. Every
 * rule in `generation-policy.ts` has to leave it alone, and the reason it has
 * to is arithmetic: the window evicts from the oldest end, so a generation
 * that merely escaped deletion would be gone after `keep` further autosaves --
 * 90 seconds at the 30-second cadence, against a fix measured in weeks.
 *
 * The literals below are the marked form spelled out rather than produced by
 * `quarantinedGenerationId`, so these assertions do not take the mark's shape
 * from the code they are checking.
 */
describe('a quarantined generation sits outside every retention rule', () => {
  it('marks and unmarks an id, and recognises the marked form', () => {
    expect(quarantinedGenerationId('gen-7')).toBe('!unreadable!gen-7');
    expect(isQuarantinedGenerationId('!unreadable!gen-7')).toBe(true);
    expect(isQuarantinedGenerationId('gen-7')).toBe(false);
    expect(releasedGenerationId('!unreadable!gen-7')).toBe('gen-7');
    // Idempotent in both directions: quarantining twice is quarantining once,
    // and releasing something that was never marked returns it unchanged.
    expect(quarantinedGenerationId('!unreadable!gen-7')).toBe('!unreadable!gen-7');
    expect(releasedGenerationId('gen-7')).toBe('gen-7');
  });

  it('reports the generations this build can still offer, in window order', () => {
    expect(readableGenerationIds(['a', '!unreadable!b', 'c'])).toEqual(['a', 'c']);
  });

  it('does not count a quarantined generation against the window, so the player keeps their full three', () => {
    expect(applyGenerationRetention(['a', '!unreadable!b', 'c'], 'd', 3)).toEqual({
      generationIds: ['a', '!unreadable!b', 'c', 'd'],
      toDelete: [],
    });
  });

  it('evicts the oldest readable generation and never the quarantined one, however full the window', () => {
    expect(applyGenerationRetention(['a', '!unreadable!b', 'c', 'd'], 'e', 3)).toEqual({
      generationIds: ['!unreadable!b', 'c', 'd', 'e'],
      toDelete: ['a'],
    });
    // And it is still there once the window has turned over completely: `a`
    // and `c` are both gone before it gives up a single slot.
    expect(applyGenerationRetention(['!unreadable!b', 'c', 'd', 'e'], 'f', 3)).toEqual({
      generationIds: ['!unreadable!b', 'd', 'e', 'f'],
      toDelete: ['c'],
    });
  });

  it('is not the spare slot an import may take, and does not make the window look over budget', () => {
    // Three readable plus a quarantined one is a window *within* budget, so
    // the import takes the spare slot and evicts nothing.
    expect(applyProvisionalRetention(['a', '!unreadable!b', 'c', 'd'], 'e', 3)).toEqual({
      generationIds: ['a', '!unreadable!b', 'c', 'd', 'e'],
      toDelete: [],
    });
    // A second import reuses the spare slot -- the newest *readable*
    // generation -- rather than the quarantined one above it.
    expect(applyProvisionalRetention(['a', '!unreadable!b', 'c', 'd', 'e'], 'f', 3)).toEqual({
      generationIds: ['a', '!unreadable!b', 'c', 'd', 'f'],
      toDelete: ['e'],
    });
  });

  it('is not what a confirmation closes the window on', () => {
    expect(applyConfirmedRetention(['a', '!unreadable!b', 'c', 'd'], 3)).toEqual({
      generationIds: ['a', '!unreadable!b', 'c', 'd'],
      toDelete: [],
    });
    expect(applyConfirmedRetention(['a', '!unreadable!b', 'c', 'd', 'e'], 3)).toEqual({
      generationIds: ['!unreadable!b', 'c', 'd', 'e'],
      toDelete: ['a'],
    });
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
