import { expect, test, type Page } from './network-changed-fixture';
import { EMPTY_HUD_VIEW_MODEL } from '../../src/ui/hud';
import type {
  HudContrabandViewModel,
  HudIncidentDetailViewModel,
  HudIncidentsViewModel,
  HudSecurityViewModel,
} from '../../src/ui/hud';
import './ui-harness-api';

/**
 * The Security section, on a real page (2026-09-17).
 *
 * Three things live here because nothing below this layer can prove them.
 *
 * **Which empty sentence is on screen.** The panel has four of them -- one for
 * "nothing has reported", one for a log holding nothing, one for a log whose
 * every entry is terminal, and one for an empty confiscation record -- and
 * `AGENTS.md`'s fourth reservation is about exactly this: the wording is ours
 * since 2026-09-04 and the requirement that the sentence be TRUE is not. A
 * headless assertion on the composing function proves the branch and not that
 * the branch's sentence is the one a player reads, which is the failure #218
 * section 6.6 recorded for a whole region: rendered text is not on-screen text.
 *
 * **The rail at four viewports.** Stage 5 of the identity rollout says nothing
 * may be unreachable at any viewport, and a panel's height against its own box
 * is a fact about a laid-out page. These are the four the brief names, which
 * are four of the five `HUD_LAYOUT_VIEWPORTS` holds.
 *
 * **That a row is a control.** The incident rows are pooled `div`s carrying
 * `role="radio"`, written and unwritten by the paint -- the arrangement
 * `regime-panel.ts` uses, and it is a browser fact that a vacated one is no
 * longer focusable.
 */

const HARNESS_URL = '/tests/browser/ui-harness.html';

/** The four viewports this section is measured at. */
const VIEWPORTS = [
  [375, 812],
  [900, 600],
  [1024, 768],
  [1440, 900],
] as const;

const SECURITY: HudSecurityViewModel = {
  sectors: [
    {
      sectorId: 'sector.default',
      gradeLabelKey: 'security-grade.standard.name',
      controlStateLabelKey: 'sector-control-state.normal.name',
      underLockdown: false,
      required: 2,
      assigned: 1,
      shortage: 1,
      openIncidentCount: 1,
    },
  ],
  sectorsUnderLockdown: 0,
  sectorsRestricted: 0,
  shortage: 1,
};

const OPEN_INCIDENT = {
  incidentId: 'incident.1',
  typeLabelKey: 'incident-type.assault.name',
  stateLabelKey: 'incident-state.active.name',
  sectorId: 'sector.default',
  severity: 8,
  severityMax: 10,
  participantCount: 3,
  terminal: false,
} as const;

/**
 * The same incident with the grade word the projection resolved for its
 * sector (owner ruling 2026-09-21).
 *
 * `grade.general.name` is a real catalog key and its English word is
 * *General*, so the row reads *"Assault in General"*. Both this and
 * `OPEN_INCIDENT` are kept, because the rule has two arms and the arm
 * without a key is the one a sector whose grade the catalog does not define
 * still has to land on.
 */
const OPEN_INCIDENT_GRADED = {
  ...OPEN_INCIDENT,
  sectorGradeLabelKey: 'grade.general.name',
} as const;

const INCIDENTS_OPEN_GRADED: HudIncidentsViewModel = {
  open: [OPEN_INCIDENT_GRADED],
  total: 3,
  stillOpen: 1,
  resolved: 1,
  lapsed: 1,
  injured: 2,
  escapes: 0,
  byType: [{ typeLabelKey: 'incident-type.assault.name', count: 3 }],
};

const DETAIL_GRADED: HudIncidentDetailViewModel = {
  ...OPEN_INCIDENT_GRADED,
  timeline: [
    { stateLabelKey: 'incident-state.reported.name', atTick: 120 },
    { stateLabelKey: 'incident-state.active.name', atTick: 128 },
  ],
  injuredCount: 0,
  propertyDamage: 0,
  propertyDamageMax: 10,
  escaped: false,
  requiredResponders: 2,
};

const INCIDENTS_OPEN: HudIncidentsViewModel = {
  open: [OPEN_INCIDENT],
  total: 3,
  stillOpen: 1,
  resolved: 1,
  lapsed: 1,
  injured: 2,
  escapes: 0,
  byType: [{ typeLabelKey: 'incident-type.assault.name', count: 3 }],
};

/** A log holding nothing at all. */
const INCIDENTS_NEVER: HudIncidentsViewModel = {
  open: [],
  total: 0,
  stillOpen: 0,
  resolved: 0,
  lapsed: 0,
  injured: 0,
  escapes: 0,
  byType: [],
};

/** A log whose every entry is terminal -- and one of them lapsed. */
const INCIDENTS_ALL_CLOSED: HudIncidentsViewModel = {
  open: [],
  total: 4,
  stillOpen: 0,
  resolved: 3,
  lapsed: 1,
  injured: 5,
  escapes: 1,
  byType: [{ typeLabelKey: 'incident-type.riot.name', count: 4 }],
};

const DETAIL: HudIncidentDetailViewModel = {
  ...OPEN_INCIDENT,
  timeline: [
    { stateLabelKey: 'incident-state.reported.name', atTick: 120 },
    { stateLabelKey: 'incident-state.active.name', atTick: 128 },
  ],
  injuredCount: 0,
  propertyDamage: 0,
  propertyDamageMax: 10,
  escaped: false,
  requiredResponders: 2,
};

const CONTRABAND: HudContrabandViewModel = {
  searches: [
    {
      orderId: 'search.1',
      scopeLabelKey: 'search-scope.cell.name',
      stateLabelKey: 'search-order-state.queued.name',
      queued: true,
      currentTargetIndex: 0,
      targetCount: 4,
    },
  ],
  foundByCategory: [{ categoryId: 'contraband.blade', categoryLabelKey: 'contraband.blade.name', count: 2 }],
  itemsDiscovered: 2,
  itemsMissed: 1,
  searchesQueued: 1,
  searchesActive: 0,
};

const CONTRABAND_CLEAN: HudContrabandViewModel = {
  searches: [],
  foundByCategory: [],
  itemsDiscovered: 0,
  itemsMissed: 0,
  searchesQueued: 0,
  searchesActive: 0,
};

/**
 * What the panel is fed.
 *
 * Built from `EMPTY_HUD_VIEW_MODEL` rather than read back off the harness,
 * deliberately: this section's whole subject is the difference between "the
 * prison said nothing" and "the prison said nothing is wrong", and a fixture
 * that inherited a populated prison from the harness's own base view model
 * would be testing the second while claiming the first.
 */
type SectionFields = {
  readonly security?: HudSecurityViewModel;
  readonly incidents?: HudIncidentsViewModel;
  readonly incidentDetail?: HudIncidentDetailViewModel;
  readonly contraband?: HudContrabandViewModel;
};

async function feed(page: Page, view: SectionFields): Promise<void> {
  await page.evaluate(
    ([base, next]) => {
      window.lockstateUiHarness.setHudViewModel({ ...base, ...next } as never);
    },
    [EMPTY_HUD_VIEW_MODEL, view] as const,
  );
}

async function openSection(page: Page, view: SectionFields): Promise<void> {
  await page.evaluate(() => window.lockstateUiHarness.mountHudShell());
  await page.evaluate(() => window.lockstateUiHarness.clickTab('security'));
  await feed(page, view);
}

/** The panel's text as a player reads it -- `innerText`, so it answers the visibility question itself. */
const sectionText = (page: Page): Promise<string> =>
  page.evaluate(() => (document.querySelector('.hud-security') as HTMLElement | null)?.innerText ?? '');

test.describe('the Security section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HARNESS_URL);
  });

  /**
   * The state a player arrives in on a page whose worker has not answered yet.
   *
   * One sentence, and it is the one the alerts list and the Overview readout
   * already use for the same state, so a player who has learnt it on one
   * surface has learnt it here.
   */
  test('says nothing is reporting, rather than that nothing is wrong', async ({ page }) => {
    await openSection(page, {});

    expect(await page.evaluate(() => window.lockstateUiHarness.laidOut('.hud-security'))).toBe(true);
    const text = await sectionText(page);
    expect(text).toContain('No prison is reporting.');
    // And none of the three record sentences, which would each be a claim about
    // a prison that has said nothing.
    expect(text).not.toContain('Nothing has been recorded yet.');
    expect(text).not.toContain('Nothing is open.');
    expect(text).not.toContain('Nothing has been confiscated.');
  });

  /**
   * The two empty incident states, which read differently because they are
   * different facts.
   *
   * This is the assertion `AGENTS.md`'s fourth reservation buys: a panel that
   * printed one sentence for both would tell a player whose prison has had four
   * incidents -- one of which *lapsed*, meaning nobody responded in time -- the
   * same thing it tells a player whose prison has had none.
   */
  test('tells an empty log apart from a log with nothing open', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_NEVER, contraband: CONTRABAND_CLEAN });
    const never = await sectionText(page);
    expect(never).toContain('Nothing has been recorded yet.');
    expect(never).not.toContain('Nothing is open.');

    await feed(page, { security: SECURITY, incidents: INCIDENTS_ALL_CLOSED, contraband: CONTRABAND_CLEAN });

    const closed = await sectionText(page);
    expect(closed).toContain('Nothing is open. 4 recorded so far.');
    expect(closed).not.toContain('Nothing has been recorded yet.');
    // The toll is on screen with it: four incidents that are over are not four
    // incidents that cost nothing.
    expect(closed).toContain('5 hurt, 1 got out');
  });

  test('keeps terminal incident facts on separate readable lines at Full HD', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_ALL_CLOSED, contraband: CONTRABAND_CLEAN });

    const lines = await page.locator('.hud-security__incidents > .ui-section__body').evaluate((body) => {
      const selectors = ['.hud-security__incident-summary', '.hud-security__note', '.hud-security__eyebrow'];
      return [...body.children]
        .filter((child) => selectors.some((selector) => child.matches(selector)) && !(child as HTMLElement).hidden)
        .map((child) => {
          const box = child.getBoundingClientRect();
          return { text: child.textContent, top: box.top, bottom: box.bottom, right: box.right };
        });
    });
    expect(lines.map((line) => line.text)).toEqual([
      '0 open of 4 recorded',
      '5 hurt, 1 got out',
      'Nothing is open. 4 recorded so far.',
      'By kind',
    ]);
    expect(lines).toHaveLength(4);
    for (let index = 1; index < lines.length; index += 1) {
      expect(lines[index]!.top, `line ${index} overlaps the one above it`).toBeGreaterThanOrEqual(lines[index - 1]!.bottom);
    }
  });

  /** The clean-record sentence, and that it is not painted when something was found. */
  test('says the confiscation record is empty only when it is', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_NEVER, contraband: CONTRABAND_CLEAN });
    expect(await sectionText(page)).toContain('Nothing has been confiscated.');

    await feed(page, { security: SECURITY, incidents: INCIDENTS_NEVER, contraband: CONTRABAND });

    const found = await sectionText(page);
    expect(found).not.toContain('Nothing has been confiscated.');
    expect(found).toContain('2 found, 1 missed');
    expect(found).not.toContain('No search is under way.');
  });

  /**
   * An open incident's row is a control, and a vacated pooled row is not.
   *
   * The second half is the one only a browser can answer, and it is what keeps
   * `app-shell.spec.ts`'s `#88` sweep green: four rows left focusable while
   * empty would be four controls that sweep can never hit-test in a prison
   * where nothing has gone wrong, which is the state it runs in.
   */
  test('gives a filled row a radio role and takes it off an empty one', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND });

    const filled = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.hud-security__incident-row')].map((row) => ({
        hidden: row.hidden,
        role: row.getAttribute('role'),
        tabIndex: row.getAttribute('tabindex'),
        incident: row.dataset['incident'] ?? null,
      })),
    );
    expect(filled).toHaveLength(4);
    expect(filled[0]).toEqual({ hidden: false, role: 'radio', tabIndex: '0', incident: 'incident.1' });
    expect(filled.slice(1).every((row) => row.hidden && row.role === null && row.tabIndex === null)).toBe(true);

    // And the list announces itself as a choice only while there is one.
    expect(await page.evaluate(() => document.querySelector('.hud-security__incident-list')?.getAttribute('role'))).toBe(
      'radiogroup',
    );
  });

  /** Pressing a row checks it and reports the selection to the host. */
  test('reports the incident the player pressed', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND });

    await page.locator('.hud-security__incident-row[data-incident="incident.1"]').click();
    expect(await page.evaluate(() => window.lockstateUiHarness.hudIntents())).toEqual([
      JSON.stringify({ kind: 'select-tab', tab: 'security' }),
      JSON.stringify({ kind: 'select-incident', incidentId: 'incident.1' }),
    ]);
    expect(
      await page.evaluate(() =>
        document.querySelector('.hud-security__incident-row[data-incident="incident.1"]')?.getAttribute('aria-checked'),
      ),
    ).toBe('true');
  });

  /**
   * The inspector paints only the answer about the incident that is selected.
   *
   * The outcome line is the one that must not appear for an open incident:
   * "0 hurt" would assert that it hurt nobody where what is true is that it has
   * not finished.
   */
  test('draws no outcome for an incident that has not finished', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND });
    await page.locator('.hud-security__incident-row[data-incident="incident.1"]').click();
    await feed(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND, incidentDetail: DETAIL });

    expect(await page.evaluate(() => window.lockstateUiHarness.laidOut('.hud-security__detail'))).toBe(true);
    const text = await sectionText(page);
    expect(text).toContain('Severity 8 of 10');
    // `Responders needed: 2`, not the `Response asks for 2 guards` this line
    // asserted until 2026-09-17. The string was reworded in
    // `default-locale-en.ts` before it shipped -- the first draft renders
    // *"1 guards"* for the commonest severity band, and the HUD's `t` is
    // `Localizer.format` rather than `formatPlural` -- and this assertion was
    // the one site that did not move with it.
    expect(text).toContain('Responders needed: 2');
    expect(text).toContain('at tick 128');
    expect(text).not.toContain('damage 0 of 10');
  });

  /**
   * Where an incident is, as a player reads it (owner ruling 2026-09-21).
   *
   * Until that ruling this row printed the sector's **internal id** --
   * *"Assault in security-sector.prison"* -- which was the only place in the
   * HUD a player saw one, and it read as debug output. The owner chose
   * *"Nazwać stopniem, jak blok wyżej"*: name it by its grade, the rule the
   * sectors block one element up already follows.
   *
   * This is a browser assertion rather than a headless one for the reason
   * this file's header gives: rendered text is not on-screen text, and the
   * claim being made is about what a player reads.
   *
   * **A grade is not a place**, and the owner was told so before choosing.
   * Nothing here hides that: the word on screen is the grade's.
   */
  test('names the sector by its grade rather than by its id', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN_GRADED, contraband: CONTRABAND });
    await page.locator('.hud-security__incident-row[data-incident="incident.1"]').click();
    await feed(page, {
      security: SECURITY,
      incidents: INCIDENTS_OPEN_GRADED,
      contraband: CONTRABAND,
      incidentDetail: DETAIL_GRADED,
    });

    const text = await sectionText(page);
    expect(text).toContain('Assault in General');
    // The id is gone from the row and from the inspector heading. It is still
    // the row's browser handle -- `data-incident` and `data-sector` are
    // attributes, not text -- which `sectionText` cannot see and a player
    // cannot either.
    expect(text).not.toContain('sector.default');
  });

  /**
   * The other arm of the same rule, which is the one that must not be lost.
   *
   * A sector whose grade the content catalog does not define reaches the panel
   * with no grade key at all, and the row then says the id rather than saying
   * nothing -- `formatPrisonerName`'s rule for an unnamed prisoner. A test for
   * the happy arm alone would pass against a panel that printed an empty
   * string here.
   */
  test('falls back to the sector id when no grade word reached the panel', async ({ page }) => {
    await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND });
    await page.locator('.hud-security__incident-row[data-incident="incident.1"]').click();
    await feed(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND, incidentDetail: DETAIL });

    const text = await sectionText(page);
    expect(text).toContain('Assault in sector.default');
    expect(text).not.toContain('Assault in General');
  });

  /**
   * The rail at the four viewports the 2026-09-17 brief names.
   *
   * Two assertions per viewport and they are different questions. The first is
   * containment: the panel's box inside the viewport, horizontally, which is
   * what a rail that has run out of width fails. The second is reachability:
   * every control the panel holds hit-tested at its own centre, which is what a
   * panel taller than its own scroll box fails -- and the panel is
   * `overflow-y: auto`, so a control below the fold is scrolled to rather than
   * lost, which is exactly what this measures.
   */
  for (const [width, height] of VIEWPORTS) {
    test(`every control in the section is reachable at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openSection(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND });
      await feed(page, { security: SECURITY, incidents: INCIDENTS_OPEN, contraband: CONTRABAND, incidentDetail: DETAIL });

      const box = await page.evaluate(() => {
        const panel = document.querySelector('.hud-security') as HTMLElement;
        const rect = panel.getBoundingClientRect();
        return {
          left: Math.round(rect.left * 100) / 100,
          right: Math.round(rect.right * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          scrollHeight: panel.scrollHeight,
          clientHeight: panel.clientHeight,
        };
      });
      console.log(`[security] ${width}x${height} panel ${JSON.stringify(box)}`);
      expect(box.left, `the Security panel starts outside the viewport at ${width}x${height}`).toBeGreaterThanOrEqual(0);
      expect(box.right, `the Security panel ends outside the viewport at ${width}x${height}`).toBeLessThanOrEqual(width);

      const controls = page.locator('.hud-security button, .hud-security [role="radio"]');
      const count = await controls.count();
      // Non-vacuity: two fold headers and one filled incident row, at every
      // viewport. A selector that stopped matching would make the loop below
      // green by running nothing.
      expect(count, `found ${count} controls in the Security panel at ${width}x${height}`).toBeGreaterThanOrEqual(3);
      for (let index = 0; index < count; index += 1) {
        const control = controls.nth(index);
        await control.scrollIntoViewIfNeeded();
        const reachable = await control.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit !== null && (node.contains(hit) || hit.contains(node));
        });
        const name = await control.evaluate((node) => (node as HTMLElement).innerText.trim() || node.className);
        expect(reachable, `"${name}" cannot be pressed at ${width}x${height}`).toBe(true);
      }
    });
  }
});
