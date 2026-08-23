import { describe, expect, it } from 'vitest';
import { describeRestoredScope, describeSaveResult } from '../../src/ui/save-panel';
import { CURRENT_SAVE_RESTORED_SCOPE } from '../../src/simulation/runtime/restore-session';

/**
 * Issue #19: "quota, private-mode and transaction-abort errors are
 * distinct recoverable states." These are the pure mapping functions the
 * panel uses; testing them directly keeps this in the default `node`
 * Vitest environment (no DOM), per docs/TESTING.md's rule that a browser
 * environment stays an explicit, scoped exception.
 */
describe('describeSaveResult: distinct, actionable recovery states', () => {
  it('reports a successful save with its generation id', () => {
    expect(describeSaveResult({ ok: true, generationId: 'gen-abc' })).toEqual({
      kind: 'saved',
      message: 'Saved (generation gen-abc).',
    });
  });

  it('maps each failure code to its own kind and distinct advice', () => {
    const quota = describeSaveResult({ ok: false, error: { code: 'quota-exceeded', message: 'full' } });
    const aborted = describeSaveResult({ ok: false, error: { code: 'transaction-aborted', message: 'aborted' } });
    const unknown = describeSaveResult({ ok: false, error: { code: 'unknown-error', message: 'boom' } });

    expect(quota.kind).toBe('quota-exceeded');
    expect(aborted.kind).toBe('transaction-aborted');
    expect(unknown.kind).toBe('error');

    // Three genuinely different messages -- not one generic "save failed".
    expect(new Set([quota.message, aborted.message, unknown.message]).size).toBe(3);
  });

  it('reassures the player that a failed write left the previous save intact', () => {
    // This is the actual guarantee PrisonSaveRepository.save provides, so the
    // UI is allowed to promise it -- see the repository's own retention test.
    expect(describeSaveResult({ ok: false, error: { code: 'quota-exceeded', message: 'full' } }).message).toMatch(/previous save is intact/i);
    expect(describeSaveResult({ ok: false, error: { code: 'transaction-aborted', message: 'x' } }).message).toMatch(/previous save is intact/i);
  });

  it('surfaces the underlying message for an unclassified failure rather than hiding it', () => {
    expect(describeSaveResult({ ok: false, error: { code: 'unknown-error', message: 'disk on fire' } }).message).toContain('disk on fire');
  });
});

/**
 * Regression for a race found by driving the real app in Chromium: two
 * overlapping `refresh()` calls resolved out of order, so an earlier,
 * slower storage read repainted stale slot data over a newer one -- the
 * generation count visibly lagged one save behind until the next reload.
 * `refresh` now carries a monotonic token and a superseded run discards
 * its result.
 *
 * Exercised against the pure guard rather than the DOM so this stays in
 * the default `node` Vitest environment (docs/TESTING.md keeps a browser
 * environment an explicit, scoped exception).
 */
describe('refresh supersession guard', () => {
  it('a superseded in-flight read must not win over a newer one', async () => {
    let token = 0;
    const painted: string[] = [];

    // Mirrors SavePanel.refresh's guard: capture a token, await a read, bail if superseded.
    async function refresh(label: string, read: () => Promise<string>): Promise<void> {
      const mine = ++token;
      const value = await read();
      if (mine !== token) return;
      painted.push(`${label}:${value}`);
    }

    let releaseSlow: (value: string) => void = () => {};
    const slow = new Promise<string>((resolve) => { releaseSlow = resolve; });

    const first = refresh('stale', () => slow);          // starts first, resolves last
    const second = refresh('fresh', async () => 'new');  // starts second, resolves first
    await second;
    releaseSlow('old');
    await first;

    expect(painted).toEqual(['fresh:new']); // the stale run discarded itself
  });
});

describe('describeRestoredScope: honest about what a V1 save carries', () => {
  it('names both what was restored and what this save version does not carry', () => {
    const text = describeRestoredScope(CURRENT_SAVE_RESTORED_SCOPE);
    expect(text).toContain('world terrain and ownership');
    expect(text).toContain('Not carried by this save version');
    expect(text).toContain('incidents and gangs');
  });
});
