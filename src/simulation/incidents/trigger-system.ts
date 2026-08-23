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
 * therefore spans real simulated time rather than three consecutive
 * frames. Every iteration order here is explicitly sorted (sector ids,
 * gang ids, entity ids), never `Map` order.
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
  ) {}

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

      if (this.risk.isSustainedHot(sectorId)) {
        this.openRiot(sectorId, score, sample, context.tick);
        continue;
      }

      this.tryOpenRetaliation(sectorId, context.tick);
    }
  }

  private nextIncidentId(type: IncidentType): string {
    this.sequence += 1;
    return `incident.${type}.${this.sequence}`;
  }

  private openRiot(sectorId: string, score: number, sample: SectorRiskSample, tick: number): void {
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
        participantIds: [...this.resolveOccupants(sectorId)].sort((a, b) => a - b),
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
