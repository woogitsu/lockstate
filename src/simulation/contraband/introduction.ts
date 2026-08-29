import type { Xoshiro128StarStar } from '../rng/xoshiro128starstar';
import type { ContrabandRegistry } from './item';

/**
 * How contraband gets into the prison
 * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)).
 *
 * ## What this is not
 *
 * It is **not** a starting inventory. `createNewSimulationRuntime` builds an
 * empty `ContrabandRegistry` and this module does not change that: a session
 * that admits nobody holds no contraband for ever, exactly as it did before.
 * Every item that exists was brought in by one arrival the player chose to
 * admit, its `provenance.sourceId` names that arrival, and the draw that
 * decided it is a function of the classification record the player's own
 * `AdmitPrisoner` figures produced. That is the difference the "no fabricated
 * default content" convention in `new-session.ts` is about -- content the code
 * invents at session start, versus a consequence of a command.
 *
 * ## Why the arrival, and not the delivery
 *
 * Issue #27 names four routes -- "deliveries, visits, staff/prisoner actions
 * and room/object sources" -- and the substrate anticipates the delivery one
 * most concretely: `SearchScope` declares `'delivery'`, `ContrabandHolderKind`
 * declares `'container'`, and `new-session.ts` keeps a
 * `searchContainerLocations` map for exactly that scope. It is nonetheless the
 * one route that cannot be built today, and the reason is written down in the
 * module that would have to supply it: `ProcurementSystem`'s own header records
 * that `room.delivery-bay` and `object.loading-dock-door` "are declared content
 * that no session instantiates (#141), so there is no bay to deliver to", and
 * that a delivery therefore "lands directly in the container construction draws
 * from". A container with no location cannot be searched --
 * `locateSearchTarget` throws for one -- so contraband introduced on that route
 * would be unreachable by the very system built to find it.
 *
 * A prisoner has a position, `locateSearchTarget` already resolves a
 * `'prisoner'` target from it, and `buildDisciplinaryIndex` already knows what
 * a confiscation found on a prisoner costs them. Nothing has to be invented for
 * this route; the delivery route needs a room first.
 *
 * ## Determinism
 *
 * Two draws from one caller-supplied named stream, in a fixed order: whether,
 * then which. The stream is `contraband.introduction`
 * (`CONTRABAND_INTRODUCTION_RNG_STREAM`), separate from
 * `contraband.detection` and `contraband.intelligence` so that admitting a
 * prisoner cannot shift what a search finds -- issue #27's "one subsystem's
 * draws cannot perturb another". The eligible-category list is derived from the
 * catalogue by an explicit sort, never `Map` order.
 */

/** The authored facts about a contraband category this module reads. Structural, so it needs no import of the catalogue's Zod type. */
export interface ContrabandCategoryView {
  readonly id: string;
  /** 0-10, `contrabandCategoryDefinitionSchema.severity`. Orders the catalogue from "petty" to "dangerous". */
  readonly severity: number;
}

export interface ContrabandIntroductionPolicy {
  /** Chance a risk-tier-0 arrival is concealing something. */
  readonly baseProbability: number;
  /** Added to that chance per point of `RiskTier`. */
  readonly probabilityPerRiskTier: number;
  /** How many of the least-severe catalogue entries a risk-tier-0 arrival may bring. */
  readonly categoriesAtTierZero: number;
  /** Added to that count per point of `RiskTier`. */
  readonly categoriesPerRiskTier: number;
}

/**
 * Directional defaults, not a committed balance decision -- the standing
 * `DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_INCIDENT_RESPONSE_POLICY` both
 * carry, and issue #27 puts "final balance of detection probabilities" out of
 * scope explicitly.
 *
 * The shape they express is the whole of the content decision, and it is one
 * sentence: **who the player admits decides both how often something comes in
 * and how bad it is** -- a minimal-risk arrival one time in ten and only
 * something petty, a high-risk one four times as often and from the whole
 * catalogue.
 *
 * **These started at 0.25 and 0.15 and were measured down**, which is worth
 * recording because the measurement is the argument. At the higher pair, three
 * of every eight arrivals were carrying, and contraband stopped being an event:
 * it became a property of the population, present in every prison in the
 * repository, and it perturbed nine test fixtures that are about something else
 * -- including one measuring shower fairness under contention and one measuring
 * what a reclassification reads like on the roster. A mechanic that fires
 * everywhere is as uninformative as one that fires nowhere (the shape
 * `incident-trigger-reachability.test.ts` names about producers), and the
 * numbers below make a contraband find an occasional thing a prison deals with
 * rather than its ambient condition.
 *
 * `RiskTier` is produced by `classifyPrisoner` from the `sentenceLengthTicks`
 * and `priorIncidents` the `AdmitPrisoner` command carries, and is revised
 * afterwards by `ClassificationReviewSystem`.
 *
 * **This used to end *"-- so this reads a number the player influences twice
 * over rather than a dice roll in a costume."* That is false, and it is false
 * three times over.** Recorded rather than deleted, because the sentence
 * describes what this policy is *for*, and the gap between that intent and the
 * shipped game is the thing worth knowing:
 *
 *  1. **The player influences neither input.** `src/main.ts` is
 *     `const ADMISSION_REQUEST = { priorIncidents: 0 } as const` -- pinned, and
 *     held deliberately -- and since ADR 0069 the sentence is no longer sent
 *     from there at all: it is *drawn inside the worker* from the
 *     `prisoners.sentence` stream. Neither number is a player decision.
 *  2. **The revision is a phase lottery, and for most sentences it is
 *     impossible.** `ClassificationReviewSystem` is globally phased at
 *     `intervalTicks - 1`, so it runs at every tick congruent to 23,999 modulo
 *     24,000; eligibility is per prisoner, `tick - classifiedAt >= 24,000`,
 *     where `classifiedAt` is derived from that prisoner's own record. So a
 *     prisoner classified at `c` with sentence `s` is reviewed only if a
 *     scheduled tick falls in `[c + 24,000, c + s]` -- a window of `s - 24,000`
 *     ticks, and empty unless `s >= 24,000`.
 *
 *     `MIN_SENTENCE_DAYS` is 2 and `MAX_SENTENCE_DAYS` is 16, so the drawable
 *     lengths are 4,800..38,400 in steps of `DAY_LENGTH_TICKS` (2,400).
 *     **Eight of those fifteen -- 2 through 9 days -- are below 24,000 and can
 *     never be reviewed at all**, whatever the phase. The other seven have a
 *     window of 0 to 14,400 ticks and are reviewed only if the global schedule
 *     happens to land inside it; at 10 days exactly the window is a single
 *     tick.
 *
 *     **This paragraph said "the revision never happens" and that was wrong.**
 *     It was true of the session's *first* prisoner -- classified near tick 0,
 *     where the first eligible scheduled tick is 47,999 against a maximum
 *     discharge at 38,400 -- and was generalised from that one case to every
 *     prisoner. A prisoner classified at 20,000 with a 16-day sentence is
 *     eligible at the 47,999 review and is discharged at about 58,400, so they
 *     *are* reviewed. Corrected rather than deleted because the arithmetic that
 *     produced the wrong answer is the arithmetic worth checking next time: a
 *     schedule is global and eligibility is per record, and the two only
 *     coincide for whoever arrives first.
 *  3. **The sentence cannot move the tier even if it were chosen.**
 *     `classifyPrisoner` reads it as
 *     `sentenceLengthTicks >= LONG_SENTENCE_THRESHOLD_TICKS ? 1 : 0` with the
 *     threshold at **200,000**, which is 5.2x the largest sentence the shipped
 *     range can draw. That term is always 0.
 *
 * So `riskTier` is, today, exactly the dice roll this sentence said it was not:
 * reachable tiers are `[0, 1]` and which one a prisoner gets is the draw alone.
 * The policy below is still the right shape for the game this comment describes
 * -- it is the reading of the *present tense* that was wrong.
 */
export const DEFAULT_CONTRABAND_INTRODUCTION_POLICY: ContrabandIntroductionPolicy = {
  baseProbability: 0.1,
  probabilityPerRiskTier: 0.1,
  categoriesAtTierZero: 2,
  categoriesPerRiskTier: 1,
};

/**
 * The catalogue in ascending severity, ties broken by id.
 *
 * Exported because it is the ordering the eligibility band below is a prefix
 * of, and a caller that wants to know what a tier can bring should read the
 * same list rather than re-sorting one of its own.
 */
export function contrabandCategoriesBySeverity(
  categories: readonly ContrabandCategoryView[],
): readonly ContrabandCategoryView[] {
  return [...categories].sort((left, right) =>
    left.severity !== right.severity ? left.severity - right.severity : left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

/**
 * The categories an arrival of this tier could be concealing: the
 * `categoriesAtTierZero + categoriesPerRiskTier * riskTier` least severe, in
 * the order above.
 *
 * A prefix of an authored ordering rather than a second weight table, so
 * adding a category to `contraband-catalog.ts` places it by its own `severity`
 * and nothing here has to be edited. On the shipped catalogue that is:
 * tier 0 -- currency, phone; tier 1 -- and a tool; tier 2 -- and drugs;
 * tier 3 -- and a weapon. Only the arrival the player classified as high risk
 * can bring a weapon in, and that is the point of reading the tier at all.
 */
export function eligibleContrabandCategories(
  categories: readonly ContrabandCategoryView[],
  riskTier: number,
  policy: ContrabandIntroductionPolicy = DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
): readonly ContrabandCategoryView[] {
  const ordered = contrabandCategoriesBySeverity(categories);
  const allowed = policy.categoriesAtTierZero + policy.categoriesPerRiskTier * Math.max(0, riskTier);
  return ordered.slice(0, Math.max(0, Math.min(ordered.length, allowed)));
}

/** Chance an arrival of this tier is concealing something, clamped to [0,1]. Pure; the caller owns the draw. */
export function contrabandIntroductionProbability(
  riskTier: number,
  policy: ContrabandIntroductionPolicy = DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
): number {
  return Math.max(0, Math.min(1, policy.baseProbability + policy.probabilityPerRiskTier * Math.max(0, riskTier)));
}

/**
 * What one arrival brought in, or `undefined` for an arrival carrying nothing.
 *
 * The id is **derived, not allocated** ([ADR 0012](../../../docs/adr/0012-derived-identifier-reproducibility.md)
 * category 2): `contraband.intake.<entityId>.<tick>` is a function of state the
 * save already carries, so nothing here adds a counter to the payload and a
 * restored session mints exactly what a continuous one did. It is unique
 * because an entity passes the classification stage once and a tick happens
 * once -- and `EntityId` carries its generation, so a recycled slot is a
 * different id rather than a collision.
 */
export interface IntroducedContraband {
  readonly itemId: string;
  readonly categoryId: string;
}

/**
 * One arrival's introduction check, at the moment their classification is
 * written.
 *
 * Draws **exactly twice, unconditionally the first time and only on success
 * the second**, so a session's stream position is a function of how many
 * prisoners have been classified and what they were classified as -- never of
 * anything a later system did.
 */
export function introduceContrabandOnIntake(
  contraband: ContrabandRegistry,
  categories: readonly ContrabandCategoryView[],
  entityId: number,
  riskTier: number,
  tick: number,
  rng: Xoshiro128StarStar,
  policy: ContrabandIntroductionPolicy = DEFAULT_CONTRABAND_INTRODUCTION_POLICY,
): IntroducedContraband | undefined {
  if (rng.nextFloat() >= contrabandIntroductionProbability(riskTier, policy)) return undefined;

  const eligible = eligibleContrabandCategories(categories, riskTier, policy);
  if (eligible.length === 0) return undefined;
  const category = eligible[rng.nextInt(eligible.length)]!;

  const itemId = `contraband.intake.${String(entityId)}.${String(tick)}`;
  const holderId = String(entityId);
  contraband.introduce(
    itemId,
    category.id,
    { kind: 'prisoner', id: holderId },
    { sourceType: 'prisoner', sourceId: holderId, introducedAtTick: tick },
  );
  return { itemId, categoryId: category.id };
}
