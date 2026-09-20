import { describe, expect, it } from 'vitest';
import {
  decodeRenderActorsPayload,
  packRenderActorFields,
  RENDER_ACTORS_LAYOUT_VERSION,
  RENDER_ACTORS_SCHEMA_VERSION,
  RENDER_ACTOR_POPULATION_PRISONER,
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
  RENDER_ROOM_CONDITION_UNREACHABLE,
  RenderActorsKeyframeWriter,
  renderActorsByteLength,
} from '../../src/simulation/protocol/render-actors-payload';
import { readRenderActorsPayload, writeRenderActorsPayload } from '../helpers/render-actors-reader';

/**
 * Layout 4's room block: ADR 0097 decision 2's per-room condition ordinal, on
 * the delta channel, keyed by the room's anchor tile.
 *
 * Both directions are exercised against a *hand-built* buffer as well as the
 * production writer (`tests/helpers/render-actors-reader.ts` builds one from
 * literal offsets), so neither side of a comparison is the other side's
 * output — `docs/AGENT_WORKFLOW.md` §3's rule.
 */
describe('the render delta carries one condition ordinal per room', () => {
  it('writes twelve bytes per room after the records, and reads them back', () => {
    const writer = new RenderActorsKeyframeWriter(1, 7, 2);
    writer.writeRecord(3, packRenderActorFields(RENDER_ACTOR_POPULATION_PRISONER), 0, 0, 0, 0);
    writer.writeRoom(4, 9, RENDER_ROOM_CONDITION_NO_WAY_IN);
    writer.writeRoom(-2, 30, RENDER_ROOM_CONDITION_DOORWAY);
    const buffer = writer.finish();

    // 24-byte header + 20 per actor + 12 per room, stated twice: once by the
    // production arithmetic and once by the literal the ADR's table implies.
    expect(renderActorsByteLength(1, 0, 2)).toBe(24 + 20 + 24);
    expect(buffer.byteLength).toBe(68);

    const hand = readRenderActorsPayload(buffer);
    expect(hand.layoutVersion).toBe(RENDER_ACTORS_LAYOUT_VERSION);
    expect(hand.roomCount).toBe(2);
    expect(hand.rooms).toEqual([
      { anchorTileX: 4, anchorTileY: 9, condition: RENDER_ROOM_CONDITION_NO_WAY_IN },
      { anchorTileX: -2, anchorTileY: 30, condition: RENDER_ROOM_CONDITION_DOORWAY },
    ]);

    const decoded = decodeRenderActorsPayload(buffer);
    expect([...decoded.roomAnchorX]).toEqual([4, -2]);
    expect([...decoded.roomAnchorY]).toEqual([9, 30]);
    expect([...decoded.roomConditions]).toEqual([RENDER_ROOM_CONDITION_NO_WAY_IN, RENDER_ROOM_CONDITION_DOORWAY]);
  });

  it('decodes a buffer it did not write', () => {
    const buffer = writeRenderActorsPayload({
      layoutVersion: RENDER_ACTORS_LAYOUT_VERSION,
      flags: 1,
      worldRevision: 12,
      records: [],
      removed: [],
      rooms: [{ anchorTileX: 16, anchorTileY: 16, condition: RENDER_ROOM_CONDITION_UNREACHABLE }],
    });
    const decoded = decodeRenderActorsPayload(buffer);
    expect(decoded.recordCount).toBe(0);
    expect([...decoded.roomConditions]).toEqual([RENDER_ROOM_CONDITION_UNREACHABLE]);
    expect([...decoded.roomAnchorX]).toEqual([16]);
  });

  it('carries no room block at all when the caller has nothing to say about rooms', () => {
    const writer = new RenderActorsKeyframeWriter(0, 0);
    const buffer = writer.finish();
    expect(buffer.byteLength).toBe(24);
    expect(decodeRenderActorsPayload(buffer).roomConditions.length).toBe(0);
  });

  it('refuses an ordinal it has no meaning for rather than writing a verdict', () => {
    const writer = new RenderActorsKeyframeWriter(0, 0, 1);
    expect(() => writer.writeRoom(1, 1, 99)).toThrow(/unknown condition ordinal: 99/);
  });

  it('refuses a short room block rather than shipping a zeroed row', () => {
    const writer = new RenderActorsKeyframeWriter(0, 0, 2);
    writer.writeRoom(1, 1, RENDER_ROOM_CONDITION_DOORWAY);
    expect(() => writer.finish()).toThrow(/sized for 2 rooms received 1/);
  });

  it('refuses a buffer whose declared room count does not match its length', () => {
    const writer = new RenderActorsKeyframeWriter(0, 0, 1);
    writer.writeRoom(1, 1, RENDER_ROOM_CONDITION_DOORWAY);
    const truncated = writer.finish().slice(0, 28);
    expect(() => decodeRenderActorsPayload(truncated)).toThrow(/must be 36 bytes, got 28/);
  });

  it('versions the payload, because a receiver reading layout 3 offsets would read a room row as an actor', () => {
    expect(RENDER_ACTORS_LAYOUT_VERSION).toBe(4);
    expect(RENDER_ACTORS_SCHEMA_VERSION).toBe(4);
  });
});
