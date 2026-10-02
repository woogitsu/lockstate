# Default indoor waste bin: actual player acceptance

2026-10-03. Genuine production-build Chromium route, one worker, 60-second
case limit, 10-second construction-progress guard, zero retries. No object,
order completion, material, orientation or save state was injected. The probe
only reads consistency snapshots; commands come from ordinary native controls.

The first stage builds StorageRoom5,5 and DeliveryBay12,5, waits real completion
and saves IndexedDB. Fresh contexts consume that capacity save before native
Garbage Room20,5 at q0/q1. Exact sent PlaceRoomTemplate commands, completed and
loaded worker anchors are retained in native-player-receipt.json and full raw
snapshots remain in the owned intermediate directory.

| Orientation | Real anchors before/after Load | Palette counts before/after Load |
| --- | --- | --- |
| q0 |21,6 +22,6,orientation0 |865/154 |
| q1 |22,6 +22,7,orientation1 |334/371 |

Initial provisional q0 and q1 crops/RGB each caused four zero-count pixel
errors after genuine construction and Save/Load. Both actual completed/loaded
FullHD frames were opened before calibration; their raw failures and pixel
tables are preserved. The q0 second bin is partly behind the real doorway.
Its three observed exact body shades40/84/89,39/83/87,40/84/88 are counted in
disjoint crops[853,481,49,75] and[909,430,58,75], preserving >100. q1 uses one
observed RGB63/117/122 in crops[903,435,61,83] and[956,476,66,82], also >100.

Frozen baseline3/3 passed. Removing only the existing default
`'object.waste-bin': 'fixture.cell.waste_bin'` row gave four expected palette
errors for each separately executed q0 and q1 route:0/0 before and after Load.
Both still built and saved/loaded the exact real anchors and orientation.
The Yard override remained intact. Opened mutation frames showed the default
fallback blocks in place of the authored bodies. Byte-exact mapping restoration
and production rebuild returned the complete3/3 group to green.

The entire435857-byte simulation worker SHA256
`95189e6c470a65d722d777147a3e2ae49ff033dd2a409933f56f870bcdf5b37c`
is identical in baseline,consumer mutation and restoration. Dedicated source,
descriptor and all72PNG hashes also remained identical. The frozen source
checkpoint, exact mapping hashes, final frame hashes and phase receipts are
recorded in native-player-receipt.json. Final q0/q1 completed and loaded FullHD
PNGs are committed beside this note and were opened after restoration.

This establishes this default indoor consumer in actual Garbage Room q0/q1;
it does not replace contextual Yard acceptance or claim hosted deployment.
No tracked Playwright configuration, matcher or workflow changed here.
