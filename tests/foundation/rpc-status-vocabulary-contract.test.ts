import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { stripComments } from '../helpers/canonical-iteration';

/**
 * Every status a `SECURITY DEFINER` RPC can return is a status the TypeScript
 * client handles, and vice versa.
 *
 * WHY THIS EXISTS. Issue #192 was a disagreement between the cloud client and
 * the schema that nothing could see: `registerPrison` wrote a row the RLS policy
 * could never accept, and it failed 100% of the time on every project. No test
 * caught it because `MemoryCloudSaveClient` succeeds on exactly the arguments the
 * real client fails on, and every `PrisonSyncEngine` test drives the double.
 *
 * The general form of that defect is **the client and the SQL agreeing on paper
 * and not in fact**, and the status vocabulary is the part of that agreement
 * that is mechanically checkable from here. A `switch` over a status union is
 * exhaustive to `tsc`, so a status the database can return and the client does
 * not name falls through it silently -- returning `undefined` from a function
 * typed to return an outcome, at runtime, in production, with no compile error.
 *
 * WHAT THIS DOES NOT DO, stated so the green is not read as more than it is. It
 * does not prove the client sends the right arguments, that a column it writes
 * exists, or that a policy admits the row -- #192 itself would **not** have been
 * caught by this test. Those need a running PostgREST, which is
 * `pnpm verify:stack`'s job and is in no CI gate (#105 owner check 4). What this
 * closes is the neighbouring gap, on the return path, which is the half that can
 * be closed without a stack.
 *
 * AND A STATUS VOCABULARY IS NOT A ROW SHAPE, WHICH IS WHERE THE NEXT DEFECT
 * LIVED. The four assertions above compared the *set of statuses* both sides
 * name and said nothing about what a row carrying a given status looks like.
 * `create_save_version`'s conflict branch returns the prison's own pointer
 * columns (`20260822190300_create_save_version_rpc.sql:132-138`), and on a
 * prison that has never been saved those are `NULL, 0, NULL`. The client named
 * `'conflict'` correctly and still could not reach that branch: it rejected any
 * row with a null version column *before* it read the status, so the one row
 * shape only that status can produce came back as `{ status: 'error' }`. Both
 * sides agreed on the vocabulary and disagreed on the row.
 *
 * So the matrix below is status x column-presence rather than status alone, and
 * it adds the ordering rule that makes such a branch reachable at all: the
 * client must dispatch on `status` before it inspects any other column, because
 * which columns a row carries is a property of the status. What the matrix
 * cannot derive from the SQL text -- that a `v_`-local column is nullable
 * because the table column feeding it is -- is pinned by execution instead, in
 * `supabase/tests/001_rls_and_save_version_rpc.test.sql`, which runs the empty
 * prison's conflict against real PostgreSQL and asserts the row.
 */

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDirectory = join(repositoryRoot, 'supabase', 'migrations');
const clientPath = join(repositoryRoot, 'src', 'persistence', 'cloud', 'supabase-client.ts');

/**
 * Which RPCs the cloud client calls, and the TypeScript row type that declares
 * what each can answer.
 *
 * Declared rather than discovered, because the mapping from a `.rpc('name', …)`
 * call to the interface describing its result is not in the source text -- the
 * cast is on a later line. Both halves are checked against reality below, so a
 * stale entry here fails rather than silently covering nothing.
 */
const RPC_ROW_TYPES: readonly { readonly rpc: string; readonly rowType: string }[] = [
  { rpc: 'create_prison', rowType: 'CreatePrisonRow' },
  { rpc: 'create_save_version', rowType: 'CreateSaveVersionRow' },
];

/**
 * Statuses a PL/pgSQL function can return, read out of its body.
 *
 * Anchored on `return query select '<status>'::text`, which is how every RPC in
 * this schema answers -- the status is always the first selected column and is
 * always a cast literal. A function that answered some other way would produce
 * an empty set here, which the emptiness guard below turns into a failure rather
 * than into a pass.
 */
function statusesReturnedBy(functionName: string): readonly string[] {
  const statuses = new Set<string>();
  for (const entry of readdirSync(migrationsDirectory)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(join(migrationsDirectory, entry), 'utf8');

    // Only the body of the named function. A migration may define several, and
    // `create_save_version`'s `'conflict'` must not be read as one of
    // `create_prison`'s answers.
    const start = sql.indexOf(`function public.${functionName}(`);
    if (start === -1) continue;
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end === -1 ? undefined : end);

    for (const match of body.matchAll(/return query\s+select\s+'([a-z_]+)'::text/gu)) {
      statuses.add(match[1]!);
    }
  }
  return [...statuses].sort();
}

/**
 * The string literals in a TypeScript interface's `status` field.
 *
 * Comments are stripped first with the shared stripper, so a status *named in
 * prose* -- and `20260823100000` names all three of `create_prison`'s in a
 * comment above the signature -- cannot stand in for one the code handles.
 */
function statusesDeclaredBy(rowType: string): readonly string[] {
  const source = stripComments(readFileSync(clientPath, 'utf8'));
  const start = source.indexOf(`interface ${rowType} {`);
  if (start === -1) return [];
  const end = source.indexOf('}', start);
  const body = source.slice(start, end === -1 ? undefined : end);

  const statusLine = /readonly status:\s*([^;]+);/u.exec(body);
  if (statusLine === null) return [];
  return [...statusLine[1]!.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1]!).sort();
}

/**
 * The columns each RPC answers with, in order, and which of them a given status
 * can leave NULL.
 *
 * Declared for the same reason `RPC_ROW_TYPES` is, and checked the same way.
 * The *expressions* half is read straight back out of the SQL below, so an
 * entry cannot describe a row the function does not return nor miss one it
 * does. The *nullable* half is the part the SQL text cannot settle: a literal
 * `null::uuid` announces itself (`create_prison` writes two of those), but
 * `create_save_version`'s conflict returns `v_current_version_id`, whose
 * nullability comes from `prisons.current_version_id` having no `not null`
 * (`20260822190100_create_prisons.sql:12-13`) three statements away. Rather
 * than infer it here, it is pinned by execution:
 * `supabase/tests/001_rls_and_save_version_rpc.test.sql` calls the RPC against
 * an empty prison on real PostgreSQL and asserts `('conflict', NULL, 0, NULL)`.
 *
 * `expressions` is the SQL text of each returned value, `nullable` names the
 * OUT columns by their own names -- which are also the TypeScript row type's
 * field names, checked below.
 */
const RPC_ROW_SHAPES: readonly {
  readonly rpc: string;
  readonly status: string;
  readonly expressions: readonly string[];
  readonly nullable: readonly string[];
}[] = [
  { rpc: 'create_prison', status: 'created', expressions: ['v_new_id', 'p_slot_index', 'v_used + 1', 'v_capacity'], nullable: [] },
  {
    rpc: 'create_prison',
    status: 'at_slot_limit',
    expressions: ['null::uuid', 'p_slot_index', 'v_used', 'v_capacity'],
    nullable: ['prison_id'],
  },
  {
    rpc: 'create_prison',
    status: 'slot_taken',
    expressions: ['null::uuid', 'p_slot_index', 'v_used', 'v_capacity'],
    nullable: ['prison_id'],
  },
  { rpc: 'create_save_version', status: 'created', expressions: ['v_new_version_id', 'p_new_revision', 'p_checksum'], nullable: [] },
  {
    rpc: 'create_save_version',
    status: 'idempotent_replay',
    expressions: ['v_existing_id', 'p_new_revision', 'p_checksum'],
    nullable: [],
  },
  {
    rpc: 'create_save_version',
    status: 'conflict',
    // The empty prison: no current version to name, and revision 0.
    expressions: ['v_current_version_id', 'v_current_revision', 'v_current_checksum'],
    nullable: ['version_id', 'checksum'],
  },
];

/** The `returns table (...)` column names of a PL/pgSQL function, in order. */
function outColumnsOf(functionName: string): readonly string[] {
  for (const entry of readdirSync(migrationsDirectory)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(join(migrationsDirectory, entry), 'utf8');
    const start = sql.indexOf(`create or replace function public.${functionName}(`);
    if (start === -1) continue;

    const listStart = sql.indexOf('returns table (', start);
    if (listStart === -1) return [];
    const listEnd = sql.indexOf(')', listStart);
    const list = sql.slice(listStart + 'returns table ('.length, listEnd).replace(/--[^\n]*/gu, '');
    return list
      .split(',')
      .map((column) => column.trim().split(/\s+/u)[0]!)
      .filter((name) => name !== '');
  }
  return [];
}

/**
 * Every row a function returns, as `(status, expressions)`.
 *
 * Anchored on the same `return query select '<status>'::text` shape the
 * vocabulary reader uses, then split on commas. An expression containing its
 * own comma would split wrongly -- and would then fail the equality against
 * `RPC_ROW_SHAPES` rather than pass quietly, which is the direction to fail in.
 */
function rowShapesReturnedBy(functionName: string): readonly { readonly status: string; readonly expressions: readonly string[] }[] {
  const shapes: { status: string; expressions: readonly string[] }[] = [];
  for (const entry of readdirSync(migrationsDirectory)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(join(migrationsDirectory, entry), 'utf8');

    const start = sql.indexOf(`function public.${functionName}(`);
    if (start === -1) continue;
    const end = sql.indexOf('$$;', start);
    const body = sql.slice(start, end === -1 ? undefined : end);

    for (const match of body.matchAll(/return query\s+select\s+'([a-z_]+)'::text\s*,([^;]+);/gu)) {
      shapes.push({ status: match[1]!, expressions: match[2]!.split(',').map((expression) => expression.trim()) });
    }
  }
  return shapes.sort((left, right) => left.status.localeCompare(right.status));
}

/** The fields of a TypeScript row interface whose declared type admits `null`. */
function nullableFieldsOf(rowType: string): ReadonlySet<string> {
  const source = stripComments(readFileSync(clientPath, 'utf8'));
  const start = source.indexOf(`interface ${rowType} {`);
  if (start === -1) return new Set();
  const end = source.indexOf('}', start);
  const body = source.slice(start, end === -1 ? undefined : end);

  const nullable = new Set<string>();
  for (const match of body.matchAll(/readonly\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;]+);/gu)) {
    if (/\bnull\b/u.test(match[2]!)) nullable.add(match[1]!);
  }
  return nullable;
}

/**
 * The client source between an RPC call and the `switch` that dispatches on its
 * status -- everything the client does with the row before it knows which row it
 * is holding.
 */
function beforeStatusDispatch(rpc: string): string {
  const source = stripComments(readFileSync(clientPath, 'utf8'));
  const call = source.indexOf(`.rpc('${rpc}'`);
  if (call === -1) return '';
  const dispatch = source.indexOf('switch (row.status)', call);
  return dispatch === -1 ? '' : source.slice(call, dispatch);
}

describe('every RPC status the database can return is one the client handles', () => {
  it('finds the RPCs it claims to cover, so this cannot pass vacuously', () => {
    // Both halves, because either going empty would make every comparison below
    // trivially true. The counts are floors rather than pins: an RPC gaining a
    // status is routine, and losing the ability to read any is the failure.
    for (const { rpc, rowType } of RPC_ROW_TYPES) {
      expect(statusesReturnedBy(rpc).length, `no statuses read out of ${rpc}`).toBeGreaterThan(1);
      expect(statusesDeclaredBy(rowType).length, `no statuses read out of ${rowType}`).toBeGreaterThan(1);
    }
  });

  it('matches each RPC exactly, in both directions', () => {
    // Exact equality rather than a subset each way. A status the SQL can return
    // and the client does not name falls through an exhaustive `switch` and
    // yields `undefined` at runtime; a status the client names and the SQL
    // cannot return is dead code that reads as handling something.
    for (const { rpc, rowType } of RPC_ROW_TYPES) {
      expect(statusesDeclaredBy(rowType), `${rowType} against ${rpc}()`).toEqual(statusesReturnedBy(rpc));
    }
  });

  it('reads the RPC name out of a real call, so an entry cannot describe a function nothing invokes', () => {
    // The stale-entry direction. `RPC_ROW_TYPES` is hand-written; without this
    // it could name a function the client stopped calling and keep asserting
    // about it forever.
    const source = stripComments(readFileSync(clientPath, 'utf8'));
    const called = new Set([...source.matchAll(/\.rpc\(\s*'([a-z_]+)'/gu)].map((match) => match[1]!));
    for (const { rpc } of RPC_ROW_TYPES) {
      expect(called.has(rpc), `${rpc} is declared here but the client no longer calls it`).toBe(true);
    }
  });

  it('covers every RPC the client calls, so a new one cannot arrive unchecked', () => {
    const source = stripComments(readFileSync(clientPath, 'utf8'));
    const called = [...new Set([...source.matchAll(/\.rpc\(\s*'([a-z_]+)'/gu)].map((match) => match[1]!))].sort();
    expect(called).toEqual(RPC_ROW_TYPES.map((entry) => entry.rpc).sort());
  });

  it('declares the row every status returns, expression for expression, in both directions', () => {
    // Non-vacuity first: an empty read here would make the equality below
    // trivially true for a matrix that describes nothing.
    for (const { rpc } of RPC_ROW_TYPES) {
      expect(rowShapesReturnedBy(rpc).length, `no rows read out of ${rpc}`).toBeGreaterThan(1);
      expect(outColumnsOf(rpc).length, `no OUT columns read out of ${rpc}`).toBeGreaterThan(1);
    }

    for (const { rpc } of RPC_ROW_TYPES) {
      const declared = RPC_ROW_SHAPES.filter((shape) => shape.rpc === rpc)
        .map((shape) => ({ status: shape.status, expressions: shape.expressions }))
        .sort((left, right) => left.status.localeCompare(right.status));
      expect(declared, `${rpc}() rows`).toEqual(rowShapesReturnedBy(rpc));
    }
  });

  it('gives every returned expression a column to land in, and every status the same arity', () => {
    // The matrix indexes `nullable` by OUT column name, which is only meaningful
    // while the expression list and the column list line up position for
    // position. `status` is the first OUT column and is never in `expressions`.
    for (const { rpc } of RPC_ROW_TYPES) {
      const columns = outColumnsOf(rpc);
      expect(columns[0], `${rpc}() does not answer with a status first`).toBe('status');
      for (const shape of RPC_ROW_SHAPES.filter((entry) => entry.rpc === rpc)) {
        expect(shape.expressions.length, `${rpc}() '${shape.status}'`).toBe(columns.length - 1);
        for (const column of shape.nullable) {
          expect(columns, `${rpc}() has no column '${column}'`).toContain(column);
        }
      }
    }
  });

  it('declares as nullable every column the SQL hands back a literal NULL for', () => {
    // The half the SQL text settles by itself. `create_prison` writes
    // `null::uuid` into `prison_id` on both refusal statuses, so a matrix that
    // called that column non-nullable would be refuted from here. The other
    // direction -- a column nullable through a variable rather than a literal --
    // is not derivable here and is pinned by pgTAP instead; see this file's
    // header.
    for (const { rpc } of RPC_ROW_TYPES) {
      const columns = outColumnsOf(rpc).slice(1);
      for (const shape of RPC_ROW_SHAPES.filter((entry) => entry.rpc === rpc)) {
        shape.expressions.forEach((expression, index) => {
          if (!/^null::/u.test(expression)) return;
          const column = columns[index]!;
          expect(shape.nullable, `${rpc}() '${shape.status}' returns a literal NULL for ${column}`).toContain(column);
        });
      }
    }
  });

  it('types every column some status can answer NULL as nullable in the row interface', () => {
    for (const { rpc, rowType } of RPC_ROW_TYPES) {
      const nullable = nullableFieldsOf(rowType);
      for (const shape of RPC_ROW_SHAPES.filter((entry) => entry.rpc === rpc)) {
        for (const column of shape.nullable) {
          expect(nullable.has(column), `${rowType}.${column} is NULL on '${shape.status}' but not typed nullable`).toBe(true);
        }
      }
    }
  });

  /**
   * The assertion the vocabulary check could not make, and the one this file was
   * extended for.
   *
   * Which columns a row carries depends on its status, so a client that
   * validates the columns first decides the row is unusable before it has
   * learned which row it is. That is precisely what `uploadVersion` did: a guard
   * rejecting any null `version_id`/`revision`/`checksum` sat above the switch,
   * and the empty prison's `('conflict', NULL, 0, NULL)` never reached the
   * `conflict` branch written to handle it.
   *
   * WHAT THIS DOES NOT CATCH: a validation moved into a helper called before the
   * switch, or a client that reads the columns off some alias other than `row`.
   * It is a source-ordering check, not a proof of reachability -- the behaviour
   * itself is pinned in `tests/unit/persistence-cloud-supabase-client.test.ts`
   * against the row shapes this matrix declares.
   */
  it('dispatches on the status before it inspects any other column of the row', () => {
    for (const { rpc } of RPC_ROW_TYPES) {
      const region = beforeStatusDispatch(rpc);
      expect(region, `${rpc}()'s result is never switched on row.status`).not.toBe('');

      for (const column of outColumnsOf(rpc).slice(1)) {
        expect(
          region.includes(`row.${column}`),
          `${rpc}()'s row is checked for ${column} before its status is read, so a status whose row legitimately omits it cannot reach its branch`,
        ).toBe(false);
      }
    }
  });
});
