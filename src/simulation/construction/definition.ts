import { defaultItemRegistry } from '../../content/item-catalog';
import { defaultObjectRegistry, type ObjectCategory } from '../../content/object-catalog';
import { defaultSecurityGradeRegistry } from '../../content/security-grade-catalog';
import type { DoorState } from '../navigation/door';

export type BuildableCategory = 'wall' | 'object' | 'utility';

export interface MaterialRequirement {
  readonly itemId: string;
  readonly quantity: number;
}

export interface BuildableDefinition {
  readonly id: string;
  readonly category: BuildableCategory;
  readonly name: string;
  readonly workRequired: number; // Simulated ticks or work units
  readonly materialsRequired: readonly MaterialRequirement[];
  /**
   * The `src/content/object-catalog.ts` id a completed order for this
   * buildable puts in the world, for a buildable that places a discrete
   * object ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * decision 4).
   *
   * Absent means "this buildable places no object", which is what every
   * buildable before phase 1 meant. `door-wooden` is still absent from here and
   * always will be: it places a **door**, which is a fact about a tile edge and
   * not a row addressed by an anchor tile -- see `placesDoor` below.
   *
   * A **content id**, not a numeric id and not a message key: the footprint,
   * the capabilities and the label all come from the catalogue entry, so
   * nothing about an object is authored twice.
   * `validateBuildableObjectReferences` checks the reference at import time,
   * exactly as `validateBuildableItemReferences` checks the material one.
   */
  readonly placesObjectId?: string;
  /**
   * What a completed order for this buildable registers in `DoorRegistry`, for
   * a buildable that puts a **door** on a tile edge.
   *
   * Absent means "this buildable is not a door", which is what every buildable
   * except `door-wooden` means.
   *
   * **Mutually exclusive with `placesObjectId`, and that is the shape of the
   * decision rather than a lint.** A placed object is a row addressed by an
   * *anchor tile* with a footprint of tiles ([ADR 0028](../../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
   * decision 1); a door is a fact about a tile *edge*, which is the one thing
   * a tile-addressed footprint cannot express -- the edge between (4,6) and
   * (3,6) belongs to neither tile more than the other. Writing a door as an
   * object would also make it count toward `RoomCapacityResolver`'s derived
   * capacity: `object.loading-dock-door` carries `'delivery-access'`, so a door
   * written as an object would hand its room a three-wide ceiling for that
   * capability. Before #326 was fixed it was worse than that -- the ceiling
   * summed `footprint.width` over everything in the room regardless of
   * capability, and a delivery door in a yard granted three prisoners outdoor
   * exercise. `validateBuildableDoorReferences` refuses the
   * combination at import time.
   */
  readonly placesDoor?: DoorPlacement;
}

/**
 * What a completed door order needs to know to become a `DoorDefinition`.
 *
 * Deliberately **not** a `requiredSecurityClearance`/`requiredPermission`
 * pair. `createGradedDoor` (`../security/sector.ts`) states the rule this
 * follows: "a door gating entry into a sector should be authored through this,
 * not with hand-picked `requiredSecurityClearance`/`requiredPermission` values
 * that could silently drift from the sector's own stated grade." So the
 * buildable names a **grade** and the two access fields are read off it, which
 * is `docs/NAVIGATION.md`'s fourth undecided item answered the way that file
 * said it had to be.
 */
export interface DoorPlacement {
  /** An id from `src/content/security-grade-catalog.ts`; supplies clearance and permission. */
  readonly securityGradeId: string;
  /** The door's state the moment it is built. `DoorRegistry` is the only thing that changes it afterwards. */
  readonly initialState: DoorState;
  /** Relative traversal cost multiplier, >= 1; see `doorTraversalCost`. */
  readonly costMultiplier: number;
}

export const BUILDABLE_REGISTRY = new Map<string, BuildableDefinition>([
  ['wall-brick', {
    id: 'wall-brick',
    category: 'wall',
    name: 'Brick Wall',
    workRequired: 50,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
  }],
  /*
   * The one buildable that puts a door on a tile edge, and the row that was a
   * shipped defect until it got `placesDoor`.
   *
   * **What it used to be**: a Build-panel row that consumed a plank, finished,
   * and changed nothing whatever in the simulation -- `edgeNumericIdFor`
   * answered `0` for it, `ConstructionSystem` held no `DoorRegistry`, and a
   * completed order wrote nothing anybody could read. The comment on
   * `edgeNumericIdFor` below used to end by saying so and calling the defect
   * open; it now says what closed it.
   *
   * **Why it is not a `placesObjectId`.** ADR 0028 phase 1 predicted that
   * object placement would fix this row, and it could not: a placed object is
   * addressed by an anchor *tile* and a door is a fact about a tile *edge*, and
   * `src/content/object-catalog.ts` declares no wooden door at all
   * (`object.loading-dock-door` is a three-tile delivery door with a
   * `'delivery-access'` capability, which is a different thing). The prediction
   * was right about the outcome and wrong about the route; see `placesDoor`
   * above for the two consequences that decided it.
   *
   * **`category: 'object'` is unchanged**, and it is still not a mistyped
   * `'wall'`: `'wall'` means *opaque* edge geometry, and promoting the door
   * would build a solid wall where the player asked for a door. What changed is
   * that `'wall'` stopped being the only thing that occupies an edge -- see
   * `occupiesTileEdge` and `DOOR_EDGE_NUMERIC_ID` below.
   *
   * **`grade.general`**, whose `minSecurityClearance` is `0` and which names no
   * permission, because an ordinary wooden door is the one that gates nothing:
   * it is a physical barrier with a lock state, not a checkpoint. A door that
   * gates a wing is a different buildable naming a different grade, and adding
   * one is a content row rather than a code change -- which is the whole reason
   * the grade is named here instead of a clearance number.
   *
   * **`initialState: 'closed'`** rather than `'open'`, because a door that
   * appeared standing open would make a freshly built cell no different from a
   * doorway. `'closed'` is passable to anyone the grade admits, at
   * `doorTraversalCost`'s 1.5x, which is the "opening delay" that file
   * describes. Nothing in `src/` opens or shuts it afterwards except
   * `SecuritySectorRegistry`, and that is the state a door-operation system
   * would take over.
   *
   * **The two numbers are untouched placeholders**, not choices this change
   * made: `workRequired: 30` and one `item.wood-plank` are what the row has
   * carried since #16, and ADR 0017 decision 5 reserves all pricing and balance
   * to #29.
   */
  ['door-wooden', {
    id: 'door-wooden',
    category: 'object',
    name: 'Wooden Door',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesDoor: { securityGradeId: 'grade.general', initialState: 'closed', costMultiplier: 1 },
  }],
  /*
   * The first buildable that puts a discrete object in the world (ADR 0028
   * phase 1), and the reason `placesObjectId` exists.
   *
   * **Every number here is a placeholder and none of them is decided by this
   * change.** ADR 0017 decision 5 reserves all pricing and balance to #29, and
   * a `materialsRequired` quantity is a balance value in exactly the sense a
   * `unitPriceMinorUnits` is -- so this follows the shape
   * `src/content/procurement-catalog.ts` already uses for its two prices and
   * says so at the declaration rather than in a commit message.
   *
   *   - **One material, and that is a constraint rather than a taste.**
   *     `purchasableMaterialFor` in `src/main.ts` offers a stepper for the
   *     *first* priced requirement only, and states that a two-material
   *     buildable would get a control for one of them and no way to buy the
   *     other. So the first object requires one material until a
   *     multi-material buy surface is designed.
   *   - **`item.wood-plank` rather than `item.brick`**, because it is the one
   *     of the two priced materials a bed is plausibly made of, and because
   *     `door-wooden` already proves the plank route works end to end.
   *   - **`workRequired: 30`** is `door-wooden`'s figure, taken rather than
   *     chosen: at `+10` per scheduled tick on a 10-tick schedule that is three
   *     progress ticks plus three state transitions, about 60 ticks or 3s at
   *     1x. Whether furniture should take longer than a door is a balance
   *     question with the same owner as the quantity.
   *
   * `category: 'object'` is what it already was for a door -- the category has
   * had three members since #16 and this is the first row where the third one
   * finishes meaningfully.
   */
  ['bed-wooden', {
    id: 'bed-wooden',
    category: 'object',
    name: 'Bed',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.bed',
  }],
  /*
   * The second object buildable, and the one that finishes a cell (ADR 0028
   * phase 2).
   *
   * **This row is the whole of that phase's mechanism**, which is what the ADR
   * predicted: "ships `object.toilet` as a second buildable, and nothing
   * structural". Every part of the route it travels already existed --
   * `PlaceObject` validates a footprint against the world, the standing objects
   * and the orders in flight without naming an object id; `RoomCapacityResolver`
   * sums `footprint.width` over whatever is standing in the rectangle and
   * unions the capabilities; `buildableLabelKey` in `src/main.ts` reads the
   * label off `object.toilet`'s own `nameKey`; and `structureAppearance` reads
   * the footprint through `placesObjectId`. So a toilet needs no code and no
   * content id: `object.toilet` has been declared since the object catalogue
   * shipped, and `'object.toilet.name'` has been in the default locale just as
   * long.
   *
   * What it changes is the one thing phase 1 could not: a zoned `room.cell`
   * requires `object.bed` **and** `object.toilet`
   * (`src/content/room-catalog.ts`), so a cell with only a bed reads
   * `'missing-capability'` on a requirement the catalogue itself declares.
   * With this row the cell's derived capabilities become
   * `['sanitation', 'sleep-surface']` and both requirements read
   * `'satisfied-by-capability'`.
   *
   * **Every number here is a placeholder, exactly as the bed's are**, and none
   * of them is decided by this change: ADR 0017 decision 5 reserves all pricing
   * and balance to #29, and a `materialsRequired` quantity is a balance value in
   * the same sense a `unitPriceMinorUnits` is.
   *
   *   - **One material**, for the constraint the bed's comment states rather
   *     than for taste: `purchasableMaterialFor` in `src/main.ts` offers a
   *     stepper for the *first* priced requirement only, so a two-material
   *     buildable would get a control for one of them and no way to buy the
   *     other.
   *   - **`item.brick` rather than `item.wood-plank`**, by the bed's own
   *     reasoning applied to a sanitary fixture: it is the fired-clay one of the
   *     two materials `src/content/procurement-catalog.ts` prices, and it is the
   *     one of the two a toilet is plausibly made of. It also means the two
   *     object rows consume *different* materials, so the object route is
   *     measurably not wired to one item.
   *   - **The id's second token names the material this row consumes**, as
   *     `wall-brick`, `door-wooden` and `bed-wooden` all do. It is not a claim
   *     about porcelain: the catalogue prices two materials and neither is
   *     ceramic, and authoring a third with a price is the decision reserved to
   *     #29. The id is never shown to a player -- the Build panel's label is
   *     `object.toilet.name`, "Toilet".
   *   - **`workRequired: 30`**, `bed-wooden`'s and `door-wooden`'s figure, taken
   *     rather than chosen, so nothing here says a toilet takes longer or less
   *     time to install than a bed. Whether furniture should differ is a balance
   *     question with the same owner as the quantity.
   */
  ['toilet-brick', {
    id: 'toilet-brick',
    category: 'object',
    name: 'Toilet',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.toilet',
  }],
  /*
   * ==========================================================================
   * ADR 0028 phase 4 -- the rest of the object catalogue.
   * ==========================================================================
   *
   * Everything from here down is a **content row and nothing else**, which is
   * what that phase promised: "content rows and locale strings, no new
   * mechanism. Not one phase per object: they are rows in a data module and the
   * mechanism is identical, so splitting them would be ceremony." The claim was
   * checked rather than taken -- see the pull request for what was looked for --
   * and it holds: `PlaceObject` validates a footprint without naming an object
   * id, `RoomCapacityResolver` sums and unions over whatever stands in the
   * rectangle, `structureAppearance` reads the footprint through
   * `placesObjectId` so a new object renders at the right size without a
   * renderer change, and `buildableLabelKey` reads the label off the object's
   * own `nameKey`, all twenty of which already ship in
   * `src/content/default-locale-en.ts`. **No locale key was added by this
   * phase**, and that is not an omission: an object buildable is labelled by
   * its object, so there was nothing to author.
   *
   * ## The two numbers, derived rather than chosen
   *
   * ADR 0017 decision 5 reserves all pricing and balance to #29, so no figure
   * below is a balance decision -- but seventeen rows cannot each take
   * `door-wooden`'s 30 the way `bed-wooden` and `toilet-brick` each could, or a
   * three-tile dining table would cost exactly what a chair costs. So both
   * numbers are read off **`footprint.width`**, and that field is not an
   * arbitrary pick: it is the one ADR 0028 decision 2 already derives capacity
   * from, the number of places the object provides.
   *
   *     materialsRequired[0].quantity = footprint.width
   *     workRequired                  = 30 * footprint.width
   *
   * So an object costs one unit of material and 30 work **per place it
   * provides**. A 3-wide dining table seats three, costs three planks and takes
   * three times a chair's work; a 1-wide chair seats one and costs one. Nothing
   * per-row is authored, the ordering is monotone in the one authored quantity,
   * and `tests/foundation/object-buildable-cost-contract.test.ts` pins the rule
   * so a future row cannot drift off it.
   *
   * **The two shipped rows satisfy it exactly** -- `bed-wooden` is `1x2`, width
   * 1, one plank, 30 work; `toilet-brick` is `1x1`, width 1, one brick, 30 work
   * -- so neither is touched by this phase and no test that measures them moves.
   * Stated honestly: both are width 1, so they pin the rule's *constant* and say
   * nothing about its *slope*. The slope is chosen from decision 2's use of the
   * same field, and it is the weaker half of the derivation.
   *
   * ## Which material, and the price inversion that comes with it
   *
   * One material per row, and that is a constraint rather than a taste:
   * `purchasableMaterialFor` in `src/main.ts` offers a stepper for the *first*
   * priced requirement only, so a two-material buildable would get a control
   * for one of them and no way to buy the other. Only two materials are priced
   * at all (`src/content/procurement-catalog.ts`), so the choice is binary, and
   * the rule is the one the four shipped rows already follow: **`item.brick`
   * for a plumbed, fired, masonry or machine body; `item.wood-plank` for a
   * timber one.** A bed is timber and takes the plank; a toilet is a sanitary
   * fixture and takes the brick. The id's second token names the material, as
   * all four shipped ids do.
   *
   * **The inversion this inherits, named rather than engineered away.** Brick
   * is priced at 40 and plank at 65, so *any* width-1 brick object is cheaper
   * than *any* width-1 plank object: a fridge costs 40 and a chair costs 65.
   * That is a statement about two placeholder material prices and not about
   * furniture, it is inherited rather than introduced -- the shipped
   * `toilet-brick` is already cheaper than the shipped `bed-wooden` for exactly
   * this reason -- and #29 owns it. Compensating with a hand-picked quantity
   * would put a balance decision in a row that is meant to carry none, and
   * would break the one rule above. Within a material the ordering is monotone
   * and correct: a 2-wide brick stove (80) costs more than a 1-wide brick
   * fridge (40), and more than a chair (65).
   *
   * ## Footprints are not touched, and orientation is still 0
   *
   * No `footprint` in `src/content/object-catalog.ts` is changed by this phase.
   * They are the source every derived capacity is read from, so editing one to
   * make a price come out would be the inverse of deriving the number -- the
   * error the #326 amendment refused for `object.bench`'s capabilities. Every
   * one of the seventeen objects below fits its room's authored minimum
   * rectangle at orientation 0, which is checked in
   * `tests/foundation/object-buildable-cost-contract.test.ts`; that matters
   * because `DEFAULT_PLACEMENT_ORIENTATION` in
   * `src/simulation/objects/object-placement-service.ts` is 0 for every
   * placement and the rotate control ADR 0028 decision 5 describes does not
   * exist yet. So a player cannot turn a 3x2 dining table, and no room below
   * needs them to.
   *
   * ## `object.sink` is deliberately not here
   *
   * It is the twentieth object and the only one **no room definition
   * requires**, so it is outside this phase's own scope: "buildables for the
   * remaining object ids the room catalogue already requires". Its
   * `AWAITING_CONSUMER` entry in
   * `tests/foundation/unconsumed-content-contract.test.ts` is the only record
   * that no room asks for a sink and that #141 owes the decision of which one
   * should, and giving it a row here would delete that record to no end.
   */

  /*
   * Hygiene. `object.shower-head` is the row ADR 0028 phase 4 names first --
   * "`action.shower` (the one need that genuinely requires a placed
   * capability)" -- because `room.shower-room` is the only room a shower
   * resolves in and nothing could place a shower head until now. Two of these
   * in a zoned shower room make `findAvailableForUse('room.shower-room',
   * 'hygiene')` answer for the first time in the project's history, which
   * `tests/integration/furnished-prison-loop.test.ts` measures end to end.
   *
   * Brick for a plumbed fixture, by `toilet-brick`'s reasoning. Width 1, so one
   * brick and 30 work -- the same figures the toilet carries, because it is the
   * same size and the rule reads only the size.
   */
  ['shower-head-brick', {
    id: 'shower-head-brick',
    category: 'object',
    name: 'Shower Head',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.shower-head',
  }],
  /*
   * A machine body, so brick, and 2 wide -- two bricks and 60 work.
   *
   * `object.washing-machine`'s `'laundry'` capability **was** gated by nothing:
   * no entry in `DEFAULT_ACTIONS` named it and no other room required it, so a
   * furnished `room.laundry` read both its requirements satisfied and changed
   * no prisoner's behaviour. The paragraph said so, called it a true statement
   * rather than a defect, and predicted that "a laundry job system is what
   * would consume it". **`action.laundry-work` is that consumer**
   * (`src/simulation/prisoners/actions.ts`,
   * [ADR 0054](../../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)):
   * it targets `room.laundry`, requires this capability, and gains `hygiene`
   * at 1 a tick against `action.shower`'s 4. Two machines are the room's
   * authored minimum and each is 2 tiles wide, so the capability-scoped
   * ceiling `concurrentUse(laundry, 'laundry')` is 4 -- a furnished laundry
   * puts four prisoners to work. Both directions are kept rather than
   * overwritten, because the sentence this replaces was correct when written.
   */
  ['washing-machine-brick', {
    id: 'washing-machine-brick',
    category: 'object',
    name: 'Washing Machine',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
    placesObjectId: 'object.washing-machine',
  }],
  /*
   * Catering. Five rows that finish `room.kitchen`, `room.canteen`,
   * `room.holding-cell` and `room.common-room`, and the group ADR 0028 phase 4
   * names second: "`action.eat-meal` in a canteen".
   *
   * **The canteen is the room where #326's arithmetic becomes observable**, and
   * these rows are what make it so -- ADR 0029 said as much ("it becomes
   * observable in phase 4, when those objects become placeable"). A canteen
   * furnished to its catalogue minimum -- two dining tables and four benches --
   * derives:
   *
   *     concurrentUseCapacity            = 2*3 + 4*2 = 14   (nothing's ceiling)
   *     concurrentUse(canteen, 'dining') = 2*3       =  6   (the ceiling)
   *
   * because `object.dining-table` declares `'dining'` and `object.bench`
   * declares `'seating'` and `'recreation'` and **not** `'dining'`. So the room
   * seats six diners while fourteen tiles of furniture stand in it, and the
   * fourteen bounds nothing. That is the #326 amendment working as written, and
   * these rows do not touch it: the amendment explicitly left open whether a
   * bench should carry `'dining'` and refused to change the row "so that a
   * number comes out the way a prior document said it would". **No capability
   * in `src/content/object-catalog.ts` is edited by this phase**, for that
   * reason. `tests/integration/furnished-prison-loop.test.ts` measures both
   * numbers off the real command path.
   *
   * Materials by the block's rule. Brick for the three kitchen appliances --
   * a fired stove body, a masonry prep counter, a machine fridge -- and plank
   * for the two pieces of timber furniture. Widths 2, 2, 1, 3 and 2, so
   * quantities and work follow with nothing chosen per row.
   */
  ['stove-brick', {
    id: 'stove-brick',
    category: 'object',
    name: 'Stove',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
    placesObjectId: 'object.stove',
  }],
  ['prep-counter-brick', {
    id: 'prep-counter-brick',
    category: 'object',
    name: 'Prep Counter',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
    placesObjectId: 'object.prep-counter',
  }],
  ['fridge-brick', {
    id: 'fridge-brick',
    category: 'object',
    name: 'Fridge',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.fridge',
  }],
  /*
   * The widest object in the catalogue at `3x2`, so the most expensive row
   * here: three planks and 90 work. It is also the only one whose capability
   * is the ceiling on a need -- `action.eat-meal` asks for `'dining'` and this
   * is the only object that declares it.
   */
  ['dining-table-wooden', {
    id: 'dining-table-wooden',
    category: 'object',
    name: 'Dining Table',
    workRequired: 90,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 3 }],
    placesObjectId: 'object.dining-table',
  }],
  /*
   * Required by three room types -- `room.holding-cell`, `room.canteen` and
   * `room.common-room` -- which makes it the most reused row in the catalogue,
   * and the one that finishes `action.common-room-recreation` by supplying the
   * `'recreation'` the #326 amendment gave that action to ask for.
   */
  ['bench-wooden', {
    id: 'bench-wooden',
    category: 'object',
    name: 'Bench',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 2 }],
    placesObjectId: 'object.bench',
  }],
  /*
   * Offices, education and medical. Five rows that finish `room.reception`,
   * `room.staff-room`, `room.classroom` and `room.infirmary`.
   *
   * All five are timber, so all five take the plank. Widths 2, 1, 2, 1 and 1.
   *
   * **Two capability facts worth having written down**, because both look like
   * bugs from a distance and neither is one:
   *
   *   - `object.desk` carries `'workstation'` and so does
   *     `object.security-console`. `requirementStatus` asks whether *every*
   *     capability of the required object is present in the room, so a security
   *     console standing in a reception satisfies its **desk** requirement
   *     (`'workstation'` is there) while a desk standing in a security office
   *     does **not** satisfy its console requirement (`'surveillance'` is not).
   *     The asymmetry is the containment rule doing its job, not an accident of
   *     these rows. Since #528 it is also what a *count* counts: the room needs
   *     `minQuantity` objects that each cover the required one, so two consoles
   *     satisfy a two-desk requirement and two desks satisfy no part of a
   *     console requirement at all.
   *   - `object.medical-bed` carries `'sleep-surface'` *and*
   *     `'medical-treatment'`, so a plain `object.bed` cannot satisfy an
   *     infirmary's requirement, while a medical bed can satisfy a cell's. That
   *     also means a medical bed adds to `residentCapacity` wherever it stands,
   *     which is correct -- it is a bed -- and is why an infirmary derives a
   *     residency it has no intake route to use.
   *
   * `object.medical-bed` is `1x2` like `object.bed`, so the rule gives it the
   * same one plank and 30 work. A medical bed costing exactly what an ordinary
   * bed costs is a balance statement and #29's to make; the rule reads size and
   * a medical bed is the same size.
   */
  ['desk-wooden', {
    id: 'desk-wooden',
    category: 'object',
    name: 'Desk',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 2 }],
    placesObjectId: 'object.desk',
  }],
  /*
   * The cheapest and quickest row in the registry, and the one required in the
   * largest quantity: `room.classroom` wants four and `room.reception` and
   * `room.staff-room` two each.
   *
   * **Those quantities are now counted, and this comment said they were not.**
   * It read: *"`minQuantity` is still not checked anywhere
   * (`docs/HUD_PROJECTIONS.md` gap 13), so one chair satisfies all three
   * requirements today -- ADR 0028 phase 4 notes that decision 1 makes the check
   * *possible* for the first time, and building it is a mechanism rather than a
   * row, so it is not in this phase."* Every word of that was true of phase 4,
   * which is the phase this row shipped in; the mechanism it deferred is #528,
   * and `requirementStatus` in
   * `src/simulation/presentation/room-projection.ts` now counts the objects
   * standing in the room against the authored `minQuantity`. So a classroom
   * wants four chairs and gets no credit for one.
   *
   * Four *seats*, strictly: the containment rule below counts any object whose
   * capabilities cover a chair's, and `object.bench` is one. That is the same
   * rule as the desk/console asymmetry two blocks up, applied to a quantity.
   */
  ['chair-wooden', {
    id: 'chair-wooden',
    category: 'object',
    name: 'Chair',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.chair',
  }],
  ['bookshelf-wooden', {
    id: 'bookshelf-wooden',
    category: 'object',
    name: 'Bookshelf',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 2 }],
    placesObjectId: 'object.bookshelf',
  }],
  ['medical-bed-wooden', {
    id: 'medical-bed-wooden',
    category: 'object',
    name: 'Medical Bed',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.medical-bed',
  }],
  ['medicine-cabinet-wooden', {
    id: 'medicine-cabinet-wooden',
    category: 'object',
    name: 'Medicine Cabinet',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.medicine-cabinet',
  }],
  /*
   * Security, logistics and utility. The last five rows, finishing
   * `room.security-office`, `room.storage-room`, `room.delivery-bay`,
   * `room.garbage-room` and `room.utility-room` -- after which every `object`
   * requirement in `src/content/room-catalog.ts` is satisfiable through
   * `PlaceObject`, which is the whole of ADR 0028 phase 4.
   *
   * **Four of the five capabilities here are gated by nothing**, and that is
   * this group's honest summary rather than a defect in it. `'surveillance'`,
   * `'item-storage'`, `'delivery-access'`, `'waste-disposal'` and
   * `'utility-control'` appear in no `DEFAULT_ACTIONS` entry and in no other
   * room's requirements, so furnishing these five rooms makes their
   * requirements read `'satisfied-by-capability'` and changes no prisoner's
   * behaviour. The systems that would consume them are a security-deployment
   * system, #99's salvage destination, ADR 0017's procurement route, and a
   * maintenance job system -- none of which exists. A room a player can finish
   * and see reported as complete is what this phase owes them; the behaviour is
   * owed by those systems.
   */
  ['security-console-brick', {
    id: 'security-console-brick',
    category: 'object',
    name: 'Security Console',
    workRequired: 60,
    materialsRequired: [{ itemId: 'item.brick', quantity: 2 }],
    placesObjectId: 'object.security-console',
  }],
  ['storage-rack-wooden', {
    id: 'storage-rack-wooden',
    category: 'object',
    name: 'Storage Rack',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 1 }],
    placesObjectId: 'object.storage-rack',
  }],
  /*
   * The row that needed the most care, because it is a **door that is not a
   * door**, and `placesDoor` exists three fields up.
   *
   * It is `placesObjectId` and not `placesDoor`, and the choice is forced
   * rather than preferred:
   *
   *   - `room.delivery-bay` requires `object.loading-dock-door` by **object
   *     id** with a `minQuantity`, and `RoomCapacityResolver` counts placed
   *     objects. A `placesDoor` row writes a tile *edge* and registers a
   *     `DoorDefinition`; it places no object at all, so it could never satisfy
   *     that requirement. The delivery bay would stay unfinishable for ever.
   *   - `validateBuildableDoorReferences` refuses a row naming both, so there
   *     is no combination to reach for.
   *   - The object catalogue already settled it: `object.loading-dock-door` is
   *     authored with a `3x1` tile footprint and a `'delivery-access'`
   *     capability, which is a tile-addressed thing. `door-wooden`'s own
   *     comment above already draws this distinction and calls the dock door
   *     "a different thing".
   *
   * **So what a player places here is a capability marker on three tiles, not
   * a passage.** It gates nothing, opens nothing and is not read by
   * `DoorRegistry`; navigation cannot cross it and does not need to, because it
   * stands on floor rather than on a wall line. That is a real limitation of
   * this row and it is stated here rather than left to be discovered from an
   * empty `DoorRegistry`.
   *
   * ADR 0017 decision 4's "on a bay's boundary" **is** expressible, and by an
   * accident of the placement rule worth recording: `ObjectPlacementService`
   * asks `outside-room` of the **anchor tile only**, deliberately, so a
   * three-wide door anchored on the bay's edge tile may have its other two
   * tiles outside the rectangle and still belong to the bay. A boundary
   * placement is therefore legal today; nothing yet reads it as a route.
   *
   * Plank, like `door-wooden`, for a timber leaf. Width 3, so three planks and
   * 90 work -- tied with the dining table as the most expensive row here, and
   * for the same reason: it is three tiles wide.
   */
  ['loading-dock-door-wooden', {
    id: 'loading-dock-door-wooden',
    category: 'object',
    name: 'Loading Dock Door',
    workRequired: 90,
    materialsRequired: [{ itemId: 'item.wood-plank', quantity: 3 }],
    placesObjectId: 'object.loading-dock-door',
  }],
  /*
   * Brick for a masonry refuse bunker rather than plank for a crate, which is
   * a judgement and is the kind the block's rule was written to make
   * mechanical: neither of the two priced materials is metal, and authoring a
   * third with a price is #29's.
   */
  ['waste-bin-brick', {
    id: 'waste-bin-brick',
    category: 'object',
    name: 'Waste Bin',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.waste-bin',
  }],
  ['utility-panel-brick', {
    id: 'utility-panel-brick',
    category: 'object',
    name: 'Utility Panel',
    workRequired: 30,
    materialsRequired: [{ itemId: 'item.brick', quantity: 1 }],
    placesObjectId: 'object.utility-panel',
  }],
]);

/**
 * Which authored object category a buildable's row belongs to, or `undefined`
 * for a buildable that places no object at all
 * ([ADR 0035](../../../docs/adr/0035-buildable-catalogue-category-filter.md)).
 *
 * A **category id**, never a label: this is `src/simulation/`, so it may not
 * answer with text (ADR 0011). The composition root turns the id into a
 * message key, exactly as it already turns `placesObjectId` into one through
 * the object's own `nameKey`.
 *
 * The join lives here rather than at the composition root because it is the
 * same join `validateBuildableObjectReferences` below already performs -- a
 * `placesObjectId` looked up in `defaultObjectRegistry` -- and a second copy of
 * it in `src/main.ts` would be a second place for the two vocabularies to
 * drift.
 *
 * **`undefined` is a real answer for two of the twenty-one rows, and it is not
 * a gap to close.** `wall-brick` places opaque edge geometry and
 * `door-wooden` places a door, which is a fact about a tile *edge* registered
 * in `DoorRegistry`; neither is a row addressed by an anchor tile, so neither
 * has an object and neither can borrow an object's category. Giving them one
 * would mean authoring an object nothing places (see `door-wooden`'s own
 * comment above on why `object.loading-dock-door` is a different thing).
 * `tests/foundation/buildable-category-contract.test.ts` holds the whole
 * partition, `undefined` group included, as a written-out table.
 *
 * A `placesObjectId` naming an object the registry does not hold also answers
 * `undefined`, and that state cannot reach a running session:
 * `validateBuildableObjectReferences` throws at import time on exactly it.
 */
export function buildableObjectCategory(definition: BuildableDefinition): ObjectCategory | undefined {
  const objectId = definition.placesObjectId;
  if (objectId === undefined) return undefined;
  return defaultObjectRegistry.getById(objectId)?.category;
}

export type BuildableItemReferenceError = {
  readonly kind: 'missing-item-reference';
  readonly buildableId: string;
  readonly itemId: string;
};

/**
 * Every material a buildable requires must be a real item definition.
 *
 * `BUILDABLE_REGISTRY` and `src/content/item-catalog.ts` were two
 * unrelated vocabularies -- the former said `'brick'`, the latter
 * `'item.brick'`, and nothing ever put one into the other's hands. That
 * was silent rather than harmless: while nothing supplied construction
 * materials at all (#89) a mismatch cost nothing, and
 * `tests/unit/operations-construction-integration.test.ts` recorded the
 * split in a comment as though it were a design decision.
 *
 * **The supply side exists now**, and this check is why its arrival was
 * uneventful. `ProcurementSystem` deposits stock using item-catalog ids
 * (#96), which is exactly the case this was written ahead of: a mismatch
 * would produce no error anywhere, only a build order waiting in
 * `'materials-pending'` forever -- indistinguishable from #89 itself, the
 * defect the supply side was built to fix. The demand side had to speak the
 * same vocabulary as the supply side *before* there was one, so the two are
 * checked against each other here, at import time, and a failure is loud.
 *
 * This is the buildables-to-items direction. The reverse check -- a
 * supplier naming an item nothing declares -- belongs with whatever
 * introduces supply, and does not exist yet.
 */
export function validateBuildableItemReferences(): readonly BuildableItemReferenceError[] {
  const errors: BuildableItemReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    for (const requirement of BUILDABLE_REGISTRY.get(id)!.materialsRequired) {
      if (!defaultItemRegistry.has(requirement.itemId)) {
        errors.push({ kind: 'missing-item-reference', buildableId: id, itemId: requirement.itemId });
      }
    }
  }

  return errors;
}

const buildableItemReferenceErrors = validateBuildableItemReferences();

if (buildableItemReferenceErrors.length > 0) {
  throw new Error(`Buildable definitions reference unknown items: ${JSON.stringify(buildableItemReferenceErrors)}`);
}

export type BuildableObjectReferenceError = {
  readonly kind: 'missing-object-reference';
  readonly buildableId: string;
  readonly objectId: string;
};

/**
 * Every object a buildable claims to place must be a real object definition.
 *
 * The sibling of `validateBuildableItemReferences`, added for the same reason
 * and against the same measured failure. A `placesObjectId` naming an id the
 * catalogue does not declare produces no error anywhere: the placement service
 * refuses the command with `unknown-object`, and the row sits in the Build
 * panel refusing every press -- indistinguishable from the object tool not
 * working. Checking at import time makes the failure loud and puts it next to
 * its cause.
 *
 * Ids are walked in sorted order so a build with two broken rows reports them
 * in a stable order rather than in `Map` insertion order.
 */
export function validateBuildableObjectReferences(): readonly BuildableObjectReferenceError[] {
  const errors: BuildableObjectReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    const objectId = BUILDABLE_REGISTRY.get(id)!.placesObjectId;
    if (objectId === undefined) continue;
    if (!defaultObjectRegistry.has(objectId)) {
      errors.push({ kind: 'missing-object-reference', buildableId: id, objectId });
    }
  }

  return errors;
}

const buildableObjectReferenceErrors = validateBuildableObjectReferences();

if (buildableObjectReferenceErrors.length > 0) {
  throw new Error(`Buildable definitions reference unknown objects: ${JSON.stringify(buildableObjectReferenceErrors)}`);
}

export type BuildableDoorReferenceError =
  | { readonly kind: 'missing-grade-reference'; readonly buildableId: string; readonly securityGradeId: string }
  | { readonly kind: 'door-and-object'; readonly buildableId: string };

/**
 * Every door a buildable claims to place must name a real security grade, and
 * no buildable may claim to place a door *and* an object.
 *
 * The third sibling of `validateBuildableItemReferences` and
 * `validateBuildableObjectReferences`, added for the same reason and against
 * the same measured shape of failure -- a reference that is wrong produces no
 * error anywhere, only a row that misbehaves at the far end of a
 * sixty-tick build.
 *
 *   - **A grade id no catalogue declares** would reach `createGradedDoor`
 *     inside `ConstructionSystem.update`, where it throws a `RangeError` --
 *     out of a scheduled system update, which faults the worker. Checking at
 *     import time turns a session-killing fault into a build that will not
 *     start.
 *   - **A buildable naming both a door and an object** is not merely odd, it
 *     is unimplementable: `finalizeConstruction` writes an edge value for one
 *     and hands the anchor tile to `ObjectPlacementSink` for the other, and
 *     the two branches are exclusive. Rather than let the order of two `if`s
 *     silently decide which half a content author gets, the combination is
 *     refused where it is authored.
 *
 * Ids are walked in sorted order so a build with two broken rows reports them
 * in a stable order rather than in `Map` insertion order.
 */
export function validateBuildableDoorReferences(): readonly BuildableDoorReferenceError[] {
  const errors: BuildableDoorReferenceError[] = [];

  for (const id of [...BUILDABLE_REGISTRY.keys()].sort()) {
    const definition = BUILDABLE_REGISTRY.get(id)!;
    if (definition.placesDoor === undefined) continue;
    if (definition.placesObjectId !== undefined) {
      errors.push({ kind: 'door-and-object', buildableId: id });
    }
    if (!defaultSecurityGradeRegistry.has(definition.placesDoor.securityGradeId)) {
      errors.push({
        kind: 'missing-grade-reference',
        buildableId: id,
        securityGradeId: definition.placesDoor.securityGradeId,
      });
    }
  }

  return errors;
}

const buildableDoorReferenceErrors = validateBuildableDoorReferences();

if (buildableDoorReferenceErrors.length > 0) {
  throw new Error(`Buildable door definitions are invalid: ${JSON.stringify(buildableDoorReferenceErrors)}`);
}

/**
 * What a completed wall writes into the world's `topEdge` / `leftEdge` layer.
 *
 * The layers are `Uint8Array`s whose only published meaning today is
 * "zero means nothing is here": `TopologyManager` flood-fills across any
 * zero edge and stops at any non-zero one, and the renderer draws an edge
 * wall wherever the value is non-zero. `1` is therefore "a wall segment", not
 * a material id -- when different wall materials need to look different, the
 * value becomes a per-definition id and this constant becomes its default.
 */
export const WALL_EDGE_NUMERIC_ID = 1;

/**
 * What a completed **door** writes into the same layer.
 *
 * A second value in a layer whose only published meaning used to be "zero
 * means nothing is here", and the constant above already anticipated it: "when
 * different wall materials need to look different, the value becomes a
 * per-definition id and this constant becomes its default."
 *
 * ## Why a door writes an edge value at all
 *
 * Because it is the barrier. A wall line with a door in it is a wall line: the
 * room on the inside is *enclosed*, and a prisoner crosses at the door rather
 * than anywhere along it. Every consumer of the edge layers reads that
 * correctly from a non-zero value and would read it wrongly from a zero:
 *
 *   - `TopologyManager` flood-fills across zero edges, so a door written as
 *     `0` would put a cell and the corridor outside it in **one region**, and
 *     `roomPerimeterEnclosure` would report the cell `'open'`. A cell whose
 *     door made it stop being a cell is not a door.
 *   - The renderer draws an edge wherever the value is non-zero, so a door
 *     written as `0` is invisible -- which is the defect this row already was,
 *     preserved in a new place.
 *
 * ## Why that does not seal the room, which is the objection this file used to
 * raise against exactly this
 *
 * **Because navigation reads the door before it reads the edge.**
 * `buildNavigationGraph` and `boundedLocalSearch` both ask
 * `DoorRegistry.getByEdge` *first* and only fall through to the wall value when
 * there is no door (`../navigation/region-graph.ts`,
 * `../navigation/local-search.ts`), and `docs/NAVIGATION.md` states the rule
 * they implement: "a door registered at an edge is authoritative for gating
 * that edge, **whatever the world's own edge value is**; a plain nonzero edge
 * value with no registered door is an ordinary, permanently impassable wall."
 * The navigation fixtures have been built this way since #21 --
 * `buildTwoRoomFixture` walls a whole column and registers two doors on it.
 *
 * So the two answers a door produces are different answers to different
 * questions, and both are right:
 *
 *   - **Topology / enclosure**: two regions. A door delimits a room; that is
 *     what makes a cell a cell.
 *   - **Navigation**: two regions joined by a `Portal`, permission-checked at
 *     traversal time. That is what makes the cell reachable.
 *
 * The old sentence here -- "recording a door as one would seal the room it is
 * supposed to open" -- was true of an edge value written **without** a
 * `DoorRegistry` row, which is all this file could offer at the time. It is the
 * missing half that sealed the room, not the edge value.
 *
 * ## Why not simply reuse `WALL_EDGE_NUMERIC_ID`
 *
 * Nothing in `src/` discriminates on the value yet -- every consumer tests
 * `!== 0` -- so a door written as `1` would behave identically today. It is a
 * separate value because the *save* carries it: the edge layers are RLE'd into
 * the world snapshot, so a prison built now records where its doors are, and a
 * renderer that draws a door differently becomes a change to the renderer alone
 * rather than a change that cannot tell the two apart in any existing save.
 * **The renderer does not draw it differently today**, and that is owed work
 * rather than a claim: `tile-layer.ts` paints every non-zero edge with
 * `EDGE_WALL_APPEARANCE`, so a finished door currently looks like a wall.
 */
export const DOOR_EDGE_NUMERIC_ID = 2;

/**
 * Whether a completed order for this buildable occupies a tile **edge** rather
 * than a tile.
 *
 * Two members of `BuildableCategory` are edge geometry now, which is why this
 * is a predicate and not `category === 'wall'` written out at each call site:
 * a `'wall'`, and any buildable that names a `placesDoor`.
 *
 * **The composition root calls it. It did not, and that is what issue #531
 * was.** Two earlier states of this paragraph are worth keeping, because each
 * was true when written and the second is the defect:
 *
 * 1. It was exported *"because the composition root needs the same answer to
 *    decide whether the Build panel shows its edge chooser (`src/main.ts`), and
 *    a second copy of the rule there is how the two would come to disagree"* --
 *    future tense for something already true when it was written.
 * 2. So the paragraph was corrected to say the opposite: *"The composition root
 *    does not call it, and the two answers already disagree"*, with
 *    `src/main.ts` publishing `occupiesEdge: definition.category === 'wall'`,
 *    the Build panel's numeric route hiding the edge chooser for `door-wooden`,
 *    and `tests/integration/door-construction-loop.test.ts` recording the same
 *    gap from the other side as an open HUD question.
 *
 * Both are now history. `src/main.ts` publishes `occupiesEdge:
 * occupiesTileEdge(definition)`, so the panel offers a door its edge chooser
 * and the door lands where the player put it. What the disagreement cost, for
 * the record: a door submitted through the coordinate form took whichever edge
 * the previous *wall* had used, because the panel hid the chooser and submitted
 * its retained value anyway. `tests/foundation/composition-root-contract.test.ts`
 * pins the call site, since deleting it leaves `tsc` clean and every unit test
 * green; the panel's half is `intentEdge` in `src/ui/hud/build-panel.ts`, which
 * stops a hidden control's value reaching any command at all.
 *
 * Reason (1) is why `submitOrder` calls this function rather than spelling the
 * rule again (issue #448), and it is why there is one predicate to call.
 */
export function occupiesTileEdge(definition: BuildableDefinition): boolean {
  return definition.category === 'wall' || definition.placesDoor !== undefined;
}

/**
 * The edge-layer value a completed order for this buildable writes, or `0`
 * for a buildable that is not edge geometry at all.
 *
 * Three answers, and the third is the one that closed a shipped defect.
 * A `'wall'` writes `WALL_EDGE_NUMERIC_ID`. A buildable naming a `placesDoor`
 * writes `DOOR_EDGE_NUMERIC_ID`, and `ConstructionSystem.finalizeConstruction`
 * registers the matching `DoorDefinition` in the same call -- the two halves
 * are what make it a door rather than a wall, and neither is a door on its own.
 * Everything else writes nothing: a buildable that places an *object* is
 * addressed by a tile, and a `'utility'` row still has nothing to write.
 *
 * `door-wooden` used to fall in the third bucket with no `placesDoor`, so a
 * completed order for it consumed a plank and changed nothing whatever in the
 * simulation -- the one buildable the registry offered that could not finish
 * meaningfully. `DOOR_EDGE_NUMERIC_ID`'s comment above is where the reasoning
 * that kept it that way is answered, point by point.
 */
export function edgeNumericIdFor(definition: BuildableDefinition): number {
  if (definition.placesDoor !== undefined) return DOOR_EDGE_NUMERIC_ID;
  return definition.category === 'wall' ? WALL_EDGE_NUMERIC_ID : 0;
}

export function getBuildableDefinition(id: string): BuildableDefinition {
  const def = BUILDABLE_REGISTRY.get(id);
  if (!def) throw new Error(`Unknown buildable definition: ${id}`);
  return def;
}
