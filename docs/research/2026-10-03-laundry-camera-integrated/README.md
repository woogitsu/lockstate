# Root combined Laundry and camera acceptance — 2026-10-03

Integration branch: `codex/integrate-laundry-renderer-20261002`, checkpoint
`4b5e06b4d279260318d34a7dd604bd46c6e9435f`. These are fresh root native results,
separate from the earlier individual-agent runs. Canonical artifact routing,
one browser worker, original case/expectation budgets and retry policy are used.

The actual client is the production build made at `13a6c582e6`; subsequent
changes are tests and documentation only. Worker `worker-Bjll0lxr.js` SHA-256
`4af958b3cdd115f8b60771c9308f9ca105aab7d2aa25176eea316d5f3f344347`
was read from the served build. Client `index-CC0PWSiU.js`, CSS
`index-BtHvjcB7.css`. No simulation state or renderer is replaced.

## Actual seven-case run

| Native case | Result / duration |
| --- | --- |
| Horizontal wheel, fixed view | GREEN /7.2s |
| Horizontal wheel, angled view | GREEN /10.1s |
| Actual capacity construction before Laundry | GREEN /42.5s |
| Laundry quarter turn0, worker completion and Save/Load | GREEN /38.3s |
| Laundry quarter turn1, worker completion and Save/Load | GREEN /38.5s |
| Middle-button camera exit through HUD and reentry | GREEN /8.9s |
| Right-button camera exit through HUD and reentry | GREEN /8.8s |

[Complete terminal output](native-seven-cases.txt):7 passed in2.6minutes.
Horizontal samples preserve the actual camera/minimap, armed whole-square quote
and empty worker command delta; vertical and diagonal controls still zoom.
Canvas-exit cases retain exact map PNG bytes on reentry, unchanged minimap and
zero commands; a fresh camera press still moves the map.

The two Laundry machines retain different exact V8 source-order owners,
completed owning orders, literal physical anchors and orientation after genuine
IndexedDB Save/Load. Quarter turn0 uses(21,6)/(23,6), orientation0; quarter turn1
uses(24,6)/(24,8), orientation1. Native glass pixels before/after Load are
[827,833]/[827,833] and[1519,1523]/[1519,1523], respectively. No tolerances or
palette thresholds changed for this combined run.

- [Quarter turn0 owner/worker/pixel evidence](laundry-q0.json), [loaded PNG](laundry-q0-loaded-fullhd.png).
- [Quarter turn1 owner/worker/pixel evidence](laundry-q1.json), [loaded PNG](laundry-q1-loaded-fullhd.png).
- [Middle input event/minimap/command evidence](middle-events.json).
- [Right input event/minimap/command evidence](right-events.json).
- [Fixed horizontal wheel capture](world-horizontal-wheel-fullhd.png), [angled capture](oblique-horizontal-wheel-fullhd.png).

The rotated loaded Laundry PNG was opened by root. The original model/PNG,
wheel and camera-exit production mutation negatives are retained in the upstream
records already included in this branch; this combined run is additional
integration acceptance, not a new claim of repeated negative executions.

The native process is terminal and port5416 has no listener. Browser ownership
was explicitly handed to Art for separate Bin/Cell/Utility acceptance. Full
exact-subject hosted CI, serial main acceptance, merge and production release
remain outstanding; these seven cases do not stand in for the full suite.

## Approved vocabulary integration gates, 2026-10-03

The #1975 owner-approved ownership refusal adds the 49th protocol reason and
matching EN/PL alert keys. The inherited count gate still expected48, and the
committed player-string inventory predated the new sentence. The original
focused run failed2 tests with14 controls passing. The inventory is generated
with `pnpm content:player-strings` (596 authored sentences), not hand-edited.
The dated rollout measurements remain intact; its new current-vocabulary note
and all three explicit count guards now record49. Exact suffix-set comparisons
and every other enumeration assertion remain unchanged.

Actual production negative: misspell only the new English catalogue key
`object-ownership-unknown` as `object-ownership-unknwon`. Both current inventory
and exact reason-key enumeration fail: [full terminal receipt](approved-vocabulary-negative.txt),
2 RED/14 controls GREEN in1.38s. The entire source file is restored byte-for-byte,
SHA256 `861675e1f9ee03c50e2fb5047d6d9fa7aae1d916f078108b8a20e32373ce069f`.
The identical focused run then passes16/16 in1.33s. This is a catalogue/gate
integration repair; no player words or refusal semantics change.