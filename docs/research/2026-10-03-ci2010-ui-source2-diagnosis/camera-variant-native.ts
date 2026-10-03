import { expect, type Page } from '@playwright/test';
import { readMinimapGeometry } from './minimap-geometry-probe';

export type CameraReviewVariant = 'disclosure' | 'toolbox';

/**
 * Owner-review candidates only. Reparents actual public controls with their
 * original listeners intact. This is a transient page DOM experiment, not a
 * production repair, native acceptance or a replacement for existing tests.
 * Each variant starts on a fresh public page; reload discards the experiment.
 */
export function installCameraReviewVariant(options: {
  variant: CameraReviewVariant; visibleViewLabel: string; controlsLabel: string;
}) {
  if (document.querySelector('[data-camera-review]')) throw new Error('Review variant already installed');
  const corner = document.querySelector<HTMLElement>('.hud__corner');
  const zoom = document.querySelector<HTMLElement>('.hud-zoom');
  const select = document.querySelector<HTMLSelectElement>('.hud__corner > select.hud-build__category');
  const pan = document.querySelector<HTMLElement>('.hud-camera-pan');
  const pose = document.querySelector<HTMLElement>('.hud-camera-pose');
  const hud = document.querySelector<HTMLElement>('.hud');
  if (!corner || !zoom || !select || !pan || !pose || !hud) throw new Error('Public camera controls missing');

  const panel = document.createElement('section');
  panel.className = 'camera-review-toolbox';
  panel.dataset['cameraReview'] = options.variant;
  panel.id = 'camera-review-toolbox';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', options.controlsLabel);
  // Reuse the real select and eight real buttons, never clones/command feeds.
  panel.append(select, pan, pose);
  hud.append(panel);
  let trigger: HTMLButtonElement | undefined;
  if (options.variant === 'disclosure') {
    trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ui-icon-button ui-icon-button--bordered camera-review-trigger';
    trigger.textContent = options.visibleViewLabel;
    trigger.setAttribute('aria-label', options.controlsLabel);
    trigger.setAttribute('aria-controls', panel.id);
    trigger.setAttribute('aria-expanded', 'false');
    zoom.append(trigger);
    panel.hidden = true;
    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      trigger?.setAttribute('aria-expanded', String(!panel.hidden));
      position();
      if (!panel.hidden) select.focus({ preventScroll: true });
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      panel.hidden = true;
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.focus({ preventScroll: true });
    });
  }
  // The built page deliberately rejects inline style tags via CSP. Use the
  // browser's CSSOM for this authorized transient DOM review; keep CSP intact.
  const style = new CSSStyleSheet();
  style.replaceSync(`
    .camera-review-toolbox {
      position: fixed; z-index: 4; display: flex; flex-wrap: wrap;
      align-content: flex-start; align-items: flex-start; gap: var(--space-2);
      box-sizing: border-box; padding: var(--space-2);
      border: var(--hairline) solid var(--border); border-radius: var(--radius-md);
      background: var(--surface-raised); color: var(--text-body); pointer-events: auto;
    }
    .camera-review-toolbox[hidden] { display: none; }
    .camera-review-toolbox > select { max-width: 100%; flex: 0 0 auto; }
    .camera-review-toolbox > .hud-camera-pan,
    .camera-review-toolbox > .hud-camera-pose {
      flex: 0 0 auto; flex-wrap: wrap; max-width: 100%;
    }
    .camera-review-trigger { font: inherit; padding-inline: var(--space-1); flex: none; pointer-events: auto; }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, style];
  function position() {
    const tabs = document.querySelector('.hud__tabs')?.getBoundingClientRect();
    const strip = document.querySelector('.hud-strip')?.getBoundingClientRect();
    const rail = document.querySelector('.hud__rail')?.getBoundingClientRect();
    const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    if (!tabs || !strip || !rail || !Number.isFinite(scale)) throw new Error('Public map bounds missing');
    const gap = 12 * scale;
    const left = tabs.right + gap;
    const width = Math.max(0, Math.min(396 * scale, rail.left - left - gap));
    panel.style.left = `${left}px`;
    panel.style.top = `${strip.bottom + gap}px`;
    panel.style.width = `${width}px`;
  }
  position();
  window.addEventListener('resize', position);
  // Interface scale changes these public boxes without resizing the window.
  // An always-open toolbox must follow the same bounds as opening disclosure.
  const boundsObserver = new ResizeObserver(position);
  for (const selector of ['.hud-strip', '.hud__tabs', '.hud__rail']) {
    const bounds = document.querySelector(selector);
    if (bounds) boundsObserver.observe(bounds);
  }
  return {
    variant: options.variant, controlsReused: true,
    panButtons: pan.querySelectorAll('button').length,
    poseButtons: pose.querySelectorAll('button').length,
    sourceMutation: false,
  };
}

/** Exact #1292 observer, including the owner-reserved original values. */
export async function assertOriginal1292(page: Page, height: 800 | 781 | 780) {
  const geometry = await page.evaluate(readMinimapGeometry);
  const budget = geometry.middleRowBudget;
  expect(budget.sections).toBe(6);
  expect(budget.placement).toBe('rail');
  expect(budget.columnHeight).toBeCloseTo(280.13, 1);
  expect(budget.cornerHeight).toBeCloseTo(398, 1);
  expect(budget.stripHeight).toBeCloseTo(80.69, 1);
  expect(budget.cornerLeft).toBeCloseTo(height === 780 ? 192 : 0, 1);
  expect(budget.clearance).toBeCloseTo(height === 800 ? 29.19 : height === 781 ? 10.19 : 9.19, 1);
  expect(budget.clearance!).toBeLessThan(budget.tallestTab!);
  if (height === 800) {
    expect(budget.rowHeight).toBeCloseTo(719.31, 1);
    expect(budget.cornerTop).toBeCloseTo(402, 1);
  }
  return geometry;
}

/** Real list geometry and hit ownership; unchanged rows may still be clipped. */
export async function assertCameraAndAlertFloors(page: Page, scale: 1 | 2, variant: CameraReviewVariant, mode: 'world' | 'oblique') {
  const observations = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>('.hud-alerts__list:not([hidden]) > .ui-row:not([hidden])')];
    const rowBoxes = rows.map(row => {
      const list = row.parentElement!;
      const rect = row.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {
        height: rect.height, listClientHeight: list.clientHeight, listHeight: list.getBoundingClientRect().height,
        owned: hit === row || (hit !== null && row.contains(hit)),
      };
    });
    const controls = [...document.querySelectorAll<HTMLElement>(
      '.hud-zoom button, .camera-review-toolbox:not([hidden]) select, .camera-review-toolbox:not([hidden]) button',
    )].filter(element => element.getBoundingClientRect().height > 0);
    return {
      rowBoxes,
      panTotal: document.querySelectorAll('.camera-review-toolbox [data-camera-pan-direction]').length,
      poseTotal: document.querySelectorAll('.camera-review-toolbox [data-camera-pose-axis]').length,
      controls: controls.map(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          classes: element.className, label: element.getAttribute('aria-label'), rect: rect.toJSON(),
          width: rect.width, height: rect.height,
          hit: hit ? { tag: hit.tagName, classes: hit.className } : null,
          owned: hit === element || (hit !== null && element.contains(hit)),
        };
      }),
    };
  });
  expect(observations.panTotal).toBe(4);
  expect(observations.poseTotal).toBe(4);
  expect(observations.controls.length).toBe((variant === 'disclosure' ? 8 : 7) + (mode === 'oblique' ? 4 : 0));
  expect(observations.rowBoxes.length).toBeGreaterThan(0);
  for (const row of observations.rowBoxes) {
    expect(row.height).toBeLessThanOrEqual(row.listClientHeight + 0.1);
    expect(row.listHeight).toBeGreaterThan(0);
    expect(row.owned).toBe(true);
  }
  for (const control of observations.controls) {
    expect(control.width).toBeGreaterThanOrEqual(44 * scale - 0.1);
    expect(control.height).toBeGreaterThanOrEqual(44 * scale - 0.1);
    expect(control.owned, JSON.stringify(control)).toBe(true);
  }
  return observations;
}
