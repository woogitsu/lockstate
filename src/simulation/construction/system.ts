import { type SystemRegistration, type SimulationContext } from '../kernel/system';
import { type BuildOrder } from './build-order';
import { getBuildableDefinition } from './definition';
import { SparseWorld } from '../world/sparse-world';
import { tileToChunk } from '../world/coordinates';

export class ConstructionSystem implements SystemRegistration {
  public readonly id = 'construction';
  public readonly order = 100;
  
  // Run every 10 ticks (2 times per second)
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private orders = new Map<string, BuildOrder>();

  public constructor(private readonly world: SparseWorld) {}

  public submitOrder(order: BuildOrder): void {
    if (this.orders.has(order.id)) {
      throw new Error(`BuildOrder ${order.id} already exists`);
    }
    
    // Validation hooks would run here: check ownership, terrain, occupancy
    const { x, y } = order.location;
    const { chunk } = tileToChunk(order.location, this.world.tileChunkSize);
    const chunkState = this.world.getChunk(chunk);
    if (!chunkState) {
      order.state = 'failed';
      order.failReason = 'out-of-bounds';
      this.orders.set(order.id, order);
      return;
    }
    
    // For now, immediately approve valid orders
    order.state = 'approved';
    this.orders.set(order.id, order);
  }

  public cancelOrder(id: string): void {
    const order = this.orders.get(id);
    if (!order) throw new Error(`BuildOrder ${id} not found`);
    if (order.state === 'completed' || order.state === 'failed' || order.state === 'cancelled') {
      throw new Error(`Cannot cancel order in state ${order.state}`);
    }
    
    order.state = 'cancelled';
    // TODO: release materials
  }

  public getOrder(id: string): BuildOrder | undefined {
    return this.orders.get(id);
  }

  public update(context: SimulationContext): void {
    for (const order of this.orders.values()) {
      const def = getBuildableDefinition(order.definitionId);
      
      switch (order.state) {
        case 'approved':
          // Auto-transition to materials pending
          order.state = 'materials-pending';
          break;
          
        case 'materials-pending':
          // Mock logistics: instantly allocate materials
          for (const req of def.materialsRequired) {
            order.materialsAllocated.push({ itemId: req.itemId, quantity: req.quantity });
          }
          order.state = 'assigned';
          break;

        case 'assigned':
          // Mock job assignment: immediately start
          order.assignedWorkerId = 'mock-worker-1';
          order.state = 'in-progress';
          break;

        case 'in-progress':
          // Mock progress: advance fixed amount
          order.progress += 10;
          
          if (order.progress >= def.workRequired) {
            order.progress = def.workRequired;
            order.state = 'completed';
            this.finalizeConstruction(order);
          }
          break;

        case 'completed':
        case 'cancelled':
        case 'failed':
          // Final states, cleanup can happen later or be kept for history
          break;
      }
    }
  }

  private finalizeConstruction(order: BuildOrder): void {
    // Actually mutate the world geometry
    const { x, y } = order.location;
    const { chunk } = tileToChunk(order.location, this.world.tileChunkSize);
    const chunkState = this.world.getChunk(chunk);
    if (chunkState) {
      // In a full implementation, we'd add entities or mutate cell data.
      // For now, bump the geometry revision to signal a topological change.
      this.world.markGeometryChanged(chunk);
    }
  }

  public snapshot(): any {
    return {
      orders: Array.from(this.orders.values()).map(o => ({ ...o, materialsAllocated: [...o.materialsAllocated] })),
    };
  }

  public restore(data: any): void {
    this.orders.clear();
    for (const order of data.orders) {
      this.orders.set(order.id, order);
    }
  }
}
