import { expect, it } from 'vitest';
import { incrementOrderRevision, isOrderRevision } from '../../src/simulation/construction/order-revision';
import { packCommand, unpackCommand } from '../../src/simulation/protocol/commands';
import { SESSION_SNAPSHOT_SCHEMA_VERSION } from '../../src/simulation/runtime/restore-session';
import { BUILD_QUEUE_SCHEMA_VERSION } from '../../src/simulation/presentation/construction-projection';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';

it.each(['0', '1', '9007199254740991', '9007199254740992', '9'.repeat(200)])('canonical exact token %s round-trips through actual V2 pack/unpack', expectedRevision => {
  const command = { type: 'CancelBuildOrder' as const, orderId: 'actual-order', expectedRevision };
  const packed = packCommand(command);
  expect(packed.schemaVersion).toBe(2);
  expect(unpackCommand(JSON.parse(JSON.stringify(packed)))).toStrictEqual(command);
});
it.each(['', '00', '01', '-1', '+1', '1.0', '1e3', ' 1', '1\n', '١', 0, NaN])('rejects noncanonical token %j at the actual decoder', expectedRevision => {
  expect(isOrderRevision(expectedRevision)).toBe(false);
  expect(unpackCommand({ schemaId: 'lockstate.simulation.command', schemaVersion: 2,
    transport: 'structured-clone', data: { type: 'CancelBuildOrder', orderId: 'actual-order', expectedRevision } })).toBeNull();
});
it('exact increment carries across arbitrary decimal length without saturation or number coercion', () => {
  expect(incrementOrderRevision('9007199254740991')).toBe('9007199254740992');
  expect(incrementOrderRevision('9007199254740992')).toBe('9007199254740993');
  expect(incrementOrderRevision('9'.repeat(200))).toBe(`1${'0'.repeat(200)}`);
});
it('V1 cancellation is migration-only, unchanged V1 commands remain live and unknown versions fail closed', () => {
  for (const expectedRevision of [0, '0']) expect(unpackCommand({ schemaId: 'lockstate.simulation.command',
    schemaVersion: 1, transport: 'structured-clone', data: { type: 'CancelBuildOrder', orderId: 'x', expectedRevision } })).toBeNull();
  const ordinary = packCommand({ type: 'Undo' });
  expect(ordinary.schemaVersion).toBe(1);
  expect(unpackCommand(ordinary)).toStrictEqual({ type: 'Undo' });
  expect(unpackCommand({ ...ordinary, schemaVersion: 3 })).toBeNull();
});
it('changed snapshot and queue have explicit domain versions without moving unchanged HUD domains', () => {
  expect(SESSION_SNAPSHOT_SCHEMA_VERSION).toBe(4);
  expect(BUILD_QUEUE_SCHEMA_VERSION).toBe(2);
  expect(PROJECTION_CATALOG['hud/build-queue'].schemaVersion).toBe(2);
  expect(PROJECTION_CATALOG['hud/pending-deliveries'].schemaVersion).toBe(1);
});
