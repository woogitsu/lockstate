/** At most two retained legs per supported 5,000-prisoner population. */
export const MAX_ROUTE_CACHE_WARMTH_KEYS = 10_000;
/** Shared fields cover destinations, not actors; 256 is above the 24/36-prisoner fixtures and production meal rush. */
export const MAX_FLOW_FIELD_WARMTH_KEYS = 256;
/** Total expanded search nodes allowed while rebuilding saved membership, before the first simulation tick. */
export const MAX_CACHE_WARMTH_REBUILD_EXPANSIONS = 250_000;
