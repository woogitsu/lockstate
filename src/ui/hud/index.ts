/**
 * The Lockstate HUD.
 *
 * `mountHud(root, { localizer, onIntent })` is the whole entry point. It
 * renders from a `HudViewModel` -- plain data, no simulation import, no
 * translated text travelling back out -- and reports player actions as
 * `HudIntent`s for the host to act on.
 */
export * from './build-panel';
export * from './hud';
export * from './hud-state';
export * from './messages';
export * from './projection';
export * from './rooms-panel';
export * from './status-strip';
export * from './view-model';
