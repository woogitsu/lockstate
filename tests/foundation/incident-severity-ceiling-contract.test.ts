import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INCIDENT_SEVERITY_CEILING } from '../../src/simulation/incidents/incident-severity';
import { DEFAULT_INCIDENT_RESPONSE_POLICY } from '../../src/simulation/incidents/response-system';

const triggerSource = readFileSync(new URL('../../src/simulation/incidents/trigger-system.ts', import.meta.url), 'utf8');
const projectionSource = readFileSync(new URL('../../src/simulation/presentation/staff-projection.ts', import.meta.url), 'utf8');

describe('ADR 0095 fixed ceiling follows the incident producers', () => {
  it('keeps the currently balanced ceiling and five-responder default', () => {
    expect(INCIDENT_SEVERITY_CEILING).toBe(10);
    expect(Math.max(1, Math.ceil(INCIDENT_SEVERITY_CEILING * DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint))).toBe(5);
  });

  it('uses the shared ceiling in all three producer clamps and the Staff reserve', () => {
    expect(triggerSource.match(/Math\.min\(INCIDENT_SEVERITY_CEILING,/gu)).toHaveLength(3);
    expect(triggerSource.match(/Math\.round\((?:candidate\.score|score|risk) \* INCIDENT_SEVERITY_CEILING\)/gu)).toHaveLength(3);
    expect(triggerSource).not.toMatch(/Math\.min\(10,|Math\.round\((?:candidate\.score|score|risk) \* 10\)/u);
    expect(projectionSource).toContain('Math.ceil(INCIDENT_SEVERITY_CEILING * DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint)');
  });
});
