/**
 * A version-scoped structural check. Each supported save-schema version owns
 * exactly one of these; `parse` must return a fresh value and never mutate
 * `input` in place, so migrations can never corrupt the caller's fixture.
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
  | 'migration-produced-invalid-output';

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

      const migrated = step.migrate(currentValue);
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
