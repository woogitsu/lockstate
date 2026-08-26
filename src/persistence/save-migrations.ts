import { computeSaveChecksum } from './checksum';
import { encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from './entity-codec';
import type { JsonValue } from '../shared/json';
import { NEED_IDS, NEED_MAX_SCALED, NEED_SCALE } from '../simulation/prisoners/needs';
import type {
  SaveEnvelopeV1,
  SaveEnvelopeV2,
  SaveEnvelopeV3,
  SaveEnvelopeV4,
  SaveEnvelopeV5,
  SaveEnvelopeV6,
  SavePayloadV1,
  SavePayloadV3,
  SavePayloadV4,
  SavePayloadV5,
} from './save-schema';

/**
 * Forward migrations between save-schema versions.
 *
 * Kept out of `save-schema.ts` so that file stays the *shape* authority
 * (every version's Zod schema, registered once and never edited) while this
 * file holds the one-way transformations between those shapes. Only
 * `import type` crosses back to `save-schema.ts`, so there is no runtime
 * import cycle.
 */

type EncodedEntityStoreSnapshotV1 = NonNullable<SavePayloadV1['entities']>;

/**
 * Re-encodes V1's capacity-shaped liveness arrays into V2's population-shaped
 * form by routing them through the *same* encoder a live store uses, so a
 * migrated save and a freshly captured one converge on one encoding rather
 * than two that could drift.
 *
 * V1's schema constrained the three arrays only to be numeric, never to be
 * exactly `capacity` long, so they are normalised here (truncated or
 * zero-padded to `capacity`) before encoding. A V1 save produced by this
 * codebase always had `capacity`-long arrays and a `freeCount` within them,
 * so for every real save this normalisation is the identity.
 */
function upgradeEntityLiveness(v1: EncodedEntityStoreSnapshotV1): EncodedEntityStoreSnapshot {
  const capacity = v1.capacity;

  const generations = new Uint16Array(capacity);
  generations.set(v1.generations.slice(0, capacity));

  const alive = new Uint8Array(capacity);
  alive.set(v1.alive.slice(0, capacity));

  // `freeCount` is dropped in V2 (it is `freeIndices.length` there), so an
  // inconsistent V1 pair is resolved to the entries that actually exist.
  const freeCount = Math.max(0, Math.min(v1.freeCount, v1.freeIndices.length, capacity));
  const freeIndices = new Uint32Array(capacity);
  freeIndices.set(v1.freeIndices.slice(0, freeCount));

  return encodeEntityStoreSnapshot({
    capacity,
    nextAvailableIndex: v1.nextAvailableIndex,
    maxActiveIndex: v1.maxActiveIndex,
    freeCount,
    generations,
    freeIndices,
    alive,
  });
}

/**
 * V1 -> V2: the entity-liveness ledger stops being written at the store's
 * allocated capacity and starts being written at its population (#50).
 * Everything else in the envelope is carried across unchanged.
 *
 * **The checksum is recomputed**, because it covers the payload and the
 * payload changed. That does not weaken corruption detection:
 * `decodeSaveEnvelope` verifies the *stored* checksum against the payload as
 * written, at its declared version. It does so *after* running the whole
 * migration chain, not before -- so this function is reached with a corrupt
 * V1 save, and the value it produces is discarded a moment later when the
 * as-written comparison fails. What matters for corruption detection is
 * which bytes are compared, not when: the comparison never sees this
 * function's output.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV1ToV2(input: SaveEnvelopeV1): SaveEnvelopeV2 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: upgradeEntityLiveness(payload.entities) }),
  };

  return {
    saveSchemaVersion: 2,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV2;
}

/**
 * V2 -> V3: the payload gains a `simulation` section carrying the twenty-odd
 * subsystems that hold authoritative state and were never persisted (#70).
 *
 * V3 also adds a session-level `identity` section (ADR 0015): the names
 * prisoners and staff are known by.
 *
 * **The payload crosses unchanged.** Both sections were added *beside*
 * `kernel`/`world`/`construction`/`entities` rather than folded into them,
 * and both are optional, so there is nothing in a V2 save to reshape — and
 * nothing this function may invent. A save written by a V2 build genuinely
 * does not contain that prison's prisoners, guards, incidents, contraband or
 * names; fabricating an empty section would assert the opposite (an empty
 * section says "this prison has none", an absent one says "this save does not
 * know"). `restoreSimulationRuntime` treats an absent section exactly as V2
 * behaved — those subsystems rebuild empty, and every roster row simply
 * projects no name — and `RestoredScope` is what tells the player which of
 * the two happened.
 *
 * The checksum is recomputed for the same reason V1 -> V2 recomputes it: a
 * migrated envelope must be indistinguishable from a natively-written one.
 * Since the payload is unchanged the recomputed value necessarily equals the
 * stored one, which is a property worth a test rather than a reason to skip
 * the call — skipping it would make this the one step whose output was not
 * self-consistent by construction. As with V1 -> V2, `decodeSaveEnvelope`
 * verifies the stored checksum against the payload as written, at V2 -- but
 * only after the whole chain has run, so this function's output is never the
 * value that comparison examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV2ToV3(input: SaveEnvelopeV2): SaveEnvelopeV3 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
  };

  return {
    saveSchemaVersion: 3,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV3;
}

/** V3's whole-level needs section, the only part of the payload V3 -> V4 reshapes. */
type NeedLevelsV3 = NonNullable<SavePayloadV3['simulation']>['prisoners']['components']['needs'];

/**
 * Rescales one prisoner's-worth of whole-level needs into the stored units
 * `NeedsComponent` uses from V4 on.
 *
 * The mapping is `level * NEED_SCALE`, which is exact and total: a V3 level
 * is a whole number in `0..255` by that version's own schema, so every
 * product is a whole number in `0..NEED_MAX_SCALED` and lands inside V4's
 * bound. It is also the *only* honest mapping -- a V3 save recorded whole
 * levels, so the sub-level remainder V4 can express is genuinely unknown for
 * it, and zero is what "this prisoner is exactly at level N" means.
 *
 * Driven off `NEED_IDS` rather than the six literal keys, so a seventh need
 * is carried with no second edit. `Math.min` cannot fire for any save the
 * chain actually reaches this function with -- V3's schema has already
 * rejected a level above 255 -- and is kept as the one line that would have
 * to be reconsidered if `NEED_LEVEL_MAX_V3` were ever widened.
 */
function upgradeNeedLevels(needs: NeedLevelsV3): Record<string, readonly number[]> {
  const rescaled: Record<string, readonly number[]> = {};
  for (const needId of NEED_IDS) {
    rescaled[needId] = needs[needId].map((level) => Math.min(NEED_MAX_SCALED, level * NEED_SCALE));
  }
  return rescaled;
}

/**
 * V3 -> V4: need levels stop being whole 0-255 levels and start being those
 * levels scaled by `NEED_SCALE` (#259).
 *
 * This is the first migration in this file that rewrites the *simulation*
 * section rather than carrying it across, and the reason is that the field
 * changed meaning rather than shape: `hunger: 200` is a different prisoner
 * in V3 than in V4, and nothing in the value says which version wrote it.
 * Leaving it alone would load every V3 prisoner at 1/200th of their real
 * levels -- effectively starving the whole prison on first load.
 *
 * Nothing else in the payload is touched. `simulation` stays optional and an
 * absent section stays absent: a V3 save written by a build with no
 * subsystem state genuinely has none, and this function may no more invent
 * one than `migrateSaveEnvelopeV2ToV3` may.
 *
 * The checksum is recomputed for the reason V1 -> V2 recomputes it, and with
 * the same guarantee: `decodeSaveEnvelope` compares the *stored* checksum
 * against the payload as written, at its declared version, only after the
 * whole chain has run -- so this function's output is never the value that
 * comparison examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV3ToV4(input: SaveEnvelopeV3): SaveEnvelopeV4 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const simulation =
    payload.simulation === undefined
      ? undefined
      : {
          ...payload.simulation,
          prisoners: {
            ...payload.simulation.prisoners,
            components: {
              ...payload.simulation.prisoners.components,
              needs: upgradeNeedLevels(payload.simulation.prisoners.components.needs),
            },
          },
        };

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(payload.identity === undefined ? {} : { identity: payload.identity }),
  };

  return {
    saveSchemaVersion: 4,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV4;
}

/** V4's room-instance rows, the only part of the payload V4 -> V5 reshapes. */
type RoomInstancesV4 = NonNullable<SavePayloadV4['simulation']>['prisoners']['roomInstanceDefinitions'];

/** V5's rows: identity, anchor, and an optional rectangle a V4 save cannot supply. */
type RoomInstancesV5 = readonly {
  readonly instanceId: string;
  readonly roomCatalogId: string;
  readonly anchorTile: { readonly x: number; readonly y: number };
}[];

/**
 * Drops `capacity` and `objectCapabilities` from every room-instance row, and
 * adds no rectangle.
 *
 * **It invents nothing, and that rests on a fact rather than on an argument.**
 * `RoomZoningService` is the only thing in `src/` that has ever registered a
 * room instance, and it registered `capacity: 0` with `objectCapabilities: []`
 * unconditionally -- so every row any shipped build has ever written holds
 * exactly those two values. Dropping them therefore loses nothing that can be
 * missed: `RoomCapacityResolver` recomputes both at restore from the placed
 * objects (of which a V4 save has none) and the rectangle (which a V4 row does
 * not record), and lands on `0` and `[]` -- the values that were dropped.
 * `tests/migrations/save-v4-to-v5.test.ts` re-verifies the premise off a real
 * captured session rather than trusting this paragraph.
 *
 * **No `width`/`height` is fabricated.** They are optional at V5 precisely so
 * that this step does not have to choose: `1x1` would assert a room the player
 * did not zone and `64x64` one that overlaps its neighbours, and either is the
 * invented-consequence defect. An instance with no rectangle is attributed no
 * objects, so its capacity stays 0 -- which is what it was.
 *
 * And the hard case is unreachable in practice for a *player's* save: while
 * `ZoneRoom` had no producer no save could contain a room instance at all, and
 * the producer arrived in the same release train as this migration. What this
 * handles honestly is a save written by a build that had the Rooms tab and not
 * object placement, plus any hand-authored one.
 */
function dropDerivedRoomFields(instances: RoomInstancesV4): RoomInstancesV5 {
  return instances.map((instance) => ({
    instanceId: instance.instanceId,
    roomCatalogId: instance.roomCatalogId,
    anchorTile: { x: instance.anchorTile.x, y: instance.anchorTile.y },
  }));
}

/**
 * V4 -> V5: a room instance stops carrying its capacity and its capability list,
 * and placed objects gain a section
 * ([ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * decision 6).
 *
 * Two of the three V5 changes need nothing here. The `objects` section is
 * optional and **absent means "no object has been placed"**, which is exactly
 * what every V4 build meant because no V4 build could place one -- so no
 * section is added, on the same reasoning `migrateSaveEnvelopeV2ToV3` gives for
 * declining to fabricate a `simulation` section. `width`/`height` are optional
 * and stay absent, for the reason `dropDerivedRoomFields` states.
 *
 * What is done is the removal, and it is done by rebuilding each row rather
 * than by deleting keys from it: `roomInstanceSchemaV5` is `.strict()`, so a
 * carried-over `capacity` would fail validation at the end of the chain rather
 * than being ignored.
 *
 * `simulation` stays optional and an absent section stays absent -- a V4 save
 * written by a build with no subsystem state genuinely has none, and this
 * function may no more invent one than the two steps before it may.
 *
 * The checksum is recomputed for the reason V1 -> V2 recomputes it, and with the
 * same guarantee: `decodeSaveEnvelope` compares the *stored* checksum against
 * the payload as written, at its declared version, only after the whole chain
 * has run -- so this function's output is never the value that comparison
 * examines.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV4ToV5(input: SaveEnvelopeV4): SaveEnvelopeV5 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const simulation =
    payload.simulation === undefined
      ? undefined
      : {
          ...payload.simulation,
          prisoners: {
            ...payload.simulation.prisoners,
            roomInstanceDefinitions: dropDerivedRoomFields(payload.simulation.prisoners.roomInstanceDefinitions),
          },
        };

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(payload.identity === undefined ? {} : { identity: payload.identity }),
  };

  return {
    saveSchemaVersion: 5,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV5;
}

/** V5's `simulation` section, the only part of the payload V5 -> V6 reshapes. */
type SimulationV5 = NonNullable<SavePayloadV5['simulation']>;

/**
 * V5's tuple rows, with their positions restored.
 *
 * `DeepReadonly` distributes over `readonly (infer Entry)[]`, so it maps a
 * `z.tuple([A, B])` row to `readonly (A | B)[]` -- the arity is lost and the
 * row cannot be destructured. Every element type below is *derived* from the
 * payload type rather than restated, so none of them can drift from the
 * schema; only the positions are asserted, and by the time this step runs
 * `MigrationChain` has already validated the input against
 * `saveEnvelopeV5Schema`, whose rows are `z.tuple`s -- so the positions are a
 * fact about the value, not an assumption about it.
 */
type IncidentRowV5 = readonly [string, Exclude<SimulationV5['incidents']['log'][number][number], string>];
type GuardRowV5 = readonly [number, Exclude<SimulationV5['security']['guards']['records'][number][number], number>];
type SearchJobRowV5 = readonly [string, Exclude<SimulationV5['contraband']['search']['active'][number][number], string>];

/**
 * The one row type restated rather than derived, because both of its positions
 * are strings and their union collapses to `string`.
 *
 * Safe against a future fourth control state without an edit here: this step
 * only ever *reads* `'lockdown'` and only ever *writes* `'normal'`, and passes
 * every other value through untouched.
 */
type SectorControlRowV5 = readonly [string, 'normal' | 'restricted' | 'lockdown'];

/** One V6 response row: what `IncidentResponseSystem.releaseResponse` needs in order to return what the response claimed. */
type ResponseRowV6 = readonly [
  string,
  {
    readonly guardIds: readonly number[];
    readonly arrivedGuardIds: readonly number[];
    readonly containmentStartedAtTick?: number;
    readonly lockdownApplied: boolean;
  },
];

function incidentRows(simulation: SimulationV5): readonly IncidentRowV5[] {
  return simulation.incidents.log as readonly IncidentRowV5[];
}

function guardRows(simulation: SimulationV5): readonly GuardRowV5[] {
  return simulation.security.guards.records as readonly GuardRowV5[];
}

function sectorControlRows(simulation: SimulationV5): readonly SectorControlRowV5[] {
  return simulation.security.sectorControlStates as readonly SectorControlRowV5[];
}

/**
 * The incident states during which a response is committed to an incident.
 * `'active'` is deliberately absent: `tryDispatch` transitions to `'notified'`
 * in the same call that claims the guards and applies the lockdown, so an
 * `'active'` incident has claimed nothing and needs no record.
 */
const RESPONDED_INCIDENT_STATES: ReadonlySet<string> = new Set(['notified', 'responding']);

/**
 * ...and the states during which a lockdown may legitimately still be held.
 * Wider than the set above by `'active'`, because `releaseResponse` refuses to
 * lift a lockdown while *any* incident in the sector is still open -- so a
 * sector in `'lockdown'` with only an `'active'` incident in it is a live,
 * correct state rather than stranded residue.
 */
const OPEN_INCIDENT_STATES: ReadonlySet<string> = new Set(['active', 'notified', 'responding']);

/**
 * The responders a V5 payload records without attributing: every guard in the
 * `'on-search'` deployment phase that no active search job claims.
 *
 * **This is a derivation, not a guess, and it rests on a fact.** Exactly two
 * things in `src/` have ever set `'on-search'` --
 * `IncidentResponseSystem.tryDispatch` and `SearchSystem.assignQueuedOrders`
 * (`grep -rn "setDeploymentPhase(" src/`) -- and a search job's guards are in
 * the payload (`contraband.search.active`). So an `'on-search'` guard that no
 * job names was put there by an incident response and by nothing else.
 *
 * Ascending entity id, from a payload already written in that order.
 */
function unattributedResponders(simulation: SimulationV5): readonly number[] {
  const claimedBySearch = new Set<number>();
  for (const row of simulation.contraband.search.active as readonly SearchJobRowV5[]) {
    for (const guardId of row[1].guardIds) claimedBySearch.add(guardId);
  }
  const responders: number[] = [];
  for (const [guardId, record] of guardRows(simulation)) {
    if (record.deploymentPhase === 'on-search' && !claimedBySearch.has(guardId)) responders.push(guardId);
  }
  return responders;
}

/**
 * Rebuilds `incidents.response` at V6, attributing the responders above to the
 * incidents that are holding them.
 *
 * **A V5 save cannot say which responder belongs to which incident**, and this
 * is the one place the step has to choose. It gives them all to the lowest-id
 * incident that has responders committed (`'notified'` or `'responding'`) and
 * gives every other such incident an empty responder list. Three properties
 * make that the honest choice rather than a convenient one:
 *
 * - **It is exact for a single responded-to incident**, which is the case the
 *   defect was measured on and by far the common one.
 * - **It never strands anything, in any case.** Every responder ends up named
 *   by exactly one record, so whichever incident closes first releases them;
 *   and every record carries its own `lockdownApplied`, so every sector a
 *   response locked down is lifted when its own incident closes, whether or not
 *   that incident was given any guards.
 * - **The worst mis-attribution costs one incident outcome, once.** Guards
 *   pointed at the wrong sector re-travel there and count toward that
 *   incident's arrival quota, so a save with two responded-to incidents may
 *   resolve one and lapse the other where a continuous session would have done
 *   the reverse. That is a play outcome the save genuinely does not determine.
 *   The alternative -- leaving them unattributed -- costs the player the guards
 *   and the sector *permanently*, which is not a play outcome at all.
 *
 * `arrivedGuardIds` is empty and `containmentStartedAtTick` absent because a V5
 * save records neither: a restored responder therefore re-travels (arriving
 * immediately if it is already standing on the post tile) and a restored
 * containment restarts its timer, which is the same bounded restart
 * `SearchSystem.loadSnapshot` and `GuardRoster.loadSnapshot` already take.
 */
function attributeResponses(simulation: SimulationV5): readonly ResponseRowV6[] {
  const lockdownSectorIds = new Set(
    sectorControlRows(simulation)
      .filter((row) => row[1] === 'lockdown')
      .map((row) => row[0]),
  );
  const responded = incidentRows(simulation)
    .filter((row) => RESPONDED_INCIDENT_STATES.has(row[1].state))
    .map((row) => [row[0], row[1].sectorId] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (responded.length === 0) return [];

  const responders = unattributedResponders(simulation);
  return responded.map(
    ([incidentId, sectorId], index) =>
      [
        incidentId,
        {
          guardIds: index === 0 ? responders : [],
          arrivedGuardIds: [],
          lockdownApplied: lockdownSectorIds.has(sectorId),
        },
      ] as const,
  );
}

/**
 * Releases what a V5 save has *already* stranded: responders and a lockdown
 * left behind by an earlier restore, whose incident has since lapsed.
 *
 * This is the population that most needs the migration. A save written after a
 * restore carries the damage rather than the response -- guards `'on-search'`
 * with no incident left to release them, and a sector `'lockdown'` with none
 * left to lift it -- and no record can be reconstructed for an incident that is
 * already terminal, so `attributeResponses` cannot reach them. Nothing in
 * `src/` can either (issue #352: `GuardRoster.unassign`'s callers are all
 * unreachable for an `'on-search'` guard, and there is no dismiss command).
 *
 * **Both repairs are provable from the payload rather than assumed.** For the
 * guards, `unattributedResponders` states the fact they rest on. For the
 * sectors, `IncidentResponseSystem` is the only writer of `'lockdown'` in
 * `src/` (`grep -rn "setControlState" src/`), and it holds one only while an
 * incident in that sector is open -- so `'lockdown'` with no open incident is
 * unambiguously residue. `'restricted'` is never touched.
 *
 * The guard row is rebuilt to exactly what `GuardRoster.unassign` produces:
 * phase `'unassigned'` with no sector, no path request and no patrol
 * bookkeeping. The lockdown needs no door edits -- `navigation.doors` records
 * each governed door at its *baseline* state (see `doorsSnapshot` in
 * `src/simulation/runtime/session-systems.ts`) and
 * `SecuritySectorRegistry.loadSnapshot` re-cascades the restored control state
 * onto it, so writing `'normal'` here is what unlocks the doors on load.
 */
function releaseStrandedClaims(
  simulation: SimulationV5,
  attributed: readonly ResponseRowV6[],
): { readonly guards: readonly GuardRowV5[]; readonly sectorControlStates: readonly SectorControlRowV5[] } {
  const stillClaimed = new Set<number>();
  for (const [, response] of attributed) for (const guardId of response.guardIds) stillClaimed.add(guardId);
  const strandedGuardIds = new Set(unattributedResponders(simulation).filter((guardId) => !stillClaimed.has(guardId)));

  const openSectorIds = new Set(
    incidentRows(simulation)
      .filter((row) => OPEN_INCIDENT_STATES.has(row[1].state))
      .map((row) => row[1].sectorId),
  );

  return {
    guards: guardRows(simulation).map(([guardId, record]) =>
      strandedGuardIds.has(guardId)
        ? ([guardId, { staffRoleId: record.staffRoleId, tileX: record.tileX, tileY: record.tileY, deploymentPhase: 'unassigned' }] as const)
        : ([guardId, record] as const),
    ),
    sectorControlStates: sectorControlRows(simulation).map(([sectorId, state]) =>
      state === 'lockdown' && !openSectorIds.has(sectorId) ? ([sectorId, 'normal'] as const) : ([sectorId, state] as const),
    ),
  };
}

/**
 * V5 -> V6: `simulation.incidents.response` starts carrying the in-flight
 * response records, so a restore can release what a response claimed (#352).
 *
 * This step does something none of the four before it does: it **rewrites two
 * other sections of the payload**, `security.guards.records` and
 * `security.sectorControlStates`. That needs its own justification, because the
 * rule the earlier steps follow is that a migration reshapes the field the
 * version changed and invents nothing.
 *
 * It invents nothing here either. Every value it writes is *derived* from the
 * same payload, by two facts about `src/` that `unattributedResponders` and
 * `releaseStrandedClaims` state and that `tests/migrations/save-v5-to-v6.test.ts`
 * re-measures rather than cites. What makes writing them right rather than an
 * overreach is that the alternative is not neutral: leaving them alone is not
 * "declining to guess", it is choosing the one outcome the player can never
 * undo. A restored V5 save then keeps a sector in permanent lockdown and its
 * responders permanently unusable, with the hiring charge already spent and no
 * command in the game able to reverse either. Ending an emergency response
 * early is a play outcome; a prison that is silently four guards smaller
 * forever is a corrupt save.
 *
 * **What a player notices on loading a V5 save.** If the incident was still
 * open, the response resumes: the responders walk to the incident again and it
 * is contained or lapses on its own deadline, one `IncidentResponseSystem`
 * interval later than a continuous session would have reached it (and, if it
 * had already reached `'responding'`, with its containment timer restarted --
 * at most `containmentTicks`). If the save was written *after* an earlier
 * restore had already stranded them, the lockdown lifts and the guards report
 * for duty the moment the save loads, and the incident that stranded them
 * stays in the log as `'lapsed'`, which is what happened to it.
 *
 * The checksum is recomputed for the reason V1 -> V2 recomputes it, and with
 * the same guarantee: `decodeSaveEnvelope` compares the *stored* checksum
 * against the payload as written, at its declared version, only after the whole
 * chain has run -- so this function's output is never the value that comparison
 * examines. Note what follows from that, and from every step doing the same: a
 * checksum can never catch a field this chain drops or mis-writes, which is why
 * the tests name the fields rather than the digest.
 *
 * Pure: builds new objects and never mutates `input`.
 */
export function migrateSaveEnvelopeV5ToV6(input: SaveEnvelopeV5): SaveEnvelopeV6 {
  const { saveSchemaVersion: _version, checksum: _checksum, payload, ...metadata } = input;

  const simulation = upgradeSimulationSection(payload.simulation);

  const migratedPayload = {
    kernel: payload.kernel,
    world: payload.world,
    construction: payload.construction,
    ...(payload.entities === undefined ? {} : { entities: payload.entities }),
    ...(simulation === undefined ? {} : { simulation }),
    ...(payload.identity === undefined ? {} : { identity: payload.identity }),
  };

  return {
    saveSchemaVersion: 6,
    ...metadata,
    checksum: computeSaveChecksum(migratedPayload as unknown as JsonValue),
    payload: migratedPayload,
  } as SaveEnvelopeV6;
}

/**
 * `simulation` stays optional and an absent section stays absent -- a V5 save
 * written by a build with no subsystem state genuinely has none, and this step
 * may no more invent one than the four before it may.
 */
function upgradeSimulationSection(simulation: SimulationV5 | undefined) {
  if (simulation === undefined) return undefined;
  const responses = attributeResponses(simulation);
  const released = releaseStrandedClaims(simulation, responses);
  return {
    ...simulation,
    security: {
      ...simulation.security,
      sectorControlStates: released.sectorControlStates,
      guards: { ...simulation.security.guards, records: released.guards },
    },
    incidents: {
      ...simulation.incidents,
      response: { metrics: simulation.incidents.response.metrics, responses },
    },
  };
}
