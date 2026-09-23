import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **`Undo` takes back the player's latest action, and refuses when their latest
 * action was not a build** — [ADR 0104](../../docs/adr/0104-what-undo-takes-back.md)
 * option 2, accepted by the owner on 2026-09-09, against
 * [#956](https://github.com/woogitsu/lockstate/issues/956).
 *
 * ## What was measured before this existed
 *
 * On `296812c9` (v0.0.549), through this same runtime: two `wall-brick` orders
 * on one transaction, stepped to `completed`, then `HireStaff`, then `Undo`.
 * Both orders went `completed` → **`cancelled`**, the guard stayed on the
 * roster, and the treasury moved 24,840 → 24,760 — the hire's 80, with **no
 * refund for the 160 of finished wall**. One event was recorded, and its
 * sentence named *the build queue*, on a tab where no queue is drawn.
 *
 * The reach had no bound on the *age* of what it took either: both stacks are
 * empty in a snapshot and a press on a freshly restored prison still cancelled
 * both walls, because `ConstructionSnapshot.currentTransaction` carries the
 * open gesture on purpose (#108). That property is right and is untouched; what
 * changes here is that a restored history is not treated as something the
 * player just did.
 *
 * ## What this file gates, and what it deliberately does not
 *
 * The *simulation* half: which transaction the press reaches, and which event
 * it records. What a player reads is `tests/unit/ui-simulation-events.test.ts`'s
 * subject, because the sentence and its severity live on the far side of the
 * worker boundary.
 *
 * Driven through the real `Kernel`, the real `packCommand` decoder and the real
 * session command router — `createNewSimulationRuntime` — rather than by calling
 * `ConstructionSystem.undo()` directly, because the whole mechanism is a router
 * telling the system what else the player did, and calling the method by hand
 * would test the half that was never broken.
 */

const WALL = 'wall-brick';
const GUARD = 'staff-role.guard';
/** Two edges of one drag, on tiles no other case in this file uses. */
const FIRST = { x: 12, y: 12 } as const;
const SECOND = { x: 13, y: 12 } as const;
/** Generous: a wall is procured, delivered and built, and the budget fails rather than hangs. */
const BUILD_TICK_LIMIT = 4_000;

function createSession(seed = 0x956) {
  const runtime = createNewSimulationRuntime(seed);
  let sequence = 0;

  const send = (command: SimulationCommand): void => {
    runtime.kernel.submitCommand(`cmd-${sequence}`, sequence, runtime.kernel.tick, packCommand(command));
    sequence += 1;
    runtime.kernel.step();
  };

  const placeWall = (orderId: string, tile: { readonly x: number; readonly y: number }, transactionId: string): void => {
    send({ type: 'PlaceBuildOrder', orderId, definitionId: WALL, x: tile.x, y: tile.y, edge: 'north', transactionId });
  };

  const runUntilBuilt = (...orderIds: readonly string[]): void => {
    for (let step = 0; step < BUILD_TICK_LIMIT; step += 1) {
      if (orderIds.every((id) => runtime.construction.getOrder(id)?.state === 'completed')) return;
      runtime.kernel.step();
    }
    throw new Error(
      `orders never all reached completed: ${orderIds.map((id) => `${id}=${String(runtime.construction.getOrder(id)?.state)}`).join(', ')}`,
    );
  };

  return {
    runtime,
    send,
    placeWall,
    runUntilBuilt,
    stateOf: (orderId: string): string | undefined => runtime.construction.getOrder(orderId)?.state,
    guards: (): number => runtime.securityGuards.allGuardIds().length,
    types: (): readonly string[] => runtime.events.since(0).map((event) => event.type),
  };
}

describe('Undo, when the newest thing the player did was not a build', () => {
  it('refuses the transaction, leaves the finished walls standing, and says so once', () => {
    const session = createSession();
    session.placeWall('w1', FIRST, 't1');
    session.placeWall('w2', SECOND, 't1');
    session.runUntilBuilt('w1', 'w2');

    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });
    expect(session.guards(), 'the hire is the precondition, not the subject').toBe(1);
    // After the hire, not before it: the press is what must cost nothing, and a
    // reading taken before the hire would be 80 short and would fail for the
    // hire's reason rather than the press's.
    const fundsBeforeThePress = session.runtime.treasury.balanceMinorUnits;
    const eventsBeforeThePress = session.types().length;

    session.send({ type: 'Undo' });

    // The finished walls are the whole point: this is the 160 the measured run
    // destroyed with no refund.
    expect(session.stateOf('w1'), 'the first wall of the drag').toBe('completed');
    expect(session.stateOf('w2'), 'the second wall of the drag').toBe('completed');
    // The guard was never on the undo stack and is not the subject either way;
    // asserted so a future change that starts reversing hires cannot land here
    // silently.
    expect(session.guards(), 'the hire is untouched, as it always was').toBe(1);
    expect(
      session.runtime.treasury.balanceMinorUnits,
      'a refused press costs nothing and gives nothing back',
    ).toBe(fundsBeforeThePress);

    expect(
      session.types().slice(eventsBeforeThePress),
      'exactly one event, and it is the refusal rather than the undone-spend warning',
    ).toEqual(['construction.undo-refused-newer-action']);
  });

  it('still walks back through a run of builds, so multi-step undo is not the cost of the refusal', () => {
    const session = createSession(0x9561);
    session.placeWall('a1', FIRST, 'ta');
    session.placeWall('a2', SECOND, 'tb');
    session.runUntilBuilt('a1', 'a2');

    session.send({ type: 'Undo' });
    expect(session.stateOf('a2'), 'the newest transaction comes back first').toBe('cancelled');
    expect(session.stateOf('a1'), 'and the older one is still standing').toBe('completed');

    session.send({ type: 'Undo' });
    expect(session.stateOf('a1'), 'the second press reaches the transaction the first exposed').toBe('cancelled');
  });

  it('lets a build after the unrelated action clear the refusal, so the rule is about currency and not about hiring', () => {
    const session = createSession(0x9563);
    session.placeWall('c1', FIRST, 'tc1');
    session.runUntilBuilt('c1');
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });

    session.send({ type: 'Undo' });
    expect(session.stateOf('c1'), 'refused while the hire is the latest action').toBe('completed');

    session.placeWall('c2', SECOND, 'tc2');
    session.runUntilBuilt('c2');
    session.send({ type: 'Undo' });
    expect(session.stateOf('c2'), 'the newest build is the latest action again, so it comes back').toBe('cancelled');
  });

  it('says nothing at all when there is no history to reach, which is the case that was already silent', () => {
    const session = createSession(0x9564);
    // No build, and one command that is not a build, so the flag is set and the
    // history is empty: the refusal must lose to the emptiness, or the sentence
    // would claim something happened after a change that never existed.
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });
    const before = session.types().length;

    session.send({ type: 'Undo' });

    expect(
      session.types().slice(before),
      'an empty history is not a refusal, and it never was',
    ).toEqual([]);
  });

  it('lets Redo hand the history back, so a re-applied transaction is not stranded', () => {
    const session = createSession(0x9565);
    session.placeWall('d1', FIRST, 'td');
    session.runUntilBuilt('d1');
    session.send({ type: 'Undo' });
    expect(session.stateOf('d1')).toBe('cancelled');

    // The hire is what makes this case bite. Without it the flag is already
    // clear when the redo lands, and `redo()`'s own clearing line could be
    // deleted with this file still green -- measured, by deleting it: six
    // passed. With the hire here, deleting it fails the last assertion, which
    // is the whole reason that line exists.
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });

    session.send({ type: 'Redo' });
    expect(session.stateOf('d1'), 'redo puts it back').toBe('approved');

    session.send({ type: 'Undo' });
    expect(
      session.stateOf('d1'),
      'the redo made that transaction the latest action again, so the undo after it is not refused',
    ).toBe('cancelled');
  });
});

/**
 * **A placement the simulation refuses is not the player's latest action**
 * (ADR 0104's amendment of 2026-09-23, option A, ruled by the owner).
 *
 * Before it, a wall refused on its content was still registered on the
 * history: it opened a dead transaction, emptied the redo stack and reset
 * `newerActionThanTheStackTop`. So a refused wall over a live one took two
 * presses to reach the live one, the first saying nothing -- and with a hire
 * in between, the second press reversed a wall placed *before* the hire,
 * which is the loss option 2 exists to stop. `ObjectPlacementService` never
 * registered a refused object; this makes the wall path agree.
 */
describe('Undo, after a placement the simulation refused', () => {
  /** Far outside any parcel a new session owns: decided `failed` at placement. */
  const REFUSED = { x: 900, y: 900 } as const;

  it('reverses the live wall beneath in one press, because the refused one never entered the history', () => {
    const session = createSession(0x9566);
    session.placeWall('live', FIRST, 'tl');
    session.placeWall('refused', REFUSED, 'tr');
    expect(session.stateOf('refused'), 'the precondition: the simulation refused it').toBe('failed');
    const before = session.types().length;

    session.send({ type: 'Undo' });

    expect(session.stateOf('live'), 'one press reaches the live wall').toBe('cancelled');
    expect(session.types().slice(before), 'and says it worked').toEqual(['construction.undone']);
  });

  it('still refuses after a hire, because a refused wall does not make the older wall the latest action', () => {
    const session = createSession(0x9567);
    session.placeWall('before-hire', FIRST, 'tb');
    session.send({ type: 'HireStaff', staffRoleId: GUARD, x: 4, y: 4 });
    session.placeWall('refused', REFUSED, 'tr');
    expect(session.stateOf('refused'), 'the precondition: the simulation refused it').toBe('failed');
    const before = session.types().length;

    session.send({ type: 'Undo' });
    session.send({ type: 'Undo' });

    expect(session.stateOf('before-hire'), 'neither press reaches past the hire').not.toBe('cancelled');
    expect(
      session.types().slice(before),
      'both presses are refused visibly -- the first is not a silent pop of the refused wall',
    ).toEqual(['construction.undo-refused-newer-action', 'construction.undo-refused-newer-action']);
  });

  it('leaves the redo stack as it was, so an undone wall can still be put back after a refused one', () => {
    const session = createSession(0x9568);
    session.placeWall('undone', FIRST, 'tu');
    session.send({ type: 'Undo' });
    expect(session.stateOf('undone')).toBe('cancelled');

    session.placeWall('refused', REFUSED, 'tr');
    expect(session.stateOf('refused'), 'the precondition: the simulation refused it').toBe('failed');
    const before = session.types().length;

    session.send({ type: 'Redo' });

    expect(session.stateOf('undone'), 'the refused wall did not empty the redo stack').toBe('approved');
    expect(session.types().slice(before)).toEqual(['construction.redone']);
  });
});
