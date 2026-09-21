import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { rovingTabStop } from '../primitives/roving-focus';
import { bindRovingFocusKeydown } from '../primitives/roving-focus-keydown';
import { createSegmentedBar, type SegmentedBar } from '../primitives/segmented-bar';
import { createStatusBadge, type StatusBadge } from '../primitives/status-badge';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudContrabandViewModel,
  HudIncidentDetailViewModel,
  HudIncidentRowViewModel,
  HudIncidentsViewModel,
  HudLocalizer,
  HudSecurityViewModel,
} from './view-model';

/**
 * The Security panel: what the prison's sectors are, what has gone wrong in
 * them, and what has been found (2026-09-17).
 *
 * ### Why it exists, and why it is one panel and not four
 *
 * Four catalogued read models had a route out of the simulation worker and
 * nobody on the end of it: `hud/security`, `hud/incidents`,
 * `hud/incident-detail` and `hud/contraband`. The owner ruled on 2026-09-17 --
 * provenance the weaker of the two kinds this repository distinguishes, the
 * label of a clickable option rather than a sentence they typed -- that they
 * get a section of their own in the navigation rather than a place carved out
 * of an existing one:
 *
 * > Piata sekcja w nawigacji - wlasna zakladka (zalecane)
 *
 * ("a fifth section in the navigation - its own tab (recommended)"). The two
 * declined options were measuring the Manage rail and displacing something
 * already on it, and leaving the four unpainted.
 *
 * **Four projections is not four panels**, and the reachability gate's own
 * entries say why. Three of the four blamed one missing thing -- a panel -- and
 * `hud/incident-detail`'s blamed the absence of the third: *"it waits on the
 * LIST half rather than on a selection model ... there is no row for a player
 * to press."* So the incidents pair is a list with an inspector under it, the
 * shape issue #895 built for the prisoner roster and this file copies, and the
 * other two are blocks beside it.
 *
 * One panel rather than three for a reason that is measured rather than
 * aesthetic: a panel costs a header, and the rail is the scarcest thing in this
 * interface at 375x812. Three headers is three rows of chrome for one question
 * -- *is this prison under control* -- read at three scales: what the sectors
 * are asked to hold, what has broken, and what has been carried in.
 *
 * ### Boundaries
 *
 * A composer, exactly like the Staff, Intake and Regime panels. It imports
 * nothing from `src/simulation/**`, and every figure and every word it renders
 * arrives on a view model as a number or a message key. In particular it counts
 * nothing: every total below is the projection's own, including the ones a
 * reader could obviously derive -- `stillOpen` is not `open.length`, because
 * the open list is what `IncidentLog` indexes and the summary is what the
 * projection counted, and a panel that recomputed one from the other would be a
 * second authority on how many incidents a prison has.
 *
 * ### What it issues
 *
 * One intent and no command. Selecting an incident is **chrome** -- applied
 * here immediately and unconditionally, with the host merely told, because the
 * host is the only thing that can turn a chosen incident into a
 * `hud/incident-detail` request. That is the arrangement `regime-panel.ts`
 * already uses for a prisoner, and it is why this panel joins no busy group.
 */

type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

export interface SecurityPanelOptions {
  readonly localizer: HudLocalizer;
  /**
   * The player chose an incident, or cleared the choice by pressing the
   * selected row again. `undefined` means nothing is selected.
   */
  readonly onSelectIncident?: (incidentId: string | undefined) => void;
}

/**
 * How many open incidents get a row.
 *
 * Four, and the number is the roster's for the same reason rather than by
 * imitation: this list sits in the same rail, is bounded by the same height,
 * and its rows carry the same furniture -- two lines of text, a bar and a
 * badge. `PRISONER_ROSTER_ROW_LIMIT`'s own derivation put four rows inside
 * 219.0px at 375x812, and this block has less to spend than that one because
 * it shares its panel with two others.
 *
 * A prison with more than four incidents open at once has a bigger problem than
 * a windowed list, and the summary line above the rows states the real number,
 * so the window never becomes the count.
 */
export const OPEN_INCIDENT_ROW_LIMIT = 4;

/** Where a sector stands, as one word and one tone. */
export function describeSectorTone(sector: { readonly underLockdown: boolean; readonly shortage: number }): 'danger' | 'warning' | 'neutral' {
  // Lockdown outranks a shortfall: a sector under lockdown is one whose doors
  // are refusing people, which is a state the player has to know about before
  // they know it is also short of guards.
  if (sector.underLockdown) return 'danger';
  return sector.shortage > 0 ? 'warning' : 'neutral';
}

/**
 * What tone an open incident gets, from the one published scale it carries.
 *
 * `incident.ts` documents severity as `0-10`, so the thresholds here are on a
 * scale the simulation states rather than on a number this panel invented. They
 * are a *presentation* banding and not a simulation rule -- nothing in
 * `src/simulation/**` calls a severity 7 incident "critical" -- which is why
 * they live here and not in a projection, and why the row prints the rank
 * beside the tone rather than only colouring itself.
 */
export function describeIncidentTone(severity: number): 'danger' | 'warning' | 'neutral' {
  if (severity >= 7) return 'danger';
  return severity >= 4 ? 'warning' : 'neutral';
}

/** One pooled, focusable incident row. */
interface IncidentRow {
  readonly element: HTMLElement;
  readonly headline: HTMLSpanElement;
  readonly people: HTMLSpanElement;
  readonly severityText: HTMLSpanElement;
  readonly severityBar: SegmentedBar;
  readonly badge: StatusBadge;
}

export interface SecurityPanel {
  readonly element: HTMLElement;
  /** Which incident the inspector is about, or `undefined`. */
  getSelection(): string | undefined;
  /** `undefined` hides the sectors block: nothing has reported, which is not a claim about the prison. */
  setSecurity(view: HudSecurityViewModel | undefined): void;
  /** `undefined` hides the incidents block, for the same reason. */
  setIncidents(view: HudIncidentsViewModel | undefined): void;
  /**
   * Repaint the inspector.
   *
   * `undefined` covers three states and none of them is a claim about the
   * incident -- nothing has asked, a read was already in flight, or the request
   * failed -- so none of them forgets the selection either. A reply whose
   * `incidentId` is not the selected one is ignored rather than painted, for
   * `RegimePanel.setPrisonerDetail`'s reason: the request is correlated by
   * `messageId`, the player is not.
   */
  setIncidentDetail(view: HudIncidentDetailViewModel | undefined): void;
  /** The worker says there is no such incident, so the selection goes with it. */
  clearIncidentSelection(): void;
  /** `undefined` hides the contraband block. */
  setContraband(view: HudContrabandViewModel | undefined): void;
  setVisible(visible: boolean): void;
}

export function createSecurityPanel(options: SecurityPanelOptions): SecurityPanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters));
  const n = (value: number): string => localizer.formatNumber(value);

  // ---- nothing has reported -----------------------------------------
  /*
   * One sentence for the whole panel rather than one per block, and it is the
   * same sentence `hud.alerts.unknown` and `hud.overview.none` already paint.
   * The three blocks are fed by three separate replies but by one host loop, so
   * "nothing has reported" is a fact about the session and not about a block --
   * and three copies of it stacked in one panel would read as three failures.
   */
  const waiting = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityWaiting), 'hud-security__note');

  // ---- the sectors ---------------------------------------------------
  const sectorList = element('div', { className: 'hud-security__sector-list' });
  const sectorsEmpty = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecuritySectorsEmpty), 'hud-security__note');
  const sectorsBlock = element('div', {
    className: 'hud-security__sectors',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.sectionSecuritySectors)), sectorList, sectorsEmpty],
  });

  let security: HudSecurityViewModel | undefined;

  /*
   * Rebuilt rather than pooled, which is the opposite choice from the incident
   * rows below and rests on the rule the Regime panel's timetable states:
   * nothing in this block is focusable, so replacing it cannot take focus away
   * from a player. The sector registry is also a closed list rather than a
   * population -- a session derives exactly one sector today.
   */
  function paintSectors(): void {
    sectorsBlock.hidden = security === undefined;
    if (security === undefined) {
      sectorList.replaceChildren();
      sectorsEmpty.hidden = true;
      return;
    }

    sectorsEmpty.hidden = security.sectors.length > 0;
    sectorList.replaceChildren(
      ...security.sectors.map((sector) => {
        const tone = describeSectorTone(sector);
        const badge = createStatusBadge({
          tone: tone === 'danger' ? 'danger' : 'neutral',
          text: sector.underLockdown
            ? t(HUD_MESSAGE_KEY.sectionSecurityLockdown)
            : t(sector.controlStateLabelKey),
        });
        const lines: Node[] = [
          element('div', {
            className: 'hud-security__sector-header',
            children: [
              valueText(
                // The grade's word when the catalog defines one, and the
                // sector's own id when it does not. An id rather than a blank:
                // the row is still about a sector, which is the rule
                // `formatPrisonerName` follows for an unnamed prisoner.
                sector.gradeLabelKey === undefined ? sector.sectorId : t(sector.gradeLabelKey),
                'hud-security__sector-name',
              ),
              badge.element,
            ],
          }),
          eyebrowText(
            t(HUD_MESSAGE_KEY.sectionSecuritySectorStaffing, { assigned: n(sector.assigned), required: n(sector.required) }),
            'hud-security__sector-staffing',
          ),
        ];
        if (sector.shortage > 0) {
          lines.push(eyebrowText(t(HUD_MESSAGE_KEY.sectionSecuritySectorShort, { count: n(sector.shortage) }), 'hud-security__note'));
        }
        if (sector.openIncidentCount > 0) {
          lines.push(
            eyebrowText(
              t(HUD_MESSAGE_KEY.sectionSecuritySectorOpenIncidents, { count: n(sector.openIncidentCount) }),
              'hud-security__note',
            ),
          );
        }
        const row = element('div', { className: 'hud-security__sector-row', children: lines });
        // The sector's own id, so a browser assertion finds the row about one
        // sector rather than counting rows -- `data-group`'s job on the Regime
        // panel's timetable.
        row.dataset['sector'] = sector.sectorId;
        row.dataset['tone'] = tone;
        return row;
      }),
    );
  }

  /**
   * Where an incident is, in words.
   *
   * **The grade's word when the projection resolved one, and the sector's own
   * id when it did not** -- character for character the rule the sectors block
   * above applies to its own header, and the owner's ruling of 2026-09-21 was
   * to apply that rule here (*"Nazwać stopniem, jak blok wyżej"*). The id was
   * the only internal identifier a player saw anywhere in the HUD.
   *
   * What it gives up, said plainly because the owner was told it before
   * choosing: a grade is **not a place**. Two sectors of the same grade read
   * identically, and the grade word is the best thing that exists --
   * `docs/HUD_PROJECTIONS.md` gaps 16 and 23 are why nothing in the simulation
   * can say where a sector is, and ADR 0036's derived sector has no authored
   * name at all.
   *
   * The fallback is an id rather than a blank for `formatPrisonerName`'s
   * reason: the row is still about a sector, and saying nothing about which
   * one is worse than saying it in the machine's words.
   */
  function incidentPlaceWord(incident: HudIncidentRowViewModel): string {
    return incident.sectorGradeLabelKey === undefined ? incident.sectorId : t(incident.sectorGradeLabelKey);
  }

  // ---- what has gone wrong -------------------------------------------
  let incidents: HudIncidentsViewModel | undefined;
  let detail: HudIncidentDetailViewModel | undefined;
  let selectedIncidentId: string | undefined;
  /**
   * Where the keyboard is, so a repaint cannot move the tab stop out from under
   * it.
   *
   * The same field `regime-panel.ts` keeps and for the same reason: this block
   * repaints on a cadence, the window's membership changes with the prison, and
   * the selection alone is not enough -- a player arrowing down the list has
   * moved focus without selecting anything.
   */
  let focusedIncidentId: string | undefined;

  const incidentSummary = valueText('', 'hud-security__incident-summary');
  const incidentToll = eyebrowText('', 'hud-security__note');
  const incidentList = element('div', { className: 'hud-security__incident-list' });
  const incidentEmpty = eyebrowText('', 'hud-security__note');
  const byTypeHeader = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityIncidentsByType), 'hud-security__eyebrow');
  const byTypeList = element('div', { className: 'hud-security__count-list' });

  /**
   * A vacated pooled row stops being a control at all.
   *
   * The measured half of that, verbatim from `regime-panel.ts`'s
   * `clearRowData`, because this block would fail the same gate:
   * `tests/browser/app-shell.spec.ts`'s *"every control can actually be
   * pressed (#88)"* enumerates the page with
   * `button, [role="button"], a[href], input, select, textarea,
   * [tabindex]:not([tabindex="-1"])` and asserts that the controls it could
   * never lay out are exactly its written exemption list. Four pooled rows left
   * focusable while empty would be four controls that sweep can never hit-test
   * in a prison where nothing has gone wrong -- which is the state it runs in.
   *
   * That is also why each row is a `div` carrying `role="radio"` rather than a
   * `<button>`: a `<button>` matches that selector whatever its attributes say.
   * The price is that `Enter` and `Space` are wired by hand below, once for all
   * four rows.
   */
  function clearIncidentRow(row: HTMLElement): void {
    delete row.dataset['incident'];
    delete row.dataset['state'];
    delete row.dataset['severity'];
    delete row.dataset['selected'];
    delete row.dataset['tone'];
    row.removeAttribute('role');
    row.removeAttribute('aria-checked');
    row.removeAttribute('tabindex');
  }

  const incidentRows: readonly IncidentRow[] = Array.from({ length: OPEN_INCIDENT_ROW_LIMIT }, (): IncidentRow => {
    const headline = valueText('', 'hud-security__incident-headline');
    const people = eyebrowText('', 'hud-security__incident-people');
    const severityBar = createSegmentedBar({ label: '' });
    /*
     * The bar is hidden from the name computation and the figure is printed
     * beside it, which is issue #909's finding applied one panel over: a filled
     * row is `role="radio"`, ARIA gives a radio's children
     * `presentational: true`, and the `role="meter"` inside it is announced as
     * flattened text -- so `aria-valuetext` is dropped from what a screen reader
     * says. One carrier, announced once, and a sighted player gets the rank as
     * a number rather than an unlabelled row of segments.
     */
    severityBar.element.setAttribute('aria-hidden', 'true');
    const severityText = eyebrowText('', 'hud-security__incident-severity');
    const badge = createStatusBadge({ tone: 'neutral', text: '' });
    badge.element.classList.add('hud-security__incident-state');
    const row = element('div', {
      className: 'hud-security__incident-row',
      children: [
        element('div', { className: 'hud-security__incident-top', children: [headline, badge.element] }),
        element('div', {
          className: 'hud-security__incident-bottom',
          children: [severityText, severityBar.element, people],
        }),
      ],
    });
    row.hidden = true;
    return { element: row, headline, people, severityText, severityBar, badge };
  });
  incidentList.append(...incidentRows.map((row) => row.element));

  /** Which row carries which incident right now; rewritten on every paint. */
  const incidentRowsById = new Map<string, { readonly element: HTMLElement }>();
  let incidentFocusOrder: readonly string[] = [];

  /**
   * Selecting is a toggle, so a second press on the selected row clears it.
   *
   * The detail goes *now* rather than when the next reply lands: anything else
   * leaves one incident's timeline under another incident's heading for as long
   * as the round trip takes. Exactly `selectPrisoner`'s arrangement.
   */
  function selectIncident(incidentId: string | undefined): void {
    const next = incidentId === selectedIncidentId ? undefined : incidentId;
    if (next === selectedIncidentId) return;
    selectedIncidentId = next;
    detail = undefined;
    paintIncidents();
    paintDetail();
    options.onSelectIncident?.(next);
  }

  /*
   * The pointer's route in, delegated to the list because the rows are pooled:
   * a listener per row would be four closures each holding whichever incident
   * was in that slot at mount, which is none. `data-incident` is the row's
   * identity, absent on a vacated row, so a press on empty space reaches
   * nothing.
   */
  incidentList.addEventListener('click', (event: MouseEvent) => {
    const pressed = event.target;
    if (!(pressed instanceof Element)) return;
    const id = pressed.closest<HTMLElement>('.hud-security__incident-row')?.dataset['incident'];
    if (id === undefined) return;
    selectIncident(id);
  });

  /*
   * The keyboard's route in: the two keys that activate a `radio`, written here
   * because the row is a `div`. `preventDefault` because `Space` scrolls, and
   * `stopPropagation` because `WorldScene` binds camera controls on `window` in
   * the bubble phase -- a key consumed here would otherwise also pan the world.
   * The arrows, `Home` and `End` are `bindRovingFocusKeydown`'s below.
   */
  incidentList.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    const id = focused.dataset['incident'];
    if (id === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    selectIncident(id);
  });

  incidentList.addEventListener('focusin', (event: FocusEvent) => {
    const focused = event.target;
    if (!(focused instanceof HTMLElement)) return;
    focusedIncidentId = focused.dataset['incident'];
  });

  bindRovingFocusKeydown(incidentList, {
    datasetAttribute: 'incident',
    order: () => incidentFocusOrder,
    rows: incidentRowsById,
  });

  // ---- the inspector --------------------------------------------------
  const detailHeading = valueText('', 'hud-security__detail-heading');
  const detailSeverity = eyebrowText('', 'hud-security__note');
  const detailResponders = eyebrowText('', 'hud-security__note');
  const detailOutcome = eyebrowText('', 'hud-security__note');
  const detailEscaped = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityIncidentEscaped), 'hud-security__note');
  const detailTimeline = element('div', { className: 'hud-security__timeline' });
  const detailBlock = element('div', {
    className: 'hud-security__detail',
    children: [
      detailHeading,
      detailSeverity,
      detailResponders,
      detailOutcome,
      detailEscaped,
      eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityIncidentTimeline), 'hud-security__eyebrow'),
      detailTimeline,
    ],
  });

  function paintDetail(): void {
    /*
     * The block leaves entirely rather than standing there with a placeholder
     * in it, which is the Regime inspector's rule and the fourth reservation's:
     * there is no true sentence for "the answer about this incident has not
     * arrived" that is not also read as a statement about the incident.
     */
    const shown = detail !== undefined && detail.incidentId === selectedIncidentId ? detail : undefined;
    detailBlock.hidden = shown === undefined;
    if (shown === undefined) {
      detailTimeline.replaceChildren();
      delete detailBlock.dataset['incident'];
      return;
    }
    detailBlock.dataset['incident'] = shown.incidentId;
    detailHeading.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentRow, {
      type: t(shown.typeLabelKey),
      sector: incidentPlaceWord(shown),
    });
    detailSeverity.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentSeverity, {
      severity: n(shown.severity),
      max: n(shown.severityMax),
    });
    detailResponders.hidden = shown.requiredResponders === undefined;
    detailResponders.textContent =
      shown.requiredResponders === undefined
        ? ''
        : t(HUD_MESSAGE_KEY.sectionSecurityIncidentResponders, { count: n(shown.requiredResponders) });
    /*
     * The outcome line is drawn for a terminal incident and for no other. An
     * open incident has no `outcome` at all, so "0 hurt" would assert that it
     * hurt nobody where what is true is that it has not finished -- the
     * distinction `AGENTS.md`'s fourth reservation is about.
     */
    detailOutcome.hidden = !shown.terminal;
    detailOutcome.textContent = shown.terminal
      ? t(HUD_MESSAGE_KEY.sectionSecurityIncidentOutcome, {
          injured: n(shown.injuredCount),
          damage: n(shown.propertyDamage),
          max: n(shown.propertyDamageMax),
        })
      : '';
    detailEscaped.hidden = !shown.escaped;
    detailTimeline.replaceChildren(
      ...shown.timeline.map((entry) =>
        eyebrowText(
          t(HUD_MESSAGE_KEY.sectionSecurityIncidentTimelineRow, { state: t(entry.stateLabelKey), tick: n(entry.atTick) }),
          'hud-security__timeline-row',
        ),
      ),
    );
  }

  function paintIncidents(): void {
    incidentsSection.element.hidden = incidents === undefined;
    if (incidents === undefined) {
      for (const row of incidentRows) {
        row.element.hidden = true;
        clearIncidentRow(row.element);
      }
      // The ring empties with the rows: it is what the arrow handler walks, and
      // leaving it populated would let a key press focus a row holding nothing.
      incidentRowsById.clear();
      incidentFocusOrder = [];
      incidentList.removeAttribute('role');
      incidentList.removeAttribute('aria-label');
      incidentList.hidden = true;
      incidentEmpty.hidden = true;
      byTypeList.replaceChildren();
      byTypeHeader.hidden = true;
      incidentSummary.textContent = '';
      incidentToll.hidden = true;
      return;
    }

    const view = incidents;
    // The counts as data as well as as text, so a probe reads them without
    // parsing a localized sentence -- `data-total`'s job on the Regime roster.
    incidentsSection.element.dataset['total'] = String(view.total);
    incidentsSection.element.dataset['open'] = String(view.stillOpen);
    incidentSummary.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentsSummary, {
      open: n(view.stillOpen),
      total: n(view.total),
    });
    const toll = view.injured > 0 || view.escapes > 0;
    incidentToll.hidden = !toll;
    incidentToll.textContent = toll
      ? t(HUD_MESSAGE_KEY.sectionSecurityIncidentsToll, { injured: n(view.injured), escapes: n(view.escapes) })
      : '';

    const shown = view.open.slice(0, OPEN_INCIDENT_ROW_LIMIT);
    incidentRowsById.clear();
    incidentFocusOrder = shown.map((incident) => incident.incidentId);

    incidentRows.forEach((row, index) => {
      const incident = shown[index];
      if (incident === undefined) {
        row.element.hidden = true;
        clearIncidentRow(row.element);
        return;
      }
      row.element.hidden = false;
      row.headline.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentRow, {
        type: t(incident.typeLabelKey),
        sector: incidentPlaceWord(incident),
      });
      row.people.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentPeople, { count: n(incident.participantCount) });
      row.severityText.textContent = t(HUD_MESSAGE_KEY.sectionSecurityIncidentSeverity, {
        severity: n(incident.severity),
        max: n(incident.severityMax),
      });
      const tone = describeIncidentTone(incident.severity);
      /*
       * The bar draws the rank against its own published ceiling rather than
       * the per-mille figure, because `SegmentedBar` takes a value and a max
       * and this scale has both. `severityPermille` is still what the
       * projection computed and is carried on the view model, and the two
       * cannot disagree: `toBoundedValue(severity, INCIDENT_SEVERITY_MAX)` is
       * where the per-mille comes from.
       *
       * `valueText` is the same sentence the row prints beside the bar, so the
       * spoken form and the printed one cannot drift.
       */
      row.severityBar.update({
        label: t(incident.typeLabelKey),
        value: incident.severity,
        max: incident.severityMax,
        valueText: row.severityText.textContent ?? '',
        tone,
      });
      row.badge.update({ tone: tone === 'danger' ? 'danger' : 'neutral', text: t(incident.stateLabelKey) });
      row.element.dataset['incident'] = incident.incidentId;
      row.element.dataset['severity'] = String(incident.severity);
      row.element.dataset['tone'] = tone;
      row.element.setAttribute('role', 'radio');
      const selected = incident.incidentId === selectedIncidentId;
      row.element.setAttribute('aria-checked', selected ? 'true' : 'false');
      row.element.dataset['selected'] = selected ? 'true' : 'false';
      incidentRowsById.set(incident.incidentId, row);
    });

    const indexOf = (incidentId: string | undefined): number | undefined => {
      if (incidentId === undefined) return undefined;
      const at = incidentFocusOrder.indexOf(incidentId);
      return at < 0 ? undefined : at;
    };
    const tabStop = rovingTabStop(incidentFocusOrder.length, indexOf(focusedIncidentId) ?? indexOf(selectedIncidentId));
    incidentRows.forEach((row, index) => {
      if (row.element.hidden) return;
      row.element.tabIndex = index === tabStop ? 0 : -1;
    });

    /*
     * The group's role, conditional for `build-panel.ts`'s reason: a group
     * whose only member is a sentence would announce "one of one" for something
     * there is no way to select. Named from the section's own eyebrow -- an
     * existing key rather than a new sentence.
     */
    if (shown.length > 0) {
      incidentList.setAttribute('role', 'radiogroup');
      incidentList.setAttribute('aria-label', t(HUD_MESSAGE_KEY.sectionSecurityIncidents));
    } else {
      incidentList.removeAttribute('role');
      incidentList.removeAttribute('aria-label');
    }
    incidentList.hidden = shown.length === 0;

    /*
     * The two empty sentences, and which one is painted is the whole of this
     * block's obligation under `AGENTS.md`'s fourth reservation.
     *
     * `total === 0` is a log holding nothing; `stillOpen === 0` with a non-zero
     * total is a log whose every entry is terminal. Neither says the prison is
     * safe, and the second deliberately does not say it is under control:
     * `'lapsed'` is terminal and means nobody responded in time, so a prison
     * whose every incident lapsed paints it too.
     */
    incidentEmpty.hidden = shown.length > 0;
    incidentEmpty.textContent =
      shown.length > 0
        ? ''
        : view.total === 0
          ? t(HUD_MESSAGE_KEY.sectionSecurityIncidentsNone)
          : t(HUD_MESSAGE_KEY.sectionSecurityIncidentsClosed, { total: n(view.total) });

    byTypeHeader.hidden = view.byType.length === 0;
    byTypeList.replaceChildren(
      ...view.byType.map((entry) =>
        eyebrowText(
          t(HUD_MESSAGE_KEY.sectionSecurityCountRow, { label: t(entry.typeLabelKey), count: n(entry.count) }),
          'hud-security__count-row',
        ),
      ),
    );

    // Last, because it reads what the loop above decided: a selection survives
    // only while some drawn row still names that incident. A selected incident
    // that has resolved leaves the open list, and its inspector goes with it
    // rather than standing under a row that is no longer there.
    if (selectedIncidentId !== undefined && !incidentRowsById.has(selectedIncidentId)) {
      selectedIncidentId = undefined;
      detail = undefined;
      options.onSelectIncident?.(undefined);
      paintDetail();
    }
  }

  // ---- what has been carried in ----------------------------------------
  const searchTally = valueText('', 'hud-security__search-tally');
  const searchList = element('div', { className: 'hud-security__search-list' });
  const searchesEmpty = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecuritySearchesNone), 'hud-security__note');
  const foundHeader = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityFound), 'hud-security__eyebrow');
  const foundList = element('div', { className: 'hud-security__count-list' });
  const foundEmpty = eyebrowText(t(HUD_MESSAGE_KEY.sectionSecurityFoundNone), 'hud-security__note');

  let contraband: HudContrabandViewModel | undefined;

  function paintContraband(): void {
    contrabandSection.element.hidden = contraband === undefined;
    if (contraband === undefined) {
      searchList.replaceChildren();
      foundList.replaceChildren();
      searchTally.textContent = '';
      searchesEmpty.hidden = true;
      foundEmpty.hidden = true;
      return;
    }

    const view = contraband;
    searchTally.textContent = t(HUD_MESSAGE_KEY.sectionSecuritySearchTally, {
      found: n(view.itemsDiscovered),
      missed: n(view.itemsMissed),
    });
    searchesEmpty.hidden = view.searches.length > 0;
    searchList.replaceChildren(
      ...view.searches.map((order) => {
        const row = element('div', {
          className: 'hud-security__search-row',
          children: [
            valueText(
              t(HUD_MESSAGE_KEY.sectionSecuritySearchRow, { scope: t(order.scopeLabelKey), state: t(order.stateLabelKey) }),
              'hud-security__search-name',
            ),
            eyebrowText(
              t(HUD_MESSAGE_KEY.sectionSecuritySearchProgress, { done: n(order.currentTargetIndex), count: n(order.targetCount) }),
              'hud-security__note',
            ),
          ],
        });
        row.dataset['search'] = order.orderId;
        row.dataset['queued'] = order.queued ? 'true' : 'false';
        return row;
      }),
    );

    /*
     * The empty sentence needs BOTH figures, because they come from different
     * places and either alone can be zero while the other is not:
     * `itemsDiscovered` is the search system's metric and `foundByCategory` is
     * the confiscation ledger grouped by the content catalog, so an item
     * confiscated in a category the catalog does not define is counted by the
     * first and dropped by the second. Requiring both is what makes
     * "nothing has been confiscated" true in every state it is painted in.
     */
    const foundNothing = view.itemsDiscovered === 0 && view.foundByCategory.length === 0;
    foundEmpty.hidden = !foundNothing;
    foundHeader.hidden = foundNothing;
    foundList.replaceChildren(
      ...view.foundByCategory.map((entry) => {
        const row = eyebrowText(
          t(HUD_MESSAGE_KEY.sectionSecurityCountRow, { label: t(entry.categoryLabelKey), count: n(entry.count) }),
          'hud-security__count-row',
        );
        row.dataset['category'] = entry.categoryId;
        return row;
      }),
    );
  }

  // ---- the two folds ----------------------------------------------------
  /*
   * The incidents and contraband blocks fold; the sectors block does not.
   *
   * The sectors block is the one that is the same size in every prison -- one
   * row today, and its whole content is the staffing line the player came to
   * this section for -- so a fold over it would be chrome over four lines. The
   * other two grow with the session, and the rail is the scarcest thing in this
   * interface at 375x812.
   *
   * Both start OPEN, which is the owner's ruling of 2026-08-31 applied to the
   * same question one panel over (#703 ruling 1): a list that is full and shut
   * is a message that reaches the player at no viewport, and that is the defect
   * the ruling was about rather than a property of the alerts list.
   */
  const incidentsSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.sectionSecurityIncidents),
    onToggle: (collapsed) => incidentsSection.setCollapsed(collapsed),
  });
  incidentsSection.element.classList.add('hud-security__incidents');
  incidentsSection.body.append(incidentSummary, incidentToll, incidentList, incidentEmpty, detailBlock, byTypeHeader, byTypeList);

  const contrabandSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.sectionSecurityContraband),
    onToggle: (collapsed) => contrabandSection.setCollapsed(collapsed),
  });
  contrabandSection.element.classList.add('hud-security__contraband');
  contrabandSection.body.append(searchTally, searchList, searchesEmpty, foundHeader, foundList, foundEmpty);

  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.sectionSecurityTitle),
    icon: 'incident',
    className: 'hud-security',
  });
  panel.body.append(waiting, sectorsBlock, incidentsSection.element, contrabandSection.element);

  function paintWaiting(): void {
    // One sentence for the panel: it is painted only when nothing at all has
    // reported, because a single block having no reply is a state the other two
    // blocks' own `hidden` already describes.
    waiting.hidden = security !== undefined || incidents !== undefined || contraband !== undefined;
  }

  paintSectors();
  paintIncidents();
  paintDetail();
  paintContraband();
  paintWaiting();

  return {
    element: panel.element,
    getSelection: () => selectedIncidentId,
    setSecurity(next: HudSecurityViewModel | undefined): void {
      security = next;
      paintSectors();
      paintWaiting();
    },
    setIncidents(next: HudIncidentsViewModel | undefined): void {
      incidents = next;
      paintIncidents();
      paintWaiting();
    },
    setIncidentDetail(next: HudIncidentDetailViewModel | undefined): void {
      detail = next;
      paintDetail();
    },
    clearIncidentSelection(): void {
      // No intent is raised: the host is the only caller and it is the host
      // that stopped asking, so telling it what it just told us would be a
      // loop. `RegimePanel.clearPrisonerSelection` says the same.
      if (selectedIncidentId === undefined) return;
      selectedIncidentId = undefined;
      detail = undefined;
      paintIncidents();
      paintDetail();
    },
    setContraband(next: HudContrabandViewModel | undefined): void {
      contraband = next;
      paintContraband();
      paintWaiting();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
    },
  };
}
