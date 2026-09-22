import { describe, expect, it } from 'vitest';
import type { LocalizationKey } from '../../src/content/localization';
import type { MessageParameters } from '../../src/services/localization/format';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { messageCatalogPl } from '../../src/services/localization/pl-catalog';
import { hudAlertDismissLabel, hudAlertRowLabel } from '../../src/ui/hud/alert-row-label';
import type { HudLabelLocalizer } from '../../src/ui/hud/label-parameters';
import { HUD_MESSAGE_KEY } from '../../src/ui/hud/messages';
import type { HudAlertViewModel } from '../../src/ui/hud/view-model';

/**
 * What a row of the alerts list actually says, once a row can stand for more
 * than one arrival (the owner's decisions 1 and 2 of 2026-09-01 on
 * [ADR 0084](../../docs/adr/0084-what-the-alerts-channel-owes-a-player.md)).
 *
 * **Tested here rather than in a browser because it is decidable here.**
 * `vitest.config.ts` sets `environment: 'node'` and there is no jsdom, so a
 * choice made inside `mountHud` is unreachable from `pnpm test` -- not merely
 * untested, which is the trap `docs/AGENT_WORKFLOW.md` records. The choices
 * are which fragments a row carries and in what order, and they were put in a
 * pure function so that this file could make them.
 *
 * **Two localizers, and the split is deliberate.** The spy asserts what this
 * function *decides* -- which key, with which parameters, in which order --
 * because that is what survives a re-wording. The real `Localizer` asserts what
 * a player actually reads, and it can, because the owner supplied both
 * sentences on 2026-09-01: `{count}×` and `Day {day}`. The third key,
 * `hud.alert.dismiss`, is still unauthored on purpose and
 * `tests/unit/ui-hud-messages.test.ts` fails by name until it is not, so the
 * one test below that touches it reads the key rather than the word.
 */

interface Rendered {
  readonly key: LocalizationKey;
  readonly parameters: MessageParameters | undefined;
  /** The count a plural lookup selected on, or `undefined` for a flat lookup. */
  readonly count?: number;
}

/**
 * The spy satisfies `HudLabelLocalizer` rather than being a bare `t`.
 *
 * `hudAlertRowLabel` took a function until the alerts path learned to select
 * a plural form; it needs `formatPlural` for the row's sentence and `format`
 * for the two fragments after it, so the two arrive together and the spy
 * records which of them was asked.
 */
function spyLocalizer(): {
  readonly localizer: HudLabelLocalizer;
  readonly rendered: readonly Rendered[];
} {
  const rendered: Rendered[] = [];
  return {
    rendered,
    localizer: {
      format: (key, parameters) => {
        rendered.push({ key, parameters });
        return `<${key}>`;
      },
      formatPlural: (key, count, parameters) => {
        rendered.push({ key, parameters, count });
        return `<${key}:${count}>`;
      },
    },
  };
}

const ASSAULT: HudAlertViewModel = {
  id: 'event-1',
  labelKey: 'hud.alert.event.incidents.assault-opened',
  severity: 'danger',
  occurrences: {
    count: 1,
    firstSequence: 1,
    lastSequence: 1,
    statement: '{"type":"incidents.assault-opened"}',
  },
};

describe('what a row of the alerts list says', () => {
  it('says only the sentence when the prison has said it once', () => {
    // A row that has arrived once says so by being a row. `x1` on every line
    // would be noise on the many to serve the few.
    const { localizer, rendered } = spyLocalizer();
    expect(hudAlertRowLabel(localizer, ASSAULT)).toBe('<hud.alert.event.incidents.assault-opened>');
    expect(rendered.map((entry) => entry.key)).toEqual(['hud.alert.event.incidents.assault-opened']);
  });

  it('says how many times when the prison has said it more than once (decision 1)', () => {
    const { localizer, rendered } = spyLocalizer();
    const label = hudAlertRowLabel(localizer, { ...ASSAULT, occurrences: { ...ASSAULT.occurrences!, count: 3, lastSequence: 9 } });

    expect(label).toBe('<hud.alert.event.incidents.assault-opened> <hud.alert.occurrences>');
    // The count reaches the sentence as a parameter, so the owner's wording
    // decides where the figure sits and what stands beside it.
    expect(rendered[1]).toEqual({ key: HUD_MESSAGE_KEY.alertsOccurrences, parameters: { count: 3 } });
  });

  it('says when the newest of them happened, in the day and the position the strip counts (decision 2)', () => {
    const { localizer, rendered } = spyLocalizer();
    const label = hudAlertRowLabel(localizer, {
      ...ASSAULT,
      occurrences: { ...ASSAULT.occurrences!, count: 2, lastSequence: 4, lastAt: { day: 7, progressPercent: 25 } },
    });

    expect(label).toBe(
      '<hud.alert.event.incidents.assault-opened> <hud.alert.occurrences> <hud.alert.time>',
    );
    // Two figures and no clock face: there is no hour of the day in this game
    // to render (`docs/HUD_PROJECTIONS.md` gap 5).
    expect(rendered[2]).toEqual({ key: HUD_MESSAGE_KEY.alertsTime, parameters: { day: 7, progress: 25 } });
  });

  it('says when even for a row that has only happened once', () => {
    // The count is conditional and the time is not: "when did that happen" is
    // a question a single arrival raises exactly as a run does.
    const { localizer, rendered } = spyLocalizer();
    hudAlertRowLabel(localizer, { ...ASSAULT, occurrences: { ...ASSAULT.occurrences!, lastAt: { day: 1, progressPercent: 0 } } });
    expect(rendered.map((entry) => entry.key)).toEqual([
      'hud.alert.event.incidents.assault-opened',
      HUD_MESSAGE_KEY.alertsTime,
    ]);
  });

  it('says nothing about when while no session has reported a clock', () => {
    // `UNKNOWN_HUD_CLOCK` carries `dayLengthTicks: 0`, so the translator builds
    // no time at all rather than a day derived from a length nobody published.
    const { localizer, rendered } = spyLocalizer();
    hudAlertRowLabel(localizer, ASSAULT);
    expect(rendered.map((entry) => entry.key)).toEqual(['hud.alert.event.incidents.assault-opened']);
  });

  it('adds nothing at all to the other producer`s rows', () => {
    /*
     * A refusal row and a protocol-fault row are levels rather than runs -- the
     * refusal is republished unchanged up to twice a second and replaced by
     * ordinal, a fault stands per code -- so neither carries occurrences, and
     * neither grows a count or a time. Their own dismissal question is
     * `docs/HUD_PROJECTIONS.md` gap 34, which ADR 0084 did not reopen.
     */
    const { localizer, rendered } = spyLocalizer();
    const refusal: HudAlertViewModel = { id: 'refusal-7', labelKey: 'hud.alert.refusal.build.unowned-land', severity: 'warning' };
    expect(hudAlertRowLabel(localizer, refusal)).toBe('<hud.alert.refusal.build.unowned-land>');
    expect(rendered).toHaveLength(1);
  });

  it('resolves a message-valued parameter inside the sentence before anything is appended', () => {
    // ADR 0076's relocation notice and #683's escape both carry a `{name}`
    // that is itself a message. The count and the time are appended *after*
    // that resolution rather than substituted into it, so a row can carry both
    // without either mechanism knowing about the other.
    const { localizer, rendered } = spyLocalizer();
    const relocation: HudAlertViewModel = {
      id: 'event-4',
      labelKey: 'hud.alert.event.prisoners.relocated',
      severity: 'info',
      labelParameterMessages: {
        name: { key: 'hud.regime.roster-name', parameters: { given: 'Ada', family: 'Bell' } },
        room: { key: 'room.cell.name' },
      },
      occurrences: { count: 2, firstSequence: 4, lastSequence: 6, statement: 'relocated' },
    };

    hudAlertRowLabel(localizer, relocation);
    expect(rendered.map((entry) => entry.key)).toEqual([
      'hud.regime.roster-name',
      'room.cell.name',
      'hud.alert.event.prisoners.relocated',
      HUD_MESSAGE_KEY.alertsOccurrences,
    ]);
  });
});

describe('the two sentences the owner supplied on 2026-09-01', () => {
  const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });

  it('reads the whole line a player reads, through the shipped catalog', () => {
    // The row #741 was filed about: the same fight sentence three times in an
    // eight-row list, "with no tick, no in-game time and no `x3`". This is what
    // it says now.
    const label = hudAlertRowLabel(localizer, {
      ...ASSAULT,
      occurrences: { ...ASSAULT.occurrences!, count: 3, lastSequence: 9, lastAt: { day: 7, progressPercent: 25 } },
    });

    expect(label).toBe('A fight has broken out between two prisoners. 3× Day 7');
  });

  it('puts the multiplier after the figure, which is what the owner chose over `×{count}`', () => {
    const label = hudAlertRowLabel(localizer, { ...ASSAULT, occurrences: { ...ASSAULT.occurrences!, count: 12 } });
    expect(label.endsWith('12×'), label).toBe(true);
  });

  it('says the day and not a percentage of one, and renders the parameter it declines without a trace', () => {
    /*
     * The owner was shown `Day {day}, {progress}%` and rejected it: a
     * percentage of a day is a strange unit for a player. `{progress}` is still
     * produced, still passed, and deliberately unused -- so this asserts both
     * halves, that the figure reaches the sentence and that the sentence does
     * not spend it. `interpolate` substitutes only the placeholders a sentence
     * names, so an unused one must leave nothing behind at all.
     */
    const label = hudAlertRowLabel(localizer, {
      ...ASSAULT,
      occurrences: { ...ASSAULT.occurrences!, lastAt: { day: 4, progressPercent: 62 } },
    });

    expect(label).toBe('A fight has broken out between two prisoners. Day 4');
    expect(label, 'the percentage must not reach the screen in any form').not.toContain('62');
    expect(label).not.toContain('%');
  });

  it('tells two arrivals on one day apart by the count beside them, which is the owner`s answer for that gap', () => {
    // Two arrivals of one sentence on day 3 are one row that says so; two
    // *different* sentences on day 3 are two rows, each naming itself. Neither
    // needs a finer clock than the day.
    const twice = hudAlertRowLabel(localizer, {
      ...ASSAULT,
      occurrences: { ...ASSAULT.occurrences!, count: 2, lastAt: { day: 3, progressPercent: 10 } },
    });
    const once = hudAlertRowLabel(localizer, {
      ...ASSAULT,
      occurrences: { ...ASSAULT.occurrences!, lastAt: { day: 3, progressPercent: 90 } },
    });

    expect(twice).toBe('A fight has broken out between two prisoners. 2× Day 3');
    expect(once).toBe('A fight has broken out between two prisoners. Day 3');
  });
});

describe('the control that dismisses a row', () => {
  it('is named by its own key rather than by the staff roster`s word', () => {
    /*
     * `hud.security.roster-dismiss` is "Dismiss" and is **not** reused: that
     * word ends a staff member's employment -- its own hint says "a dismissed
     * staff member leaves the prison for good, and their wage stops" -- and one
     * key meaning both that and "I have read this notice" is two answers to one
     * question.
     *
     * Asserted on the key as well as on the word below, because the key is the
     * part that cannot drift into the roster's: a future sentence may be
     * re-worded, and this must still not become that one.
     */
    const { localizer, rendered } = spyLocalizer();
    expect(hudAlertDismissLabel((key) => localizer.format(key))).toBe('<hud.alert.dismiss>');
    expect(rendered).toEqual([{ key: HUD_MESSAGE_KEY.alertsDismiss, parameters: undefined }]);
  });

  it('says what it does without using the word that means something else here', () => {
    /*
     * The owner's sentence of 2026-09-01, chosen over "Dismiss this notice" for
     * the reason above: leaving **dismiss** meaning two things in one interface
     * is the defect, so the sentence avoids the verb rather than reusing it.
     *
     * The second assertion is the one that would catch the regression this key
     * exists to prevent, and it is deliberately about the *word* rather than
     * about the key -- a later re-wording that reached for "dismiss" again
     * would pass every other check in this file.
     */
    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const label = hudAlertDismissLabel((key, parameters) => localizer.format(key, parameters));

    expect(label).toBe('Clear this alert');
    expect(
      label.toLowerCase(),
      'the roster`s word ends an employment; this control retires a notice, and one interface must not use it for both',
    ).not.toContain('dismiss');
    // And it is a real name rather than the glyph: `createIconButton` renders
    // this as screen-reader text, and a button whose only content is an `x`
    // reaches a screen reader as nothing at all.
    expect(label).not.toBe('×');
    expect(label.trim().length).toBeGreaterThan(1);
  });
});

describe('the two counted alert sentences agree with their own number, in both shipped locales', () => {
  /*
   * The regression this change exists to prevent, asserted against the
   * **shipped catalogues** rather than a fixture, and through the function the
   * HUD actually calls.
   *
   * Before this change `hud.alert.event.incidents.riot-opened` was a flat
   * string and rendered *"A riot has broken out -- 1 prisoners have stopped
   * taking orders."* at one participant, and
   * `hud.alert.event.prisoners.discharged` rendered *"1 released -- their
   * sentences are served."* at one prisoner. Both counts are reachable:
   * `riotOpenedEventSchema` and `dischargedEventSchema` each admit `min(1)` on
   * the wire, and `SimulationEventLog.recordDischarge` emits at any count from
   * 1 up.
   *
   * Polish is asserted beside English because English has two categories and
   * Polish four, so a selector that quietly fell back to `other` would still
   * look right in English at every count above 1 and would be wrong in Polish
   * at 2, 3, 4, 22 and so on -- which is the failure mode a test written only
   * in English cannot see.
   */
  const en = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
  const pl = new Localizer({ locale: 'pl', catalogs: [messageCatalogPl, defaultMessageCatalogEn] });

  const row = (labelKey: HudAlertViewModel['labelKey'], count: number): HudAlertViewModel => ({
    id: 'event-plural',
    labelKey,
    severity: 'danger',
    labelParameters: { count },
    occurrences: {
      count: 1,
      firstSequence: 1,
      lastSequence: 1,
      statement: '{"type":"probe"}',
    },
  });

  it('says "1 prisoner has" and "3 prisoners have" from one riot key', () => {
    expect(hudAlertRowLabel(en, row('hud.alert.event.incidents.riot-opened', 1))).toBe(
      'A riot has broken out — 1 prisoner has stopped taking orders.',
    );
    expect(hudAlertRowLabel(en, row('hud.alert.event.incidents.riot-opened', 3))).toBe(
      'A riot has broken out — 3 prisoners have stopped taking orders.',
    );
  });

  it('inflects the same riot key across all three Polish categories', () => {
    expect(hudAlertRowLabel(pl, row('hud.alert.event.incidents.riot-opened', 1))).toBe(
      'Wybuchł bunt — 1 więzień przestał słuchać poleceń.',
    );
    // `few`: 2-4, and 22-24.
    expect(hudAlertRowLabel(pl, row('hud.alert.event.incidents.riot-opened', 3))).toBe(
      'Wybuchł bunt — 3 więźniów przestało słuchać poleceń.',
    );
    // `many`: 5 and up, and 0.
    expect(hudAlertRowLabel(pl, row('hud.alert.event.incidents.riot-opened', 7))).toBe(
      'Wybuchł bunt — 7 więźniów przestało słuchać poleceń.',
    );
  });

  it('says "their sentence is served" for one discharge and "sentences are" for several', () => {
    expect(hudAlertRowLabel(en, row('hud.alert.event.prisoners.discharged', 1))).toBe(
      '1 released — their sentence is served.',
    );
    expect(hudAlertRowLabel(en, row('hud.alert.event.prisoners.discharged', 4))).toBe(
      '4 released — their sentences are served.',
    );
    expect(hudAlertRowLabel(pl, row('hud.alert.event.prisoners.discharged', 1))).toBe(
      'Zwolniono: 1 — kara odbyta.',
    );
    expect(hudAlertRowLabel(pl, row('hud.alert.event.prisoners.discharged', 4))).toBe(
      'Zwolniono: 4 — kary odbyte.',
    );
  });

  it('leaves a flat sentence byte-identical on the same path', () => {
    // The other thirty-one counted messages, and every uncounted one, go
    // through `formatPlural` or `format` depending only on whether their
    // parameters carry a number named `count`. A flat string is its own
    // `other` form, so neither path may change what they say.
    expect(hudAlertRowLabel(en, row('hud.alert.event.incidents.assault-opened', 0))).toBe(
      'A fight has broken out between two prisoners.',
    );
    // A key that is still flat *and* counted, so it takes the `formatPlural`
    // branch this change added and must come out of it unchanged. It is not an
    // alert key -- the two counted alert keys are exactly the two migrated
    // above -- and `hudAlertRowLabel` renders whatever key it is handed, which
    // is what makes the comparison possible at all.
    expect(hudAlertRowLabel(en, row('hud.intake.no-place', 2))).toBe(en.format('hud.intake.no-place', { count: 2 }));
    expect(hudAlertRowLabel(en, row('hud.intake.no-place', 1))).toBe('1 waiting with no place to sleep');
  });
});
