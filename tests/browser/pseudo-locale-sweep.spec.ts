import { expect, test, type Page } from './network-changed-fixture';
import { HUD_TAB_IDS } from '../../src/ui/hud';

/**
 * ADR 0011's pseudo-locale, pointed at the *assembled application* for the
 * first time (#664).
 *
 * `src/services/localization/pseudo.ts` derives `en-XA` mechanically from the
 * English catalogue: every message is accented, padded by 35 % and wrapped in
 * `⟦ … ⟧`, with `{placeholder}` spans copied through untouched. So on a page
 * running that locale, **anything still readable is text that never passed
 * through the catalogue** — and, because placeholders are copied and not
 * accented, an English *parameter* spliced into a bracketed template is
 * readable too. That second class is the one no key-declaration scan can see.
 *
 * Before this file the locale was reachable from exactly two places, neither
 * of them the application: `tests/unit/services-localization.test.ts` (the
 * transform itself) and `tests/browser/ui-harness.ts`'s `pseudoLocalizer`,
 * which `mountSavePanel` accepts and `ui-shell.spec.ts` uses for the save
 * panel alone — one of eight player-facing surfaces, as
 * `docs/research/audit-2026-08-26/06-frontend-ux-a11y.md` (UXA-19) recorded.
 *
 * ## Why the locale is injected over the wire rather than wired into `src/`
 *
 * `src/main.ts` constructs the page's one `Localizer` with `DEFAULT_LOCALE`
 * and there is no runtime locale switch. Adding one to reach a test locale
 * would put a route to `en-XA` in front of players, which `locale.ts` says
 * must never happen. So the sweep rewrites the module Vite serves, in the
 * browser context only: production code is untouched by it.
 *
 * The rewrite asserts its own substitutions landed, and the first thing each
 * test does is confirm a known catalogue string came back bracketed. A sweep
 * whose instrumentation silently missed would report a page of ordinary
 * English as a page of defects — or, once a `.replace` stops matching, report
 * a clean page because nothing was transformed at all.
 */

const APP_URL = '/index.html';

/** What `pseudo.ts` wraps every catalogue message in. */
const OPEN_MARKER = '⟦';
const CLOSE_MARKER = '⟧';

/**
 * The shape `Localizer.format` returns for a key it could not resolve: the key
 * itself, unbracketed. A different defect from a hard-coded string, so it is
 * counted separately and is the one thing this file asserts on.
 */
const KEY_SHAPED = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;

interface ReadableString {
  readonly state: string;
  readonly kind: 'text' | 'attribute' | 'document';
  readonly where: string;
  readonly text: string;
  /** The ASCII words found in it, joined — the thing a translator would see in English. */
  readonly residue: string;
  /** True when those words sit inside `⟦ … ⟧`, i.e. they arrived as a parameter. */
  readonly bracketed: boolean;
}

/** Every state every test swept, gathered so one report covers the run. */
const inventory: ReadableString[] = [];
const statesVisited: string[] = [];

async function installPseudoLocale(page: Page): Promise<void> {
  await page.route('**/src/main.ts', async (route) => {
    const response = await route.fetch();
    const source = await response.text();

    const importPattern = /import \{ defaultMessageCatalogEn \} from "([^"]*localization\/index\.ts)";/;
    /*
     * `bundledLocalizer`, not `localizer`, since #662 wired the catalogue
     * delivery route: `src/main.ts` builds the bundled English localizer under
     * that name and then resolves the page's own `localizer` from it through
     * `resolveStartupLocale`, which is what lets a Polish browser boot Polish.
     *
     * **The patch still works on the same one construction, and the reason is
     * worth stating because it is a property of production code rather than of
     * this rewrite.** `resolveStartupLocale` returns the caller's instance
     * *untouched* when the browser's preferences resolve to the bundled
     * default, rather than re-tagging it with `withLocale('en')` -- so the
     * `en-XA` localizer patched in below survives the resolution this sweep's
     * Chromium triggers. Its docblock names this spec as the caller that
     * depends on it.
     */
    const constructorPattern =
      /const bundledLocalizer = new Localizer\(\{\s*locale: DEFAULT_LOCALE,\s*catalogs: \[defaultMessageCatalogEn\]\s*\}\);/;
    const ingestPattern =
      /typeof __LOCKSTATE_TELEMETRY_INGEST_PATH__ === "string" \? __LOCKSTATE_TELEMETRY_INGEST_PATH__ : undefined/;
    const environmentPattern =
      /typeof __LOCKSTATE_TELEMETRY_ENVIRONMENT__ === "string" \? __LOCKSTATE_TELEMETRY_ENVIRONMENT__ : undefined/;

    expect(source, 'the localization import to rewrite is still in the served module').toMatch(importPattern);
    expect(source, 'the single Localizer construction is still in the served module').toMatch(constructorPattern);
    // The browser Vite config passes no telemetry `define`, so these read as
    // undeclared globals and the consent prompt never mounts. #664 names that
    // prompt explicitly, so the sweep gives telemetry a destination.
    expect(source, 'the telemetry ingest guard is still in the served module').toMatch(ingestPattern);
    expect(source, 'the telemetry environment guard is still in the served module').toMatch(environmentPattern);

    const patched = source
      .replace(importPattern, 'import { defaultMessageCatalogEn, PSEUDO_LOCALE, buildPseudoLocaleCatalog } from "$1";')
      .replace(
        constructorPattern,
        'const bundledLocalizer = new Localizer({ locale: PSEUDO_LOCALE, ' +
          'catalogs: [defaultMessageCatalogEn, buildPseudoLocaleCatalog(defaultMessageCatalogEn)] });',
      )
      .replace(ingestPattern, '"/api/telemetry"')
      .replace(environmentPattern, '"development"');

    await route.fulfill({ response, body: patched });
  });
}

/**
 * Collects every readable run of text and every readable attribute value.
 *
 * ## The rule, and why the obvious rule is wrong
 *
 * The obvious detector deletes every `⟦ … ⟧` span and looks at what is left.
 * That is what the first version of this file did, and it is **blind to the
 * sharpest thing the pseudo-locale can see**: `pseudoLocalizeText` copies
 * `{placeholder}` spans through untouched, so an English *parameter* spliced
 * into a template appears *inside* the brackets, unaccented — and deleting
 * the span deletes the evidence with it. Measured: the save panel's
 * `⟦Çóúļđ ñóţ çřéáţé á ƥříšóñ: Simulation worker fault (already-initialized):
 * Kernel is already initialized.⟧` scored zero under that rule.
 *
 * The rule that holds instead is simpler and strictly stronger. `ACCENTS` in
 * `pseudo.ts` maps **every** ASCII letter, upper and lower, and the padding is
 * `·`. So no character of any catalogue-derived string is an ASCII letter, and
 * every run of two or more ASCII letters anywhere on the page is exactly one
 * of three things: a hard-coded string, a key that resolved to nothing, or an
 * interpolated parameter. Two rather than one, because a lone ASCII letter is
 * far more often part of a number, a unit or an id than a word.
 *
 * **Since #664 those three are separable rather than merely countable**, and
 * this file has not been changed to take advantage of it. `pseudoLocalizeText`
 * now writes `⟨ ⟩` around each placeholder span, so ASCII inside `⟨ ⟩` is a
 * parameter, ASCII elsewhere inside `⟦ ⟧` is a fragment concatenated into a
 * message, and ASCII outside both never reached the catalogue --
 * `tests/helpers/pseudo-locale-residue.ts` is that classifier, with a control
 * per class. The `residue` and `bracketed` fields below still carry the older,
 * coarser answer; replacing them means moving the classification out of
 * `page.evaluate` and into Node, which is a change to a spec that has to be
 * re-run against a browser to be worth anything.
 */
async function sweep(page: Page, state: string): Promise<void> {
  statesVisited.push(state);
  const found = await page.evaluate(
    ({ open, close, stateName }) => {
      const results: {
        state: string;
        kind: 'text' | 'attribute' | 'document';
        where: string;
        text: string;
        residue: string;
        bracketed: boolean;
      }[] = [];
      const asciiWords = /[A-Za-z]{2,}/g;

      const describe = (element: Element): string => {
        const parts: string[] = [];
        let current: Element | null = element;
        for (let depth = 0; current !== null && depth < 4; depth += 1) {
          const classes = current.className;
          const asText =
            typeof classes === 'string' && classes.trim().length > 0
              ? `.${classes.trim().split(/\s+/).join('.')}`
              : '';
          const id = current.id.length > 0 ? `#${current.id}` : '';
          parts.unshift(`${current.tagName.toLowerCase()}${id}${asText}`);
          current = current.parentElement;
        }
        return parts.join(' > ');
      };

      const consider = (kind: 'text' | 'attribute' | 'document', where: string, text: string): void => {
        const words = text.match(asciiWords);
        if (words === null) return;
        results.push({
          state: stateName,
          kind,
          where,
          text: text.trim(),
          residue: words.join(' '),
          bracketed: text.includes(open) && text.includes(close),
        });
      };

      if (document.title.length > 0) consider('document', '<title>', document.title);
      const lang = document.documentElement.getAttribute('lang');
      if (lang !== null) consider('document', '<html lang>', lang);

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null) continue;
        if (parent.closest('script,style,noscript') !== null) continue;
        const value = node.nodeValue ?? '';
        if (value.trim().length === 0) continue;
        consider('text', describe(parent), value);
      }

      const attributeNames = ['title', 'aria-label', 'aria-placeholder', 'aria-valuetext', 'alt', 'placeholder'];
      for (const element of Array.from(document.body.querySelectorAll('*'))) {
        for (const name of attributeNames) {
          const value = element.getAttribute(name);
          if (value === null || value.trim().length === 0) continue;
          consider('attribute', `${describe(element)} [${name}]`, value);
        }
      }

      return results;
    },
    { open: OPEN_MARKER, close: CLOSE_MARKER, stateName: state },
  );
  inventory.push(...found);
}

/**
 * Opens every folded disclosure on the *visible* panel.
 *
 * `:visible` is not decoration. Every tab's panel stays in the DOM when
 * another tab is selected, so an unscoped selector finds folded headers on
 * four panels that are off screen and waits for ever for one to be clickable.
 */
async function expandEverythingVisible(page: Page): Promise<void> {
  for (let pass = 0; pass < 16; pass += 1) {
    const folded = page.locator('.hud .ui-section__header[aria-expanded="false"]:visible').first();
    if ((await folded.count()) === 0) return;
    await folded.click({ timeout: 10_000 });
  }
}

async function openApp(page: Page): Promise<void> {
  await installPseudoLocale(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL);
  await page.waitForSelector('#game-root canvas');
  await page.waitForSelector('.hud');
  await page.waitForSelector('.save-panel');
  // The instrumentation is load-bearing, so nothing is concluded from a clean
  // sweep until a known catalogue string is seen coming back transformed.
  await expect(page.locator('.save-panel__heading')).toContainText(OPEN_MARKER);
}

async function walkTabs(page: Page, label: string): Promise<void> {
  for (const tab of HUD_TAB_IDS) {
    await page.locator(`.ui-tab[data-tab="${tab}"]`).click();
    await expandEverythingVisible(page);
    await sweep(page, `${label}: ${tab} tab, every section open`);
  }
}

test.describe('the assembled application under the pseudo-locale (#664)', () => {
  test.slow();

  test('with no session: boot, the consent prompt, a refusal and every tab', async ({ page }) => {
    await openApp(page);
    await sweep(page, 'no session: first paint');

    const consent = page.locator('.telemetry-consent');
    expect(await consent.count(), 'the consent prompt mounted, so it can be swept').toBe(1);
    await sweep(page, 'no session: telemetry consent prompt');
    // Dismissed before anything else: it overlays the HUD and intercepts every
    // press underneath it.
    await consent.locator('.telemetry-consent__action').nth(1).click();
    await expect(consent).toHaveCount(0);
    await sweep(page, 'no session: consent declined');

    // A refusal, which is player-facing text on a path nothing else reaches.
    await page.locator('.hud-strip__transport button').first().click();
    await expect(page.locator('.hud__refusal')).toBeVisible();
    await sweep(page, 'no session: transport refused');

    // The interface-scale control, both readings.
    const scale = page.locator('.hud [class*="display-scale"] button, .hud button[class*="scale"]').first();
    if ((await scale.count()) > 0) {
      await scale.click();
      await sweep(page, 'no session: interface scale changed');
    }

    await walkTabs(page, 'no session');
  });

  test('with a prison: a populated save panel, every tab and a running clock', async ({ page }) => {
    await openApp(page);
    const consent = page.locator('.telemetry-consent');
    if ((await consent.count()) > 0) {
      await consent.locator('.telemetry-consent__action').nth(1).click();
      await expect(consent).toHaveCount(0);
    }

    /*
     * The prison is created BEFORE any tab is touched, and that ordering is
     * not a preference.
     *
     * Measured on this branch against the *unmodified* application: on a
     * freshly loaded page with no session, one click on any `.ui-tab` makes
     * the next `New prison` fail with
     * `Could not create a prison: Simulation worker fault
     * (already-initialized): Kernel is already initialized.` A second press
     * then succeeds. Handed over as an observation on #664's branch; this test
     * routes around it rather than asserting on it, because it is not what
     * #664 is about.
     */
    await page.locator('.save-panel__create').click();
    await expect(page.locator('.save-panel__item-label').first()).toBeVisible();
    await expect
      .poll(async () => page.locator('.hud-clock__day').textContent(), { timeout: 30_000 })
      .not.toBe('--');
    await sweep(page, 'session: prison created, save panel populated');

    // An explicit save, so the save panel's own status and detail lines are
    // swept in their written-to state rather than only at idle.
    await page.locator('.save-panel__actions .save-panel__button').first().click();
    await sweep(page, 'session: save now pressed');

    await walkTabs(page, 'session, clock stopped');

    // Play, so counts, rosters, the intake queue and any alert have content.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(15_000);
    await walkTabs(page, 'session, clock running');
  });

  /**
   * The states that only exist once the prison has people and things in it:
   * a staff roster with rows, an intake queue, a prisoner roster, alerts.
   *
   * Rows are where a hard-coded string is most likely to survive a key audit,
   * because a row's text is assembled at runtime from simulation data rather
   * than declared as a `*Key` constant anywhere a scan could find it.
   */
  test('with a populated prison: rosters, intake and alerts', async ({ page }) => {
    await openApp(page);
    const consent = page.locator('.telemetry-consent');
    if ((await consent.count()) > 0) {
      await consent.locator('.telemetry-consent__action').nth(1).click();
      await expect(consent).toHaveCount(0);
    }
    await page.locator('.save-panel__create').click();
    await expect(page.locator('.save-panel__item-label').first()).toBeVisible();
    await expect
      .poll(async () => page.locator('.hud-clock__day').textContent(), { timeout: 30_000 })
      .not.toBe('--');

    // Fast forward, so intake, wages and incidents have time to happen.
    await page.locator('.hud-strip__transport button').nth(2).click();

    await page.locator('.ui-tab[data-tab="manage"]').click();
    await expandEverythingVisible(page);
    const hire = page.locator('.hud-staff__hire');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if ((await hire.count()) === 0) break;
      await hire.first().click();
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(60_000);

    await walkTabs(page, 'populated prison');
    console.log(
      `PSEUDO-LOCALE SWEEP :: staff roster rows = ${await page.locator('.hud-staff__roster .hud-staff__held-row[data-staff]').count()}`,
    );
    await page.locator('.ui-tab[data-tab="day-plan"]').click();
    await expandEverythingVisible(page);
    await sweep(page, 'populated prison: regime, second pass');
  });

  /**
   * The Build and Rooms panels with work in them: a construction queue, a
   * pending material delivery and a room waiting to be confirmed.
   *
   * Three blocks whose rows exist only in this state — `.hud-build__queue`,
   * `.hud-build__deliveries` and the Rooms panel's pending-area readout — and
   * `docs/research/audit-2026-08-26/06-frontend-ux-a11y.md` (UXA-16) put
   * hard-coded literals in exactly this panel, so the state is worth the
   * setup.
   */
  test('with work in progress: the build queue, a delivery and a pending room', async ({ page }) => {
    await openApp(page);
    const consent = page.locator('.telemetry-consent');
    if ((await consent.count()) > 0) {
      await consent.locator('.telemetry-consent__action').nth(1).click();
      await expect(consent).toHaveCount(0);
    }
    await page.locator('.save-panel__create').click();
    await expect(page.locator('.save-panel__item-label').first()).toBeVisible();
    await expect
      .poll(async () => page.locator('.hud-clock__day').textContent(), { timeout: 30_000 })
      .not.toBe('--');

    await page.locator('.ui-tab[data-tab="build"]').click();
    const coordinates = page.locator('.hud-build__coordinates > .ui-section__header');
    if ((await coordinates.getAttribute('aria-expanded')) === 'false') await coordinates.click();
    const fields = page.locator('.hud-build__coordinates .ui-number__input');
    for (const tileY of [5, 6, 7, 8, 9, 10]) {
      await fields.nth(0).fill('5');
      await fields.nth(1).fill(String(tileY));
      await page.locator('.hud-build__coordinates .ui-action').click();
    }

    // Bought material that has not arrived yet.
    await page.locator('.hud-build__buy-toggle').click();
    await page.locator('.hud-build__buy .ui-number__input').first().fill('4');
    await page.locator('.hud-build__buy-submit').click();

    // The clock has to run for an order to be taken up at all.
    await page.locator('.hud-strip__transport button').nth(1).click();
    await page.waitForTimeout(4_000);
    await page.locator('.hud-strip__transport button').first().click();
    await expandEverythingVisible(page);
    await sweep(page, 'work in progress: build panel with a queue and a delivery');
    console.log(
      `PSEUDO-LOCALE SWEEP :: build queue rows = ${await page.locator('.hud-build__queue-list > *').count()}, ` +
        `delivery rows = ${await page.locator('.hud-build__deliveries [data-delivery], .hud-build__deliveries li').count()}`,
    );

    // A room waiting to be confirmed, through the panel's typed route.
    await page.locator('.ui-tab[data-tab="zones"]').click();
    const roomCoordinates = page.locator('.hud-rooms__coordinates > .ui-section__header');
    if ((await roomCoordinates.getAttribute('aria-expanded')) === 'false') await roomCoordinates.click();
    const roomFields = page.locator('.hud-rooms__coordinates .ui-number__input');
    const roomFieldCount = await roomFields.count();
    for (let index = 0; index < roomFieldCount; index += 1) {
      await roomFields.nth(index).fill(index < 2 ? '12' : '4');
    }
    await page.locator('.hud-rooms__coordinates-submit').click();
    await expandEverythingVisible(page);
    await sweep(page, 'work in progress: rooms panel with a pending area');
    console.log(
      `PSEUDO-LOCALE SWEEP :: rooms confirm visible = ${await page.locator('.hud-rooms__confirm').isVisible()}`,
    );
  });

  /**
   * A save-panel failure, which is the one player-facing surface that renders
   * text it did not author: `save.status.create-failed` takes a `{reason}`, and
   * a reason is whatever the worker or IndexedDB said.
   *
   * The route to one is the defect handed over above — a tab press before the
   * first `New prison`. Nothing here asserts on that; the sequence is a way to
   * reach a state, and if the defect is fixed the state simply stops appearing
   * and the sweep records that it did.
   */
  test('with a failure: what a save-panel error line renders', async ({ page }) => {
    await openApp(page);
    const consent = page.locator('.telemetry-consent');
    if ((await consent.count()) > 0) {
      await consent.locator('.telemetry-consent__action').nth(1).click();
      await expect(consent).toHaveCount(0);
    }
    await page.locator('.ui-tab[data-tab="build"]').click();
    await page.locator('.save-panel__create').click();
    await page.waitForTimeout(2_000);
    await sweep(page, 'failure: save panel status after a refused create');
    console.log(
      `PSEUDO-LOCALE SWEEP :: save panel status was ${JSON.stringify(await page.locator('.save-panel__status').textContent())}`,
    );
  });

  test.afterAll(() => {
    const unique = new Map<string, ReadableString>();
    for (const finding of inventory) {
      const identity = `${finding.kind}|${finding.where}|${finding.residue}`;
      if (!unique.has(identity)) unique.set(identity, finding);
    }
    const distinct = [...unique.values()].sort((left, right) => left.residue.localeCompare(right.residue));
    const keyShaped = distinct.filter((entry) => !entry.bracketed && KEY_SHAPED.test(entry.text));

    // The report is the deliverable (#664 says so in as many words), so it is
    // printed rather than asserted away.
    console.log(
      `PSEUDO-LOCALE SWEEP :: ${statesVisited.length} states, ${inventory.length} raw hits, ${distinct.length} distinct readable strings`,
    );
    for (const entry of distinct) {
      const via = entry.bracketed ? 'interpolated into a catalogue string' : 'not from the catalogue at all';
      console.log(`PSEUDO-LOCALE SWEEP :: [${entry.kind}] ${JSON.stringify(entry.residue)} — ${via}`);
      console.log(`PSEUDO-LOCALE SWEEP ::     at ${entry.where}`);
      console.log(`PSEUDO-LOCALE SWEEP ::     first seen in ${entry.state}`);
      console.log(`PSEUDO-LOCALE SWEEP ::     full text ${JSON.stringify(entry.text)}`);
    }
    console.log(`PSEUDO-LOCALE SWEEP :: ${keyShaped.length} of those are key-shaped (a key that resolved to nothing)`);
  });

  test('no key rendered as its own name anywhere the sweep went', () => {
    const keyShaped = inventory.filter((entry) => !entry.bracketed && KEY_SHAPED.test(entry.text));
    expect(inventory.length + statesVisited.length, 'the sweep above actually ran').toBeGreaterThan(0);
    expect([...new Set(keyShaped.map((entry) => `${entry.text} @ ${entry.where}`))]).toEqual([]);
  });

  /**
   * The gap this file's own docblock names and had left open: the sweep
   * *collects* "anything still readable is text that never passed through the
   * catalogue" (the paragraph beginning "Before this file the locale was
   * reachable from exactly two places"), but until this test only one shape of
   * that -- a key that resolved to nothing -- was ever asserted on. A
   * hard-coded English sentence with no `.` in it, like
   * `aria-label="Lockstate game application"` was on `index.html:11`, is not
   * key-shaped: `KEY_SHAPED` requires a dotted identifier, and "Lockstate game
   * application" has none. It printed in every run's `PSEUDO-LOCALE SWEEP ::`
   * report, in the `[attribute]` line for `main#app`, "not from the catalogue
   * at all" in as many words -- and nothing above ever failed on it. That
   * string now resolves through `app.shell.label`
   * (`src/content/default-locale-en.ts`, `src/ui/app-shell-messages.ts`,
   * applied at `src/main.ts`), so it comes back bracketed like everything
   * else the catalogue owns; this test is what stops the next one from
   * printing quietly instead.
   *
   * Two exemptions, both document-level and both deliberate rather than
   * loosened to make room for a failure:
   *
   * - `document.title` (`kind: 'document'`, `where: '<title>'`). The owner's
   *   ruling that opened this change is explicit that the title stays exactly
   *   as it is -- `Lockstate.io` is the brand name, not player-facing prose,
   *   and routing it through the catalogue was never asked for.
   * - `<html lang>` (`kind: 'document'`, `where: '<html lang>'`). It is a BCP
   *   47 tag rather than prose: it names no catalogue entry, so there is no
   *   entry for it to be missing from, and no translator ever sees it.
   *
   *   **The reason given here used to be "there is no runtime locale switch",
   *   and that half is out of date since #663 while the exemption is not.**
   *   `src/main.ts` now writes this attribute from the locale that actually
   *   resolved, so under this sweep it reads `en-XA` rather than `en` --
   *   which is a fact about the page and still not a string a translator would
   *   see. (There is still no *in-place* switch: a language change reloads,
   *   see `docs/adr/0119-how-a-language-change-reaches-a-running-page.md`,
   *   and `installPseudoLocale`'s comment above is still why the sweep has to
   *   rewrite the served module to reach `en-XA` at all.)
   *
   * Every other finding the sweep collects is either bracketed -- reached
   * through the catalogue, `Localizer.format` having produced it -- or it is
   * exactly the leak this test exists to catch. A generated prisoner or staff
   * name is not a third exemption: `roster-panel.ts` interpolates it into
   * `HUD_MESSAGE_KEY.regimeRosterName` via `t(...)`, so it arrives bracketed
   * (the template's `⟦ … ⟧` wraps the whole rendered string, name included --
   * the "second class" of finding this file's own docblock describes under
   * "Why the obvious rule is wrong"), not as a bare string this test would see
   * at all.
   */
  test('no hard-coded English reaches the page outside document.title and <html lang>', () => {
    const leaked = inventory.filter((entry) => entry.kind !== 'document' && !entry.bracketed);
    expect(inventory.length + statesVisited.length, 'the sweep above actually ran').toBeGreaterThan(0);
    expect(
      [...new Set(leaked.map((entry) => `${JSON.stringify(entry.residue)} @ ${entry.where}`))],
      'readable English reached the page without passing through the catalogue',
    ).toEqual([]);
  });
});
