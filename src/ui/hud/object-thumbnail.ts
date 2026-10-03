/** Pixel-only presentation bounds; transparent authored export margins carry no object information. */
export function objectThumbnailBounds(rgba: ArrayLike<number>, width: number, height: number): { x: number; y: number; width: number; height: number } | undefined {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if ((rgba[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? undefined : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Trim once after decoding, then keep the authored object aspect ratio inside existing row geometry. */
export function trimObjectThumbnail(image: HTMLImageElement): boolean {
  const source = document.createElement('canvas');
  source.width = image.naturalWidth; source.height = image.naturalHeight;
  const context = source.getContext('2d');
  if (context === null || source.width === 0 || source.height === 0) return false;
  try {
    context.drawImage(image, 0, 0);
    const bounds = objectThumbnailBounds(context.getImageData(0, 0, source.width, source.height).data, source.width, source.height);
    if (bounds === undefined) return false;
    const cropped = document.createElement('canvas'); cropped.width = bounds.width; cropped.height = bounds.height;
    const output = cropped.getContext('2d'); if (output === null) return false;
    output.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
    image.src = cropped.toDataURL('image/png');
    return true;
  } catch { return false; }
}
