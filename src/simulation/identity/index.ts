/**
 * Actor identity.
 *
 * Prisoners and staff are entity ids, a classification and a risk tier;
 * nothing in the simulation says who they *are*. This module is the
 * smallest thing that closes gaps 1 and 2 of `docs/HUD_PROJECTIONS.md`: a
 * name, minted once from a named RNG stream and then carried as state.
 *
 * `actor-identity.ts` states why the name is an allocated identity rather
 * than a value derived from the entity id, in ADR 0012's terms. ADR 0015
 * is the decision record.
 */

export * from './actor-identity';
export * from './name-pool';

/*
 * `./name-pools/` holds the authored content that replaces
 * `PLACEHOLDER_ACTOR_NAME_POOL` -- nine pools of 120 given by 160 family
 * names. It is **deliberately not re-exported here**, because nothing in
 * `src/` reads it yet: which pool a prison draws from is
 * `docs/adr/0094-which-names-a-prison-draws-from.md`, and that document is
 * Proposed. A barrel export would make the pools look reachable from the
 * places that take an `ActorNamePool` today, and they are not meant to be
 * until the owner has read decision 2. Import the directory directly.
 */
