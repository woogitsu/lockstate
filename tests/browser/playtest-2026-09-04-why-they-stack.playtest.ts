/**
 * **Why does the simulation stack twenty-two prisoners on one tile?**
 * (issue #944 §3, the half that must be answered before any draw-order change.)
 *
 * The `can-i-see-my-prison` round of 2026-09-04 measured 22 prisoners and 6
 * guards standing on two tiles -- 6 prisoners on (12,12), 16 prisoners plus
 * every guard on (16,16) -- and drew exactly two figures. The rendering half of
 * that is diagnosed (co-located actors get identical depth; the guard is built
 * last and therefore always wins). This instrument answers the *other* half,
 * and it is deliberately a measurement rather than a fix: nothing under `src/`
 * is touched by this branch.
 *
 * ## The hypothesis it was written to test, and why it is not the shape of the
 * ## answer
 *
 * The same reading showed `16 with no bed` on the rail, so the hypothesis put
 * to this pass was *"a prisoner with nowhere to go appears to stand at the
 * point of arrival."* That is a claim about the sixteen. It says nothing about
 * the six who **did** have a bed and were **also** on one tile, and it predicts
 * that giving everybody a bed would unstack them.
 *
 * So the three acts are a differential over exactly that prediction, played in
 * shipped code with no mutation anywhere:
 *
 * - **act 1** -- fewer beds than prisoners (2 beds, 6 prisoners). Both stacks
 *   should exist at once, in one prison, and their sizes should be the bed
 *   count and the remainder.
 * - **act 2** -- a bed for everybody (6 beds, 6 prisoners). This is the
 *   discriminating comparison: if the hypothesis is the answer, six prisoners
 *   with six beds stand on six tiles.
 * - **act 3** -- act 2's prison, and then the bed standing on the tile they are
 *   all on is **removed under them**. Nothing about the room changes; the tile
 *   simply stops having a sleep surface on it. That is what separates "they
 *   stand on their bed" from "they stand on the room".
 *
 * ## Two channels, read separately, and neither of them the DOM
 *
 * `docs/AGENT_WORKFLOW.md` §3 wants a reading cross-checked before it is
 * believed, and this question has already cost one run a false negative: the
 * previous pass's actor tee read `payload.payload.body` instead of
 * `payload.delta.data`, threw nothing, and reported an empty prison. So:
 *
 * 1. **The render-actors keyframe** (`installActorTee` below) -- the same
 *    channel `ActorLayer` draws from, decoded from the bytes. The envelope path
 *    and every field offset were re-opened for this file:
 *    `deltaMessageSchema` (`src/simulation/protocol/types.ts:538-559`) carries
 *    `{ baseTick, tick, delta }` and `delta` is an `arrayBufferPayloadSchema`
 *    whose buffer member is `data` (`:73-82`);
 *    `RenderActorsKeyframeWriter.writeRecord`
 *    (`src/simulation/protocol/render-actors-payload.ts:303-314`) writes
 *    `u32 entityId`, `u32 packedFields`, `i32 subX`, `i32 subY`, `i16 vx`,
 *    `i16 vy` after a four-word header (`:120-124`), at 256 sub-tile units to a
 *    tile (`:134`).
 * 2. **The `hud/prisoner-roster` projection** (`rosterRows` below), asked for
 *    on this instrument's own `messageId` rather than the HUD's. Same component
 *    arrays, an entirely different reader
 *    (`projectRosterRow`, `src/simulation/presentation/prisoner-projection.ts:331-366`),
 *    and it carries the three fields that turn a position into a reason:
 *    `actionPhase`, `currentActionId` and `accommodation.instanceId`. An
 *    uncorrelated `replyTo` settles nothing in the app's own requester
 *    (`src/ui/simulation-projections.ts:133-136`), so injecting a request
 *    cannot disturb the page.
 *
 * **What could not be read, and it is the diagnostic for this exact state.**
 * `ActionMetrics.unmetDemandCycles` -- *"cycles where no legal action had a
 * reachable, available target"* (`src/simulation/prisoners/action-system.ts`)
 * -- crosses no boundary at all: outside its own module the only occurrences of
 * the identifier under `src/` are two comments. Issue #930 is confirmed rather
 * than measured around, and this instrument reads the phase instead.
 *
 * **Positions here are read off the worker and never off pixels.** This branch
 * is a worktree, Git LFS is not provisioned in this container, and the actor
 * atlases are therefore ~131-byte pointer files -- a run in this tree draws no
 * actor sprites at all and passes anyway. Nothing below screenshots the world
 * or asserts anything about it.
 *
 * Nothing in CI collects this file: `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the
 * config that matches `*.playtest.ts`. Findings live in
 * `docs/research/2026-09-04-why-they-stack.md`.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=43505 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-why-they-stack.playtest.ts -g "act 1"
 * ```
 */
import { test, type Page } from '@playwright/test';

import {
  buildAndPopulate,
  centreOf,
  currentTick,
  installTee,
  latestCounts,
  openApp,
  press,
  runUntilTick,
  tab,
  TILE,
} from './playtest-harness';

/* ------------------------------------------------------------------ */
/* channel 1: the render-actors keyframe                               */
/* ------------------------------------------------------------------ */

interface ActorRow {
  readonly id: number;
  readonly population: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

interface ActorSample {
  readonly tick: number;
  readonly actors: readonly ActorRow[];
}

/**
 * A second tee for the one message kind `playtest-harness`'s tee deliberately
 * drops.
 *
 * `installTee` skips `simulation/delta` so its array cannot grow without bound,
 * and that is the only channel carrying where the actors are (ADR 0040 slice 1
 * moved the live population off the snapshot and onto an `array-buffer`
 * keyframe). This decodes each keyframe as it lands and keeps the rows.
 *
 * Two guards this file adds over the previous pass's version, both because a
 * wrong reading here is indistinguishable from an empty prison: the
 * `contentType` is checked against `RENDER_ACTORS_CONTENT_TYPE`
 * (`render-actors-payload.ts:103`) rather than assuming every
 * `simulation/delta` is an actor keyframe, and a body that fails to decode is
 * *counted* rather than swallowed, so "no samples" and "samples nobody could
 * read" cannot be mistaken for each other.
 *
 * Install it **after** `installTee`: each init script captures whatever
 * `window.Worker` is when it runs, so the two wrappers chain in that order.
 */
async function installActorTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const HEADER_WORDS = 4;
    const RECORD_WORDS = 5;
    const WORD = 4;
    const SUBTILE = 256;
    const CONTENT_TYPE = 'application/x-lockstate-render-actors';
    const samples: ActorSample[] = [];
    const rejected = { wrongContentType: 0, undecodable: 0 };
    /*
     * **The projection replies have to be collected here, and that is a
     * measured instrument failure rather than a design choice.** The first run
     * of this file read them out of `installTee`'s `lockstateFromWorker` and
     * timed out after 20 s on a page that had answered immediately: that tee
     * drops `simulation/projection` along with `simulation/delta` and
     * `simulation/snapshot`, to keep its array bounded
     * (`playtest-harness.ts`'s `installTee`). So the reply genuinely never
     * reached the array being polled, and "the worker did not answer" was a
     * statement about the tee.
     */
    const projections: unknown[] = [];
    (window as unknown as { lockstateActorSamples: ActorSample[] }).lockstateActorSamples = samples;
    (window as unknown as { lockstateActorRejects: typeof rejected }).lockstateActorRejects = rejected;
    (window as unknown as { lockstateProjectionReplies: unknown[] }).lockstateProjectionReplies = projections;

    const RealWorker = Worker;
    class ActorTeeWorker extends RealWorker {
      public constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        (window as unknown as { lockstateWorker?: Worker }).lockstateWorker = this;
        super.addEventListener('message', (event: MessageEvent) => {
          const message = event.data as {
            kind?: string;
            payload?: { tick?: number; delta?: { contentType?: string; data?: ArrayBuffer } };
          };
          if (message.kind === 'simulation/projection') {
            projections.push(event.data);
            if (projections.length > 32) projections.splice(0, projections.length - 32);
            return;
          }
          if (message.kind !== 'simulation/delta') return;
          const delta = message.payload?.delta;
          if (delta?.contentType !== CONTENT_TYPE) {
            rejected.wrongContentType += 1;
            return;
          }
          const body = delta.data;
          if (!(body instanceof ArrayBuffer)) {
            rejected.undecodable += 1;
            return;
          }
          try {
            const view = new DataView(body);
            const recordCount = view.getUint32(2 * WORD, true);
            const actors: ActorRow[] = [];
            for (let record = 0; record < recordCount; record += 1) {
              const offset = (HEADER_WORDS + record * RECORD_WORDS) * WORD;
              const packed = view.getUint32(offset + WORD, true);
              actors.push({
                id: view.getUint32(offset, true),
                population: packed & 0xff,
                x: view.getInt32(offset + 2 * WORD, true) / SUBTILE,
                y: view.getInt32(offset + 3 * WORD, true) / SUBTILE,
                vx: view.getInt16(offset + 4 * WORD, true) / SUBTILE,
                vy: view.getInt16(offset + 4 * WORD + 2, true) / SUBTILE,
              });
            }
            samples.push({ tick: message.payload?.tick ?? -1, actors });
            if (samples.length > 400) samples.splice(0, samples.length - 400);
          } catch {
            rejected.undecodable += 1;
          }
        });
      }
    }
    (window as unknown as { Worker: typeof Worker }).Worker = ActorTeeWorker as unknown as typeof Worker;
  });
}

async function actorSamples(page: Page): Promise<readonly ActorSample[]> {
  return page.evaluate(() => (window as unknown as { lockstateActorSamples?: ActorSample[] }).lockstateActorSamples ?? []);
}

async function actorRejects(page: Page): Promise<{ wrongContentType: number; undecodable: number }> {
  return page.evaluate(
    () =>
      (window as unknown as { lockstateActorRejects?: { wrongContentType: number; undecodable: number } }).lockstateActorRejects ?? {
        wrongContentType: -1,
        undecodable: -1,
      },
  );
}

async function latestActors(page: Page): Promise<ActorSample | undefined> {
  const samples = await actorSamples(page);
  return samples[samples.length - 1];
}

/** Tile -> how many actors of each population are standing on it. */
function tally(sample: ActorSample | undefined): string {
  if (sample === undefined) return 'NO KEYFRAME AT ALL';
  const byTile = new Map<string, { prisoners: number; guards: number }>();
  for (const actor of sample.actors) {
    const key = `${actor.x.toFixed(2)},${actor.y.toFixed(2)}`;
    const entry = byTile.get(key) ?? { prisoners: 0, guards: 0 };
    if (actor.population === 0) entry.prisoners += 1;
    else entry.guards += 1;
    byTile.set(key, entry);
  }
  const moving = sample.actors.filter((a) => a.vx !== 0 || a.vy !== 0).length;
  const rows = [...byTile.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, entry]) => `    (${key}): ${entry.prisoners} prisoner(s), ${entry.guards} guard(s)`);
  return (
    `tick ${sample.tick}: ${sample.actors.length} actor(s) on ${byTile.size} distinct tile(s), ${moving} with a non-zero velocity\n` +
    rows.join('\n')
  );
}

/* ------------------------------------------------------------------ */
/* channel 2: the hud/prisoner-roster projection                       */
/* ------------------------------------------------------------------ */

interface RosterRow {
  readonly entityId: number;
  readonly intakeStage: string;
  readonly tile: { readonly x: number; readonly y: number };
  readonly actionPhase: string;
  readonly currentActionId?: string;
  readonly accommodation?: { readonly instanceId: string };
}

/**
 * Asks the worker for `hud/prisoner-roster` on this instrument's own
 * `messageId` and reads the reply out of the harness tee's received array.
 *
 * The envelope is `requestProjectionMessageSchema`
 * (`src/simulation/protocol/types.ts:407-422`): `protocolVersion` is the
 * literal `SIMULATION_PROTOCOL_VERSION`, which is `1` (`:9`), and `messageId`
 * must match `identifierSchema`'s `/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/` (`:52-56`).
 * Optional keys are spread rather than passed as `undefined`, because the
 * payload is `.strict()`.
 */
async function rosterRows(page: Page, label: string): Promise<readonly RosterRow[]> {
  return page.evaluate(async (probeLabel: string) => {
    const worker = (window as unknown as { lockstateWorker?: Worker }).lockstateWorker;
    if (worker === undefined) throw new Error('the actor tee never saw a Worker constructed');
    const received = (window as unknown as { lockstateProjectionReplies?: unknown[] }).lockstateProjectionReplies ?? [];
    const messageId = `whytheystack.${probeLabel}.${String(Date.now())}`;
    worker.postMessage({
      protocolVersion: 1,
      messageId,
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/prisoner-roster', offset: 0, limit: 64 },
    });
    const deadline = Date.now() + 20_000;
    for (;;) {
      for (const message of received) {
        const envelope = message as { kind?: string; replyTo?: string; payload?: { view?: { data?: { rows?: unknown[] } } } };
        if (envelope.replyTo !== messageId) continue;
        if (envelope.kind !== 'simulation/projection') throw new Error(`the worker answered a roster request with ${String(envelope.kind)}`);
        return (envelope.payload?.view?.data?.rows ?? []) as RosterRow[];
      }
      if (Date.now() > deadline) throw new Error('no reply to the roster projection request within 20s');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }, label);
}

function describeRoster(rows: readonly RosterRow[]): string {
  const byTile = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.tile.x},${row.tile.y}`;
    byTile.set(key, (byTile.get(key) ?? 0) + 1);
  }
  const lines = rows.map(
    (row) =>
      `    #${row.entityId} at (${row.tile.x},${row.tile.y}) stage=${row.intakeStage} phase=${row.actionPhase}` +
      ` action=${row.currentActionId ?? 'NONE'} accommodation=${row.accommodation?.instanceId ?? 'NONE'}`,
  );
  const tiles = [...byTile.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `(${key})x${count}`);
  return `${rows.length} row(s) on ${byTile.size} distinct tile(s): ${tiles.join(' ')}\n${lines.join('\n')}`;
}

/**
 * The two channels printed side by side, never mixed into one sentence.
 *
 * `docs/AGENT_WORKFLOW.md` is explicit that a claim read off two channels is
 * reported as two readings; the tick each carries is its own.
 */
async function readBothChannels(page: Page, label: string): Promise<{ actors: ActorSample | undefined; roster: readonly RosterRow[] }> {
  const actors = await latestActors(page);
  const roster = await rosterRows(page, label);
  console.log(`[${label}] channel 1, the render-actors keyframe: ${tally(actors)}`);
  console.log(`[${label}] channel 1 rejects: ${JSON.stringify(await actorRejects(page))}`);
  console.log(`[${label}] channel 2, hud/prisoner-roster at tick ${await currentTick(page)}: ${describeRoster(roster)}`);
  return { actors, roster };
}

/* ------------------------------------------------------------------ */
/* admitting the number of prisoners this act needs                    */
/* ------------------------------------------------------------------ */

/**
 * Presses Admit until the worker's own count reaches `target`, and says how
 * many presses that took.
 *
 * **Not tidiness: `buildAndPopulate`'s straight run of `admits` presses does
 * not produce `admits` prisoners, measured on this instrument's first run.**
 * Six presses produced three prisoners, and the page said why in its own
 * console -- two of them threw
 * `"The simulation has not reported its command sequence yet; try again in a
 * moment."` out of `SimulationCommandSender.submit`
 * (`src/ui/simulation-commands.ts`), which is the sequence echo the sender
 * needs before it will submit. A press inside that window submits nothing at
 * all. That is a finding about the Admit control rather than about this
 * question, and it is recorded rather than worked around silently: the retry
 * loop below exists so that an act's population is the number it says.
 */
async function admitUntil(page: Page, target: number, label: string): Promise<void> {
  await tab(page, 'overview').click({ timeout: 15_000 });
  let presses = 0;
  for (;;) {
    const counts = await latestCounts(page);
    const alive = counts?.prisoners ?? 0;
    if (alive >= target) {
      console.log(`[${label}] ${alive} prisoner(s) alive after ${presses} extra Admit press(es)`);
      return;
    }
    if (presses >= 3 * target) {
      console.log(`[${label}] gave up at ${alive} prisoner(s) after ${presses} extra Admit press(es)`);
      return;
    }
    presses += 1;
    await page.locator('.hud-intake__admit').click({ timeout: 20_000 });
    await page.waitForTimeout(400);
  }
}

/* ------------------------------------------------------------------ */
/* the acts                                                           */
/* ------------------------------------------------------------------ */

/**
 * Both tees, in the order that makes them chain, then the app.
 *
 * `installTee` first: `installActorTee` extends whatever `window.Worker` is
 * when its init script runs, so the harness tee has to be the thing it
 * extends or one of the two disappears.
 */
async function arrive(page: Page): Promise<void> {
  await installTee(page);
  await installActorTee(page);
  await openApp(page);
}

test('act 1: fewer beds than prisoners -- where does each half stand', async ({ page }) => {
  await arrive(page);
  await buildAndPopulate(page, { beds: 2, admits: 6, guards: 0, label: 'act1' });
  await admitUntil(page, 6, 'act1');

  // Long enough for intake to run its scheduled stages and for whoever can
  // take an action to have taken one. The clock is already at x4 from
  // `buildAndPopulate`'s `fastForwardToMax`.
  const from = await currentTick(page);
  await runUntilTick(page, from + 4000);

  const counts = await latestCounts(page);
  console.log(
    `[act1] counts at tick ${counts?.tick}: prisoners=${counts?.prisoners} accommodationCapacity=${counts?.accommodationCapacity}` +
      ` roomOccupants=${counts?.roomOccupants} rooms=${counts?.rooms}`,
  );
  console.log(`[act1] the rail's own no-place readout: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  await readBothChannels(page, 'act1');

  // And again a thousand ticks later, so that "this is where they stay" is two
  // readings rather than one.
  await runUntilTick(page, (await currentTick(page)) + 1200);
  await readBothChannels(page, 'act1-again');
});

test('act 2: a bed for everybody -- the discriminating comparison', async ({ page }) => {
  await arrive(page);
  await buildAndPopulate(page, { beds: 6, admits: 6, guards: 0, label: 'act2' });
  await admitUntil(page, 6, 'act2');

  const from = await currentTick(page);
  await runUntilTick(page, from + 4000);

  const counts = await latestCounts(page);
  console.log(
    `[act2] counts at tick ${counts?.tick}: prisoners=${counts?.prisoners} accommodationCapacity=${counts?.accommodationCapacity}` +
      ` roomOccupants=${counts?.roomOccupants} rooms=${counts?.rooms}`,
  );
  console.log(`[act2] the rail's own no-place readout: ${await page.locator('.hud-intake__no-place').getAttribute('data-without-place')}`);
  await readBothChannels(page, 'act2');
  await runUntilTick(page, (await currentTick(page)) + 1200);
  await readBothChannels(page, 'act2-again');
});

test('act 3: take the bed off the anchor tile and see whether anybody moves', async ({ page }) => {
  await arrive(page);
  /*
   * **Act 2's prison exactly, and that is the point.** The first version of
   * this act built a bedless cell and placed six beds itself on rows 14 and 16;
   * it never got that far, because `waitForQueueEmpty` answered
   * *"the queue is empty"* five seconds after twenty-four wall orders -- the
   * Build panel's queue readout was `not laid out` and the helper treats that
   * as empty (`playtest-harness.ts`) -- and the zoning that followed was then
   * refused *"open on at least one side"* eleven times over ten minutes. That
   * is the same instrument failure the previous pass recorded as its §9.1, hit
   * from the other end, and it is recorded here rather than worked around
   * because it cost this act a run.
   *
   * So this act reuses the one build sequence that has been measured working
   * twice today and changes the prison **after** it is populated, which is a
   * within-run differential in one prison rather than a comparison across two.
   */
  const origin = await buildAndPopulate(page, { beds: 6, admits: 6, guards: 0, label: 'act3' });
  await admitUntil(page, 6, 'act3');
  await runUntilTick(page, (await currentTick(page)) + 4000);

  console.log('[act3] --- BEFORE: six prisoners, six beds, one of them standing on the room anchor tile (12,12) ---');
  const before = await readBothChannels(page, 'act3-before');

  /*
   * `buildAndPopulate` places its beds along row 12 from column 12, so the
   * first one stands on **(12,12)** -- which is also the rectangle's anchor and
   * the tile the registry mints the instance id from (`roomInstanceIdFor`,
   * `src/simulation/rooms/zoning.ts:404`, and the roster's own
   * `accommodation=room.cell:12:12` above). Removing that one bed leaves five
   * beds on (13,12)..(17,12) and **no sleep surface at all on (12,12)**.
   *
   * If the prisoners are standing on a bed, this is the moment somebody moves.
   */
  await tab(page, 'build').click({ timeout: 15_000 });
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  const anchor = centreOf(origin, 12, 12);
  const removal = await press(page, anchor.x, anchor.y);
  console.log(`[act3] press on the anchor tile (12,12) at (${anchor.x},${anchor.y}) produced ${JSON.stringify(removal)}`);
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  await runUntilTick(page, (await currentTick(page)) + 2000);

  const counts = await latestCounts(page);
  console.log(
    `[act3] counts after removing the anchor bed, tick ${counts?.tick}: roomCapacity=${counts?.roomCapacity}` +
      ` accommodationCapacity=${counts?.accommodationCapacity} roomOccupants=${counts?.roomOccupants}`,
  );
  console.log('[act3] --- AFTER: the same six prisoners, five beds, none of them on (12,12) ---');
  const after = await readBothChannels(page, 'act3-after');

  const tiles = (rows: readonly RosterRow[]) => new Set(rows.map((r) => `${r.tile.x},${r.tile.y}`));
  console.log(
    `[act3] the differential: before, ${before.roster.length} prisoner(s) on ${[...tiles(before.roster)].join(' ')};` +
      ` after, ${after.roster.length} on ${[...tiles(after.roster)].join(' ')}`,
  );
  console.log(`[act3] world origin was (${origin.originX},${origin.originY}); one tile is ${TILE}px`);
});
