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
