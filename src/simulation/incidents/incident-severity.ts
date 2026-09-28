/**
 * Highest severity the incident producers can emit. Shared with the Staff
 * projection's ADR 0095 response-reserve ceiling so neither can drift alone.
 * Changing this is a balance decision owned by issue #29.
 */
export const INCIDENT_SEVERITY_CEILING = 10;
