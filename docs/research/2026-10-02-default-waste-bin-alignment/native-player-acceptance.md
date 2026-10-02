# Queued actual indoor-bin player route

2026-10-03 calibration checkpoint. **Final baseline/consumer control pending**.

The initial q0 route completed the real worker construction and Save/Load,
but its source-derived provisional crop/RGB returned four zero-count errors;
q1 was skipped by the serial group. After opening both genuine q0 frames,
the two disjoint body crops are [853,481,49,75] and [909,430,58,75].
The partly door-occluded second body has 92 pixels of its most common colour,
so the guard counts three observed exact body shades (40/84/89,39/83/87,
40/84/88), giving 865/154 before and after Load without changing >100.

A second native run passed capacity and q0; q1 also completed real construction
and Save/Load, but its provisional RGB/crops produced four zero-count errors.
Both q1 frames were opened. Disjoint exposed bodies at [903,435,61,83] and
[956,476,66,82] contain RGB63/117/122 334/371 times before and after Load.
Exact anchors were q0 21,6+22,6 orientation0 and q1 22,6+22,7 orientation1.
Raw provisional failures and frame hashes are retained beside this note.
These measurements freeze the native oracle; they are not yet final acceptance.

Prepared `tests/browser/default-waste-bin-player-build.spec.ts` reuses the
accepted three-case Laundry capacity route. One worker,60second case limit,
10second construction progress polling and zero retries are preserved.
No artificial object, material, order completion, orientation or save is
injected. The probe only reads simulation snapshots; native Build controls send
all commands and native Save now/Load creates and consumes IndexedDB state.

1. Build StorageRoom at5,5 and DeliveryBay at12,5, wait actual worker completion,
   then save the real capacity state. Each fixture case starts a fresh context
   from that actual IndexedDB save.
2. Native Build→Room plans→Garbage Room20,5, rotation0; wait allorders0 and
   rooms3. Expected existing bins21,6 and22,6, orientation0. Verify exact sent
   `PlaceRoomTemplate` command, completed snapshot and actual Load snapshot.
3. Repeat through native rotation1: expected bins22,6 and22,7, orientation1.

The two-bin layout and rotated anchors are derived from the existing4×4
`garbage-room-basic` geometry. Native frame crops and source RGB candidates
are explicitly provisional. The source yaw30/40 most common opaque enamel is
63/117/122; yaw300/40 is40/84/89. These are exported model pixels, not proof
of the camera pose or colours in the built player. Both completed and loaded
FullHD screenshots must be opened before calibrating independent exposed-bin
regions; each authored palette requirement stays above100pixels, equal through
Load. Initial provisional failures, if any, will be recorded.

After calibrated baseline, remove only the default
`'object.waste-bin': 'fixture.cell.waste_bin'` consumer mapping row and rebuild
at a frozen commit. Expected native red must be pixel-specific while real
construction and orientation remain correct. Restore mapping/source bytes
exactly, rebuild and require final green; compare the entire simulation worker
file byte for byte across baseline/mutation/restoration. Yard override remains
in place during this scoped consumer control.

Application/tools TypeScript and production build exited0 offline. The browser
spec itself has not been executed or added to an artifact matcher. No tracked
Playwright config or workflow was introduced. A temporary ignored manual
configuration may reuse the existing artifact config only after an exclusive
browser lease, and will be removed after terminal proof.

The weakest claim remains native visibility/colour: authored export and pure
checks cannot establish it. Genuine worker-completed/loaded frames plus the
consumer negative control would establish it; a synthetic scene would not.
