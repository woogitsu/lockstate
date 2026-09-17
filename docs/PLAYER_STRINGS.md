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

## The 503 authored sentences

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
| `hud.status.funds-treasury-floor-exhausted` | The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a bed, so a prison housing nobody earns nothing. | `src/content/default-locale-en.ts:377` |
| `hud.status.earned-today` | Earned today | `src/content/default-locale-en.ts:384` |
| `hud.status.occupancy` | Cell occupancy | `src/content/default-locale-en.ts:385` |
| `hud.status.occupancy-value` | {value} of {capacity} | `src/content/default-locale-en.ts:386` |
| `hud.status.incidents-clear` | Clear | `src/content/default-locale-en.ts:387` |
| `hud.status.incidents-active` | Active | `src/content/default-locale-en.ts:388` |
| `hud.clock.title` | Time controls | `src/content/default-locale-en.ts:390` |
| `hud.clock.day-progress` | Through the day | `src/content/default-locale-en.ts:393` |
| `hud.clock.day` | Day | `src/content/default-locale-en.ts:394` |
| `hud.clock.speed` | Speed {speed}× | `src/content/default-locale-en.ts:414` |
| `hud.clock.paused` | PAUSED | `src/content/default-locale-en.ts:419` |
| `hud.transport.pause` | Pause | `src/content/default-locale-en.ts:420` |
| `hud.transport.play` | Play at normal speed | `src/content/default-locale-en.ts:421` |
| `hud.transport.fast-forward` | Fast forward | `src/content/default-locale-en.ts:422` |
| `hud.tabs.title` | Prison sections | `src/content/default-locale-en.ts:424` |
| `hud.tab.overview` | Overview | `src/content/default-locale-en.ts:494` |
| `hud.tab.build` | Build | `src/content/default-locale-en.ts:495` |
| `hud.tab.zones` | Zones | `src/content/default-locale-en.ts:496` |
| `hud.tab.manage` | Manage | `src/content/default-locale-en.ts:497` |
| `hud.tab.day-plan` | Schedule | `src/content/default-locale-en.ts:498` |
| `hud.layout.title` | Settings | `src/content/default-locale-en.ts:566` |
| `hud.layout.menu` | Open the settings menu | `src/content/default-locale-en.ts:567` |
| `hud.layout.navigation-width` | Navigation width | `src/content/default-locale-en.ts:568` |
| `hud.layout.inspector-width` | Panel width | `src/content/default-locale-en.ts:569` |
| `hud.layout.inspector-height` | Panel height | `src/content/default-locale-en.ts:570` |
| `hud.layout.reset` | Reset layout | `src/content/default-locale-en.ts:571` |
| `hud.layout.map-only` | Map only | `src/content/default-locale-en.ts:572` |
| `hud.layout.hide-navigation` | Hide the sections | `src/content/default-locale-en.ts:573` |
| `hud.layout.show-navigation` | Show the sections | `src/content/default-locale-en.ts:574` |
| `hud.layout.hide-inspector` | Hide the panels | `src/content/default-locale-en.ts:575` |
| `hud.layout.show-inspector` | Show the panels | `src/content/default-locale-en.ts:576` |
| `hud.layout.hide-metrics` | Hide the counters and the clock | `src/content/default-locale-en.ts:577` |
| `hud.layout.show-metrics` | Show the counters and the clock | `src/content/default-locale-en.ts:578` |
| `hud.layout.resize-navigation` | Resize the sections | `src/content/default-locale-en.ts:579` |
| `hud.layout.resize-inspector` | Resize the panels | `src/content/default-locale-en.ts:580` |
| `hud.zoom.title` | Zoom | `src/content/default-locale-en.ts:621` |
| `hud.zoom.in` | Zoom in | `src/content/default-locale-en.ts:622` |
| `hud.zoom.out` | Zoom out | `src/content/default-locale-en.ts:623` |
| `hud.minimap.title` | Minimap | `src/content/default-locale-en.ts:625` |
| `hud.minimap.placeholder` | No map is drawn here yet — pressing may move the camera | `src/content/default-locale-en.ts:649` |
| `hud.minimap.navigable` | No map is drawn here yet — press to jump the camera there | `src/content/default-locale-en.ts:695` |
| `hud.alerts.title` | Alerts | `src/content/default-locale-en.ts:696` |
| `hud.alerts.empty` | No active alerts | `src/content/default-locale-en.ts:697` |
| `hud.alerts.unknown` | No prison is reporting. | `src/content/default-locale-en.ts:732` |
| `hud.alert.occurrences` | {count}× | `src/content/default-locale-en.ts:778` |
| `hud.alert.time` | Day {day} | `src/content/default-locale-en.ts:779` |
| `hud.alert.dismiss` | Clear this alert | `src/content/default-locale-en.ts:808` |
| `hud.alert.refusal.admit.no-accommodation` | Nobody was admitted — there is no room to put a prisoner in yet. | `src/content/default-locale-en.ts:832` |
| `hud.alert.refusal.admit.population-full` | Nobody was admitted — this prison is holding as many people as it can. | `src/content/default-locale-en.ts:833` |
| `hud.alert.refusal.build.duplicate-order` | The build order failed — that order already exists. | `src/content/default-locale-en.ts:844` |
| `hud.alert.refusal.build.out-of-bounds` | The build order failed — that tile is outside the map. | `src/content/default-locale-en.ts:845` |
| `hud.alert.refusal.build.unbuildable` | The build order failed — nothing can be built on that tile. | `src/content/default-locale-en.ts:846` |
| `hud.alert.refusal.build.unbuildable-terrain` | The build order failed — the ground there cannot be built on. | `src/content/default-locale-en.ts:847` |
| `hud.alert.refusal.build.unknown-buildable` | The build order failed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:863` |
| `hud.alert.refusal.build.unowned-land` | The build order failed — you do not own that land. | `src/content/default-locale-en.ts:864` |
| `hud.alert.refusal.build.water-blocked` | The build order failed — there is water on that tile. | `src/content/default-locale-en.ts:865` |
| `hud.alert.refusal.cancel-build-order.stale-cancellation` | Nothing was refunded — this order moved on before the cancellation reached it. Press Cancel again to see what it pays now. | `src/content/default-locale-en.ts:885` |
| `hud.alert.refusal.cancel-purchase.not-pending` | Nothing was refunded — that delivery is not on its way any more. | `src/content/default-locale-en.ts:902` |
| `hud.alert.refusal.construction.materials-unfunded` | The build queue is stalled — no more materials until the prison earns the money. | `src/content/default-locale-en.ts:950` |
| `hud.alert.refusal.hire.insufficient-funds` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:1061` |
| `hud.alert.refusal.hire.no-duty-for-role` | Nobody was hired — only security staff can hold a post, and this prison has no other work for that role. | `src/content/default-locale-en.ts:1067` |
| `hud.alert.refusal.hire.roster-full` | Nobody was hired — this prison cannot hold any more staff. | `src/content/default-locale-en.ts:1068` |
| `hud.alert.refusal.hire.unknown-role` | Nobody was hired — that is not a role this prison knows. | `src/content/default-locale-en.ts:1069` |
| `hud.alert.refusal.place-object.duplicate-order` | The object was not placed — that order already exists. | `src/content/default-locale-en.ts:1076` |
| `hud.alert.refusal.place-object.not-a-placeable-object` | The object was not placed — that is not something built by placing it on a tile. | `src/content/default-locale-en.ts:1077` |
| `hud.alert.refusal.place-object.out-of-bounds` | The object was not placed — part of it would be outside the map. | `src/content/default-locale-en.ts:1078` |
| `hud.alert.refusal.place-object.outside-room` | The object was not placed — it has to stand in a room you have zoned. | `src/content/default-locale-en.ts:1079` |
| `hud.alert.refusal.place-object.tile-occupied` | The object was not placed — something is already standing there. | `src/content/default-locale-en.ts:1080` |
| `hud.alert.refusal.place-object.unknown-buildable` | The object was not placed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:1081` |
| `hud.alert.refusal.place-object.unowned-land` | The object was not placed — you do not own all of that land. | `src/content/default-locale-en.ts:1082` |
| `hud.alert.refusal.remove-object.nothing-to-remove` | Nothing was removed — there is no object on that tile, and none being built there. | `src/content/default-locale-en.ts:1092` |
| `hud.alert.refusal.remove-wall.nothing-to-remove` | Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either. | `src/content/default-locale-en.ts:1110` |
| `hud.alert.refusal.purchase.duplicate-order` | The materials were not ordered — that order already exists. | `src/content/default-locale-en.ts:1112` |
| `hud.alert.refusal.purchase.insufficient-funds` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:1122` |
| `hud.alert.refusal.purchase.invalid-quantity` | The materials were not ordered — that quantity cannot be bought. | `src/content/default-locale-en.ts:1123` |
| `hud.alert.refusal.purchase.unknown-material` | The materials were not ordered — that material is not for sale. | `src/content/default-locale-en.ts:1124` |
| `hud.alert.refusal.sell.insufficient-stock` | Nothing was sold — the prison does not have that much in store. | `src/content/default-locale-en.ts:1142` |
| `hud.alert.refusal.sell.invalid-quantity` | Nothing was sold — that quantity cannot be sold. | `src/content/default-locale-en.ts:1143` |
| `hud.alert.refusal.sell.unknown-material` | Nothing was sold — that material has no buyer. | `src/content/default-locale-en.ts:1144` |
| `hud.alert.refusal.dismiss.unknown-staff` | Nobody was dismissed — that staff member is not on the roster. | `src/content/default-locale-en.ts:1163` |
| `hud.alert.refusal.edit-regime-block.unknown-block` | Nothing was changed — that part of the day is not a block on this timetable. | `src/content/default-locale-en.ts:1184` |
| `hud.alert.refusal.edit-regime-block.unknown-group` | Nothing was changed — this prison has no timetable for that group. | `src/content/default-locale-en.ts:1185` |
| `hud.alert.refusal.release-guard.not-held` | Nothing was released — that guard is already off duty. | `src/content/default-locale-en.ts:1186` |
| `hud.alert.refusal.release-guard.unknown-guard` | Nothing was released — that guard is not on the roster. | `src/content/default-locale-en.ts:1187` |
| `hud.alert.refusal.zone.duplicate-instance-id` | The room was not zoned — a room is already recorded on that tile. | `src/content/default-locale-en.ts:1192` |
| `hud.alert.refusal.zone.invalid-area` | The room was not zoned — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1193` |
| `hud.alert.refusal.zone.out-of-bounds` | The room was not zoned — part of that area is outside the map. | `src/content/default-locale-en.ts:1194` |
| `hud.alert.refusal.zone.overlaps-existing-room` | The room was not zoned — it overlaps a room that is already there. | `src/content/default-locale-en.ts:1195` |
| `hud.alert.refusal.zone.unknown-room-type` | The room was not zoned — that is not a room type this prison knows. | `src/content/default-locale-en.ts:1196` |
| `hud.alert.refusal.zone.unowned-land` | The room was not zoned — you do not own all of that land. | `src/content/default-locale-en.ts:1197` |
| `hud.alert.refusal.zone.below-minimum-size` | The room was not zoned — that area is smaller than this room type allows. | `src/content/default-locale-en.ts:1204` |
| `hud.alert.refusal.zone.not-enclosed` | The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side. | `src/content/default-locale-en.ts:1215` |
| `hud.alert.refusal.unzone.invalid-area` | Nothing was removed — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1220` |
| `hud.alert.refusal.unzone.nothing-to-remove` | Nothing was removed — there is no room in that area. | `src/content/default-locale-en.ts:1221` |
| `hud.alert.refusal.unzone.room-occupied` | Nothing was removed — somebody is using that room. | `src/content/default-locale-en.ts:1222` |
| `hud.alert.fault.invalid-message` | A simulation message was rejected — it was not a message this game understands. | `src/content/default-locale-en.ts:1247` |
| `hud.alert.fault.unsupported-protocol-version` | A simulation message was rejected — it was written for a different version of the game. | `src/content/default-locale-en.ts:1248` |
| `hud.alert.fault.unknown-message-kind` | A simulation message was rejected — this build does not know that kind of message. | `src/content/default-locale-en.ts:1249` |
| `hud.alert.fault.invalid-payload` | A simulation message was rejected — its contents were not what that message must carry. | `src/content/default-locale-en.ts:1250` |
| `hud.alert.fault.not-initialized` | A simulation request was refused — no prison is loaded yet. | `src/content/default-locale-en.ts:1251` |
| `hud.alert.fault.already-initialized` | A simulation request was refused — this session already has a prison loaded. | `src/content/default-locale-en.ts:1252` |
| `hud.alert.fault.duplicate-message` | A command was refused — it had already been sent. | `src/content/default-locale-en.ts:1253` |
| `hud.alert.fault.sequence-gap` | A command was refused — a command sent before it never arrived. | `src/content/default-locale-en.ts:1254` |
| `hud.alert.fault.invalid-state` | A simulation request was refused — the simulation cannot do that right now. | `src/content/default-locale-en.ts:1255` |
| `hud.alert.fault.snapshot-incompatible` | The save could not be loaded — this build does not understand its format. | `src/content/default-locale-en.ts:1256` |
| `hud.alert.fault.shutting-down` | A simulation request was refused — the session is shutting down. | `src/content/default-locale-en.ts:1257` |
| `hud.alert.fault.internal-error` | The simulation hit an internal error. | `src/content/default-locale-en.ts:1258` |
| `hud.alert.event.prisoners.discharged` | {count} released — their sentences are served. | `src/content/default-locale-en.ts:1275` |
| `hud.alert.event.economy.wages-unpaid` | Payday went unpaid — your staff are owed {total}. | `src/content/default-locale-en.ts:1276` |
| `hud.alert.event.economy.deliveries-refused` | Deliveries refused — the treasury cannot cover a purchase right now. | `src/content/default-locale-en.ts:1294` |
| `hud.alert.event.economy.construction-refused` | Construction halted — the treasury cannot fund the build queue right now. | `src/content/default-locale-en.ts:1295` |
| `hud.alert.event.economy.deliveries-restored` | The treasury has climbed back above the deliveries floor. | `src/content/default-locale-en.ts:1335` |
| `hud.alert.event.economy.construction-restored` | The treasury has climbed back above the construction floor. | `src/content/default-locale-en.ts:1336` |
| `hud.alert.event.construction.order-cancelled` | The order was cancelled — the money it cost is refunded. | `src/content/default-locale-en.ts:1455` |
| `hud.alert.event.construction.order-cancelled-underway` | The order was cancelled. Anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1456` |
| `hud.alert.event.construction.order-completed` | The order was completed. | `src/content/default-locale-en.ts:1516` |
| `hud.alert.event.construction.undo-refused-newer-action` | Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one. | `src/content/default-locale-en.ts:1545` |
| `hud.alert.event.construction.undone` | The last change to the build queue was undone. | `src/content/default-locale-en.ts:1547` |
| `hud.alert.event.construction.undone-spend-destroyed` | The last change to the build queue was undone — anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1548` |
| `hud.alert.event.construction.redone` | The last change to the build queue was redone. | `src/content/default-locale-en.ts:1550` |
| `hud.alert.event.economy.delivery-cancelled` | The delivery was cancelled — {total} back. | `src/content/default-locale-en.ts:1551` |
| `hud.alert.event.objects.removed-spend-destroyed` | The object was removed — the money it cost does not come back. | `src/content/default-locale-en.ts:1634` |
| `hud.alert.event.prisoners.relocated` | {name} had nowhere to sleep and moved to {room}. | `src/content/default-locale-en.ts:1657` |
| `hud.alert.event.prisoners.housed` | {name} has a place in {room}. | `src/content/default-locale-en.ts:1710` |
| `hud.alert.event.rooms.zoned` | {room} designated. | `src/content/default-locale-en.ts:1765` |
| `hud.alert.event.rooms.needs-cleared` | {room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in. | `src/content/default-locale-en.ts:1844` |
| `hud.alert.event.rooms.unzoned` | {room} removed. | `src/content/default-locale-en.ts:1881` |
| `hud.alert.event.incidents.riot-opened` | A riot has broken out — {count} prisoners have stopped taking orders. | `src/content/default-locale-en.ts:1904` |
| `hud.alert.event.incidents.assault-opened` | A fight has broken out between two prisoners. | `src/content/default-locale-en.ts:1905` |
| `hud.alert.event.incidents.escape-attempt-opened` | A prisoner is trying to break out. | `src/content/default-locale-en.ts:1906` |
| `hud.alert.event.incidents.gang-retaliation-opened` | Two gangs are settling a score. | `src/content/default-locale-en.ts:1907` |
| `hud.alert.event.incidents.all-clear` | The prison is under control again — no incident is still open. | `src/content/default-locale-en.ts:1908` |
| `hud.alert.event.incidents.all-clear-after-lapse` | No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. | `src/content/default-locale-en.ts:1959` |
| `hud.alert.event.incidents.escape-succeeded` | {name} broke out — no guard reached them in time. | `src/content/default-locale-en.ts:1996` |
| `hud.alert.event.contraband.discovered` | Contraband found: {item}. | `src/content/default-locale-en.ts:2031` |
| `hud.unavailable.simulation` | Simulation unavailable — this browser could not start it, so nothing can run or be saved | `src/content/default-locale-en.ts:2057` |
| `hud.panel.collapse` | Collapse | `src/content/default-locale-en.ts:2059` |
| `hud.panel.expand` | Expand | `src/content/default-locale-en.ts:2060` |
| `hud.build.title` | Build | `src/content/default-locale-en.ts:2062` |
| `hud.build.catalogue` | What to build | `src/content/default-locale-en.ts:2063` |
| `hud.build.catalogue-empty` | Nothing is available to build | `src/content/default-locale-en.ts:2064` |
| `hud.build.selected` | Selected | `src/content/default-locale-en.ts:2065` |
| `hud.build.catalogue-row-price` | {buildable} · {total} | `src/content/default-locale-en.ts:2100` |
| `hud.build.catalogue-row-price-segment` | {buildable} · {total} per segment | `src/content/default-locale-en.ts:2121` |
| `hud.build.placement` | Where | `src/content/default-locale-en.ts:2122` |
| `hud.build.tile-x` | Tile X | `src/content/default-locale-en.ts:2123` |
| `hud.build.tile-y` | Tile Y | `src/content/default-locale-en.ts:2124` |
| `hud.build.step-down` | Decrease {field} | `src/content/default-locale-en.ts:2125` |
| `hud.build.step-up` | Increase {field} | `src/content/default-locale-en.ts:2126` |
| `hud.build.edge` | Edge | `src/content/default-locale-en.ts:2127` |
| `hud.build.submit` | Place order | `src/content/default-locale-en.ts:2128` |
| `hud.build.note` | An order is queued now and built while the clock runs. | `src/content/default-locale-en.ts:2129` |
| `hud.build.arm` | Place on map | `src/content/default-locale-en.ts:2130` |
| `hud.build.remove` | Remove | `src/content/default-locale-en.ts:2171` |
| `hud.build.remove-active` | Stop removing | `src/content/default-locale-en.ts:2172` |
| `hud.build.remove-hint` | Press any tile of an object, or a finished wall, to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded. | `src/content/default-locale-en.ts:2196` |
| `hud.build.remove-submit` | Remove object here | `src/content/default-locale-en.ts:2197` |
| `hud.build.disarm` | Stop placing | `src/content/default-locale-en.ts:2198` |
| `hud.build.arm-hint` | Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2199` |
| `hud.build.arm-hint-object` | Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2235` |
| `hud.build.target-none` | Point at the world | `src/content/default-locale-en.ts:2237` |
| `hud.build.target-value` | {x}, {y} · {edge} | `src/content/default-locale-en.ts:2238` |
| `hud.build.target-run` | {count} × {edge} from {x}, {y} | `src/content/default-locale-en.ts:2239` |
| `hud.build.target-tile` | {x}, {y} | `src/content/default-locale-en.ts:2240` |
| `hud.build.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:2241` |
| `hud.build.coordinates-hint` | The keyboard route. Pointing at the map is quicker. | `src/content/default-locale-en.ts:2242` |
| `hud.build.buy` | Buy | `src/content/default-locale-en.ts:2243` |
| `hud.build.buy-quantity` | Quantity | `src/content/default-locale-en.ts:2244` |
| `hud.build.buy-submit` | Buy {count} × {material} · {total} | `src/content/default-locale-en.ts:2245` |
| `hud.build.buy-hint` | Arrives while the clock runs, into the stock a build draws from. | `src/content/default-locale-en.ts:2246` |
| `hud.build.sell` | Sell | `src/content/default-locale-en.ts:2281` |
| `hud.build.sell-submit` | Sell {count} × {material} · {total} | `src/content/default-locale-en.ts:2282` |
| `hud.build.buy-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2322` |
| `hud.build.queue` | Queued | `src/content/default-locale-en.ts:2389` |
| `hud.build.queue-count` | {count} waiting · {started} being built | `src/content/default-locale-en.ts:2390` |
| `hud.build.queue-order` | {buildable} · {x}, {y} · {edge} · {total} back | `src/content/default-locale-en.ts:2391` |
| `hud.build.queue-cancel` | Cancel | `src/content/default-locale-en.ts:2392` |
| `hud.build.queue-unnamed` | Unnamed order | `src/content/default-locale-en.ts:2393` |
| `hud.build.queue-more` | and {count} more behind these — undo takes back a whole run. | `src/content/default-locale-en.ts:2394` |
| `hud.build.queue-shortfall` | Waiting for {total} to unblock the next order. | `src/content/default-locale-en.ts:2395` |
| `hud.build.deliveries` | On the way | `src/content/default-locale-en.ts:2422` |
| `hud.build.deliveries-count` | {count} bought · {total} back if cancelled | `src/content/default-locale-en.ts:2423` |
| `hud.build.delivery` | {count} × {material} · {total} back | `src/content/default-locale-en.ts:2424` |
| `hud.build.delivery-cancel` | Cancel | `src/content/default-locale-en.ts:2425` |
| `hud.build.delivery-unnamed` | Unnamed material | `src/content/default-locale-en.ts:2426` |
| `hud.build.deliveries-more` | and {count} more on the way — these arrive first, and the rest come into view as they land. | `src/content/default-locale-en.ts:2427` |
| `hud.build.buildable.wall-brick` | Brick wall | `src/content/default-locale-en.ts:2428` |
| `hud.build.buildable.door-wooden` | Wooden door | `src/content/default-locale-en.ts:2429` |
| `hud.build.category` | Category | `src/content/default-locale-en.ts:2442` |
| `hud.build.category-all` | Everything | `src/content/default-locale-en.ts:2443` |
| `hud.build.category.structure` | Walls and doors | `src/content/default-locale-en.ts:2444` |
| `hud.overview.title` | Finances | `src/content/default-locale-en.ts:2495` |
| `hud.overview.none` | No prison is reporting. | `src/content/default-locale-en.ts:2496` |
| `hud.overview.wages` | Wages a day | `src/content/default-locale-en.ts:2497` |
| `hud.intake.title` | Intake | `src/content/default-locale-en.ts:2499` |
| `hud.intake.admit` | Admit a prisoner | `src/content/default-locale-en.ts:2500` |
| `hud.intake.hint` | A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free. | `src/content/default-locale-en.ts:2501` |
| `hud.intake.no-place` | {count} waiting with no bed to sleep in | `src/content/default-locale-en.ts:2509` |
| `hud.intake.pipeline` | In intake | `src/content/default-locale-en.ts:2514` |
| `hud.intake.pipeline-count` | {waiting} of {total} | `src/content/default-locale-en.ts:2515` |
| `hud.intake.pipeline-stage` | {count} at {stage} | `src/content/default-locale-en.ts:2516` |
| `hud.intake.pipeline-failed` | {count} cannot be housed at all | `src/content/default-locale-en.ts:2521` |
| `hud.security.staff` | Staff | `src/content/default-locale-en.ts:2529` |
| `hud.security.roles` | Who to hire | `src/content/default-locale-en.ts:2530` |
| `hud.security.roles-empty` | Nobody can be hired yet. | `src/content/default-locale-en.ts:2531` |
| `hud.security.selected` | Selected | `src/content/default-locale-en.ts:2532` |
| `hud.security.hire` | Hire {role} · {total} | `src/content/default-locale-en.ts:2533` |
| `hud.security.hire-hint` | Costs {total} now and {wage} a day in wages, including today. | `src/content/default-locale-en.ts:2591` |
| `hud.security.hire-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2603` |
| `hud.security.hire-unassigned` | A new guard starts unassigned. | `src/content/default-locale-en.ts:2626` |
| `hud.security.held` | On duty | `src/content/default-locale-en.ts:2634` |
| `hud.security.held-summary` | {held} held · {unassigned} free | `src/content/default-locale-en.ts:2635` |
| `hud.security.held-empty` | Nobody is assigned right now. | `src/content/default-locale-en.ts:2636` |
| `hud.security.held-row` | {name} · {claim} | `src/content/default-locale-en.ts:2637` |
| `hud.security.held-row-unnamed` | Guard {id} · {claim} | `src/content/default-locale-en.ts:2638` |
| `hud.security.held-release` | Release | `src/content/default-locale-en.ts:2639` |
| `hud.security.held-more` | and {count} more | `src/content/default-locale-en.ts:2640` |
| `hud.security.held-hint` | A released guard stays hired and goes back to the pool. | `src/content/default-locale-en.ts:2641` |
| `hud.security.roster` | On the payroll | `src/content/default-locale-en.ts:2680` |
| `hud.security.roster-wage-bill` | {total} a day | `src/content/default-locale-en.ts:2701` |
| `hud.security.roster-dismiss` | Dismiss | `src/content/default-locale-en.ts:2702` |
| `hud.security.roster-dismiss-confirm` | Dismiss {name}? Their wage stops and they do not come back. | `src/content/default-locale-en.ts:2731` |
| `hud.security.roster-hint` | A dismissed staff member leaves the prison for good, and their wage stops. | `src/content/default-locale-en.ts:2732` |
| `hud.security.coverage` | Guard coverage | `src/content/default-locale-en.ts:2742` |
| `hud.security.coverage-summary` | {assigned} of {required} | `src/content/default-locale-en.ts:2743` |
| `hud.security.coverage-met` | Covered | `src/content/default-locale-en.ts:2744` |
| `hud.security.coverage-met-hint` | Incidents and searches need free guards. | `src/content/default-locale-en.ts:2917` |
| `hud.security.coverage-short` | Understaffed | `src/content/default-locale-en.ts:2918` |
| `hud.security.coverage-short-hint` | Hire {count} more to cover this population. | `src/content/default-locale-en.ts:2919` |
| `hud.security.coverage-unguarded` | Unguarded | `src/content/default-locale-en.ts:2920` |
| `hud.security.coverage-unguarded-hint` | Nobody is on duty. Hire {count} to cover this population. | `src/content/default-locale-en.ts:2921` |
| `hud.security.post-unreachable` | Post cut off | `src/content/default-locale-en.ts:2950` |
| `hud.security.post-unreachable-hint` | No guard can reach the post, so nobody is on duty. Taking down a wall beside it opens the way back. | `src/content/default-locale-en.ts:2951` |
| `hud.security.coverage-unguarded-consequence` | No guard is posted here, so nobody in this sector is kept safe. | `src/content/default-locale-en.ts:3000` |
| `hud.regime.title` | Regime | `src/content/default-locale-en.ts:3016` |
| `hud.regime.blocks` | Today's blocks | `src/content/default-locale-en.ts:3017` |
| `hud.regime.block-allows` | Allows {categories} | `src/content/default-locale-en.ts:3018` |
| `hud.regime.block-progress` | {percent}% through | `src/content/default-locale-en.ts:3019` |
| `hud.regime.category-separator` | ,  | `src/content/default-locale-en.ts:3022` |
| `hud.regime.sentence-remaining` | Sentence remaining (in-game days): {days} | `src/content/default-locale-en.ts:3025` |
| `hud.regime.roster` | Prisoners | `src/content/default-locale-en.ts:3038` |
| `hud.regime.roster-count` | {shown} of {total} | `src/content/default-locale-en.ts:3039` |
| `hud.regime.roster-name` | {given} {family} | `src/content/default-locale-en.ts:3040` |
| `hud.regime.roster-unnamed` | Prisoner {id} | `src/content/default-locale-en.ts:3041` |
| `hud.regime.roster-heading` | Heading to {activity} | `src/content/default-locale-en.ts:3042` |
| `hud.regime.roster-more` | and {count} more | `src/content/default-locale-en.ts:3043` |
| `hud.regime.roster-empty` | No prisoners yet. Build a cell with a bed to take somebody in. | `src/content/default-locale-en.ts:3075` |
| `hud.regime.roster-emptied` | This prison is empty. Take somebody in to start again. | `src/content/default-locale-en.ts:3112` |
| `hud.refusal.set-clock` | The clock did not change — the request was refused. | `src/content/default-locale-en.ts:3127` |
| `hud.refusal.place-build-order` | The build order was not placed — the request was refused. | `src/content/default-locale-en.ts:3128` |
| `hud.refusal.purchase-materials` | Nothing was bought — the purchase was refused and no money was spent. | `src/content/default-locale-en.ts:3129` |
| `hud.refusal.hire-staff` | Nobody was hired — the request was refused and no money was spent. | `src/content/default-locale-en.ts:3130` |
| `hud.refusal.purchase-materials-past-floor` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:3153` |
| `hud.refusal.hire-staff-past-floor` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:3154` |
| `hud.refusal.undo` | Nothing was undone — the request was refused. | `src/content/default-locale-en.ts:3155` |
| `hud.refusal.redo` | Nothing was redone — the request was refused. | `src/content/default-locale-en.ts:3156` |
| `hud.refusal.zone-room` | The room was not designated — the request was refused. | `src/content/default-locale-en.ts:3157` |
| `hud.refusal.unzone-room` | Nothing was removed — the request was refused. | `src/content/default-locale-en.ts:3158` |
| `hud.refusal.admit-prisoner` | Nobody was admitted — the request was refused. | `src/content/default-locale-en.ts:3159` |
| `hud.refusal.admit-prisoner-no-room` | Nobody was admitted — this prison has no room to hold anybody. | `src/content/default-locale-en.ts:3175` |
| `hud.refusal.cancel-build-order` | The order is still queued — the request was refused. | `src/content/default-locale-en.ts:3176` |
| `hud.refusal.cancel-material-purchase` | Nothing was refunded — the request was refused and the delivery is still on its way. | `src/content/default-locale-en.ts:3182` |
| `hud.refusal.sell-materials` | Nothing was sold — the request was refused and nothing was taken from stock. | `src/content/default-locale-en.ts:3189` |
| `hud.refusal.release-guard` | Nobody was released — the request was refused and the guard is still assigned. | `src/content/default-locale-en.ts:3190` |
| `hud.rooms.title` | Rooms | `src/content/default-locale-en.ts:3192` |
| `hud.rooms.catalogue` | Room type and area | `src/content/default-locale-en.ts:3196` |
| `hud.rooms.catalogue-empty` | No room types are available | `src/content/default-locale-en.ts:3197` |
| `hud.rooms.selected` | Selected | `src/content/default-locale-en.ts:3198` |
| `hud.rooms.arm` | Draw on map | `src/content/default-locale-en.ts:3199` |
| `hud.rooms.disarm` | Stop drawing | `src/content/default-locale-en.ts:3200` |
| `hud.rooms.arm-hint` | Drag a rectangle across the tiles this room should cover. | `src/content/default-locale-en.ts:3201` |
| `hud.rooms.remove` | Remove rooms | `src/content/default-locale-en.ts:3202` |
| `hud.rooms.remove-active` | Stop removing | `src/content/default-locale-en.ts:3203` |
| `hud.rooms.remove-hint` | Drag across any part of a room to remove all of it. | `src/content/default-locale-en.ts:3212` |
| `hud.rooms.area` | Area | `src/content/default-locale-en.ts:3213` |
| `hud.rooms.area-none` | Nothing selected | `src/content/default-locale-en.ts:3214` |
| `hud.rooms.area-value` | {width} × {height} tiles at {x}, {y} | `src/content/default-locale-en.ts:3215` |
| `hud.rooms.confirm` | Designate {width} × {height} | `src/content/default-locale-en.ts:3216` |
| `hud.rooms.confirm-remove` | Remove {width} × {height} | `src/content/default-locale-en.ts:3219` |
| `hud.rooms.cancel` | Discard | `src/content/default-locale-en.ts:3220` |
| `hud.rooms.minimum` | Needs at least {width} × {height} tiles | `src/content/default-locale-en.ts:3221` |
| `hud.rooms.minimum-none` | No minimum size | `src/content/default-locale-en.ts:3222` |
| `hud.rooms.too-small` | Too small — this room needs at least {width} × {height} tiles. | `src/content/default-locale-en.ts:3223` |
| `hud.rooms.enclosure` | Enclosure | `src/content/default-locale-en.ts:3224` |
| `hud.rooms.enclosure-none` | Not evaluated yet | `src/content/default-locale-en.ts:3225` |
| `hud.rooms.enclosure-sealed` | Walled in — not a door check | `src/content/default-locale-en.ts:3268` |
| `hud.rooms.enclosure-open` | Open on at least one side | `src/content/default-locale-en.ts:3269` |
| `hud.rooms.requirement-enclosed` | Must be enclosed | `src/content/default-locale-en.ts:3270` |
| `hud.rooms.requirement-outdoors` | Must be outdoors | `src/content/default-locale-en.ts:3271` |
| `hud.rooms.requirement-none` | No enclosure rule | `src/content/default-locale-en.ts:3272` |
| `hud.rooms.requires-object` | Needs {count} × {object} | `src/content/default-locale-en.ts:3279` |
| `hud.rooms.requires-none` | No objects needed | `src/content/default-locale-en.ts:3284` |
| `hud.rooms.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:3288` |
| `hud.rooms.coordinates-hint` | The keyboard route. Dragging on the map is quicker. | `src/content/default-locale-en.ts:3289` |
| `hud.rooms.coordinates-submit` | Use these tiles | `src/content/default-locale-en.ts:3294` |
| `hud.rooms.tile-x` | Tile X | `src/content/default-locale-en.ts:3295` |
| `hud.rooms.tile-y` | Tile Y | `src/content/default-locale-en.ts:3296` |
| `hud.rooms.width` | Width | `src/content/default-locale-en.ts:3297` |
| `hud.rooms.height` | Height | `src/content/default-locale-en.ts:3298` |
| `hud.rooms.step-down` | Decrease {field} | `src/content/default-locale-en.ts:3299` |
| `hud.rooms.step-up` | Increase {field} | `src/content/default-locale-en.ts:3300` |
| `hud.rooms.needs` | Not ready | `src/content/default-locale-en.ts:3305` |
| `hud.rooms.needs-count` | {unfinished} of {total} | `src/content/default-locale-en.ts:3306` |
| `hud.rooms.needs-room` | {room} at {x}, {y} is missing | `src/content/default-locale-en.ts:3311` |
| `hud.rooms.needs-object` | {count} × {object} | `src/content/default-locale-en.ts:3315` |
| `hud.rooms.needs-object-uncounted` | {object} | `src/content/default-locale-en.ts:3320` |
| `hud.rooms.needs-item-more` | and {count} more | `src/content/default-locale-en.ts:3325` |
| `hud.rooms.needs-object-unknown` | something this build cannot name | `src/content/default-locale-en.ts:3329` |
| `hud.rooms.needs-doorway` | a door — nobody can get in | `src/content/default-locale-en.ts:3356` |
| `hud.rooms.needs-unreachable` | a way in — nothing outside can reach its door | `src/content/default-locale-en.ts:3398` |
| `hud.rooms.at-capacity` | At capacity | `src/content/default-locale-en.ts:3458` |
| `hud.rooms.at-capacity-count` | {full} of {total} | `src/content/default-locale-en.ts:3459` |
| `hud.rooms.at-capacity-room` | {room} at {x}, {y} is full | `src/content/default-locale-en.ts:3460` |
| `hud.rooms.at-capacity-places` | places in use: {inUse} of {capacity} | `src/content/default-locale-en.ts:3461` |
| `hud.severity.info` | Info | `src/content/default-locale-en.ts:3463` |
| `hud.severity.warning` | Warning | `src/content/default-locale-en.ts:3464` |
| `hud.severity.danger` | Critical | `src/content/default-locale-en.ts:3465` |
| `save.panel.region` | Prison saves | `src/content/default-locale-en.ts:3480` |
| `save.panel.title` | Prisons | `src/content/default-locale-en.ts:3481` |
| `save.action.create` | New prison | `src/content/default-locale-en.ts:3483` |
| `save.action.save` | Save now | `src/content/default-locale-en.ts:3484` |
| `save.action.export` | Export | `src/content/default-locale-en.ts:3485` |
| `save.action.import` | Import | `src/content/default-locale-en.ts:3486` |
| `save.action.load` | Load | `src/content/default-locale-en.ts:3487` |
| `save.action.delete` | Delete | `src/content/default-locale-en.ts:3488` |
| `save.action.delete-confirm` | Delete permanently | `src/content/default-locale-en.ts:3492` |
| `save.action.delete-cancel` | Keep | `src/content/default-locale-en.ts:3493` |
| `save.list.empty` | No prisons yet. | `src/content/default-locale-en.ts:3495` |
| `save.list.item` | {name} ({count} gen) | `src/content/default-locale-en.ts:3496` |
| `save.status.idle` | Local saves only — no network required. | `src/content/default-locale-en.ts:3498` |
| `save.status.saved` | Saved (generation {generation}). | `src/content/default-locale-en.ts:3499` |
| `save.status.quota-exceeded` | Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact. | `src/content/default-locale-en.ts:3504` |
| `save.status.transaction-aborted` | The browser interrupted the save. Your previous save is intact — try saving again. | `src/content/default-locale-en.ts:3506` |
| `save.status.changed-elsewhere` | Could not save: this prison was changed elsewhere. | `src/content/default-locale-en.ts:3520` |
| `save.status.save-failed` | Save failed: {detail} | `src/content/default-locale-en.ts:3521` |
| `save.status.list-unreadable` | Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail} | `src/content/default-locale-en.ts:3525` |
| `save.status.creating` | Creating prison… | `src/content/default-locale-en.ts:3527` |
| `save.status.create-failed` | Could not create a prison: {detail} | `src/content/default-locale-en.ts:3528` |
| `save.status.no-active-prison` | No active prison — create or load one first. | `src/content/default-locale-en.ts:3529` |
| `save.status.saving` | Saving… | `src/content/default-locale-en.ts:3530` |
| `save.status.loading` | Loading… | `src/content/default-locale-en.ts:3531` |
| `save.status.not-found` | That prison no longer exists. | `src/content/default-locale-en.ts:3532` |
| `save.status.no-readable-generation` | No readable save generation remains for this prison. Every retained copy failed validation. | `src/content/default-locale-en.ts:3533` |
| `save.status.recovered` | The most recent save was unreadable — recovered an earlier verified generation. | `src/content/default-locale-en.ts:3535` |
| `save.status.loaded` | Loaded. | `src/content/default-locale-en.ts:3536` |
| `save.status.deleted` | Prison deleted. You can bring it back from the list below for one day. | `src/content/default-locale-en.ts:3541` |
| `save.status.delete-kept` | Nothing was deleted. | `src/content/default-locale-en.ts:3545` |
| `save.status.nothing-to-export` | Nothing to export — no valid active save. | `src/content/default-locale-en.ts:3546` |
| `save.status.exported` | Exported the current save. | `src/content/default-locale-en.ts:3547` |
| `save.status.importing` | Reading the save file… | `src/content/default-locale-en.ts:3554` |
| `save.status.imported` | Imported the save file into this prison (generation {generation}). | `src/content/default-locale-en.ts:3555` |
| `save.status.imported-migrated` | Imported a save from an older version of Lockstate and brought it up to date (generation {generation}). | `src/content/default-locale-en.ts:3556` |
| `save.status.import-not-a-save` | That file is not a Lockstate save — choose a file exported from this game. | `src/content/default-locale-en.ts:3558` |
| `save.status.import-unsupported-version` | That save was written by a newer version of Lockstate than this one. Update the game, then import it again. | `src/content/default-locale-en.ts:3559` |
| `save.status.import-corrupt` | That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported. | `src/content/default-locale-en.ts:3561` |
| `save.status.import-invalid` | That save file could not be read: {detail} | `src/content/default-locale-en.ts:3563` |
| `save.failure.create` | Creating the prison failed: {detail} | `src/content/default-locale-en.ts:3565` |
| `save.failure.save` | Saving failed: {detail} | `src/content/default-locale-en.ts:3566` |
| `save.failure.load` | Loading failed: {detail} | `src/content/default-locale-en.ts:3567` |
| `save.failure.delete` | Deleting failed: {detail} | `src/content/default-locale-en.ts:3568` |
| `save.failure.export` | Exporting failed: {detail} | `src/content/default-locale-en.ts:3569` |
| `save.failure.import` | Importing failed: {detail} | `src/content/default-locale-en.ts:3570` |
| `save.failure.restore` | Bringing the prison back failed: {detail} | `src/content/default-locale-en.ts:3571` |
| `save.failure.forget` | Freeing the space failed: {detail} | `src/content/default-locale-en.ts:3572` |
| `save.failure.unknown` | The action failed: {detail} | `src/content/default-locale-en.ts:3573` |
| `save.detail.restored-scope` | Restored: {restored}. Not carried by this save version: {notCarried}. | `src/content/default-locale-en.ts:3580` |
| `save.delete.confirm` | Delete {name}? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed {age}. | `src/content/default-locale-en.ts:3619` |
| `save.delete.age.moments` | less than a minute ago | `src/content/default-locale-en.ts:3624` |
| `save.delete.age.minutes` | {count} min ago | `src/content/default-locale-en.ts:3625` |
| `save.delete.age.hours` | {count} h ago | `src/content/default-locale-en.ts:3626` |
| `save.delete.age.days` | {count} d ago | `src/content/default-locale-en.ts:3627` |
| `save.tombstone.item` | {name} — deleted. You can still bring it back. | `src/content/default-locale-en.ts:3650` |
| `save.action.tombstone-restore` | Bring it back | `src/content/default-locale-en.ts:3651` |
| `save.action.tombstone-forget` | Free its space now | `src/content/default-locale-en.ts:3657` |
| `save.status.tombstone-restored` | {name} is back, exactly as it was. | `src/content/default-locale-en.ts:3668` |
| `save.status.tombstone-window-closed` | Too late — that prison can no longer be brought back. | `src/content/default-locale-en.ts:3672` |
| `save.status.tombstone-slot-taken` | That prison cannot come back — another prison now holds its place, and is still here. | `src/content/default-locale-en.ts:3676` |
| `save.status.tombstone-gone` | That prison is no longer here to bring back. | `src/content/default-locale-en.ts:3679` |
| `save.status.tombstone-forgotten` | Gone for good. Nothing of that prison is kept now. | `src/content/default-locale-en.ts:3683` |
| `save.scope.kernel` | kernel tick and command queue | `src/content/default-locale-en.ts:3702` |
| `save.scope.rng-streams` | RNG stream states | `src/content/default-locale-en.ts:3703` |
| `save.scope.world` | world terrain and ownership | `src/content/default-locale-en.ts:3704` |
| `save.scope.construction` | construction orders and undo/redo | `src/content/default-locale-en.ts:3705` |
| `save.scope.entity-liveness` | entity id liveness | `src/content/default-locale-en.ts:3706` |
| `save.scope.prisoners` | prisoners, needs, actions and cell assignments | `src/content/default-locale-en.ts:3707` |
| `save.scope.operations` | jobs, containers and utility networks | `src/content/default-locale-en.ts:3708` |
| `save.scope.security` | doors, security sectors, guards and patrols | `src/content/default-locale-en.ts:3709` |
| `save.scope.contraband` | contraband, intelligence and searches | `src/content/default-locale-en.ts:3710` |
| `save.scope.incidents` | incidents, gangs and tunnels | `src/content/default-locale-en.ts:3711` |
| `save.scope.names` | prisoner and staff names | `src/content/default-locale-en.ts:3712` |
| `save.scope.room-caches` | room and topology caches (recomputed from the world) | `src/content/default-locale-en.ts:3717` |
| `save.scope.navigation-caches` | navigation caches and in-flight path requests (re-issued on the next tick) | `src/content/default-locale-en.ts:3718` |
| `input.action.camera.up` | Pan camera up | `src/content/default-locale-en.ts:3726` |
| `input.action.camera.down` | Pan camera down | `src/content/default-locale-en.ts:3727` |
| `input.action.camera.left` | Pan camera left | `src/content/default-locale-en.ts:3728` |
| `input.action.camera.right` | Pan camera right | `src/content/default-locale-en.ts:3729` |
| `input.action.camera.zoom.in` | Zoom in | `src/content/default-locale-en.ts:3730` |
| `input.action.camera.zoom.out` | Zoom out | `src/content/default-locale-en.ts:3731` |
| `input.action.selection.primary` | Select | `src/content/default-locale-en.ts:3732` |
| `input.action.build.confirm` | Confirm placement | `src/content/default-locale-en.ts:3733` |
| `input.action.build.cancel` | Cancel | `src/content/default-locale-en.ts:3736` |
| `input.action.edit.undo` | Undo | `src/content/default-locale-en.ts:3740` |
| `input.action.edit.redo` | Redo | `src/content/default-locale-en.ts:3741` |
| `brand.region` | Lockstate build | `src/content/default-locale-en.ts:3746` |
| `brand.wordmark` | LockState.io | `src/content/default-locale-en.ts:3749` |
| `brand.stage` | PRE-ALPHA | `src/content/default-locale-en.ts:3757` |
| `brand.build` | v{version} · {commit} | `src/content/default-locale-en.ts:3766` |
| `brand.description` | Lockstate, {stage} build, version {version}, commit {commit}. | `src/content/default-locale-en.ts:3770` |
| `display.scale.region` | Interface scale | `src/content/default-locale-en.ts:3786` |
| `display.scale.cycle` | Change the interface scale | `src/content/default-locale-en.ts:3787` |
| `display.theme.region` | Theme | `src/content/default-locale-en.ts:3803` |
| `display.theme.system` | System | `src/content/default-locale-en.ts:3804` |
| `display.theme.light` | Light | `src/content/default-locale-en.ts:3805` |
| `display.theme.dark` | Dark | `src/content/default-locale-en.ts:3806` |
| `display.theme.cycle` | Change the interface theme | `src/content/default-locale-en.ts:3807` |
| `display.language.region` | Language | `src/content/default-locale-en.ts:3832` |
| `display.language.automatic` | Automatic ({language}) | `src/content/default-locale-en.ts:3833` |
| `display.language.english` | English | `src/content/default-locale-en.ts:3834` |
| `display.language.polish` | Polski | `src/content/default-locale-en.ts:3835` |
| `display.language.cycle` | Change the interface language and reload the game | `src/content/default-locale-en.ts:3843` |
| `app.shell.label` | Lockstate game application | `src/content/default-locale-en.ts:3853` |

