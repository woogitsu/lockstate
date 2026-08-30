import type { DoorRegistry } from '../navigation/door';
import type { TilePosition } from '../world/coordinates';

/**
 * Initial tunnel data model -- issue #28 asks for "initial tunnel data
 * model without final depth," and explicitly excludes "full tunnel
 * rendering/content balance." A tunnel is therefore a progress record
 * between two tiles, not geometry: something a future issue gives real
 * depth, excavation jobs and rendering.
 */
export interface TunnelRecord {
  readonly id: string;
  readonly startTile: TilePosition;
  readonly targetTile: TilePosition;
  /** 0-1. Reaches 1 only through explicit `TunnelRegistry.advance` calls -- no implicit per-tick digging in this slice. */
  readonly progress: number;
}

export class TunnelRegistry {
  private readonly tunnels = new Map<string, { startTile: TilePosition; targetTile: TilePosition; progress: number }>();

  public start(id: string, startTile: TilePosition, targetTile: TilePosition): void {
    if (this.tunnels.has(id)) throw new RangeError(`Duplicate tunnel id "${id}".`);
    this.tunnels.set(id, { startTile, targetTile, progress: 0 });
  }

  public advance(id: string, delta: number): void {
    const tunnel = this.tunnels.get(id);
    if (tunnel === undefined) throw new RangeError(`Unknown tunnel id "${id}".`);
    tunnel.progress = Math.max(0, Math.min(1, tunnel.progress + delta));
  }

  public get(id: string): TunnelRecord | undefined {
    const tunnel = this.tunnels.get(id);
    return tunnel === undefined ? undefined : { id, ...tunnel };
  }

  public isComplete(id: string): boolean {
    return (this.tunnels.get(id)?.progress ?? 0) >= 1;
  }

  /** Deterministic: sorted by id. */
  public all(): readonly TunnelRecord[] {
    return [...this.tunnels.keys()].sort().map((id) => this.get(id)!);
  }

  public getSnapshot(): readonly TunnelRecord[] {
    return this.all();
  }

  public loadSnapshot(snapshot: readonly TunnelRecord[]): void {
    this.tunnels.clear();
    for (const tunnel of snapshot) this.tunnels.set(tunnel.id, { startTile: tunnel.startTile, targetTile: tunnel.targetTile, progress: tunnel.progress });
  }
}

export interface EscapeOpportunity {
  /** Perimeter doors a would-be escaper could reach, by id -- real `DoorRegistry` doors, never a parallel perimeter model. */
  readonly exploitableDoorIds: readonly string[];
  readonly completedTunnelIds: readonly string[];
  /** 0-1, from the counts above plus the sector's staffing shortfall. */
  readonly score: number;
}

/**
 * Explicit-factor escape opportunity: a perimeter door left `'open'` (or
 * unlocked and cleared by a low grade) is a real, auditable weakness, and
 * so is a completed tunnel. Staffing shortfall amplifies both -- an
 * unwatched weakness is far more exploitable than a watched one. Pure and
 * deterministic; the caller decides what to do with the score.
 *
 * A `'locked'` door is never exploitable here: #21's `checkDoorAccess`
 * treats `locked` as an absolute block short of `emergencyOverride`, and
 * a prisoner never holds one.
 */
export function resolveEscapeOpportunity(
  doors: DoorRegistry,
  perimeterDoorIds: readonly string[],
  tunnels: TunnelRegistry,
  candidateTunnelIds: readonly string[],
  staffingShortfall: number,
): EscapeOpportunity {
  const exploitableDoorIds = [...perimeterDoorIds].sort().filter((doorId) => {
    const door = doors.getById(doorId);
    return door !== undefined && door.state !== 'locked';
  });
  const completedTunnelIds = [...candidateTunnelIds].sort().filter((tunnelId) => tunnels.isComplete(tunnelId));

  const weaknesses = exploitableDoorIds.length + completedTunnelIds.length;
  if (weaknesses === 0) return { exploitableDoorIds, completedTunnelIds, score: 0 };

  const base = Math.min(1, weaknesses * 0.4);
  const score = Math.max(0, Math.min(1, base * (0.5 + 0.5 * Math.max(0, Math.min(1, staffingShortfall)))));
  return { exploitableDoorIds, completedTunnelIds, score };
}
