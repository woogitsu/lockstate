# PR #1977 CI activation checkpoint — 2026-10-03

A single fresh REST lookup and named fetch agreed on the exact open draft head
`00ad3ed1936f0eacb3ed40d88cc01d8d3ae6c0b2`, based on #1972. The candidate is
isolated; no PR or foreign branch was changed. The approved three-commit #1983
split cherry-picked without conflicts.

This subject's separate immutable baseline is
[ci-before-object-admission-release-activation.yml](../ci-before-object-admission-release-activation.yml).
The original main baseline is unchanged; neither previous release baseline path
was written. The before-workflow blob and the split workflow/partition producer
are identical to the prior tested candidates, proven in
[Git-byte comparison](./split-producer-byte-equality.json). The original six
producer negatives/restoration are explicitly reused, not repeated or claimed
as new execution; [prior receipt](./prior-producer-restoration-receipt.json)
retains its original subject.

Actual own gates at this checkpoint:

- Initial historical-main baseline contract: **1 RED / 6 GREEN**. The baseline
  reader was adapted to this subject without relaxing matcher/guard assertions.
- Entire parsed verify/assets jobs, including approved Blender hydration, match
  the frozen head's workflow.
- [Real collection](./collection-receipt.json): **887 source tests / 169 files**,
  split **325 / 79 files** and **562 / 90 files**; **67 artifact tests / 27 files**.
  Exact metadata union, no duplicates or source/artifact overlap.
- [Preservation contracts](./preservation-fixed.txt): **59 GREEN / 3 files**.
- Application/tool types and own production build: exit 0.

No browser/server or full local CI executed. Budgets, retries, globs, existing
wrappers/configs and player source are unchanged. Collection used `--list`.
Archived helpers are inert `.cjs.txt`; actual helpers ran from this agent's TEMP.

**Not final:** the coordinator reprioritized actual failed PR #2010 CI diagnosis.
This coherent checkpoint is published; final shell/docs/independent physical
inventory handoff remains pending. It is not a native or complete hosted-CI
acceptance claim. No new protected rule was introduced.
