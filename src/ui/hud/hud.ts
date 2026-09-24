import type { LocalizationKey } from '../../content/localization';
import { DEFAULT_LAYOUT_SETTINGS, type LayoutSettings } from '../../input/layout-preference';
import type { MessageParameters } from '../../services/localization/format';
import { hostRefusalReason } from '../host-refusal';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  runReported,
} from '../primitives/async-action';
import { describeBy, element, eyebrowText, nextUiId, undescribeBy } from '../primitives/dom';
import type { IconId } from '../primitives/icon';
import { createIconButton } from '../primitives/icon-button';
import { type CollapsibleSection, createCollapsibleSection } from '../primitives/collapsible-section';
import { type ListRow, createListRow } from '../primitives/list-row';
import { type Panel, createPanel } from '../primitives/panel';
import { type TabButton, createTabButton } from '../primitives/tab-button';
import { type BuildPanel, type BuildPanelTarget, createBuildPanel } from './build-panel';
import { type IntakePanel, createIntakePanel } from './intake-panel';
import { type OverviewPanel, createOverviewPanel } from './overview-panel';
import { type RegimePanel, createRegimePanel } from './regime-panel';
import { type RosterPanel, createRosterPanel } from './roster-panel';
import { type RoomsPanel, createRoomsPanel } from './rooms-panel';
import { type SecurityPanel, createSecurityPanel } from './security-panel';
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
import { type HudLayoutShell, createHudLayoutShell } from './layout-shell';
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
  type HudEventNoticeViewModel,
  type HudRefusalNoticeViewModel,
  type HudRoomsViewModel,
  type HudSpeed,
  type HudStaffViewModel,
  type HudViewModel,
} from './view-model';
import { hudAlertDismissLabel, hudAlertRowLabel } from './alert-row-label';
import {
  EMPTY_EVENT_BAND_DWELL_STATE,
  admitToEventBand,
  advanceEventBand,
  type EventBandDwellDecision,
  type EventBandDwellState,
} from './event-band-dwell';
import { renderHudLabel } from './label-parameters';

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
  // The icons keep their own ids. `IconId` is a drawing's name, not a
  // section's: the shape the `zones` tab shows is still the floor-plan glyph
  // `rooms` names in `src/ui/primitives/icon.ts`, and renaming a path set to
  // follow a navigation change would be a second, unrelated diff over every
  // other consumer of the same glyph.
  { id: 'zones', icon: 'rooms', labelKey: HUD_MESSAGE_KEY.tabZones },
  { id: 'manage', icon: 'security', labelKey: HUD_MESSAGE_KEY.tabManage },
  { id: 'day-plan', icon: 'regime', labelKey: HUD_MESSAGE_KEY.tabDayPlan },
  // The sixth section (2026-09-17). `incident` rather than `security`, which
  // the `manage` tab above already draws: the glyph is a drawing's name and two
  // sections wearing one silhouette is the defect #1283 is fixing elsewhere in
  // this array, not one to add to.
  { id: 'security', icon: 'incident', labelKey: HUD_MESSAGE_KEY.tabSecurity },
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
  /**
   * Whether an arbitrary rectangle's own perimeter is walled in, as of the
   * newest world data the tool has (issue #493).
   *
   * A **query**, unlike every other member of this interface: `attachGestures`
   * and `attachReadout` are wired once, at mount, and report *out* on the
   * tool's own schedule. This one is called synchronously, on demand, by
   * whichever of the two producers of a rectangle needs an answer for the one
   * it just produced -- a finished world gesture (below) or the panel's own
   * typed-coordinates form, which drags nothing and has no frame of its own to
   * report on. Both must reach the same verdict for the same four numbers
   * (#411's parity guarantee), so both ask the one thing that can answer for
   * either: the tool holds the newest `WorldRenderView` the scene has handed
   * it, and it is the only object on this side of the HUD boundary allowed to
   * import the simulation's own perimeter walk
   * (`src/simulation/rooms/enclosure.ts`) to answer with it, rather than a
   * second implementation of the same rule.
   *
   * `'sealed' | 'open'`, not imported from the simulation: the HUD may not
   * import `src/simulation/**` at all (`AGENTS.md` boundary 1,
   * `tests/unit/ui-hud-messages.test.ts`), so this is the same two-value union
   * restated on this side of the boundary, exactly as `HudZoningNoticeViewModel
   * .enclosure` already is.
   */
  classifyArea(area: HudRoomArea): 'sealed' | 'open';
}

/**
 * A finished object placement on the world, as the HUD is willing to know it.
 *
 * One buildable id and one tile. Not a rectangle, because the gesture is one
 * press on one tile (ADR 0028 decision 5) and the footprint the preview drew is
 * content the HUD does not hold -- the *anchor* is the whole of what the
 * simulation needs, and it derives the footprint from the object catalogue.
 *
 * No orientation, because nothing can produce one: the rotate control that
 * decision 5 describes needs an input action phase 1 does not ship, and a field
 * the interface always sets to the same value would be a field with no reader.
 */
export interface HudObjectPlacement {
  readonly definitionId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * A finished object gesture on the world: a placement, or a removal (ADR 0028
 * phase 3).
 *
 * A **union in the shape `HudRoomGesture` is a union**, and for the same reason:
 * the two arms of one mode carry different fields, because a removal names no
 * object type. What comes away is whatever is standing on the tile, so a
 * `definitionId` here would be a field the consumer must be told to ignore.
 *
 * Discriminated rather than "a placement with an optional definition id", so
 * `tsc` and not a reader decides which fields each arm has.
 *
 * **`remove`'s `edge`, added by ADR 0106, is optional for the reason `place`
 * carries no edge at all: it is set only by a world press, which always has
 * one to give (`pickEdgeAtWorld` resolves any finite point), and absent from
 * a source that has no sub-tile position -- none exists today, but the type
 * does not assume the object tool is the only producer forever. `hud.ts`
 * reads its presence to decide between `RemoveObject` and `RemoveWall`.
 */
export type HudObjectGesture =
  | ({ readonly kind: 'place' } & HudObjectPlacement)
  | { readonly kind: 'remove'; readonly x: number; readonly y: number; readonly edge?: HudBuildEdge };

/**
 * The world's object gesture, as the HUD is willing to know it (ADR 0028).
 *
 * The same shape as `HudWorldBuildSource` and `HudWorldRoomSource`, and for the
 * same two reasons: the host builds the tool before the HUD exists, so the
 * connection is made in this direction rather than by handing a callback out;
 * and the gesture arrives as a *report*, never as a command, so the HUD
 * dispatches its own intent and a refused placement reaches the refusal line by
 * exactly the machinery a refused build order does.
 *
 * A **third source** rather than a widened one, because the three carry
 * different shapes -- edges, a rectangle, a tile -- and because a host may have
 * one and not the others.
 *
 * Unlike the room source there is no confirm step: a placement is committed on
 * release, as a build order is, because it *is* a build order and can be taken
 * back by `Undo` the moment it is regretted. The Rooms panel needs a confirm
 * because an accepted designation could not be reversed at all until
 * `UnzoneRoom` existed.
 */
export interface HudWorldObjectSource {
  /**
   * Points the finished-gesture report at the HUD. Called once, at mount.
   *
   * Named `attachGestures`, matching `HudWorldRoomSource`, since the gesture
   * gained its removing arm: `attachPlacements` was true of a source that could
   * only place, and a name that says "placement" for a callback that also
   * reports removals is the kind of half-truth this tree renames rather than
   * documents.
   */
  attachGestures(report: (gesture: HudObjectGesture) => void): void;
  /**
   * Points the live readout at the mounted panel. Called once, at mount (#550).
   *
   * The same member `HudWorldRoomSource` has, aimed at a different panel: a room
   * gesture's rectangle is read back on the Rooms panel's "Area" line, and an
   * object gesture's tile on the Build panel's "Where" line, because the Build
   * panel is where an object is armed from.
   *
   * It carries `BuildPanelTarget` rather than a tile shape of its own, because
   * it feeds the identical line `BuildTool.attachReadout` feeds and the two must
   * not be able to disagree about what that line accepts. An object aim is that
   * shape with no edge on it.
   */
  attachReadout(readout: (target: BuildPanelTarget | undefined) => void): void;
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
 * ~~There is no control on screen for either.~~ **False since #1356**: the
 * status strip carries an Undo and a Redo button, which dispatch the same two
 * intents through `createStatusStrip`'s `onUndo`/`onRedo`. This source is still
 * the *key's* route and still carries no control, and the rest of the
 * paragraph still holds of it: the refusal line is laid out at every viewport
 * and needs no control to name (`reportError`, and the `worldBuild` attachment
 * below).
 */
export interface HudEditHistorySource {
  /** Points the undo/redo report at the HUD. Called once, at mount. */
  attachHistory(request: (direction: HudHistoryDirection) => void): void;
}

/**
 * The world's "put the tool down" key, as the HUD is willing to know it
 * (issue #959).
 *
 * The same shape as `HudWorldBuildSource` and `HudEditHistorySource`, and a
 * source rather than a callback the HUD hands out for the same reason: the
 * thing that carries this exists before the HUD does.
 *
 * **It carries no direction, no tool and no id, and that is the contract
 * rather than an omission.** The renderer knows a key was pressed on the
 * world; which tool is in the player's hand is *this* module's own state,
 * held on whichever panel armed it. A source that named a tool would be the
 * renderer answering a question the HUD is the only place that can, and the
 * two would then be able to disagree about which pointer the player is
 * holding -- which is the class of defect #550 and #689 are both instances
 * of.
 *
 * Unlike `attachOrders` and `attachHistory` this dispatches **no intent**.
 * Arming is chrome (`tool-arming.ts`: *"The pair is chrome, not simulation
 * state"*), so putting a tool down issues no command, can be refused by
 * nothing, and needs no gate -- it repaints two panels and tells the host
 * through the `onArm` callback those panels already own.
 */
export interface HudToolStandDownSource {
  /** Points the "put the tool down" report at the HUD. Called once, at mount. */
  attachStandDown(request: () => void): void;
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
   * Put one object on one tile (ADR 0028 phase 1).
   *
   * A separate intent from `place-build-order` even though both end in a
   * construction order, because the two carry different shapes and are refused
   * for different reasons: a wall order names an edge and is checked against one
   * tile, and a placement names a tile and is checked against a footprint, the
   * objects already standing, the orders still in flight and the room the tile
   * is in. Folding them together would make `edges` optional and every reader
   * would have to establish which kind it was holding.
   *
   * Two producers reach it, exactly as two reach `place-build-order`: the world
   * gesture (`worldObjects`) and the Build panel's numeric fields, which is what
   * gives object placement a keyboard route on the day it ships rather than
   * later -- `AGENTS.md` boundary 10 is not satisfied by "it works with a
   * mouse", and ADR 0022's amendment records the Rooms panel shipping without
   * one as an open question.
   */
  | ({ readonly kind: 'place-object' } & HudObjectPlacement)
  /**
   * Take away the object on one tile (ADR 0028 phase 3).
   *
   * A separate intent from `place-object` rather than a flag on it, for the
   * reason the gesture is a union: a removal carries no `definitionId`, because
   * it names no object type. Two producers reach it, exactly as two reach
   * `place-object` -- the world gesture while the tool is armed to remove, and
   * the Build panel's numeric fields while the same mode is on, which is what
   * gives removal a keyboard route on the day it ships instead of leaving it as
   * `Undo`'s keyboard-only chord.
   *
   * **Why this exists at all**, since `Undo` already took a placement back: undo
   * is bound to `KeyZ` and nothing else, so on a touch device a misplaced object
   * was permanent for the session. That is the trap the Rooms tab shipped with
   * and had to fix in a follow-up, and it is not worth repeating. *(The first
   * clause stopped being true with #1356, which put Undo and Redo buttons in
   * the status strip; the intent does not lean on it any more, because Undo
   * reaches only the newest transaction and only while it is the player's
   * latest action -- ADR 0104 -- and a removal reaches any object.)*
   *
   * **`edge`, added by ADR 0106, is optional and carries the same asymmetry as
   * `HudObjectGesture`'s own `remove` arm.** Present only when the world
   * gesture supplied one -- `pickEdgeAtWorld` always resolves a press to an
   * edge, so the object tool's world press always sets it -- and absent from
   * the Build panel's numeric route, which names a typed tile with no sub-tile
   * position for an edge to come from. `src/main.ts` reads its presence to
   * decide which command a press becomes: `RemoveWall` when present, plain
   * `RemoveObject` (this intent's original, edge-less shape) when not. A
   * finished wall therefore has no keyboard route through this field alone --
   * the numeric route stays exactly what it was, which is what
   * `edgeChooserShown` already documents for the removing mode.
   */
  | { readonly kind: 'remove-object'; readonly x: number; readonly y: number; readonly edge?: HudBuildEdge }
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
   * Sell stock back to the depot at a loss (ADR 0075 decision 3, invoked by
   * ADR 0096 decision 3(b)).
   *
   * A *command*, on `purchase-materials`'s own reasons: a second tap while
   * one is in flight must not hand a busy host two sales, and a refusal has
   * to reach the player rather than being discarded. Unlike a purchase it
   * needs no pre-flight balance check -- the host holds no live count of what
   * is in the container to check a quantity against -- so every refusal this
   * intent can provoke is the simulation's own, reached the way
   * `cancel-material-purchase`'s is.
   */
  | { readonly kind: 'sell-materials'; readonly itemId: string; readonly quantity: number }
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
   *
   * `removing` travels with `armed` rather than as a second signal, exactly as
   * `arm-room-tool`'s does and for the same reason its comment gives: the two
   * halves describe one armed tool, and a host that could see them disagree
   * would draw a removal ghost for a placing gesture. It is `false` for every
   * arming that places, and the field is required rather than optional so a
   * producer cannot forget to answer.
   */
  | {
      readonly kind: 'arm-build-tool';
      readonly armed: boolean;
      readonly definitionId: string | undefined;
      readonly removing: boolean;
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
   * The player asked for **one particular** queued order to be withdrawn.
   *
   * One id, one revision and nothing else -- the host turns this into a
   * `CancelBuildOrder` command carrying both; the HUD does not know that such
   * a command exists, that it carries `expectedRevision`, or what that field
   * is compared against (ADR 0107). Both came *in*, on the build-queue view
   * model, from the projection that names the pending orders -- `revision` is
   * the row's own `BuildQueueOrderViewModel.revision`, carried out unchanged.
   *
   * **Why this is not `undo`.** Both take a wall back, and that is where the
   * resemblance stops. `Undo` is payload-free by protocol and reverses the last
   * *transaction* -- a twelve-segment drag is one gesture and undoes as one wall
   * -- so it can take back everything after the order the player is looking at
   * but not that order alone. This names the order. Since #348 the difference is
   * something a player actually meets: construction builds one order at a time,
   * so eleven of those twelve segments sit queued for hundreds of ticks and
   * "cancel the third one, keep the rest" is the obvious thing to want.
   *
   * A *command*, so it goes through the same gate as a build order: a second tap
   * while one is in flight must not hand a busy host two cancellations, and a
   * refusal has to reach the player rather than being discarded. Cancellation is
   * idempotent at the simulation's command boundary -- an id naming nothing is
   * swallowed -- so the refusal this can paint is about *this thread* (no worker,
   * no session), which is what `hud.refusal.cancel-build-order` says.
   */
  | { readonly kind: 'cancel-build-order'; readonly orderId: string; readonly revision: number }
  /**
   * The player asked for **one particular** purchase to be cancelled and its
   * money returned (#285).
   *
   * One id and nothing else -- the host turns this into a
   * `CancelMaterialPurchase`; the HUD does not know that such a command exists,
   * and the id is not one it could mint. It came *in*, on the pending-deliveries
   * view model, from the projection that names the purchases still in flight.
   *
   * **Why this is not `cancel-build-order`.** The two name different records and
   * the ids are independent by construction: buying materials mints a purchase
   * id and spends immediately, placing a build order mints an order id and
   * spends nothing. So cancelling a build order cannot return the money -- there
   * is no payment attached to it -- and this is the only intent in the interface
   * whose subject is a credit to the treasury.
   *
   * A *command*, so it goes through the same gate as a purchase: a second tap
   * while one is in flight must not hand a busy host two cancellations, and a
   * refusal has to reach the player. Unlike a cancelled build order, a refused
   * cancellation is a real state a player meets without doing anything wrong --
   * the delivery can land between the publication and the press -- and the
   * simulation reports it as `cancel-purchase.not-pending` on the alerts
   * channel. What `hud.refusal.cancel-material-purchase` says is the other side
   * of the dispatch: this thread had no session to send to.
   */
  | { readonly kind: 'cancel-material-purchase'; readonly orderId: string }
  /**
   * The player asked for a guard to be released from whatever is holding it
   * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * An id and nothing else, and deliberately **no claim**. The HUD is told what
   * is holding each guard so it can say so on the row, and it does not send that
   * back: which claimant to ask is resolved inside the simulation at the tick
   * the command executes, because `'on-search'` is a shared deployment phase and
   * the only way to tell a responder from a searcher is to ask both claimants
   * live. A claim travelling out on this intent would be this thread guessing
   * from a projection that is a cadence old, and it would be wrong in exactly
   * the race the release's own `release-guard.not-held` refusal exists for.
   *
   * A *command*, so it goes through the same gate as a purchase: a second tap
   * while one is in flight must not hand a busy host two releases. Like a
   * refused cancellation, a refused release is a real state a player meets
   * without doing anything wrong -- the response can close between the
   * publication and the press -- and the simulation reports that as
   * `release-guard.not-held` on the alerts channel. What
   * `hud.refusal.release-guard` says is the other side of the dispatch: this
   * thread had no session to send to.
   */
  | { readonly kind: 'release-guard'; readonly guardId: number }
  /**
   * The player asked for a staff member's employment to end (issue #533, the
   * owner's decision on issue #535 decision 4).
   *
   * An id and nothing else, and deliberately **no role and no money**. The role
   * is a property of the record the id already reaches; the money is absent
   * because a dismissal moves none, which is
   * `src/simulation/staff/dismissal.ts`'s decision and stated there.
   *
   * A *command*, so it goes through the same gate as a hire: a second tap while
   * one is in flight must not hand a busy host two dismissals. Like a refused
   * release, a refused dismissal is a real state a player meets without doing
   * anything wrong -- the roster block is a projection on a cadence, so a row
   * can name somebody already dismissed -- and the simulation reports that as
   * `dismiss.unknown-staff` on the alerts channel.
   *
   * **The counterpart of `hire-staff`, not of `release-guard`.** Releasing hands
   * a guard back to the pool and `DeploymentSystem` may post them again on its
   * next cycle; this ends the payroll line. Before it, nothing in the
   * application could end one.
   */
  | { readonly kind: 'dismiss-staff'; readonly staffId: number }
  /**
   * The player has changed what one group's running regime block allows
   * (#1167, ADR 0113 slice 1's missing producer).
   *
   * A *command*, on `hire-staff`'s terms: it asks the simulation to change,
   * and a second press while one is in flight must not hand a busy host two
   * edits of the same block.
   *
   * **The block is named by the tick it starts on, not by an index**, which is
   * ADR 0113 section 3's own choice and the reason
   * `HudRegimeBlockViewModel.startTickOfDay` is carried at all: the registry
   * reorders schedules into a canonical order on restore, so an index can mean
   * a different block after a reload and a boundary cannot.
   *
   * **The whole new category list travels, not a delta.** `EditRegimeBlock`
   * replaces `allowedCategories` wholesale, so a diff would have to be applied
   * against a copy of the schedule this thread holds on a cadence -- the same
   * reason `onCancelPurchase` one panel over does not send a position.
   */
  | {
      readonly kind: 'edit-regime-block';
      readonly classificationGroupId: string;
      readonly startTickOfDay: number;
      readonly allowedCategoryIds: readonly string[];
    }
  /**
   * The player has read a row of the alerts log and wants it gone (the owner's
   * decision 3 of 2026-09-01 on
   * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
   *
   * **The row's id and nothing else.** The two ordinals the wire needs are on
   * the row the id names, and the host reads them off the list it is holding
   * (`alertRowDismissal`); putting them on the intent would make the HUD
   * describe a run of arrivals, which is not a thing it knows about -- it
   * paints rows.
   *
   * **Not a *command* in the gated sense, unlike every intent above it.** The
   * gate exists so a second tap while one is in flight does not hand a busy
   * host two of something, and so a refusal reaches the player. Neither
   * applies: a dismissal is idempotent -- the row is already off the list by
   * the time a second tap could land, and the simulation treats a dismissal it
   * cannot place as a success (`SimulationEventLog.dismiss`) -- and there is no
   * refusal to paint, which is why no `hud.refusal.*` sentence is added for it.
   * A dismissal made while this thread has no session is simply local: the row
   * goes, and there is no session for it to have survived into anyway.
   *
   * **Only the rows this channel's own producer made can be dismissed**, which
   * the HUD does not decide: a row carries `occurrences` or it does not, and
   * the refusal and protocol-fault rows do not. Their dismissal is
   * `docs/HUD_PROJECTIONS.md` gap 34, which ADR 0084 explicitly did not reopen.
   */
  | { readonly kind: 'dismiss-alert'; readonly rowId: string }
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
    }
  /**
   * The player chose one prisoner to look at, or cleared their choice
   * (issue #895).
   *
   * *Chrome*, exactly like the two arming intents above: the Regime panel has
   * already applied it -- the row is checked and the inspector is waiting for an
   * answer -- and it asks the simulation to change nothing, so it is never
   * gated. Blocking it while a clock command was in flight would drop an
   * interaction that costs the prison nothing.
   *
   * **An entity id and nothing else, and `undefined` is a value rather than an
   * absent field.** The host turns an id into a `hud/prisoner-detail` request
   * and `undefined` into "stop asking"; the HUD does not know that such a
   * projection exists, and could not have minted the id -- it came *in*, on the
   * roster view model, from the projection that names the window.
   *
   * **Why an id is a safe name for a person where a roster *offset* is not.**
   * `src/ui/simulation-prisoner-roster.ts` refuses paging because `EntityStore`
   * recycles an index behind a wrapping generation, so "page 3" would silently
   * be a different three prisoners after a release. An `EntityId` is not that
   * index: it packs the index *with* the generation, and ADR 0026 question 1's
   * answer retires a slot at generation 4,095 rather than reissuing the id its
   * first life carried. So this names the prisoner the player pressed or names
   * nobody -- a state both the host and the panel handle -- and it can never
   * quietly name somebody else.
   */
  | { readonly kind: 'select-prisoner'; readonly prisonerId: number | undefined }
  /**
   * The player chose an incident on the Security section, or cleared the choice
   * (2026-09-17).
   *
   * The same shape and the same reasoning as `select-prisoner` above, one
   * section over: *chrome*, already applied by the panel, asking the simulation
   * to change nothing, so it is never gated. The host turns an id into a
   * `hud/incident-detail` request and `undefined` into "stop asking".
   *
   * **A string id rather than a number, and that is the protocol's own
   * distinction rather than this file's.** `projectionTargetSchema` declares
   * two target kinds because the two id spaces are genuinely different types --
   * `projectPrisonerDetail` takes an `EntityId`, `projectIncidentDetail` takes a
   * string -- and carrying one as the other would mean a parse at a trust
   * boundary, which is what that schema exists to avoid.
   *
   * An incident id is safe to name here for the reason an `EntityId` is:
   * `IncidentLog` never deletes a record and never reissues an id, so this
   * names the incident the player pressed or names nothing, and can never
   * quietly name a different one.
   */
  | { readonly kind: 'select-incident'; readonly incidentId: string | undefined }
  /**
   * The player pressed a message row that is about somewhere, and the place it
   * names is where they want to be looking (the owner's ruling of 2026-09-22
   * on
   * [ADR 0122](../../../docs/adr/0122-what-an-action-column-is-and-whether-a-message-can-carry-a-next-step.md),
   * option D step 3).
   *
   * **The ruling is what this member is, and it is narrower than a
   * destination system.** The owner chose the option labelled *"Naciskany
   * wiersz, bez czasownika"* -- *"a pressable row, without the verb"* -- from
   * three, the other two being a labelled button at the horizontal budget's
   * price and no action at all. So the row is the press, no action-verb label
   * is owed, and **no player-visible string is authored for it**: the row
   * already carries the sentence and the severity word, and those two are the
   * whole of what a screen reader announces. The provenance is the weaker kind
   * `AGENTS.md` flags of every ruling since 2026-09-08 -- the label of a
   * clickable option this repository wrote and the owner picked, not a
   * sentence they typed.
   *
   * **A tile and nothing else**, forwarded rather than decided: it is
   * `HudAlertViewModel.tile`, which is `SimulationRefusal.tile` read off the
   * wire, and that field's own comment carries which six of the sixteen
   * refusal domains publish one and why the other ten honestly cannot. The
   * HUD does not know what a tile *is* beyond two numbers -- it does not know
   * how many world units one spans, which is the renderer's
   * (`src/rendering/tile-metrics.ts` owns that constant) -- so it hands the
   * pair on unconverted.
   *
   * **Not a *command* in the gated sense**, for `dismiss-alert`'s reasons one
   * step further along: moving a camera never reaches the simulation at all
   * (`AGENTS.md` boundary 1), so there is nothing for the intent gate to
   * serialise against and no refusal for `.hud__refusal` to paint. A second
   * press while the first is still settling centres the same camera on the
   * same tile twice, which is the same thing once.
   *
   * **Routed through `HudIntent` even though the minimap's camera gesture is
   * not, and that is ADR 0122's choice rather than an inconsistency this file
   * introduces.** `onMinimapNavigate` is a direct callback precisely because a
   * camera move is not a command; option D step 3 nonetheless names *"the HUD
   * intent union gains one member ... and `src/main.ts` routes it"*, and the
   * reason holds: the minimap's callback is a *surface* handing over a point
   * it owns, while this is a *row in a log* reporting which message was
   * pressed. Keeping it on the intent union is what puts it in
   * `hudIntents()`'s inventory, so a browser test can watch the press become
   * one intent rather than inferring it from a camera that moved.
   */
  | { readonly kind: 'show-alert-place'; readonly tile: { readonly x: number; readonly y: number } };

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
  /** Display-only camera bindings resolved from the input settings used by the world scene. */
  readonly cameraKeyHint?: Promise<string | undefined>;
  /**
   * The player's stored layout: which regions are folded and how wide or tall
   * the two resizable ones are (#1159).
   *
   * Passed in rather than read here, exactly as the interface scale and the
   * theme are: the composition root owns `lockstate.settings.layout`, because
   * choosing the environment is its job and because a HUD that reached for
   * `localStorage` itself is issue #199's blank page. Omitted, the shell opens
   * at the layout this repository has always drawn.
   */
  readonly layout?: LayoutSettings;
  /**
   * Reports a **settled** layout for the host to persist -- a fold, a keyboard
   * or slider resize, a reset, or the end of a pointer drag. Never a frame of
   * one: see `HudLayoutShellOptions.onChange`.
   */
  readonly onLayoutChange?: (layout: LayoutSettings) => void;
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
   * The world's `Escape`, as far as *arming* is concerned (issue #959).
   *
   * Supplied, the HUD attaches to it once at mount and a press with no
   * gesture to abandon stands both map tools down -- the same transition
   * leaving a tab already makes, reaching the same `onArm` report and the same
   * repaint, so a player who presses the key and a player who switches tabs
   * end up in one state rather than two.
   *
   * Omitted, nothing at all happens and the HUD never hears about the key:
   * the state of every harness in `tests/browser/` and of a page whose
   * `Worker` never started, because `src/main.ts` builds no build tool for one
   * either.
   */
  readonly toolStandDown?: HudToolStandDownSource;
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
   * The world's object gesture, routed into the HUD's own intent path (ADR
   * 0028).
   *
   * Supplied, the HUD attaches to it once at mount and turns each finished
   * press into a `place-object` intent of its own -- so a refused placement
   * reaches the refusal line by exactly the path a refused *Place order* press
   * does. Unlike `worldRooms` there is no pending state to hold: a placement is
   * committed on release, because it writes a construction order that `Undo`
   * can take back.
   *
   * Omitted, nothing at all happens and the HUD never hears about the world
   * pointer -- the state of every harness in `tests/browser/` and of a page
   * whose `Worker` never started.
   */
  readonly worldObjects?: HudWorldObjectSource;
  /**
   * Where a press on `.hud-minimap__surface` asks the camera to go (issue
   * #793; keyboard-reachable since #903): a point normalized to the surface's
   * own box, `0,0` at its top-left corner and `1,1` at its bottom-right. A
   * pointer press reads it off `getBoundingClientRect()`; a keyboard
   * activation (Enter/Space on the now-real `<button>`) has no such point and
   * names the surface's own centre, `0.5, 0.5`, instead -- see the `click`
   * listener's own comment in this module for why `event.detail` is what
   * distinguishes the two. The mapping from that point to a world position is
   * not this module's to make -- it belongs with the camera and the
   * loaded-world bounds, both of which are the renderer's (`AGENTS.md`
   * boundary 1; this file may not import `src/rendering/**`,
   * `tests/unit/ui-hud-messages.test.ts`) -- so this is a plain callback
   * rather than a port object like `worldBuild`/`worldRooms`/`worldObjects`:
   * there is no shared mutable state for a port to carry, only one gesture
   * translated into one call.
   *
   * Returns whether the camera actually moved. A press that lands while no
   * world has ever been loaded (before a session exists, or on a page whose
   * `Worker` never started) has nowhere to go, and `false` is how the HUD
   * finds that out and says so -- swapping `hud.minimap.placeholder` for
   * `hud.minimap.navigable` only once a press has actually landed somewhere,
   * rather than leaving the surface's one sentence claiming "not available"
   * forever once it demonstrably is. This is deliberately not on the gated
   * `dispatchCommand`/`dispatchShell` paths every other control here uses:
   * moving the camera never reaches the simulation, so there is nothing to
   * gate and nothing for a host to refuse.
   *
   * Omitted, the surface stays exactly as inert as it always was -- the
   * state of every harness in `tests/browser/` that does not pass it.
   */
  readonly onMinimapNavigate?: (point: { readonly fx: number; readonly fy: number }) => boolean;
  /**
   * One zoom step, in the direction the player pressed (issue #1023).
   *
   * A plain callback rather than a port object, on exactly the grounds
   * `onMinimapNavigate` above states: moving the camera is the renderer's, the
   * HUD may not import `src/rendering/**`, and there is no shared mutable
   * state for a port to carry -- one press, one call. In the running app the
   * composition root hands this to `WorldScene.stepCameraZoom`, which takes the
   * keyboard's own step through the keyboard's own code path, so a button and
   * a key are the same movement.
   *
   * Not on the gated `dispatchCommand`/`dispatchShell` paths every other
   * control here uses, and for the same reason a minimap click is not: zooming
   * never reaches the simulation (`AGENTS.md` boundary 1), so there is nothing
   * to gate and nothing for a host to refuse.
   *
   * **Returns nothing, deliberately, where `onMinimapNavigate` returns
   * whether it worked.** That boolean exists because the minimap has a
   * *sentence* to correct -- it says it is not available yet and has to stop
   * once it demonstrably is. Zoom has no such sentence: the two buttons name a
   * direction, and a press at the clamp changing nothing is what the keyboard
   * already does. Reporting it would only let the HUD invent a claim about the
   * bounds, which live in the renderer and are not the HUD's to state.
   *
   * Omitted, the buttons are laid out and do nothing at all -- the state of
   * every harness in `tests/browser/` that does not pass it.
   */
  readonly onCameraZoom?: (direction: 'in' | 'out') => void;
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
  /** Host-owned local save list on Manage; the HUD supplies only its tab-scoped box. */
  readonly manageSavesSlot: HTMLElement;
  /**
   * The status strip's left-hand chrome slot, passed straight through.
   *
   * `StatusStrip.brandSlot` documents the arrangement; this is the handle the
   * composition root reaches it by, exactly as `asideSlot` is for the rail. The
   * HUD supplies a box in its own layout and never looks inside it.
   */
  readonly brandSlot: HTMLElement;
  /**
   * The settings menu's own box for host-owned preference controls (#663).
   *
   * `HudLayoutShell.preferencesSlot` passed straight through, exactly as
   * `brandSlot` passes the strip's through. It is where a preference goes when
   * the rail cannot afford it: measured, `--hud-rail-panel-width` holds two
   * chrome controls and a second line costs 54px the aside does not have at
   * 900x600 or at 375x812.
   */
  readonly preferencesSlot: HTMLElement;
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
  /**
   * Tells the HUD that the prisoner the player selected is not in the prison
   * any more (issue #895).
   *
   * Deliberately not part of `HudViewModel`, for the reason `setBuildTarget`
   * above is not: the view model is snapshot-shaped, and this is an *event* --
   * the one reply `hud/prisoner-detail` gives for a released prisoner, which
   * `PrisonerDetailReader` answers as `'released'`. Folding it in would need a
   * field that means "the last thing I asked about is gone", which the next
   * snapshot would then have to carry or contradict.
   *
   * `HudViewModel.prisonerDetail` going absent is the *other* half and cannot
   * stand in for this one: it covers nothing-asked, a read in flight and a
   * failed read, none of which makes the player's choice false.
   */
  clearPrisonerSelection(): void;
  /**
   * The same event one section over: the worker says there is no such incident
   * (2026-09-17).
   *
   * Not part of `HudViewModel` for `clearPrisonerSelection`'s reason -- the
   * view model is snapshot-shaped and this is an *event*, the one reply
   * `hud/incident-detail` gives for an id it does not hold, which
   * `IncidentsReader.readDetail` answers as `'gone'`.
   *
   * `IncidentLog` never deletes a record, so this is reachable only for an id
   * that was never minted. It exists because the alternative is a panel that
   * would paint nothing and say nothing if it ever were.
   */
  clearIncidentSelection(): void;
  getState(): HudShellState;
  /** The layout the shell currently holds, which is what a host persists (#1159). */
  getLayout(): LayoutSettings;
  /**
   * Re-resolves the layout against the viewport and the interface scale.
   *
   * The shell watches the window's own `resize` and needs no help with it.
   * What it cannot hear is `--ui-scale` changing: the composition root writes
   * that custom property onto `document.documentElement`, which fires no event
   * and resizes nothing -- and every panel limit is multiplied by it
   * (`src/ui/hud/hud-layout.ts`). So the one caller that changes the scale
   * says so, on the line that changes it.
   */
  refreshLayout(): void;
  /**
   * Applies a layout programmatically -- a preference restored after mount, or
   * a test. Repaints; does **not** report back through `onLayoutChange`, so a
   * host writing a value it just read cannot loop.
   */
  setLayout(settings: LayoutSettings): void;
  /** Applies a shell action programmatically -- restoring a saved UI state, or a test. */
  dispatch(action: HudShellAction): void;
  destroy(): void;
}

/**
 * The one place this module reads a wall clock, and the only one it may.
 *
 * `performance.now()` rather than `Date.now()`: it is monotonic, so a system
 * clock adjusted mid-session cannot make an event band floor look already
 * lapsed or never lapsing. It is read here, on the main thread, for a purely
 * presentational comparison in `event-band-dwell.ts` -- which takes the reading
 * as an argument precisely so that nothing about the floor depends on being
 * able to read a clock. Nothing in `src/simulation/**` can reach this function,
 * and `tests/determinism/ambient-nondeterminism-contract.test.ts` is the gate
 * that keeps it that way.
 */
function hudNowMs(): number {
  return performance.now();
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
   * **Both bullets above are past tense as of 2026-08-31 (#703, rulings 1 and
   * 5).** `INITIAL_HUD_SHELL_STATE.collapsedPanels` is now empty and the
   * `@media (max-width: 720px)` block no longer hides `.hud__corner`, so the
   * alerts list is laid out with `offsetParent` non-null at 1920, 1440, 1280,
   * 900, 768, 721, 720, 600 and 375 CSS px -- measured on the real application
   * at all nine.
   *
   * **THE `.hud__corner` HALF OF THAT SENTENCE IS FALSE AS OF 2026-09-05, AND
   * IT IS KEPT RATHER THAN CORRECTED IN PLACE BECAUSE IT IS THE STATE THIS
   * FILE ASSERTED IN THREE SEPARATE COMMENTS FOR FIVE DAYS.** `hud.css`'s
   * `@media (max-width: 720px)` block *does* hide `.hud__corner`: the removal
   * these lines record was attempted and reverted, and that file now carries
   * the diagnosis the attempt produced -- the corner collides with the
   * **stretched rail**, not with the tab bar -- and defers the fix to a mobile
   * layout pass under the owner's steer that the desktop browser comes first.
   * Re-measured on the assembled page at 375x812 while the zoom control was
   * being added beside this corner (#1023): `.hud__corner` has a 0x0 box with
   * `offsetParent === null`. So on a phone the alerts list is still not laid
   * out at all, and this band is the only route the sentence has -- which is a
   * stronger argument for the band than the one below it, not a weaker one.
   * The `collapsedPanels` half is unchanged and still true.
   *
   * The bullets are kept because they are the record of why this
   * band exists, and **the band is not withdrawn**: a band shows one message
   * and replaces it, a list keeps several and scrolls back, and what the
   * escape sentence measured on 2026-08-31 is that the *band alone* loses a
   * message to whatever shares its tick. See `INITIAL_HUD_SHELL_STATE` for the
   * full account and the citation list.
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
   * Where a refused command is reported to the player (issues #207, #220).
   *
   * A live region of the HUD's own, in a grid row directly under the status
   * strip, `hidden` while there is nothing to say. Two properties earned it
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
   *
   * **Both bullets above are past tense as of 2026-08-31 (#703, rulings 1 and
   * 5).** `INITIAL_HUD_SHELL_STATE.collapsedPanels` is now empty and the
   * `@media (max-width: 720px)` block no longer hides `.hud__corner`, so the
   * alerts list is laid out with `offsetParent` non-null at 1920, 1440, 1280,
   * 900, 768, 721, 720, 600 and 375 CSS px -- measured on the real application
   * at all nine.
   *
   * **THE `.hud__corner` HALF OF THAT SENTENCE IS FALSE AS OF 2026-09-05, AND
   * IT IS KEPT RATHER THAN CORRECTED IN PLACE BECAUSE IT IS THE STATE THIS
   * FILE ASSERTED IN THREE SEPARATE COMMENTS FOR FIVE DAYS.** `hud.css`'s
   * `@media (max-width: 720px)` block *does* hide `.hud__corner`: the removal
   * these lines record was attempted and reverted, and that file now carries
   * the diagnosis the attempt produced -- the corner collides with the
   * **stretched rail**, not with the tab bar -- and defers the fix to a mobile
   * layout pass under the owner's steer that the desktop browser comes first.
   * Re-measured on the assembled page at 375x812 while the zoom control was
   * being added beside this corner (#1023): `.hud__corner` has a 0x0 box with
   * `offsetParent === null`. So on a phone the alerts list is still not laid
   * out at all, and this band is the only route the sentence has -- which is a
   * stronger argument for the band than the one below it, not a weaker one.
   * The `collapsedPanels` half is unchanged and still true.
   *
   * The bullets are kept because they are the record of why this
   * band exists, and **the band is not withdrawn**: a band shows one message
   * and replaces it, a list keeps several and scrolls back, and what the
   * escape sentence measured on 2026-08-31 is that the *band alone* loses a
   * message to whatever shares its tick. See `INITIAL_HUD_SHELL_STATE` for the
   * full account and the citation list.
   *
   * ## Two producers, because a refusal is a refusal
   *
   * This band used to carry only the refusals *this thread* decided -- a
   * command the host threw on before it was sent -- and #207 gave a third
   * reason for that: "it is not simulation state", so folding the HUD's own
   * interaction into `HudViewModel` would mean the HUD writing into the data
   * it is a view over. That reason is still true and is still why nothing
   * writes back; what it never justified was the converse. A refusal the
   * *worker* decided after accepting a command is data the host publishes,
   * reading it here is a view over a snapshot in the ordinary direction, and
   * it went to the alerts list -- so the two properties above applied to it
   * unchanged and it was on screen at no viewport.
   *
   * #220 fixed that for exactly one sentence ("this page has no simulation")
   * by giving it a band; #207 had fixed it for exactly one class of refusal.
   * Fixed per message, the hole re-opens with every new command route, and it
   * did: eight routes now record to the session's `RefusalLog`
   * (`src/simulation/runtime/session-commands.ts`), the newest being ADR 0028
   * phase 3's object removal, and every one of them arrived folded and
   * invisible. So the band takes the whole *class*: whatever refused a player
   * command, host or simulation, says so here.
   *
   * **The alerts list keeps its job** and is not emptied -- it is the log. It
   * still holds the refusal row under its ordinal, *beside* the standing
   * `protocol/error` rows nothing else on this thread reads, which this band
   * deliberately does not take: a protocol fault is not a refusal of a
   * player's command, several can stand at once, and one line cannot hold
   * them. `src/ui/simulation-alerts.ts` states the split.
   *
   * ## One line, so one sentence, and the newest is the one
   *
   * The rule is the one this band already had -- "a second refusal of a
   * different command replaces the first" -- applied across one more
   * producer rather than a new rule: **the most recently decided refusal is
   * the one on the line**, and taking the line unmarks whatever control the
   * previous occupant had, because `aria-describedby` must not point at a
   * sentence about something else. Nothing is stacked and nothing is
   * restored: when a host refusal clears because that action later succeeded,
   * an older simulation refusal does not come back, exactly as an older host
   * refusal has never come back. It is still in the log.
   *
   * This is deliberately *not* a second use of `.hud__unavailable`, and the
   * reason that band is separate survives untouched: a refusal stops being
   * true -- when the same action succeeds, when a newer refusal replaces it,
   * when the session ends -- while "this browser cannot start a worker"
   * cannot stop being true while the page is loaded. Sharing one band would
   * need a rule about which sentence wins; two bands need none.
   *
   * It does **not** auto-dismiss. A message that clears itself on a timer is
   * a race against how fast the player reads, and there is no press to
   * acknowledge it -- so a host refusal stays until the same action later
   * succeeds, and a simulation refusal until another replaces it or the
   * session ends, which are the first moments each sentence stops being true.
   *
   * **The last clause was the whole of the rule until 2026-09-16 and is now
   * one of three, and it is kept rather than rewritten because it is the rule
   * that moved.** ADR 0091 decision 2 added a fourth moment and the owner
   * ruled it: a **decided outcome of the same command route**. A
   * `remove-wall.nothing-to-remove` refusal is retired by the player's next
   * removal, whatever tile it names; it is left alone by a wall drag, a hire
   * or an admission. That is not the timer this paragraph declines -- nothing
   * here runs on a clock, and a player who refuses a press and then does
   * something unrelated still reads the sentence. See
   * `applySimulationRefusal` for the measurement that separates "same route"
   * from "any route", and `SimulationRefusal.routeDecidedSince` for where the
   * comparison is made, which is in the simulation and not here.
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
   * Where the prison says what it just did (issue #507).
   *
   * A fourth grid row, immediately under the refusal line and above the
   * middle, `hidden` -- and therefore costing exactly zero -- until this
   * session has had something to say. The same shape the two bands above it
   * take, and it is here rather than in the alerts list for the first two of
   * the three reasons `.hud__refusal` gives:
   *
   *   - **It is there at every viewport.** `hud.css` drops `.hud__corner`
   *     entirely at 720px and below, so an event routed only to the alerts
   *     list would not exist on a phone.
   *   - **It is there without being opened.** The alerts section starts folded
   *     (`INITIAL_HUD_SHELL_STATE`), so a row appended to that list is a 0x0
   *     box at every viewport until somebody opens it.
   *
   * **Both bullets above are past tense as of 2026-08-31 (#703, rulings 1 and
   * 5).** `INITIAL_HUD_SHELL_STATE.collapsedPanels` is now empty and the
   * `@media (max-width: 720px)` block no longer hides `.hud__corner`, so the
   * alerts list is laid out with `offsetParent` non-null at 1920, 1440, 1280,
   * 900, 768, 721, 720, 600 and 375 CSS px -- measured on the real application
   * at all nine.
   *
   * **THE `.hud__corner` HALF OF THAT SENTENCE IS FALSE AS OF 2026-09-05, AND
   * IT IS KEPT RATHER THAN CORRECTED IN PLACE BECAUSE IT IS THE STATE THIS
   * FILE ASSERTED IN THREE SEPARATE COMMENTS FOR FIVE DAYS.** `hud.css`'s
   * `@media (max-width: 720px)` block *does* hide `.hud__corner`: the removal
   * these lines record was attempted and reverted, and that file now carries
   * the diagnosis the attempt produced -- the corner collides with the
   * **stretched rail**, not with the tab bar -- and defers the fix to a mobile
   * layout pass under the owner's steer that the desktop browser comes first.
   * Re-measured on the assembled page at 375x812 while the zoom control was
   * being added beside this corner (#1023): `.hud__corner` has a 0x0 box with
   * `offsetParent === null`. So on a phone the alerts list is still not laid
   * out at all, and this band is the only route the sentence has -- which is a
   * stronger argument for the band than the one below it, not a weaker one.
   * The `collapsedPanels` half is unchanged and still true.
   *
   * The bullets are kept because they are the record of why this
   * band exists, and **the band is not withdrawn**: a band shows one message
   * and replaces it, a list keeps several and scrolls back, and what the
   * escape sentence measured on 2026-08-31 is that the *band alone* loses a
   * message to whatever shares its tick. See `INITIAL_HUD_SHELL_STATE` for the
   * full account and the citation list.
   *
   * Those two properties are why #207 gave refusals a band and #220 gave "no
   * simulation" a second one, and an `'info'` producer that only reached the
   * folded list would have repeated that defect a third time -- while
   * *appearing* to have fixed the silent sentence-end, which is worse than
   * leaving it silent.
   *
   * The third reason those two bands are separate applies here too and is why
   * this is a third row rather than a reuse: a refusal is a fact about a
   * control the player just used and clears when that action succeeds, and
   * "this browser cannot start a worker" cannot stop being true while the page
   * is loaded. An event is neither -- it belongs to no control, and it never
   * stops being true. Three lifetimes, three bands, and no rule about which
   * sentence wins is needed because no two of them ever compete for a line.
   *
   * **It carries a severity**, which neither band above it does: they are
   * fixed red because everything they can say is bad, and this one says both
   * "somebody went home" and "payday went unpaid". `hud.css` tones it on a
   * `data-severity` attribute rather than by swapping class names, so the
   * band's identity in the DOM does not change under a player mid-sentence.
   *
   * It did **not** auto-dismiss, for the reason the refusal band does not: a
   * message that clears itself on a timer is a race against how fast the
   * player reads. It was replaced by the next event or emptied when the session
   * ends, and it is in the log either way.
   *
   * **That paragraph is past tense as of 2026-09-05 (#985), and it is left
   * standing rather than rewritten because it is the decision that was
   * reversed** (`docs/AGENT_WORKFLOW.md` section 4). Its last clause is why it
   * could be: the sentence *is* in the log, and since ADR 0084's decisions 1 to
   * 3 that log counts repeats, dates them and survives a reload. What the band
   * does not say, and never said, is anything about the row it occupies -- and
   * that row is `grid-area: event` on `.hud`, so a band held for the session
   * costs the rail 32px and the panel in `.hud__side` 24px of it for the
   * session too, measured on the assembled page at 900x600. So the band now
   * lets go after `EVENT_BAND_HOLD_CEILING_MS`, which is derived from the
   * longest sentence it can carry rather than chosen; that constant's docblock
   * carries the measurement, the derivation and what the change costs a player
   * on a phone.
   *
   * The reversal itself is a ruling rather than an implementation choice, and
   * it is recorded where rulings are: **"Amendment, 2026-09-05: the band lets
   * go of its grid row"** in
   * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md).
   * That amendment also records the owner's separate ruling on the phone cost
   * -- it stands, and the deferred mobile layout pass is its repair.
   */
  const eventText = element('span', { className: 'hud-event__text' });
  const eventNotice = element('div', {
    className: 'hud__event',
    // `role="status"` with `aria-live="polite"`, matching the two bands above.
    // Polite rather than assertive even for the `'warning'` member: an unpaid
    // payday is not worth interrupting whatever a screen reader is in the
    // middle of, and ADR 0049 settled that insolvency is a recoverable state
    // rather than an emergency.
    attributes: { role: 'status', 'aria-live': 'polite' },
    children: [eventText],
  });
  eventNotice.hidden = true;

  /**
   * The band's dwell floor, held here and nowhere else.
   *
   * Presentational state about one DOM element, on the main thread, in the
   * module that owns that element. It is never published, never captured and
   * never read by anything that ticks -- see `EventBandDwellState` for why that
   * is a determinism requirement rather than a preference.
   */
  let eventBandDwell: EventBandDwellState = EMPTY_EVENT_BAND_DWELL_STATE;
  let eventBandFloorTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * The newest event is the one on the line, **unless the line is still owed to
   * the last one** (the owner's ruling of 2026-09-01 on
   * [ADR 0084](../../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)
   * decision 4).
   *
   * This read *"No arbitration and no source tracking, unlike
   * `applySimulationRefusal` below: this band has exactly one producer, so
   * whatever it replaces is always an older event rather than a sentence of
   * another class."* Both halves are still true of the *producer* and neither
   * is any longer true of the *band*. One producer was enough while the only
   * thing a sentence could lose to was a later one, and issue #700 is the case
   * where it is not: `SimulationEventLog.recordIncidentsAllClear` and the escape it
   * closes were written on one tick, `publishEvents` posted them back to back
   * in one task, and the escape sentence reached zero animation frames across
   * three escapes in 21.8 minutes of play.
   *
   * So the band now has exactly one rule more than it had, and it is the
   * ordering the alerts list's cap already runs -- `SEVERITY_EVICTION_ORDER`,
   * one constant, read by both. `src/ui/hud/event-band-dwell.ts` holds the
   * decision and the arithmetic behind the floor; this function is the paint
   * and the timer, which is all a DOM module should own.
   *
   *
   * **The channel widened again on the same day, from the other side.** The
   * sentence quoted above also said this band has *"exactly one producer, so
   * whatever it replaces is always an older event rather than a sentence of
   * another class"*, and issue #749 falsified that second half independently
   * of #700: the owner's ruling of 2026-09-01 puts four **success** sentences
   * here -- a cancelled build order, a cancelled delivery, an undo, a redo --
   * so the band now carries two classes, what the prison did on its own and
   * what it did because the player asked. Both directions are marked rather
   * than one overwritten (`docs/AGENT_WORKFLOW.md` section 4).
   *
   * **The cost that widening carried is now bounded rather than open.** A
   * success sentence can displace a simulation event the player has not read
   * -- press Undo while "A riot has broken out" is on the line. When #749 was
   * written, ADR 0084 decision 4 was the one of that ADR's four the owner had
   * not taken, so this producer could only record the collision and leave it.
   * The owner took it on 2026-09-01 and the floor above is the answer: an undo
   * no longer takes the line from a `danger` sentence inside the floor,
   * because the ordering is `SEVERITY_EVICTION_ORDER` for every producer
   * alike.
   * `undefined` means the view model says nothing yet; the field is absent
   * until the session has had something to say and again once it has ended.
   */
  function applyEventNotice(notice: HudEventNoticeViewModel | undefined): void {
    applyEventBandDecision(admitToEventBand(eventBandDwell, notice, hudNowMs()));
  }

  /**
   * Paints what the decision chose, and arms the one timer the floor needs.
   *
   * The timer exists because a sentence that waits has to arrive on its own:
   * nothing else is guaranteed to publish inside the next 600 ms, so without it
   * a held all-clear would sit in `EventBandDwellState.waiting` until the next
   * event of any kind -- which is the defect running the other way round.
   *
   * **It now serves a second deadline as well, and deliberately stays one
   * timer**: the hold ceiling that gives the grid row back (#985). Which of the
   * two a firing is for is `advanceEventBand`'s decision and not this
   * function's -- the same division this module already keeps, where
   * `event-band-dwell.ts` holds the arithmetic and this holds the paint.
   *
   * Re-armed rather than left running, because every decision carries the wake
   * it needs from the state it produced, and a stale timer would release a
   * sentence the band has since moved past. That re-arming is also what makes
   * the ceiling survive a busy channel: the counts publication rebuilds the view
   * model up to twice a second, each rebuild repaints the same sentence through
   * `admitToEventBand`'s ordinal guard, and each repaint asks for what is *left*
   * of the hold rather than restarting it, because `shownAt` does not move.
   */
  function applyEventBandDecision(decision: EventBandDwellDecision): void {
    eventBandDwell = decision.state;
    paintEventNotice(decision.paint);
    if (eventBandFloorTimer !== undefined) {
      clearTimeout(eventBandFloorTimer);
      eventBandFloorTimer = undefined;
    }
    if (decision.wakeInMs === undefined) return;
    eventBandFloorTimer = setTimeout(() => {
      eventBandFloorTimer = undefined;
      applyEventBandDecision(advanceEventBand(eventBandDwell, hudNowMs()));
    }, decision.wakeInMs);
  }

  /** The write itself, unchanged: this is the function `applyEventNotice` was before the floor. */
  function paintEventNotice(notice: HudEventNoticeViewModel | undefined): void {
    eventNotice.hidden = notice === undefined;
    // `renderHudLabel` rather than `t(...)`: the band's sentence may inflect
    // (`hud.alert.event.incidents.riot-opened`), and `t` is `format`, which
    // reads a plural entry's `other` and stops.
    eventText.textContent = notice === undefined ? '' : renderHudLabel(localizer, notice);
    if (notice === undefined) delete eventNotice.dataset['severity'];
    else eventNotice.dataset['severity'] = notice.severity;
  }

  /**
   * The control that last asked for each command kind, so a report lands *on
   * the control that was pressed* rather than merely somewhere on screen.
   *
   * `AsyncActionFailure.actionId` is the intent kind and the gate is
   * single-slot, so one entry per kind is enough to name the button.
   *
   * This paragraph used to end "The controls registered here carry no
   * `aria-describedby` of their own; one that gained one would need this to
   * merge rather than replace." Both halves have since changed. One of them
   * *did* gain one -- the Rooms panel's Confirm button is described by the
   * note beside it (`rooms-panel.ts`, `noteId`), because a keyboard-only
   * playtest found a player reaching a disabled Confirm and being told
   * "disabled" and nothing else -- and `markControl` below now merges, so the
   * prediction is satisfied rather than outstanding. It merges for every
   * control, not only that one: the next panel to describe a control of its
   * own needs nothing here.
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
   * `refusalSource` says which producer the standing sentence came from, and
   * it is what keeps the two clearing rules from reaching each other: a host
   * command that later succeeds must not clear a simulation refusal it knows
   * nothing about, and a session that has refused nothing must not clear a
   * host refusal decided a moment ago on this thread.
   *
   * `refusedAction` is the command kind behind a *host* refusal and is set
   * only while `refusalSource` is `'host'` -- a simulation refusal names no
   * control, because the command it answers was accepted and may have been
   * decided many ticks after the press.
   *
   * `simulationRefusalSequence` is the ordinal of the simulation refusal last
   * taken from the view model. The counts channel republishes an unchanged
   * refusal beside a changed count up to twice a second, so without it every
   * republication would steal the line back from a host refusal the player
   * caused since.
   *
   * `retiredSimulationRefusalSequence` is the ordinal of the simulation
   * refusal this band has **let go of**, and it exists because one of the two
   * retirement rules is not monotone. `routeDecidedSince` is a fact about the
   * record and can only turn on; `outlivedBandTicks` is a comparison against a
   * threshold that **scales with the running speed** (the owner's ruling of
   * 2026-09-20), so a player who slows down under a standing refusal moves the
   * threshold out from under it and the flag goes off again. Without this the
   * corner would raise a sentence it had already retired -- and #777's fix
   * makes that certain rather than merely possible, since an unchanged ordinal
   * takes the line again once `refusalSource` is `undefined`.
   *
   * It is the same job `EventBandDwellState.retired` does one band over, and
   * it is safe across a session boundary for the same reason that one is:
   * `simulation/stopped` arrives as no notice at all and empties this first,
   * so a new session's ordinal 1 cannot be mistaken for an old session's.
   */
  let refusalSource: 'host' | 'simulation' | undefined;
  let refusedAction: string | undefined;
  let simulationRefusalSequence: number | undefined;
  let retiredSimulationRefusalSequence: number | undefined;

  const markControl = (actionId: string, refused: boolean): void => {
    const control = commandControls.get(actionId);
    if (control === undefined) return;
    if (refused) {
      control.dataset['actionFailed'] = 'true';
      describeBy(control, refusalId);
      return;
    }
    delete control.dataset['actionFailed'];
    undescribeBy(control, refusalId);
  };

  /**
   * Hands the line to `source`, leaving nothing of the previous occupant
   * behind.
   *
   * The unmarking is the whole of it: a control still carrying
   * `aria-describedby` would point a screen reader at a sentence that is now
   * about something else, which is worse than pointing at nothing.
   */
  const takeRefusalLine = (source: 'host' | 'simulation'): void => {
    if (refusedAction !== undefined) markControl(refusedAction, false);
    refusedAction = undefined;
    refusalSource = source;
    refusal.dataset['source'] = source;
  };

  /** Empties the line, whichever producer was holding it. */
  const clearRefusalLine = (): void => {
    if (refusedAction !== undefined) markControl(refusedAction, false);
    refusedAction = undefined;
    refusalSource = undefined;
    refusalText.textContent = '';
    delete refusal.dataset['action'];
    delete refusal.dataset['source'];
    refusal.hidden = true;
  };

  /**
   * Reports a failure to the player, then hands it to the host.
   *
   * In that order deliberately: a host handler that throws must not be able
   * to swallow the player's half of the report.
   */
  const reportError = (failure: AsyncActionFailure): void => {
    // The reason, when the thrown value named one -- the owner's ruling 18 of
    // 2026-08-31. `hostRefusalReason` answers `undefined` for every value that
    // did not, which is every refusal this line has ever handled, so the
    // sentence a control read before the ruling is what it goes on reading.
    const messageKey = refusalMessageKey(failure.actionId, hostRefusalReason(failure.error));
    // `undefined` is a chrome intent, which has already been applied locally
    // -- see `refusalMessageKey`. Nothing is shown, and the host still hears.
    if (messageKey !== undefined) {
      takeRefusalLine('host');
      refusedAction = failure.actionId;
      refusalText.textContent = t(messageKey);
      refusal.dataset['action'] = failure.actionId;
      refusal.hidden = false;
      markControl(failure.actionId, true);
    }
    options.onError?.(failure);
  };

  /**
   * The refusal stops being true the moment the same action succeeds.
   *
   * Scoped to a *host* refusal of that exact action. A successful build order
   * says nothing about a refusal the simulation decided -- that command was
   * accepted too, and was refused on its content several ticks later -- so a
   * later success may not clear it. What clears a simulation refusal is
   * another one, the session ending, or -- since ADR 0091 decision 2 was
   * ruled on 2026-09-16 -- a decided outcome of the *same simulation route*,
   * which the simulation reports on the record and this thread never infers;
   * see `applySimulationRefusal`.
   */
  const clearRefusal = (actionId: string): void => {
    if (refusalSource !== 'host' || refusedAction !== actionId) return;
    clearRefusalLine();
  };

  /**
   * Puts what the *simulation* last refused on the same line (issue #220,
   * made structural).
   *
   * Called from `update`, so it runs at mount and on every published
   * snapshot. Three cases, and the ordinal is what separates the middle one:
   *
   *   - **No refusal** -- the session has refused nothing, or has ended and
   *     the translator returned `'none'`. The line is cleared only if the
   *     simulation is what is on it; a host refusal decided on this thread is
   *     not the session's to withdraw.
   *   - **The same refusal again, and the line is already showing it.** The
   *     counts channel is a snapshot on a cadence, so an unchanged refusal is
   *     republished beside a changed count. Nothing happens -- in particular
   *     the line is *not* taken back from a *live* host refusal the player
   *     has caused since, which is the whole reason `RefusalLog` carries an
   *     ordinal.
   *   - **A new one, or the same one with nowhere currently showing it.** A
   *     fresh ordinal always takes the line, exactly as before. **Issue
   *     #777's fix is the second half of this case**: an unchanged ordinal
   *     *also* takes the line once `refusalSource` is `undefined` -- the band
   *     is empty because a host refusal that was occupying it has since
   *     cleared (`clearRefusal`, on that host action's own later success).
   *     Before this fix the guard above matched on ordinal alone, so a
   *     still-standing simulation refusal the band had already shown once
   *     stayed permanently evicted: nothing ever republishes a *new* ordinal
   *     for a fact that has not changed, and the old guard read "already
   *     shown" as "nothing to do" even when the line had since been handed to
   *     a host refusal and then emptied under it. The alerts list never had
   *     this bug -- it is rebuilt from `next.refusal` on every publication
   *     with no memory of what it last painted -- so the two surfaces
   *     disagreed about the identical fact until this. See
   *     `docs/adr/0091-what-clears-the-refusal-band.md`.
   *
   * ## The band retires on a decided outcome of the same route (ADR 0091
   * decision 2, option F, ruled by the owner 2026-09-16)
   *
   * The first case above has a second door into it, and the whole of option F
   * is that door: a notice carrying `routeDecidedSince` is treated exactly as
   * no notice at all. The player refused a wall removal and has since removed
   * a wall somewhere else; refused a rectangle and has since zoned another.
   * The sentence in the corner is still *true* -- #492's rule, untouched, and
   * the reason the simulation has not withdrawn the record -- but it is no
   * longer about anything the player is looking at, and the corner names no
   * location, so a player reading it beside the thing they just did has no way
   * to tell the two apart. ADR 0091's own measurement of that is a screen
   * contradicting itself about one press: the event band reading "The order
   * was cancelled" while this line still read "Nothing was removed".
   *
   * **Same route, not any route.** Option D -- any decided outcome retires it
   * -- was measured at a band lifetime of 2 ms, because the eight commands of
   * one wall drag are submitted 2 ms apart, against the 600 ms floor
   * `EVENT_BAND_DWELL_FLOOR_MS` records as the minimum an event needs to be
   * readable. That is the timer the paragraph in `mountHud`'s refusal element
   * declines to have, with the player's hand as the clock. Under F an
   * unrelated gesture leaves the sentence alone, which is when it is most
   * likely to be read.
   *
   * **The list does not do this.** `hudAlertsFromWorkerMessage` never reads
   * the flag, so the refusal keeps its row. The band and the list therefore
   * disagree here on purpose, which is the split
   * `src/ui/simulation-alerts.ts` has described in prose since #507 without
   * anything making it true.
   *
   * **Nothing is restored.** `simulationRefusalSequence` is cleared with the
   * line, exactly as it is when the worker withdraws a refusal outright, so
   * the next *new* ordinal takes the band normally. The flag is monotone per
   * record -- a route cannot un-decide -- so a retired sentence never comes
   * back on a later republication of the same refusal.
   *
   * ## The band also retires when nothing happens at all (the owner's ruling
   * of 2026-09-20, amending ADR 0091 and ADR 0084 section 6)
   *
   * Option F above answers *"the player has moved on"*. It does not answer
   * *"the player has done nothing at all since"*, and until this that case had
   * no answer: ADR 0084's amendment section 6 says in terms that
   * `EVENT_BAND_HOLD_CEILING_MS` does **not** reach this band, so a refusal in
   * a quiet prison held the corner -- and the grid row under it -- for the
   * rest of the session. Measured on the assembled application at 900x600,
   * that row costs `.hud__rail` 35px.
   *
   * The owner ruled that it should retire, **counted in simulation ticks**
   * rather than on the wall clock, and `HudRefusalNoticeViewModel`'s
   * `outlivedBandTicks` is that answer arriving. It is a third door into this
   * same branch, for the reason the second one is a door into it: a notice the
   * band is not to keep is treated exactly as no notice at all, so there is
   * one retirement path rather than three.
   *
   * ~~**The `retired`-ordinal suppression the events band needs is not needed
   * here** ... `outlivedBandTicks` is monotone in the simulation's own clock,
   * so every later publication carrying the same refusal carries the flag
   * too.~~
   *
   * **THAT WAS TRUE OF THE UNSCALED CEILING AND IS FALSE OF THIS ONE.** It is
   * struck through rather than deleted because the reasoning is exactly right
   * about *why* a band needs such a memory, and the thing that changed is the
   * premise rather than the argument. When the owner ruled on 2026-09-20 that
   * the threshold **scales with the running speed**, `outlivedBandTicks`
   * stopped being monotone: the ticks still only advance, but the budget they
   * are measured against is four times larger at x4 than at x1, so a player
   * who slows down under a standing refusal un-marks it. A band with no memory
   * would then put the sentence back -- and #777's fix guarantees it would,
   * because an unchanged ordinal takes the line again once `refusalSource` is
   * `undefined`.
   *
   * So this band now carries `retiredSimulationRefusalSequence`, which is the
   * same job `EventBandDwellState.retired` does one band over for a different
   * reason. **The predicate moves both ways; the retirement moves one way**,
   * which is the property a player would name: a sentence the corner has let
   * go of does not come back because they pressed fast-forward or stepped back
   * down from it.
   *
   * **Nothing is restored**, on option F's own terms: the sequence is cleared
   * with the line, so a genuinely new refusal takes the band normally. This is
   * a lifetime, not a mute.
   */
  const applySimulationRefusal = (notice: HudRefusalNoticeViewModel | undefined): void => {
    if (notice === undefined) {
      // The worker withdrew the refusal outright, or the session ended. The
      // memory goes with it: a withdrawn ordinal can never be republished, and
      // a session that has ended is what makes the next session's ordinal 1
      // safe to show.
      simulationRefusalSequence = undefined;
      retiredSimulationRefusalSequence = undefined;
      if (refusalSource === 'simulation') clearRefusalLine();
      return;
    }
    if (
      notice.routeDecidedSince === true ||
      notice.outlivedBandTicks === true ||
      notice.sequence === retiredSimulationRefusalSequence
    ) {
      simulationRefusalSequence = undefined;
      retiredSimulationRefusalSequence = notice.sequence;
      if (refusalSource === 'simulation') clearRefusalLine();
      return;
    }
    if (notice.sequence === simulationRefusalSequence && refusalSource !== undefined) return;
    simulationRefusalSequence = notice.sequence;
    takeRefusalLine('simulation');
    refusalText.textContent = t(notice.labelKey);
    // No `data-action`: the command was accepted, and the control that sent
    // it -- if there even was one, rather than a drag on the world -- is not
    // what this sentence is about.
    delete refusal.dataset['action'];
    refusal.hidden = false;
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
    /*
     * The pointer and touch route to Undo and Redo (#1356), through the gate
     * the keys already use. The control *is* passed here, unlike the key's
     * dispatch below: the player pressed a button in the HUD, so a refusal
     * the host raises is marked on that button, exactly as a refused
     * transport press is. Literal kinds rather than a direction, so
     * `tests/foundation/command-control-reachability-contract.test.ts` can
     * follow each intent to its `<button>`.
     */
    onUndo: () => {
      dispatchCommand({ kind: 'undo' }, strip.historyControlFor('undo'));
    },
    onRedo: () => {
      dispatchCommand({ kind: 'redo' }, strip.historyControlFor('redo'));
    },
  });

  // ---- bottom-left minimap frame -----------------------------------
  // Rendering is still a placeholder, honestly labelled in visible text --
  // minimap *rendering* belongs to the renderer, not to the HUD, and does
  // not exist yet. Navigation is not (issue #793): the surface itself is a
  // real click target, and every point on it maps to a world position
  // through `onMinimapNavigate` (`WorldScene.navigateToMinimapPoint` owns the
  // mapping -- see its own comment for what the surface represents and why).
  //
  // **A real `<button>`, not a `div`, since issue #903.** It used to be a
  // `div` with no `role` and no way into the keyboard's focus order at all --
  // `tabIndex` reads `-1` by default on an element nobody opted in -- so a
  // keyboard player could never fire the swap below and only ever read
  // `minimapPlaceholder`'s denial, against `AGENTS.md` boundary 10 (input
  // must support touch/pointer *and* remapping/keyboard). A real `<button>`
  // gives the correct role and a correct accessible name for free rather than
  // reinventing either with ARIA: it is in the tab order by default, its
  // accessible name is computed from its own text content -- exactly the
  // sentence a sighted player reads, kept as the one source of truth instead
  // of a second, divergent `aria-label` -- and, load-bearing for the handler
  // below, it dispatches a `click` event for an Enter/Space activation just
  // as it does for a pointer click, so the one listener already here needed
  // no second, keyboard-only code path. `hud.css` resets the button chrome a
  // `<button>` would otherwise add; see its comment on `.hud-minimap__surface`
  // for what that costs and why each reset is there.
  const minimapPlaceholder = eyebrowText(t(HUD_MESSAGE_KEY.minimapPlaceholder), 'hud-minimap__placeholder');
  const minimapSurface = element('button', {
    className: 'hud-minimap__surface',
    attributes: { type: 'button' },
    children: [minimapPlaceholder],
  });
  minimapSurface.addEventListener('click', (event: MouseEvent) => {
    const rect = minimapSurface.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    /*
     * `event.detail` is the DOM's own count of the click -- 1 for an
     * ordinary click, 2/3 for a double/triple click, and **0 for a `click`
     * a `<button>` dispatches from a non-pointer activation** (Enter, Space,
     * or an assistive technology's virtual "activate"), because nothing was
     * actually clicked to be counted. That is the one reliable way to tell a
     * keyboard press from a pointer click on this event, rather than reading
     * `clientX`/`clientY`: browsers are not required to place those at any
     * particular point for a synthetic activation, so trusting them here
     * would make the keyboard path's target point an implementation detail
     * of whichever engine is running rather than a decision this file makes.
     * A keyboard press names the surface's own centre (`0.5, 0.5`) --
     * consistent with `frameCameraOnFirstWorld`'s own choice of the loaded
     * bounds' midpoint (`world-scene.ts`) for "no particular point given" --
     * rather than any point a mouse could have chosen.
     */
    const point =
      event.detail === 0
        ? { fx: 0.5, fy: 0.5 }
        : { fx: (event.clientX - rect.left) / rect.width, fy: (event.clientY - rect.top) / rect.height };
    const navigated = options.onMinimapNavigate?.(point) ?? false;
    // Only ever moves *toward* "navigable" -- a press that fails today still
    // leaves the accurate `minimapPlaceholder` sentence standing, and a
    // session's loaded world never disappears once one exists (see the
    // message key's own comment), so this never has to move back.
    if (navigated) minimapPlaceholder.textContent = t(HUD_MESSAGE_KEY.minimapNavigable);
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
  /*
   * The sentinel sentence for "no prison is reporting" (issue #1184), and it is
   * a sibling of the list rather than a row in it -- `paintAlerts` states why,
   * and `overview-panel.ts` made the same call for the same reason one panel
   * over. Built here, painted there: `paintAlerts` runs on the first `update`
   * and is the only thing that ever sets either element's `hidden`.
   */
  const alertsNone = eyebrowText(t(HUD_MESSAGE_KEY.alertsUnknown), 'hud-alerts__none');
  alertsSection.body.append(alertList, alertsNone);

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

  /**
   * Puts the alerts fold where the current tier can show it (issue #1201).
   *
   * Above 720 px it is the last thing in the minimap panel, where it has been
   * since the corner was built; at 720 px and below it is the last thing in
   * the Overview panel, which is the rail slot the owner's ruling names. The
   * element is the same in both, so this is a move and never a copy -- see the
   * `onTierChange` handler's own block below for what that buys.
   *
   * Passed to `createHudLayoutShell` as `onTierChange`, which calls it once
   * during construction with the tier it resolved, so there is no separate
   * initial placement to keep in step with this one. It therefore may not
   * close over `layout`, which does not exist yet when it first runs.
   */
  function placeAlertsFold(phone: boolean): void {
    (phone ? overviewPanel.foldSlot : minimapPanel.body).append(alertsSection.element);
  }

  /*
   * ---- the camera zoom, on screen (issue #1023) ----------------------
   *
   * `WorldScene` has zoomed over `ZOOM_BOUNDS` -- `{ min: 0.2, max: 3 }`, a
   * deliberate fifteen-fold range with a docblock explaining the two ends --
   * since it was written, on the wheel, on a pinch and on `+`/`-`, and until
   * this block **no control anywhere in the DOM named it**. Measured on the
   * assembled page at 1280x800 rather than inferred from this file: the
   * substring `zoom` did not occur once in `document.body.innerHTML`, and the
   * only sentence about moving the view is the Build panel's arm hint, which
   * names panning. The owner's standing brief is a game with no hidden
   * features; that was one.
   *
   * **In `.hud__corner` beside the minimap and NOT inside its panel**, which
   * is the one layout decision here and is about what a collapse does. The
   * minimap panel is collapsible and starts expanded; a zoom pair in its body
   * would vanish with one press on `Collapse` and take the only visible
   * mention of zoom in the game with it. As a sibling it survives that, and it
   * is still in the corner a player looks in for the view controls, next to
   * the surface that already moves the camera.
   *
   * The corner is a flex column with `justify-content: flex-end`, so this row
   * sits directly above the minimap frame and the pair stays anchored to the
   * bottom-left. **Its two buttons need `pointer-events: auto` of their own**
   * (`hud.css`, `.hud__corner .hud-zoom__out, .hud__corner .hud-zoom__in`) --
   * `.hud__corner` stopped opting whole panels back in wholesale on issue
   * #1054, because the pill's own background and its legend carry no handler
   * and were swallowing presses meant for the world underneath.
   *
   * `createIconButton` rather than hand-built buttons: it gives each one the
   * `--tap-target` box `app-shell.spec.ts` measures at 1280x800 and 375x812,
   * and it puts the label in `screenReaderText` as well as `title`, so the
   * meaning never depends on a hover a touch player does not have.
   */
  const zoomLegend = eyebrowText(t(HUD_MESSAGE_KEY.zoomRegion), 'hud-zoom__legend');
  // The group below already carries the same words as its accessible name, so
  // exposing the visible copy too would have a screen reader read them twice --
  // `createDisplayScaleControl`'s own arrangement, for its own reason.
  zoomLegend.setAttribute('aria-hidden', 'true');
  const zoomOut = createIconButton({
    icon: 'zoom-out',
    label: t(HUD_MESSAGE_KEY.zoomOut),
    variant: 'bordered',
    onActivate: () => {
      options.onCameraZoom?.('out');
    },
  });
  zoomOut.element.classList.add('hud-zoom__out');
  const zoomIn = createIconButton({
    icon: 'zoom-in',
    label: t(HUD_MESSAGE_KEY.zoomIn),
    variant: 'bordered',
    onActivate: () => {
      options.onCameraZoom?.('in');
    },
  });
  zoomIn.element.classList.add('hud-zoom__in');
  const zoomControl = element('div', {
    className: 'hud-zoom',
    attributes: {
      role: 'group',
      // Names the pair "zoom" rather than leaving two glyphs beside a game
      // that also has an interface scale. The same word is on screen in the
      // legend, so this is a machine-readable copy of a visible label rather
      // than the only place the meaning exists.
      'aria-label': t(HUD_MESSAGE_KEY.zoomRegion),
    },
    // Out before in, so the pair reads left to right the way a range does and
    // the way the keys do on the row they are bound to.
    children: [zoomLegend, zoomOut.element, zoomIn.element],
  });

  const corner = element('div', { className: 'hud__corner', children: [zoomControl, minimapPanel.element] });

  // ---- bottom-right build panel ------------------------------------
  // Placing an order is a *command*: it asks the host to change the
  // simulation, so it goes through the same gate as the transport controls
  // and a rejection is reported rather than dropped. Nothing changes locally
  // -- the wall appears when a snapshot says it was built.
  const buildPanel: BuildPanel = createBuildPanel({
    localizer,
    ...(options.cameraKeyHint === undefined ? {} : { cameraKeyHint: options.cameraKeyHint }),
    model: options.build ?? { buildables: [], origin: { x: 0, y: 0 } },
    onPlace: (intent) => {
      /*
       * Two commands from one control, chosen by what the selected row *is*
       * rather than by a second button (ADR 0028 phase 1).
       *
       * A row that places an object cannot be ordered as a wall: a
       * `PlaceBuildOrder` for `bed-wooden` would reach `ConstructionSystem`
       * with no footprint check, no room check and no claim on the tile, spend
       * the plank and finish having placed nothing -- which is exactly the
       * defect `door-wooden` already is. So the panel's numeric fields dispatch
       * `place-object` for such a row, which is also what gives object
       * placement a keyboard and numeric route from the day it ships.
       *
       * `placesObject` is a shape fact on the view model, like `occupiesEdge`
       * beside it, and not a judgement this function makes: the composition root
       * knows which buildables name an object and the HUD is handed the answer.
       */
      if (intent.removing) {
        /*
         * The numeric route's removal, and the reason the mode is read here
         * rather than from the row: a removal names no object type, so the
         * selected row decides nothing about it (ADR 0028 phase 3). This is
         * removal's keyboard half -- two number fields and one button -- and it
         * is checked *before* `placesObject`, because a player who armed
         * removal while a wall row was selected still meant to remove.
         */
        dispatchCommand({ kind: 'remove-object', x: intent.x, y: intent.y }, buildPanel.submitControl);
        return;
      }
      if (intent.placesObject) {
        dispatchCommand(
          { kind: 'place-object', definitionId: intent.definitionId, x: intent.x, y: intent.y },
          buildPanel.submitControl,
        );
        return;
      }
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
    onArm: (armed, definitionId, removing) => {
      runReported(
        'arm-build-tool',
        () => options.onIntent?.({ kind: 'arm-build-tool', armed, definitionId, removing }),
        reportError,
      );
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
    /*
     * Selling is a *command* for the same reasons buying is: it asks the host
     * to change the simulation, the credit lands immediately, and a second
     * tap while one is in flight would sell twice. The button is passed so a
     * refusal lands on it as well as on the refusal line (issue #207), on
     * `onPurchase`'s own pattern.
     */
    onSell: (intent) => {
      dispatchCommand(
        { kind: 'sell-materials', itemId: intent.itemId, quantity: intent.quantity },
        buildPanel.sellControl,
      );
    },
    /*
     * Withdrawing one queued order, which is the surface `CancelBuildOrder` had
     * been waiting for.
     *
     * A *command* for the same reasons placing one is: it asks the host to
     * change the simulation, and a second tap while one is in flight must not
     * hand a busy host two cancellations. No control is passed, deliberately --
     * `dispatchCommand`'s `control` argument marks *the* control a refusal is
     * about, and there are `BUILD_QUEUE_ROW_LIMIT` of these, each naming a
     * different order and each repainted on the counts cadence. Marking a pooled
     * row would leave the mark on whichever order landed in it next, which is a
     * worse lie than no mark; the refusal line still says what did not happen,
     * which is the surface #220 established as the one that is on screen at
     * every viewport.
     */
    onCancelOrder: (orderId, revision) => {
      dispatchCommand({ kind: 'cancel-build-order', orderId, revision });
    },
    /*
     * Cancelling one purchase, which is the surface `ProcurementSystem.cancel`
     * had been waiting for (#285).
     *
     * A *command* for the same reasons buying is: it asks the host to change the
     * simulation, money moves, and a second tap while one is in flight must not
     * hand a busy host two cancellations. No control is passed, deliberately, and
     * for the reason the queue rows pass none -- `dispatchCommand`'s `control`
     * argument marks *the* control a refusal is about, and these rows are pooled
     * and repainted on the counts cadence, so a mark would end up on whichever
     * delivery landed in the row next. The refusal line still says what did not
     * happen, and it is on screen at every viewport, which the alerts list is
     * not.
     */
    onCancelPurchase: (orderId) => {
      dispatchCommand({ kind: 'cancel-material-purchase', orderId });
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
  /*
   * Whether a rectangle's own perimeter is walled in, asked of whichever tool
   * the host attached -- or `'open'`, conservatively, when there is none to
   * ask (issue #493). `'open'` rather than `'sealed'` for the same reason a
   * chunk the simulation has not materialised reads as no edge at all: an
   * unanswerable question must not be reported as the answer that lets a
   * command through.
   *
   * One function rather than an inline arrow at each of its two call sites
   * below, because both the panel's own options and the world gesture handler
   * need the identical answer for the identical rectangle (#411's parity
   * guarantee), and two copies of `?? 'open'` is exactly the kind of small
   * duplication that drifts first.
   */
  const classifyRoomArea = (area: HudRoomArea): 'sealed' | 'open' => options.worldRooms?.classifyArea(area) ?? 'open';

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
    classifyArea: classifyRoomArea,
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
    roomsPanel.setPendingArea(gesture.area, classifyRoomArea(gesture.area));
  });
  options.worldRooms?.attachReadout((area) => {
    roomsPanel.setArea(area);
  });

  /*
   * The Security tab's first inhabitant (ADR 0025).
   *
   * Two of the five tabs rendered no panel at all when this one landed --
   * Overview, until the Intake panel below, and Regime, until the Regime panel
   * below that -- and before this one Security was among them: selecting it
   * hid the Build panel and put nothing in its place. Hiring goes here rather
   * than onto the Build panel because no two of these panels are ever laid out
   * at the same time -- so it costs the Build panel's
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
    /*
     * Releasing is a command on the same terms as hiring, and the button that
     * was pressed is deliberately *not* passed as the refusal's control (ADR
     * 0034). The rows are pooled and repainted on the counts cadence, so a mark
     * left on row two would end up on whichever guard the next publication put
     * there -- the same trap `onCancelPurchase` names one panel over. The
     * refusal line still says what did not happen, and it is on screen at every
     * viewport, which the alerts list is not.
     */
    onRelease: (intent) => {
      dispatchCommand({ kind: 'release-guard', guardId: intent.guardId });
    },
    /*
     * Dismissing is a command on the same terms as releasing, and the button
     * that was pressed is *not* passed as the refusal's control for the same
     * reason: the rows are pooled and repainted on the counts cadence, so a mark
     * left on row two would end up on whoever the next publication put there.
     * The refusal line still says what did not happen, and it is on screen at
     * every viewport.
     *
     * **There is a confirmation step now, and this paragraph used to say there
     * was not.** It read: *"**No confirmation step**, and that is a decision
     * rather than an omission. A dismissal cannot be undone -- it destroys an
     * entity -- so a confirm would be defensible; but this repository has no
     * confirmation primitive, inventing a modal here would be a UI pattern
     * decided inside one panel, and the control the player is reaching for is
     * the way *out* of a trap they cannot otherwise escape.
     * `hud.security.roster-hint` states the consequence beside the button
     * instead. A confirm step is worth proposing once there is a pattern for
     * one."*
     *
     * It is quoted rather than deleted because the proposal it asked for is what
     * happened: issue #877 measured the dismiss row firing at the wrong person 4
     * times out of 4, and the owner ruled on 2026-09-03 that a dismissal gets
     * both a settle window on the row and a confirmation step -- *"Jedno i
     * drugie"* -- and supplied the sentence the confirmation says. Every
     * constraint that paragraph named still binds and the step is built to them:
     * no modal, no second control, and the press that gets a player out of the
     * trap is the first of the two rather than a new one. It lives in the panel
     * that owns the rows, because what it has to name is the row's own label --
     * `staff-panel.ts`'s `paintDismissConfirmation` and `hud/dismiss-arming.ts`.
     * Nothing on this side of the boundary changed: this handler is still handed
     * a staff id by a press that has already been confirmed.
     */
    onDismiss: (intent) => {
      dispatchCommand({ kind: 'dismiss-staff', staffId: intent.staffId });
    },
  });

  // ---- bottom-right intake panel (Manage tab) -----------------------
  /*
   * Shares `.hud__side` with the Overview, Build, Rooms, Staff and Regime
   * panels. Six panels and five tabs, and that is the one thing about this
   * column that changed on 2026-09-14: the Manage tab lays out **two** of them
   * -- this one and the Staff panel -- where every tab before showed exactly
   * one. They stack in the same flex column and cannot overlap, and the
   * always-visible budget ADR 0022 measured for the Build tab is untouched,
   * because that budget is about the *Build* tab and no tab gained a panel it
   * did not have except this one.
   *
   * `intake-panel.ts`'s own header explains why this panel was on the Overview
   * tab from #261 until now, and the reason was pixels rather than subject:
   * the Build panel had no room and the Overview tab showed nothing. The
   * owner's ruling of 2026-09-14 places it by subject instead -- the delivery's
   * navigation table names *przyjęcia* (admissions) under Zarządzaj, beside
   * staff and inmates -- and every control on the Manage tab now acts on a
   * person.
   */
  // ---- bottom-right overview panel (Overview tab) -------------------
  /*
   * What the Overview section holds now that intake has left it (issue #1183).
   * It issues no command, so it joins no busy group; it is fed from
   * `simulation/status-counts` rather than pulled per tab, which is why it is
   * the one panel here that does not clear itself when its tab is left.
   */
  const overviewPanel: OverviewPanel = createOverviewPanel({ localizer });

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

  // ---- bottom-right regime panel (Regime tab) -----------------------
  /*
   * The fifth occupant of `.hud__side`, and the one that retires the last tab
   * bound to no panel (issue #451). It issues no command, so it joins no busy
   * group: everything it holds is a readout pulled while this tab is the one
   * showing.
   *
   * **"and takes no selection" was true until issue #895 and is corrected
   * rather than deleted**, because the half that matters is unchanged: it takes
   * one selection -- which prisoner the inspector is about -- and that
   * selection is *chrome*, so it still issues no command and still joins no
   * busy group. `runReported` rather than `dispatchCommand` is what says so
   * below, exactly as it does for the two arming intents.
   *
   * **"It issues no command" stopped being true on 2026-09-16 and the sentence
   * is kept rather than rewritten**, because what it described is the state
   * `EditRegimeBlock` spent two days in: consumer, refusals and save section
   * built, and nothing on any panel able to send one (#1167, ADR 0113
   * slice 1). The selection is still chrome and still ungated; the regime edit
   * below is a command and goes through `dispatchCommand` like every other,
   * which is what puts this panel in the busy group for the first time.
   *
   * **AND THE TWO PARAGRAPHS ABOVE NOW DESCRIBE TWO DIFFERENT PANELS, WHICH IS
   * WHY BOTH ARE KEPT.** The owner's ADR 0115 ruling split this panel in code:
   * the roster, the inspector and the selection the middle paragraph is about
   * are `rosterPanel` below, and `runReported('select-prisoner', ...)` is in
   * that call rather than this one -- so *"`runReported` rather than
   * `dispatchCommand` is what says so below"* is true of the next mount down
   * and not of this one. What is left here is the timetable and the one
   * command, so the first paragraph's *"it issues no command"* is false of
   * this panel and true of the other, and the third paragraph's correction is
   * the only one that still lands on the panel it was written about.
   */
  const regimePanel: RegimePanel = createRegimePanel({
    localizer,
    /*
     * Editing the day is a *command* on `onHire`'s terms, and the button that
     * was pressed is deliberately **not** passed as the refusal's control, for
     * the reason `onRelease` and `onDismiss` give: the toggles are repainted
     * from every `hud/status-strip` reply, so a mark left on a toggle would end
     * up on whichever category the next reply put there. The refusal line still
     * says what did not happen, and it is on screen at every viewport.
     */
    onEditBlock: (intent) => {
      dispatchCommand({
        kind: 'edit-regime-block',
        classificationGroupId: intent.classificationGroupId,
        startTickOfDay: intent.startTickOfDay,
        allowedCategoryIds: intent.allowedCategoryIds,
      });
    },
  });

  // ---- bottom-right roster panel (Plan dnia tab) --------------------
  /*
   * The sixth occupant of `.hud__side`, and the second panel laid out on the
   * Plan dnia tab -- the owner's ruling of 2026-09-16 on ADR 0115, which split
   * the Regime panel in code and kept **both halves on that tab**. The option
   * that moved the roster to the Manage rail was declined, so this mount is the
   * decision rather than a step towards one.
   *
   * Appended **after** `regimePanel` and so laid out under it, which is the
   * reading order the one panel had: what the day allows, then who is in it.
   * `hud.css` gives the schedule panel `flex: 0 0 auto` and this one
   * `overflow-y: auto`, the same division of labour the Intake and Staff panels
   * have made on the Manage tab since 2026-09-14 -- the panel bounded by a
   * closed catalogue keeps its natural height and the panel that grows with the
   * population absorbs a short rail.
   *
   * It issues no command, so it joins no busy group: it takes one selection --
   * which prisoner the inspector is about -- and that selection is *chrome*,
   * which `runReported` rather than `dispatchCommand` is what says so, exactly
   * as it does for the two arming intents.
   */
  const rosterPanel: RosterPanel = createRosterPanel({
    localizer,
    onOpenEmptyAction: (tab) => {
      dispatchShell({ kind: 'select-tab', tab }, { kind: 'select-tab', tab });
      tabs.find((button) => button.id === tab)?.element.focus();
    },
    onSelectPrisoner: (prisonerId) => {
      runReported('select-prisoner', () => options.onIntent?.({ kind: 'select-prisoner', prisonerId }), reportError);
    },
  });

  // ---- bottom-right security panel (Security tab) -------------------
  /*
   * The seventh occupant of `.hud__side`, and the one that retires the last
   * four catalogued read models with a route and no reader (2026-09-17).
   *
   * It issues no command, so it joins no busy group: everything it holds is a
   * readout pulled while this tab is the one showing, and its one selection is
   * chrome -- `runReported` rather than `dispatchCommand` below is what says
   * so, exactly as it does for the Regime panel's prisoner selection and for
   * the two arming intents.
   */
  const securityPanel: SecurityPanel = createSecurityPanel({
    localizer,
    onSelectIncident: (incidentId) => {
      runReported('select-incident', () => options.onIntent?.({ kind: 'select-incident', incidentId }), reportError);
    },
  });

  const side = element('div', {
    className: 'hud__side',
    children: [
      overviewPanel.element,
      intakePanel.element,
      buildPanel.element,
      roomsPanel.element,
      staffPanel.element,
      element('div', { className: 'hud__manage-saves' }),
      regimePanel.element,
      rosterPanel.element,
      securityPanel.element,
    ],
  });
  const manageSavesSlot = side.querySelector<HTMLElement>('.hud__manage-saves')!;

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
   * The object gesture, joined to the same gate (ADR 0028 phase 1).
   *
   * No control is passed, for the reason the build gesture passes none: the
   * player pressed the world, not a button, so there is nothing on screen for a
   * refusal to be marked on. The refusal line still says what happened -- and
   * for a placement that line is the *only* report there is, because unlike a
   * purchase, a hire or an admission there is no pre-flight check the main
   * thread could make: every one of the seven refusal reasons is about the
   * zoning plane, the placed objects or the order list, and the main thread
   * holds none of them.
   */
  options.worldObjects?.attachGestures((gesture) => {
    if (gesture.kind === 'remove') {
      // `edge` (ADR 0106) travels through unchanged when the gesture carried
      // one and is omitted entirely otherwise -- `exactOptionalPropertyTypes`
      // is on, so `edge: undefined` and no key at all are different things,
      // and `src/main.ts` reads absence, not `undefined`, to choose
      // `RemoveObject` over `RemoveWall`.
      dispatchCommand({
        kind: 'remove-object',
        x: gesture.x,
        y: gesture.y,
        ...(gesture.edge === undefined ? {} : { edge: gesture.edge }),
      });
      return;
    }
    dispatchCommand({ kind: 'place-object', definitionId: gesture.definitionId, x: gesture.x, y: gesture.y });
  });

  /*
   * The object aim, joined to the Build panel's one live readout (#550).
   *
   * Wired here rather than at the composition root -- which is where the wall
   * tool's identical readout is wired, through `HudHandle.setBuildTarget` --
   * because this source is already an option of this mount and the room source
   * already attaches its readout here. Two tools reporting into one line
   * through two different seams is how the line came to be able to lie: the
   * panel is handed a target and has no way to ask which tool it came from, so
   * the fewer places that can hand it one, the better.
   */
  options.worldObjects?.attachReadout((target) => {
    buildPanel.setTarget(target);
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
   *
   * **The key is no longer the only route (#1356).** The status strip's Undo
   * and Redo buttons dispatch the same two intents through the same gate, with
   * their own control passed; this seam stays control-less for the reason
   * above, and `dispatchCommand` unmarks the button when a key press takes the
   * kind over, so a stale mark never outlives the press it was about.
   */
  options.editHistory?.attachHistory((direction) => {
    dispatchCommand({ kind: direction });
  });

  /**
   * `Escape`, once there is no gesture left for it to take (issue #959).
   *
   * **Both panels, unconditionally, and neither asked first.** One key means
   * "put down whatever I am holding", and at most one of the two tools is
   * ever armed -- they are armed from panels on different tabs and
   * `setVisible(false)` disarms the panel's tool as it leaves -- so standing
   * both down is exactly as safe as standing the armed one down, and it needs
   * no arbitration that could be wrong. Each panel's `standDown` returns
   * immediately when it is holding nothing.
   *
   * **No `dispatchCommand`, deliberately**, unlike the three attachments
   * above. Nothing is asked of the simulation: this is the same chrome
   * transition the arm control itself performs, so there is no command to
   * refuse and no control for a refusal to land on.
   */
  options.toolStandDown?.attachStandDown(() => {
    buildPanel.standDown();
    roomsPanel.standDown();
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

  const tabsInner = element('div', { className: 'hud-tabs__inner', children: tabs.map((tab) => tab.element) });
  const tabBar = element('nav', {
    className: 'hud__tabs',
    attributes: { 'aria-label': t(HUD_MESSAGE_KEY.tabsRegion) },
    children: [tabsInner],
  });

  /**
   * The layout shell: three collapse arrows, two separators and the Layout
   * menu (#1159, stage 3).
   *
   * Built here, after every region it manages exists and before the `.hud`
   * root, because it appends its controls **into** those regions: the
   * navigation's arrow and separator into the tab bar's own container, the
   * inspector's into the rail's, and the metric strip's into the slot
   * `StatusStrip` keeps outside everything that folds. That is constitution
   * article 16 enforced by construction rather than by a rule somebody has to
   * remember -- an arrow cannot be inside what it hides if it is a sibling of
   * it.
   *
   * The root it writes geometry onto is the `.hud` element, so the shell
   * itself is constructed a few lines below that -- this object only names the
   * three regions, beside the code that built them, where a reader can check
   * that each `content` really is a child of its own `container` and not of
   * something else.
   */
  const layoutRegions = {
    navigation: { container: tabBar, content: [tabsInner] },
    inspector: { container: rail, content: [aside, side] },
    metrics: { container: strip.layoutSlot, content: strip.foldable },
  };

  const hud = element('div', {
    className: 'hud',
    // DOM order matches grid order, so reading order and tab order agree with
    // what is painted: the standing "no simulation" band first, then the
    // refusal line about the last press, then the world's furniture.
    children: [strip.element, unavailable, refusal, eventNotice, corner, rail, tabBar],
  });

  /**
   * `onChange` reports upward and nothing more: the HUD never writes to
   * storage, so a host that passes no handler gets a layout that works for the
   * page load and is not remembered -- which is exactly what a browser with
   * site data blocked gets anyway (`src/input/storage.ts`).
   *
   * The layout controls are deliberately **not** added to `busy`. They issue
   * no command: folding a panel changes no simulation state, which is the
   * distinction `dispatchShell` already draws for the tab bar, and a player
   * must be able to fold a panel away while a build order is in flight.
   */
  // Keep one camera control and one pair of handlers. On phones the corner is
  // hidden to avoid its measured collision with the full-width rail, while
  // the strip's Layout drawer already floats without taking world space.
  // createHudLayoutShell announces its first tier before it returns the menu
  // host, so the initial placement is repeated once that host exists.
  let mobileZoomHost: HTMLElement | undefined;
  const placeMobileZoom = (phone: boolean): void => {
    if (phone) {
      mobileZoomHost?.append(zoomControl);
    } else {
      corner.insertBefore(zoomControl, minimapPanel.element);
    }
  };
  const layout: HudLayoutShell = createHudLayoutShell({
    localizer,
    root: hud,
    settings: options.layout ?? DEFAULT_LAYOUT_SETTINGS,
    strip: strip.element,
    inspectorSheet: side,
    navigation: layoutRegions.navigation,
    inspector: layoutRegions.inspector,
    metrics: layoutRegions.metrics,
    onChange: (next) => {
      options.onLayoutChange?.(next);
    },
    /*
     * THE ALERTS FOLD'S HOME, WHICH IS A FUNCTION OF THE TIER (issue #1201).
     *
     * `.hud__corner` is `display: none` at 720 px and below -- `hud.css` says
     * so under #1117, three times, with the measurement -- and the alerts log
     * is the only surface that issues `DismissAlert`. So on a phone the game
     * offered a command the player could not press: measured at 375x812 on
     * `57cffa10`, the dismiss control on a row with a run of occurrences had
     * **0 client rects**.
     *
     * The owner ruled on 2026-09-16 that the fold moves into the rail on the
     * Overview tab at that breakpoint and no other. The provenance is the
     * weaker of the two kinds this repository distinguishes -- the label of a
     * clickable option this session wrote, *"Zamontuj fold w szynie poniżej
     * 720 px (zalecane)"*, rather than a sentence the owner typed -- and
     * `docs/IDENTITY_V5_ROLLOUT.md` §"Stage 5" is the durable record.
     *
     * **One node, moved, rather than a second one built**, and that is the
     * whole reason this is a callback and not markup: a second alerts list
     * would be a second issuing site for `DismissAlert`, and
     * `tests/foundation/unconsumed-command-contract.test.ts`'s
     * `producersOf('DismissAlert')` pin survives this change unedited because
     * there is still exactly one. It also means the fold's collapsed state,
     * its scroll position and every row in it cross the breakpoint intact --
     * they are the same elements.
     *
     * **Why Overview and not "wherever the player is", measured rather than
     * reasoned.** The rail's sheet is capped at `--hud-inspector-height` below
     * this breakpoint, and on Zones and Manage the panels there are already at
     * that ceiling -- the dossier that priced this measured the same stub
     * taking the Rooms panel from 457.13 to 144.00 px and the Staff panel from
     * 307.38 to 2.00. Overview is the one tab with room, which is why the
     * ruling names it.
     */
    onTierChange: (phone) => {
      placeAlertsFold(phone);
      placeMobileZoom(phone);
    },
  });
  mobileZoomHost = layout.preferencesSlot;
  placeMobileZoom(hud.dataset['layoutTier'] === 'phone');
  strip.layoutSlot.append(layout.menu);

  // Only the controls that issue a *command* are disabled while one is in
  // flight. One busy signal for the three of them, so they can never
  // disagree about whether the clock is being changed. Chrome controls are
  // deliberately absent: see `dispatchShell`. The strip's Undo and Redo
  // (#1356) are in `strip.controls` too: each is a command, so a second tap
  // while one is in flight must not hand the host two undos.
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
    roomsPanel.setVisible(state.activeTab === 'zones');
    staffPanel.setVisible(state.activeTab === 'manage');
    // The fourth occupant of `.hud__side`, and the reason the five can share
    // one box: the conditions are mutually exclusive, so exactly one panel is
    // ever laid out there and none pays for the others' height.
    overviewPanel.setVisible(state.activeTab === 'overview');
    intakePanel.setVisible(state.activeTab === 'manage');
    manageSavesSlot.hidden = state.activeTab !== 'manage';
    // The fifth, on the tab that had none (issue #451). With this line every
    // member of `HUD_TAB_IDS` answers a tap with a panel, which is the state
    // `tests/browser/ui-shell.spec.ts` used to pin the opposite of.
    regimePanel.setVisible(state.activeTab === 'day-plan');
    // And its other half, on the same tab and by the same condition (ADR 0115).
    // Two panels and one tab, so the two are laid out together or neither is --
    // the pairing the Manage tab already makes with Intake and Staff.
    rosterPanel.setVisible(state.activeTab === 'day-plan');
    // The sixth, on the section added 2026-09-17. With this line every member
    // of `HUD_TAB_IDS` still answers a tap with a panel, which is the property
    // `tests/browser/ui-shell.spec.ts` holds the whole array to.
    securityPanel.setVisible(state.activeTab === 'security');
    for (const panel of HUD_PANEL_IDS) {
      const collapsed = isPanelCollapsed(state, panel);
      if (panel === 'minimap') minimapPanel.setCollapsed(collapsed);
      else alertsSection.setCollapsed(collapsed);
    }
  }

  // ---- alerts ------------------------------------------------------
  const alertRows = new Map<string, ListRow>();
  /**
   * Whether the row `alertRows` holds under this id was built as a press.
   *
   * A second map rather than a field on `ListRow`, because it is a fact about
   * what this caller asked for and not about the primitive: `createListRow`
   * takes `onActivate` at construction and exposes no way to ask afterwards,
   * and reading the answer back off the DOM (`instanceof HTMLButtonElement`)
   * would make the paint depend on a tag this file only ever writes
   * indirectly. Kept in step with `alertRows` at every insertion and every
   * deletion, so a stale entry cannot outlive the row it describes.
   */
  const alertPressable = new Map<string, boolean>();
  let emptyRow: ListRow | undefined;

  function paintAlerts(): void {
    /*
     * Three states, and the first of them is issue #1184 (see
     * `HudViewModel.alerts`).
     *
     * `undefined` is **no prison reporting** -- before the first publication,
     * and after `simulation/stopped` takes the field off -- and it gets the
     * sentence, not a row. The sentence is a sibling of the list rather than a
     * row in it for the reason `overview-panel.ts` gives for the same choice:
     * a row here is an alert, drawn with an icon beside a severity badge, and
     * "no prison is reporting" rendered as one would look like an alert that
     * says everything is fine -- which is the failure this issue is about,
     * reintroduced one level down. The list comes off with it, so the two can
     * never be on screen together.
     */
    const rows = viewModel.alerts;
    alertList.hidden = rows === undefined;
    alertsNone.hidden = rows !== undefined;
    if (rows === undefined) {
      // The rows go with the list rather than being left hidden inside it: the
      // next prison to report is a different session, and a row it never sent
      // must not be able to reappear when one does.
      for (const [id, row] of alertRows) {
        row.element.remove();
        alertRows.delete(id);
        alertPressable.delete(id);
      }
      if (emptyRow !== undefined) {
        emptyRow.element.remove();
        emptyRow = undefined;
      }
      return;
    }
    const seen = new Set<string>();
    // One resolution per paint rather than one per row: every dismissable row's
    // control is called the same thing, and the sentence does not depend on
    // which row it is on.
    const dismissLabel = hudAlertDismissLabel(t);
    for (const [index, alert] of rows.entries()) {
      seen.add(alert.id);
      // The sentence, and -- since the owner's decisions 1 and 2 of 2026-09-01
      // on ADR 0084 -- how many times it has been said and when the newest of
      // them was. Composed by a pure function outside this file, because the
      // suite runs in `node` with no jsdom and a decision made inside `mountHud`
      // is unreachable from it.
      const text = hudAlertRowLabel(localizer, alert);
      const badge = { tone: severityTone(alert.severity), text: t(severityLabelKey(alert.severity)) };
      /*
       * **A row that can be dismissed carries an `x` control** (the owner's
       * decision 3 of 2026-09-01 on ADR 0084), and only the rows that can be:
       * a row carrying `occurrences` is one this channel's own producer made,
       * and the refusal and protocol-fault rows beside it carry none. Their
       * dismissal is `docs/HUD_PROJECTIONS.md` gap 34 and is not this change.
       *
       * **Computed once, here, and applied identically whether `row` below is
       * about to be created or is being reused** (issue #764). It used to be
       * computed only inside the create branch, so a row built without
       * `occurrences` and later reused with them kept whatever the create
       * branch decided the one time it ran -- no control, forever, however
       * the row's state changed after that. `alert.occurrences` is read fresh
       * on every paint, so this is a function of the row's current state
       * rather than of its construction history, which is the promise ADR
       * 0084 decision 2 makes and the fix this issue asked for.
       *
       * **A control of its own rather than the whole row, which overrides
       * `createListRow`'s general rule for this row and does so deliberately.**
       * That rule -- *"the entire row, not a small chevron at its end, because
       * a row is the tap target on a touch screen"* -- is right where pressing
       * a row selects something. Here it writes a mark into the save and there
       * is no undo, so the owner ruled for the smaller target with that cost in
       * front of them: a mis-tap that cannot be reversed is worse than a
       * control a finger has to find. `ListRow.setAction` carries the argument
       * at the primitive.
       *
       * **What it costs the sentence beside it is real and is recorded rather
       * than absorbed.** `.ui-row__label` in this list measures 88px (#720);
       * a `--tap-target` control and its gap take 52px of that, leaving about
       * 36px. See `hud-alerts__list` in `hud.css` for the arithmetic and for
       * what would have to give.
       *
       * Not gated and not marked as a command control: see the intent's own
       * comment on `HudIntent` for why a dismissal has no refusal to paint
       * and nothing to serialise against.
       */
      const dismissible = alert.occurrences !== undefined;
      const dismissAction = dismissible
        ? {
            icon: 'dismiss' as const,
            label: dismissLabel,
            onActivate: () => {
              const intent: HudIntent = { kind: 'dismiss-alert', rowId: alert.id };
              runReported(intent.kind, () => options.onIntent?.(intent), reportError);
            },
          }
        : undefined;

      /*
       * **THE ROW ITSELF IS THE PRESS, ON THE ROWS THAT ARE ABOUT SOMEWHERE**
       * -- the owner's ruling of 2026-09-22 on
       * [ADR 0122](../../../docs/adr/0122-what-an-action-column-is-and-whether-a-message-can-carry-a-next-step.md),
       * the option labelled *"Naciskany wiersz, bez czasownika"* ("a pressable
       * row, without the verb"), option D step 3's half of it.
       *
       * **No label is added and none is owed.** The ruling bought a pressable
       * row, not a button with a verb on it, and `HudIntent`'s
       * `show-alert-place` member carries the reading. The accessible name is
       * the row's own two visible texts -- the catalogue sentence and the
       * severity word -- because `createIcon` marks the glyph `aria-hidden`
       * and `createListRow` puts nothing else inside the element. So a screen
       * reader announces exactly what a sighted player reads, and this change
       * authors no string.
       *
       * **Mutually exclusive with the dismiss control above, enforced here
       * rather than assumed.** `createListRow` makes the whole row a
       * `<button>` when it is given `onActivate`, and `ListRowAction`'s own
       * comment states the consequence: a row with both *"would be a button
       * inside a button, which is invalid HTML"*. No producer sends both today
       * -- `src/ui/simulation-alerts.ts` puts the tile only on refusal rows,
       * which carry no `occurrences` and so are never dismissible, while every
       * row `src/ui/simulation-events.ts` builds carries `occurrences` and no
       * tile (`tests/unit/ui-hud-alert-row-press.test.ts` pins that split) --
       * and *"no producer does"* is a fact about today rather than a
       * guarantee, so the dismissable row keeps its control and gives up the
       * press. A row a player cannot reverse a mis-tap on is the one the owner
       * already ruled about, on 2026-09-01, and it does not get quietly
       * widened here.
       *
       * **Pressability is a function of the row's current state, and a row
       * whose state crosses the line is rebuilt rather than reused.** That is
       * issue #764's lesson taken at the one place `createListRow` cannot
       * take it: `setAction` can add or remove a trailing control on a live
       * row, but `onActivate` decides the root's *tag*, and a `<div>` cannot
       * become a `<button>` in place. Today no row crosses the line -- a
       * refusal row's id carries the refusal's own ordinal, so its reason and
       * therefore its tile never change -- and the rebuild is here so that a
       * producer which one day does cross it gets a row that agrees with the
       * view model instead of the one its first paint happened to build.
       */
      const place = alert.tile !== undefined && !dismissible ? alert.tile : undefined;

      const existing = alertRows.get(alert.id);
      let row = existing;
      if (existing !== undefined && alertPressable.get(alert.id) !== (place !== undefined)) {
        existing.element.remove();
        alertRows.delete(alert.id);
        alertPressable.delete(alert.id);
        row = undefined;
      }
      if (row === undefined) {
        /*
         * `wrap: true` is the fix for #720 and the only place in the HUD
         * that asks for it.
         *
         * Every other `createListRow` caller puts a *name* in the label --
         * a buildable, a room type, a staff role -- and the primitive's
         * one clipped line is right for those. This list puts whole
         * sentences from the catalog through it: "Contraband found:
         * {item}.", "The room was not zoned -- this room type must be
         * enclosed, and the area you drew is open on at least one side."
         * In a 224px rail with a severity badge beside it the label gets
         * 88-113px, so a sentence was rendered as `Contraban...` and the
         * item name -- the part rulings 3 and 13 of #703 added the sentence
         * for -- was always the part cut.
         */
        row = createListRow({
          icon: 'incident',
          label: text,
          badge,
          wrap: true,
          // Read from `place` rather than from `alert.tile`, so the one
          // decision above is the only place the two producers' rows are told
          // apart, and the closure captures the tile it was built with -- the
          // same tile the id it is keyed by will keep carrying.
          ...(place === undefined
            ? {}
            : {
                onActivate: () => {
                  const intent: HudIntent = { kind: 'show-alert-place', tile: place };
                  runReported(intent.kind, () => options.onIntent?.(intent), reportError);
                },
              }),
        });
        row.element.dataset['alert'] = alert.id;
        alertRows.set(alert.id, row);
        alertPressable.set(alert.id, place !== undefined);
      } else {
        row.setLabel(text);
        row.setBadge(badge);
      }
      row.setAction(dismissAction);
      // So a browser test can tell the two families apart without reading an
      // id prefix, which is `src/ui/simulation-*.ts`'s vocabulary and not the
      // HUD's. Set or cleared every paint alongside the control itself, for
      // the same reason `setAction` above is: a row that lost its control on
      // a reuse must not keep the flag claiming it still has one.
      if (dismissible) row.element.dataset['alertDismissible'] = 'true';
      else delete row.element.dataset['alertDismissible'];

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
      alertPressable.delete(id);
    }

    // An empty list must say it is empty. A blank rectangle is indistinguishable
    // from a broken one.
    if (rows.length === 0 && emptyRow === undefined) {
      // Wrapped for the same reason as the rows above, though today's
      // sentence fits on one line: the empty-list row is a row of this list,
      // and a locale whose "no active alerts" is longer should not be the
      // one row here that gets cut.
      emptyRow = createListRow({ icon: 'check', label: t(HUD_MESSAGE_KEY.alertsEmpty), wrap: true });
      emptyRow.element.dataset['alert'] = 'empty';
      alertList.append(emptyRow.element);
    } else if (rows.length > 0 && emptyRow !== undefined) {
      emptyRow.element.remove();
      emptyRow = undefined;
    }
  }

  const update = (next: HudViewModel): void => {
    viewModel = next;
    strip.update(next);
    // The Layout menu's own clock readout (#1159). It exists because folding
    // the metric strip takes the strip's clock with it, and constitution
    // article 10 makes the pace the player's -- a layout preference may not
    // cost them the ability to read the time. Fed from the same view model on
    // the same tick, so the two can never disagree.
    layout.setClock(next.clock);
    paintAlerts();
    // The enclosure readout is session state, so it arrives here rather than at
    // mount. Passed straight through: the panel decides what to render and this
    // line decides nothing, which is what keeps "what the simulation found"
    // and "what the player is told about it" in one place each.
    roomsPanel.setZoningNotice(next.zoning);
    // And what those rooms are still missing, passed through exactly as the
    // enclosure readout is: the projection decided which rooms are unfinished
    // and what each one lacks, the panel decides the sentence, and this line
    // decides nothing. Absent is a real state -- nothing has asked -- and it
    // reaches the panel as `undefined` rather than as an empty model, because
    // "nobody asked" and "every room is finished" must not draw the same.
    roomsPanel.setRoomNeeds(next.roomNeeds);
    roomsPanel.setMealPortions(next.counts?.mealPortions ?? 0);
    // And what is still being built, on the same terms: pulled rather than
    // published, absent when nothing asked, and passed straight through. The
    // panel decides what a queue looks like; this line decides nothing.
    buildPanel.setBuildQueue(next.buildQueue);
    // And what has been bought and has not arrived, on identical terms (#285).
    // The projection decided which purchases are still in flight and what each
    // one would refund; the panel decides the sentences; this line decides
    // nothing.
    buildPanel.setPendingDeliveries(next.pendingDeliveries);
    // And the two treasury figures the buy button's availability is judged
    // against, on identical terms (issue #772): the panel decides whether
    // the selected purchase is affordable, and this line decides nothing --
    // it is the same `next.counts` `strip.update` above already read the
    // balance out of.
    /*
     * Withheld when no prison has reported (issue #1191). `next.counts` is
     * optional now, and the two treasury setters below are the same case: a
     * panel handed nothing keeps the figures it was last given, which before
     * the first publication are its own zeroed defaults -- the state its
     * docblock already describes as never rendered, because the buy row cannot
     * be open before a session exists. What it must not be handed is a
     * fabricated `0` balance presented as a reading, which is what
     * `EMPTY_HUD_VIEW_MODEL.counts` used to pass through this line.
     *
     * The narrower fix -- `BuildPanel.setTreasury` and `StaffPanel.setTreasury`
     * taking `HudCountsViewModel | undefined` and disclosing "no balance
     * reported" on the button itself -- is those panels' own decision and is
     * filed separately; this line decides nothing, as the comment above says.
     */
    if (next.counts !== undefined) buildPanel.setTreasury(next.counts);
    // And which guards are held and by what, on identical terms (ADR 0034). The
    // projection resolved every claim -- through the same rule the release
    // itself uses -- the panel decides the sentences, and this line decides
    // nothing.
    staffPanel.setHeldGuards(next.heldGuards);
    // And how many guards the prison asks for against how many it has, on
    // identical terms (ADR 0048). The requirement is `DeploymentSystem`'s, the
    // panel decides which of three things to say about it, and this line
    // decides nothing -- which is the whole reason the HUD may render a figure
    // it could not have computed.
    staffPanel.setCoverage(next.staffCoverage);
    // And who is on the payroll, on identical terms (issue #533). The roster is
    // `GuardRoster`'s, the projection windowed it, the panel decides the
    // sentences, and this line decides nothing.
    staffPanel.setStaffRoster(next.staffRoster);
    // And what that roster costs every in-game day (issue #639 ruling 2). The
    // figure is `PayrollSystem`'s own `dailyWageBillMinorUnits`, published on
    // the counts stream since ADR 0042 step 3 and read by nothing in `src/ui/`
    // until this line; the panel decides whether a shut fold states it, and
    // this line decides nothing.
    // `undefined` when no prison has reported (#1191), which is a state this
    // setter already takes: the panel's own signature is `number | undefined`
    // and it draws no figure for it, because "nobody has published a wage bill"
    // and "the wage bill is zero" are different facts.
    staffPanel.setDailyWageBill(next.counts?.dailyWageBillMinorUnits);
    // And the two treasury figures the hire button's availability is judged
    // against, on the terms `buildPanel.setTreasury` above is passed the same
    // `next.counts` on: the panel decides whether the selected role is
    // affordable -- through the same `pressAffordabilityVerdict` `src/main.ts`
    // judges the `hire-staff` press with -- and this line decides nothing.
    // Withheld on absence, for the reason `buildPanel.setTreasury` above gives.
    if (next.counts !== undefined) staffPanel.setTreasury(next.counts);
    // And where the arrivals are, on identical terms: pulled, absent when
    // nothing asked, and passed straight through. The projection decided how
    // many are at each stage and which stage is terminal; the panel decides the
    // sentences; this line decides nothing.
    intakePanel.setPipeline(next.intakePipeline);
    // And what the prison is worth, on terms that are *not* identical to the
    // eight lines above it, which is the point of the field rather than an
    // inconsistency (issue #1183). Those are pulled per tab and absent when
    // nothing asked; this rides the counts publication and is absent when no
    // prison has reported at all. The projection decided all three figures, the
    // panel decides whether to draw them or to say nobody is reporting, and
    // this line decides nothing.
    overviewPanel.setReadout(next.overview);
    // And what each classification group's day allows at this tick, on
    // identical terms (issue #451). `resolveActiveRegimeBlock` picked the
    // block, the schedule decided what it permits, the panel decides the
    // sentence, and this line decides nothing.
    regimePanel.setRegime(next.regime);
    // And who is in the prison and what each of them is doing, on identical
    // terms. Every word on a row is a message key the projection's ids were
    // turned into; the total is the projection's own count of the live
    // population, not the length of the window; this line decides nothing.
    rosterPanel.setRoster(next.prisonerRoster);
    // And the one prisoner the player selected, on identical terms (issue #895).
    // The projection read the six needs off the store it owns and computed
    // which of them the state is withholding grant over; the panel decides the
    // tone and the order of the lines; this line decides nothing.
    //
    // After the roster deliberately, so that a snapshot carrying both leaves the
    // checked row and the block below it agreeing about the same prisoner rather
    // than one tick apart.
    rosterPanel.setPrisonerDetail(next.prisonerDetail, next.clock.dayLengthTicks);
    /*
     * And the Security section's four, on identical terms (2026-09-17). The
     * projections decided every figure and every id; the panel decides the
     * tone, the order of the lines and which of its empty sentences is true;
     * these four lines decide nothing.
     *
     * The detail goes after the list for the reason the prisoner detail goes
     * after the roster: a snapshot carrying both must leave the checked row and
     * the block below it agreeing about the same incident rather than one tick
     * apart.
     */
    securityPanel.setSecurity(next.security);
    securityPanel.setIncidents(next.incidents);
    securityPanel.setIncidentDetail(next.incidentDetail);
    securityPanel.setContraband(next.contraband);
    // Last, so that a snapshot which both empties the alerts list and carries
    // a refusal leaves the band and the log agreeing about the same record.
    applySimulationRefusal(next.refusal);
    // And what the prison just did, on the same terms and for the same reason
    // it is last: a message that both empties the alerts list and carries an
    // event must leave the band and the log agreeing about the same record.
    applyEventNotice(next.event);
  };

  paintState();
  update(viewModel);
  root.append(hud);

  return {
    element: hud,
    asideSlot: aside,
    manageSavesSlot,
    brandSlot: strip.brandSlot,
    preferencesSlot: layout.preferencesSlot,
    update,
    setBuildTarget: (target) => buildPanel.setTarget(target),
    setUnavailable,
    clearPrisonerSelection: () => rosterPanel.clearPrisonerSelection(),
    clearIncidentSelection: () => securityPanel.clearIncidentSelection(),
    getState: () => state,
    getLayout: () => layout.getSettings(),
    refreshLayout: () => {
      layout.refresh();
    },
    setLayout: (settings: LayoutSettings) => {
      layout.setSettings(settings);
    },
    dispatch: (action: HudShellAction) => {
      applyState(hudShellReducer(state, action));
    },
    destroy: () => {
      gate.dispose();
      // Tearing the layout down is also what ends a drag that was still live:
      // `ResizeSeparator.destroy` reports `'abandoned'` and removes the
      // document-level listeners a live drag installs.
      layout.destroy();
      // The floor's timer outlives the element it paints unless it is cleared:
      // a HUD torn down inside the 600 ms would otherwise wake up and write to
      // a detached band.
      if (eventBandFloorTimer !== undefined) {
        clearTimeout(eventBandFloorTimer);
        eventBandFloorTimer = undefined;
      }
      hud.remove();
    },
  };
}

/**
 * What each transport button asks for, given what the clock is doing now.
 *
 * **The three controls do not treat "the speed the player chose" the same
 * way, and that asymmetry is measured rather than assumed** — playing the
 * clock (`docs/research/2026-09-02-playing-the-clock.md`,
 * `tests/browser/playtest-2026-09-02-the-clock.playtest.ts` act 1) found this
 * paragraph used to claim a single, uniform contract ("Pause never changes
 * the speed, so unpausing resumes at the speed the player chose rather than
 * silently resetting to ×1") that only one of the two ways out of a pause
 * actually honours:
 *
 * - **Pause** never changes the retained speed — `viewModel.clock.speed` is
 *   passed straight through, for `hudClockFromWorkerMessage` to keep across
 *   the pause (`src/ui/simulation-clock.ts`) even though a paused
 *   `ClockControl` carries no speed of its own for the worker to discard.
 * - **Fast-forward, pressed directly out of a pause with no Play in
 *   between,** *does* resume at the speed the player chose: it computes
 *   `nextFastForwardSpeed` off the retained value, so a pause taken at ×4
 *   comes back at ×2 rather than restarting the ladder from ×1. Measured:
 *   pause at ×4, Fast-forward, reads ×2.
 * - **Play always asks for ×1**, whatever the retained speed was — measured:
 *   fast-forward to ×4, cycle down to ×2, Pause, Play reads ×1, not ×2. This
 *   is the one path a player is most likely to mean by "unpausing", and it is
 *   exactly the one this paragraph used to say did not reset silently.
 *
 * `tests/unit/ui-hud-transport-intent.test.ts` pins all three as measured.
 *
 * **The asymmetry is intentional, and it was already decided one file over —
 * which the pass that measured it did not cite.** Reading it as an open
 * design question was wrong, and the correction is recorded here rather than
 * quietly applied. `nextFastForwardSpeed`'s own docblock
 * (`src/ui/hud/projection.ts`) states the rule outright: *"Returning to ×1 is
 * what the play button is for, so no tap is ever ambiguous about what it will
 * do"* — which is why the fast-forward ladder runs 1 → 2 → 4 → 2 and never
 * wraps back to 1 itself. And `transportPressedStates` in the same file
 * returns `play: !fast` under the heading *"Exactly one transport control is
 * pressed at any time, so the three buttons read as a state, not as three
 * independent switches"*. Taken together the three controls are a **radio
 * group over {paused, ×1, fast}**, not a play/pause pair with a speed dial
 * beside it: `Play` *is* the ×1 member of that group, so `Play` asking for ×1
 * out of a pause is the button doing the one thing it is for, and
 * `Fast-forward` carrying the retained speed is the ladder resuming where it
 * was. Neither is a reset of the other's state.
 *
 * **It is also not a hidden behaviour, which is the test the owner's standing
 * design directive actually applies** (*"gra ma być łatwa przyjazna do grania,
 * a nie jakieś ukryte funkcje"*): because exactly one control is lit and
 * `play: !fast` lights `Play` precisely at ×1, a player who presses `Play`
 * out of a ×4 pause sees `Play` lit and `Fast-forward` dark — the state is on
 * screen, in the control they just pressed, rather than discarded silently.
 * A player who meant to keep ×4 presses `Fast-forward`, which the same pass
 * measured as resuming at ×2 on the ladder.
 *
 * So what rotted was **only this paragraph's claim of a single uniform
 * contract**, and that claim is what the measurement refuted. The behaviour
 * of all three controls is unchanged and now says why.
 */
export function transportIntent(kind: TransportIntentKind, viewModel: HudViewModel): HudIntent {
  switch (kind) {
    case 'pause':
      return { kind: 'set-clock', mode: 'paused', speed: viewModel.clock.speed };
    // See the docblock above: `Play` is the ×1 member of the transport's
    // radio group (`transportPressedStates`'s `play: !fast`), and
    // `nextFastForwardSpeed`'s docblock already states that returning to ×1
    // is what this button is for. Asking for ×1 here is that rule, not an
    // oversight -- a caller who wants the retained speed wants
    // `fast-forward`, which is the case below.
    case 'play':
      return { kind: 'set-clock', mode: 'running', speed: 1 };
    case 'fast-forward':
      return { kind: 'set-clock', mode: 'running', speed: nextFastForwardSpeed(viewModel.clock.speed) };
  }
}

