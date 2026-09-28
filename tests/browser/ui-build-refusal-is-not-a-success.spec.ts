import { DEFAULT_LOCALE } from '../../src/content/localization';
import { defaultMessageCatalogEn } from '../../src/services/localization';
import { Localizer } from '../../src/services/localization/localizer';
import { type Page, expect, test } from './network-changed-fixture';

/**
 * **A refused placement and an accepted one do not look alike** -- issue
 * #1160's second exit criterion, and constitution article 3's sixth state.
 *
 * ## What article 3 asks for, and which two of its six states this settles
 *
 * *"Odróżniaj: wskazanie, podgląd, przyjęte zlecenie, realizację, gotowy obiekt
 * i odmowę"* -- distinguish pointing, preview, accepted order, execution,
 * finished object and refusal. The pair that can be confused for each other is
 * **accepted order** and **refusal**, because they are produced by the same
 * press on the same control a fraction of a second apart, and the failure mode
 * `docs/adr/STATUS-QUEUE.md` complains about is the refusal that reads as a
 * success.
 *
 * So this drives both halves of one press through the real application and
 * requires each to produce the *other's* absence:
 *
 * | press | refusal band | build queue |
 * | --- | --- | --- |
 * | a wall on owned land | stays hidden | gains its first row |
 * | a bed outside any room | names the reason | does not grow |
 *
 * An assertion on either column alone passes against the defect. A refusal
 * that also queued the order would satisfy "the band appeared"; a success that
 * silently queued nothing would satisfy "no band appeared".
 *
 * ## Why the accepted press runs first
 *
 * `RefusalLog.supersede` is keyed to the exact subject (#492), so a *later*
 * success at a different tile does not retire an earlier refusal -- issue
 * #780, open, and deliberately not asserted either way here. Running the
 * accepted press first means the band's `toBeHidden` is a statement about the
 * success rather than about the keying, and nothing in this spec encodes #780's
 * behaviour as correct.
 *
 * ## Why the refusal's own sentence is asserted verbatim
 *
 * *"with the reason the simulation gave"* is the exit criterion's own clause.
 * A band that appeared with the generic host sentence would be visibly distinct
 * from a success and still not be this. The expected text is read out of the
 * shipped catalogue rather than written down here, so the assertion follows the
 * wording if the owner unifies it and fails if the *key* changes.
 */

const APP_URL = '/index.html';

const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

/**
 * What the simulation says when a bed is placed on a tile that is in no zoned
 * room -- `PLACE_OBJECT_REFUSAL_REASONS['outside-room']`, through
 * `hud.alert.refusal.place-object.outside-room`.
 */
const OUTSIDE_ROOM = localizer.format('hud.alert.refusal.place-object.outside-room');
const OUTSIDE_MAP = localizer.format('hud.alert.refusal.build.out-of-bounds');

/** The save panel's own label for the control that starts a session. */
const NEW_PRISON = localizer.format('save.action.create');

/**
 * What the queue's own header says with one order waiting and none started.
 *
 * Read out of the catalogue rather than typed here, so a rewording of
 * `hud.build.queue-count` moves the expectation with it. It is the panel's
 * statement of the **accepted order** state, and it is what a refused press
 * must not produce.
 */
const QUEUE_COUNT_ONE = localizer.format('hud.build.queue-count', { count: 1, started: 0 });

const TILE_X = '.hud-build__coords > .ui-number:nth-child(1) .ui-number__input';
const TILE_Y = '.hud-build__coords > .ui-number:nth-child(2) .ui-number__input';
const PLACE_ORDER = '.hud-build__coordinates .ui-action';

/**
 * Opens the application, creates a prison, and waits for the worker to have
 * published a clock.
 *
 * The wait is a precondition rather than patience, for the reason
 * `app-shell.spec.ts`'s own `waitForSession` gives at length: `New prison`
 * returns the instant the click is dispatched, and a command pressed before
 * `simulation/ready` is refused **by the host** with
 * `hud.refusal.place-build-order` -- which is a different sentence from a
 * different producer, and would make this spec pass its refusal case for the
 * wrong reason and fail its accepted case. Measured here before the wait was
 * added: the first press came back `data-source="host"`, *"The build order was
 * not placed -- the request was refused."*
 */
async function openBuildPanel(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  await page.locator('.save-panel__button', { hasText: NEW_PRISON }).first().click();
  await expect(
    page.locator('.hud-clock__day'),
    'the prison was never created, so no order could be placed',
  ).toHaveText('1');
  await page.locator('.ui-tab[data-tab="build"]').click();
  const coordinates = page.locator('.hud-build__coordinates');
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') {
    await page.locator('.hud-build__coordinates > .ui-section__header').click();
  }
  await expect(coordinates).toHaveAttribute('data-collapsed', 'false');
}

/** Chooses a catalogue row and submits the numeric route at one tile. */
async function placeAt(page: Page, buildableId: string, x: number, y: number): Promise<void> {
  await page.locator(`.hud-build__list [data-buildable="${buildableId}"]`).click();
  await page.locator(TILE_X).fill(String(x));
  await page.locator(TILE_Y).fill(String(y));
  await page.locator(PLACE_ORDER).click();
}

test.describe('a refused placement never reads as an accepted one (#1160)', () => {
  test('an accepted order queues and says nothing about a refusal', async ({ page }) => {
    await openBuildPanel(page);
    const panel = page.locator('.ui-panel.hud-build');
    await expect(panel, 'a fresh prison has queued nothing').not.toHaveAttribute('data-queued', /.*/u);

    await placeAt(page, 'wall-brick', 16, 16);

    // The accepted-order state: the queue block appears with a row in it.
    // `data-queued` carries the queue's own length -- the panel writes
    // `String(shown.total)` -- so one accepted order reads `1`, and asserting
    // the figure rather than a boolean is what makes "the order the player just
    // gave" the subject rather than "some order exists".
    await expect(panel).toHaveAttribute('data-queued', '1');
    await expect(page.locator('.hud-build__queue-count')).toHaveText(QUEUE_COUNT_ONE);
    /*
     * The block arrives folded, which is what the panel's own height budget
     * buys (see `BUILD_QUEUE_ROW_LIMIT`), so the row is opened before it is
     * asked to be on screen. Its Cancel is asserted with it: #862 made every
     * queued order cancellable and #1160 says not to regress that, and an
     * accepted order the player cannot withdraw is the other half of "the six
     * states are distinguishable" -- an accepted order is a thing you can still
     * take back, which is exactly what tells it from an execution.
     */
    await page.locator('.hud-build__queue > .ui-section__header').click();
    const row = page.locator('.hud-build__queue-row').first();
    await expect(row).toBeVisible();
    await expect(row.locator('.ui-action, .ui-icon-button').first()).toBeVisible();
    // And the refusal state does not: a success that also painted a refusal
    // would be the defect wearing the other sign.
    await expect(page.locator('.hud__refusal'), 'an accepted order paints no refusal').toBeHidden();
  });

  test('a refused placement names the simulation reason and queues nothing', async ({ page }) => {
    await openBuildPanel(page);
    const panel = page.locator('.ui-panel.hud-build');
    const queued = page.locator('.hud-build__queue-row');

    // A fresh prison has no zoned room anywhere, so a bed has nowhere legal to
    // stand -- the refusal is the simulation's, not a check this thread made:
    // `src/main.ts` holds no copy of the zoning plane (see
    // `PLACE_OBJECT_REFUSAL_REASONS`' own docblock).
    await placeAt(page, 'bed-wooden', 16, 16);

    const band = page.locator('.hud__refusal');
    await expect(band, 'the refusal reaches the player').toBeVisible();
    await expect(band, 'and it is the simulation that answered').toHaveAttribute('data-source', 'simulation');
    await expect(band, 'with the reason the simulation gave').toHaveText(OUTSIDE_ROOM);

    // Nothing was accepted. A refused press that queued a row would be a
    // refusal that reads as a success in the one place the player looks for
    // what they just ordered.
    await expect(queued).toHaveCount(0);
    await expect(panel).not.toHaveAttribute('data-queued', /.*/u);
  });

  test('a Full HD coordinate wall refusal leaves no order before an adjacent valid wall is queued', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openBuildPanel(page);
    const panel = page.locator('.ui-panel.hud-build');
    const band = page.locator('.hud__refusal');

    // A new prison owns one 32×32 chunk. These two tiles share an edge, but
    // only x=31 lies inside it. Both presses use the same catalogue selection.
    await placeAt(page, 'wall-brick', 32, 16);
    await expect(band).toBeVisible();
    await expect(band).toHaveAttribute('data-source', 'simulation');
    await expect(band).toHaveText(OUTSIDE_MAP);
    await expect(panel).not.toHaveAttribute('data-queued', /.*/u);
    await expect(page.locator('.hud-build__queue-row')).toHaveCount(0);

    await placeAt(page, 'wall-brick', 31, 16);
    await expect(panel).toHaveAttribute('data-queued', '1');
    await expect(page.locator('.hud-build__queue-count')).toHaveText(QUEUE_COUNT_ONE);
    await expect(band).toBeHidden();
  });
});
