/** Shared by Vite startup and its one-time graph prewarm. Gameplay assertions
 * keep Playwright's independent 60-second test budget. */
export const BROWSER_SERVER_STARTUP_TIMEOUT_MS = 120_000;
