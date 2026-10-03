# Prepared native acceptance: dedicated camera pan

Prepared on 2026-10-03 from clean `7ad3df62304a28c4366a90745dced399297e27f1` for existing approved PR [1590](https://github.com/woogitsu/lockstate/pull/1590).

## Scope and current state

Only the new `tests/browser/dedicated-camera-pan-player.spec.ts` and this receipt are changed. Production, browser matcher/configuration, workflow, labels, budgets and retries are unchanged. No browser or preview server was launched. **Native acceptance and production mutation/restoration of this fixture remain queued with root.** This is preparation, not a browser PASS or a new defect report.

The four collected cases are World and Angled at accessibility UI scale 100% and 200%. Each keeps the physical CSS viewport 1920?1080 and asserts `visualViewport.scale === 1`; 200% UI scale is not page zoom. The inherited fixture retains the network-change observer, 60 s test budget, 10 s assertion budget, zero retries, one worker and `fullyParallel: false`.

## Actual consumer assertions awaiting the browser

- Four real accessible buttons, each visible/enabled, physically inside the viewport, at least the existing 44/88 px target, and independently centre-hit-tested with `elementFromPoint`. Physical integer coordinates receive native mouse clicks; capture records trusted click direction, coordinate and pointer detail.
- Independent public minimap ground movement and reversal. Existing narrow pre-setter observation avoids Chromium percentage serialization rounding; CSS readback is retained separately. Measurements must be strictly unclipped. World uses actual public ground bounds. Angled uses the supported fresh ?45? yaw/45? elevation, derives zoom independently from the public AABB, then solves a 2?2 screen basis for a correctly directed 128 CSS px step. No expected value comes from the ghost, main forward callback or a scene reference. Precision remains 3 and movement error below 0.0005 ground units.
- No worker command during camera-button navigation. Requests/replies are observed and forwarded unchanged, without fake state/verdicts, worker delays or replacement scene data.
- World Yard (64 squares) and Angled Basic cell (28 squares) are keyboard-armed from actual retained canvas hover. Moving the physical pointer into HUD intentionally withdraws the plan hover, so this phase uses native Enter on the same four controls while the mouse stays on canvas. World repicks through camera movement and returns to the independently calculated original origin after reverse steps. The Angled case must demonstrate a real full-footprint fit, then retain its fitted origin. All steps preserve the actual worker-approved plan, entire polygon count and catalogue quote, with no purchase.
- After reversal all occupied polygons must be within the accepted map area. Stationary native pointer down/up confirms exactly one `PlaceRoomTemplate` at the displayed origin, without a changed quote or extra building command. Worker preflight must be genuinely accepted; this does not claim completed construction or delivery.

## Offline receipts

- Strict TypeScript check of the new fixture: exit 0.
- Existing config collection only: exactly 4 cases in this one file; collection starts no browser/server.
- Existing actual pan consumer suites: **61/61 GREEN**, `maxWorkers=2`. Their previously recorded five source negatives are in `../2026-10-03-camera-pan-backlog-gap/`; they are not a native mutation of this newly prepared fixture.
- Independent reference arithmetic: **48/48 GREEN**. The reproducible receipt extracts the three exact reference functions from the fixture, constructs all four ground corners independently, checks inverse steps reproject to 128 CSS px, and includes World cursor-origin controls with viewport offset and logical/CSS ratios 1/2 at zoom 0.5/1.25/3. Synthetic unclamped stress bounds are arithmetic only; native checks reject clipped bounds.
- Production build: exit 0, including app/tools TypeScript and verified Cloudflare static output. This build neither deploys nor starts a server.

Raw logs, commands/exit codes and reference cases are retained beside this file. The initial offline arithmetic runner failed because TypeScript 7 exposes version metadata rather than its earlier compiler API; that harness setup failure is preserved and was corrected using Node's type stripper. It is not a product failure. Shared research-index and canonical artifact routing are left for root integration. Root can make a meaningful main pan-callback no-op negative, rebuild unchanged assertions, retain four expected movement failures, then restore exact bytes and run the four corrected cases at the existing limits.
