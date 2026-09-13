import type { PointerGestureEnd } from '../../src/input/pointer-gesture';
import { createResizeSeparator, type SeparatorResizeReason } from '../../src/ui/primitives/resize-separator';
import type { HandleRect, LockstateSeparatorHarness, SeparatorAria, SeparatorReport } from './resize-separator-harness-api';

/**
 * A real `createResizeSeparator`, mounted **over a real `WorldScene`**.
 *
 * ## Why the world is here at all
 *
 * The claim stage 3 has to settle is not "the handle resizes a panel" -- a node
 * test settles that, and `tests/unit/resize-separator.test.ts` does. It is
 * constitution article 17: *a resize drag must not pan the camera or place a
 * building*. That is a statement about two things at once, and the only place
 * both exist is a page carrying the separator and the engine together.
 *
 * `resize-separator-harness.html` therefore loads `world-scene-harness.ts`
 * first, unchanged -- the same real `WorldScene`, the same tool doubles, the
 * same `placedRuns()` / `placedAreas()` / `placedObjects()` readback -- and this
 * file puts a panel and its separator on top of the canvas it made. Nothing in
 * `src/` is modified to make that work, and nothing about the scene is stubbed:
 * if a press leaks past the handle with the build tool armed, the engine places
 * a wall, and the spec sees it.
 *
 * ## Why the mechanism can leak at all, which is the thing worth stating
 *
 * Phaser 4 listens for `mousemove` / `mouseup` **on the game canvas**
 * (`node_modules/phaser/src/input/mouse/MouseManager.js`, `startListeners`) --
 * measured from the other direction by
 * `tests/browser/world-scene-drag-under-the-hud.spec.ts`, where a wall drag
 * crossing a HUD island stops being delivered and the run commits short. The
 * canvas fills the window and the handle sits on top of it, so every pixel of
 * this handle is also a pixel of the map. The separator's three defences --
 * `setPointerCapture`, `preventDefault` + `stopPropagation`, and the
 * document-level listeners a live drag installs -- are what stand between a
 * resize and a wall, and they exist only in the DOM layer, which is exactly the
 * layer no node test can reach.
 *
 * ## The panel follows the reported size, on purpose
 *
 * The control is controlled: it reports, and this owner writes the width back.
 * So `panelWidth()` is a measurement of the laid-out DOM rather than of the
 * control's own bookkeeping, and a spec can assert the two agree -- which is
 * what catches a report that never reached an owner.
 */

const PANEL_ID = 'separator-harness-panel';

/** The left rail's real limits from `docs/IDENTITY_V5_ROLLOUT.md`, used as data. */
const RANGE = { min: 72, max: 180 } as const;
const INITIAL_SIZE = 120;
const DEFAULT_SIZE = 140;
const HANDLE_WIDTH = 16;

const reports: SeparatorReport[] = [];
const gestureEnds: PointerGestureEnd[] = [];
const underlayEvents: string[] = [];
let collapses = 0;
/** Recorded straight off the real press, because Chromium's mouse is not pointer 0. */
let lastPointerId: number | undefined;

const panel = document.createElement('div');
panel.id = PANEL_ID;
panel.style.position = 'fixed';
panel.style.left = '0';
panel.style.top = '0';
panel.style.bottom = '0';
panel.style.width = `${INITIAL_SIZE}px`;
panel.style.zIndex = '2';
panel.style.background = '#182029';

const separator = createResizeSeparator({
  label: 'Resize the navigation rail',
  controls: PANEL_ID,
  axis: 'x',
  growth: 1,
  size: INITIAL_SIZE,
  range: RANGE,
  defaultSize: DEFAULT_SIZE,
  onResize: (size: number, reason: SeparatorResizeReason) => {
    reports.push({ size, reason });
    layOut(size);
  },
  onCollapse: () => {
    collapses += 1;
  },
  onGestureEnd: (end: PointerGestureEnd) => {
    gestureEnds.push(end);
  },
});

const handle = separator.element;
handle.style.position = 'fixed';
handle.style.top = '0';
handle.style.bottom = '0';
handle.style.width = `${HANDLE_WIDTH}px`;
handle.style.zIndex = '3';
handle.style.background = '#3f8fa8';

function layOut(size: number): void {
  panel.style.width = `${size}px`;
  // Centred on the panel's edge, exactly as a real splitter sits: half of the
  // handle overhangs the map, which is the half a leaked press would land on.
  handle.style.left = `${size - HANDLE_WIDTH / 2}px`;
}

layOut(INITIAL_SIZE);
// Registered before the separator's own listener would matter and never
// interfering with it: this only reads the id off the event on its way past.
handle.addEventListener(
  'pointerdown',
  (event: PointerEvent) => {
    lastPointerId = event.pointerId;
  },
  true,
);
document.body.append(panel, handle);

/**
 * The tripwire on the canvas itself.
 *
 * Blunter than `placedRuns()` and one layer earlier: it fires on any pointer or
 * mouse event that reaches the canvas at all, whether or not the engine
 * happened to do anything with it. Both are asserted, because they fail
 * differently -- a leak the engine ignores today is a leak that places a wall
 * the day a tool is armed differently.
 */
function watchUnderlay(): void {
  const canvas = document.querySelector('#world-scene-harness-root canvas');
  if (canvas === null) {
    requestAnimationFrame(watchUnderlay);
    return;
  }
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup']) {
    canvas.addEventListener(type, () => {
      underlayEvents.push(type);
    });
  }
}
watchUnderlay();

const harness: LockstateSeparatorHarness = {
  panelWidth: () => panel.getBoundingClientRect().width,
  size: () => separator.size(),
  isDragging: () => separator.isDragging(),
  reports: () => [...reports],
  gestureEnds: () => [...gestureEnds],
  collapses: () => collapses,
  clear: () => {
    reports.length = 0;
    gestureEnds.length = 0;
    underlayEvents.length = 0;
    collapses = 0;
  },
  handleRect: (): HandleRect => {
    const rect = handle.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  },
  aria: (): SeparatorAria => ({
    role: handle.getAttribute('role'),
    orientation: handle.getAttribute('aria-orientation'),
    label: handle.getAttribute('aria-label'),
    controls: handle.getAttribute('aria-controls'),
    valueNow: handle.getAttribute('aria-valuenow'),
    valueMin: handle.getAttribute('aria-valuemin'),
    valueMax: handle.getAttribute('aria-valuemax'),
    tabIndex: handle.tabIndex,
    busy: handle.getAttribute('aria-busy'),
  }),
  focusHandle: () => {
    handle.focus();
  },
  handleHasFocus: () => document.activeElement === handle,
  lastPointerId: () => lastPointerId,
  underlayEvents: () => [...underlayEvents],
};

window.lockstateSeparatorHarness = harness;
