# Focused A/B native preparation — execution pending

One case per separately built exact variant, English,1920×1080 CSS pixels,
supported public accessibility UI scale100% and visualViewport.scale1.
This is **not browser zoom** and not a100/200 matrix. No global Build/Save200
or object Rotate copy/control is imported. Both source drafts remain unapproved.

The opt-in config uses the actual Cloudflare production artifact config,
its missing-build guard and workerd preview, workers1/retries0/case60s/expect10s.
Do not reuse a server. Build and run only after the sole lease is granted.
Freeze each exact draft head before building; record source SHA, CSS SHA256,
all built files' hashes, command, original terminal output and artifacts.

```powershell
$env:PATH='C:/Program Files/Git/bin;'+$env:TEMP+'/lockstate-pnpm-11-22-20261002;C:/Users/matma/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;'+$env:PATH
$env:LOCKSTATE_CAMERA_CONTROLS_NATIVE='1'
$env:LOCKSTATE_CAMERA_CONTROLS_VARIANT='disclosure' # A; 'always' for separately built B
$env:LOCKSTATE_ARTIFACT_TEST_PORT='5371' # first establish that it is free
$env:LOCKSTATE_CAMERA_CONTROLS_OUTPUT="$env:TEMP/lockstate-camera-ab-native/<exact-subject-and-variant>"
pnpm --config.verify-deps-before-run=false exec node scripts/cloudflare-task.mjs build production
pnpm --config.verify-deps-before-run=false exec playwright test --config docs/research/2026-10-03-camera-controls-ab-source-draft/playwright.native.config.ts
```

## Public sequence and retained observations

- New prison; public Build/Remove and a physically hit-tested empty World
  canvas press emit one genuine RemoveWall command. Let the actual worker tick
  decide it, await the simulation-produced refusal and existing localized
  sentence, then Pause. Open the original alert fold if needed.
- A: actual View button press opens the original SELECT; B is already open.
  Save the entire paused worker snapshot before camera actions.
- Physical Zoom presses and all four pan buttons change the real public
  minimap outline; opposite pan steps return to the original outline.
- Physically acquire the native View SELECT and choose Angled with real
  End/Enter. Each renderer owns its zoom: repeat the established two Zoom
  presses in Angled and require an unclipped outline before pose observations.
  Read every current camera control in one public DOM call:
  SELECT,4pan,4pose,2zoom and A's View button all retain44px, physical centre
  hit ownership and viewport containment. The camera panel must clear the
  actual active refusal, navigation, rail and corner; the alert list must fit
  its complete real row. No bounds, status text or snapshot is injected.
- Save the concrete all-controls/status screenshot and geometry JSON before
  assertions, so original failures retain both measurements and canvas.
  Physically press all four pose buttons and require independently published
  minimap geometry to change. Native Home/Enter returns to World and hides
  unavailable pose controls. A also verifies Escape/focus/reopen.
- Exact whole paused snapshot after equals before, command tee is unchanged
  across camera actions, and the real refusal remains. Save before/after full
  JSON, movement/pose receipt and returned-World screenshot.

Reader: [camera-controls-read.ts](./camera-controls-read.ts). It reads existing
rendered DOM and actual centre hit tests. It does not read renderer internals,
rewrite CSS or manufacture measurements. Read-only worker snapshots reuse
the existing showcase observer; all state changes originate in public UI.

Concrete output names:
`actual-ui100-active-status-all-camera.png`,
`actual-ui100-active-status-all-camera-geometry.json`,
`actual-paused-before-camera-whole.json`,
`actual-paused-after-camera-whole.json`,
`actual-public-camera-interactions.json`,
`actual-ui100-returned-world-active-status.png` and A's closed screenshot.

Current status: source prepared only. Types/collection do not establish a
native pass, actual geometry or owner approval. A future real band-anchor
omission must go RED, then restore source and compiled bytes exactly and
return GREEN before claiming that new native guard is proven. Preserve
original failures; do not relax floors, assertions or the bounded budget.

## Source preparation receipt

First coherent B preparation`de00e25ddb` was pushed before validation.
App/tools strict checks exit0. Actual Playwright`--list` collected1case1file,
without launching the webServer or a browser. Its existing artifact config
requires a retained index even for collection: only the actual previously
built rotation draft's`dist/client/index.html` was temporarily copied for
that check, hashed, and removed with its two empty directories immediately
afterward. That index is **not an A/B subject build**, and no missing assets,
old UI, server or browser was accepted using it. The actual A/B native run
must build its own frozen source before invoking this config normally.
