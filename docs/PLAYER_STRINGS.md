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

## The 543 authored sentences

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
| `hud.status.prisoners-without-bed` | {count} not housed | `src/content/default-locale-en.ts:203` |
| `hud.status.staff` | Staff | `src/content/default-locale-en.ts:204` |
| `hud.status.rooms` | Rooms | `src/content/default-locale-en.ts:205` |
| `hud.status.rooms-not-ready` | {count} not ready | `src/content/default-locale-en.ts:241` |
| `hud.status.incidents` | Incidents | `src/content/default-locale-en.ts:242` |
| `hud.status.coverage` | Coverage | `src/content/default-locale-en.ts:243` |
| `hud.status.contraband` | Contraband | `src/content/default-locale-en.ts:244` |
| `hud.status.funds` | Funds | `src/content/default-locale-en.ts:249` |
| `hud.status.funds-remaining` | {remaining} left | `src/content/default-locale-en.ts:281` |
| `hud.status.funds-before-deliveries-stop` | {remaining} left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a place to sleep. | `src/content/default-locale-en.ts:328` |
| `hud.status.funds-deliveries-stopped` | Deliveries have stopped — no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a place to sleep. | `src/content/default-locale-en.ts:347` |
| `hud.status.funds-treasury-floor-exhausted` | The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a place to sleep, so a prison housing nobody earns nothing. | `src/content/default-locale-en.ts:425` |
| `hud.status.earned-today` | Earned today | `src/content/default-locale-en.ts:432` |
| `hud.status.earned-withheld` | Unmet needs have withheld {withheld} of today's grant so far — the state pays less for a resident whose needs are going unmet, and meeting one puts that share back. | `src/content/default-locale-en.ts:510` |
| `hud.status.earned-withheld-badge` | {withheld} withheld | `src/content/default-locale-en.ts:512` |
| `hud.status.occupancy` | Cell occupancy | `src/content/default-locale-en.ts:513` |
| `hud.status.occupancy-value` | {value} of {capacity} | `src/content/default-locale-en.ts:514` |
| `hud.status.incidents-clear` | Clear | `src/content/default-locale-en.ts:515` |
| `hud.status.incidents-active` | Active | `src/content/default-locale-en.ts:516` |
| `hud.clock.title` | Time controls | `src/content/default-locale-en.ts:518` |
| `hud.clock.day-progress` | Through the day | `src/content/default-locale-en.ts:521` |
| `hud.clock.day` | Day | `src/content/default-locale-en.ts:522` |
| `hud.clock.speed` | Speed {speed}× | `src/content/default-locale-en.ts:542` |
| `hud.clock.paused` | PAUSED | `src/content/default-locale-en.ts:547` |
| `hud.transport.pause` | Pause | `src/content/default-locale-en.ts:548` |
| `hud.transport.play` | Play at normal speed | `src/content/default-locale-en.ts:549` |
| `hud.transport.fast-forward` | Fast forward | `src/content/default-locale-en.ts:550` |
| `hud.history.group-label` | Undo and redo | `src/content/default-locale-en.ts:577` |
| `hud.history.undo-last-change` | Undo the last placement | `src/content/default-locale-en.ts:578` |
| `hud.history.redo-last-undone` | Redo the last undone placement | `src/content/default-locale-en.ts:579` |
| `hud.tabs.title` | Prison sections | `src/content/default-locale-en.ts:581` |
| `hud.tab.overview` | Overview | `src/content/default-locale-en.ts:659` |
| `hud.tab.build` | Build | `src/content/default-locale-en.ts:660` |
| `hud.tab.zones` | Zones | `src/content/default-locale-en.ts:661` |
| `hud.tab.manage` | Manage | `src/content/default-locale-en.ts:662` |
| `hud.tab.day-plan` | Schedule | `src/content/default-locale-en.ts:663` |
| `hud.tab.security` | Security | `src/content/default-locale-en.ts:676` |
| `hud.layout.title` | Settings | `src/content/default-locale-en.ts:744` |
| `hud.layout.menu` | Open the settings menu | `src/content/default-locale-en.ts:745` |
| `hud.layout.navigation-width` | Navigation width | `src/content/default-locale-en.ts:746` |
| `hud.layout.inspector-width` | Panel width | `src/content/default-locale-en.ts:747` |
| `hud.layout.inspector-height` | Panel height | `src/content/default-locale-en.ts:748` |
| `hud.layout.reset` | Reset layout | `src/content/default-locale-en.ts:749` |
| `hud.layout.map-only` | Map only | `src/content/default-locale-en.ts:750` |
| `hud.layout.hide-navigation` | Hide the sections | `src/content/default-locale-en.ts:751` |
| `hud.layout.show-navigation` | Show the sections | `src/content/default-locale-en.ts:752` |
| `hud.layout.hide-inspector` | Hide the panels | `src/content/default-locale-en.ts:753` |
| `hud.layout.show-inspector` | Show the panels | `src/content/default-locale-en.ts:754` |
| `hud.layout.hide-metrics` | Hide the counters and the clock | `src/content/default-locale-en.ts:755` |
| `hud.layout.show-metrics` | Show the counters and the clock | `src/content/default-locale-en.ts:756` |
| `hud.layout.resize-navigation` | Resize the sections | `src/content/default-locale-en.ts:757` |
| `hud.layout.resize-inspector` | Resize the panels | `src/content/default-locale-en.ts:758` |
| `hud.zoom.title` | Zoom | `src/content/default-locale-en.ts:799` |
| `hud.zoom.in` | Zoom in | `src/content/default-locale-en.ts:800` |
| `hud.zoom.out` | Zoom out | `src/content/default-locale-en.ts:801` |
| `hud.minimap.title` | Minimap | `src/content/default-locale-en.ts:803` |
| `hud.minimap.placeholder` | No map is drawn here yet — pressing may move the camera | `src/content/default-locale-en.ts:827` |
| `hud.minimap.navigable` | No map is drawn here yet — press to jump the camera there | `src/content/default-locale-en.ts:873` |
| `hud.alerts.title` | Alerts | `src/content/default-locale-en.ts:874` |
| `hud.alerts.empty` | No active alerts | `src/content/default-locale-en.ts:875` |
| `hud.alerts.unknown` | No prison is reporting. | `src/content/default-locale-en.ts:910` |
| `hud.alert.occurrences` | {count}× | `src/content/default-locale-en.ts:956` |
| `hud.alert.time` | Day {day} | `src/content/default-locale-en.ts:957` |
| `hud.alert.dismiss` | Clear this alert | `src/content/default-locale-en.ts:986` |
| `hud.alert.refusal.admit.no-accommodation` | Nobody was admitted — there is no room to put a prisoner in yet. | `src/content/default-locale-en.ts:1010` |
| `hud.alert.refusal.admit.population-full` | Nobody was admitted — this prison is holding as many people as it can. | `src/content/default-locale-en.ts:1011` |
| `hud.alert.refusal.build.duplicate-order` | The build order failed — that order already exists. | `src/content/default-locale-en.ts:1022` |
| `hud.alert.refusal.build.out-of-bounds` | The build order failed — that tile is outside the map. | `src/content/default-locale-en.ts:1023` |
| `hud.alert.refusal.build.unbuildable` | The build order failed — nothing can be built on that tile. | `src/content/default-locale-en.ts:1024` |
| `hud.alert.refusal.build.unbuildable-terrain` | The build order failed — the ground there cannot be built on. | `src/content/default-locale-en.ts:1025` |
| `hud.alert.refusal.build.unknown-buildable` | The build order failed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:1041` |
| `hud.alert.refusal.build.unowned-land` | The build order failed — you do not own that land. | `src/content/default-locale-en.ts:1042` |
| `hud.alert.refusal.build.water-blocked` | The build order failed — there is water on that tile. | `src/content/default-locale-en.ts:1043` |
| `hud.alert.refusal.cancel-build-order.stale-cancellation` | Nothing was refunded — this order moved on before the cancellation reached it. Press Cancel again to see what it pays now. | `src/content/default-locale-en.ts:1063` |
| `hud.alert.refusal.cancel-purchase.not-pending` | Nothing was refunded — that delivery is not on its way any more. | `src/content/default-locale-en.ts:1080` |
| `hud.alert.refusal.construction.materials-unfunded` | The build queue is stalled — no more materials until the prison earns the money. | `src/content/default-locale-en.ts:1128` |
| `hud.alert.refusal.hire.insufficient-funds` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:1239` |
| `hud.alert.refusal.hire.no-duty-for-role` | Nobody was hired — only security staff can hold a post, and this prison has no other work for that role. | `src/content/default-locale-en.ts:1245` |
| `hud.alert.refusal.hire.roster-full` | Nobody was hired — this prison cannot hold any more staff. | `src/content/default-locale-en.ts:1246` |
| `hud.alert.refusal.hire.unknown-role` | Nobody was hired — that is not a role this prison knows. | `src/content/default-locale-en.ts:1247` |
| `hud.alert.refusal.place-object.duplicate-order` | The object was not placed — that order already exists. | `src/content/default-locale-en.ts:1254` |
| `hud.alert.refusal.place-object.not-a-placeable-object` | The object was not placed — that is not something built by placing it on a tile. | `src/content/default-locale-en.ts:1255` |
| `hud.alert.refusal.place-object.out-of-bounds` | The object was not placed — part of it would be outside the map. | `src/content/default-locale-en.ts:1256` |
| `hud.alert.refusal.place-object.outside-room` | The object was not placed — it has to stand in a room you have zoned. | `src/content/default-locale-en.ts:1257` |
| `hud.alert.refusal.place-object.tile-occupied` | The object was not placed — something is already standing there. | `src/content/default-locale-en.ts:1258` |
| `hud.alert.refusal.place-object.unknown-buildable` | The object was not placed — that is not something this prison knows how to build. | `src/content/default-locale-en.ts:1259` |
| `hud.alert.refusal.place-object.unowned-land` | The object was not placed — you do not own all of that land. | `src/content/default-locale-en.ts:1260` |
| `hud.alert.refusal.remove-object.nothing-to-remove` | Nothing was removed — there is no object on that tile, and none being built there. | `src/content/default-locale-en.ts:1270` |
| `hud.alert.refusal.remove-wall.nothing-to-remove` | Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either. | `src/content/default-locale-en.ts:1288` |
| `hud.alert.refusal.purchase.duplicate-order` | The materials were not ordered — that order already exists. | `src/content/default-locale-en.ts:1290` |
| `hud.alert.refusal.purchase.insufficient-funds` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:1300` |
| `hud.alert.refusal.purchase.invalid-quantity` | The materials were not ordered — that quantity cannot be bought. | `src/content/default-locale-en.ts:1301` |
| `hud.alert.refusal.purchase.unknown-material` | The materials were not ordered — that material is not for sale. | `src/content/default-locale-en.ts:1302` |
| `hud.alert.refusal.sell.insufficient-stock` | Nothing was sold — the prison does not have that much in store. | `src/content/default-locale-en.ts:1320` |
| `hud.alert.refusal.sell.invalid-quantity` | Nothing was sold — that quantity cannot be sold. | `src/content/default-locale-en.ts:1321` |
| `hud.alert.refusal.sell.unknown-material` | Nothing was sold — that material has no buyer. | `src/content/default-locale-en.ts:1322` |
| `hud.alert.refusal.dismiss.unknown-staff` | Nobody was dismissed — that staff member is not on the roster. | `src/content/default-locale-en.ts:1341` |
| `hud.alert.refusal.edit-regime-block.unknown-block` | Nothing was changed — that part of the day is not a block on this timetable. | `src/content/default-locale-en.ts:1362` |
| `hud.alert.refusal.edit-regime-block.unknown-group` | Nothing was changed — this prison has no timetable for that group. | `src/content/default-locale-en.ts:1363` |
| `hud.alert.refusal.release-guard.not-held` | Nothing was released — that guard is already off duty. | `src/content/default-locale-en.ts:1364` |
| `hud.alert.refusal.release-guard.unknown-guard` | Nothing was released — that guard is not on the roster. | `src/content/default-locale-en.ts:1365` |
| `hud.alert.refusal.zone.duplicate-instance-id` | The room was not zoned — a room is already recorded on that tile. | `src/content/default-locale-en.ts:1370` |
| `hud.alert.refusal.zone.invalid-area` | The room was not zoned — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1371` |
| `hud.alert.refusal.zone.out-of-bounds` | The room was not zoned — part of that area is outside the map. | `src/content/default-locale-en.ts:1372` |
| `hud.alert.refusal.zone.overlaps-existing-room` | The room was not zoned — it overlaps a room that is already there. | `src/content/default-locale-en.ts:1373` |
| `hud.alert.refusal.zone.unknown-room-type` | The room was not zoned — that is not a room type this prison knows. | `src/content/default-locale-en.ts:1374` |
| `hud.alert.refusal.zone.unowned-land` | The room was not zoned — you do not own all of that land. | `src/content/default-locale-en.ts:1375` |
| `hud.alert.refusal.zone.below-minimum-size` | The room was not zoned — that area is smaller than this room type allows. | `src/content/default-locale-en.ts:1382` |
| `hud.alert.refusal.zone.not-enclosed` | The room was not zoned — this room type needs a finished wall or door along every side, and yours has a gap. | `src/content/default-locale-en.ts:1424` |
| `hud.alert.refusal.unzone.invalid-area` | Nothing was removed — that area is not a valid rectangle. | `src/content/default-locale-en.ts:1429` |
| `hud.alert.refusal.unzone.nothing-to-remove` | Nothing was removed — there is no room in that area. | `src/content/default-locale-en.ts:1430` |
| `hud.alert.refusal.unzone.room-occupied` | Nothing was removed — somebody is using that room. | `src/content/default-locale-en.ts:1431` |
| `hud.alert.fault.invalid-message` | A simulation message was rejected — it was not a message this game understands. | `src/content/default-locale-en.ts:1456` |
| `hud.alert.fault.unsupported-protocol-version` | A simulation message was rejected — it was written for a different version of the game. | `src/content/default-locale-en.ts:1457` |
| `hud.alert.fault.unknown-message-kind` | A simulation message was rejected — this build does not know that kind of message. | `src/content/default-locale-en.ts:1458` |
| `hud.alert.fault.invalid-payload` | A simulation message was rejected — its contents were not what that message must carry. | `src/content/default-locale-en.ts:1459` |
| `hud.alert.fault.not-initialized` | A simulation request was refused — no prison is loaded yet. | `src/content/default-locale-en.ts:1460` |
| `hud.alert.fault.already-initialized` | A simulation request was refused — this session already has a prison loaded. | `src/content/default-locale-en.ts:1461` |
| `hud.alert.fault.duplicate-message` | A command was refused — it had already been sent. | `src/content/default-locale-en.ts:1462` |
| `hud.alert.fault.sequence-gap` | A command was refused — a command sent before it never arrived. | `src/content/default-locale-en.ts:1463` |
| `hud.alert.fault.invalid-state` | A simulation request was refused — the simulation cannot do that right now. | `src/content/default-locale-en.ts:1464` |
| `hud.alert.fault.snapshot-incompatible` | The save could not be loaded — this build does not understand its format. | `src/content/default-locale-en.ts:1465` |
| `hud.alert.fault.shutting-down` | A simulation request was refused — the session is shutting down. | `src/content/default-locale-en.ts:1466` |
| `hud.alert.fault.internal-error` | The simulation hit an internal error. | `src/content/default-locale-en.ts:1467` |
| `hud.alert.event.prisoners.discharged` | one: {count} released — their sentence is served. · other: {count} released — their sentences are served. | `src/content/default-locale-en.ts:1500` |
| `hud.alert.event.economy.wages-unpaid` | Payday went unpaid — your staff are owed {total}. | `src/content/default-locale-en.ts:1501` |
| `hud.alert.event.economy.deliveries-refused` | Deliveries refused — the treasury cannot cover a purchase right now. | `src/content/default-locale-en.ts:1519` |
| `hud.alert.event.economy.construction-refused` | Construction halted — the treasury cannot fund the build queue right now. | `src/content/default-locale-en.ts:1520` |
| `hud.alert.event.economy.deliveries-restored` | The treasury has climbed back above the deliveries floor. | `src/content/default-locale-en.ts:1560` |
| `hud.alert.event.economy.construction-restored` | The treasury has climbed back above the construction floor. | `src/content/default-locale-en.ts:1561` |
| `hud.alert.event.construction.order-cancelled` | The order was cancelled — the money it cost is refunded. | `src/content/default-locale-en.ts:1680` |
| `hud.alert.event.construction.order-cancelled-underway` | The order was cancelled. Anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1681` |
| `hud.alert.event.construction.order-completed` | The order was completed. | `src/content/default-locale-en.ts:1741` |
| `hud.alert.event.construction.undo-refused-newer-action` | Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one. | `src/content/default-locale-en.ts:1770` |
| `hud.alert.event.construction.undone` | The last change to the build queue was undone. | `src/content/default-locale-en.ts:1772` |
| `hud.alert.event.construction.undone-spend-destroyed` | The last change to the build queue was undone — anything already spent past the point of no return stays spent. | `src/content/default-locale-en.ts:1773` |
| `hud.alert.event.construction.redone` | The last change to the build queue was redone. | `src/content/default-locale-en.ts:1775` |
| `hud.alert.event.economy.delivery-cancelled` | The delivery was cancelled — {total} back. | `src/content/default-locale-en.ts:1776` |
| `hud.alert.event.objects.removed-spend-destroyed` | The object was removed — the money it cost does not come back. | `src/content/default-locale-en.ts:1859` |
| `hud.alert.event.prisoners.relocated` | {name} had nowhere to sleep and moved to {room}. | `src/content/default-locale-en.ts:1882` |
| `hud.alert.event.prisoners.housed` | {name} has a place in {room}. | `src/content/default-locale-en.ts:1935` |
| `hud.alert.event.rooms.zoned` | {room} designated. | `src/content/default-locale-en.ts:1990` |
| `hud.alert.event.rooms.needs-cleared` | {room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in. | `src/content/default-locale-en.ts:2069` |
| `hud.alert.event.rooms.unzoned` | {room} removed. | `src/content/default-locale-en.ts:2106` |
| `hud.alert.event.incidents.riot-opened` | one: A riot has broken out — {count} prisoner has stopped taking orders. · other: A riot has broken out — {count} prisoners have stopped taking orders. | `src/content/default-locale-en.ts:2159` |
| `hud.alert.event.incidents.assault-opened` | A fight has broken out between two prisoners. | `src/content/default-locale-en.ts:2160` |
| `hud.alert.event.incidents.escape-attempt-opened` | A prisoner is trying to break out. | `src/content/default-locale-en.ts:2161` |
| `hud.alert.event.incidents.gang-retaliation-opened` | Two gangs are settling a score. | `src/content/default-locale-en.ts:2162` |
| `hud.alert.event.incidents.all-clear` | The prison is under control again — no incident is still open. | `src/content/default-locale-en.ts:2163` |
| `hud.alert.event.incidents.all-clear-after-lapse` | No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt. | `src/content/default-locale-en.ts:2214` |
| `hud.alert.event.incidents.escape-succeeded` | {name} broke out — no guard reached them in time. | `src/content/default-locale-en.ts:2251` |
| `hud.alert.event.contraband.discovered` | Contraband found: {item}. | `src/content/default-locale-en.ts:2286` |
| `hud.unavailable.simulation` | Simulation unavailable — this browser could not start it, so nothing can run or be saved | `src/content/default-locale-en.ts:2312` |
| `hud.panel.collapse` | Collapse | `src/content/default-locale-en.ts:2314` |
| `hud.panel.expand` | Expand | `src/content/default-locale-en.ts:2315` |
| `hud.build.title` | Build | `src/content/default-locale-en.ts:2317` |
| `hud.build.catalogue` | What to build | `src/content/default-locale-en.ts:2318` |
| `hud.build.catalogue-empty` | Nothing is available to build | `src/content/default-locale-en.ts:2319` |
| `hud.build.selected` | Selected | `src/content/default-locale-en.ts:2320` |
| `hud.build.catalogue-row-price` | {buildable} · {total} | `src/content/default-locale-en.ts:2355` |
| `hud.build.catalogue-row-price-segment` | {buildable} · {total} per segment | `src/content/default-locale-en.ts:2376` |
| `hud.build.placement` | Where | `src/content/default-locale-en.ts:2377` |
| `hud.build.tile-x` | Tile X | `src/content/default-locale-en.ts:2378` |
| `hud.build.tile-y` | Tile Y | `src/content/default-locale-en.ts:2379` |
| `hud.build.step-down` | Decrease {field} | `src/content/default-locale-en.ts:2380` |
| `hud.build.step-up` | Increase {field} | `src/content/default-locale-en.ts:2381` |
| `hud.build.edge` | Edge | `src/content/default-locale-en.ts:2382` |
| `hud.build.submit` | Place order | `src/content/default-locale-en.ts:2383` |
| `hud.build.note` | An order is queued now and built while the clock runs. | `src/content/default-locale-en.ts:2384` |
| `hud.build.arm` | Place on map | `src/content/default-locale-en.ts:2385` |
| `hud.build.remove` | Remove | `src/content/default-locale-en.ts:2426` |
| `hud.build.remove-active` | Stop removing | `src/content/default-locale-en.ts:2427` |
| `hud.build.remove-hint` | Press any tile of an object, or a finished wall, to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded. | `src/content/default-locale-en.ts:2451` |
| `hud.build.remove-submit` | Remove object here | `src/content/default-locale-en.ts:2452` |
| `hud.build.disarm` | Stop placing | `src/content/default-locale-en.ts:2453` |
| `hud.build.arm-hint` | Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2454` |
| `hud.build.arm-hint-object` | Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera. | `src/content/default-locale-en.ts:2490` |
| `hud.build.target-none` | Point at the world | `src/content/default-locale-en.ts:2492` |
| `hud.build.target-value` | {x}, {y} · {edge} | `src/content/default-locale-en.ts:2493` |
| `hud.build.target-run` | {count} × {edge} from {x}, {y} | `src/content/default-locale-en.ts:2494` |
| `hud.build.target-tile` | {x}, {y} | `src/content/default-locale-en.ts:2495` |
| `hud.build.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:2496` |
| `hud.build.coordinates-hint` | The keyboard route. Pointing at the map is quicker. | `src/content/default-locale-en.ts:2497` |
| `hud.build.buy` | Buy | `src/content/default-locale-en.ts:2498` |
| `hud.build.buy-quantity` | Quantity | `src/content/default-locale-en.ts:2499` |
| `hud.build.buy-submit` | Buy {count} × {material} · {total} | `src/content/default-locale-en.ts:2500` |
| `hud.build.buy-hint` | Arrives while the clock runs, into the stock a build draws from. | `src/content/default-locale-en.ts:2501` |
| `hud.build.sell` | Sell | `src/content/default-locale-en.ts:2536` |
| `hud.build.sell-submit` | Sell {count} × {material} · {total} | `src/content/default-locale-en.ts:2537` |
| `hud.build.buy-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2577` |
| `hud.build.queue` | Queued | `src/content/default-locale-en.ts:2644` |
| `hud.build.queue-count` | {count} waiting · {started} being built | `src/content/default-locale-en.ts:2645` |
| `hud.build.queue-order` | {buildable} · {x}, {y} · {edge} · {total} back | `src/content/default-locale-en.ts:2646` |
| `hud.build.queue-cancel` | Cancel | `src/content/default-locale-en.ts:2647` |
| `hud.build.queue-unnamed` | Unnamed order | `src/content/default-locale-en.ts:2648` |
| `hud.build.queue-more` | and {count} more behind these — undo takes back a whole run. | `src/content/default-locale-en.ts:2649` |
| `hud.build.queue-shortfall` | Waiting for {total} to unblock the next order. | `src/content/default-locale-en.ts:2650` |
| `hud.build.deliveries` | On the way | `src/content/default-locale-en.ts:2677` |
| `hud.build.deliveries-count` | {count} bought · {total} back if cancelled | `src/content/default-locale-en.ts:2678` |
| `hud.build.delivery` | {count} × {material} · {total} back | `src/content/default-locale-en.ts:2679` |
| `hud.build.delivery-cancel` | Cancel | `src/content/default-locale-en.ts:2680` |
| `hud.build.delivery-unnamed` | Unnamed material | `src/content/default-locale-en.ts:2681` |
| `hud.build.deliveries-more` | and {count} more on the way — these arrive first, and the rest come into view as they land. | `src/content/default-locale-en.ts:2682` |
| `hud.build.buildable.wall-brick` | Brick wall | `src/content/default-locale-en.ts:2683` |
| `hud.build.buildable.door-wooden` | Wooden door | `src/content/default-locale-en.ts:2684` |
| `hud.build.category` | Category | `src/content/default-locale-en.ts:2697` |
| `hud.build.category-all` | Everything | `src/content/default-locale-en.ts:2698` |
| `hud.build.category.structure` | Walls and doors | `src/content/default-locale-en.ts:2699` |
| `hud.overview.title` | Finances | `src/content/default-locale-en.ts:2750` |
| `hud.overview.none` | No prison is reporting. | `src/content/default-locale-en.ts:2751` |
| `hud.overview.wages` | Wages a day | `src/content/default-locale-en.ts:2752` |
| `hud.intake.title` | Intake | `src/content/default-locale-en.ts:2754` |
| `hud.intake.admit` | Admit a prisoner | `src/content/default-locale-en.ts:2755` |
| `hud.intake.hint` | Admitting needs a cell; housing needs a bed. The state pays at the end of each day, only for prisoners with a place. | `src/content/default-locale-en.ts:2839` |
| `hud.intake.no-place` | {count} waiting with no place to sleep | `src/content/default-locale-en.ts:2856` |
| `hud.intake.pipeline` | In intake | `src/content/default-locale-en.ts:2861` |
| `hud.intake.pipeline-count` | {waiting} of {total} | `src/content/default-locale-en.ts:2862` |
| `hud.intake.pipeline-stage` | {count} at {stage} | `src/content/default-locale-en.ts:2863` |
| `hud.intake.pipeline-failed` | {count} cannot be housed at all | `src/content/default-locale-en.ts:2868` |
| `hud.security.staff` | Staff | `src/content/default-locale-en.ts:2876` |
| `hud.security.roles` | Who to hire | `src/content/default-locale-en.ts:2877` |
| `hud.security.roles-empty` | Nobody can be hired yet. | `src/content/default-locale-en.ts:2878` |
| `hud.security.selected` | Selected | `src/content/default-locale-en.ts:2879` |
| `hud.security.hire` | Hire {role} · {total} | `src/content/default-locale-en.ts:2880` |
| `hud.security.hire-hint` | Costs {total} now and {wage} a day in wages, including today. | `src/content/default-locale-en.ts:2938` |
| `hud.security.hire-shortfall` | Not enough money — you need {amount} more. | `src/content/default-locale-en.ts:2950` |
| `hud.security.hire-unassigned` | A new guard starts unassigned. | `src/content/default-locale-en.ts:2973` |
| `hud.security.held` | On duty | `src/content/default-locale-en.ts:2981` |
| `hud.security.held-summary` | {held} held · {unassigned} free | `src/content/default-locale-en.ts:2982` |
| `hud.security.held-empty` | Nobody is assigned right now. | `src/content/default-locale-en.ts:2983` |
| `hud.security.held-row` | {name} · {claim} | `src/content/default-locale-en.ts:2984` |
| `hud.security.held-row-unnamed` | Guard {id} · {claim} | `src/content/default-locale-en.ts:2985` |
| `hud.security.held-release` | Release | `src/content/default-locale-en.ts:2986` |
| `hud.security.held-more` | and {count} more | `src/content/default-locale-en.ts:2987` |
| `hud.security.held-hint` | A released guard stays hired and goes back to the pool. | `src/content/default-locale-en.ts:2988` |
| `hud.security.roster` | On the payroll | `src/content/default-locale-en.ts:3027` |
| `hud.security.roster-wage-bill` | {total} a day | `src/content/default-locale-en.ts:3048` |
| `hud.security.roster-dismiss` | Dismiss | `src/content/default-locale-en.ts:3049` |
| `hud.security.roster-dismiss-confirm` | Dismiss {name}? Their wage stops and they do not come back. | `src/content/default-locale-en.ts:3078` |
| `hud.security.roster-hint` | A dismissed staff member leaves the prison for good, and their wage stops. | `src/content/default-locale-en.ts:3079` |
| `hud.security.coverage` | Guard coverage | `src/content/default-locale-en.ts:3089` |
| `hud.security.coverage-summary` | {assigned} of {required} | `src/content/default-locale-en.ts:3090` |
| `hud.security.coverage-met` | Covered | `src/content/default-locale-en.ts:3091` |
| `hud.security.coverage-met-hint` | Incidents and searches need free guards. | `src/content/default-locale-en.ts:3264` |
| `hud.security.coverage-short` | Understaffed | `src/content/default-locale-en.ts:3265` |
| `hud.security.coverage-short-hint` | Hire {count} more to cover this population. | `src/content/default-locale-en.ts:3266` |
| `hud.security.coverage-unguarded` | Unguarded | `src/content/default-locale-en.ts:3267` |
| `hud.security.coverage-unguarded-hint` | Nobody is on duty. Hire {count} to cover this population. | `src/content/default-locale-en.ts:3268` |
| `hud.security.post-unreachable` | Post cut off | `src/content/default-locale-en.ts:3297` |
| `hud.security.post-unreachable-hint` | No guard can reach the post, so nobody is on duty. Taking down a wall beside it opens the way back. | `src/content/default-locale-en.ts:3298` |
| `hud.security.coverage-overcrowded` | Overcrowded | `src/content/default-locale-en.ts:3328` |
| `hud.security.coverage-overcrowded-hint` | More prisoners than beds: every prisoner's safety runs down faster, and past a point their hygiene does too, until there is a bed for each of them. | `src/content/default-locale-en.ts:3329` |
| `hud.security.coverage-unguarded-consequence` | No guard is posted here, so nobody in this sector is kept safe. | `src/content/default-locale-en.ts:3378` |
| `hud.regime.title` | Regime | `src/content/default-locale-en.ts:3394` |
| `hud.regime.blocks` | Today's blocks | `src/content/default-locale-en.ts:3395` |
| `hud.regime.block-allows` | Allows {categories} | `src/content/default-locale-en.ts:3396` |
| `hud.regime.block-progress` | {percent}% through | `src/content/default-locale-en.ts:3397` |
| `hud.regime.category-separator` | ,  | `src/content/default-locale-en.ts:3400` |
| `hud.regime.edit` | Change the block running now | `src/content/default-locale-en.ts:3418` |
| `hud.regime.edit-last-category` | A block has to allow at least one thing, so the last one cannot be switched off. | `src/content/default-locale-en.ts:3427` |
| `hud.regime.sentence-remaining` | Sentence remaining (in-game days): {days} | `src/content/default-locale-en.ts:3430` |
| `hud.regime.roster` | Prisoners | `src/content/default-locale-en.ts:3443` |
| `hud.regime.roster-count` | {shown} of {total} | `src/content/default-locale-en.ts:3444` |
| `hud.regime.roster-name` | {given} {family} | `src/content/default-locale-en.ts:3445` |
| `hud.regime.roster-unnamed` | Prisoner {id} | `src/content/default-locale-en.ts:3446` |
| `hud.regime.roster-heading` | Heading to {activity} | `src/content/default-locale-en.ts:3447` |
| `hud.regime.roster-more` | and {count} more | `src/content/default-locale-en.ts:3448` |
| `hud.regime.roster-empty` | No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in. | `src/content/default-locale-en.ts:3480` |
| `hud.regime.roster-emptied` | This prison is empty. Take somebody in to start again. | `src/content/default-locale-en.ts:3517` |
| `hud.refusal.set-clock` | The clock did not change — the request was refused. | `src/content/default-locale-en.ts:3532` |
| `hud.refusal.place-build-order` | The build order was not placed — the request was refused. | `src/content/default-locale-en.ts:3533` |
| `hud.refusal.purchase-materials` | Nothing was bought — the purchase was refused and no money was spent. | `src/content/default-locale-en.ts:3534` |
| `hud.refusal.hire-staff` | Nobody was hired — the request was refused and no money was spent. | `src/content/default-locale-en.ts:3535` |
| `hud.refusal.purchase-materials-past-floor` | Nothing was bought — deliveries are refused until the prison earns the money. | `src/content/default-locale-en.ts:3558` |
| `hud.refusal.hire-staff-past-floor` | Nobody was hired — hiring is refused until the prison earns the money. | `src/content/default-locale-en.ts:3559` |
| `hud.refusal.undo` | Nothing was undone — the request was refused. | `src/content/default-locale-en.ts:3560` |
| `hud.refusal.redo` | Nothing was redone — the request was refused. | `src/content/default-locale-en.ts:3561` |
| `hud.refusal.zone-room` | The room was not designated — the request was refused. | `src/content/default-locale-en.ts:3562` |
| `hud.refusal.unzone-room` | Nothing was removed — the request was refused. | `src/content/default-locale-en.ts:3563` |
| `hud.refusal.admit-prisoner` | Nobody was admitted — the request was refused. | `src/content/default-locale-en.ts:3564` |
| `hud.refusal.admit-prisoner-no-room` | Nobody was admitted — this prison has no room to hold anybody. | `src/content/default-locale-en.ts:3580` |
| `hud.refusal.cancel-build-order` | The order is still queued — the request was refused. | `src/content/default-locale-en.ts:3581` |
| `hud.refusal.cancel-material-purchase` | Nothing was refunded — the request was refused and the delivery is still on its way. | `src/content/default-locale-en.ts:3587` |
| `hud.refusal.sell-materials` | Nothing was sold — the request was refused and nothing was taken from stock. | `src/content/default-locale-en.ts:3594` |
| `hud.refusal.release-guard` | Nobody was released — the request was refused and the guard is still assigned. | `src/content/default-locale-en.ts:3595` |
| `hud.rooms.title` | Rooms | `src/content/default-locale-en.ts:3597` |
| `hud.rooms.catalogue` | Room type and area | `src/content/default-locale-en.ts:3601` |
| `hud.rooms.catalogue-empty` | No room types are available | `src/content/default-locale-en.ts:3602` |
| `hud.rooms.selected` | Selected | `src/content/default-locale-en.ts:3603` |
| `hud.rooms.arm` | Draw on map | `src/content/default-locale-en.ts:3604` |
| `hud.rooms.disarm` | Stop drawing | `src/content/default-locale-en.ts:3605` |
| `hud.rooms.arm-hint` | Drag a rectangle across the tiles this room should cover. | `src/content/default-locale-en.ts:3606` |
| `hud.rooms.remove` | Remove rooms | `src/content/default-locale-en.ts:3607` |
| `hud.rooms.remove-active` | Stop removing | `src/content/default-locale-en.ts:3608` |
| `hud.rooms.remove-hint` | Drag across any part of a room to remove all of it. | `src/content/default-locale-en.ts:3617` |
| `hud.rooms.area` | Area | `src/content/default-locale-en.ts:3618` |
| `hud.rooms.area-none` | Nothing selected | `src/content/default-locale-en.ts:3619` |
| `hud.rooms.area-value` | {width} × {height} tiles at {x}, {y} | `src/content/default-locale-en.ts:3620` |
| `hud.rooms.confirm` | Designate {width} × {height} | `src/content/default-locale-en.ts:3621` |
| `hud.rooms.confirm-remove` | Remove {width} × {height} | `src/content/default-locale-en.ts:3624` |
| `hud.rooms.cancel` | Discard | `src/content/default-locale-en.ts:3625` |
| `hud.rooms.minimum` | Needs at least {width} × {height} tiles | `src/content/default-locale-en.ts:3626` |
| `hud.rooms.minimum-none` | No minimum size | `src/content/default-locale-en.ts:3627` |
| `hud.rooms.too-small` | Too small — this room needs at least {width} × {height} tiles. | `src/content/default-locale-en.ts:3628` |
| `hud.rooms.enclosure` | Enclosure | `src/content/default-locale-en.ts:3629` |
| `hud.rooms.enclosure-none` | Not evaluated yet | `src/content/default-locale-en.ts:3630` |
| `hud.rooms.enclosure-sealed` | Walled in — not a door check | `src/content/default-locale-en.ts:3673` |
| `hud.rooms.enclosure-open` | Open on at least one side | `src/content/default-locale-en.ts:3674` |
| `hud.rooms.requirement-enclosed` | Needs walls or doors all round | `src/content/default-locale-en.ts:3685` |
| `hud.rooms.requirement-outdoors` | Must be outdoors | `src/content/default-locale-en.ts:3686` |
| `hud.rooms.requirement-none` | No enclosure rule | `src/content/default-locale-en.ts:3687` |
| `hud.rooms.requires-object` | Needs {count} × {object} | `src/content/default-locale-en.ts:3694` |
| `hud.rooms.requires-none` | No objects needed | `src/content/default-locale-en.ts:3699` |
| `hud.rooms.coordinates` | Enter coordinates | `src/content/default-locale-en.ts:3703` |
| `hud.rooms.coordinates-hint` | The keyboard route. Dragging on the map is quicker. | `src/content/default-locale-en.ts:3704` |
| `hud.rooms.coordinates-submit` | Use these tiles | `src/content/default-locale-en.ts:3709` |
| `hud.rooms.tile-x` | Tile X | `src/content/default-locale-en.ts:3710` |
| `hud.rooms.tile-y` | Tile Y | `src/content/default-locale-en.ts:3711` |
| `hud.rooms.width` | Width | `src/content/default-locale-en.ts:3712` |
| `hud.rooms.height` | Height | `src/content/default-locale-en.ts:3713` |
| `hud.rooms.step-down` | Decrease {field} | `src/content/default-locale-en.ts:3714` |
| `hud.rooms.step-up` | Increase {field} | `src/content/default-locale-en.ts:3715` |
| `hud.rooms.needs` | Not ready | `src/content/default-locale-en.ts:3720` |
| `hud.rooms.needs-count` | {unfinished} of {total} | `src/content/default-locale-en.ts:3721` |
| `hud.rooms.needs-room` | {room} at {x}, {y} is missing | `src/content/default-locale-en.ts:3726` |
| `hud.rooms.needs-object` | {count} × {object} | `src/content/default-locale-en.ts:3730` |
| `hud.rooms.needs-object-uncounted` | {object} | `src/content/default-locale-en.ts:3735` |
| `hud.rooms.needs-item-more` | and {count} more | `src/content/default-locale-en.ts:3740` |
| `hud.rooms.needs-object-unknown` | something this build cannot name | `src/content/default-locale-en.ts:3744` |
| `hud.rooms.needs-doorway` | a door — nobody can get in | `src/content/default-locale-en.ts:3771` |
| `hud.rooms.needs-unreachable` | a way in — nothing outside can reach its door | `src/content/default-locale-en.ts:3813` |
| `hud.rooms.at-capacity` | At capacity | `src/content/default-locale-en.ts:3873` |
| `hud.rooms.at-capacity-count` | {full} of {total} | `src/content/default-locale-en.ts:3874` |
| `hud.rooms.at-capacity-room` | {room} at {x}, {y} is full | `src/content/default-locale-en.ts:3875` |
| `hud.rooms.at-capacity-places` | places in use: {inUse} of {capacity} | `src/content/default-locale-en.ts:3876` |
| `hud.security-section.title` | Security | `src/content/default-locale-en.ts:3898` |
| `hud.security-section.waiting` | No prison is reporting. | `src/content/default-locale-en.ts:3907` |
| `hud.security-section.sectors` | Sectors | `src/content/default-locale-en.ts:3910` |
| `hud.security-section.sectors-empty` | No sector has been drawn on this land yet. | `src/content/default-locale-en.ts:3917` |
| `hud.security-section.sector-staffing` | {assigned} of {required} guards assigned | `src/content/default-locale-en.ts:3924` |
| `hud.security-section.sector-short` | {count} short | `src/content/default-locale-en.ts:3931` |
| `hud.security-section.sector-open-incidents` | {count} open here | `src/content/default-locale-en.ts:3937` |
| `hud.security-section.lockdown` | Lockdown | `src/content/default-locale-en.ts:3946` |
| `hud.security-section.incidents` | Incidents | `src/content/default-locale-en.ts:3949` |
| `hud.security-section.incidents-none` | Nothing has been recorded yet. | `src/content/default-locale-en.ts:3958` |
| `hud.security-section.incidents-closed` | Nothing is open. {total} recorded so far. | `src/content/default-locale-en.ts:3967` |
| `hud.security-section.incidents-summary` | {open} open of {total} recorded | `src/content/default-locale-en.ts:3969` |
| `hud.security-section.incidents-toll` | {injured} hurt, {escapes} got out | `src/content/default-locale-en.ts:3976` |
| `hud.security-section.incident-row` | {type} in {sector} | `src/content/default-locale-en.ts:4014` |
| `hud.security-section.incident-severity` | Severity {severity} of {max} | `src/content/default-locale-en.ts:4021` |
| `hud.security-section.incident-people` | {count} taking part | `src/content/default-locale-en.ts:4027` |
| `hud.security-section.incident-timeline` | How it went | `src/content/default-locale-en.ts:4029` |
| `hud.security-section.incident-timeline-row` | {state} at tick {tick} | `src/content/default-locale-en.ts:4040` |
| `hud.security-section.incident-responders` | Responders needed: {count} | `src/content/default-locale-en.ts:4054` |
| `hud.security-section.incident-outcome` | {injured} hurt, damage {damage} of {max} | `src/content/default-locale-en.ts:4061` |
| `hud.security-section.incident-escaped` | Somebody got out. | `src/content/default-locale-en.ts:4063` |
| `hud.security-section.incidents-by-type` | By kind | `src/content/default-locale-en.ts:4065` |
| `hud.security-section.count-row` | {label}: {count} | `src/content/default-locale-en.ts:4071` |
| `hud.security-section.contraband` | Contraband | `src/content/default-locale-en.ts:4074` |
| `hud.security-section.searches-none` | No search is under way. | `src/content/default-locale-en.ts:4083` |
| `hud.security-section.search-row` | {scope} search - {state} | `src/content/default-locale-en.ts:4091` |
| `hud.security-section.search-progress` | {done} of {count} searched | `src/content/default-locale-en.ts:4097` |
| `hud.security-section.found` | Confiscated | `src/content/default-locale-en.ts:4099` |
| `hud.security-section.found-none` | Nothing has been confiscated. | `src/content/default-locale-en.ts:4109` |
| `hud.security-section.search-tally` | {found} found, {missed} missed | `src/content/default-locale-en.ts:4116` |
| `hud.severity.info` | Info | `src/content/default-locale-en.ts:4118` |
| `hud.severity.warning` | Warning | `src/content/default-locale-en.ts:4119` |
| `hud.severity.danger` | Critical | `src/content/default-locale-en.ts:4120` |
| `save.panel.region` | Prison saves | `src/content/default-locale-en.ts:4135` |
| `save.panel.title` | Prisons | `src/content/default-locale-en.ts:4136` |
| `save.action.create` | New prison | `src/content/default-locale-en.ts:4138` |
| `save.action.save` | Save now | `src/content/default-locale-en.ts:4139` |
| `save.action.export` | Export | `src/content/default-locale-en.ts:4140` |
| `save.action.import` | Import | `src/content/default-locale-en.ts:4141` |
| `save.action.load` | Load | `src/content/default-locale-en.ts:4142` |
| `save.action.delete` | Delete | `src/content/default-locale-en.ts:4143` |
| `save.action.delete-confirm` | Delete permanently | `src/content/default-locale-en.ts:4147` |
| `save.action.delete-cancel` | Keep | `src/content/default-locale-en.ts:4148` |
| `save.list.empty` | No prisons yet. | `src/content/default-locale-en.ts:4150` |
| `save.list.item` | {name} ({count} gen) | `src/content/default-locale-en.ts:4151` |
| `save.status.idle` | Local saves only — no network required. | `src/content/default-locale-en.ts:4153` |
| `save.status.saved` | Saved (generation {generation}). | `src/content/default-locale-en.ts:4154` |
| `save.status.quota-exceeded` | Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact. | `src/content/default-locale-en.ts:4159` |
| `save.status.transaction-aborted` | The browser interrupted the save. Your previous save is intact — try saving again. | `src/content/default-locale-en.ts:4161` |
| `save.status.changed-elsewhere` | Could not save: this prison was changed elsewhere. | `src/content/default-locale-en.ts:4175` |
| `save.status.save-failed` | Save failed: {detail} | `src/content/default-locale-en.ts:4176` |
| `save.status.list-unreadable` | Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail} | `src/content/default-locale-en.ts:4180` |
| `save.status.creating` | Creating prison… | `src/content/default-locale-en.ts:4182` |
| `save.status.create-failed` | Could not create a prison: {detail} | `src/content/default-locale-en.ts:4183` |
| `save.status.no-active-prison` | No active prison — create or load one first. | `src/content/default-locale-en.ts:4184` |
| `save.status.saving` | Saving… | `src/content/default-locale-en.ts:4185` |
| `save.status.loading` | Loading… | `src/content/default-locale-en.ts:4186` |
| `save.status.not-found` | That prison no longer exists. | `src/content/default-locale-en.ts:4187` |
| `save.status.no-readable-generation` | No readable save generation remains for this prison. Every retained copy failed validation. | `src/content/default-locale-en.ts:4188` |
| `save.status.recovered` | The most recent save was unreadable — recovered an earlier verified generation. | `src/content/default-locale-en.ts:4190` |
| `save.status.loaded` | Loaded. | `src/content/default-locale-en.ts:4191` |
| `save.status.deleted` | Prison deleted. You can bring it back from the list below for one day. | `src/content/default-locale-en.ts:4196` |
| `save.status.delete-kept` | Nothing was deleted. | `src/content/default-locale-en.ts:4200` |
| `save.status.nothing-to-export` | Nothing to export — no valid active save. | `src/content/default-locale-en.ts:4201` |
| `save.status.exported` | Exported the current save. | `src/content/default-locale-en.ts:4202` |
| `save.status.importing` | Reading the save file… | `src/content/default-locale-en.ts:4209` |
| `save.status.imported` | Imported the save file into this prison (generation {generation}). | `src/content/default-locale-en.ts:4210` |
| `save.status.imported-migrated` | Imported a save from an older version of LockState.io and brought it up to date (generation {generation}). | `src/content/default-locale-en.ts:4211` |
| `save.status.import-not-a-save` | That file is not a LockState.io save — choose a file exported from this game. | `src/content/default-locale-en.ts:4213` |
| `save.status.import-unsupported-version` | That save was written by a newer version of LockState.io than this one. Update the game, then import it again. | `src/content/default-locale-en.ts:4214` |
| `save.status.import-corrupt` | That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported. | `src/content/default-locale-en.ts:4216` |
| `save.status.import-invalid` | That save file could not be read: {detail} | `src/content/default-locale-en.ts:4218` |
| `save.failure.create` | Creating the prison failed: {detail} | `src/content/default-locale-en.ts:4220` |
| `save.failure.save` | Saving failed: {detail} | `src/content/default-locale-en.ts:4221` |
| `save.failure.load` | Loading failed: {detail} | `src/content/default-locale-en.ts:4222` |
| `save.failure.delete` | Deleting failed: {detail} | `src/content/default-locale-en.ts:4223` |
| `save.failure.export` | Exporting failed: {detail} | `src/content/default-locale-en.ts:4224` |
| `save.failure.import` | Importing failed: {detail} | `src/content/default-locale-en.ts:4225` |
| `save.failure.restore` | Bringing the prison back failed: {detail} | `src/content/default-locale-en.ts:4226` |
| `save.failure.forget` | Freeing the space failed: {detail} | `src/content/default-locale-en.ts:4227` |
| `save.failure.unknown` | The action failed: {detail} | `src/content/default-locale-en.ts:4228` |
| `save.detail.restored-scope` | Restored: {restored}. Not carried by this save version: {notCarried}. | `src/content/default-locale-en.ts:4235` |
| `save.delete.confirm` | Delete {name}? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed {age}. | `src/content/default-locale-en.ts:4274` |
| `save.delete.age.moments` | less than a minute ago | `src/content/default-locale-en.ts:4279` |
| `save.delete.age.minutes` | {count} min ago | `src/content/default-locale-en.ts:4280` |
| `save.delete.age.hours` | {count} h ago | `src/content/default-locale-en.ts:4281` |
| `save.delete.age.days` | {count} d ago | `src/content/default-locale-en.ts:4282` |
| `save.tombstone.item` | {name} — deleted. You can still bring it back. | `src/content/default-locale-en.ts:4305` |
| `save.action.tombstone-restore` | Bring it back | `src/content/default-locale-en.ts:4306` |
| `save.action.tombstone-forget` | Free its space now | `src/content/default-locale-en.ts:4312` |
| `save.status.tombstone-restored` | {name} is back, exactly as it was. | `src/content/default-locale-en.ts:4323` |
| `save.status.tombstone-window-closed` | Too late — that prison can no longer be brought back. | `src/content/default-locale-en.ts:4327` |
| `save.status.tombstone-slot-taken` | That prison cannot come back — another prison now holds its place, and is still here. | `src/content/default-locale-en.ts:4331` |
| `save.status.tombstone-gone` | That prison is no longer here to bring back. | `src/content/default-locale-en.ts:4334` |
| `save.status.tombstone-forgotten` | Gone for good. Nothing of that prison is kept now. | `src/content/default-locale-en.ts:4338` |
| `save.scope.kernel` | kernel tick and command queue | `src/content/default-locale-en.ts:4357` |
| `save.scope.rng-streams` | RNG stream states | `src/content/default-locale-en.ts:4358` |
| `save.scope.world` | world terrain and ownership | `src/content/default-locale-en.ts:4359` |
| `save.scope.construction` | construction orders and undo/redo | `src/content/default-locale-en.ts:4360` |
| `save.scope.entity-liveness` | entity id liveness | `src/content/default-locale-en.ts:4361` |
| `save.scope.prisoners` | prisoners, needs, actions and cell assignments | `src/content/default-locale-en.ts:4362` |
| `save.scope.operations` | jobs, containers and utility networks | `src/content/default-locale-en.ts:4363` |
| `save.scope.security` | doors, security sectors, guards and patrols | `src/content/default-locale-en.ts:4364` |
| `save.scope.contraband` | contraband, intelligence and searches | `src/content/default-locale-en.ts:4365` |
| `save.scope.incidents` | incidents, gangs and tunnels | `src/content/default-locale-en.ts:4366` |
| `save.scope.names` | prisoner and staff names | `src/content/default-locale-en.ts:4367` |
| `save.scope.room-caches` | room and topology caches (recomputed from the world) | `src/content/default-locale-en.ts:4372` |
| `save.scope.navigation-caches` | navigation caches and in-flight path requests (re-issued on the next tick) | `src/content/default-locale-en.ts:4373` |
| `input.action.camera.up` | Pan camera up | `src/content/default-locale-en.ts:4381` |
| `input.action.camera.down` | Pan camera down | `src/content/default-locale-en.ts:4382` |
| `input.action.camera.left` | Pan camera left | `src/content/default-locale-en.ts:4383` |
| `input.action.camera.right` | Pan camera right | `src/content/default-locale-en.ts:4384` |
| `input.action.camera.zoom.in` | Zoom in | `src/content/default-locale-en.ts:4385` |
| `input.action.camera.zoom.out` | Zoom out | `src/content/default-locale-en.ts:4386` |
| `input.action.selection.primary` | Select | `src/content/default-locale-en.ts:4387` |
| `input.action.build.confirm` | Confirm placement | `src/content/default-locale-en.ts:4388` |
| `input.action.build.cancel` | Cancel | `src/content/default-locale-en.ts:4391` |
| `input.action.edit.undo` | Undo | `src/content/default-locale-en.ts:4395` |
| `input.action.edit.redo` | Redo | `src/content/default-locale-en.ts:4396` |
| `brand.region` | LockState.io build | `src/content/default-locale-en.ts:4408` |
| `brand.wordmark` | LockState.io | `src/content/default-locale-en.ts:4411` |
| `brand.stage` | PRE-ALPHA | `src/content/default-locale-en.ts:4419` |
| `brand.build` | v{version} · {commit} | `src/content/default-locale-en.ts:4428` |
| `brand.description` | LockState.io, {stage} build, version {version}, commit {commit}. | `src/content/default-locale-en.ts:4432` |
| `display.scale.region` | Interface scale | `src/content/default-locale-en.ts:4448` |
| `display.scale.cycle` | Change the interface scale | `src/content/default-locale-en.ts:4449` |
| `display.theme.region` | Theme | `src/content/default-locale-en.ts:4465` |
| `display.theme.system` | System | `src/content/default-locale-en.ts:4466` |
| `display.theme.light` | Light | `src/content/default-locale-en.ts:4467` |
| `display.theme.dark` | Dark | `src/content/default-locale-en.ts:4468` |
| `display.theme.cycle` | Change the interface theme | `src/content/default-locale-en.ts:4469` |
| `display.language.region` | Language | `src/content/default-locale-en.ts:4494` |
| `display.language.automatic` | Automatic ({language}) | `src/content/default-locale-en.ts:4495` |
| `display.language.english` | English | `src/content/default-locale-en.ts:4496` |
| `display.language.polish` | Polski | `src/content/default-locale-en.ts:4497` |
| `display.language.cycle` | Change the interface language and reload the game | `src/content/default-locale-en.ts:4505` |
| `app.shell.label` | LockState.io game application | `src/content/default-locale-en.ts:4516` |

