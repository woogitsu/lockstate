export * from './contraband-catalog';
export * from './default-locale-en';
export * from './item-catalog';
export * from './localization';
export * from './object-catalog';
export * from './registry';
export * from './room-catalog';
export * from './security-grade-catalog';
export * from './simulation-message-keys';
export * from './staff-role-catalog';
export * from './validate-catalog';

/*
 * Re-exports only. Nothing that has to *run* belongs in this file.
 *
 * Until #315 this barrel also performed the default catalogs' cross-catalog
 * validation at its own import time, described here and in
 * `docs/CONTENT.md` as failing fast at startup. It did not: the barrel has one
 * importer under `src/` (`src/simulation/rooms/definition.ts`), and that
 * module's only importer is a test, so nothing in the production graph reached
 * this file and the bundler dropped it. The check ran under `vite dev` and in
 * `pnpm test`, and not in the build a player loads -- confirmed in the
 * artefact: `dist/assets/index-*.js` contained no occurrence of
 * "cross-reference validation" while each catalog's own import-time throw was
 * present, because those modules are imported directly.
 *
 * It now runs in `room-catalog.ts`, immediately after
 * `defaultRoomContentRegistry` is built, where every reader of that registry
 * pulls it in. `tests/foundation/content-validation-reachability-contract.test.ts`
 * keeps it in a module the production entry points actually reach, and
 * `vite.config.ts` fails the build if the emitted client chunk does not
 * contain it.
 *
 * A barrel is the wrong home for a startup guarantee in general, not just for
 * this one: it is the module a direct import is always free to skip, so
 * whether the guarantee holds depends on which specifier a consumer happens to
 * write.
 */
