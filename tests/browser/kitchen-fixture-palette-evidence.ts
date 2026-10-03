import type { Page } from './network-changed-fixture';

export async function fridgePalettePixels(page: Page, png: Buffer, quarterTurns: 0 | 1): Promise<number[]> {
  return page.evaluate(async ({ base64, quarterTurns }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    // Calibrated from opened actual worker-built/loaded FullHD images.
    // Disjoint freezer-panel and authored side-louvre regions. The q1 door
    // hides the lower front grille; its exposed side louvres remain visible.
    // q0 counts520/527, q1 1178/148 before and after actual Save/Load.
    const rects = quarterTurns === 0
      ? [[890, 495, 25, 35], [843, 606, 33, 27]]
      : [[780, 375, 35, 42], [843, 474, 17, 23]];
    const colour = quarterTurns === 0 ? [39, 67, 77] : [44, 77, 87];
    return rects.map((rect, regionIndex) => {
      const pixels = context.getImageData(...rect as [number, number, number, number]).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        // Thin louvres are shaded/antialiased: use the native steel colour
        // envelope, excluding the neutral enamel and brighter room substrate.
        const matches = regionIndex === 0
          ? r === colour[0] && g === colour[1] && b === colour[2]
          : r >= 65 && r <= 120 && g - r >= 3 && g - r <= 15 && b - g >= 0 && b - g <= 8;
        if (matches) count++;
      }
      return count;
    });
  }, { base64: png.toString('base64'), quarterTurns });
}

