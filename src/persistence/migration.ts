/**
 * A version-scoped structural check. Each supported save-schema version owns
 * exactly one of these; `parse` must return a fresh value and never mutate
 * `input` in place, so a migration cannot corrupt the caller's fixture by
 * writing to what it was handed.
 *
 * One precision, because the guarantee is narrower than it reads: the value
 * `zodVersionSchema` returns is fresh at every node Zod rebuilds, but a
 * `z.custom` node has no shape to rebuild from -- it validates by *predicate*
 * and returns its input **by reference**. `jsonValueSchema`
 * (`src/simulation/protocol/types.ts:48`) is built that way, and is still a
 * pass-through wherever it is used bare.
 *
 * **This paragraph used to continue "-- and so a save's queued command
 * payloads --", and that half stopped being true one commit after it was
 * written.** It is marked rather than deleted because #105 corrected this
 * docblock *into* that reading and a reader arriving from it needs to see the
 * turn. Since #106 the save schema wraps the pass-through in a `.transform`
 * that `structuredClone`s -- `detachedJsonValueSchema`, `save-schema.ts:75` --
 * and applies it at `queuedCommandSchema.payload` (`save-schema.ts:82`), which
 * every version schema registered in `saveMigrationChain`
 * (`save-schema.ts:1503-1507`) reaches through the shared
 * `kernelSnapshotSchema`. So a save's queued command payloads are
 * detached at parse, on every version, and no longer alias the caller's input.
 * `save-schema.ts:55-75` records why the clone sits at that field instead of
 * inside `jsonValueSchema`, and `markTrusted`'s comment carries the same
 * history from the other end;
 * `tests/unit/persistence-save-schema-aliasing.test.ts` is what fails if
 * either drifts back.
 *
 * What the general warning still covers, and why it is kept rather than
 * retired with the instance: a step that mutated a `z.custom` sub-object in
 * place *would* reach the caller's input, and the detachment above is a
 * property of one field in one schema, not of `zodVersionSchema`. A future
 * payload field typed by a bare `z.custom` reopens it. The existing steps
 * rebuild rather than mutate, which is what "must be pure" below requires of
 * any new one.
 *
 * Values are treated as opaque (`unknown`) rather than constrained to
 * `JsonValue`: the chain only ever calls `parse`/`migrate` on them, and
 * concrete Zod-inferred interfaces do not structurally satisfy an
 * index-signature type like `JsonValue` even when every field is one.
 */
export interface VersionSchema<T = unknown> {
  readonly version: number;
  readonly parse: (input: unknown) => VersionParseResult<T>;
}

export type VersionParseResult<T = unknown> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly string[] };

/** Migrates exactly one version forward. Must be pure: no mutation of `input`, no side effects. */
export interface MigrationStep {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (input: unknown) => unknown;
}

export type MigrationErrorCode =
  | 'invalid-shape'
  | 'unsupported-version'
  | 'no-migration-path'
  | 'migration-produced-invalid-output'
  /**
   * A step threw instead of returning. Distinct from
   * `migration-produced-invalid-output` because that code's whole meaning is
   * "the step *ran* and its output failed the destination schema"; a step that
   * threw produced no output to fail one, and the two say different things to
   * whoever has to fix it. Collapsing them would also make
   * `docs/PERSISTENCE.md`'s taxonomy row for that code false.
   *
   * Every consumer of this union is non-exhaustive by construction --
   * `describeImportResult` (`src/ui/save-panel.ts`) ends in a `default:` arm
   * and `PrisonSaveRepository.loadCurrent` treats any `ok !== true` alike --
   * so adding an arm is additive rather than a breaking widening. It changes
   * no player-facing string: the panel's `default:` already routes it to the
   * same "this save's contents do not hold up" sentence, with the message as
   * `{detail}`.
   */
  | 'migration-step-threw';

export interface MigrationError {
  readonly code: MigrationErrorCode;
  readonly message: string;
  readonly atVersion?: number;
}

export type MigrationResult<T = unknown> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly fromVersion: number;
      readonly stepsApplied: number;
      /**
       * `input` as validated against its **declared** version, before any
       * migration step ran. Exposed because some integrity checks are only
       * meaningful against the value as it was written: a save's checksum
       * covers its own version's payload, so a migration that rewrites the
       * payload would make that checksum unverifiable if only the migrated
       * value were available. When `stepsApplied` is 0 this is the same
       * object as `value`.
       */
      readonly declaredValue: unknown;
    }
  | { readonly ok: false; readonly error: MigrationError };

/**
 * The thrown value as one line of diagnostic, without assuming it is an
 * `Error`: a step is arbitrary code and `throw 'nope'` is legal. The message
 * is spliced into the panel's `{detail}` for an import, so it has to be a
 * string in every case rather than `[object Object]` in one of them.
 */
function describeThrown(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * A forward-only Vn -> Vn+1 migration dispatcher. Historical version schemas
 * are registered once and never edited; migrations advance exactly one
 * version at a time and are re-validated against the destination schema
 * before their output is trusted.
 */
export class MigrationChain {
  private readonly schemas = new Map<number, VersionSchema>();
  private readonly steps = new Map<number, MigrationStep>();

  public constructor(public readonly latestVersion: number) {
    if (!Number.isInteger(latestVersion) || latestVersion < 1) {
      throw new RangeError('latestVersion must be a positive integer.');
    }
  }

  public registerSchema(schema: VersionSchema): void {
    if (this.schemas.has(schema.version)) {
      throw new Error(`A schema for version ${schema.version} is already registered.`);
    }
    this.schemas.set(schema.version, schema);
  }

  public registerMigration(step: MigrationStep): void {
    if (step.toVersion !== step.fromVersion + 1) {
      throw new Error('Migrations must advance exactly one version at a time.');
    }
    if (!this.schemas.has(step.fromVersion) || !this.schemas.has(step.toVersion)) {
      throw new Error(
        `Migration ${step.fromVersion} -> ${step.toVersion} requires both version schemas to be registered first.`,
      );
    }
    if (this.steps.has(step.fromVersion)) {
      throw new Error(`A migration from version ${step.fromVersion} is already registered.`);
    }
    this.steps.set(step.fromVersion, step);
  }

  /** Validates `input` against its declared version, then walks every migration required to reach `latestVersion`. */
  public migrate<T = unknown>(input: unknown, declaredVersion: number): MigrationResult<T> {
    if (!Number.isInteger(declaredVersion) || declaredVersion < 1) {
      return { ok: false, error: { code: 'invalid-shape', message: 'Declared version must be a positive integer.' } };
    }

    const startSchema = this.schemas.get(declaredVersion);
    if (startSchema === undefined) {
      return {
        ok: false,
        error:
          declaredVersion > this.latestVersion
            ? {
                code: 'unsupported-version',
                message: `Version ${declaredVersion} is newer than the latest supported version ${this.latestVersion}.`,
                atVersion: declaredVersion,
              }
            : {
                code: 'no-migration-path',
                message: `No schema is registered for version ${declaredVersion}.`,
                atVersion: declaredVersion,
              },
      };
    }

    const initialParse = startSchema.parse(input);
    if (!initialParse.ok) {
      return {
        ok: false,
        error: {
          code: 'invalid-shape',
          message: `Version ${declaredVersion} payload failed validation: ${initialParse.issues.join('; ')}`,
          atVersion: declaredVersion,
        },
      };
    }

    const declaredValue: unknown = initialParse.value;
    let currentVersion = declaredVersion;
    let currentValue: unknown = declaredValue;
    let stepsApplied = 0;

    while (currentVersion !== this.latestVersion) {
      const step = this.steps.get(currentVersion);
      if (step === undefined) {
        return {
          ok: false,
          error: {
            code: 'no-migration-path',
            message: `No migration is registered from version ${currentVersion} toward ${this.latestVersion}.`,
            atVersion: currentVersion,
          },
        };
      }

      // A step that throws is a **verdict**, not an exception the caller has
      // to catch. `decodeSaveEnvelope` is a total function returning
      // `{ok:false, error}` -- `PrisonSaveRepository.loadCurrent`'s recovery
      // walk and `importSave` both call it unguarded, so an exception escaping
      // here does not merely fail one generation, it aborts the walk that
      // would have reached an older good one. Steps are contracted to be pure
      // total functions, so reaching this catch means one is defective (or is
      // being handed a value its own version's schema admitted and it cannot
      // process); either way the answer the boundary owes its caller is a
      // refusal with a code, at the version the step started from.
      let migrated: unknown;
      try {
        migrated = step.migrate(currentValue);
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'migration-step-threw',
            message: `Migration ${currentVersion} -> ${step.toVersion} threw: ${describeThrown(error)}`,
            atVersion: currentVersion,
          },
        };
      }
      const nextSchema = this.schemas.get(step.toVersion);
      if (nextSchema === undefined) {
        throw new Error(`Invariant violated: schema for version ${step.toVersion} is missing after registration.`);
      }

      const outputParse = nextSchema.parse(migrated);
      if (!outputParse.ok) {
        return {
          ok: false,
          error: {
            code: 'migration-produced-invalid-output',
            message: `Migration ${currentVersion} -> ${step.toVersion} produced an invalid payload: ${outputParse.issues.join('; ')}`,
            atVersion: currentVersion,
          },
        };
      }

      currentValue = outputParse.value;
      currentVersion = step.toVersion;
      stepsApplied += 1;
    }

    return { ok: true, value: currentValue as T, fromVersion: declaredVersion, stepsApplied, declaredValue };
  }
}
