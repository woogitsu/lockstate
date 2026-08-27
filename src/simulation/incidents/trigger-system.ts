import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { GangRegistry, resolveRetaliationRisk } from './gangs';
import { IncidentLog, type IncidentCauseFactor, type IncidentType } from './incident';
import { SectorRiskTracker, type SectorRiskSample } from './sector-risk';

/**
 * Supplies each sector's current risk inputs from real simulation state.
 * Injected rather than reaching into every subsystem directly, so this
 * system depends on none of them concretely -- the same decoupling
 * `JobSystem`'s `JobWorkerAdapter` (#25) and `SearchSystem`'s
 * `CategoryConcealmentResolver` (#27) use.
 */
export type SectorRiskSampler = (sectorId: string, tick: number) => SectorRiskSample;

/** Which prisoners are in a sector right now -- again injected, since sector membership is session/scenario knowledge. */
export type SectorOccupantResolver = (sectorId: string) => readonly EntityId[];

/**
 * How long a sector stays quiet after an incident opens in it -- two in-game
 * days (`DAY_LENGTH_TICKS` is 2,400).
 *
 * A **directional default, not a balance decision**, and the reason it exists
 * at all is a measurement. `resetStreak` on its own makes one sustained window
 * produce one incident, but it says nothing about the *next* window: in a
 * prison whose conditions do not improve, every sample after the incident
 * closes is hot again, so the sector re-arms in `sustainedSamplesRequired`
 * samples and riots again. Measured on this tree before the quiet period
 * existed: an overcrowded, unguarded starter prison opened **49 riots in 20
 * in-game days**, roughly one every ten hours, each one a fresh record with
 * fresh disciplinary points. That is a nuisance rather than a stake.
 *
 * Measured from the previous incident's *start* rather than its end, which is
 * the simpler statement and the stricter one: `responseDeadlineTicks` is 600,
 * so the incident itself is inside the window and about 4,200 ticks of quiet
 * follow it whether it was contained or lapsed.
 *
 * It is a floor on the interval and not a fixed cadence. Sampling continues
 * through the window, so a sector that genuinely calms down inside it resets
 * its streak and has to earn `sustainedSamplesRequired` all over again; a
 * sector whose conditions never improve fires again on the first sample past
 * the window, which is the intended reading of "nothing was fixed".
 */
export const DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT = 4_800;

/**
 * How many prisoners have to be standing in a sector before its sustained risk
 * can become a **riot**.
 *
 * Two, and the number is the whole of the argument: a riot is a collective act,
 * and `IncidentLog` already carries `'assault'` for what one prisoner does.
 * `IncidentResponseSystem.lapse` injures every participant and
 * `respondersPerSeverityPoint` sizes the response from severity, so a
 * one-participant severity-7 riot is a prisoner rioting against themselves
 * while four guards are dispatched to contain it. Once occupancy stopped
 * meaning "standing on one particular tile" and started meaning "in the
 * prison", that case became reachable in the smallest prison a player can
 * build: one furnished cell, one prisoner, and no toilet, shower or yard, whose
 * needs sit around half unmet for ever.
 *
 * **What it deliberately does not do is suppress the risk.** A sector below the
 * floor still samples, still scores and still accumulates its streak; it simply
 * has nobody to riot. The pressure is real and it is recorded — it becomes an
 * incident on the sampling point after the second prisoner arrives, not two
 * windows later.
 *
 * Directional default, not a balance decision.
 */
export const DEFAULT_MINIMUM_RIOT_PARTICIPANTS = 2;

export interface IncidentTriggerMetrics {
  readonly incidentsTriggered: number;
  readonly riotsTriggered: number;
  readonly retaliationsTriggered: number;
}

/**
 * Turns sustained sector conditions into incidents -- issue #28's "riot
 * trigger based on sustained sector unhappiness/risk inputs rather than a
 * one-tick threshold" and "gang membership/territory/retaliation alters
 * risk/action scoring without nondeterministic iteration."
 *
 * Runs on a multi-rate schedule (every 50 ticks), so one "sample" is a
 * sampling point, not a kernel tick: the risk tracker's sustained window
 * therefore spans real simulated time rather than twelve consecutive
 * frames. Every iteration order here is explicitly sorted (sector ids,
 * gang ids, entity ids), never `Map` order.
 *
 * **Four gates stand between a hot sector and a record**, and they are listed
 * here because reading `update` alone makes them look like one condition:
 *
 * 1. `SectorRiskTracker.isSustainedHot` -- the window, `sustainedSamplesRequired`
 *    consecutive hot samples, reset outright by one cool one.
 * 2. `openIncidentsInSector` -- one open incident per sector, so a riot inside
 *    a riot is not a second record.
 * 3. `isQuiet` -- `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT` since the last
 *    incident *opened*, which is what stops a prison nobody fixes from
 *    producing one riot per window for ever
 *    ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 *    decision 4).
 * 4. `minimumRiotParticipants` -- a riot is a collective act, so a sector with
 *    one prisoner in it accumulates risk and has nobody to riot.
 *
 * Gates 3 and 4 arrived with ADR 0048 and only became necessary once occupancy
 * meant "in the prison" rather than "on one tile": before that the trigger
 * could not fire in a playable prison at all, so nothing could fire it too
 * often or with too few people.
 */
export class IncidentTriggerSystem implements SystemRegistration {
  public readonly id = 'incidents.trigger';
  public readonly order = 285;
  public readonly schedule = { intervalTicks: 50, phaseTicks: 0 };

  private incidentsTriggered = 0;
  private riotsTriggered = 0;
  private retaliationsTriggered = 0;
  private sequence = 0;

  public constructor(
    private readonly incidents: IncidentLog,
    private readonly risk: SectorRiskTracker,
    private readonly gangs: GangRegistry,
    private readonly sectorIds: readonly string[],
    private readonly sampleRisk: SectorRiskSampler,
    private readonly resolveOccupants: SectorOccupantResolver,
    /** Retaliation risk at/above which a gang-retaliation incident fires. Directional default, not a balance decision. */
    private readonly retaliationThreshold: number = 0.6,
    /** How long after an incident opens this sector may not open another. See `DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT`. */
    private readonly quietTicksAfterIncident: number = DEFAULT_SECTOR_QUIET_TICKS_AFTER_INCIDENT,
    /** How many occupants a sector needs before a riot can open in it. See `DEFAULT_MINIMUM_RIOT_PARTICIPANTS`. */
    private readonly minimumRiotParticipants: number = DEFAULT_MINIMUM_RIOT_PARTICIPANTS,
  ) {}

  /**
   * Whether this sector is still inside the quiet period the last incident
   * bought it. Sampling continues through it -- the score and the streak are
   * still recorded, so a sector that calms down inside the window loses its
   * streak and has to rebuild it -- and only the *opening* of a new incident
   * is withheld.
   */
  private isQuiet(sectorId: string, tick: number): boolean {
    const lastStart = this.incidents.lastIncidentStartedAtTick(sectorId);
    return lastStart !== undefined && tick - lastStart < this.quietTicksAfterIncident;
  }

  public getMetrics(): IncidentTriggerMetrics {
    return { incidentsTriggered: this.incidentsTriggered, riotsTriggered: this.riotsTriggered, retaliationsTriggered: this.retaliationsTriggered };
  }

  public update(context: SimulationContext): void {
    for (const sectorId of [...this.sectorIds].sort()) {
      const sample = this.sampleRisk(sectorId, context.tick);
      const score = this.risk.sample(sectorId, sample);

      // One open incident per sector at a time -- a riot inside a riot is not a
      // second record, and this keeps response staffing attributable.
      if (this.incidents.openIncidentsInSector(sectorId).length > 0) continue;

      // And one incident per sector per quiet period, which is the difference
      // between a prison with stakes and a prison with a riot every ten hours.
      if (this.isQuiet(sectorId, context.tick)) continue;

      if (this.risk.isSustainedHot(sectorId)) {
        // Resolved once and handed to `openRiot`, so the participants a riot
        // records are the same occupants its gate was decided on -- there is no
        // second walk in between for a prisoner to move during.
        const occupants = this.resolveOccupants(sectorId);
        if (occupants.length >= this.minimumRiotParticipants) {
          this.openRiot(sectorId, score, sample, occupants, context.tick);
          continue;
        }
      }

      this.tryOpenRetaliation(sectorId, context.tick);
    }
  }

  private nextIncidentId(type: IncidentType): string {
    this.sequence += 1;
    return `incident.${type}.${this.sequence}`;
  }

  private openRiot(sectorId: string, score: number, sample: SectorRiskSample, occupants: readonly EntityId[], tick: number): void {
    const causeFactors: readonly IncidentCauseFactor[] = [
      { kind: 'sustained-sector-risk', value: score },
      { kind: 'needs-pressure', value: sample.needsPressure },
      { kind: 'staffing-shortfall', value: sample.staffingShortfall },
      { kind: 'contraband-pressure', value: sample.contrabandPressure },
    ];
    this.incidents.open(
      {
        id: this.nextIncidentId('riot'),
        type: 'riot',
        sectorId,
        participantIds: [...occupants].sort((a, b) => a - b),
        severity: Math.max(1, Math.min(10, Math.round(score * 10))),
        causeFactors,
      },
      tick,
    );
    this.risk.resetStreak(sectorId); // one sustained window -> one incident, not one per subsequent sample
    this.incidentsTriggered += 1;
    this.riotsTriggered += 1;
  }

  private tryOpenRetaliation(sectorId: string, tick: number): void {
    const claimants = this.gangs.gangsClaiming(sectorId);
    for (const offendedGangId of claimants) {
      for (const [offended, offending] of this.gangs.allGrudges()) {
        if (offended !== offendedGangId) continue;
        const risk = resolveRetaliationRisk(this.gangs, offended, offending, sectorId);
        if (risk < this.retaliationThreshold) continue;

        const participants = [...this.gangs.membersOf(offended), ...this.gangs.membersOf(offending)].sort((a, b) => a - b);
        this.incidents.open(
          {
            id: this.nextIncidentId('gang-retaliation'),
            type: 'gang-retaliation',
            sectorId,
            participantIds: participants,
            severity: Math.max(1, Math.min(10, Math.round(risk * 10))),
            causeFactors: [
              { kind: 'gang-grudge', value: this.gangs.getGrudge(offended, offending) },
              { kind: 'retaliation-risk', value: risk },
            ],
          },
          tick,
        );
        this.gangs.clearGrudge(offended, offending); // acted on -- not a permanent standing grievance
        this.incidentsTriggered += 1;
        this.retaliationsTriggered += 1;
        return; // one incident per sector per sampling point
      }
    }
  }

  public getSnapshot(): { readonly metrics: IncidentTriggerMetrics; readonly sequence: number } {
    return { metrics: this.getMetrics(), sequence: this.sequence };
  }

  public loadSnapshot(snapshot: ReturnType<IncidentTriggerSystem['getSnapshot']>): void {
    this.incidentsTriggered = snapshot.metrics.incidentsTriggered;
    this.riotsTriggered = snapshot.metrics.riotsTriggered;
    this.retaliationsTriggered = snapshot.metrics.retaliationsTriggered;
    this.sequence = snapshot.sequence;
  }
}
