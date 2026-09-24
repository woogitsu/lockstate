/** Presentation data only. The minimap never owns or changes simulation state. */
export interface MinimapView {
  readonly width: number;
  readonly height: number;
  /** 0 = void, 1 = loaded, 2 = owned, 3 = room, 4 = water, 5 = wall. */
  readonly pixels: Uint8Array;
  /** Camera viewport in normalized loaded-world coordinates; may extend beyond 0..1. */
  readonly viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}
