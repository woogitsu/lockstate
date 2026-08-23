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
 * far has ever loaded the page a player loads. Five claims only exist once
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
 * `src/main.ts` mounts the HUD and the save panel from `bootPersistence`,
 * one turn after the Phaser game is constructed, so waiting for all three is
 * what "the app is up" means here.
 */
async function openApp(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
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
