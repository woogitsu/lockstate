import { z } from 'zod';
import { isJsonValue, type JsonValue } from '../../shared/json';

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
 * The `counts` block of the status-strip projection
 * (`src/simulation/presentation/status-strip-projection.ts`), field for
 * field.
 *
 * Every field is a non-negative integer, and that is the whole payload.
 * The projection also computes a clock position and the active regime
 * blocks; neither is carried here (see `simulation/status-counts` below for
 * why).
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
     * because the two are different true facts and each has a reader. A
     * furnished infirmary raises `roomCapacity` -- `object.medical-bed`
     * declares `'sleep-surface'` -- and raises nothing here, because no
     * classification group's `AccommodationPolicy` names `room.infirmary`.
     * Collapsing them would either overstate the prisoner denominator by every
     * medical bed or understate the Rooms readout by every one.
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
    roomOccupants: countSchema,
    activeIncidents: countSchema,
    contrabandDiscovered: countSchema,
    /**
     * The treasury balance, in the minor units `Treasury` holds it in (#96).
     *
     * A count rather than a `BoundedValue`: it has no maximum to be a share
     * of. `countSchema`'s floor of 0 is the treasury's own invariant, not an
     * assumption made here -- `Treasury.spend` refuses rather than
     * overdrawing, so a negative balance is unreachable, and a schema that
     * admitted one would be describing a state the simulation cannot be in.
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
    treasuryMinorUnits: countSchema,
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
 * system that ran it. `WorkerStateMachine.handleSubmitCommand` has already
 * answered `status: 'queued'` by then, and ADR 0003 decision 9 is explicit
 * that the queued acknowledgement "never reports a command as applied": this
 * vocabulary is what the simulation says instead.
 *
 * A stable id, never a sentence (ADR 0011). The main thread maps each id to a
 * message key in `src/ui/simulation-alerts.ts`; no text crosses the boundary.
 *
 * Declared in ascending code-unit order, and namespaced by the command the
 * refusal answers, so the ten vocabularies behind it cannot collide:
 * `admit.*` mirrors `AdmitPrisonerRefusalReason`, `build.*` mirrors
 * `BuildOrder.failReason`, `cancel-purchase.*` mirrors
 * `PurchaseCancelRefusalReason`, `hire.*` mirrors `StaffHireRefusalReason`,
 * `place-object.*` mirrors `PlaceObjectRefusalReason`,
 * `purchase.*` mirrors `PurchaseOutcome`'s refusal reasons,
 * `release-guard.*` mirrors `GuardReleaseRefusalReason`,
 * `remove-object.*` mirrors `RemoveObjectRefusalReason`, `unzone.*` mirrors
 * `UnzoneRoomRefusalReason` and `zone.*` mirrors `ZoneRoomRefusalReason`. The
 * namespace is doing real work rather than being tidy -- `out-of-bounds` and
 * `unowned-land` are members of *two* of those domain vocabularies, and
 * `insufficient-funds` and `invalid-area` are each a member of two others, and
 * each means something different to a player depending on which command it
 * answers, so one flat id per spelling would put one sentence on several.
 *
 * `src/simulation/refusals/refusal-log.ts` maps each domain value onto one of
 * these through an exhaustive `Record`, so a reason added to any of the ten
 * fails to compile until it is named here -- and
 * `tests/unit/simulation-refusals.test.ts` asserts the ten tables between
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
 * `build.unknown-buildable` is the sharpest instance of that last point and the
 * newest member here. `place-object.unknown-buildable` is the same condition on
 * the same registry, reached by `PlaceObject` instead: two commands carry a
 * `BUILDABLE_REGISTRY` id, `ObjectPlacementService` checked its one and
 * `ConstructionSystem.submitOrder` checked nothing, so an unknown id on a
 * `PlaceBuildOrder` was approved and `ConstructionSystem.update` then threw out
 * of a scheduled system update for the rest of the session -- and, since the
 * order is snapshotted, for the rest of the save's life. Two spellings of one
 * fact, each answering a different command, is exactly what the namespace is
 * for; that only one of them existed is what the defect was.
 */
export const REFUSAL_REASONS = [
  'admit.no-accommodation',
  'admit.population-full',
  'build.out-of-bounds',
  'build.unbuildable',
  'build.unbuildable-terrain',
  'build.unknown-buildable',
  'build.unowned-land',
  'build.water-blocked',
  'cancel-purchase.not-pending',
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

const eventMessageSchema = z
  .object({
    ...requestEnvelopeFields,
    kind: z.literal('simulation/event'),
    payload: z
      .object({
        tick: tickSchema,
        event: versionedPayloadSchema,
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
