# Actual opt-in native demand-loading run (#2018)

## Exact subject and result

**One run, 2 GREEN / 1 RED, no retry or second browser launch.**
The real production client was compiled at
`3d454c2872fb6b777cd9afc2cc13c286bf8346ef` before importing the fixture.
Harness checkpoint: `2ee81027e7843f2968143be74a2b2f4c145d0919`.
Production source diff is empty. Port 5365 belonged to this run; launcher PID
12976 and its observed descendant PIDs are recorded in [launch](./launch.json)
and [process tree](./own-process-tree.json). After terminal completion, all those
PIDs and the port listener were absent; the browser lease was released to root.

- Empty public New/Pause and stable profile: **GREEN, 34.6 seconds**.
- Genuine public Storage/Delivery completion: **GREEN, 41.7 seconds**.
- Genuine public Cell, camera turn and Save/Load: **RED, 39.0 seconds**, at the
  final test-observer script-body read after all gameplay/image guards.
- Terminal total: **2.0 minutes**. [Unedited stdout](./native-stdout.txt),
  [stderr](./native-stderr.txt), [original error context](./actual-run/cot/error-context.md).

Budgets remain 60 seconds/test, 10 seconds/expectation, one worker, zero retries.
This is actual built-game/public-input evidence, **not hardware-GPU acceptance**.

## Genuine PNG demand, separated from HUD thumbnails

| Stage | Actual loader PNG Blob decodes | Raw XHR PNG requests | Raw image-element requests | Terminal 200 XHR PNG bodies | Terminal 200 image PNG bodies |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty | 17 | 17 | 40 | 17 | 20 |
| Capacity | 23 | 26 | 40 | 23 | 20 |
| Cell/camera/Load | 29 | 35 | 40 | 29 | 20 |

The 17 empty decodes are 17 distinct frozen floor/terrain hashes; **zero unrelated
model Blob decodes**. Empty total raw PNG requests are **57**, not zero. The HUD
uses direct image URLs separately; not every raw request produced a terminal
body, so the 40 image requests are not claimed as 40 successful downloads.
All captured terminal PNG bodies were actual PNGs and matched frozen disk bytes;
all three stage asset-error lists are empty. The existing floor batch remains
eager. [Actual summary](./actual-measurement-summary.json) and raw receipts retain
URLs, hashes, dimensions, redirects, decoded images and original observations.

The own checkout and frozen build both contained **9149 real PNGs, zero pointers**.
[Hydration inventory](./runtime-png-hydration.json) and
[frozen PNG/JavaScript inventory](./frozen-runtime-files.json) contain full hashes.
No root dist directory was read as the tested subject or modified.

## Real game and image evidence before the final observer failure

The player purchased Storage at 5,5, Delivery at 12,5 and Basic cell at 20,5.
Construction completed through public speed controls. The paused physical cot
was at 21,6, orientation 0, with its exact completed source order and
`placementSequence`; whole paused worker snapshots before/after Load matched.
Public camera-right changed −45° to −30°, and the actual loader decoded both
independently expected 300°/40° and 330°/40° cot PNGs. Their terminal response
bytes matched their catalog hashes. No private bound texture was observed.

The original calibrated blanket guard measured **1214 pixels before Save/Load
and 1214 after returning to the original pose**, above its unchanged >700 floor.
All four original Cell screenshots exist:

- [Original calibrated pose](./actual-run/cot/actual-q0-cot-original-calibrated-fullhd.png).
- [Actual turned pose](./actual-run/cot/actual-turned-cot-pending-root-calibration-fullhd.png).
- [Loaded turned pose](./actual-run/cot/actual-loaded-turned-cot-pending-root-calibration-fullhd.png).
- [Loaded original calibrated pose](./actual-run/cot/actual-loaded-original-cot-calibrated-fullhd.png).

The actual turned screenshot was opened and visually inspected: the completed
cot is visibly drawn. A new turned-pose pixel threshold remains **pending root
calibration**. These partial guards do not turn the final RED into an overall
native pass. The receipt's `complete` remains false. The final live-worker
snapshot still succeeded after the observer error.

## Observer lifetime error and bounded correction

The original helper retained Playwright Response objects and waited until the
end to call `response.body()`. A genuine public Load ends the outgoing worker
and claims a new worker, as recorded by the current WorkerPerSessionHost and
main composition. The final deferred body read therefore crossed that lifetime
boundary and reported `Target page, context or browser has been closed`.

The original failing assertion did **not record which Response URL failed**;
that exact handle cannot retrospectively be named. Completed earlier stages
did observe and match these actual served script URLs/hashes:

| Served script | SHA256 |
| --- | --- |
| `/assets/catalog-DwDh8vBS.js` | `c2561fbc63fb3c411b80a7ff7a122f8684ef76cd73d4d3b32d2651046260f4c1` |
| `/assets/index-vjgBnSFJ.js` | `5f4a543039b56ba0be89d1176ff22d7d4294acff2774de0bfc06cc48605085e1` |
| `/assets/worker-80vzclKC.js` | `8ec0d3b3aa48fdb6e0fc16e7440499df0cc43c9d866e932a021391bba3ea0954` |

This identifies the genuine worker bundle, not the missing failing-handle URL.
No final Cell served-script equality is claimed. The immutable original observer
is [archived as a Git blob](./original-observer-git-blob.ts.txt),
`git-blob=d4becf7da4c2edd5d3897d397efa0ee5c2923356`; this is not a claim about
unrecorded original physical CRLF bytes.

The corrected test helper reads actual delivered JS bodies at each legal 200
response, before worker termination, and stores URL/status/resource type/hash.
It still checks actual response bytes against the frozen client. Failure retains
the actual URL; there is no disk-only substitute. All original PNG, owner,
whole Save/Load, pixel and timing guards are unchanged. **No corrected native
rerun occurred.** Two pure observer-port controls passed: retained real-body
data survives simulated port closure; changed delivered bytes are rejected
with their URL. Those controls are harness checks, not native gameplay evidence.
Corrected strict app types exit 0.

## Observed profile and limits

HeadlessChrome 141.0.7390.37 reported ANGLE Vulkan **SwiftShader/SwANGLE**, a
software graphics environment. No GPU flag or executable override was added.
During the stable 30-second paused sample there were **zero CDP network events**.
Measured metric deltas: TaskDuration **30.131565 seconds**, ScriptDuration
**1.473816 seconds**, LayoutDuration **0.111937 seconds**, RecalcStyleDuration
**0.218623 seconds**, 1001 layouts and 1002 style recalculations. Heap-used delta
was 1,553,020 bytes, not a retained-memory measurement.

The largest CPU sampling bucket was `(program)`, 28.635009 seconds sampled self
time. That bucket does not identify a shader, renderer function or specific
architecture cause. Page sampling excludes separate worker CPU and GPU work.
No hosted-CI cause, hardware latency or before/after improvement is inferred.

Observed public-action elapsed times include Playwright actionability and
browser/transport work: New **192.4 ms**, Pause **412.3 ms**, one camera-right
press **743.7 ms**. They are not isolated event-handler costs. Actual capacity
queue completion measured **31.604 seconds**; Cell queue **17.481 seconds**.
[Raw empty profile/metrics](./actual-run/empty/oblique-demand-native-receipt.json)
and [executed summary reader](./executed-summary.cjs.txt) are retained.

## Retention

[Raw file manifest](./actual-run-file-manifest.json) maps all ten original output
files to shorter archival paths with verified byte SHA equality. The first
long-path copy was incomplete under Windows; originals remained intact and a
verified complete copy was made. The redundant partial copy was retained in own
TEMP rather than removed after automatic removal review rejected deletion.
No failed evidence was replaced. Corrected execution requires a new explicit
bounded lease; it will be reported separately from this original 2 GREEN / 1 RED.
