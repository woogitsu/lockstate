import { describe, expect, it } from 'vitest';

import type { EdgeTarget } from '../../src/rendering/build/edge-picking';
import type { HudBuildOrder } from '../../src/ui/hud';
import { BuildTool } from '../../src/ui/build-tool';

/**
 * What the armed build tool does with a finished gesture.
 *
 * The tool sits between two layers that may not know each other: the renderer
 * reports tile edges and may not submit a command, and the HUD reports intents
 * and may not import the simulation. It used to close that gap by assembling
 * `PlaceBuildOrder` commands itself and handing them to the command sender,
 * which is why a refused wall reached `console.warn` and the player was told
 * nothing while the Build panel's button, asking for the identical command,
 * painted a refusal line (issues #207, #225). It now reports the gesture to
 * the HUD instead.
 *
 * The property under test here is the one that had to survive that move:
 * **one gesture is one report**. It is asserted rather than assumed because
 * the obvious way to write the new `place` -- a loop calling the sink once per
 * segment -- type-checks, runs, and is wrong: the HUD's gate is single-slot,
 * so every segment after the first would be refused as busy, and `src/main.ts`
 * mints one `transactionId` per intent, so a twelve-segment wall would become
 * twelve separate undo steps.
 *
 * Headless and DOM-free, per `docs/TESTING.md`: nothing here needs a browser,
 * and the rendered half of the same change is `ui-shell.spec.ts`'s.
 */

const north = (x: number, y: number): EdgeTarget => ({ tileX: x, tileY: y, edge: 'north' });

/** An armed tool over a recorder, which is the shape `mountHud` connects to. */
function armedTool(): { readonly tool: BuildTool; readonly orders: readonly HudBuildOrder[] } {
  const orders: HudBuildOrder[] = [];
  const tool = new BuildTool();
  tool.attachOrders((order) => orders.push(order));
  tool.setArmed(true, 'wall-brick');
  return { tool, orders };
}

describe('BuildTool', () => {
  it('reports a whole run as one order, in the order the run was given', () => {
    const { tool, orders } = armedTool();

    tool.place([north(4, 7), north(5, 7), north(6, 7), north(7, 7)]);

    // One, not four. The count is the assertion; the payload below is what
    // makes it a *complete* one rather than a report that dropped segments.
    expect(orders).toHaveLength(1);
    expect(orders[0]).toEqual({
      definitionId: 'wall-brick',
      edges: [
        { x: 4, y: 7, edge: 'north' },
        { x: 5, y: 7, edge: 'north' },
        { x: 6, y: 7, edge: 'north' },
        { x: 7, y: 7, edge: 'north' },
      ],
    });
  });

  it('reports a tap as a run of one, so a tap and a drag are the same shape', () => {
    const { tool, orders } = armedTool();

    tool.place([north(2, 3)]);

    expect(orders).toEqual([{ definitionId: 'wall-brick', edges: [{ x: 2, y: 3, edge: 'north' }] }]);
  });

  it('de-duplicates repeated edges within the one gesture', () => {
    // A run cannot contain the same edge twice today, but a future multi-axis
    // gesture could, and two orders on one edge is the case `ConstructionSystem`
    // has to reconcile when one of them is cancelled.
    const { tool, orders } = armedTool();

    tool.place([north(4, 7), north(5, 7), north(4, 7)]);

    expect(orders[0]?.edges).toEqual([
      { x: 4, y: 7, edge: 'north' },
      { x: 5, y: 7, edge: 'north' },
    ]);
  });

  it('reports nothing when the tool is not armed', () => {
    const orders: HudBuildOrder[] = [];
    const tool = new BuildTool();
    tool.attachOrders((order) => orders.push(order));

    tool.place([north(4, 7)]);
    expect(orders).toEqual([]);

    // Arming with no buildable selected is refused by `setArmed` itself: an
    // armed pointer with nothing to place would take the camera away and give
    // nothing back.
    tool.setArmed(true);
    expect(tool.isArmed()).toBe(false);
    tool.place([north(4, 7)]);
    expect(orders).toEqual([]);
  });

  it('reports nothing for an empty gesture', () => {
    const { tool, orders } = armedTool();
    tool.place([]);
    expect(orders).toEqual([]);
  });

  it('drops a gesture rather than throwing when nothing is attached yet', () => {
    // The tool is built before the HUD exists (`src/main.ts` constructs it for
    // the renderer at boot), so an unattached sink is a real state. It cannot
    // be reached in the running application -- the HUD mounts synchronously
    // during module evaluation, before any pointer event can be dispatched --
    // but a throw here would take the renderer's pointer handler down with it.
    const tool = new BuildTool();
    tool.setArmed(true, 'wall-brick');

    expect(() => tool.place([north(4, 7)])).not.toThrow();
  });

  it('reports the buildable that was selected when the gesture ended', () => {
    const { tool, orders } = armedTool();

    tool.setDefinition('door-wooden');
    tool.place([north(1, 1)]);

    expect(orders[0]?.definitionId).toBe('door-wooden');
  });
});

/**
 * The undo half of the same seam (#261).
 *
 * `BuildTool` is where a world gesture becomes something the HUD can dispatch,
 * and since #261 it is where the *reversal* of one does too: the scene reports
 * `undo()` through `EditHistoryPort` and the tool reports a direction through
 * `attachHistory`, which the HUD turns into its own gated intent. What is
 * asserted here is the routing and the one rule that distinguishes it from
 * `place` -- undo does not care whether the tool is armed.
 */
describe('BuildTool edit history', () => {
  function historyTool(): { readonly tool: BuildTool; readonly requests: readonly string[] } {
    const requests: string[] = [];
    const tool = new BuildTool();
    tool.attachHistory((direction) => requests.push(direction));
    return { tool, requests };
  }

  it('reports undo and redo as distinct directions, one per call', () => {
    const { tool, requests } = historyTool();

    tool.undo();
    tool.redo();
    tool.undo();

    // The order and the count both matter: `ConstructionSystem.undo()` pops
    // one transaction per call, so a report that collapsed two presses into
    // one would leave a wall standing that the player took back twice.
    expect(requests).toEqual(['undo', 'redo', 'undo']);
  });

  it('reverses a gesture whether or not the tool is armed', () => {
    // The rule that makes this a separate port rather than two more methods on
    // `BuildToolPort`. `place` refuses a disarmed tool, correctly -- an
    // unarmed pointer is a camera. Undo reverses a transaction the simulation
    // is already holding, so an armed check would make the key work only while
    // the player happened to have the build tool up, which nothing on screen
    // would explain.
    const { tool, requests } = historyTool();
    expect(tool.isArmed()).toBe(false);

    tool.undo();

    expect(requests).toEqual(['undo']);
  });

  it('drops a request rather than throwing when nothing is attached yet', () => {
    // The same real state `place` has: the tool is built at boot and the HUD
    // attaches at mount. A throw here would take the scene's key handler down.
    const tool = new BuildTool();

    expect(() => tool.undo()).not.toThrow();
    expect(() => tool.redo()).not.toThrow();
  });
});

/**
 * The third port on the same object (#959), and the two properties that make
 * routing through it safe.
 *
 * `Escape` with no gesture left to abandon is a request to put the armed tool
 * down. It leaves the renderer through this class because the routing is
 * identical to the gesture's and the undo keys' -- but unlike those two it is
 * *about* arming, which is the state this object holds a mirror of, so the two
 * ways it could be written wrong are both about that mirror: consulting it, or
 * writing to it.
 */
describe('BuildTool stand down (#959)', () => {
  function standDownTool(): { readonly tool: BuildTool; readonly requests: { count: number } } {
    const requests = { count: 0 };
    const tool = new BuildTool();
    tool.attachStandDown(() => {
      requests.count += 1;
    });
    return { tool, requests };
  }

  it('reports one request per call', () => {
    const { tool, requests } = standDownTool();

    tool.standDown();
    tool.standDown();

    expect(requests.count).toBe(2);
  });

  it('reports whether or not the tool is armed', () => {
    /*
     * Consulting the mirror is the first way to get this wrong. `armed` here
     * is a copy of the Build panel's flag, kept in step from `src/main.ts`;
     * a forward gated on it would make `Escape` work only while the two
     * agreed, and the case where they do not is exactly the case a player
     * needs the key for. `undo` is unconditional for a weaker version of the
     * same reason and the assertion beside it is this one's sibling.
     */
    const { tool, requests } = standDownTool();
    expect(tool.isArmed()).toBe(false);

    tool.standDown();

    expect(requests.count).toBe(1);
  });

  it('does not disarm itself, because the panel is the only writer of that flag', () => {
    /*
     * Writing to the mirror is the second way. A tool that cleared its own
     * `armed` would be a second writer: the request would then be satisfied
     * here and never reach the Build panel, whose arm control would go on
     * reading "Stop placing" over a tool that had stopped -- the world and the
     * panel disagreeing about who owns the pointer, which is the class of
     * defect #550 and #689 are both instances of. The disarm comes back
     * through `setArmed`, like every other arming change.
     */
    const { tool } = standDownTool();
    tool.setArmed(true, 'wall-brick');

    tool.standDown();

    expect(tool.isArmed()).toBe(true);
  });

  it('drops a request rather than throwing when nothing is attached yet', () => {
    // The same real state `place` and `undo` have: the tool is built at boot
    // and the HUD attaches at mount. A throw here would take the scene's key
    // handler down.
    const tool = new BuildTool();

    expect(() => tool.standDown()).not.toThrow();
  });
});
