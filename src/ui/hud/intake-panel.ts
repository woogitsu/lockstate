import type { LocalizationKey } from '../../content/localization';
import type { MessageParameters } from '../../services/localization/format';
import { createActionButton, type ActionButton } from '../primitives/action-button';
import { element, eyebrowText, valueText } from '../primitives/dom';
import { createPanel } from '../primitives/panel';
import { HUD_MESSAGE_KEY } from './messages';
import type { HudIntakePipelineViewModel, HudIntakeStageViewModel, HudLocalizer } from './view-model';

/**
 * The Intake panel: one control, which admits one prisoner (#261 step 4).
 *
 * ### Why it is a panel on the Overview tab and not a row in Build
 *
 * The Build panel is measurably full, and the measurement is this
 * repository's own rather than a judgement made here.
 * [ADR 0022](../../../docs/adr/0022-room-zoning-surface.md) took the
 * always-visible pixel budget on the assembled page at the five viewports the
 * browser suite visits and found **12.2px at 900x600 and 38.2px at
 * 1280x720**, against a `--tap-target` of 44px (`src/ui/tokens.css`). It also
 * measured the two shapes a control could take there: a collapsed section of
 * its own is 45px, and a *third* button in `.hud-build__actions` keeps its
 * height and overflows the panel **horizontally by 37.9px**, clipped with no
 * scrollbar because `.ui-panel` is `overflow: hidden` on the x axis. So
 * neither fits, at the roomiest viewport or the tightest.
 *
 * A tab of its own is not available at all, and for a recorded reason rather
 * than a pixel one: ADR 0022 measured `.hud-tabs__inner` spanning 1.8 ... 373.2
 * at 375x812 with a fifth tab injected -- 1.8px of margin per side -- so a
 * **sixth tab is foreclosed**, and it named the one remaining slot as belonging
 * to the Rooms surface. The Rooms tab (#312) has since taken it, so
 * `HUD_TAB_IDS` holds five and there is no slot left to spend on a single
 * button.
 *
 * What is left costs nothing at all: **the Overview tab shows nothing.**
 * `hud.ts` binds one panel to `build`, one to `rooms` and, since ADR 0025, one
 * to `security`, so `overview` and `regime` are the two tabs bound to no panel
 * and on either of them `.hud__side` is an empty box. This panel takes that box
 * on `overview` and is `hidden` everywhere else, so it is never laid out at the
 * same time as any of the other three -- `paintState` keys all four on the
 * active tab and the tab is one value -- and the budget ADR 0022 measured is
 * untouched at every viewport. The tab is also the default (`hud-state.ts`), so
 * the control is the first thing a player sees rather than something to go
 * looking for.
 *
 * ### Boundaries
 *
 * Like `build-panel.ts`, it is a composer: it holds nothing, inspects no
 * snapshot, and imports nothing from `src/simulation/**`, so it does not know
 * that an `AdmitPrisoner` command exists -- only that it asked the host to
 * admit somebody. The sentence naming the condition an admission needs is a
 * message key like every other (ADR 0011); the panel renders no text of its
 * own.
 *
 * ### What it now says back (#104's channel, third consumer)
 *
 * One press used to be the end of the conversation. The panel asked for an
 * admission, the status strip's population went up by one, and nothing on
 * screen said what became of the person -- although the simulation knew
 * exactly: every prisoner record carries an `intakeStage`, and an arrival that
 * has been classified and is waiting for somewhere to sleep is **not** refused.
 * `IntakeSystem` keeps that stage and retries, and it is the state a zoned cell
 * with no bed in it produces, because a room with no bed derives
 * `residentCapacity: 0` (ADR 0028 decision 8). So the honest readout names the
 * wait and what ends it, and the block that does is fed from
 * `hud/prisoner-population` by `src/ui/simulation-intake.ts` -- a pull, asked
 * for only while this tab is the one showing.
 *
 * It costs the panel height only when it has something to say: the block is
 * `hidden` unless somebody is in intake or somebody is stuck in the terminal
 * stage, which is the rule `.hud-rooms__needs` follows for the same reason.
 * Nothing about it is a refusal, and it must not read as one -- that is the
 * refusal line's job, and `hud.intake.pipeline-failed` is the one sentence here
 * that is about a state a player cannot act on.
 *
 * ### The one thing it warns about (issue #549)
 *
 * Everything above is a readout. `hud.intake.no-place` is not: it is the count
 * of people the player has admitted that the prison has **no bed for**, and it
 * sits beside the admit control rather than in the block, because it is a fact
 * about the button and not about the pipeline.
 *
 * It exists because the panel's own standing note was false. That note said a
 * prisoner "can only be admitted into a prison that has a room to hold them",
 * and the admission guard has never asked that: `hasAccommodationTarget` wants
 * an *instance* of a housing room type and never a free place in one, so a
 * played prison with a single bed accepted twelve admissions, housed one, paid
 * the state grant on all twelve, and told the player nothing. The note now
 * states what the control actually needs, and this line states what the press
 * actually costs when the prison is full.
 *
 * **Not a refusal, deliberately.** Over-admission is the ordinary route into
 * the incidents `DEFAULT_SECTOR_RISK_POLICY` opens -- an arrival with no
 * accommodation is the term that pushes needs pressure past the line -- so
 * closing it would close the game's most interesting content. The player is
 * told; the button still works.
 *
 * It is folded away at `0`, which is every prison with a bed to spare, so it is
 * not furniture and a player who sees it has genuinely run out.
 *
 * ### What it does not offer, and why
 *
 * No sentence-length field, no prior-incidents field and no arrival tile. The
 * command carries all three and the composition root fills them, because
 * every one of them is a number a player has no basis to choose and no
 * surface to be told the meaning of: a sentence length is quoted in ticks, a
 * prior-incident count feeds a classification the interface never shows, and
 * the arrival tile is the middle of the one chunk a new prison owns. Offering
 * three steppers for figures with no readout would be three controls the
 * player cannot use, in the panel that exists because there was no room for
 * one.
 */

export interface IntakePanelOptions {
  readonly localizer: HudLocalizer;
  /** Admit one prisoner. Carries nothing: the host decides the arrival's figures. */
  readonly onAdmit: () => void;
}

/** The localizer call this panel makes, narrowed so the pure helpers below need no `HudLocalizer`. */
type Translate = (key: LocalizationKey, parameters?: MessageParameters) => string;

/**
 * Whether the readout has anything to say.
 *
 * `undefined` and an empty pipeline both draw nothing and stay two different
 * facts -- "nothing has asked this thread's question" and "the simulation says
 * every arrival has been dealt with" -- which is why
 * `HudIntakePipelineViewModel` keeps them apart and only this predicate
 * collapses them.
 *
 * `failed` on its own is enough. It is the case a `waiting > 0` test would drop
 * and the one that matters most: an arrival in the terminal stage is the only
 * thing here that nothing the player does will move, so falling silent about it
 * would leave the population count as the sole evidence that anybody arrived.
 */
export function isIntakePipelineWorthShowing(pipeline: HudIntakePipelineViewModel | undefined): boolean {
  return pipeline !== undefined && (pipeline.waiting > 0 || pipeline.failed > 0);
}

/** How much of the prison is still in intake, against how many people it holds. */
export function formatIntakePipelineCountText(t: Translate, pipeline: HudIntakePipelineViewModel): string {
  return t(HUD_MESSAGE_KEY.intakePipelineCount, { waiting: pipeline.waiting, total: pipeline.total });
}

/**
 * One stage's line, naming that stage.
 *
 * The stage's own `labelKey` is resolved here and nowhere else: it is the key
 * `src/ui/simulation-intake.ts` derived from the simulation's stage id, so the
 * panel interpolates a translation it was handed rather than a word it chose
 * (ADR 0011).
 */
export function formatIntakeStageText(t: Translate, stage: HudIntakeStageViewModel): string {
  return t(HUD_MESSAGE_KEY.intakePipelineStage, { count: stage.count, stage: t(stage.labelKey) });
}

/** The arrivals in the terminal stage, which is a different sentence from a wait. */
export function formatIntakeFailedText(t: Translate, pipeline: HudIntakePipelineViewModel): string {
  return t(HUD_MESSAGE_KEY.intakePipelineFailed, { count: pipeline.failed });
}

/**
 * Whether the prison has run out of beds for the people already in it (issue
 * #549).
 *
 * Keyed on `waitingWithoutPlace` and on nothing else -- not on `waiting`, and
 * emphatically not on the `accommodation-assignment` stage line. Every arrival
 * passes through that stage, including every arrival the prison houses without
 * trouble, so a warning keyed on it would fire on a prison that is working. The
 * projection has already subtracted the places the prison can offer; `0` means
 * everybody waiting has somewhere to go.
 *
 * `undefined` draws nothing for the reason `isIntakePipelineWorthShowing` gives:
 * nothing is answering for this prison, so there is no prison to warn about.
 */
export function isIntakeWithoutPlaceWorthShowing(pipeline: HudIntakePipelineViewModel | undefined): boolean {
  return pipeline !== undefined && pipeline.waitingWithoutPlace > 0;
}

/** How many people the player has admitted that the prison has nowhere to sleep. */
export function formatIntakeWithoutPlaceText(t: Translate, pipeline: HudIntakePipelineViewModel): string {
  return t(HUD_MESSAGE_KEY.intakeNoPlace, { count: pipeline.waitingWithoutPlace });
}

export interface IntakePanel {
  readonly element: HTMLElement;
  /**
   * Where the arrivals are now, or `undefined` to take the block off.
   *
   * `undefined` is what the host passes when nothing is answering for the
   * prison any more -- a stopped session, a refused read -- and it must take
   * the block away rather than leave the last answer standing, for the reason
   * the Rooms panel's readout comes off: a sentence about people waiting, with
   * nothing still answering for them, is the class of lie this layer exists to
   * avoid.
   */
  setPipeline(pipeline: HudIntakePipelineViewModel | undefined): void;
  /** The controls to disable while a command is in flight -- the one button that issues one. */
  readonly controls: readonly HTMLButtonElement[];
  /** The admit button, so a refused admission is reported *on the control that was pressed* (issue #207). */
  readonly submitControl: HTMLButtonElement;
  setVisible(visible: boolean): void;
}

export function createIntakePanel(options: IntakePanelOptions): IntakePanel {
  const { localizer } = options;
  const t: Translate = (key, parameters) => (parameters === undefined ? localizer.format(key) : localizer.format(key, parameters));

  const admit: ActionButton = createActionButton({
    label: t(HUD_MESSAGE_KEY.intakeAdmit),
    tone: 'primary',
    icon: 'prisoners',
    onActivate: () => options.onAdmit(),
  });
  admit.element.classList.add('hud-intake__admit');

  /*
   * Nothing at construction, exactly as the Rooms panel holds no needs at
   * construction: `mountHud` calls `update` with its view model as its last
   * act, so a session that already has an answer paints on the first frame
   * through `setPipeline` and there is no second route for that value to
   * arrive by.
   */
  let pipeline: HudIntakePipelineViewModel | undefined;

  /*
   * The warning, beside the control that produces it (issue #549).
   *
   * Outside `pipelineBlock` and not a fifth line inside it, because it is not
   * the same kind of statement. That block is a readout of where the prison's
   * arrivals are and is deliberately untoned; this is the one sentence on the
   * panel that says the player has done something the prison cannot absorb, and
   * it has to be next to the button that does it rather than at the bottom of a
   * list a player who is pressing Admit is not reading.
   *
   * It folds independently of the block, so a prison with arrivals moving
   * normally through intake shows the readout and no warning -- which is every
   * prison that is working.
   */
  const withoutPlace = eyebrowText('', 'hud-intake__no-place');

  const pipelineCount = valueText('', 'hud-intake__pipeline-count');
  const pipelineStages = element('div', { className: 'hud-intake__pipeline-stages' });
  const pipelineFailed = eyebrowText('', 'hud-intake__pipeline-failed');
  const pipelineBlock = element('div', {
    className: 'hud-intake__pipeline',
    children: [
      element('div', {
        className: 'hud-intake__pipeline-header',
        children: [eyebrowText(t(HUD_MESSAGE_KEY.intakePipeline)), pipelineCount],
      }),
      pipelineStages,
      pipelineFailed,
    ],
  });

  /**
   * Draws or folds the over-admission warning, from what the host last said
   * (issue #549).
   *
   * Separate from `paintPipeline` below and called by it, rather than inlined,
   * because the two fold on different conditions: the readout has something to
   * say whenever anybody is in intake, and this has something to say only once
   * the prison is out of beds. One function keyed on one predicate would make
   * the warning appear on every admission.
   */
  function paintWithoutPlace(): void {
    const warn = isIntakeWithoutPlaceWorthShowing(pipeline) ? pipeline : undefined;
    // The box, then the text. `hidden` alone would not take the box away --
    // `.hud-intake__no-place` carries an author `display`, which beats the
    // `display: none` a user agent gives `[hidden]` -- so the stylesheet guards
    // on `:not([hidden])` and this is the attribute it guards on.
    withoutPlace.hidden = warn === undefined;
    withoutPlace.textContent = warn === undefined ? '' : formatIntakeWithoutPlaceText(t, warn);
    // The figure as data as well as as text, so a test reads what the panel was
    // told without parsing a localized sentence.
    if (warn === undefined) delete withoutPlace.dataset['withoutPlace'];
    else withoutPlace.dataset['withoutPlace'] = String(warn.waitingWithoutPlace);
  }

  /**
   * Rebuilds the readout from what the host last said, and the warning above it.
   *
   * The rows are rebuilt rather than reconciled, and that is affordable here in
   * a way it is not for the alerts list: there are at most four of them, bounded
   * by the pipeline's own non-terminal stages rather than by the population, and
   * none of them carries a control. Nothing in this block is focusable, so
   * replacing it cannot take focus away from a player mid-press.
   *
   * The one entry point for both, so there is no route by which the panel could
   * repaint the readout and leave last session's warning standing beside it.
   */
  function paintPipeline(): void {
    paintWithoutPlace();
    const shown = isIntakePipelineWorthShowing(pipeline) ? pipeline : undefined;
    pipelineBlock.hidden = shown === undefined;
    if (shown === undefined) {
      pipelineCount.textContent = '';
      pipelineStages.replaceChildren();
      pipelineFailed.textContent = '';
      pipelineFailed.hidden = true;
      delete pipelineBlock.dataset['waiting'];
      delete pipelineBlock.dataset['failed'];
      return;
    }

    pipelineCount.textContent = formatIntakePipelineCountText(t, shown);
    // The figures as data as well as as text, so a test reads them without
    // parsing a localized sentence -- the job `data-unfinished` does on the
    // Rooms panel's readout.
    pipelineBlock.dataset['waiting'] = String(shown.waiting);
    pipelineBlock.dataset['failed'] = String(shown.failed);

    pipelineStages.replaceChildren(
      ...shown.stages.map((stage) => {
        const line = eyebrowText(formatIntakeStageText(t, stage), 'hud-intake__pipeline-stage');
        // The stage's own id, so a browser assertion can find the line about
        // one stage rather than counting rows.
        line.dataset['stage'] = stage.stageId;
        return line;
      }),
    );

    pipelineFailed.hidden = shown.failed <= 0;
    pipelineFailed.textContent = shown.failed <= 0 ? '' : formatIntakeFailedText(t, shown);
  }

  let collapsed = false;
  const panel = createPanel({
    title: t(HUD_MESSAGE_KEY.intakeTitle),
    icon: 'prisoners',
    className: 'hud-intake',
    collapse: {
      collapseLabel: t(HUD_MESSAGE_KEY.panelCollapse),
      expandLabel: t(HUD_MESSAGE_KEY.panelExpand),
      collapsed: false,
      onToggle: () => {
        collapsed = !collapsed;
        panel.setCollapsed(collapsed);
      },
    },
  });
  panel.body.append(
    element('div', {
      className: 'hud-intake__actions',
      children: [admit.element],
    }),
    withoutPlace,
    eyebrowText(t(HUD_MESSAGE_KEY.intakeHint), 'hud-intake__note'),
    pipelineBlock,
  );
  /*
   * The single authority on whether the block has a box, run once here rather
   * than by an initial `hidden` on the element: a second assignment would be a
   * line no test could fail on, which is the rule `paintNeeds` states one panel
   * over.
   */
  paintPipeline();

  return {
    element: panel.element,
    controls: [admit.element],
    submitControl: admit.element,
    setPipeline(next: HudIntakePipelineViewModel | undefined): void {
      pipeline = next;
      paintPipeline();
    },
    setVisible(visible: boolean): void {
      panel.element.hidden = !visible;
      // The readout is *pulled* while this tab is the one showing, so leaving
      // it stops the refresh -- and a readout nothing is refreshing goes stale
      // in silence. Cleared rather than frozen, exactly as the Rooms panel
      // clears its own, for the reason the counts empty when a session ends:
      // what is on screen must be something a system is still answering for.
      if (!visible) {
        pipeline = undefined;
        paintPipeline();
      }
    },
  };
}
