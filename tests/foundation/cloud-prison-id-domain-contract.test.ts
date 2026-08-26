import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { newPrisonId } from '../../src/ui/save-panel';
import { identifierSchema } from '../../src/simulation/protocol/types';

/**
 * The prison id the game mints is a value the cloud schema will accept.
 *
 * WHY THIS EXISTS. Issue #338: `src/ui/save-panel.ts` minted
 * `prison-${Date.now().toString(36)}` while `prisons.id` is `uuid`, so every
 * cloud-save call raised `22P02 invalid input syntax for type uuid` during
 * argument coercion -- before the `auth.uid()` check, the advisory lock or the
 * capacity trigger. Executed against the schema `pnpm verify:sql` builds:
 *
 *   select * from public.create_prison('prison-mfa1x2y','lockstate-0.0.80',1,'New Prison');
 *   ERROR:  invalid input syntax for type uuid: "prison-mfa1x2y"
 *
 * Every existing gate was green throughout. `pnpm verify:sql` proves the SQL
 * against itself and never sees a TypeScript producer;
 * `tests/foundation/rpc-status-vocabulary-contract.test.ts` checks the RPCs'
 * *return* path and says so explicitly; and
 * `tests/unit/persistence-cloud-supabase-client.test.ts` drives the client with
 * `'prison-1'` through a stand-in that never casts -- so the double accepted
 * exactly the argument the real column rejects. Nothing anywhere compared the
 * producer's output domain to the parameter's declared type.
 *
 * HOW THIS AVOIDS BEING VACUOUS. The two sides come from different places on
 * purpose:
 *
 *   - the **expectation** is read out of `supabase/migrations/` -- the real DDL,
 *     read-only (ADR 0016) -- and not from `crypto.randomUUID`. Deriving it
 *     from the code under test is what let #338 through.
 *   - the **actual** value is drawn from the real producer, `newPrisonId()`,
 *     the only site in `src/` that mints a prison id.
 *
 * and the oracle is shown to discriminate below, so a regex that accepted
 * everything would fail rather than pass.
 */

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsDirectory = join(repositoryRoot, 'supabase', 'migrations');

function migrations(): readonly { readonly name: string; readonly sql: string }[] {
  return readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDirectory, name), 'utf8') }));
}

/**
 * Every place the schema declares a type for "a prison id", discovered rather
 * than hand-listed: a future RPC taking `p_prison_id text` has to fail here
 * instead of being covered by a stale list.
 *
 * Three shapes carry one: the `prisons.id` primary key, any `prison_id`
 * column, and any function parameter named `p_prison_id`. `returns table`
 * output columns are found by the same `prison_id` pattern, which is wanted --
 * `create_prison` hands the id back and that column is a prison id too.
 */
function declaredPrisonIdTypes(): readonly { readonly site: string; readonly type: string }[] {
  const found: { site: string; type: string }[] = [];

  for (const { name, sql } of migrations()) {
    // `create table ... public.prisons ( id <type> primary key ...`
    const prisonsTable = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.prisons\s*\(([\s\S]*?)\n\)/gu;
    for (const match of sql.matchAll(prisonsTable)) {
      const idColumn = /^\s*id\s+([a-z][a-z0-9_ ]*?)\s+primary\s+key/imu.exec(match[1]!);
      if (idColumn !== null) found.push({ site: `${name}: prisons.id`, type: idColumn[1]!.trim() });
    }

    // Any `prison_id <type>` declaration: a column, or a `returns table` field.
    for (const match of sql.matchAll(/^\s*prison_id\s+([a-z][a-z0-9_]*)/gimu)) {
      found.push({ site: `${name}: prison_id`, type: match[1]!.trim() });
    }

    // Any `p_prison_id <type>` function parameter.
    for (const match of sql.matchAll(/^\s*p_prison_id\s+([a-z][a-z0-9_]*)/gimu)) {
      found.push({ site: `${name}: p_prison_id`, type: match[1]!.trim() });
    }
  }

  return found;
}

/**
 * The canonical UUID text form: 32 lowercase hex digits in 8-4-4-4-12 groups.
 *
 * This is deliberately **stricter** than PostgreSQL's `uuid` input, which is a
 * superset -- measured by execution against the schema `pnpm verify:sql` builds
 * (PostgreSQL 16.13), where all four of these are accepted and normalize to the
 * same value:
 *
 *   '9f8c2e14-6b3a-4d5f-9a1b-7c0e2d4f6a8b'    canonical
 *   '9F8C2E14-6B3A-4D5F-9A1B-7C0E2D4F6A8B'    uppercase
 *   '9f8c2e146b3a4d5f9a1b7c0e2d4f6a8b'        unhyphenated
 *   '{9f8c2e14-6b3a-4d5f-9a1b-7c0e2d4f6a8b}'  braced
 *
 * Asserting the subset is the safe direction: anything matching this is
 * guaranteed to be accepted by a `uuid` column, so a pass here cannot be a
 * false negative about the database. It also keeps the id byte-identical to
 * what the column stores, which matters because the local id and the cloud id
 * are deliberately the same value and `.eq('id', prisonId)` compares text the
 * client supplies against a normalized `uuid`.
 */
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe('the cloud prison-id domain, read out of the schema', () => {
  it('declares every prison id as `uuid`, at every site, and finds sites to declare', () => {
    const declarations = declaredPrisonIdTypes();

    // The emptiness guard: a rename or a reformat that stopped this from
    // matching would otherwise leave the test covering nothing and green.
    expect(declarations.length).toBeGreaterThanOrEqual(4);
    expect(declarations.map((entry) => entry.site)).toContain(
      '20260822190100_create_prisons.sql: prisons.id',
    );
    expect(declarations.map((entry) => entry.site)).toContain(
      '20260823100000_bound_free_tier_capacity.sql: p_prison_id',
    );

    // The claim itself. If a migration ever makes a prison id something other
    // than `uuid`, this fails -- and the fix then belongs on the SQL side,
    // which is a supervised action (ADR 0016), not a client change.
    expect([...new Set(declarations.map((entry) => entry.type))]).toEqual(['uuid']);
  });
});

describe('newPrisonId: the only producer of a prison id in src/', () => {
  it('mints ids the `uuid` columns and RPC parameters accept', () => {
    // Many draws, because a generator that is right once and wrong on some
    // values is the failure mode a single sample misses.
    const drawn = Array.from({ length: 512 }, () => newPrisonId());

    for (const id of drawn) expect(id).toMatch(CANONICAL_UUID);

    // Distinct, which the old millisecond-derived scheme was not: two prisons
    // created inside one millisecond collided on a *global* primary key.
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('still satisfies the identifier contract the local save envelope sets', () => {
    // The local format is deliberately wider than `uuid`
    // (`identifierSchema`, src/simulation/protocol/types.ts), so this is the
    // other half: the fix must stay inside the envelope's domain as well as
    // inside the column's. A prison id is written to IndexedDB before any
    // cloud call exists.
    expect(identifierSchema.safeParse(newPrisonId()).success).toBe(true);
  });

  it('refuses the scheme that shipped, so the oracle above is not vacuous', () => {
    // Exactly what `save-panel.ts` minted before #338, and the two literals
    // the issue and the client's own unit tests used. All three are rejected by
    // a real `uuid` column -- verified by execution:
    //   select 'prison-mfa1x2y'::uuid;
    //   ERROR:  invalid input syntax for type uuid: "prison-mfa1x2y"
    const preFix = `prison-${Date.now().toString(36)}`;

    for (const rejected of [preFix, 'prison-mfa1x2y', 'prison-1', 'prison-a', '']) {
      expect(rejected).not.toMatch(CANONICAL_UUID);
    }

    // And the oracle accepts a canonical uuid that did not come from the
    // producer, so it is testing the shape rather than the generator.
    expect('9f8c2e14-6b3a-4d5f-9a1b-7c0e2d4f6a8b').toMatch(CANONICAL_UUID);
  });
});
