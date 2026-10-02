# Template doorway approaches at the loaded frontier

## VERIFIED: the question and the unchanged contract

The isolated source checkpoint is published `78738b698b`, including the
square-wall furniture correction. Fresh GitHub reads opened the full existing
[#1740](https://github.com/woogitsu/lockstate/issues/1740),
[#1586](https://github.com/woogitsu/lockstate/issues/1586) and
[#1703](https://github.com/woogitsu/lockstate/issues/1703) bodies.
#1740 proposes refusing a Basic Cell at (10,25): its complete 4x7 rectangle is
owned, but its south doorway approach at (11,32) is not. No new Issue is filed.

At this checkpoint, `validateRoomTemplatePlacement` checks ownership of the
rectangle. Coordinator `preflight` additionally checks the exterior approach
for furniture, full wall squares and the separating legacy wall edge. It does
not require that approach to be owned. #1586's complete-plan/owned-footprint
contract does not explicitly decide exterior approach ownership.

The opened `reachability.ts` docblock already names this distinction under
ADR 0108 open question 5: loaded-frontier ground can look open to enclosure
while remaining outside the fixed route graph. The opened ADR's open question
asks about the loaded chunk set itself. The existing real-command
`edge-of-owned-land-room.test.ts` also establishes that manual legacy boundary
walls may be built with only one owned side. These are existing distinctions,
not permissions to silently impose a new template ownership rule.

## VERIFIED: actual commands and the falsifying control

`tests/research/1740-template-boundary-approach.research.ts` uses the existing
research config. It submits real packed `PlaceRoomTemplate` commands and runs
the scheduler until all twenty orders complete. Every scenario has two real
fixtures and the registered Cell. It requests budgeted prisoner and guard
routes from (16,16) to the Cell interior, then repeats after actual snapshot,
encoded save-envelope decoding and runtime restoration.

The origin chunk is owned in every scenario. The inward control uses (10,24).
The frontier cases use (10,25). The explicitly loaded controls materialize the
south chunk and pass it through the existing runtime `loadedChunks` option;
one owns that chunk and one does not. This option is a scenario control, not a
claimed native browser workflow.

Both roles give the same answers in each row:

| Scenario | Exterior approach owned | Preflight | Completed route | Encoded reload route | Room detail access, both stages |
| --- | --- | --- | --- | --- | --- |
| Owned inward control | yes | accepted | reachable | reachable | `doorway` |
| Default unloaded frontier | no | accepted | unreachable | unreachable | `doorway` |
| Explicit loaded unowned counterexample | no | accepted | reachable | unreachable | `doorway` |
| Explicit loaded owned control | yes | accepted | reachable | reachable | `doorway` |

The instrument completed in 21.89 seconds, with one fixture-integrity test
passing. These are sixteen measured route results. The counterexample falsifies
"an unowned approach is necessarily unreachable": it is reachable before
reload with the existing explicit loaded-area option. Restoring the same save
returns to the default navigation chunk derivation from owned chunks, so that
control loses its route inclusion. The world still contains the materialized
unowned chunk. A rule requiring ownership would reject its reachable initial
state and choose the unresolved frontier policy.

The instrument asserts fixture integrity and prints observed answers; it does
not assert the frontier mismatch as desirable. No production mutation is
reported because no production fix or behavior gate is introduced.

## Recommendation and limits

Keep #1740 tied to ADR 0108's existing open question. Decide the intended loaded
frontier/ownership behavior before restricting an exterior approach. The
observed default-session `doorway` versus unreachable-route discrepancy is
real; ownership alone is not a sufficient diagnosis of it.

The weakest claim is native workflow reachability: no browser was used, and
the explicit loaded-unowned scenario is constructor-level evidence. A native
workflow demonstrating the same loaded-area state would strengthen that claim;
an owner decision on the frontier would justify a corresponding behavioral
gate. No schema, player copy, history, tariff, workflow or ownership-policy
change, and no CI polling or merge.
