import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { element, eyebrowText, screenReaderText, valueText } from '../primitives/dom';
import { createIcon } from '../primitives/icon';
import { type IconButton, createIconButton } from '../primitives/icon-button';
import { type SegmentedBar, createSegmentedBar } from '../primitives/segmented-bar';
import { type StatChip, createStatChip } from '../primitives/stat-chip';
import { type StatusBadge, createStatusBadge } from '../primitives/status-badge';
import { HUD_MESSAGE_KEY } from './messages';
import {
  CLOCK_UNKNOWN_TEXT,
  type HudMetricId,
  type HudMetricText,
  dayProgressPercent,
  displayDay,
  projectStatusMetrics,
  transportPressedStates,
} from './projection';
import type { HudLocalizer, HudViewModel } from './view-model';

/**
 * The dense top row: the metrics on the left, the clock and transport
 * controls on the right, one hairline underneath and nothing in the middle.
 *
 * **That first clause read "six metrics" and was a tally rather than a
 * subject**, which is the sentence shape `docs/AGENT_WORKFLOW.md` §4 says rots
 * first: the row has been eight chips since #29 added `earned-today` and is
 * nine since #703 added `HIGH RISK`, and neither change touched the comment
 * counting them. The number lives in one place now -- `projectStatusMetrics`
 * in `./projection.ts`, which this file walks and never second-guesses.
 *
 * It is built once and updated in place. Rebuilding a strip that changes
 * every tick would churn the DOM and drop focus out of a transport button
 * mid-interaction.
 */

export type TransportIntentKind = 'pause' | 'play' | 'fast-forward';

export interface StatusStripOptions {
  readonly localizer: HudLocalizer;
  readonly onTransport: (kind: TransportIntentKind) => void;
}

export interface StatusStrip {
  readonly element: HTMLElement;
  /**
   * A box at the left end of the strip, for the host to mount page chrome into.
   *
   * The HUD lays it out and nothing more: it never renders into it, never reads
   * it, and does not know what goes there -- the same arrangement, and the same
   * reason, as `HudHandle.asideSlot`. What occupies it in the running app is
   * `src/ui/brand-badge.ts`, which reads a build constant the HUD has no
   * business importing: the strip is a projection of `HudViewModel`, repainted
   * on every snapshot, and a build identity is neither prison state nor
   * something that changes.
   *
   * Empty, it collapses to nothing and the strip is exactly what it was
   * before -- `hud.css` gives it no width, no padding and no border of its own.
   */
  readonly brandSlot: HTMLElement;
  /** Controls the caller must gate while an intent is in flight. */
  readonly controls: readonly HTMLButtonElement[];
  /**
   * The one button that asks for `kind`, so a refusal can be reported *on the
   * control that was pressed* (issue #207).
   *
   * Narrower than `controls` on purpose: all three transport buttons are
   * disabled together while a clock command is in flight, because they all
   * change the same clock -- but only one of them was pressed, and marking
   * the other two as failed would say that a button the player never touched
   * had refused something.
   */
  controlFor(kind: TransportIntentKind): HTMLButtonElement;
  update(viewModel: HudViewModel): void;
}

interface MetricParts {
  readonly chip: StatChip;
  readonly trailing: HTMLElement;
  badge: StatusBadge | undefined;
  bar: SegmentedBar | undefined;
}

/**
 * The parameters a chip's message is formatted with, with every
 * `numberParameters` entry rendered through the strip's own number formatter.
 *
 * A function rather than three lines inline because it is the one place the
 * strip decides that a badge's number is written the way a chip's value is. A
 * badge reading `2400 left` under a chip reading `-100` is the strip
 * contradicting itself about how it writes a number, and that is exactly what
 * `String(value)` in `interpolate` produces for a raw one.
 *
 * `undefined` when the message names no parameter at all, so `t` is called with
 * one argument and a key with no placeholders takes the path it always took.
 *
 * **It took a `HudMetricBadge` until 2026-09-01 and takes a `HudMetricText`
 * now**, which is the badge's own shape without the tone. The owner's ruling of
 * that day gives the `FUNDS` chip a description as well as a badge, stating the
 * same remainder; the two would have disagreed about grouping the moment one of
 * them was formatted by a second copy of this loop.
 */
function textParameters(text: HudMetricText, localizer: HudLocalizer): MessageParameters | undefined {
  if (text.numberParameters === undefined) return undefined;
  const formatted: Record<string, string> = {};
  for (const [name, value] of Object.entries(text.numberParameters)) {
    formatted[name] = localizer.formatNumber(value);
  }
  return formatted;
}

export function createStatusStrip(options: StatusStripOptions): StatusStrip {
  const { localizer } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  // ---- metrics -----------------------------------------------------
  const metrics = new Map<HudMetricId, MetricParts>();
  const metricsRow = element('div', { className: 'hud-strip__metrics' });

  // The descriptor list is the single definition of which metrics exist and
  // in what order; the DOM is built by walking it, never by hand.
  for (const descriptor of projectStatusMetrics({
    prisoners: 0,
    prisonerCapacity: 0,
    occupiedPlaces: 0,
    staff: 0,
    rooms: 0,
    prisonersCovered: 0,
    prisonersUnderstaffed: 0,
    prisonersUnguarded: 0,
    prisonersHighRisk: 0,
    activeIncidents: 0,
    contrabandFound: 0,
    treasuryMinorUnits: 0,
    stateIncomeAccruedTodayMinorUnits: 0,
  })) {
    const trailing = element('span', { className: 'hud-metric__trailing' });
    const chip = createStatChip({
      icon: descriptor.icon,
      label: t(descriptor.labelKey),
      value: localizer.formatNumber(descriptor.value),
      trailing,
    });
    chip.element.dataset['metric'] = descriptor.id;
    metrics.set(descriptor.id, { chip, trailing, badge: undefined, bar: undefined });
    metricsRow.append(chip.element);
  }

  // ---- clock and transport -----------------------------------------
  // Both start unknown, because at first paint they are: no session has
  // reported a clock yet, and `--` says so.
  const dayProgress = valueText(CLOCK_UNKNOWN_TEXT, 'hud-clock__day-progress');
  const day = valueText(CLOCK_UNKNOWN_TEXT, 'hud-clock__day');
  const speed = valueText('×1', 'hud-clock__speed');
  const speedLabel = screenReaderText('');

  const transport: Readonly<Record<TransportIntentKind, IconButton>> = {
    pause: createIconButton({
      icon: 'pause',
      label: t(HUD_MESSAGE_KEY.transportPause),
      onActivate: () => options.onTransport('pause'),
      pressed: false,
    }),
    play: createIconButton({
      icon: 'play',
      label: t(HUD_MESSAGE_KEY.transportPlay),
      onActivate: () => options.onTransport('play'),
      pressed: false,
    }),
    'fast-forward': createIconButton({
      icon: 'fast-forward',
      label: t(HUD_MESSAGE_KEY.transportFastForward),
      onActivate: () => options.onTransport('fast-forward'),
      pressed: false,
    }),
  };

  const clockGroup = element('div', {
    className: 'hud-strip__clock',
    children: [
      createIcon('clock', 'sm'),
      eyebrowText(t(HUD_MESSAGE_KEY.clockDay)),
      day,
      screenReaderText(t(HUD_MESSAGE_KEY.clockDayProgress)),
      dayProgress,
    ],
  });

  const transportGroup = element('div', {
    className: 'hud-strip__transport',
    attributes: { role: 'group', 'aria-label': t(HUD_MESSAGE_KEY.clockRegion) },
    children: [
      transport.pause.element,
      transport.play.element,
      transport['fast-forward'].element,
      element('span', { className: 'hud-clock__speed-group', children: [speedLabel, speed] }),
    ],
  });

  // First child, so the wordmark reads before the metrics in the DOM as well as
  // on screen. Order matters here beyond aesthetics: a screen reader walks the
  // strip in document order, and "which build is this" belongs before the
  // counters rather than after them.
  const brandSlot = element('div', { className: 'hud-strip__brand' });

  const root = element('div', {
    className: 'hud-strip',
    attributes: { role: 'region', 'aria-label': t(HUD_MESSAGE_KEY.statusRegion) },
    children: [brandSlot, metricsRow, clockGroup, transportGroup],
  });

  const update = (viewModel: HudViewModel): void => {
    for (const descriptor of projectStatusMetrics(viewModel.counts)) {
      const parts = metrics.get(descriptor.id);
      if (parts === undefined) continue;

      parts.chip.setValue(localizer.formatNumber(descriptor.value));
      parts.chip.setTone(descriptor.tone);

      /*
       * The chip's own sentence -- its `title` and its screen-reader text --
       * for the one chip that has one (the owner's ruling of 2026-09-01).
       *
       * Set on every update rather than only when it appears, because it
       * carries a number: `1,249 left before deliveries stop` becomes
       * `1,150 left before deliveries stop` on the next payload, and a
       * tooltip that lags the badge under it is worse than no tooltip. The
       * badge beside it is updated by the same rule, one branch down.
       *
       * Through the same `textParameters` the badge goes through, so the
       * number in the sentence groups exactly as the number in the badge does.
       * The two are read together or not at all.
       */
      parts.chip.setDescription(
        descriptor.description === undefined
          ? undefined
          : t(descriptor.description.textKey, textParameters(descriptor.description, localizer)),
      );

      if (descriptor.badge === undefined) {
        parts.badge?.element.remove();
        parts.badge = undefined;
      } else {
        /*
         * `numberParameters` is present only for a badge that states a
         * quantity, and the quantity is rendered here rather than by the
         * projection: grouped and localised the way this chip's own value is,
         * which is the owner's ruling 18 of 2026-08-31 for `{remaining} left`.
         * The projection has no localizer and must not acquire one, so it names
         * the number and this line writes it.
         *
         * Passed through `t`'s two-argument form only when something is there,
         * so a key with no placeholders is formatted exactly as it was before
         * the field existed.
         */
        const parameters = textParameters(descriptor.badge, localizer);
        const next = {
          tone: descriptor.badge.tone,
          text: t(descriptor.badge.textKey, parameters),
        };
        if (parts.badge === undefined) {
          parts.badge = createStatusBadge(next);
          parts.trailing.append(parts.badge.element);
        } else {
          parts.badge.update(next);
        }
      }

      if (descriptor.capacity === undefined) {
        parts.bar?.element.remove();
        parts.bar = undefined;
      } else {
        if (parts.bar === undefined) {
          parts.bar = createSegmentedBar({ label: t(HUD_MESSAGE_KEY.occupancy) });
          parts.trailing.prepend(parts.bar.element);
        }
        parts.bar.update({
          value: descriptor.value,
          max: descriptor.capacity,
          valueText: t(HUD_MESSAGE_KEY.occupancyValue, {
            value: localizer.formatNumber(descriptor.value),
            capacity: localizer.formatNumber(descriptor.capacity),
          }),
          ...(descriptor.tone === undefined ? {} : { tone: descriptor.tone }),
        });
      }
    }

    // A clock nobody has reported renders as unknown rather than as the
    // start of day one: the strip may not invent a simulation clock.
    const dayNumber = displayDay(viewModel.clock.day);
    day.textContent = dayNumber === undefined ? CLOCK_UNKNOWN_TEXT : localizer.formatNumber(dayNumber);

    const percent = dayProgressPercent(viewModel.clock.tickOfDay, viewModel.clock.dayLengthTicks);
    dayProgress.textContent =
      percent === undefined
        ? CLOCK_UNKNOWN_TEXT
        : // Through the localizer, so the percent sign and grouping follow the
          // player's locale. The *value* is already floored to a whole
          // percent, so this only formats it.
          localizer.formatNumber(percent / 100, { style: 'percent', maximumFractionDigits: 0 });
    /*
     * A stopped clock says so, in two channels (#639).
     *
     * `×${speed}` was written from the speed alone, so it printed identically
     * whether time was moving or not: `Day 1 / 0% / ×1` was the same screen
     * stopped as running, and the owner placed 40 build orders and spent 2,400
     * against it with every readout agreeing with them (#627, #636). The only
     * paused cue was an accent tint on a 44px icon.
     *
     * The word is the owner's ruling and is the one new string this change
     * carries. The second channel is the greying, which is `hud.css`'s rule on
     * the `data-clock-mode` this function already stamps below -- so a player
     * who does not read the word still sees the readout go dim, which is the
     * whole point of it being two channels rather than one.
     *
     * `speedLabel` keeps saying the speed, because the speed is still what it
     * says: `mode` and `speed` are separate fields, a paused clock at ×2 is a
     * real state that `transportPressedStates` already distinguishes, and a
     * screen reader reads the label and then the value -- "Speed 1x, PAUSED"
     * -- which is both facts and invents no string to join them.
     */
    const paused = viewModel.clock.mode === 'paused';
    speed.textContent = paused
      ? t(HUD_MESSAGE_KEY.clockPaused)
      : `×${localizer.formatNumber(viewModel.clock.speed)}`;
    speedLabel.textContent = t(HUD_MESSAGE_KEY.clockSpeed, { speed: viewModel.clock.speed });

    const pressed = transportPressedStates(viewModel.clock);
    transport.pause.setPressed(pressed.pause);
    transport.play.setPressed(pressed.play);
    transport['fast-forward'].setPressed(pressed.fastForward);
    root.dataset['clockMode'] = viewModel.clock.mode;
  };

  return {
    element: root,
    brandSlot,
    controls: [transport.pause.element, transport.play.element, transport['fast-forward'].element],
    controlFor: (kind: TransportIntentKind): HTMLButtonElement => transport[kind].element,
    update,
  };
}
