import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from './network-changed-fixture';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { procurableMaterial } from '../../src/content/procurement-catalog';
import { defaultRoomContentRegistry } from '../../src/content/room-catalog';
import { SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { TILE_SIZE_PX } from '../../src/rendering/tile-metrics';
import { defaultMessageCatalogEn, formatNumber } from '../../src/services/localization';
import {
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  TREASURY_STARTING_BALANCE_MINOR_UNITS,
  rungFloorMinorUnits,
} from '../../src/simulation/economy';
import { staffHireCostMinorUnits } from '../../src/simulation/staff';
import { HUD_TAB_IDS, PRISONER_ROSTER_ROW_LIMIT, STAFF_ROSTER_ROW_LIMIT } from '../../src/ui/hud';
import { EVENT_BAND_HOLD_CEILING_MS } from '../../src/ui/hud/event-band-dwell';

/**
 * Real-browser verification for the *assembled application* — `index.html`
 * plus `src/main.ts`, i.e. the renderer (#69) and the mounted HUD (#73)
 * running together over real storage and real HTTP.
 *
 * Every other spec in this directory drives a purpose-built harness page.
 * That is the right shape for a module under test, but it means nothing so
 * far has ever loaded the page a player loads. Fifteen claims only exist once
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
 * 15. **A command press leaves the keyboard somewhere a player can use.**
 *    Every command-issuing control in the HUD shares one `BusyGroup`, which
 *    disables all of them while a command is in flight -- and a disabled
 *    element is blurred by the browser, which re-enabling does not undo. So
 *    every command in the game returned a keyboard player to the top of the
 *    document. The rules for giving focus back are pure predicates and are
 *    proven headlessly (`tests/unit/ui-focus-handoff.test.ts`,
 *    `tests/unit/ui-async-action-gate.test.ts`); what only a browser can
 *    settle is that `disabled` and `hidden` really blur, that
 *    `document.activeElement` really lands on `<body>`, and that the one group
 *    really is wired to the status strip, four HUD panels and a save panel
 *    mounted into the HUD by `bootPersistence` -- which no harness page has all
 *    of at once. The Rooms panel's *Designate* is in the same test for the
 *    opposite reason: it hides itself before it dispatches, so the group never
 *    sees it hold focus and the hand-off has to come from the panel.
 *
 * 16. **The status strip shows every chip the screen has room for.** The
 *    metrics row is the strip's only flexible member, so everything else on
 *    that line is subtracted from it -- and on the assembled page that is
 *    727.4px, a third of it the brand slot `src/main.ts` fills and
 *    `ui-harness.ts` leaves empty. At 768px the row was 41px wide and showed
 *    **none** of its eight chips, with the scrollbar suppressed in both
 *    engines so nothing said so (#634). Only the assembled page carries the
 *    chrome that causes it: #634 measured 524px on the harness against 173px
 *    here, same viewport.
 *
 * Deliberately NOT here, because a headless test already proves it and a
 * browser test that repeats one costs a minute of CI and adds no evidence:
 * the tab/collapse state machine, the view-model → display mapping and the
 * async-action gate (`tests/unit/ui-*.test.ts`); the HUD's computed font
 * stack and intent reporting (`tests/browser/ui-shell.spec.ts`, which drives
 * the same real `mountHud`);
 * camera transforms, depth ordering, pose selection, pivot placement and the
 * world projection (`src/rendering/**` unit tests, all Phaser-free by
 * design); and atlas manifest/registry schema rejection
 * (`tests/contract/runtime-atlas-validation.test.ts`).
 *
 * **That list used to include "responsive layout", and #634 refuted it rather
 * than carving out an exception.** The reason it was there is sound -- the
 * harness "drives the same real `mountHud`" -- and it is not sufficient: the
 * harness mounts the same *HUD* into a different *page*, and the strip's
 * layout is decided by what the page put in `brandSlot`. It is marked here
 * rather than overwritten because the reasoning that put it there will look
 * correct again to the next reader. Responsive claims that do not depend on
 * the composition root still belong in `ui-shell.spec.ts`; claim 16 is the
 * one that does.
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
        /** The role a `HireStaff` names (ADR 0025), read by `hiresSent`. */
        readonly staffRoleId?: string;
        /** The anchor tile a `PlaceObject`, `RemoveObject` or `RemoveWall` names (ADR 0028, ADR 0106). */
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
    readonly counts: Record<string, number | boolean>;
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
      // The twenty-second count (2026-09-15), and the first boolean on this
      // channel: `RoomInstanceRegistry.totalResidentCapacity === 0`, ADR 0017's
      // "Amendment, 2026-09-01" §2. Required for the same `.strict()` reason
      // as the fields around it.
      //
      // **Deliberately `false` against a `roomCapacity` of 48, and the pair is
      // the fixture's own idiom.** The host derived this predicate from
      // `roomCapacity === 0` until 2026-09-15, and that derivation cannot see a
      // room instance registered under a room-catalog id the content registry
      // does not define -- so a host that reached for `roomCapacity` again
      // would be visible on the prison where they come apart
      // (`tests/integration/economy-fresh-unfurnished-prison-definition.test.ts`)
      // rather than plausible. This prison is furnished on both readings.
      isFreshUnfurnishedPrison: false,
      // Required, not optional, for the reason the paragraph above and the
      // note on `stateIncomeAccruedTodayMinorUnits` below both give: the
      // counts payload is `.strict()`, so a fixture missing this field is
      // dropped whole by `decodeWorkerToMainMessage` and every assertion after
      // the injection fails on a strip that was never updated.
      //
      // 40 of the 48 registered sleep surfaces stand in rooms intake would
      // house somebody in; the other 8 are an infirmary's medical beds, which
      // raise the room total and no denominator. Deliberately *not* 48, so a
      // mapping that reached for `roomCapacity` would be visible here rather
      // than plausible.
      //
      // 37 prisoners against 40 places is 92.5%, so the Prisoners chip now
      // gains its occupancy bar and a `warning` tone under this fixture. That
      // is the point of the change -- `prisonerCapacity` was the literal 0 and
      // `occupancyTone` could never fire -- and it is visible in the DOM as a
      // `.hud-metric__trailing` bar and `data-tone="warning"` on
      // `[data-metric="prisoners"]`. The value assertions below read
      // `.ui-stat__value`, which is the chip's own number and a sibling of the
      // bar, so they are unaffected.
      accommodationCapacity: 40,
      roomOccupants: 30,
      // The nineteenth count (issue #585): the residency places that currently
      // exist, which is what `StateIncomeSystem` pays for. Required for the
      // same `.strict()` reason as the fields around it.
      //
      // **Deliberately the same figure as `roomOccupants` above**, which is the
      // opposite of what this file does with `roomCapacity`/
      // `accommodationCapacity` and is worth the sentence. The two counts
      // diverge only when a place stops existing under a sitting resident, and
      // that divergence is measured through real commands in
      // `tests/integration/economy-occupied-place-exists.test.ts` ("two
      // residents over one remaining bed, in one cell"). Here it would buy
      // nothing and cost something: `stateIncomeAccruedTodayMinorUnits` below
      // is derived from this number and its 4,631 is asserted in the DOM, so
      // splitting the two would move a figure this fixture exists to render.
      // When a chip reads `occupiedPlaces` -- issue #609's surface, not this
      // one -- separating them here becomes worth doing.
      occupiedPlaces: 30,
      // Required for the same reason `accommodationCapacity` above is: the
      // counts payload is `.strict()`, so a fixture missing one of these three
      // is dropped whole by `decodeWorkerToMainMessage` and every assertion
      // after the injection fails on a strip that was never updated. That is
      // exactly how this test failed when issue #588 added them.
      //
      // Three distinct figures summing to 37, this payload's own `prisoners`,
      // so a chip that read the wrong rung -- or derived one by subtracting the
      // others from the population -- renders a number this fixture never gave
      // it. 4 unguarded makes the chip's tone `danger` and its badge the
      // `hud.status.coverage-detail` sentence rather than the "Covered"
      // fallback, which is the branch worth exercising in a real DOM.
      prisonersCovered: 25,
      prisonersUnderstaffed: 8,
      prisonersUnguarded: 4,
      activeIncidents: 2,
      contrabandDiscovered: 5,
      treasuryMinorUnits: 31_500,
      // Derived from this payload's own `tick` and `occupiedPlaces` rather
      // than picked: thirty occupied places, 1,235 ticks of the day served,
      // `floor(300 x 30 x 1235 / 2400)` = 4,631 (#29). Required, not optional
      // -- the counts payload is `.strict()`, so a fixture missing this field
      // is dropped by `decodeWorkerToMainMessage` and every assertion below it
      // fails on a strip that was never updated at all.
      stateIncomeAccruedTodayMinorUnits: 4_631,
      // The fourteenth and fifteenth counts (ADR 0042 step 3), and required
      // for the third time for the same reason the two notes above give: the
      // counts payload is `.strict()`, so a fixture missing either field is
      // dropped whole by `decodeWorkerToMainMessage` and every assertion after
      // the injection fails on a strip that was never updated. That is exactly
      // how this test failed when payroll landed -- `[data-metric="prisoners"]`
      // stuck at `0`, which reads like a broken HUD and is a rejected message.
      //
      // Chosen so neither could be mistaken for something else in the payload:
      // 480 is not derivable from the six staff (`6 x 80` is a coincidence this
      // fixture would rather not invite, so it is not 480 for that reason --
      // the roster behind an injected payload does not exist), and 1,700 is not
      // a share of `treasuryMinorUnits`. Both are deliberately non-zero:
      // nothing renders them yet, so a zero here would be indistinguishable
      // from the field being absent again.
      dailyWageBillMinorUnits: 620,
      unpaidWagesMinorUnits: 1_700,
    },
    // Required since #1370, for the `.strict()` reason every count above
    // gives: a publication without it is dropped whole by the decoder. Undo
    // live and Redo not -- the pair a prison that has just placed something
    // publishes.
    editHistory: { undo: true, redo: false },
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
 * Waits for the session `New prison` starts to *exist* before anything is
 * asked of it.
 *
 * **A precondition, not patience** -- the distinction issue #470 turns on.
 * `New prison` returns the instant the click is dispatched;
 * `SessionController.createPrison` then writes the save row, claims a worker
 * and awaits the `simulation/ready` reply to `simulation/initialize`, and only
 * that reply sets `SimulationCommandSender.ready`
 * (`src/ui/simulation-commands.ts`, the `'simulation/ready'` branch of
 * `observe`). The transport controls are live throughout that window and are
 * *meant* to be: `still mounts the interface when the simulation worker cannot
 * start (#82)` in this file asserts that a transport press with no simulation
 * refuses rather than doing nothing, and `src/main.ts`'s `set-clock` branch
 * says why -- "a pause button that reports success and does nothing is a lie
 * the player has no way to detect".
 *
 * So a Play pressed inside that window throws `No simulation session is
 * running yet, so the clock cannot be changed.`, `mountHud`'s `reportError`
 * marks the button `data-action-failed="true"` and points its
 * `aria-describedby` at the refusal line -- and **nothing retries the press**,
 * because a host refusal clears only when the same action later succeeds. The
 * clock never starts and `aria-pressed` stays `"false"` for the whole budget.
 * That is exactly the DOM #470 records from CI, and #425 before it, where the
 * same test spent its 15s poll reporting "the simulation never advanced".
 *
 * Measured rather than assumed: the handshake takes ~186ms on an idle
 * container, and delaying only the worker's `simulation/initialize` reply --
 * with Playwright running at full speed -- turns the unguarded sequence red at
 * 250ms and green again at 100ms. A loaded CI runner sits on the wrong side of
 * that.
 *
 * The condition is the worker's own first clock publication. `.hud-clock__day`
 * reads `--` until a session reports one: `EMPTY_HUD_VIEW_MODEL.clock` is
 * `UNKNOWN_HUD_CLOCK` with `day: 0` and `dayLengthTicks: 0`, and `displayDay`
 * returns `undefined` below day one. `aria-pressed` on Pause is **not** usable
 * for this -- `UNKNOWN_HUD_CLOCK.mode` is already `'paused'`, so it reads
 * `"true"` at first paint with no session behind it. Every clock publication
 * follows `simulation/ready` on the same channel, so a day of `1` is proof the
 * sender is ready.
 *
 * The two cases in this file that have never failed this way already wait on
 * exactly these two values before pressing Play; this is that pattern given a
 * name and applied to the three that did not.
 */
async function waitForSession(page: Page): Promise<void> {
  await expect(
    page.locator('.hud-clock__day'),
    'the prison was never created, so no clock could be set',
  ).toHaveText('1');
  await expect(page.locator('.hud-clock__day-progress')).toHaveText('0%');
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
  type: 'PlaceObject' | 'RemoveObject' | 'RemoveWall',
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

/**
 * Every `HireStaff` the page has posted, the sibling of `purchasesSent` above
 * and for the same reason: the `hire-staff` pre-flight throws *instead of*
 * submitting, so "nothing left this thread" is a claim only the tee can settle.
 */
async function hiresSent(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    ((window as unknown as CommandTeeWindow).lockstateSentToWorker ?? [])
      .map((message) => message as SubmittedCommand)
      .filter((message) => message.kind === 'simulation/submit-command')
      .filter((message) => message.payload?.command?.data?.type === 'HireStaff')
      .map((message) => message.payload?.command?.data?.staffRoleId ?? ''),
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

/**
 * **Presses Buy for a total the published balance cannot cover, and asserts
 * the two things that have to be true of the control before it is pressed.**
 *
 * ## Why an unaffordable press needs its own helper (issues #772, #799)
 *
 * Since #772 the Buy button carries the *same* affordability verdict the
 * press is judged against (`pressAffordabilityVerdict`,
 * `src/ui/affordability.ts`), so a control about to be refused says so before
 * the press. PR #799 first wrote that verdict onto the `disabled` property,
 * which removed the press -- and the press is the only route to
 * `hud.refusal.purchase-materials-past-floor`, the sentence the owner
 * authored under ruling 18 of 2026-08-31 for this exact limit. The three
 * purchase tests below all press an unaffordable quantity on purpose and all
 * three timed out on `element is not enabled`. The narrowing of 2026-09-02
 * moved the verdict to `aria-disabled`: advised against, still pressable,
 * still refused, still explained.
 *
 * So each of the two assertions here is load-bearing in a different
 * direction, and neither is a restatement of the other:
 *
 *   - `aria-disabled="true"` is #772 itself. Drop it and the control is back
 *     to saying nothing before the press.
 *   - `disabled` staying `false` is what keeps this refusal reachable. Drop
 *     it and every assertion after the press in all three tests becomes
 *     unreachable UI. **Nothing is in flight here** -- each caller has already
 *     waited out whatever it dispatched before -- so this reads the panel's
 *     own opinion and not `createBusyGroup`'s, which holds every command
 *     control disabled while one is in flight
 *     (`src/ui/primitives/async-action.ts`).
 *
 * ## Why `force: true`
 *
 * Playwright's actionability treats `aria-disabled="true"` on a `button` as
 * not-enabled -- `elementState(node, 'enabled')` calls `getAriaDisabled`,
 * which is `isNativelyDisabled(el) || hasExplicitAriaDisabled(el)`
 * (`playwright-core` 1.56.1, `injectedScriptSource.js`) -- so a plain
 * `click()` would wait out the timeout on a control a real pointer activates
 * immediately. `force` skips *that wait* and nothing else: it still dispatches
 * real mouse events at the element's box, which is why it does **not** paper
 * over a regression to a hard `disabled` -- a `disabled` button receives those
 * events and fires no `click`, so the refusal assertions after the press would
 * fail. `pressable` below says the same thing one step earlier and with a
 * better message.
 *
 * ## Why one `evaluate` and not two `expect(locator)` matchers
 *
 * Because these three tests have about four seconds of headroom against a 60s
 * timeout and a `toHaveAttribute` costs about one second of it on a loaded
 * container -- measured on 2026-09-02 at load average 10, where two separate
 * matchers plus the real press took test 2 to 60.3s and the assertions
 * *after* the press ran during teardown. The two bits are read in one round
 * trip instead, which also makes them one reading of one instant rather than
 * two readings of two. Polled rather than read bare, because a repaint the
 * caller's own `await` did not settle would otherwise be a race read as a
 * regression; the first attempt succeeds when the state is already right, so
 * the cost is the single round trip.
 */
async function pressBuyExpectingRefusal(page: Page): Promise<void> {
  const buy = page.locator('.hud-build__buy-submit');
  await expect
    .poll(async () => readBuyAvailability(page), {
      message:
        'before an unaffordable press the Buy button must say it cannot act (#772) and must still be pressable, or the refusal that explains it is unreachable (#799)',
    })
    .toEqual({ saysItCannotAct: true, pressable: true });
  await buy.click({ force: true });
}

/**
 * The two bits `pressBuyExpectingRefusal` compares, in one round trip.
 *
 * `saysItCannotAct` is `aria-disabled`, which is what the affordability
 * verdict writes (`paintBuyTotal`, `src/ui/hud/build-panel.ts`).
 * `pressable` is the `disabled` property, which the verdict must not write --
 * `createBusyGroup` owns it and holds every command control while one is in
 * flight (`src/ui/primitives/async-action.ts`), so a reading taken while
 * something is in flight says nothing about the panel's own opinion. Every
 * caller below takes it with the page settled.
 */
async function readBuyAvailability(page: Page): Promise<{ saysItCannotAct: boolean; pressable: boolean }> {
  return page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('.hud-build__buy-submit');
    return {
      // A missing button is neither: there is no control saying anything and
      // nothing to press, and both defaults fail an assertion rather than
      // satisfying one.
      saysItCannotAct: button?.getAttribute('aria-disabled') === 'true',
      pressable: button !== null && !button.disabled,
    };
  });
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
 * `TILE_SIZE_PX` is 64 and the camera starts at zoom 1, so 192px is three tiles
 * of *travel* and 128px two -- both rectangles with two real axes, which is what
 * is being proven. `steps` matters for the same reason it does above: the scene
 * reads the gesture from pointer *movement*, so a single jump would work and
 * would not resemble a hand.
 *
 * **That sentence read "192px is a three-tile side" and the side is four.**
 * Both corners of a drag are inclusive (`tileRectFromDrag`), so three tiles of
 * travel covers four tile columns -- measured, `6,11 4x4` from a 192px gesture
 * at 1280x800. The half about travel is kept because it is the number this
 * constant is in, and the correction is marked rather than overwritten because
 * the two are one step apart and the wrong one was read off this comment. What
 * makes it checkable rather than a promise is `tileSpanOfGesture`, which every
 * drag through `drawRoomRectangle` is now asserted against.
 */
const ROOM_DRAG_DELTAS_PX = [192, 128] as const;

/**
 * The side a caller uses when the *number of wall segments* is what it is
 * paying for, rather than the rectangle.
 *
 * 128px is the second entry above, so this is a preference and not a new
 * pixel figure: `tileSpanOfGesture` makes it a 3x3 room where 192px makes a
 * 4x4 one, and `drawRoomRectangle` asserts that against the panel either way.
 *
 * ### Why a smaller room is worth a constant of its own
 *
 * `perimeterSegments` is a perimeter, so it grows with the side and the orders
 * grow with it: two 4x4 cells a tile apart are **32** segments and two 3x3
 * cells are **23** (12 + 12, less the one they share when the second lands on
 * the first's south row -- measured, `6,11 3x3` and `8,14 3x3` at 1280x800).
 * Each of those orders is fourteen or four keyboard hops through a page whose
 * renderer every press queues behind, which is the cost `#1008` measured and
 * `wallRectanglesFromTheKeyboard` records above: on a host without a GPU an
 * order costs ~3.1 s, so nine fewer of them is ~28 s of a 180 s test.
 *
 * **Measured on this container, 2026-09-08, `-g "#331"` with one worker and
 * nothing else running.** The whole test, end to end, as Playwright reports
 * it: **174 s at 4x4 against `test.slow()`'s 180 s cap, and 132 s at 3x3.** The
 * wall phase alone is 139.3 s and 100.4 s of that, with the order loop 99.0 s
 * and 67.9 s -- the crew is 30.0 s and 22.2 s and was never the wait. Six
 * seconds of margin becomes forty-eight.
 *
 * ### What it does not buy back
 *
 * The margin, not the cost. A press still costs what the renderer costs, and a
 * host slow enough to spend 180 s on 23 orders would fail this the same way --
 * see `#1008`, which is about the budget and stays open for it. This constant
 * stops `#331` being the first test to run out on an ordinary CI host; it does
 * not make the keyboard route cheap.
 *
 * **The last clause held for four days and no longer does, and the paragraph
 * is kept because its first clause is the part that was tested and failed.**
 * `5a761322` was not enough: the first `browser` job on this runner pool ever
 * allowed to finish (run 34215508642, `422 passed, 1 failed`) had this test
 * exceed the 180 s cap with the smaller rooms already in place. What the
 * route's cost turned out to be made of is two things this constant cannot
 * touch -- Shift's own key events, and the number of pixels a software
 * rasteriser repaints between one press and the next -- and both are now cut,
 * by `withTabKey` and by `WallOrderOptions.orderAt`. The rooms are still 3x3
 * and the perimeter is still 23: this constant is not withdrawn, it is simply
 * no longer the only cut in the test.
 *
 * ### Why only the one caller uses it
 *
 * The other `wallRectanglesFromTheKeyboard` callers wall a **single** cell --
 * 16 segments at 4x4 -- and the two other `dragRectangleOnWorld` callers never
 * build walls at all and run at 375x812, where what a drag can find is a
 * different question (see `wholeSquare`'s note). Nothing is gained by making
 * their rectangles smaller and their measurements would move, so
 * `ROOM_DRAG_DELTAS_PX` stays the default and this is asked for by name.
 */
const SMALL_ROOM_DRAG_DELTAS_PX = [128] as const;

/**
 * The panel's arrival height, per viewport, so "the phone was not fixed by
 * moving the desktop" is a number rather than a hope.
 *
 * Measured on the assembled page, Rooms tab, one prison saved, before and after
 * the fold landed -- identical in both, which is the claim. The panel is the
 * rail's flexible member, so its height is where any change to the save panel,
 * the strip, the tab bar or either panel's floor would show up.
 *
 * **`375x812` moved from 451.1 to 441 in #545, and the 10.1px is the strip's,
 * not this panel's.** The number is a change *detector*, so a change to it has
 * to come with the measurement that caused it; this one is a defect being paid
 * off rather than a budget being spent, and it was found by this assertion
 * going red.
 *
 * `.hud-strip` used to be `height: var(--hud-strip-height)` -- a *fixed*
 * height. At 375px the strip wraps to three rows, and measured on `origin/main`
 * (ec10451, second worktree, this page and this prison) those rows are
 * 100.5px of content inside an 88px box:
 *
 *     .hud-strip__brand      225.1x19   @8,-6.7
 *     .hud-strip__metrics    359x29.5   @8,16.3
 *     .hud-strip__clock      179x16     @8,63.8
 *     .hud-strip__transport  172x44     @195,49.8
 *
 * `align-content: center` splits the 12.5px overflow between the two ends, so
 * **the brand badge is laid out at y = -6.7, above the strip's own background
 * band**, and the transport row's last 5.8px is drawn over the rail beneath.
 * The strip was borrowing 12.5px it had never been given, and this panel was
 * one of the things lending it.
 *
 * #545 needed the strip to be able to grow -- at 125 % and above it wraps at
 * every width, and a fixed height would have spilled whole rows over the rail
 * -- so it is `min-height` now. The box then contains its own rows (101.5 for
 * 100.5 at 375x812) and the borrowed pixels go back to the rail, where the
 * aside slot's `min-height: 25%` turns 12.5px of rail into 10.1px off this
 * panel. `every interface scale step keeps the HUD inside the viewport it is
 * drawn in (#545)` asserts the containment directly, so the fix is guarded
 * rather than merely recorded here.
 *
 * The other two viewports are unchanged: the strip does not wrap at 900px or
 * 1280px, so it never overflowed there.
 *
 * **`1280x720` moved from 420.1 to 397.3 in #634, and the sentence above is
 * now half true.** It still does not *overflow* at either width -- that was
 * #545's point and it holds -- but it does now **wrap** at 1280, deliberately:
 * `hud.css` gives `.hud-strip__metrics` a row of its own below 1920px, because
 * on one row the readout was 553px of 1101px there and 41px at 768. The strip
 * is 48px on one row and 78.5px on two, and 22.8px of that 30.5px lands on
 * this panel by the same `min-height: 25%` route the paragraph above
 * describes. 900x600 keeps 338.1 because the rule carries `min-height: 701px`
 * -- see `hud.css` for why a short viewport cannot pay for the second row --
 * and 375x812 keeps 441 because that viewport already wrapped.
 *
 * The sentence above is left standing rather than rewritten because its
 * *reason* is still the reason, and a reader who meets only the correction
 * would not know what 900x600 is still exempt from.
 *
 * **`1280x720` moved 397.3 -> 395.6 and `375x812` 441 -> 439.3 in #1158, and
 * both 1.7px are the strip's again.** Stage 2 of the identity rollout took
 * body and value type from 13px to 15px (ADR 0112 decision 4, the owner's
 * ruling of 2026-09-13). This panel is **not** one of the surfaces that took
 * it -- `tokens.css` pins `.hud-rooms` to the denser step, because at 15px
 * its own body measured 15px shorter than its content at 900x600 -- so every
 * pixel here arrives from upstream, exactly as the 375x812 entry above
 * describes for #545.
 *
 * The arithmetic, measured on this page and this prison in two worktrees, the
 * unmodified base at `a6565239` against the branch:
 *
 *     viewport    strip           rail            aside          this panel
 *     1280x720    78.5 -> 80.7    572.3 -> 570.1  143.1 -> 142.5  397.3 -> 395.6
 *     900x600     48.0 -> 48.0    482.8 -> 482.8  120.7 -> 120.7  338.1 -> 338.1
 *     375x812    101.5 -> 103.7   641.3 -> 639.1  160.3 -> 159.8  441.0 -> 439.3
 *
 * The strip grows 2.2px wherever it grows at all, because its rows are one
 * line of body type taller; the middle grid row loses the same 2.2; and the
 * aside slot's `min-height: 25%` keeps taking its quarter, so 1.7 of the 2.2
 * lands here. **900x600 does not move at all**, because `--hud-strip-height`'s
 * 48px floor is still above the strip's content there -- the same reason that
 * viewport sat out #634.
 *
 * So this is a budget being spent rather than a defect being paid off, which
 * is the other of the two cases the paragraph at the top of this block names,
 * and it comes with the measurement that caused it as that paragraph requires.
 *
 * **`1280x720` moved 395.6 -> 447.5 and `900x600` 338.1 -> 390 in #1159, and
 * `375x812` did not move at all. Every one of those 51.9px is the tab bar's,
 * and this is the first entry here where the panel is *given* height rather
 * than lending it.**
 *
 * Stage 3 of the identity rollout moves the five sections from the bottom row
 * to a left column at tablet and desktop widths -- the delivery's own layout
 * for those tiers, *"tablet/desktop mają mapę między bokami"*. `.hud__tabs`
 * stops being `grid-area: tabs` and becomes a second occupant of `middle`
 * beside `.hud__corner` and `.hud__rail`, so the `tabs` row is `auto` around
 * nothing and costs 0 instead of 69.2px. The middle row gains all of it and
 * the rail passes it down by the same `min-height: 25%` route every entry
 * above describes.
 *
 * The chain, measured on this page and this prison in one worktree, the base
 * commit `5e1a96de` against the branch:
 *
 *     viewport    strip            rail             aside            this panel
 *     1280x720    80.7 -> 80.7     570.1 -> 639.3   142.5 -> 159.8   395.6 -> 447.5
 *     900x600     48.0 -> 80.7     482.8 -> 519.3   120.7 -> 129.8   338.1 -> 365.5
 *     375x812    103.7 -> 103.7    639.1 -> 639.1   159.8 -> 159.8   439.3 -> 439.3
 *
 * **375x812 sits it out because a phone keeps its bottom bar**, which is the
 * delivery's layout for that tier and `navigationPlacement`'s answer for it --
 * so the `tabs` row is still 69.2px there and nothing upstream moved.
 *
 * **900x600 gains less than the other desktop width, because it spends some of
 * it, and that is the interesting row.** Its strip takes a second line here for
 * the first time: `hud.css`'s metrics-row query carried `(min-height: 701px)`
 * under a comment saying a short viewport could not pay for the 30.5px a
 * second row costs, and with 69.2px of tab bar handed back it can. That buys
 * what #634 is about -- the Layout menu's 52px gutter had left the metrics
 * 83.7px of a single-row strip, too narrow for one chip, and a row of their own
 * gives them the strip's full width. Net at that viewport: 36.5px more rail
 * than before this stage and every chip that fits on screen.
 *
 * The phone row is also a correction this branch made to itself and is worth
 * the sentence. It first measured 103.7 -> 124.2, because the same gutter
 * rewrapped the phone strip's three rows -- 20.5px out of the rail and 15.3px
 * off this panel. The gutter is dropped below 720px, where the strip's first
 * row ends at x = 233 and the slot's 52px start at 323, so it overlays empty
 * strip instead of taking a reservation nobody needed.
 *
 * **`375x812` MOVED 439.3 -> 447.7 ON 2026-09-16, AND IT IS THE PHONE'S TURN
 * TO BE GIVEN HEIGHT RATHER THAN TO LEND IT.** The entry above says the phone
 * *"sits it out because a phone keeps its bottom bar"*; it keeps the bar and
 * the bar got shorter. The owner ruled that below 721px a tab shows its icon
 * and not its name (#1192), so `.ui-tab__label` is `.ui-sr-only` there and the
 * `.ui-tab` floor drops 64px -> 56px.
 *
 * The chain, measured on this page in one worktree, both arms of one run
 * (`tests/browser/playtest-1192-icon-only-tabs.playtest.ts`):
 *
 *     viewport    tab bar          rail             this panel
 *     375x812     69.2 -> 58.0     639.1 -> 650.3   439.3 -> 447.7
 *
 * 11.2px comes off the `tabs` row, the middle row takes all of it, and
 * `.hud__aside`'s `min-height: 25%` keeps 2.8 of it (159.8 -> 162.6) exactly
 * as every entry above describes -- which leaves the 8.4 this number moved by.
 * The other two viewports do not move, because the rule is inside
 * `@media (max-width: 720px)`.
 *
 * **`375x812` MOVED 447.7 -> 429 ON 2026-09-22 (#1356), AND IT IS LENT TO THE
 * ONE TOUCH ROUTE UNDO AND REDO HAVE.** Until #1356 the pair was `KeyZ` and
 * `KeyY` and nothing else, so a phone could take back nothing. The strip's new
 * Undo and Redo buttons sit in its top-right corner below 721px, beside the
 * Layout button, and the first strip row -- the brand badge alone, 19px -- is
 * floored at one tap target so the second row starts below them. That is the
 * cheapest arrangement measured: in flow the pair took a strip row of its own
 * (103.7 -> 151.7) and moved `.save-panel` over the centre of the screen, and
 * sharing the counters' row broke #634. `hud.css`'s note on
 * `.hud-strip__history` below 720px carries the rest.
 *
 * The chain, measured on this page in two worktrees, `main` at `4a7215f7`
 * against the branch:
 *
 *     viewport    strip            rail             aside            this panel
 *     375x812    103.7 -> 128.7    650.3 -> 625.3   162.6 -> 156.3   447.7 -> 429
 *
 * 25px comes out of the middle row; `.hud__aside`'s `min-height: 25%` gives up
 * 6.3 of it and this panel the other 18.7. The two desktop viewports do not
 * move: there the pair rides the strip's first row, out of the clock group's
 * `flex: 1` stretch.
 */
const ARRIVAL_PANEL_HEIGHT_PX: Readonly<Record<string, number>> = {
  '1280x720': 447.5,
  '900x600': 365.5,
  '375x812': 429,
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

/**
 * How finely `dragRectangleOnWorld`'s `wholeSquare` scan samples a candidate
 * gesture, in CSS pixels.
 *
 * 16, which is the same step the scan itself walks the page in, so the lattice
 * is the scan's own grid rather than a second number -- and it is a quarter of
 * `TILE_SIZE_PX`, so no tile of a candidate rectangle goes unsampled on either
 * axis. Nothing this is aimed against is anywhere near that small: the HUD
 * islands that swallow a pointer are whole panels, the narrowest of them
 * `.hud-rooms` at 264px wide (measured at 1280x800).
 */
const BARE_SQUARE_SAMPLE_STEP_PX = 16;

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
  /**
   * Strip to the rail's first box, that box to the Rooms panel, Rooms panel to
   * the tab bar.
   *
   * The first term used to name the *save panel* specifically, and #545 put
   * something above it: the interface-scale row is the aside slot's first
   * child now. The claim being pinned was never about which panel is first --
   * it is the rail's rhythm, "the rail's contents start 8px under the strip"
   * -- so the term reads the slot's first child and the pinned `[8, 16, 24]`
   * is unchanged rather than re-recorded. Naming the panel would have turned a
   * statement about spacing into a statement about composition.
   */
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
    // The rail's first box, whatever it is. Before #545 that was always the
    // save panel; the interface-scale row sits above it now. See
    // `gapsBetweenPanels`.
    const railFirst = document.querySelector<HTMLElement>('.hud__aside > *') ?? save;
    const gaps =
      panelRect === null || strip === null || save === null || railFirst === null || tabs === null
        ? []
        : [
            round(railFirst.getBoundingClientRect().top - strip.getBoundingClientRect().bottom),
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
 *
 * ### Why it hands back the gesture rather than a yes
 *
 * It used to answer `boolean`, and a caller could then only ask *whether* a
 * rectangle was drawn -- never where the hand went or how far. That is the
 * missing half of every question in this area: the gesture is in **CSS pixels**
 * and every rule a room is judged by is in **tiles**, so a caller that cannot
 * see the pixels cannot check the conversion, and one that cannot see where the
 * press landed cannot place a second rectangle clear of the first. Both of
 * those went wrong at once in #658 (see `drawRoomRectangle` below), and neither
 * was visible from a `true`.
 *
 * `null` still means what `false` meant: there was no square of bare world to
 * draw in, which is a measurement and not a failure -- see the paragraph above.
 *
 * ### `wholeSquare`, and the measurement that made it necessary
 *
 * The scan's default is three points on a diagonal -- press, midpoint, release
 * -- and the paragraph below calls that coarse on purpose. It is coarse in a
 * direction that matters to any caller which draws the *same* rectangle twice:
 * a square whose three diagonal points are canvas may still lie mostly under a
 * HUD island, and an island that later grows takes the aim point with it.
 *
 * **Measured on 2026-09-05, at 1280x800, on the branch that added the first
 * acknowledgement (#966 site 2).** The second room drag of the `#331` spec
 * aimed at `(328,344)`, which was bare canvas by **3.8px** -- the bottom-left
 * minimap panel's top edge was at `347.8`. Designating the first room put a row
 * in the alerts list inside that panel, the list went `32px -> 60px`, and
 * `.hud__corner` grew upward from `y=334.8` to `y=306.8` (its bottom pinned at
 * `730.8`). `elementFromPoint(328,344)` then returned `h2.ui-panel__title`, the
 * scan slid right to `(424,344)`, and the drag drew `12,15 4x4` where its walls
 * had been built around `11,15 4x4`.
 *
 * The canvas did not move: `0,0 1280x800`, attributes `1280x800`, identical
 * before and after. What moved was how much world a HUD island covers.
 *
 * So `wholeSquare` asks the question the caller actually has -- *is this square
 * world?* -- by sampling the whole gesture on a 16px lattice instead of three
 * points on its diagonal. The aim it returns is then bounded by the islands'
 * horizontal extent rather than by an island's top edge, and a panel that grows
 * upward by a row cannot slide it. That is a stronger property than the default
 * and not a proof: nothing here can promise a square stays bare, which is why
 * `drawRoomRectangle` still asserts the rectangle it drew rather than trusting
 * the aim.
 *
 * **Off by default, and the two other callers are the reason.** Both drag once,
 * never redraw, assert only `not.toBeNull()`, and run at 375x812 where
 * `.hud-minimap`'s `calc(396px * var(--ui-scale))` is wider than the viewport --
 * so a strictly bare square is a different and much scarcer thing there, and
 * tightening what they aim with would change what they measure. Only a caller
 * that has to hit the same tiles twice needs this.
 */
async function dragRectangleOnWorld(
  page: Page,
  options: {
    readonly minY?: number;
    readonly wholeSquare?: boolean;
    /** Sides to try, in order. Defaults to `ROOM_DRAG_DELTAS_PX`; see `SMALL_ROOM_DRAG_DELTAS_PX`. */
    readonly deltas?: readonly number[];
  } = {},
): Promise<WorldDragGesture | null> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('the viewport size is needed to aim the drag');

  // A coarse scan of the world: the first point whose whole gesture -- press,
  // midpoint and release -- lands on the canvas wins. Coarse on purpose; this is
  // aiming at open ground, not measuring a boundary, and a fine grid would spend
  // hundreds of round trips to find the same point.
  //
  // `wholeSquare` trades that coarseness for a lattice over the whole square,
  // for the reason recorded above. Both forms are one `evaluate` -- the cost is
  // `elementFromPoint` calls in the page, not round trips -- and both stop at
  // the first point that is not canvas, so a candidate under an island is
  // rejected on its first or second sample.
  const aim = await page.evaluate(
    ({ width, height, deltas, minY, wholeSquare, step }) => {
      const free = (x: number, y: number): boolean =>
        document.elementFromPoint(x, y)?.tagName.toLowerCase() === 'canvas';
      // Inclusive on both axes, and the last offset is the exact far edge rather
      // than the last multiple of `step` below it: the release point is a corner
      // of the square and is exactly where a drag ends.
      const offsetsWithin = (delta: number): number[] => {
        const offsets: number[] = [];
        for (let d = 0; d < delta; d += step) offsets.push(d);
        offsets.push(delta);
        return offsets;
      };
      const bare = (x: number, y: number, delta: number): boolean => {
        if (!wholeSquare) return free(x, y) && free(x + delta / 2, y + delta / 2) && free(x + delta, y + delta);
        const offsets = offsetsWithin(delta);
        for (const dy of offsets) {
          for (const dx of offsets) {
            if (!free(x + dx, y + dy)) return false;
          }
        }
        return true;
      };
      for (const delta of deltas) {
        for (let y = Math.max(8, minY); y + delta < height - 8; y += 16) {
          for (let x = 8; x + delta < width - 8; x += 16) {
            if (bare(x, y, delta)) {
              return { x, y, delta };
            }
          }
        }
      }
      return null;
    },
    {
      width: viewport.width,
      height: viewport.height,
      deltas: [...(options.deltas ?? ROOM_DRAG_DELTAS_PX)],
      minY: options.minY ?? 8,
      wholeSquare: options.wholeSquare ?? false,
      step: BARE_SQUARE_SAMPLE_STEP_PX,
    },
  );

  if (aim === null) return null;

  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(aim.x + aim.delta / 2, aim.y + aim.delta / 2, { steps: 6 });
  await page.mouse.move(aim.x + aim.delta, aim.y + aim.delta, { steps: 6 });
  await page.mouse.up({ button: 'left' });
  return aim;
}

/**
 * The gesture `dragRectangleOnWorld` actually made, in **CSS pixels**.
 *
 * Where the press landed and how far the hand travelled on each axis -- the
 * square's side, taken from `ROOM_DRAG_DELTAS_PX`. This is the one thing in
 * this area that is measured in pixels; everything the game then says about
 * the rectangle is measured in tiles, and `drawRoomRectangle` is where the two
 * are made to agree in public rather than by assumption.
 */
interface WorldDragGesture {
  readonly x: number;
  readonly y: number;
  /** The side of the square gesture, in CSS pixels. */
  readonly delta: number;
}

/**
 * How many tiles a gesture of `delta` CSS pixels must span, and the whole of the
 * pixel-to-tile relationship anything in this file is allowed to assume.
 *
 * `TILE_SIZE_PX` is the renderer's own constant and the camera starts at zoom 1,
 * which `docs/CAMERA.md` defines as "screen pixels per world unit" -- so one
 * tile is `TILE_SIZE_PX` CSS pixels, and `Phaser.Scale.RESIZE` (see
 * `src/main.ts`'s game config) keeps the game's coordinate space the same size
 * as the canvas's CSS box, with no letterboxing between them. Both corners of a
 * drag are **inclusive** (`tileRectFromDrag`), so a gesture of exactly `n` tiles
 * of travel covers `n + 1` tile columns and rows.
 *
 * Every clause of that is a property of production code, not of this file, and
 * each is an assumption this file used to make silently. So the number this
 * returns is *asserted* against what the panel says it drew, once per drag,
 * rather than trusted -- a camera that arrived zoomed, a scale mode that
 * letterboxed, or an off-by-one in the inclusive corners would each change the
 * rectangle a fixed gesture produces, and each used to be invisible here.
 */
function tileSpanOfGesture(delta: number): number {
  return delta / TILE_SIZE_PX + 1;
}

/**
 * Where a *second* room drag may start so that the rectangle it draws cannot
 * share a tile row with the first one, whatever the camera is doing.
 *
 * The first gesture's lowest tile row is the row containing the screen point it
 * released on, `gesture.y + gesture.delta`. One tile is `TILE_SIZE_PX` CSS
 * pixels (see `tileSpanOfGesture`), so a press that is a further `TILE_SIZE_PX`
 * down the screen is in a strictly lower row no matter where the tile grid
 * happens to fall -- the worst case is a release one pixel inside a row, and
 * `TILE_SIZE_PX` more still clears it.
 *
 * **This replaces a hard-coded `minY: 320`, and the constant is what #658 broke
 * itself against.** That branch gives the status metrics their own row below
 * 1920px, which makes `.hud-strip` 30.5px taller at 1280x800, which pushes the
 * *first* drag 32px further down the page (the scan steps in 16s) -- while 320
 * stayed where it was. The gap between the first rectangle's last row and the
 * second's first row closed from 72px to 40px, both rectangles landed in tile
 * row 14, and the second designation was refused `overlaps-existing-room`. The
 * game was right and the test was aiming at a number.
 *
 * A number derived from the first gesture cannot close that way, and it is not
 * trusted either: `drawRoomRectangle`'s `clearOf` asserts the two rectangles
 * really are disjoint, in tiles, which is the space the refusal is in.
 */
function belowGesture(gesture: WorldDragGesture): number {
  return gesture.y + gesture.delta + TILE_SIZE_PX;
}

/**
 * The authored minimum size for a room type, off the shipped catalogue.
 *
 * `RoomZoningService.zone` refuses `below-minimum-size` against exactly this
 * requirement, so it is the game's own floor rather than a number this file
 * chose -- and it is read from `src/content/room-catalog.ts` for the same
 * reason the catalogue count above is asserted to be 18: a test that hard-coded
 * "2x3" would keep passing after the content changed underneath it.
 */
function authoredRoomMinimum(roomCatalogId: string): {
  readonly minWidth: number;
  readonly minHeight: number;
  readonly minTiles: number;
} {
  const definition = defaultRoomContentRegistry.getById(roomCatalogId);
  if (definition === undefined) throw new Error(`${roomCatalogId} is not in the shipped room catalogue`);
  for (const requirement of definition.requirements) {
    if (requirement.type === 'minimum-size') return requirement;
  }
  throw new Error(`${roomCatalogId} authors no minimum-size requirement to check a drag against`);
}

/** Do two tile rectangles share a tile? Half-open on both axes, which is what a tile count means. */
function tileRectanglesOverlap(left: TileRectangle, right: TileRectangle): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/** `x,y wxh` -- the shape `data-area` prints, for a message a reader can act on. */
function describeTileRectangle(rectangle: TileRectangle): string {
  return `${rectangle.x},${rectangle.y} ${rectangle.width}x${rectangle.height}`;
}

/**
 * Draw a room rectangle on the world and check it against the game's own rules
 * **before** anything is asked to accept it.
 *
 * ### The defect this exists to close
 *
 * The Rooms specs used to drag a rectangle, read it back with
 * `pendingRoomRectangle`, and compare that to a value *also* read back with
 * `pendingRoomRectangle` -- the probe drag's. Both sides of the comparison came
 * from the same helper on the same page, so when the geometry moved they moved
 * together and the assertion still passed. That is `AGENTS.md`'s *"never write
 * a fixture that supplies both sides of a comparison"*, in the one form that
 * looks like a real assertion, and it is why #658 -- a CSS change -- surfaced
 * three assertions later as `[data-metric="rooms"]` stuck at `1Rooms`, with the
 * drag, the rectangle and the arming all reported green.
 *
 * The gesture aims in **CSS pixels**; every refusal is in **tiles**. So the two
 * facts nothing checked are checked here, per drag:
 *
 * 1. **The conversion.** The rectangle is `tileSpanOfGesture(delta)` on a side,
 *    or the pixel-to-tile relationship this file assumes is not the one the
 *    renderer has.
 * 2. **The rules the rectangle will be judged by.** The authored minimum for
 *    this room type (`below-minimum-size`), and disjointness from rectangles the
 *    caller names (`overlaps-existing-room`). A drag that draws something the
 *    simulation can only refuse fails *here*, saying which rule and by how much,
 *    instead of becoming a mystery about Designate further down.
 *
 * Deliberately **not** an assertion about *where* the rectangle is: that is a
 * function of the HUD's layout at this viewport and is allowed to move. What is
 * not allowed to move is whether the thing drawn is a room the game would take.
 */
async function drawRoomRectangle(
  page: Page,
  what: string,
  options: {
    readonly roomCatalogId: string;
    readonly minY?: number;
    readonly clearOf?: readonly TileRectangle[];
    /** Sides to try, in order. Defaults to `ROOM_DRAG_DELTAS_PX`; see `SMALL_ROOM_DRAG_DELTAS_PX`. */
    readonly deltas?: readonly number[];
  },
): Promise<{ readonly rectangle: TileRectangle; readonly gesture: WorldDragGesture }> {
  const deltas = options.deltas ?? ROOM_DRAG_DELTAS_PX;
  const gesture = await dragRectangleOnWorld(page, {
    deltas: [...deltas],
    // Every drag through this helper is one half of a pair: a probe that
    // decides where a perimeter's worth of wall segments go, and the real drag
    // that has to land
    // on the same tiles once they are up. `wholeSquare` is what stops a HUD
    // island that grew in between from moving the second one -- see
    // `dragRectangleOnWorld`'s own note for the 3.8px this was measured at.
    wholeSquare: true,
    ...(options.minY === undefined ? {} : { minY: options.minY }),
  });
  if (gesture === null) {
    throw new Error(
      `${what}: no square of bare world to draw a room in, from y=${String(options.minY ?? 8)} down` +
        ` (deltas ${deltas.join(', ')}px at ${JSON.stringify(page.viewportSize())})`,
    );
  }

  const rectangle = await pendingRoomRectangle(page);
  const span = tileSpanOfGesture(gesture.delta);
  expect(
    { width: rectangle.width, height: rectangle.height },
    `${what}: a ${gesture.delta}px gesture from (${gesture.x},${gesture.y}) drew` +
      ` ${describeTileRectangle(rectangle)}, and a ${TILE_SIZE_PX}px tile at zoom 1 makes that ${span}x${span}` +
      ` -- so the camera, the scale mode or the inclusive corners are not what this file assumes`,
  ).toEqual({ width: span, height: span });

  const minimum = authoredRoomMinimum(options.roomCatalogId);
  expect(
    {
      wideEnough: rectangle.width >= minimum.minWidth,
      tallEnough: rectangle.height >= minimum.minHeight,
      bigEnough: rectangle.width * rectangle.height >= minimum.minTiles,
    },
    `${what}: ${describeTileRectangle(rectangle)} is below ${options.roomCatalogId}'s authored minimum of` +
      ` ${minimum.minWidth}x${minimum.minHeight} (${minimum.minTiles} tiles), so the drag drew a room the` +
      ` simulation can only refuse below-minimum-size`,
  ).toEqual({ wideEnough: true, tallEnough: true, bigEnough: true });

  for (const other of options.clearOf ?? []) {
    expect(
      tileRectanglesOverlap(rectangle, other),
      `${what}: ${describeTileRectangle(rectangle)} shares tiles with ${describeTileRectangle(other)}, so the` +
        ` drag drew a room the simulation can only refuse overlaps-existing-room`,
    ).toBe(false);
  }

  return { rectangle, gesture };
}

/**
 * Every *trusted* pointer press that reached the page, in order.
 *
 * The keyboard-only specs below are only worth their name while nothing in
 * them presses anything with a pointer, and "nothing presses anything" is not
 * a property a reader can check by looking: a `.click()` added later by
 * somebody tidying the spec would make it pass for the wrong reason, which is
 * exactly the class of failure #411 says let the defect ship. So the page
 * records the presses itself. `isTrusted` is the discriminator that matters --
 * a `click()` dispatched from page script carries `isTrusted === false`, while
 * every press Playwright drives through the browser's input pipeline carries
 * `true` -- and it cannot be forged from page script.
 *
 * Capture phase and on `document`, so a listener further down that stops
 * propagation cannot hide a press from it.
 */
interface TrustedPressRecorder {
  __trustedPresses?: string[];
}

async function installTrustedPointerTripwire(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as TrustedPressRecorder;
    store.__trustedPresses = [];
    const record = (event: Event): void => {
      if (!event.isTrusted) return;
      const target = event.target;
      const where = target instanceof Element ? target.tagName.toLowerCase() : 'a non-element';
      const named = target instanceof Element && target.className !== '' ? `.${String(target.className)}` : '';
      (store.__trustedPresses ??= []).push(`${event.type} on ${where}${named}`);
    };
    document.addEventListener('pointerdown', record, true);
    document.addEventListener('mousedown', record, true);
  });
}

/**
 * Every `aria-busy` transition the page makes, in order.
 *
 * The busy group writes that attribute on every control it owns on both
 * transitions (`src/ui/primitives/async-action.ts`), so this is the page's own
 * record of which control was busy and when. It exists to close one hole in
 * the keyboard test below: a press the *gate* refuses -- `run` answers
 * `refused-busy` and calls no handler -- never disables anything, so the
 * control keeps the focus it already had and a test that only looked at where
 * focus ended would pass for a press that was never a command at all.
 * `data-action-failed` cannot see that case, because a refused-busy press is
 * not a failure and is reported to nobody.
 *
 * Recorded by the page rather than polled, because the busy window is one
 * `await` long and a poll would miss it.
 */
interface BusyChangeRecorder {
  __busyChanges?: string[];
}

async function installBusyTransitionRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as BusyChangeRecorder;
    store.__busyChanges = [];
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target;
        if (!(target instanceof Element)) continue;
        (store.__busyChanges ??= []).push(`${target.className}=${target.getAttribute('aria-busy') ?? ''}`);
      }
    }).observe(document, { attributes: true, attributeFilter: ['aria-busy'], subtree: true });
  });
}

async function busyChanges(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as unknown as BusyChangeRecorder).__busyChanges ?? []);
}

async function trustedPresses(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (window as unknown as TrustedPressRecorder).__trustedPresses ?? []);
}

/** Whether the control holding focus is the one asked for. One round trip. */
async function focusIs(page: Page, target: FocusTarget): Promise<boolean> {
  return page.evaluate(
    ({ selector, text }) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      if (!active.matches(selector)) return false;
      return text === null || (active.textContent ?? '').trim() === text;
    },
    { selector: target.selector, text: target.text ?? null },
  );
}

/** What has focus right now, in enough detail to name it in a failure. */
async function focusedControl(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return 'nothing focusable';
    return `<${active.tagName.toLowerCase()} class="${active.className}">${(active.textContent ?? '').trim().slice(0, 60)}`;
  });
}

/** A control this file reaches with `Tab`, and how it recognises it. */
interface FocusTarget {
  readonly selector: string;
  /**
   * The control's accessible text, for a selector that names more than one
   * control. Matched against `textContent`, which for an icon button is the
   * screen-reader span `createIconButton` always renders -- so this is the
   * word a player hears rather than a class the markup happens to carry.
   */
  readonly text?: string;
}

/**
 * How far a single `Tab` hop is allowed to travel before it is a failure
 * rather than a journey. One full cycle of the page's focusable controls on
 * the busiest tab is inside this; a control that is not in the tab order at
 * all is not.
 */
const MAX_TAB_PRESSES_PER_HOP = 48;

/**
 * Presses `Tab` until the focused control is the one asked for, and answers
 * with how many presses that took.
 *
 * **Discovered rather than hard-coded**, deliberately. A spec that pressed
 * `Tab` a literal seven times would be pinning today's DOM order and would
 * fail on any change to it, including one that left every control perfectly
 * reachable. What #411 asks for is that each control *is* reachable and that
 * the order is sensible, so the count is measured and then bounded by the
 * caller -- and reported, so a tab order that grew is visible at a failure
 * rather than silent.
 */
async function tabTo(page: Page, description: string, target: FocusTarget): Promise<number> {
  return walkFocus(page, 'Tab', description, target);
}

/**
 * The same hop, backwards.
 *
 * `Shift+Tab` is as much a keyboard route as `Tab` is, and a control *behind*
 * the one holding focus is reached by pressing it -- which is what a player
 * filling one form over and over does, and what `wallRectanglesFromTheKeyboard`
 * below does ten times per room. Forwards-only, the walk from the *Place order*
 * button back to the *Tile X* field is a full lap of every focusable control on
 * the page; backwards it is seven presses, and each press costs a round trip.
 *
 * It is deliberately the same function with the same bound, so a control that
 * is unreachable in one direction fails the same way in the other.
 *
 * ### Which way round a *between-panel* hop goes is a budget, not a claim
 *
 * The paragraph above is about one form. The same arithmetic decides the cost
 * of the two `#411` keyboard-only specs, and there it is most of the test:
 * measured on this container on 2026-09-08 with one worker, a press and the
 * `page.evaluate` that follows it cost **~250 ms together** on the assembled
 * page, and `zones a room and admits a prisoner` spent **52.4 s of 98.6 s
 * walking, over 205 presses**.
 *
 * Four of its hops were most of that, because they cross the HUD rather than a
 * form -- and the tab bar is the **last child of `.hud`**
 * (`src/ui/hud/hud.ts:2441`), so forwards from a panel to a tab is nearly a lap
 * of the page. Both directions, measured at 1280x800 on the same runs:
 *
 * | Hop | `Tab` | `Shift+Tab` |
 * | --- | --- | --- |
 * | the Pause control -> the Rooms tab | 24 | **4** |
 * | the Rooms tab -> the room catalogue | 20 | **6** |
 * | the Play control -> the Overview tab | 33 | **7** |
 * | the Overview tab -> the Admit control | 22 | **1** |
 * | the Play control -> the removal toggle (`takes a room back`) | 32 | **8** |
 * | the removal toggle -> the coordinates disclosure (same) | 25 | **15** |
 *
 * **No assertion moves when one of those turns round**, and that is why these
 * six and not others. #411's bound is `MAX_TAB_PRESSES_PER_HOP`, which this
 * function shares; the *tighter* bound the spec places is on the typed route --
 * the disclosure, the four fields, the form control and the confirm control --
 * and every one of those is still walked forwards, including the exact `1` the
 * spec asserts for the disclosure. The spec says so itself where it lists
 * `routeHops`: the hops *between* panels are deliberately unbounded, because
 * their length is a fact about the page's document order and says nothing
 * about the route under test.
 *
 * **"What it does not buy is a cheaper press" is how this block used to end,
 * and half of it is now false -- marked rather than deleted, because the
 * other half is still the thing to understand.** A *backwards* press did get
 * cheaper: `withTabKey` below holds Shift down across a run instead of tapping
 * it once per hop, which takes a `Shift+Tab` hop from four key events to two
 * and, measured on the container `#1008` is about, from 222 ms to 155 ms. A
 * *forwards* press costs exactly what it always did, and what every press
 * queues behind is still the renderer's frame -- which is what the sentence
 * was really about and is what `WallOrderOptions.orderAt` reaches instead.
 */
async function shiftTabTo(page: Page, description: string, target: FocusTarget): Promise<number> {
  return walkFocus(page, 'Shift+Tab', description, target);
}

/**
 * Runs a sequence of hops with `Shift` held down across the run, rather than
 * tapped once per hop.
 *
 * ### Why this is a cut and not a trick
 *
 * `page.keyboard.press('Shift+Tab')` dispatches **four** key events -- Shift
 * down, Tab down, Tab up, Shift up -- where `press('Tab')` dispatches two, and
 * on this page every one of them queues behind the renderer's frame. So a
 * backwards hop costs about twice a forwards one of the same length, which is
 * not a fact about the tab order at all.
 *
 * Both sides measured on the container `#1008` is about -- four cores, no GPU,
 * Chromium rasterising WebGL through SwiftShader, one worker.
 *
 * **From the CI trace of the failing run** (run 34215508642, the first
 * `browser` job on that pool ever allowed to finish): 140 `Tab` presses at a
 * mean of **154 ms** beside 131 `Shift+Tab` at **267 ms**, in one test.
 *
 * **From a probe on the assembled page**, 60 presses of each, three rounds in
 * one run at 1280x800 with a prison loaded, load average 2.5-3.3:
 *
 * | round | `Shift+Tab` | `Tab`, Shift held | plain `Tab` |
 * | --- | --- | --- | --- |
 * | 0 | 219.4 ms | **143.9 ms** | 144.3 ms |
 * | 1 | 220.3 ms | **153.8 ms** | 154.5 ms |
 * | 2 | 219.7 ms | **145.7 ms** | 146.5 ms |
 *
 * The two right-hand columns agree to under a millisecond in all three rounds:
 * **a backwards hop with the modifier already down costs exactly what a
 * forwards hop costs**, and the ~75 ms between them is Shift's own two events
 * and nothing else. So a run of `k` hops costs `145k + 75` where it used to
 * cost `220k`, and the saving is `75(k - 1)` -- nothing at all for a run of
 * one, and about 7-8 s across the ~102 hops-beyond-the-first this file's
 * heaviest test makes.
 *
 * **That is under the resolution of the thing it is trying to speed up, and
 * the run that says so is recorded rather than left out.** Three repeats of
 * the `#331` spec with this cut and nothing else, back to back against three
 * of `origin/main` on an idle box, reported **2.3 / 2.3 / 2.3 m either way** --
 * Playwright prints tenths of a minute, so anything under ~6 s hides inside
 * one bucket. The arithmetic above and the table it rests on are why this is
 * kept anyway; an end-to-end figure for it alone is not available from here
 * and is not claimed.
 *
 * ### Why no assertion moves
 *
 * The page cannot tell the difference where it matters: every `Tab` keydown
 * still carries `shiftKey: true`, focus still travels one stop per tap, and the
 * hop counts `walkFocus` discovers and `#411` bounds are unchanged. What is no
 * longer repeated is Shift's own down/up between taps -- and **nothing under
 * `src/` reads `shiftKey`, listens for the Shift key, or names it at all**,
 * checked by grep across the tree, so there is nothing there to observe the
 * difference. It is also what a hand does: a player reaching backwards through
 * a form holds Shift and taps Tab.
 *
 * `Tab` runs go through here too and hold nothing, so both directions stay one
 * code path.
 */
async function withTabKey<T>(
  page: Page,
  key: 'Tab' | 'Shift+Tab',
  body: (tap: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const tap = async (): Promise<void> => page.keyboard.press('Tab');
  if (key === 'Tab') return body(tap);
  await page.keyboard.down('Shift');
  try {
    return await body(tap);
  } finally {
    // Released whatever happened, including on the throw below: a modifier
    // left down would reach the caller's next press as a chord it never asked
    // for, and the failure would land somewhere else entirely.
    await page.keyboard.up('Shift');
  }
}

async function walkFocus(
  page: Page,
  key: 'Tab' | 'Shift+Tab',
  description: string,
  target: FocusTarget,
): Promise<number> {
  const reached = await withTabKey(page, key, async (tap) => {
    for (let presses = 1; presses <= MAX_TAB_PRESSES_PER_HOP; presses += 1) {
      await tap();
      const landed = await page.evaluate(
        ({ selector, text }) => {
          const active = document.activeElement;
          if (!(active instanceof HTMLElement)) return false;
          if (!active.matches(selector)) return false;
          return text === null || (active.textContent ?? '').trim() === text;
        },
        { selector: target.selector, text: target.text ?? null },
      );
      if (landed) return presses;
    }
    return undefined;
  });
  if (reached !== undefined) return reached;
  // Outside the held run, so the control this names is read with no modifier
  // down and the message says what a reader would see.
  throw new Error(
    `${MAX_TAB_PRESSES_PER_HOP} ${key} presses never reached ${description} (${target.selector}${
      target.text === undefined ? '' : ` labelled "${target.text}"`
    }); focus ended on ${await focusedControl(page)}`,
  );
}

/**
 * Types a number into one of the Rooms panel's coordinate fields, with the
 * keyboard alone, and answers with how many `Tab` presses reaching it took.
 *
 * `Control+a` before the digits, because the field is controlled and already
 * holds a value: typing without selecting first would append to it. The
 * `change` event that carries the value to the panel fires when focus leaves
 * the input, which is what the caller's next hop does -- so the last field
 * typed is committed by the `Tab` that reaches the confirm control, and the
 * assertions in these tests are ordered around that deliberately.
 */
async function typeCoordinate(
  page: Page,
  field: 'x' | 'y' | 'width' | 'height',
  value: number,
): Promise<number> {
  const presses = await tabTo(page, `the ${field} coordinate field`, {
    selector: `.hud-rooms__coord-${field} input`,
  });
  await page.keyboard.press('Control+a');
  await page.keyboard.type(String(value));
  return presses;
}

/**
 * Chooses a room type from the catalogue with the keyboard, and answers with
 * how many `Tab` presses reaching the catalogue took (#411).
 *
 * **One `Tab`, then arrows.** The catalogue is a `radiogroup` with a roving tab
 * stop, so the whole eighteen-row list is a single stop and the arrows move
 * inside it -- which is the point of the change this helper exists for. Before
 * it, the walk to a room type was one `Tab` per row and the walk *out* of the
 * catalogue was every remaining row again.
 *
 * The arrow count is deliberately not the caller's business and is not
 * reported: it is a function of where the host happens to order this room in
 * the catalogue, which is not a fact about the keyboard route. What is
 * reported, and what the callers bound, is the `Tab` cost -- because that is
 * the number the roving tab stop changed.
 *
 * `backwards` asks for the walk *in* to be `Shift+Tab`, and it is a preference
 * about cost rather than a different claim: the group is one tab stop either
 * way, so the roving stop is what focus lands on from either side and the
 * arrows below are unchanged. Measured at 1280x800 on 2026-09-08, from the
 * Rooms tab: **20 presses forwards, 6 backwards** -- see `shiftTabTo` for the
 * table and for why turning a between-panel hop round costs no assertion. It
 * is off by default so the third caller, `every command hands the keyboard
 * back to the control that issued it`, keeps the numbers its own comment
 * records.
 */
async function chooseRoomTypeFromTheKeyboard(
  page: Page,
  roomId: string,
  options: { readonly backwards?: boolean } = {},
): Promise<number> {
  const reach = options.backwards === true ? shiftTabTo : tabTo;
  const presses = await reach(page, 'the room catalogue', { selector: '.hud-rooms__rows [data-room]' });
  const rowCount = await page.locator('.hud-rooms__rows [data-room]').count();
  const focusedRoom = async (): Promise<string> =>
    page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.['room'] ?? '');
  // Bounded by one lap of the ring: the group wraps, so a room that is really
  // in the list is reached within `rowCount` presses and one that is not is a
  // failure rather than an infinite walk.
  for (let step = 0; step < rowCount; step += 1) {
    if ((await focusedRoom()) === roomId) {
      await page.keyboard.press('Enter');
      await expect(
        page.locator(`.hud-rooms__rows [data-room="${roomId}"]`),
        `${roomId} did not become the selected room type`,
      ).toHaveAttribute('aria-checked', 'true');
      return presses;
    }
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(
    `${rowCount} arrow presses never reached ${roomId} in the catalogue; focus ended on ${await focusedControl(page)}`,
  );
}

/**
 * The rectangle the Rooms panel is currently holding, off its own `data-area`.
 *
 * That attribute is what a finished drag writes and what the typed route
 * writes too (`the Rooms panel yields the world it is drawn on` asserts the
 * pair), so it is the one place on the page that says which *tiles* a gesture
 * landed on -- the gesture itself is in CSS pixels and the camera is between
 * the two.
 */
async function pendingRoomRectangle(page: Page): Promise<TileRectangle> {
  const area = await page.locator('.hud-rooms__area').getAttribute('data-area');
  const parts = (area ?? '').split(',').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    throw new Error(`the Rooms panel is holding no rectangle to read: data-area is ${String(area)}`);
  }
  return { x: parts[0] ?? 0, y: parts[1] ?? 0, width: parts[2] ?? 0, height: parts[3] ?? 0 };
}

/** The four numbers both coordinate forms take, and the shape `data-area` prints. */
interface TileRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One `wall-brick` order: the tile it is anchored to, and which of that tile's two edges it fills. */
interface WallSegment {
  readonly x: number;
  readonly y: number;
  readonly edge: 'north' | 'west';
}

/**
 * Every order a player has to place before `RoomZoningService.zone` will take
 * these rectangles.
 *
 * ADR 0045 ("Must a zoned room be enclosed") is Accepted on decision 1: `zone`
 * **refuses** a room whose definition authors an `enclosed` requirement and
 * whose perimeter is open, and `room.cell` -- with sixteen of the other
 * seventeen shipped definitions -- authors it. The ADR states the consequence
 * as a route rather than a rule: *"The player's route to a room is now
 * build-then-zone."* These three tests drive the real UI against a real worker,
 * so that is the route they take; there is no `SparseWorld` here to hand to
 * `tests/helpers/room-walls.ts`, and nothing that stubbed one would be proving
 * what this file exists to prove.
 *
 * `SparseWorld` stores a **north** edge and a **west** edge per tile, so a
 * rectangle's south boundary is the north edge of the row *below* it and its
 * east boundary is the west edge of the column to its *right* -- tiles outside
 * the rectangle. That is what made a room flush against the edge of owned land
 * unzonable (ADR 0045, Consequences), and issue #448 fixed it: an edge order is
 * now permitted when either of the two tiles it separates qualifies, so the
 * south and east faces of owned land are buildable. Every rectangle these tests
 * draw is well inside the single 32x32 chunk `createNewSimulationRuntime` owns,
 * so nothing here changed either way -- this paragraph is corrected rather than
 * deleted because the storage fact above it is still the reason the perimeter
 * helper below has to think in north and west.
 *
 * Deduplicated across rectangles, because two rooms that share a boundary share
 * the stored edge: the Rooms panel's second drag lands directly below the first,
 * and ordering a wall twice on one edge is an order that builds nothing while
 * the crew is busy. Deduplicating is also what makes the count this returns the
 * number the build queue will show.
 *
 * **That sentence read "the two overlap on two segments", and how many they
 * overlap on is a property of where the drags land rather than of this
 * function.** Measured at 1280x800 on 2026-09-08, both readings taken from the
 * `#331` spec's own two drags: at 4x4 they land `6,11` and `12,15`, share no
 * edge at all, and this returns **32**; at 3x3 they land `6,11` and `8,14`, the
 * second's north row *is* the first's south row, and they share exactly **one**
 * -- `8,14 north` -- for **23**. So the dedupe is load-bearing at one size and
 * idle at the other, and neither number is a constant a reader should carry.
 * The claim is corrected rather than deleted because the *reason* to dedupe is
 * unchanged: nothing here may assume the drags stay clear of each other.
 *
 * North first, then west, so the edge chooser is pressed twice for a whole
 * prison rather than once per segment.
 */
function perimeterSegments(rectangles: readonly TileRectangle[]): readonly WallSegment[] {
  const seen = new Set<string>();
  const segments: WallSegment[] = [];
  const add = (segment: WallSegment): void => {
    const key = `${segment.x},${segment.y},${segment.edge}`;
    if (seen.has(key)) return;
    seen.add(key);
    segments.push(segment);
  };
  for (const edge of ['north', 'west'] as const) {
    for (const rectangle of rectangles) {
      if (edge === 'north') {
        for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
          add({ x, y: rectangle.y, edge });
          add({ x, y: rectangle.y + rectangle.height, edge });
        }
      } else {
        for (const x of [rectangle.x, rectangle.x + rectangle.width]) {
          for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) add({ x, y, edge });
        }
      }
    }
  }
  return segments;
}

/**
 * The Build panel's two coordinate fields, by position rather than by label.
 *
 * `tabTo` recognises a control by `matches()` against the *focused* element,
 * and an accessible-name lookup is not available there -- so the selector has
 * to be structural. `.hud-build__coords` holds exactly the two `.ui-number`
 * roots and nothing else (`build-panel.ts`), and `wallRectanglesFromTheKeyboard`
 * checks that the first of them really is the field labelled "Tile X" before it
 * types a single digit, so a reordering of that row fails loudly instead of
 * silently walling the transpose of the room.
 */
const BUILD_TILE_X_FIELD = '.hud-build__coords > .ui-number:nth-child(1) .ui-number__input';
const BUILD_TILE_Y_FIELD = '.hud-build__coords > .ui-number:nth-child(2) .ui-number__input';

interface WallOrderOptions {
  /**
   * A viewport to type the orders at, restored before this returns.
   *
   * ### What it is for
   *
   * Every `keyboard.press`, `page.evaluate` and `getAttribute` in this helper
   * queues behind the renderer's frame, and on a host with no GPU that frame
   * is a software rasteriser painting the whole viewport. So the cost of the
   * route is a function of the canvas's area, which no caller had a way to
   * say anything about.
   *
   * Measured on the container `#1008` is about -- four cores, Chromium
   * rasterising WebGL through SwiftShader -- with the assembled page up and a
   * prison loaded, 40 presses of each in one run, 1280x800 then 640x480 then
   * 1280x800 again so drift is visible:
   *
   * | | `Tab` | `Shift+Tab` | `page.evaluate` |
   * | --- | --- | --- | --- |
   * | 1280x800 (canvas 1280x800) | 164 ms | 222 ms | 115 ms |
   * | 640x480 (canvas 640x480) | **28 ms** | **30 ms** | **22 ms** |
   * | 1280x800 again | 180 ms | 397 ms | 173 ms |
   *
   * A third of the pixels, about a sixth of the cost -- superlinear, which is
   * what leaving a saturated rasteriser looks like rather than a proportion.
   * The third row is the control and it is also the warning: it is worse than
   * the first, because another agent's suite started during the run. Treat the
   * ratio as the finding and none of the absolutes as a figure.
   *
   * ### What it is worth end to end
   *
   * Three repeats of the `#331` spec on `origin/main` and three on this
   * change, the two blocks run back to back on the same box with nothing else
   * on it -- load average 2.86 at the start of the first and 3.39 at the end
   * of the second:
   *
   * | | repeats | each |
   * | --- | --- | --- |
   * | `origin/main` | 3 | 2.3 / 2.3 / 2.3 m |
   * | with `orderAt: 375x812` | 3 | **1.4 / 1.4 / 1.4 m** |
   *
   * 138 s to 84 s, and the margin against `test.slow()`'s 180 s cap goes from
   * 42 s to 96 s. **Effectively all of that is this option**: the same block
   * run with `withTabKey` and no `orderAt` returned 2.3 / 2.3 / 2.3 m, which
   * `withTabKey` records in full.
   *
   * ### Why it costs no coverage
   *
   * This helper asserts nothing about layout, geometry or a viewport. It
   * asserts that the catalogue arrived with `wall-brick` selected, that the
   * buy control offers the bricks the perimeter needs, that nothing was
   * refused, that the worker received one order per segment, that the clock
   * reached x4, and that the crew finished -- and it types the orders as
   * **tile** coordinates, which no viewport can move. The rectangles it walls
   * were discovered by the caller before this ran and are not touched here.
   *
   * The caller names the size, so a spec whose subject *is* the keyboard route
   * keeps the viewport it was written against: `#411`'s two keyboard-only
   * specs and `#703` do not pass this and do not move. Asked for by name for
   * the same reason `SMALL_ROOM_DRAG_DELTAS_PX` and
   * `chooseRoomTypeFromTheKeyboard`'s `backwards` are.
   */
  readonly orderAt?: { readonly width: number; readonly height: number };
}

/**
 * Builds the walls these rectangles need, through the application, with the
 * keyboard alone -- and leaves the session paused, as a new one arrives.
 *
 * ### Why the walls are built rather than written
 *
 * See `perimeterSegments` above for the ruling. What this adds is the *route*:
 * buy the bricks, order every segment, run the clock until the crew has laid
 * them, stop it again. That is what ADR 0045 says a player now does, and it is
 * the only thing available on this page -- `tests/helpers/room-walls.ts` writes
 * edges into a fixture's `SparseWorld` directly, and the world these tests zone
 * in lives in a real worker on the other side of a `postMessage`.
 *
 * It is also the honest shape for a file whose whole subject is that the real
 * halves are joined. Nothing here is stubbed, intercepted or injected: the
 * bricks are bought with a real `PurchaseMaterials`, they arrive
 * `PROCUREMENT_DELIVERY_DELAY_TICKS` later, `ConstructionSystem` allocates them
 * out of the same container a player's would come from, and the edge each
 * completed order writes is the edge `roomPerimeterEnclosure` reads.
 *
 * ### The keyboard, in a test that does not require it
 *
 * Two of the three callers are #411's keyboard-only specs and cannot press
 * anything with a pointer at all -- `installTrustedPointerTripwire` fails them
 * if they do. The third could, and does not, for a measured reason: a pointer
 * press on this panel costs ~530 ms of Playwright actionability against a HUD
 * the renderer repaints, and a key press costs ~15 ms. Thirty segments is
 * ~64 s of clicking against ~3 s of typing. One helper, the cheaper route, and
 * the route the panel's own hint calls "the keyboard route".
 *
 * The third caller does pass `orderAt`, which is a statement about the
 * *viewport* and not about the route: see `WallOrderOptions` for what a
 * software rasteriser charges per pixel and why a spec whose subject is the
 * keyboard route must not ask for it.
 *
 * **The `~3 s` is a per-press figure multiplied as though a segment were one
 * press, and a segment is four or fourteen hops.** Measured on this container
 * on 2026-09-08, instrumented at the two ends of the order loop below: the 32
 * segments of the `#331` spec cost **99.0 s**, or ~3.1 s each -- thirty times
 * the number this paragraph gives for thirty of them. The comparison it was
 * making survives, because the pointer route's presses scale by the same hop
 * count and cost ~870 ms each on this host (#1008): the keyboard is still the
 * cheaper route by roughly four to one, and that ratio is the part worth
 * keeping. What the wrong absolute figure hid is that this loop, not the crew,
 * is where `test.slow()`'s allowance goes -- which is what
 * `SMALL_ROOM_DRAG_DELTAS_PX` exists for.
 *
 * ### What it costs, measured
 *
 * `wall-brick` is `workRequired: 50` and `ConstructionSystem` advances **one**
 * order by 10 per scheduled tick on a 10-tick schedule, so a segment is six
 * scheduled ticks -- 60 kernel ticks, 3 s of wall time at x1 and 0.75 s at x4.
 * That is why this presses *Fast forward* twice: at x1 a thirty-segment prison
 * would spend 90 s inside a 60 s test budget. It is the player's own control,
 * pressed for the reason a player presses it. Measured at x4 with the clock
 * actually running, the crew's own phase is **30.0 s for 32 segments and
 * 22.2 s for 23** -- 0.94 s and 0.97 s a segment against the 0.75 s predicted
 * above, so the prediction is right to within the poll's own sampling and the
 * crew has never been what this helper waits on.
 */
async function wallRectanglesFromTheKeyboard(
  page: Page,
  rectangles: readonly TileRectangle[],
  options: WallOrderOptions = {},
): Promise<readonly WallSegment[]> {
  const orderAt = options.orderAt;
  if (orderAt === undefined) return orderWallRectangles(page, rectangles);
  const entered = page.viewportSize();
  await page.setViewportSize({ width: orderAt.width, height: orderAt.height });
  try {
    return await orderWallRectangles(page, rectangles);
  } finally {
    // Restored on the way out however this ended, so a caller inherits the
    // viewport it had and a failure's snapshot is taken at the size the caller
    // is reasoning about rather than at the one the orders were typed at.
    if (entered !== null) await page.setViewportSize(entered);
  }
}

async function orderWallRectangles(
  page: Page,
  rectangles: readonly TileRectangle[],
): Promise<readonly WallSegment[]> {
  const segments = perimeterSegments(rectangles);

  await tabTo(page, 'the Build tab', { selector: '.ui-tab[data-tab="build"]' });
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-build')).toBeVisible();

  // A vacuity guard, not a claim: every order below is for whatever this row
  // says, so a catalogue that arrived with something else selected would wall
  // the room in beds.
  await expect(
    page.locator('.hud-build__list [data-selected="true"]'),
    'the Build catalogue did not arrive with a wall selected, so these orders are for something else',
  ).toHaveAttribute('data-buildable', 'wall-brick');

  // ---- the bricks -----------------------------------------------------
  // Two per segment, out of `wall-brick`'s `materialsRequired`, and the panel
  // prints the arithmetic so it is asserted rather than assumed.
  const bricks = 2 * segments.length;
  const buyToggle = page.locator('.hud-build__buy-toggle');
  /*
   * Backwards, because the tab bar is the last thing in the document and this
   * panel is above it: the disclosure is **one** `Shift+Tab` from the Build
   * tab, and forwards is a lap of the whole page.
   *
   * This comment used to add "which, with this panel open, is more than
   * `MAX_TAB_PRESSES_PER_HOP`", and that half is withdrawn rather than
   * overwritten, because the reason for going backwards has not changed --
   * only the tally has. Measured on this page at 1280x800 with one prison
   * saved, the forward walk from the Build tab to this control was **43**
   * presses before the Build catalogue got its roving tab stop (#411, the
   * Build half) and is **23** after it; the bound is 48, so it was inside it
   * either way. `BUILDABLE_REGISTRY` already held twenty-one rows at
   * `fe6a890`, the commit that wrote the sentence, which makes it likely the
   * claim was false the day it was written -- but the walk was not re-run at
   * that commit, so that is an inference and not a measurement.
   */
  await shiftTabTo(page, 'the buy disclosure', { selector: '.hud-build__buy-toggle' });
  if ((await buyToggle.getAttribute('aria-expanded')) === 'false') await page.keyboard.press('Enter');
  await expect(page.locator('.hud-build__buy')).toBeVisible();

  await tabTo(page, 'the buy quantity field', { selector: '.hud-build__buy .ui-number__input' });
  await page.keyboard.press('Control+a');
  await page.keyboard.type(String(bricks));
  await page.keyboard.press('Enter');
  const buy = page.locator('.hud-build__buy-submit');
  await expect(buy, 'the buy control does not offer the bricks this perimeter needs').toHaveText(
    localeText('hud.build.buy-submit')
      .replace('{count}', fundsText(bricks))
      .replace('{material}', localeText('item.brick.name'))
      .replace('{total}', fundsText(bricks * unitPriceOf('item.brick'))),
  );
  await tabTo(page, 'the buy control', { selector: '.hud-build__buy-submit' });
  await page.keyboard.press('Enter');
  // Nothing was refused: the starting balance is 25,000 and this is well
  // inside it. A refusal here would leave every order below in
  // `materials-pending` for ever, and the failure would surface as a room
  // that never zoned rather than as a purchase that never went through.
  await expect(page.locator('.hud__refusal'), 'the brick purchase was refused').toBeHidden();
  // Folded again, so the panel is left the shape the caller found it -- and
  // backwards, because the disclosure is above the control that opened it.
  await shiftTabTo(page, 'the buy disclosure', { selector: '.hud-build__buy-toggle' });
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-build__buy')).toBeHidden();

  // ---- one order per segment, through the numeric route ----------------
  const coordinates = page.locator('.hud-build__coordinates');
  await tabTo(page, 'the Build panel coordinates disclosure', {
    selector: '.hud-build__coordinates > .ui-section__header',
  });
  if ((await coordinates.getAttribute('data-collapsed')) === 'true') await page.keyboard.press('Enter');
  await expect(coordinates).toHaveAttribute('data-collapsed', 'false');

  // The structural selectors really are the labelled fields. Compared by the
  // `id` the label points at, so this is the same control the accessible name
  // resolves to and not two selectors that happen to agree.
  expect(
    await page.locator(BUILD_TILE_X_FIELD).getAttribute('id'),
    'the first field in the Build panel coordinate row is not the one labelled Tile X',
  ).toBe(await page.getByRole('spinbutton', { name: localeText('hud.build.tile-x') }).getAttribute('id'));
  expect(
    await page.locator(BUILD_TILE_Y_FIELD).getAttribute('id'),
    'the second field in the Build panel coordinate row is not the one labelled Tile Y',
  ).toBe(await page.getByRole('spinbutton', { name: localeText('hud.build.tile-y') }).getAttribute('id'));

  /*
   * The same hop, taken thirty times, without paying to discover it thirty
   * times.
   *
   * `tabTo` asks the page where focus landed after **every** press, which is
   * what makes it a discovery rather than a hard-coded count -- and on this
   * page a press costs ~57 ms and a `page.evaluate` another ~50 ms, because
   * both queue behind a renderer painting every frame. (On a blank page a
   * press is ~1.5 ms; the difference is the real application, not Playwright.)
   * At fourteen presses per segment that is the difference between ~1 s and
   * ~2.1 s a wall, and this loop runs it ten to thirty times.
   *
   * **THOSE TWO FIGURES ARE PROPERTIES OF THE HOST THEY WERE TAKEN ON, AND
   * THIS FILE DOES NOT SAY WHICH -- ON A HOST WITHOUT A GPU THEY ARE OUT BY
   * TWO TO FOUR TIMES.** Both readings are kept rather than one overwritten,
   * because the ratio between them is the useful part. Measured 2026-09-08 on
   * `origin/main` for issue #1008, instrumented at the two ends of this loop:
   * ordering the thirty-two segments of the `#331` spec's two cells cost
   * **138-164 s** across five runs, against the ~67 s the worst case above
   * predicts. The Playwright trace of one of them -- `retain-on-failure` keeps
   * one for every red run -- puts **407 `keyboard.press` calls at a mean of
   * 221 ms and a median of 207 ms**, or 90.1 s of a 180 s test in that one
   * call, beside 113 `page.evaluate` at 129 ms.
   *
   * That container has four cores and no GPU: Chromium rasterises WebGL
   * through SwiftShader, and its GPU process takes ~280% CPU while a single
   * test runs. So a press costs what the renderer it queues behind costs,
   * which is a property of the machine rather than of this loop -- and a
   * pointer press there costs ~870 ms against this route's 221 ms, so the
   * choice of the keyboard above is still the cheaper one and is not what to
   * reopen. What the slowdown does reach is the budget: on such a host this
   * helper spends the whole of `test.slow()`'s allowance before the crew is
   * asked to build anything, and the poll at the end of it then reports a crew
   * that is in fact laying a segment every 0.75 s -- x4's nominal rate exactly,
   * measured off the HUD's own day progress at 81.5 ticks per second.
   * `docs/AGENT_WORKFLOW.md` carries the pass and the options.
   *
   * **THE 407 PRESSES ARE NOT ONE PRICE, AND SPLITTING THEM IS WHERE THE
   * REMAINING CUT CAME FROM.** The same trace, read by key rather than by
   * count: **140 `Tab` at a mean of 154 ms beside 131 `Shift+Tab` at 267 ms**,
   * and 33 `Control+a` at 256 ms. A backwards hop is not slower because it is
   * backwards -- it is slower because `press('Shift+Tab')` dispatches four key
   * events where `press('Tab')` dispatches two, and every one of them queues
   * behind the same frame. `withTabKey` holds the modifier down across a run
   * instead, which is what a hand does and what the page cannot tell apart.
   *
   * And the frame itself is a *size*, which nothing here had treated as
   * anything but a constant: at 640x480 the same presses cost 28 ms and 30 ms
   * against 164 ms and 222 ms at 1280x800, on the same page in the same run.
   * `WallOrderOptions.orderAt` is that, offered to the one caller whose
   * subject is not the keyboard route. Neither of those is a cheaper press in
   * the sense this block meant -- the renderer is still what a press waits
   * for -- and both are fewer things for it to wait on.
   *
   * So each *kind* of hop is discovered once, with the walk, and repeated
   * blindly after that -- then checked. The check is not decoration: if the
   * count no longer lands on the control, the walk runs again and re-learns
   * it, so a change to the form's tab order costs one slow lap rather than a
   * wrong field silently receiving the digits. Nothing here pins a number a
   * reader would have to maintain.
   */
  const strides = new Map<string, number>();
  const hopTo = async (name: string, key: 'Tab' | 'Shift+Tab', target: FocusTarget): Promise<void> => {
    const learned = strides.get(name);
    if (learned !== undefined) {
      // One held run for the whole stride, then the check outside it -- see
      // `withTabKey` for what that is worth on a backwards hop and why the
      // page cannot tell.
      await withTabKey(page, key, async (tap) => {
        for (let press = 0; press < learned; press += 1) await tap();
      });
      if (await focusIs(page, target)) return;
    }
    strides.set(name, await walkFocus(page, key, name, target));
  };

  let chosenEdge: WallSegment['edge'] | undefined;
  let chosenColumn: number | undefined;
  let entered = false;
  for (const segment of segments) {
    /*
     * Only the fields that changed are retyped, which is what
     * `perimeterSegments` orders its output for: a wall run down one column
     * moves the *Tile Y* field and nothing else, and reaching that field is
     * four presses where reaching *Tile X* and coming back is fourteen.
     *
     * The first hop of all is forwards -- focus is on the section's header and
     * the fields are after it. Every hop after that is backwards, because the
     * previous order left focus on *Place order*, the last control in the
     * section, and forwards from there is a lap of the page.
     */
    if (!entered) {
      await tabTo(page, 'the Tile X field', { selector: BUILD_TILE_X_FIELD });
      entered = true;
    } else if (segment.x !== chosenColumn) {
      await hopTo('the Tile X field, from Place order', 'Shift+Tab', { selector: BUILD_TILE_X_FIELD });
    } else {
      await hopTo('the Tile Y field, from Place order', 'Shift+Tab', { selector: BUILD_TILE_Y_FIELD });
    }
    if (segment.x !== chosenColumn) {
      await page.keyboard.press('Control+a');
      await page.keyboard.type(String(segment.x));
      chosenColumn = segment.x;
      await hopTo('the Tile Y field', 'Tab', { selector: BUILD_TILE_Y_FIELD });
    }
    await page.keyboard.press('Control+a');
    await page.keyboard.type(String(segment.y));
    if (chosenEdge !== segment.edge) {
      await tabTo(page, `the ${segment.edge} edge option`, {
        selector: `.hud-build__coordinates [data-choice="${segment.edge}"]`,
      });
      await page.keyboard.press('Enter');
      chosenEdge = segment.edge;
      // From the chooser rather than from the field: a different distance, so
      // a different hop.
      await tabTo(page, 'the Place order control', { selector: '.hud-build__coordinates .ui-action' });
    } else {
      // This hop is also what commits the Tile Y field, which reports on
      // `change`, and `change` fires when focus leaves the input.
      await hopTo('the Place order control, from the Tile Y field', 'Tab', {
        selector: '.hud-build__coordinates .ui-action',
      });
    }
    await page.keyboard.press('Enter');
  }

  // Folded again, backwards, before anything leaves this panel. Two reasons
  // and the second is not cosmetic: it leaves the Build panel the shape the
  // caller found it, and it takes nine controls back out of the tab order --
  // with the section open, the caller's next hop to another tab is 49 presses
  // and `MAX_TAB_PRESSES_PER_HOP` is 48.
  await shiftTabTo(page, 'the Build panel coordinates disclosure', {
    selector: '.hud-build__coordinates > .ui-section__header',
  });
  await page.keyboard.press('Enter');
  await expect(coordinates).toHaveAttribute('data-collapsed', 'true');

  // Nothing was refused on this thread: `submit` throws with no session, and
  // that would leave nothing to build and no sign of why.
  await expect(page.locator('.hud__refusal'), 'an order for a wall segment was refused').toBeHidden();

  // ---- and the crew, at the speed a player would use -------------------
  await tabTo(page, 'the Play control', {
    selector: '.hud-strip__transport button',
    text: localeText('hud.transport.play'),
  });
  await page.keyboard.press('Enter');
  await expect(
    page.locator('.hud-strip__transport button', { hasText: localeText('hud.transport.play') }),
    'the worker never accepted the set-clock, so no order can be dispatched',
  ).toHaveAttribute('aria-pressed', 'true');

  /*
   * Every order reached the worker, counted before the crew has finished one.
   *
   * It has to be here rather than before the clock runs: `hud/build-queue` is
   * a projection of what the *simulation* holds, and a command queued against
   * a paused clock has not been dispatched, so the panel carries no
   * `data-queued` at all until the first tick. And it has to be before *Fast
   * forward*: a wall is six scheduled ticks, which is 3 s at x1 and 0.75 s at
   * x4, so at x1 there is a comfortable window in which the number is the
   * whole perimeter and at x4 there is not.
   *
   * Without it, a segment the form silently dropped would surface twenty
   * seconds later as a room that would not zone, which names the symptom and
   * not the cause.
   */
  await expect
    .poll(async () => page.locator('.hud-build').getAttribute('data-queued'), {
      message: 'the worker did not receive one build order per perimeter segment',
      timeout: 10_000,
    })
    .toBe(String(segments.length));

  /*
   * Twice: `nextFastForwardSpeed` steps 1 -> 2 -> 4 and stops there
   * (`SIMULATION_SPEEDS`), and a third press would go back to 2.
   *
   * The shape of these hops is dictated by two things about the transport, and
   * both were measured here rather than assumed.
   *
   *  1. **Pressing a transport control drops focus to `<body>`.** What Tab
   *     does next is then decided by the browser's *sequential focus
   *     navigation starting point*, which the press left on the button --
   *     so one `Tab` lands on the control after it and one `Shift+Tab` on the
   *     control before it, and the button just pressed is reachable in neither
   *     direction without going round. That is why the second press hops back
   *     to *Play* first: forwards from *Fast forward* is a full lap of the
   *     page, and a lap with the Build panel open is past
   *     `MAX_TAB_PRESSES_PER_HOP`.
   *  2. The speed it asks for next is computed from the speed in the *view
   *     model*, which is the worker's answer arriving over `postMessage`. So
   *     the readout is waited on between the presses: a second press that read
   *     a stale 1 would ask for 2 again, which left the clock at x2 and the
   *     crew at half the rate this budget assumes.
   *
   * `×4` is the readout's own text (`status-strip.ts` writes `×${speed}`),
   * not the `hud.clock.speed` sentence beside it: that one is the
   * screen-reader label and lives in a different node.
   */
  const fastForward: FocusTarget = {
    selector: '.hud-strip__transport button',
    text: localeText('hud.transport.fast-forward'),
  };
  await tabTo(page, 'the Fast forward control', fastForward);
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-clock__speed')).toHaveText(`×${fundsText(2)}`);
  await shiftTabTo(page, 'the Play control', {
    selector: '.hud-strip__transport button',
    text: localeText('hud.transport.play'),
  });
  await tabTo(page, 'the Fast forward control', fastForward);
  await page.keyboard.press('Enter');
  await expect(page.locator('.hud-clock__speed')).toHaveText(`×${fundsText(4)}`);

  await expect
    .poll(async () => page.locator('.hud-build').getAttribute('data-queued'), {
      message: `the crew never finished the ${segments.length} wall segments`,
      timeout: 90_000,
    })
    .toBeNull();

  // Stopped again, so the caller inherits the paused session a new prison
  // arrives as. It used to be what let every "a command queued against a
  // paused clock is not dispatched until it runs" claim below stay true; since
  // ADR 0051 a *due* command is dispatched
  // during a pause, so what those places now rest on is narrower and is stated
  // where each of them stands.
  // Backwards, for the reason above: the starting point is still *Fast
  // forward*, and *Pause* is two controls behind it and a whole lap ahead.
  await shiftTabTo(page, 'the Pause control', {
    selector: '.hud-strip__transport button',
    text: localeText('hud.transport.pause'),
  });
  await page.keyboard.press('Enter');
  await expect(
    page.locator('.hud-strip__transport button', { hasText: localeText('hud.transport.pause') }),
  ).toHaveAttribute('aria-pressed', 'true');

  return segments;
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
 * **Since 2026-09-05 the camera zoom pair goes with them (#1023), and it is
 * not the same kind of entry.** The two originals have a second route on a
 * phone or nothing to show yet; the zoom has neither. See the comment on those
 * two entries below, which is where the argument is kept.
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
 * The controls this sweep cannot reach **at any viewport**, because nothing this
 * sweep does puts the simulation into the state that reveals them.
 *
 * ## The reason changed, and the old one is quoted rather than deleted
 *
 * This constant was `NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR`, and it said:
 *
 * > **Nothing in `src/` can hold a guard in a new session.**
 * > `DeploymentSystem.assignUnassignedGuards` iterates `sectors.all()`, and
 * > **nothing in `src/` registers a `SecuritySectorDefinition`** for a new
 * > session -- `restoreSecuritySystems` in `session-systems.ts` is the only
 * > caller of `securitySectors.register`, and it reads a save payload. [...]
 * > **This entry is a tripwire, not an excuse.** The moment anything registers a
 * > security sector for a new session, these three controls become reachable,
 * > this list goes stale, and the assertion below fails until it is deleted.
 *
 * ADR 0034 decision 9 put that finding to the owner and it became issue #396.
 * [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md) answers
 * it: every session now derives one sector, one deployment requirement and one
 * watched sector id from the world, so a hired guard **is** held --
 * `tests/integration/security-default-sector.test.ts` posts one through the real
 * `HireStaff` command on the tick it lands, and drives a riot in that sector to
 * a contained resolution with three more.
 *
 * So the sentence above is false now, and the tripwire fired in the sense that
 * matters: the reason had to be rewritten. What it did **not** do is fail the
 * assertion below, and that is worth being exact about rather than glossing:
 * these three rows are still never laid out, for a *weaker* reason than before.
 *
 * **That last clause held for two days and no longer does** -- issue #533 made
 * the reason stronger again rather than weaker, and the next section is where
 * that is argued. It is left standing because the ADR-0036 paragraph above is
 * what it is a correction to, and deleting it would leave that paragraph reading
 * as though nothing had been conceded.
 *
 * ## The reason now, and the reason it had until issue #533
 *
 * This section read:
 *
 * > **This sweep never hires anybody.** It presses no `.hud-staff__hire`, and
 * > the held-guards block has no box until `hud/held-guards` reports a held
 * > guard, so the three `Release` rows keep their place in the inventory and
 * > never get a rectangle. The claim this exemption makes has therefore shrunk
 * > from "the game cannot reach this state" to "this test does not drive it",
 * > which is a weaker claim and a worse one.
 *
 * **The first sentence is now false and the last one is obsolete with it.** The
 * sweep hires three guards at every viewport and dismisses all three again --
 * "Somebody on the payroll (#533)" below -- because issue #533 put a `Dismiss`
 * control on that roster and a sweep that exempted the control the change is
 * about would have certified nothing about it.
 *
 * The middle sentence still holds, and it is the whole reason these three rows
 * stay here while the four the roster adds do not. **Hiring is not what holds a
 * guard.** `DeploymentSystem.assignUnassignedGuards` is called from that
 * system's `update` and from nowhere else
 * (`src/simulation/security/deployment-system.ts:128`); the sweep pauses the
 * clock before its viewport loop and never restarts it; and ADR 0051's paused
 * drain dispatches the `HireStaff` command *without* running a tick. So three
 * guards are hired, no system ever looks at them, all three stay `'unassigned'`,
 * nothing claims them and `hud/held-guards` reports none -- which is exactly the
 * state issue #533 was measured in. The claim this exemption makes is therefore
 * back to being the stronger one: with the clock this sweep runs under, the game
 * cannot reach the state these three rows need.
 *
 * **THE MECHANISM IN THAT PARAGRAPH IS NECESSARY AND NOT SUFFICIENT, AND IT IS
 * KEPT BECAUSE OF THE CHEAP FIX IT INVITES (#1357 §3, corrected 2026-09-22).**
 * Every clause of it is true. The inference it leads a reader to -- *let the
 * clock run and the rows appear* -- is false, for a reason the paragraph never
 * names: issue #533 / ADR 0070 decision 1. `resolveOccupancyScaledGuardCount`
 * answers `0` for a sector whose occupant count is complete and zero
 * (`src/simulation/security/sector-staffing.ts:189`), the derived sector is the
 * one whose count *is* complete, and `assignUnassignedGuards` then skips it on
 * `if (shortage <= 0) continue;`
 * (`src/simulation/security/deployment-system.ts:332`). **An empty prison asks
 * for no guards, so no number of ticks claims one** -- #1357 measured three
 * hired guards, Play, 8 % of a day, and `0 held · 3 free`. What one held row
 * actually needs is five things, of which this sweep does one: a walled
 * perimeter (`room.cell` authors `enclosed`), a `ZoneRoom`, an `AdmitPrisoner`
 * (refused `no-accommodation` without the room), the hire, and only then a
 * deployment tick. So the conclusion above holds far more strongly than it
 * claims, and a future agent who restarts the clock in this sweep will watch
 * nothing happen.
 *
 * **These three entries stay, and none is retired by the spec that now presses
 * the control.** `tests/browser/ui-held-guard-release-reachable.spec.ts` builds
 * those five steps in a real session and lays out, clears and presses this
 * `Release` at all five of this sweep's viewports -- but this constant is about
 * what *this* sweep lays out, and this sweep still lays out none of them. #1357
 * §4 is why the preamble is not paid for here: this part ran 2.7 of its 3.0
 * minutes before any of it.
 *
 * ## What would remove it, and how much
 *
 * This section read:
 *
 * > One press of `.hud-staff__hire` on the security tab, before the loop. It
 * > would make **one** of these three rows reachable and no more [...] It is not
 * > done here because a held-guards block changes the Staff panel's height, and
 * > the box-chain assertions above and the rail invariants below are measured to
 * > the pixel in the arrival state at five viewports; re-measuring all of them is
 * > its own change with its own numbers, not a line added to this one.
 *
 * Both halves need correcting, and in opposite directions.
 *
 * **The press happens now, and it removes nothing.** The estimate of *one* row
 * was right about the derived sector's requirement (ADR 0036: one guard) and
 * wrong about when the requirement is met -- it is met by a system update, and
 * this sweep runs with the clock stopped, so the answer here is none rather than
 * one. That is a correction to the number, not a reason to relax the entry: a
 * change that made a hire hold a guard off-tick would lay a `Release` row out,
 * and the accounting assertion at the foot of the sweep would fail and name it.
 *
 * **The pixel objection was real about the panel and wrong about the reach.**
 * Measured on the assembled page, `.hud-staff`'s border box in the arrival state
 * against the same box with three hired and the roster open: 420.1px -> 420.1px
 * at 1280x720, 466.7 -> 555.1 at 1440x900, 456.1 -> 456.1 at 1024x768, 338.1 ->
 * 338.1 at 900x600 and 431.2 -> 451.1 at 375x812. So the panel really does grow
 * at two of the five, by 88.4px and 19.9px, and the save panel above it gives up
 * exactly that much (227 -> 183.7 and 175.6 -> 155.7). At the other three the box
 * does not move at all, because the panel is already a scroll container there --
 * `.ui-panel.hud-staff` is `overflow-y: auto` (`hud.css`) -- and the roster's
 * 206.2px to 231.4px of content lands inside it: `scrollHeight - clientHeight`
 * goes 47 -> 278, 0 -> 143, 11 -> 242, 62 -> 269 and 0 -> 212. `.hud__rail`'s own
 * overflow is 0 in every one of those ten states, which is what the sweep asserts
 * for itself with `railIntegrity` while the payroll is open.
 *
 * **And none of that could have reached the assertions anyway**, which is the
 * half the old sentence got wrong rather than merely imprecise. The Staff panel
 * shares `.hud__side` with the Build panel by *swapping* with it -- `hud.ts`
 * calls `staffPanel.setVisible(activeTab === 'manage')`, which sets `hidden`,
 * and `primitives.css` gives `.ui-panel[hidden]` `display: none`. Every
 * arrival-state measurement in this loop is taken on the **build** tab, where
 * `.hud-staff` has no box at all; measured from the security tab, the same is
 * true in the other direction, `.hud-build` at 0px. So the five viewports of
 * pixel assertions never see the Staff panel, hired or not, and re-measuring
 * them was never the price of the press. The presses are still placed after all
 * of them, because that costs nothing and needs no argument to stay safe.
 *
 * The residue paragraph below is untouched by any of this, because none of it is
 * about a claim a hire can make. The two rows that would remain even with a
 * guard held are the honest residue of what is still inert: ADR 0036's own "what
 * a sector does not bring back" measurements. `SearchSystem.submitOrder` still
 * has no caller in `src/` at all and `runtime.searchPolicies` is still only
 * populated from a save, so there is no `'search'` claim; and an
 * `'incident-response'` claim needs a riot, which needs fifteen thousand ticks
 * of a deliberately overcrowded prison.
 */
const NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD = [
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #1',
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #2',
  'hud > hud__rail > hud__side > ui-panel hud-staff > ui-panel__body > hud-staff__held > ' +
    'hud-staff__held-list > hud-staff__held-row > button.ui-action "Release" #3',
] as const;

// These five sweep viewports never enter the short, enlarged desktop layout.
// The trigger is mounted but deliberately hidden there; the dedicated Full HD
// page-zoom test opens it and checks all six tabs by pointer and keyboard.
const NEVER_LAID_OUT_WITHOUT_ZOOM_DRAWER =
  'hud > hud__tabs > button.ui-icon-button ui-icon-button--bordered hud-navigation-drawer__trigger "Show the sections"';

const NEVER_LAID_OUT_BELOW_720 = [
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__header > ' +
    'button.ui-icon-button ui-icon-button--quiet ui-panel__toggle "Collapse"',
  /*
   * **THE ALERTS FOLD'S HEADER LEFT THIS LIST ON 2026-09-16 (#1201), AND IT IS
   * THE FIRST ENTRY EVER RETIRED FROM IT.** It read
   *
   *     'hud > hud__corner > ui-panel hud-minimap > ui-panel__body > ui-section > ' +
   *       'button.ui-section__header "Alerts"',
   *
   * and it is written out here rather than deleted because the reason it is
   * gone is *not* the reason the block below predicted would retire all of
   * them. `.hud__corner` is still `display: none` at 720px and below -- the
   * three entries around this one are still exempt for exactly that mechanical
   * reason, and the accounting assertion at the foot of the sweep still fails
   * the moment the corner comes back.
   *
   * What moved is the fold's **mount**. On the owner's ruling of 2026-09-16
   * (*"Zamontuj fold w szynie poniżej 720 px (zalecane)"*, the weaker of the
   * two provenances) `hud.ts` puts the alerts section in the Overview panel's
   * `foldSlot`, in the rail, at this breakpoint and no other -- so below 720px
   * this control is laid out, has a chain of ancestors that does not contain
   * `hud__corner`, and is required by the sweep like any other. The defect that
   * bought it is that the alerts log is the only surface that issues
   * `DismissAlert`, so a phone player was offered a command they could not
   * press; `tests/browser/ui-alert-dismiss-on-a-phone.spec.ts` is the gate over
   * the press itself.
   */
  /*
   * AND THE MINIMAP SURFACE ITSELF, ADDED 2026-09-10 (#903). **This entry is
   * not a control that stopped being reachable. It is a control that did not
   * exist**, and the distinction is the whole reason it is written out.
   *
   * Until #903 the surface was a `div` with an implicit `tabIndex -1` and no
   * `role`, so the sweep below did not count it as a control at any viewport --
   * which was itself the defect #903 fixed: a keyboard player could never
   * press the one surface whose own sentence denied that pressing it did
   * anything. It is a real `<button>` now, so it enters the inventory, and at
   * 720px and below it enters it inside a region `hud.css` sets to
   * `display: none` -- the same mechanical reason as the two entries above.
   *
   * **So #903's fix does not reach a phone, and that is what this line
   * records.** It is the honest limit, stated the way the zoom pair below
   * states its own: a keyboard player at a desktop width can now reach the
   * minimap; a keyboard player at 375px still cannot reach it, because nobody
   * can. Retiring this entry is the mobile layout pass's job, not an
   * implementing agent's -- the accounting assertion at the foot of the sweep
   * fails the moment the corner comes back, which is what will retire all
   * three of these together.
   *
   * The Full HD operations HUD now draws an actual map on this button. Its
   * inventory name is the first 32 characters of the current label. The
   * corner remains hidden below 720px, so this is still an honest exemption.
   */
  'hud > hud__corner > ui-panel hud-minimap > ui-panel__body > ' +
    'button.hud-minimap__surface "Prison map — press to move the c"',
  /*
   * AND THE ZOOM PAIR, ADDED 2026-09-05 (#1023), WHICH IS A WORSE ENTRY THAN
   * THE TWO ABOVE AND IS WRITTEN OUT AS SUCH RATHER THAN SLIPPED IN.
   *
   * They are here for the same mechanical reason -- `.hud__corner` is
   * `display: none` at 720px and below, and these two buttons are in it -- and
   * that is where the similarity stops. The minimap draws nothing yet and the
   * alerts log has a second route on a phone (`.hud__event`, and the refusal
   * and unavailable bands, all of which `hud.ts` documents as existing because
   * this corner does not). **The zoom has no second route on a phone at all**:
   * there is no wheel, there are no `+`/`-` keys, and the one gesture that
   * zooms -- a pinch -- has no affordance anywhere, which is the exact defect
   * #1023 was filed about, surviving at one viewport.
   *
   * It is exempted rather than fixed because the fix is not a breakpoint edit.
   * `hud.css`'s own comment on that rule records two attempts at removing it,
   * the diagnosis they produced (the corner collides with the **stretched
   * rail**, and this very test is what caught it), and the owner's steer that
   * the desktop browser comes first and mobile is refined later. This test also
   * pins the rule directly, at "still mounts the interface when the simulation
   * worker cannot start (#82)", so bringing the corner back is a decision with
   * an owner and not a line for an implementing agent to change on its way past.
   *
   * So this pair belongs on the mobile layout pass's list, and these two
   * entries are how it stays on it: the accounting assertion below fails the
   * moment they become reachable, which is what will retire them.
   */
  'hud > hud__corner > hud-zoom > button.ui-icon-button ui-icon-button--bordered hud-zoom__out "Zoom out"',
  'hud > hud__corner > hud-zoom > button.ui-icon-button ui-icon-button--bordered hud-zoom__in "Zoom in"',
  /*
   * AND THE NAVIGATION'S WIDTH CONTROLS, ADDED 2026-09-14 (#1159), WHICH ARE A
   * BETTER ENTRY THAN ANY OF THE FIVE ABOVE AND SHOULD BE READ AS ONE.
   *
   * The five above record a surface a phone cannot reach at all. These two
   * record a surface a phone **does not have**: below 720px the five sections
   * are a bottom bar, which is the delivery's own layout for the tier --
   * *"Telefon ma dolną nawigację i panel"* -- and a bar has no width to drag.
   * `sizeFieldFor('navigation', phone)` answers `undefined` for exactly that
   * reason and `tests/unit/hud-layout.test.ts` pins it, so the separator and
   * the slider are `hidden` rather than merely unreachable.
   *
   * The accounting assertion at the foot of the sweep is still what keeps this
   * honest in the other direction: if a phone ever grows a width drag these
   * two stop being exempt and this list fails until somebody says so.
   *
   * The inspector's own separator and slider are **not** here, and that is the
   * check that makes these two mean something: a phone resizes the bottom sheet
   * by height, so both of those are laid out at 375x812 and are hit-tested like
   * any other control.
   */
  'hud > hud__tabs > button.ui-icon-button ui-icon-button--quiet hud-layout__arrow "Hide the sections"',
  'hud > hud__tabs > div.ui-separator hud-layout__separator hud-layout__separator--navigation "Resize the sections"',
  'hud > hud-strip > hud-strip__layout > hud-layout > hud-layout__body > hud-layout__row > input.hud-layout__slider #1',
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
   * Every control the selector matched, in document order, named. Each name is
   * the control's chain of classed ancestors followed by the control itself,
   * with a numeric suffix breaking the remaining ties (the two
   * `ui-number__input` boxes in the Build panel's coordinate grid are
   * identical all the way up). See `NEVER_LAID_OUT_BELOW_720`.
   *
   * **THE INDEX IS NOT THE CONTROL'S IDENTITY, AND THIS COMMENT USED TO SAY IT
   * WAS.** It read: *"The index into this list is the control's identity for
   * the run: tab switching and resizing hide and show controls but never add
   * or remove them, so index `n` is the same element in every state the test
   * visits."* It is kept here rather than deleted because the accounting
   * assertion at the foot of `everyControlAt` was written on it, and a reader
   * needs to see what was assumed.
   *
   * It is false, and #1167's regime editor is what proved it. That editor
   * builds one toggle group per classification group **on the first paint that
   * has a schedule to paint**, and the schedule only arrives while the
   * `day-plan` tab is the one showing. Measured at 1024x768 on `143d77eb`, the
   * sweep's first four tab states saw **137** controls and every state from the
   * fifth on saw **151**: fourteen controls *added*, in the middle of the
   * document, by visiting a tab. The figures are a reading of that tree rather
   * than a property of this one; what does not change is that a tab visit can
   * grow the list.
   *
   * What that cost was silence rather than a red. `everMeasured` was a set of
   * **indices**, so the eight indices 129-136 -- marked measured while the
   * document held 137 controls, where they named the last eight controls on
   * the page -- were still in the set when the final inventory held 151 and
   * those same indices named toggles. Eight of the editor's fourteen buttons
   * were certified reachable by other controls' measurements; the sweep
   * reported six. At 375x812 it reported eight, because two of that last
   * group are `.hud__corner`'s own and are not laid out there either, so two
   * fewer aliases were available to inherit -- which is why the extra two were
   * a `#1` and a different category and looked like a layout asymmetry.
   *
   * `everMeasured` is keyed by `ids` now -- an attribute minted on the element
   * itself. The name was tried first and is not good enough either: it carries
   * the control's own text and classes, so the Rooms panel's `Designate 0 x 0`
   * and the Build queue's rows change identity when the state does, and the
   * first run of the name-keyed version reported eight controls never laid out
   * that plainly had been.
   */
  readonly controls: readonly string[];
  /**
   * The identity of each control in `controls`, at the same index: the
   * `data-sweep-control` attribute minted on the element the first time any
   * state saw it. Stable where the index and the name are not -- see the
   * block in `controlReachability` that mints them.
   */
  readonly ids: readonly string[];
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
 *
 *   **But only the scrolls a player has, which this did not check until
 *   2026-09-15.** It called `control.scrollIntoView({ block: 'nearest' })`,
 *   and `scrollIntoView` scrolls every scrollport on the way up, including
 *   `overflow: hidden` ones — which are scrollable by script and by nothing
 *   a player can do. So the gesture that made the measurement possible was
 *   also a gesture the player cannot make, and a control clipped out of a
 *   hidden box was certified as pressable. `revealTheWayAPlayerCan` below
 *   walks the same chain and moves only the boxes whose own computed
 *   `overflow` is `auto` or `scroll`.
 * - **A `null` hit is a failure, not a skip.** `elementFromPoint` returns
 *   `null` for a point outside the viewport, so a control pushed off the
 *   edge by an overflowing layout reports here rather than silently passing.
 *
 *   **That sentence was false for as long as the one above it was**, and in
 *   the same way: `src/styles.css:6` makes the window itself an
 *   `overflow: hidden` box, and `scrollIntoView` scrolled *it* too. A control
 *   carried off the bottom of the viewport was scrolled back on before it was
 *   hit-tested, so it answered its own element and passed. The reveal now
 *   reads the viewport's propagated overflow like any other box, finds
 *   `hidden`, and leaves the window where it is.
 * - **The selector is a parameter, defaulting to every interactive element.**
 *   One caller narrows it to `.save-panel__button`, which used to be its own
 *   inline sweep with its own `scrollIntoView` and one sample point. A
 *   narrowed selector makes an empty match possible, so that caller asserts
 *   the match is non-empty and wholly measured; the default never can be.
 * - **Zero-area elements are reported, not swallowed.** An inactive tab's
 *   panel and the corner the responsive rules drop are not laid out, so there
 *   is nothing to hit-test; but "skipped" has to be a fact the caller can
 *   assert on, which is what `measured` is for. A control that is never laid
 *   out in *any* state the test visits has silently escaped the check, and
 *   the caller fails on exactly that.
 */
async function controlReachability(page: Page, selector: string = INTERACTIVE_SELECTOR): Promise<ControlReachability> {
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

    /**
     * Whether a box with this computed `overflow` on one axis is one a player
     * can scroll on that axis. `hidden` and `clip` are not: the content is
     * outside the box and no gesture brings it in. `visible` is not either --
     * there is nothing to scroll, the content is painted outside the box
     * already, and the first clipping ancestor above it decides whether the
     * player ever sees it.
     */
    const playerScrollable = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';

    /**
     * Bring `node` into view using only the scrolls a player has.
     *
     * This is `scrollIntoView({ block: 'nearest', inline: 'nearest' })` with
     * one thing taken away: `scrollIntoView` scrolls **every** scrollport
     * between the node and the viewport, `overflow: hidden` ones included,
     * because the specification tells it to. A hidden box is programmatically
     * scrollable and is not scrollable by a finger, a wheel or a key -- so a
     * control clipped out of one is certified reachable by a gesture the
     * player cannot make. This walks the same chain and moves only the boxes
     * whose own `overflow` says the player could have moved them.
     *
     * Innermost outwards, re-reading the node's rect at each step, because
     * scrolling an inner box is what puts the node where the outer box has to
     * judge it.
     */
    const revealTheWayAPlayerCan = (node: Element): void => {
      for (let ancestor = node.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        const border = ancestor.getBoundingClientRect();
        // The *client* box, which is what `scrollTop` moves content through:
        // the border box less its borders and any scrollbar gutter.
        const top = border.top + ancestor.clientTop;
        const left = border.left + ancestor.clientLeft;
        const bottom = top + ancestor.clientHeight;
        const right = left + ancestor.clientWidth;

        if (playerScrollable(style.overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
          const rect = node.getBoundingClientRect();
          if (rect.bottom > bottom) ancestor.scrollTop += rect.bottom - bottom;
          else if (rect.top < top) ancestor.scrollTop += rect.top - top;
        }
        if (playerScrollable(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) {
          const rect = node.getBoundingClientRect();
          if (rect.right > right) ancestor.scrollLeft += rect.right - right;
          else if (rect.left < left) ancestor.scrollLeft += rect.left - left;
        }
      }

      // And the viewport itself, on the same rule. The root's `overflow`
      // propagates to the viewport, and falls through to `body` only when the
      // root is `visible`; `src/styles.css:6` sets both to `hidden`, so on
      // this page the window is a box the player cannot scroll either and
      // nothing below this line moves. It is written out rather than assumed,
      // because the assumption is exactly the kind that rots when a stylesheet
      // changes.
      const root = document.documentElement;
      const rootOverflowY = getComputedStyle(root).overflowY;
      const rootOverflowX = getComputedStyle(root).overflowX;
      const bodyStyle = document.body === null ? null : getComputedStyle(document.body);
      const viewportOverflowY = rootOverflowY === 'visible' ? (bodyStyle?.overflowY ?? 'visible') : rootOverflowY;
      const viewportOverflowX = rootOverflowX === 'visible' ? (bodyStyle?.overflowX ?? 'visible') : rootOverflowX;
      // `visible` on the viewport is the ordinary scrolling page: it scrolls.
      const viewportScrollsY = viewportOverflowY !== 'hidden' && viewportOverflowY !== 'clip';
      const viewportScrollsX = viewportOverflowX !== 'hidden' && viewportOverflowX !== 'clip';
      const rect = node.getBoundingClientRect();
      let byX = 0;
      let byY = 0;
      if (viewportScrollsY) {
        if (rect.bottom > window.innerHeight) byY = rect.bottom - window.innerHeight;
        else if (rect.top < 0) byY = rect.top;
      }
      if (viewportScrollsX) {
        if (rect.right > window.innerWidth) byX = rect.right - window.innerWidth;
        else if (rect.left < 0) byX = rect.left;
      }
      if (byX !== 0 || byY !== 0) window.scrollBy(byX, byY);
    };

    const measured: number[] = [];
    const unreachable: { control: string; hit: string }[] = [];

    controls.forEach((control, index) => {
      const initial = control.getBoundingClientRect();
      if (initial.width === 0 || initial.height === 0) return;
      measured.push(index);

      revealTheWayAPlayerCan(control);

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

    /**
     * A stable identity per *element*, minted on first sight and left on the
     * node.
     *
     * The sweep visits a dozen states and has to remember, across all of them,
     * which controls it managed to measure. Neither obvious key works: an
     * index moves when a state adds a control to the middle of the document,
     * and a name moves when a control's own text or classes change -- the
     * Rooms panel's `Designate 0 x 0` becomes `Designate 3 x 4` with a
     * rectangle dragged, and the Build queue's rows carry a state class. The
     * element is the thing that does not move, so the key is written on it.
     *
     * `data-sweep-control` is inert: nothing in `src/**` reads it, `describe`
     * above names controls by class and text, and a `data-` attribute is not
     * part of `className`. The counter hangs off `window` so the ids survive
     * one `page.evaluate` to the next and are re-minted from zero by the one
     * thing that also drops the attributes, a navigation.
     */
    const scope = window as unknown as { __lockstateSweepControlId?: number };
    const ids = controls.map((control) => {
      const existing = control.dataset['sweepControl'];
      if (existing !== undefined) return existing;
      const next = (scope.__lockstateSweepControlId ?? 0) + 1;
      scope.__lockstateSweepControlId = next;
      const id = `c${next}`;
      control.dataset['sweepControl'] = id;
      return id;
    });

    return { controls: names, ids, measured, unreachable };
  }, selector);
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
 * **Half of that stopped being true on 2026-09-15 and the paragraph is kept as
 * it stood, because it is the reading this function was built on.** The sweep
 * no longer scrolls an `overflow: hidden` box: `revealTheWayAPlayerCan` moves
 * only boxes whose own computed `overflow` on that axis is `auto` or `scroll`,
 * and the window — `html, body { overflow: hidden }` at `src/styles.css:6` —
 * is one of the boxes it now leaves alone. The **gutter** half is untouched
 * and is still this function's alone: a container that really is `auto` but
 * whose scrollbar lies where no pointer can land is scrollable by the sweep's
 * reveal and by nothing a player does, and no hit test on the *control* can
 * see that.
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

/**
 * The viewports the Build panel's layout claims are measured at: the one #88 was
 * measured at, a wide desktop, a small laptop, a short window and a phone. The
 * collision those tests are about is a layout collision, so which sizes are
 * checked is the whole question -- it was invisible at 1440x900 and fatal at
 * 1280x720.
 *
 * **One list since 2026-08-31, read by the #88 sweep and by the #174 arrival
 * test, and that is load-bearing rather than tidy.** Since issue #703 ruling 2
 * the sweep's loaded state legitimately scrolls this panel, so "the panel
 * arrives inside its own fold" is asserted only by the #174 test -- which makes
 * it the sweep's counterpart, and only if the two cover the same sizes. Two
 * copies of five viewports could drift apart without either test failing.
 */
const HUD_LAYOUT_VIEWPORTS = [
  [1280, 720],
  [1440, 900],
  [1024, 768],
  [900, 600],
  [375, 812],
] as const;

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
   *
   * **Both paragraphs above are history and stay history.** Since 2026-09-15
   * the sweep scrolls only what a player can scroll, so the first of those two
   * defects -- content reachable only because a hidden box was scrolled -- is
   * one it would now catch itself. The second is not: a panel that really is
   * `overflow-y: auto` and holds its last section below its own fold is
   * *reachable*, correctly, and the reason these two measurements exist beside
   * the sweep is that reachable is not the whole claim. Neither is removed.
   *
   * **This was one test until 2026-09-14 and is five now, one per viewport
   * (#1181).** Nothing above changed: the same states, the same sweep, the
   * same per-viewport accounting. What changed is that the 3.0-minute cap is
   * now spent on one viewport rather than on five, because the whole was
   * passing at 2.9 m against it and one extra IndexedDB read per panel refresh
   * was enough to tip it -- three sessions in a row had to prove a timeout
   * here was not theirs. The comments below carry the traced reason there was
   * nothing to make cheaper instead, and `everyControlAt` is the body all five
   * share.
   */
  /*
   * ---- what this cost when it was one test (#1008, 2026-09-08) --------
   *
   * Kept whole, and in the present tense it was written in, because every
   * figure in it is still this sweep's: it is five viewports' worth of work
   * and the work did not change when #1181 made it five tests. Only the
   * budget each part is measured against did.
   */
  // The most expensive test in the suite by a wide margin, and the only one
  // that needs more than the 60 s default: five viewports x five layout
  // states, each a real relayout of the whole page followed by a hit-test
  // sweep over every control and a check on the rail. Measured between 14 s
  // and 28 s on this machine against that 60 s -- close enough that a slower
  // CI runner would fail it for being slow rather than for finding anything,
  // which is the worst kind of red. `test.slow()` triples the budget; it
  // does not make the test do less.
  /*
   * ---- where the three minutes actually go, measured (#1008) -------------
   *
   * The paragraph above says 14-28 s, and the dismissal loop below says
   * 2.9 m against 3.0 m on a box running other suites. Both are kept; this is
   * the third reading and it is the one that was taken apart, because #1008
   * needed to know whether there is a phase here to cut. **There is not.**
   *
   * Measured on the container #1008 is about -- four cores, no GPU, Chromium
   * rasterising WebGL through SwiftShader, one worker, nothing else of this
   * suite running -- on 2026-09-08, with a timestamp at every phase boundary
   * of this test and then removed again. Seconds, per viewport, in the order
   * the loop visits them:
   *
   * | Phase | 1280x720 | 1440x900 | 1024x768 | 900x600 | 375x812 | all |
   * | --- | --- | --- | --- | --- | --- | --- |
   * | the resize itself | 0.2 | 0.3 | 0.2 | 0.2 | 0.1 | 1.0 |
   * | five tabs, five sweeps | 2.8 | 3.8 | 2.5 | 2.4 | 0.8 | 12.3 |
   * | the save panel from Build | 0.6 | 0.8 | 0.5 | 0.4 | 0.2 | 2.5 |
   * | folded rail, headers, box chain | 0.3 | 0.3 | 0.3 | 0.3 | 0.1 | 1.3 |
   * | the coordinates expanded | 0.9 | 1.1 | 0.7 | 0.5 | 0.2 | 3.4 |
   * | the wheel gesture | 0.9 | 1.2 | 0.7 | 0.5 | 0.3 | 3.6 |
   * | the buy row | 1.5 | 2.1 | 1.3 | 0.9 | 0.5 | 6.3 |
   * | the queue fold | 1.6 | 2.8 | 1.3 | 1.0 | 0.5 | 7.2 |
   * | the Rooms typed route | 1.8 | 2.5 | 1.4 | 1.1 | 0.8 | 7.6 |
   * | arm, then a real world drag | 2.7 | 3.8 | 2.3 | 2.1 | 1.5 | 12.4 |
   * | a room pending, then cancel | 0.7 | 1.0 | 0.6 | 0.7 | 0.4 | 3.4 |
   * | the Security tab | 0.9 | 0.9 | 0.5 | 0.5 | 0.4 | 3.2 |
   * | three hires | 1.9 | 2.4 | 1.5 | 1.1 | 0.8 | 7.7 |
   * | the roster fold | 0.7 | 0.4 | 0.3 | 0.2 | 0.1 | 1.7 |
   * | the payroll sweep | 0.2 | 0.3 | 0.2 | 0.1 | 0.1 | 0.9 |
   * | three dismissals | 4.0 | 5.5 | 3.7 | 2.5 | 1.1 | 16.8 |
   * | **the viewport, end to end** | **21.6** | **29.2** | **18.0** | **14.3** | **7.6** | **90.7** |
   *
   * Plus 16.2 s of setup before the loop: **106.9 s end to end**.
   *
   * **Two things that table says which no single figure can.** The cost is
   * spread -- the largest phase is 19 % of the loop and every individual
   * state is a few seconds -- and it scales with the viewport's *area*
   * rather than with anything this test does: 29.2 s at 1440x900 against
   * 7.6 s at 375x812 for identical work, because every Playwright action
   * here queues behind a frame SwiftShader rasterises on the CPU. The same
   * commit, same container, run again while other agents' suites were
   * live: **151.7 s**. So what puts this test at the cap on a CI runner is
   * the host, and the 42 % spread between those two runs is wider than any
   * phase a cut could remove.
   *
   * **What was considered and refused, so that it is not proposed again.**
   *
   *  - *A viewport, or a tab.* That is the coverage, not the cost:
   *    `HUD_LAYOUT_VIEWPORTS` exists because #88 was invisible at 1440x900
   *    and fatal at 1280x720.
   *  - *Hiring once for the whole sweep instead of once per viewport*, which
   *    is the biggest saving the table offers: the hires and dismissals are
   *    24.5 s of it, and doing them once would leave about 5 s -- an
   *    arithmetic estimate off the table above, not a measurement of a
   *    changed test. It is refused because the accounting assertion at the
   *    foot of this loop is **per viewport**: hiring is the gesture that lays
   *    the roster's `Dismiss` controls out at all, and pressing them is the
   *    only way to empty it again. Doing it once would prove `Dismiss` works
   *    at one viewport and certify it at five.
   *  - *Three setup orders instead of six.* The comment that asks for six
   *    gives a reason ADR 0051's paused drain has since retired, so this
   *    looked free. It is worth ~4 s, and the queue's depth is the state five
   *    viewports' worth of recorded pixel figures were measured in --
   *    `.hud-build[data-queued]` pays for the queue block out of the
   *    catalogue's floor, and this file quotes those numbers to 0.1px. Four
   *    seconds is not worth invalidating them.
   *  - *A smaller square for the drag* (`SMALL_ROOM_DRAG_DELTAS_PX`). The arm
   *    and the drag together are 12.4 s and the drag alone 7.5 s of that; the
   *    split between the one `evaluate` that aims it and the fifteen pointer
   *    events that make it was **not measured**, so the saving is unknown and
   *    bounded above by 7.5 s across five viewports. Not taken.
   *
   * The two `#411` keyboard specs below *were* cut, in the same pass on the
   * same day, and the difference is the useful part: half of each of them was
   * walking focus, which is a *route*, and a route has a cheaper direction.
   * This test presses a pointer at a *state* it has to be in, five times over
   * at five sizes, and there is no cheaper direction to take.
   */
  /*
   * ---- and what that bought, and what it did not (#1181, 2026-09-14) -----
   *
   * The comment above is #1008's reading and it is kept whole, because
   * everything in it still holds. What #1181 adds is the **mechanism** behind
   * its last two paragraphs -- why the cost scales with viewport area, and why
   * every cut it considered came out of the coverage rather than out of the
   * overhead.
   *
   * A retained trace of one passing run on an idle container (`--trace on`,
   * 538 calls, 175.7 s of wall span, matched `before`/`after` by `callId`):
   *
   * | Call | Total | Count | Mean |
   * | --- | --- | --- | --- |
   * | `click` | **97.1 s** | 168 | 578 ms |
   * | `evaluateExpression` | 12.8 s | 148 | 86 ms |
   * | `expect` | 12.0 s | 128 | 94 ms |
   * | `mouseMove` | 8.3 s | 20 | 415 ms |
   * | `goto` | 5.9 s | 1 | 5.9 s |
   * | everything else | 12.6 s | 73 | -- |
   *
   * **55 % of this test is `click`, and no individual press is interesting:**
   * the spread across targets is 508-1023 ms and the mean is 578 ms, so a
   * press costs about the same whatever it presses. The hit-test sweep that
   * gives the test its name -- `controlReachability`, one `page.evaluate` over
   * ~200 controls with five `elementFromPoint` samples each -- is inside the
   * 12.8 s of `evaluateExpression`, under 9 % of the run.
   *
   * What sets the price of a press is not this test at all. Measured on the
   * same page at 1440x900 with no trace: the mean `requestAnimationFrame`
   * interval is **104.7 ms** as the app ships and **16.7 ms** with
   * `#game-root canvas` not being rasterised, and twenty real presses cost
   * **27.8 s against 1.5 s** -- 1390 ms a press against 75 ms, **18.5x**.
   * SwiftShader rasterising a full-viewport WebGL canvas saturates the
   * renderer's main thread and every Playwright call queues behind a frame.
   * `click({ force: true })` cost 25.1 s for the same twenty presses, so
   * actionability checks are not where the time is either.
   *
   * So the 18x is real and it is **not available**: `visibility: hidden` takes
   * the canvas out of hit-testing, and the canvas is precisely one of the
   * elements this test has to be able to catch sitting on top of a control.
   * Stopping Phaser's loop instead would need a handle `src/main.ts` does not
   * expose, and would stop it processing the real world drag below.
   * `docs/research/2026-09-14-where-88s-three-minutes-go.md` carries both runs.
   *
   * **Which is why this is five tests and not one.** Nothing here got cheaper;
   * the sweep was cut where it was already cut -- `HUD_LAYOUT_VIEWPORTS` -- so
   * that a viewport's 15-45 s is measured against the cap instead of the
   * sum of five. `test.slow()` stays on each part and is not "buying budget
   * again" (#1181 rules that out and is right to): the cap is the same 3.0
   * minutes it always was, and what changed is that a part now does a fifth of
   * the work under it.
   */
  /**
   * The state every part of the sweep below starts from: the assembled page,
   * one prison, six orders queued and nine deliveries on their way, clock
   * stopped.
   *
   * It was the head of one long test until #1181 split it (2026-09-14) and it
   * is unchanged line for line; it is a function now because each part runs
   * it, on its own page, from its own fixture. That repetition is what the
   * split costs -- 30.8 s a part, traced -- and it is the price of every part
   * being independently runnable, independently traceable and independently
   * red.
   */
  async function aLoadedShell(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);

    // A prison in the list is the state a player reaches with the first thing
    // they do, and it is the only thing that puts the per-row Load and Delete
    // buttons on the page at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    /*
     * ---- where #174's own gate lives, and why not here (2026-08-31) --------
     *
     * Everything after this point loads the Build panel up on purpose -- six
     * orders queued and nine deliveries on their way -- so that the queue
     * block's and the deliveries block's controls are laid out somewhere for
     * this sweep to hit-test. Until issue #703 ruling 2 the second of those cost
     * the panel nothing at all, because it was inside a `hidden` row; it is laid
     * out whenever something is on its way now, and this panel's always-visible
     * budget at 1280x720 is **8px**. So the loaded panel scrolls, measured --
     * a state this test used to assert could not happen.
     *
     * **That claim is not weakened and it is not moved either: it was already
     * asserted in the test named for it**, `the Build panel arrives inside its
     * own fold, with nothing queued (#174)`, at these same five viewports and
     * with more teeth than this test ever had -- `scrollTop` 0, `panelOverflow`
     * 0, "Enter coordinates" inside the unscrolled fold, no box in the shrink
     * chain shorter than its own content, and a guard that fails if anything
     * *is* queued. A first pass at this branch added a duplicate of it here,
     * before the setup below; it was withdrawn when the sweep timed out at 180s
     * having previously passed at 174s -- the duplicate cost 15s of a budget its
     * own comment already calls tight, and bought nothing that test does not
     * already assert.
     *
     * What this test asserts in the loaded state is therefore what the loaded
     * state is about: nothing *clipped*. The rail invariants, the two catalogue
     * boxes containing their content, both section headers reachable by the
     * panel's own scroll, and the body's spill being scrollable and being the
     * deliveries block.
     */

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
     *
     * **The clause about starting the clock is out of date as of 2026-08-31 and
     * the press has moved**, not because the queue stopped needing to exist but
     * because ADR 0051 gave the worker a paused drain: a command submitted
     * against a stopped clock is executed and published without a tick. Six is
     * still six, for the reason above. See the block at the end of this setup
     * for what the press was costing while it sat here.
     */
    // `.ui-tab[data-tab="build"]`, which is what the sweep's own tab loop below
    // uses, and not `getByRole('button', { name: 'Build' })`: that name is only
    // unambiguous while this panel is *not* mounted, because the catalogue's own
    // section header ("What to build") matches it as a substring too. Measured on
    // 2026-08-31 as `strict mode violation ... resolved to 2 elements` -- from a
    // first pass that had opened the panel earlier in the test.
    await page.locator('.ui-tab[data-tab="build"]').click();
    const queueSetupCoordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await queueSetupCoordinates.getAttribute('aria-expanded')) === 'false') await queueSetupCoordinates.click();
    const queueSetupSubmit = page.locator('.hud-build__coordinates .ui-action');
    for (const tileY of [5, 6, 7, 8, 9, 10]) {
      await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
      await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(tileY));
      await queueSetupSubmit.click();
    }
    if ((await queueSetupCoordinates.getAttribute('aria-expanded')) === 'true') await queueSetupCoordinates.click();

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
     *
     * **The first clause of that stopped being true on 2026-08-31** (issue #703
     * ruling 2): the rows are laid out with the fold shut, so the sweep meets
     * them on its first pass rather than only in the state that opens the
     * disclosure. Everything else stands -- the list still has to be made
     * non-empty, still through the real application, and the fold is still shut
     * again afterwards. What the fold now reveals is the stepper and the buy
     * button, which is the pair the loop's own opened-state assertions are
     * about.
     */
    const setupBuyToggle = page.locator('.hud-build__buy-toggle');
    await setupBuyToggle.click();
    const setupBuy = page.locator('.hud-build__buy-submit');
    await expect(setupBuy).toBeVisible();
    for (let press = 0; press < 3; press += 1) await setupBuy.click();
    /*
     * **Nine, and it was three until #627.** `data-pending` counts every
     * delivery on its way, and since ADR 0017 decision 7 was implemented a
     * build order buys its own materials: the six orders queued above each
     * bought their two bricks the moment the clock let their command dispatch,
     * which is six lorries before this setup pressed Buy at all. Three presses
     * of a control that buys two bricks a press make nine.
     *
     * Written out rather than read off the panel and added to, because a
     * relative count would pass on a build where the orders bought nothing --
     * which is precisely the state #627 is about. If this figure ever reads
     * three again, a wall has stopped paying for itself.
     *
     * `data-pending` rather than a box: the block is inside a disclosure whose
     * own state this setup is about to change back, and the attribute is what
     * the panel writes when the projection answers with a non-empty list.
     *
     * Since #703 ruling 2 the block would answer a box question here too, and
     * the attribute is still the right one to poll: it is the count, and this
     * poll is about the count being **nine** rather than about anything being
     * painted.
     */
    await expect
      .poll(async () => page.locator('.hud-build__deliveries').getAttribute('data-pending'), {
        message: 'the six queued orders and three purchases never reached the Build panel as pending deliveries',
        timeout: 20_000,
      })
      .toBe('9');
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
    /*
     * ---- the clock, and why it is no longer running by now (2026-08-31) ----
     *
     * This setup used to press **Play** immediately after placing the six orders
     * and before buying anything, with the reason written where the queue is
     * built: *"a command is dispatched at a tick and a paused simulation would
     * leave all six in the kernel's queue with no order to show"*. It then
     * pressed Pause here, with the reason *"the deliveries would otherwise land
     * 100 ticks after they were bought and take their own controls with them"*.
     *
     * Both sentences describe the same window, and it is the window this test
     * kept flaking in: at x1 a delivery lands 5s after it is bought, the three
     * `Buy` presses and the poll sit inside those 5s, and on a loaded machine
     * they do not fit. Measured twice on 2026-08-31 -- `data-pending` read
     * `null` where `"9"` was required, which is every one of the nine having
     * landed rather than none having been bought. `docs/AGENT_WORKFLOW.md` lists
     * this test as a contention canary; this is one of the two mechanisms behind
     * that.
     *
     * **ADR 0051 removed the need for the first press**, and this is the first
     * test to take it up: the worker drains commands submitted against a paused
     * clock and publishes after them, so the six orders and the three purchases
     * all reach the panel with the clock stopped and **no tick can land a
     * delivery while the setup is still measuring**. The order of this block is
     * therefore the fix: place, buy, poll, and only then let the clock move at
     * all. Nothing above needs a tick and nothing below wants one.
     *
     * The press pair is kept rather than deleted, and reduced to a beat: the
     * sweep's later states include a hire and a room, both of which want a
     * simulation that has actually run, and *"paused"* is the state the rest of
     * this test is measured in.
     */
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    // And the state survived the beat: nine still on their way, and the queue
    // still drawn. Either one gone would make every measurement below a
    // measurement of a different panel.
    expect(
      await page.locator('.hud-build__deliveries').getAttribute('data-pending'),
      'the deliveries landed while the clock was let go, so the block is gone',
    ).toBe('9');
    expect(
      await page.locator('.hud-build__queue').boundingBox(),
      'the queue is gone, so there is no queue block for the sweep to reach',
    ).not.toBeNull();
  }

  /**
   * One viewport of the sweep: every tab, then every layout state the Build
   * panel and the Security tab can be put into, hit-testing every control in
   * the shell at each of them and accounting for every control at the end.
   *
   * The body is #88's original loop body, unchanged apart from taking its
   * viewport as a parameter instead of reading it from a `for` header.
   */
  async function everyControlAt(page: Page, width: number, height: number): Promise<void> {
    /** Whether this viewport's loaded panel spills, and by how much. */
    const spilled: string[] = [];

    await page.setViewportSize({ width, height });
    await expect
      .poll(async () => (await canvasMetrics(page))?.cssWidth, { message: `canvas did not follow ${width}px` })
      .toBe(width);

    // Which controls this viewport managed to hit-test at all, across every
    // state it visits. Accumulated so the "never laid out anywhere" check
    // below is about the viewport, not about one tab: the Build panel is
    // legitimately absent on four of the five tabs, and the Rooms panel on
    // the other four.
    const everMeasured = new Set<string>();
    /**
     * The last state's reading, whole. It used to be that state's `controls`
     * alone; it is the pair now, because the accounting below has to line each
     * name up with the identity the sweep remembered it by.
     */
    let inventory: ControlReachability = { controls: [], ids: [], measured: [], unreachable: [] };

    /**
     * Mark everything this state managed to hit-test, by the element's own
     * `ids` entry.
     *
     * Not by index: `ControlReachability.controls` carries the reason in full,
     * and the short version is that a state can add controls to the middle of
     * the document -- the regime editor's toggle groups are built on the first
     * paint that has a schedule -- so an index measured in one state names a
     * different control in the next.
     */
    const record = (reachability: ControlReachability): void => {
      for (const index of reachability.measured) {
        const id = reachability.ids[index];
        if (id !== undefined) everMeasured.add(id);
      }
    };

    // Every tab, and the list is  rather than a copy of it: this
    // loop was a hard-coded four when the Rooms tab landed, so the whole Rooms
    // panel was outside the sweep and the "never laid out anywhere" check
    // below reported all 26 of its controls as unreachable -- correctly, since
    // nothing had opened the tab they live on. Reading the real list means a
    // sixth tab cannot repeat that.
    for (const tab of HUD_TAB_IDS) {
      await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
      const reachability = await controlReachability(page);
      inventory = reachability;
      record(reachability);
      expect(
        reachability.unreachable,
        `controls covered by something else on the ${tab} tab at ${width}x${height}`,
      ).toEqual([]);
      if (tab === 'manage') {
        // The local-save list is a disclosure on this tab. Its row controls
        // must be reachable when the player opens it, not exempted as hidden.
        const savedPrisons = page.locator('.manage-saves');
        // Quick Save and Manage refresh independently. Wait for the actual
        // row before opening, so a late refresh cannot add hidden controls
        // after this state was measured.
        await expect(savedPrisons.locator('.manage-saves__item')).toHaveCount(1);
        await savedPrisons.locator('summary').click();
        const expanded = await controlReachability(page);
        inventory = expanded;
        record(expanded);
        expect(expanded.unreachable, `Manage saves controls unreachable at ${width}x${height}`).toEqual([]);
        await savedPrisons.locator('summary').click();
      }
    }

    /*
     * The Layout menu, opened (#1159).
     *
     * A state of its own rather than a row in the exemption list below,
     * because the four controls inside it -- two sliders, "Map only" and
     * "Reset layout" -- are genuinely reachable at every viewport and simply
     * live behind a press, exactly as the Build panel's coordinates section
     * does. Exempting them would say the opposite: that a phone cannot reach
     * them, which `hud.css` makes true of the minimap and is not true of
     * these.
     *
     * It is opened and shut again inside this block, so every later state in
     * this sweep measures the same page it measured before the menu existed.
     * The menu floats over the world (`.hud-layout__body` is
     * `position: absolute`), so an open one would cover whatever is under it
     * and the covering checks further down would be about the menu rather
     * than about the panel they name.
     */
    await page.locator('.hud-layout__button').click();
    const withLayoutMenu = await controlReachability(page);
    inventory = withLayoutMenu;
    record(withLayoutMenu);
    /*
     * Only the menu's **own** controls are required to be reachable here,
     * and that narrowing is the honest one rather than a convenience.
     *
     * `.hud-layout__body` floats over the world by design -- it is the one
     * surface in this HUD that is meant to, and `docs/VISUAL_IDENTITY.md`
     * says so -- so an open menu covers the top of the rail underneath it,
     * exactly as any menu covers what it opens over. Asserting that nothing
     * on the page is covered while a menu is open would be asserting that
     * the menu is not a menu. What must hold is that **the menu itself is
     * usable when open**, which is what this says, and that **nothing is
     * covered when it is shut**, which every other state in this sweep
     * already says.
     */
    expect(
      withLayoutMenu.unreachable.filter((entry) => entry.control.includes('hud-layout__body')),
      `the Layout menu's own controls are unreachable while it is open at ${width}x${height}`,
    ).toEqual([]);
    await page.locator('.hud-layout__button').click();
    await expect(page.locator('.hud-layout__body')).toBeHidden();

    /*
     * Saving is not a Build-tab activity, and the Build tab is where the
     * player spends their time. Named separately so a regression says so.
     *
     * **This was its own inline `page.evaluate` until 2026-09-15**, with its
     * own `scrollIntoView` and its own single centre sample -- so it carried
     * the hole `controlReachability` had, plus a weaker sample set, and would
     * have had to be fixed twice. It is the same sweep narrowed to one
     * selector instead, which also gains it the five sample points and a
     * failure that names what covered the button rather than only which
     * button it was.
     *
     * Two assertions rather than one, because narrowing the selector makes an
     * empty match possible in a way `INTERACTIVE_SELECTOR` never was: a save
     * panel that stopped rendering buttons, or a button collapsed to a zero
     * box, would leave nothing for the sweep to skip *and nothing to report*.
     * The count is the guard against a vacuous pass.
     */
    await page.locator('.ui-tab[data-tab="build"]').click();
    const saveButtons = await controlReachability(page, '.save-panel__button');
    expect(
      saveButtons.measured.length,
      `save-panel buttons with a box to hit-test at ${width}x${height}, of ${saveButtons.controls.length} matched`,
    ).toBe(saveButtons.controls.length);
    expect(saveButtons.controls.length, `the save panel drew no buttons at all at ${width}x${height}`).toBeGreaterThan(
      0,
    );
    expect(
      saveButtons.unreachable,
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
    //
    // **This is where that line used to be, and 2026-08-31 moved it.** It read
    // `expect(foldedRail.buildPanelScrolls, ...).toBe(false)` and it was true
    // of this loaded state until issue #703 ruling 2 gave the deliveries block
    // a box of its own: nine deliveries on their way put three 44px rows and a
    // header on a panel whose always-visible budget at 1280x720 is 8px, so it
    // scrolls, measured. The claim lives in `the Build panel arrives inside
    // its own fold, with nothing queued (#174)`, in the state #174 is about,
    // over the same `HUD_LAYOUT_VIEWPORTS` -- and what is asserted here
    // instead is that the panel is
    // *scrolling* rather than *clipping*: the rail invariants above, the
    // box-chain check below, and both headers reachable from the panel's own
    // scroll.

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
    //
    // **Corrected 2026-08-31 (issue #703 ruling 2), and the two claims part
    // company.** The paragraph above holds in the arrival state and is asserted
    // there, over the same `HUD_LAYOUT_VIEWPORTS`, by `the Build panel arrives
    // inside its own fold, with nothing queued (#174)`. In *this* state -- nine
    // deliveries on their way, six orders queued -- the panel scrolls, so "the
    // header sits above the unscrolled fold" is no longer a property this state
    // has, and `scrollTop` after the sweep is not zero either: reaching a
    // delivery Cancel below the fold is exactly what `scrollIntoView` is for.
    // What is asserted here is the claim that survives, and it is the one the
    // first #88 fix failed -- **the scroll reaches them** -- computed from the
    // panel's scroll content so that where the sweep left the scroll cannot
    // flatter it.
    /*
     * Both headers, and the question asked of each is whether the panel's own
     * scroll reaches it -- computed from the scroll content rather than by
     * performing a scroll, for the reason written inside the loop.
     *
     * The second of them is whatever *is* last. With a queue that is the queue
     * block's own header, and it is the header that says a queue exists at all
     * -- so a player who cannot reach it has not been told. Measured before an
     * assertion existed for it: the collapsed block is 45px and the rail had
     * 8px to spare at 1280x720 and none at 900x600, so the header ended **14px
     * and 37px below this fold** with nothing scrolled and no scroll that
     * reached it. `hud.css`'s `.hud-build[data-queued]` is what pays for it,
     * out of the catalogue's floor.
     */
    const reach = await page.evaluate(() => {
      const panel = document.querySelector('.hud-build');
      if (panel === null) return null;
      const named = document.querySelector('.hud-build__coordinates > .ui-section__header');
      const sections = [...document.querySelectorAll('.hud-build .ui-section')].filter(
        (section) => section.getClientRects().length > 0,
      );
      const last = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
      const panelTop = panel.getBoundingClientRect().top + panel.clientTop;
      const scrollTop = panel.scrollTop;
      const round = (value: number): number => Math.round(value * 100) / 100;
      /*
       * Where a header sits in the panel's **scroll content**, not on the
       * screen: its distance from the top of everything the panel can scroll
       * through.
       *
       * Arithmetic rather than a performed scroll, and that is a correction of
       * this block's own first draft. It called
       * `scrollIntoView({ block: 'nearest' })` and measured the box against
       * the fold with half a pixel of tolerance -- and the browser's scroll
       * arithmetic overshot by 0.047px on one run and 0.609px on the next,
       * from the same page at the same viewport, because where
       * `scrollIntoView` lands depends on the fractional scroll position it
       * starts from. A tolerance that has to be widened per run is not
       * measuring the layout. What is measured instead says the same thing
       * without moving anything: the header lies inside the scrollable
       * content, and it is shorter than the box that has to show it, so some
       * scroll position shows all of it.
       *
       * One `evaluate` for both headers and the spill below, because this test
       * spends 174s of its 180s budget and a round trip is not free.
       */
      const place = (header: Element | null) => {
        if (header === null) return null;
        const rect = header.getBoundingClientRect();
        const top = rect.top - panelTop + scrollTop;
        return {
          text: header.textContent?.trim() ?? '',
          top: round(top),
          bottom: round(top + rect.height),
          height: round(rect.height),
        };
      };
      const block = document.querySelector('.hud-build__deliveries');
      const headers = [place(named), place(last)];
      // Back to the top before anything else in this loop measures: the sweep
      // above reaches controls with `scrollIntoView` and leaves the panel
      // wherever the last one was. The arithmetic in `place` does not care,
      // and the states below this line do.
      panel.scrollTop = 0;
      return {
        headers,
        scrollContent: panel.scrollHeight,
        visible: panel.clientHeight,
        panelOverflow: panel.scrollHeight - panel.clientHeight,
        bodyShortfall: (() => {
          const body = document.querySelector('.hud-build > .ui-panel__body');
          return body === null ? -1 : body.scrollHeight - body.clientHeight;
        })(),
        blockHeight: round(block?.getBoundingClientRect().height ?? 0),
      };
    });
    expect(reach, `the Build panel has no box at ${width}x${height}`).not.toBeNull();
    // The numeric fallback is still the section this names, read from the
    // bundled catalog rather than typed as English (ADR 0011), and it is the
    // first of the two headers below.
    expect(reach?.headers[0]?.text, `the panel's numeric fallback section at ${width}x${height}`).toBe(
      localeText('hud.build.coordinates'),
    );
    /*
     * Both headers, and the question asked of each is whether the panel's own
     * scroll reaches it.
     *
     * The second of them is whatever *is* last. With a queue that is the queue
     * block's own header, and it is the header that says a queue exists at all
     * -- so a player who cannot reach it has not been told. Measured before an
     * assertion existed for it: the collapsed block is 45px and the rail had
     * 8px to spare at 1280x720 and none at 900x600, so the header ended **14px
     * and 37px below the fold** with nothing scrolled and no scroll that
     * reached it. `hud.css`'s `.hud-build[data-queued]` is what pays for it,
     * out of the catalogue's floor.
     */
    for (const header of reach?.headers ?? []) {
      expect(header, `a Build panel section header has no box at ${width}x${height}`).not.toBeNull();
      expect(
        header?.top ?? -1,
        `"${header?.text ?? ''}" starts above the Build panel's scroll content at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(0);
      // One pixel, and it is a units conversion rather than a tolerance:
      // `scrollHeight` is an integer and `getBoundingClientRect` is not, so a
      // box that ends exactly at the end of the scroll content reads as a
      // fraction past it. Measured at 375x812, where the queue header ends at
      // 597.23 in 597px of scroll content.
      expect(
        header?.bottom ?? Number.POSITIVE_INFINITY,
        `the Build panel's scroll does not reach "${header?.text ?? ''}" at ${width}x${height}: it ends ${Math.round((header?.bottom ?? 0) - (reach?.scrollContent ?? 0))}px past the ${reach?.scrollContent ?? 0}px the panel can scroll through`,
      ).toBeLessThanOrEqual((reach?.scrollContent ?? 0) + 1);
      expect(
        header?.height ?? Number.POSITIVE_INFINITY,
        `"${header?.text ?? ''}" is taller than the Build panel's visible box at ${width}x${height}, so no scroll position shows all of it`,
      ).toBeLessThanOrEqual(reach?.visible ?? 0);
    }

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
    /*
     * **Corrected 2026-08-31 (issue #703 ruling 2), and the body leaves this
     * list.** `.hud-build > .ui-panel__body` was the first of the three
     * selectors below and it is shorter than its own content in this state
     * now, at every viewport. Panel overflow, body shortfall and the
     * deliveries block's own height, measured in this test's state (nine
     * deliveries on their way, six orders queued, nothing opened):
     *
     * | Viewport | overflow | shortfall | block |
     * | --- | --- | --- | --- |
     * | 1280x720 | 229px | 229px | 226.86px |
     * | 1440x900 | 94px | 94px | 226.86px |
     * | 1024x768 | 193px | 193px | 226.86px |
     * | 900x600 | 178px | 178px | 180.48px |
     * | 375x812 | 158px | 158px | 213.67px |
     *
     * The first two columns are equal at all five and the third bounds them,
     * which is what the two assertions below say: **the panel can scroll
     * everything the body spills**, and **the spill is this block** rather than
     * some other box quietly clipping. They are written as `>=` and as "within
     * one gutter" rather than as those figures, because the figures move with
     * the catalogue, the queue and the "and N more" line -- 1440x900 has enough
     * slack that only 94px of a 226.86px block spills at all.
     *
     * That is the "harmless by coincidence" the paragraph above already
     * records for an opened fold, reached now without the player opening
     * anything -- which makes #174 item 2 a live question rather than a
     * documented curiosity, and its answer (which box yields when the sum
     * exceeds the rail) a layout decision this file cannot make. **What is
     * asserted instead is the part that keeps it harmless**: the spill is
     * scrollable, and it is this block rather than some other box quietly
     * clipping. The two catalogue boxes stay on the strict check, because
     * nothing about the ruling touches them.
     */
    expect(
      await page.evaluate(() =>
        ['.hud-build__catalogue', '.hud-build__catalogue > .ui-section__body']
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

    expect(reach?.bodyShortfall ?? -1, `the Build panel's body has no box at ${width}x${height}`).toBeGreaterThanOrEqual(0);
    if ((reach?.bodyShortfall ?? 0) > 0) {
      spilled.push(
        `${width}x${height} overflow=${reach?.panelOverflow ?? 0} spill=${reach?.bodyShortfall ?? 0} block=${reach?.blockHeight ?? 0}`,
      );
      expect(
        reach?.panelOverflow ?? 0,
        `the Build panel cannot scroll everything its body spills at ${width}x${height}`,
      ).toBeGreaterThanOrEqual(reach?.bodyShortfall ?? 0);
      // One gutter of slack: `--hud-build-map-gutter` is what sits between the
      // block and the hint above it, and it is 8px at the tall viewports and
      // `--space-1` under `max-height: 700px`.
      expect(
        reach?.bodyShortfall ?? 0,
        `the Build panel's body spills more than the deliveries block at ${width}x${height}: ${reach?.bodyShortfall ?? 0}px against a ${reach?.blockHeight ?? 0}px block`,
      ).toBeLessThanOrEqual(Math.ceil(reach?.blockHeight ?? 0) + 8);
    }

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
    record(expanded);
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
    record(buying);
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
     * Its Cancel controls are laid out in none of the states above. Without
     * this the `neverLaidOut` check below fails and names them, which is the
     * gate working: a control the sweep can never see is a control this test
     * cannot claim is reachable. Six orders are queued and the clock is
     * stopped, from before the loop, so there are six of them.
     *
     * **"Its three Cancel controls exist in the DOM at every moment" is
     * withdrawn as of #862, and both halves of it moved.** The rows are still
     * pooled -- the HUD's busy group has `add` and no `remove`, and a row per
     * order would grow it without bound over a session -- but the pool's
     * ceiling is now `BUILD_QUEUE_ROW_LIMIT` = 64 rather than 3, and it is
     * filled *on demand*: a panel that has never seen a queue holds no rows,
     * and this one holds exactly the six the orders below need. That is why
     * the count in this sweep follows the orders rather than the constant, and
     * it is why the ceiling could move at all -- what the busy group depends
     * on is that the pool has a ceiling, not that it is built up front.
     */
    const queueFold = page.locator('.hud-build__queue > .ui-section__header');
    await expect(queueFold, `the queue fold is missing at ${width}x${height}`).toBeVisible();
    await queueFold.click();
    await expect(page.locator('.hud-build__queue-list')).toBeVisible();

    /*
     * Every revealed control is inside the panel's *visible* box, measured
     * the way #174 measures it and for the reason the buy row's own check
     * above gives: opening a fold that reveals controls below the panel's own
     * fold has not revealed them.
     *
     * **Each row is scrolled to before it is measured, and that is new with
     * #862.** The sentence this replaces said the opposite -- *"`controlReachability`
     * below cannot make this claim, because it calls `scrollIntoView` first.
     * Measured over all three rows rather than one, because they are stacked
     * and only the last is at risk -- 38px, 90px and 142px of clearance at
     * 1280x720 today"* -- and it was right about a list whose box held every
     * row it drew. `.hud-build__queue-list` is now a scroll container capped
     * at three rows, because the queue's own height is bought out of the
     * catalogue's floor and there is nothing to buy it a second time, so a
     * sixth row is *clipped by the list* rather than laid out below the
     * panel's fold. Those are different defects and only the second is #174:
     * the first is a list longer than its box, which `controlReachability`'s
     * own docblock already calls *"not a defect"*.
     *
     * So the claim this block still makes, and it is the one worth making, is
     * that no row is reachable **only** by scrolling something the player
     * cannot: after the row's own list has been scrolled to it, the control is
     * inside the panel's visible box at both edges. `railIntegrity` below
     * carries the other half -- that a box with more content than room is one
     * a pointer can actually scroll.
     */
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
          control.scrollIntoView({ block: 'nearest' });
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
    inventory = queued;
    record(queued);
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
    await page.locator('.ui-tab[data-tab="zones"]').click();

    /*
     * The Rooms panel's typed route (#411, ADR 0038), expanded for exactly
     * the reason the Build panel's coordinates are expanded above: its
     * thirteen controls are in the DOM at every moment and laid out at none
     * of the states visited so far, so without this state the accounting
     * assertion at the foot of the sweep fails and names all thirteen --
     * which is the gate doing its job rather than a reason to exempt them.
     *
     * They live inside `.hud-rooms__list`, which is a scroll container at
     * every viewport, so most of them are out of view when the form opens.
     * That is not a collision and `controlReachability` scrolls each control
     * into view before hit-testing it, which is the question worth asking:
     * once it is on screen, can it be pressed.
     *
     * Folded again afterwards, because an open form ends the drawing pass --
     * the panel stays out of the world's way only while the form is closed,
     * and the drag below needs that fold at 375x812.
     */
    const roomCoordinates = page.locator('.hud-rooms__coordinates > .ui-section__header');
    if ((await roomCoordinates.getAttribute('aria-expanded')) === 'false') await roomCoordinates.click();
    const typedRoute = await controlReachability(page);
    inventory = typedRoute;
    record(typedRoute);
    expect(
      typedRoute.unreachable,
      `controls covered by something else with the Rooms coordinates expanded at ${width}x${height}`,
    ).toEqual([]);
    if ((await roomCoordinates.getAttribute('aria-expanded')) === 'true') await roomCoordinates.click();

    const roomArm = page.locator('.hud-rooms__arm');
    await expect(roomArm, `the Rooms panel's arm control is missing at ${width}x${height}`).toBeVisible();
    await roomArm.click();
    const dragged = await dragRectangleOnWorld(page);
    // Every viewport, 375x812 included, and that last one is the change:
    // arming folds the panel to its header, so the world it is drawn on is
    // there to be drawn on. Asserted rather than tolerated, so a layout change
    // that took the world away again -- at any viewport -- fails here instead
    // of quietly changing what this test covers.
    expect(dragged, `a room drag found no bare world at ${width}x${height}`).not.toBeNull();

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
    inventory = roomsReachability;
    record(roomsReachability);
    expect(
      roomsReachability.unreachable,
      `controls covered by something else with a room pending at ${width}x${height}`,
    ).toEqual([]);

    // Discarded, so the next viewport starts from the state this one did.
    await page.locator('.hud-rooms__cancel').click();

    /*
     * The regime editor, opened (#1167, ADR 0113 slice 1).
     *
     * **A state of its own rather than a row in the exemption list**, on
     * exactly the reading the Layout menu's block above states: these toggles
     * are offered to a player at every viewport and simply live behind a
     * press, like the Build panel's coordinates and the Rooms panel's typed
     * route. `NEVER_LAID_OUT_BELOW_720` is for a control that is mechanically
     * absent -- `.hud__corner` is `display: none` there -- and no rule in
     * `hud.css` touches this section at any width. Exempting it would have
     * said a player cannot reach it, which is false, and would have said it
     * about the only controls the change under test adds, which is the shape
     * #533's block calls certifying every control on the page except the one
     * the change is about. (#1201 is the same ruling one step further on: the
     * alerts fold left that constant because its control was *made* reachable,
     * not because a state was added. Nothing here needed making.)
     *
     * **The day-plan tab first, because the editor is only populated there.**
     * `regimePanel.setVisible(false)` clears the schedule on the way out
     * (`src/ui/hud/regime-panel.ts`), and `paintEditor` hides the section with
     * no schedule to paint; the toggle groups themselves are pooled, so they
     * stay in the document once built and stay in the inventory for every
     * later state. That asymmetry -- a control that is in the document from
     * the fifth state and not from the first -- is what `ControlReachability`
     * records above.
     *
     * `aria-expanded` is read rather than the header clicked blind, the same
     * handshake the Rooms coordinates and the staff roster use: the section is
     * created `collapsed: true`, and the flag survives the panel being hidden
     * and shown again by a tab change, so a blind click is a claim about the
     * arrival state rather than a reading of it.
     */
    await page.locator('.ui-tab[data-tab="day-plan"]').click();
    const regimeEditor = page.locator('.hud-regime__editor > .ui-section__header');
    await expect(regimeEditor, `the regime editor is missing at ${width}x${height}`).toBeVisible();
    if ((await regimeEditor.getAttribute('aria-expanded')) === 'false') await regimeEditor.click();
    /*
     * Non-vacuity, and it is not ceremony: the editor draws one group per
     * classification group and draws nothing at all when the schedule has not
     * arrived, so an empty body would sail through `record` below and leave
     * the toggles in exactly the state this block exists to end -- laid out in
     * no state, but with the block present to suggest otherwise.
     */
    const editorShape = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('.hud-regime__editor-list .ui-toggles')];
      return {
        groups: groups.length,
        rows: document.querySelectorAll('.hud-regime__block-list .hud-regime__block-row').length,
        smallest: Math.min(...groups.map((group) => group.querySelectorAll('.ui-toggles__option').length)),
      };
    });
    // Read off the page rather than compared against a written-down fourteen:
    // the counts are a classification vocabulary and an action-category
    // vocabulary, both of which are meant to grow, and a tally in a test is
    // the sentence that rots first. What is asserted is the *relation* -- one
    // group per block the panel drew, and more than one category in each, so
    // `lockedCategoryIdsFor` has something to lock.
    expect(editorShape.groups, `the open regime editor drew no toggle groups at ${width}x${height}`).toBe(
      editorShape.rows,
    );
    expect(editorShape.groups, `the regime panel drew no blocks at ${width}x${height}`).toBeGreaterThan(0);
    expect(
      editorShape.smallest,
      `a regime editor group offers fewer than two categories at ${width}x${height}`,
    ).toBeGreaterThan(1);
    const regimeEditing = await controlReachability(page);
    inventory = regimeEditing;
    record(regimeEditing);
    expect(
      regimeEditing.unreachable,
      `controls covered by something else with the regime editor open at ${width}x${height}`,
    ).toEqual([]);
    // Shut again, so the next viewport's pixel assertions are taken against
    // the arrival state the ones in this one were.
    if ((await regimeEditor.getAttribute('aria-expanded')) === 'true') await regimeEditor.click();

    /*
     * Somebody on the payroll (#533), which is the Staff panel's equivalent of
     * the buy row and the queue fold above and is here for the identical
     * reason: the roster section's own header and its three `Dismiss` controls
     * exist in the DOM at every moment -- the rows are pooled, so the HUD's
     * busy group, which has `add` and no `remove`, cannot grow over a session
     * -- and are laid out in none of the states above, because nothing above
     * hires anybody. Without this state the accounting assertion at the foot of
     * the sweep fails and names all four, which is the gate doing its job.
     *
     * **Driven rather than exempted, and that is the point of it.** `Dismiss`
     * is the control issue #533 adds; putting it on
     * `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD` would have certified every control
     * on this page except the one the change is about. It is reachable by a
     * gesture this sweep can make -- somebody has to be *hired*, which is one
     * press -- where the three `Release` rows on that constant need a guard to
     * be *held*, which nothing here can arrange. That difference is the whole
     * of why those three stay exempt and these four do not, and the constant's
     * comment carries the measurement.
     *
     * **Last in the viewport's body rather than first.** Every pixel assertion
     * in this loop is measured in the arrival state, and a hired roster adds a
     * section to a panel that shares `.hud__side` with the ones being measured.
     * So the hires happen after all of them and the dismissals below put the
     * panel back before the next viewport measures anything. That ordering is
     * belt and braces rather than the thing that makes it safe: the panels in
     * `.hud__side` swap by tab, so the Staff panel has no box at all while
     * those assertions are taken. `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD` above
     * carries the ten measurements.
     *
     * **The clock is paused, from before the loop, and both halves of this
     * block rest on it.** ADR 0051's paused drain dispatches a command given
     * against a stopped clock immediately, so the hires and the dismissals land
     * with no tick; and because no tick runs, `DeploymentSystem`'s
     * `assignUnassignedGuards` -- called only from its `update`
     * (`src/simulation/security/deployment-system.ts:130`) -- never claims any
     * of them, so all three stay `'unassigned'` and not one becomes a held
     * guard. That is exactly the state issue #533 was measured in, and it is
     * why hiring here does not shorten the constant below.
     */
    await page.locator('.ui-tab[data-tab="manage"]').click();
    const staffMetric = page.locator('[data-metric="staff"] .ui-stat__value');
    await expect(staffMetric, `the prison already has staff at ${width}x${height}`).toHaveText('0');
    // Enabled on arrival, because `createStaffPanel` preselects
    // `model.roles[0]` -- so this is one press and not a two-step gesture.
    // Asserted rather than assumed: a Hire button that arrived disabled would
    // otherwise reach the loop below as three silent no-ops.
    const hireStaff = page.locator('.hud-staff__hire');
    await expect(hireStaff, `the Hire control is not pressable at ${width}x${height}`).toBeEnabled();
    for (let hired = 1; hired <= STAFF_ROSTER_ROW_LIMIT; hired += 1) {
      await hireStaff.click();
      // The metric after every press, so a *refused* hire fails here and says
      // so. Insufficient funds is the only reason this panel can provoke and
      // the balance is nowhere near it, but a refusal that went unasserted
      // would arrive at the reachability call below as a roster one row short
      // -- i.e. as a control reported never laid out, which is the same red
      // for a different reason and would read as a layout defect.
      await expect(
        staffMetric,
        `hire ${hired} of ${STAFF_ROSTER_ROW_LIMIT} did not reach the payroll at ${width}x${height}`,
      ).toHaveText(String(hired));
    }

    // The section is created `collapsed: true`, so its body has no box until
    // the player opens it. The same `aria-expanded` handshake the Rooms
    // panel's typed route above uses, and read rather than toggled blind
    // because the flag survives the section being hidden between viewports.
    const rosterFold = page.locator('.hud-staff__roster > .ui-section__header');
    await expect(rosterFold, `the roster fold is missing at ${width}x${height}`).toBeVisible();
    if ((await rosterFold.getAttribute('aria-expanded')) === 'false') await rosterFold.click();
    // `[data-staff]` and not `:not([hidden])`: it is the attribute the panel
    // writes when a row actually names somebody, so this waits for the
    // projection to have answered rather than for the row to have a box.
    const rosterRows = page.locator('.hud-staff__roster .hud-staff__held-row[data-staff]');
    await expect(rosterRows, `the open roster drew no rows at ${width}x${height}`).toHaveCount(
      STAFF_ROSTER_ROW_LIMIT,
    );


    const payroll = await controlReachability(page);
    inventory = payroll;
    record(payroll);
    expect(
      payroll.unreachable,
      `controls covered by something else with the payroll open at ${width}x${height}`,
    ).toEqual([]);
    // The rail still holds with a section the arrival state does not have. The
    // Staff panel is `overflow-y: auto` (`hud.css`, `.ui-panel.hud-staff`), so
    // the excess is the panel's own to scroll and never the rail's to hang off
    // its edge -- which is the claim that makes the placement above safe, so it
    // is asserted here rather than argued in the comment.
    expect(
      railInvariants(await railIntegrity(page)),
      `the rail with the payroll open at ${width}x${height}`,
    ).toEqual({ railOverflow: 0, offScreen: [], stuck: [] });

    /*
     * Emptied again, so the next viewport starts from the state this one did
     * -- and pressing `Dismiss` is the only way to empty it, which makes the
     * restoration and the proof that the control does what it says the same
     * three presses.
     *
     * The *first* row every time rather than one row each: the rows are pooled
     * and republished, so "the second row" is not a stable name for a person --
     * `staff-panel.ts` says so where it writes `data-staff`. Both the metric
     * and the row count are waited for between presses, and the second is not
     * redundant: the metric moves on the counts publication while the rows move
     * on the projection read that publication triggers, so a press timed
     * between the two would name somebody already dismissed and be refused as
     * `dismiss.unknown-staff`.
     *
     * **Two presses per dismissal, and this loop used to make one** (issue
     * #877, the owner's ruling of 2026-09-03). A dismissal is confirmed now:
     * the first press arms the row and states who is about to be sacked, the
     * second sends the command. Nothing else about the gesture changed -- same
     * control, no modal, no second button -- so the count assertions below are
     * untouched and still fail if either press stops working.
     *
     * `.first()` is re-resolved for the second press deliberately rather than
     * held: it selects `[data-staff]`, the arm publishes nothing, and a
     * re-resolution that found a different row would mean the roster moved
     * between the two presses, which is exactly what #877's fix forbids. If
     * that ever happens the confirmed press lands on a row the arm was not on
     * and `pressDismiss` arms *that* row instead of sending anything -- so the
     * metric below does not move and this sweep goes red rather than quiet.
     */
    for (let remaining = STAFF_ROSTER_ROW_LIMIT - 1; remaining >= 0; remaining -= 1) {
      await rosterRows.first().locator('.ui-action').click();
      /*
       * Armed, not sent -- asserted rather than assumed, so a confirm step
       * that silently stopped arming would fail here instead of leaving the
       * dismissals below to pass for the wrong reason.
       *
       * **Once per viewport, on the first of the three, and the reason is this
       * test's budget rather than tidiness.** It is the most expensive test in
       * the suite, `test.slow()` triples its 60 s and its own comment above
       * records 14-28 s on an idle machine -- but it has been measured at
       * **2.9 m against that 3.0 m** on a box running other suites
       * (`docs/AGENT_WORKFLOW.md`, the contention canaries). The confirm step
       * already doubles this block's presses from 15 to 30 across the sweep,
       * which is irreducible; a poll per press is not, so it is spent where it
       * proves the same thing.
       */
      if (remaining === STAFF_ROSTER_ROW_LIMIT - 1) {
        await expect(
          page.locator('.hud-staff__roster .hud-staff__held-row[data-dismiss="armed"]'),
          `the first press did not arm a roster row at ${width}x${height}`,
        ).toHaveCount(1);
      }
      await rosterRows.first().locator('.ui-action').click();
      await expect(
        staffMetric,
        `a dismissal did not take somebody off the payroll at ${width}x${height}`,
      ).toHaveText(String(remaining));
      await expect(
        rosterRows,
        `the roster still names ${remaining + 1} people after a dismissal at ${width}x${height}`,
      ).toHaveCount(remaining);
    }
    // And with nobody hired the section is gone entirely, which is what the
    // arrival state is: `paintRoster` hides it on `roster.hired === 0` rather
    // than leave a header promising a list that cannot exist. Asserted, because
    // it is the state every pixel assertion at the next viewport is measured
    // against -- and it is also why the fold is not clicked shut again. A
    // hidden section has no box, so its `aria-expanded` flag is not a state
    // anything in this loop can measure, and it cannot be clicked shut while
    // hidden; the read above reopens it at the next viewport either way.
    await expect(
      page.locator('.hud-staff__roster'),
      `the roster section outlived the last dismissal at ${width}x${height}`,
    ).toBeHidden();

    await page.locator('.ui-tab[data-tab="build"]').click();
    // The inventory is an element snapshot, not a catalogue of labels. A
    // background save can replace Manage's row after its first measurement,
    // minting new element ids while its disclosure is shut. Revisit both
    // panels at the end so the final accounting tests the controls that are
    // actually in the document now.
    const finalBuild = await controlReachability(page);
    record(finalBuild);
    const finalSaves = page.locator('.manage-saves');
    await page.locator('.ui-tab[data-tab="manage"]').click();
    await expect(finalSaves.locator('.manage-saves__item')).toHaveCount(1);
    if ((await finalSaves.getAttribute('open')) === null) await finalSaves.locator('summary').click();
    await expect(finalSaves).toHaveAttribute('open', '');
    await expect(finalSaves.getByRole('button', { name: 'Load' })).toBeVisible();
    await expect(finalSaves.getByRole('button', { name: 'Delete' })).toBeVisible();
    inventory = await controlReachability(page);
    record(inventory);
    expect(inventory.unreachable, `final Manage controls unreachable at ${width}x${height}`).toEqual([]);

    // Nothing got a free pass by never being laid out. At desktop widths the
    // Build and Manage controls have each been revisited in their visible
    // state, so the list is empty; at 720px and below the responsive rules drop
    // `.hud__corner` outright — the minimap and the alerts section — and
    // those two controls genuinely cannot be reached at any tab. That is a
    // deliberate responsive decision (see `hud.css`), named here so it stays
    // one: it is the honest limit of what this test can claim about a phone.
    //
    // `NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD` is added at *every* viewport, and
    // for a different kind of reason: not a responsive decision but a state
    // this sweep cannot put the simulation into, measured and recorded on that
    // constant. Those three sentences used to read "a gesture this sweep does
    // not make [...] which since ADR 0036 is a weaker claim than the
    // simulation gap it used to record", and both halves are now wrong: the
    // sweep does make the hiring gesture (see "Somebody on the payroll (#533)"
    // above), and what those rows need is not a gesture but a *tick*, which is
    // the stronger claim again. Sorted together because the assertion compares
    // the sweep's document order.
    const exempt = [
      ...(width <= 720 ? NEVER_LAID_OUT_BELOW_720 : []),
      ...NEVER_LAID_OUT_WITHOUT_A_HELD_GUARD,
      NEVER_LAID_OUT_WITHOUT_ZOOM_DRAWER,
    ];
    const neverLaidOut = inventory.controls.filter(
      (_, index) => !everMeasured.has(inventory.ids[index] ?? ''),
    );
    expect([...neverLaidOut].sort(), `controls never laid out in any state at ${width}x${height}`).toEqual(
      [...exempt].sort(),
    );
    /*
     * The same fact as a tally, and it is counted over the inventory rather
     * than over `everMeasured` itself: the set also holds names that existed
     * in an earlier state and do not survive into the final one, so its raw
     * size is not a statement about this inventory. Kept although the check
     * above now implies it, because the number is what a reader checks a
     * changed shell against.
     */
    const measuredInInventory = inventory.ids.filter((id) => everMeasured.has(id)).length;
    expect(
      measuredInInventory,
      `hit-tested only ${measuredInInventory} of ${inventory.controls.length} controls at ${width}x${height}`,
    ).toBe(inventory.controls.length - exempt.length);
    /*
     * Non-vacuity for the spill assertions above: they sit behind a condition,
     * so a build where the body never spills would satisfy them by never
     * running them -- and that build is the one where the deliveries block has
     * no box, which is what #703 ruling 2 is about. Printed as well as
     * asserted, because the figures are what a later mobile pass will want.
     *
     * **This was one check over all five viewports and is now one per
     * viewport**, which is the only assertion the #1181 split changed, and it
     * changed in the direction of more teeth: "somewhere" became "here". It is
     * safe to demand because every viewport does spill and not marginally --
     * measured on `e221e927`, in the traced run the split is justified by:
     * 179px at 1280x720, 44 at 1440x900, 143 at 1024x768, 151 at 900x600 and
     * 160 at 375x812, against a deliveries block of 180.48-226.86px. A
     * viewport that stops spilling is a finding about the block's height, not
     * a flake, and it now says which viewport.
     */
    console.log(`[703] the loaded Build panel's body at ${width}x${height} spills: ${JSON.stringify(spilled)}`);
    expect(
      spilled.length,
      `the loaded Build panel's body did not go over its box at ${width}x${height}, so the deliveries block has no height there and the spill assertions never ran`,
    ).toBeGreaterThan(0);
  }


  /**
   * Five tests, generated from `HUD_LAYOUT_VIEWPORTS` rather than written out,
   * and that is how the reach of the assertion is kept exactly what it was.
   *
   * The whole was `for (const [width, height] of HUD_LAYOUT_VIEWPORTS)` around
   * the body `everyControlAt` now holds; the parts are `for (const [width,
   * height] of HUD_LAYOUT_VIEWPORTS)` around a `test` that calls it with the
   * same pair. The union of the parts is therefore the same iteration of the
   * same constant, by construction rather than by care, and a sixth viewport
   * added to that constant grows a sixth test instead of being silently
   * missed. Per-control coverage did not move either: the accounting pair at
   * the foot of `everyControlAt` -- `neverLaidOut` against the exemption list,
   * and `everMeasured.size` against the inventory -- was always **per
   * viewport**, so each part still proves that every control in the shell was
   * hit-tested at its own size.
   */
  for (const [width, height] of HUD_LAYOUT_VIEWPORTS) {
    test(`every control can actually be pressed, on every tab at ${width}x${height} (#88)`, async ({ page }) => {
      test.slow();
      await aLoadedShell(page);
      await everyControlAt(page, width, height);
    });
  }

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

    // `HUD_LAYOUT_VIEWPORTS`, shared with the #88 sweep since 2026-08-31 rather
    // than copied: that sweep no longer asserts this panel arrives unscrolled --
    // its state carries a deliveries block now (#703 ruling 2) -- so this test is
    // where the claim lives, and it is only the sweep's counterpart while the two
    // cover the same sizes.
    for (const [width, height] of HUD_LAYOUT_VIEWPORTS) {
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

  /**
   * The catalogue's category filter, and what it costs (#390,
   * [ADR 0035](../../docs/adr/0035-buildable-catalogue-category-filter.md)).
   *
   * **The measurement this test exists for, and the correction it carries.**
   * ADR 0031's Status derived a figure -- "one row of twenty-one visible" at
   * 900x600 with a queue -- from two numbers it had measured, and flagged it as
   * derived. Re-measured here on the assembled page, it is exactly right: the
   * catalogue list is a 44px box over 924px of 44px rows, and one row of
   * twenty-one is on screen. Nothing about it was optimistic.
   *
   * What the filter does and does not fix follows from that, and both halves
   * are asserted below because getting the claim wrong is the way this work
   * gets undone:
   *
   *   - It does **not** change how many rows are on screen. The list's box is
   *     set by the rail, the save panel and ADR 0031 decision 3's donation, and
   *     a filter changes none of them: at 900x600 with a queue it is a 44px box
   *     before and a 44px box after. Anything that claims otherwise is claiming
   *     the panel got taller, and it did not.
   *   - It **does** change how far a player scrolls to reach a row they cannot
   *     see, which is the thing choosing what to build actually costs. At the
   *     same viewport the list goes from 880px of scroll to 264px, and the
   *     largest group is six rows against the registry's twenty-one.
   *
   * **And it costs the panel nothing at all**, which is the claim that made it
   * buildable rather than merely desirable. The control shares the catalogue
   * header's 44px tap target (`headerAction` on `createCollapsibleSection`), so
   * every floor `hud.css` sums for this panel is unchanged: the assertions below
   * re-check the panel's overflow, the shrink chain's shortfalls and the header
   * row's height at all five viewports, in both the arrival state and the
   * queued one. A control anywhere else in the body would have cost a tap
   * target, and ADR 0031 measured 7.8px between the last section and the fold at
   * 900x600 on arrival and a single 44px row of catalogue with a queue.
   *
   * **Not merged into the #88 sweep, and the reason is that sweep's own gate.**
   * The filter is laid out in every state the sweep visits, so it needs no new
   * setup there -- unlike #392's control, which the sweep could not reach until
   * its setup was extended. What the sweep must *not* do is choose a category:
   * `visibleBuildableIds` hides the rows of every other group, and a hidden row
   * is a row `neverLaidOut` would name. So the filter stays on "Everything"
   * there -- which is also the arrival state -- and the filtered state is
   * measured here, where hiding rows is the subject rather than a side effect.
   */
  test('the catalogue can be filtered to one category, and the filter costs the panel nothing (#390)', async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.locator('.hud-build')).toBeVisible();

    const filter = page.locator('.hud-build__category');
    await expect(filter).toBeVisible();
    // The option a player reads, not the id behind it: ADR 0011 puts the key on
    // one side of that boundary and the text on the other, and driving the
    // control by its label is what proves the content entry is wired at all.
    const largestGroup = localeText('object.category.furniture.name');

    /*
     * The catalogue, as boxes. Never `toContainText`: #220 found a row with a
     * real 78x44 rectangle and `offsetParent` set that was not on screen at any
     * viewport while a rendered-text assertion passed, and every figure here is
     * about whether rows can be reached rather than about what they say.
     */
    const catalogue = async (): Promise<{
      readonly laidOutRows: number;
      readonly listBox: number;
      readonly listContent: number;
      readonly scrollToLast: number;
      readonly headerRowHeight: number;
      readonly filterBox: { readonly width: number; readonly height: number };
      readonly filterHitsItself: boolean;
      readonly selectedInsideList: boolean;
      readonly panelOverflow: number;
      readonly shortfalls: readonly string[];
      readonly lastSectionText: string;
      readonly lastSectionBottom: number;
      readonly fold: number;
    } | null> =>
      page.evaluate(() => {
        const panel = document.querySelector('.hud-build');
        const list = document.querySelector('.hud-build__list');
        const headerRow = document.querySelector('.hud-build__catalogue > .ui-section__header-row');
        const control = document.querySelector<HTMLSelectElement>('.hud-build__category');
        if (panel === null || list === null || headerRow === null || control === null) return null;

        const rows = [...list.querySelectorAll<HTMLElement>('.ui-row')].filter(
          (row) => row.getClientRects().length > 0,
        );
        const listTop = list.getBoundingClientRect().top + list.clientTop;
        const selected = rows.find((row) => row.dataset['selected'] === 'true') ?? null;
        const filterRect = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          filterRect.x + filterRect.width / 2,
          filterRect.y + filterRect.height / 2,
        );
        const sections = [...document.querySelectorAll('.hud-build .ui-section')].filter(
          (section) => section.getClientRects().length > 0,
        );
        const last = sections.at(-1)?.querySelector('.ui-section__header') ?? null;
        const panelBox = panel.getBoundingClientRect();

        return {
          laidOutRows: rows.length,
          listBox: Math.round(list.clientHeight * 10) / 10,
          listContent: Math.round(list.scrollHeight * 10) / 10,
          scrollToLast: Math.round((list.scrollHeight - list.clientHeight) * 10) / 10,
          headerRowHeight: Math.round(headerRow.getBoundingClientRect().height * 10) / 10,
          filterBox: { width: Math.round(filterRect.width), height: Math.round(filterRect.height) },
          filterHitsItself: hit !== null && (control === hit || control.contains(hit)),
          selectedInsideList:
            selected !== null &&
            selected.getBoundingClientRect().top >= listTop - 0.5 &&
            selected.getBoundingClientRect().bottom <= listTop + list.clientHeight + 0.5,
          panelOverflow: panel.scrollHeight - panel.clientHeight,
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
          lastSectionText: last?.textContent?.trim() ?? '',
          lastSectionBottom: last?.getBoundingClientRect().bottom ?? Number.NaN,
          fold: panelBox.top + panel.clientTop + panel.clientHeight,
        };
      });

    /*
     * Both states, because they are two different panels: with nothing queued
     * the catalogue's floor is two rows, and with a queue ADR 0031 decision 3
     * drops it to one. The queued half is the one #390 is about, and it is the
     * one the #88 sweep already measures -- so this test builds the queue the
     * same way that sweep does, through the panel's own numeric route, and
     * pauses the clock to freeze it.
     */
    for (const queued of [false, true] as const) {
      if (queued) {
        const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
        if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
        const submit = page.locator('.hud-build__coordinates .ui-action');
        for (const tileY of [5, 6, 7, 8, 9, 10]) {
          await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
          await page.getByRole('spinbutton', { name: 'Tile Y' }).fill(String(tileY));
          await submit.click();
        }
        if ((await coordinates.getAttribute('aria-expanded')) === 'true') await coordinates.click();
        await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
        await expect
          .poll(async () => (await page.locator('.hud-build__queue').boundingBox()) !== null, {
            message: 'six placed orders never reached the Build panel as a queue',
            timeout: 20_000,
          })
          .toBe(true);
        /*
         * **And then the materials those orders bought have to arrive, which is
         * new on 2026-08-31 (issue #703 ruling 2).**
         *
         * Since #640 a `PlaceBuildOrder` buys its own materials, so the six
         * orders above put six deliveries in transit -- and since the ruling the
         * deliveries block has a box of its own, which costs this panel 181px at
         * 1280x720 and makes every absolute figure below a measurement of a
         * *third* state rather than of "the panel with a queue". Measured with
         * the wait absent: `panelOverflow` 181 against the 0 asserted below,
         * `.hud-build > .ui-panel__body` 181px shorter than its own content, and
         * the queue header past the fold -- all of it the deliveries block and
         * none of it the filter, which is what this test is about.
         *
         * The state this test needs is therefore a queue whose materials have
         * *landed*: reachable, because a delivery arrives 100 ticks after it is
         * bought while six orders take about 370 to build, so the clock runs on
         * until the block is gone and the queue is still there. Both are
         * asserted rather than assumed -- the second is what would go wrong if
         * construction ever outran procurement.
         */
        await expect
          .poll(async () => page.locator('.hud-build__deliveries').getAttribute('data-pending'), {
            message: 'the materials the six orders bought never arrived, so the panel still carries a deliveries block',
            timeout: 30_000,
          })
          .toBeNull();
        await page.locator('.hud-strip__transport [title="Pause"]').click();
        expect(
          await page.locator('.hud-build__deliveries').boundingBox(),
          'the deliveries block still has a box, so this is not the state this test measures',
        ).toBeNull();
        expect(
          await page.locator('.hud-build__queue').boundingBox(),
          'the crew emptied the queue while the materials were arriving, so there is no queue to measure',
        ).not.toBeNull();
      }
      const state = queued ? 'with a queue' : 'with nothing queued';

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

        // The arrival state of the filter is "Everything", so this is also the
        // panel as it was before the filter existed.
        const everything = await catalogue();
        expect(everything, `the Build panel has no catalogue at ${width}x${height}`).not.toBeNull();
        if (everything === null) continue;

        // Vacuity guard: a panel that failed to lay out reports plausible,
        // meaningless numbers and every comparison below would hold.
        expect(everything.laidOutRows, `the catalogue laid out no rows at ${width}x${height}`).toBeGreaterThan(10);
        // Every row is one tap target tall and the list holds nothing else, so
        // this is what says the filter control did not leak into the list --
        // where it would have cost a row rather than nothing.
        expect(
          everything.listContent,
          `the unfiltered catalogue list is not ${everything.laidOutRows} rows of 44px at ${width}x${height}`,
        ).toBe(everything.laidOutRows * 44);

        await filter.selectOption({ label: largestGroup });
        const filtered = await catalogue();
        expect(filtered, `the Build panel has no catalogue once filtered at ${width}x${height}`).not.toBeNull();
        if (filtered === null) continue;

        /*
         * The largest group is six rows, and the selected row is kept on screen
         * whatever group it is in, so a filtered list is seven rows at worst.
         * Six is written out in
         * `tests/foundation/buildable-category-contract.test.ts` as a table of
         * every buildable and its group, so a content row that made a group
         * larger than this fails there, naming the row, rather than here.
         */
        expect(
          filtered.laidOutRows,
          `the largest filtered group is more than six rows plus the selection at ${width}x${height}, ${state}`,
        ).toBeLessThanOrEqual(7);
        expect(
          filtered.laidOutRows,
          `filtering to "${largestGroup}" left the whole catalogue on screen at ${width}x${height}, ${state}`,
        ).toBeLessThan(everything.laidOutRows);

        // The box is unchanged and the content is not: the filter buys reach,
        // not height, and claiming otherwise is claiming the panel grew.
        expect(
          filtered.listBox,
          `the catalogue list changed size when it was filtered at ${width}x${height}, ${state}`,
        ).toBe(everything.listBox);
        expect(
          filtered.scrollToLast,
          `filtering did not shorten the scroll to the last row at ${width}x${height}, ${state}: ` +
            `${everything.scrollToLast}px before, ${filtered.scrollToLast}px after`,
        ).toBeLessThan(everything.scrollToLast);

        // The row whose badge says what the next press will place is on screen
        // after the filter moved, which is the whole of why the selected row is
        // exempt from being hidden: at 900x600 with a queue the list shows one
        // row, so "laid out" and "reachable" are different claims (#220).
        expect(
          filtered.selectedInsideList,
          `the selected row is not inside the catalogue list after filtering at ${width}x${height}, ${state}`,
        ).toBe(true);

        // What the filter costs, in both states, at every viewport: nothing.
        for (const [label, measured] of [
          ['unfiltered', everything],
          ['filtered', filtered],
        ] as const) {
          expect(
            measured.headerRowHeight,
            `the catalogue header row is not one tap target while ${label} at ${width}x${height}, ${state}`,
          ).toBe(44);
          expect(
            measured.filterBox.height,
            `the category filter is not one tap target tall while ${label} at ${width}x${height}, ${state}`,
          ).toBe(44);
          expect(
            measured.filterBox.width,
            `the category filter is narrower than a tap target while ${label} at ${width}x${height}, ${state}`,
          ).toBeGreaterThanOrEqual(44);
          expect(
            measured.filterHitsItself,
            `something covers the category filter while ${label} at ${width}x${height}, ${state}`,
          ).toBe(true);
          expect(
            measured.panelOverflow,
            `the Build panel holds more than its box while ${label} at ${width}x${height}, ${state}`,
          ).toBe(0);
          expect(
            measured.shortfalls,
            `boxes in the Build panel shorter than their own content while ${label} at ${width}x${height}, ${state}`,
          ).toEqual([]);
          /*
           * Named only in the arrival state. With a queue the last section is
           * the queue block, whose header states the queue's length and how
           * much of it is moving (ADR 0031 decision 4) rather than a fixed
           * sentence -- so what is asserted there is where it *is*, which is
           * the claim that matters either way.
           */
          if (!queued) {
            expect(
              measured.lastSectionText,
              `the panel's last laid-out section while ${label} at ${width}x${height}, ${state}`,
            ).toBe(localeText('hud.build.coordinates'));
          }
          expect(
            measured.lastSectionBottom,
            `"${measured.lastSectionText}" is below the Build panel's fold while ${label} at ${width}x${height}, ` +
              `${state}: it ends at y=${Math.round(measured.lastSectionBottom)} in a panel clipped at ` +
              `y=${Math.round(measured.fold)}`,
          ).toBeLessThanOrEqual(measured.fold);
        }

        await filter.selectOption({ label: localeText('hud.build.category-all') });
        const restored = await catalogue();
        expect(
          restored?.laidOutRows,
          `"Everything" did not bring the whole catalogue back at ${width}x${height}, ${state}`,
        ).toBe(everything.laidOutRows);
      }
    }
  });

  /**
   * The Build catalogue is one choice, so it costs one tab stop -- and the
   * category filter can never take that stop away (#411, the Build half).
   *
   * ### What was wrong, measured on this page
   *
   * #411 gave the *Rooms* catalogue a roving tab stop and left this one as it
   * found it, although it is longer: twenty-one rows against eighteen, each a
   * `<button>` and therefore each its own tab stop. Measured here, on the
   * assembled application with one prison saved, at 1280x800: the forward walk
   * from the Build tab to the buy disclosure was **43** presses, of which
   * presses 20 to 40 were the catalogue -- twenty-one of them for one choice.
   * The same walk after this change is **23**.
   *
   * The other twenty-two are not the catalogue's and are not this change's to
   * spend: sixteen of them are outside the Build panel altogether (the tab bar
   * finishing its own three buttons, the brand region, the metrics row, three
   * transport controls, two panel toggles, the Alerts header and six save-panel
   * buttons -- four global plus Load and Delete for the one saved prison), and
   * the last six are the panel's own header, its filter, the catalogue, *Place
   * on map*, *Remove* and *Buy*. So the catalogue was twenty-one of forty-three
   * and is one of twenty-three, and the panel's own share went from twenty-six
   * presses to six.
   *
   * ### What only this page can answer
   *
   * `tests/browser/ui-harness.ts` draws two buildables in one group, so
   * `buildCategoryOptions` answers `[]` there and the panel it mounts has **no
   * category filter at all** -- which is deliberate (see `BUILD_MODEL`) and is
   * exactly why the interesting half of this cannot be asserted there. Hiding
   * rows is the whole hazard: `hidden` takes an element out of sequential focus
   * navigation, so a roving `tabIndex = 0` left on a filtered-out row is a
   * catalogue `Tab` cannot enter at all, and `focus()` on one does nothing, so
   * an arrow that named a hidden row would be a key that silently moves
   * nothing. Both need the real eight-group projection, and both are asserted
   * below.
   *
   * The arithmetic underneath -- which row holds the stop and which rows the
   * ring is made of -- is pure and pinned in
   * `tests/unit/ui-hud-build-panel.test.ts` and
   * `tests/unit/ui-roving-focus.test.ts`. This is the wiring: a real resolved
   * `tabIndex`, a real `document.activeElement` after a real key press.
   *
   * ### The half that keeps this from being a regression
   *
   * A roving `tabindex` with nothing announcing the group would turn "twenty-one
   * tedious stops" into "twenty rows a sighted keyboard-only player can no
   * longer reach", because `Tab` is the only mechanism they have and nothing
   * would have told them to try an arrow. So `role="radiogroup"` on the box
   * holding only the rows and `role="radio"` with `aria-checked` on each are
   * asserted here as part of the behaviour rather than as decoration.
   */
  test('the Build catalogue is one tab stop, and the filter never takes it away (#411)', async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    // A prison, so the walk below is the one a player actually takes: the save
    // panel grows a row with its own Load and Delete buttons, and those two
    // presses are part of every measurement quoted above.
    await page.getByRole('button', { name: localeText('save.action.create') }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(page.locator('.hud-build')).toBeVisible();

    /**
     * The catalogue, as the browser resolved it.
     *
     * `hidden` is read explicitly rather than inferred from text or from a
     * class: a filtered row keeps its `textContent` and its `data-buildable`,
     * and reading either would report on a row that is not on screen.
     */
    const rowState = async (): Promise<{
      readonly rows: readonly string[];
      readonly laidOut: readonly string[];
      readonly tabStops: readonly string[];
      readonly hiddenTabStops: readonly string[];
      readonly checked: readonly string[];
      readonly focused: string;
      readonly focusedIsHidden: boolean;
    }> =>
      page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')];
        const id = (row: HTMLElement): string => row.dataset['buildable'] ?? '';
        const active = document.activeElement;
        return {
          rows: rows.map(id),
          laidOut: rows.filter((row) => !row.hidden).map(id),
          tabStops: rows.filter((row) => row.tabIndex === 0).map(id),
          hiddenTabStops: rows.filter((row) => row.tabIndex === 0 && row.hidden).map(id),
          checked: rows.filter((row) => row.getAttribute('aria-checked') === 'true').map(id),
          focused: active instanceof HTMLElement ? (active.dataset['buildable'] ?? '') : '',
          focusedIsHidden: active instanceof HTMLElement && active.hidden !== false,
        };
      });

    // ---- the group is announced as one ---------------------------------
    expect(
      await page.evaluate(() => document.querySelector('.hud-build__list')?.getAttribute('role') ?? ''),
      'the catalogue is not announced as a single choice',
    ).toBe('radiogroup');
    expect(
      await page.evaluate(() => document.querySelector('.hud-build__list')?.getAttribute('aria-label') ?? ''),
      'the choice has no name',
    ).toBe(localeText('hud.build.catalogue'));
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-build__list [data-buildable]')].every(
          (row) => row.getAttribute('role') === 'radio',
        ),
      ),
      'a catalogue row is not announced as a member of the choice',
    ).toBe(true);
    // The box that is the group holds the rows and nothing else. The Build
    // panel's typed route is its own section rather than a child of this
    // scroller -- which is why this panel needed no extra box where
    // `rooms-panel.ts` did -- and this is what checks that claim.
    expect(
      await page.evaluate(
        () =>
          [...document.querySelectorAll<HTMLElement>('.hud-build__list > *')].filter(
            (child) => child.dataset['buildable'] === undefined,
          ).length,
      ),
      'something that is not a catalogue row is a member of the radiogroup',
    ).toBe(0);

    const arrival = await rowState();
    expect(arrival.rows.length, 'the real catalogue is shorter than the Rooms one this mirrors').toBeGreaterThanOrEqual(
      18,
    );
    expect(arrival.tabStops, 'the catalogue does not cost exactly one tab stop').toHaveLength(1);
    expect(arrival.tabStops, 'the tab stop is not on the row the player has chosen').toEqual(arrival.checked);

    // ---- one Tab in, one Tab out --------------------------------------
    // Row-count-independent, and the property the press counts in the header
    // are a consequence of: focus is put on the catalogue's own section header
    // so what is counted is the catalogue's cost and not a lap of the page.
    await page.locator('.hud-build__catalogue > .ui-section__header-row .ui-section__header').focus();
    // The header row holds the eyebrow's button and the category filter beside
    // it (ADR 0035), so the filter is the hop between the two.
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.activeElement?.classList.contains('hud-build__category') === true),
      'the control after the catalogue header is not the category filter',
    ).toBe(true);
    await page.keyboard.press('Tab');
    expect((await rowState()).focused, 'one Tab did not land on the catalogue').toBe(arrival.tabStops[0]);
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return active instanceof HTMLElement && active.classList.contains('hud-build__arm');
      }),
      'one Tab out of the catalogue did not reach the control after it',
    ).toBe(true);

    // ---- the arrows, which are what the one tab stop buys back ---------
    const rows = arrival.rows;
    const last = rows.length - 1;
    await page.locator(`.hud-build__list [data-buildable="${rows[0]}"]`).focus();
    await page.keyboard.press('ArrowDown');
    expect((await rowState()).focused, 'ArrowDown did not step to the next buildable').toBe(rows[1]);
    // The tab stop follows focus, so tabbing back in returns to where the
    // player arrowed to rather than to the top of a list they have moved through.
    expect((await rowState()).tabStops, 'the group kept two tab stops after an arrow').toEqual([rows[1]]);
    await page.keyboard.press('ArrowUp');
    expect((await rowState()).focused, 'ArrowUp did not step back').toBe(rows[0]);
    await page.keyboard.press('ArrowUp');
    expect((await rowState()).focused, 'the ring did not wrap backwards off the first row').toBe(rows[last]);
    await page.keyboard.press('Home');
    expect((await rowState()).focused, 'Home did not reach the first buildable').toBe(rows[0]);
    await page.keyboard.press('End');
    expect((await rowState()).focused, 'End did not reach the last buildable').toBe(rows[last]);

    /*
     * Focus moves; selection does not -- the same refusal `rooms-panel.ts`
     * records, plus one of this panel's own: choosing a row re-arms the world
     * tool and clears removal, so selection-follows-focus would fire that once
     * per arrow press.
     */
    expect(
      (await rowState()).checked,
      'arrowing across the catalogue changed the selection without the player choosing',
    ).toEqual([rows[0]]);

    // `Enter` on the focused row is what chooses it, through the same
    // `onActivate` a pointer press reaches.
    await page.keyboard.press('Enter');
    const chosen = await rowState();
    expect(chosen.checked, 'Enter on a focused row did not choose it').toEqual([rows[last]]);
    expect(chosen.tabStops, 'the tab stop did not follow the new selection').toEqual([rows[last]]);

    // ---- and the filter, which is what this panel has and Rooms does not --
    const filter = page.locator('.hud-build__category');
    await expect(filter).toBeVisible();
    // A group the chosen row is not in, so the two halves below are both real:
    // the selection is kept on screen by `visibleBuildableIds` whatever the
    // filter says, and every other row of its group is hidden.
    await filter.selectOption({ label: localeText('object.category.furniture.name') });
    const filtered = await rowState();
    expect(filtered.laidOut.length, 'the filter hid nothing, so it proves nothing here').toBeLessThan(
      arrival.rows.length,
    );
    expect(filtered.laidOut.length, 'the filter left nothing on screen').toBeGreaterThanOrEqual(2);
    expect(
      filtered.hiddenTabStops,
      'the one tab stop is on a row the filter hid, so Tab cannot enter the catalogue at all',
    ).toEqual([]);
    expect(filtered.tabStops, 'the filtered catalogue has no tab stop, or more than one').toHaveLength(1);
    expect(filtered.tabStops, 'the tab stop left the row the player chose').toEqual(filtered.checked);

    // Still reachable, which is the claim the two assertions above are for.
    await page.locator('.hud-build__catalogue > .ui-section__header-row .ui-section__header').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const entered = await rowState();
    expect(entered.focused, 'Tab no longer reaches the filtered catalogue').toBe(filtered.tabStops[0]);
    expect(entered.focusedIsHidden, 'Tab landed on a row that is not on screen').toBe(false);

    /*
     * And the arrows step over the rows the filter hid rather than into them.
     * A ring built from every row would name one here, `focus()` would do
     * nothing, and the player would press a key that appears dead.
     */
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home']) {
      await page.keyboard.press(key);
      const moved = await rowState();
      expect(moved.focusedIsHidden, `${key} moved focus onto a row the filter hid`).toBe(false);
      expect(
        filtered.laidOut,
        `${key} left the rows that are on screen`,
      ).toContain(moved.focused);
      expect(moved.hiddenTabStops, `${key} left the group's tab stop on a hidden row`).toEqual([]);
    }
  });

  /**
   * Arrow-key catalogue navigation moves the catalogue, not the world camera.
   *
   * Only the assembled page can prove this either way: the defect needs both
   * `build-panel.ts`'s roving-tabindex `keydown` handler and `WorldScene`'s
   * own `window`-level camera bindings alive at once, and neither the
   * isolated HUD harness `ui-shell.spec.ts` runs against nor the isolated
   * world-scene harness `world-scene-input.spec.ts` runs against has both --
   * one has no `WorldScene`, the other has no HUD panel. This file's own
   * `APP_URL` (`/index.html`) is the one page where the two systems actually
   * share a `window`.
   *
   * A 2026-09-01 keyboard playtest of this exact page (recorded on an
   * unmerged research branch as
   * docs/research/2026-09-01-what-act-six-never-reached.md, finding D3) is
   * where this was found: six `ArrowDown` presses inside the Build catalogue
   * -- which correctly moved the roving-tabindex *selection* from the first
   * buildable to the seventh -- also panned the world camera down two tiles'
   * worth at 1280x800, because `build-panel.ts`'s `keydown` handler called
   * `event.preventDefault()` for the key it consumed but never
   * `event.stopPropagation()`, so the same keystroke went on to satisfy
   * `WorldScene`'s camera binding, which is gated only by
   * `isTextEntryFocused()` and does not treat a focused `<button
   * role="radio">` as a text field.
   *
   * **The instrument.** There is no debug hook for camera position on this
   * page (`window.lockstateWorldSceneHarness` exists only on the isolated
   * world-scene harness), so this reads the world the same way the playtest
   * did: arm Remove once, as a read-only probe, and press the same fixed
   * screen point before and after the arrow keys. `RemoveWall`'s own report
   * (`RemoveObject` before ADR 0106 taught the world press to always resolve
   * an edge) names the world tile under wherever the press landed -- if the
   * camera moved between the two presses, the same screen point names a
   * different tile, and if it did not, the same tile comes back twice.
   */
  test('the Build catalogue arrow keys move the catalogue, not the world camera', async ({ page }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');
    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.locator('.hud-build')).toBeVisible();

    // Armed once and left alone -- a toggle re-pressed mid-test would un-arm
    // it, and a probe that fires no `RemoveWall` at all reads as "nothing
    // moved" rather than as a defect, which is the test bug the 2026-09-01
    // playtest's own script recorded catching in itself.
    await page.locator('.hud-build__remove').click();
    await expect(page.locator('.hud-build__remove')).toHaveAttribute('aria-pressed', 'true');

    // A fixed, bare-canvas screen point, found once and pressed twice -- the
    // same point both times, or a difference in *where the mouse landed*
    // would be indistinguishable from a difference in *what the camera
    // showed there*.
    const viewport = page.viewportSize();
    if (viewport === null) throw new Error('the viewport size is needed to aim the probe');
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
    expect(aim, 'no bare world point at 1280x800 to aim the probe at').not.toBeNull();
    if (aim === null) return;

    const probeAt = async (): Promise<{ x: number; y: number } | undefined> => {
      const already = (await objectCommandsSent(page, 'RemoveWall')).length;
      await page.mouse.move(aim.x, aim.y);
      await page.mouse.down({ button: 'left' });
      await page.mouse.up({ button: 'left' });
      return (await objectCommandsSent(page, 'RemoveWall')).slice(already)[0];
    };

    const before = await probeAt();
    expect(before, 'the first probe produced no RemoveWall to read a tile from').not.toBeUndefined();

    // Re-focus a catalogue row: arming Remove above, and the world press just
    // taken, both move DOM focus off the catalogue.
    await page.locator('.hud-build__list [data-buildable]').first().focus();
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowDown');

    // The catalogue's own navigation still has to work -- this test is a
    // regression guard for the camera, not a trade against the accessibility
    // route #411 built. `document.activeElement` moving off the first row is
    // the same claim `rowState().focused` makes in the test above, read
    // directly since this test does not otherwise need that helper.
    expect(
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.['buildable'] ?? ''),
      "ArrowDown stopped moving the catalogue's own focus",
    ).not.toBe('');

    const after = await probeAt();

    // **The regression this test exists for.** Before the fix this was
    // `{"x":16,"y":14}` -> `{"x":16,"y":16}`, matching the 2026-09-01 finding
    // exactly: the six ArrowDown presses above also panned the camera down
    // two tiles' worth even though every one of them landed inside the
    // catalogue's own roving-tabindex group.
    expect(after, `tile under the probe went from ${JSON.stringify(before)} to ${JSON.stringify(after)}`).toEqual(
      before,
    );
  });

  test('a pending delivery is on the panel with the fold shut, and costs it nothing while none is (#285, #703)', async ({
    page,
  }) => {
    /*
     * **Renamed and half-inverted on 2026-08-31 (issue #703 ruling 2).** This
     * test was *"a pending delivery costs the Build panel nothing, and its refund
     * is inside the fold (#285)"*, and what it asserted was an identity: the
     * panel's arrival geometry with five purchases outstanding was byte-identical
     * to its arrival geometry with none, because the deliveries block was the
     * last child of a `hidden` row. The owner overturned that placement --
     * *"The spent amount and the control that reverses it both come out of the
     * Buy fold"* -- after #640 made a placement press spend the player's money
     * without one, and the identity turned out to be bought by painting the
     * report of that spend into a 0x0 box.
     *
     * The identity is kept where it is still true, which is the state the panel
     * arrives in: nothing on its way. What replaces it for a *pending* delivery
     * is the ruling, asserted as boxes, and the price of the ruling stated in
     * pixels rather than left to be discovered.
     *
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
     *
     * **The paragraph above is the pre-#703 design and is kept for its
     * constraint, which is unchanged: the catalogue is still the only donor and
     * this block still donates nothing from it.** What the ruling changed is
     * where the block sits when there *is* something to report. So the two
     * claims this test now makes at every viewport the suite visits are: with
     * five purchases outstanding the block has a box and every `Cancel` in it an
     * `offsetParent`, with the fold shut; and the catalogue keeps its floor and
     * its rows while that is true, so the price is paid by the panel's own
     * scroll and not by the list. The identity is asserted at the end, in the
     * state that still has one.
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
    /*
     * The figures this panel's whole design rests on, at the viewport they were
     * measured at -- written out because they are what a reader has to be able
     * to check the argument against.
     *
     * **All three moved in #1159, and the same 51.8px moved all of them.** The
     * five sections left the bottom row for a left column at this width (stage
     * 3 of the identity rollout, the delivery's layout for tablet and desktop),
     * so the `tabs` grid row is `auto` around nothing and the middle row gains
     * its 69.2px; `ARRIVAL_PANEL_HEIGHT_PX`'s own block carries the chain from
     * the strip down. What that does here:
     *
     *     body height   291.2 -> 318.5
     *     fold slack      7.8 ->   7.5
     *     catalogue      88.0 -> 115.3   (and it leaves its floor)
     *     catalogue rows  924 ->   924   (unchanged: the registry did not move)
     *
     * The rail gains 69.2px here and the strip spends 32.7 of it on a metrics
     * row of its own (see `hud.css`, and `ARRIVAL_PANEL_HEIGHT_PX` above for
     * the chain), so what reaches this panel is 27.3px rather than the whole
     * 69.2.
     *
     * **The catalogue line is the one that changed in kind rather than in
     * degree, and the comment it replaces said so.** It read *"the catalogue is
     * on its two-row floor over twenty-one rows of content, which is the number
     * ADR 0031's open question 4 is about"*: at 900x600 the panel used to be
     * squeezed hard enough that the list sat exactly on
     * `--hud-build-catalogue-floor`. With 51.8px more rail it does not -- 139.8
     * is the list's own share of a panel that fits, not a floor. ADR 0031's
     * open question 4 is about one row of twenty-one being visible and is
     * **less** pressing at this viewport than it was, not settled: the floor is
     * still what holds at the viewports that press, and nothing here changes
     * what happens when the panel is squeezed again.
     */
    expect(before?.bodyHeight).toBe(318.5);
    expect(before?.foldSlack).toBe(7.5);
    expect(before?.panelOverflow).toBe(0);
    expect(before?.listHeight).toBe(115.3);
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
     * The clock is started for them and stopped again afterwards, so the
     * deliveries stay in flight for the rest of the test rather than landing
     * mid-measurement. It is the *delivery* that needs the clock --
     * `ProcurementSystem.update` runs on a tick -- rather than the purchase
     * itself, which since ADR 0051 would be
     * dispatched during a pause as well.
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
    /*
     * **The funds assertion goes BEFORE the pause, and that ordering is the
     * whole of issue #842.**
     *
     * It used to read: poll `data-pending` to five, click Pause, assert funds.
     * That treats *"five deliveries are pending"* as *"five purchases have been
     * charged"*, and those are not the same statement. Measured in a browser
     * with the clock running, sampling every 100ms:
     *
     *     t+100ms  spent 240  pending=3
     *     t+200ms  spent 240  pending=4
     *     t+300ms  spent 320  pending=5   <-- pending is FIVE, four are debited
     *     t+400ms  spent 400  pending=5
     *
     * `data-pending` is written by the projection ahead of the debit landing,
     * so the poll can trip with one or two purchases still outstanding. Pausing
     * there froze the clock those debits needed, the shortfall became permanent,
     * and `toHaveText`'s ten seconds of retries could not rescue it: CI's log
     * shows thirteen polls all reading the same short value. It failed twice
     * that way -- `dc720790` at 24,680 and PR #839's job at 24,760, which are
     * **exactly one and two purchases** short of 24,600.
     *
     * Asserting first is self-synchronising: `toHaveText` retries while the
     * clock is still running, so the outstanding debits land. There is room for
     * it -- a debit lands within ~100ms, and a delivery needs
     * `PROCUREMENT_DELIVERY_DELAY_TICKS` -- and the Pause below then does only
     * what its own comment says it is for, keeping the deliveries in flight for
     * the rest of the test rather than also freezing the accounting.
     *
     * **The economy was never wrong**, which is worth stating because the first
     * report of #842 read like a money leak. Five presses against a paused
     * clock debit exactly 400 and hold it (ADR 0051 dispatches a purchase
     * during a pause and charges for it), and five against a running clock
     * reach 400 too if nothing stops the clock first.
     */
    await expect(funds).toHaveText(
      fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - purchases * 2 * unitPriceOf('item.brick')),
    );
    await page.locator('.hud-strip__transport [title="Pause"]').click();

    // Closed again: the arrival state, with five purchases outstanding.
    await page.locator('.hud-build__buy-toggle').click();
    await expect(page.locator('.hud-build__buy')).toBeHidden();

    /** Every laid-out delivery row's Cancel, measured (#703 ruling 2). */
    const refunds = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.hud-build__delivery-row')]
          .filter((row) => row.hidden === false)
          .map((row) => {
            const cancel = row.querySelector<HTMLElement>('.ui-action');
            const rect = cancel?.getBoundingClientRect();
            return {
              delivery: row.dataset['delivery'] ?? '',
              width: Math.round((rect?.width ?? 0) * 10) / 10,
              height: Math.round((rect?.height ?? 0) * 10) / 10,
              hasOffsetParent: cancel !== null && cancel.offsetParent !== null,
            };
          }),
      );

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
      /*
       * The block has a real box while the disclosure is **closed**, which is
       * issue #703 ruling 2 (2026-08-31). This assertion used to be its exact
       * negation -- `expect(await deliveries.boundingBox()).toBeNull()`, "the
       * deliveries block has a box while closed", with the comment *"which is
       * the mechanism the identity below rests on"* -- and it was green on the
       * day a wall run charged the player 480 and the panel reported it into a
       * 0x0 rectangle.
       */
      const box = await deliveries.boundingBox();
      expect(box, `the deliveries block has no box while closed at ${width}x${height}`).not.toBeNull();
      expect(box?.height ?? 0, `the deliveries block has no height at ${width}x${height}`).toBeGreaterThan(0);
      expect(box?.width ?? 0, `the deliveries block has no width at ${width}x${height}`).toBeGreaterThan(0);
      // And so does every refund in it. `PENDING_DELIVERY_ROW_LIMIT` is three
      // and five are outstanding, so three rows is also the state where the
      // "and N more" line is drawn.
      const cancels = await refunds();
      expect(cancels.length, `the block drew no rows at ${width}x${height}`).toBe(3);
      for (const cancel of cancels) {
        expect(cancel.hasOffsetParent, `${cancel.delivery}'s cancel has no offsetParent at ${width}x${height}`).toBe(true);
        expect(cancel.height, `${cancel.delivery}'s cancel is shorter than a tap target at ${width}x${height}`).toBeGreaterThanOrEqual(44);
        expect(cancel.width, `${cancel.delivery}'s cancel is narrower than a tap target at ${width}x${height}`).toBeGreaterThanOrEqual(44);
      }

      /*
       * And what it costs the panel, stated rather than asserted away. The
       * catalogue is the panel's only donor, the list keeps every row it had
       * with nothing bought, and the numeric fallback is still the last section
       * a player can see. What absorbs the block is the panel's own scroll,
       * which is what `overflow-y: auto` on `.ui-panel.hud-build` is for and
       * what the expanded numeric fallback already produces.
       *
       * **The first claim used to be an identity and is a floor now, and the
       * sentence it replaces is kept because what it rested on is the
       * interesting part.** It read *"this block is still not allowed to take
       * from it: the list keeps the same box ... it had with nothing bought"*,
       * and it was asserted as `toBe(baseline.listHeight)` -- which held
       * because at 900x600 the panel was squeezed hard enough that the list was
       * **already on its floor in the arrival state**. That is the "harmless by
       * coincidence" this file keeps flagging elsewhere, met here in its own
       * assertion: the identity was true of the geometry rather than of the
       * rule, and #1159's 51.8px of extra rail (see `before`'s own block above)
       * ended the coincidence. The arrival catalogue is 139.8px now; with five
       * deliveries outstanding it is 88px.
       *
       * 88px is `--hud-build-catalogue-floor`, which `tokens.css` defines as
       * `2 * var(--tap-target)` -- two rows, because "one row plus a scrollbar
       * is not a list you can choose from". So this is pinned as the exact
       * number the floor resolves to rather than as a `>=`, and the rule it
       * guards is unchanged and is the one #174 is about: the block may take
       * the catalogue's slack and may not take its floor.
       */
      await page.setViewportSize({ width, height });
      const baseline = width === 900 && height === 600 ? before : null;
      if (baseline !== null) {
        // `2 * --tap-target` at this scale. Written as the number rather than
        // derived, for the reason every other figure in this file is: a
        // `calc()` that agreed with the stylesheet by construction would prove
        // nothing about what the browser laid out.
        expect(withPending?.listHeight, 'the catalogue went below its own two-row floor at 900x600').toBe(88);
        expect(
          baseline.listHeight,
          'the arrival catalogue is on its floor again, so the assertion above no longer distinguishes anything',
        ).toBeGreaterThan(88);
        expect(withPending?.listContent, 'the catalogue lost rows at 900x600').toBe(baseline.listContent);
        expect(withPending?.panelHeight, 'the panel changed height at 900x600').toBe(baseline.panelHeight);
        expect(
          withPending?.panelOverflow ?? 0,
          'the panel absorbed the deliveries block without scrolling at 900x600, so the block has no box after all',
        ).toBeGreaterThan(0);
      }
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
    /*
     * **Pressed against a paused clock since 2026-08-31, and the press that used
     * to be here is why.** This block read
     * `await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();`
     * before the `Cancel`, and `docs/AGENT_WORKFLOW.md` lists this test as a
     * contention canary with exactly that mechanism: *"the refund misses a
     * 20-second poll"*. Measured twice today -- the poll below for
     * `data-pending === "4"` read `null`, which is the four deliveries that were
     * *not* cancelled having landed inside the 20s rather than the refund having
     * failed. At x1 a delivery lands 5s after it is bought, and the click, the
     * treasury poll and this poll all sit inside that window.
     *
     * ADR 0051's paused drain is what makes the press unnecessary: a command
     * submitted against a stopped clock is executed and published without a
     * tick, so the refund arrives and **nothing can land while it is being
     * measured**. `tests/browser/build-deliveries-outside-the-fold.spec.ts`
     * takes the same route for the same reason and records the same measurement.
     */
    const refundOf = 2 * unitPriceOf('item.brick');
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

    /*
     * ---- and the identity that survived the ruling (#703) ----------------
     *
     * The rest of the deliveries land, the block goes back to having no box at
     * all, and the panel is byte-identical to the arrival geometry measured at
     * the top of this test. That is the half of *"a pending delivery costs the
     * Build panel nothing"* that is still true after the block came out of the
     * fold: with nothing on its way, `paintDeliveries` leaves it `hidden` -- and
     * that one line is now the whole of what protects the height issue #174
     * closed, rather than the second of two mechanisms.
     *
     * The clock has to run for this one, and it is the only part of this test
     * that needs it: a delivery lands on a tick. It is stopped again as soon as
     * the block is gone, because the geometry below is measured in the state the
     * panel arrives in and that state is paused.
     */
    await page.setViewportSize({ width: 900, height: 600 });
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await expect
      .poll(async () => deliveries.getAttribute('data-pending'), {
        message: 'the deliveries never landed, so the empty state could not be measured',
        timeout: 30_000,
      })
      .toBeNull();
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    // The fold is shut again and the panel scrolled back, because both are part
    // of "the state the panel arrives in" and the measurement above opened one
    // and scrolled the other. Measured with them left as they were: the body
    // holds 416px of content against its 291.2px box, the panel is 125px over
    // and sitting at `scrollTop` 125 -- which is the open disclosure, not this
    // block.
    await page.locator('.hud-build__buy-toggle').click();
    await expect(page.locator('.hud-build__buy')).toBeHidden();
    await page.evaluate(() => {
      const panel = document.querySelector<HTMLElement>('.hud-build');
      if (panel !== null) panel.scrollTop = 0;
    });
    expect(await deliveries.boundingBox(), 'an empty deliveries block kept its box').toBeNull();

    /*
     * **The identity above stopped being the whole story with #749, and is the
     * whole story again as of #985.** Both directions are recorded rather than
     * one overwritten (`docs/AGENT_WORKFLOW.md` section 4), because the middle
     * state is what #985 was filed about.
     *
     * The `Cancel` pressed earlier in this test is one of the four presses
     * #749 put a success sentence on `.hud__event` for. That band is
     * `grid-area: event`, an `auto` row of `.hud`
     * (`grid-template-rows: auto auto auto auto minmax(0, 1fr) auto`), so
     * while it is up it costs the middle row 32px and the Build panel 24px of
     * that -- and `hud.ts`'s `applyEventNotice` documented the band as never
     * auto-dismissing, so nothing between the cancel and here would ever have
     * taken it back. This block therefore read:
     *
     * > `await expect(event, 'the cancellation this test drove should still be
     * > the band`s last word').toBeVisible();`
     *
     * and pinned `panelHeight: 314.1`, `panelOverflow: 24`, `foldSlack: -16.2`
     * -- a Build panel whose last section, "Enter coordinates", sat 16.2px
     * *below its own fold on arrival*, with `scrollTop` 0. That is #174's
     * defect, reproduced here as an expectation because it was what the code
     * did.
     *
     * #985's repair is `EVENT_BAND_HOLD_CEILING_MS`: the band lets go of the
     * row when nothing has replaced its sentence. So the two surfaces part
     * company here, and both halves are asserted --
     *
     *  - **the alerts list keeps the sentence** (ADR 0084 decisions 1 to 3),
     *    which is also this block's vacuity guard: without it, a band that had
     *    never been raised at all would satisfy the assertion below;
     *  - **the band has let the row go**, and the panel is byte-identical to
     *    the arrival geometry measured at the top of this test.
     *
     * `toBeHidden` waits, so what this asserts is one-directional and not a
     * race: a band still up after twice its own ceiling is the defect, and a
     * slow machine costs wall-clock time rather than a false red.
     */
    await expect(
      page.locator('.hud-alerts__list'),
      'the cancellation never reached the alerts log, so the band assertion below would be vacuous',
    ).toContainText(localeText('hud.alert.event.economy.delivery-cancelled').replace('{total}', fundsText(refundOf)));
    await expect(
      page.locator('.hud__event'),
      'the events band is still holding its grid row long after its hold ceiling (#985)',
    ).toBeHidden({ timeout: EVENT_BAND_HOLD_CEILING_MS * 2 });

    /*
     * And with the row given back, every field is `before`'s again -- the
     * panel's height, its fold slack, both catalogue figures, the body's own
     * content height, the last section's text and the scroll position. That is
     * *"a pending delivery costs the Build panel nothing"* restored whole,
     * rather than the seven-of-nine version #749 left it as.
     */
    expect(await geometry(), 'the panel did not return to its arrival geometry once nothing was on its way').toEqual(
      before,
    );
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
      await page.locator('.ui-tab[data-tab="zones"]').click();
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
   * The same fold, against **every room type in the real catalogue** (#529).
   *
   * ### What this measures that the test above does not
   *
   * That one leaves `room.cell` selected, which is the default. Since #529 the
   * rule block's height is a function of the *selected* room type -- it carries
   * one line per object that type requires -- so the deepest room is the one
   * that can push the block past the fold, and `room.cell` is not it.
   * Recomputed over `src/content/room-catalog.ts`: `room.kitchen` authors three
   * object requirements (stove, prep counter, fridge) against `room.cell`'s two
   * and `room.yard`'s none. The test above therefore measures a case one line
   * short of the worst, and would stay green through a regression at the worst.
   *
   * ### Why it sweeps all eighteen rather than naming the kitchen
   *
   * Because "the kitchen is the deepest room" is a **count-shaped claim about
   * content**, and `docs/AGENT_WORKFLOW.md` §4 is explicit that those rot first:
   * balancing a room upward tomorrow does not touch a test that hard-codes
   * today's answer. The sweep states the *property* -- no room type this
   * catalogue can offer pushes the panel's last block below its fold -- so the
   * day a room gains a fourth requirement this either stays green because it
   * fits or fails with that room's own id in the message.
   *
   * That is what makes `ROOM_NEEDS_NAMED_LIMIT`'s cap a gate rather than a
   * decoration: content is authored, `roomRequirementSchema` permits 32
   * requirements on a room, and this is what notices.
   *
   * ### Why the real page and not the harness
   *
   * The reason the test above gives, unchanged: the harness leaves the rail's
   * aside slot empty, `.hud__aside:empty { display: none }` hands the panel the
   * whole rail, and this class of defect cannot be reproduced there. It is also
   * the only place the catalogue is the real eighteen rather than a fixture's
   * three -- `ui-shell.spec.ts` asserts the *wording* of these lines against
   * `ROOMS_MODEL` and could not notice `roomCatalogue()` deriving a wrong
   * quantity, because both sides of that comparison are hand-written.
   */
  /**
   * The Rooms panel opens on the room the first instruction names (#935).
   *
   * Against the real registry, because the defect was the real catalogue's
   * order: `roomCatalogue()` sorts by `(category, id)`, `'administration'`
   * sorts first, and the panel took `model.rooms[0]` -- so the requirement block
   * a newcomer read first described *Staff Room*. The harness suite cannot see
   * this, since its `ROOMS_MODEL` fixture happens to list `room.cell` first.
   *
   * The rule block is read as well as the selection, because the selection is
   * only the means: what a player needs is the cell's own four requirements on
   * screen before the first drag. And the selected row is required to be
   * inside the list's visible box, because a selection scrolled out of sight
   * leaves a rule block that names no room.
   */
  test('the Rooms panel opens on a cell, with its rule on screen and its row in view (#935)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    for (const [width, height] of [
      [1280, 720],
      [375, 812],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.locator('.ui-tab[data-tab="zones"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();

      const reading = await page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>('.hud-rooms__rows [data-room]')];
        const selected = rows.filter((row) => row.dataset['selected'] === 'true').map((row) => row.dataset['room']);
        const cellRow = document.querySelector<HTMLElement>('.hud-rooms__rows [data-room="room.cell"]');
        const list = document.querySelector<HTMLElement>('.hud-rooms__list');
        const rowBox = cellRow?.getBoundingClientRect();
        const listBox = list?.getBoundingClientRect();
        return {
          firstRow: rows[0]?.dataset['room'],
          selected,
          rule: [...document.querySelectorAll('.hud-rooms__rule-block .hud-rooms__rule')].map((line) =>
            (line.textContent ?? '').trim(),
          ),
          rowInView:
            rowBox !== undefined &&
            listBox !== undefined &&
            rowBox.height > 0 &&
            rowBox.top >= listBox.top - 0.5 &&
            rowBox.bottom <= listBox.bottom + 0.5,
        };
      });

      // Vacuity guard: the defect only exists because the cell is not the first
      // row, so a catalogue that put it first would make this test say nothing.
      expect(reading.firstRow, 'the real catalogue now lists the cell first, so this no longer tests #935').not.toBe(
        'room.cell',
      );
      expect(reading.selected, `the Rooms panel did not open on the cell at ${width}x${height}`).toEqual(['room.cell']);
      expect(reading.rule, `the rule block is not the cell's at ${width}x${height}`).toEqual([
        'Needs at least 2 × 3 tiles',
        'Needs walls or doors all round',
        'Needs 1 × Bed',
        'Needs 1 × Toilet',
      ]);
      expect(reading.rowInView, `the selected Cell row is scrolled out of the list at ${width}x${height}`).toBe(true);
    }
  });

  test('no room type in the catalogue pushes the Rooms panel past its fold (#529)', async ({ page }) => {
    /*
     * `test.slow()` triples the 60 s budget, and unlike its three siblings this
     * sweep was left without it -- which made it a test that could not pass
     * rather than a test that sometimes did not.
     *
     * Measured 2026-09-04 on an idle machine (no `playwright` or `vitest`
     * process running, load average **1.55**): at the bare 60 s it failed
     * `Test timeout of 60000ms exceeded` on the `locator.click` below, and the
     * call log had already reported the row *resolved*, *"visible, enabled and
     * stable"* and *"done scrolling"* -- so nothing was being waited on, the
     * budget had simply run out mid-sweep. The same commit, the same idle
     * machine, run with `--timeout 180000`: **`1 passed (1.9m)`**, the test
     * itself 1.8 m. It needs about 108 s and was being given 60.
     *
     * The budget is arithmetic here and not a race, which is why raising it
     * hides nothing: the sweep is 18 rooms x 5 viewports, every step is
     * awaited, and the work does not vary with timing. Nothing about the
     * assertions changes -- a mutation of the production code this measures
     * (`ROOM_NEEDS_NAMED_LIMIT` 4 -> 8) is still red inside the raised budget,
     * on the fold assertion rather than on the clock.
     *
     * `main`'s CI runner does the whole browser suite in about 14 minutes and
     * has never been red on this test, so the 60 s fitted there and only there.
     * A canary entry in `docs/AGENT_WORKFLOW.md` recorded that asymmetry for
     * one afternoon; the budget is the fix and the entry was the workaround.
     */
    test.slow();

    await page.setViewportSize({ width: 1280, height: 720 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="zones"]').click();
    await expect(page.locator('.hud-rooms')).toBeVisible();

    const roomIds = await page
      .locator('.hud-rooms__rows [data-room]')
      .evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset['room'] ?? ''));
    // Vacuity guard: an empty sweep asserts nothing, and a selector that had
    // stopped matching would produce exactly that.
    expect(roomIds.length, 'the real catalogue should offer every shipped room type').toBeGreaterThanOrEqual(18);

    /*
     * Room outside, viewport inside, and that ordering is a cost decision.
     *
     * Selecting a room is a real click into a scroll container, so it costs a
     * scroll-into-view; resizing the viewport costs a relayout. Eighteen rooms
     * across five viewports is ninety measurements either way, but this nesting
     * pays for eighteen clicks instead of ninety. The first shape of this test
     * did it the other way round and timed out at sixty seconds.
     */
    const slack: { room: string; viewport: string; px: number; listSlack: number }[] = [];
    for (const roomId of roomIds) {
      // Activation and not a synthetic model push: this is the same
      // `onActivate` a pointer press reaches, so the sweep measures the panel
      // in a state a player really puts it in.
      await page.locator(`.hud-rooms__rows [data-room="${roomId}"]`).click();

      // Tightest viewports first, so a failure names the one that matters.
      for (const [width, height] of [
        [900, 600],
        [375, 812],
        [1024, 768],
        [1280, 720],
        [1440, 900],
      ] as const) {
        await page.setViewportSize({ width, height });

        const geometry = await page.evaluate(() => {
          const panel = document.querySelector('.hud-rooms');
          const status = document.querySelector('.hud-rooms__status');
          if (panel === null || status === null) return null;
          const scrollTop = panel.scrollTop;
          panel.scrollTop = 0;
          const box = panel.getBoundingClientRect();
          /*
           * The catalogue list's slack above its own floor, which is what pays
           * for the needs readout when a room is zoned (see
           * `ROOM_NEEDS_NAMED_LIMIT`). It is reported rather than asserted for
           * the reason the fold slack below is: it is the budget, and the budget
           * moves whenever this panel is restyled. Recording it here is what
           * stops the next reader inheriting a figure measured against a layout
           * that has since changed -- which is exactly what happened to the
           * "43px at 900x600" this replaces.
           */
          const list = document.querySelector('.hud-rooms__list');
          const listFloor =
            list === null
              ? 0
              : Number.parseFloat(getComputedStyle(list).minHeight.replace('px', '')) || 0;
          return {
            scrollTop,
            panelHeight: Math.round(box.height),
            statusBottom: status.getBoundingClientRect().bottom,
            fold: box.top + panel.clientTop + panel.clientHeight,
            ruleLines: document.querySelectorAll('.hud-rooms__rule').length,
            listSlack: list === null ? 0 : list.getBoundingClientRect().height - listFloor,
          };
        });

        expect(geometry, `the Rooms panel has no box at ${width}x${height}`).not.toBeNull();
        if (geometry === null) continue;
        expect(geometry.panelHeight, `the Rooms panel is not laid out at ${width}x${height}`).toBeGreaterThan(150);
        expect(geometry.scrollTop, `something scrolled the Rooms panel at ${width}x${height}`).toBe(0);
        /*
         * The rule block really did grow with the selection: the two fixed lines
         * plus one per object requirement, or plus the "no objects needed" line
         * for `room.yard`. Without this the sweep would pass just as happily
         * over a panel that had silently stopped rendering the object lines --
         * a fold assertion is satisfied by drawing nothing at all.
         */
        expect(
          geometry.ruleLines,
          `the rule block for ${roomId} at ${width}x${height} is not drawing its lines`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          geometry.statusBottom,
          `the Rooms panel's last block is below its fold with ${roomId} selected at ${width}x${height}: it ends at y=${Math.round(geometry.statusBottom)} in a panel clipped at y=${Math.round(geometry.fold)}`,
        ).toBeLessThanOrEqual(geometry.fold);

        slack.push({
          room: roomId,
          viewport: `${width}x${height}`,
          px: geometry.fold - geometry.statusBottom,
          listSlack: Math.round(geometry.listSlack * 10) / 10,
        });
      }
    }

    /*
     * The measurement, printed rather than asserted. The assertion above is the
     * gate; this is what tells the next reader how much room is left before it
     * bites, which is exactly the figure `ROOM_NEEDS_NAMED_LIMIT`'s old comment
     * recorded and then outlived. Pinning a slack number here would fail on any
     * legitimate restyle of any block in this panel.
     */
    slack.sort((left, right) => left.px - right.px);
    // eslint-disable-next-line no-console -- the measurement this test exists to produce
    console.log('tightest Rooms-panel fold slack:', JSON.stringify(slack.slice(0, 6)));
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
      await page.locator('.ui-tab[data-tab="zones"]').click();
      await expect(page.locator('.hud-rooms')).toBeVisible();

      // Vacuity guard, before a single pixel is trusted: the page really is
      // showing the Rooms panel of the real application, with the real
      // catalogue behind it. Eighteen is `defaultRoomCatalog`'s own length; a harness
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
        /*
         * The recording #312 shipped, kept as an assertion. `TILE_SIZE_PX` is
         * 64 at zoom 1, and every authored room needs at least 2x2 of them, so
         * what keeps the fold below necessary is that no 128px square of bare
         * world is reachable on arrival.
         *
         * **THIS READ `toBeLessThan(64)` UNTIL 2026-09-16 AND THE SENTENCE
         * ABOVE IS WHY IT COULD MOVE.** That threshold was "not even one
         * tile", which is stricter than the reason it was given in the same
         * comment, and it went red at exactly 64 when the owner's #1192 ruling
         * took 11.2px off the phone's tab bar (`hud.css`'s
         * `@media (max-width: 720px)` block; `ARRIVAL_PANEL_HEIGHT_PX` above
         * carries that chain). One tile of bare world is not a room, and the
         * scan steps in 16px, so the number is pinned exactly rather than
         * bounded -- a second gain would show up here rather than being
         * absorbed by a looser ceiling.
         *
         * **THE SIXTH SECTION MOVED THIS TO 32 AND THEN BACK TO 64, AND THE
         * ROUND TRIP IS KEPT BECAUSE IT IS WHAT THE NUMBER IS FOR.** The bar
         * at this viewport is icon-only under the owner's #1192 ruling and
         * gains no height from a sixth tab, but it gains **width**: at the
         * `min-width: calc(56px * var(--ui-scale))` that icon-only rule was
         * given for five tabs, `.hud__tabs` ran `x = 7..369` in a 375px
         * viewport where five tabs ran `x = 35..341`, and the bare sliver
         * beside it went from about 27px a side to about 6. Measured, this
         * assertion read **32**. That same overflow was a *failure* one
         * viewport class over -- `1440x900@200%` wrapped the bar to two rows
         * and put `.display-scale__cycle` under a `.ui-tab`, which
         * `ui-200-percent-zoom-sweep-ratchet.spec.ts` refuses -- so the
         * icon-only `min-width` was re-derived to 48px, and with it the
         * sliver comes back and this reads **64** again. The pinned number is
         * therefore unchanged, and the reason it is pinned exactly rather
         * than bounded is exactly this: a 32 here was the visible end of a
         * defect that failed elsewhere.
         */
        expect(
          arrival.largestBareSquare,
          `bare world appeared on arrival at ${width}x${height}, so the fold below may no longer be needed`,
        ).toBe(64);
        expect(
          arrival.largestBareSquare,
          `a 2x2 room fits in the bare world on arrival at ${width}x${height}, so the fold below is not needed`,
        ).toBeLessThan(128);
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
      ).not.toBeNull();
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
    // Slow, and the ADR is the reason: two `enclosed` cells cannot be zoned
    // until their wall segments are built -- 23 of them, because both drags ask
    // for `SMALL_ROOM_DRAG_DELTAS_PX` and 3x3 cells are what this test can
    // afford; see that constant for the 174 s -> 132 s this bought. It measures
    // the readout for *two* rooms because two are what make it report more
    // needs than it has rows for, and two 3x3 cells still do: what the panel
    // reports is `room.cell`'s two missing objects per room, which its
    // authored requirements decide and its size does not. See the keyboard
    // specs below for the arithmetic.
    //
    // **"their thirty wall segments" was the count before this, and it was
    // wrong in both directions at once**: the perimeter of two 4x4 cells is 32
    // and never was 30, and it is 23 now. Recorded because thirty is the number
    // three other comments in this file were written against.
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
    await page.locator('.ui-tab[data-tab="zones"]').click();
    await expect(page.locator('.hud-rooms')).toBeVisible();

    // Vacuity guard, before a single pixel is trusted: this is the shipped
    // application with the shipped catalogue behind it, not a harness.
    // Eighteen is `defaultRoomCatalog`'s own length.
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
      /** One entry per object the named room is short, in the order drawn (#529). */
      readonly items: readonly string[];
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
          items: [...document.querySelectorAll<HTMLElement>('.hud-rooms__needs-item')].map((item) =>
            item.innerText.trim(),
          ),
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
      await page.locator('.ui-tab[data-tab="zones"]').click();
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

    /*
     * ---- where the two cells will go, and the walls they now need --------
     *
     * `RoomZoningService.zone` refuses an `enclosed` room whose perimeter is
     * open (ADR 0045 decision 1, the owner's ruling) and `room.cell` authors
     * that requirement, so a cell drawn on the starter prison's open ground is
     * no longer a cell -- the count below would sit at 0 and everything this
     * test measures would be measuring an empty panel.
     *
     * The rectangles are **discovered rather than chosen**, because they have
     * to be the ones the drags below produce and those depend on where the HUD
     * leaves bare world at this viewport. So each drag is made once as a probe,
     * its rectangle read off the panel's own `data-area`, and then cancelled;
     * the walls go up around exactly those tiles; and the same gesture is made
     * again for real. `dragRectangleOnWorld` aims by scanning the page from the
     * top left for the first point whose whole gesture lands on the canvas, so
     * it is deterministic at a fixed viewport -- and rather than rely on that
     * quietly, the second gesture's rectangle is asserted to be the first's.
     * A drag that landed somewhere else fails here, naming both rectangles,
     * instead of failing forty seconds later as a room that would not zone.
     *
     * **That last sentence was only half true, and #658 collected the other
     * half.** Comparing the real drag's rectangle to the probe's compares two
     * readings of the same helper on the same page: when the HUD's layout moves
     * both readings move with it, the assertion still passes, and what reaches
     * the player -- a rectangle the simulation refuses -- is reported four
     * assertions later as a Designate that did nothing. So each drag now goes
     * through `drawRoomRectangle`, which checks the rectangle against the
     * pixel-to-tile conversion and against `room.cell`'s own authored rules
     * before the panel is asked to do anything with it. The probe-to-real
     * comparison is kept, because reproducibility is still worth asserting; it
     * is simply no longer the only thing asserted.
     *
     * The second drag's floor is `belowGesture(...)` and no longer a constant,
     * for the reason recorded on that function: the constant it replaces was
     * measured against a strip one row tall and #658 makes the strip two.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.ui-tab[data-tab="zones"]').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    const firstProbe = await drawRoomRectangle(page, 'the probe drag for the first cell', {
      roomCatalogId: 'room.cell',
      deltas: SMALL_ROOM_DRAG_DELTAS_PX,
    });
    const firstCell = firstProbe.rectangle;
    await page.locator('.hud-rooms__cancel').click();
    // Below the first gesture by a whole tile, so the two rectangles cannot
    // share a row however the camera is framed -- and asserted disjoint rather
    // than assumed, which is what `clearOf` is.
    const secondCellFloor = belowGesture(firstProbe.gesture);
    const secondCell = (
      await drawRoomRectangle(page, 'the probe drag for the second cell', {
        roomCatalogId: 'room.cell',
        minY: secondCellFloor,
        clearOf: [firstCell],
        deltas: SMALL_ROOM_DRAG_DELTAS_PX,
      })
    ).rectangle;
    await page.locator('.hud-rooms__cancel').click();
    // Two rooms and not one rectangle drawn twice, which is what the second
    // drag's floor is for -- and if they were the same the second zoning
    // below would be refused `overlaps-existing-room`.
    expect(secondCell, 'both room drags found the same rectangle').not.toEqual(firstCell);

    /*
     * Typed at the phone viewport, and restored to 1280x800 before the drag
     * below -- see `WallOrderOptions.orderAt` for the measurement and for why
     * this is the one caller that asks for it.
     *
     * 375x812 is not an arbitrary small box: it is one of the two viewports
     * the block above just asserted the empty readout at, and one of the three
     * the block below asserts the filled one at. Nothing between here and
     * there is measured in pixels, and the two things that are -- the
     * rectangle this drag has to land on again, and the fold assertions at the
     * end -- both happen at 1280x800 with the viewport back.
     */
    await wallRectanglesFromTheKeyboard(page, [firstCell, secondCell], {
      orderAt: { width: 375, height: 812 },
    });

    // ---- two cells zoned, and nothing standing in either -------------
    await page.locator('.ui-tab[data-tab="zones"]').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__arm').click();
    expect(
      (
        await drawRoomRectangle(page, 'the drag for the first cell', {
          roomCatalogId: 'room.cell',
          deltas: SMALL_ROOM_DRAG_DELTAS_PX,
        })
      ).rectangle,
      'the drag no longer lands on the rectangle its walls were built around',
    ).toEqual(firstCell);
    await page.locator('.hud-rooms__confirm').click();
    // The walls above left the clock stopped again, exactly as a new session
    // arrives. The count moving from 0 is the proof that a real worker took the
    // `ZoneRoom`; play is pressed here because this test was written when a
    // command given during a pause waited for it, and since ADR 0051 the room registers on the confirm instead. The
    // press is kept rather than removed: it makes the assertion hold on either
    // behaviour, and what is being measured is the room, not the clock.
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
     * **This block used to press the panel's header control first**, under the
     * sentence *"the panel is folded here -- confirming leaves the tool armed,
     * so the drawing pass resumes -- so the header control is what brings the
     * body back, exactly as a player reaching for it would."* That was an
     * accurate reading of the code and of what a player had to do, and it is
     * exactly the reach issue #684 was filed about: the fold took the one
     * control that reports the tool's state off the screen at the moment the
     * state changed. Since the confirm stands the tool down, the drawing pass
     * ends with it and the panel is already back -- so the assertion is the
     * same one pointed the other way, and the press it used to need is gone.
     */
    await expect(page.locator('.hud-rooms')).toHaveAttribute('data-collapsed', 'false');
    await expect(
      page.locator('.hud-rooms__needs'),
      'the readout never arrived on the counts cadence, only on a tab change',
    ).toBeVisible();
    expect((await needsProbe()).unfinished).toBe('1');

    /*
     * A second cell, lower down so it cannot overlap the first -- and this is
     * the route issue #684 is about, walked end to end on the assembled page.
     *
     * **It used to be a drag and nothing else**, under *"the tool stays armed
     * through a confirm"*, which was true. The arm press below is what a player
     * actually does between two rooms, and on the old behaviour it *disarmed*:
     * the drag after it produced no rectangle at all, so `pendingRoomRectangle`
     * had nothing to read and this test failed here. That is the whole defect,
     * and it is asserted rather than assumed -- the control has to be reading
     * "Draw on map" before it is pressed, or the press means the opposite.
     */
    await expect(
      page.locator('.hud-rooms__arm'),
      'the confirm left the arm control offering to stop something',
    ).toHaveText(localeText('hud.rooms.arm'));
    await expect(page.locator('.hud-rooms__arm')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('.hud-rooms__arm').click();
    await expect(
      page.locator('.hud-rooms__arm'),
      'pressing the arm control for a second room disarmed the tool',
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      (
        await drawRoomRectangle(page, 'the drag for the second cell', {
          roomCatalogId: 'room.cell',
          minY: secondCellFloor,
          clearOf: [firstCell],
          deltas: SMALL_ROOM_DRAG_DELTAS_PX,
        })
      ).rectangle,
      'the second drag no longer lands on the rectangle its walls were built around',
    ).toEqual(secondCell);
    await page.locator('.hud-rooms__confirm').click();
    // What Designate said, before the count is asked about. A refused
    // designation paints `.hud__refusal` (`src/ui/hud/hud.ts`), so the sentence
    // the player would have read is the first thing reported when this stops
    // working -- rather than a metric that stayed at 1 with no reason attached,
    // which is what #658 spent a day on.
    await expect(
      page.locator('.hud__refusal'),
      'Designate refused the second cell',
    ).toBeHidden();
    await expect(page.locator('[data-metric="rooms"]')).toContainText('2');

    /*
     * **And neither designation raised the events band** -- the owner's ruling
     * of 2026-09-05 on issue #966 site 2, measured on the assembled page rather
     * than at the translator.
     *
     * An accepted `ZoneRoom` is acknowledged: it puts a row in the alerts list
     * in the bottom-left corner, which is what a player reads. It does **not**
     * take `.hud__event`, and this is the assertion that says so where it
     * matters -- that band is a grid row, it costs the middle row 32px whatever
     * raised it, and `event-band-dwell.ts` replaces an incumbent rather than
     * releasing the row, so once raised the cost stands for the session. Issue
     * #985 is where that clip is measured and owned; nothing here fixes it, and
     * the loop below passing at 900x600 is this line's consequence rather than
     * a repair.
     *
     * `toBeHidden` and not "does not say `{room} designated`": nothing else in
     * this fixture can raise the band -- no prisoner is admitted, no incident
     * producer has anybody to open one about, and the ladder rungs need a
     * treasury this prison has not spent -- so hidden is the state, and a
     * weaker assertion would pass on the band showing something else.
     */
    await expect(
      page.locator('.hud__event'),
      'a designation raised the events band, which the ruling of 2026-09-05 says it must not',
    ).toBeHidden();

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
      await page.locator('.ui-tab[data-tab="zones"]').click();
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
      /*
       * Four lines and its own gutters since #529 -- the header, the room line
       * and one per object the cell is short -- where this used to say "two
       * lines ... 30px is well under the 43px the tightest viewport can
       * afford". That 43px figure is withdrawn: it was measured before ADR 0039
       * and #411 moved the coordinate form out of the panel body and into the
       * catalogue scroller, and it counted 44px `ListRow`s rather than the
       * 13.2px eyebrow lines this block actually draws. What bounds the block
       * now is the fold assertion three steps down, which is a measurement of
       * the real panel rather than a number carried forward.
       */
      expect(shown.height, `the readout is too short to hold its lines at ${width}x${height}`).toBeGreaterThan(50);

      // 3. And inside the panel's own unscrolled fold, which is the assertion
      // #174 and ADR 0022 both turn on: a block below the fold is present,
      // laid out and unreachable.
      expect(
        shown.bottom,
        `the readout is below the unscrolled Rooms panel's fold at ${width}x${height}: it ends at y=${shown.bottom} in a panel clipped at y=${shown.panelFold}`,
      ).toBeLessThanOrEqual(shown.panelFold);

      /*
       * 4. It names the room, and then **every object that room is short**,
       *    with how many of each (#529).
       *
       * Built from the bundled default locale rather than typed here: ADR 0011
       * puts the key on one side of that boundary and the text on the other, so
       * a test that hard-coded "Cell at 6, 10 is missing" would be asserting
       * against a copy and would stay green while the player read something
       * else. The tile is the one part left as a pattern, because where the drag
       * landed is not this test's claim.
       *
       * **This assertion used to be the defect.** It read
       * `hud.rooms.needs-more` -- *"{room} at {x}, {y} needs {object}, and
       * {count} more"* -- with `{object}` the bed and `{count}` three, and it
       * passed. Two empty cells are four unmet requirements; the readout named
       * one of them and said "and 3 more", and the other three were not
       * enumerated on this screen or on any other. That is issue #529 in one
       * line, green in this suite the whole time, because the assertion was
       * written to the behaviour rather than to what a player could find out.
       *
       * `1 × Bed` and `1 × Toilet`, and the numeral is the **shortfall**:
       * `room.cell` authors one of each and this cell holds neither. The two
       * figures coincide here because the room is empty, which is why the case
       * that separates them -- a canteen holding three of four benches -- is
       * pinned in `tests/unit/ui-simulation-room-needs.test.ts` against the real
       * projection instead of being simulated through the world here.
       */
      const expectedRoomLine = localeText('hud.rooms.needs-room').replace('{room}', localeText('room.cell.name'));
      expect(shown.line, `the readout does not name the room at ${width}x${height}`).toMatch(
        new RegExp(
          `^${expectedRoomLine
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace('\\{x\\}', '-?\\d+')
            .replace('\\{y\\}', '-?\\d+')}$`,
        ),
      );
      const expectedItem = (objectKey: string, count: string): string =>
        localeText('hud.rooms.needs-object').replace('{count}', count).replace('{object}', localeText(objectKey));
      /*
       * **The doorway line came first, and finding it here is what #938 is.**
       *
       * This assertion read `[bed, toilet]` and `data-needs` `'4'` until then,
       * and both were true of what the panel drew and false of the prison:
       * `wallRectanglesFromTheKeyboard` builds a `wall-brick` on **every**
       * perimeter segment and no door anywhere, so the two cells this test
       * zones are rooms no prisoner can ever walk into -- which is the exact
       * state #938 measured, sitting inside this suite's own fixture, green,
       * for as long as the readout had no way to say it.
       *
       * So this is the fix arriving on the assembled page rather than a
       * fixture repaired to suit it: three lines per cell now, six unmet
       * things across the two, and the door named before the furniture because
       * nothing can be carried into a room nobody can enter.
       */
      expect(shown.items, `the readout does not enumerate what the room needs at ${width}x${height}`).toEqual([
        localeText('hud.rooms.needs-doorway'),
        expectedItem('object.bed.name', '1'),
        expectedItem('object.toilet.name', '1'),
      ]);
      // The same figure as a number rather than as prose, so the count above is
      // not being read off the sentence it is meant to be checking. Six: a
      // door, a bed and a toilet, twice over.
      expect(shown.needs, `the readout does not report every unmet requirement at ${width}x${height}`).toBe('6');

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

    /*
     * 6. **And the player is told on the tab the game opens on**
     *    ([#1006](https://github.com/matmaxalez/lockstate/issues/1006)
     *    finding 1).
     *
     * Everything above this line is drawn inside `.hud-rooms`, and the
     * play-test that filed #1006 measured what that costs: this fixture's own
     * state -- two cells, no door in either, six unmet things -- read as
     * `1 ROOMS` with no qualifier on OVERVIEW, and eight game days there
     * produced two messages and not a word about the door. The panel is one
     * click away and a player who does not click never learns.
     *
     * So the assertion is not that the badge exists; it is that the badge is
     * **laid out on a tab where `.hud-rooms` is not**, off a readout this
     * thread has to keep pulling for it. That is why it is measured here and
     * not in `ui-shell.spec.ts`: the harness never runs `src/main.ts`, which is
     * where the tab gate lives. **The assertion that actually distinguishes the
     * two behaviours is the second tab hop below**, and the block there says
     * why the three immediately following this paragraph do not.
     *
     * The number is the panel's own: `2` unfinished rooms is `shown.unfinished`
     * asserted at every viewport above, off the same `HudRoomNeedsViewModel`.
     */
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('.ui-tab[data-tab="overview"]').click();
    await expect(page.locator('.hud-rooms')).toBeHidden();

    const notReady = page.locator('.ui-stat[data-metric="rooms"] .ui-badge');
    // Built from the bundled catalogue rather than typed, for the reason the
    // room line above is: ADR 0011 puts the key on one side of that boundary
    // and the text on the other.
    await expect(notReady.locator('.ui-badge__text')).toHaveText(
      localeText('hud.status.rooms-not-ready').replace('{count}', '2'),
    );
    await expect(notReady).toHaveAttribute('data-tone', 'warning');
    expect(
      await notReady.evaluate((node) => node.getClientRects().length > 0),
      'the badge has no box on OVERVIEW, so it says nothing a player can read',
    ).toBe(true);
    expect(
      await page.evaluate(() => document.querySelector('.hud-rooms')?.getClientRects().length ?? -1),
      'the Rooms panel still has a box on OVERVIEW, so this assertion is not measuring the finding',
    ).toBe(0);

    /*
     * **A second hop, and it is the assertion that actually bites.**
     *
     * The three above pass on `origin/main`'s `src/main.ts` as well, and the
     * reason is worth writing down because it is a race rather than a bug in
     * this test: leaving the Rooms tab used to call `applyRoomNeeds(undefined)`,
     * but the `read()` started on the Rooms tab resolves *after* that and puts
     * the readout back with no tab check. The badge is then on screen and
     * **frozen** -- nothing refreshes it again for the rest of the session --
     * which is a state the assertions above cannot tell from a live one.
     *
     * A second tab change is what separates them. On the old behaviour there is
     * no read in flight this time, so the clear stands and the badge never
     * comes back; on this one every tab asks, so it is there on BUILD and still
     * there on the way back. Both directions are checked, because "it survived
     * one hop" is exactly the weaker claim the paragraph above describes.
     */
    await page.locator('.ui-tab[data-tab="build"]').click();
    await expect(page.locator('.hud-build')).toBeVisible();
    await expect(
      notReady.locator('.ui-badge__text'),
      'the badge went away on a tab nothing refreshes the room readout from',
    ).toHaveText(localeText('hud.status.rooms-not-ready').replace('{count}', '2'));

    await page.locator('.ui-tab[data-tab="overview"]').click();
    await expect(page.locator('.hud-rooms')).toBeHidden();
    await expect(notReady.locator('.ui-badge__text')).toHaveText(
      localeText('hud.status.rooms-not-ready').replace('{count}', '2'),
    );
  });

  /**
   * The whole player loop, driven with `Tab` and the keys and nothing else
   * (#411).
   *
   * ### What was wrong
   *
   * The only producer of a room rectangle was a pointer drag on the world
   * canvas, and the canvas cannot take keyboard focus at all. Zoning gates
   * accommodation and `AdmitPrisoner` refuses an arrival with nowhere to put
   * it, so a keyboard-only player did not merely lose a convenience: every
   * admission was refused for the rest of the session and the game could not
   * be finished.
   *
   * ### Why this test is shaped the way it is
   *
   * Three things about it are deliberate, and each closes a way it could pass
   * while a player still could not play.
   *
   *  1. **It asserts results, never controls.** #411 says so outright: *"Do
   *     not assert merely that a control exists; assert the command was issued
   *     and the room exists afterwards."* A control-existence assertion would
   *     have passed on the day the Rooms panel shipped, with no keyboard route
   *     in it. So the claims are `[data-metric="rooms"]` moving 0 -> 1 with a
   *     real simulation worker behind it, and a prisoner admitted after that.
   *  2. **The pre-state is asserted.** Both counts are read as `0` before a key
   *     is pressed, so a prison leaked by an earlier test cannot let this one
   *     pass on somebody else's room.
   *  3. **A trusted-pointer tripwire runs for the whole test.** No browser spec
   *     in this repository had ever pressed `Tab` before this one, and the
   *     easiest way to "fix" a keyboard spec that has gone red is to reach for
   *     `.click()`. The page records every trusted `pointerdown`/`mousedown`
   *     that reaches it; the assertion is that there were none, and the last
   *     two lines make one on purpose so a recorder that never attached cannot
   *     read as silence.
   */
  test('zones a room and admits a prisoner with the keyboard alone (#411)', async ({ page }) => {
    /*
     * **Slow, and the reason is the ADR rather than the test.**
     *
     * `test.slow()` triples the 60 s budget, and it is used here for the same
     * kind of reason the save round trip above uses it: this test now builds a
     * prison before it can zone a room in it. ADR 0045 made an `enclosed`
     * room's walls a precondition of `zone`, so the keyboard-only loop is ten
     * `wall-brick` orders long before it reaches the Rooms panel at all --
     * and a keyboard interaction with the assembled page costs ~130 ms
     * (~1.5 ms on a blank page: it is the renderer's frame, not Playwright),
     * which puts the ten orders alone at ~30 s. Measured end to end at ~65 s.
     *
     * **THE ~65 s WAS TAKEN ON A HOST THIS PARAGRAPH DOES NOT NAME, AND ON THE
     * ONE `#1008` IS ABOUT IT IS BOTH TOO SMALL AND ABOUT THE WRONG THING.**
     * Both readings are kept, because the ratio between them is what a reader
     * needs -- see `wallRectanglesFromTheKeyboard`, which makes the same
     * correction about the same two figures. Measured on that container -- four
     * cores, no GPU, Chromium rasterising WebGL through SwiftShader, one worker
     * -- on 2026-09-08, instrumented at every phase boundary of this test and
     * then removed again:
     *
     * | | before | after |
     * | --- | --- | --- |
     * | `Tab`/`Shift+Tab` presses | 205 | **124** |
     * | time inside those presses | 52.4 s | -- |
     * | the ten wall orders | 28.5 s | unchanged |
     * | the crew, at x4 | 10.3 s | unchanged |
     * | whole test, instrumented | 98.6 s | -- |
     * | whole test, three repeats | 1.7 / 1.7 / 1.6 m | **1.4 / 1.4 / 1.3 m** |
     *
     * So the sentence above is right about *where* the work is and wrong about
     * what a press costs: here a press and the `page.evaluate` that reads where
     * it landed are **~250 ms together**, not ~130 ms, and walking focus is
     * more of this test than the walls and the crew put together. The repeats
     * are un-instrumented and are the honest comparison; the two blocks ran
     * back to back at load average 3.4 and 1.7 respectively, and the same
     * commit measured twice on this box can differ by 40 % (see `#88` above),
     * so read the *press counts* as the durable number and the minutes as the
     * effect they had on this host on this day.
     *
     * Four hops are the whole of the difference, and every one of them crosses
     * the HUD rather than walking the typed route -- so `shiftTabTo` takes them
     * the short way round: 99 presses become 18. That table, and the argument
     * that no assertion moves, is on `shiftTabTo`.
     *
     * It is not a timeout raised over a flaky assertion. Nothing below is
     * weakened, nothing polls for longer, and the wall-building itself is
     * asserted at every step -- the purchase, the order count the worker
     * received, the speed the clock reached and the queue draining to nothing.
     */
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await installTrustedPointerTripwire(page);
    await openApp(page);

    const metric = (id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);
    const hops: { target: string; presses: number; backwards?: boolean }[] = [];
    const hop = async (description: string, target: FocusTarget): Promise<void> => {
      hops.push({ target: description, presses: await tabTo(page, description, target) });
    };
    /*
     * The same hop the short way round, recorded the same way.
     *
     * Only ever used for a hop *between* panels, which is the set this test
     * deliberately does not bound -- see `routeHops` at the foot of the test
     * for why, and `shiftTabTo` for the measured table. Every hop on the typed
     * route stays forwards, so the numbers this test asserts are the numbers
     * it asserted before.
     */
    const hopBack = async (description: string, target: FocusTarget): Promise<void> => {
      hops.push({ target: description, presses: await shiftTabTo(page, description, target), backwards: true });
    };

    // Pre-state: no prison has been created, so no prison has reported, and
    // the strip says exactly that -- `--`, the clock's own unknown readout
    // (#1191). Both assertions read `'0'` until then and both are strictly
    // stronger this way round: a leaked prison publishes counts, and a
    // published count is never `--`, so the guard still catches everything it
    // caught and no longer passes on a strip that has heard nothing.
    await expect(metric('rooms'), 'a prison leaked from an earlier test').toHaveText('--');
    await expect(metric('prisoners'), 'a prisoner leaked from an earlier test').toHaveText('--');

    // ---- a prison ----------------------------------------------------
    await hop('the New prison button', {
      selector: '.save-panel__button',
      text: localeText('save.action.create'),
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    /*
     * ---- and the walls the cell has to have first (ADR 0045) ----------
     *
     * The loop this test measures grew a step. `RoomZoningService.zone`
     * refuses a room whose definition authors an `enclosed` requirement and
     * whose perimeter is open -- the owner's ruling, ADR 0045 decision 1 --
     * and `room.cell` authors it. So "the whole player loop" now begins with
     * bricks, and a keyboard-only player who cannot lay a wall cannot reach a
     * cell however reachable the Rooms panel is.
     *
     * That makes this a **stronger** test of the same claim rather than a
     * detour around a new obstacle: the route it walks is now buy, order,
     * build, zone, admit, and every press of it is a key. Nothing about the
     * three properties in the header changes -- results are still what is
     * asserted, the pre-state is still read, and the tripwire still runs.
     *
     * The rectangle is the one typed below, so the room and its walls cannot
     * drift apart.
     */
    const cell: TileRectangle = { x: 4, y: 4, width: 2, height: 3 };
    await wallRectanglesFromTheKeyboard(page, [cell]);

    // ---- the Rooms tab, and what the room is for ----------------------
    // Backwards: `wallRectanglesFromTheKeyboard` left the keyboard on the
    // transport's *Pause*, and the tab bar is the last child of `.hud`
    // (`src/ui/hud/hud.ts:2441`), so forwards is 24 presses and backwards is 4.
    // `shiftTabTo` carries the table and the argument.
    await hopBack('the Rooms tab', { selector: '.ui-tab[data-tab="zones"]' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms')).toBeVisible();

    /*
     * One `Tab` into the catalogue, then arrows to the room (#411).
     *
     * The catalogue is eighteen rows and a `radiogroup`, so it costs one tab
     * stop rather than eighteen -- and `room.cell` is not even the first of
     * them in the order the host draws: measured on this page it is fifth. The
     * helper presses `Enter` on it and checks `aria-checked`, which is a
     * vacuity guard rather than a claim: if the choice did not land, every
     * number below would be about a room type nobody chose.
     */
    hops.push({
      target: 'the room catalogue',
      presses: await chooseRoomTypeFromTheKeyboard(page, 'room.cell', { backwards: true }),
      backwards: true,
    });
    await expect(page.locator('.hud-rooms__list [data-room="room.cell"]')).toHaveAttribute(
      'data-selected',
      'true',
    );

    // ---- and where it goes, typed ------------------------------------
    await hop('the coordinates disclosure', { selector: '.hud-rooms__coordinates > .ui-section__header' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms__coordinates')).toHaveAttribute('data-collapsed', 'false');

    // The rectangle the walls above were built around, typed in. Inside the
    // starting parcel -- `createNewSimulationRuntime` loads and owns chunk
    // (0,0) at 32 tiles a side -- and `room.cell`'s authored minimum exactly
    // (`minWidth: 2, minHeight: 3, minTiles: 6`), because every tile of
    // perimeter beyond it is another wall this player has to order by hand.
    for (const [field, value] of [
      ['x', cell.x],
      ['y', cell.y],
      ['width', cell.width],
      ['height', cell.height],
    ] as const) {
      hops.push({ target: `the ${field} field`, presses: await typeCoordinate(page, field, value) });
    }

    // ---- the rectangle, then the confirm ------------------------------
    // The form's own control is the typed route's release: it produces the
    // pending rectangle a finished drag produces, and nothing more. This hop
    // is also what commits the height field, since a field reports on
    // `change` and `change` fires when focus leaves the input.
    await hop('the form control', { selector: '.hud-rooms__coordinates-submit' });
    await page.keyboard.press('Enter');
    // The four numbers reached the panel's pending rectangle, and they are the
    // four that were typed -- read off the panel's own `data-area`, which is
    // the attribute a pointer drag writes.
    await expect(page.locator('.hud-rooms__area')).toHaveAttribute(
      'data-area',
      `${cell.x},${cell.y},${cell.width},${cell.height}`,
    );
    await hop('the confirm control', { selector: '.hud-rooms__confirm' });
    await page.keyboard.press('Enter');

    // A new session starts paused. The count moving is the proof that a real
    // simulation worker accepted a real `ZoneRoom` -- and since ADR 0051
    // it moves on the confirm rather than
    // on this press, which is kept because the claim under test is the typed
    // rectangle reaching the worker and not when the clock ran.
    await hop('the Play control', {
      selector: '.hud-strip__transport button',
      text: localeText('hud.transport.play'),
    });
    await page.keyboard.press('Enter');
    await expect(metric('rooms'), 'no room reached the worker from the typed rectangle').toHaveText('1');

    // ---- and the loop the room unblocks -------------------------------
    // Both backwards, and these two were the most expensive hops in the test:
    // 33 presses forwards from the transport to the tab bar and 22 more from
    // the tab bar down to the Admit control, against 7 and 1 the other way.
    // The tab is Manage since 2026-09-14 (ADR 0112 decision 3): admissions
    // moved to the section that holds the staff, so the walk that used to end
    // on Overview ends one tab further along and the hop counts above are a
    // record of the route as it was measured, not of this one.
    await hopBack('the Manage tab', { selector: '.ui-tab[data-tab="manage"]' });
    await page.keyboard.press('Enter');
    await hopBack('the Admit control', { selector: '.hud-intake__admit' });
    await page.keyboard.press('Enter');
    await expect(metric('prisoners'), 'the admission was refused, so the loop is still broken').toHaveText(
      '1',
    );

    /*
     * #411's "reachable in a sensible tab order", as a number.
     *
     * Every hop above is already bounded by `MAX_TAB_PRESSES_PER_HOP`, which
     * is what "reachable" means here -- `tabTo` throws otherwise, and that is
     * how this test failed before the route existed. The tighter bound is
     * placed on the route this change adds: from the chosen room type to the
     * disclosure, through the four fields, to the confirm control. Those are
     * the hops a player takes over and over, and the ones a regression in this
     * panel's DOM order would lengthen.
     *
     * It is deliberately not placed on the hops *between* panels. Reaching the
     * tab bar from the status strip crosses every focusable control in the
     * HUD, which is a fact about the page's document order and has nothing to
     * say about this route; bounding it here would make an unrelated control
     * added anywhere on the page fail a Rooms panel test.
     *
     * `the room catalogue` is recorded and deliberately *not* bounded, for
     * that same reason: it is the walk from the Rooms tab across the panel's
     * own chrome to the first row, so its length is a fact about how many
     * controls the panel header carries. What the roving tab stop changed is
     * the hop *out* of the catalogue, and that is the number asserted below.
     */
    const routeHops = new Set([
      'the coordinates disclosure',
      'the x field',
      'the y field',
      'the width field',
      'the height field',
      'the form control',
      'the confirm control',
    ]);
    // The direction is printed, because half of these hops are `Shift+Tab`
    // now and a bare number beside a message that says "Tab presses" would
    // read as the wrong thing at the one moment anybody reads it.
    const summary = hops
      .map((entry) => `${entry.target}: ${entry.presses}${entry.backwards === true ? ' back' : ''}`)
      .join(', ');
    expect(
      hops.filter((entry) => routeHops.has(entry.target) && entry.presses > 20).map((entry) => entry.target),
      `a control on the typed route took more than 20 Tab presses to reach (${summary})`,
    ).toEqual([]);

    /*
     * And the route is short, which is a different claim from reachable.
     *
     * The bound above is #411's "sensible tab order" and it was met on the day
     * ADR 0039 landed. What was not met is the shape of the walk: the
     * catalogue is eighteen rows, each a `<button>` and therefore each its own
     * tab stop, and the coordinate form is the last child of the same
     * scroller -- so a player crossed the remainder of the list to reach it on
     * every room they ever zoned. This assertion was watched going red with
     * the roving tab stop removed by hand, and it reported the old number:
     * `the room catalogue: 18, the coordinates disclosure: 14`. Eighteen tab
     * stops for one choice is the case the WAI-ARIA
     * composite-widget rule exists for, and the catalogue is now a
     * `radiogroup` with a roving tab stop: one `Tab` in, arrows inside, one
     * `Tab` out.
     *
     * So this is asserted as an exact number rather than a bound. `1` is the
     * whole claim -- from the chosen room type, the disclosure is the very next
     * thing `Tab` reaches -- and a bound of "a few" would have been satisfied
     * by the eighteen this replaced if the list had been shorter, which would
     * make the assertion a statement about the catalogue's length rather than
     * about its focus model.
     */
    const disclosureHop = hops.find((entry) => entry.target === 'the coordinates disclosure');
    expect(
      disclosureHop?.presses,
      `the typed route is no longer one Tab from the chosen room type (${summary})`,
    ).toBe(1);
    // And the route was actually walked, rather than the filter above quietly
    // matching nothing because a name was reworded.
    expect(
      hops.filter((entry) => routeHops.has(entry.target)).length,
      `the typed route's hops were not recorded (${summary})`,
    ).toBe(routeHops.size);

    // ---- the tripwire -------------------------------------------------
    expect(
      await trustedPresses(page),
      'a pointer press reached the page, so this test did not prove a keyboard-only route',
    ).toEqual([]);
    // And the recorder was live throughout, which is the half that stops the
    // assertion above from being a green light for a listener that never
    // attached. One deliberate pointer press, after every claim is made.
    await page.locator('.ui-tab[data-tab="build"]').click();
    expect(
      await trustedPresses(page),
      'the tripwire recorded nothing for a real pointer press, so it was never watching',
    ).not.toEqual([]);
  });

  /**
   * Removal, from the keyboard, with no separate work behind it (#411).
   *
   * `zone-room` and `unzone-room` are the two `HudIntent` kinds that had no
   * keyboard producer at all, and they were unreachable for one reason: both
   * need a rectangle, and the only producer of one was a drag. The Rooms
   * panel's confirm row is driven by *whether* a rectangle is pending and not
   * by which producer set it, so a second producer of `pending` reaches both.
   * That is a claim about the panel's shape rather than an obvious
   * consequence, so it is measured here -- and measured as #411 asks, on the
   * command rather than on the control: the room count goes back to 0, which
   * only a real `UnzoneRoom` reaching the worker can do.
   */
  test('takes a room back with the keyboard alone, through the same confirm control (#411)', async ({
    page,
  }) => {
    // Slow for the reason the test above is, and the same ten wall segments
    // behind it: see that comment, which also carries the measurement of where
    // the budget goes and the correction to the ~130 ms a press was said to
    // cost. This test's own numbers on the same container on 2026-09-08:
    // **221 `Tab`/`Shift+Tab` presses before and 153 after**, 56.3 s of the
    // 104.3 s instrumented run spent inside them, and three un-instrumented
    // repeats of each version back to back -- **1.7 / 1.7 / 1.8 m before,
    // 1.5 / 1.5 / 1.5 m after**. Two hops are most of it and both are
    // between-panel walks turned round (`shiftTabTo`).
    test.slow();
    await page.setViewportSize({ width: 1280, height: 800 });
    await installTrustedPointerTripwire(page);
    await openApp(page);

    const metric = (id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);
    // `--` rather than `0` for the reason the test above records: nothing has
    // been created, so nothing has reported (#1191), and a leaked prison would
    // have published a count rather than left the chip unreported.
    await expect(metric('rooms'), 'a prison leaked from an earlier test').toHaveText('--');

    /*
     * The rectangle, and the walls it now needs before `zone` will take it
     * (ADR 0045 decision 1; see the test above). Un-zoning needs no walls of
     * its own -- decision 6 gives `unzone` no symmetric refusal, and that is
     * checked here by the count going back to 0 with the perimeter still
     * standing -- but there is nothing to take back until a room exists.
     *
     * The cell's own minimum, rather than the 4x4 this used to type: it is the
     * smallest rectangle `room.cell` accepts (`minWidth: 2, minHeight: 3,
     * minTiles: 6`), so it is ten wall segments instead of sixteen, and what
     * this test is about is which producer set the pending rectangle rather
     * than how big it was.
     */
    const cell: TileRectangle = { x: 6, y: 6, width: 2, height: 3 };

    /**
     * Type one rectangle and confirm it, whichever mode the panel is in.
     *
     * `reachBackwards` is which way the *first* hop of the pair goes, and it is
     * a cost rather than a claim (`shiftTabTo` carries the table). This helper
     * is called twice from two different places: the first time from the chosen
     * room type, where the disclosure is the very next tab stop, and the second
     * from the removal toggle at the other end of the panel, where forwards is
     * 25 presses and backwards is 15. Nothing after that first hop changes
     * direction -- the four fields, the form control and the confirm control
     * are walked forwards both times.
     */
    const typeRectangleAndConfirm = async (
      options: { readonly reachBackwards?: boolean } = {},
    ): Promise<void> => {
      await (options.reachBackwards === true ? shiftTabTo : tabTo)(page, 'the coordinates disclosure', {
        selector: '.hud-rooms__coordinates > .ui-section__header',
      });
      if ((await page.locator('.hud-rooms__coordinates').getAttribute('data-collapsed')) === 'true') {
        await page.keyboard.press('Enter');
      }
      for (const [field, value] of [
        ['x', cell.x],
        ['y', cell.y],
        ['width', cell.width],
        ['height', cell.height],
      ] as const) {
        await typeCoordinate(page, field, value);
      }
      await tabTo(page, 'the form control', { selector: '.hud-rooms__coordinates-submit' });
      await page.keyboard.press('Enter');
      await tabTo(page, 'the confirm control', { selector: '.hud-rooms__confirm' });
      await page.keyboard.press('Enter');
    };

    await tabTo(page, 'the New prison button', {
      selector: '.save-panel__button',
      text: localeText('save.action.create'),
    });
    await page.keyboard.press('Enter');
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    await wallRectanglesFromTheKeyboard(page, [cell]);

    // Backwards, for the reason the test above gives at the same point: the
    // wall helper leaves the keyboard on *Pause* and the tab bar is the last
    // child of `.hud`, so this is 4 presses instead of 24.
    await shiftTabTo(page, 'the Rooms tab', { selector: '.ui-tab[data-tab="zones"]' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms')).toBeVisible();
    await chooseRoomTypeFromTheKeyboard(page, 'room.cell', { backwards: true });

    await typeRectangleAndConfirm();
    await tabTo(page, 'the Play control', {
      selector: '.hud-strip__transport button',
      text: localeText('hud.transport.play'),
    });
    await page.keyboard.press('Enter');
    await expect(metric('rooms'), 'no room reached the worker from the typed rectangle').toHaveText('1');

    // ---- and back out again -------------------------------------------
    // Backwards from the transport, 8 presses against 32.
    await shiftTabTo(page, 'the removal toggle', { selector: '.hud-rooms__remove' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms__remove')).toHaveAttribute('aria-pressed', 'true');
    await typeRectangleAndConfirm({ reachBackwards: true });
    await expect(metric('rooms'), 'the typed rectangle never reached UnzoneRoom').toHaveText('0');

    expect(
      await trustedPresses(page),
      'a pointer press reached the page, so this test did not prove a keyboard-only route',
    ).toEqual([]);
    await page.locator('.ui-tab[data-tab="build"]').click();
    expect(
      await trustedPresses(page),
      'the tripwire recorded nothing for a real pointer press, so it was never watching',
    ).not.toEqual([]);
  });


  /**
   * Where the keyboard is left after a command, measured on every control that
   * issues one (the accessibility playtest of 2026-08-29).
   *
   * ### What was measured, and what it cost a player
   *
   * Every command-issuing control in the HUD shares one `BusyGroup`, and
   * dispatching a command sets `disabled` on all of them
   * (`src/ui/primitives/async-action.ts`, `src/ui/hud/hud.ts`). Disabling the
   * element that holds focus blurs it to `<body>`, and re-enabling it a moment
   * later does not undo that. So a keyboard player was returned to the top of
   * the document by *every command in the game* -- Buy, Place order, Designate,
   * Hire, Admit, New prison and every transport press -- whether the command
   * succeeded or was refused.
   *
   * The Rooms panel's *Designate* reached the same end by a different road,
   * which is why it is measured here rather than assumed to follow: that
   * control **hides itself** before it dispatches (`paintActions` swaps the
   * confirm pair for the arm pair in `src/ui/hud/rooms-panel.ts`), so it is
   * already blurred by the time the busy group sees it and no amount of
   * restoring inside the group can reach it. It is handed on by the panel, to
   * the control that took its place in the same row.
   *
   * ### Why this is a browser test and why it is here
   *
   * The *rules* -- give back only focus you took, only while nobody else has
   * claimed it, only to a control that can hold it -- are pure predicates and
   * are proven in the `node` environment by
   * `tests/unit/ui-async-action-gate.test.ts` and
   * `tests/unit/ui-focus-handoff.test.ts`, per the pairing rule in
   * `docs/TESTING.md`. What no unit test can reach is that a real browser
   * really blurs a control it disables, that `document.activeElement` really
   * ends on `<body>`, and that the group really is wired to the five panels.
   * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so the whole
   * of that is invisible one layer down.
   *
   * It belongs in *this* file rather than in `ui-shell.spec.ts` because the
   * claim is about the assembled application: one busy group is shared by the
   * status strip and five panels that are built separately, and the save panel
   * -- which has two busy groups of its own -- is mounted into the HUD's aside
   * slot by `bootPersistence`. No harness page has all of them.
   *
   * ### Every command below really is a command
   *
   * A press that was quietly refused would drop focus the same way, so a test
   * that did not check would prove nothing about the working case. Each record
   * carries the control's own `data-action-failed`, which `mountHud` sets on
   * a host refusal, and the refusal line is asserted hidden -- and the prison,
   * the walls, the room and the admission are each asserted to have happened.
   */
  test('every command hands the keyboard back to the control that issued it', async ({ page }) => {
    /*
     * Slow for the reason `zones a room and admits a prisoner` above is slow,
     * and the same ten wall segments are behind it: ADR 0045 makes an enclosed
     * perimeter a precondition of `zone`, so a *successful* Designate cannot be
     * reached without building one first. Measured end to end at ~110 s.
     *
     * **`test.slow()` is not enough, and the ~110 s above is why it looked as
     * though it were.** That figure is real and was taken on an idle machine;
     * `test.slow()` triples the 60 s budget to 180 s, which reads like 60 s of
     * headroom. It is not, because this test's cost is dominated by keyboard
     * round trips through the assembled page -- six command presses, each
     * reached by a `Tab` walk that costs one `page.evaluate` per press -- and
     * that cost scales with how contended the machine is rather than with
     * anything the test does. Re-measured on this branch with three other
     * Playwright runs live (load average ~9): **2.8 min**, or 93% of the 180 s
     * budget, and two earlier runs at the same load went over it and failed --
     * on `keyboard.press` once and on `locator.getAttribute` the next, which
     * is the signature of a test running out of time rather than of any one
     * step being wrong.
     *
     * So the budget is set explicitly, and against the *contended* measurement
     * rather than the idle one. 300 s is ~1.8x the loaded figure. This is not
     * a timeout raised over a flaky assertion: nothing below is weakened,
     * nothing polls for longer, and every press is still asserted to have been
     * a real command before its focus is read. It is a budget set against the
     * conditions CI actually runs in.
     *
     * Recorded because it was nearly misdiagnosed: those two failures were
     * first read as a Tab walk broken by the Build catalogue's roving tab stop
     * (#524), which had landed on `main` between this branch's base and its
     * merge. An A/B of this test on the pre-merge commit and on the merge, at
     * recorded load, killed that: **2.8 min passing before, 2.7 min passing
     * after**. #524 shortened the Build walk from 43 presses to 23, so if
     * anything it made this test faster, which is what the second figure says.
     */
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await installTrustedPointerTripwire(page);
    await installBusyTransitionRecorder(page);
    await openApp(page);

    const metric = (id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);

    /** What one command press did to the keyboard. */
    interface KeyboardRecord {
      readonly command: string;
      /** Where the keyboard should be afterwards, named for a failure message. */
      readonly wanted: string;
      /** Where it actually was, in enough detail to name the control. */
      readonly focus: string;
      /** The pressed control's `data-action-failed`; `null` is "the host took it". */
      readonly refused: string | null;
      /** Whether *this* press really put the control into a busy cycle of its own. */
      readonly dispatched: boolean;
      readonly kept: boolean;
    }
    const records: KeyboardRecord[] = [];

    /**
     * Presses the control that has focus, waits out the busy cycle it starts,
     * and records what the press did to the keyboard.
     *
     * `aria-busy` is the condition rather than a timeout: the busy group writes
     * it on every control it owns on both transitions, so `"false"` again is
     * the exact moment the group has finished re-enabling and has had its one
     * chance to give focus back. Waiting a fixed number of milliseconds would
     * measure the scheduler as much as the page.
     *
     * `settle` is each caller's own proof that the command reached the host and
     * came back -- a count that moved, a refusal line that stayed down -- and it
     * runs before the attribute is read, so the wait is never the whole of the
     * evidence.
     *
     * The transitions recorded *since this press* are what make `dispatched`
     * mean this press: several of these controls are pressed earlier in the
     * route by `wallRectanglesFromTheKeyboard`, so a mark taken before the key
     * goes down is the difference between "this control was busy at some point"
     * and "this press made it busy".
     */
    const pressAndRecord = async (
      command: string,
      pressed: Locator,
      wanted: FocusTarget,
      wantedName: string,
      settle: () => Promise<void>,
    ): Promise<void> => {
      const mark = (await busyChanges(page)).length;
      await page.keyboard.press('Enter');
      await settle();
      await expect(pressed, `${command} never came back from its busy cycle`).toHaveAttribute(
        'aria-busy',
        'false',
      );
      const className = (await pressed.getAttribute('class')) ?? '';
      const since = (await busyChanges(page)).slice(mark);
      records.push({
        command,
        wanted: wantedName,
        focus: await focusedControl(page),
        refused: await pressed.getAttribute('data-action-failed'),
        dispatched: since.includes(`${className}=true`),
        kept: await focusIs(page, wanted),
      });
    };

    // ---- the save panel's own busy group -------------------------------
    const createButton: FocusTarget = {
      selector: '.save-panel__button',
      text: localeText('save.action.create'),
    };
    await tabTo(page, 'the New prison button', createButton);
    await pressAndRecord(
      'New prison',
      page.locator('.save-panel__button', { hasText: localeText('save.action.create') }),
      createButton,
      'the New prison button',
      async () => {
        await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
      },
    );

    // ---- a walled cell, so the Designate below is a real one ------------
    const cell: TileRectangle = { x: 4, y: 4, width: 2, height: 3 };
    await wallRectanglesFromTheKeyboard(page, [cell]);

    /*
     * ---- Buy, measured on a purchase of its own -------------------------
     *
     * The helper above already buys, and deliberately is not measured through:
     * it presses *Buy* once among thirty other presses and this test would then
     * be asserting against a control state several hops old. One more brick,
     * pressed here, is a purchase the same code path answers and one this test
     * owns from press to record.
     *
     * Backwards to the tab bar and backwards again into the panel, for the
     * reason `wallRectanglesFromTheKeyboard` gives: with the Build tab showing,
     * the catalogue is twenty-one tab stops between the top of the page and
     * this panel, and forwards from the status strip is past
     * `MAX_TAB_PRESSES_PER_HOP`.
     */
    await shiftTabTo(page, 'the Build tab', { selector: '.ui-tab[data-tab="build"]' });
    const buyToggle = page.locator('.hud-build__buy-toggle');
    await shiftTabTo(page, 'the buy disclosure', { selector: '.hud-build__buy-toggle' });
    if ((await buyToggle.getAttribute('aria-expanded')) === 'false') await page.keyboard.press('Enter');
    await expect(page.locator('.hud-build__buy')).toBeVisible();
    await tabTo(page, 'the buy quantity field', { selector: '.hud-build__buy .ui-number__input' });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('1');
    await page.keyboard.press('Enter');
    const buySubmit: FocusTarget = { selector: '.hud-build__buy-submit' };
    await tabTo(page, 'the buy control', buySubmit);
    await pressAndRecord(
      'Buy',
      page.locator('.hud-build__buy-submit'),
      buySubmit,
      'the Buy control',
      async () => {
        await expect(page.locator('.hud__refusal'), 'the extra brick was refused').toBeHidden();
      },
    );

    // Folded again, so the panel is left the shape the helper left it.
    await shiftTabTo(page, 'the buy disclosure', { selector: '.hud-build__buy-toggle' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-build__buy')).toBeHidden();

    /*
     * ---- Place order, on one more wall segment --------------------------
     *
     * Away from the cell the room is zoned in, at a tile nothing else in this
     * test touches, so a segment that does or does not get built cannot change
     * what the Designate below is answered with.
     */
    const coordinates = page.locator('.hud-build__coordinates');
    await tabTo(page, 'the Build panel coordinates disclosure', {
      selector: '.hud-build__coordinates > .ui-section__header',
    });
    if ((await coordinates.getAttribute('data-collapsed')) === 'true') await page.keyboard.press('Enter');
    await expect(coordinates).toHaveAttribute('data-collapsed', 'false');
    await tabTo(page, 'the Tile X field', { selector: BUILD_TILE_X_FIELD });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('16');
    await tabTo(page, 'the Tile Y field', { selector: BUILD_TILE_Y_FIELD });
    await page.keyboard.press('Control+a');
    await page.keyboard.type('16');
    const placeOrder: FocusTarget = { selector: '.hud-build__coordinates .ui-action' };
    await tabTo(page, 'the Place order control', placeOrder);
    await pressAndRecord(
      'Place order',
      page.locator('.hud-build__coordinates .ui-action'),
      placeOrder,
      'the Place order control',
      async () => {
        await expect(page.locator('.hud__refusal'), 'the extra wall order was refused').toBeHidden();
      },
    );

    // Folded again: with the section open the next hop to another tab is 49
    // presses and `MAX_TAB_PRESSES_PER_HOP` is 48 -- the helper's own note.
    await shiftTabTo(page, 'the Build panel coordinates disclosure', {
      selector: '.hud-build__coordinates > .ui-section__header',
    });
    await page.keyboard.press('Enter');
    await expect(coordinates).toHaveAttribute('data-collapsed', 'true');

    /*
     * ---- Designate, the one that is not the busy group's to give back ----
     */
    await tabTo(page, 'the Rooms tab', { selector: '.ui-tab[data-tab="zones"]' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms')).toBeVisible();
    await chooseRoomTypeFromTheKeyboard(page, 'room.cell');
    await tabTo(page, 'the coordinates disclosure', {
      selector: '.hud-rooms__coordinates > .ui-section__header',
    });
    if ((await page.locator('.hud-rooms__coordinates').getAttribute('data-collapsed')) === 'true') {
      await page.keyboard.press('Enter');
    }
    for (const [field, value] of [
      ['x', cell.x],
      ['y', cell.y],
      ['width', cell.width],
      ['height', cell.height],
    ] as const) {
      await typeCoordinate(page, field, value);
    }
    await tabTo(page, 'the form control', { selector: '.hud-rooms__coordinates-submit' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-rooms__area')).toHaveAttribute(
      'data-area',
      `${cell.x},${cell.y},${cell.width},${cell.height}`,
    );
    await tabTo(page, 'the confirm control', { selector: '.hud-rooms__confirm' });
    /*
     * *Arm*, not *Designate*. The control that was pressed is `hidden` by the
     * time the command is dispatched -- it is one of four controls sharing one
     * 44px row, of which two show at a time -- so there is nothing to give the
     * keyboard back to. It goes to the control that took its place in that row,
     * which is also the one a player who has just designated a room reaches for
     * to draw the next.
     */
    await pressAndRecord(
      'Designate',
      page.locator('.hud-rooms__confirm'),
      { selector: '.hud-rooms__arm' },
      'the Arm control that replaced it',
      async () => {
        // A room the worker really accepted. Since ADR 0051 the count moves on
        // this press rather than on a later Play, which is why nothing is
        // resumed first.
        await expect(
          metric('rooms'),
          'no room reached the worker, so this Designate was refused',
        ).toHaveText('1');
      },
    );

    // ---- Hire ------------------------------------------------------------
    await tabTo(page, 'the Security tab', { selector: '.ui-tab[data-tab="manage"]' });
    await page.keyboard.press('Enter');
    await expect(page.locator('.hud-staff')).toBeVisible();
    await tabTo(page, 'a staff role row', { selector: '.hud-staff__list [data-staff-role]' });
    await page.keyboard.press('Enter');
    // A vacuity guard rather than a claim, and the reason it gives is not the
    // one written here first.
    //
    // This comment said "*Hire* is disabled until a role is chosen
    // (`src/ui/hud/staff-panel.ts`), so an unchosen row would make the press
    // below a press on a disabled control." **That is false**, and it was
    // false when written: `staff-panel.ts` opens with
    // `let selectedId = model.roles[0]?.staffRoleId`, so the first role is
    // already chosen before anything is pressed, and `HIREABLE_STAFF_ROLE_IDS`
    // holds exactly one id (`src/main.ts`) -- so there is no state in this
    // build where the list has a row and *Hire* is disabled. Measured by
    // playing: the control arrives reading `Hire Guard · 80` with
    // `disabled: false`, before any row is clicked.
    //
    // The guard is kept, because what it actually rules out is the case the
    // press above failed to reach a row at all -- `tabTo` landing somewhere
    // else, or the catalogue rendering empty -- which would leave the record
    // below describing a press on a control the test never found. That is a
    // different vacuity from the one the old sentence named, and it is the
    // one this assertion can see.
    await expect(
      page.locator('.hud-staff__list [data-selected="true"]'),
      'no staff role was chosen, so the Hire press below has no subject',
    ).toHaveCount(1);
    const hire: FocusTarget = { selector: '.hud-staff__hire' };
    await tabTo(page, 'the Hire control', hire);
    await pressAndRecord('Hire', page.locator('.hud-staff__hire'), hire, 'the Hire control', async () => {
      await expect(metric('staff'), 'nobody was hired, so this Hire was refused').toHaveText('1');
    });

    // ---- Admit -----------------------------------------------------------
    // The same tab the Hire control above is on, since the owner's ruling of
    // 2026-09-14 put admissions beside the staff. The tab press is kept rather
    // than dropped: re-selecting the active tab is idempotent
    // (`hudShellReducer`), and what this walk measures is the route a keyboard
    // takes from the tab bar to a control, not how few presses the test can
    // get away with.
    await tabTo(page, 'the Manage tab', { selector: '.ui-tab[data-tab="manage"]' });
    await page.keyboard.press('Enter');
    const admit: FocusTarget = { selector: '.hud-intake__admit' };
    await tabTo(page, 'the Admit control', admit);
    await pressAndRecord('Admit', page.locator('.hud-intake__admit'), admit, 'the Admit control', async () => {
      await expect(metric('prisoners'), 'nobody was admitted, so this Admit was refused').toHaveText('1');
    });

    // ---- what the six presses did to the keyboard ------------------------
    const summary = records
      .map(
        (record) =>
          `${record.command} -> ${record.focus} (wanted ${record.wanted}; data-action-failed=${String(record.refused)}; dispatched=${String(record.dispatched)})`,
      )
      .join('\n  ');
    // First, that every press really was a command the host took, from both
    // ends. A press the gate refused as busy never disables anything, so the
    // control keeps the focus it already had -- which would pass the assertion
    // below for a press that was never a command; and a press the host refused
    // drops focus exactly as a successful one did. Neither is what this test is
    // about, and neither is visible in where focus ended up.
    expect(
      records.filter((record) => !record.dispatched).map((record) => record.command),
      `a press never started a busy cycle of its own, so no command was issued:\n  ${summary}`,
    ).toEqual([]);
    expect(
      records.filter((record) => record.refused !== null).map((record) => record.command),
      `a command was refused on this thread, so its record is about a refusal:\n  ${summary}`,
    ).toEqual([]);
    expect(
      records.filter((record) => !record.kept).map((record) => record.command),
      `a command press dropped the keyboard:\n  ${summary}`,
    ).toEqual([]);
    // And every command was actually pressed, rather than the filters above
    // quietly matching an empty list because a step was reworded away.
    expect(records.map((record) => record.command), `the route was not walked:\n  ${summary}`).toEqual([
      'New prison',
      'Buy',
      'Place order',
      'Designate',
      'Hire',
      'Admit',
    ]);

    // ---- the tripwire -----------------------------------------------------
    expect(
      await trustedPresses(page),
      'a pointer press reached the page, so this test did not prove a keyboard-only route',
    ).toEqual([]);
    // And the recorder was live throughout, which is the half that stops the
    // assertion above from being a green light for a listener that never
    // attached. One deliberate pointer press, after every claim is made.
    await page.locator('.ui-tab[data-tab="build"]').click();
    expect(
      await trustedPresses(page),
      'the tripwire recorded nothing for a real pointer press, so it was never watching',
    ).not.toEqual([]);
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

  test('Manage lists local saves, confirms deletion, restores it, and states why cloud saves are unavailable (#1168)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await expect(page.locator('.manage-saves')).toBeHidden();
    await page.locator('.ui-tab[data-tab="manage"]').click();
    const details = page.locator('.manage-saves');
    await expect(details).toBeVisible();
    await details.locator('summary').click();
    await expect(details.locator('.manage-saves__cloud')).toHaveText(
      'Cloud saves are unavailable in this version because the game has no cloud connection.',
    );
    await expect(details.locator('.manage-saves__list')).toContainText('No prisons yet.');

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(details.locator('.manage-saves__item')).toHaveCount(1);
    await expect(details.locator('.manage-saves__name')).toContainText('New Prison (1 gen)');
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(details.locator('.manage-saves__item')).toHaveCount(2);

    const second = details.locator('.manage-saves__item').last();
    await second.getByRole('button', { name: 'Load' }).click();
    await expect(details.locator('.manage-saves__status')).toHaveText('Loaded.');

    await details.locator('.manage-saves__item').last().getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(details.getByRole('button', { name: 'Delete permanently' })).toBeVisible();
    await expect(details.getByRole('button', { name: 'Keep' })).toBeFocused();
    await details.getByRole('button', { name: 'Keep' }).click();
    await expect(details.locator('.manage-saves__item')).toHaveCount(2);
    await details.locator('.manage-saves__item').last().getByRole('button', { name: 'Delete', exact: true }).click();
    await details.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(details.locator('.manage-saves__item[data-deleted-prison-id]')).toHaveCount(1);
    await details.getByRole('button', { name: 'Bring it back' }).click();
    await expect(details.locator('.manage-saves__item[data-deleted-prison-id]')).toHaveCount(0);
    await expect(details.locator('.manage-saves__item')).toHaveCount(2);
  });

  test('Manage refreshes an armed deletion age after returning to the tab (#1168)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await page.locator('.ui-tab[data-tab="manage"]').click();
    const details = page.locator('.manage-saves');
    await details.locator('summary').click();
    await details.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirmation = details.locator('.manage-saves__confirm');
    await expect(confirmation).toContainText('less than a minute ago');
    await page.evaluate(() => {
      const later = Date.now() + 2 * 60 * 60 * 1000;
      Date.now = () => later;
    });
    await page.locator('.ui-tab[data-tab="build"]').click();
    await page.locator('.ui-tab[data-tab="manage"]').click();
    await expect(confirmation).toContainText('2 h ago');
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
   * An order given while the clock is paused, answered while the clock is
   * still paused (ADR 0051).
   *
   * **This is the first thing a player does, and it used to produce nothing.**
   * A new session arrives paused -- `handleInitialize` builds the clock
   * `{ mode: 'paused' }` and nothing in `src/` starts it, so the only way it
   * runs is a transport control the player has not pressed yet. Against that
   * clock the worker accepted a `PlaceBuildOrder`, answered `status: 'queued'`,
   * and then had no `Kernel.step()` to dispatch it with, because the tick loop
   * exists only in the `running` state. The wall did not appear, the Build
   * panel's queue block stayed hidden, no count moved and no sentence was
   * painted. Thirteen `HudIntent` kinds reach the simulation and every one of
   * them was silent for the length of the pause.
   *
   * **Why it can only be settled here.** Vitest runs in the `node` environment
   * with no DOM, so nothing headless executes `build-panel.ts` at all; and the
   * claim is not about any one layer but about five of them meeting -- a real
   * click, a real `postMessage`, the worker's paused dispatch, the forced
   * `simulation/status-counts` behind it, the `hud/build-queue` projection the
   * composition root asks for on that message, and the block that draws the
   * answer. A worker-level test can show the command was dispatched; only this
   * one can show the player was told.
   *
   * **The clock is asserted to be stopped at both ends**, before the press and
   * after the row appears, and the day readout is asserted not to have moved.
   * Without that pair this test would pass just as well against a build that
   * quietly started the simulation, which is the fix this one rejects.
   */
  test('answers an order given while the clock is paused, without the clock ever running', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');

    const pause = page.locator('.hud-strip__transport [title="Pause"]');
    const progress = page.locator('.hud-clock__day-progress');
    // Non-vacuous: the session really is paused at the start of day one, so
    // everything below is measured against a clock that has never run.
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(progress).toHaveText('0%');

    await page.getByRole('button', { name: 'Build' }).click();
    await expect(page.locator('.hud-build')).toBeVisible();
    // And the queue block is genuinely absent beforehand -- `paintQueue` hides
    // the section and deletes `data-queued` for a prison with nothing ordered,
    // so a row appearing below cannot be furniture that was always there.
    await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /.*/);
    await expect(page.locator('.hud-build__queue')).toBeHidden();

    // One wall, through the panel's own numeric route: the keyboard-reachable
    // half of the two producers of `place-build-order`, and the one that needs
    // no camera arithmetic. One press is one order.
    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('5');
    await page.locator('.hud-build__coordinates .ui-action').click();

    // The answer, on the panel, with the clock still stopped.
    await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', '1', { timeout: 15_000 });
    const queueFold = page.locator('.hud-build__queue > .ui-section__header');
    await expect(queueFold).toBeVisible();
    await queueFold.click();
    const rows = page.locator('.hud-build__queue-row:not([hidden])');
    await expect(rows).toHaveCount(1);
    // The row names the tile the player typed, which is how they aim at an
    // order -- `projectBuildQueue` carries the tile precisely because an id is
    // not something a player can read.
    await expect(rows.first().locator('.hud-build__queue-label')).toContainText('5');

    // And the clock never ran: the order was answered by the pause, not by
    // time passing behind it.
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await expect(progress).toHaveText('0%');
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

    // No session, so nothing has been published and the strip says so: `--`,
    // the clock's own unknown readout, rather than a zero.
    //
    // **This assertion read `'0'` until #1191 and moving it makes this test
    // stronger rather than weaker, which is why it moved.** The subject of
    // this test is that the counts come from the worker and not from zeros
    // baked into the page, and a strip reading `0` before any publication is
    // exactly what a baked-in zero looks like -- the old assertion was
    // satisfied by the defect it was written to exclude. `--` cannot be
    // produced by a hardcoded count, so the pre-publication state now
    // discriminates. The published zero is still asserted twenty lines below,
    // against the worker's own `counts.prisoners === 0`: a prison that really
    // reports nothing in it still states that.
    expect(await publications()).toEqual([]);
    await expect(metric('prisoners')).toHaveText('--');

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
    // The worker's answer, not the click. `aria-pressed` flips only once the
    // `set-clock` command has come back accepted, so a command that was
    // refused or never reached the worker fails *here*, naming the step.
    // Without it the poll below spends its whole 15s budget and then reports
    // "the simulation never advanced", which describes the symptom and not
    // the cause -- exactly how #425 read on CI, where the clock was already
    // showing a ready session at `0%` and it was the play that never took.
    // The reliable case above (`the HUD clock ... after the simulation was
    // started`) has always asserted this; these four did not.
    await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    // The count this fixture has carried since it was written and that nothing
    // read until #703's fourth owner ruling: `prisonersHighRisk` crossed the
    // protocol from ADR 0032 onward and `hudCountsFromWorkerMessage` dropped it,
    // so a chip reading 9 here is the whole of that ruling's first half arriving
    // over the real decoder. Deliberately not 37 and not 4: a chip wired to the
    // population or to the intake queue would be plausible and wrong.
    await expect(metric('high-risk')).toHaveText('9');
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
    // The session before the command that needs one -- see `waitForSession` (#470).
    await waitForSession(page);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    // The worker's answer, not the click. `aria-pressed` flips only once the
    // `set-clock` command has come back accepted, so a command that was
    // refused or never reached the worker fails *here*, naming the step.
    // Without it the poll below spends its whole 15s budget and then reports
    // "the simulation never advanced", which describes the symptom and not
    // the cause -- exactly how #425 read on CI, where the clock was already
    // showing a ready session at `0%` and it was the play that never took.
    // The reliable case above (`the HUD clock ... after the simulation was
    // started`) has always asserted this; these four did not.
    await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    // **Visible, not merely present**, and as of 2026-08-31 visible *without a
    // press*. This block read `toBeHidden()`, then `data-collapsed: 'true'`,
    // then a click, then `'false'` -- because the alerts section started folded
    // (`INITIAL_HUD_SHELL_STATE`), so the row was in the DOM with a 0x0 box
    // until the player opened it, which is exactly the state #220 measured and
    // moved the "simulation unavailable" sentence out of.
    //
    // **The owner's ruling 1 of #703 opened it**, and the same change gave the
    // list a bounded box with `overflow-y: auto` so it scrolls rather than
    // letting its `.ui-panel` ancestor clip the newest row. So the row is
    // visible here on arrival. The precaution the old comment names is
    // unchanged and still worth stating: a `toContainText` on a row nobody can
    // see proves nothing, which is why the visibility assertion below is the
    // load-bearing one either way.
    //
    // The fold is still exercised, in the direction it now moves: one press
    // shuts it and the row goes away. That keeps a real toggle in this test
    // rather than deleting the only place it was checked on the assembled page.
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'false');
    await expect(alertRow).toBeVisible();

    await page.locator('.hud-minimap .ui-section__header').click();
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'true');
    await expect(alertRow).toBeHidden();

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
    expect(await objectCommandsSent(page, 'RemoveWall')).toEqual([]);

    await remove.click();
    await expect(remove).toHaveAttribute('aria-pressed', 'true');
    const pressed = await pressOnWorld(page);
    expect(pressed, 'the HUD left no bare world to press at 375x812').toBe(true);

    // **One press, one removal command, and no keyboard anywhere in this test.**
    // `RemoveWall`, not `RemoveObject`, since ADR 0106: a world press with
    // Remove armed always resolves an edge and reaches the object arm from
    // inside that command's own session-command branch.
    const removals = await objectCommandsSent(page, 'RemoveWall');
    expect(removals).toHaveLength(1);
    expect(Number.isInteger(removals[0]?.x)).toBe(true);
    expect(Number.isInteger(removals[0]?.y)).toBe(true);
    // And the armed mode decided which command it was: a press that had gone to
    // the other half of the same tool would have spent materials.
    expect(await objectCommandsSent(page, 'PlaceObject')).toEqual([]);

    // Turning the mode off hands the world back, so a second press posts no
    // second removal. Without this the assertion above is also true of a tool
    // that never stops removing.
    //
    // **These four lines read differently until #689, and the difference is
    // the fix.** They were:
    //
    //     await remove.click();
    //     await expect(remove).toHaveAttribute('aria-pressed', 'false');
    //     await page.locator('.hud-build__arm').click();
    //     await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'false');
    //
    // -- and that press on the arm control was **disarming**, because
    // `armed = removing || armed` left the tool armed on the way out of
    // removal. So the old test needed a second press to hand the world back,
    // and it recorded the defect as the route: a player who pressed *Stop
    // removing* and then pressed a tile was placing, not removing, and had
    // spent materials. Now the toggle itself stands the tool down, the arm
    // control is untouched here, and pressing it would *arm* instead.
    await remove.click();
    await expect(remove).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.hud-build__arm')).toHaveAttribute('aria-pressed', 'false');
    expect(await pressOnWorld(page)).toBe(true);
    expect(await objectCommandsSent(page, 'RemoveWall')).toHaveLength(1);
    // And nothing was placed either, which is the half the old shape could not
    // assert: it had just disarmed a tool that #689 left armed to place.
    expect(await objectCommandsSent(page, 'PlaceObject')).toEqual([]);
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
    // The session before the command that needs one -- see `waitForSession` (#470).
    await waitForSession(page);
    // A running clock: the command is dispatched at a tick, so a paused
    // simulation would leave it queued and refuse nothing.
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    // The worker's answer, not the click. `aria-pressed` flips only once the
    // `set-clock` command has come back accepted, so a command that was
    // refused or never reached the worker fails *here*, naming the step.
    // Without it the poll below spends its whole 15s budget and then reports
    // "the simulation never advanced", which describes the symptom and not
    // the cause -- exactly how #425 read on CI, where the clock was already
    // showing a ready session at `0%` and it was the play that never took.
    // The reliable case above (`the HUD clock ... after the simulation was
    // started`) has always asserted this; these four did not.
    await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    await expect(band).toContainText(localeText('hud.alert.refusal.remove-wall.nothing-to-remove'));
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

    // **No press: the section arrives OPEN as of #703 ruling 1.** This read
    // `.click()` first, under the comment "Opened, because the alerts section
    // arrives folded and a `toContainText` against a 0x0 box proves nothing."
    // The precaution is right and is still enforced by the visibility assertion
    // below; what changed is that it costs nothing.
    //
    // **This is the case that only CI caught, and the reason is worth keeping.**
    // The press survived the first pass of this branch because the flex chain
    // added for the scroll fix was overriding `[hidden]` -- so collapsing the
    // section hid nothing and `toBeVisible` passed *after* the click, by
    // accident. Fixing that with `:not([hidden])` made the press do what it
    // says, and this assertion went red on the clean run. A latent break
    // masked by a second break, and the sequence is the record of it.
    await expect(alertRow).toBeVisible();
    // The sentence the bundled catalogue gives the id the worker sent, read out
    // of that catalogue rather than typed here: ADR 0011 puts the key on one
    // side of the boundary and the text on the other, so a test that hard-coded
    // the English would stay green while the player read something else.
    await expect(alertRow).toContainText(localeText('hud.alert.refusal.remove-wall.nothing-to-remove'));
    // A localized sentence, not the wire vocabulary (ADR 0011).
    await expect(alertRow).not.toContainText('remove-wall.');
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
    // The session before the command that needs one -- see `waitForSession` (#470).
    await waitForSession(page);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    // The worker's answer, not the click. `aria-pressed` flips only once the
    // `set-clock` command has come back accepted, so a command that was
    // refused or never reached the worker fails *here*, naming the step.
    // Without it the poll below spends its whole 15s budget and then reports
    // "the simulation never advanced", which describes the symptom and not
    // the cause -- exactly how #425 read on CI, where the clock was already
    // showing a ready session at `0%` and it was the play that never took.
    // The reliable case above (`the HUD clock ... after the simulation was
    // started`) has always asserted this; these four did not.
    await expect(page.locator('.hud-strip__transport [title="Play at normal speed"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () => page.locator('.hud-clock__day-progress').textContent(), {
        message: 'the simulation never advanced, so no command could be dispatched',
        timeout: 15_000,
      })
      .not.toBe('0%');

    // The region really is gone at this viewport, asserted rather than taken
    // from the stylesheet -- it is the premise of the whole test.
    //
    // **An attempt to remove that breakpoint was made and withdrawn on
    // 2026-08-31 (#703, ruling 5)**: below 720px `.hud__rail` stretches into
    // the corner's grid area, so with the corner laid out the Intake panel's
    // Admit button covered the Alerts fold header, and bringing the corner back
    // whole also covered the centre pixel a player taps to reach the world.
    // `hud.css`'s note on that block carries both measurements. So the premise
    // holds, and now for a measured reason rather than a stylesheet reading.
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
    /*
     * And the surface it replaced, at the same instant and at this viewport.
     *
     * The row is built and is on screen nowhere -- the second half of #220's
     * measurement, at 375x812, the viewport it was found at.
     *
     * **#220's defect had two causes and only one of them is gone.** The fold
     * is (ruling 1: the section starts open, and the list now scrolls rather
     * than letting its panel clip the newest row), so above 720px the row has a
     * real box and `ui-shell.spec.ts` asserts exactly that. The 720px
     * breakpoint is not: ruling 5 asked for it and the attempt was withdrawn on
     * measurement, because below 720px `.hud__rail` stretches into the corner's
     * grid area. So this assertion stands **at this viewport only**, and it is
     * the record that the phone half of #220 is still open.
     */
    expect(measured.alertRowPresent).toBe(true);
    expect(measured.alertRowLaidOut, 'the corner is display:none at 375px, so the row has no box').toBe(false);

    await expect(band).toContainText(localeText('hud.alert.refusal.remove-wall.nothing-to-remove'));
    await expect(band).not.toContainText('remove-wall.');
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
    // Which the control now says before it is pressed, and is still pressed --
    // see `pressBuyExpectingRefusal` for why both halves matter and why the
    // press is forced.
    await pressBuyExpectingRefusal(page);

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
   * alerts list -- using a refused **build order**, which is still the case
   * `a build order the simulation refuses reaches the alerts list (#261)`
   * drives here. What neither proved was that either surface stays quiet
   * while the other speaks, and "exactly one" is a statement about *two*
   * surfaces at once, which only the assembled page has both of.
   *
   * **The first of these used to drive the worker's half with a purchase, and
   * cannot any more.** It pressed twice against a paused clock: both presses
   * passed the pre-flight because a paused clock had dispatched neither, and
   * the treasury refused the second once the clock ran. Since ADR 0051
   * a command
   * submitted while paused carries the tick the session is already on, so the
   * worker dispatches it at once -- the balance moves, the status strip is
   * republished, and the second press meets an accurate pre-flight instead of
   * a stale one.
   *
   * That is a product change and not a test problem, and it is the better
   * behaviour: the player is refused immediately, on the control they pressed,
   * rather than a moment later by an alert about money. Its cost is recorded
   * rather than hidden -- from this panel, `ProcurementSystem`'s
   * `insufficient-funds` is now reachable only inside the twenty-tick lead an
   * order given while the clock *runs* carries, which is a one-second window
   * this suite cannot win reliably (measured: pressing Buy and then Pause took
   * longer than the lead in this container, and the queued order had already
   * been paid for). So the worker's half of the purchase claim is asserted at
   * the layer where it is deterministic -- `tests/unit/worker-state-machine.test.ts`,
   * "a purchase the treasury cannot cover" -- against the shipped worker and a
   * real `ProcurementSystem`, and the *join* it used to prove here
   * (`RefusalLog` -> `simulation/status-counts` -> the band and the alerts
   * list, with no control marked) is proven by the refused build order, which
   * takes exactly the same route with a different reason id.
   */

  /**
   * The pre-flight's other half, and the one the pause used to hide: a second
   * purchase inside one pause, refused before it is sent.
   *
   * Two presses at half the treasury plus one unit, both while the clock is
   * stopped. The first is affordable and is dispatched on the spot, which is
   * the behaviour under test and is asserted directly -- the balance on the
   * status strip moves with the clock at `0%`. The second is then measured
   * against that new balance and refused here, so nothing reaches the worker
   * and the alerts list stays on its empty-state row.
   *
   * The interesting half is that last one: an empty list proves nothing on its
   * own, because it is also what "the worker has not published yet" looks
   * like. It cannot mean that here -- the balance moved, and the readout that
   * carried it is the very message an alert row would have arrived on -- and
   * that is asserted rather than left implied.
   */
  test('a second purchase inside one pause is refused before it is sent, and the list stays empty (#89, #261, #220)', async ({
    page,
  }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A real prison: `submit` throws until a snapshot has baselined the
    // command sequence, and a refused command sends nothing at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    // Paused on arrival, and it stays paused for the whole test -- which is
    // the point: everything below happens with the clock stopped.
    const progress = page.locator('.hud-clock__day-progress');
    await expect(progress).toHaveText('0%');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    // Published once on `simulation/ready`, before any tick runs -- so the
    // pre-flight has a real figure to compare against from the first press.
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    const unitPrice = unitPriceOf('item.brick');
    // **What a prison can spend is no longer what it holds** (#703 ruling A):
    // `createNewSimulationRuntime` opens a standing overdraft, and `canAfford`
    // is `balance - amount >= floor`, so the affordability boundary this test
    // straddles is the balance *plus* the facility. Derived rather than
    // written out, so it moves with either constant.
    //
    // **And the floor a purchase meets is no longer the treasury's** (ruling
    // 19, 2026-09-01): a purchase is a `'deliveries'` spend, refused at that
    // rung's own threshold, which sits 1,250 above the treasury floor. This
    // line read `TREASURY_STARTING_BALANCE_MINOR_UNITS -
    // TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` until then, and the sentence above
    // it is kept because that is still what a *prison* can spend -- it is only
    // no longer what a *delivery* may.
    const spendable =
      TREASURY_STARTING_BALANCE_MINOR_UNITS - rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const quantity = Math.floor(spendable / unitPrice / 2) + 1;
    // The arithmetic this test rests on, asserted rather than left to a
    // reader: one is affordable against what the prison can spend and two are
    // not. **This pair read `TREASURY_STARTING_BALANCE_MINOR_UNITS` until
    // 2026-08-31**, which was the same number while the floor was 0 and is
    // 2,500 short of it now -- the second press became affordable and the
    // refusal this test exists for stopped happening.
    expect(quantity * unitPrice).toBeLessThanOrEqual(spendable);
    expect(2 * quantity * unitPrice).toBeGreaterThan(spendable);

    const alertsSection = page.locator('.hud-minimap .ui-section');
    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    const refusal = page.locator('.hud__refusal');
    await expect(emptyRow).toHaveCount(1);
    await expect(refusal).toBeHidden();

    await openBuyRow(page);
    await setBuyQuantity(page, quantity);
    const buy = page.locator('.hud-build__buy-submit');

    // ---- the first press: accepted, and paid for during the pause ----------
    // Available before it, which is the other direction of the same claim the
    // second press asserts: the verdict on the button is the verdict on the
    // press, so an affordable quantity must not be advised against (#772).
    // One round trip, for the reason `readBuyAvailability` gives.
    expect(await readBuyAvailability(page), 'an affordable press was advised against before it happened').toEqual({
      saysItCannotAct: false,
      pressable: true,
    });
    await buy.click();
    await expect
      .poll(async () => (await purchasesSent(page)).length, {
        message: 'the first press sent no PurchaseMaterials, so there is nothing to measure',
      })
      .toBe(1);
    await expect
      .poll(async () => funds.textContent(), {
        message: 'the purchase given during the pause was never dispatched, so the balance never moved',
        timeout: 20_000,
      })
      .toBe(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice));
    // With the clock still stopped, which is what makes the line above a
    // statement about the paused dispatch rather than about time passing.
    await expect(progress).toHaveText('0%');
    await expect(page.locator('.hud-strip__transport [title="Pause"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(refusal).toBeHidden();
    await expect(page.locator('[data-action-failed="true"]')).toHaveCount(0);

    // ---- the second press: refused here, and nothing leaves this thread ----
    // The balance the poll above waited for is the one this press is measured
    // against, and it is also the one the button was repainted from
    // (`setTreasury` -> `paintBuyTotal`, issue #772), so the control says it
    // cannot act before the press as well as after it. Both are asserted, and
    // the press still happens -- see `pressBuyExpectingRefusal`.
    await pressBuyExpectingRefusal(page);
    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    // **The sentence changed on 2026-08-31 (#703 ruling 18) and the key did
    // with it.** A charge the standing overdraft cannot carry is no longer
    // answered by the generic refusal: `hud.refusal.purchase-materials` is
    // what is left for the refusals that are not about money at all. This read
    // the generic key until that ruling.
    await expect(refusal).toContainText(localeText('hud.refusal.purchase-materials-past-floor'));
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    // On the control that was pressed, as well as in the line.
    await expect(buy).toHaveAttribute('data-action-failed', 'true');
    // The throw happened instead of the submit, not alongside it, so the
    // worker has nothing it *could* report about this press.
    expect(await purchasesSent(page)).toEqual([{ itemId: 'item.brick', quantity }]);
    // And the balance did not move again: nothing was spent twice.
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice));

    // ---- exactly one surface, and the other stays quiet --------------------
    // The alerts list is empty because the channel carried no refusal, not
    // because it has not spoken: it published the new balance a moment ago,
    // on the very message an alert row would have arrived on.
    await expect(alertRow).toHaveCount(0);
    await expect(emptyRow).toHaveCount(1);
    // **No click.** This read `.click()` then `data-collapsed: 'false'`,
    // because the section started folded and the empty row had to be revealed
    // before its visibility could mean anything. The section starts open as of
    // #703 ruling 1, so a click here would *shut* it and the assertion below
    // would be measuring a hidden row.
    await expect(alertsSection).toHaveAttribute('data-collapsed', 'false');
    await expect(emptyRow).toBeVisible();
    // Nothing on the band claims the simulation decided this one.
    await expect(refusal).not.toHaveAttribute('data-source', 'simulation');
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
  /**
   * The one claim about #703 ruling A that only a browser settles: a prison
   * that has spent into its standing overdraft **shows the minus on the strip**.
   *
   * Everything else about the facility is provable headlessly and is proved
   * there -- `Treasury.canAfford`'s comparison, the schema that carries a
   * signed figure across the protocol, `judgeAffordability`'s decision. What
   * no headless test reaches is `Intl.NumberFormat` rendering a negative into
   * the chip on the assembled page, because `vitest.config.ts` is
   * `environment: 'node'` and the chip is built by `status-strip.ts` against a
   * real DOM.
   *
   * **And the second assertion is the ruling's cost written down.** The chip
   * carries no tone and no badge, so the minus is the whole of what a player
   * is told: not that a facility exists, not what it is worth, and not that
   * spending it can strand a prison with no capacity. That sentence is the
   * owner's to author (`AGENTS.md`: a promise to a player is theirs), so this
   * asserts the absence rather than inventing the presence -- and it will go
   * red the day somebody adds a tone without a decision behind it.
   */
  test('spends into the standing overdraft and shows the minus, with nothing else said (#703)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    // The largest whole purchase a delivery may make, derived so it moves with
    // the constants.
    //
    // **This read `TREASURY_STARTING_BALANCE_MINOR_UNITS -
    // TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` until ruling 19 of 2026-09-01**,
    // and the comment under it read *"27,500 of spending power at 40 a brick
    // is 687 bricks and 27,480, which lands the balance at -2,480."* That was
    // true while one floor governed every spend. It does not any more: a
    // purchase is a `'deliveries'` spend and is refused 1,250 above the
    // treasury's floor, so the old figure buys nothing at all and this test
    // measured the ruling working rather than the strip failing.
    //
    // **And this line read `rungFloorMinorUnits('deliveries',
    // TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS)` -- the mature -1,250 rung --
    // until the owner's starter-rung ruling of 2026-09-01, with `spendable` at
    // 26,250, `quantity` at 656 bricks, `settled` at -1,240 and the badge
    // reading "10 left".** This session never zones a room (`New prison`
    // alone, no build order), so `RoomInstanceRegistry.totalResidentCapacity`
    // stays `0` for the test's whole life and every purchase here is judged at
    // the *starter* rung, -1,185, not the mature one -- passing `true` as the
    // third argument is what selects it. The old quantity no longer clears:
    // 656 bricks is 26,240, which is 55 past the shallower starter floor's
    // 26,185 of room, so the press this test used to make would now be
    // refused outright rather than landing in the overdraft this test is
    // about.
    const unitPrice = unitPriceOf('item.brick');
    const spendable =
      TREASURY_STARTING_BALANCE_MINOR_UNITS -
      rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true);
    const quantity = Math.floor(spendable / unitPrice);
    const settled = TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice;
    // The state this test is about, asserted rather than assumed: the purchase
    // is affordable and the balance it leaves is below zero.
    expect(quantity * unitPrice).toBeLessThanOrEqual(spendable);
    expect(settled).toBeLessThan(0);

    await openBuyRow(page);
    await setBuyQuantity(page, quantity);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await page.locator('.hud-build__buy-submit').click();

    // Polled on the figure itself rather than on a wall clock: the balance
    // arrives on `simulation/status-counts` whenever the worker next publishes.
    await expect
      .poll(async () => funds.textContent(), { timeout: 20_000 })
      .toBe(fundsText(settled));

    /*
     * **This asserted the ABSENCE of a tone and a badge, and it fired exactly
     * as it was written to.** Its own note read: *"the minus is the whole of
     * what a player is told ... it will go red the day somebody adds a tone
     * without a decision behind it."* There is a decision behind it now --
     * #703 ruling 18, on 2026-08-31 -- so the absence becomes a presence and
     * the sentence above is kept as the record of what it used to pin.
     *
     * `-2,480` of 2,500 leaves 20, which is `warning` and not `danger`: room
     * left, however little. The badge states the remainder in words, so colour
     * is never the only signal.
     */
    await expect(page.locator('[data-metric="funds"]')).toHaveAttribute('data-tone', 'warning');
    /*
     * **The badge counted room to the TREASURY floor and now counts room to the
     * `'deliveries'` rung, which is the decision this pin existed to catch.**
     *
     * It read: *"Both are deliberate and they disagree: ruling 18 authored
     * `{remaining} left` against the one floor that existed then, and ruling 19
     * then gave each rung its own. So the chip tells a player how far the state
     * will carry them while the next press is refused well before that -- which
     * the ADR 0017 amendment names as owed to the owner rather than fixed here
     * ... Asserted against the treasury floor on purpose: this is the pin that
     * goes red the day somebody changes which floor the badge counts to, and it
     * should, because that is the decision."*
     *
     * The owner took the decision on 2026-09-01 and the pin went red, exactly
     * as written. It is re-aimed at the same rung `spendable` above is composed
     * from, so the chip and the press this test just made are now one number:
     * the purchase spent down to ten short of the rung, and the badge says ten.
     *
     * **That was ten short of the *mature* rung, and the owner's starter-rung
     * ruling later that day moved both halves of the pair together.** This
     * session is fresh and unfurnished for its whole life (see `spendable`
     * above), so the rung the badge counts room to is the starter one,
     * -1,185: the purchase now settles at -1,160, which is twenty-five short
     * of that floor rather than ten short of the mature one, and the badge
     * says twenty-five. The pin is re-aimed at the same starter rung
     * `spendable` is composed from, so the chip and the press this test just
     * made stay one number.
     */
    await expect(page.locator('[data-metric="funds"] .ui-badge')).toHaveText(
      `${fundsText(settled - rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true))} left`,
    );
    await expect(page.locator('.hud__refusal')).toBeHidden();
  });

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
    // Past what a purchase may spend, which is the balance plus the delivery
    // rung's own room (ruling 19) rather than the whole standing overdraft --
    // see the `spendable` note in the first test that derives it. This line
    // named the treasury floor until 2026-09-01; the quantity it produced was
    // refused then and is refused now, by a threshold 1,250 higher.
    const spendable =
      TREASURY_STARTING_BALANCE_MINOR_UNITS - rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS);
    const unaffordable = Math.floor(spendable / unitPrice) + 1;
    expect(unaffordable * unitPrice).toBeGreaterThan(spendable);

    const alertsSection = page.locator('.hud-minimap .ui-section');
    const emptyRow = page.locator('.hud-alerts__list [data-alert="empty"]');
    const alertRow = page.locator('.hud-alerts__list [data-alert]:not([data-alert="empty"])');
    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeHidden();
    await expect(emptyRow).toHaveCount(1);

    await openBuyRow(page);
    await setBuyQuantity(page, unaffordable);
    const buy = page.locator('.hud-build__buy-submit');
    await pressBuyExpectingRefusal(page);

    await expect(refusal).toBeVisible();
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    // **The sentence changed on 2026-08-31 (#703 ruling 18) and the key did
    // with it.** A charge the standing overdraft cannot carry is no longer
    // answered by the generic refusal: `hud.refusal.purchase-materials` is
    // what is left for the refusals that are not about money at all. This read
    // the generic key until that ruling.
    await expect(refusal).toContainText(localeText('hud.refusal.purchase-materials-past-floor'));
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    // On the control that was pressed, as well as in the line -- which is the
    // half of this surface the alerts row structurally cannot have.
    await expect(buy).toHaveAttribute('data-action-failed', 'true');
    const refusalId = await refusal.getAttribute('id');
    expect(refusalId).not.toBeNull();
    /*
     * **`aria-describedby` is a token LIST, and this asserted equality until
     * the owner's ruling of 2026-09-03 put the shortfall on the control.**
     * It read `toHaveAttribute('aria-describedby', String(refusalId))` and
     * went red with `Received: "hud-build-buy-shortfall-6 hud-refusal-1"`.
     * That failure was the assertion's, not the interface's: a refused Buy
     * now has two things to say -- how much is missing, and that nothing was
     * bought -- and a control that references only one of them would be
     * withholding the other from a screen reader. Equality on a
     * space-separated list is a claim that no second description may ever
     * exist, which is not a property this surface should have.
     *
     * Both tokens are now asserted **by name and independently**, so this is
     * strictly stronger than the equality it replaces: it still fails if the
     * refusal stops being referenced, and it now also fails if the shortfall
     * line stops being. Order is deliberately not asserted; see below.
     */
    const describedBy = (await buy.getAttribute('aria-describedby')) ?? '';
    const describedTokens = describedBy.split(/\s+/u).filter((token) => token.length > 0);
    expect(describedTokens).toContain(String(refusalId));
    const shortfall = page.locator('.hud-build__buy-shortfall');
    await expect(shortfall).toHaveCount(1);
    const shortfallId = await shortfall.getAttribute('id');
    expect(shortfallId).not.toBeNull();
    expect(describedTokens).toContain(String(shortfallId));
    // Exactly these two, so a third description cannot be added unnoticed.
    expect(describedTokens).toHaveLength(2);

    // Nothing left this thread, so the worker has nothing it *could* report
    // about this press: the throw happened instead of the submit, not
    // alongside it.
    expect(await purchasesSent(page)).toEqual([]);

    // **And the alerts list is untouched**, which is the half nothing
    // asserted. A row here would be the same refusal said twice, in two
    // places, for one press of one button.
    await expect(alertRow).toHaveCount(0);
    await expect(emptyRow).toHaveCount(1);
    // No click, for the reason given at the sibling assertion above: the
    // section starts open as of #703 ruling 1, so a press would shut it.
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
    // **And the advice recovers**, on the assembled page rather than only in
    // the harness (`tests/browser/ui-buy-button-affordability.spec.ts` drives
    // the same recovery against a pushed view model). One brick is affordable
    // at this balance, so the control that was advising against a press a
    // moment ago stops -- which is what makes the state above a statement
    // about *this quantity at this balance* and not a button that latched.
    expect(
      await readBuyAvailability(page),
      'the Buy button went on advising against a press it would accept',
    ).toEqual({ saysItCannotAct: false, pressable: true });
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
   * **The one press that is refused only because the prison is fresh and
   * unfurnished — the starter rung, measured at its own boundary (#1257).**
   *
   * ## What was not covered, and how that was established
   *
   * `src/main.ts` judges a purchase against
   * `pressFloorMinorUnits(TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
   * freshUnfurnishedPrison(counts))`, and that third argument is the whole of
   * the owner's starter-rung ruling of 2026-09-01 on this thread: a fresh,
   * unfurnished prison's press meets **-1,185** where a furnished one meets
   * **-1,250**. Before this test the argument could be replaced with a literal
   * `false` at both call sites in `src/main.ts` and the entire suite stayed
   * green — so the rung existed in the tree and nothing measured it where it
   * decides anything.
   *
   * Neither of the two places that look like they cover it does.
   * `ui-buy-button-affordability.spec.ts` and
   * `ui-hire-button-affordability.spec.ts` mount `ui-harness.html` and push a
   * view model through `setHudViewModel`, so `src/main.ts` is never loaded by
   * them at all; and no unit test can take it, because `vitest.config.ts` is
   * `environment: 'node'` and `src/main.ts` touches `document` — which is the
   * stated reason `src/ui/affordability.ts` exists as a separate module.
   * The three sibling tests here that *do* drive real presses through this
   * pre-flight work nowhere near either rung: a charge of 13,160 against a
   * balance of 11,840, and one of 26,280 against 25,000 -- 1,320 and 30 past
   * the *mature* floor respectively, and the second one is the closest any of
   * them comes. Every one of them is therefore refused, or accepted, by both
   * rungs alike.
   *
   * ## Why 655 bricks, and why one brick fewer
   *
   * The two rungs are 65 minor units apart — one plank, which is
   * `STARTER_RUNG_MARGIN_MINOR_UNITS`'s own derivation — so a press is
   * mutation-sensitive only if its total lands **inside that gap**. At 40 a
   * brick, 655 bricks is 26,200 against 26,185 of starter room and 26,250 of
   * mature room: the starter rung refuses it by 15 and the mature rung would
   * accept it by 50. Both bounds are asserted below rather than left to the
   * reader, so a later move of either constant that closes the gap fails on
   * the arithmetic instead of quietly returning this test to the
   * insensitivity it was written to end.
   *
   * 654 bricks is then pressed and **accepted**, which is what makes the
   * refusal above a statement about the boundary rather than about a control
   * that had latched: one brick either side of one threshold, in one session,
   * with nothing else changed.
   *
   * ## "Fresh, unfurnished" is the worker's answer, not a re-derived one
   *
   * This session presses `New prison` and zones nothing, so
   * `RoomInstanceRegistry.totalResidentCapacity` is `0` for its whole life and
   * `projectStatusStrip` publishes `isFreshUnfurnishedPrison: true` — which
   * `freshUnfurnishedPrison` reads straight through. That is asserted from the
   * page rather than assumed: the FUNDS badge counts room to the same rung
   * (`overdraftRemaining`, `src/ui/hud/projection.ts`), so after the accepted
   * press it reads `25 left` — the distance from -1,160 to **-1,185**, and a
   * figure the mature rung cannot produce.
   */
  test('a fresh, unfurnished prison is refused one brick past the starter rung that a furnished one would be sold (#771, #1257)', async ({
    page,
  }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A real prison, and no room is ever zoned in it: that is what keeps
    // `totalResidentCapacity` at 0 and the published predicate `true`.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    const unitPrice = unitPriceOf('item.brick');
    // The two rungs, composed from the same function the host and the worker
    // both compose theirs from, so this moves with the constants rather than
    // restating them.
    const starterSpendable =
      TREASURY_STARTING_BALANCE_MINOR_UNITS -
      rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true);
    const matureSpendable =
      TREASURY_STARTING_BALANCE_MINOR_UNITS -
      rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, false);
    // The starter rung is the *shallower* one, so being fresh makes the host
    // stricter and not more generous. Stated as an assertion because the
    // direction is the thing a reader gets wrong.
    expect(starterSpendable).toBeLessThan(matureSpendable);

    const refusedQuantity = Math.floor(starterSpendable / unitPrice) + 1;
    const acceptedQuantity = refusedQuantity - 1;
    // **The arithmetic this test is made of.** The refused press must sit
    // strictly inside the 65-minor-unit gap between the rungs -- past the
    // starter one and within the mature one -- or it is another press that
    // both rungs answer the same way, which is the gap this test exists to
    // close.
    expect(refusedQuantity * unitPrice).toBeGreaterThan(starterSpendable);
    expect(refusedQuantity * unitPrice).toBeLessThanOrEqual(matureSpendable);
    expect(acceptedQuantity * unitPrice).toBeLessThanOrEqual(starterSpendable);

    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeHidden();

    await openBuyRow(page);
    const buy = page.locator('.hud-build__buy-submit');

    // ---- one brick past the starter rung: refused, and never sent ----------
    await setBuyQuantity(page, refusedQuantity);
    // `hud.build.buy-submit` interpolates the count raw and formats only the
    // total -- the same shape the sibling tests above assert literally.
    await expect(buy).toHaveText(`Buy ${refusedQuantity} × Brick · ${fundsText(refusedQuantity * unitPrice)}`);
    await pressBuyExpectingRefusal(page);

    await expect(refusal).toBeVisible();
    // **This thread refused it, and the assertion is written as the negative
    // because that is the shape the failure takes.** With the freshness
    // argument replaced by `false` the pre-flight accepts 26,200, the command
    // is sent, and the worker -- which reads `totalResidentCapacity === 0`
    // itself and is therefore never fooled -- refuses it and paints its own
    // line here with `data-source="simulation"`. A refusal on the band is
    // then still visible, which is exactly why "visible" is not the claim.
    await expect(refusal).not.toHaveAttribute('data-source', 'simulation');
    await expect(refusal).toHaveAttribute('data-action', 'purchase-materials');
    await expect(refusal).toContainText(localeText('hud.refusal.purchase-materials-past-floor'));
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    await expect(buy).toHaveAttribute('data-action-failed', 'true');
    // **The load-bearing assertion.** The pre-flight threw instead of
    // submitting, so nothing left this thread -- which is exactly what stops
    // being true if the freshness argument is replaced with `false`: the
    // mature rung accepts 26,200 and this press becomes a command.
    expect(await purchasesSent(page)).toEqual([]);
    // And no money moved on the strip either.
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    // ---- one brick fewer: accepted, spent, and the rung is on the badge ----
    const settled = TREASURY_STARTING_BALANCE_MINOR_UNITS - acceptedQuantity * unitPrice;
    expect(settled).toBeLessThan(0);
    await setBuyQuantity(page, acceptedQuantity);
    expect(
      await readBuyAvailability(page),
      'the Buy button went on advising against a press the starter rung accepts',
    ).toEqual({ saysItCannotAct: false, pressable: true });
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await buy.click();

    await expect
      .poll(async () => funds.textContent(), {
        message: 'the affordable press was never dispatched, so the balance never moved',
        timeout: 20_000,
      })
      .toBe(fundsText(settled));
    expect(await purchasesSent(page)).toEqual([{ itemId: 'item.brick', quantity: acceptedQuantity }]);

    // The badge counts room to the rung the press was judged against, so this
    // is the worker's own `isFreshUnfurnishedPrison` read back off the page:
    // 25 to the starter floor, where the mature one would say 90.
    await expect(page.locator('[data-metric="funds"] .ui-badge')).toHaveText(
      `${fundsText(settled - rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true))} left`,
    );
  });

  /**
   * **The same boundary on the other call site: a hire (#771, #1257).**
   *
   * `src/main.ts` has two pre-flights that read the starter rung, and the test
   * above only presses one of them. This presses the other, and it is not a
   * copy — a hire has no quantity field, so the boundary cannot be dialled in
   * on the control. The prison is walked to the balance instead: 654 bricks
   * settles it at **-1,160**, twenty-five short of the starter rung, and the
   * cheapest role in `src/content/staff-role-catalog.ts` charges **60** — one
   * day of `wageBand.minPerDay`, which is what `staffHireCostMinorUnits`
   * returns. -1,220 is past -1,185 and inside -1,250, so the starter rung
   * refuses the hire and the mature rung would sell it.
   *
   * Both bounds are asserted from the constants rather than written out, and
   * the role is chosen by price rather than by name for the same reason: a
   * later change to the catalogue that moves the cheapest hire out of the
   * 65-unit gap fails here on the arithmetic instead of turning this back into
   * a press both rungs answer alike.
   *
   * **The clock is stopped again before the hire.** ADR 0051 dispatches a
   * command given against a paused clock at once, so the purchase still
   * settles — and a running clock past that point is a second thing that could
   * move the balance the hire is judged against.
   */
  test('a fresh, unfurnished prison is refused a hire the starter rung cannot carry and a furnished one could (#771, #1257)', async ({
    page,
  }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // No room is zoned here either, so `totalResidentCapacity` is 0 and the
    // published `isFreshUnfurnishedPrison` is `true` for the whole test.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    const starterFloor = rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, true);
    const matureFloor = rungFloorMinorUnits('deliveries', TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, false);
    const unitPrice = unitPriceOf('item.brick');
    // The largest purchase the starter rung allows, which is also the balance
    // that puts the cheapest hire inside the gap between the two rungs.
    const quantity = Math.floor((TREASURY_STARTING_BALANCE_MINOR_UNITS - starterFloor) / unitPrice);
    const settled = TREASURY_STARTING_BALANCE_MINOR_UNITS - quantity * unitPrice;

    /*
     * **The role is `staff-role.guard` because it is the only one the HUD can
     * hire**, not because it is the cheapest in the catalogue: `src/main.ts`
     * projects `HIREABLE_STAFF_ROLE_IDS`, one entry long, into the view model
     * the Staff panel lists. The catalogue declares eight roles and seven of
     * them have no control on the page, so choosing by price would pick
     * `staff-role.kitchen-staff` and press a row that does not exist --
     * measured, and the reason this comment is here.
     *
     * The charge is still read rather than written down:
     * `staffHireCostMinorUnits` is one day of `wageBand.minPerDay`, which is
     * 80 for this role.
     */
    const staffRoleId = 'staff-role.guard';
    const hireCharge = staffHireCostMinorUnits(staffRoleId);
    expect(hireCharge, `${staffRoleId} is not in the staff catalogue, so no hire can be driven`).toBeDefined();
    // **The arithmetic this test is made of**: the hire must land past the
    // starter rung and within the mature one, or it is a press both rungs
    // answer the same way.
    expect(settled - hireCharge!).toBeLessThan(starterFloor);
    expect(settled - hireCharge!).toBeGreaterThanOrEqual(matureFloor);

    // ---- walk the prison to -1,160 ----------------------------------------
    await openBuyRow(page);
    await setBuyQuantity(page, quantity);
    await page.locator('.hud-strip__transport [title="Play at normal speed"]').click();
    await page.locator('.hud-build__buy-submit').click();
    await expect
      .poll(async () => funds.textContent(), {
        message: 'the purchase that walks the balance to the rung was never dispatched',
        timeout: 20_000,
      })
      .toBe(fundsText(settled));
    // Stopped again, so nothing else can move the balance under the hire.
    await page.locator('.hud-strip__transport [title="Pause"]').click();
    await expect(page.locator('.hud-strip__transport [title="Pause"]')).toHaveAttribute('aria-pressed', 'true');

    // ---- the hire: refused here, and never sent ---------------------------
    await page.locator('.ui-tab[data-tab="manage"]').click();
    const staffMetric = page.locator('[data-metric="staff"] .ui-stat__value');
    await expect(staffMetric).toHaveText('0');
    // The panel preselects `model.roles[0]`, and this is the one role in it --
    // so the click is a no-op on the selection and an assertion that the row
    // the hire below charges for is the row on the page.
    await expect(page.locator(`[data-staff-role="${staffRoleId}"]`)).toHaveCount(1);
    await page.locator(`[data-staff-role="${staffRoleId}"]`).click();

    const hire = page.locator('.hud-staff__hire');
    // The same pair `pressBuyExpectingRefusal` asserts of the Buy button, and
    // for the same reason (#772, #799): the control has to say it cannot act
    // and still be pressable, or the sentence that explains the limit is
    // unreachable.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const button = document.querySelector<HTMLButtonElement>('.hud-staff__hire');
            return {
              saysItCannotAct: button?.getAttribute('aria-disabled') === 'true',
              pressable: button !== null && !button.disabled,
            };
          }),
        {
          message:
            'before a hire the starter rung refuses, the Hire control must say it cannot act and must still be pressable',
        },
      )
      .toEqual({ saysItCannotAct: true, pressable: true });
    await hire.click({ force: true });

    const refusal = page.locator('.hud__refusal');
    await expect(refusal).toBeVisible();
    // This thread refused it. Under the mutation the pre-flight accepts the
    // hire, the command is sent, and the worker -- which is never fooled --
    // refuses it and paints its own line with `data-source="simulation"`.
    await expect(refusal).not.toHaveAttribute('data-source', 'simulation');
    await expect(refusal).toHaveAttribute('data-action', 'hire-staff');
    await expect(refusal).toContainText(localeText('hud.refusal.hire-staff-past-floor'));
    // The thrown English never reaches the screen (ADR 0011).
    await expect(refusal).not.toContainText('cannot cover');
    await expect(hire).toHaveAttribute('data-action-failed', 'true');
    // Nothing left this thread, and nobody reached the payroll.
    expect(await hiresSent(page)).toEqual([]);
    await expect(staffMetric).toHaveText('0');
    await expect(funds).toHaveText(fundsText(settled));
  });

  /*
   * Issue #548, performed as a hand performs it: type, then press, with
   * nothing in between.
   *
   * **What the player did and what it cost.** Build tab, Buy, triple-click the
   * quantity, type `33`, click Buy. No Tab and no Enter. The control read
   * `Buy 2 x Brick - 80` at the instant it was pressed and took 1,320, and
   * only *then* repainted itself to say `Buy 33 x Brick - 1,320`. The label was
   * correct about every purchase except the one it was on screen for.
   *
   * **Why no other suite can hold this.** `NumberField` used to report on
   * `change` alone, and a browser fires `change` when a field is *left* -- so
   * the click on Buy was itself the blur. The report and the activation
   * therefore arrived in one event turn, in that order, and the ordering *is*
   * the defect. Nothing but a real pointer on a real focused field produces
   * that ordering: `vitest.config.ts` runs `environment: 'node'` with no jsdom,
   * `field.fill()` in the harness dispatches its own events without a focus to
   * lose, and every existing buy test here presses Enter first, which settles
   * the entry and hides the whole thing.
   *
   * **The assertion is a comparison of two independently produced numbers**,
   * not a fixture agreeing with itself. The count comes out of the label
   * `paintBuyTotal` wrote; the quantity comes out of the `PurchaseMaterials`
   * that `buySubmit`'s activation posted from a different closure. Before the
   * fix they are 2 and 33. The literal strings below are here as well so that a
   * future change which makes both wrong in the same direction is still caught.
   */
  test('the Buy control charges the quantity its label was showing when it was pressed (#548)', async ({ page }) => {
    await installCommandTee(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);

    // A real prison: `submit` throws until a snapshot has baselined the
    // command sequence, so a purchase before this sends nothing at all.
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    const funds = page.locator('[data-metric="funds"] .ui-stat__value');
    await expect(funds).toHaveText(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS));

    await openBuyRow(page);
    const field = page.locator('.hud-build__buy .ui-number__input');
    const buy = page.locator('.hud-build__buy-submit');

    // The arithmetic this test rests on, read out of the catalog the page
    // itself prices against rather than asserted twice from the same literal.
    const unitPrice = unitPriceOf('item.brick');
    const typed = 33;
    expect(2 * unitPrice).toBe(80);
    expect(typed * unitPrice).toBe(1_320);
    expect(typed * unitPrice).toBeLessThan(TREASURY_STARTING_BALANCE_MINOR_UNITS);

    // The arrival state: one wall's worth of brick, which is where the defect
    // report starts.
    await expect(buy).toHaveText(`Buy 2 × Brick · ${fundsText(2 * unitPrice)}`);

    // ---- the gesture -------------------------------------------------------
    // Triple-click selects what is in the box and the keystrokes replace it.
    // `keyboard.type` and not `fill`: `fill` sets the value and dispatches its
    // own events, which is not the same thing as a field that has focus and
    // has not lost it yet.
    await field.click({ clickCount: 3 });
    await page.keyboard.type(String(typed));
    await expect(field).toHaveValue(String(typed));
    // Still the field's, so no `change` has fired and none can have.
    await expect(field).toBeFocused();

    /*
     * Read once and without retrying. "What the label said" is a fact about
     * this instant, and `toHaveText` would poll until a later repaint agreed
     * with it -- which is exactly the repaint the defect performs after taking
     * the money.
     */
    const shown = await buy.textContent();
    expect(shown, 'the Buy control did not repaint for a quantity the player had already typed').toBe(
      `Buy ${typed} × Brick · ${fundsText(typed * unitPrice)}`,
    );
    const shownCount = Number.parseInt(/Buy (\d+) /.exec(shown ?? '')?.[1] ?? '', 10);
    expect(shownCount, 'the label carried no count to compare the charge against').toBe(typed);

    // ---- the press ---------------------------------------------------------
    await buy.click();
    await expect
      .poll(async () => (await purchasesSent(page)).length, {
        message: 'pressing Buy sent no PurchaseMaterials command at all',
      })
      .toBe(1);
    await expect(page.locator('.hud__refusal')).toBeHidden();

    // The number the player read, against the number they were charged.
    expect(await purchasesSent(page)).toEqual([{ itemId: 'item.brick', quantity: shownCount }]);

    // And in money, which is the form the defect was reported in: 25,000 down
    // to 23,680, not to 24,920.
    await expect
      .poll(async () => funds.textContent(), {
        message: 'the purchase never reached the treasury, so what it charged cannot be read off the strip',
        timeout: 20_000,
      })
      .toBe(fundsText(TREASURY_STARTING_BALANCE_MINOR_UNITS - shownCount * unitPrice));
  });

  /**
   * Issue #531, against the projection the application actually builds.
   *
   * `tests/foundation/composition-root-contract.test.ts` pins
   * `occupiesEdge: occupiesTileEdge(definition)` by substring, and is explicit
   * that a substring proves a wiring is *written* and not that it works. This
   * is the half it names: the real `BUILDABLE_REGISTRY`, the real
   * `buildCatalogue()`, the real panel, and a control the player can see.
   *
   * `tests/browser/ui-shell.spec.ts` asserts the same thing against a fixture,
   * which is a different claim -- that fixture says what `src/main.ts` *should*
   * publish, and only this test can say what it *does*. That distinction is the
   * whole reason the defect survived: the harness fixture carried
   * `occupiesEdge: false` for this row and agreed with the composition root
   * while both were wrong.
   *
   * **This file has no fixture and never had one**, which is the point of it.
   * `occupiesEdge` appears in this spec only inside this sentence and the one
   * above; the row shapes come from `src/main.ts` at boot. The two browser
   * specs are therefore not interchangeable, and a reader deciding where to add
   * the next assertion about a catalogue row wants that distinction: pin what
   * the *panel* does with a shape in `ui-shell.spec.ts`, and what the
   * *application* claims the shape is here.
   *
   * A wall first, deliberately. The panel retains one edge across selections,
   * so choosing *West* on a wall and then selecting the door is exactly the
   * sequence that used to submit a west door with nothing on screen saying so.
   * Here the chooser stays up and keeps the choice, which is what makes the
   * edge the player's rather than the last row's.
   */
  test('the Build catalogue offers a door its edge chooser, from the real registry (#531)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'New prison' }).click();
    await expect(page.locator('.hud-clock__day')).toHaveText('1');

    await page.getByRole('button', { name: 'Build' }).click();
    const coordinates = page.locator('.hud-build__coordinates');
    await coordinates.locator('> .ui-section__header').click();
    await expect(coordinates).toHaveAttribute('data-collapsed', 'false');

    // The wall first, where the chooser is undisputed -- so a hidden chooser
    // below is a fact about the door row rather than about the whole panel.
    const chooser = page.locator('.hud-build .ui-choice');
    await page.locator('.hud-build__list [data-buildable="wall-brick"]').click();
    await expect(
      page.locator('.hud-build__list [data-buildable="wall-brick"][data-selected="true"]'),
      'the wall row did not become the selection',
    ).toHaveCount(1);
    await expect(chooser).toBeVisible();

    // The retained edge the defect leaked. Chosen on the wall, where the
    // control is undisputed.
    await chooser.locator('[data-choice="west"]').click();

    // And the row this issue is about. A door is edge geometry -- it writes
    // `DOOR_EDGE_NUMERIC_ID` onto a tile edge -- so the chooser must survive
    // the selection rather than take the setting off screen while the panel
    // goes on submitting it.
    await page.locator('.hud-build__list [data-buildable="door-wooden"]').click();
    await expect(
      page.locator('.hud-build__list [data-buildable="door-wooden"][data-selected="true"]'),
      'the door row did not become the selection, so the chooser below is about something else',
    ).toHaveCount(1);
    await expect(chooser).toBeVisible();
    await expect(chooser.locator('[data-choice="west"]')).toHaveAttribute('aria-checked', 'true');
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
    // no interaction can put the sentence on screen here through the alerts
    // list: with the whole region `display: none`, opening the Alerts section
    // inside it still leaves its rows unlaid-out (#220 measured exactly that,
    // at this viewport). This row survives the breakpoint.
    //
    // **The Alerts section itself starts OPEN as of #703 ruling 1**, which is
    // why the sentence above about "opening" is now about a fold nobody has to
    // open -- and it changes nothing here, because the region containing it is
    // still not laid out at this width. #703 ruling 5 asked for that to change
    // and the attempt was withdrawn on measurement; `hud.css` holds why.
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

  /**
   * Undo and Redo have a pointer and touch route, on a phone, and a refused
   * press says so on the button that was pressed (#1356).
   *
   * Until #1356 the pair was `KeyZ` and `KeyY` and nothing else, so a touch
   * player could take back nothing. The route this proves is the whole chain
   * on the assembled page -- the strip's button, `mountHud`'s gate, and
   * `src/main.ts`'s `case 'undo'`, whose `requireSimulation(commands).submit`
   * throws while no prison is open -- at 375x812, the narrowest viewport the
   * sweep visits and the one where `.hud__corner` does not exist.
   *
   * With no session the host refuses, which is the one refusal this page can
   * reach without a gesture to take back; it is the same path a refused
   * transport press takes in the test above, and the marking is asserted the
   * same way: the pressed button, and only it.
   */
  test('Undo and Redo can be pressed on a phone, and a refusal is marked on the button pressed (#1356)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openApp(page);

    const history = page.locator('.hud-strip__history');
    const undo = history.getByRole('button', { name: localeText('hud.history.undo-last-change') });
    const redo = history.getByRole('button', { name: localeText('hud.history.redo-last-undone') });
    await expect(undo).toBeVisible();
    await expect(redo).toBeVisible();

    // Inside the window and not covered: `elementFromPoint` at the centre is
    // the button or its glyph, which is the #88 property for these two alone.
    for (const button of [undo, redo]) {
      const hit = await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
          inside: box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight,
          hitsItself: top !== null && element.contains(top),
        };
      });
      expect(hit).toEqual({ inside: true, hitsItself: true });
    }

    const refusal = page.locator('.hud__refusal');
    await undo.click();
    await expect(refusal).toBeVisible();
    await expect(refusal).toContainText(localeText('hud.refusal.undo'));
    await expect(refusal).toHaveAttribute('data-action', 'undo');
    await expect(undo).toHaveAttribute('data-action-failed', 'true');
    expect(await page.locator('.hud-strip [data-action-failed="true"]').count()).toBe(1);

    await redo.click();
    await expect(refusal).toContainText(localeText('hud.refusal.redo'));
    await expect(refusal).toHaveAttribute('data-action', 'redo');
    await expect(redo).toHaveAttribute('data-action-failed', 'true');
  });

  /**
   * Undo and Redo say whether a press would do anything, and what they say is
   * the worker's own history (#1370).
   *
   * The whole chain, joined: `ConstructionSystem`'s stacks, the handler's
   * `editHistoryAvailability`, `simulation/status-counts`'s `editHistory`,
   * `src/main.ts`'s listener, and the strip's `aria-disabled`. Every half has
   * its own headless test; only this proves they are connected. With the clock
   * paused throughout, so each answer is the forced publication behind the
   * command (ADR 0051) rather than time passing.
   */
  test('Undo and Redo are marked unavailable exactly while the prison has nothing for them to do (#1370)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    const history = page.locator('.hud-strip__history');
    const undo = history.getByRole('button', { name: localeText('hud.history.undo-last-change') });
    const redo = history.getByRole('button', { name: localeText('hud.history.redo-last-undone') });

    // No prison yet: the strip has no answer and paints none -- the press is
    // answered by the host's own refusal, which the #1356 test above covers.
    await expect(undo).not.toHaveAttribute('aria-disabled', /.*/);
    await expect(redo).not.toHaveAttribute('aria-disabled', /.*/);

    await page.getByRole('button', { name: 'New prison' }).click();
    await waitForSession(page);
    // A new prison has placed nothing.
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');

    await page.getByRole('button', { name: 'Build' }).click();
    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
    await page.getByRole('spinbutton', { name: 'Tile X' }).fill('5');
    await page.getByRole('spinbutton', { name: 'Tile Y' }).fill('5');
    await page.locator('.hud-build__coordinates .ui-action').click();
    await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', '1', { timeout: 15_000 });
    await expect(undo).toHaveAttribute('aria-disabled', 'false');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');

    await undo.click();
    await expect(undo).toHaveAttribute('aria-disabled', 'true');
    await expect(redo).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('.hud-build')).not.toHaveAttribute('data-queued', /.*/);

    await redo.click();
    await expect(undo).toHaveAttribute('aria-disabled', 'false');
    await expect(redo).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.hud-build')).toHaveAttribute('data-queued', '1');
    expect(await page.locator('.hud-strip [data-action-failed="true"]').count(), 'no press here was refused').toBe(0);
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
        // Whether it overlaps the metrics. Two independently positioned layers
        // competing for one corner is the #88 defect, and the reason this
        // badge is in the strip's own flex row rather than `fixed`.
        //
        // **This was `rect.right > metrics.left` and that stopped being the
        // question in #634.** A horizontal comparison is a valid overlap test
        // only while the two are guaranteed to share a line, which they were
        // for as long as the strip was one row. Once the metrics take a row of
        // their own the badge's right edge is *of course* past the metrics'
        // left edge -- they both start at the strip's padding -- and the test
        // failed while nothing was drawn over anything. A rectangle
        // intersection asks what the comment above always meant, holds in
        // either layout, and is the assertion that would still catch a badge
        // that went back to `position: fixed`.
        overlapsMetrics:
          metrics === undefined
            ? null
            : rect.right > metrics.left &&
              metrics.right > rect.left &&
              rect.bottom > metrics.top &&
              metrics.bottom > rect.top,
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
    await expect(page.locator('#game-root canvas')).toHaveCount(1);
    await expect(page.locator('.hud')).toHaveCount(1);
    expect(await page.locator('.hud-tabs__inner .ui-tab').count()).toBeGreaterThan(0);

    // And the page is genuinely assembled rather than merely non-empty.
    await expect(page.locator('.hud-strip')).toBeVisible();

    // Settings fell back to defaults rather than failing boot, which is what
    // `docs/INPUT.md` has always claimed happens. The camera keys are part of
    // the default bindings, so a working camera is the observable form of that
    // claim -- and it is the half a try/catch around `JSON.parse` alone would
    // not deliver, since it never reaches the parse.
    await expect(page.locator('#game-root canvas')).toBeVisible();
  });

  /**
   * The interface scale, end to end (issue #545).
   *
   * `uiScale` was a declared, range-checked, defaulted and *persisted* field
   * of `AccessibilitySettings` that nothing in `src/` read back: no control
   * set it, no consumer applied it, no stylesheet had a hook for it. A value
   * could survive a reload and change nothing on screen.
   *
   * Four claims live here and not one of them is provable a layer down.
   * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so the whole
   * of `src/ui/display-scale.ts`'s DOM half is unreachable from the unit suite
   * -- and a computed length, a real `getBoundingClientRect` and a real
   * `elementFromPoint` are exactly what a token test cannot produce
   * (`docs/TESTING.md`, and the reason claim 5 of this file's own header
   * exists):
   *
   * 1. **A press changes a box**, not an attribute. The mechanism is one
   *    custom property on `:root` that every length token multiplies, so what
   *    has to be true is that a real element is a different size afterwards.
   *    Asserting `--ui-scale` alone would pass with `tokens.css` reverted.
   * 2. **It survives a reload**, which is the half of #545 that was already
   *    working and had nothing to work on.
   * 3. **A stored value that is not one of the six steps arrives snapped**,
   *    and one outside the legal band still falls back to the default. That is
   *    the persistence decision this issue forced, and only a real page load
   *    runs `loadAccessibilitySettings` against a real `localStorage`.
   * 4. **Nothing is laid outside its box at any step.** A UI scale makes every
   *    panel's content grow inside a viewport that does not, so the steps are
   *    only shippable if they are measured at the binding viewport. 900x600 is
   *    that viewport for the rail (`hud.css`) and 375x812 is the one that
   *    binds the status strip -- both are walked, at all six steps.
   */
  test('the interface scale is applied, cycles through its six steps and survives a reload (#545)', async ({ page }) => {
    // 1440x900 rather than 900x600, and the reason is a measurement: the
    // status strip *wraps to two rows* at 125 % on a 900px-wide window, so its
    // actual height there is not a multiple of anything and is the wrong ruler.
    // What every step does to the panels at the viewports that bind is the
    // next test's subject; this one is about the mechanism.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);

    const control = page.locator('.display-scale__cycle');
    const readout = page.locator('.display-scale__value');
    await expect(control).toBeVisible();

    /*
     * Two boxes and a measured strip floor, driven by *different*
     * tokens -- which the first draft of this test was not, and a mutation
     * proved it: reverting `--tap-target` to a literal 44px left it green,
     * because a tab's height at 100 % comes from its padding, icon and label
     * rather than from its `min-height` floor.
     *
     *   - a rail tab, whose height is `--space-1`, `--icon-size-md` and
     *     `--text-size-label` summed;
     *   - the scale button itself, whose height *is* `--tap-target` (one line
     *     of body type inside a 44px floor);
     *   - the status strip's computed height floor, driven by
     *     `--hud-strip-height`. Its actual box can be taller than that floor
     *     when the status controls wrap into more rows.
     *
     * All three must move together, because "the interface scales" is a claim
     * about the whole token layer and not about whichever length a test
     * happened to reach. The strip's actual box is measured separately: new
     * controls can make it content-sized above its floor at both scales, so
     * its ratio alone is not a measurement of the strip-height token.
     */
    const boxes = async (): Promise<Record<string, number>> =>
      page.evaluate(() => ({
        tab: document.querySelector('.ui-tab')?.getBoundingClientRect().height ?? 0,
        button: document.querySelector('.display-scale__cycle')?.getBoundingClientRect().height ?? 0,
        stripFloor: Number.parseFloat(getComputedStyle(document.querySelector('.hud-strip')!).minHeight),
        stripActual: document.querySelector('.hud-strip')?.getBoundingClientRect().height ?? 0,
      }));

    const atDefault = await boxes();
    // Not asserted as literals: what matters is that the boxes and the
    // strip's computed floor *move* by about the ratio the step asks for.
    // Literals here would be a second copy of the token file inside a test.
    for (const [name, value] of Object.entries(atDefault)) expect(value, name).toBeGreaterThan(0);
    expect(atDefault['stripActual'], 'the rendered strip must honor its floor at 100%').toBeGreaterThanOrEqual(atDefault['stripFloor'] ?? 0);
    await expect(readout).toHaveText('100%');

    // One press: 100 -> 125. The boxes grow, and they grow by the step.
    //
    // A band rather than an exact 1.25, because the tab's box is a sum that
    // includes lengths which deliberately do **not** scale -- the 1px
    // hairline and a tab's 2px active rule are device affordances, and
    // `tokens.css` says so. The band is wide enough for that and nowhere
    // near wide enough for a token that stopped scaling, which lands at 1.0.
    await control.click();
    await expect(readout).toHaveText('125%');
    const at125 = await boxes();
    expect(at125['stripActual'], 'the rendered strip must honor its floor at 125%').toBeGreaterThanOrEqual(at125['stripFloor'] ?? 0);
    for (const [name, value] of Object.entries(at125)) {
      if (name === 'stripActual') continue;
      const ratio = value / (atDefault[name] ?? 1);
      expect(ratio, `${name} grew by ${ratio.toFixed(3)} for a step of 1.25`).toBeGreaterThan(1.2);
      expect(ratio, `${name} grew by ${ratio.toFixed(3)} for a step of 1.25`).toBeLessThan(1.3);
    }

    // The rest of the ring, and the wrap at the top. Six presses from any step
    // return to it, which is what makes one button enough for six values --
    // and 200 -> 75 is the press a control that merely clamped would refuse.
    for (const expected of ['150%', '175%', '200%', '75%', '100%']) {
      await control.click();
      await expect(readout).toHaveText(expected);
    }
    await control.click();
    await expect(readout).toHaveText('125%');
    // Still 125 % after a full lap, measured rather than assumed: a readout
    // that had drifted from the property would show the same text over a
    // different box.
    expect(await boxes()).toEqual(at125);

    // It survives a reload -- through the real storage key, not through this
    // page's memory.
    await page.reload();
    await page.waitForSelector('.display-scale__value');
    await expect(page.locator('.display-scale__value')).toHaveText('125%');
    expect(await boxes()).toEqual(at125);
    expect(
      await page.evaluate(() => window.localStorage.getItem('lockstate.settings.accessibility')),
    ).toBe(JSON.stringify({ version: 1, reducedMotion: false, uiScale: 1.25 }));
  });

  test('a stored scale that is not a legal step is snapped, and one out of range is refused (#545)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 600 });

    // 0.9 was a legal stored value before the steps existed: in range, and not
    // a step. It arrives as the nearest step rather than taking the whole
    // record down with it -- `reducedMotion` is set here precisely so that the
    // "the record survived" half is observable, since a rejected record would
    // lose it.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'lockstate.settings.accessibility',
        JSON.stringify({ version: 1, reducedMotion: true, uiScale: 0.9 }),
      );
    });
    await openApp(page);
    await expect(page.locator('.display-scale__value')).toHaveText('100%');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim())).toBe('1');

    // 0.63 is outside [0.75, 2] and is refused exactly as it always was, so
    // the whole record falls back to the defaults. A clamp would have answered
    // 75 % here, and it does not.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'lockstate.settings.accessibility',
        JSON.stringify({ version: 1, reducedMotion: true, uiScale: 0.63 }),
      );
    });
    await openApp(page);
    await expect(page.locator('.display-scale__value')).toHaveText('100%');
  });

  test('every interface scale step keeps the HUD inside the viewport it is drawn in (#545)', async ({ page }) => {
    // Twelve full app boots (two viewports x six scales) exceed the shared
    // 60-second per-test budget on CI even when each layout assertion passes.
    test.slow();
    /*
     * The measurement #545's own defect class demands. A scale control makes
     * the "panel that cannot afford its content" failure worse in both
     * directions: at 125 % every panel's content grows inside a box that did
     * not. So the steps are walked at the two viewports that bind -- 900x600,
     * where `hud.css` records the rail pinned at its floor, and 375x812, where
     * the status strip has 359px of row and the brand badge takes 225 of it.
     *
     * What is asserted is *not* that nothing scrolls. A panel that scrolls is
     * the honest outcome and this file already documents it for the expanded
     * numeric fallback. What must hold at every step is the pair that is never
     * honest: nothing laid outside the viewport, and no control that cannot be
     * pressed. Both are the failure mode issue #88 measured -- present,
     * reachable by nothing -- and both were really reachable here before the
     * two layout bounds this change adds: the scale control itself was laid at
     * x=233..389 of a 375px viewport, and at 175 % on 900x600 the minimap's
     * square overflowed its grid row upward and covered it.
     */
    for (const [width, height] of [
      [900, 600],
      [375, 812],
    ] as const) {
      for (const scale of [0.75, 1, 1.25, 1.5, 1.75, 2] as const) {
        await page.addInitScript((value) => {
          window.localStorage.setItem(
            'lockstate.settings.accessibility',
            JSON.stringify({ version: 1, reducedMotion: false, uiScale: value }),
          );
        }, scale);
        await page.setViewportSize({ width, height });
        await openApp(page);
        const drawerPlacement = (await page.locator('.hud').getAttribute('data-layout-navigation-placement')) === 'drawer';
        if (drawerPlacement) await page.locator('.hud-navigation-drawer__trigger').click();
        await page.locator('.ui-tab[data-tab="build"]').click();
        // Selecting a tab closes the temporary drawer. Reopen it to measure
        // the six tabs in the state where a player can press them.
        if (drawerPlacement) await page.locator('.hud-navigation-drawer__trigger').click();

        const report = await page.evaluate((drawerOpen) => {
          const outside: string[] = [];
          const unreachable: string[] = [];
          const selectors = [
            '.hud-strip',
            '.brand',
            '.display-scale',
            '.hud-tabs__inner',
            '.save-panel',
            '.hud-build',
          ];
          for (const selector of selectors) {
            const element = document.querySelector<HTMLElement>(selector);
            if (element === null) {
              outside.push(`${selector} is not on the page`);
              continue;
            }
            const rect = element.getBoundingClientRect();
            if (
              rect.top < -0.5 ||
              rect.bottom > window.innerHeight + 0.5 ||
              rect.left < -0.5 ||
              rect.right > window.innerWidth + 0.5
            ) {
              outside.push(
                `${selector} spans ${Math.round(rect.left)},${Math.round(rect.top)}..${Math.round(rect.right)},${Math.round(rect.bottom)} of ${window.innerWidth}x${window.innerHeight}`,
              );
            }
          }
          // Presence is not reachability. Only a real hit test says whether
          // the pixel at a control's centre belongs to that control.
          for (const control of document.querySelectorAll<HTMLElement>(drawerOpen ? '.ui-tab' : '.ui-tab, .display-scale__cycle')) {
            const rect = control.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            if (hit === null || !control.contains(hit)) {
              unreachable.push(
                `${control.className} at ${Math.round(rect.x + rect.width / 2)},${Math.round(rect.y + rect.height / 2)} is covered by ${hit === null ? 'nothing' : `${hit.tagName.toLowerCase()}.${hit.className}`}`,
              );
            }
          }
          /*
           * The minimap frame stays under the strip.
           *
           * `.hud__corner` is a grid item in a `minmax(0, 1fr)` row with
           * `align-self: end`, and `.hud-minimap__surface` is `aspect-ratio:
           * 1 / 1` off a *scaled* width -- so the corner's height is a
           * function of its width, and a frame taller than the row overflows
           * it upward, over the status strip. Measured at 175 % on 900x600
           * before the corner was bounded: `elementFromPoint` at a strip
           * control's centre returned `.hud-minimap__surface`.
           *
           * Asserted as a *box* rather than through the hit test above,
           * because whether the overflow happens to cover a control depends on
           * how tall the strip's first row is -- which is a coincidence, and
           * the coincidence went the other way once already. The rule is that
           * the HUD frames the world and never covers itself.
           */
          const strip = document.querySelector<HTMLElement>('.hud-strip');
          const minimap = document.querySelector<HTMLElement>('.hud-minimap');
          const minimapRect = minimap?.getBoundingClientRect();
          // The box, not the attribute, and not the element's own computed
          // `display` either: `hud.css` drops `.hud__corner` at 720px and
          // under, and a child of a `display: none` parent still computes its
          // *own* `display` as authored -- so the frame is laid out nowhere
          // and reports a 0x0 rect at the origin. Reading that as "the minimap
          // is at y=0" is exactly the `[hidden]`-versus-the-box mistake this
          // suite has made before.
          const drawn = minimapRect !== undefined && (minimapRect.width > 0 || minimapRect.height > 0);
          const overlap =
            strip === null || !drawn || minimapRect === undefined
              ? 0
              : Math.round((strip.getBoundingClientRect().bottom - minimapRect.top) * 10) / 10;

          /*
           * The status strip contains its own rows.
           *
           * It used to be a *fixed* height, and at 375px -- where it wraps to
           * three rows -- that was 100.5px of content in an 88px box on
           * `origin/main`, with `align-content: center` laying the brand badge
           * at y = -6.7 and the transport row's last 5.8px over the rail. #545
           * made it `min-height`, because a scaled strip wraps at every width
           * and a fixed height would have spilled whole rows. This is the
           * assertion that keeps it honest, at every step: a box measured
           * against the content it is holding, rather than a declaration
           * repeated back.
           */
          const stripRows = strip === null ? [] : [...strip.children].map((child) => child.getBoundingClientRect());
          const stripRect = strip?.getBoundingClientRect();
          const stripOverflow =
            strip === null || stripRect === undefined || stripRows.length === 0
              ? 0
              : Math.round(
                  Math.max(
                    0,
                    stripRect.top - Math.min(...stripRows.map((r) => r.top)),
                    Math.max(...stripRows.map((r) => r.bottom)) - stripRect.bottom,
                  ) * 10,
                ) / 10;

          const rail = document.querySelector<HTMLElement>('.hud__rail');
          return {
            outside,
            unreachable,
            stripOverflow,
            minimapOverStrip: Math.max(0, overlap),
            // The rail is not the scroll container; its panels are. That is
            // the second half of the #88 fix and it must survive every scale.
            railOverflow: rail === null ? -1 : rail.scrollHeight - rail.clientHeight,
          };
        }, drawerPlacement);

        if (drawerPlacement) {
          await page.locator('.hud-navigation-drawer__trigger').click();
          const scaleReachable = await page.locator('.display-scale__cycle').evaluate((control) => {
            const rect = control.getBoundingClientRect();
            return control.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          });
          expect(scaleReachable, `scale control is covered at ${width}x${height} and ${scale * 100}%`).toBe(true);
        }

        expect(report.outside, `laid outside the viewport at ${width}x${height} and ${scale * 100}%`).toEqual([]);
        expect(report.unreachable, `covered by something else at ${width}x${height} and ${scale * 100}%`).toEqual([]);
        expect(report.railOverflow, `the rail scrolls at ${width}x${height} and ${scale * 100}%`).toBe(0);
        expect(
          report.minimapOverStrip,
          `the minimap frame is drawn over the status strip at ${width}x${height} and ${scale * 100}%`,
        ).toBe(0);
        expect(
          report.stripOverflow,
          `the status strip lays its own rows outside its box at ${width}x${height} and ${scale * 100}%`,
        ).toBe(0);
      }
    }
  });

  /**
   * **The status strip is a readout at every viewport (#634).**
   *
   * WHY THIS IS HERE AND NOT IN `ui-shell.spec.ts`. That file owns the HUD's
   * responsive layout, and the header of this one says so -- *"the HUD's
   * computed font stack, responsive layout and intent reporting"* is listed
   * under "Deliberately NOT here". **For the status strip that sentence is
   * wrong, and this test is the correction rather than an exception to it.**
   * `ui-harness.ts`'s `mountHudShell` never touches `HudHandle.brandSlot` --
   * measured, that slot is **0px wide with 0 children** on the harness page --
   * while `src/main.ts` puts the brand badge *and* the interface-scale
   * control in it, which measures **351.9px** on the assembled page. That is
   * a third of the strip's fixed chrome (727.4px in total) present on one
   * page and absent from the other, and it is why #634 read the metrics row
   * at 524px on the harness and **173px on the real page at the same
   * viewport**. A responsive claim about the strip is therefore a claim about
   * the assembled page, and only this file loads one.
   *
   * WHAT IT ASSERTS, AND WHY NOT A PIXEL COUNT. `.hud-strip__metrics` is
   * `overflow-x: auto` with the scrollbar suppressed in both engines
   * (`hud.css`), so a chip that does not fit is not merely small -- it is
   * *absent*, with nothing on screen saying so. Before this test existed the
   * strip showed **zero of its eight chips at 768px** in a 41px box, and
   * every browser test in the repository was green.
   *
   * So the property, not the number:
   *
   *   > **no chip is cut off by anything except the width of the screen.**
   *
   * The screen's width is what the strip's own content box says it is, and
   * how many chips fit in it is computed from the chips' own measured widths
   * -- so `fitsInStripWidth` and `fullyVisible` are two independent readings
   * of the same page that must agree. An assertion on `clientWidth === 1193`
   * would pin an accident of eight labels in one locale; this one holds for
   * any number of chips of any width, and fails the moment something on the
   * strip takes room the readout needed.
   *
   * It is deliberately satisfiable at 375px, where eight chips *cannot* fit:
   * 1101px of content into 359px is not a breakpoint problem, and #634 rules
   * out both a scroll affordance and prioritising a subset. What the property
   * demands there is that the row shows every chip the phone has room for --
   * two -- rather than being squeezed to a fifth of that by a clock and a
   * transport sharing its line.
   */
  test('shows every status chip the screen has room for, at every viewport (#634)', async ({ page }) => {
    await openApp(page);

    /**
     * Nine viewports, not the five the rest of this suite visits.
     *
     * #634's curve is not monotonic -- it recovers *below* the old 720px
     * breakpoint (600px showed 4 chips where 900px showed 1) -- so a list
     * that skipped the middle would have reported the two ends looking fine.
     * 768 and 1440 are the two that matter: the first is the worst point on
     * that curve and the second is an ordinary laptop that still lost three
     * chips.
     *
     * **900x600 is here to record what #634 did NOT buy, and it is marked
     * rather than dropped.** The metrics only get their own row where the
     * layout can pay 30.5px for it, and at 900x600 the Build panel's
     * always-visible budget is 7.81px: granting the row there overdrew it by
     * 23px and turned #174's *"the Build panel arrives inside its own fold"*
     * red. `hud.css` chooses the fold, so this viewport is still one row and
     * still shows 1 of 8 chips. A list that omitted it would read as coverage
     * of the shipped viewports; this one says what happens at each.
     */
    const STRIP_VIEWPORTS = [
      [1920, 1080],
      [1600, 900],
      [1440, 900],
      [1280, 720],
      [1024, 768],
      [900, 600],
      [768, 1024],
      [600, 800],
      [375, 812],
    ] as const;

    /**
     * The one viewport where the property below does not hold, named by the
     * thing that stops it rather than by a flag.
     *
     * `hud.css`'s two-row rule carries `min-height: 701px`, so a viewport
     * shorter than that keeps the one-row layout and the squeeze that comes
     * with it. Deriving the exception from the same number the stylesheet
     * uses is what stops this list quietly growing: a second short viewport
     * added to `STRIP_VIEWPORTS` is exempted for the same stated reason, and
     * a viewport that stops being short stops being exempt.
     */
    const SHORT_VIEWPORT_HEIGHT_PX = 701;

    for (const [width, height] of STRIP_VIEWPORTS) {
      await page.setViewportSize({ width, height });

      const reading = await page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>('.hud-strip');
        const metrics = document.querySelector<HTMLElement>('.hud-strip__metrics');
        if (strip === null || metrics === null) return null;

        const chips = [...metrics.querySelectorAll<HTMLElement>('[data-metric]')];
        const metricsBox = metrics.getBoundingClientRect();

        // A chip counts as on screen only if *both* its edges are inside the
        // scroll container's visible box. Half a chip is the failure #634 is
        // about, not a partial success. The half-pixel tolerance is for
        // subpixel layout, and is far below one character of a label.
        const fullyVisible = chips.filter((chip) => {
          const box = chip.getBoundingClientRect();
          return box.left >= metricsBox.left - 0.5 && box.right <= metricsBox.right + 0.5;
        }).length;

        // How many chips the *strip* has room for, from the chips' own
        // measured widths and the gap the stylesheet actually resolved --
        // nothing here is copied from `hud.css`. Leading chips, because the
        // row is laid left to right and a chip is only reachable by scrolling
        // past the ones before it.
        const stripStyle = getComputedStyle(strip);
        const stripContentWidth =
          strip.getBoundingClientRect().width -
          Number.parseFloat(stripStyle.paddingLeft) -
          Number.parseFloat(stripStyle.paddingRight);
        const gap = Number.parseFloat(getComputedStyle(metrics).columnGap);

        let used = 0;
        let fitsInStripWidth = 0;
        for (const chip of chips) {
          const next = used === 0 ? chip.getBoundingClientRect().width : used + gap + chip.getBoundingClientRect().width;
          if (next > stripContentWidth + 0.5) break;
          used = next;
          fitsInStripWidth += 1;
        }

        return {
          chips: chips.length,
          fullyVisible,
          fitsInStripWidth,
          metricsClientWidth: metrics.clientWidth,
          metricsScrollWidth: metrics.scrollWidth,
          stripContentWidth: Math.round(stripContentWidth * 10) / 10,
        };
      });

      expect(reading, `the status strip is not on the page at ${width}x${height}`).not.toBeNull();
      const at = `${width}x${height}`;

      // The Full HD operations frame deliberately gives the metrics row back
      // the strip's right-hand control gutter. Its row can therefore be wider
      // than the strip's content box, while all nine chips remain on screen.
      if (width >= 1920 && height >= 1080) {
        expect(reading!.fullyVisible, `${at}: the permanent Full HD status row lost a chip`).toBe(reading!.chips);
      } else if (height >= SHORT_VIEWPORT_HEIGHT_PX) {
        expect(
          reading!.fullyVisible,
          `${at}: ${reading!.fullyVisible} of ${reading!.chips} chips are on screen, but the strip is ` +
            `${reading!.stripContentWidth}px wide and has room for ${reading!.fitsInStripWidth}. The readout ` +
            `is ${reading!.metricsClientWidth}px of ${reading!.metricsScrollWidth}px of content.`,
        ).toBe(reading!.fitsInStripWidth);
      }

      // And #634's headline, refutable on its own: at 768px this was zero.
      // Implied by the line above only while the strip is wider than one
      // chip, which is a thing that could stop being true; stated separately
      // so the failure names what a player would see.
      expect(reading!.fullyVisible, `${at}: not one status chip is on screen`).toBeGreaterThan(0);
    }
  });

  /**
   * Issue #680: the first thing a player does, after the other first thing a
   * player does.
   *
   * The game's opening interaction is "click around, then start", and clicking
   * around used to cost the start: one press on any `.ui-tab` before the first
   * **New prison** made that press fail with
   * `Could not create a prison: Simulation worker fault (already-initialized):
   * Kernel is already initialized.`, and only a second press worked.
   *
   * Why it needs a browser. Every layer of the cause is composition:
   * `src/main.ts` builds the panel readers over the *channel* at boot rather
   * than over a session (#149), the `select-tab` intent fires their
   * `refresh*()` reads on the first tab press, and the worker they read from
   * is the **boot worker** the channel keeps for the first session. Only the
   * assembled page has all three. The unit and integration halves live in
   * `tests/unit/worker-state-machine.test.ts` and
   * `tests/integration/session-first-create-after-a-panel-read.test.ts`; what
   * they stand in for is a real `Worker`, which is exactly what this file
   * exists for.
   *
   * Every tab, from `HUD_TAB_IDS` rather than a copy of it, for the reason the
   * reachability sweep above reads the same list: the sweep found it on five
   * of five, and a sixth tab must not be able to reintroduce it unseen.
   */
  for (const tab of HUD_TAB_IDS) {
    test(`the first New prison works after one press on the ${tab} tab (#680)`, async ({ page }) => {
      await openApp(page);

      await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
      await page.getByRole('button', { name: localeText('save.action.create') }).click();

      // The status line, not the prison list: a create that faulted still
      // writes and then deletes its slot row (`discardFailedCreation`), so an
      // empty list and a failed create look alike for a moment. The status is
      // what the player reads and what the sweep measured.
      const status = page.locator('.save-panel__status');
      // The catalogue's own sentence up to its first parameter, so this
      // pins what the player reads without pinning the generation id.
      await expect(status).toContainText(localeText('save.status.saved').split('{')[0]!.trim());
      // Named separately so a regression says which half broke, and asserted
      // as an absence because that is the shape the defect had: the first
      // press produced a sentence, it was just the wrong one.
      await expect(status).not.toContainText('already');
      await expect(page.locator('.save-panel__item-label').first()).toContainText('New Prison');
      await waitForSession(page);
    });
  }

  /**
   * **The high-risk chip is on screen, and the Regime roster's four rows are
   * the prison's highest tiers** (issue #703, the owner's fourth ruling of
   * 2026-08-31).
   *
   * ### Why the assembled page, and what only it can settle
   *
   * Both halves of the ruling are decided in pure functions that are proven
   * headlessly beside this test -- `projectStatusMetrics` in
   * `tests/unit/ui-hud-projection.test.ts`, `projectPrisonerRoster`'s ordering
   * in `tests/unit/hud-roster-tier-order.test.ts` (which writes tier patterns
   * this page cannot produce, tier 3 included, and pins the whole order and its
   * stability). What is left over is what a browser is for, and each piece of it
   * has a defect in this repository's history behind it:
   *
   * - **That the chip has a box.** `docs/TESTING.md`: *"A text assertion does
   *   not imply visibility"* -- `toContainText` passes inside a `display: none`
   *   subtree and on a 0x0 box, which is how the #82 alert stayed green while no
   *   player could see it (#220). The strip is worse than most: it is
   *   `overflow-x: auto` with the scrollbar suppressed in both engines, so a
   *   ninth chip that does not fit is *absent with nothing saying so* (#634).
   *   The chip's own box is therefore read against the metrics row's box, and
   *   `offsetParent` with it.
   * - **That its label resolves.** The label is
   *   `classification-group.high-risk.name`, deliberately not a `hud.*` key --
   *   it is the string the game already authors for this group, reused so the
   *   chip and the Regime panel's restricted-block heading cannot drift apart.
   *   An unresolved key renders as itself (ADR 0011), so the assertion is on the
   *   words and on the absence of anything dotted anywhere in the strip.
   * - **That the reordering reaches painted rows.** The roster is a *pull* over
   *   the projection channel, refreshed on the counts cadence while the Regime
   *   tab is showing, painted into four pooled rows. Nothing below this page has
   *   all of that at once.
   *
   * ### What the prison here can and cannot produce
   *
   * `ADMISSION_REQUEST` in `src/main.ts` is `{ priorIncidents: 0 }` and its own
   * comment records the consequence: the tiers reachable from the Admit control
   * are `[0, 1]` below an 84-day sentence and `[0, 1, 2]` at or above it, and
   * **the panel cannot produce a tier-3 prisoner at all** -- one sentence point
   * plus a maximum screening draw clamps at 2. So `prisonersHighRisk` is
   * honestly 0 in any prison this test can build, and the chip's *value* is
   * proven from a real worker publication in *the HUD counts come from the
   * worker rather than from zeros baked into the page* above, which injects a 9
   * through the real decoder. This test proves the chip is *seen*.
   *
   * The cell is zoned and left **empty**, with no bed in it, which is the
   * cheapest prison that admits: `src/main.ts` refuses `AdmitPrisoner` only when
   * the prison has no accommodation-target instance at all, and an arrival then
   * waits at `accommodation-assignment` -- which is a *classified* stage
   * (`CLASSIFIED_STAGES` in `prisoner-projection.ts`), so every prisoner here
   * carries a real drawn tier and a real badge word.
   */
  test('paints the high-risk chip and orders the Regime roster by tier (#703)', async ({ page }) => {
    /*
     * **Five minutes, and the number is measured rather than generous.**
     *
     * Slow for the reason the keyboard loop above is slow: ADR 0045 makes an
     * enclosed perimeter a precondition of zoning, so the shortest route to a
     * prison that admits anybody is buy, order, build ten wall segments, zone,
     * admit -- and this test then runs the intake pipeline and exports a save.
     * Measured green at **3.0m** on this container, twice; `test.slow()` alone
     * is 180 s and would have been decided by whatever else the machine was
     * doing.
     *
     * That is a budget for work this test really does, not a timeout raised over
     * a race: nothing here waits on a coincidence. Every wait is on a state the
     * game reports -- the build queue emptying, `[data-metric="rooms"]` moving,
     * the roster's own `data-total`, four rows carrying a tier -- and each names
     * what did not happen when it gives up.
     */
    test.setTimeout(300_000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page);

    const metric = (id: string) => page.locator(`[data-metric="${id}"] .ui-stat__value`);

    // ---- the chip, before any prison exists ---------------------------
    /*
     * Read as geometry rather than as text, and against the metrics row's own
     * box rather than against the viewport: the row is the scroll container, so
     * "on screen" for a chip means inside *that* box. Both edges, because half
     * a chip is #634's failure and not a partial success.
     */
    const chip = await page.evaluate(() => {
      const metrics = document.querySelector<HTMLElement>('.hud-strip__metrics');
      const node = document.querySelector<HTMLElement>('.hud-strip [data-metric="high-risk"]');
      if (metrics === null || node === null) return null;
      const box = node.getBoundingClientRect();
      const row = metrics.getBoundingClientRect();
      return {
        width: box.width,
        height: box.height,
        insideTheRow: box.left >= row.left - 0.5 && box.right <= row.right + 0.5,
        detached: node.offsetParent === null,
        label: node.querySelector<HTMLElement>('.ui-stat__label')?.textContent ?? '',
        value: node.querySelector<HTMLElement>('.ui-stat__value')?.textContent ?? '',
        stripText: document.querySelector<HTMLElement>('.hud-strip')?.innerText ?? '',
      };
    });

    expect(chip, 'there is no [data-metric="high-risk"] chip on the strip').not.toBeNull();
    expect(chip!.width, 'the high-risk chip has no width').toBeGreaterThan(0);
    expect(chip!.height, 'the high-risk chip has no height').toBeGreaterThan(0);
    expect(chip!.detached, 'the high-risk chip is in the DOM with no layout box').toBe(false);
    expect(chip!.insideTheRow, 'the high-risk chip is off the end of the metrics row').toBe(true);

    // The authored words, not the key that names them. `toBe` and not
    // `toContain`: a label that still carried its key would contain the words.
    expect(chip!.label).toBe(localeText('classification-group.high-risk.name'));
    expect(chip!.label).toBe('High Risk');
    // `--` and not `0`: no prison exists, so none has reported, and since
    // #1191 the strip states the absence rather than a count it was never
    // given. The chip's *number* is proven from a real publication in *the HUD
    // counts come from the worker rather than from zeros baked into the page*
    // above, which is where a 9 arrives over the real decoder; what this line
    // is for is that the chip is on screen and carries a readout at all.
    expect(chip!.value, 'no prison has reported, so the high-risk chip has no number to show').toBe('--');

    /*
     * And no raw key anywhere in the strip, which is the check that makes the
     * label assertion above more than a spelling test. An unresolved key renders
     * as itself (ADR 0011), so a leak is a dotted lowercase identifier on
     * screen.
     *
     * **Scoped to the namespaces a key can come from, and the first version of
     * this assertion was not.** "Any dotted lowercase identifier" is the obvious
     * pattern and it fails on the real page for a reason that is not a defect:
     * the strip's brand slot is filled by `src/ui/brand-badge.ts`, and measured
     * here the row's `innerText` begins
     * `"LockState.io\nPRE-ALPHA\nv0.0.282 · c5016ee\n..."`. The pattern matched
     * `tate.io`. A wordmark is not a message key, so the check names the two
     * registries a HUD label really can be spelled from -- `hud.*`
     * (`src/ui/hud/messages.ts`) and the simulation-enum namespaces
     * (`src/content/simulation-message-keys.ts`, of which
     * `classification-group` is this chip's) -- rather than being widened until
     * it passes.
     */
    expect(chip!.stripText, `a message key leaked into the strip: ${chip!.stripText}`).not.toMatch(
      /\b(?:hud|classification-group|risk-tier|incident-type|incident-state|action|action-phase|intake-stage|need)\.[a-z0-9][a-z0-9.-]*/,
    );

    // ---- a prison with a population in it ------------------------------
    await page.getByRole('button', { name: localeText('save.action.create') }).click();
    await waitForSession(page);
    await expect(metric('prisoners'), 'a prisoner leaked from an earlier test').toHaveText('0');

    // `room.cell`'s authored minimum exactly (2x3), because every tile of
    // perimeter beyond it is another wall order this test has to place.
    const cell: TileRectangle = { x: 4, y: 4, width: 2, height: 3 };
    await wallRectanglesFromTheKeyboard(page, [cell]);

    await page.locator('.ui-tab[data-tab="zones"]').click();
    await page.locator('.hud-rooms__list [data-room="room.cell"]').click();
    await page.locator('.hud-rooms__coordinates > .ui-section__header').click();
    await expect(page.locator('.hud-rooms__coordinates')).toHaveAttribute('data-collapsed', 'false');
    for (const [field, value] of [
      ['x', cell.x],
      ['y', cell.y],
      ['width', cell.width],
      ['height', cell.height],
    ] as const) {
      await page.locator(`.hud-rooms__coord-${field} input`).fill(String(value));
    }
    await page.locator('.hud-rooms__coordinates-submit').click();
    await expect(page.locator('.hud-rooms__area')).toHaveAttribute(
      'data-area',
      `${cell.x},${cell.y},${cell.width},${cell.height}`,
    );
    await page.locator('.hud-rooms__confirm').click();
    await expect(metric('rooms'), 'the typed rectangle never reached the worker').toHaveText('1');

    /*
     * Twelve arrivals, three times the roster's window.
     *
     * The claim is about *which* four of the population fill four boxes, so the
     * population has to be several times the window for the choice to be a
     * choice. Three times rather than twice for one measured reason: with eight
     * prisoners a run came out with the four highest tiers sitting at entity
     * indices 0, 1, 2 and 6 -- close enough to the arrival order that a
     * *broken* sort would have been within one row of the right answer. Twelve
     * puts eight prisoners outside the window instead of four.
     */
    const ADMISSIONS = 12;
    // Manage since 2026-09-14: the Admit control moved to the section that
    // holds the staff (ADR 0112 decision 3).
    await page.locator('.ui-tab[data-tab="manage"]').click();
    for (let admission = 0; admission < ADMISSIONS; admission += 1) {
      await page.locator('.hud-intake__admit').click();
    }
    await expect(metric('prisoners'), 'the admissions were refused').toHaveText(String(ADMISSIONS));

    /*
     * **And the clock, which is the step whose absence cost the first run of
     * this test.**
     *
     * `wallRectanglesFromTheKeyboard` ends by pressing *Pause*, deliberately --
     * its own comment says it leaves the caller "the paused session a new prison
     * arrives as". Since ADR 0051 a *due* command is dispatched during a pause,
     * which is why the admissions above landed and the strip reads the whole
     * population; but
     * `IntakeSystem` is a scheduled system, so with the clock stopped no arrival
     * ever leaves `queued` and no row can carry a tier. Measured: the poll below
     * spent its whole budget at zero classified rows, on the prison of eight
     * this fixture admitted before it was widened to twelve.
     *
     * Fast forward twice, because there are three intake stages to walk before
     * `accommodation-assignment` and the pipeline runs every five ticks.
     */
    const transport = page.locator('.hud-strip__transport');
    await transport.getByRole('button', { name: localeText('hud.transport.play') }).click();
    await expect(
      transport.getByRole('button', { name: localeText('hud.transport.play') }),
      'the worker never accepted the set-clock, so intake cannot advance',
    ).toHaveAttribute('aria-pressed', 'true');
    await transport.getByRole('button', { name: localeText('hud.transport.fast-forward') }).click();
    await expect(page.locator('.hud-clock__speed')).toHaveText(`×${fundsText(2)}`);
    await transport.getByRole('button', { name: localeText('hud.transport.fast-forward') }).click();
    await expect(page.locator('.hud-clock__speed')).toHaveText(`×${fundsText(4)}`);

    // ---- and the four rows the Regime panel draws ----------------------
    await page.locator('.ui-tab[data-tab="day-plan"]').click();
    const roster = page.locator('.hud-regime__roster');
    await expect(roster).toBeVisible();

    /*
     * **The roster has to be re-*read*, not merely re-read from the DOM, and
     * this cost a run to find.**
     *
     * `hud/prisoner-roster` is a pull. `src/main.ts` fires
     * `refreshPrisonerRoster()` on a `select-tab` intent and on each
     * `simulation/status-counts` publication -- and that channel publishes only
     * when a count *changes* (`STATUS_COUNTS_PUBLISH_INTERVAL_MS` is a ceiling,
     * not a rate). The one count that moves every tick is
     * `stateIncomeAccruedTodayMinorUnits`, and it moves only while some place is
     * occupied. This prison's cell has no bed in it, so nothing is occupied, the
     * accrual is a constant zero, the channel falls silent after the last
     * admission -- and the roster on screen stays the one painted at that
     * moment, when the newest arrivals were still `queued`.
     *
     * `prisonersInIntake` does move as the pipeline walks, so the channel is not
     * silent for the whole of this wait -- but it goes quiet again the moment the
     * last arrival settles, and "the roster is refreshed by something" is not a
     * thing to leave to a count that may or may not be moving. So each poll
     * re-selects the tab, which is the intent that asks the worker again.
     */
    const rereadRoster = async (): Promise<void> => {
      await page.locator('.ui-tab[data-tab="overview"]').click();
      await page.locator('.ui-tab[data-tab="day-plan"]').click();
    };

    // The whole population reached the projection's `total`, so the four rows
    // below really are a window on eight people and not the prison entire.
    await expect
      .poll(
        async () => {
          await rereadRoster();
          return roster.getAttribute('data-total');
        },
        {
          message: 'the roster never reported the population the strip is showing',
          timeout: 30_000,
        },
      )
      .toBe(String(ADMISSIONS));

    /*
     * Every arrival has to have been *classified* before the order means
     * anything: `IntakeSystem` advances at most one stage per scheduled tick and
     * `accommodation-assignment` is the first classified one, so a row read too
     * early carries an intake-stage word and no tier at all -- and an ordering
     * assertion over four `undefined`s would pass for any implementation.
     */
    await expect
      .poll(
        async () => {
          await rereadRoster();
          return page.locator('.hud-regime__roster-row:not([hidden])[data-risk-tier]').count();
        },
        {
          message: 'the roster never showed four classified prisoners',
          timeout: 60_000,
        },
      )
      .toBe(PRISONER_ROSTER_ROW_LIMIT);

    const painted = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll<HTMLElement>('.hud-regime__roster-row:not([hidden])')];
      return nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return {
          prisoner: Number.parseInt(node.dataset['prisoner'] ?? '-1', 10),
          tier: Number.parseInt(node.dataset['riskTier'] ?? '-1', 10),
          group: node.dataset['classificationGroup'] ?? '',
          badge: node.querySelector<HTMLElement>('.ui-badge')?.textContent ?? '',
          width: box.width,
          height: box.height,
          detached: node.offsetParent === null,
        };
      });
    });

    expect(painted).toHaveLength(PRISONER_ROSTER_ROW_LIMIT);
    console.log(`[#703 roster] ${JSON.stringify(painted.map((row) => ({ id: row.prisoner, tier: row.tier })))}`);

    // Painted, not merely present -- `docs/TESTING.md`'s rule, applied to the
    // rows this ruling reorders.
    for (const row of painted) {
      expect(row.width, `row for prisoner ${row.prisoner} has no width`).toBeGreaterThan(0);
      expect(row.height, `row for prisoner ${row.prisoner} has no height`).toBeGreaterThan(0);
      expect(row.detached, `row for prisoner ${row.prisoner} has no layout box`).toBe(false);
      // The badge is the word beside the colour, so the tier never reaches the
      // player as a tone alone -- and it is a real word rather than a key.
      expect(row.badge.length, `row for prisoner ${row.prisoner} has an empty badge`).toBeGreaterThan(0);
      expect(row.badge).not.toContain('.');
    }

    // The ruling's shape, on the painted page: highest tier first.
    const tiers = painted.map((row) => row.tier);
    for (let position = 1; position < tiers.length; position += 1) {
      expect(
        tiers[position]!,
        `the roster is not in descending tier order: ${JSON.stringify(tiers)}`,
      ).toBeLessThanOrEqual(tiers[position - 1]!);
    }

    /*
     * **And the whole of it: these four are the four highest tiers in the
     * prison, checked against the population read out of the game's own save
     * file.**
     *
     * The panel is a four-row window on twelve people, so nothing on screen can
     * say what the other eight are -- and a first version of this test tried to
     * stand in for that with "the window holds more than one distinct tier",
     * which is not the claim and is not even reliable. It failed on a run whose
     * window was `[{0,1},{1,1},{2,1},{6,1}]`: four prisoners at tier 1, which is
     * a **correct** top-four window (id 6 is there and ids 3, 4 and 5 are not,
     * so those three are at tier 0) and exactly the case where the sort is
     * working hardest. A guard that rejects a correct answer is worse than no
     * guard.
     *
     * Export gives the real thing. `payload.prisoners.components.riskTier` is
     * the tier of every prisoner by entity index, from the same snapshot a
     * player's save file carries, so the expected window can be *computed
     * independently of the projection* and written against it. That is the
     * fixture rule `docs/TESTING.md` states from the other side: the expected
     * side of this comparison must not be the code under test, and here it is a
     * sort this file performs over bytes the persistence layer produced.
     *
     * Two things make it airtight rather than nearly so:
     *
     * - **The clock is paused first.** A save taken while the simulation runs
     *   could disagree with the rows painted a moment earlier.
     * - **Every prisoner is at the same intake stage**, asserted rather than
     *   assumed. Nobody can be housed (the cell has no bed), so all twelve sit
     *   at the same stage -- and *that* is what lets the expected order be a
     *   plain sort on `riskTier` with no re-derivation of which stages count as
     *   classified. The panel showing four tiers is what proves that stage is a
     *   classified one; this file never restates the rule.
     */
    await transport.getByRole('button', { name: localeText('hud.transport.pause') }).click();
    await expect(
      transport.getByRole('button', { name: localeText('hud.transport.pause') }),
      'the clock did not stop, so a save cannot be compared with the rows above',
    ).toHaveAttribute('aria-pressed', 'true');

    /*
     * **Saved first, and this is the second thing the full-file run taught this
     * test rather than a precaution.**
     *
     * `Export` writes the bytes of the **stored** save row, not the live
     * worker's state, so a prison whose population has not reached storage
     * exports as the prison it was at its last write. Run alone this test passed
     * anyway -- it takes about three minutes, so #146's 30-second interval
     * autosave had captured the population several times over. Run inside the
     * whole file it failed with `records.activeLength` at **0**: an exported
     * save carrying no prisoners at all, against twelve on the strip.
     *
     * `Save now` makes it a statement rather than a coincidence: the clock is
     * already paused, so the generation this writes is exactly the prison the
     * rows above were painted from.
     */
    await page.getByRole('button', { name: localeText('save.action.save') }).click();
    await expect(
      page.locator('.save-panel__status'),
      'the save the export is about to read was never written',
    ).toContainText(localeText('save.status.saved').split('{')[0]!.trim());

    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: localeText('save.action.export') }).click();
    const download = await downloading;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const saved = JSON.parse(chunks.join('')) as {
      readonly payload: {
        // `simulation` is optional in the schema, because a save written by a
        // pre-V3 build genuinely does not carry it (`save-schema.ts`). This
        // save was written by this build a moment ago, so it does -- and the
        // assertion below says so rather than reaching through an `any`.
        readonly simulation?: {
          readonly prisoners: {
            readonly components: {
              readonly activeLength: number;
              readonly riskTier: readonly number[];
              readonly intakeStage: readonly number[];
            };
          };
        };
      };
    };

    expect(saved.payload.simulation, 'the exported save carries no simulation section').toBeDefined();
    const records = saved.payload.simulation!.prisoners.components;
    expect(records.activeLength, 'the save does not hold the population that was admitted').toBe(ADMISSIONS);
    const stages = records.intakeStage.slice(0, ADMISSIONS);
    expect(
      new Set(stages).size,
      `the population is spread across intake stages ${JSON.stringify([...new Set(stages)])}, so a plain sort on the tier is not the roster's order`,
    ).toBe(1);

    const tierByIndex = records.riskTier.slice(0, ADMISSIONS);
    console.log(`[#703 population] ${JSON.stringify(tierByIndex)}`);
    const expectedWindow = [...tierByIndex.keys()]
      .sort((left, right) => tierByIndex[right]! - tierByIndex[left]! || left - right)
      .slice(0, PRISONER_ROSTER_ROW_LIMIT);

    expect(
      painted.map((row) => row.prisoner),
      `the four rows are not the four highest tiers of ${JSON.stringify(tierByIndex)}`,
    ).toEqual(expectedWindow);
    expect(tiers).toEqual(expectedWindow.map((index) => tierByIndex[index]));

    // And the badge word agrees with the tier the row carries, so the
    // reordering and the readout are the same fact.
    expect(painted[0]!.badge).toBe(localeText(`risk-tier.${String(painted[0]!.tier)}.name`));
    // The group is the tier's other grain, and the panel's tone reads it: no
    // prisoner this page can admit is high-risk (see the header), so a
    // `high-risk` group here would mean the two had come apart.
    for (const row of painted) expect(row.group).toBe('general-population');
  });
});

interface CentreHitCounters {
  canvas: number;
  hud: number;
}

type HitCountingWindow = Window & { lockstateCentreHits?: CentreHitCounters };
