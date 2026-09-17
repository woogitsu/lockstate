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

## The 532 authored sentences

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
| `hud.tab.security` | Security | `src/content/default-locale-en.ts:511` |
| `hud.layout.title` | Settings | `src/content/default-locale-en.ts:579` |
| `hud.layout.menu` | Open the settings menu | `src/content/default-locale-en.ts:580` |
| `hud.layout.navigation-width` | Navigation width | `src/content/default-locale-en.ts:581` |
| `hud.layout.inspector-width` | Panel width | `src/content/default-locale-en.ts:582` |
| `hud.layout.inspector-height` | Panel height | `src/content/default-locale-en.ts:583` |
| `hud.layout.reset` | Reset layout | `src/content/default-locale-en.ts:584` |
| `hud.layout.map-only` | Map only | `src/content/default-locale-en.ts:585` |
| `hud.layout.hide-navigation` | Hide the sections | `src/content/default-locale-en.ts:586` |
| `hud.layout.show-navigation` | Show the sections | `src/content/default-locale-en.ts:587` |
| `hud.layout.hide-inspector` | Hide the panels | `src/content/default-locale-en.ts:588` |
| `hud.layout.show-inspector` | Show the panels | `src/content/default-locale-en.ts:589` |
| `hud.layout.hide-metrics` | Hide the counters and the clock | `src/content/default-locale-en.ts:590` |
| `hud.layout.show-metrics` | Show the counters and the clock | `src/content/default-locale-en.ts:591` |
| `hud.layout.resize-navigation` | Resize the sections | `src/content/default-locale-en.ts:592` |
| `hud.layout.resize-inspector` | Resize the panels | `src/content/default-locale-en.ts:593` |
| `hud.zoom.title` | Zoom | `src/content/default-locale-en.ts:634` |
| `hud.zoom.in` | Zoom in | `src/content/default-locale-en.ts:635` |
| `hud.zoom.out` | Zoom out | `src/content/default-locale-en.ts:636` |
| `hud.minimap.title` | Minimap | `src/content/default-locale-en.ts:638` |
| `hud.minimap.placeholder` | No map is drawn here yet — pressing may move the camera | `src/content/default-locale-en.ts:662` |
| `hud.minimap.navigable` | No map is drawn here yet — press to jump the camera there | `src/content/default-locale-en.ts:708` |
| `hud.alerts.title` | Alerts | `src/content/default-locale-en.ts:709` |
| `hud.alerts.empty` | No active alerts | `src/content/default-locale-en.ts:710` |
| `hud.alerts.unknown` | No prison is reporting. | `src/content/default-locale-en.ts:745` |
| `hud.alert.occurrences` | {count}× | `src/content/default-locale-en.ts:791` |
| `hud.alert.time` | Day {day} | `src/content/default-locale-en.ts:792` |
| `hud.alert.dismiss` | Clear this alert | `src/content/default-locale-en.ts:821` |
| `hud.alert.refusal.admit.no-accommodation` | Nobody was admitted — there is no room to put a prisoner in yet. | `src/content/default-locale-en.ts:845` |
| `hud.alert.refusal.admit.population-full` | Nobody was admitted — this prison is holding as many people as it can. | `src/content/default-locale-en.ts:846` |
| `hud.alert.refusal.build.duplicate-order` | The build order failed — that order already exists. | `src/content/default-locale-en.ts:857` |
| `hud.alert.refusal.build.out-of-bounds` | The build order failed — that tile is outside the map. | `src/content/default-locale-en.ts:858` |
| `hud.alert.refusal.build.unbuildable` | The build order failed — nothing can be built on that tile. | `src/content/default-locale-en.ts:859` |
| `hud.alert.refusal.build.unbuildable-terrain` | The build order failed — the ground there cannot be built on. | `src/content/default-locale-en.ts:860` |
| `hud.alert.refusal.build.unknown-buildable` | The build order failed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:876` |
| `hud.alert.refusal.build.unowned-land` | The build order failed — you do not own that land. | `src/content/default-locale-en.ts:877` |
| `hud.alert.refusal.build.water-blocked` | The build order failed — there is water on that tile. | `src/content/default-locale-en.ts:878` |
| `hud.alert.refusal.cancel-build-order.stale-cancellation` | Nothing was refunded — this order moved on before the cancellation reached it. Press Cancel again to see what it pays now. | `src/content/default-locale-en.ts:898` |
| `hud.alert.refusal.cancel-purchase.not-pending` | Nothing was refunded — that delivery is not on its way any more. | `src/content/default-locale-en.ts:915` |
| `hud.alert.refusal.construction.materials-unfunded` | The build queue is stalled — no more materials until the prison earns the money. | `src/content/default-locale-en.ts:963` |
| `hud.alert.refusal.hire.insufficient-funds` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:1074` |
| `hud.alert.refusal.hire.no-duty-for-role` | Nobody was hired — only security staff can hold a post, and this prison has no other work for that role. | `src/content/default-locale-en.ts:1080` |
| `hud.alert.refusal.hire.roster-full` | Nobody was hired — this prison cannot hold any more staff. | `src/content/default-locale-en.ts:1081` |
| `hud.alert.refusal.hire.unknown-role` | Nobody was hired — that is not a role this prison knows. | `src/content/default-locale-en.ts:1082` |
| `hud.alert.refusal.place-object.duplicate-order` | The object was not placed — that order already exists. | `src/content/default-locale-en.ts:1089` |
| `hud.alert.refusal.place-object.not-a-placeable-object` | The object was not placed — that is not something built by placing it on a tile. | `src/content/default-locale-en.ts:1090` |
| `hud.alert.refusal.place-object.out-of-bounds` | The object was not placed — part of it would be outside the map. | `src/content/default-locale-en.ts:1091` |
| `hud.alert.refusal.place-object.outside-room` | The object was not placed — it has to stand in a room you have zoned. | `src/content/default-locale-en.ts:1092` |
| `hud.alert.refusal.place-object.tile-occupied` | The object was not placed — something is already standing there. | `src/content/default-locale-en.ts:1093` |
| `hud.alert.refusal.place-object.unknown-buildable` | The object was not placed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:1094` |
| `hud.alert.refusal.place-object.unowned-land` | The object was not placed — you do not own all of that land. | `src/content/default-locale-en.ts:1095` |
| `hud.alert.refusal.remove-object.nothing-to-remove` | Nothing was removed — there is no object on that tile, and none being built there. | `src/content/default-locale-en.ts:1105` |
| `hud.alert.refusal.remove-wall.nothing-to-remove` | Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either. | `src/content/default-locale-en.ts:1123` |
| `hud.alert.refusal.purchase.duplicate-order` | The materials were not ordered — that order already exists. | `src/content/default-locale-en.ts:1125` |
| `hud.alert.refusal.purchase.insufficient-funds` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:1135` |
| `hud.alert.refusal.purchase.invalid-quantity` | The materials were not ordered — that quantity cannot be bought. | `src/content/default-locale-en.ts:1136` |
| `hud.alert.refusal.purchase.unknown-material` | The materials were not ordered — that material is not for sale. | `src/content/default-locale-en.ts:1137` |
| `hud.alert.refusal.sell.insufficient-stock` | Nothing was sold — the prison does not have that much in store. | `src/content/default-locale-en.ts:1155` |
| `hud.alert.refusal.sell.invalid-quantity` | Nothing was sold — that quantity cannot be sold. | `src/content/default-locale-en.ts:1156` |
| `hud.alert.refusal.sell.unknown-material` | Nothing was sold — that material has no buyer. | `src/content/default-locale-en.ts:1157` |
| `hud.alert.refusal.dismiss.unknown-staff` | Nobody was dismissed — that staff member is not on the roster. | `src/content/default-locale-en.ts:1176` |
| `hud.alert.refusal.edit-regime-block.unknown-block` | Nothing was changed — that part of the day is not a block on this timetable. | `src/content/default-locale-en.ts:1197` |
| `hud.alert.refusal.edit-regime-block.unknown-group` | Nothing was changed — this prison has no timetable for that group. | `src/content/default-locale-en.ts:1198` |
| `hud.alert.refusal.release-guard.not-held` | Nothing was released — that guard is already off duty. | `src/content/default-locale-en.ts:1199` |
| `hud.alert.refusal.release-guard.unknown-guard` | Nothing was released — that guard is not on the roster. | `src/content/default-locale-en.ts:1200` |
| `hud.alert.refusal.zone.duplicate-instance-id` | The room was not zoned — a room is already recorded on that tile. | `src/content/default-locale-en.ts:1205` |
| `hud.alert.refusal.zone.invalid-area` | The room was not zoned — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1206` |
| `hud.alert.refusal.zone.out-of-bounds` | The room was not zoned — part of that area is outside the map. | `src/content/default-locale-en.ts:1207` |
| `hud.alert.refusal.zone.overlaps-existing-room` | The room was not zoned — it overlaps a room that is already there. | `src/content/default-locale-en.ts:1208` |
| `hud.alert.refusal.zone.unknown-room-type` | The room was not zoned — that is not a room type this prison knows. | `src/content/default-locale-en.ts:1209` |
| `hud.alert.refusal.zone.unowned-land` | The room was not zoned — you do not own all of that land. | `src/content/default-locale-en.ts:1210` |
| `hud.alert.refusal.zone.below-minimum-size` | The room was not zoned — that area is smaller than this room type allows. | `src/content/default-locale-en.ts:1217` |
| `hud.alert.refusal.zone.not-enclosed` | The room was not zoned — this room type must be enclosed, and the area you drew is open on at least one side. | `src/content/default-locale-en.ts:1228` |
| `hud.alert.refusal.unzone.invalid-area` | Nothing was removed — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1233` |
| `hud.alert.refusal.unzone.nothing-to-remove` | Nothing was removed — there is no room in that area. | `src/content/default-locale-en.ts:1234` |
| `hud.alert.refusal.unzone.room-occupied` | Nothing was removed — somebody is using that room. | `src/content/default-locale-en.ts:1235` |
| `hud.alert.fault.invalid-message` | A simulation message was rejected — it was not a message this game understands. | `src/content/default-locale-en.ts:1260` |
| `hud.alert.fault.unsupported-protocol-version` | A simulation message was rejected — it was written for a different version of the game. | `src/content/default-locale-en.ts:1261` |
| `hud.alert.fault.unknown-message-kind` | A simulation message was rejected — this build does not know that kind of message. | `src/content/default-locale-en.ts:1262` |
| `hud.alert.fault.invalid-payload` | A simulation message was rejected — its contents were not what that message must carry. | `src/content/default-locale-en.ts:1263` |
| `hud.alert.fault.not-initialized` | A simulation request was refused — no prison is loaded yet. | `src/content/default-locale-en.ts:1264` |
| `hud.alert.fault.already-initialized` | A simulation request was refused — this session already has a prison loaded. | `src/content/default-locale-en.ts:1265` |
| `hud.alert.fault.duplicate-message` | A command was refused — it had already been sent. | `src/content/default-locale-en.ts:1266` |
| `hud.alert.fault.sequence-gap` | A command was refused — a command sent before it never arrived. | `src/content/default-locale-en.ts:1267` |
| `hud.alert.fault.invalid-state` | A simulation request was refused — the simulation cannot do that right now. | `src/content/default-locale-en.ts:1268` |
| `hud.alert.fault.snapshot-incompatible` | The save could not be loaded — this build does not understand its format. | `src/content/default-locale-en.ts:1269` |
| `hud.alert.fault.shutting-down` | A simulation request was refused — the session is shutting down. | `src/content/default-locale-en.ts:1270` |
| `hud.alert.fault.internal-error` | The simulation hit an internal error. | `src/content/default-locale-en.ts:1271` |
| `hud.alert.event.prisoners.discharged` | {count} released — their sentences are served. | `src/content/default-locale-en.ts:1288` |
| `hud.alert.event.economy.wages-unpaid` | Payday went unpaid — your staff are owed {total}. | `src/content/default-locale-en.ts:1289` |
| `hud.alert.event.economy.deliveries-refused` | Deliveries refused — the treasury cannot cover a purchase right now. | `src/content/default-locale-en.ts:1307` |
| `hud.alert.event.economy.construction-refused` | Construction halted — the treasury cannot fund the build queue right now. | `src/content/default-locale-en.ts:1308` |
| `hud.alert.event.economy.deliveries-restored` | The treasury has climbed back above the deliveries floor. | `src/content/default-locale-en.ts:1348` |
| `hud.alert.event.economy.construction-restored` | The treasury has climbed back above the construction floor. | `src/content/default-locale-en.ts:1349` |
| `hud.alert.event.construction.order-cancelled` | The order was cancelled — the money it cost is refunded. | `src/content/default-locale-en.ts:1468` |
| `hud.alert.event.construction.order-cancelled-underway` | The order was cancelled. Anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1469` |
| `hud.alert.event.construction.order-completed` | The order was completed. | `src/content/default-locale-en.ts:1529` |
| `hud.alert.event.construction.undo-refused-newer-action` | Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one. | `src/content/default-locale-en.ts:1558` |
| `hud.alert.event.construction.undone` | The last change to the build queue was undone. | `src/content/default-locale-en.ts:1560` |
| `hud.alert.event.construction.undone-spend-destroyed` | The last change to the build queue was undone — anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1561` |
| `hud.alert.event.construction.redone` | The last change to the build queue was redone. | `src/content/default-locale-en.ts:1563` |
| `hud.alert.event.economy.delivery-cancelled` | The delivery was cancelled — {total} back. | `src/content/default-locale-en.ts:1564` |
| `hud.alert.event.objects.removed-spend-destroyed` | The object was removed — the money it cost does not come back. | `src/content/default-locale-en.ts:1647` |
| `hud.alert.event.prisoners.relocated` | {name} had nowhere to sleep and moved to {room}. | `src/content/default-locale-en.ts:1670` |
| `hud.alert.event.prisoners.housed` | {name} has a place in {room}. | `src/content/default-locale-en.ts:1723` |
| `hud.alert.event.rooms.zoned` | {room} designated. | `src/content/default-locale-en.ts:1778` |
| `hud.alert.event.rooms.needs-cleared` | {room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in. | `src/content/default-locale-en.ts:1857` |
| `hud.alert.event.rooms.unzoned` | {room} removed. | `src/content/default-locale-en.ts:1894` |
| `hud.alert.event.incidents.riot-opened` | A riot has broken out — {count} prisoners have stopped taking orders. | `src/content/default-locale-en.ts:1917` |
| `hud.alert.event.incidents.assault-opened` | A fight has broken out between two prisoners. | `src/content/default-locale-en.ts:1918` |
| `hud.alert.event.incidents.escape-attempt-opened` | A prisoner is trying to break out. | `src/content/default-locale-en.ts:1919` |
| `hud.alert.event.incidents.gang-retaliation-opened` | Two gangs are settling a score. | `src/content/default-locale-en.ts:1920` |
| `hud.alert.event.incidents.all-clear` | The prison is under control again — no incident is still open. | `src/content/default-locale-en.ts:1921` |
| `hud.alert.event.incidents.all-clear-after-lapse` | No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. | `src/content/default-locale-en.ts:1972` |
| `hud.alert.event.incidents.escape-succeeded` | {name} broke out — no guard reached them in time. | `src/content/default-locale-en.ts:2009` |
| `hud.alert.event.contraband.discovered` | Contraband found: {item}. | `src/content/default-locale-en.ts:2044` |
| `hud.unavailable.simulation` | Simulation unavailable — this browser could not start it, so nothing can run or be saved | `src/content/default-locale-en.ts:2070` |
| `hud.panel.collapse` | Collapse | `src/content/default-locale-en.ts:2072` |
| `hud.panel.expand` | Expand | `src/content/default-locale-en.ts:2073` |
| `hud.build.title` | Build | `src/content/default-locale-en.ts:2075` |
| `hud.build.catalogue` | What to build | `src/content/default-locale-en.ts:2076` |
| `hud.build.catalogue-empty` | Nothing is available to build | `src/content/default-locale-en.ts:2077` |
| `hud.build.selected` | Selected | `src/content/default-locale-en.ts:2078` |
| `hud.build.catalogue-row-price` | {buildable} · {total} | `src/content/default-locale-en.ts:2113` |
| `hud.build.catalogue-row-price-segment` | {buildable} · {total} per segment | `src/content/default-locale-en.ts:2134` |
| `hud.build.placement` | Where | `src/content/default-locale-en.ts:2135` |
| `hud.build.tile-x` | Tile X | `src/content/default-locale-en.ts:2136` |
| `hud.build.tile-y` | Tile Y | `src/content/default-locale-en.ts:2137` |
| `hud.build.step-down` | Decrease {field} | `src/content/default-locale-en.ts:2138` |
| `hud.build.step-up` | Increase {field} | `src/content/default-locale-en.ts:2139` |
| `hud.build.edge` | Edge | `src/content/default-locale-en.ts:2140` |
| `hud.build.submit` | Place order | `src/content/default-locale-en.ts:2141` |
| `hud.build.note` | An order is queued now and built while the clock runs. | `src/content/default-locale-en.ts:2142` |
| `hud.build.arm` | Place on map | `src/content/default-locale-en.ts:2143` |
| `hud.build.remove` | Remove | `src/content/default-locale-en.ts:2184` |
| `hud.build.remove-active` | Stop removing | `src/content/default-locale-en.ts:2185` |
| `hud.build.remove-hint` | Press any tile of an object, or a finished wall, to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded. | `src/content/default-locale-en.ts:2209` |
| `hud.build.remove-submit` | Remove object here | `src/content/default-locale-en.ts:2210` |
| `hud.build.disarm` | Stop placing | `src/content/default-locale-en.ts:2211` |
| `hud.build.arm-hint` | Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2212` |
| `hud.build.arm-hint-object` | Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2248` |
| `hud.build.target-none` | Point at the world | `src/content/default-locale-en.ts:2250` |
| `hud.build.target-value` | {x}, {y} · {edge} | `src/content/default-locale-en.ts:2251` |
| `hud.build.target-run` | {count} × {edge} from {x}, {y} | `src/content/default-locale-en.ts:2252` |
| `hud.build.target-tile` | {x}, {y} | `src/content/default-locale-en.ts:2253` |
| `hud.build.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:2254` |
| `hud.build.coordinates-hint` | The keyboard route. Pointing at the map is quicker. | `src/content/default-locale-en.ts:2255` |
| `hud.build.buy` | Buy | `src/content/default-locale-en.ts:2256` |
| `hud.build.buy-quantity` | Quantity | `src/content/default-locale-en.ts:2257` |
| `hud.build.buy-submit` | Buy {count} × {material} · {total} | `src/content/default-locale-en.ts:2258` |
| `hud.build.buy-hint` | Arrives while the clock runs, into the stock a build draws from. | `src/content/default-locale-en.ts:2259` |
| `hud.build.sell` | Sell | `src/content/default-locale-en.ts:2294` |
| `hud.build.sell-submit` | Sell {count} × {material} · {total} | `src/content/default-locale-en.ts:2295` |
| `hud.build.buy-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2335` |
| `hud.build.queue` | Queued | `src/content/default-locale-en.ts:2402` |
| `hud.build.queue-count` | {count} waiting · {started} being built | `src/content/default-locale-en.ts:2403` |
| `hud.build.queue-order` | {buildable} · {x}, {y} · {edge} · {total} back | `src/content/default-locale-en.ts:2404` |
| `hud.build.queue-cancel` | Cancel | `src/content/default-locale-en.ts:2405` |
| `hud.build.queue-unnamed` | Unnamed order | `src/content/default-locale-en.ts:2406` |
| `hud.build.queue-more` | and {count} more behind these — undo takes back a whole run. | `src/content/default-locale-en.ts:2407` |
| `hud.build.queue-shortfall` | Waiting for {total} to unblock the next order. | `src/content/default-locale-en.ts:2408` |
| `hud.build.deliveries` | On the way | `src/content/default-locale-en.ts:2435` |
| `hud.build.deliveries-count` | {count} bought · {total} back if cancelled | `src/content/default-locale-en.ts:2436` |
| `hud.build.delivery` | {count} × {material} · {total} back | `src/content/default-locale-en.ts:2437` |
| `hud.build.delivery-cancel` | Cancel | `src/content/default-locale-en.ts:2438` |
| `hud.build.delivery-unnamed` | Unnamed material | `src/content/default-locale-en.ts:2439` |
| `hud.build.deliveries-more` | and {count} more on the way — these arrive first, and the rest come into view as they land. | `src/content/default-locale-en.ts:2440` |
| `hud.build.buildable.wall-brick` | Brick wall | `src/content/default-locale-en.ts:2441` |
| `hud.build.buildable.door-wooden` | Wooden door | `src/content/default-locale-en.ts:2442` |
| `hud.build.category` | Category | `src/content/default-locale-en.ts:2455` |
| `hud.build.category-all` | Everything | `src/content/default-locale-en.ts:2456` |
| `hud.build.category.structure` | Walls and doors | `src/content/default-locale-en.ts:2457` |
| `hud.overview.title` | Finances | `src/content/default-locale-en.ts:2508` |
| `hud.overview.none` | No prison is reporting. | `src/content/default-locale-en.ts:2509` |
| `hud.overview.wages` | Wages a day | `src/content/default-locale-en.ts:2510` |
| `hud.intake.title` | Intake | `src/content/default-locale-en.ts:2512` |
| `hud.intake.admit` | Admit a prisoner | `src/content/default-locale-en.ts:2513` |
| `hud.intake.hint` | A prison needs a cell before it can admit anyone. It does not need a free bed: an arrival with none waits until a bed is free. | `src/content/default-locale-en.ts:2514` |
| `hud.intake.no-place` | {count} waiting with no bed to sleep in | `src/content/default-locale-en.ts:2522` |
| `hud.intake.pipeline` | In intake | `src/content/default-locale-en.ts:2527` |
| `hud.intake.pipeline-count` | {waiting} of {total} | `src/content/default-locale-en.ts:2528` |
| `hud.intake.pipeline-stage` | {count} at {stage} | `src/content/default-locale-en.ts:2529` |
| `hud.intake.pipeline-failed` | {count} cannot be housed at all | `src/content/default-locale-en.ts:2534` |
| `hud.security.staff` | Staff | `src/content/default-locale-en.ts:2542` |
| `hud.security.roles` | Who to hire | `src/content/default-locale-en.ts:2543` |
| `hud.security.roles-empty` | Nobody can be hired yet. | `src/content/default-locale-en.ts:2544` |
| `hud.security.selected` | Selected | `src/content/default-locale-en.ts:2545` |
| `hud.security.hire` | Hire {role} · {total} | `src/content/default-locale-en.ts:2546` |
| `hud.security.hire-hint` | Costs {total} now and {wage} a day in wages, including today. | `src/content/default-locale-en.ts:2604` |
| `hud.security.hire-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2616` |
| `hud.security.hire-unassigned` | A new guard starts unassigned. | `src/content/default-locale-en.ts:2639` |
| `hud.security.held` | On duty | `src/content/default-locale-en.ts:2647` |
| `hud.security.held-summary` | {held} held · {unassigned} free | `src/content/default-locale-en.ts:2648` |
| `hud.security.held-empty` | Nobody is assigned right now. | `src/content/default-locale-en.ts:2649` |
| `hud.security.held-row` | {name} · {claim} | `src/content/default-locale-en.ts:2650` |
| `hud.security.held-row-unnamed` | Guard {id} · {claim} | `src/content/default-locale-en.ts:2651` |
| `hud.security.held-release` | Release | `src/content/default-locale-en.ts:2652` |
| `hud.security.held-more` | and {count} more | `src/content/default-locale-en.ts:2653` |
| `hud.security.held-hint` | A released guard stays hired and goes back to the pool. | `src/content/default-locale-en.ts:2654` |
| `hud.security.roster` | On the payroll | `src/content/default-locale-en.ts:2693` |
| `hud.security.roster-wage-bill` | {total} a day | `src/content/default-locale-en.ts:2714` |
| `hud.security.roster-dismiss` | Dismiss | `src/content/default-locale-en.ts:2715` |
| `hud.security.roster-dismiss-confirm` | Dismiss {name}? Their wage stops and they do not come back. | `src/content/default-locale-en.ts:2744` |
| `hud.security.roster-hint` | A dismissed staff member leaves the prison for good, and their wage stops. | `src/content/default-locale-en.ts:2745` |
| `hud.security.coverage` | Guard coverage | `src/content/default-locale-en.ts:2755` |
| `hud.security.coverage-summary` | {assigned} of {required} | `src/content/default-locale-en.ts:2756` |
| `hud.security.coverage-met` | Covered | `src/content/default-locale-en.ts:2757` |
| `hud.security.coverage-met-hint` | Incidents and searches need free guards. | `src/content/default-locale-en.ts:2930` |
| `hud.security.coverage-short` | Understaffed | `src/content/default-locale-en.ts:2931` |
| `hud.security.coverage-short-hint` | Hire {count} more to cover this population. | `src/content/default-locale-en.ts:2932` |
| `hud.security.coverage-unguarded` | Unguarded | `src/content/default-locale-en.ts:2933` |
| `hud.security.coverage-unguarded-hint` | Nobody is on duty. Hire {count} to cover this population. | `src/content/default-locale-en.ts:2934` |
| `hud.security.coverage-unguarded-consequence` | No guard is posted here, so nobody in this sector is kept safe. | `src/content/default-locale-en.ts:2982` |
| `hud.regime.title` | Regime | `src/content/default-locale-en.ts:2998` |
| `hud.regime.blocks` | Today's blocks | `src/content/default-locale-en.ts:2999` |
| `hud.regime.block-allows` | Allows {categories} | `src/content/default-locale-en.ts:3000` |
| `hud.regime.block-progress` | {percent}% through | `src/content/default-locale-en.ts:3001` |
| `hud.regime.category-separator` | ,  | `src/content/default-locale-en.ts:3004` |
| `hud.regime.sentence-remaining` | Sentence remaining (in-game days): {days} | `src/content/default-locale-en.ts:3007` |
| `hud.regime.roster` | Prisoners | `src/content/default-locale-en.ts:3020` |
| `hud.regime.roster-count` | {shown} of {total} | `src/content/default-locale-en.ts:3021` |
| `hud.regime.roster-name` | {given} {family} | `src/content/default-locale-en.ts:3022` |
| `hud.regime.roster-unnamed` | Prisoner {id} | `src/content/default-locale-en.ts:3023` |
| `hud.regime.roster-heading` | Heading to {activity} | `src/content/default-locale-en.ts:3024` |
| `hud.regime.roster-more` | and {count} more | `src/content/default-locale-en.ts:3025` |
| `hud.regime.roster-empty` | No prisoners yet. Build a cell with a bed to take somebody in. | `src/content/default-locale-en.ts:3057` |
| `hud.regime.roster-emptied` | This prison is empty. Take somebody in to start again. | `src/content/default-locale-en.ts:3094` |
| `hud.refusal.set-clock` | The clock did not change — the request was refused. | `src/content/default-locale-en.ts:3109` |
| `hud.refusal.place-build-order` | The build order was not placed — the request was refused. | `src/content/default-locale-en.ts:3110` |
| `hud.refusal.purchase-materials` | Nothing was bought — the purchase was refused and no money was spent. | `src/content/default-locale-en.ts:3111` |
| `hud.refusal.hire-staff` | Nobody was hired — the request was refused and no money was spent. | `src/content/default-locale-en.ts:3112` |
| `hud.refusal.purchase-materials-past-floor` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:3135` |
| `hud.refusal.hire-staff-past-floor` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:3136` |
| `hud.refusal.undo` | Nothing was undone — the request was refused. | `src/content/default-locale-en.ts:3137` |
| `hud.refusal.redo` | Nothing was redone — the request was refused. | `src/content/default-locale-en.ts:3138` |
| `hud.refusal.zone-room` | The room was not designated — the request was refused. | `src/content/default-locale-en.ts:3139` |
| `hud.refusal.unzone-room` | Nothing was removed — the request was refused. | `src/content/default-locale-en.ts:3140` |
| `hud.refusal.admit-prisoner` | Nobody was admitted — the request was refused. | `src/content/default-locale-en.ts:3141` |
| `hud.refusal.admit-prisoner-no-room` | Nobody was admitted — this prison has no room to hold anybody. | `src/content/default-locale-en.ts:3157` |
| `hud.refusal.cancel-build-order` | The order is still queued — the request was refused. | `src/content/default-locale-en.ts:3158` |
| `hud.refusal.cancel-material-purchase` | Nothing was refunded — the request was refused and the delivery is still on its way. | `src/content/default-locale-en.ts:3164` |
| `hud.refusal.sell-materials` | Nothing was sold — the request was refused and nothing was taken from stock. | `src/content/default-locale-en.ts:3171` |
| `hud.refusal.release-guard` | Nobody was released — the request was refused and the guard is still assigned. | `src/content/default-locale-en.ts:3172` |
| `hud.rooms.title` | Rooms | `src/content/default-locale-en.ts:3174` |
| `hud.rooms.catalogue` | Room type and area | `src/content/default-locale-en.ts:3178` |
| `hud.rooms.catalogue-empty` | No room types are available | `src/content/default-locale-en.ts:3179` |
| `hud.rooms.selected` | Selected | `src/content/default-locale-en.ts:3180` |
| `hud.rooms.arm` | Draw on map | `src/content/default-locale-en.ts:3181` |
| `hud.rooms.disarm` | Stop drawing | `src/content/default-locale-en.ts:3182` |
| `hud.rooms.arm-hint` | Drag a rectangle across the tiles this room should cover. | `src/content/default-locale-en.ts:3183` |
| `hud.rooms.remove` | Remove rooms | `src/content/default-locale-en.ts:3184` |
| `hud.rooms.remove-active` | Stop removing | `src/content/default-locale-en.ts:3185` |
| `hud.rooms.remove-hint` | Drag across any part of a room to remove all of it. | `src/content/default-locale-en.ts:3194` |
| `hud.rooms.area` | Area | `src/content/default-locale-en.ts:3195` |
| `hud.rooms.area-none` | Nothing selected | `src/content/default-locale-en.ts:3196` |
| `hud.rooms.area-value` | {width} × {height} tiles at {x}, {y} | `src/content/default-locale-en.ts:3197` |
| `hud.rooms.confirm` | Designate {width} × {height} | `src/content/default-locale-en.ts:3198` |
| `hud.rooms.confirm-remove` | Remove {width} × {height} | `src/content/default-locale-en.ts:3201` |
| `hud.rooms.cancel` | Discard | `src/content/default-locale-en.ts:3202` |
| `hud.rooms.minimum` | Needs at least {width} × {height} tiles | `src/content/default-locale-en.ts:3203` |
| `hud.rooms.minimum-none` | No minimum size | `src/content/default-locale-en.ts:3204` |
| `hud.rooms.too-small` | Too small — this room needs at least {width} × {height} tiles. | `src/content/default-locale-en.ts:3205` |
| `hud.rooms.enclosure` | Enclosure | `src/content/default-locale-en.ts:3206` |
| `hud.rooms.enclosure-none` | Not evaluated yet | `src/content/default-locale-en.ts:3207` |
| `hud.rooms.enclosure-sealed` | Walled in — not a door check | `src/content/default-locale-en.ts:3250` |
| `hud.rooms.enclosure-open` | Open on at least one side | `src/content/default-locale-en.ts:3251` |
| `hud.rooms.requirement-enclosed` | Must be enclosed | `src/content/default-locale-en.ts:3252` |
| `hud.rooms.requirement-outdoors` | Must be outdoors | `src/content/default-locale-en.ts:3253` |
| `hud.rooms.requirement-none` | No enclosure rule | `src/content/default-locale-en.ts:3254` |
| `hud.rooms.requires-object` | Needs {count} × {object} | `src/content/default-locale-en.ts:3261` |
| `hud.rooms.requires-none` | No objects needed | `src/content/default-locale-en.ts:3266` |
| `hud.rooms.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:3270` |
| `hud.rooms.coordinates-hint` | The keyboard route. Dragging on the map is quicker. | `src/content/default-locale-en.ts:3271` |
| `hud.rooms.coordinates-submit` | Use these tiles | `src/content/default-locale-en.ts:3276` |
| `hud.rooms.tile-x` | Tile X | `src/content/default-locale-en.ts:3277` |
| `hud.rooms.tile-y` | Tile Y | `src/content/default-locale-en.ts:3278` |
| `hud.rooms.width` | Width | `src/content/default-locale-en.ts:3279` |
| `hud.rooms.height` | Height | `src/content/default-locale-en.ts:3280` |
| `hud.rooms.step-down` | Decrease {field} | `src/content/default-locale-en.ts:3281` |
| `hud.rooms.step-up` | Increase {field} | `src/content/default-locale-en.ts:3282` |
| `hud.rooms.needs` | Not ready | `src/content/default-locale-en.ts:3287` |
| `hud.rooms.needs-count` | {unfinished} of {total} | `src/content/default-locale-en.ts:3288` |
| `hud.rooms.needs-room` | {room} at {x}, {y} is missing | `src/content/default-locale-en.ts:3293` |
| `hud.rooms.needs-object` | {count} × {object} | `src/content/default-locale-en.ts:3297` |
| `hud.rooms.needs-object-uncounted` | {object} | `src/content/default-locale-en.ts:3302` |
| `hud.rooms.needs-item-more` | and {count} more | `src/content/default-locale-en.ts:3307` |
| `hud.rooms.needs-object-unknown` | something this build cannot name | `src/content/default-locale-en.ts:3311` |
| `hud.rooms.needs-doorway` | a door — nobody can get in | `src/content/default-locale-en.ts:3338` |
| `hud.rooms.needs-unreachable` | a way in — nothing outside can reach its door | `src/content/default-locale-en.ts:3380` |
| `hud.rooms.at-capacity` | At capacity | `src/content/default-locale-en.ts:3440` |
| `hud.rooms.at-capacity-count` | {full} of {total} | `src/content/default-locale-en.ts:3441` |
| `hud.rooms.at-capacity-room` | {room} at {x}, {y} is full | `src/content/default-locale-en.ts:3442` |
| `hud.rooms.at-capacity-places` | places in use: {inUse} of {capacity} | `src/content/default-locale-en.ts:3443` |
| `hud.security-section.title` | Security | `src/content/default-locale-en.ts:3465` |
| `hud.security-section.waiting` | No prison is reporting. | `src/content/default-locale-en.ts:3474` |
| `hud.security-section.sectors` | Sectors | `src/content/default-locale-en.ts:3477` |
| `hud.security-section.sectors-empty` | No sector has been drawn on this land yet. | `src/content/default-locale-en.ts:3484` |
| `hud.security-section.sector-staffing` | {assigned} of {required} guards assigned | `src/content/default-locale-en.ts:3491` |
| `hud.security-section.sector-short` | {count} short | `src/content/default-locale-en.ts:3498` |
| `hud.security-section.sector-open-incidents` | {count} open here | `src/content/default-locale-en.ts:3504` |
| `hud.security-section.lockdown` | Lockdown | `src/content/default-locale-en.ts:3513` |
| `hud.security-section.incidents` | Incidents | `src/content/default-locale-en.ts:3516` |
| `hud.security-section.incidents-none` | Nothing has been recorded yet. | `src/content/default-locale-en.ts:3525` |
| `hud.security-section.incidents-closed` | Nothing is open. {total} recorded so far. | `src/content/default-locale-en.ts:3534` |
| `hud.security-section.incidents-summary` | {open} open of {total} recorded | `src/content/default-locale-en.ts:3536` |
| `hud.security-section.incidents-toll` | {injured} hurt, {escapes} got out | `src/content/default-locale-en.ts:3543` |
| `hud.security-section.incident-row` | {type} in {sector} | `src/content/default-locale-en.ts:3551` |
| `hud.security-section.incident-severity` | Severity {severity} of {max} | `src/content/default-locale-en.ts:3558` |
| `hud.security-section.incident-people` | {count} taking part | `src/content/default-locale-en.ts:3564` |
| `hud.security-section.incident-timeline` | How it went | `src/content/default-locale-en.ts:3566` |
| `hud.security-section.incident-timeline-row` | {state} at tick {tick} | `src/content/default-locale-en.ts:3577` |
| `hud.security-section.incident-responders` | Responders needed: {count} | `src/content/default-locale-en.ts:3591` |
| `hud.security-section.incident-outcome` | {injured} hurt, damage {damage} of {max} | `src/content/default-locale-en.ts:3598` |
| `hud.security-section.incident-escaped` | Somebody got out. | `src/content/default-locale-en.ts:3600` |
| `hud.security-section.incidents-by-type` | By kind | `src/content/default-locale-en.ts:3602` |
| `hud.security-section.count-row` | {label}: {count} | `src/content/default-locale-en.ts:3608` |
| `hud.security-section.contraband` | Contraband | `src/content/default-locale-en.ts:3611` |
| `hud.security-section.searches-none` | No search is under way. | `src/content/default-locale-en.ts:3620` |
| `hud.security-section.search-row` | {scope} search - {state} | `src/content/default-locale-en.ts:3628` |
| `hud.security-section.search-progress` | {done} of {count} searched | `src/content/default-locale-en.ts:3634` |
| `hud.security-section.found` | Confiscated | `src/content/default-locale-en.ts:3636` |
| `hud.security-section.found-none` | Nothing has been confiscated. | `src/content/default-locale-en.ts:3646` |
| `hud.security-section.search-tally` | {found} found, {missed} missed | `src/content/default-locale-en.ts:3653` |
| `hud.severity.info` | Info | `src/content/default-locale-en.ts:3655` |
| `hud.severity.warning` | Warning | `src/content/default-locale-en.ts:3656` |
| `hud.severity.danger` | Critical | `src/content/default-locale-en.ts:3657` |
| `save.panel.region` | Prison saves | `src/content/default-locale-en.ts:3672` |
| `save.panel.title` | Prisons | `src/content/default-locale-en.ts:3673` |
| `save.action.create` | New prison | `src/content/default-locale-en.ts:3675` |
| `save.action.save` | Save now | `src/content/default-locale-en.ts:3676` |
| `save.action.export` | Export | `src/content/default-locale-en.ts:3677` |
| `save.action.import` | Import | `src/content/default-locale-en.ts:3678` |
| `save.action.load` | Load | `src/content/default-locale-en.ts:3679` |
| `save.action.delete` | Delete | `src/content/default-locale-en.ts:3680` |
| `save.action.delete-confirm` | Delete permanently | `src/content/default-locale-en.ts:3684` |
| `save.action.delete-cancel` | Keep | `src/content/default-locale-en.ts:3685` |
| `save.list.empty` | No prisons yet. | `src/content/default-locale-en.ts:3687` |
| `save.list.item` | {name} ({count} gen) | `src/content/default-locale-en.ts:3688` |
| `save.status.idle` | Local saves only — no network required. | `src/content/default-locale-en.ts:3690` |
| `save.status.saved` | Saved (generation {generation}). | `src/content/default-locale-en.ts:3691` |
| `save.status.quota-exceeded` | Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact. | `src/content/default-locale-en.ts:3696` |
| `save.status.transaction-aborted` | The browser interrupted the save. Your previous save is intact — try saving again. | `src/content/default-locale-en.ts:3698` |
| `save.status.changed-elsewhere` | Could not save: this prison was changed elsewhere. | `src/content/default-locale-en.ts:3712` |
| `save.status.save-failed` | Save failed: {detail} | `src/content/default-locale-en.ts:3713` |
| `save.status.list-unreadable` | Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail} | `src/content/default-locale-en.ts:3717` |
| `save.status.creating` | Creating prison… | `src/content/default-locale-en.ts:3719` |
| `save.status.create-failed` | Could not create a prison: {detail} | `src/content/default-locale-en.ts:3720` |
| `save.status.no-active-prison` | No active prison — create or load one first. | `src/content/default-locale-en.ts:3721` |
| `save.status.saving` | Saving… | `src/content/default-locale-en.ts:3722` |
| `save.status.loading` | Loading… | `src/content/default-locale-en.ts:3723` |
| `save.status.not-found` | That prison no longer exists. | `src/content/default-locale-en.ts:3724` |
| `save.status.no-readable-generation` | No readable save generation remains for this prison. Every retained copy failed validation. | `src/content/default-locale-en.ts:3725` |
| `save.status.recovered` | The most recent save was unreadable — recovered an earlier verified generation. | `src/content/default-locale-en.ts:3727` |
| `save.status.loaded` | Loaded. | `src/content/default-locale-en.ts:3728` |
| `save.status.deleted` | Prison deleted. You can bring it back from the list below for one day. | `src/content/default-locale-en.ts:3733` |
| `save.status.delete-kept` | Nothing was deleted. | `src/content/default-locale-en.ts:3737` |
| `save.status.nothing-to-export` | Nothing to export — no valid active save. | `src/content/default-locale-en.ts:3738` |
| `save.status.exported` | Exported the current save. | `src/content/default-locale-en.ts:3739` |
| `save.status.importing` | Reading the save file… | `src/content/default-locale-en.ts:3746` |
| `save.status.imported` | Imported the save file into this prison (generation {generation}). | `src/content/default-locale-en.ts:3747` |
| `save.status.imported-migrated` | Imported a save from an older version of Lockstate and brought it up to date (generation {generation}). | `src/content/default-locale-en.ts:3748` |
| `save.status.import-not-a-save` | That file is not a Lockstate save — choose a file exported from this game. | `src/content/default-locale-en.ts:3750` |
| `save.status.import-unsupported-version` | That save was written by a newer version of Lockstate than this one. Update the game, then import it again. | `src/content/default-locale-en.ts:3751` |
| `save.status.import-corrupt` | That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported. | `src/content/default-locale-en.ts:3753` |
| `save.status.import-invalid` | That save file could not be read: {detail} | `src/content/default-locale-en.ts:3755` |
| `save.failure.create` | Creating the prison failed: {detail} | `src/content/default-locale-en.ts:3757` |
| `save.failure.save` | Saving failed: {detail} | `src/content/default-locale-en.ts:3758` |
| `save.failure.load` | Loading failed: {detail} | `src/content/default-locale-en.ts:3759` |
| `save.failure.delete` | Deleting failed: {detail} | `src/content/default-locale-en.ts:3760` |
| `save.failure.export` | Exporting failed: {detail} | `src/content/default-locale-en.ts:3761` |
| `save.failure.import` | Importing failed: {detail} | `src/content/default-locale-en.ts:3762` |
| `save.failure.restore` | Bringing the prison back failed: {detail} | `src/content/default-locale-en.ts:3763` |
| `save.failure.forget` | Freeing the space failed: {detail} | `src/content/default-locale-en.ts:3764` |
| `save.failure.unknown` | The action failed: {detail} | `src/content/default-locale-en.ts:3765` |
| `save.detail.restored-scope` | Restored: {restored}. Not carried by this save version: {notCarried}. | `src/content/default-locale-en.ts:3772` |
| `save.delete.confirm` | Delete {name}? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed {age}. | `src/content/default-locale-en.ts:3811` |
| `save.delete.age.moments` | less than a minute ago | `src/content/default-locale-en.ts:3816` |
| `save.delete.age.minutes` | {count} min ago | `src/content/default-locale-en.ts:3817` |
| `save.delete.age.hours` | {count} h ago | `src/content/default-locale-en.ts:3818` |
| `save.delete.age.days` | {count} d ago | `src/content/default-locale-en.ts:3819` |
| `save.tombstone.item` | {name} — deleted. You can still bring it back. | `src/content/default-locale-en.ts:3842` |
| `save.action.tombstone-restore` | Bring it back | `src/content/default-locale-en.ts:3843` |
| `save.action.tombstone-forget` | Free its space now | `src/content/default-locale-en.ts:3849` |
| `save.status.tombstone-restored` | {name} is back, exactly as it was. | `src/content/default-locale-en.ts:3860` |
| `save.status.tombstone-window-closed` | Too late — that prison can no longer be brought back. | `src/content/default-locale-en.ts:3864` |
| `save.status.tombstone-slot-taken` | That prison cannot come back — another prison now holds its place, and is still here. | `src/content/default-locale-en.ts:3868` |
| `save.status.tombstone-gone` | That prison is no longer here to bring back. | `src/content/default-locale-en.ts:3871` |
| `save.status.tombstone-forgotten` | Gone for good. Nothing of that prison is kept now. | `src/content/default-locale-en.ts:3875` |
| `save.scope.kernel` | kernel tick and command queue | `src/content/default-locale-en.ts:3894` |
| `save.scope.rng-streams` | RNG stream states | `src/content/default-locale-en.ts:3895` |
| `save.scope.world` | world terrain and ownership | `src/content/default-locale-en.ts:3896` |
| `save.scope.construction` | construction orders and undo/redo | `src/content/default-locale-en.ts:3897` |
| `save.scope.entity-liveness` | entity id liveness | `src/content/default-locale-en.ts:3898` |
| `save.scope.prisoners` | prisoners, needs, actions and cell assignments | `src/content/default-locale-en.ts:3899` |
| `save.scope.operations` | jobs, containers and utility networks | `src/content/default-locale-en.ts:3900` |
| `save.scope.security` | doors, security sectors, guards and patrols | `src/content/default-locale-en.ts:3901` |
| `save.scope.contraband` | contraband, intelligence and searches | `src/content/default-locale-en.ts:3902` |
| `save.scope.incidents` | incidents, gangs and tunnels | `src/content/default-locale-en.ts:3903` |
| `save.scope.names` | prisoner and staff names | `src/content/default-locale-en.ts:3904` |
| `save.scope.room-caches` | room and topology caches (recomputed from the world) | `src/content/default-locale-en.ts:3909` |
| `save.scope.navigation-caches` | navigation caches and in-flight path requests (re-issued on the next tick) | `src/content/default-locale-en.ts:3910` |
| `input.action.camera.up` | Pan camera up | `src/content/default-locale-en.ts:3918` |
| `input.action.camera.down` | Pan camera down | `src/content/default-locale-en.ts:3919` |
| `input.action.camera.left` | Pan camera left | `src/content/default-locale-en.ts:3920` |
| `input.action.camera.right` | Pan camera right | `src/content/default-locale-en.ts:3921` |
| `input.action.camera.zoom.in` | Zoom in | `src/content/default-locale-en.ts:3922` |
| `input.action.camera.zoom.out` | Zoom out | `src/content/default-locale-en.ts:3923` |
| `input.action.selection.primary` | Select | `src/content/default-locale-en.ts:3924` |
| `input.action.build.confirm` | Confirm placement | `src/content/default-locale-en.ts:3925` |
| `input.action.build.cancel` | Cancel | `src/content/default-locale-en.ts:3928` |
| `input.action.edit.undo` | Undo | `src/content/default-locale-en.ts:3932` |
| `input.action.edit.redo` | Redo | `src/content/default-locale-en.ts:3933` |
| `brand.region` | Lockstate build | `src/content/default-locale-en.ts:3938` |
| `brand.wordmark` | LockState.io | `src/content/default-locale-en.ts:3941` |
| `brand.stage` | PRE-ALPHA | `src/content/default-locale-en.ts:3949` |
| `brand.build` | v{version} · {commit} | `src/content/default-locale-en.ts:3958` |
| `brand.description` | Lockstate, {stage} build, version {version}, commit {commit}. | `src/content/default-locale-en.ts:3962` |
| `display.scale.region` | Interface scale | `src/content/default-locale-en.ts:3978` |
| `display.scale.cycle` | Change the interface scale | `src/content/default-locale-en.ts:3979` |
| `display.theme.region` | Theme | `src/content/default-locale-en.ts:3995` |
| `display.theme.system` | System | `src/content/default-locale-en.ts:3996` |
| `display.theme.light` | Light | `src/content/default-locale-en.ts:3997` |
| `display.theme.dark` | Dark | `src/content/default-locale-en.ts:3998` |
| `display.theme.cycle` | Change the interface theme | `src/content/default-locale-en.ts:3999` |
| `display.language.region` | Language | `src/content/default-locale-en.ts:4024` |
| `display.language.automatic` | Automatic ({language}) | `src/content/default-locale-en.ts:4025` |
| `display.language.english` | English | `src/content/default-locale-en.ts:4026` |
| `display.language.polish` | Polski | `src/content/default-locale-en.ts:4027` |
| `display.language.cycle` | Change the interface language and reload the game | `src/content/default-locale-en.ts:4035` |
| `app.shell.label` | Lockstate game application | `src/content/default-locale-en.ts:4045` |

