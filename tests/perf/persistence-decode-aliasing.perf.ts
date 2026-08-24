import { describe, expect, it } from 'vitest';
import { decodeSaveEnvelope } from '../../src/persistence/save-schema';
import { isJsonValue } from '../../src/shared/json';
import { captureSessionSnapshot } from '../../src/simulation/runtime/restore-session';
import { buildPrisonFixture, PRISON_SIZE_TIERS } from './fixtures/prison-fixture';
import { environmentSummary, formatBytes, formatMs, jsonByteSize, measureSync, renderTable } from './measure';

/**
 * Evidence for one decision: `jsonValueSchema` is `z.custom`, so it validates
 * by predicate and returns its input **by reference** — a decoded envelope's
 * `payload.kernel.commands[].payload` really does alias the caller's object,
 * and `createSaveEnvelope` really does alias the live kernel's queued command
 * payloads (`Kernel.snapshot` shallow-copies each command). #105 offered two
 * fixes: correct the comment that claimed otherwise, or make the schema copy.
 *
 * This file measures what "make the schema copy" costs, so the choice rests
 * on numbers rather than taste. It REPORTS and never asserts a duration
 * (`docs/BENCHMARKING.md`); every `expect` here is a correctness invariant —
 * including the aliasing itself, which is pinned as behaviour in
 * `tests/unit/persistence-save-schema-aliasing.test.ts`.
 *
 * Two scopes are measured, because `jsonValueSchema` is shared:
 *
 *   * **Save payload** — the `queuedCommandSchema.payload` fields inside an
 *     envelope. Copying only these is the cheap, narrow option.
 *   * **Worker protocol payload** — `versionedPayloadSchema.data`, which
 *     carries an entire `SessionSnapshotBundle` on every snapshot and every
 *     restore (`src/simulation/worker/state-machine.ts`,
 *     `src/persistence/session/worker-session-host.ts`). A copy inside
 *     `jsonValueSchema` itself lands here too, on top of the structured clone
 *     `postMessage` already performs.
 *
 * Run it explicitly:
 *
 *   pnpm exec vitest run --config tests/perf/vitest.perf.config.ts
 */

interface Row {
  readonly tier: string;
  readonly payloadBytes: number;
  readonly commandCount: number;
  readonly commandPayloadBytes: number;
  readonly decodeMedian: number;
  readonly copyCommandsMedian: number;
  readonly copyPayloadMedian: number;
  readonly bundleBytes: number;
  readonly validateBundleMedian: number;
  readonly copyBundleMedian: number;
}

describe('decode-path aliasing: what a copying jsonValueSchema would cost', () => {
  it('measures the aliased share of a payload and the cost of copying it', () => {
    const rows: Row[] = [];

    for (const tier of PRISON_SIZE_TIERS) {
      const fixture = buildPrisonFixture(tier);
      const envelope = fixture.envelope;
      const commands = envelope.payload.kernel.commands;
      const commandPayloads = commands.map((command) => command.payload);
      const bundle = captureSessionSnapshot(fixture.runtime);
      const serialized = JSON.parse(JSON.stringify(envelope)) as unknown;

      // Correctness invariants only.
      expect(commands.length).toBe(tier.pendingCommands);
      expect(decodeSaveEnvelope(serialized).ok).toBe(true);

      const samples = Math.max(3, tier.samples);
      rows.push({
        tier: tier.id,
        payloadBytes: jsonByteSize(envelope.payload),
        commandCount: commands.length,
        commandPayloadBytes: jsonByteSize(commandPayloads),
        decodeMedian: measureSync(2, samples, () => {
          decodeSaveEnvelope(serialized);
        }).median,
        copyCommandsMedian: measureSync(2, samples, () => {
          commandPayloads.map((payload) => structuredClone(payload));
        }).median,
        copyPayloadMedian: measureSync(2, samples, () => {
          structuredClone(envelope.payload);
        }).median,
        bundleBytes: jsonByteSize(bundle),
        validateBundleMedian: measureSync(2, samples, () => {
          isJsonValue(bundle);
        }).median,
        copyBundleMedian: measureSync(2, samples, () => {
          structuredClone(bundle);
        }).median,
      });
    }

    console.log(environmentSummary());
    console.log(
      renderTable(
        [
          'tier',
          'payload',
          'cmds',
          'aliased bytes',
          'decode ms',
          'copy cmd payloads ms',
          'copy whole payload ms',
          'protocol bundle',
          'isJsonValue ms',
          'clone bundle ms',
        ],
        rows.map((row) => [
          row.tier,
          formatBytes(row.payloadBytes),
          String(row.commandCount),
          formatBytes(row.commandPayloadBytes),
          formatMs(row.decodeMedian),
          formatMs(row.copyCommandsMedian),
          formatMs(row.copyPayloadMedian),
          formatBytes(row.bundleBytes),
          formatMs(row.validateBundleMedian),
          formatMs(row.copyBundleMedian),
        ]),
      ),
    );
  });
});
