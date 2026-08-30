/**
 * Blender-to-atlas determinism gate (issues #32 and #64).
 *
 * Issue #32 requires a "deterministic generation/hash test on representative
 * fixture". Issue #64 measured that it could not pass: two independent runs of
 * the same commit, on the same machine and the same Blender, produced different
 * walk atlases. This script is the executable form of that check, so the
 * regression cannot come back unnoticed.
 *
 * WHAT IT COMPARES, AND WHY
 *
 * It runs the whole chain N times (default 2) into separate scratch directories
 * and compares the SHA-256 of:
 *
 *   - the scene fingerprint of the generated `.blend` (see
 *     `tooling/blender/scene-fingerprint.py`) -- the earliest point at which the
 *     old nondeterminism was observable, and the cheapest to check;
 *   - every packed atlas PNG;
 *   - the atlas manifest JSON;
 *   - `asset-registry.json`.
 *
 * It deliberately does NOT compare the intermediate render frames. Blender
 * stamps `Date`, `RenderTime` and the absolute source `.blend` path into every
 * rendered PNG as `tEXt` chunks, so those files can never be byte-stable and a
 * test that compared them would fail for reasons that say nothing about the
 * pipeline. The packed atlas has no such problem: the packer copies frame
 * *pixels* into a freshly created image, so no source metadata survives into it,
 * and issue #64 confirmed the copy is byte-exact for all 72 frame regions.
 *
 * The `.blend` itself is also not comparable: it embeds absolute paths and a
 * save timestamp. That is what the scene fingerprint exists to replace.
 *
 * USAGE
 *
 *   node tooling/verify-pipeline-determinism.mjs [options]
 *
 *     --mode scene|full   `scene` builds the source scene only (seconds);
 *                         `full` renders and packs as well (minutes). Default: full.
 *     --asset-id <id>     Actor profile to build. Default: actor.prisoner.base.
 *     --runs <n>          Independent runs to compare. Default: 2.
 *     --blender <path>    Blender executable. Default: $LOCKSTATE_BLENDER, else `blender`.
 *     --work <dir>        Scratch directory. Default: a fresh temp directory.
 *     --keep              Do not delete the scratch directory.
 *
 * A full run renders 72 frames per run; on software GL that is several minutes
 * each, which is why this is a tool rather than a unit test. Never point --work
 * at the repository: this must not overwrite the reviewed art in
 * `public/assets/actors/`.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blenderScripts = path.join(repositoryRoot, 'tooling', 'blender');
const contractPath = path.join(repositoryRoot, 'assets', 'contracts', 'character-8-direction.contract.json');

function parseArguments(argv) {
  // Written out because the literal below infers `work: undefined` from its
  // own initialiser, and `--work` then cannot assign a path to it (#602).
  /** @type {{ mode: string, assetId: string, runs: number, blender: string, work: string | undefined, keep: boolean, help?: boolean }} */
  const options = {
    mode: 'full',
    assetId: 'actor.prisoner.base',
    runs: 2,
    blender: process.env.LOCKSTATE_BLENDER ?? 'blender',
    work: undefined,
    keep: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${argument} needs a value`);
      return argv[index];
    };
    switch (argument) {
      case '--mode': options.mode = next(); break;
      case '--asset-id': options.assetId = next(); break;
      case '--runs': options.runs = Number.parseInt(next(), 10); break;
      case '--blender': options.blender = next(); break;
      case '--work': options.work = path.resolve(next()); break;
      case '--keep': options.keep = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!['scene', 'full'].includes(options.mode)) throw new Error(`--mode must be "scene" or "full", not "${options.mode}"`);
  if (!Number.isInteger(options.runs) || options.runs < 2) throw new Error('--runs must be an integer of at least 2');
  return options;
}

/**
 * Written out because `scriptArguments = []` infers `never[]`, which makes
 * every call site below an error about `never` rather than about Blender
 * (#602).
 *
 * @param {string} blender
 * @param {{ blend?: string, script: string, scriptArguments?: readonly string[], label: string }} options
 */
function runBlender(blender, { blend, script, scriptArguments = [], label }) {
  const argv = ['--background', '--factory-startup', '--python-exit-code', '1'];
  if (blend !== undefined) argv.push(blend);
  argv.push('--python', path.join(blenderScripts, script));
  if (scriptArguments.length > 0) argv.push('--', ...scriptArguments);
  const result = spawnSync(blender, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${label}: could not start ${blender}: ${result.error.message}`);
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n');
    throw new Error(`${label} failed (exit ${result.status}):\n${tail}`);
  }
}

function runNode(script, scriptArguments, label) {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'tooling', script), ...scriptArguments], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status}):\n${`${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()}`);
  }
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Runs the chain once and returns { artefactName -> sha256 }. */
async function executeRun(options, runDirectory) {
  const blend = path.join(runDirectory, 'source', `${options.assetId}.blend`);
  const fingerprint = path.join(runDirectory, 'scene-fingerprint.json');
  const intermediate = path.join(runDirectory, 'intermediate');
  const runtime = path.join(runDirectory, 'runtime');
  await mkdir(path.dirname(blend), { recursive: true });

  runBlender(options.blender, {
    script: 'create-prisoner-base.py',
    scriptArguments: ['--asset-id', options.assetId, '--output', blend],
    label: 'create-prisoner-base.py',
  });
  runBlender(options.blender, {
    blend,
    script: 'scene-fingerprint.py',
    scriptArguments: ['--output', fingerprint],
    label: 'scene-fingerprint.py',
  });

  const artefacts = new Map([['scene-fingerprint.json', await digest(fingerprint)]]);
  if (options.mode === 'scene') return artefacts;

  runBlender(options.blender, {
    blend,
    script: 'export-directional-sprites.py',
    scriptArguments: ['--asset-id', options.assetId, '--output', intermediate],
    label: 'export-directional-sprites.py',
  });
  // The exporter writes frames to `<--output>/<asset-id>/...`; the packer takes
  // the directory *containing* that single asset directory.
  runBlender(options.blender, {
    script: 'pack-sprite-atlas.py',
    scriptArguments: ['--input', intermediate, '--contract', contractPath, '--output', runtime],
    label: 'pack-sprite-atlas.py',
  });
  runNode('build-asset-registry.mjs', [runtime], 'build-asset-registry.mjs');
  // Proves the freshly generated batch still satisfies the authored contract,
  // not only that two runs agree with each other. Two identical invalid runs
  // would otherwise pass.
  runNode('validate-runtime-atlas.mjs', [runtime], 'validate-runtime-atlas.mjs');

  for (const name of (await readdir(runtime)).sort()) {
    artefacts.set(name, await digest(path.join(runtime, name)));
  }
  return artefacts;
}

function report(runs) {
  const names = [...new Set(runs.flatMap((run) => [...run.keys()]))].sort();
  const mismatched = [];
  const width = Math.max(...names.map((name) => name.length));
  for (const name of names) {
    const digests = runs.map((run) => run.get(name));
    const agree = digests.every((value) => value !== undefined && value === digests[0]);
    if (!agree) mismatched.push(name);
    console.log(`${agree ? 'OK  ' : 'DIFF'}  ${name.padEnd(width)}  ${digests.map((value) => (value ?? '<missing>').slice(0, 16)).join('  ')}`);
    if (!agree) {
      digests.forEach((value, index) => console.log(`        run ${index + 1}: ${value ?? '<missing>'}`));
    }
  }
  return mismatched;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage: node tooling/verify-pipeline-determinism.mjs [--mode scene|full] [--asset-id <id>]
       [--runs <n>] [--blender <path>] [--work <dir>] [--keep]`);
    return 0;
  }

  const work = options.work ?? (await mkdtemp(path.join(os.tmpdir(), 'lockstate-pipeline-determinism-')));
  if (path.resolve(work).startsWith(repositoryRoot + path.sep)) {
    throw new Error(`--work must be outside the repository so a determinism run cannot overwrite reviewed art: ${work}`);
  }
  await mkdir(work, { recursive: true });
  console.log(`Blender: ${options.blender}`);
  console.log(`Mode:    ${options.mode} (${options.mode === 'scene' ? 'source scene only' : 'render and pack'})`);
  console.log(`Asset:   ${options.assetId}`);
  console.log(`Work:    ${work}\n`);

  const runs = [];
  try {
    for (let index = 0; index < options.runs; index += 1) {
      const runDirectory = path.join(work, `run-${index + 1}`);
      if (existsSync(runDirectory)) await rm(runDirectory, { recursive: true, force: true });
      const started = Date.now();
      runs.push(await executeRun(options, runDirectory));
      console.log(`run ${index + 1} finished in ${Math.round((Date.now() - started) / 1000)}s`);
    }
  } finally {
    if (!options.keep && options.work === undefined) {
      // Only clean up a directory this script created.
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('\nsha256 of the reproducible artefacts (rendered frames are excluded by design):\n');
  const mismatched = report(runs);
  if (mismatched.length > 0) {
    console.error(`\n${mismatched.length} artefact(s) differ across ${options.runs} identical runs: ${mismatched.join(', ')}`);
    console.error('The Blender-to-atlas pipeline is not reproducible at this commit. See docs/ART_PIPELINE.md.');
    return 1;
  }
  console.log(`\nAll artefacts identical across ${options.runs} independent runs.`);
  return 0;
}

process.exitCode = await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  return 2;
});
