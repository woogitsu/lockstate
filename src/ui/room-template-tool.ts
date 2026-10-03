export type { RoomTemplatePlan, TemplateSquare } from '../content/room-template-catalog';
import { type RoomTemplateId, type RoomTemplatePlan, type TemplateSquare } from '../content/room-template-catalog';
import { instantiateOrientedRoomTemplate, type QuarterTurns, type RotatedRoomTemplateGeometry } from '../content/room-template-rotation';

/** One player press becomes one worker command once the transactional backend is available. */
export interface RoomTemplatePlacementRequest {
  readonly templateId: RoomTemplateId;
  readonly origin: TemplateSquare;
  readonly mirrorX?: boolean;
  readonly quarterTurns?: QuarterTurns;
}

export type RoomTemplatePreflight =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'unowned-land' | 'structure-occupied' | 'object-occupied'; readonly tile: TemplateSquare };

export interface RoomTemplateCostQuote {
  readonly orderCount: number;
  readonly materials: readonly { readonly itemId: string; readonly quantity: number }[];
  readonly catalogueCostMinorUnits?: number;
}

export interface RoomTemplatePlacementPort {
  readonly quote?: (templateId: RoomTemplateId) => Promise<RoomTemplateCostQuote>;
  readonly onArm?: () => void;
  readonly objectFootprint?: (id: string) => { readonly width: number; readonly height: number } | undefined;
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
  private quarterTurns: QuarterTurns = 0;
  private busy: symbol | undefined;
  private armed = false;
  private selectionRevision = 0;

  public constructor(private readonly port: RoomTemplatePlacementPort) {}

  public select(templateId: RoomTemplateId, mirrorX = false, quarterTurns: QuarterTurns = 0): void {
    if (!Number.isInteger(quarterTurns) || quarterTurns < 0 || quarterTurns > 3) throw new RangeError('Room plan quarter turns must be an integer from 0 to 3.');
    if (this.selected !== templateId || this.mirrorX !== mirrorX || this.quarterTurns !== quarterTurns) this.selectionRevision += 1;
    this.selected = templateId;
    this.mirrorX = mirrorX;
    this.quarterTurns = quarterTurns;
  }

  public objectFootprint(id: string): { readonly width: number; readonly height: number } { return this.port.objectFootprint?.(id) ?? { width: 1, height: 1 }; }
  public get revision(): number { return this.selectionRevision; }
  public isArmed(): boolean { return this.armed; }
  public arm(): void { this.port.onArm?.(); this.armed = true; this.selectionRevision += 1; }
  public standDown(): void {
    this.selectionRevision += 1;
    this.armed = false;
    // Session replacement already stands this shared tool down. A request
    // belonging to that abandoned operation must not block the new session.
    this.busy = undefined;
  }
  public async quote(): Promise<RoomTemplateCostQuote | undefined> { return this.port.quote?.(this.selected); }

  public planAt(origin: TemplateSquare): RotatedRoomTemplateGeometry {
    return instantiateOrientedRoomTemplate(this.selected, origin, { mirrorX: this.mirrorX, quarterTurns: this.quarterTurns }, id => this.objectFootprint(id));
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
    if (this.busy !== undefined) return { ok: false, reason: 'busy' };
    const placement = Symbol();
    this.busy = placement;
    try {
      const revision = this.selectionRevision;
      const request = this.requestAt(origin);
      const verdict = await this.port.preflight(request);
      if (revision !== this.selectionRevision) return { ok: false, reason: 'busy' };
      if (!verdict.ok) return verdict;
      await this.port.place(request);
      return verdict;
    } finally {
      if (this.busy === placement) this.busy = undefined;
    }
  }
}
