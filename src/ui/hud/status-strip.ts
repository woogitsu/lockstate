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
  dayProgressPercent,
  displayDay,
  projectStatusMetrics,
  transportPressedStates,
} from './projection';
import type { HudLocalizer, HudViewModel } from './view-model';

/**
 * The dense top row: five metrics on the left, the clock and transport
 * controls on the right, one hairline underneath and nothing in the middle.
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
    staff: 0,
    rooms: 0,
    activeIncidents: 0,
    contrabandFound: 0,
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

  const root = element('div', {
    className: 'hud-strip',
    attributes: { role: 'region', 'aria-label': t(HUD_MESSAGE_KEY.statusRegion) },
    children: [metricsRow, clockGroup, transportGroup],
  });

  const update = (viewModel: HudViewModel): void => {
    for (const descriptor of projectStatusMetrics(viewModel.counts)) {
      const parts = metrics.get(descriptor.id);
      if (parts === undefined) continue;

      parts.chip.setValue(localizer.formatNumber(descriptor.value));
      parts.chip.setTone(descriptor.tone);

      if (descriptor.badge === undefined) {
        parts.badge?.element.remove();
        parts.badge = undefined;
      } else {
        const next = { tone: descriptor.badge.tone, text: t(descriptor.badge.textKey) };
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
    speed.textContent = `×${localizer.formatNumber(viewModel.clock.speed)}`;
    speedLabel.textContent = t(HUD_MESSAGE_KEY.clockSpeed, { speed: viewModel.clock.speed });

    const pressed = transportPressedStates(viewModel.clock);
    transport.pause.setPressed(pressed.pause);
    transport.play.setPressed(pressed.play);
    transport['fast-forward'].setPressed(pressed.fastForward);
    root.dataset['clockMode'] = viewModel.clock.mode;
  };

  return {
    element: root,
    controls: [transport.pause.element, transport.play.element, transport['fast-forward'].element],
    controlFor: (kind: TransportIntentKind): HTMLButtonElement => transport[kind].element,
    update,
  };
}
