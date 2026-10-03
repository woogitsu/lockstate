# Staff Room padded chair: owned model/integration plan

Base: `956c750cc06fc7875d013d86c96dca08eceeb439`.

## Actual consumer and bounded purpose

`staff-room-basic` is a real 6?6 public template: employee Desk (1,1), Chairs (1,2) and (3,3). The current `room.staff-room/object.chair` selector falls back to `furniture.chair.wooden`; this is an accepted functioning chair, not a broken generic stand-in. Reception waiting-armchair and Classroom student-chair already have distinct dedicated seating and are retained.

Retain actual current `furniture.chair.wooden.angled-detail.blend`: 52 meshes, four complete stored graphs, source SHA `acd0e9decb3bb451b44e8354e797fb5656825f4748bbed832bab61659f06cd88`. Add two broad connected rest pads on original seat/back rail, retaining timber perimeter and visible fasteners, using the existing `shade` charcoal graph. No invented fabric/material/palette. The useful change is staff seating presentation, with two substantial volumes rather than micro joint repairs.

## Sketch and planned assets

Front: original exposed timber/steel perimeter around charcoal seat pad. Back: full lumbar pad attaches to retained walnut rail and original dark inset; retained rear uprights/fasteners stay visible. Footprint remains 1?1 and source bounds/camera target/scale remain byte-for-byte numeric contracts.

Own new builder, source, provenance, exporter, descriptor/72 genuine PNGs and dedicated structural/consumer tests. After source proof: registry entry and only `room.staff-room/object.chair` context. Preserve default wooden chair, Classroom/Reception chairs, all 20 templates, gameplay costs/collision/save. Actual source, dispatch and hash-valid PNG mutation RED?exact restore GREEN required. Serial Blender 5.2.1 thread1. No browser/server/build/fullverify; root owns those surfaces. Native acceptance remains pending.
