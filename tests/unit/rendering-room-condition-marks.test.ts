import { describe, expect, it } from 'vitest';
import {
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_GAP,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
} from '../../src/simulation/protocol/render-actors-payload';
import type { RenderRoom, RenderRoomCondition } from '../../src/rendering/feed/render-feed';
import { planRoomConditionMarks } from '../../src/rendering/world/room-condition-marks';
import { roomsFromSnapshot } from '../../src/rendering/feed/rooms-from-snapshot';
import type { EncodedSessionSystems } from '../../src/simulation/runtime/session-systems';

function room(instanceId: string, x: number, y: number, width = 2, height = 3): RenderRoom {
  return { instanceId, roomCatalogId: 'room.cell', anchorTileX: x, anchorTileY: y, width, height };
}

function condition(x: number, y: number, value: number): RenderRoomCondition {
  return { anchorTileX: x, anchorTileY: y, condition: value };
}

describe('which rooms get a mark on the map', () => {
  it('marks the room nobody can get into and leaves the working one alone', () => {
    const marks = planRoomConditionMarks(
      [room('room.cell:1:1', 1, 1), room('room.cell:4:1', 4, 1)],
      [condition(1, 1, RENDER_ROOM_CONDITION_NO_WAY_IN), condition(4, 1, RENDER_ROOM_CONDITION_DOORWAY)],
    );
    expect(marks.map((mark) => mark.instanceId)).toEqual(['room.cell:1:1']);
    expect(marks[0]).toEqual({
      instanceId: 'room.cell:1:1',
      tileX: 1,
      tileY: 1,
      width: 2,
      height: 3,
      condition: RENDER_ROOM_CONDITION_NO_WAY_IN,
    });
  });

  /**
   * The claim ADR 0097's 2026-09-11 amendment turns on: *"two adjacent
   * `room.cell` instances sharing a wall are two different answers to
   * `roomAccess`"*, and a mark derived from a per-tile scalar field -- the way
   * the owned-land outline and `room-labels.ts`' flood fill both are -- would
   * merge them into one boundary and one verdict.
   */
  it('gives two adjacent cells of the same type two different verdicts', () => {
    const marks = planRoomConditionMarks(
      [room('room.cell:1:1', 1, 1, 2, 3), room('room.cell:3:1', 3, 1, 2, 3)],
      [condition(1, 1, RENDER_ROOM_CONDITION_NO_WAY_IN), condition(3, 1, RENDER_ROOM_CONDITION_DOORWAY)],
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.tileX).toBe(1);
  });

  it('marks an unreachable room too, because a door that leads nowhere is still no way in', () => {
    const marks = planRoomConditionMarks([room('a', 0, 0)], [condition(0, 0, RENDER_ROOM_CONDITION_UNREACHABLE)]);
    expect(marks.map((mark) => mark.condition)).toEqual([RENDER_ROOM_CONDITION_UNREACHABLE]);
  });

  it('leaves an open-sided room unmarked, because a yard is zoned that way on purpose', () => {
    expect(planRoomConditionMarks([room('a', 0, 0)], [condition(0, 0, RENDER_ROOM_CONDITION_GAP)])).toEqual([]);
  });

  it('draws nothing for a verdict whose rectangle the frame does not hold, and nothing for a rectangle with no verdict', () => {
    expect(planRoomConditionMarks([room('a', 0, 0)], [condition(9, 9, RENDER_ROOM_CONDITION_NO_WAY_IN)])).toEqual([]);
    expect(planRoomConditionMarks([room('a', 0, 0)], [])).toEqual([]);
    expect(planRoomConditionMarks([], [condition(0, 0, RENDER_ROOM_CONDITION_NO_WAY_IN)])).toEqual([]);
  });
});

function systems(
  definitions: readonly { instanceId: string; roomCatalogId: string; anchorTile: { x: number; y: number }; width?: number; height?: number }[],
): EncodedSessionSystems {
  return { prisoners: { roomInstanceDefinitions: definitions } } as unknown as EncodedSessionSystems;
}

describe('the rectangles the geometry pull already carried', () => {
  it('reads the room instance rows out of the bundle the snapshot channel already sends', () => {
    const rooms = roomsFromSnapshot(
      systems([{ instanceId: 'room.cell:2:5', roomCatalogId: 'room.cell', anchorTile: { x: 2, y: 5 }, width: 2, height: 3 }]),
    );
    expect(rooms).toEqual([
      { instanceId: 'room.cell:2:5', roomCatalogId: 'room.cell', anchorTileX: 2, anchorTileY: 5, width: 2, height: 3 },
    ]);
  });

  it('publishes no rectangle for an instance that recorded none, rather than inventing one', () => {
    expect(roomsFromSnapshot(systems([{ instanceId: 'a', roomCatalogId: 'room.cell', anchorTile: { x: 1, y: 1 } }]))).toEqual([]);
    expect(
      roomsFromSnapshot(systems([{ instanceId: 'a', roomCatalogId: 'room.cell', anchorTile: { x: 1, y: 1 }, width: 0, height: 4 }])),
    ).toEqual([]);
  });

  it('answers nothing for a bundle with no simulation section at all (a V2 save)', () => {
    expect(roomsFromSnapshot(undefined)).toEqual([]);
  });
});
