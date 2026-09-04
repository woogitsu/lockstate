/**
 * **The standing crowd: why are twenty-eight people on two tiles, and what does
 * it cost?**
 *
 * The `can-i-see-my-prison` round of 2026-09-04 (v0.0.451) read **22 prisoners
 * and 6 guards on two tiles** — `6 x "12.00,12.00"` and `16 prisoners + 6
 * guards x "16.00,16.00"` — in a prison with `16 with no bed` and two riots
 * running. `docs/research/2026-09-04-why-they-stack.md` (v0.0.458) then
 * answered the *prisoner* half: a prisoner's tile is written on admission, per
 * tile crossed, and on arrival at a room instance's `anchorTile`, and nowhere
 * else. This instrument is the next pass, at **v0.0.470**, and it is
 * deliberately about the four things that record named as unreached or out of
 * scope:
 *
 * - **the whole crowd, not the prisoner half.** Six guards are on one of those
 *   tiles too, and `deriveDefaultSecuritySectorPostTile`
 *   (`src/simulation/security/default-sector.ts:194-201`) puts the default
 *   sector's post on the middle of the first owned chunk — tile (16,16) of a
 *   32-tile world, the same tile as `NEW_PRISON_ORIGIN_TILE`
 *   (`src/main.ts:621`). Act 1 admits 22 and hires 6 and accounts for every
 *   body on every tile, so that `22 = 16 + 6` is measured rather than assumed.
 * - **the riot, and which way the arrow points.** Act 1 reads the worker's own
 *   `simulation/event` log beside the keyframes, so "the stack was already
 *   this size at tick N and the first riot opened at tick M" is two numbers
 *   rather than an impression.
 * - **the threshold.** Act 2 admits into a fully-bedded prison **one prisoner
 *   at a time**, reading the tile tally after each, so "at what population
 *   does the crowd start" is a curve and not a guess. It is the act that
 *   answers whether overcrowding is needed at all.
 * - **whether anybody ever leaves.** Act 3 takes a prison with both stacks in
 *   it and removes *every* bed, so that the six who are standing on the room
 *   anchor no longer have a room to be in. If the position is only ever
 *   written on arrival, nobody moves — and the tile then means "the last place
 *   an action worked", which is a stronger statement than "the room".
 *
 * ## Two channels, plus a third that the earlier passes did not keep
 *
 * 1. **The render-actors keyframe**, decoded from the bytes — the channel
 *    `ActorLayer` draws from. Field offsets re-opened for this file against
 *    `RenderActorsKeyframeWriter.writeRecord`
 *    (`src/simulation/protocol/render-actors-payload.ts`): a four-word header
 *    then `u32 entityId`, `u32 packedFields`, `i32 subX`, `i32 subY`,
 *    `i16 vx`, `i16 vy`, at 256 sub-tile units to a tile.
 * 2. **The `hud/prisoner-roster` projection**, asked for on this instrument's
 *    own `messageId` — a different reader over the same component arrays,
 *    carrying `actionPhase`, `currentActionId` and `accommodation.instanceId`.
 * 3. **A whole-run aggregate over channel 1, kept in the page.** The earlier
 *    instruments retained the last 400 keyframes and analysed those; the
 *    interesting event here — an actor mid-walk — lasts ~16 ticks and can fall
 *    out of a 400-sample window. So this tee also counts, over **every**
 *    keyframe from page load: how many carried a non-zero velocity, how many
 *    carried a non-integer position, and every per-actor tile change with the
 *    tick gap it happened across. That is what turns
 *    `2026-09-04-can-i-see-my-prison.md` §6b's *"nothing walks"* from an
 *    inference over one window into a measurement over the run.
 *
 * **Positions are read off the worker, never off pixels.** Git LFS *is*
 * provisioned in this worktree (`file public/assets/actors/…` says `PNG image
 * data`), but nothing below screenshots the world or asserts anything about
 * what was drawn: the question is a simulation question.
 *
 * Nothing in CI collects this file — `tests/browser/playwright.config.ts` is
 * `testMatch: /.*\.spec\.ts$/`, and `playwright.playtest.config.ts` is the
 * config that matches `*.playtest.ts`. Findings live in
 * `docs/research/2026-09-04-the-standing-crowd.md`.
 *
 * ```
 * LOCKSTATE_BROWSER_TEST_PORT=5323 node node_modules/@playwright/test/cli.js test \
 *   --config tests/browser/playwright.playtest.config.ts \
 *   tests/browser/playtest-2026-09-04-the-standing-crowd.playtest.ts -g "act 1"
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
  panelText,
  press,
  runUntilTick,
  tab,
} from './playtest-harness';

/* ------------------------------------------------------------------ */
/* channel 1: the render-actors keyframe, plus a whole-run aggregate    */
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

interface MoveRecord {
  readonly id: number;
  readonly population: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly from: string;
  readonly to: string;
  readonly tiles: number;
}

interface ActorAggregate {
  keyframes: number;
  framesWithVelocity: number;
  framesWithSubtile: number;
  actorSamplesSeen: number;
  actorSamplesWithVelocity: number;
  actorSamplesWithSubtile: number;
  firstTick: number;
  lastTick: number;
  moves: MoveRecord[];
  velocitySightings: string[];
}

/**
 * A second tee for the one message kind `playtest-harness`'s tee drops.
 *
 * `installTee` skips `simulation/delta` so its array cannot grow without
 * bound, and that is the only channel carrying where the actors are. This
 * decodes each keyframe as it lands.
 *
 * **The aggregate is the addition over the previous passes, and it exists
 * because of an arithmetic problem with sampling.** A walk of eight tiles at
 * `DEFAULT_WALK_SUBTILE_UNITS_PER_TICK` takes sixteen kernel ticks (ADR 0059:
 * 128 of 256 units a tick, two ticks a tile). The delta channel's ceiling is
 * 100 ms, which at the x4 speed these acts run is about eight ticks, so a walk
 * is visible in roughly two consecutive keyframes and then gone for ever. A
 * 400-sample ring buffer read at the end of an act therefore cannot answer
 * "did anything ever walk" — it can only answer "was anything walking in the
 * last forty seconds". The counters below are updated on every keyframe from
 * page load and never evicted.
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
    const aggregate: ActorAggregate = {
      keyframes: 0,
      framesWithVelocity: 0,
      framesWithSubtile: 0,
      actorSamplesSeen: 0,
      actorSamplesWithVelocity: 0,
      actorSamplesWithSubtile: 0,
      firstTick: -1,
      lastTick: -1,
      moves: [],
      velocitySightings: [],
    };
    const lastSeen = new Map<number, { tick: number; x: number; y: number; population: number }>();
    /*
     * The projection replies are collected here rather than out of
     * `installTee`'s array, and that is a measured instrument failure inherited
     * from `playtest-2026-09-04-why-they-stack.playtest.ts`: that tee drops
     * `simulation/projection` to stay bounded, so a poll of it times out on a
     * page that answered immediately.
     */
    const projections: unknown[] = [];
    (window as unknown as { lockstateActorSamples: ActorSample[] }).lockstateActorSamples = samples;
    (window as unknown as { lockstateActorRejects: typeof rejected }).lockstateActorRejects = rejected;
    (window as unknown as { lockstateActorAggregate: ActorAggregate }).lockstateActorAggregate = aggregate;
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
            const tick = message.payload?.tick ?? -1;
            const actors: ActorRow[] = [];
            let frameHasVelocity = false;
            let frameHasSubtile = false;
            for (let record = 0; record < recordCount; record += 1) {
              const offset = (HEADER_WORDS + record * RECORD_WORDS) * WORD;
              const packed = view.getUint32(offset + WORD, true);
              const row: ActorRow = {
                id: view.getUint32(offset, true),
                population: packed & 0xff,
                x: view.getInt32(offset + 2 * WORD, true) / SUBTILE,
                y: view.getInt32(offset + 3 * WORD, true) / SUBTILE,
                vx: view.getInt16(offset + 4 * WORD, true) / SUBTILE,
                vy: view.getInt16(offset + 4 * WORD + 2, true) / SUBTILE,
              };
              actors.push(row);
              aggregate.actorSamplesSeen += 1;
              const moving = row.vx !== 0 || row.vy !== 0;
              const subtile = !Number.isInteger(row.x) || !Number.isInteger(row.y);
              if (moving) {
                aggregate.actorSamplesWithVelocity += 1;
                frameHasVelocity = true;
              }
              if (subtile) {
                aggregate.actorSamplesWithSubtile += 1;
                frameHasSubtile = true;
              }
              if ((moving || subtile) && aggregate.velocitySightings.length < 60) {
                aggregate.velocitySightings.push(
                  `tick ${String(tick)} #${String(row.id)} pop${String(row.population)} at (${row.x.toFixed(3)},${row.y.toFixed(3)}) v=(${row.vx.toFixed(3)},${row.vy.toFixed(3)})`,
                );
              }
              const previous = lastSeen.get(row.id);
              const tileX = Math.floor(row.x);
              const tileY = Math.floor(row.y);
              if (previous !== undefined && (previous.x !== tileX || previous.y !== tileY) && aggregate.moves.length < 200) {
                aggregate.moves.push({
                  id: row.id,
                  population: row.population,
                  fromTick: previous.tick,
                  toTick: tick,
                  from: `${String(previous.x)},${String(previous.y)}`,
                  to: `${String(tileX)},${String(tileY)}`,
                  tiles: Math.abs(tileX - previous.x) + Math.abs(tileY - previous.y),
                });
              }
              lastSeen.set(row.id, { tick, x: tileX, y: tileY, population: row.population });
            }
            aggregate.keyframes += 1;
            if (frameHasVelocity) aggregate.framesWithVelocity += 1;
            if (frameHasSubtile) aggregate.framesWithSubtile += 1;
            if (aggregate.firstTick < 0) aggregate.firstTick = tick;
            aggregate.lastTick = tick;
            samples.push({ tick, actors });
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

async function latestActors(page: Page): Promise<ActorSample | undefined> {
  return page.evaluate(() => {
    const samples = (window as unknown as { lockstateActorSamples?: ActorSample[] }).lockstateActorSamples ?? [];
    return samples[samples.length - 1];
  });
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

async function actorAggregate(page: Page): Promise<ActorAggregate | undefined> {
  return page.evaluate(() => (window as unknown as { lockstateActorAggregate?: ActorAggregate }).lockstateActorAggregate);
}

function reportAggregate(label: string, aggregate: ActorAggregate | undefined): void {
  if (aggregate === undefined) {
    console.log(`[${label}] NO AGGREGATE AT ALL`);
    return;
  }
  console.log(
    `[${label}] whole-run keyframe aggregate: ${String(aggregate.keyframes)} keyframe(s) spanning ticks ${String(aggregate.firstTick)}..${String(aggregate.lastTick)};` +
      ` ${String(aggregate.actorSamplesSeen)} actor-sample(s);` +
      ` ${String(aggregate.framesWithVelocity)} keyframe(s) and ${String(aggregate.actorSamplesWithVelocity)} actor-sample(s) with a NON-ZERO velocity;` +
      ` ${String(aggregate.framesWithSubtile)} keyframe(s) and ${String(aggregate.actorSamplesWithSubtile)} actor-sample(s) with a NON-INTEGER position`,
  );
  console.log(`[${label}] first ${String(Math.min(aggregate.velocitySightings.length, 60))} moving/sub-tile sighting(s): ${JSON.stringify(aggregate.velocitySightings)}`);
  console.log(
    `[${label}] every tile change seen (${String(aggregate.moves.length)}, capped at 200): ` +
      JSON.stringify(
        aggregate.moves.map(
          (move) =>
            `#${String(move.id)} pop${String(move.population)} (${move.from})->(${move.to}) ${String(move.tiles)} tile(s) across ticks ${String(move.fromTick)}->${String(move.toTick)}`,
        ),
      ),
  );
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
    .map(([key, entry]) => `    (${key}): ${String(entry.prisoners)} prisoner(s), ${String(entry.guards)} guard(s)`);
  return (
    `tick ${String(sample.tick)}: ${String(sample.actors.length)} actor(s) on ${String(byTile.size)} distinct tile(s), ${String(moving)} with a non-zero velocity\n` +
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
 * `messageId` and reads the reply out of this file's own tee.
 *
 * The envelope is `requestProjectionMessageSchema`
 * (`src/simulation/protocol/types.ts`): `protocolVersion` is the literal
 * `SIMULATION_PROTOCOL_VERSION`, which is `1`, and `messageId` must match
 * `identifierSchema`. An uncorrelated `replyTo` settles nothing in the app's
 * own requester, so injecting a request cannot disturb the page.
 */
async function rosterRows(page: Page, label: string): Promise<readonly RosterRow[]> {
  return page.evaluate(async (probeLabel: string) => {
    const worker = (window as unknown as { lockstateWorker?: Worker }).lockstateWorker;
    if (worker === undefined) throw new Error('the actor tee never saw a Worker constructed');
    const received = (window as unknown as { lockstateProjectionReplies?: unknown[] }).lockstateProjectionReplies ?? [];
    const messageId = `standingcrowd.${probeLabel}.${String(Date.now())}`;
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

/**
 * The roster grouped by what a row *is*, not listed row by row.
 *
 * Twenty-two rows printed one per line is four screens of log and the shape is
 * the finding: the interesting quantity is how many distinct
 * (tile, phase, action, accommodation) states the population is in. A crowd
 * where everyone is doing the same thing is a different defect from a crowd
 * where everyone is doing something different and all of it ends in one place,
 * and this is the reading that tells them apart.
 */
function describeRoster(rows: readonly RosterRow[]): string {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key =
      `(${String(row.tile.x)},${String(row.tile.y)}) stage=${row.intakeStage} phase=${row.actionPhase}` +
      ` action=${row.currentActionId ?? 'NONE'} accommodation=${row.accommodation?.instanceId ?? 'NONE'}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row.entityId);
    groups.set(key, bucket);
  }
  const lines = [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, ids]) => `    ${String(ids.length)}x ${key}  [ids ${ids.slice(0, 8).join(',')}${ids.length > 8 ? ',…' : ''}]`);
  return `${String(rows.length)} row(s) in ${String(groups.size)} distinct state(s):\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/* channel 3: the worker's own event log                               */
/* ------------------------------------------------------------------ */

/**
 * Every `simulation/event` the worker has pushed, with its tick.
 *
 * **`'simulation/event'`, singular, and `payload.event` rather than
 * `payload.events`** — one message per event
 * (`src/simulation/worker/state-machine.ts`). An earlier instrument filtered
 * on the plural and could never have returned anything, which is recorded in
 * `playtest-2026-09-04-is-there-anything-to-do.playtest.ts` and is why this
 * reader was written against the schema rather than against that file.
 */
async function events(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const message of (window as unknown as { lockstateFromWorker?: readonly unknown[] }).lockstateFromWorker ?? []) {
      const typed = message as { kind?: string; payload?: { tick?: number; event?: Record<string, unknown> } };
      if (typed.kind !== 'simulation/event') continue;
      const event = typed.payload?.event ?? {};
      const extra = Object.entries(event)
        .filter(([key]) => key !== 'type')
        .map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join(' ');
      out.push(`tick ${String(typed.payload?.tick ?? -1)} ${String(event['type'] ?? '(untyped)')} ${extra}`);
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* the reading that every act takes                                    */
/* ------------------------------------------------------------------ */

async function readBothChannels(page: Page, label: string): Promise<{ actors: ActorSample | undefined; roster: readonly RosterRow[] }> {
  const actors = await latestActors(page);
  const roster = await rosterRows(page, label);
  console.log(`[${label}] channel 1, the render-actors keyframe: ${tally(actors)}`);
  console.log(`[${label}] channel 1 rejects: ${JSON.stringify(await actorRejects(page))}`);
  console.log(`[${label}] channel 2, hud/prisoner-roster at tick ${String(await currentTick(page))}: ${describeRoster(roster)}`);
  return { actors, roster };
}

/**
 * Presses Admit until the worker's own count reaches `target`.
 *
 * **Not tidiness.** A straight run of `n` presses does not produce `n`
 * prisoners: `SimulationCommandSender.submit` throws *"The simulation has not
 * reported its command sequence yet"* inside a window after each press, and a
 * press inside that window submits nothing at all
 * (`src/ui/simulation-commands.ts`; measured and recorded by
 * `docs/research/2026-09-04-why-they-stack.md` §7.2). The retry loop is what
 * makes an act's population the number it claims.
 */
async function admitUntil(page: Page, target: number, label: string): Promise<number> {
  await tab(page, 'overview').click({ timeout: 15_000 });
  let presses = 0;
  for (;;) {
    const counts = await latestCounts(page);
    const alive = counts?.prisoners ?? 0;
    if (alive >= target) {
      console.log(`[${label}] ${String(alive)} prisoner(s) alive after ${String(presses)} extra Admit press(es)`);
      return alive;
    }
    if (presses >= 3 * target + 12) {
      console.log(`[${label}] gave up at ${String(alive)} prisoner(s) after ${String(presses)} extra Admit press(es)`);
      return alive;
    }
    presses += 1;
    await page.locator('.hud-intake__admit').click({ timeout: 20_000 });
    await page.waitForTimeout(350);
  }
}

async function railReadout(page: Page, label: string): Promise<void> {
  console.log(`[${label}] strip: ${(await panelText(page, '.hud-strip')).replace(/\n/g, ' | ')}`);
  console.log(`[${label}] the rail's own no-place readout: ${String(await page.locator('.hud-intake__no-place').getAttribute('data-without-place'))}`);
}

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

/* ------------------------------------------------------------------ */
/* the acts                                                           */
/* ------------------------------------------------------------------ */

/*
 * **Why the per-test budget is raised, and why that is not the thing
 * `docs/AGENT_WORKFLOW.md` forbids.** The rule is *"do not raise a timeout to
 * hide a race"*. Nothing below races: an act builds a prison with the mouse
 * (about five minutes of real gestures and real construction ticks), admits up
 * to twenty-two prisoners through a control that has to be retried, and then
 * runs the clock past a riot. The config's 600 s is a budget for play and this
 * is a longer piece of play. Every wait below is on a worker-published number,
 * never on wall-clock.
 */
test.setTimeout(1_500_000);

test('act 1: the reported crowd, reproduced whole, and every body accounted for', async ({ page }) => {
  await arrive(page);
  // The configuration `2026-09-04-can-i-see-my-prison.md` §5b read: six beds,
  // twenty-two admitted, six guards hired. Sixteen of the twenty-two therefore
  // have nowhere to live, which is the rail's `16 with no bed`.
  await buildAndPopulate(page, { beds: 6, admits: 22, guards: 6, label: 'act1' });
  const alive = await admitUntil(page, 22, 'act1');

  // A first reading as soon as the population is complete, so that "the stack
  // was already this size at tick N" is a measurement and not a back-formation
  // from the end of the run.
  await runUntilTick(page, (await currentTick(page)) + 1200);
  const early = await currentTick(page);
  console.log(`[act1] --- EARLY READING, ${String(alive)} prisoner(s), tick ${String(early)} ---`);
  await railReadout(page, 'act1-early');
  await readBothChannels(page, 'act1-early');
  console.log(`[act1-early] events so far: ${JSON.stringify(await events(page))}`);

  // Then long enough for ADR 0048's sector risk to climb and a riot to open.
  // `can-i-see-my-prison` act 3 saw riots at ticks 18,150 and 25,450 in this
  // prison; this runs past the first of those and keeps going.
  await runUntilTick(page, Math.max(early + 9000, 22_000), 600_000);

  const counts = await latestCounts(page);
  console.log(
    `[act1] counts at tick ${String(counts?.tick)}: prisoners=${String(counts?.prisoners)} accommodationCapacity=${String(counts?.accommodationCapacity)}` +
      ` roomOccupants=${String(counts?.roomOccupants)} rooms=${String(counts?.rooms)} staff=${String(counts?.staff)}`,
  );
  console.log(`[act1] --- LATE READING, tick ${String(await currentTick(page))} ---`);
  await railReadout(page, 'act1-late');
  await readBothChannels(page, 'act1-late');
  console.log(`[act1-late] the worker's whole event log: ${JSON.stringify(await events(page))}`);
  console.log(`[act1-late] alert column: ${JSON.stringify(await panelText(page, '.hud-alerts'))}`);
  reportAggregate('act1', await actorAggregate(page));
});

test('act 2: at what population does the crowd start', async ({ page }) => {
  await arrive(page);
  // Six beds and nobody in them yet. `buildAndPopulate` admits `admits`
  // prisoners in a straight run; this act needs them one at a time with a
  // reading between each, so it asks for none and does its own admitting.
  await buildAndPopulate(page, { beds: 6, admits: 0, guards: 0, label: 'act2' });

  /*
   * Eight admissions into a six-bed prison, read after each.
   *
   * The point of the curve is that it separates three hypotheses that all
   * predict the crowd at twenty-two: (a) it needs overcrowding, (b) it needs a
   * crowd, (c) it is one tile per room and starts at two prisoners. Only (c)
   * predicts a single tile at n=2 with a bed for everybody.
   *
   * 900 ticks between readings is more than one whole reconsideration cadence
   * (`ActionSystem` runs every 20 ticks) and more than `action.sleep`'s
   * 200-tick block, so a prisoner admitted at the start of a step has had time
   * to be assigned accommodation, route to it and begin something.
   */
  for (let target = 1; target <= 8; target += 1) {
    const alive = await admitUntil(page, target, `act2-n${String(target)}`);
    await runUntilTick(page, (await currentTick(page)) + 900);
    const counts = await latestCounts(page);
    console.log(
      `[act2-n${String(target)}] === POPULATION ${String(alive)} === tick ${String(await currentTick(page))}` +
        ` accommodationCapacity=${String(counts?.accommodationCapacity)} roomOccupants=${String(counts?.roomOccupants)}`,
    );
    await railReadout(page, `act2-n${String(target)}`);
    await readBothChannels(page, `act2-n${String(target)}`);
  }
  reportAggregate('act2', await actorAggregate(page));
});

test('act 3: take every bed away and see whether the crowd on the room anchor moves', async ({ page }) => {
  await arrive(page);
  /*
   * Eight prisoners into a six-bed prison, so **both** stacks exist at once:
   * six on the cell's anchor tile and two on the arrival tile.
   *
   * Then every bed is removed. `2026-09-04-why-they-stack.md` act 3 removed
   * *one* bed — the one standing on the anchor — and nobody moved, which
   * separated "they stand on their bed" from "they stand on the room". This
   * removes the room's whole reason to be an accommodation, which is the
   * different question: does a prisoner whose accommodation has gone stay
   * where the last successful arrival put them, or does anything ever revise a
   * position downwards?
   *
   * The prediction from `beginNextAction`'s fall-through
   * (`src/simulation/prisoners/action-system.ts`, the `unmetDemandCycles += 1`
   * that is the last statement of the method) is that nothing moves at all,
   * and the six stay on a tile that is now neither their room nor the tile
   * they arrived on.
   */
  const origin = await buildAndPopulate(page, { beds: 6, admits: 8, guards: 0, label: 'act3' });
  await admitUntil(page, 8, 'act3');
  await runUntilTick(page, (await currentTick(page)) + 3000);

  console.log('[act3] --- BEFORE: eight prisoners, six beds, two stacks ---');
  await railReadout(page, 'act3-before');
  const before = await readBothChannels(page, 'act3-before');

  // `buildAndPopulate` places its beds along row 12 from column 12, so the six
  // are on (12,12)..(17,12). Removing all six leaves the room zoned with no
  // sleep surface in it at all.
  await tab(page, 'build').click({ timeout: 15_000 });
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  for (let column = 12; column <= 17; column += 1) {
    const point = centreOf(origin, column, 12);
    const removal = await press(page, point.x, point.y);
    console.log(`[act3] remove press on (${String(column)},12) produced ${JSON.stringify(removal)}`);
  }
  await page.locator('.hud-build__remove').click({ timeout: 15_000 });
  await runUntilTick(page, (await currentTick(page)) + 3000);

  const counts = await latestCounts(page);
  console.log(
    `[act3] counts after removing every bed, tick ${String(counts?.tick)}: roomCapacity=${String(counts?.roomCapacity)}` +
      ` accommodationCapacity=${String(counts?.accommodationCapacity)} roomOccupants=${String(counts?.roomOccupants)}`,
  );
  console.log('[act3] --- AFTER: the same eight prisoners, no beds anywhere ---');
  await railReadout(page, 'act3-after');
  const after = await readBothChannels(page, 'act3-after');

  const tiles = (rows: readonly RosterRow[]): string =>
    [...new Set(rows.map((r) => `${String(r.tile.x)},${String(r.tile.y)}`))].sort().join(' ');
  console.log(
    `[act3] the differential: before, ${String(before.roster.length)} prisoner(s) on ${tiles(before.roster)};` +
      ` after, ${String(after.roster.length)} on ${tiles(after.roster)}`,
  );
  console.log(`[act3] events: ${JSON.stringify(await events(page))}`);
  reportAggregate('act3', await actorAggregate(page));
});
