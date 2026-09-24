/** Preserve the box a pointer, focus or touch may still be aimed at (ADR 0124). */
export function pinPooledRowHeight(row: HTMLElement): void {
  if (row.hidden) return;
  const height = row.getBoundingClientRect().height;
  if (height <= 0) return;
  const previous = Number.parseFloat(row.style.minHeight) || 0;
  if (height > previous) row.style.minHeight = `${height}px`;
}

/** Only a truly empty slot may forget the height it promised while visible. */
export function releasePooledRowHeight(row: HTMLElement): void {
  row.style.removeProperty('min-height');
}

/**
 * A short inspector is itself scrollable. Growing a list above an existing
 * slot then moves that slot down even though the bottom-aligned slot order is
 * correct. Keep the previously visible place under the same screen pixel.
 */
export function capturePooledRowAnchor(rows: readonly HTMLElement[]): () => void {
  const anchor = rows.find((row) => !row.hidden && row.getBoundingClientRect().height > 0);
  if (anchor === undefined) return () => {};
  const top = anchor.getBoundingClientRect().top;
  return () => {
    if (anchor.hidden) return;
    const displacement = anchor.getBoundingClientRect().top - top;
    if (Math.abs(displacement) < 0.5) return;
    for (let ancestor = anchor.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const overflow = getComputedStyle(ancestor).overflowY;
      if (!['auto', 'scroll'].includes(overflow) || ancestor.scrollHeight <= ancestor.clientHeight) continue;
      ancestor.scrollTop += displacement;
      return;
    }
  };
}
