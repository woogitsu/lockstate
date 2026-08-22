import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutosaveScheduler } from '../../src/persistence/local/autosave';
import type { SaveEnvelopeV1 } from '../../src/persistence/save-schema';
import type { SaveResult } from '../../src/persistence/local/repository';

const FAKE_ENVELOPE = {} as SaveEnvelopeV1;

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

  it('dispose cancels pending timers without invoking save', async () => {
    const save = vi.fn();
    const scheduler = new AutosaveScheduler({ intervalMs: 1000, buildEnvelope: () => FAKE_ENVELOPE, save });

    scheduler.markDirty('prison-1');
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(2000);

    expect(save).not.toHaveBeenCalled();
  });
});
