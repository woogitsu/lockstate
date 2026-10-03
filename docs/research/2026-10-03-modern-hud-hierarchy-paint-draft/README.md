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

## Obtained preservation and producer proof

**VERIFIED, actual source at paint checkpoint
`32abd38f009a975713c1aa126384859eceb72bad`:** the retained historical
`source-proof.mjs.txt` read the
real PostCSS AST and compares it against the exact combined base. All2216
nonpaint declaration records remain ordered and unchanged across the five
actual CSS files (267 tokens,1445 HUD,254 primitives,26 brand,224 global).
Every original raw ramp, semantic/dimension alias and room-status value is
unchanged. Only three source paint files differ from the base.

Both themes resolve the new roles to the existing ramps. The lowest measured
text pair is5.2833023587:1, above the existing4.5:1 reading floor. The actual
command focus accent is9.2648059353:1 in light and10.9959127475:1 in dark,
above3:1. Resting secondary text still clears4.5:1 on both actual panel roles.
The quiet rule excludes primary/selected, hover, active, focus-visible and
unavailable states; it changes neither glyphs nor focus declarations.

**VERIFIED, actual producer omission:** removing only
`--text-heading: var(--command-text-heading);` from the command-island consumer
made the unchanged proof fail at the real light-theme heading contrast1:1.
The source was restored in `finally`; before/restored SHA256 are identically
`3a24624308ed9680d82a4ca7ecf82e94dddb9f5b805aeed6b1f6bc30e7ac6a72`.
The same proof then returned exit0. Raw RED/GREEN, exact receipt and measured
JSON are retained beside this record. Mutation ran on detached32abd to exclude
the WIP sweep; no source omission remains.

After restoration, the same unmodified two token/theme test files passed91/91;
app and tools typechecks exited0. `checks-receipt.json` records their commands
and exits. PowerShell raw type output labels the package-manager stderr command
echo `NativeCommandError`; the process exit is0 and no compiler diagnostic was
emitted. Before the first successful AST run, the comparator was corrected to
normalize Git LF versus Windows CRLF. That was a proof-harness error, not a
product RED, and its full stderr was not retained. The retained producer RED
is the separate real heading omission above.

The proof is now an inert historical source attachment, not an executable
module in the project. The foundation coverage gate exposed that its original
`.mjs` name was outside tools typechecking. Its bytes are retained unchanged;
no typecheck exclusion or assertion was added. For a deliberate manual replay
from the repository root, copy it temporarily beside the attachment so module
resolution still uses this checkout, then remove the temporary copy:

```powershell
$proofAttachment = 'docs/research/2026-10-03-modern-hud-hierarchy-paint-draft/source-proof.mjs.txt'
$proofReplay = 'docs/research/2026-10-03-modern-hud-hierarchy-paint-draft/.source-proof-replay.mjs'
Copy-Item -LiteralPath $proofAttachment -Destination $proofReplay
try { node $proofReplay } finally { Remove-Item -LiteralPath $proofReplay }
```

**Weakest claim:** a source contrast calculation does not establish whether the
new hierarchy looks good in the real game. Root/Delivery owns the build/browser
lease; this draft has no build, browser, UI100/UI200 screenshot or visual
acceptance result. Root must capture the actual integrated build before judging
the cosmetic change. The original 15/13/11 fonts, all9 readings, 44/88 controls,
18 room hues and Style FX restrictions remain the required acceptance gates.
