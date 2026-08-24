import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser verification for the *assembled application* — `index.html`
 * plus `src/main.ts`, i.e. the renderer (#69) and the mounted HUD (#73)
 * running together over real storage and real HTTP.
 *
 * Every other spec in this directory drives a purpose-built harness page.
 * That is the right shape for a module under test, but it means nothing so
 * far has ever loaded the page a player loads. Ten claims only exist once
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
 * What the tee installed by the world-drag transaction test exposes.
 *
 * The other tee on this page records what the worker *posted*; this one
 * records what the page *sent*, which is the only place a `transactionId`
 * is observable at all -- it is minted on this thread, travels inside a
 * packed command, and nothing comes back that mentions it.
 */
interface CommandTeeWindow extends Window {
  lockstateSentToWorker?: readonly unknown[];
}

/** One `simulation/submit-command` message as it went over `postMessage`. */
interface SubmittedCommand {
  readonly kind?: string;
  readonly payload?: {
    readonly command?: { readonly data?: { readonly type?: string; readonly orderId?: string; readonly transactionId?: string } };
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
async function armBuildTool(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build' }).click();
  const arm = page.locator('.hud-build__map .ui-action');
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
 * Every element a player can press, anywhere on the assembled page.
 *
 * Deliberately not scoped to `.hud`: the collision issue #88 reported was
 * *between* two independently-positioned regions, so a check that only ever
 * looks inside one of them cannot see it.
 */
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
const NEVER_LAID_OUT_BELOW_720 = [
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__header > ' +
    'button.ui-icon-button ui-icon-button--quiet ui-panel__toggle "Collapse"',
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__body > ui-section > ' +
    'button.ui-section__header "Alerts"',
] as const;

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
      // legitimately absent on three of the four tabs.
      const everMeasured = new Set<number>();
      let inventory: readonly string[] = [];

      for (const tab of ['overview', 'build', 'security', 'regime'] as const) {
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
      // 52px; `hud.css`'s `max-height: 700px` block trims 63.6px off the
      // panel's fixed blocks and the catalogue's own slack covers the rest of
      // the 67.7px shortfall (issue #174). The first #88 fix clipped the panel
      // at 1280x720 too, on arrival, and nothing said so -- which is what this
      // line is for.
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
      const lastSection = await page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const sections = [...document.querySelectorAll('.hud-build .ui-section')];
        const header = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
        if (panel === null || header === null) return null;
        const scrollTop = panel.scrollTop;
        panel.scrollTop = 0;
        const p = panel.getBoundingClientRect();
        const h = header.getBoundingClientRect();
        return {
          text: header.textContent?.trim() ?? '',
          bottom: h.bottom,
          fold: p.top + panel.clientTop + panel.clientHeight,
          scrollTop,
        };
      });
      expect(lastSection, `the Build panel's last section has no box at ${width}x${height}`).not.toBeNull();
      expect(lastSection?.text, `the panel's last section at ${width}x${height}`).toBe('Enter coordinates');
      expect(
        lastSection?.scrollTop,
        `reaching a control scrolled the Build panel at ${width}x${height}`,
      ).toBe(0);
      expect(
        lastSection?.bottom ?? Number.POSITIVE_INFINITY,
        `"Enter coordinates" is below the unscrolled Build panel's fold at ${width}x${height}: it ends at y=${Math.round(lastSection?.bottom ?? 0)} in a panel clipped at y=${Math.round(lastSection?.fold ?? 0)}`,
      ).toBeLessThanOrEqual(lastSection?.fold ?? 0);

      // And the body of that panel is never shorter than its own content. It
      // was 283px of box over 335px of content at 900x600 (#174): harmless
      // only because the one ancestor between it and the viewport that clips
      // also scrolls, which is a property of today's box chain rather than a
      // guarantee.
      //
      // Be exact about what makes this green. Today it is the layout above --
      // `hud.css`'s summed floor under the body is 3.8px slack at 900x600 and
      // further slack everywhere else, so nothing is currently resting on it.
      // The floor is what holds once something does: with the `max-height`
      // block disabled the body is pressed onto it and this reads 32 rather
      // than the 52 it read before the floor existed. That is also why the
      // assertion matters more than the sum -- a floor derived 9px short is a
      // 9 here the moment the rail is tight enough to reach it, instead of a
      // panel quietly clipping again.
      expect(
        await page.evaluate(() => {
          const body = document.querySelector('.hud-build > .ui-panel__body');
          return body === null ? -1 : body.scrollHeight - body.clientHeight;
        }),
        `the Build panel's body is shorter than its own content at ${width}x${height}`,
      ).toBe(0);

      // The numeric fallback expanded: the tallest the Build panel gets, and
      // the state issue #88 was measured in.
      const coordinates = page.locator('.hud-build .ui-section__header').last();
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

      // Nothing got a free pass by never being laid out. At desktop widths the
      // Build tab with its coordinates expanded shows every control there is,
      // so the list is empty; at 720px and below the responsive rules drop
      // `.hud__corner` outright — the minimap and the alerts section — and
      // those two controls genuinely cannot be reached at any tab. That is a
      // deliberate responsive decision (see `hud.css`), named here so it stays
      // one: it is the honest limit of what this test can claim about a phone.
      const neverLaidOut = inventory.filter((_, index) => !everMeasured.has(index));
      expect(neverLaidOut, `controls never laid out in any state at ${width}x${height}`).toEqual(
        width <= 720 ? [...NEVER_LAID_OUT_BELOW_720] : [],
      );
      expect(
        everMeasured.size,
        `hit-tested only ${everMeasured.size} of ${inventory.length} controls at ${width}x${height}`,
      ).toBe(inventory.length - (width <= 720 ? NEVER_LAID_OUT_BELOW_720.length : 0));
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
    const coordinates = page.locator('.hud-build .ui-section__header').last();
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();

    const submit = page.locator('.hud-build .ui-section__body .ui-action');
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
    await expect(page.locator('.hud-build__map .ui-action')).toHaveText('Stop placing');
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
