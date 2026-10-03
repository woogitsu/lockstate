export interface MinimapViewportPercent { left: number; top: number; width: number; height: number }

/** Test-only observation of existing HUD writes before native CSSOM rounding. */
export function observeUnroundedMinimapViewport(): void {
  const fields = ['left', 'top', 'width', 'height'] as const;
  const records = new WeakMap<CSSStyleDeclaration, Partial<MinimapViewportPercent>>();
  const proxies = new WeakMap<CSSStyleDeclaration, CSSStyleDeclaration>();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
  if (descriptor?.get === undefined || !descriptor.configurable) throw new Error('Missing native HTMLElement style getter');
  const getter = descriptor.get;
  Object.defineProperty(HTMLElement.prototype, 'style', {
    ...descriptor,
    get(this: HTMLElement) {
      const style = getter.call(this) as CSSStyleDeclaration;
      if (!this.classList.contains('hud-minimap__viewport')) return style;
      let proxy = proxies.get(style);
      if (proxy === undefined) {
        const methods = new Map<PropertyKey, { original: Function; bound: Function }>();
        proxy = new Proxy(style, {
          get(target, key) {
            const value = Reflect.get(target, key, target);
            if (typeof value !== 'function') return value;
            const cached = methods.get(key);
            if (cached !== undefined && cached.original === value) return cached.bound;
            const bound = value.bind(target); methods.set(key, { original: value, bound }); return bound;
          },
          set(target, key, value) {
            // Existing native exotic-property assignment, unchanged value and
            // original receiver. Only this existing HUD element is observed.
            const written = Reflect.set(target, key, value, target);
            if (written && fields.includes(key as typeof fields[number])) {
              const field = key as typeof fields[number];
              const record = records.get(target) ?? {};
              if (typeof value === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%$/iu.test(value)) record[field] = parseFloat(value);
              else delete record[field];
              records.set(target, record);
            }
            return written;
          },
        });
        proxies.set(style, proxy);
      }
      return proxy;
    },
  });
  Reflect.set(window, 'unroundedMinimapViewport', (): MinimapViewportPercent => {
    const viewport = document.querySelector<HTMLElement>('.hud-minimap__viewport');
    const record = viewport === null ? undefined : records.get(getter.call(viewport) as CSSStyleDeclaration);
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
