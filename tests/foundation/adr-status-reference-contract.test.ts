import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every sentence in this repository that says what status an ADR holds,
 * checked against the status that ADR actually holds.
 *
 * `tests/foundation/adr-numbering-contract.test.ts` already keeps
 * `docs/adr/README.md`'s table honest, and says of itself that "what none of
 * it can check is whether a status is *true about the code*". This is the
 * layer between those two: not whether a status is true about the code, but
 * whether the **rest of the corpus agrees with the ADR about what the status
 * is**. That is strictly mechanical -- it compares a claim to a document and
 * rules on neither.
 *
 * ## The defect this exists for
 *
 * Thirteen ADR statuses moved from `Proposed` to `Accepted` on 2026-08-25
 * (`docs/adr/STATUS-QUEUE.md` §1). Flipping a status does not update the
 * sentences elsewhere that *report* it, so a crop of true sentences went false
 * at once and **nothing failed**, because no test reads English:
 * `src/ui/hud/messages.ts` said "ADR 0017 is still Proposed" for the whole time
 * 0017 had been Accepted; `docs/DEPLOYMENT.md` said ADR 0016 "is **Proposed,
 * not accepted**"; `.github/workflows/migrate-database.yml` carried "(ADR 0016
 * §2, Proposed)" above the constraint that ADR made binding. Each one reads to
 * the next agent as settled fact, and the two that matter most are the ones
 * that invert an obligation: a decision described as awaiting approval is a
 * decision an agent believes it may still argue with.
 *
 * Fixing them by hand guarantees a fourteenth after the next flip. This is the
 * assertion that makes the next flip fail loudly instead.
 *
 * ## What counts as a claim, and why it is not proximity
 *
 * The naive version -- an ADR number within N characters of a status word --
 * was measured on the tree this was written against: 24 windows, of which 10
 * were false positives. It fires on an ADR narrating its own history ("while
 * this ADR was `Proposed` it said in terms..."), on a status word that is a
 * verb ("what B always proposed"), on the *object* of a relation rather than
 * its subject ("Not superseded by ADR 0028"), and on a table cell whose
 * neighbour happens to cite an unrelated ADR.
 *
 * So a claim here is a status word in a **present-tense predicative position**
 * -- `is`/`are`/`remains`/`stays` plus optional hedges, or `at`/`itself`/`still`
 * before the word, or the appositive form `(ADR 0016 §2, Proposed)` -- plus the
 * two phrases that assert `Proposed` without naming it, "pending approval" and
 * "not accepted". Past tense is deliberately not matched: "was Proposed" is how
 * an accepted ADR correctly records what it used to be.
 *
 * ## What it deliberately cannot catch
 *
 * Said plainly, because a gate whose limits are unstated reads as covering more
 * than it does.
 *
 * - **A claim that names no ADR.** `src/simulation/economy/income.ts` said "a
 *   ninth `Proposed` document in `docs/adr/`" -- a false claim about the *count*
 *   of Proposed ADRs, with no ADR number in it. Nothing here resolves a subject
 *   for that. Same for a table cell that carries a status but cites its ADR only
 *   in the sentence introducing the table.
 * - **A `##` heading.** `docs/adr/0012`'s `## Decision (proposed)` survived every
 *   shape tried here; headings are split off as their own units and that one has
 *   no subject in it.
 * - **Anything about whether a status is true of the *code*.** That is
 *   `docs/adr/STATUS-QUEUE.md`'s subject and it is answered by a human reading
 *   evidence.
 */

const REPOSITORY_ROOT = resolve(__dirname, '../..');
const ADR_ROOT = join(REPOSITORY_ROOT, 'docs/adr');

const STATUS_WORD = String.raw`(accepted|proposed|superseded|deprecated)`;

/** Backticks, asterisks and quotes wrap a status word without changing it. */
const WRAP = "[`*\"'“”_]*";

/** Adverbs that sit between the verb and the status: "is *still* Proposed", "is *in* `Proposed` status". */
const HEDGE = String.raw`(?:\s+(?:still|only|currently|now|therefore|deliberately|explicitly|in|at|itself|already|genuinely|simply|formally))*`;

const CLAIM = new RegExp(
  [
    // "is Proposed", "is still `Proposed`", "remains Accepted", "is in `Proposed` status"
    String.raw`\b(?:is|are|remains|remain|stays|stay)\b${HEDGE}\s+${WRAP}${STATUS_WORD}\b`,
    // "stated at Proposed", "itself Proposed", "leaves it still Proposed"
    String.raw`\b(?:at|itself|still|only)\s+${WRAP}${STATUS_WORD}\b`,
    // The appositive citation form: "(ADR 0016 §2, Proposed)".
    String.raw`,\s*${WRAP}${STATUS_WORD}${WRAP}\s*(?=[)\].,;:—-]|$)`,
    // Two phrasings that assert `Proposed` without using the word.
    String.raw`\bpending\s+(?:human\s+)?approval\b`,
    String.raw`\bnot\s+(?:yet\s+)?accepted\b`,
  ].join('|'),
  'giu',
);

/**
 * `ADR 0017`, `ADR-0014`, or a bare `0012`.
 *
 * The bare form is in real use -- ADR 0015 wrote "Accepting 0015 without 0012
 * leaves the taxonomy it argues in still Proposed" -- and the leading zero plus
 * exactly four digits is what makes it safe to read as a citation. The
 * lookarounds keep it off line numbers, byte counts and version fragments.
 */
const REF = /(?:\bADR[\s-]*(\d{4})\b|(?<![\d.,:/#-])(0\d{3})(?![\d.,:/%-]))/giu;

/**
 * Inside an ADR, "this ADR" and "the status above" are citations of that
 * document, and they are where the worst instance of this defect lived: ADR
 * 0012's Consequences said "The status above stays Proposed" directly beneath a
 * status line reading `Accepted`, so the file contradicted itself. Restricted to
 * these two phrases rather than treating every sentence in an ADR as
 * self-referring, which was measured to fire on the historical narration in ADR
 * 0017's own status section.
 */
const SELF_REFERENT = /\bthis ADR\b|\bthe status above\b/iu;

/** Corpus roots. `.github` is included because a workflow comment carried one of these defects. */
const SCANNED: readonly { readonly directory: string; readonly extensions: readonly string[] }[] = [
  { directory: 'src', extensions: ['.ts'] },
  { directory: 'tests', extensions: ['.ts'] },
  { directory: 'docs', extensions: ['.md'] },
  { directory: '.github', extensions: ['.yml', '.yaml'] },
];

const SCANNED_FILES: readonly string[] = ['README.md'];

/**
 * Paths whose status claims are not this gate's business, each for a reason
 * that is a repository rule rather than a convenience.
 *
 * - `docs/research/` records are **dated evidence**. `docs/research/README.md`
 *   states the rule: "when the code moves on, a record here does not become
 *   wrong, it becomes older. Do not update one to match current `main`." Two
 *   sentences in `2026-08-25-economy-rate.md` call ADR 0023 Proposed and are
 *   deliberately left; a gate that failed on them would be a gate demanding the
 *   record be falsified.
 * - `docs/adr/STATUS-QUEUE.md` exists to **quote stale sentences verbatim** so
 *   the owner can see what is stale. Every entry in its §6 is a false claim
 *   reproduced on purpose, and its whole value is that it says so.
 * - **This file**, for the same reason and discovered the same way: the first
 *   run of this gate failed on its own header, which quotes six of the defects
 *   it was written after finding, and on the positive control below, whose
 *   whole job is to hold false claims. A gate that cannot cite an example
 *   cannot document itself. Recorded rather than quietly worked around,
 *   because "the checker exempts itself" is the kind of line that deserves a
 *   reason: this file states no ADR status as a fact about the tree.
 */
const EXEMPT = (path: string): boolean =>
  path.startsWith('docs/research/') ||
  path === 'docs/adr/STATUS-QUEUE.md' ||
  path === 'tests/foundation/adr-status-reference-contract.test.ts';

interface AdrStatus {
  /** The first status keyword in the statement -- the one the document leads with. */
  readonly leading: string;
  /** Any further keywords the statement names, e.g. 0013's `Proposed` for its §§5-6. */
  readonly others: ReadonlySet<string>;
  /** Whether the statement scopes itself with `§`, which is what makes a split status readable. */
  readonly sectioned: boolean;
}

/**
 * An ADR's status as the **first paragraph** under `## Status` (or the
 * `- Status:` bullet in the older documents), rather than the first non-blank
 * line that `adr-numbering-contract.test.ts` reads.
 *
 * The paragraph is what makes a split status checkable. ADR 0013's is
 * "Accepted for §§1-4, which are enforced in SQL. §§5-6 remain Proposed and
 * unimplemented." -- both keywords, and both true of the parts they name. ADR
 * 0022's "superseded in part by the amendment" wraps onto a second line, so a
 * first-*line* read would have missed it and reported a Superseded claim as
 * contradicting an Accepted document. Later paragraphs are excluded on purpose:
 * they are where an ADR narrates what it used to be.
 */
function statusStatement(body: string): string | undefined {
  const bullet = /^-\s+Status:\s*(.+)$/m.exec(body);
  if (bullet?.[1] !== undefined) return bullet[1].trim();

  const lines = body.split('\n');
  const heading = lines.findIndex((line) => /^##\s+Status\s*$/.test(line));
  if (heading === -1) return undefined;

  const paragraph: string[] = [];
  for (const line of lines.slice(heading + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (line.trim() === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line.trim());
  }
  return paragraph.length === 0 ? undefined : paragraph.join(' ');
}

function readAdrStatuses(): ReadonlyMap<string, AdrStatus> {
  const statuses = new Map<string, AdrStatus>();
  for (const filename of readdirSync(ADR_ROOT)) {
    if (!/^\d{4}-.*\.md$/.test(filename)) continue;
    const statement = statusStatement(readFileSync(join(ADR_ROOT, filename), 'utf8'));
    if (statement === undefined) continue;
    const keywords = [...statement.toLowerCase().matchAll(new RegExp(STATUS_WORD, 'giu'))].map((match) => match[1]!);
    const leading = keywords[0];
    if (leading === undefined) continue;
    statuses.set(filename.slice(0, 4), {
      leading,
      others: new Set(keywords.slice(1)),
      sectioned: statement.includes('§'),
    });
  }
  return statuses;
}

function listFiles(directory: string, extensions: readonly string[], found: string[] = []): string[] {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, extensions, found);
      continue;
    }
    if (extensions.some((extension) => entry.endsWith(extension))) found.push(full);
  }
  return found;
}

/**
 * An ADR's `Amendment` sections, blanked.
 *
 * They record the state the amendment was written in, before the approval it
 * describes, and say so: ADR 0022's *Status of this amendment* opens
 * `**Proposed.**` under a document whose status is `Accepted`, deliberately.
 * That is history, not a stale claim, and the same rule as `docs/research/` one
 * heading down.
 */
function withoutAmendmentSections(body: string): string {
  let skipping = false;
  return body
    .split('\n')
    .map((line) => {
      const heading = /^#{2,6}\s+(.*)$/u.exec(line);
      if (heading?.[1] !== undefined) skipping = /amendment/iu.test(heading[1]);
      return skipping ? '' : line;
    })
    .join('\n');
}

/** A leading `//`, `/*`, `*` or `#`, so a claim inside a comment reads as prose. */
const COMMENT_MARKER = /^[ \t]*(?:\/\/+|\/\*+|\*+\/?|#+)[ \t]?/u;

/** A line that starts a new unit: heading, list item, table row, quote, fence. */
const HARD_BREAK = /^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|\||>|```)/u;

/**
 * The file as sentences.
 *
 * Two things have to happen and they pull against each other. A claim wraps
 * across source lines -- `src/simulation/rooms/zoning.ts` had "which is still"
 * on one line and "`Proposed`" on the next -- so lines must be joined, or the
 * scan cannot see the defect it exists for. But joining everything makes the
 * whole file one sentence, and then any ADR cited anywhere becomes the subject
 * of any status word anywhere, which is the proximity failure above with an
 * infinite window. So: join within a block, break hard at blank lines,
 * headings, list items and table cells, then split on sentence punctuation.
 */
function sentencesOf(body: string): readonly string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 0) blocks.push(current.join(' '));
    current = [];
  };

  for (const raw of body.replace(/\r/gu, '').split('\n')) {
    const line = raw.replace(COMMENT_MARKER, '');
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (HARD_BREAK.test(line)) {
      flush();
      for (const cell of line.split('|')) if (cell.trim() !== '') blocks.push(cell.trim());
      continue;
    }
    current.push(line.trim());
  }
  flush();

  return blocks
    .flatMap((block) => block.split(/(?<=[.!?])\s+(?=[A-Z*`[(“])/u))
    .map((sentence) => sentence.replace(/\s+/gu, ' ').trim())
    .filter((sentence) => sentence !== '');
}

/** "pending approval" and "not accepted" assert `Proposed` without naming it. */
function claimedStatus(claim: string): string | undefined {
  const lower = claim.toLowerCase();
  if (/pending\s+(?:human\s+)?approval/u.test(lower) || /not\s+(?:yet\s+)?accepted/u.test(lower)) return 'proposed';
  return new RegExp(STATUS_WORD, 'iu').exec(lower)?.[1];
}

interface ClaimReport {
  readonly checked: number;
  readonly contradictions: readonly string[];
}

/**
 * Every status claim in `body`, checked against `statuses`.
 *
 * A claim is consistent when the word it uses is the one the ADR's status
 * statement leads with. A **split** status -- one whose statement names a second
 * keyword and scopes itself with `§`, which today is only ADR 0013's "Accepted
 * for §§1-4 ... §§5-6 remain Proposed" -- also admits the second keyword, but
 * only from a sentence that itself names a section. That asymmetry is the point:
 * an unqualified "ADR 0013 is `Proposed`" is false about the ADR as a whole even
 * though `Proposed` appears in its status, and both `docs/CLOUD_SAVE.md` and
 * `docs/TRUSTED_SERVICES.md` carried exactly that sentence.
 *
 * `ownNumber` is set when the body is itself an ADR, which is what lets "this
 * ADR" and "the status above" resolve to a subject.
 */
function checkClaims(
  body: string,
  statuses: ReadonlyMap<string, AdrStatus>,
  label: string,
  ownNumber?: string,
): ClaimReport {
  let checked = 0;
  const contradictions: string[] = [];

  for (const sentence of sentencesOf(ownNumber === undefined ? body : withoutAmendmentSections(body))) {
    const named = [...new Set([...sentence.matchAll(REF)].map((match) => match[1] ?? match[2]))].filter(
      (number): number is string => number !== undefined && statuses.has(number),
    );
    const subjects =
      named.length > 0 ? named : ownNumber !== undefined && SELF_REFERENT.test(sentence) ? [ownNumber] : [];
    if (subjects.length === 0) continue;

    const sectionQualified = sentence.includes('§');

    for (const match of sentence.matchAll(CLAIM)) {
      const claimed = claimedStatus(match[0]);
      if (claimed === undefined) continue;
      checked += 1;

      // Every ADR the sentence cites must contradict the claim before it is
      // reported. A sentence naming two ADRs, one of which holds the claimed
      // status, is read as a claim about that one.
      const contradicting = subjects.filter((number) => {
        const status = statuses.get(number);
        if (status === undefined) return false;
        if (claimed === status.leading) return false;
        return !(status.others.has(claimed) && status.sectioned && sectionQualified);
      });

      if (contradicting.length === subjects.length) {
        const held = subjects
          .map((number) => {
            const leading = statuses.get(number)?.leading;
            return `ADR ${number} is ${leading === undefined ? '(unknown)' : `${leading[0]!.toUpperCase()}${leading.slice(1)}`}`;
          })
          .join(', ');
        contradictions.push(`${label}: "${match[0].trim()}" -- but ${held}\n    ${sentence}`);
      }
    }
  }

  return { checked, contradictions };
}

function scanCorpus(): { readonly files: number; readonly report: ClaimReport } {
  const statuses = readAdrStatuses();
  const paths = [
    ...SCANNED.flatMap(({ directory, extensions }) => listFiles(join(REPOSITORY_ROOT, directory), extensions)),
    ...SCANNED_FILES.map((name) => join(REPOSITORY_ROOT, name)),
  ];

  let checked = 0;
  let files = 0;
  const contradictions: string[] = [];

  for (const path of paths) {
    const label = relative(REPOSITORY_ROOT, path);
    if (EXEMPT(label)) continue;
    files += 1;
    const report = checkClaims(
      readFileSync(path, 'utf8'),
      statuses,
      label,
      /^docs\/adr\/(\d{4})-/.exec(label)?.[1],
    );
    checked += report.checked;
    contradictions.push(...report.contradictions);
  }

  return { files, report: { checked, contradictions } };
}

describe('ADR status references', () => {
  it('parses a status for every ADR on disk', () => {
    // Guards everything below: an unparseable status is skipped rather than
    // failed, so a parser that silently stopped working would make the whole
    // gate green while checking nothing.
    const statuses = readAdrStatuses();
    const onDisk = readdirSync(ADR_ROOT).filter((entry) => /^\d{4}-.*\.md$/.test(entry));

    expect(onDisk.length, 'no ADRs found in docs/adr/; the walk is broken').toBeGreaterThan(20);
    expect(
      onDisk.filter((entry) => !statuses.has(entry.slice(0, 4))),
      'an ADR on disk has no parseable status statement, so claims about it are not checked',
    ).toEqual([]);
  });

  it('reads enough of the corpus, and enough claims in it, to be non-vacuous', () => {
    /*
     * The assertion this file exists for is `toEqual([])`, and a scan that
     * found nothing reads exactly like compliance. Three floors, because they
     * fail for three different reasons:
     *
     * - `files` catches a broken walk or a corpus root that moved.
     * - `checked` catches the case the file count cannot: a walk that reads
     *   every file and a claim regex that matches none of them. On the tree
     *   this landed with, 33 claims are checked. The floor is set well below
     *   that so ordinary editing does not trip it, and well above zero.
     * - the positive control below proves the machinery still bites.
     */
    const { files, report } = scanCorpus();

    expect(files, 'the corpus walk found almost nothing; a scanned root has moved').toBeGreaterThan(300);
    expect(
      report.checked,
      'no ADR status claims matched anywhere in the corpus. Either every such sentence has been deleted -- unlikely -- or the claim patterns have stopped matching prose, which makes the assertion below vacuous',
    ).toBeGreaterThan(15);
  });

  it('reports a false status claim, and leaves the true forms alone', () => {
    /*
     * The positive control. `toEqual([])` on real files proves nothing about
     * whether the checker can fail, so the checker is run against text whose
     * verdict is known -- including the four shapes that must **not** fail,
     * each of which was a false positive in an earlier version of this scan.
     */
    const statuses = readAdrStatuses();
    const check = (text: string, own?: string): readonly string[] =>
      checkClaims(text, statuses, 'control', own).contradictions;

    // ADR 0017 is Accepted. Every one of these is the shape of a real defect
    // this gate was written after finding.
    expect(check('ADR 0017 is still Proposed.')).toHaveLength(1);
    expect(check('the answers ADR 0017 gives are recommendations pending approval')).toHaveLength(1);
    expect(check('never repoint the integration (ADR 0016 §2, Proposed) at production')).toHaveLength(1);
    expect(check('it is stated at Proposed in ADR 0026 rather than settled here')).toHaveLength(1);
    expect(check('The status above stays Proposed.', '0012')).toHaveLength(1);
    // Wrapped across lines inside a block comment, which is how these are written.
    expect(check(' * decide ADR 0012, which is still\n * `Proposed`. That ADR asks')).toHaveLength(1);

    // And the shapes that are true, or are not claims at all.
    expect(check('ADR 0017 is Accepted in full.')).toEqual([]);
    expect(check('While ADR 0017 was `Proposed` it said nothing licenses an economy.')).toEqual([]);
    expect(check('ADR 0023 is not superseded by ADR 0028, deliberately.')).toEqual([]);
    expect(check('ADR 0013 §§5-6 remain Proposed and unimplemented.')).toEqual([]);
    expect(check('A fifth tab was free for the Build panel and is what ADR 0022 always proposed.')).toEqual([]);
    // The split status, unqualified: false about the ADR as a whole.
    expect(check('the ADR 0013 answer is `Proposed`, not `Accepted`')).toHaveLength(1);
  });

  it('never states a status an ADR does not hold', () => {
    const { report } = scanCorpus();

    expect(
      report.contradictions,
      'a sentence in this repository reports an ADR status the ADR does not hold. The ADR is right and the sentence is what changes -- unless the ADR is the one that drifted, in which case say so in the same commit. Dated records under docs/research/ and the quoted inventory in docs/adr/STATUS-QUEUE.md are exempt on purpose; if a claim there is what failed, the exemption is what needs fixing',
    ).toEqual([]);
  });
});
