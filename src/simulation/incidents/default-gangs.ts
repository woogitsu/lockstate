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
 * save-compatibility question `src/simulation/runtime/new-session.ts:471-478`
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
 */
export const CROSS_GANG_ASSAULT_GRUDGE_WEIGHT = 0.2;

/**
 * Writes the grudge an adjudicated cross-gang assault leaves behind, and
 * answers with the ledger key it wrote -- ADR 0103 decision 2, which is the
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
 * **THE DIRECTION IS DECISION 2.1'S AND OPEN QUESTION 2 RECORDS THAT IT IS NOT
 * THE ONLY DEFENSIBLE ONE.** Decision 2.1 states it flat -- *"The offending
 * gang is the instigator's, the offended gang is the other participant's"* --
 * and that is what is written here. What the owner's ruling does not settle is
 * whether it is right: `instigatorId` is `ranked[0]` of
 * `scoreAssaultPressure`, and three modules say independently that it is not a
 * finding of fault. Open Question 2's other two answers -- write **both**
 * directions at half weight, or write nothing until issue #80's real
 * adjudication exists -- are open, and neither is chosen here.
 *
 * Answers `undefined` and writes nothing when the assault was not between two
 * gangs: no instigator, either participant in no gang, or both in the same
 * one. A same-gang assault is silent by construction, which is also what keeps
 * `addGrudge`'s self-grudge `RangeError` unreachable from this path.
 */
export function recordGrudgeFromAdjudicatedAssault(
  gangs: GangRegistry,
  incident: IncidentRecord,
  weight: number = CROSS_GANG_ASSAULT_GRUDGE_WEIGHT,
): readonly [offendedGangId: string, offendingGangId: string] | undefined {
  if (incident.type !== 'assault' || incident.instigatorId === undefined) return undefined;

  const offendingGangId = gangs.getGangOf(incident.instigatorId);
  if (offendingGangId === undefined) return undefined;

  // `ASSAULT_PARTICIPANT_COUNT` is 2, so the victim is the participant that is
  // not the instigator -- derived rather than carried, which is why ADR 0103
  // Context 12 concludes a grudge needs no new field on the incident record.
  // A record that does not name exactly one other participant is refused
  // rather than guessed at: it is not the shape this rule is about.
  const others = incident.participantIds.filter((entityId) => entityId !== incident.instigatorId);
  if (others.length !== 1) return undefined;

  const offendedGangId = gangs.getGangOf(others[0]!);
  if (offendedGangId === undefined || offendedGangId === offendingGangId) return undefined;

  gangs.addGrudge(offendedGangId, offendingGangId, weight);
  return [offendedGangId, offendingGangId];
}
