import type { SessionController } from './session-controller';

/** Anything that can carry a lifecycle listener. Narrowed to the two methods this module uses so a test double stays trivial. */
export type LifecycleEventTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * The two objects the two lifecycle events are dispatched at.
 *
 * The DOM dispatches them at different objects: `visibilitychange` at
 * `document`, `pagehide` at `Window`. `document` alone therefore cannot
 * receive both -- a window event does not propagate down to the document,
 * which is why registering `pagehide` on `document` never fired (issue #92).
 *
 * `window` alone *would* receive both, because `visibilitychange` is
 * dispatched at `document` with `bubbles: true` and so reaches `window` on
 * the way up; that was checked in a real browser, not assumed. The pair is
 * kept anyway, for explicitness rather than necessity: each listener sits on
 * the object its own event is specified to be dispatched at, so neither
 * registration depends on the event path, and "these two events are not
 * interchangeable" is stated in the type rather than in a comment. Requiring
 * both halves keeps a caller from injecting one fake target and inheriting a
 * real global for the other.
 */
export interface LifecycleSaveTargets {
  /** Receives `visibilitychange`. In a browser this is `document`. */
  readonly visibility: LifecycleEventTarget;
  /** Receives `pagehide`. In a browser this is `window`. */
  readonly pageTransition: LifecycleEventTarget;
}

export interface LifecycleSaveOptions {
  /** One target per event -- see `LifecycleSaveTargets` for why each event gets its own. Defaults to the globals `document` and `window`; injectable so this is testable without a DOM environment. */
  readonly targets?: LifecycleSaveTargets;
  readonly visibilityState?: () => DocumentVisibilityState;
  readonly onAttempt?: (trigger: LifecycleSaveTrigger) => void;
}

export type LifecycleSaveTrigger = 'visibility-hidden' | 'pagehide';

/** The production wiring: `visibilitychange` from `document`, `pagehide` from `window`. `undefined` outside a DOM. */
function globalTargets(): LifecycleSaveTargets | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
  return { visibility: document, pageTransition: window };
}

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
 *   blocks bfcache where it is. The two come from *different* targets
 *   (`document` and `window` respectively); see `LifecycleSaveTargets`.
 *   `pagehide` is the one specified to cover navigating away, closing the
 *   tab and entering the bfcache while the page is still visible, and it is
 *   the earlier notice, so registering it where it never fired (issue #92)
 *   cost that notice. It did not necessarily cost the save: on the one
 *   transition observed here in a real browser -- a same-tab navigation --
 *   Chromium also fired `visibilitychange` -> hidden, and that listener was
 *   on the right object throughout. See `docs/PERSISTENCE.md`.
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
    const targets = this.options.targets ?? globalTargets();
    if (targets === undefined) return;

    const visibilityState = this.options.visibilityState ?? (() => (typeof document === 'undefined' ? 'visible' : document.visibilityState));

    const onVisibilityChange = (): void => {
      if (visibilityState() !== 'hidden') return;
      this.attempt('visibility-hidden');
    };
    const onPageHide = (): void => {
      this.attempt('pagehide');
    };

    targets.visibility.addEventListener('visibilitychange', onVisibilityChange);
    targets.pageTransition.addEventListener('pagehide', onPageHide);
    this.detachers.push(
      () => targets.visibility.removeEventListener('visibilitychange', onVisibilityChange),
      () => targets.pageTransition.removeEventListener('pagehide', onPageHide),
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
