import { z } from 'zod';
import type { JsonValue } from '../../shared/json';
import { BUILD_EDGES } from '../construction/build-order';
import type { VersionedPayload } from './types';

/**
 * `edge` is optional, and stays optional.
 *
 * Two reasons, and both are about not breaking something already written
 * down. A pending `PlaceBuildOrder` is part of the kernel's command queue,
 * which a session snapshot carries verbatim -- so a save taken before this
 * field existed can hold a queued command without it, and a required field
 * would make that save unrestorable. And the field is read through
 * `resolveBuildEdge`, whose default is documented on `DEFAULT_BUILD_EDGE`.
 *
 * Optional is not lax: `z.enum` rejects any value that is not one of the two
 * canonical edges, so a malformed orientation fails
 * `simulationCommandSchema` and `unpackCommand` returns `null` rather than
 * letting a nonsense string reach the construction system.
 */
export const placeBuildOrderSchema = z.object({
  type: z.literal('PlaceBuildOrder'),
  orderId: z.string(),
  definitionId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  edge: z.enum(BUILD_EDGES).optional(),
  transactionId: z.string().optional(),
}).strict();

export const cancelBuildOrderSchema = z.object({
  type: z.literal('CancelBuildOrder'),
  orderId: z.string(),
}).strict();

export const zoneRoomSchema = z.object({
  type: z.literal('ZoneRoom'),
  roomId: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  transactionId: z.string().optional(),
}).strict();

export const undoCommandSchema = z.object({
  type: z.literal('Undo'),
}).strict();

export const redoCommandSchema = z.object({
  type: z.literal('Redo'),
}).strict();

export const simulationCommandSchema = z.discriminatedUnion('type', [
  placeBuildOrderSchema,
  cancelBuildOrderSchema,
  zoneRoomSchema,
  undoCommandSchema,
  redoCommandSchema,
]);

export type SimulationCommand = z.infer<typeof simulationCommandSchema>;

function commandJson(command: SimulationCommand): JsonValue {
  switch (command.type) {
    case 'PlaceBuildOrder':
      return {
        type: command.type,
        orderId: command.orderId,
        definitionId: command.definitionId,
        x: command.x,
        y: command.y,
        ...(command.edge === undefined ? {} : { edge: command.edge }),
        ...(command.transactionId === undefined
          ? {}
          : { transactionId: command.transactionId }),
      };

    case 'CancelBuildOrder':
      return { type: command.type, orderId: command.orderId };

    case 'ZoneRoom':
      return {
        type: command.type,
        roomId: command.roomId,
        x: command.x,
        y: command.y,
        width: command.width,
        height: command.height,
        ...(command.transactionId === undefined
          ? {}
          : { transactionId: command.transactionId }),
      };

    case 'Undo':
    case 'Redo':
      return { type: command.type };
  }
}

export function packCommand(command: SimulationCommand): VersionedPayload {
  const parsed = simulationCommandSchema.parse(command);

  return {
    schemaId: 'lockstate.simulation.command',
    schemaVersion: 1,
    transport: 'structured-clone',
    data: commandJson(parsed),
  };
}

export function unpackCommand(payload: VersionedPayload): SimulationCommand | null {
  if (payload.schemaId !== 'lockstate.simulation.command') return null;
  const result = simulationCommandSchema.safeParse(payload.data);
  return result.success ? result.data : null;
}
