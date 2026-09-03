import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { pressAffordabilityVerdict } from '../affordability';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { describeBy, element, eyebrowText, nextUiId, undescribeBy, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createPanel } from '../primitives/panel';
import { createStatusBadge, type BadgeTone } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudCountsViewModel,
  HudHeldGuardViewModel,
  HudHeldGuardsViewModel,
  HudLocalizer,
  HudStaffCoverageViewModel,
  HudStaffRoleViewModel,
  HudStaffRosterRowViewModel,
  HudStaffRosterViewModel,
  HudStaffViewModel,
} from './view-model';

/**
 * The Staff panel, on the Security tab
 * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)).
 *
 * ### Why it is here and not on the Build panel
 *
 * Three of the four tabs render no panel at all: `mountHud` builds one panel
 * for the rail's `.hud__side` slot and shows it on `build` alone. So a panel
 * on the Security tab competes with nothing, and the height budget the Build
 * panel has been fixed for twice (#143, #174) is simply not a constraint on
 * it -- the two are never laid out at the same time.
 *
 * The alternative was a disclosure on the Build panel in the shape #282 gave
 * the buy control. ADR 0025 records why not, and the short version is
 * measured rather than argued: a third button in `.hud-build__actions`
 * overflows that panel horizontally by 37.9px, and a guard is not made of the
 * material the selected buildable is made of, so hanging hiring off the
 * current selection would make the Build panel's own organising idea false.
 *
 * ### What it holds
 *
 * A list of the roles that can be hired and one action -- and, since
 * [ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md), a second
 * section listing the guards that are **held**, with what is holding each and a
 * control that releases it.
 *
 * Since [ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md), a
 * block above both saying how many guards the prison **asks for** against how
 * many it has. That ADR's own Consequences record why it is here: the
 * requirement rising from one to two at the ninth prisoner is the clearest
 * warning the simulation produces, and until this block it was computed and
 * rendered nowhere -- so a player could cause a riot and prevent one, and could
 * not watch one approaching. It is on *this* panel because the diagnosis and
 * the cure belong together: the sentence says how many more to hire and the
 * control that hires them is two blocks down.
 *
 * That second section narrows this panel's own "**it is not a roster**" claim
 * and the narrowing is deliberate rather than accidental, so it is stated: the
 * held list is still not the roster. It is the *held subset*, it is windowed to
 * `HELD_GUARD_ROW_LIMIT` rows, and it exists because a release command needs
 * something to aim at -- the same reason the Build panel grew a queue block for
 * `CancelBuildOrder` and a delivery list for `CancelMaterialPurchase`. Listing
 * every guard hired, with names, roles, clearances and coverage, is still
 * `projectStaff`'s job and still has no surface here.
 *
 * **Why this panel and not the Build panel.** Because guards are here. The Build
 * panel's catalogue is the only block `hud.css` lets that panel take height from
 * and ADR 0031 spends part of it already (#390); more to the point, a guard is
 * not a building, and hanging a staffing control off the selected buildable
 * would make that panel's organising idea false -- the same argument ADR 0025
 * made when it put hiring here. Releasing and hiring are the two things a player
 * does to the roster, and they belong on one panel.
 *
 * ### Boundaries
 *
 * A *composer*, exactly like the Build panel. It holds which role is selected
 * and turns a press into an intent; it knows no wage table, no catalogue and
 * no command. Every figure it renders arrives on `HudStaffViewModel`, and the
 * charge on the button is the simulation's own `staffHireCostMinorUnits`
 * passed through by the composition root -- so the number the player reads and
 * the number the treasury is debited have one definition. It imports nothing
 * from `src/simulation/**`.
 */

/** What one press of the hire control asks for: an id and nothing else. */
export interface StaffPanelHireIntent {
  readonly staffRoleId: string;
}

/**
 * How many held guards the list shows at once.
 *
 * Three, matching `PENDING_DELIVERY_ROW_LIMIT`, and the rows are **pooled** for
 * both of that constant's reasons -- the second of which is not about
 * allocation: each row's Release button joins the HUD's busy group,
 * `createBusyGroup` has `add` and no `remove`, so a section that built a row per
 * guard would grow that group without bound over a session and keep every dead
 * button in it.
 *
 * Three, and it is measured rather than borrowed. On the assembled page, Security
 * tab, three rows plus the "and N more" line, every Release is **85.0x44.0 with an
 * `offsetParent`, inside the panel, above the fold** at 1440x900, 1280x720,
 * 1024x768, 900x600 and 375x812 -- the tightest being 900x600, where the last
 * Release's bottom edge is 483.0px against a 522.0px fold, with the block costing
 * 219.0px of a 467.0px panel and 25.0px of scroll going to the roles list above
 * it. **A fourth row puts its Release 9.0px below that fold** (531.0 against
 * 522.0) with a full box and an `offsetParent`, which is #220's shape and #285's
 * fourth delivery row to within a pixel -- reachable only by scrolling a panel a
 * player has no reason to think has more in it. That is why the limit is three.
 *
 * The panel can afford the height at all for a reason that is ADR 0025's and is
 * inherited rather than re-derived: `mountHud` builds one panel for the rail's
 * `.hud__side` slot and shows exactly one of Build, Rooms, Staff and Intake, so
 * the Staff panel is never laid out beside the Build panel and the height budget
 * that panel has been fixed for twice (#143, #174) is not a constraint on it.
 * `.ui-panel.hud-staff` already carries `overflow-y: auto`, so what the rail
 * cannot give it is its own to scroll. Measured arrival cost with nothing held:
 * **nothing at all** -- the block has no box until the first `hud/held-guards`
 * reply, so the panel is 298.0px (273.0px at 900x600) either way.
 */
export const HELD_GUARD_ROW_LIMIT = 3;

/**
 * How many roster rows the dismiss block shows at once (issue #533).
 *
 * **Three, and it is inherited rather than re-measured, which is stated because
 * inheriting a measurement is the thing this repository has been burned by.**
 * `HELD_GUARD_ROW_LIMIT` above carries a real measurement -- three rows plus the
 * overflow line, every control above the fold at five viewports, a fourth row
 * 9.0px below it at 900x600 -- and this block is that block's shape: the same
 * row height, the same button, the same overflow line, on the same panel. What
 * is *not* inherited is the arrival cost, and that is why this block is
 * **collapsed when it appears** rather than open: a second three-row list under
 * the first would put the second one's controls exactly where the fourth held
 * row was measured to be. Collapsed, the block costs its header and nothing
 * else, which is the answer `.hud-build__queue` already gave to the identical
 * problem (`unconsumed-command-contract.test.ts` records it: *"the block being
 * `hidden` while nothing is queued and collapsed when it appears, so the
 * panel's arrival height is unchanged"*).
 *
 * **The fold measurement for the expanded block has not been taken**, because
 * this environment has no browser and `vitest.config.ts` is `environment:
 * 'node'`. The claim made here is therefore the weaker one it can support: the
 * *arrival* height is unchanged, which is checkable from the collapse alone, and
 * the expanded height is the browser job's to confirm. Saying so is cheaper than
 * a measurement nobody took.
 */
export const STAFF_ROSTER_ROW_LIMIT = 3;

/** What one press of a dismiss control asks for: a staff id and nothing else. */
export interface StaffPanelDismissIntent {
  readonly staffId: number;
}

/**
 * What one press of a release control asks for: a guard id and nothing else.
 *
 * **No claim.** The row knows what is holding the guard, because it says so, and
 * it does not send that back: which claimant to ask is resolved inside the
 * simulation at the tick the command executes, for the reason ADR 0034 gives at
 * length -- `'on-search'` is a shared phase and this thread's copy of the roster
 * is a cadence old.
 */
export interface StaffPanelReleaseIntent {
  readonly guardId: number;
}

export interface StaffPanelOptions {
  readonly localizer: HudLocalizer;
  readonly model: HudStaffViewModel;
  /** Hire the selected role, at the charge the button states. */
  readonly onHire: (intent: StaffPanelHireIntent) => void;
  /** Release one held guard from whatever is holding it (ADR 0034). */
  readonly onRelease: (intent: StaffPanelReleaseIntent) => void;
  /** End one staff member's employment (issue #533). */
  readonly onDismiss: (intent: StaffPanelDismissIntent) => void;
}

/**
 * What one row says: who, and what is holding them.
 *
 * Pure and exported for the reason `formatPendingDeliveryText` is: the default
 * Vitest environment is `node` (`docs/TESTING.md`), so nothing headless can call
 * `createStaffPanel`, and "what the panel says is holding this guard" is exactly
 * the claim that has to be assertable over real text from a real catalog.
 *
 * A guard the host names no role for still gets a row and still says what holds
 * it, because it is still a guard a player may want back -- the rule
 * `HudPendingDeliveryViewModel.labelKey` sets one panel over. What changes is the
 * sentence: `hud.security.held-row-unnamed` names the entity id instead, so the
 * row is still aimable rather than anonymous.
 */
export function formatHeldGuardText(
  t: (key: LocalizationKey, parameters?: MessageParameters) => string,
  guard: HudHeldGuardViewModel,
): string {
  const claim = t(guard.claimLabelKey);
  return guard.roleLabelKey === undefined
    ? t(HUD_MESSAGE_KEY.securityHeldRowUnnamed, { id: guard.entityId, claim })
    : t(HUD_MESSAGE_KEY.securityHeldRow, { name: t(guard.roleLabelKey), claim });
}

/**
 * What the coverage block says, decided in one pure function
 * ([ADR 0048](../../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1).
 *
 * Exported and pure for `formatHeldGuardText`'s reason and it applies harder
 * here: the default Vitest environment is `node` (`docs/TESTING.md`), so
 * nothing headless can call `createStaffPanel`, and *which of three things the
 * panel tells the player about their staffing* is the whole of what this change
 * adds. A rule that only ran inside a DOM builder would be unreachable from
 * `pnpm test` rather than merely untested, which is the trap
 * `orderPrisonsForDisplay` was extracted to escape.
 *
 * ### The three states, and why three
 *
 * `occupancyTone` is the precedent and it has two steps for one metric --
 * `>= 0.9` warning, `> 1` danger -- because the second names a *different*
 * prison rather than more of the first. The same is true here, and ADR 0048
 * decision 5's measured ladder is where the boundary comes from rather than
 * taste: *"A prison missing toilets, showers and a yard riots **only if it is
 * also unguarded** -- one hire is the whole of the difference."* So a prison
 * with nobody on duty is not a worse version of an understaffed one; it is the
 * rung where the cheapest possible action changes the outcome, and it gets its
 * own word.
 *
 * - **Unguarded** (`danger`): the prison asks for guards and has assigned none.
 * - **Understaffed** (`warning`): it has some of what it asks for.
 * - **Covered** (`success`): it has all of it.
 *
 * A `success` tone for the third rather than no tone, which is where this
 * departs from `occupancyTone` deliberately. That function returns `undefined`
 * below its warning band because *"a status strip where several things are
 * always amber teaches players to ignore amber"* -- an argument about a strip
 * of seven chips competing for one glance. This is one block on one panel a
 * player opened to look at staffing, and the shape it follows is the Incidents
 * chip's green "Clear": a block that says nothing when all is well is
 * indistinguishable from one that has not loaded.
 *
 * ### What it deliberately does not say
 *
 * **Not "a riot is coming".** Measured on this tree: a 12-bed prison holding 12
 * with one guard sits at a shortage of 1 for 30,000 ticks and never riots,
 * while the same prison holding 16 with one guard riots at tick 13,400 and
 * stops entirely at two guards. A shortage is a real and actionable fact about
 * staffing; it is not a prediction, and a sentence promising one would be false
 * in the first of those prisons.
 *
 * ### What it now does say, on the bottom rung only
 *
 * `consequenceKey` is the owner's chosen sentence of 2026-09-03 --
 * *"No guard is posted here, so nobody in this sector is kept safe."* -- and
 * it is here rather than in a fourth branch because it is a second thing
 * about the *same* rung: `hintKey` names the press that fixes it and this
 * names what is being paid until somebody presses.
 *
 * **It does not contradict the paragraph above, and the paragraph above is
 * what made it possible to write.** An earlier wording of the owner's, *"so
 * nothing stops an incident in this sector"*, was refused on this docblock's
 * own grounds with the measurements in #848 and PR #854; guard presence is an
 * amplifier and not a gate, so no coverage sentence may promise anything
 * about an incident. What an empty post *does* zero is the safety
 * provisioning: `SAFETY_COVERAGE_PROVISION_MULTIPLIER.unguarded` is `0`
 * against a `safety` decay of 0.05 a tick, a net -0.05 that is 4,080 ticks
 * from full to the level the state withholds against, and nothing else in the
 * simulation puts `safety` back (both actions that used to were removed for
 * that reason, issue #588). So the sentence names a need that stops being
 * provisioned, which is a fact, rather than an outcome, which would be the
 * prediction this docblock refuses.
 *
 * **`undefined` on the other two rungs**, and that is the multiplier rather
 * than a choice about emphasis: `understaffed` provisions at half and still
 * costs a long-stayer their safety over 20,400 ticks, but at a different rate
 * needing a different verb, and `covered` provisions at a surplus. A sentence
 * reused across all three would be false on one of them.
 */
export interface StaffCoverageReadout {
  readonly tone: BadgeTone;
  /** The word beside the colour, so the colour never stands alone. */
  readonly badgeKey: LocalizationKey;
  /** The sentence under it: the action where there is one, the state where there is not. */
  readonly hintKey: LocalizationKey;
  /**
   * A second sentence saying what the rung *costs*, where the cost is total
   * and stateable -- the `unguarded` rung and no other. Absent, not
   * present-and-`undefined`, because `exactOptionalPropertyTypes` is on and
   * the two other branches have nothing to say here rather than a nothing to
   * say it with.
   */
  readonly consequenceKey?: LocalizationKey;
  /**
   * How many more hires clear the shortage -- the projection's own summed
   * figure, not `required - assigned`. Zero when nothing is short, and then it
   * fills no placeholder because `securityCoverageMetHint` declares none.
   */
  readonly hireCount: number;
}

export function describeStaffCoverage(coverage: HudStaffCoverageViewModel): StaffCoverageReadout {
  // Nobody on duty anywhere, in a prison that asks for somebody. Checked first
  // because it is a *subset* of "short" rather than an alternative to it, and
  // the more specific sentence is the one worth saying.
  if (coverage.required > 0 && coverage.assigned <= 0) {
    return {
      tone: 'danger',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageUnguarded,
      hintKey: HUD_MESSAGE_KEY.securityCoverageUnguardedHint,
      consequenceKey: HUD_MESSAGE_KEY.securityCoverageUnguardedConsequence,
      hireCount: coverage.shortage,
    };
  }
  if (coverage.shortage > 0) {
    return {
      tone: 'warning',
      badgeKey: HUD_MESSAGE_KEY.securityCoverageShort,
      hintKey: HUD_MESSAGE_KEY.securityCoverageShortHint,
      hireCount: coverage.shortage,
    };
  }
  // Includes a prison that asks for nobody: a `DeploymentSchedule` of zero is an
  // *exemption* a save can carry (ADR 0048 decision 3), and "this prison has the
  // guards it asks for" is true of a prison that asks for none.
  //
  // **This comment used to end "It is not reachable from
  // `applyDefaultSecuritySector`, which authors a floor of one", and that is no
  // longer true** (issue #533). The floor is still one, but
  // `resolveOccupancyScaledGuardCount` now answers `0` for a sector holding
  // nobody, so this branch is what an *empty* prison reads -- the ordinary
  // state of a session a player has just started, rather than a case only a
  // hand-edited save reaches. Nothing here changes: the branch was already
  // correct for `required: 0`, and that it needed no new sentence is the check
  // that #533 changed a demand rather than a promise.
  return {
    tone: 'success',
    badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
    hintKey: HUD_MESSAGE_KEY.securityCoverageMetHint,
    hireCount: 0,
  };
}

/**
 * The two figures the hire hint quotes, or `undefined` where no role is
 * selected and there is nothing to quote (issue #639 ruling 2).
 *
 * ## Why this is a function at all
 *
 * Because `vitest.config.ts` is `environment: 'node'` with no jsdom, so nothing
 * headless can call `createStaffPanel` and the sentence the panel assembles is
 * unreachable from `pnpm test`. `describeStaffCoverage` above exists for the
 * same reason and this follows it: the decision is proven here, and that the
 * DOM around it is really built is proven in
 * `tests/browser/ui-staff-wage.spec.ts`.
 *
 * ## Why it does not derive the second number from the first
 *
 * `hud.security.hire-hint` reads *"Costs {total} now and {wage} a day in
 * wages."* Both come off the role the host published, and `{wage}` is a field
 * of its own rather than `hireChargeMinorUnits` a second time. That the two
 * hold one number today is `src/simulation/economy/wages.ts`'s doing --
 * `staffHireCostMinorUnits` and `staffDailyWageMinorUnits` both delegate to
 * `staffDailyWageForRole`, which is the one expression in `src/` that says
 * which end of an authored band is money owed. Re-asserting it here would put
 * a second authority on a price in the HUD, which ADR 0017 decision 5 puts
 * with issue #29, and it would keep saying it after that module stopped being
 * true.
 *
 * `undefined` rather than a pair of zeros when nothing is selected: the hire
 * control is disabled in that state and a sentence quoting `0` would be a
 * price the prison does not charge.
 */
export interface StaffHireChargeReadout {
  /** What one press spends now -- the same figure the button's `· N` renders. */
  readonly hireChargeMinorUnits: number;
  /** What the payroll bills for the same person at every day boundary after that. */
  readonly dailyWageMinorUnits: number;
}

export function describeHireCharge(role: HudStaffRoleViewModel | undefined): StaffHireChargeReadout | undefined {
  if (role === undefined) return undefined;
  return { hireChargeMinorUnits: role.hireChargeMinorUnits, dailyWageMinorUnits: role.dailyWageMinorUnits };
}

/**
 * The standing daily wage bill the collapsed `On the payroll` header states, or
 * `undefined` where there is nothing to state (issue #639 ruling 2).
 *
 * ## What it is for
 *
 * `dailyWageBillMinorUnits` has crossed the protocol since ADR 0042 step 3 and
 * had **no reader in `src/ui/`** until this block. The section it goes on is
 * `collapsed: true`, so a prison of sixty guards billing 4,800 a day showed the
 * player a shut fold and a coverage block reading *"Covered / This prison has
 * the guards it asks for"* while the balance fell. A trailing badge on a shut
 * header is the one place a figure survives the fold, which is the mechanism
 * the Build panel's queue header already uses.
 *
 * ## The two absences, which are different facts
 *
 * - **No roster, or nobody on it.** There is no payroll, so there is no bill,
 *   and the section itself has no box either (`paintRoster`).
 * - **A roster, and no counts published yet.** The prison employs somebody and
 *   this thread has not been told what they cost. A `0` here would say the
 *   payroll is free, which is the class of claim issue #639 exists to stop.
 *
 * A published `0` with somebody hired is **not** an absence: it is a real state
 * -- a save written against a catalogue that has since dropped a role bills
 * nothing for that role (`dailyWageBillMinorUnits` in
 * `src/simulation/economy/payroll.ts` contributes `0` rather than guessing) --
 * and stating it is how a player finds out.
 */
export function describeDailyWageBill(
  roster: HudStaffRosterViewModel | undefined,
  dailyWageBillMinorUnits: number | undefined,
): number | undefined {
  if (roster === undefined || roster.hired === 0) return undefined;
  return dailyWageBillMinorUnits;
}

/**
 * What one roster row says: who, and what they are doing.
 *
 * Pure and exported for `formatHeldGuardText`'s reason -- nothing headless can
 * call `createStaffPanel`, so the sentence has to be assertable over real text
 * from a real catalog.
 *
 * It reuses `hud.security.held-row` and `hud.security.held-row-unnamed` rather
 * than drafting two more, which is a decision with a stated cost: those keys
 * name their second placeholder `claim`, and what fills it here is a
 * *deployment phase*. The rendered sentence is the same shape and the same fact
 * about a person on a row -- `Guard · On Post` -- so two keys would be two
 * strings translated identically, and the mismatch is in the placeholder's name
 * alone. It is recorded here and in `messages.ts` rather than papered over.
 */
export function formatStaffRosterText(
  t: (key: LocalizationKey, parameters?: MessageParameters) => string,
  staff: HudStaffRosterRowViewModel,
): string {
  const claim = t(staff.statusLabelKey);
  return staff.roleLabelKey === undefined
    ? t(HUD_MESSAGE_KEY.securityHeldRowUnnamed, { id: staff.entityId, claim })
    : t(HUD_MESSAGE_KEY.securityHeldRow, { name: t(staff.roleLabelKey), claim });
}

export interface StaffPanel {
  readonly element: HTMLElement;
  /**
   * The controls to disable while a command is in flight -- the one button
   * that issues one, and nothing else.
   *
   * Choosing a role is *chrome*: it changes what the next hire would say and
   * asks the host for nothing, so disabling it alongside the command would
   * drop an interaction the host has no part in. Same rule as
   * `BuildPanel.controls`.
   */
  readonly controls: readonly HTMLButtonElement[];
  /**
   * The hire button, so a refused hire is reported *on the control that was
   * pressed* (issue #207) as well as in the refusal line.
   */
  readonly hireControl: HTMLButtonElement;
  /**
   * The release buttons, in row order, so a test can press one without reading
   * the DOM and the host can gate them with the hire control.
   *
   * Fixed length (`HELD_GUARD_ROW_LIMIT`) because the rows are pooled: a button
   * whose row is hidden is present and disabled rather than absent.
   */
  readonly releaseControls: readonly HTMLButtonElement[];
  /**
   * The dismiss buttons, in row order, on `releaseControls`' terms and for its
   * reasons -- fixed length (`STAFF_ROSTER_ROW_LIMIT`) because the rows are
   * pooled, so a button whose row is hidden is present and disabled rather than
   * absent.
   */
  readonly dismissControls: readonly HTMLButtonElement[];
  /** Current selection, exposed so a test can assert it without reading the DOM. */
  getSelection(): string | undefined;
  /**
   * Repaint the held list from a fresh `hud/held-guards` reply.
   *
   * `undefined` hides the section, and it is a different state from an empty
   * list: "nothing has asked yet" must not render as "nobody is assigned", which
   * is the same distinction `BuildPanel.setPendingDeliveries` draws.
   */
  setHeldGuards(held: HudHeldGuardsViewModel | undefined): void;
  /**
   * Repaint the coverage block from a fresh `hud/staff` reply (ADR 0048).
   *
   * `undefined` hides it, and it is a different state from a shortage of zero:
   * "nothing has asked yet" must not render as "this prison has the guards it
   * asks for", which is the same distinction `setHeldGuards` draws one method
   * up and the reason both are `| undefined` rather than defaulted.
   */
  setCoverage(coverage: HudStaffCoverageViewModel | undefined): void;
  /**
   * Repaint the roster block from a fresh `hud/staff` reply (issue #533).
   *
   * `undefined` hides the section, and it is a different state from an empty
   * roster, on `setHeldGuards`' terms: "nothing has asked yet" must not render
   * as "nobody is hired", because only the second is a statement about the
   * prison -- and only the second is a state in which there is nothing to
   * dismiss.
   */
  setStaffRoster(roster: HudStaffRosterViewModel | undefined): void;
  /**
   * Repaint the roster header's standing daily wage bill, from the last
   * `simulation/status-counts` publication (issue #639 ruling 2).
   *
   * `undefined` states nothing, and it is a different fact from `0` on the same
   * terms every setter above draws: nothing has published counts yet, against a
   * prison whose payroll really does bill nothing. Separate from
   * `setStaffRoster` because the two figures arrive on different channels --
   * one pulled over `hud/staff`, one published on the counts stream -- and a
   * single setter would have to invent whichever half had not arrived.
   */
  setDailyWageBill(dailyWageBillMinorUnits: number | undefined): void;
  /**
   * The two treasury figures the hire button's availability is judged
   * against: `treasuryMinorUnits` and `roomCapacity`, published on every
   * `simulation/status-counts` tick and passed straight through -- the panel
   * decides the comparison (`pressAffordabilityVerdict`, the same one
   * `src/main.ts` judges the `hire-staff` press itself with), this line
   * decides nothing. `BuildPanel.setTreasury` is the same setter for the same
   * reason on the Buy button (issue #772); the two controls are judged by one
   * function so a disabled button and a refused press cannot drift apart.
   *
   * The full `HudCountsViewModel` rather than two bare numbers, because it is
   * the type the composition root already produces every tick and a fresh
   * two-field type here would be a second shape for the same publication to
   * be translated into on its way from `hud.ts` to this panel.
   *
   * **Separate from `setDailyWageBill` above, which reads the same
   * publication.** That setter takes `number | undefined` because absence is a
   * real state it has to render differently from `0` -- a shut fold states
   * nothing until counts have arrived. Affordability has no such state: the
   * button starts available at the "nothing published yet" default below,
   * which is what a HUD with no session behind it has always shown, and
   * folding the
   * two into one setter would make a wage bill that has not arrived and a
   * balance that has not arrived the same fact.
   */
  setTreasury(counts: HudCountsViewModel): void;
  setVisible(visible: boolean): void;
}

export function createStaffPanel(options: StaffPanelOptions): StaffPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.roles[0]?.staffRoleId;

  const selectedRole = () => model.roles.find((role) => role.staffRoleId === selectedId);

  /**
   * The two treasury figures a hire's affordability is judged against,
   * published on every `simulation/status-counts` tick and held here between
   * publications so a change of selected role alone can repaint the hire
   * button without waiting for the next one.
   *
   * Zeroed and unfurnished-unknown until the first `setTreasury` call, which
   * is the same "nothing published yet" reading `EMPTY_HUD_VIEW_MODEL.counts`
   * gives every other figure on this HUD -- and at that default a hire is
   * affordable, so the button starts available, which is what this panel
   * showed before it read a balance at all. `BuildPanel`'s own pair is the
   * same two variables for the same reason.
   */
  let treasuryMinorUnits = 0;
  let treasuryRoomCapacity: number | undefined;

  // ---- what the prison asks for, against what it has (ADR 0048) --------
  /*
   * First in the panel body, and the position is load-bearing rather than
   * aesthetic. The held block below it was measured at 219.0px of a 467.0px
   * panel at 900x600, which is the tightest viewport `HELD_GUARD_ROW_LIMIT`
   * was fixed against; a block appended under that one would be the fourth
   * delivery row's problem again (#220, #285), reachable only by scrolling a
   * panel a player has no reason to think has more in it. A block *above*
   * everything cannot be pushed below the fold by anything below it, and the
   * region that gives up the height is `.hud-staff__list`, which already
   * scrolls and already has a floor.
   *
   * Two lines, deliberately: a header pairing the block's name with the pair of
   * figures, and one sentence. It is the smallest thing that lets a player act,
   * because the action it names is the button two blocks down.
   *
   * **Three on the bottom rung, since the owner's wording of 2026-09-03**, and
   * the "deliberately" above is amended rather than overwritten because the
   * reason it said two has not gone away. `coverageConsequence` is a
   * *third* line and it is there only while `describeStaffCoverage` returns a
   * `consequenceKey`, which is the `unguarded` rung alone -- a state one press
   * of the button two blocks down leaves for good. So the block a player lives
   * with is still two lines; the third arrives exactly where the smallest thing
   * that lets a player act is no longer the whole of what they need to know,
   * and the height it costs comes out of `.hud-staff__list`, which already
   * scrolls and already has a floor.
   *
   * It is its own element rather than a second clause run on after the hint,
   * following `hud.security.hire-unassigned` -- the note whose own exemption in
   * the `@media (max-height: 700px)` block records what a run-on sentence
   * measured there: `scrollHeight` 26 against `clientHeight` 13 at 900x600,
   * with the trailing clause the one that was cut. A state-and-consequence
   * sentence read to *"so nobody in this"* is worse than absent, so it carries
   * `.hud-staff__coverage-consequence` and is exempted from the one-line clamp
   * the same way.
   */
  const coverageSummary = valueText('', 'hud-staff__coverage-summary');
  const coverageBadge = createStatusBadge({ tone: 'neutral', text: '' });
  const coverageHint = eyebrowText('', 'hud-staff__note');
  const coverageConsequence = eyebrowText('', 'hud-staff__note hud-staff__coverage-consequence');

  const coverageBlock = element('div', {
    className: 'hud-staff__coverage',
    children: [
      element('div', {
        className: 'hud-staff__coverage-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.securityCoverageTitle)), coverageSummary, coverageBadge.element],
      }),
      coverageHint,
      coverageConsequence,
    ],
  });
  /*
   * No initial `hidden` here, for the reason `.hud-staff__held` states:
   * `paintCoverage` runs once below the `panel.body.append` and is the single
   * authority on whether this block has a box. A second assignment would be a
   * line no test could fail on.
   */

  let coverage: HudStaffCoverageViewModel | undefined;

  function paintCoverage(): void {
    coverageBlock.hidden = coverage === undefined;
    if (coverage === undefined) {
      delete coverageBlock.dataset['tone'];
      return;
    }

    const readout = describeStaffCoverage(coverage);
    // The block's own handle for a browser probe, in the shape `data-held` and
    // `data-guard` already use one section down: it lets a spec assert *which of
    // the three states the panel decided* without matching translated text, so
    // the assertion survives a reworded sentence. No stylesheet reads it -- the
    // colour is the badge's, and the badge carries the word beside it.
    coverageBlock.dataset['tone'] = readout.tone;
    coverageSummary.textContent = t(HUD_MESSAGE_KEY.securityCoverageSummary, {
      assigned: localizer.formatNumber(coverage.assigned),
      required: localizer.formatNumber(coverage.required),
    });
    coverageBadge.update({ tone: readout.tone, text: t(readout.badgeKey) });
    coverageHint.textContent =
      readout.hireCount > 0
        ? t(readout.hintKey, { count: localizer.formatNumber(readout.hireCount) })
        : t(readout.hintKey);
    /*
     * Emptied as well as hidden. `.hud-staff__note[hidden]` in `./hud.css`
     * makes the attribute stick under the author `display` the short-viewport
     * block sets, so the box does go away -- but a sentence left in the text
     * node is still in the accessibility tree of some readers and is still
     * found by a spec matching on text, and "no guard is posted here" is
     * exactly the sentence that must not be readable in a prison that has
     * guards posted. The same belt-and-braces `paintHeld` uses one block down.
     */
    const consequenceKey = readout.consequenceKey;
    coverageConsequence.hidden = consequenceKey === undefined;
    coverageConsequence.textContent = consequenceKey === undefined ? '' : t(consequenceKey);
  }

  // ---- who to hire ---------------------------------------------------
  const roleList = element('div', { className: 'hud-staff__list' });
  const rows = new Map<string, ListRow>();

  const paintRoles = (): void => {
    for (const [id, row] of rows) {
      row.setBadge(id === selectedId ? { tone: 'info', text: t(HUD_MESSAGE_KEY.securityStaffSelected) } : undefined);
      row.element.dataset['selected'] = id === selectedId ? 'true' : 'false';
    }
  };

  for (const role of model.roles) {
    const row = createListRow({
      icon: 'staff',
      label: t(role.labelKey),
      onActivate: () => {
        selectedId = role.staffRoleId;
        paintRoles();
        paintHire();
      },
    });
    row.element.dataset['staffRole'] = role.staffRoleId;
    rows.set(role.staffRoleId, row);
    roleList.append(row.element);
  }

  // An empty list must say so. A blank rectangle is indistinguishable from a
  // broken one -- the same rule the Build catalogue follows.
  if (model.roles.length === 0) {
    roleList.append(createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.securityStaffRolesEmpty) }).element);
  }

  const roles: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.securityStaffRoles),
    onToggle: (collapsed) => roles.setCollapsed(collapsed),
  });
  // Named so `hud.css` can say which section grows with the content
  // catalogue and therefore which one scrolls, exactly as
  // `.hud-build__catalogue` is.
  roles.element.classList.add('hud-staff__roles');
  roles.body.append(roleList);

  // ---- hiring --------------------------------------------------------
  const hire: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.securityStaffHire, { role: '', total: '' }),
    tone: 'primary',
    icon: 'staff',
    disabled: selectedId === undefined,
    onActivate: () => {
      const role = selectedRole();
      // Unreachable while the button is disabled without a selection, and
      // returning rather than asserting keeps a hire of `undefined`
      // impossible rather than merely unlikely.
      if (role === undefined) return;
      options.onHire({ staffRoleId: role.staffRoleId });
    },
  });
  hire.element.classList.add('hud-staff__hire');

  /*
   * The sentence under the button, and it is **painted** rather than set once
   * at mount (issue #639 ruling 2).
   *
   * It used to be a constant -- `eyebrowText(t(HUD_MESSAGE_KEY.securityStaffHint))`
   * built inline in the `panel.body.append` below -- because it quoted no
   * figure. It quotes two now, and both belong to whichever role is selected,
   * so it repaints on exactly the occasions the button's own label does. A
   * hint that kept the first role's price while the button showed the second's
   * would be the same defect one line lower.
   *
   * Its own class beside `.hud-staff__note`, for `.hud-staff__held-more`'s
   * reason: the panel has several notes and a spec needs to name this one
   * without depending on document order.
   */
  const hireNote = eyebrowText('', 'hud-staff__note hud-staff__hire-note');

  /*
   * What the press gets you, on a line of its own (issue #639 ruling 2, the
   * owner's ruling of 2026-08-30).
   *
   * This sentence used to be the second half of `hud.security.hire-hint` and
   * was displaced when the approved wording took the whole of that value. It is
   * **a separate element and not a second sentence in `hireNote`** because
   * `@media (max-height: 700px)` clamps `.hud-staff__note` to one line: run
   * together the two measured `scrollHeight` 26 against `clientHeight` 13 at
   * 900x600, so the clause that survived was the price and the clause that was
   * cut was the one telling the player their new guard is posted nowhere.
   * `.hud-staff__hire-unassigned` is exempted from that clamp in `hud.css`,
   * which is the shape PR #647 uses for the Build panel's restored clock note
   * and is taken for its reason.
   *
   * Set once rather than painted: it quotes no figure, so unlike `hireNote`
   * above there is nothing about it that a change of selection can falsify. It
   * is the shape this whole block had before the hint carried parameters.
   */
  const hireUnassignedNote = eyebrowText(
    t(HUD_MESSAGE_KEY.securityStaffUnassigned),
    'hud-staff__note hud-staff__hire-unassigned',
  );

  /*
   * **What stops a hire, and what would lift it** -- the wording half of
   * issue #772's class, on the owner's sentence of 2026-09-03
   * (`hud.security.hire-shortfall`, byte-identical to the Buy button's).
   *
   * A line of its own, on `build-panel.ts`'s reasoning for the twin of this
   * element and on this panel's own precedent one element up:
   * `hireUnassignedNote` is a separate element rather than a second sentence
   * inside `hireNote` because `@media (max-height: 700px)` clamps
   * `.hud-staff__note` to one line, and a note carrying two sentences loses
   * whichever one runs on -- measured at 900x600, `scrollHeight` 26 against
   * `clientHeight` 13. This sentence is a whole clause or nothing, so it is
   * exempted from that clamp in `hud.css` on exactly the terms
   * `.hud-staff__hire-unassigned` is.
   *
   * **It withdraws to no box**, unlike either note beside it, which is why it
   * needs `.hud-staff__note[hidden]` to keep winning over that author
   * `display` -- the trap `.hud-build__queue-shortfall[hidden]` closes in the
   * other panel and `heldEmpty` records one block down. A solvent prison never
   * sees this line, so a permanent empty one would be furniture bought with
   * the rail height #174 is about.
   */
  const hireShortfall = eyebrowText('', 'hud-staff__note hud-staff__hire-shortfall');
  hireShortfall.hidden = true;
  /*
   * The line is the Hire control's description while it stands, and it is
   * added and removed per repaint rather than wired once -- `markControl`'s
   * pattern in `hud.ts`, for the reason `build-panel.ts` gives at its twin:
   * `aria-describedby` pointing at a line with no box describes the control
   * with a sentence nobody can read. `describeBy`/`undescribeBy` merge, so
   * this coexists with the refusal band's own id on the button in the state
   * where a press has actually been refused.
   */
  const hireShortfallId = nextUiId('hud-staff-hire-shortfall');
  hireShortfall.id = hireShortfallId;

  function paintHire(): void {
    const role = selectedRole();
    // Untouched by the affordability wiring below, and the two are different
    // questions: this is *authority* -- no role chosen is no charge to send,
    // so no press may happen at all -- where the verdict at the foot of this
    // function is *advice* about a press that still lands. See
    // `ActionButton.setUnavailable` for the general form of the split.
    hire.setDisabled(role === undefined);
    // Hidden rather than emptied, and hidden together with the figures it
    // quotes: `hud.security.hire-hint` is a sentence about a price, so with no
    // role selected there is no price and no sentence. `.hud-staff__note[hidden]`
    // in `hud.css` is what makes the attribute stick under the short-viewport
    // clamp -- the trap `heldEmpty` records one block down.
    const charge = describeHireCharge(role);
    hireNote.hidden = charge === undefined;
    // The shortfall line goes with the price line, and for the same reason:
    // with no role selected there is no charge, so there is no shortfall to
    // name -- and a line left standing from the last selection would be a
    // figure about a hire nobody has chosen. The `describeBy` link goes with
    // it, so the control is never described by a line with no box.
    if (charge === undefined) {
      hireShortfall.hidden = true;
      hireShortfall.textContent = '';
      undescribeBy(hire.element, hireShortfallId);
    }
    if (role === undefined || charge === undefined) return;
    hire.setLabel(
      t(HUD_MESSAGE_KEY.securityStaffHire, {
        role: t(role.labelKey),
        // Minor units, divided by nothing: #96 named no currency, and the
        // wage bands, the material prices and the balance on the status strip
        // are all quoted in the same units -- so this is the number the player
        // compares against what they have.
        total: localizer.formatNumber(charge.hireChargeMinorUnits),
      }),
    );
    hireNote.textContent = t(HUD_MESSAGE_KEY.securityStaffHint, {
      // The same value, formatted the same way, in the same repaint as the
      // button above: the two lines cannot disagree about what a press costs.
      total: localizer.formatNumber(charge.hireChargeMinorUnits),
      wage: localizer.formatNumber(charge.dailyWageMinorUnits),
    });
    /*
     * **The control's availability tracks the same verdict the press itself
     * will be judged against, computed before the press rather than
     * discovered by it** -- the Hire half of what issue #772 fixed on the Buy
     * button, found by that change's own sweep for the defect class rather
     * than reported separately. `pressAffordabilityVerdict` is the exact
     * comparison `src/main.ts` runs on `hire-staff`: same
     * `judgeAffordability`, same `pressFloorMinorUnits`, same constant floor,
     * and `'hiring'` shares `'deliveries'`' rung
     * (`INSOLVENCY_RUNG_FLOORS_MINOR_UNITS`) so the one function serves both
     * intents -- which is why a press this advises against and a press this
     * would have let through are never two approximations of one question.
     *
     * **`setUnavailable`, not `setDisabled`, and on this control the reason is
     * sharper than it was on the Buy button.** PR #799 wrote
     * `setDisabled(verdict.refused)` on `buySubmit` and the narrowing of
     * 2026-09-02 took it back off, because `disabled` removes the press and
     * the press is the only producer of the sentence that explains the
     * refusal. That argument applies here word for word with
     * `hud.refusal.hire-staff-past-floor` in place of the purchase one --
     * `src/main.ts`'s `hire-staff` case throws
     * `HostRefusalError('past-the-overdraft-floor')`, `refusalMessageKey`
     * (`src/ui/hud/projection.ts`) narrows it to that key, and the owner
     * authored it under ruling 18 of 2026-08-31 for a limit a player has no
     * other way of learning about.
     *
     * And it is sharper because of what `paintBuyTotal`'s own comment says
     * about the day the Buy button was hard-disabled: *"the last producer of
     * `'past-the-overdraft-floor'` left is `hire-staff`"*. This function is
     * that producer. Wiring the verdict onto `disabled` here would have taken
     * the reason away from the last control that could still reach it, so
     * `refusalHireStaffPastFloor` would have had no producer at all and two
     * authored sentences would have become unreachable copy -- which is
     * `AGENTS.md`'s fourth exclusion arrived at from the other direction.
     *
     * `aria-disabled` keeps both halves: assistive technology reports the
     * control as unavailable, `primitives.css` dims it beside `:disabled`, and
     * the press still lands, is still refused on this thread, and the player
     * is still told why.
     *
     * **The `disabled` bit is also not this panel's to keep**, for the reason
     * `ActionButton.setUnavailable` gives: `hire.element` is in this panel's
     * `controls`, and `createBusyGroup`'s `apply` assigns
     * `control.disabled = busy` for every member on every busy transition, so
     * a verdict written to `disabled` would be cleared the next time any
     * command in the HUD settled and not repainted until the next
     * `setTreasury` or change of role.
     *
     * **The figure judged is `hireChargeMinorUnits`, not the daily wage.** A
     * hire has two costs and only one of them is a press: the charge is one
     * day of the role's authored `wageBand.minPerDay`, read through the
     * simulation's own `staffHireCostMinorUnits`, and `PayrollSystem` bills
     * the same figure again at every in-game day boundary afterwards. What
     * the treasury is debited *by this press* is the first, which is what
     * `src/main.ts` compares and therefore what this compares. The standing
     * cost is stated to the player by `hireNote` above and by the roster
     * header's wage bill, and it is deliberately not folded in here -- a
     * control advising against a press for a bill that falls due tomorrow
     * would be advising against one the simulation accepts.
     *
     * **Unavailable, not hidden.** The hire exists and stays offered; the
     * balance that blocks it is a fact about *right now*, and the same press
     * goes through the next time income lands or a dismissal refunds a wage.
     * `aria-disabled` says exactly that -- advised against, but still here --
     * where `hidden` would claim the roles section stopped meaning anything.
     *
     * **This is the mechanical half only.** What the button *says* is
     * untouched -- still `hud.security.hire`, byte for byte, whichever way the
     * verdict falls. Naming what stops a press and what would lift it is new
     * player-facing copy, which `AGENTS.md`'s fourth exclusion reserves to the
     * owner, and it is ADR 0087 decision 2 / ADR 0089's territory rather than
     * this change's. The refusal band is the one sentence that already exists,
     * and keeping the press is what keeps it reachable.
     *
     * **Freshness, threaded exactly as `overdraftRemaining` and
     * `paintBuyTotal` thread it**: `treasuryRoomCapacity === 0`, never a bare
     * `false`, because a fresh, unfurnished prison is judged against the
     * shallower starter rung and a caller that silently answered "not fresh"
     * would reopen the -1,185/-1,250 gap PR #769 and #771's amendment closed
     * (`deliveriesRungFloorMinorUnits`'s own docblock).
     */
    const isFreshUnfurnishedPrison = treasuryRoomCapacity === 0;
    const verdict = pressAffordabilityVerdict(
      charge.hireChargeMinorUnits,
      treasuryMinorUnits,
      isFreshUnfurnishedPrison,
    );
    hire.setUnavailable(verdict.refused);
    /*
     * **And now it says what stops it** (the owner's sentence of 2026-09-03).
     * The paragraph above beginning *"This is the mechanical half only"* is
     * kept rather than rewritten: what changed is that the sentence exists,
     * not the argument for why this function could not author one.
     *
     * The label is still untouched -- `hud.security.hire` is byte-identical
     * available and unavailable -- because the sentence is a line of its own
     * and not part of the control's name.
     *
     * **The money branch only**, on the Buy button's terms: `shortfallMinorUnits`
     * is `0` on every other verdict, and a *"Not enough money"* sentence would
     * be false about a malformed charge. `{amount}` is the shortfall against
     * `hireChargeMinorUnits` -- the figure this press debits, argued above --
     * and not the daily wage `hireNote` prices, so the sentence and the
     * control's availability answer the same question about the same number.
     */
    const shortfallStands = verdict.refusal === 'past-the-floor';
    hireShortfall.hidden = !shortfallStands;
    hireShortfall.textContent = shortfallStands
      ? t(HUD_MESSAGE_KEY.securityStaffHireShortfall, {
          amount: localizer.formatNumber(verdict.shortfallMinorUnits),
        })
      : '';
    if (shortfallStands) describeBy(hire.element, hireShortfallId);
    else undescribeBy(hire.element, hireShortfallId);
  }

  // ---- who is held, and the control that frees them (ADR 0034) ---------
  /**
   * One pooled row: what is holding a guard, and the control that releases it.
   *
   * `guardId` is read at *press* time rather than captured when the row is
   * built, for the reason the Build panel's queue and delivery rows do it: the
   * row is pooled and names whichever guard the last publication put in it, so a
   * captured id would release whoever was in this row two seconds ago.
   */
  interface HeldRow {
    readonly element: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly release: ActionButton;
    /** The guard this row currently names, or `undefined` while it is hidden. */
    guardId: number | undefined;
  }

  const heldList = element('div', { className: 'hud-staff__held-list' });

  const heldRows: readonly HeldRow[] = Array.from({ length: HELD_GUARD_ROW_LIMIT }, (): HeldRow => {
    const label = valueText('', 'hud-staff__held-label');
    const row: HeldRow = {
      element: element('div', { className: 'hud-staff__held-row' }),
      label,
      release: createActionButton({
        label: t(HUD_MESSAGE_KEY.securityHeldRelease),
        onActivate: () => {
          const { guardId } = row;
          if (guardId === undefined) return;
          options.onRelease({ guardId });
        },
      }),
      guardId: undefined,
    };
    row.element.append(element('div', { className: 'hud-staff__held-text', children: [label] }), row.release.element);
    row.element.hidden = true;
    heldList.append(row.element);
    return row;
  });

  const heldSummary = valueText('', 'hud-staff__held-summary');
  const heldEmpty = eyebrowText(t(HUD_MESSAGE_KEY.securityHeldEmpty), 'hud-staff__note');
  const heldMore = eyebrowText('', 'hud-staff__note hud-staff__held-more');

  const heldBlock = element('div', {
    className: 'hud-staff__held',
    children: [
      element('div', {
        className: 'hud-staff__held-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.securityHeldTitle)), heldSummary],
      }),
      heldList,
      heldEmpty,
      heldMore,
      eyebrowText(t(HUD_MESSAGE_KEY.securityHeldHint), 'hud-staff__note'),
    ],
  });
  /*
   * No initial `hidden` here: `paintHeld` runs once below the `panel.body.append`
   * and is the single authority on whether this block has a box. A second
   * assignment would be a line no test could fail on -- the rule
   * `.hud-build__deliveries` records for the same shape of block.
   */

  let held: HudHeldGuardsViewModel | undefined;

  function paintHeld(): void {
    heldBlock.hidden = held === undefined;
    if (held === undefined) {
      delete heldBlock.dataset['held'];
      // Every pooled row emptied as well as hidden, so a press that somehow
      // reached a hidden button cannot name a guard from the last publication.
      for (const row of heldRows) {
        row.guardId = undefined;
        row.element.hidden = true;
        row.release.setDisabled(true);
        delete row.element.dataset['guard'];
      }
      return;
    }

    heldBlock.dataset['held'] = String(held.held);

    heldSummary.textContent = t(HUD_MESSAGE_KEY.securityHeldSummary, {
      held: localizer.formatNumber(held.held),
      unassigned: localizer.formatNumber(held.unassigned),
    });

    const guards = held.guards.slice(0, HELD_GUARD_ROW_LIMIT);
    heldRows.forEach((row, index) => {
      const guard = guards[index];
      if (guard === undefined) {
        row.guardId = undefined;
        row.element.hidden = true;
        row.release.setDisabled(true);
        delete row.element.dataset['guard'];
        return;
      }
      row.guardId = guard.entityId;
      row.label.textContent = formatHeldGuardText(t, guard);
      row.element.hidden = false;
      row.release.setDisabled(false);
      // The row's identity for a browser probe, so a spec can press the control
      // aimed at one guard and assert about the others -- the same handle
      // `data-delivery` gives the delivery rows, and needed for the same reason:
      // the rows are pooled, so "the second row" is not a stable name for a guard.
      row.element.dataset['guard'] = String(guard.entityId);
    });

    heldList.hidden = guards.length === 0;
    heldEmpty.hidden = guards.length > 0;
    // Counted against `held.held` and not against `held.guards.length`: the
    // reader asks for one row budget's worth of rows, so the window is what
    // arrived and the total is what the prison holds.
    const remaining = held.held - guards.length;
    heldMore.hidden = remaining <= 0;
    if (remaining > 0) {
      heldMore.textContent = t(HUD_MESSAGE_KEY.securityHeldMore, { count: localizer.formatNumber(remaining) });
    }
  }

  // ---- who is on the payroll, and the control that ends it (#533) -----
  /**
   * One pooled row: who somebody is and what they are doing, and the control
   * that dismisses them.
   *
   * `staffId` is read at *press* time rather than captured when the row is
   * built, for the held rows' reason and with a sharper consequence: the row is
   * pooled and names whichever staff member the last publication put in it, so a
   * captured id would sack whoever was in this row two seconds ago -- and a
   * dismissal, unlike a release, cannot be undone by waiting.
   */
  interface RosterRow {
    readonly element: HTMLElement;
    readonly label: HTMLSpanElement;
    readonly dismiss: ActionButton;
    /** The staff member this row currently names, or `undefined` while it is hidden. */
    staffId: number | undefined;
  }

  const rosterList = element('div', { className: 'hud-staff__held-list' });

  const rosterRows: readonly RosterRow[] = Array.from({ length: STAFF_ROSTER_ROW_LIMIT }, (): RosterRow => {
    const label = valueText('', 'hud-staff__held-label');
    const row: RosterRow = {
      element: element('div', { className: 'hud-staff__held-row' }),
      label,
      dismiss: createActionButton({
        label: t(HUD_MESSAGE_KEY.securityRosterDismiss),
        onActivate: () => {
          const { staffId } = row;
          if (staffId === undefined) return;
          options.onDismiss({ staffId });
        },
      }),
      staffId: undefined,
    };
    row.element.append(element('div', { className: 'hud-staff__held-text', children: [label] }), row.dismiss.element);
    row.element.hidden = true;
    rosterList.append(row.element);
    return row;
  });

  const rosterMore = eyebrowText('', 'hud-staff__note hud-staff__held-more');

  /*
   * What the prison pays every in-game day, in the header, so it survives the
   * fold (issue #639 ruling 2).
   *
   * `valueText` with a class of its own, which is `queueCount`'s shape in the
   * Build panel one panel over and is copied deliberately: `.ui-value` is what
   * carries this repository's tabular-figures rule, and a figure that jitters
   * as guards are hired and dismissed is the thing `.hud-build__queue-count`
   * already solved.
   *
   * **It carries a word of its own**, `hud.security.roster-wage-bill`'s
   * *"{total} a day"*, and the figure fills the placeholder.
   *
   * **It did not, for one revision, and that sentence used to say so**: it read
   * *"It carries the formatted figure and no word of its own ... any sentence
   * here would be a second player-facing string, which stays the owner's."*
   * That was the right call at the time and the badge shipped as a bare
   * `4,800`; the owner supplied the wording on 2026-08-30, so the reason has
   * been discharged rather than overruled. Both directions are marked because
   * the rule that produced the bare figure -- a player-facing string is the
   * owner's -- has not changed.
   */
  const rosterWageBill = valueText('', 'hud-staff__roster-count');

  /*
   * Collapsible, and **collapsed** -- see `STAFF_ROSTER_ROW_LIMIT` for the
   * measurement this stands in for. `roles` above is the panel's other
   * collapsible section and uses the same `onToggle` -> `setCollapsed`
   * handshake, which the primitive requires: it reports what the player asked
   * for and changes nothing until the owner says so.
   */
  const rosterSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.securityRosterTitle),
    collapsed: true,
    trailing: rosterWageBill,
    onToggle: (collapsed) => rosterSection.setCollapsed(collapsed),
  });
  rosterSection.element.classList.add('hud-staff__roster');
  rosterSection.body.append(rosterList, rosterMore, eyebrowText(t(HUD_MESSAGE_KEY.securityRosterHint), 'hud-staff__note'));

  let roster: HudStaffRosterViewModel | undefined;
  /**
   * What one in-game day of this roster costs, as the last status-counts
   * publication reported it -- `undefined` while none has arrived.
   *
   * Held beside `roster` rather than folded into it because the two arrive on
   * different channels: the roster is *pulled* over `hud/staff` and the bill is
   * *published* on `simulation/status-counts`. Keeping them separate is what
   * lets `describeDailyWageBill` tell "nobody is employed" from "nobody has
   * said what they cost".
   */
  let dailyWageBillMinorUnits: number | undefined;

  function paintRoster(): void {
    // Hidden while nothing has asked *and* while nobody is hired. The second is
    // this block's own rule rather than the held block's: a roster section on a
    // prison with no staff is a header promising a list that cannot exist, and
    // the panel already has a "Who to hire" section saying what to do about it.
    rosterSection.element.hidden = roster === undefined || roster.hired === 0;

    // The header's figure, decided by the pure `describeDailyWageBill` and
    // rendered here. Emptied rather than left standing when it answers
    // `undefined`: the section survives a repaint, so a badge that was never
    // cleared would state the last prison's payroll on the next one.
    const bill = describeDailyWageBill(roster, dailyWageBillMinorUnits);
    // The figure *and the word for what kind of figure it is* (the owner's
    // ruling of 2026-08-30). It read as a bare `4,800` for one revision, which
    // beside a header naming people reads as readily as a headcount -- and no
    // test can tell those two readings apart, because they render the same
    // characters. The word lives in `hud.security.roster-wage-bill` rather than
    // being concatenated here, on `hud.build.queue-count`'s terms: a locale
    // that puts the period before the figure has to be able to.
    rosterWageBill.textContent =
      bill === undefined
        ? ''
        : t(HUD_MESSAGE_KEY.securityRosterWageBill, { total: localizer.formatNumber(bill) });

    if (roster === undefined) {
      // Every pooled row emptied as well as hidden, so a press that somehow
      // reached a hidden button cannot name somebody from the last publication.
      for (const row of rosterRows) {
        row.staffId = undefined;
        row.element.hidden = true;
        row.dismiss.setDisabled(true);
        delete row.element.dataset['staff'];
      }
      return;
    }

    const staff = roster.staff.slice(0, STAFF_ROSTER_ROW_LIMIT);
    rosterRows.forEach((row, index) => {
      const member = staff[index];
      if (member === undefined) {
        row.staffId = undefined;
        row.element.hidden = true;
        row.dismiss.setDisabled(true);
        delete row.element.dataset['staff'];
        return;
      }
      row.staffId = member.entityId;
      row.label.textContent = formatStaffRosterText(t, member);
      row.element.hidden = false;
      row.dismiss.setDisabled(false);
      // The row's identity for a browser probe, in the shape `data-guard` gives
      // the held rows and needed for the same reason: the rows are pooled, so
      // "the second row" is not a stable name for a person.
      row.element.dataset['staff'] = String(member.entityId);
    });

    rosterList.hidden = staff.length === 0;
    // Counted against `roster.hired` and not against `roster.staff.length`: the
    // reader asks for one row budget's worth of rows, so the window is what
    // arrived and the total is what the prison employs.
    const remaining = roster.hired - staff.length;
    rosterMore.hidden = remaining <= 0;
    if (remaining > 0) {
      rosterMore.textContent = t(HUD_MESSAGE_KEY.securityHeldMore, { count: localizer.formatNumber(remaining) });
    }
  }

  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.securityStaffTitle),
    icon: 'security',
    className: 'hud-staff',
  });
  panel.body.append(
    coverageBlock,
    roles.element,
    element('div', {
      className: 'hud-staff__actions',
      children: [hire.element, hireShortfall, hireNote, hireUnassignedNote],
    }),
    heldBlock,
    rosterSection.element,
  );

  paintRoles();
  paintHire();
  paintHeld();
  paintCoverage();
  paintRoster();

  return {
    element: panel.element,
    controls: [
      hire.element,
      ...heldRows.map((row) => row.release.element),
      ...rosterRows.map((row) => row.dismiss.element),
    ],
    hireControl: hire.element,
    releaseControls: heldRows.map((row) => row.release.element),
    dismissControls: rosterRows.map((row) => row.dismiss.element),
    getSelection: () => selectedId,
    setHeldGuards(next: HudHeldGuardsViewModel | undefined): void {
      held = next;
      paintHeld();
    },
    setCoverage(next: HudStaffCoverageViewModel | undefined): void {
      coverage = next;
      paintCoverage();
    },
    setStaffRoster(next: HudStaffRosterViewModel | undefined): void {
      roster = next;
      paintRoster();
    },
    setDailyWageBill(next: number | undefined): void {
      dailyWageBillMinorUnits = next;
      paintRoster();
    },
    setTreasury(counts: HudCountsViewModel): void {
      treasuryMinorUnits = counts.treasuryMinorUnits;
      treasuryRoomCapacity = counts.roomCapacity;
      // Repainted unconditionally, including while the Security tab is not the
      // active one: `setVisible` hides the panel without unmounting it, so a
      // publication that arrived on another tab has to have moved the button
      // by the time the player comes back rather than waiting for the next
      // one. It is cheap -- one comparison, one text assignment and one
      // `setAttribute` per publication, none of which changes layout when the
      // value is what it already was -- and it is what
      // `BuildPanel.setTreasury` does for the same publication, whose own
      // comment records why "no DOM write when nothing changed" stopped being
      // the right sentence once the verdict moved to an attribute.
      paintHire();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
