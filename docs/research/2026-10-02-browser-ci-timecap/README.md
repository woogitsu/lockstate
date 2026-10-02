# First full-template candidate: browser time cap and retained failures

Recorded 2026-10-02 against immutable candidate `3eeeddc2d276714fee6a7c8420270b78d2e49b3c`.

## Exact terminal evidence

[Run 37039088544](https://github.com/woogitsu/lockstate/actions/runs/37039088544),
[browser job 110949744645](https://github.com/woogitsu/lockstate/actions/runs/37039088544/job/110949744645),
ended cancelled at **18:56:59Z**. Its annotation says **?The job has exceeded the maximum execution time of 1h30m0s?** followed by **?The operation was canceled.?** This is a known terminal log investigation, not a rerun or a polling record.

The browser step ran **17:29:28?18:56:33Z (87m05s)**. Setup before it took3m16s; LFS accounted for2m36s, and Vite reported ready in262ms. The suite announced **887 tests, one worker**. The log contains **372 completed reports:330 passed,38 failed,4 did not run**. The earlier informal40-failure estimate was wrong;38 retained traces and38 distinct failed reports agree. Production build and built-client tests were skipped after cancellation.

The last completed report was number372, `tests/browser/playtest-harness-arm-buildable.spec.ts:245:3`, ?press refuses a placement that is not what the panel was last asked for?, at **18:56:22.7668052Z (6.0s)**. The log does not identify the next active test with a terminal report; this record makes no claim about which unfinished case was running at cancellation.

[Retained failure artifact11245699264](https://github.com/woogitsu/lockstate/actions/runs/37039088544/artifacts/11245699264) is named `browser-failure-37039088544-1`,340342933bytes, archive SHA256 `fa52ba78533bcea17dc34c14ae61647e2b56c059694b6ca23036c8efccb2efad`. The downloaded archive has38 traces,80 directories and138 files. It contains no `.last-run.json`; a failed-test retry set cannot be inferred from that missing file.

## Complete failure inventory

[failures.json](./failures.json) records all38 artifact folders, original trace errors and original CI stack coordinates. Coordinates belong to the immutable candidate above, not a later integrated source. Classifications separate a measured assertion/setup failure from an unproven production cause. No failure is dismissed as flaky.

| Count | Observed boundary / diagnosis |
| --- | --- |
| 6 | legacy edge Build setup incompatible with square controls (verified failure; fix not exercised) |
| 5 | HUD hit-test obstruction (actual geometry failure; production cause not yet isolated) |
| 2 | HUD exact geometry budget (actual measurement mismatch; source decision requires review) |
| 2 | stale Category selector (verified) |
| 7 | test timeout/pixel or screenshot work (trace operation observed; performance cause not proven) |
| 5 | construction bootstrap/completion timeout (progress observed; no permanent stall diagnosis) |
| 1 | stale exact target caption versus approved dimension caption (verified trace) |
| 1 | fixed renderer camera visibility assertion (actual mismatch; source decision requires review) |
| 3 | HUD exact geometry budget (+44px; source cause not yet isolated) |
| 3 | stale harness private-map key (verified source cause; actual image texture key pending browser) |
| 1 | minimap visibility invariant failure (cause not yet isolated) |
| 1 | held-arrow precondition not observed (cause not yet isolated) |
| 1 | room ghost/floor-pick invariant failure (cause not yet isolated) |

The six legacy-edge setup cases fail before exercising their intended zoning/room assertions. The two Category cases fail because `.hud-build__category` matches both View and Category. The three art cases first see an image, then obtain `undefined` from a private map keyed by catalog ID; the renderer now keys that map by item identity (`structure:art-qa` for this harness). Their expected authored image keys remain present in the catalogs. A consumer correction must read the actual image's texture key while retaining image-count, fallback, scale and expected-key assertions.

The remaining groups are measured failures requiring their own diagnosis. In particular, construction progress polls do not prove a permanent worker stall, screenshots timing out do not prove the screenshot itself consumed the entire test, and layout/hit-test failures are not grounds to enlarge budgets or change assertions.

## Measured performance boundary

The known successful [main run37032274976](https://github.com/woogitsu/lockstate/actions/runs/37032274976),
[browser job110924601837](https://github.com/woogitsu/lockstate/actions/runs/37032274976/job/110924601837),
was read once for comparison. Its exact head was `6a90178dac330b43b8e2a8612d8dff160f2d380f05d`. Its source browser step took **16:20:57?17:45:33Z (84m36s)** for **766 passed source cases**, followed by two built-artifact cases in14.9s. The candidate declares121 additional source cases. Main itself was already close to the job cap. A partially completed candidate prefix does not establish total suite runtime or test selection safety.

The candidate's reported completed-test durations sum approximately85m25s (rounded log durations); elapsed browser time is87m05s. The65 timed app-shell reports account for1080.9s. On successful main, five existing app-shell keyboard flows take144s,162s,210s,126s and168s respectively. A candidate common-room completion pass takes150s. These are real elapsed test costs, not proof of a particular CPU bottleneck.

One retained authored-actor trace measures **26.6086s** inside `Frame.evaluateExpression` for PNG comparison. The enclosing `Test.pw:api` operation takes27.0167s and must not be counted again. That test converts captured Full HD PNG buffers into base64 data URLs, fetches/decodes them and reads canvas pixels inside the rendering browser. A concrete runner-side optimization candidate is to decode and compare those exact captured PNG buffers in Node, preserving every region, pixel threshold and screenshot assertion. It has **not** been implemented or benchmarked here. Other retained clicks take roughly3s and Load clicks roughly11s; those observations alone do not establish a rendering or tracing regression.

## Scoped next work and limits

First repair the verified stale Category selector and art-harness reader in an isolated branch. The Category consumer must target the labelled Category combobox and measure its actual catalogue control. The art consumer must observe the rendered image's texture key. Actual browser baseline and restored runs remain necessary before either correction is reported as verified.

The remaining legacy setup, geometry, hit-test, camera, construction and image-comparison cases require distinct evidence. This diagnostic changes no workflow, retries, timeout, worker count, thresholds, production renderer, game state, schema or pricing. It does not establish a complete passing candidate or permission to merge.
