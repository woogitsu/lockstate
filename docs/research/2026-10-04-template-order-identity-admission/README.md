# Full-template order identity admission

Measured on published `124c898d6f9ceadc1651430fce53101992105e80`, 2026-10-04.

## Original actual kernel failure

Actual packed `PlaceBuildOrder` buys a square brick wall at2,2 with a valid nonempty ID `room-template-000000000001-0-wall-005`. The next actual command buys `cell-basic` at10,10, mirrored, clockwise90°. The geometric worker query returns clear without writing. Template expansion tries to reuse that owned ID; `ConstructionSystem.submitOrder` throws `BuildOrder ... already exists` after inserting earlier shell orders. The independent wall is outside the template rectangle.

With `room-template-000000000001-2-object-000` instead, the purchase admits18 shell orders and records a pending template despite an existing future furniture ID. Completion cannot submit that fixture. The regression requires the complete generated identity set to be admitted before any shell/history/stock/funds/owner mutation.

Original6-case source run is4RED/2GREEN,339ms case execution. Both failures reproduce after actual encoded currentV10 Save/Load. The two legal controls use a different ID, complete a mirrored270° Cell, encode/load, Undo and Redo while preserving the independent completed wall and exact furniture owners. No world/stock planting, renderer feed replacement, browser, build or native input was used. Current UI ID minting is not claimed to produce this collision; this is a valid command/restored order-book boundary.

## Scope and deduplication

Fresh remote full search and Issues#514/#2027 were read. #514 concerns duplicate geometry under different IDs; #2027 concerns malformed empty IDs and historical opaque queues. This case uses distinct geometry and a legal nonempty ID already owned by an independent purchase. Parent granted only `RoomTemplateCoordinator.place`: check all generated shell **and future fixture** IDs before the first submission, preserving existing refusal/copy and independent ledger. No identifier namespace restriction, historical migration, save/wire format, tariff, HUD or camera change.

Executed original source and output are retained in `raw/`. This first checkpoint records the diagnosis; fixed and actual production omission/restoration evidence follows separately.
