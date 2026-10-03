import type { Page } from '@playwright/test';

export interface MinimapCameraObservation {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Observe the independently published camera outline, including a collapsed
 * minimap. Its CSS values establish movement, not an exact ground reference. */
export function parseMinimapCameraObservation(values: readonly string[]): MinimapCameraObservation {
  if (values.length !== 4 || values.some(value => !/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%$/i.test(value.trim()))) {
    throw new Error('The minimap has not published four finite camera percentages');
  }
  const parsed = values.map(value => Number(value.trim().slice(0, -1)));
  if (parsed.some(value => !Number.isFinite(value))) throw new Error('Invalid minimap camera percentages');
  return { left: parsed[0]!, top: parsed[1]!, width: parsed[2]!, height: parsed[3]! };
}

export async function readMinimapCameraObservation(page: Page): Promise<MinimapCameraObservation> {
  const values = await page.locator('.hud-minimap__viewport').evaluate(node => {
    const style = (node as HTMLElement).style;
    return [style.left, style.top, style.width, style.height];
  });
  return parseMinimapCameraObservation(values);
}
