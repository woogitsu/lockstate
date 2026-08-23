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
