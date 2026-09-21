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
 *
 * A FUNCTION MAY BE DEFINED IN MORE THAN ONE MIGRATION, AND THE NEWEST
 * DEFINITION IS THE SCHEMA. `supabase/migrations/` is append-only -- an
 * applied migration is history and is never edited (AGENTS.md, reservation
 * 2) -- so the way to change a function is to add a migration that
 * `create or replace`s it. Every reader in this file therefore resolves a
 * function through `newestDefinitionOf`, which takes the last definition in
 * filename order and ignores the rest. Reading across definitions reads dead
 * SQL as if it were live, and it is not a hypothetical: the three readers
 * here each did it, in three different directions, until 2026-09-21. The
 * rule has its own test at the bottom of this file.
 *
 * ALL THREE READERS WERE WRONG BEFORE THAT FIX, AND TWO OF THE THREE WERE
 * STILL UNPINNED AFTER IT: fixing a reader and demonstrating the fix are not
 * the same repair, because demonstrating it needs a case the real migrations
 * do not provide. `rowShapesReturnedBy` got a real one for free
 * (`submit_challenge_evidence`'s row shapes differ across its three
 * definitions); `statusesReturnedBy` and `outColumnsOf` did not, because
 * nothing in this schema has ever changed a function's status vocabulary or
 * OUT column list, and both are now pinned by synthetic fixtures instead
 * (near the end of this file). A fourth reader added here should assume the
 * same is true of it by default: a real redefinition to demonstrate the
 * newest-wins rule against is the exception, not the norm.
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
 * The newest definition of a PL/pgSQL function, as the slice of SQL running
 * from its `create or replace function` header to the `$$;` that closes its
 * body -- or `null` if no migration defines it.
 *
 * WHY "NEWEST" AND NOT "EVERY". `supabase/migrations/` is append-only: a
 * function is changed by adding a migration that redefines it, never by
 * editing the migration that introduced it. That is what
 * `create or replace function` means, and it is the only shape available --
 * reservation 2 in AGENTS.md forbids editing an applied migration at all. So
 * **a function may be defined in several files, and the last one to apply is
 * the schema.** Every earlier definition is history that no longer runs, and a
 * reader that accumulates across files is reading dead SQL as if it were live.
 *
 * Filename order IS application order: migration names are timestamp-prefixed
 * and `scripts/verify-supabase-sql.mjs:91-94` applies them through
 * `readdirSync(directory).filter(...).sort()`. `readdirSync` alone is not
 * ordered, so the `.sort()` below is load-bearing rather than tidy.
 *
 * WHAT THIS REPLACED, because it was a live defect rather than a tidy-up.
 * The three readers below each walked every `.sql` and each got it wrong in a
 * different direction: `statusesReturnedBy` unioned into a `Set` (so a status
 * a later definition REMOVED stayed in the vocabulary forever),
 * `rowShapesReturnedBy` pushed every match with no dedup (so a redefined
 * function returned each of its rows once per definition), and `outColumnsOf`
 * returned on the FIRST file it matched (so it read the oldest signature).
 * Nothing caught it because the two RPCs in `RPC_ROW_TYPES` happen to be
 * defined exactly once each. `submit_challenge_evidence` has been defined in
 * three migrations since 2026-08-24 and is ungated only because the client
 * does not call it -- see the "reads the newest definition" test below, which
 * uses it as the live evidence that this is not a hypothetical.
 *
 * The header is matched as `create or replace function public.<name>(` rather
 * than `function public.<name>(`, which the previous readers used: the shorter
 * form also matches the `revoke all on function public.<name>(...)` lines
 * every one of these migrations ends with. It happened to be harmless because
 * the definition precedes the revoke in each file; it is not a property worth
 * relying on. `lastIndexOf` within the chosen file, for the same reason the
 * loop keeps the last file.
 *
 * `entries` defaults to `migrationEntries()` (the real `supabase/migrations/`
 * directory) for every production call site, and exists as a parameter for
 * exactly one reason: `supabase/migrations/` is append-only and reservation 2
 * (AGENTS.md) forbids editing it, so it can never host a synthetic pair of
 * definitions whose OUT columns differ -- and without that pair, nothing here
 * can tell "reads the newest definition" apart from "reads the oldest" for a
 * reader whose two candidate answers would otherwise be identical. Before this
 * parameter, `outColumnsOf` below hard-coded the real directory and could not
 * be exercised against anything else; that was itself a finding, not just an
 * inconvenience -- see "reads the newest OUT column list on a synthetic pair"
 * near the end of this file.
 */
function newestDefinitionOf(
  functionName: string,
  entries: readonly MigrationEntry[] = migrationEntries(),
): string | null {
  const header = `create or replace function public.${functionName}(`;
  let newest: string | null = null;

  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    const start = entry.sql.lastIndexOf(header);
    if (start === -1) continue;
    const end = entry.sql.indexOf('$$;', start);
    newest = entry.sql.slice(start, end === -1 ? undefined : end);
  }

  return newest;
}

/** One migration file, named and read, for readers that take a directory as data. */
interface MigrationEntry {
  readonly name: string;
  readonly sql: string;
}

/** Every `.sql` file in `supabase/migrations/`, named and read. */
function migrationEntries(): readonly MigrationEntry[] {
  return readdirSync(migrationsDirectory)
    .filter((entry) => entry.endsWith('.sql'))
    .map((name) => ({ name, sql: readFileSync(join(migrationsDirectory, name), 'utf8') }));
}

/**
 * How many migrations define a function. Used only by the test that pins the
 * newest-definition rule, to keep it from going vacuous if the redefinitions
 * it relies on ever collapse to one.
 */
function definitionCountOf(functionName: string): number {
  const header = `create or replace function public.${functionName}(`;
  let count = 0;

  for (const entry of readdirSync(migrationsDirectory)) {
    if (!entry.endsWith('.sql')) continue;
    if (readFileSync(join(migrationsDirectory, entry), 'utf8').includes(header)) count += 1;
  }

  return count;
}

/**
 * Statuses a PL/pgSQL function can return, read out of its body.
 *
 * Anchored on `return query select '<status>'::text`, which is how every RPC in
 * this schema answers -- the status is always the first selected column and is
 * always a cast literal. A function that answered some other way would produce
 * an empty set here, which the emptiness guard below turns into a failure rather
 * than into a pass.
 *
 * `entries` defaults to the real migrations directory, exactly as
 * `newestDefinitionOf`'s does and for the same reason -- see that function's
 * comment. This is also the reader whose own bug is invisible to every
 * existing test: the "reads the newest definition" probe below calls
 * `rowShapesReturnedBy` and `definitionCountOf` against
 * `submit_challenge_evidence`, never `statusesReturnedBy`, and the two RPCs
 * `statusesReturnedBy` IS checked against (`RPC_ROW_TYPES`) are each defined
 * in exactly one migration, so the newest-vs-oldest branch is never taken for
 * it there either. That is the whole reason this reader's own reimplemented
 * accumulate-across-files bug (see "reads the newest status vocabulary on a
 * synthetic pair" near the end of this file) would pass unnoticed without a
 * fixture -- and unlike `outColumnsOf`'s, it would pass unnoticed even
 * against real, redefined SQL, because every real status change this schema
 * has ever made is an addition; see that test's own comment.
 */
function statusesReturnedBy(functionName: string, entries: readonly MigrationEntry[] = migrationEntries()): readonly string[] {
  // Only the newest definition, and only the body of the named function: a
  // migration may define several, and `create_save_version`'s `'conflict'`
  // must not be read as one of `create_prison`'s answers. The `Set` still
  // dedups within one body; what it must NOT do is carry a status forward
  // from a definition that no longer runs.
  const body = newestDefinitionOf(functionName, entries);
  if (body === null) return [];

  const statuses = new Set<string>();
  for (const match of body.matchAll(/return query\s+select\s+'([a-z_]+)'::text/gu)) {
    statuses.add(match[1]!);
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

/**
 * The `returns table (...)` column names of a PL/pgSQL function, in order.
 *
 * `entries` defaults to the real migrations directory, exactly as
 * `newestDefinitionOf`'s does and for the same reason -- see that function's
 * comment.
 */
function outColumnsOf(functionName: string, entries: readonly MigrationEntry[] = migrationEntries()): readonly string[] {
  // Newest definition only. This one used to `return` on the FIRST file that
  // matched, which is the oldest signature -- the opposite of the rule.
  const definition = newestDefinitionOf(functionName, entries);
  if (definition === null) return [];

  const listStart = definition.indexOf('returns table (');
  if (listStart === -1) return [];
  const listEnd = definition.indexOf(')', listStart);
  const list = definition.slice(listStart + 'returns table ('.length, listEnd).replace(/--[^\n]*/gu, '');
  return list
    .split(',')
    .map((column) => column.trim().split(/\s+/u)[0]!)
    .filter((name) => name !== '');
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
  // Newest definition only. This one used to push every match from every
  // file with no dedup, so a redefined function returned each of its rows
  // once per definition -- three declared shapes against six scanned.
  const body = newestDefinitionOf(functionName);
  if (body === null) return [];

  const shapes: { status: string; expressions: readonly string[] }[] = [];
  for (const match of body.matchAll(/return query\s+select\s+'([a-z_]+)'::text\s*,([^;]+);/gu)) {
    shapes.push({ status: match[1]!, expressions: match[2]!.split(',').map((expression) => expression.trim()) });
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

  /**
   * The readers above read the NEWEST definition of a function, not every
   * definition.
   *
   * WHY THIS NEEDS ITS OWN TEST. `supabase/migrations/` is append-only, so a
   * function is changed by adding a migration that redefines it. Every reader
   * in this file therefore has to pick one definition out of several, and
   * before this test they each picked wrongly in a different direction --
   * unioning statuses across definitions, counting every row shape once per
   * definition, and reading the OLDEST signature. Nothing failed, because the
   * two RPCs in `RPC_ROW_TYPES` are each defined exactly once, so the branch
   * had never been taken.
   *
   * WHY `submit_challenge_evidence` IS THE PROBE, and why the evidence is not
   * hypothetical: it has been defined in THREE migrations since 2026-08-24
   * (`20260823090100_create_challenge_tables.sql`,
   * `20260824100100_harden_submit_challenge_evidence.sql` and
   * `20260824110100_close_challenge_definition_oracle.sql`), and it is outside
   * `RPC_ROW_TYPES` only because `src/persistence/cloud/supabase-client.ts`
   * does not call it -- the `.rpc(...)` cross-check above asserts that the
   * gated set is exactly the set the client calls, so it cannot be added here
   * without a caller and a row type to contract against. It is the one
   * redefined function this repository has, which makes it the only available
   * probe for the rule, and the reason the defect was latent rather than
   * visible.
   *
   * WHAT GOES RED WITHOUT THE FIX. The first definition returns two rows and
   * the later two return three, so an accumulating reader answers with 2+3+3
   * = eight shapes where the live function has three. The count guard below
   * runs first so that this test cannot quietly become vacuous if those
   * redefinitions are ever collapsed into one file.
   */
  it('reads the newest definition of a redefined function, not every definition', () => {
    const probe = 'submit_challenge_evidence';

    // Non-vacuity: the rule is only exercised while some function really is
    // defined more than once.
    expect(definitionCountOf(probe), `${probe} is no longer redefined, so this test proves nothing`).toBeGreaterThan(1);

    // The live definition is 20260824110100's, which answers with exactly
    // these three rows. An accumulating reader returns eight.
    expect(rowShapesReturnedBy(probe)).toEqual([
      { status: 'conflict', expressions: ['null::uuid'] },
      { status: 'duplicate', expressions: ['v_existing_id'] },
      { status: 'submitted', expressions: ['v_submission_id'] },
    ]);

    // Stated separately from the equality above because it is the property
    // that actually broke the gate, and it must hold for the gated RPCs too:
    // one status, one row shape, however many times the function has been
    // rewritten.
    for (const rpc of [probe, ...RPC_ROW_TYPES.map((entry) => entry.rpc)]) {
      const statuses = rowShapesReturnedBy(rpc).map((shape) => shape.status);
      expect(statuses, `${rpc}() returns a status more than once, which is a reader reading a dead definition`).toEqual([
        ...new Set(statuses),
      ]);
    }
  });

  /**
   * `outColumnsOf` alone, on a pair no real migration provides.
   *
   * WHY THIS TEST EXISTS SEPARATELY FROM THE ONE ABOVE. The probe above
   * proves `rowShapesReturnedBy` (and, through `definitionCountOf`, the
   * redefinition itself) picks the newest definition -- it does NOT prove
   * that of `statusesReturnedBy`, which it never calls; see that function's
   * own comment. It does not touch `outColumnsOf` either, because
   * `submit_challenge_evidence`'s three definitions all declare the same
   * `returns table (status text, submission_id uuid)` -- no function in this
   * repository has ever changed its OUT column list, so nothing real
   * distinguishes `outColumnsOf` reading the newest definition from it
   * reading the oldest. Reverting `outColumnsOf` alone to its pre-fix
   * first-match loop leaves the whole of `tests/foundation` green.
   *
   * WHY A FIXTURE RATHER THAN A MIGRATION. `supabase/migrations/` is
   * append-only and reservation 2 (AGENTS.md) is the owner's; manufacturing
   * the difference there is both disallowed and the wrong tool; a migration
   * is schema for a real function, not a test fixture. `newestDefinitionOf`
   * and `outColumnsOf` used to make a fixture impossible outright: both
   * hard-coded `readdirSync(migrationsDirectory)`, so there was no argument
   * through which anything but the real directory could reach them. That was
   * itself the finding, and the fix is the `entries` parameter both
   * functions now take (see `newestDefinitionOf`'s comment) -- a synthetic
   * pair of migration-shaped strings, fed to the *same* `outColumnsOf` every
   * other test in this file calls, with the real directory only as its
   * default argument.
   *
   * The two definitions below differ ONLY in their OUT column list, so first-
   * wins and newest-wins disagree on this pair the way they cannot on any
   * real function today. Filenames sort so the second is newest.
   */
  it("reads the newest OUT column list on a synthetic pair, since no real migration's differs", () => {
    const probe = 'fixture_only_out_columns_differ';
    const entries: readonly MigrationEntry[] = [
      {
        name: '20260101000000_fixture_first.sql',
        sql: `create or replace function public.${probe}()\nreturns table (status text, old_only_column uuid)\nlanguage plpgsql security definer as $$\nbegin\n  return query select 'ok'::text, null::uuid;\nend;\n$$;\n`,
      },
      {
        name: '20260102000000_fixture_second.sql',
        sql: `create or replace function public.${probe}()\nreturns table (status text, new_only_column uuid, extra_column int)\nlanguage plpgsql security definer as $$\nbegin\n  return query select 'ok'::text, null::uuid, 1;\nend;\n$$;\n`,
      },
    ];

    // Non-vacuity: if the two fixture definitions ever stopped disagreeing,
    // this test would pass no matter which one `outColumnsOf` read.
    expect(outColumnsOf(probe, [entries[0]!])).not.toEqual(outColumnsOf(probe, [entries[1]!]));

    expect(outColumnsOf(probe, entries)).toEqual(['status', 'new_only_column', 'extra_column']);
    // Filename order must not matter, only newest-by-name: feeding the pair
    // in reverse must not flip the answer to the first file supplied.
    expect(outColumnsOf(probe, [...entries].reverse())).toEqual(['status', 'new_only_column', 'extra_column']);
  });

  /**
   * `statusesReturnedBy` alone, on a pair no real migration provides.
   *
   * WHY THIS TEST EXISTS SEPARATELY FROM BOTH OF THE OTHER TWO, AND WHY A
   * REAL PROBE CANNOT REPLACE IT even though `submit_challenge_evidence`'s
   * status vocabulary genuinely does change across its migrations (its first
   * definition returns only `'duplicate'` and `'submitted'`; the second adds
   * `'conflict'`, and the third keeps all three). Every one of those changes
   * is an ADDITION. `statusesReturnedBy`'s pre-#1339 bug unioned statuses
   * across every file into a `Set` instead of reading only the newest
   * definition -- and unioning a strictly growing sequence of sets produces
   * the same set the last one alone would. Feeding all three
   * `submit_challenge_evidence` definitions to that accumulating bug would
   * therefore answer `{conflict, duplicate, submitted}`, identical to
   * `newestDefinitionOf`'s answer, so no case this schema has ever produced
   * can distinguish the two directions for this specific reader -- only a
   * status a later definition REMOVES can, and nothing here has done that.
   * (`rowShapesReturnedBy` does not share this blind spot: it keys on
   * `(status, expressions)`, and `'duplicate'`'s expression itself changed
   * from `v_existing` to `v_existing_id` between the first and second
   * definitions, which a per-status accumulator conflates into duplicate
   * entries rather than silently agreeing.)
   *
   * The gap is compounded, not just masked, by nothing calling
   * `statusesReturnedBy(probe)` at all: the "reads the newest definition"
   * test below calls `rowShapesReturnedBy` and `definitionCountOf` against
   * `submit_challenge_evidence`, never `statusesReturnedBy`; and
   * `RPC_ROW_TYPES`, the only place `statusesReturnedBy` is actually invoked,
   * names `create_prison` and `create_save_version`, each defined in exactly
   * one migration -- so the newest-vs-oldest branch inside
   * `statusesReturnedBy` is never taken by anything that calls it either.
   * Reverting `statusesReturnedBy` to its own pre-#1339 accumulate-across-
   * every-file loop (bypassing `newestDefinitionOf` altogether, the same
   * shape the real bug had) leaves the whole of `tests/foundation` green.
   *
   * WHY A FIXTURE RATHER THAN A MIGRATION, and why `entries` is a parameter
   * here too: identical reasoning to `outColumnsOf`'s fixture above --
   * `supabase/migrations/` is append-only and reservation 2 (AGENTS.md) is
   * the owner's, so the difference is manufactured here instead, fed to the
   * same `statusesReturnedBy` every other test in this file calls.
   *
   * The two definitions below share one status and differ in a second, so
   * first-wins and newest-wins disagree on the returned set the way they
   * cannot on any status-vocabulary case this file already exercises for
   * `statusesReturnedBy` specifically (only `rowShapesReturnedBy` gets that
   * exercise, from `submit_challenge_evidence`). Filenames sort so the second
   * is newest.
   */
  it("reads the newest status vocabulary on a synthetic pair, since statusesReturnedBy is never probed against a real redefinition", () => {
    const probe = 'fixture_only_statuses_differ';
    const entries: readonly MigrationEntry[] = [
      {
        name: '20260101000000_fixture_first.sql',
        sql: `create or replace function public.${probe}()\nreturns table (status text)\nlanguage plpgsql security definer as $$\nbegin\n  return query select 'ok'::text;\n  return query select 'old_only_status'::text;\nend;\n$$;\n`,
      },
      {
        name: '20260102000000_fixture_second.sql',
        sql: `create or replace function public.${probe}()\nreturns table (status text)\nlanguage plpgsql security definer as $$\nbegin\n  return query select 'ok'::text;\n  return query select 'new_only_status'::text;\nend;\n$$;\n`,
      },
    ];

    // Non-vacuity: if the two fixture definitions ever stopped disagreeing,
    // this test would pass no matter which one `statusesReturnedBy` read.
    expect(statusesReturnedBy(probe, [entries[0]!])).not.toEqual(statusesReturnedBy(probe, [entries[1]!]));

    expect(statusesReturnedBy(probe, entries)).toEqual(['new_only_status', 'ok']);
    // Filename order must not matter, only newest-by-name: feeding the pair
    // in reverse must not flip the answer to the first file supplied.
    expect(statusesReturnedBy(probe, [...entries].reverse())).toEqual(['new_only_status', 'ok']);
  });

  /**
   * Filename order is application order ONLY because every migration is
   * timestamp-prefixed, and nothing before this test enforced that prefix.
   *
   * `newestDefinitionOf` sorts filenames lexicographically and trusts that
   * order to be chronological -- correct exactly as long as every name starts
   * `YYYYMMDDHHMMSS_`. Nothing enforced that upstream of a lexicographic
   * sort: `abc_foo.sql` sorts after `20260822190000_create_profiles.sql` and
   * before nothing, so it would silently become "newest" by name regardless
   * of when it was actually added, both here and in
   * `scripts/verify-supabase-sql.mjs`, which applies migrations through the
   * identical `readdirSync(...).sort()`. A malformed prefix is therefore not
   * only a risk to this reader; it is a risk to which order migrations
   * actually apply in, so the cost of missing it is larger than this file.
   * One regex over the real directory's filenames, checked once here, is
   * cheap enough that the asymmetry between that cost and this test's size is
   * the whole case for adding it.
   */
  it('names every real migration with the 14-digit timestamp prefix filename order depends on', () => {
    const prefix = /^\d{14}_[a-z0-9_]+\.sql$/u;
    const entries = migrationEntries();
    expect(entries.length, 'no migrations found -- this test proves nothing').toBeGreaterThan(1);

    const malformed = entries.map((entry) => entry.name).filter((name) => !prefix.test(name));
    expect(malformed, 'these migration filenames do not sort chronologically, so filename order is not application order for them').toEqual([]);
  });
});
