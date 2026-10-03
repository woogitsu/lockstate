# UNAPPROVED #1292 camera presentation A/B source drafts

Base: exact published root `30568432f5f4a681849002962a87bfa8134ddc4a`. Own isolated worktree; AGENTS/workflow unchanged from previously read6d. No browser, preview/server, build or CI monitoring. Neither source variant is release approved. This does not import global200 allocation, object Rotate UI or any proposed new locale key.

## The concrete source decision

The current HUD mounts View's real SELECT, Zoom, four pan actions and the optional four Angled pose actions as separate corner siblings. Their added rows share a corner whose original #1292 budget was398px; the historical source2 native observer measured494px, while its actual FullHD200 empty alert list was0px. Surface-only subtraction was already ruled out at200; the alert row must not pay for new camera rows. The original398/29.19/10.19/9.19/781 assertions remain unchanged.

The draft moves the **original** SELECT/pan/pose nodes with their existing listeners/ports into a separately bounded camera region over the upper map. Zoom remains visible in its original corner. World-hidden pose remains hidden; live renderer updates keep targeting those same nodes. No actions are cloned, commands fabricated or state persisted. The camera region follows actual strip/navigation/inspector DOM bounds using ResizeObserver and window resize, and is destroyed with the HUD. It does not grow the corner or change minimap/alert/Save/list sizing. Existing phone visibility at720px is retained; this desktop proposal does not invent a mobile layout.

- **A — View opens the panel:** existing View/Widok text appears beside Zoom. Click/Enter/Space use a native button. Opening focuses the existing SELECT; Escape inside the panel closes it and restores View focus. Focus transfers the same existing keyboard ownership port. One additional press is required, and the map is uncovered when closed.
- **B — panel always visible:** same controls and same map region, no disclosure press or trigger. It permanently covers that portion of the upper map. The branch changes only the mounting variant from`disclosure` to`always`; common controls, positioning and callbacks stay identical.

Copy is reused exactly: `hud.camera.view` EN **View**, PL **Widok** for the trigger/region, existing **Top-down / Angled view**, **Z góry / Pod kątem**, Zoom and all pan/yaw/tilt labels. No new “Camera controls” locale key is introduced. KeyR remains the existing camera tilt binding. New object Rotate text/control and global Build/Save/card allocation are not part of these branches.

CSS keeps scaled tap minima44/88px, including the SELECT; pan/pose groups wrap within the map-region width rather than being shrunk or clipped. The width cap396×scale and12×scale gutter are the earlier transient proposal's actual bounds recipe, not new successful measurements. The source does not add a scroll/clipping rule to conceal a panel that fails its available height. A future native check must reject overlap with Zoom, alerts, inspector or viewport and preserve all original camera/action/complete-alert-row assertions. No default threshold or test timeout is changed.

## Evidence and limits

[Evidence](./evidence/) preserves source-only types and21 focused unit results. The Node unit suite executes the real presentation producer against explicit DOM stubs, so it proves node identity/listener reuse, A focus/Escape, B visibility, bounds-change callback and teardown. **It is not measured browser geometry.** Real production mutation replaces the ResizeObserver callback with a no-op:2 testsRED; byte-exact source restoration SHA256`bbd814a682b872d4bf120a7db20db58c1e5da0d194e4847f743729653f0dc5d8` returns21GREEN. Both app/tools types exit0. Fresh #1292 PR read is retained; no duplicate Issue or remote approval was created.

Earlier transient preview results exist on a different subject (`129a861c14`, English empty-alert cases); they are historical feasibility evidence, not native acceptance of305/A/B or Polish active warning rows. This record does not transfer their screenshots to a new compiled subject.

Small owner choice: [OWNER_CHOICE](./OWNER_CHOICE.md). Exact branch source patches are recorded under evidence after checkpoints are published. The new region's discoverability/map-cover rule remains the owner's decision. Weakest claim: source minima and a correct ResizeObserver cannot establish actual full-height containment or worst alert-row capacity. Native evidence showing a clipped target or covered row rejects the candidate; do not debit the alert floor or widen its budget to turn it green.
