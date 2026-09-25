/** At most two retained legs per supported 5,000-prisoner population. */
export const MAX_ROUTE_CACHE_WARMTH_KEYS = 10_000;
/** Shared fields cover destinations, not actors; 256 is above the 24/36-prisoner fixtures and production meal rush. */
export const MAX_FLOW_FIELD_WARMTH_KEYS = 256;
/** Total expanded search nodes allowed while rebuilding saved membership, before the first simulation tick. */
/** Each live cache enforces a worst-case verification-work bound at insertion. */
export const MAX_ROUTE_FAILURE_VERIFY_EXPANSIONS = 2_000_000;
export const MAX_FLOW_FIELD_VERIFY_EXPANSIONS = 250_000;
export const MAX_CACHE_WARMTH_REBUILD_EXPANSIONS = MAX_ROUTE_FAILURE_VERIFY_EXPANSIONS + MAX_FLOW_FIELD_VERIFY_EXPANSIONS;
/** Compact enough for browser saves; applied to the live cache at insertion time. */
export const MAX_ROUTE_CACHE_WARMTH_BYTES = 16 * 1024 * 1024;
export const MAX_FLOW_FIELD_WARMTH_BYTES = 4 * 1024 * 1024;
export const MAX_SAVED_ROUTE_PATH_RUN_CHARS = 100_000;
/** JSON array brackets and separators, in addition to its serialized entries. */
export function cacheWarmthArrayOverhead(count: number): number { return count === 0 ? 2 : count + 1; }
/** Measure the actual UTF-8 save footprint, including non-ASCII door IDs. */
export function cacheWarmthJsonBytes(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).length; }
