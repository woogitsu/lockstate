import { positionRoomTemplateLabel } from './room-template-label-position';
import type { TemplateSquare, RoomTemplateCostQuote, RoomTemplatePreflight, RoomTemplateTool } from './room-template-tool';
import { roomTemplateMiniatureFixtures } from './hud/room-template-miniature';

interface Point { readonly x: number; readonly y: number }
export interface RoomTemplateWorldBridgeOptions {
  readonly tileSize: number;
  readonly labelSafeBounds?: () => { left: number; top: number; right: number; bottom: number };
  readonly preparePreview?: (screen: Point, physicalMove: boolean) => void;
  readonly resetPreview?: () => void;
  readonly pick: (screen: Point) => TemplateSquare;
  readonly project: (world: Point) => Point;
  readonly objectFootprint: (id: string) => { readonly width: number; readonly height: number } | undefined;
  readonly label: (quote: RoomTemplateCostQuote | undefined, verdict: RoomTemplatePreflight | undefined) => string;
}

/** Presentation-only world ghost; preflight and placement remain worker-owned. */
export function installRoomTemplateWorldBridge(canvas: HTMLCanvasElement, tool: RoomTemplateTool, options: RoomTemplateWorldBridgeOptions): () => void {
  const layer = document.createElement('div');
  layer.className = 'room-template-world-ghost';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const label = document.createElement('div');
  label.className = 'room-template-world-ghost__label';
  label.setAttribute('role', 'status');
  layer.append(svg, label);
  canvas.parentElement?.append(layer);
  let plan: ReturnType<RoomTemplateTool['planAt']> | undefined;
  let verdict: RoomTemplatePreflight | undefined;
  let quote: RoomTemplateCostQuote | undefined;
  let origin: TemplateSquare | undefined;
  let selection = -1;
  let requestRevision = 0;
  let downPointer: number | undefined;
  let downSelection: number | undefined;
  let painted = '';
  let disposed = false;
  let lastScreen: Point | undefined;
  let mapHover: Point | undefined;

  const move = (screen: Point, physicalMove = false): void => {
    if (!tool.isArmed()) return;
    lastScreen = screen;
    if (physicalMove) mapHover = screen;
    options.preparePreview?.(screen, physicalMove);
    const next = options.pick(screen);
    if (origin?.x === next.x && origin.y === next.y && selection === tool.revision) return;
    origin = next;
    selection = tool.revision;
    plan = tool.planAt(next);
    verdict = undefined;
    quote = undefined;
    const current = ++requestRevision;
    const selected = selection;
    void Promise.all([tool.inspectAt(next), tool.quote()]).then(([inspection, estimate]) => {
      if (disposed || current !== requestRevision || selected !== tool.revision || !tool.isArmed()) return;
      verdict = inspection.verdict;
      quote = estimate;
      painted = '';
    }).catch(() => { if (current === requestRevision) verdict = undefined; });
  };
  const screenOf = (event: PointerEvent): Point => {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.x) * canvas.width / bounds.width, y: (event.clientY - bounds.y) * canvas.height / bounds.height };
  };
  const capture = (event: PointerEvent): boolean => {
    if (!tool.isArmed() || (event.buttons & 6) !== 0 || (event.type !== 'pointermove' && event.button !== 0)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    move(screenOf(event), true);
    return true;
  };
  const pointerMove = (event: PointerEvent): void => {
    mapHover = screenOf(event);
    if (tool.isArmed()) {
      lastScreen = mapHover;
      // Physical movement unlocks a fitted origin even during a camera-button
      // gesture; that gesture still cannot submit a building command.
      options.preparePreview?.(lastScreen, true);
    }
    capture(event);
  };
  // Only a real canvas hover may survive keyboard selection/re-arming. UI
  // pointer coordinates never become a world origin or retain an obsolete one.
  const outsidePointerMove = (event: PointerEvent): void => {
    if (event.target === canvas) return;
    mapHover = undefined;
    lastScreen = undefined;
    origin = undefined;
    plan = undefined;
    requestRevision += 1;
    options.resetPreview?.();
  };
  const resetPress = (): void => { downPointer = undefined; downSelection = undefined; };
  const pointerDown = (event: PointerEvent): void => {
    if (capture(event)) { downPointer = event.pointerId; downSelection = tool.revision; }
  };
  const pointerUp = (event: PointerEvent): void => {
    const captured = capture(event);
    const matches = downPointer === event.pointerId && downSelection === tool.revision;
    resetPress();
    if (!captured || !matches || origin === undefined) return;
    const selected = tool.revision;
    const destination = { ...origin };
    const current = ++requestRevision;
    void tool.placeAt(destination).then(result => {
      if (selected !== tool.revision || !tool.isArmed()) return;
      // Hover queries can supersede the preview while this committed command is
      // awaiting confirmation. Renderer replacement can dispose this bridge;
      // matching accepted completion still belongs to the shared armed tool.
      if (result.ok) { tool.standDown(); if (!disposed) plan = undefined; }
      else if (!disposed && current === requestRevision && result.reason !== 'busy') { verdict = result; painted = ''; }
    }).catch(() => { if (current === requestRevision) verdict = undefined; });
  };
  const cancel = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !event.defaultPrevented && tool.isArmed()) { resetPress(); options.resetPreview?.(); tool.standDown(); plan = undefined; requestRevision += 1; }
  };
  const interrupted = (event: PointerEvent): void => { if (event.pointerId === downPointer) resetPress(); };
  // A release outside the canvas must not become a later placement on re-entry.
  const outsideRelease = (event: PointerEvent): void => { if (event.target !== canvas) interrupted(event); };
  for (const [kind, handler] of [['pointermove', pointerMove], ['pointerdown', pointerDown], ['pointerup', pointerUp]] as const) canvas.addEventListener(kind, handler, true);
  canvas.addEventListener('pointercancel', interrupted, true);
  canvas.addEventListener('lostpointercapture', interrupted, true);
  window.addEventListener('pointerup', outsideRelease);
  window.addEventListener('pointermove', outsidePointerMove);
  window.addEventListener('blur', resetPress);
  // Let the focused UI consume Escape before the world sees it. A window
  // capture listener runs before the Layout menu can stop propagation.
  window.addEventListener('keydown', cancel);

  const paint = (): void => {
    if (disposed) return;
    // Keyboard pan/turn/tilt changes picking without a pointer event. Refresh
    // the cursor footprint before painting; move deduplicates unchanged tiles.
    if (tool.isArmed()) {
      const hover = lastScreen ?? mapHover;
      if (hover !== undefined) move(hover);
    }
    else if (!tool.isArmed()) { lastScreen = undefined; options.resetPreview?.(); }
    layer.hidden = !tool.isArmed() || plan === undefined;
    if (tool.isArmed() && origin !== undefined && selection !== tool.revision) {
      origin = undefined;
      plan = undefined;
    }
    if (!layer.hidden && plan !== undefined) {
      const width = canvas.width, height = canvas.height;
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      const walls = new Set(plan.wallSquares.map(p => p.x + ':' + p.y));
      const doors = new Set(plan.doorSquares.map(p => p.x + ':' + p.y));
      const objects = new Set<string>();
      for (const object of roomTemplateMiniatureFixtures(plan, id => options.objectFootprint(id) ?? { width: 1, height: 1 })) {
        for (let dy = 0; dy < object.height; dy += 1) for (let dx = 0; dx < object.width; dx += 1) objects.add((plan.origin.x + object.x + dx) + ':' + (plan.origin.y + object.y + dy));
      }
      const polygons: { points: string; fill: string }[] = [];
      for (let dy = 0; dy < plan.height; dy += 1) for (let dx = 0; dx < plan.width; dx += 1) {
        const x = plan.origin.x + dx, y = plan.origin.y + dy;
        const key = x + ':' + y;
        const points = [[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([px,py]) => options.project({ x: px! * options.tileSize, y: py! * options.tileSize })).map(p => p.x + ',' + p.y).join(' ');
        const blocked = verdict?.ok === false && verdict.tile.x === x && verdict.tile.y === y;
        polygons.push({ points, fill: blocked ? '#e55353' : walls.has(key) ? '#36b8ba' : doors.has(key) ? '#e9bc52' : objects.has(key) ? '#a794e3' : '#529ddd' });
      }
      const text = options.label(quote, verdict);
      const signature = JSON.stringify(polygons) + text;
      if (painted !== signature) {
        painted = signature;
        svg.replaceChildren(...polygons.map(p => {
          const polygon = document.createElementNS(svg.namespaceURI, 'polygon');
          polygon.setAttribute('points', p.points); polygon.setAttribute('fill', p.fill); polygon.setAttribute('fill-opacity', '0.38'); polygon.setAttribute('stroke', p.fill); polygon.setAttribute('stroke-width', '2');
          return polygon;
        }));
        label.textContent = text;
        layer.dataset.ready = verdict === undefined ? 'checking' : verdict.ok ? 'clear' : 'blocked';
      }
      const anchor = options.project({ x: plan.origin.x * options.tileSize, y: plan.origin.y * options.tileSize });
      const footprint = [[0,0],[plan.width,0],[plan.width,plan.height],[0,plan.height]].map(([dx,dy]) => options.project({ x: (plan!.origin.x + dx!) * options.tileSize, y: (plan!.origin.y + dy!) * options.tileSize }));
      const canvasBounds = canvas.getBoundingClientRect();
      const scaleX = canvasBounds.width / width, scaleY = canvasBounds.height / height;
      const labelBounds = label.getBoundingClientRect();
      const safe = options.labelSafeBounds?.() ?? { left: 8, top: 100, right: width - 8, bottom: height - 8 };
      const position = positionRoomTemplateLabel(safe, footprint, { width: labelBounds.width / scaleX, height: labelBounds.height / scaleY }, anchor);
      label.style.left = position.x * scaleX + 'px';
      label.style.top = position.y * scaleY + 'px';
    }
    requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  return () => {
    disposed = true; layer.remove();
    for (const [kind, handler] of [['pointermove', pointerMove], ['pointerdown', pointerDown], ['pointerup', pointerUp]] as const) canvas.removeEventListener(kind, handler, true);
    canvas.removeEventListener('pointercancel', interrupted, true);
    canvas.removeEventListener('lostpointercapture', interrupted, true);
    window.removeEventListener('pointerup', outsideRelease);
    window.removeEventListener('pointermove', outsidePointerMove);
    window.removeEventListener('blur', resetPress);
    window.removeEventListener('keydown', cancel);
  };
}
