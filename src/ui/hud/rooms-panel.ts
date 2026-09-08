import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { createCollapsibleSection, type CollapsibleSection } from '../primitives/collapsible-section';
import { describeBy, element, eyebrowText, nextUiId, screenReaderText, valueText } from '../primitives/dom';
import { ambientFocusOwner, handOffFocus, holdsFocus } from '../primitives/focus-handoff';
import { createListRow, type ListRow } from '../primitives/list-row';
import { createNumberField, type NumberField } from '../primitives/number-field';
import { createPanel } from '../primitives/panel';
import { rovingTabStop } from '../primitives/roving-focus';
import { bindRovingFocusKeydown } from '../primitives/roving-focus-keydown';
import { HUD_MESSAGE_KEY } from './messages';
import { pressArm, toggleRemovalMode } from './tool-arming';
import type {
  HudLocalizer,
  HudRoomEnclosureRequirement,
  HudRoomNeedViewModel,
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
 * **And the confirm ends the pass, so the panel stays back** (#684). This
 * paragraph described the whole cycle until then and was silent about what
 * happens after a designation, which is where the defect lived: the pass used
 * to resume with the tool still armed and the panel folded over the only
 * control that says so. `standDownAfterConfirm` carries the reasoning, the
 * option that was rejected, and what it costs.
 *
 * **The confirm gates removals too**, and that is deliberate rather than
 * uniformity for its own sake. A removal drag grows every tile it covers into
 * the whole room instance that claims it, so clipping the corner of a 6x6
 * canteen removes all 36 tiles. (This read "that tile's whole connected
 * same-type run" until #337, which is a different rule with the same
 * consequence here and a worse one next door: it took the neighbouring room
 * too. The tile now resolves through the instance's rectangle.) That is the
 * right behaviour -- the alternative
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
  /**
   * Whether an arbitrary rectangle's own perimeter is walled in (issue #493).
   *
   * A **query**, not a report: everything else in this options bag is a
   * fire-and-forget callback the panel calls once something has happened, and
   * this is the one the panel calls to find out something *before* it decides
   * what to paint. It exists because this panel may not import
   * `src/simulation/**` at all and holds no edge data of its own -- the same
   * gap `paintNote`'s own history already named as the reason the pre-confirm
   * warning "cannot be built here". The host answers it from whichever tool
   * knows the world, or `'open'` when there is none.
   *
   * Called for **both** producers of a pending rectangle: a finished world
   * gesture arrives already classified (the host computed it before calling
   * `setPendingArea`, since a drag has a scene to ask), but the
   * typed-coordinates form below has no drag and no world of its own to
   * consult, so it calls this directly. Both must reach the same verdict for
   * the same four numbers, or #411's guarantee that "nothing downstream can
   * tell which [producer] it was" would quietly stop being true the moment one
   * producer got a warning the other could not.
   */
  readonly classifyArea: (area: RoomsPanelArea) => 'sealed' | 'open';
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
  /**
   * A finished gesture: the rectangle is now pending confirmation.
   *
   * `enclosure` is the host's answer to `options.classifyArea` for this same
   * rectangle, already computed before the call so the host's own
   * `classifyArea` is asked exactly once per rectangle rather than once here
   * and once again by the panel. Absent -- rather than asked for again -- when
   * `area` is `undefined`, matching every other field this call clears.
   */
  setPendingArea(area: RoomsPanelArea | undefined, enclosure?: 'sealed' | 'open'): void;
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
  /**
   * Puts the panel's tool down, as `Escape` on the world asks (issue #959).
   *
   * The Build panel's `standDown` in every respect that matters, including
   * doing nothing when the panel is holding nothing. What it does **not**
   * touch is the pending rectangle: a drag that has been released is a
   * proposal the player still has a Confirm button for, and taking it away
   * would make one key undo a decision they made with the pointer. Leaving
   * the tab does take it, and for a reason that does not apply here -- the
   * Confirm would be off screen.
   */
  standDown(): void;
  setVisible(visible: boolean): void;
}

/**
 * How many unmet requirements the readout names by name.
 *
 * ## What this said, and what replaced it
 *
 * **It was `1`, and the comment called that "a measurement rather than an
 * opinion".** In full, so the correction can be checked against it: *"The
 * panel's own height is fixed by the rail and not by its content -- measured on
 * the assembled page, a block added to `.ui-panel__body` shrinks
 * `.hud-rooms__list` and leaves `.hud-rooms` at 480.1px at 1280x800, 451.1px at
 * 375x812 and 338.1px at 900x600 -- so what this readout actually spends is the
 * catalogue list's slack, and that list stops shrinking at its one-row floor of
 * 44px. At 900x600 the list is **already on that floor** with the readout
 * hidden. The measurement: a header line and three rows came to 101.3px there
 * and put the panel 58px into overflow ... The slack there is about 43px, which
 * buys a header line and one more."*
 *
 * **Two things about it were true and one was already false when #529 read
 * it.** The mechanism is still exactly right: the panel's height is the rail's,
 * a block here spends the catalogue list's slack, and the list floors at one
 * row. The 43px is not, and the reason is dated rather than guessed -- ADR 0039
 * and #411 moved the coordinate form *into* `.hud-rooms__list`, and
 * `hud.css`'s own `.hud-rooms > .ui-panel__body` comment records the state
 * after that move: *"at all five viewports the browser suite visits, the rail
 * today has room for the panel's whole content, so nothing is being squeezed
 * and the floor is not what decides the layout."* A budget measured while a
 * 44px form still sat in the panel body was spent before this readout ever
 * asked for it.
 *
 * The other half of the old sentence was a misreading of its own units: *three
 * rows* were three 44px `ListRow`s. This readout does not draw rows. It draws
 * eyebrow lines at 13.2px, which is what `.hud-rooms__rule-block` already
 * stacks two of for 30.4px including its gutters -- so "a header line and one
 * more" was never the ceiling that 101.3px established.
 *
 * ## The number, re-measured
 *
 * Measured on the assembled page, every one of the five viewports the browser
 * suite visits, with every one of the eighteen room types selected in turn
 * (`app-shell.spec.ts`, "no room type in the catalogue pushes the Rooms panel
 * past its fold"). Slack before the panel's last block crosses its fold, and
 * the catalogue list's own slack above its one-row floor, which is what a block
 * added here spends:
 *
 * | viewport | fold slack | catalogue-list slack |
 * | --- | --- | --- |
 * | 900x600, `room.staff-room` | 7.89px | 51.2px |
 * | 900x600, `room.classroom` | 7.89px | 51.2px |
 * | 375x812 | 7.89px | 140.2px |
 * | 1024x768 | 7.89px | 145.2px |
 * | 1280x720 | 7.89px | 109.2px |
 * | 1440x900 | 7.89px | 244.2px |
 *
 * **This table was re-measured and it moved, so both readings are kept.** It
 * said, when this constant was raised:
 *
 * > | 900x600, `room.kitchen` | **3.58px** | **0.0px** |
 * > | 900x600, `room.staff-room` | 7.89px | 8.9px |
 * > | 375x812 | 7.89px | 89.9px |
 *
 * and concluded that *"a fourth object requirement on any room is now a layout
 * change as well as a balance change"*. **That conclusion is withdrawn**, and
 * not because it was wrong -- it was right about the panel it measured. The
 * panel changed underneath it: `.hud-rooms__area` and `.hud-rooms__enclosure`
 * now fold when they have nothing to report, which is 34.3px of placeholder
 * this panel used to draw in every state, and `.hud-rooms[data-needs]` donates
 * the catalogue's floor while a room is unfinished. `room.kitchen` is no longer
 * in the tightest six at any viewport, and the deepest room the catalogue can
 * offer now leaves the **same 7.89px** as every other -- which is this panel's
 * designed gap rather than a margin that happens to be positive.
 *
 * **900x600 is still the binding viewport and the phone is still not**, which
 * remains the reversal of the assumption this constant was raised under: the
 * Rooms panel gets 451.1px of rail at 375x812 against 338.1px at 900x600, and
 * that is the whole of the difference. What changed is how much of it is spent,
 * not which viewport is tightest. The catalogue-list slack at 900x600 went from
 * 8.9px to 51.2px, so the figure a block added here spends is no longer
 * within one line of nothing.
 *
 * The readout itself, at the deepest shape the shipped catalogue can produce --
 * header, room line and three object lines -- **measures 100px**
 * (`ui-shell.spec.ts`, case 4).
 *
 * ## So what this number is, exactly
 *
 * **Four: one more than the deepest shipped room, and it is a bound on future
 * content rather than a fact about the rail.** That distinction matters, and
 * the old comment's shape invited getting it wrong. Changing this constant
 * changes nothing a player sees today, because no room authors more than three
 * object requirements -- what renders is bounded by *content*, not by this. Its
 * only job is to decide what happens when content grows past what the panel was
 * measured against, and the choice is between truncating with `roomsNeedsItemMore`
 * and drawing every line.
 *
 * Four rather than three, so a room given a fourth requirement is *drawn* and
 * the fold assertion **fails naming that room**, rather than being quietly
 * truncated to three and passing. #535 decision 2 is "show every missing item";
 * a silent truncation is that decision being undone by a constant, and a loud
 * failure is the owner finding out that the panel cannot take a fourth. The
 * truncation still exists above four, for the pathological case
 * `roomRequirementSchema` permits -- 32 requirements on one room would draw 34
 * lines and destroy the panel -- and that is what a cap is for.
 *
 * ## Why a cap at all, when content cannot reach it
 *
 * No shipped room can: the deepest is `room.kitchen` at **three** object
 * requirements (stove, prep counter, fridge), and the most *items* is
 * `room.canteen` at six -- which is two lines, because quantities are what buy
 * the compression (`2 x Dining Table`, `4 x Bench`). Issue #529 said "a cell
 * needs 6 items; a kitchen 7"; both figures were a misreading of its own
 * transcript, where `and 5 more` is the prison-wide remainder across three
 * cells and `1 of 7` is `roomsNeedsCount`'s unfinished-of-total-*rooms*.
 * Recomputed over all 18 definitions in `src/content/room-catalog.ts`.
 *
 * The cap exists because `roomRequirementSchema` permits 32 requirements on a
 * room and content is authored, not fixed: a room balanced upward tomorrow must
 * not silently push the rule readout below the panel's fold, which is #174's
 * defect and what `tests/browser/app-shell.spec.ts`'s fold assertion catches.
 * `roomsNeedsItemMore` carries the overflow, and it is a guard rather than a
 * state any player reaches today.
 *
 * `HudRoomNeedsViewModel.needs` stays a list whatever this is, which is the
 * point of the number living here rather than there: it is a fact about how
 * much of the rail this panel can spend, not about what the simulation found.
 * The boundary carries the answer; the panel decides how much of it fits.
 */
export const ROOM_NEEDS_NAMED_LIMIT = 4;

/**
 * How many *rooms* the readout describes at once, and therefore how many detail
 * projections one `read()` asks for.
 *
 * **One, and it is a judgement about what a player is doing rather than a
 * height measurement.** A player reading this block is trying to finish
 * something; there is no surface in this application that audits everything,
 * and #529's finding is that there was none that enumerated even one room. So
 * the block names one room *completely* -- every object it is short, with how
 * many of each -- rather than one line each from several rooms, which is the
 * shape that produced "Cell at 2, 2 needs Bed, and 5 more" and told a player
 * nothing they could act on.
 *
 * Which room is `unfinishedRoomIds`' decision and is documented there: the one
 * nearest to finished, so the readout offers the cheapest completion available
 * and moves on when it is taken.
 *
 * It is also the request budget, which is why it is a constant and not a
 * literal: `RoomNeedsReader.read` spends at most `1 + ROOM_NEEDS_ROOMS_LIMIT`
 * messages, so the worker's cost stays flat as a prison grows. Raising this to
 * show a second room would double the per-tick message count for a block that
 * would then have to fit twice the lines -- both of the things this panel is
 * short of.
 */
export const ROOM_NEEDS_ROOMS_LIMIT = 1;

/**
 * Which of the two things the "not ready" block can be about, or neither
 * (ADR 0028 phase 5).
 *
 * - `'none'` -- nothing has been asked, or the projection says every room is
 *   finished and none is full. The block is not drawn at all, which is what
 *   keeps it from becoming furniture in a panel whose always-visible budget
 *   ADR 0022 measured at 7.9px.
 * - `'unfinished'` -- at least one designated room is short something the
 *   player has not built. `HudRoomNeedsViewModel.unfinishedRooms`.
 * - `'at-capacity'` -- every room is finished and at least one of them cannot
 *   take another user right now. `HudRoomNeedsViewModel.atCapacity`.
 *
 * ## Why one block and never both, which is a measurement and not taste
 *
 * `ROOM_NEEDS_NAMED_LIMIT` above carries the figures: the readout's deepest
 * shipped shape -- header, room line and three object lines -- **measures
 * 100px**, and the panel's slack at its binding viewport is **7.89px**. A
 * second subject drawn beside the first is a second header, a second room line
 * and at least one more item line on top of that 100px, so it does not fit and
 * no donation is left to pay for it. Given the choice, the block shows the
 * unfinished rooms: a room the player has not finished building is the cheaper
 * thing to act on, and it is also the state a player reaches first.
 *
 * **What that costs, stated rather than discovered.** A prison with one
 * unfinished cell and a chronically full shower room shows the cell and says
 * nothing about the shower room until the cell is finished. That is a real
 * loss, and the alternative -- a second block -- is a layout change whose only
 * gate is a browser test. Whether the panel should grow to hold both is a
 * question for whoever next measures this panel.
 *
 * A pure function, exported, and called by `paintNeeds` rather than inlined
 * there, for the reason `docs/AGENT_WORKFLOW.md` §2 gives: `vitest.config.ts`
 * runs in `node` with no jsdom, so a decision taken inside a function that
 * touches `document` is unreachable from `pnpm test` *at all* -- a mutation of
 * it would survive because nothing could observe it. This one is observable.
 */
export function roomNeedsSubjectOf(needs: HudRoomNeedsViewModel | undefined): 'none' | 'unfinished' | 'at-capacity' {
  if (needs === undefined) return 'none';
  if (needs.unfinishedRooms > 0) return 'unfinished';
  return needs.atCapacity.length > 0 ? 'at-capacity' : 'none';
}

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

/**
 * `HudRoomViewModel.tint` (#1021, ADR 0098 option A) as a CSS colour.
 *
 * The value is a Phaser-style 24-bit `0xRRGGBB` number -- the same one
 * `WorldScene` tints a zoned room's tiles with -- so this is arithmetic, not a
 * second colour table: `zoningTint` in `src/rendering/world/appearance.ts` is
 * the one place a room's hue is chosen, `src/main.ts`'s `roomCatalogue()`
 * reads it onto every row's `tint` field, and this converts the same number
 * to the string form CSS wants. Nothing here could drift from the map,
 * because nothing here decides a colour.
 *
 * Exported and module-scoped rather than a closure inside `createRoomsPanel`,
 * so the conversion has a headless test of its own
 * (`tests/unit/ui-hud-rooms-panel.test.ts`) rather than only the browser spec
 * that exercises it end to end -- `vitest.config.ts` runs with no DOM, but a
 * pure arithmetic function does not need one.
 */
export const tintToCssColor = (tint: number): string => `#${(tint & 0xffffff).toString(16).padStart(6, '0')}`;

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
  /**
   * Whether `pending`'s own perimeter is walled in, or `undefined` while
   * nothing is pending.
   *
   * Set alongside every assignment to `pending` rather than derived from it,
   * because deriving it would mean calling `options.classifyArea` again from
   * inside this module -- and `setPendingArea`'s own contract is that the host
   * already asked once. Cleared everywhere `pending` is, so the two can never
   * name different rectangles.
   */
  let pendingEnclosure: 'sealed' | 'open' | undefined;
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
  /*
   * The eighteen rows, in a box of their own inside the scroller.
   *
   * ADR 0039 put the coordinate form inside `.hud-rooms__list` because that
   * scroller is the one box in this panel with any slack -- so the list is a
   * *mixed* container, and `role="radiogroup"` cannot go on it without
   * swallowing four number fields and a disclosure into the group. This box
   * holds the radios and nothing else, and the form stays its sibling exactly
   * where the ADR measured it.
   *
   * It costs no height: `hud.css` gives it the same column flow the list
   * itself has, so the rows stack as they did and the twelve-state measurement
   * in `app-shell.spec.ts` is what checks that claim rather than this comment.
   */
  // Named from the section it heads rather than from a key of its own. That
  // key reads "Room type and area" and this group is only the room types, so a
  // narrower name was considered and refused: the section header carrying that
  // exact text sits immediately before this box in reading order, and a second,
  // near-identical name is noise a screen-reader player hears every time they
  // enter the group. `status-strip.ts` labels its groups from a message key the
  // same way; `choice-group.ts` uses `aria-labelledby` because it renders a
  // legend of its own, and this box does not.
  const catalogueRows = element('div', {
    className: 'hud-rooms__rows',
    attributes: { role: 'radiogroup', 'aria-label': t(HUD_MESSAGE_KEY.roomsCatalogue) },
  });
  catalogueList.append(catalogueRows);
  const rows = new Map<string, ListRow>();

  /*
   * The catalogue is one choice, so it is one tab stop (#411).
   *
   * The typed route this panel carries was reachable from the day ADR 0039
   * landed, and measured: `app-shell.spec.ts` walks it and bounds every hop.
   * What it was not was *short*. The catalogue is eighteen rows, each a
   * `<button>` and therefore each its own tab stop, and the coordinate form is
   * the last child of the same scroller -- so a player crossed the remainder of
   * the list to reach it on every room they ever zoned. Measured on the
   * assembled page: eighteen `Tab` presses to the catalogue and fourteen more
   * to the disclosure, with `room.cell` -- the one room the whole game is
   * gated on, no accommodation and no admission -- drawn fifth. Eighteen tab
   * stops
   * for one choice is what the WAI-ARIA composite-widget rule exists to
   * prevent, and the remedy is the roving tab stop in
   * `src/ui/primitives/roving-focus.ts`: the group costs one `Tab`, and the
   * arrows move inside it.
   *
   * **The role is not decoration here, it is the half that keeps this from
   * being a regression.** A roving `tabindex` with no announced grouping would
   * turn "eighteen tedious stops" into "seventeen rows a sighted keyboard-only
   * player can no longer reach at all", because `Tab` is the only mechanism
   * they have and nothing would have told them to try an arrow. `radiogroup` /
   * `radio` is what tells them: a screen reader says "Cell, radio button, 1 of
   * 18, selected", which names the ring, the position and the selection in one
   * breath -- and `aria-checked` replaces the "Selected" badge as the *machine*
   * carrier of which room type is chosen. The badge stays as the visual one.
   */
  const rowOrder: string[] = model.rooms.map((room) => room.roomId);

  const paintCatalogue = (): void => {
    const selectedIndex = selectedId === undefined ? undefined : rowOrder.indexOf(selectedId);
    const tabStop = rovingTabStop(
      rowOrder.length,
      selectedIndex === undefined || selectedIndex < 0 ? undefined : selectedIndex,
    );
    for (const [id, row] of rows) {
      row.setBadge(id === selectedId ? { tone: 'info', text: t(HUD_MESSAGE_KEY.roomsSelected) } : undefined);
      row.element.dataset['selected'] = id === selectedId ? 'true' : 'false';
      row.element.setAttribute('aria-checked', id === selectedId ? 'true' : 'false');
      // Exactly one `0` in the group, and it follows the selection so that
      // tabbing back in lands on the player's own choice rather than at the
      // top of a list they have already answered.
      row.element.tabIndex = rowOrder[tabStop ?? -1] === id ? 0 : -1;
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
    // `role="radio"` on a real `<button>`: the role carries the single-select
    // meaning, and the button carries the activation, so `Enter` and `Space`
    // still choose a room type through exactly the same `onActivate` a pointer
    // press reaches. No second path -- the same rule #411's second acceptance
    // criterion puts on the rectangle applies to the choice of room.
    row.element.setAttribute('role', 'radio');

    /*
     * The swatch (#1021): the one thing this row was missing that the map
     * already had. Two passes had confirmed `HudRoomViewModel.tint` was
     * computed and read by nothing, so the catalogue and the map could name
     * the same room in two different colours and no test would notice; this
     * is that reader.
     *
     * `aria-hidden` and no text of its own -- it is decoration *beside* an
     * accessible name the row already has (`t(room.labelKey)`, on the label
     * span this is inserted next to), never instead of one. #1038 measured
     * that this palette cannot carry identity on its own at any spacing --
     * the worst pair of the 18 catalogue hues is 5.30 delivered units apart
     * against a per-pixel sigma of 15.54 -- so a colour-blind player, or any
     * player, gets exactly what they had before: the name. What the swatch
     * adds is for the player who *can* resolve hue: the same accent they will
     * see painted on the tile the moment they designate it, so the two no
     * longer have to be taken on faith.
     *
     * Inserted before the label rather than appended, so reading order stays
     * icon, swatch, name -- a trailing badge or the roving-focus selection
     * marker still lands after the name, unmoved.
     */
    const swatch = element('span', {
      className: 'hud-rooms__row-swatch',
      attributes: { 'aria-hidden': 'true' },
    });
    swatch.style.backgroundColor = tintToCssColor(room.tint);
    const labelElement = row.element.querySelector('.ui-row__label');
    row.element.insertBefore(swatch, labelElement);

    rows.set(room.roomId, row);
    catalogueRows.append(row.element);
  }

  /*
   * The arrows, which are what the one tab stop above buys back.
   *
   * Focus moves; selection does not. A radiogroup conventionally selects as it
   * moves, and that convention is refused here for a reason this panel can
   * measure: choosing a room type while the world tool is armed re-arms it
   * (`options.onArm` below), so selection-follows-focus would re-arm the tool
   * once per arrow press and a player arrowing from Cell to Utility room would
   * fire it seventeen times. Explicit activation is also what the pointer does,
   * so the two producers of a selection stay the same gesture.
   *
   * `preventDefault` only for the keys actually consumed -- `rovingFocusMove`
   * answers `undefined` for everything else, and an arrow that is not ours must
   * stay the browser's, or the scroll region this list *is* would stop
   * scrolling.
   *
   * Wired through `bindRovingFocusKeydown` rather than a listener written
   * here: this panel had the same gap `build-panel.ts` did --
   * `preventDefault()` with no `stopPropagation()` -- which left the same
   * `ArrowDown`/`Up`/`Left`/`Right` free to also reach `WorldScene`'s
   * `window`-level camera binding and pan the world underneath the player
   * -- measured, on 2026-09-01, against the Build catalogue rather than this
   * panel, but the same code shape. Fixed once, in the wiring both panels now
   * share, rather than twice.
   */
  bindRovingFocusKeydown(catalogueRows, {
    datasetAttribute: 'room',
    order: () => rowOrder,
    rows,
  });

  // An empty list must say so. A blank rectangle is indistinguishable from a
  // broken one -- the same rule the Build panel's catalogue follows. Reachable
  // only from a host that passes no rooms; the shipped catalogue has 18.
  //
  // Beside the radiogroup rather than inside it: this row is a sentence, not a
  // choice, and a `radiogroup` whose only member is a non-interactive readout
  // would announce "one of one" for something there is no way to select.
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
   *   - and they *have* to be usable twice. `NumberField` reported on `change`
   *     alone, and a field re-entered with the value it already holds fires
   *     nothing -- so a form that only listened to its fields would go dead
   *     after the first designation, with four numbers on screen and no way to
   *     say them again. Measured: the keyboard removal spec in
   *     `tests/browser/app-shell.spec.ts` ran out of Tab presses looking for a
   *     confirm control that a re-typed identical rectangle never revealed.
   *
   * **Amended 2026-08-29 (#548).** That third reason is now the weakest of the
   * three, and the first is the strongest -- marked rather than overwritten,
   * because the press is still right and the reason it is right has moved.
   * `NumberField` now reports on `input` as well as on `change`, so a re-typed
   * identical rectangle *does* reach its fields and the going-dead failure
   * above could no longer happen by that route. What replaces it is the first
   * bullet, sharpened: `input` fires on every keystroke, so a form that adopted
   * a rectangle from its fields would now adopt one **per keystroke** --
   * designating `1`, `15` and `152` on the way to a width the player had not
   * finished saying. The button is what keeps a rectangle something the player
   * states rather than something they are overheard assembling.
   */
  const coordinatesSubmit: ActionButton = createActionButton({
    // No icon and no tone, exactly as the Build panel's own submit carries
    // neither: the primary-tone control on this panel is "Draw on map", and a
    // second one would argue with it about which route is the main one.
    label: t(HUD_MESSAGE_KEY.roomsCoordinatesSubmit),
    onActivate: () => {
      const next = { x: coordX, y: coordY, width: coordWidth, height: coordHeight };
      // This producer has no world of its own to ask (#411's header explains
      // why: it drags nothing), so it asks the host directly rather than
      // relying on a caller to have classified it already, which is what
      // keeps this route reaching the same warning a drag does.
      adoptPendingArea(next, options.classifyArea(next));
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
  /*
   * The third rule: what the room type will need standing in it (#529).
   *
   * A box rather than a fixed line, because unlike the two above it there are
   * *n* of them -- and `n` is a fact about content, not about this panel:
   * `room.yard` authors none, `room.kitchen` three. Same shape as
   * `.hud-rooms__needs-items` one block down, and it sits inside
   * `.hud-rooms__rule-block`, which stacks its lines with no gap, so each object
   * costs one 13.2px line and nothing else.
   *
   * **Here and not on the catalogue rows themselves**, which was the other
   * reading of #535's "the catalogue row shows requirements before the player
   * zones". The rows are `role="radio"` members of a `radiogroup` with a roving
   * tabindex (#411, #524): they are *one choice*, and a row carrying three
   * extra lines would be eighteen rows carrying up to three extra lines each,
   * in the one box in this panel that already always scrolls. This block is the
   * panel's existing answer to "state the rule for the selected type" -- issue
   * #529 cites `paintRule` by name when it says the catalogue carries only
   * minimum size and enclosure -- so extending it adds no tab stop, touches no
   * ARIA, and states the requirements for exactly the room the player is
   * looking at.
   */
  const ruleObjects = element('div', { className: 'hud-rooms__rule-objects' });
  const ruleBlock = element('div', {
    className: 'hud-rooms__rule-block',
    children: [ruleMinimum, ruleEnclosure, ruleObjects],
  });

  function paintRule(): void {
    const room = selectedRoom();
    const minimum = room?.minimum;
    ruleMinimum.textContent =
      minimum === undefined
        ? t(HUD_MESSAGE_KEY.roomsMinimumNone)
        : t(HUD_MESSAGE_KEY.roomsMinimum, { width: minimum.width, height: minimum.height });
    ruleEnclosure.textContent = t(requirementLabelKey(room?.enclosure ?? 'none'));

    /*
     * Rebuilt rather than reconciled, for `paintNeeds`' reason: the list is a
     * function of the selected room type and has no identity to carry across a
     * change of selection.
     *
     * **No room selected draws nothing at all**, which is not the same as a room
     * that needs no objects. The two lines above answer "no minimum size" and
     * "no enclosure rule" in that state because those are statements this panel
     * can make about *nothing selected*; "no objects needed" is not -- it would
     * be a claim about a room type the player has not chosen. That asymmetry is
     * inherited: `selectedRoom()` is `undefined` before the first press, and
     * `roomsMinimumNone` was already the answer for it.
     */
    ruleObjects.replaceChildren();
    if (room === undefined) return;
    if (room.objectRequirements.length === 0) {
      ruleObjects.append(eyebrowText(t(HUD_MESSAGE_KEY.roomsRequiresNone), 'hud-rooms__rule'));
      return;
    }
    for (const requirement of room.objectRequirements) {
      // The object's own name, or the stand-in the needs readout already uses
      // for one the catalogue does not define -- reused rather than a second
      // stand-in drafted for the identical hole. A key either way: nothing here
      // interpolates text this layer authored (ADR 0011).
      const line = eyebrowText(
        t(HUD_MESSAGE_KEY.roomsRequiresObject, {
          count: requirement.quantity,
          object: t(requirement.labelKey ?? HUD_MESSAGE_KEY.roomsNeedsObjectUnknown),
        }),
        'hud-rooms__rule',
      );
      // Which requirement the line is about, as data, so a test reads an id
      // rather than parsing a localized sentence -- the job `data-room` does on
      // the catalogue rows.
      line.dataset['object'] = requirement.objectId;
      line.dataset['quantity'] = String(requirement.quantity);
      ruleObjects.append(line);
    }
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
      //
      // **This used to read `removing = false; armed = !armed;`, which is the
      // defect issue #735 is about.** Coming *out* of removal `armed` was
      // already `true` -- entering removal arms the tool, in `removeButton`
      // below -- so negating it stood the tool down instead of arming it to
      // draw: the player asked to draw and got no tool. That is the same
      // shape #689 fixed on the removal control itself, on this control
      // instead, so the fix goes through the same reducer family:
      // `pressArm` (`tool-arming.ts`) reads `removing` and `armed` *before*
      // either changes, so it can tell a fresh press apart from a switch out
      // of removal.
      const wasRemoving = removing;
      const wasArmed = armed;
      const nextArming = pressArm({ armed, removing });
      armed = nextArming.armed;
      removing = nextArming.removing;
      // A fresh press of "Draw on map" is a fresh statement of intent, so the
      // panel goes back out of the way even if the player pulled it open
      // during the last pass -- and a switch out of removal is that same
      // fresh statement, even though `armed` does not change value across it
      // (#735): the fold that had been pulled open over "Stop removing" is
      // not the fold this drawing pass needs. Only on those two transitions:
      // re-folding a panel the player opened, on a press that changed neither
      // what the tool is about to do, would be the surface arguing with them.
      if (armed && (wasRemoving || !wasArmed)) drawingFolded = true;
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
   * **This sentence was false for one case, from the day `UnzoneRoom` shipped
   * until issue #478.** A cell that had acquired an occupant -- an ordinary
   * admission into a bed the player zoned, nothing exotic -- was refused with
   * `room-occupied` unconditionally, and stayed refused for as long as that
   * prisoner's sentence ran: there was no command anywhere in `src/` that moved
   * a prisoner out of accommodation, so this button, pressed on that cell, did
   * nothing forever. That was not "every mistake this panel can make"; it was
   * every mistake except the one a learning player was most likely to make
   * second. #478 closed it by relocating the resident to other suitable
   * accommodation before the removal proceeds
   * (`PrisonerOperationsRuntime.relocateResidentsOutOf`,
   * `RoomZoningService.unzone`'s "Occupancy" section) and refuses only when the
   * prison genuinely has nowhere left to put them -- at which point this
   * sentence is true again, because there is no mistake this panel made that
   * a player can still be permanently stuck behind.
   *
   * It needs no selected room type, and that asymmetry is real rather than an
   * oversight: a removal names no room type, because what comes out is whatever
   * the rectangle covers.
   */
  const removeButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsRemove),
    onActivate: () => {
      // Switching mode discards a pending rectangle rather than reinterpreting
      // it. The same four numbers mean "designate this" or "remove whatever is
      // here", and silently changing which would be the panel deciding
      // something the player did not say.
      pending = undefined;
      pendingEnclosure = undefined;
      const wasArmed = armed;
      // Arming to remove is arming, and "Stop removing" stands the whole tool
      // down instead of handing back a designating one that still holds the
      // pointer. **This line read `armed = removing || armed` until #689**,
      // which is right on the way in and keeps whatever `armed` was on the way
      // out. Both halves now live in `toggleRemovalMode`, which the Build
      // panel's removal control calls too -- its docblock carries the
      // reasoning, including why the tool does not return to a previously
      // selected mode.
      const nextArming = toggleRemovalMode({ armed, removing });
      armed = nextArming.armed;
      removing = nextArming.removing;
      // Arming to remove starts a drawing pass on the same terms as the button
      // beside it.
      if (armed && !wasArmed) drawingFolded = true;
      paintActions();
      options.onArm(armed, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing });
    },
  });
  removeButton.element.classList.add('hud-rooms__remove');

  /**
   * Hands the keyboard on when this row swaps one pair of controls for the
   * other.
   *
   * The confirm row is four controls sharing one 44px box, of which two are
   * `hidden` at any moment (`paintActions`), and `hidden` blurs whatever was
   * standing on it. Pressing *Designate* therefore drops a keyboard player at
   * the top of the document **before** the command is even dispatched -- so
   * this is not the busy group's loss to give back (`createBusyGroup` in
   * `src/ui/primitives/async-action.ts` only restores focus it took by
   * disabling), and it has to be handed on here, by the surface that knows
   * which control replaced which.
   *
   * *Arm* is where it goes, for both the confirm and the cancel: it is the
   * control that takes the same place in the same row, and it is what a player
   * who has just designated a room reaches for to draw the next one. It is
   * read **before** the repaint, because after it the element is already
   * hidden and already blurred, and `handOffFocus` declines when *Arm* is
   * disabled for want of a selected room type -- which leaves focus where the
   * browser put it rather than forcing it somewhere useless.
   */
  const handConfirmRowFocusToArm = (from: HTMLElement): (() => void) => {
    const held = holdsFocus(ambientFocusOwner(), from);
    return () => {
      if (held) handOffFocus(armButton.element);
    };
  };

  /**
   * The confirm ends the drawing pass, and the tool goes with it (#684).
   *
   * **The panel used to leave the tool armed here**, deliberately: a player
   * designating a row of cells could drag the next rectangle without touching
   * the panel again, and `app-shell.spec.ts` said so in as many words -- *"the
   * tool stays armed through a confirm, so this is another drag and nothing
   * else"*. That reasoning is kept rather than deleted because it is still the
   * cheaper loop for a player who knows about it. What it did not survive is
   * the state being invisible at the moment it changes.
   *
   * `drawing()` is true the instant the rectangle clears, so the panel folds
   * itself to its header on the same press -- and the one control that reports
   * the tool's state, this row's arm button, folds away with it. Measured on
   * the mounted HUD before this change, reading the panel at each step: after
   * the confirm the host had been sent one `arm-room-tool` and it said
   * `armed: true`, the panel was `data-collapsed="true"`, and the arm control
   * had **no box at all**. A player coming back for a second room therefore
   * opens the panel and presses the control that starts drawing, and that press
   * sends `armed: false`. The next drag does nothing -- `RoomTool.place`
   * returns on a disarmed tool -- and the third press arms again, so pressing
   * repeatedly eventually works and never teaches what happened. It cost a
   * playtest run outright on `main` (issue #684, and
   * `docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` reached
   * the same state from the other direction).
   *
   * **The label was honest throughout and that is not enough.** `paintActions`
   * has always set "Stop drawing", `data-armed` and `aria-pressed` on the armed
   * control, so a player who opens the folded panel and *reads* the button
   * before pressing it is told the truth. The whole failure is that reading it
   * costs a press first, on a panel that folded itself, in the one state where
   * the player's model -- "press the button, then draw" -- says there is
   * nothing to read.
   *
   * So the arm press becomes one statement of intent per room: it arms, the
   * panel gets out of the way, the rectangle is drawn, the confirm designates
   * *and stands the tool down*. The fold then ends on its own -- `drawing()` is
   * false with nothing armed -- so the panel comes back saying "Draw on map",
   * which is exactly what the player is about to press. The alternative
   * considered and rejected was to keep the tool armed and hold the panel open
   * instead: at 375x812 with both rail panels expanded the largest square of
   * bare world on the whole page is 16px (see `drawingFolded`), so a panel that
   * stayed open while armed would leave nowhere to draw the second room at all.
   *
   * It costs one press per extra room, paid by the player who already knew the
   * tool stayed armed. It buys the state never being hidden at the moment it
   * changes, which is the thing the owner's standing directive rules out.
   *
   * A **discard** still leaves the tool armed, and that asymmetry is the point:
   * discarding says "not that rectangle", so the pass continues and the panel
   * folds again. Confirming says the room is placed.
   */
  const standDownAfterConfirm = (): void => {
    if (!armed) return;
    armed = false;
    // Both modes end, for the reason `setVisible` clears both: a tool that is
    // not armed is aimed at nothing, and leaving `removing` set would leave the
    // control beside this one reading "Stop removing" with nothing to stop.
    removing = false;
    options.onArm(false, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing: false });
  };

  const confirmButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsConfirm, { width: 0, height: 0 }),
    tone: 'primary',
    icon: 'check',
    onActivate: () => {
      const rectangle = pending;
      if (rectangle === undefined) return;
      const handOn = handConfirmRowFocusToArm(confirmButton.element);
      if (removing) {
        pending = undefined;
        pendingEnclosure = undefined;
        standDownAfterConfirm();
        paintActions();
        handOn();
        options.onRemove(rectangle);
        return;
      }
      const roomId = selectedId;
      // Unreachable while the tool cannot be armed to designate without a
      // selection, and returning rather than asserting keeps a designation of
      // `undefined` impossible rather than merely unlikely.
      if (roomId === undefined) return;
      pending = undefined;
      pendingEnclosure = undefined;
      // Before the repaint, so the row this press just swapped back is painted
      // once, in the state it will be read in -- and before the intent leaves,
      // so a host that refuses it cannot leave the world armed behind a panel
      // that says it is not.
      standDownAfterConfirm();
      paintActions();
      handOn();
      options.onDesignate({ roomId, area: rectangle });
    },
  });
  confirmButton.element.classList.add('hud-rooms__confirm');

  const cancelButton: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.roomsCancel),
    onActivate: () => {
      const handOn = handConfirmRowFocusToArm(cancelButton.element);
      pending = undefined;
      pendingEnclosure = undefined;
      paintActions();
      handOn();
    },
  });
  cancelButton.element.classList.add('hud-rooms__cancel');

  const areaValue = valueText(t(HUD_MESSAGE_KEY.roomsAreaNone), 'hud-rooms__area-value');
  const areaBlock = element('div', {
    className: 'hud-rooms__area',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.roomsArea)), areaValue],
  });

  /*
   * One line, two jobs: the arm hint (or the removal hint) while nothing is
   * pending, and the too-small warning when the pending rectangle is under the
   * selected room's authored minimum.
   *
   * **It had a third job and no longer does.** It also showed
   * `hud.rooms.enclosure-open-required` when the simulation reported an
   * *accepted* room as open against an `enclosed` requirement, and the
   * too-small warning won over it "because it is about the rectangle the player
   * is still holding while the other is about a room they already made".
   * `RoomZoningService.zone` now refuses that pair rather than accepting it
   * (the ADR "Must a zoned room be enclosed"), so no accepted zoning can report
   * it, the branch was unreachable, and the sentence moved to
   * `hud.alert.refusal.zone.not-enclosed`.
   *
   * The precedence argument survives its own conclusion and is worth keeping:
   * this line belongs to the rectangle the player is still holding. **It has a
   * third job again, since issue #493, and it is not the one the paragraph
   * above described losing.** That one warned about a room already *accepted*
   * as open; this one warns about the rectangle still pending, before the
   * player has pressed anything -- the pre-confirm warning this comment used
   * to say could not be built here, because the panel has no edge data of its
   * own. It still does not: `options.classifyArea` is what changed, not this
   * module's boundary, and the verdict it returns is all this line ever reads.
   */
  const note = eyebrowText(t(HUD_MESSAGE_KEY.roomsArmHint), 'hud-rooms__note');
  /*
   * The note is the Confirm control's description, and it is one in all three
   * of the states `paintNote` writes -- the too-small warning that is *why*
   * the control below is disabled, the open-perimeter warning that is why
   * pressing it will probably be refused, and the drag hint that is what to
   * do before it means anything. A player who cannot see the note reaches
   * Confirm and is told "disabled" and nothing else (finding from a
   * keyboard-only playtest of the assembled app).
   *
   * Wired once here rather than from `paintNote`, because the *relationship*
   * never changes -- only the sentence does, and a screen reader re-reads a
   * described element's description when it changes. `role="status"` would be
   * the wrong tool: this text is not an announcement, it is the standing
   * explanation of a control that is on screen the whole time.
   *
   * This needs `markControl` in `hud.ts` to merge rather than replace, which
   * is exactly what the comment above `commandControls` there predicted a
   * control gaining its own `aria-describedby` would need. Confirm is one of
   * those controls: it composes a `ZoneRoom` intent, so a refusal marks it.
   */
  const noteId = nextUiId('hud-rooms-note');
  note.id = noteId;
  describeBy(confirmButton.element, noteId);

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

  /**
   * True when the pending rectangle's own perimeter is open against a
   * selected room type that requires one closed (issue #493).
   *
   * **Feeds the note only, never `confirmButton.setDisabled` (CI on #498
   * found the version that did).** `pendingEnclosure` can be a false
   * negative -- `classifyArea`'s answer is only as fresh as the render
   * snapshot feed's own cadence, which can go stale for as long as the
   * session stays paused -- and disabling on a possibly-stale `'open'`
   * blocked a designation the simulation would have accepted, which is worse
   * than the missing warning this panel exists to add. The warning itself
   * carries no equivalent risk: shown when it need not have been, it costs
   * confusion for one press and no more, because the control stays live and
   * the real simulation still decides. See `paintActions`'s comment beside
   * `confirmButton.setDisabled` for the full reasoning and the ADR for the
   * options weighed.
   *
   * Reads `pendingEnclosure`, never `options.classifyArea` again: the host
   * already answered once, when the rectangle became pending, and asking a
   * second time here could disagree with it if the world moved in between --
   * which would mean the note and the rectangle it describes had quietly
   * stopped being the same measurement.
   */
  function pendingIsUnenclosed(): boolean {
    if (pending === undefined || removing) return false;
    if (pendingEnclosure !== 'open') return false;
    return selectedRoom()?.enclosure === 'enclosed';
  }

  function paintNote(): void {
    const minimum = selectedRoom()?.minimum;
    // Too-small wins over everything, exactly as it always has: a rectangle
    // can be both too small and open at once, and it is still the size that
    // the player has to fix first -- growing it to the authored minimum can
    // change which edges are even in play.
    if (pendingIsTooSmall() && minimum !== undefined) {
      note.textContent = t(HUD_MESSAGE_KEY.roomsTooSmall, {
        width: minimum.width,
        height: minimum.height,
      });
      note.dataset['tone'] = 'warning';
      return;
    }
    if (pendingIsUnenclosed()) {
      // The same sentence the post-confirm readout already uses for an open
      // room (`paintEnclosure` below) -- reused deliberately rather than
      // drafted new, since a second, differently worded sentence for the
      // identical fact is exactly the kind of drift `docs/LOCALIZATION.md`
      // warns a message-key catalog invites. Naming *which* side is open
      // would need new copy this change does not ship; see the ADR.
      note.textContent = t(HUD_MESSAGE_KEY.roomsEnclosureOpen);
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
   * **A readout, and it is now a confirmation rather than a hedge.** This used
   * to say "a *readout* and never a refusal ... `RoomZoningService` evaluates
   * the requirement and accepts the room either way", and gave two reasons: the
   * check is narrower than enclosure, and "a completed door order writes
   * nothing into the world, so refusing every unsealed `enclosed` room would
   * make 17 of the 18 room types designatable only as a box with no way in".
   *
   * The second was already stale when it was written here: a completed
   * `door-wooden` order writes `DOOR_EDGE_NUMERIC_ID` and registers a
   * `DoorDefinition`, so a sealed room with a way in is expressible and
   * `src/simulation/rooms/enclosure.ts` had recorded the correction. The first
   * has been overtaken by the owner's ruling -- `zone` refuses an `enclosed`
   * room whose perimeter is open (the ADR "Must a zoned room be enclosed").
   *
   * So the pair this can render is now `sealed` against anything, or `open`
   * against `outdoors`/`none`. Every one of them is correct by construction,
   * which is why nothing here is toned as a warning any more.
   */
  const enclosureValue = valueText(t(HUD_MESSAGE_KEY.roomsEnclosureNone), 'hud-rooms__enclosure-value');
  /*
   * **The label is `.ui-sr-only` since #1006 finding 4, and it was a visible
   * eyebrow before.** The reason is arithmetic and the alternative was worse.
   *
   * Measured on the assembled panel at 900x600: the box is 238px, the eyebrow
   * `Enclosure` is 80.8px, the gap 8px -- so a value has **149px** and every
   * sentence this readout can render is wider than that. `Walled in on every
   * side` is 179.4px and `Open on at least one side` is 195px, both of them
   * shipped, and the block's `scrollWidth` was 268 against a `clientWidth` of
   * 238 with the sentence cut off mid-word. Wrapping the value onto its own
   * line draws it whole and costs the block 13.2px, and the panel body at that
   * viewport has **5.9px** of slack with a needs readout showing -- measured
   * by `app-shell.spec.ts`, which failed on exactly that: *".hud-rooms >
   * .ui-panel__body is 7px shorter than its own content"*. The catalogue's
   * floor is where a block in this panel borrows height from and #529 already
   * halved it; there are 8px left there and this needs 13.2.
   *
   * So the three options were an ellipsis (keeps the height, throws away the
   * end of the sentence), a shorter sentence (impossible -- 149px is under
   * every string in the pair, including the one nobody is changing), or this.
   *
   * **`.ui-sr-only` costs no width at all** (`position: absolute`, 1px), so
   * the sentence gets the whole 238px and fits on one line with 19.6px to
   * spare. What is given up is the word `ENCLOSURE` on screen -- and the
   * sentence does not need it: `Walled in ...` and `Open on at least one
   * side ...` name their own subject, which is exactly how the three
   * `.hud-rooms__rule` lines immediately above this block read
   * (`NEEDS AT LEAST 2 x 3 TILES`, `MUST BE ENCLOSED`, `NEEDS 1 x BED`). This
   * block was the only label/value pair in that section.
   *
   * **The counter-precedent is in `hud.css` and it does not reach this.**
   * `.hud-regime__roster-need-value` records issue #909 -- a figure that was
   * `.ui-sr-only` "told a screen reader the need was at 20% and left a sighted
   * player an unlabelled bar". That is a *number*, which is meaningless
   * without its label. This is a sentence.
   */
  const enclosureBlock = element('div', {
    className: 'hud-rooms__enclosure',
    children: [screenReaderText(t(HUD_MESSAGE_KEY.roomsEnclosure)), enclosureValue],
  });

  function paintEnclosure(): void {
    if (notice === undefined) {
      // Folded for `paintArea`'s reason and with the same `:not([hidden])`
      // guard behind it: until a room has been designated this reads
      // `Enclosure / Not evaluated yet`, which is 14.3px spent saying nothing.
      enclosureValue.textContent = t(HUD_MESSAGE_KEY.roomsEnclosureNone);
      enclosureBlock.hidden = true;
      delete enclosureBlock.dataset['enclosure'];
      return;
    }
    enclosureBlock.hidden = false;
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
   * **That last clause stopped being true on 2026-08-31 (#703, rulings 1 and
   * 5)**: the section starts open and `.hud__corner` is no longer hidden below
   * 720px, so a row in the list is laid out at every width -- see
   * `INITIAL_HUD_SHELL_STATE`. **The placement does not change**, because the
   * clause was the weaker of the two reasons given: the load-bearing one is the
   * sentence above it, that this is a fact about the room the player made and
   * belongs beside the control that made it. A list of refusals is still the
   * wrong home for something that was not refused.
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
  /*
   * The header's eyebrow, held rather than inlined, because the block has two
   * subjects and they do not share a heading -- see `roomNeedsSubjectOf`. It is
   * built with the unfinished-rooms text so that a paint which draws nothing
   * leaves the block in the state it mounts in rather than in whichever state
   * it was last drawn in.
   */
  const needsLabel = eyebrowText(t(HUD_MESSAGE_KEY.roomsNeeds), 'hud-rooms__needs-label');
  const needsLine = eyebrowText('', 'hud-rooms__needs-line');
  /*
   * The object lines, in a box of their own with no gap between them.
   *
   * A box rather than appending straight to `.hud-rooms__needs`, because that
   * block is a flex column with a `--hud-rooms-gutter` gap and the gap is right
   * *between* the header and the detail and wrong between one object and the
   * next: the lines under "Cell at 2, 2 is missing" are one list, and a gutter
   * between each would spend a gutter per object to say so. The same shape and
   * the same reason as `.hud-rooms__rule-block`, which stacks its two lines with
   * no gap at all inside a block that has one.
   */
  const needsItems = element('div', { className: 'hud-rooms__needs-items' });
  const needsBlock = element('div', {
    className: 'hud-rooms__needs',
    children: [
      element('div', {
        className: 'hud-rooms__needs-header',
        children: [needsLabel, needsCount],
      }),
      needsLine,
      needsItems,
    ],
  });
  /*
   * No initial `hidden` here: `paintNeeds` runs once at construction, below the
   * `panel.body.append`, and it is the single authority on whether this block
   * has a box. A second assignment would be a line no test could fail on --
   * measured, by deleting it and watching every assertion stay green.
   */

  /**
   * The sentence for one shortfall.
   *
   * Three forms and one rule: every word is a message key resolved through
   * `t`, and nothing here interpolates text this layer authored (ADR 0011).
   *
   * - `kind: 'doorway'` -- the room's walls hold no door, so nothing can get
   *   in (#938). No placeholder: there is one door to be short of, and the
   *   locale entry carries the proof of each clause.
   * - an object with a count -- the shortfall, which is what the player has
   *   to build, under the object's own name or the stand-in for one the
   *   catalogue does not define.
   * - an object with none -- `missingQuantity` is absent exactly when the
   *   projection was handed nothing to count with, and the sentence then has
   *   to be the one without a figure in it. Choosing between two keys rather
   *   than substituting an invented `1` is the whole point: the alternative
   *   dresses an uncounted answer as a counted one, on the same line, in the
   *   same words, where nothing distinguishes them.
   */
  function needSentence(need: HudRoomNeedViewModel): string {
    if (need.kind === 'doorway') return t(HUD_MESSAGE_KEY.roomsNeedsDoorway);
    const object = t(need.objectLabelKey ?? HUD_MESSAGE_KEY.roomsNeedsObjectUnknown);
    return need.missingQuantity === undefined
      ? t(HUD_MESSAGE_KEY.roomsNeedsObjectUncounted, { object })
      : t(HUD_MESSAGE_KEY.roomsNeedsObject, { count: need.missingQuantity, object });
  }

  /**
   * The block, drawing the other subject: rooms that are finished and full
   * (ADR 0028 phase 5).
   *
   * The same three slots the unfinished subject uses -- header eyebrow and
   * figure, a room line, then item lines -- with the room line taken from the
   * first entry exactly as `paintNeeds` takes it from the first need, and for
   * the same reason: this block names one room, and `roomsAtCapacityRoom` is
   * that room's heading.
   *
   * **One line under it and not one per full ceiling.** A room can be full for
   * two things at once, and two lines reading `places in use: 2 of 2` and
   * `places in use: 6 of 6` with nothing to tell them apart would be a readout
   * whose two states look the same -- the defect #938 records. The list the
   * boundary carries already names one ceiling per room and says why
   * (`fullestUseOf`), so this draws that one.
   */
  function paintAtCapacity(full: HudRoomNeedsViewModel): void {
    needsLabel.textContent = t(HUD_MESSAGE_KEY.roomsAtCapacity);
    needsCount.textContent = t(HUD_MESSAGE_KEY.roomsAtCapacityCount, {
      full: full.atCapacity.length,
      total: full.totalRooms,
    });
    needsBlock.dataset['full'] = String(full.atCapacity.length);
    needsItems.replaceChildren();

    // Non-empty by `roomNeedsSubjectOf`, which is the only route here; read
    // through the index rather than asserted, so a caller that reached this
    // with an empty list draws a header and no room instead of throwing out of
    // a paint.
    const first = full.atCapacity[0];
    if (first === undefined) {
      needsLine.textContent = '';
      return;
    }
    needsLine.textContent = t(HUD_MESSAGE_KEY.roomsAtCapacityRoom, {
      room: t(first.roomLabelKey),
      x: first.tile.x,
      y: first.tile.y,
    });
    const line = eyebrowText(
      t(HUD_MESSAGE_KEY.roomsAtCapacityPlaces, { inUse: first.inUse, capacity: first.places }),
      'hud-rooms__needs-item',
    );
    line.dataset['room'] = first.instanceId;
    // The same two attributes the unfinished lines carry, for the same reason:
    // a test that had to tell this line from `1 × Bed` by reading the sentence
    // would be a test of the English locale.
    line.dataset['kind'] = 'at-capacity';
    line.dataset['places'] = String(first.places);
    line.dataset['inUse'] = String(first.inUse);
    needsItems.append(line);
  }

  function paintNeeds(): void {
    /*
     * Two states draw nothing and stay two facts: `undefined` is "nothing has
     * been asked" and zero unfinished rooms is "the simulation says every room
     * is finished". Collapsing them here is correct -- neither earns a line --
     * and collapsing them *upstream* would not be, which is why the view model
     * keeps them apart.
     *
     * **Zero unfinished rooms no longer means the block draws nothing** (ADR
     * 0028 phase 5): a prison whose rooms are all finished can still hold one
     * that cannot take another user, and that is the state issue #1003
     * measured as invisible. `roomNeedsSubjectOf` is the decision and carries
     * the reason the two subjects are never drawn together.
     */
    const subject = roomNeedsSubjectOf(needs);
    needsBlock.hidden = subject === 'none';
    /*
     * The block's presence, on the panel, because a stylesheet cannot ask
     * whether a descendant has a box -- and `hud.css` has to, to donate the
     * catalogue's floor to this readout exactly as `.hud-build[data-queued]`
     * donates to the build queue. See that rule for the argument; the numbers
     * for this one are in `.hud-rooms[data-needs]`.
     *
     * Two attributes and not one, because the value of each is a figure a test
     * reads: `data-needs` is how many things the unfinished rooms are short and
     * `data-full` is how many rooms are at a ceiling. The stylesheet donates on
     * either.
     */
    // `needs === undefined` is unreachable for either drawing subject --
    // `roomNeedsSubjectOf` answers `'none'` for it -- and the guard is written
    // as a pair rather than asserted, so a subject added without a branch
    // clears the block instead of drawing a stale one.
    const full = subject === 'at-capacity' ? needs : undefined;
    if (subject !== 'unfinished' || needs === undefined) {
      if (full === undefined) delete panel.element.dataset['full'];
      else panel.element.dataset['full'] = String(full.atCapacity.length);
      delete panel.element.dataset['needs'];
      needsLabel.textContent = t(HUD_MESSAGE_KEY.roomsNeeds);
      needsCount.textContent = '';
      needsLine.textContent = '';
      needsItems.replaceChildren();
      delete needsBlock.dataset['unfinished'];
      delete needsBlock.dataset['needs'];
      delete needsBlock.dataset['full'];
      if (full !== undefined) paintAtCapacity(full);
      return;
    }
    const shown = needs;
    panel.element.dataset['needs'] = String(shown.totalNeeds);
    // Both `full` attributes, and the header, because the previous paint may
    // have drawn the other subject into this same box: a `data-full` left
    // standing beside `data-unfinished` would say the two were drawn together,
    // which is the one thing `roomNeedsSubjectOf` guarantees never happens.
    delete panel.element.dataset['full'];
    delete needsBlock.dataset['full'];
    needsLabel.textContent = t(HUD_MESSAGE_KEY.roomsNeeds);

    needsCount.textContent = t(HUD_MESSAGE_KEY.roomsNeedsCount, {
      unfinished: shown.unfinishedRooms,
      total: shown.totalRooms,
    });
    // The verdict as data as well as as text, so a test can read it without
    // parsing a localized sentence -- the job `data-enclosure` does on the
    // block below, and `data-area` on the block above.
    needsBlock.dataset['unfinished'] = String(shown.unfinishedRooms);
    needsBlock.dataset['needs'] = String(shown.totalNeeds);

    /*
     * Every line is rebuilt from `shown`, and the previous ones are dropped
     * first. This block is republished on the counts cadence, so a paint that
     * appended would grow without bound, and one that reused rows would have to
     * decide what a row *is* -- the readout is about a different room the moment
     * the player finishes this one, so there is no identity to preserve across
     * paints. `HudRoomNeedViewModel.instanceId` is the identity that matters and
     * it goes onto the line as data, which is what a test reads.
     */
    needsItems.replaceChildren();

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

    /*
     * One room named, then everything it is short.
     *
     * `ROOM_NEEDS_ROOMS_LIMIT` is 1, so every entry in `needs` describes the
     * same room and the room line can be taken from the first. That is an
     * assumption about the reader, not a property of the view model -- the
     * boundary type carries an `instanceId` per need precisely so it does not
     * have to be one -- so the loop below skips any entry that belongs to a
     * different room rather than printing its objects under this room's
     * heading. Reachable only by raising that constant, which is the moment the
     * silent version would have started lying.
     */
    needsLine.textContent = t(HUD_MESSAGE_KEY.roomsNeedsRoom, {
      room: t(first.roomLabelKey),
      x: first.tile.x,
      y: first.tile.y,
    });

    let drawn = 0;
    for (const need of named) {
      if (need.instanceId !== first.instanceId) continue;
      const line = eyebrowText(needSentence(need), 'hud-rooms__needs-item');
      line.dataset['room'] = need.instanceId;
      /*
       * Which kind of shortfall this line is, as data as well as as text
       * (#938), for the reason `data-enclosure` and `data-missing` are both
       * here: a test that had to tell "a door — nobody can get in" from
       * "1 × Bed" by reading the sentence would be a test of the English
       * locale, and the defect #938 records is precisely a readout whose two
       * states could not be told apart.
       */
      line.dataset['kind'] = need.kind;
      // The figure as data as well as as text, for the header's reason. Absent
      // rather than `0` when nothing was counted, so a test can tell the two
      // states apart exactly as the view model does.
      if (need.missingQuantity !== undefined) line.dataset['missing'] = String(need.missingQuantity);
      needsItems.append(line);
      drawn += 1;
    }

    /*
     * Content deeper than the panel may draw.
     *
     * Counted over *this room's* needs and not the prison's, which is the
     * correction #529 exists for: the old line's "and 5 more" was a prison-wide
     * remainder attached to a sentence about one room, so a player reading
     * "Cell at 2, 2 needs Bed, and 5 more" could reasonably have believed that
     * cell needed six things. How many other rooms are unfinished is the
     * header's figure, and it is a different sentence in a different place.
     *
     * Unreachable with the shipped catalogue -- see `ROOM_NEEDS_NAMED_LIMIT`.
     */
    const roomNeeds = shown.needs.filter((need) => need.instanceId === first.instanceId).length;
    const unlisted = Math.max(0, roomNeeds - drawn);
    if (unlisted > 0) {
      needsItems.append(eyebrowText(t(HUD_MESSAGE_KEY.roomsNeedsItemMore, { count: unlisted }), 'hud-rooms__needs-item'));
    }
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
      // Only too-small disables. **Enclosure does not, and issue #493's own
      // first design disabled on it too -- that was wrong, and CI on #498
      // is why this comment says so rather than the reasoning it replaced.**
      //
      // Too-small is arithmetic on numbers the panel already holds outright:
      // the pending rectangle's own width and height against the selected
      // room's authored minimum, nothing about world state, so there is
      // nothing for it to be stale about. Enclosure is not that. `pending
      // Enclosure` is `classifyArea`'s answer against `WorldRenderView`,
      // which is refreshed on the render-snapshot feed's own cadence
      // (`SimulationSnapshotFeed`) -- up to a 30-second poll interval while
      // the clock runs, and **not refreshed at all while it is paused**,
      // with no final catch-up snapshot taken when it stops. A prison built
      // its walls, ran the clock long enough for `data-queued` to empty, and
      // paused again before the next periodic poll happened to land -- which
      // is an ordinary sequence, not a contrived one -- left the client's
      // world stale by exactly the tail of that window, still reporting
      // `'open'` for a rectangle the simulation had already sealed. Disabling
      // on that verdict blocked a designation `RoomZoningService.zone` would
      // have accepted, with no way to recover but running the clock further
      // or drawing a new rectangle -- worse than #493's original bug, which
      // only cost a press. `'sealed'` carries no equivalent risk: a wall
      // this view has already seen was really built (nothing un-builds one
      // from underneath a pending rectangle), so a false *positive* from
      // staleness cannot happen, only a false negative. That asymmetry is
      // why only `'open'` is ever suspect and why the fix is to stop acting
      // on it as ever certain, rather than to chase the staleness bound
      // tighter. See the ADR for the options weighed and why this one.
      //
      // The note still warns on `pendingIsUnenclosed()` (below): a warning
      // that turns out to be stale costs nothing but confusion, since the
      // control is still live and the real simulation still accepts a
      // rectangle it agrees is sealed. Disabled rather than absent for the
      // too-small case that remains: the rectangle is real and the player
      // drew it, so the control that would designate it stays where it is
      // and the note beside it says what is wrong.
      //
      // The simulation refuses both cases independently
      // (`zone.below-minimum-size`, `zone.not-enclosed`), so a disabled
      // control is a *report* and not the only guard either way: a
      // `ZoneRoom` composed anywhere else is still refused, and now so is
      // one composed through this control on a rectangle that turns out to
      // still be genuinely open -- the existing refusal line is what tells
      // the player then, exactly as it did before this panel warned at all.
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
   *
   * `enclosure` travels with `next` rather than being read separately, so the
   * two can never fall out of step: a caller that supplied a rectangle without
   * its classification would leave `pendingEnclosure` stale from whatever was
   * pending before, which is exactly the kind of mismatch #411's guarantee
   * forbids between the two producers.
   */
  function adoptPendingArea(next: RoomsPanelArea | undefined, enclosure?: 'sealed' | 'open'): void {
    pending = next;
    pendingEnclosure = next === undefined ? undefined : enclosure;
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
      /*
       * Folded, not blanked: `Area / Nothing selected` is 20px of a panel that
       * has none to spare at 900x600, and it is a placeholder for a figure the
       * player has not asked for yet. The sentence is kept rather than removed
       * so the block reads correctly the instant it comes back, and so a test
       * that reads the text without a rectangle still gets the honest answer.
       *
       * `hud.css` gives this block an author `display: flex` behind a
       * `:not([hidden])` guard, without which this line would do nothing at
       * all -- the same trap the catalogue body's rule documents.
       */
      areaValue.textContent = t(HUD_MESSAGE_KEY.roomsAreaNone);
      areaBlock.hidden = true;
      delete areaBlock.dataset['area'];
      return;
    }
    areaBlock.hidden = false;
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
    setPendingArea(next: RoomsPanelArea | undefined, enclosure?: 'sealed' | 'open'): void {
      // The dragged rectangle is taken into the coordinate fields as well, so
      // the two routes hold one rectangle between them rather than two: a
      // player who drags 6x5 and wanted 6x6 can nudge the height instead of
      // dragging again, and a form that still showed 0,0,1,1 beside a pending
      // 12x9 would be a second, stale statement of the same thing.
      if (next !== undefined) showCoordinates(next);
      adoptPendingArea(next, enclosure);
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
    standDown(): void {
      // The arming half of `setVisible(false)` below, and only that half: see
      // the handle's own note on why the pending rectangle stays.
      if (!armed) return;
      armed = false;
      removing = false;
      options.onArm(false, { ...(selectedId === undefined ? {} : { roomId: selectedId }), removing: false });
      paintActions();
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
        pendingEnclosure = undefined;
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
