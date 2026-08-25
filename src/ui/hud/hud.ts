import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  runReported,
} from '../primitives/async-action';
import { element, eyebrowText, nextUiId } from '../primitives/dom';
import type { IconId } from '../primitives/icon';
import { type CollapsibleSection, createCollapsibleSection } from '../primitives/collapsible-section';
import { type ListRow, createListRow } from '../primitives/list-row';
import { type Panel, createPanel } from '../primitives/panel';
import { type TabButton, createTabButton } from '../primitives/tab-button';
import { type BuildPanel, type BuildPanelTarget, createBuildPanel } from './build-panel';
import { type IntakePanel, createIntakePanel } from './intake-panel';
import { type RoomsPanel, createRoomsPanel } from './rooms-panel';
import {
  HUD_PANEL_IDS,
  type HudPanelId,
  type HudShellAction,
  type HudShellState,
  type HudTabId,
  INITIAL_HUD_SHELL_STATE,
  hudShellReducer,
  isPanelCollapsed,
} from './hud-state';
import { HUD_MESSAGE_KEY } from './messages';
import { nextFastForwardSpeed, refusalMessageKey, severityLabelKey, severityTone } from './projection';
import { createStaffPanel, type StaffPanel } from './staff-panel';
import { type TransportIntentKind, createStatusStrip } from './status-strip';
import {
  EMPTY_HUD_VIEW_MODEL,
  type HudBuildEdge,
  type HudBuildViewModel,
  type HudClockMode,
  type HudLocalizer,
  type HudRoomsViewModel,
  type HudSpeed,
  type HudStaffViewModel,
  type HudViewModel,
} from './view-model';

/**
 * The persistent HUD shell.
 *
 * It frames the world and never covers it: a dense strip along the top, a
 * tab bar centred along the bottom, a minimap frame in the bottom-left
 * corner, and nothing at all in the middle. Two more bands can appear
 * directly under the strip -- the unavailable line, `hidden` unless the host
 * says this page has no simulation behind it (issue #220), and below it the
 * refusal line, empty and `hidden` until a control's action is refused
 * (issue #207). Each is a grid row of its own rather than an overlay, so
 * even then the HUD shrinks the world's space instead of covering it. The
 * root is `pointer-events: none` so every pixel that is not a control passes
 * clicks straight through to the renderer's canvas.
 *
 * It renders from a plain `HudViewModel` and imports nothing from
 * `src/simulation/**` -- `AGENTS.md` boundary 1, restated: the HUD is a view
 * over snapshots and must never become a source of truth. Every player
 * action leaves as a `HudIntent` for the host to act on; the HUD changes no
 * game state itself, and it does not optimistically pretend the clock
 * changed before a snapshot says so.
 */

export interface HudTabDefinition {
  readonly id: HudTabId;
  readonly icon: IconId;
  readonly labelKey: LocalizationKey;
}

export const HUD_TABS: readonly HudTabDefinition[] = [
  { id: 'overview', icon: 'overview', labelKey: HUD_MESSAGE_KEY.tabOverview },
  { id: 'build', icon: 'build', labelKey: HUD_MESSAGE_KEY.tabBuild },
  { id: 'rooms', icon: 'rooms', labelKey: HUD_MESSAGE_KEY.tabRooms },
  { id: 'security', icon: 'security', labelKey: HUD_MESSAGE_KEY.tabSecurity },
  { id: 'regime', icon: 'regime', labelKey: HUD_MESSAGE_KEY.tabRegime },
];

/**
 * One tile edge a build order names.
 *
 * Numbers and a HUD-local edge id, never a simulation type: the HUD may not
 * import `src/simulation/**` (`AGENTS.md` boundary 1), and `HudBuildEdge` is
 * the wire shape the host translates to and from -- see its own comment in
 * `view-model.ts`.
 */
export interface HudBuildEdgeTarget {
  readonly x: number;
  readonly y: number;
  readonly edge: HudBuildEdge;
}

/**
 * What one build gesture asked for: a buildable, and the edges it covered.
 *
 * `edges` is never empty -- an order that names no edge is not an order --
 * and it is a list rather than a single edge because a drag along the world
 * covers a run. See the `place-build-order` intent for why the run stays
 * whole.
 */
export interface HudBuildOrder {
  readonly definitionId: string;
  readonly edges: readonly HudBuildEdgeTarget[];
}

/**
 * The world's build gesture, as the HUD is willing to know it (issue #225).
 *
 * The problem this solves: two routes reach the same command. The Build
 * panel's numeric fallback goes through `dispatchCommand`, so a refusal is
 * painted on the refusal line and on the control that was pressed (issue
 * #207). A run dragged along the world went straight from the composition
 * root to the command sender, so a refused wall reached `console.warn` and
 * the player was told nothing -- the primary route being the silent one.
 *
 * The fix is not a way to *report* a refusal from outside; that would let any
 * caller paint a refusal for an action the HUD never dispatched, which is the
 * door `refusalMessageKey` deliberately closed for chrome intents. It is this
 * instead: the host hands the HUD the gesture, the HUD dispatches it as its
 * own `place-build-order` intent, and one piece of machinery serves both
 * routes because there is only one route left.
 *
 * A *source*, not a callback the HUD hands out: the tool exists before the
 * HUD does (`src/main.ts` builds it for the renderer at boot), so the
 * connection has to be made in this direction. It is the same shape, and for
 * the same reason, as `BuildTool.attachReadout`.
 */
export interface HudWorldBuildSource {
  /** Points the finished-gesture report at the HUD. Called once, at mount. */
  attachOrders(place: (order: HudBuildOrder) => void): void;
}

/** A rectangle of tiles, as the HUD is willing to know one: four integers. */
export interface HudRoomArea {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * A finished room gesture on the world.
 *
 * Two kinds rather than one carrying a flag, for the reason `undo` and `redo`
 * are two intents rather than one with a direction: the HUD keys its gate and
 * its refusal sentence on the kind, and a refused designation and a refused
 * removal leave the prison in different states. A removal carries no room id at
 * all, which a shared shape would have had to make optional and every reader
 * would then have had to establish when it was present.
 */
export type HudRoomGesture =
  | { readonly kind: 'designate'; readonly roomId: string; readonly area: HudRoomArea }
  | { readonly kind: 'remove'; readonly area: HudRoomArea };

/**
 * The world's room gesture, as the HUD is willing to know it (ADR 0022).
 *
 * The same shape as `HudWorldBuildSource`, and for the same two reasons: the
 * host builds the tool before the HUD exists, so the connection is made in this
 * direction rather than by handing a callback out; and the gesture arrives as a
 * *report*, never as a command, so the HUD dispatches its own intent and a
 * refused designation reaches the refusal line by exactly the machinery a
 * refused build order does.
 *
 * A **second source** beside `worldBuild` rather than a widened one, because
 * the two carry different shapes -- edges against a rectangle -- and because a
 * host may have one and not the other.
 */
export interface HudWorldRoomSource {
  /** Points the finished-gesture report at the HUD. Called once, at mount. */
  attachGestures(place: (gesture: HudRoomGesture) => void): void;
  /** Points the live readout at the mounted panel. Called once, at mount. */
  attachReadout(readout: (area: HudRoomArea | undefined) => void): void;
}

/** Which way along the edit history the player asked to move. */
export type HudHistoryDirection = 'undo' | 'redo';

/**
 * The world's undo and redo keys, as the HUD is willing to know them (#261).
 *
 * The same shape as `HudWorldBuildSource`, and for the same two reasons. The
 * host builds this before the HUD exists, so the connection is made in this
 * direction rather than by handing a callback out. And the request arrives as
 * a *direction*, never as a command: the HUD dispatches its own `undo` or
 * `redo` intent, so a refused undo is painted on the refusal line by exactly
 * the machinery a refused build order is, instead of being raised where no
 * surface reports it -- the shape of the defect #225 removed for the build
 * gesture.
 *
 * There is no control on screen for either. That is not an omission this
 * interface papers over -- the refusal line is laid out at every viewport and
 * needs no control to name (`reportError`, and the `worldBuild` attachment
 * below).
 */
export interface HudEditHistorySource {
  /** Points the undo/redo report at the HUD. Called once, at mount. */
  attachHistory(request: (direction: HudHistoryDirection) => void): void;
}

export type HudIntent =
  | { readonly kind: 'select-tab'; readonly tab: HudTabId }
  | { readonly kind: 'set-clock'; readonly mode: HudClockMode; readonly speed: HudSpeed }
  | { readonly kind: 'toggle-panel'; readonly panel: HudPanelId; readonly collapsed: boolean }
  /**
   * The player asked for something to be built. Ids and numbers only -- the
   * host turns this into `PlaceBuildOrder` commands; the HUD does not know
   * that such a command exists.
   *
   * **One intent is one gesture**, however many edges the gesture covered.
   * The numeric fallback sends a run of one; a drag along the world sends the
   * whole run in a single intent (issue #225), because a run is one
   * transaction to the player -- one thing they did, one thing to undo, and
   * one thing to be told about when it is refused. Splitting it here would
   * make a twelve-segment wall twelve gated commands and twelve chances to
   * paint a refusal line about a wall the player drew once.
   */
  | ({ readonly kind: 'place-build-order' } & HudBuildOrder)
  /**
   * The player asked to buy materials (#89). Ids and numbers only -- the host
   * turns this into a `PurchaseMaterials` command and mints the order id it
   * needs; the HUD does not know that such a command exists, and could not
   * mint an identifier the simulation's schema would accept without knowing
   * the schema.
   *
   * A *command*, so it goes through the same gate as a build order: a second
   * tap while one is in flight must not hand a busy host two purchases, and a
   * refusal has to reach the player rather than being discarded. It is the
   * first intent whose refusal can be about money -- the host refuses a total
   * the balance it last heard about cannot cover -- and it needs no new
   * reporting route for that, because the refusal line already says "this
   * control's action did not happen" for every command (issue #207).
   */
  | { readonly kind: 'purchase-materials'; readonly itemId: string; readonly quantity: number }
  /**
   * The player asked for a prisoner to be admitted (#261 step 4).
   *
   * **Payload-free, and that is the whole of the boundary here.** An
   * admission is described by a sentence length, a prior-incident count and
   * an arrival tile; the host fills all three, because none of them is a
   * figure the HUD could obtain honestly. Two are `ClassificationInput`, whose
   * meaning lives in `src/simulation/prisoners/classification.ts` -- a module
   * the HUD may not import (`AGENTS.md` boundary 1) -- and the third is the
   * middle of the one chunk a new prison owns, which the host already knows
   * because it is the same origin the Build panel's numeric fields start at.
   *
   * Nothing about *who* arrives is here either, and nothing about who arrives
   * may ever be: the name and the risk tier are drawn inside the simulation
   * from `identity.actor-name` and `prisoners.classification` at the intake
   * stages that own them. A field on this intent carrying either would be the
   * interface deciding simulation state from an unseeded source.
   *
   * A *command*, so it goes through the same gate as a build order and a
   * purchase: a second tap while one is in flight must not hand a busy host
   * two admissions, and a refusal has to reach the player. Whether a press is
   * refused is a fact about the prison rather than about the application: an
   * admission into a prison with no accommodation room is refused, and since
   * the Rooms tab (#312) a player can zone one -- so a prison holding a zoned
   * cell admits, and the arrival then waits at `accommodation-assignment`
   * while the room has nothing to sleep on. Either way the answer has to reach
   * the control that was pressed, which is why this is dispatched through the
   * gate rather than fired and forgotten.
   */
  | { readonly kind: 'admit-prisoner' }
  /**
   * The player asked to hire a staff member
   * ([ADR 0025](../../../docs/adr/0025-guard-hiring-surface.md)). One stable
   * role id and nothing else -- the host turns this into a `HireStaff` command
   * and supplies the tile the new hire stands on, which is not part of the
   * gesture and which the HUD could not know: no session instantiates a
   * reception, a gate or a staff room, so where somebody arrives is the
   * composition root's placeholder rather than something the player chooses.
   *
   * A *command*, so it goes through the same gate as a build order and a
   * purchase: a second tap while one is in flight must not hire twice, and the
   * money leaves immediately. Like a purchase its refusal can be about money
   * -- the host refuses a wage the balance it last heard about cannot cover --
   * and it needs no new reporting route for that, because the refusal line
   * already says "this control's action did not happen" for every command
   * (issue #207).
   */
  | { readonly kind: 'hire-staff'; readonly staffRoleId: string }
  /**
   * The player handed the world pointer to the build tool, or took it back.
   *
   * *Chrome*, not a command: it changes what a click on the world means and
   * asks the simulation for nothing, so it is never gated -- blocking it
   * while a build order was in flight would leave the player unable to put
   * the pointer down.
   */
  | {
      readonly kind: 'arm-build-tool';
      readonly armed: boolean;
      readonly definitionId: string | undefined;
    }
  /**
   * The player asked to reverse, or reapply, the last thing they did (#261).
   *
   * Two kinds rather than one carrying a direction, because the HUD keys its
   * gate and its refusal sentence on `intent.kind`: a refused undo and a
   * refused redo leave the prison in different states and must not share a
   * line. Payload-free -- *what* gets reversed is the host's and the
   * simulation's business, and the HUD does not know that `Undo` is a command
   * any more than it knows `PlaceBuildOrder` is.
   */
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  /**
   * The player asked for an area to become a room (ADR 0022, amended).
   *
   * Ids and numbers only -- the host turns this into a `ZoneRoom` command; the
   * HUD does not know that such a command exists, or that the field the wire
   * format calls `roomId` holds a room *catalog* id rather than an instance id.
   *
   * **One intent is one gesture**, and here that is one rectangle rather than a
   * run: the simulation validates every tile of the rectangle before writing
   * any, so a 64x64 designation is one command with one outcome, unlike a wall
   * run which is one command per edge.
   */
  | { readonly kind: 'zone-room'; readonly roomId: string; readonly area: HudRoomArea }
  /**
   * The player asked for the room designations in an area to be cleared.
   *
   * **No room id**, because a removal names no room type: what comes out is
   * whatever is there. That is not a simplification of the designation intent
   * -- it is what the command carries, and what makes removal usable as the
   * recovery it exists to be, since a player fixing a stray drag does not have
   * to first work out what they zoned.
   *
   * A separate intent from `zone-room` rather than one with an absent field, so
   * the gate and the refusal sentence can differ: a refused designation leaves
   * the prison with no new room, and a refused removal leaves the room exactly
   * where it was.
   */
  | { readonly kind: 'unzone-room'; readonly area: HudRoomArea }
  /**
   * The player handed the world pointer to the room tool, or took it back.
   *
   * *Chrome*, exactly like `arm-build-tool`: it changes what a drag on the
   * world means and asks the simulation for nothing, so it is never gated --
   * blocking it while a designation was in flight would leave the player unable
   * to put the pointer down.
   *
   * `removing` travels with `armed` rather than as a signal of its own, because
   * the renderer needs both to choose a preview and a pair that could disagree
   * would draw a removal preview for a designation gesture.
   */
  | {
      readonly kind: 'arm-room-tool';
      readonly armed: boolean;
      readonly roomId: string | undefined;
      readonly removing: boolean;
    };

/**
 * Why this page cannot run a simulation at all.
 *
 * A key and nothing else: text never crosses into the HUD (ADR 0011).
 *
 * The field is `labelKey`, matching `HudAlertViewModel`'s, so that
 * `tests/foundation/localization-key-completeness.test.ts` covers it without
 * being extended: that gate matches `*Key:` fields by name, proves each
 * declared key resolves in the bundled default locale, and pins the exact
 * set of field names it finds -- so inventing a name here would be a change
 * to the gate rather than a use of it.
 */
export interface HudUnavailableNotice {
  /** A message key, never text. */
  readonly labelKey: LocalizationKey;
}

export interface MountHudOptions {
  readonly localizer: HudLocalizer;
  /** First paint. Defaults to an empty prison so the shell renders before any snapshot arrives. */
  readonly viewModel?: HudViewModel;
  readonly initialState?: HudShellState;
  /**
   * What the Build panel may offer.
   *
   * Omitted, the panel still renders and says there is nothing to build,
   * which is the honest picture of a host that has published no catalog. It
   * is deliberately not part of `HudViewModel`: the buildable catalog is
   * content, and rebuilding the panel on every snapshot would take focus off
   * a coordinate field mid-edit.
   */
  readonly build?: HudBuildViewModel;
  /**
   * What the Rooms panel may offer (ADR 0022, amended).
   *
   * Omitted, the panel still renders and says there are no room types, which is
   * the honest picture of a host that has published no catalogue. Content
   * rather than session state, for the same reason `build` is: rebuilding the
   * list every snapshot would drop the selection the player just made. What
   * *is* session state -- what the simulation said about the last room
   * designated -- travels on `HudViewModel.zoning`.
   */
  readonly rooms?: HudRoomsViewModel;
  /**
   * What the Staff panel may offer (ADR 0025).
   *
   * Omitted, the panel still renders on the Security tab and says there is
   * nobody it can hire, which is the honest picture of a host that has
   * published no roles. Deliberately not part of `HudViewModel`, for the
   * reason `build` is not: the staff-role catalogue is content, and rebuilding
   * the list on every snapshot would move the selection under a finger.
   */
  readonly staff?: HudStaffViewModel;
  /**
   * A standing sentence about the page itself, in a band of its own directly
   * under the status strip (issue #220).
   *
   * Omitted -- the ordinary case -- the band is `hidden` and its grid row
   * costs nothing. Supplied, it is laid out at every viewport and needs no
   * control pressed and no section opened to be read.
   *
   * Deliberately **not** an entry in `HudViewModel.alerts`. See the comment
   * on the element in `mountHud`, and `HudHandle.setUnavailable` for why the
   * band can also be raised after the mount.
   */
  readonly unavailable?: HudUnavailableNotice;
  /**
   * The world's build gesture, routed into the HUD's own intent path (issue
   * #225).
   *
   * Supplied, the HUD attaches to it once at mount and turns each finished
   * run into a `place-build-order` intent of its own -- so a refused drag
   * reaches the refusal line by exactly the path a refused *Place order*
   * press does, and there is one implementation of "the player is told"
   * rather than two.
   *
   * Omitted, nothing at all happens: the Build panel's numeric route is
   * unaffected and the HUD simply never hears about the world pointer. That
   * is the state of every harness in `tests/browser/` and of a page whose
   * `Worker` never started, which has no build tool to offer.
   */
  readonly worldBuild?: HudWorldBuildSource;
  /**
   * The world's undo and redo keys, routed into the HUD's own intent path
   * (#261).
   *
   * Supplied, the HUD attaches to it once at mount and turns each request into
   * an `undo` or `redo` intent of its own, gated and reported exactly as a
   * build order is. Omitted, nothing at all happens and the HUD never hears
   * about the keys -- which is the state of a page whose `Worker` never
   * started, because `src/main.ts` builds no build tool for one either.
   */
  readonly editHistory?: HudEditHistorySource;
  /**
   * The world's room gesture, routed into the HUD's own intent path (ADR 0022).
   *
   * Supplied, the HUD attaches to it once at mount: each finished rectangle
   * becomes a *pending* one in the Rooms panel rather than an intent, because a
   * designation is confirmed rather than committed on release, and the intent
   * leaves when the player presses the confirm control. So a refused
   * designation reaches the refusal line on the control that was pressed,
   * exactly as a refused *Place order* press does.
   *
   * Omitted, nothing at all happens and the HUD never hears about the world
   * pointer -- the state of every harness in `tests/browser/` and of a page
   * whose `Worker` never started.
   */
  readonly worldRooms?: HudWorldRoomSource;
  /**
   * Receives every player action, and may be async.
   *
   * A *command* (`set-clock`) is gated: while one is in flight the transport
   * controls are disabled and a further command is refused, so a slow or
   * wedged host cannot be handed duplicates (issue #65). A *chrome* change
   * (`select-tab`, `toggle-panel`) is never gated -- it has already happened
   * locally and blocking it would drop an interaction the host has nothing
   * to do with. Either way a rejection is reported to `onError` and never
   * discarded.
   */
  readonly onIntent?: (intent: HudIntent) => void | Promise<void>;
  /**
   * Receives every failure, for the host's own diagnostics.
   *
   * It is **not** how the player is told. The HUD reports a refused command
   * itself -- on the control that was pressed and in its own live region --
   * because this callback used to be the only consumer of a failure and the
   * one production handler wrote it to `console.warn`, so a "Place order"
   * with no session left the HUD byte-identical (issue #207).
   * A host that omits this still shows the player a refusal; what it loses
   * is the thrown `Error`, which is diagnostic English and deliberately
   * never reaches the screen (ADR 0011).
   */
  readonly onError?: (failure: AsyncActionFailure) => void;
}

export interface HudHandle {
  readonly element: HTMLElement;
  /**
   * A slot at the top of the HUD's right rail for a panel the **host** owns.
   *
   * The HUD lays it out and nothing more: it never renders into it, never
   * reads it, and does not know what goes there. That separation is not
   * fussiness -- the save panel that occupies it in the running app type-imports
   * from `src/persistence/**` and `src/simulation/runtime/**`, and the HUD may
   * import neither (`AGENTS.md` boundary 1). So the host mounts its own panel
   * here and the HUD supplies only a box that participates in the HUD's grid.
   *
   * The slot is *not* tab-scoped. What sits here is available on every tab,
   * which is the point: saving is not a Build-tab activity (issue #88).
   *
   * **Its height is the rail's to give, not the panel's to take.** The slot
   * asks for no height of its own and receives whatever the Build panel below
   * it does not need, with a floor of a quarter of the rail (`hud.css`). A
   * panel mounted here should therefore be able to scroll its own content --
   * it will regularly be shorter than that content on a short window -- and
   * should not set a height of its own, least of all one in `vh`, which is a
   * budget the rail never agreed to.
   *
   * Empty, it collapses to nothing and the rail is exactly what it was before.
   */
  readonly asideSlot: HTMLElement;
  /**
   * The status strip's left-hand chrome slot, passed straight through.
   *
   * `StatusStrip.brandSlot` documents the arrangement; this is the handle the
   * composition root reaches it by, exactly as `asideSlot` is for the rail. The
   * HUD supplies a box in its own layout and never looks inside it.
   */
  readonly brandSlot: HTMLElement;
  update(viewModel: HudViewModel): void;
  /**
   * Live feedback from the world pointer into the Build panel's readout.
   *
   * Deliberately not part of `HudViewModel`: it changes on every pointer
   * move, and folding it into the snapshot-shaped view model would make a
   * mouse wiggle look like a simulation update.
   */
  setBuildTarget(target: BuildPanelTarget | undefined): void;
  /**
   * Raises or clears the standing "this page has no simulation" band after the
   * mount (issues #82, #149).
   *
   * A key or nothing, exactly like `MountHudOptions.unavailable`: the HUD
   * renders the sentence and never learns what caused it. Passing `undefined`
   * hides the band and empties it, so a page that recovers a worker stops
   * saying it has none.
   *
   * Idempotent by construction -- setting the notice it already shows repaints
   * the same text -- because the host that calls it reports the state of the
   * page after every attempt to obtain a worker, not only the transitions.
   */
  setUnavailable(notice: HudUnavailableNotice | undefined): void;
  getState(): HudShellState;
  /** Applies a shell action programmatically -- restoring a saved UI state, or a test. */
  dispatch(action: HudShellAction): void;
  destroy(): void;
}

export function mountHud(root: HTMLElement, options: MountHudOptions): HudHandle {
  const { localizer } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  let state = options.initialState ?? INITIAL_HUD_SHELL_STATE;
  let viewModel = options.viewModel ?? EMPTY_HUD_VIEW_MODEL;

  /**
   * Where "this page has no simulation behind it" is put on screen (issue
   * #220).
   *
   * A grid row of its own, immediately under the status strip and above the
   * refusal line, `hidden` -- and therefore costing exactly zero -- unless
   * the host supplied `MountHudOptions.unavailable`. It is the same shape
   * issue #207 built for the refusal line, and for the first two of the same
   * three reasons:
   *
   *   - **It is there at every viewport.** `hud.css` drops `.hud__corner`
   *     entirely at 720px and below, so a message routed to the alerts list
   *     does not exist on a phone at all.
   *   - **It is there without being opened.** The alerts section starts
   *     folded (`INITIAL_HUD_SHELL_STATE`) and `createCollapsibleSection`
   *     sets `body.hidden` while it is, so a row appended to that list is
   *     `offsetParent === null` with a 0x0 box on *every* viewport, not only
   *     on a phone. Measured in Chromium at 1280x800 and at 375x812 with
   *     `Worker` construction blocked, on the shipped page, before this row
   *     existed: `.hud` innerText did not contain the sentence at either
   *     size (#220).
   *
   * The third reason #207 gave does **not** apply here and is why this is a
   * second row rather than a second use of the first: a refusal is a fact
   * about this HUD's own interaction and clears the moment the same action
   * succeeds (`clearRefusal`), whereas "this browser cannot start a worker"
   * belongs to no control and cannot stop being true while the page is
   * loaded. Sharing one band would need a rule deciding which sentence wins.
   *
   * Set at mount *and* settable afterwards (`setUnavailable`). It used to be
   * mount-only, on the argument that the host learns this before it mounts the
   * HUD because a `Worker` constructor that threw does not un-throw. That
   * argument held only while the page constructed exactly one worker, at boot.
   * Since #149 a session boundary is a `Worker` boundary, so a construction can
   * fail -- or start working again -- long after first paint, and a band that
   * could not follow that would either miss the failure or keep asserting it
   * after the page had a simulation again.
   */
  const unavailableText = element('span', { className: 'hud-unavailable__text' });
  const unavailable = element('div', {
    className: 'hud__unavailable',
    // `role="status"` already implies `aria-live="polite"`; both are written
    // out to match the refusal line exactly. Neither *announces* this
    // sentence, because a live region announces changes and this text is
    // present at first paint -- what the role buys is that a screen reader
    // reaching it reads it as a status rather than as unlabelled prose.
    attributes: { role: 'status', 'aria-live': 'polite' },
    children: [unavailableText],
  });
  function setUnavailable(notice: HudUnavailableNotice | undefined): void {
    unavailable.hidden = notice === undefined;
    unavailableText.textContent = notice === undefined ? '' : t(notice.labelKey);
  }
  setUnavailable(options.unavailable);

  /**
   * Where a refused command is reported to the player (issue #207).
   *
   * A live region of the HUD's own, in a grid row directly under the status
   * strip, `hidden` while there is nothing to say. Three properties earned it
   * that place rather than a row in the alerts list:
   *
   *   - **It is there at every viewport.** `hud.css` drops `.hud__corner`
   *     entirely at 720px and below, so the alerts list -- the region issue
   *     #82 established as "reaching the player" -- does not exist on a
   *     phone. A refusal surface that vanishes on the smallest screen is the
   *     same defect in a narrower window.
   *   - **It is there without being opened.** The alerts section starts
   *     folded (`INITIAL_HUD_SHELL_STATE`) and its body is `hidden` while it
   *     is, so appending a row to it changes nothing a player can see.
   *   - **It is not simulation state.** `HudViewModel.alerts` is what the
   *     host says about the prison; a control the host refused is a fact
   *     about this HUD's own interaction, and folding it into the view model
   *     would mean the HUD writing into the data it is a view over.
   *
   * It does **not** auto-dismiss. A message that clears itself on a timer is
   * a race against how fast the player reads, and there is no press to
   * acknowledge it -- so it stays until the same action later succeeds, which
   * is the first moment its sentence stops being true.
   */
  const refusalId = nextUiId('hud-refusal');
  const refusalText = element('span', { className: 'hud-refusal__text' });
  const refusal = element('div', {
    className: 'hud__refusal',
    attributes: { id: refusalId, role: 'status', 'aria-live': 'polite' },
    children: [refusalText],
  });
  refusal.hidden = true;

  /**
   * The control that last asked for each command kind, so a report lands *on
   * the control that was pressed* rather than merely somewhere on screen.
   *
   * `AsyncActionFailure.actionId` is the intent kind and the gate is
   * single-slot, so one entry per kind is enough to name the button. The
   * controls registered here carry no `aria-describedby` of their own; one
   * that gained one would need this to merge rather than replace.
   *
   * A kind is *deleted* rather than left standing when a command arrives with
   * no control behind it, which is what a drag on the world is (issue #225).
   * There is nothing on screen the player pressed, so there is nothing to
   * mark -- and marking the Build panel's button because it was the last
   * thing to ask for the same kind would point `aria-describedby` at a
   * refusal about a gesture that button had no part in.
   */
  const commandControls = new Map<string, HTMLElement>();

  /**
   * One refusal at a time, because there is one line to say it in.
   *
   * A second refusal of a *different* command replaces the first and unmarks
   * its control: the player pressed the second button, so the second is what
   * the line is about, and leaving the first marked would point
   * `aria-describedby` at a sentence about something else.
   */
  let refusedAction: string | undefined;

  const markControl = (actionId: string, refused: boolean): void => {
    const control = commandControls.get(actionId);
    if (control === undefined) return;
    if (refused) {
      control.dataset['actionFailed'] = 'true';
      control.setAttribute('aria-describedby', refusalId);
      return;
    }
    delete control.dataset['actionFailed'];
    control.removeAttribute('aria-describedby');
  };

  /**
   * Reports a failure to the player, then hands it to the host.
   *
   * In that order deliberately: a host handler that throws must not be able
   * to swallow the player's half of the report.
   */
  const reportError = (failure: AsyncActionFailure): void => {
    const messageKey = refusalMessageKey(failure.actionId);
    // `undefined` is a chrome intent, which has already been applied locally
    // -- see `refusalMessageKey`. Nothing is shown, and the host still hears.
    if (messageKey !== undefined) {
      if (refusedAction !== undefined && refusedAction !== failure.actionId) markControl(refusedAction, false);
      refusedAction = failure.actionId;
      refusalText.textContent = t(messageKey);
      refusal.dataset['action'] = failure.actionId;
      refusal.hidden = false;
      markControl(failure.actionId, true);
    }
    options.onError?.(failure);
  };

  /** The refusal stops being true the moment the same action succeeds. */
  const clearRefusal = (actionId: string): void => {
    if (refusedAction !== actionId) return;
    refusedAction = undefined;
    markControl(actionId, false);
    refusalText.textContent = '';
    delete refusal.dataset['action'];
    refusal.hidden = true;
  };

  const busy = createBusyGroup();
  const gate = new AsyncActionGate({
    onBusyChange: (isBusy) => busy.setBusy(isBusy),
    onError: reportError,
  });

  /**
   * A *command*: it asks the host to change the simulation, and the host owns
   * the result. Gated, so two rapid taps cannot hand a busy host two clock
   * commands, and so a rejection is reported rather than discarded (issue
   * #65). Nothing changes locally -- the HUD waits for the next snapshot.
   */
  const dispatchCommand = (intent: HudIntent, control?: HTMLElement): void => {
    if (control === undefined) {
      // Unmarked *before* the entry goes, or the mark would be stranded: the
      // control that carries it is about to stop being the one this kind's
      // refusal is about, and `markControl` can only reach it while the map
      // still remembers it.
      markControl(intent.kind, false);
      commandControls.delete(intent.kind);
    } else commandControls.set(intent.kind, control);
    gate.run(intent.kind, async () => {
      await options.onIntent?.(intent);
      // Reached only when the host did not throw or reject, which is the one
      // moment a standing refusal for this action becomes false.
      clearRefusal(intent.kind);
    });
  };

  /**
   * A *chrome change*: which tab is showing, which panel is folded. It is
   * the HUD's own state, so it applies immediately and unconditionally, and
   * the host is merely told.
   *
   * Deliberately not gated. Blocking a tab tap because a clock command is
   * still in flight would drop an interaction that has nothing to do with
   * the host, which is a worse bug than the one the gate exists to prevent.
   * The notification still cannot reject into the void.
   */
  const dispatchShell = (action: HudShellAction, intent: HudIntent): void => {
    applyState(hudShellReducer(state, action));
    runReported(intent.kind, () => options.onIntent?.(intent), reportError);
  };

  // ---- top status strip --------------------------------------------
  const strip = createStatusStrip({
    localizer,
    onTransport: (kind: TransportIntentKind) => {
      dispatchCommand(transportIntent(kind, viewModel), strip.controlFor(kind));
    },
  });

  // ---- bottom-left minimap frame -----------------------------------
  // A placeholder, honestly labelled in visible text. Minimap *rendering*
  // belongs to the renderer, not to the HUD; this is the frame it will draw
  // into.
  const minimapSurface = element('div', {
    className: 'hud-minimap__surface',
    children: [eyebrowText(t(HUD_MESSAGE_KEY.minimapPlaceholder), 'hud-minimap__placeholder')],
  });

  const alertList = element('div', { className: 'hud-alerts__list' });
  const alertsSection: CollapsibleSection = createCollapsibleSection({
    eyebrow: t(HUD_MESSAGE_KEY.alertsTitle),
    collapsed: isPanelCollapsed(state, 'alerts'),
    onToggle: (collapsed) => {
      dispatchShell(
        { kind: 'set-panel-collapsed', panel: 'alerts', collapsed },
        { kind: 'toggle-panel', panel: 'alerts', collapsed },
      );
    },
  });
  alertsSection.body.append(alertList);

  const minimapPanel: Panel = createPanel({
    title: t(HUD_MESSAGE_KEY.minimapTitle),
    icon: 'minimap',
    className: 'hud-minimap',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: isPanelCollapsed(state, 'minimap'),
      onToggle: () => {
        const collapsed = !isPanelCollapsed(state, 'minimap');
        dispatchShell(
          { kind: 'toggle-panel', panel: 'minimap' },
          { kind: 'toggle-panel', panel: 'minimap', collapsed },
        );
      },
    },
  });
  minimapPanel.body.append(minimapSurface, alertsSection.element);

  const corner = element('div', { className: 'hud__corner', children: [minimapPanel.element] });

  // ---- bottom-right build panel ------------------------------------
  // Placing an order is a *command*: it asks the host to change the
  // simulation, so it goes through the same gate as the transport controls
  // and a rejection is reported rather than dropped. Nothing changes locally
  // -- the wall appears when a snapshot says it was built.
  const buildPanel: BuildPanel = createBuildPanel({
    localizer,
    model: options.build ?? { buildables: [], origin: { x: 0, y: 0 } },
    onPlace: (intent) => {
      // A run of one. The numeric route names exactly one edge, and it says
      // so in the same shape a drag does so that the host has one case to
      // handle and the gate has one action id to key on.
      dispatchCommand(
        {
          kind: 'place-build-order',
          definitionId: intent.definitionId,
          edges: [{ x: intent.x, y: intent.y, edge: intent.edge }],
        },
        buildPanel.submitControl,
      );
    },
    onArm: (armed, definitionId) => {
      runReported('arm-build-tool', () => options.onIntent?.({ kind: 'arm-build-tool', armed, definitionId }), reportError);
    },
    // Buying is a *command* for the same reasons placing an order is: it asks
    // the host to change the simulation, the money leaves immediately, and a
    // second tap while one is in flight would buy twice. The button is passed
    // so a refusal lands on it as well as on the refusal line (issue #207).
    onPurchase: (intent) => {
      dispatchCommand(
        { kind: 'purchase-materials', itemId: intent.itemId, quantity: intent.quantity },
        buildPanel.purchaseControl,
      );
    },
  });
  /*
   * The Rooms panel, and the two commands it can issue (ADR 0022, amended).
   *
   * Both go through `dispatchCommand`, exactly as a build order does, and the
   * confirm control is passed with each so a refusal lands on the control that
   * was pressed as well as on the refusal line (#207). That is what makes
   * "exactly one player-visible message per refusal" true of this surface: a
   * designation the panel would not let through is never dispatched and
   * produces none, and a designation it does dispatch produces exactly one --
   * either the gate's, when the host throws before submitting, or the
   * simulation's alert row, when the kernel accepts the command and
   * `RoomZoningService` then refuses it. The two sit on opposite sides of
   * `sender.submit` and cannot both fire for one press.
   *
   * `onArm` is chrome and is deliberately not gated: it changes what a drag on
   * the world means and asks the host for nothing.
   */
  const roomsPanel: RoomsPanel = createRoomsPanel({
    localizer,
    model: options.rooms ?? { rooms: [] },
    onDesignate: (intent) => {
      dispatchCommand({ kind: 'zone-room', roomId: intent.roomId, area: intent.area }, roomsPanel.submitControl);
    },
    onRemove: (area) => {
      dispatchCommand({ kind: 'unzone-room', area }, roomsPanel.submitControl);
    },
    onArm: (armed, armOptions) => {
      runReported(
        'arm-room-tool',
        () =>
          options.onIntent?.({
            kind: 'arm-room-tool',
            armed,
            roomId: armOptions.roomId,
            removing: armOptions.removing,
          }),
        reportError,
      );
    },
  });

  /*
   * The world's room gesture, joined to the panel rather than to the gate.
   *
   * This is the one place the room surface differs from the build surface in
   * shape rather than in payload, and it is the confirm step that makes the
   * difference: a finished rectangle is *pending*, not placed, so a release
   * dispatches nothing and the intent leaves when the player presses the
   * confirm control above. A refusal therefore always has a control to be
   * marked on, which a build drag never does.
   */
  options.worldRooms?.attachGestures((gesture) => {
    roomsPanel.setPendingArea(gesture.area);
  });
  options.worldRooms?.attachReadout((area) => {
    roomsPanel.setArea(area);
  });

  /*
   * The Security tab's first inhabitant (ADR 0025).
   *
   * Two of the five tabs still render no panel at all -- Overview, until the
   * Intake panel below, and Regime -- and before this one Security was among
   * them: selecting it hid the Build panel and put nothing in its place. Hiring
   * goes here rather than onto the Build panel because no two of these panels
   * are ever laid out at the same time -- so it costs the Build panel's
   * measured height budget nothing, and the third button
   * `.hud-build__actions` cannot hold is never needed -- and because a guard is
   * not made of the material the selected buildable is made of.
   *
   * Hiring is a *command* for the same reasons placing an order and buying
   * are: it asks the host to change the simulation, the money leaves
   * immediately, and a second tap while one is in flight would hire twice. The
   * button is passed so a refusal lands on it as well as on the refusal line
   * (issue #207).
   */
  const staffPanel: StaffPanel = createStaffPanel({
    localizer,
    model: options.staff ?? { roles: [] },
    onHire: (intent) => {
      dispatchCommand({ kind: 'hire-staff', staffRoleId: intent.staffRoleId }, staffPanel.hireControl);
    },
  });

  // ---- bottom-right intake panel (Overview tab) ---------------------
  // Shares `.hud__side` with the Build, Rooms and Staff panels and is never
  // laid out beside any of them: exactly one of the four is visible, keyed on
  // the active tab, so the always-visible budget ADR 0022 measured for the
  // Build tab is unchanged and the last tab bound to no panel is Regime. See
  // `intake-panel.ts` for why the Overview tab rather than a Build-panel row
  // or a tab of its own, with the measurements behind it.
  const intakePanel: IntakePanel = createIntakePanel({
    localizer,
    // Admitting is a *command*: it asks the host to change the simulation,
    // and a refusal has to reach the player rather than being dropped. The
    // button is passed so the refusal lands on it as well as on the refusal
    // line (issue #207).
    onAdmit: () => {
      dispatchCommand({ kind: 'admit-prisoner' }, intakePanel.submitControl);
    },
  });

  const side = element('div', {
    className: 'hud__side',
    children: [intakePanel.element, buildPanel.element, roomsPanel.element, staffPanel.element],
  });

  /**
   * The other route to the same command: a run dragged along the world
   * (issue #225).
   *
   * It goes through `dispatchCommand`, exactly as the button above does, and
   * that is the whole of the fix -- the gate refuses a second gesture while
   * one is in flight, and a refusal paints the same line with the same
   * `data-action`. Before this the drag went straight from the composition
   * root to the command sender and a refused wall reached `console.warn`.
   *
   * **No control is passed**, and that is deliberate rather than an omission:
   * the player pressed nothing, so there is no control for the report to land
   * on. The refusal line still says what happened, which is the surface issue
   * #207 established as "reaching the player" at every viewport.
   *
   * The whole run travels as one intent. `BuildTool` already de-duplicates
   * and canonicalises the segments, and this is the point at which "one
   * gesture is one transaction" has to survive: a per-segment dispatch here
   * would have the gate refuse every segment after the first as busy, and
   * would ask the host for twelve unrelated orders where the player drew one
   * wall.
   */
  options.worldBuild?.attachOrders((order) => {
    dispatchCommand({ kind: 'place-build-order', ...order });
  });

  /**
   * The undo and redo keys, joined to the same gate (#261).
   *
   * The direction is the intent kind, and `tsc` checks that rather than this
   * line trusting it: a `HudHistoryDirection` member with no matching
   * `HudIntent` member fails here with "not assignable", measured by adding a
   * third direction. So the two vocabularies cannot drift apart silently.
   *
   * No control is passed, for the reason the gesture above passes none: the
   * player pressed a key on the world, not a button in the HUD, so there is
   * nothing on screen for a refusal to be marked on. The refusal line still
   * says what happened.
   */
  options.editHistory?.attachHistory((direction) => {
    dispatchCommand({ kind: direction });
  });

  /**
   * The right rail: one column, holding the host's aside slot at the top and
   * the Build panel at the bottom.
   *
   * It exists because two panels down the right-hand edge have to be laid out
   * *relative to each other*, and before issue #88 they were not: the save
   * panel was its own `position: fixed` layer at `z-index: 10` and the HUD was
   * another at `z-index: 20`, so on the Build tab the Build panel sat on top
   * of the save panel and swallowed every click on it. Sharing one flow column
   * makes that impossible rather than merely fixed -- two boxes stacked in a
   * flex column cannot overlap at any viewport size, and nothing has to
   * remember to check.
   */
  const aside = element('div', { className: 'hud__aside' });
  const rail = element('div', { className: 'hud__rail', children: [aside, side] });

  // ---- bottom-centre tab bar ---------------------------------------
  const tabs: TabButton[] = HUD_TABS.map((definition) =>
    createTabButton({
      id: definition.id,
      icon: definition.icon,
      label: t(definition.labelKey),
      selection: 'aria-current',
      onSelect: (id: string) => {
        const tab = id as HudTabId;
        dispatchShell({ kind: 'select-tab', tab }, { kind: 'select-tab', tab });
      },
    }),
  );

  const tabBar = element('nav', {
    className: 'hud__tabs',
    attributes: { 'aria-label': t(HUD_MESSAGE_KEY.tabsRegion) },
    children: [element('div', { className: 'hud-tabs__inner', children: tabs.map((tab) => tab.element) })],
  });

  const hud = element('div', {
    className: 'hud',
    // DOM order matches grid order, so reading order and tab order agree with
    // what is painted: the standing "no simulation" band first, then the
    // refusal line about the last press, then the world's furniture.
    children: [strip.element, unavailable, refusal, corner, rail, tabBar],
  });

  // Only the controls that issue a *command* are disabled while one is in
  // flight. One busy signal for the three of them, so they can never
  // disagree about whether the clock is being changed. Chrome controls are
  // deliberately absent: see `dispatchShell`.
  for (const control of strip.controls) busy.add(control);
  // The Build panel's controls join the same group: its "Place order" is a
  // command too, so a second tap while one is in flight must not queue a
  // duplicate build order.
  for (const control of buildPanel.controls) busy.add(control);
  // And the Rooms panel's one command control, for the same reason: a second
  // tap on the confirm while a designation is in flight must not queue a
  // duplicate room.
  for (const control of roomsPanel.controls) busy.add(control);
  // And so does the Staff panel's "Hire": one busy signal for every control
  // that issues a command, so they can never disagree about whether one is in
  // flight.
  for (const control of staffPanel.controls) busy.add(control);
  // And the Intake panel's "Admit", for the same reason: admitting is a
  // command, so a second tap while one is in flight must not hand the host two
  // admissions.
  for (const control of intakePanel.controls) busy.add(control);

  // ---- state application -------------------------------------------
  function applyState(next: HudShellState): void {
    if (next === state) return; // the reducer returns the same object for a no-op
    state = next;
    paintState();
  }

  function paintState(): void {
    hud.dataset['activeTab'] = state.activeTab;
    for (const tab of tabs) tab.setActive(tab.id === state.activeTab);
    // Hidden, not merely unstyled: a panel that is off-screen but still in the
    // tab order is a control a keyboard can reach and a player cannot see.
    buildPanel.setVisible(state.activeTab === 'build');
    roomsPanel.setVisible(state.activeTab === 'rooms');
    staffPanel.setVisible(state.activeTab === 'security');
    // The fourth occupant of `.hud__side`, and the reason the four can share
    // one box: the conditions are mutually exclusive, so exactly one panel is
    // ever laid out there and none pays for the others' height.
    intakePanel.setVisible(state.activeTab === 'overview');
    for (const panel of HUD_PANEL_IDS) {
      const collapsed = isPanelCollapsed(state, panel);
      if (panel === 'minimap') minimapPanel.setCollapsed(collapsed);
      else alertsSection.setCollapsed(collapsed);
    }
  }

  // ---- alerts ------------------------------------------------------
  const alertRows = new Map<string, ListRow>();
  let emptyRow: ListRow | undefined;

  function paintAlerts(): void {
    const seen = new Set<string>();
    for (const [index, alert] of viewModel.alerts.entries()) {
      seen.add(alert.id);
      const text = t(alert.labelKey, alert.labelParameters);
      const badge = { tone: severityTone(alert.severity), text: t(severityLabelKey(alert.severity)) };
      const existing = alertRows.get(alert.id);
      let row = existing;
      if (row === undefined) {
        row = createListRow({ icon: 'incident', label: text, badge });
        row.element.dataset['alert'] = alert.id;
        alertRows.set(alert.id, row);
      } else {
        row.setLabel(text);
        row.setBadge(badge);
      }

      // The drawn order is `viewModel.alerts`'s order, re-established on every
      // paint. Appending a new row instead put the list in *first-seen* order,
      // which is the same defect `src/main.ts` orders the buildable catalogue
      // to avoid -- "an order that depended on module evaluation would be an
      // order nobody chose". Measured, not reasoned about:
      // mounting with `[a, b]` and updating to `[c, a, b]` laid out
      // `a, b, c` -- issue #209's residual-risk note, and
      // `ui-shell.spec.ts`'s "alerts list order" block is that measurement
      // kept.
      //
      // Rows are moved rather than rebuilt: `HudAlertViewModel.id` exists so
      // that "a list update is not a full rebuild", and emptying the list
      // every paint would discard the focus and the transition state of a row
      // the player is looking at. Stale rows and the empty-list row are still
      // in the list at this point and are removed below; they only ever sit
      // *after* the rows placed so far, so they cannot displace one.
      const occupant = alertList.children.item(index);
      if (occupant !== row.element) alertList.insertBefore(row.element, occupant);
    }

    for (const [id, row] of alertRows) {
      if (seen.has(id)) continue;
      row.element.remove();
      alertRows.delete(id);
    }

    // An empty list must say it is empty. A blank rectangle is indistinguishable
    // from a broken one.
    if (viewModel.alerts.length === 0 && emptyRow === undefined) {
      emptyRow = createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.alertsEmpty) });
      emptyRow.element.dataset['alert'] = 'empty';
      alertList.append(emptyRow.element);
    } else if (viewModel.alerts.length > 0 && emptyRow !== undefined) {
      emptyRow.element.remove();
      emptyRow = undefined;
    }
  }

  const update = (next: HudViewModel): void => {
    viewModel = next;
    strip.update(next);
    paintAlerts();
    // The enclosure readout is session state, so it arrives here rather than at
    // mount. Passed straight through: the panel decides what to render and this
    // line decides nothing, which is what keeps "what the simulation found"
    // and "what the player is told about it" in one place each.
    roomsPanel.setZoningNotice(next.zoning);
  };

  paintState();
  update(viewModel);
  root.append(hud);

  return {
    element: hud,
    asideSlot: aside,
    brandSlot: strip.brandSlot,
    update,
    setBuildTarget: (target) => buildPanel.setTarget(target),
    setUnavailable,
    getState: () => state,
    dispatch: (action: HudShellAction) => {
      applyState(hudShellReducer(state, action));
    },
    destroy: () => {
      gate.dispose();
      hud.remove();
    },
  };
}

/**
 * What each transport button asks for, given what the clock is doing now.
 *
 * Pause never changes the speed, so unpausing resumes at the speed the
 * player chose rather than silently resetting to ×1.
 */
export function transportIntent(kind: TransportIntentKind, viewModel: HudViewModel): HudIntent {
  switch (kind) {
    case 'pause':
      return { kind: 'set-clock', mode: 'paused', speed: viewModel.clock.speed };
    case 'play':
      return { kind: 'set-clock', mode: 'running', speed: 1 };
    case 'fast-forward':
      return { kind: 'set-clock', mode: 'running', speed: nextFastForwardSpeed(viewModel.clock.speed) };
  }
}
