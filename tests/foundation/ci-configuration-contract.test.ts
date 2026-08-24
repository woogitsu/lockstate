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
    'runs-on: ubuntu-latest':
      'a hosted runner, so this job never commits, tags or leaves a rewritten package.json in the workspace the single self-hosted runner reuses between jobs -- which is the workspace ci.yml\'s "Verify generated output did not modify tracked files" step judges. Moving it onto [self-hosted, ...] puts a writer into that shared checkout.',
    'persist-credentials: true':
      'the one checkout in this repository that keeps its token, because this is the one job that pushes. Every other checkout sets `false`, so a copy-paste from one of them leaves this job unable to push and every bump failing at its last step.',
    'git push --atomic':
      'the branch and the tag land together or neither lands. Without it a rejected branch update can still publish the tag, leaving `v0.0.N` pointing at a commit `main` does not contain.',
    '--tag-version-prefix=v':
      "the tag spelling, stated rather than inherited from npm's default. `v0.0.7` is what the badge puts on screen, so it is what a bug report quotes.",
    'git reset --quiet --hard "origin/$branch"':
      'every retry recomputes the next patch from what the branch holds now. Without it a run that lost a race would re-propose the version the winner just took, and all three attempts would be rejected for the same reason.',
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
});
