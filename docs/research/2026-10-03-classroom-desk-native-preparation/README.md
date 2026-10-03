# Classroom teacher desk — public native route preparation

## Verified typed route

This preparation starts from the published genuine teacher-desk model at `d2f88990c62fe3a2b3f83ffb52c204486585a2f2`, in an isolated worktree. No browser, server, Blender or art-source mutator runs here. Registry, mapping, renderer, catalogue, room template, palette, save and UI remain unchanged.

The existing Classroom template is **7×7**, with a **5×5** interior at `(5,5)` when placed at `(4,4)`. It retains the original bookshelf and four chairs. Those objects occupy six of the 25 interior squares, leaving 19 free squares. Both existing public template orientations have a legitimate free **2×1** desk slot:

| Classroom plan | Separately placed desk anchor | Actual desk squares | Desk orientation |
| --- | --- | --- | --- |
| q0 | `(8,5)` | `(8,5), (9,5)` | 0 |
| q1 | `(5,8)` | `(5,8), (6,8)` | 0 |

**Individual-object rotation is not currently public.** The strict `PlaceObject` command has no orientation field; the Build UI producer sends `definitionId,x,y` and a generated owner ID. Rotation belongs to room templates. Both trials therefore prove rotated *Classroom plans*, each with an ordinary separately paid orientation0 desk. They do not claim a rotated individual desk or add a desk to the template.

All construction is produced through the actual typed public kernel commands, with original 25,000 treasury and owned 32×32 parcel:

| Stage | Origin | Cost | New orders | Remaining balance | Actual completion ticks |
| --- | --- | --- | --- | --- | --- |
| Storage Room | `(12,18)` | 1395 | 18 | 23605 | 1251 |
| Delivery Bay | `(20,18)` | 1780 | 21 | 21825 | 1520 |
| Classroom q0 or q1 | `(4,4)` | 2295 | 29 | 19530 | 1890 |
| Separate desk purchase + placement | Slot above | 130 | 1 | 19400 | 180 |

The desk uses exactly **two wood planks**, at the existing 65-per-plank rule, and 60 work. It is not granted or charged as part of the room plan. Total debit is **5600**, with **19400** remaining, **69** completed construction orders and **114 bricks +16 wood planks** allocated. Three rooms contain nine original-plus-desk objects. The new workstation is the existing capability with capacity2; education remains2 and seating remains4. All object requirements are satisfied; two nonobject Classroom requirements remain `notEvaluated`, not reported as passed.

The same literal oracle is used in the typed tests and prepared browser recipe. It checks all 23 ordered square walls, the exact original doorway, all five original template-object owners and rotations, the independent non-template desk owner, complete retained template contents and material debit. Both actual completed stopped snapshots roundtrip **wholly and exactly** through real V8 envelope serialization, validation, decoding and runtime restoration.

## Actual regression proof

The own checkout's real `ObjectPlacementService` order producer was temporarily changed to force `desk-wooden` to orientation1. Ordinary public commands still contained no rotation. Both actual typed cases reached RED in the independently literal orientation0 desk owner oracle. The producer was restored byte-for-byte, and both q0/q1 construction + whole V8 tests passed GREEN. Receipt and RED/GREEN logs are beside this report. Genuine teacher-desk source, provenance, descriptor, all72 PNGs, registry and mapping remained hash-identical.

## Native preparation boundary

The opt-in recipe will use the actual built client, ordinary public Room plans, Build purchase and numeric placement controls, an actual immutable Storage/Delivery IndexedDB save, public camera controls and public Save/Load. Read-only probes request authoritative snapshots/projections; they do not submit commands or restore manufactured snapshots.

Root must first integrate the optional Classroom desk registry/mapping from the model report. This preparation does not make those edits. Native network evidence must originate from the real renderer request and HTMLImageElement/Blob decoder, never a synthetic fetch. Both desks retain orientation0, so seven existing camera-right clicks from initial −45° expose the same actual local source yaw60/elevation40 frame in either room orientation.

- Source SHA256: `c1dd80d253667f8e1bca5b17371b183ec18b5a292bebdf9fd2062e85b01d55ff`.
- Descriptor: `/game-content/oblique-furniture-classroom-teacher-desk.v1.json`.
- Source frame: `/assets/environment/oblique/furniture.classroom.teacher-desk-yaw+60-elev40.721cae760da7.png`.
- Frame SHA256: `721cae760da76bdb6830e99255ee7e9c01c0d1733735621b419a62997094a561`.

**No native pass is claimed.** Root still needs to run the prepared production recipe, inspect actual renders, calibrate a desk-specific visual region and run its consumer controls. Network/decoded-image success alone is not gameplay visual acceptance. Existing 60-second cases, expect10 seconds, retries0 and workers1 are retained; no `slow()` or budget increase is introduced.

## Files and reproduction

- Literals: `tests/fixtures/native-classroom-desk-plan.ts`.
- Actual typed route: `tests/integration/native-classroom-desk-preparation.test.ts`.
- Shared typed/native oracle and real network observer: `tests/browser/native-classroom-desk-evidence.ts`.
- Actual producer mutation driver: `tooling/research/prove-classroom-desk-typed-producer.py`.
- Opt-in configuration generator: `tooling/research/write-classroom-desk-native-config.mjs`.

The actual typed completion times above are simulation results, not measured browser wall-clock estimates.
