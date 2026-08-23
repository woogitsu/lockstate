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
import {
  EMPTY_HUD_VIEW_MODEL,
  HUD_MESSAGE_KEY,
  mountHud,
  type HudBuildViewModel,
  type HudBuildableViewModel,
  type HudHandle,
  type HudIntent,
  type HudViewModel,
} from './ui/hud';
import { SimulationCommandSender } from './ui/simulation-commands';
import { BUILDABLE_REGISTRY } from './simulation/construction';
import type { LocalizationKey } from './content/localization';
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

function mountInterface(app: HTMLElement, client: SimulationClient): void {
  const localizer = new Localizer({
    locale: 'en',
    catalogs: [messageCatalogFromLocalizationCatalog('en', defaultLocaleEnCatalog)],
  });

  const commands = new SimulationCommandSender(client);

  let hud: HudHandle | undefined;
  let viewModel: HudViewModel = EMPTY_HUD_VIEW_MODEL;

  /**
   * Repaints the clock from what the worker last said, and from nothing else.
   *
   * Only `mode` and `speed` move. Day and minute-of-day stay at their
   * defaults because no simulation mapping from ticks to a wall clock exists
   * (`docs/HUD_PROJECTIONS.md`, gap 5) -- inventing one here would put a
   * number on screen that no system produces.
   */
  const applyClock = (mode: 'paused' | 'running', speed: 1 | 2 | 4): void => {
    viewModel = { ...viewModel, clock: { ...viewModel.clock, mode, speed } };
    hud?.update(viewModel);
  };

  client.addListener((message) => {
    if (message.kind === 'simulation/ready' || message.kind === 'simulation/clock-state') {
      const { clock } = message.payload;
      applyClock(clock.mode, clock.mode === 'running' ? clock.speed : viewModel.clock.speed);
    }
  });

  hud = mountHud(app, {
    localizer,
    build: buildCatalogue(),
    onIntent: (intent: HudIntent) => {
      switch (intent.kind) {
        // Chrome: the HUD has already applied it locally and there is nothing
        // for a host to do.
        case 'select-tab':
        case 'toggle-panel':
          return;

        case 'set-clock':
          // Throwing when there is no session surfaces on the transport
          // control through the HUD's own error path. Silently returning
          // would be worse -- a pause button that reports success and does
          // nothing is a lie the player has no way to detect.
          commands.setClock(intent.mode === 'paused' ? { mode: 'paused' } : { mode: 'running', speed: intent.speed });
          return;

        case 'place-build-order':
          commands.submit({
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
}

async function bootPersistence(client: SimulationClient): Promise<void> {
  const app = document.getElementById('app');
  if (app === null) return;

  mountInterface(app, client);

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

if (simulation !== undefined) void bootPersistence(simulation);
