import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createPanel } from '../primitives/panel';
import { createStatusBadge, type BadgeTone } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudHeldGuardViewModel,
  HudHeldGuardsViewModel,
  HudLocalizer,
  HudStaffCoverageViewModel,
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
 */
export interface StaffCoverageReadout {
  readonly tone: BadgeTone;
  /** The word beside the colour, so the colour never stands alone. */
  readonly badgeKey: LocalizationKey;
  /** The sentence under it: the action where there is one, the state where there is not. */
  readonly hintKey: LocalizationKey;
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
  // guards it asks for" is true of a prison that asks for none. It is not
  // reachable from `applyDefaultSecuritySector`, which authors a floor of one.
  return {
    tone: 'success',
    badgeKey: HUD_MESSAGE_KEY.securityCoverageMet,
    hintKey: HUD_MESSAGE_KEY.securityCoverageMetHint,
    hireCount: 0,
  };
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
  setVisible(visible: boolean): void;
}

export function createStaffPanel(options: StaffPanelOptions): StaffPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.roles[0]?.staffRoleId;

  const selectedRole = () => model.roles.find((role) => role.staffRoleId === selectedId);

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
   */
  const coverageSummary = valueText('', 'hud-staff__coverage-summary');
  const coverageBadge = createStatusBadge({ tone: 'neutral', text: '' });
  const coverageHint = eyebrowText('', 'hud-staff__note');

  const coverageBlock = element('div', {
    className: 'hud-staff__coverage',
    children: [
      element('div', {
        className: 'hud-staff__coverage-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.securityCoverageTitle)), coverageSummary, coverageBadge.element],
      }),
      coverageHint,
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

  function paintHire(): void {
    const role = selectedRole();
    hire.setDisabled(role === undefined);
    if (role === undefined) return;
    hire.setLabel(
      t(HUD_MESSAGE_KEY.securityStaffHire, {
        role: t(role.labelKey),
        // Minor units, divided by nothing: #96 named no currency, and the
        // wage bands, the material prices and the balance on the status strip
        // are all quoted in the same units -- so this is the number the player
        // compares against what they have.
        total: localizer.formatNumber(role.hireChargeMinorUnits),
      }),
    );
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
      children: [hire.element, eyebrowText(t(HUD_MESSAGE_KEY.securityStaffHint), 'hud-staff__note')],
    }),
    heldBlock,
  );

  paintRoles();
  paintHire();
  paintHeld();
  paintCoverage();

  return {
    element: panel.element,
    controls: [hire.element, ...heldRows.map((row) => row.release.element)],
    hireControl: hire.element,
    releaseControls: heldRows.map((row) => row.release.element),
    getSelection: () => selectedId,
    setHeldGuards(next: HudHeldGuardsViewModel | undefined): void {
      held = next;
      paintHeld();
    },
    setCoverage(next: HudStaffCoverageViewModel | undefined): void {
      coverage = next;
      paintCoverage();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
