import type { EntityId } from '../entity/entity-store';
import { CLASSIFICATION_GROUP_IDS } from '../prisoners/components';
import type { GangRegistry } from './gangs';
import type { IncidentRecord } from './incident';

/**
 * What a gang is in a prison a player can start, who joins one, and what
 * writes a grudge -- [ADR 0103](../../../docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md)
 * decisions 1, 2 and 6, in the one module that owns the rule.
 *
 * **Here rather than in `new-session.ts`**, for the reason
 * `src/simulation/contraband/introduction.ts` is not in the composition root
 * either: deciding *which* prisoners are in a gang is a content rule, and
 * `new-session.ts` is the wiring. The composition root supplies the registry
 * and the sector; this file supplies the rule.
 *
 * **Nothing here draws a random number.** ADR 0103 Context 10 measured that no
 * file under `src/simulation/incidents/` reads an RNG stream and decision 5
 * keeps it that way, so membership alternates on a recorded input -- the
 * arrival's entity id -- rather than on a seventh named stream and the
 * save-compatibility question `src/simulation/runtime/new-session.ts:476-481`
 * sets out for one.
 *
 * **No gang id reaches a player.** ADR 0103 Context 7 read the alert row and
 * found `'hud.alert.event.incidents.gang-retaliation-opened'` takes no
 * parameters at all, and `src/content/simulation-message-keys.ts` excludes
 * runtime-registered ids from the census by name -- so `GangDefinition` needs
 * no `nameKey` (decision 1) and the two ids below are machine names in the
 * shape `docs/CONTENT.md` uses for catalogue ids, exactly as
 * `DEFAULT_SECURITY_SECTOR_ID` is.
 */

/**
 * The two gangs every prison gets, both claiming the one watched sector.
 *
 * **Two, not one and not three** (ADR 0103 decision 1). One gang can hold no
 * grudge -- `GangRegistry.addGrudge` throws on a self-grudge -- and with a
 * single sector every pair of claimants contests the same ground on identical
 * terms, so a third multiplies the pairs without producing a new *kind* of
 * situation while tripling the chance a release empties one of them.
 *
 * **Deliberately not directional or thematic names.** Both claim the same
 * sector, so `north`/`south` would assert a geography the model does not have,
 * and no id is ever said to a player. Sorted order is the registration order
 * because `GangRegistry.all()` sorts by id.
 */
export const DEFAULT_GANG_IDS = ['gang.alpha', 'gang.beta'] as const;

/**
 * The classification group that joins a gang (ADR 0103 decision 6).
 *
 * Typed against `CLASSIFICATION_GROUP_IDS` rather than written as a bare
 * string, so a rename of the group is a type error here instead of a rule that
 * silently stops matching anybody. `classificationGroupIdForTier` maps tier 3
 * and only tier 3 onto it.
 */
const HIGH_RISK_GROUP_ID: (typeof CLASSIFICATION_GROUP_IDS)[number] = 'high-risk';

/**
 * Seeds the two gangs onto the sector the prison already watches.
 *
 * **Idempotent and payload-wins**, which is the whole reason it is a function
 * called from two places rather than two `register` calls in the composition
 * root: `applyDefaultSecuritySector` and `applyDefaultSearchPolicies` are the
 * two precedents, and both are re-applied *after* a restore has overwritten
 * the collection they fill. `GangRegistry.loadSnapshot` clears every
 * definition, so a save written before this change -- which is every save that
 * exists -- restores a prison with no gangs at all unless this runs again
 * afterwards. Honouring that absence with the derived value rather than a
 * throw is ADR 0038 §1, and it is why this needs **no save-schema bump and no
 * migration**: the registry's four collections are already persisted
 * (`src/persistence/save-schema.ts:971-977`) and no field is added to the
 * `.strict()` definition schema.
 *
 * A save that already carries a gang under one of these ids keeps its own
 * definition, territory included.
 */
export function applyDefaultGangs(gangs: GangRegistry, sectorId: string): void {
  for (const gangId of DEFAULT_GANG_IDS) {
    if (gangs.getDefinition(gangId) !== undefined) continue;
    gangs.register({ id: gangId, territorySectorIds: [sectorId] });
  }
}

/**
 * Which gang an arrival joins, or `undefined` for the ones that join none --
 * ADR 0103 decision 6, evaluated at intake.
 *
 * `high-risk` arrivals join; everybody else joins nothing. Which of the two is
 * chosen alternates on the arrival's entity id, which is recorded input, so
 * this needs no draw and no stream.
 *
 * **OPEN QUESTION 5 IS WHAT THIS DOES NOT ANSWER, AND IT IS THE ONE AN
 * IMPLEMENTER HITS FIRST.** ADR 0103 decision 6 says *"at intake"* and its own
 * Context 15 shows the population that actually becomes `high-risk` becomes so
 * at `ClassificationReviewSystem`'s review, long after intake -- so a prison
 * whose arrivals all come in at `priorIncidents: 0` assigns nobody here.
 * Measured on this tree rather than reasoned: in
 * `tests/integration/assault-sanction-loop.test.ts`'s prison, entities 2 and 7
 * are tier 1 at intake, are raised to tier 2 by
 * `ClassificationEarlyWarningSystem` after the first assault, and first reach
 * tier 3 at the review on tick 47,999. Assigning membership at the review site
 * as well is the obvious repair and it is a second write site with its own
 * determinism question, which is exactly what Open Question 5 asks the owner
 * and is therefore **not** decided here.
 *
 * **ANSWERED BY THE OWNER ON 2026-09-09: at the review site as well.** The
 * paragraph above is kept rather than rewritten, because it is the reading
 * that put the question and a reader should see what was asked.
 * `ClassificationReviewSystem` now takes this same port, so this function is
 * called from two sites and **the sentence "a prison whose arrivals all come
 * in at `priorIncidents: 0` assigns nobody here" is still true of *here* and
 * no longer true of the prison** — those arrivals become members at their
 * first `high-risk` review instead. Sharper than the paragraph above put it:
 * `priorIncidents: 0` is not merely the common case, it is the **only** value
 * the game's one admission surface can send (`src/main.ts`'s
 * `ADMISSION_REQUEST`, a held decision), so nothing reached this rule through
 * intake in play at all.
 *
 * **Calling it twice for one entity is safe by construction**, which is what
 * makes two sites cheap: the answer is a pure function of `entityId`, so both
 * sites compute the same gang, and `GangRegistry.addMember` moves-or-sets.
 * `tests/integration/gang-membership-at-review.test.ts` measures the whole
 * path from an admission a player can actually make.
 */
export function defaultGangIdForArrival(entityId: EntityId, classificationGroupId: string): string | undefined {
  if (classificationGroupId !== HIGH_RISK_GROUP_ID) return undefined;
  return DEFAULT_GANG_IDS[entityId % DEFAULT_GANG_IDS.length]!;
}

/**
 * What one cross-gang assault is worth (ADR 0103 decision 2.5).
 *
 * From the arithmetic in ADR 0103 Context 3: `resolveRetaliationRisk` returns
 * `grudge * 1.5` on contested ground and the trigger's default threshold is
 * `0.6`, so a retaliation needs `grudge >= 0.4` -- which makes `0.4` "every
 * cross-gang assault", `0.2` "every second" and `0.15` "every third". A
 * directional default in the same sense `retaliationThreshold` calls itself
 * one, and **Open Question 6 is the one number a balance pass would move
 * first**; it is not settled by anything the owner ruled.
 *
 * **THE LAST CLAUSE ABOVE IS NOW FALSE AND IS KEPT SO A READER SEES WHICH
 * SENTENCE MOVED. Open Question 6 was ruled by the owner on 2026-09-11: this
 * constant is 0.4.** It was put to them because open question 2's own answer
 * changed what this number buys, and nobody had said so when they answered
 * it. Halving every write means each directional key accrues `weight / 2` per
 * assault, so at 0.2 a retaliation needed **four** cross-gang assaults where
 * it had needed two -- measured through the real kernel, first retaliation
 * moving from tick 7,000 to tick 11,800 on the same seed. The arithmetic
 * above says why: the threshold is on ONE key's grudge, and it is the
 * per-key rate that halving moves.
 *
 * **At 0.4 each key accrues 0.2 an assault, which is what a key accrued
 * before the ruling**, so the first retaliation returns to every second
 * cross-gang assault. The owner was told, before choosing, that this is NOT
 * a clean restoration of the prior behaviour and the difference was named:
 * total ledger movement per assault doubles (0.4 spread over two keys rather
 * than 0.2 on one), and because both keys now cross the threshold in step, a
 * retaliation can fire **twice -- once in each direction -- where it fired
 * once**. They chose it against that, so the extra retaliation is bought
 * rather than overlooked.
 *
 * **What made the question worth asking rather than deciding here**: at 0.2
 * the mechanism was measurably close to unreachable. Eight seeds, ninety
 * in-game days each, at the repository's own reference staffing, produced a
 * gang member in **2 of 8** sessions and a gang retaliation in **1 of 8** --
 * so *"Two gangs are settling a score."* is a sentence most players would
 * never see. That measurement is what the ruling was given against.
 *
 * **Provenance is the weaker kind**, as `AGENTS.md` records of several
 * rulings: the label of a clickable option this session wrote -- *"Podnieś
 * wagę do 0,4"* -- not a sentence the owner typed.
 */
export const CROSS_GANG_ASSAULT_GRUDGE_WEIGHT = 0.4;

/**
 * Writes the grudge an adjudicated cross-gang assault leaves behind, and
 * answers with the gang pair involved -- ADR 0103 decision 2, which is the
 * owner's ruling of 2026-09-08 and not this repository's proposal:
 *
 * > A grudge forms from an adjudicated assault between members of different
 * > gangs -- one the player was actually shown.
 *
 * **"Adjudicated" is the terminal transition, not a hearing.** ADR 0103
 * Context 13 read the seam: `IncidentResponseSystem.adjudicateAssaultIfAny` is
 * the one door both terminal transitions of an assault go through, it fires on
 * a lapse as well as on a resolution, and nothing in this repository holds an
 * evidence stage. This function is called from there and nowhere else.
 *
 * **"One the player was actually shown" is reading A, which the owner ruled on
 * 2026-09-08, and it costs no code here.** Nothing records that a sentence
 * reached a screen and the determinism contract forbids the kernel from
 * reading publication (`tests/determinism/status-counts-publication.test.ts`),
 * so the implementable reading is *announced*: `IncidentTriggerSystem`'s one
 * `openIncident` door calls `recordIncidentOpened` unconditionally, so every
 * assault that opens is on the alerts channel already and no filter is added.
 * Reading the event log back to ask *"was this announced?"* would make the
 * incident tree the first simulation reader of that log (ADR 0103 Context 14g)
 * and is deliberately not done.
 *
 * **BOTH DIRECTIONS, AT HALF WEIGHT -- OPEN QUESTION 2, ANSWERED BY THE OWNER
 * ON 2026-09-10.** Decision 2.1 originally stated the direction flat --
 * *"the offending gang is the instigator's, the offended gang is the other
 * participant's"* -- and wrote a single directional entry at full weight. The
 * owner's ruling declines that: nobody has to say which of the two gangs is
 * the offender, because `instigatorId` is `ranked[0]` of
 * `scoreAssaultPressure` and three modules say independently that it is not a
 * finding of fault (ADR 0103 Context 12). So this writes **both** directional
 * keys from the one event, each at half the per-assault weight, rather than
 * one key at the whole of it -- the same total ledger movement per assault,
 * split instead of concentrated on a guess about fault.
 *
 * **This changes the arithmetic decision 2.5 stated for a one-directional
 * ledger.** That section's "two assaults means two in the SAME direction, or
 * an alternating pair never retaliates at all" no longer holds: every
 * cross-gang assault now credits both keys equally regardless of who
 * `instigatorId` names, so an alternating pair accumulates exactly as a
 * one-sided pair does. It also means both directional keys reach the
 * retaliation threshold in step, which is priced in the ledger-cadence
 * measurement this change is required to carry (ADR 0103 Status, "the cadence
 * is still unmeasured").
 *
 * Answers `undefined` and writes nothing when the assault was not between two
 * gangs: no instigator, either participant in no gang, or both in the same
 * one. A same-gang assault is silent by construction, which is also what keeps
 * `addGrudge`'s self-grudge `RangeError` unreachable from this path. The
 * `instigatorId` field is still read here -- not as a fault-finding, only to
 * derive the two gangs and the one other participant off the two-long
 * `participantIds` list (ADR 0103 Context 12), which needs no new field on the
 * incident.
 */
export function recordGrudgeFromAdjudicatedAssault(
  gangs: GangRegistry,
  incident: IncidentRecord,
  weight: number = CROSS_GANG_ASSAULT_GRUDGE_WEIGHT,
): readonly [gangA: string, gangB: string] | undefined {
  if (incident.type !== 'assault' || incident.instigatorId === undefined) return undefined;

  const instigatorGangId = gangs.getGangOf(incident.instigatorId);
  if (instigatorGangId === undefined) return undefined;

  // `ASSAULT_PARTICIPANT_COUNT` is 2, so the other participant is the one that
  // is not the instigator -- derived rather than carried, which is why ADR
  // 0103 Context 12 concludes a grudge needs no new field on the incident
  // record. A record that does not name exactly one other participant is
  // refused rather than guessed at: it is not the shape this rule is about.
  const others = incident.participantIds.filter((entityId) => entityId !== incident.instigatorId);
  if (others.length !== 1) return undefined;

  const victimGangId = gangs.getGangOf(others[0]!);
  if (victimGangId === undefined || victimGangId === instigatorGangId) return undefined;

  // Half-weight, both directions: an even ledger entry from each gang against
  // the other, so neither direction has to be picked as "the" offender.
  const halfWeight = weight / 2;
  gangs.addGrudge(victimGangId, instigatorGangId, halfWeight);
  gangs.addGrudge(instigatorGangId, victimGangId, halfWeight);
  return [victimGangId, instigatorGangId];
}
