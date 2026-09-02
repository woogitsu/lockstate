import type { ActorNamePool } from '../name-pool';
import { ACTOR_NAME_POOL_AR } from './ar';
import { ACTOR_NAME_POOL_DE } from './de';
import { ACTOR_NAME_POOL_EN } from './en';
import { ACTOR_NAME_POOL_ES } from './es';
import { ACTOR_NAME_POOL_FR } from './fr';
import { ACTOR_NAME_POOL_IT } from './it';
import { ACTOR_NAME_POOL_PL } from './pl';
import { ACTOR_NAME_POOL_SW } from './sw';
import { ACTOR_NAME_POOL_TR } from './tr';

/**
 * Authored actor name pools, one per naming tradition.
 *
 * `../name-pool.ts` ships `PLACEHOLDER_ACTOR_NAME_POOL` and says of itself
 * *"This is not a content deliverable"* and that it is *"expected to be
 * replaced wholesale by authored content later"*. This directory is that
 * content. It does not delete the placeholder and does not touch the call
 * site: `ActorIdentityRegistry` still defaults to the placeholder, because
 * **which** pool a prison draws from is an open decision and the
 * documentation for it is `Proposed`, not accepted -- see
 * [ADR 0094](../../../../docs/adr/0094-which-names-a-prison-draws-from.md).
 * Everything here is therefore data with a test on it and no reader.
 *
 * ## Sizes, and where they come from
 *
 * Exactly 120 given names and 160 family names per pool, which is the
 * owner's own figure of 2026-09-02 and not a derived one.
 * `authored-name-pools.test.ts` asserts both counts for every pool, so a
 * pool that grows or shrinks fails rather than drifting.
 *
 * 120 x 160 is 19,200 distinct full names per tradition. That matters for
 * `ActorIdentityRegistry`'s bounded re-draw (`uniquenessAttempts`, default
 * 8): the placeholder's 32 x 32 gives 1,024 pairs, so a 200-prisoner prison
 * exhausts eight attempts often enough for repeats to be routine, while at
 * 19,200 a collision is rare enough that a repeated full name reads as the
 * coincidence real prisons contain rather than as the pool running out.
 *
 * ## What "language" means here, and what it does not
 *
 * These are **naming traditions**, not user-interface locales, and the
 * distinction is load-bearing rather than pedantic. `../actor-identity.ts`
 * states that a proper name *"is never authored into a catalog, never
 * translated, identical in every locale"*, and it is right; a pool named
 * `authored.pl.v1` therefore does not mean "the names a Polish-speaking
 * player sees". It means "the names a prison in that place gives its
 * prisoners", and it reads identically to every player of every locale. The
 * repository ships one interface locale plus a pseudo-locale, so there is no
 * per-locale set to key these to even if that had been the intent.
 *
 * ## Why these nine
 *
 * The placeholder's own docblock describes the spread it was reaching for --
 * *"a spread of common European, Middle Eastern, South American and West
 * African forms"* -- and these nine keep all of it except the last, which
 * `./sw.ts` explains: ASCII cannot spell Yoruba, Igbo or Hausa, so the
 * African tradition here is the one written in plain Latin letters. `en`,
 * `de`, `fr`, `es`, `it` and `pl` are the six largest European traditions by
 * speaker count with distinct name stock; `pl` is also the owner's own
 * language and the second locale that `tests/foundation/second-locale-contract.test.ts`
 * is written against. `tr` and `ar` carry the Middle Eastern leg, `es`
 * carries Latin America as well as Spain, and `sw` carries East Africa.
 *
 * Adding a ninth is a new file and a row in the array below. Nothing else
 * changes, which is the property that made it right to open this directory
 * with nine rather than to wait for a complete set.
 *
 * ## Versioning, and why every id ends in `v1`
 *
 * `../name-pool.ts` is explicit that a pool's declared order is *"half of the
 * seed-to-name mapping"*: reordering a list changes which name a **future**
 * draw produces, and so makes two players on different builds disagree about
 * a brand-new arrival. Nobody already named is renamed -- a name is stored
 * state, which is what ADR 0012's allocated-identity category buys -- but the
 * disagreement about the next arrival is real. So a pool is immutable once it
 * ships, and a correction ships as `authored.<lang>.v2` beside the `v1`
 * rather than as an edit to it.
 */
export const AUTHORED_ACTOR_NAME_POOLS: readonly ActorNamePool[] = [
  ACTOR_NAME_POOL_AR,
  ACTOR_NAME_POOL_DE,
  ACTOR_NAME_POOL_EN,
  ACTOR_NAME_POOL_ES,
  ACTOR_NAME_POOL_FR,
  ACTOR_NAME_POOL_IT,
  ACTOR_NAME_POOL_PL,
  ACTOR_NAME_POOL_SW,
  ACTOR_NAME_POOL_TR,
];

/** How many entries each list in an authored pool carries. The owner's figure of 2026-09-02. */
export const AUTHORED_GIVEN_NAME_COUNT = 120 as const;
export const AUTHORED_FAMILY_NAME_COUNT = 160 as const;

export {
  ACTOR_NAME_POOL_AR,
  ACTOR_NAME_POOL_DE,
  ACTOR_NAME_POOL_EN,
  ACTOR_NAME_POOL_ES,
  ACTOR_NAME_POOL_FR,
  ACTOR_NAME_POOL_IT,
  ACTOR_NAME_POOL_PL,
  ACTOR_NAME_POOL_SW,
  ACTOR_NAME_POOL_TR,
};
