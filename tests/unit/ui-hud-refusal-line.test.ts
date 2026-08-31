import { describe, expect, it } from 'vitest';
import type { LocalizationKey } from '../../src/content/localization';
import {
  EMPTY_REFUSAL_LINE,
  type RefusalLineState,
  refusalLineAfterCommandIssued,
  refusalLineAfterHostRefusal,
  refusalLineAfterSimulationNotice,
} from '../../src/ui/hud/refusal-line';

/**
 * How long a refusal stands on the band, proved without a browser.
 *
 * ## Why this file can exist at all
 *
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so every line
 * of `mountHud` is unreachable from this suite: a mutation of the band's
 * lifetime rule used to survive not because a test was missing but because no
 * headless test could observe it. `src/ui/hud/refusal-line.ts` is that rule
 * extracted from the DOM, which is the move `docs/AGENT_WORKFLOW.md` prescribes
 * for exactly this shape, and this is the guard it exists for.
 *
 * What this cannot prove, and does not claim to: that `mountHud` calls these
 * functions at the right moments, that the element is laid out, or that a
 * screen reader hears anything. Those are `tests/browser/`'s, and
 * `tests/browser/refusal-band-lifetime.spec.ts` is the pairing.
 *
 * ## The defect these are the guard against
 *
 * The record under `docs/research/` titled *Playing the twelve changes of
 * 2026-08-31*, §9: one *Remove* pressed on an empty tile put "Nothing was
 * removed -- there is no object on that tile, and none being built there."
 * across the top of the world, and it was still there four in-game days later,
 * at 1280x800 and at 1920x1080, while the player was doing something else
 * entirely. #492 had already given the
 * simulation a way to withdraw a refusal it later accepted -- keyed per target,
 * so zoning room B cannot silence a still-true refusal about room A -- and the
 * class this defect belongs to is the one that key can never match again,
 * because the condition is a permanent property of the target.
 */

const REMOVE_NOTHING: LocalizationKey = 'hud.alert.refusal.remove-object.nothing-to-remove';
const ZONE_NOT_ENCLOSED: LocalizationKey = 'hud.alert.refusal.zone.not-enclosed';
const HOST_CLOCK: LocalizationKey = 'hud.refusal.set-clock';

/** The state after the simulation has published refusal `sequence`. */
function afterSimulationRefusal(sequence: number, labelKey: LocalizationKey): RefusalLineState {
  return refusalLineAfterSimulationNotice(EMPTY_REFUSAL_LINE, { sequence, labelKey });
}

describe('the refusal band, before anything is refused', () => {
  it('says nothing and has read no ordinal', () => {
    expect(EMPTY_REFUSAL_LINE.notice).toBeUndefined();
    expect(EMPTY_REFUSAL_LINE.seenSimulationSequence).toBeUndefined();
  });

  it('is left exactly as it is by a command, so a press with nothing standing writes no DOM', () => {
    // Identity, not equality. `hud.ts` returns on `next === refusalLine`, so a
    // fresh empty object here would have every press rewrite a live region.
    expect(refusalLineAfterCommandIssued(EMPTY_REFUSAL_LINE)).toBe(EMPTY_REFUSAL_LINE);
  });
});

describe('a refusal the simulation decided', () => {
  it('takes the line, names no control, and remembers its ordinal', () => {
    const state = afterSimulationRefusal(1, REMOVE_NOTHING);
    expect(state.notice).toEqual({ source: 'simulation', labelKey: REMOVE_NOTHING });
    // No action: the command was accepted and was refused ticks later,
    // possibly for a drag on the world with no button behind it, so there is
    // nothing on screen for `aria-describedby` to point at.
    expect(state.notice?.action).toBeUndefined();
    expect(state.seenSimulationSequence).toBe(1);
  });

  it('is retired by the next command the player issues (the 2026-08-31 defect)', () => {
    const standing = afterSimulationRefusal(1, REMOVE_NOTHING);
    const afterNextCommand = refusalLineAfterCommandIssued(standing);
    expect(afterNextCommand.notice).toBeUndefined();
  });

  it('does not come back when the counts cadence republishes it', () => {
    // The whole reason the ordinal outlives the sentence. `simulation/status-counts`
    // is a snapshot on a cadence and republishes an unchanged refusal beside a
    // changed count up to twice a second, so a retirement the next publication
    // reversed would be worse than none: the band would blink the same sentence
    // back half a second after the player moved on.
    const retired = refusalLineAfterCommandIssued(afterSimulationRefusal(1, REMOVE_NOTHING));
    expect(retired.seenSimulationSequence).toBe(1);

    const republished = refusalLineAfterSimulationNotice(retired, {
      sequence: 1,
      labelKey: REMOVE_NOTHING,
    });
    expect(republished.notice).toBeUndefined();
    expect(republished).toBe(retired);
  });

  it('is replaced by a newer refusal even after the older one was retired', () => {
    const retired = refusalLineAfterCommandIssued(afterSimulationRefusal(1, REMOVE_NOTHING));
    const next = refusalLineAfterSimulationNotice(retired, {
      sequence: 2,
      labelKey: ZONE_NOT_ENCLOSED,
    });
    expect(next.notice).toEqual({ source: 'simulation', labelKey: ZONE_NOT_ENCLOSED });
    expect(next.seenSimulationSequence).toBe(2);
  });

  it('is withdrawn when the session says it has refused nothing', () => {
    // #492's supersession and a stopped session arrive the same way: the field
    // is gone from the snapshot. This is the branch that was already there and
    // it is unchanged.
    const withdrawn = refusalLineAfterSimulationNotice(afterSimulationRefusal(1, REMOVE_NOTHING), undefined);
    expect(withdrawn).toBe(EMPTY_REFUSAL_LINE);
  });
});

describe('a refusal this thread decided', () => {
  it('names the command kind, so the control that was pressed can be marked', () => {
    const state = refusalLineAfterHostRefusal(EMPTY_REFUSAL_LINE, 'set-clock', HOST_CLOCK);
    expect(state.notice).toEqual({ source: 'host', action: 'set-clock', labelKey: HOST_CLOCK });
  });

  it('is retired by the next command, whatever that command is', () => {
    const standing = refusalLineAfterHostRefusal(EMPTY_REFUSAL_LINE, 'set-clock', HOST_CLOCK);
    expect(refusalLineAfterCommandIssued(standing).notice).toBeUndefined();
  });

  it('survives a snapshot saying the session has refused nothing', () => {
    // Two facts with two owners. A session that has refused nothing is not
    // saying anything about a command this thread threw on a moment ago.
    const standing = refusalLineAfterHostRefusal(EMPTY_REFUSAL_LINE, 'set-clock', HOST_CLOCK);
    const after = refusalLineAfterSimulationNotice(standing, undefined);
    expect(after.notice).toEqual(standing.notice);
  });

  it('takes the line from a simulation refusal and keeps that refusal read', () => {
    const standing = afterSimulationRefusal(4, REMOVE_NOTHING);
    const host = refusalLineAfterHostRefusal(standing, 'set-clock', HOST_CLOCK);
    expect(host.notice?.source).toBe('host');
    // The ordinal survives, or the very next publication of the simulation's
    // unchanged refusal would steal the line back from the press the player
    // just made.
    expect(host.seenSimulationSequence).toBe(4);
    const republished = refusalLineAfterSimulationNotice(host, { sequence: 4, labelKey: REMOVE_NOTHING });
    expect(republished).toBe(host);
  });
});
