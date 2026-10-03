# Two remaining Full HD camera preconditions

This is a test consumer repair on `873093cae87312d2fb76f9c540f61374bbef2c8d`.
There is no permanent production change and no new product Issue. Native
acceptance of the revised cases is **pending the coordinator's browser slot**.

## Original evidence

Frozen [PR1899 run37039088544](https://github.com/woogitsu/lockstate/actions/runs/37039088544)
used source `3eeeddc2d276714fee6a7c8420270b78d2e49b3c`. It was cancelled at
90 minutes: 887 declared, 330 passed, 38 failed, four serial cases did not run.
This audit does not reinterpret that cancelled prefix as suite completion.

[Artifact11245699264](https://github.com/woogitsu/lockstate/actions/runs/37039088544/artifacts/11245699264)
was downloaded once into this agent's separate scratch. Its 340342933 bytes
match SHA256 `fa52ba78533bcea17dc34c14ae61647e2b56c059694b6ca23036c8efccb2efad`.
Only the two Full HD camera traces were opened. Their original error contexts,
exact API operations and native minimap nodes are retained beside this note;
[receipt.json](./receipt.json) records each trace hash. Snapshot compression
references are not guessed or reconstructed into new measurements.

| Original failure | Independent native observation in the same trace |
| --- | --- |
| Held-arrow spec64: expected unequal map PNGs, received equal, before transferring focus to a radio | During the second screenshot, minimap top changes from **5.51475%** (`after@call@244`,4147132.626) to **9.421%** (`after@call@246`,4149184.166); its clipped width/height change from94.4853% to90.579%. ArrowDown was delivered at4145052.524. The camera did move. |
| New-prison spec20: outline remained visible after releasing the keys and waiting10s | Before keys, top2.38975%. After the fixed5500ms wait, top22.5567%; after key-up, top24.719%, height75.281%. The final10s assertion has the **same** style. The camera moved, still intersected the map, and stopped when released. |

The held-arrow trace stores screenshot return values only as `<Buffer>`;
neither failing case attached the ROI PNG bytes. Equal bytes are established
by the original assertion, not by a new image inspection. The trace therefore
does not establish why that particular image region stayed equal. Likewise,
software-WebGL warnings and slow API timings do not alone prove a performance
cause. The ordinary HUD-button arrow control in the sibling case passed in
the same CI run (50.2s). The pertinent keyboard, scene and HUD producers are
unchanged between3ee and873.

## Consumer correction

- Held-arrow: establish real motion from the independent minimap outline's
  four published CSS percentages. Then transfer focus and preserve the
  **byte-exact map PNG stop guard** over300ms; also require the independent
  outline to stay exactly still. Initial/moving outline values and the PNG
  equality observation are attached for future native runs. Missing or invalid
  percentages fail instead of returning plausible zeroes. A collapsed minimap
  keeps publishing its camera outline; visibility is not used as a movement
  oracle here.
- New prison: keep the physical keys held until the outline actually has no
  map intersection, within the **original10s visibility assertion budget**;
  release both in `finally`. Remove the fixed5500ms hold followed by10s with
  no possible further movement. Preserve the later New prison keyboard action,
  two-save count, visible new outline and both full-screen screenshot captures.

No60s test limit,10s assertion limit,300ms stop interval, retry, network
signature, worker count or configuration was increased. This change does not
claim that a slow renderer will necessarily reach off-map within10s: the
revised physical native case must still prove that condition. It does not
weaken it or infer it from the new-prison result.

## Offline falsification

`tests/unit/oblique-camera-minimap-preconditions.test.ts` passes **7/7**.
Five controls parse the original native motion and reject missing/invalid
observations. Two cases run actual registered scene keydown/focusin/keyup
callbacks, actual pose update and actual minimap publication at1920×1080,
with16ms/240ms deltas. Their expected displacement solves the view plane
independently. World storage and projection are real; Phaser hosting, art work
and ambient focus are doubled. These controls prove source behavior, not
browser painting or native acceptance.

Sequential temporary mutations of the actual scene, each at exactly one site:

1. Set the vertical keyboard pan producer to zero: **2 RED,5 legal controls
   GREEN**, then byte-exact restoration **7 GREEN**.
2. Omit the radio focus physical-arrow release: **2 RED,5 legal controls
   GREEN**, then byte-exact restoration **7 GREEN**.

All runs used maxWorkers2 and the original5s unit budgets. The restored source
hash is `93c22b2d5822aaa4e82c2f476496f2121968199648bc6591f03427f58aa27acb`.
Raw outputs and [source-mutations.json](./source-mutations.json) are retained.
Strict standalone TypeScript checking of all four changed test/helper files
passes. The first harness attempt compared mathematically unchanged floating
dimensions with Object.is and failed on0.9522050858899106 versus
0.9522050858899107; that was corrected to10-digit geometric precision before
the baseline and is not counted as a product failure.

No browser, preview server, remote CI retry, workflow, deployment, save format
or player copy was changed by this audit. Queue the two existing spec files
(three native cases total) for the coordinator's one-worker acceptance, then
record the exact native result before claiming release completion.
