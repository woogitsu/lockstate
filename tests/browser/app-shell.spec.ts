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
 * 6. **Every control on the page can actually be pressed.** Presence is not
 *    reachability, and until issue #88 this file only ever asserted the
 *    first. The save panel and the HUD were two independently-positioned
 *    `fixed` layers that had never been laid out relative to each other, so
 *    on the Build tab the Build panel covered the save panel and all five of
 *    its buttons did nothing — silently, with this suite green. Only a
 *    browser answers `elementFromPoint`, and only the assembled page has
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

interface UnreachableControl {
  readonly control: string;
  readonly hit: string;
}

/**
 * Which controls are covered by something else.
 *
 * For every laid-out interactive element, `document.elementFromPoint` at the
 * centre of its own box must resolve to that element or to something inside
 * it. Anything else means the topmost thing at those pixels belongs to a
 * different control, and the press lands there instead.
 *
 * Three deliberate details:
 *
 * - **Scrolled into view first.** A control inside a scroll container may
 *   legitimately be out of view; that is not a collision, and the player
 *   reaches it by scrolling. Scrolling it into view and re-measuring asks the
 *   real question — "once it is on screen, can it be pressed" — instead of
 *   flagging every list that is longer than its box.
 * - **A `null` hit is a failure, not a skip.** `elementFromPoint` returns
 *   `null` for a point outside the viewport, so a control pushed off the
 *   edge by an overflowing layout reports here rather than silently passing.
 * - **Zero-area elements are skipped.** An inactive tab's panel and the
 *   corners the responsive rules drop are not laid out at all; "is it
 *   displayed" is a different question, asserted separately.
 */
async function unreachableControls(page: Page): Promise<readonly UnreachableControl[]> {
  return page.evaluate((selector: string) => {
    const describe = (node: Element): string => {
      const label =
        node.getAttribute('aria-label') ?? node.getAttribute('title') ?? node.textContent?.trim().slice(0, 32) ?? '';
      const classes = typeof node.className === 'string' && node.className !== '' ? `.${node.className}` : '';
      return `${node.tagName.toLowerCase()}${classes}${label === '' ? '' : ` "${label}"`}`;
    };

    const unreachable: { control: string; hit: string }[] = [];
    for (const control of document.querySelectorAll<HTMLElement>(selector)) {
      if (control.getBoundingClientRect().width === 0) continue;
      if (control.getBoundingClientRect().height === 0) continue;

      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      // Re-read after the scroll: that is where the control now is.
      const rect = control.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      if (hit !== null && control.contains(hit)) continue;

      unreachable.push({
        control: describe(control),
        hit: hit === null ? '(outside the viewport)' : describe(hit),
      });
    }
    return unreachable;
  }, INTERACTIVE_SELECTOR);
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
   * the Build tab the Build panel covered the save panel and swallowed every
   * click on it, so **New prison, Save now, Export, Load and Delete all did
   * nothing** — with no error, no console message and no status change. The
   * suite was green throughout, because every assertion it had asked whether
   * an element *existed*.
   *
   * This is deliberately not an assertion about those two panels. It is the
   * general property: on the assembled page, at every viewport this suite
   * visits and on every tab, the topmost element at the centre of each
   * control is that control. It costs one `elementFromPoint` per control and
   * it catches the whole class — any future region that lands on top of
   * another one fails here, whichever two they are.
   *
   * The Build tab's numeric fallback is expanded as its own case: it is the
   * tallest the Build panel gets, it is one tap away, and it is the state the
   * issue was measured in.
   */
  test('every control can actually be pressed, on every tab and at every viewport (#88)', async ({ page }) => {
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

      for (const tab of ['overview', 'build', 'security', 'regime'] as const) {
        await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
        expect(
          await unreachableControls(page),
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

      // The numeric fallback expanded: the tallest the Build panel gets, and
      // the state issue #88 was measured in.
      const coordinates = page.locator('.hud-build .ui-section__header').last();
      if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
      expect(
        await unreachableControls(page),
        `controls covered by something else with the Build coordinates expanded at ${width}x${height}`,
      ).toEqual([]);
      // Folded away again, so the next viewport starts from the same state.
      if ((await coordinates.getAttribute('aria-expanded')) === 'true') await coordinates.click();
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
  });
});

interface CentreHitCounters {
  canvas: number;
  hud: number;
}

type HitCountingWindow = Window & { lockstateCentreHits?: CentreHitCounters };
