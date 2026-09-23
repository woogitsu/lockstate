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
  UNKNOWN_READOUT_TEXT,
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

/** Which way along the edit history a strip control asks to move (#1356). */
export type HistoryIntentKind = 'undo' | 'redo';

export interface StatusStripOptions {
  readonly localizer: HudLocalizer;
  readonly onTransport: (kind: TransportIntentKind) => void;
  /**
   * The Undo control was pressed (#1356).
   *
   * Two callbacks rather than one carrying a direction, and that is for the
   * reachability gate rather than for this file: the caller writes
   * `kind: 'undo'` and `kind: 'redo'` as literals inside them, which is the
   * only shape `tests/helpers/control-reachability.ts` can follow from an
   * intent to a `<button>`. A computed kind is the one thing that walk cannot
   * see, and the keyboard's `attachHistory` seam already is one.
   */
  readonly onUndo: () => void;
  /** The Redo control was pressed (#1356). */
  readonly onRedo: () => void;
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
  /**
   * The Undo or the Redo button, so a refused press is marked on the control
   * that was pressed -- the same contract as `controlFor`, and for the same
   * reason narrower than `controls` (#1356).
   */
  historyControlFor(kind: HistoryIntentKind): HTMLButtonElement;
  /**
   * A box at the right end of the strip for the HUD's own layout controls
   * (#1159): the Layout menu and the metric strip's collapse arrow.
   *
   * It is **outside** `foldable` on purpose. Constitution article 16 -- *"Panel
   * przywraca widoczny uchwyt"* -- means the control that folds the strip's
   * readouts cannot be one of the things it folds, so the strip is built as a
   * row of readouts that disappear beside a slot that does not.
   */
  readonly layoutSlot: HTMLElement;
  /**
   * Everything the metric strip's collapse arrow hides: the counters, the
   * clock and the transport buttons.
   *
   * Named as a list rather than by hiding the strip element, because hiding
   * the strip would hide the arrow with it and leave no way back -- and
   * because the brand slot is the host's build identity, which
   * `app-shell.spec.ts` requires in the top-left corner where a bug report
   * reads it from.
   */
  readonly foldable: readonly HTMLElement[];
  update(viewModel: HudViewModel): void;
}

interface MetricParts {
  readonly chip: StatChip;
  readonly trailing: HTMLElement;
  badge: StatusBadge | undefined;
  bar: SegmentedBar | undefined;
}

interface AllStatsParts {
  readonly entry: HTMLElement;
  readonly value: HTMLElement;
  readonly badge: HTMLElement;
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

/**
 * A chip's number, or `--` because no prison has reported one (issue #1191).
 *
 * The strip's own decision rather than the projection's, for the reason the
 * clock's two readouts below take the same decision in the same function:
 * `projection.ts` is pure and has no localizer, so it says *there is no value*
 * and this layer says what that looks like. `UNKNOWN_READOUT_TEXT` is the
 * string the clock already paints, imported rather than respelled, so the two
 * halves of the strip cannot drift apart again -- which is exactly how they
 * came to disagree.
 */
function metricValueText(value: number | undefined, localizer: HudLocalizer): string {
  return value === undefined ? UNKNOWN_READOUT_TEXT : localizer.formatNumber(value);
}

export function createStatusStrip(options: StatusStripOptions): StatusStrip {
  const { localizer } = options;
  const t = (key: LocalizationKey, parameters?: MessageParameters): string =>
    parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

  // ---- metrics -----------------------------------------------------
  const metrics = new Map<HudMetricId, MetricParts>();
  const metricsRow = element('div', { className: 'hud-strip__metrics' });
  const allStatsEntries = new Map<HudMetricId, AllStatsParts>();
  const allStatsList = element('div', { className: 'hud-strip__all-stats-list' });
  const allStatsDialog = document.createElement('dialog');
  allStatsDialog.className = 'hud-strip__all-stats-dialog';
  allStatsDialog.setAttribute('aria-label', t(HUD_MESSAGE_KEY.allStats));
  const allStatsButton = document.createElement('button');
  allStatsButton.type = 'button';
  allStatsButton.className = 'hud-strip__all-stats-button';
  allStatsButton.textContent = t(HUD_MESSAGE_KEY.allStats);
  allStatsButton.hidden = true;
  allStatsButton.addEventListener('click', () => allStatsDialog.showModal());
  const allStatsClose = document.createElement('button');
  allStatsClose.type = 'button';
  allStatsClose.className = 'hud-strip__all-stats-close';
  allStatsClose.textContent = t(HUD_MESSAGE_KEY.allStatsClose);
  allStatsClose.addEventListener('click', () => allStatsDialog.close());
  allStatsDialog.append(allStatsClose, allStatsList);

  /*
   * The descriptor list is the single definition of which metrics exist and
   * in what order; the DOM is built by walking it, never by hand.
   *
   * **Built with no counts, which is what the first paint actually knows**
   * (issue #1191). This call used to pass a literal row of zeros, so the strip
   * opened stating *Prisoners 0, Rooms 0, Funds 0* about a prison nothing had
   * reported -- beside the clock two elements over, which has read `--` in that
   * state since it was written. Every chip now opens at `--` as well, and
   * `update` below puts numbers in them when a publication arrives.
   */
  for (const descriptor of projectStatusMetrics()) {
    const trailing = element('span', { className: 'hud-metric__trailing' });
    const chip = createStatChip({
      icon: descriptor.icon,
      label: t(descriptor.labelKey),
      value: metricValueText(descriptor.value, localizer),
      trailing,
    });
    chip.element.dataset['metric'] = descriptor.id;
    metrics.set(descriptor.id, { chip, trailing, badge: undefined, bar: undefined });
    metricsRow.append(chip.element);
    const entry = element('div', { className: 'hud-strip__all-stats-entry' });
    const label = element('span');
    label.textContent = t(descriptor.labelKey);
    const value = element('span', { className: 'hud-strip__all-stats-value' });
    value.textContent = metricValueText(descriptor.value, localizer);
    const badge = element('span', { className: 'hud-strip__all-stats-badge' });
    badge.hidden = true;
    entry.append(label, value, badge);
    allStatsEntries.set(descriptor.id, { entry, value, badge });
    allStatsList.append(entry);
  }

  // ---- clock and transport -----------------------------------------
  // Both start unknown, because at first paint they are: no session has
  // reported a clock yet, and `--` says so.
  const dayProgress = valueText(UNKNOWN_READOUT_TEXT, 'hud-clock__day-progress');
  const day = valueText(UNKNOWN_READOUT_TEXT, 'hud-clock__day');
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
  // The queue is already projected for the Build panel. Reuse that count on
  // Play while stopped: it connects waiting work to the clock without taking
  // another line from the crowded status strip (#936).
  const queuedCount = element('span', {
    className: 'hud-clock__queued-count',
    attributes: { 'aria-hidden': 'true', hidden: '' },
  });
  transport.play.element.append(queuedCount);

  /*
   * Undo and Redo, on the one band every viewport lays out (#1356).
   *
   * **Why here and not in the Build and Rooms panels.** The keys these stand
   * in for are bound in the `world` *and* `construction` contexts and reverse
   * a transaction whichever tab is open, so a control that existed only on two
   * of the six tabs would be narrower than the key; and the player who has no
   * key at all is the touch player, whose viewport drops `.hud__corner`
   * entirely below 720px. The strip is laid out at every width, on every tab,
   * and is not folded away by the rail's own fold.
   *
   * **Always enabled, and that is what the main thread knows rather than a
   * choice.** Whether there is anything to undo is `ConstructionSystem`'s
   * `hasSomethingToUndo`, in the worker, and no publication carries it to this
   * thread. A press against an empty history does exactly what the key does:
   * the worker's handler records nothing and nothing changes. A control that
   * greyed itself out on a guess would be a promise the code does not keep in
   * the other direction.
   *
   * **That paragraph stopped being true with #1370, and is kept because it is
   * the reasoning the fix had to answer rather than route around.** The
   * worker now publishes whether each press would do anything, as
   * `simulation/status-counts`'s `editHistory`, and `paintHistory` below marks
   * a button unavailable on it. The sentence's last clause still governs how:
   * before any prison has reported, the strip has no answer and paints none,
   * rather than greying both on a guess.
   *
   * **Not in `foldable`.** The strip's collapse control is labelled as hiding
   * the counters and the clock, and this group is neither -- so folding the
   * readouts leaves the way back from a misplaced wall where it was.
   */
  const history: Readonly<Record<HistoryIntentKind, IconButton>> = {
    undo: createIconButton({
      icon: 'undo',
      label: t(HUD_MESSAGE_KEY.historyUndo),
      onActivate: () => options.onUndo(),
    }),
    redo: createIconButton({
      icon: 'redo',
      label: t(HUD_MESSAGE_KEY.historyRedo),
      onActivate: () => options.onRedo(),
    }),
  };

  const historyGroup = element('div', {
    className: 'hud-strip__history',
    attributes: { role: 'group', 'aria-label': t(HUD_MESSAGE_KEY.historyRegion) },
    children: [history.undo.element, history.redo.element],
  });

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

  const layoutSlot = element('div', { className: 'hud-strip__layout' });

  const root = element('div', {
    className: 'hud-strip',
    attributes: { role: 'region', 'aria-label': t(HUD_MESSAGE_KEY.statusRegion) },
    children: [brandSlot, metricsRow, clockGroup, transportGroup, historyGroup, layoutSlot, allStatsButton, allStatsDialog],
  });

  // Badge text changes chip width after every publication. Observe both the
  // viewport and its contents so the directory appears exactly when the
  // invisible scrollbar would otherwise hide a live counter (#719).
  const paintAllStatsButton = (): void => {
    allStatsButton.hidden = metricsRow.hidden || metricsRow.scrollWidth <= metricsRow.clientWidth + 1;
    if (allStatsButton.hidden) {
      if (allStatsDialog.open) allStatsDialog.close();
      return;
    }
    allStatsButton.style.top = `${metricsRow.offsetTop + Math.max(0, (metricsRow.offsetHeight - allStatsButton.offsetHeight) / 2)}px`;
  };
  const metricsObserver = new ResizeObserver(paintAllStatsButton);
  metricsObserver.observe(metricsRow);
  for (const { chip } of metrics.values()) metricsObserver.observe(chip.element);

  /*
   * Undo and Redo marked unavailable when a press would do nothing (#1370).
   *
   * `aria-disabled` through `setUnavailable`, never `disabled`, for three
   * reasons that each stand alone:
   *
   *   - **The press must keep working when the verdict is stale.** It is a
   *     publication, read at most one cadence ago; a player who places a wall
   *     and taps Undo inside that window would have a hard `disabled` eat a
   *     press the worker would have honoured. With `aria-disabled` the press
   *     reaches the worker, which is the authority, exactly as `KeyZ`'s does --
   *     so the button and the key cannot disagree about what a press does.
   *   - **`createBusyGroup` owns `disabled` on both buttons** (`hud.ts` adds
   *     `strip.controls` to it) and rewrites it on every busy transition, so a
   *     verdict written there would be cleared by the next command to settle.
   *   - **A press on an unavailable button is still honest.** It does what an
   *     empty history has always done -- the worker records nothing -- and the
   *     dimmed glyph said so before the press.
   *
   * Absent is *no opinion*, not `false`: before any prison has reported, and
   * after one has stopped, neither button is marked, because the strip does
   * not know and the press answers for itself -- through the worker, or through
   * the host's own refusal when there is no worker to reach.
   */
  const paintHistory = (editHistory: HudViewModel['editHistory']): void => {
    history.undo.setUnavailable(editHistory === undefined ? undefined : !editHistory.undo);
    history.redo.setUnavailable(editHistory === undefined ? undefined : !editHistory.redo);
  };

  const update = (viewModel: HudViewModel): void => {
    paintHistory(viewModel.editHistory);
    /*
     * `roomNeeds` beside the counts (#1006 finding 1). It is the only input
     * here that does not ride `simulation/status-counts`, and it is absent
     * whenever nothing has asked -- which `projectStatusMetrics` turns into no
     * badge rather than into a zero. Passed straight through rather than
     * unpacked, because this file decides nothing about it: which chip carries
     * it, and whether it earns a badge at all, is `projection.ts`'s answer like
     * every other descriptor on this strip.
     */
    for (const descriptor of projectStatusMetrics(viewModel.counts, viewModel.roomNeeds)) {
      const parts = metrics.get(descriptor.id);
      if (parts === undefined) continue;

      parts.chip.setValue(metricValueText(descriptor.value, localizer));
      const allStats = allStatsEntries.get(descriptor.id);
      if (allStats !== undefined) {
        allStats.value.textContent = metricValueText(descriptor.value, localizer);
        allStats.badge.hidden = descriptor.badge === undefined;
        allStats.badge.textContent = descriptor.badge === undefined
          ? ''
          : t(descriptor.badge.textKey, textParameters(descriptor.badge, localizer));
        allStats.entry.title = descriptor.description === undefined
          ? ''
          : t(descriptor.description.textKey, textParameters(descriptor.description, localizer));
      }
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

      if (descriptor.capacity === undefined || descriptor.value === undefined) {
        parts.bar?.element.remove();
        parts.bar = undefined;
      } else {
        if (parts.bar === undefined) {
          parts.bar = createSegmentedBar({ label: t(HUD_MESSAGE_KEY.occupancy) });
          parts.trailing.prepend(parts.bar.element);
        }
        parts.bar.update({
          // Narrowed by the branch above: a capacity without a value is not a
          // state the projection produces -- absence blanks every field of a
          // descriptor together -- and the compiler needs the pair asked for
          // rather than the invariant asserted.
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
    day.textContent = dayNumber === undefined ? UNKNOWN_READOUT_TEXT : localizer.formatNumber(dayNumber);

    const percent = dayProgressPercent(viewModel.clock.tickOfDay, viewModel.clock.dayLengthTicks);
    dayProgress.textContent =
      percent === undefined
        ? UNKNOWN_READOUT_TEXT
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
     * screen reader reads the label and then the value -- "Speed 1×, PAUSED"
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
    const queuedWhilePaused = paused && (viewModel.buildQueue?.total ?? 0) > 0;
    transport.play.element.dataset['queuedWork'] = queuedWhilePaused ? 'true' : 'false';
    queuedCount.hidden = !queuedWhilePaused;
    queuedCount.textContent = queuedWhilePaused ? localizer.formatNumber(viewModel.buildQueue?.total ?? 0) : '';
  };

  return {
    element: root,
    brandSlot,
    controls: [
      transport.pause.element,
      transport.play.element,
      transport['fast-forward'].element,
      history.undo.element,
      history.redo.element,
    ],
    controlFor: (kind: TransportIntentKind): HTMLButtonElement => transport[kind].element,
    historyControlFor: (kind: HistoryIntentKind): HTMLButtonElement => history[kind].element,
    layoutSlot,
    foldable: [metricsRow, clockGroup, transportGroup],
    update,
  };
}
