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
  type HudMetricId,
  formatClockTime,
  normalizeDay,
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
  const time = valueText(formatClockTime(0), 'hud-clock__time');
  const day = valueText('1', 'hud-clock__day');
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
      screenReaderText(t(HUD_MESSAGE_KEY.clockTime)),
      time,
      eyebrowText(t(HUD_MESSAGE_KEY.clockDay), 'hud-clock__day-label'),
      day,
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

    time.textContent = formatClockTime(viewModel.clock.minuteOfDay);
    day.textContent = localizer.formatNumber(normalizeDay(viewModel.clock.day));
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
    update,
  };
}
