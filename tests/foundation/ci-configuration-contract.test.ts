import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The resolver the *build* uses, imported rather than re-described, so the
// assertion that a version bump reaches a player is a behavioural one. See
// "version bump workflow contract" at the foot of this file.
import { packageVersion } from '../../tooling/build-identity.mjs';

/**
 * Contract tests for repository *configuration* — the files that describe how
 * this project is built, checked out and deployed, as opposed to the code that
 * runs. Issue #138 found four gates that were weaker than they looked, and
 * every one of them was invisible for the same reason: the configuration file
 * and the check that is supposed to enforce it lived apart, so editing one and
 * not the other left the suite green.
 *
 * These tests close that gap mechanically. They read the configuration and the
 * checker and assert that the two still agree, so a header, a line-ending
 * pattern or a provisioning script cannot be added on one side alone.
 *
 * Sibling of `tests/foundation/repository-contract.test.ts`, which asserts the
 * same kind of repository-shaped fact about the toolchain pins and tsconfig.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readRepositoryFile(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

/**
 * `git` is the authority on both file modes and attribute resolution, and
 * re-implementing either in TypeScript is how these tests would become a
 * fiction that agrees with itself. A missing or failing `git` is therefore a
 * failure rather than a skip: every checkout of this repository is a git
 * checkout, and CI runs on one.
 */
function git(args: readonly string[]): string {
  const result = spawnSync('git', [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(`git ${args.join(' ')} could not be run: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited ${String(result.status)}: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

interface HeaderRule {
  readonly pathPattern: string;
  readonly headerName: string;
  readonly headerValue: string;
}

/**
 * Parses the Cloudflare `_headers` format: an unindented path pattern opens a
 * rule, and the indented `Name: value` lines under it are the headers that
 * rule sets. Blank lines and `#` comments are ignored.
 */
function parseHeadersFile(contents: string): readonly HeaderRule[] {
  const rules: HeaderRule[] = [];
  let pathPattern: string | undefined;

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.trim().length === 0 || line.trim().startsWith('#')) {
      continue;
    }

    if (!/^\s/u.test(line)) {
      pathPattern = line.trim();
      continue;
    }

    const separator = line.indexOf(':');
    expect(
      separator,
      `public/_headers line "${line.trim()}" is indented but is not a "Name: value" header.`,
    ).toBeGreaterThan(0);
    expect(pathPattern, `public/_headers sets a header before any path pattern: "${line.trim()}".`)
      .toBeDefined();

    rules.push({
      pathPattern: pathPattern ?? '',
      headerName: line.slice(0, separator).trim(),
      headerValue: line.slice(separator + 1).trim(),
    });
  }

  expect(rules.length, 'public/_headers parsed to no rules at all; the parser is broken.')
    .toBeGreaterThan(0);

  return rules;
}

/**
 * Splits the top-level elements of an array literal's body by bracket depth,
 * ignoring anything inside a quoted string.
 *
 * This exists so the entry parser below cannot fail *quietly*. The previous
 * version matched `['name', 'value']` pairs with one regex and only checked
 * that it had found at least one, so an entry it could not read simply went
 * missing -- and a missing entry makes the "same value" assertion below
 * compare `undefined` against nothing at all. The Content-Security-Policy
 * value is the case that exposed it: it contains `'self'`, so the verifier has
 * to quote it with double quotes, and a single-quote-only pattern skipped it.
 */
function splitTopLevelElements(body: string): readonly string[] {
  const elements: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = '';

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index] ?? '';

    if (quote !== undefined) {
      current += character;
      if (character === '\\') {
        current += body[index + 1] ?? '';
        index += 1;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }

    if (character === '[') {
      depth += 1;
      if (depth === 1) {
        current = '';
        continue;
      }
    }

    if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        elements.push(current);
        current = '';
        continue;
      }
    }

    if (depth >= 1) {
      current += character;
    }
  }

  return elements;
}

/**
 * Reads `SECURITY_HEADER_BASELINE` out of the verifier as text rather than
 * importing it. `scripts/verify-deployment-preview.mjs` calls `main()` at
 * module scope, so importing it would build the project and start a preview
 * server from inside a unit test.
 *
 * A parser that silently returned an empty set would make the assertions below
 * vacuously true, so failing to find the declaration is an explicit failure --
 * and so is finding fewer entries than the literal has elements.
 */
function parseSecurityHeaderBaseline(source: string): ReadonlyMap<string, string> {
  const declaration = /const SECURITY_HEADER_BASELINE = \[([\s\S]*?)\n\];/u.exec(source);
  expect(
    declaration?.[1],
    'Could not find the SECURITY_HEADER_BASELINE declaration in scripts/verify-deployment-preview.mjs.',
  ).toBeDefined();

  // The declaration body already sits *inside* the outer `[...]`, so each
  // top-level `[` here opens one entry.
  const elements = splitTopLevelElements(declaration?.[1] ?? '');
  const entries = new Map<string, string>();

  for (const element of elements) {
    // Either quote style, because a value containing `'self'` has to be
    // double-quoted and a value containing none conventionally is not.
    const pair = /^\s*(['"])(.+?)\1\s*,\s*(['"])([\s\S]*?)\3\s*,?\s*$/u.exec(element);
    expect(
      pair,
      `SECURITY_HEADER_BASELINE element ${JSON.stringify(element)} is not a [name, value] pair this parser can read. Fix the parser rather than leaving the entry unasserted.`,
    ).not.toBeNull();
    entries.set((pair?.[2] ?? '').toLowerCase(), pair?.[4] ?? '');
  }

  expect(
    entries.size,
    'SECURITY_HEADER_BASELINE was found but parsed to no entries; the parser is broken.',
  ).toBeGreaterThan(0);

  expect(
    entries.size,
    'SECURITY_HEADER_BASELINE has more elements than this parser read, so at least one header is asserted by nothing.',
  ).toBe(elements.length);

  return entries;
}

describe('deployment header contract', () => {
  /**
   * The security headers the `/*` rule must carry, and what each is for.
   *
   * An exact set, declared here, for the reason `EXPECTED_RULE_BLOCKS` below
   * is one: the two inclusion checks in this file and in
   * `scripts/verify-deployment-preview.mjs` both compare `public/_headers`
   * against the verifier, so deleting a header from *both* in one change
   * satisfies both of them. #138's surviving mutation was exactly that shape
   * one level down -- three headers removed, every gate green -- and the
   * lesson recorded there is that an inclusion-only check cannot see a
   * deletion. This set can, because a removed header leaves an entry here with
   * nothing to match.
   */
  const REQUIRED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
    'X-Content-Type-Options': 'Stops MIME sniffing turning a served file into a script.',
    'X-Frame-Options': 'Legacy clickjacking defence, kept for anything that does not honour frame-ancestors.',
    'Referrer-Policy': 'Keeps the full URL off cross-origin requests.',
    'Permissions-Policy': 'Denies camera, geolocation, microphone and USB, none of which this game asks for.',
    'Content-Security-Policy':
      'ADR-0021. The renderer-constraining one: `img-src` must keep `data:` and `blob:` or Phaser cannot install a texture or load an atlas, and `script-src` deliberately withholds `unsafe-eval`.',
    'Strict-Transport-Security':
      'ADR-0021. Independent of the renderer; `includeSubDomains` without `preload`, because preload submission is an owner action outside this repository.',
    'Cross-Origin-Opener-Policy': 'ADR-0021. Half of cross-origin isolation; severs the opener relationship.',
    'Cross-Origin-Embedder-Policy':
      'ADR-0021. The other half. `require-corp` is what makes the page cross-origin isolated, and it will reject a future cross-origin subresource that does not opt in.',
    'Cross-Origin-Resource-Policy': 'ADR-0021. Stops another origin embedding these responses.',
  };

  it('carries exactly the security headers this contract accounts for on /*', async () => {
    const rules = parseHeadersFile(await readRepositoryFile('public/_headers'));
    const names = rules.filter((rule) => rule.pathPattern === '/*').map((rule) => rule.headerName);

    // Vacuity guard: a parser that stopped matching would make both
    // difference checks below pass while comparing nothing.
    expect(names.length, 'no headers parsed off the /* rule in public/_headers; the parser is broken').toBeGreaterThan(3);

    const missing = Object.keys(REQUIRED_SECURITY_HEADERS).filter((name) => !names.includes(name));
    expect(
      missing.map((name) => `${name}: ${REQUIRED_SECURITY_HEADERS[name]}`),
      'public/_headers no longer sets this security header on /*. If dropping it is deliberate, delete its entry here, remove it from SECURITY_HEADER_BASELINE in scripts/verify-deployment-preview.mjs, and say why in the ADR that introduced it -- all in the same change',
    ).toEqual([]);

    const unaccounted = names.filter((name) => REQUIRED_SECURITY_HEADERS[name] === undefined);
    expect(
      unaccounted,
      'public/_headers sets a header on /* that this contract does not account for: add it here with what it is for, and add it to SECURITY_HEADER_BASELINE so a real response is checked for it',
    ).toEqual([]);
  });

  /**
   * The other direction is already covered, and the two catch different
   * mistakes:
   *
   *   * `scripts/verify-deployment-preview.mjs` asserts its baseline against a
   *     real preview response, which catches a header *deleted from or
   *     weakened in* `public/_headers` — the surviving mutation in #138, where
   *     removing three of the four left every gate green.
   *   * This test asserts the reverse inclusion, which catches a header
   *     *added to* `public/_headers` and never asserted anywhere — a rule that
   *     looks enforced because its neighbours are.
   */
  it('asserts every header public/_headers sets', async () => {
    const rules = parseHeadersFile(await readRepositoryFile('public/_headers'));
    const verifierSource = await readRepositoryFile('scripts/verify-deployment-preview.mjs');
    const baseline = parseSecurityHeaderBaseline(verifierSource);

    for (const rule of rules) {
      expect(
        verifierSource.toLowerCase(),
        `public/_headers sets ${rule.headerName} on ${rule.pathPattern}, but scripts/verify-deployment-preview.mjs never mentions it, so nothing checks that a deployment actually sends it.`,
      ).toContain(rule.headerName.toLowerCase());
    }

    // The `/*` rule is the security-header rule, and for it "mentioned
    // somewhere in the verifier" is too weak: the value has to match too,
    // otherwise `Referrer-Policy: unsafe-url` would ship with the assertion
    // still pointing at the old value.
    const securityRules = rules.filter((rule) => rule.pathPattern === '/*');
    expect(
      securityRules.length,
      'public/_headers no longer has a /* rule; the security-header baseline applies to nothing.',
    ).toBeGreaterThan(0);

    for (const rule of securityRules) {
      expect(
        baseline.get(rule.headerName.toLowerCase()),
        `public/_headers sets ${rule.headerName} on /*, so SECURITY_HEADER_BASELINE in scripts/verify-deployment-preview.mjs must require the same value.`,
      ).toBe(rule.headerValue);
    }
  });
});

/**
 * The exact-set and value-equality checks above both compare `public/_headers`
 * against `SECURITY_HEADER_BASELINE`, so they agree with each other by
 * construction: editing the Content-Security-Policy's *value* in both places
 * in one change satisfies every one of them, and the verifier too, because it
 * asserts the response against the same edited baseline. The policy could be
 * weakened to `default-src *` in three lines of diff with the suite green.
 *
 * These are the properties that cannot be satisfied that way, because they are
 * stated as invariants rather than as an expected string. ADR-0021 is where
 * each comes from, and the two halves pull in opposite directions on purpose:
 * some directives must not be *widened* because widening them gives the 1.6 MB
 * of bundled third-party code back the capability the policy exists to remove,
 * and `img-src` must not be *narrowed* because Phaser genuinely needs `data:`
 * and `blob:` and taking either away breaks the renderer.
 */
describe('content-security-policy invariants', () => {
  /** Splits a CSP into directive name -> source list. */
  function parsePolicy(policy: string): ReadonlyMap<string, readonly string[]> {
    const directives = new Map<string, readonly string[]>();
    for (const part of policy.split(';')) {
      const tokens = part.trim().split(/\s+/u).filter((token) => token.length > 0);
      const name = tokens.shift();
      if (name === undefined) continue;
      directives.set(name.toLowerCase(), tokens);
    }
    return directives;
  }

  async function contentSecurityPolicy(): Promise<ReadonlyMap<string, readonly string[]>> {
    const rules = parseHeadersFile(await readRepositoryFile('public/_headers'));
    const rule = rules.find(
      (candidate) => candidate.pathPattern === '/*' && candidate.headerName.toLowerCase() === 'content-security-policy',
    );
    expect(rule, 'public/_headers sets no Content-Security-Policy on /*.').toBeDefined();

    const directives = parsePolicy(rule?.headerValue ?? '');
    expect(
      directives.size,
      'the Content-Security-Policy parsed to no directives; the parser is broken',
    ).toBeGreaterThan(3);
    return directives;
  }

  /**
   * ADR-0021 withholds `'unsafe-eval'` deliberately, on a measurement: the Zod
   * JIT it costs is not measurably faster on this repository's own save
   * envelope, and the concession would apply to the whole bundle. Phaser 4.2.1
   * needs neither keyword -- the production bundle contains no `eval(` and no
   * `new Function` outside Zod's caught feature probe.
   */
  it('never concedes unsafe-eval, unsafe-inline or a wildcard source', async () => {
    const directives = await contentSecurityPolicy();

    for (const [name, sources] of directives) {
      for (const forbidden of ["'unsafe-eval'", "'unsafe-inline'", '*', "data:", "blob:"]) {
        if (forbidden === 'data:' || forbidden === 'blob:') {
          // Allowed for img-src, and only there; see the next assertion.
          if (name === 'img-src') continue;
        }
        expect(
          sources,
          `Content-Security-Policy directive ${name} lists ${forbidden}. ADR-0021 records why the policy does not concede it; widening it needs that ADR amended, not just this line changed.`,
        ).not.toContain(forbidden);
      }
    }
  });

  /**
   * The opposite failure, and the one #105 and #138 both predicted when they
   * called a CSP "a real chance of breaking Phaser". Both allowances were
   * measured, and removing either was observed to break the game rather than
   * harden it:
   *
   *   * without `blob:`, all ten actor atlases fail with
   *     `Refused to load the image 'blob:...'` -- Phaser's loader is
   *     XHR -> Blob -> `URL.createObjectURL`
   *     (`phaser/src/loader/filetypes/ImageFile.js:132`) and has no other path;
   *   * without `data:`, Phaser's `__DEFAULT`/`__MISSING`/`__WHITE` textures
   *     (`phaser/src/textures/TextureManager.js:206-216`) never exist and the
   *     page throws `TypeError: Cannot read properties of undefined (reading
   *     'glTexture')`.
   */
  it('keeps the two img-src allowances the renderer cannot run without', async () => {
    const directives = await contentSecurityPolicy();
    const imgSrc = directives.get('img-src');

    expect(imgSrc, 'the Content-Security-Policy sets no img-src, so default-src governs images.').toBeDefined();

    for (const required of ["'self'", 'data:', 'blob:']) {
      expect(
        imgSrc,
        `Content-Security-Policy img-src no longer allows ${required}. Removing it does not harden the site, it breaks the renderer -- see ADR-0021 for the observed failure.`,
      ).toContain(required);
    }
  });

  /** The directives whose whole value is to deny, so a non-`'none'` value is a regression. */
  it('keeps the deny-only directives denying', async () => {
    const directives = await contentSecurityPolicy();

    for (const name of ['default-src', 'object-src', 'base-uri', 'frame-ancestors']) {
      expect(
        directives.get(name),
        `Content-Security-Policy ${name} must be exactly 'none'; ADR-0021 relies on it.`,
      ).toEqual(["'none'"]);
    }
  });
});

/**
 * HSTS is the one security header here whose value can be gutted without
 * removing it: `max-age=0` is a valid header that switches the protection off,
 * and it satisfies every name-based check in this file. ADR-0021 chose one
 * year with `includeSubDomains` and deliberately no `preload`.
 */
describe('strict-transport-security invariants', () => {
  const SIX_MONTHS_IN_SECONDS = 15_552_000;

  it('keeps a max-age that actually protects, and stays out of the preload list', async () => {
    const rules = parseHeadersFile(await readRepositoryFile('public/_headers'));
    const rule = rules.find(
      (candidate) => candidate.pathPattern === '/*' && candidate.headerName.toLowerCase() === 'strict-transport-security',
    );
    expect(rule, 'public/_headers sets no Strict-Transport-Security on /*.').toBeDefined();

    const value = (rule?.headerValue ?? '').toLowerCase();
    const maxAge = /max-age=(\d+)/u.exec(value);
    expect(maxAge?.[1], 'Strict-Transport-Security has no max-age.').toBeDefined();
    expect(
      Number(maxAge?.[1] ?? '0'),
      'Strict-Transport-Security max-age is below six months, which is short enough that the header stops being a protection. ADR-0021 chose one year.',
    ).toBeGreaterThanOrEqual(SIX_MONTHS_IN_SECONDS);

    expect(value, 'ADR-0021 chose includeSubDomains; dropping it needs that ADR amended.').toContain('includesubdomains');

    // `preload` is only meaningful after a submission to hstspreload.org, which
    // is an owner action outside this repository, and it is slow to undo.
    // Claiming it here would be a statement the repository cannot back.
    expect(
      value,
      'Strict-Transport-Security now claims preload. ADR-0021 deliberately does not, because it requires a submission this repository cannot make and is slow to reverse.',
    ).not.toContain('preload');
  });
});

/**
 * Issue #122 found `docs/DEPLOYMENT.md` forbidding, in prose, exactly what
 * `public/_headers` deliberately does: it told a contributor not to place
 * mutable stable-name files under `/assets/`, while ADR-0014 puts the runtime
 * atlases there on purpose and a deployment gate asserts they must *not* be
 * immutable. Two concrete wrong moves followed from believing it -- collapsing
 * `_headers` to one immutable `/assets/*` rule, which pins a re-rendered atlas
 * in every visitor's cache for a year, or relocating the atlases out of
 * `/assets/actors/` and breaking `asset-registry.json` resolution.
 *
 * The prose is corrected. This is the part that keeps it corrected, and it is
 * the check #122 asked for: every rule block in `public/_headers` has to be
 * described in the document an operator reads before touching caching.
 *
 * Scoped to the whole document rather than to its "Cache policy" section,
 * because the `/*` block sets no cache policy at all -- it carries the security
 * headers. Requiring it inside the cache section would be a false requirement.
 */
describe('cache-policy documentation contract', () => {
  /**
   * The rule blocks `public/_headers` is expected to contain, with what each
   * one is for. Declared here rather than derived from the file, for the same
   * reason `SECURITY_HEADER_BASELINE` is declared inside
   * `scripts/verify-deployment-preview.mjs` rather than parsed out of
   * `_headers`: a derived expectation shrinks silently when the file does.
   *
   * #122's own surviving mutation is deleting the `/assets/actors/*` block,
   * which pins a re-rendered atlas in every visitor's cache for a year --
   * `/assets/:file` does not cover it, but a deletion means the broader
   * Cloudflare default applies. An inclusion check in the
   * `_headers`-to-document direction cannot see that, because a deleted rule
   * is a rule that no longer needs documenting. This set can.
   */
  const EXPECTED_RULE_BLOCKS: Readonly<Record<string, string>> = {
    '/*': 'The security headers, including the ADR-0021 Content-Security-Policy, HSTS and cross-origin isolation trio. Sets no cache policy; the exact set of names is pinned by REQUIRED_SECURITY_HEADERS above and every value is asserted against a real preview response by scripts/verify-deployment-preview.mjs.',
    '/assets/:file':
      'Vite`s fingerprinted output. `:file` matches a single path segment, so this deliberately excludes the /assets/actors/ subtree -- overlapping _headers rules concatenate rather than override.',
    '/assets/actors/*':
      'Stable-name runtime art (ADR-0014): re-rendering an atlas reuses its URL, so this must revalidate and must never be immutable. Deleting this block is #122`s surviving mutation.',
    '/game-content/source-art/*': 'Content-hashed filenames, so the URL changes with the bytes and immutable is safe.',
    '/index.html': 'Explicit revalidation for the SPA entry point rather than relying on the Cloudflare default.',
  };

  /** A rule block is a line starting at column 0 with `/`; its header lines are indented. */
  function ruleBlockPatterns(headers: string): readonly string[] {
    return [
      ...new Set(
        headers
          .split(/\r?\n/)
          .filter((line) => line.startsWith('/'))
          .map((line) => line.trim()),
      ),
    ];
  }

  it('contains exactly the rule blocks this contract accounts for', async () => {
    const patterns = ruleBlockPatterns(await readRepositoryFile('public/_headers'));

    // Vacuity guard: a parser that stopped matching would make the two
    // difference checks below pass while comparing nothing.
    expect(patterns.length, 'no rule blocks parsed out of public/_headers; the parser is broken').toBeGreaterThan(3);

    const removed = Object.keys(EXPECTED_RULE_BLOCKS).filter((pattern) => !patterns.includes(pattern));
    expect(
      removed.map((pattern) => `${pattern}: ${EXPECTED_RULE_BLOCKS[pattern]}`),
      'public/_headers no longer has this rule block -- if the removal is deliberate, delete its entry here and the paragraph describing it in docs/DEPLOYMENT.md in the same change',
    ).toEqual([]);

    const unaccounted = patterns.filter((pattern) => EXPECTED_RULE_BLOCKS[pattern] === undefined);
    expect(
      unaccounted,
      'public/_headers has a new rule block: add it here with what it is for, and describe it in docs/DEPLOYMENT.md',
    ).toEqual([]);
  });

  it('describes every rule block in docs/DEPLOYMENT.md', async () => {
    const patterns = ruleBlockPatterns(await readRepositoryFile('public/_headers'));
    const deploymentDoc = await readRepositoryFile('docs/DEPLOYMENT.md');

    const undocumented = patterns.filter((pattern) => !deploymentDoc.includes(pattern));
    expect(
      undocumented,
      'public/_headers sets a rule for these paths and docs/DEPLOYMENT.md never names them, so an operator has no way to know the rule exists or why',
    ).toEqual([]);
  });
});

/**
 * `docs/CLOUD_SAVE.md` claimed "No check in this repository uses the
 * service-role key" while `scripts/verify-supabase-stack.mjs` read the local
 * stack's secret key and sent it as both `apikey` and `Authorization: Bearer`
 * for every trusted-path request (issue #122 item 3).
 *
 * That is worse than an ordinary stale sentence, because it is a *security*
 * claim in the section a reviewer consults when tracing where service-role
 * credentials flow: believing it, they skip the one script that holds one, and
 * a contributor extending that script has no reason to preserve its three real
 * safeguards -- the loopback assertion, never printing a value, and storing
 * nothing in the repository.
 *
 * The claim is corrected. Two checks keep it corrected, and the first is the
 * durable one: an inclusion check, so a *new* script that starts handling the
 * credential fails until the documentation names it. The literal-phrase check
 * is second because a phrase ban only catches the exact regression that
 * already happened; it is cheap, and #122 asked for it, but it is not what
 * makes this hold.
 */
describe('service-role credential documentation contract', () => {
  /**
   * The scripts allowed to handle a service-role/secret credential, with the
   * reason. A new entry here is a deliberate decision; an unlisted script that
   * starts handling one fails.
   */
  const SCRIPTS_HANDLING_A_SERVICE_ROLE_CREDENTIAL: Readonly<Record<string, string>> = {
    'verify-supabase-stack.mjs':
      'Drives the trusted (service_role) paths against the local stack, which is the only place PostgREST mapping that credential onto the role is exercised at all. Reads it from `supabase status` at run time, refuses to run unless the API is on loopback, and never prints any part of a value.',
  };

  it('names every script that handles one in docs/CLOUD_SAVE.md', async () => {
    const scriptsDirectory = path.join(repositoryRoot, 'scripts');
    const entries = await readdir(scriptsDirectory, { withFileTypes: true });

    const handling: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const source = await readFile(path.join(scriptsDirectory, entry.name), 'utf8');
      if (/\bSERVICE_ROLE_KEY\b|\bSECRET_KEY\b/u.test(source)) handling.push(entry.name);
    }

    expect(
      handling.length,
      'no script matched; the credential scan is broken, and this contract would pass while checking nothing',
    ).toBeGreaterThan(0);

    const unlisted = handling.filter((name) => SCRIPTS_HANDLING_A_SERVICE_ROLE_CREDENTIAL[name] === undefined);
    expect(
      unlisted,
      'this script handles a service-role/secret credential and is not accounted for: add it with the reason, and make sure docs/CLOUD_SAVE.md says it does',
    ).toEqual([]);

    const stale = Object.keys(SCRIPTS_HANDLING_A_SERVICE_ROLE_CREDENTIAL).filter((name) => !handling.includes(name));
    expect(stale, 'this script no longer handles such a credential: remove its entry').toEqual([]);

    const cloudSaveDoc = await readRepositoryFile('docs/CLOUD_SAVE.md');
    for (const name of handling) {
      expect(
        cloudSaveDoc,
        `${name} handles a service-role credential, so docs/CLOUD_SAVE.md must say so -- a reviewer auditing credential handling reads that document, not this list`,
      ).toContain(name.replace(/\.mjs$/u, ''));
    }
  });

  it('carries no documentation claim that nothing here handles one', async () => {
    // Narrow by design: this catches the exact sentence that regressed and
    // near variants of it, and nothing else. A general "is this security claim
    // true" check is not mechanisable, which is why the inclusion check above
    // is the load-bearing half.
    const denials = [
      /no check in this repository uses the service-role key/iu,
      /nothing in this repository (?:uses|holds|reads) (?:a|the) service[- ]role key/iu,
      /no (?:script|check) (?:here|in this repository) (?:uses|holds|reads) (?:a|the) service[- ]role/iu,
    ];

    const docsDirectory = path.join(repositoryRoot, 'docs');
    const offending: string[] = [];

    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(entryPath);
          continue;
        }
        if (!entry.name.endsWith('.md')) continue;
        const text = await readFile(entryPath, 'utf8');
        for (const denial of denials) {
          if (denial.test(text)) offending.push(path.relative(repositoryRoot, entryPath));
        }
      }
    };
    await walk(docsDirectory);

    expect(
      offending,
      'a document denies that any check handles a service-role credential, and `pnpm verify:stack` does -- say what the guarantee actually is instead',
    ).toEqual([]);
  });
});

describe('line-ending contract', () => {
  /**
   * `.gitattributes` pins LF by extension because a CRLF file with a shebang
   * fails on Linux with a bad-interpreter error. Issue #138 found that
   * `scripts/verify-supabase-sql.mjs` — mode 755, `#!/usr/bin/env node` — was
   * matched by neither `*.sql` nor `*.sh`, which is precisely the failure the
   * comment in `.gitattributes` claims to prevent, live for an owner who runs
   * git from Windows (#95).
   *
   * Mode bits come from `git ls-files -s` and the attribute from
   * `git check-attr`, so this tracks what git will actually do on checkout
   * rather than a second implementation of gitattributes pattern matching.
   */
  it('pins LF for every executable file with a shebang', async () => {
    const executables = git(['ls-files', '-s'])
      .split('\n')
      .flatMap((line) => {
        const match = /^100755\s+\S+\s+\S+\t(.+)$/u.exec(line);
        return match?.[1] === undefined ? [] : [match[1]];
      });

    expect(
      executables.length,
      'No mode-755 tracked files were found; the `git ls-files -s` parse is broken.',
    ).toBeGreaterThan(0);

    const shebangScripts: string[] = [];
    for (const file of executables) {
      const contents = await readFile(path.join(repositoryRoot, file), 'utf8');
      if (contents.startsWith('#!')) {
        shebangScripts.push(file);
      }
    }

    expect(
      shebangScripts.length,
      'No executable file with a shebang was found; this test would assert nothing.',
    ).toBeGreaterThan(0);

    const attributes = git(['check-attr', 'text', 'eol', '--', ...shebangScripts]);

    for (const file of shebangScripts) {
      expect(
        attributes,
        `${file} is executable and starts with a shebang, so .gitattributes must pin it to LF — a CRLF checkout of it fails on Linux with a bad-interpreter error.`,
      ).toContain(`${file}: eol: lf`);
    }
  });
});

describe('Supabase local-stack configuration contract', () => {
  /**
   * Reads one key out of one `[section]` of `supabase/config.toml` by hand.
   * A TOML parser would be a dependency for something trivial, which
   * `AGENTS.md` forbids, and this needs two scalar reads from a file whose
   * shape the Supabase CLI controls.
   */
  function readTomlValue(source: string, section: string, key: string): string | undefined {
    const lines = source.split('\n');
    let inSection = false;
    let collected: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) {
        continue;
      }

      if (/^\[[^\]]+\]$/u.test(trimmed)) {
        inSection = trimmed === `[${section}]`;
        continue;
      }

      if (!inSection) {
        continue;
      }

      if (collected !== undefined) {
        collected += ` ${trimmed}`;
        if (trimmed.includes(']')) {
          break;
        }
        continue;
      }

      const match = new RegExp(`^${key}\\s*=\\s*(.*)$`, 'u').exec(trimmed);
      if (match?.[1] === undefined) {
        continue;
      }

      collected = match[1];
      if (!collected.startsWith('[') || collected.includes(']')) {
        break;
      }
    }

    return collected;
  }

  /**
   * `supabase init` leaves seeding enabled against `./seed.sql`, a file this
   * repository has never had, and `supabase db reset` is the only thing that
   * would ever have said so (issue #138). The invariant is non-vacuous in both
   * states: enabled means every listed path must resolve to a real file,
   * disabled means the list must be empty rather than left pointing at
   * something imaginary.
   */
  it('never enables seeding against a file that does not exist', async () => {
    const config = await readRepositoryFile('supabase/config.toml');
    const enabled = readTomlValue(config, 'db.seed', 'enabled');
    const sqlPaths = readTomlValue(config, 'db.seed', 'sql_paths');

    expect(enabled, 'Could not read [db.seed] enabled from supabase/config.toml.').toBeDefined();
    expect(sqlPaths, 'Could not read [db.seed] sql_paths from supabase/config.toml.').toBeDefined();

    const paths = [...(sqlPaths ?? '').matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '');

    if (enabled === 'false') {
      expect(
        paths,
        '[db.seed] is disabled, so sql_paths must be empty rather than naming seed files that are not loaded.',
      ).toEqual([]);
      return;
    }

    expect(
      paths.length,
      '[db.seed] is enabled but names no seed files, so a db reset seeds nothing.',
    ).toBeGreaterThan(0);

    for (const seedPath of paths) {
      // Supabase resolves these relative to supabase/, and supports globs.
      const matches = git(['ls-files', '--', path.posix.join('supabase', seedPath)])
        .split('\n')
        .filter((line) => line.trim().length > 0);

      expect(
        matches.length,
        `[db.seed] sql_paths lists "${seedPath}", which matches no tracked file under supabase/. A db reset would fail on it.`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('provisioning contract', () => {
  /**
   * A provisioning script that nothing calls is a script that rots: it is
   * written for a gate, the gate is never wired to it, and the next person to
   * need it finds a stale one. Issue #138 found the session-start hook calling
   * one of four.
   *
   * Anything genuinely meant to be run by hand belongs in
   * `INTENTIONALLY_MANUAL` with the reason, so "nobody calls this" is a
   * recorded decision rather than an omission. It is empty today: all four
   * scripts are wired.
   */
  const INTENTIONALLY_MANUAL = new Map<string, string>();

  it('calls every provisioning script from a workflow or the session hook', async () => {
    const scriptNames = (await readdir(path.join(repositoryRoot, 'scripts')))
      .filter((name) => name.startsWith('provision-') && name.endsWith('.sh'))
      .sort();

    expect(
      scriptNames.length,
      'No scripts/provision-*.sh were found; this test would assert nothing.',
    ).toBeGreaterThan(0);

    const workflowDirectory = path.join(repositoryRoot, '.github', 'workflows');
    const callerPaths = [
      ...(await readdir(workflowDirectory))
        .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
        .map((name) => path.join('.github', 'workflows', name)),
      path.join('.claude', 'hooks', 'session-start.sh'),
    ];

    /**
     * A script merely *named* must not read as a call site. Both these
     * workflows and that hook explain themselves at length, and the hook now
     * prints `bash scripts/provision-git-lfs.sh` inside a log message telling
     * the reader how to run it by hand -- so stripping `#` comments is not
     * enough. Removing the real call from ci.yml while that log line stood
     * kept this test green, which is how the weakness was found.
     *
     * So a line counts only when the script sits in *command position*: the
     * line, once a YAML list dash and a `run:` key and a shell `if !` guard
     * are peeled off, has to begin with the thing that runs it.
     */
    const invocationLines: string[] = [];
    for (const callerPath of callerPaths) {
      for (const rawLine of (await readRepositoryFile(callerPath)).split('\n')) {
        const line = rawLine
          .trim()
          .replace(/^-\s+/u, '')
          .replace(/^run:\s*/u, '')
          .replace(/^if\s+!\s+/u, '');

        if (line.startsWith('#')) {
          continue;
        }

        if (/^(?:bash|sh|exec|\.\/|source|\.\s)/u.test(line)) {
          invocationLines.push(line);
        }
      }
    }

    expect(
      invocationLines.length,
      'No script invocations were found in any workflow or the session hook; the invocation parse is broken.',
    ).toBeGreaterThan(0);

    const invocations = invocationLines.join('\n');

    for (const scriptName of scriptNames) {
      const manualReason = INTENTIONALLY_MANUAL.get(scriptName);
      if (manualReason !== undefined) {
        expect(
          manualReason.length,
          `${scriptName} is listed as intentionally manual but gives no reason.`,
        ).toBeGreaterThan(0);
        continue;
      }

      expect(
        invocations,
        `scripts/${scriptName} is called by no workflow and not by .claude/hooks/session-start.sh. Wire it to a gate, or list it in INTENTIONALLY_MANUAL with the reason it is run by hand.`,
      ).toContain(`scripts/${scriptName}`);
    }

    for (const scriptName of INTENTIONALLY_MANUAL.keys()) {
      expect(
        scriptNames,
        `${scriptName} is listed in INTENTIONALLY_MANUAL but scripts/ has no such file.`,
      ).toContain(scriptName);
    }
  });
});

/**
 * `.github/workflows/deploy.yml` cancels an in-flight deployment as soon as a
 * newer run joins its concurrency group. Issue #134 established that this is a
 * trade rather than an oversight -- the run that joins the group last is the
 * one that reaches the site and the queue never backs up, at the cost that a
 * cancelled run may have partially completed -- and the decision recorded
 * there was to keep the behaviour and write the reasoning into the file.
 *
 * A decision that lives only as a YAML comment is enforced by nothing, which
 * is the shape #138 was filed about. These two assertions are what stands
 * behind it, and both halves are needed: the value, so the policy cannot be
 * swapped for one of the alternatives #134 declined without anyone noticing,
 * and the reasoning, because a gate that pins only the value lets the argument
 * be deleted and leaves the next reader a bare setting to re-derive.
 */
describe('deploy concurrency policy contract', () => {
  /**
   * The phrases the reasoning above the block must still carry, and what each
   * one is load-bearing for. Substrings rather than a rewritten copy of the
   * comment: the wording should stay editable, but a comment that no longer
   * says these things is no longer the argument #134 decided to record.
   */
  const REQUIRED_REASONING: Readonly<Record<string, string>> = {
    '#134': 'where the decision, and the two alternatives declined with it, are recorded.',
    'superseded, deliberately':
      'the legibility half #134 calls LIVE: a cancelled `Deploy` run on `main` is intended, and a column of them is this policy working rather than a broken pipeline.',
    'wrangler deploy':
      'the one step that publishes. The comment must keep naming it, because "a cancelled run may have partially completed" is a statement about that step and about nothing before it.',
    'cancel-in-progress: false':
      'the queued alternative, named as the answer if a half-finished deployment is ever actually observed rather than a patch around one.',
  };

  /**
   * The `concurrency:` block: its top-level key and every line under it, up to
   * the next top-level key. Parsed rather than searched for across the whole
   * file, so that a `cancel-in-progress` in some other block, or reasoning
   * that has drifted away from the setting it argues for, cannot satisfy
   * either assertion below.
   */
  function concurrencyBlock(workflow: string): readonly string[] {
    const lines = workflow.split(/\r?\n/u);
    const start = lines.indexOf('concurrency:');

    expect(
      start,
      '.github/workflows/deploy.yml has no top-level `concurrency:` block. Two deployments of one environment may now overlap, which is the state the block was added to prevent -- see #134.',
    ).toBeGreaterThanOrEqual(0);

    const body = lines.slice(start + 1);
    const end = body.findIndex((line) => line.length > 0 && !/^\s/u.test(line));
    return body.slice(0, end === -1 ? body.length : end);
  }

  it('still cancels a superseded deploy', async () => {
    const block = concurrencyBlock(await readRepositoryFile('.github/workflows/deploy.yml'));
    const settings = block
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'))
      .map((line) => line.trim());

    // Vacuity guard: a block parsed down to nothing but comments would make
    // the check below fail rather than pass, but a parser that returned the
    // rest of the file would make it pass for the wrong reason.
    expect(
      settings.length,
      'no settings parsed out of the concurrency block in .github/workflows/deploy.yml; the parser is broken.',
    ).toBeGreaterThan(0);
    expect(
      settings.length,
      'the concurrency block in .github/workflows/deploy.yml parsed to more settings than a concurrency block has; the parser is reading past the end of it.',
    ).toBeLessThan(5);

    expect(
      settings,
      '.github/workflows/deploy.yml no longer sets `cancel-in-progress: true` on its concurrency group. #134 decided that policy deliberately over the two alternatives it lists -- a deploy per commit that passes CI, or a queue with `cancel-in-progress: false`. Changing it is that decision being reopened, not a tidy-up: say on #134 which option replaces it and why, rewrite the reasoning above the block to argue the new trade, and change this assertion in the same commit.',
    ).toContain('cancel-in-progress: true');
  });

  it('still explains why, in the block itself', async () => {
    const block = concurrencyBlock(await readRepositoryFile('.github/workflows/deploy.yml'));
    const reasoning = block.filter((line) => line.trim().startsWith('#')).join('\n');

    // Vacuity guard: every phrase below would also be absent from an empty
    // string, so a parser that stopped matching comments would report the
    // reasoning missing rather than present. This says which of the two it is.
    expect(
      reasoning.length,
      'the concurrency block in .github/workflows/deploy.yml carries no comment at all, or the comment parse is broken.',
    ).toBeGreaterThan(400);

    const missing = Object.keys(REQUIRED_REASONING).filter((phrase) => !reasoning.includes(phrase));
    expect(
      missing.map((phrase) => `${phrase} -- ${REQUIRED_REASONING[phrase]}`),
      'the reasoning above `concurrency:` in .github/workflows/deploy.yml no longer makes this part of its argument. #134 decided to keep `cancel-in-progress: true` *and* to write down what it costs, so that a cancelled deploy is legible and the next reader does not re-derive the trade-off. Restore it. If the policy itself changed, change it in deploy.yml, record the new choice on #134, and update this map to the phrases the new argument turns on.',
    ).toEqual([]);
  });
});

/**
 * `.github/workflows/version.yml` is the only workflow in this repository that
 * writes to the repository. It bumps `package.json`'s patch version on every
 * merge to `main` and tags the commit, which is what turned the version half
 * of the build badge from a constant into an answer: the field was `0.0.0`
 * with no tags anywhere, so every build ever made shared it.
 *
 * It therefore has one failure mode nothing else here has. Its own commit is a
 * push to `main`, and a push to `main` is its trigger, so an unguarded copy of
 * it bumps for ever. There are two ways to acquire that silently -- the guard
 * being deleted, and the guard drifting away from the commit the bump step
 * actually writes, which leaves a guard that reads correct and matches
 * nothing. The second is the dangerous one, because the file still looks
 * right.
 *
 * So the assertions below are not a spell-check of the YAML. Each one pins a
 * property some *other* part of the repository depends on, and the loop-guard
 * assertion pins the two halves against each other: it reads the commit
 * message template out of the bump step and requires the guard to name that
 * same prefix, rather than repeating a literal here that could go stale
 * alongside the file it describes.
 *
 * None of this can establish that the workflow runs. That is only settled by a
 * real push to `main`.
 */
describe('version bump workflow contract', () => {
  const WORKFLOW = '.github/workflows/version.yml';

  /**
   * The settings under a top-level key: comments and blank lines dropped, up
   * to the next top-level key. Parsed rather than searched for across the
   * whole file, exactly as `concurrencyBlock` above is and for the same
   * reason -- a `contents: write` sitting in some other block must not satisfy
   * an assertion about `permissions:`.
   */
  function topLevelSettings(workflow: string, key: string, absenceMeans: string): readonly string[] {
    const lines = workflow.split(/\r?\n/u);
    const start = lines.indexOf(`${key}:`);

    expect(start, `${WORKFLOW} has no top-level \`${key}:\` block. ${absenceMeans}`)
      .toBeGreaterThanOrEqual(0);

    const body = lines.slice(start + 1);
    const end = body.findIndex((line) => line.length > 0 && !/^\s/u.test(line));
    const settings = body
      .slice(0, end === -1 ? body.length : end)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // Vacuity guard: a block that parsed to nothing would make every
    // `toContain` below fail rather than pass, but it would fail with the
    // wrong message. This says which of the two it is.
    expect(
      settings.length,
      `no settings parsed out of the \`${key}:\` block in ${WORKFLOW}; the parser is broken.`,
    ).toBeGreaterThan(0);

    return settings;
  }

  /**
   * The file with every comment line removed, so that a workflow which only
   * *describes* a setting cannot satisfy an assertion that it *has* it. The
   * same weakness the provisioning contract above was rewritten to close:
   * both YAML comments and the shell comments inside `run:` blocks start with
   * `#` once trimmed, and both are stripped here.
   */
  function withoutComments(workflow: string): string {
    return workflow
      .split(/\r?\n/u)
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
  }

  /** The job-level `if:` expression, folded to the single line GitHub evaluates. */
  function loopGuard(workflow: string): string {
    const lines = workflow.split(/\r?\n/u);
    const start = lines.findIndex((line) => /^\s+if:\s*>-\s*$/u.test(line));

    expect(
      start,
      `${WORKFLOW} has no job-level \`if: >-\` guard. Its own commit is a push to \`main\` and a push to \`main\` is its trigger, so without a guard it bumps the version for ever. Restore it.`,
    ).toBeGreaterThanOrEqual(0);

    const indent = (lines[start] ?? '').search(/\S/u);
    const folded: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (line.trim().length === 0 || line.search(/\S/u) <= indent) {
        break;
      }
      folded.push(line.trim());
    }

    const guard = folded.join(' ');
    expect(
      guard.length,
      `the \`if:\` guard in ${WORKFLOW} parsed to nothing; the parser is broken.`,
    ).toBeGreaterThan(0);

    return guard;
  }

  /** The `--message` template the bump step hands to `npm version`. */
  function releaseSubjectTemplate(workflow: string): string {
    const match = /--message '([^']*)'/u.exec(withoutComments(workflow));

    expect(
      match?.[1],
      `${WORKFLOW} no longer passes an explicit \`--message\` to \`npm version\`. The subject of the bump commit is half of the loop guard, so it cannot be left to npm's default: give the template back, and make the guard test for its prefix.`,
    ).toBeDefined();

    return match?.[1] ?? '';
  }

  /**
   * Settings the rest of the repository depends on, and what each one is
   * load-bearing for. Substrings rather than a copy of the file: the wording
   * and the comments around them should stay editable, but a workflow that no
   * longer does these things is a different workflow.
   */
  const REQUIRED_SETTINGS: Readonly<Record<string, string>> = {
    'runs-on: self-hosted':
      'the self-hosted runner pool. `ubuntu-latest` was chosen first, to keep this job\'s commits out of the workspace the self-hosted runner reuses -- and it does not work here: this workflow\'s first real run failed after four seconds with no step recorded and no log, and delete-branches.yml, the only other workflow asking for `ubuntu-latest`, has one run and failed identically. The shared workspace is safe because every ci.yml job runs its own `actions/checkout`, which cleans and resets before anything else -- so moving this back to a hosted runner would not merely change a preference, it would stop the job running at all. This exact selector is pinned in tests/foundation/deploy-blocked-announcement-contract.test.ts so every working workflow follows the repository-wide runner policy.',
    'persist-credentials: true':
      'the one checkout in this repository that keeps its token, because this is the one job that pushes. Every other checkout sets `false`, so a copy-paste from one of them leaves this job unable to push and every bump failing at its last step.',
    'git push --atomic':
      'the branch and the tag land together or neither lands. Without it a rejected branch update can still publish the tag, leaving `v0.0.N` pointing at a commit `main` does not contain.',
    '--tag-version-prefix=v':
      "the tag spelling, stated rather than inherited from npm's default. `v0.0.7` is what the badge puts on screen, so it is what a bug report quotes.",
    'git reset --quiet --hard "origin/$branch"':
      'every retry recomputes the next patch from what the branch holds now. Without it a run that lost a race would re-propose the version the winner just took, and all three attempts would be rejected for the same reason.',
    'run: node tooling/anchor-budget-spend.mjs':
      'the annotation that reports the STATUS-QUEUE.md anchor budget\'s spend at the one moment (a version bump) `ci.yml` never runs a check on its own release commit. See tooling/anchor-budget-spend.mjs and tests/foundation/anchor-budget-spend-annotation.test.ts.',
  };

  it('runs on a push to main, and on nothing that carries no commit', async () => {
    const settings = topLevelSettings(
      await readRepositoryFile(WORKFLOW),
      'on',
      'A workflow with no trigger never runs, so the version stops moving and the badge quietly goes back to naming one number for every build.',
    );

    expect(
      settings.length,
      `the \`on:\` block in ${WORKFLOW} parsed to more settings than it has; the parser is reading past the end of it.`,
    ).toBeLessThan(6);

    expect(
      settings,
      `${WORKFLOW} no longer triggers on a push. The policy is one patch bump per merged pull request, and a push to \`main\` is what a merge is.`,
    ).toContain('push:');

    expect(
      settings,
      `${WORKFLOW} no longer restricts its push trigger to \`main\`. Every branch would bump its own version, and this workflow pushes what it bumps.`,
    ).toContain('branches: [main]');

    // The loop guard is entirely a statement about `github.event.head_commit`,
    // which only a push carries. A trigger whose payload has no head commit
    // would make both halves of it vacuously true.
    expect(
      settings,
      `${WORKFLOW} has gained a trigger that carries no \`head_commit\`. The loop guard is two statements about \`github.event.head_commit\`, and against an event that has none they are both vacuously true -- the guard would still read correct and would be guarding nothing. Either keep the trigger list to pushes, or rewrite the guard to hold for the new event and change this assertion in the same commit.`,
    ).not.toContain('workflow_dispatch:');
  });

  it('is granted the write it needs, and nothing else', async () => {
    const settings = topLevelSettings(
      await readRepositoryFile(WORKFLOW),
      'permissions',
      'Without an explicit block the job inherits whatever the repository default is, which is neither a guarantee that it can push nor a bound on what else it could do.',
    );

    expect(
      settings,
      `${WORKFLOW} must declare exactly \`contents: write\` and nothing more. \`write\` is what pushes the bump commit and its tag -- the job cannot work without it, and it must be supplied by this block through GITHUB_TOKEN rather than by any personal access token or added secret. Anything beyond it widens what a workflow that runs on every merge to \`main\` is able to do.`,
    ).toEqual(['contents: write']);
  });

  it('cannot re-trigger itself, and says so in terms of what it actually commits', async () => {
    const workflow = await readRepositoryFile(WORKFLOW);
    const guard = loopGuard(workflow);
    const template = releaseSubjectTemplate(workflow);

    expect(
      template,
      `the \`--message\` template in ${WORKFLOW} has no \`%s\`, so \`npm version\` would write the same subject for every release and the prefix the guard tests for could not be derived from it.`,
    ).toContain('%s');

    const subjectPrefix = template.slice(0, template.indexOf('%s'));
    expect(
      subjectPrefix.length,
      `the \`--message\` template in ${WORKFLOW} starts with \`%s\`, so a bump commit has no fixed prefix for the guard to recognise it by.`,
    ).toBeGreaterThan(0);

    // The load-bearing assertion. Not "the guard mentions a prefix" but "the
    // guard mentions THIS prefix": the two halves are checked against each
    // other, so changing the commit subject without changing the guard fails
    // here rather than on `main`.
    expect(
      guard,
      `the loop guard in ${WORKFLOW} does not test for the subject its own bump commit carries. The bump step writes \`${template}\`, so the guard must skip a push whose head commit starts with \`${subjectPrefix}\` -- otherwise the workflow's own commit re-triggers it and it bumps the version for ever. Change both together or neither.`,
    ).toContain(`startsWith(github.event.head_commit.message, '${subjectPrefix}')`);

    expect(
      guard,
      `the loop guard in ${WORKFLOW} no longer skips a push authored by \`github-actions[bot]\`. That is the second, independent half of the guard: either half alone closes the loop, and keeping both means a change to the commit subject cannot open it.`,
    ).toContain("github.event.head_commit.author.name != 'github-actions[bot]'");

    expect(
      withoutComments(workflow),
      `${WORKFLOW} commits as an identity its own loop guard does not name. The guard skips pushes authored by \`github-actions[bot]\`, so that has to be the identity the bump commit carries, or the guard matches nothing it is meant to match.`,
    ).toContain('git config user.name "github-actions[bot]"');
  });

  it('keeps the settings the loop guard, the clean-tree gate and the race retry depend on', async () => {
    const body = withoutComments(await readRepositoryFile(WORKFLOW));

    // Vacuity guard: every substring below is also absent from an empty
    // string, so a comment stripper that ate the whole file would report all
    // five missing rather than pass.
    expect(
      body.length,
      `${WORKFLOW} parsed to almost nothing once comments were removed; the comment stripper is broken.`,
    ).toBeGreaterThan(400);

    const missing = Object.keys(REQUIRED_SETTINGS).filter((setting) => !body.includes(setting));
    expect(
      missing.map((setting) => `${setting} -- ${REQUIRED_SETTINGS[setting]}`),
      `${WORKFLOW} no longer carries a setting something outside it depends on. Each entry above names what breaks. If one of them is genuinely being replaced, replace the reasoning in the workflow header in the same commit and update this map to what the new arrangement turns on.`,
    ).toEqual([]);
  });

  it('bumps the field the build actually reads, in the spelling the badge renders', async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as { readonly version?: unknown };

    expect(
      typeof manifest.version,
      'package.json has no string `version` field. The bump workflow rewrites that field and nothing else, so without it there is nothing to bump and nothing for the build to read.',
    ).toBe('string');

    // Behavioural, not textual: this is the resolver `vite.config.ts` and
    // `tests/browser/vite.config.ts` both call, so a version bump reaching
    // `__LOCKSTATE_VERSION__` -- and from there the badge,
    // `SaveEnvelope.gameVersion` and the worker handshake -- is exactly this
    // function returning what the workflow wrote. It is also the reason the
    // workflow needed no change to `tooling/build-identity.mjs`.
    expect(
      packageVersion(),
      "`packageVersion()` in tooling/build-identity.mjs no longer returns package.json's `version`. The version bump workflow rewrites that field and touches nothing else, so if this seam is cut the workflow publishes a number that reaches no build, no badge and no save envelope, and every deploy goes back to reporting one version for ever.",
    ).toBe(manifest.version);

    // The `v` in `--tag-version-prefix=v` is chosen to match this, because a
    // tag is for the human reading the screen: nothing in the build parses one.
    expect(
      await readRepositoryFile('src/content/default-locale-en.ts'),
      "the `brand.build` catalog entry no longer renders the version with a leading `v`. The tags .github/workflows/version.yml publishes are `v0.0.N` precisely so that the string on screen and the string in the tag list are the same string. Change one and you have to change the other, and say so in the workflow header's tag section.",
    ).toContain("'brand.build': 'v{version}");
  });

  it('reports the anchor budget spend only after the bump step, from the script that computation actually lives in', async () => {
    const workflow = withoutComments(await readRepositoryFile(WORKFLOW));

    const bumpStepIndex = workflow.indexOf('git push --atomic origin');
    const reportStepIndex = workflow.indexOf('node tooling/anchor-budget-spend.mjs');

    expect(
      bumpStepIndex,
      `${WORKFLOW} no longer contains the atomic push this ordering assertion anchors on; see the "keeps the settings..." test above for that step's own gate.`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      reportStepIndex,
      `${WORKFLOW} no longer runs tooling/anchor-budget-spend.mjs; see the REQUIRED_SETTINGS entry above.`,
    ).toBeGreaterThanOrEqual(0);

    expect(
      reportStepIndex,
      `the anchor budget spend annotation in ${WORKFLOW} must run AFTER the bump step's atomic push, not before it -- it reports the version package.json now holds, and that value does not exist until the bump has already landed.`,
    ).toBeGreaterThan(bumpStepIndex);

    // The script itself must exist and export what version.yml's step and
    // tests/foundation/anchor-budget-spend-annotation.test.ts both depend on --
    // a workflow step naming a script that was never committed would parse,
    // "keeps the settings" above would still pass (it only checks the workflow
    // text), and CI would only discover the mistake by failing at runtime on
    // `main`, after a merge, which is exactly the silent-failure shape this
    // annotation exists to avoid for the anchor budget itself.
    const script = await readRepositoryFile('tooling/anchor-budget-spend.mjs');
    expect(
      script,
      'tooling/anchor-budget-spend.mjs is referenced from .github/workflows/version.yml but is empty or missing.',
    ).toMatch(/export function computeAnchorSpend/u);
    expect(script).toMatch(/export function formatAnchorSpendAnnotation/u);

    // Non-blocking by construction: the CLI's only path to a non-zero exit
    // would be `process.exit`/an uncaught throw escaping the top-level
    // try/catch its own header commits to. Asserting the shape here means a
    // future edit that removes that guard fails a fast, textual check instead
    // of only being discoverable by a real failing merge on `main`.
    expect(
      script,
      'tooling/anchor-budget-spend.mjs no longer wraps its CLI entry point in a try/catch. This annotation runs from a workflow that has already merged -- a failing step here blocks nothing and would only be noise, so the script must never let an unexpected error escape as a non-zero exit.',
    ).toMatch(/try\s*\{[\s\S]*\}\s*catch/u);
    expect(script).not.toMatch(/process\.exit\(\s*[1-9]/u);
  });
});

/**
 * `.github/workflows/deploy.yml` publishes the site, and the whole value of
 * its `workflow_run` trigger is that the commit it publishes is the commit CI
 * judged. That property rests on one expression -- the `ref:` on the `staging`
 * job's checkout -- and on two facts about the trigger that make the
 * expression mean anything.
 *
 * Why the `ref:` is needed at all, since it looks redundant. A `workflow_run`
 * run is NOT checked out at the commit that triggered it. With no `ref:`,
 * `actions/checkout` takes the head of the default branch at the moment the
 * job starts, which is a different commit from the one CI passed on as soon as
 * anything else has landed on `main` -- a second merge, or the version bump
 * this repository pushes after every merge. The site would then be built from
 * a commit no gate had judged, which is the exact defect the `workflow_run`
 * trigger replaced a `push` trigger to fix.
 *
 * Why nothing else catches it. Deleting the `ref:`, spelling it `ref: main`,
 * or "simplifying" it to `ref: ${{ github.ref }}` are all silent: the workflow
 * still parses, `pnpm verify` still passes, CI is still green, and the only
 * evidence would be a deployed build whose contents nobody checked -- visible,
 * if at all, as a version string on screen that does not match the commit that
 * was merged. There is no test that would go red. The reasoning lives in a
 * comment above the step, and a comment fails nothing.
 *
 * Why the three assertions below are one gate rather than three. The
 * expression reads `head_sha` only when `github.event_name == 'workflow_run'`,
 * and `github.event.workflow_run` exists only on that event, so a trigger
 * changed to `push` would make the expression fall silently through to its
 * `github.ref` branch and the checkout would be back to building the branch
 * head. And `types: [completed]` fires for failed, cancelled and timed-out
 * runs as readily as for passing ones, so without the `conclusion` term in the
 * job's `if:` a red CI would deploy the commit it had just rejected. Each of
 * the three is worthless on its own; asserted together they say "this
 * deployment is of a commit that CI ran, and passed, on".
 *
 * Every expected string here is written out literally rather than derived from
 * the file being checked, so this cannot degrade into the workflow agreeing
 * with itself. The cross-file half is the same idiom as the version bump
 * contract above: `workflows: [CI]` in deploy.yml and `name: CI` in ci.yml are
 * pinned separately, because a `workflow_run` naming a workflow that no longer
 * exists never fires at all -- which loses the deployment silently and
 * completely, with no failed run anywhere to notice.
 */
describe('deploy trigger and checkout contract', () => {
  const DEPLOY = '.github/workflows/deploy.yml';
  const WORKFLOW_DIRECTORY = '.github/workflows';

  /**
   * The lines of one job's block under `jobs:`, up to the next job. Scoped
   * rather than searched for across the file, because deploy.yml has two jobs
   * and both have a step named `Checkout`: the `production` job's checkout
   * deliberately carries no `ref:` (it is dispatched at a ref of its own), so
   * a whole-file search could be satisfied by, or confused with, the wrong one.
   */
  function jobBlock(workflow: string, job: string): readonly string[] {
    const lines = workflow.split(/\r?\n/u);
    const start = lines.indexOf(`  ${job}:`);

    expect(
      start,
      `${DEPLOY} has no \`${job}:\` job. Nothing below can be asserted about a job that is not there; if the job was renamed, rename it here in the same commit.`,
    ).toBeGreaterThanOrEqual(0);

    const body = lines.slice(start + 1);
    const end = body.findIndex((line) => line.trim().length > 0 && line.search(/\S/u) <= 2);
    const block = end === -1 ? body : body.slice(0, end);

    // Vacuity guard: a block parsed down to nothing would make every check
    // below fail rather than pass, but with a misleading message.
    expect(
      block.length,
      `the \`${job}:\` job in ${DEPLOY} parsed to almost no lines; the job parser is broken.`,
    ).toBeGreaterThan(10);

    return block;
  }

  /**
   * One step of a job: its `- name:` line and every line under it, up to the
   * next step at the same indentation. Comments are kept, because the caller
   * strips them where a comment must not be able to satisfy an assertion.
   */
  function step(jobLines: readonly string[], job: string, name: string): readonly string[] {
    const start = jobLines.findIndex((line) => line.trim() === `- name: ${name}`);

    expect(
      start,
      `the \`${job}:\` job in ${DEPLOY} has no step named \`${name}\`. If it was renamed, rename it here too; a step this test cannot find is a step this test does not check.`,
    ).toBeGreaterThanOrEqual(0);

    const indent = (jobLines[start] ?? '').search(/\S/u);
    const body = jobLines.slice(start + 1);
    const end = body.findIndex((line) => line.search(/\S/u) === indent && line.trim().startsWith('- '));

    return [jobLines[start] ?? '', ...(end === -1 ? body : body.slice(0, end))];
  }

  /** The settings under `on:` -> `workflow_run:`, comments and blanks dropped. */
  function workflowRunTrigger(workflow: string): readonly string[] {
    const lines = workflow.split(/\r?\n/u);
    const onStart = lines.indexOf('on:');

    expect(
      onStart,
      `${DEPLOY} has no top-level \`on:\` block. A workflow with no trigger never deploys anything.`,
    ).toBeGreaterThanOrEqual(0);

    const afterOn = lines.slice(onStart + 1);
    const onEnd = afterOn.findIndex((line) => line.length > 0 && !/^\s/u.test(line));
    const onBlock = onEnd === -1 ? afterOn : afterOn.slice(0, onEnd);
    const triggerStart = onBlock.findIndex((line) => line.trim() === 'workflow_run:');

    expect(
      triggerStart,
      `${DEPLOY} no longer triggers on \`workflow_run:\`. The \`staging\` job's checkout resolves its ref from \`github.event.workflow_run.head_sha\`, and that payload exists on no other event: under any other trigger the expression falls through to \`github.ref\` and the deploy builds the branch head instead of the commit CI judged, with nothing failing. The trigger and that expression are one mechanism -- change both together, and change this test in the same commit.`,
    ).toBeGreaterThanOrEqual(0);

    const triggerIndent = (onBlock[triggerStart] ?? '').search(/\S/u);
    const rest = onBlock.slice(triggerStart + 1);
    const triggerEnd = rest.findIndex(
      (line) => line.trim().length > 0 && line.search(/\S/u) <= triggerIndent,
    );
    const settings = (triggerEnd === -1 ? rest : rest.slice(0, triggerEnd))
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    // Vacuity guard: every `toContain` below would also fail against an empty
    // list, and would blame the workflow rather than this parser.
    expect(
      settings.length,
      `no settings parsed out of the \`workflow_run:\` trigger in ${DEPLOY}; the parser is broken.`,
    ).toBeGreaterThan(0);
    expect(
      settings.length,
      `the \`workflow_run:\` trigger in ${DEPLOY} parsed to more settings than it has; the parser is reading past the end of it.`,
    ).toBeLessThan(6);

    return settings;
  }

  /** A job-level `if:`, folded to the single line GitHub evaluates. */
  function jobGuard(jobLines: readonly string[], job: string): string {
    const start = jobLines.findIndex(
      (line) => line.search(/\S/u) === 4 && /^if:/u.test(line.trim()),
    );

    expect(
      start,
      `the \`${job}:\` job in ${DEPLOY} has no job-level \`if:\` guard at all. Without one it runs on every event that reaches this workflow, including a CI run that failed.`,
    ).toBeGreaterThanOrEqual(0);

    const first = (jobLines[start] ?? '').trim().slice('if:'.length).trim();
    const folded = first === '>-' || first === '>' || first === '|' ? [] : [first];
    for (const line of jobLines.slice(start + 1)) {
      if (line.trim().length === 0 || line.search(/\S/u) <= 4) {
        break;
      }
      folded.push(line.trim());
    }

    const guard = folded.join(' ').replace(/\s+/gu, ' ');
    expect(
      guard.length,
      `the \`if:\` guard on the \`${job}:\` job in ${DEPLOY} parsed to nothing; the parser is broken.`,
    ).toBeGreaterThan(0);

    return guard;
  }

  it('checks out the commit the triggering CI run tested, not the branch head', async () => {
    const workflow = await readRepositoryFile(DEPLOY);
    const checkout = step(jobBlock(workflow, 'staging'), 'staging', 'Checkout');

    // Comments are dropped first: the reasoning above this step names
    // `head_sha` in prose, and a step that only *describes* the ref must not
    // be able to satisfy an assertion that it *sets* it. Same weakness the
    // provisioning and version bump contracts above were rewritten to close.
    const settings = checkout.filter((line) => !line.trim().startsWith('#')).map((line) => line.trim());

    expect(
      settings,
      `the \`Checkout\` step in the \`staging\` job of ${DEPLOY} is no longer an \`actions/checkout\`. Its \`ref:\` is the only thing that decides which commit gets deployed, so a different mechanism here needs a different assertion -- written in the same commit.`,
    ).toContain('uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6');

    const ref = settings.find((line) => line.startsWith('ref:'));

    // Absence is a failure, not a pass. This is the mutation that looks most
    // like a tidy-up and costs the most: with no `ref:` at all,
    // `actions/checkout` silently defaults to the head of the default branch,
    // and every deploy builds whatever landed last instead of the commit CI
    // judged.
    expect(
      ref,
      `the \`Checkout\` step in the \`staging\` job of ${DEPLOY} sets no \`ref:\`. A \`workflow_run\` run is not checked out at the commit that triggered it -- with no \`ref:\`, \`actions/checkout\` takes the head of the default branch, so the deploy publishes a commit no gate has judged as soon as anything else has landed on \`main\` (a second merge, or this repository's own post-merge version bump). Restore \`ref: \${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.ref }}\`.`,
    ).toBeDefined();

    const expression = (ref ?? '').slice('ref:'.length).trim();

    expect(
      expression.startsWith('${{') && expression.endsWith('}}'),
      `the \`ref:\` on the \`staging\` checkout in ${DEPLOY} is the literal \`${expression}\` rather than an expression. A fixed ref -- a branch name, a tag -- is by definition not the commit the triggering CI run tested: it resolves to whatever that ref points at when the job starts.`,
    ).toBe(true);

    // The load-bearing assertion, and the reason it is this whole substring
    // rather than just `head_sha`: the point is not that the expression
    // mentions the triggering commit somewhere, it is that the triggering
    // commit is what the expression *chooses* when the event is a
    // `workflow_run`. `${{ github.ref || github.event.workflow_run.head_sha }}`
    // mentions it and deploys the branch head every time.
    expect(
      expression.replace(/\s+/gu, ' '),
      `the \`ref:\` on the \`staging\` checkout in ${DEPLOY} no longer resolves to the commit the triggering CI run tested. On a \`workflow_run\` it must take \`github.event.workflow_run.head_sha\` -- not \`github.ref\`, not a branch name -- because that, and only that, is the commit CI passed on; the branch head is a different commit as soon as a second merge or the version bump lands. If the shape of the expression is being changed rather than its meaning, pin the new shape here in the same commit.`,
    ).toContain("github.event_name == 'workflow_run' && github.event.workflow_run.head_sha");
  });

  it('is triggered only by a completed run of the workflow that actually exists', async () => {
    const settings = workflowRunTrigger(await readRepositoryFile(DEPLOY));

    expect(
      settings,
      `the \`workflow_run:\` trigger in ${DEPLOY} no longer names \`CI\`. It must name the workflow whose completion is the gate, exactly as ci.yml spells its own \`name:\`: a \`workflow_run\` that names a workflow which does not exist never fires, so the site would simply stop being deployed with no failed run anywhere to say so.`,
    ).toContain('workflows: [CI]');

    // `head_sha` and `conclusion` both come from the *triggering* run, and
    // that payload only exists on a completed one. `types:` is therefore not a
    // free choice here: narrowing it away, or widening it to `requested`,
    // leaves the two expressions this file turns on reading a payload that is
    // absent or not yet meaningful.
    expect(
      settings,
      `the \`workflow_run:\` trigger in ${DEPLOY} no longer uses \`types: [completed]\`. The \`staging\` job reads \`github.event.workflow_run.head_sha\` and \`.conclusion\` off the triggering run, and neither is settled before it completes.`,
    ).toContain('types: [completed]');

    // Not a detail of the same fact: ci.yml also runs on `pull_request`, so
    // without this filter every green CI run on an unmerged branch would
    // deploy that branch to staging -- and, because a custom domain is
    // attached to the staging Worker, to the public site.
    expect(
      settings,
      `the \`workflow_run:\` trigger in ${DEPLOY} no longer restricts itself to \`main\`. ci.yml runs on \`pull_request\` as well as on a push to \`main\`, so without this filter a green CI on any open branch deploys that branch to staging -- which is what serves lockstate.io. See docs/DEPLOYMENT.md, "What currently serves lockstate.io".`,
    ).toContain('branches: [main]');
  });

  it('names a workflow that some workflow in this repository declares', async () => {
    const directory = path.join(repositoryRoot, WORKFLOW_DIRECTORY);
    const files = (await readdir(directory)).filter((file) => /\.ya?ml$/u.test(file)).sort();

    // Vacuity guard: an empty directory listing would make the check below
    // fail for the wrong reason.
    expect(
      files.length,
      `no workflow files found in ${WORKFLOW_DIRECTORY}; this test is not reading what it thinks it is.`,
    ).toBeGreaterThan(1);

    const declared = await Promise.all(
      files.map(async (file) => {
        const source = await readRepositoryFile(path.posix.join(WORKFLOW_DIRECTORY, file));
        return /^name:\s*(.+?)\s*$/mu.exec(source)?.[1] ?? '';
      }),
    );

    // The other half of `workflows: [CI]`, asserted from the other file so a
    // rename of either one fails here rather than on `main`. The failure mode
    // is the quietest one in this repository: GitHub does not warn about a
    // `workflow_run` naming a workflow that does not exist, the trigger simply
    // never fires, and the symptom is deploys that stop happening.
    expect(
      declared,
      `no workflow in ${WORKFLOW_DIRECTORY} declares \`name: CI\`, but ${DEPLOY} triggers on \`workflow_run\` of a workflow called \`CI\`. GitHub matches that trigger by workflow *name*, not by file path, and says nothing when the name matches nothing: the trigger would never fire again and staging would silently stop being deployed. Either restore the name, or rename it on both sides -- in ci.yml, in ${DEPLOY}, and here -- in one commit.`,
    ).toContain('CI');
  });

  it('deploys only a CI run that passed, not merely one that finished', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging'), 'staging');

    // `types: [completed]` is satisfied by failure, cancellation and timeout
    // as well as success, so this term is the whole difference between "CI has
    // finished" and "CI has passed". Deleting it deploys the commit CI just
    // rejected, and the run stays green: the job did exactly what it was told.
    expect(
      guard,
      `the \`if:\` guard on the \`staging\` job in ${DEPLOY} no longer requires the triggering CI run to have *succeeded*. \`types: [completed]\` fires for a failed, cancelled or timed-out run too -- "completed" is not "passed" -- so without \`github.event.workflow_run.conclusion == 'success'\` a red CI publishes the commit it had just rejected, and the deploy run is green while it does it. If the guard is being restructured, keep the term and pin its new spelling here in the same commit.`,
    ).toContain(
      "github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success'",
    );
  });

  /**
   * Phrases the reasoning above the `staging` job's `if:` must still carry, and
   * what each one is load-bearing for. Substrings rather than a second copy of
   * the comment: the wording stays editable, the argument does not quietly go
   * missing. Same shape, and the same reason, as REQUIRED_REASONING in the
   * deploy concurrency contract above.
   */
  const REQUIRED_STAGING_GUARD_REASONING: Readonly<Record<string, string>> = {
    "a fork's branch can be named `main`":
      "why `branches: [main]` on the trigger is not the fork check: that filter matches the triggering run's head branch, and a fork picks that name freely.",
    'What is NOT the mitigation':
      "that ci.yml's own fork guards are not what protects this deploy. Relying on them means relying on what GitHub reports as the `conclusion` of a run whose every job skipped, which nothing in this repository establishes.",
    head_sha:
      "the step the whole finding turns on: the `Checkout` below builds the triggering run's head commit, so a run this guard accepts is a commit this job publishes.",
    'no gate of any kind':
      'what a `workflow_dispatch` of `staging` passed through before the ref term -- no CI, no environment approval -- and so why that alternative is restricted rather than trusted.',
  };

  /**
   * The `||`-separated alternatives of a folded job guard, each trimmed.
   *
   * Why the guard is split before anything is asserted about it: GitHub gives
   * `&&` higher precedence than `||`, so each alternative is an independent
   * path to the job running, and a term gates only the path that carries it.
   * `A && B || C` runs on `C` alone. Asserting that a term appears *somewhere
   * in the guard* therefore does not assert that it gates anything -- the term
   * could have moved onto the other alternative, or a third alternative could
   * have been added beside it, and a whole-string `toContain` would still
   * pass. The same scoping reason `jobBlock` exists rather than a whole-file
   * search.
   */
  function guardAlternatives(guard: string, job: string): readonly string[] {
    const alternatives = guard
      .split('||')
      .map((alternative) => alternative.trim())
      .filter((alternative) => alternative.length > 0);

    // Vacuity guard: an empty list satisfies nothing below, but it would blame
    // the workflow for a broken split.
    expect(
      alternatives.length,
      `the \`if:\` guard on the \`${job}:\` job in ${DEPLOY} split into no alternatives; the parser is broken.`,
    ).toBeGreaterThan(0);

    return alternatives;
  }

  /**
   * The one `||` alternative of a job guard that tests for a given event.
   *
   * Exactly one, asserted rather than assumed: with the same event tested on
   * two alternatives, "this alternative requires X" stops being a statement
   * about what the job does, because the other one does not require it.
   */
  function guardAlternativeFor(guard: string, job: string, eventName: string): string {
    const matching = guardAlternatives(guard, job).filter((alternative) =>
      alternative.includes(`github.event_name == '${eventName}'`),
    );

    expect(
      matching.length,
      `the \`if:\` guard on the \`${job}:\` job in ${DEPLOY} no longer has exactly one \`||\` alternative testing \`github.event_name == '${eventName}'\` (found ${matching.length}). Everything asserted below is about which terms gate that path, and that can only be read off one alternative: split the path in two, or fold it into another, and a term can be present in the guard while gating nothing. Restructure if the shape has to change, and pin the new shape here in the same commit.`,
    ).toBe(1);

    return matching[0] ?? '';
  }

  it('deploys only a CI run that a push started, never one a pull request started', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging'), 'staging');
    const automatic = guardAlternativeFor(guard, 'staging', 'workflow_run');

    // The leading `&&` is part of the pinned text on purpose. Without it the
    // assertion is satisfied by `... || github.event.workflow_run.event ==
    // 'push'`: the term present, and gating nothing. That is the mutation this
    // file's header calls a gate weaker than it looks.
    expect(
      automatic,
      `the \`staging\` job in ${DEPLOY} no longer requires the triggering CI run to have been started by a *push*. ci.yml runs on \`pull_request\` and on \`workflow_dispatch\` as well, and \`branches: [main]\` filters the triggering run's HEAD BRANCH rather than its event: a pull request opened from a fork whose branch is named \`main\`, and a manual dispatch of CI on \`main\`, both produce a completed CI run this trigger accepts. CI passing is not a merge. Restore \`&& github.event.workflow_run.event == 'push'\`.`,
    ).toContain("&& github.event.workflow_run.event == 'push'");
  });

  it('deploys only a CI run whose commit came from this repository, never a fork of it', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging'), 'staging');
    const automatic = guardAlternativeFor(guard, 'staging', 'workflow_run');

    // Pinned with its leading `&&` for the same reason as the term above.
    expect(
      automatic,
      `the \`staging\` job in ${DEPLOY} no longer requires the triggering CI run's head commit to have come from this repository. ci.yml triggers on a bare \`pull_request\`, so a pull request opened from a FORK starts a CI run that belongs to this repository and carries the fork's head branch and the fork's commit -- and the \`Checkout\` step deliberately builds \`workflow_run.head_sha\`, so that commit is what \`wrangler deploy\` publishes to the Worker holding the lockstate.io Custom Domain. ci.yml's own fork guards do not close this: they make every job of such a run *skip*, and what GitHub reports as that run's \`conclusion\` is established nowhere in this repository -- one unguarded job added to ci.yml would settle it the wrong way, with nothing connecting the two files. Restore \`&& github.event.workflow_run.head_repository.full_name == github.repository\`.`,
    ).toContain('&& github.event.workflow_run.head_repository.full_name == github.repository');
  });

  it('publishes a manual staging dispatch only from main', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging'), 'staging');
    const dispatched = guardAlternativeFor(guard, 'staging', 'workflow_dispatch');

    // The whole conjunction rather than the ref term alone: `github.ref` is
    // the ref this job checks out, so the term has to sit on the alternative
    // that does the checking out, conjoined to it rather than beside it.
    expect(
      dispatched.replace(/[()]/gu, '').trim(),
      `the \`staging\` job in ${DEPLOY} no longer restricts a manual dispatch to \`main\`. A \`workflow_dispatch\` checks out \`github.ref\` -- any branch, any tag -- and this job runs no \`pnpm verify\` and sits behind no environment approval, so without this term dispatching \`staging\` publishes an arbitrary ref straight to the Worker that serves lockstate.io, gated by nothing. \`main\` is the branch the automatic path publishes anyway. If a stronger gate replaces it -- the dispatched ref's own CI, or required reviewers on the \`staging\` environment -- that is the owner's decision to record, and its new shape is pinned here in the same commit.`,
    ).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.target == 'staging' && github.ref == 'refs/heads/main'",
    );
  });

  it('offers exactly the two paths above, so a third cannot be added unnoticed', async () => {
    const guard = jobGuard(jobBlock(await readRepositoryFile(DEPLOY), 'staging'), 'staging');
    const alternatives = guardAlternatives(guard, 'staging');

    // Every assertion above scopes itself to one alternative, which is what
    // makes it mean anything -- and is also what makes it blind to a new
    // alternative beside it. `A || B || anything` runs on `anything`. This is
    // the term that turns "these two paths are gated" into "these are the
    // paths".
    expect(
      alternatives.length,
      `the \`if:\` guard on the \`staging\` job in ${DEPLOY} now has ${alternatives.length} \`||\` alternatives rather than 2. Each one is an independent path to publishing the Worker that serves lockstate.io, and the assertions above are each scoped to one of the two this contract knows about, so a third is unchecked by construction. Adding a path here is a deployment decision: say what gates it, and assert that here in the same commit.`,
    ).toBe(2);
  });

  it('still explains why each of those terms is there, beside the terms', async () => {
    const jobLines = jobBlock(await readRepositoryFile(DEPLOY), 'staging');
    const guardStart = jobLines.findIndex(
      (line) => line.search(/\S/u) === 4 && /^if:/u.test(line.trim()),
    );

    expect(
      guardStart,
      `the \`staging\` job in ${DEPLOY} has no job-level \`if:\` for a comment to sit above.`,
    ).toBeGreaterThan(0);

    const reasoning = jobLines
      .slice(0, guardStart)
      .filter((line) => line.trim().startsWith('#'))
      .join('\n');

    // Vacuity guard: every phrase below is equally absent from an empty
    // string, so this says which of the two failures happened.
    expect(
      reasoning.length,
      `the \`if:\` on the \`staging\` job in ${DEPLOY} carries no comment above it at all, or the comment parse is broken.`,
    ).toBeGreaterThan(400);

    const missing = Object.keys(REQUIRED_STAGING_GUARD_REASONING).filter(
      (phrase) => !reasoning.includes(phrase),
    );

    expect(
      missing.map((phrase) => `${phrase} -- ${REQUIRED_STAGING_GUARD_REASONING[phrase]}`),
      `the reasoning above the \`staging\` job's \`if:\` in ${DEPLOY} no longer makes this part of its argument. Three of those terms are there for reasons invisible from this file -- a fork's branch can be named \`main\`, ci.yml's fork guards are not what protects the deploy, and a dispatch checks out an arbitrary ref past no gate at all -- and a term whose reason has been deleted is a term the next reader tidies away. Restore it; or, if a term genuinely changed, rewrite the argument and update this map to the phrases the new one turns on.`,
    ).toEqual([]);
  });
});

/**
 * `.github/workflows/ci.yml` triggers on a bare `pull_request` and every job in
 * it runs on `[self-hosted, ...]`, so each job is a path from "someone opened a
 * pull request from a fork" to "their code ran on the owner's machine": the
 * steps check the fork's ref out and `pnpm verify` executes what it finds
 * there. One term on each job closes that, and nothing in the workflow makes a
 * job added later inherit it -- `needs:` skips a dependent when its dependency
 * skips, which is a property of today's graph rather than of the workflow, and
 * `if: always()` or a job with no `needs:` chain has none of it.
 *
 * Deliberately not folded into the deploy contract above, because it is no
 * longer the same statement. deploy.yml's `staging` job now tests
 * `workflow_run.event` and `workflow_run.head_repository.full_name` for itself,
 * so this guard is not what stands between a fork and the public site. What it
 * stands between is a fork and the runner.
 */
describe('fork pull request execution contract', () => {
  const CI = '.github/workflows/ci.yml';

  /**
   * The job-level guard, as one exact line. A literal written here rather than
   * read out of the workflow: a term derived from the file it is checking holds
   * for whatever the file happens to say.
   */
  const FORK_GUARD =
    "    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";

  /** Every top-level job under `jobs:`, mapped to the lines of its block. */
  function jobBlocks(workflow: string): ReadonlyMap<string, readonly string[]> {
    const lines = workflow.split(/\r?\n/u);
    const start = lines.indexOf('jobs:');

    expect(
      start,
      `${CI} has no top-level \`jobs:\` block, so nothing below is reading what it thinks it is.`,
    ).toBeGreaterThanOrEqual(0);

    const blocks = new Map<string, string[]>();
    /** Two-space-indented lines this parser could not read as a job header. */
    const unreadable: string[] = [];
    let current: string[] | undefined;

    for (const [offset, line] of lines.slice(start + 1).entries()) {
      // Every character class here is load-bearing and none may be
      // "simplified" away. What makes an unmatched header dangerous rather
      // than merely unhelpful: a line this pattern misses is not a break, it
      // falls through to `current?.push(line)` and is APPENDED TO THE PREVIOUS
      // JOB'S BLOCK -- which still carries its own guard. So the new job does
      // not appear in `names`, is not checked, and nothing goes red. Three
      // spellings, each measured by appending a guardless job to ci.yml:
      //
      //   lint-docs:    -> FAIL, expected [ 'lint-docs' ] to deeply equal []
      //   _lint-docs:   -> whole file green
      //   "lint-docs":  -> whole file green
      //
      // `(?:#.*)?` is the first of the three and was measured the same way: a
      // job header carrying a trailing comment -- `  lint-docs: # remove after
      // #999` -- matched nothing, and the byte-identical job without the
      // comment failed. `_` is in the class because GitHub's job id grammar
      // admits it, and the optional quotes because YAML admits those.
      const header = /^ {2}"?([A-Za-z_][\w-]*)"?:\s*(?:#.*)?$/u.exec(line);
      if (header) {
        current = [];
        blocks.set(header[1] ?? '', current);
        continue;
      }
      // A new top-level key ends `jobs:`.
      if (line.trim().length > 0 && !/^\s/u.test(line)) break;

      // AND THE HALF THAT MAKES IT FAIL CLOSED. Widening the pattern closes
      // three spellings; this closes the fourth, whatever it turns out to be.
      // Inside `jobs:` a line at exactly two-space indentation IS a job
      // header -- everything belonging to a job is indented four or more --
      // so one this parser cannot read is a job it is about to hide inside
      // its predecessor. That is a failure with its own message rather than a
      // silent append. Comments at this indentation are ordinary here (ci.yml
      // introduces `assets` and `browser` with a paragraph each) and are the
      // only exemption.
      if (/^ {2}\S/u.test(line) && !/^ {2}#/u.test(line)) {
        unreadable.push(`${CI}:${String(start + 2 + offset)}: ${line.trim()}`);
      }

      current?.push(line);
    }

    expect(
      unreadable,
      `these lines sit at job-header indentation in ${CI} and this parser cannot read them as job headers. It does not skip such a line, it appends it to the PREVIOUS job's block -- so a job spelled this way is never checked for the fork guard and this contract stays green about it, which is the whole failure mode the pattern above records measuring three times. Either the line is a job header in a spelling the pattern does not admit, in which case widen it and add the spelling to that list, or something other than a job now lives directly under \`jobs:\` and this parser needs to know about it.`,
    ).toEqual([]);

    // Vacuity guard: with no jobs parsed, "every job carries the guard" is
    // true of nothing at all.
    expect(
      blocks.size,
      `no jobs parsed out of ${CI}; the parser is broken.`,
    ).toBeGreaterThanOrEqual(3);

    return blocks;
  }

  it('guards every job against a fork pull request, including one added later', async () => {
    const blocks = jobBlocks(await readRepositoryFile(CI));
    const names = [...blocks.keys()];

    // Named so a rename fails here, in the commit that renames, rather than
    // leaving this contract quietly checking a set of jobs that has moved on.
    // `toContain` rather than an exact set: a NEW job must satisfy the
    // assertion below rather than this one.
    for (const job of ['verify', 'assets', 'browser']) {
      expect(
        names,
        `${CI} no longer has a \`${job}:\` job. If it was renamed, rename it here in the same commit; if it was removed, say so here -- a gate this contract cannot find is a gate this contract does not check.`,
      ).toContain(job);
    }

    // Comments are dropped first, and the guard is matched as a whole line at
    // job-level indentation: a comment *describing* the guard, or a
    // step-level `if:` deeper in the job, must not be able to satisfy an
    // assertion that the job carries it.
    const guarded = names.filter((job) =>
      (blocks.get(job) ?? [])
        .filter((line) => !line.trim().startsWith('#'))
        .some((line) => line === FORK_GUARD),
    );

    // Positive presence first, so the assertion below cannot pass by finding
    // nothing. Deliberately `> 0` rather than a floor of three: a floor would
    // fire first when a single job lost its guard, reporting "no job carries
    // it" about a file where two still do, and the next reader would go
    // looking for the wrong defect. Which jobs are unguarded is the assertion
    // below; this one only distinguishes "a guard was removed" from "the exact
    // line pinned in FORK_GUARD was reformatted, so this contract now matches
    // nothing anywhere".
    expect(
      guarded.length,
      `no job in ${CI} carries the fork guard as a job-level \`if:\` at all. Either every one of them lost it, or the exact line pinned in FORK_GUARD has been reformatted and this contract is matching nothing -- check which before treating it as the security failure it would otherwise be.`,
    ).toBeGreaterThan(0);

    expect(
      names.filter((job) => !guarded.includes(job)),
      `these jobs in ${CI} carry no fork guard. This workflow triggers on a bare \`pull_request\` and runs on a self-hosted runner, so an unguarded job executes a fork's code -- \`vite.config.ts\`, everything under \`tests/\` -- on the owner's machine, in a workspace reused between jobs and between runs. Add \`if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository\` to each, exactly as the other jobs spell it. If a job genuinely must run on a fork's pull request, it needs a reason written beside it and an exception recorded here in the same commit.`,
    ).toEqual([]);
  });
});

/**
 * Two properties of `.github/workflows/**` as a *set*, rather than of one
 * workflow: every action it runs is pinned to a commit, and every checkout says
 * out loud whether it keeps its token. Both were true of the files and asserted
 * by nothing, which is the same shape as everything else in this file -- the
 * configuration and the check that is supposed to enforce it living apart.
 *
 * The parsers below are shared by the two contracts that follow and are written
 * positionally rather than with a YAML library. That is deliberate:
 * `AGENTS.md` prohibits adding a dependency for trivial functionality, and
 * `repository-contract.test.ts` makes the same argument for the toolchain pins.
 * The price of hand-parsing is that the parser can be wrong quietly, so both
 * contracts below open with the same guard: what the step parser found is
 * compared against a flat line scan of the same text, and a step the parser
 * cannot see is a failure rather than a silence. That is the defence the
 * `SECURITY_HEADER_BASELINE` reader at the top of this file also needed, for
 * exactly the same reason.
 */

const WORKFLOWS = '.github/workflows';

interface WorkflowStep {
  /** Repository-relative path of the workflow, so a failure message is actionable. */
  readonly workflow: string;
  /** 1-based line of the `- ` that opens the step. */
  readonly line: number;
  /** Every line of the step, comments included; the callers strip where it matters. */
  readonly lines: readonly string[];
}

/** Every `.yml`/`.yaml` under `.github/workflows`, path -> contents. */
async function readWorkflows(): Promise<ReadonlyMap<string, string>> {
  const names = (await readdir(path.join(repositoryRoot, '.github', 'workflows')))
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();

  // Vacuity guard, first of two. This one establishes that there are files;
  // the per-contract guard below establishes that the parser reads the steps
  // inside them. Every assertion in both contracts is "no workflow does X",
  // and no workflow does anything when there are none.
  expect(
    names.length,
    `no workflow files were found under ${WORKFLOWS}; every assertion below would hold of nothing at all.`,
  ).toBeGreaterThan(0);

  const workflows = new Map<string, string>();
  for (const name of names) {
    workflows.set(`${WORKFLOWS}/${name}`, await readRepositoryFile(`${WORKFLOWS}/${name}`));
  }

  return workflows;
}

/**
 * Every step of every job in one workflow: the `- ` line that opens it and each
 * line under it, up to the next step at the same indentation or the end of the
 * `steps:` block that holds it. A second job's `steps:` opens a new block, so
 * this reads all of them rather than only the first.
 */
function parseWorkflowSteps(workflow: string, contents: string): readonly WorkflowStep[] {
  const lines = contents.split(/\r?\n/u);
  const steps: WorkflowStep[] = [];

  let stepsIndent: number | undefined;
  let itemIndent: number | undefined;
  let current: string[] | undefined;
  let currentLine = 0;

  const close = (): void => {
    if (current !== undefined) {
      steps.push({ workflow, line: currentLine, lines: current });
      current = undefined;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';

    if (raw.trim().length === 0) {
      current?.push(raw);
      continue;
    }

    const indent = raw.search(/\S/u);

    if (stepsIndent === undefined) {
      if (raw.trim() === 'steps:') {
        stepsIndent = indent;
      }
      continue;
    }

    // Anything at or left of the `steps:` key ends the block -- including the
    // next job's own `steps:`, which immediately opens another one.
    if (indent <= stepsIndent) {
      close();
      stepsIndent = raw.trim() === 'steps:' ? indent : undefined;
      itemIndent = undefined;
      continue;
    }

    if (raw.trim().startsWith('- ') && (itemIndent === undefined || indent === itemIndent)) {
      close();
      itemIndent = indent;
      current = [raw];
      currentLine = index + 1;
      continue;
    }

    current?.push(raw);
  }

  close();
  return steps;
}

/**
 * The column a step's *keys* sit in. The `- ` marker occupies the two columns
 * to their left, so `- name: Checkout` and the `uses:` below it are the same
 * key level, and a `persist-credentials:` two columns deeper is not.
 */
function stepKeyIndent(step: WorkflowStep): number {
  return (step.lines[0] ?? '').search(/\S/u) + 2;
}

/**
 * The value of one of a step's own keys and the 1-based line it is written on,
 * or `undefined` when the step has no such key.
 *
 * The line is the *key's* line rather than the step's, so that a source
 * reported from here and a source reported by the flat scan below are the same
 * string for the same setting. Reporting the step's opening `- name:` line
 * instead would make the two counting guards compare two different things and
 * fail for a reason that is not a defect -- which is how this was found.
 */
function stepScalar(step: WorkflowStep, key: string): { readonly value: string; readonly line: number } | undefined {
  const keyIndent = stepKeyIndent(step);

  for (const [offset, line] of step.lines.entries()) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }

    const marker = trimmed.startsWith('- ');
    const at = line.search(/\S/u) + (marker ? 2 : 0);
    const text = marker ? trimmed.slice(2) : trimmed;

    if (at === keyIndent && text.startsWith(`${key}:`)) {
      return { value: text.slice(key.length + 1).trim(), line: step.line + offset };
    }
  }

  return undefined;
}

/**
 * The settings under a step's `with:` key, trimmed, whole-line comments
 * dropped. Comments are dropped because several checkouts in this repository
 * *discuss* `persist-credentials` in prose beside the setting -- version.yml's
 * comment names the value every other checkout uses -- so a comment must never
 * be able to satisfy an assertion that a step sets it. That is the same
 * weakness the provisioning, version bump and deploy checkout contracts above
 * were each rewritten to close.
 */
function stepWithSettings(step: WorkflowStep): readonly string[] {
  const keyIndent = stepKeyIndent(step);
  const start = step.lines.findIndex(
    (line) => line.search(/\S/u) === keyIndent && line.trim() === 'with:',
  );

  if (start === -1) {
    return [];
  }

  const settings: string[] = [];
  for (const line of step.lines.slice(start + 1)) {
    if (line.trim().length === 0) {
      continue;
    }
    if (line.search(/\S/u) <= keyIndent) {
      break;
    }
    if (line.trim().startsWith('#')) {
      continue;
    }
    settings.push(line.trim());
  }

  return settings;
}

/**
 * Lines that *look* like the thing the structural parser is meant to find,
 * counted by a flat scan that shares no code with `parseWorkflowSteps`. The two
 * counts are compared in both contracts below: a job, a step or a whole file the
 * structural parser silently skipped shows up as a shortfall here rather than as
 * a green run over a smaller corpus.
 */
function flatMatches(workflows: ReadonlyMap<string, string>, pattern: RegExp): readonly string[] {
  const found: string[] = [];

  for (const [workflow, contents] of workflows) {
    contents.split(/\r?\n/u).forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        return;
      }
      if (pattern.test(trimmed.startsWith('- ') ? trimmed.slice(2) : trimmed)) {
        found.push(`${workflow}:${String(index + 1)}`);
      }
    });
  }

  return found;
}

/**
 * Every action this repository runs is named by a commit, not by a tag.
 *
 * ## The defect
 *
 * A `uses:` naming a tag is a `uses:` whose code somebody else chooses, later,
 * without touching this repository. Every `uses:` here already named a
 * 40-character sha except one: `actions/checkout@v4` in delete-branches.yml,
 * the only workflow granted `contents: write` whose checkout keeps its
 * credential and whose later steps run `git push origin --delete`. The odd one
 * out is the expensive shape, because a reviewer who reads the pinned ones
 * concludes the discipline is settled and stops reading.
 *
 * ## Why this is a contract and not just a fix
 *
 * Pinning that one line closes the instance. What closes the class is this: a
 * workflow added next month, copied from any of the countless examples that
 * spell `@v4`, fails here in the commit that adds it. That is the difference
 * between an audit finding and a property, and it is why this block exists
 * rather than only the edit to the workflow.
 *
 * ## What it deliberately does not check
 *
 * That the sha is a *good* one -- that it exists in the action's own repository,
 * that it is the commit its `# v6` comment claims, or that it has not been
 * withdrawn. Nothing in this repository can answer any of those, and
 * `documentation-commit-citation-contract.test.ts` states the same bound from
 * the other side: a 40-character sha belonging to another repository resolves
 * nowhere here. What is checked is the property that makes the answer *fixed*
 * at all, which is the one property a tag does not have.
 */
describe('workflow action pinning contract', () => {
  /** `owner/repo@<40 hex>`. A tag, a branch or an abbreviation is not this. */
  const PINNED = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/u;

  /** Any `uses:`, whether the step parser can reach it or not. */
  const USES = /^uses:\s*\S/u;

  interface ActionUse {
    readonly source: string;
    readonly reference: string;
    readonly comment: string | undefined;
  }

  async function actionUses(): Promise<{
    readonly workflows: ReadonlyMap<string, string>;
    readonly uses: readonly ActionUse[];
  }> {
    const workflows = await readWorkflows();
    const uses: ActionUse[] = [];

    for (const [workflow, contents] of workflows) {
      for (const step of parseWorkflowSteps(workflow, contents)) {
        const used = stepScalar(step, 'uses');
        if (used === undefined) {
          continue;
        }

        const hash = used.value.indexOf('#');
        uses.push({
          source: `${workflow}:${String(used.line)}`,
          reference: (hash === -1 ? used.value : used.value.slice(0, hash)).trim(),
          comment: hash === -1 ? undefined : used.value.slice(hash + 1).trim(),
        });
      }
    }

    return { workflows, uses };
  }

  it('reads every uses: there is, so nothing below can pass by reading fewer', async () => {
    const { workflows, uses } = await actionUses();
    const flat = flatMatches(workflows, USES);

    // Vacuity guard, second of two, and the one that matters. A parser that
    // returned nothing -- or that lost one job because its header carried a
    // trailing comment, which is the exact defect `jobBlocks` above records
    // measuring -- makes "every action is pinned" true of an empty list. The
    // flat scan shares no code with the structural one, so the two agreeing is
    // evidence rather than a tautology.
    expect(
      uses.length,
      `no \`uses:\` was parsed out of ${WORKFLOWS} at all, while a flat scan of the same files found ${String(flat.length)}. The step parser is broken; fix it rather than the workflows.`,
    ).toBeGreaterThan(0);

    expect(
      uses.map(({ source }) => source),
      `the step parser and a flat line scan of the same files disagree about where the \`uses:\` lines are. Every one the parser cannot see is an action running unchecked by the assertions below, which would stay green about it. The flat scan is the authority here: fix the parser.`,
    ).toEqual(flat);
  });

  it('names a 40-character commit for every action it runs', async () => {
    const { uses } = await actionUses();

    // A `./`-prefixed reference is a composite action inside this repository,
    // checked out with everything else and therefore already pinned by the
    // commit under test. None exists today; the branch is here so that adding
    // one is not a spurious failure, and the positive check below is what stops
    // it becoming the door that empties this gate.
    const external = uses.filter(({ reference }) => !reference.startsWith('./'));
    const pinned = external.filter(({ reference }) => PINNED.test(reference));

    // Positive presence before the absence, in the shape the fork guard
    // contract above argues for: this distinguishes "a pin was removed" from
    // "the form pinned in PINNED no longer matches anything anywhere".
    expect(
      pinned.length,
      `no \`uses:\` in ${WORKFLOWS} matches the pinned form at all. Either every one of them lost its sha, or the pattern in PINNED has stopped matching \`owner/repo@<40 hex>\` -- check which before treating this as the supply-chain failure it would otherwise be.`,
    ).toBeGreaterThan(0);

    expect(
      external
        .filter(({ reference }) => !PINNED.test(reference))
        .map(({ source, reference }) => `${source} -> ${reference}`),
      `these run an action named by a tag or a branch rather than by a commit. A tag is a pointer its owner can move, so what runs on this repository's runners -- with whatever \`permissions:\` the workflow declares -- would be decided later, elsewhere, by somebody else. Pin the exact commit and name the release it is in a trailing \`# vN\` comment, exactly as the other call sites do. This is not theoretical here: the entry this gate was written for was \`actions/checkout@v4\` on the only workflow granted \`contents: write\` with a credential-keeping checkout and a \`git push origin --delete\`.`,
    ).toEqual([]);
  });

  it('says which release each sha is, beside the sha', async () => {
    const { uses } = await actionUses();

    // The sha is what makes the pin fixed; the comment is what makes it
    // reviewable. Without it an upgrade is a diff of two 40-character hex
    // strings and nobody can see whether it went forwards -- so the pin is
    // correct and unmaintainable, and the next reader deletes it back to a tag
    // because a tag they can read.
    expect(
      uses
        .filter(({ reference }) => PINNED.test(reference))
        .filter(({ comment }) => comment === undefined || !/^v\d/u.test(comment))
        .map(({ source, reference }) => `${source} -> ${reference}`),
      `these pin a commit with no trailing \`# vN\` comment naming the release it is. Add one. A pin nobody can read is a pin nobody will keep: every other call site here reads \`# v6\`, and a bare sha among them is the entry a later tidy-up turns back into a tag.`,
    ).toEqual([]);
  });
});

/**
 * Every checkout says whether it keeps its token, and only the two that push
 * keep it.
 *
 * ## The defect
 *
 * When this gate was written, `persist-credentials: false` was set on every
 * checkout in ci.yml, deploy.yml and migrate-database.yml, and asserted
 * nowhere. The only test in this repository that mentioned the setting was the
 * version bump contract above, which pins `true` for version.yml -- and whose
 * justification asserted the very fact it did not check: "Every other checkout
 * sets `false`, so a copy-paste from one of them leaves this job unable to
 * push". That is a prose claim about lines in three other files, in a
 * repository whose most-repeated defect is a document disagreeing with the
 * code. Deleting any one of those settings left the whole suite green;
 * measured, deleting ci.yml's `verify` one now fails two cases below and
 * nothing else.
 *
 * ## Why absence is a failure rather than a default
 *
 * `actions/checkout` defaults `persist-credentials` to `true` -- in v4 and in
 * the pinned v6 alike -- so a checkout that says nothing keeps its token in the
 * repository's git config for every later step of the job, on a self-hosted
 * runner whose workspace is reused between jobs and between runs. "Says
 * nothing" and "says true" are the same behaviour and completely different
 * reviews: one is a decision, the other is an omission that reads like one. So
 * this gate requires the setting to be *written* at every checkout, and
 * delete-branches.yml gained an explicit `true` in the same change that
 * introduced this block -- it had been relying on the default since it was
 * added.
 *
 * ## What it cannot see
 *
 * Whether a job that sets `false` then supplies a credential by hand. One does:
 * ci.yml's `assets` job configures an `extraheader` for a single `git lfs pull`
 * and unsets it on exit, and says at length why that is preferable to relaxing
 * this setting. A gate that forbade the pattern would forbid the safer of the
 * two, so this one is about the checkout only.
 */
describe('checkout credential persistence contract', () => {
  /** Any `uses:` naming this action, whether the step parser can reach it or not. */
  const CHECKOUT = /^uses:\s*actions\/checkout(?:[@\s]|$)/u;

  /**
   * The checkouts that keep their token, and what each one pushes. A workflow
   * absent from this map must set `false`; a workflow present must set `true`.
   *
   * Keyed by workflow rather than by step because each of these has exactly one
   * checkout. If one grows a second that should not keep the token, this map
   * demands `true` of it and the gate goes red -- which is the direction to fail
   * in: the fix is then to key this by step and say why, in that commit.
   */
  const KEEPS_ITS_TOKEN: Readonly<Record<string, string>> = {
    '.github/workflows/version.yml':
      'the version bump rewrites `package.json`, tags it, and pushes the branch and the tag atomically, so the credential has to survive its checkout. The version bump workflow contract above pins that `true` and that `git push --atomic` together.',
    '.github/workflows/delete-branches.yml':
      '`bash deletebranches.sh` runs `git push origin --delete` over the branch list that script carries, which is the whole purpose of the workflow and the reason it is the only other one granted `contents: write`. That workflow has never had a successful run and its own comment says so; the credential setting is still a decision it has to state.',
  };

  interface Checkout {
    readonly workflow: string;
    readonly source: string;
    readonly persistCredentials: string | undefined;
  }

  async function checkouts(): Promise<{
    readonly workflows: ReadonlyMap<string, string>;
    readonly steps: readonly Checkout[];
  }> {
    const workflows = await readWorkflows();
    const steps: Checkout[] = [];

    for (const [workflow, contents] of workflows) {
      for (const step of parseWorkflowSteps(workflow, contents)) {
        const used = stepScalar(step, 'uses');
        if (used === undefined) {
          continue;
        }

        // The trailing `# v6` is dropped before the name is matched, and the
        // version is not part of the match: an `actions/checkout` at any
        // version, or at none, is a checkout whose credential handling this
        // gate is answerable for. Requiring `@` here and not in the flat scan
        // below would make a version-less `uses:` invisible to one side and
        // report it as a broken parser on the other.
        const hash = used.value.indexOf('#');
        const reference = (hash === -1 ? used.value : used.value.slice(0, hash)).trim();
        if (!/^actions\/checkout(?:@|$)/u.test(reference)) {
          continue;
        }

        const setting = stepWithSettings(step).find((line) => line.startsWith('persist-credentials:'));

        steps.push({
          workflow,
          source: `${workflow}:${String(used.line)}`,
          persistCredentials:
            setting === undefined ? undefined : setting.slice('persist-credentials:'.length).trim(),
        });
      }
    }

    return { workflows, steps };
  }

  it('reads every actions/checkout there is, so nothing below can pass by reading fewer', async () => {
    const { workflows, steps } = await checkouts();
    const flat = flatMatches(workflows, CHECKOUT);

    expect(
      steps.length,
      `no \`actions/checkout\` step was parsed out of ${WORKFLOWS} at all, while a flat scan of the same files found ${String(flat.length)}. Every assertion below is "no checkout does X" and holds of an empty list; the parser is what is broken.`,
    ).toBeGreaterThan(0);

    expect(
      steps.map(({ source }) => source),
      `the step parser and a flat line scan of the same files disagree about where the \`actions/checkout\` steps are. A checkout the parser cannot see is a checkout whose credential handling is asserted by nothing, with this gate green about it. The flat scan is the authority: fix the parser.`,
    ).toEqual(flat);
  });

  it('states persist-credentials at every checkout rather than inheriting the default', async () => {
    const { steps } = await checkouts();

    expect(
      steps
        .filter(({ persistCredentials }) => persistCredentials === undefined)
        .map(({ source }) => source),
      `these checkouts set no \`persist-credentials\` at all. The action defaults it to \`true\`, so silence here means the job's token stays in the repository's git config for every step that follows -- on a self-hosted runner whose workspace is reused between jobs. Write the value out: \`false\` unless the job pushes, and \`true\` with the reason beside it if it does.`,
    ).toEqual([]);
  });

  it('keeps the token only where something pushes, and drops it everywhere else', async () => {
    const { steps } = await checkouts();

    const dropping = steps.filter(({ persistCredentials }) => persistCredentials === 'false');

    // Positive presence first, for the reason the fork guard contract states:
    // this separates "a checkout stopped dropping its credential" from "the
    // `with:` parser stopped reading the setting", which are otherwise the same
    // red.
    expect(
      dropping.length,
      `no checkout in ${WORKFLOWS} sets \`persist-credentials: false\` at all. Either every one of them now keeps its token, or the \`with:\` parser has stopped reading the setting -- establish which before treating this as the security failure it would otherwise be.`,
    ).toBeGreaterThan(0);

    expect(
      steps
        .filter(({ workflow, persistCredentials }) =>
          KEEPS_ITS_TOKEN[workflow] === undefined
            ? persistCredentials !== 'false'
            : persistCredentials !== 'true',
        )
        .map(
          ({ workflow, source, persistCredentials }) =>
            `${source} -> persist-credentials: ${persistCredentials ?? '(unset)'}${
              KEEPS_ITS_TOKEN[workflow] === undefined
                ? ''
                : ` -- must be true: ${KEEPS_ITS_TOKEN[workflow] ?? ''}`
            }`,
        ),
      `these checkouts do not carry the credential setting their workflow requires. A job that does not push must set \`persist-credentials: false\`, so its token does not outlive the step that needed it -- and on this repository's self-hosted runner it would otherwise outlive the *job*, in a workspace the next run reuses. The workflows allowed \`true\` are listed in KEEPS_ITS_TOKEN with what each of them pushes; another one needs an entry there written in the same commit, and the entry has to name what it pushes rather than that it wants the token.`,
    ).toEqual([]);
  });

  it('keeps the exception list honest: an entry whose workflow no longer checks out must go', async () => {
    const { steps } = await checkouts();
    const present = new Set(steps.map(({ workflow }) => workflow));

    expect(
      Object.keys(KEEPS_ITS_TOKEN).filter((workflow) => !present.has(workflow)),
      `these workflows are listed as needing a credential-keeping checkout and have none -- either the workflow is gone or its checkout is. An exemption for a step that no longer exists is an exemption waiting to cover a different one, which is the argument \`documentation-commit-citation-contract.test.ts\` makes for its own allowlists.`,
    ).toEqual([]);
  });
});

/**
 * The steps of one top-level job of one workflow, by line range rather than by
 * re-parsing the job structure: `parseWorkflowSteps` above already reads every
 * step of every job, and a second structural parser would be a second thing to
 * keep right.
 *
 * Module scope rather than inside one contract, because two contracts below
 * now ask the same question of two different jobs.
 */
function jobSteps(workflow: string, contents: string, job: string): readonly WorkflowStep[] {
  const lines = contents.split(/\r?\n/u);
  const header = `  ${job}:`;
  const start = lines.indexOf(header);

  expect(
    start,
    `${workflow} has no \`${header.trim()}\` job at top-level job indentation. If it was renamed, rename it here in the same commit -- a job this contract cannot find is a job this contract does not check.`,
  ).toBeGreaterThanOrEqual(0);

  // The next thing at job indentation or shallower ends the block. Comments
  // are skipped rather than treated as the end: in this file a paragraph at
  // two-space indentation introduces the job *after* it, and stopping there
  // would be right for the range but wrong the moment the paragraph moves.
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0 || /^\s*#/u.test(line)) {
      continue;
    }
    if (/^ {0,2}\S/u.test(line)) {
      end = index;
      break;
    }
  }

  // `WorkflowStep.line` is 1-based; `start` and `end` index the same array
  // from 0, so the open interval below is `(start, end]` in 1-based terms.
  return parseWorkflowSteps(workflow, contents).filter((step) => step.line > start + 1 && step.line <= end);
}

/**
 * The `browser` job keeps the evidence of its own failures.
 *
 * ## The defect
 *
 * `tests/browser/` is the layer that keeps finding defects nothing else can
 * (docs/TESTING.md), and its CI job failed twice on this branch with a
 * 60-second page-load timeout inside a setup helper. Neither failure was
 * diagnosable, because the one artefact that would have discriminated between
 * the candidate causes -- the `error-context.md` Playwright writes beside a
 * failure, an ARIA snapshot of the page at the moment it gave up -- was
 * written into the runner's workspace and then deleted, unread, by the next
 * run's `git clean -ffdx`. Measured rather than assumed at the time:
 * `git grep -n "upload-artifact" -- .github/` matched nothing anywhere in the
 * repository, no step in any job carried `if: failure()`, and the GitHub API
 * reported `total_count: 0` artifacts for the failing run.
 *
 * ## Why this is a contract and not just the step
 *
 * The step alone is one commit away from being deleted as noise by someone
 * reading a workflow whose runs are all green -- which is exactly the state
 * this repository was in for the whole life of the `browser` job. What the
 * assertions below hold is not "an upload step exists" but that the *names*
 * on it are still the names of the things that produce the evidence: the
 * `tee` target in the suite step, and Playwright's `outputDir`. Renaming
 * either one without following it here is the realistic way this quietly
 * starts uploading nothing, and it fails in the commit that does it.
 *
 * ## What it deliberately does not check
 *
 * That the upload succeeds, that the runner can reach the artifact service,
 * or that anybody reads what it stores. Nothing here can answer those. It
 * also does not pin `retention-days` or `if-no-files-found`: both are policy
 * a later reader may legitimately retune, and neither decides whether the
 * evidence survives the job.
 */
describe('browser failure evidence contract', () => {
  const CI = '.github/workflows/ci.yml';
  const PLAYWRIGHT_CONFIG = 'tests/browser/playwright.config.ts';

  /**
   * Playwright's `outputDir` when the config does not name one, relative to
   * the workspace root the job runs in. At the pinned @playwright/test the
   * default is `path.join(packageJsonDir, 'test-results')`, and the nearest
   * `package.json` above `tests/browser/` is the repository root's -- so the
   * directory lands beside the checkout rather than under `tests/browser/`.
   * The assertion that the config still names no `outputDir` is what keeps
   * this constant honest.
   */
  const DEFAULT_OUTPUT_DIR = 'test-results/';

  /** The lines of a step's `path: |` block, trimmed, comments dropped. */
  function pathEntries(step: WorkflowStep): readonly string[] {
    const start = step.lines.findIndex((line) => /^path:\s*\|-?\s*$/u.test(line.trim()));
    if (start === -1) {
      return [];
    }

    const blockIndent = (step.lines[start] ?? '').search(/\S/u);
    const entries: string[] = [];
    for (const line of step.lines.slice(start + 1)) {
      if (line.trim().length === 0) {
        continue;
      }
      if (line.search(/\S/u) <= blockIndent) {
        break;
      }
      if (line.trim().startsWith('#')) {
        continue;
      }
      entries.push(line.trim());
    }

    return entries;
  }

  it('uploads, on failure, exactly the two things the browser suite leaves behind', async () => {
    const contents = await readRepositoryFile(CI);
    const steps = jobSteps(CI, contents, 'browser');

    // Vacuity guard, in the shape the two contracts above use: every
    // assertion below is about a step found in this list, and a list of none
    // satisfies nothing rather than failing.
    expect(
      steps.length,
      `no steps were parsed out of the \`browser\` job in ${CI}. The line-range filter or \`parseWorkflowSteps\` is broken; fix it rather than the workflow.`,
    ).toBeGreaterThan(0);

    // The log filename is read out of the step that writes it rather than
    // written down here, so renaming the `tee` target and not the upload
    // fails below instead of silently uploading a file that no longer exists.
    const teeTargets = steps.flatMap((step) =>
      step.lines
        .filter((line) => !line.trim().startsWith('#'))
        .flatMap((line) => {
          const match = /\|\s*tee\s+(\S+)/u.exec(line);
          return match?.[1] === undefined ? [] : [match[1]];
        }),
    );

    expect(
      teeTargets,
      `the \`browser\` job in ${CI} no longer pipes its suite output through \`tee\` to exactly one file. That file is half of what the failure upload collects -- the whole stdout of the run, rather than the tail GitHub renders -- so if it is gone, or if there are now two, decide what the upload should carry and say so here in the same commit.`,
    ).toHaveLength(1);

    const suiteLog = teeTargets[0] ?? '';

    const uploads = steps.filter((step) => {
      const used = stepScalar(step, 'uses');
      if (used === undefined) {
        return false;
      }
      const hash = used.value.indexOf('#');
      const reference = (hash === -1 ? used.value : used.value.slice(0, hash)).trim();
      return /^actions\/upload-artifact(?:@|$)/u.test(reference);
    });

    expect(
      uploads,
      `the \`browser\` job in ${CI} runs no \`actions/upload-artifact\` step. Without one, a failing run's \`error-context.md\` files and its \`${suiteLog}\` are written into the self-hosted runner's workspace and deleted by the next run's \`git clean -ffdx\` -- which is exactly the state two undiagnosable timeout failures on this job were left in. Restore the step rather than this assertion.`,
    ).toHaveLength(1);

    const upload = uploads[0] as WorkflowStep;

    // `always()` would upload an empty artifact on every green run; a missing
    // condition would do the same and also run when the suite passed. The
    // cost of `failure()` is that a *cancelled* job -- `timeout-minutes`, or
    // the concurrency group -- uploads nothing, which the step's own comment
    // records as a deliberate trade.
    expect(
      stepScalar(upload, 'if')?.value,
      `the failure-evidence upload in the \`browser\` job of ${CI} must be conditioned on \`if: failure()\`. Unconditional, it stores an empty artifact on every green run; on \`always()\` the same. If a job that is being *cancelled* rather than failed now needs to upload too, that is \`always()\` plus a re-read of the comment on the step, not a silent widening.`,
    ).toBe('failure()');

    // The suite step must have run before there is anything to collect, and a
    // step ordered above it would upload the previous run's leftovers.
    const suiteStep = steps.find((step) =>
      step.lines.some((line) => !line.trim().startsWith('#') && line.includes(`| tee ${suiteLog}`)),
    );

    expect(
      suiteStep === undefined ? -1 : upload.line - suiteStep.line,
      `the failure-evidence upload in the \`browser\` job of ${CI} is ordered before the step that runs the suite, so it would collect whatever the previous run left in the reused workspace rather than this run's evidence.`,
    ).toBeGreaterThan(0);

    expect(
      pathEntries(upload),
      `the failure-evidence upload in the \`browser\` job of ${CI} must collect exactly Playwright's output directory and the suite log. \`${DEFAULT_OUTPUT_DIR}\` is where the \`error-context.md\` for each failing test lands and is the artefact that separates "the harness server never came up" from "the page came up and what the helper waited for never appeared"; \`${suiteLog}\` is the full stdout. If the \`tee\` target above was renamed, rename it here too.`,
    ).toEqual([DEFAULT_OUTPUT_DIR, suiteLog]);
  });

  it('keeps the upload path pointing at the directory Playwright actually writes', async () => {
    const config = await readRepositoryFile(PLAYWRIGHT_CONFIG);

    // The upload names a literal `test-results/` because the config names no
    // `outputDir` and Playwright's default resolves there. That is a fact
    // about the config, so it is asserted against the config: the day someone
    // sets `outputDir`, the upload above starts collecting an empty directory
    // and nothing else in this repository would notice.
    expect(
      config
        .split(/\r?\n/u)
        .filter((line) => /^\s*outputDir\s*:/u.test(line))
        .map((line) => line.trim()),
      `${PLAYWRIGHT_CONFIG} now sets \`outputDir\`, and ${CI}'s failure-evidence upload still collects the default \`${DEFAULT_OUTPUT_DIR}\`. One of the two has to move: point the upload at the configured directory and update DEFAULT_OUTPUT_DIR here, in this commit. Playwright resolves an unset \`outputDir\` to \`<package.json dir>/test-results\`, which for this config is the repository root -- that is the only reason the literal in the workflow is right.`,
    ).toEqual([]);
  });
});

/**
 * The measurement harness is invoked by something.
 *
 * ## The defect
 *
 * Issue #1083. `tests/perf/` carries three files and 35 tests behind its own
 * Vitest config, `docs/TESTING.md` documented the command, and **nothing in
 * the repository ran it**: no `package.json` script, no CI step. The root
 * `vitest.config.ts` collects `*.test.ts` and every file there is named
 * `*.perf.ts` on purpose, so `pnpm test` could not reach them either. They
 * were read by `tsc` and executed by nobody, and they passed -- which is the
 * whole point of the issue rather than a mitigation of it, because nothing
 * would have said if they had stopped.
 *
 * ## Why the config is asserted and not merely the path
 *
 * Running these files on the root config's budget is not a slower version of
 * the same check, it is a red one: that config sets `testTimeout: 5_000`
 * against the harness's `900_000`, and #1083 records **six** `Test timed out
 * in 5000ms` failures produced that way, none of them a defect. Re-measured
 * with `--testTimeout=5000` and nothing else changed, **12 of the 35** failed
 * that way -- the count follows the machine, which is why this contract
 * asserts the config rather than a number. So a script that pointed
 * `vitest run` at `tests/perf/` without `--config` would satisfy "the harness
 * is invoked" and fail every run.
 *
 * ## What it deliberately does not check
 *
 * That the harness asserts anything worth asserting, or that it is fast.
 * `docs/BENCHMARKING.md` owns the first and forbids timing assertions
 * outright; the second is a runner property that changes under this repository
 * without a commit, as the `browser` job's budget comments in the workflow
 * record at length. What is checked is that the gate is *reachable*, which is
 * the one property #1083 found missing.
 *
 * ## The reserved file
 *
 * The CI step this asserts is inside `.github/workflows/ci.yml`, which is
 * `AGENTS.md` reservation 3. The owner released one step for it on 2026-09-09,
 * and that entry records both what was authorised and that its provenance is a
 * clicked option label rather than the owner's own words. Widening this
 * contract to require a second step would be requiring a change nobody has
 * authorised.
 */
describe('measurement harness reachability contract', () => {
  const CI = '.github/workflows/ci.yml';
  const SCRIPT = 'test:perf';
  const CONFIG = 'tests/perf/vitest.perf.config.ts';

  it('gives the harness a script that runs it through its own config', async () => {
    const manifest = JSON.parse(await readRepositoryFile('package.json')) as {
      readonly scripts?: Readonly<Record<string, string>>;
    };
    const script = manifest.scripts?.[SCRIPT];

    expect(
      script,
      `package.json no longer declares a \`${SCRIPT}\` script. #1083 is the state where \`${CONFIG}\` exists and nothing invokes it: the harness is typechecked and never run, and its 35 assertions report nothing when they break. The CI step below runs this script by name, so removing it empties that step too.`,
    ).toBeDefined();

    expect(
      script,
      `\`pnpm ${SCRIPT}\` must pass \`--config ${CONFIG}\`. Without it these files inherit the root \`vitest.config.ts\`'s \`testTimeout: 5_000\` against the harness's own \`900_000\`: #1083 measured six \`Test timed out in 5000ms\` failures that way and a re-measurement with \`--testTimeout=5000\` produced 12 of 35. A run of this harness without its config is red for a reason that is not about the code.`,
    ).toContain(`--config ${CONFIG}`);
  });

  it('runs that script from the `verify` job, so the harness is a gate and not a habit', async () => {
    const contents = await readRepositoryFile(CI);
    const steps = jobSteps(CI, contents, 'verify');

    // Vacuity guard, in the shape the contracts above use: every assertion
    // below is about a step found in this list, and a list of none satisfies
    // nothing rather than failing.
    expect(
      steps.length,
      `no steps were parsed out of the \`verify\` job in ${CI}. The line-range filter or \`parseWorkflowSteps\` is broken; fix it rather than the workflow.`,
    ).toBeGreaterThan(0);

    const commands = steps
      .map((step) => stepScalar(step, 'run')?.value)
      .filter((value): value is string => value !== undefined)
      .map((value) => value.trim());

    expect(
      commands,
      `${CI}'s \`verify\` job no longer runs \`pnpm ${SCRIPT}\`. That step is the whole of what the owner authorised on 2026-09-09 (\`AGENTS.md\`, reservation 3), and without it \`tests/perf/\` is back in the state #1083 filed: a harness with a config, a script, documentation and no runner. Steps found: ${commands.join(' | ') || '(none)'}`,
    ).toContain(`pnpm ${SCRIPT}`);
  });

  it('leaves the harness out of the default suite, which is what hid it and is still right', async () => {
    const root = await readRepositoryFile('vitest.config.ts');
    const include = root.split(/\r?\n/u).filter((line) => /^\s*include\s*:/u.test(line));

    // Vacuity guard: the assertion below is about what `include` names, and a
    // config this filter cannot find an `include` in would satisfy it with
    // nothing read at all.
    expect(
      include,
      'vitest.config.ts declares no `include:` on a line of its own, so the assertion below reads nothing. Fix this filter rather than the config.',
    ).toHaveLength(1);

    /*
     * The other direction of the contract above. #1083's answer is a gate, not
     * a fold-in: collecting `*.perf.ts` from the root config would give these
     * files a runner and a five-second budget in the same move, and `pnpm test`
     * would start paying for multi-hundred-chunk fixtures on every run.
     */
    expect(
      include[0],
      `vitest.config.ts's \`include\` now reaches the measurement harness. It must not: this config's \`testTimeout\` is \`5_000\` where the harness's own is \`900_000\`, and its fixtures are expensive enough that \`pnpm test\` would stop being the fast gate. The harness is reached through \`pnpm ${SCRIPT}\` and its own config instead.`,
    ).not.toContain('perf');
  });
});

/**
 * Two jobs reach for `python3` and nothing in this repository provisions it
 * (#1089's audit). Installing it needs root, and the `woogitsu-linux-*` pool
 * has no passwordless sudo -- proved on job 101846181533, 2026-09-07 -- so
 * what the repository can add is a diagnosis rather than a fix: a guard that
 * names the host step instead of dying on a bare `python3: command not found`
 * and exit 127.
 *
 * **This contract exists because that guard is otherwise ungated.** Both jobs
 * are `workflow_dispatch`-only and neither has run since the pool changed
 * (`branch-gc.yml` 2026-09-03, `delete-branches.yml` 2026-08-30), so nothing
 * in CI executes either line. A future edit could delete the guard and every
 * other gate in this repository would stay green -- which is precisely the
 * case #1089 was written about, one level up: an assumption nobody can see
 * until the day it matters.
 *
 * **What it does NOT claim.** It does not assert that `python3` is present on
 * any runner; nothing here can read the host, and `AGENTS.md` reservation 3
 * makes the same point about dashboards. It asserts only that the two call
 * sites still say what to do when it is absent.
 *
 * The `delete-branches.yml` half deliberately reads `deletebranches.sh` and
 * not the workflow. The workflow names no interpreter at all -- it runs
 * `bash deletebranches.sh` -- and the audit row that cites `python3` for this
 * job cites `deletebranches.sh:107`. A guard written into the workflow would
 * be guarding the wrong file.
 */
describe('python3 availability diagnosis contract (#1089)', () => {
  it('branch-gc names the host step when python3 is missing, rather than exiting 127', async () => {
    const source = await readRepositoryFile('.github/workflows/branch-gc.yml');

    // Vacuity guard: the assertion below is about the guard sitting in front
    // of a real use, so establish the use is still there. If `branch-gc.yml`
    // stops running python3 this test should be deleted, not satisfied.
    expect(
      source,
      '`branch-gc.yml` no longer invokes python3; this contract is guarding a call site that has gone.',
    ).toContain('python3 - <<');

    expect(
      source,
      '`branch-gc.yml` invokes python3 with no `command -v` guard in front of it. Nothing here can install python3 -- that needs root and this pool has no passwordless sudo -- so the guard is the whole remedy: without it the job dies on a bare `python3: command not found` in a run whose next act is deleting branches on a shared remote.',
    ).toContain('command -v python3');

    const guardIndex = source.indexOf('command -v python3');
    const useIndex = source.indexOf('python3 - <<');
    expect(
      guardIndex,
      '`branch-gc.yml` has a `command -v python3` guard, but it sits after the heredoc it is supposed to protect, so the bare 127 happens first.',
    ).toBeLessThan(useIndex);
  });

  it('deletebranches.sh says what is missing before it reaches the interpreter', async () => {
    const source = await readRepositoryFile('deletebranches.sh');

    expect(
      source,
      '`deletebranches.sh` no longer pipes through python3; this contract is guarding a call site that has gone.',
    ).toContain('| python3 -c');

    expect(
      source,
      '`deletebranches.sh` reaches python3 with no `command -v` guard. `set -euo pipefail` already makes the failure safe -- an empty `open_heads` would leave every open pull request unprotected, and the script exits instead -- so what the guard adds is the sentence, not the safety.',
    ).toContain('command -v python3');

    const guardIndex = source.indexOf('command -v python3');
    const useIndex = source.indexOf('| python3 -c');
    expect(
      guardIndex,
      '`deletebranches.sh` guards python3 after the pipeline that uses it.',
    ).toBeLessThan(useIndex);
  });
});
