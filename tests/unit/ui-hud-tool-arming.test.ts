import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pressArm, toggleRemovalMode, type HudToolArming } from '../../src/ui/hud/tool-arming';
import { stripComments } from '../helpers/canonical-iteration';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const DISARMED: HudToolArming = { armed: false, removing: false };

/**
 * The removal toggle, at the only layer it can be proved at.
 *
 * `vitest.config.ts` runs on `environment: 'node'` and there is no jsdom, so a
 * mounted Build or Rooms panel is unreachable from this suite -- which is why
 * the decision these tests are about was extracted into a pure function rather
 * than left inline in two `onActivate` handlers. `docs/AGENT_WORKFLOW.md` §2
 * records that move and why reporting an unreachable survivor is not the
 * answer.
 *
 * Both panels' removal controls call `toggleRemovalMode` and nothing else
 * decides the pair, so every assertion below is a statement about both. The
 * last block is the gate that keeps that true.
 */
describe('pressing the removal toggle', () => {
  /**
   * The half that must not regress. On a touch device this is the whole
   * gesture: one press on the control, then presses on tiles. A second press
   * to arm would put a control in front of the one thing removal exists to
   * undo.
   */
  it('arms the tool in one press, from a standing start', () => {
    expect(toggleRemovalMode(DISARMED)).toEqual({ armed: true, removing: true });
  });

  it('arms in one press from a tool that was armed to place', () => {
    expect(toggleRemovalMode({ armed: true, removing: false })).toEqual({ armed: true, removing: true });
  });

  /**
   * The defect #689 names. A control that says *stop* stops: the player gets
   * no tool, rather than a placing tool that is still holding the pointer.
   */
  it('stands the tool down when the mode is switched off', () => {
    expect(toggleRemovalMode({ armed: true, removing: true })).toEqual({ armed: false, removing: false });
  });

  /**
   * Stated separately from the equality above, and deliberately: this is the
   * exact shape the old `armed = removing || armed` produced -- removal off,
   * pointer still taken -- so it is asserted as a property rather than only as
   * one value in one object comparison.
   */
  it('never leaves the tool armed to place after leaving removal', () => {
    for (const before of [DISARMED, { armed: true, removing: false }, { armed: true, removing: true }]) {
      const entered = toggleRemovalMode(before);
      const left = toggleRemovalMode(entered);
      if (entered.removing) {
        expect(left.armed, `"Stop removing" left a placing tool armed, from ${JSON.stringify(before)}`).toBe(false);
      }
    }
  });

  /**
   * Whatever the tool was, arming into removal and back out again ends with
   * nothing armed -- not with the state it started in. That asymmetry is the
   * decision, not an oversight: returning to the *previously selected* mode
   * would mean remembering which one it was, and no panel records that. The
   * two starting states below are indistinguishable once removal is on, which
   * is the evidence for it.
   */
  it('ends disarmed after a round trip, from either starting mode', () => {
    expect(toggleRemovalMode(toggleRemovalMode(DISARMED))).toEqual(DISARMED);
    expect(toggleRemovalMode(toggleRemovalMode({ armed: true, removing: false }))).toEqual(DISARMED);
  });

  /**
   * The premise of the sentence above, asserted rather than asserted about:
   * entering removal erases which mode the tool was in, so there is nothing
   * left for a "go back to what it was" rule to read.
   */
  it('reaches one state from both starting modes, so no earlier mode survives it', () => {
    expect(toggleRemovalMode(DISARMED)).toEqual(toggleRemovalMode({ armed: true, removing: false }));
  });

  /** A tool that is removing is armed. Nothing may produce the other pair. */
  it('never reports removal without the tool holding the pointer', () => {
    for (const before of [DISARMED, { armed: true, removing: false }, { armed: true, removing: true }]) {
      const next = toggleRemovalMode(before);
      if (next.removing) expect(next.armed, `removing without armed, from ${JSON.stringify(before)}`).toBe(true);
    }
  });
});

/**
 * The arm control -- "Draw on map" / "Place on map" -- at the same layer the
 * removal toggle above is proved at, and for the same reason: the panel that
 * owns it is unreachable from this suite (`vitest.config.ts` has no jsdom).
 *
 * Only `RoomsPanel` calls `pressArm` today; see the function's own doc for why
 * `build-panel.ts` -- which has the identical defect in its own arm button --
 * is not migrated in the same change, and the coupling block below asserts
 * exactly that asymmetry rather than a coupling that does not exist yet.
 */
describe('pressing the arm control', () => {
  /** The ordinary case: nothing armed, nothing removing. One press arms it. */
  it('arms the tool from a standing start', () => {
    expect(pressArm(DISARMED)).toEqual({ armed: true, removing: false });
  });

  /**
   * The defect issue #735 names. `armed` was already `true` on the way out of
   * removal -- entering removal arms the tool -- so the old expression,
   * `armed = !armed` after `removing` had already been cleared, computed
   * `false`: the press that asked to draw stood the tool down instead.
   */
  it('arms to draw when pressed while removing, rather than standing the tool down', () => {
    expect(pressArm({ armed: true, removing: true })).toEqual({ armed: true, removing: false });
  });

  /** The toggle-off case: pressed again while already armed to draw. */
  it('disarms when pressed a second time while already armed to draw', () => {
    expect(pressArm({ armed: true, removing: false })).toEqual({ armed: false, removing: false });
  });

  /**
   * `removing` is unconditionally `false` after this press in every starting
   * state -- this control's whole job is to select "draw", never "remove" --
   * stated as a property across every reachable state rather than only in the
   * three examples above.
   */
  it('always leaves removal off, whatever the starting state', () => {
    for (const before of [DISARMED, { armed: true, removing: false }, { armed: true, removing: true }]) {
      expect(pressArm(before).removing, `pressArm(${JSON.stringify(before)}) left removal on`).toBe(false);
    }
  });
});

/**
 * The coupling, which is the actual class defect.
 *
 * #689 was one expression written twice -- `armed = removing || armed`, in
 * `src/ui/hud/build-panel.ts` and in `src/ui/hud/rooms-panel.ts` -- so fixing
 * it in one place would have been fixing half of it. The behaviour above is
 * a statement about both panels only for as long as both panels route through
 * the one function, and nothing in a type or a `node` test run can see a
 * handler quietly going back to deciding for itself.
 *
 * So this reads the two sources. It is a textual check and claims nothing
 * more: that each panel calls `toggleRemovalMode`, and that neither still
 * carries the expression the issue is about. Comments are stripped first with
 * the repository's pinned scanner, because both files now *quote* that
 * expression while recording what they used to do -- the corrected-in-both-
 * directions habit would otherwise fail this test for following it.
 */
describe('the two panels hold one removal transition between them', () => {
  const PANELS = ['src/ui/hud/build-panel.ts', 'src/ui/hud/rooms-panel.ts'] as const;

  const codeOf = async (relative: string): Promise<string> =>
    stripComments(await readFile(path.join(REPOSITORY_ROOT, relative), 'utf8'));

  it('has both panels ask the shared reducer', async () => {
    for (const panel of PANELS) {
      const code = await codeOf(panel);
      expect(code, `${panel} decides the armed/removing pair without the shared reducer`).toContain(
        'toggleRemovalMode(',
      );
    }
  });

  it('has neither panel left carrying the expression #689 is about', async () => {
    for (const panel of PANELS) {
      const code = await codeOf(panel);
      expect(code.replace(/\s+/g, ' '), `${panel} still keeps the tool armed on the way out of removal`).not.toContain(
        'armed = removing || armed',
      );
    }
  });

  /**
   * Non-vacuity. A `stripComments` that returned an empty string, or a path
   * that resolved to nothing, would satisfy both assertions above by finding
   * nothing at all.
   */
  it('read real panel source, not an empty file', async () => {
    for (const panel of PANELS) {
      const code = await codeOf(panel);
      expect(code.length, `${panel} stripped to nothing`).toBeGreaterThan(10_000);
      expect(code, `${panel} is not the panel it claims to be`).toContain('HUD_MESSAGE_KEY');
    }
  });
});

/**
 * The arm control's coupling -- deliberately **not** claimed to be both
 * panels', because it is not, yet.
 *
 * `RoomsPanel` calls `pressArm`; `build-panel.ts` still carries its own
 * `armed = (wasRemoving || !armed) && selectedId !== undefined` inline, with
 * the identical #735-shaped defect `pressArm`'s doc comment accounts for.
 * That file is held by another agent for the length of this change (see the
 * brief for issue #735), so this only asserts what is actually true today:
 * `RoomsPanel` routes the press through the shared reducer, and no longer
 * carries the expression the issue is about. A future change that migrates
 * `build-panel.ts` too should widen this to match
 * "the two panels hold one removal transition between them" above -- not
 * silently, since a coupling test that quietly started checking more would be
 * exactly the kind of change this file's own comments warn against passing
 * unnoticed.
 */
describe("the Rooms panel's arm control routes through the shared reducer", () => {
  const ROOMS_PANEL = 'src/ui/hud/rooms-panel.ts';

  const codeOf = async (relative: string): Promise<string> =>
    stripComments(await readFile(path.join(REPOSITORY_ROOT, relative), 'utf8'));

  it('has the Rooms panel ask pressArm for the arm control', async () => {
    const code = await codeOf(ROOMS_PANEL);
    expect(code, `${ROOMS_PANEL} decides the arm press without the shared reducer`).toContain('pressArm(');
  });

  it('has the Rooms panel no longer carrying the expression #735 is about', async () => {
    const code = await codeOf(ROOMS_PANEL);
    expect(code.replace(/\s+/g, ' '), `${ROOMS_PANEL} still negates armed on the way out of removal`).not.toContain(
      'armed = !armed',
    );
  });

  /**
   * Non-vacuity, `stripComments`'s own reason repeated: a scanner that
   * returned nothing, or a path that resolved to nothing, would satisfy both
   * assertions above by finding nothing at all.
   */
  it('read real panel source, not an empty file', async () => {
    const code = await codeOf(ROOMS_PANEL);
    expect(code.length, `${ROOMS_PANEL} stripped to nothing`).toBeGreaterThan(10_000);
    expect(code, `${ROOMS_PANEL} is not the panel it claims to be`).toContain('HUD_MESSAGE_KEY');
  });
});
