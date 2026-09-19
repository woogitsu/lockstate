import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCloudSaveClient } from '../../src/persistence/cloud/supabase-client';
import { createSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/**
 * What this file does and does not prove.
 *
 * `SupabaseCloudSaveClient` is deliberately untested against a fake in
 * general: RLS, grants and `create_save_version`'s `SECURITY DEFINER` /
 * row-locking behavior are properties of PostgreSQL, and a JS fake asserting
 * them would test the fake (`docs/CLOUD_SAVE.md`, and the class's own header).
 *
 * *Which rows the client asks for* is a different kind of claim: it is a
 * property of the query this repository builds, so it can be pinned here and
 * nowhere cheaper. The stand-in below therefore does exactly one thing
 * faithfully — it **applies** every `.eq()` filter it is given — so a query
 * that forgets a filter really does see the extra rows, and dropping a filter
 * fails a test instead of passing vacuously. It has no notion of ownership,
 * roles or policies, and nothing here should be read as evidence about them.
 */

type Row = Readonly<Record<string, unknown>>;

interface RecordedQuery {
  readonly table: string;
  readonly columns: string;
  readonly filters: readonly (readonly [string, unknown])[];
  readonly terminator: 'single' | 'maybeSingle';
}

interface PostgrestResult {
  readonly data: Row | null;
  readonly error: { readonly message: string } | null;
}

class FilterRecordingPostgrest {
  public readonly queries: RecordedQuery[] = [];

  public constructor(private readonly tables: Readonly<Record<string, readonly Row[]>>) {}

  public from(table: string): SelectStage {
    return new SelectStage(this, table);
  }

  /** Called by the builder once a terminator runs, so the recorded query is complete. */
  public resolve(table: string, columns: string, filters: readonly (readonly [string, unknown])[], terminator: 'single' | 'maybeSingle'): PostgrestResult {
    this.queries.push({ table, columns, filters, terminator });

    const rows = (this.tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
    if (rows.length > 1) {
      return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
    }
    const row = rows[0];
    if (row === undefined) {
      return terminator === 'single'
        ? { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } }
        : { data: null, error: null };
    }
    return { data: row, error: null };
  }

  public asSupabaseClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class SelectStage {
  public constructor(
    private readonly owner: FilterRecordingPostgrest,
    private readonly table: string,
  ) {}

  public select(columns: string): FilterStage {
    return new FilterStage(this.owner, this.table, columns);
  }

  public insert(): never {
    throw new Error('The stand-in implements select() only; a write path reaching it would be untested, not fake-tested.');
  }
}

class FilterStage {
  private readonly filters: (readonly [string, unknown])[] = [];

  public constructor(
    private readonly owner: FilterRecordingPostgrest,
    private readonly table: string,
    private readonly columns: string,
  ) {}

  public eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  public single(): Promise<PostgrestResult> {
    return Promise.resolve(this.owner.resolve(this.table, this.columns, this.filters, 'single'));
  }

  public maybeSingle(): Promise<PostgrestResult> {
    return Promise.resolve(this.owner.resolve(this.table, this.columns, this.filters, 'maybeSingle'));
  }
}

/**
 * A same-owner id mix-up: `prison-a`'s pointer names a save version that
 * belongs to `prison-b`. Both prisons are the same owner's, so RLS permits
 * reading both rows — which is precisely why the client, not the database,
 * has to scope the read (#105 finding 13).
 */
function crossedPointerFixture(): FilterRecordingPostgrest {
  return new FilterRecordingPostgrest({
    prisons: [
      { id: 'prison-a', game_version: 'lockstate-0.0.0', current_version_id: 'version-of-prison-b' },
      { id: 'prison-b', game_version: 'lockstate-0.0.0', current_version_id: 'version-of-prison-b' },
    ],
    save_versions: [
      {
        id: 'version-of-prison-b',
        prison_id: 'prison-b',
        revision: 7,
        checksum: 'checksum-b',
        save_schema_version: 3,
        payload: { belongs_to: 'prison-b' },
        storage_path: null,
        created_at: '2026-08-23T00:00:00.000Z',
      },
    ],
  });
}

describe('SupabaseCloudSaveClient: save-version reads are scoped to their prison', () => {
  it('getPrisonState refuses a current-version pointer that resolves to another prison, instead of reporting its revision', async () => {
    const postgrest = crossedPointerFixture();
    const client = new SupabaseCloudSaveClient(postgrest.asSupabaseClient());

    await expect(client.getPrisonState('prison-a')).rejects.toThrow(/Failed to load the current save version/);

    const versionQuery = postgrest.queries.find((query) => query.table === 'save_versions');
    expect(versionQuery?.filters).toEqual([
      ['prison_id', 'prison-a'],
      ['id', 'version-of-prison-b'],
    ]);
  });

  it('getPrisonState still resolves a pointer into its own prison', async () => {
    const postgrest = new FilterRecordingPostgrest({
      prisons: [{ id: 'prison-a', game_version: 'lockstate-0.0.0', current_version_id: 'version-a' }],
      save_versions: [{ id: 'version-a', prison_id: 'prison-a', revision: 4, checksum: 'checksum-a' }],
    });
    const client = new SupabaseCloudSaveClient(postgrest.asSupabaseClient());

    expect(await client.getPrisonState('prison-a')).toEqual({
      prisonId: 'prison-a',
      currentVersion: { versionId: 'version-a', revision: 4, checksum: 'checksum-a' },
    });
  });

  it('getPrisonState reports a prison with no version yet without reading save_versions at all', async () => {
    const postgrest = new FilterRecordingPostgrest({
      prisons: [{ id: 'prison-a', game_version: 'lockstate-0.0.0', current_version_id: null }],
      save_versions: [],
    });
    const client = new SupabaseCloudSaveClient(postgrest.asSupabaseClient());

    expect(await client.getPrisonState('prison-a')).toEqual({ prisonId: 'prison-a', currentVersion: undefined });
    expect(postgrest.queries.map((query) => query.table)).toEqual(['prisons']);
  });

  it('downloadVersion keeps the same scoping: a version id from another prison reads as absent', async () => {
    const postgrest = crossedPointerFixture();
    const client = new SupabaseCloudSaveClient(postgrest.asSupabaseClient());

    expect(await client.downloadVersion('prison-a', 'version-of-prison-b')).toBeUndefined();

    const versionQuery = postgrest.queries.find((query) => query.table === 'save_versions');
    expect(versionQuery?.filters).toEqual([
      ['prison_id', 'prison-a'],
      ['id', 'version-of-prison-b'],
    ]);
  });

  it('downloadVersion returns the envelope shape when the version does belong to the prison', async () => {
    const postgrest = crossedPointerFixture();
    const client = new SupabaseCloudSaveClient(postgrest.asSupabaseClient());

    expect(await client.downloadVersion('prison-b', 'version-of-prison-b')).toEqual({
      saveSchemaVersion: 3,
      gameVersion: 'lockstate-0.0.0',
      prisonId: 'prison-b',
      revision: 7,
      createdAt: Date.parse('2026-08-23T00:00:00.000Z'),
      updatedAt: Date.parse('2026-08-23T00:00:00.000Z'),
      checksum: 'checksum-b',
      payload: { belongs_to: 'prison-b' },
    });
  });
});

/**
 * The second thing a pure-JS fake can prove: **which outcome each RPC status
 * maps to**.
 *
 * Like the query shape above, this is a property of the code in this file
 * rather than of PostgreSQL, so it can be pinned here and nowhere cheaper.
 * Nothing below says anything about RLS, grants, or whether the RPC actually
 * returns the status the stub hands it -- `supabase/tests/` covers that half.
 *
 * It exists because #264 S7 measured the gap. `tests/foundation/
 * rpc-status-vocabulary-contract.test.ts` asserts that the statuses the
 * database can return are exactly the ones the client's row type names -- but
 * it reads the **interface field**, not the `switch` body. So a *missing*
 * case is caught by `tsc` (the switch is exhaustive over a union and the
 * function has no fallthrough return), while a *wrong* case is caught by
 * nothing:
 *
 *     case 'at_slot_limit':
 *   -   return { status: 'at-slot-limit', used: ..., capacity: ... };
 *   +   return { status: 'slot-taken', slotIndex: row.slot_index ?? slotIndex };
 *
 * That mutation left the whole suite green. A caller would then be told the
 * slot was taken -- retry another slot -- when the account is actually out of
 * slots, and every retry would fail the same way.
 */

interface RpcCall {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
}

class RpcRecordingStub {
  public readonly calls: RpcCall[] = [];

  public constructor(private readonly result: { data: unknown; error: { message: string } | null }) {}

  public rpc(name: string, args: Readonly<Record<string, unknown>>): Promise<{ data: unknown; error: { message: string } | null }> {
    this.calls.push({ name, args });
    return Promise.resolve(this.result);
  }

  public asSupabaseClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

/** A `create_prison` row, defaulting every nullable column to null. */
function createPrisonRow(overrides: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { status: 'created', prison_id: null, slot_index: null, used_slots: null, capacity: null, ...overrides };
}

async function registerWith(row: unknown, error: { message: string } | null = null) {
  const stub = new RpcRecordingStub({ data: row, error });
  const client = new SupabaseCloudSaveClient(stub.asSupabaseClient());
  return { stub, outcome: await client.registerPrison('prison-1', 'lockstate-0.0.0', 2) };
}

describe('SupabaseCloudSaveClient: registerPrison maps every create_prison status', () => {
  it('calls create_prison with the parameter names the migration declares', async () => {
    const { stub } = await registerWith(createPrisonRow({ status: 'created', slot_index: 2 }));

    // Pinned as literals rather than read back from the call: a renamed
    // parameter is not a type error on either side of PostgREST, so it would
    // surface only as a runtime failure against the real database.
    expect(stub.calls).toEqual([
      { name: 'create_prison', args: { p_prison_id: 'prison-1', p_game_version: 'lockstate-0.0.0', p_slot_index: 2 } },
    ]);
  });

  it('created reports the slot the server used, not the slot that was asked for', async () => {
    const { outcome } = await registerWith(createPrisonRow({ status: 'created', slot_index: 5 }));
    expect(outcome).toEqual({ status: 'created', slotIndex: 5 });
  });

  it('created falls back to the requested slot when the server reports none', async () => {
    const { outcome } = await registerWith(createPrisonRow({ status: 'created', slot_index: null }));
    expect(outcome).toEqual({ status: 'created', slotIndex: 2 });
  });

  it('at_slot_limit reports usage against capacity -- it is not slot-taken', async () => {
    const { outcome } = await registerWith(createPrisonRow({ status: 'at_slot_limit', used_slots: 3, capacity: 3 }));
    expect(outcome).toEqual({ status: 'at-slot-limit', used: 3, capacity: 3 });
  });

  it('at_slot_limit defaults both counters to zero rather than reporting undefined usage', async () => {
    const { outcome } = await registerWith(createPrisonRow({ status: 'at_slot_limit' }));
    expect(outcome).toEqual({ status: 'at-slot-limit', used: 0, capacity: 0 });
  });

  it('slot_taken reports the contested slot', async () => {
    const { outcome } = await registerWith(createPrisonRow({ status: 'slot_taken', slot_index: 2 }));
    expect(outcome).toEqual({ status: 'slot-taken', slotIndex: 2 });
  });

  it('gives the three statuses three distinct outcomes', async () => {
    // The assertion S7 needed. Each case above pins one mapping; this pins
    // that no two of them collapse onto the same outcome, which is what a
    // copy-pasted `return` produces and what no per-case assertion can see on
    // its own.
    const statuses = ['created', 'at_slot_limit', 'slot_taken'] as const;
    const outcomes = await Promise.all(
      statuses.map(async (status) => (await registerWith(createPrisonRow({ status, slot_index: 2 }))).outcome.status),
    );

    expect(outcomes).toEqual(['created', 'at-slot-limit', 'slot-taken']);
    expect(new Set(outcomes).size).toBe(statuses.length);
  });

  it('reports an RPC error as an error carrying the database message', async () => {
    const { outcome } = await registerWith(null, { message: 'permission denied for function create_prison' });
    expect(outcome).toEqual({ status: 'error', message: 'permission denied for function create_prison' });
  });

  it('reports a missing row as an error rather than inventing a slot', async () => {
    const { outcome } = await registerWith(undefined);
    expect(outcome).toEqual({ status: 'error', message: 'create_prison returned no row.' });
  });

  it('unwraps a single-element array, which is how PostgREST returns a set-returning function', async () => {
    const { outcome } = await registerWith([createPrisonRow({ status: 'created', slot_index: 9 })]);
    expect(outcome).toEqual({ status: 'created', slotIndex: 9 });
  });
});

/**
 * `uploadVersion` has the same shape and the same gap, so it gets the same
 * treatment. Its `conflict` case carries one extra decision worth pinning:
 * `cloudCurrent` is omitted when the reported revision is 0, because there is
 * no earlier version to point the caller at.
 *
 * THE ROW A FIXTURE SUPPLIES HAS TO BE A ROW THE SQL CAN RETURN, and the
 * revision-0 case below did not. As written it supplied
 * `{ version_id: 'v-0', revision: 0, checksum: 'sum-0' }` -- a version that
 * does not exist, given an id and a checksum. `create_save_version` returns
 * `v_current_version_id, v_current_revision, v_current_checksum` on a conflict
 * (`20260822190300_create_save_version_rpc.sql:132-138`), and a prison with no
 * saved version holds NULL and 0 for the first two
 * (`20260822190100_create_prisons.sql:12-13`), so the real row is
 * `('conflict', NULL, 0, NULL)` -- pinned by execution against PostgreSQL in
 * `supabase/tests/001_rls_and_save_version_rpc.test.sql`. Against the honest
 * fixture the test failed: the adapter's null-column guard ran before the
 * status switch and answered `{ status: 'error' }`, so the branch this test is
 * named after was unreachable and the test passed on a state that cannot
 * occur.
 */
function uploadEnvelope(revision: number): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(revision, 0);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'prison-1',
    revision,
    createdAt: 0,
    updatedAt: revision,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

/** A `create_save_version` row, defaulting every nullable column to null. */
function createSaveVersionRow(overrides: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return { status: 'created', version_id: null, revision: null, checksum: null, ...overrides };
}

async function uploadWith(row: unknown, error: { message: string } | null = null) {
  const stub = new RpcRecordingStub({ data: row, error });
  const client = new SupabaseCloudSaveClient(stub.asSupabaseClient());
  return { stub, outcome: await client.uploadVersion('prison-1', 1, uploadEnvelope(1)) };
}

describe('SupabaseCloudSaveClient: uploadVersion maps every create_save_version status', () => {
  it('created returns the version the server recorded', async () => {
    const { outcome } = await uploadWith(
      createSaveVersionRow({ status: 'created', version_id: 'v-1', revision: 1, checksum: 'sum-1' }),
    );
    expect(outcome).toEqual({ status: 'created', version: { versionId: 'v-1', revision: 1, checksum: 'sum-1' } });
  });

  it('idempotent_replay returns the same version under the hyphenated status', async () => {
    const { outcome } = await uploadWith(
      createSaveVersionRow({ status: 'idempotent_replay', version_id: 'v-1', revision: 1, checksum: 'sum-1' }),
    );
    expect(outcome).toEqual({ status: 'idempotent-replay', version: { versionId: 'v-1', revision: 1, checksum: 'sum-1' } });
  });

  it('conflict points the caller at the cloud version it lost to', async () => {
    const { outcome } = await uploadWith(
      createSaveVersionRow({ status: 'conflict', version_id: 'v-9', revision: 9, checksum: 'sum-9' }),
    );
    expect(outcome).toEqual({ status: 'conflict', cloudCurrent: { versionId: 'v-9', revision: 9, checksum: 'sum-9' } });
  });

  it('conflict at revision 0 omits cloudCurrent, because there is no earlier version to point at', async () => {
    const { outcome } = await uploadWith(
      createSaveVersionRow({ status: 'conflict', version_id: null, revision: 0, checksum: null }),
    );
    expect(outcome).toEqual({ status: 'conflict', cloudCurrent: undefined });
  });

  /**
   * The other half of the revision-0 case, and the reason the fix is not
   * "tolerate nulls on a conflict". A conflict at a positive revision is the
   * cloud naming a version that exists; an incomplete row there is incoherent,
   * not empty. Read as empty it would send the caller to
   * `resolveSyncConflict('keep-local', undefined)` and a `retry-push` at
   * revision 1, into a prison that is already past it.
   */
  it('a conflict at a positive revision refuses an incomplete version instead of reading it as an empty prison', async () => {
    for (const missing of ['version_id', 'checksum'] as const) {
      const row = createSaveVersionRow({ status: 'conflict', version_id: 'v-9', revision: 9, checksum: 'sum-9', [missing]: null });
      const { outcome } = await uploadWith(row);
      expect(outcome, `a null ${missing} at revision 9 is incoherent, not an empty prison`).toEqual({
        status: 'error',
        message: 'create_save_version returned no row.',
      });
    }
  });

  /**
   * The revision is the column that decides which of the two conflicts this is,
   * so a row without one is refused rather than guessed at. The fixture leaves
   * the other two columns populated on purpose: a row missing all three would
   * pass this assertion on the strength of the id alone.
   */
  it('a conflict with no revision at all is an error, since the revision is what tells the two conflicts apart', async () => {
    const { outcome } = await uploadWith(createSaveVersionRow({ status: 'conflict', version_id: 'v-9', revision: null, checksum: 'sum-9' }));
    expect(outcome).toEqual({ status: 'error', message: 'create_save_version returned no row.' });
  });

  it('gives the three statuses three distinct outcomes', async () => {
    const statuses = ['created', 'idempotent_replay', 'conflict'] as const;
    const outcomes = await Promise.all(
      statuses.map(async (status) =>
        (await uploadWith(createSaveVersionRow({ status, version_id: 'v-1', revision: 1, checksum: 'sum-1' }))).outcome.status,
      ),
    );

    expect(outcomes).toEqual(['created', 'idempotent-replay', 'conflict']);
    expect(new Set(outcomes).size).toBe(statuses.length);
  });

  it('treats a row missing any of the three version columns as an error rather than a partial version', async () => {
    for (const missing of ['version_id', 'revision', 'checksum'] as const) {
      const row = createSaveVersionRow({ status: 'created', version_id: 'v-1', revision: 1, checksum: 'sum-1', [missing]: null });
      const { outcome } = await uploadWith(row);
      expect(outcome, `a null ${missing} must not produce a version`).toEqual({
        status: 'error',
        message: 'create_save_version returned no row.',
      });
    }
  });

  it('reports an RPC error as an error carrying the database message', async () => {
    const { outcome } = await uploadWith(null, { message: 'row-level security policy violation' });
    expect(outcome).toEqual({ status: 'error', message: 'row-level security policy violation' });
  });

  it('sends the payload byte size the database bounds against, measured in UTF-8 bytes', async () => {
    const envelope = uploadEnvelope(1);
    const stub = new RpcRecordingStub({
      data: createSaveVersionRow({ status: 'created', version_id: 'v-1', revision: 1, checksum: 'sum-1' }),
      error: null,
    });
    await new SupabaseCloudSaveClient(stub.asSupabaseClient()).uploadVersion('prison-1', 1, envelope);

    const args = stub.calls[0]!.args;
    expect(args['p_byte_size']).toBe(new TextEncoder().encode(JSON.stringify(envelope.payload)).length);
    expect(args['p_prison_id']).toBe('prison-1');
    expect(args['p_new_revision']).toBe(1);
    expect(args['p_storage_path']).toBeNull();
  });

  /**
   * The assertion above recomputes the expression the production code uses,
   * which makes it a comparison of a function against its own output -- it
   * holds for `JSON.stringify(payload).length` just as well, because every
   * character in a real envelope is ASCII and the two agree there. Measured:
   * replacing the encoder with `JSON.stringify(...).length` left all 23 tests
   * green.
   *
   * `JSON.stringify().length` counts UTF-16 code units. The bound the
   * database enforces is on **bytes**, so under that mutation a payload of
   * multi-byte characters is reported as far smaller than it is, and a save
   * that should be refused for size is accepted. Pinning it needs a payload
   * where the two numbers differ and a literal that is neither of the code
   * paths' own output.
   *
   * The envelope is cast rather than built through `createSaveEnvelope`
   * because this class is not the validator -- `uploadVersion` reads
   * `payload`, `saveSchemaVersion` and `checksum` and nothing else, and a
   * payload of non-ASCII text is not something the real builder produces
   * from a world snapshot.
   */
  it('measures the payload in UTF-8 bytes, not UTF-16 code units', async () => {
    // `{"note":"zażółć"}` -- 17 characters, and 6 of them ("zażółć") carry
    // 4 two-byte characters, so the UTF-8 length is 17 + 4 = 21.
    const envelope = { saveSchemaVersion: 3, checksum: 'sum-1', payload: { note: 'zażółć' } } as unknown as SaveEnvelope;
    expect(JSON.stringify(envelope.payload)).toHaveLength(17);

    const stub = new RpcRecordingStub({
      data: createSaveVersionRow({ status: 'created', version_id: 'v-1', revision: 1, checksum: 'sum-1' }),
      error: null,
    });
    await new SupabaseCloudSaveClient(stub.asSupabaseClient()).uploadVersion('prison-1', 1, envelope);

    expect(stub.calls[0]!.args['p_byte_size']).toBe(21);
  });
});
