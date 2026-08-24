import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCloudSaveClient } from '../../src/persistence/cloud/supabase-client';

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
