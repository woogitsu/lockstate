import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type {
  HudLocalizer,
  HudRoomEnclosureRequirement,
  HudRoomNeedsViewModel,
  HudRoomViewModel,
  HudRoomsViewModel,
  HudZoningNoticeViewModel,
} from './view-model';

/**
 * The Rooms panel.
 *
 * ### Why this is a tab and not a block in the Build panel
 *
 * ADR 0022 decided that a room type would be a row in the Build catalogue and
 * named a Rooms tab as the alternative it rejected. The owner chose the
 * alternative, and the panel is built to the budget that choice buys. The
 * numbers are the whole of the argument: the Build panel's *always-visible*
 * headroom at 900x600 is 7.81px -- measured to 0.05px, and about 4px smaller
 * than the figure the decision was taken against, because part of what that
 * figure counted was a gutter laid over a hairline rather than space (#174) --
 * and this surface needs a confirm step, a removal control, a too-small warning
 * and an enclosure readout. On the aside the panel inherits a 291.2px body at
 * the same viewport. There was no version of this that fitted inside Build.
 *
 * It is the fifth and last tab: `HUD_TAB_IDS` had four, and ADR 0022 measured
 * a sixth as foreclosed at 375x812, where a five-tab bar already leaves 1.8px
 * of margin per side.
 *
 * ### Purpose first, then the rectangle
 *
 * Pick what the room is *for* from the catalogue, then drag the tiles it
 * covers. That order is what the content model already assumes -- a room
 * definition carries a `nameKey`, a minimum size and an enclosure rule, all of
 * which the player wants to read *before* choosing where to put it -- and it is
 * what the genre converges on (ADR 0022's evidence section). The reverse order,
 * drag-then-classify, would have to show the minimum-size rule after the drag
 * that broke it.
 *
 * ### The confirm step, and why it takes the arm row's place
 *
 * A release does not designate anything. It leaves a *pending* rectangle, and
 * the one 44px row that held "Draw on map" and "Remove rooms" becomes
 * "Designate 6 x 6" and "Discard". Two things follow from that, both wanted:
 *
 *   - **It costs no height.** The row is `--tap-target` tall whichever pair is
 *     in it, which is the same trick `.hud-build__actions` uses for the buy
 *     disclosure. A confirm step in a *third* block would have cost 52px the
 *     panel does have and did not need to spend.
 *   - **The choice is unambiguous while it is pending.** There is no state in
 *     which the panel offers "arm the tool" and "confirm this rectangle" at
 *     once, so there is no reading in which the arm button is what confirms.
 *
 * The tool stays armed while a rectangle is pending, so dragging again replaces
 * it rather than needing a discard first -- which is how a player actually
 * corrects a rectangle that came out 6x5.
 *
 * ### The panel gets out of the way of the thing it operates on
 *
 * Arming folds the panel to its header; a finished rectangle brings it back.
 * That is the answer to the question ADR 0022's amendment left open, and it is
 * a measurement rather than a taste: at 375x812 with both rail panels expanded
 * the largest square of bare world on the whole page is 16px, so there was
 * nowhere to drag and therefore no way to reach the confirm pair. See the
 * `drawingFolded` declaration for the geometry either side of the change, and
 * `.ui-panel__body[hidden]` in `primitives.css` for why this fold did nothing
 * at all before it.
 *
 * **The confirm gates removals too**, and that is deliberate rather than
 * uniformity for its own sake. A removal drag grows every tile it covers into
 * that tile's whole connected same-type run, so clipping the corner of a 6x6
 * canteen removes all 36 tiles. That is the right behaviour -- the alternative
 * leaves the zoning plane painted where the registry has no instance -- and it
 * is exactly the behaviour a confirm step should be shown for. It is also what
 * makes removal usable on touch: drag, read the area, tap once more.
 *
 * ### Two producers of a rectangle, one path through the panel
 *
 * A rectangle can be dragged on the world or typed into the folded
 * "Enter coordinates" form at the foot of the catalogue, and *nothing
 * downstream can tell which* (#411). Both go through `adoptPendingArea`, so
 * the confirm control, the too-small warning, the area readout, the fold and
 * the `ZoneRoom`/`UnzoneRoom` the host composes are reached unchanged. That is
 * the whole of the mechanism, and it is why removal gained a keyboard route in
 * the same stroke: the confirm row is driven by *whether* a rectangle is
 * pending, never by who set it.
 *
 * Until the form existed the drag was the only producer, and the world canvas
 * cannot take keyboard focus at all -- so a keyboard-only player could reach
 * every control in this panel and still not zone anything, and with no room to
 * hold anybody every `AdmitPrisoner` was refused for the rest of the session.
 * `AGENTS.md` boundary 10 is not satisfied by "it works with a mouse", and the
 * Build panel had carried the same fallback since the day it shipped.
 *
 * **Why it lives inside `.hud-rooms__list`**, which is a stranger home than it
 * looks. The panel has no always-visible height to spend. Measured on the
 * assembled page in the state a player is in after their first room -- one
 * zoned unfinished room, so `.hud-rooms__needs` has a box -- by growing a
 * fixed-height block a pixel at a time in each candidate host until the panel's
 * height, its fold gap, or any of `.ui-panel__body`, `.hud-rooms__catalogue`
 * and the catalogue's `.ui-section__body` moves:
 *
 *   - the panel body affords **32px at 1280x720 and 0px at 900x600**;
 *   - the catalogue section's own body, which is where ADR 0022's successor
 *     draft put this form, affords **41px and 4px** -- that body is not the
 *     scroll region, the list inside it is, and at both viewports the list is
 *     already on its one-row floor;
 *   - this list affords **at least 400px at both**, which was the probe's own
 *     cap rather than a limit it found.
 *
 * A collapsed section header is 44px, so the first two are refused and the
 * scroller is the only answer -- it is the one box in this panel that is meant
 * to hold more than it shows. So the form is the last thing in it, below the
 * eighteen rows. Measured with the real form, folded (45px) and open
 * (252.56px), at 1440x900, 1280x800, 1280x720, 1024x768, 900x600 and 375x812:
 * the panel's height, its fold gap, the last block's bottom edge, its
 * `scrollTop` and the list's own height are identical to their figures before
 * this form existed, and no box is shorter than its own content. Opening it
 * adds 208px to the list's scroll height and nothing to the panel's.
 *
 * ### Boundaries
 *
 * A *composer*, like the Build panel. It holds which room type is selected,
 * whether the tool is armed, whether the armed gesture removes and which
 * rectangle is pending, and it turns those into intents. It never touches the
 * world, never inspects a snapshot, and imports nothing from
 * `src/simulation/**` -- so it does not know that a `ZoneRoom` or an
 * `UnzoneRoom` command exists, only that it asked the host to designate or
 * remove something.
 */

/** A rectangle of tiles, as the panel names one. Ids and numbers only. */
export interface RoomsPanelArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoomsPanelDesignateIntent {
  readonly roomId: string;
  readonly area: RoomsPanelArea;
}

export interface RoomsPanelOptions {
  readonly localizer: HudLocalizer;
  readonly model: HudRoomsViewModel;
  /** Designate the pending rectangle as the selected room type. */
  readonly onDesignate: (intent: RoomsPanelDesignateIntent) => void;
  /** Clear every room designation the pending rectangle touches. */
  readonly onRemove: (area: RoomsPanelArea) => void;
  /**
   * Hand the world pointer to the room tool, or take it back.
   *
   * `removing` travels with `armed` rather than as a second signal, because the
   * renderer needs both to decide which preview to draw and a pair that could
   * disagree would draw a removal preview for a designation gesture.
   */
  readonly onArm: (armed: boolean, options: { readonly roomId?: string; readonly removing: boolean }) => void;
}

export interface RoomsPanel {
  readonly element: HTMLElement;
  /**
   * The controls to disable while a command is in flight -- the two that issue
   * one, and nothing else.
   *
   * Choosing a room type, arming the tool, switching to removal and discarding
   * a pending rectangle are *chrome*: they change what the next command would
   * say and ask the host for nothing. The Build panel's own `controls` comment
   * records what disabling more than that cost when it was measured.
   */
  readonly controls: readonly (HTMLButtonElement | HTMLInputElement)[];
  /** The confirm control, so a refused designation is reported on the control that was pressed (#207). */
  readonly submitControl: HTMLButtonElement;
  /** Which room type is selected, exposed so a test can assert it without reading the DOM. */
  getSelectedRoomId(): string | undefined;
  /** The rectangle awaiting confirmation, or `undefined`. */
  getPendingArea(): RoomsPanelArea | undefined;
  isArmed(): boolean;
  isRemoving(): boolean;
  /** Live feedback from the world. `undefined` clears the readout and the pending rectangle. */
  setArea(area: RoomsPanelArea | undefined): void;
  /** A finished gesture: the rectangle is now pending confirmation. */
  setPendingArea(area: RoomsPanelArea | undefined): void;
  /** What the simulation said about the last room designated. */
  setZoningNotice(notice: HudZoningNoticeViewModel | undefined): void;
  /**
   * What the simulation says the designated rooms are still missing.
   *
   * `undefined` clears the readout, and it is not the same statement as a
   * model with no unfinished rooms: nothing has been asked, so the panel knows
   * nothing rather than knowing everything is fine. Both draw no block, and
   * they draw no block for different reasons -- see `HudRoomNeedsViewModel`.
   */
  setRoomNeeds(needs: HudRoomNeedsViewModel | undefined): void;
  setVisible(visible: boolean): void;
}

/**
 * How many unmet requirements the readout names by name.
 *
 * **One, and it is a measurement rather than an opinion.** The panel's own
 * height is fixed by the rail and not by its content -- measured on the
 * assembled page, a block added to `.ui-panel__body` shrinks
 * `.hud-rooms__list` and leaves `.hud-rooms` at 480.1px at 1280x800, 451.1px at
 * 375x812 and 338.1px at 900x600 -- so what this readout actually spends is the
 * catalogue list's slack, and that list stops shrinking at its one-row floor of
 * 44px.
 *
 * At 900x600 the list is **already on that floor** with the readout hidden. The
 * measurement: a header line and three rows came to 101.3px there and put the
 * panel 58px into overflow, ending the readout itself 4.5px below the panel's
 * unscrolled fold and the rule readout 58px below it -- #174's defect with a
 * new cause, and the exact thing ADR 0022 and
 * `tests/browser/app-shell.spec.ts`'s fold assertion exist to catch. The slack
 * there is about 43px, which buys a header line and one more.
 *
 * So the readout names one thing and counts the rest: `roomsNeedsMore` carries
 * "and {count} more", and the header's figure is over every room in the
 * requested page. The player fixing that one thing sees the line move to the
 * next -- which is the order they would work in anyway.
 *
 * `HudRoomNeedsViewModel.needs` stays a *list* despite this being one, and that
 * is the point of the number living here rather than there: it is a fact about
 * how much of the rail this panel can spend, not about what the simulation
 * found. The boundary carries the answer; the panel decides how much of it fits.
 */
export const ROOM_NEEDS_NAMED_LIMIT = 1;

/**
 * The largest side a *typed* rectangle may name, per axis.
 *
 * A second declaration of the simulation's `MAX_ZONE_DIMENSION_TILES`, and it
 * has to be: `AGENTS.md` boundary 1 forbids `src/ui/hud/**` importing
 * `src/simulation/**` at all, which `tests/unit/ui-hud-messages.test.ts`
 * enforces. Two declarations of one number drift, so
 * `tests/unit/ui-hud-rooms-panel.test.ts` imports both and holds them
 * together -- the shape `HUD_BUILD_EDGES` and `BUILD_EDGES` already use.
 *
 * It bounds the width and height fields and nothing else. **Tile X and tile Y
 * take no bound**, exactly as the Build panel's coordinates do: a tile outside
 * the owned world has to produce the refusal it already produces, on the
 * control that was pressed, rather than being silently clamped to somewhere
 * the player did not ask for. The renderer's drag applies the same cap on the
 * sides (`MAX_ZONE_SIDE_TILES`), so the two routes can express exactly the same
 * set of rectangles.
 */
export const MAX_ROOM_SIDE_TILES = 64;

function requirementLabelKey(requirement: HudRoomEnclosureRequirement): LocalizationKey {
  switch (requirement) {
    case 'enclosed':
      return HUD_MESSAGE_KEY.roomsRequirementEnclosed;
    case 'outdoors':
      return HUD_MESSAGE_KEY.roomsRequirementOutdoors;
    case 'none':
      return HUD_MESSAGE_KEY.roomsRequirementNone;
  }
}

export function createRoomsPanel(options: RoomsPanelOptions): RoomsPanel {
  const { localizer, model } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let selectedId = model.rooms[0]?.roomId;
  let armed = false;
  let removing = false;
  /*
   * Whether the panel is folded, in two parts, because the answer depends on
   * what the player is doing.
   *
   * `playerFolded` is the panel's own fold: what the header control means at
   * every other moment. `drawingFolded` is the fold *during a drawing pass* --
   * armed, with nothing yet to confirm -- and it starts folded on every arm
   * press, because a panel that covers the thing it operates on is not a panel
   * the player can draw on.
   *
   * That is not a preference, it is the measurement in `hud.css`'s Rooms block
   * read the other way round. On the assembled page at 375x812, Rooms tab, one
   * prison saved, both panels expanded: the save panel occupies y 96..251.7 and
   * this panel y 267.7..718.8, both the full width, and the gaps between them,
   * the 88px strip and the tab bar are 8, 16 and 24 pixels. The largest square
   * of bare world anywhere on that page is **16px**, and the whole interaction
   * is "drag a rectangle across the tiles this room should cover" -- so the two
   * controls a pending rectangle reveals could not be reached at all, which is
   * what ADR 0022's amendment recorded and left open.
   *
   * Folded, the panel is 47px -- its 45px header plus its own hairlines -- and
   * the band the rail then leaves between the two panels is 348.8px tall and the
   * full 375px wide. So the fix
   * is not new chrome, and it could not have been: the panel's *always-visible*
   * budget at 900x600 is 7.9px, measured as the distance from the status
   * block's bottom edge to the panel's own fold, and a collapsed section of its
   * own is 45px. What was missing was that this fold be used, and that it work
   * at all -- see `.ui-panel__body[hidden]` in `primitives.css`, which is why
   * pressing "Collapse" here used to change nothing on screen.
   */
  let playerFolded = false;
  let drawingFolded = true;
  /** The rectangle the pointer is currently over, whether or not the gesture has finished. */
  let area: RoomsPanelArea | undefined;
  /** The finished rectangle awaiting a confirm. */
  let pending: RoomsPanelArea | undefined;
  let notice: HudZoningNoticeViewModel | undefined;
  /** What the simulation last said the designated rooms are missing, or nothing asked yet. */
  let needs: HudRoomNeedsViewModel | undefined;

  const selectedRoom = (): HudRoomViewModel | undefined =>
    model.rooms.find((entry) => entry.roomId === selectedId);

  /**
   * A drawing pass: the tool is armed and there is nothing to confirm yet, so
   * the player's attention is on the world rather than on this panel.
   *
   * A *pending* rectangle ends the pass even though the tool stays armed --
   * dragging again replaces the rectangle, so the tool has to stay armed -- and
   * that is the whole reason this reads `pending === undefined` rather than
   * `armed`: the moment there is something to confirm, the panel is the only
   * place the player can confirm it.
   *
   * **An open coordinate form ends the pass too**, and that clause is not
   * tidiness (#411). The fold exists to uncover the world for a *drag*; a
   * player who has opened the typed route is not dragging, and folding the
   * panel would take the form they are typing into off the screen. It was a
   * dead end rather than an inconvenience: pressing "Remove rooms" arms the
   * tool, so a keyboard player reaching for a removal watched the panel --
   * and the only route they have to a rectangle -- fold itself away. Measured
   * as such: the keyboard removal spec in `tests/browser/app-shell.spec.ts`
   * ran out of Tab presses on a folded panel until this clause existed.
   */
  const drawing = (): boolean => armed && pending === undefined && coordinates.isCollapsed();
  const folded = (): boolean => (drawing() ? drawingFolded : playerFolded);

  // ---- what kind of room -------------------------------------------
  const catalogueList = element('div', { className: 'hud-rooms__list' });
  const rows = new Map<string, ListRow>();

  const paintCatalogue = (): void => {
    for (const [id, row] of rows) {
      row.setBadge(id === selectedId ? { tone: 'info', text: t(HUD_MESSAGE_KEY.roomsSelected) } : undefined);
      row.element.dataset['selected'] = id === selectedId ? 'true' : 'false';
    }
  };

  for (const room of model.rooms) {
    const row = createListRow({
      icon: 'rooms',
      label: t(room.labelKey),
      onActivate: () => {
        selectedId = room.roomId;
        // Choosing a different room type invalidates a pending rectangle's
        // *judgement*, not the rectangle: 6x6 is enough for a canteen and not
        // for a yard, so the too-small warning and the minimum readout have to
        // be recomputed. The rectangle itself is kept, because the player
        // dragged it deliberately and re-dragging it to change one word in the
        // panel would be work the surface created for itself.
        paintCatalogue();
        paintRule();
        paintActions();
        // A designation gesture already in progress has to follow the
        // selection, or the map would keep designating whatever was chosen
        // when it was armed.
        if (armed && !removing) options.onArm(true, { roomId: selectedId, removing: false });
      },
    });
    row.element.dataset['room'] = room.roomId;
    rows.set(room.roomId, row);
    catalogueList.append(row.element);
  }

  // An empty list must say so. A blank rectangle is indistinguishable from a
  // broken one -- the same rule the Build panel's catalogue follows. Reachable
  // only from a host that passes no rooms; the shipped catalogue has 18.
  if (model.rooms.length === 0) {
    catalogueList.append(
      createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.roomsCatalogueEmpty) }).element,
    );
  }

  const catalogue: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.roomsCatalogue),
    onToggle: (collapsed) => catalogue.setCollapsed(collapsed),
  });
  // The one section allowed to take space from the panel's height budget, and
  // named so `hud.css` can say which one it is. Unlike the Build panel's, this
  // list is 18 rows long and therefore always scrolls, which is why its floor
  // is one row rather than two: a two-row floor would spend 44px to show a
  // second row of a list the player is going to scroll anyway.
  catalogue.element.classList.add('hud-rooms__catalogue');
  catalogue.body.append(catalogueList);

  // ---- the typed route ---------------------------------------------
  /*
   * Four numbers, and the disclosure that keeps them out of the way.
   *
   * The four are the panel's own copy of the pending rectangle, held here
   * rather than read back out of the DOM because `NumberField` is deliberately
   * *controlled*: a field reports the value it was asked for and changes
   * nothing until its owner calls `setValue`, so the owner has to be the one
   * holding it. `1x1` is the starting size rather than the selected room's
   * authored minimum: seeding from the room type would be the panel deciding a
   * rectangle the player did not say, and the minimum is already stated two
   * blocks down and enforced by the confirm control.
   */
  let coordX = 0;
  let coordY = 0;
  let coordWidth = 1;
  let coordHeight = 1;

  const clampSide = (value: number): number => Math.min(Math.max(Math.trunc(value), 1), MAX_ROOM_SIDE_TILES);

  const coordinateField = (
    labelKey: LocalizationKey,
    className: string,
    write: (value: number) => void,
    value: number,
    bounds?: { readonly min: number; readonly max: number },
  ): NumberField => {
    const label = t(labelKey);
    const field: NumberField = createNumberField({
      label,
      value,
      decrementLabel: t(HUD_MESSAGE_KEY.roomsStepDown, { field: label }),
      incrementLabel: t(HUD_MESSAGE_KEY.roomsStepUp, { field: label }),
      ...(bounds ?? {}),
      onChange: (next) => {
        write(next);
        field.setValue(next);
      },
    });
    field.element.classList.add(className);
    return field;
  };

  const xField = coordinateField(
    HUD_MESSAGE_KEY.roomsTileX,
    'hud-rooms__coord-x',
    (next) => {
      coordX = next;
    },
    coordX,
  );
  const yField = coordinateField(
    HUD_MESSAGE_KEY.roomsTileY,
    'hud-rooms__coord-y',
    (next) => {
      coordY = next;
    },
    coordY,
  );
  const widthField = coordinateField(
    HUD_MESSAGE_KEY.roomsWidth,
    'hud-rooms__coord-width',
    (next) => {
      coordWidth = next;
    },
    coordWidth,
    { min: 1, max: MAX_ROOM_SIDE_TILES },
  );
  const heightField = coordinateField(
    HUD_MESSAGE_KEY.roomsHeight,
    'hud-rooms__coord-height',
    (next) => {
      coordHeight = next;
    },
    coordHeight,
    { min: 1, max: MAX_ROOM_SIDE_TILES },
  );

  /*
   * The form's own control, and the reason the fields do not set the
   * rectangle themselves.
   *
   * This is the typed route's *release*: it produces a pending rectangle,
   * exactly as letting go of a drag does, and the confirm control below still
   * has to be pressed. Three things follow from a press rather than a
   * keystroke, and the third is the one that decided it:
   *
   *   - a half-typed rectangle is never pending, so the arm and remove
   *     controls do not vanish and come back between two fields;
   *   - the same four numbers can be used twice, which matters for a row of
   *     identical cells;
   *   - and they *have* to be usable twice. `NumberField` reports on `change`,
   *     and a field re-entered with the value it already holds fires nothing
   *     -- so a form that only listened to its fields would go dead after the
   *     first designation, with four numbers on screen and no way to say them
   *     again. Measured: the keyboard removal spec in
   *     `tests/browser/app-shell.spec.ts` ran out of Tab presses looking for a
   *     confirm control that a re-typed identical rectangle never revealed.
   */
  const coordinatesSubmit: ActionButton = createActionButton({
    // No icon and no tone, exactly as the Build panel's own submit carries
    // neither: the primary-tone control on this panel is "Draw on map", and a
    // second one would argue with it about which route is the main one.
    label: t(HUD_MESSAGE_KEY.roomsCoordinatesSubmit),
    onActivate: () => {
      adoptPendingArea({ x: coordX, y: coordY, width: coordWidth, height: coordHeight });
    },
  });
  coordinatesSubmit.element.classList.add('hud-rooms__coordinates-submit');

  /** A rectangle that arrived from somewhere else, taken into the four fields. */
  function showCoordinates(next: RoomsPanelArea): void {
    coordX = Math.trunc(next.x);
    coordY = Math.trunc(next.y);
    coordWidth = clampSide(next.width);
    coordHeight = clampSide(next.height);
    xField.setValue(coordX);
    yField.setValue(coordY);
    widthField.setValue(coordWidth);
    heightField.setValue(coordHeight);
  }

  // Folded on arrival, for the reason the Build panel's own coordinates
  // section is: it is the fallback route, and an open form of number fields
  // would read as the way you are meant to zone.
  const coordinates: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.roomsCoordinates),
    collapsed: true,
    onToggle: (collapsed) => {
      coordinates.setCollapsed(collapsed);
      // Whether this form is open is one of the three things that decide
      // whether a drawing pass is in progress, so the panel's fold is
      // recomputed here as it is on every other change to those three.
      paintFold();
    },
  });
  coordinates.element.classList.add('hud-rooms__coordinates');
  coordinates.body.append(
    eyebrowText(t(HUD_MESSAGE_KEY.roomsCoordinatesHint), 'hud-rooms__coordinates-hint'),
    element('div', { className: 'hud-rooms__coords', children: [xField.element, yField.element] }),
    element('div', { className: 'hud-rooms__coords', children: [widthField.element, heightField.element] }),
    coordinatesSubmit.element,
  );
  // Inside the scroller and not beside it. See the header comment: the list is
  // the only box in this panel with height to give, and a block placed here
  // costs the panel nothing at any viewport while the same block one level up
  // overflows the catalogue at two of them.
  catalogueList.append(coordinates.element);

  // ---- the rule, read before the drag ------------------------------
  /*
   * The authored minimum and the enclosure requirement, stated for the
   * *selected* room type.
   *
   * Both are content the simulation refuses or reports on, and neither was
   * readable anywhere before this panel: `minimum-size` is authored on all 18
   * definitions and was evaluated nowhere, so a 1x1 canteen was zonable, and
   * `enclosed`/`outdoors` is carried by all 18 and evaluated nowhere either.
   * Showing the rule here is what makes the refusal that enforces it a
   * reminder rather than a surprise.
   *
   * Two eyebrow lines rather than two rows: at 13.2px each they cost 30.4px
   * including the block's own gutters, against 88px for a pair of rows, and
   * neither is interactive.
   */
  const ruleMinimum = eyebrowText(t(HUD_MESSAGE_KEY.roomsMinimumNone), 'hud-rooms__rule');
  const ruleEnclosure = eyebrowText(t(HUD_MESSAGE_KEY.roomsRequirementNone), 'hud-rooms__rule');
  const ruleBlock = element('div', {
    className: 'hud-rooms__rule-block',
    children: [ruleMinimum, ruleEnclosure],
  });

  function paintRule(): void {
    const room = selectedRoom();
    const minimum = room?.minimum;
    ruleMinimum.textContent =
      minimum === undefined
        ? t(HUD_MESSAGE_KEY.roomsMinimumNone)
        : t(HUD_MESSAGE_KEY.roomsMinimum, { width: minimum.width, height: minimum.height });
    ruleEnclosure.textContent = t(requirementLabelKey(room?.enclosure ?? 'none'));
  }

  // ---- the map route -----------------------------------------------
  const armButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsArm),
    tone: 'primary',
    icon: 'rooms',
    disabled: selectedId === undefined,
    onActivate: () => {
      // Arming to designate turns removal off. The two modes are one armed
      // tool, and a player pressing "Draw on map" while removal was on has
      // said which of the two they want.
      removing = false;
      const wasArmed = armed;
      armed = !armed;
      // A fresh press of "Draw on map" is a fresh statement of intent, so the
      // panel goes back out of the way even if the player pulled it open during
      // the last pass. Only on the transition: re-folding a panel the player
      // opened, on a press that did not arm anything, would be the surface
      // arguing with them.
      if (armed && !wasArmed) drawingFolded = true;
      paintActions();
      options.onArm(armed, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing: false });
    },
  });
  armButton.element.classList.add('hud-rooms__arm');

  /*
   * Removal, and the reason it is a peer of the arm button rather than a
   * disclosure.
   *
   * It is the recovery from every mistake this panel can make, and a recovery
   * folded behind a toggle is a recovery a player in trouble has to find.
   * Before `UnzoneRoom` existed a designation was permanent for the life of the
   * session -- `zone` refuses any tile already painted, zoning writes no
   * construction order so `Undo` cannot reach it, and on touch there is no undo
   * key at all -- so one stray drag could put up to 4,096 tiles beyond use with
   * no recovery of any kind. That is the defect this control closes, and it is
   * why it is always visible.
   *
   * It needs no selected room type, and that asymmetry is real rather than an
   * oversight: a removal names no room type, because what comes out is whatever
   * the rectangle covers.
   */
  const removeButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsRemove),
    onActivate: () => {
      removing = !removing;
      // Switching mode discards a pending rectangle rather than reinterpreting
      // it. The same four numbers mean "designate this" or "remove whatever is
      // here", and silently changing which would be the panel deciding
      // something the player did not say.
      pending = undefined;
      const wasArmed = armed;
      armed = removing || armed;
      // Arming to remove is arming, so it starts a drawing pass on the same
      // terms as the button beside it.
      if (armed && !wasArmed) drawingFolded = true;
      paintActions();
      options.onArm(armed, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing });
    },
  });
  removeButton.element.classList.add('hud-rooms__remove');

  const confirmButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsConfirm, { width: 0, height: 0 }),
    tone: 'primary',
    icon: 'check',
    onActivate: () => {
      const rectangle = pending;
      if (rectangle === undefined) return;
      if (removing) {
        pending = undefined;
        paintActions();
        options.onRemove(rectangle);
        return;
      }
      const roomId = selectedId;
      // Unreachable while the tool cannot be armed to designate without a
      // selection, and returning rather than asserting keeps a designation of
      // `undefined` impossible rather than merely unlikely.
      if (roomId === undefined) return;
      pending = undefined;
      paintActions();
      options.onDesignate({ roomId, area: rectangle });
    },
  });
  confirmButton.element.classList.add('hud-rooms__confirm');

  const cancelButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsCancel),
    onActivate: () => {
      pending = undefined;
      paintActions();
    },
  });
  cancelButton.element.classList.add('hud-rooms__cancel');

  const areaValue = valueText(t(HUD_MESSAGE_KEY.roomsAreaNone), 'hud-rooms__area-value');
  const areaBlock = element('div', {
    className: 'hud-rooms__area',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.roomsArea)), areaValue],
  });

  /*
   * One line, three jobs, and it is one line rather than three because the
   * three cannot be true at once.
   *
   * It is the arm hint while nothing is pending, the too-small warning when the
   * pending rectangle is under the selected room's authored minimum, and the
   * enclosure warning when the simulation reports an accepted room as open
   * against an `enclosed` requirement. A line per state would cost 26.4px to
   * show two sentences that are never both relevant.
   *
   * The too-small warning wins over the enclosure one, because it is about the
   * rectangle the player is still holding while the other is about a room they
   * already made.
   */
  const note = eyebrowText(t(HUD_MESSAGE_KEY.roomsArmHint), 'hud-rooms__note');

  const actionsRow = element('div', {
    className: 'hud-rooms__actions',
    children: [armButton.element, removeButton.element, confirmButton.element, cancelButton.element],
  });

  /** True when the pending rectangle is smaller than the selected room's authored floor. */
  function pendingIsTooSmall(): boolean {
    if (pending === undefined || removing) return false;
    const minimum = selectedRoom()?.minimum;
    if (minimum === undefined) return false;
    return pending.width < minimum.width || pending.height < minimum.height;
  }

  function paintNote(): void {
    const minimum = selectedRoom()?.minimum;
    if (pendingIsTooSmall() && minimum !== undefined) {
      note.textContent = t(HUD_MESSAGE_KEY.roomsTooSmall, {
        width: minimum.width,
        height: minimum.height,
      });
      note.dataset['tone'] = 'warning';
      return;
    }
    if (
      pending === undefined &&
      notice !== undefined &&
      notice.requirement === 'enclosed' &&
      notice.enclosure === 'open'
    ) {
      note.textContent = t(HUD_MESSAGE_KEY.roomsEnclosureOpenRequired);
      note.dataset['tone'] = 'warning';
      return;
    }
    note.textContent = t(removing ? HUD_MESSAGE_KEY.roomsRemoveHint : HUD_MESSAGE_KEY.roomsArmHint);
    delete note.dataset['tone'];
  }

  /**
   * The enclosure readout: what the simulation actually found, for the last
   * room designated.
   *
   * A *readout* and never a refusal, and the panel is where that distinction is
   * made visible. `RoomZoningService` evaluates the requirement and accepts the
   * room either way, because the check it can honestly make is narrower than
   * enclosure -- a room drawn inside a larger sealed building reads as open --
   * and because a completed door order writes nothing into the world, so
   * refusing every unsealed `enclosed` room would make 17 of the 18 room types
   * designatable only as a box with no way in.
   */
  const enclosureValue = valueText(t(HUD_MESSAGE_KEY.roomsEnclosureNone), 'hud-rooms__enclosure-value');
  const enclosureBlock = element('div', {
    className: 'hud-rooms__enclosure',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.roomsEnclosure)), enclosureValue],
  });

  function paintEnclosure(): void {
    if (notice === undefined) {
      enclosureValue.textContent = t(HUD_MESSAGE_KEY.roomsEnclosureNone);
      delete enclosureBlock.dataset['enclosure'];
      return;
    }
    enclosureValue.textContent = t(
      notice.enclosure === 'sealed'
        ? HUD_MESSAGE_KEY.roomsEnclosureSealed
        : HUD_MESSAGE_KEY.roomsEnclosureOpen,
    );
    enclosureBlock.dataset['enclosure'] = notice.enclosure;
  }

  // ---- what the rooms are still missing ----------------------------
  /*
   * The readout that answers "I zoned a cell and nothing happened".
   *
   * ### Why it is here and not in the alerts list
   *
   * For the reason the enclosure readout is here: this is not a refusal. The
   * room was accepted, it is painted on the map and the status strip counts it
   * -- what it cannot do is house anybody, because a cell with no bed satisfies
   * no `sleep-surface` requirement and `IntakeSystem` will not put a prisoner in
   * it. That is a *fact about the room the player made*, and it belongs beside
   * the control that made it. The alerts section also starts folded
   * (`INITIAL_HUD_SHELL_STATE`), so a sentence routed there would be in the DOM
   * and painted at no viewport, which is exactly the defect #220 moved
   * "simulation unavailable" out of that list to fix.
   *
   * ### Why the panel decides nothing about it
   *
   * Every word comes from somewhere else. Which rooms are unfinished and what
   * each one lacks is `projectRoomList` / `projectRoomDetail`'s answer, pulled
   * over `simulation/request-projection`; the room's name and the object's name
   * are the two catalogues' own `nameKey`s. This code chooses the sentence and
   * the order of the words in it and nothing else -- so the rule that a cell
   * without a bed is unfinished has exactly one definition, the one
   * `ActionSystem` and `IntakeSystem` already gate on.
   *
   * ### Two lines, and why not more
   *
   * A header line and one detail line, which is the panel's own economy: the
   * rule block above states two rules in two eyebrow lines rather than two rows
   * for the same reason. `ROOM_NEEDS_NAMED_LIMIT` carries the measurement that
   * decided it.
   *
   * ### Why it disappears entirely
   *
   * `hidden`, not an empty block and not a "nothing missing" line. A room that
   * is fine must cost this panel no height at all: its always-visible budget at
   * 900x600 is 7.9px (ADR 0022), and a permanent block saying everything is well
   * is how a readout becomes furniture a player stops reading. `hidden` rather
   * than a class, for the reason every other fold here uses it -- a box that is
   * laid out and empty still takes its gap and its border.
   */
  const needsCount = valueText('', 'hud-rooms__needs-count');
  const needsLine = eyebrowText('', 'hud-rooms__needs-line');
  const needsBlock = element('div', {
    className: 'hud-rooms__needs',
    children: [
      element('div', {
        className: 'hud-rooms__needs-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.roomsNeeds)), needsCount],
      }),
      needsLine,
    ],
  });
  /*
   * No initial `hidden` here: `paintNeeds` runs once at construction, below the
   * `panel.body.append`, and it is the single authority on whether this block
   * has a box. A second assignment would be a line no test could fail on --
   * measured, by deleting it and watching every assertion stay green.
   */

  function paintNeeds(): void {
    /*
     * Two states draw nothing and stay two facts: `undefined` is "nothing has
     * been asked" and zero unfinished rooms is "the simulation says every room
     * is finished". Collapsing them here is correct -- neither earns a line --
     * and collapsing them *upstream* would not be, which is why the view model
     * keeps them apart.
     */
    const shown = needs !== undefined && needs.unfinishedRooms > 0 ? needs : undefined;
    needsBlock.hidden = shown === undefined;
    if (shown === undefined) {
      needsCount.textContent = '';
      needsLine.textContent = '';
      delete needsBlock.dataset['unfinished'];
      delete needsBlock.dataset['needs'];
      return;
    }

    needsCount.textContent = t(HUD_MESSAGE_KEY.roomsNeedsCount, {
      unfinished: shown.unfinishedRooms,
      total: shown.totalRooms,
    });
    // The verdict as data as well as as text, so a test can read it without
    // parsing a localized sentence -- the job `data-enclosure` does on the
    // block below, and `data-area` on the block above.
    needsBlock.dataset['unfinished'] = String(shown.unfinishedRooms);
    needsBlock.dataset['needs'] = String(shown.totalNeeds);

    const named = shown.needs.slice(0, ROOM_NEEDS_NAMED_LIMIT);
    const first = named[0];
    if (first === undefined) {
      // The simulation says rooms are unfinished and named nothing this layer
      // can render -- reachable only through a room whose catalogue id the
      // catalogue does not define, which `collectRoomInstances` cannot even
      // enumerate. The count above is still true, so the header stands and the
      // line says nothing rather than inventing a room.
      needsLine.textContent = '';
      return;
    }

    // The object's own name, or the stand-in for one the catalogue does not
    // define. A key either way: nothing here interpolates text this layer
    // authored (ADR 0011).
    const object = t(first.objectLabelKey ?? HUD_MESSAGE_KEY.roomsNeedsObjectUnknown);
    const unlisted = Math.max(0, shown.totalNeeds - named.length);
    needsLine.textContent =
      unlisted === 0
        ? t(HUD_MESSAGE_KEY.roomsNeedsOne, { room: t(first.roomLabelKey), x: first.tile.x, y: first.tile.y, object })
        : t(HUD_MESSAGE_KEY.roomsNeedsMore, {
            room: t(first.roomLabelKey),
            x: first.tile.x,
            y: first.tile.y,
            object,
            count: unlisted,
          });
  }

  /**
   * Which pair of controls the one 44px row holds, and everything that follows
   * from the pending rectangle.
   *
   * `hidden` rather than `display: none` in a stylesheet, for the reason the
   * HUD hides a whole panel that way: a control that is off-screen but still in
   * the tab order is one a keyboard can reach and a player cannot see.
   */
  function paintActions(): void {
    const confirming = pending !== undefined;

    armButton.element.hidden = confirming;
    removeButton.element.hidden = confirming;
    confirmButton.element.hidden = !confirming;
    cancelButton.element.hidden = !confirming;

    armButton.setLabel(t(armed && !removing ? HUD_MESSAGE_KEY.roomsDisarm : HUD_MESSAGE_KEY.roomsArm));
    armButton.element.dataset['armed'] = armed && !removing ? 'true' : 'false';
    // `aria-pressed` says these are toggles rather than one-shot actions;
    // without it a screen reader announces "Stop drawing" with no way to tell
    // that the mode is currently on.
    armButton.element.setAttribute('aria-pressed', armed && !removing ? 'true' : 'false');
    armButton.setDisabled(selectedId === undefined);

    removeButton.setLabel(t(removing ? HUD_MESSAGE_KEY.roomsRemoveActive : HUD_MESSAGE_KEY.roomsRemove));
    removeButton.element.dataset['removing'] = removing ? 'true' : 'false';
    removeButton.element.setAttribute('aria-pressed', removing ? 'true' : 'false');

    /*
     * The label names the action *and* the size, so the control says what
     * pressing it will do to how many tiles rather than leaving the player to
     * read that off the area line above it. A removal gets its own sentence:
     * "Designate 6 x 6" on the control that removes would name the opposite of
     * what it does.
     *
     * Set unconditionally, so it is a function of the pending rectangle and not
     * of whichever rectangle was pending last. A player only ever reads it while
     * the control is showing -- `hidden` decides that -- but a control whose text
     * outlived the rectangle it described is a stale readout, and
     * `tests/browser/app-shell.spec.ts` names controls by their label, so a
     * leftover one makes that test depend on the order its viewports run in.
     */
    confirmButton.setLabel(
      t(removing ? HUD_MESSAGE_KEY.roomsConfirmRemove : HUD_MESSAGE_KEY.roomsConfirm, {
        width: pending?.width ?? 0,
        height: pending?.height ?? 0,
      }),
    );

    if (pending !== undefined) {
      // A rectangle under the authored minimum can be *held* but not
      // confirmed. Disabled rather than absent: the rectangle is real and the
      // player drew it, so the control that would designate it stays where it
      // is and the note beside it says what is wrong. Removing the control
      // would leave a pending rectangle with no visible reason for having no
      // way forward.
      //
      // The simulation refuses the same case independently
      // (`zone.below-minimum-size`), so this is a *report* and not the only
      // guard: a `ZoneRoom` composed anywhere else is still refused. It is also
      // why the disabled control produces no message: a press that does not
      // dispatch is not a refusal, and the note beside it is already saying
      // what is wrong -- so the "exactly one message per refusal" rule is not
      // in play until a command is actually sent.
      confirmButton.setDisabled(pendingIsTooSmall());
    }

    paintArea();
    paintRule();
    paintNote();
    // Last, and from here rather than from each of the six call sites: the fold
    // is a function of `armed` and `pending`, and every state change that
    // touches either already comes through this function.
    paintFold();
  }

  /**
   * A rectangle becomes the pending one, whoever produced it (#411).
   *
   * The single assignment both routes go through -- a finished world gesture
   * and the coordinate form -- so there is exactly one path from "there is a
   * rectangle" to the confirm control, the refusals it can earn and the
   * command the host composes. A second producer that set `pending` its own
   * way would be the parallel path #411's second acceptance criterion forbids.
   */
  function adoptPendingArea(next: RoomsPanelArea | undefined): void {
    pending = next;
    area = undefined;
    // A finished rectangle opens the panel, whatever was folded before it.
    // `drawing()` already ends the pass, which covers the fold this surface
    // applied itself; this line covers the other one -- a player who had
    // folded the panel by hand before arming would otherwise be holding a
    // rectangle whose only two controls are inside a body that is not on
    // screen, which is the defect being fixed rather than a variant of it.
    // It is an *event*, not an invariant: the header control still folds the
    // panel while a rectangle is pending, because a control that did nothing
    // would be worse than a panel in the way.
    if (next !== undefined) playerFolded = false;
    paintActions();
  }

  function paintArea(): void {
    const shown = pending ?? area;
    if (shown === undefined) {
      areaValue.textContent = t(HUD_MESSAGE_KEY.roomsAreaNone);
      delete areaBlock.dataset['area'];
      return;
    }
    areaValue.textContent = t(HUD_MESSAGE_KEY.roomsAreaValue, {
      width: shown.width,
      height: shown.height,
      x: shown.x,
      y: shown.y,
    });
    areaBlock.dataset['area'] = `${shown.x},${shown.y},${shown.width},${shown.height}`;
  }

  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.roomsTitle),
    icon: 'rooms',
    className: 'hud-rooms',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        // The player's press always wins; which of the two states it moves is
        // decided by whether a drawing pass is in progress. Inside one it moves
        // the panel for the rest of that pass -- so a player who wants to read
        // the rule while the tool is armed keeps the panel open until they arm
        // again -- and outside one it is the panel's own fold, as on every other
        // panel in the HUD.
        if (drawing()) drawingFolded = !folded();
        else playerFolded = !playerFolded;
        paintFold();
      },
    },
  });

  /** The fold, as a function of what the player is doing rather than of history. */
  function paintFold(): void {
    panel.setCollapsed(folded());
  }
  /*
   * Before `.hud-rooms__status` and not after it, which is a decision about a
   * measurement rather than about reading order.
   *
   * `.hud-rooms__status` is the panel's last block, and `app-shell.spec.ts`
   * checks the last block against the panel's fold precisely because the last
   * block is the one a floor that is too small pushes out. Putting this block
   * after it would silently retarget that assertion at a box that is `hidden`
   * in the state the assertion runs in -- a green test measuring nothing. So
   * the rule readout keeps its place at the foot of the panel and this sits
   * above it, between the note line the player reads while drawing and the
   * rule they read before it.
   */
  panel.body.append(
    catalogue.element,
    element('div', { className: 'hud-rooms__map', children: [actionsRow, areaBlock, note] }),
    needsBlock,
    element('div', { className: 'hud-rooms__status', children: [ruleBlock, enclosureBlock] }),
  );
  paintCatalogue();
  paintActions();
  paintEnclosure();
  paintNeeds();

  return {
    element: panel.element,
    controls: [confirmButton.element],
    submitControl: confirmButton.element,
    getSelectedRoomId: () => selectedId,
    getPendingArea: () => pending,
    isArmed: () => armed,
    isRemoving: () => removing,
    setArea(next: RoomsPanelArea | undefined): void {
      area = next;
      paintArea();
    },
    setPendingArea(next: RoomsPanelArea | undefined): void {
      // The dragged rectangle is taken into the coordinate fields as well, so
      // the two routes hold one rectangle between them rather than two: a
      // player who drags 6x5 and wanted 6x6 can nudge the height instead of
      // dragging again, and a form that still showed 0,0,1,1 beside a pending
      // 12x9 would be a second, stale statement of the same thing.
      if (next !== undefined) showCoordinates(next);
      adoptPendingArea(next);
    },
    setZoningNotice(next: HudZoningNoticeViewModel | undefined): void {
      notice = next;
      paintEnclosure();
      paintNote();
    },
    setRoomNeeds(next: HudRoomNeedsViewModel | undefined): void {
      needs = next;
      paintNeeds();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // Leaving the tab must hand the pointer back to the camera, exactly as
      // the Build panel does: a tool that stayed armed behind a hidden panel
      // would swallow every click on a world the player thought they were only
      // looking at. The pending rectangle goes too -- confirming a rectangle
      // from a surface that is no longer on screen is a command with no visible
      // origin.
      if (!visible) {
        pending = undefined;
        area = undefined;
        // The readout is *pulled* while this tab is the one showing, so leaving
        // it stops the refresh -- and a readout nothing is refreshing goes
        // stale in silence. Cleared rather than frozen, for the reason the
        // counts empty when a session ends: what is on screen must be
        // something a system is still answering for.
        needs = undefined;
        paintNeeds();
        if (armed) {
          armed = false;
          removing = false;
          options.onArm(false, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing: false });
        }
        paintActions();
      }
    },
  };
}
