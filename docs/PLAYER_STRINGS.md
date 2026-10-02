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

## The 594 authored sentences

Source: `src/content/default-locale-en.ts`, in the order they are declared.

| Key | Ships today | At |
| --- | --- | --- |
| `room.cell.name` | `Cell` | `src/content/default-locale-en.ts:26`, `'room.cell.name'` |
| `room.holding-cell.name` | `Holding Cell` | `src/content/default-locale-en.ts:27`, `'room.holding-cell.name'` |
| `room.solitary-cell.name` | `Solitary Cell` | `src/content/default-locale-en.ts:28`, `'room.solitary-cell.name'` |
| `room.reception.name` | `Reception` | `src/content/default-locale-en.ts:29`, `'room.reception.name'` |
| `room.kitchen.name` | `Kitchen` | `src/content/default-locale-en.ts:30`, `'room.kitchen.name'` |
| `room.canteen.name` | `Canteen` | `src/content/default-locale-en.ts:31`, `'room.canteen.name'` |
| `room.shower-room.name` | `Shower Room` | `src/content/default-locale-en.ts:32`, `'room.shower-room.name'` |
| `room.laundry.name` | `Laundry` | `src/content/default-locale-en.ts:33`, `'room.laundry.name'` |
| `room.yard.name` | `Yard` | `src/content/default-locale-en.ts:34`, `'room.yard.name'` |
| `room.common-room.name` | `Common Room` | `src/content/default-locale-en.ts:35`, `'room.common-room.name'` |
| `room.classroom.name` | `Classroom` | `src/content/default-locale-en.ts:36`, `'room.classroom.name'` |
| `room.infirmary.name` | `Infirmary` | `src/content/default-locale-en.ts:37`, `'room.infirmary.name'` |
| `room.security-office.name` | `Security Office` | `src/content/default-locale-en.ts:38`, `'room.security-office.name'` |
| `room.staff-room.name` | `Staff Room` | `src/content/default-locale-en.ts:39`, `'room.staff-room.name'` |
| `room.storage-room.name` | `Storage Room` | `src/content/default-locale-en.ts:40`, `'room.storage-room.name'` |
| `room.delivery-bay.name` | `Delivery Bay` | `src/content/default-locale-en.ts:41`, `'room.delivery-bay.name'` |
| `room.garbage-room.name` | `Garbage Room` | `src/content/default-locale-en.ts:42`, `'room.garbage-room.name'` |
| `room.utility-room.name` | `Utility Room` | `src/content/default-locale-en.ts:43`, `'room.utility-room.name'` |
| `object.bed.name` | `Bed` | `src/content/default-locale-en.ts:45`, `'object.bed.name'` |
| `object.medical-bed.name` | `Medical Bed` | `src/content/default-locale-en.ts:46`, `'object.medical-bed.name'` |
| `object.toilet.name` | `Toilet` | `src/content/default-locale-en.ts:47`, `'object.toilet.name'` |
| `object.sink.name` | `Sink` | `src/content/default-locale-en.ts:48`, `'object.sink.name'` |
| `object.shower-head.name` | `Shower Head` | `src/content/default-locale-en.ts:49`, `'object.shower-head.name'` |
| `object.washing-machine.name` | `Washing Machine` | `src/content/default-locale-en.ts:50`, `'object.washing-machine.name'` |
| `object.desk.name` | `Desk` | `src/content/default-locale-en.ts:51`, `'object.desk.name'` |
| `object.chair.name` | `Chair` | `src/content/default-locale-en.ts:52`, `'object.chair.name'` |
| `object.stove.name` | `Stove` | `src/content/default-locale-en.ts:53`, `'object.stove.name'` |
| `object.prep-counter.name` | `Prep Counter` | `src/content/default-locale-en.ts:54`, `'object.prep-counter.name'` |
| `object.fridge.name` | `Fridge` | `src/content/default-locale-en.ts:55`, `'object.fridge.name'` |
| `object.dining-table.name` | `Dining Table` | `src/content/default-locale-en.ts:56`, `'object.dining-table.name'` |
| `object.exercise-station.name` | `Exercise station` | `src/content/default-locale-en.ts:57`, `'object.exercise-station.name'` |
| `object.bench.name` | `Bench` | `src/content/default-locale-en.ts:58`, `'object.bench.name'` |
| `object.bookshelf.name` | `Bookshelf` | `src/content/default-locale-en.ts:59`, `'object.bookshelf.name'` |
| `object.medicine-cabinet.name` | `Medicine Cabinet` | `src/content/default-locale-en.ts:60`, `'object.medicine-cabinet.name'` |
| `object.security-console.name` | `Security Console` | `src/content/default-locale-en.ts:61`, `'object.security-console.name'` |
| `object.storage-rack.name` | `Storage Rack` | `src/content/default-locale-en.ts:62`, `'object.storage-rack.name'` |
| `object.loading-dock-door.name` | `Loading Dock Door` | `src/content/default-locale-en.ts:63`, `'object.loading-dock-door.name'` |
| `object.waste-bin.name` | `Waste Bin` | `src/content/default-locale-en.ts:64`, `'object.waste-bin.name'` |
| `object.utility-panel.name` | `Utility Panel` | `src/content/default-locale-en.ts:65`, `'object.utility-panel.name'` |
| `object.category.furniture.name` | `Furniture` | `src/content/default-locale-en.ts:98`, `'object.category.furniture.name'` |
| `object.category.sanitation.name` | `Plumbing` | `src/content/default-locale-en.ts:99`, `'object.category.sanitation.name'` |
| `object.category.food-service.name` | `Catering` | `src/content/default-locale-en.ts:100`, `'object.category.food-service.name'` |
| `object.category.security.name` | `Security` | `src/content/default-locale-en.ts:101`, `'object.category.security.name'` |
| `object.category.storage.name` | `Storage` | `src/content/default-locale-en.ts:102`, `'object.category.storage.name'` |
| `object.category.utility.name` | `Utility` | `src/content/default-locale-en.ts:103`, `'object.category.utility.name'` |
| `object.category.medical.name` | `Medical` | `src/content/default-locale-en.ts:104`, `'object.category.medical.name'` |
| `staff-role.warden.name` | `Warden` | `src/content/default-locale-en.ts:106`, `'staff-role.warden.name'` |
| `staff-role.administrator.name` | `Administrator` | `src/content/default-locale-en.ts:107`, `'staff-role.administrator.name'` |
| `staff-role.guard.name` | `Guard` | `src/content/default-locale-en.ts:108`, `'staff-role.guard.name'` |
| `staff-role.security-chief.name` | `Security Chief` | `src/content/default-locale-en.ts:109`, `'staff-role.security-chief.name'` |
| `staff-role.nurse.name` | `Nurse` | `src/content/default-locale-en.ts:110`, `'staff-role.nurse.name'` |
| `staff-role.doctor.name` | `Doctor` | `src/content/default-locale-en.ts:111`, `'staff-role.doctor.name'` |
| `staff-role.maintenance-worker.name` | `Maintenance Worker` | `src/content/default-locale-en.ts:112`, `'staff-role.maintenance-worker.name'` |
| `staff-role.kitchen-staff.name` | `Kitchen Staff` | `src/content/default-locale-en.ts:113`, `'staff-role.kitchen-staff.name'` |
| `item.brick.name` | `Brick` | `src/content/default-locale-en.ts:115`, `'item.brick.name'` |
| `item.wood-plank.name` | `Wood Plank` | `src/content/default-locale-en.ts:116`, `'item.wood-plank.name'` |
| `item.food-ration.name` | `Food Ration` | `src/content/default-locale-en.ts:117`, `'item.food-ration.name'` |
| `item.dirty-linen.name` | `Dirty Linen` | `src/content/default-locale-en.ts:118`, `'item.dirty-linen.name'` |
| `item.clean-linen.name` | `Clean Linen` | `src/content/default-locale-en.ts:119`, `'item.clean-linen.name'` |
| `item.waste.name` | `Waste` | `src/content/default-locale-en.ts:120`, `'item.waste.name'` |
| `grade.general.name` | `General` | `src/content/default-locale-en.ts:122`, `'grade.general.name'` |
| `grade.medical.name` | `Medical` | `src/content/default-locale-en.ts:123`, `'grade.medical.name'` |
| `grade.high-security.name` | `High Security` | `src/content/default-locale-en.ts:124`, `'grade.high-security.name'` |
| `grade.staff-only.name` | `Staff Only` | `src/content/default-locale-en.ts:125`, `'grade.staff-only.name'` |
| `grade.administrative.name` | `Administrative` | `src/content/default-locale-en.ts:126`, `'grade.administrative.name'` |
| `contraband.weapon.name` | `Weapon` | `src/content/default-locale-en.ts:128`, `'contraband.weapon.name'` |
| `contraband.drug.name` | `Drugs` | `src/content/default-locale-en.ts:129`, `'contraband.drug.name'` |
| `contraband.phone.name` | `Phone` | `src/content/default-locale-en.ts:130`, `'contraband.phone.name'` |
| `contraband.currency.name` | `Currency` | `src/content/default-locale-en.ts:131`, `'contraband.currency.name'` |
| `contraband.tool.name` | `Tool` | `src/content/default-locale-en.ts:132`, `'contraband.tool.name'` |
| `hud.status.title` | `Prison status` | `src/content/default-locale-en.ts:158`, `'hud.status.title'` |
| `hud.status.prisoners` | `Prisoners` | `src/content/default-locale-en.ts:159`, `'hud.status.prisoners'` |
| `hud.status.prisoners-without-bed` | `{count} not housed` | `src/content/default-locale-en.ts:204`, `'hud.status.prisoners-without-bed'` |
| `hud.status.staff` | `Staff` | `src/content/default-locale-en.ts:205`, `'hud.status.staff'` |
| `hud.status.rooms` | `Rooms` | `src/content/default-locale-en.ts:206`, `'hud.status.rooms'` |
| `hud.status.rooms-not-ready` | `{count} not ready` | `src/content/default-locale-en.ts:242`, `'hud.status.rooms-not-ready'` |
| `hud.status.incidents` | `Incidents` | `src/content/default-locale-en.ts:243`, `'hud.status.incidents'` |
| `hud.status.coverage` | `Coverage` | `src/content/default-locale-en.ts:244`, `'hud.status.coverage'` |
| `hud.status.contraband` | `Contraband` | `src/content/default-locale-en.ts:245`, `'hud.status.contraband'` |
| `hud.status.funds` | `Funds` | `src/content/default-locale-en.ts:250`, `'hud.status.funds'` |
| `hud.status.funds-remaining` | `{remaining} left` | `src/content/default-locale-en.ts:282`, `'hud.status.funds-remaining'` |
| `hud.status.funds-before-deliveries-stop` | `{remaining} left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a place to sleep.` | `src/content/default-locale-en.ts:327`, `'hud.status.funds-before-deliveries-stop'` |
| `hud.status.funds-deliveries-stopped` | `Deliveries have stopped — no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a place to sleep.` | `src/content/default-locale-en.ts:346`, `'hud.status.funds-deliveries-stopped'` |
| `hud.status.funds-treasury-floor-exhausted` | `The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a place to sleep, so a prison housing nobody earns nothing.` | `src/content/default-locale-en.ts:424`, `'hud.status.funds-treasury-floor-exhausted'` |
| `hud.status.earned-today` | `Earned today` | `src/content/default-locale-en.ts:431`, `'hud.status.earned-today'` |
| `hud.status.earned-withheld` | `Unmet needs have withheld {withheld} of today's grant so far — the state pays less for a resident whose needs are going unmet, and meeting one puts that share back.` | `src/content/default-locale-en.ts:485`, `'hud.status.earned-withheld'` |
| `hud.status.occupancy` | `Cell occupancy` | `src/content/default-locale-en.ts:487`, `'hud.status.occupancy'` |
| `hud.status.occupancy-value` | `{value} of {capacity}` | `src/content/default-locale-en.ts:488`, `'hud.status.occupancy-value'` |
| `hud.status.incidents-clear` | `Clear` | `src/content/default-locale-en.ts:489`, `'hud.status.incidents-clear'` |
| `hud.status.incidents-active` | `Active` | `src/content/default-locale-en.ts:490`, `'hud.status.incidents-active'` |
| `hud.clock.title` | `Time controls` | `src/content/default-locale-en.ts:492`, `'hud.clock.title'` |
| `hud.clock.day-progress` | `Through the day` | `src/content/default-locale-en.ts:495`, `'hud.clock.day-progress'` |
| `hud.clock.day` | `Day` | `src/content/default-locale-en.ts:496`, `'hud.clock.day'` |
| `hud.clock.speed` | `Speed {speed}×` | `src/content/default-locale-en.ts:516`, `'hud.clock.speed'` |
| `hud.clock.paused` | `PAUSED` | `src/content/default-locale-en.ts:521`, `'hud.clock.paused'` |
| `hud.transport.pause` | `Pause` | `src/content/default-locale-en.ts:522`, `'hud.transport.pause'` |
| `hud.transport.play` | `Play at normal speed` | `src/content/default-locale-en.ts:523`, `'hud.transport.play'` |
| `hud.transport.fast-forward` | `Fast forward` | `src/content/default-locale-en.ts:524`, `'hud.transport.fast-forward'` |
| `hud.history.group-label` | `Undo and redo` | `src/content/default-locale-en.ts:551`, `'hud.history.group-label'` |
| `hud.history.undo-last-change` | `Undo the last placement` | `src/content/default-locale-en.ts:552`, `'hud.history.undo-last-change'` |
| `hud.history.redo-last-undone` | `Redo the last undone placement` | `src/content/default-locale-en.ts:553`, `'hud.history.redo-last-undone'` |
| `hud.tabs.title` | `Prison sections` | `src/content/default-locale-en.ts:555`, `'hud.tabs.title'` |
| `hud.tab.overview` | `Overview` | `src/content/default-locale-en.ts:633`, `'hud.tab.overview'` |
| `hud.tab.build` | `Build` | `src/content/default-locale-en.ts:634`, `'hud.tab.build'` |
| `hud.tab.zones` | `Zones` | `src/content/default-locale-en.ts:635`, `'hud.tab.zones'` |
| `hud.tab.manage` | `Manage` | `src/content/default-locale-en.ts:636`, `'hud.tab.manage'` |
| `hud.tab.day-plan` | `Schedule` | `src/content/default-locale-en.ts:637`, `'hud.tab.day-plan'` |
| `hud.tab.security` | `Security` | `src/content/default-locale-en.ts:650`, `'hud.tab.security'` |
| `hud.layout.title` | `Settings` | `src/content/default-locale-en.ts:718`, `'hud.layout.title'` |
| `hud.layout.menu` | `Open the settings menu` | `src/content/default-locale-en.ts:719`, `'hud.layout.menu'` |
| `hud.layout.navigation-width` | `Navigation width` | `src/content/default-locale-en.ts:720`, `'hud.layout.navigation-width'` |
| `hud.layout.inspector-width` | `Panel width` | `src/content/default-locale-en.ts:721`, `'hud.layout.inspector-width'` |
| `hud.layout.inspector-height` | `Panel height` | `src/content/default-locale-en.ts:722`, `'hud.layout.inspector-height'` |
| `hud.layout.reset` | `Reset layout` | `src/content/default-locale-en.ts:723`, `'hud.layout.reset'` |
| `hud.layout.map-only` | `Map only` | `src/content/default-locale-en.ts:724`, `'hud.layout.map-only'` |
| `hud.layout.hide-navigation` | `Hide the sections` | `src/content/default-locale-en.ts:725`, `'hud.layout.hide-navigation'` |
| `hud.layout.show-navigation` | `Show the sections` | `src/content/default-locale-en.ts:726`, `'hud.layout.show-navigation'` |
| `hud.layout.hide-inspector` | `Hide the panels` | `src/content/default-locale-en.ts:727`, `'hud.layout.hide-inspector'` |
| `hud.layout.show-inspector` | `Show the panels` | `src/content/default-locale-en.ts:728`, `'hud.layout.show-inspector'` |
| `hud.layout.hide-metrics` | `Hide the counters and the clock` | `src/content/default-locale-en.ts:729`, `'hud.layout.hide-metrics'` |
| `hud.layout.show-metrics` | `Show the counters and the clock` | `src/content/default-locale-en.ts:730`, `'hud.layout.show-metrics'` |
| `hud.layout.resize-navigation` | `Resize the sections` | `src/content/default-locale-en.ts:731`, `'hud.layout.resize-navigation'` |
| `hud.layout.resize-inspector` | `Resize the panels` | `src/content/default-locale-en.ts:732`, `'hud.layout.resize-inspector'` |
| `hud.zoom.title` | `Zoom` | `src/content/default-locale-en.ts:773`, `'hud.zoom.title'` |
| `hud.zoom.in` | `Zoom in` | `src/content/default-locale-en.ts:774`, `'hud.zoom.in'` |
| `hud.zoom.out` | `Zoom out` | `src/content/default-locale-en.ts:775`, `'hud.zoom.out'` |
| `hud.minimap.title` | `Minimap` | `src/content/default-locale-en.ts:777`, `'hud.minimap.title'` |
| `hud.minimap.placeholder` | `No map is drawn here yet — pressing may move the camera` | `src/content/default-locale-en.ts:804`, `'hud.minimap.placeholder'` |
| `hud.minimap.no-prison` | `Create or load a prison to see the map` | `src/content/default-locale-en.ts:808`, `'hud.minimap.no-prison'` |
| `hud.minimap.navigable` | `No map is drawn here yet — press to jump the camera there` | `src/content/default-locale-en.ts:854`, `'hud.minimap.navigable'` |
| `hud.minimap.map-ready` | `Prison map — press to move the camera` | `src/content/default-locale-en.ts:856`, `'hud.minimap.map-ready'` |
| `hud.alerts.title` | `Alerts` | `src/content/default-locale-en.ts:857`, `'hud.alerts.title'` |
| `hud.alerts.empty` | `No active alerts` | `src/content/default-locale-en.ts:858`, `'hud.alerts.empty'` |
| `hud.alerts.unknown` | `No prison is reporting.` | `src/content/default-locale-en.ts:893`, `'hud.alerts.unknown'` |
| `hud.alert.occurrences` | `{count}×` | `src/content/default-locale-en.ts:939`, `'hud.alert.occurrences'` |
| `hud.alert.time` | `Day {day}` | `src/content/default-locale-en.ts:940`, `'hud.alert.time'` |
| `hud.alert.dismiss` | `Clear this alert` | `src/content/default-locale-en.ts:969`, `'hud.alert.dismiss'` |
| `hud.alert.refusal.admit.no-accommodation` | `Nobody was admitted — there is no room to put a prisoner in yet.` | `src/content/default-locale-en.ts:993`, `'hud.alert.refusal.admit.no-accommodation'` |
| `hud.alert.refusal.admit.population-full` | `Nobody was admitted — this prison is holding as many people as it can.` | `src/content/default-locale-en.ts:994`, `'hud.alert.refusal.admit.population-full'` |
| `hud.alert.refusal.build.duplicate-order` | `The build order failed — that order already exists.` | `src/content/default-locale-en.ts:1005`, `'hud.alert.refusal.build.duplicate-order'` |
| `hud.alert.refusal.build.out-of-bounds` | `The build order failed — that tile is outside the map.` | `src/content/default-locale-en.ts:1006`, `'hud.alert.refusal.build.out-of-bounds'` |
| `hud.alert.refusal.build.unbuildable` | `The build order failed — nothing can be built on that tile.` | `src/content/default-locale-en.ts:1007`, `'hud.alert.refusal.build.unbuildable'` |
| `hud.alert.refusal.build.unbuildable-terrain` | `The build order failed — the ground there cannot be built on.` | `src/content/default-locale-en.ts:1008`, `'hud.alert.refusal.build.unbuildable-terrain'` |
| `hud.alert.refusal.build.unknown-buildable` | `The build order failed — that is not something this prison knows how to build.` | `src/content/default-locale-en.ts:1024`, `'hud.alert.refusal.build.unknown-buildable'` |
| `hud.alert.refusal.build.unowned-land` | `The build order failed — you do not own that land.` | `src/content/default-locale-en.ts:1025`, `'hud.alert.refusal.build.unowned-land'` |
| `hud.alert.refusal.build.water-blocked` | `The build order failed — there is water on that tile.` | `src/content/default-locale-en.ts:1026`, `'hud.alert.refusal.build.water-blocked'` |
| `hud.alert.refusal.cancel-build-order.stale-cancellation` | `Nothing was refunded — this order moved on before the cancellation reached it. Press Cancel again to see what it pays now.` | `src/content/default-locale-en.ts:1046`, `'hud.alert.refusal.cancel-build-order.stale-cancellation'` |
| `hud.alert.refusal.cancel-purchase.not-pending` | `Nothing was refunded — that delivery is not on its way any more.` | `src/content/default-locale-en.ts:1063`, `'hud.alert.refusal.cancel-purchase.not-pending'` |
| `hud.alert.refusal.construction.materials-unfunded` | `The build queue is stalled — no more materials until the prison earns the money.` | `src/content/default-locale-en.ts:1111`, `'hud.alert.refusal.construction.materials-unfunded'` |
| `hud.alert.refusal.hire.insufficient-funds` | `Nobody was hired — hiring is refused until the prison earns the money.` | `src/content/default-locale-en.ts:1222`, `'hud.alert.refusal.hire.insufficient-funds'` |
| `hud.alert.refusal.hire.no-duty-for-role` | `Nobody was hired — only security staff can hold a post, and this prison has no other work for that role.` | `src/content/default-locale-en.ts:1228`, `'hud.alert.refusal.hire.no-duty-for-role'` |
| `hud.alert.refusal.hire.roster-full` | `Nobody was hired — this prison cannot hold any more staff.` | `src/content/default-locale-en.ts:1229`, `'hud.alert.refusal.hire.roster-full'` |
| `hud.alert.refusal.hire.unknown-role` | `Nobody was hired — that is not a role this prison knows.` | `src/content/default-locale-en.ts:1230`, `'hud.alert.refusal.hire.unknown-role'` |
| `hud.alert.refusal.place-object.duplicate-order` | `The object was not placed — that order already exists.` | `src/content/default-locale-en.ts:1237`, `'hud.alert.refusal.place-object.duplicate-order'` |
| `hud.alert.refusal.place-object.not-a-placeable-object` | `The object was not placed — that is not something built by placing it on a tile.` | `src/content/default-locale-en.ts:1238`, `'hud.alert.refusal.place-object.not-a-placeable-object'` |
| `hud.alert.refusal.place-object.out-of-bounds` | `The object was not placed — part of it would be outside the map.` | `src/content/default-locale-en.ts:1239`, `'hud.alert.refusal.place-object.out-of-bounds'` |
| `hud.alert.refusal.place-object.outside-room` | `The object was not placed — it has to stand in a room you have zoned.` | `src/content/default-locale-en.ts:1240`, `'hud.alert.refusal.place-object.outside-room'` |
| `hud.alert.refusal.place-object.tile-occupied` | `The object was not placed — something is already standing there.` | `src/content/default-locale-en.ts:1241`, `'hud.alert.refusal.place-object.tile-occupied'` |
| `hud.alert.refusal.place-object.unknown-buildable` | `The object was not placed — that is not something this prison knows how to build.` | `src/content/default-locale-en.ts:1242`, `'hud.alert.refusal.place-object.unknown-buildable'` |
| `hud.alert.refusal.place-object.unowned-land` | `The object was not placed — you do not own all of that land.` | `src/content/default-locale-en.ts:1243`, `'hud.alert.refusal.place-object.unowned-land'` |
| `hud.alert.refusal.remove-object.nothing-to-remove` | `Nothing was removed — there is no object on that tile, and none being built there.` | `src/content/default-locale-en.ts:1253`, `'hud.alert.refusal.remove-object.nothing-to-remove'` |
| `hud.alert.refusal.remove-wall.nothing-to-remove` | `Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.` | `src/content/default-locale-en.ts:1271`, `'hud.alert.refusal.remove-wall.nothing-to-remove'` |
| `hud.alert.refusal.purchase.duplicate-order` | `The materials were not ordered — that order already exists.` | `src/content/default-locale-en.ts:1273`, `'hud.alert.refusal.purchase.duplicate-order'` |
| `hud.alert.refusal.purchase.insufficient-funds` | `Nothing was bought — deliveries are refused until the prison earns the money.` | `src/content/default-locale-en.ts:1283`, `'hud.alert.refusal.purchase.insufficient-funds'` |
| `hud.alert.refusal.purchase.invalid-quantity` | `The materials were not ordered — that quantity cannot be bought.` | `src/content/default-locale-en.ts:1284`, `'hud.alert.refusal.purchase.invalid-quantity'` |
| `hud.alert.refusal.purchase.unknown-material` | `The materials were not ordered — that material is not for sale.` | `src/content/default-locale-en.ts:1285`, `'hud.alert.refusal.purchase.unknown-material'` |
| `hud.alert.refusal.sell.insufficient-stock` | `Nothing was sold — the prison does not have that much in store.` | `src/content/default-locale-en.ts:1303`, `'hud.alert.refusal.sell.insufficient-stock'` |
| `hud.alert.refusal.sell.invalid-quantity` | `Nothing was sold — that quantity cannot be sold.` | `src/content/default-locale-en.ts:1304`, `'hud.alert.refusal.sell.invalid-quantity'` |
| `hud.alert.refusal.sell.unknown-material` | `Nothing was sold — that material has no buyer.` | `src/content/default-locale-en.ts:1305`, `'hud.alert.refusal.sell.unknown-material'` |
| `hud.alert.refusal.dismiss.unknown-staff` | `Nobody was dismissed — that staff member is not on the roster.` | `src/content/default-locale-en.ts:1324`, `'hud.alert.refusal.dismiss.unknown-staff'` |
| `hud.alert.refusal.edit-regime-block.unknown-block` | `Nothing was changed — that part of the day is not a block on this timetable.` | `src/content/default-locale-en.ts:1345`, `'hud.alert.refusal.edit-regime-block.unknown-block'` |
| `hud.alert.refusal.edit-regime-block.unknown-group` | `Nothing was changed — this prison has no timetable for that group.` | `src/content/default-locale-en.ts:1346`, `'hud.alert.refusal.edit-regime-block.unknown-group'` |
| `hud.alert.refusal.release-guard.not-held` | `Nothing was released — that guard is already off duty.` | `src/content/default-locale-en.ts:1347`, `'hud.alert.refusal.release-guard.not-held'` |
| `hud.alert.refusal.release-guard.unknown-guard` | `Nothing was released — that guard is not on the roster.` | `src/content/default-locale-en.ts:1348`, `'hud.alert.refusal.release-guard.unknown-guard'` |
| `hud.alert.refusal.zone.duplicate-instance-id` | `The room was not zoned — a room is already recorded on that tile.` | `src/content/default-locale-en.ts:1353`, `'hud.alert.refusal.zone.duplicate-instance-id'` |
| `hud.alert.refusal.zone.invalid-area` | `The room was not zoned — that area is not a valid rectangle.` | `src/content/default-locale-en.ts:1354`, `'hud.alert.refusal.zone.invalid-area'` |
| `hud.alert.refusal.zone.out-of-bounds` | `The room was not zoned — part of that area is outside the map.` | `src/content/default-locale-en.ts:1355`, `'hud.alert.refusal.zone.out-of-bounds'` |
| `hud.alert.refusal.zone.overlaps-existing-room` | `The room was not zoned — it overlaps a room that is already there.` | `src/content/default-locale-en.ts:1356`, `'hud.alert.refusal.zone.overlaps-existing-room'` |
| `hud.alert.refusal.zone.unknown-room-type` | `The room was not zoned — that is not a room type this prison knows.` | `src/content/default-locale-en.ts:1357`, `'hud.alert.refusal.zone.unknown-room-type'` |
| `hud.alert.refusal.zone.unowned-land` | `The room was not zoned — you do not own all of that land.` | `src/content/default-locale-en.ts:1358`, `'hud.alert.refusal.zone.unowned-land'` |
| `hud.alert.refusal.zone.below-minimum-size` | `The room was not zoned — that area is smaller than this room type allows.` | `src/content/default-locale-en.ts:1365`, `'hud.alert.refusal.zone.below-minimum-size'` |
| `hud.alert.refusal.zone.not-enclosed` | `The room was not zoned — this room type needs a finished wall or door along every side, and yours has a gap.` | `src/content/default-locale-en.ts:1407`, `'hud.alert.refusal.zone.not-enclosed'` |
| `hud.alert.refusal.unzone.invalid-area` | `Nothing was removed — that area is not a valid rectangle.` | `src/content/default-locale-en.ts:1412`, `'hud.alert.refusal.unzone.invalid-area'` |
| `hud.alert.refusal.unzone.nothing-to-remove` | `Nothing was removed — there is no room in that area.` | `src/content/default-locale-en.ts:1413`, `'hud.alert.refusal.unzone.nothing-to-remove'` |
| `hud.alert.refusal.unzone.room-occupied` | `Nothing was removed — somebody is using that room.` | `src/content/default-locale-en.ts:1414`, `'hud.alert.refusal.unzone.room-occupied'` |
| `hud.alert.fault.invalid-message` | `A simulation message was rejected — it was not a message this game understands.` | `src/content/default-locale-en.ts:1439`, `'hud.alert.fault.invalid-message'` |
| `hud.alert.fault.unsupported-protocol-version` | `A simulation message was rejected — it was written for a different version of the game.` | `src/content/default-locale-en.ts:1440`, `'hud.alert.fault.unsupported-protocol-version'` |
| `hud.alert.fault.unknown-message-kind` | `A simulation message was rejected — this build does not know that kind of message.` | `src/content/default-locale-en.ts:1441`, `'hud.alert.fault.unknown-message-kind'` |
| `hud.alert.fault.invalid-payload` | `A simulation message was rejected — its contents were not what that message must carry.` | `src/content/default-locale-en.ts:1442`, `'hud.alert.fault.invalid-payload'` |
| `hud.alert.fault.not-initialized` | `A simulation request was refused — no prison is loaded yet.` | `src/content/default-locale-en.ts:1443`, `'hud.alert.fault.not-initialized'` |
| `hud.alert.fault.already-initialized` | `A simulation request was refused — this session already has a prison loaded.` | `src/content/default-locale-en.ts:1444`, `'hud.alert.fault.already-initialized'` |
| `hud.alert.fault.duplicate-message` | `A command was refused — it had already been sent.` | `src/content/default-locale-en.ts:1445`, `'hud.alert.fault.duplicate-message'` |
| `hud.alert.fault.sequence-gap` | `A command was refused — a command sent before it never arrived.` | `src/content/default-locale-en.ts:1446`, `'hud.alert.fault.sequence-gap'` |
| `hud.alert.fault.invalid-state` | `A simulation request was refused — the simulation cannot do that right now.` | `src/content/default-locale-en.ts:1447`, `'hud.alert.fault.invalid-state'` |
| `hud.alert.fault.snapshot-incompatible` | `The save could not be loaded — this build does not understand its format.` | `src/content/default-locale-en.ts:1448`, `'hud.alert.fault.snapshot-incompatible'` |
| `hud.alert.fault.shutting-down` | `A simulation request was refused — the session is shutting down.` | `src/content/default-locale-en.ts:1449`, `'hud.alert.fault.shutting-down'` |
| `hud.alert.fault.internal-error` | `The simulation hit an internal error.` | `src/content/default-locale-en.ts:1450`, `'hud.alert.fault.internal-error'` |
| `hud.alert.event.prisoners.discharged` | `one: {count} released — their sentence is served. · other: {count} released — their sentences are served.` | `src/content/default-locale-en.ts:1483`, `'hud.alert.event.prisoners.discharged'` |
| `hud.alert.event.economy.wages-unpaid` | `Payday went unpaid — your staff are owed {total}.` | `src/content/default-locale-en.ts:1484`, `'hud.alert.event.economy.wages-unpaid'` |
| `hud.alert.event.economy.deliveries-refused` | `Deliveries refused — the treasury cannot cover a purchase right now.` | `src/content/default-locale-en.ts:1502`, `'hud.alert.event.economy.deliveries-refused'` |
| `hud.alert.event.economy.construction-refused` | `Construction halted — the treasury cannot fund the build queue right now.` | `src/content/default-locale-en.ts:1503`, `'hud.alert.event.economy.construction-refused'` |
| `hud.alert.event.economy.deliveries-restored` | `The treasury has climbed back above the deliveries floor.` | `src/content/default-locale-en.ts:1543`, `'hud.alert.event.economy.deliveries-restored'` |
| `hud.alert.event.economy.construction-restored` | `The treasury has climbed back above the construction floor.` | `src/content/default-locale-en.ts:1544`, `'hud.alert.event.economy.construction-restored'` |
| `hud.alert.event.construction.order-cancelled` | `The order was cancelled — the money it cost is refunded.` | `src/content/default-locale-en.ts:1663`, `'hud.alert.event.construction.order-cancelled'` |
| `hud.alert.event.construction.order-cancelled-underway` | `The order was cancelled. Anything already spent past the point of no return stays spent.` | `src/content/default-locale-en.ts:1664`, `'hud.alert.event.construction.order-cancelled-underway'` |
| `hud.alert.event.construction.order-completed` | `The order was completed.` | `src/content/default-locale-en.ts:1724`, `'hud.alert.event.construction.order-completed'` |
| `hud.alert.event.construction.undo-refused-newer-action` | `Nothing was undone — Undo takes back a change to the build queue, and something else has happened since the last one.` | `src/content/default-locale-en.ts:1753`, `'hud.alert.event.construction.undo-refused-newer-action'` |
| `hud.alert.event.construction.undone` | `The last change to the build queue was undone.` | `src/content/default-locale-en.ts:1755`, `'hud.alert.event.construction.undone'` |
| `hud.alert.event.construction.undone-spend-destroyed` | `The last change to the build queue was undone — anything already spent past the point of no return stays spent.` | `src/content/default-locale-en.ts:1756`, `'hud.alert.event.construction.undone-spend-destroyed'` |
| `hud.alert.event.construction.redone` | `The last change to the build queue was redone.` | `src/content/default-locale-en.ts:1758`, `'hud.alert.event.construction.redone'` |
| `hud.alert.event.economy.delivery-cancelled` | `The delivery was cancelled — {total} back.` | `src/content/default-locale-en.ts:1759`, `'hud.alert.event.economy.delivery-cancelled'` |
| `hud.alert.event.objects.removed-spend-destroyed` | `The object was removed — the money it cost does not come back.` | `src/content/default-locale-en.ts:1842`, `'hud.alert.event.objects.removed-spend-destroyed'` |
| `hud.alert.event.prisoners.relocated` | `{name} had nowhere to sleep and moved to {room}.` | `src/content/default-locale-en.ts:1865`, `'hud.alert.event.prisoners.relocated'` |
| `hud.alert.event.prisoners.housed` | `{name} has a place in {room}.` | `src/content/default-locale-en.ts:1918`, `'hud.alert.event.prisoners.housed'` |
| `hud.alert.event.rooms.zoned` | `{room} designated.` | `src/content/default-locale-en.ts:1973`, `'hud.alert.event.rooms.zoned'` |
| `hud.alert.event.rooms.needs-cleared` | `{room} is no longer short anything the Rooms panel checks for — that is not a claim anyone can get in.` | `src/content/default-locale-en.ts:2052`, `'hud.alert.event.rooms.needs-cleared'` |
| `hud.alert.event.rooms.unzoned` | `{room} removed.` | `src/content/default-locale-en.ts:2089`, `'hud.alert.event.rooms.unzoned'` |
| `hud.alert.event.incidents.riot-opened` | `one: A riot has broken out — {count} prisoner has stopped taking orders. · other: A riot has broken out — {count} prisoners have stopped taking orders.` | `src/content/default-locale-en.ts:2142`, `'hud.alert.event.incidents.riot-opened'` |
| `hud.alert.event.incidents.assault-opened` | `A fight has broken out between two prisoners.` | `src/content/default-locale-en.ts:2143`, `'hud.alert.event.incidents.assault-opened'` |
| `hud.alert.event.incidents.escape-attempt-opened` | `A prisoner is trying to break out.` | `src/content/default-locale-en.ts:2144`, `'hud.alert.event.incidents.escape-attempt-opened'` |
| `hud.alert.event.incidents.gang-retaliation-opened` | `Two gangs are settling a score.` | `src/content/default-locale-en.ts:2145`, `'hud.alert.event.incidents.gang-retaliation-opened'` |
| `hud.alert.event.incidents.all-clear` | `The prison is under control again — no incident is still open.` | `src/content/default-locale-en.ts:2146`, `'hud.alert.event.incidents.all-clear'` |
| `hud.alert.event.incidents.all-clear-after-lapse` | `No incident is still open — but the last one ran out of time instead of being contained, and everyone caught in it was hurt.` | `src/content/default-locale-en.ts:2197`, `'hud.alert.event.incidents.all-clear-after-lapse'` |
| `hud.alert.event.incidents.escape-succeeded` | `{name} broke out — no guard reached them in time.` | `src/content/default-locale-en.ts:2234`, `'hud.alert.event.incidents.escape-succeeded'` |
| `hud.alert.event.contraband.discovered` | `Contraband found: {item}.` | `src/content/default-locale-en.ts:2269`, `'hud.alert.event.contraband.discovered'` |
| `hud.unavailable.simulation` | `Simulation unavailable — this browser could not start it, so nothing can run or be saved` | `src/content/default-locale-en.ts:2295`, `'hud.unavailable.simulation'` |
| `hud.panel.collapse` | `Collapse` | `src/content/default-locale-en.ts:2297`, `'hud.panel.collapse'` |
| `hud.panel.expand` | `Expand` | `src/content/default-locale-en.ts:2298`, `'hud.panel.expand'` |
| `hud.build.title` | `Build` | `src/content/default-locale-en.ts:2300`, `'hud.build.title'` |
| `hud.build.catalogue` | `What to build` | `src/content/default-locale-en.ts:2301`, `'hud.build.catalogue'` |
| `hud.build.templates` | `Room plans` | `src/content/default-locale-en.ts:2302`, `'hud.build.templates'` |
| `hud.build.templates-short` | `Plans` | `src/content/default-locale-en.ts:2303`, `'hud.build.templates-short'` |
| `hud.build.template-preview-only` | `Preview only. Choose a plan to inspect its footprint; placement is not available yet.` | `src/content/default-locale-en.ts:2304`, `'hud.build.template-preview-only'` |
| `hud.build.template-position-hint` | `Choose an origin. The whole footprint is checked before you can place this plan.` | `src/content/default-locale-en.ts:2305`, `'hud.build.template-position-hint'` |
| `hud.build.template-x` | `Plan origin X` | `src/content/default-locale-en.ts:2306`, `'hud.build.template-x'` |
| `hud.build.template-y` | `Plan origin Y` | `src/content/default-locale-en.ts:2307`, `'hud.build.template-y'` |
| `hud.build.template-mirror` | `Mirror horizontally` | `src/content/default-locale-en.ts:2308`, `'hud.build.template-mirror'` |
| `hud.build.template-on-map` | `Place on map` | `src/content/default-locale-en.ts:2309`, `'hud.build.template-on-map'` |
| `hud.build.template-map-hint` | `Click map to place; Esc cancels.` | `src/content/default-locale-en.ts:2310`, `'hud.build.template-map-hint'` |
| `hud.build.template-catalogue-value` | `Materials catalogue value: {value}` | `src/content/default-locale-en.ts:2311`, `'hud.build.template-catalogue-value'` |
| `hud.build.template-place` | `Place room plan` | `src/content/default-locale-en.ts:2312`, `'hud.build.template-place'` |
| `hud.build.template-invalid-position` | `Enter whole-number coordinates.` | `src/content/default-locale-en.ts:2313`, `'hud.build.template-invalid-position'` |
| `hud.build.template-ready` | `This footprint is clear.` | `src/content/default-locale-en.ts:2314`, `'hud.build.template-ready'` |
| `hud.build.template-blocked` | `This footprint is blocked. Choose another position.` | `src/content/default-locale-en.ts:2315`, `'hud.build.template-blocked'` |
| `hud.build.template-unavailable` | `Placement check is unavailable. Try again.` | `src/content/default-locale-en.ts:2316`, `'hud.build.template-unavailable'` |
| `hud.build.template-submitted` | `Room plan submitted.` | `src/content/default-locale-en.ts:2317`, `'hud.build.template-submitted'` |
| `hud.build.template-close` | `Close plans` | `src/content/default-locale-en.ts:2318`, `'hud.build.template-close'` |
| `hud.build.template-cell-basic` | `Basic cell` | `src/content/default-locale-en.ts:2319`, `'hud.build.template-cell-basic'` |
| `hud.build.template-cell-large` | `Large cell` | `src/content/default-locale-en.ts:2320`, `'hud.build.template-cell-large'` |
| `hud.build.template-shower-room` | `Shower room` | `src/content/default-locale-en.ts:2321`, `'hud.build.template-shower-room'` |
| `hud.build.template-cell-row-four` | `Four-cell row` | `src/content/default-locale-en.ts:2322`, `'hud.build.template-cell-row-four'` |
| `hud.build.template-wall` | `Wall` | `src/content/default-locale-en.ts:2323`, `'hud.build.template-wall'` |
| `hud.build.template-door` | `Door` | `src/content/default-locale-en.ts:2324`, `'hud.build.template-door'` |
| `hud.build.template-furniture` | `Furniture` | `src/content/default-locale-en.ts:2325`, `'hud.build.template-furniture'` |
| `hud.build.template-bed` | `Bed` | `src/content/default-locale-en.ts:2326`, `'hud.build.template-bed'` |
| `hud.build.template-toilet` | `Toilet` | `src/content/default-locale-en.ts:2327`, `'hud.build.template-toilet'` |
| `hud.build.template-shower` | `Shower` | `src/content/default-locale-en.ts:2328`, `'hud.build.template-shower'` |
| `hud.build.catalogue-empty` | `Nothing is available to build` | `src/content/default-locale-en.ts:2329`, `'hud.build.catalogue-empty'` |
| `hud.build.selected` | `Selected` | `src/content/default-locale-en.ts:2330`, `'hud.build.selected'` |
| `hud.build.catalogue-row-price` | `{buildable} · {total}` | `src/content/default-locale-en.ts:2365`, `'hud.build.catalogue-row-price'` |
| `hud.build.catalogue-row-price-segment` | `{buildable} · {total} per segment` | `src/content/default-locale-en.ts:2386`, `'hud.build.catalogue-row-price-segment'` |
| `hud.build.catalogue-row-price-square` | `{buildable} · {total} per square` | `src/content/default-locale-en.ts:2387`, `'hud.build.catalogue-row-price-square'` |
| `hud.build.placement` | `Where` | `src/content/default-locale-en.ts:2388`, `'hud.build.placement'` |
| `hud.build.tile-x` | `Tile X` | `src/content/default-locale-en.ts:2389`, `'hud.build.tile-x'` |
| `hud.build.tile-y` | `Tile Y` | `src/content/default-locale-en.ts:2390`, `'hud.build.tile-y'` |
| `hud.build.step-down` | `Decrease {field}` | `src/content/default-locale-en.ts:2391`, `'hud.build.step-down'` |
| `hud.build.step-up` | `Increase {field}` | `src/content/default-locale-en.ts:2392`, `'hud.build.step-up'` |
| `hud.build.edge` | `Edge` | `src/content/default-locale-en.ts:2393`, `'hud.build.edge'` |
| `hud.build.submit` | `Place order` | `src/content/default-locale-en.ts:2394`, `'hud.build.submit'` |
| `hud.build.note` | `An order is queued now and built while the clock runs.` | `src/content/default-locale-en.ts:2395`, `'hud.build.note'` |
| `hud.build.arm` | `Place on map` | `src/content/default-locale-en.ts:2396`, `'hud.build.arm'` |
| `hud.build.remove` | `Remove` | `src/content/default-locale-en.ts:2437`, `'hud.build.remove'` |
| `hud.build.remove-active` | `Stop removing` | `src/content/default-locale-en.ts:2438`, `'hud.build.remove-active'` |
| `hud.build.remove-hint` | `Press any tile of an object, or a finished wall, to take it away. One still being built is cancelled and refunds its money — but nothing comes back once the crew has started it. A finished one is not refunded.` | `src/content/default-locale-en.ts:2462`, `'hud.build.remove-hint'` |
| `hud.build.remove-submit` | `Remove object here` | `src/content/default-locale-en.ts:2463`, `'hud.build.remove-submit'` |
| `hud.build.disarm` | `Stop placing` | `src/content/default-locale-en.ts:2464`, `'hud.build.disarm'` |
| `hud.build.arm-hint` | `Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.` | `src/content/default-locale-en.ts:2465`, `'hud.build.arm-hint'` |
| `hud.build.arm-hint-square` | `Click a whole square to place a wall. Drag across squares to lay a run. Two fingers, the middle button or the arrow keys still move the camera.` | `src/content/default-locale-en.ts:2466`, `'hud.build.arm-hint-square'` |
| `hud.build.arm-hint-object` | `Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera.` | `src/content/default-locale-en.ts:2502`, `'hud.build.arm-hint-object'` |
| `hud.build.target-none` | `Point at the world` | `src/content/default-locale-en.ts:2504`, `'hud.build.target-none'` |
| `hud.build.target-value` | `{x}, {y} · {edge}` | `src/content/default-locale-en.ts:2505`, `'hud.build.target-value'` |
| `hud.build.target-run` | `{count} × {edge} from {x}, {y}` | `src/content/default-locale-en.ts:2506`, `'hud.build.target-run'` |
| `hud.build.target-squares` | `one: {count} whole square from {x}, {y} \| catalogue value {cost} · other: {count} whole squares from {x}, {y} \| catalogue value {cost}` | `src/content/default-locale-en.ts:2507`, `'hud.build.target-squares'` |
| `hud.build.object-footprint` | `Occupied squares: {width} × {height}` | `src/content/default-locale-en.ts:2508`, `'hud.build.object-footprint'` |
| `hud.build.target-tile` | `{x}, {y}` | `src/content/default-locale-en.ts:2509`, `'hud.build.target-tile'` |
| `hud.build.coordinates` | `Enter coordinates` | `src/content/default-locale-en.ts:2510`, `'hud.build.coordinates'` |
| `hud.build.coordinates-hint` | `The keyboard route. Pointing at the map is quicker.` | `src/content/default-locale-en.ts:2511`, `'hud.build.coordinates-hint'` |
| `hud.build.buy` | `Buy` | `src/content/default-locale-en.ts:2512`, `'hud.build.buy'` |
| `hud.build.buy-quantity` | `Quantity` | `src/content/default-locale-en.ts:2513`, `'hud.build.buy-quantity'` |
| `hud.build.buy-submit` | `Buy {count} × {material} · {total}` | `src/content/default-locale-en.ts:2514`, `'hud.build.buy-submit'` |
| `hud.build.buy-hint` | `Arrives while the clock runs, into the stock a build draws from.` | `src/content/default-locale-en.ts:2515`, `'hud.build.buy-hint'` |
| `hud.build.sell` | `Sell` | `src/content/default-locale-en.ts:2550`, `'hud.build.sell'` |
| `hud.build.sell-submit` | `Sell {count} × {material} · {total}` | `src/content/default-locale-en.ts:2551`, `'hud.build.sell-submit'` |
| `hud.build.buy-shortfall` | `Not enough money — you need {amount} more.` | `src/content/default-locale-en.ts:2591`, `'hud.build.buy-shortfall'` |
| `hud.build.queue` | `Queued` | `src/content/default-locale-en.ts:2658`, `'hud.build.queue'` |
| `hud.build.queue-count` | `{count} waiting · {started} being built` | `src/content/default-locale-en.ts:2659`, `'hud.build.queue-count'` |
| `hud.build.queue-order` | `{buildable} · {x}, {y} · {edge} · {total} back` | `src/content/default-locale-en.ts:2660`, `'hud.build.queue-order'` |
| `hud.build.queue-cancel` | `Cancel` | `src/content/default-locale-en.ts:2661`, `'hud.build.queue-cancel'` |
| `hud.build.queue-unnamed` | `Unnamed order` | `src/content/default-locale-en.ts:2662`, `'hud.build.queue-unnamed'` |
| `hud.build.queue-more` | `and {count} more behind these — undo takes back a whole run.` | `src/content/default-locale-en.ts:2663`, `'hud.build.queue-more'` |
| `hud.build.queue-shortfall` | `Waiting for {total} to unblock the next order.` | `src/content/default-locale-en.ts:2664`, `'hud.build.queue-shortfall'` |
| `hud.build.deliveries` | `On the way` | `src/content/default-locale-en.ts:2691`, `'hud.build.deliveries'` |
| `hud.build.deliveries-count` | `{count} bought · {total} back if cancelled` | `src/content/default-locale-en.ts:2692`, `'hud.build.deliveries-count'` |
| `hud.build.delivery` | `{count} × {material} · {total} back` | `src/content/default-locale-en.ts:2693`, `'hud.build.delivery'` |
| `hud.build.delivery-cancel` | `Cancel` | `src/content/default-locale-en.ts:2694`, `'hud.build.delivery-cancel'` |
| `hud.build.delivery-unnamed` | `Unnamed material` | `src/content/default-locale-en.ts:2695`, `'hud.build.delivery-unnamed'` |
| `hud.build.deliveries-more` | `and {count} more on the way — these arrive first, and the rest come into view as they land.` | `src/content/default-locale-en.ts:2696`, `'hud.build.deliveries-more'` |
| `hud.build.buildable.wall-brick` | `Brick wall` | `src/content/default-locale-en.ts:2697`, `'hud.build.buildable.wall-brick'` |
| `hud.build.buildable.door-wooden` | `Wooden door` | `src/content/default-locale-en.ts:2698`, `'hud.build.buildable.door-wooden'` |
| `hud.build.category` | `Category` | `src/content/default-locale-en.ts:2711`, `'hud.build.category'` |
| `hud.build.category-all` | `Everything` | `src/content/default-locale-en.ts:2712`, `'hud.build.category-all'` |
| `hud.build.category.structure` | `Walls and doors` | `src/content/default-locale-en.ts:2713`, `'hud.build.category.structure'` |
| `hud.overview.title` | `Finances` | `src/content/default-locale-en.ts:2764`, `'hud.overview.title'` |
| `hud.overview.none` | `No prison is reporting.` | `src/content/default-locale-en.ts:2765`, `'hud.overview.none'` |
| `hud.overview.income-note` | `State income is paid for occupied places at the end of each day.` | `src/content/default-locale-en.ts:2766`, `'hud.overview.income-note'` |
| `hud.overview.wages` | `Wages a day` | `src/content/default-locale-en.ts:2767`, `'hud.overview.wages'` |
| `hud.intake.title` | `Intake` | `src/content/default-locale-en.ts:2769`, `'hud.intake.title'` |
| `hud.intake.admit` | `Admit a prisoner` | `src/content/default-locale-en.ts:2770`, `'hud.intake.admit'` |
| `hud.intake.hint` | `Admitting needs a cell; housing needs a bed. The state pays at the end of each day, only for prisoners with a place.` | `src/content/default-locale-en.ts:2854`, `'hud.intake.hint'` |
| `hud.intake.no-place` | `{count} waiting with no place to sleep` | `src/content/default-locale-en.ts:2871`, `'hud.intake.no-place'` |
| `hud.intake.pipeline` | `In intake` | `src/content/default-locale-en.ts:2876`, `'hud.intake.pipeline'` |
| `hud.intake.pipeline-count` | `{waiting} of {total}` | `src/content/default-locale-en.ts:2877`, `'hud.intake.pipeline-count'` |
| `hud.intake.pipeline-stage` | `{count} at {stage}` | `src/content/default-locale-en.ts:2878`, `'hud.intake.pipeline-stage'` |
| `hud.intake.pipeline-failed` | `{count} cannot be housed at all` | `src/content/default-locale-en.ts:2883`, `'hud.intake.pipeline-failed'` |
| `hud.security.staff` | `Staff` | `src/content/default-locale-en.ts:2891`, `'hud.security.staff'` |
| `hud.security.roles` | `Who to hire` | `src/content/default-locale-en.ts:2892`, `'hud.security.roles'` |
| `hud.security.roles-empty` | `Nobody can be hired yet.` | `src/content/default-locale-en.ts:2893`, `'hud.security.roles-empty'` |
| `hud.security.selected` | `Selected` | `src/content/default-locale-en.ts:2894`, `'hud.security.selected'` |
| `hud.security.hire` | `Hire {role} · {total}` | `src/content/default-locale-en.ts:2895`, `'hud.security.hire'` |
| `hud.security.hire-hint` | `Costs {total} now and {wage} a day in wages, including today.` | `src/content/default-locale-en.ts:2953`, `'hud.security.hire-hint'` |
| `hud.security.hire-shortfall` | `Not enough money — you need {amount} more.` | `src/content/default-locale-en.ts:2965`, `'hud.security.hire-shortfall'` |
| `hud.security.hire-unassigned` | `A new guard starts unassigned.` | `src/content/default-locale-en.ts:2988`, `'hud.security.hire-unassigned'` |
| `hud.security.held` | `On duty` | `src/content/default-locale-en.ts:2996`, `'hud.security.held'` |
| `hud.security.held-summary` | `{held} held · {unassigned} free` | `src/content/default-locale-en.ts:2997`, `'hud.security.held-summary'` |
| `hud.security.held-empty` | `Nobody is assigned right now.` | `src/content/default-locale-en.ts:2998`, `'hud.security.held-empty'` |
| `hud.security.held-row` | `{name} · {claim}` | `src/content/default-locale-en.ts:2999`, `'hud.security.held-row'` |
| `hud.security.held-row-unnamed` | `Guard {id} · {claim}` | `src/content/default-locale-en.ts:3000`, `'hud.security.held-row-unnamed'` |
| `hud.security.held-release` | `Release` | `src/content/default-locale-en.ts:3001`, `'hud.security.held-release'` |
| `hud.security.held-more` | `and {count} more` | `src/content/default-locale-en.ts:3002`, `'hud.security.held-more'` |
| `hud.security.held-hint` | `A released guard stays hired and goes back to the pool.` | `src/content/default-locale-en.ts:3003`, `'hud.security.held-hint'` |
| `hud.security.roster` | `On the payroll` | `src/content/default-locale-en.ts:3042`, `'hud.security.roster'` |
| `hud.security.roster-wage-bill` | `{total} a day` | `src/content/default-locale-en.ts:3063`, `'hud.security.roster-wage-bill'` |
| `hud.security.roster-dismiss` | `Dismiss` | `src/content/default-locale-en.ts:3064`, `'hud.security.roster-dismiss'` |
| `hud.security.roster-dismiss-confirm` | `Dismiss {name}? Their wage stops and they do not come back.` | `src/content/default-locale-en.ts:3093`, `'hud.security.roster-dismiss-confirm'` |
| `hud.security.roster-hint` | `A dismissed staff member leaves the prison for good, and their wage stops.` | `src/content/default-locale-en.ts:3094`, `'hud.security.roster-hint'` |
| `hud.security.coverage` | `Guard coverage` | `src/content/default-locale-en.ts:3104`, `'hud.security.coverage'` |
| `hud.security.coverage-summary` | `{assigned} of {required}` | `src/content/default-locale-en.ts:3105`, `'hud.security.coverage-summary'` |
| `hud.security.coverage-met` | `Covered` | `src/content/default-locale-en.ts:3106`, `'hud.security.coverage-met'` |
| `hud.security.coverage-met-hint` | `Incidents and searches need free guards.` | `src/content/default-locale-en.ts:3279`, `'hud.security.coverage-met-hint'` |
| `hud.security.coverage-short` | `Understaffed` | `src/content/default-locale-en.ts:3280`, `'hud.security.coverage-short'` |
| `hud.security.coverage-short-hint` | `Hire {count} more to cover this population.` | `src/content/default-locale-en.ts:3281`, `'hud.security.coverage-short-hint'` |
| `hud.security.coverage-unguarded` | `Unguarded` | `src/content/default-locale-en.ts:3282`, `'hud.security.coverage-unguarded'` |
| `hud.security.coverage-unguarded-hint` | `Nobody is on duty. Hire {count} to cover this population.` | `src/content/default-locale-en.ts:3283`, `'hud.security.coverage-unguarded-hint'` |
| `hud.security.post-unreachable` | `Post cut off` | `src/content/default-locale-en.ts:3312`, `'hud.security.post-unreachable'` |
| `hud.security.post-unreachable-hint` | `No guard can reach the post, so nobody is on duty. Taking down a wall beside it opens the way back.` | `src/content/default-locale-en.ts:3313`, `'hud.security.post-unreachable-hint'` |
| `hud.security.coverage-overcrowded` | `Overcrowded` | `src/content/default-locale-en.ts:3343`, `'hud.security.coverage-overcrowded'` |
| `hud.security.coverage-overcrowded-hint` | `More prisoners than beds: every prisoner's safety runs down faster, and past a point their hygiene does too, until there is a bed for each of them.` | `src/content/default-locale-en.ts:3344`, `'hud.security.coverage-overcrowded-hint'` |
| `hud.security.coverage-unguarded-consequence` | `No guard is posted here, so nobody in this sector is kept safe.` | `src/content/default-locale-en.ts:3393`, `'hud.security.coverage-unguarded-consequence'` |
| `hud.regime.title` | `Regime` | `src/content/default-locale-en.ts:3409`, `'hud.regime.title'` |
| `hud.regime.blocks` | `Today's blocks` | `src/content/default-locale-en.ts:3410`, `'hud.regime.blocks'` |
| `hud.regime.block-allows` | `Allows {categories}` | `src/content/default-locale-en.ts:3411`, `'hud.regime.block-allows'` |
| `hud.regime.block-progress` | `{percent}% through` | `src/content/default-locale-en.ts:3412`, `'hud.regime.block-progress'` |
| `hud.regime.category-separator` | `, ` | `src/content/default-locale-en.ts:3415`, `'hud.regime.category-separator'` |
| `hud.regime.edit` | `Change the block running now` | `src/content/default-locale-en.ts:3433`, `'hud.regime.edit'` |
| `hud.regime.edit-last-category` | `A block has to allow at least one thing, so the last one cannot be switched off.` | `src/content/default-locale-en.ts:3442`, `'hud.regime.edit-last-category'` |
| `hud.regime.sentence-remaining` | `Sentence remaining (in-game days): {days}` | `src/content/default-locale-en.ts:3445`, `'hud.regime.sentence-remaining'` |
| `hud.regime.roster` | `Prisoners` | `src/content/default-locale-en.ts:3458`, `'hud.regime.roster'` |
| `hud.regime.roster-count` | `{shown} of {total}` | `src/content/default-locale-en.ts:3459`, `'hud.regime.roster-count'` |
| `hud.regime.roster-name` | `{given} {family}` | `src/content/default-locale-en.ts:3460`, `'hud.regime.roster-name'` |
| `hud.regime.roster-unnamed` | `Prisoner {id}` | `src/content/default-locale-en.ts:3461`, `'hud.regime.roster-unnamed'` |
| `hud.regime.roster-heading` | `Heading to {activity}` | `src/content/default-locale-en.ts:3462`, `'hud.regime.roster-heading'` |
| `hud.regime.roster-more` | `and {count} more` | `src/content/default-locale-en.ts:3463`, `'hud.regime.roster-more'` |
| `hud.regime.roster-empty` | `No prisoners yet. Build a cell — big enough, walled all round, with a bed and a toilet in it — to take somebody in.` | `src/content/default-locale-en.ts:3495`, `'hud.regime.roster-empty'` |
| `hud.regime.roster-emptied` | `This prison is empty. Take somebody in to start again.` | `src/content/default-locale-en.ts:3532`, `'hud.regime.roster-emptied'` |
| `hud.refusal.set-clock` | `The clock did not change — the request was refused.` | `src/content/default-locale-en.ts:3547`, `'hud.refusal.set-clock'` |
| `hud.refusal.place-build-order` | `The build order was not placed — the request was refused.` | `src/content/default-locale-en.ts:3548`, `'hud.refusal.place-build-order'` |
| `hud.refusal.purchase-materials` | `Nothing was bought — the purchase was refused and no money was spent.` | `src/content/default-locale-en.ts:3549`, `'hud.refusal.purchase-materials'` |
| `hud.refusal.hire-staff` | `Nobody was hired — the request was refused and no money was spent.` | `src/content/default-locale-en.ts:3550`, `'hud.refusal.hire-staff'` |
| `hud.refusal.purchase-materials-past-floor` | `Nothing was bought — deliveries are refused until the prison earns the money.` | `src/content/default-locale-en.ts:3573`, `'hud.refusal.purchase-materials-past-floor'` |
| `hud.refusal.hire-staff-past-floor` | `Nobody was hired — hiring is refused until the prison earns the money.` | `src/content/default-locale-en.ts:3574`, `'hud.refusal.hire-staff-past-floor'` |
| `hud.refusal.undo` | `Nothing was undone — the request was refused.` | `src/content/default-locale-en.ts:3575`, `'hud.refusal.undo'` |
| `hud.refusal.redo` | `Nothing was redone — the request was refused.` | `src/content/default-locale-en.ts:3576`, `'hud.refusal.redo'` |
| `hud.refusal.zone-room` | `The room was not designated — the request was refused.` | `src/content/default-locale-en.ts:3577`, `'hud.refusal.zone-room'` |
| `hud.refusal.unzone-room` | `Nothing was removed — the request was refused.` | `src/content/default-locale-en.ts:3578`, `'hud.refusal.unzone-room'` |
| `hud.refusal.admit-prisoner` | `Nobody was admitted — the request was refused.` | `src/content/default-locale-en.ts:3579`, `'hud.refusal.admit-prisoner'` |
| `hud.refusal.admit-prisoner-no-room` | `Nobody was admitted — this prison has no room to hold anybody.` | `src/content/default-locale-en.ts:3595`, `'hud.refusal.admit-prisoner-no-room'` |
| `hud.refusal.cancel-build-order` | `The order is still queued — the request was refused.` | `src/content/default-locale-en.ts:3596`, `'hud.refusal.cancel-build-order'` |
| `hud.refusal.cancel-material-purchase` | `Nothing was refunded — the request was refused and the delivery is still on its way.` | `src/content/default-locale-en.ts:3602`, `'hud.refusal.cancel-material-purchase'` |
| `hud.refusal.sell-materials` | `Nothing was sold — the request was refused and nothing was taken from stock.` | `src/content/default-locale-en.ts:3609`, `'hud.refusal.sell-materials'` |
| `hud.refusal.release-guard` | `Nobody was released — the request was refused and the guard is still assigned.` | `src/content/default-locale-en.ts:3610`, `'hud.refusal.release-guard'` |
| `hud.rooms.title` | `Rooms` | `src/content/default-locale-en.ts:3612`, `'hud.rooms.title'` |
| `hud.rooms.catalogue` | `Room type and area` | `src/content/default-locale-en.ts:3616`, `'hud.rooms.catalogue'` |
| `hud.rooms.catalogue-empty` | `No room types are available` | `src/content/default-locale-en.ts:3617`, `'hud.rooms.catalogue-empty'` |
| `hud.rooms.selected` | `Selected` | `src/content/default-locale-en.ts:3618`, `'hud.rooms.selected'` |
| `hud.rooms.arm` | `Draw on map` | `src/content/default-locale-en.ts:3619`, `'hud.rooms.arm'` |
| `hud.rooms.disarm` | `Stop drawing` | `src/content/default-locale-en.ts:3620`, `'hud.rooms.disarm'` |
| `hud.rooms.arm-hint` | `Drag a rectangle across the tiles this room should cover.` | `src/content/default-locale-en.ts:3621`, `'hud.rooms.arm-hint'` |
| `hud.rooms.remove` | `Remove rooms` | `src/content/default-locale-en.ts:3622`, `'hud.rooms.remove'` |
| `hud.rooms.remove-active` | `Stop removing` | `src/content/default-locale-en.ts:3623`, `'hud.rooms.remove-active'` |
| `hud.rooms.remove-hint` | `Drag across any part of a room to remove all of it.` | `src/content/default-locale-en.ts:3632`, `'hud.rooms.remove-hint'` |
| `hud.rooms.area` | `Area` | `src/content/default-locale-en.ts:3633`, `'hud.rooms.area'` |
| `hud.rooms.area-none` | `Nothing selected` | `src/content/default-locale-en.ts:3634`, `'hud.rooms.area-none'` |
| `hud.rooms.area-value` | `{width} × {height} tiles at {x}, {y}` | `src/content/default-locale-en.ts:3635`, `'hud.rooms.area-value'` |
| `hud.rooms.confirm` | `Designate {width} × {height}` | `src/content/default-locale-en.ts:3636`, `'hud.rooms.confirm'` |
| `hud.rooms.confirm-remove` | `Remove {width} × {height}` | `src/content/default-locale-en.ts:3639`, `'hud.rooms.confirm-remove'` |
| `hud.rooms.cancel` | `Discard` | `src/content/default-locale-en.ts:3640`, `'hud.rooms.cancel'` |
| `hud.rooms.minimum` | `Needs at least {width} × {height} tiles` | `src/content/default-locale-en.ts:3641`, `'hud.rooms.minimum'` |
| `hud.rooms.minimum-none` | `No minimum size` | `src/content/default-locale-en.ts:3642`, `'hud.rooms.minimum-none'` |
| `hud.rooms.too-small` | `Too small — this room needs at least {width} × {height} tiles.` | `src/content/default-locale-en.ts:3643`, `'hud.rooms.too-small'` |
| `hud.rooms.enclosure` | `Enclosure` | `src/content/default-locale-en.ts:3644`, `'hud.rooms.enclosure'` |
| `hud.rooms.enclosure-none` | `Not evaluated yet` | `src/content/default-locale-en.ts:3645`, `'hud.rooms.enclosure-none'` |
| `hud.rooms.enclosure-sealed` | `Walled in — not a door check` | `src/content/default-locale-en.ts:3688`, `'hud.rooms.enclosure-sealed'` |
| `hud.rooms.enclosure-open` | `Open on at least one side` | `src/content/default-locale-en.ts:3689`, `'hud.rooms.enclosure-open'` |
| `hud.rooms.requirement-enclosed` | `Needs walls or doors all round` | `src/content/default-locale-en.ts:3700`, `'hud.rooms.requirement-enclosed'` |
| `hud.rooms.requirement-outdoors` | `Must be outdoors` | `src/content/default-locale-en.ts:3701`, `'hud.rooms.requirement-outdoors'` |
| `hud.rooms.requirement-none` | `No enclosure rule` | `src/content/default-locale-en.ts:3702`, `'hud.rooms.requirement-none'` |
| `hud.rooms.requires-object` | `Needs {count} × {object}` | `src/content/default-locale-en.ts:3709`, `'hud.rooms.requires-object'` |
| `hud.rooms.requires-none` | `No objects needed` | `src/content/default-locale-en.ts:3714`, `'hud.rooms.requires-none'` |
| `hud.rooms.coordinates` | `Enter coordinates` | `src/content/default-locale-en.ts:3718`, `'hud.rooms.coordinates'` |
| `hud.rooms.coordinates-hint` | `The keyboard route. Dragging on the map is quicker.` | `src/content/default-locale-en.ts:3719`, `'hud.rooms.coordinates-hint'` |
| `hud.rooms.coordinates-submit` | `Use these tiles` | `src/content/default-locale-en.ts:3724`, `'hud.rooms.coordinates-submit'` |
| `hud.rooms.tile-x` | `Tile X` | `src/content/default-locale-en.ts:3725`, `'hud.rooms.tile-x'` |
| `hud.rooms.tile-y` | `Tile Y` | `src/content/default-locale-en.ts:3726`, `'hud.rooms.tile-y'` |
| `hud.rooms.width` | `Width` | `src/content/default-locale-en.ts:3727`, `'hud.rooms.width'` |
| `hud.rooms.height` | `Height` | `src/content/default-locale-en.ts:3728`, `'hud.rooms.height'` |
| `hud.rooms.step-down` | `Decrease {field}` | `src/content/default-locale-en.ts:3729`, `'hud.rooms.step-down'` |
| `hud.rooms.step-up` | `Increase {field}` | `src/content/default-locale-en.ts:3730`, `'hud.rooms.step-up'` |
| `hud.rooms.needs` | `Not ready` | `src/content/default-locale-en.ts:3735`, `'hud.rooms.needs'` |
| `hud.rooms.needs-count` | `{unfinished} of {total}` | `src/content/default-locale-en.ts:3736`, `'hud.rooms.needs-count'` |
| `hud.rooms.needs-room` | `{room} at {x}, {y} is missing` | `src/content/default-locale-en.ts:3741`, `'hud.rooms.needs-room'` |
| `hud.rooms.needs-object` | `{count} × {object}` | `src/content/default-locale-en.ts:3745`, `'hud.rooms.needs-object'` |
| `hud.rooms.needs-object-uncounted` | `{object}` | `src/content/default-locale-en.ts:3750`, `'hud.rooms.needs-object-uncounted'` |
| `hud.rooms.needs-item-more` | `and {count} more` | `src/content/default-locale-en.ts:3755`, `'hud.rooms.needs-item-more'` |
| `hud.rooms.needs-object-unknown` | `something this build cannot name` | `src/content/default-locale-en.ts:3759`, `'hud.rooms.needs-object-unknown'` |
| `hud.rooms.needs-doorway` | `a door — nobody can get in` | `src/content/default-locale-en.ts:3786`, `'hud.rooms.needs-doorway'` |
| `hud.rooms.needs-unreachable` | `a way in — nothing outside can reach its door` | `src/content/default-locale-en.ts:3828`, `'hud.rooms.needs-unreachable'` |
| `hud.rooms.at-capacity` | `At capacity` | `src/content/default-locale-en.ts:3888`, `'hud.rooms.at-capacity'` |
| `hud.rooms.at-capacity-count` | `{full} of {total}` | `src/content/default-locale-en.ts:3889`, `'hud.rooms.at-capacity-count'` |
| `hud.rooms.at-capacity-room` | `{room} at {x}, {y} is full` | `src/content/default-locale-en.ts:3890`, `'hud.rooms.at-capacity-room'` |
| `hud.rooms.at-capacity-places` | `places in use: {inUse} of {capacity}` | `src/content/default-locale-en.ts:3891`, `'hud.rooms.at-capacity-places'` |
| `hud.security-section.title` | `Security` | `src/content/default-locale-en.ts:3913`, `'hud.security-section.title'` |
| `hud.security-section.waiting` | `No prison is reporting.` | `src/content/default-locale-en.ts:3922`, `'hud.security-section.waiting'` |
| `hud.security-section.sectors` | `Sectors` | `src/content/default-locale-en.ts:3925`, `'hud.security-section.sectors'` |
| `hud.security-section.sectors-empty` | `No sector has been drawn on this land yet.` | `src/content/default-locale-en.ts:3932`, `'hud.security-section.sectors-empty'` |
| `hud.security-section.sector-staffing` | `{assigned} of {required} guards assigned` | `src/content/default-locale-en.ts:3939`, `'hud.security-section.sector-staffing'` |
| `hud.security-section.sector-short` | `{count} short` | `src/content/default-locale-en.ts:3946`, `'hud.security-section.sector-short'` |
| `hud.security-section.sector-open-incidents` | `{count} open here` | `src/content/default-locale-en.ts:3952`, `'hud.security-section.sector-open-incidents'` |
| `hud.security-section.lockdown` | `Lockdown` | `src/content/default-locale-en.ts:3961`, `'hud.security-section.lockdown'` |
| `hud.security-section.incidents` | `Incidents` | `src/content/default-locale-en.ts:3964`, `'hud.security-section.incidents'` |
| `hud.security-section.incidents-none` | `Nothing has been recorded yet.` | `src/content/default-locale-en.ts:3973`, `'hud.security-section.incidents-none'` |
| `hud.security-section.incidents-closed` | `Nothing is open. {total} recorded so far.` | `src/content/default-locale-en.ts:3982`, `'hud.security-section.incidents-closed'` |
| `hud.security-section.incidents-summary` | `{open} open of {total} recorded` | `src/content/default-locale-en.ts:3984`, `'hud.security-section.incidents-summary'` |
| `hud.security-section.incidents-toll` | `{injured} hurt, {escapes} got out` | `src/content/default-locale-en.ts:3991`, `'hud.security-section.incidents-toll'` |
| `hud.security-section.incident-row` | `{type} in {sector}` | `src/content/default-locale-en.ts:4029`, `'hud.security-section.incident-row'` |
| `hud.security-section.incident-severity` | `Severity {severity} of {max}` | `src/content/default-locale-en.ts:4036`, `'hud.security-section.incident-severity'` |
| `hud.security-section.incident-people` | `{count} taking part` | `src/content/default-locale-en.ts:4042`, `'hud.security-section.incident-people'` |
| `hud.security-section.incident-timeline` | `How it went` | `src/content/default-locale-en.ts:4044`, `'hud.security-section.incident-timeline'` |
| `hud.security-section.incident-timeline-row` | `{state} at tick {tick}` | `src/content/default-locale-en.ts:4055`, `'hud.security-section.incident-timeline-row'` |
| `hud.security-section.incident-responders` | `Responders needed: {count}` | `src/content/default-locale-en.ts:4069`, `'hud.security-section.incident-responders'` |
| `hud.security-section.incident-outcome` | `{injured} hurt, damage {damage} of {max}` | `src/content/default-locale-en.ts:4076`, `'hud.security-section.incident-outcome'` |
| `hud.security-section.incident-escaped` | `Somebody got out.` | `src/content/default-locale-en.ts:4078`, `'hud.security-section.incident-escaped'` |
| `hud.security-section.incidents-by-type` | `By kind` | `src/content/default-locale-en.ts:4080`, `'hud.security-section.incidents-by-type'` |
| `hud.security-section.count-row` | `{label}: {count}` | `src/content/default-locale-en.ts:4086`, `'hud.security-section.count-row'` |
| `hud.security-section.contraband` | `Contraband` | `src/content/default-locale-en.ts:4089`, `'hud.security-section.contraband'` |
| `hud.security-section.searches-none` | `No search is under way.` | `src/content/default-locale-en.ts:4098`, `'hud.security-section.searches-none'` |
| `hud.security-section.search-row` | `{scope} search - {state}` | `src/content/default-locale-en.ts:4106`, `'hud.security-section.search-row'` |
| `hud.security-section.search-progress` | `{done} of {count} searched` | `src/content/default-locale-en.ts:4112`, `'hud.security-section.search-progress'` |
| `hud.security-section.found` | `Confiscated` | `src/content/default-locale-en.ts:4114`, `'hud.security-section.found'` |
| `hud.security-section.found-none` | `Nothing has been confiscated.` | `src/content/default-locale-en.ts:4124`, `'hud.security-section.found-none'` |
| `hud.security-section.search-tally` | `{found} found, {missed} missed` | `src/content/default-locale-en.ts:4131`, `'hud.security-section.search-tally'` |
| `hud.severity.info` | `Info` | `src/content/default-locale-en.ts:4133`, `'hud.severity.info'` |
| `hud.severity.warning` | `Warning` | `src/content/default-locale-en.ts:4134`, `'hud.severity.warning'` |
| `hud.severity.danger` | `Critical` | `src/content/default-locale-en.ts:4135`, `'hud.severity.danger'` |
| `save.panel.region` | `Prison saves` | `src/content/default-locale-en.ts:4150`, `'save.panel.region'` |
| `save.panel.title` | `Prisons` | `src/content/default-locale-en.ts:4151`, `'save.panel.title'` |
| `save.manage.title` | `Saved prisons` | `src/content/default-locale-en.ts:4152`, `'save.manage.title'` |
| `save.manage.local` | `On this device` | `src/content/default-locale-en.ts:4153`, `'save.manage.local'` |
| `save.manage.cloud-unavailable` | `Cloud saves are unavailable in this version because the game has no cloud connection.` | `src/content/default-locale-en.ts:4154`, `'save.manage.cloud-unavailable'` |
| `save.action.create` | `New prison` | `src/content/default-locale-en.ts:4156`, `'save.action.create'` |
| `save.empty-world.title` | `Start a prison` | `src/content/default-locale-en.ts:4157`, `'save.empty-world.title'` |
| `save.empty-world.description` | `Create a new prison or continue one saved in this browser.` | `src/content/default-locale-en.ts:4158`, `'save.empty-world.description'` |
| `save.empty-world.create` | `Create a prison` | `src/content/default-locale-en.ts:4159`, `'save.empty-world.create'` |
| `save.empty-world.choose` | `Load a saved prison` | `src/content/default-locale-en.ts:4160`, `'save.empty-world.choose'` |
| `save.empty-world.restore` | `Restore a deleted prison` | `src/content/default-locale-en.ts:4161`, `'save.empty-world.restore'` |
| `save.default-prison-name` | `New Prison` | `src/content/default-locale-en.ts:4162`, `'save.default-prison-name'` |
| `save.action.save` | `Save now` | `src/content/default-locale-en.ts:4163`, `'save.action.save'` |
| `save.action.export` | `Export` | `src/content/default-locale-en.ts:4164`, `'save.action.export'` |
| `save.action.import` | `Import` | `src/content/default-locale-en.ts:4165`, `'save.action.import'` |
| `save.action.load` | `Load` | `src/content/default-locale-en.ts:4166`, `'save.action.load'` |
| `save.action.delete` | `Delete` | `src/content/default-locale-en.ts:4167`, `'save.action.delete'` |
| `save.action.delete-confirm` | `Delete permanently` | `src/content/default-locale-en.ts:4171`, `'save.action.delete-confirm'` |
| `save.action.delete-cancel` | `Keep` | `src/content/default-locale-en.ts:4172`, `'save.action.delete-cancel'` |
| `save.list.empty` | `No prisons yet.` | `src/content/default-locale-en.ts:4174`, `'save.list.empty'` |
| `save.list.item` | `{name} ({count} gen)` | `src/content/default-locale-en.ts:4175`, `'save.list.item'` |
| `save.status.idle` | `Local saves only — no network required.` | `src/content/default-locale-en.ts:4177`, `'save.status.idle'` |
| `save.status.saved` | `Saved (generation {generation}).` | `src/content/default-locale-en.ts:4178`, `'save.status.saved'` |
| `save.status.quota-exceeded` | `Storage is full. Delete an old prison or export and remove saves to free space. Your previous save is intact.` | `src/content/default-locale-en.ts:4183`, `'save.status.quota-exceeded'` |
| `save.status.transaction-aborted` | `The browser interrupted the save. Your previous save is intact — try saving again.` | `src/content/default-locale-en.ts:4185`, `'save.status.transaction-aborted'` |
| `save.status.changed-elsewhere` | `Could not save: this prison was changed elsewhere.` | `src/content/default-locale-en.ts:4199`, `'save.status.changed-elsewhere'` |
| `save.status.save-failed` | `Save failed: {detail}` | `src/content/default-locale-en.ts:4200`, `'save.status.save-failed'` |
| `save.status.list-unreadable` | `Could not read the local prison list (private browsing or an unreadable slot record can cause this): {detail}` | `src/content/default-locale-en.ts:4204`, `'save.status.list-unreadable'` |
| `save.status.creating` | `Creating prison…` | `src/content/default-locale-en.ts:4206`, `'save.status.creating'` |
| `save.status.create-failed` | `Could not create a prison: {detail}` | `src/content/default-locale-en.ts:4207`, `'save.status.create-failed'` |
| `save.status.no-active-prison` | `No active prison — create or load one first.` | `src/content/default-locale-en.ts:4208`, `'save.status.no-active-prison'` |
| `save.status.saving` | `Saving…` | `src/content/default-locale-en.ts:4209`, `'save.status.saving'` |
| `save.status.loading` | `Loading…` | `src/content/default-locale-en.ts:4210`, `'save.status.loading'` |
| `save.status.not-found` | `That prison no longer exists.` | `src/content/default-locale-en.ts:4211`, `'save.status.not-found'` |
| `save.status.no-readable-generation` | `No readable save generation remains for this prison. Every retained copy failed validation.` | `src/content/default-locale-en.ts:4212`, `'save.status.no-readable-generation'` |
| `save.status.recovered` | `The most recent save was unreadable — recovered an earlier verified generation.` | `src/content/default-locale-en.ts:4214`, `'save.status.recovered'` |
| `save.status.loaded` | `Loaded.` | `src/content/default-locale-en.ts:4215`, `'save.status.loaded'` |
| `save.status.deleted` | `Prison deleted. You can bring it back from the list below for one day.` | `src/content/default-locale-en.ts:4220`, `'save.status.deleted'` |
| `save.status.delete-kept` | `Nothing was deleted.` | `src/content/default-locale-en.ts:4224`, `'save.status.delete-kept'` |
| `save.status.nothing-to-export` | `Nothing to export — no valid active save.` | `src/content/default-locale-en.ts:4225`, `'save.status.nothing-to-export'` |
| `save.status.exported` | `Exported the current save.` | `src/content/default-locale-en.ts:4226`, `'save.status.exported'` |
| `save.status.importing` | `Reading the save file…` | `src/content/default-locale-en.ts:4233`, `'save.status.importing'` |
| `save.status.imported` | `Imported the save file into this prison (generation {generation}).` | `src/content/default-locale-en.ts:4234`, `'save.status.imported'` |
| `save.status.imported-migrated` | `Imported a save from an older version of Lockstate and brought it up to date (generation {generation}).` | `src/content/default-locale-en.ts:4235`, `'save.status.imported-migrated'` |
| `save.status.import-not-a-save` | `That file is not a Lockstate save — choose a file exported from this game.` | `src/content/default-locale-en.ts:4237`, `'save.status.import-not-a-save'` |
| `save.status.import-unsupported-version` | `That save was written by a newer version of Lockstate than this one. Update the game, then import it again.` | `src/content/default-locale-en.ts:4238`, `'save.status.import-unsupported-version'` |
| `save.status.import-corrupt` | `That save does not match its own checksum — it was damaged or edited after it was exported, so it was not imported.` | `src/content/default-locale-en.ts:4240`, `'save.status.import-corrupt'` |
| `save.status.import-invalid` | `That save file could not be read: {detail}` | `src/content/default-locale-en.ts:4242`, `'save.status.import-invalid'` |
| `save.failure.create` | `Creating the prison failed: {detail}` | `src/content/default-locale-en.ts:4244`, `'save.failure.create'` |
| `save.failure.save` | `Saving failed: {detail}` | `src/content/default-locale-en.ts:4245`, `'save.failure.save'` |
| `save.failure.load` | `Loading failed: {detail}` | `src/content/default-locale-en.ts:4246`, `'save.failure.load'` |
| `save.failure.delete` | `Deleting failed: {detail}` | `src/content/default-locale-en.ts:4247`, `'save.failure.delete'` |
| `save.failure.export` | `Exporting failed: {detail}` | `src/content/default-locale-en.ts:4248`, `'save.failure.export'` |
| `save.failure.import` | `Importing failed: {detail}` | `src/content/default-locale-en.ts:4249`, `'save.failure.import'` |
| `save.failure.restore` | `Bringing the prison back failed: {detail}` | `src/content/default-locale-en.ts:4250`, `'save.failure.restore'` |
| `save.failure.forget` | `Freeing the space failed: {detail}` | `src/content/default-locale-en.ts:4251`, `'save.failure.forget'` |
| `save.failure.unknown` | `The action failed: {detail}` | `src/content/default-locale-en.ts:4252`, `'save.failure.unknown'` |
| `save.detail.restored-scope` | `Restored: {restored}. Not carried by this save version: {notCarried}.` | `src/content/default-locale-en.ts:4259`, `'save.detail.restored-scope'` |
| `save.delete.confirm` | `Delete {name}? Every saved copy of this prison goes from your list. You can bring it back from this panel for one day, and after that it is gone for good. Its saves last changed {age}.` | `src/content/default-locale-en.ts:4298`, `'save.delete.confirm'` |
| `save.delete.age.moments` | `less than a minute ago` | `src/content/default-locale-en.ts:4303`, `'save.delete.age.moments'` |
| `save.delete.age.minutes` | `{count} min ago` | `src/content/default-locale-en.ts:4304`, `'save.delete.age.minutes'` |
| `save.delete.age.hours` | `{count} h ago` | `src/content/default-locale-en.ts:4305`, `'save.delete.age.hours'` |
| `save.delete.age.days` | `{count} d ago` | `src/content/default-locale-en.ts:4306`, `'save.delete.age.days'` |
| `save.tombstone.item` | `{name} — deleted. You can still bring it back.` | `src/content/default-locale-en.ts:4329`, `'save.tombstone.item'` |
| `save.action.tombstone-restore` | `Bring it back` | `src/content/default-locale-en.ts:4330`, `'save.action.tombstone-restore'` |
| `save.action.tombstone-forget` | `Free its space now` | `src/content/default-locale-en.ts:4336`, `'save.action.tombstone-forget'` |
| `save.status.tombstone-restored` | `{name} is back, exactly as it was.` | `src/content/default-locale-en.ts:4347`, `'save.status.tombstone-restored'` |
| `save.status.tombstone-window-closed` | `Too late — that prison can no longer be brought back.` | `src/content/default-locale-en.ts:4351`, `'save.status.tombstone-window-closed'` |
| `save.status.tombstone-slot-taken` | `That prison cannot come back — another prison now holds its place, and is still here.` | `src/content/default-locale-en.ts:4355`, `'save.status.tombstone-slot-taken'` |
| `save.status.tombstone-gone` | `That prison is no longer here to bring back.` | `src/content/default-locale-en.ts:4358`, `'save.status.tombstone-gone'` |
| `save.status.tombstone-forgotten` | `Gone for good. Nothing of that prison is kept now.` | `src/content/default-locale-en.ts:4362`, `'save.status.tombstone-forgotten'` |
| `save.scope.kernel` | `kernel tick and command queue` | `src/content/default-locale-en.ts:4381`, `'save.scope.kernel'` |
| `save.scope.rng-streams` | `RNG stream states` | `src/content/default-locale-en.ts:4382`, `'save.scope.rng-streams'` |
| `save.scope.world` | `world terrain and ownership` | `src/content/default-locale-en.ts:4383`, `'save.scope.world'` |
| `save.scope.construction` | `construction orders and undo/redo` | `src/content/default-locale-en.ts:4384`, `'save.scope.construction'` |
| `save.scope.entity-liveness` | `entity id liveness` | `src/content/default-locale-en.ts:4385`, `'save.scope.entity-liveness'` |
| `save.scope.prisoners` | `prisoners, needs, actions and cell assignments` | `src/content/default-locale-en.ts:4386`, `'save.scope.prisoners'` |
| `save.scope.operations` | `jobs, containers and utility networks` | `src/content/default-locale-en.ts:4387`, `'save.scope.operations'` |
| `save.scope.security` | `doors, security sectors, guards and patrols` | `src/content/default-locale-en.ts:4388`, `'save.scope.security'` |
| `save.scope.contraband` | `contraband, intelligence and searches` | `src/content/default-locale-en.ts:4389`, `'save.scope.contraband'` |
| `save.scope.incidents` | `incidents, gangs and tunnels` | `src/content/default-locale-en.ts:4390`, `'save.scope.incidents'` |
| `save.scope.names` | `prisoner and staff names` | `src/content/default-locale-en.ts:4391`, `'save.scope.names'` |
| `save.scope.room-caches` | `room and topology caches (recomputed from the world)` | `src/content/default-locale-en.ts:4396`, `'save.scope.room-caches'` |
| `save.scope.navigation-caches` | `navigation caches and in-flight path requests (re-issued on the next tick)` | `src/content/default-locale-en.ts:4397`, `'save.scope.navigation-caches'` |
| `input.action.camera.up` | `Pan camera up` | `src/content/default-locale-en.ts:4405`, `'input.action.camera.up'` |
| `input.action.camera.down` | `Pan camera down` | `src/content/default-locale-en.ts:4406`, `'input.action.camera.down'` |
| `input.action.camera.left` | `Pan camera left` | `src/content/default-locale-en.ts:4407`, `'input.action.camera.left'` |
| `input.action.camera.right` | `Pan camera right` | `src/content/default-locale-en.ts:4408`, `'input.action.camera.right'` |
| `input.action.camera.zoom.in` | `Zoom in` | `src/content/default-locale-en.ts:4409`, `'input.action.camera.zoom.in'` |
| `input.action.camera.zoom.out` | `Zoom out` | `src/content/default-locale-en.ts:4410`, `'input.action.camera.zoom.out'` |
| `hud.camera.view.failed` | `Could not change view. Choose a view to try again.` | `src/content/default-locale-en.ts:4411`, `'hud.camera.view.failed'` |
| `hud.camera.view` | `View` | `src/content/default-locale-en.ts:4412`, `'hud.camera.view'` |
| `hud.camera.view.world` | `Top-down` | `src/content/default-locale-en.ts:4413`, `'hud.camera.view.world'` |
| `hud.camera.view.oblique` | `Angled view` | `src/content/default-locale-en.ts:4414`, `'hud.camera.view.oblique'` |
| `input.action.camera.rotate.left` | `Rotate camera left` | `src/content/default-locale-en.ts:4415`, `'input.action.camera.rotate.left'` |
| `input.action.camera.rotate.right` | `Rotate camera right` | `src/content/default-locale-en.ts:4416`, `'input.action.camera.rotate.right'` |
| `input.action.camera.tilt.up` | `Raise camera angle` | `src/content/default-locale-en.ts:4417`, `'input.action.camera.tilt.up'` |
| `input.action.camera.tilt.down` | `Lower camera angle` | `src/content/default-locale-en.ts:4418`, `'input.action.camera.tilt.down'` |
| `input.action.selection.primary` | `Select` | `src/content/default-locale-en.ts:4419`, `'input.action.selection.primary'` |
| `input.action.build.confirm` | `Confirm placement` | `src/content/default-locale-en.ts:4420`, `'input.action.build.confirm'` |
| `input.action.build.cancel` | `Cancel` | `src/content/default-locale-en.ts:4423`, `'input.action.build.cancel'` |
| `input.action.edit.undo` | `Undo` | `src/content/default-locale-en.ts:4427`, `'input.action.edit.undo'` |
| `input.action.edit.redo` | `Redo` | `src/content/default-locale-en.ts:4428`, `'input.action.edit.redo'` |
| `brand.region` | `Lockstate build` | `src/content/default-locale-en.ts:4433`, `'brand.region'` |
| `brand.wordmark` | `LockState.io` | `src/content/default-locale-en.ts:4436`, `'brand.wordmark'` |
| `brand.stage` | `PRE-ALPHA` | `src/content/default-locale-en.ts:4444`, `'brand.stage'` |
| `brand.build` | `v{version} · {commit}` | `src/content/default-locale-en.ts:4453`, `'brand.build'` |
| `brand.description` | `Lockstate, {stage} build, version {version}, commit {commit}.` | `src/content/default-locale-en.ts:4457`, `'brand.description'` |
| `display.scale.region` | `Interface scale` | `src/content/default-locale-en.ts:4473`, `'display.scale.region'` |
| `display.scale.cycle` | `Change the interface scale` | `src/content/default-locale-en.ts:4474`, `'display.scale.cycle'` |
| `display.theme.region` | `Theme` | `src/content/default-locale-en.ts:4490`, `'display.theme.region'` |
| `display.theme.system` | `System` | `src/content/default-locale-en.ts:4491`, `'display.theme.system'` |
| `display.theme.light` | `Light` | `src/content/default-locale-en.ts:4492`, `'display.theme.light'` |
| `display.theme.dark` | `Dark` | `src/content/default-locale-en.ts:4493`, `'display.theme.dark'` |
| `display.theme.cycle` | `Change the interface theme` | `src/content/default-locale-en.ts:4494`, `'display.theme.cycle'` |
| `display.language.region` | `Language` | `src/content/default-locale-en.ts:4519`, `'display.language.region'` |
| `display.language.automatic` | `Automatic ({language})` | `src/content/default-locale-en.ts:4520`, `'display.language.automatic'` |
| `display.language.english` | `English` | `src/content/default-locale-en.ts:4521`, `'display.language.english'` |
| `display.language.polish` | `Polski` | `src/content/default-locale-en.ts:4522`, `'display.language.polish'` |
| `display.language.cycle` | `Change the interface language and reload the game` | `src/content/default-locale-en.ts:4530`, `'display.language.cycle'` |
| `app.shell.label` | `Lockstate game application` | `src/content/default-locale-en.ts:4540`, `'app.shell.label'` |

