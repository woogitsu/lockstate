import Phaser from 'phaser';
import {
  loadAccessibilitySettings,
  resolveBrowserKeyValueStore,
  saveAccessibilitySettings,
} from './input';
import { IndexedDbLocalSaveStore, openLockstateDatabase } from './persistence/local/indexeddb-store';
import { PrisonSaveRepository, type SaveResult } from './persistence/local/repository';
import { LifecycleSaveHandler } from './persistence/session/lifecycle';
import { SessionController } from './persistence/session/session-controller';
import { WorkerPerSessionHost } from './persistence/session/worker-per-session-host';
import { SimulationClient } from './simulation/worker/client';
import { SimulationWorkerChannel, type SimulationMessageChannel } from './simulation/worker/worker-channel';
// `?worker` is Vite's statically-analyzable worker import: it emits the
// worker as its own chunk and gives us a constructor. See SimulationClient's
// constructor docs for why a bare `new URL(...)` cannot work here.
import SimulationWorker from './simulation/worker/worker.ts?worker';
import { AtlasLibrary } from './rendering/assets/atlas-library';
import { DemoActorFeed, isDemoActorsRequested } from './rendering/feed/demo-actor-feed';
import { EMPTY_RENDER_FRAME, type RenderFeed } from './rendering/feed/render-feed';
import { SimulationSnapshotFeed } from './rendering/feed/simulation-snapshot-feed';
import { WorldScene } from './rendering/scene/world-scene';
import { VOID_COLOR } from './rendering/world/appearance';
import { applyAccessibilitySettings, createDisplayScaleControl } from './ui/display-scale';
import { SavePanel } from './ui/save-panel';
import {
  EMPTY_HUD_VIEW_MODEL,
  HUD_MESSAGE_KEY,
  INITIAL_HUD_SHELL_STATE,
  mountHud,
  type HudBuildMaterialViewModel,
  type HudBuildQueueViewModel,
  type HudBuildViewModel,
  type HudBuildableViewModel,
  type HudHandle,
  type HudHeldGuardsViewModel,
  type HudStaffRosterViewModel,
  type HudStaffCoverageViewModel,
  type HudIntakePipelineViewModel,
  type HudIntent,
  type HudPendingDeliveriesViewModel,
  type HudPrisonerRosterViewModel,
  type HudRegimeViewModel,
  type HudRoomNeedsViewModel,
  type HudRoomViewModel,
  type HudRoomsViewModel,
  type HudStaffRoleViewModel,
  type HudStaffViewModel,
  type HudTabId,
  type HudUnavailableNotice,
  type HudViewModel,
} from './ui/hud';
import { hudClockFromWorkerMessage } from './ui/simulation-clock';
import { hudAlertsFromWorkerMessage, hudRefusalFromWorkerMessage } from './ui/simulation-alerts';
import {
  alertRowDismissal,
  hudAlertsWithoutRow,
  hudEventAlertsFromWorkerMessage,
  hudEventNoticeFromWorkerMessage,
} from './ui/simulation-events';
import { hudCountsFromWorkerMessage } from './ui/simulation-counts';
import { hudZoningFromWorkerMessage } from './ui/simulation-zoning';
import { BuildQueueReader } from './ui/simulation-build-queue';
import { IntakePipelineReader } from './ui/simulation-intake';
import { HeldGuardsReader } from './ui/simulation-held-guards';
import { StaffRosterReader } from './ui/simulation-staff-roster';
import { StaffCoverageReader } from './ui/simulation-staff-coverage';
import { PrisonerRosterReader } from './ui/simulation-prisoner-roster';
import { RegimeReader } from './ui/simulation-regime';
import { PendingDeliveriesReader } from './ui/simulation-pending-deliveries';
import { RoomNeedsReader } from './ui/simulation-room-needs';
import { SimulationCommandSender } from './ui/simulation-commands';
import { BuildTool } from './ui/build-tool';
import { ObjectTool } from './ui/object-tool';
import { RoomTool } from './ui/room-tool';
import { OBJECT_CATEGORY_NAME_KEYS, defaultObjectRegistry } from './content/object-catalog';
import { defaultRoomContentRegistry } from './content/room-catalog';
import { PLANNED_OBJECT_TINT, zoningTint } from './rendering/world/appearance';
import {
  BUILDABLE_REGISTRY,
  buildableObjectCategory,
  occupiesTileEdge,
  type BuildableDefinition,
} from './simulation/construction';
// The one reader of the room catalogue's authored requirements outside the
// simulation, and it is the composition root by design: three layers ask this
// question and none may re-derive the answer. See `roomCatalogue()` below.
//
// This comment used to say "*area* requirements", and #529 widened it: the
// Rooms catalogue now states what a room type will need standing in it as well
// as how big it has to be, so `objectRequirements` is read here too.
import {
  enclosureRequirement,
  minimumSizeRequirement,
  objectRequirements,
} from './simulation/rooms/requirements';
import { MAX_PURCHASE_QUANTITY, TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, staffDailyWageMinorUnits } from './simulation/economy';
import { staffHireCostMinorUnits } from './simulation/staff';
import { judgeAffordability, pressFloorMinorUnits } from './ui/affordability';
import { HostRefusalError } from './ui/host-refusal';
import { defaultStaffRoleRegistry } from './content/staff-role-catalog';
import { defaultItemRegistry } from './content/item-catalog';
import { procurableMaterial } from './content/procurement-catalog';
import type { LocalizationKey } from './content/localization';
import { DEFAULT_LOCALE } from './content/localization';
import { defaultMessageCatalogEn } from './services/localization';
import { Localizer } from './services/localization/localizer';
import { createBrandBadge } from './ui/brand-badge';
import { createTelemetryConsentPrompt } from './ui/telemetry-consent-prompt';
import { createTelemetryPipeline } from './services/telemetry/pipeline';
import { createCrashReporter } from './services/telemetry/crash-reporting';
import type { CancelScheduledPump } from './services/telemetry/pump';
import { BUILD_IDENTITY } from './shared/build-identity';
import './styles.css';

/**
 * Stamped into every save envelope as `SaveEnvelope.gameVersion`.
 *
 * It used to be the literal `'lockstate-dev'`, which meant no save could name
 * the build that wrote it -- every build of every day shared one value, so the
 * field carried no information at all. It is now the injected build identity
 * (`src/shared/build-identity.ts`), which is also what the badge in the corner
 * shows and what the worker reports in its handshake: one answer to "which
 * build is this", in three places that each used to have their own.
 *
 * Safe to change. `gameVersion` is validated by `identifierSchema` and is never
 * compared for equality on load -- nothing in `src/persistence/**` reads it back
 * to decide whether a save is loadable, so an older save keeps loading. The one
 * equality comparison in the repository is
 * `src/services/challenges/verification.ts`, against a challenge definition's
 * `allowedGameVersions`, and no definition anywhere names the old literal.
 */
const GAME_VERSION = BUILD_IDENTITY.id;

/**
 * Where telemetry is allowed to go, and by default nowhere.
 *
 * Two compile-time strings, replaced by `tooling/telemetry-config.mjs` through
 * `vite.config.ts`'s `define`, exactly as `src/shared/build-identity.ts`'s two
 * are and for the same reason: a bundle has no environment to read. They are
 * read *here* because choosing the environment is the composition root's job --
 * the same sentence this file already carries about
 * `resolveBrowserKeyValueStore()`.
 *
 * `import.meta.env` is deliberately not used. It would be the more idiomatic
 * Vite spelling and it is refused by
 * `tests/foundation/documentation-claims-contract.test.ts`, whose scan for a
 * module reaching Supabase configuration matches the expression itself; a
 * `define` keeps that gate meaning what it says.
 *
 * Both are guarded with `typeof`, the one form that does not throw for an
 * identifier that was never declared: in the default Vitest environment there
 * is no `define` at all, so the guard takes the empty branch and telemetry
 * resolves to absent -- which is also what an ordinary `pnpm build` with
 * nothing configured produces.
 */
declare const __LOCKSTATE_TELEMETRY_INGEST_PATH__: string | undefined;
declare const __LOCKSTATE_TELEMETRY_ENVIRONMENT__: string | undefined;

/**
 * The telemetry pipeline, or nothing at all.
 *
 * `createTelemetryPipeline` constructs no transport, no sink, no recorder and
 * no session id when the configuration above is absent, which is every build
 * in this repository today. Nothing here reaches the network, and no consent
 * prompt is mounted below, because asking a player to consent to a collection
 * that cannot happen is the defect ADR 0044 named: the consent strings shipped
 * inside the bundle for months while the code that would render them did not.
 */
const telemetry = createTelemetryPipeline({
  ingestion: {
    path: typeof __LOCKSTATE_TELEMETRY_INGEST_PATH__ === 'string' ? __LOCKSTATE_TELEMETRY_INGEST_PATH__ : undefined,
    environment:
      typeof __LOCKSTATE_TELEMETRY_ENVIRONMENT__ === 'string' ? __LOCKSTATE_TELEMETRY_ENVIRONMENT__ : undefined,
  },
  buildVersion: BUILD_IDENTITY.id,
  commit: BUILD_IDENTITY.commit,
  store: resolveBrowserKeyValueStore(),
  now: () => Date.now(),
});

/**
 * The producers, and the whole reason the block above moved to the top of this
 * file.
 *
 * Until this change **nothing in `src/` outside `src/services/telemetry/`
 * called `record()` or `recordError()`** -- the pipeline was a complete
 * conveyor with nothing placed on it. ADR 0010 names the boot-path crash as
 * the case a developer cannot reproduce, and a listener registered after two
 * thousand lines of module evaluation cannot see one: a module-scope throw is
 * reported to whatever is listening *at the moment it happens*. So the
 * pipeline and these two listeners are the first thing this file does after
 * `GAME_VERSION`, ahead of the `Worker`, the scene, the HUD and persistence.
 *
 * `createCrashReporter` holds every decision: which registered event name,
 * which attributes, what happens when the recorder throws, and how many
 * reports one page load may build. These two lines hold the browser binding
 * and nothing else -- the same split ADR 0046 §4 drew for the consent surface,
 * for the same reason: `vitest.config.ts` runs in `node` with no jsdom, so a
 * rule written here would have no headless coverage at all.
 *
 * Built only when the pipeline is, and that is deliberate rather than
 * incidental. With no ingestion destination configured -- every build in this
 * repository -- there is no recorder to feed, and registering a global error
 * listener that can only discard what it catches is surface for no benefit.
 * ADR 0046 §2's rule is that the absent configuration constructs *nothing*.
 */
const crashReporter =
  telemetry.enabled === false
    ? undefined
    : createCrashReporter({ recorder: telemetry.pipeline.recorder, now: () => Date.now() });

if (crashReporter !== undefined) {
  window.addEventListener('error', (event: ErrorEvent) => {
    // `event.error` is absent for a cross-origin script error, where the
    // message is all the browser will say; passing it keeps the report honest
    // rather than empty.
    crashReporter.reportUnhandledError(event.error ?? event.message, 'page-error');
  });
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    crashReporter.reportUnhandledError(event.reason, 'page-rejection');
  });
}

/**
 * The page's channel to whichever simulation worker is current.
 *
 * There is at most one worker at a time and every reader on this thread talks
 * to the same one: the renderer asks it for world snapshots, the HUD reads its
 * clock and counts, and persistence asks it for save snapshots. None of them
 * owns simulation state, and two workers at once would be two divergent
 * simulations.
 *
 * **One at a time is not one per page** (issue #149). The worker's state
 * machine accepts `simulation/initialize` only while it is `uninitialized`, so
 * a worker that has hosted a session refuses the next one -- and this module
 * used to build exactly one, which made *every* load after the first fail in
 * that tab with `already-initialized` and no way forward but a page reload. A
 * session boundary is therefore a worker boundary: `WorkerPerSessionHost`
 * claims a worker that has hosted nothing for each new session, and the
 * channel keeps the listeners the readers below register at boot pointed at
 * whichever worker that is.
 *
 * `open()` constructs the first one now rather than at the first session, so
 * that a browser which cannot start a worker is discovered *before* the HUD
 * mounts -- which is what lets the notice below be painted at first paint
 * (issue #82). It is not a throwaway probe: it has hosted no session, so the
 * first one runs in it.
 *
 * A browser that cannot start a worker still gets a running page: the
 * renderer draws an empty world and the save panel reports that there is no
 * session, which is far better than a blank screen.
 *
 * That promise covers three hostile configurations now, not one. A blocked
 * `Worker` is handled here; a blocked IndexedDB below; and a blocked
 * `localStorage` at the `keyValueStore` option passed to `WorldScene`, which
 * used to be the hole -- the renderer read the global itself and a browser with
 * site data blocked got an empty `<body>` rather than a canvas (issue #199).
 * Each is a different resource and each needed its own guard; none of them is
 * covered by the others.
 */
const simulationWorkers = new SimulationWorkerChannel(() => new SimulationClient(new SimulationWorker()));
try {
  simulationWorkers.open();
} catch (error) {
  console.error('The simulation worker could not be started; the world will not render.', error);
  // The failure is reported on the route this page already has for it -- the
  // same catch that raises the player-facing notice -- rather than through a
  // channel of telemetry's own inside `SimulationClient`. See the
  // `onWorkerAvailability` binding below for the other half.
  crashReporter?.reportWorkerLoss('boot', error);
}
/** The channel, or nothing at all when this browser refused to start a worker. */
const simulation: SimulationWorkerChannel | undefined = simulationWorkers.isOpen ? simulationWorkers : undefined;

/** Used when there is no worker at all -- an empty world, drawn honestly. */
const NO_SIMULATION_FEED: RenderFeed = { readFrame: () => EMPTY_RENDER_FRAME };

const renderFeed: RenderFeed =
  simulation === undefined ? NO_SIMULATION_FEED : new SimulationSnapshotFeed(simulation);

/**
 * Loaded once and shared: the scene needs it for textures, and the optional
 * actor demonstration needs it to discover which logical asset ids exist
 * without hard-coding a list (ADR-0014).
 */
const atlasLibrary = AtlasLibrary.load();
// The scene and the demo wiring below both handle a failed load; this only
// stops the shared promise from looking unhandled before they attach.
atlasLibrary.catch(() => undefined);

/**
 * The main thread's command channel, and the build tool that feeds it.
 *
 * Both are built here, before the scene, because the scene needs the tool:
 * `AGENTS.md` boundary 3 puts input orchestration on this thread, and the
 * renderer may not submit a command of its own. So the scene reports the tile
 * edges a gesture covered, and the tool turns them into an order the HUD can
 * dispatch.
 *
 * The tool used to hold the sender itself and submit the run directly, and
 * its only report of a refusal was `console.warn` -- so the *primary* way to
 * build a wall was the one that told the player nothing, while the Build
 * panel's fallback button painted a refusal line for the identical command
 * (issues #207, #225). It now reports the gesture to the HUD instead
 * (`mountInterface` connects the two), the HUD dispatches it through the same
 * gate the button uses, and `onIntent` below is the single place a
 * `PlaceBuildOrder` is built.
 *
 * With no worker there is no tool: an armed pointer that could never place
 * anything would take the camera away and give nothing back.
 */
const commandSender = simulation === undefined ? undefined : new SimulationCommandSender(simulation);
const buildTool = commandSender === undefined ? undefined : new BuildTool();
/**
 * The room tool, built beside the build tool and for the same reasons.
 *
 * A second object rather than a second mode on `BuildTool`: the two ports carry
 * different shapes -- a run of edges against one rectangle -- and the room tool
 * carries a `removing` mode that would have to be explained away on the class
 * that lays walls. `src/ui/room-tool.ts` states the rule it is following.
 *
 * With no worker there is no tool, exactly as there is no build tool: an armed
 * pointer that could never designate anything would take the camera away and
 * give nothing back.
 */
const roomTool = commandSender === undefined ? undefined : new RoomTool();
/**
 * The object tool, built beside the other two and for the same reasons (ADR
 * 0028 phase 1).
 *
 * A third object rather than a third mode on `BuildTool`: the ports carry
 * different shapes -- a run of edges, one dragged rectangle, one pressed tile
 * plus a footprint -- and this one holds a footprint, which the renderer asks
 * for on every paint and which the class that lays walls has no concept of.
 * `src/ui/object-tool.ts` states the rule it is following.
 *
 * It is armed from the **Build panel**, not from a fourth tab: an object
 * placement is a construction order on the same system, with the same
 * materials, the same lifecycle and the same refusal route as a wall, and
 * `CATEGORY_RANK` already ranks `object` rows second in that catalogue. Which
 * of the two tools a row arms is decided in the `arm-build-tool` branch below.
 */
const objectTool = commandSender === undefined ? undefined : new ObjectTool();

/**
 * The footprint of the object a buildable places, in tiles, or `undefined` for
 * a buildable that places none.
 *
 * Two vocabularies meet here and nowhere else, which is why it is at the
 * composition root: `BuildableDefinition.placesObjectId` says *which* object a
 * completed order puts in the world, and `src/content/object-catalog.ts` says
 * how big that object is. The renderer may hold neither
 * (`tests/unit/rendering-module-boundaries.test.ts`) and the HUD may hold
 * neither (`AGENTS.md` boundary 1), so the two numbers travel to both as plain
 * integers.
 *
 * The **authored** footprint, not a rotated one: nothing in the application can
 * express a rotation yet (see `ObjectOrientation`), so the preview draws what a
 * placement will actually claim.
 */
function objectFootprintOf(definitionId: string): { readonly width: number; readonly height: number } | undefined {
  const objectId = BUILDABLE_REGISTRY.get(definitionId)?.placesObjectId;
  if (objectId === undefined) return undefined;
  const definition = defaultObjectRegistry.getById(objectId);
  if (definition === undefined) return undefined;
  return { width: definition.footprint.width, height: definition.footprint.height };
}

// The entry point supplies the key/value store, which is what `docs/INPUT.md`
// has always described and what the renderer had stopped doing: it read
// `window.localStorage` itself, in a class field initializer, so a browser that
// blocks site data threw before `new Phaser.Game`, `mountInterface` or
// `bootPersistence` were reached and the player got an empty `<body>`
// (issue #199). Choosing the environment belongs here, in the composition root,
// alongside the worker and the database.
//
// `resolveBrowserKeyValueStore()` never throws and never returns undefined: a
// browser that refuses storage gets an in-memory stand-in, so settings work for
// the rest of the page load and simply are not remembered.
const worldScene = new WorldScene({
  feed: renderFeed,
  loadAtlasLibrary: () => atlasLibrary,
  keyValueStore: resolveBrowserKeyValueStore(),
  // The same object under both ports: the tool is where a gesture leaves the
  // renderer, and since #261 it is where the undo of that gesture leaves too.
  // Spread rather than passed as `undefined`, because `exactOptionalPropertyTypes`
  // is on.
  ...(buildTool === undefined ? {} : { buildTool, editHistory: buildTool }),
  // The area tool and the colour to preview a pending room in. The tint is a
  // function rather than a value because the player can change the selected
  // room type without disarming, and the scene reads it on every paint --
  // handed the answer it needs to draw rather than the state it would have to
  // interpret.
  ...(roomTool === undefined
    ? {}
    : {
        roomTool,
        roomTint: (): number | undefined => {
          const selected = roomTool.selectedRoomId;
          if (selected === undefined) return undefined;
          const definition = defaultRoomContentRegistry.getById(selected);
          if (definition === undefined) return undefined;
          return zoningTint(definition.numericId);
        },
      }),
  // The object tool and the colour to preview a pending object in. A function
  // for the reason `roomTint` is one -- the player can change the selected row
  // without disarming -- and one colour for every object rather than a table:
  // `PLANNED_OBJECT_TINT` says what it is and why it is not the room's.
  ...(objectTool === undefined ? {} : { objectTool, objectTint: (): number => PLANNED_OBJECT_TINT }),
});

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: window.innerWidth,
  height: window.innerHeight,
  // The one declaration of the void colour, shared with the camera background
  // `WorldScene.create` sets and with `VOID_APPEARANCE`. Three copies of this
  // hex used to exist, and a drift between them would show as a band where
  // loaded chunks stop -- unmaterialised land gets no draw calls, so the
  // background *is* the void (`src/rendering/world/appearance.ts`).
  backgroundColor: VOID_COLOR,
  scene: [worldScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    pixelArt: false,
  },
};

new Phaser.Game(gameConfig);

/**
 * `?actors=demo` puts scripted actors on screen.
 *
 * A fresh session genuinely has no actors -- the simulation fabricates no
 * default population, and the Intake panel is the only thing that adds one.
 * The renderer does decode the prisoners a snapshot carries, but a prison the
 * player has admitted nobody into stays empty, and a snapshot carries no
 * movement for the ones it does have. This
 * flag is therefore still the way to look at the whole sprite path (manifest
 * -> atlas texture -> direction -> foot pivot -> depth), walk cycle included,
 * without inventing simulation state to do it. It is off by default and it
 * never touches the world underneath.
 */
if (isDemoActorsRequested(window.location.search)) {
  void atlasLibrary
    .then((library) => {
      worldScene.setFeed(new DemoActorFeed(renderFeed, { assetIds: library.assetIds() }));
    })
    .catch((error: unknown) => {
      console.warn('Actor demonstration unavailable: the atlas batch did not load.', error);
    });
}

/**
 * Local-first persistence wiring (issue #19). Deliberately independent of
 * the Phaser game above: `AGENTS.md` requires the main thread to own
 * "rendering, browser UI and input orchestration" separately, and that
 * "persistence consumes explicit snapshots" rather than reaching into
 * renderer internals. The save panel talks only to `SessionController`,
 * which in turn only ever reads the simulation runtime's own snapshot
 * methods.
 *
 * Storage failures here are non-fatal by design: a browser with IndexedDB
 * blocked (private mode, hardened settings) must still boot into a
 * playable, unsaveable session rather than a blank screen.
 *
 * This named the hostile configuration correctly and covered only one of its
 * two storage APIs. A browser that blocks IndexedDB in private mode generally
 * blocks `localStorage` in the same act, and that one was unguarded until
 * issue #199 -- so a configuration this comment describes as survivable
 * produced a blank screen anyway, one resource over. `localStorage` is now
 * handled where it is read, at `WorldScene`'s `keyValueStore` option.
 */
/**
 * Mounts the HUD shell.
 *
 * Deliberately separate from, and ahead of, `bootPersistence`: a browser with
 * IndexedDB blocked must still get an interface, and folding this into the
 * persistence path would make the HUD a casualty of a storage failure it has
 * nothing to do with.
 *
 * The HUD is a view. It renders from a `HudViewModel` -- plain data -- and
 * reports player actions as intents; it holds no simulation state and imports
 * nothing from `src/simulation` (`AGENTS.md` boundary 1). Until a snapshot
 * feed supplies a real view model it paints its empty-prison default, which is
 * the honest picture of a session with nothing in it.
 */
/**
 * Player-facing labels for the two `BUILDABLE_REGISTRY` entries that place no
 * object.
 *
 * Two of the registry's twenty-one rows: `buildableLabelKey` below reads a
 * placing buildable's label off the object's own content key, so only
 * `wall-brick` and `door-wooden` are named here. The ratio is the point rather
 * than either number -- ADR 0028 phase 4 added seventeen object rows and this
 * table did not grow by one, because an object buildable is labelled by its
 * object.
 *
 * The registry carries a hard-coded English `name` and no `nameKey`, which
 * bypasses ADR 0011 and is recorded as a content gap in issue #74 and
 * `docs/HUD_PROJECTIONS.md` (gap 32). Until it gains a real content key, the
 * mapping lives here at the composition root -- the one layer that already
 * knows both the simulation's ids and the HUD's keys. The registry's own
 * `name` is deliberately never read: translated text may not come out of
 * `src/simulation/`.
 */
const BUILDABLE_LABEL_KEY: Readonly<Record<string, LocalizationKey>> = {
  'wall-brick': HUD_MESSAGE_KEY.buildableWallBrick,
  'door-wooden': HUD_MESSAGE_KEY.buildableDoorWooden,
};

/**
 * What the Build panel calls a row.
 *
 * **A buildable that places an object is labelled by that object's own content
 * key**, and only a buildable that places nothing needs an entry in the table
 * above. That is not a shortcut around gap 32 -- it is the gap not applying:
 * `object.bed` carries a real `nameKey` and `object.bed.name` ships in the
 * default catalog, exactly as all 18 room definitions do (which is why
 * `roomCatalogue()` needs no mapping table at all). Adding a
 * `hud.build.buildable.bed-wooden` key would author a second English word for
 * the same thing and let the two drift.
 *
 * The table stays for `wall-brick` and `door-wooden`, whose ids name no content
 * entry. Its own comment records why it exists; this function records why it is
 * not growing.
 */
function buildableLabelKey(definition: BuildableDefinition): LocalizationKey | undefined {
  const objectId = definition.placesObjectId;
  if (objectId !== undefined) return defaultObjectRegistry.getById(objectId)?.nameKey;
  return BUILDABLE_LABEL_KEY[definition.id];
}

/** Walls first, then everything else: the first row is also the default selection. */
const CATEGORY_RANK: Readonly<Record<string, number>> = { wall: 0, object: 1, utility: 2 };

/**
 * The catalogue group for a buildable that places no object
 * ([ADR 0035](../docs/adr/0035-buildable-catalogue-category-filter.md)).
 *
 * `src/content/object-catalog.ts` authors seven categories and the Build
 * panel's filter divides the catalogue by them -- but two of the twenty-one
 * rows place no object at all, so two rows have no category to be divided by.
 * They are `wall-brick`, which is opaque edge geometry, and `door-wooden`,
 * which registers a door on a tile edge; `buildableObjectCategory` answers
 * `undefined` for both and its comment records why neither can be given an
 * object.
 *
 * **A group and not an omission.** Leaving them out of the filter would put
 * the wall -- the most-used buildable in the game -- reachable only from the
 * unfiltered list, which is the state this whole change exists to make
 * navigable. So the composition root mints one group for the pair, in the same
 * place and for the same reason `BUILDABLE_LABEL_KEY` above mints their labels:
 * their ids name no content entry, and this is the layer that knows both
 * vocabularies.
 *
 * The id is an opaque string to the HUD (`HudBuildableViewModel.categoryId`)
 * and can never collide with an authored category: `objectCategorySchema`'s
 * seven members are a closed set and none of them is this word.
 */
const STRUCTURAL_CATEGORY_ID = 'structure';

/**
 * Which group of the Build panel's catalogue a buildable's row belongs to, and
 * what that group is called.
 *
 * The **only** place the two vocabularies meet. A category id is simulation
 * content (`buildableObjectCategory`), a name is a localization key
 * (`OBJECT_CATEGORY_NAME_KEYS`), and ADR 0011 puts them on opposite sides of a
 * boundary the HUD may not cross -- so the join is here, exactly as
 * `buildableLabelKey` above joins a `placesObjectId` to an object's `nameKey`.
 *
 * Both halves are total, which is why this returns no `undefined`: every
 * buildable has a group, because a buildable with no object gets the
 * structural one. `tests/foundation/buildable-category-contract.test.ts` holds
 * the whole partition as a written-out table, so a content row that landed in
 * the wrong group is a failing test rather than a mis-sorted list.
 */
function buildableCategory(definition: BuildableDefinition): {
  readonly categoryId: string;
  readonly categoryLabelKey: LocalizationKey;
} {
  const category = buildableObjectCategory(definition);
  return category === undefined
    ? { categoryId: STRUCTURAL_CATEGORY_ID, categoryLabelKey: HUD_MESSAGE_KEY.buildCategoryStructure }
    : { categoryId: category, categoryLabelKey: OBJECT_CATEGORY_NAME_KEYS[category] };
}

/**
 * The tile a new prison's interface starts from.
 *
 * A new session owns exactly chunk (0,0) of a 32-tile world, so the middle of
 * owned land is the least surprising place for the Build panel's coordinate
 * fields to start -- which is what this used to be, inline, and only that.
 *
 * It is now also **where a hired staff member first stands** (ADR 0025
 * decision 4) and **the tile an admitted prisoner arrives on** (#261 step 4),
 * and all three share one definition rather than three copies of `16`. That is
 * honestly a placeholder in every use: there is no reception, no gate and no
 * staff room in any session a player can start, and nothing in
 * `PrisonerOperationsRuntime` derives a reception point either
 * (`docs/PRISONER_OPERATIONS.md`), so there is no better answer to derive. A
 * constant inside the simulation would be worse -- it would make an arrival
 * point look like a rule -- so it sits here, at the composition root, where the
 * world's shape is already known; and when a session can contain a room a
 * staff member or an arrival belongs in, the arrival tile becomes that room's
 * anchor and the change is to this file alone: both commands already carry a
 * tile.
 */
const NEW_PRISON_ORIGIN_TILE = { x: 16, y: 16 } as const;

/**
 * What a buildable is made of, priced, for the panel's buy control (#89).
 *
 * Three vocabularies meet here and nowhere else, which is why this is at the
 * composition root: `BuildableDefinition.materialsRequired` says what a
 * placement consumes, `src/content/procurement-catalog.ts` says what a unit of
 * it costs, and `src/content/item-catalog.ts` says what it is called. The HUD
 * may hold none of them (`AGENTS.md` boundary 1), so the figures travel as
 * plain numbers and one message key on `HudBuildMaterialViewModel`.
 *
 * **The first requirement that can actually be bought**, and nothing more.
 * All twenty-one shipped buildables list exactly one `materialsRequired`
 * entry, so "first" and "only" agree today -- and it is no longer only an
 * observation: `tests/foundation/object-buildable-cost-contract.test.ts` asserts
 * it of every object row, precisely so that this sentence cannot rot again the
 * way the paragraph below records it rotting. A buildable naming two *item ids* would get
 * a control for one of them and no way to buy the other, which is a real
 * limit and is stated rather than hidden -- the panel offers one stepper, and
 * a multi-material buy surface is a design question nobody has answered. A
 * requirement no one sells yields `undefined` and the panel offers no purchase
 * at all, which is the honest rendering of a material the economy has no price
 * for.
 *
 * **This paragraph used to say "both shipped buildables", and it was wrong
 * twice over.** It was wrong about the count: `BUILDABLE_REGISTRY`
 * (`src/simulation/construction/definition.ts`) has held four rows since
 * ADR 0028 phase 2 -- `wall-brick`, `door-wooden`, `bed-wooden` and
 * `toilet-brick` -- and each row was added without anyone touching this
 * sentence, which is exactly how a count in a comment rots. It was also wrong
 * about what "one material" bounds: it reads as one *unit*, and `wall-brick`
 * requires `quantity: 2`. The limit this function actually imposes is one
 * priced **item id** per buildable, never one unit per placement --
 * `quantityPerPlacement` below carries the requirement's quantity through to
 * the panel, which opens the stepper on it (`setQuantity` in
 * `src/ui/hud/build-panel.ts`), so the two-brick wall's buy control starts at
 * two and needs no second control to be correct.
 *
 * `maxQuantity` comes from `MAX_PURCHASE_QUANTITY` rather than from a number
 * chosen here: the simulation's own bound on one purchase, so the stepper
 * cannot compose a command the schema would reject.
 */
function purchasableMaterialFor(
  requirements: readonly { readonly itemId: string; readonly quantity: number }[],
): HudBuildMaterialViewModel | undefined {
  for (const requirement of requirements) {
    const priced = procurableMaterial(requirement.itemId);
    if (priced === undefined) continue;
    const item = defaultItemRegistry.getById(requirement.itemId);
    // Unreachable while `validateBuildableItemReferences` throws at import for
    // a requirement naming no item, and skipped rather than asserted here so
    // that a catalogue with one unlabelled entry still renders the rest.
    if (item === undefined) continue;
    return {
      itemId: priced.itemId,
      labelKey: item.nameKey,
      unitPriceMinorUnits: priced.unitPriceMinorUnits,
      quantityPerPlacement: requirement.quantity,
      maxQuantity: MAX_PURCHASE_QUANTITY,
    };
  }
  return undefined;
}

/**
 * What the Build panel may offer, projected from the buildable registry.
 *
 * Ordered by `(category rank, id)` rather than taken in `Map` insertion
 * order: this is a list a player reads and taps, and an order that depended
 * on module evaluation would be an order nobody chose
 * (`docs/DETERMINISM.md`). Both keys come from the definition, so the list is
 * a function of content and not of history. An id with no authored label is
 * omitted rather than rendered as a raw identifier.
 */
function buildCatalogue(): HudBuildViewModel {
  const buildables: HudBuildableViewModel[] = [];
  const rank = (category: string): number => CATEGORY_RANK[category] ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...BUILDABLE_REGISTRY.values()].sort(
    (a, b) => rank(a.category) - rank(b.category) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  /*
   * Then regrouped so one catalogue group's rows are contiguous
   * ([ADR 0035](../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * **A stable regroup of the sort above, not a second sort key**, and the
   * difference is what keeps the first row the first row. Groups are visited in
   * the order their first member already had, and members keep their order
   * inside a group -- so `wall-brick` is still `buildables[0]` and still the
   * default selection, which several browser assertions press by position.
   * A `(group, rank, id)` comparator would have put `door-wooden` first, on
   * `door` < `wall`, and quietly changed what the panel arrives armed to place.
   *
   * Why regroup at all, when the filter hides rows rather than reordering
   * them: the unfiltered list is the arrival state and stays 21 rows long, so
   * this is what makes those 21 rows read in the same sequence as the filter's
   * own options -- one order in the panel instead of two. It also means a
   * player scrolling the unfiltered list meets like with like, which is the
   * only improvement available to a list that has to stay complete.
   */
  const groups = new Map<string, BuildableDefinition[]>();
  for (const definition of sorted) {
    const { categoryId } = buildableCategory(definition);
    const group = groups.get(categoryId);
    if (group === undefined) groups.set(categoryId, [definition]);
    else group.push(definition);
  }
  const ordered = [...groups.values()].flat();

  for (const definition of ordered) {
    const labelKey = buildableLabelKey(definition);
    if (labelKey === undefined) continue;
    const material = purchasableMaterialFor(definition.materialsRequired);
    buildables.push({
      definitionId: definition.id,
      labelKey,
      // The simulation's own predicate, called rather than re-derived. This
      // read `definition.category === 'wall'`, which is the same answer for
      // twenty of the registry's twenty-one rows and the wrong one for
      // `door-wooden`: a door is `category: 'object'` that names a
      // `placesDoor`, so it occupies an edge and this row said it did not
      // (issue #531). The Build panel therefore hid its edge chooser for a
      // door while still submitting an edge, and the door landed on whichever
      // edge the previous wall had used. `occupiesTileEdge` is the one place
      // the rule is written, which is what `submitOrder` already calls and
      // what `docs/NAVIGATION.md` said this surface was owed.
      occupiesEdge: occupiesTileEdge(definition),
      // Which group the catalogue's filter puts this row in, and what that
      // group is called (ADR 0035). Both are answers only this layer can give:
      // the id is simulation content and the key is a localization key, and the
      // HUD may hold neither (`AGENTS.md` boundary 1, ADR 0011).
      ...buildableCategory(definition),
      // Whether the row arms the object tool and produces a `PlaceObject`
      // rather than a `PlaceBuildOrder`. A shape fact the HUD is handed, like
      // `occupiesEdge` above it, because what a buildable places is simulation
      // content the interface may not read.
      placesObject: definition.placesObjectId !== undefined,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so a buildable made of nothing purchasable has to have no
      // property at all -- which is what makes the panel hide its buy control
      // rather than offer one that could only be refused.
      ...(material === undefined ? {} : { material }),
    });
  }

  return { buildables, origin: NEW_PRISON_ORIGIN_TILE };
}

/**
 * What the Staff panel may offer, projected from the staff-role catalogue
 * ([ADR 0025](../docs/adr/0025-guard-hiring-surface.md)).
 *
 * **One role, and the reason it is one has changed.**
 *
 * This list used to be the *only* thing stopping a nurse from standing a wall,
 * and it said so: *"`DeploymentSystem`, `PatrolSystem`,
 * `IncidentResponseSystem` and `SearchSystem` all claim staff from
 * `GuardRoster.unassignedGuardIds()` with no filter on role, so a nurse hired
 * into that roster is sent to a patrol post by the next scheduled deployment
 * tick... The *simulation* is deliberately given no whitelist... it grows the
 * day a system reads a department or a permission."* That day arrived:
 * [ADR 0053](../docs/adr/0053-who-may-stand-a-security-post.md) put the rule in
 * the simulation, where a gameplay rule belongs (`AGENTS.md` boundary 1 --
 * rendering is not simulation). `StaffHiringService` now refuses an ineligible
 * role with `hire.no-duty-for-role`, and `claimableGuardIds` is what the four
 * systems above draw from.
 *
 * So this list is no longer a safety rail. It is a *producer's* judgement about
 * what is worth offering, and it is still one role rather than the two the
 * simulation would accept: `staff-role.security-chief` is post-eligible, costs
 * 200 a day against the guard's 80, and buys nothing the guard does not --
 * offering it would be a pricing and content decision, which is #29's and not
 * this file's. Widening it is now safe rather than dangerous, which is the
 * whole of what changed.
 *
 * Every figure crosses as content the HUD is handed: the label is the role's
 * own `nameKey`, so no id→key mapping table of the `BUILDABLE_LABEL_KEY` kind
 * is needed here, and the charge comes from the simulation's own
 * `staffHireCostMinorUnits` rather than being re-derived from the band --
 * one definition of what a hire costs, on both sides of the worker boundary.
 *
 * A role the registry does not declare is omitted rather than rendered
 * without a charge: the same reading `buildCatalogue()` takes of a buildable
 * with no authored label.
 */
const HIREABLE_STAFF_ROLE_IDS: readonly string[] = ['staff-role.guard'];

function staffRoster(): HudStaffViewModel {
  const roles: HudStaffRoleViewModel[] = [];
  for (const staffRoleId of HIREABLE_STAFF_ROLE_IDS) {
    const role = defaultStaffRoleRegistry.getById(staffRoleId);
    const hireChargeMinorUnits = staffHireCostMinorUnits(staffRoleId);
    /*
     * The second figure the hire hint quotes (issue #639 ruling 2), read
     * through the simulation's own `staffDailyWageMinorUnits` rather than
     * assumed equal to the charge above. The two are equal today because
     * `src/simulation/economy/wages.ts` makes them equal -- both delegate to
     * `staffDailyWageForRole` -- and that is a simulation fact this line
     * passes on rather than a coincidence the HUD is entitled to rely on.
     * `undefined` for a role the registry does not declare, on the same terms
     * the charge is: a role with no price is omitted rather than rendered
     * without one.
     */
    const dailyWageMinorUnits = staffDailyWageMinorUnits(staffRoleId);
    if (role === undefined || hireChargeMinorUnits === undefined || dailyWageMinorUnits === undefined) continue;
    roles.push({ staffRoleId, labelKey: role.nameKey, hireChargeMinorUnits, dailyWageMinorUnits });
  }
  return { roles };
}

/**
 * What one press of the admit control asks the simulation for (#261 step 4).
 *
 * ## One figure now, and the other one is the simulation's
 *
 * This used to carry two: `sentenceLengthTicks: 10_000` beside
 * `priorIncidents: 0`. **The sentence is gone from here** (#535 decision 5,
 * `src/simulation/prisoners/sentence.ts`), and the paragraph that used to
 * justify keeping it is the reason it left. It read: *"they are constants and
 * not a random draw for the same reason: `Math.random` on this thread would
 * make two runs of the same seed produce different prisoners, which is exactly
 * what `docs/DETERMINISM.md` forbids."* That is right, and it rules out a
 * main-thread draw of any kind rather than only an unseeded one -- the seed a
 * session is reproducible from lives in the worker. So the answer was never a
 * better constant here; it was for the field to become optional on the wire and
 * for the draw to happen where the risk tier and the prisoner's name are
 * already drawn. `admitPrisonerSchema` now permits the omission and
 * `IntakeSystem` draws at the `classification` stage, from `prisoners.sentence`.
 *
 * **What the owner decided.** #535 decision 5 settles that sentences vary.
 * This paragraph used to continue *"the bounds -- 2 to 16 in-game days,
 * uniform -- are a proposal recorded at `MIN_SENTENCE_DAYS` ... and are the
 * owner's to confirm or replace"*, and the owner has now replaced them: the
 * ruling on [#593](https://github.com/matmaxalez/lockstate/issues/593),
 * 2026-08-30, makes the range **14 to 90 in-game days**
 * ([ADR 0079](../docs/adr/0079-a-sentence-long-enough-to-be-a-history.md)).
 * Nothing on screen renders a sentence today, so a varying one adds no
 * player-facing sentence and needs no new copy: `projectPrisonerDetail`
 * already carries `sentence.lengthTicks` and `sentence.endTick`, and the HUD
 * already declines to draw them. **That is now a gap worth naming rather than
 * a convenience**: a 90-day sentence is three real hours at x1 and decides
 * whether a prisoner is long-sentence, and the player can see neither number.
 * Filed as a consequence in ADR 0079 rather than fixed here, because inventing
 * a player-facing string is not this change's to make.
 *
 * ## `priorIncidents` stays 0, and that is a held decision rather than an
 * oversight
 *
 * It is still the least eventful value in range: `0` is the bottom of the
 * `priorIncidentsAtIntake` slot, so it adds nothing to `classifyPrisoner`'s
 * score.
 *
 * **This paragraph used to continue "and the tier that results is the
 * screening draw alone ... reachable tiers at `priorIncidents: 0` are
 * `[0, 1]`", and that stopped being true when the owner ruled on #593.** It is
 * corrected here rather than left to be contradicted eighteen lines further
 * down, which is what it was doing: the paragraph below already says the right
 * thing, and a reader arriving at this one first had no way to know which half
 * to believe. `priorIncidents` is no longer the only term that can be zero --
 * the *sentence* term can now be 1, for the seven drawable lengths of 84
 * in-game days and up -- so the tier is the screening draw **plus that point**,
 * and the reachable set is `[0, 1]` below 84 days and `[0, 1, 2]` at or above
 * it (`tests/unit/prisoners-classification.test.ts` enumerates it over the
 * whole draw space rather than sampling).
 *
 * **What the old sentence was protecting is untouched, and it is the half
 * worth keeping:** `classificationGroupIdForTier` only answers `'high-risk'`
 * at tier 3, and one sentence point plus a maximum screening draw of `+1`
 * clamps at 2 -- so **no admission a player can make from this panel has ever
 * produced a high-risk prisoner**, and `room.solitary-cell`'s accommodation
 * branch is still reachable only through `ClassificationReviewSystem` later
 * revising a tier upward. The margin narrowed from two screening points to
 * one; it did not close.
 *
 * That is a real dead branch of exactly the kind #535 decision 5 was taken
 * about, and it is deliberately **not** fixed here. Drawing prior incidents
 * would move risk tiers, and risk tiers decide cell sharing, contraband
 * introduction and which regime timetable a prisoner runs -- a balance change
 * with a far wider blast radius than a sentence length, and one the owner has
 * not taken.
 *
 * **The last sentence of this paragraph is withdrawn, by the owner's ruling on
 * #593 rather than by a mistake.** It read: *"Keeping it at 0 is also what
 * preserves this change's strongest safety property: with the sentence drawn
 * from its own stream and the range entirely below
 * `LONG_SENTENCE_THRESHOLD_TICKS`, every tier every existing seed has ever
 * produced is bit-identical after it."* The range is no longer entirely below
 * that threshold, so the property is gone and was spent on purpose. Measured
 * against the enumeration in `tests/unit/prisoners-classification.test.ts`:
 * the tiers reachable from this panel's request were `[0, 1]` at every
 * drawable sentence and are `[0, 1]` below 84 in-game days and `[0, 1, 2]` at
 * or above it. **What still holds is the claim that mattered**: the panel
 * still cannot produce a tier-3 prisoner, because `priorIncidents` is 0 and
 * one sentence point plus a maximum screening draw clamps at 2.
 *
 * The interface still offers no field for either figure and could not label one
 * honestly -- a sentence is quoted in ticks and a prior-incident count feeds a
 * risk tier the HUD never shows (`docs/HUD_PROJECTIONS.md`) -- which is the
 * original reason neither is a control, and is unchanged.
 */
const ADMISSION_REQUEST = { priorIncidents: 0 } as const;

/**
 * What the Rooms panel may offer, projected from the room catalogue.
 *
 * **Simpler than `buildCatalogue()` above, and the difference is content's
 * rather than this function's.** All 18 room definitions carry a real
 * `nameKey` and all 18 `room.*.name` keys ship in the default catalog, so there
 * is no id-to-key mapping table here at all -- `BUILDABLE_LABEL_KEY` exists
 * only because `BUILDABLE_REGISTRY` carries a hard-coded English `name` and no
 * key (`docs/HUD_PROJECTIONS.md` gap 32), and rooms have no such gap. Nothing
 * is dropped for want of a label, so this cannot silently show a shorter list
 * than the catalogue holds.
 *
 * Ordered by `(category, id)` rather than taken in registry order, for exactly
 * the reason `buildCatalogue()` is: this is a list a player reads and taps, and
 * an order that depended on module evaluation would be an order nobody chose
 * (`docs/DETERMINISM.md`). Grouping by category also puts the three housing
 * rooms together, which is the grouping a player is choosing between.
 *
 * The *rules* -- the authored minimum size, the enclosure requirement and,
 * since #529, the objects the room will need -- are read through
 * `src/simulation/rooms/requirements.ts` rather than by looping over
 * `definition.requirements` here. Several layers ask those same questions and
 * none may re-derive the answer: the zoning service refuses a rectangle below
 * the minimum, the enclosure evaluation reports against the
 * `enclosed`/`outdoors` requirement, `room-projection.ts` checks the object
 * requirements against what is standing in a real room, and this projection
 * puts all three on screen so the player can read the rule before dragging. A
 * copy of `requirements.find` in each would be that many places to forget a
 * fifth requirement kind.
 *
 * **This paragraph counted "two rules" and "three layers" until #529**, which
 * is the count-shaped sentence `docs/AGENT_WORKFLOW.md` §4 warns rots first:
 * adding the third rule did not touch the sentence saying there were two. It
 * now names the subjects instead of tallying them.
 *
 * `tint` comes from `zoningTint`, the renderer's own table, so the catalogue
 * row and the designation painted on the map cannot disagree. That is a value
 * import from `src/rendering/` into the composition root, which is what a
 * composition root is for; the *HUD* gets a number and no table.
 */
function roomCatalogue(): HudRoomsViewModel {
  const rooms: HudRoomViewModel[] = [];
  const ordered = [...defaultRoomContentRegistry.all()].sort(
    (a, b) =>
      (a.category < b.category ? -1 : a.category > b.category ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const definition of ordered) {
    const minimum = minimumSizeRequirement(definition);
    rooms.push({
      roomId: definition.id,
      labelKey: definition.nameKey,
      // The category's tint is defined for every catalogued room, so the
      // fallback is unreachable; `zoningTint` answers `undefined` only for an
      // unzoned tile or an id no room claims, and this loop is over the rooms
      // themselves. `0` rather than a colour picked here, so an unreachable
      // branch cannot quietly invent a legend entry.
      tint: zoningTint(definition.numericId) ?? 0,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so a room that authors no minimum has to have no property at
      // all -- which is what makes the panel say "no minimum size" instead of
      // claiming a 1x1 floor nobody wrote.
      ...(minimum === undefined ? {} : { minimum: { width: minimum.minWidth, height: minimum.minHeight } }),
      enclosure: enclosureRequirement(definition),
      /*
       * What the room type will need standing in it, so the cost of a canteen
       * is readable *before* the drag rather than only after it (#529).
       *
       * The object's name comes from `defaultObjectRegistry`, which is the same
       * lookup `roomNeedsFromProjections` gets on the other side of the
       * boundary via `RoomRequirementViewModel.objectNameKey` -- so the row a
       * player reads before zoning and the line they read afterwards name the
       * object with the same key and cannot drift into two different words for
       * one thing.
       *
       * `labelKey` is spread rather than passed as `undefined` for the reason
       * `minimum` above is. It is absent only for a room naming an object id
       * this build does not declare, which `validateRoomObjectReferences`
       * refuses at catalogue load -- so it is unreachable here and handled
       * anyway, because a `getById` that can answer `undefined` is not made
       * total by a validator in another module.
       */
      objectRequirements: objectRequirements(definition).map((requirement) => {
        const labelKey = defaultObjectRegistry.getById(requirement.objectId)?.nameKey;
        return {
          objectId: requirement.objectId,
          quantity: requirement.minQuantity,
          ...(labelKey === undefined ? {} : { labelKey }),
        };
      }),
    });
  }
  return { rooms };
}

interface InterfaceHost {
  /**
   * Absent when no worker started. Every control that would reach the
   * simulation then *throws*, which the HUD reports on the control that was
   * pressed -- a pause button that silently does nothing is a lie the player
   * has no way to detect (issue #82's point, applied to the build controls
   * too).
   *
   * The channel rather than a `SimulationClient`, because the HUD's readouts
   * are registered once at mount and have to keep arriving from whichever
   * worker the current session is running in (issue #149).
   */
  readonly client?: SimulationMessageChannel;
  readonly commands?: SimulationCommandSender;
  readonly tool?: BuildTool;
  /**
   * The room tool, absent for the reason `tool` is: with no worker there is
   * nothing to designate a room in, so the pointer keeps its camera meaning.
   *
   * A second field rather than a widened `tool`, matching the two ports the
   * scene is given: a host may hold one and not the other, and
   * `tests/unit/ui-orchestration-boundaries.test.ts` records each file's
   * dependencies separately.
   */
  readonly rooms?: RoomTool;
  /**
   * The object tool, absent for the reason `tool` and `rooms` are: with no
   * worker there is nothing to place an object in, so the pointer keeps its
   * camera meaning.
   *
   * A third field rather than a widened `tool`, matching the three ports the
   * scene is given.
   */
  readonly objects?: ObjectTool;
}

/**
 * A control that reaches the simulation, when there is no simulation to reach.
 *
 * Throwing rather than returning: the HUD reports a rejection on the control
 * that was pressed, and a build button that quietly does nothing is exactly
 * the failure issue #82 was about.
 */
function requireSimulation(commands: SimulationCommandSender | undefined): SimulationCommandSender {
  if (commands === undefined) {
    throw new Error('The simulation worker could not be started, so nothing can be sent to it.');
  }
  return commands;
}

/**
 * The page's one localizer.
 *
 * Module scope rather than local to `mountInterface`, because two consumers now
 * need the *same instance*: the HUD and the save panel. `SavePanel` used to
 * default to a localizer of its own over the same catalog -- equivalent while
 * `en` is the only locale, and not equivalent the moment a second ships, when a
 * panel holding its own default-locale localizer would keep rendering English
 * while the rest of the interface changed language. Issue #208 recorded that as
 * a seam with a known end; this is the end.
 */
/*
 * `defaultMessageCatalogEn`, not a catalog built here from content alone.
 *
 * ADR 0011: "Only the default locale is bundled -- it must be **complete** so
 * the game always has text offline." This localizer was not complete. It was
 * built from `defaultLocaleEnCatalog`, which is `src/content/`'s half, and the
 * trusted-services layer contributes twelve more strings of its own
 * (`SERVICE_MESSAGES` in `src/services/localization/default-catalog.ts`:
 * product names, save-slot counts, entitlement notices, challenge results and
 * the telemetry consent prompt). None of them was in the running page's
 * localizer, so any of them would have rendered as its own key.
 *
 * `defaultMessageCatalogEn` is content merged under those service strings, and
 * it is what `tests/foundation/localization-key-completeness.test.ts` resolves
 * every declared key against -- so the gate was proving completeness of a
 * catalog the application did not use. `src/services/entitlements/products.ts`
 * declares `nameKey: 'product.save-slots.plus-5.name'`; the gate says it
 * resolves, and before this line it would have painted the raw key.
 */
const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/**
 * Without a worker there is no simulation and no session, so there is
 * genuinely nothing to save -- a save panel here would be a prop. What the
 * player is owed is being *told*, which the console message alone never did
 * (issue #82).
 *
 * This used to be an entry in `HudViewModel.alerts`, on the premise that
 * "the alerts region already exists for exactly this". The premise was
 * false: that region is inside `.hud__corner`, which `hud.css` drops
 * entirely at 720px and below, and the alerts *section* within it starts
 * folded (`INITIAL_HUD_SHELL_STATE`), so the row was `offsetParent === null`
 * with a 0x0 box at **every** viewport and `.hud` innerText never mentioned
 * it. Measured in Chromium on this page at 1280x800 and 375x812 with
 * `Worker` construction blocked (issue #220). It now goes to the HUD's own
 * always-laid-out band instead, which needs no section opened and survives
 * every breakpoint in `hud.css`.
 *
 * **The premise stopped being false on 2026-08-31 (#703, rulings 1 and 5), and
 * the routing does not move back.** `.hud__corner` is no longer dropped below
 * 720px, the alerts section starts open, and the list scrolls rather than
 * clipping its newest row -- so a row there is now laid out and reachable at
 * every viewport measured. The band keeps this sentence for the reason that
 * never depended on the fold: a browser that cannot start a worker has no
 * simulation to log events from, so the list it would go in is empty, and an
 * empty list says nothing whether it is open or shut. See
 * `INITIAL_HUD_SHELL_STATE` for the full account of what changed.
 *
 * Module scope rather than local to `mountInterface`, because there are two
 * moments this page can end up with no simulation and they must say the same
 * thing: the boot construction failing, and -- since a session boundary is a
 * worker boundary (issue #149) -- a later one failing in `bootPersistence`.
 */
const SIMULATION_UNAVAILABLE_NOTICE: HudUnavailableNotice = { labelKey: 'hud.unavailable.simulation' };

function mountInterface(app: HTMLElement, host: InterfaceHost = {}): HudHandle {
  const { client, commands, tool, rooms, objects } = host;
  const simulationUnavailable = client === undefined;

  let hud: HudHandle | undefined;

  let viewModel: HudViewModel = EMPTY_HUD_VIEW_MODEL;

  /*
   * What the designated rooms are still missing, and the two things that make
   * it a *pull* rather than a publication (#331 milestone).
   *
   * The simulation has been able to answer this since #123 -- a zoned cell with
   * no bed reports `missingCapability: 2`, and it is the same signal
   * `IntakeSystem` gates on -- and nothing under `src/ui/` asked, so the panel
   * that made the room could not say why the room does nothing. The reader is
   * `src/ui/simulation-room-needs.ts`; this is the composition root deciding
   * *when* to ask, which is the half a translator cannot own.
   *
   * **Only while the Rooms tab is the one showing.** A room list is
   * `O(instances)` to build and nobody is reading it from the Build tab, which
   * is the whole argument for the channel being a pull
   * (`src/ui/simulation-projections.ts`: "a panel that is closed asks for
   * nothing"). `activeTab` is tracked from the `select-tab` intent rather than
   * read back off the HUD, because the HUD's shell state is chrome the HUD owns.
   *
   * **On a cadence that already exists, not on a timer of its own.** Placed
   * objects change what a room has without changing any count -- a completed bed
   * order takes a cell from "needs a bed" to "needs a toilet" and moves nothing
   * on the strip -- so a readout refreshed only when a room was zoned would go
   * stale in exactly the case the player is working through. `RoomNeedsReader.read`
   * refuses to stack, so a slow answer cannot queue a second question.
   *
   * **Which cadence, corrected 2026-09-01 (issue #718). This is the one place
   * in this file that states it; the eight comments below point here.** This
   * paragraph read *"**On the counts cadence** ... `simulation/status-counts`
   * arrives up to twice a second while a session exists"*, and five comments
   * below put a number on it -- *"up to 500ms for the next counts
   * publication"*. **All of them were false the day they were written**, and
   * the listener at the bottom of this file is why: it computes six
   * translations and returns early only when *all six* say nothing, so every
   * message carrying any one of them falls through to the nine-call refresh
   * block. `hudClockFromWorkerMessage` has no "nothing changed" arm -- it
   * answers every `simulation/clock-state` -- and the worker posts one of those
   * at most every 250 ms and only when the tick has moved
   * (`CLOCK_STATE_PUBLISH_INTERVAL_MS`). So the binding cadence of every pulled
   * readout in this file is the **clock heartbeat at 250 ms**, and the counts
   * channel's change gate never bounded it at all.
   *
   * That distinction is not pedantry, because the counts channel *is* gated:
   * measured on the **harness** (`SimulationWorkerStateMachine`, fake timers,
   * no render thread, no competing work) over 30 simulated seconds at x1, a
   * prison with no occupied place publishes `simulation/status-counts`
   * **once** -- the income accrual is the only per-tick mover among its
   * twenty integers and it is a constant 0 while nobody is housed -- and
   * refreshes these readouts **120 times**, worst gap 255 ms. Remove the
   * clock term from that predicate and the same prison refreshes **once in
   * thirty seconds**. What each of these comments was reaching for is still
   * true -- none of these readouts is refreshed only on arrival -- and only
   * the channel and the number were wrong. Whether the heartbeat should be
   * the deliberate contract is
   * [ADR 0086](../docs/adr/0086-what-refreshes-a-pulled-hud-readout.md).
   *
   * **255 ms is the harness figure, and it understated what a player actually
   * waits by about 18% (issue #765).** PR #762 (`73996787d4`) ran this same
   * scenario -- Regime tab, two admitted unhoused prisoners, clock at x1, 30
   * s -- in a real browser
   * (`tests/browser/playtest-2026-09-01-measurements-owed.playtest.ts`) and
   * measured, over four runs: **118, 118, 118, 119 requests** (the harness's
   * "120 times" mechanism confirmed almost exactly), but **46-58 of the ~118
   * gaps exceeded 260 ms**, median gap **253-260 ms**, and a **tail of
   * 292.8-299.6 ms**. The harness's 255 ms has fake timers and no render
   * thread competing for the main thread; a browser adds roughly 5 ms of
   * median drift and a roughly 40 ms tail on top of it. **The six inline
   * comments below that still say "255ms" are about this browser wait, not
   * the harness one** -- the honest figure for them is "up to roughly 300 ms
   * in a browser", and each now says which measurement its number is. ADR
   * 0086 §2's own 260 ms bound is falsified by the same data; see that ADR's
   * amendment.
   */
  const roomNeedsReader = client === undefined ? undefined : new RoomNeedsReader(client);
  /*
   * What is still waiting to be built, on the same terms as the room readout
   * above and for the same three reasons -- with one difference that is the
   * whole point of it.
   *
   * The reasons it shares: it is a **pull**, because a queue is `O(orders)` to
   * walk and nobody reads it from the Rooms tab; it rides the **refresh cadence
   * corrected in `roomNeedsReader`'s header above** (this said "counts cadence",
   * and #718 measured that the clock heartbeat is what binds it), because an
   * order finishing changes the queue without moving a
   * single figure on the status strip, so a readout refreshed only when
   * something was ordered would go stale in exactly the case the player is
   * watching; and it is asked for **only while the Build tab is showing**.
   *
   * The difference: this readout carries **order ids**, and a control on the
   * panel turns one of them into a `CancelBuildOrder`. That command has had a
   * handler and a complete implementation behind it since #16 and no producer at
   * all, and the reason was this reader's absence rather than the control's --
   * `src/simulation/protocol/commands.ts` says so in terms while arguing that
   * `RemoveObject` names a tile: an order id is something "nothing on screen
   * shows and no snapshot carries". It does now.
   *
   * `buildableLabelKey` is handed over rather than duplicated: what a buildable
   * is *called* is this file's answer already (the registry carries an English
   * `name` and no key -- `docs/HUD_PROJECTIONS.md` gap 32), and neither the
   * projection nor the HUD may hold it.
   */
  const buildQueueReader =
    client === undefined
      ? undefined
      : new BuildQueueReader(client, (definitionId) => {
          const definition = BUILDABLE_REGISTRY.get(definitionId);
          return definition === undefined ? undefined : buildableLabelKey(definition);
        });
  /*
   * Where the arrivals are, on the same three terms as the two readouts above
   * and closing the same shape of gap one panel over (#104's channel, third
   * consumer).
   *
   * The terms it shares: it is a **pull**, because nobody reads the intake
   * pipeline from the Build tab; it rides the **refresh cadence corrected in
   * `roomNeedsReader`'s header above** (this said "counts cadence"), because a
   * stage advances on an intake tick without moving a single figure on the
   * strip -- the population count is identical before and after an arrival
   * finally gets a cell -- so a readout refreshed only when somebody was
   * admitted would go stale in exactly the case the player is waiting on; and
   * it is asked for **only while the Overview tab is showing**, which is the tab
   * the Intake panel lives on.
   *
   * The difference: this one is about people the player has *already* admitted.
   * `AdmitPrisoner` is refused when no room could ever house the arrival, and
   * that refusal already reaches the band -- what had no surface at all was the
   * accepted admission that then waits, which is what a zoned cell with no bed
   * in it produces (ADR 0028 decision 8).
   */
  const intakePipelineReader = client === undefined ? undefined : new IntakePipelineReader(client);
  /*
   * What has been bought and has not arrived, on the same three terms as the
   * three readouts above -- a pull, on the refresh cadence corrected in
   * `roomNeedsReader`'s header above, only while the Build tab is showing -- and closing the last unreachable credit path in the
   * economy (#285).
   *
   * The difference is what it makes reachable. `ProcurementSystem.cancel`
   * refunds the recorded price of a delivery that has not landed, exactly, and
   * `grep -rn "procurement\.cancel" src/` found **nothing**: the only caller in
   * the repository was a test, so money spent on a delivery a player had
   * changed their mind about could not be recovered by any means the interface
   * offered. A purchase id is minted here, sent, and then forgotten by this
   * thread -- so, exactly as with a build order id, the missing piece was a read
   * model rather than a button.
   *
   * The item-name lookup is handed over rather than duplicated, for the reason
   * `buildableLabelKey` is: an item's `nameKey` is content this file already
   * reads (`purchasableMaterialFor` above), and neither the projection nor the
   * HUD may hold it.
   */
  const pendingDeliveriesReader =
    client === undefined
      ? undefined
      : new PendingDeliveriesReader(client, (itemId) => defaultItemRegistry.getById(itemId)?.nameKey);
  /**
   * The fifth reader on #104's channel, and the third whose subject is a
   * *command* rather than a readout (ADR 0034).
   *
   * What it makes reachable is `GuardRoster.unassign` for a guard something is
   * holding. Every caller of it in `src/` sits inside the system that made the
   * claim, and each of those only ever fires when that system decides the claim
   * is over -- so a claim whose owner had lost track of it was permanent, which
   * is what ADR 0033 measured as terminal and what its open question 3 says will
   * recur. A guard id is not minted on this thread at all, and it never reached
   * it: `hud/staff` was catalogued and unread, and would not have been enough
   * anyway, because a row saying "On Search" cannot say *which* of the two
   * claimants holds the guard.
   *
   * The staff-role lookup is handed over rather than duplicated, for the reason
   * the item lookup above is: a role's `nameKey` is content this file already
   * reads (`defaultStaffRoleRegistry`, at the hire pre-flight), and neither the
   * projection nor the HUD may hold it.
   */
  const heldGuardsReader =
    client === undefined
      ? undefined
      : new HeldGuardsReader(client, (staffRoleId) => defaultStaffRoleRegistry.getById(staffRoleId)?.nameKey);
  /**
   * The roster behind `DismissStaff` (issue #533).
   *
   * A second reader on `hud/staff` beside `staffCoverageReader` below, and two
   * readers on one projection is worth a sentence rather than a shrug: they ask
   * for different things. The coverage reader asks with `limit: 0` -- totals and
   * no rows -- and this one asks for the panel's row budget. Merging them would
   * mean one request whose window is whichever of the two blocks happens to want
   * more, published to a block that cannot use it, and it would tie a warning
   * readout's cadence to a control list's.
   *
   * The staff-role lookup is handed over rather than duplicated, exactly as
   * `heldGuardsReader`'s is and for the same reason: a role's `nameKey` is
   * content this file already reads, and neither the projection nor the HUD may
   * read it.
   */
  const staffRosterReader =
    client === undefined
      ? undefined
      : new StaffRosterReader(client, (staffRoleId) => defaultStaffRoleRegistry.getById(staffRoleId)?.nameKey);
  /**
   * The sixth reader on #104's channel, and the first whose subject is a
   * *warning* rather than a readout or a control
   * ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)
   * consequence 1).
   *
   * What it makes visible is the requirement ADR 0048 decision 3 put on the
   * derived sector: one guard per eight prisoners standing on owned land, as a
   * floor over whatever the `DeploymentSchedule` authored. That number moves
   * from 1 to 2 on the tick the ninth prisoner is admitted -- measured, in a
   * prison built through the real command path -- and until this reader it
   * reached nothing. `hud/staff` was catalogued and unread; `HeldGuardsReader`
   * above says so in its own header, having needed more than this projection
   * could give it. This block needs exactly what it gives.
   *
   * No lookup is handed over, unlike the two readers above it: the block renders
   * three integers and three message keys of the HUD's own, so there is no
   * content name for the composition root to resolve.
   */
  const staffCoverageReader = client === undefined ? undefined : new StaffCoverageReader(client);

  /**
   * The seventh and eighth readers on #104's channel, and the first two whose
   * subject is the prison's *inhabitants* rather than its building, its money
   * or its staff (issue #451).
   *
   * They are constructed as a pair because they answer one question between
   * them and neither answers it alone. `hud/status-strip` says what each
   * classification group's day allows at this tick; `hud/prisoner-roster` says
   * who is in each group and what they are doing. #450 spent ~4,200 lines
   * making a prison capable of going wrong -- an incident writes a
   * disciplinary record, `ClassificationReviewSystem` rewrites the prisoner's
   * tier and group from it, and `ActionSystem` puts them on a different
   * timetable -- and the whole of what reached the player from that chain was
   * `activeIncidents`, one integer on one stat tile. Both routes were
   * catalogued and read by nothing in `src/`.
   *
   * No lookup is handed to either, unlike the room and delivery readers: every
   * word on either block is a message key derived from an id the simulation
   * published, and `src/content/simulation-message-keys.ts` is where those ids
   * are labelled. There is no content catalogue entry for the composition root
   * to resolve.
   */
  const prisonerRosterReader = client === undefined ? undefined : new PrisonerRosterReader(client);
  const regimeReader = client === undefined ? undefined : new RegimeReader(client);
  let activeTab: HudTabId = INITIAL_HUD_SHELL_STATE.activeTab;

  /**
   * Puts a readout on the view model, or takes it off.
   *
   * Absent has to be an absent *property* and not a present one holding
   * `undefined` (`exactOptionalPropertyTypes` is on), which is the same dance
   * the zoning notice does in the listener below -- and it matters for the same
   * reason: "nothing has asked" and "the simulation says every room is
   * finished" are different facts, and only the second is a statement about the
   * prison.
   */
  const applyRoomNeeds = (next: HudRoomNeedsViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.roomNeeds === undefined) return;
      const { roomNeeds: _cleared, ...withoutRoomNeeds } = viewModel;
      viewModel = withoutRoomNeeds;
    } else {
      viewModel = { ...viewModel, roomNeeds: next };
    }
    hud?.update(viewModel);
  };

  /**
   * Puts the queue on the view model, or takes it off. The same absent-property
   * dance `applyRoomNeeds` does, and for the same reason: "nothing has asked"
   * and "nothing is queued" are different facts, and only the second is a
   * statement about the prison.
   */
  const applyBuildQueue = (next: HudBuildQueueViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.buildQueue === undefined) return;
      const { buildQueue: _cleared, ...withoutBuildQueue } = viewModel;
      viewModel = withoutBuildQueue;
    } else {
      viewModel = { ...viewModel, buildQueue: next };
    }
    hud?.update(viewModel);
  };

  const refreshBuildQueue = (): void => {
    if (buildQueueReader === undefined || activeTab !== 'build') return;
    void buildQueueReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyBuildQueue(next);
      })
      // A refusal, a timeout, or a worker that went away. The block comes off
      // rather than staying, and it matters more here than for the room readout:
      // every row is a control aimed at an order id, and a row nothing is
      // answering for is a button pointed at a prison that may not exist. The
      // failure reaches no control, because the player pressed nothing.
      .catch(() => applyBuildQueue(undefined));
  };

  /**
   * Puts the deliveries on the view model, or takes them off. The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "no money is in transit" are different facts, and only the second
   * is a statement about the prison.
   */
  const applyPendingDeliveries = (next: HudPendingDeliveriesViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.pendingDeliveries === undefined) return;
      const { pendingDeliveries: _cleared, ...withoutPendingDeliveries } = viewModel;
      viewModel = withoutPendingDeliveries;
    } else {
      viewModel = { ...viewModel, pendingDeliveries: next };
    }
    hud?.update(viewModel);
  };

  const refreshPendingDeliveries = (): void => {
    if (pendingDeliveriesReader === undefined || activeTab !== 'build') return;
    void pendingDeliveriesReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyPendingDeliveries(next);
      })
      // A refusal, a timeout, or a worker that went away. The block comes off
      // rather than staying, for the reason the queue's does and with money at
      // stake: every row is a control promising a refund, and a row nothing is
      // answering for is a promise about a treasury that may not exist. The
      // failure reaches no control, because the player pressed nothing.
      .catch(() => applyPendingDeliveries(undefined));
  };

  /**
   * Puts the held guards on the view model, or takes them off. The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "nobody is assigned" are different facts, and only the second is
   * a statement about the prison.
   */
  const applyHeldGuards = (next: HudHeldGuardsViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.heldGuards === undefined) return;
      const { heldGuards: _cleared, ...withoutHeldGuards } = viewModel;
      viewModel = withoutHeldGuards;
    } else {
      viewModel = { ...viewModel, heldGuards: next };
    }
    hud?.update(viewModel);
  };

  /**
   * Puts the roster on the view model, or takes it off (issue #533). The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "nobody is hired" are different facts, and only the second is a
   * statement about the prison.
   */
  const applyStaffRoster = (next: HudStaffRosterViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.staffRoster === undefined) return;
      const { staffRoster: _cleared, ...withoutStaffRoster } = viewModel;
      viewModel = withoutStaffRoster;
    } else {
      viewModel = { ...viewModel, staffRoster: next };
    }
    hud?.update(viewModel);
  };

  const refreshStaffRoster = (): void => {
    if (staffRosterReader === undefined || activeTab !== 'security') return;
    void staffRosterReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer.
        if (next !== undefined) applyStaffRoster(next);
      })
      // The section comes off rather than staying, for the held list's reason
      // and more sharply: every row is a control that *destroys* somebody, so a
      // row nothing is answering for is the worst kind of stale button.
      .catch(() => applyStaffRoster(undefined));
  };

  const refreshHeldGuards = (): void => {
    if (heldGuardsReader === undefined || activeTab !== 'security') return;
    void heldGuardsReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyHeldGuards(next);
      })
      // A refusal, a timeout, or a worker that went away. The section comes off
      // rather than staying, for the reason the deliveries do: every row is a
      // control aimed at a guard id, and a row nothing is answering for is a
      // button pointed at a roster that may not exist. The failure reaches no
      // control, because the player pressed nothing.
      .catch(() => applyHeldGuards(undefined));
  };

  /**
   * Puts the coverage figures on the view model, or takes them off. The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "the prison has the guards it asks for" are different facts, and
   * only the second is a statement about the prison (ADR 0048).
   */
  const applyStaffCoverage = (next: HudStaffCoverageViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.staffCoverage === undefined) return;
      const { staffCoverage: _cleared, ...withoutStaffCoverage } = viewModel;
      viewModel = withoutStaffCoverage;
    } else {
      viewModel = { ...viewModel, staffCoverage: next };
    }
    hud?.update(viewModel);
  };

  const refreshStaffCoverage = (): void => {
    if (staffCoverageReader === undefined || activeTab !== 'security') return;
    void staffCoverageReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyStaffCoverage(next);
      })
      // A refusal, a timeout, or a worker that went away. The block comes off
      // rather than staying, for the reason the readouts above do and with a
      // sharper edge than most: it is a *warning*, and a warning nothing is
      // answering for is worse than no warning -- a green "Covered" left
      // standing over a prison that stopped reporting would be the class of lie
      // this layer exists to avoid. The failure reaches no control, because the
      // player pressed nothing.
      .catch(() => applyStaffCoverage(undefined));
  };

  /**
   * Puts the timetable on the view model, or takes it off. The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "this prison runs a regime" are different facts, and only the
   * second is a statement about the prison (issue #451).
   */
  const applyRegime = (next: HudRegimeViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.regime === undefined) return;
      const { regime: _cleared, ...withoutRegime } = viewModel;
      viewModel = withoutRegime;
    } else {
      viewModel = { ...viewModel, regime: next };
    }
    hud?.update(viewModel);
  };

  const refreshRegime = (): void => {
    if (regimeReader === undefined || activeTab !== 'regime') return;
    void regimeReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyRegime(next);
      })
      // A refusal, a timeout, or a worker that went away. The block comes off
      // rather than staying: a timetable naming what the prison permits right
      // now, with nothing still answering for it, is the class of lie this
      // layer exists to avoid. The failure reaches no control, because the
      // player pressed nothing.
      .catch(() => applyRegime(undefined));
  };

  /**
   * Puts the roster on the view model, or takes it off. The same
   * absent-property dance the others do, and for the same reason: "nothing has
   * asked" and "this prison holds nobody" are different facts, and only the
   * second is a statement about the prison (issue #451).
   */
  const applyPrisonerRoster = (next: HudPrisonerRosterViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.prisonerRoster === undefined) return;
      const { prisonerRoster: _cleared, ...withoutRoster } = viewModel;
      viewModel = withoutRoster;
    } else {
      viewModel = { ...viewModel, prisonerRoster: next };
    }
    hud?.update(viewModel);
  };

  const refreshPrisonerRoster = (): void => {
    if (prisonerRosterReader === undefined || activeTab !== 'regime') return;
    void prisonerRosterReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyPrisonerRoster(next);
      })
      // A refusal, a timeout, or a worker that went away. The block comes off
      // rather than staying, and it matters here for a reason the readouts
      // above share: every row names a person by name, and a list of people
      // nothing is still answering for is a claim about who is in the prison.
      // The failure reaches no control, because the player pressed nothing.
      .catch(() => applyPrisonerRoster(undefined));
  };

  const refreshRoomNeeds = (): void => {
    if (roomNeedsReader === undefined || activeTab !== 'rooms') return;
    void roomNeedsReader
      .read()
      .then((next) => {
        // `undefined` here is "a read was already in flight", not an answer, so
        // it must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyRoomNeeds(next);
      })
      // A refusal, a timeout, or a worker that went away. The readout comes off
      // rather than staying: a sentence about what a room needs, with nothing
      // still answering for it, is the class of lie this layer exists to avoid.
      // The failure itself reaches no control, and that is deliberate -- the
      // player pressed nothing, so there is nothing to mark and no refusal to
      // report, which is the line `refusalMessageKey` already draws for chrome.
      .catch(() => applyRoomNeeds(undefined));
  };

  /**
   * Puts the pipeline on the view model, or takes it off. The same
   * absent-property dance the two above do, and for the same reason: "nothing
   * has asked" and "every arrival has been dealt with" are different facts, and
   * only the second is a statement about the prison.
   */
  const applyIntakePipeline = (next: HudIntakePipelineViewModel | undefined): void => {
    if (next === undefined) {
      if (viewModel.intakePipeline === undefined) return;
      const { intakePipeline: _cleared, ...withoutPipeline } = viewModel;
      viewModel = withoutPipeline;
    } else {
      viewModel = { ...viewModel, intakePipeline: next };
    }
    hud?.update(viewModel);
  };

  const refreshIntakePipeline = (): void => {
    if (intakePipelineReader === undefined || activeTab !== 'overview') return;
    void intakePipelineReader
      .read()
      .then((next) => {
        // `undefined` is "a read was already in flight", not an answer, so it
        // must leave what is on screen alone rather than blanking it.
        if (next !== undefined) applyIntakePipeline(next);
      })
      // A refusal, a timeout, or a worker that went away. The readout comes off
      // rather than staying: a line saying somebody is waiting for a cell, with
      // nothing still answering for them, is the class of lie this layer exists
      // to avoid. The failure reaches no control, because the player pressed
      // nothing.
      .catch(() => applyIntakePipeline(undefined));
  };

  /**
   * Repaints the HUD from what the worker last said, and from nothing else.
   *
   * Day, position within the day, mode and speed all come out of a
   * `simulation/ready` or `simulation/clock-state` message; the prisoner,
   * staff, room, incident and contraband counts, and the last thing the
   * simulation refused, both come out of a `simulation/status-counts` one.
   * The worker publishes them unprompted while a session exists (ADR 0003's
   * "unsolicited ... do not pretend to be request responses"), which is what
   * makes the readouts move without this thread ever counting anything of its
   * own. With no worker, no session, or a stopped one, the clock reads
   * unknown, the counts read empty and the alerts list is empty -- see
   * `EMPTY_HUD_VIEW_MODEL`.
   *
   * **This line is what the alerts list is for.** The list, its severity
   * badges, its folding section, its empty-state row and the insertion
   * ordering `tests/browser/ui-shell.spec.ts` measures are all implemented
   * and tested -- and between #220 and #261 the only assignment to
   * `HudViewModel.alerts` anywhere in `src/` was the literal `[]` in
   * `EMPTY_HUD_VIEW_MODEL`. (#220 moved the one message that had ever been
   * routed there, "simulation unavailable", to `.hud__unavailable`; see
   * `SIMULATION_UNAVAILABLE_NOTICE` above for why.) So a command the worker
   * accepted and the simulation then refused on its content -- a wall on
   * unowned land, a purchase the treasury cannot cover, a room zoned over one
   * already there -- reached this thread and was thrown away.
   * `hudAlertsFromWorkerMessage` is the mapping and this line is the only
   * thing that calls it, which is why
   * `tests/foundation/composition-root-contract.test.ts` pins it.
   *
   * It is handed the list it is updating, exactly as the clock translator is
   * handed the clock it is updating, because the alerts list has had two
   * producers since #187: a refusal the simulation decided, and an
   * uncorrelated `protocol/error` that nothing else on this thread reads. The
   * two arrive on separate messages and neither may erase the other -- and a
   * status-counts publication arrives up to twice a second, so a fault row
   * that did not survive one would be painted over within 500 ms, which the
   * player cannot tell apart from the swallowing #187 finding 3 reported.
   *
   * **And the list is where the player was not looking.** #261 joined the
   * seam; it did not make the sentence visible. `hud.css` drops `.hud__corner`
   * at 720px and below and the alerts section starts folded at every size, so
   * the row it paints is `offsetParent === null` with a 0x0 box unless the
   * player is on a wide viewport *and* has opened the fold -- the same
   * measurement #220 made before moving "simulation unavailable" to
   * `.hud__unavailable`, and it was never made per message. So the refusal is
   * read a second time, for `HudViewModel.refusal` and the band that carries
   * it. The list stays: it is the log, and it holds the refusal beside
   * standing protocol faults, which one line cannot.
   *
   * **The measurement in that paragraph expired on 2026-08-31 (#703, rulings 1
   * and 5)**: the corner is no longer dropped below 720px, the section starts
   * open, and the list scrolls instead of clipping, so the row it paints is
   * laid out and reachable without a wide viewport or a press. **The second
   * reading is kept**, and the reason is the sentence that closes the paragraph
   * rather than the one that opens it: the list is the log and one line cannot
   * hold a refusal beside standing protocol faults. #701 then measured the
   * other half of the same argument from the band's side -- two sentences on
   * one tick, newest wins -- so neither surface subsumes the other.
   *
   * One listener for all four, because they land on one view model: a
   * message that says nothing about any of them leaves the HUD alone rather
   * than triggering a repaint.
   */
  client?.addListener((message) => {
    const clock = hudClockFromWorkerMessage(message, viewModel.clock);
    const counts = hudCountsFromWorkerMessage(message);
    const alerts = hudAlertsFromWorkerMessage(message, viewModel.alerts);
    const zoning = hudZoningFromWorkerMessage(message);
    // The same refusal, read a second time for the surface that is actually
    // on screen. The list above is the log; this is the notice, and it goes
    // to a band `hud.css` lays out at every viewport with no section to
    // open -- which the list is not, at any viewport (#220, and see
    // `hudRefusalFromWorkerMessage` for the split).
    const refusal = hudRefusalFromWorkerMessage(message);
    /*
     * The events channel (issue #507), read on the same two surfaces the
     * refusal is and in the same order: the log first, then the notice.
     *
     * `alerts` above and `eventAlerts` here are two producers of one list, so
     * this one is threaded through the *result* of that one rather than through
     * `viewModel.alerts` -- otherwise a `simulation/stopped`, which both
     * translate, would have the second overwrite the first's emptying with a
     * list rebuilt from the stale field. `hudEventAlertsFromWorkerMessage`
     * answers `undefined` for every message but `simulation/event`, so on all
     * other messages this is exactly `alerts`.
     */
    const eventAlerts = hudEventAlertsFromWorkerMessage(
      message,
      alerts ?? viewModel.alerts,
      // How long an in-game day is, so a row can say **when** it happened (the
      // owner's decision 2 of 2026-09-01 on ADR 0084). Read from this
      // message's own clock where it carried one, and from the view model
      // otherwise, for the reason the list itself is threaded through `alerts`
      // above: the freshest value this thread has, never a second copy of it.
      // `0` is `UNKNOWN_HUD_CLOCK`'s "no session has reported a clock", and a
      // row built then carries no time rather than a fabricated day.
      (clock ?? viewModel.clock).dayLengthTicks,
    );
    // The same event, read a second time for the surface that is actually on
    // screen. The list is the log; this is the notice, and it goes to a band
    // laid out at every viewport with no section to open -- which the alerts
    // list is not, at any viewport (#220).
    const event = hudEventNoticeFromWorkerMessage(message);
    const nextAlerts = eventAlerts ?? alerts;
    if (
      clock === undefined &&
      counts === undefined &&
      nextAlerts === undefined &&
      zoning === undefined &&
      refusal === undefined &&
      event === undefined
    )
      return;
    viewModel = {
      ...viewModel,
      ...(clock === undefined ? {} : { clock }),
      ...(counts === undefined ? {} : { counts }),
      ...(nextAlerts === undefined ? {} : { alerts: nextAlerts }),
      // Three states, not two, which is why the translator returns `'none'`
      // rather than `undefined` for "no room has been designated": `undefined`
      // means this message said nothing about zoning and the field must be left
      // alone, while `'none'` is a message that did say so. Collapsing them
      // would leave a readout from an ended session on screen.
      //
      // `zoning` is an *optional* field, so clearing it has to delete the key
      // rather than set it to `undefined` -- `exactOptionalPropertyTypes` is on.
      ...(zoning === undefined ? {} : zoning === 'none' ? {} : { zoning }),
      // Three states as well, for the reason `zoning` has three: `undefined`
      // is a message that said nothing about a refusal, `'none'` is a session
      // that has refused nothing or has ended, and a notice is the refusal
      // itself. Optional, so clearing it deletes the key below rather than
      // writing `undefined` -- `exactOptionalPropertyTypes` is on.
      ...(refusal === undefined ? {} : refusal === 'none' ? {} : { refusal }),
      // Three states, for the reason `zoning` and `refusal` each have three:
      // `undefined` is a message that said nothing about an event, `'none'` is
      // a session that has ended, and a notice is the event itself. Optional,
      // so clearing it deletes the key below rather than writing `undefined`.
      ...(event === undefined ? {} : event === 'none' ? {} : { event }),
    };
    if (zoning === 'none' && viewModel.zoning !== undefined) {
      const { zoning: _cleared, ...withoutZoning } = viewModel;
      viewModel = withoutZoning;
    }
    if (refusal === 'none' && viewModel.refusal !== undefined) {
      const { refusal: _withdrawn, ...withoutRefusal } = viewModel;
      viewModel = withoutRefusal;
    }
    if (event === 'none' && viewModel.event !== undefined) {
      const { event: _ended, ...withoutEvent } = viewModel;
      viewModel = withoutEvent;
    }
    hud?.update(viewModel);

    // The room readout rides this cadence -- see `roomNeedsReader` above. A
    // stopped session takes it off instead of asking again, for the reason the
    // clock reads unknown and the counts read empty: a statement about a prison
    // that no longer exists is not something the player can act on.
    if (message.kind === 'simulation/stopped') {
      applyRoomNeeds(undefined);
      applyBuildQueue(undefined);
      applyIntakePipeline(undefined);
      applyPendingDeliveries(undefined);
      applyHeldGuards(undefined);
      applyStaffRoster(undefined);
      applyStaffCoverage(undefined);
      applyRegime(undefined);
      applyPrisonerRoster(undefined);
    } else {
      refreshRoomNeeds();
      refreshBuildQueue();
      refreshIntakePipeline();
      refreshPendingDeliveries();
      refreshHeldGuards();
      refreshStaffRoster();
      refreshStaffCoverage();
      refreshRegime();
      refreshPrisonerRoster();
    }
  });

  hud = mountHud(app, {
    localizer,
    viewModel,
    // Passed at mount rather than applied afterwards, because this failure is
    // known before the HUD exists: with no worker there is no snapshot coming
    // and nothing that would ever repaint, so a sentence the HUD only learned
    // about later would not be painted at all (issue #82).
    //
    // It is no longer the *whole* truth about this page, which is why
    // `HudHandle.setUnavailable` exists: a session boundary is a worker
    // boundary since #149, so a construction that succeeds here can fail on a
    // later load, and one that failed here still means this page has no
    // simulation until it is reloaded (nothing retries it -- with no worker
    // the save panel is never mounted, so no session can be started).
    //
    // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
    // is on, so an absent notice has to be an absent property.
    ...(simulationUnavailable ? { unavailable: SIMULATION_UNAVAILABLE_NOTICE } : {}),
    build: buildCatalogue(),
    staff: staffRoster(),
    /*
     * The room catalogue, passed at mount for the reason the buildable one is:
     * it is content rather than session state, and rebuilding the list on every
     * snapshot would drop the selection the player just made. What *is* session
     * state -- what the simulation found about the last room designated --
     * arrives on `HudViewModel.zoning` through the listener above.
     */
    rooms: roomCatalogue(),
    /*
     * The world's build gesture, joined to the HUD's own intent path (#225).
     *
     * This one line is what makes the two ways of laying a wall agree about
     * whether the player is told when the worker refuses: the drag no longer
     * has a route of its own to the command sender, so there is no second
     * path left to forget.
     *
     * Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
     * is on, so an absent tool has to be an absent property.
     */
    ...(tool === undefined ? {} : { worldBuild: tool, editHistory: tool }),
    /*
     * The world's room gesture, joined to the Rooms panel's confirm step (ADR
     * 0022, amended).
     *
     * Unlike the build gesture, a finished rectangle is not dispatched: it
     * becomes the panel's *pending* rectangle, and the intent leaves when the
     * player presses the confirm control. So a refused designation is always
     * reported on a control as well as on the refusal line, which a build drag
     * cannot manage because the player pressed nothing.
     */
    ...(rooms === undefined ? {} : { worldRooms: rooms }),
    /*
     * The world's object gesture (ADR 0028 phase 1), dispatched on release like
     * a build order rather than confirmed like a room designation.
     *
     * The difference is what each one can take back. A designation could not be
     * reversed at all until `UnzoneRoom` existed, so the Rooms panel gates it
     * behind a confirm; a placement writes a construction order, and `Undo`
     * reverses one -- including a completed one, whose object leaves the world
     * with it. So the cheaper gesture is the safe one here.
     */
    ...(objects === undefined ? {} : { worldObjects: objects }),
    onIntent: (intent: HudIntent) => {
      switch (intent.kind) {
        /*
         * Chrome -- the HUD has already applied it locally -- with one half
         * outside the HUD: which tab is showing decides whether the room
         * readout is being refreshed at all.
         *
         * Both directions are needed. Arriving on the Rooms tab asks
         * immediately rather than waiting up to ~300ms in a browser for the
         * next clock heartbeat (this said "500ms for the next counts
         * publication" until #718, then the harness's "255ms" until #765 --
         * see `roomNeedsReader`'s header for both measurements), and leaving
         * it takes the readout off, because from here
         * on nothing is refreshing it. The panel clears its own copy when it is
         * hidden; this clears the view model, or the next publication would put
         * the stale one back.
         */
        case 'select-tab': {
          activeTab = intent.tab;
          if (activeTab === 'rooms') refreshRoomNeeds();
          else applyRoomNeeds(undefined);
          // The build queue is the same arrangement one tab over: arriving asks
          // at once rather than waiting up to ~300ms in a browser for the next
          // clock heartbeat (255ms is the harness figure; see
          // roomNeedsReader's header, #765), and leaving takes the block off,
          // because from here on nothing is refreshing it. The panel clears
          // its own copy when it is hidden; this clears the view model, or the
          // next publication would put the stale one back.
          if (activeTab === 'build') refreshBuildQueue();
          else applyBuildQueue(undefined);
          // And what has been bought and has not arrived, which lives on the
          // same tab and on the same terms (#285).
          if (activeTab === 'build') refreshPendingDeliveries();
          else applyPendingDeliveries(undefined);
          // And which guards are held, on the tab the Staff panel lives on, on
          // exactly the same terms (ADR 0034).
          if (activeTab === 'security') refreshHeldGuards();
          else applyHeldGuards(undefined);
          // And who is on the payroll, on the same tab and the same terms
          // (#533). Arriving asks at once for the coverage block's reason turned
          // round: a player who opened this tab because they are haemorrhaging
          // money must not have to wait up to ~300ms in a browser (255ms is
          // the harness figure; see roomNeedsReader's header, #765) to see the
          // control that stops it.
          if (activeTab === 'security') refreshStaffRoster();
          else applyStaffRoster(undefined);
          // And how many guards the prison asks for against how many it has, on
          // the same tab and the same terms (ADR 0048). Arriving asks at once:
          // waiting up to ~300ms in a browser for the next clock heartbeat
          // (255ms is the harness figure; see roomNeedsReader's header, #765)
          // would mean a player who opened this tab *because* they suspected
          // they were short sees an empty block first.
          if (activeTab === 'security') refreshStaffCoverage();
          else applyStaffCoverage(undefined);
          // And the intake readout on the tab the Intake panel lives on, on
          // the same terms as both: arriving asks at once rather than waiting
          // up to ~300ms in a browser for the next clock heartbeat (255ms is
          // the harness figure; see roomNeedsReader's header, #765), and
          // leaving takes the block off, because from here on nothing is
          // refreshing it.
          if (activeTab === 'overview') refreshIntakePipeline();
          else applyIntakePipeline(undefined);
          // And the two readouts on the fifth tab, on the same terms as every
          // one above (issue #451). Arriving asks at once rather than waiting
          // up to ~300ms in a browser for the next clock heartbeat (255ms is
          // the harness figure; see roomNeedsReader's header, #765), because
          // this tab is the one a player opens to look at somebody in
          // particular and an empty panel is indistinguishable from a prison
          // holding nobody.
          if (activeTab === 'regime') refreshRegime();
          else applyRegime(undefined);
          if (activeTab === 'regime') refreshPrisonerRoster();
          else applyPrisonerRoster(undefined);
          return;
        }

        // Chrome: the HUD has already applied it locally and there is nothing
        // for a host to do.
        case 'toggle-panel':
          return;

        case 'arm-build-tool': {
          /*
           * Also chrome, but it has a second half outside the HUD: it decides
           * whether a click on the *world* builds or moves the camera -- and,
           * since ADR 0028 phase 1, *which of two tools* it hands the pointer
           * to.
           *
           * One control, two tools, and the row decides. A buildable that names
           * an object arms the object tool with that object's footprint; every
           * other row arms the build tool. The other tool is disarmed in the
           * same call rather than left holding the pointer, which is what makes
           * the scene's three-way arbitration a formality instead of a
           * tie-break: switching from `wall-brick` to `bed-wooden` while armed
           * changes the gesture rather than layering a second one under it.
           *
           * `definitionId` is optional on the intent -- the panel omits it when
           * disarming -- so a bare disarm turns both tools off and neither
           * forgets its selection: each tool keeps the last one it was given,
           * exactly as `BuildTool.setArmed` always has.
           */
          if (intent.removing) {
            // Removal is the object tool's, whatever row is selected, and it
            // needs no footprint: a removal names no object type -- what goes is
            // whatever the player pressed on -- so `ObjectTool.setArmed` arms on
            // the mode alone and draws a one-tile ghost. The build tool is
            // disarmed in the same call, so a player who armed a wall and then
            // pressed Remove gets one gesture rather than two layered ones.
            //
            // There is no wall removal behind this and the control does not
            // claim one: `hud.build.remove-hint` says "any tile of an object".
            // Taking a *wall* down is `Undo` for a finished one, and -- since the
            // Build panel's queue block -- a press on its row for one that is
            // still queued, which is a per-order control the panel now has.
            tool?.setArmed(false);
            objects?.setArmed(intent.armed, { removing: true });
            return;
          }

          const footprint = intent.definitionId === undefined ? undefined : objectFootprintOf(intent.definitionId);
          if (footprint !== undefined && intent.definitionId !== undefined) {
            tool?.setArmed(false);
            objects?.setArmed(intent.armed, { definitionId: intent.definitionId, footprint, removing: false });
            return;
          }
          objects?.setArmed(false, { removing: false });
          tool?.setArmed(intent.armed, intent.definitionId);
          return;
        }

        case 'arm-room-tool':
          // The same, one tool over. Arming the room tool does *not* disarm the
          // build tool here, and it does not need to: the two panels are on
          // different tabs and `setVisible(false)` disarms the panel's tool as
          // it leaves, so at most one is ever armed. The scene also asks the
          // build tool first, so even a caller that armed both by hand gets one
          // defined answer rather than an interleaved gesture.
          //
          // Spread rather than passed as `undefined`, because
          // `exactOptionalPropertyTypes` is on and `roomId` is optional: a
          // removal names no room type, so "no room selected" has to be an
          // absent property.
          rooms?.setArmed(intent.armed, {
            ...(intent.roomId === undefined ? {} : { roomId: intent.roomId }),
            removing: intent.removing,
          });
          return;

        case 'set-clock':
          // Throwing when there is no session surfaces on the transport
          // control through the HUD's own error path. Silently returning
          // would be worse -- a pause button that reports success and does
          // nothing is a lie the player has no way to detect.
          requireSimulation(commands).setClock(
            intent.mode === 'paused' ? { mode: 'paused' } : { mode: 'running', speed: intent.speed },
          );
          return;

        /*
         * Undo, and the reason it was worth wiring a key for (#261).
         *
         * `ConstructionSystem` has kept a transaction-grouped, snapshot-safe
         * undo model since #108, `Undo` and `Redo` have been declared commands
         * with handler branches since then, and **nothing in the application
         * could produce one**: no control, no binding, no intent. The stack
         * could be pushed and never popped.
         *
         * Payload-free by protocol: `undoCommandSchema` is `{ type: 'Undo' }`
         * and the simulation owns which transaction that reverses. So there is
         * no id to mint here and, unlike a build order, nothing to loop over --
         * one press is one command, whatever the gesture it takes back covered.
         * That grouping is the `transactionId` minted below, which is why a
         * twelve-segment wall undoes as one wall.
         *
         * `requireSimulation` throws with no worker and `submit` throws with no
         * session, and both reach the player: the HUD dispatched this and
         * paints its refusal line. That is the whole reason the key routes
         * through the HUD rather than reaching the sender from the renderer.
         */
        case 'undo':
          requireSimulation(commands).submit({ type: 'Undo' });
          return;

        case 'redo':
          requireSimulation(commands).submit({ type: 'Redo' });
          return;

        /*
         * The `CancelBuildOrder` producer, and the last one this repository was
         * missing.
         *
         * `tests/foundation/unconsumed-command-contract.test.ts` had held this
         * command's entry since it was written: handled at
         * `construction/handler.ts`, reachable from
         * `ConstructionSystem.cancelOrder`, constructed by nothing in `src/`. The
         * reason was never the handler and never the control -- it was that no
         * order *id* reached this thread, so no control could name one, and a
         * "cancel" that named nothing would have been a worse `Undo`. The
         * build-queue projection carries the ids; the Build panel's queue block
         * draws one row per id; and this line is what turns a press on a row into
         * the command.
         *
         * **No id minted here**, which makes this the only construction dispatch
         * in this file that mints nothing: `place-build-order`, `place-object`
         * and `purchase-materials` all invent an identifier because they are
         * creating a record, and this one names a record that already exists.
         * The id came out of the simulation, through the projection, onto the
         * view model, onto the row, and back -- unchanged, which is the whole
         * contract of a stable id (ADR 0011).
         *
         * **No pre-check.** `purchase-materials` refuses a total the last
         * reported balance cannot cover, because spending money the player does
         * not have is a refusal this thread can decide honestly. Whether an order
         * still exists is not: the queue on screen is a snapshot on a cadence, so
         * an order can finish between the publication and the press, and this
         * thread's copy is exactly the stale authority that must not be allowed
         * to decide. The simulation decides, and it is idempotent about it --
         * `createConstructionCommandHandler` swallows the throw from an id that
         * names nothing, deliberately and with a comment saying so. The next
         * publication then shows the queue as it really is.
         */
        case 'cancel-build-order':
          requireSimulation(commands).submit({ type: 'CancelBuildOrder', orderId: intent.orderId });
          return;

        /*
         * The producer #285 was missing, and the one that makes an existing
         * credit path reachable rather than adding a new one.
         *
         * `ProcurementSystem.cancel` refunds the *recorded* `paidMinorUnits` of a
         * delivery that has not landed -- so the buy-low-cancel-high trade is
         * closed before it exists -- and it had no caller in `src/` at all. It is
         * the only thing in the economy that credits the treasury besides the
         * state's income line, and until this line existed no session could
         * produce that credit.
         *
         * **No id minted here**, which makes this the second dispatch in this
         * file that mints nothing (`cancel-build-order` is the other). The id was
         * minted by `purchase-materials` below, went out on the command, came
         * back on `hud/pending-deliveries`, onto a row, and returns unchanged.
         *
         * **No pre-check**, unlike the purchase this reverses. Whether the money
         * can be spent is a question about a balance the worker published and
         * this thread can answer honestly; whether a delivery is still in flight
         * is not -- the list on screen is a projection on a cadence, so a
         * delivery can land in the half-second before the press. The simulation
         * decides, and it *refuses* rather than swallowing: a cancellation that
         * refunded nothing while the player watched the balance not move is the
         * silent failure this repository treats as a real bug, so
         * `session-commands.ts` records `cancel-purchase.not-pending` and the
         * alerts list says so.
         */
        case 'cancel-material-purchase':
          requireSimulation(commands).submit({ type: 'CancelMaterialPurchase', orderId: intent.orderId });
          return;

        /*
         * The producer ADR 0033's open question 3 asks for (ADR 0034), and the
         * third dispatch in this file that mints nothing.
         *
         * What it makes reachable is `GuardRoster.unassign` for a guard
         * something is holding. Every caller of it in `src/` sits inside the
         * system that made the claim, and each of those only fires when that
         * system decides the claim is over -- so a claim whose owner had lost
         * track of it was permanent, which is exactly what issue #352 was, and
         * ADR 0033 says the next resource-claiming system will have the same bug
         * for the same reason. The id was never minted on this thread at all: it
         * is a staff `EntityId`, allocated by `EntityStore.spawn` inside the
         * simulation, and it reaches here on `hud/held-guards`.
         *
         * **No claim on the wire**, and that is the shape rather than an
         * omission. The row says what is holding the guard so a player can
         * decide; the command does not send it back, because `'on-search'` is a
         * *shared* deployment phase and telling a responder from a searcher
         * needs both claimants asked live inside the simulation at the tick the
         * release runs (ADR 0033 decision 4). A claim chosen here would be this
         * thread guessing from a cadence-old projection.
         *
         * **No pre-check**, for `cancel-material-purchase`'s reason with a
         * person instead of money: whether a guard is still held, and by what, is
         * not something this thread's stale copy of the roster may decide. And
         * the simulation *refuses* rather than swallowing -- a Release that
         * silently did nothing is the failure #82 and #207 are about -- so
         * `session-commands.ts` records `release-guard.not-held` and the alerts
         * list says so.
         */
        case 'release-guard':
          requireSimulation(commands).submit({ type: 'ReleaseGuardAssignment', guardId: intent.guardId });
          return;

        /*
         * The way off the payroll (issue #533, the owner's decision on issue
         * #535 decision 4).
         *
         * The counterpart of `hire-staff` rather than of `release-guard`, and
         * the difference is what a player gets out of it: a release hands a
         * guard back to the pool and `DeploymentSystem` may post them again on
         * its next cycle, while this ends the employment and with it the wage
         * `PayrollSystem` bills at every in-game day boundary. Before this line,
         * **nothing in the application could end one** -- `staff/hiring.ts` said
         * so in its own words, and the measured consequence was a prison spent
         * down to nothing by guards it had no use for.
         *
         * The id was never minted on this thread: it is a staff `EntityId`
         * allocated by `EntityStore.spawn` inside the simulation, and it reaches
         * here on `hud/staff` -- which had been catalogued and unread for the
         * whole of `HeldGuardsReader`'s life, because the held subset is the
         * wrong subset for this command. A guard nobody has posted is not held,
         * and a guard nobody has posted is exactly the one a player wants rid
         * of.
         *
         * **No pre-check**, for `release-guard`'s reason with a person instead
         * of a claim: whether the roster still holds this id is not something
         * this thread's cadence-old copy may decide. The simulation refuses
         * rather than swallowing -- `session-commands.ts` records
         * `dismiss.unknown-staff` and the alerts list says so.
         */
        case 'dismiss-staff':
          requireSimulation(commands).submit({ type: 'DismissStaff', staffId: intent.staffId });
          return;

        /*
         * The player has read a row of the alerts log (the owner's decision 3
         * of 2026-09-01 on
         * [ADR 0084](../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
         *
         * **Two writes, and neither is the other's copy.** The row leaves the
         * list here, which is what the player sees happen; the command is what
         * makes it still gone after a reload, because the log is in the save
         * (decision 4) and a dismissal only this thread knew about would be
         * undone by the next load. `src/ui/simulation-events.ts` states the
         * division at both functions.
         *
         * **The two ordinals are read off the row rather than carried on the
         * intent**: the HUD paints rows and does not know that a row stands for
         * a run of arrivals, and `alertRowDismissal` is the one place that
         * mapping lives. It answers `undefined` for a row that carries no run
         * -- the refusal and protocol-fault rows -- and then nothing is sent
         * and nothing is removed, which is `docs/HUD_PROJECTIONS.md` gap 34
         * staying shut rather than a swallowed gesture.
         *
         * **`requireSimulation` is deliberately not used**, unlike every
         * command above. A dismissal with no session to send to is not a failed
         * command: the row goes off this thread's list, and there is no session
         * for it to have survived into. Throwing here would paint
         * `hud.refusal.*` for a gesture that did exactly what the player asked.
         */
        case 'dismiss-alert': {
          const dismissal = alertRowDismissal(viewModel.alerts, intent.rowId);
          if (dismissal === undefined) return;
          viewModel = { ...viewModel, alerts: hudAlertsWithoutRow(viewModel.alerts, intent.rowId) };
          hud?.update(viewModel);
          commands?.submit({ type: 'DismissAlert', ...dismissal });
          return;
        }

        case 'place-build-order': {
          const sender = requireSimulation(commands);
          /*
           * One gesture, one transaction (`src/ui/build-tool.ts`).
           *
           * One id per *intent*, and an intent is one gesture however many
           * edges it covered -- so a twelve-segment wall dragged along the
           * world undoes as one wall rather than as twelve taps on undo,
           * which is what `ConstructionSystem.registerTransactionOrder`
           * groups by.
           *
           * The numeric route now carries one too, where it previously sent
           * none. That is a deliberate consequence and not a side effect:
           * `registerTransactionOrder` compares the incoming id with the open
           * gesture's, and `undefined === undefined` is a match -- so two
           * *Place order* presses minutes apart used to join one undo step,
           * an accidental grouping that followed from the absence of an id
           * rather than from anything anyone chose. Each press is one gesture
           * and is now one transaction.
           */
          const transactionId = `build-${crypto.randomUUID()}`;
          for (const edge of intent.edges) {
            // A throw ends the run here rather than firing eleven more doomed
            // commands at a worker that has already said no -- and it is the
            // throw itself that reaches the player: it rejects the gate's
            // action, and the HUD paints its refusal line (issue #207).
            sender.submit({
              type: 'PlaceBuildOrder',
              // A fresh id per order: the kernel refuses a duplicate, and a
              // stable one would make the second wall a no-op.
              orderId: `order-${crypto.randomUUID()}`,
              definitionId: intent.definitionId,
              x: edge.x,
              y: edge.y,
              edge: edge.edge,
              transactionId,
            });
          }
          return;
        }

        /*
         * The `PlaceObject` producer (ADR 0028 phase 1), and the tenth command
         * `tests/foundation/unconsumed-command-contract.test.ts` counts.
         *
         * It arrives *with* its producer, which that gate's own header calls
         * "the only way a new command should land": the schema member, the
         * `createSessionCommandHandler` branch, the `HudIntent` member, the two
         * routes that emit it and this dispatch are one change.
         *
         * Two routes reach it and both come through the HUD, so there is one
         * answer to "was the player told": the world gesture (the object tool,
         * `worldObjects` above) and the Build panel's numeric fields, which is
         * the keyboard route `AGENTS.md` boundary 10 asks for -- ADR 0022's
         * amendment records the Rooms panel shipping without one as an open
         * question, and this does not repeat it.
         *
         * A fresh `orderId` per press, exactly as `place-build-order` mints one
         * per order: the construction system refuses a duplicate id, and a
         * stable one would make the second bed a no-op. **No `transactionId`**,
         * and that is the schema's decision rather than an omission here -- one
         * press is one object, so a transaction of one is what the absent field
         * already produces, and `Undo` reaches the order either way.
         *
         * **Nothing is checked before submitting**, unlike a purchase, a hire or
         * an admission. Each of those compares a figure the worker last
         * published against what the player asked for, so the refusal lands on
         * the control they pressed. There is no such figure here: every one of
         * the seven refusal reasons is about the zoning plane, the objects
         * already standing or the orders in flight, and this thread holds none
         * of them. So the refusal comes back from the worker, once -- on the
         * refusal band, and in the alerts log beside it -- and a pre-flight
         * check that guessed would be a second answer that could disagree
         * with it.
         */
        case 'place-object':
          requireSimulation(commands).submit({
            type: 'PlaceObject',
            orderId: `object-${crypto.randomUUID()}`,
            definitionId: intent.definitionId,
            x: intent.x,
            y: intent.y,
          });
          return;

        /*
         * The `RemoveObject` producer (ADR 0028 phase 3), and the eleventh
         * command `tests/foundation/unconsumed-command-contract.test.ts` counts.
         *
         * It arrives *with* its producer, like the ten before it, from the same
         * two routes as `place-object`: the world gesture while the Build panel's
         * removal mode is on, and that panel's numeric fields with the same mode
         * on -- which is the keyboard route `AGENTS.md` boundary 10 asks for. The
         * gesture route is the one that matters here, because the whole reason
         * this command exists is that the only way to take an object back was
         * `Undo` on `KeyZ`, and a touch device has no `KeyZ`.
         *
         * **No order id and nothing minted.** A removal writes no construction
         * order, so there is no id to allocate. It can *cancel* one -- a
         * placement still in flight whose tile would otherwise stay claimed --
         * and the simulation finds that order from the tile, because the main
         * thread holds no order list.
         *
         * **Nothing is checked before submitting**, for the reason a placement
         * is not: the one refusal reason is about the placed objects and the
         * order list, and this thread holds neither. So the refusal comes back
         * from the worker, once, and reaches the band `hud.css` lays out at
         * every viewport -- which is what makes removal answerable on a phone
         * at all (#220, made structural).
         */
        case 'remove-object':
          requireSimulation(commands).submit({ type: 'RemoveObject', x: intent.x, y: intent.y });
          return;

        /*
         * The producer ADR 0022 was written to decide, and the one
         * `tests/foundation/unconsumed-command-contract.test.ts` has been
         * holding `ZoneRoom` on its `AWAITING_PRODUCER` list for.
         *
         * `RoomZoningService.zone` has been complete since #261 -- it validates
         * every tile before writing any, paints the zoning plane with the room
         * catalogue's own `numericId`, registers a `RoomInstance` and refuses
         * with one of seven typed reasons -- and *nothing in the application
         * could reach it*. The whole zoning vocabulary was reachable only from
         * a test.
         *
         * `roomId` is the field name the wire format uses and it holds a room
         * *catalog* id (`room.cell`), never an instance id: the schema named it
         * before instances existed, and renaming a field a queued command in an
         * existing save may already carry is a save-compatibility change rather
         * than a rename (`src/simulation/runtime/session-commands.ts` records
         * that too).
         *
         * **No `transactionId`, and that is a decision rather than an
         * omission.** The field is optional in the schema; zoning writes no
         * construction order, so `ConstructionSystem.registerTransactionOrder`
         * has nothing to group and `Undo` cannot reach a designation whether or
         * not one is sent. Sending an id that nothing groups by would be
         * inventing a grouping to explain. Removal is the reversal instead, and
         * it is `UnzoneRoom` below.
         *
         * **One command per gesture, and no loop.** Unlike a build order, which
         * is one command per edge, a designation is one command for the whole
         * rectangle: the service checks every tile before writing any, so a
         * 64x64 room is one outcome rather than 4,096 chances to be half
         * refused.
         */
        case 'zone-room':
          requireSimulation(commands).submit({
            type: 'ZoneRoom',
            roomId: intent.roomId,
            x: intent.area.x,
            y: intent.area.y,
            width: intent.area.width,
            height: intent.area.height,
          });
          return;

        /*
         * Removal, which is the blocker this change closes rather than a
         * nicety on top of it.
         *
         * Before `UnzoneRoom` existed a designation was permanent for the life
         * of the session: `zone` refuses `overlaps-existing-room` for any tile
         * already painted, so it could not be re-zoned; no command expressed
         * removal; and `Undo` reaches only `ConstructionSystem`, which holds no
         * transaction for a zoning. So one stray 64x64 drag could put 4,096
         * tiles beyond use for the whole session -- and on touch there was no
         * recovery of any kind, because undo is a keyboard chord.
         *
         * No room id, because a removal names no room type: what comes out is
         * whatever the rectangle covers. `RoomZoningService.unzone` states what
         * "covers" means -- every covered zoned tile is resolved to the room
         * *instance* containing it and that instance's whole rectangle is
         * cleared (issue #337; it used to be the connected same-type run, which
         * took the room next door with it) -- and both consequences of that,
         * one of which the player is told up front by the panel's removal hint.
         */
        case 'unzone-room':
          requireSimulation(commands).submit({
            type: 'UnzoneRoom',
            x: intent.area.x,
            y: intent.area.y,
            width: intent.area.width,
            height: intent.area.height,
          });
          return;

        case 'purchase-materials': {
          const sender = requireSimulation(commands);
          /*
           * The producer #89 was missing.
           *
           * `PurchaseMaterials` has had a schema, a decoder, a session
           * command router, a system and a save representation since #249,
           * and nothing in `src/` could construct one -- so a build order
           * placed in a real session reached `materials-pending` and stayed
           * there for ever, because the only way to stock the construction
           * container is a delivery and the only way to buy a delivery was a
           * test. `tests/foundation/unconsumed-command-contract.test.ts` is
           * the gate that measures this, and this dispatch is what took
           * `PurchaseMaterials` off its list.
           *
           * The affordability check is here rather than in the HUD, and it is
           * a *report*, not a second treasury. `Treasury.spend` refuses rather
           * than overdrawing, and this check exists so that the refusal the
           * player can actually provoke is answered on the control they
           * pressed: throwing here rejects the HUD's gated action, which paints
           * the refusal line and marks that button. Without it, a purchase the
           * balance cannot cover would be the exact failure #82 and #207 are
           * about -- a button that reports success and does nothing.
           *
           * **The worker's own refusal is no longer dropped**, which is what
           * makes this a check on one side of the dispatch rather than the only
           * report there is. It used to be: the kernel's command handler
           * returns `void` and a command reply acknowledges receipt, not
           * effect, so `ProcurementSystem`'s outcome had nowhere to go. #261
           * gave it one -- the session's `RefusalLog`, published as an alert
           * row on `simulation/status-counts`
           * (`src/simulation/runtime/session-commands.ts`). The `throw` below
           * and that alert row sit on opposite sides of `sender.submit`, so a
           * press produces exactly one of them and never both.
           *
           * What it checks against is `viewModel.counts.treasuryMinorUnits`,
           * the balance the worker last published -- at most 500ms old, and
           * published once immediately on `simulation/ready` before any tick
           * runs, so it is never the empty view model's zero while a session
           * exists.
           *
           * **The comparison itself moved out of this file** (#703 ruling A).
           * It read `if (total > viewModel.counts.treasuryMinorUnits)`, which is
           * `Treasury.canAfford` with the floor hard-coded at zero -- correct
           * for every session that existed when it was written, and wrong from
           * the moment `createNewSimulationRuntime` opened a standing overdraft
           * ([ADR 0083](../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
           * §2). It would then have refused presses the simulation *accepts*,
           * which is #82's and #207's failure with the sign reversed. It is now
           * `judgeAffordability` (`src/ui/affordability.ts`), a pure function
           * with its own boundary cases, because nothing in this file is
           * reachable from `pnpm test` -- `vitest.config.ts` sets
           * `environment: 'node'` -- so a mutation here survives for want of an
           * observer rather than for want of a test.
           *
           * **It is an echo, not the authority, and two cases get past it.** A
           * command runs at a future tick, so several purchases pressed in a
           * row are each checked against a balance none of them has been
           * deducted from yet -- most visibly with the clock paused, where
           * nothing steps at all and every queued purchase is measured against
           * the same figure. And a balance that moved in the last 500ms is not
           * yet here. In both, `Treasury.spend` refuses without overdrawing --
           * and the player is now told so, on the route above, which is the
           * half of #96 that has since been closed. What stays open is *when*:
           * a paused clock dispatches nothing, so a purchase queued against one
           * is neither spent nor refused until the clock next runs, and the
           * alert row arrives then rather than on the press. What this check
           * closes is the case a player actually reaches -- asking for more than
           * the prison has ever had -- answered on the pressed control instead
           * of some ticks later.
           */
          const priced = procurableMaterial(intent.itemId);
          if (priced === undefined) {
            throw new Error(`Nothing sells ${intent.itemId}, so it cannot be bought.`);
          }
          const total = priced.unitPriceMinorUnits * intent.quantity;
          /*
           * **The third argument is the owner's second ruling on #771
           * (2026-09-01).** A fresh, unfurnished prison's press is judged
           * against a shallower rung than the shipped constant
           * `HOST_PRESS_FLOOR_MINOR_UNITS` carries, so this pre-flight would
           * otherwise accept a press the worker refuses -- the #82/#207
           * failure this whole module exists to prevent, mirrored. "Fresh,
           * unfurnished" is read off `viewModel.counts.roomCapacity`, the same
           * published field the Rooms panel already renders, not a value
           * minted for this call -- see `pressFloorMinorUnits`.
           */
          const verdict = judgeAffordability(
            total,
            viewModel.counts.treasuryMinorUnits,
            pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, viewModel.counts.roomCapacity === 0),
          );
          if (verdict.refused) {
            /*
             * **The refusal now says which kind it is** -- the owner's ruling
             * 18 of 2026-08-31.
             *
             * `HostRefusalError` carries the reason to `reportError` in
             * `src/ui/hud/hud.ts`, which picks the sentence; a plain `Error`
             * would land on the generic *"the purchase was refused and no money
             * was spent"*, which is what a player saw for a limit they had no
             * other way of learning about. Only `'past-the-floor'` is promoted:
             * a malformed charge is a defect on this thread, and telling the
             * player the state will not carry it would be a claim about the
             * prison's finances that is false.
             *
             * The message itself is diagnostic English and reaches the host
             * through `MountHudOptions.onError`, never the screen (ADR 0011).
             */
            const message = `The last reported balance of ${viewModel.counts.treasuryMinorUnits} cannot cover ${total}.`;
            throw verdict.refusal === 'past-the-floor'
              ? new HostRefusalError('past-the-overdraft-floor', message)
              : new Error(message);
          }
          sender.submit({
            type: 'PurchaseMaterials',
            // Identifier-shaped and fresh per purchase, exactly as a build
            // order's is: `ProcurementSystem.purchase` refuses a duplicate
            // id, so a stable one would make every purchase after the first a
            // silent no-op.
            orderId: `order-${crypto.randomUUID()}`,
            itemId: intent.itemId,
            quantity: intent.quantity,
          });
          return;
        }

        case 'admit-prisoner': {
          const sender = requireSimulation(commands);
          /*
           * The producer #261 step 4 was missing, and the check in front of
           * it is the most important line in this case.
           *
           * `admitPrisoner` and the whole intake pipeline have existed since
           * #24. What did not exist was any way for the application to reach
           * them: no command, no handler branch, no intent and no control.
           * Those are wired now, and `tests/foundation/unconsumed-command-contract.test.ts`
           * is the gate that measures it.
           *
           * **A prison with no room may not admit anybody, and this refuses
           * rather than admitting into one.** `IntakeSystem` marks an arrival
           * `'failed'` when no room instance of its accommodation target
           * exists, and `'failed'` is terminal: no branch of
           * `IntakeSystem.update` matches it, so zoning a cell afterwards
           * does not rescue the record (measured), and `ActionSystem` never
           * runs for it because it gates on `'completed'`. Admitting into a
           * roomless prison therefore does not produce a prisoner who will
           * start behaving once rooms arrive -- it produces an inert record
           * that the status strip counts as a prisoner and that the
           * arrivals-backlog readout excludes, because `prisonersInIntake`
           * filters `'failed'` out. That is a worse answer than saying no.
           *
           * **The word this paragraph has lost is "permanent".** It used to
           * read "permanent, undeletable, inert", on the grounds that "nothing
           * in `src/` releases a prisoner (#31)". Since #441 that record does
           * end: `PrisonerDischargeSystem` counts `'failed'` as a
           * sentence-bearing stage, so the arrival leaves when their sentence
           * would have ended. Inert for the length of a sentence is still a bad
           * answer to give a player who pressed a button, so the refusal
           * stands; it is simply no longer forever.
           *
           * The check is here rather than in the HUD, and it is a *report*,
           * not a second registry, exactly as the affordability check above
           * is a report and not a second treasury: throwing rejects the HUD's
           * gated action, which paints the refusal line and marks the button
           * the player pressed. `src/simulation/runtime/session-commands.ts`
           * refuses the same condition on the far side of `sender.submit`,
           * from the registry itself, so one press produces exactly one
           * player-visible message -- this throw, or that alert row, never
           * both and never neither.
           *
           * Why the check has to be here as well as there, and what changed
           * about that reason. It used to be timing: a new session starts
           * paused (`FixedStepClock`, `mode: 'paused'`) and a command queued
           * against a paused clock was not dispatched, so the worker's refusal
           * did not arrive until the player started the clock -- for a player
           * who pressed this before touching the clock, the difference between
           * an answer and nothing at all. **That is no longer why**: since ADR
           * 0051 the worker dispatches a due command as soon as it is
           * submitted against a paused clock, so the far-side refusal now
           * reaches the player during the pause too.
           *
           * The check stays, on the reason that was always the stronger one:
           * it is measured against a *different* condition from the worker's,
           * it is the only one of the two that can answer before a command is
           * composed at all, and the two are arranged so that exactly one of
           * them speaks per press -- which is the paragraph below. Removing it
           * would make that arrangement depend on the clock.
           *
           * `counts.rooms` is the room-*instance* count the worker last
           * published, at most 500ms old and published once on
           * `simulation/ready` before any tick. It is an echo and not the
           * authority, and it is deliberately coarser than the condition the
           * worker applies: it counts instances of every room type, while the
           * worker asks whether any *accommodation target* has one. A prison
           * holding only a zoned canteen therefore passes here and is refused
           * there -- still exactly one message, from the other side.
           *
           * **It is zero in a fresh session until the player zones
           * something**, because `RoomZoningService.zone` is the only thing
           * that mints a room instance from a gesture -- and since the Rooms
           * tab (#312) that is a gesture a player has, so this is a real
           * branch rather than a permanent one. Two sentences here needed
           * narrowing, and both had been quietly false for a while:
           *
           *   - This said `RoomZoningService` is *"the only thing in `src/`
           *     that registers an instance"*, which
           *     `restoreSessionSystems` in
           *     `src/simulation/runtime/session-systems.ts` has falsified
           *     since #70: a restored save re-registers every instance it
           *     carries. "Zero until the player zones something" is therefore
           *     true of a *new* prison and not of a loaded one, which is the
           *     narrower claim this branch actually rests on.
           *   - It said the arrival waits at `accommodation-assignment`
           *     *"because zoning registers `capacity: 0` (ADR 0023)"*. Zoning
           *     writes zeroes, but as a placeholder before `updateDerived`
           *     resolves the real figure rather than as the answer (ADR 0028
           *     phase 1, and the field is now `residentCapacity`). An *empty*
           *     zoned cell still derives zero, so the observed wait is
           *     unchanged -- but it is now a fact about the cell being empty,
           *     and putting a bed in it ends the wait.
           *
           * Measured on the merged tree: a zoned `room.cell` takes
           * `counts.rooms` to 1, the worker finds an instance of an
           * accommodation target and admits, and the arrival waits at
           * `accommodation-assignment` while that cell holds no
           * `'sleep-surface'` object. A prison with nothing zoned is still
           * refused here, and the panel says so before the press as well
           * (`hud.intake.hint`) rather than leaving the player to discover it
           * by pressing.
           */
          if (viewModel.counts.rooms === 0) {
            throw new Error('This prison has no room to hold a prisoner, so nobody can be admitted into it.');
          }
          sender.submit({
            type: 'AdmitPrisoner',
            // No `sentenceLengthTicks`. Omitting the field is what asks the
            // simulation to draw one (#535 decision 5); sending `undefined`
            // would not, because `admitPrisonerSchema` is `.strict()` and the
            // wire distinguishes an absent key from a present empty one.
            priorIncidents: ADMISSION_REQUEST.priorIncidents,
            // The arrival tile, from the same constant the Build panel's
            // fields start at and a hire's first tile comes from. No id is
            // minted: nothing downstream is keyed by an admission, so unlike an
            // order id or a purchase id there would be nothing to read it.
            x: NEW_PRISON_ORIGIN_TILE.x,
            y: NEW_PRISON_ORIGIN_TILE.y,
          });
          return;
        }

        case 'hire-staff': {
          const sender = requireSimulation(commands);
          /*
           * The producer `GuardRoster.hire` never had
           * ([ADR 0025](../docs/adr/0025-guard-hiring-surface.md)).
           *
           * `hire` was complete, snapshotted and restored, and **every call in
           * the repository was in a test**. So `DeploymentSystem`,
           * `PatrolSystem`, `IncidentResponseSystem` and `SearchSystem` all
           * iterated an empty roster in every session a player could start,
           * and the status strip's `Staff` count was structurally zero. This
           * dispatch is what takes `HireStaff` off
           * `tests/foundation/unconsumed-command-contract.test.ts`'s list.
           *
           * The affordability check is the same shape as the purchase one
           * above and is there for the same reason: it is a *report*, not a
           * second treasury. `Treasury.spend` refuses rather than overdrawing
           * either way; throwing here rejects the HUD's gated action, which
           * paints the refusal band and marks the button the player pressed
           * instead of answering some ticks later from the worker. It is an
           * echo of the balance the worker last published, so the same two
           * cases get past it -- several hires inside one tick, and a balance
           * that moved in the last 500ms -- and both are answered by the
           * worker-side route in `session-commands.ts`. The `throw` and that
           * worker refusal sit on opposite sides of `sender.submit`, so one
           * press produces exactly one of them and never both -- and they
           * share the band, told apart by its `data-source`.
           *
           * The wage is read through `staffHireCostMinorUnits` rather than off
           * the view model's rendered figure, so the number checked here and
           * the number the treasury is debited come from one definition even
           * if a caller passed a role the panel never rendered.
           *
           * **And the comparison is `judgeAffordability`'s** rather than the
           * `>` this line used to carry, for the reason spelled out on the
           * purchase case above: the floor is no longer zero, and this file
           * cannot be tested.
           */
          const hireChargeMinorUnits = staffHireCostMinorUnits(intent.staffRoleId);
          if (hireChargeMinorUnits === undefined) {
            throw new Error(`No staff role ${intent.staffRoleId} is declared, so nobody can be hired into it.`);
          }
          // The same two-sentence split as the purchase case above, and for the
          // same reason (ruling 18): a wage the facility cannot carry is a
          // limit, not the prison being out of money. The third argument is
          // the same starter-rung awareness the purchase case above carries --
          // hiring shares the press's threshold, mature or starter alike.
          const hireVerdict = judgeAffordability(
            hireChargeMinorUnits,
            viewModel.counts.treasuryMinorUnits,
            pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, viewModel.counts.roomCapacity === 0),
          );
          if (hireVerdict.refused) {
            const message = `The last reported balance of ${viewModel.counts.treasuryMinorUnits} cannot cover ${hireChargeMinorUnits}.`;
            throw hireVerdict.refusal === 'past-the-floor'
              ? new HostRefusalError('past-the-overdraft-floor', message)
              : new Error(message);
          }
          sender.submit({
            type: 'HireStaff',
            staffRoleId: intent.staffRoleId,
            // Where a new hire stands is not part of the gesture: see
            // `NEW_PRISON_ORIGIN_TILE` for why the composition root supplies
            // it and why that is a placeholder rather than a rule.
            x: NEW_PRISON_ORIGIN_TILE.x,
            y: NEW_PRISON_ORIGIN_TILE.y,
          });
          return;
        }
      }
    },
    onError: (failure) => console.warn('HUD action failed', failure),
  });

  /*
   * The build identity, in the corner, from first paint.
   *
   * Mounted into the strip's chrome slot rather than built by the strip: see
   * `src/ui/brand-badge.ts` for why a projection of prison state is the wrong
   * place for a compile-time constant. It is mounted here unconditionally, on
   * the same principle that moved `mountInterface` itself out of
   * `bootPersistence` (issue #82): a browser that cannot start a worker is
   * exactly the browser whose player most needs to be able to report which
   * build failed.
   *
   * The same `localizer` the HUD uses, not a second one -- the mistake
   * `SavePanel`'s defaulted localizer still has to work around.
   */
  hud.brandSlot.append(createBrandBadge({ localizer }).element);

  /*
   * The interface scale, wired end to end (issue #545).
   *
   * `uiScale` has been a declared, range-checked, defaulted and persisted
   * field of `AccessibilitySettings` since that record was written, and until
   * this block existed no line in `src/` read it back. A player could not set
   * it, and a value that reached the storage key some other way survived a
   * reload and changed nothing on screen. These fifteen lines are the whole of
   * the fix at the composition root; the mechanism is `--ui-scale` in
   * `src/ui/tokens.css` and the steps are `UI_SCALE_STEPS` in
   * `src/input/accessibility.ts`.
   *
   * **Applied before the control is built**, so the first paint is already at
   * the player's scale rather than snapping to it a frame later.
   *
   * **Persisted before it is painted.** `saveAccessibilitySettings` swallows a
   * refusal by design (`src/input/storage.ts`: losing a settings write is
   * recoverable, crashing a control mid-session is not), so the write cannot
   * fail the sequence -- but doing it first keeps the order honest for the day
   * it reports one, and the control is deliberately *controlled*: it changes
   * nothing until `setScale` is called, so the readout can never claim a scale
   * the rest of the page is not at.
   *
   * `document.documentElement` is the element `:root` selects. Reading it here
   * rather than inside `applyUiScale` is issue #199's lesson applied to a
   * different global: a browser access belongs in the composition root, where
   * it happens once and at a known time.
   */
  const settingsStore = resolveBrowserKeyValueStore();
  let accessibility = loadAccessibilitySettings(settingsStore);
  applyAccessibilitySettings(document.documentElement, accessibility);
  const displayScale = createDisplayScaleControl({
    localizer,
    scale: accessibility.uiScale,
    onSelect: (uiScale) => {
      accessibility = { ...accessibility, uiScale };
      saveAccessibilitySettings(settingsStore, accessibility);
      applyAccessibilitySettings(document.documentElement, accessibility);
      displayScale.setScale(uiScale);
    },
  });
  /*
   * The rail's aside slot, above the save panel -- and **not** the status
   * strip, which is where two earlier drafts of this put it. The strip cannot
   * afford a tap target at the viewport that binds, and the numbers are worth
   * recording because they are not obvious:
   *
   *   - At 375x812 `hud.css` wraps the strip into three rows: the brand badge
   *     (about 21px of type), the metrics, and the clock beside the transport.
   *     A 44px control in the *brand* slot raises the first row from 21px to
   *     44px -- the Rooms panel's arrival height went 451.1 -> 422.3, against a
   *     number `app-shell.spec.ts` pins.
   *   - Moving it to a new slot at the *end* of the strip was worse, not
   *     better: the clock is `flex: 1` but its automatic minimum size is its
   *     own content, measured at 179px, so clock + transport already fill the
   *     359px row exactly and the control took a fourth row. 451.1 -> 405.
   *
   * `HudHandle.asideSlot` is documented as the host's own box in the rail,
   * *not tab-scoped* -- "what sits here is available on every tab, which is
   * the point" -- which is exactly what a display preference is. It costs the
   * save panel below it 54px of visible height and costs the Build and Rooms
   * panels nothing at all, because `.hud__aside` takes its height from the
   * rail rather than from its contents (`hud.css`).
   */
  hud.asideSlot.append(displayScale.element);

  tool?.attachReadout((target) => hud?.setBuildTarget(target));
  return hud;
}

/**
 * Draws the `masterSeed` a new prison is created with (issue #479).
 *
 * **Chosen outside the kernel and handed in, which is the whole argument.**
 * `docs/DETERMINISM.md` bans ambient nondeterminism *inside* the simulation
 * import graph, and `tests/determinism/ambient-nondeterminism-contract.test.ts`
 * enforces that by walking outward from `src/simulation/` -- `main.ts` is not
 * in that graph (nothing under `src/simulation/` imports it), so this
 * function sits exactly where `FixedStepClock`'s pacing read and
 * `crypto.randomUUID()` in this same file (`transactionId`, `orderId`) already
 * sit: on the composition-root side of the boundary the guard actually draws.
 * By the time the drawn value reaches `SessionController.createPrison` and
 * `createNewSimulationRuntime`, it is an opaque `number` -- indistinguishable
 * from any other `masterSeed`, including the literal ones tests pass.
 *
 * **`crypto.getRandomValues`, not `Date.now()`.** Both are technically
 * "outside the kernel", but a clock read here would not merely be redundant
 * with `FixedStepClock`'s pacing read -- it would be a *second* one with a
 * different job: `docs/DETERMINISM.md` permits exactly the one, and only as
 * pacing, so a second reader is not something this file gets to add by
 * calling it something else. Real entropy has no such reservation, matches
 * the existing convention in this file for anything that must differ between
 * two otherwise-identical actions (`crypto.randomUUID()` for `transactionId`
 * and every `orderId` above), and, unlike wall-clock milliseconds, cannot
 * collide when a player creates two prisons in the same tick of the host
 * clock.
 *
 * A `Uint32Array` of length 1 spans exactly `[0, 0xffff_ffff]` -- the full
 * range `masterSeedSchema` (`src/services/challenges/challenge.ts`) and
 * `deriveXoshiroState` (`src/simulation/rng/seed.ts`) accept -- so nothing
 * downstream can reject a value this function produces.
 */
function generateMasterSeed(): number {
  const drawn = new Uint32Array(1);
  crypto.getRandomValues(drawn);
  return drawn[0]!;
}

/**
 * The save panel goes in the HUD's aside slot, not in `#app`.
 *
 * It used to be appended to `#app` as a sibling of the HUD and positioned by
 * its own `position: fixed` rule, which is exactly how it ended up underneath
 * the Build panel with no layout relating the two (issue #88). Mounting it
 * into the slot puts it in the HUD's grid, so the HUD's own layout decides
 * where it goes and the collision cannot recur.
 *
 * The whole `HudHandle` is passed rather than only that slot, because the
 * other end of this function needs the HUD too: a worker that cannot be
 * constructed for a later session has to reach the HUD's standing notice
 * (issues #82, #149).
 */
async function bootPersistence(workers: SimulationWorkerChannel, hud: HudHandle): Promise<void> {
  let controller: SessionController;
  let panel: SavePanel;
  try {
    const database = await openLockstateDatabase();
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(database));

    // Authoritative simulation state lives in the worker, never here.
    // Saving goes through its snapshot request/response (ADR 0003), so the
    // main thread only ever holds derived projections and save envelopes.
    //
    // A worker per session, not per page (issue #149): the host claims one
    // that has hosted nothing each time a prison is created or loaded, so
    // "load" means what a player expects it to mean.
    const host = new WorkerPerSessionHost(workers, {
      /*
       * Issue #82's failure path, re-entered rather than run once at boot.
       *
       * Worker construction can now fail long after first paint -- there is
       * one per session, and the outgoing worker is terminated before its
       * replacement is built, so a failure leaves the page with no simulation
       * at all. That is the state the notice describes, so the notice goes up,
       * by exactly the route it takes when the *first* construction fails. The
       * player also learns which action failed, on the save panel: the host
       * raises an ordinary `Error`, which reaches the panel's own failure
       * line and costs no save generation.
       */
      onWorkerAvailability: (available) => {
        hud.setUnavailable(available ? undefined : SIMULATION_UNAVAILABLE_NOTICE);
        // The existing report route, read a second time. `WorkerPerSessionHost`
        // already tells this file every time it fails to obtain a worker, so
        // the producer binds to that callback rather than being pushed down
        // into the host: `SimulationClient` records, one module over, that a
        // failure belongs "on the route the protocol already has rather than
        // through a channel of this class's own", and adding a telemetry
        // dependency to `src/persistence/session/` would be that channel.
        //
        // No thrown value is passed because the callback carries none. A
        // fabricated `errorName` would be worse than the absent one.
        if (!available) crashReporter?.reportWorkerLoss('session');
      },
    });

    controller = new SessionController(repository, host, {
      gameVersion: GAME_VERSION,
      generateMasterSeed,
      onSaveResult: (_prisonId: string, result: SaveResult) => panel.reportBackgroundSave(result),
    });
    panel = new SavePanel(controller, hud.asideSlot, localizer);
  } catch (error) {
    console.warn('Local save storage is unavailable; continuing without persistence.', error);
    return;
  }

  /*
   * The autosave, finally connected (issue #146).
   *
   * `AutosaveScheduler` is purely dirty-driven -- no `markDirty`, no timer, no
   * save -- and **nothing in the application ever called it**, so the 30-second
   * interval was configured, reached the scheduler, and did nothing. The only
   * automatic save was the best-effort one on `pagehide` below, which meant an
   * unclean end (a crash, a force-quit, an OS kill, a dead worker) wrote
   * nothing since the last time the player pressed Save now.
   *
   * That also falsified the reasoning the lifecycle save rests on: #92 and
   * `docs/PERSISTENCE.md` justify it being fire-and-forget on the grounds that
   * the interval autosave is the durability mechanism. There was no interval
   * autosave. Those passages become true with this line, which is the right
   * order -- fix the code, and the documentation stops being aspirational.
   *
   * Wired here rather than at the sender's construction because the sender is
   * built at module scope, before this function has a controller to give it.
   */
  commandSender?.onCommandAccepted(() => controller.markDirty());

  // Best-effort only -- see LifecycleSaveHandler's docs on why correctness
  // never depends on these events firing.
  new LifecycleSaveHandler(controller).attach();

  await panel.refresh();
}

/*
 * Mounted unconditionally, and before the persistence boot.
 *
 * This call used to sit inside `bootPersistence`, which runs only when the
 * worker started -- so a browser that could not start one got a canvas and
 * nothing else: no HUD, no save panel, no way to be told why (issue #82). The
 * comment on `mountInterface` already described the intended arrangement; only
 * the placement disagreed with it, which is why no unit test caught it. Both
 * functions behave correctly in a browser where everything works.
 *
 * The HUD is a view over whatever state exists, including none, and it holds
 * no simulation state at all -- so there is nothing for it to wait on.
 */
const appRoot = document.getElementById('app');
const mountedHud =
  appRoot === null
    ? undefined
    : mountInterface(appRoot, {
        ...(simulation === undefined ? {} : { client: simulation }),
        ...(commandSender === undefined ? {} : { commands: commandSender }),
        ...(buildTool === undefined ? {} : { tool: buildTool }),
        ...(roomTool === undefined ? {} : { rooms: roomTool }),
        ...(objectTool === undefined ? {} : { objects: objectTool }),
      });

// The save panel is laid out by the HUD, so there is nowhere to put it until
// the HUD is mounted. That is not a new dependency in disguise: with no
// interface there is no screen for a save panel to be on.
if (simulation !== undefined && mountedHud !== undefined) {
  void bootPersistence(simulationWorkers, mountedHud);
}

/*
 * The telemetry surface, mounted only when there is somewhere for telemetry to
 * go.
 *
 * Both halves are here rather than inside `bootPersistence`: consent and
 * diagnostics have nothing to do with whether IndexedDB opened or whether a
 * worker started, and #82 is the standing lesson about putting an unrelated
 * mount inside a function that runs only on the happy path.
 *
 * The pump is what makes `BatchingTelemetrySink`'s timer-free design work at
 * all. It is deliberately an idle callback and never a frame callback: ADR
 * 0010 and ADR 0008's T11 both put trusted-service work off the tick and frame
 * paths, and `requestIdleCallback` is the one browser primitive that promises
 * it. Safari has not shipped it, so the fallback is a plain timeout -- a
 * telemetry flush that runs slightly less politely is better than one browser
 * never flushing.
 */
if (telemetry.enabled && appRoot !== null) {
  const pipeline = telemetry.pipeline;

  if (pipeline.shouldAskForConsent) {
    appRoot.append(
      createTelemetryConsentPrompt({
        localizer,
        onDecision: (draft) => pipeline.applyConsentDecision(draft),
      }).element,
    );
  }

  pipeline.startPump((run, delayMs): CancelScheduledPump => {
    if (typeof requestIdleCallback === 'function') {
      const handle = requestIdleCallback(() => run(), { timeout: delayMs });
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(run, delayMs);
    return () => clearTimeout(handle);
  });
}
