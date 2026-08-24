import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../src/services/localization';
import { environmentSummary, formatMs, measureSync, renderTable, summarize } from './measure';

/**
 * Evidence for issue #136: what the formatter cache in
 * `src/services/localization/format.ts` is worth on the HUD's repaint path.
 *
 * It REPORTS and never asserts a duration. `docs/BENCHMARKING.md` forbids a
 * timing threshold until repeated controlled baselines exist, and
 * `docs/TESTING.md` keeps elapsed time out of unit assertions; the only
 * `expect` here is the correctness invariant that both strategies produce
 * byte-identical output, which is what makes the comparison meaningful at all.
 *
 * The guard against the cache silently disappearing is a *count*, not a
 * duration, and it lives in two places that run on every push:
 * `tests/unit/services-localization.test.ts` counts `Intl` constructions
 * through a `Proxy`, and `tests/browser/ui-shell.spec.ts` counts them across a
 * real HUD repaint in a real browser.
 *
 * Run it explicitly:
 *
 *   pnpm exec vitest run --config tests/perf/vitest.perf.config.ts
 */

/**
 * One status-strip repaint, as the shipped strip actually formats it.
 *
 * **Counted, not estimated.** `measureRepaintFormatterCost` in
 * `tests/browser/ui-harness.ts` wraps the HUD's own `HudLocalizer` and reports
 * how many values one `hud.update()` formats: **10** for the harness's
 * populated prison (five metrics, both halves of the occupancy readout, the
 * day, the position in the day and the speed) and **8** for a prison with no
 * capacity, which is the state the shipped app is in until a cell-only total
 * exists (`docs/HUD_PROJECTIONS.md`, section 8). The mix below is that
 * repaint: nine calls with no options and one percent formatter.
 */
const REPAINT_CALLS: readonly (readonly [number, Intl.NumberFormatOptions | undefined])[] = [
  [142, undefined],
  [180, undefined],
  [27, undefined],
  [61, undefined],
  [0, undefined],
  [4, undefined],
  [3, undefined],
  [1, undefined],
  [142, undefined],
  [0.25, { style: 'percent', maximumFractionDigits: 0 }],
];

/** Repaints per measured sample. At the worker's 250 ms clock cadence, 1,000 repaints is a little over four minutes of play. */
const REPAINTS_PER_SAMPLE = 1_000;
const WARMUP = 5;
const SAMPLES = 15;
const LOCALE = 'en';

/** Exactly the line this issue removed, kept here as the "before" arm. */
function formatNumberUncached(locale: string, value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

function repaint(format: (value: number, options?: Intl.NumberFormatOptions) => string): string {
  let out = '';
  for (const [value, options] of REPAINT_CALLS) out += format(value, options);
  return out;
}

describe('localization formatter cache: what one HUD repaint costs (#136)', () => {
  it('measures a repaint with the formatter cached and with it built per call', () => {
    const cached = repaint((value, options) => formatNumber(LOCALE, value, options));
    const uncached = repaint((value, options) => formatNumberUncached(LOCALE, value, options));
    // The comparison only means anything if the two arms render the same
    // strip. This is the file's one assertion, and it is a correctness one.
    expect(cached).toBe(uncached);

    const uncachedStats = measureSync(WARMUP, SAMPLES, () => {
      for (let index = 0; index < REPAINTS_PER_SAMPLE; index += 1) {
        repaint((value, options) => formatNumberUncached(LOCALE, value, options));
      }
    });

    const cachedStats = measureSync(WARMUP, SAMPLES, () => {
      for (let index = 0; index < REPAINTS_PER_SAMPLE; index += 1) {
        repaint((value, options) => formatNumber(LOCALE, value, options));
      }
    });

    const perRepaint = (median: number): number => median / REPAINTS_PER_SAMPLE;
    const perCall = (median: number): number => median / (REPAINTS_PER_SAMPLE * REPAINT_CALLS.length);

    const rows = [
      ['built per call (before)', uncachedStats, uncachedStats.median],
      ['cached per (locale, options)', cachedStats, cachedStats.median],
    ] as const;

    console.log(
      [
        '',
        `environment: ${environmentSummary()}`,
        `${REPAINT_CALLS.length} formatNumber calls per repaint, ${REPAINTS_PER_SAMPLE} repaints per sample, ${SAMPLES} samples after ${WARMUP} warmups`,
        '',
        renderTable(
          ['strategy', 'median ms/sample', 'p95 ms/sample', 'us/repaint', 'us/call'],
          rows.map(([label, stats, median]) => [
            label,
            formatMs(median),
            formatMs(stats.p95),
            (perRepaint(median) * 1_000).toFixed(2),
            (perCall(median) * 1_000).toFixed(3),
          ]),
        ),
        '',
        `median ratio: ${(uncachedStats.median / cachedStats.median).toFixed(1)}x`,
        `saved per repaint: ${((perRepaint(uncachedStats.median) - perRepaint(cachedStats.median)) * 1_000).toFixed(2)} us`,
        `saved per second at the worker's 250 ms clock cadence (4 repaints): ${(
          (perRepaint(uncachedStats.median) - perRepaint(cachedStats.median)) *
          4 *
          1_000
        ).toFixed(2)} us`,
        '',
        `share of one 60 Hz display frame (16.67 ms), before: ${((perRepaint(uncachedStats.median) / (1_000 / 60)) * 100).toFixed(2)} %`,
        `share of one 60 Hz display frame (16.67 ms), after:  ${((perRepaint(cachedStats.median) / (1_000 / 60)) * 100).toFixed(2)} %`,
        '',
        'Interpretation: this is measurable allocation churn, not a visible',
        'frame drop. Both figures are a fraction of one display frame, so a',
        'repaint was never dropping one -- the defect is that a hot path',
        '`docs/ARCHITECTURE.md` documents as allocation-cheap was not, and its',
        'cost grows with every value the HUD gains and every repaint it does.',
        '',
        'Variance is high on this machine: the p95 column is well above the',
        'median for both arms. The medians are the comparable figures, and the',
        'raw samples are retained rather than trimmed.',
        '',
      ].join('\n'),
    );

    // Reported, never asserted: the summary is recomputed here only so the raw
    // samples are retained in the log rather than reduced to one number.
    expect(summarize(cachedStats.raw).samples).toBe(SAMPLES);
  });
});
