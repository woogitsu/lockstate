import { z } from 'zod';
import type { VersionedPayload } from './types';

// Opaque command types that can be packed into VersionedPayload
export const placeBuildOrderSchema = z.object({
  type: z.literal('PlaceBuildOrder'),
  orderId: z.string(),
  definitionId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
}).strict();

export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
}).strict();

export const simulationCommandSchema = z.discriminatedUnion('type', [
  placeBuildOrderSchema,
  cancelBuildOrderSchema,
]);

export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

export function packCommand(command: SimulationCommand): VersionedPayload {
  return {
    schemaId: 'lockstate.simulation.command',
    schemaVersion: 1,
    transport: 'structured-clone',
    data: command,
  };
}

export function unpackCommand(payload: VersionedPayload): SimulationCommand | null {
  if (payload.schemaId !== 'lockstate.simulation.command') return null;
  const result = simulationCommandSchema.safeParse(payload.data);
  return result.success ? result.data : null;
}
