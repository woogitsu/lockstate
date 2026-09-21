import { describe, expect, it } from 'vitest';
import {
  projectIncidentDetail,
  projectIncidents,
} from '../../src/simulation/presentation/incident-projection';
import { IncidentLog } from '../../src/simulation/incidents/incident';
import { incidentDetailFromProjection, incidentsFromProjection } from '../../src/ui/simulation-incidents';

/**
 * The translator between `hud/incidents` and what the Security section's
 * incidents block renders.
 *
 * Only the sector question is asserted here, because it is the only thing
 * this module decides that nothing else in the suite covers: the panel's
 * browser spec is fed a `HudIncidentsViewModel` directly and so never runs
 * this function, and `hud-projections.test.ts` stops at the projection. The
 * hop between them is where a carried field is silently dropped.
 *
 * The projection is a **real** `projectIncidents` over a real `IncidentLog`,
 * not a hand-written row of the shape it is hoped to have -- the rule that
 * file's header states, for the reason it states.
 */
function logWith(sectorId: string): IncidentLog {
  const log = new IncidentLog();
  log.open(
    {
      id: 'incident.assault.1',
      type: 'assault',
      sectorId,
      participantIds: [4],
      severity: 5,
      causeFactors: [{ kind: 'needs-pressure', value: 0.5 }],
    },
    10,
  );
  return log;
}

/** A sector registry's answer, narrowed to the one field the projection reads. */
const sectorsOfGrade = (gradeId: string) => ({ getDefinition: () => ({ gradeId }) });

describe('incidents, as the Security section is told them', () => {
  it('carries the sector grade label key across to the row and the detail', () => {
    const incidents = logWith('security-sector.prison');
    const view = incidentsFromProjection(
      projectIncidents({ incidents, sectors: sectorsOfGrade('grade.general') }, 20),
    );

    expect(view.open).toHaveLength(1);
    expect(view.open[0]!.sectorId).toBe('security-sector.prison');
    // The catalog's own key, not a word: the panel localizes it.
    expect(view.open[0]!.sectorGradeLabelKey).toBe('grade.general.name');

    const detail = incidentDetailFromProjection(
      projectIncidentDetail({ incidents, sectors: sectorsOfGrade('grade.general') }, 'incident.assault.1', 20)!,
    );
    expect(detail.sectorGradeLabelKey).toBe('grade.general.name');
  });

  it('leaves the key absent, and the id present, when the projection resolved no grade', () => {
    const incidents = logWith('security-sector.prison');
    const view = incidentsFromProjection(projectIncidents({ incidents }, 20));

    expect(view.open[0]!.sectorGradeLabelKey).toBeUndefined();
    expect(Object.hasOwn(view.open[0]!, 'sectorGradeLabelKey')).toBe(false);
    // The fallback the panel draws is this, so it has to survive the hop too.
    expect(view.open[0]!.sectorId).toBe('security-sector.prison');
  });
});
