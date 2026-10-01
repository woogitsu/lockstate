# Native Windows build argv — issue #1542

Verified 2026-10-01 from a checkout below `C:\Users\matma\Documents\Rozwój gier`.

Before: `node scripts/cloudflare-task.mjs build production` invokes Node through a Windows shell, which splits the absolute Vite script path at the space and tries to parse `C:\Users\matma\Documents\Rozwój` as JavaScript. It exits with `SyntaxError` before Vite starts.

After: keep the same executable, argv, working directory, environment, build verification and deployment guard; launch with `shell: false` because every call already supplies `process.execPath`. The complete production wrapper succeeds: Vite client/Worker outputs are generated and `verify-cloudflare-build.mjs` confirms the production output points to `dist/client`. Tools TypeScript build passes.

No deployment settings, production bindings, build budgets or test timeouts were changed. This verifies the local build pipeline, not runtime texture completeness or a production deployment.
