# Modern paint state audit

## Historical proof coverage correction

Actual isolated base: `d5703d45672f9020322516c5355e32a9c8b3d830`.
The unchanged foundation coverage test returned 1 RED /3 GREEN. It found two
uncovered modules: the historical hierarchy `source-proof.mjs` and the earlier
public-View `guard-preservation.mjs`. The original raw output is retained.

This branch renames only its hierarchy proof to an inert `.mjs.txt` attachment,
preserving its bytes and documenting deliberate manual replay/cleanup. Root
owns the separate guard attachment repair; this branch does not duplicate it.
After this branch's rename the same gate remains 1 RED /3 GREEN and names
only Root's `guard-preservation.mjs`; that actual follow-up is retained as
`coverage-own-repaired-root-pending.txt`. It is not reported as overall GREEN.
No gate or typecheck exemption is changed. This correction concerns evidence
packaging, not the CSS values or the already recorded producer RED/restoration.

## State audit scope

Both light/dark token maps and actual hover/focus/selected/unavailable producer
rules are being read. The real template modal uses 20 ordinary card buttons,
outside the new `.ui-action` resting paint rule. Its generic button rule still
gives every unselected card the same sunken surface and outer form border.
The narrow correction gives only resting unselected cards a transparent
surface and hairline border. Its selector excludes selected, hover, active,
focus-visible, disabled and aria-disabled. It changes neither selected accent
paint nor the generic button geometry, native focus, labels or any of the
20 card producers. It does not restyle Close, Place, rotation or other modal
actions. Both themes use their existing panel/text/hairline aliases.

The new normal strict-app unit guard first returned actual 1 RED /1 GREEN on
the original producer; after the paint correction it passed alongside the
unmodified two token/theme files: 93 GREEN /3 files. Both outputs are retained.
This is source-state evidence, not computed browser style or native geometry.
The exact new production rule was then omitted on detached source subject
`7411151a6c847cb4bbb1375d6bb704002eb18671`: the same guard returned
1 RED /1 GREEN. A `finally` restored the original CSS bytes, SHA256
`9c2b7d3053898e3abf92867c8d6119e439e02b5ee7c85735713e70030fe816ce`.
The restored same three files returned 93 GREEN. `mutation-receipt.json` and
both original outputs are retained. No omission remains.

After restoration, app and tools typechecks exited0 with no compiler
diagnostics (`types-green.txt`; PowerShell labels the package-manager stderr
command echo as `NativeCommandError`, not a failing process). The new normal
unit file is covered by the existing strict app `tests` include.
Manual historical AST replay against the current actual CSS again preserved
all2216 nonpaint records and all original tokens; its temporary executable
was removed. `actual-source-preservation.json` retains that obtained result.

The separate actual-source state reading found no unreadable enabled text pair
among the audited hover/template roles in either theme. The lowest is the
existing selected template accent on sunken surface: light4.7146413765:1,
dark10.9959127475:1. Quiet template body text against its real parent panel is
light12.0054506982:1 /dark13.4920884717:1. These are resolved source colours,
not screenshot measurements. The unchanged unavailable opacity is not claimed
to satisfy the enabled-text contrast floor. `state-contrast.json` retains all
10 actual rows; `state-read.cjs.txt` is an inert historical generator.

To deliberately replay the state reading from the repository root, copy its
inert attachment temporarily beside it and remove it after execution:

```powershell
$stateAttachment = 'docs/research/2026-10-03-modern-hud-paint-states-audit/state-read.cjs.txt'
$stateReplay = 'docs/research/2026-10-03-modern-hud-paint-states-audit/.state-read-replay.cjs'
Copy-Item -LiteralPath $stateAttachment -Destination $stateReplay
try { node $stateReplay } finally { Remove-Item -LiteralPath $stateReplay }
```

Browser/build acceptance and evaluation of the newly built root screenshots
are pending; neither is executed by this source audit. The earlier94b923a
reference is not acceptance for this subject. No Issue was opened for this
cosmetic hierarchy refinement, and no layout/copy/Save rule was introduced.

| Actual state | Audited producer / effect |
| --- | --- |
| Secondary action/icon resting | Existing quiet selector applies only while no hover/active/focus/pressed/unavailable state matches. |
| Primary action resting/hover | Existing primary rules and both-theme contrast guards remain unchanged. |
| Selected icon, armed/removing Build/Rooms | Actual `aria-pressed=true` from the existing producer excludes the quiet rule; existing accent tint remains. |
| Unavailable action/icon | Existing action opacity and icon muted/transparent rules remain; no new unavailable-color rule. |
| Template selected | Actual `select()` publishes one `aria-pressed=true`; existing accent border/text remains. |
| Template hover/active/native focus | New resting rule is excluded, leaving the original modal button paint and native focus intact. |
