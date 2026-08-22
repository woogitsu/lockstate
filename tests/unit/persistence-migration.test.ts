import { describe, expect, it } from 'vitest';
import { MigrationChain, type VersionSchema } from '../../src/persistence/migration';

// A small synthetic three-version chain, unrelated to the real save
// schema, used purely to exercise the generic dispatcher: multi-hop
// walking, per-step validation and source-fixture immutability.
interface WidgetV1 {
  readonly version: 1;
  readonly name: string;
}
interface WidgetV2 {
  readonly version: 2;
  readonly name: string;
  readonly quantity: number;
}
interface WidgetV3 {
  readonly version: 3;
  readonly label: string;
  readonly quantity: number;
}

function schema<T extends { readonly version: number }>(
  version: number,
  isValid: (input: unknown) => input is T,
): VersionSchema<T> {
  return {
    version,
    parse: (input) => (isValid(input) ? { ok: true, value: input } : { ok: false, issues: [`not a valid v${version} widget`] }),
  };
}

function buildWidgetChain(): MigrationChain {
  const chain = new MigrationChain(3);
  chain.registerSchema(
    schema<WidgetV1>(1, (input): input is WidgetV1 =>
      typeof input === 'object' && input !== null && (input as WidgetV1).version === 1 && typeof (input as WidgetV1).name === 'string',
    ),
  );
  chain.registerSchema(
    schema<WidgetV2>(2, (input): input is WidgetV2 =>
      typeof input === 'object' &&
      input !== null &&
      (input as WidgetV2).version === 2 &&
      typeof (input as WidgetV2).name === 'string' &&
      typeof (input as WidgetV2).quantity === 'number',
    ),
  );
  chain.registerSchema(
    schema<WidgetV3>(3, (input): input is WidgetV3 =>
      typeof input === 'object' &&
      input !== null &&
      (input as WidgetV3).version === 3 &&
      typeof (input as WidgetV3).label === 'string' &&
      typeof (input as WidgetV3).quantity === 'number',
    ),
  );
  chain.registerMigration({
    fromVersion: 1,
    toVersion: 2,
    migrate: (input) => ({ ...(input as WidgetV1), version: 2, quantity: 1 }),
  });
  chain.registerMigration({
    fromVersion: 2,
    toVersion: 3,
    migrate: (input) => {
      const { name, quantity } = input as WidgetV2;
      return { version: 3, label: name, quantity };
    },
  });
  return chain;
}

describe('MigrationChain', () => {
  it('walks every required transition in order, oldest version first', () => {
    const chain = buildWidgetChain();
    const v1: WidgetV1 = { version: 1, name: 'bolt' };
    const result = chain.migrate<WidgetV3>(v1, 1);
    expect(result).toMatchObject({ ok: true, value: { version: 3, label: 'bolt', quantity: 1 }, fromVersion: 1, stepsApplied: 2 });
  });

  it('applies zero steps when the input is already the latest version', () => {
    const chain = buildWidgetChain();
    const v3: WidgetV3 = { version: 3, label: 'nut', quantity: 5 };
    const result = chain.migrate<WidgetV3>(v3, 3);
    expect(result).toMatchObject({ ok: true, value: v3, stepsApplied: 0 });
  });

  it('never mutates the source fixture while migrating', () => {
    const chain = buildWidgetChain();
    const fixture = { version: 1 as const, name: 'washer' };
    const fixtureCopy = structuredClone(fixture);
    chain.migrate(fixture, 1);
    expect(fixture).toEqual(fixtureCopy);
  });

  it('fails validation before migrating when the declared-version payload is malformed', () => {
    const chain = buildWidgetChain();
    const result = chain.migrate({ version: 1 }, 1);
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-shape', atVersion: 1 } });
  });

  it('rejects a version newer than the latest supported one with a distinct error', () => {
    const chain = buildWidgetChain();
    const result = chain.migrate({ version: 4 }, 4);
    expect(result).toMatchObject({ ok: false, error: { code: 'unsupported-version', atVersion: 4 } });
  });

  it('rejects a version with no registered schema and no newer target as a distinct error', () => {
    const chain = new MigrationChain(3);
    chain.registerSchema(schema<WidgetV3>(3, (input): input is WidgetV3 => typeof input === 'object' && input !== null));
    const result = chain.migrate({}, 1);
    expect(result).toMatchObject({ ok: false, error: { code: 'no-migration-path', atVersion: 1 } });
  });

  it('reports a broken migration step (invalid output) as a distinct error without silently accepting it', () => {
    const chain = new MigrationChain(2);
    chain.registerSchema(schema<WidgetV1>(1, (input): input is WidgetV1 => typeof input === 'object' && input !== null));
    chain.registerSchema(
      schema<WidgetV2>(
        2,
        (input): input is WidgetV2 => typeof input === 'object' && input !== null && typeof (input as WidgetV2).quantity === 'number',
      ),
    );
    chain.registerMigration({ fromVersion: 1, toVersion: 2, migrate: () => ({ version: 2 }) }); // missing `quantity`

    const result = chain.migrate({ version: 1 }, 1);
    expect(result).toMatchObject({ ok: false, error: { code: 'migration-produced-invalid-output', atVersion: 1 } });
  });

  it('rejects a non-integer or negative declared version outright', () => {
    const chain = buildWidgetChain();
    expect(chain.migrate({}, 1.5)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
    expect(chain.migrate({}, -1)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('rejects duplicate schema registration and migrations that skip or repeat a version', () => {
    const chain = new MigrationChain(2);
    chain.registerSchema(schema<WidgetV1>(1, (input): input is WidgetV1 => typeof input === 'object'));
    expect(() => chain.registerSchema(schema<WidgetV1>(1, (input): input is WidgetV1 => typeof input === 'object'))).toThrow();

    expect(() => chain.registerMigration({ fromVersion: 1, toVersion: 3, migrate: (v) => v })).toThrow(); // skips a version, and v3 unregistered

    chain.registerSchema(schema<WidgetV2>(2, (input): input is WidgetV2 => typeof input === 'object'));
    chain.registerMigration({ fromVersion: 1, toVersion: 2, migrate: (v) => v });
    expect(() => chain.registerMigration({ fromVersion: 1, toVersion: 2, migrate: (v) => v })).toThrow();
  });
});
