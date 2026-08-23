import type { SessionController } from './session-controller';

export interface LifecycleSaveOptions {
  /** Defaults to the global `document`/`window` pair; injectable so this is testable without a DOM environment. */
  readonly target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  readonly visibilityState?: () => DocumentVisibilityState;
  readonly onAttempt?: (trigger: LifecycleSaveTrigger) => void;
}

export type LifecycleSaveTrigger = 'visibility-hidden' | 'pagehide';

/**
 * Best-effort saves on browser lifecycle transitions.
 *
 * Issue #19 is explicit that "browser lifecycle events are unreliable, so
 * autosave/recovery must be designed explicitly rather than relying on a
 * single unload write," and lists "treating unload/pagehide as guaranteed"
 * as out of scope. This module is therefore deliberately a *supplement* to
 * the interval autosave, never a replacement for it:
 *
 * - It listens to `visibilitychange` (fired reliably when a tab is
 *   backgrounded, including on mobile app-switching) and `pagehide`, not
 *   `unload` -- `unload` is not fired at all on modern mobile browsers and
 *   blocks bfcache where it is.
 * - It fires a save *attempt* and does not await it. A lifecycle handler
 *   cannot hold the page open for an async IndexedDB transaction, so the
 *   write may simply not complete. That is expected and safe: the previous
 *   generation is still intact (see `PrisonSaveRepository.save`), and the
 *   recovery path on next boot handles a half-written current pointer.
 * - Correctness therefore never depends on these events firing. They only
 *   narrow the window of lost play between interval autosaves.
 */
export class LifecycleSaveHandler {
  private detachers: (() => void)[] = [];

  public constructor(
    private readonly controller: SessionController,
    private readonly options: LifecycleSaveOptions = {},
  ) {}

  public attach(): void {
    const target = this.options.target ?? (typeof document === 'undefined' ? undefined : document);
    if (target === undefined) return;

    const visibilityState = this.options.visibilityState ?? (() => (typeof document === 'undefined' ? 'visible' : document.visibilityState));

    const onVisibilityChange = (): void => {
      if (visibilityState() !== 'hidden') return;
      this.attempt('visibility-hidden');
    };
    const onPageHide = (): void => {
      this.attempt('pagehide');
    };

    target.addEventListener('visibilitychange', onVisibilityChange);
    target.addEventListener('pagehide', onPageHide);
    this.detachers.push(
      () => target.removeEventListener('visibilitychange', onVisibilityChange),
      () => target.removeEventListener('pagehide', onPageHide),
    );
  }

  /** Fire-and-forget by design -- see the class docs on why this must not be awaited. */
  private attempt(trigger: LifecycleSaveTrigger): void {
    if (this.controller.getActiveSession() === undefined) return;
    this.options.onAttempt?.(trigger);
    void this.controller.saveNow().catch(() => {
      // Swallowed intentionally: a lifecycle save is best-effort, and the
      // page is going away. The failure is already recorded on the
      // controller's `getLastSaveResult()` for the next session to surface.
    });
  }

  public detach(): void {
    for (const detach of this.detachers) detach();
    this.detachers = [];
  }
}
