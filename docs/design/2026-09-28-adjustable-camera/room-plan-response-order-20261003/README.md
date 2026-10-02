# Room-plan response order audit — 2026-10-03

Base `0c0efe4f6c542d38e49e1df67492eda2237579ec`, separate worktree. Root owns native browser/integration. **The existing production code is correct in this audited boundary; no Issue or permanent source fix.**

## Actual callback coverage

`ui-room-plan-preview-response-order.test.ts` executes the actual bridge, RoomTemplateTool, LiveRendererSelection and unchanged main renderer deactivate/changed/command-submit callback bodies. DOM, engine scene hosting and asynchronous worker destinations are test doubles; Phaser projection and a real simulation worker/browser are not claimed here.

64 preview cases cover rotation, mirror, physical origin movement and replacement card, both initial renderer modes, unchanged/replaced renderer, accepted/refused current verdict and both answer orders. Old preflight and quote are independently deferred. Before the current answer, the current ghost stays checking with no borrowed old quote/verdict. After it, the full footprint's four corners per square, current request/orientation, cost and collision marking remain unchanged when the old answer completes. Accepted current mouse click submits exactly its selected request; refusal submits none. A removed old bridge never publishes into its disposed DOM. Expected dimensions are independently fixed at 4×7, rotated 7×4, and Yard 8×8.

12 additional purchase cases hold the actual purchase preflight, change rotation/mirror (or retain the same choice), then replace the renderer in either direction. Accepted superseded orientation submits no old request and cannot cancel the new tool. A fresh click then submits the selected orientation exactly once. Refused old requests also leave the current clear preview/quote intact. The unchanged accepted intent still submits once and stands down, preserving #1908's accepted-receipt contract. Physical hover-origin changes do not retroactively cancel an explicitly clicked unchanged intent; no new cancellation rule is introduced.

## Results and meaningful producer negatives

All runs use the existing Vitest configuration and `--maxWorkers=2`; no timeout/retry changes.

| Run | Result | Runner duration |
| --- | --- | --- |
| Initial replacement-only baseline | 32 passed | 349 ms |
| Final expanded baseline | 76 passed | 495 ms |
| Unique preview-result guard weakened to armed-only | 32 failed / 44 legal controls passed | 494 ms |
| Exact preview source restored | 76 passed | 460 ms |
| Unique purchase revision guard disabled | 4 failed / 72 legal controls passed | 473 ms |
| Exact tool source restored | 76 passed | 538 ms |

The first negative concretely overwrites the current quote with 111 instead of 222, exposes old clear/blocked state during current checking, or changes current collision colors in the unchanged-renderer cases. Replacement cases remain legal controls because the removed bridge's paint loop also prevents DOM publication. The second negative submits the old accepted rotation/mirror request after selection changed; refused/unchanged and preview controls remain green. These are temporary mutations, not defects in current production.

`mutation-receipts.json` records the exact unique strings and byte-restored hashes. Both sources were restored in `finally` and verified byte-for-byte. Final app and tools TypeScript checks pass. No permanent production diff remains. No new production build or native run is claimed for this test-only audit.

## Deduplication and harness boundary

Fresh remote search `room template preflight revision` and full Issues #1934 and #1912 were read; #1908 was freshly read in the preceding receipt scope on this branch ancestry. This audit supplements #1934 numeric status, #1912 invalid-coordinate quote, #1908 accepted receipt and the existing native orientation race; none is reopened or duplicated.

The initial 32 harness failures are excluded from product evidence: Node EventTarget did not remove its true-capture listener using the DOM boolean shorthand. The DOM destination normalizes boolean capture listener options to objects for faithful removal. Once corrected, the unchanged production baseline passed. The retained native `room-template-renderer-preflight-receipt.spec.ts` and `room-template-world-camera-origin.spec.ts` remain queued under the parent's exclusive browser schedule; they were not run here.
