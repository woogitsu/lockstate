import type { Page } from './network-changed-fixture';
import { kitchenFridgeMaterialPixels } from './kitchen-modern-material-observer';

/** Real screenshot PNG only; original independent freezer/louvre rectangles
 * and floors remain unchanged. Modern gradient provenance is in the observer.
 */
export async function fridgePalettePixels(_page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return kitchenFridgeMaterialPixels(png,quarterTurns);
}
