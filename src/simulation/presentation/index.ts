/**
 * Read models for the HUD.
 *
 * Every export here is a pure function from authoritative simulation state
 * to a readonly, structured-clone-safe view model, extending the pattern
 * `world-projection.ts` established for the world renderer. `AGENTS.md`
 * boundary 1 is that rendering is never the source of truth; these are the
 * only values a panel is allowed to read.
 *
 * See `view-model.ts` for the three rules every projection here obeys
 * (readonly, canonically ordered, ids-and-message-keys-never-text) and for
 * the `BoundedValue` contract that segmented bars render.
 */

export * from './clock-projection';
export * from './construction-projection';
export * from './contraband-projection';
export * from './incident-projection';
export * from './prisoner-projection';
export * from './procurement-projection';
export * from './room-projection';
export * from './security-projection';
export * from './staff-projection';
export * from './status-strip-projection';
export * from './view-model';
export * from './world-projection';
