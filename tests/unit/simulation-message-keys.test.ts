import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SIMULATION_ENUM_GROUPS,
  type SimulationEnumGroup,
  defaultLocaleEnCatalog,
  deriveSimulationMessageKey,
  simulationEnumMessageKeys,
  simulationEnumMessages,
  validateSimulationEnumGroups,
} from '../../src/content';
import {
  Localizer,
  PSEUDO_LOCALE,
  buildPseudoLocaleCatalog,
  defaultMessageCatalogEn,
} from '../../src/services/localization';
import { stripComments } from '../helpers/canonical-iteration';
import {
  extractEnumDeclarationIds,
  findEnumShapedDeclarations,
  validateSimulationEnumGroupSource,
} from '../helpers/simulation-enum-source';

/**
 * The completeness contract for `src/content/simulation-message-keys.ts`.
 *
 * The table labels enum values that have no definition object to carry a
 * `nameKey`. Its only real risk is silence: someone adds a sixth incident
 * type, no key exists for it, and the HUD renders `gang-retaliation` at a
 * player. So the *source declaration is authoritative* and the table must
 * conform to it -- not the other way round, and not against a second
 * hand-maintained list of expected values, which would be the same table
 * written twice and would rot in exactly the same way.
 *
 * The rules live in `tests/helpers/simulation-enum-source.ts` (exported,
 * typed and exercised against fixtures below); this file is the part that has
 * to touch the filesystem, mirroring the split in
 * `tests/determinism/ambient-nondeterminism-contract.test.ts`.
 *
 * ## Why the scan is measured here and not merely trusted (#307)
 *
 * Until #307 those rules were the back half of `src/content/validate-catalog.ts`
 * and carried their own comment stripper, a two-regex `stripSourceComments`
 * with exactly the defect #278 reported: block comments removed before line
 * comments, so a `//` comment containing `/*` -- a glob, a regex, a URL --
 * opened a block comment that closed at the next `*` `/` anywhere below.
 * Measured over the files this scan reads it blanked **81 lines of real code
 * in two of them**, 80 of them consecutive locale lines in
 * `src/content/default-locale-en.ts` reached from a comment naming
 * `src/persistence/**`. Nothing here failed. The discovery below simply read
 * less corpus than it claimed to and stayed green, which is the worst shape a
 * defect in a gate can take.
 *
 * So the corpus itself is now asserted, in both directions, against an oracle
 * built from each line's first two characters rather than from the scanner
 * being checked -- an oracle that shared the scanner's idea of where a comment
 * starts would agree with it about the lines it got wrong. That is the check
 * `tests/foundation/comment-stripping-contract.test.ts` makes over `src/` and
 * `tests/` for `stripComments` generally; it is repeated here over *this*
 * gate's own corpus, because "the shared helper is correct" and "this gate saw
 * every file it says it scans" are different claims and only the second one
 * is what makes the discovery below mean anything.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const SCANNED_ROOTS = ['src/simulation', 'src/content'] as const;

const repoPath = (file: string): string => relative(REPOSITORY_ROOT, file).split('\\').join(posix.sep);

function listTypeScriptFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTypeScriptFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) found.push(full);
  }
  return found;
}

const SCANNED_FILES = SCANNED_ROOTS.flatMap((root) => listTypeScriptFiles(join(REPOSITORY_ROOT, root)));

const readSource = (file: string): string => readFileSync(join(REPOSITORY_ROOT, file), 'utf8');

/**
 * Enum-shaped declarations that intentionally carry no player-facing label,
 * each with the reason. This is the *only* way to have one, so introducing
 * an unlabelled enum is a reviewable diff rather than an omission -- the
 * same device as the allow-list in the ambient-nondeterminism contract.
 */
const UNLABELLED: readonly { readonly sourceFile: string; readonly declaration: string; readonly reason: string }[] = [
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'MAIN_TO_WORKER_MESSAGE_KINDS',
    reason:
      'Wire protocol message kinds (ADR 0003). They travel between the main thread and the worker and are never rendered; a player never sees "load-snapshot".',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'WORKER_TO_MAIN_MESSAGE_KINDS',
    reason:
      'Wire protocol message kinds (ADR 0003), same as the main-to-worker set: transport vocabulary, not text a panel displays.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'PROJECTION_IDS',
    reason:
      'Which read model a `simulation/request-projection` names (#104). Wire vocabulary in the same sense as the two message-kind lists above -- it selects a payload shape, it is not a payload. A panel already knows which projection it asked for, because it named it; nothing renders "hud/prisoner-roster", and a label for it would be a caption for a request rather than for anything in the prison. The *contents* of each projection do carry labels, through the groups this table already holds -- `IntakeStage`, `IncidentType`, `DeploymentPhase` and the rest -- which is where the words a roster or an incident list shows actually come from.',
  },
  {
    sourceFile: 'src/simulation/worker/projection-catalog.ts',
    declaration: 'ProjectionTargetKind',
    reason:
      'Whether a catalogued projection takes no target, an entity id or a string id (#104). It is a property of the *catalog entry*, read only by the worker\'s own request validation to decide whether a request named the right kind of thing, and it never crosses the boundary in either direction: the wire carries `ProjectionTarget`, which is the target itself, and never this classification of it. Nothing projects it and no panel could render it.',
  },
  {
    sourceFile: 'src/simulation/runtime/restore-refusal.ts',
    declaration: 'SNAPSHOT_REFUSAL_REASONS',
    reason:
      'Why a snapshot restore was refused (#431), and exempt for the reason `PROTOCOL_FAULT_CODES` below it is: developer diagnostics on the restore boundary, read by `SessionController.loadPrison` to decide whether a generation may be retired and by a support report to tell a bad save from a bug of ours. Nothing renders "unsupported-by-this-build". What the player is told about a failed load is the save panel\'s own authored sentence with its own key -- `save.status.no-readable-generation` when the walk is exhausted, `save.failure.load` when the load threw -- and both already existed and are unchanged by this vocabulary. Whether a player *should* be told which of the two reasons applied is a real product question and a new promise: it is recorded as an open question on the ADR that decides this taxonomy rather than being answered by adding keys here.',
  },
  {
    sourceFile: 'src/simulation/protocol/decode.ts',
    declaration: 'PROTOCOL_DECODE_ERROR_CODES',
    reason:
      'Developer diagnostics for a malformed protocol envelope, reported to the main thread as protocol fault codes. A player-facing failure message is the UI layer\'s own string with its own key; surfacing "unsupported-protocol-version" verbatim would be a bug, not a missing translation.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'PROTOCOL_FAULT_CODES',
    reason:
      'The twelve reasons the worker may refuse or abandon a request, and the superset of `PROTOCOL_DECODE_ERROR_CODES` exempted just above for the same reason: developer diagnostics on the worker-to-main boundary. A player-facing failure message is the UI layer\'s own string with its own key -- `src/ui/hud/messages.ts`\'s `hud.refusal.*` names the outcome and deliberately carries neither the code nor the thrown `Error` text (#207) -- so rendering "snapshot-incompatible" verbatim would be a bug rather than a missing translation. Newly *discovered* by this scan rather than newly written: the vocabulary used to live inline inside `z.enum([...])`, where no scan could see it, and #187 exported it as a `const` tuple so `tests/foundation/fault-code-reachability-contract.test.ts` could enumerate it.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'REFUSAL_REASONS',
    reason:
      'The only exemption here for a vocabulary that genuinely does reach the player, and the distinction is *how*. This table labels an id a panel renders as a **label** -- a cell reading "Awaiting Materials", a badge reading "High Risk" -- and a refusal is not a label: it is a whole sentence saying what did not happen and why ("The build order failed -- you do not own that land."), which a derived `refusal-reason.build.unowned-land.name` reading "Unowned Land" cannot be and would have nowhere to be rendered. So the id maps 1:1 onto an authored HUD sentence key in `src/ui/simulation-alerts.ts` (#261). The completeness this table would give is given there instead, and in two directions: the mapping is a `Record` over the closed union, so a reason added to the protocol fails to compile until it has a key, and `tests/unit/ui-simulation-alerts.test.ts` resolves every one of those keys against the bundled default catalog so none can ship as its own raw dotted text.',
  },
  {
    sourceFile: 'src/simulation/events/event-log.ts',
    declaration: 'ConstructionUndoSpendOutcome',
    reason:
      'Whether one `Undo` press destroyed what had been spent on any of the orders it reversed (#927), and exempt because it is a *selector between two authored sentences* rather than a fact of its own. `createConstructionCommandHandler` computes it from `ConstructionSystem.undo()`\'s answer and hands it to `recordConstructionUndone`, which switches it onto `construction.undone` or `construction.undone-spend-destroyed`; both of those already resolve to authored HUD sentences through `EVENT_PRESENTATION`, which is where the words a player reads come from and which the `SIMULATION_EVENT_TYPES` entry below argues out. A derived `construction-undo-spend-outcome.spend-destroyed.name` reading "Spend Destroyed" would be a second English word for a fact the sentence already carries, would have nowhere to be rendered, and would drift from it -- the same argument that entry makes, one level further from the player. It never crosses the worker boundary either: what travels is the event type it selected.',
  },
  {
    sourceFile: 'src/simulation/rooms/enclosure.ts',
    declaration: 'RoomPerimeterAccess',
    reason:
      'Whether anything can cross a room\'s perimeter -- `gap`, `doorway`, `no-way-in` (#938) -- and exempt for the reason `ConstructionUndoSpendOutcome` above it is: it *selects* what a readout says rather than being a fact the readout names. Only one of its three values is ever rendered at all, and what is rendered is an authored sentence with its own key: `roomNeedsFromProjections` turns `no-way-in` into a `kind: \'doorway\'` entry and the Rooms panel draws `hud.rooms.needs-doorway`, "a door -- nobody can get in", whose locale entry carries the proof of each of its clauses. A derived `room-perimeter-access.no-way-in.name` reading "No Way In" would be a second English phrase for the fact that sentence already carries, would have nowhere to be rendered, and the other two values would need labels no surface could ever show -- a badge reading "Doorway" is not a thing this panel has. It does cross the worker boundary, as `RoomListRowViewModel.access`, and that is the point of the exemption rather than an argument against it: what crosses is the *verdict*, and the words for it are chosen on the other side, which is `src/ui/simulation-zoning.ts`\'s recorded division ("the enum pair crosses the boundary and which sentence that pair deserves stays in the panel").',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'SIMULATION_EVENT_TYPES',
    reason:
      'Exempt for exactly the reason `REFUSAL_REASONS` above is, and the two are best read together because they are the same shape on opposite channels. This table labels an id a panel renders as a **label**; an event is a whole sentence saying what the prison just did ("Payday went unpaid -- your staff are owed 360."), and a derived `simulation-event.economy.wages-unpaid.name` reading "Wages Unpaid" could not carry the figure and would have nowhere to be rendered. So each id maps 1:1 onto an authored HUD sentence key in `src/ui/simulation-events.ts` (#507), which is where the completeness this table would give is given instead, and in the same two directions: the mapping is a `Record` over the closed union, so an event type added to the protocol fails to compile until somebody has decided what it says and how loudly, and `tests/unit/ui-simulation-events.test.ts` resolves every key against the bundled default catalog so none can ship as its own raw dotted text. These sentences additionally take `labelParameters`, which no derived label ever could.',
  },
  {
    sourceFile: 'src/simulation/protocol/types.ts',
    declaration: 'PRISON_CONDITIONS',
    reason:
      "A closed union recomputed onto `statusCountsSchema.conditions` (ADR 0087 decision 2, the owner's 2026-09-01 amendment on issue #767), and, as of this decision, read by nothing under `src/ui/`: no panel, no alerts row and no badge names a `PrisonCondition` member yet. That is provisional rather than an argument that it never will be -- the change that built this union was scoped to the protocol shape, the pure producer (`computeStandingPrisonConditions`) and the crossing event 'and no further', deliberately deferring the labelling `REFUSAL_REASONS` and `SIMULATION_EVENT_TYPES` above already do for the two sibling vocabularies this same decision touches. Two of this union's four members already reach a player in different words today -- `BuildQueueMaterialsFundingViewModel.shortfallMinorUnits` and `HudIntakePipelineViewModel.waitingWithoutPlace` render as pulled panel copy, and the other two fire the `economy.deliveries-refused` / `economy.construction-refused` crossing sentences this same amendment adds -- so nothing here is silently unrendered; what is deferred is a *second*, standing rendering of the same four facts. When a panel reads this field directly, the labelling takes the same `Record`-over-closed-union shape those two entries argue for, or this exemption is removed rather than kept out of habit.",
  },
  {
    sourceFile: 'src/simulation/presentation/construction-projection.ts',
    declaration: 'PENDING_BUILD_ORDER_STATES',
    reason:
      'A *subset* of an enum this table already labels, and the only reason it is a declaration of its own is that the subset is a judgement worth reading: it is the five members of `BuildOrderLifecycleState` that are still coming, and `construction-projection.ts` argues out why `completed`, `cancelled` and `failed` are excluded. Every one of its five members already resolves through the `build-order-state` group above -- `projectBuildQueue` emits `state` and the Build panel renders it as `deriveSimulationMessageKey(\'build-order-state\', state)` -- so it is labelled, in the only place a label for these ids may live. A group of its own would author a second English word for the same five facts under a second namespace, and the two would drift; that is the same argument `build-edge` makes for not re-labelling `door-side`, run the other way.',
  },
  {
    sourceFile: 'src/simulation/construction/build-order.ts',
    declaration: 'BUILD_ORDER_FAIL_REASONS',
    reason:
      'The construction system\'s own spelling of why it failed an order, and it never leaves the simulation under this name: `createConstructionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, and no projection in `src/simulation/presentation/` emits `BuildOrder.failReason` at all. It is persisted (`save-schema.ts`) and read back as save data, which is storage rather than display. Labelling it would author a second set of words for the same nine facts `REFUSAL_REASONS` already carries, and the two would drift.',
  },
  {
    sourceFile: 'src/simulation/operations/job.ts',
    declaration: 'CARRY_JOB_FAIL_REASONS',
    reason:
      'Why `JobSystem` ended a carry job -- a container id the registry does not hold, or a reservation that could not be honoured at pickup. Exempt for a *stronger* version of the reason `BUILD_ORDER_FAIL_REASONS` above is: that one at least reaches the player under a different spelling, mapped onto a `RefusalReason` by a command handler, and this one reaches no surface at all. Nothing in `src/simulation/presentation/` projects `CarryItemJob.failReason`, no command creates a carry job (so there is no handler to map it and no `carry.*` namespace on the wire -- `simulation-refusals.test.ts` asserts the wire vocabulary is exactly the ten *command* namespaces), and `docs/OPERATIONS.md` records that nothing in the HUD surfaces the operations substrate yet. It is persisted by `save-schema.ts` and read back as save data, which is storage rather than display. Labelling it would author words for a fact no panel can render; giving job failures a player-facing channel is an ADR rather than a row in this table.',
  },
  {
    sourceFile: 'src/simulation/economy/treasury.ts',
    declaration: 'SpendClass',
    reason:
      "Which rung of ADR 0017 decision 8's insolvency ladder a spend belongs to -- the owner's ruling 19 of 2026-08-31, drafted as ADR 0017's \"Amendment, 2026-09-01\". It is a *required argument* on `Treasury.canAfford` and `Treasury.spend`, chosen over a caller-side check precisely so that `tsc` refuses a spend that does not name its rung; it is never a value anything holds, publishes, persists or renders. Nothing crosses the worker boundary carrying it: what a player is told when a rung refuses them is the authored `hud.alert.refusal.purchase.*` or `hud.alert.refusal.hire.*` sentence for the `RefusalReason` the command handler maps to, which is the same argument `PurchaseRefusalReason` below makes one layer down. A derived `spend-class.deliveries.name` reading \"Deliveries\" would have nowhere to be rendered. **What the ruling owed the player is a sentence per rung, and the owner supplied it on 2026-09-01.** The paragraph here recorded it as owed: *\"the four existing sentences say 'that would go past what the state will carry', which is true at -2,500 and false at -1,250, and replacement copy is the owner's under `AGENTS.md`'s fourth exclusion.\"* The four now name what stops rather than the threshold -- *\"deliveries are refused until the prison earns the money\"*, which read *\"until the state pays what it owes\"* until 2026-09-04 and was replaced when issue #913 measured that the state accrues nothing for a prison holding nobody -- and rung 2 gained a `RefusalReason` and a sentence of its own (`construction.materials-unfunded`) so that a stalled build queue stops borrowing rung 1's words. None of that changes this exemption's argument: `SpendClass` is still never a value anything renders. See `src/content/default-locale-en.ts` at those five keys.",
  },
  {
    sourceFile: 'src/simulation/economy/procurement.ts',
    declaration: 'PurchaseRefusalReason',
    reason:
      'The procurement system\'s own spelling of why it refused a purchase, exempt for exactly the reason `BUILD_ORDER_FAIL_REASONS` above is: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything crosses the worker boundary, and nothing projects or persists it. Newly *discovered* rather than newly written -- the union used to sit inline inside `PurchaseOutcome`, where no scan could see it, and #261 named it so the mapping could be checked exhaustively at compile time.',
  },
  {
    sourceFile: 'src/simulation/staff/hiring.ts',
    declaration: 'StaffHireRefusalReason',
    reason:
      'Why `StaffHiringService.hire` refused a `HireStaff` -- a role the catalogue does not declare, a wage the treasury cannot cover, a roster at the capacity its `EntityStore` was built with. Exempt for exactly the reason `PurchaseRefusalReason` above is: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything crosses the worker boundary, and nothing projects or persists it. What the player reads is one authored `hud.alert.refusal.hire.*` sentence per reason (ADR 0025), not a two-word label this table could hold.',
  },
  {
    sourceFile: 'src/simulation/kernel/kernel.ts',
    declaration: 'CommandRejectionKind',
    reason:
      'Which of three refusals `Kernel.submitCommand` made -- a duplicate sequence, a sequence gap, or a tick already executed. It exists so the worker can map a refusal to a fault code instead of collapsing all three onto `invalid-state` (#187 finding 2), so it is one layer *below* a diagnostic that is itself exempt above. Nothing projects it: it never leaves the worker, and the main thread receives the mapped `ProtocolFaultCode` and never this discriminant.',
  },
  {
    sourceFile: 'src/simulation/rooms/zoning.ts',
    declaration: 'ZoneRoomRefusalReason',
    reason:
      'Why `RoomZoningService.zone` refused a `ZoneRoom` -- unowned land, an overlap, a rectangle no room can be. It is the zoning counterpart of `BuildOrder.failReason`, which is likewise a stable id and likewise carries no key: #207 settled that a refusal a player sees is the UI layer\'s own `hud.refusal.*` string naming the outcome, never the simulation\'s code rendered verbatim. It never leaves the simulation under this spelling: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, and what the player reads is one authored `hud.alert.refusal.zone.*` sentence per reason rather than a two-word label this table could hold -- see the `REFUSAL_REASONS` entry above for that argument in full. Until #261 step 2 built the route this entry said "nothing projects this one at all yet -- it reaches `recentRefusals()` and stops there"; the reason it reaches now is mapped, and the window it also still fills is diagnosis.',
  },
  {
    sourceFile: 'src/simulation/objects/object-placement-service.ts',
    declaration: 'PlaceObjectRefusalReason',
    reason:
      "Why `ObjectPlacementService.place` refused a `PlaceObject` -- a tile something is already standing on, a tile in no room, land the player does not own. Exempt for exactly the reason `ZoneRoomRefusalReason` and `UnzoneRoomRefusalReason` below it are, and it is the same argument one command over: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, so this spelling never leaves the simulation, and what the player reads is one authored `hud.alert.refusal.place-object.*` sentence per reason rather than a two-word label this table could hold. Three of the seven -- `out-of-bounds`, `unowned-land`, `duplicate-order` -- are spellings the build and purchase vocabularies also use, which is why the namespace exists and why a shared label would be wrong for at least two of the three commands.",
  },
  {
    sourceFile: 'src/simulation/objects/placed-object.ts',
    declaration: 'ObjectOrientation',
    reason:
      "Quarter turns clockwise from the footprint as content authored it: `0 | 1 | 2 | 3`. Not a label and not a projection -- it is read by `orientedFootprint` to decide which tiles a placement reserves and by the renderer to decide which way to draw, and neither of those is text. Nothing in `src/` writes anything but `0` yet, because the rotate control ADR 0028 decision 5 describes needs an `ACTION_IDS` member phase 1 does not ship; a label for a value no player can produce and no panel can show would be a caption for a field rather than for anything in the prison. If a rotation ever becomes something the interface *states* rather than something it draws, that is a HUD string with its own key, exactly as `BUILD_EDGES` gets one through `deriveSimulationMessageKey('build-edge', ...)`.",
  },
  {
    sourceFile: 'src/simulation/rooms/zoning.ts',
    declaration: 'UnzoneRoomRefusalReason',
    reason:
      "Why `RoomZoningService.unzone` refused an `UnzoneRoom` -- an area that is not a rectangle, an area holding no room, a room somebody is using. Exempt for exactly the reason `ZoneRoomRefusalReason` above it is, and it is the same argument one command over: `createSessionCommandHandler` maps every member onto a `RefusalReason` through an exhaustive `Record` before anything is published, so this spelling never leaves the simulation, and what the player reads is one authored `hud.alert.refusal.unzone.*` sentence per reason rather than a two-word label this table could hold. The namespace exists precisely because the sentences differ where the ids do not: `invalid-area` is a member of both unions and the same condition, and a player told \"The room was not zoned\" after asking to *remove* a room would go and look at the wrong control.",
  },
  {
    sourceFile: 'src/simulation/rooms/enclosure.ts',
    declaration: 'RoomEnclosure',
    reason:
      "Whether a zoned rectangle's own perimeter is walled: `'sealed'` or `'open'`. It does reach the player, and this table is still the wrong place for it, for the reason `REFUSAL_REASONS` is exempt -- what the Rooms panel renders is a *sentence* about the answer, not a label of it. \"Walled in on every side\" and \"Open on at least one side\" are `hud.rooms.enclosure-*` keys authored in the HUD's own namespace, and the one combination worth flagging -- an `enclosed` room whose perimeter is open -- is a third sentence that no per-member label could produce, because it is about the *pair* of this enum and `RoomEnclosureRequirement` rather than about either member. A derived `room-enclosure.open.name` reading \"Open\" would have nowhere to be rendered.",
  },
  {
    sourceFile: 'src/simulation/rooms/requirements.ts',
    declaration: 'RoomEnclosureRequirement',
    reason:
      "What a room definition asks about being indoors: `'enclosed'`, `'outdoors'`, or `'none'` for a definition carrying neither. Exempt beside `RoomEnclosure` above and for the same reason, with one addition worth stating: `'none'` is not a state content is ever in today -- 17 of the 18 shipped rooms are `enclosed` and `room.yard` is `outdoors` -- so a labelled group here would author a word for a member no session can currently show, which is the failure `tests/foundation/unconsumed-content-contract.test.ts` exists to catch one layer over. The Rooms panel's three `hud.rooms.requirement-*` keys carry the sentences, including the one for `'none'`, because the panel renders it as a statement about the selected room rather than as that room's badge.",
  },
  {
    sourceFile: 'src/simulation/prisoners/prisoner-operations-runtime.ts',
    declaration: 'ADMIT_PRISONER_REFUSAL_REASONS',
    reason:
      'Why `PrisonerOperationsRuntime.requestAdmission` refused an `AdmitPrisoner` -- no room instance any accommodation target names, or an exhausted entity store. It is the admission counterpart of `ZoneRoomRefusalReason` and `UnzoneRoomRefusalReason` above and carries no key for the identical reason: it never leaves the simulation under this spelling, because `createSessionCommandHandler` maps both members onto a `RefusalReason` through an exhaustive `Record` before anything is published, and what the player reads is one authored `hud.alert.refusal.admit.*` sentence per reason rather than a two-word label. See the `REFUSAL_REASONS` entry above for that argument in full.',
  },
  {
    sourceFile: 'src/simulation/security/coverage-state.ts',
    declaration: 'SECTOR_COVERAGE_STATES',
    reason:
      'The three rungs of the guard-coverage ladder -- `covered`, `understaffed`, `unguarded` (issue #588). Exempt because these three ids already have authored player-facing words and a derived group would author a *second* set of them: `hud.security.coverage-met`, `hud.security.coverage-short` and `hud.security.coverage-unguarded` read "Covered", "Understaffed" and "Unguarded", and `describeStaffCoverage` has picked between them since ADR 0048 consequence 1. The id itself never crosses the worker boundary at all -- `SafetyCoverageSystem` publishes the census as three *counts* (`prisonersCovered`, `prisonersUnderstaffed`, `prisonersUnguarded`), so nothing downstream ever receives the string to look a label up by. That is the same argument `PENDING_BUILD_ORDER_STATES` above makes about not re-labelling ids a HUD key already covers, and `tests/unit/security-coverage-state.test.ts` is where the simulation ladder and the HUD badge keys are asserted to agree rung for rung.',
  },
  {
    sourceFile: 'src/simulation/security/guard-release.ts',
    declaration: 'GuardReleaseRefusalReason',
    reason:
      'Why `GuardReleaseService.release` refused a `ReleaseGuardAssignment` -- the guard is already unassigned, or the roster holds no such entity (ADR 0034). Exempt for the identical reason as `ZoneRoomRefusalReason`, `UnzoneRoomRefusalReason`, `PurchaseCancelRefusalReason` and `ADMIT_PRISONER_REFUSAL_REASONS` above: it never leaves the simulation under this spelling, because `createSessionCommandHandler` maps both members onto a `RefusalReason` through an exhaustive `Record` before anything is published, and what the player reads is one authored `hud.alert.refusal.release-guard.*` sentence per reason rather than a two-word label this table could hold. Note that the *other* union the same file declares, `GUARD_CLAIM_KINDS`, is labelled rather than exempt, and the contrast is the whole rule: a claim kind is a dense label on a roster row and a refusal reason is a sentence about something that did not happen.',
  },
  {
    sourceFile: 'src/content/simulation-message-keys.ts',
    declaration: 'SimulationEnumForm',
    reason:
      'Metadata of the labelling mechanism itself -- how a declaration is written in source. It describes the table, it is not a value the simulation projects.',
  },
  {
    sourceFile: 'src/simulation/locomotion/locomotion.ts',
    declaration: 'HeadingComponent',
    reason:
      "The sign of one axis of a walking actor's heading -- `-1`, `0` or `1` (ADR 0059). Exempt for the reason `ObjectOrientation` is: it is arithmetic rather than a vocabulary. Nothing labels it and nothing could: it is multiplied by a sub-tile offset to place an actor and packed into two nibbles of the render payload's fields word, where `src/rendering/feed/actors-from-delta.ts` hands it straight to `directionFromMovement` to choose an authored sprite direction. The eight *directions* that lookup produces are art in `assets/contracts/character-8-direction.contract.json`, not text, and a panel that ever states which way somebody is facing would be a HUD string with its own key rather than a caption for the number -1.",
  },
  // `src/content/validate-catalog.ts::EnumIdExtractionFailure` was exempted
  // here until #307. It is not a new omission: the declaration left the
  // scanned roots with the rest of the source-scanning rules, so an exemption
  // for it would now be a claim about a file this scan does not read -- which
  // the honesty check below rejects, deliberately.
];

const groupKey = (sourceFile: string, declaration: string): string => `${sourceFile}::${declaration}`;
const COVERED = new Set(SIMULATION_ENUM_GROUPS.map((group) => groupKey(group.sourceFile, group.declaration)));

describe('simulation enum message keys are internally consistent', () => {
  it('has no duplicate namespace, duplicate derived key, blank label or unexplained exemption', () => {
    expect(validateSimulationEnumGroups()).toEqual([]);
  });

  it('refuses a blank label, a duplicate namespace and an exemption with no stated reason', () => {
    expect(
      validateSimulationEnumGroups([
        { namespace: 'demo', sourceFile: 'a.ts', declaration: 'A', form: 'const-array', labels: { a: '  ' } },
        {
          namespace: 'demo',
          sourceFile: 'b.ts',
          declaration: 'B',
          form: 'const-array',
          labels: { b: 'B' },
          additionalIds: [{ id: 'b', reason: 'because' }],
        },
      ]),
    ).toEqual([
      { kind: 'empty-label', namespace: 'demo', id: 'a' },
      { kind: 'duplicate-namespace', namespace: 'demo' },
      { kind: 'unexplained-additional-id', namespace: 'demo', id: 'b' },
    ]);
  });

  it('derives every key from its id rather than letting one be written by hand', () => {
    expect(deriveSimulationMessageKey('need', 'hunger')).toBe('need.hunger.name');
    // Already qualified: `action.sleep` must not become `action.action.sleep`.
    expect(deriveSimulationMessageKey('action', 'action.sleep')).toBe('action.sleep.name');
    // Numeric ids are stringified, so `RiskTier` 3 still gets a stable key.
    expect(deriveSimulationMessageKey('risk-tier', 3)).toBe('risk-tier.3.name');
  });

  it('produces one message per labelled id, and every key is a valid catalog identifier', () => {
    const labelCount = SIMULATION_ENUM_GROUPS.reduce((total, group) => total + Object.keys(group.labels).length, 0);
    const keys = simulationEnumMessageKeys();

    expect(keys).toHaveLength(labelCount);
    for (const key of keys) {
      expect(key, `${key} is not an acceptable message-catalog key`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:/-]*\.name$/);
    }
  });

  it('keeps stable ids and translated text in separate namespaces (ADR 0011)', () => {
    for (const group of SIMULATION_ENUM_GROUPS) {
      for (const [id, label] of Object.entries(group.labels)) {
        expect(label, `${group.namespace}.${id} is labelled with its own id`).not.toBe(id);
      }
    }
  });
});

describe('every labelled group agrees with the source declaration it names', () => {
  it('names a real, still-present file inside the scanned roots', () => {
    for (const group of SIMULATION_ENUM_GROUPS) {
      expect(existsSync(join(REPOSITORY_ROOT, group.sourceFile)), `${group.sourceFile} does not exist`).toBe(true);
      expect(
        SCANNED_FILES.map(repoPath),
        `${group.sourceFile} is outside the scanned roots, so nothing would notice it changing`,
      ).toContain(group.sourceFile);
    }
  });

  it.each(SIMULATION_ENUM_GROUPS.map((group) => [group.namespace, group] as const))(
    '%s labels exactly the ids its declaration declares',
    (_namespace, group: SimulationEnumGroup) => {
      expect(validateSimulationEnumGroupSource(group, readSource(group.sourceFile))).toEqual([]);
    },
  );
});

/**
 * A line the discovery below stops seeing must *look* like a comment line to
 * a reader.
 *
 * Deliberately dumb, and deliberately not built on the scanner it checks: an
 * oracle that shared the scanner's idea of where a comment starts would agree
 * with it about the lines it got wrong, which is the whole failure mode of
 * #278 and #307. This one only asks what the line's first two characters are.
 */
const LOOKS_LIKE_A_COMMENT_LINE = /^(?:\/\/|\/\*|\*)/;

interface CorpusLine {
  readonly where: string;
  /** The line as written, trimmed. */
  readonly before: string;
  /** The same line after stripping, trimmed. `stripComments` preserves every newline, so the two index the same line. */
  readonly after: string;
}

const corpusLines: CorpusLine[] = [];
let corpusFilesWhoseLengthChanged = 0;

for (const file of SCANNED_FILES) {
  const source = readFileSync(file, 'utf8');
  const stripped = stripComments(source);
  if (stripped.length !== source.length) corpusFilesWhoseLengthChanged += 1;
  const where = repoPath(file);
  const before = source.split('\n');
  const after = stripped.split('\n');
  for (let index = 0; index < before.length; index += 1) {
    corpusLines.push({
      where: `${where}:${index + 1}`,
      before: before[index]!.trim(),
      after: (after[index] ?? '').trim(),
    });
  }
}

const blankedLines = corpusLines.filter((line) => line.before !== '' && line.after === '');
const survivingLines = corpusLines.filter((line) => line.after !== '');

describe('the enum discovery sees the whole corpus it claims to scan (#307)', () => {
  it('reads a corpus large enough for the two assertions below to mean something', () => {
    // Floors at the values measured when this gate was written. A gate over a
    // corpus is only as good as the corpus: a walk that silently collected
    // nothing, or a stripper that silently blanked everything, would satisfy
    // "no code line was blanked" perfectly.
    expect(
      SCANNED_FILES.length,
      'fewer .ts files under the scanned roots than when this floor was set; the walk is broken',
    ).toBeGreaterThanOrEqual(141);
    expect(
      blankedLines.length,
      'far fewer comment lines removed than when this floor was set; the stripper has stopped stripping',
    ).toBeGreaterThanOrEqual(6_900);
    expect(
      survivingLines.length,
      'far fewer code lines survive than when this floor was set; the stripper is eating the corpus',
    ).toBeGreaterThanOrEqual(13_000);
    // The old `stripSourceComments` failed exactly here: it replaced a block
    // comment with one space, so 116 of these 141 files came back a different
    // length and every offset and line number taken from the result was wrong.
    expect(
      corpusFilesWhoseLengthChanged,
      'stripping changed a file length, so offsets into the stripped text no longer index the source',
    ).toBe(0);
  });

  it('blanks no line that is not a comment line -- the #307 direction, which is silent', () => {
    const eaten = blankedLines.filter((line) => !LOOKS_LIKE_A_COMMENT_LINE.test(line.before));
    expect(
      eaten.map((line) => `${line.where}  ${line.before.slice(0, 100)}`),
      'a line of real code was blanked before the enum discovery below ever saw it. That discovery will not fail -- it will find fewer enums and stay green, which is #307',
    ).toEqual([]);
  });

  it('blanks every whole-line comment -- the other direction, which is loud but wrong', () => {
    const left = survivingLines.filter((line) => line.before.startsWith('//'));
    expect(
      left.map((line) => `${line.where}  ${line.after.slice(0, 100)}`),
      'a whole-line comment survived stripping, so prose discussing an enum now reads to the discovery as a declaration',
    ).toEqual([]);
  });

  it('exercises the oracle on both answers, so an empty violation list is not merely a filter that never matches', () => {
    expect(LOOKS_LIKE_A_COMMENT_LINE.test("'save.panel.title': 'Prisons',")).toBe(false);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test("export const NEED_IDS = ['hunger'] as const;")).toBe(false);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('// a line comment')).toBe(true);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('/** a doc comment')).toBe(true);
    expect(LOOKS_LIKE_A_COMMENT_LINE.test('* a continuation')).toBe(true);
  });

  it('reaches the span the old stripper blanked, rather than merely reaching the file', () => {
    // The 80 consecutive locale lines of `src/content/default-locale-en.ts`
    // that #307 measured as lost, named rather than counted: the phantom
    // block comment opened at the `src/persistence/**` in a `//` comment above
    // them and closed 173 lines later. A count alone would pass on a corpus
    // walk that had quietly stopped including this file.
    const localeFile = 'src/content/default-locale-en.ts';
    expect(SCANNED_FILES.map(repoPath), `${localeFile} is no longer in the scanned corpus`).toContain(localeFile);

    const stripped = stripComments(readSource(localeFile));
    for (const key of ['save.panel.title', 'save.action.create', 'brand.description']) {
      expect(stripped, `${key} is inside the span the two-pass stripper blanked and must survive stripping`).toContain(
        key,
      );
    }
  });
});

describe('no enum reaches the HUD without a group covering it', () => {
  const discovered = SCANNED_FILES.flatMap((file) =>
    findEnumShapedDeclarations(readFileSync(file, 'utf8')).map((declaration) => ({
      sourceFile: repoPath(file),
      ...declaration,
    })),
  );

  it('discovers the enums it is supposed to discover -- the scan is not silently matching nothing', () => {
    const names = discovered.map((entry) => groupKey(entry.sourceFile, entry.declaration));
    expect(discovered.length).toBeGreaterThan(20);
    expect(names).toContain('src/simulation/prisoners/needs.ts::NEED_IDS');
    expect(names).toContain('src/simulation/incidents/incident.ts::IncidentType');
    expect(names).toContain('src/simulation/prisoners/classification.ts::RiskTier');
    expect(names).toContain('src/content/room-catalog.ts::roomCategorySchema');
  });

  it('leaves every discovered enum either labelled or explicitly exempted', () => {
    const exempt = new Set(UNLABELLED.map((entry) => groupKey(entry.sourceFile, entry.declaration)));
    const unaccounted = discovered
      .map((entry) => groupKey(entry.sourceFile, entry.declaration))
      .filter((key) => !COVERED.has(key) && !exempt.has(key));

    expect(unaccounted).toEqual([]);
  });

  it('keeps the exemption list honest -- every entry still names a real enum with a real reason', () => {
    const discoveredKeys = new Set(discovered.map((entry) => groupKey(entry.sourceFile, entry.declaration)));
    for (const entry of UNLABELLED) {
      expect(
        discoveredKeys,
        `stale exemption: ${entry.declaration} is no longer a discovered enum in ${entry.sourceFile}`,
      ).toContain(groupKey(entry.sourceFile, entry.declaration));
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });
});

describe('the extraction rules are exercised, not merely trusted', () => {
  it('reads each declared form out of source text', () => {
    expect(extractEnumDeclarationIds("export const IDS = ['a', 'b'] as const;", 'IDS', 'const-array')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(extractEnumDeclarationIds("export type T = 'a' | 'b';", 'T', 'string-union')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(extractEnumDeclarationIds('export type T = 0 | 1 | 2;', 'T', 'numeric-union')).toEqual({
      ok: true,
      ids: ['0', '1', '2'],
    });
    expect(extractEnumDeclarationIds("export const S = z.enum(['a', 'b']);", 'S', 'zod-enum')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
    expect(
      extractEnumDeclarationIds(
        "export const S = z.discriminatedUnion('type', [z.object({ type: z.literal('a') }), z.object({ type: z.literal('b') })]);",
        'S',
        'zod-literal-union',
      ),
    ).toEqual({ ok: true, ids: ['a', 'b'] });
    expect(
      extractEnumDeclarationIds(
        "export const D: readonly X[] = [{ id: 'a', objectId: 'not-an-id' }, { id: 'b' }];",
        'D',
        'definition-id-field',
      ),
    ).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('reads a nested value list whole instead of stopping at the first inner bracket', () => {
    const source = "export const D: readonly X[] = [{ id: 'a', tags: ['x'] }, { id: 'b' }];";
    expect(extractEnumDeclarationIds(source, 'D', 'definition-id-field')).toEqual({ ok: true, ids: ['a', 'b'] });
  });

  it('refuses a union that is not purely literal rather than reporting a plausible subset', () => {
    expect(extractEnumDeclarationIds("export type T = 'a' | 'b' | string;", 'T', 'string-union')).toEqual({
      ok: false,
      reason: 'declaration-not-in-declared-form',
    });
  });

  it('reports a renamed or removed declaration instead of an empty id list', () => {
    expect(extractEnumDeclarationIds("export const OTHER = ['a'] as const;", 'IDS', 'const-array')).toEqual({
      ok: false,
      reason: 'declaration-not-found',
    });
  });

  it('ignores declarations that only appear inside comments', () => {
    expect(stripComments("// export const IDS = ['a'] as const;\nconst ok = 1;")).not.toContain('IDS');
    expect(findEnumShapedDeclarations("/* export type T = 'a' | 'b'; */\nconst ok = 1;")).toEqual([]);
  });

  it('still sees a declaration below a line comment containing a block-comment opener (#307)', () => {
    // The reported shape, at the size that matters: a `//` comment naming a
    // glob, then a real enum below it. Under the old two-regex stripper the
    // glob's `/` `*` opened a block comment that ran to the next terminator
    // anywhere below, so the declaration was blanked and discovery returned
    // nothing -- silently, because "no enum here" is a passing answer.
    const source = [
      '// ids thrown from `src/persistence/**` are diagnostics, never copy',
      "export const DEMO_IDS = ['a', 'b'] as const;",
      '/** and the terminator that closed the phantom block comment lives here. */',
      "export type DemoUnion = 'x' | 'y';",
    ].join('\n');

    expect(findEnumShapedDeclarations(source)).toEqual([
      { declaration: 'DEMO_IDS', form: 'const-array', ids: ['a', 'b'] },
      { declaration: 'DemoUnion', form: 'string-union', ids: ['x', 'y'] },
    ]);
    expect(extractEnumDeclarationIds(stripComments(source), 'DEMO_IDS', 'const-array')).toEqual({
      ok: true,
      ids: ['a', 'b'],
    });
  });

  it('would catch an id added to a declaration with no label, and a label for an id that no longer exists', () => {
    const group: SimulationEnumGroup = {
      namespace: 'demo',
      sourceFile: 'demo.ts',
      declaration: 'DEMO',
      form: 'const-array',
      labels: { a: 'A', removed: 'Removed' },
    };

    expect(validateSimulationEnumGroupSource(group, "export const DEMO = ['a', 'b'] as const;")).toEqual([
      { kind: 'missing-label', namespace: 'demo', id: 'b' },
      { kind: 'stale-label', namespace: 'demo', id: 'removed' },
    ]);
  });

  it('rejects an exemption for a value the source does declare, so the escape hatch cannot be left open', () => {
    const group: SimulationEnumGroup = {
      namespace: 'demo',
      sourceFile: 'demo.ts',
      declaration: 'DEMO',
      form: 'const-array',
      labels: { a: 'A', b: 'B' },
      additionalIds: [{ id: 'b', reason: 'x'.repeat(50) }],
    };

    expect(validateSimulationEnumGroupSource(group, "export const DEMO = ['a', 'b'] as const;")).toEqual([
      { kind: 'obsolete-additional-id', namespace: 'demo', id: 'b' },
    ]);
  });
});

describe('the derived keys resolve as real text through the localization runtime', () => {
  const localizer = new Localizer({ locale: 'en', catalogs: [defaultMessageCatalogEn] });

  it('resolves every derived key in the bundled default catalog, with no key falling back to itself', () => {
    const messages = simulationEnumMessages();
    expect(Object.keys(messages).length).toBeGreaterThan(0);

    for (const [key, text] of Object.entries(messages)) {
      expect(defaultLocaleEnCatalog.get(key), `${key} is missing from the default en catalog`).toBe(text);
      expect(localizer.has(key), `${key} does not reach the localization runtime`).toBe(true);
      expect(localizer.format(key)).not.toBe(key);
    }
  });

  it('goes through the pseudo-locale like every other key rather than bypassing it (ADR 0011)', () => {
    const pseudo = buildPseudoLocaleCatalog(defaultMessageCatalogEn);
    const pseudoLocalizer = new Localizer({ locale: PSEUDO_LOCALE, catalogs: [defaultMessageCatalogEn, pseudo] });

    for (const [key, english] of Object.entries(simulationEnumMessages())) {
      const pseudoText = pseudoLocalizer.format(key);
      expect(pseudoText, `${key} is not pseudo-localized`).not.toBe(english);
      expect(pseudoText.startsWith('⟦') && pseudoText.endsWith('⟧'), `${key} is not bracketed`).toBe(true);
    }

    // A HUD reading a label through `deriveSimulationMessageKey` gets the
    // pseudo-locale automatically -- which is the point: the enum labels are
    // now testable for truncation like every other string.
    expect(pseudoLocalizer.format(deriveSimulationMessageKey('incident-type', 'riot'))).toContain('Ř');
  });
});
