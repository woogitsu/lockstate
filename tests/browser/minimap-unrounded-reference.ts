export interface MinimapViewportPercent { left: number; top: number; width: number; height: number }

/** Test-only observation of existing HUD writes before native CSSOM rounding. */
export function observeUnroundedMinimapViewport(): void {
  const fields = ['left', 'top', 'width', 'height'] as const;
  const records = new WeakMap<CSSStyleDeclaration, Partial<MinimapViewportPercent>>();
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, field);
    if (descriptor?.set === undefined || descriptor.get === undefined || !descriptor.configurable) throw new Error(`Missing native CSSOM accessor: ${field}`);
    const setter = descriptor.set;
    Object.defineProperty(CSSStyleDeclaration.prototype, field, {
      ...descriptor,
      set(this: CSSStyleDeclaration, value: string) {
        // The original setter receives the original string and runs exactly once.
        setter.call(this, value);
        const record = records.get(this) ?? {};
        if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%$/iu.test(value)) record[field] = parseFloat(value);
        else delete record[field];
        records.set(this, record);
      },
    });
  }
  Reflect.set(window, 'unroundedMinimapViewport', (): MinimapViewportPercent => {
    const viewport = document.querySelector<HTMLElement>('.hud-minimap__viewport');
    const record = viewport === null ? undefined : records.get(viewport.style);
    if (record === undefined || fields.some(field => !Number.isFinite(record[field]))) throw new Error('No complete existing minimap viewport assignment observed');
    return { left: record.left!, top: record.top!, width: record.width!, height: record.height! };
  });
}

export interface ReferenceCanvas { width: number; height: number; left: number; top: number; widthCss: number; heightCss: number }
/** Independent ground-bounds channel; never reads the ghost or main projector. */
export function minimapGroundReference(canvas: ReferenceCanvas, map: { width: number; height: number }, percent: MinimapViewportPercent) {
  const zoomX = canvas.width / (percent.width / 100 * map.width * 64);
  const zoomY = canvas.height / (percent.height / 100 * map.height * 64);
  const visible = { left: percent.left / 100 * map.width * 64, top: percent.top / 100 * map.height * 64 };
  return { zoomX, zoomY, screen: (x: number, y: number) => ({
    x: canvas.left + (x * 64 - visible.left) * zoomX * canvas.widthCss / canvas.width,
    y: canvas.top + (y * 64 - visible.top) * zoomY * canvas.heightCss / canvas.height,
  }) };
}
