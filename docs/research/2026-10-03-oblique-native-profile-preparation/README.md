# Opt-in paused Angled native profile preparation

This is a manually selected diagnostic fixture, **not a shared CI gate**. It is prepared from published minimap checkpoint `deeb1431b7e48feaa56beb39af4c8946c8f51d86`. No browser, server or build was launched during preparation.

## Actual public route and measurement

The fixture opens the built application at physical Full HD 1920×1080 with `?renderer=oblique`, clicks public New prison, confirms day 1, and clicks public Pause. It verifies the selected View, paused control and visible canvas. It observes a fixed 30-second paused window using CDP page CPU sampling at 1,000 µs and Performance metrics. It then separately samples real Pause and Build clicks, recording elapsed action timings. No state, worker reply, renderer feed or command is replaced.

The receipt retains browser version, actual GPU/system information, complete page CPU profiles, Performance metric snapshots and actual asset network response/status/encoded-byte events. It independently hashes delivered JavaScript, including observable worker URLs, against the supplied frozen compiled client directory. The visible build stamp must match the supplied full production SHA. Body reading/hashing occurs after profiling so it is not charged to the stable renderer window. An incomplete receipt is retained if a later assertion fails.

The production renderer revision and bound texture are not publicly exposed here and are **not inferred**. Page CPU sampling does not measure GPU execution or the separate worker's CPU. System information identifies hardware but is not GPU timing. Local measurements must not be presented as hosted-CI causes.

## Explicit invocation after coordinator grants the browser

Use a detached, immutable production subject with its actual build already frozen. Copy only these diagnostic files into that subject; do not change production sources. Keep the existing artifact server, one worker, 60-second test budget and 10-second assertion budget. The opt-in config only selects this `.profile.ts` fixture and inherits all server/budget settings from the existing artifact config. Normal source/artifact `.spec.ts` inventories do not match it.

PowerShell recipe, on the actual subject's own checkout:

```powershell
$env:LOCKSTATE_NATIVE_PROFILE='1'
$env:LOCKSTATE_PROFILE_PRODUCTION_SHA='<actual full frozen production commit>'
$env:LOCKSTATE_PROFILE_BUILD_DIR='<absolute compiled client directory: dist/client or dist>'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='<coordinator assigned free port>'
& '<actual Node executable>' node_modules/@playwright/test/cli.js test --config tests/browser/oblique-paused-native.profile.config.ts --workers=1
```

Capture `native-paused-profile.json` from the test output directory and retain the original terminal output. The recipe does not rebuild its subject, retry a failed run or raise a timeout. Preserve failures as failures.

For a before/after comparison, freeze separately the exact production source and compiled bytes before minimap reuse and after it. Use identical browser binary, hardware, public actions, viewport, settings, sampling interval and inherited budgets. The observed build stamp and delivered-script hashes must pass on both subjects. A missing frozen build or mismatched script invalidates the comparison. No before/after execution or performance result is claimed here.

## Preparation gates and limitations

Application and tools strict types both passed. The actual collection attempt correctly failed at the existing artifact guard because this new isolated checkout has no frozen compiled build. That original output is retained; no dummy index, substituted build or guard bypass was used. Native execution, real profile contents and latency conclusions remain pending the coordinator's exclusive browser lease and frozen subject. This preparation has no producer-negative or acceptance claim.
