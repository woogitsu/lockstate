import { instantiateRoomTemplate, orientRoomTemplatePlan, type RoomTemplateId, type RoomTemplatePlan, type TemplateSquare } from '../content/room-template-catalog';
import type { TemplateQuarterTurns } from '../content/room-template-rotation-geometry';

/** Display data supplied by the composition root; the HUD never imports the simulation. */
export interface RoomTemplateCostQuote {
  readonly orderCount: number;
  readonly materials: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly catalogueCostMinorUnits?: number;
}

/** One player press becomes one worker command once the transactional backend is available. */
export interface RoomTemplatePlacementRequest {
  readonly templateId: RoomTemplateId;
  readonly origin: TemplateSquare;
  readonly mirrorX?: boolean;
  readonly quarterTurns?: TemplateQuarterTurns;
}

export type RoomTemplatePreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unowned-land' | 'structure-occupied' | 'object-occupied'; readonly tile: TemplateSquare };

export interface RoomTemplatePlacementPort {
  /** Read-only worker query over every square, including the room's future objects. */
  preflight(request: RoomTemplatePlacementRequest): Promise<RoomTemplatePreflight>;
  /** Backend must validate again and commit atomically; preflight can become stale. */
  place(request: RoomTemplatePlacementRequest): Promise<void>;
}

/**
 * HUD-facing tool state, dormant until a worker preflight and atomic command
 * are both provided. It never infers ownership or collisions from pixels.
 */
export class RoomTemplateTool {
  private selected: RoomTemplateId = 'cell-basic';
  private mirrorX = false;
  private quarterTurns: TemplateQuarterTurns = 0;
  private busy = false;
  private armed = false;
  private readonly selectionListeners = new Set<() => void>();

  public constructor(private readonly port: RoomTemplatePlacementPort) {}

  public select(templateId: RoomTemplateId, mirrorX = false, quarterTurns: TemplateQuarterTurns = 0): void {
    if (this.selected === templateId && this.mirrorX === mirrorX && this.quarterTurns === quarterTurns) return;
    this.selected = templateId;
    this.mirrorX = mirrorX;
    this.quarterTurns = quarterTurns;
    for (const listener of this.selectionListeners) listener();
  }

  /** A ghost needs a repaint when either the selected variant or armed state changes. */
  public onSelectionChanged(listener: () => void): () => void {
    this.selectionListeners.add(listener);
    return () => this.selectionListeners.delete(listener);
  }

  public arm(): void {
    if (this.armed) return;
    this.armed = true;
    for (const listener of this.selectionListeners) listener();
  }
  public standDown(): void {
    if (!this.armed) return;
    this.armed = false;
    for (const listener of this.selectionListeners) listener();
  }
  public isArmed(): boolean { return this.armed; }
  public selectedTemplateId(): RoomTemplateId { return this.selected; }

  public planAt(origin: TemplateSquare): RoomTemplatePlan {
    return orientRoomTemplatePlan(instantiateRoomTemplate(this.selected, origin, { mirrorX: this.mirrorX }), this.quarterTurns);
  }

  public async inspectAt(origin: TemplateSquare): Promise<{ readonly plan: RoomTemplatePlan; readonly verdict: RoomTemplatePreflight }> {
    const plan = this.planAt(origin);
    return { plan, verdict: await this.port.preflight(this.requestAt(origin)) };
  }

  private requestAt(origin: TemplateSquare): RoomTemplatePlacementRequest {
    return {
      templateId: this.selected,
      origin: { x: origin.x, y: origin.y },
      ...(this.mirrorX ? { mirrorX: true } : {}),
      ...(this.quarterTurns === 0 ? {} : { quarterTurns: this.quarterTurns }),
    };
  }

  public async placeAt(origin: TemplateSquare): Promise<RoomTemplatePreflight | { readonly ok: false; readonly reason: 'busy' }> {
    if (this.busy) return { ok: false, reason: 'busy' };
    this.busy = true;
    try {
      const request = this.requestAt(origin);
      const verdict = await this.port.preflight(request);
      if (!verdict.ok) return verdict;
      await this.port.place(request);
      return verdict;
    } finally {
      this.busy = false;
    }
  }
}
