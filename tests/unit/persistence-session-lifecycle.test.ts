import { describe, expect, it, vi } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { LifecycleSaveHandler, type LifecycleSaveTrigger } from '../../src/persistence/session/lifecycle';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';

/** Minimal EventTarget stand-in so this runs in the default `node` Vitest environment (no DOM), per docs/TESTING.md. */
class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const existing = this.listeners.get(type) ?? new Set();
    existing.add(listener);
    this.listeners.set(type, existing);
  }

  public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener);
  }

  public dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === 'function') listener(new Event(type));
      else listener.handleEvent(new Event(type));
    }
  }

  public listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

async function buildHarness(visibility: { value: DocumentVisibilityState }) {
  const store = new MemoryLocalSaveStore();
  const controller = new SessionController(new PrisonSaveRepository(store), new InProcessSessionHost(), { gameVersion: 'test-version' });
  const target = new FakeEventTarget();
  const attempts: LifecycleSaveTrigger[] = [];
  const handler = new LifecycleSaveHandler(controller, {
    target,
    visibilityState: () => visibility.value,
    onAttempt: (trigger) => attempts.push(trigger),
  });
  handler.attach();
  return { store, controller, target, attempts, handler };
}

describe('LifecycleSaveHandler: best-effort, never load-bearing', () => {
  it('saves when the tab becomes hidden', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, target, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');
    const revisionBefore = controller.getActiveSession()!.revision;

    visibility.value = 'hidden';
    target.dispatch('visibilitychange');
    await vi.waitFor(() => expect(controller.getActiveSession()!.revision).toBe(revisionBefore + 1));

    expect(attempts).toEqual(['visibility-hidden']);
  });

  it('ignores a visibilitychange that leaves the tab visible', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, target, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    target.dispatch('visibilitychange');
    expect(attempts).toEqual([]);
  });

  it('saves on pagehide', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, target, attempts } = await buildHarness(visibility);
    await controller.createPrison('prison-1');
    const revisionBefore = controller.getActiveSession()!.revision;

    target.dispatch('pagehide');
    await vi.waitFor(() => expect(controller.getActiveSession()!.revision).toBe(revisionBefore + 1));

    expect(attempts).toEqual(['pagehide']);
  });

  it('never listens to `unload` -- it blocks bfcache and does not fire on mobile', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { target } = await buildHarness(visibility);
    expect(target.listenerCount('unload')).toBe(0);
    expect(target.listenerCount('beforeunload')).toBe(0);
    expect(target.listenerCount('visibilitychange')).toBe(1);
    expect(target.listenerCount('pagehide')).toBe(1);
  });

  it('does nothing when there is no active session', async () => {
    const visibility = { value: 'hidden' as DocumentVisibilityState };
    const { target, attempts } = await buildHarness(visibility);

    target.dispatch('visibilitychange');
    target.dispatch('pagehide');
    expect(attempts).toEqual([]);
  });

  /**
   * The whole point of the "best-effort" contract: a lifecycle save that
   * fails must not throw into the page's event handler, and correctness
   * must not depend on it having succeeded.
   */
  it('swallows a failing lifecycle save instead of throwing out of the event handler', async () => {
    const visibility = { value: 'visible' as DocumentVisibilityState };
    const { controller, store, target } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    const quotaError = new Error('quota');
    quotaError.name = 'QuotaExceededError';
    store.failNextWrite = quotaError;

    visibility.value = 'hidden';
    expect(() => target.dispatch('visibilitychange')).not.toThrow();

    // The failure is still recorded for the UI to surface later.
    await vi.waitFor(() => expect(controller.getLastSaveResult()?.ok).toBe(false));
  });

  it('detach removes every listener', async () => {
    const visibility = { value: 'hidden' as DocumentVisibilityState };
    const { controller, target, attempts, handler } = await buildHarness(visibility);
    await controller.createPrison('prison-1');

    handler.detach();
    expect(target.listenerCount('visibilitychange')).toBe(0);
    expect(target.listenerCount('pagehide')).toBe(0);

    target.dispatch('visibilitychange');
    target.dispatch('pagehide');
    expect(attempts).toEqual([]);
  });
});
