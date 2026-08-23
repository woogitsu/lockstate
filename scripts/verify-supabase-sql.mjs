#!/usr/bin/env node
/**
 * Applies every migration in `supabase/migrations/` and runs every pgTAP
 * suite in `supabase/tests/` against a plain PostgreSQL server, using the
 * compatibility harness in `scripts/sql/supabase-compat-harness.sql`.
 *
 * Why this exists: the Supabase local stack needs container images that
 * are not always reachable (a restricted network, an offline CI runner),
 * which left the SQL in this repository unexecuted through issues #20 and
 * #36. A plain Postgres plus pgTAP is installable without Docker and
 * proves the part of the contract that is actually SQL.
 *
 * What a green run proves: the migrations apply in order, constraints,
 * triggers, functions and privilege arithmetic behave as written, and the
 * RLS policies evaluate as intended for the emulated roles.
 *
 * What it does not prove: anything about GoTrue, JWT issuance, PostgREST,
 * Storage or Realtime. `supabase test db` stays the stronger check, and
 * `pnpm verify:stack` stronger still. This is not academic -- the harness
 * once modelled Supabase's *old* default table grants, was therefore more
 * permissive than the platform, and passed 36/36 assertions on a schema no
 * real project could have served a single request from. See
 * docs/CLOUD_SAVE.md, "Defects found by executing this schema" (defect 4).
 *
 * Usage:
 *   sudo -u postgres node scripts/verify-supabase-sql.mjs
 *   DATABASE_URL=postgres://user:pass@host:5432/scratch node scripts/verify-supabase-sql.mjs
 *
 * Requires: a reachable PostgreSQL 16 server, the `psql` client and the
 * pgTAP extension (Debian/Ubuntu: `postgresql-16 postgresql-16-pgtap`).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const harnessPath = join(repositoryRoot, 'scripts/sql/supabase-compat-harness.sql');
const migrationsDirectory = join(repositoryRoot, 'supabase/migrations');
const testsDirectory = join(repositoryRoot, 'supabase/tests');

const databaseUrl = process.env.DATABASE_URL ?? '';
const scratchDatabase = process.env.VERIFY_DATABASE_NAME ?? 'lockstate_sql_verify';

function psql(args, { input, database } = {}) {
  const connection = databaseUrl === '' ? ['-d', database ?? scratchDatabase] : [databaseUrl];
  return execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...connection, ...args], {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
  });
}

function sortedSqlFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, path: join(directory, name) }));
}

/**
 * Parses TAP emitted through psql. Only the plan and the ok/not-ok lines
 * matter; psql indents them, and pgTAP wraps diagnostics in `#` lines.
 */
function parseTap(output) {
  const passed = [];
  const failed = [];
  let planned;
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    const plan = /^1\.\.(\d+)$/.exec(line);
    if (plan !== null) planned = Number(plan[1]);
    if (/^not ok \d+/.test(line)) failed.push(line);
    else if (/^ok \d+/.test(line)) passed.push(line);
  }
  return { passed, failed, planned };
}

function run() {
  console.log('Preparing a scratch database…');
  if (databaseUrl === '') {
    execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${scratchDatabase}`], { encoding: 'utf8' });
    execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `create database ${scratchDatabase}`], { encoding: 'utf8' });
  }

  psql(['-f', harnessPath]);
  console.log('Applied the Supabase compatibility harness (NOT Supabase itself — see the file header).');

  for (const migration of sortedSqlFiles(migrationsDirectory)) {
    psql(['-f', migration.path]);
    console.log(`  applied ${migration.name}`);
  }

  let totalPassed = 0;
  const failures = [];
  for (const suite of sortedSqlFiles(testsDirectory)) {
    // pgTAP suites manage their own transaction and report failures as
    // TAP rather than as a non-zero exit, so ON_ERROR_STOP must not abort
    // the run before the plan is read.
    let output;
    try {
      output = execFileSync(
        'psql',
        ['-X', '-q', ...(databaseUrl === '' ? ['-d', scratchDatabase] : [databaseUrl]), '-f', suite.path],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }

    const { passed, failed, planned } = parseTap(output);
    totalPassed += passed.length;
    const ran = passed.length + failed.length;
    const planMismatch = planned !== undefined && planned !== ran;

    if (failed.length > 0 || planMismatch || ran === 0) {
      failures.push({ suite: suite.name, failed, planned, ran, output });
      console.log(`  ✗ ${suite.name}: ${passed.length}/${ran} passed${planMismatch ? ` (planned ${planned})` : ''}`);
    } else {
      console.log(`  ✓ ${suite.name}: ${passed.length}/${ran} passed`);
    }
  }

  if (failures.length > 0) {
    console.error('\nFailed suites:');
    for (const failure of failures) {
      console.error(`\n--- ${failure.suite}`);
      for (const line of failure.failed) console.error(`  ${line}`);
      if (failure.failed.length === 0) console.error(failure.output.trim().split('\n').slice(-20).join('\n'));
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll pgTAP suites passed (${totalPassed} assertions).`);
}

run();
