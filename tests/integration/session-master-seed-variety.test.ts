import { describe, expect, it } from 'vitest';
import { MemoryLocalSaveStore } from '../../src/persistence/local/memory-store';
import { PrisonSaveRepository } from '../../src/persistence/local/repository';
import { InProcessSessionHost } from '../../src/persistence/session/runtime-host';
import { SessionController } from '../../src/persistence/session/session-controller';
import { expectOk } from '../helpers/expect-ok';

/**
 * Issue #479: every prison anyone has ever played was seeded at 0, because
 * `src/main.ts` never passed a `masterSeed` to `SessionController` and the
 * class defaulted the field to `0`. `tests/integration/session-save-master-seed.test.ts`
 * already proved the seed a session was *given* round-trips through a save;
 * this file proves the half that was still missing -- that a new prison is
 * actually given a seed that varies, the way `main.ts` now draws one.
 *
 * **Neither case below passes a literal seed in and reads it back out.**
 * `docs/TESTING.md`'s rule for this exact shape of test (and #375's, which
 * gave rise to it) is that a test asserting "two prisons differ" must obtain
 * its two seeds the way the application does. `generateMasterSeedLikeProduction`
 * below is that mechanism: `crypto.getRandomValues` on a `Uint32Array(1)`,
 * character-for-character what `src/main.ts`'s `generateMasterSeed` does. It
 * is copied rather than imported because `src/main.ts` boots Phaser and
 * touches `document` at module scope, and `vitest.config.ts` runs with
 * `environment: 'node'` and no jsdom -- importing it here would not run under
 * `pnpm test` at all, which is exactly the trap this repository's own
 * `CLAUDE.md` names `src/main.ts` as an instance of.
 */
function generateMasterSeedLikeProduction(): number {
  const drawn = new Uint32Array(1);
  crypto.getRandomValues(drawn);
  return drawn[0]!;
}

interface DecodedRngStreamState {
  readonly name: string;
  readonly state: unknown;
}

async function decodedPayload(repository: PrisonSaveRepository, prisonId: string): Promise<Record<string, unknown>> {
  const loaded = await repository.loadCurrent(prisonId);
  if (!loaded.ok) throw new Error(`the prison did not load: ${loaded.reason}`);
  return loaded.envelope.payload as unknown as Record<string, unknown>;
}

function rngStatesOf(payload: Record<string, unknown>): readonly DecodedRngStreamState[] {
  const kernel = payload.kernel as { readonly rngStates: readonly DecodedRngStreamState[] };
  return kernel.rngStates;
}

describe('a new prison draws its own masterSeed (#479)', () => {
  it('two prisons created through one SessionController -- the shape of one page session pressing "New Prison" twice -- get different seeds and different named RNG stream states', async () => {
    const store = new MemoryLocalSaveStore();
    const repository = new PrisonSaveRepository(store);
    // One controller, matching how `src/ui/save-panel.ts`'s `requestCreate` can
    // be pressed more than once without the page reloading: if the seed were
    // still a constant chosen once at construction (the pre-fix shape), both
    // prisons below would be identical to each other in everything the seed
    // reaches.
    const controller = new SessionController(repository, new InProcessSessionHost(), {
      gameVersion: 'test-version',
      generateMasterSeed: generateMasterSeedLikeProduction,
    });

    expectOk(await controller.createPrison('prison-one'), 'the creation of prison-one');
    const payloadOne = await decodedPayload(repository, 'prison-one');

    expectOk(await controller.createPrison('prison-two'), 'the creation of prison-two');
    const payloadTwo = await decodedPayload(repository, 'prison-two');

    expect(payloadOne.masterSeed).not.toBe(payloadTwo.masterSeed);
    // `prisoners.classification` and `identity.actor-name` are two of the five
    // streams this derives (docs/DETERMINISM.md's "RNG Ownership"); a fresh
    // runtime has drawn from neither yet, so their initial states are a pure
    // function of `masterSeed` alone -- exactly what the issue calls out by
    // name ("Prisoner names, classification draws... produce the identical
    // sequence in every new game").
    expect(rngStatesOf(payloadOne)).not.toEqual(rngStatesOf(payloadTwo));
  });

  it('two prisons created through two independently-booted SessionControllers also get different seeds', async () => {
    // The cross-session shape: two players (or two tabs), each getting their
    // own generator the way `main.ts` constructs one `SessionController` per
    // boot. Kept separate from the case above because it is a different
    // claim -- that variety does not depend on shared in-process state either.
    const repositoryA = new PrisonSaveRepository(new MemoryLocalSaveStore());
    const controllerA = new SessionController(repositoryA, new InProcessSessionHost(), {
      gameVersion: 'test-version',
      generateMasterSeed: generateMasterSeedLikeProduction,
    });
    const repositoryB = new PrisonSaveRepository(new MemoryLocalSaveStore());
    const controllerB = new SessionController(repositoryB, new InProcessSessionHost(), {
      gameVersion: 'test-version',
      generateMasterSeed: generateMasterSeedLikeProduction,
    });

    expectOk(await controllerA.createPrison('prison'), "controller A's prison");
    expectOk(await controllerB.createPrison('prison'), "controller B's prison");

    const payloadA = await decodedPayload(repositoryA, 'prison');
    const payloadB = await decodedPayload(repositoryB, 'prison');

    expect(payloadA.masterSeed).not.toBe(payloadB.masterSeed);
  });
});
