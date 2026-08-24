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
});
