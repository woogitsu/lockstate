import { describe, expect, it } from 'vitest';
import { BUILD_EDGES, DEFAULT_BUILD_EDGE } from '../../src/simulation/construction';
import { HUD_BUILD_EDGES } from '../../src/ui/hud/view-model';

/**
 * The HUD may not import `src/simulation/**` (`AGENTS.md` boundary 1), so
 * `HudBuildEdge` is a second declaration of the same vocabulary. Two
 * declarations of one thing drift; a *test* is allowed to import both, so
 * this is where they are held together.
 *
 * If the simulation ever gains a third edge slot, this fails and names the
 * HUD as the thing that has not been updated -- rather than the HUD quietly
 * being unable to express it.
 */
describe('the HUD edge vocabulary matches the simulation', () => {
  it('declares exactly the same members, in the same order', () => {
    expect([...HUD_BUILD_EDGES]).toEqual([...BUILD_EDGES]);
  });

  it('can express the simulation default', () => {
    expect(HUD_BUILD_EDGES as readonly string[]).toContain(DEFAULT_BUILD_EDGE);
  });
});
