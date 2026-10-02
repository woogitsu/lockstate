# Delivery Bay readiness after pending and completed saves

## Question and scope

Can normal and mirrored Delivery Bay templates be saved while pending, restored,
completed through the simulation scheduler, saved/restored again, and reported
with their real fixture quantity and reachable doorway by both worker producers?

VERIFIED against integration base `b5a8c3f045` on 2026-10-02. This adds regression
coverage, not a production fix or a save-format change. Existing all-plan tests
cover required fixture definitions, geometry, completion, enclosure and saved
anchors. Their assertions do not inspect the resulting room-needs projection.
The existing template-specific Kitchen test inspects its requirement summary;
the Delivery bootstrap test uses unmirrored plans and saves after completion.

## Exact runtime checks

The new integration test submits the real `PlaceRoomTemplate` command at (5, 5),
steps once, checks the pending request, then round-trips a JSON-encoded save
through `createSaveEnvelope`, `decodeSaveEnvelope` and runtime restoration.
It checks the same pending request after restore, runs scheduled construction,
and round-trips the completed runtime through a second encoded save.

Independent expected fixture anchors are (6, 6) for normal and (7, 6) for
mirrored. Both retain one `object.loading-dock-door` at orientation 0. The actual
`PROJECTION_CATALOG` room-list and room-detail producers report one satisfied
object requirement and zero missing capabilities. Detail reports minQuantity 1
and satisfyingQuantity 1. Both producers report `access: doorway`, whose
production predicate includes exterior reachability, rather than merely the
presence of a registered door.

## Mutation and exact restoration

Initial baseline: 2 passed, 166 ms of test execution (2.89 s suite).
A targeted production mutation removed only `placedObjects: runtime.placedObjects`
from the `hud/room-detail` producer. Both cases then failed on the exact fixture
quantity assertion: `satisfyingQuantity: 1` was absent, even though capability
fallback still reported satisfaction. Result: 2 failed, 658 ms (10.05 s suite).
This guards the stronger counted answer instead of accepting capability-only
fallback as proof that the actual fixture survived restoration.

The original production file was restored byte-for-byte in a finally block.
Before/after SHA256 was
`F196DA81196F0E8144C9A74F08061C89B2BDC4CAC8AFD96695657015F5B2B3CB`.
The restored test plus complete-catalogue and Delivery-bootstrap suites passed
45/45, 524 ms of test execution (2.23 s suite). Tools TypeScript also passed.
No production-file changes remain in this branch.

## Limits and weakest claim

These are simulation and actual worker-producer checks. They establish saved
construction state, exact fixture quantity and projected doorway access. They
do not establish browser interaction, art visibility or physical freight
throughput. The weakest claim is that projected readiness is enough for every
Delivery Bay gameplay use; an actual delivery route that fails despite these
same restored states would require its own runtime reproduction.
