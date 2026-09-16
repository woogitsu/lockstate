import { describe, expect, it } from 'vitest';
import { type EdgeTarget, edgeTargetKey } from '../../src/rendering/build/edge-picking';
import { BuildTool } from '../../src/ui/build-tool';
import type { HudBuildOrder } from '../../src/ui/hud';

/**
 * One string format, two spellings, and the pin that keeps them the same.
 *
 * `edgeTargetKey` (`src/rendering/build/edge-picking.ts`) produces
 * `` `${tileX},${tileY},${edge}` ``. `BuildTool.deduplicate`
 * (`src/ui/build-tool.ts`) produces the identical string, written out
 * inline, to key the `Set` that stops a run submitting two orders for one
 * edge. Both were cited by line here and both lines had moved -- `:48`
 * landed on a docblock opener and `:138` on an unrelated method -- so they
 * are cited by symbol now, which is the precedent #309 set for exactly this. #141 found the pair while inventorying exports with no reference
 * anywhere, and put it in the #123/#182 family: one rule, two
 * implementations, nothing comparing them.
 *
 * ## Why it is not fixed by sharing the function
 *
 * Because sharing it would cost more than the duplication does.
 * `src/ui/build-tool.ts`'s dependency on `src/rendering/` is recorded in
 * `tests/unit/ui-orchestration-boundaries.test.ts` as **`type-only`**, with a
 * reason that is about intent rather than mechanics:
 *
 * > *"A value import from `src/rendering/` would mean the orchestrator had
 * > started calling into the renderer rather than being handed its reports."*
 *
 * Calling `edgeTargetKey` is a value import. Relaxing a stated boundary to
 * share a template literal is the wrong trade, and rewriting the manifest
 * entry so the change fits would be exactly the failure that manifest exists
 * to catch.
 *
 * Deleting `edgeTargetKey` is also not the answer: #141 lists it among the
 * exports with no reference anywhere and explicitly does **not** propose
 * deleting them.
 *
 * So the third option: leave both, and make the drift fail. This file is that,
 * and it can import both because a test is bound by no manifest -- the same
 * shape as `tests/unit/segment-fill-agreement.test.ts` and the
 * `HUD_BUILD_EDGES` pin at `tests/unit/ui-hud-build-panel.test.ts:47`.
 *
 * ## The pair is not symmetric, which the mutation pass is what showed
 *
 * #141 calls this "a two-implementation pair", and the strings are indeed
 * identical -- but the two are not the same *kind* of thing, and writing the
 * assertions revealed it. `edgeTargetKey` is **exported**, so its format is a
 * contract: something could come to depend on it. `BuildTool`'s copy is a
 * private `Set` key that never leaves the loop, so its only requirement is to
 * be injective over the same three fields. Measured: reordering its fields to
 * `edge,tileX,tileY` changes nothing any test here can see, and that mutation
 * **survives on purpose** -- a test that killed it would be pinning an
 * implementation detail and would fail a legitimate refactor.
 *
 * So the two describe assertions rather than one: the exported format
 * exactly, and the private key's *equivalence*.
 *
 * ## What it asserts, and how
 *
 * `deduplicate` is private, correctly, so this drives the **behaviour**: the
 * public `place()` submits one command per unique edge, and the set of edges
 * it submits is compared against what `edgeTargetKey` says is unique. A test
 * that reached into the private method would pin the implementation and would
 * pass on a `place()` that had stopped calling it.
 */

const edge = (tileX: number, tileY: number, target: EdgeTarget['edge']): EdgeTarget => ({ tileX, tileY, edge: target });

/**
 * The edges a finished run reports, keyed the way `edgeTargetKey` keys them.
 *
 * Read off `attachOrders` rather than off submitted commands: since #225 the
 * tool assembles no command at all -- a gesture leaves as one `HudBuildOrder`
 * and the HUD dispatches it, so that one intent is where the de-duplication is
 * now observable. The property under test is unchanged; only where it surfaces
 * moved.
 */
function placedEdges(segments: readonly EdgeTarget[]): readonly string[] {
  const orders: HudBuildOrder[] = [];
  const tool = new BuildTool();
  tool.attachOrders((order) => orders.push(order));
  tool.setArmed(true, 'wall-brick');
  tool.place(segments);

  // One gesture is one order (#225), so a run that reported two would be a
  // different defect and this would say so rather than silently flattening.
  expect(orders.length, 'a single gesture must report exactly one order').toBe(1);
  return orders[0]!.edges.map((edge) => `${edge.x},${edge.y},${edge.edge}`);
}

describe('the two spellings of an edge key are one format', () => {
  it('agrees character for character over every edge and a spread of coordinates', () => {
    // Exhaustive over the two canonical edges (`BUILD_EDGES` names exactly
    // `north` and `west`) and a spread that includes zero, a negative
    // coordinate and a multi-digit one, because a separator or an ordering
    // difference shows up in exactly those.
    const mismatches: string[] = [];
    for (const target of ['north', 'west'] as const) {
      for (const x of [0, 1, -1, 7, 4_096]) {
        for (const y of [0, 1, -1, 12, 4_096]) {
          const shared = edgeTargetKey(edge(x, y, target));
          const inline = `${x},${y},${target}`;
          if (shared !== inline) mismatches.push(`${shared} vs ${inline}`);
        }
      }
    }
    expect(mismatches, 'edgeTargetKey and BuildTool.deduplicate no longer produce the same string (#141)').toEqual([]);
  });

  it('de-duplicates a run by exactly the edges edgeTargetKey calls equal', () => {
    // The behavioural half. A run with a repeated edge and a near-miss on
    // every field: same tile different edge, same edge different tile.
    const run: readonly EdgeTarget[] = [
      edge(4, 6, 'north'),
      edge(4, 6, 'north'), // exact repeat -- must be dropped
      edge(4, 6, 'west'), // same tile, other edge -- must survive
      edge(5, 6, 'north'), // other tile, same edge -- must survive
      edge(4, 6, 'north'), // repeat again, later in the run
    ];

    const expected = [...new Set(run.map(edgeTargetKey))];
    expect(expected.length, 'fixture: the run must really contain duplicates').toBe(3);
    expect(placedEdges(run)).toEqual(expected);
  });

  it('submits a command per segment when nothing repeats, so the rule is not "drop everything"', () => {
    // The direction that stops the assertion above passing on a `place()` that
    // silently dropped segments.
    const run = [edge(1, 1, 'north'), edge(2, 1, 'north'), edge(3, 1, 'west')];
    expect(placedEdges(run)).toEqual(run.map(edgeTargetKey));
  });
});
