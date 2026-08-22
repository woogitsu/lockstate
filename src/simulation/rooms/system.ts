import type { SparseWorld } from '../world/sparse-world';
import type { TopologyManager, GlobalTopologyId } from './topology';
import type { RoomRegistry } from './definition';

export interface RoomValidationResult {
  readonly isValid: boolean;
  readonly missingRequirements: readonly string[];
}

export class RoomSystem {
  // A simple representation of an active room instance
  // Keyed by a string like `${globalTopologyId}-${zoningId}` or similar

  constructor(
    private readonly world: SparseWorld,
    private readonly topology: TopologyManager,
    private readonly registry: RoomRegistry
  ) {}

  public validateRoom(topologyId: GlobalTopologyId, zoningNumericId: number): RoomValidationResult {
    const def = this.registry.getByNumericId(zoningNumericId);
    if (!def) {
      return { isValid: false, missingRequirements: ['Unknown room type'] };
    }

    const missing: string[] = [];
    
    // In a real system we would scan the tiles for this topologyId and zoningNumericId
    // to calculate bounding box, area, and contained objects.
    // Since we don't have object placement implemented yet, we'll just mock validation
    // based on requirements.

    for (const req of def.requirements) {
      if (req.type === 'enclosed') {
        // Mock: say it's enclosed if it has a valid topologyId
        // A true implementation would verify if the topology touches the map edge
        // or a known "outside" region.
        if (topologyId === 0) {
          missing.push('Room must be enclosed by walls and doors');
        }
      } else if (req.type === 'minimum-size') {
        // Mock: we don't know the size without counting tiles.
        // We'll assume size is met for this skeleton.
      } else if (req.type === 'object') {
        missing.push(`Requires ${req.minQuantity}x ${req.objectId}`);
      }
    }

    return {
      isValid: missing.length === 0,
      missingRequirements: missing
    };
  }
}
