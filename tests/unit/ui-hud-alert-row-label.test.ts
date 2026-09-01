import { describe, expect, it } from 'vitest';
import type { LocalizationKey } from '../../src/content/localization';
import type { MessageParameters } from '../../src/services/localization/format';
import { hudAlertRowLabel } from '../../src/ui/hud/alert-row-label';
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
 * **The localizer is a spy rather than the real one, and that is not a
 * shortcut.** The two keys these decisions need are *deliberately unauthored*
 * -- the words are the owner's (`AGENTS.md`'s fourth exclusion) and
 * `HUD_MESSAGE_KEY.alertsOccurrences` says so at its declaration. A real
 * `Localizer` would render each as its own dotted self, so asserting on the
 * finished English would be asserting on the gap rather than on the mechanism.
 * What is asserted instead is exactly what this function decides: which key,
 * with which parameters, in which order. `tests/unit/ui-hud-messages.test.ts`
 * is what fails, loudly and by name, until the sentences exist.
 */

interface Rendered {
  readonly key: LocalizationKey;
  readonly parameters: MessageParameters | undefined;
}

function spyLocalizer(): {
  readonly t: (key: LocalizationKey, parameters?: MessageParameters) => string;
  readonly rendered: readonly Rendered[];
} {
  const rendered: Rendered[] = [];
  return {
    rendered,
    t: (key, parameters) => {
      rendered.push({ key, parameters });
      return `<${key}>`;
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
    const { t, rendered } = spyLocalizer();
    expect(hudAlertRowLabel(t, ASSAULT)).toBe('<hud.alert.event.incidents.assault-opened>');
    expect(rendered.map((entry) => entry.key)).toEqual(['hud.alert.event.incidents.assault-opened']);
  });

  it('says how many times when the prison has said it more than once (decision 1)', () => {
    const { t, rendered } = spyLocalizer();
    const label = hudAlertRowLabel(t, { ...ASSAULT, occurrences: { ...ASSAULT.occurrences!, count: 3, lastSequence: 9 } });

    expect(label).toBe('<hud.alert.event.incidents.assault-opened> <hud.alert.occurrences>');
    // The count reaches the sentence as a parameter, so the owner's wording
    // decides where the figure sits and what stands beside it.
    expect(rendered[1]).toEqual({ key: HUD_MESSAGE_KEY.alertsOccurrences, parameters: { count: 3 } });
  });

  it('says when the newest of them happened, in the day and the position the strip counts (decision 2)', () => {
    const { t, rendered } = spyLocalizer();
    const label = hudAlertRowLabel(t, {
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
    const { t, rendered } = spyLocalizer();
    hudAlertRowLabel(t, { ...ASSAULT, occurrences: { ...ASSAULT.occurrences!, lastAt: { day: 1, progressPercent: 0 } } });
    expect(rendered.map((entry) => entry.key)).toEqual([
      'hud.alert.event.incidents.assault-opened',
      HUD_MESSAGE_KEY.alertsTime,
    ]);
  });

  it('says nothing about when while no session has reported a clock', () => {
    // `UNKNOWN_HUD_CLOCK` carries `dayLengthTicks: 0`, so the translator builds
    // no time at all rather than a day derived from a length nobody published.
    const { t, rendered } = spyLocalizer();
    hudAlertRowLabel(t, ASSAULT);
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
    const { t, rendered } = spyLocalizer();
    const refusal: HudAlertViewModel = { id: 'refusal-7', labelKey: 'hud.alert.refusal.build.unowned-land', severity: 'warning' };
    expect(hudAlertRowLabel(t, refusal)).toBe('<hud.alert.refusal.build.unowned-land>');
    expect(rendered).toHaveLength(1);
  });

  it('resolves a message-valued parameter inside the sentence before anything is appended', () => {
    // ADR 0076's relocation notice and #683's escape both carry a `{name}`
    // that is itself a message. The count and the time are appended *after*
    // that resolution rather than substituted into it, so a row can carry both
    // without either mechanism knowing about the other.
    const { t, rendered } = spyLocalizer();
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

    hudAlertRowLabel(t, relocation);
    expect(rendered.map((entry) => entry.key)).toEqual([
      'hud.regime.roster-name',
      'room.cell.name',
      'hud.alert.event.prisoners.relocated',
      HUD_MESSAGE_KEY.alertsOccurrences,
    ]);
  });
});
