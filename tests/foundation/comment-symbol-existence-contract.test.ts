import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/canonical-iteration';

/**
 * A comment that names a symbol must name one that exists — or say that it does
 * not.
 *
 * ## The class this closes, and the part of it that this cannot
 *
 * Issue #543 is about a present-tense claim in file A concerning file B, with
 * no test tying the two together. #558 corrected the batch the issue names;
 * the sweep after it found a second batch with a **narrower** shape -- not a
 * claim about another module's *behaviour* but a claim about another module's
 * *vocabulary*. `src/simulation/events/event-log.ts` said the
 * publication watermark lives on `WorkerStateMachine._publishedEventSequence`;
 * the class is `SimulationWorkerStateMachine` and always has been.
 * `src/simulation/protocol/types.ts` named
 * `STATE_INCOME_UNMET_NEED_WITHHOLDING_MINOR_UNITS`, which is
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`. Two test docblocks named
 * an assertion helper — `hasNoInFlightTravel`, `SAFETY_HELD_BY_COVERAGE` —
 * that has never existed in this repository, so a reader who did the obvious
 * thing and grepped would have concluded the test did not make the check. It
 * does; the assertion is inline and has no name.
 *
 * That sub-shape is mechanical, and this is the gate for it. **The behavioural
 * half is not, and is not attempted here**: nothing in this file can tell that
 * *"nothing debits the treasury on a schedule"* stopped being true when
 * `PayrollSystem` landed, because every word of that sentence is ordinary
 * English and the symbol it does not mention is the whole defect. #543's own
 * closing note reached the same conclusion — a comment reasoning from a premise
 * about the composition root "probably cannot be mechanised" — and the
 * mitigation for that half stays the discipline.
 *
 * ## What it reads
 *
 * Every backticked token in two corpora — every **comment** under `src/` and
 * `tests/`, and every **guide** at the top level of `docs/` — where the token
 * is one of two shapes that are unambiguously repository vocabulary:
 *
 * - a **member path** whose root is PascalCase (`Foo.bar`, `Foo.bar.baz`), and
 * - a **screaming constant** of three or more segments
 *   (`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`).
 *
 * Two-segment constants (`NEED_MAX`, `ROOM_GATED`) are deliberately out of
 * scope: they collide with prose acronyms and with external vocabulary often
 * enough that admitting them would need an allowlist, and an allowlist is what
 * this file is built to avoid. **#991 asked for that sentence to be revisited
 * and it survived a measurement, which is the only reason it is still here** —
 * see "What #991 asked for, and what measuring it changed" below. Bare
 * camelCase functions are out for the same reason and cost more —
 * `advanceTunnel`, `createNewSession` and `dismissStaffCompletely` were all
 * real findings of this shape and none of them is reachable from a rule that
 * does not also flag the word `roomsPanel` in a sentence about a panel.
 *
 * ## The second corpus: the guides, and deliberately not the records
 *
 * Added for #991. Until then this gate read `src/` and `tests/` only, and
 * `docs/PRISONER_OPERATIONS.md` carried `STARTING_ORIGIN_TILE` — a
 * three-segment screaming constant inside a backticked token, precisely the
 * shape matched here — with **one occurrence in the whole tree** and no
 * declaration anywhere in it. The constant that sentence means is
 * `NEW_PRISON_ORIGIN_TILE` (`src/main.ts:692`), which `src/main.ts:3054` does
 * fill `AdmitPrisoner`'s `x`/`y` from and `src/main.ts:837` does hand the
 * Build panel as its `origin`. It survived only because it was in Markdown.
 *
 * **`docs/adr/` and `docs/research/` are not read, and that is a rule about
 * the corpus rather than a list of sentences.** An ADR names rejected
 * alternatives and proposed symbols by design; a research report is a
 * measurement taken on a date and must not be edited to agree with today's
 * tree — `docs/AGENT_WORKFLOW.md` section 4 says *"Mark both directions rather
 * than overwriting"*, and rewriting a dated report to satisfy a linter is the
 * opposite of that. The guides at `docs/`'s top level are present-tense and
 * are the documents this repository maintains as true today. So the rule grows
 * when a guide is added — automatically, into scope — and never when somebody
 * declines to fix a sentence, which is the distinction that separates it from
 * an allowlist.
 *
 * Measured on `main` at v0.0.541, same extractor and same two shapes over both
 * halves:
 *
 * - **the guides: 28 files, 1,086,638 characters of prose, 513 citations
 *   parsed, 0 unresolved** after the four corrections #991 forced.
 * - **`docs/adr/` and `docs/research/`: 213 files, 7,011,027 characters, 1,978
 *   citations parsed, 53 unresolved across 32 distinct tokens.** They are
 *   `ThoughtDefOf.SleptOnGround`, `BedUtility.GetSleepingSlotsCount`,
 *   `MAXIMUM_SIZE_64` and `LUXURY_BED_SINGLE` (other games, in competitive
 *   research), `PLANNED_PROJECTION_IDS` (an audit *proposing* a list that does
 *   not exist), `ZzProbeThing.zzMember` and `NoSuchThing.doesNotExist` (this
 *   gate's own fixtures, quoted in a report about it), and a tail of names
 *   ADRs record as deleted. **Not one of the 53 is a defect**, which is why
 *   #991's estimate that extending to `docs/**` was "the cheap half and it
 *   closes miss 1 outright" is the half of that issue this file does not
 *   follow: it closes miss 1, and it is not cheap.
 *
 * Comments are extracted by taking the difference between a file and
 * `stripComments(file)`. That helper is the repository's single pinned
 * scanner: `tests/foundation/comment-stripping-contract.test.ts` holds it in
 * both directions over every `.ts` file under `src/` and `tests/`, and #278 is
 * the defect a private two-regex copy caused. Using it means the code side and
 * the comment side of this gate are the same lexer's two halves and cannot
 * disagree about where a comment ends.
 *
 * ## What counts as existing
 *
 * The vocabulary is every identifier in the **stripped** text of every tracked
 * `.ts`, `.mjs`, `.js` and `.json` file. Stripped, so that a symbol which
 * exists only in prose cannot vouch for itself — that loop is what made the
 * first pass of this sweep report nothing at all.
 *
 * It is a *textual* check and claims nothing more. `Foo.bar` passes when `Foo`
 * exists somewhere, without asking whether `bar` is a member of it, so ADR
 * 0064's `RoomInstanceRegistry.residentIds` — a real accessor that the income
 * line stopped walking — is invisible here and was corrected by hand. Saying
 * so is the point: the honest boundary is "the name resolves", not "the
 * sentence is true".
 *
 * ## The two exclusions, and why neither is an allowlist of defects
 *
 * **External namespaces.** `TypedArray` is an ECMAScript specification name
 * with no global behind it, and `ERR_*` is Node's and pnpm's error-code
 * namespace. Both are cited correctly and neither can ever be declared here.
 * These are exclusions of *foreign vocabulary*, which grows only when this
 * repository starts citing a new external API — unlike an allowlist of
 * sentences, which grows every time somebody declines to fix one.
 * `documentation-source-anchor-contract.test.ts` refuses an allowlist outright
 * and is right to; the distinction that makes this admissible is that no entry
 * below names a claim this repository could make true.
 *
 * **Deletion records.** This tree writes them on purpose and they are the
 * corpus's best habit: *"There used to be a second answer:
 * `RoomSystem.validateRoom` reported every `object` requirement as missing"*,
 * *"There is no `NEVER_LAID_OUT_AT_375`"*. A comment whose block says in words
 * that the thing is gone is exempt, and the rule is therefore not a hole but a
 * **convention with teeth**: if you name a symbol that does not exist, say in
 * the same comment that it does not exist. Every one of the six such blocks in
 * the tree already satisfied it before this test was written, which is why the
 * marker list below is read off the corpus rather than invented.
 *
 * ## Non-vacuity
 *
 * The substantive assertion is `toEqual([])`, so the failure this file is most
 * exposed to is finding nothing for the wrong reason. Four floors and two
 * controls stand against that on the comment corpus: the walk (>600 files),
 * the extracted comment volume (>3,000,000 characters), the number of
 * citations actually parsed and compared (>1,500; 1,990 as this was written),
 * and the size of the vocabulary (>12,000; 17,088 then, 24,761 at v0.0.541). A
 * stripper that blanked whole files, a regex that stopped matching, or a
 * vocabulary built from an empty walk each fails a floor rather than passing
 * quietly, and all three were measured doing so.
 *
 * The guide corpus carries three of its own, for the same reason and to the
 * same shape: the walk (>20 files; 28), the prose read (>700,000 characters;
 * 1,086,638) and the citations parsed (>350; 513). It shares the vocabulary
 * floor, because it resolves against the same vocabulary — a guide scan over
 * an empty vocabulary would flag all 513 rather than none, but a guide scan
 * that read no guides would flag none, and that is the direction these floors
 * are for.
 *
 * The floors move with the corpus and are deliberately loose -- they are
 * "the scan still works" and not "the corpus is this size".
 *
 * ## Watched going red, each mutation reverted by hand before the next
 *
 * Seven mutations, and **two of them survived first and are recorded as
 * survivors** because what they exposed changed the design rather than the
 * evidence.
 *
 * - `WorkerStateMachine.handleSubmitCommand` put back into
 *   `src/simulation/refusals/refusal-log.ts`: **1 failed**, naming the file,
 *   the line and the unresolved root. **This mutation passed 3/3 against the
 *   first version of this file**, which read the absence markers over the
 *   whole comment block: sixty lines below that citation an unrelated bullet
 *   says *"there is exactly one record, so there is no ..."*, and that was
 *   enough to exempt it. See `MARKER_WINDOW_CHARACTERS`.
 * - `MARKER_WINDOW_CHARACTERS` 240 -> 240,000, which is the block rule again
 *   in another form: **3 passed**, because after this sweep the live corpus
 *   holds no missing name at all for a loose window to let through. Now
 *   **1 failed**, on the `distantMarker` fixture added for exactly this.
 * - the vocabulary built from raw source instead of stripped source: **3
 *   passed**, and for the same reason -- no comment in the tree still names a
 *   symbol that exists nowhere, so a self-vouching loop has nothing to vouch
 *   for. Now **1 failed**, on the `scanCorpus` control.
 * - `SAFETY_HELD_BY_COVERAGE`'s *"it has never existed"* clause removed from
 *   `tests/integration/room-gated-needs.test.ts` while the name stayed: **3
 *   passed**, because the same sentence ends *"there is no name to grep for"*
 *   and that is a second marker in range. Removing both: **1 failed**. The
 *   exemption is not always on, and this is the measurement rather than the
 *   claim.
 * - the comment extractor blinded (`commentTextOf(source, source)`, so no
 *   character is ever seen as a comment): **1 failed**, the comment-volume
 *   floor, at 0 against 3,000,000.
 * - `MEMBER_PATH` narrowed to three or more segments: **3 failed** -- the
 *   citation floor at 738 against 1,500, and both controls.
 * - `EXTERNAL_ROOTS` emptied: **2 failed**, naming all four `TypedArray.fill`
 *   and `TypedArray.set` sites. The exclusion is load-bearing rather than
 *   decorative, which is worth knowing about a list that looks like an
 *   allowlist.
 *
 * The two survivors share a shape and it is the honest limit of this file: an
 * exemption that has become too generous is invisible from a corpus with
 * nothing to exempt. Only a control can see it, so the controls carry the
 * exemption rules and the corpus carries the finding.
 *
 * ### Added for the guide corpus (#991), same discipline
 *
 * - `NEW_PRISON_ORIGIN_TILE` reverted to `STARTING_ORIGIN_TILE` in
 *   `docs/PRISONER_OPERATIONS.md`: **1 failed**, naming
 *   `docs/PRISONER_OPERATIONS.md:1335`. That is the live case #991 reports,
 *   and it is the red this corpus was added to produce.
 * - the guide filter changed to `.mdx`, so the walk matches nothing: **1
 *   failed**, the guide-count floor, at 0 against 20. A walk that stopped
 *   finding the corpus fails rather than reporting it clean.
 * - the guide walk pointed at `docs/adr/` instead: **1 failed with 29
 *   unresolved**, which is not the result predicted for it here before it was
 *   run — the prediction was the count floor, on the reasoning that `docs/adr/`
 *   holds directories. It holds 100 Markdown files. The bullet is kept in this
 *   corrected form rather than deleted because the mutation turned out to be
 *   the more useful one: it is the records corpus arriving through the front
 *   door, and 29 of its 53 findings are visible in one failure message —
 *   `ThoughtDefOf.SleptOnGround`, `MAXIMUM_SIZE_64`, `RoomType.isSatisfactory`
 *   and the rest of another game's vocabulary, none of them a defect. That is
 *   the argument for the corpus rule above, measured instead of asserted.
 * - `SUPABASE_` and `PLAYWRIGHT_` removed from `EXTERNAL_CONSTANT_PREFIXES`:
 *   **2 failed**, naming all seven `docs/DEPLOYMENT.md` sites and
 *   `docs/TESTING.md:133`, plus the control below. Load-bearing, and measured
 *   as such rather than asserted.
 *
 * ## What #991 asked for, and what measuring it changed
 *
 * #991 reports two documented scope boundaries, each letting a live instance
 * through. **The first is real and is closed above.** The second is not, and
 * the correction is recorded here rather than in the issue because the next
 * reader of this docblock is who needs it.
 *
 * #991 says of the five comments claiming a two-entry Build catalogue: *"And
 * `BUILDABLE_REGISTRY` is not a symbol either. It has six occurrences in
 * `src/`, all inside comments."* **It is a symbol.** It is declared at
 * `src/simulation/construction/definition.ts:83` and has been since `b5f2fd21`
 * (2026-08-22), including at `376b48bf` (v0.0.477), the commit the issue's own
 * audit names; `src/main.ts:770`, `src/rendering/world/appearance.ts:413` and
 * `src/simulation/construction/system.ts:458` are three of the code sites. So
 * the root resolves, and **no rule about two-segment constants would have
 * flagged those five comments.** What is false in them is a *number* — "has
 * two entries" against a registry of twenty-one — and a count is the
 * behavioural half this file says at the top it does not attempt.
 *
 * Admitting two-segment constants was measured anyway, because a decision
 * refusing something should be refusing it for the right reason:
 *
 * - over `src/` and `tests/` comments: **515 citations of 134 distinct
 *   two-segment tokens, 1 unresolved** — `UNPAINTED_ROUTE`, at five sites, all
 *   of them deliberate deletion records of an entry `projection-reachability-contract.test.ts`
 *   removed at #331. Three of the five miss a phrase from
 *   `ABSENCE_MARKERS` and would be flagged; none of them is a defect.
 * - over the guides: **2 unresolved, and both are correct prose**.
 *   `docs/DEPLOYMENT.md:481` says *"A name containing `SECRET`,
 *   `SERVICE_ROLE`, `PRIVATE_KEY`, `PASSWORD` or `CREDENTIAL` is refused on
 *   the name alone"*, describing the five shell globs at
 *   `scripts/check-deploy-secrets.sh:93`. Three of the five are single-segment
 *   and invisible; two are two-segment and become citations of symbols that do
 *   not exist, because they are **fragments of a variable name**, not names.
 *
 * So the docblock's original reason survives its first real test: two-segment
 * constants do collide with vocabulary that is not this repository's, the very
 * first corpus they meet produces the collision, and the token they buy is one
 * whose sites are already documented deletions. #991's own narrower variant —
 * *"admit a two-segment constant that ... appears in >=3 comments"* — would
 * thread this particular needle, and is rejected for a different reason: it
 * makes the gate weakest on the freshest rot, since a stale name cited once is
 * exactly the case it declines to look at.
 *
 * **A third boundary, which #991 does not name and which is the one its own
 * examples actually fall through: the walk is `.ts`-only.** `collectFiles(src,
 * ['.ts'])` is what excludes `src/ui/tokens.css:454` and the four `hud.css`
 * comments the issue lists — not the two-segment rule — and the sentence at the
 * top of this docblock, *"every comment under `src/` and `tests/`"*, overstates
 * that. Measured: 5 CSS files under `src/` and `tests/`, 188,512 characters of
 * comment, 20 citations parsed, and **one live finding** —
 * `src/ui/hud/hud.css:3812` cites `RoomsNeedsProbe.needsItemRows`, which has
 * one occurrence in the tree; the interface is `RoomsProbe`
 * (`tests/browser/ui-harness-api.ts:963`, the member at `:1112`), and
 * `ui-shell.spec.ts:4668` and `:4804` do make the assertion the comment
 * claims. `stripComments` handles a CSS block comment unchanged (the same
 * delimiters) and no CSS file in the
 * tree contains a bare `//`, so the extension costs one line. **It is not
 * taken here because the one-token correction it needs is in `src/ui/`, which
 * another agent held while this landed** — it is reported instead, with the
 * red above reproducible by adding `'.css'` to both walks.
 */

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * This file, exempt from its own scan and from its own vocabulary.
 *
 * `adr-status-reference-contract.test.ts` sets the precedent and gives the
 * reason: a gate whose header and positive control quote false claims on
 * purpose cannot be held to them. Both halves of the exemption are needed and
 * both were measured rather than assumed.
 *
 * - **Out of the scan**, because the header above illustrates the member-path
 *   shape with `Foo.bar`, and because it quotes every stale name this sweep
 *   corrected. Without the exemption those three lines are the gate's first
 *   three failures -- which is how this exemption came to be written.
 * - **Out of the vocabulary**, and this is the more interesting half. The
 *   positive control's fixtures are *string literals*, so they survive
 *   `stripComments` and their identifiers enter the vocabulary as though they
 *   were declarations. Measured: with this file in, `WorkerStateMachine`
 *   resolves -- the fixture teaches the gate the very name the gate exists to
 *   reject. That is the same self-vouching loop the stripped-vocabulary rule
 *   closes for comments, arriving by a second route, and it is a real limit of
 *   a textual check rather than a tidy-up: any file that quotes a
 *   non-existent symbol inside a string literal silently widens the
 *   vocabulary. This is the only such file in the tree today.
 */
const SELF = path.join(repositoryRoot, 'tests', 'foundation', 'comment-symbol-existence-contract.test.ts');

/**
 * Roots this repository cites correctly and can never declare.
 *
 * `TypedArray` names the ECMAScript abstract class that `Uint8Array` and its
 * siblings inherit `fill` and `set` from; there is no such global, and four
 * comments about integer coercion cite it because it is what the specification
 * calls the thing. `ERR_` is Node's and pnpm's error-code namespace, quoted in
 * the Playwright configs and in `docs/AGENT_WORKFLOW.md`'s worktree traps.
 *
 * Extending this is a real decision, not a formality: an entry here has to be
 * a name that **cannot** exist in this repository, never one that merely does
 * not exist yet.
 *
 * **`PLAYWRIGHT_` and `SUPABASE_` were added when the guides came into scope,
 * and both are environment-variable namespaces belonging to a tool rather than
 * to this tree.** `PLAYWRIGHT_BROWSERS_PATH` is Playwright's own variable,
 * cited in `docs/TESTING.md` where it says where the browser unpacks to.
 * `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`
 * are the Supabase CLI's, and in this repository they exist only as GitHub
 * Actions secrets and workflow environment in
 * `.github/workflows/migrate-database.yml:119-149` — deploy configuration,
 * which `AGENTS.md` reservation 3 says nothing here can read back. A gate
 * demanding they resolve to a repository symbol asks for something that cannot
 * be true.
 *
 * **The property that makes `SUPABASE_` safe rather than a hole is that it does
 * not shadow this repository's own Supabase vocabulary**, which is `VITE_`-
 * prefixed: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` do not
 * start with `SUPABASE_` and stay checked. The control below asserts both
 * directions of that, because a prefix exclusion is exactly the kind of entry
 * that quietly grows to cover what it was not meant to.
 */
const EXTERNAL_ROOTS: readonly string[] = ['TypedArray'];
const EXTERNAL_CONSTANT_PREFIXES: readonly string[] = ['ERR_', 'PLAYWRIGHT_', 'SUPABASE_'];

/**
 * Suffixes that make a dotted token a filename rather than a member path.
 *
 * `CLAUDE.md` and `AGENTS.md` are cited in comments as documents. They are
 * paths, and paths are `documentation-links-contract.test.ts`'s subject.
 */
const FILE_SUFFIXES: readonly string[] = ['.md', '.ts', '.tsx', '.js', '.mjs', '.json', '.jsonc', '.css', '.html', '.yml', '.yaml', '.sh', '.png', '.svg', '.sql'];

/**
 * Phrases that make a comment a record of something's absence.
 *
 * Read off the six comments in the corpus that name a missing symbol
 * deliberately, not invented: each entry below is a phrase one of them
 * actually uses. Matched case-insensitively, and only within
 * `MARKER_WINDOW_CHARACTERS` of the name -- see that constant for the
 * measurement that forced the window.
 */
const ABSENCE_MARKERS: readonly string[] = [
  'used to',
  'no longer',
  'delete',
  'removed',
  'never existed',
  'has never',
  'have never',
  'there is no',
  'there was no',
  'does not exist',
  'did not exist',
];

/**
 * How far from the citation the marker may be, in characters of comment prose.
 *
 * **The first version of this file read the marker over the whole comment
 * block and that was useless**, measured rather than suspected: reintroducing
 * `WorkerStateMachine.handleSubmitCommand` into
 * `src/simulation/refusals/refusal-log.ts` did **not** fail, because sixty
 * lines further down the same docblock an unrelated bullet says *"there is
 * exactly one record, so there is no ..."*. Docblocks here run to a hundred
 * lines of dense prose, so a block-wide read is a block-wide exemption.
 *
 * 240 characters is about two wrapped lines either side, and it is read off
 * the six real deletion records rather than chosen: the furthest any of them
 * puts its marker from its name is the `SAFETY_HELD_BY_COVERAGE` record's
 * *"it has never existed"*, about sixty characters after, and
 * `app-shell.spec.ts`'s `NEVER_LAID_OUT_WITHOUT_A_SECURITY_SECTOR`, whose
 * heading *"the old one is quoted rather than deleted"* sits about seventy
 * before. The window is roughly three times the observed worst case, which is
 * slack for rewording and not slack for a paragraph about something else.
 */
const MARKER_WINDOW_CHARACTERS = 240;

const MEMBER_PATH = /^[A-Z][A-Za-z0-9]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)+$/u;
const SCREAMING_CONSTANT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}$/u;
const BACKTICKED = /`([^`\n]{2,120})`/gu;
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/gu;

/**
 * The comment text of a source file, with every code character blanked.
 *
 * Offsets and newlines survive, because `stripComments` preserves both, so a
 * line number computed here is the line number in the file.
 */
export function commentTextOf(source: string, stripped: string): string {
  const out: string[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === '\n') {
      out.push('\n');
      continue;
    }
    out.push(stripped[index] === ' ' && character !== ' ' ? character : ' ');
  }
  return out.join('');
}

interface Citation {
  readonly token: string;
  readonly line: number;
  /** The comment prose within `MARKER_WINDOW_CHARACTERS` of the token, for the absence-marker read. */
  readonly context: string;
}

/**
 * The comment prose around one offset, with the `*` gutter and line breaks
 * flattened so a marker split across a wrapped line still reads as English.
 */
function contextAround(commentText: string, index: number, length: number): string {
  const from = Math.max(0, index - MARKER_WINDOW_CHARACTERS);
  const to = Math.min(commentText.length, index + length + MARKER_WINDOW_CHARACTERS);
  return commentText.slice(from, to).replace(/\n\s*\*?/gu, ' ').replace(/\s+/gu, ' ');
}

export function citationsIn(commentText: string): readonly Citation[] {
  const citations: Citation[] = [];
  // Offsets survive `commentTextOf`, so a line number is a real line number.
  let line = 1;
  let scanned = 0;
  BACKTICKED.lastIndex = 0;
  for (const match of commentText.matchAll(BACKTICKED)) {
    const index = match.index;
    for (let cursor = scanned; cursor < index; cursor += 1) if (commentText[cursor] === '\n') line += 1;
    scanned = index;
    const token = match[1]!.trim();
    if (FILE_SUFFIXES.some((suffix) => token.endsWith(suffix))) continue;
    if (!MEMBER_PATH.test(token) && !SCREAMING_CONSTANT.test(token)) continue;
    citations.push({ token, line, context: contextAround(commentText, index, match[0]!.length) });
  }
  return citations;
}

function isExcluded(token: string): boolean {
  const root = token.split('.')[0]!;
  if (EXTERNAL_ROOTS.includes(root)) return true;
  return EXTERNAL_CONSTANT_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function recordsAnAbsence(context: string): boolean {
  const lowered = context.toLowerCase();
  return ABSENCE_MARKERS.some((marker) => lowered.includes(marker));
}

/** The verdict for one file's comments, given a vocabulary. Exported so the positive control can drive it. */
export function unresolvedCitations(commentText: string, vocabulary: ReadonlySet<string>): readonly Citation[] {
  return citationsIn(commentText).filter((citation) => {
    if (isExcluded(citation.token)) return false;
    const root = citation.token.split('.')[0]!;
    if (vocabulary.has(root)) return false;
    return !recordsAnAbsence(citation.context);
  });
}

/** What one pass over a corpus produces: the vocabulary to resolve against, and the prose to resolve. */
export interface CorpusScan {
  readonly vocabulary: ReadonlySet<string>;
  readonly commentCharacters: number;
  readonly commentTextByFile: ReadonlyMap<string, string>;
}

/**
 * One pass over a map of `relative path -> source`.
 *
 * Factored out so the positive control drives **this** function rather than a
 * hand-built `Set`, which is what makes the stripped-vocabulary rule
 * observable. It is the one rule in this file the live corpus cannot exercise:
 * after #543's sweep no comment in `src/` or `tests/` names a symbol that
 * exists nowhere, so building the vocabulary from raw source instead of
 * stripped source changes nothing any assertion over the real tree can see.
 * `documentation-source-anchor-contract.test.ts` hit the same wall and
 * answered it the same way -- *"the in-scope case cannot see a loosened range
 * because it has nothing out of range to see, which is exactly why the control
 * is here."*
 *
 * Only `src/` and `tests/` prose is returned; `scripts/` and `benchmarks/`
 * contribute vocabulary and are not themselves scanned.
 */
export function scanCorpus(sources: ReadonlyMap<string, string>): CorpusScan {
  const vocabulary = new Set<string>();
  const commentTextByFile = new Map<string, string>();
  let commentCharacters = 0;

  for (const [relative, source] of sources) {
    const stripped = stripComments(source);
    // Stripped, so that a symbol existing only in prose cannot vouch for itself.
    for (const match of stripped.matchAll(IDENTIFIER)) vocabulary.add(match[0]);

    if (!relative.startsWith('src') && !relative.startsWith('tests')) continue;
    const comments = commentTextOf(source, stripped);
    commentCharacters += comments.replace(/[ \n]/gu, '').length;
    commentTextByFile.set(relative, comments);
  }

  return { vocabulary, commentCharacters, commentTextByFile };
}

async function collectFiles(directory: string, extensions: readonly string[]): Promise<readonly string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, extensions)));
      continue;
    }
    if (extensions.some((extension) => entry.name.endsWith(extension))) files.push(entryPath);
  }
  return files;
}

describe('a comment that names a symbol names one that exists', () => {
  /*
   * **An explicit timeout, because this test outgrew the global one.**
   * `vitest.config.ts` sets `testTimeout: 5_000`, which is right for the
   * roughly four and a half thousand fast tests it governs and wrong for the
   * handful of contracts that walk the whole tree. Measured on 2026-09-03 with
   * nine agents working (load average 42 on four cores), the four whole-tree
   * walks in `tests/foundation/` ran 5,248 / 7,314 / 7,889 / 19,967 ms -- so
   * `vitest run tests/foundation/` was a lottery on a busy machine, and CI has
   * been green on an idle runner by margin rather than by design. Raising the
   * patience changes no assertion; the walk and every claim it makes are
   * untouched. The global stays tight so a genuinely hung test still fails in
   * five seconds.
   *
   * Two more are the next candidates and are deliberately left alone until
   * they exceed it: `documentation-source-anchor-contract`'s anchor
   * resolution and `documentation-claims-contract`'s treasury-credit census,
   * both observed over 5,000 ms under heavier contention and both comfortably
   * under it in the measurement above.
   */
  it('resolves every member path and screaming constant cited in src/ and tests/', async () => {
    const vocabularyFiles = [
      ...(await collectFiles(path.join(repositoryRoot, 'src'), ['.ts'])),
      ...(await collectFiles(path.join(repositoryRoot, 'tests'), ['.ts'])),
      ...(await collectFiles(path.join(repositoryRoot, 'scripts'), ['.ts', '.mjs', '.js'])),
      ...(await collectFiles(path.join(repositoryRoot, 'benchmarks'), ['.ts'])),
    ];

    // Vacuity guard 1: the walk found the corpus.
    expect(vocabularyFiles.length, 'the source walk is broken; nothing to build a vocabulary from').toBeGreaterThan(600);

    const sources = new Map<string, string>();
    for (const file of vocabularyFiles) {
      if (file === SELF) continue;
      sources.set(path.relative(repositoryRoot, file), await readFile(file, 'utf8'));
    }

    const { vocabulary, commentCharacters, commentTextByFile } = scanCorpus(sources);

    // Vacuity guard 2: the vocabulary is a real one.
    expect(vocabulary.size, 'the identifier scan produced almost nothing; the stripper or the regex is broken').toBeGreaterThan(12_000);
    // Vacuity guard 3: comments were actually extracted, not blanked away with the code.
    expect(commentCharacters, 'almost no comment text was extracted; the comment/code difference is inverted or empty').toBeGreaterThan(3_000_000);

    let citationsChecked = 0;
    const unresolved: string[] = [];
    for (const [relative, comments] of commentTextByFile) {
      citationsChecked += citationsIn(comments).length;
      for (const citation of unresolvedCitations(comments, vocabulary)) {
        unresolved.push(`${relative}:${citation.line} cites \`${citation.token}\`, and \`${citation.token.split('.')[0]!}\` is declared nowhere in the repository`);
      }
    }

    // Vacuity guard 4: the shapes still match this corpus's prose.
    expect(citationsChecked, 'almost no citations matched; the token shapes no longer fit the corpus').toBeGreaterThan(1_500);

    expect(
      unresolved,
      'a comment names a symbol that does not exist. Rename it to the real one, or -- if it is genuinely gone -- say so in the same comment, as this tree already does for `RoomSystem.validateRoom` and `NEVER_LAID_OUT_AT_375`',
    ).toEqual([]);
  }, 60_000);

  /**
   * The second corpus, added for #991: the guides at the top level of `docs/`.
   *
   * The header records what this reads, what it deliberately does not
   * (`docs/adr/` and `docs/research/`, which are dated records rather than
   * present-tense guides) and the measurement behind both. The vocabulary is
   * built exactly as the comment scan builds it, from **stripped code**, so a
   * name that exists only in a guide cannot vouch for itself either.
   */
  it('resolves every member path and screaming constant cited in the docs guides', async () => {
    const vocabularyFiles = [
      ...(await collectFiles(path.join(repositoryRoot, 'src'), ['.ts'])),
      ...(await collectFiles(path.join(repositoryRoot, 'tests'), ['.ts'])),
      ...(await collectFiles(path.join(repositoryRoot, 'scripts'), ['.ts', '.mjs', '.js'])),
      ...(await collectFiles(path.join(repositoryRoot, 'benchmarks'), ['.ts'])),
    ];
    const sources = new Map<string, string>();
    for (const file of vocabularyFiles) {
      if (file === SELF) continue;
      sources.set(path.relative(repositoryRoot, file), await readFile(file, 'utf8'));
    }
    const { vocabulary } = scanCorpus(sources);
    expect(vocabulary.size, 'the identifier scan produced almost nothing; the stripper or the regex is broken').toBeGreaterThan(12_000);

    const guides = (await readdir(path.join(repositoryRoot, 'docs'), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort();

    expect(guides.length, 'the guide walk is broken; docs/ holds no top-level Markdown').toBeGreaterThan(20);

    let proseCharacters = 0;
    let citationsChecked = 0;
    const unresolved: string[] = [];
    for (const name of guides) {
      const prose = await readFile(path.join(repositoryRoot, 'docs', name), 'utf8');
      proseCharacters += prose.replace(/[ \n]/gu, '').length;
      citationsChecked += citationsIn(prose).length;
      for (const citation of unresolvedCitations(prose, vocabulary)) {
        unresolved.push(`docs/${name}:${citation.line} cites \`${citation.token}\`, and \`${citation.token.split('.')[0]!}\` is declared nowhere in the repository`);
      }
    }

    expect(proseCharacters, 'almost no guide prose was read; the guide walk is empty').toBeGreaterThan(1_000_000);
    expect(citationsChecked, 'almost no citations matched; the token shapes no longer fit the guides').toBeGreaterThan(400);

    expect(
      unresolved,
      'a guide names a symbol that does not exist. Rename it to the real one, or -- if it is genuinely gone -- say so in the same paragraph, as this tree already does in code',
    ).toEqual([]);
  }, 60_000);

  /**
   * The control, in both directions, against text whose verdict is known.
   *
   * Without it every assertion above is a "found nothing" claim and a checker
   * that had stopped checking would read exactly like compliance. The
   * `vouchesForItself` case is the one that fails when the vocabulary is built
   * from raw rather than stripped source, which is the single mistake that
   * makes this whole file pass vacuously.
   */
  /**
   * The control for the rule the live tree cannot exercise: a vocabulary is
   * built from **code**, never from prose.
   *
   * Two files. One declares `RealThing` and has a comment naming
   * `GhostThing.member`; the other names `GhostThing` only inside its own
   * prose. If `scanCorpus` built its vocabulary from raw source, the second
   * file's comment would teach the gate that `GhostThing` exists and the first
   * file's citation would resolve -- the exact self-vouching loop that made
   * this sweep's first pass report nothing at all. The mutation to run against
   * this is `stripped.matchAll(IDENTIFIER)` -> `source.matchAll(IDENTIFIER)`
   * inside `scanCorpus`.
   */
  it('never lets a name that exists only in prose vouch for itself', () => {
    const sources = new Map([
      ['src/first.ts', `/** Routed through \`GhostThing.member\`. */\nexport const RealThing = 1;\n`],
      ['src/second.ts', `/** A paragraph about \`GhostThing\` and what it would do. */\nexport const Other = 2;\n`],
    ]);

    const scan = scanCorpus(sources);
    expect(scan.vocabulary.has('RealThing'), 'a declared name must be in the vocabulary').toBe(true);
    expect(scan.vocabulary.has('GhostThing'), 'a name that appears only in prose must not be in the vocabulary').toBe(false);
    expect(scan.commentTextByFile.size, 'both files are under src/ and both have comments').toBe(2);

    const flagged = [...scan.commentTextByFile].flatMap(([file, comments]) =>
      unresolvedCitations(comments, scan.vocabulary).map((citation) => `${file}:${citation.line} ${citation.token}`),
    );
    expect(flagged).toEqual(['src/first.ts:1 GhostThing.member']);
  });

  it('flags an unresolvable citation and leaves a resolvable or self-declared one alone', () => {
    const vocabulary = new Set(['SimulationWorkerStateMachine', 'publishEvents', 'ConfiscationLedger']);

    const flagged = `/**\n * The watermark lives on \`WorkerStateMachine.publishEvents\`.\n */`;
    expect(unresolvedCitations(commentTextOf(flagged, stripComments(flagged)), vocabulary).map((c) => c.token)).toEqual([
      'WorkerStateMachine.publishEvents',
    ]);

    const resolvable = `/**\n * The watermark lives on \`SimulationWorkerStateMachine.publishEvents\`.\n */`;
    expect(unresolvedCitations(commentTextOf(resolvable, stripComments(resolvable)), vocabulary)).toEqual([]);

    const selfDeclared = `/**\n * This used to be \`WorkerStateMachine.publishEvents\`, and it is gone.\n */`;
    expect(unresolvedCitations(commentTextOf(selfDeclared, stripComments(selfDeclared)), vocabulary)).toEqual([]);

    const missingConstant = `/**\n * Withholds \`STATE_INCOME_UNMET_NEED_WITHHOLDING_MINOR_UNITS\` per unmet need.\n */`;
    expect(unresolvedCitations(commentTextOf(missingConstant, stripComments(missingConstant)), vocabulary).map((c) => c.token)).toEqual([
      'STATE_INCOME_UNMET_NEED_WITHHOLDING_MINOR_UNITS',
    ]);

    const external = `/**\n * Let \`TypedArray.fill\` coerce it.\n */`;
    expect(unresolvedCitations(commentTextOf(external, stripComments(external)), vocabulary)).toEqual([]);

    // The `SUPABASE_` exclusion is the Supabase CLI's environment namespace and
    // has to stop there: this repository's own Supabase vocabulary is
    // `VITE_`-prefixed and must stay checked. Both directions, because a prefix
    // exclusion is the entry most likely to quietly cover more than it was for.
    const cliEnvironment = `/**\n * \`SUPABASE_ACCESS_TOKEN\` is a repository secret.\n */`;
    expect(unresolvedCitations(commentTextOf(cliEnvironment, stripComments(cliEnvironment)), vocabulary)).toEqual([]);

    const ourEnvironment = `/**\n * \`VITE_SUPABASE_PUBLISHABLE_KEY\` is the required one.\n */`;
    expect(
      unresolvedCitations(commentTextOf(ourEnvironment, stripComments(ourEnvironment)), vocabulary).map((c) => c.token),
      'the `SUPABASE_` exclusion must not reach this repository\'s own `VITE_`-prefixed names',
    ).toEqual(['VITE_SUPABASE_PUBLISHABLE_KEY']);

    // A name that appears only inside a comment must not vouch for itself: this
    // is the case that fails if the vocabulary is built from raw source.
    const vouchesForItself = `/** \`NoSuchThing.member\` */\nconst unrelated = 1;\n`;
    expect(unresolvedCitations(commentTextOf(vouchesForItself, stripComments(vouchesForItself)), vocabulary).map((c) => c.token)).toEqual([
      'NoSuchThing.member',
    ]);

    // The exemption's *scope*, which the live corpus cannot exercise: after
    // this sweep no `src/` or `tests/` comment carries a missing name with a
    // distant marker, so widening `MARKER_WINDOW_CHARACTERS` changes nothing
    // any assertion over the real tree can see. Measured: with the window at
    // 240,000 the whole file still passed. A docblock here runs to a hundred
    // lines, so a far-away "no longer" is a sentence about something else --
    // which is exactly the bug the first version of this file shipped with,
    // and this pair is what stops it coming back.
    const distantMarker = `/**\n * The watermark lives on \`WorkerStateMachine.publishEvents\`.\n *\n${' * Filler prose that is about something else entirely.\n'.repeat(12)} * There is no such thing any more.\n */`;
    expect(unresolvedCitations(commentTextOf(distantMarker, stripComments(distantMarker)), vocabulary).map((c) => c.token)).toEqual([
      'WorkerStateMachine.publishEvents',
    ]);

    const nearMarker = `/**\n * There is no \`WorkerStateMachine.publishEvents\` any more.\n */`;
    expect(unresolvedCitations(commentTextOf(nearMarker, stripComments(nearMarker)), vocabulary)).toEqual([]);

    // Code is not comment: the same token in a string literal is invisible here.
    const inCode = `const label = 'WorkerStateMachine.publishEvents';\n`;
    expect(unresolvedCitations(commentTextOf(inCode, stripComments(inCode)), vocabulary)).toEqual([]);
  });
});
