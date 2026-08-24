import Phaser from 'phaser';
import { resolveBrowserKeyValueStore } from './input';
import { IndexedDbLocalSaveStore, openLockstateDatabase } from './persistence/local/indexeddb-store';
import { PrisonSaveRepository, type SaveResult } from './persistence/local/repository';
import { LifecycleSaveHandler } from './persistence/session/lifecycle';
import { SessionController } from './persistence/session/session-controller';
import { WorkerSessionHost } from './persistence/session/worker-session-host';
import { SimulationClient } from './simulation/worker/client';
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
import { SavePanel } from './ui/save-panel';
import {
  EMPTY_HUD_VIEW_MODEL,
  HUD_MESSAGE_KEY,
  mountHud,
  type HudBuildViewModel,
  type HudBuildableViewModel,
  type HudHandle,
  type HudIntent,
  type HudUnavailableNotice,
  type HudViewModel,
} from './ui/hud';
import { hudClockFromWorkerMessage } from './ui/simulation-clock';
import { hudCountsFromWorkerMessage } from './ui/simulation-counts';
import { SimulationCommandSender } from './ui/simulation-commands';
import { BuildTool } from './ui/build-tool';
import { BUILDABLE_REGISTRY } from './simulation/construction';
import type { LocalizationKey } from './content/localization';
import { DEFAULT_LOCALE } from './content/localization';
import { defaultMessageCatalogEn } from './services/localization';
import { Localizer } from './services/localization/localizer';
import { createBrandBadge } from './ui/brand-badge';
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
 * The simulation worker is created once, up front, and shared.
 *
 * Both consumers on this thread are readers of the same protocol: the
 * renderer asks it for world snapshots, and persistence asks it for save
 * snapshots. Neither owns simulation state, and a second worker would be a
 * second, divergent simulation.
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
let simulation: SimulationClient | undefined;
try {
  simulation = new SimulationClient(new SimulationWorker());
} catch (error) {
  console.error('The simulation worker could not be started; the world will not render.', error);
}

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
 * The main thread's command channel, and the build tool that uses it.
 *
 * Both are built here, before the scene, because the scene needs the tool:
 * `AGENTS.md` boundary 3 puts input orchestration on this thread, and the
 * renderer may not submit a command of its own. So the scene reports the tile
 * edges a gesture covered, and this pair turns them into `PlaceBuildOrder`s.
 *
 * With no worker there is no tool: an armed pointer that could never place
 * anything would take the camera away and give nothing back.
 */
const commandSender = simulation === undefined ? undefined : new SimulationCommandSender(simulation);
const buildTool =
  commandSender === undefined
    ? undefined
    : new BuildTool({
        submit: (command) => commandSender.submit(command),
        onError: (error) => console.warn('Build order refused:', error.message),
      });

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
  ...(buildTool === undefined ? {} : { buildTool }),
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
 * default population, and no protocol message publishes actor positions even
 * when one exists. This flag is therefore the honest way to look at the
 * sprite path end to end (manifest -> atlas texture -> direction -> foot
 * pivot -> depth) without inventing simulation state to do it. It is off by
 * default and it never touches the world underneath.
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
 * Player-facing labels for the two entries in `BUILDABLE_REGISTRY`.
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

/** Walls first, then everything else: the first row is also the default selection. */
const CATEGORY_RANK: Readonly<Record<string, number>> = { wall: 0, object: 1, utility: 2 };

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
  const ordered = [...BUILDABLE_REGISTRY.values()].sort(
    (a, b) => rank(a.category) - rank(b.category) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const definition of ordered) {
    const labelKey = BUILDABLE_LABEL_KEY[definition.id];
    if (labelKey === undefined) continue;
    buildables.push({
      definitionId: definition.id,
      labelKey,
      occupiesEdge: definition.category === 'wall',
    });
  }

  // A new session owns exactly chunk (0,0) of a 32-tile world, so the middle
  // of owned land is the least surprising place for the fields to start.
  return { buildables, origin: { x: 16, y: 16 } };
}

interface InterfaceHost {
  /**
   * Absent when no worker started. Every control that would reach the
   * simulation then *throws*, which the HUD reports on the control that was
   * pressed -- a pause button that silently does nothing is a lie the player
   * has no way to detect (issue #82's point, applied to the build controls
   * too).
   */
  readonly client?: SimulationClient;
  readonly commands?: SimulationCommandSender;
  readonly tool?: BuildTool;
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

function mountInterface(app: HTMLElement, host: InterfaceHost = {}): HudHandle {
  const { client, commands, tool } = host;
  const simulationUnavailable = client === undefined;

  let hud: HudHandle | undefined;

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
   */
  const unavailableNotice: HudUnavailableNotice = { labelKey: 'hud.unavailable.simulation' };

  let viewModel: HudViewModel = EMPTY_HUD_VIEW_MODEL;

  /**
   * Repaints the strip from what the worker last said, and from nothing else.
   *
   * Day, position within the day, mode and speed all come out of a
   * `simulation/ready` or `simulation/clock-state` message; the prisoner,
   * staff, room, incident and contraband counts come out of a
   * `simulation/status-counts` one. The worker publishes both unprompted
   * while a session exists (ADR 0003's "unsolicited ... do not pretend to be
   * request responses"), which is what makes the readouts move without this
   * thread ever counting anything of its own. With no worker, no session, or
   * a stopped one, the clock reads unknown and the counts read empty -- see
   * `EMPTY_HUD_VIEW_MODEL`.
   *
   * One listener for both, because they land on one view model: a message
   * that says nothing about either leaves the HUD alone rather than
   * triggering a repaint.
   */
  client?.addListener((message) => {
    const clock = hudClockFromWorkerMessage(message, viewModel.clock);
    const counts = hudCountsFromWorkerMessage(message);
    if (clock === undefined && counts === undefined) return;
    viewModel = {
      ...viewModel,
      ...(clock === undefined ? {} : { clock }),
      ...(counts === undefined ? {} : { counts }),
    };
    hud?.update(viewModel);
  });

  hud = mountHud(app, {
    localizer,
    viewModel,
    // Passed at mount, not applied by a later call: with no worker there is
    // no snapshot coming and nothing that would ever repaint, so a sentence
    // the HUD only learned about afterwards would never be painted at all
    // (issue #82). It is also the whole truth about this page -- a `Worker`
    // constructor that threw does not un-throw -- so there is nothing to
    // clear it later either.
    //
    // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
    // is on, so an absent notice has to be an absent property.
    ...(simulationUnavailable ? { unavailable: unavailableNotice } : {}),
    build: buildCatalogue(),
    onIntent: (intent: HudIntent) => {
      switch (intent.kind) {
        // Chrome: the HUD has already applied it locally and there is nothing
        // for a host to do.
        case 'select-tab':
        case 'toggle-panel':
          return;

        case 'arm-build-tool':
          // Also chrome, but it has a second half outside the HUD: it decides
          // whether a click on the *world* builds or moves the camera.
          tool?.setArmed(intent.armed, intent.definitionId);
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

        case 'place-build-order':
          requireSimulation(commands).submit({
            type: 'PlaceBuildOrder',
            // A fresh id per order: the kernel refuses a duplicate, and a
            // stable one would make the second wall a no-op.
            orderId: `order-${crypto.randomUUID()}`,
            definitionId: intent.definitionId,
            x: intent.x,
            y: intent.y,
            edge: intent.edge,
          });
          return;
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

  tool?.attachReadout((target) => hud?.setBuildTarget(target));
  return hud;
}

/**
 * `savePanelHost` is the HUD's aside slot, not `#app`.
 *
 * The save panel used to be appended to `#app` as a sibling of the HUD and
 * positioned by its own `position: fixed` rule, which is exactly how it ended
 * up underneath the Build panel with no layout relating the two (issue #88).
 * Mounting it into the slot puts it in the HUD's grid, so the HUD's own
 * layout decides where it goes and the collision cannot recur.
 */
async function bootPersistence(client: SimulationClient, savePanelHost: HTMLElement): Promise<void> {
  let controller: SessionController;
  let panel: SavePanel;
  try {
    const database = await openLockstateDatabase();
    const repository = new PrisonSaveRepository(new IndexedDbLocalSaveStore(database));

    // Authoritative simulation state lives in the worker, never here.
    // Saving goes through its snapshot request/response (ADR 0003), so the
    // main thread only ever holds derived projections and save envelopes.
    const host = new WorkerSessionHost(client);

    controller = new SessionController(repository, host, {
      gameVersion: GAME_VERSION,
      onSaveResult: (_prisonId: string, result: SaveResult) => panel.reportBackgroundSave(result),
    });
    panel = new SavePanel(controller, savePanelHost, localizer);
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
      });

// The save panel is laid out by the HUD, so there is nowhere to put it until
// the HUD is mounted. That is not a new dependency in disguise: with no
// interface there is no screen for a save panel to be on.
if (simulation !== undefined && mountedHud !== undefined) {
  void bootPersistence(simulation, mountedHud.asideSlot);
}
