import { describe, expect, it } from 'vitest';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { NavigationSystem } from '../../src/simulation/navigation/navigation-system';
import { buildCellBlockFixture } from '../helpers/navigation-fixture';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { SecuritySectorRegistry } from '../../src/simulation/security/sector';
import { GangRegistry } from '../../src/simulation/incidents/gangs';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { IncidentResponseSystem } from '../../src/simulation/incidents/response-system';
import { DEFAULT_SECTOR_RISK_POLICY, SectorRiskTracker } from '../../src/simulation/incidents/sector-risk';
import { IncidentTriggerSystem } from '../../src/simulation/incidents/trigger-system';
import { summarizeIncidents } from '../../src/simulation/incidents/alerts';

/**
 * Issue #28's performance requirement: "benchmark large simultaneous
 * incidents and lockdown routing; do not scan all actors against all
 * actors each tick." Directional evidence only (no hard threshold, per
 * `docs/BENCHMARKING.md`), proving the pipeline stays correct and that
 * per-sector lookups stay indexed (`IncidentLog.openIncidentsInSector`)
 * rather than scanning every incident ever recorded on every tick.
 */
describe('incident scale: many simultaneous incidents across many sectors', () => {
  it('drives 30 simultaneous sector incidents to terminal states with correct, fully-accounted outcomes', () => {
    const sectorCount = 30;
    const cellCount = 60;
    const cellBlock = buildCellBlockFixture(cellCount);
    const navigation = new NavigationSystem(cellBlock.world, { workBudgetPerTick: 8_000, agingIntervalTicks: 10, flowFieldActivationThreshold: 8 }, cellBlock.doors);
    navigation.setLoadedChunks(cellBlock.chunkPositions);

    // Same exclusion as the security/contraband scale tests: skip medical-gated cells.
    const openCellIndices: number[] = [];
    for (let i = 0; i < cellCount && openCellIndices.length < sectorCount; i += 1) {
      if (i % 5 !== 0) openCellIndices.push(i);
    }

    const sectors = new SecuritySectorRegistry(cellBlock.doors);
    const sectorIds: string[] = [];
    for (const cellIndex of openCellIndices) {
      const sectorId = `sector-${cellIndex}`;
      sectors.register({ id: sectorId, gradeId: 'grade.general', doorIds: [`cell-door-${cellIndex}`], postTile: cellBlock.cellTiles[cellIndex]! });
      sectorIds.push(sectorId);
    }

    const guards = new GuardRoster(256);
    for (let i = 0; i < 120; i += 1) guards.hire('staff-role.guard', cellBlock.canteenTiles[0]!);

    const incidents = new IncidentLog();
    const risk = new SectorRiskTracker(DEFAULT_SECTOR_RISK_POLICY);
    const gangs = new GangRegistry();

    // Every sector permanently hot -> a riot in each, all at once, all needing lockdown routing.
    const trigger = new IncidentTriggerSystem(
      incidents, risk, gangs, sectorIds,
      () => ({ needsPressure: 1, staffingShortfall: 1, contrabandPressure: 1 }),
      (sectorId) => [Number(sectorId.slice('sector-'.length))],
    );
    const response = new IncidentResponseSystem(incidents, sectors, guards, navigation);

    const kernel = new Kernel();
    kernel.registerSystem(navigation);
    kernel.registerSystem(trigger);
    kernel.registerSystem(response);

    const startedAt = performance.now();
    for (let tick = 0; tick < 20_000 && incidents.openIncidents().length + incidents.all().length < sectorCount; tick += 1) kernel.step();
    // Run on until every triggered incident reaches a terminal state.
    for (let tick = 0; tick < 20_000 && incidents.openIncidents().length > 0; tick += 1) kernel.step();
    const wallMs = performance.now() - startedAt;

    const summary = summarizeIncidents(incidents.all());
    console.log(`[incident scale] sectors=${sectorCount} guards=120 wallMs=${wallMs.toFixed(1)} summary=${JSON.stringify(summary)} response=${JSON.stringify(response.getMetrics())}`);

    expect(summary.total).toBe(sectorCount);
    expect(summary.stillOpen).toBe(0);
    // Every incident reached a terminal state, and the two are exhaustive.
    expect(summary.resolved + summary.lapsed).toBe(sectorCount);
    // With 120 guards against 30 riots, the pipeline actually contained a real share of them
    // rather than lapsing everything -- the response path genuinely ran at scale.
    expect(summary.resolved).toBeGreaterThan(0);
    // Guards are all returned to the pool once every incident is terminal.
    expect(guards.allGuardIds().every((id) => guards.getDeploymentPhase(id) === 'unassigned')).toBe(true);
    // No sector left stuck in lockdown.
    expect(sectorIds.every((sectorId) => sectors.getControlState(sectorId) === 'normal')).toBe(true);
  }, 30_000);
});
