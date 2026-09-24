# Concept prompts for world art

Prompts that produce **reference images to model from**, in the visual language
the owner's 2026-09-13 delivery establishes. Commissioned by that delivery's
fifth ruling (ADR 0112, decision 5) and scoped by a second ruling the same day.

## What a prompt here is for, and the one thing it is not

**A generated image is a concept reference. It is never a shipped sprite.**

Asked whether these prompts should feed Blender modelling or produce sprites
directly, the owner chose the first, from an option labelled *"Referencje
koncepcyjne pod modelowanie w Blenderze"*. The reason is mechanical rather than
aesthetic, and it is worth carrying because it is what a later session will be
tempted to shortcut:

- `tests/unit/environment-art.test.ts` checks two aspect ratios within 3 % — the
  source crop against the packed frame, and the packed frame against the
  declared footprint. `tooling/blender/render-environment-objects.py` satisfies
  both **by construction**: every footprint is an exact multiple of 1/20 of a
  tile, so the pixel rectangle is derived from the footprint reduced to lowest
  terms and the drift is `0`. A generated image satisfies them by luck.
- The render is orthographic, straight down, on transparent film, with a stated
  6 % transparent margin on each side — not a tight crop, because the alpha scan
  in `src/rendering/assets/environment-sprites.ts` shrinks a rectangle inwards
  while its rim is not fully opaque, which is right for a tiling frame and wrong
  for a discrete object whose outermost pixels are its own silhouette (#1028).
- A Blender render can be produced again, byte for byte, from a pinned
  toolchain. A generated image cannot be produced again at all. `docs/ART_PIPELINE.md`
  §"Reproducibility" is the whole argument.

There is a precedent for externally produced PNGs — the 23 sheets under
`public/game-content/source-art/` are owner-supplied files from 2026-08-22, not
output of this repository's renderer — so the path exists. **The ruling is that
we do not take it.** If that changes, it changes in an ADR, not in a prompt.

## The invariants every prompt states

These are not style preferences. Each one is a fact about how the renderer and
the pipeline already work, and a reference that contradicts one produces a model
that cannot be used.

| Invariant | Value | Where it comes from |
|---|---|---|
| Camera | Orthographic, pointing straight down, **slight visible object sides**, never isometric | `docs/ART_PIPELINE.md` §"Environment objects"; the delivery's own world brief |
| Key light | Sun from the **north-west**, elevation 62°, azimuth −40° | `tooling/blender/render-environment-objects.py` |
| Fill light | Elevation 34°, azimuth 150°, soft | same |
| Ground plane | North is **up**, east is **right** (`+x` east, `+y` south) | `docs/ART_PIPELINE.md` §"Character directions" |
| Scale | One tile is 128 px of authored art, drawn at 64 px on screen | `src/rendering/assets/environment-sprites.ts` |
| Background | Transparent. Never a scene, never a floor under a discrete object | the alpha scan, above |
| Palette | The day palette in `docs/VISUAL_IDENTITY.md` — blue-grey walls, pale cool floors, restrained emerald planting, muted orange furnishings | the delivery |
| Forbidden | UI, text, labels, logos, watermarks; any Prison Architect asset, layout or styling | `AGENTS.md` §"Prohibited behavior" |

**Two things a prompt must never try to do.** It must not produce a sheet of
variants — variants are separate models and separate frames, and a generated
contact sheet cannot be cut into them at the aspect the tests demand. And it
must not include a character: actors are the other half of the pipeline, with a
versioned eight-direction contract and a foot pivot at `(128, 352)`.

## The template

Fill the four bracketed fields and leave everything else alone. The tail is the
part that keeps the set coherent; editing it per object is how a catalogue
drifts.

> Use case: stylized-concept. Asset type: **reference image for a 3D model** in
> a top-down prison management simulation. Generate one original
> **[OBJECT]**, **[FOOTPRINT]** tiles seen from directly above with its sides
> slightly visible, centred on a fully transparent background with nothing else
> in frame.
> **[MATERIALS AND DISTINGUISHING DETAIL]**
> Orthographic, nearly vertical camera, never isometric. Key light from the
> upper left at a steep angle, soft fill from the lower right, soft contact
> shadow only directly beneath the object. Blue-grey institutional palette, pale
> cool floors, muted orange for fabric and plastic, restrained emerald for
> planting. Semi-realistic pre-rendered look, crisp readable silhouette,
> **[READABILITY NOTE]**. No UI, no text, no labels, no logos, no watermark.
> No characters. One object only, not a sheet of variants. Do not copy Prison
> Architect assets, layouts or styling.

`[READABILITY NOTE]` is the field that does the most work and the one most often
left empty. It says what must survive being drawn at 64 px: *"the bunk's frame
and the blanket fold must stay separable at thumbnail size"* is a usable note;
*"high detail"* is not.

## The catalogue, and a prompt body for each group

The ids are the ones on disk under `public/game-content/source-art/`. A new
object needs a catalogue entry before it needs a prompt — `docs/CONTENT.md` and
`src/rendering/assets/environment-sprites.ts` are where that happens, and the
footprint it declares is what `[FOOTPRINT]` must repeat.

### Floors — `floor.concrete.variants`, `floor.linoleum.institutional`

A floor is a **tiling** frame, not a discrete object: its rim is meant to meet
its neighbour with no seam, and the 6 % margin rule does not apply to it.

> a seamless institutional floor surface, 1×1 tile, seen from directly above
> with no perspective at all
> — worn poured concrete with faint trowel arcs and hairline cracks, or pale
> green-grey linoleum in 300 mm squares with darkened grout lines and scuffing
> along the traffic line
> …the pattern must tile edge to edge with no visible seam and no lighting
> gradient across the frame, and must not read as a repeating motif when nine
> copies sit side by side.

Note the one place a floor prompt contradicts the template: **no directional
key light**, because a gradient that is right for one tile is wrong for the
tile beside it.

### Walls and doors — `wall.interior.modules`, `wall.exterior.modules`, `door.interior.variants`, `door.security.variants`

> a straight section of interior partition wall, a quarter tile deep, seen from
> above with its top coping and both side faces visible
> — painted blockwork, a darker skirting line where it meets the floor, a
> shallow chamfer on the coping
> …the coping must stay distinguishable from the floor it sits on at thumbnail
> size, and the two side faces must differ in value so the wall reads as having
> thickness.

Doors take the same body plus their leaf state; a security door is heavier, with
a vision panel and a visible frame rebate. **Both wall and door frames legally
overhang their declared footprint** — the renderer grows the frame uniformly and
records `overhangsFootprint` in the sidecar — so the reference may show the
coping proud of the quarter-tile edge.

### Cell furniture — `furniture.cell.bed.single.variants`, `furniture.cell.locker.variants`, `furniture.cell.table_stool`, `fixture.cell.toilet_sink`

> a single institutional bunk, 2×1 tiles, seen from directly above with its
> sides slightly visible
> — tubular steel frame, thin mattress, folded blanket in muted orange, head and
> foot rails proud of the mattress
> …the head and foot rails are the silhouette and must not be cropped; the
> blanket fold must stay separable from the mattress at 64 px.

`fixture.cell.toilet_sink` is the one to read `docs/ART_PIPELINE.md` about
before prompting: it declares `(1, 1)` while the shipped sheet is a 1:2.5
combined column, and its basin overhangs its own tile by 0.02.

The 2026-09-24 toilet refinement uses a new original four-view reference at
`assets/source/concepts/cell-toilet-multiview-v3.png` and provenance at
`assets/source/concepts/cell-toilet-v3.md`. Its historic collection ID is
retained, while the model reads as the actual buildable 1×1 toilet: an oval
ceramic rim and dark basin beneath a compact cistern. The generated reference
guides the Blender model and is not copied into the runtime sprite.

### Shower fixture — `fixture.shower.head`

The one-tile wall-mounted shower has a 2026-09-24 original
four-view reference at `assets/source/concepts/shower-head-multiview-v3.png`
and provenance at `assets/source/concepts/shower-head-v3.md`. Model a broad
dark perforated face with two readable nozzle rings, a teal edge, a north-side
mounting plate and the short exposed supply arm. Keep the head and wall mount
distinct at the game's 64×64 world size.

### Infirmary — `furniture.medical.bed.single`

> a medical bed, 1×2 tiles, shown in a true overhead view and three consistent
> oblique views — teal washable cover, raised head section, white segmented
> side rails, and a marked foot panel
> …the rails and teal cover must distinguish it from the ordinary cell bed at
> the game's 64×128 px size; the caster wheels stay inside the footprint.

The resulting original reference and packed fabric swatch are recorded in
`assets/source/concepts/medical-bed-v1.md`.

### Infirmary storage — `furniture.medical.cabinet`

> one waist-high locking medicine cabinet, 1×1 tile, viewed directly overhead
> and from three consistent oblique angles — pale enamel lid with a teal medical
> cross, blue-grey metal enclosure, two lockable doors and short feet
> …the cross and light top rim must remain distinguishable at 64×64 px.

The original reference and Blender model are recorded in
`assets/source/concepts/medicine-cabinet-v1.md`.

### Laundry — `furniture.laundry.washing_machine.twin`

> a twin-bay institutional washer, 2×1 tiles, shown in four consistent
> views and separately as a straight-down overhead refinement
> — blue-grey worn enamel housing, two large nickel-ringed drum hatches,
> teal laundry under dark glass, paired amber controls on a north-side rail
> …the two drum circles and their separate control clusters must remain
> recognizable at the game's 128×64 px drawing size.

The two original generated references and modeling decisions are recorded in
`assets/source/concepts/washing-machine-v1.md`. The overhead refinement
translates the oblique front loaders into top access hatches that the actual
orthographic game camera can show.

### Kitchen cold storage — `furniture.kitchen.fridge`

> one upright institutional refrigerator, 1×1 tile, shown directly overhead
> and from three consistent oblique views — blue-grey steel cabinet, broad
> cream enamel front cap and doors, dark insulated seam dividing the freezer
> hatch, brushed metal pull, black plinth
> …the steel roof and cream cap must remain distinct at 64×64 px, with the
> front door and handle guiding the 3D form rather than being flattened into a
> plain square.

The original concept and model provenance are recorded in
`assets/source/concepts/fridge-v1.md`.

### Dining, kitchen and corridor — `furniture.corridor.bench.variants`

For `furniture.kitchen.stove`, keep a commercial 2×1 cooker legible from above:
four circular dark burners in two rows, a raised rear splash guard and steel
deck. The front oven doors and controls guide the Blender model's depth, while
the burner pattern is the overhead silhouette. The original multi-view
reference is documented in `assets/source/concepts/kitchen-stove-v1.md`.

> a fixed corridor bench, 2×1 tiles, seen from directly above with its sides
> slightly visible
> — slatted seat on a steel underframe, bolted feet, no backrest
> …the slat gaps must stay visible at thumbnail size rather than merging into a
> solid plank.

The 2026-09-24 refinement has an original four-view reference at
`assets/source/concepts/corridor-bench-multiview-v3.png` with provenance at
`assets/source/concepts/corridor-bench-v3.md`. Individual wood grain offsets,
dark steel end brackets and compact floor plates make the fixed bench distinct
at 128×64 world pixels while preserving its existing 2×1 footprint.

### Reception and offices — `furniture.office.desk.employee.variants`, `furniture.reception.counter.variants`, `furniture.visitor.chair.variants`

> an employee desk, 2×1 tiles, seen from directly above with its sides slightly
> visible
> — laminate top with a visible edge band, steel legs, a shallow drawer pedestal
> on one side, a cable grommet
> …the pedestal must read as a separate mass from the top; the desk must be
> recognisable at 128×64 px without the grommet being legible.

The 2026-09-24 refinement follows the original four-view concept in
`assets/source/concepts/employee-desk-multiview-v3.png`, documented at
`assets/source/concepts/employee-desk-v3.md`. A low lamp, two-page ledger and
layered paper tray provide distinct overhead shapes while the separate drawer
pedestal preserves the desk silhouette at the game's 128×64 world size.

### Kitchen preparation — `furniture.kitchen.prep_counter`

> an institutional food preparation counter, 2×1 tiles, shown in true
> overhead and three matching oblique views
> — steel cabinet and rolled worktop, a broad walnut cutting board on the
> left, and three recessed ingredient pans on the right with separate red,
> green and pale contents
> …the board and three ingredient wells must remain separate at 128×64 px,
> with the raised rear hygiene lip defining its north edge.

The original four-view reference and Blender modeling decisions are in
`assets/source/concepts/prep-counter-v1.md`. This is a dedicated counter
rather than a renamed shipping-container render.

### Library — `furniture.library.bookshelf`

> a 2×1 tile low institutional bookshelf, direct overhead plus three coherent
> oblique views — blue-grey reinforced steel cheeks and uprights, warm timber
> shelves, two open rows across three bays, irregular books with cream, rust,
> olive and navy covers; keep some short empty gaps
> …the two rows of individually colored book spines and the three bay dividers
> must remain distinct at 128×64 px.

The original concept and Blender model are recorded in
`assets/source/concepts/bookshelf-v1.md`.

### Security — `security.access_reader.variants`, `security.camera.wall.variants`, `security.checkpoint.turnstile.variants`

The 2×1 `furniture.security.surveillance_console` is a separate buildable
control station: three low monitor hoods face the vertical game camera; a
keyboard, paired sticks and grouped lights identify the control deck.
Its original four-view reference and packed monochrome CCTV texture are
documented in `assets/source/concepts/security-console-v1.md`.

These carry the palette's action teal as an indicator colour and nothing else
does — a reader's status light is the one warm-cool contrast in an otherwise
grey object, and it is how a player finds it.

> a wall-mounted card reader, a quarter tile, seen from above at a steep angle
> — moulded housing, a single indicator light, a bevelled card slot
> …the indicator must be the only saturated element in the frame.

Camera and turnstile **overhang their footprints** by design; the reference
should show the lens and the arms outside the declared rectangle.

### Utility control — `furniture.utility.control_panel`

Keep a 1×1 electrical control kiosk readable from straight above: six cream
breaker levers, two colored status lenses and a red guarded switch on a dark
inset hatch. Its original four-view reference and Blender model decisions
are recorded in `assets/source/concepts/utility-panel-v1.md`.

### Perimeter and yard — `perimeter.fence.modules`, `perimeter.light.pole.variants`, `perimeter.vehicle_gate.sliding.variants`, `perimeter.watchtower.variants`

> a section of perimeter fence, one tile wide, seen from directly above with its
> posts and mesh visible
> — galvanised mesh on square posts, a tensioning wire top and bottom
> …the mesh must read as a texture rather than as individual wires at 64 px, and
> the posts must stay countable.

The watchtower's roof is 2.35 tiles across a two-tile footprint; the reference
should show that overhang rather than a tower cropped to its base.

### Delivery bay — `furniture.delivery.dock_gate.closed`

> a solid closed 3×1 tile loading-dock gate, true overhead plus three
> consistent oblique views — weathered muted-walnut horizontal timber slats,
> dark seams, galvanized side tracks, diagonal steel braces and two restrained
> amber reflector plates on the threshold
> …the slats, dark joints and end tracks stay legible at 192×64 px; no opening
> or walkable doorway is suggested.

The original reference and the object's current non-navigable limitation are
recorded in `assets/source/concepts/loading-dock-door-v1.md`.

### Lighting and storage — `fixture.ceiling_light.panel.variants`, `storage.container.variants`

A ceiling light is the one object drawn **above** everything else and its
housing is 1.4 tiles across a one-tile footprint. It must read as emitting
without a bloom that a downsample turns to mush.

## What to do with the image once it exists

1. Check it against the invariants table before anything else. A reference that
   lit the object from the south will produce a model lit from the south, and
   the error is cheapest here.
2. Model it in `assets/source/blender/environment.mvp.catalog.blend` to the
   declared footprint. **The reference is a target, not a thing to trace** —
   `AGENTS.md` requires the implementation be ours.
3. Render it through `tooling/blender/render-environment-objects.py`. The
   footprint aspect, the margin, the transparency and the vertical flip are its
   job, not yours.
4. Publish it under `public/game-content/source-art/` — the decode step in CI
   fails closed on any sprite published elsewhere.
5. **Ask the owner to add the id to the `git lfs pull --include=` list in
   `.github/workflows/ci.yml`.** That list is literal rather than a pattern, and
   the file is inside `AGENTS.md`'s third reservation. Until that lands, CI
   fetches an LFS pointer and the decode step fails with a message naming the
   id. This is a scheduling dependency on a person, and it is the one step in
   this document that cannot be worked around.

## Where the campus render came from

`docs/design/2026-09-13-identity-v5/DOKUMENTACJA/08-PROMPT-GRAFIKI.md` carries
the exact prompt that produced the delivery's single 1536×1024 world
illustration. It is the model for the shape of a prompt here, and the
illustration itself stays a reference with nothing cut out of it — the other
half of the same ruling.

### Cell waste bin — `fixture.cell.waste_bin`

The refined 1×1 pedal bin has a raised lid, dark liner, a few pale paper scraps,
restrained teal enamel band and a ribbed foot pedal. This keeps its opening
recognizable at 64 px without turning the scrap into a patterned texture.
Its original four-view reference and Blender decisions are recorded in
`assets/source/concepts/waste-bin-v3.md`.

### Wooden chair refinement — `furniture.chair.wooden`

The 1×1 institutional chair now has three separate walnut seat boards, two
back planks with an overhead air gap, steel support tubes and dark feet. The
four-view concept and model decisions are recorded in
`assets/source/concepts/chair-v3.md`.

### Medicine cabinet refinement — `furniture.medical.cabinet`

The 1×1 infirmary cabinet now shows its purpose from above: a raised lid with
a muted first-aid cross, a dark supply tray, a bandage roll, two medicine
cartons and an amber vial. The original four-view reference and Blender choices
are recorded in `assets/source/concepts/medicine-cabinet-v3.md`.

### Dining table refinement — `furniture.dining.table.wooden`

The three-place canteen table keeps its 3×2 footprint. Four separate walnut
planks and three wood-topped fixed stools read clearly from overhead, with
recessed bolts and the existing dark steel support. The original four-view
concept and Blender choices are recorded in
`assets/source/concepts/dining-table-v3.md`.

### Kitchen stove refinement — `furniture.kitchen.stove`

The 2×1 kitchen stove now shows cast-iron grates above four recessed burners,
with a row of knobs and a small amber lamp visible from overhead. The original
four-view reference and Blender decisions are recorded in
`assets/source/concepts/kitchen-stove-v3.md`.

### Kitchen refrigerator refinement — `furniture.kitchen.fridge`

The one-tile refrigerator now has a raised condenser assembly on its roof:
four dark vent slots in a recessed frame, a round service cap, corner screws
and a small teal temperature lamp. The original four-view concept and Blender
choices are recorded in `assets/source/concepts/fridge-v3.md`.

### Institutional linoleum floor — `floor.linoleum.institutional`

The original four-view material concept shows a true overhead tile, oblique
surface, section, and 3 × 3 repeated preview. Blender models the cool grey-green
linoleum with fine mineral flecks, traffic scuffs and joints that meet between
tiles. The source and tiling choices are recorded in
`assets/source/concepts/institutional-floor-v1.md`.

### Interior door overhead cap — `door.interior.variants`

The north-south interior door edge now uses a true overhead Blender render: a
warm timber slab between galvanized jambs, with a hinge and recessed latch.
The east-west frontal view keeps its existing source-art crop. The original
four-view reference is recorded in `assets/source/concepts/interior-door-v3.md`.

### Interior wall coping — `wall.interior.cap.overhead`

The north-south wall cap uses an original four-view reference to define pale
enamel coping, continuous dark seams, and small metal anchors. Its Blender
render has no transparent frame margin, so segments tile without gaps. The
concept and modeling choices are recorded in
`assets/source/concepts/interior-wall-cap-v1.md`.

### Interior wall elevation — `wall.interior.face`

The east-west wall face uses an original four-view reference for a pale plaster
panel, cool enamel coping, dark skirting and one subtle joint per tile. Blender
renders a shallow relief with no transparent margin, so the horizontal bands
repeat without gaps. Provenance is in
`assets/source/concepts/interior-wall-face-v1.md`.

### Compacted outdoor dirt — `terrain.dirt.compacted`

The original four-view reference shows a true overhead seamless ground tile,
an oblique material detail, a soil section and a 3 × 3 repeat preview. Blender
uses tile-periodic noise with restrained mineral grit for the unzoned ground
seen across the prison map. Provenance and border behavior are recorded in
`assets/source/concepts/dirt-terrain-v1.md`.
