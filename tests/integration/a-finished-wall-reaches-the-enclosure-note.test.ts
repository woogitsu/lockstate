import { describe, expect, it } from 'vitest';
import { SimulationSnapshotFeed } from '../../src/rendering/feed/simulation-snapshot-feed';
import type { WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { SIMULATION_PROTOCOL_VERSION } from '../../src/simulation/protocol/types';
import { RENDER_DELTA_PUBLISH_INTERVAL_MS } from '../../src/simulation/worker/state-machine';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { LoopbackWorker, TICK_MILLISECONDS } from '../helpers/loopback-simulation-worker';

/**
 * **The sentence that tells a player their rectangle is still open must go
 * false when the walls they paid for are finished -- and it must do so on the
 * same notification the drawn world does.**
 *
 * ## The defect this is the gate for
 *
 * Issue #576, measured in a mouse-driven playtest at 1440x900 and reproduced
 * at 900x600. The player is refused `zone.not-enclosed`, pays for walls to fix
 * it, waits for them to be built, and **is then told the same thing again**:
 *
 * ```
 * queue empty at page t=43395ms (poll 14)
 * t=49406ms (+6011ms after queue empty)   open=true
 * t=55580ms (+12185ms after queue empty)  open=true
 * t=61038ms (+17643ms after queue empty)  open=false
 * ```
 *
 * Three surfaces disagreed and only one was current: the Build panel's queue
 * (a projection, correct), the drawn world (a snapshot, stale) and this note
 * (the same snapshot, stale). Its cause was the one
 * `SimulationSnapshotFeed`'s header now records in the past tense -- a build
 * order completing was not a command, not a clock transition and not the tick
 * a command was scheduled for, so the next world was the thirty-second
 * consistency poll.
 *
 * [ADR 0099](../../docs/adr/0099-how-the-renderer-learns-the-world-changed.md)
 * ended that, and `a-finished-build-reaches-the-drawn-frame.test.ts` is its
 * gate. **That file stops at the frame.** It proves the geometry and its edges
 * arrive, which is the drawn world -- surface two. Nothing asserted that the
 * *note* moved with them, and the note is what refused the player.
 *
 * ## Why the note needs its own case rather than inheriting that one
 *
 * Reading the code, it cannot lag the frame: `RoomTool.classifyArea`
 * (`src/ui/room-tool.ts:156`) is `roomPerimeterEnclosure(this.world, area)`
 * with no memo, `WorldRenderView.getTopEdge` is a direct chunk read whose
 * docblock says it is *deliberately* not routed through `readTile`'s memo, and
 * `WorldScene` hands the newest world over on every rendered frame
 * (`src/rendering/scene/world-scene.ts:763`).
 *
 * **Three links, all currently sound, and a test is what keeps them so.** Any
 * one of them is a plausible future edit -- a memo added to the perimeter walk
 * for the same reason one exists for tile painting, a `setWorld` moved out of
 * the frame loop as an optimisation -- and each would restore #576 while
 * leaving the #1037 gate green, because that gate never reads an edge through
 * the classifier the player's sentence goes through.
 *
 * So this asserts the composition and not the transport: the same feed, the
 * same marker, the same bound, read through `roomPerimeterEnclosure`.
 *
 * ## What it does not claim
 *
 * Not a browser measurement, and therefore not a re-run of #576's own
 * instrument. `environment: 'node'` cannot reach `TileLayer` or the DOM, so
 * this pins when the *classification over the frame* changes and not when the
 * player's sentence is repainted. `RoomTool` itself is not exercised: it is
 * four lines over this function and importing the HUD would drag Phaser in.
 * The gap that leaves is `classifyArea`'s own body, and
 * `tests/browser/app-shell.spec.ts`'s `#331` case is what reads the rendered
 * sentence.
 */

/** A year, so a poll firing would be a bug in this file rather than a slow test. */
const NO_POLL_SECONDS = 31_536_000;

/** The scene's frame loop, which is what calls `readFrame`. */
const FRAMES_PER_SECOND = 60;

const SEED = 0x576;

/**
 * One tile, and its perimeter is four wall segments.
 *
 * A 1x1 rectangle is the smallest shape that exercises **all four** of
 * `roomPerimeterEnclosure`'s boundary walks -- the top row's own north edges,
 * the north edges of the row below, the left column's own west edges and the
 * west edges of the column to its right -- so a fix that reached three of them
 * would still fail here. It is deliberately not a shape the room catalogue
 * would accept (`room.cell`'s authored minimum is 2x3): what is under test is
 * the freshness of the classification, and the minimum-size rule is checked
 * somewhere else entirely.
 *
 * Inside the single chunk a new prison owns and clear of anything else, which
 * is the same tile `a-finished-build-reaches-the-drawn-frame.test.ts` watches
 * its door on.
 */
const CELL = { x: 12, y: 9, width: 1, height: 1 } as const;

/** `CELL`'s perimeter, as the four `wall-brick` orders that close it. */
const PERIMETER = [
  { orderId: 'wall-north', x: CELL.x, y: CELL.y, edge: 'north' as const },
  { orderId: 'wall-south', x: CELL.x, y: CELL.y + 1, edge: 'north' as const },
  { orderId: 'wall-west', x: CELL.x, y: CELL.y, edge: 'west' as const },
  { orderId: 'wall-east', x: CELL.x + 1, y: CELL.y, edge: 'west' as const },
] as const;

/** ADR 0099's bound on how long a drawn change may take to reach the frame. */
const BOUND_MILLISECONDS = 200;

/**
 * Eight bricks are needed -- `wall-brick` consumes two
 * (`src/simulation/construction/definition.ts:89`) -- and sixteen are bought,
 * so a shortfall cannot be what this test measures.
 */
const BRICKS_BOUGHT = 16;

function prisonWithACellWalled(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const submit = (id: string, payload: ReturnType<typeof packCommand>): void => {
    runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
    runtime.kernel.step();
  };
  submit(
    'buy-bricks',
    packCommand({ type: 'PurchaseMaterials', orderId: 'buy-bricks', itemId: 'item.brick', quantity: BRICKS_BOUGHT }),
  );
  for (const wall of PERIMETER) {
    submit(
      wall.orderId,
      packCommand({
        type: 'PlaceBuildOrder',
        orderId: wall.orderId,
        definitionId: 'wall-brick',
        x: wall.x,
        y: wall.y,
        edge: wall.edge,
        transactionId: 'gesture-cell-perimeter',
      }),
    );
  }
  return runtime;
}

describe("a finished wall reaches the enclosure note, not just the drawn frame (#576, ADR 0099)", () => {
  it("flips the note from open to sealed within ADR 0099's bound of the last wall finishing", () => {
    const runtime = prisonWithACellWalled();
    expect(runtime.refusals.count, 'no command may be refused, or this watches an empty perimeter').toBe(0);

    const worker = new LoopbackWorker(runtime);
    const errors: Error[] = [];
    let messageCounter = 0;
    const feed = new SimulationSnapshotFeed(worker, {
      pollIntervalSeconds: NO_POLL_SECONDS,
      generateMessageId: () => `enclosure-${String((messageCounter += 1))}`,
      onError: (error) => errors.push(error),
    });

    // The one `dirty` mark this file allows itself, spent before the first
    // tick. Nothing after this line puts a `command-result`, a clock
    // transition or a poll on the wire, so the marker is the only thing left
    // that can move what the classification below reads.
    worker.emit({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'worker-ready',
      replyTo: 'init',
      kind: 'simulation/ready',
      payload: { sessionId: 'session-576', tick: runtime.kernel.tick, clock: { mode: 'running', speed: 1 } },
    } as unknown as WorkerToMainMessage);

    let nowMilliseconds = 0;
    const readNote = (atMilliseconds: number): 'sealed' | 'open' =>
      roomPerimeterEnclosure(feed.readFrame(atMilliseconds / 1_000).world, CELL).enclosure;

    // Non-vacuous from the first line: the player's sentence is true right
    // now. Four walls are ordered and none is built, so the rectangle is open.
    expect(readNote(nowMilliseconds), 'the note must start out saying the rectangle is open').toBe('open');

    /** When the simulation finished the last of the four walls. */
    let sealedOwedAt: number | undefined;
    /** When the frame first classified the rectangle as sealed, and after how long. */
    let noteSealedLag: number | undefined;

    // 1,200 ticks is sixty seconds of simulation: past the delivery delay and
    // four walls of 50 work units each, with room to spare. Not a boundary of
    // anything, and the assertions below fail on the lag rather than on this.
    for (let tick = 0; tick < 1_200 && noteSealedLag === undefined; tick += 1) {
      runtime.kernel.step();
      nowMilliseconds += TICK_MILLISECONDS;

      // Read from the simulation, so this is the moment the note is *owed*
      // rather than a guess at it.
      if (
        sealedOwedAt === undefined &&
        PERIMETER.every((wall) => runtime.construction.getOrder(wall.orderId)?.state === 'completed')
      ) {
        sealedOwedAt = nowMilliseconds;
      }

      // The worker's own gate: a tick has moved, and 100 ms is two ticks.
      if (nowMilliseconds % RENDER_DELTA_PUBLISH_INTERVAL_MS === 0) worker.publishDelta();

      for (let frame = 0; frame < FRAMES_PER_SECOND / (1_000 / TICK_MILLISECONDS); frame += 1) {
        const at = nowMilliseconds + (frame * 1_000) / FRAMES_PER_SECOND;
        if (readNote(at) !== 'sealed') continue;
        expect(sealedOwedAt, 'the note said sealed before the simulation finished the walls').not.toBeUndefined();
        noteSealedLag = at - (sealedOwedAt ?? 0);
        break;
      }
    }

    expect(errors, 'no message may be refused along the way').toEqual([]);

    // The simulation really did finish them, so a `sealed` note is owed rather
    // than merely absent.
    for (const wall of PERIMETER) {
      expect(runtime.construction.getOrder(wall.orderId)?.state, `${wall.orderId} never finished`).toBe('completed');
    }

    expect(noteSealedLag, 'the note never went false, so #576 is back').not.toBeUndefined();
    expect(
      noteSealedLag ?? Number.POSITIVE_INFINITY,
      `the note kept saying "open" for ${String(noteSealedLag)} ms after the last wall was built`,
    ).toBeLessThan(BOUND_MILLISECONDS);

    // And it stays sealed: a later frame must not read the rectangle open
    // again, which a world replaced by a stale capture would do.
    expect(readNote(nowMilliseconds + 5_000), 'the note went back to saying the rectangle is open').toBe('sealed');
  }, 60_000);
});
