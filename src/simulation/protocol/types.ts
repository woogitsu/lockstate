import { z } from 'zod';
import { isJsonValue, type JsonValue } from '../../shared/json';
// Type-only: erased at build time, so this file still runs no simulation code
// on its account. See `statusCountsIncidentTypeSchema` below for why this is
// the one declaration in this file that names another simulation module at
// all, and why it is a compile-time check rather than a value dependency.
import type { IncidentType } from '../incidents/incident';

export const SIMULATION_PROTOCOL_VERSION = 1 as const;

export const MAIN_TO_WORKER_MESSAGE_KINDS = [
  'protocol/handshake',
  'protocol/ping',
  'simulation/initialize',
  'simulation/set-clock',
  'simulation/submit-command',
  'simulation/request-snapshot',
  'simulation/request-projection',
  'simulation/shutdown',
] as const;

export const WORKER_TO_MAIN_MESSAGE_KINDS = [
  'protocol/handshake-accepted',
  'protocol/pong',
  'simulation/ready',
  'simulation/clock-state',
  'simulation/command-result',
  'simulation/delta',
  'simulation/status-counts',
  'simulation/projection',
  'simulation/snapshot',
  'simulation/event',
  'simulation/stopped',
  'protocol/error',
] as const;

export type DeepReadonly<T> =
  T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends ArrayBuffer
      ? T
      : T extends readonly (infer Entry)[]
        ? readonly DeepReadonly<Entry>[]
        : T extends object
          ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
          : T;

export const jsonValueSchema = z.custom<JsonValue>(
  (value: unknown): value is JsonValue => isJsonValue(value),
);

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const tickSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const sequenceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const uint32Schema = z.number().int().min(0).max(0xffff_ffff);
export const schemaVersionSchema = z.number().int().positive();
const protocolVersionSchema = z.number().int().positive();
const capabilityListSchema = z.array(identifierSchema).max(64);

const structuredClonePayloadSchema = z
  .object({
    schemaId: identifierSchema,
    schemaVersion: schemaVersionSchema,
    transport: z.literal('structured-clone'),
    data: jsonValueSchema,
  })
  .strict();

const arrayBufferPayloadSchema = z
  .object({
    schemaId: identifierSchema,
    schemaVersion: schemaVersionSchema,
    transport: z.literal('array-buffer'),
    contentType: z.string().min(1).max(128),
    byteLength: z.number().int().min(0),
    data: z.instanceof(ArrayBuffer),
  })
  .strict();

export const versionedPayloadSchema = z
  .discriminatedUnion('transport', [
    structuredClonePayloadSchema,
    arrayBufferPayloadSchema,
  ])
  .superRefine((payload, context) => {
    if (
      payload.transport === 'array-buffer' &&
      payload.byteLength !== payload.data.byteLength
    ) {
      context.addIssue({
        code: 'custom',
        message: 'byteLength must match data.byteLength',
        path: ['byteLength'],
      });
    }
  });

export type VersionedPayload = DeepReadonly<
  z.infer<typeof versionedPayloadSchema>
>;

/**
 * The twelve fault codes, as a runtime tuple.
 *
 * A `const` array with the schema derived from it, rather than the literals
 * living only inside `z.enum([...])`, for the same reason
 * `PROTOCOL_DECODE_ERROR_CODES` in `./decode.ts` is shaped this way: a test
 * cannot enumerate the members of a schema that is not exported, so the
 * vocabulary could not be checked for reachability at all.
 * `tests/foundation/fault-code-reachability-contract.test.ts` is what makes an
 * unemitted member a checked state rather than something a reader rediscovers.
 *
 * **One of these twelve is emitted by nothing today**: `shutting-down`, which
 * has never had a producer and is recorded with its reason in that gate's
 * `UNEMITTED_CODES` (#444 item 1). Both directions of the correction are kept
 * here rather than overwritten, because each was wrong in its own way:
 *
 * - This sentence used to read "two of these twelve are currently emitted by
 *   nothing (#187 finding 2)", and it was false in the commit that wrote it --
 *   `6ff871f` made `duplicate-message` and `sequence-gap` reachable and
 *   described them as unreachable in the same change.
 * - The gate then read the vocabulary as fully reachable for the opposite
 *   reason: it matched the code anywhere in the producer's text, and
 *   `state-machine.ts` spells `'shutting-down'` three times as a `WorkerState`.
 *
 * `as const` keeps the literal tuple, so `ProtocolFaultCode` stays these
 * twelve strings and does not widen to `string`.
 */
export const PROTOCOL_FAULT_CODES = [
  'invalid-message',
  'unsupported-protocol-version',
  'unknown-message-kind',
  'invalid-payload',
  'not-initialized',
  'already-initialized',
  'duplicate-message',
  'sequence-gap',
  'invalid-state',
  'snapshot-incompatible',
  'shutting-down',
  'internal-error',
] as const;

const protocolFaultCodeSchema = z.enum(PROTOCOL_FAULT_CODES);

/**
 * The closed set of reasons the worker may refuse or abandon a request.
 *
 * Exported as a type because `SimulationWorkerStateMachine.fault` used to take
 * `code: string` and cast it into this enum, so a typo'd code compiled, shipped
 * and failed only at runtime -- as an `invalid-payload` rejection of the very
 * message that was reporting the original failure, with the real cause gone
 * (issue #139). The cast is gone; this is what replaced it.
 */
export type ProtocolFaultCode = (typeof PROTOCOL_FAULT_CODES)[number];

export const protocolFaultSchema = z
  .object({
    code: protocolFaultCodeSchema,
    message: z.string().min(1).max(2_000),
    recoverable: z.boolean(),
    details: jsonValueSchema.optional(),
  })
  .strict();

export type ProtocolFault = DeepReadonly<z.infer<typeof protocolFaultSchema>>;

const requestEnvelopeFields = {
  protocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION),
  messageId: identifierSchema,
} as const;

const correlatedResponseEnvelopeFields = {
  ...requestEnvelopeFields,
  replyTo: identifierSchema,
} as const;

const optionallyCorrelatedEnvelopeFields = {
  ...requestEnvelopeFields,
  replyTo: identifierSchema.optional(),
} as const;

const speedSchema = z.union([z.literal(1), z.literal(2), z.literal(4)]);

export const clockControlSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('paused') }).strict(),
  z.object({ mode: z.literal('running'), speed: speedSchema }).strict(),
]);

const snapshotReasonSchema = z.enum([
  'manual-save',
  'autosave',
  'consistency-check',
  'shutdown',
]);

const newSimulationSourceSchema = z
  .object({
    kind: z.literal('new'),
    masterSeed: uint32Schema,
  })
  .strict();

const snapshotSimulationSourceSchema = z
  .object({
    kind: z.literal('snapshot'),
    snapshot: versionedPayloadSchema,
  })
  .strict();

const simulationSourceSchema = z.discriminatedUnion('kind', [
  newSimulationSourceSchema,
  snapshotSimulationSourceSchema,
]);

const handshakeMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('protocol/handshake'),
    payload: z
      .object({
        clientBuildId: identifierSchema,
        supportedProtocolVersions: z
          .array(protocolVersionSchema)
          .min(1)
          .max(16),
        capabilities: capabilityListSchema,
      })
      .strict(),
  })
  .strict();

const pingMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('protocol/ping'),
    payload: z.object({ nonce: identifierSchema }).strict(),
  })
  .strict();

const initializeMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/initialize'),
    payload: z
      .object({
        sessionId: identifierSchema,
        source: simulationSourceSchema,
      })
      .strict(),
  })
  .strict();

const setClockMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/set-clock'),
    payload: clockControlSchema,
  })
  .strict();

const submitCommandMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/submit-command'),
    payload: z
      .object({
        commandId: identifierSchema,
        sequence: sequenceSchema,
        executeAtTick: tickSchema,
        command: versionedPayloadSchema,
      })
      .strict(),
  })
  .strict();

const requestSnapshotMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/request-snapshot'),
    payload: z.object({ reason: snapshotReasonSchema }).strict(),
  })
  .strict();

const shutdownMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/shutdown'),
    payload: z
      .object({
        reason: z.enum([
          'page-unload',
          'restart',
          'fatal-error',
          'user-request',
        ]),
      })
      .strict(),
  })
  .strict();

/**
 * Every read model the worker will publish, as a closed wire vocabulary.
 *
 * One id per exported projection in `src/simulation/presentation/` that a
 * panel can ask for. The list is here rather than in the presentation layer
 * because it is a *protocol* vocabulary: it is what a request is allowed to
 * name, and `z.enum` over it is what makes an unknown id fail at the decoder
 * instead of reaching a lookup that would answer `undefined`.
 *
 * A `const` tuple with the schema derived from it, for the same reason
 * `PROTOCOL_FAULT_CODES` and `REFUSAL_REASONS` are shaped this way: a test
 * cannot enumerate the members of a schema that is not exported, so a
 * vocabulary that lived only inside `z.enum([...])` could not be gated for
 * reachability. `tests/foundation/projection-reachability-contract.test.ts`
 * is what enumerates it, and `tests/contract/worker-projection-channel.test.ts`
 * drives every member through a real state machine -- so an id added here
 * without a catalog entry behind it fails rather than becoming the next
 * unreachable projection (#104).
 *
 * `hud/clock-position` is deliberately absent. `projectClockPosition` is a
 * pure function of a tick with no simulation state behind it, and the main
 * thread already has the tick from `simulation/clock-state`, so
 * `src/ui/simulation-clock.ts` computes it on its own side of the boundary
 * rather than paying a round trip for arithmetic.
 */
export const PROJECTION_IDS = [
  'hud/status-strip',
  'hud/build-queue',
  'hud/pending-deliveries',
  'hud/held-guards',
  'hud/prisoner-population',
  'hud/prisoner-roster',
  'hud/prisoner-detail',
  'hud/room-list',
  'hud/room-detail',
  'hud/staff',
  'hud/security',
  'hud/contraband',
  'hud/incidents',
  'hud/incident-detail',
  'world/render-snapshot',
] as const;

export type ProjectionId = (typeof PROJECTION_IDS)[number];

const projectionIdSchema = z.enum(PROJECTION_IDS);

/**
 * The largest window one request may ask for.
 *
 * `docs/HUD_PROJECTIONS.md` contract 5 requires a projection to take
 * `offset`/`limit` rather than return an unbounded list, and #157 finding 1
 * is that the protocol had no direction those two inputs could arrive from.
 * They arrive here -- and a ceiling on `limit` is what stops the direction
 * from re-opening the hole it closes: without one, "the UI may choose the
 * window" and "the UI may ask for all five thousand rows" are the same
 * request.
 *
 * Five times `DEFAULT_VIEW_MODEL_PAGE_LIMIT` (100). Large enough that a panel
 * showing a long list scrolls without paging on every screenful, small enough
 * that the largest legal response is bounded by a constant rather than by the
 * population.
 */
export const MAX_PROJECTION_PAGE_LIMIT = 500;

/**
 * Which row a *detail* projection is about.
 *
 * Two kinds rather than one loose string, because the two id spaces are
 * genuinely different types: `projectPrisonerDetail` takes an `EntityId`
 * (a number, minted per `EntityStore`), while `projectRoomDetail` and
 * `projectIncidentDetail` take a string id. A single field would have had to
 * carry a number as text and parse it back, and a parse at a trust boundary
 * is exactly what this protocol validates in order to avoid.
 *
 * A projection that takes no target must be requested with none: the catalog
 * entry declares what it accepts and the worker rejects a mismatch as
 * `invalid-payload`, so a request naming a room instance on the staff roster
 * fails loudly instead of being ignored.
 */
const projectionTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entity'), entityId: sequenceSchema }).strict(),
  z.object({ kind: z.literal('id'), id: identifierSchema }).strict(),
]);

export type ProjectionTarget = DeepReadonly<z.infer<typeof projectionTargetSchema>>;

/**
 * Ask the worker for one read model (#104, #157 finding 1).
 *
 * A **request**, correlated by `messageId`, and answered by exactly one
 * `simulation/projection` carrying the same id as `replyTo` -- ADR 0003
 * decision 2's correlated pair, not the unsolicited publication
 * `simulation/clock-state` and `simulation/status-counts` use. The reason is
 * the reason those two are publications: a level that changes on its own and
 * that the player is always looking at belongs on a cadence, and a list that
 * only a panel that is open cares about, in a window only that panel knows,
 * belongs on a pull. Pulling also means #157 finding 2 does not arise --
 * `IncidentLog.all()` is unbounded and `ConfiscationLedger` has no windowed
 * accessor, and neither is read at all until something asks.
 */
const requestProjectionMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/request-projection'),
    payload: z
      .object({
        projectionId: projectionIdSchema,
        /** Rows to skip, in the projection's canonical order. Rejected on a projection that has no list. */
        offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
        /** Rows to build, capped by `MAX_PROJECTION_PAGE_LIMIT`. Rejected on a projection that has no list. */
        limit: z.number().int().min(0).max(MAX_PROJECTION_PAGE_LIMIT).optional(),
        target: projectionTargetSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const mainToWorkerMessageSchema = z.discriminatedUnion('kind', [
  handshakeMessageSchema,
  pingMessageSchema,
  initializeMessageSchema,
  setClockMessageSchema,
  submitCommandMessageSchema,
  requestSnapshotMessageSchema,
  requestProjectionMessageSchema,
  shutdownMessageSchema,
]);

export type MainToWorkerMessage = DeepReadonly<
  z.infer<typeof mainToWorkerMessageSchema>
>;

const handshakeAcceptedMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('protocol/handshake-accepted'),
    payload: z
      .object({
        workerBuildId: identifierSchema,
        selectedProtocolVersion: z.literal(SIMULATION_PROTOCOL_VERSION),
        capabilities: capabilityListSchema,
      })
      .strict(),
  })
  .strict();

const pongMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('protocol/pong'),
    payload: z.object({ nonce: identifierSchema }).strict(),
  })
  .strict();

const readyMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/ready'),
    payload: z
      .object({
        sessionId: identifierSchema,
        tick: tickSchema,
        clock: clockControlSchema,
      })
      .strict(),
  })
  .strict();

/**
 * The clock, as the worker sees it.
 *
 * Sent in two situations, which is why `replyTo` is optional here. It is
 * optional on `protocol/error` for the same reason -- a fault need not have
 * been prompted by a request -- and required on every message that is only
 * ever a reply:
 *
 * - **Correlated** (`replyTo` present) -- the acknowledgement of a
 *   `simulation/set-clock`. The main thread asked; this is the answer.
 * - **Unsolicited** (`replyTo` absent) -- the worker publishing that the
 *   tick has moved on while the clock runs. ADR 0003: "Unsolicited deltas
 *   and domain events do not pretend to be request responses", so a
 *   published clock state carries no `replyTo` rather than a fabricated one.
 *
 * Without the second form the main thread can only learn the tick by asking
 * for a full session bundle, so the HUD's day counter either stands still
 * or is guessed from wall time on the wrong side of the boundary. The
 * payload is identical in both cases: whoever reads it does not need to
 * care which prompted it.
 */
const clockStateMessageSchema = z
  .object({
    ...optionallyCorrelatedEnvelopeFields,
    kind: z.literal('simulation/clock-state'),
    payload: z
      .object({
        tick: tickSchema,
        clock: clockControlSchema,
      })
      .strict(),
  })
  .strict();

const queuedCommandResultSchema = z
  .object({
    commandId: identifierSchema,
    sequence: sequenceSchema,
    status: z.literal('queued'),
    scheduledForTick: tickSchema,
  })
  .strict();

const rejectedCommandResultSchema = z
  .object({
    commandId: identifierSchema,
    sequence: sequenceSchema,
    status: z.literal('rejected'),
    fault: protocolFaultSchema,
  })
  .strict();

const commandResultMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/command-result'),
    payload: z.discriminatedUnion('status', [
      queuedCommandResultSchema,
      rejectedCommandResultSchema,
    ]),
  })
  .strict();

const deltaMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/delta'),
    payload: z
      .object({
        baseTick: tickSchema,
        tick: tickSchema,
        delta: versionedPayloadSchema,
      })
      .strict()
      .superRefine((payload, context) => {
        if (payload.tick <= payload.baseTick) {
          context.addIssue({
            code: 'custom',
            message: 'tick must be greater than baseTick',
            path: ['tick'],
          });
        }
      }),
  })
  .strict();

const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * A figure on this channel that may be negative, which `countSchema` may not.
 *
 * One member uses it -- `statusCountsSchema.treasuryMinorUnits` -- and it is a
 * separate schema rather than a loosening of `countSchema` deliberately.
 * Fourteen other members of that object are counts whose floor of `0` is a
 * real invariant (a prisoner count, a coverage share, an incident tally), and
 * a shared schema relaxed for one of them stops checking the rest. See the
 * field's own comment for what moved and why.
 *
 * The same bound the save format settled on for the same quantity
 * (`src/persistence/save-schema.ts`, `economySectionSchema.treasury`):
 * `.int().safe()` still refuses a fraction and still refuses a magnitude
 * outside the safe integer range, which are the two things that were ever
 * load-bearing here. Only the sign moved.
 */
const signedMinorUnitsSchema = z.number().int().safe();

/**
 * Mirrors `IncidentType` (`src/simulation/incidents/incident.ts`) rather than
 * importing its runtime values, exactly as `REFUSAL_REASONS` above mirrors
 * ten domain unions rather than importing them: this file's vocabularies are
 * authored locally so the protocol layer stays free of a dependency on the
 * systems that produce them.
 *
 * Authored, not imported -- **and checked against the real declaration below
 * rather than trusted**, because a hand-copied four-member list is exactly
 * the kind of drift the rest of this file's vocabularies accept only under a
 * test (`tests/unit/simulation-refusals.test.ts` for `REFUSAL_REASONS`). Four
 * members is too small a surface to spend a whole test file on, so the check
 * here is a type-level one instead: `IncidentType` is imported for types only
 * (erased, so this file still runs no simulation code because of it) and
 * `AssertSame` below fails to compile the moment the two lists name a
 * different set of literals, in either direction.
 */
const statusCountsIncidentTypeSchema = z.enum(['assault', 'escape-attempt', 'gang-retaliation', 'riot']);

/**
 * `true` only when `Wide` and `Narrow` name exactly the same literals --
 * neither may have a member the other lacks. A **value**, not merely a type
 * alias: a type alias that resolved to `never` would compile silently and
 * assert nothing, so the check has to be a `const` of that type, assigned
 * `true`, for `tsc` to have something to refuse.
 *
 * **`[Wide] extends [Narrow]`, not the bare `Wide extends Narrow` this
 * started as.** A naked type parameter distributes: `Wide extends Narrow`
 * over a four-member `Wide` checks each of the four members individually and
 * *unions* the four results, so one member missing from `Narrow` produces
 * `never` for that one member and `true` for the rest -- and `never` unioned
 * with anything vanishes, so the check silently passed with a member
 * missing. Measured, not guessed: dropping `'gang-retaliation'` from
 * `statusCountsIncidentTypeSchema` below and running `tsc -b` produced no
 * error from this line at all until the tuple wrapping was added, which is
 * exactly the false confidence this check exists to avoid.
 */
type AssertSame<Wide, Narrow extends Wide> = [Wide] extends [Narrow] ? true : never;
const _statusCountsIncidentTypeMirrorsIncidentType: AssertSame<IncidentType, z.infer<typeof statusCountsIncidentTypeSchema>> =
  true;
void _statusCountsIncidentTypeMirrorsIncidentType;

/**
 * A way the prison currently *is*, rather than a thing that just happened to
 * it -- [ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
 * decision 2, and the amendment of 2026-09-01 that widened decision 1's
 * vocabulary from a recommendation into the owner's ruling on issue
 * [#767](https://github.com/matmaxalez/lockstate/issues/767).
 *
 * **A closed union, not a count and not a level with one current value.**
 * `refusal` and `zoning` below are each *one* current fact, so an optional
 * field says "no such fact yet". A condition set is several facts standing at
 * once by construction -- the −1,220 → −2,180 payroll tick #767 measured
 * crosses `treasury.deliveries-refused` and `treasury.construction-refused`
 * in the same tick, and a shape that could only say one of them would be
 * exactly ADR 0087's Cost 4 (one refusal reason, two rungs) repeated one
 * layer up.
 *
 * **Recomputed from live state at every publication, never written by a
 * handler.** Unlike `RefusalReason`, nothing here has an ordinal, a
 * supersession key or a slot in any log -- see
 * `computeStandingPrisonConditions` in
 * `src/simulation/presentation/status-strip-projection.ts` for the pure
 * function this union's members are read off of. Absence of an id from the
 * published set means that condition is not standing *now*, which is also
 * why nothing here is snapshotted: the state each member reads (the
 * treasury balance, the just-in-time procurement report, the intake
 * pipeline) is already in the save, so a restore re-derives the same set on
 * its first publication rather than needing one of its own.
 *
 * **The first two are what the code had already built as pulled read
 * models before this union existed** -- `BuildQueueMaterialsFundingViewModel.shortfallMinorUnits`
 * (`src/simulation/presentation/construction-projection.ts`) and
 * `PrisonerPopulationCountsViewModel.waitingWithoutPlace`
 * (`src/simulation/presentation/prisoner-projection.ts`) -- moved from a
 * surface that must be opened to one that need not be, which is issue #629's
 * requirement and ADR 0087's own framing of option 4. **The last two are the
 * owner's 2026-09-01 ruling on #767**, which went further than ADR 0087's own
 * recommendation: the standing indicator *and* a crossing notice (see
 * `SimulationEventLog.recordInsolvencyRungCrossed`), because a rung crossed
 * with nobody watching the FUNDS chip is exactly what #767 measured.
 *
 * Declared in the ascending-id order `docs/DETERMINISM.md`'s canonical-order
 * rule asks for, which `computeStandingPrisonConditions` emits in rather than
 * sorting on every call -- the four members are authored in that order
 * already, so iterating this array *is* iterating in canonical order.
 */
export const PRISON_CONDITIONS = [
  'construction.unfunded',
  'intake.no-place',
  'treasury.construction-refused',
  'treasury.deliveries-refused',
] as const;

export type PrisonCondition = (typeof PRISON_CONDITIONS)[number];

const prisonConditionSchema = z.enum(PRISON_CONDITIONS);

/**
 * The `counts` block of the status-strip projection
 * (`src/simulation/presentation/status-strip-projection.ts`), field for
 * field.
 *
 * **Every field used to be a non-negative integer, and this sentence said so
 * outright.** `activeIncidentType` below is the correction: issue #506
 * finding 2 measured that a bare count can never say *which* incident is
 * open, and `IncidentType` is a stable id (ADR 0011), not a count, so the
 * field this fix needed is not a `countSchema` member. What the sentence was
 * really protecting still holds and is worth restating precisely now that a
 * count is no longer the whole of it: **no field here is an object of
 * unbounded size** -- every member is a scalar, a `countSchema` integer, a
 * small closed string enum, or (since ADR 0087 decision 2) an array bounded
 * by a closed union's own size, so the payload's size is still
 * capacity-independent. **This sentence read "no field here is a list" until
 * `conditions` below, and the clause is corrected rather than the field left
 * out**: `PRISON_CONDITIONS` has four members today and the array can never
 * hold more than that many, so the property the old sentence was protecting
 * -- that nothing here grows with the population -- still holds. It is also
 * one of two fields in this object that are `.optional()` rather than
 * required, for the reason each one's own comment gives. The projection also
 * computes a clock position and the active regime blocks; neither is carried
 * here (see `simulation/status-counts` below for why).
 *
 * `.strict()` means the two definitions cannot drift apart quietly: a count
 * added to the projection and not added here is rejected by the main
 * thread's decoder as `invalid-payload`, which
 * `tests/unit/worker-status-counts.test.ts` turns into a failing test rather
 * than a HUD that stops updating.
 */
export const statusCountsSchema = z
  .object({
    prisoners: countSchema,
    prisonersInIntake: countSchema,
    prisonersHighRisk: countSchema,
    staff: countSchema,
    staffUnassigned: countSchema,
    rooms: countSchema,
    roomCapacity: countSchema,
    /**
     * How many prisoners the prison has somewhere to live: the summed
     * `residentCapacity` of the room instances `IntakeSystem` would house an
     * arrival in (`accommodationCapacityOf`,
     * `src/simulation/presentation/status-strip-projection.ts`).
     *
     * A thirteenth count, and the field the strip's occupancy bar and
     * over-capacity warning are the denominator of.
     * `HudCountsViewModel.prisonerCapacity` maps straight from it; before this
     * existed that field was the literal `0`, so the warning could not fire in
     * any session.
     *
     * **A sibling of `roomCapacity` rather than a replacement for it**,
     * because the two are different true facts. A furnished infirmary raises
     * `roomCapacity` -- `object.medical-bed` declares `'sleep-surface'` -- and
     * raises nothing here, because no classification group's
     * `AccommodationPolicy` names `room.infirmary`. Collapsing them would
     * either overstate the prisoner denominator by every medical bed or
     * understate the Rooms readout by every one.
     *
     * **That sentence read "the two are different true facts and each has a
     * reader", and the second clause has never been true.** It was written
     * here at `b20d116`, in the commit that added this field -- at which point
     * `src/ui/simulation-counts.ts` still returned the literal
     * `prisonerCapacity: 0`, so *neither* count had a reader. One commit later
     * `50ca715` gave **this** field one (`prisonerCapacity:
     * counts.accommodationCapacity`, `src/ui/simulation-counts.ts`), and
     * `roomCapacity` has never acquired one: grep it across `src/ui/` and the
     * only occurrences are the three lines of prose in that same file
     * explaining why the mapping is *not* `counts.roomCapacity`.
     * `docs/HUD_PROJECTIONS.md` has said so from the same day and still does
     * -- *"`roomCapacity` stays exactly what it was: the Rooms readout's
     * total, with no reader in `src/ui/` yet"* -- so this comment and that
     * document have disagreed since they were written.
     *
     * The argument above is unaffected and is why the clause is corrected
     * rather than the field withdrawn: `roomCapacity` is published and pinned
     * by `tests/unit/hud-projections.test.ts`, which builds a prison
     * specifically to tell the two apart, and the "Rooms readout" it is the
     * total of is a panel nobody has built. A count with a test and no panel
     * is a different thing from a count with a reader, and saying so is the
     * point.
     *
     * `countSchema`'s floor of `0` is its own invariant: it is a sum of
     * `residentCapacity`, which `deriveRoomCapacity` builds from footprint
     * widths bounded below at 1.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason spelled out on `treasuryMinorUnits` below: one constant covers
     * every projection in `src/simulation/presentation/`, so raising it because
     * the status strip gained a field would assert that the other three changed
     * too.
     */
    accommodationCapacity: countSchema,
    /**
     * How many prisoners hold a **residency assignment** in a room the room
     * catalog declares: the summed `occupancyOf` of the instances
     * `collectRoomInstances` reaches
     * (`src/simulation/presentation/status-strip-projection.ts`), which is the
     * catalog fan-out and therefore carries `docs/HUD_PROJECTIONS.md` gap 15.
     *
     * **An assignment is no longer the same thing as an occupied place, and
     * this field is the assignment.** ADR 0028 decision 2 keeps a resident
     * where they are when the bed under them is taken away, so an assignment
     * outlives its place; `StateIncomeSystem` pays per *place*, through
     * `RoomInstanceRegistry.residentIdsWithExistingPlace`, which clamps each
     * instance's residents to that instance's own `residentCapacity`
     * ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
     * decision A(ii), issue #585). Before that clamp the two were the same
     * number by construction and the income line read this one -- which is
     * exactly why the name still reads like the income count and is not it.
     *
     * **Measured through real commands rather than argued.** A 3x3 `room.cell`
     * with two beds and two prisoners housed in it, with one bed then taken
     * out by `RemoveObject`, publishes **`roomOccupants` 2 against
     * `roomCapacity` 1, one occupied place and a 300 day**
     * (`tests/integration/economy-occupied-place-exists.test.ts`, *"two
     * residents over one remaining bed, in one cell"*, which asserts both
     * figures off the one prison state). A payout derived from this field
     * would pay 600 for one bed, which is the shape #585 exists to remove.
     *
     * `roomCapacity` above is the summed `residentCapacity` of the same
     * instances, so this count standing above it is the over-capacity state
     * ADR 0028 decision 2 names rather than an inconsistency. Whether a player
     * should be shown the two figures side by side is a copy decision and the
     * owner's, in the same way `prisonersUnguarded` below leaves *"6 here, 2
     * paid"* open rather than settling it in a schema comment.
     */
    roomOccupants: countSchema,
    /**
     * How many residency places a prisoner is holding **that currently
     * exist**: `RoomInstanceRegistry.residentIdsWithExistingPlace().length`,
     * which is `min(occupancy, residentCapacity)` summed over every registered
     * instance ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
     * decision A(ii), issue #585).
     *
     * **This is the number the state pays on**, and until now nothing
     * published it. `StateIncomeSystem` credits
     * `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` per unit of it at each day
     * boundary, less what ADR 0064 withholds per unmet need, and
     * `stateIncomeAccruedTodayMinorUnits` below is that same day prorated by
     * the tick. A player could see the money and could not see the count the
     * money is a multiple of.
     *
     * ## Beside `roomOccupants`, never instead of it
     *
     * The two answer different questions and both are true. `roomOccupants` is
     * **assignments** -- who the prison is holding -- and ADR 0028 decision 2
     * keeps an assignment alive when the bed under it is taken away, which is
     * the decision that makes an over-capacity room a legal state rather than
     * a defect. This field is **places**, and it is what the treasury reads.
     * Collapsing them either stops the strip reporting a prisoner the prison
     * is genuinely holding, or pays for a bed that is not there; #585 is the
     * measurement of the second.
     *
     * They diverge in exactly two ways, and only the first is reachable by
     * playing:
     *
     * 1. **A place stops existing under a sitting resident.** Measured through
     *    real commands: a 3x3 `room.cell` with two beds and two prisoners
     *    housed, one bed then taken out with `RemoveObject`, publishes
     *    `roomOccupants` 2, `roomCapacity` 1 and `occupiedPlaces` **1**, and
     *    the day is worth 300 rather than 600
     *    (`tests/integration/economy-occupied-place-exists.test.ts`, *"two
     *    residents over one remaining bed, in one cell"*).
     * 2. **An instance registered under a room-catalog id this build does not
     *    declare.** `roomOccupants` is built by fanning out over catalog ids
     *    (`docs/HUD_PROJECTIONS.md` gap 15) and cannot see one; this field
     *    walks the registry and does. `RoomZoningService` only ever registers
     *    a catalog-defined id, so no `ZoneRoom` reaches it -- it is named
     *    because it is the direction the two counts differ *structurally*,
     *    which no measurement of case 1 would reveal.
     *
     * **It is never a plain over-admission signal.** A prisoner the prison has
     * nowhere to put holds no assignment either, so both counts omit them
     * equally; the gap between `prisoners` and `accommodationCapacity` above is
     * where over-admission shows, and `prisonersUnguarded` below already says
     * so at length. This field moves only when a place a prisoner *holds*
     * stops existing.
     *
     * **No extra walk.** `projectStatusStrip` asks the registry once and folds
     * the same list into the accrual chip through
     * `stateIncomeForOccupiedPlaces`, so publishing this costs a `length` and
     * not a second `O(P log P)` sort at the 5,000-actor tier.
     *
     * **Not a save concern.** Status counts are published, never persisted:
     * they are a `WorkerToMainMessage` payload and no field of them reaches
     * `src/persistence/save-schema.ts`, so `SAVE_SCHEMA_VERSION` is untouched
     * and nothing migrates. **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately
     * not bumped** either, for the reason `accommodationCapacity` above gives:
     * one constant covers every projection in
     * `src/simulation/presentation/`, so raising it because the status strip
     * gained a field would assert that the other three changed too.
     */
    occupiedPlaces: countSchema,
    /**
     * **How many prisoners are standing in a sector on each rung of the guard
     * coverage ladder** (issue #588): `covered` has all the guards it asks
     * for, `understaffed` has some of them, `unguarded` has none.
     *
     * Three counts rather than one ratio, because the strip's job here is that
     * *"the 40s are attributable"*: since ADR 0064 the state withholds
     * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` of the prisoner-day
     * grant per unmet need, and `SafetyCoverageSystem` is what decides whether
     * `safety` is one of them. A player looking at a grant smaller than the
     * headline rate has to be able to see how much of the population is paying
     * that particular 40, and a single percentage cannot say which rung the
     * missing ones are on.
     *
     * They sum to the population **standing in a sector**, which in the
     * shipped single-sector topology is every living prisoner on owned land
     * (ADR 0048 decision 1) -- not necessarily to `prisoners` above, which
     * counts every prisoner in existence including an arrival still in
     * transit. Nothing here should be derived by subtraction from that count.
     *
     * **And that set is not the set the 40s are actually charged on**, which
     * is worth stating here because these counts exist to make the 40s
     * attributable and the gap between the two is a real prison state rather
     * than a rounding error. `StateIncomeSystem` charges per *occupied place*
     * -- a unit of a room instance's `residentCapacity` that a prisoner holds
     * -- while `SafetyCoverageSystem` provisions, and counts, every prisoner
     * the sector covers. An over-capacity prison's unhoused prisoner is in the
     * sector and in these counts, and is on nobody's income line at all.
     *
     * **Measured on the tree this paragraph was written against**, rather than
     * argued: six prisoners admitted into a two-bed prison with nobody on post
     * read `covered 0 / understaffed 0 / unguarded 6` here, while
     * `RoomInstanceRegistry.residentIdsWithExistingPlace()` -- the accessor
     * #610 made the income line's -- answers **two**. Both are right about
     * their own question, and a player who read "6 unguarded" as six withheld
     * 40s would be wrong by four of them. The difference is exactly the
     * population the prison has not housed, which the `prisoners` and
     * `accommodationCapacity` counts beside these already let them see.
     *
     * That asymmetry is deliberate and it is the honest direction: a prisoner
     * with no bed is still somebody the guards are or are not guarding, so
     * provisioning them is right even though the state pays nothing for them.
     * The alternative -- counting only paid places here -- would make the chip
     * silent about exactly the prisoners a player most needs to see, since an
     * unhoused population is what drives a sector hot in the first place
     * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)).
     * [ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
     * decision A(ii) and #610 both sharpen the income side further -- an
     * occupied place is now a bed that currently exists -- which widens this
     * gap without changing what these three counts mean.
     *
     * **Nothing in the shipped interface states the two figures side by side**,
     * so the mis-inference above is available rather than presented; whether
     * the chip should say "6 here, 2 paid" is a copy decision and the owner's,
     * not something to settle in a schema comment.
     *
     * `SafetyCoverageSystem.getCensus` produces them on the same walk that
     * provisions the need, so the readout cannot disagree with what was
     * provisioned. It is at most nine ticks stale, and reads all zeroes for
     * the first ten ticks after a load, which is the ordinary staleness of
     * every ten-tick cadence in the kernel rather than a missing value.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason `accommodationCapacity` above gives.
     */
    prisonersCovered: countSchema,
    prisonersUnderstaffed: countSchema,
    prisonersUnguarded: countSchema,
    activeIncidents: countSchema,
    /**
     * The kind of the incident `activeIncidents` above counts, when the
     * projection can name one -- see `StatusStripViewModel.counts.activeIncidentType`
     * (`src/simulation/presentation/status-strip-projection.ts`) for the full
     * argument (issue #506 finding 2, ADR 0061 decision 6).
     *
     * **The one field in this object that is not a `countSchema` member, and
     * `.optional()` rather than a required possibly-`undefined` union.** That
     * is not merely a style choice: this same view model also crosses the
     * *pulled* `hud/status-strip` route validated by the generic
     * `jsonValueSchema`, and `isJsonValue` accepts a missing key but not an
     * explicit `undefined` value -- see the field's own doc comment on
     * `StatusStripViewModel` for the measured reason. `.optional()` is what
     * makes "absent" the only representation of "no single kind to report" on
     * both channels at once, matching `exactOptionalPropertyTypes`
     * (`tsconfig.json`), which would otherwise let a required-but-`undefined`
     * TypeScript shape drift from what the projection actually sends.
     */
    activeIncidentType: statusCountsIncidentTypeSchema.optional(),
    contrabandDiscovered: countSchema,
    /**
     * What `contrabandDiscovered` above is a count of, as the contraband
     * catalog's own `nameKey`, when the projection can name one category for
     * the whole count -- the owner's ruling 3 on issue #703, *"The message
     * names what contraband was found."* See
     * `StatusStripViewModel.counts.contrabandNameKey`
     * (`src/simulation/presentation/status-strip-projection.ts`) for the full
     * argument, including the two conditions that make it absent.
     *
     * **The second field in this object that is not a `countSchema` member,
     * and the first that is a *key* rather than a stable id.**
     * `identifierSchema`, not a locale-key union: `LocalizationKey` is
     * `string` by declaration (`src/content/localization.ts`), the value comes
     * out of `ContrabandCategoryDefinition.nameKey` which this same schema
     * already validates with `identifierSchema` in
     * `src/content/contraband-catalog.ts`, and the `prisoners.relocated`
     * event's `roomNameKey` crosses the same boundary the same way. A key is
     * not text: ADR 0011 keeps *translated text* off the wire, and the HUD
     * still resolves this one.
     *
     * `.optional()` rather than a required possibly-`undefined` union, for the
     * measured reason `activeIncidentType` above gives: this view model also
     * crosses the pulled `hud/status-strip` route validated by the generic
     * `jsonValueSchema`, and `isJsonValue` accepts a missing key but not an
     * explicit `undefined` value.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason `treasuryMinorUnits` below gives: one constant covers every
     * projection in `src/simulation/presentation/`, so raising it because the
     * status strip gained a field would assert that the other three changed
     * too.
     */
    contrabandNameKey: identifierSchema.optional(),
    /**
     * The treasury balance, in the minor units `Treasury` holds it in (#96).
     *
     * Not a count, because it may be negative: `signedMinorUnitsSchema`, which
     * is `z.number().int().safe()`. It has no maximum to be a share of either,
     * so it is not a `BoundedValue`.
     *
     * **This field was `countSchema` until #703 ruling A, and the sentence that
     * stood here is kept because a reader who meets it elsewhere has to be able
     * to find this one:**
     *
     * > `countSchema`'s floor of 0 is the treasury's own invariant, not an
     * > assumption made here -- `Treasury.spend` refuses rather than
     * > overdrawing, so a negative balance is unreachable, and a schema that
     * > admitted one would be describing a state the simulation cannot be in.
     *
     * **Every clause of that was true when it was written and the premise is
     * now false.**
     * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
     * decision 2 said *"the balance may go negative"* without the schema
     * moving, and #703's ruling of 2026-08-31 -- a standing overdraft every
     * prison has, recorded in
     * [ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
     * §2 -- makes it reachable in a shipped session:
     * `createNewSimulationRuntime` opens `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`
     * on every `Treasury` it builds. So `Treasury.spend` still refuses rather
     * than overdrawing; what it refuses *at* is no longer zero.
     *
     * **What the old bound cost is why this is not a tidy-up.** This object is
     * `.strict()` and carries fifteen other figures, so a prison one minor unit
     * under water published a `simulation/status-counts` the main thread's
     * decoder refused `invalid-payload` -- and a refused message takes the
     * prisoner count, the coverage, the incidents and the arrears down with the
     * balance. A player would not have seen a funds chip showing a minus; they
     * would have seen the whole status strip freeze, which is the *"invisible
     * stall"* [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
     * decision 8 names as the failure to avoid.
     * `tests/integration/economy-negative-balance-readers.test.ts` pins both
     * directions of that boundary.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped for this**,
     * and the reason is a limitation of that constant rather than a judgement
     * that the change is small. One number covers *every* projection in
     * `src/simulation/presentation/` -- the status strip, security, staff and
     * contraband all stamp the same value -- so raising it because the status
     * strip gained a field would assert that the other three changed too.
     *
     * Nothing reads it as a compatibility gate today: the worker and the main
     * thread are one build, and no projection is ever stored, so there is no
     * artifact that a version could disambiguate. If one is ever stored, the
     * constant needs splitting per projection before it can carry that weight,
     * and that is the change to make then rather than a bump now that would
     * be wrong about three of the four.
     */
    treasuryMinorUnits: signedMinorUnitsSchema,
    /**
     * **How far below zero this prison's treasury may be taken**, as a
     * non-positive integer of the same minor units -- the owner's ruling 18 of
     * 2026-08-31.
     *
     * The balance above became a signed figure under #703 ruling A and reached
     * the chip as a bare minus sign: nothing on screen said a facility existed,
     * what it was worth, or how much of it was left. The badge that says so
     * (`hud.status.funds-remaining`, "{remaining} left") needs one number the
     * balance cannot supply, and this is it.
     *
     * **The treasury's own `overdraftFloorMinorUnits`, never
     * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` restated on the other side.** The
     * constant is what `createNewSimulationRuntime` happens to set today; the
     * field is a property of the `Treasury` with a setter, and a badge computed
     * from a constant would keep stating a facility the prison no longer had.
     * The alternative considered and rejected was a second copy of the constant
     * in `src/ui/`, which `src/ui/affordability.ts` already argues against for
     * the host's own pre-check: one definition, read from the object that owns
     * it.
     *
     * **Optional, and absent means "no facility is known".** `0` -- a treasury
     * with the floor closed, and a `source` with no treasury at all -- says the
     * same thing, and the strip draws no badge for either: with no room below
     * zero there is no remainder to state, and the chip's own minus sign is the
     * whole story. It is optional rather than required because this object is
     * `.strict()` and fixtures written before the field exists are decoded
     * whole; a required member would drop each of them and take fifteen other
     * counts down with it, which is the failure `treasuryMinorUnits` above
     * records from the other side.
     *
     * `.max(0)` is `Treasury.setOverdraftFloor`'s own invariant, stated where
     * the wire can enforce it: a floor above zero would be a *minimum balance*,
     * which is a different mechanic nothing here asks for.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason spelled out on `treasuryMinorUnits` above.
     */
    treasuryOverdraftFloorMinorUnits: z.number().int().safe().max(0).optional(),
    /**
     * What the in-game day in progress has earned so far, in the same minor
     * units (#29, ADR 0017 decision 3).
     *
     * A twelfth count on a channel that carried eleven. It is an integer like
     * every other member, has no maximum to be a share of, and adds no row --
     * so `docs/HUD_PROJECTIONS.md` contract 5 (paging) still has nothing to
     * bound here, which is the property that number is load-bearing for.
     *
     * `countSchema`'s floor of `0` is this figure's own invariant rather than
     * an assumption: it is `rate x occupied places x ticks served / day
     * length`, and none of the three factors can be negative.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason spelled out on `treasuryMinorUnits` above: one constant covers
     * every projection in `src/simulation/presentation/`, so raising it because
     * the status strip gained a field would assert that the other three changed
     * too.
     */
    stateIncomeAccruedTodayMinorUnits: countSchema,
    /**
     * What one in-game day of the current roster costs, in the same minor
     * units ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
     * step 3).
     *
     * The fourteenth count, and the first **cost** on this channel: every debit
     * before payroll was a purchase the player chose, so there was no rate to
     * show. `PayrollSystem` charges it at every in-game day boundary and the
     * player cannot decline it, which is what makes it worth a permanent
     * readout rather than a line on the Staff panel.
     *
     * `countSchema`'s floor of `0` is the figure's own invariant: it is a sum
     * of `wageBand.minPerDay` over the roster, and the catalogue schema bounds
     * that below at zero.
     */
    dailyWageBillMinorUnits: countSchema,
    /**
     * Wages billed and not paid, in the same minor units (ADR 0042 step 3,
     * [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
     * decision 8).
     *
     * The fifteenth, and the one that is `0` in every prison that is being run
     * well. ADR 0017 decision 8 settles that insolvency is *"a state, not a
     * loss condition"* and warns in the same paragraph that a degradation
     * nobody surfaces is *"the same invisible stall as #89"* -- so the state
     * has to be sayable, and this is what says it.
     *
     * **`countSchema`'s floor of `0` is not the same invariant as
     * `treasuryMinorUnits`', and the pair is deliberate.** The balance is
     * non-negative because `Treasury.spend` refuses rather than overdrawing;
     * this is non-negative because it is a debt. Between them they hold the
     * state a signed balance would have held in one field -- and a signed
     * balance was rejected, because a treasury that could overdraw would pay
     * the wages and decision 8's ladder would never reach its bottom rung.
     */
    unpaidWagesMinorUnits: countSchema,
    /**
     * The ways the prison currently *is*, as a set of `PrisonCondition`
     * members ([ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
     * decision 2). See `PrisonCondition` above for what a member means and
     * why this is a set rather than a level like `refusal` below.
     *
     * **Optional for the reason `treasuryOverdraftFloorMinorUnits` above is**:
     * this object is `.strict()` and a fixture written before this field
     * existed decodes whole only if the key may be missing. `conditions` is
     * nonetheless **always published** by `projectStatusStrip` -- an empty
     * array when nothing is standing, never an absent key -- exactly as that
     * field is always published though the schema admits its absence.
     *
     * In canonical (ascending id) order, per `docs/DETERMINISM.md`, and
     * bounded above by `PRISON_CONDITIONS.length`: the array can name each
     * member at most once, so a producer that somehow duplicated one would be
     * refused here rather than accepted and misread as two standing facts.
     *
     * **Nothing in the save.** Every member is recomputed from state the save
     * already carries -- the treasury balance, the just-in-time procurement
     * report, the intake pipeline -- so a restore re-derives the same set on
     * its first publication instead of needing a slot of its own.
     *
     * **`HUD_VIEW_MODEL_SCHEMA_VERSION` is deliberately not bumped**, for the
     * reason spelled out on `treasuryMinorUnits` above.
     */
    conditions: z.array(prisonConditionSchema).max(PRISON_CONDITIONS.length).optional(),
  })
  .strict();

export type SimulationStatusCounts = DeepReadonly<
  z.infer<typeof statusCountsSchema>
>;

/**
 * Every reason the simulation itself refuses something the player asked for.
 *
 * Not a fault code and not a command rejection. `ProtocolFaultCode` and
 * `simulation/command-result`'s `rejected` form both describe a command that
 * never reached the kernel; these describe a command that was accepted,
 * ordered, dispatched at its tick -- and then refused on its *content* by the
 * system that ran it. `SimulationWorkerStateMachine.handleSubmitCommand` has already
 * answered `status: 'queued'` by then, and ADR 0003 decision 9 is explicit
 * that the queued acknowledgement "never reports a command as applied": this
 * vocabulary is what the simulation says instead.
 *
 * A stable id, never a sentence (ADR 0011). The main thread maps each id to a
 * message key in `src/ui/simulation-alerts.ts`; no text crosses the boundary.
 *
 * Declared in ascending code-unit order, and namespaced by the command the
 * refusal answers, so the eleven vocabularies behind it cannot collide:
 * `admit.*` mirrors `AdmitPrisonerRefusalReason`, `build.*` mirrors
 * `BuildOrder.failReason`, `cancel-purchase.*` mirrors
 * `PurchaseCancelRefusalReason`, `dismiss.*` mirrors
 * `StaffDismissRefusalReason`, `hire.*` mirrors `StaffHireRefusalReason`,
 * `place-object.*` mirrors `PlaceObjectRefusalReason`,
 * `purchase.*` mirrors `PurchaseOutcome`'s refusal reasons,
 * `release-guard.*` mirrors `GuardReleaseRefusalReason`,
 * `remove-object.*` mirrors `RemoveObjectRefusalReason`, `unzone.*` mirrors
 * `UnzoneRoomRefusalReason` and `zone.*` mirrors `ZoneRoomRefusalReason`. The
 * namespace is doing real work rather than being tidy -- `out-of-bounds` and
 * `unowned-land` are members of *two* of those domain vocabularies,
 * `insufficient-funds` and `invalid-area` are each a member of two others, and
 * `duplicate-order` is a member of *three* (`build.*`, `place-object.*` and
 * `purchase.*`), and each means something different to a player depending on
 * which command it answers, so one flat id per spelling would put one
 * sentence on several.
 *
 * `src/simulation/refusals/refusal-log.ts` maps each domain value onto one of
 * these through an exhaustive `Record`, so a reason added to any of the eleven
 * fails to compile until it is named here -- and
 * `tests/unit/simulation-refusals.test.ts` asserts the eleven tables between
 * them cover this list exactly, so a member declared here and produced by
 * nothing is a failure too.
 *
 * `remove-object.nothing-to-remove` is spelled the way `unzone.nothing-to-remove`
 * is because it is the same fact about a different gesture, and it is namespaced
 * for exactly the reason this comment gives: "the player pressed where there was
 * no room" and "the player pressed where there was no object" are two sentences,
 * and one flat id would put one of them on both.
 *
 * `cancel-purchase.*` is the ninth namespace and it is a namespace of its own
 * against `purchase.*` for the same reason `unzone.*` is one against `zone.*`
 * (#285): the treasury is involved in both and the player is doing opposite
 * things, so somebody who pressed Cancel on a delivery must not read that the
 * materials were not ordered.
 *
 * `release-guard.*` is the tenth (ADR 0034), and its `unknown-guard` is the
 * fifth demonstration of the namespace doing real work: `hire.unknown-role`,
 * `purchase.unknown-material` and `place-object.unknown-buildable` are all
 * "the simulation has no such thing",
 * and this one is about a *person* rather than a
 * catalogue entry, which is a different sentence to read. Both of its members are
 * mapped even though only `not-held` is reachable from the panel, for the reason
 * every other table maps its whole union: a command composed anywhere else -- a
 * queued command in a restored save, a future producer -- can still provoke the
 * other.
 *
 * `build.unknown-buildable` is the sharpest instance of that last point.
 * `place-object.unknown-buildable` is the same condition on the same
 * registry, reached by `PlaceObject` instead: two commands carry a
 * `BUILDABLE_REGISTRY` id, `ObjectPlacementService` checked its one and
 * `ConstructionSystem.submitOrder` checked nothing, so an unknown id on a
 * `PlaceBuildOrder` was approved and `ConstructionSystem.update` then threw out
 * of a scheduled system update for the rest of the session -- and, since the
 * order is snapshotted, for the rest of the save's life. Two spellings of one
 * fact, each answering a different command, is exactly what the namespace is
 * for; that only one of them existed is what the defect was.
 *
 * `dismiss.*` is the eleventh namespace (issue #533), and it is a namespace of
 * its own against the *two* it sits between rather than one. Against `hire.*`,
 * for `cancel-purchase.*`'s reason: opposite gestures on one roster, and
 * somebody who pressed Dismiss must not read that nobody was hired. Against
 * `release-guard.*`, which is the harder case because the two commands name the
 * same staff id read off the same panel: a release that failed leaves a guard
 * employed and assigned, a dismissal that failed leaves them employed and being
 * paid, and those are two sentences. `unknown-staff` is a third spelling of
 * "the simulation has no such thing" beside `release-guard.unknown-guard` --
 * the same roster, the same absence, and a different thing the player was
 * trying to do.
 *
 * `build.duplicate-order` is the newest member (issue #514) and the first
 * spelling shared by *three* of the ten vocabularies at once rather than two:
 * `place-object.duplicate-order` and `purchase.duplicate-order` already meant
 * "a request just like this one is already standing", and `submitOrder`
 * simply never asked the question `ObjectPlacementService.place` and
 * `ProcurementSystem.purchase` both already ask. Before it existed, *Place
 * order* pressed several times for the same wall queued one order per press --
 * each approved, each eventually consuming its own materials -- for a tile
 * that can only ever hold one wall; the namespace is why that press reads as
 * "the build order failed" and not as "the materials were not ordered" or "the
 * object was not placed", the sentence either of the other two spellings would
 * have given it.
 */
export const REFUSAL_REASONS = [
  'admit.no-accommodation',
  'admit.population-full',
  'build.duplicate-order',
  'build.out-of-bounds',
  'build.unbuildable',
  'build.unbuildable-terrain',
  'build.unknown-buildable',
  'build.unowned-land',
  'build.water-blocked',
  'cancel-purchase.not-pending',
  'dismiss.unknown-staff',
  'hire.insufficient-funds',
  'hire.no-duty-for-role',
  'hire.roster-full',
  'hire.unknown-role',
  'place-object.duplicate-order',
  'place-object.not-a-placeable-object',
  'place-object.out-of-bounds',
  'place-object.outside-room',
  'place-object.tile-occupied',
  'place-object.unknown-buildable',
  'place-object.unowned-land',
  'purchase.duplicate-order',
  'purchase.insufficient-funds',
  'purchase.invalid-quantity',
  'purchase.unknown-material',
  'release-guard.not-held',
  'release-guard.unknown-guard',
  'remove-object.nothing-to-remove',
  'unzone.invalid-area',
  'unzone.nothing-to-remove',
  'unzone.room-occupied',
  'zone.below-minimum-size',
  'zone.duplicate-instance-id',
  'zone.invalid-area',
  'zone.not-enclosed',
  'zone.out-of-bounds',
  'zone.overlaps-existing-room',
  'zone.unknown-room-type',
  'zone.unowned-land',
] as const;

export type RefusalReason = (typeof REFUSAL_REASONS)[number];

/**
 * The most recent refusal, and how many there have been.
 *
 * **Snapshot-shaped, because the channel that carries it is.**
 * `simulation/status-counts` is published on a cadence and only when
 * something it reports has changed; it is a statement about the session *as
 * of* `tick`, not a stream of events. A queue of individual refusals could
 * not be carried honestly here -- the publication is rate-limited and
 * skippable, so a consumer could not tell a queue that was drained from one
 * that was never sent, and its size would grow with the session, which is
 * exactly what `docs/HUD_PROJECTIONS.md` contract 5 forbids on a cadence.
 * "The last refusal was X" and "there have been N of them" are both plain
 * readings of current state, so both survive being read late, twice, or not
 * at all.
 *
 * `sequence` is 1-based and increments once per refusal, so it is *both*
 * facts at once: the ordinal of this refusal and the total recorded so far.
 * It also gives the main thread a stable row identity -- republishing the
 * same refusal alongside a changed count must not rebuild the row
 * (`HudAlertViewModel.id`).
 *
 * `tick` is the tick the refusal happened on, which is not necessarily the
 * `tick` on the envelope around it: the publication reports the state as of a
 * later tick, and a refusal that is still the most recent one keeps its own.
 */
const refusalSchema = z
  .object({
    sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    tick: tickSchema,
    reason: z.enum(REFUSAL_REASONS),
  })
  .strict();

export type SimulationRefusal = DeepReadonly<z.infer<typeof refusalSchema>>;

/**
 * What the last accepted room designation says about itself.
 *
 * A second sibling of `counts`, declared for the reason `refusal` is one: it
 * is not a status-strip count -- it comes from `RoomZoningService` rather than
 * from `src/simulation/presentation/` -- and it is absent, not zeroed, until
 * this session has designated a room, because "no room has been zoned" and "a
 * room was zoned" are different facts.
 *
 * **Two enums and two integers, and deliberately nothing else.** No room id,
 * no tile, no text. `requirement` is what the room definition asks for
 * (`enclosed`, `outdoors`, or `none` for a definition that carries neither)
 * and `enclosure` is what the world answered for the rectangle that was zoned,
 * so the notice is self-describing without the main thread having to remember
 * what it asked for -- and ADR 0011's separation is untouched, because neither
 * value is a message key and neither is a sentence.
 *
 * `enclosure` is the answer to a *narrower* question than "is this room
 * indoors": `src/simulation/rooms/enclosure.ts` reads the perimeter of the
 * rectangle and nothing else, and states in full what that does and does not
 * mean. Nothing in the simulation gates on it -- it is reported to the player
 * and not enforced -- which is why it travels on the readout channel rather
 * than as a refusal.
 *
 * `sequence` is 1-based and increments once per accepted zoning, so it is both
 * this notice's ordinal and how many rooms the session has designated; the main
 * thread needs it to tell a republished notice from a new one, exactly as it
 * does for a refusal. `tick` is the tick the room was zoned on, which is not
 * necessarily the envelope's.
 */
const zoningNoticeSchema = z
  .object({
    sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    tick: tickSchema,
    enclosure: z.enum(['sealed', 'open']),
    requirement: z.enum(['enclosed', 'outdoors', 'none']),
  })
  .strict();

export type SimulationZoningNotice = DeepReadonly<z.infer<typeof zoningNoticeSchema>>;

/**
 * The status-strip counts, as the worker sees them.
 *
 * **Always unsolicited.** Nothing requests it, so it has no `replyTo` field
 * at all rather than an optional one -- `.strict()` therefore rejects a
 * correlated form outright. That is the stronger half of ADR 0003 decision
 * 2 ("Unsolicited deltas and domain events do not pretend to be request
 * responses"): `simulation/clock-state` needs `replyTo` to be *optional*
 * because it is also the acknowledgement of a `simulation/set-clock`, while
 * this message, like `simulation/delta` and `simulation/event`, is only ever
 * a publication. A fabricated `replyTo` would resolve whichever pending
 * request on the main thread happened to share that id.
 *
 * `tick` is the tick the counts were read at, so a readout can never be
 * mistaken for a statement about a later state than the one it describes.
 *
 * `schemaVersion` is the projection's own
 * `HUD_VIEW_MODEL_SCHEMA_VERSION`, carried so the view-model shape can
 * evolve without an envelope-version change (ADR 0003 decision 5). There is
 * no `schemaId` beside it, unlike `versionedPayloadSchema`: that type exists
 * to describe an *opaque* `data` blob, and here the message kind already
 * names which schema the payload follows and every field of it is validated
 * above.
 *
 * `refusal` is a sibling of `counts`, not a member of it. `counts` is
 * documented and `.strict()`-pinned as the projection's own `counts` block
 * field for field, and a refusal is not a status-strip count: it comes from
 * the session's `RefusalLog` rather than from
 * `src/simulation/presentation/`, and putting it inside would make that
 * correspondence false. It is absent -- not zero, not null -- until the
 * simulation has refused something, because "no refusal has happened" and "a
 * refusal happened" are different facts and an optional field is how this
 * schema already says so elsewhere.
 *
 * `zoning` is the third field of the payload and the second sibling of
 * `counts`, for exactly the reasons `refusal` is one; `zoningNoticeSchema`
 * above states them.
 */
const statusCountsMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/status-counts'),
    payload: z
      .object({
        tick: tickSchema,
        schemaVersion: schemaVersionSchema,
        counts: statusCountsSchema,
        refusal: refusalSchema.optional(),
        zoning: zoningNoticeSchema.optional(),
      })
      .strict(),
  })
  .strict();

/**
 * The window a paged projection actually built.
 *
 * Declared and `.strict()` on the envelope even though the paged view models
 * carry a `ViewModelPage` of their own, because this is the half of
 * `docs/HUD_PROJECTIONS.md` contract 5 that a boundary can check: the body is
 * an opaque `versionedPayload` (see below), so without these three integers
 * "the projection honoured the window it was asked for" would be unverifiable
 * from outside the projection. `total` is the full row count, so a panel can
 * size a scrollbar without asking for every row.
 *
 * Absent -- not zeroed -- on a projection that has no list, because "this
 * projection does not page" and "this page is empty" are different facts.
 */
const projectionPageSchema = z
  .object({
    total: countSchema,
    offset: countSchema,
    limit: countSchema,
  })
  .strict();

/**
 * One read model, in answer to one `simulation/request-projection`.
 *
 * **Only ever a reply**, so `replyTo` is required rather than optional --
 * the other side of the rule ADR 0003's 2026-08-23 amendment states.
 * `simulation/status-counts` has no `replyTo` field at all because it is only
 * ever a publication; this one always has it because it is only ever an
 * answer. Nothing publishes a `simulation/projection` on a timer, and that is
 * the design rather than an omission: see the ADR amendment this message
 * carries.
 *
 * `tick` is the tick the projection was read at, for the reason every readout
 * on this boundary carries one -- a view model that arrived late must not be
 * mistaken for a statement about the state that exists when it is painted.
 *
 * `view` is a `versionedPayload`, and that is a deliberate difference from
 * `simulation/status-counts`, which declares every field. The argument that
 * settled that one -- "the message kind already names which schema the
 * payload follows, so declare it" -- does not hold here: this kind names a
 * *family* and `projectionId` selects the member, so declaring every field
 * would mean a second copy of all 2,446 lines of `src/simulation/presentation/`
 * written in Zod, and a copy that drifts is the failure the `.strict()` there
 * exists to prevent, reproduced eleven times over. `versionedPayloadSchema`
 * is the type this protocol already has for an opaque body carried with its
 * own `schemaId` and `schemaVersion` (ADR 0003 decision 5), and its
 * `jsonValueSchema` still enforces at the boundary the property that actually
 * matters here: finite numbers, no cycles, no class instances, bounded depth
 * -- structured-clone safety, which is `docs/HUD_PROJECTIONS.md` contract 1's
 * own guarantee restated where it can be checked.
 *
 * `view` is **absent** when a detail projection was asked about a target that
 * does not exist -- `projectPrisonerDetail` and its two siblings return
 * `undefined` for an unknown or destroyed id, and an absent field is how this
 * schema says "no such thing" elsewhere too. It is not an error: asking about
 * a prisoner who was released between the click and the reply is a race the
 * UI is expected to handle, not a protocol fault.
 */
const projectionMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/projection'),
    payload: z
      .object({
        projectionId: projectionIdSchema,
        tick: tickSchema,
        page: projectionPageSchema.optional(),
        view: versionedPayloadSchema.optional(),
      })
      .strict(),
  })
  .strict();

const snapshotMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/snapshot'),
    payload: z
      .object({
        tick: tickSchema,
        reason: snapshotReasonSchema,
        snapshot: versionedPayloadSchema,
      })
      .strict(),
  })
  .strict();

/**
 * What the prison has to say for itself when nothing went wrong.
 *
 * The closed vocabulary of `simulation/event`, and the third of the three
 * ADR 0003 decision 2 families to get a producer -- "asynchronous domain
 * events" was named there and had none until issue #507. `simulation/delta`
 * carries where the actors are and `simulation/status-counts` carries what
 * the prison currently *is*; this carries what it just *did*.
 *
 * ## Why this is not a `versionedPayload`, which is what it used to be
 *
 * The envelope shipped with `event: versionedPayloadSchema` -- an opaque
 * `data` blob under a `schemaId` -- and nothing ever constructed one
 * (`tests/foundation/message-kind-reachability-contract.test.ts` recorded it
 * as sent by nobody and read by nobody for as long as it had existed). An
 * opaque payload was the right shape while the family was a placeholder and
 * is the wrong one now that it has producers, for the reason
 * `REFUSAL_LABEL_KEYS` and `PROTOCOL_FAULT_LABEL_KEYS` are `Record`s over
 * closed unions rather than lookups with a fallback: a member added here must
 * **fail to compile** until somebody has decided what it says to a player.
 * A `versionedPayload` cannot have that property -- its `data` is `unknown`
 * to the boundary by construction -- so an event type added under it would
 * have reached the HUD as a blob nothing had a sentence for. Narrowing an
 * unused message is free: there is no older peer that ever sent one.
 *
 * ## Why an event and not a fourth sibling of `counts`
 *
 * `refusal` and `zoning` ride `simulation/status-counts` as *snapshots* --
 * "the last refusal was X", republished with every later readout so a
 * listener that starts late reads the same state as one that was there all
 * along. That works because each is a level: exactly one is current, and
 * re-asserting it is not a lie. It does not work for these. "Two prisoners
 * finished their sentences" is true **once**, at a tick; republishing it on
 * the counts cadence twice a second would tell the player it had happened
 * again, and a third and fourth sibling is the case-by-case handling issue
 * #507 exists to stop. That channel says so about itself, at length, above
 * `refusalSchema`: it is rate-limited and skippable, so a queue on it could
 * not be told from one that was never sent. This message is neither -- it is
 * posted once per event and nothing coalesces it -- so a queue is honest
 * here in exactly the way it is not honest there.
 *
 * `sequence` is 1-based and increments once per event across the whole
 * channel rather than per type, so it is both this event's ordinal and how
 * many the session has emitted. The main thread keys its row on it
 * (`HudAlertViewModel.id`) and the publisher uses it as a watermark, exactly
 * as `refusal.sequence` serves both purposes.
 *
 * `tick` is the tick the event *happened* on, which is not the `tick` on the
 * envelope around it: the publication reports it on the next tick-loop wake,
 * and the distinction is the same one `refusalSchema` draws.
 */
export const SIMULATION_EVENT_TYPES = [
  'contraband.discovered',
  'economy.construction-refused',
  'economy.deliveries-refused',
  'economy.wages-unpaid',
  'incidents.all-clear',
  'incidents.assault-opened',
  'incidents.escape-attempt-opened',
  'incidents.escape-succeeded',
  'incidents.gang-retaliation-opened',
  'incidents.riot-opened',
  'prisoners.discharged',
  'prisoners.relocated',
] as const;

export type SimulationEventType = (typeof SIMULATION_EVENT_TYPES)[number];

/**
 * The two fields every event carries, spread into each member so the union
 * discriminates on a top-level `type` rather than nesting a `detail` object.
 * The same shape `requestEnvelopeFields` is spread with, one level down.
 */
const simulationEventEnvelopeFields = {
  sequence: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  tick: tickSchema,
};

/**
 * Prisoners whose sentences ended left the prison on this tick (ADR 0050).
 *
 * **A count, not an identity, and one event per tick rather than one per
 * prisoner.** `PrisonerDischargeSystem.update` releases everybody `due()`
 * returns in a single pass, so a prison whose intake arrived together
 * discharges together; one event per prisoner would put a burst of identical
 * rows on the channel for what a player reads as one occurrence. The count
 * is therefore the aggregate for the tick, and it is `min(1)` because an
 * event is only emitted when somebody actually left -- "zero prisoners were
 * discharged" is not an event, it is every other tick.
 *
 * No entity id and no name. ADR 0011 keeps text off the wire, and an id
 * would be an identity for a prisoner who no longer exists by the time the
 * main thread reads it -- `releasePrisoner` has already dropped them from
 * every store, which is exactly what `projectPrisonerDetail` answers
 * `undefined` for. A roster row the player could click does not survive the
 * event that reports it.
 */
const dischargedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('prisoners.discharged'),
    count: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

/**
 * A resident whose bed was taken away has been moved into accommodation that
 * exists ([ADR 0076](../../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(i)).
 *
 * **One event per resident, where `prisoners.discharged` is one per tick, and
 * the difference is what the sentence says.** A discharge is reported as a
 * count because a player reads a cohort leaving as one occurrence; this
 * sentence names *one prisoner* and *one room*, so a removal that rehouses two
 * residents is two of these. That grain is the owner's, not this schema's: the
 * approved wording is "{name} had nowhere to sleep and moved to {room}.", and
 * a per-removal aggregate could not fill either placeholder.
 *
 * ## Why this one carries an identity when the channel's own comment says none do
 *
 * `SimulationEventLog`'s class comment reads *"It carries no identity. No
 * entity id, no name, no tile"*, and gives `prisoners.discharged`'s reason:
 * *"the subject of a discharge event does not exist by the time the main
 * thread reads it"*. **That reason is the whole of the rule, and it is false
 * of this event** -- the subject is alive, housed, and already on the roster
 * projection under this very `entityId`, with these very two name halves
 * (`PrisonerRosterRowViewModel.name`). So the sentence is narrowed where it
 * stands rather than deleted: identity stays off this channel wherever the
 * subject may be gone, and this member is the exception that says why.
 *
 * **ADR 0011 is not bent by it either.** What that decision keeps off the wire
 * is *translated text*: a name is player-facing **state**, minted from
 * `identity.actor-name` and identical in every locale
 * (`src/simulation/identity/actor-identity.ts`), and `roomNameKey` is a
 * *message key* -- the same field, resolved from the same catalog, that
 * `PrisonerRoomRefViewModel.roomNameKey` already carries to the roster panel.
 * No sentence crosses here; the main thread still assembles one.
 *
 * `name` is optional for the reason `PrisonerRosterRowViewModel.name` is: a
 * session wired without an identity registry mints nobody, and the HUD names
 * such a prisoner by entity id (`hud.regime.roster-unnamed`) rather than
 * saying nothing at all.
 */
const residentRelocatedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('prisoners.relocated'),
    entityId: sequenceSchema,
    name: z
      .object({
        givenName: z.string().min(1).max(128),
        familyName: z.string().min(1).max(128),
      })
      .strict()
      .optional(),
    /** The room they now live in, as the catalog's own `nameKey`. */
    roomNameKey: identifierSchema,
  })
  .strict();

/**
 * Payday came and the treasury could not cover the wage bill (ADR 0049).
 *
 * Carries the arrears *after* the payday it reports -- the same figure
 * `PayrollSystem.unpaidWagesMinorUnits` exposes and the save persists -- in
 * minor units, because ADR 0017 keeps money integral all the way to the DOM
 * and the HUD formats it at the last moment.
 *
 * **The event is the payday, not the condition.** ADR 0049 decided
 * insolvency is a state rather than a loss condition, and a state belongs on
 * a readout; what belongs here is the moment it bit. `PayrollSystem` runs
 * once per in-game day, so this is bounded at one event per day however deep
 * the hole is, and a prison that stays broke says so once a day rather than
 * twice a second. That also means it needs nothing persisted of its own: the
 * arrears are already in the save (ADR 0049, "arrears are *history*"), so a
 * restored session re-announces at its next failed payday rather than
 * replaying one the player has already read.
 *
 * `min(1)` for the reason the discharge count is: a payday that was met in
 * full emits nothing.
 */
const wagesUnpaidEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('economy.wages-unpaid'),
    unpaidWagesMinorUnits: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

/**
 * The treasury just fell to or below the deliveries rung
 * (`INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`, ADR 0017's "Amendment,
 * 2026-09-01", ruling 19) -- the owner's ruling of 2026-09-01 on issue
 * [#767](https://github.com/matmaxalez/lockstate/issues/767): *"a persistent
 * indicator ... plus a one-off notice at the moment of crossing, so a player
 * who was looking elsewhere gets a nudge."*
 *
 * **The event is the crossing, not the state.** `treasury.deliveries-refused`
 * on `statusCountsSchema.conditions` is the state and is recomputed forever;
 * this fires exactly once per transition into it, from
 * `InsolvencyRungSystem` (`src/simulation/economy/insolvency-rung-system.ts`),
 * which is what keeps it from repeating on every tick the prison stays
 * refused -- the same shape `PayrollSystem.recordUnpaidWages` and
 * `IncidentTriggerSystem`'s opening events already take of a standing fact,
 * and the reason ADR 0087 Cost 1 gives for why a *condition* must never be
 * carried this way is exactly why a *crossing* may: this is emitted once,
 * not once per tick the fact remains true.
 *
 * No figure carried, matching `incidents.all-clear` and the three
 * zero-parameter incident openings: the sentence names what changed and the
 * `treasury.deliveries-refused` condition beside it is where a player reads
 * the standing fact, exactly as `economy.wages-unpaid` carries the arrears
 * and `incidents.riot-opened` alone among the incident events carries a
 * count, because each of those is the one whose sentence needs a number.
 * This one's does not.
 */
const deliveriesRefusedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('economy.deliveries-refused'),
  })
  .strict();

/**
 * The treasury just fell to or below the construction rung
 * (`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`, ADR 0017's "Amendment,
 * 2026-09-01", ruling 19) -- the same ruling and the same mechanism as
 * `deliveriesRefusedEventSchema` above, for the deeper of the two rungs a
 * single payroll tick crossed in issue #767's measurement (−1,220 →
 * −2,180, crossing both in one step).
 *
 * **A member of its own rather than a `rung` field on one event**, for the
 * reason the four incident-opening members are members rather than one event
 * with an `IncidentType` field: `EVENT_PRESENTATION` grades a sentence by
 * `type` alone, and "deliveries refused" and "construction halted" are two
 * different sentences (ADR 0017 decision 8's own words for the ladder), not
 * one sentence with a slot. Carrying the rung as a raw id would also cross
 * ADR 0011: `MessageParameters` substitutes values and does not resolve a
 * nested key, so a `rung` field would have to be interpolated as the id
 * itself rather than as authored text.
 */
const constructionRefusedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('economy.construction-refused'),
  })
  .strict();

/**
 * An incident opened in the prison (issue #555).
 *
 * ## Why four members and not one carrying an `IncidentType`
 *
 * The obvious shape is a single `incidents.opened` with the kind as a field,
 * and it was rejected for two measured reasons rather than on taste.
 *
 * - **`EVENT_PRESENTATION` grades an event by its `type` and nothing else**
 *   (`src/ui/simulation-events.ts`). One member would therefore have to grade
 *   a fistfight and a riot the same, and the simulation itself says they are
 *   not the same: `ASSAULT_SEVERITY_CEILING` (`incidents/flashpoint.ts`) caps
 *   an assault at severity 5, deliberately one below the response system's
 *   `lockdownSeverityThreshold` of 6, *"because scoring an assault on the same
 *   0-10 scale as a riot says two things about a fistfight that are not true
 *   -- that it needs five guards, and that it justifies sealing every door in
 *   the prison."* A member per kind is what lets the band say that.
 * - **The kind would have had to cross as a raw id and be interpolated into a
 *   sentence.** ADR 0011 keeps text off the wire, so what would cross is
 *   `'gang-retaliation'`, and `MessageParameters` substitutes values rather
 *   than resolving nested keys -- the player would read the slug. The repo's
 *   own answer to "name the kind" is `HudCountsViewModel.activeIncidentTypeLabelKey`
 *   (issue #506 finding 2), which renders `incident-type.riot.name` as a whole
 *   element rather than inside a sentence. A member per kind puts the kind in
 *   the authored sentence instead, where a translator can move it.
 *
 * ## What they carry, and what they do not
 *
 * No incident id, no sector id: the channel *"carries no identity"*
 * (`SimulationEventLog`), and the `hud/incidents` projection is where a
 * player goes to look one up. The shipped topology registers exactly one
 * sector (ADR 0036), so a sector id would also be a constant.
 *
 * **Only the riot carries `participantCount`, and the reason is the sentence
 * rather than the record.** Three of the four counts are not worth carrying:
 * `ASSAULT_PARTICIPANT_COUNT` is 2 and `tryOpenEscapeAttempt` *"names **one**
 * participant"*, so for those two the field could only ever hold one value,
 * which is a constant on the wire. A gang-retaliation's list *is* variable --
 * two gangs' membership -- and it is still left off, because nothing bounds it
 * below at two: `GangRegistry.membersOf` may answer with one member on either
 * side. `interpolate` (`src/services/localization/format.ts`) substitutes
 * values and has no plural rules, so a sentence carrying that figure would
 * read *"1 prisoners"* the first time a one-member gang retaliated. A riot has
 * no such corner: `DEFAULT_MINIMUM_RIOT_PARTICIPANTS` is 2 and
 * `IncidentTriggerSystem` will not open one below it, so `{count}` there is
 * always plural and always says something the strip's badge cannot.
 *
 * The `count`-versus-`unpaidWagesMinorUnits` split above is the precedent for
 * members of this union carrying different figures, and `min(1)` is for the
 * reason every other figure on this channel has one.
 */
const riotOpenedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.riot-opened'),
    participantCount: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const gangRetaliationOpenedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.gang-retaliation-opened'),
  })
  .strict();

const assaultOpenedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.assault-opened'),
  })
  .strict();

const escapeAttemptOpenedEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.escape-attempt-opened'),
  })
  .strict();

/**
 * A prisoner got out
 * ([#683](https://github.com/matmaxalez/lockstate/issues/683)).
 *
 * **The only member of this union that reports an *outcome* rather than an
 * opening, and the reason it is a member at all is that nothing else on the
 * channel could carry it.** Every schema above says an incident started; this
 * one says how one of them ended, and #683 was filed because the two ways an
 * escape attempt can end reached the player as the same pair of rows -- the
 * opening, then the all-clear -- with no row whose subject was the escape.
 *
 * ## Why not a field on an event that already exists
 *
 * - **Not on `incidents.escape-attempt-opened`.** That is recorded at the tick
 *   the incident *opens*, and the outcome does not exist yet. This channel
 *   carries occurrences rather than levels -- *"there is no current value of
 *   it to republish"* (`SimulationEventLog`) -- so nothing amends a published
 *   event.
 * - **Not on `incidents.all-clear`.** Its own comment below refuses the figure
 *   and says why, and it is emitted only when `IncidentLog.openIncidentCount`
 *   reaches zero: a second sector holding an open riot would swallow the
 *   escape entirely, and a field on it with it.
 *
 * ## What it carries, and why this one names somebody
 *
 * `entityId` plus the two name halves, exactly as `prisoners.relocated` above
 * carries them and for the reason set out there -- the halves are state
 * (ADR 0015), the *order* they are read in is a locale decision made once in
 * `hud.regime.roster-name`, and no sentence crosses the boundary.
 *
 * **The escapee is gone, though, and the relocation exception's reason does
 * not cover them.** That exception rests on the subject being *"alive, housed,
 * and already on the roster projection under the same entity id"*, which is
 * false here: `releasePrisoner` has destroyed the entity and released the name
 * by the time the main thread reads this. What makes naming them safe anyway
 * is narrower and is a property of this payload rather than of the subject --
 * **the name is carried, never looked up**, so there is nothing for a
 * departed entity id to fail to resolve against. The id itself is here for the
 * unnamed fallback (`hud.regime.roster-unnamed`, "Prisoner 3") that
 * `prisoners.relocated` uses for a session wired without an identity registry,
 * and for no other purpose: it is not a handle a panel may follow, and
 * `projectPrisonerDetail` answers `undefined` for it.
 *
 * `name` is optional for the reason it is optional there. No participant
 * count: `IncidentTriggerSystem.tryOpenEscapeAttempt` names exactly one
 * participant, so a count would be a constant on the wire -- the same
 * judgement the assault schema makes about its two.
 */
const escapeSucceededEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.escape-succeeded'),
    entityId: sequenceSchema,
    name: z
      .object({
        givenName: z.string().min(1).max(128),
        familyName: z.string().min(1).max(128),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Every incident the prison had open has reached a terminal state (#555).
 *
 * **The counterpart the four members above make mandatory rather than a
 * nicety.** Nothing on this channel is ever retracted -- rows leave for the
 * cap or for `simulation/stopped` and for no other reason
 * (`src/ui/simulation-events.ts`, "What clears an event") -- and the HUD's
 * event band holds the newest event until another arrives. So an
 * `incidents.riot-opened` graded `'danger'` with no counterpart would leave a
 * red line reading *"A riot has broken out"* standing across a prison that is
 * calm again, for the rest of the session, while the status strip's own badge
 * had already gone back to *"Clear"*. That is a promise the code does not
 * keep, which `AGENTS.md` reserves to the owner; the way not to make it is to
 * ship the sentence that ends it.
 *
 * **"All clear", not "the riot ended", and that is what bounds it.** The
 * producer emits only when the terminal transition leaves *no* incident open
 * anywhere (`IncidentLog.openIncidentCount`), so two overlapping incidents
 * closing produce one line rather than two, and the count of these events is
 * bounded above by the count of openings for any session at all. It is also
 * the only true thing to say after a *lapse*: an incident that ran its course
 * was not "resolved", but the prison does have nothing open.
 *
 * Carries no figure. What it costs -- who was injured, what was damaged,
 * whether anybody got out -- is `IncidentOutcome`, which the `hud/incidents`
 * projection already renders per incident; summing it into one number here
 * would be a second, coarser answer to a question that already has one.
 */
const incidentsAllClearEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('incidents.all-clear'),
  })
  .strict();

/**
 * A search found one contraband item (the owner's **ruling 13** of 2026-08-31
 * on [#703](https://github.com/matmaxalez/lockstate/issues/703)).
 *
 * The half of ruling 3 that `StatusStripViewModel.contrabandNameKey` could not
 * carry, and that field's own comment says so at its site: a badge beside a
 * count qualifies the *whole* count, so it names a category only while every
 * confiscation on the ledger is that category, and *"only a per-discovery
 * message can name each of several"*. It also recorded what stood in the way --
 * *"that message needs a sentence joining a name to what happened, no such
 * sentence is authored, and a sentence is the owner's"*. Ruling 13 authored it:
 * `hud.alert.event.contraband.discovered`, "Contraband found: {item}.".
 *
 * ## What it carries
 *
 * `categoryNameKey` is the contraband catalog's own
 * `ContrabandCategoryDefinition.nameKey` -- one of the five
 * `contraband.*.name` labels ("Weapon", "Drugs", "Phone", "Currency", "Tool")
 * that #707 gave their first reader on the status chip. The **key** crosses,
 * never the word: ADR 0011 keeps translated text off the wire, and this is the
 * same kind of value `prisoners.relocated` carries as `roomNameKey` and the
 * strip carries as `contrabandNameKey`. The main thread resolves it, in
 * `eventParameterMessages` (`src/ui/simulation-events.ts`).
 *
 * **No category id, no item id, no holder, no guard, no order.** The
 * confiscation record already carries all five (`ConfiscationEvent`) and is
 * persisted; this channel *"carries no identity"* (`SimulationEventLog`), and
 * an item id would additionally be a handle on a thing whose state the very
 * event that reports it has just changed to `'confiscated'`. The category id
 * is not carried either, and that is not the same judgement as the incident
 * union's: there a *member per kind* was chosen so the severity band could
 * differ per kind, and here it deliberately must not -- ruling 13 puts a weapon
 * *"in the same band as any other item"*, so one member with the name as a
 * parameter is the shape that says that, and five members would invite five
 * bands.
 *
 * ## One event per item found, not one per search
 *
 * `SearchSystem.runDetectionForCurrentTarget` runs an independent detection
 * draw per concealed item at the target, so "what a search found" is not one
 * fact and a count would have no sentence -- `{item}` names a category and a
 * mixed pair has no single name, which is exactly the corner
 * `soleDiscoveredContrabandNameKey` refuses. The grain is therefore the item,
 * as `prisoners.relocated` and `incidents.escape-succeeded` are per subject
 * rather than per cause.
 *
 * **Measured rather than assumed to be safe against the alerts list's 8-row
 * cap** (`MAX_EVENT_ALERT_ROWS`): 48 prisons built by real commands and run 60
 * in-game days each produced 463 confiscations, and **the most that landed on
 * any single tick was one**. Only one sector is registered (ADR 0036) and
 * `SectorSearchDutySystem.hasOutstandingSweep` allows one sweep per sector at a
 * time, so one job advances one target per tick; the only route to two is one
 * holder carrying two items and both draws succeeding on the same visit, which
 * a holder can do -- ADR 0080's escalation introduction gives a prisoner a
 * second item -- and did not do once in that sample. So nothing coalesces here.
 *
 * `sequence` and `tick` are the envelope every member carries, and the tick is
 * the tick the search dwelt on rather than the one the publication rode out on.
 */
const contrabandDiscoveredEventSchema = z
  .object({
    ...simulationEventEnvelopeFields,
    type: z.literal('contraband.discovered'),
    /** The found item's category, as the catalog's own `nameKey`. A key, resolved on the main thread -- never the English word. */
    categoryNameKey: identifierSchema,
  })
  .strict();

/**
 * Exported since 2026-09-01, because the save carries these records.
 *
 * `save-schema.ts` validates the alerts section against this rather than
 * declaring a second shape for the same union: a save-side copy would be a
 * window the moment an event type gained a field, which is the argument
 * `PurchaseMaterials` makes in `commands.ts` about two boundaries disagreeing.
 * The schema is frozen by the same rule every other persisted shape is --
 * see `docs/PERSISTENCE.md` on what an existing field changing meaning costs.
 */
export const simulationEventSchema = z.discriminatedUnion('type', [
  contrabandDiscoveredEventSchema,
  wagesUnpaidEventSchema,
  deliveriesRefusedEventSchema,
  constructionRefusedEventSchema,
  dischargedEventSchema,
  residentRelocatedEventSchema,
  riotOpenedEventSchema,
  gangRetaliationOpenedEventSchema,
  assaultOpenedEventSchema,
  escapeAttemptOpenedEventSchema,
  escapeSucceededEventSchema,
  incidentsAllClearEventSchema,
]);

export type SimulationEvent = DeepReadonly<z.infer<typeof simulationEventSchema>>;

const eventMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/event'),
    payload: z
      .object({
        tick: tickSchema,
        event: simulationEventSchema,
        /**
         * This is a record the log **kept**, not something the prison has just
         * done (the owner's decision 4 of 2026-09-01 on
         * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
         *
         * ## Why the same message rather than a second kind
         *
         * Because it is the same record. What a restored session replays is
         * exactly what it recorded, in the order it recorded it, and a second
         * message kind carrying the identical union would have needed a second
         * translator on the other side and would have made every reader ask
         * which of the two it should handle. What differs is not the content
         * but the **claim**, and one flag is the whole of the difference.
         *
         * ## What reads it, and why the two surfaces answer differently
         *
         * - The **alerts list** builds a row from it either way. That is the
         *   whole of decision 4: the log survives a reload.
         * - The **events band** ignores it. The band carries what just
         *   happened -- *"an event is a statement that something happened
         *   now"* (`SimulationEventLog`) -- and a restored record happened on
         *   a tick the player was not looking at. A band that announced one on
         *   load would be exactly the *"loaded prison announcing last week's
         *   discharges"* `docs/PERSISTENCE.md` refuses, and it would also be a
         *   decision about the band, which is ADR 0084's decision 4 and is not
         *   taken.
         *
         * `z.literal(true)` and optional, so the absent case has one meaning
         * and one only: nobody restored this, the prison just did it. A
         * `boolean` would have let `restored: false` mean the same thing
         * twice.
         */
        restored: z.literal(true).optional(),
      })
      .strict(),
  })
  .strict();

const stoppedMessageSchema = z
  .object({
    ...correlatedResponseEnvelopeFields,
    kind: z.literal('simulation/stopped'),
    payload: z
      .object({
        tick: tickSchema,
        reason: z.enum(['shutdown-requested', 'fatal-error']),
      })
      .strict(),
  })
  .strict();

const errorMessageSchema = z
  .object({
    ...optionallyCorrelatedEnvelopeFields,
    kind: z.literal('protocol/error'),
    payload: protocolFaultSchema,
  })
  .strict();

export const workerToMainMessageSchema = z.discriminatedUnion('kind', [
  handshakeAcceptedMessageSchema,
  pongMessageSchema,
  readyMessageSchema,
  clockStateMessageSchema,
  commandResultMessageSchema,
  deltaMessageSchema,
  statusCountsMessageSchema,
  projectionMessageSchema,
  snapshotMessageSchema,
  eventMessageSchema,
  stoppedMessageSchema,
  errorMessageSchema,
]);

export type WorkerToMainMessage = DeepReadonly<
  z.infer<typeof workerToMainMessageSchema>
>;

export type SimulationProtocolMessage =
  | MainToWorkerMessage
  | WorkerToMainMessage;
