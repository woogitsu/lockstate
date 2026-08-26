import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveScheduler } from '../../src/persistence/local/autosave';
import type { SaveEnvelope } from '../../src/persistence/save-schema';
import type { SaveResult } from '../../src/persistence/local/repository';

const FAKE_ENVELOPE = {} as SaveEnvelope;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutosaveScheduler', () => {
  it('saves once, intervalMs after the first dirty marker', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, generationId: 'gen-1' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('prison-1', FAKE_ENVELOPE);
  });

  it('coalesces repeated dirty markers before the timer fires into a single save', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, generationId: 'gen-1' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(400);
    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(400);
    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(600); // 1000ms since the first marker, but only 600 since the last

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never overlaps writes: a dirty marker during an in-flight save schedules exactly one more save afterward', async () => {
    const save = vi.fn();
    const first = deferred<SaveResult>();
    const second = deferred<SaveResult>();
    save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1); // first save now in-flight

    scheduler.markDirty('prison-1'); // dirtied again mid-write
    await vi.advanceTimersByTimeAsync(5000); // no new save fires while the first is still in-flight
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve({ ok: true, generationId: 'gen-1' });
    await vi.advanceTimersByTimeAsync(0); // let the .then() continuation run and schedule the follow-up timer
    expect(save).toHaveBeenCalledTimes(1); // follow-up is scheduled, not immediate

    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);

    second.resolve({ ok: true, generationId: 'gen-2' });
  });

  it('reports results through onResult and settles back to idle after a save with no further dirty marks', async () => {
    const onResult = vi.fn();
    const save = vi.fn().mockResolvedValue({ ok: true, generationId: 'gen-1' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save, onResult });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(onResult).toHaveBeenCalledWith('prison-1', { ok: true, generationId: 'gen-1' });
    expect(scheduler.isPending('prison-1')).toBe(false);
  });

  it('does not call save when buildEnvelope reports nothing worth saving', async () => {
    const save = vi.fn();
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => undefined, save });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
    expect(scheduler.isPending('prison-1')).toBe(false);
  });

  it('tracks prisons independently', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, generationId: 'gen-1' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(500);
    scheduler.markDirty('prison-2');
    await vi.advanceTimersByTimeAsync(500);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('prison-1', FAKE_ENVELOPE);

    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith('prison-2', FAKE_ENVELOPE);
  });

  /**
   * One failure used to end autosave for the session.
   *
   * `runSave` claims the slot (`state = 'saving'`) and calls `performSave`
   * through `void`. `performSave` had no `try`, so a rejection -- and
   * `buildEnvelope` captures authoritative state across the worker boundary,
   * so it rejects whenever the worker has faulted, hung or gone away -- left
   * the entry parked in `'saving'`: `settle` never ran, no follow-up timer was
   * ever scheduled, and `markDirty` could do nothing but set
   * `'saving-with-pending-dirty'` on a save that was already over. Every
   * later dirty marker was silently dropped and the only evidence anywhere
   * was an unhandled rejection.
   *
   * Two properties, and the second is the one that makes the first
   * defensible: the scheduler survives, *and* the failure is reported through
   * the same `onResult` a successful write uses, which `SessionController`
   * forwards to the save panel.
   */
  it('reports a rejected capture as a failed save and keeps autosaving afterwards', async () => {
    const onResult = vi.fn();
    const buildEnvelope = vi
      .fn()
      .mockRejectedValueOnce(new Error('The simulation worker did not reply within 15000ms.'))
      .mockResolvedValue(FAKE_ENVELOPE);
    const save = vi.fn().mockResolvedValue({ ok: true, generationId: 'gen-1' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope, save, onResult });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('prison-1', {
      ok: false,
      error: { code: 'unknown-error', message: 'Autosave failed: The simulation worker did not reply within 15000ms.' },
    });
    // Settled rather than stuck mid-save: this is the state that decides
    // whether the next marker can ever fire.
    expect(scheduler.isPending('prison-1')).toBe(false);

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('prison-1', FAKE_ENVELOPE);
    expect(onResult).toHaveBeenLastCalledWith('prison-1', { ok: true, generationId: 'gen-1' });
  });

  it('reports a rejected write with its storage classification and still runs the follow-up the mid-save marker asked for', async () => {
    const onResult = vi.fn();
    // A quota failure that *throws* rather than being returned: `save()`
    // classifies the ones it catches itself, and this path answers the same
    // way instead of flattening every escape into `unknown-error`.
    const quota = new Error('');
    quota.name = 'QuotaExceededError';
    let rejectFirstWrite!: (error: unknown) => void;
    const firstWrite = new Promise<SaveResult>((_resolve, reject) => {
      rejectFirstWrite = reject;
    });
    const save = vi
      .fn()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValue({ ok: true, generationId: 'gen-2' } satisfies SaveResult);
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save, onResult });

    scheduler.markDirty('prison-1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1); // in flight, and about to fail

    scheduler.markDirty('prison-1'); // dirtied while the failing write is still in flight
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // never two concurrent writes for one prison

    rejectFirstWrite(quota);
    await vi.advanceTimersByTimeAsync(0); // the failure settles and schedules the follow-up
    expect(save).toHaveBeenCalledTimes(1); // scheduled, not immediate
    await vi.advanceTimersByTimeAsync(1000);

    expect(onResult.mock.calls).toEqual([
      ['prison-1', { ok: false, error: { code: 'quota-exceeded', message: 'Autosave failed: QuotaExceededError' } }],
      ['prison-1', { ok: true, generationId: 'gen-2' }],
    ]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('dispose cancels pending timers without invoking save', async () => {
    const save = vi.fn();
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(2000);

    expect(save).not.toHaveBeenCalled();
  });
});
