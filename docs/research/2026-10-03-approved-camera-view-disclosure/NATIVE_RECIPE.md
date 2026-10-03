# Chosen A: Polish public UI100 / UI200 native preparation

This fixture is **source prepared**, not an executed native acceptance. It
contains two bounded cases: Polish with supported stored UI scale1, and Polish
with scale2, each at **1920×1080**. The page's `visualViewport.scale` must remain1:
this tests the game's public UI scale, not browser/page zoom.

The original A public route and independent assertions are retained: physical
New→Build→Remove; one real worker refusal while the clock runs, then Pause;
the complete actual alert row; View/select/pan/pose; Escape focus restoration;
all12 actual control hits; no new simulation commands; whole paused worker
before/after equality. All camera gaps and44px targets scale to24px/88px in the
supported200% case. No smaller alert row or arbitrary corner cap is introduced.
Localized expectations come from the actual authored Polish catalog.

Use only after root grants the exclusive build/browser lease. Freeze/detach
the exact integrated subject, verify own port is free, and retain that SHA,
fresh Cloudflare compiled SHA manifest, both original outputs, DOM receipts
and reached screenshots. No original failure may be discarded or retried.

```powershell
$env:PATH='C:/Program Files/Git/bin;'+$env:TEMP+'/lockstate-pnpm-11-22-20261002;C:/Users/matma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;'+$env:PATH
pnpm --config.verify-deps-before-run=false exec node scripts/cloudflare-task.mjs build production
$env:LOCKSTATE_CAMERA_CONTROLS_NATIVE='1'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='5371'
$env:LOCKSTATE_CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:LOCKSTATE_CAMERA_CONTROLS_OUTPUT="$env:TEMP/lockstate-approved-camera-a-original-native"
pnpm --config.verify-deps-before-run=false exec playwright test -c docs/research/2026-10-03-approved-camera-view-disclosure/playwright.native.config.ts --list
pnpm --config.verify-deps-before-run=false exec playwright test -c docs/research/2026-10-03-approved-camera-view-disclosure/playwright.native.config.ts --workers=1 --retries=0
```

No budget is changed: one worker, zero retries,60s/case, expect10s. The existing
artifact guard remains. This worktree has no build, and the actual `--list`
attempt correctly failed at the missing-production-artifact guard; raw output
is retained. No placeholder/other-subject index was substituted to make it
appear collected. Actual app/tools types, including this exact tracked folder,
passed. No build, preview or browser process was started for this preparation.
