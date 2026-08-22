import { type TilePosition } from '../world/coordinates';

export type BuildOrderLifecycleState = 
  | 'planned'
  | 'approved'
  | 'materials-pending'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface BuildOrder {
  readonly id: string;
  readonly definitionId: string;
  readonly location: TilePosition;
  
  state: BuildOrderLifecycleState;
  progress: number;
  
  // Future logistics state
  materialsAllocated: { itemId: string; quantity: number }[];
  assignedWorkerId?: string;
  failReason?: string;
}

export function createBuildOrder(
  id: string, 
  definitionId: string, 
  location: TilePosition
): BuildOrder {
  return {
    id,
    definitionId,
    location,
    state: 'planned',
    progress: 0,
    materialsAllocated: [],
  };
}
