# Approved room-plan preview fit

Owner decision received 2026-10-02: variant 3, full-footprint fit and camera pan, preserving the selected world origin until actual pointer movement. The review comparison remains in `docs/design/2026-10-01-room-preview-fit-variants` on its dedicated branch.

The production controller requests a fit only when the floor footprint exceeds the actual HUD-safe rectangle. It never changes world tile size or worker validation. When a fit is applied, RAF polling and a same-position pointer release retain the exact origin. Physical pointer movement unlocks it; changed selections or mirrors refit the retained origin. Escape and standing down reset it. Top-down placement is unchanged. No new player text or persistent fields.

Checkpoint verification: removing the locked-origin assignment causes two independent unit failures (x4 becomes34, revised origin x2 becomes12). Restoring it passes the controller/bridge/fit suites. Real production browser placement, Escape and larger-screen evidence are pending; this checkpoint is not a completion claim.
