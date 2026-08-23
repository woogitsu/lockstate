/**
 * The entity-liveness codec now lives in the simulation layer
 * (`src/simulation/entity/entity-codec.ts`), because the worker protocol
 * needs it too and the simulation layer may not import persistence. This
 * module re-exports it so existing persistence callers and
 * `src/persistence/index.ts` keep their import path.
 */
export {
  decodeEntityStoreSnapshot,
  encodeEntityStoreSnapshot,
  type EncodedEntityStoreSnapshot,
} from '../simulation/entity/entity-codec';
