# Focused public native preparation for #1943 World parity

Base/source correction: `afc0fa0150b22a9d7f8f084a796243eb9bc930e7`; original source diagnostic `858603d46d27743400dff7ead05e370090d6cdf4`. Separate isolated worktree; root retains the sole browser/server lease. No browser or server launched for this preparation.

One opt-in built-client case, Full HD 100%, World only. Public New prison/Pause, actual held ArrowDown from an ordinary HUD button, actual pointer click on a grouped Build then Rooms radio while the key remains down, public minimap camera percentages unchanged for 300 ms before keyup, and a fresh held arrow still moves. Public movement and normal-release controls prevent a false pass from an unavailable camera. Focus membership and focus destination are read from public DOM only; no private scene/adapter/worker state or synthetic input dispatch. The existing network-evidence fixture remains active; no retry wrapper is invoked.

Exact recipe for the root-owned acceptance after building the integrated subject:

```powershell
$env:LOCKSTATE_WORLD_ROVING_NATIVE='1'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='5365' # root assigns its sole owned port
& ./node_modules/.bin/playwright.cmd test --config docs/research/2026-10-03-world-roving-native-prep/playwright.native.config.ts
```

The config inherits the real Cloudflare artifact server and `reuseExistingServer:false`; it must own that port rather than attach to an existing server. It preserves timeout 60 s, expect 10 s, retries 0 and workers 1. No production/development suite matcher or workflow is changed. The `.native.ts` is outside the normal browser test directory and enters collection only through this explicit opt-in config. `--list` collects without launching its server/browser.

Each original assertion remains strict. JSON observations and screenshots are written before the held-stop assertion, so a failure retains actual initial/moving/focused/held geometry. Required production negative: omit only World's new `releaseCodes` call, rebuild the exact subject and obtain RED at the stop assertion; restore exact bytes, rebuild and obtain GREEN. Root must retain compiled/source subject, reports and output hashes. This step is pending; existing source-only RED/3-GREEN evidence is in the preceding record and is not native acceptance.

Weakest claim: selectors and public flow are prepared from existing genuine Oblique recipes and current production source; this World native recipe has not executed. No new duplicate Issue or deployment claim.

Preparation verification: strict own TypeScript exit 0, canonical research index 5/5 GREEN, explicit `--list` collection 1 case/1 file exit 0. Initial collection correctly refused a missing production artifact; after a real isolated Cloudflare production build (exit 0/output verifier GREEN), collection succeeded. Neither collection nor build launched a browser/server. Raw collection/build logs are retained here; native acceptance is still pending.
