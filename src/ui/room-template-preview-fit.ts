interface Point { readonly x: number; readonly y: number }
interface Size { readonly width: number; readonly height: number }
export interface RoomTemplatePreviewFitPort {
  readonly pick: (screen: Point) => Point;
  readonly size: () => Size;
  readonly revision: () => number;
  readonly viewRevision?: () => string;
  /** True only when the camera actually applied a full-footprint fit. */
  readonly fit: (origin: Point, size: Size, screen: Point) => boolean;
}

/** The approved fit/pan policy freezes a chosen world origin until actual movement. */
export class RoomTemplatePreviewFitController {
  private locked: Point | undefined;
  private physical: Point | undefined;
  private selection = -1;
  private view: string | undefined;
  public constructor(private readonly port: RoomTemplatePreviewFitPort) {}

  public prepare(screen: Point, physical: boolean): void {
    const moved = physical && (this.physical?.x !== screen.x || this.physical.y !== screen.y);
    if (moved) { this.locked = undefined; this.physical = { ...screen }; }
    const revised = this.selection !== this.port.revision();
    const view = this.port.viewRevision?.();
    const viewChanged = view !== this.view;
    if (!moved && !revised && !viewChanged) return;
    const origin = this.locked ?? this.port.pick(screen);
    this.selection = this.port.revision();
    if (this.port.fit(origin, this.port.size(), screen)) this.locked = { ...origin };
    this.view = this.port.viewRevision?.();
  }

  public pick(screen: Point): Point { return this.locked ?? this.port.pick(screen); }
  public reset(): void { this.locked = undefined; this.physical = undefined; this.selection = -1; this.view = undefined; }
}
