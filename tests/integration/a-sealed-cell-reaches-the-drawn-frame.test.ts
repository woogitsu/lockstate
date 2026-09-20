import { describe, expect, it } from 'vitest';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import { planRoomConditionMarks } from '../../src/rendering/world/room-condition-marks';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  RENDER_ROOM_CONDITION_DOORWAY,
  RENDER_ROOM_CONDITION_NO_WAY_IN,
} from '../../src/simulation/protocol/render-actors-payload';
import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { collectRoomConditions } from '../../src/simulation/worker/room-conditions';
import { encodeRenderActorsKeyframe } from '../../src/simulation/worker/render-actors-keyframe';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { LoopbackWorker } from '../helpers/loopback-simulation-worker';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A sealed cell and a working one now reach the drawn frame as two
 * different rooms** — issue #1022, ADR 0097's accepted option A carried over
 * ADR 0111's accepted option A.
 *
 * ## The defect this is the gate for
 *
 * `docs/research/2026-09-05-what-the-world-shows.md` measured a sealed cell
 * against a working one — same tiles, same crop, same population, same
 * `roomCapacity` — at **6,061 differing pixels of 147,456 (4.11%)**, of which
 * **3,072 are the door**. Everything the world view had to say about whether
 * either room worked was the door sprite. `RenderFrame` carried three data
 * fields (`world`, `structures`, `actors`) and no room instance at all, so no
 * mark keyed by room instance could be drawn even in principle.
 *
 * ## What this pins, and on which side of the boundary
 *
 * Both halves of the transport, end to end and through production code:
 *
 * - the **rectangles**, on the geometry pull (ADR 0111 decision 1), from a
 *   real `captureSessionSnapshot` through `roomsFromSnapshot` onto
 *   `RenderFrame.rooms`;
 * - the **condition ordinals**, on the delta channel (ADR 0097 decision 2,
 *   restated by ADR 0111 decision 2), from the production collector through
 *   the production keyframe encoder and the production decoder onto
 *   `RenderFrame.roomConditions`.
 *
 * `LoopbackWorker` assembles the two envelopes the way the worker assembles
 * them and computes neither payload itself, for the reason its own header
 * gives: a fake that computed the ordinals would prove only that the feed
 * reads what the fake put there.
 *
 * It does **not** claim a pixel. `RoomConditionLayer` is Phaser and
 * `environment: 'node'` cannot reach it; what is asserted here is the plan the
 * layer strokes, which is the same split
 * `a-finished-build-reaches-the-drawn-frame.test.ts` states for #1037.
 */

const SEED = 0x1022;
/** Two 2x3 cells sharing nothing, inside the single chunk a new prison owns. */
const WORKING_CELL = { x: 4, y: 4, width: 2, height: 3 } as const;
const SEALED_CELL = { x: 8, y: 4, width: 2, height: 3 } as const;

function prisonWithOneSealedCell(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const submit = (id: string, payload: ReturnType<typeof packCommand>): void => {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
    runtime.kernel.step();
  };

  // The one edge the two cells differ by: a registered door, or none.
  wallRoomPerimeter(runtime.world, WORKING_CELL, { doors: runtime.navigation.doors });
  wallRoomPerimeter(runtime.world, SEALED_CELL, {});

  submit('zone-working', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...WORKING_CELL }));
  submit('zone-sealed', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...SEALED_CELL }));
  expect(runtime.refusals.count, 'the fixture must zone the two cells it says it zones').toBe(0);
  return runtime;
}

describe('a sealed cell and a working one reach the drawn frame as two different rooms (#1022)', () => {
  it('carries both rectangles and exactly one warning, and marks only the sealed cell', () => {
    const runtime = prisonWithOneSealedCell();
    const worker = new LoopbackWorker(runtime);
    const errors: Error[] = [];
    let messageCounter = 0;
    const feed = new SimulationSnapshotFeed(worker, {
      generateMessageId: () => `render-${String((messageCounter += 1))}`,
      onError: (error) => errors.push(error),
    });

    worker.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'worker-ready',
      replyTo: 'init',
      kind: 'simulation/ready',
      payload: { sessionId: 'session-1022', tick: runtime.kernel.tick, clock: { mode: 'running', speed: 1 } },
    } as unknown as WorkerToMainMessage);

    // The geometry pull: ADR 0111 decision 1's channel.
    feed.readFrame(0);
    const withGeometry = feed.readFrame(0.016);
    expect(errors, 'nothing may be reported while reading a well-formed snapshot').toEqual([]);
    expect(
      [...withGeometry.rooms].map((room) => [room.instanceId, room.anchorTileX, room.anchorTileY, room.width, room.height]),
      'both cells must arrive as rectangles, keyed by their own instance ids',
    ).toEqual([
      ['room.cell:4:4', 4, 4, 2, 3],
      ['room.cell:8:4', 8, 4, 2, 3],
    ]);
    expect(withGeometry.roomConditions, 'a snapshot carries no condition').toEqual([]);
    expect(planRoomConditionMarks(withGeometry.rooms, withGeometry.roomConditions)).toEqual([]);

    // The delta: ADR 0097 decision 2's channel.
    runtime.kernel.step();
    worker.publishDelta();
    const withCondition = feed.readFrame(0.032);
    expect(
      [...withCondition.roomConditions],
      'the worker must answer for both rooms, and differently',
    ).toEqual([
      { anchorTileX: 4, anchorTileY: 4, condition: RENDER_ROOM_CONDITION_DOORWAY },
      { anchorTileX: 8, anchorTileY: 4, condition: RENDER_ROOM_CONDITION_NO_WAY_IN },
    ]);
    expect(withCondition.rooms.length, 'a delta must not disturb the rectangles').toBe(2);

    const marks = planRoomConditionMarks(withCondition.rooms, withCondition.roomConditions);
    expect(marks.map((mark) => mark.instanceId), 'exactly one of two identical-looking cells is marked').toEqual([
      'room.cell:8:4',
    ]);
    expect(marks[0]).toEqual({
      instanceId: 'room.cell:8:4',
      tileX: SEALED_CELL.x,
      tileY: SEALED_CELL.y,
      width: SEALED_CELL.width,
      height: SEALED_CELL.height,
      condition: RENDER_ROOM_CONDITION_NO_WAY_IN,
    });
  });

  /**
   * What the channel costs, measured rather than estimated, because ADR 0111
   * §7 declined to estimate it: *"the payload size of a rectangle set is
   * arithmetic, not measurement"*.
   */
  it('costs twelve bytes a room on the delta and nothing at all on the geometry pull', () => {
    const runtime = prisonWithOneSealedCell();
    const rows = collectRoomConditions(runtime);
    expect(rows.length).toBe(2);

    const withoutRooms = encodeRenderActorsKeyframe(runtime.prisoners, 20, runtime.world.drawnWorldRevision, runtime.securityGuards);
    const withRooms = encodeRenderActorsKeyframe(
      runtime.prisoners,
      20,
      runtime.world.drawnWorldRevision,
      runtime.securityGuards,
      rows,
    );
    // An empty prison publishes a 24-byte header and nothing else; two rooms
    // add two three-word rows.
    expect(withoutRooms.byteLength).toBe(24);
    expect(withRooms.byteLength - withoutRooms.byteLength).toBe(24);
    expect(withRooms.byteLength).toBe(48);

    // The rectangles ride bytes the bundle already carried: `captureSessionSnapshot`
    // has written these rows into every snapshot and every save since room
    // bounds were recorded, so ADR 0111 option A's transport costs no bytes.
    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.simulation?.prisoners.roomInstanceDefinitions).toEqual([
      { instanceId: 'room.cell:4:4', roomCatalogId: 'room.cell', anchorTile: { x: 4, y: 4 }, width: 2, height: 3 },
      { instanceId: 'room.cell:8:4', roomCatalogId: 'room.cell', anchorTile: { x: 8, y: 4 }, width: 2, height: 3 },
    ]);
  });
});
