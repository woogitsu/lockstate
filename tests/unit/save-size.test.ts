import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLOUD_SAVE_PAYLOAD_BYTE_BOUND, jsonbTextByteLength } from '../../src/shared/save-size';

/**
 * `src/shared/save-size.ts` -- the cloud's measure of a payload, and a copy of
 * the cloud's bound.
 */
describe('the cloud bound a capture trims the route caches against', () => {
  /**
   * ADR 0013 §4 says the number lives in `public.max_save_payload_bytes()` "and
   * nowhere else". `CLOUD_SAVE_PAYLOAD_BYTE_BOUND` is a second copy, read by
   * `captureSessionSnapshot` to decide how much of the route caches a save can
   * afford (ADR 0007's amendment of 2026-09-23), so it must move when that
   * function does.
   */
  it('is the number the migration that enforces it returns', () => {
    const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/20260823100000_bound_free_tier_capacity.sql'), 'utf8');
    const body = /function public\.max_save_payload_bytes\(\)[\s\S]*?as \$\$\s*select\s+(\d+)\s*\$\$/.exec(migration);
    expect(body, 'the migration must still define max_save_payload_bytes() as a single select').not.toBeNull();
    expect(CLOUD_SAVE_PAYLOAD_BYTE_BOUND).toBe(Number(body![1]));
  });
});

/**
 * Every expected length below is a `jsonb::text` rendering **written out by
 * hand**, in the form Postgres 16 prints it (`", "` between members and
 * elements, `": "` after a key), and counted with `Buffer.byteLength` -- never
 * produced by the function under test. On two real payloads the function
 * matched `select octet_length($$...$$::jsonb::text)` run against Postgres
 * 16 to the byte (3,993,118 bytes for the x-large benchmark tier, 141,140 for
 * a 36-prisoner prison with walks and warm caches); CI has no Postgres, so
 * these are what stands in for that check.
 */
describe('a payload is measured the way Postgres prints jsonb', () => {
  const cases: readonly (readonly [string, unknown, string])[] = [
    ['an object with an array', { a: [1, 2], b: 'x' }, '{"a": [1, 2], "b": "x"}'],
    ['commas and colons inside a string are content, not structure', { k: 'x, y: z' }, '{"k": "x, y: z"}'],
    ['empty containers print no separator', { a: {}, b: [], c: [{}] }, '{"a": {}, "b": [], "c": [{}]}'],
    ['an escape is counted as printed', { s: 'a"b\nc\\' }, '{"s": "a\\"b\\nc\\\\"}'],
    ['multi-byte text is counted in UTF-8 bytes', { imię: 'Zażółć' }, '{"imię": "Zażółć"}'],
    ['a member that is undefined is not printed', { a: 1, b: undefined }, '{"a": 1}'],
    ['scalars', [true, null, -3, 1.5], '[true, null, -3, 1.5]'],
  ];
  it.each(cases)('%s', (_name, value, printed) => {
    expect(jsonbTextByteLength(value)).toBe(Buffer.byteLength(printed, 'utf8'));
  });
});
