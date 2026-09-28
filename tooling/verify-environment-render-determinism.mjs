/**
 * Environment-object Blender render determinism gate (issue #1041 follow-up).
 *
 * PR #1041 added `tooling/blender/render-environment-objects.py` and its own
 * docblock claimed two properties: byte-identical output across independent
 * runs, and `frameAspectDriftFromFootprint == 0.0` "by construction". Both
 * were true -- `docs/ART_PIPELINE.md` ("Reproducibility") records two
 * concurrent runs agreeing on a whole-batch digest, `b4e70814…` over the 23
 * files and `d136db43…` over the 23 decoded pixel buffers -- but nothing
 * *executable* checked either claim. The docblock said so about itself:
 * "NOTHING CHECKS THAT AUTOMATICALLY". This script is that check.
 *
 * It is the environment-render sibling of
 * `tooling/verify-pipeline-determinism.mjs`, which does the equivalent job
 * for the *character* pipeline (`create-prisoner-base.py` through
 * `pack-sprite-atlas.py`). It is a separate script rather than a mode of that
 * one because the two pipelines share no steps after `pipeline_common.py`:
 * the character chain builds a scene, exports 72 frames and packs an atlas;
 * this one renders a fixed, already-committed `.blend` catalogue straight to
 * one PNG per collection, with no packer and no registry step. Sharing a
 * driver would have meant branching most of `executeRun` on a `--pipeline`
 * flag for no shared code beneath it.
 *
 * ## WHAT IT COMPARES, AND WHY
 *
 * It runs `render-environment-objects.py` N times (default 2) against the
 * same committed `.blend` catalogue, each into its own scratch directory, and
 * compares the SHA-256 of:
 *
 *   - every rendered PNG the run produced;
 *   - `environment-objects.render.json`, the sidecar -- which carries
 *     `frameAspectDriftFromFootprint`, `frameTiles`, `sizePx` and the
 *     recorded `sha256`/`pixelSha256` for every entry, so a whole-file digest
 *     match subsumes a field-by-field one.
 *
 * The sidecar carries no timestamp and no absolute path (unlike the PNGs
 * before their own rewrite -- see below), so, unlike the character pipeline's
 * atlas manifest, there is nothing in it that has to be excluded on principle.
 *
 * ## WHY THE PNGs ARE COMPARABLE AT ALL
 *
 * A raw Blender render is not byte-stable: this repository's own render, with
 * this exact script's rewrite disabled, was measured (2026-09-06, in the
 * container this gate was built in) writing `IHDR sRGB gAMA cHRM eXIf oFFs
 * pHYs tEXt tEXt tEXt tEXt tEXt tEXt tEXt IDAT IEND` -- seven `tEXt` chunks,
 * carrying `Date`, `RenderTime` and the absolute source `.blend` path among
 * them, none of which can be equal between two runs seconds apart on two
 * different absolute paths. `render-environment-objects.py`'s own
 * `_flip_and_rewrite_png` reverses row order (owed regardless, for the
 * north-up/east-right flip described in its docstring) and re-emits the file
 * carrying only `IHDR`, the four colour-space chunks and `IDAT` -- so the
 * metadata is gone before the file this script hashes ever exists on disk.
 * That rewrite is what makes comparing the *final* PNGs meaningful; comparing
 * the transient pre-rewrite bytes would fail for reasons that say nothing
 * about the pipeline, the same reasoning
 * `tooling/verify-pipeline-determinism.mjs` already gives for excluding
 * `assets/intermediate/` frames.
 *
 * ## WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * A green run proves the renderer produced byte-identical PNGs and an
 * identical sidecar from N independent invocations, on the Blender version
 * actually running, right now. It does NOT prove:
 *
 *   - that the *committed* renders under `assets/rendered/environment/`
 *     would reproduce today -- that would require re-rendering all 23 and
 *     comparing against the committed bytes, which `--only` deliberately
 *     lets a caller do but which this script does not do by default;
 *   - anything about a Blender version other than the one it ran under --
 *     see `pipeline_common.require_blender_version()`, which this script
 *     does not bypass and refuses to run under
 *     `LOCKSTATE_ALLOW_BLENDER_MISMATCH` (below);
 *   - that the pixels are *correct* -- only that they are repeatable. ADR
 *     0100's geometry invariants (frame never narrower than footprint, drift
 *     zero) are checked from committed JSON, without Blender, by
 *     `tooling/validate-rendered-art-catalog.mjs` and
 *     `tests/contract/rendered-art-pipeline-contract.test.ts` instead.
 *
 * ## WHY THIS CANNOT BE A REQUIRED CI CHECK, AND WHAT IT IS INSTEAD
 *
 * `.github/workflows/ci.yml` has no step anywhere that installs Blender, on
 * any of its three jobs (`verify`, `assets`, `browser`) -- read, not assumed,
 * on 2026-09-06. So this script cannot run in CI today, on a fork PR or on
 * `main`, and a required check that never executes is a green light that
 * means nothing. It runs where Blender actually is: this container, or a
 * machine with Blender installed. `tests/determinism/environment-render-determinism.test.ts`
 * wires the fast single-asset form of it into `pnpm test` with the same
 * `it.skipIf` idiom `tests/determinism/art-pipeline-determinism.test.ts`
 * already uses for the character pipeline's live check -- SKIPPED where
 * Blender is absent or mismatched, never silently passed, and actually
 * exercised whenever it is present. Making this a *required*, always-green
 * CI job would need Blender 5.2.1 installed on the self-hosted runner and a
 * new job in `ci.yml`; that file is reserved to the owner
 * (`AGENTS.md` reservation 3) and this change is not the one hunk of it ADR
 * 0100 already had released, so that is a decision for the owner, not this
 * script.
 *
 * `LOCKSTATE_ALLOW_BLENDER_MISMATCH` downgrades `require_blender_version()`
 * to a warning; this script does not set it, ever, and output produced under
 * it must not be committed (`pipeline_common.py`'s own docstring says the
 * same about every Blender entry point).
 *
 * ## USAGE
 *
 *   node tooling/verify-environment-render-determinism.mjs [options]
 *
 *     --only <ids>        Comma-separated collection asset ids to render.
 *                          Default: every collection the catalogue declares
 *                          (all 23) -- several minutes; see `--runs`.
 *     --runs <n>           Independent runs to compare. Default: 2.
 *     --blender <path>     Blender executable. Default: $LOCKSTATE_BLENDER,
 *                          else `blender` (deliberately not `/opt/blender/blender`
 *                          -- Blender is intentionally kept off PATH in the
 *                          container this was authored in, so an unset
 *                          `LOCKSTATE_BLENDER` fails closed rather than
 *                          guessing a path).
 *     --catalog <path>     The `.blend` catalogue to render. Default:
 *                          assets/source/blender/environment.mvp.catalog.blend.
 *     --work <dir>         Scratch directory. Default: a fresh temp directory.
 *     --keep               Do not delete the scratch directory.
 *
 * Never point `--work` at the repository: this must not overwrite the
 * reviewed renders in `assets/rendered/environment/`.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blenderScripts = path.join(repositoryRoot, 'tooling', 'blender');
const defaultCatalog = path.join(repositoryRoot, 'assets/source/blender/environment.mvp.catalog.blend');
const rendererScript = 'render-environment-objects.py';

function parseArguments(argv) {
  // Written out (not `only: []`) for the same reason
  // `verify-pipeline-determinism.mjs` writes out `work: undefined`: a typed
  // empty-array literal here would infer `never[]`, and `--only` could then
  // never assign a string into it (#602).
  /** @type {{ only: string[], runs: number, blender: string, catalog: string, work: string | undefined, keep: boolean, help?: boolean }} */
  const options = {
    only: [],
    runs: 2,
    blender: process.env.LOCKSTATE_BLENDER ?? 'blender',
    catalog: defaultCatalog,
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
      case '--only': options.only = next().split(',').map((id) => id.trim()).filter((id) => id.length > 0); break;
      case '--runs': options.runs = Number.parseInt(next(), 10); break;
      case '--blender': options.blender = next(); break;
      case '--catalog': options.catalog = path.resolve(next()); break;
      case '--work': options.work = path.resolve(next()); break;
      case '--keep': options.keep = true; break;
      case '--help': case '-h': options.help = true; break;
      default: throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!Number.isInteger(options.runs) || options.runs < 2) throw new Error('--runs must be an integer of at least 2');
  return options;
}

/**
 * Written out because `scriptArguments = []` infers `never[]`, which makes
 * every call site below an error about `never` rather than about Blender
 * (#602) -- the same annotation `verify-pipeline-determinism.mjs` carries on
 * its own copy of this function, for the same reason.
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

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Runs the renderer once and returns { artefactName -> sha256 }. */
async function executeRun(options, runDirectory) {
  await mkdir(runDirectory, { recursive: true });
  const scriptArguments = ['--output', runDirectory];
  if (options.only.length > 0) scriptArguments.push('--only', options.only.join(','));
  runBlender(options.blender, {
    blend: options.catalog,
    script: rendererScript,
    scriptArguments,
    label: rendererScript,
  });

  const sidecarPath = path.join(runDirectory, 'environment-objects.render.json');
  if (!existsSync(sidecarPath)) {
    throw new Error(`${rendererScript} did not write ${sidecarPath}`);
  }
  const sidecar = JSON.parse(await readFile(sidecarPath, 'utf8'));
  if (!Array.isArray(sidecar.entries) || sidecar.entries.length === 0) {
    throw new Error(`${sidecarPath} declares no entries -- did --only name a collection the catalogue does not have?`);
  }
  if (options.only.length > 0) {
    const requested = new Set(options.only);
    const rendered = new Set(sidecar.entries.map((entry) => entry.assetId));
    const missing = [...requested].filter((id) => !rendered.has(id));
    const unexpected = [...rendered].filter((id) => !requested.has(id));
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(`${sidecarPath} does not match --only: missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`);
    }
  }

  const artefacts = new Map([['environment-objects.render.json', await digest(sidecarPath)]]);
  for (const entry of sidecar.entries) {
    const imagePath = path.join(runDirectory, entry.image);
    if (!existsSync(imagePath)) throw new Error(`${sidecarPath} names ${entry.image} but it was not written`);
    artefacts.set(entry.image, await digest(imagePath));
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
    console.log(`Usage: node tooling/verify-environment-render-determinism.mjs [--only <id,id,...>]
       [--runs <n>] [--blender <path>] [--catalog <path>] [--work <dir>] [--keep]`);
    return 0;
  }
  if (!existsSync(options.catalog)) {
    console.error(`Catalogue not found: ${options.catalog}`);
    console.error(
      "If this is a Git LFS pointer, run `git lfs pull --include=\"assets/source/blender/environment.mvp.catalog.blend\"` first.",
    );
    return 2;
  }

  const work = options.work ?? (await mkdtemp(path.join(os.tmpdir(), 'lockstate-environment-render-determinism-')));
  if (path.resolve(work).startsWith(repositoryRoot + path.sep)) {
    throw new Error(`--work must be outside the repository so a determinism run cannot overwrite reviewed art: ${work}`);
  }
  await mkdir(work, { recursive: true });
  console.log(`Blender: ${options.blender}`);
  console.log(`Catalog: ${path.relative(repositoryRoot, options.catalog)}`);
  console.log(`Only:    ${options.only.length > 0 ? options.only.join(', ') : '(every collection)'}`);
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
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log('\nsha256 of every rendered PNG and the sidecar (raw pre-rewrite Blender output is never compared -- see docblock):\n');
  const mismatched = report(runs);
  if (mismatched.length > 0) {
    console.error(`\n${mismatched.length} artefact(s) differ across ${options.runs} identical runs: ${mismatched.join(', ')}`);
    console.error('The environment-object render is not reproducible at this commit. See docs/ART_PIPELINE.md ("Environment objects").');
    return 1;
  }
  console.log(`\nAll artefacts identical across ${options.runs} independent runs.`);
  return 0;
}

process.exitCode = await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  return 2;
});
