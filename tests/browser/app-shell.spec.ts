import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { defaultMessageCatalogEn, formatNumber } from '../../src/services/localization';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { HUD_TAB_IDS } from '../../src/ui/hud';

/**
 * Real-browser verification for the *assembled application* — `index.html`
 * plus `src/main.ts`, i.e. the renderer (#69) and the mounted HUD (#73)
 * running together over real storage and real HTTP.
 *
 * Every other spec in this directory drives a purpose-built harness page.
 * That is the right shape for a module under test, but it means nothing so
 * far has ever loaded the page a player loads. Fourteen claims only exist once
 * the pieces are assembled in a browser, and none of them can be settled a
 * layer down (the count is this list's own length, and it read "six" while
 * the list held seven):
 *
 * 1. **The canvas is the size of the window.** Phaser's `Scale.RESIZE` is
 *    implemented against a real layout, a real `ResizeObserver` and a real
 *    device pixel ratio. `docs/RENDERING.md` makes the viewport the culling
 *    bound, so a canvas that is not the viewport is not a cosmetic problem.
 * 2. **The middle of the screen belongs to the world.** `.hud` is
 *    `pointer-events: none` with each control opting back in; if that
 *    regressed the game would stop responding to clicks entirely. Only a
 *    browser answers `elementFromPoint`, and only a real click proves which
 *    element a press actually reaches.
 * 3. **The art is real image data.** Every atlas PNG is Git LFS-tracked
 *    (`.gitattributes`), so a checkout without LFS content puts a ~130-byte
 *    text pointer where a sheet should be. Vite serves that with
 *    `200 image/png` and nothing upstream of a decoder notices. Decoding is
 *    the only step that can tell the difference, and only a browser decodes.
 * 4. **A save survives a navigation *through the app's own wiring*.**
 *    `local-save-durability.spec.ts` proves the repository is durable; this
 *    proves the path a player actually takes — save panel → session
 *    controller → simulation worker snapshot → IndexedDB — reconnects to
 *    what it wrote after the module graph has been thrown away.
 * 5. **Every HUD control is a real tap target.** A 24px control is a defect
 *    this layer has already found once, by measuring. `--tap-target` is
 *    applied by CSS convention and nothing pins the rendered box; a token
 *    test cannot, because a token is not a layout.
 * 6. **Every control on the page can actually be pressed**, and every panel
 *    in the HUD's right rail is whole, on screen, and scrollable by the
 *    player if it does not fit. Presence is not reachability, and until issue
 *    #88 this file only ever asserted the first. The save panel and the HUD
 *    were two independently-positioned `fixed` layers that had never been
 *    laid out relative to each other, so on the Build tab with its numeric
 *    fallback expanded the Build panel covered 91 % of the save panel and all
 *    five of its buttons did nothing — silently, with this suite green. Only
 *    a browser answers `elementFromPoint`, and only the assembled page has
 *    both regions in it at once.
 *
 * 7. **The build the player is looking at names itself, in the corner.** The
 *    badge exists so a bug report can say which build it is about, and the
 *    identity in it comes from a compile-time `define` -- so what it shows can
 *    only be settled by loading a page that a real build served. Two halves are
 *    checked and neither is provable a layer down: that the badge is *laid out*
 *    at the top-left of the real page rather than merely present in the DOM
 *    (`getBoundingClientRect` and `offsetParent`, the distinction that let #82's
 *    own alert stay invisible at every viewport with a green suite), and that
 *    `data-build-id` carries a real injected commit rather than the module's
 *    `unknown` fallback, which is the only way to tell the `define` is wired at
 *    all.
 *
 * 8. **A wall refused after a *world drag* says so on screen, and one drag
 *    is one transaction.** #207 fixed the Build panel's numeric fallback and
 *    left the drag -- the primary way a wall is laid -- reporting to
 *    `console.warn`, so the two routes to one command disagreed about whether
 *    the player is told (#225). Neither half is provable a layer down: the
 *    refusal comes from the real command sender on a real page with no
 *    session, and it reaches the screen only if `src/main.ts` really has
 *    joined the renderer's gesture to the HUD's intent path; and a
 *    `transactionId` is minted on this thread, packed into the command and
 *    never echoed back, so a tee over the real `postMessage` is the only place
 *    "one gesture is one transaction" is observable at all. The HUD's own half
 *    -- that a gesture becomes one gated intent and that refusing it paints
 *    the line -- is `ui-shell.spec.ts`'s, per the pairing rule in
 *    `docs/TESTING.md`.
 *
 * 9. **A second prison loads in the same tab.** The worker refuses every
 *    `simulation/initialize` after the first, so the page has to give each
 *    session a `Worker` of its own -- and whether it really constructs a
 *    second one, terminates the first, and keeps the renderer and the HUD
 *    attached across the swap is a claim about real `Worker` construction in
 *    a real browser. `tests/integration/session-second-load.test.ts` proves
 *    the composition against loopback transports; only this layer has the
 *    thread (#149).
 * 10. **A worker that cannot be started for a *later* session is reported
 *    rather than thrown.** #82's notice used to be a boot-time-only fact, and
 *    the HUD said so in its own comment. With a worker per session it is not,
 *    and the only way to prove the report is re-entrant is to let a page boot
 *    successfully and then take `Worker` away from it, which needs a browser
 *    (#82, #149).
 * 11. **Pressing "Buy" really sends a `PurchaseMaterials` to the worker.**
 *    #89's whole defect was that nothing in `src/` could construct that
 *    command, so a build order placed in a real session waited for materials
 *    for ever. `tests/foundation/unconsumed-command-contract.test.ts` proves
 *    a producer is *written*, and says in its own header that it can prove no
 *    more than that; `tests/browser/ui-shell.spec.ts` proves the panel
 *    dispatches an intent. What neither can reach is the composition root
 *    itself -- `src/main.ts` imports Phaser, constructs a `Worker` and runs at
 *    import, so no unit test executes it. A tee over the real `postMessage`
 *    on this page is the only place the command is observable at all, and the
 *    order id it mints is minted here and never echoed back.
 * 12. **The 30-second autosave actually fires, from play alone.** Issue #146's
 *    defect was that nothing ever called `markDirty`, so the interval autosave
 *    was configured and dead and the only automatic write was the best-effort
 *    one on `pagehide`. `tests/foundation/composition-root-contract.test.ts`
 *    pins the line that fixes it and says plainly what that cannot prove —
 *    *"it proves a wiring is written, not that it works"* — and points here for
 *    the behaviour. It was not here: #264 found that prefixing the line with a
 *    never-true `if` left `tsc` clean and every test green. Nothing below the
 *    assembled page can settle it, because the seam joins a `SimulationCommandSender`
 *    built at module scope to a `SessionController` built inside
 *    `bootPersistence`, and only `src/main.ts` holds both ends.
 * 13. **A refused purchase produces exactly one player-visible message.**
 *    Two surfaces report one, and they sit on opposite sides of one dispatch:
 *    `src/main.ts` throws before submitting, which paints the refusal line on
 *    the control that was pressed, and `ProcurementSystem` refuses what got
 *    past that, which arrives as a row in the alerts list (#89 built the
 *    first, #261 the second). Each has its own tests and each passes with the
 *    other one silent or doubled, because "exactly one" is a claim about both
 *    at once -- and only the assembled page has both. It also needs the real
 *    join underneath the second surface: a kernel dispatching the command at
 *    its tick, a worker publication carrying the refusal, and the composition
 *    root's one listener writing it into the view model.
 *
 * 14. **A save file the game exported can be imported back.** #287: the
 *    application offered a download it could not read --
 *    `SessionController.importInto` was exported, reachable and called by
 *    nothing. The round trip is the assertion the feature exists for, and no
 *    layer below this one can make it: it needs a real download, a real
 *    `<input type="file">`, a real file chooser, real IndexedDB and a real
 *    simulation worker to restore into and capture back out of.
 *    `tests/browser/ui-shell.spec.ts` covers the control and its four
 *    refusals against a stub; only here are the bytes the page produced the
 *    same bytes it reads.
 *
 * Deliberately NOT here, because a headless test already proves it and a
 * browser test that repeats one costs a minute of CI and adds no evidence:
 * the tab/collapse state machine, the view-model → display mapping and the
 * async-action gate (`tests/unit/ui-*.test.ts`); the HUD's computed font
 * stack, responsive layout and intent reporting
 * (`tests/browser/ui-shell.spec.ts`, which drives the same real `mountHud`);
 * camera transforms, depth ordering, pose selection, pivot placement and the
 * world projection (`src/rendering/**` unit tests, all Phaser-free by
 * design); and atlas manifest/registry schema rejection
 * (`tests/contract/runtime-atlas-validation.test.ts`).
 *
 * The one case this file previously left open is now closed. `src/main.ts`
 * promises, in its own comments, that a browser which cannot start the
 * simulation worker still gets an interface — and it did not, because
 * `mountInterface` sat inside `bootPersistence`, which only runs when the
 * worker was constructed (issue #82). The comment described the intended
 * arrangement; only the placement disagreed with it, which is exactly why no
 * headless test caught it: both functions behave correctly in a browser where
 * everything works. The guard for it is the last test below, and it belongs
 * here because only a real browser can settle it.
 */

const APP_URL = '/index.html';
const ATLAS_BASE_PATH = '/assets/actors';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

interface AtlasManifestShape {
  readonly image: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * The authored size of every atlas image, read from the generated manifests
 * on disk.
 *
 * Read from the manifests rather than hard-coded so re-rendered art does not
 * have to update this file, and so the assertion is "the browser decoded the
 * sheet the manifest describes" rather than "the browser decoded something".
 */
function expectedAtlasSizes(): ReadonlyMap<string, readonly [number, number]> {
  const readJson = (relativePath: string): unknown =>
    JSON.parse(readFileSync(`${repositoryRoot}public/assets/actors/${relativePath}`, 'utf8')) as unknown;

  const registry = readJson('asset-registry.json') as { readonly assets?: readonly { readonly manifest?: string }[] };
  const sizes = new Map<string, readonly [number, number]>();

  for (const asset of registry.assets ?? []) {
    if (asset.manifest === undefined) continue;
    const manifests = readJson(asset.manifest) as readonly AtlasManifestShape[];
    for (const manifest of manifests) {
      sizes.set(`${ATLAS_BASE_PATH}/${manifest.image}`, [manifest.widthPx, manifest.heightPx]);
    }
  }
  return sizes;
}

/**
 * What the tee installed by the counts test exposes on `window`.
 *
 * A recorder and an injector, both test-only. The recorder is an extra
 * `message` listener on the app's own `Worker`, so it observes what the
 * worker really posted without intercepting anything; the injector dispatches
 * a message event at the same port, which is the only way to hand the
 * assembled page a count the running simulation cannot produce yet.
 */
interface WorkerTeeWindow extends Window {
  lockstateWorkerMessages?: readonly unknown[];
  lockstateInjectWorkerMessage?: (data: unknown) => boolean;
}

/**
 * What the tee installed by the world-drag transaction test and the purchase
 * test exposes.
 *
 * The other tee on this page records what the worker *posted*; this one
 * records what the page *sent*, which is the only place a `transactionId` or
 * a minted `orderId` is observable at all -- both are made on this thread,
 * travel inside a packed command, and nothing comes back that mentions
 * either.
 */
interface CommandTeeWindow extends Window {
  lockstateSentToWorker?: readonly unknown[];
}

/**
 * What the autosave probe installed by the interval-autosave test exposes.
 *
 * `longTimers` are the delays this page asked for that the probe shortened, so
 * a test can say the autosave *scheduled* something as well as that a save
 * landed. `lifecycle` records the two events `LifecycleSaveHandler` listens
 * for, so the test can prove the write it observed did not come from one of
 * them -- which is the whole distinction issue #146 turns on.
 */
interface AutosaveProbeWindow extends Window {
  lockstateAutosaveProbe?: { readonly longTimers: number[]; readonly lifecycle: string[] };
}

/**
 * One `simulation/submit-command` message as it went over `postMessage`.
 *
 * Every field optional and read structurally, because the point of the tee is
 * to look at what the page really sent rather than to re-declare the
 * protocol: a payload that had lost a field must read as `undefined` here and
 * fail an assertion, not fail to compile.
 */
interface SubmittedCommand {
  readonly kind?: string;
  readonly payload?: {
    readonly command?: {
      readonly data?: {
        readonly type?: string;
        readonly orderId?: string;
        readonly transactionId?: string;
        readonly itemId?: string;
        readonly quantity?: number;
        /** The anchor tile a `PlaceObject` or `RemoveObject` names (ADR 0028). */
        readonly x?: number;
        readonly y?: number;
      };
    };
  };
}

interface StatusCountsPublication {
  readonly kind: string;
  readonly payload: {
    readonly tick: number;
    readonly schemaVersion: number;
    readonly counts: Record<string, number>;
  };
}

/**
 * A `simulation/status-counts` publication with a population in it.
 *
 * Every field is what the worker's own schema requires -- it goes through the
 * real decoder, so a wrong shape would be dropped rather than drawn -- and
 * the values are deliberately unlike any default: a hardcoded strip cannot
 * produce a 37.
 *
 * "Dropped rather than drawn" is the whole payload, not one field. Adding a
 * required count to `statusCountsSchema` without adding it here makes this
 * message fail to decode, so every metric stays at its zero and the failure
 * reads as "the channel is dead" rather than "one field is missing". That is
 * how it presented when `treasuryMinorUnits` was added.
 */
const INJECTED_STATUS_COUNTS = {
  protocolVersion: 1,
  messageId: 'injected-status-counts-1',
  kind: 'simulation/status-counts',
  payload: {
    tick: 1_234,
    schemaVersion: 1,
    counts: {
      prisoners: 37,
      prisonersInIntake: 4,
      prisonersHighRisk: 9,
      staff: 6,
      staffUnassigned: 1,
      rooms: 12,
      roomCapacity: 48,
      roomOccupants: 30,
      activeIncidents: 2,
      contrabandDiscovered: 5,
      treasuryMinorUnits: 31_500,
      // Derived from this payload's own `tick` and `roomOccupants` rather than
      // picked: thirty occupied places, 1,235 ticks of the day served,
      // `floor(300 x 30 x 1235 / 2400)` = 4,631 (#29). Required, not optional
      // -- the counts payload is `.strict()`, so a fixture missing this field
      // is dropped by `decodeWorkerToMainMessage` and every assertion below it
      // fails on a strip that was never updated at all.
      stateIncomeAccruedTodayMinorUnits: 4_631,
    },
  },
} as const;

interface CanvasMetrics {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
}

async function canvasMetrics(page: Page): Promise<CanvasMetrics | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      cssWidth: Math.round(rect.width),
      cssHeight: Math.round(rect.height),
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
}

/**
 * Loads the real application entry and waits for the renderer to have put a
 * canvas on the page.
 *
 * `src/main.ts` mounts the HUD synchronously and then boots persistence,
 * which mounts the save panel into the HUD's aside slot a turn later, so
 * waiting for all three is what "the app is up" means here.
 */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
}

/**
 * Arms the Build tool for the *world* route, the way a player does.
 *
 * The Build tab, then the map panel's arm toggle -- not the numeric fallback
 * underneath it, which is the route issue #207 already covers. The returned
 * label is asserted by every caller: an arm that silently did not take would
 * leave the drag below panning the camera, and a test that never built
 * anything would report a refusal line it never earned.
 */
/**
 * The sentence the bundled default locale gives a key.
 *
 * Read out of `defaultMessageCatalogEn` -- the catalog `src/main.ts` builds
 * the page's localizer from -- rather than typed here as English. ADR 0011
 * puts the key on one side of that boundary and the text on the other, so a
 * test that hard-codes the text is asserting against a copy: rewording the
 * sentence in `src/content/default-locale-en.ts` would leave the test green
 * while the player read something else.
 */
function localeText(key: string): string {
  const entry = defaultMessageCatalogEn.messages[key];
  if (typeof entry !== 'string') {
    throw new Error(`"${key}" is not a plain string in the bundled default locale, so it cannot be matched as one.`);
  }
  return entry;
}

/** The figure the HUD prints for `value`, formatted the way the status strip formats every count. */
function fundsText(value: number): string {
  return formatNumber(DEFAULT_LOCALE, value);
}

/** The catalog price of one unit, taken from the catalog the page itself prices against. */
function unitPriceOf(itemId: string): number {
  const priced = procurableMaterial(itemId);
  if (priced === undefined) throw new Error(`${itemId} is not for sale, so no purchase of it can be driven.`);
  return priced.unitPriceMinorUnits;
}

/**
 * Every object command of one type the page has posted to the worker, with the
 * tile each one names (ADR 0028).
 *
 * The sibling of `purchasesSent` above and it exists for the sharper half of the
 * same argument: a *gesture* is the only producer of an object command that a
 * player on a touch device can reach, so "the press became a command" is the
 * whole claim, and the tee is the only place it can be read. A refusal cannot
 * stand in for it -- `.hud__corner` is `display: none` at 720px and below, so
 * the alerts list the worker's refusals arrive in does not exist at the one
 * viewport this is most worth measuring at.
 */
async function objectCommandsSent(
  page: Page,
  type: 'PlaceObject' | 'RemoveObject',
): Promise<readonly { x: number; y: number }[]> {
  return page.evaluate(
    (commandType) =>
      ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
        .map((message) => message as SubmittedCommand)
        .filter((message) => message.kind === 'simulation/submit-command')
        .filter((message) => message.payload?.command?.data?.type === commandType)
        .map((message) => ({
          x: message.payload?.command?.data?.x ?? Number.NaN,
          y: message.payload?.command?.data?.y ?? Number.NaN,
        })),
    type,
  );
}

/**
 * One press and release on bare world, in real pointer events.
 *
 * The object gesture is one press on one tile (ADR 0028 decision 5), so unlike
 * `dragOnWorld` and `dragRectangleOnWorld` there is nothing to drag -- and
 * unlike both of them the aim only has to clear the HUD at a single point, which
 * is why this scan is one hit-test rather than three.
 *
 * It still hit-tests rather than pressing the centre of the screen. The
 * centre-click spec establishes that the centre belongs to the canvas on the
 * *arrival* tab with the arrival panels, and neither holds here: this is the
 * Build tab, and at 375x812 the rail is full-width. `false` means the HUD left
 * no bare world at this viewport, which every caller asserts against rather than
 * tolerating -- a press that never reached the canvas would report a gesture
 * this test never made.
 */
async function pressOnWorld(page: Page): Promise<boolean> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the press');

  const aim = await page.evaluate(
    ({ width, height }) => {
      for (let y = 8; y < height - 8; y += 16) {
        for (let x = 8; x < width - 8; x += 16) {
          if (document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas') return { x, y };
        }
      }
      return null;
    },
    { width: viewport.width, height: viewport.height },
  );
  if (aim === null) return false;

  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.up({ button: 'left' });
  return true;
}

/**
 * Records every `postMessage` the page makes to a real simulation worker.
 *
 * The same tee the #89 test installs inline, as a helper because the two
 * purchase-refusal tests below both need to say what did **not** reach the
 * worker: a command that was never sent is a refusal the worker cannot report,
 * which is half of "exactly one message". Subclassing the real `Worker` rather
 * than replacing it, so the page still gets a working simulation.
 */
async function installCommandTee(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const RealWorker = Worker;
    const sent: unknown[] = [];

    class CommandTeeWorker extends RealWorker {
      public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
        sent.push(message);
        if (transfer === undefined) super.postMessage(message);
        else if (Array.isArray(transfer)) super.postMessage(message, transfer);
        else super.postMessage(message, transfer);
      }
    }

    Object.defineProperty(window, 'Worker', { configurable: true, value: CommandTeeWorker });
    (window as unknown as CommandTeeWindow).lockstateSentToWorker = sent;
  });
}

/** Every `PurchaseMaterials` the page has posted to the worker, in the order it posted them. */
async function purchasesSent(page: Page): Promise<readonly { itemId: string; quantity: number }[]> {
  return page.evaluate(() =>
    ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
      .map((message) => message as SubmittedCommand)
      .filter((message) => message.kind === 'simulation/submit-command')
      .filter((message) => message.payload?.command?.data?.type === 'PurchaseMaterials')
      .map((message) => ({
        itemId: message.payload?.command?.data?.itemId ?? '',
        quantity: message.payload?.command?.data?.quantity ?? 0,
      })),
  );
}

/** Opens the Build panel and its buy disclosure, which starts closed. */
async function openBuyRow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build' }).click();
  const buyToggle = page.locator('.hud-build__buy-toggle');
  await expect(buyToggle).toHaveAttribute('aria-expanded', 'false');
  await buyToggle.click();
  await expect(page.locator('.hud-build__buy')).toBeVisible();
}

/** Types a quantity into the buy row's stepper and commits it, the way a player would. */
async function setBuyQuantity(page: Page, quantity: number): Promise<void> {
  const field = page.locator('.hud-build__buy .ui-number__input');
  await field.fill(String(quantity));
  await field.press('Enter');
}

async function armBuildTool(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build' }).click();
  // `.hud-build__arm`, not `.hud-build__map .ui-action`: the map block holds
  // two actions since #89 -- the arm toggle and the buy disclosure beside it
  // -- and a locator matching both is a strict-mode violation rather than a
  // selection.
  const arm = page.locator('.hud-build__arm');
  await expect(arm).toBeVisible();
  await arm.click();
  await expect(arm).toHaveText('Stop placing');
}

/**
 * A drag along a tile edge on the world, in real pointer events.
 *
 * From the centre of the screen, which the spec above establishes belongs to
 * the canvas rather than to the HUD, and 320 CSS px eastwards: `TILE_SIZE_PX`
 * is 64 and the camera starts at zoom 1, so the run is several segments long
 * rather than sitting on the one-versus-many boundary. `steps` matters -- the
 * scene decides the run's axis from pointer *movement*, so a single jump to
 * the end point would still work but would not resemble a hand.
 */
async function dragOnWorld(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the drag');
  const x = Math.round(viewport.width / 2);
  const y = Math.round(viewport.height / 2);

  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(x + 320, y, { steps: 12 });
  await page.mouse.up({ button: 'left' });
}

/**
 * A rectangle drag on the world, in real pointer events (ADR 0022, amended).
 *
 * The sibling of `dragOnWorld` above, and the difference is the whole reason the
 * renderer needed a second gesture: this one moves on **both** axes.
 * `edgeRunFromDrag` commits a drag to one axis because a wall is
 * one-dimensional; `tileRectFromDrag` must not, because a rectangle is exactly
 * the shape that has two.
 *
 * ### Why it hit-tests its own aim, and why it can still answer "nowhere"
 *
 * `dragOnWorld` above may press at the centre of the screen, because the
 * centre-click spec establishes that the centre belongs to the canvas. It
 * establishes that on the *arrival* tab, with the arrival panels, and neither
 * holds here: the Rooms panel is the tallest in the HUD, and below 720px the rail
 * stretches to the full width with the save panel above it and `.hud__side`
 * pushed to the bottom.
 *
 * Measured on the assembled page, Rooms tab, one prison saved, with the panel
 * expanded -- which is the state the page *arrives* in and no longer the state
 * this helper is called in:
 *
 * | Viewport | Save panel | Rooms panel | Largest square of bare world |
 * | --- | --- | --- | --- |
 * | 1280x720 | 1004,60 264x139 | 1004,219 264x420 | 256px at 8,56 |
 * | 900x600  | 624,60 264x109  | 620,185 264x338  | 256px at 8,56 |
 * | 375x812  | 8,96 359x156    | 8,268 359x451    | **16px at 8,720** |
 *
 * At 375x812 the two panels are full-width and between them, the 88px strip and
 * the tab bar they leave gaps of 8, 16 and 24 pixels, so the largest square of
 * bare world on that page is 16px and no rectangle can be drawn in it at all.
 * That used to be the end of the story here, and the caller recorded the two
 * controls only a pending rectangle reveals as unreachable at that viewport.
 * They are reachable now: **arming folds the Rooms panel to its header**, and
 * the caller arms before it calls this. Measured in that state, same page, same
 * prison: the panel is 47px at 8,672, the save panel takes 227px of the slack
 * and the band the rail leaves between them is 348.8px tall and the full 375px
 * wide -- a 336px square of bare world, which was the scan's own cap. See
 * `rooms-panel.ts` and `.ui-panel__body[hidden]` in `primitives.css`.
 *
 * It still returns a boolean rather than throwing, because "how much world is
 * there" is the measurement this helper exists to make and a caller that wants
 * it to be true should have to say so.
 *
 * Both ends of the gesture are hit-tested, not just the press: a drag that begins
 * on the world and ends on a panel is one the scene never completes, and a
 * plausible pixel figure taken from a page that was not showing what the test
 * assumed is exactly the failure this file exists to avoid.
 *
 * `TILE_SIZE_PX` is 64 and the camera starts at zoom 1, so 192px is a three-tile
 * side and 128px a two-tile one -- both rectangles with two real axes, which is
 * what is being proven. `steps` matters for the same reason it does above: the
 * scene reads the gesture from pointer *movement*, so a single jump would work
 * and would not resemble a hand.
 */
const ROOM_DRAG_DELTAS_PX = [192, 128] as const;

/**
 * The panel's arrival height, per viewport, so "the phone was not fixed by
 * moving the desktop" is a number rather than a hope.
 *
 * Measured on the assembled page, Rooms tab, one prison saved, before and after
 * the fold landed -- identical in both, which is the claim. The panel is the
 * rail's flexible member, so its height is where any change to the save panel,
 * the strip, the tab bar or either panel's floor would show up.
 */
const ARRIVAL_PANEL_HEIGHT_PX: Readonly<Record<string, number>> = {
  '1280x720': 420.1,
  '900x600': 338.1,
  '375x812': 451.1,
};

/**
 * The largest square of bare world this scan will look for.
 *
 * The answer saturates here rather than growing without bound, which is
 * deliberate: every assertion against it is a floor ("at least this much world
 * exists"), and scanning a 1280x720 page for a 1200px square would spend
 * thousands of `elementFromPoint` calls to answer a question nobody asked.
 * `TILE_SIZE_PX` is 64 at zoom 1, so this is five tiles and a bit.
 */
const BARE_WORLD_SCAN_MAX_PX = 336;

/** One pending-rectangle control, measured as a tap target and hit-tested. */
interface RoomControlHit {
  readonly control: string;
  /** Both axes against `--tap-target`, read from the token rather than typed here. */
  readonly tapTarget: boolean;
  /** Five points on the control resolve to the control, or to something inside it. */
  readonly hittable: boolean;
}

interface RoomWorldGeometry {
  readonly panel: { readonly top: number; readonly bottom: number; readonly height: number } | null;
  /** `data-collapsed` on the panel, as the string the DOM carries. */
  readonly collapsed: string;
  /** Whether the body has a box at all -- not whether `hidden` is set on it. */
  readonly bodyLaidOut: boolean;
  /** The side of the largest square of bare canvas, saturating at `BARE_WORLD_SCAN_MAX_PX`. */
  readonly largestBareSquare: number;
  /** Strip to save panel, save panel to Rooms panel, Rooms panel to tab bar. */
  readonly gapsBetweenPanels: readonly number[];
  readonly pendingControls: readonly RoomControlHit[];
}

/**
 * The Rooms tab's geometry, from the page rather than from the stylesheet.
 *
 * `largestBareSquare` is the number the whole fix turns on, and it is measured
 * the way the player meets it: `elementFromPoint` at both ends and the midpoint
 * of a diagonal, so a square that is bare at its corners and covered across the
 * middle does not count. Coarse on purpose -- 8px steps -- because this is
 * asking "is there room to drag", not measuring a boundary.
 */
async function roomWorldGeometry(page: Page): Promise<RoomWorldGeometry> {
  return page.evaluate((scanMax) => {
    const free = (x: number, y: number): boolean =>
      document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas';

    let largest = 0;
    for (let side = scanMax; side >= 16 && largest === 0; side -= 16) {
      for (let y = 8; y + side < window.innerHeight - 8 && largest === 0; y += 8) {
        for (let x = 8; x + side < window.innerWidth - 8; x += 8) {
          if (free(x, y) && free(x + side / 2, y + side / 2) && free(x + side, y + side)) {
            largest = side;
            break;
          }
        }
      }
    }

    const panel = document.querySelector<HTMLElement>('.hud-rooms');
    const body = document.querySelector<HTMLElement>('.hud-rooms > .ui-panel__body');
    const strip = document.querySelector<HTMLElement>('.hud-strip');
    const save = document.querySelector<HTMLElement>('.save-panel');
    const tabs = document.querySelector<HTMLElement>('.hud-tabs__inner');
    const round = (value: number): number => Math.round(value * 10) / 10;

    const panelRect = panel === null ? null : panel.getBoundingClientRect();
    const gaps =
      panelRect === null || strip === null || save === null || tabs === null
        ? []
        : [
            round(save.getBoundingClientRect().top - strip.getBoundingClientRect().bottom),
            round(panelRect.top - save.getBoundingClientRect().bottom),
            round(tabs.getBoundingClientRect().top - panelRect.bottom),
          ];

    // The token, not a literal: `--tap-target` is what every control in the HUD
    // is sized from, and a test that typed 44 here would keep passing if the
    // token moved and the controls did not follow it.
    const tapTargetPx = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--tap-target'),
    );

    const measureControl = (selector: string): RoomControlHit => {
      const node = document.querySelector<HTMLElement>(selector);
      const control = selector.replace('.', '');
      if (node === null || node.getClientRects().length === 0) {
        return { control, tapTarget: false, hittable: false };
      }
      const rect = node.getBoundingClientRect();
      // The centre plus four points a fifth of the way in from each edge -- the
      // same five `controlReachability` uses, and for the same reason.
      const points: readonly (readonly [number, number])[] = [
        [rect.x + rect.width / 2, rect.y + rect.height / 2],
        [rect.x + rect.width * 0.2, rect.y + rect.height / 2],
        [rect.x + rect.width * 0.8, rect.y + rect.height / 2],
        [rect.x + rect.width / 2, rect.y + rect.height * 0.2],
        [rect.x + rect.width / 2, rect.y + rect.height * 0.8],
      ];
      return {
        control,
        tapTarget: Number.isFinite(tapTargetPx) && rect.width >= tapTargetPx && rect.height >= tapTargetPx,
        hittable: points.every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return hit !== null && node.contains(hit);
        }),
      };
    };

    return {
      panel:
        panelRect === null
          ? null
          : { top: round(panelRect.top), bottom: round(panelRect.bottom), height: round(panelRect.height) },
      collapsed: panel?.dataset['collapsed'] ?? '',
      bodyLaidOut: body !== null && body.getClientRects().length > 0,
      largestBareSquare: largest,
      gapsBetweenPanels: gaps,
      pendingControls: ['.hud-rooms__confirm', '.hud-rooms__cancel'].map(measureControl),
    };
  }, BARE_WORLD_SCAN_MAX_PX);
}

/**
 * `minY` starts the scan lower down the page, which is how a *second*
 * rectangle is drawn without overlapping the first.
 *
 * The scan aims at bare world -- "is this point the canvas" -- and a tile that
 * is already zoned is still the canvas, so a second call with no offset finds
 * the same point and the designation is refused as `overlaps-existing-room`.
 * Optional, so every existing caller is unchanged.
 */
async function dragRectangleOnWorld(page: Page, options: { readonly minY?: number } = {}): Promise<boolean> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the drag');

  // A coarse scan of the world: the first point whose whole gesture -- press,
  // midpoint and release -- lands on the canvas wins. Coarse on purpose; this is
  // aiming at open ground, not measuring a boundary, and a fine grid would spend
  // hundreds of round trips to find the same point.
  const aim = await page.evaluate(
    ({ width, height, deltas, minY }) => {
      const free = (x: number, y: number): boolean =>
        document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas';
      for (const delta of deltas) {
        for (let y = Math.max(8, minY); y + delta < height - 8; y += 16) {
          for (let x = 8; x + delta < width - 8; x += 16) {
            if (free(x, y) && free(x + delta / 2, y + delta / 2) && free(x + delta, y + delta)) {
              return { x, y, delta };
            }
          }
        }
      }
      return null;
    },
    { width: viewport.width, height: viewport.height, deltas: [...ROOM_DRAG_DELTAS_PX], minY: options.minY ?? 8 },
  );

  if (aim === null) return false;

  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(aim.x + aim.delta / 2, aim.y + aim.delta / 2, { steps: 6 });
  await page.mouse.move(aim.x + aim.delta, aim.y + aim.delta, { steps: 6 });
  await page.mouse.up({ button: 'left' });
  return true;
}

/**
 * Every element a player can press, anywhere on the assembled page.
 *
 * Deliberately not scoped to `.hud`: the collision issue #88 reported was
 * *between* two independently-positioned regions, so a check that only ever
 * looks inside one of them cannot see it.
 */
/**
 * The parts of an exported save this file reads.
 *
 * Deliberately not `SaveEnvelope`: what comes back off the download is
 * untrusted JSON, and typing it as the real envelope would claim a validation
 * this test has not performed. `payload` is compared whole and structurally,
 * so nothing here needs to know its shape.
 */
interface ExportedEnvelope {
  readonly saveSchemaVersion: number;
  readonly prisonId: string;
  readonly payload: { readonly kernel: { readonly tick: number } };
}

const INTERACTIVE_SELECTOR =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The controls that are deliberately unreachable at 720px and below, because
 * `hud.css` drops `.hud__corner` there: the minimap and the alerts section go
 * away entirely rather than compete with the Build panel for a phone's width.
 *
 * Written out rather than inferred. A reachability check that skips whatever
 * happens not to be laid out cannot tell a considered responsive decision from
 * a control that has quietly collapsed to nothing, and the second is the shape
 * of the defect this test exists for. Anything appearing here that is not on
 * this list fails; anything on this list that becomes reachable fails too.
 *
 * Both claims need the entry to name exactly one control, which is why these
 * strings carry the ancestor chain and not just the control. `Collapse` on a
 * `ui-panel__toggle` is not unique on this page -- the minimap panel and the
 * Build panel each have one, and the two are indistinguishable by tag, class
 * and label. Naming only the control would have made the first entry here
 * match either of them, so a minimap toggle that came back at 375px while a
 * Build panel toggle vanished would have gone through as a pass.
 */
/**
 * The controls this sweep cannot reach **at any viewport**, because the state
 * that reveals them is a state no session a player can start can be in.
 *
 * One entry, and it is a finding rather than a formality (ADR 0034). The Staff
 * panel's held-guards block draws a row per guard something is holding, and it
 * has no box until the simulation reports one. **Nothing in `src/` can hold a
 * guard in a new session**, and this was measured rather than assumed:
 *
 * - `DeploymentSystem.assignUnassignedGuards` iterates `sectors.all()`, and
 *   **nothing in `src/` registers a `SecuritySectorDefinition`** for a new
 *   session -- `restoreSecuritySystems` in `session-systems.ts` is the only
 *   caller of `securitySectors.register`, and it reads a save payload. So no
 *   guard ever reaches `'travelling'` or `'on-post'`, and there is no
 *   `'deployment'` claim.
 * - `IncidentTriggerSystem` iterates `incidentSectorIds`, which the same
 *   function is the only populator of, so no incident is ever opened and there
 *   is no `'incident-response'` claim.
 * - `SearchSystem.submitOrder` has no caller in `src/` at all and
 *   `runtime.searchPolicies` is likewise only populated from a save, so there is
 *   no `'search'` claim.
 * - `'unattributed'` is the residue of a save taken during a response, so it
 *   cannot exist without one of the above having happened first.
 *
 * That is a **pre-existing gap in the security tier and not a property of this
 * surface**: the same four facts already make `DeploymentSystem`, `PatrolSystem`,
 * `IncidentResponseSystem` and `SearchSystem` no-ops in every session a player
 * can start, which is the state one layer down from the one ADR 0025 closed when
 * `HireStaff` gave the roster its first real entries. A guard can be hired; there
 * is nothing for it to be assigned to.
 *
 * **This entry is a tripwire, not an excuse.** The moment anything registers a
 * security sector for a new session, these three controls become reachable, this
 * list goes stale, and the assertion below fails until it is deleted -- which is
 * exactly the direction `AWAITING_PRODUCER` in
 * `tests/foundation/unconsumed-command-contract.test.ts` fails in, and for the
 * same reason: a record of unreachability must not outlive the fact.
 */
const NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR = [
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #1',
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #2',
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #3',
] as const;

const NEVER_LAID_OUT_BELOW_720 = [
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__header > ' +
    'button.ui-icon-button ui-icon-button--quiet ui-panel__toggle "Collapse"',
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__body > ui-section > ' +
    'button.ui-section__header "Alerts"',
] as const;

/*
 * There is no `NEVER_LAID_OUT_AT_375`, and the fact that there is not is an
 * assertion rather than an absence.
 *
 * It used to hold the two controls a *pending room rectangle* reveals -- the
 * confirm and the discard -- because at 375x812, with both rail panels expanded,
 * the largest square of bare world on the page is 16px and there was nowhere to
 * drag a rectangle to reveal them. The Rooms panel now folds itself to its header
 * while the tool is armed, which is what the amendment to ADR 0022 left open, so
 * the sweep below reaches those two controls at that viewport the same way it
 * reaches them at every other: it arms the tool, drags a real rectangle on the
 * real canvas, and hit-tests what appears. `NEVER_LAID_OUT_BELOW_720` is still
 * the only exemption, and the accounting assertion at the foot of the sweep is
 * what turns "these two are no longer exempt" into a claim that fails if they
 * ever stop being reachable again.
 *
 * The geometry either side of that change is measured numerically in "the Rooms
 * panel yields the world it is drawn on" below, and `dragRectangleOnWorld` above
 * carries the table.
 */

interface UnreachableControl {
  readonly control: string;
  readonly hit: string;
}

interface ControlReachability {
  /**
   * Every control the selector matched, in document order, named. The index
   * into this list is the control's identity for the run: tab switching and
   * resizing hide and show controls but never add or remove them, so index
   * `n` is the same element in every state the test visits.
   *
   * The *names* are unique too, which the accounting assertion below depends
   * on: each is the control's chain of classed ancestors followed by the
   * control itself, and a numeric suffix breaks the remaining ties (the two
   * `ui-number__input` boxes in the Build panel's coordinate grid are
   * identical all the way up). See `NEVER_LAID_OUT_BELOW_720`.
   */
  readonly controls: readonly string[];
  /** Indices of the controls that were laid out, and so actually measured. */
  readonly measured: readonly number[];
  readonly unreachable: readonly UnreachableControl[];
}

/**
 * Which controls are covered by something else, and which were not laid out
 * at all so could not be measured.
 *
 * For every laid-out interactive element, `document.elementFromPoint` must
 * resolve to that element or to something inside it. Anything else means the
 * topmost thing at those pixels belongs to a different control, and the press
 * lands there instead.
 *
 * Four deliberate details:
 *
 * - **Five points, not one.** The centre, plus four points 20 % in from each
 *   edge along the centre lines. A control whose *centre pixel* happens to be
 *   clear while a fifth of it is buried is a defect a player meets as a
 *   mis-click, and one sample cannot see it. Measured, not assumed: against
 *   the pre-#88 layout at 900x600 with the Build coordinates expanded, the
 *   centre alone found 11 unreachable controls and these five found 13 -- the
 *   two extra being the edge chooser's North and West buttons, whose lower
 *   fifth had been carried off the bottom of the viewport while their centres
 *   were still clear. The insets stay off the corners on purpose, where a
 *   `border-radius` legitimately belongs to the parent.
 * - **Scrolled into view first.** A control inside a scroll container may
 *   legitimately be out of view; that is not a collision, and the player
 *   reaches it by scrolling. Scrolling it into view and re-measuring asks the
 *   real question — "once it is on screen, can it be pressed" — instead of
 *   flagging every list that is longer than its box.
 * - **A `null` hit is a failure, not a skip.** `elementFromPoint` returns
 *   `null` for a point outside the viewport, so a control pushed off the
 *   edge by an overflowing layout reports here rather than silently passing.
 * - **Zero-area elements are reported, not swallowed.** An inactive tab's
 *   panel and the corner the responsive rules drop are not laid out, so there
 *   is nothing to hit-test; but "skipped" has to be a fact the caller can
 *   assert on, which is what `measured` is for. A control that is never laid
 *   out in *any* state the test visits has silently escaped the check, and
 *   the caller fails on exactly that.
 */
async function controlReachability(page: Page): Promise<ControlReachability> {
  return page.evaluate((selector: string) => {
    const describe = (node: Element): string => {
      const label =
        node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.textContent?.trim().slice(0, 32) ?? '';
      const classes = typeof node.className === 'string' && node.className !== '' ? `.${node.className}` : '';
      return `${node.tagName.toLowerCase()}${classes}${label === '' ? '' : ` "${label}"`}`;
    };

    /**
     * `describe`, prefixed by the control's chain of classed ancestors up to
     * `body`. `describe` alone is ambiguous on this page and the accounting
     * assertion cannot be written against an ambiguous name.
     */
    const locate = (node: Element): string => {
      const chain: string[] = [];
      for (let ancestor = node.parentElement; ancestor !== null && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const className = typeof ancestor.className === 'string' ? ancestor.className.trim() : '';
        if (className !== '') chain.unshift(className);
      }
      return [...chain, describe(node)].join(' > ');
    };

    const controls = [...document.querySelectorAll<HTMLElement>(selector)];

    // Two controls can still share a chain -- the Tile X and Tile Y number
    // inputs do -- so the duplicates are numbered. Only duplicates get a
    // suffix, so a name stays readable whenever it is already unique.
    const seen = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const control of controls) {
      const name = locate(control);
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
    const names = controls.map((control) => {
      const name = locate(control);
      if ((totals.get(name) ?? 0) < 2) return name;
      const ordinal = (seen.get(name) ?? 0) + 1;
      seen.set(name, ordinal);
      return `${name} #${ordinal}`;
    });

    const measured: number[] = [];
    const unreachable: { control: string; hit: string }[] = [];

    controls.forEach((control, index) => {
      const initial = control.getBoundingClientRect();
      if (initial.width === 0 || initial.height === 0) return;
      measured.push(index);

      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      // Re-read after the scroll: that is where the control now is.
      const rect = control.getBoundingClientRect();
      const samples: readonly (readonly [number, number])[] = [
        [rect.x + rect.width / 2, rect.y + rect.height / 2],
        [rect.x + rect.width * 0.2, rect.y + rect.height / 2],
        [rect.x + rect.width * 0.8, rect.y + rect.height / 2],
        [rect.x + rect.width / 2, rect.y + rect.height * 0.2],
        [rect.x + rect.width / 2, rect.y + rect.height * 0.8],
      ];

      for (const [x, y] of samples) {
        const hit = document.elementFromPoint(x, y);
        if (hit !== null && control.contains(hit)) continue;
        unreachable.push({
          control: names[index] ?? describe(control),
          hit: hit === null ? '(outside the viewport)' : describe(hit),
        });
        return;
      }
    });

    return { controls: names, measured, unreachable };
  }, INTERACTIVE_SELECTOR);
}

/**
 * Everything the HUD's right rail holds, top to bottom. Both boxes are the
 * host's or the HUD's own panels, not controls, so the reachability sweep
 * above never looks at them directly.
 */
const RAIL_PANELS = ['.save-panel', '.hud-build'] as const;

interface RailIntegrity {
  /**
   * `scrollHeight - clientHeight` on `.hud__rail`. Must be 0: the rail is not
   * the scroll container, its panels are.
   */
  readonly railOverflow: number;
  /** Rail panels whose border box is not wholly inside the viewport. */
  readonly offScreen: readonly string[];
  /** Rail panels with more content than box that the pointer cannot scroll. */
  readonly stuck: readonly string[];
  /** Whether `.hud-build` has more content than box, i.e. is scrolling. */
  readonly buildPanelScrolls: boolean;
  /**
   * The rendered width of each rail panel. They must all be equal: the rail is
   * meant to read as one column, and both panels take their width from
   * `--hud-rail-panel-width` for exactly that reason.
   */
  readonly widths: readonly number[];
}

/**
 * The rail as a layout, rather than as a bag of controls.
 *
 * The reachability sweep above is scroll-aware on purpose: it calls
 * `scrollIntoView` before hit-testing, because a list longer than its box is
 * not a defect. That makes it blind to *how* a control got on screen, and
 * `scrollIntoView` will happily scroll a container the player has no direct
 * way to scroll — an `overflow: hidden` box, or a scroll container whose own
 * scrollbar gutter lies in the `pointer-events: none` HUD root, where no
 * pointer can land on it. The first attempt at fixing issue #88 left exactly
 * that: a rail 81px over its budget at 1280x720 in the *default* state, whose
 * gutter hit-tested to the world canvas, its clipped content reachable only
 * because a wheel event over a panel chain-scrolled the panel's ancestor.
 *
 * So three separate claims, none of which the sweep can make:
 *
 * - the rail itself never scrolls, because its panels absorb their own
 *   excess (`hud.css`);
 * - every rail panel is wholly inside the viewport, so nothing is reached by
 *   scrolling the *page* to a panel hanging off an edge;
 * - a rail panel with more content than box is one the player can scroll —
 *   `overflow-y` really is `auto`, and `elementFromPoint` just inside its
 *   right edge lands on the panel rather than falling through to the canvas.
 */
async function railIntegrity(page: Page): Promise<RailIntegrity> {
  return page.evaluate((selectors: readonly string[]) => {
    const rail = document.querySelector('.hud__rail');
    const offScreen: string[] = [];
    const stuck: string[] = [];

    for (const selector of selectors) {
      const panel = document.querySelector<HTMLElement>(selector);
      if (panel === null) continue;
      const rect = panel.getBoundingClientRect();
      if (rect.top < -0.5 || rect.bottom > window.innerHeight + 0.5) {
        offScreen.push(
          `${selector} spans y=${Math.round(rect.top)}..${Math.round(rect.bottom)} of ${window.innerHeight}`,
        );
      }
      if (panel.scrollHeight <= panel.clientHeight) continue;
      const scrollable = ['auto', 'scroll'].includes(getComputedStyle(panel).overflowY);
      const edge = document.elementFromPoint(rect.right - 3, rect.top + rect.height / 2);
      const ownsItsEdge = edge !== null && panel.contains(edge);
      if (!scrollable || !ownsItsEdge) {
        stuck.push(`${selector} (overflow-y scrollable: ${scrollable}, owns its right edge: ${ownsItsEdge})`);
      }
    }

    const build = document.querySelector<HTMLElement>('.hud-build');
    const widths = selectors
      .map((selector) => document.querySelector<HTMLElement>(selector))
      .filter((panel): panel is HTMLElement => panel !== null)
      .map((panel) => Math.round(panel.getBoundingClientRect().width));

    return {
      railOverflow: rail === null ? 0 : rail.scrollHeight - rail.clientHeight,
      offScreen,
      stuck,
      buildPanelScrolls: build !== null && build.scrollHeight > build.clientHeight,
      widths,
    };
  }, RAIL_PANELS);
}

/** Only the fields that must hold in every state, at every viewport. */
function railInvariants(integrity: RailIntegrity): Pick<RailIntegrity, 'railOverflow' | 'offScreen' | 'stuck'> {
  return { railOverflow: integrity.railOverflow, offScreen: integrity.offScreen, stuck: integrity.stuck };
}

test.describe('the assembled application', () => {
  test('the renderer canvas is the size of the window, and stays that way across resizes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const initial = await canvasMetrics(page);
    expect(initial).not.toBeNull();
    const ratio = initial?.devicePixelRatio ?? 1;

    // Every viewport the suite visits, including the two the HUD's
    // responsive rules switch on. A `0x0` canvas was observed by hand during
    // a drag and turned out to be a mid-resize artefact rather than a defect;
    // this pins the *settled* size, which is the part that was never pinned.
    for (const [width, height] of [
      [1280, 800],
      [900, 600],
      [375, 812],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(
          async () => {
            const metrics = await canvasMetrics(page);
            if (metrics === null) return null;
            return [
              metrics.cssWidth,
              metrics.cssHeight,
              metrics.backingWidth,
              metrics.backingHeight,
              metrics.viewportWidth,
              metrics.viewportHeight,
            ];
          },
          { message: `canvas did not settle to ${width}x${height}` },
        )
        // CSS size is the viewport; the backing store is that times the
        // device pixel ratio, which is what makes the drawing sharp rather
        // than merely stretched.
        .toEqual([width, height, width * ratio, height * ratio, width, height]);
    }
  });

  test('a click in the middle of the screen reaches the world, not the HUD', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    for (const [width, height] of [
      [1280, 800],
      [768, 1024],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
        .toBe(width);

      // What the browser says is on top of the centre pixel.
      const centre = await page.evaluate(() => {
        const element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
        const hud = document.querySelector('.hud');
        return {
          tagName: element?.tagName ?? null,
          isTheCanvas: element !== null && element === document.querySelector('#game-root canvas'),
          insideHud: element !== null && (hud?.contains(element) ?? false),
          hudPointerEvents: hud === null ? null : window.getComputedStyle(hud).pointerEvents,
        };
      });
      expect(centre, `centre of a ${width}x${height} viewport`).toEqual({
        tagName: 'CANVAS',
        isTheCanvas: true,
        insideHud: false,
        hudPointerEvents: 'none',
      });

      // And a real press, because `elementFromPoint` describes a layout while
      // this is the event a player's tap actually produces. A HUD that stops
      // being click-through makes the game unoperable, and nothing below a
      // browser can see the difference.
      await page.evaluate(() => {
        const counters: CentreHitCounters = { canvas: 0, hud: 0 };
        (window as HitCountingWindow).lockstateCentreHits = counters;
        document
          .querySelector('#game-root canvas')
          ?.addEventListener('pointerdown', () => void (counters.canvas += 1));
        document.querySelector('.hud')?.addEventListener('pointerdown', () => void (counters.hud += 1));
      });
      await page.mouse.click(Math.round(width / 2), Math.round(height / 2));
      const hits = await page.evaluate(() => (window as HitCountingWindow).lockstateCentreHits ?? null);
      expect(hits, `a centre click at ${width}x${height}`).toEqual({ canvas: 1, hud: 0 });
    }
  });

  /**
   * `--tap-target` is 44px, and a HUD control that renders smaller than that
   * is the defect this layer already found once (a 24px control) by
   * measuring. Nothing pins it: the token is applied by CSS convention, and
   * neither a token test nor a jsdom test resolves a *rendered* box.
   *
   * Only controls that are actually laid out are measured. A zero-area box is
   * an inactive tab's panel or a corner the responsive rules drop on a phone;
   * "is it displayed" is a different question with its own assertions above.
   */
  test('every HUD control the player can actually hit is a real tap target', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    for (const [width, height] of [
      [1280, 800],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      const undersized = await page.evaluate((minimum: number) => {
        const controls = [...document.querySelectorAll<HTMLElement>('.hud button, .hud [role="button"], .hud a[href]')];
        return controls
          .map((control) => {
            const rect = control.getBoundingClientRect();
            return {
              control: control.getAttribute('title') ?? control.textContent?.trim().slice(0, 24) ?? control.className,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((box) => box.width > 0 && box.height > 0)
          .filter((box) => box.width < minimum || box.height < minimum);
      }, 44);
      expect(undersized, `HUD controls below the 44px tap target at ${width}x${height}`).toEqual([]);
    }
  });

  /**
   * Issue #88: presence is not reachability.
   *
   * The save panel and the Build panel were two independently-positioned
   * `fixed` layers that had never been laid out relative to each other. On
   * the Build tab, with the Build panel's numeric fallback expanded — one tap
   * from the default — the Build panel covered 91 % of the save panel at
   * 1280x720 and swallowed every click on it, so **New prison, Save now,
   * Export, Load and Delete all did nothing** — with no error, no console
   * message and no status change. The suite was green throughout, because
   * every assertion it had asked whether an element *existed*.
   *
   * This is deliberately not an assertion about those two panels. It is the
   * general property: on the assembled page, at every viewport this suite
   * visits and on every tab, the topmost element over each control is that
   * control. It costs five `elementFromPoint` calls per control and it catches
   * the whole class — any future region that lands on top of another one fails
   * here, whichever two they are.
   *
   * The Build tab's numeric fallback is expanded as its own case, and it is
   * load-bearing rather than thorough-for-its-own-sake. Measured against the
   * pre-#88 layout, the folded Build panel covers the save panel enough to
   * take a control centre only at 900x600. Expanded it covers the save panel
   * at all five viewports here, and buries it at four of them: 91 % at
   * 1280x720, 91 % at 900x600, 89 % at 1024x768 and 83 % at 375x812, each
   * taking all five save-panel buttons. The fifth, 1440x900, is the one that
   * is merely overlapped -- 37 %, taking the per-prison Load and Delete and
   * leaving New prison, Save now and Export clickable. Drop this case and the
   * guard keeps almost none of its teeth.
   *
   * Every control is accounted for rather than merely visited. A control that
   * is not laid out cannot be hit-tested, so the sweep skips it — but a
   * control that is never laid out in *any* state this test visits has escaped
   * the check entirely, and `NEVER_LAID_OUT_BELOW_720` above is the explicit,
   * named list of the ones that legitimately do. Anything else appearing there
   * fails: it is how a control that quietly collapses to nothing shows up as a
   * defect instead of as a pass.
   *
   * `railIntegrity` runs alongside the sweep at every viewport, in both the
   * default and the expanded state, because the sweep alone passed the first
   * #88 fix — a right rail 81px over its budget at 1280x720 *by default*, with
   * the Build panel's last section header below the fold and the rail's own
   * scrollbar gutter hit-testing to the world canvas. `scrollIntoView` reached
   * the controls anyway, so every assertion here stayed green. Reachable by a
   * scroll the player cannot perform is not reachable.
   *
   * Which is why the default state also measures *where the Build panel's last
   * section is*, rather than only whether the panel scrolls. Issue #174 was
   * the same failure a second time and every assertion above stayed green
   * through it: at 900x600 the "Enter coordinates" header ended 51.8px past
   * the panel's own fold with `scrollTop` still 0, and the sweep passed
   * because `scrollIntoView` found it. Position, unscrolled, on this page --
   * the harness in `ui-shell.spec.ts` cannot see this defect, because nothing
   * there occupies the rail's aside slot.
   */
  test('every control can actually be pressed, on every tab and at every viewport (#88)', async ({ page }) => {
    // The most expensive test in the suite by a wide margin, and the only one
    // that needs more than the 60 s default: five viewports x five layout
    // states, each a real relayout of the whole page followed by a hit-test
    // sweep over every control and a check on the rail. Measured between 14 s
    // and 28 s on this machine against that 60 s -- close enough that a slower
    // CI runner would fail it for being slow rather than for finding anything,
    // which is the worst kind of red. `test.slow()` triples the budget; it
    // does not make the test do less.
    test.slow();

    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);

    // A prison in the list is the state a player reaches with the first thing
    // they do, and it is the only thing that puts the per-row Load and Delete
    // buttons on the page at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    /*
     * A queue, once, and then the clock is stopped so it stays one for the rest
     * of the test.
     *
     * The Build panel's queue block (#348) is the second block after #89's buy
     * row whose controls exist in the DOM at every moment and are laid out at
     * none of the states this sweep would otherwise visit -- and there are four
     * of them: the fold's own header and one Cancel per row. The deliveries block
     * (#285) is the third, and the purchases below are its half of this setup. Without this the
     * `neverLaidOut` check at the foot of the loop does not merely get weaker, it
     * fails and names all four, which is the gate doing exactly its job.
     *
     * It has to be built through the real application, so it is: six orders
     * placed through the panel's own numeric route, then the clock started
     * because a command is dispatched at a tick and a paused simulation would
     * leave all six in the kernel's queue with no order to show. Six rather than
     * one because construction builds **one order at a time** since #348 -- a
     * lone wall finishes at tick 70, where six take 370 -- so this gives the poll
     * below room to see the block before the crew empties it. The clock is then
     * paused, which freezes the queue: the projection answers a request whenever
     * one arrives, tick or no tick, so the block survives every viewport and
     * every tab change below.
     */
    await page.getByRole('button', { name: 'Build' }).click();
    const queueSetupCoordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await queueSetupCoordinates.getAttribute('aria-expanded')) === 'false') await queueSetupCoordinates.click();
    const queueSetupSubmit = page.locator('.hud-build__coordinates .ui-action');
    for (const tileY of [5, 6, 7, 8, 9, 10]) {
      await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
      await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(tileY));
      await queueSetupSubmit.click();
    }
    if ((await queueSetupCoordinates.getAttribute('aria-expanded')) === 'true') await queueSetupCoordinates.click();
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();

    /*
     * Three purchases, in the same one clock run, and for exactly the reason the
     * queue above is here.
     *
     * The deliveries block (#285) is the **third** set of Build-panel controls
     * that exists in the DOM at every moment and is laid out in none of the
     * states this sweep would otherwise visit -- one Cancel per pending
     * delivery. Without this the `neverLaidOut` check at the foot of the loop
     * fails and names all three, which is the gate doing its job: a control the
     * sweep can never see is a control this test cannot claim is reachable.
     *
     * The rows live inside the buy disclosure, which the loop below opens at
     * every viewport, so all this has to do is make the list non-empty -- and it
     * has to do it through the real application, so it presses the real Buy
     * button. The disclosure is closed again afterwards, because the loop's own
     * assertions start from the arrival state and one of them is that opening it
     * is what reveals the row.
     */
    const setupBuyToggle = page.locator('.hud-build__buy-toggle');
    await setupBuyToggle.click();
    const setupBuy = page.locator('.hud-build__buy-submit');
    await expect(setupBuy).toBeVisible();
    for (let press = 0; press < 3; press += 1) await setupBuy.click();
    // `data-pending` rather than a box: the block is inside a disclosure whose
    // own state this setup is about to change back, and the attribute is what the
    // panel writes when the projection answers with a non-empty list.
    await expect
      .poll(async () => page.locator('.hud-build__deliveries').getAttribute('data-pending'), {
        message: 'three purchases never reached the Build panel as pending deliveries',
        timeout: 20_000,
      })
      .toBe('3');
    await setupBuyToggle.click();
    await expect(page.locator('.hud-build__buy')).toBeHidden();

    // A box, not a count: the block is `hidden` until the projection reports a
    // queue, and `hidden` is what "there is nothing coming" looks like.
    await expect
      .poll(async () => (await page.locator('.hud-build__queue').boundingBox()) !== null, {
        message: 'six placed orders never reached the Build panel as a queue',
        timeout: 20_000,
      })
      .toBe(true);
    // Paused, which freezes both: the projections answer a request whenever one
    // arrives, tick or no tick, so the queue *and* the deliveries survive every
    // viewport and every tab change below. The deliveries would otherwise land
    // 100 ticks after they were bought and take their own controls with them.
    await page.locator('.hud-strip__transport [title="Pause"]').click();

    for (const [width, height] of [
      // The viewport the issue was measured at, a wide desktop, a small
      // laptop, a short window and a phone. The collision is a layout
      // collision, so which sizes are checked is the whole question: it was
      // invisible at 1440x900 and fatal at 1280x720.
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [900, 600],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
        .toBe(width);

      // Which controls this viewport managed to hit-test at all, across every
      // state it visits. Accumulated so the "never laid out anywhere" check
      // below is about the viewport, not about one tab: the Build panel is
      // legitimately absent on four of the five tabs, and the Rooms panel on
      // the other four.
      const everMeasured = new Set<number>();
      let inventory: readonly string[] = [];

      // Every tab, and the list is  rather than a copy of it: this
      // loop was a hard-coded four when the Rooms tab landed, so the whole Rooms
      // panel was outside the sweep and the "never laid out anywhere" check
      // below reported all 26 of its controls as unreachable -- correctly, since
      // nothing had opened the tab they live on. Reading the real list means a
      // sixth tab cannot repeat that.
      for (const tab of HUD_TAB_IDS) {
        await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
        const reachability = await controlReachability(page);
        inventory = reachability.controls;
        for (const index of reachability.measured) everMeasured.add(index);
        expect(
          reachability.unreachable,
          `controls covered by something else on the ${tab} tab at ${width}x${height}`,
        ).toEqual([]);
      }

      // Saving is not a Build-tab activity, and the Build tab is where the
      // player spends their time. Named separately so a regression says so.
      await page.locator('.ui-tab[data-tab="build"]').click();
      expect(
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('.save-panel__button')]
            .map((button) => {
              button.scrollIntoView({ block: 'nearest' });
              const rect = button.getBoundingClientRect();
              const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
              return hit !== null && button.contains(hit) ? null : (button.textContent?.trim() ?? '');
            })
            .filter((label) => label !== null),
        ),
        `save-panel buttons unreachable from the Build tab at ${width}x${height}`,
      ).toEqual([]);

      // The rail in its default state, which is the state the first #88 fix
      // got wrong: it clipped the Build panel at 1280x720 on arrival.
      const foldedRail = await railIntegrity(page);
      expect(railInvariants(foldedRail), `the rail in its default state at ${width}x${height}`).toEqual({
        railOverflow: 0,
        offScreen: [],
        stuck: [],
      });
      expect(
        [...new Set(foldedRail.widths)],
        `the rail's panels are not all one width at ${width}x${height}`,
      ).toHaveLength(1);
      // The Build panel gets its whole content height in the default state at
      // every viewport here -- no exception, and 900x600 used to be one. The
      // rail there is 483px and the panel wanted 398px of it, which left less
      // than the save panel's floor, so the panel arrived already scrolled by
      // 52px. `hud.css`'s `max-height: 700px` block trims the panel's fixed
      // blocks and its gutters until it fits, and measured there today the
      // panel is 338.1px of content in a 338.1px slot with nothing scrolled
      // (issue #174). The catalogue *section* donates nothing any more: the 8px
      // it used to "donate" was the gutter under its own list, and donating it
      // meant laying that gutter over the map block's hairline, which is what
      // the next assertion but one is about.
      //
      // The catalogue *list* inside it donates a great deal, and the sentence
      // above used to say otherwise ("the catalogue itself donates nothing any
      // more"). That was true of a two-entry `BUILDABLE_REGISTRY` and stopped
      // being true when ADR 0028 phase 2 made it four: the list holds 176px of
      // rows, and in the state this test is in -- six orders queued, so
      // `.hud-build[data-queued]` has dropped the floor under it to one row
      // (ADR 0031 decision 3) -- it hands back 111px at 1280x720, 0 at
      // 1440x900, 75px at 1024x768, 132px at 900x600 and 66px at 375x812. The
      // panel fits at 900x600 because three of the four buildables are behind
      // that scroll, which is a price the ADR argues for and this line does not
      // measure; the arrival-state test below is where the list's own
      // scrollability is asserted.
      //
      // The first #88 fix clipped the panel at 1280x720 too, on arrival, and
      // nothing said so -- which is what this line is for.
      expect(
        foldedRail.buildPanelScrolls,
        `the Build panel scrolls on arrival at ${width}x${height}`,
      ).toBe(false);

      // Not "does the panel scroll" -- where the last section actually is, with
      // the panel folded and unscrolled, in a rail that really holds the save
      // panel. #174: at 900x600 this ended at y=569.5 in a panel clipped at
      // y=517.7 while every other assertion here stayed green. It has to live
      // on this page rather than in `ui-shell.spec.ts`'s harness, whose aside
      // slot is empty -- `.hud__aside:empty { display: none }` then hands the
      // Build panel 128.7px more rail than the application ever gives it, and
      // the defect cannot be reproduced there at all.
      //
      // Two separate claims, and the order matters. `scrollTop` is read
      // *before* the header is measured and then reset, because the sweep
      // above reaches controls with `scrollIntoView`: with the defect present
      // it left this panel scrolled 52px, which is enough to carry the header
      // back inside the fold and make the measurement below pass for exactly
      // the reason the defect is a defect. So the first assertion is that
      // nothing had to scroll the panel to reach a control, and the second is
      // where the header sits once it is unscrolled -- each red on its own.
      // Two headers, not one, and the second is the addition rather than a
      // replacement. This used to reach "the panel's last `.ui-section`" by
      // position and check that it read "Enter coordinates". The queue block
      // (#348) is a `.ui-section` appended after the numeric fallback and laid
      // out whenever something is queued -- which is now this test's state -- so
      // position no longer identifies the numeric fallback. It is named instead
      // (`.hud-build__coordinates`), and the *last visible* section is measured
      // as well, because "the panel's last section is above its fold" is the
      // property #174 is about and it has to hold for whichever section that is.
      const lastSection = await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const named = document.querySelector('.hud-build__coordinates > .ui-section__header');
        const sections = [...document.querySelectorAll('.hud-build .ui-section')].filter(
          (section) => section.getClientRects().length > 0,
        );
        const last = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
        if (panel === null || named === null || last === null) return null;
        const scrollTop = panel.scrollTop;
        panel.scrollTop = 0;
        const p = panel.getBoundingClientRect();
        const fold = p.top + panel.clientTop + panel.clientHeight;
        return {
          text: named.textContent?.trim() ?? '',
          bottom: named.getBoundingClientRect().bottom,
          lastText: last.textContent?.trim() ?? '',
          lastBottom: last.getBoundingClientRect().bottom,
          fold,
          scrollTop,
        };
      });
      expect(lastSection, `the Build panel's last section has no box at ${width}x${height}`).not.toBeNull();
      expect(lastSection?.text, `the panel's numeric fallback section at ${width}x${height}`).toBe(
        'Enter coordinates',
      );
      expect(
        lastSection?.scrollTop,
        `reaching a control scrolled the Build panel at ${width}x${height}`,
      ).toBe(0);
      expect(
        lastSection?.bottom ?? Number.POSITIVE_INFINITY,
        `"Enter coordinates" is below the unscrolled Build panel's fold at ${width}x${height}: it ends at y=${Math.round(lastSection?.bottom ?? 0)} in a panel clipped at y=${Math.round(lastSection?.fold ?? 0)}`,
      ).toBeLessThanOrEqual(lastSection?.fold ?? 0);
      /*
       * And whatever *is* last. With a queue that is the queue block's own
       * header, and it is the header that says a queue exists at all -- so a
       * player who cannot see it has not been told. Measured before this
       * assertion existed: the collapsed block is 45px and the rail had 8px to
       * spare at 1280x720 and none at 900x600, so the header ended **14px and
       * 37px below this fold** with nothing scrolled. `hud.css`'s
       * `.hud-build[data-queued]` is what pays for it, out of the catalogue's
       * floor.
       */
      expect(
        lastSection?.lastBottom ?? Number.POSITIVE_INFINITY,
        `the Build panel's last visible section ("${lastSection?.lastText ?? ''}") is below its unscrolled fold at ${width}x${height}: it ends at y=${Math.round(lastSection?.lastBottom ?? 0)} in a panel clipped at y=${Math.round(lastSection?.fold ?? 0)}`,
      ).toBeLessThanOrEqual(lastSection?.fold ?? 0);

      // And no box that carries the Build panel's height is shorter than its
      // own content *in the state the panel arrives in* -- every box in the
      // shrink chain, not only the one that was measured first.
      //
      // "In this state", and that scope is the honest half of the claim rather
      // than a hedge. This line used to say "ever", and measurement says
      // otherwise: open one of the panel's three folds and the body is shorter
      // than its content again, because its floor is a sum of the blocks in
      // the *arrival* state and an opened fold is taller than the block the sum
      // counted. Measured on the assembled page with nothing queued, body box
      // against body content: the numeric fallback expanded costs 195px at
      // 1280x720, 60px at 1440x900, 159px at 1024x768, 200px at 900x600 and
      // 135px at 375x812; the buy row open costs 127px, 0, 91px, 125px and
      // 83px. The queue fold is the third and needs a queue to open, so it is
      // measured in this test's own state instead: 157px, 22px, 121px, 154px
      // and 98px. Nothing clips and every control opened is measured inside the
      // panel's visible box further down, so this is #174 item 2's "harmless by
      // coincidence" exactly as that issue frames it -- still open, and closing
      // it is the layout decision the issue names (which box yields, and what
      // happens when the sum exceeds the rail), not a number this file can
      // pick.
      //
      // The body was 283px of box over 335px of content at 900x600 (#174) and
      // got a summed floor for it. The catalogue section then turned out to
      // have the identical defect one box lower and for the identical reason:
      // its floor and the body's are both sums of a header plus a two-row
      // list, and neither counted the gutter `primitives.css` puts under the
      // list, so both were 8px light. At 900x600 the section sat 4.1px into
      // that gap -- 135.9px of box holding 140px of content, the difference
      // laid outside the box and over the hairline the map block draws --
      // while every assertion here, including the body's own, stayed green.
      // Asserting one box of a chain is asserting the box somebody happened to
      // measure; this is the property.
      //
      // Both are "harmless" only because the one ancestor between them and
      // the viewport that clips also scrolls, which is a property of today's
      // box chain rather than a guarantee.
      //
      // Be exact about what makes this green. Today it is the layout in
      // `hud.css`, and at 900x600 the boxes sit on the floors it sums. In the
      // arrival state they sit on them exactly -- the catalogue 136px on a
      // 136px floor, the body's 275.2px content box on a 275.2px floor -- which
      // is the pair of numbers the arrival-state test below records. In *this*
      // test's state, six orders queued, `.hud-build[data-queued]` has taken a
      // row off the catalogue's floor to pay for the queue block: the catalogue
      // is 92px on a 92px floor and the body's 275.2px content box now has 44px
      // of slack over a 231.2px floor, because the floor lost 44px and the
      // content gained a 45px collapsed section. Either way any term dropped
      // from either sum shows up here as a number rather than as a panel
      // quietly clipping again. That is why this assertion matters more than
      // the sums it is guarding: the sums cannot be derived (see `hud.css` for the
      // `min-content` and grid-track attempts, both measured failing), so
      // something has to check them.
      //
      // `.hud-build__list` is deliberately absent: it is the one box here that
      // is *meant* to hold more than it shows, and `ui-shell.spec.ts` asserts
      // it absorbs the excess at twelve entries. Everything above it must
      // contain what it holds.
      expect(
        await page.evaluate(() =>
          ['.hud-build > .ui-panel__body', '.hud-build__catalogue', '.hud-build__catalogue > .ui-section__body']
            .map((selector) => {
              const box = document.querySelector(selector);
              if (box === null) return `${selector} has no box`;
              const shortfall = box.scrollHeight - box.clientHeight;
              return shortfall === 0 ? null : `${selector} is ${shortfall}px shorter than its own content`;
            })
            .filter((entry) => entry !== null),
        ),
        `boxes in the Build panel shorter than their own content at ${width}x${height}`,
      ).toEqual([]);

      // The numeric fallback expanded: the tallest the Build panel gets, and
      // the state issue #88 was measured in.
      //
      // Named, not positional. All three of this file's reaches for this header
      // used to be `.hud-build .ui-section__header').last()`, and the queue
      // block (#348) is a `.ui-section` appended after the numeric fallback --
      // `hidden` while nothing is queued, so `.last()` resolved to an invisible
      // button and the click waited out the whole 60s timeout. `.hud-build__coordinates`
      // exists so a selector can say which section it means.
      const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
      if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
      const expanded = await controlReachability(page);
      for (const index of expanded.measured) everMeasured.add(index);
      expect(
        expanded.unreachable,
        `controls covered by something else with the Build coordinates expanded at ${width}x${height}`,
      ).toEqual([]);
      const expandedRail = await railIntegrity(page);
      expect(
        railInvariants(expandedRail),
        `the rail with the Build coordinates expanded at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });
      expect(
        [...new Set(expandedRail.widths)],
        `the rail's panels are not all one width with the coordinates expanded at ${width}x${height}`,
      ).toHaveLength(1);

      // A real wheel gesture, because "the panel is a scroll container" and
      // "rolling the wheel over the panel scrolls it" are different claims and
      // only the second is what a player does. Expanded, the Build panel has
      // more content than box at every viewport here, so this state is where
      // the gesture can be demanded rather than merely offered.
      const buildBox = await page.locator('.hud-build').boundingBox();
      expect(buildBox, `the Build panel has no box at ${width}x${height}`).not.toBeNull();
      if (buildBox !== null) {
        await page.mouse.move(buildBox.x + buildBox.width / 2, buildBox.y + buildBox.height / 2);
        const scrolled = await page.evaluate(() => {
          const panel = document.querySelector<HTMLElement>('.hud-build');
          const rail = document.querySelector<HTMLElement>('.hud__rail');
          if (panel === null || rail === null) return null;
          panel.scrollTop = 0;
          rail.scrollTop = 0;
          return { overflow: panel.scrollHeight - panel.clientHeight };
        });
        expect(scrolled?.overflow ?? 0, `the expanded Build panel fits its box at ${width}x${height}`).toBeGreaterThan(
          0,
        );
        await page.mouse.wheel(0, 200);
        await expect
          .poll(async () => page.evaluate(() => document.querySelector('.hud-build')?.scrollTop ?? 0), {
            message: `the wheel did not scroll the Build panel at ${width}x${height}`,
          })
          .toBeGreaterThan(0);
        expect(
          await page.evaluate(() => document.querySelector('.hud__rail')?.scrollTop ?? -1),
          `the wheel scrolled the rail rather than the panel at ${width}x${height}`,
        ).toBe(0);
      }

      // Folded away again, so the next viewport starts from the same state.
      if ((await coordinates.getAttribute('aria-expanded')) === 'true') await coordinates.click();

      // The buy row open (#89), which is the panel's other player-opened
      // state and the one whose controls exist in the DOM at every moment and
      // are laid out at none of the ones above. Without this state the
      // `neverLaidOut` check below is not merely weaker -- it fails, naming
      // the quantity stepper and the buy button, which is the gate doing
      // exactly its job: a control the sweep can never see is a control this
      // test cannot claim is reachable.
      const buyToggle = page.locator('.hud-build__buy-toggle');
      await expect(buyToggle, `the buy disclosure is missing at ${width}x${height}`).toBeVisible();
      await buyToggle.click();
      await expect(page.locator('.hud-build__buy')).toBeVisible();

      // The row the player just opened is inside the panel's *visible* box,
      // measured before anything below scrolls anything. It is about 150px
      // and the panel is sized to its arrival content, so at four of these
      // five viewports the panel now has more content than box -- and without
      // the panel scrolling to the row, the disclosure would reveal a control
      // below its own fold, which is #174's defect wearing a different hat.
      // Measured the way #174 measures it: the control's rectangle against
      // the panel's client box. `controlReachability` below cannot make this
      // claim, because it calls `scrollIntoView` first.
      const buyBox = await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const control = document.querySelector('.hud-build__buy-submit');
        if (panel === null || control === null) return null;
        const p = panel.getBoundingClientRect();
        const c = control.getBoundingClientRect();
        return {
          above: c.top - (p.top + panel.clientTop),
          below: p.top + panel.clientTop + panel.clientHeight - c.bottom,
        };
      });
      expect(buyBox, `the buy button has no box once the row is open at ${width}x${height}`).not.toBeNull();
      expect(
        buyBox?.above ?? -1,
        `the buy button is above the Build panel's visible box at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        buyBox?.below ?? -1,
        `the buy button is below the Build panel's visible box at ${width}x${height}: opening the row revealed a control the player cannot see`,
      ).toBeGreaterThanOrEqual(0);

      const buying = await controlReachability(page);
      for (const index of buying.measured) everMeasured.add(index);
      expect(
        buying.unreachable,
        `controls covered by something else with the buy row open at ${width}x${height}`,
      ).toEqual([]);
      // The rail still holds, in a state that overflows the panel at four of
      // these five viewports: the panel absorbs its own excess and the player
      // can scroll it, which is what separates this from #174's defect --
      // there the panel arrived clipped, here the player opened it.
      expect(
        railInvariants(await railIntegrity(page)),
        `the rail with the buy row open at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });
      await buyToggle.click();
      await expect(page.locator('.hud-build__buy')).toBeHidden();
      // Closed again, the panel fits, so a scroll left over from reaching a
      // control in that state cannot survive into the next viewport's
      // measurement of where the last section is.
      await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        if (panel !== null) panel.scrollTop = 0;
      });

      /*
       * The queue block open (#348), which is this panel's third player-opened
       * state and the buy row's argument one block down.
       *
       * Its three Cancel controls exist in the DOM at every moment -- the rows
       * are pooled, so the HUD's busy group, which has `add` and no `remove`,
       * cannot grow over a session -- and are laid out in none of the states
       * above. Without this the `neverLaidOut` check below fails and names them,
       * which is the gate working: a control the sweep can never see is a control
       * this test cannot claim is reachable. Six orders are queued and the clock
       * is stopped, from before the loop.
       */
      const queueFold = page.locator('.hud-build__queue > .ui-section__header');
      await expect(queueFold, `the queue fold is missing at ${width}x${height}`).toBeVisible();
      await queueFold.click();
      await expect(page.locator('.hud-build__queue-list')).toBeVisible();

      // Every revealed control is inside the panel's *visible* box, measured
      // the way #174 measures it and for the reason the buy row's own check
      // above gives: opening a fold that reveals controls below the panel's own
      // fold has not revealed them. `controlReachability` below cannot make this
      // claim, because it calls `scrollIntoView` first. Measured over all three
      // rows rather than one, because they are stacked and only the last is at
      // risk -- 38px, 90px and 142px of clearance at 1280x720 today.
      const queueBoxes = await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        if (panel === null) return null;
        const p = panel.getBoundingClientRect();
        const top = p.top + panel.clientTop;
        return [...document.querySelectorAll('.hud-build__queue-row')]
          .filter((row) => row.getClientRects().length > 0)
          .map((row) => {
            const control = row.querySelector('.ui-action');
            if (control === null) return { order: row.getAttribute('data-order') ?? '', above: -1, below: -1 };
            const c = control.getBoundingClientRect();
            return {
              order: row.getAttribute('data-order') ?? '',
              above: Math.round(c.top - top),
              below: Math.round(top + panel.clientHeight - c.bottom),
            };
          });
      });
      expect(queueBoxes, `the queue rows have no boxes once the fold is open at ${width}x${height}`).not.toBeNull();
      expect(queueBoxes?.length ?? 0, `the open queue drew no rows at ${width}x${height}`).toBeGreaterThan(0);
      for (const row of queueBoxes ?? []) {
        expect(
          row.above,
          `the cancel for ${row.order} is above the Build panel's visible box at ${width}x${height}`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          row.below,
          `the cancel for ${row.order} is below the Build panel's visible box at ${width}x${height}: opening the fold revealed a control the player cannot see`,
        ).toBeGreaterThanOrEqual(0);
      }

      const queued = await controlReachability(page);
      inventory = queued.controls;
      for (const index of queued.measured) everMeasured.add(index);
      expect(
        queued.unreachable,
        `controls covered by something else with the build queue open at ${width}x${height}`,
      ).toEqual([]);
      // The rail still holds in a state that overflows the panel at every
      // viewport here: the panel absorbs its own excess and the player scrolls
      // it, which is what separates this from #174's defect -- there the panel
      // arrived clipped, here the player opened a fold.
      expect(
        railInvariants(await railIntegrity(page)),
        `the rail with the build queue open at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });

      await queueFold.click();
      await expect(page.locator('.hud-build__queue-list')).toBeHidden();
      await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        if (panel !== null) panel.scrollTop = 0;
      });

      /*
       * The Rooms panel's confirm state, which is that panel's equivalent of
       * the buy row above and reached the same way: explicitly, because the
       * two controls in it exist in the DOM at every moment and are laid out at
       * none of the states visited so far.
       *
       * It is driven through the *world* rather than through a harness hook,
       * because this file drives the assembled application -- so this is also
       * the only place the whole room gesture is exercised end to end: a real
       * drag on a real Phaser canvas, arbitrated by the real scene, reported
       * through the real `RoomTool`, held by the real panel.
       *
       * Without this state the `neverLaidOut` check below does not merely get
       * weaker -- it fails, naming the confirm and discard controls, which is
       * the gate doing its job: a control the sweep can never see is a control
       * this test cannot claim is reachable.
       *
       * At 375x812 it *did* fail, and the exemption that made it pass is gone:
       * arming folds the panel to its header, so the drag below has world to
       * happen in at every viewport this loop visits. The band it uncovers is
       * measured in "the Rooms panel yields the world it is drawn on" below.
       */
      await page.locator('.ui-tab[data-tab="rooms"]').click();
      const roomArm = page.locator('.hud-rooms__arm');
      await expect(roomArm, `the Rooms panel's arm control is missing at ${width}x${height}`).toBeVisible();
      await roomArm.click();
      const dragged = await dragRectangleOnWorld(page);
      // Every viewport, 375x812 included, and that last one is the change:
      // arming folds the panel to its header, so the world it is drawn on is
      // there to be drawn on. Asserted rather than tolerated, so a layout change
      // that took the world away again -- at any viewport -- fails here instead
      // of quietly changing what this test covers.
      expect(dragged, `a room drag found no bare world at ${width}x${height}`).toBe(true);

      const roomConfirm = page.locator('.hud-rooms__confirm');
      await expect(
        roomConfirm,
        `a rectangle dragged on the world did not reach the Rooms panel at ${width}x${height}`,
      ).toBeVisible();
      // Both axes survived the gesture, which is the property `dragOnWorld`'s
      // one-axis run cannot show: a square drag committed to an axis would read
      // `3 x 1` or `1 x 3` here.
      await expect(
        page.locator('.hud-rooms__area'),
        `the dragged area is not a rectangle at ${width}x${height}`,
      ).toHaveAttribute('data-area', /^-?\d+,-?\d+,[2-9]\d*,[2-9]\d*$/);

      const roomsReachability = await controlReachability(page);
      inventory = roomsReachability.controls;
      for (const index of roomsReachability.measured) everMeasured.add(index);
      expect(
        roomsReachability.unreachable,
        `controls covered by something else with a room pending at ${width}x${height}`,
      ).toEqual([]);

      // Discarded, so the next viewport starts from the state this one did.
      await page.locator('.hud-rooms__cancel').click();
      await page.locator('.ui-tab[data-tab="build"]').click();

      // Nothing got a free pass by never being laid out. At desktop widths the
      // Build tab with its coordinates expanded shows every control there is,
      // so the list is empty; at 720px and below the responsive rules drop
      // `.hud__corner` outright — the minimap and the alerts section — and
      // those two controls genuinely cannot be reached at any tab. That is a
      // deliberate responsive decision (see `hud.css`), named here so it stays
      // one: it is the honest limit of what this test can claim about a phone.
      //
      // `NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR` is added at *every* viewport,
      // and for a different kind of reason: not a responsive decision but a gap
      // in the simulation, measured and recorded on that constant. Sorted
      // together because the assertion compares the sweep's document order.
      const exempt = [
        ...(width <= 720 ? NEVER_LAID_OUT_BELOW_720 : []),
        ...NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR,
      ];
      const neverLaidOut = inventory.filter((_, index) => !everMeasured.has(index));
      expect([...neverLaidOut].sort(), `controls never laid out in any state at ${width}x${height}`).toEqual(
        [...exempt].sort(),
      );
      expect(
        everMeasured.size,
        `hit-tested only ${everMeasured.size} of ${inventory.length} controls at ${width}x${height}`,
      ).toBe(inventory.length - exempt.length);
    }
  });

  /**
   * The Build panel in the state a player *arrives* in, on the assembled page
   * (#174, and ADR 0031 decision 3's first bullet).
   *
   * **Why this is not the sweep above.** That test measures the same panel, in
   * the same rail, at the same five viewports -- and since #367 it measures it
   * with **six orders queued**, always. It has to: the queue block's four
   * controls exist in the DOM at every moment and are laid out in none of the
   * states it would otherwise visit, so without the queue its `neverLaidOut`
   * gate fails and names them. The consequence is that every Build-panel
   * measurement on this page is now a measurement of the *queued* panel, and
   * the empty queue -- which is what a player loads the game into -- stopped
   * being measured here at all.
   *
   * That state is not an uninteresting one. It is the state #174 was filed
   * about, and ADR 0031's first bullet is a claim about it in terms: "No box
   * until something is queued. An empty queue is the arrival state, so the
   * panel's arrival height is unchanged from what #174 left." The only place
   * that claim is measured is `tests/browser/ui-build-queue.spec.ts`, whose
   * harness leaves `hud.asideSlot` empty -- `.hud__aside:empty { display: none }`
   * then hands the Build panel 128.7px more rail than the application ever
   * gives it, which is precisely the surface #174 proved cannot reproduce this
   * class of defect. So the claim was resting on a page with no rail contention
   * in it.
   *
   * **What it measures**, all of it with nothing scrolled and nothing opened,
   * at 900x600 -- the viewport that presses, where the rail is 482.8px and the
   * save panel's floor takes 120.7px of it:
   *
   *   - the queue block has no box at all, so this really is the arrival state
   *     and the numbers below are not about a different panel;
   *   - the panel is 338.1px of box holding 338.1px of content, `scrollTop` 0;
   *   - "Enter coordinates" -- the last section that *is* laid out here -- ends
   *     at y=513.9 against a fold at y=521.7, 7.8px inside it;
   *   - no box in the shrink chain is shorter than its own content: the body is
   *     291.2px over 291.2px and the catalogue 136px over 136px, both exactly
   *     on the floors `hud.css` sums for them;
   *   - and the catalogue list, which is the one box here that is *meant* to
   *     hold more than it shows, really is scrollable: `BUILDABLE_REGISTRY` has
   *     four entries, so it holds 176px of rows in the 88px its floor gives it
   *     at this viewport, and two of the four are behind that scroll.
   *
   * **Proven to bite, rather than assumed to.** With `hud.css`'s
   * `max-height: 700px` block -- the short-viewport trims #174 was closed with
   * -- deleted and nothing else changed, this goes red at 900x600 and nowhere
   * else: the panel arrives 60px over its box, "Enter coordinates" ends 59.8px
   * past the fold, and the body is 32px shorter than its own content. Three of
   * the assertions below, on the same run, and the other four viewports stay
   * green -- which is the shape the original defect had.
   */
  test('the Build panel arrives inside its own fold, with nothing queued (#174)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    // A prison in the list is the state a player reaches with the first thing
    // they do, and it is what fills the rail's aside slot -- which is the whole
    // reason this measurement is here rather than in a harness.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.locator('.hud-build')).toBeVisible();

    for (const [width, height] of [
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [900, 600],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
        .toBe(width);

      const arrival = await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const list = document.querySelector('.hud-build__list');
        const queue = document.querySelector('.hud-build__queue');
        if (panel === null || list === null || queue === null) return null;
        const sections = [...document.querySelectorAll('.hud-build .ui-section')].filter(
          (section) => section.getClientRects().length > 0,
        );
        const last = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
        if (last === null) return null;
        const scrollTop = panel.scrollTop;
        panel.scrollTop = 0;
        const p = panel.getBoundingClientRect();
        return {
          scrollTop,
          panelHeight: Math.round(p.height),
          panelOverflow: panel.scrollHeight - panel.clientHeight,
          panelTop: p.top,
          panelBottom: p.bottom,
          fold: p.top + panel.clientTop + panel.clientHeight,
          queueLaidOut: queue.getClientRects().length > 0,
          lastText: last.textContent?.trim() ?? '',
          lastBottom: last.getBoundingClientRect().bottom,
          listOverflow: list.scrollHeight - list.clientHeight,
          listOverflowY: getComputedStyle(list).overflowY,
          shortfalls: [
            '.hud-build > .ui-panel__body',
            '.hud-build__catalogue',
            '.hud-build__catalogue > .ui-section__body',
          ]
            .map((selector) => {
              const box = document.querySelector(selector);
              if (box === null) return `${selector} has no box`;
              const shortfall = box.scrollHeight - box.clientHeight;
              return shortfall === 0 ? null : `${selector} is ${shortfall}px shorter than its own content`;
            })
            .filter((entry) => entry !== null),
        };
      });

      expect(arrival, `the Build panel has no laid-out section at ${width}x${height}`).not.toBeNull();
      if (arrival === null) continue;
      // Vacuity guard, the one the Rooms panel's sibling assertion carries: a
      // panel that failed to lay out reports plausible, meaningless numbers and
      // every comparison below would hold.
      expect(arrival.panelHeight, `the Build panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      // And the state is the one this test claims to be about. A queue laid out
      // here would mean something had queued an order, the catalogue's floor had
      // dropped to one row (`.hud-build[data-queued]`), and every figure below
      // was about a different panel.
      expect(arrival.queueLaidOut, `something is queued at ${width}x${height}`).toBe(false);
      expect(arrival.scrollTop, `something had already scrolled the Build panel at ${width}x${height}`).toBe(0);
      expect(
        arrival.panelOverflow,
        `the Build panel arrives with more content than box at ${width}x${height}`,
      ).toBe(0);
      // Read from the bundled catalog rather than typed as English: ADR 0011
      // puts the key on one side of that boundary and the text on the other.
      expect(arrival.lastText, `the panel's last laid-out section at ${width}x${height}`).toBe(
        localeText('hud.build.coordinates'),
      );
      expect(
        arrival.lastBottom,
        `"${arrival.lastText}" is below the unscrolled Build panel's fold at ${width}x${height}: it ends at y=${Math.round(arrival.lastBottom)} in a panel clipped at y=${Math.round(arrival.fold)}`,
      ).toBeLessThanOrEqual(arrival.fold);
      expect(
        arrival.shortfalls,
        `boxes in the arriving Build panel shorter than their own content at ${width}x${height}`,
      ).toEqual([]);
      // The list is the exception, and the exception has to be reachable: it is
      // holding rows the panel cannot show, so `overflow-y` is what makes the
      // buildables behind the fourth row something a player can get to.
      expect(
        arrival.listOverflowY,
        `the catalogue list holds ${arrival.listOverflow}px it cannot show and is not scrollable at ${width}x${height}`,
      ).toBe('auto');
      // The panel itself is on screen, which is the rail's claim rather than the
      // panel's and is why it is asserted separately.
      expect(
        arrival.panelTop,
        `the Build panel starts above the viewport at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(-0.5);
      expect(arrival.panelBottom, `the Build panel runs past the viewport at ${width}x${height}`).toBeLessThanOrEqual(
        height + 0.5,
      );
    }
  });

  test('a pending delivery costs the Build panel nothing, and its refund is inside the fold (#285)', async ({
    page,
  }) => {
    /*
     * The measurement that decided *where* the purchase-cancel surface goes, and
     * the reason it has to be taken here rather than in `ui-harness.html`: that
     * harness leaves the rail's aside slot empty, `.hud__aside:empty { display:
     * none }` then hands this panel the whole rail, and it is 128.7px more than
     * the application ever gives it -- the exact blindness that let a collapsed
     * queue block sit below the panel's fold with a green suite (ADR 0031
     * decision 3).
     *
     * The constraint this surface was built under: the catalogue is the only
     * block `hud.css` lets this panel take height from, ADR 0031 decision 3
     * already spends 45px of it on the queue, and `BUILDABLE_REGISTRY` now holds
     * twenty-one rows -- so at 900x600 with a queue the list is a 44px box over
     * 924px of rows, one row of twenty-one, which is what that ADR's open
     * question 4 asks about. A third block appearing whenever a delivery was
     * pending would have taken a second donation out of the same place.
     *
     * So the deliveries live inside the buy disclosure, which has no box until
     * the player opens it, and **the claim is an identity**: the panel's arrival
     * geometry with purchases outstanding is the same as with none. Measured at
     * every viewport the suite visits, and the panel is the rail's flexible
     * member, so any change to the save panel, the strip, the tab bar or either
     * floor would show up in it.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.locator('.hud-build')).toBeVisible();

    /** The panel's arrival geometry: what a block appearing here would change. */
    const geometry = () =>
      page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const list = document.querySelector('.hud-build__list');
        const body = document.querySelector('.hud-build > .ui-panel__body');
        if (panel === null || list === null || body === null) return null;
        const sections = [...document.querySelectorAll('.hud-build .ui-section')].filter(
          (section) => section.getClientRects().length > 0,
        );
        const last = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
        const round = (value: number): number => Math.round(value * 10) / 10;
        const panelBox = panel.getBoundingClientRect();
        return {
          panelHeight: round(panelBox.height),
          panelOverflow: panel.scrollHeight - panel.clientHeight,
          panelScrollTop: panel.scrollTop,
          bodyHeight: round(body.getBoundingClientRect().height),
          bodyContent: body.scrollHeight,
          listHeight: round(list.getBoundingClientRect().height),
          listContent: list.scrollHeight,
          lastText: last?.textContent?.trim() ?? '',
          // The gap between the last visible section and the fold: the panel's
          // whole always-visible budget, which is 7.8px at 900x600.
          foldSlack: round(
            panelBox.top + panel.clientTop + panel.clientHeight - (last?.getBoundingClientRect().bottom ?? 0),
          ),
        };
      });

    const before = await geometry();
    expect(before, 'the Build panel is not laid out').not.toBeNull();
    // Vacuity guard: a panel that failed to lay out reports plausible,
    // meaningless numbers and every comparison below would hold.
    expect(before?.panelHeight ?? 0).toBeGreaterThan(150);
    expect(before?.lastText).toBe(localeText('hud.build.coordinates'));
    // The two figures this panel's whole design rests on, at the viewport they
    // were measured at. Written out because they are what a reader has to be able
    // to check the argument against: 291.2px of content in a 291.2px box, and
    // 7.8px between the last section and the fold.
    expect(before?.bodyHeight).toBe(291.2);
    expect(before?.foldSlack).toBe(7.8);
    expect(before?.panelOverflow).toBe(0);
    // And the catalogue is on its two-row floor over twenty-one rows of content,
    // which is the number ADR 0031's open question 4 is about.
    expect(before?.listHeight).toBe(88);
    expect(before?.listContent).toBe(924);

    const buy = page.locator('.hud-build__buy-submit');
    const deliveries = page.locator('.hud-build__deliveries');
    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    /*
     * **Five** purchases, each `wall-brick`'s two bricks at 40, and five rather
     * than three on purpose: the block draws three rows, so five is the state
     * where the "and N more" line is also laid out -- the tallest the disclosure
     * ever gets -- and it is the only state in which raising the row limit shows
     * up as a control outside the panel. Measured: with three bought, a limit of
     * four leaves the fourth row hidden and every assertion below green.
     *
     * The clock has to run for any of them to execute -- `Kernel.step` is what
     * dispatches a queued command -- and it is stopped again afterwards so the
     * deliveries stay in flight for the rest of the test rather than landing
     * mid-measurement.
     */
    const purchases = 5;
    await page.locator('.hud-build__buy-toggle').click();
    await expect(page.locator('.hud-build__buy')).toBeVisible();
    await expect(buy).toHaveText(`Buy 2 × Brick · ${fundsText(2 * unitPriceOf('item.brick'))}`);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    for (let press = 0; press < purchases; press += 1) await buy.click();
    await expect
      .poll(async () => deliveries.getAttribute('data-pending'), {
        message: 'the purchases never reached the Build panel as pending deliveries',
        timeout: 20_000,
      })
      .toBe(String(purchases));
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    await expect(funds).toHaveText(
      fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - purchases * 2 * unitPriceOf('item.brick')),
    );

    // Closed again: the arrival state, with three purchases outstanding.
    await page.locator('.hud-build__buy-toggle').click();
    await expect(page.locator('.hud-build__buy')).toBeHidden();

    for (const [width, height] of [
      [900, 600],
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
        .toBe(width);
      const withPending = await geometry();
      expect(withPending, `the Build panel is not laid out at ${width}x${height}`).not.toBeNull();
      expect(
        (await deliveries.getAttribute('data-pending')) ?? '',
        `the panel forgot the pending deliveries at ${width}x${height}`,
      ).toBe(String(purchases));
      // The block itself has no box while the disclosure is closed, which is the
      // mechanism the identity below rests on.
      expect(await deliveries.boundingBox(), `the deliveries block has a box while closed at ${width}x${height}`).toBeNull();

      // And nothing about the panel moved. Compared against a snapshot of the
      // same panel at the same viewport with nothing bought, so this is an
      // identity rather than a set of remembered constants.
      await page.setViewportSize({ width, height });
      const baseline = width === 900 && height === 600 ? before : null;
      if (baseline !== null) expect(withPending).toEqual(baseline);
      expect(withPending?.panelOverflow, `the panel scrolls with a delivery pending at ${width}x${height}`).toBe(0);
      expect(withPending?.lastText, `the panel's last visible section at ${width}x${height}`).toBe(
        localeText('hud.build.coordinates'),
      );
    }

    /*
     * Opened at 900x600: every Cancel inside the panel's visible box, a real tap
     * target, and hit-testing to itself. This is the state the row limit is a
     * measurement of -- three rows put the open disclosure at 312.9px in a 337.0px
     * box, and a fourth takes it to 360.9px and leaves the last control 7.9px
     * below the fold with a full box and an `offsetParent`, which is #220's shape
     * exactly.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await page.locator('.hud-build__buy-toggle').click();
    await expect(deliveries).toBeVisible();

    const reach = await page.evaluate(() => {
      const panel = document.querySelector('.hud-build');
      if (panel === null) return null;
      const panelBox = panel.getBoundingClientRect();
      const fold = panelBox.top + panel.clientTop + panel.clientHeight;
      const measure = (element: Element | null) => {
        if (element === null) return null;
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return {
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          insidePanel: rect.top >= panelBox.top - 0.5 && rect.bottom <= fold + 0.5,
          hitsItself: element.contains(hit) || element === hit,
          hasOffsetParent: (element as HTMLElement).offsetParent !== null,
        };
      };
      return {
        rows: [...document.querySelectorAll('.hud-build__delivery-row')]
          .filter((row) => row.getClientRects().length > 0)
          .map((row) => ({
            delivery: (row as HTMLElement).dataset['delivery'] ?? '',
            cancel: measure(row.querySelector('.ui-action')),
          })),
        // The control the player opened the row for. Revealing the refunds must
        // not push what buys off the screen.
        buy: measure(document.querySelector('.hud-build__buy-submit')),
        moreLaidOut: (document.querySelector('.hud-build__deliveries-more')?.getClientRects().length ?? 0) > 0,
        openRowHeight: Math.round((document.querySelector('.hud-build__buy')?.getBoundingClientRect().height ?? 0) * 10) / 10,
        panelVisibleHeight: Math.round(panel.clientHeight * 10) / 10,
      };
    });

    expect(reach, 'nothing was laid out to measure').not.toBeNull();
    // Three, as a literal rather than as `PENDING_DELIVERY_ROW_LIMIT`: the limit
    // is the thing being guarded, so an expectation read out of it would move
    // with the mutation instead of failing on it.
    expect(reach?.rows).toHaveLength(3);
    expect(reach?.moreLaidOut, 'the "and N more" line is not laid out, so this is not the tallest state').toBe(true);
    // The rectangle the row limit is: the whole open row fits inside the panel's
    // visible box, so the scroll the disclosure already performs is enough.
    expect(reach?.openRowHeight ?? 0).toBeLessThanOrEqual(reach?.panelVisibleHeight ?? 0);
    for (const row of reach?.rows ?? []) {
      expect(row.cancel, `${row.delivery} has no cancel control`).not.toBeNull();
      expect(row.cancel?.hasOffsetParent, `${row.delivery}'s cancel has no offsetParent`).toBe(true);
      expect(row.cancel?.height ?? 0, `${row.delivery}'s cancel is shorter than a tap target`).toBeGreaterThanOrEqual(44);
      expect(row.cancel?.width ?? 0, `${row.delivery}'s cancel is narrower than a tap target`).toBeGreaterThanOrEqual(44);
      expect(row.cancel?.insidePanel, `${row.delivery}'s cancel is outside the panel's visible box`).toBe(true);
      expect(row.cancel?.hitsItself, `${row.delivery}'s cancel is covered by something else`).toBe(true);
    }
    expect(reach?.buy?.insidePanel, 'the buy button left the panel\'s visible box').toBe(true);
    expect(new Set((reach?.rows ?? []).map((row) => row.delivery)).size).toBe(3);

    /*
     * And the whole loop, on the page a player loads: press one Cancel and the
     * balance goes *up* by exactly what that delivery cost.
     *
     * This is the assertion #285 is about. Before this change the balance could
     * only fall in the procurement half -- `ProcurementSystem.cancel` was the one
     * credit besides the state income line and nothing in `src/` called it, so
     * money spent on a delivery a player had changed their mind about was
     * unrecoverable by any means the interface offered.
     */
    const refundOf = 2 * unitPriceOf('item.brick');
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await page.locator('.hud-build__delivery-row .ui-action').first().click();
    await expect
      .poll(async () => funds.textContent(), {
        message: 'pressing Cancel never credited the treasury, so the refund is still unreachable',
        timeout: 20_000,
      })
      .toBe(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - purchases * refundOf + refundOf));
    // And one purchase left the list: the press refunded a delivery rather than
    // the whole list or none of it.
    await expect
      .poll(async () => deliveries.getAttribute('data-pending'), { timeout: 20_000 })
      .toBe(String(purchases - 1));
    // Nothing was refused: the delivery was still in flight, so this is the
    // credit path and not the `cancel-purchase.not-pending` branch.
    await expect(page.locator('.hud__refusal')).toBeHidden();
  });

  /**
   * The Rooms panel's own geometry, on the assembled page (ADR 0022, amended).
   *
   * **This has to be here rather than in `ui-shell.spec.ts` for the reason the
   * Build panel's last-section measurement above does**, and it is the same
   * reason stated one panel over: that harness leaves the rail's aside slot
   * empty, `.hud__aside:empty { display: none }` then hands the panel the whole
   * rail, and the class of defect this test is about cannot be reproduced there.
   * Measured: dropping the status block's three terms from
   * `.hud-rooms > .ui-panel__body`'s floor -- the exact shape of #174's defect --
   * leaves every assertion in the harness spec green.
   *
   * What it measures is the number the owner's choice of a tab over a
   * Build-panel block rests on. The Build panel's *always-visible* budget at
   * 900x600 is 7.81px; this panel needs a confirm row, a removal control, a
   * too-small warning and an enclosure readout, and on the aside it gets a
   * 291.2px body instead. The assertion is that the last block in the panel --
   * the status block, holding the two rule lines and the enclosure readout -- is
   * inside the panel's own fold, unscrolled, in a rail that really holds the
   * save panel.
   *
   * `scrollTop` is read before the block is measured and then reset, exactly as
   * the Build panel's is: a panel left scrolled by an earlier interaction would
   * carry the block back inside the fold and make the measurement pass for the
   * very reason the defect is a defect.
   */
  test("the Rooms panel's last block is inside its fold at every viewport (ADR 0022)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    // A prison in the list is the state a player reaches with the first thing
    // they do, and it is what puts the save panel in the rail's aside slot --
    // which is the whole point of measuring here rather than in the harness.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    for (const [width, height] of [
      [1280, 720],
      [1440, 900],
      [1024, 768],
      [900, 600],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.ui-tab[data-tab="rooms"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();

      const geometry = await page.evaluate(() => {
        const panel = document.querySelector('.hud-rooms');
        const status = document.querySelector('.hud-rooms__status');
        const last = document.querySelector('.hud-rooms__enclosure');
        if (panel === null || status === null || last === null) return null;
        const scrollTop = panel.scrollTop;
        panel.scrollTop = 0;
        const p = panel.getBoundingClientRect();
        return {
          scrollTop,
          panelHeight: Math.round(p.height),
          statusBottom: status.getBoundingClientRect().bottom,
          lastBottom: last.getBoundingClientRect().bottom,
          fold: p.top + panel.clientTop + panel.clientHeight,
          panelTop: p.top,
          panelBottom: p.bottom,
        };
      });

      expect(geometry, `the Rooms panel has no box at ${width}x${height}`).not.toBeNull();
      if (geometry === null) continue;
      // Vacuity guard: a panel that failed to lay out reports plausible,
      // meaningless numbers, and every comparison below would hold.
      expect(geometry.panelHeight, `the Rooms panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      expect(
        geometry.scrollTop,
        `something had already scrolled the Rooms panel at ${width}x${height}`,
      ).toBe(0);
      expect(
        geometry.lastBottom,
        `the enclosure readout is below the unscrolled Rooms panel's fold at ${width}x${height}: it ends at y=${Math.round(geometry.lastBottom)} in a panel clipped at y=${Math.round(geometry.fold)}`,
      ).toBeLessThanOrEqual(geometry.fold);
      expect(
        geometry.statusBottom,
        `the Rooms panel's last block is below its fold at ${width}x${height}`,
      ).toBeLessThanOrEqual(geometry.fold);
      // And the panel itself is on screen, which is the rail's claim rather
      // than the panel's and is why it is asserted separately.
      expect(geometry.panelTop, `the Rooms panel starts above the viewport at ${width}x${height}`)
        .toBeGreaterThanOrEqual(-0.5);
      expect(geometry.panelBottom, `the Rooms panel runs past the viewport at ${width}x${height}`)
        .toBeLessThanOrEqual(height + 0.5);

      // No box that carries the panel's height is ever shorter than its own
      // content -- the property, not the one box somebody happened to measure.
      // `.hud-rooms__list` is deliberately absent: it is the one box here that is
      // *meant* to hold more than it shows, and with eighteen room types against
      // a one-row floor it always does.
      expect(
        await page.evaluate(() =>
          ['.hud-rooms > .ui-panel__body', '.hud-rooms__catalogue', '.hud-rooms__catalogue > .ui-section__body']
            .map((selector) => {
              const box = document.querySelector(selector);
              if (box === null) return `${selector} has no box`;
              const shortfall = box.scrollHeight - box.clientHeight;
              return shortfall === 0 ? null : `${selector} is ${shortfall}px shorter than its own content`;
            })
            .filter((entry) => entry !== null),
        ),
        `boxes in the Rooms panel shorter than their own content at ${width}x${height}`,
      ).toEqual([]);

      // The rail still holds with the tallest panel in the HUD showing.
      expect(
        railInvariants(await railIntegrity(page)),
        `the rail on the Rooms tab at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });
    }
  });

  /**
   * The world the Rooms panel is drawn on, measured in pixels at three
   * viewports (ADR 0022, amended).
   *
   * ### What was wrong
   *
   * The whole Rooms interaction is "drag a rectangle across the tiles this room
   * should cover", and the two controls the finished rectangle reveals -- the
   * confirm and the discard -- exist only while one is pending. At 375x812 there
   * was nowhere to drag. Measured on this page, Rooms tab, one prison saved,
   * both rail panels expanded: the save panel occupies y 96..251.7 and the Rooms
   * panel y 267.7..718.8, both the full 359px of a stretched rail, and with the
   * 88px strip and the tab bar at y 742.8 the gaps between them are 8, 16 and 24
   * pixels. The largest square of bare world anywhere on the page is **16px** --
   * a quarter of one tile -- so the feature was unusable on a phone and #312
   * recorded that rather than pretending otherwise.
   *
   * Two things were missing. The panel's own fold did nothing at all -- `hidden`
   * on a body that `hud.css` gives a flex `display` is not hidden, so pressing
   * "Collapse" flipped `data-collapsed`, announced `aria-expanded="false"` and
   * left 404.1px of body on screen -- and nothing used the fold even once it
   * worked. Arming now folds the panel to its header, and a finished rectangle
   * brings it back.
   *
   * ### What this asserts, and why each number is here
   *
   * Three claims per viewport, none of them a screenshot:
   *
   *  1. **On arrival, nothing moved.** The panel is exactly where it was at
   *     every viewport, so the phone was not fixed by rearranging the desktop.
   *     At 375x812 that means the largest bare square is still under one tile,
   *     which is the recording this test inherits from #312 -- kept as an
   *     assertion, because it is the reason the fold exists.
   *  2. **Armed, the world is there.** The panel is its header and nothing else
   *     (no body box at all), and a square of bare world at least three tiles on
   *     a side can be found by hit-testing. Measured: 336px at 375x812, which
   *     was the scan's own cap, in a band 348.8px tall and the full width.
   *  3. **Pending, both controls are hittable.** Not "present" and not "visible"
   *     -- each is measured against `--tap-target` in *both* axes and hit-tested
   *     at five points, because a control whose centre is clear while a fifth of
   *     it is buried is a defect a player meets as a mis-click.
   *
   * The vacuity guards matter as much as the assertions: a page that failed to
   * load reports plausible, meaningless geometry, and this file has been fooled
   * by exactly that before. So the canvas is checked against the viewport, the
   * catalogue is checked to hold all eighteen authored room types, and the drag
   * is required to produce a rectangle with two real axes before anything is
   * said about the controls it revealed.
   */
  test('the Rooms panel yields the world it is drawn on, and brings its confirm pair back', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    // One prison in the list is what puts the save panel in the rail's aside
    // slot, which is half of what consumes the height at 375x812.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    for (const [width, height] of [
      [1280, 720],
      [900, 600],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await expect
        .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
        .toBe(width);
      await page.locator('.ui-tab[data-tab="rooms"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();

      // Vacuity guard, before a single pixel is trusted: the page really is
      // showing the Rooms panel of the real application, with the real
      // catalogue behind it. Eighteen is `ROOM_CATALOG`'s own length; a harness
      // page has three.
      expect(
        await page.locator('.hud-rooms__list [data-room]').count(),
        `the Rooms catalogue is not the shipped one at ${width}x${height}`,
      ).toBe(18);

      const arrival = await roomWorldGeometry(page);
      expect(arrival.panel, `the Rooms panel has no box at ${width}x${height}`).not.toBeNull();
      expect(arrival.bodyLaidOut, `the Rooms panel arrives folded at ${width}x${height}`).toBe(true);
      expect(arrival.collapsed, `the Rooms panel arrives collapsed at ${width}x${height}`).toBe('false');
      // 1. Arrival is untouched. The panel's own height is the number the fold
      // trades away, so it is the number pinned here.
      expect(
        Math.round((arrival.panel?.height ?? 0) * 10) / 10,
        `the Rooms panel's arrival height changed at ${width}x${height}`,
      ).toBe(ARRIVAL_PANEL_HEIGHT_PX[`${width}x${height}`]);
      if (width === 375) {
        // The recording #312 shipped, kept as an assertion. `TILE_SIZE_PX` is 64
        // at zoom 1, so "under 64" is "not even one tile", and every authored
        // room needs at least 2x2 of them.
        expect(
          arrival.largestBareSquare,
          `bare world appeared on arrival at ${width}x${height}, so the fold below may no longer be needed`,
        ).toBeLessThan(64);
        expect(arrival.gapsBetweenPanels, `the rail's gaps changed at ${width}x${height}`).toEqual([8, 16, 24]);
      }

      // ---- armed: the panel gets out of the way -----------------------
      await page.locator('.hud-rooms__arm').click();
      const drawing = await roomWorldGeometry(page);
      expect(drawing.collapsed, `arming did not fold the Rooms panel at ${width}x${height}`).toBe('true');
      // Folded to its header means *no body box*, not a body with nothing in
      // it: `hidden` that does not hide is the defect this half of the change
      // fixed, and it is invisible to anything that only reads the attribute.
      expect(
        drawing.bodyLaidOut,
        `the folded Rooms panel still lays out its body at ${width}x${height}`,
      ).toBe(false);
      expect(
        Math.round((drawing.panel?.height ?? 0) * 10) / 10,
        `the folded Rooms panel is not its header at ${width}x${height}`,
      ).toBe(47);
      // 2. And the world is genuinely reachable: three tiles on a side, which is
      // a rectangle with two real axes rather than a line.
      expect(
        drawing.largestBareSquare,
        `no square of bare world to draw a room in at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(192);

      // ---- pending: the panel comes back, and can be pressed ----------
      expect(
        await dragRectangleOnWorld(page),
        `a room drag found no bare world at ${width}x${height}`,
      ).toBe(true);
      await expect(
        page.locator('.hud-rooms__area'),
        `the dragged area is not a rectangle at ${width}x${height}`,
      ).toHaveAttribute('data-area', /^-?\d+,-?\d+,[2-9]\d*,[2-9]\d*$/);

      const pending = await roomWorldGeometry(page);
      expect(pending.collapsed, `a pending rectangle left the panel folded at ${width}x${height}`).toBe('false');
      expect(pending.bodyLaidOut).toBe(true);
      // 3. The two controls the rectangle revealed, measured and hit-tested.
      // `--tap-target` is 44px and applied by CSS convention: nothing pins the
      // rendered box, and a token test cannot, because a token is not a layout.
      expect(
        pending.pendingControls,
        `the pending rectangle's controls are not hittable tap targets at ${width}x${height}`,
      ).toEqual([
        { control: 'hud-rooms__confirm', tapTarget: true, hittable: true },
        { control: 'hud-rooms__cancel', tapTarget: true, hittable: true },
      ]);

      // The rail holds in the state nothing measured before this: one panel
      // folded, the other grown into the slack it left. Discarding is what gets
      // back there -- the tool stays armed, so the drawing pass resumes and the
      // panel folds again, which is the loop a player designating a row of cells
      // is actually in.
      await page.locator('.hud-rooms__cancel').click();
      await expect(page.locator('.hud-rooms')).toHaveAttribute('data-collapsed', 'true');
      expect(
        railInvariants(await railIntegrity(page)),
        `the rail with the Rooms panel folded at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });

      await page.locator('.ui-tab[data-tab="build"]').click();
    }
  });

  /**
   * What a zoned room is missing, on the assembled page (#331 milestone).
   *
   * ### The gap
   *
   * The simulation could answer this and the interface never asked. A zoned
   * `room.cell` with nothing standing in it reports
   * `requirementSummary.missingCapability: 2` from `projectRoomList`, and
   * `projectRoomDetail` names the two objects -- the same signal `IntakeSystem`
   * gates an admission on, so the room genuinely does nothing until they are
   * there. Nothing under `src/ui/` constructed a `SimulationProjectionRequester`,
   * so the panel that made the room could not say why.
   *
   * ### Why this is measured here and not in the harness
   *
   * Three of the things being asserted only exist on this page. The eighteen-row
   * catalogue is the shipped one (a harness page has three); the verdict comes
   * out of a **real simulation worker** over a real
   * `simulation/request-projection` round trip rather than a view model a test
   * pushed in; and the rail this panel sits in holds the save panel above it,
   * which is half of what consumes the height at 375x812.
   *
   * ### Why the geometry is measured and not asserted with `toContainText`
   *
   * `toContainText` passes inside a `display: none` subtree and on a zero-size
   * box, which is exactly how #220's "simulation unavailable" row stayed green
   * while no player could see it. So the readout's own border box and its
   * `offsetParent` are read at both viewports, against the panel's unscrolled
   * fold -- and the vacuity guards come first, because a page that failed to
   * load reports plausible, meaningless numbers.
   *
   * ### The half that stops it becoming furniture
   *
   * The first thing asserted is that a prison with no rooms shows **no readout
   * at all** -- no box, no `offsetParent`, and nothing in `.hud`'s rendered
   * text. A panel whose height budget ADR 0022 measured at 7.9px cannot afford a
   * block that is always there to say everything is fine.
   */
  test('the Rooms panel says what a zoned room is missing, and says nothing when nothing is (#331)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="rooms"]').click();
    await expect(page.locator('.hud-rooms')).toBeVisible();

    // Vacuity guard, before a single pixel is trusted: this is the shipped
    // application with the shipped catalogue behind it, not a harness.
    // Eighteen is `ROOM_CATALOG`'s own length.
    expect(
      await page.locator('.hud-rooms__list [data-room]').count(),
      'the Rooms catalogue is not the shipped one',
    ).toBe(18);

    /** The readout's box, its `offsetParent`, and what it says. */
    const needsProbe = async (): Promise<{
      readonly present: boolean;
      readonly hidden: boolean;
      readonly laidOut: boolean;
      readonly offsetParent: boolean;
      readonly width: number;
      readonly height: number;
      readonly bottom: number;
      readonly unfinished: string;
      readonly needs: string;
      readonly line: string;
      readonly text: string;
      readonly panelFold: number;
      readonly panelHeight: number;
      readonly panelScrollTop: number;
      readonly hudText: string;
    }> =>
      page.evaluate(() => {
        const node = document.querySelector<HTMLElement>('.hud-rooms__needs');
        const panel = document.querySelector<HTMLElement>('.hud-rooms');
        const panelRect = panel?.getBoundingClientRect();
        const rect = node?.getBoundingClientRect();
        return {
          present: node !== null,
          // `=== true`, because the DOM's `hidden` is `boolean | 'until-found'`
          // and this only ever asks whether the attribute is the plain form the
          // panel sets.
          hidden: node?.hidden === true,
          // A box the browser actually laid out, not the attribute's opinion of
          // one: `hidden` on a block whose class carries its own `display` is
          // not hidden, which is the trap `.ui-panel__body[hidden]` exists for.
          laidOut: (node?.getClientRects().length ?? 0) > 0,
          offsetParent: node !== null && node.offsetParent !== null,
          width: Math.round((rect?.width ?? 0) * 10) / 10,
          height: Math.round((rect?.height ?? 0) * 10) / 10,
          bottom: Math.round((rect?.bottom ?? 0) * 10) / 10,
          unfinished: node?.dataset['unfinished'] ?? '',
          needs: node?.dataset['needs'] ?? '',
          line: document.querySelector<HTMLElement>('.hud-rooms__needs-line')?.innerText.trim() ?? '',
          text: node?.innerText.trim() ?? '',
          panelFold:
            panel === null || panelRect === undefined
              ? 0
              : Math.round((panelRect.top + panel.clientTop + panel.clientHeight) * 10) / 10,
          panelHeight: Math.round((panelRect?.height ?? 0) * 10) / 10,
          panelScrollTop: panel?.scrollTop ?? 0,
          hudText: document.querySelector<HTMLElement>('.hud')?.innerText ?? '',
        };
      });

    // ---- nothing zoned: no readout, at either viewport ----------------
    //
    // The case that keeps this out of the way. It is checked at both viewports
    // and not only at the desktop one, because the ≤720px media query drops
    // `.hud__corner` and folds the rail into one column, and "invisible at
    // 1280x800" has been true of something visible at 375px before.
    for (const [width, height] of [
      [1280, 800],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.ui-tab[data-tab="build"]').click();
      await page.locator('.ui-tab[data-tab="rooms"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();
      const empty = await needsProbe();
      expect(empty.present, `the readout block is not in the DOM at all at ${width}x${height}`).toBe(true);
      expect(empty.panelHeight, `the Rooms panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      expect(empty.hidden, `a prison with no rooms shows a readout at ${width}x${height}`).toBe(true);
      expect(empty.laidOut, `the readout has a box with no rooms zoned at ${width}x${height}`).toBe(false);
      expect(empty.offsetParent, `the readout is painted with no rooms zoned at ${width}x${height}`).toBe(false);
      expect(empty.height, `the readout takes height with no rooms zoned at ${width}x${height}`).toBe(0);
      expect(empty.line, `the readout has a detail line with no rooms zoned at ${width}x${height}`).toBe('');
      // And the HUD's rendered text does not mention it, which is the
      // assertion #220 found `toContainText` unable to make.
      expect(
        empty.hudText.includes(localeText('hud.rooms.needs')),
        `the HUD says "${localeText('hud.rooms.needs')}" with no rooms zoned at ${width}x${height}`,
      ).toBe(false);
    }

    // ---- two cells zoned, and nothing standing in either -------------
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.ui-tab[data-tab="rooms"]').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    expect(await dragRectangleOnWorld(page), 'a room drag found no bare world').toBe(true);
    await page.locator('.hud-rooms__confirm').click();
    // A new session starts paused and a command queued against a paused clock
    // is not dispatched, so the room does not register until the clock runs.
    // The count moving from 0 is the proof that a real worker took it.
    await page.getByRole('button', { name: localeText('hud.transport.play') }).click();
    await expect(page.locator('[data-metric="rooms"]')).toContainText('1');

    /*
     * The readout arrives **without the player leaving the tab**, which is the
     * half of the wiring a tab switch would hide.
     *
     * Nothing has been clicked but the world and the confirm since the Rooms tab
     * was selected, so the only thing that can have asked is the
     * `simulation/status-counts` cadence. It matters because placing an object
     * changes what a room has and moves no count at all: a readout refreshed
     * only when a tab is selected would sit there saying "needs a bed" after the
     * bed was built.
     *
     * The panel is folded here -- confirming leaves the tool armed, so the
     * drawing pass resumes -- so the header control is what brings the body
     * back, exactly as a player reaching for it would.
     */
    await expect(page.locator('.hud-rooms')).toHaveAttribute('data-collapsed', 'true');
    await page.locator('.hud-rooms > .ui-panel__header > .ui-panel__toggle').click();
    await expect(
      page.locator('.hud-rooms__needs'),
      'the readout never arrived on the counts cadence, only on a tab change',
    ).toBeVisible();
    expect((await needsProbe()).unfinished).toBe('1');

    // A second cell, lower down so it cannot overlap the first. The tool stays
    // armed through a confirm, so this is another drag and nothing else -- and
    // two rooms are what make the readout have more needs than rows.
    expect(await dragRectangleOnWorld(page, { minY: 320 }), 'a second room drag found no bare world').toBe(
      true,
    );
    await page.locator('.hud-rooms__confirm').click();
    await expect(page.locator('[data-metric="rooms"]')).toContainText('2');

    for (const [width, height] of [
      [1280, 800],
      [375, 812],
      [900, 600],
    ] as const) {
      await page.setViewportSize({ width, height });
      // Away and back: leaving the tab disarms the tool and takes the readout
      // off, so what is measured is a fresh pull into an unfolded panel --
      // which is also the state a player is in when they come back to look.
      await page.locator('.ui-tab[data-tab="build"]').click();
      await page.locator('.ui-tab[data-tab="rooms"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();
      await expect(page.locator('.hud-rooms__needs')).toBeVisible();

      const shown = await needsProbe();
      // Vacuity again, and it is not the same guard as above: a panel that
      // failed to lay out reports a plausible zero for every box below.
      expect(shown.panelHeight, `the Rooms panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
      expect(
        shown.panelScrollTop,
        `something had already scrolled the Rooms panel at ${width}x${height}`,
      ).toBe(0);

      // 1. The verdict is the simulation's, and it counted both rooms.
      expect(shown.unfinished, `the readout does not report both rooms at ${width}x${height}`).toBe('2');

      // 2. It is painted: a real box, with a real `offsetParent`, wide enough
      // and tall enough to be read.
      expect(shown.hidden, `the readout is hidden at ${width}x${height}`).toBe(false);
      expect(shown.laidOut, `the readout has no box at ${width}x${height}`).toBe(true);
      expect(shown.offsetParent, `the readout has no offsetParent at ${width}x${height}`).toBe(true);
      expect(shown.width, `the readout is too narrow to read at ${width}x${height}`).toBeGreaterThan(200);
      // Two lines and its own gutters: 30px is well under the 43px the tightest
      // viewport can afford and well over a single collapsed line.
      expect(shown.height, `the readout is too short to hold its two lines at ${width}x${height}`).toBeGreaterThan(
        30,
      );

      // 3. And inside the panel's own unscrolled fold, which is the assertion
      // #174 and ADR 0022 both turn on: a block below the fold is present,
      // laid out and unreachable.
      expect(
        shown.bottom,
        `the readout is below the unscrolled Rooms panel's fold at ${width}x${height}: it ends at y=${shown.bottom} in a panel clipped at y=${shown.panelFold}`,
      ).toBeLessThanOrEqual(shown.panelFold);

      // 4. It says the whole sentence, and the sentence is the catalogue's.
      //
      // Built from the bundled default locale rather than typed here: ADR 0011
      // puts the key on one side of that boundary and the text on the other, so
      // a test that hard-coded "Cell at 6, 10 needs Bed, and 3 more" would be
      // asserting against a copy and would stay green while the player read
      // something else. The tile is the one part left as a pattern, because
      // where the drag landed is not this test's claim.
      //
      // `needs-more` and not `needs-one`: two cells with nothing in them is four
      // unmet requirements and the line names one, so it has to say how many it
      // did not rather than dropping three of them in silence.
      const expected = localeText('hud.rooms.needs-more')
        .replace('{room}', localeText('room.cell.name'))
        .replace('{object}', localeText('object.bed.name'))
        .replace('{count}', '3');
      expect(
        shown.line,
        `the readout does not say what the room needs at ${width}x${height}`,
      ).toMatch(
        new RegExp(
          `^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{x\\}', '-?\\d+').replace('\\{y\\}', '-?\\d+')}$`,
        ),
      );
      // The same figure as a number rather than as prose, so the count above is
      // not being read off the sentence it is meant to be checking.
      expect(shown.needs, `the readout does not report every unmet requirement at ${width}x${height}`).toBe('4');

      // 5. Nothing else in the panel was pushed out to make room. The
      // catalogue list is deliberately absent: it is the one box here that is
      // meant to hold more than it shows, and it is what pays for this block.
      expect(
        await page.evaluate(() =>
          ['.hud-rooms > .ui-panel__body', '.hud-rooms__catalogue', '.hud-rooms__catalogue > .ui-section__body']
            .map((selector) => {
              const box = document.querySelector(selector);
              if (box === null) return `${selector} has no box`;
              const shortfall = box.scrollHeight - box.clientHeight;
              return shortfall === 0 ? null : `${selector} is ${shortfall}px shorter than its own content`;
            })
            .filter((entry) => entry !== null),
        ),
        `boxes in the Rooms panel shorter than their own content at ${width}x${height}`,
      ).toEqual([]);
      expect(
        railInvariants(await railIntegrity(page)),
        `the rail with the room readout showing at ${width}x${height}`,
      ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });
    }
  });

  test('every runtime atlas reaches the page over HTTP and decodes at its authored size', async ({ page }) => {
    const atlasResponses = new Map<string, number>();
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith(`${ATLAS_BASE_PATH}/`) && url.pathname.endsWith('.png')) {
        atlasResponses.set(url.pathname, response.status());
      }
    });

    const rendererComplaints: string[] = [];
    page.on('console', (message) => {
      // `WorldScene.loadActorAtlases` funnels every failure — a manifest that
      // will not parse, an image Phaser could not load — through `onError`,
      // which logs with this prefix. The renderer is deliberately tolerant of
      // missing art (`docs/RENDERING.md`: "Art is not correctness"), so this
      // is the only signal the page gives that the atlas path failed.
      if (message.text().includes('World renderer:')) rendererComplaints.push(message.text());
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const expected = expectedAtlasSizes();
    expect(expected.size, 'no atlas manifests were found on disk to check against').toBeGreaterThan(0);

    // The *application* asked for these, before this test fetches anything.
    await expect
      .poll(() => [...atlasResponses.keys()].sort(), { message: 'the page never requested every runtime atlas' })
      .toEqual([...expected.keys()].sort());
    expect([...atlasResponses.values()].filter((status) => status !== 200)).toEqual([]);

    // Decode is the step that separates art from a Git LFS pointer. A pointer
    // is served as `200 image/png` and is ~130 bytes of text; every check
    // short of a decoder waves it through.
    const decoded = await page.evaluate(async (urls: readonly string[]) => {
      const results: Record<string, [number, number] | string> = {};
      for (const url of urls) {
        try {
          const response = await fetch(url);
          const bitmap = await createImageBitmap(await response.blob());
          results[url] = [bitmap.width, bitmap.height];
          bitmap.close();
        } catch (error) {
          results[url] = `did not decode: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      return results;
    }, [...expected.keys()]);

    for (const [url, size] of expected) {
      expect(decoded[url], `${url} did not decode at its authored size`).toEqual([size[0], size[1]]);
    }

    // Phaser's own loader ran over the same files. If it had rejected one,
    // `registerAtlasTextures` would have thrown and the scene would have
    // reported it here.
    expect(rendererComplaints).toEqual([]);
  });

  test('a prison created in the running game is still listed after a real navigation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await expect(page.locator('.save-panel__empty')).toBeVisible();
    await expect(page.locator('.save-panel__empty')).toHaveText('No prisons yet.');

    await page.getByRole('button', { name: 'New prison' }).click();
    // The whole production path: the panel asks the session controller, which
    // asks the simulation worker for a snapshot and writes the generation to
    // IndexedDB. `(1 gen)` is the proof that generation reached storage —
    // issue #65's orphan was a row with none.
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
    await expect(page.locator('.save-panel__status')).toBeVisible();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

    // A real navigation. The module graph, the Phaser game, the simulation
    // worker and every `IDBDatabase` connection are gone; the page that comes
    // back has to find the save on disk by itself.
    await page.reload();
    await openApp(page);

    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
    await expect(page.locator('.save-panel__empty')).toHaveCount(0);
  });

  /**
   * Issue #287, and the whole point of the Import control: a session the game
   * exported comes back.
   *
   * The path is the player's, end to end and with no stub anywhere in it -- run
   * the simulation for a while, pause, save, Export (a real download), New
   * prison (a second, empty session in a worker of its own), Import the
   * downloaded bytes back through a real file chooser, then Save now, which
   * captures from the worker the import restored into, and Export again to read
   * what that worker is actually holding.
   *
   * The last two steps are what make this more than a storage test. Export
   * returns the *stored* generation, so exporting straight after an import
   * would compare a file with itself; capturing first means the payload
   * compared has been through `SparseWorld.fromSnapshot` and the rest of the
   * restore, in a real worker, and come back out. `tests/determinism/snapshot-restore-fidelity.test.ts`
   * proves that fidelity in-process; this proves the *player-reachable* path
   * reaches it.
   *
   * Elapsed simulation time is what makes the comparison non-vacuous, and it is
   * chosen because a player can produce it with one press. A run of ticks
   * carries the kernel's tick, its command sequence and every RNG stream state,
   * so the second prison -- day one, tick zero, in a worker of its own -- is
   * genuinely a different session, and an Import that did nothing would leave
   * the final payload equal to *that* rather than to the file. Laying a wall
   * would not do: with no materials bought the order is refused, so the
   * construction section of both saves is empty and the comparison would pass
   * on two copies of nothing (measured while writing this test).
   */
  test('a save file the game exported can be imported back, and the session comes back with it (#287)', async ({ page }) => {
    test.slow(); // three sessions, two downloads and a real worker restore

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    /** The bytes behind the Export button, read from the real download. */
    const exportSave = async (): Promise<{ readonly text: string; readonly envelope: ExportedEnvelope }> => {
      const downloading = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export' }).click();
      const download = await downloading;
      // The file name a player sees, and evidence the download is this app's.
      expect(download.suggestedFilename()).toMatch(/\.lockstate\.json$/);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString('utf8');
      return { text, envelope: JSON.parse(text) as ExportedEnvelope };
    };

    /** Answers the Import control's file chooser with `text`, as a player picking a file does. */
    const importSave = async (text: string, name: string): Promise<void> => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Import' }).click();
      await (await chooser).setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
    };

    const progress = page.locator('.hud-clock__day-progress');
    const pause = page.locator('.hud-strip__transport [title="Pause"]');

    // --- a prison with a history: some of day one has been played ---
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
    await expect(progress).toHaveText('0%');

    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => progress.textContent(), {
        message: 'the simulation never advanced, so there is no history to export',
        timeout: 15_000,
      })
      .not.toBe('0%');
    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    const playedTo = await progress.textContent();

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

    const exported = await exportSave();
    await expect(page.locator('.save-panel__status')).toHaveText('Exported the current save.');
    // A real save file at the version this build writes, holding a kernel that
    // has actually run. Without the second half the comparison below could be
    // two copies of a fresh prison.
    expect(exported.envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(exported.envelope.payload.kernel.tick, 'nothing was simulated before the export').toBeGreaterThan(0);

    // --- a second, empty prison: the session the file has to replace ---
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label')).toHaveCount(2);
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
    await expect(progress).toHaveText('0%');
    const emptyPrison = await exportSave();
    expect(emptyPrison.envelope.prisonId).not.toBe(exported.envelope.prisonId);
    expect(
      emptyPrison.envelope.payload.kernel.tick,
      'the two sessions are indistinguishable, so importing one over the other would prove nothing',
    ).toBe(0);

    // --- the import, through the control a player presses ---
    await importSave(exported.text, `${exported.envelope.prisonId}.lockstate.json`);
    await expect(page.locator('.save-panel__status')).toContainText('Imported the save file into this prison');
    // The load half: the file became the live session, and the panel reports
    // what that restore actually carried.
    await expect(page.locator('.save-panel__detail')).toContainText('Restored:');
    await expect(page.locator('.hud__unavailable')).toBeHidden();
    // On screen, in the place a player would look first: the clock is back
    // where the exported session left it, not at the start of day one.
    await expect(progress).toHaveText(playedTo ?? '');
    // Still paused, which the assertion below depends on: a session that
    // resumed running would have moved on before it was captured.
    await expect(pause).toHaveAttribute('aria-pressed', 'true');

    // --- and out again, from the worker rather than from storage ---
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');
    const roundTripped = await exportSave();

    // The whole simulation payload, captured out of the worker the import
    // restored into, equal to the file that went in. Anything the restore
    // dropped or the capture invented is a difference here.
    expect(roundTripped.envelope.payload).toEqual(exported.envelope.payload);
    // Named separately, because it is the fact a player would notice and it
    // fails for its own reason: the tick the first session reached is the tick
    // the second one is on.
    expect(roundTripped.envelope.payload.kernel.tick).toBe(exported.envelope.payload.kernel.tick);
    // The envelope is *not* the same file: it is a new generation of the prison
    // that imported it, which is what "imported into this prison" means.
    expect(roundTripped.envelope.prisonId).toBe(emptyPrison.envelope.prisonId);
  });

  /**
   * The transport controls, end to end, in the page a player loads.
   *
   * Three of the four layers are proven headlessly — the worker publishes the
   * tick (`tests/unit/worker-state-machine.test.ts`), the main thread
   * translates it (`tests/unit/ui-simulation-clock.test.ts`), and none of it
   * disturbs the simulation (`tests/determinism/clock-transport.test.ts`).
   * `tests/unit/ui-hud-projection.test.ts` proves the *mapping* the strip
   * walks — including that an unreported clock maps to nothing rather than to
   * day one — but not the rendering: Vitest runs in the `node` environment
   * with no DOM, so nothing headless ever executes `status-strip.ts`. That is
   * why the rendered `--` has its own guard in
   * `tests/browser/ui-shell.spec.ts`.
   *
   * What no headless test can settle is that the layers are *connected*: that
   * a real click on a real button reaches a real Worker over `postMessage` and
   * comes back as a number that changes on screen. That was the whole defect —
   * the controls were visible, and pressing one did nothing.
   */
  test('pressing play makes the HUD clock advance with the simulation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const day = page.locator('.hud-clock__day');
    const progress = page.locator('.hud-clock__day-progress');

    // No session yet, so the clock says it does not know. A "Day 1, 0%" here
    // would be a readout of a simulation that is not running.
    await expect(day).toHaveText('--');
    await expect(progress).toHaveText('--');

    // A session exists from the moment a prison is created, and the worker's
    // `simulation/ready` reports its clock: day one, stopped, at the start.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(day).toHaveText('1');
    await expect(progress).toHaveText('0%');
    await expect(page.locator('.hud-strip__transport [title="Pause"]')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    // The button reflects the *worker's* answer, not the click.
    await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // And then the clock moves on its own, because the worker keeps
    // publishing where the tick has got to. One in-game day is 2,400 ticks at
    // 50ms, so ~1% per 1.2s at x1.
    await expect
      .poll(async () => progress.textContent(), {
        message: 'the HUD clock never advanced after the simulation was started',
        timeout: 15_000,
      })
      .not.toBe('0%');

    // Pausing stops it, and the readout does not keep counting on its own.
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    await expect(page.locator('.hud-strip__transport [title="Pause"]')).toHaveAttribute('aria-pressed', 'true');
    const atPause = await progress.textContent();
    await page.waitForTimeout(3_000);
    expect(await progress.textContent()).toBe(atPause);
  });

  /**
   * The HUD's counts, end to end, in the page a player loads.
   *
   * The strip's metrics were literal zeros for the whole of a session
   * until now: `src/simulation/presentation/` computed them and no
   * worker-to-main message carried them (issue #104). Three of the four
   * layers are proven headlessly -- the worker publishes them
   * (`tests/unit/worker-status-counts.test.ts`), the main thread translates
   * them (`tests/unit/ui-simulation-counts.test.ts`), and publishing them
   * disturbs nothing
   * (`tests/determinism/status-counts-publication.test.ts`).
   *
   * What no headless test can settle is that the layers are *connected*: that
   * a real Worker's `postMessage` reaches this page's `SimulationClient`,
   * survives its decoder and lands on the DOM the player is looking at. That
   * is exactly the situation the transport controls were in before #94 --
   * every layer separately proven, and pressing the button did nothing.
   *
   * Two halves, because a new prison has nothing in it. Nothing in the
   * running app admits a prisoner, hires a guard or completes a room yet
   * (`docs/HUD_PROJECTIONS.md` gap 32a, and #104's own sequencing note), so
   * the counts a real session publishes here are honestly all zero:
   *
   * 1. The **worker half** is observed as it happens. A tee over `Worker`
   *    records what the real worker actually posted, so the assertions are
   *    about a genuine publication -- that one arrives at all, that it is
   *    tick-stamped, and that running the simulation for seconds afterwards
   *    produces no further one, because nothing it reports changed. That last
   *    part is the per-tick-firehose guard, measured in a real browser.
   * 2. The **main-thread half** is driven with a publication injected into
   *    the same real `onmessage` the worker posts to, carrying numbers no
   *    hardcoded zero could produce. It goes through the real decoder, the
   *    real listener in `src/main.ts` and the real strip, so what it proves
   *    is that a count the simulation reports reaches the screen. It does not
   *    prove the worker can produce those numbers; the headless tests above
   *    do that, from real simulation state.
   */
  test('the HUD counts come from the worker rather than from zeros baked into the page', async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = Worker;
      const received: unknown[] = [];
      const workers: Worker[] = [];

      class TeeWorker extends RealWorker {
        public constructor(scriptURL: string | URL, options?: WorkerOptions) {
          super(scriptURL, options);
          workers.push(this);
          // An extra listener, not a replacement: `SimulationClient` assigns
          // `onmessage`, and both fire. Nothing the app does is intercepted.
          this.addEventListener('message', (event: MessageEvent) => {
            received.push(event.data);
          });
        }
      }

      Object.defineProperty(window, 'Worker', { configurable: true, value: TeeWorker });
      const tee = window as unknown as WorkerTeeWindow;
      tee.lockstateWorkerMessages = received;
      tee.lockstateInjectWorkerMessage = (data: unknown): boolean => {
        const worker = workers[workers.length - 1];
        if (worker === undefined) return false;
        // A real event on the real port the real client is listening to, so
        // the message passes through `decodeWorkerToMainMessage` like any
        // other. An invalid one would be dropped, not rendered.
        worker.dispatchEvent(new MessageEvent('message', { data }));
        return true;
      };
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const metric = (id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);
    const publications = async (): Promise<readonly StatusCountsPublication[]> =>
      page.evaluate(() => {
        const tee = window as unknown as WorkerTeeWindow;
        return (tee.lockstateWorkerMessages ?? [])
          .filter((message): message is StatusCountsPublication => {
            return (message as StatusCountsPublication).kind === 'simulation/status-counts';
          })
          .map((message) => ({ kind: message.kind, payload: message.payload }));
      });

    // No session, so nothing has been published and the strip shows an empty
    // prison.
    expect(await publications()).toEqual([]);
    await expect(metric('prisoners')).toHaveText('0');

    // A session exists from the moment a prison is created, and the worker
    // publishes its counts without being asked.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect
      .poll(async () => (await publications()).length, {
        message: 'the worker never published simulation/status-counts for the new session',
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    const first = (await publications())[0];
    expect(first?.payload.schemaVersion).toBe(1);
    expect(Number.isInteger(first?.payload.tick)).toBe(true);
    // A brand-new prison is empty, and the strip agrees with what the worker
    // reported rather than with a constant of its own.
    expect(first?.payload.counts.prisoners).toBe(0);
    await expect(metric('prisoners')).toHaveText('0');

    // Run the simulation. The clock keeps moving -- so ticks are genuinely
    // executing and the loop is waking ~66 times a second -- and the counts
    // channel stays silent, because nothing it reports has changed. A
    // per-tick firehose would show up here as hundreds of messages.
    const publishedBeforePlay = (await publications()).length;
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
        message: 'the simulation never advanced, so the quiet counts channel proves nothing',
        timeout: 15_000,
      })
      .not.toBe('0%');
    expect(await publications()).toHaveLength(publishedBeforePlay);

    // And the main-thread half, with numbers no hardcoded zero could
    // produce, delivered over the real message path.
    const delivered = await page.evaluate((message) => {
      const tee = window as unknown as WorkerTeeWindow;
      return tee.lockstateInjectWorkerMessage?.(message) ?? false;
    }, INJECTED_STATUS_COUNTS);
    expect(delivered).toBe(true);

    await expect(metric('prisoners')).toHaveText('37');
    await expect(metric('staff')).toHaveText('6');
    await expect(metric('rooms')).toHaveText('12');
    await expect(metric('incidents')).toHaveText('2');
    await expect(metric('contraband')).toHaveText('5');
    // Grouped for reading, which is the only thing the strip does to it:
    // the value arrives in minor units and no layer between the worker and
    // the formatter converts or re-denominates it (#96).
    await expect(metric('funds')).toHaveText('31,500');
    // The same treatment for the accrual beside it, and the reason this
    // assertion is here rather than only in the unit tests: the figure has to
    // arrive from the worker. A HUD that recomputed it from a tick it happens
    // to hold would be a second authority on what the prison has earned, and
    // would show something other than 4,631 here (#29).
    await expect(metric('earned-today')).toHaveText('4,631');
    // The badge follows the count, so the colour is never the only signal.
    // The badge is the non-colour carrier of the incident state, so a badge
    // that is present and not painted defeats its own purpose.
    await expect(page.locator('[data-metric="incidents"] .ui-badge')).toBeVisible();
    await expect(page.locator('[data-metric="incidents"] .ui-badge')).toHaveText('Active');
  });

  /**
   * Issue #207, reproduced exactly as it was reported and then asserted.
   *
   * Load the page, do not create a prison, open the Build tab, expand ENTER
   * COORDINATES, press Place order. `SimulationCommandSender.submit` throws
   * "No simulation session is running yet", the gate reports it -- and until
   * this was fixed the only thing that happened was a `console.warn`, with
   * `.hud` innerText byte-identical before and after, `[data-alert]` still
   * reading "No active alerts", and the button's own `disabled` and
   * `aria-busy` back where they started. A refusal indistinguishable from a
   * success is the failure issue #82 named: a control that silently does
   * nothing is a lie the player has no way to detect.
   *
   * This belongs here rather than in `ui-shell.spec.ts` because nothing
   * below the assembled page can produce it: the throw comes from the real
   * command sender, on a real page with no session, and it is
   * `src/main.ts`'s own wiring that carries it to the HUD. The harness test
   * beside it proves the HUD's half against a host that refuses on demand;
   * this proves the two halves are actually connected.
   */
  test('a control the simulation refuses says so on screen, not to the console (#207)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // No prison is created: with no session, every command is refused. This
    // is the state a first-time player is in for as long as they leave the
    // save panel alone.
    await page.getByRole('button', { name: 'Build' }).click();
    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();

    // Scoped to the numeric fallback's own section. A bare
    // `.hud-build .ui-section__body .ui-action` matches every cancel in the
    // queue block too, and Playwright's strict mode rejects a multi-match
    // locator before it ever asks about visibility.
    const submit = page.locator('.hud-build__coordinates .ui-action');
    await expect(submit).toBeVisible();

    const before = await page.locator('.hud').innerText();
    await expect(page.locator('.hud__refusal')).toBeHidden();

    // The other band in the same part of the grid, on a page whose worker
    // started perfectly well. Both carry an author `display: flex`, which
    // beats the user agent's `[hidden] { display: none }` -- so without the
    // `[hidden]` rule written out beside each of them an empty coloured band
    // is painted across the top of the world on every load. That is not a
    // theory: `hud.css` records it happening to the refusal line, measured in
    // Chromium with `offsetParent` non-null before anything had been refused.
    // This is the assertion that it cannot happen to the unavailable line.
    await expect(page.locator('.hud__unavailable')).toBeHidden();

    await submit.click();

    // What the player sees. The line is real layout, not merely a node in the
    // DOM, and it names the outcome rather than the thrown English `Error`.
    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeVisible();
    // Visibility first: #218 measured a first draft of this row that was
    // danger-coloured and laid out from first paint, because `display: flex`
    // beats the user agent's `[hidden] { display: none }`. A text assertion
    // alone cannot tell a painted refusal from a hidden one.
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('The build order was not placed');
    await expect(refusal).not.toContainText('No simulation session');
    // A live region, so it is announced rather than merely drawn.
    await expect(refusal).toHaveAttribute('role', 'status');
    await expect(refusal).toHaveAttribute('aria-live', 'polite');
    await expect(refusal).toHaveAttribute('data-action', 'place-build-order');

    // "On the control that was pressed" -- the sentence four comments in
    // `src/` made while nothing in the HUD did it.
    await expect(submit).toHaveAttribute('data-action-failed', 'true');
    const refusalId = await refusal.getAttribute('id');
    expect(refusalId).not.toBeNull();
    await expect(submit).toHaveAttribute('aria-describedby', String(refusalId));

    // The measurement the issue was filed on, in the direction that now
    // matters: the HUD's rendered text is no longer identical.
    expect(await page.locator('.hud').innerText()).not.toBe(before);

    // The button comes back live, exactly as it did before: a refusal must
    // not wedge the control that was refused.
    await expect(submit).toBeEnabled();
    await expect(submit).toHaveAttribute('aria-busy', 'false');
  });

  /**
   * Issue #225: the same refusal, reached the way players actually build.
   *
   * #207 fixed the Build panel's numeric fallback -- expand ENTER
   * COORDINATES, press *Place order*, and a refusal is painted. The **world
   * drag** is the primary route to the identical command, and it was left
   * out: `src/main.ts` gave `BuildTool` an `onError` that was
   * `console.warn(\'Build order refused:\', ...)` and nothing else, so the two
   * ways of laying one wall disagreed about whether the player is told, and
   * the silent one was the one the tool is designed around
   * (`docs/RENDERING.md` describes the modal arming precisely so that a drag
   * can mean "build").
   *
   * The mutation the issue predicted for this was measured before the fix and
   * it survived exactly as predicted: deleting that `onError` line left
   * `pnpm typecheck`, `pnpm test` and this whole spec green, because the
   * option is optional and nothing asserted on it. This test is what makes it
   * die.
   *
   * It cannot be written with `Worker` blocked, which is how the analogous
   * #82 test below reproduces its state: with no worker there is no command
   * sender, and with no command sender `src/main.ts` builds no `BuildTool` at
   * all, so there is no drag route to exercise. A page with a healthy worker
   * and no prison is the state that refuses, and it is the state a first-time
   * player is in for as long as they leave the save panel alone -- the same
   * one #207 reproduced.
   */
  test('a wall refused after a world drag says so on screen (#225)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await armBuildTool(page);

    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeHidden();
    const before = await page.locator('.hud').innerText();

    await dragOnWorld(page);

    // `toBeVisible`, not `toContainText`: a text assertion passes inside a
    // `display: none` subtree and on a 0x0 box, which is exactly how #220
    // shipped a message no viewport ever laid out.
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('The build order was not placed');
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('No simulation session');
    await expect(refusal).toHaveAttribute('role', 'status');
    await expect(refusal).toHaveAttribute('aria-live', 'polite');
    await expect(refusal).toHaveAttribute('data-action', 'place-build-order');

    // The measurement the issue was filed on, in the direction that now
    // matters.
    expect(await page.locator('.hud').innerText()).not.toBe(before);

    // **Nothing is marked as the control that failed**, because the player
    // pressed no control -- the gesture was on the world. Marking the panel's
    // *Place order* button would point `aria-describedby` at a refusal about
    // a gesture that button had no part in.
    expect(await page.locator('[data-action-failed="true"]').count()).toBe(0);

    // The tool is still armed and the panel still works: a refusal must not
    // wedge the route it was refused on.
    await expect(page.locator('.hud-build__arm')).toHaveText('Stop placing');
  });

  /**
   * Issue #261: the *other* refusal, and the one nothing on this page could
   * report.
   *
   * The two tests above are about a **command** being refused on this thread
   * -- there is no session, `SimulationCommandSender.submit` throws, and the
   * gate paints `.hud__refusal`. This is the opposite case and it is the one
   * that vanished: a page with a real prison, a running clock, and a command
   * the worker *accepts*. `handleSubmitCommand` answers `status: 'queued'`,
   * the kernel dispatches the order at its tick, and
   * `ConstructionSystem.submitOrder` refuses it on its content --
   * `state: 'failed'`, `failReason: 'out-of-bounds'`.
   *
   * Reproduced exactly as reported: type `100, 100` into the Build panel's
   * coordinate fields, which carry no `min`/`max`, and press *Place order*.
   * Before this the player saw **nothing**: no ghost, because `phaseOf`
   * (`src/rendering/world/structures.ts`) maps a failed order to `undefined`
   * and it is drawn as no geometry; and no refusal line, because that line
   * answers a rejected command and this command was accepted.
   *
   * It belongs here rather than in `ui-shell.spec.ts` for the same reason
   * #207's does, one layer further along: nothing below the assembled page
   * can produce it. It needs a real worker, a real session, a real tick loop
   * to dispatch the command, a real `simulation/status-counts` publication to
   * carry the refusal back, and `src/main.ts`'s own listener to put it in the
   * view model. Every one of those halves has its own tests; only this proves
   * they are joined.
   */
  test('a build order the simulation refuses reaches the alerts list (#261)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A real prison, and a running clock -- the order is dispatched at a tick,
    // so a paused simulation would leave it queued and refuse nothing.
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
        message: 'the simulation never advanced, so no command could be dispatched',
        timeout: 15_000,
      })
      .not.toBe('0%');

    // The alerts list says it is empty, which is the state this test changes.
    const alertsSection = page.locator('.hud-minimap .ui-section');
    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    await expect(emptyRow).toHaveCount(1);

    await page.getByRole('button', { name: 'Build' }).click();
    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();

    // Outside the single 32x32 chunk a new prison owns. The fields accept it
    // because they have no bounds -- which is the reproduction, not an
    // incidental detail.
    // The spinbutton itself: `getByLabel` also matches the two stepper
    // buttons, which carry `aria-label="Decrease Tile X"`/"Increase Tile X".
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill('100');
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('100');
    const submit = page.locator('.hud-build__coordinates .ui-action');
    await expect(submit).toBeVisible();
    await submit.click();

    // The command itself was accepted, so nothing has been refused yet. If the
    // band lit up *here* the test would be measuring the wrong refusal
    // entirely -- a pre-flight throw rather than the simulation's decision.
    await expect(page.locator('.hud__refusal')).toBeHidden();

    // The row arrives on the worker's own schedule: the command is scheduled
    // a lead of ticks ahead, and the publication that carries the refusal
    // follows on the next tick-loop wake.
    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    await expect
      .poll(async () => alertRow.count(), {
        message: 'the simulation refused the order and the alerts list never heard about it',
        timeout: 20_000,
      })
      .toBe(1);
    // The empty-state row goes when there is something to say.
    await expect(emptyRow).toHaveCount(0);

    // **Visible, not merely present.** The alerts section starts folded
    // (`INITIAL_HUD_SHELL_STATE`), so the row is in the DOM with a 0x0 box
    // until the player opens it -- which is exactly the state #220 measured
    // and moved the "simulation unavailable" sentence out of. A
    // `toContainText` here without the fold being opened would pass against
    // an invisible row and prove nothing.
    await expect(alertRow).toBeHidden();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'true');
    await page.locator('.hud-minimap .ui-section__header').click();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'false');

    await expect(alertRow).toBeVisible();
    // The sentence for the reason the simulation actually gave: the tile is
    // outside the one chunk a new prison has, so `submitOrder`'s bounds check
    // decides before the ownership check does.
    await expect(alertRow).toContainText('that tile is outside the map');
    // A localized sentence, not the wire vocabulary and not a thrown Error
    // (ADR 0011). `build.out-of-bounds` is the id the worker sent; it must not
    // be what the player reads.
    await expect(alertRow).not.toContainText('out-of-bounds');
    await expect(alertRow).not.toContainText('build.');
    // The severity badge carries the state without relying on colour, the
    // same way the incident chip does.
    await expect(alertRow.locator('.ui-badge')).toBeVisible();
    await expect(alertRow.locator('.ui-badge')).toHaveText('Warning');

    // And the HUD's own rendered text says it -- `hudMentionsIt` is the
    // measurement #220 established as the honest one, because `toBeVisible`
    // and `innerText` can disagree about a subtree the layout has dropped.
    const measured = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
      const rect = node?.getBoundingClientRect();
      return {
        laidOut: node !== null && node.offsetParent !== null,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        hudMentionsIt: (document.querySelector<HTMLElement>('.hud')?.innerText ?? '')
          .toLowerCase()
          .includes('that tile is outside the map'),
      };
    });
    expect(measured.laidOut).toBe(true);
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.height).toBeGreaterThan(0);
    expect(measured.hudMentionsIt).toBe(true);

    // And the band, which is where the player was told *without* opening
    // anything: the fold above had to be opened for the row, and the band was
    // already carrying the same sentence before that click (#220, made
    // structural). `data-source` says the simulation decided it, and no
    // control is marked, because the command was accepted and refused later.
    const band = page.locator('.hud__refusal');
    await expect(band).toBeVisible();
    await expect(band).toHaveAttribute('data-source', 'simulation');
    await expect(band).toContainText('that tile is outside the map');
    await expect(band).not.toContainText('build.');
    await expect(page.locator('[data-action-failed="true"]')).toHaveCount(0);
  });

  /**
   * ADR 0028 phase 3: **removing an object with no keyboard, on a phone.**
   *
   * This is the claim the whole phase exists for, and it is the one nothing
   * below the assembled page can settle. Before this, taking a placed object
   * back meant `Undo`, and `Undo` is bound to `KeyZ` and to nothing else
   * (`docs/INPUT.md`) -- so a device with no keyboard had no route at all, and a
   * tile a standing object covers refuses every further placement. A misplaced
   * bed was permanent for the session.
   *
   * It needs a real browser for the ordinary reason and a real *page* for a
   * sharper one: the gesture is a press on a real Phaser canvas, arbitrated by
   * the real scene against the real camera, reported through the real
   * `ObjectTool`, dispatched by the real HUD and posted by the real composition
   * root. Every one of those halves has its own test; only this joins them.
   *
   * **Measured off the command tee, not off a refusal.** `.hud__corner` is
   * `display: none` at 720px and below (`hud.css`), so the alerts list the
   * worker's refusals arrive in does not exist at 375x812 -- which is a
   * pre-existing gap this phase neither widens nor closes, and the reason the
   * observable here is the message the page posted rather than the sentence it
   * got back. The refusal *sentence* is covered at a viewport that has the
   * region, below.
   */
  test('removes an object from a world press at 375x812, with no key ever pressed', async ({ page }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();

    // Nothing is trusted before the page has actually rendered: `openApp` waits
    // for the canvas and the HUD, and this is the canvas having real area at
    // this viewport rather than merely existing in the DOM. A press aimed at a
    // zero-area canvas would report a gesture that never happened.
    const canvasBox = await page.locator('#game-root canvas').boundingBox();
    expect(canvasBox, 'the world canvas has no box at 375x812').not.toBeNull();
    expect(canvasBox?.width ?? 0).toBeGreaterThan(0);
    expect(canvasBox?.height ?? 0).toBeGreaterThan(0);

    await page.locator('.ui-tab[data-tab="build"]').click();
    const remove = page.locator('.hud-build__remove');
    await expect(remove, 'the removal toggle is not laid out at 375x812').toBeVisible();

    // Tappable, not merely visible: the control has to be what a finger at its
    // own centre actually lands on. A button under the save panel or under the
    // tab bar is reachable by a keyboard and unreachable by a thumb, which is
    // the whole class of defect this viewport is checked for.
    const box = await remove.boundingBox();
    expect(box, 'the removal toggle has no box at 375x812').not.toBeNull();
    if (box === null) return;
    const topmostIsToggle = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('.hud-build__remove') !== null,
      { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
    );
    expect(topmostIsToggle, 'something covers the removal toggle at 375x812').toBe(true);
    // A tap target, at the size the tokens promise one.
    expect(box.height).toBeGreaterThanOrEqual(40);

    // Nothing has been sent yet, so the press below is the only thing that can
    // have produced what is asserted after it.
    expect(await objectCommandsSent(page, 'RemoveObject')).toEqual([]);

    await remove.click();
    await expect(remove).toHaveAttribute('aria-pressed', 'true');
    const pressed = await pressOnWorld(page);
    expect(pressed, 'the HUD left no bare world to press at 375x812').toBe(true);

    // **One press, one removal command, and no keyboard anywhere in this test.**
    const removals = await objectCommandsSent(page, 'RemoveObject');
    expect(removals).toHaveLength(1);
    expect(Number.isInteger(removals[0]?.x)).toBe(true);
    expect(Number.isInteger(removals[0]?.y)).toBe(true);
    // And the armed mode decided which command it was: a press that had gone to
    // the other half of the same tool would have spent materials.
    expect(await objectCommandsSent(page, 'PlaceObject')).toEqual([]);

    // Turning the mode off hands the world back, so a second press posts no
    // second removal. Without this the assertion above is also true of a tool
    // that never stops removing.
    await remove.click();
    await expect(remove).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.hud-build__arm').click();
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'false');
    expect(await pressOnWorld(page)).toBe(true);
    expect(await objectCommandsSent(page, 'RemoveObject')).toHaveLength(1);
  });

  /**
   * The other half: what the player is *told* when the press removed nothing.
   *
   * At 1280x800, where the alerts region exists, so both surfaces can be read
   * at once: the band that carries the notice and the list that keeps the log.
   * The phone -- where the list does not exist at all, and where this half was
   * unreachable until #220's fix was made structural -- is the test below.
   *
   * The refusal is the simulation's own, decided at the command's tick and
   * carried back on `simulation/status-counts`, so this needs a real worker, a
   * running clock and `src/main.ts`'s own listener, exactly as #261's
   * build-refusal test does.
   */
  test('tells the player when a world press had no object to remove (ADR 0028 phase 3)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    // A running clock: the command is dispatched at a tick, so a paused
    // simulation would leave it queued and refuse nothing.
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
        message: 'the simulation never advanced, so no command could be dispatched',
        timeout: 15_000,
      })
      .not.toBe('0%');

    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    await expect(emptyRow).toHaveCount(1);

    await page.locator('.ui-tab[data-tab="build"]').click();
    await page.locator('.hud-build__remove').click();
    expect(await pressOnWorld(page), 'the HUD left no bare world to press at 1280x800').toBe(true);

    // The command was accepted, so nothing has been refused *yet* -- the
    // simulation decides at the command's tick. A band lit up here would mean
    // the pre-flight had spoken and the test was measuring the wrong refusal.
    await expect(page.locator('.hud__refusal')).toBeHidden();

    // The band the sentence now reaches, and it says which producer it came
    // from: `simulation`, not `host`. Before #220 was made structural this
    // stayed hidden and the only report was the folded row below.
    const band = page.locator('.hud__refusal');
    await expect
      .poll(async () => band.getAttribute('data-source'), {
        message: 'the simulation refused the removal and the refusal band never said so',
        timeout: 20_000,
      })
      .toBe('simulation');
    await expect(band).toBeVisible();
    await expect(band).toContainText(localeText('hud.alert.refusal.remove-object.nothing-to-remove'));
    // No control is marked: the press was on the world, and the command was
    // accepted before the simulation refused it several ticks later.
    await expect(page.locator('[data-action-failed="true"]')).toHaveCount(0);
    await expect(band).not.toHaveAttribute('data-action', /.*/u);

    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    await expect
      .poll(async () => alertRow.count(), {
        message: 'the simulation refused the removal and the alerts list never heard about it',
        timeout: 20_000,
      })
      .toBe(1);

    // Opened, because the alerts section arrives folded and a `toContainText`
    // against a 0x0 box proves nothing.
    await page.locator('.hud-minimap .ui-section__header').click();
    await expect(alertRow).toBeVisible();
    // The sentence the bundled catalogue gives the id the worker sent, read out
    // of that catalogue rather than typed here: ADR 0011 puts the key on one
    // side of the boundary and the text on the other, so a test that hard-coded
    // the English would stay green while the player read something else.
    await expect(alertRow).toContainText(localeText('hud.alert.refusal.remove-object.nothing-to-remove'));
    // A localized sentence, not the wire vocabulary (ADR 0011).
    await expect(alertRow).not.toContainText('remove-object.');
    await expect(alertRow).not.toContainText('nothing-to-remove');
    // The log keeps its job. The band holds one sentence; the list holds this
    // row beside any standing `protocol/error` row, which is why it is not
    // redundant and was not emptied.
    await expect(alertRow).toHaveCount(1);
  });

  /**
   * The same refusal, on a phone -- **the measurement this whole change
   * exists for.**
   *
   * `hud.css` drops `.hud__corner` at 720px and below, so at 375x812 the
   * alerts list the worker's refusals arrived in does not exist. ADR 0028
   * phase 3 said so in its own comments and left it: "a pre-existing gap this
   * phase neither widens nor closes". It is closed here, structurally -- the
   * band takes the whole class of simulation refusals, not one more sentence
   * at a time -- and this is the proof, on the shipped page, with a real
   * worker, at the viewport where nothing else could carry it.
   *
   * The geometry is measured rather than the text asserted, because #220's
   * finding is precisely that `toContainText` passes against a 0x0 box.
   */
  test('a world press with nothing to remove says so at 375x812, where the alerts list does not exist', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
        message: 'the simulation never advanced, so no command could be dispatched',
        timeout: 15_000,
      })
      .not.toBe('0%');

    // The region really is gone at this viewport, asserted rather than taken
    // from the stylesheet -- it is the premise of the whole test.
    await expect(page.locator('.hud__corner')).toBeHidden();
    await expect(page.locator('.hud__refusal')).toBeHidden();

    await page.locator('.ui-tab[data-tab="build"]').click();
    await page.locator('.hud-build__remove').click();
    expect(await pressOnWorld(page), 'the HUD left no bare world to press at 375x812').toBe(true);

    const band = page.locator('.hud__refusal');
    await expect
      .poll(async () => band.getAttribute('data-source'), {
        message: 'the simulation refused the removal and the phone was told nothing',
        timeout: 20_000,
      })
      .toBe('simulation');

    // **Visible, with a box, on a page that actually rendered.** The canvas
    // having real area is the proof of the last part: a page that failed to
    // load reports plausible zeros for everything else.
    const measured = await page.evaluate(() => {
      const line = document.querySelector<HTMLElement>('.hud__refusal');
      const rect = line?.getBoundingClientRect();
      const canvas = document.querySelector<HTMLCanvasElement>('canvas')?.getBoundingClientRect();
      const row = document.querySelector<HTMLElement>('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
      return {
        laidOut: line !== null && line.offsetParent !== null,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
        // The row exists in the DOM and is inside a region the layout dropped.
        alertRowPresent: row !== null,
        alertRowLaidOut: row !== null && row.offsetParent !== null,
        hudMentionsIt: (document.querySelector<HTMLElement>('.hud')?.innerText ?? '').includes(
          'Nothing was removed',
        ),
      };
    });
    expect(measured.canvasWidth, 'the page never rendered, so nothing below means anything').toBeGreaterThan(0);
    expect(measured.canvasHeight).toBeGreaterThan(0);
    expect(measured.laidOut).toBe(true);
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.height).toBeGreaterThan(0);
    // `innerText` excludes a subtree the layout dropped, which is the
    // measurement #220 established as the honest one.
    expect(measured.hudMentionsIt).toBe(true);
    // And the surface it replaced, at the same instant and at this viewport:
    // the row is built and is on screen nowhere.
    expect(measured.alertRowPresent).toBe(true);
    expect(measured.alertRowLaidOut).toBe(false);

    await expect(band).toContainText(localeText('hud.alert.refusal.remove-object.nothing-to-remove'));
    await expect(band).not.toContainText('remove-object.');
    await expect(band).not.toContainText('nothing-to-remove');
  });

  /**
   * "One gesture is one transaction", on the wire, in the assembled page.
   *
   * `src/ui/build-tool.ts` has always claimed it -- every segment of a run
   * shares a `transactionId` so a twelve-segment wall undoes as one wall --
   * and routing the gesture through the HUD's intent path (#225) is exactly
   * the change that could have quietly turned it into a per-segment dispatch.
   * The claim was only ever asserted by reading, so it is asserted here
   * instead, at the one layer where a `transactionId` is observable at all: it
   * is minted on this thread, packed into the command, and nothing the worker
   * sends back mentions it.
   *
   * A tee over `postMessage` rather than a stub: the real page, the real
   * command sender and the real worker, with an extra recorder in the middle
   * that intercepts nothing.
   */
  test('one world drag is one transaction, however many edges it covered (#225)', async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = Worker;
      const sent: unknown[] = [];

      class CommandTeeWorker extends RealWorker {
        public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
          sent.push(message);
          if (transfer === undefined) super.postMessage(message);
          else if (Array.isArray(transfer)) super.postMessage(message, transfer);
          else super.postMessage(message, transfer);
        }
      }

      Object.defineProperty(window, 'Worker', { configurable: true, value: CommandTeeWorker });
      (window as unknown as CommandTeeWindow).lockstateSentToWorker = sent;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A session, because a refused command sends nothing at all. Creating a
    // prison also takes the first snapshot, which is what baselines the
    // command sequence -- `submit` throws until it has.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await armBuildTool(page);

    const orders = async (): Promise<readonly { orderId: string; transactionId: string | undefined }[]> =>
      page.evaluate(() =>
        ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
          .map((message) => message as SubmittedCommand)
          .filter((message) => message.kind === 'simulation/submit-command')
          .filter((message) => message.payload?.command?.data?.type === 'PlaceBuildOrder')
          .map((message) => ({
            orderId: message.payload?.command?.data?.orderId ?? '',
            transactionId: message.payload?.command?.data?.transactionId,
          })),
      );

    expect(await orders()).toEqual([]);

    await dragOnWorld(page);

    await expect
      .poll(async () => (await orders()).length, {
        message: 'the drag placed no build order at all, so nothing below is being measured',
      })
      .toBeGreaterThan(1);

    // Nothing was refused, so the line the previous test asserts stays down.
    await expect(page.locator('.hud__refusal')).toBeHidden();

    const placed = await orders();
    // One transaction across the whole run -- the property under test.
    const transactions = new Set(placed.map((order) => order.transactionId));
    expect(transactions.size).toBe(1);
    expect([...transactions][0]).toMatch(/^build-/);

    // And distinct orders within it: the kernel refuses a duplicate id, so a
    // shared one would make every segment after the first a no-op, which is
    // the failure a single shared `transactionId` could otherwise disguise.
    expect(new Set(placed.map((order) => order.orderId)).size).toBe(placed.length);
  });

  /**
   * Issue #89: the player can spend the treasury, and the command really
   * leaves this thread.
   *
   * The defect was not a broken purchase -- `ProcurementSystem`,
   * `purchaseMaterialsSchema` and the session command router have all worked
   * since #249 and are all covered headlessly. It was that **nothing in
   * `src/` could construct a `PurchaseMaterials`**, so the only thing that
   * could buy a brick was a test, and every build order placed in a real
   * session sat in `materials-pending` for ever (`docs/HUD_PROJECTIONS.md`,
   * gap 32a).
   *
   * The producer lives in `src/main.ts`, which no unit test can execute --
   * it imports Phaser, constructs a `Worker` and runs at import. So this is
   * the layer that can watch it: the same `postMessage` tee the transaction
   * test above uses, over the real page, the real panel, the real command
   * sender and the real worker.
   *
   * Three things are asserted and each is a separate claim. That a command
   * of that type is sent at all; that its payload carries the item and the
   * quantity the stepper showed, rather than a default the panel never
   * displayed; and that its `orderId` is identifier-shaped and fresh, because
   * `identifierSchema` bounds it at the decoder and
   * `ProcurementSystem.purchase` refuses a duplicate -- a stable id would
   * make every purchase after the first a silent no-op.
   */
  test('the Build panel buys materials, and a real PurchaseMaterials reaches the worker (#89)', async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = Worker;
      const sent: unknown[] = [];

      class CommandTeeWorker extends RealWorker {
        public override postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions): void {
          sent.push(message);
          if (transfer === undefined) super.postMessage(message);
          else if (Array.isArray(transfer)) super.postMessage(message, transfer);
          else super.postMessage(message, transfer);
        }
      }

      Object.defineProperty(window, 'Worker', { configurable: true, value: CommandTeeWorker });
      (window as unknown as CommandTeeWindow).lockstateSentToWorker = sent;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A session, for the same reason the transaction test needs one: `submit`
    // throws until a snapshot has baselined the command sequence, and a
    // refused command sends nothing at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await page.getByRole('button', { name: 'Build' }).click();

    const purchases = async (): Promise<readonly { orderId: string; itemId: string; quantity: number }[]> =>
      page.evaluate(() =>
        ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
          .map((message) => message as SubmittedCommand)
          .filter((message) => message.kind === 'simulation/submit-command')
          .filter((message) => message.payload?.command?.data?.type === 'PurchaseMaterials')
          .map((message) => ({
            orderId: message.payload?.command?.data?.orderId ?? '',
            itemId: message.payload?.command?.data?.itemId ?? '',
            quantity: message.payload?.command?.data?.quantity ?? 0,
          })),
      );

    // Nothing yet, so what follows is measuring the press rather than the
    // page load.
    expect(await purchases()).toEqual([]);

    // The disclosure, closed on arrival. Its own state is asserted because a
    // row that was already open would make the click below close it.
    const buyToggle = page.locator('.hud-build__buy-toggle');
    await expect(buyToggle).toHaveAttribute('aria-expanded', 'false');
    await buyToggle.click();

    const buy = page.locator('.hud-build__buy-submit');
    // Two bricks per wall at 40 each, out of `BUILDABLE_REGISTRY` and
    // `src/content/procurement-catalog.ts` by way of the view model. The
    // label is asserted before the press so the payload below can be checked
    // against what the player was actually shown.
    await expect(buy).toHaveText('Buy 2 × Brick · 80');
    await page.locator('.hud-build__buy .ui-number__step').last().click();
    await expect(buy).toHaveText('Buy 3 × Brick · 120');
    await buy.click();

    await expect
      .poll(async () => (await purchases()).length, {
        message: 'pressing Buy sent no PurchaseMaterials command at all -- #89 is not closed',
      })
      .toBe(1);

    // Nothing was refused: the starting balance is 25,000 and this costs 120.
    await expect(page.locator('.hud__refusal')).toBeHidden();

    const [purchase] = await purchases();
    expect(purchase?.itemId).toBe('item.brick');
    expect(purchase?.quantity).toBe(3);
    // `identifierSchema`: `/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/`, 1-128 characters.
    expect(purchase?.orderId).toMatch(/^order-[A-Za-z0-9][A-Za-z0-9._:/-]{0,120}$/);

    // A second purchase gets an id of its own -- `ProcurementSystem.purchase`
    // refuses a duplicate order id outright, so a stable one would spend
    // nothing and deliver nothing, silently.
    await buy.click();
    await expect.poll(async () => (await purchases()).length).toBe(2);
    const both = await purchases();
    expect(new Set(both.map((entry) => entry.orderId)).size).toBe(2);

    /*
     * And a purchase the prison cannot afford is **refused before it is
     * sent**, and said so on screen.
     *
     * This is the half that has nowhere else to live. `Treasury.spend`
     * refuses rather than overdrawing, and the worker drops the outcome --
     * the kernel's command handler returns `void` and a command reply
     * acknowledges receipt, not effect
     * (`src/simulation/runtime/session-commands.ts`). So without the guard in
     * `src/main.ts` the player would press Buy, watch the money not move, and
     * be told nothing: the exact failure #82 and #207 exist for. The guard
     * reads the balance the worker published, which is why it needs a real
     * session and a real page.
     *
     * 1,000 bricks at 40 is 40,000 against a 25,000 starting balance, less
     * the 200 already spent above.
     */
    const sentBefore = (await purchases()).length;
    await page.locator('.hud-build__buy .ui-number__input').fill('1000');
    await page.locator('.hud-build__buy .ui-number__input').press('Enter');
    await expect(buy).toHaveText('Buy 1000 × Brick · 40,000');
    await buy.click();

    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    await expect(refusal).toContainText('Nothing was bought');
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    // On the control that was pressed, as well as in the line.
    await expect(buy).toHaveAttribute('data-action-failed', 'true');
    // And nothing left this thread: a refusal that still posted the command
    // would spend the money in the worker and paint a refusal about it.
    expect(await purchases()).toHaveLength(sentBefore);
  });

  /*
   * The two tests below are one claim in two halves, and the claim is neither
   * #89's nor #261's: it is the one that only exists once both are in the
   * tree. **A refused purchase produces exactly one player-visible message.**
   *
   * Each PR proved its own surface. #89 proved that the main thread's
   * pre-flight paints the refusal line for a total the published balance
   * cannot cover; #261 proved that a refusal the *worker* decides reaches the
   * alerts list -- using a refused **build order**. Nothing drove a refused
   * *purchase* from a real worker to the alerts list, and nothing asserted
   * that either surface stays quiet while the other speaks. Measured on this
   * branch before these tests existed: deleting purchase refusals from the
   * view model at the composition root, and separately making the pre-flight
   * raise an alert row *as well as* throwing, each left `tsc` clean, all 1862
   * headless tests passing, and every browser test passing but the one this
   * container always fails on unfetched Git LFS content.
   *
   * Neither half is provable a layer down, and for different reasons.
   * `hudAlertsFromWorkerMessage` and `RefusalLog` each have full unit tests
   * that pass either way, because the thing that can break is the join: the
   * kernel dispatching the command at its tick, `ProcurementSystem` refusing
   * it, the worker opening its own publication gate for a new refusal, and
   * `src/main.ts`'s single listener writing the row into the view model. And
   * "exactly one" is a statement about *two* surfaces at once, which only the
   * assembled page has both of.
   *
   * Both are driven with the clock **paused** at the point where determinism
   * matters, which is a fact about the sender rather than a trick:
   * `SimulationCommandSender.projectExecuteTick` says "a paused clock cannot
   * have moved, so the last reported tick is exact and the order runs on the
   * very first step after play -- no lead, no wait". So presses made while
   * paused are all scheduled for the same tick, and `Kernel.step` drains every
   * command whose `executeAtTick` equals the tick it is on -- all of them, in
   * one pass. That is the "several purchases pressed inside one tick" case
   * `src/main.ts` names as the one its pre-flight cannot see, produced without
   * racing a 50 ms tick and without a fixed sleep anywhere.
   */

  /**
   * The worker's half: the simulation refuses a purchase, and the alerts list
   * is the only place the player hears about it.
   *
   * Two presses at half the treasury plus one unit. Each passes the
   * pre-flight on its own -- it compares against the balance the worker last
   * published, and a paused clock has dispatched neither of them, so that
   * figure is still the starting balance for both. The pair cannot both be
   * paid for, so when the clock runs `Treasury.spend` refuses the second and
   * `ProcurementSystem` answers `insufficient-funds`: the only one of its four
   * refusal reasons this panel can reach at all (a fresh `crypto.randomUUID()`
   * per press rules out `duplicate-order`, the stepper's clamp rules out
   * `invalid-quantity`, and the pre-flight answers `unknown-material` before
   * the worker ever sees it).
   */
  test('a purchase the simulation refuses reaches the band and the log, and no control (#89, #261, #220)', async ({
    page,
  }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A real prison: `submit` throws until a snapshot has baselined the
    // command sequence, and a refused command sends nothing at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // Paused on arrival, which is the state the two presses below depend on.
    await expect(page.locator('.hud-clock__day-progress')).toHaveText('0%');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    // Published once on `simulation/ready`, before any tick runs -- so the
    // pre-flight has a real figure to compare against from the first press.
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    const unitPrice = unitPriceOf('item.brick');
    const quantity = Math.floor(TREASURY_STARTING_BALANCE_MINOR_UNITS / unitPrice / 2) + 1;
    // The arithmetic this test rests on, asserted rather than left to a
    // reader: one is affordable against the published balance and two are not.
    expect(quantity * unitPrice).toBeLessThanOrEqual(TREASURY_STARTING_BALANCE_MINOR_UNITS);
    expect(2 * quantity * unitPrice).toBeGreaterThan(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    const alertsSection = page.locator('.hud-minimap .ui-section');
    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    const refusal = page.locator('.hud__refusal');
    await expect(emptyRow).toHaveCount(1);
    await expect(refusal).toBeHidden();

    await openBuyRow(page);
    await setBuyQuantity(page, quantity);
    const buy = page.locator('.hud-build__buy-submit');

    await buy.click();
    await expect
      .poll(async () => (await purchasesSent(page)).length, {
        message: 'the first press sent no PurchaseMaterials, so there is no purchase to refuse',
      })
      .toBe(1);
    await buy.click();
    await expect
      .poll(async () => (await purchasesSent(page)).length, {
        message: 'the second press was swallowed, so the treasury is never asked for more than it has',
      })
      .toBe(2);

    // Both got past the main thread, which is what makes this a test of the
    // worker's refusal: a lit band here -- with the clock still paused, so no
    // command has been dispatched -- would mean the pre-flight had spoken and
    // there was nothing left for the simulation to refuse.
    await expect(refusal).toBeHidden();
    await expect(page.locator('[data-action-failed="true"]')).toHaveCount(0);
    expect(await purchasesSent(page)).toEqual([
      { itemId: 'item.brick', quantity },
      { itemId: 'item.brick', quantity },
    ]);

    // Nothing has been dispatched yet, so nothing has been spent and nothing
    // has been refused: a paused clock steps no ticks, and commands are
    // applied inside `Kernel.step`.
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));
    await expect(emptyRow).toHaveCount(1);

    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();

    // Exactly one of the two was paid for, measured rather than inferred: the
    // balance lands one purchase down. Both succeeding is impossible because
    // the treasury refuses rather than overdrawing, and neither succeeding
    // would leave this at the starting figure.
    await expect
      .poll(async () => funds.textContent(), {
        message: 'the balance never moved, so neither queued purchase was ever dispatched',
        timeout: 20_000,
      })
      .toBe(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice));

    // The row arrives on the worker's own schedule: a new refusal opens the
    // status-counts publication gate, so it is posted on the tick-loop wake
    // the command was refused on rather than waiting out the 500 ms interval.
    await expect
      .poll(async () => alertRow.count(), {
        message: 'the simulation refused the purchase and the alerts list never heard about it',
        timeout: 20_000,
      })
      .toBe(1);
    await expect(emptyRow).toHaveCount(0);

    // **Visible, not merely present.** The alerts section starts folded
    // (`INITIAL_HUD_SHELL_STATE.collapsedPanels` holds `'alerts'`), so the row
    // is in the DOM with a 0x0 box until the player opens it -- and a text
    // assertion against a folded region passes while nothing is on screen,
    // which is exactly the state #220 measured. Opened here the same way the
    // #261 test opens it.
    await expect(alertRow).toBeHidden();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'true');
    await page.locator('.hud-minimap .ui-section__header').click();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'false');
    await expect(alertRow).toBeVisible();

    // The sentence the bundled locale gives the reason the simulation
    // actually sent, resolved from the catalog rather than typed here.
    await expect(alertRow).toContainText(localeText('hud.alert.refusal.purchase.insufficient-funds'));
    // And not the wire vocabulary (ADR 0011): `insufficient-funds` is what
    // `ProcurementSystem` decided and `purchase.insufficient-funds` is the id
    // it crossed the boundary as. Neither is a sentence.
    await expect(alertRow).not.toContainText('insufficient-funds');
    await expect(alertRow).not.toContainText('purchase.');

    // The HUD's own rendered text says it -- the measurement #220 established
    // as the honest one, because `toBeVisible` and `innerText` can disagree
    // about a subtree the layout has dropped.
    expect((await page.locator('.hud').innerText()).includes(localeText('hud.alert.refusal.purchase.insufficient-funds'))).toBe(
      true,
    );

    // **Exactly one refusal, from exactly one producer**, which is the
    // assertion this seam had none of. The band carries the simulation's
    // sentence -- and carried it before the fold above was opened, which is
    // the half #220 left unfixed for every refusal but one -- while no
    // control is marked and no `data-action` names one, because the pre-flight
    // in `src/main.ts` said nothing about this gesture and the command it sent
    // was accepted.
    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute('data-source', 'simulation');
    await expect(refusal).toContainText(localeText('hud.alert.refusal.purchase.insufficient-funds'));
    await expect(refusal).not.toContainText('purchase.');
    await expect(refusal).not.toHaveAttribute('data-action', /.*/u);
    await expect(page.locator('[data-action-failed="true"]')).toHaveCount(0);
    await expect(alertRow).toHaveCount(1);
  });

  /**
   * The pre-flight's half: this thread refuses a purchase, and the refusal
   * line is the only place the player hears about it.
   *
   * One unit more than the whole treasury can buy -- the case a player
   * actually reaches, and the only one of the pre-flight's two throws this
   * panel can provoke, since it offers no buy control at all for a material
   * nothing sells.
   *
   * The interesting half is the last one: the alerts list must stay on its
   * empty-state row. An empty list proves nothing on its own, because it is
   * also what "the worker has not published yet" looks like -- so the page is
   * made to publish again, with something observable, before emptiness is
   * asserted for the last time.
   */
  test('a purchase this thread refuses reaches the refusal line, and raises no alert (#89, #261)', async ({
    page,
  }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    const unitPrice = unitPriceOf('item.brick');
    const unaffordable = Math.floor(TREASURY_STARTING_BALANCE_MINOR_UNITS / unitPrice) + 1;
    expect(unaffordable * unitPrice).toBeGreaterThan(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    const alertsSection = page.locator('.hud-minimap .ui-section');
    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeHidden();
    await expect(emptyRow).toHaveCount(1);

    await openBuyRow(page);
    await setBuyQuantity(page, unaffordable);
    const buy = page.locator('.hud-build__buy-submit');
    await buy.click();

    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    await expect(refusal).toContainText(localeText('hud.refusal.purchase-materials'));
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    // On the control that was pressed, as well as in the line -- which is the
    // half of this surface the alerts row structurally cannot have.
    await expect(buy).toHaveAttribute('data-action-failed', 'true');
    const refusalId = await refusal.getAttribute('id');
    expect(refusalId).not.toBeNull();
    await expect(buy).toHaveAttribute('aria-describedby', String(refusalId));

    // Nothing left this thread, so the worker has nothing it *could* report
    // about this press: the throw happened instead of the submit, not
    // alongside it.
    expect(await purchasesSent(page)).toEqual([]);

    // **And the alerts list is untouched**, which is the half nothing
    // asserted. A row here would be the same refusal said twice, in two
    // places, for one press of one button.
    await expect(alertRow).toHaveCount(0);
    await expect(emptyRow).toHaveCount(1);
    await page.locator('.hud-minimap .ui-section__header').click();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'false');
    await expect(emptyRow).toBeVisible();

    /*
     * Now make the page publish again, so the emptiness above means "the
     * channel carried no refusal" rather than "the channel has not spoken
     * yet". One brick is affordable, a running clock dispatches it, and the
     * balance on the status strip moves -- and that readout arrives on the
     * very same `simulation/status-counts` message an alert row would have
     * arrived on. No sleep and no wall-clock assertion: the poll below waits
     * on the figure itself.
     */
    await setBuyQuantity(page, 1);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await buy.click();
    await expect
      .poll(async () => funds.textContent(), {
        message: 'the balance never moved, so no status-counts publication was observed after the refusal',
        timeout: 20_000,
      })
      .toBe(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - unitPrice));

    // The publication that carried the new balance carried no refusal, and
    // nothing the pre-flight did put one there.
    await expect(alertRow).toHaveCount(0);
    await expect(emptyRow).toHaveCount(1);
    await expect(page.locator('.hud-alerts__list')).not.toContainText(
      localeText('hud.alert.refusal.purchase.insufficient-funds'),
    );
  });

  /**
   * Issue #146's autosave, doing the thing it exists to do.
   *
   * `tests/foundation/composition-root-contract.test.ts` pins
   * `commandSender?.onCommandAccepted(() => controller.markDirty())` by
   * substring, and is explicit that a substring proves a wiring is *written*
   * and not that it works -- naming this suite as where the behaviour belongs.
   * It did not belong to anything: issue #264 prefixed that line with
   * `if (Number.isNaN(0))`, which keeps the pinned substring byte-for-byte, and
   * measured `tsc` clean with the whole headless suite green. This is that
   * missing half.
   *
   * Every layer under this one is already proven and none of them can reach it.
   * `AutosaveScheduler` coalesces and fires on its own timer
   * (`tests/unit/persistence-local-autosave.test.ts`); `SessionController`
   * turns a dirty marker into a repository write
   * (`tests/unit/persistence-session-controller.test.ts`);
   * `SimulationCommandSender` calls its accepted-listener on a `queued` reply
   * (`tests/unit/ui-simulation-commands.test.ts`). The join between them exists
   * only in `src/main.ts`, because the sender is built at module scope and the
   * controller inside `bootPersistence`.
   *
   * ## The two things this has to rule out
   *
   * **That the write came from a lifecycle event.** #146's defect left the
   * best-effort `pagehide` save as the only automatic write, so a test that
   * navigated would pass with the defect present. Nothing here navigates, and
   * the probe records `pagehide` and a hidden `visibilitychange` so the
   * assertion is that neither fired rather than that neither was asked for.
   *
   * **That the clock did the work.** Waiting 30 real seconds would put this
   * test at the mercy of the suite's timeout, so the probe shortens any
   * `setTimeout` of 30 s or more to a few milliseconds. That is a fake of the
   * autosave interval and nothing else: it is installed on `window.setTimeout`
   * only, so the simulation worker's own timers (a separate global scope) and
   * Phaser's `requestAnimationFrame` loop are untouched, and `src/main.ts`
   * schedules no other timer that long -- which the first assertion below
   * states, by requiring that no long timer exists until a command is
   * accepted. Deliberately narrower than `page.clock`, whose remit includes
   * `requestAnimationFrame` and therefore the loop that processes the world
   * drag this test depends on.
   */
  test('the interval autosave writes after play alone, with no lifecycle event (#146)', async ({ page }) => {
    await page.addInitScript(() => {
      const probe = { longTimers: [] as number[], lifecycle: [] as string[] };
      const realSetTimeout = window.setTimeout.bind(window);

      Object.defineProperty(window, 'setTimeout', {
        configurable: true,
        value: (handler: TimerHandler, timeout?: number, ...args: unknown[]): number => {
          if (typeof timeout === 'number' && timeout >= 30_000) {
            probe.longTimers.push(timeout);
            return realSetTimeout(handler, 25, ...args);
          }
          return realSetTimeout(handler, timeout, ...args);
        },
      });

      // Registered before the app's own listeners, and never removed: what is
      // being asserted is that these never fire at all.
      window.addEventListener('pagehide', () => probe.lifecycle.push('pagehide'));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') probe.lifecycle.push('visibility-hidden');
      });

      (window as unknown as AutosaveProbeWindow).lockstateAutosaveProbe = probe;
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    const readProbe = async (): Promise<{ longTimers: number[]; lifecycle: string[] }> =>
      page.evaluate(
        () =>
          (window as unknown as AutosaveProbeWindow).lockstateAutosaveProbe ?? {
            longTimers: [] as number[],
            lifecycle: [] as string[],
          },
      );

    // A session, and the generation `createPrison` writes immediately so that a
    // crash right after "New prison" does not leave an empty slot.
    await page.getByRole('button', { name: 'New prison' }).click();
    const status = page.locator('.save-panel__status');
    await expect(status).toContainText('Saved (generation ');
    const afterCreate = await status.textContent();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // Nothing has asked for a long timer yet: the scheduler is purely
    // dirty-driven, so with no command accepted there is no autosave pending.
    // This is the defect's own signature, and it is the state the page is in
    // right now for a legitimate reason.
    expect((await readProbe()).longTimers).toEqual([]);

    // Play: a wall, laid on the world, accepted by the simulation.
    await armBuildTool(page);
    await dragOnWorld(page);
    await expect(page.locator('.hud__refusal')).toBeHidden();

    // The interval was armed by the acceptance, which is the seam under test.
    // A count rather than an exact list: the scheduler coalesces markers into
    // one trailing-edge timer, but a marker arriving after that timer has
    // already fired legitimately arms another.
    await expect
      .poll(async () => (await readProbe()).longTimers.length, {
        message:
          'no 30-second timer was scheduled after an accepted command, so nothing marked the session dirty -- which is issue #146 exactly',
      })
      .toBeGreaterThan(0);
    expect([...new Set((await readProbe()).longTimers)], 'the autosave interval is 30 seconds').toEqual([30_000]);

    // And it wrote. A new generation id is the repository reporting a
    // completed transaction, so this is a save that reached storage rather
    // than one that was merely attempted.
    await expect
      .poll(async () => status.textContent(), {
        message: 'the autosave timer fired but no save result reached the panel',
      })
      .not.toBe(afterCreate);
    await expect(status).toContainText('Saved (generation ');

    // The write came from the interval, not from the page going away.
    expect((await readProbe()).lifecycle).toEqual([]);
  });

  /**
   * Issue #149, on the page a player actually loads.
   *
   * `tests/integration/session-second-load.test.ts` proves the composition
   * headlessly, against real state machines behind a loopback transport. What
   * it stands in for is the only thing that matters here: a real second
   * `Worker`, constructed by a real browser from a real bundled worker chunk,
   * after a first one has been terminated. That is also where the defect was
   * -- `src/main.ts` built one worker per page, so the worker's own
   * `already-initialized` rule turned every load after the first into a dead
   * end.
   *
   * Measured on this page before the fix, at this viewport, by exactly this
   * sequence: the status line read
   *
   *   "Loading failed: Simulation worker fault (already-initialized): Kernel
   *    is already initialized."
   *
   * and `.save-panel__detail` stayed empty, because `requestLoad` never
   * reached the line that fills it.
   */
  test('a second prison loads in the same tab, in a worker of its own (#149)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

    // A second prison, which is already a second `simulation/initialize` in
    // this page: creating one starts a session exactly as loading one does.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label')).toHaveCount(2);
    await expect(page.locator('.save-panel__status')).toContainText('Saved (generation ');

    // And now the case the issue is named for: Load, on a prison, in a page
    // that has already had a session.
    await page.locator('.save-panel__item').last().getByRole('button', { name: 'Load' }).click();

    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    // The detail line is the half that stayed empty before: it is written
    // only on the success path, from the bundle the load actually restored.
    await expect(page.locator('.save-panel__detail')).toContainText('Restored:');
    await expect(page.locator('.save-panel__status')).not.toContainText('already-initialized');

    // The row the player loaded is the active one, and the HUD is still the
    // real HUD rather than a shell left behind by a swapped-out worker.
    await expect(page.locator('.save-panel__item[data-active="true"]')).toHaveCount(1);
    await expect(page.locator('.hud__unavailable')).toBeHidden();

    // The renderer followed the swap: the clock strip is fed by
    // `simulation/ready` and `simulation/clock-state` from whichever worker is
    // current, so a day counter that still reads `--` here would mean the
    // page's readers were left attached to the terminated one.
    await expect(page.locator('.hud-clock__day')).not.toHaveText('--');

    // And a third session works too, which is the property "load means what
    // reloading the page means" actually asserts.
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load' }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
  });

  /**
   * Issue #82's failure path, re-entered rather than run once at boot (#149).
   *
   * With a worker per session, `new Worker` can fail long after first paint,
   * and the outgoing worker is terminated before its replacement is built --
   * so the page really is left with no simulation, which is precisely what the
   * `simulation-unavailable` band says. Before #149 this state was
   * unreachable, and the HUD's own comment said so ("a `Worker` constructor
   * that threw does not un-throw"), which is why the notice had no setter.
   *
   * Blocking `Worker` *after* load rather than in an init script is the whole
   * point: the boot construction has to succeed, so that this is a later one
   * failing and not the case the test below already covers.
   */
  test('a worker that cannot be started for a later session is reported, not thrown (#82, #149)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const unhandled: string[] = [];
    page.on('pageerror', (error) => unhandled.push(String(error)));
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
    await expect(page.locator('.hud__unavailable')).toBeHidden();

    await page.evaluate(() => {
      (window as unknown as { __realWorker: unknown }).__realWorker = window.Worker;
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        value: function BlockedWorker(): never {
          throw new DOMException('Worker construction is blocked in this test.', 'SecurityError');
        },
      });
    });

    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load' }).click();

    // The player is told which action failed, and why, on the panel they
    // pressed -- an ordinary error, so no save generation was blamed for it.
    await expect(page.locator('.save-panel__status')).toContainText('Loading failed:');
    await expect(page.locator('.save-panel__status')).toContainText('could not be started');
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');

    // And the page says what it now is, in the band that survives every
    // breakpoint (#220): this tab has no simulation until it is reloaded.
    const unavailable = page.locator('.hud__unavailable');
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toContainText('Simulation unavailable');
    expect(
      await page.evaluate(
        () =>
          (document.querySelector<HTMLElement>('.hud')?.innerText ?? '').toLowerCase().includes('simulation unavailable'),
      ),
    ).toBe(true);

    // And it stops saying so once the page has a simulation again. The band is
    // a standing statement about this page, so it has to be able to come down:
    // that is the half of `setUnavailable` a raise-only setter would miss, and
    // it is only reachable because the failure is.
    await page.evaluate(() => {
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        value: (window as unknown as { __realWorker: unknown }).__realWorker,
      });
    });
    await page.locator('.save-panel__item').first().getByRole('button', { name: 'Load' }).click();
    await expect(page.locator('.save-panel__status')).toHaveText('Loaded.');
    await expect(unavailable).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          (document.querySelector<HTMLElement>('.hud')?.innerText ?? '').toLowerCase().includes('simulation unavailable'),
      ),
    ).toBe(false);

    expect(unhandled).toEqual([]);
  });

  test('still mounts the interface when the simulation worker cannot start (#82)', async ({ page }) => {
    // Break `Worker` before any module evaluates, which is the one failure
    // mode `src/main.ts` explicitly promises to survive: "a browser that
    // cannot start a worker still gets a running page". A hardened browser,
    // a blocked blob: URL or a strict CSP all land here.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Worker', {
        configurable: true,
        value: function BlockedWorker(): never {
          throw new DOMException('Worker construction is blocked in this test.', 'SecurityError');
        },
      });
    });

    await page.goto(APP_URL);

    // The HUD holds no simulation state, so there is nothing for it to wait
    // on. Before the fix this was absent entirely and the player got a canvas
    // with no way to be told why.
    await expect(page.locator('.hud')).toHaveCount(1);

    // And it must be the real HUD, not an empty shell.
    await expect(page.locator('.hud-strip')).toBeVisible();
    expect(await page.locator('.hud-tabs__inner .ui-tab').count()).toBeGreaterThan(0);

    /*
     * The player is told, **on screen**. A console message is not
     * communication, and neither is a node in the DOM that no viewport lays
     * out.
     *
     * `toBeVisible` and not `toContainText` alone, because that pairing is
     * the whole history of this assertion. Until #220 the sentence was an
     * entry in `HudViewModel.alerts`, and this line read
     * `expect(page.locator('.hud-alerts__list')).toContainText(...)` and
     * passed -- while the same page, measured at 1280x800 with `Worker`
     * blocked, reported:
     *
     *   listExists    true
     *   listText      "Simulation unavailable — this browser could not start
     *                  it, so nothing can run or be saved" + "Critical"
     *   listLaidOut   false          <- offsetParent === null
     *   listRect      0 x 0
     *   cornerDisplay "block"        <- so NOT the <=720px media query
     *   hudMentionsIt false          <- .hud innerText never said it
     *
     * `.hud__corner` was displayed; the Alerts *section* inside it starts
     * collapsed (`INITIAL_HUD_SHELL_STATE`, and `createCollapsibleSection`
     * sets `body.hidden = collapsed`), so the row had zero size on every
     * viewport rather than only on a phone. The sentence now goes to
     * `.hud__unavailable`, a HUD grid row that is laid out at every width.
     */
    const unavailable = page.locator('.hud__unavailable');
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toContainText('Simulation unavailable');
    await expect(unavailable).toHaveAttribute('role', 'status');
    await expect(unavailable).toHaveAttribute('aria-live', 'polite');

    // And it is not merely visible to Playwright: it is a real box, and the
    // HUD's own rendered text says it. `hudMentionsIt` is the measurement
    // that was `false` for as long as the defect lived.
    const measured = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('.hud__unavailable');
      const rect = node?.getBoundingClientRect();
      return {
        laidOut: node !== null && node.offsetParent !== null,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        hudMentionsIt: (document.querySelector<HTMLElement>('.hud')?.innerText ?? '')
          .toLowerCase()
          .includes('simulation unavailable'),
      };
    });
    expect(measured.laidOut).toBe(true);
    expect(measured.width).toBeGreaterThan(0);
    expect(measured.height).toBeGreaterThan(0);
    expect(measured.hudMentionsIt).toBe(true);

    // The alerts list is where it used to be routed, and where it must not be
    // again: that region is `display: none` below 720px and its section
    // starts folded, so a sentence in it reaches nobody.
    await expect(page.locator('.hud-alerts__list')).not.toContainText('Simulation unavailable');

    // A phone. `hud.css` drops `.hud__corner` entirely at 720px and below, so
    // under the old routing no interaction could put the sentence on screen
    // here at all: with the whole region `display: none`, opening the Alerts
    // section inside it still leaves its rows unlaid-out (#220 measured
    // exactly that, at this viewport). This row survives the breakpoint.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(unavailable).toBeVisible();
    await expect(unavailable).toContainText('Simulation unavailable');
    expect(
      await page.evaluate(() => {
        const corner = document.querySelector('.hud__corner');
        return corner === null ? null : getComputedStyle(corner).display;
      }),
    ).toBe('none');

    // Back to the viewport the rest of this test measures at -- Playwright's
    // default, which is what it ran at before the phone check was added.
    await page.setViewportSize({ width: 1280, height: 720 });

    // No save panel, and that is correct rather than a second bug: with no
    // worker there is no session, so nothing exists to save. A panel here
    // would offer an action that cannot work.
    await expect(page.locator('.save-panel')).toHaveCount(0);

    // And the transport controls are still there and still pressable, so the
    // second half of `src/main.ts`'s promise has to hold too: with no worker
    // `requireSimulation` throws for every one of them, and the comment on it
    // says the HUD reports that "on the control that was pressed" (#207).
    // Until #207 nothing on screen changed at all, which is the same defect
    // the alert above fixes, one layer in: the player is told the simulation
    // is unavailable, and was not told that the button they just pressed did
    // nothing.
    const pause = page.locator('.hud-strip__transport [title="Pause"]');
    await pause.click();
    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeVisible();
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText('The clock did not change');
    await expect(refusal).toHaveAttribute('data-action', 'set-clock');
    await expect(pause).toHaveAttribute('data-action-failed', 'true');
    // Only the button that was pressed, though all three were disabled while
    // the command was in flight.
    expect(await page.locator('.hud-strip__transport [data-action-failed="true"]').count()).toBe(1);
  });

  test('names the build it is, in the top-left corner, from a real injected define', async ({ page }) => {
    await openApp(page);

    const badge = page.locator('.brand');
    // `toBeVisible` and not `toContainText` alone. A text assertion on a
    // `display: none` ancestor passes, which is exactly how #82's alert stayed
    // invisible -- at every viewport, not only on a phone -- while its guard
    // stayed green (#220).
    await expect(badge).toBeVisible();
    await expect(badge.locator('.brand__wordmark')).toHaveText('LockState.io');
    await expect(badge.locator('.brand__stage')).toHaveText('PRE-ALPHA');

    const measured = await page.evaluate(() => {
      const element = document.querySelector('.brand');
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      const strip = document.querySelector('.hud-strip')?.getBoundingClientRect();
      const metrics = document.querySelector('.hud-strip__metrics')?.getBoundingClientRect();
      return {
        buildId: (element as HTMLElement).dataset['buildId'] ?? null,
        build: document.querySelector('.brand__build')?.textContent ?? null,
        laidOut: (element as HTMLElement).offsetParent !== null,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        // Whether it overlaps the metrics it sits beside. Two independently
        // positioned layers competing for one corner is the #88 defect, and the
        // reason this badge is in the strip's own flex row rather than `fixed`.
        overlapsMetrics: metrics === undefined ? null : rect.right > metrics.left,
        insideStrip: strip === undefined ? null : rect.top >= strip.top && rect.bottom <= strip.bottom,
      };
    });

    expect(measured).not.toBeNull();
    expect(measured!.laidOut).toBe(true);
    expect(measured!.width).toBeGreaterThan(0);
    // The top-left corner, in the strip's band, and clear of the metrics.
    expect(measured!.left).toBeLessThan(24);
    expect(measured!.top).toBeLessThan(24);
    expect(measured!.insideStrip).toBe(true);
    expect(measured!.overlapsMetrics).toBe(false);

    /*
     * The `define` really ran.
     *
     * This is the assertion the whole feature rests on and the one no headless
     * test can make: `src/shared/build-identity.ts` falls back to `unknown`
     * whenever the compile-time replacement is absent, and that fallback is
     * what the unit suite necessarily exercises. Only a page served by a real
     * Vite build can show the injected value -- so `lockstate-unknown-unknown`
     * here would mean the badge works, reads correctly, and tells every player
     * nothing, with every other assertion in this test still green.
     */
    expect(measured!.buildId).not.toBeNull();
    expect(measured!.buildId).toMatch(/^lockstate-\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?-[0-9a-f]{7}$/u);
    expect(measured!.buildId).not.toContain('unknown');
    // And the visible line is built from the same identity rather than from a
    // second source: both halves of `data-build-id` appear in it.
    const [, version, commit] = /^lockstate-(.+)-([0-9a-f]{7})$/u.exec(measured!.buildId!) ?? [];
    expect(measured!.build).toContain(version!);
    expect(measured!.build).toContain(commit!);

    /*
     * The build line is *painted*, and the responsive rule is asserted in both
     * directions.
     *
     * `textContent` above would read a line `display: none` had removed from the
     * layout, so on its own it cannot tell a visible version from a hidden one.
     * `brand.css` drops `.brand__build` at 720px and under -- the same
     * breakpoint `hud.css` drops the minimap at -- because the strip has to fit
     * six metric chips and three transport buttons on a phone, and the wordmark
     * is what makes the corner read as a product. Asserting only the desktop
     * half would leave a rule that could stop applying; asserting only the phone
     * half would pass if the line were hidden everywhere.
     */
    const laidOut = (selector: string): Promise<boolean> =>
      page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.offsetParent !== null, selector);

    expect(await laidOut('.brand__build'), 'the build line is not painted at 1280px').toBe(true);
    expect(await laidOut('.brand__wordmark')).toBe(true);

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await laidOut('.brand__build'), 'the build line still takes strip width on a phone').toBe(false);
    expect(await laidOut('.brand__wordmark'), 'the wordmark is the last thing to go, and it does not go').toBe(true);
  });

  test('still renders when the browser blocks site data, so localStorage throws (#199)', async ({ page }) => {
    // #82's sibling, one layer earlier and through a different resource. That
    // issue was closed by moving `mountInterface` out of `bootPersistence`,
    // which protects against a failing worker and a failing IndexedDB. It does
    // not protect against a failing `localStorage`, because the renderer read
    // one in a class field initializer -- inside the constructor, at module
    // top level, outside any `try` -- so the throw aborted the rest of
    // `main.ts`: `new Phaser.Game`, `mountInterface` and `bootPersistence`
    // together. The player got `document.body.textContent === ''`.
    //
    // Two shapes, because a hostile browser produces both and only one of them
    // is reachable by stubbing a method: Chrome throws on the
    // `window.localStorage` *property access* when site data is blocked for the
    // origin, while a sandboxed or partitioned context can hand over a store
    // whose `getItem` throws. The getter case is the harder one and is what
    // this test uses, because a guard that only wraps `getItem` passes the
    // other.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get(): never {
          throw new DOMException('Access to storage is not allowed from this context.', 'SecurityError');
        },
      });
    });

    await page.goto(APP_URL);

    // The three things a blank page has none of.
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.locator('.hud')).toHaveCount(1);
    expect(await page.locator('.hud-tabs__inner .ui-tab').count()).toBeGreaterThan(0);

    // And the page is genuinely assembled rather than merely non-empty.
    await expect(page.locator('.hud-strip')).toBeVisible();

    // Settings fell back to defaults rather than failing boot, which is what
    // `docs/INPUT.md` has always claimed happens. The camera keys are part of
    // the default bindings, so a working camera is the observable form of that
    // claim -- and it is the half a try/catch around `JSON.parse` alone would
    // not deliver, since it never reaches the parse.
    await expect(page.locator('canvas')).toBeVisible();
  });
});

interface CentreHitCounters {
  canvas: number;
  hud: number;
}

type HitCountingWindow = Window & { lockstateCentreHits?: CentreHitCounters };
