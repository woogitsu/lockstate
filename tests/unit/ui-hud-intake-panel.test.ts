import { describe, expect, it } from 'vitest';
import { Localizer, buildMessageCatalog } from '../../src/services/localization';
import {
  formatIntakeFailedText,
  formatIntakePipelineCountText,
  formatIntakeStageText,
  isIntakePipelineWorthShowing,
} from '../../src/ui/hud/intake-panel';
import type { HudIntakePipelineViewModel } from '../../src/ui/hud/view-model';

/**
 * What the Intake panel says about the pipeline, without a DOM.
 *
 * The default Vitest environment is `node` and the project ships no DOM
 * library (`docs/TESTING.md`: rendered-output claims belong to
 * `tests/browser/**`), so `createIntakePanel` cannot be called from here. What
 * these cases cover is not layout: it is the two decisions the readout makes
 * that are wrong in ways a screenshot would not show -- which stage each line
 * is labelled with, and whether the block is drawn at all. Both are exposed as
 * the pure functions the DOM code itself calls, which is the shape
 * `src/ui/hud/build-panel.ts` already uses for the same reason.
 *
 * Every expected string below is a literal against a sentinel catalog. A
 * fixture that formatted its expectation through the same helper would supply
 * both sides of the comparison and hold for any implementation, including one
 * that printed the same stage on every line (#375's class of defect).
 */

const sentinels = buildMessageCatalog('en', {
  'intake-stage.queued.name': 'STAGE-QUEUED',
  'intake-stage.accommodation-assignment.name': 'STAGE-CELL-ASSIGNMENT',
  'hud.intake.pipeline-count': 'count/{waiting}/{total}',
  'hud.intake.pipeline-stage': 'stage/{count}/{stage}',
  'hud.intake.pipeline-failed': 'failed/{count}',
});
const localizer = new Localizer({ locale: 'en', catalogs: [sentinels] });
const t = (key: Parameters<Localizer['format']>[0], parameters?: Parameters<Localizer['format']>[1]): string =>
  parameters === undefined ? localizer.format(key) : localizer.format(key, parameters);

const pipeline = (overrides: Partial<HudIntakePipelineViewModel> = {}): HudIntakePipelineViewModel => ({
  waiting: 3,
  failed: 0,
  total: 5,
  stages: [
    { stageId: 'queued', labelKey: 'intake-stage.queued.name', count: 1 },
    { stageId: 'accommodation-assignment', labelKey: 'intake-stage.accommodation-assignment.name', count: 2 },
  ],
  ...overrides,
});

describe('the intake readout labels each line with its own stage', () => {
  it('renders one line per stage, each naming that stage and its own count', () => {
    // The mutation this fails on is the cheapest one to write: a paint loop
    // that resolves `stages[0].labelKey` for every row. Both lines would still
    // be there, both would still have a number, and the panel would say two
    // people are queued when one of them is waiting for a cell.
    expect(pipeline().stages.map((stage) => formatIntakeStageText(t, stage))).toEqual([
      'stage/1/STAGE-QUEUED',
      'stage/2/STAGE-CELL-ASSIGNMENT',
    ]);
  });

  it('says how many of the prison\'s people are still in intake, not how many rows there are', () => {
    // Two rows, three arrivals, five prisoners. A header built from
    // `stages.length` would tell a player with three arrivals that they have
    // two.
    expect(formatIntakePipelineCountText(t, pipeline())).toBe('count/3/5');
  });

  it('gives the terminal failures a sentence of their own', () => {
    // Not the stage line with a sixth stage in it. `'failed'` is terminal
    // (ADR 0028 decision 8), so nothing the player builds afterwards releases
    // those arrivals -- a line that read like the others would say they are
    // being processed.
    expect(formatIntakeFailedText(t, pipeline({ failed: 2 }))).toBe('failed/2');
  });
});

describe('when the intake readout is drawn at all', () => {
  it('is absent before anything has been asked, which is not the same as an empty pipeline', () => {
    expect(isIntakePipelineWorthShowing(undefined)).toBe(false);
  });

  it('stays silent when every arrival has been dealt with', () => {
    // A permanent block reading zero in the panel that exists because there
    // was no room for a second control is how a readout becomes furniture a
    // player stops reading.
    expect(isIntakePipelineWorthShowing(pipeline({ waiting: 0, failed: 0, stages: [] }))).toBe(false);
  });

  it('appears while anybody is still moving through intake', () => {
    expect(isIntakePipelineWorthShowing(pipeline())).toBe(true);
  });

  it('appears when the only thing to say is that somebody can never be housed', () => {
    // The case a `waiting > 0` test alone would drop, and the one that matters
    // most: nothing else on screen says that arrival is stuck for good.
    expect(isIntakePipelineWorthShowing(pipeline({ waiting: 0, failed: 1, stages: [] }))).toBe(true);
  });
});
