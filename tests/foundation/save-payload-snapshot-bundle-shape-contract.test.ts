import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SavePayload } from '../../src/persistence/save-schema';
import type { SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';

/**
 * The save schema's payload type and the simulation's snapshot bundle are one
 * shape, and this file is the join that says so.
 *
 * ## The seam
 *
 * **#1225 names two of the four sites, and the count is the part to correct.**
 * `result.envelope.payload as unknown as SessionSnapshotBundle`
 * (`session-controller.ts`) and `snapshot.data as unknown as
 * SessionSnapshotBundle` (`ui/simulation-commands.ts`) are the two it lists;
 * `rendering/feed/simulation-snapshot-feed.ts` and
 * `simulation/worker/state-machine.ts` spelled the second one too, and
 * `persistence/session/worker-session-host.ts` spells a single-step `as` from
 * an `unknown` of its own making. All four of the `as unknown as` sites now go
 * through a declared conversion; the fifth already had a typed argument.
 *
 * Issue #1225 names two unchecked assertions as the whole join between the
 * Zod-validated save payload and the live `SessionSnapshotBundle`, and says
 * `as unknown as` "defeats every structural check the compiler could make".
 * It does: `as unknown as` erases the *source* type as well as the target, so
 * either side could grow a field, lose a field, or change a field's JSON shape
 * and nothing in the repository would notice.
 *
 * PR #1227 closed the *enum* half of that seam -- each `z.enum` against the
 * union it decodes into. This file closes the *shape* half, for the whole
 * payload rather than one field, and it does it at the type level, so the red
 * is a `tsc` failure rather than a failed expectation.
 *
 * ## Why the two declarations may not simply be the same declaration
 *
 * `docs/PERSISTENCE.md` (the "What is persisted, and why" preamble) records
 * the reason they are separate: *"the simulation may not import
 * `src/persistence` and a historical schema here is frozen while the
 * simulation keeps evolving"*. So neither may import the other, one cannot be
 * derived from the other, and a test is the only place the compiler is allowed
 * to see both at once.
 *
 * ## The decision this enforces already exists, so no ADR is drafted
 *
 * `docs/PERSISTENCE.md` states it outright: the save *"`payload` is exactly
 * the union of the existing per-subsystem snapshot contracts ... re-validated
 * at the save boundary with Zod ... not a new shape invented for this issue"*.
 * That is the rule; what was missing is anything that checks it. So this file
 * is a gate on a decision the repository has taken, not a new one -- the same
 * reading #1227 arrived at for the enum half.
 *
 * ## Why equality, and not "the schema is a superset"
 *
 * The enum half was gated as `union ⊆ enum` because the reader is
 * deliberately permissive about *values*: `docs/PERSISTENCE.md` says a
 * narrowing *"makes every save that recorded one unreadable, which is a
 * migration"*. That argument is about the members of an enum, and it does not
 * carry over to the *shape*: a section the schema declares and the bundle does
 * not is not a permissive reader, it is state that is written to disk and then
 * dropped on restore, and a section the bundle declares and the schema does
 * not is a section that never reaches disk at all. Both are silent data loss,
 * so the shape relation is equality.
 *
 * What the schema genuinely cannot express is the difference this file
 * normalises away before comparing -- see `Normalize` below. Those are
 * *representation refinements*, not shape differences: at each of them the
 * schema type is the wider one, and the widening is the assertion the two
 * declared conversions carry (`bundleFromSavePayload` in
 * `src/persistence/session/session-controller.ts`,
 * `sessionSnapshotBundleFromTransport` in
 * `src/simulation/runtime/restore-session.ts`).
 *
 * ## Where this gate is STRICTER than #1227's ruling, and what to do about it
 *
 * **Measured 2026-09-16, by mutation, after #1227 landed on `main` as
 * `tests/foundation/save-schema-enum-union-contract.test.ts`.** The two gates
 * are mostly disjoint -- that one matches on `z.enum` and compares *members*,
 * this one compares *keys and leaf types* and never reads the schema source --
 * but they overlap at exactly one place: an enum leaf that sits inside a
 * section this file compares whole is compared here too, by assignability.
 *
 * And in that overlap this file is the stricter of the two, deliberately or
 * not. #1227 rules that the reader is *allowed* to be wider than the union,
 * because a save carrying a retired member must still load, and it makes that
 * width legal on condition it is named in `readerOnly` with the build that
 * wrote it. This file's `ShapesAgree` is mutual assignability, so the same
 * widening is a **red** here with no ledger to record it in.
 *
 * Worked, so the claim is not a reading of the types: adding `'retired'` to
 * `carryItemJobSchema.state`'s `z.enum` in `save-schema.ts` reds
 * `carryJobWithoutFailReason` in this file (`schemaLeaf` / `bundleLeaf`, the
 * whole job object printed) *and* reds #1227's "every member the reader at
 * carryItemJobSchema.state accepts beyond its union is named with the build
 * that wrote it" (1 failed | 45 passed).
 *
 * **The danger is which red a reader believes.** #1227's names the fix in its
 * own failure message; this one prints two object types and names nothing, and
 * the cheapest way to make *this* file green again is to delete the member
 * from the `z.enum` -- which is the narrowed reader, the unloadable prison,
 * and the precise defect #1225 exists to prevent.
 *
 * **So: never satisfy a red in this file by narrowing `save-schema.ts`.** A
 * legitimate reader-only widening is declared the same way the three leaves
 * below are -- split the section around the leaf with `Omit`, assert the
 * direction with `Widens`, and add a `DECLARED_DIVERGENCES` entry naming the
 * build that wrote the member. That is more ceremony than #1227 asks for the
 * same change, and it is the known cost of this file comparing shapes rather
 * than matching on `z.enum`; it is recorded here rather than smoothed away,
 * because a gate whose stricter direction is undocumented gets "fixed" in the
 * dangerous direction by whoever meets it first.
 *
 * ## Re-checked 2026-09-17 at `33c02a12` and again at `725aad40`, by mutation
 *
 * The conclusion that this file is **not** redundant with #1227's
 * `tests/foundation/save-schema-enum-union-contract.test.ts` was re-derived
 * rather than inherited, because it is the claim a merge is likeliest to have
 * quietly settled -- that gate is on `main` now, and "two gates, one seam" is
 * exactly the shape that gets consolidated away by whoever reads only the
 * titles.
 *
 * Three mutations of `src/persistence/save-schema.ts`, each applied alone and
 * reverted, on this branch merged with `main` at `33c02a12`:
 *
 * 1. **Widen `carryItemJobSchema.state`'s `z.enum` with `'retired'`**
 *    (`save-schema.ts:681`). **Both red**, which reproduces this docblock's own
 *    2026-09-16 measurement exactly: `npx tsc -b` reports TS2322 at
 *    `save-payload-snapshot-bundle-shape-contract.test.ts(373,14)`, printing
 *    the whole job object on both sides, and #1227's gate reports
 *    `1 failed | 45 passed` naming `carryItemJobSchema.state`. The overlap is
 *    real and the warning below about *which red a reader believes* still
 *    applies unchanged.
 * 2. **Widen a `z.enum` in a different section** -- `'shredded'` added to the
 *    contraband `state` at `save-schema.ts:836`. **Both red again**, so the
 *    overlap is the class of change rather than one leaf.
 * 3. **Rename a non-enum leaf**: `priority` to `priorityLevel` on the same
 *    schema (`save-schema.ts:673`). **#1227's gate is GREEN -- `46 passed`,
 *    every one of them** -- and `tsc` reports three errors: two in this file
 *    and one at `src/persistence/session/session-controller.ts(48,10)`, the
 *    `bundleFromSavePayload` conversion this branch declared. On `main`, where
 *    that line is `as unknown as SessionSnapshotBundle`, the same mutation
 *    compiles and every gate stays green.
 *
 * **So the conclusion survives, and mutation 3 is the whole of the argument.**
 * A renamed, added or dropped field is the defect #1225 is about, it is
 * invisible to a gate that matches on `z.enum`, and it is invisible to `tsc`
 * until the two `as unknown as` assertions are replaced by the declared
 * conversions this branch adds. Neither gate subsumes the other: #1227 reads
 * the schema *source* for enum members and never sees a key, this file
 * compares *keys and leaf types* and never reads the source.
 *
 * **What the merge did not falsify.** This branch introduces no `path:N`
 * citation at all -- every claim it makes about another file is a quoted
 * sentence, which `docs/AGENT_WORKFLOW.md` §4 names as the most durable form --
 * and both `docs/PERSISTENCE.md` quotations above were re-opened at
 * `33c02a12` and read back verbatim (`:75` for *"`payload` is exactly the
 * union of the existing per-subsystem snapshot"*, `:80` for *"are deliberately
 * separate, because the simulation may not import"*, `:194` for *"makes every
 * save that recorded one unreadable, which is a migration."*).
 *
 * **Re-gated at `725aad40`** after #1279 merged the same day: `npx tsc -b`
 * clean, `tests/foundation/` **64 files / 641 passed**. That merge touches
 * `src/ui/hud/`, which neither side of this seam reaches, so the three
 * mutations above were not re-run against it.
 *
 * ## Measured, 2026-09-15, before any of this was written
 *
 * The normalised shapes are equal at every section and at every leaf except
 * **three**, which is why `DECLARED_DIVERGENCES` is a three-entry ledger
 * rather than an open one. Dropping the normalisation and comparing the raw
 * types instead reports, one distinct class per section:
 *
 * - `kernel.rngStates[].state.words`: `readonly number[]` against the
 *   `readonly [number, number, number, number]` `NamedRngStreamState` declares.
 * - `world.ownedChunks[].x`: `number` against the branded `ChunkCoordinate`.
 * - `construction.orders[].location.x`: `number` against the branded
 *   `TileCoordinate`.
 * - `entities.generations[]`: `readonly number[]` against the 2-tuple
 *   `RunLength`.
 * - `simulation.prisoners.components.solitarySanctionEndTick`:
 *   `readonly number[] | undefined` against `readonly number[]`, i.e.
 *   `exactOptionalPropertyTypes`.
 * - `masterSeed`: `number | undefined` against `number`, the same.
 *
 * Every one of those is the schema being the wider side, which is why
 * normalising them away is safe. **Three leaves survive normalisation**, and
 * they are the ledger: `kernel.commands[].payload`, where the bundle is wider,
 * and the two `failReason` fields, where the schema is -- the shape-level form
 * of the same permissiveness #1227 gated for enum values.
 */

/** A JSON leaf, as both sides ultimately bottom out in. */
type JsonLeaf = string | number | boolean | null;

/**
 * Erases every difference between the two declarations that is a
 * *representation refinement* rather than a difference of shape.
 *
 * Three of them, each a thing `z.infer` structurally cannot produce:
 *
 * 1. **Nominal brands.** `TileCoordinate` and `ChunkCoordinate` are `number`
 *    intersected with a unique symbol key; Zod infers `number`.
 * 2. **Tuple arity.** `z.array(z.number())` infers `readonly number[]`; the
 *    runtime type says `readonly [number, number, number, number]`.
 * 3. **Optionality.** Under `exactOptionalPropertyTypes` a Zod `.optional()`
 *    infers `?: T | undefined` and the hand-written interface says `?: T`.
 *
 * Literal *width* is deliberately **not** normalised away. An earlier draft
 * widened `1` to `number` on both sides, which would have let a schema
 * declaring `z.literal(1)` sit opposite a runtime `2` in silence -- the exact
 * class of divergence this file exists to refuse. A brand is stripped instead
 * by testing for the intersected object (`number & Brand extends object` is
 * true, `1 extends object` is not), so `ChunkCoordinate` collapses to `number`
 * while `WorldSnapshotV1['version']` (`typeof WORLD_SNAPSHOT_VERSION`, i.e.
 * `1`) stays `1`. Measured: widening the bundle side's
 * `Xoshiro128StarStarState['algorithm']` from `'xoshiro128**'` to
 * `'xoshiro128**' | 'pcg32'` fails `kernelWithoutCommands` under the sharper
 * rule and passed silently under the earlier one.
 *
 * Normalising these away is what makes the remaining comparison meaningful
 * rather than noisy -- and it is safe in exactly one direction, because at
 * every one of them the *schema* is the wider side, which is the direction
 * `docs/PERSISTENCE.md` says a reader is allowed to be wrong in.
 */
type Normalize<T> =
  unknown extends T ? 'unknown'
  : T extends number ? (T extends object ? number : T)
  : T extends string ? (T extends object ? string : T)
  : [T] extends [JsonLeaf] ? T
  : T extends readonly (infer E)[] ? readonly Normalize<E>[]
  : T extends object ? { readonly [K in keyof T]-?: Normalize<Exclude<T[K], undefined>> }
  : T;

/**
 * Mutual assignability, reported as the offending type rather than as `false`.
 *
 * A bare `A extends B ? true : false` reduces every failure to the same
 * useless token; this hands the compiler's error message the actual type that
 * does not fit, on whichever side does not fit, which is what makes the red
 * legible.
 */
type ShapesAgree<A, B> = [A] extends [B]
  ? ([B] extends [A] ? true : Resolved<Disagreement<A, B>>)
  : Resolved<Disagreement<A, B>>;

/**
 * Strips the alias name off the failure type.
 *
 * Without it `tsc` prints `Disagreement<{ readonly prisoners: ... }>` -- the
 * alias and its two enormous arguments -- and elides exactly the part that
 * says which path is missing. Mapping over the members forces the union to be
 * printed as the anonymous object it resolves to, which is the whole point of
 * computing it.
 */
type Resolved<T> = T extends infer U ? { readonly [K in keyof U]: U[K] } : never;

/**
 * The failure value, which is where most of this file's usefulness lives.
 *
 * A mismatch three levels down inside `simulation` reported as "this whole
 * type is not assignable to that whole type" prints two screens of elided
 * structure and tells a reader nothing they can act on. So when the
 * disagreement is a *key* -- which every divergence found while writing this
 * was, and which is what adding or removing a payload field looks like -- the
 * offending dotted paths are computed and reported instead.
 *
 * When it is not a key but a leaf's *type*, `KeyPaths` finds nothing and the
 * raw pair is handed over as the fallback, which is no worse than the bare
 * assignability failure this replaced. Widening
 * `Xoshiro128StarStarState['algorithm']` on the bundle side is the worked
 * example: it reds `kernelWithoutCommands` and prints the two kernel types.
 */
type Disagreement<A, B> =
  | (KeyPaths<A, B> extends never ? never : { readonly pathsOnlyTheSchemaHas: KeyPaths<A, B> })
  | (KeyPaths<B, A> extends never ? never : { readonly pathsOnlyTheBundleHas: KeyPaths<B, A> })
  | ([KeyPaths<A, B> | KeyPaths<B, A>] extends [never] ? { readonly schemaLeaf: A; readonly bundleLeaf: B } : never);

/**
 * Dotted paths present in `A` and absent from `B`, to a bounded depth.
 *
 * The depth bound is a tuple-shortening counter rather than a `number`, because
 * TypeScript has no arithmetic and an unbounded recursion over these types is
 * an instantiation-depth error rather than an answer.
 *
 * **Eight is a bound with headroom, not a measured maximum**, and the reason
 * it is safe to state loosely is that overrunning it costs legibility and not
 * correctness: a path deeper than eight makes `KeyPaths` return `never`, the
 * third arm of `Disagreement` then supplies the raw pair, and the assertion is
 * still red. The deepest path reported so far by an actual mutation is
 * `prisoners.components.moodDecay`, three below the `simulation` section.
 */
type KeyPaths<A, B, Depth extends readonly unknown[] = [0, 0, 0, 0, 0, 0, 0, 0]> =
  true extends IsUnion<A> | IsUnion<B>
    ? // A union node is skipped rather than walked. `A extends object`
      // distributes, so walking one compares each member against the whole of
      // the other side and reports every field the members do not share --
      // paths that are missing from nothing. `simulation.alerts.records` is
      // such a union, and an earlier draft of this type reported eight
      // phantom paths inside it on a tree where the shapes agreed.
      never
  : Depth extends readonly [unknown, ...infer Rest]
    ? A extends readonly (infer EA)[]
      ? B extends readonly (infer EB)[]
        ? KeyPaths<EA, EB, Rest> extends infer P extends string ? `[]${P extends '' ? '' : '.'}${P}` : never
        : never
      : A extends object
        ? B extends object
          ?
              | Extract<Exclude<keyof A, keyof B>, string>
              | {
                  [K in Extract<keyof A & keyof B, string>]: KeyPaths<A[K], B[K], Rest> extends infer P extends string
                    ? `${K}.${P}`
                    : never;
                }[Extract<keyof A & keyof B, string>]
          : never
        : never
    : never;

/**
 * Whether `T` is a union, used to keep `KeyPaths` off union nodes.
 *
 * The naked `T extends unknown` is the distribution that makes it work: each
 * member is compared against the whole, and only a union has a member the
 * whole does not extend.
 */
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;

/** Both declarations' key sets, compared without regard to value types. */
type KeysAgree<A, B> = [keyof A] extends [keyof B]
  ? ([keyof B] extends [keyof A] ? true : { readonly keysOnlyInBundle: Exclude<keyof B, keyof A> })
  : { readonly keysOnlyInSchema: Exclude<keyof A, keyof B> };

type SchemaKernel = SavePayload['kernel'];
type BundleKernel = SessionSnapshotBundle['kernel'];
type SchemaCommand = SchemaKernel['commands'][number];
type BundleCommand = BundleKernel['commands'][number];

type SchemaConstruction = SavePayload['construction'];
type BundleConstruction = SessionSnapshotBundle['construction'];
type SchemaBuildOrder = SchemaConstruction['orders'][number];
type BundleBuildOrder = BundleConstruction['orders'][number];

type SchemaSystems = NonNullable<SavePayload['simulation']>;
type BundleSystems = NonNullable<SessionSnapshotBundle['simulation']>;
type SchemaOperations = SchemaSystems['operations'];
type BundleOperations = BundleSystems['operations'];
type SchemaCarryJob = SchemaOperations['jobs'][number];
type BundleCarryJob = BundleOperations['jobs'][number];

/*
 * --- The assertions ---
 *
 * Each is an assignment to `true`. A divergence makes the right-hand side an
 * object type naming the side that has the extra, and `tsc` fails on the line.
 * Nothing here runs; `tsconfig.json` includes `tests`, so `pnpm typecheck` and
 * `tsc -b` are what enforce it.
 */

/** The payload's own sections. */
export const topLevelKeys: KeysAgree<SavePayload, SessionSnapshotBundle> = true;
export const masterSeedAgrees: ShapesAgree<
  Normalize<Exclude<SavePayload['masterSeed'], undefined>>,
  Normalize<Exclude<SessionSnapshotBundle['masterSeed'], undefined>>
> = true;

/**
 * `kernel`, split around the one declared divergence.
 *
 * Splitting it is what keeps the exception from swallowing the section: every
 * key of `kernel` and every key of a queued command is still compared, and
 * every value except `payload` is still compared. A new kernel field, or a new
 * command field, is caught by the `KeysAgree` halves even though the value
 * comparison skips one leaf.
 */
export const kernelKeys: KeysAgree<SchemaKernel, BundleKernel> = true;
export const kernelWithoutCommands: ShapesAgree<
  Normalize<Omit<SchemaKernel, 'commands'>>,
  Normalize<Omit<BundleKernel, 'commands'>>
> = true;
export const commandKeys: KeysAgree<SchemaCommand, BundleCommand> = true;
export const commandWithoutPayload: ShapesAgree<
  Normalize<Omit<SchemaCommand, 'payload'>>,
  Normalize<Omit<BundleCommand, 'payload'>>
> = true;

/** `world` and `identity` carry no declared divergence and are compared whole. */
export const worldAgrees: ShapesAgree<
  Normalize<SavePayload['world']>,
  Normalize<SessionSnapshotBundle['world']>
> = true;
export const identityAgrees: ShapesAgree<
  Normalize<NonNullable<SavePayload['identity']>>,
  Normalize<NonNullable<SessionSnapshotBundle['identity']>>
> = true;
export const entitiesAgree: ShapesAgree<
  Normalize<NonNullable<SavePayload['entities']>>,
  Normalize<NonNullable<SessionSnapshotBundle['entities']>>
> = true;

/** `construction`, split around `orders[].failReason`. */
export const constructionKeys: KeysAgree<SchemaConstruction, BundleConstruction> = true;
export const constructionWithoutOrders: ShapesAgree<
  Normalize<Omit<SchemaConstruction, 'orders'>>,
  Normalize<Omit<BundleConstruction, 'orders'>>
> = true;
export const buildOrderKeys: KeysAgree<SchemaBuildOrder, BundleBuildOrder> = true;
export const buildOrderWithoutFailReason: ShapesAgree<
  Normalize<Omit<SchemaBuildOrder, 'failReason'>>,
  Normalize<Omit<BundleBuildOrder, 'failReason'>>
> = true;

/** `simulation`, split around `operations.jobs[].failReason`. */
export const simulationKeys: KeysAgree<SchemaSystems, BundleSystems> = true;
export const simulationWithoutOperations: ShapesAgree<
  Normalize<Omit<SchemaSystems, 'operations'>>,
  Normalize<Omit<BundleSystems, 'operations'>>
> = true;
export const operationsKeys: KeysAgree<SchemaOperations, BundleOperations> = true;
export const operationsWithoutJobs: ShapesAgree<
  Normalize<Omit<SchemaOperations, 'jobs'>>,
  Normalize<Omit<BundleOperations, 'jobs'>>
> = true;
export const carryJobKeys: KeysAgree<SchemaCarryJob, BundleCarryJob> = true;
export const carryJobWithoutFailReason: ShapesAgree<
  Normalize<Omit<SchemaCarryJob, 'failReason'>>,
  Normalize<Omit<BundleCarryJob, 'failReason'>>
> = true;

/**
 * A leaf where one side is deliberately wider, asserted as *still* wider.
 *
 * Waiving a divergence by excluding the leaf would leave a hole the size of
 * the leaf: the exclusion would go on holding after the divergence closed, or
 * after it reversed. So each excluded leaf is asserted in the direction it is
 * allowed to differ, and a change that makes the two equal -- or makes the
 * other side the wider one -- fails here and the ledger entry is then deleted
 * rather than edited.
 */
type Widens<Wide, Narrow> = [Narrow] extends [Wide]
  ? ([Wide] extends [Narrow] ? { readonly noLongerWiderThan: Narrow } : true)
  : { readonly doesNotEvenAccept: Narrow };

/**
 * 1. `kernel.commands[].payload` -- the **bundle** is wider (`unknown`).
 *
 * The kernel never interprets a command's payload, so it declares the widest
 * type there is. The save schema cannot: a payload that is not JSON can
 * neither be written to a save nor structured-cloned across the worker
 * boundary, so the schema requires `JsonValue` and the kernel's own contract
 * is what keeps that true.
 */
export const commandPayloadWidening: Widens<
  BundleCommand['payload'],
  SchemaCommand['payload']
> = true;

/**
 * 2. `construction.orders[].failReason` and
 * 3. `simulation.operations.jobs[].failReason` -- the **schema** is wider
 *    (`z.string()` against a closed union of literals on the runtime side).
 *
 * **This is the load-bearing widening, and the repository had already decided
 * it -- in prose, with nothing checking it.** `CARRY_JOB_FAIL_REASONS`'
 * docblock (`src/simulation/operations/job.ts`) says the schema *"validates
 * `failReason` as an optional `z.string()` and stays that way deliberately,
 * for the reason `build-order.ts` records for the identical pair -- narrowing
 * the reader would turn an unrecognised historical value into an unloadable
 * prison rather than a job that reads as failed"*, and adds that this is *"what
 * lets a member be added here without a save bump"*.
 *
 * So these two are the shape-level form of the rule PR #1227 gated for enums,
 * and they are the reason this file compares shapes rather than demanding the
 * two declarations be identical. `Widens` is what keeps them honest: if either
 * schema field is ever narrowed to the union, the assertion fails and says the
 * reader has stopped being permissive.
 */
export const buildOrderFailReasonWidening: Widens<
  Exclude<SchemaBuildOrder['failReason'], undefined>,
  Exclude<BundleBuildOrder['failReason'], undefined>
> = true;
export const carryJobFailReasonWidening: Widens<
  Exclude<SchemaCarryJob['failReason'], undefined>,
  Exclude<BundleCarryJob['failReason'], undefined>
> = true;

/**
 * The ledger, in the shape #1227 established for the enum half: a divergence
 * is allowed to exist, and has to be named where a reader will find it.
 */
const DECLARED_DIVERGENCES = [
  {
    path: 'kernel.commands[].payload',
    schema: 'JsonValue',
    bundle: 'unknown',
    widerSide: 'bundle',
    why: 'The kernel never interprets a command payload, so it declares the widest type it can. The save schema must require JSON, because a non-JSON payload can neither be written to a save nor structured-cloned to the main thread.',
  },
  {
    path: 'construction.orders[].failReason',
    schema: 'string',
    bundle: 'BuildOrderFailReason',
    widerSide: 'schema',
    why: "A permissive reader, on purpose. BUILD_ORDER_FAIL_REASONS' docblock in src/simulation/construction/build-order.ts: it stays a z.string() there deliberately, because narrowing the reader would turn an unrecognised historical value into an unloadable prison rather than an order that reads as failed, and that width is what lets a member be added without a save bump.",
  },
  {
    path: 'simulation.operations.jobs[].failReason',
    schema: 'string',
    bundle: 'CarryJobFailReason',
    widerSide: 'schema',
    why: "The identical pair, decided in CARRY_JOB_FAIL_REASONS' own docblock in src/simulation/operations/job.ts: the reader stays a z.string() deliberately, so an unrecognised historical value reads as a failed job rather than refusing the save.",
  },
] as const;

const SRC_ROOT = new URL('../../src/', import.meta.url).pathname;

function everyTypeScriptFileUnder(root: string): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (full.endsWith('.ts')) found.push(full);
    }
  };
  walk(root);
  return found;
}

describe('the save payload and the session snapshot bundle are one shape', () => {
  it('states each type-level assertion as a compiled fact, not a runtime one', () => {
    // These are the values of the assertions above. They are `true` only
    // because `tsc` accepted them; reading them back here is what stops this
    // file from being a type-only module vitest reports as empty, and what
    // makes a reviewer scrolling the test output see the subject.
    expect([
      topLevelKeys,
      masterSeedAgrees,
      kernelKeys,
      kernelWithoutCommands,
      commandKeys,
      commandWithoutPayload,
      worldAgrees,
      identityAgrees,
      entitiesAgree,
      constructionKeys,
      constructionWithoutOrders,
      buildOrderKeys,
      buildOrderWithoutFailReason,
      simulationKeys,
      simulationWithoutOperations,
      operationsKeys,
      operationsWithoutJobs,
      carryJobKeys,
      carryJobWithoutFailReason,
      commandPayloadWidening,
      buildOrderFailReasonWidening,
      carryJobFailReasonWidening,
    ]).toHaveLength(22);
  });

  it('names every leaf where the two shapes are allowed to differ', () => {
    // A ledger with an entry nobody has to justify is a waiver list. Each
    // entry carries the direction of the widening and the reason, and the
    // reason has to be a sentence rather than a placeholder.
    expect(DECLARED_DIVERGENCES.map((entry) => entry.path)).toEqual([
      'kernel.commands[].payload',
      'construction.orders[].failReason',
      'simulation.operations.jobs[].failReason',
    ]);
    for (const entry of DECLARED_DIVERGENCES) {
      expect(['schema', 'bundle']).toContain(entry.widerSide);
      expect(entry.why.length).toBeGreaterThan(80);
      expect(entry.schema).not.toEqual(entry.bundle);
    }
  });
});

describe('the conversions into a session snapshot bundle are declared, not inline', () => {
  /*
   * The type-level half above is only worth anything if the production code
   * actually passes through a typed signature. `x as unknown as
   * SessionSnapshotBundle` erases the argument as well as the result, so a
   * site spelling it inline is outside every check this file makes -- which is
   * precisely issue #1225's complaint. Two named conversions replaced the four
   * that existed; this refuses a fifth. The positive control below keeps the
   * refusal from passing vacuously.
   */
  const SOURCES = everyTypeScriptFileUnder(SRC_ROOT);

  it('is reading the source tree, and its pattern matches the spelling it forbids', () => {
    // Non-vacuous in both directions. An empty `SOURCES`, or a pattern that
    // had drifted past the spelling, would make the assertion below pass by
    // checking nothing -- which is the shape of gate this repository refuses
    // (see test-suite-carries-no-scratch-probe-contract.test.ts).
    expect(SOURCES.length).toBeGreaterThan(100);
    const restore = readFileSync(join(SRC_ROOT, 'simulation/runtime/restore-session.ts'), 'utf8');
    expect(/\bas\s+unknown\s+as\s+SessionSnapshotBundle\b/.test(stripComments(restore))).toBe(true);
  });

  it('finds no source file asserting its way to a bundle inline', () => {
    const offenders = SOURCES.filter((file) => {
      const text = readFileSync(file, 'utf8');
      // The declaration inside `sessionSnapshotBundleFromTransport` is the one
      // legitimate occurrence, and it is excluded by name rather than by
      // counting, so moving it does not silently widen this gate.
      if (file.endsWith(join('simulation', 'runtime', 'restore-session.ts'))) return false;
      return /\bas\s+unknown\s+as\s+SessionSnapshotBundle\b/.test(stripComments(text));
    });
    expect(offenders.map((file) => relative(SRC_ROOT, file))).toEqual([]);
  });

  it('keeps both conversions where their callers can reach them', () => {
    const restore = readFileSync(join(SRC_ROOT, 'simulation/runtime/restore-session.ts'), 'utf8');
    expect(restore).toContain('export function sessionSnapshotBundleFromTransport(data: JsonValue): SessionSnapshotBundle');

    const controller = readFileSync(join(SRC_ROOT, 'persistence/session/session-controller.ts'), 'utf8');
    expect(controller).toContain('function bundleFromSavePayload(payload: SavePayload): SessionSnapshotBundle');
  });
});

/**
 * Strips `//` and block comments so a docblock *describing* the old spelling
 * -- `src/simulation/operations/job.ts` carries one -- is not read as an
 * instance of it.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
