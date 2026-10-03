# Modern HUD hierarchy paint draft

## Source scope and observed reference

**VERIFIED, actual image inspected:** the retained root screenshot
`2026-10-03-approved-camera-view-disclosure/native/original-modern-pl/006-actual-ui100-active-status-all-camera.png`
shows the existing UI100 skin: the pale command bar, readonly metrics and nested
form controls occupy similar tonal layers. Its visible build identity is
`94b923a`; it is a reference image, not acceptance for this new source.

**VERIFIED, source:** the isolated subject starts from published combined root
`9f709f293c47228166a09f550ef9867006d7bec6`. Four paint rule groups refine its
hierarchy: a navy FullHD command bar; inverse text/control roles only in its
brand/clock/transport/history/Layout-button islands; quiet resting secondary
controls; and the existing template dialog's panel surface/border roles.
The nine metrics and floating Layout menu do not receive the command aliases.
Hover, active, selected/primary, focus and unavailable states are excluded from
the resting-control rule. No raw ramp, existing semantic alias, text, font,
geometry, opacity, effect, saved format or room-status palette is changed.

Delivery owns camera fitting and the separate corner200 allocation proposal.
Its camera border/background semantic migration is not duplicated here. This
draft touches only `tokens.css`, `hud.css` and `primitives.css` paint.

## Checks obtained at the first source checkpoint

The first incomplete source had one actual alias-parity RED /90 GREEN: command
aliases declared in light but inherited in dark violated the existing parity
gate. It was corrected by declaring the same approved-ramp roles explicitly in
both themes. The unmodified token/theme gates then passed91/91.
Both outputs are retained. No old test or threshold was changed.

The next checkpoint will retain strict types, exact PostCSS AST nonpaint/raw
preservation and source-derived contrast, plus a real CSS producer omission
and byte-exact restoration. Those checks are pending in this first checkpoint.

**Weakest claim:** a source contrast calculation does not establish whether the
new hierarchy looks good in the real game. Root/Delivery owns the build/browser
lease; this draft has no build, browser, UI100/UI200 screenshot or visual
acceptance result. Root must capture the actual integrated build before judging
the cosmetic change. The original 15/13/11 fonts, all9 readings, 44/88 controls,
18 room hues and Style FX restrictions remain the required acceptance gates.
