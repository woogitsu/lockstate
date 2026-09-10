# Every sentence this game can show a player

**Generated. Do not edit by hand.** Run `pnpm content:player-strings` after changing
`src/content/default-locale-en.ts`; `tests/foundation/player-string-inventory-contract.test.ts`
fails if this file and that one disagree.

## What this is for

`AGENTS.md`'s partial release of reservation 4 gives the choice of words to agents and
keeps the requirement that a sentence be **true** with the owner, in exchange for every
authored string being recorded so that harmonising the wording is *"one reading rather
than an excavation"*. This file is that reading.

**It replaces a hand-maintained record that had failed.** On 2026-09-09 every coordinate
`docs/adr/STATUS-QUEUE.md` gave for such a string was wrong — four of four — and one of
them quoted a sentence the game had stopped showing months of releases earlier. Both
failures are impossible here: the key, the value and the coordinate below are read out
of the tree every time this file is regenerated, and a stale copy fails CI.

**What it does not tell you is whether a sentence is _true_ of the code that raises it.**
Nothing mechanical can. That argument belongs in a docblock beside that code —
`hud.alert.event.construction.undo-refused-newer-action` is the worked example, arguing
each of its three clauses at the code that decides it.

## The 433 authored sentences

Source: `src/content/default-locale-en.ts`, in the order they are declared.

| Key | Ships today | At |
| --- | --- | --- |
| `room.cell.name` | Cell | `src/content/default-locale-en.ts:26` |
| `room.holding-cell.name` | Holding Cell | `src/content/default-locale-en.ts:27` |
| `room.solitary-cell.name` | Solitary Cell | `src/content/default-locale-en.ts:28` |
| `room.reception.name` | Reception | `src/content/default-locale-en.ts:29` |
| `room.kitchen.name` | Kitchen | `src/content/default-locale-en.ts:30` |
| `room.canteen.name` | Canteen | `src/content/default-locale-en.ts:31` |
| `room.shower-room.name` | Shower Room | `src/content/default-locale-en.ts:32` |
| `room.laundry.name` | Laundry | `src/content/default-locale-en.ts:33` |
| `room.yard.name` | Yard | `src/content/default-locale-en.ts:34` |
| `room.common-room.name` | Common Room | `src/content/default-locale-en.ts:35` |
| `room.classroom.name` | Classroom | `src/content/default-locale-en.ts:36` |
| `room.infirmary.name` | Infirmary | `src/content/default-locale-en.ts:37` |
| `room.security-office.name` | Security Office | `src/content/default-locale-en.ts:38` |
| `room.staff-room.name` | Staff Room | `src/content/default-locale-en.ts:39` |
| `room.storage-room.name` | Storage Room | `src/content/default-locale-en.ts:40` |
| `room.delivery-bay.name` | Delivery Bay | `src/content/default-locale-en.ts:41` |
| `room.garbage-room.name` | Garbage Room | `src/content/default-locale-en.ts:42` |
| `room.utility-room.name` | Utility Room | `src/content/default-locale-en.ts:43` |
| `object.bed.name` | Bed | `src/content/default-locale-en.ts:45` |
| `object.medical-bed.name` | Medical Bed | `src/content/default-locale-en.ts:46` |
| `object.toilet.name` | Toilet | `src/content/default-locale-en.ts:47` |
| `object.sink.name` | Sink | `src/content/default-locale-en.ts:48` |
| `object.shower-head.name` | Shower Head | `src/content/default-locale-en.ts:49` |
| `object.washing-machine.name` | Washing Machine | `src/content/default-locale-en.ts:50` |
| `object.desk.name` | Desk | `src/content/default-locale-en.ts:51` |
| `object.chair.name` | Chair | `src/content/default-locale-en.ts:52` |
| `object.stove.name` | Stove | `src/content/default-locale-en.ts:53` |
| `object.prep-counter.name` | Prep Counter | `src/content/default-locale-en.ts:54` |
| `object.fridge.name` | Fridge | `src/content/default-locale-en.ts:55` |
| `object.dining-table.name` | Dining Table | `src/content/default-locale-en.ts:56` |
| `object.bench.name` | Bench | `src/content/default-locale-en.ts:57` |
| `object.bookshelf.name` | Bookshelf | `src/content/default-locale-en.ts:58` |
| `object.medicine-cabinet.name` | Medicine Cabinet | `src/content/default-locale-en.ts:59` |
| `object.security-console.name` | Security Console | `src/content/default-locale-en.ts:60` |
| `object.storage-rack.name` | Storage Rack | `src/content/default-locale-en.ts:61` |
| `object.loading-dock-door.name` | Loading Dock Door | `src/content/default-locale-en.ts:62` |
| `object.waste-bin.name` | Waste Bin | `src/content/default-locale-en.ts:63` |
| `object.utility-panel.name` | Utility Panel | `src/content/default-locale-en.ts:64` |
| `object.category.furniture.name` | Furniture | `src/content/default-locale-en.ts:97` |
| `object.category.sanitation.name` | Plumbing | `src/content/default-locale-en.ts:98` |
| `object.category.food-service.name` | Catering | `src/content/default-locale-en.ts:99` |
| `object.category.security.name` | Security | `src/content/default-locale-en.ts:100` |
| `object.category.storage.name` | Storage | `src/content/default-locale-en.ts:101` |
| `object.category.utility.name` | Utility | `src/content/default-locale-en.ts:102` |
| `object.category.medical.name` | Medical | `src/content/default-locale-en.ts:103` |
| `staff-role.warden.name` | Warden | `src/content/default-locale-en.ts:105` |
| `staff-role.administrator.name` | Administrator | `src/content/default-locale-en.ts:106` |
| `staff-role.guard.name` | Guard | `src/content/default-locale-en.ts:107` |
| `staff-role.security-chief.name` | Security Chief | `src/content/default-locale-en.ts:108` |
| `staff-role.nurse.name` | Nurse | `src/content/default-locale-en.ts:109` |
| `staff-role.doctor.name` | Doctor | `src/content/default-locale-en.ts:110` |
| `staff-role.maintenance-worker.name` | Maintenance Worker | `src/content/default-locale-en.ts:111` |
| `staff-role.kitchen-staff.name` | Kitchen Staff | `src/content/default-locale-en.ts:112` |
| `item.brick.name` | Brick | `src/content/default-locale-en.ts:114` |
| `item.wood-plank.name` | Wood Plank | `src/content/default-locale-en.ts:115` |
| `item.food-ration.name` | Food Ration | `src/content/default-locale-en.ts:116` |
| `item.dirty-linen.name` | Dirty Linen | `src/content/default-locale-en.ts:117` |
| `item.clean-linen.name` | Clean Linen | `src/content/default-locale-en.ts:118` |
| `item.waste.name` | Waste | `src/content/default-locale-en.ts:119` |
| `grade.general.name` | General | `src/content/default-locale-en.ts:121` |
| `grade.medical.name` | Medical | `src/content/default-locale-en.ts:122` |
| `grade.high-security.name` | High Security | `src/content/default-locale-en.ts:123` |
| `grade.staff-only.name` | Staff Only | `src/content/default-locale-en.ts:124` |
| `grade.administrative.name` | Administrative | `src/content/default-locale-en.ts:125` |
| `contraband.weapon.name` | Weapon | `src/content/default-locale-en.ts:127` |
| `contraband.drug.name` | Drugs | `src/content/default-locale-en.ts:128` |
| `contraband.phone.name` | Phone | `src/content/default-locale-en.ts:129` |
| `contraband.currency.name` | Currency | `src/content/default-locale-en.ts:130` |
| `contraband.tool.name` | Tool | `src/content/default-locale-en.ts:131` |
| `hud.status.title` | Prison status | `src/content/default-locale-en.ts:157` |
| `hud.status.prisoners` | Prisoners | `src/content/default-locale-en.ts:158` |
| `hud.status.prisoners-without-bed` | {count} with no bed | `src/content/default-locale-en.ts:167` |
| `hud.status.staff` | Staff | `src/content/default-locale-en.ts:168` |
| `hud.status.rooms` | Rooms | `src/content/default-locale-en.ts:169` |
| `hud.status.rooms-not-ready` | {count} not ready | `src/content/default-locale-en.ts:205` |
| `hud.status.incidents` | Incidents | `src/content/default-locale-en.ts:206` |
| `hud.status.coverage` | Coverage | `src/content/default-locale-en.ts:207` |
| `hud.status.contraband` | Contraband | `src/content/default-locale-en.ts:208` |
| `hud.status.funds` | Funds | `src/content/default-locale-en.ts:213` |
| `hud.status.funds-remaining` | {remaining} left | `src/content/default-locale-en.ts:245` |
| `hud.status.funds-before-deliveries-stop` | {remaining} left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a bed. | `src/content/default-locale-en.ts:290` |
| `hud.status.funds-deliveries-stopped` | Deliveries have stopped — no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a bed. | `src/content/default-locale-en.ts:309` |
| `hud.status.funds-treasury-floor-exhausted` | The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a bed, so a prison housing nobody earns nothing. | `src/content/default-locale-en.ts:368` |
| `hud.status.earned-today` | Earned today | `src/content/default-locale-en.ts:375` |
| `hud.status.occupancy` | Cell occupancy | `src/content/default-locale-en.ts:376` |
| `hud.status.occupancy-value` | {value} of {capacity} | `src/content/default-locale-en.ts:377` |
| `hud.status.incidents-clear` | Clear | `src/content/default-locale-en.ts:378` |
| `hud.status.incidents-active` | Active | `src/content/default-locale-en.ts:379` |
| `hud.clock.title` | Time controls | `src/content/default-locale-en.ts:381` |
| `hud.clock.day-progress` | Through the day | `src/content/default-locale-en.ts:384` |
| `hud.clock.day` | Day | `src/content/default-locale-en.ts:385` |
| `hud.clock.speed` | Speed {speed}× | `src/content/default-locale-en.ts:405` |
| `hud.clock.paused` | PAUSED | `src/content/default-locale-en.ts:410` |
| `hud.transport.pause` | Pause | `src/content/default-locale-en.ts:411` |
| `hud.transport.play` | Play at normal speed | `src/content/default-locale-en.ts:412` |
| `hud.transport.fast-forward` | Fast forward | `src/content/default-locale-en.ts:413` |
| `hud.tabs.title` | Prison sections | `src/content/default-locale-en.ts:415` |
| `hud.tab.overview` | Overview | `src/content/default-locale-en.ts:416` |
| `hud.tab.build` | Build | `src/content/default-locale-en.ts:417` |
| `hud.tab.security` | Security | `src/content/default-locale-en.ts:418` |
| `hud.tab.regime` | Regime | `src/content/default-locale-en.ts:419` |
| `hud.tab.rooms` | Rooms | `src/content/default-locale-en.ts:424` |
| `hud.zoom.title` | Zoom | `src/content/default-locale-en.ts:465` |
| `hud.zoom.in` | Zoom in | `src/content/default-locale-en.ts:466` |
| `hud.zoom.out` | Zoom out | `src/content/default-locale-en.ts:467` |
| `hud.minimap.title` | Minimap | `src/content/default-locale-en.ts:469` |
| `hud.minimap.placeholder` | No map is drawn here yet — click to jump the camera there, once a prison is loaded | `src/content/default-locale-en.ts:470` |
| `hud.minimap.navigable` | No map is drawn here yet — click to jump the camera there | `src/content/default-locale-en.ts:548` |
| `hud.alerts.title` | Alerts | `src/content/default-locale-en.ts:549` |
| `hud.alerts.empty` | No active alerts | `src/content/default-locale-en.ts:550` |
| `hud.alert.occurrences` | {count}× | `src/content/default-locale-en.ts:596` |
| `hud.alert.time` | Day {day} | `src/content/default-locale-en.ts:597` |
| `hud.alert.dismiss` | Clear this alert | `src/content/default-locale-en.ts:626` |
| `hud.alert.refusal.admit.no-accommodation` | Nobody was admitted — there is no room to put a prisoner in yet. | `src/content/default-locale-en.ts:650` |
| `hud.alert.refusal.admit.population-full` | Nobody was admitted — this prison is holding as many people as it can. | `src/content/default-locale-en.ts:651` |
| `hud.alert.refusal.build.duplicate-order` | The build order failed — that order already exists. | `src/content/default-locale-en.ts:662` |
| `hud.alert.refusal.build.out-of-bounds` | The build order failed — that tile is outside the map. | `src/content/default-locale-en.ts:663` |
| `hud.alert.refusal.build.unbuildable` | The build order failed — nothing can be built on that tile. | `src/content/default-locale-en.ts:664` |
| `hud.alert.refusal.build.unbuildable-terrain` | The build order failed — the ground there cannot be built on. | `src/content/default-locale-en.ts:665` |
| `hud.alert.refusal.build.unknown-buildable` | The build order failed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:681` |
| `hud.alert.refusal.build.unowned-land` | The build order failed — you do not own that land. | `src/content/default-locale-en.ts:682` |
| `hud.alert.refusal.build.water-blocked` | The build order failed — there is water on that tile. | `src/content/default-locale-en.ts:683` |
| `hud.alert.refusal.cancel-purchase.not-pending` | Nothing was refunded — that delivery is not on its way any more. | `src/content/default-locale-en.ts:699` |
| `hud.alert.refusal.construction.materials-unfunded` | The build queue is stalled — no more materials until the prison earns the money. | `src/content/default-locale-en.ts:747` |
| `hud.alert.refusal.hire.insufficient-funds` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:858` |
| `hud.alert.refusal.hire.no-duty-for-role` | Nobody was hired — only security staff can hold a post, and this prison has no other work for that role. | `src/content/default-locale-en.ts:864` |
| `hud.alert.refusal.hire.roster-full` | Nobody was hired — this prison cannot hold any more staff. | `src/content/default-locale-en.ts:865` |
| `hud.alert.refusal.hire.unknown-role` | Nobody was hired — that is not a role this prison knows. | `src/content/default-locale-en.ts:866` |
| `hud.alert.refusal.place-object.duplicate-order` | The object was not placed — that order already exists. | `src/content/default-locale-en.ts:873` |
| `hud.alert.refusal.place-object.not-a-placeable-object` | The object was not placed — that is not something built by placing it on a tile. | `src/content/default-locale-en.ts:874` |
| `hud.alert.refusal.place-object.out-of-bounds` | The object was not placed — part of it would be outside the map. | `src/content/default-locale-en.ts:875` |
| `hud.alert.refusal.place-object.outside-room` | The object was not placed — it has to stand in a room you have zoned. | `src/content/default-locale-en.ts:876` |
| `hud.alert.refusal.place-object.tile-occupied` | The object was not placed — something is already standing there. | `src/content/default-locale-en.ts:877` |
| `hud.alert.refusal.place-object.unknown-buildable` | The object was not placed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:878` |
| `hud.alert.refusal.place-object.unowned-land` | The object was not placed — you do not own all of that land. | `src/content/default-locale-en.ts:879` |
| `hud.alert.refusal.remove-object.nothing-to-remove` | Nothing was removed — there is no object on that tile, and none being built there. | `src/content/default-locale-en.ts:889` |
| `hud.alert.refusal.purchase.duplicate-order` | The materials were not ordered — that order already exists. | `src/content/default-locale-en.ts:890` |
| `hud.alert.refusal.purchase.insufficient-funds` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:900` |
| `hud.alert.refusal.purchase.invalid-quantity` | The materials were not ordered — that quantity cannot be bought. | `src/content/default-locale-en.ts:901` |
| `hud.alert.refusal.purchase.unknown-material` | The materials were not ordered — that material is not for sale. | `src/content/default-locale-en.ts:902` |
| `hud.alert.refusal.dismiss.unknown-staff` | Nobody was dismissed — that staff member is not on the roster. | `src/content/default-locale-en.ts:921` |
| `hud.alert.refusal.release-guard.not-held` | Nothing was released — that guard is already off duty. | `src/content/default-locale-en.ts:922` |
| `hud.alert.refusal.release-guard.unknown-guard` | Nothing was released — that guard is not on the roster. | `src/content/default-locale-en.ts:923` |
| `hud.alert.refusal.zone.duplicate-instance-id` | The room was not zoned — a room is already recorded on that tile. | `src/content/default-locale-en.ts:928` |
| `hud.alert.refusal.zone.invalid-area` | The room was not zoned — that area is not a valid rectangle. | `src/content/default-locale-en.ts:929` |
| `hud.alert.refusal.zone.out-of-bounds` | The room was not zoned — part of that area is outside the map. | `src/content/default-locale-en.ts:930` |
| `hud.alert.refusal.zone.overlaps-existing-room` | The room was not zoned — it overlaps a room that is already there. | `src/content/default-locale-en.ts:931` |
| `hud.alert.refusal.zone.unknown-room-type` | The room was not zoned — that is not a room type this prison knows. | `src/content/default-locale-en.ts:932` |
| `hud.alert.refusal.zone.unowned-land` | The room was not zoned — you do not own all of that land. | `src/content/default-locale-en.ts:933` |
| `hud.alert.refusal.zone.below-minimum-size` | The room was not zoned — that area is smaller than this room type allows. | `src/content/default-locale-en.ts:940` |
| `hud.alert.refusal.zone.not-enclosed` | The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side. | `src/content/default-locale-en.ts:951` |
| `hud.alert.refusal.unzone.invalid-area` | Nothing was removed — that area is not a valid rectangle. | `src/content/default-locale-en.ts:956` |
| `hud.alert.refusal.unzone.nothing-to-remove` | Nothing was removed — there is no room in that area. | `src/content/default-locale-en.ts:957` |
| `hud.alert.refusal.unzone.room-occupied` | Nothing was removed — somebody is using that room. | `src/content/default-locale-en.ts:958` |
| `hud.alert.fault.invalid-message` | A simulation message was rejected — it was not a message this game understands. | `src/content/default-locale-en.ts:983` |
| `hud.alert.fault.unsupported-protocol-version` | A simulation message was rejected — it was written for a different version of the game. | `src/content/default-locale-en.ts:984` |
| `hud.alert.fault.unknown-message-kind` | A simulation message was rejected — this build does not know that kind of message. | `src/content/default-locale-en.ts:985` |
| `hud.alert.fault.invalid-payload` | A simulation message was rejected — its contents were not what that message must carry. | `src/content/default-locale-en.ts:986` |
| `hud.alert.fault.not-initialized` | A simulation request was refused — no prison is loaded yet. | `src/content/default-locale-en.ts:987` |
| `hud.alert.fault.already-initialized` | A simulation request was refused — this session already has a prison loaded. | `src/content/default-locale-en.ts:988` |
| `hud.alert.fault.duplicate-message` | A command was refused — it had already been sent. | `src/content/default-locale-en.ts:989` |
| `hud.alert.fault.sequence-gap` | A command was refused — a command sent before it never arrived. | `src/content/default-locale-en.ts:990` |
| `hud.alert.fault.invalid-state` | A simulation request was refused — the simulation cannot do that right now. | `src/content/default-locale-en.ts:991` |
| `hud.alert.fault.snapshot-incompatible` | The save could not be loaded — this build does not understand its format. | `src/content/default-locale-en.ts:992` |
| `hud.alert.fault.shutting-down` | A simulation request was refused — the session is shutting down. | `src/content/default-locale-en.ts:993` |
| `hud.alert.fault.internal-error` | The simulation hit an internal error. | `src/content/default-locale-en.ts:994` |
| `hud.alert.event.prisoners.discharged` | {count} released — their sentences are served. | `src/content/default-locale-en.ts:1011` |
| `hud.alert.event.economy.wages-unpaid` | Payday went unpaid — your staff are owed {total}. | `src/content/default-locale-en.ts:1012` |
| `hud.alert.event.economy.deliveries-refused` | Deliveries refused — the treasury cannot cover a purchase right now. | `src/content/default-locale-en.ts:1022` |
| `hud.alert.event.economy.construction-refused` | Construction halted — the treasury cannot fund the build queue right now. | `src/content/default-locale-en.ts:1023` |
| `hud.alert.event.construction.order-cancelled` | The order was cancelled — the money it cost is refunded. | `src/content/default-locale-en.ts:1142` |
| `hud.alert.event.construction.order-cancelled-underway` | The order was cancelled. Anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1143` |
| `hud.alert.event.construction.undo-refused-newer-action` | Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one. | `src/content/default-locale-en.ts:1173` |
| `hud.alert.event.construction.undone` | The last change to the build queue was undone. | `src/content/default-locale-en.ts:1175` |
| `hud.alert.event.construction.undone-spend-destroyed` | The last change to the build queue was undone — anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1176` |
| `hud.alert.event.construction.redone` | The last change to the build queue was redone. | `src/content/default-locale-en.ts:1178` |
| `hud.alert.event.economy.delivery-cancelled` | The delivery was cancelled — {total} back. | `src/content/default-locale-en.ts:1179` |
| `hud.alert.event.objects.removed-spend-destroyed` | The object was removed — the money it cost does not come back. | `src/content/default-locale-en.ts:1262` |
| `hud.alert.event.prisoners.relocated` | {name} had nowhere to sleep and moved to {room}. | `src/content/default-locale-en.ts:1285` |
| `hud.alert.event.rooms.zoned` | {room} designated. | `src/content/default-locale-en.ts:1340` |
| `hud.alert.event.incidents.riot-opened` | A riot has broken out — {count} prisoners have stopped taking orders. | `src/content/default-locale-en.ts:1363` |
| `hud.alert.event.incidents.assault-opened` | A fight has broken out between two prisoners. | `src/content/default-locale-en.ts:1364` |
| `hud.alert.event.incidents.escape-attempt-opened` | A prisoner is trying to break out. | `src/content/default-locale-en.ts:1365` |
| `hud.alert.event.incidents.gang-retaliation-opened` | Two gangs are settling a score. | `src/content/default-locale-en.ts:1366` |
| `hud.alert.event.incidents.all-clear` | The prison is under control again — no incident is still open. | `src/content/default-locale-en.ts:1367` |
| `hud.alert.event.incidents.all-clear-after-lapse` | No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. | `src/content/default-locale-en.ts:1418` |
| `hud.alert.event.incidents.escape-succeeded` | {name} broke out — no guard reached them in time. | `src/content/default-locale-en.ts:1455` |
| `hud.alert.event.contraband.discovered` | Contraband found: {item}. | `src/content/default-locale-en.ts:1490` |
| `hud.unavailable.simulation` | Simulation unavailable — this browser could not start it, so nothing can run or be saved | `src/content/default-locale-en.ts:1508` |
| `hud.panel.collapse` | Collapse | `src/content/default-locale-en.ts:1510` |
| `hud.panel.expand` | Expand | `src/content/default-locale-en.ts:1511` |
| `hud.build.title` | Build | `src/content/default-locale-en.ts:1513` |
| `hud.build.catalogue` | What to build | `src/content/default-locale-en.ts:1514` |
| `hud.build.catalogue-empty` | Nothing is available to build | `src/content/default-locale-en.ts:1515` |
| `hud.build.selected` | Selected | `src/content/default-locale-en.ts:1516` |
| `hud.build.placement` | Where | `src/content/default-locale-en.ts:1517` |
| `hud.build.tile-x` | Tile X | `src/content/default-locale-en.ts:1518` |
| `hud.build.tile-y` | Tile Y | `src/content/default-locale-en.ts:1519` |
| `hud.build.step-down` | Decrease {field} | `src/content/default-locale-en.ts:1520` |
| `hud.build.step-up` | Increase {field} | `src/content/default-locale-en.ts:1521` |
| `hud.build.edge` | Edge | `src/content/default-locale-en.ts:1522` |
| `hud.build.submit` | Place order | `src/content/default-locale-en.ts:1523` |
| `hud.build.note` | An order is queued now and built while the clock runs. | `src/content/default-locale-en.ts:1524` |
| `hud.build.arm` | Place on map | `src/content/default-locale-en.ts:1525` |
| `hud.build.remove` | Remove | `src/content/default-locale-en.ts:1566` |
| `hud.build.remove-active` | Stop removing | `src/content/default-locale-en.ts:1567` |
| `hud.build.remove-hint` | Press any tile of an object to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded. | `src/content/default-locale-en.ts:1568` |
| `hud.build.remove-submit` | Remove object here | `src/content/default-locale-en.ts:1569` |
| `hud.build.disarm` | Stop placing | `src/content/default-locale-en.ts:1570` |
| `hud.build.arm-hint` | Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:1571` |
| `hud.build.arm-hint-object` | Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:1607` |
| `hud.build.target-none` | Point at the world | `src/content/default-locale-en.ts:1609` |
| `hud.build.target-value` | {x}, {y} · {edge} | `src/content/default-locale-en.ts:1610` |
| `hud.build.target-run` | {count} × {edge} from {x}, {y} | `src/content/default-locale-en.ts:1611` |
| `hud.build.target-tile` | {x}, {y} | `src/content/default-locale-en.ts:1612` |
| `hud.build.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:1613` |
| `hud.build.coordinates-hint` | The keyboard route. Pointing at the map is quicker. | `src/content/default-locale-en.ts:1614` |
| `hud.build.buy` | Buy | `src/content/default-locale-en.ts:1615` |
| `hud.build.buy-quantity` | Quantity | `src/content/default-locale-en.ts:1616` |
| `hud.build.buy-submit` | Buy {count} × {material} · {total} | `src/content/default-locale-en.ts:1617` |
| `hud.build.buy-hint` | Arrives while the clock runs, into the stock a build draws from. | `src/content/default-locale-en.ts:1618` |
| `hud.build.buy-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:1658` |
| `hud.build.queue` | Queued | `src/content/default-locale-en.ts:1725` |
| `hud.build.queue-count` | {count} waiting · {started} being built | `src/content/default-locale-en.ts:1726` |
| `hud.build.queue-order` | {buildable} · {x}, {y} · {edge} · {total} back | `src/content/default-locale-en.ts:1727` |
| `hud.build.queue-cancel` | Cancel | `src/content/default-locale-en.ts:1728` |
| `hud.build.queue-unnamed` | Unnamed order | `src/content/default-locale-en.ts:1729` |
| `hud.build.queue-more` | and {count} more behind these — undo takes back a whole run. | `src/content/default-locale-en.ts:1730` |
| `hud.build.queue-shortfall` | Waiting for {total} to unblock the next order. | `src/content/default-locale-en.ts:1731` |
| `hud.build.deliveries` | On the way | `src/content/default-locale-en.ts:1758` |
| `hud.build.deliveries-count` | {count} bought · {total} back if cancelled | `src/content/default-locale-en.ts:1759` |
| `hud.build.delivery` | {count} × {material} · {total} back | `src/content/default-locale-en.ts:1760` |
| `hud.build.delivery-cancel` | Cancel | `src/content/default-locale-en.ts:1761` |
| `hud.build.delivery-unnamed` | Unnamed material | `src/content/default-locale-en.ts:1762` |
| `hud.build.deliveries-more` | and {count} more on the way — these arrive first, and the rest come into view as they land. | `src/content/default-locale-en.ts:1763` |
| `hud.build.buildable.wall-brick` | Brick wall | `src/content/default-locale-en.ts:1764` |
| `hud.build.buildable.door-wooden` | Wooden door | `src/content/default-locale-en.ts:1765` |
| `hud.build.category` | Category | `src/content/default-locale-en.ts:1778` |
| `hud.build.category-all` | Everything | `src/content/default-locale-en.ts:1779` |
| `hud.build.category.structure` | Walls and doors | `src/content/default-locale-en.ts:1780` |
| `hud.intake.title` | Intake | `src/content/default-locale-en.ts:1799` |
| `hud.intake.admit` | Admit a prisoner | `src/content/default-locale-en.ts:1800` |
| `hud.intake.hint` | A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free. | `src/content/default-locale-en.ts:1801` |
| `hud.intake.no-place` | {count} waiting with no bed to sleep in | `src/content/default-locale-en.ts:1809` |
| `hud.intake.pipeline` | In intake | `src/content/default-locale-en.ts:1814` |
| `hud.intake.pipeline-count` | {waiting} of {total} | `src/content/default-locale-en.ts:1815` |
| `hud.intake.pipeline-stage` | {count} at {stage} | `src/content/default-locale-en.ts:1816` |
| `hud.intake.pipeline-failed` | {count} cannot be housed at all | `src/content/default-locale-en.ts:1821` |
| `hud.security.staff` | Staff | `src/content/default-locale-en.ts:1829` |
| `hud.security.roles` | Who to hire | `src/content/default-locale-en.ts:1830` |
| `hud.security.roles-empty` | Nobody can be hired yet. | `src/content/default-locale-en.ts:1831` |
| `hud.security.selected` | Selected | `src/content/default-locale-en.ts:1832` |
| `hud.security.hire` | Hire {role} · {total} | `src/content/default-locale-en.ts:1833` |
| `hud.security.hire-hint` | Costs {total} now and {wage} a day in wages, including today. | `src/content/default-locale-en.ts:1891` |
| `hud.security.hire-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:1903` |
| `hud.security.hire-unassigned` | A new guard starts unassigned. | `src/content/default-locale-en.ts:1926` |
| `hud.security.held` | On duty | `src/content/default-locale-en.ts:1934` |
| `hud.security.held-summary` | {held} held · {unassigned} free | `src/content/default-locale-en.ts:1935` |
| `hud.security.held-empty` | Nobody is assigned right now. | `src/content/default-locale-en.ts:1936` |
| `hud.security.held-row` | {name} · {claim} | `src/content/default-locale-en.ts:1937` |
| `hud.security.held-row-unnamed` | Guard {id} · {claim} | `src/content/default-locale-en.ts:1938` |
| `hud.security.held-release` | Release | `src/content/default-locale-en.ts:1939` |
| `hud.security.held-more` | and {count} more | `src/content/default-locale-en.ts:1940` |
| `hud.security.held-hint` | A released guard stays hired and goes back to the pool. | `src/content/default-locale-en.ts:1941` |
| `hud.security.roster` | On the payroll | `src/content/default-locale-en.ts:1980` |
| `hud.security.roster-wage-bill` | {total} a day | `src/content/default-locale-en.ts:2001` |
| `hud.security.roster-dismiss` | Dismiss | `src/content/default-locale-en.ts:2002` |
| `hud.security.roster-dismiss-confirm` | Dismiss {name}? Their wage stops and they do not come back. | `src/content/default-locale-en.ts:2031` |
| `hud.security.roster-hint` | A dismissed staff member leaves the prison for good, and their wage stops. | `src/content/default-locale-en.ts:2032` |
| `hud.security.coverage` | Guard coverage | `src/content/default-locale-en.ts:2042` |
| `hud.security.coverage-summary` | {assigned} of {required} | `src/content/default-locale-en.ts:2043` |
| `hud.security.coverage-met` | Covered | `src/content/default-locale-en.ts:2044` |
| `hud.security.coverage-met-hint` | Incidents and searches need free guards. | `src/content/default-locale-en.ts:2217` |
| `hud.security.coverage-short` | Understaffed | `src/content/default-locale-en.ts:2218` |
| `hud.security.coverage-short-hint` | Hire {count} more to cover this population. | `src/content/default-locale-en.ts:2219` |
| `hud.security.coverage-unguarded` | Unguarded | `src/content/default-locale-en.ts:2220` |
| `hud.security.coverage-unguarded-hint` | Nobody is on duty. Hire {count} to cover this population. | `src/content/default-locale-en.ts:2221` |
| `hud.security.coverage-unguarded-consequence` | No guard is posted here, so nobody in this sector is kept safe. | `src/content/default-locale-en.ts:2269` |
| `hud.regime.title` | Regime | `src/content/default-locale-en.ts:2285` |
| `hud.regime.blocks` | Today's blocks | `src/content/default-locale-en.ts:2286` |
| `hud.regime.block-allows` | Allows {categories} | `src/content/default-locale-en.ts:2287` |
| `hud.regime.block-progress` | {percent}% through | `src/content/default-locale-en.ts:2288` |
| `hud.regime.category-separator` | ,  | `src/content/default-locale-en.ts:2291` |
| `hud.regime.roster` | Prisoners | `src/content/default-locale-en.ts:2304` |
| `hud.regime.roster-count` | {shown} of {total} | `src/content/default-locale-en.ts:2305` |
| `hud.regime.roster-name` | {given} {family} | `src/content/default-locale-en.ts:2306` |
| `hud.regime.roster-unnamed` | Prisoner {id} | `src/content/default-locale-en.ts:2307` |
| `hud.regime.roster-heading` | Heading to {activity} | `src/content/default-locale-en.ts:2308` |
| `hud.regime.roster-more` | and {count} more | `src/content/default-locale-en.ts:2309` |
| `hud.regime.roster-empty` | No prisoners yet. Build a cell with a bed to take somebody in. | `src/content/default-locale-en.ts:2341` |
| `hud.regime.roster-emptied` | This prison is empty. Take somebody in to start again. | `src/content/default-locale-en.ts:2378` |
| `hud.refusal.set-clock` | The clock did not change — the request was refused. | `src/content/default-locale-en.ts:2393` |
| `hud.refusal.place-build-order` | The build order was not placed — the request was refused. | `src/content/default-locale-en.ts:2394` |
| `hud.refusal.purchase-materials` | Nothing was bought — the purchase was refused and no money was spent. | `src/content/default-locale-en.ts:2395` |
| `hud.refusal.hire-staff` | Nobody was hired — the request was refused and no money was spent. | `src/content/default-locale-en.ts:2396` |
| `hud.refusal.purchase-materials-past-floor` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:2419` |
| `hud.refusal.hire-staff-past-floor` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:2420` |
| `hud.refusal.undo` | Nothing was undone — the request was refused. | `src/content/default-locale-en.ts:2421` |
| `hud.refusal.redo` | Nothing was redone — the request was refused. | `src/content/default-locale-en.ts:2422` |
| `hud.refusal.zone-room` | The room was not designated — the request was refused. | `src/content/default-locale-en.ts:2423` |
| `hud.refusal.unzone-room` | Nothing was removed — the request was refused. | `src/content/default-locale-en.ts:2424` |
| `hud.refusal.admit-prisoner` | Nobody was admitted — the request was refused. | `src/content/default-locale-en.ts:2425` |
| `hud.refusal.admit-prisoner-no-room` | Nobody was admitted — this prison has no room to hold anybody. | `src/content/default-locale-en.ts:2441` |
| `hud.refusal.cancel-build-order` | The order is still queued — the request was refused. | `src/content/default-locale-en.ts:2442` |
| `hud.refusal.cancel-material-purchase` | Nothing was refunded — the request was refused and the delivery is still on its way. | `src/content/default-locale-en.ts:2448` |
| `hud.refusal.release-guard` | Nobody was released — the request was refused and the guard is still assigned. | `src/content/default-locale-en.ts:2449` |
| `hud.rooms.title` | Rooms | `src/content/default-locale-en.ts:2451` |
| `hud.rooms.catalogue` | Room type and area | `src/content/default-locale-en.ts:2455` |
| `hud.rooms.catalogue-empty` | No room types are available | `src/content/default-locale-en.ts:2456` |
| `hud.rooms.selected` | Selected | `src/content/default-locale-en.ts:2457` |
| `hud.rooms.arm` | Draw on map | `src/content/default-locale-en.ts:2458` |
| `hud.rooms.disarm` | Stop drawing | `src/content/default-locale-en.ts:2459` |
| `hud.rooms.arm-hint` | Drag a rectangle across the tiles this room should cover. | `src/content/default-locale-en.ts:2460` |
| `hud.rooms.remove` | Remove rooms | `src/content/default-locale-en.ts:2461` |
| `hud.rooms.remove-active` | Stop removing | `src/content/default-locale-en.ts:2462` |
| `hud.rooms.remove-hint` | Drag across any part of a room to remove all of it. | `src/content/default-locale-en.ts:2471` |
| `hud.rooms.area` | Area | `src/content/default-locale-en.ts:2472` |
| `hud.rooms.area-none` | Nothing selected | `src/content/default-locale-en.ts:2473` |
| `hud.rooms.area-value` | {width} × {height} tiles at {x}, {y} | `src/content/default-locale-en.ts:2474` |
| `hud.rooms.confirm` | Designate {width} × {height} | `src/content/default-locale-en.ts:2475` |
| `hud.rooms.confirm-remove` | Remove {width} × {height} | `src/content/default-locale-en.ts:2478` |
| `hud.rooms.cancel` | Discard | `src/content/default-locale-en.ts:2479` |
| `hud.rooms.minimum` | Needs at least {width} × {height} tiles | `src/content/default-locale-en.ts:2480` |
| `hud.rooms.minimum-none` | No minimum size | `src/content/default-locale-en.ts:2481` |
| `hud.rooms.too-small` | Too small — this room needs at least {width} × {height} tiles. | `src/content/default-locale-en.ts:2482` |
| `hud.rooms.enclosure` | Enclosure | `src/content/default-locale-en.ts:2483` |
| `hud.rooms.enclosure-none` | Not evaluated yet | `src/content/default-locale-en.ts:2484` |
| `hud.rooms.enclosure-sealed` | Walled in — not a door check | `src/content/default-locale-en.ts:2527` |
| `hud.rooms.enclosure-open` | Open on at least one side | `src/content/default-locale-en.ts:2528` |
| `hud.rooms.requirement-enclosed` | Must be enclosed | `src/content/default-locale-en.ts:2529` |
| `hud.rooms.requirement-outdoors` | Must be outdoors | `src/content/default-locale-en.ts:2530` |
| `hud.rooms.requirement-none` | No enclosure rule | `src/content/default-locale-en.ts:2531` |
| `hud.rooms.requires-object` | Needs {count} × {object} | `src/content/default-locale-en.ts:2538` |
| `hud.rooms.requires-none` | No objects needed | `src/content/default-locale-en.ts:2543` |
| `hud.rooms.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:2547` |
| `hud.rooms.coordinates-hint` | The keyboard route. Dragging on the map is quicker. | `src/content/default-locale-en.ts:2548` |
| `hud.rooms.coordinates-submit` | Use these tiles | `src/content/default-locale-en.ts:2553` |
| `hud.rooms.tile-x` | Tile X | `src/content/default-locale-en.ts:2554` |
| `hud.rooms.tile-y` | Tile Y | `src/content/default-locale-en.ts:2555` |
| `hud.rooms.width` | Width | `src/content/default-locale-en.ts:2556` |
| `hud.rooms.height` | Height | `src/content/default-locale-en.ts:2557` |
| `hud.rooms.step-down` | Decrease {field} | `src/content/default-locale-en.ts:2558` |
| `hud.rooms.step-up` | Increase {field} | `src/content/default-locale-en.ts:2559` |
| `hud.rooms.needs` | Not ready | `src/content/default-locale-en.ts:2564` |
| `hud.rooms.needs-count` | {unfinished} of {total} | `src/content/default-locale-en.ts:2565` |
| `hud.rooms.needs-room` | {room} at {x}, {y} is missing | `src/content/default-locale-en.ts:2570` |
| `hud.rooms.needs-object` | {count} × {object} | `src/content/default-locale-en.ts:2574` |
| `hud.rooms.needs-object-uncounted` | {object} | `src/content/default-locale-en.ts:2579` |
| `hud.rooms.needs-item-more` | and {count} more | `src/content/default-locale-en.ts:2584` |
| `hud.rooms.needs-object-unknown` | something this build cannot name | `src/content/default-locale-en.ts:2588` |
| `hud.rooms.needs-doorway` | a door — nobody can get in | `src/content/default-locale-en.ts:2615` |
| `hud.rooms.at-capacity` | At capacity | `src/content/default-locale-en.ts:2675` |
| `hud.rooms.at-capacity-count` | {full} of {total} | `src/content/default-locale-en.ts:2676` |
| `hud.rooms.at-capacity-room` | {room} at {x}, {y} is full | `src/content/default-locale-en.ts:2677` |
| `hud.rooms.at-capacity-places` | places in use: {inUse} of {capacity} | `src/content/default-locale-en.ts:2678` |
| `hud.severity.info` | Info | `src/content/default-locale-en.ts:2680` |
| `hud.severity.warning` | Warning | `src/content/default-locale-en.ts:2681` |
| `hud.severity.danger` | Critical | `src/content/default-locale-en.ts:2682` |
| `save.panel.region` | Prison saves | `src/content/default-locale-en.ts:2697` |
| `save.panel.title` | Prisons | `src/content/default-locale-en.ts:2698` |
| `save.action.create` | New prison | `src/content/default-locale-en.ts:2700` |
| `save.action.save` | Save now | `src/content/default-locale-en.ts:2701` |
| `save.action.export` | Export | `src/content/default-locale-en.ts:2702` |
| `save.action.import` | Import | `src/content/default-locale-en.ts:2703` |
| `save.action.load` | Load | `src/content/default-locale-en.ts:2704` |
| `save.action.delete` | Delete | `src/content/default-locale-en.ts:2705` |
| `save.list.empty` | No prisons yet. | `src/content/default-locale-en.ts:2707` |
| `save.list.item` | {name} ({count} gen) | `src/content/default-locale-en.ts:2708` |
| `save.status.idle` | Local saves only — no network required. | `src/content/default-locale-en.ts:2710` |
| `save.status.saved` | Saved (generation {generation}). | `src/content/default-locale-en.ts:2711` |
| `save.status.quota-exceeded` | Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact. | `src/content/default-locale-en.ts:2716` |
| `save.status.transaction-aborted` | The browser interrupted the save. Your previous save is intact — try saving again. | `src/content/default-locale-en.ts:2718` |
| `save.status.save-failed` | Save failed: {detail} | `src/content/default-locale-en.ts:2720` |
| `save.status.list-unreadable` | Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail} | `src/content/default-locale-en.ts:2724` |
| `save.status.creating` | Creating prison… | `src/content/default-locale-en.ts:2726` |
| `save.status.create-failed` | Could not create a prison: {detail} | `src/content/default-locale-en.ts:2727` |
| `save.status.no-active-prison` | No active prison — create or load one first. | `src/content/default-locale-en.ts:2728` |
| `save.status.saving` | Saving… | `src/content/default-locale-en.ts:2729` |
| `save.status.loading` | Loading… | `src/content/default-locale-en.ts:2730` |
| `save.status.not-found` | That prison no longer exists. | `src/content/default-locale-en.ts:2731` |
| `save.status.no-readable-generation` | No readable save generation remains for this prison. Every retained copy failed validation. | `src/content/default-locale-en.ts:2732` |
| `save.status.recovered` | The most recent save was unreadable — recovered an earlier verified generation. | `src/content/default-locale-en.ts:2734` |
| `save.status.loaded` | Loaded. | `src/content/default-locale-en.ts:2735` |
| `save.status.deleted` | Prison deleted. | `src/content/default-locale-en.ts:2736` |
| `save.status.nothing-to-export` | Nothing to export — no valid active save. | `src/content/default-locale-en.ts:2737` |
| `save.status.exported` | Exported the current save. | `src/content/default-locale-en.ts:2738` |
| `save.status.importing` | Reading the save file… | `src/content/default-locale-en.ts:2745` |
| `save.status.imported` | Imported the save file into this prison (generation {generation}). | `src/content/default-locale-en.ts:2746` |
| `save.status.imported-migrated` | Imported a save from an older version of Lockstate and brought it up to date (generation {generation}). | `src/content/default-locale-en.ts:2747` |
| `save.status.import-not-a-save` | That file is not a Lockstate save — choose a file exported from this game. | `src/content/default-locale-en.ts:2749` |
| `save.status.import-unsupported-version` | That save was written by a newer version of Lockstate than this one. Update the game, then import it again. | `src/content/default-locale-en.ts:2750` |
| `save.status.import-corrupt` | That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported. | `src/content/default-locale-en.ts:2752` |
| `save.status.import-invalid` | That save file could not be read: {detail} | `src/content/default-locale-en.ts:2754` |
| `save.failure.create` | Creating the prison failed: {detail} | `src/content/default-locale-en.ts:2756` |
| `save.failure.save` | Saving failed: {detail} | `src/content/default-locale-en.ts:2757` |
| `save.failure.load` | Loading failed: {detail} | `src/content/default-locale-en.ts:2758` |
| `save.failure.delete` | Deleting failed: {detail} | `src/content/default-locale-en.ts:2759` |
| `save.failure.export` | Exporting failed: {detail} | `src/content/default-locale-en.ts:2760` |
| `save.failure.import` | Importing failed: {detail} | `src/content/default-locale-en.ts:2761` |
| `save.failure.unknown` | The action failed: {detail} | `src/content/default-locale-en.ts:2762` |
| `save.detail.restored-scope` | Restored: {restored}. Not carried by this save version: {notCarried}. | `src/content/default-locale-en.ts:2769` |
| `save.scope.kernel` | kernel tick and command queue | `src/content/default-locale-en.ts:2788` |
| `save.scope.rng-streams` | RNG stream states | `src/content/default-locale-en.ts:2789` |
| `save.scope.world` | world terrain and ownership | `src/content/default-locale-en.ts:2790` |
| `save.scope.construction` | construction orders and undo/redo | `src/content/default-locale-en.ts:2791` |
| `save.scope.entity-liveness` | entity id liveness | `src/content/default-locale-en.ts:2792` |
| `save.scope.prisoners` | prisoners, needs, actions and cell assignments | `src/content/default-locale-en.ts:2793` |
| `save.scope.operations` | jobs, containers and utility networks | `src/content/default-locale-en.ts:2794` |
| `save.scope.security` | doors, security sectors, guards and patrols | `src/content/default-locale-en.ts:2795` |
| `save.scope.contraband` | contraband, intelligence and searches | `src/content/default-locale-en.ts:2796` |
| `save.scope.incidents` | incidents, gangs and tunnels | `src/content/default-locale-en.ts:2797` |
| `save.scope.names` | prisoner and staff names | `src/content/default-locale-en.ts:2798` |
| `save.scope.room-caches` | room and topology caches (recomputed from the world) | `src/content/default-locale-en.ts:2803` |
| `save.scope.navigation-caches` | navigation caches and in-flight path requests (re-issued on the next tick) | `src/content/default-locale-en.ts:2804` |
| `input.action.camera.up` | Pan camera up | `src/content/default-locale-en.ts:2812` |
| `input.action.camera.down` | Pan camera down | `src/content/default-locale-en.ts:2813` |
| `input.action.camera.left` | Pan camera left | `src/content/default-locale-en.ts:2814` |
| `input.action.camera.right` | Pan camera right | `src/content/default-locale-en.ts:2815` |
| `input.action.camera.zoom.in` | Zoom in | `src/content/default-locale-en.ts:2816` |
| `input.action.camera.zoom.out` | Zoom out | `src/content/default-locale-en.ts:2817` |
| `input.action.selection.primary` | Select | `src/content/default-locale-en.ts:2818` |
| `input.action.build.confirm` | Confirm placement | `src/content/default-locale-en.ts:2819` |
| `input.action.build.cancel` | Cancel | `src/content/default-locale-en.ts:2822` |
| `input.action.edit.undo` | Undo | `src/content/default-locale-en.ts:2826` |
| `input.action.edit.redo` | Redo | `src/content/default-locale-en.ts:2827` |
| `brand.region` | Lockstate build | `src/content/default-locale-en.ts:2832` |
| `brand.wordmark` | LockState.io | `src/content/default-locale-en.ts:2835` |
| `brand.stage` | PRE-ALPHA | `src/content/default-locale-en.ts:2843` |
| `brand.build` | v{version} · {commit} | `src/content/default-locale-en.ts:2852` |
| `brand.description` | Lockstate, {stage} build, version {version}, commit {commit}. | `src/content/default-locale-en.ts:2856` |
| `display.scale.region` | Interface scale | `src/content/default-locale-en.ts:2872` |
| `display.scale.cycle` | Change the interface scale | `src/content/default-locale-en.ts:2873` |
| `app.shell.label` | Lockstate game application | `src/content/default-locale-en.ts:2883` |

