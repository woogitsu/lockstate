import Phaser from 'phaser';
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
import { SavePanel } from './ui/save-panel';
import { EMPTY_HUD_VIEW_MODEL, mountHud, type HudIntent } from './ui/hud';
import { defaultLocaleEnCatalog } from './content/default-locale-en';
import { messageCatalogFromLocalizationCatalog } from './services/localization/catalog';
import { Localizer } from './services/localization/localizer';
import './styles.css';

const GAME_VERSION = 'lockstate-dev';

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

const worldScene = new WorldScene({
  feed: renderFeed,
  loadAtlasLibrary: () => atlasLibrary,
});

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#0b0e12',
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
function mountInterface(app: HTMLElement, simulationUnavailable = false): void {
  const localizer = new Localizer({
    locale: 'en',
    catalogs: [messageCatalogFromLocalizationCatalog('en', defaultLocaleEnCatalog)],
  });

  mountHud(app, {
    localizer,
    // Without a worker there is no simulation and no session, so there is
    // genuinely nothing to save -- a save panel here would be a prop. What
    // the player is owed is being *told*, which the console message alone
    // never did. The alerts region already exists for exactly this.
    ...(simulationUnavailable
      ? {
          viewModel: {
            ...EMPTY_HUD_VIEW_MODEL,
            alerts: [
              {
                id: 'simulation-unavailable',
                labelKey: 'hud.alerts.simulation-unavailable',
                severity: 'danger',
              },
            ],
          },
        }
      : {}),
    onIntent: (intent: HudIntent) => {
      // `select-tab` and `toggle-panel` are chrome: the HUD has already
      // applied them locally and there is nothing for a host to do.
      if (intent.kind !== 'set-clock') return;

      // `set-clock` is a command, and there is no one to send it to yet:
      // `FixedStepClock` exposes no accessor for its `ClockControl`, so the
      // main thread cannot reach the worker's clock (recorded in
      // docs/HUD_PROJECTIONS.md). Rejecting surfaces that on the transport
      // controls through the HUD's own error path. Silently returning would
      // be worse -- a pause button that reports success and does nothing is
      // a lie the player has no way to detect.
      throw new Error('Simulation transport control is not wired to the worker yet.');
    },
    onError: (failure) => console.warn('HUD action failed', failure),
  });
}

async function bootPersistence(client: SimulationClient): Promise<void> {
  const app = document.getElementById('app');
  if (app === null) return;

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
    panel = new SavePanel(controller, app);
  } catch (error) {
    console.warn('Local save storage is unavailable; continuing without persistence.', error);
    return;
  }

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
if (appRoot !== null) mountInterface(appRoot, simulation === undefined);

if (simulation !== undefined) void bootPersistence(simulation);
