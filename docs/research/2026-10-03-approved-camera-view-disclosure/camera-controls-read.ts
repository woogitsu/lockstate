import type { Locator, Page } from '@playwright/test';

/** Public rendered DOM only; no scene, adapter, CSS rewrite or supplied bounds. */
export async function readCameraLayout(page: Page) {
  return page.evaluate(() => {
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const one = (selector: string) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (node === null) throw new Error(`Public layout node absent: ${selector}`);
      return { ...box(node), hidden: node.hidden, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight,
        text: node.innerText, display: getComputedStyle(node).display };
    };
    const controls = [...document.querySelectorAll<HTMLElement>(
      '.hud-camera-panel select, .hud-camera-panel button, .hud-zoom button')]
      .filter(node => node.getClientRects().length > 0).map(node => {
        const r = box(node), x = Math.floor(r.left + r.width / 2), y = Math.floor(r.top + r.height / 2);
        const hit = document.elementFromPoint(x, y);
        return { ...r, x, y, name: node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.innerText,
          tap: parseFloat(getComputedStyle(node).getPropertyValue('--tap-target')),
          reachable: hit === node || (hit !== null && node.contains(hit)) };
      });
    return { viewport: { width: innerWidth, height: innerHeight, zoom: visualViewport!.scale,
      uiScale: Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) },
      presentation: document.querySelector<HTMLElement>('.hud-camera-panel')!.dataset['presentation'],
      panel: one('.hud-camera-panel'), strip: one('.hud-strip'), tabs: one('.hud__tabs'), rail: one('.hud__rail'),
      corner: one('.hud__corner'), band: one('.hud__refusal'), alertList: one('.hud-alerts__list'),
      alertRows: [...document.querySelectorAll<HTMLElement>('.hud-alerts__list [data-alert]:not([data-alert="empty"])')]
        .filter(node => node.getClientRects().length > 0).map(node => ({ ...box(node), text: node.innerText })), controls };
  });
}

/** A physical press, with its target established immediately before input. */
export async function pressCameraControl(page: Page, target: Locator) {
  const hit = await target.evaluate(node => {
    const r = node.getBoundingClientRect(), x = Math.floor(r.left + r.width / 2), y = Math.floor(r.top + r.height / 2);
    const actual = document.elementFromPoint(x, y);
    if (!(actual === node || (actual !== null && node.contains(actual)))) throw new Error('Camera target is covered');
    const floor = 44 * Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    if (r.width < floor || r.height < floor || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
      throw new Error('Camera target does not retain the actual public-scale 44/88px floor and viewport containment');
    return { x, y };
  });
  await page.mouse.click(hit.x, hit.y);
  return hit;
}
