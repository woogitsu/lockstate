import { describe, expect, it } from 'vitest';
import { editHistoryAvailability } from '../../src/simulation/construction/handler';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
} from '../../src/simulation/runtime/restore-session';

/**
 * **What the status strip's Undo and Redo are marked unavailable on is what a
 * press would actually do** (#1370).
 *
 * `editHistoryAvailability` answers, for each of the two commands, whether
 * dispatching it now would record an event -- a success sentence, or ADR 0104's
 * refusal -- or pass through the handler and record nothing. This file holds
 * that answer to the handler itself: at every step of each walk below it reads
 * the pair, **then dispatches the command through the real kernel and the real
 * session command router** and reads the event log, and requires the two to
 * agree. The expected side is the event log, which `editHistoryAvailability`
 * does not read, so no fixture here supplies both sides of the comparison
 * (`docs/AGENT_WORKFLOW.md` §3).
 *
 * Each probe is also a step of the walk -- a press that did something moves
 * the history on -- so the walks are written to pass through every branch the
 * handler has: an empty history, a live transaction, a refused one, a dead one
 * (every order failed), a redo stack emptied by a new placement, and a restore.
 * The dead one is built from a save written before ADR 0104's amendment of
 * 2026-09-23, because since that amendment a refused placement no longer
 * enters the history and a live session cannot make one by a press.
 */

const WALL = 'wall-brick';
const GUARD = 'staff-role.guard';

function createSession(seed: number) {
  let runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };

  const eventCount = (): number => runtime.events.since(0).length;

  /**
   * Reads the pair, presses `type`, and returns what the pair said beside what
   * the press did. `recorded` is read off the event log alone.
   */
  const probe = (type: 'Undo' | 'Redo'): { readonly predicted: boolean; readonly recorded: boolean } => {
    const availability = editHistoryAvailability(runtime.construction);
    const before = eventCount();
    send({ type });
    return { predicted: type === 'Undo' ? availability.undo : availability.redo, recorded: eventCount() > before };
  };

  return {
    get runtime() {
      return runtime;
    },
    send,
    probe,
    placeWall(orderId: string, x: number, y: number, transactionId: string): void {
      send({ type: 'PlaceBuildOrder', orderId, definitionId: WALL, x, y, edge: 'north', transactionId });
    },
    availability: () => editHistoryAvailability(runtime.construction),
    /**
     * Restores the session with `deadOrderId` as the open gesture, on top of
     * whatever was open -- the history a save written **before ADR 0104's
     * amendment of 2026-09-23** carries after a refused placement. The
     * amendment stopped refused placements entering the history, so a live
     * session can no longer build this shape by a press; a save from before it
     * still holds one, and a restore reads it back unchanged (#108), which is
     * why the availability getters still have to answer it.
     */
    restoreAnOlderSaveWithADeadTop(deadOrderId: string): void {
      const bundle = structuredClone(captureSessionSnapshot(runtime));
      const construction = bundle.construction as unknown as {
        undoStack: string[][];
        currentTransaction?: string[];
        currentTransactionId?: string;
      };
      if (construction.currentTransaction !== undefined && construction.currentTransaction.length > 0) {
        construction.undoStack.push(construction.currentTransaction);
      }
      construction.currentTransaction = [deadOrderId];
      construction.currentTransactionId = 'pre-amendment';
      runtime = restoreSimulationRuntime(bundle).runtime;
    },
    restore(): void {
      // Through a structured clone, so nothing the restored session reads can be
      // shared with the one that was saved.
      runtime = restoreSimulationRuntime(structuredClone(captureSessionSnapshot(runtime))).runtime;
    },
  };
}

/** Asserts a probe agreed with itself, and returns what the press did so a walk can say which branch it took. */
function agreed(label: string, outcome: { readonly predicted: boolean; readonly recorded: boolean }): boolean {
  expect(outcome.predicted, `${label}: the pair said ${String(outcome.predicted)}, the press ${outcome.recorded ? 'recorded' : 'recorded nothing'}`).toBe(
    outcome.recorded,
  );
  return outcome.recorded;
}

describe('edit-history availability agrees with what a press of Undo or Redo does', () => {
  it('an empty history: neither press does anything, and neither is offered', () => {
    const session = createSession(0x1370);
    expect(session.availability()).toEqual({ undo: false, redo: false });
    expect(agreed('Undo on an empty history', session.probe('Undo'))).toBe(false);
    expect(agreed('Redo on an empty history', session.probe('Redo'))).toBe(false);
  });

  it('a placement, taken back and put back, walks both bits through both states', () => {
    const session = createSession(0x1371);
    session.placeWall('w1', 12, 12, 't1');
    expect(session.availability(), 'a live gesture, nothing undone yet').toEqual({ undo: true, redo: false });

    expect(agreed('Redo with nothing undone', session.probe('Redo'))).toBe(false);
    expect(agreed('Undo of the one gesture', session.probe('Undo'))).toBe(true);
    expect(session.availability(), 'the gesture moved to the redo side').toEqual({ undo: false, redo: true });

    expect(agreed('Undo past the only gesture', session.probe('Undo'))).toBe(false);
    expect(agreed('Redo of the gesture', session.probe('Redo'))).toBe(true);
    expect(session.availability(), 'and back').toEqual({ undo: true, redo: false });
  });

  it('a new placement after an undo empties the redo side, and the pair says so', () => {
    const session = createSession(0x1372);
    session.placeWall('a1', 12, 12, 'ta');
    expect(agreed('Undo of the first gesture', session.probe('Undo'))).toBe(true);
    expect(session.availability().redo, 'redo is live before the new placement').toBe(true);

    session.placeWall('b1', 13, 12, 'tb');
    expect(session.availability(), 'registerTransactionOrder clears the redo stack').toEqual({ undo: true, redo: false });
    expect(agreed('Redo after a new placement', session.probe('Redo'))).toBe(false);
  });

  it('a refused Undo is offered, because the press answers with a sentence', () => {
    const session = createSession(0x1373);
    session.placeWall('c1', 12, 12, 'tc');
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });
    const before = session.runtime.events.since(0).length;
    expect(agreed('Undo after a hire (ADR 0104 refusal)', session.probe('Undo'))).toBe(true);
    expect(
      session.runtime.events.since(before).map((event) => event.type),
      'the press was the refusal, not an undo -- so "available" here is the refusal branch',
    ).toEqual(['construction.undo-refused-newer-action']);
    expect(session.runtime.construction.getOrder('c1')?.state, 'nothing was taken back').not.toBe('cancelled');
  });

  it('a refused Undo is offered even over a dead transaction, so the refusal branch is what offers it', () => {
    // The case above cannot tell "offered because refused" from "offered
    // because the top would reverse something" -- its top is live. Here the top
    // is dead, so only the refusal can make the press record anything.
    const session = createSession(0x1376);
    session.placeWall('dead', 900, 900, 'td');
    expect(session.runtime.construction.getOrder('dead')?.state, 'the precondition: the order failed').toBe('failed');
    session.restoreAnOlderSaveWithADeadTop('dead');
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });
    expect(session.runtime.construction.undoWouldReverseSomething, 'nothing on top could be reversed').toBe(false);
    expect(agreed('Undo after a hire, over a dead transaction', session.probe('Undo'))).toBe(true);
  });

  it('a refused placement no longer reaches the history at all, so it leaves the pair as it was', () => {
    // ADR 0104's amendment of 2026-09-23: the ordinary route to a dead top is
    // closed. A refused wall over a live one leaves Undo offered, and one press
    // takes the live one back.
    const session = createSession(0x1377);
    session.placeWall('good', 12, 12, 'tg');
    session.placeWall('refused', 900, 900, 'tr');
    expect(session.runtime.construction.getOrder('refused')?.state, 'the precondition: the order failed').toBe('failed');
    expect(session.availability()).toEqual({ undo: true, redo: false });
    expect(agreed('Undo over a refused placement', session.probe('Undo'))).toBe(true);
    expect(session.runtime.construction.getOrder('good')?.state).toBe('cancelled');
  });

  it('a transaction whose every order failed is not offered, though the stack is not empty', () => {
    // Reachable now only from a save written before the amendment (or content
    // withdrawn mid-session, which `update()` fails on its own).
    const session = createSession(0x1374);
    session.placeWall('good', 12, 12, 'tg');
    session.placeWall('dead', 900, 900, 'td');
    expect(session.runtime.construction.getOrder('dead')?.state, 'the precondition: the order failed').toBe('failed');
    session.restoreAnOlderSaveWithADeadTop('dead');
    expect(session.runtime.construction.hasSomethingToUndo, 'and the history is not empty').toBe(true);

    expect(agreed('Undo of a dead transaction', session.probe('Undo'))).toBe(false);
    // The silent press popped the dead transaction, so the one beneath it is
    // now the top -- and it is live.
    expect(agreed('Undo of the live transaction beneath it', session.probe('Undo'))).toBe(true);
    expect(session.runtime.construction.getOrder('good')?.state).toBe('cancelled');
  });

  it('a restored history answers the same as the one that was saved, and enters no save of its own', () => {
    const session = createSession(0x1375);
    session.placeWall('r1', 12, 12, 'tr1');
    session.placeWall('r2', 13, 12, 'tr2');
    expect(agreed('Undo of the second gesture', session.probe('Undo'))).toBe(true);
    const saved = session.availability();
    expect(saved).toEqual({ undo: true, redo: true });

    const snapshot = captureSessionSnapshot(session.runtime);
    expect(JSON.stringify(snapshot), 'availability is derived and is written nowhere in the snapshot').not.toMatch(
      /editHistory|undoWouldReverseSomething|redoWouldReapplySomething/u,
    );

    session.restore();
    expect(session.availability(), 'the same pair after a restore').toEqual(saved);
    expect(agreed('Redo after a restore', session.probe('Redo'))).toBe(true);
  });
});
