# Garbage Room q0/q1 public native preparation

2026-10-03. Own branch `codex/garbage-room-native-preparation-20261003`, base
`59b5fbb02bdb5c112f41abe0cb74bf4eb69fc3b9` (the genuine model/export checkpoint).
**Preparation only: no browser, server, new Blender render or native pass.**

## Literal playable layouts and budgets

Every construction in the kernel proof used the ordinary public typed
`PlaceRoomTemplate` command, real procurement and the actual builder. No stock,
treasury, placed objects or snapshots were injected. Independent literal
expectations live in `tests/fixtures/native-garbage-room-plan.ts`.

| Public plan | Origin/orientation | Ordered work | Debit/balance | Actual elapsed kernel ticks |
| --- | --- | --- | --- | --- |
| Storage Room | (12,18), q0, 5×5 | 18 orders | 1395 / 23605 | 1251 |
| Delivery Bay | (20,18), q0, 6×6 | 21 orders; cumulative39 | 1780 / 21825 | 1520 |
| Garbage Room | (4,4), q0 or q1, 4×4 | 11 square walls +1 door +2 bins; cumulative53 | 1025 / 20800 | 1020 |

Each complete independent route costs **4200 of 25000**, consumes **92 bricks
and 8 wood planks**, and takes 3791 directly stepped kernel ticks. The occupied
plans are disjoint and within the owned 32×32 parcel. The native recipe keeps
the existing public bootstrap's two simultaneous paused UI submissions;
the kernel record measures sequential completed plans and does not claim a
browser duration or identical native tick count.

Garbage Room interior is `(5,5)` with width2/height2 in both orientations.
The original 1×1 object footprint remains 1×1 after rotation. q0 bin anchors are
`(5,5), (6,5)` with orientation0; q1 anchors are `(6,5), (6,6)` with orientation1.
Literal source owners are
`room-template-000000000002-2-object-000` and
`room-template-000000000002-2-object-001`; both placed owners and completed
construction owners are checked separately.

All eleven square-wall order anchors, in source-owner order, are pinned:

- q0: `(4,4),(5,4),(6,4),(7,4),(4,5),(7,5),(4,6),(7,6),(4,7),(6,7),(7,7)`.
- q1: `(7,4),(7,5),(7,6),(7,7),(6,4),(6,7),(5,4),(5,7),(4,4),(4,6),(4,7)`.

q0 door order is north edge `(5,7)`; q1 is west edge `(5,5)` representing the
open doorway square `(4,5)`. Its literal owner is
`room-template-000000000002-1-door-000`; the wall IDs retain ordinal000..010.
The public room projection reports 3 rooms, no occupants/cell capacity,
Garbage Room access `doorway`, waste-disposal capacity2/in-use0 and no missing
object capability. Two non-object requirements remain `notEvaluated`, as in the
existing projector; this is not a claim that the projector evaluated them.

## Actual typed producer RED → exact restore → GREEN

The existing typed `createRoomTemplateBuildPlan` producer in the own worktree
was temporarily changed to omit the actual `createBuildOrder` object-orientation
argument. The public q1 command still built the correct literal anchors, but
the actual placed bin owner000 had orientation0 instead of the independently
pinned orientation1. The q1 test went RED while q0 still passed. The producer
bytes were restored in `finally`; a fresh run passed **both** typed cases.

Each completed route creates a real V8 envelope, JSON roundtrips it through
the actual decoder and restores the runtime. The entire stopped snapshot
across every persisted subsystem is exact, rather than only the bin count.

[q0 complete route and whole V8 snapshots](./proof/actual-typed-q0-V8-roundtrip.json),
[q1 complete route and whole V8 snapshots](./proof/actual-typed-q1-V8-roundtrip.json),
[actual producer mutation/restoration receipt](./proof/actual-typed-producer-RED-exact-restore-GREEN.json),
[actual q1 orientation RED](./proof/actual-typed-order-orientation-omission-RED.log),
[exact restored q0/q1 V8 GREEN](./proof/exact-restored-typed-q0-q1-V8-GREEN.log).
`pnpm typecheck` passed. The model/source/provenance/descriptor/72 exported PNGs,
registry and entire object mapping remained byte/hash unchanged. No source-art
mutator or Blender process was started for this preparation.

## Opt-in genuine built-client recipe

`tests/browser/native-garbage-room.recipe.ts` is outside standard spec/playtest
collection. Its **three serial cases** preserve 60s per case, expect10s,
workers1/retries0; no `slow`, larger timeout or existing spec change.

1. Through public Room plans controls, build Storage Room and Delivery Bay,
   verify all39 completed owners/two completed templates, pause and use public
   `Save now`. Capture the resulting actual IndexedDB storage state.
2. A fresh q0 context consumes only that actual public save, uses public `Load`,
   verifies the entire paused bootstrap snapshot, builds the Garbage Room,
   checks the twelve queued shell owners and fourteen completed owners, pauses,
   frames the room and records full-HD/canvas screenshots before and after
   real public Save/Load. Whole stopped state and room projection must match.
3. Repeat q1 independently from the **same immutable capacity save**, with its
   own bins, wall order identities, west door edge and persisted orientation1.
   No completed q0 snapshot is planted into q1.

Progress is completed authoritative orders **plus** completed templates;
transient queue0 between shell and fixtures cannot pass. The probe sends only
existing snapshot/projection read requests; placement/speed/pause/camera/save
are public UI actions. There are no worker-command or snapshot injections.

The public minimap centers tile `(6,6)`. Existing camera math gives local source
yaw = camera yaw + quarterTurns90: seven Rotate-right clicks from initial-45
in q0, one click plus object90 in q1, both select source60/elevation40 under the
existing canonical nearest-angle selection. No private renderer pose is set.

`tests/browser/native-garbage-room-evidence.ts` observes **actual renderer
network traffic**, descriptor/source identity, terminal200 PNG body and actual
loader HTMLImageElement/Blob decode. It records redirects and the real built
worker body hash; it never performs a synthetic fetch to satisfy the observer.
Source pin:
`5d9cafee94af08098b045e389b642ec655536fe0cc8aae8b5e026822f7d984cc`.
Expected actual local60/elev40 frame:
`/assets/environment/oblique/fixture.garbage-room.waste-bin-yaw+60-elev40.a573c065a873.png`,
full body SHA256
`a573c065a8733517712fdbecd752a47599b407cd1dcd0847a9fc00470cb9e348`.
The descriptor's actual network body hash is recorded, with parsed canonical
identity and camera contract checked; no text-newline assumption is imposed.

Root run, after actual model integration and production build:

```text
node tooling/research/write-garbage-room-native-config.mjs
node node_modules/@playwright/test/cli.js test --config assets/intermediate/garbage-room-native-preparation/playwright.garbage.artifact.config.ts
```

The generator only writes an ignored config importing the existing production
artifact config, overriding testMatch and outputDir. It was run successfully;
no config import/browser/server/build was launched here.

## Root integration and remaining visual proof

After root's active consumer lease is restored, exact additions are:

```text
Registry: assetId fixture.garbage-room.waste-bin
          manifest /game-content/oblique-fixture.garbage-room-waste-bin.v1.json
ROOM_VISUAL_VARIANTS: room.garbage-room
          object.waste-bin -> fixture.garbage-room.waste-bin
```

Use the existing wholly-contained-footprint route; preserve default Cell and
Yard skins. No registry/mapping edits were made in this worktree. The recipe
intentionally requires actual new-asset consumer traffic and will not turn the
old Cell bin into a passing new-model result.

**Root still must run native, open the actual screenshots, measure separate
disjoint regions for each bin in q0/q1 before and after Load, and execute the
actual consumer negative control.** No ROI, pixel threshold, hardware result or
per-bin acceptance is invented here. Evidence explicitly keeps visual
calibration/acceptance pending. Network/decoder and whole V8 success alone do
not assert gameplay visual acceptance, garbage collection or trolley movement.
