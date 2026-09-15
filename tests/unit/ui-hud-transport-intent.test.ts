import { describe, expect, it } from 'vitest';
import { transportIntent } from '../../src/ui/hud/hud';
import { EMPTY_HUD_VIEW_MODEL, type HudSpeed, type HudViewModel } from '../../src/ui/hud/view-model';

/**
 * `transportIntent` (`src/ui/hud/hud.ts:2923-2938`) had no test anywhere in
 * this repository before this file -- confirmed by `grep -rl
 * "transportIntent" tests/` returning nothing else -- despite being the one
 * function that decides what pressing Pause, Play or Fast-forward actually
 * asks the simulation to do.
 *
 * ## What this pins, and the discrepancy it was written to make checkable
 *
 * Playing the clock (`tests/browser/playtest-2026-09-02-the-clock.playtest.ts`
 * act 1, `docs/research/2026-09-02-playing-the-clock.md`) measured, on the
 * real running app: fast-forward to ×4, cycle down to ×2, Pause, Play -- and
 * Play resumes at **×1**, not ×2. Pressing Fast-forward directly from that
 * same pause (no Play in between) resumes at ×2, `nextFastForwardSpeed(4)`.
 *
 * `transportIntent`'s own docblock reads *"Pause never changes the speed, so
 * unpausing resumes at the speed the player chose rather than silently
 * resetting to ×1."* That sentence is true of the Fast-forward path and false
 * of the Play path -- `case 'play'` answers a hard-coded `speed: 1` and never
 * reads `viewModel.clock.speed` at all. `docs/AGENT_WORKFLOW.md` §3's rule for
 * a document and the code disagreeing is "the code is right and the document
 * rotted", so the comment was corrected in the same commit as this file to
 * describe the asymmetry rather than deny it; **this test pins the behaviour
 * the corrected comment now describes**, so a future change to either path
 * changes this test rather than silently drifting further from what the
 * comment says.
 *
 * Whether Play *should* preserve the player's fast-forward speed instead of
 * resetting it is a real, open design question -- `AGENTS.md`'s standing
 * mandate reserves a player-visible behaviour change to the owner rather than
 * to whichever agent next touches this file -- and is reported rather than
 * decided here.
 */

function withSpeedAndMode(speed: HudSpeed, mode: 'paused' | 'running'): HudViewModel {
  return {
    ...EMPTY_HUD_VIEW_MODEL,
    clock: { ...EMPTY_HUD_VIEW_MODEL.clock, mode, speed },
  };
}

describe('transportIntent', () => {
  it('Pause carries the clock speed it was told about, unchanged', () => {
    for (const speed of [1, 2, 4] as const) {
      const intent = transportIntent('pause', withSpeedAndMode(speed, 'running'));
      expect(intent).toEqual({ kind: 'set-clock', mode: 'paused', speed });
    }
  });

  /**
   * **The measured discrepancy, pinned.** Play always asks for ×1, whatever
   * speed the view model reports -- including a speed retained across a
   * pause the same session just took. If this ever changes to
   * `speed: viewModel.clock.speed`, this is the test that goes red first.
   */
  it('Play always asks for ×1, even when the clock was paused at a faster speed', () => {
    for (const speed of [1, 2, 4] as const) {
      for (const mode of ['paused', 'running'] as const) {
        const intent = transportIntent('play', withSpeedAndMode(speed, mode));
        expect(intent).toEqual({ kind: 'set-clock', mode: 'running', speed: 1 });
      }
    }
  });

  /**
   * **Fast-forward, by contrast, does continue the ladder from the retained
   * speed** -- including directly out of a pause, with no Play in between,
   * which is the path that actually satisfies the docblock's "does not
   * silently reset the player's choice" for *this* control.
   */
  it('Fast-forward continues the ladder from the current speed, paused or running', () => {
    expect(transportIntent('fast-forward', withSpeedAndMode(1, 'running'))).toEqual({
      kind: 'set-clock',
      mode: 'running',
      speed: 2,
    });
    expect(transportIntent('fast-forward', withSpeedAndMode(2, 'running'))).toEqual({
      kind: 'set-clock',
      mode: 'running',
      speed: 4,
    });
    expect(transportIntent('fast-forward', withSpeedAndMode(4, 'running'))).toEqual({
      kind: 'set-clock',
      mode: 'running',
      speed: 2,
    });
    // Directly from a pause -- no Play press first -- the retained speed
    // still feeds the ladder rather than restarting it from an assumed ×1.
    expect(transportIntent('fast-forward', withSpeedAndMode(4, 'paused'))).toEqual({
      kind: 'set-clock',
      mode: 'running',
      speed: 2,
    });
  });
});
