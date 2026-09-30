/** Preserve the box a pointer, focus or touch may still be aimed at (ADR 0124). */
export function pinPooledRowHeight(row: HTMLElement): void {
  if (row.hidden) return;
  // min-height consumes layout CSS pixels. getBoundingClientRect() includes
  // browser/CSS zoom, so assigning that measurement back to min-height would
  // multiply a held-open row on every publication (88 -> 176 -> 352 at 200%).
  const height = row.offsetHeight;
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
  const list = rows[0]?.parentElement;
  const reserveSlots = (): void => {
    if (!list) return;
    const visible = rows.filter((row) => !row.hidden);
    if (visible.length === 0) {
      list.style.removeProperty('min-height');
      return;
    }
    const rowHeight = Math.max(...visible.map((row) => row.offsetHeight));
    const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
    const capacity = rows.length * rowHeight + Math.max(0, rows.length - 1) * gap;
    const maxHeight = Number.parseFloat(getComputedStyle(list).maxHeight);
    const capped = Number.isFinite(maxHeight) ? Math.min(capacity, maxHeight) : capacity;
    const previous = Number.parseFloat(list.style.minHeight) || 0;
    if (capped > previous) list.style.minHeight = `${capped}px`;
  };
  if (list !== undefined && list !== null && !list.hidden) {
    const height = list.offsetHeight;
    const previous = Number.parseFloat(list.style.minHeight) || 0;
    if (height > previous) list.style.minHeight = `${height}px`;
  }
  const anchor = rows.find((row) => !row.hidden && row.getBoundingClientRect().height > 0);
  if (anchor === undefined) return reserveSlots;
  const top = anchor.getBoundingClientRect().top;
  return () => {
    reserveSlots();
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
