import { describe, expect, it } from 'vitest';
import { packCommand, unpackCommand } from '../../src/simulation/protocol/commands';

describe('PlaceRoomTemplate wire command', () => {
  it('round trips the authored ID, integer origin and optional mirror without inventing fields', () => {
    const packed = packCommand({
      type: 'PlaceRoomTemplate', templateId: 'cell-large', origin: { x: 10, y: -2 }, mirrorX: true,
    });
    expect(unpackCommand(packed)).toEqual({
      type: 'PlaceRoomTemplate', templateId: 'cell-large', origin: { x: 10, y: -2 }, mirrorX: true,
    });
    expect(unpackCommand(packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 0, y: 0 } }))).toEqual({
      type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 0, y: 0 },
    });
  });

  it('rejects unknown content IDs and noninteger origins at the worker boundary', () => {
    expect(() => packCommand({ type: 'PlaceRoomTemplate', templateId: 'missing', origin: { x: 0, y: 0 } } as never)).toThrow();
    expect(() => packCommand({ type: 'PlaceRoomTemplate', templateId: 'cell-basic', origin: { x: 1.5, y: 0 } } as never)).toThrow();
  });
});
