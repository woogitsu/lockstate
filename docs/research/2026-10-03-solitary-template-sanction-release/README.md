# Existing #1555: a finished solitary template cannot release its own resident

Checkpoint: `4b6a07a06754949de87007606d8c13d4cd08c8a6`, 2026-10-03.
Existing Issue: https://github.com/woogitsu/lockstate/issues/1555.

## Actual reproduction

The integration fixture sends packed PlaceRoomTemplate commands for mirrored 90-degree Solitary (5,5) and Cell (15,15), waits for genuine construction/furniture completion, hires three guards, and admits one prisoner. The high-risk case uses the accepted command's priorIncidents=255; the general-population control uses 0. No world, entity, component, inventory or history state is injected.

The existing production incident follow-through method imposeSolitarySanction starts the normal 7200-tick term. This is domain API coverage, not a claim that the UI can choose prior incidents or impose a sanction. One future stays live; the other is encoded/decoded with the current V8 envelope and restored while the actual term is active.

At tick 9861, ten ticks after the end 9851, both high-risk residents are alive and still occupy room.solitary-cell:6:6. The end field still equals 9851 and releaseBacklogTicks=2. Registry object ownership and construction/history snapshots remain unchanged. Both general-population controls genuinely move to solitary and return to their original Cell with the term cleared.

Baseline: 2 RED / 2 legal controls; baseline.txt is the terminal output. The cause remains in SanctionSystem: findBestAvailable excludes a full room even when its sole occupant is the resident being released and their classification already permits that room.

## Honest earlier fixture failures

The first unrelated carry probe overlapped a rotated Cell perimeter with a Storage request; the refused purchase made its route assertion invalid. After separating the genuinely bought rooms, both normal/mirrored90 carry futures with a real procurement arrival and V8 Load completed (2 green). No new Issue was filed for correct behavior.

An initial sanction probe omitted guards. The high-risk resident escaped before expiry, so its uncleared end field did not reproduce this issue. Three genuine HireStaff commands preserve the living resident and produce the two failures above. No nonzero end field on a dead resident is counted as the defect.

## Proposed scope

Use the existing selected accommodation target and required capability to recognize the resident's current valid room, clear the elapsed term and count its release without another place claim or relocation. Preserve the existing full-room backlog for residents who actually must move. No save-format, copy, tariff or policy change.

Weakest claim: this does not prove a high-risk native UI admission or naturally generated incident; it proves the genuine completed template, packed admission, production sanction API and kernel continuation boundary. A classification that selects another room target must still use the established release-allocation path.

## Implemented checkpoint and terminal verification

Source checkpoint: `72ec799e1f6e748df58200145ae97da3380f6c68`, published on codex/template-navigation-next-audit-20261003. SanctionSystem reuses the selected existing release target and capability predicate. A living resident in that valid current room clears the term and increments releasedFromSolitaryCount without another allocation. Ordinary return, absent-capability backlog and live/encoded-V8 continuity remain unchanged.

The permanent six cases include actual RemoveObject of the standing solitary Bed during the term. A room without its required sleep-surface must retain the existing backlog; neither the source fix nor the regression treats room-id equality alone as sufficient. An initial attempt at this control read `anchor` rather than the actual `anchorTile` tuple and was a fixture-only TypeError (2 errors / 4 controls); correcting that reader changed no production rule.

- fixed.txt: 6 GREEN, 3.09 s.
- negative-in-place.txt: actual producer in-place predicate disabled, 2 RED / 4 controls. The two living high-risk residents retain their elapsed end fields.
- negative-capability.txt: actual producer capability reader replaced with true, 2 RED / 4 controls. The genuinely removed-Bed cases incorrectly clear their elapsed terms.
- restored.txt: exact original source bytes restored in finally, 6 GREEN, 3.09 s. Mutation tree was detached during both changes and returned to its own branch afterward.
- exact-restoration.json: SHA256 bbd2320689868a43b1646bdb4c5f0b51a9f6b1d65e460851c3dd95a96ada2e9e; byteExact=true; source diff0 against the published fixed checkpoint.
- neighbors.txt: 111 GREEN / 7 files, 3.53 s. Actual paths: solitary-template-sanction-release, assault-sanction-loop, own-accommodation-claim-restore integration tests; prisoners-sanction-system, prisoners-room-instance-registry, prisoners-intake-system, prisoners-classification-review unit tests.
- Application and tools TypeScript checks exited 0; production client build GREEN, 5.51 s, retaining existing bundle-size/plugin timing warnings.

Original eight documentation gates initially reported 60 GREEN / 2 RED: this new collection lacked its index row, and the local checkout lacked the already published base branch ref. The exact named published branch fetch restored citation evidence; the own index row is added without changing any guard, floor, budget or source quotation. Source anchors were already green and require no amendments. Documentation runs use process-local GIT_NO_LAZY_FETCH=1, preserving the existing guard implementation.

Final unchanged documentation gate: docs-restored.txt, 62 GREEN / 8 files, 4.19 s. No source-coordinate correction was necessary.
