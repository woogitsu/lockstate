import { describe, expect, it } from 'vitest';
import { decodeMainToWorkerMessage, decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import {
  MAX_PROJECTION_PAGE_LIMIT,
  PROJECTION_IDS,
  SIMULATION_PROTOCOL_VERSION,
  type MainToWorkerMessage,
  type ProjectionId,
  type ProjectionTarget,
} from '../../src/simulation/protocol/types';
import {
  captureSessionSnapshot,
  SESSION_SNAPSHOT_SCHEMA_ID,
  SESSION_SNAPSHOT_SCHEMA_VERSION,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { SimulationWorkerStateMachine, type MessagePortLike } from '../../src/simulation/worker/state-machine';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { expectOk } from '../helpers/expect-ok';

/**
 * Every declared projection really answers, over the real state machine.
 *
 * This is the runtime half of issue #104's ask -- *"the next added projection
 * cannot silently be unreachable"* -- and it is deliberately the noisier half
 * of two. The quiet half is a type: `PROJECTION_CATALOG` is a
 * `Record<ProjectionId, ProjectionCatalogEntry>`, so an id added to
 * `PROJECTION_IDS` does not compile until it has an entry. That is a strong
 * gate and it is not enough, for one reason: **a `Record` can be satisfied by
 * an entry that throws.** A binding that names the wrong registry, hands a
 * projection a source it does not satisfy, or produces a value the boundary
 * refuses would compile, and the id would be declared, catalogued, and still
 * unreachable -- which is the exact state #104 was filed about, reached by a
 * new route.
 *
 * So this drives **every** member of `PROJECTION_IDS` through
 * `SimulationWorkerStateMachine` over a scenario with a real population, real
 * rooms, real guards, real contraband and a real incident pipeline, and puts
 * every reply back through `decodeWorkerToMainMessage`. A projection that
 * emitted a cycle, an `Infinity`, a `Map` or a class instance fails at that
 * decode rather than at whatever the first panel to render it happened to be.
 *
 * It is a loop over the vocabulary rather than twelve hand-written cases on
 * purpose: a hand-written list is a second vocabulary that goes stale, and the
 * thing being asserted is a property of *the set*, not of any member.
 */

class RecordingPort implements MessagePortLike {
  public readonly messages: any[] = [];
  public postMessage(message: any): void {
    this.messages.push(message);
  }
}

function scenarioSnapshot(): SessionSnapshotBundle {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  return captureSessionSnapshot(runtime);
}

interface ProjectionQuery {
  readonly offset?: number;
  readonly limit?: number;
  readonly target?: ProjectionTarget;
}

class Harness {
  public readonly port = new RecordingPort();
  private readonly machine: SimulationWorkerStateMachine;
  private nextId = 0;

  public constructor(snapshot: SessionSnapshotBundle) {
    this.machine = new SimulationWorkerStateMachine(this.port, 'projection-channel-contract', () => 0);
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'init',
      kind: 'simulation/initialize',
      payload: {
        sessionId: 'session-projection-channel',
        source: {
          kind: 'snapshot',
          snapshot: {
            transport: 'structured-clone',
            schemaId: SESSION_SNAPSHOT_SCHEMA_ID,
            schemaVersion: SESSION_SNAPSHOT_SCHEMA_VERSION,
            data: snapshot as unknown as null,
          },
        },
      },
    });
    const fault = this.port.messages.find((message) => message.kind === 'protocol/error');
    if (fault !== undefined) throw new Error(`The worker refused the scenario snapshot: ${String(fault.payload.message)}`);
  }

  private send(message: MainToWorkerMessage): void {
    this.machine.handleMessage(message);
  }

  /** Sends one request and returns the single message correlated to it. */
  public ask(projectionId: ProjectionId, query: ProjectionQuery = {}): any {
    this.nextId += 1;
    const messageId = `request-${String(this.nextId)}`;
    this.send({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId,
      kind: 'simulation/request-projection',
      payload: {
        projectionId,
        ...(query.offset === undefined ? {} : { offset: query.offset }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(query.target === undefined ? {} : { target: query.target }),
      },
    });
    const replies = this.port.messages.filter((message) => message.replyTo === messageId);
    // Exactly one, not "at least one": a request that produced both an answer
    // and a fault would leave the main thread's pending map settled by
    // whichever arrived first.
    expect(replies, `one reply for ${projectionId}`).toHaveLength(1);
    return replies[0];
  }
}

/**
 * A target every entry can be asked with, chosen so the reply is a *hit*
 * rather than the "no such thing" answer.
 *
 * `cell-1` is registered by the scenario builder. The prisoner entity id is
 * read from the roster reply rather than assumed, so this cannot pass by
 * asking about an id that happens not to exist.
 */
function targetFor(projectionId: ProjectionId, harness: Harness): ProjectionTarget | undefined {
  switch (PROJECTION_CATALOG[projectionId].target) {
    case 'none':
      return undefined;
    case 'entity': {
      const roster = harness.ask('hud/prisoner-roster', { offset: 0, limit: 1 });
      const entityId = roster.payload.view.data.rows[0]?.entityId;
      expect(entityId, 'the scenario must have at least one prisoner for an entity target').toBeTypeOf('number');
      return { kind: 'entity', entityId: entityId as number };
    }
    case 'id':
      // `hud/incident-detail` and `hud/room-detail` are the two `id` entries.
      // A room instance the scenario registers serves the first; the second is
      // asked with the same shape and answers "no such incident", which is a
      // legal, declared reply and is asserted as such below.
      return { kind: 'id', id: 'cell-1' };
  }
}

const PAGED_IDS = PROJECTION_IDS.filter((id) => PROJECTION_CATALOG[id].paged);
const UNPAGED_IDS = PROJECTION_IDS.filter((id) => !PROJECTION_CATALOG[id].paged);

describe('every declared projection has a publish route the worker really answers', () => {
  it('scans a vocabulary and a catalog that agree, and neither is empty', () => {
    // Vacuity guard. An empty vocabulary would make every loop below assert
    // nothing at all, which reads exactly like compliance.
    expect(PROJECTION_IDS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PROJECTION_IDS).size).toBe(PROJECTION_IDS.length);
    expect(Object.keys(PROJECTION_CATALOG).sort()).toEqual([...PROJECTION_IDS].sort());
    // Both shapes are exercised, so neither branch below is asserting about
    // an empty list.
    expect(PAGED_IDS.length).toBeGreaterThan(0);
    expect(UNPAGED_IDS.length).toBeGreaterThan(0);
  });

  it('answers every declared id with a correlated, decodable reply about the tick it read', () => {
    const harness = new Harness(scenarioSnapshot());

    for (const projectionId of PROJECTION_IDS) {
      const target = targetFor(projectionId, harness);
      const paged = PROJECTION_CATALOG[projectionId].paged;
      const reply = harness.ask(projectionId, {
        ...(target === undefined ? {} : { target }),
        ...(paged ? { offset: 0, limit: 5 } : {}),
      });

      expect(reply.kind, `${projectionId} must be answered with a projection`).toBe('simulation/projection');
      expect(reply.payload.projectionId, 'the reply must be about the projection that was asked for').toBe(projectionId);
      expect(reply.payload.tick, `${projectionId} must stamp the tick it was read at`).toBe(0);

      // Through the real decoder, which is where a projection that produced a
      // cycle, a non-finite number or a class instance is caught -- the
      // structured-clone safety `docs/HUD_PROJECTIONS.md` contract 1 promises,
      // checked rather than trusted.
      const decoded = decodeWorkerToMainMessage(reply);
      expectOk(decoded, `${projectionId}'s reply on the wire`);

      if (paged) {
        expect(reply.payload.page, `${projectionId} is paged and must report the window it built`).toEqual({
          total: expect.any(Number),
          offset: 0,
          limit: 5,
        });
      } else {
        expect(reply.payload.page, `${projectionId} has no list, so it must report no page`).toBeUndefined();
      }
    }
  });

  it('carries a real read model, not an empty shell, for every id', () => {
    // The assertion above would pass against a catalog whose every entry
    // returned `{}`. This one requires each reply to carry a payload under the
    // entry's own schema identity, with something in it.
    const harness = new Harness(scenarioSnapshot());

    for (const projectionId of PROJECTION_IDS) {
      const entry = PROJECTION_CATALOG[projectionId];
      const target = targetFor(projectionId, harness);
      const reply = harness.ask(projectionId, {
        ...(target === undefined ? {} : { target }),
        ...(entry.paged ? { limit: 5 } : {}),
      });

      if (projectionId === 'hud/incident-detail') {
        // The one id whose hit depends on the incident pipeline having fired.
        // Asked with a room instance id, it correctly answers "no such
        // incident" -- which is asserted on its own below rather than
        // weakened into a pass here.
        expect(reply.payload.view).toBeUndefined();
        continue;
      }

      expect(reply.payload.view, `${projectionId} answered with no read model at all`).toBeDefined();
      expect(reply.payload.view.transport).toBe('structured-clone');
      expect(reply.payload.view.schemaId).toBe(entry.schemaId);
      expect(reply.payload.view.schemaVersion).toBe(entry.schemaVersion);
      expect(Object.keys(reply.payload.view.data as object).length, `${projectionId} projected an empty object`).toBeGreaterThan(0);
    }
  });

  it('reports the prison it was given, so the reply is state and not a shape', () => {
    // Non-vacuity of a different kind: the scenario registers four cells, a
    // yard and a canteen, admits four prisoners and hires five guards, and the
    // channel must be carrying those numbers rather than a well-formed empty
    // view model.
    const harness = new Harness(scenarioSnapshot());

    const roster = harness.ask('hud/prisoner-roster', { limit: 10 });
    expect(roster.payload.page.total).toBe(4);
    expect(roster.payload.view.data.rows).toHaveLength(4);

    const rooms = harness.ask('hud/room-list', { limit: 10 });
    expect(rooms.payload.page.total).toBe(6);

    const staff = harness.ask('hud/staff', { limit: 10 });
    expect(staff.payload.page.total).toBe(5);

    const strip = harness.ask('hud/status-strip');
    expect(strip.payload.view.data.counts.prisoners).toBe(4);
    expect(strip.payload.view.data.counts.staff).toBe(5);

    const world = harness.ask('world/render-snapshot');
    expect(world.payload.view.data.chunks.length).toBeGreaterThan(0);
  });

  it('honours the window it was asked for rather than choosing its own', () => {
    // #157 finding 1: without a page-request direction a roster publication
    // "would have to either push the whole list or let the worker choose the
    // window -- and a worker-chosen window is not paging, it is truncation the
    // UI cannot scroll". This is that sentence as an assertion.
    const harness = new Harness(scenarioSnapshot());

    const firstTwo = harness.ask('hud/prisoner-roster', { offset: 0, limit: 2 });
    expect(firstTwo.payload.page).toEqual({ total: 4, offset: 0, limit: 2 });
    expect(firstTwo.payload.view.data.rows).toHaveLength(2);

    const nextTwo = harness.ask('hud/prisoner-roster', { offset: 2, limit: 2 });
    expect(nextTwo.payload.page).toEqual({ total: 4, offset: 2, limit: 2 });
    expect(nextTwo.payload.view.data.rows).toHaveLength(2);

    // Two different windows of the same list, not the same rows twice.
    const firstIds = firstTwo.payload.view.data.rows.map((row: { entityId: number }) => row.entityId);
    const nextIds = nextTwo.payload.view.data.rows.map((row: { entityId: number }) => row.entityId);
    expect(firstIds).not.toEqual(nextIds);
    expect(new Set([...firstIds, ...nextIds]).size).toBe(4);

    // Past the end is an empty window with the true total, not a fault and not
    // a wrapped-around page.
    const past = harness.ask('hud/prisoner-roster', { offset: 99, limit: 5 });
    expect(past.payload.page).toEqual({ total: 4, offset: 99, limit: 5 });
    expect(past.payload.view.data.rows).toHaveLength(0);
  });

  it('answers "no such thing" for a detail target that does not exist, without faulting', () => {
    const harness = new Harness(scenarioSnapshot());

    const goneRoom = harness.ask('hud/room-detail', { target: { kind: 'id', id: 'cell-does-not-exist' } });
    expect(goneRoom.kind).toBe('simulation/projection');
    expect(goneRoom.payload.view).toBeUndefined();

    const gonePrisoner = harness.ask('hud/prisoner-detail', { target: { kind: 'entity', entityId: 9_999 } });
    expect(gonePrisoner.kind).toBe('simulation/projection');
    expect(gonePrisoner.payload.view).toBeUndefined();

    // And the same id space really does answer when the thing is there, so
    // "absent" above is a fact about the target and not about the route.
    const realRoom = harness.ask('hud/room-detail', { target: { kind: 'id', id: 'cell-1' } });
    expect(realRoom.payload.view.data.instanceId).toBe('cell-1');
  });

  it('refuses a page window on a projection that has no list', () => {
    const harness = new Harness(scenarioSnapshot());
    const reply = harness.ask('hud/security', { limit: 5 });

    expect(reply.kind).toBe('protocol/error');
    expect(reply.payload.code).toBe('invalid-payload');
    // Recoverable: the request was rejected without the simulation being
    // touched, so this worker is still usable.
    expect(reply.payload.recoverable).toBe(true);
  });

  it('refuses a target of the wrong kind, and a detail request with none', () => {
    const harness = new Harness(scenarioSnapshot());

    const wrongKind = harness.ask('hud/prisoner-detail', { target: { kind: 'id', id: 'cell-1' } });
    expect(wrongKind.kind).toBe('protocol/error');
    expect(wrongKind.payload.code).toBe('invalid-payload');

    const missing = harness.ask('hud/room-detail');
    expect(missing.kind).toBe('protocol/error');
    expect(missing.payload.code).toBe('invalid-payload');

    const unwanted = harness.ask('hud/staff', { target: { kind: 'id', id: 'cell-1' } });
    expect(unwanted.kind).toBe('protocol/error');
    expect(unwanted.payload.code).toBe('invalid-payload');
  });

  it('refuses a request before a session exists, and says which fault it is', () => {
    const port = new RecordingPort();
    const machine = new SimulationWorkerStateMachine(port, 'projection-channel-contract', () => 0);
    machine.handleMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'early',
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/status-strip' },
    });

    expect(port.messages).toHaveLength(1);
    expect(port.messages[0].kind).toBe('protocol/error');
    expect(port.messages[0].replyTo).toBe('early');
    expect(port.messages[0].payload.code).toBe('not-initialized');
  });

  it('never decodes a window larger than the protocol allows', () => {
    /*
     * The ceiling is on the schema, not in the handler, so an over-large
     * request never reaches the worker at all. Asserted here because the
     * handler deliberately does not re-check it, and a schema that lost the
     * bound would otherwise be invisible.
     *
     * **The figure is pinned, and the pair below is written out.** #444 item 3:
     * the two cases here used to be `MAX_PROJECTION_PAGE_LIMIT + 1` refused and
     * `MAX_PROJECTION_PAGE_LIMIT` accepted, and nothing else. That is the
     * production constant put through the production comparison, so it holds
     * for *any* value the constant takes -- exactly the shape #375 fixed for
     * the three sibling constants (`CLOCK_STATE_PUBLISH_INTERVAL_MS`,
     * `STATUS_COUNTS_PUBLISH_INTERVAL_MS`, `RENDER_DELTA_PUBLISH_INTERVAL_MS`),
     * and the fourth was missed. Measured: `500 -> 5000` left this file 11/11
     * green, ten times the largest legal response with nothing to notice.
     *
     * So the ceiling is asserted as a literal and the boundary is stated in
     * numbers that do not move with it. The derived pair is kept beside them
     * because it is the half that still reads as the contract; the literals are
     * the half that fails when the contract changes.
     */
    expect(
      MAX_PROJECTION_PAGE_LIMIT,
      'the written-out bounds below are the ceiling itself -- retuning it is a protocol change, so change these numbers deliberately rather than letting them follow',
    ).toBe(500);

    const decodeWithLimit = (messageId: string, limit: number): boolean =>
      decodeMainToWorkerMessage({
        protocolVersion: SIMULATION_PROTOCOL_VERSION,
        messageId,
        kind: 'simulation/request-projection',
        payload: { projectionId: 'hud/prisoner-roster', limit },
      }).ok;

    // Written out. 501 rows is a refusal and 500 is not, whatever the constant
    // says.
    expect(decodeWithLimit('oversized-literal', 501)).toBe(false);
    expect(decodeWithLimit('at-ceiling-literal', 500)).toBe(true);

    // And the same boundary read off the constant, which is what a reader
    // checks the two literals against.
    expect(decodeWithLimit('oversized', MAX_PROJECTION_PAGE_LIMIT + 1)).toBe(false);
    expect(decodeWithLimit('at-ceiling', MAX_PROJECTION_PAGE_LIMIT)).toBe(true);
  });

  it('rejects an id the vocabulary does not declare, at the decoder', () => {
    const unknown = decodeMainToWorkerMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'unknown',
      kind: 'simulation/request-projection',
      payload: { projectionId: 'hud/not-a-projection' },
    });
    expect(unknown.ok).toBe(false);
  });
});
