import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudLocalizer, HudStaffViewModel } from './view-model';

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
 * A list of the roles that can be hired and one action. It is **not a roster**:
 * it says what may be hired, never who has been. Listing the people is a
 * projection this tree already has (`projectStaff`) and a surface ADR 0025
 * deliberately does not design -- `simulation/status-counts` carries two staff
 * integers and no rows, and putting a paged projection on a channel published
 * on a cadence is `docs/HUD_PROJECTIONS.md` contract 5's subject.
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

export interface StaffPanelOptions {
  readonly localizer: HudLocalizer;
  readonly model: HudStaffViewModel;
  /** Hire the selected role, at the charge the button states. */
  readonly onHire: (intent: StaffPanelHireIntent) => void;
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
  /** Current selection, exposed so a test can assert it without reading the DOM. */
  getSelection(): string | undefined;
  setVisible(visible: boolean): void;
}

export function createStaffPanel(options: StaffPanelOptions): StaffPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.roles[0]?.staffRoleId;

  const selectedRole = () => model.roles.find((role) => role.staffRoleId === selectedId);

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

  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.securityStaffTitle),
    icon: 'security',
    className: 'hud-staff',
  });
  panel.body.append(
    roles.element,
    element('div', {
      className: 'hud-staff__actions',
      children: [hire.element, eyebrowText(t(HUD_MESSAGE_KEY.securityStaffHint), 'hud-staff__note')],
    }),
  );

  paintRoles();
  paintHire();

  return {
    element: panel.element,
    controls: [hire.element],
    hireControl: hire.element,
    getSelection: () => selectedId,
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
