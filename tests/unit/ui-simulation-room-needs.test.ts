import { describe, expect, it } from 'vitest';
import { roomInstanceIdFor } from '../../src/simulation/rooms/zoning';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { RoomInstanceRegistry, type RoomInstance } from '../../src/simulation/prisoners/room-instance-registry';
import { buildContentRegistry } from '../../src/content/registry';
import type { RoomCatalogDefinition } from '../../src/content/room-catalog';
import {
  projectRoomDetail,
  projectRoomList,
  type RoomDetailViewModel,
  type RoomListViewModel,
} from '../../src/simulation/presentation/room-projection';
import {
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from '../../src/simulation/protocol/types';
import { ROOM_NEEDS_NAMED_LIMIT } from '../../src/ui/hud';
import type { ProjectionMessageChannel } from '../../src/ui/simulation-projections';
import {
  RoomNeedsReader,
  roomNeedsFromProjections,
  unfinishedRoomIds,
} from '../../src/ui/simulation-room-needs';

/**
 * What the Rooms panel is told about the rooms that are not finished.
 *
 * Every view model here is produced by the **real** projections over a real
 * `RoomInstanceRegistry` and the shipped catalogues, never hand-written: a
 * mapping asserted against a fixture of the shape the projection is *hoped* to
 * have proves only that the fixture and the assertion agree, which is the rule
 * `tests/unit/hud-projections.test.ts` states for the layer this reads from.
 * The verdict under test -- `'missing-capability'` -- is therefore the one
 * `projectRoomDetail` really computes from `room.cell`'s authored requirements
 * and the instance's derived capabilities, and a change to that rule fails here
 * rather than being mirrored by a copy in this file.
 */

const CELL = 'room.cell';

/** A zoned cell with whatever objects are standing in it, as the registry holds one. */
function cell(x: number, y: number, capabilities: readonly string[]): RoomInstance {
  return {
    instanceId: roomInstanceIdFor(CELL, { x: tileCoordinate(x), y: tileCoordinate(y) }),
    roomCatalogId: CELL,
    anchorTile: { x: tileCoordinate(x), y: tileCoordinate(y) },
    width: 2,
    height: 3,
    residentCapacity: capabilities.includes('sleep-surface') ? 1 : 0,
    concurrentUseCapacity: 0,
    objectCapabilities: [...capabilities],
  };
}

function registryOf(...instances: readonly RoomInstance[]): { readonly roomInstances: RoomInstanceRegistry } {
  const roomInstances = new RoomInstanceRegistry();
  for (const instance of instances) roomInstances.register(instance);
  return { roomInstances };
}

/** The real list and the real detail for every instance in it, in the projection's own order. */
function project(source: { readonly roomInstances: RoomInstanceRegistry }): {
  readonly list: RoomListViewModel;
  readonly details: readonly RoomDetailViewModel[];
} {
  const list = projectRoomList(source);
  const details: RoomDetailViewModel[] = [];
  for (const id of unfinishedRoomIds(list)) {
    const detail = projectRoomDetail(source, id);
    if (detail !== undefined) details.push(detail);
  }
  return { list, details };
}

describe('what the interface is told a zoned room is missing', () => {
  it('reads the simulation own verdict, and names the object the catalogue does', () => {
    // An empty cell: `room.cell` authors an `object` requirement for a bed and
    // one for a toilet, and nothing is standing in this rectangle.
    const source = registryOf(cell(4, 4, []));
    const { list, details } = project(source);

    // The premise, asserted rather than assumed: the projection really does
    // call this room unfinished, and really does name the objects.
    expect(list.rooms.rows[0]?.requirementSummary.missingCapability).toBe(2);
    expect(
      details[0]?.requirements
        .filter((requirement) => requirement.status === 'missing-capability')
        .map((requirement) => requirement.objectNameKey),
    ).toEqual(['object.bed.name', 'object.toilet.name']);

    const needs = roomNeedsFromProjections(list, details);
    expect(needs.unfinishedRooms).toBe(1);
    expect(needs.totalRooms).toBe(1);
    expect(needs.totalNeeds).toBe(2);
    expect(needs.needs).toEqual([
      {
        instanceId: 'room.cell:4:4',
        roomLabelKey: 'room.cell.name',
        tile: { x: 4, y: 4 },
        objectLabelKey: 'object.bed.name',
      },
    ]);
  });

  it('says nothing is missing when the simulation says nothing is', () => {
    // The case that decides whether this feature is furniture. A cell with both
    // capabilities standing in it satisfies both `object` requirements, so the
    // verdict is empty -- and the readout has to be empty with it, or the panel
    // grows a permanent block saying all is well.
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const { list, details } = project(source);

    expect(list.rooms.rows[0]?.requirementSummary.missingCapability).toBe(0);
    expect(unfinishedRoomIds(list)).toEqual([]);
    expect(details).toEqual([]);

    expect(roomNeedsFromProjections(list, details)).toEqual({
      unfinishedRooms: 0,
      totalRooms: 1,
      totalNeeds: 0,
      needs: [],
    });
  });

  it('counts every unfinished room and every unmet requirement, and names one of them', () => {
    const source = registryOf(cell(2, 2, []), cell(4, 4, ['sleep-surface']), cell(6, 6, ['sleep-surface', 'sanitation']));
    const { list, details } = project(source);

    const needs = roomNeedsFromProjections(list, details);
    // Two rooms are unfinished out of three, and between them they want three
    // things: two in the empty cell and one in the cell with only a bed.
    expect(needs.unfinishedRooms).toBe(2);
    expect(needs.totalRooms).toBe(3);
    expect(needs.totalNeeds).toBe(3);
    // The panel names one -- what it can afford at 900x600 -- and the counts
    // above are what tell the player the other two exist.
    expect(needs.needs).toHaveLength(ROOM_NEEDS_NAMED_LIMIT);
    expect(needs.needs[0]?.instanceId).toBe('room.cell:2:2');
  });

  it('picks the room to name in the projection canonical order, not in registration order', () => {
    // Registered highest-id first. `collectRoomInstances` sorts by instance id,
    // so which room gets named is a property of the projection rather than of
    // the order the player happened to zone them in -- which is what makes the
    // readout the same for the same prison however it was built.
    const backwards = registryOf(cell(9, 9, []), cell(2, 2, []));
    const forwards = registryOf(cell(2, 2, []), cell(9, 9, []));
    const named = (source: { readonly roomInstances: RoomInstanceRegistry }): string | undefined => {
      const { list, details } = project(source);
      return roomNeedsFromProjections(list, details).needs[0]?.instanceId;
    };
    expect(named(backwards)).toBe('room.cell:2:2');
    expect(named(forwards)).toBe('room.cell:2:2');
  });

  it('carries no object key for a requirement the object catalogue cannot name', () => {
    // The only way `projectRoomDetail` reports a requirement as unmet with no
    // `objectNameKey`: the room asks for an object id the catalogue does not
    // define, which is *why* the requirement can never be satisfied. Driven
    // through the real projection with a one-room catalogue rather than by
    // hand, so the branch under test is the projection's own.
    const source = registryOf({
      instanceId: 'room.ghost:0:0',
      roomCatalogId: 'room.ghost',
      anchorTile: { x: tileCoordinate(0), y: tileCoordinate(0) },
      residentCapacity: 0,
      concurrentUseCapacity: 0,
      objectCapabilities: [],
    });
    const { registry: rooms } = buildContentRegistry<RoomCatalogDefinition>([
      {
        schemaVersion: 1,
        id: 'room.ghost',
        numericId: 900,
        nameKey: 'room.ghost.name',
        category: 'housing',
        requirements: [{ type: 'object', objectId: 'object.nonexistent', minQuantity: 1 }],
      },
    ]);
    const list = projectRoomList(source, {}, { rooms });
    const detail = projectRoomDetail(source, 'room.ghost:0:0', { rooms });
    expect(detail?.requirements[0]?.status).toBe('missing-capability');
    expect(detail?.requirements[0]?.objectNameKey).toBeUndefined();

    const needs = roomNeedsFromProjections(list, detail === undefined ? [] : [detail]);
    expect(needs.needs).toEqual([
      { instanceId: 'room.ghost:0:0', roomLabelKey: 'room.ghost.name', tile: { x: 0, y: 0 } },
    ]);
    // Absent, not present-and-`undefined`: `exactOptionalPropertyTypes` is on,
    // and the panel branches on the key being there at all.
    expect(Object.hasOwn(needs.needs[0] ?? {}, 'objectLabelKey')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

class FakeChannel implements ProjectionMessageChannel {
  public readonly sent: MainToWorkerMessage[] = [];
  private handler: ((message: WorkerToMainMessage) => void) | undefined;

  public addListener(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  public send(message: MainToWorkerMessage): void {
    this.sent.push(message);
  }

  public deliver(message: WorkerToMainMessage): void {
    if (this.handler === undefined) throw new Error('The reader registered no listener.');
    this.handler(message);
  }

  public idOf(index: number): string {
    return (this.sent[index] as { messageId: string }).messageId;
  }

  public payloadOf(index: number): Record<string, unknown> {
    return (this.sent[index] as { payload: Record<string, unknown> }).payload;
  }
}

const reply = (replyTo: string, projectionId: string, data: unknown): WorkerToMainMessage =>
  ({
    protocolVersion: SIMULATION_PROTOCOL_VERSION,
    messageId: `reply-${replyTo}`,
    replyTo,
    kind: 'simulation/projection',
    payload: {
      projectionId,
      tick: 7,
      view: {
        transport: 'structured-clone' as const,
        schemaId: `lockstate.hud-view-model.${projectionId.replace('hud/', '')}`,
        schemaVersion: 1,
        data,
      },
    },
  }) as WorkerToMainMessage;

/** Lets a test act between the two requests one `read()` makes. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('the reader that asks the worker what the rooms are missing', () => {
  it('asks for the list with no window of its own, then for the unfinished room by id', async () => {
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();

    // No `offset` and no `limit`: the projection's own default window is the
    // right one, and naming a number here would copy a simulation bound onto
    // this side of the boundary.
    expect(channel.payloadOf(0)).toEqual({ projectionId: 'hud/room-list' });
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();

    // The detail request names the instance the *list* said was unfinished --
    // this thread chooses no room of its own.
    expect(channel.payloadOf(1)).toEqual({
      projectionId: 'hud/room-detail',
      target: { kind: 'id', id: 'room.cell:4:4' },
    });
    channel.deliver(reply(channel.idOf(1), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));

    await expect(pending).resolves.toEqual({
      unfinishedRooms: 1,
      totalRooms: 1,
      totalNeeds: 2,
      needs: [
        {
          instanceId: 'room.cell:4:4',
          roomLabelKey: 'room.cell.name',
          tile: { x: 4, y: 4 },
          objectLabelKey: 'object.bed.name',
        },
      ],
    });
  });

  it('asks for no detail at all when every room is finished', async () => {
    // One message, not two. The list already answers "nothing is missing", and
    // a detail request for a room with nothing to report is a round trip spent
    // on a question already answered.
    const source = registryOf(cell(4, 4, ['sleep-surface', 'sanitation']));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));

    await expect(pending).resolves.toEqual({ unfinishedRooms: 0, totalRooms: 1, totalNeeds: 0, needs: [] });
    expect(channel.sent).toHaveLength(1);
  });

  it('refuses to stack a second question on a cadence, and leaves the readout alone', async () => {
    // The counts channel publishes up to twice a second and this rides it, so
    // the answer that matters is what a *second* call does while the first is
    // still out: nothing at all, and `undefined` rather than a throw, because
    // the caller is a listener and not a player pressing something.
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const first = reader.read();
    await settle();
    await expect(reader.read()).resolves.toBeUndefined();
    expect(channel.sent, 'a second read while one was in flight sent another request').toHaveLength(1);

    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();
    channel.deliver(reply(channel.idOf(1), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));
    await expect(first).resolves.toBeDefined();

    // And the guard lifts: the next publication really does ask again.
    const second = reader.read();
    await settle();
    expect(channel.sent).toHaveLength(3);
    channel.deliver(reply(channel.idOf(2), 'hud/room-list', list));
    await settle();
    channel.deliver(reply(channel.idOf(3), 'hud/room-detail', projectRoomDetail(source, 'room.cell:4:4')));
    await expect(second).resolves.toBeDefined();
  });

  it('drops a room that went away between the two requests rather than failing the read', async () => {
    // The race `ProjectionReply.view` names: a detail projection asked about a
    // target that no longer exists answers with no view. Unzoning is a gesture
    // the player has, so this is reachable rather than defensive -- and the
    // header's counts still come from the list, which is what the player sees.
    const source = registryOf(cell(4, 4, []));
    const { list } = project(source);
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-gone',
      replyTo: channel.idOf(1),
      kind: 'simulation/projection',
      payload: { projectionId: 'hud/room-detail', tick: 7 },
    } as WorkerToMainMessage);

    await expect(pending).resolves.toEqual({
      unfinishedRooms: 1,
      totalRooms: 1,
      totalNeeds: 2,
      needs: [],
    });
  });

  it('spends its budget in requests as well as in needs, so a prison of raced rooms is not a burst', async () => {
    /*
     * The bound `RoomNeedsReader.read` states -- "at most `1 +
     * ROOM_NEEDS_NAMED_LIMIT` messages" -- was a statement about *needs named*,
     * and the loop advanced that counter only from a detail that came back with
     * a view. So the two cases the method's own next paragraph calls expected --
     * a room unzoned between the list and the detail, and a room finished
     * between them -- left the counter where it was and the loop asked about the
     * next room, and the next, for as many unfinished rooms as the list held.
     * The real bound was `1 + unfinishedRoomIds(list).length`, on a reader the
     * Rooms tab drives on the counts cadence.
     *
     * Eight unfinished cells, every detail answered the way the race answers.
     * The figures are literals rather than `1 + ROOM_NEEDS_NAMED_LIMIT`: the
     * claim under test is the *shape* of the bound, and an expectation written
     * from the reader's own budget would hold whichever quantity it counted,
     * which is the self-comparison `docs/TESTING.md` names. Before this was
     * pinned the same trace sent 9.
     */
    const source = registryOf(
      cell(0, 0, []),
      cell(4, 0, []),
      cell(8, 0, []),
      cell(12, 0, []),
      cell(0, 4, []),
      cell(4, 4, []),
      cell(8, 4, []),
      cell(12, 4, []),
    );
    const { list } = project(source);
    expect(unfinishedRoomIds(list)).toHaveLength(8);

    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver(reply(channel.idOf(0), 'hud/room-list', list));
    await settle();

    // Answer whatever it asks, until it stops asking. The ceiling is a guard
    // against a loop that never terminates, not part of the claim.
    let answered = 1;
    while (answered < channel.sent.length && answered < 32) {
      channel.deliver({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId: `reply-gone-${String(answered)}`,
        replyTo: channel.idOf(answered),
        kind: 'simulation/projection',
        payload: { projectionId: 'hud/room-detail', tick: 7 },
      } as WorkerToMainMessage);
      answered += 1;
      await settle();
    }

    await expect(pending).resolves.toBeDefined();
    // One list and one detail: the panel can name one thing, so the reader
    // spends one question on finding it and reports what it has.
    expect(channel.sent).toHaveLength(2);
  });

  it('rejects when the worker refuses, so the host can take the readout off', async () => {
    const channel = new FakeChannel();
    let next = 0;
    const reader = new RoomNeedsReader(channel, {
      generateMessageId: () => `req-${String((next += 1))}`,
      replyTimeoutMs: 1_000,
    });

    const pending = reader.read();
    await settle();
    channel.deliver({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'reply-error',
      replyTo: channel.idOf(0),
      kind: 'protocol/error',
      payload: { code: 'invalid-payload', message: 'no' },
    } as WorkerToMainMessage);

    await expect(pending).rejects.toThrow(/invalid-payload/);

    // And the in-flight guard is released by the failure, or one refusal would
    // silence the readout for the rest of the session.
    const again = reader.read();
    await settle();
    expect(channel.sent).toHaveLength(2);
    reader.dispose();
    await expect(again).rejects.toThrow(/disposed/);
  });
});
