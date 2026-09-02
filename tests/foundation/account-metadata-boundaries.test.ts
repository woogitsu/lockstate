import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../helpers/production-reachability';
import { BASE_SAVE_SLOTS, MAX_TOTAL_SAVE_SLOTS } from '../../src/services/entitlements/products';
import { createSaveEnvelope, decodeSaveEnvelope, type SaveEnvelope } from '../../src/persistence/save-schema';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { SparseWorld } from '../../src/simulation/world/sparse-world';
import { ConstructionSystem } from '../../src/simulation/construction/system';
import { chunkCoordinate } from '../../src/simulation/world/coordinates';

/**
 * Two rules #34 states about account metadata, held where they can actually
 * fail: the save-slot policy lives in one place, and no account credential
 * ever reaches a prison snapshot.
 */

const CAPACITY_MIGRATION = join('supabase', 'migrations', '20260823100000_bound_free_tier_capacity.sql');

/**
 * Reads an `immutable` one-line SQL constant function's literal.
 *
 * These are deliberately one-liners so that "changing a figure is a
 * `create or replace` of a single one-line function" (the migration's own
 * words), which is exactly what makes them readable from here.
 */
function sqlConstant(sql: string, functionName: string): number | undefined {
  const pattern = new RegExp(
    `create or replace function public\\.${functionName}\\(\\)[\\s\\S]*?as \\$\\$ select (\\d+) \\$\\$;`,
  );
  const match = pattern.exec(sql);
  return match?.[1] === undefined ? undefined : Number.parseInt(match[1], 10);
}

describe('the save-slot policy the client shows is the one the database enforces (#34, ADR 0013)', () => {
  /**
   * `src/services/entitlements/products.ts:14` says of `BASE_SAVE_SLOTS`
   * (this read `:16` from the day it was written and the file has not moved
   * since -- the quoted sentence opens on line 14 and the declaration is on
   * line 24; corrected 2026-09-02, and quote rather than count if the file
   * grows):
   * *"MIRRORED IN SQL, and the SQL is the authoritative copy… Changing either
   * value here without changing it there makes the client's arithmetic
   * disagree with the server's, which surfaces as a slot that looks available
   * and is not."*
   *
   * **Nothing held that.** Both halves were reviewed by inspection and neither
   * could see the other. `enforce_prison_slot_capacity` is what actually
   * refuses a sixth prison, with SQLSTATE LS001; the constant in TypeScript
   * only decides what the player is told beforehand, and the failure mode of
   * a disagreement is a "New prison" button that works right up until the
   * server says no.
   */
  const sql = readFileSync(join(repositoryRoot, CAPACITY_MIGRATION), 'utf8');
  const base = sqlConstant(sql, 'base_save_slot_capacity');
  const ceiling = sqlConstant(sql, 'max_save_slot_capacity');

  it('finds both figures in the migration, so a rename cannot make this gate vacuous', () => {
    expect(base, `base_save_slot_capacity() not found in ${CAPACITY_MIGRATION}`).toBeTypeOf('number');
    expect(ceiling, `max_save_slot_capacity() not found in ${CAPACITY_MIGRATION}`).toBeTypeOf('number');
    // Two different functions, so a pattern that matched the same one twice
    // could not pass both assertions below by accident.
    expect(base).not.toBe(ceiling);
  });

  it('agrees with the free tier the database grants', () => {
    expect(base, 'public.base_save_slot_capacity() and BASE_SAVE_SLOTS disagree; the SQL is the authoritative copy').toBe(
      BASE_SAVE_SLOTS,
    );
  });

  it('agrees with the ceiling the database clamps every computed capacity to', () => {
    expect(
      ceiling,
      'public.max_save_slot_capacity() and MAX_TOTAL_SAVE_SLOTS disagree; the SQL is the authoritative copy',
    ).toBe(MAX_TOTAL_SAVE_SLOTS);
  });
});

function buildEnvelope(): SaveEnvelope {
  const world = new SparseWorld(32);
  world.setOwned({ x: chunkCoordinate(0), y: chunkCoordinate(0) }, true);
  const construction = new ConstructionSystem(world);
  const kernel = new Kernel(1, 0);
  return createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: 'a3f1c2d4-0000-4000-8000-0000000000aa',
    revision: 1,
    createdAt: 0,
    updatedAt: 1,
    kernel: kernel.snapshot(),
    world: world.snapshot(),
    construction: construction.snapshot(),
  });
}

describe('a prison snapshot can never carry account or session credentials (#34, out of scope)', () => {
  const envelope = buildEnvelope();

  it('accepts the envelope as written, so the refusals below are about what was added', () => {
    expect(decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)))).toMatchObject({ ok: true });
  });

  it('refuses an envelope with account identity bolted onto it', () => {
    const tampered = { ...JSON.parse(JSON.stringify(envelope)), account: { accountId: 'a', accessToken: 'ey.aaa.bbb' } };
    expect(decodeSaveEnvelope(tampered)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('refuses an envelope with account identity hidden inside the payload, as a shape and not only as a checksum', () => {
    // The place it would actually end up: the payload is what a session
    // capture composes. `payload.identity` is *actor* identity -- the prisoner
    // and staff names of ADR 0015 -- and is not an exception to this.
    //
    // The **code** is asserted, not merely the refusal, because two
    // independent mechanisms refuse this and only one of them is a rule about
    // account data. `savePayloadV5Schema` is `.strict()`, which answers
    // `invalid-shape`; the checksum would also fail, because any added key
    // changes the canonical JSON, and would answer `checksum-mismatch`.
    // Asserting only `ok: false` passed with strictness removed -- measured --
    // so it held the checksum and not the schema.
    const copy = JSON.parse(JSON.stringify(envelope)) as { payload: Record<string, unknown> };
    copy.payload = { ...copy.payload, account: { accountId: 'a', refreshToken: 'r' } };
    expect(decodeSaveEnvelope(copy)).toMatchObject({ ok: false, error: { code: 'invalid-shape' } });
  });

  it('names no credential-shaped field anywhere in the account modules themselves', () => {
    // The schemas above refuse a credential that reaches a save. This refuses
    // one existing in the layer that would have had to put it there: nothing
    // under src/ui/account/ may declare a token field at all.
    for (const module of ['account-session.ts', 'account-preferences.ts', 'save-list-projection.ts', 'cloud-slot-availability.ts']) {
      const source = readFileSync(join(repositoryRoot, 'src', 'ui', 'account', module), 'utf8');
      // Declarations only -- `accessToken:` or `readonly refreshToken:` --
      // never prose, so the comments that explain the rule do not trip it.
      expect(source, `${module} declares a credential field`).not.toMatch(
        /(?:readonly\s+)?(?:access|refresh|id)Token\s*[?:]/i,
      );
      expect(source, `${module} declares a password or secret field`).not.toMatch(
        /(?:readonly\s+)?(?:password|secret|apiKey|serviceRoleKey)\s*[?:]/i,
      );
    }
  });
});
