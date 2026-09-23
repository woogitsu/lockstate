/**
 * How big a save payload is, **the way the cloud measures it**, and the bound
 * the cloud applies.
 *
 * ## The bound
 *
 * [ADR 0013](../../docs/adr/0013-free-tier-cloud-save-capacity.md) §4 accepted
 * 4 MiB per stored save version, and enforces it in the database:
 * `save_versions_enforce_size` refuses an insert whose
 * `octet_length(new.payload::text)` exceeds `public.max_save_payload_bytes()`
 * (`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`). ADR 0013
 * says the number lives in that function "and nowhere else". **This is a
 * second copy, and it exists for one reader**: a capture that decides how much
 * of an optional, droppable section a save can afford
 * (`captureSessionSnapshot`, ADR 0007's amendment of 2026-09-23). It moves no
 * bound -- the database still enforces its own -- and
 * `tests/unit/save-size.test.ts` fails if it stops equalling the migration's.
 *
 * ## The measure
 *
 * `payload` is a `jsonb` column, and `jsonb::text` is not `JSON.stringify`:
 * Postgres prints `", "` between members and elements and `": "` after a key.
 * On the x-large benchmark tier that is 3,993,118 bytes against 3,316,461 for
 * the same payload stringified, so a budget computed from `JSON.stringify`
 * would be 20 % too generous. `jsonbTextByteLength` counts the separators the
 * way Postgres prints them. Numbers are counted as JavaScript prints them,
 * which is where it can disagree with Postgres (`1e-7` prints as `0.0000001`
 * from `numeric`); that disagreement is what a caller's margin is for.
 */

/** ADR 0013 §4's per-save bound, mirrored from `public.max_save_payload_bytes()`. */
export const CLOUD_SAVE_PAYLOAD_BYTE_BOUND = 4_194_304;

/**
 * The byte length of `value` as Postgres prints it from a `jsonb` column.
 *
 * `JSON.stringify` it, then add one byte for every `,` and every `:` that is
 * structure rather than string content: those are exactly the places `jsonb`
 * prints a space `JSON.stringify` does not. One native serialisation and one
 * linear scan, which measured about 6x faster than walking the value (283 ms
 * against 47 ms on the x-large benchmark tier, one run each, directional) and matched Postgres 16's own
 * `octet_length(payload::jsonb::text)` to the byte on both payloads it was
 * checked against (3,993,118 and 141,140 bytes).
 */
export function jsonbTextByteLength(value: unknown): number {
  const text = JSON.stringify(value);
  if (text === undefined) return 0;
  let bytes = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (code === 0x5c) {
        // A backslash escape is ASCII both characters long; skip its partner.
        bytes += 2;
        index += 1;
        continue;
      }
      if (code === 0x22) inString = false;
    } else if (code === 0x22) {
      inString = true;
    } else if (code === 0x2c || code === 0x3a) {
      bytes += 1;
    }
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
