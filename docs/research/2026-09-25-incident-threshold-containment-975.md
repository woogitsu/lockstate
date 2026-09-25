# Issue #975: incident threshold and containment on one command stream

Measured on `origin/main` at `478bef072360d6b719ece07176cbd50f006c5b89` (v0.0.769), seed `0x893`. This prices issue #975's first acceptance criterion; it does not select difficulty values.

The fixture is the existing `prisonHiring` scenario in `tests/integration/security-coverage-versus-response.test.ts`: a 2×3 cell with one bed, twelve admissions, guards hired before admission, forty ticks between admissions, and a sixteen-day observation window ending at tick 38,400. The same seed, construction, commands, timing, and guards were used within each three-row group. Only `SectorRiskTracker`'s policy field was replaced in the temporary test with a copy of `DEFAULT_SECTOR_RISK_POLICY` changing `hotThreshold`. That test-only private-field injection was removed after measurement; there is no runtime preset seam or shipped behaviour change.

| Guards | Hot threshold | Incidents finished or open | Resolved | Lapsed | Open | Responders dispatched | Free guards |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 0.45 | 9 | 0 | 9 | 0 | 0 | 0 |
| 2 | 0.65 (default) | 9 | 0 | 8 | 1 | 0 | 0 |
| 2 | 0.85 | 10 | 0 | 10 | 0 | 0 | 0 |
| 4 | 0.45 | 9 | 1 | 8 | 0 | 2 | 2 |
| 4 | 0.65 (default) | 9 | 1 | 7 | 1 | 2 | 2 |
| 4 | 0.85 | 10 | 2 | 8 | 0 | 4 | 2 |
| 7 | 0.45 | 9 | 9 | 0 | 0 | 39 | 5 |
| 7 | 0.65 (default) | 9 | 9 | 0 | 0 | 41 | 5 |
| 7 | 0.85 | 10 | 10 | 0 | 0 | 42 | 5 |

`routeFailures` was zero in every row. All nine rows had the same two required and posted guards. This is a deliberately over-crowded prison, so the results do not generalize to a well-provisioned one.

The threshold is not a simple difficulty dial. At exactly the guard count requested by coverage, no threshold allowed any response: all guards were posted and no responder was free. With two spare guards, only one or two incidents were contained. With five spare guards, all were contained. A higher threshold also produced **more**, not fewer, total incidents by this fixed tick in this fixture. Changing the threshold changes when an incident begins and its severity; later incident type, quiet windows, and responder demand can change as a result. The table alone does not isolate which part caused the extra incident. A preset cannot claim that a larger `hotThreshold` reliably makes play easier.

The threshold seam therefore changes outcomes in this fixture, but staffing dominates containment. Issue #893 and ADR 0095's reserve/coverage decision remain relevant to any difficulty level. The next experiment should repeat the comparison in a well-provisioned prison and record incident types, severities, opening ticks, and required responders. No owner-selected values should be proposed before that evidence and the save-carried preset design in #974/#973 are settled.

Reproduction: a temporary test was appended to `tests/integration/security-coverage-versus-response.test.ts`, calling `prisonHiring(guards)` for guards 2, 4, 7 and thresholds 0.45, 0.65, 0.85; before stepping it ran `Object.assign(runtime.sectorRisk, { policy: { ...DEFAULT_SECTOR_RISK_POLICY, hotThreshold } })`. `node node_modules/vitest/vitest.mjs run tests/integration/security-coverage-versus-response.test.ts -t 'temporary issue 975' --reporter=dot` passed (1 test, 7 skipped). The temporary test was removed so production and permanent test surfaces remain unchanged.
