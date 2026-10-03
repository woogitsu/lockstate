import fs from 'node:fs';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Run from the repository root. This compares sources; it does not execute a browser.
const receipt = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./guard-preservation.json', import.meta.url)), 'utf8'));
const git = args => cp.execFileSync('git', args, { maxBuffer: 8 * 1024 * 1024 }).toString('utf8');
const results = receipt.results.map(({ file }) => {
  const original = git(['show', `${receipt.base}:${file}`]).replaceAll('\r\n', '\n');
  const actual = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  let stripped = actual.replace(/^import \{ openCameraControls \} from '[^']+';\n/gm, '')
    .replace(/^[ \t]*await openCameraControls\(page\);\n/gm, '');
  // Preserve the keyboard-only route: its new prerequisite is Tab + Enter.
  stripped = stripped.replace(/^  const disclosure=.*\n  await expect\(page\.locator\('\.hud-camera-panel'\)\)\.toBeVisible\(\);\n/gm, '');
  // The same actual native SELECT node moved into the approved camera panel.
  stripped = stripped.replaceAll('.hud-camera-panel > select.hud-build__category', '.hud__corner > select.hud-build__category');
  if (file === 'tests/browser/bookshelf-player-build.spec.ts') {
    stripped = stripped.replace(/  if \(quarterTurns === 1\) \{\n    (for \(let step = 0; step < 6; step\+\+\)[^\n]+)\n  \}/, '  if (quarterTurns === 1) $1');
  }
  return { file, originalBodyPreservedAfterExplicitPrerequisites: original === stripped,
    originalExpectCalls: (original.match(/\bexpect(?:\(|\.)/g) ?? []).length,
    currentExpectCalls: (actual.match(/\bexpect(?:\(|\.)/g) ?? []).length };
});
const result = { base: receipt.base, originalConsumers: results.length,
  allOriginalBodiesPreserved: results.every(row => row.originalBodyPreservedAfterExplicitPrerequisites), results };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.allOriginalBodiesPreserved ? 0 : 1;
