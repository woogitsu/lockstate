import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import {
  type AsyncActionFailure,
  AsyncActionGate,
  createBusyGroup,
  runReported,
} from '../primitives/async-action';
import { describeBy, element, eyebrowText, nextUiId, undescribeBy } from '../primitives/dom';
import type { IconId } from '../primitives/icon';
import { type CollapsibleSection, createCollapsibleSection } from '../primitives/collapsible-section';
import { type ListRow, createListRow } from '../primitives/list-row';
import { type Panel, createPanel } from '../primitives/panel';
import { type TabButton, createTabButton } from '../primitives/tab-button';
import { type BuildPanel, type BuildPanelTarget, createBuildPanel } from './build-panel';
import { type IntakePanel, createIntakePanel } from './intake-panel';
import { type RegimePanel, createRegimePanel } from './regime-panel';
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
  type HudEventNoticeViewModel,
  type HudRefusalNoticeViewModel,
  type HudRoomsViewModel,
  type HudSpeed,
  type HudStaffViewModel,
  type HudViewModel,
} from './view-model';
import { resolveHudLabelParameters } from './label-parameters';

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
 */
export type HudObjectGesture =
  | ({ readonly kind: 'place' } & HudObjectPlacement)
  | { readonly kind: 'remove'; readonly x: number; readonly y: number };

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
   * and had to fix in a follow-up, and it is not worth repeating.
   */
  | { readonly kind: 'remove-object'; readonly x: number; readonly y: number }
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
   * One id and nothing else -- the host turns this into a `CancelBuildOrder`
   * command; the HUD does not know that such a command exists, and the id is not
   * one it could mint. It came *in*, on the build-queue view model, from the
   * projection that names the pending orders.
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
  | { readonly kind: 'cancel-build-order'; readonly orderId: string }
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
   * **Both bullets above are past tense as of 2026-08-31 (#703, rulings 1 and
   * 5).** `INITIAL_HUD_SHELL_STATE.collapsedPanels` is now empty and the
   * `@media (max-width: 720px)` block no longer hides `.hud__corner`, so the
   * alerts list is laid out with `offsetParent` non-null at 1920, 1440, 1280,
   * 900, 768, 721, 720, 600 and 375 CSS px -- measured on the real application
   * at all nine. The bullets are kept because they are the record of why this
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
   * at all nine. The bullets are kept because they are the record of why this
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
   * at all nine. The bullets are kept because they are the record of why this
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
   * It does **not** auto-dismiss, for the reason the refusal band does not: a
   * message that clears itself on a timer is a race against how fast the
   * player reads. It is replaced by the next event or emptied when the session
   * ends, and it is in the log either way.
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
   * The newest event is the one on the line.
   *
   * No arbitration and no source tracking, unlike `applySimulationRefusal`
   * below: this band has exactly one producer, so whatever it replaces is
   * always an older event rather than a sentence of another class. `undefined`
   * means the view model says nothing yet; the field is absent until the
   * session has had something to say and again once it has ended.
   */
  function applyEventNotice(notice: HudEventNoticeViewModel | undefined): void {
    eventNotice.hidden = notice === undefined;
    eventText.textContent = notice === undefined ? '' : t(notice.labelKey, resolveHudLabelParameters(t, notice));
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
   */
  let refusalSource: 'host' | 'simulation' | undefined;
  let refusedAction: string | undefined;
  let simulationRefusalSequence: number | undefined;

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
    const messageKey = refusalMessageKey(failure.actionId);
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
   * another one, or the session ending; see `applySimulationRefusal`.
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
   *   - **The same refusal again.** The counts channel is a snapshot on a
   *     cadence, so an unchanged refusal is republished beside a changed
   *     count. Nothing happens -- in particular the line is *not* taken back
   *     from a host refusal the player has caused since, which is the whole
   *     reason `RefusalLog` carries an ordinal.
   *   - **A new one.** It is the most recently decided refusal, so it takes
   *     the line under the rule the band already had.
   */
  const applySimulationRefusal = (notice: HudRefusalNoticeViewModel | undefined): void => {
    if (notice === undefined) {
      simulationRefusalSequence = undefined;
      if (refusalSource === 'simulation') clearRefusalLine();
      return;
    }
    if (notice.sequence === simulationRefusalSequence) return;
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
    onCancelOrder: (orderId) => {
      dispatchCommand({ kind: 'cancel-build-order', orderId });
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
     * **No confirmation step**, and that is a decision rather than an omission.
     * A dismissal cannot be undone -- it destroys an entity -- so a confirm
     * would be defensible; but this repository has no confirmation primitive,
     * inventing a modal here would be a UI pattern decided inside one panel, and
     * the control the player is reaching for is the way *out* of a trap they
     * cannot otherwise escape. `hud.security.roster-hint` states the
     * consequence beside the button instead. A confirm step is worth proposing
     * once there is a pattern for one.
     */
    onDismiss: (intent) => {
      dispatchCommand({ kind: 'dismiss-staff', staffId: intent.staffId });
    },
  });

  // ---- bottom-right intake panel (Overview tab) ---------------------
  // Shares `.hud__side` with the Build, Rooms, Staff and Regime panels and is
  // never laid out beside any of them: exactly one of the five is visible,
  // keyed on the active tab, so the always-visible budget ADR 0022 measured for
  // the Build tab is unchanged. No tab is bound to no panel any more -- the
  // Regime panel below took the last one (issue #451). See `intake-panel.ts`
  // for why the Overview tab rather than a Build-panel row or a tab of its own,
  // with the measurements behind it.
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
   * bound to no panel (issue #451). It issues no command and takes no
   * selection, so it joins no busy group: everything it holds is a readout
   * pulled while this tab is the one showing.
   */
  const regimePanel: RegimePanel = createRegimePanel({ localizer });

  const side = element('div', {
    className: 'hud__side',
    children: [intakePanel.element, buildPanel.element, roomsPanel.element, staffPanel.element, regimePanel.element],
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
      dispatchCommand({ kind: 'remove-object', x: gesture.x, y: gesture.y });
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
    children: [strip.element, unavailable, refusal, eventNotice, corner, rail, tabBar],
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
    // The fourth occupant of `.hud__side`, and the reason the five can share
    // one box: the conditions are mutually exclusive, so exactly one panel is
    // ever laid out there and none pays for the others' height.
    intakePanel.setVisible(state.activeTab === 'overview');
    // The fifth, on the tab that had none (issue #451). With this line every
    // member of `HUD_TAB_IDS` answers a tap with a panel, which is the state
    // `tests/browser/ui-shell.spec.ts` used to pin the opposite of.
    regimePanel.setVisible(state.activeTab === 'regime');
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
      const text = t(alert.labelKey, resolveHudLabelParameters(t, alert));
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
    // And what those rooms are still missing, passed through exactly as the
    // enclosure readout is: the projection decided which rooms are unfinished
    // and what each one lacks, the panel decides the sentence, and this line
    // decides nothing. Absent is a real state -- nothing has asked -- and it
    // reaches the panel as `undefined` rather than as an empty model, because
    // "nobody asked" and "every room is finished" must not draw the same.
    roomsPanel.setRoomNeeds(next.roomNeeds);
    // And what is still being built, on the same terms: pulled rather than
    // published, absent when nothing asked, and passed straight through. The
    // panel decides what a queue looks like; this line decides nothing.
    buildPanel.setBuildQueue(next.buildQueue);
    // And what has been bought and has not arrived, on identical terms (#285).
    // The projection decided which purchases are still in flight and what each
    // one would refund; the panel decides the sentences; this line decides
    // nothing.
    buildPanel.setPendingDeliveries(next.pendingDeliveries);
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
    staffPanel.setDailyWageBill(next.counts.dailyWageBillMinorUnits);
    // And where the arrivals are, on identical terms: pulled, absent when
    // nothing asked, and passed straight through. The projection decided how
    // many are at each stage and which stage is terminal; the panel decides the
    // sentences; this line decides nothing.
    intakePanel.setPipeline(next.intakePipeline);
    // And what each classification group's day allows at this tick, on
    // identical terms (issue #451). `resolveActiveRegimeBlock` picked the
    // block, the schedule decided what it permits, the panel decides the
    // sentence, and this line decides nothing.
    regimePanel.setRegime(next.regime);
    // And who is in the prison and what each of them is doing, on identical
    // terms. Every word on a row is a message key the projection's ids were
    // turned into; the total is the projection's own count of the live
    // population, not the length of the window; this line decides nothing.
    regimePanel.setRoster(next.prisonerRoster);
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
