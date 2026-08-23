import type { ParcelRect } from './parcel';
import { rectContainsTileXY } from './parcel';

/**
 * The one definition of "is this tile owned?".
 *
 * It lives in `src/simulation/world` because ownership is simulation state:
 * `AGENTS.md` boundary 1 says rendering is not simulation, so the renderer
 * must not carry a rule of its own for this. `SparseWorld.isTileOwned` and
 * `WorldRenderView.isTileOwned` both delegate here, which is what stops the
 * two from drifting apart. They had drifted (issue #93): each had its own
 * implementation, and the two differed for a tile whose lowest-id covering
 * parcel was unowned while a higher-id parcel covering it was owned. They
 * agreed everywhere else -- on every tile in an owned chunk, on every tile
 * under a single parcel, and on every overlapping tile whose lowest-id
 * covering parcel was owned. Nothing in `src/` registers a parcel or calls
 * `canBuildAt`, so the two answers have never been compared in a running
 * game; the defect is one game rule with two implementations, one of them in
 * the renderer, not an observed wrong highlight.
 *
 * The rule: **a tile is owned when any owned parcel contains it, or when the
 * chunk holding it is owned outright.** Parcels do not veto each other.
 * `registerParcel` permits overlapping bounds, so more than one parcel can
 * contain a tile; each owned one is sufficient on its own, and an unowned one
 * covering the same tile changes nothing. `docs/WORLD.md`
 * ("Parcels and land ownership") already stated the rule this way, and ADR
 * 0019 records why it is this rule rather than "the lowest-id parcel
 * decides".
 *
 * Order-independence is the property that makes this safe for a deterministic
 * simulation: disjunction over a set has the same answer whatever order the
 * set is walked in, so the answer survives a snapshot round trip -- which
 * re-registers parcels sorted by id rather than in their original insertion
 * order -- without needing any canonical sort here. A rule that picked *one*
 * parcel would need that sort to be stable at all (see
 * `SparseWorld.getParcelAtTile`, which still needs it, and
 * `tests/determinism/iteration-order.test.ts`).
 *
 * Plain numbers rather than a `TilePosition`, and a pre-resolved
 * `chunkIsOwned` rather than a callback: `WorldRenderView.readTile` calls
 * this for every tile of every repainted chunk, and neither a per-tile
 * position object nor a per-tile closure is a cost that hot path should pay.
 *
 * @param ownedParcelBounds Bounds of the owned parcels only. Unowned parcels
 *   are irrelevant to the answer and callers need not collect them.
 * @param chunkIsOwned Whether the chunk containing the tile is owned outright,
 *   independently of any parcel.
 */
export function isTileOwnedBy(
  tileX: number,
  tileY: number,
  ownedParcelBounds: readonly ParcelRect[],
  chunkIsOwned: boolean,
): boolean {
  for (let index = 0; index < ownedParcelBounds.length; index += 1) {
    if (rectContainsTileXY(ownedParcelBounds[index]!, tileX, tileY)) return true;
  }

  return chunkIsOwned;
}
