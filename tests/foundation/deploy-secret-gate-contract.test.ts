import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `scripts/check-deploy-secrets.sh` is the only mechanical enforcement in this
 * repository of `AGENTS.md`'s "do not put secrets, service-role keys or
 * production credentials in client code" and of ADR 0008's Z0 rule. Issue #344
 * found it stating a rule about *everything* prefixed `VITE_` while checking
 * one hard-coded variable name, and never looking at the artefact the rule is
 * about.
 *
 * A green gate is not a guarding gate, so every rule here is exercised against
 * the case it exists to catch. Reading the script's source and asserting it
 * contains a pattern would pass against a script whose logic never runs.
 *
 * No value in this file is or resembles a live credential: the service-role
 * JWT is assembled at run time from a literal claims object, and the secret-key
 * strings are a prefix plus a run of one repeated character.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gateScript = path.join('scripts', 'check-deploy-secrets.sh');
const bashCommand = process.env.LOCKSTATE_BASH ?? 'bash';

/** A shape the gate must recognise, built so nothing here looks like a real key. */
const FABRICATED = {
  secretKeyPrefixed: `sb_secret_${'A'.repeat(40)}`,
  accessTokenPrefixed: `sbp_${'B'.repeat(40)}`,
  publishableKey: `sb_publishable_${'C'.repeat(40)}`,
  cloudflareToken: `cf-test-token-${'D'.repeat(30)}`,
} as const;

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** A JWT with the given role claim. The signature segment is filler; the gate reads only the payload. */
function jwtWithRole(role: string): string {
  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ iss: 'supabase', role, iat: 0, exp: 0 }),
    'E'.repeat(43),
  ].join('.');
}

const SERVICE_ROLE_JWT = jwtWithRole('service_role');
const ANON_JWT = jwtWithRole('anon');

interface GateResult {
  readonly status: number;
  readonly output: string;
}

function runGate(mode: 'env' | 'bundle' | 'all', environment: Readonly<Record<string, string>>): GateResult {
  const result = spawnSync(bashCommand, [gateScript, mode], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...environment },
  });

  expect(
    result.error,
    `could not run ${bashCommand}; set LOCKSTATE_BASH to a bash on this machine. The deploy gate is a bash script, so a run that cannot execute it verifies nothing`,
  ).toBeUndefined();

  return { status: result.status ?? -1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** The four names the gate requires present, all shaped legitimately. */
function validEnvironment(): Record<string, string> {
  return {
    CLOUDFLARE_API_TOKEN: FABRICATED.cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: '0'.repeat(32),
    VITE_SUPABASE_URL: 'https://project-ref.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: FABRICATED.publishableKey,
  };
}

/** Asserts a refusal, and that no part of the offending value was printed. */
function expectRefusal(result: GateResult, secretValue: string): void {
  expect(result.status, `expected a refusal, got:\n${result.output}`).toBe(1);
  expect(result.output).toContain('::error::');
  expect(result.output, 'the gate must never print any part of a value').not.toContain(secretValue);
}

describe('deploy secret gate: the environment sweep covers the class, not a list of names', () => {
  it('passes a legitimate configuration, so the gate is not simply always-red', () => {
    const result = runGate('env', validEnvironment());
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Deployment configuration present and shaped correctly');
    // The positive control: the sweep must actually have looked at the two
    // `VITE_` variables. A sweep that enumerated nothing would also pass.
    expect(result.output).toContain('Swept 2 VITE_-prefixed variable(s)');
  });

  it('accepts an anon JWT as the publishable key, so the JWT rule is not a blanket refusal of JWTs', () => {
    const result = runGate('env', { ...validEnvironment(), VITE_SUPABASE_PUBLISHABLE_KEY: ANON_JWT });
    expect(result.status, result.output).toBe(0);
  });

  it('still refuses a service-role JWT behind the name it always knew', () => {
    const result = runGate('env', { ...validEnvironment(), VITE_SUPABASE_PUBLISHABLE_KEY: SERVICE_ROLE_JWT });
    expectRefusal(result, SERVICE_ROLE_JWT);
    expect(result.output).toContain('VITE_SUPABASE_PUBLISHABLE_KEY carries a service_role JWT');
  });

  it.each([
    ['a secret-key prefix', FABRICATED.secretKeyPrefixed, 'a Supabase secret-key prefix (sb_secret_)'],
    ['an access-token prefix', FABRICATED.accessTokenPrefixed, 'a Supabase access-token prefix (sbp_)'],
    ['a service-role JWT', SERVICE_ROLE_JWT, 'a service_role JWT'],
  ])(
    'refuses %s behind a VITE_ name the script has never heard of',
    (_label: string, value: string, reason: string) => {
      // The whole point of generalising: this name appears nowhere in the
      // script, in .env.example, or in the deploy workflow. It also does not
      // trip the name rule -- `TOKEN` is deliberately outside it -- so the
      // only thing that can catch this is the value-shape sweep over the
      // class.
      const result = runGate('env', { ...validEnvironment(), VITE_TELEMETRY_INGEST_TOKEN: value });
      expectRefusal(result, value);
      expect(result.output).toContain(`VITE_TELEMETRY_INGEST_TOKEN carries ${reason}`);
      expect(
        result.output.split('\n').filter((line) => line.startsWith('::error::')),
        'exactly one rule should have fired, so this proves the value-shape sweep rather than the name rule',
      ).toHaveLength(1);
    },
  );

  it('refuses a VITE_ name that declares a secret even when its value is innocuous', () => {
    // The name is the mistake. Nothing named `VITE_*SECRET*` can be correct,
    // because everything named `VITE_*` is published.
    const result = runGate('env', { ...validEnvironment(), VITE_SUPABASE_SECRET_KEY: 'not-set-yet' });
    expectRefusal(result, 'not-set-yet');
    expect(result.output).toContain('VITE_SUPABASE_SECRET_KEY is a VITE_-prefixed name that declares a secret');
  });

  it('does not refuse a publishable value merely for being named a key or a token', () => {
    // `TOKEN` and `KEY` are deliberately outside the name rule: both have
    // legitimate public forms, and a rule that refused them would be deleted
    // rather than fixed.
    const result = runGate('env', {
      ...validEnvironment(),
      VITE_TURNSTILE_SITE_TOKEN: `0x${'4'.repeat(20)}`,
      VITE_MAP_TILE_KEY: 'e'.repeat(32),
    });
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Swept 4 VITE_-prefixed variable(s)');
  });

  it('still refuses a missing required name and a non-https URL', () => {
    const missing = runGate('env', { ...validEnvironment(), VITE_SUPABASE_URL: '' });
    expect(missing.status, missing.output).toBe(1);
    expect(missing.output).toContain('Required secret VITE_SUPABASE_URL is not set');

    const insecure = runGate('env', { ...validEnvironment(), VITE_SUPABASE_URL: 'http://project-ref.supabase.co' });
    expect(insecure.status, insecure.output).toBe(1);
    expect(insecure.output).toContain('VITE_SUPABASE_URL must be an https:// URL');
  });
});

describe('deploy secret gate: the bundle scan looks at the artefact, which is what the rule is about', () => {
  let bundleDirectory: string;

  beforeEach(() => {
    bundleDirectory = mkdtempSync(path.join(tmpdir(), 'lockstate-bundle-scan-'));
    mkdirSync(path.join(bundleDirectory, 'assets'), { recursive: true });
  });

  afterEach(() => {
    rmSync(bundleDirectory, { recursive: true, force: true });
  });

  function writeBundleFile(relativePath: string, contents: string): void {
    writeFileSync(path.join(bundleDirectory, relativePath), contents, 'utf8');
  }

  function scanBundle(extra: Readonly<Record<string, string>> = {}): GateResult {
    return runGate('bundle', { ...validEnvironment(), ...extra, LOCKSTATE_BUNDLE_DIR: bundleDirectory });
  }

  it('passes a clean bundle that carries a publishable key and an anon JWT', () => {
    writeBundleFile('index.html', '<!doctype html><title>Lockstate</title>');
    writeBundleFile(
      path.join('assets', 'index-abc12345.js'),
      `const u="https://project-ref.supabase.co",k="${FABRICATED.publishableKey}",j="${ANON_JWT}";export{u,k,j};`,
    );
    const result = scanBundle();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('Scanned 2 file(s)');
    expect(result.output).toContain('Built artefact carries no secret-shaped material');
  });

  it.each([
    ['a secret key', FABRICATED.secretKeyPrefixed, 'a Supabase secret key (sb_secret_ prefix)'],
    ['an access token', FABRICATED.accessTokenPrefixed, 'a Supabase access token (sbp_ prefix)'],
  ])('refuses a bundle containing %s', (_label: string, value: string, reason: string) => {
    writeBundleFile('index.html', '<!doctype html><title>Lockstate</title>');
    writeBundleFile(path.join('assets', 'index-abc12345.js'), `const k="${value}";export{k};`);
    const result = scanBundle();
    expectRefusal(result, value);
    expect(result.output).toContain(reason);
    expect(result.output).toContain('index-abc12345.js');
  });

  it('refuses a bundle containing a service_role JWT', () => {
    writeBundleFile(path.join('assets', 'index-abc12345.js'), `const k="${SERVICE_ROLE_JWT}";export{k};`);
    const result = scanBundle();
    expectRefusal(result, SERVICE_ROLE_JWT);
    expect(result.output).toContain('contains a service_role JWT');
  });

  it('refuses a bundle containing the literal service_role, whatever spliced it in', () => {
    // The route that never touches a `VITE_` name: a literal committed into a
    // source file, or a value passed through Vite's `define`.
    writeBundleFile(path.join('assets', 'index-abc12345.js'), 'const r="service_role";export{r};');
    const result = scanBundle();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('the literal service_role');
  });

  it('refuses a bundle containing a PEM private key block', () => {
    const pem = ['-----BEGIN RSA PRIVATE KEY-----', 'F'.repeat(64), '-----END RSA PRIVATE KEY-----'].join('\n');
    writeBundleFile(path.join('assets', 'signing-key.txt'), pem);
    const result = scanBundle();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain('a PEM private key block');
  });

  it('refuses a bundle carrying the value of a non-public deploy credential', () => {
    // Reported by variable name, never by value.
    writeBundleFile(path.join('assets', 'index-abc12345.js'), `const t="${FABRICATED.cloudflareToken}";export{t};`);
    const result = scanBundle();
    expectRefusal(result, FABRICATED.cloudflareToken);
    expect(result.output).toContain('The value of CLOUDFLARE_API_TOKEN, which is not a public variable, appears in');
  });

  it('refuses to pass when there is no build output to look at', () => {
    const missing = runGate('bundle', {
      ...validEnvironment(),
      LOCKSTATE_BUNDLE_DIR: path.join(bundleDirectory, 'does-not-exist'),
    });
    expect(missing.status, missing.output).toBe(1);
    expect(missing.output).toContain('found no build output');

    const empty = scanBundle();
    expect(empty.status, empty.output).toBe(1);
    expect(empty.output).toContain('empty');
  });
});

describe('deploy secret gate: it never makes a claim wider than the check it ran', () => {
  it('says that the environment mode establishes nothing about the artefact', () => {
    const result = runGate('env', validEnvironment());
    expect(result.status, result.output).toBe(0);
    // Issue #344's third finding: the old success line read as a statement
    // about what was shipped while only the environment had been inspected.
    expect(result.output).toContain('This says nothing about the built artefact');
  });

  it('rejects an unknown mode rather than defaulting to the weaker check', () => {
    const result = runGate('everything' as 'env', validEnvironment());
    expect(result.status).toBe(2);
    expect(result.output).toContain("Unknown mode 'everything'");
  });

  it('is invoked in both modes by the deploy workflow, before anything is published', async () => {
    const { readFile } = await import('node:fs/promises');
    const workflow = await readFile(path.join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');

    for (const mode of ['env', 'bundle'] as const) {
      const invocations = workflow.split('\n').filter((line) => {
        // Command position only: a YAML list dash and a `run:` key peel off,
        // and what remains has to begin with the invocation. A line that
        // merely mentions the script does not count as calling it.
        const command = line
          .trim()
          .replace(/^-\s*/u, '')
          .replace(/^run:\s*/u, '');
        return command === `bash ${gateScript.split(path.sep).join('/')} ${mode}`;
      });
      expect(
        invocations.length,
        `the deploy workflow must call the gate in ${mode} mode in both the staging and production jobs`,
      ).toBe(2);
    }
  });
});
