import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A rooted `file:line` anchor into `src/` or `tests/` carries a quoted
 * fragment beside it, and that fragment is still on or beside the line.
 *
 * ## Why this is a second gate rather than a widening of the first
 *
 * `documentation-source-anchor-contract.test.ts` checks the pair that costs
 * nothing: the file is there, and the line is a line that file has. Its own
 * docblock states the bound it cannot pass, and states it first rather than
 * last -- *"a line number is a fact about every insertion above it, so nothing
 * mechanical can decide whether an anchor lands on the code its sentence
 * means"* -- and quotes ADR 0006 for the sharper form: *"an anchor that drifts
 * onto plausible-looking code is worse than one that drifts onto nothing"*
 * (`tests/foundation/documentation-source-anchor-contract.test.ts:42-43`).
 * It then says two further things this file must not quietly reverse: that the
 * remedy is *"preferring a symbol name and a quoted line of code over a bare
 * number ... which is a writing convention, also not a mechanism"*, and that
 * *"there is no allowlist at all today, and one should not be added"*.
 *
 * This file is the mechanism for the first of those and it needs the second.
 * Both are why it is a separate file: putting a budget table inside that one
 * would contradict two paragraphs of its own docblock, and the paragraph
 * refusing an allowlist is right about the thing it refuses -- an allowlist for
 * a *drifted* anchor, where the fix is the anchor. What is grandfathered below
 * is not drift, it is the 1146 anchors written before there was a convention to
 * write them under.
 *
 * ## What the sweep measured, which is the argument for the gate
 *
 * A sweep of twelve ADRs across three pull requests opened 182 rooted
 * `file:line` citations and found 23 dead. Twenty of the twenty-three had been
 * written or re-aimed by those same passes **one day earlier**. Almost every
 * second-time failure landed 10-15 lines away, inside a docblock or a comment
 * *about the right subject* -- which is why a human sweep reads as green: the
 * target looks right.
 *
 * The same shape is everywhere in the live corpus. Three opened while writing
 * this file, each with the document's own sentence beside it:
 *
 * - ADR 0092: *"the same tile `HireStaff` sends every guard to
 *   (`src/main.ts:621`, `src/main.ts:3084-3085`, re-anchored)"*. `main.ts:621`
 *   is `: {`, the opening of a conditional spread of `roomTool`. The word
 *   *re-anchored* is in the sentence.
 * - ADR 0093: *"`JobSystem` is constructed at ... and registered at
 *   `src/simulation/runtime/new-session.ts:1400`"*. That line is
 *   `const occupants = resolveOccupants(sectorId);`, inside a needs-pressure
 *   sum.
 * - ADR 0042: *"the HUD projection
 *   (`src/simulation/presentation/prisoner-projection.ts:397`)"*, cited for
 *   `classifiedAtTickOf`. That line is `readonly everAdmitted: boolean;` --
 *   the right file, the right interface, the wrong field. The
 *   `status-strip-projection.ts:782-787` case the sweep reported is the same
 *   shape: rooms counted where staff were named.
 *
 * A quoted fragment is the thing that makes all three checkable, because the
 * fragment moves with the code and the number does not.
 *
 * ## The measured shape of the corpus, at `54adc87c`
 *
 * 173 markdown files under `docs/` and the repository root, `docs/research/`
 * excluded. They carry **1910** rooted `file:line` anchors into `src/` or
 * `tests/`, spread over **104** documents. **1539** of the 1910 have at least
 * one code span beside them that could serve as a fragment; **764** carry one
 * that actually occurs within three lines of the cited line, and **1146** do
 * not. Those 1146 sit in **89** documents, and 435 of them are in two:
 * `docs/adr/STATUS-QUEUE.md` (260) and `docs/PLAYER_STRINGS.md` (175).
 *
 * How many of the 1146 are *wrong* rather than merely unquoted, measured two
 * ways because neither alone is honest:
 *
 * - **Mechanically certain: 134.** 33 cite a **blank line**; 101 cite a line
 *   that is nothing but punctuation -- a bare block-comment terminator, `})`,
 *   `}`. No sentence means one of those. A further 507 cite a line inside a comment or docblock, which is
 *   the sweep's exact signature but is sometimes deliberate, so they are not
 *   counted here.
 * - **By hand: 11 of 13.** Fourteen were drawn by a fixed-seed sample from the
 *   711 unverified anchors outside the two bulk documents, and thirteen were
 *   opened against their own sentences. Eleven cite something the sentence does
 *   not mean, one (`src/simulation/prisoners/room-instance-registry.ts:81-87`)
 *   is correct and merely unquoted, and one was too ambiguous to call. Five of
 *   the eleven are pinned as controls below rather than only counted.
 *
 * Read together: the unquoted population is majority-wrong, and the two
 * mechanical figures bound it from below rather than describing it.
 *
 * ## The four decisions, and the reasoning for each
 *
 * ### 1. Scope: a pinned per-document budget, not a per-anchor allowlist
 *
 * Grandfathering the corpus is what makes this affordable; requiring it of new
 * anchors is what stops the population growing. "New" is expressed as **a
 * per-document ceiling on unverified anchors**, pinned below as the output of
 * the derivation in this file (see `DERIVATION` and the comment above
 * `UNVERIFIED_BUDGET`).
 *
 * Why a budget rather than the allowlist the brief offered as the other option:
 *
 * - **Size.** The derivation counts 1146 unverified anchors across 89
 *   documents. Eighty-nine rows is a table a reader checks; 1146 is a table a
 *   reader scrolls past, and the largest file in `tests/foundation/` today is
 *   2865 lines.
 * - **It is a ratchet in the direction the corpus needs.** The ceiling is an
 *   upper bound, so quoting an old anchor lowers the count and passes; deleting
 *   a document lowers it and passes. Only *adding* an unverified anchor fails.
 * - **A new document starts at zero**, with no entry in the table, which is
 *   exactly the population the sweep found. Twenty of its twenty-three dead
 *   anchors were a day old. Under a per-anchor allowlist a new document is
 *   equally gated, so this is a tie; under any scheme keyed on a cutoff date or
 *   a commit it is not, which is why neither of those is here.
 *
 * What the budget gives up against an allowlist is named under *blind spots*.
 *
 * ### 2. Tolerance: three lines
 *
 * A fragment counts as present if it occurs on any line in
 * `[first - 3, last + 3]`. Measured over the in-scope corpus, the marginal
 * yield per line of slack falls off a cliff after two:
 *
 * | slack | anchors newly verified | per line |
 * | --- | --- | --- |
 * | 0 | 617 | -- |
 * | 1-2 | +134 | 67 |
 * | 3-5 | +53 | 17.7 |
 * | 6-10 | +80 | 16.0 |
 * | 11-20 | +96 | 9.6 |
 * | 21-50 | +136 | 4.5 |
 *
 * (Those are distances to the *nearest* occurrence of a candidate fragment, so
 * the far buckets are overwhelmingly a symbol that happens to appear elsewhere
 * in the same file rather than a tolerable near-miss.)
 *
 * **What three buys:** a range anchor whose fragment sits on the declaration a
 * line or two inside it; an anchor written against a file that has since taken
 * one or two inserted lines above the target; a fragment quoted from the
 * signature line of the function whose body line is cited.
 *
 * **What it lets through:** any drift of four lines or more that still happens
 * to carry a matching fragment within three lines of the new number -- and,
 * more importantly, it is chosen *below* the defect. The sweep measured drift
 * of 10-15 lines. A tolerance of 10 would have passed every one of those
 * silently, so the number is bounded above by the thing it exists to catch, not
 * only by the coverage it buys.
 *
 * ### 3. Non-vacuity
 *
 * Every substantive assertion here is a "found nothing" claim and a scanner
 * that resolves nothing satisfies all of them. Four things are pinned against
 * that, in increasing strength:
 *
 * - the number of documents scanned and the number carrying an in-scope anchor;
 * - the number of in-scope anchors found, and the number for which the
 *   extractor offered at least one candidate fragment -- an extractor that
 *   silently stopped matching fails both;
 * - the number that **verify**, which no blinded regex can satisfy;
 * - a **positive control** of eight anchors opened by hand while writing this
 *   file: three that must verify and five that must not. A change to the
 *   tolerance, the candidate window or the matcher moves at least one of them,
 *   and unlike a count they say *why*.
 *
 * ### 4. A new file
 *
 * Stated under "Why this is a second gate" above: the existing file's docblock
 * declares the drift check out of its reach and declares itself allowlist-free.
 * Both would become false sentences inside their own file.
 *
 * ## Blind spots, stated because a contract that hides its false negatives is
 * the thing this repository distrusts most
 *
 * - **Swap-in-place.** The budget counts. Deleting one unverified anchor from a
 *   document and adding a different unverified one in the same commit leaves
 *   the count unchanged and passes. A per-anchor allowlist would catch that and
 *   this does not; it is the price of 89 rows instead of 1146.
 * - **A wrong anchor that quotes a fragment which happens to be nearby.** A
 *   fragment matched as a substring anywhere in a seven-line window is a weak
 *   witness. `readonly width?: number` verifies against a dozen lines.
 * - **A fragment that is not from the cited line at all.** The gate matches the
 *   *nearest* candidate in the window, not the one the sentence means, so a
 *   sentence citing three symbols verifies if any one of them lands.
 * - **Prose in a docblock.** A fragment quoted from a comment verifies exactly
 *   as one quoted from code, because nothing here parses TypeScript. ADR 0042's
 *   defect above would still pass if the sentence had quoted the interface's
 *   name instead of the field's.
 * - **`docs/research/` is not scanned**, for the reason its own README gives
 *   and the sibling gate repeats: a dated record does not become wrong, it
 *   becomes older.
 * - **Anchors into paths outside `src/` and `tests/`** -- `scripts/`,
 *   `supabase/`, `.github/` -- are counted by neither gate here. They are a
 *   small and slow-moving population; extending to them is a widening of
 *   `IN_SCOPE_ROOTS` and nothing else.
 */

const ROOT = join(__dirname, '../..');

/** Read-only dated history. See the blind-spot list. */
const RESEARCH = join('docs', 'research');

/** The two trees whose churn the sweep measured. */
const IN_SCOPE_ROOTS = ['src/', 'tests/'] as const;

/** Decision 2. Measured; see the table in the docblock. */
const TOLERANCE_LINES = 3;

/**
 * How far from the anchor span a candidate fragment may sit, in characters
 * between the two spans, and in how many intervening code spans. A fragment
 * further away than one clause is not "beside" the anchor in any sense a reader
 * would accept, and widening this is the cheapest way to make the gate lie.
 */
const CANDIDATE_WINDOW_CHARS = 160;
const CANDIDATE_WINDOW_SPANS = 6;

/** Markdown under `docs/`, plus the markdown at the repository root. */
function collectMarkdownFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectMarkdownFiles(path));
      continue;
    }
    if (entry.endsWith('.md')) files.push(path);
  }
  return files;
}

const markdownFiles = [
  ...collectMarkdownFiles(join(ROOT, 'docs')),
  ...readdirSync(ROOT)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => join(ROOT, entry)),
].filter((file) => !relative(ROOT, file).startsWith(RESEARCH));

/**
 * The same anchor form the sibling gate reads, deliberately character for
 * character: a backtick span whose **entire** content is a repository-rooted
 * path with an extension, followed by `:N` or `:N-M`. Two gates disagreeing
 * about what an anchor is would be worse than either being narrow.
 */
const ANCHOR = /^((?:docs|src|tests|scripts|supabase|public|\.github)\/[^\s`]*\.[A-Za-z0-9]+):(\d+)(?:-(\d+))?$/;

/** A span that is itself a path or a bare `:NNN` continuation is not a fragment. */
const PATH_LIKE = /^[^\s`]*\.[A-Za-z0-9]+(?::\d+(?:-\d+)?)?$/;
const LINE_CONTINUATION = /^:\d+(?:-\d+)?$/;

interface CodeSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface Citation {
  readonly source: string;
  readonly token: string;
  readonly path: string;
  readonly first: number;
  readonly last: number;
  readonly candidates: readonly string[];
}

function codeSpansIn(text: string): readonly CodeSpan[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => ({
    text: match[1]!,
    start: match.index!,
    end: match.index! + match[0].length,
  }));
}

/**
 * Candidate fragments for the anchor at `index`: neighbouring code spans in the
 * same paragraph, close enough to be part of the same clause, that are not
 * themselves anchors or path fragments.
 */
function candidatesFor(text: string, spans: readonly CodeSpan[], index: number): readonly string[] {
  const anchor = spans[index]!;
  const found: string[] = [];
  const from = Math.max(0, index - CANDIDATE_WINDOW_SPANS);
  const to = Math.min(spans.length - 1, index + CANDIDATE_WINDOW_SPANS);
  for (let other = from; other <= to; other += 1) {
    if (other === index) continue;
    const span = spans[other]!;
    const after = span.start >= anchor.end;
    const gap = after ? span.start - anchor.end : anchor.start - span.end;
    if (gap < 0 || gap > CANDIDATE_WINDOW_CHARS) continue;
    const between = after ? text.slice(anchor.end, span.start) : text.slice(span.end, anchor.start);
    // A blank line is a paragraph break, and a different paragraph is not "beside".
    if (/\n[ \t]*\n/.test(between)) continue;
    const fragment = span.text.trim();
    if (fragment.length < 3) continue;
    if (PATH_LIKE.test(fragment)) continue;
    if (LINE_CONTINUATION.test(fragment)) continue;
    if (!/[A-Za-z_]/.test(fragment)) continue;
    found.push(fragment);
  }
  return found;
}

function citationsIn(file: string): readonly Citation[] {
  const source = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const spans = codeSpansIn(text);
  const citations: Citation[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    // Trailing sentence punctuation is the sentence's, not the anchor's.
    const token = spans[index]!.text.trim().replace(/[.,;]+$/, '');
    const parsed = ANCHOR.exec(token);
    if (parsed === null) continue;
    const path = parsed[1]!;
    if (!IN_SCOPE_ROOTS.some((root) => path.startsWith(root))) continue;
    const first = Number(parsed[2]);
    citations.push({
      source,
      token,
      path,
      first,
      last: parsed[3] === undefined ? first : Number(parsed[3]),
      candidates: candidatesFor(text, spans, index),
    });
  }
  return citations;
}

/** Cited files are read once each; the sibling gate's docblock prices why. */
const fileLines = new Map<string, readonly string[] | null>();

function linesOf(path: string): readonly string[] | null {
  const cached = fileLines.get(path);
  if (cached !== undefined) return cached;
  const target = join(ROOT, path);
  const lines = existsSync(target) ? readFileSync(target, 'utf8').split('\n') : null;
  fileLines.set(path, lines);
  return lines;
}

/** Does some candidate fragment occur within `TOLERANCE_LINES` of the anchor? */
function isVerified(citation: Citation): boolean {
  if (citation.candidates.length === 0) return false;
  const lines = linesOf(citation.path);
  if (lines === null) return false;
  const first = Math.max(1, citation.first - TOLERANCE_LINES);
  const last = Math.min(lines.length, citation.last + TOLERANCE_LINES);
  for (let line = first; line <= last; line += 1) {
    const text = lines[line - 1];
    if (text === undefined) continue;
    if (citation.candidates.some((fragment) => text.includes(fragment))) return true;
  }
  return false;
}

const citations = markdownFiles.flatMap(citationsIn);
const verified = citations.filter(isVerified);
const unverified = citations.filter((citation) => !isVerified(citation));

function unverifiedByDocument(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const citation of unverified) counts.set(citation.source, (counts.get(citation.source) ?? 0) + 1);
  return counts;
}

/*
 * ## DERIVATION
 *
 * `UNVERIFIED_BUDGET` below is the **output of a derivation, not a hand-written
 * list**, and the derivation is the code in this file. To regenerate it after a
 * legitimate bulk change, add this to the bottom of the file, run
 * `npx vitest run tests/foundation/documentation-anchor-quotation-contract.test.ts`,
 * paste the printed table over the constant, and delete it again:
 *
 *     it('derive', () => {
 *       const rows = [...unverifiedByDocument().entries()].sort(([a], [b]) => a.localeCompare(b));
 *       console.log(rows.map(([doc, n]) => `  '${doc}': ${n},`).join('\n'));
 *     });
 *
 * Regenerating it is not a neutral act: every row it raises is an anchor nobody
 * can check. Lower a row by quoting the anchors; raise one only with the reason
 * in the commit message.
 */

/**
 * The most unverified `src/`/`tests/` anchors each document may carry.
 *
 * Derived on `origin/main` @ `54adc87c` by the procedure above -- 1146 anchors
 * over 89 documents, out of 1910 in scope. A document absent from this table
 * has a budget of zero, which is the whole point: a document written after this
 * gate quotes its anchors or does not cite them.
 */
const UNVERIFIED_BUDGET: Readonly<Record<string, number>> = {
  'docs/adr/0003-simulation-worker-protocol.md': 9,
  'docs/adr/0005-entity-storage-model.md': 1,
  'docs/adr/0006-simulation-worker-adapter.md': 2,
  'docs/adr/0008-trusted-service-boundary.md': 1,
  'docs/adr/0012-derived-identifier-reproducibility.md': 1,
  'docs/adr/0013-free-tier-cloud-save-capacity.md': 1,
  'docs/adr/0015-actor-identity-allocation.md': 20,
  'docs/adr/0017-money-primary-resource-model.md': 5,
  'docs/adr/0019-tile-ownership-under-overlapping-parcels.md': 8,
  'docs/adr/0020-deterministic-kernel.md': 15,
  'docs/adr/0022-room-zoning-surface.md': 26,
  'docs/adr/0023-room-occupancy-authority.md': 6,
  'docs/adr/0025-guard-hiring-surface.md': 10,
  'docs/adr/0026-entity-id-lifetime.md': 3,
  'docs/adr/0028-object-placement-and-derived-room-capacity.md': 16,
  'docs/adr/0029-concurrent-room-use-claims.md': 9,
  'docs/adr/0031-build-queue-cancellation-surface.md': 1,
  'docs/adr/0034-releasing-a-claimed-guard.md': 6,
  'docs/adr/0038-what-makes-a-save-compatible.md': 15,
  'docs/adr/0039-a-keyboard-route-to-room-zoning.md': 3,
  'docs/adr/0040-the-shape-of-the-render-delta-channel.md': 22,
  'docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md': 1,
  'docs/adr/0042-attaching-consequences-to-the-simulation-loop.md': 47,
  'docs/adr/0043-account-session-states-and-what-they-may-do-to-local-data.md': 4,
  'docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md': 1,
  'docs/adr/0046-shipping-the-telemetry-pipeline.md': 2,
  'docs/adr/0047-raising-a-building-on-open-ground.md': 34,
  'docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md': 3,
  'docs/adr/0050-when-a-sentence-ends.md': 4,
  'docs/adr/0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md': 9,
  'docs/adr/0053-who-may-stand-a-security-post.md': 2,
  'docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md': 5,
  'docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md': 3,
  'docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md': 4,
  'docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md': 5,
  'docs/adr/0061-what-the-prison-produces-on-its-own.md': 1,
  'docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md': 3,
  'docs/adr/0067-what-an-assault-costs-its-instigator.md': 2,
  'docs/adr/0068-classifying-a-pending-rooms-enclosure-on-the-client.md': 3,
  'docs/adr/0071-what-bounds-a-room-whose-activity-consumes-no-object.md': 1,
  'docs/adr/0073-who-orders-a-contraband-search.md': 3,
  'docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md': 6,
  'docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md': 11,
  'docs/adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md': 6,
  'docs/adr/0081-whether-a-purchase-may-be-partly-filled.md': 5,
  'docs/adr/0082-what-order-build-orders-are-carried-out-in.md': 2,
  'docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md': 11,
  'docs/adr/0084-what-the-alerts-channel-owes-a-player.md': 8,
  'docs/adr/0085-what-the-hud-corner-is-for-and-what-the-strip-may-drop.md': 5,
  'docs/adr/0086-what-refreshes-a-pulled-hud-readout.md': 10,
  'docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md': 7,
  'docs/adr/0089-how-a-host-refusal-names-its-reason.md': 24,
  'docs/adr/0090-medium-as-a-warning-not-a-skipped-step.md': 1,
  'docs/adr/0091-what-clears-the-refusal-band.md': 9,
  'docs/adr/0092-who-decides-where-a-guard-stands.md': 14,
  'docs/adr/0093-a-carry-is-an-action.md': 27,
  'docs/adr/0094-which-names-a-prison-draws-from.md': 7,
  'docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md': 8,
  'docs/adr/0097-what-the-world-view-is-required-to-communicate.md': 18,
  'docs/adr/0098-what-says-which-room-this-is.md': 4,
  'docs/adr/0100-whether-a-rendered-object-sprite-can-be-published-art.md': 1,
  'docs/adr/0101-what-a-zoning-tint-must-deliver.md': 5,
  'docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md': 69,
  'docs/adr/0104-what-undo-takes-back.md': 12,
  'docs/adr/0105-what-makes-a-local-save-the-newest-one.md': 4,
  'docs/adr/0106-how-a-finished-wall-comes-down-without-a-keyboard.md': 4,
  'docs/adr/0107-what-a-stale-build-order-cancellation-is-refused-for.md': 15,
  'docs/adr/0108-what-nobody-can-get-in-should-mean.md': 9,
  'docs/adr/0109-what-a-stale-local-save-is-refused-for.md': 10,
  'docs/adr/0110-what-security-sector-a-room-is-in.md': 6,
  'docs/adr/0111-how-a-room-instances-rectangle-reaches-the-render-side.md': 6,
  'docs/adr/0114-what-a-deleted-prisons-undo-copy-holds-and-when-it-closes.md': 6,
  'docs/adr/0116-whether-a-finished-object-is-an-event.md': 14,
  'docs/adr/drafts/how-a-language-change-reaches-a-running-page.md': 5,
  'docs/adr/drafts/what-a-second-tab-follows.md': 6,
  'docs/adr/README.md': 12,
  'docs/adr/STATUS-QUEUE.md': 260,
  'docs/AGENT_WORKFLOW.md': 2,
  'docs/HANDOVER-2026-08-26.md': 3,
  'docs/HANDOVER-2026-09-15.md': 2,
  'docs/HUD_PROJECTIONS.md': 3,
  'docs/IDENTITY_V5_ROLLOUT.md': 3,
  'docs/INPUT.md': 1,
  'docs/LOCALIZATION.md': 2,
  'docs/OPERATIONS.md': 2,
  'docs/PLAYER_STRINGS.md': 175,
  'docs/TESTING.md': 3,
  'docs/VISUAL_IDENTITY.md': 5,
  'docs/WORLD.md': 1,
};

describe('rooted src/ and tests/ anchors in the documentation carry a checkable quoted fragment', () => {
  it('scans documents and finds anchors in them, so nothing below can pass vacuously', () => {
    // Floors, not equalities: a document added or deleted must not fail this,
    // an extractor that silently stopped matching must.
    expect(markdownFiles.length).toBeGreaterThan(150);
    expect(new Set(citations.map((citation) => citation.source)).size).toBeGreaterThan(60);
    expect(citations.length).toBeGreaterThan(900);
  });

  it('offers candidate fragments for most anchors, so the fragment extractor cannot silently die', () => {
    const withCandidates = citations.filter((citation) => citation.candidates.length > 0);

    // 1539 of 1910 on the derivation commit. A candidate window that stopped
    // matching, or a paragraph rule that swallowed everything, lands here.
    expect(withCandidates.length).toBeGreaterThan(1100);
  });

  it('verifies a large body of anchors against the code, so a blinded matcher cannot pass', () => {
    // 764 on the derivation commit. This is the assertion no broken regex
    // satisfies: it is the only one that requires the scan to *resolve*
    // something rather than to find nothing.
    expect(verified.length).toBeGreaterThan(550);
  });

  it('agrees with eight anchors opened by hand, three that must verify and five that must not', () => {
    /*
     * The positive and negative controls, and the strongest of the four
     * non-vacuity pins because they say *why* rather than *how many*. Each was
     * opened in the tree at `54adc87c` while writing this file.
     *
     * **Verifying.**
     * - ADR 0079's table row *"| in-game day | **2,400 ticks** |
     *   `DAY_LENGTH_TICKS`, `src/simulation/prisoners/regime.ts:12` |"*.
     *   `regime.ts:12` is `export const DAY_LENGTH_TICKS = 2_400;`. Exact.
     * - ADR 0103's *"(`src/simulation/incidents/gangs.ts:71`) stays
     *   unwritten"*, beside `adjustReputation`. `gangs.ts:71` is
     *   `public adjustReputation(gangId: string, delta: number): void {`. Exact.
     * - ADR 0093's *"`SAVE_SCHEMA_VERSION` is `5`
     *   (`src/persistence/save-schema.ts:36`)"*. `save-schema.ts:36` is
     *   **blank**; the declaration is `:38`. This one is the tolerance
     *   demonstrating itself: an anchor two lines stale still resolves, because
     *   the fragment moved with the code and the number did not. (The
     *   surrounding sentence is separately wrong -- the constant is `6` --
     *   which is a claim gate's business, not this one's.)
     *
     * **Not verifying, and every one of the five is a real defect.**
     * - `src/main.ts:621` in ADR 0092 is `: {`, the opening of a conditional
     *   spread of `roomTool`; the sentence says `HireStaff`. The sentence also
     *   contains the word *re-anchored*.
     * - `src/simulation/runtime/new-session.ts:1400` in ADR 0093 is
     *   `const occupants = resolveOccupants(sectorId);`; the sentence says
     *   `JobSystem` is registered there.
     * - `src/simulation/identity/actor-identity.ts:188` in ADR 0103 is blank.
     * - `src/simulation/construction/system.ts:266` in ADR 0019 is cited as
     *   *"-- `submitOrder`, the one named"* in a list of `canBuildAt` call
     *   sites. That line is prose inside `DoorConstructionService`'s docblock.
     * - `src/simulation/refusals/refusal-log.ts:325-327` in ADR 0107 is cited
     *   beside `RemoveWallRefusalReason`; `:327` declares
     *   `ADMIT_REFUSAL_REASONS`, a different refusal family in the same file.
     *   This is the sweep's shape exactly: right file, right subject, wrong
     *   table.
     *
     * If a future commit fixes one of the five, this control goes red naming
     * it -- move that row up into the verifying group and lower the document's
     * budget. That is the control working, not failing.
     */
    const control = (source: string, token: string): boolean | string => {
      const found = citations.filter(
        (citation) => citation.source === source && citation.token === token,
      );
      if (found.length === 0) return `${source} -> ${token}: the scan no longer finds this anchor`;
      return found.every(isVerified);
    };

    expect({
      'regime.ts:12': control('docs/adr/0079-a-sentence-long-enough-to-be-a-history.md', 'src/simulation/prisoners/regime.ts:12'),
      'gangs.ts:71': control('docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md', 'src/simulation/incidents/gangs.ts:71'),
      'save-schema.ts:36': control('docs/adr/0093-a-carry-is-an-action.md', 'src/persistence/save-schema.ts:36'),
      'main.ts:621': control('docs/adr/0092-who-decides-where-a-guard-stands.md', 'src/main.ts:621'),
      'new-session.ts:1400': control('docs/adr/0093-a-carry-is-an-action.md', 'src/simulation/runtime/new-session.ts:1400'),
      'actor-identity.ts:188': control('docs/adr/0103-what-a-gang-is-and-how-a-grudge-forms.md', 'src/simulation/identity/actor-identity.ts:188'),
      'system.ts:266': control('docs/adr/0019-tile-ownership-under-overlapping-parcels.md', 'src/simulation/construction/system.ts:266'),
      'refusal-log.ts:325-327': control('docs/adr/0107-what-a-stale-build-order-cancellation-is-refused-for.md', 'src/simulation/refusals/refusal-log.ts:325-327'),
    }).toEqual({
      'regime.ts:12': true,
      'gangs.ts:71': true,
      'save-schema.ts:36': true,
      'main.ts:621': false,
      'new-session.ts:1400': false,
      'actor-identity.ts:188': false,
      'system.ts:266': false,
      'refusal-log.ts:325-327': false,
    });
  });

  it('adds no unverified anchor to any document beyond its pinned budget', () => {
    const over: string[] = [];
    for (const [document, count] of [...unverifiedByDocument().entries()].sort()) {
      const budget = UNVERIFIED_BUDGET[document] ?? 0;
      if (count <= budget) continue;
      over.push(
        `${document}: ${count} anchors into src/ or tests/ carry no quoted fragment that occurs within ` +
          `${TOLERANCE_LINES} lines of them, against a budget of ${budget}. Quote the code beside the ` +
          `anchor -- \`file.ts:123\`, \`theSymbolOnThatLine\` -- rather than raising the budget.`,
      );
    }

    expect(over, 'these documents cite code by a line number nothing can check').toEqual([]);
  });

  it('pins no budget for a document that no longer needs one', () => {
    // The ratchet's other half: a budget row left behind after its document was
    // fixed or deleted would silently re-admit unverified anchors later.
    const live = unverifiedByDocument();
    const stale = Object.keys(UNVERIFIED_BUDGET).filter(
      (document) => (live.get(document) ?? 0) === 0,
    );

    expect(stale, 'these budget rows are spent; delete them').toEqual([]);
  });
});


