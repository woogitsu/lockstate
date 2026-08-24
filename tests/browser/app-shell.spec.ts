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
 * far has ever loaded the page a player loads. Six claims only exist once
 * the pieces are assembled in a browser, and none of them can be settled a
 * layer down:
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

/**
 * The one viewport in the sweep below where the Build panel does not get its
 * whole content height in the *default* state, and so scrolls on arrival.
 *
 * Named rather than tolerated. The rail there is 483px and the Build panel
 * wants 398px of it, which leaves less than the save panel's floor, so
 * something has to scroll and the tool the player is holding is the thing
 * that keeps the space it can. Everywhere else the default state fits, and
 * that is the property this constant makes assertable: the first #88 fix
 * clipped the Build panel at 1280x720 too, on arrival, and nothing said so.
 */
const BUILD_PANEL_SCROLLS_BY_DEFAULT_AT = '900x600';

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
      expect(
        foldedRail.buildPanelScrolls,
        `the Build panel scrolls on arrival at ${width}x${height}`,
      ).toBe(`${width}x${height}` === BUILD_PANEL_SCROLLS_BY_DEFAULT_AT);

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
    await expect(page.locator('.save-panel__empty')).toHaveText('No prisons yet.');

    await page.getByRole('button', { name: 'New prison' }).click();
    // The whole production path: the panel asks the session controller, which
    // asks the simulation worker for a snapshot and writes the generation to
    // IndexedDB. `(1 gen)` is the proof that generation reached storage —
    // issue #65's orphan was a row with none.
    await expect(page.locator('.save-panel__item-label')).toHaveText('New Prison (1 gen)');
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
   * The strip's five metrics were literal zeros for the whole of a session
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
    // The badge follows the count, so the colour is never the only signal.
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

    await submit.click();

    // What the player sees. The line is real layout, not merely a node in the
    // DOM, and it names the outcome rather than the thrown English `Error`.
    const refusal = page.locator('.hud__refusal');
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

    // The player is told. A console message is not communication: it has to
    // reach the screen, and the alerts region is where the HUD already says
    // things of this kind.
    await expect(page.locator('.hud-alerts__list')).toContainText('Simulation unavailable');

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
    await expect(refusal).toContainText('The clock did not change');
    await expect(refusal).toHaveAttribute('data-action', 'set-clock');
    await expect(pause).toHaveAttribute('data-action-failed', 'true');
    // Only the button that was pressed, though all three were disabled while
    // the command was in flight.
    expect(await page.locator('.hud-strip__transport [data-action-failed="true"]').count()).toBe(1);
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
