import { describe, expect, it } from 'vitest';
import { NEED_IDS, NEED_MAX_SCALED } from '../../src/simulation/prisoners/needs';
import { DEFAULT_PRISONER_CAPACITY } from '../../src/simulation/runtime/new-session';

/**
 * The byte figure two documents quote for the mistake the component codec
 * avoids.
 *
 * `src/simulation/runtime/session-systems.ts` and `docs/PERSISTENCE.md` both
 * state what writing the eighteen per-prisoner arrays *at capacity* would cost
 * "in every save regardless of population" — the counterfactual that justifies
 * writing the allocated prefix instead. They disagreed: ~300 KiB and ~240 KiB,
 * both dating from #70, neither sourced (#169).
 *
 * Measuring settled it: the empty-prison figure both sentences make a claim
 * about was right at 240 KiB, and ~300 KiB was a populated prison's figure —
 * which actually measured ~337 KiB — stated as if it were the same case.
 *
 * Both figures then moved, for a real reason rather than a drift: save-schema
 * V4 (#259) stores a need level scaled by `NEED_SCALE`, so the six need arrays
 * carry five-digit values where they carried three. The empty-prison case
 * became 298 KiB and the populated one ~425 KiB.
 *
 * Both moved again with issue #80 (ADR 00XX): `solitarySanctionEndTick` is a
 * nineteenth persisted per-prisoner array (`src/simulation/prisoners/components.ts`),
 * so the array count below moved from eighteen to nineteen and the two
 * figures with it, to 308 KiB and ~435 KiB. This file is what forced both
 * documents to be rewritten in the same change rather than left behind.
 *
 * This pins it. Note what it is and is not: the figure is a **counterfactual**,
 * so it cannot be measured through `encodePrisonerComponents`, which writes the
 * allocated prefix and would emit nothing at all for an empty prison. That is
 * the whole point of the design, and it is also why nothing was pinning the
 * number. So the shape is reconstructed here from the three inputs the sentence
 * depends on — the capacity, the array count, and the defaults — and a change
 * to any of them fails, which is what stops the two sentences drifting again.
 */

/** The nineteen arrays, by the names `EncodedPrisonerComponents` declares. */
const SCALAR_ARRAY_NAMES = [
  'sentenceLengthTicks',
  'priorIncidentsAtIntake',
  'sentenceEndTick',
  'riskTier',
  'classificationGroupIndex',
  'intakeStage',
  'solitarySanctionEndTick',
  'actionIndex',
  'actionPhase',
  'phaseStartedAtTick',
  'needFulfilledLastTick',
  'tileX',
  'tileY',
] as const;

/**
 * The encoded arrays are `readonly number[]`, so the JSON cost is digit widths
 * rather than typed-array element sizes — which is why this measures a real
 * `JSON.stringify` rather than multiplying byte counts.
 */
function encodedByteSizeAtCapacity(slots: number, valueFor: (arrayName: string) => number): number {
  const encoded: Record<string, unknown> = { activeLength: slots };
  for (const name of SCALAR_ARRAY_NAMES) encoded[name] = new Array<number>(slots).fill(valueFor(name));
  const needs: Record<string, readonly number[]> = {};
  for (const needId of NEED_IDS) needs[needId] = new Array<number>(slots).fill(valueFor('needs'));
  encoded.needs = needs;
  return Buffer.byteLength(JSON.stringify(encoded), 'utf8');
}

describe('the capacity-shaped payload figure the documentation quotes', () => {
  it('still has the three inputs the figure is derived from', () => {
    // Each of these appears in the quoted sentences. A change to any one moves
    // the number, and the failure says which.
    expect(DEFAULT_PRISONER_CAPACITY, 'the quoted figure is for 5,000 slots').toBe(5_000);
    expect(SCALAR_ARRAY_NAMES.length + NEED_IDS.length, 'the quoted figure is for nineteen arrays').toBe(19);
    // The *stored* default, not the whole-level one: `encodePrisonerComponents`
    // writes `NeedsComponent.levels` verbatim, so it is this value's digit
    // width that the figure depends on.
    expect(NEED_MAX_SCALED, 'needs default to NEED_MAX_SCALED, and its digit width is part of the figure').toBe(51_000);
  });

  it('measures 308 KiB for an empty prison at capacity, which is the claim both documents make', () => {
    const bytes = encodedByteSizeAtCapacity(DEFAULT_PRISONER_CAPACITY, (name) =>
      name === 'needs' ? NEED_MAX_SCALED : name === 'actionIndex' ? -1 : 0,
    );

    expect(bytes).toBe(315_360);
    expect(Math.round(bytes / 1024), 'both documents say ~308 KiB').toBe(308);
  });

  it('measures more for a populated prison, which is where the ~300 KiB figure came from', () => {
    // Three arrays hold tick stamps, which reach seven digits within a few
    // hundred in-game days at 2,400 ticks each. This is why the two sentences
    // could both look defensible while disagreeing.
    const bytes = encodedByteSizeAtCapacity(DEFAULT_PRISONER_CAPACITY, (name) =>
      name === 'sentenceEndTick' || name === 'phaseStartedAtTick' || name === 'needFulfilledLastTick'
        ? 4_320_000
        : name === 'sentenceLengthTicks'
          ? 720_000
          : name === 'needs'
            ? 17_400
            : name === 'tileX' || name === 'tileY'
              ? 143
              : name === 'solitarySanctionEndTick'
                ? 0
                : 3,
    );

    expect(Math.round(bytes / 1024)).toBe(435);
    // The load-bearing relationship, independent of the exact scenario: the
    // populated case is strictly worse, so quoting it for the empty-prison
    // claim overstates that claim rather than understating it.
    expect(bytes).toBeGreaterThan(315_360);
  });
});
