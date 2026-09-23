import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';

/**
 * What an arrival brings with them: how many prior incidents are on their
 * record at admission
 * ([ADR 0124](../../../docs/adr/0124-what-a-prisoner-brings-with-them.md),
 * issue #540).
 *
 * ## What the owner decided, and what is left here
 *
 * The owner ruled on 2026-09-23 that admitted prisoners arrive with a
 * history (`AGENTS.md` entry 25). They then accepted ADR 0124's three
 * recommendations, choosing the option labelled *"60/30/10, równo
 * (zalecane)"* for the distribution. The provenance is the weaker kind, an
 * option label rather than a typed sentence, and ADR 0124's Status block
 * records it. ADR 0017 decision 5 still says where the numbers live: in code,
 * beside their derivation, and open to re-measurement.
 *
 * ## Why the draw is in the worker, and why it is its own stream
 *
 * This is `src/simulation/prisoners/sentence.ts`'s argument, and it holds
 * here for the same reasons.
 *
 * - **Not the main thread.** The seed the simulation is reproducible from
 *   lives in the worker, and ADR 0009 replays a command stream from that
 *   seed.
 * - **At the `classification` stage.** It runs inside `IntakeSystem`'s
 *   ascending-entity-id walk, so the draw order is a function of state.
 * - **Not in the `AdmitPrisoner` handler.** A draw there would advance the
 *   stream in command-dispatch order.
 * - **Its own stream, never `prisoners.classification` or
 *   `prisoners.sentence`.** An extra draw on either would shift every tier or
 *   every sentence that every seed has ever produced.
 */

/** The stream prior incidents are drawn from. Registered by `createNewSimulationRuntime`; `NamedRngStreams.get` throws for a session that did not. */
export const PRISONER_PRIORS_RNG_STREAM = 'prisoners.priors';

/**
 * What a `PrisonerRecordComponent.priorIncidentsAtIntake` slot reads between
 * an admission that named no count and the `classification` stage that draws
 * one (about 10–15 ticks, across `queued` and `reception`).
 *
 * **255, not 0, and the reason is the difference from `SENTENCE_UNSET_TICKS`.**
 * No legal sentence is zero, so 0 can mean "unset" there. A prior count of 0
 * is the most common legal value, so it cannot mean "unset" here.
 *
 * `submitIntake` stores an explicit count as `min(254, v)`, so 255 only
 * ever means "not drawn yet". That changes no behaviour, because both readers
 * saturate at `Math.min(2, …)` (`classifyPrisoner` and
 * `reviewClassification`), and `admitPrisonerSchema` still accepts 255. What
 * changes is that a projected `priorIncidentsAtIntake` reads 254 where a
 * caller sent 255. No screen reads that field (ADR 0124 §4.4).
 */
export const PRIOR_INCIDENTS_UNSET = 255;

/** The largest explicit count a record slot holds, one below the sentinel above. */
export const MAX_RECORDED_PRIOR_INCIDENTS = PRIOR_INCIDENTS_UNSET - 1;

/**
 * The accepted distribution, in whole percent for 0, 1 and 2 prior incidents
 * (ADR 0124 Option A).
 *
 * **The domain is {0, 1, 2} because the score only distinguishes those three
 * values.** Both readers apply `Math.min(2, …)`, so drawing wider would put
 * numbers on the record that nothing reads. A wider domain is waiting on
 * ADR 0124's Q3: a player-facing count, ruled "not now".
 *
 * What it gives, DERIVED by enumerating 77 sentence lengths × 3 screening
 * outcomes (ADR 0124 §5), for tiers 0 / 1 / 2 / 3 at intake: 47.27 / 33.03 /
 * 15.15 / 4.55 %. At `priorIncidents: 0` it was 63.64 / 33.33 / 3.03 / 0.00 %.
 */
export const PRIOR_INCIDENT_WEIGHTS_PERCENT: readonly [number, number, number] = [60, 30, 10];

/**
 * One arrival's prior-incident count, from the stream the caller hands over.
 *
 * **Exactly one `nextInt(100)` per call, including when the answer is 0.** So
 * the stream's position is a function of how many arrivals were drawn for,
 * never of what any of them drew. `nextInt` rejects the unrepresentable
 * tail of the uint32 space, so the three weights are exact rather than very
 * slightly skewed.
 */
export function drawPriorIncidents(rng: Xoshiro128StarStar, weights: readonly [number, number, number] = PRIOR_INCIDENT_WEIGHTS_PERCENT): number {
  const roll = rng.nextInt(100);
  if (roll < weights[0]) return 0;
  if (roll < weights[0] + weights[1]) return 1;
  return 2;
}
