# What the owner still has to decide, and where an accepted decision contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file. What changed with this revision is what the file is *for*:
§1 records **all thirteen** flips, §2 holds **eight entries — the two dated rulings
#382 wrote into ADR 0008 §2, the 2026-08-27 amendment scoping that ADR's §3
by authority, the preconditions on the change that gives this project its
first server-side entry point, ADR 0056's price for keeping a player's
orders in the order they gave them (2026-08-28, and the first row filed by the
change that wrote it since the rule was restated), ADR 0059's price for
making an actor walk (2026-08-28, #485, the second such row), ADR 0074's
price for reading a restored room's rectangle off the zoning plane it already
carries (2026-08-29, #571, the third), ADR 0071's open-area amendment
(2026-08-29, #585, the fourth — and the second consecutive row filed by a
commit whose only job was the filing), and ADR 0077's price for asking whether
the edge in front of an actor is still standing (2026-08-29, #581, filed by
#615 — the fifth, the third consecutive row filed by a commit whose only job
was the filing, and **the first filed as a debt rather than on time**: #581
landed the ADR with no row at all, which is what #615 was opened to
record)** — **this clause read "seven entries" until #615's entry was filed,
"six entries" until #585's, "five entries"
until #571's, and "four entries" until `07add3e`**, and the sentence saying four is corrected
rather than overwritten because the split is the finding: #485 filed ADR 0059's
entry, moved §2's own heading with it and moved neither this paragraph nor §5's
preamble, which is the third consecutive time the four places below have split
on exactly the line the paragraph naming them predicts — above the account of why the queue had been
emptied three times and what that bought (ADR 0029 was accepted on 2026-08-26
and its entry deleted; 0031 arrived immediately after and was itself accepted)
— and everything after it is the residue — the open decisions, one
watch item, and the gaps between an accepted decision and the code. **That
clause read "one genuinely open decision" until 2026-08-28**, when nine
`Proposed` ADRs landed in eleven releases; §3 still holds the one that is
partly enforced in SQL, and §5's first bullet holds them. **Nine is thirteen at
`c00b641`**, and the sentence saying nine is left above rather than overwritten
because the number is the finding: 0053, 0054, 0056 and 0057 arrived in the
eleven releases since, and **one of the thirteen — 0056 — now has a §2 row**,
which is the first time a document counted in that bullet has been filed rather
than only tallied. **Thirteen is seventeen at `07add3e`**, nine releases later
again: 0059, 0061, 0062 and 0063 arrived, and **two of the seventeen — 0056 and
0059 — have §2 rows**, so the ratio moved with the count and in the same
direction. **Seventeen is twenty-one at `01974e5`**, eleven releases later
again: 0064, 0065, 0066 and 0067 arrived — the needs-grant, save-quarantine,
navigation-tick-budget and assault-sanction ADRs, all four `Proposed, not
self-approved`, none of the four with a §2 row — so the ratio moved to **two
of twenty-one** and, for the first time since it began being tracked, the
count moved without the ratio moving with it: four more outstanding decisions
arrived and the fraction with a row got strictly smaller rather than holding
steady. Counted on disk at the previous anchor by reading the first non-blank
line under each `## Status` heading, which is what
`adr-status-reference-contract.test.ts` reads; the index agreed, twenty-one rows
opening `Proposed`. **Twenty-one is twenty-two at this anchor**, seven
releases later: 0068 (the client-side room-enclosure classification ADR, #498)
arrived, `Proposed, not self-approved` like the four before it, with no §2 row
— so the ratio moves to **two of twenty-two**, the fifth consecutive outstanding
ADR in a row to skip §2 and the sixth overall since the rule was restated
(0064, 0065, 0066, 0067 and now 0068), against two that did (0056, 0059). The
count moved without the ratio moving, for the second time running: this file's
own prediction, at the previous anchor, that the abandonment was "continuing at
a higher rate than ever" held rather than reversing. Re-counted on disk at this
anchor the same way, and the index agrees again: twenty-two rows opening
`Proposed`. A count that has been zero, nine, thirteen, seventeen, twenty-one
and twenty-two across forty-nine releases is the argument against writing it
here at all, and it is written only because each restatement is dated and
derived. **Twenty-two is twenty-two at this anchor**, seven releases later
again — the first reading in this sequence at which the number does not
move at all, because no commit in the window added an ADR: the six merged
pull requests (#511, #512, #513, #515, #518, #519) are re-measurements,
corrections and refusals-added-to-existing-systems, and not one drafts a new
decision. So the ratio holds too, at **two of twenty-two** (0056 and 0059,
unchanged since `07add3e`), and the abandonment streak neither grows nor
breaks — it simply has nothing new to be measured against this time.
Re-counted on disk the same way (the first non-blank line under each
document's own status statement, `## Status` heading or `- Status:` bullet
alike — 0064 and 0067 use the bullet form and a scan that only reads headings
undercounts by two, caught before it was reported), and the index agrees:
still twenty-two rows opening `Proposed`, **Next free number: 0069**,
unmoved. **Twenty-two is twenty-three at this anchor**, ten
releases later: 0069 (the sentence-length-at-admission ADR, #541) arrived,
`Proposed, 2026-08-29. Not self-approved.` like the six before it, with no §2
row — so the ratio moves to **two of twenty-three**, and 0069 is the **sixth**
consecutive outstanding ADR to skip §2 (0064, 0065, 0066, 0067, 0068, now
0069) and the seventh overall since the rule was restated, against two that
did (0056, 0059). **The previous anchor could not measure this and said so**:
its window added no ADR at all, so the rule "add an entry when an ADR arrives"
had nothing to obey or abandon, and it recorded that the streak would resume
the moment the next `Proposed` ADR landed with no row and that nothing
predicted which way it would go. It has resumed, in the direction the earlier
prediction gave rather than the direction the quiet window might have
suggested. Counted on disk at `85c1c29` the same way as every reading in this
sequence — the first non-blank line under each document's *own* status
statement, `## Status` heading or `- Status:` bullet alike — which is the
scan that matters here and not a raw `grep -c Proposed`: 0064 and 0067 still
use the bullet form and a heading-only scan still undercounts by two, and a
scan that matched every `Status` heading at any level would **over**count by
picking up nested `### Status of this amendment` blocks inside accepted ADRs.
Twenty-one documents state `Proposed` under a `## Status` heading and two
(0064, 0067) under a `- Status:` bullet. The index agrees: **twenty-three**
rows opening `Proposed`, and **Next free number: 0070** — moved, where the
previous anchor recorded it unmoved. **Twenty-three is twenty-six at this
anchor**, six releases later — and the reading above is the first in this
sequence that was taken **on the wrong tree**. It says so in its own words,
*"Counted on disk at `85c1c29`"*, while the sentence around it says *"at this
anchor"* and that anchor was `82ae630`. Both numbers are right about `85c1c29`
and neither is right about the tree they warrant: measured at `82ae630` by the
same method the answer is **twenty-five** on disk and twenty-five rows in the
index, and **Next free number** was **0074** rather than the 0070 recorded. The
two that fell in the gap are ADRs that pass's own merge list contains — 0071
arrived at `fcd2a72`, the merge that account names as #554, and 0073 at
`4a224f9`, *"Land ADR 0073: who orders a contraband search"*, a merge it does
not name at all. The correction is left beside the claim rather than replacing
it, because the failure is not arithmetic and re-adding would not have caught
it: a count is warranted by the tree it was taken on, and naming that tree —
which this sequence has always done — is the whole of what makes the mismatch
findable. At `e1813b7` the count is **twenty-six**: 0070 (the staff-dismissal
ADR, #533) arrived, `Proposed` with no §2 row like the eight before it. So the
ratio moves to **two of twenty-six**, 0070 is the **ninth** consecutive
outstanding ADR to skip §2 (0064, 0065, 0066, 0067, 0068, 0069, 0071, 0073, now
0070 — the last three all landing after the sixth was counted) and the tenth
overall since the rule was restated, against two that did (0056, 0059).
Counted on disk at `e1813b7` this time, by the same method; the index agrees,
twenty-six rows opening `Proposed`, and **Next free number: 0074** is unmoved,
because 0070 is below the ceiling 0073 had already set. **Twenty-six is
twenty-seven at `cfab558`**, seven releases later: 0074 (what a restored room
that recorded no rectangle is, #571) arrived, `Proposed, 2026-08-29. Not
self-approved.` — and **it is the first arrival since 0059 to get a §2 row**,
filed by #574 three merges later. So the ratio moves to **three of
twenty-seven**, and the nine-long streak of consecutive outstanding ADRs
skipping §2 — 0064 through 0071, 0073 and 0070 — **is broken**. Counted on
disk at `cfab558` by the same method as every reading in this sequence, the
first non-blank line under each document's own status statement, `## Status`
heading or `- Status:` bullet alike (0064 and 0067 still use the bullet form);
the index agrees, **twenty-seven** rows opening `Proposed` out of 68 rows, and
**Next free number** has moved **0074 → 0075**, because 0074 was the new
maximum on disk.

**Twenty-seven is thirty at `53e1405`**, seven releases later: 0075 (what a
prison that cannot afford its first bed is owed) and 0076 (what happens to a
resident whose bed is taken away) arrived together at `092991e`/#580, and 0077
(when a route stops being valid) at `827201e`/#581, all three `Proposed,
2026-08-29. Not self-approved.` **None of the three has a §2 row**, so the
ratio moves to **three of thirty** — the count moving without the ratio
moving, for the third time in this sequence and the first time it has done so
by three in one window. **Three arrivals in one window is the most this
sequence has recorded**, and the previous largest, five at `cfab558`, was
spread across thirty-one releases rather than seven. Counted on disk at
`53e1405` by the same method as every reading in this sequence — the first
non-blank line under each document's own status statement, `## Status`
heading or `- Status:` bullet alike; 0064 and 0067 are still the only two in
bullet form, so a heading-only scan still undercounts by two — twenty-eight
under a heading and two under a bullet. The index agrees: **thirty** rows
opening `Proposed` out of **71**, and **Next free number** has moved
**0075 → 0078**, in two steps rather than one, because #580 landed two
numbers at once and #581 landed the third. **Two of the three are already
ruled on** — the owner accepted 0075 and 0076 on 2026-08-29, and PR #606 is
open to move both statuses — which is why the ratio above is the weakest
figure in this paragraph rather than the strongest: it counts rows in this
file, and two of the three documents it counts against are one merge from
needing none. The window note below decides each of the three separately and
says why.

**Thirty is twenty-nine at `0637ab1` and thirty again at `898a16a`, and this
paragraph recorded neither until now.** Its count sequence was last extended
by the `53e1405` re-anchor — `186c13f`/#613, found with `git log -S` rather
than assumed — and then stood still across three anchors, `0637ab1`,
`104d078` and `eb1f040`, while the number underneath it fell to twenty-nine
(0075 and 0076 accepted at `f0b98aa`/#606, 0078 arriving at `19482be`/#612)
and rose to thirty again (0079 arriving at `9a25700`/#659). **So this
paragraph was false for three anchors and is true again by accident**, which
is the worst way for a count to be right and the reason it is written out
rather than quietly extended. **No diff could have raised it**, because no
line of it changed; the check that does is the one this header prescribes and
the `4ace2da` pass had to invent — reading the file's own paragraphs against
each other.

**And it inverts the sentence immediately below, which is the more useful
half.** That sentence says this header's paragraph is *"the only one of the
four that anyone had been moving"*, with §3's opening, §5's first bullet and
§6's `income.ts` bullet lagging four anchors behind it. Since `0637ab1` the
opposite has held: those three have carried the live value at every anchor —
moved to twenty-nine there, checked and found still correct at `104d078` and
`eb1f040` — and this paragraph is the one that stopped. Both directions are
left standing, because **which of the four places lags is not stable**, and a
next editor who reads only the sentence below will sweep the three sections
and skip the paragraph that was actually wrong.

**And the header has been the only place carrying this number for three
anchors, which no diff could have said.** §3's opening, §5's first bullet and
§6's `income.ts` bullet are the other three places that state it, and all
three still read **twenty-two** — the value that was correct at `4ace2da`
(v0.0.177) and went false when 0069 landed at #541, inside the
`4ace2da..85c1c29` window. The `85c1c29` pass moved the header to
twenty-three and wrote, in the derivation subsection below, that *"§3's
opening, §5's first bullet and §6's `income.ts` bullet now enumerate
**twenty-three** `Proposed` documents"*; **they enumerated twenty-two when
that sentence was written**, and the same sentence was repeated in
substance at the two anchors after it. That is the class this header calls a
claim already false when its window opened, in this file's own maintenance
prose rather than in an entry, and it is the second count in this sequence
found to have been taken on one tree and written about another. All three are
corrected in place at this anchor, to **twenty-seven**, with the sentences
saying twenty-two left standing beside them; the sentence in the derivation
subsection is corrected where it sits.

**The three ADRs with a known expiry were re-read at this anchor rather than
carried.** 0051, 0052 and 0054 still read `Proposed` on disk at `cfab558`, so
the handover recorded below stands unchanged and all three are still inside
the twenty-seven.

**Three of those twenty-three have a known expiry and are handed over rather
than acted on here.** The owner decided on 2026-08-29 (issue #535, decision 8)
to accept ADRs **0051**, **0052** and **0054**, whose code is merged and live;
that acceptance is deliberately sequenced *after* this re-anchor so that no
tally moves underneath it. All three still read `Proposed` on disk at
`85c1c29`, which is what the twenty-three counts. **This file asserts one of
those statuses twice, in §5**, in the sentences beginning *"ADR 0054 remains
`Proposed, not self-approved` while its code is merged and live"*. Both go
false the moment the acceptance lands, and
`tests/foundation/adr-status-reference-contract.test.ts` is the gate for
exactly that class. They are **left exactly as found** by this pass — flipping
a status is not a re-anchor's job, and the acceptance commit should own the
correction in both directions — and named here so the handover is written
down rather than rediscovered. A fourth live assertion of the same shape sits
outside this file, in `docs/adr/0056-…md`: *"it does not edit ADR 0051,
because ADR 0051 is itself Proposed"*. Same expiry, same owner, recorded for
the same reason.

**This sentence and the title above it were both false, and this is the second
time this file's title has rotted the same way.** They read *"One decision is
awaiting approval"* and *"§2 holds the one decision awaiting approval — ADR
0031"*, while §2's own heading three hundred lines below said **"The queue is
empty"** and its subsection said 0031 was accepted. ADR 0031 was accepted at
`e560656` (#389, **v0.0.104**), which is **seventeen releases** before this
anchor — and, more to the point, `git merge-base --is-ancestor e560656 8d29aa6`
confirms it predates the *previous* anchor too, so the last re-anchor did not
catch it either.

**Why neither delta pass caught it, which is the useful part.** The delta method
this header describes reads the intersection of `git diff <anchor>..HEAD` with
the enumerated file set below. `docs/adr/0031-build-queue-cancellation-surface.md`
is in that set — but it has not changed since either anchor, because the flip
that falsified this sentence happened *before* both of them. **A delta pass can
only find claims that a file in the set falsified during that delta.** It is
structurally blind to a claim that was already false when the window opened, and
to a file contradicting itself, which is what this was: the title and §2 of the
same document disagreed, and no diff anywhere would have said so. The cheap check
that does find it is not a diff at all — it is reading the file's own headings
against each other, which takes a minute and had not been done. The title is now
worded so that it states the file's subject rather than a count, because a count
in a title is the same rotting shape as an absence in a sentence and this one
rotted twice. §6 used to be the inventory of stale sentences the flips left behind;
**they are corrected, and that class is now asserted by a test**, so what it
holds instead is the account of what moved, what may not be touched, and what
the test cannot see. Deciding is still the owner's; this file only makes the
next decision cheap.

**Four places in this file count the queue, and the next editor has to sweep all
four.** They are: this paragraph, the title above it, §2's own heading, and §5's
preamble. They have disagreed before — *"One decision is awaiting approval"*,
*"§2 holds **the one decision awaiting approval — ADR 0031**"*, *"## 2. The
queue is empty"* and *"**The queue is not empty** — §2 holds **two** entries"*,
all four in the same document, recorded as **ARC-07, CONFIRMED** in
`docs/research/audit-2026-08-26/04-architecture.md`. The drift is structural
rather than careless: §2's count is edited when a decision is accepted, and the
other three are edited when somebody remembers them. **Nothing mechanical can
compare an English count in one paragraph to an English count in another**, so
naming the four places here is the whole of the defence.

**And four is not all of them. There is a second family of three, found at
`cfab558`, and it had drifted for four anchors while the four were being
swept every time.** The queue count lives in four places; the count of
`Proposed` ADRs lives in **three** more — §3's opening, §5's first bullet and
§6's `income.ts` bullet — plus this header's own paragraph above, which is the
only one of the four that anyone had been moving. All three sections read
*twenty-two* from `4ace2da` until this commit while the header went
twenty-three and then twenty-six; the value went false when 0069 landed at
#541. **What makes it worse than an ordinary lag is that the file asserted
the sweep had happened**: the derivation subsection below carried, from
`85c1c29` onward, *"§3's opening, §5's first bullet and §6's `income.ts`
bullet now enumerate **twenty-three** `Proposed` documents"*, which was false
on the tree that wrote it and was repeated in substance twice after. So the
defence this paragraph describes — naming the places — works only if
somebody opens them, and a sentence claiming they were opened is
indistinguishable, to every gate in this repository, from having opened them.
**Seven places count something in this file**, and the next editor sweeping
four of them is doing four sevenths of the job.

**The sweep was run again at `07add3e` and it caught the same drift a second
time, in the same two places, nine releases after the first.** The four read:
this paragraph, *"§2 holds **four entries**"*; the title, which states a subject
and no count; §2's heading, *"## 2. Five entries: …"*; and §5's preamble,
*"**FOUR at `c00b641`**"*. #485 filed §2's fifth entry — ADR 0059's — moved §2's
heading and moved neither of the other two, which is precisely what #467 had
done nine releases earlier with the fourth. **So the prediction has now been
confirmed twice by the same mechanism**, and the useful part is that the
*direction* is stable: §2's heading is the one place that is never wrong,
because it is edited by the commit that files the entry, and the two prose
counts are the ones that lag. A next editor who has time for one check should
read §2's heading and then grep for the other two counts. Both are corrected in
place, with the sentences they replaced left standing beside them.

**The sweep was run at `c00b641` and it caught one, which is the first time
naming the four places has paid.** The four read: this paragraph, *"§2 holds
**four entries**"*; the title, which states a subject and no count and is
therefore the only one that cannot rot this way; §2's heading, *"## 2. Four
entries: …"*; and §5's preamble, *"§2 holds three entries"*. **The fourth was
eleven releases behind the other two.** #467 added §2's fourth entry — ADR
0056's — and moved this paragraph and §2's heading and not §5's, which is the
exact split the paragraph above predicts: §2's count is edited when a decision
is filed, and the others when somebody remembers. §5's preamble is corrected in
place, with the sentence it replaced left standing beside it. **The sweep is
also the only check that could have found it**: this file is not in its own
dependency set, every file ADR 0056's entry cites *is* in it, and the delta
intersection for this anchor would have handed a reader eleven files and not
this one.

Re-anchored at `main` @ `898a16a` (**v0.0.252**) by the delta method this
header describes, from the v0.0.242 anchor described below. **Ten of the ten
releases the budget allows, counted on the tree this commit is written
against**: `package.json` ships `0.0.252` and the anchor being replaced named
v0.0.242. That is the whole budget spent with none of it left, so the next
merge of anything at all takes it to eleven and turns `main` red.

**That figure is a fact about this commit and it is not a claim about the
merge, and this is the second anchor running to scope it that way because the
first one was proved right within minutes.** The `104d078` pass was dispatched
at nine of ten and merged at eleven, reddening every open pull request
including the one fixing the flake that was reddening its own; the `eb1f040`
pass therefore scoped its figure to its commit, and then measured
`origin/main` reaching v0.0.243 before its branch even had a pull request. So:
**ten as of the commit that writes this paragraph**, and no headroom figure at
all is claimed for the tree this lands on. **The count at merge may differ,
and this pass cannot read which way**: seven non-draft pull requests are open
at the time of writing — #640, #647, #650, #653, #655, #658 and #668 — every
merge of one costs a release, and with the budget exactly spent any one of
them landing first puts `main` at eleven before this branch can clear it. That
is the same finding from a third side: not dispatched with no headroom, and
not dispatched with headroom and merged without it, but **dispatched with the
last release of it already gone**.

`898a16a` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.252 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#671, `9950171`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `898a16a`.** `git diff --name-only eb1f040..898a16a` is
**45 files**, of which **ten are members** of the set as it stood before this
commit: `docs/adr/README.md`, `docs/research/README.md`, `package.json`,
`src/main.ts`, `src/simulation/protocol/types.ts`, `src/ui/hud/hud.ts`, and
ADRs **0023**, **0069**, **0076** and **0078**. ADR **0079** is an eleventh
and it joins the set in this commit, by the citation this commit creates
rather than by having been missed — the order the previous anchor found broken
twice. `docs/adr/STATUS-QUEUE.md` is a twelfth changed file that §§3-6 name
and is deliberately outside its own set. **Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed**, so those three glob members contributed none.

**The window is ten releases carrying ten merged pull requests** — #646, #665,
#656, #654, #660, #659, #666, #670, #669 and #671 — read off `git log
--oneline --first-parent eb1f040..898a16a` (excluding the ten release-bump
commits). **One of the ten edits this file and it is not new drift**:
`007582c`/#665 is the previous anchor's own writing commit, kept below as that
anchor's account. **What it changed inside §§3-6 is two shas and nothing
else** — `diff` over §§3-6 between the two trees returns exactly the two
`verified at` values and no other line, measured rather than assumed. **No
commit in this window filed a §2 entry**, so all four places that count §2
stay at eight: this header's paragraph, the title (which states a subject and
no count), §2's own heading *"## 2. Eight entries"*, and §5's preamble's
*"EIGHT at #615"*. That is the third consecutive window in which the split
those four places keep coming apart on has not been exercised at all, so this
sweep, like the two before it, confirms nothing about it.

**Twenty-nine is THIRTY at this anchor, and what closed the question is the
one the previous anchor left open.** That pass recorded ADR **0079** as
existing on `agent/593-longer-sentences` and deliberately uncounted, because a
branch nobody has merged is invisible from disk, and wrote that *"If #659
merges before this does, the count is thirty and four places need it"*, adding
that which way it went was not something that pass could record. **#659 merged**,
at `9a25700` (v0.0.248). So the count is thirty and the four places needed it.
0079 — a sentence long enough to be a history — reads `**Proposed,
2026-08-30. Not self-approved.**` on disk and has **no §2 row**, which makes
it the second consecutive arrival with none, after 0078. The ratio therefore
moves to **four of thirty** (0056, 0059, 0074 and 0077), and the decisions
outstanding with no §2 entry go from twenty-five to **twenty-six**.

Counted on disk at `898a16a` by the same method as every reading in this
sequence, the first non-blank line under each document's *own* status
statement, `## Status` heading or `- Status:` bullet alike — **twenty-eight**
under a heading and **two** under a bullet (0064 and 0067, still the only two,
so a heading-only scan still undercounts by two). `docs/adr/README.md` agrees,
counted independently: **thirty** rows opening `Proposed`, and **Next free
number** has moved **0079 → 0080**. **The denominator is stated more carefully
than the previous three anchors stated it**, because two different numbers are
both defensible: there are **73** ADR documents on disk and **74** numbered
rows in the index, the extra being 0018's *"Free — released when PR #91 was
closed as superseded"* row, which names no document. Earlier readings in this
sequence wrote *"out of 72"* and *"out of 71"* meaning documents; that is the
figure carried forward here, and the row count is written beside it so a
reader re-deriving either does not take the disagreement for a defect.

**All three of the other places that state the `Proposed` count were opened
and the value found in each is written down, because a sentence claiming they
were opened is indistinguishable, to every gate in this repository, from
having opened them.** §3's opening read *"twenty-nine"*, §5's first bullet
read *"TWENTY-NINE at `0637ab1`"* and §6's `income.ts` bullet read *"it is
twenty-nine"*; all three are moved to thirty in this commit, each beside the
sentence it supersedes. **This is the first window in three that exercised the
mechanism at all** — the two before it added no ADR, and this header said in
terms that two consecutive unexercised windows say nothing about the split.

**And opening them turned up a fourth place that had stopped, which is the
largest thing this pass found and which no delta could have raised.** This
header's own opening paragraph — the one the file names as the fourth
`Proposed` counting site, and the one it says is *"the only one of the four
that anyone had been moving"* — last extended its count at `53e1405` and read
**thirty** all the way through `0637ab1`, `104d078` and `eb1f040`, while the
number was twenty-nine. It is right again now only because 0079 put the count
back. The correction is written into that paragraph rather than here, in both
directions, because the finding is not the arithmetic: **the three sections
carried the live value at every one of those anchors and the header's
paragraph did not**, which is the reverse of the lag this file records
whenever it names the four places, and it means the standing advice to sweep §3, §5 and §6 would have
missed it.

**The `Proposed` count is the only structural thing that moved, and two
citations drifted underneath it — one of them under the commit that exists to
stop citations drifting.**

**ADR 0023's two live spans both moved, 104 lines each, and #654 moved them.**
That pull request converted ADR 0023's own `file:line` citations into
verbatim quotations under the owner's 2026-08-30 ruling on #645, adding a new
gate, `tests/foundation/adr-quotation-verbatim-contract.test.ts`. Its commit
message records the measurement that motivated it — *"ADR 0023's citations
drifted with zero commits to ADR 0023"* — and the same commit moved the two
spans **this** file cites into that ADR: the resolver's three branches from
`:196-203` to **`:300-307`**, and the *"Step 1 is unimplementable today"*
sentence from `:204-205` to **`:308-309`**. Both re-derived by symbol here
rather than offset, and both corrected in place in §5. **The half of §5 that
did not break is the half that was already a quotation**: the branch text is
quoted there in full and needed nothing, while the range beside it broke —
which is recommendation 1 at the foot of §6 producing a measurable result
again, from inside the window that produced the counter-example.

**And #654 closes the other open question the previous anchor recorded.** That
pass listed #654 as *"open against the budget itself"* and said nothing here
anticipated what it would decide. It decided **not to build one**:
`ANCHOR_STALENESS_BUDGET_RELEASES` is untouched, still **10** at
`tests/foundation/adr-status-queue-anchor-contract.test.ts:89`, and that file
does not appear in this window's 45 changed files at all. The reasoning is in
the new gate's own header, measured rather than argued — this tree took 238
releases in fourteen days, so ten releases is about fourteen hours, and a
per-ADR budget on that model would put all 46 ADRs citing `src/` permanently
red on work none of them touched. **The budget survives here for the reason it
would not survive there**: one document can be re-read in an afternoon and
forty-six cannot. Nothing in this pass raises it, and the wish to raise it
remains the signal that a pass is due.

**`src/main.ts` moved by exactly its net growth at the bottom and not at all
at the top, so the two halves of §5's telemetry bullet moved by different
amounts for the second consecutive anchor.** The file took **+53/-21** from
`9a25700`/#659 and `c93109a`/#669, every line of it between `:204` and
`:2833`. So the import span stays at `:103-105`, the pipeline block at
`:163`, the prose hit at `:179` and the crash-reporter gate at `:201-204` —
all four unmoved — while the consent-prompt mount goes `:2837-2842` →
**`:2869-2874`** and its gate `:2833` → **`:2865`**, a uniform +32 that is the
file's entire net change. A single shift figure would again have been wrong
for one half, which is why every anchor here is opened rather than offset.

**`src/ui/hud/hud.ts` gained one import line and moved everything below it by
one, and nothing in §§3-6 is falsified by that.** The three anchors §5's ADR
0022 entry gives for the members a hand count missed are dated to `cfab558`
in the sentence that gives them, so they are records rather than live claims;
their current values are written here so the next reader has them without
re-deriving: `arm-build-tool` `:444-449` → `:445-450`, `cancel-build-order`
`:486` → `:487`, `arm-room-tool` `:598-603` → `:599-604`. **The live count
holds**: `HudIntent` still declares **nineteen** members, counted the way §5
says to count them, `grep -c "readonly kind: '"` between `export type
HudIntent =` — which itself moved `:311` → `:312` — and the union's close.

**§5's handshake claim was re-run because `types.ts` changed again, and for
the second consecutive anchor none of the nine moved.** `grep -rn
"protocol/handshake" src/ --include=*.ts` still returns **nine** hits, still
split **4 / 2 / 3**, all receivers or declarations: `types.ts` at `:12`,
`:23`, `:223` and `:442`, `transferables.ts` at `:39` and `:55`,
`state-machine.ts` at `:796`, `:826` and `:835`. `types.ts` took **+57/-0** in
this window and every line of it lands at `:1390` or below the four anchors,
so the decoder's `protocolVersion: z.literal(...)` at `:173` is unmoved too.
**This is the fifth consecutive anchor at which the claim has had to be
re-run** and the second at which the re-run cost nothing.

**`income.ts` did *not* change in this window, which breaks a run of three
anchors at which it had.** So §6's absence is inherited rather than
re-established, and that is the weaker result of the two: `grep -c "Proposed"
src/simulation/economy/income.ts` returns **0**, re-grepped rather than
assumed, but against a file nothing touched.

**`docs/research/README.md` gained one table row — #646's authored-content
record — and §6's *"deliberately left"* bullet still rests on the rule that
file states rather than on the table.** The rule is at
`docs/research/README.md:8-10`, opened rather than inherited, and it still
reads *"They are read-only history: when the code moves on, a record here does
not become wrong, it becomes older."* The new row is at `:68`, below every
line the rule occupies.

**Three ADRs changed for reasons §§3-6 make no claim about, and each was read
for its status line.** **0069** took +36 from #659's sentence-length work;
`**Proposed, 2026-08-29. Not self-approved.**` at `:18`, unmoved. **0076**
took +187/-9 across #666 and #670, both of which convert its implementation
paragraph to quotations and requote a widened field; `**Accepted, 2026-08-29,
by the repository owner.**` at `:17`, unmoved, and every claim §§3-6 make
about 0076 is about its *departure* from the `Proposed` count, which neither
change touches. **0078** took +23; `**Proposed, 2026-08-29. Not
self-approved.**` at `:39`, unmoved.

**Four members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/persistence/save-schema.ts`, `src/simulation/protocol/commands.ts` and
`src/simulation/construction/definition.ts` are untouched in this window, and
all four figures hold: `masterSeedSchema`'s comment is still at
`save-schema.ts:1214`; `simulationCommandSchema` still discriminates
**fourteen**, declared at `commands.ts:542`; and `grep -rno "'object\.[a-z-]*'"
src/ --include=*.ts | grep -v '^src/content/'` still returns **39** hits in
**two** files, **nineteen** in `definition.ts` and **twenty** in
`environment-art.ts`. The fourth, `HudIntent`'s nineteen, is recorded above
because `hud.ts` is in the intersection this time.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 45 files. The migrations directory still holds **twenty-three**
files (`ls supabase/migrations/*.sql | wc -l` returns 23); the retention grep
still returns exactly **one** hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land, and `grep -c '^\s*push:'` over the workflow still returns
**0**. Both claims are re-anchored to `898a16a`.

**Both derivation scans were re-run over §§3-6, neither returned a member the
list has never named — and the one-span discrepancy the previous anchor could
not reconcile is reconciled here, by measurement.**

- **The path scan** — every backticked span in §§3-6 carrying a `/`, with
  `:N`/`:N-M` stripped, filtered to those ending in a known file extension —
  returns **79** distinct spans, of which **62 exist on disk** and **17 are
  `git` and `grep` command lines that carry a slash without being paths**.
  Every one of the seventeen was read rather than pattern-matched against last
  time's, which is the correction #665 recorded: they are ten `git show` /
  `git log` / `git diff` invocations and seven `grep` invocations, and the
  full list is `git diff --numstat cfab558..origin/main -- src/main.ts`, `git
  log --first-parent cfab558..origin/main -- src/main.ts`, `git log -S 'h3.9'
  -- src/ui/primitives/icon.ts`, `git show 53e1405:docs/adr/STATUS-QUEUE.md`,
  `git show 54418b6:src/ui/hud/hud.ts`, `git show
  54418b6:tests/foundation/unconsumed-command-contract.test.ts`, `git show
  82ae630:src/ui/hud/hud.ts`, `git show bb3a01e:docs/adr/README.md`, `git show
  cfab558:docs/adr/STATUS-QUEUE.md`, `git show cfab558:src/ui/primitives/icon.ts`,
  `grep -c "Proposed" src/simulation/economy/income.ts`, `grep -c "type:
  z.literal" src/simulation/protocol/commands.ts`, the
  `^\|.*\| *\*{0,2}Proposed` count over `docs/adr/README.md`, a second
  `grep -n "Proposed"` over `income.ts`, `grep -n "this.transition("
  src/simulation/worker/state-machine.ts`, the `Amendment`/`Addendum` heading
  count over `docs/adr/*.md`, and `grep -rn "services/telemetry" src/
  --include=*.ts`. Of the 62 that exist, the documented non-members are
  `docs/adr/STATUS-QUEUE.md`, outside its own set, and the two spans reaching
  the set through a directory glob (`src/ui/primitives/icon.ts`, one file
  under `supabase/migrations/`). The remaining **59 are all named members**.
  Nothing is left over.
- **The number scan** — every bare `00NN` token in §§3-6 — returns **65**
  tokens, of which **61 name an ADR that exists on disk**. The four that do
  not are **0030**, **0055**, **0058** and **0072**: identical to the previous
  two anchors' residue, each still a number inside a claim about
  `docs/adr/README.md`'s **Next free number** line or, for 0072, the held
  events-persistence number, which is still not a member and still not
  missing. **0079 is not in this scan's output**, because §§3-6 did not cite
  it before this commit; the citation is created here, so the next pass's scan
  will return it and the membership recorded below is what makes that a
  confirmation rather than a discovery.
- **What this commit's own edits do to both scans, re-run over §§3-6 *after*
  them, so the next pass is not comparing against a tree that no longer
  exists.** The path scan goes **79 → 81** spans, **62 → 62** existing and
  **17 → 19** residue: the two new spans are both `git` command lines this
  pass added to §5 (`git diff --numstat eb1f040..898a16a -- src/main.ts` and
  the `898a16a` half of the mount-span history), and **no new file joins the
  62** — measured by diffing the two existing-span sets, which is empty. The
  number scan goes **65 → 67** tokens: **0079**, which is now a member and now
  cited, and **0080**, which is the index's new **Next free number** and
  therefore joins the documented next-free residue exactly as 0078 did at
  `53e1405` before leaving it by becoming a document. **So a reader
  re-deriving after this commit should expect 81/62/19 and a five-token
  residue — 0030, 0055, 0058, 0072 and 0080 — and not the figures this
  subsection reports for the anchor tree.** Both sets of numbers are right
  about the text they were taken over, and saying which is which is the whole
  of what the previous anchor found the reporting, rather than the scan,
  getting wrong.

**The 78-versus-79 question the previous anchor left open is settled, and the
answer is one character in a regular expression.** That pass measured its own
filter at **78** spans with a **16**-line residue over `eb1f040`, and recorded
that `104d078` had measured **79** and **17** over that same tree, adding that
*"neither pass states its filter finely enough to reconcile it"*. Measured
here rather than argued: the difference is a single backticked span that
**crosses a line break** — `grep -n "Proposed"` on one line and
`src/simulation/economy/income.ts` on the next, inside §6's `income.ts`
bullet. A span pattern of `` `[^`]+` `` tolerates the newline and finds it; one
of `` `[^`\n]+` `` does not. Run both ways over `eb1f040` the counts are 79/17
and 78/16, and run both ways over `898a16a` they are 79/17 and 78/16 again.
Both passes were right about the same text and neither filter was wrong; the
count of *existing* spans, **62**, is the figure that never differed. **And
the two trees agree exactly**: `diff` over the two scans' outputs between
`eb1f040` and `898a16a` is empty in both directions, for the path scan and the
number scan alike, which is what the two-sha §§3-6 diff above predicts.

**The 0051 half of this pass's brief was not done, and the reason is the same
fact about `main` that stopped the previous pass.** The brief made it
conditional and the condition is unmet: **PR #647 has not merged.** It is open
at the time of writing, `state: "open"`, `merged: false`, one of the seven
non-draft pull requests listed above. `docs/adr/0051-…md:22` reads
`**Proposed, 2026-08-28. Not self-approved.**` on disk at `898a16a`, and 0052
and 0054 read `**Proposed, 2026-08-28.** Not self-approved.` at `:5` each —
the emphasis falls differently in 0051 than in the other two, which is
recorded because the previous pass rendered all three alike. So the
`Proposed` tally is *not* one high, the header's handover naming those three
is *not* a third discharged, and the thirty counted above is a count of the
tree rather than of that branch. Nothing has been changed in anticipation.
**The work that lands with #647 is unchanged from the list the previous anchor
left**: the four `Proposed` counting sites (this header's paragraph, §3's
opening, §5's first bullet, §6's `income.ts` bullet), the header's handover
paragraph, §5's two sentences asserting ADR 0054's status, and the fourth
assertion of the same shape outside this file at `docs/adr/0056-…md:311`,
*"it does not edit ADR 0051, because ADR 0051 is itself Proposed"*, opened on
disk here and still standing —
all of which stay untouched here for the reason they have always stayed
untouched: flipping a status is not a re-anchor's job.

**The `eb1f040` anchor's account, kept. The paragraphs below are that pass's,
including its own record of the anchors before it.** Its anchor line named
`eb1f040` and **v0.0.242**, coming from the v0.0.234 anchor described below,
and stated **eight of the ten releases the budget allows** as a figure about
the commit that wrote it rather than about the tree it landed on. It is
described rather than quoted, for the reason that pass gives further down: the
gate counts anchor spans and requires exactly one. **Its scoping was
vindicated and its arithmetic was not overtaken**: it merged at `007582c`,
which released as v0.0.244, so `package.json` read `0.0.243` at the moment it
landed and its fresh anchor was **one** release behind rather than eleven.
Whether any earlier pass in this sequence also landed inside its own window is
not checked here and is not claimed.

**That figure is a fact about this commit and it is not a claim about the
merge, and the previous pass is the whole reason it is written that way.** That
pass was dispatched at nine of ten and landed at eleven, and the sentence it
wrote about its own headroom was falsified by two releases it could not see.
So: **eight as of the commit that writes this paragraph**, and no
headroom figure at all is claimed for the tree this lands on. Nine non-draft
pull requests are open at the time of writing — #640, #647, #650, #653, #654,
#655, #656, #658 and #659 — every merge costs one release, and the budget at
merge is therefore anything from eight upward depending on how many of them go
first. **A number measured when a branch is cut says nothing about the tree it
lands on**, which is the previous anchor's own finding applied to this
paragraph rather than restated about that one. One of those nine, **#654**, is
open against the budget itself; nothing here anticipates what it decides.

**And it started moving immediately, which is recorded because it is evidence
for the paragraph above rather than a correction to it.** Measured once, minutes
after the commit that wrote it: `origin/main` had already reached
**v0.0.243** — `48be7e6`, releasing #646 (`c277864`), which edits one member,
`docs/research/README.md` — so the count was **nine** before this branch had a
pull request, and one member had moved since the tree every citation here was
derived from. **The anchor is not chased to that tree**, deliberately: an
anchor names the commit its citations were re-read against, and #646's edit
belongs to the next window rather than to this one. What the reading is for is
that it settles, with a number rather than an argument, that the figure above
had to be scoped to a commit.

`eb1f040` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.242 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#643, `93bfbbb`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `eb1f040`.** `git diff --name-only 104d078..eb1f040` is
**69 files**, of which **nine are members**: `docs/research/README.md`,
`package.json`, `src/simulation/economy/income.ts`,
`src/simulation/protocol/types.ts`, `src/ui/hud/messages.ts`,
`src/ui/hud/projection.ts`, `tests/unit/ui-hud-messages.test.ts` and ADRs
**0028** and **0064**. `docs/adr/STATUS-QUEUE.md` is a tenth changed file that
§§3-6 name and is deliberately outside its own set. **Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed**, so those three glob members contributed none.

**The window is eight releases carrying eight merged pull requests** — #636,
#635, #638, #628, #637, #651, #644 and #643 — read off `git log --oneline
--first-parent 104d078..eb1f040` (excluding the eight release-bump commits).
**Two of the eight edit this file and neither is new drift**: `68f1d9b`/#638 is
the previous anchor's own writing commit, kept below as that anchor's account,
and `8ca7a68`/#651 is the correction to it, also kept below. **What those two
changed inside §§3-6 is two shas and nothing else** — `diff` over §§3-6 between
the two trees returns exactly the two `verified at` values and no other line,
which is measured rather than assumed and is why the enumerated-citation
surface below is untouched. **No commit in this window filed a §2 entry**, so
all four places that count §2 stay at eight.

**Nothing structural moved, for the second anchor running — and the second
reading is worth less than the first, which is said here rather than left to be
inferred.** The `Proposed` count is **unchanged at twenty-nine**: counted on
disk at `eb1f040` by the same method as every reading in this sequence, the
first non-blank line under each document's *own* status statement, `## Status`
heading or `- Status:` bullet alike — **twenty-seven** under a heading and
**two** under a bullet (0064 and 0067, still the only two, so a heading-only
scan still undercounts by two). `docs/adr/README.md` agrees, counted
independently: **twenty-nine** rows opening `Proposed` out of **72**, and
**Next free number: 0079**, unmoved. No ADR arrived in the window and no status
flipped in it. So §3's opening, §5's first bullet and §6's `income.ts` bullet
all still read **twenty-nine**, all three are still correct, and none was
edited. **The first such window was a result; a second one running is a weaker
result and not a stronger one**, because two consecutive windows that exercise
nothing say nothing about the mechanism that splits the four places apart.

**ADR 0079 exists and is not counted, and the reason is the one this file gives
every time.** It is `Proposed` on `agent/593-longer-sentences` (PR #659, open
and unmerged at this commit); a branch nobody has merged is invisible from
disk, and the twenty-nine is a count of `main`. If #659 merges before this
does, the count is thirty and four places need it. **Which way that goes is not
something this pass can record**, and it is written down rather than guessed at
for the same reason the budget figure above is scoped to this commit.

**§5's handshake claim was re-run because `types.ts` changed, and this time
none of the nine moved.** `grep -rn "protocol/handshake" src/ --include=*.ts`
still returns **nine** hits, still split **4 / 2 / 3**, all receivers or
declarations. `types.ts` is unmoved at `:12`, `:23`, `:223` and `:442` after
taking **+31/-8** in this window from #644's stale-comment sweep;
`transferables.ts` is unmoved at `:39` and `:55` and `state-machine.ts` at
`:796`, `:826` and `:835`, both of those files being outside the window
entirely. **This is the fourth consecutive anchor at which the claim has had to
be re-run**, and the first of the four at which the re-run cost nothing: the
`0637ab1` pass moved six of the nine and `104d078` moved three
(`state-machine.ts`, a uniform +2). Whether any anchor before those three also
found all nine unmoved is not checked here and is not claimed.

**`income.ts` changed again — #637's relocation work — so §6's absence is
re-established rather than inherited for the third anchor running**: `grep -c
"Proposed" src/simulation/economy/income.ts` returns **0** against the edited
file.

**One citation moved, and it is the smallest thing in this window.**
`tests/unit/ui-hud-messages.test.ts` gained a five-line fixture comment from
#635 (`occupiedPlaces: 0`, so the `PRISONERS` chip takes its
`prisonersWithoutBed` branch), and `it('imports nothing from the simulation',
…)` moved from `:230` to **`:235-241`**. **Nothing in this file is falsified by
that**, and saying why is the point: the two places that cite that test as
`:218-224` both scope the number to `bb3a01e` in the same sentence, so they are
dated records rather than live claims, and `git show
bb3a01e:tests/unit/ui-hud-messages.test.ts` puts the test at `:218` — the
record is correct about the tree it names. The current value is written here so
the next reader has it without re-deriving it.

**`messages.ts` and `projection.ts` both changed and both of §6's ADR 0017
corrections hold.** `src/ui/hud/messages.ts:85` reads *"ADR 0017 -- Accepted"*
and `src/ui/hud/projection.ts:408` *"ADR 0017 is Accepted without naming one
either"*; neither file names a currency, which is what the label rests on.

**Two ADRs changed and neither change reaches a claim §§3-6 make about them.**
**0028** gained a dated narrowing on 2026-08-30 from ADR 0076 decision A(i)
(#637) — a resident the prison *can* rehouse is moved rather than left, while
*"nobody is evicted"* and *"occupancy above capacity is a legal, named state"*
both survive as decided. §5's ADR 0023/0028 entry is about 0028's six phases,
the `zoning.ts` capacity collaborator and the `'object.*'` grep, and the
amendment touches none of the three; 0028's status is still **`Accepted,
2026-08-25.`** **0064** gained a #543 correction recording that the income line
walks `residentIdsWithExistingPlace` rather than `residentIds`; it is read here
only for its status line, `- Status: Proposed, 2026-08-28` at `:3`, unmoved.

**`docs/research/README.md` gained seventeen lines across two commits — two
table rows from #636 and #643, and a re-read note under them — and §6's
*"deliberately left"* bullet still rests on the rule that file states rather
than on the table.** The rule is at `docs/research/README.md:8-10`, opened
rather than inherited, and it reads *"They are read-only history: when the code
moves on, a record here does not become wrong, it becomes older."* **The
`cfab558..53e1405` window note further down this header renders it as
*"records here are read-only history: …"***, which is a paraphrase rather than
the sentence as `docs/research/README.md` states it; the
rule it rests on is unaffected and the wording is corrected here rather than
there, because that paragraph is a kept record of what that pass read.

**Four members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/ui/hud/hud.ts`, `src/persistence/save-schema.ts`,
`src/simulation/protocol/commands.ts` and
`src/simulation/construction/definition.ts` are all untouched in this window,
and all four figures hold: `HudIntent` still declares **nineteen** members,
counted the way §5's ADR 0022 entry says to count them; `masterSeedSchema`'s
comment is still at `save-schema.ts:1214`; `simulationCommandSchema` still
discriminates **fourteen**, declared at `commands.ts:542`; and `grep -rno
"'object\.[a-z-]*'" src/ --include=*.ts | grep -v '^src/content/'` still
returns **39** hits in **two** files, **nineteen** in `definition.ts` and
**twenty** in `environment-art.ts`, which is the shape §5 records as falsified
and the numbers it records it at.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 69 files. The migrations directory still holds **twenty-three** files
(`ls supabase/migrations/*.sql | wc -l` returns 23); the retention grep still
returns exactly **one** hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a mechanism;
all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`, `:188`) and all
four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened and still land,
and `grep -c '^\s*push:'` over the workflow still returns **0**. Both claims
are re-anchored to `eb1f040`.

**The four places that count §2 were swept and all four agree at eight** —
this header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2.
Eight entries"*, and §5's preamble's *"EIGHT at #615"*. As at the previous
anchor, they agree because nothing moved them rather than because a filing
commit moved them together, and that is the weaker of the two results: **the
split has now gone two consecutive windows without being exercised at all**,
so this sweep confirms nothing about it.

**Both derivation scans were re-run over §§3-6, and this time one of them
returned a member the enumerated list has never named. The seven-anchor run
ends, and it ends by finding that the last two entries in it were wrong.**

- **The path scan** — every backticked span in §§3-6 carrying a `/`, with
  `:N`/`:N-M` stripped, filtered to those ending in a known file extension —
  returns **78** distinct spans, of which **62 exist on disk** and **16 are
  `git` and `grep` command lines that carry a slash without being paths**
  (`git show cfab558:src/ui/primitives/icon.ts`, `grep -rn
  "services/telemetry" src/ --include=*.ts`, and fourteen more of that shape).
  Of the 62, the documented non-members are `docs/adr/STATUS-QUEUE.md`, outside
  its own set, and the spans reaching the set through a directory glob
  (`src/ui/primitives/icon.ts`, one file under `supabase/migrations/`).
  **One is left over and it is a real omission**:
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`, cited
  in §5's first bullet for the two §2 entries handed over in it. It is added to
  the set below.
- **The number scan** — every bare `00NN` token in §§3-6 — returns **65**
  tokens, of which **61 name an ADR that exists on disk**. The four that do not
  are **0030**, **0055**, **0058** and **0072**: identical to the previous
  anchor's residue, and each still a number inside a claim about
  `docs/adr/README.md`'s **Next free number** line or, for 0072, the held
  events-persistence number. **0072 is still not a member and still not
  missing**: no such document exists on disk, the number being held for the
  events-persistence decision. Four further tokens — 0038, 0039,
  0040 and 0041 — now name ADRs that *do* exist while appearing in §§3-6 only
  inside claims about that same next-free line, so they stay classified where
  this subsection has always put them: a scan that returns a token is not a
  citation that creates a dependency.

**Why the omission is worth more than the file it names.** The span was in the
scan output at `0637ab1` and at `104d078`, and both of those passes reported
that neither scan returned a member the list had never named — *"the sixth
anchor running"* and *"the seventh anchor running"*. It entered §§3-6 in
`0637ab1`'s **own** commit: that pass wrote the sentence citing the record and
did not add the file to the set, which is exactly the omission this
subsection's maintenance rule exists to prevent, committed by the pass that
maintains the rule. Then `104d078` re-ran the scan, got the span back, and
reported a clean residue. **So the derivation check found this twice and was
overruled by the sentence written about it twice** — which is a different
failure from the one this subsection was built for. The scan is not the weak
part; reading its output is. Measured rather than argued: re-running the filter
above over §§3-6 **as they stood at `104d078`** returns the same 78 spans and
the same 62 existing files, including this one.

**Neither total is comparable with any previous anchor's and the residue is
what is comparable**, as every reading in this sequence says. The `104d078`
pass recorded **79** spans with a residue of **17** command lines; this filter
returns **78** and **16** over that same tree, so the one-span difference lives
entirely inside the command-line residue and neither pass states its filter
finely enough to reconcile it. The count of *existing* spans, 62, is identical
across the two trees, and so is the set: `diff` over the two scans' outputs is
empty in both directions, for both the path scan and the number scan.

**The 0051 half of this pass's brief was not done, and the reason is a fact
about `main` rather than a judgement.** The brief said ADR 0051 had been
accepted on 2026-08-30, that the `Proposed` tally was one high in several
places, and that the header's handover naming **0051**, **0052** and **0054**
was a third discharged. **PR #647 has not merged.** It is open at the time of
writing, and `docs/adr/0051-…md` reads **`Proposed, 2026-08-28. Not
self-approved.`** on disk at `eb1f040`; 0052 and 0054 each read
`**Proposed, 2026-08-28.** Not self-approved.` there too — so the tally is
*not* one high, the handover is *not* a third discharged, and every count
above is a count of the tree rather than of that branch. Two corrections to the
brief, recorded because the next pass will be handed the same task: the
handover paragraph naming those three ADRs is in **this header**, not in §2 —
§2 mentions 0051 only inside ADR 0056's entry — and the fourth live assertion
of the same shape sits in `docs/adr/0056-…md:311`, *"it does not edit ADR
0051, because ADR 0051 is itself Proposed"*, re-read on disk here and still
standing; #647 proposes to correct it. When #647 lands, the work is the four `Proposed` counting sites
(this header's paragraph, §3's opening, §5's first bullet, §6's `income.ts`
bullet), the header's handover paragraph, and §5's two sentences asserting ADR
0054's status — which stay untouched here for the reason they have always
stayed untouched: flipping a status is not a re-anchor's job.

**The `104d078` anchor's account, kept. The paragraphs below are that pass's,
including its own correction by #651 and its own record of the anchors before
it.** Its anchor line named `104d078` and **v0.0.234**, coming from `0637ab1`
(v0.0.225), and recorded that it was dispatched at nine of the ten releases the
budget allows and merged at eleven. It is described rather than quoted, for the
reason the paragraph further down gives: the gate counts anchor spans and
requires exactly one.

**The paragraph that stood here until 2026-08-30 said "ten of the ten
releases the budget allows -- the first pass in this series dispatched with
no headroom left at all", and went on to say that the *next* merge of
anything would take the budget to eleven, and that this was "the gate firing
rather than being anticipated". A second paragraph beneath it explained "why
the headroom went in one night", counting nine releases from `53e1405` and
naming #606, #578, #605, #617, #618 and #619.** Every sentence of both was
true of the **previous** anchor and was carried over with only the sha and
the version changed: `53e1405` is v0.0.215, and v0.0.215 to v0.0.234 is
nineteen releases, not nine. The correct attribution has always been below,
at the previous anchor's own line, which says v0.0.225 was *"dispatched at
ten of ten -- the only pass in this series moved with no headroom at all"* --
and still says it.

It is corrected rather than deleted, because **the carry-over is itself the
finding**: this file's own pass reproduced, in its own header, the exact
class of defect the file exists to catch. `adr-status-queue-anchor-contract`
did not see it, correctly -- it tests the anchor's format and singularity,
not whether the prose around it is true.

**What actually happened is worse than the sentence it replaces, which is why
this is not bookkeeping.** `0637ab1` (v0.0.225) to `104d078` (v0.0.234) is
**nine** releases, so this pass was dispatched with one still spendable. It
was not merged there. Two further releases landed while it sat open --
`main` reached **v0.0.236** -- so the budget went to **eleven** and the
contract turned `main` red *before this pass landed*. **Every open pull
request inherited that failure**, because the gate tests the tree rather than
the diff -- including #628, the fix for the browser flake that was itself
reddening this pull request's own `browser` job. The pass that exists to keep
the budget solvent was blocked by the budget it was spending, and the merge
went through with a red `browser` job on evidence recorded in that pull
request.

So the case this sequence had not yet met has now been met, and it is not the
one the carried-over paragraph named. Not *dispatched with no headroom*, but
**dispatched with headroom and merged without it**.

**The remedy is still not a larger budget** -- the constant's own comment
forbids raising it and says why -- but the shape of what would help has
changed with the finding. A check that *warns* at seven rather than failing
at eleven would put the signal where the merging happens, and it must read
the count **at merge**, because this pass was correct at dispatch by exactly
the margin that failed at merge. A number measured when a branch is cut says
nothing about the tree it lands on. That is not done here.

`104d078` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.234 release commit**, named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: it is cut after the
last merge in the window (#633, `36dcdf3`), contains every sentence below, and
is the exact tree every citation here was re-derived from.

**The delta note for `104d078`.** `git diff --name-only 0637ab1..104d078` is
**46 files**, of which **eight are members**: `docs/AGENT_WORKFLOW.md`,
`docs/HUD_PROJECTIONS.md`, `docs/research/README.md`, `package.json`,
`src/simulation/economy/income.ts`, `src/simulation/protocol/types.ts`,
`src/simulation/worker/state-machine.ts` and ADR **0003**. Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed.

**Nothing structural moved, and that is the result rather than an absence of
one.** The `Proposed` count is **unchanged at twenty-nine** — no ADR was added
and no status flipped in nine releases, which has not happened since this
sequence began tracking it. `docs/adr/README.md` agrees at twenty-nine,
counted independently. So §3's enumeration, §5's first bullet and §6's
`income.ts` bullet are all still correct and none was edited; a pass that
changes nothing is reported as such rather than padded.

**§5's handshake claim was re-run, because both its files changed again.**
Still **nine hits, still split 4 / 2 / 3**, all receivers or declarations.
`types.ts` is unmoved at `:12`, `:23`, `:223`, `:442` and `transferables.ts`
at `:39`, `:55`; `state-machine.ts` moved from `:794`, `:824`, `:833` to
**`:796`, `:826`, `:835`** — a uniform +2. That is the third consecutive
anchor at which this one claim needed re-running, and the second at which only
`state-machine.ts` moved.

**`income.ts` changed again** — #626 gave it `stateIncomeForOccupiedPlaces` —
so §6's absence is re-established rather than inherited for the second anchor
running: `grep -c "Proposed" src/simulation/economy/income.ts` returns **0**
against the edited file.

**Both derivation scans were re-run over §§3-6, and neither returned a member
the list has never named — the seventh anchor running at which that is true.**
The path scan returned **79** distinct backticked spans ending in a known
extension; its entire residue is the documented one, and it is **17 `git` and
`grep` command lines that carry a slash without being paths** — `git show
cfab558:src/ui/primitives/icon.ts`, `grep -rn "services/telemetry" src/
--include=*.ts`, and fourteen more of that shape. Every span that is a path
exists on disk.

The number scan returned **65** tokens, of which **61 name an ADR that exists**.
The four that do not are **0030**, **0055**, **0058** — the next-free residue
this subsection already enumerates — and **0072**, which is held and unwritten
for the events-persistence decision and which this file has recorded as *"not a
member and not missing"* for six anchors. **The residue did not grow this
time**, which is the first anchor since `53e1405` where it held: that pass added
0078 to it, and 0078 has since left by becoming a real citation, so the count
is back where it was.

**The previous anchor's line named `0637ab1` and **v0.0.225**, coming from
`53e1405` (v0.0.215), and was dispatched at ten of ten -- the only pass in
this series moved with no headroom at all. The one before it named `53e1405`
and **v0.0.215**, coming from `cfab558` (v0.0.208), with six open pull
requests listed -- #578, #605, #606, #610, #611 and #612.** It is described rather than quoted, and that is not style:
`tests/foundation/adr-status-queue-anchor-contract.test.ts` counts every span
matching *"Re-anchored at `main` @ `<sha>` (v<version>)"* and requires exactly
**one**, so a verbatim quotation of a superseded anchor line fails the gate as
a second live anchor. The first attempt at this paragraph did quote it and the
gate caught it -- `1 failed`, *"must open with exactly one"*, `expected […] to
have a length of 1 but got 2`. **That test grants a past-tense exemption to
`verified at` claims and none to its own anchor line**, which is an asymmetry
rather than an oversight to route around: the exemption exists so §5 can
preserve what a superseded entry used to claim, and the anchor line has no
such record to preserve because this paragraph is it.

**And the six kept anchor records further down this file do quote it verbatim,
which looks like a contradiction and is instead an undocumented load-bearing
line break.** Each reads *"It read: 'Re-anchored at `main` @"* with the sha on
the **next** line, and the gate's pattern requires a literal space between `@`
and the opening backtick -- ``Re-anchored at `main` @ `([0-9a-f]{7,40})` ``. A
newline is not that space, so every one of those six records is invisible to
the scanner **because of where the paragraph happens to wrap**. Measured, not
inferred: joining the `82ae630` record onto one line and running the gate gives
*"expected […] to have a length of 1 but got 2"*, and restoring the break gives
`4 passed`. **So re-flowing any of those six paragraphs -- a formatting edit,
the kind nobody reviews -- turns a historical record into a second live anchor
and fails a gate whose message will talk about anchors rather than about
wrapping.** Written down because it is exactly the shape of trap this file
exists to record: a property everything below depends on, held by nothing that
says so. Four of those five have merged
inside this window and are accounted for below; **#578 is still open**, which
makes it the only pull request to have been named in two consecutive anchors'
dispatch notes as outstanding. That is recorded rather than acted on: whether
a pull request open across seven releases is stalled or merely large is not
something this file can read, and `docs/AGENT_WORKFLOW.md` §3's rule about
state this repository cannot read applies to it.

**The window is 58 files**, across seven releases carrying **seven** merged
pull requests -- #583, #603, #577, #579, #580, #581 and #607 -- read off
`git log --oneline --first-parent cfab558..origin/main` (excluding the seven
release-bump commits). **One of the seven edits this file and it is not new
drift**: `d47edfd`/#583 is the previous anchor's own writing commit, kept
below as that anchor's account. **No commit in this window filed a §2 entry**,
so all four places that count §2 stay at six and the sweep below reports
agreement rather than a correction.

The delta intersection against the enumerated set is **eight**:
`docs/adr/README.md`, `docs/research/README.md`, `package.json` (read for its
version rather than diffed, as every anchor's convention states),
`src/main.ts`, `src/ui/hud/hud.css`, `src/ui/primitives/icon.ts`,
`src/ui/primitives/primitives.css` and `src/ui/tokens.css`.
`docs/adr/STATUS-QUEUE.md` is a ninth changed file that §§3-6 name and is
deliberately outside its own set. **`src/ui/primitives/icon.ts` reaches the
intersection only through the directory glob `src/ui/primitives/**`**, which
§5's `ui-hud-messages.test.ts` citation is a claim about -- and it is the member
that produced this window's sharpest finding, which is the argument for
listing a glob as a member rather than only the files under it that are cited
by name. **No file under `supabase/migrations/` changed** -- the directory
still holds twenty-three, so §3's table needed no re-derivation. **Three ADRs
join the set in this commit** -- **0075**, **0076** and **0077** -- by the
rule the derivation subsection states: the corrected counts below now
enumerate them.

**What the eight cost: one entry corrected, one accepted ADR's sentence
falsified outside this file, and a citation pair moved twice in one file.**

**Falsified by this window, and it is not in this file: ADR 0025's withdrawal
sentence.** §5's `3.9px` bullet quotes that accepted ADR verbatim -- *"`3.9`
appears in no other ADR, in no `.css` file and nowhere in `src/`"* -- and the
last clause went false at **`2a00f98`** (#579, v0.0.212). `src/ui/primitives/icon.ts:68`
now holds `'M15.8 16.1h3.9'`, the fourth stroke of the `ui-scale` glyph the
interface-scale work added; `git show cfab558:src/ui/primitives/icon.ts`
returns no `3.9` at all, and `git log -S 'h3.9'` names that one commit. **The
sentence's point survives and its grep does not**, which is the distinction
worth keeping: no `.css` file records the figure (there are still **four**
under `src/ui/`, re-derived here), no other ADR records it, and nothing in
`src/` records it *as a measurement* -- but a reader running the raw grep the
sentence invites now gets a hit, and it is SVG path data rather than a
headroom figure. **The fix is ADR 0025's, not this file's**, and it is handed
over rather than made here: the clause needs the same both-directions
treatment everything else here gets, naming the path-data hit so the next
reader does not have to re-derive that it is not a measurement. Recorded in
§5's bullet as well, where the quotation lives.

**Moved by this window: `src/main.ts`, in two places and by two different
amounts.** #579 is the only commit in the window to touch that file (`git log
--first-parent cfab558..origin/main -- src/main.ts` returns `2a00f98` alone),
and it added 73 lines split either side of the code §5's telemetry bullet
cites. Every anchor in that bullet was re-derived by opening the file: the
import span `:98-100` is **`:103-105`**, the pipeline construction `:158-199`
is **`:163-204`**, the `crashReporter` gate `:196-199` is **`:201-204`** and
the prose hit `:174` is **`:179`** -- all four five lines down -- while the
consent-prompt gate `:2762` is **`:2833`** and the mount span `:2766-2771` is
**`:2837-2842`**, both seventy-one lines down. **That is the seventh
consecutive anchor at which this bullet's `src/main.ts` numbers have moved**,
and `src/ui/telemetry-consent-prompt.ts:8` -- the one anchor in it cited by
symbol -- has still never moved, on a file no window has touched. The grep the
bullet tells the next reader to run still returns **six** hits, still split
four in `src/main.ts` and two in `src/ui/telemetry-consent-prompt.ts`, and the
two prose hits are still the same two.

**Unchanged, every one opened rather than rested on the diff.**
`src/ui/hud/hud.css` took 121 added lines against 5 removed and still records
no `3.9`; `src/ui/tokens.css` took 190 against 17 and
`src/ui/primitives/primitives.css` one against one, and neither records one
either -- so the four-`.css`-file half of the ADR 0025 finding survived the
largest edit any of those files has taken inside a window this file has
measured. Counted with `git diff --numstat` rather than `--stat`, because
`--stat`'s single figure is added *plus* removed, and reading it as growth is
how a line count in this file comes to be wrong by the size of a deletion. `docs/research/README.md` gained one table row
and §6's *"deliberately left"* bullet still rests on the rule that file states
rather than on the table; the rule is still there, under *"Research
records"*, in the sentence *"records here are read-only history: when the code
moves on, a record here does not become wrong"*. `src/simulation/economy/income.ts`
is outside this window -- not among the fifty-eight files the diff reports --
and was re-grepped anyway: still no `Proposed` count in it at all, for the
eleventh reading.

**Three members outside the intersection were re-derived anyway, because each
carries a count rather than a line and a count is cheap to re-take.**
`src/ui/hud/hud.ts`, `src/persistence/save-schema.ts` and
`src/simulation/protocol/commands.ts` are all untouched in this window (`git
diff --name-only cfab558..origin/main` lists none of the three), and all three
figures hold: `HudIntent` still declares **nineteen** members, counted the way
§5's ADR 0022 entry says to count them; `masterSeedSchema`'s comment is still
at `save-schema.ts:1214`; and `simulationCommandSchema` still discriminates
**fourteen**. **The previous anchor found two of those three wrong**, both
falsified in a window before its own, so re-taking them on an untouched tree
is the control that says the corrections held rather than an idle repetition.

**`docs/adr/README.md` moved two lines this file cites by value.** **Next free
number** went **0075 → 0078** across two commits -- #580 landed 0075 and 0076
together and moved it to 0077, #581 landed 0077 and moved it to 0078 -- and
the Proposed row count went 27 → **30** out of **71** rows. Every other
citation this file makes into the index by number sits inside a preserved
record of a superseded claim and is left as it stands.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 58 files. The migrations directory still holds twenty-three files;
the retention grep still returns exactly one hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land. Both claims are re-anchored to `53e1405`.

**The four places that count §2 were swept and all four agree at six** -- this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Six
entries"*, and §5's preamble's *"SIX at #571"*. **This is the first window in
the series in which the four agreed because nothing moved them**, rather than
because a filing commit moved them together: no commit in this window filed a
§2 entry, so the mechanism that splits them was never exercised. That is a
weaker result than the previous anchor's and is reported as the weaker one --
a sweep that finds agreement on an untouched set of paragraphs has confirmed
nothing about the split, exactly as the previous anchor recorded of *its*
count-only window.

**Three outstanding ADRs landed in this window with no §2 row, and this pass
files none of them. The reason is the one §2's own text calls the rule
"unsatisfiable under concurrency", and it is verifiable rather than
asserted.** 0075 and 0076 arrived at `092991e`/#580 and 0077 at
`827201e`/#581, all three `Proposed, 2026-08-29. Not self-approved.` on disk
at this anchor. Taking them one at a time:

- **0075 and 0076: the entries exist, they were handed over deliberately, and
  the handover is still open.** `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`
  §8 is headed *"Handed over: the two `docs/adr/STATUS-QUEUE.md` §2 entries"*
  and carries both in full, with the reason written out: *"any count written
  here is wrong by one whichever way the two branches land, in all four places
  at once, and the merge conflicts in exactly the four paragraphs whose value
  is the record of how they came apart."* That was true against
  `agent/status-queue-0074-entry` when it was written and **it is true again
  now**, against a different branch: PR **#610** is open at the time of
  writing and its `docs/adr/STATUS-QUEUE.md` reads *"## 2. Seven entries: …
  and ADR 0071's open-area amendment"*. Filing 0075's and 0076's rows from
  this branch would move the same four counters from six in the same four
  paragraphs. **So the entries are owed, they are written, and the commit that
  files them is the one that can read the true count off the merged file** --
  which is the mechanism `9f0096c`/#574 demonstrated and which the previous
  anchor recorded from the other side.
- **The owner has ruled on both, which changes what the entry is for but not
  whether it is owed.** Both ADRs' own `Status` sections say the rulings were
  the owner's and dated 2026-08-29, and PR **#606** (`claude/accept-adr-0075-0076`)
  is open to move both to `Accepted, 2026-08-29, by the repository owner.`
  **This pass deliberately does not treat that as discharging the row.** A
  status that is `Proposed` on `main` is what every gate here reads, an
  unmerged branch is invisible from disk -- this file's own numbering
  paragraph says so repeatedly -- and if #606 merges first the correct action
  is the standing recipe, which is to file nothing and delete nothing, because
  there was never a row to delete. Both outcomes are written down here so
  whichever lands is a lookup rather than a re-derivation.
- **0077 is the one with no handover anywhere**, and it is the finding. #581
  added the ADR, did not file a §2 row, and left no entry text in its PR body,
  in the ADR, or in any research record -- `grep -rn "STATUS-QUEUE" docs/adr/0077-*.md
  docs/research/2026-08-29-playtest-ordering-and-the-second-room.md` returns
  nothing. So it is the **eleventh** outstanding ADR since the rule was
  restated to arrive with no row, the first since 0074 broke the nine-long
  streak, and the only one of the eleven that is not either a bare skip or a
  recorded handover: it is a skip that looks like a handover from the outside,
  because the two ADRs beside it in the same window *were* handed over. **That
  is a new failure shape for this file and it is named rather than fixed
  here**, because writing a §2 entry for 0077 means asserting what settling it
  commits the project to, and that is the drafting agent's evidence to give,
  not a re-anchor's to invent.

**The `cfab558` anchor's window note and findings, kept as that anchor's
account. The paragraphs below are that pass's, including its own four-place
sweep, which found all four agreeing at six.**

**The window was 53 files**, across seven releases carrying **seven** merged
pull requests -- #567, #568, #570, #571, #572, #575 and #574 -- read off
`git log --oneline --first-parent e1813b7..origin/main` (excluding the seven
release-bump commits). **Two of the seven edit this file and neither is new
drift**: `6165952`/#567 is the previous anchor's own writing commit, kept
below as that anchor's account, and `9f0096c`/#574 filed §2's sixth entry and
swept all four counts in the same commit, which is the case §5's preamble
records from the other side.

The delta intersection against the enumerated set is **ten**:
`docs/adr/README.md`, `docs/research/README.md`, `package.json` (read for its
version rather than diffed, as every anchor's convention states),
`src/persistence/save-schema.ts`,
`src/simulation/presentation/room-projection.ts`,
`src/simulation/rooms/zoning.ts`, `src/ui/hud/build-panel.ts`,
`src/ui/hud/hud.ts`, `src/ui/hud/messages.ts` and
`tests/foundation/unconsumed-command-contract.test.ts`.
`docs/adr/STATUS-QUEUE.md` is an eleventh changed file that §§3-6 name and is
deliberately outside its own set. **No file under `supabase/migrations/`
changed** -- the directory still holds twenty-three, so §3's table needed no
re-derivation. **Four ADRs join the set in this commit** -- **0070**,
**0071**, **0073** and **0074** -- by the rule the derivation subsection
states: the corrected counts below now enumerate them.

**One sentence in the previous anchor's window note is wrong about this file's
own dependency set, and it is the cheap kind to find.** It read *"two of those
are this file and the index, which are not in their own dependency sets"*.
This file is not in its own set and says so wherever the question comes up;
**`docs/adr/README.md` is a declared member**, named in the second bullet of
*"The set, in full"* below since long before that sentence was written.
Corrected here rather than overwritten, because the arithmetic around it is
unaffected -- the index was read either way -- and because a sentence that
takes a member out of the set is exactly how a later delta pass comes to skip
a file.

**The previous anchor's window note, kept.** It read: *"**The window is 80
files.** Six merges landed in it (#564, #533, #548, #549, #543 and #566, with
their releases). The delta intersection against the **43** files §§3-6 cite is
**eight** ... **The enumerated set grew from 41 to 43 with no commit deciding
to grow it**: it is derived by scanning §§3-6 for rooted paths that exist on
disk, so a citation added anywhere in those sections joins the dependency set
silently."* **That derivation was re-run at this anchor and its own total of
43 is not reproducible**, which is recorded rather than quietly restated:
scanning §§3-6 for backticked rooted paths that exist on disk returns **79**
distinct spans here, of which **18** are bare directory prefixes and **61**
are files -- one of them `docs/adr/STATUS-QUEUE.md` itself. The two numbers
are not comparable, because the sentence giving 43 does not state its filter;
what *is* comparable is the residue, and it is unchanged: **no member the
enumerated list has never named**, for the fourth anchor running.

**What the ten cost: three entries corrected, and two of the three were
already false when this window opened.** The one this window actually
falsified is the smallest of them.

**Falsified by this window:** §5's ADR 0009 entry cites
`src/persistence/save-schema.ts:1198` for the comment naming `masterSeedSchema`
*"from `services/challenges`"*. #571's V4 bounds-recovery work added sixteen
lines above it, so it is **`:1214`** here. That is the fifth pair of numbers
this one comment has been given and the sentence it supports has never
changed a word, which is the symbol-over-line argument made again by the
same citation.

**Already false, first: `src/ui/hud/hud.ts`, and the count as well as the
numbers.** §5's ADR 0022 entry states the live measurement *"`HudIntent`
declares **eighteen** members"*. It declares **nineteen** at `cfab558`,
counted the way the entry says to count it — `grep -c "readonly kind: '"`
between `export type HudIntent =` and the union's close. The nineteenth is
`dismiss-staff`, added by **#533 at `a8a446e`**, which is in the *previous*
window; `git show <sha>:src/ui/hud/hud.ts` puts the member on `e1813b7` and
not on `82ae630`. **The previous pass had that pull request in front of it and
recounted the wrong union**: its own header records #533 moving the command
union from thirteen to fourteen, in the same paragraph, and did not recount
the intent union the same change extended. Three of that entry's member
anchors were stale by the same window or an earlier one and are re-derived
here: `arm-build-tool` `:429-434` → **`:444-449`**, `cancel-build-order`
`:471` → **`:486`** and `arm-room-tool` `:561-566` → **`:598-603`**. The first
two were exact at `4ace2da`/`85c1c29` and one line out from `82ae630`; the
third was **twenty-three lines out at `e1813b7`**, moved by #533 as well. The
count *"three of them room-related"* holds — `dismiss-staff` is not a room —
and that is the half of the sentence worth keeping.

**Already false, second: `src/simulation/rooms/zoning.ts`, stale across five
anchors.** §5's ADR 0023/0028 entry gives the `RoomZoningService` capacity
collaborator as declared at `:398` and called at `:567`, the zeroes `register`
writes at `:560-562` and the comment above them at `:556`. All four are the
`bb3a01e`-through-`07add3e` values; **`7d81040` (#499) moved them inside the
`07add3e..01974e5` window** and they have been carried unchanged through
`01974e5`, `33510df`, `4ace2da`, `85c1c29`, `82ae630` and `e1813b7`. At
`cfab558` the declaration is **`:428`**, the call **`:607`**, the zeroes
**`:600-602`** and the comment **`:596`** — and `git show` puts them at those
values on every one of those six trees, so nothing in *this* window moved
them. The entry already says these numbers *"have now been wrong at three
successive anchors"* and that they are *"an aid rather than the citation"*;
the sentence is right about the shape and now understates the run, so the
number in it is corrected too. The two zoning anchors the entry cites for the
enclosure refusal, `:217` and the quoted comment at `:255-256`, were opened
and both still land.

**Seven intersecting citations survived unchanged, every one opened rather
than rested on the diff.** `src/ui/hud/build-panel.ts` still says *"7.8px is
the entire budget"* after a 48-line change; `src/ui/hud/messages.ts` still
says ADR 0017 is Accepted and still names no currency after a 17-line change;
`src/simulation/presentation/room-projection.ts` still reads an over-capacity
room as full at 100 % (its two edits in this window replace *"a V4 save"* with
the post-#559 wording and touch nothing this file cites);
`tests/foundation/unconsumed-command-contract.test.ts` gained sixteen lines
**below** everything cited, so `AWAITING_PRODUCER` is still declared at
`:224` with its gate comment at `:250` and **still empty**;
`docs/research/README.md` gained one table row and §6's *"deliberately left"*
bullet rests on the rule that file states rather than on the table.
`src/simulation/protocol/commands.ts` and `src/simulation/economy/income.ts`
are outside this window and were re-grepped anyway: fourteen `type: z.literal`
hits with `simulationCommandSchema` still at `:542`, and no `Proposed` count
in `income.ts` at all.

**`docs/adr/README.md` moved one line this file cites by value.** **Next free
number** went **0074 → 0075** with 0074's row, and the Proposed row count went
26 → 27; every other citation this file makes into the index by number sits
inside a preserved record of a superseded claim and is left as it stands.

**The two live `verified at` claims were re-run rather than carried.** Neither
`supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 53 files. The migrations directory still holds twenty-three files;
the retention grep still returns exactly one hit and it is still
`20260826130000_server_stamp_updated_at.sql:68`, prose rather than a
mechanism; all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`, `:178`,
`:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were opened
and still land. Both claims are re-anchored to `cfab558`.

**The four places that count §2 were swept and all four agree at six** — this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Six
entries"*, and §5's preamble's *"SIX at #571"*. **They agree at seven since
#585**, which filed ADR 0071's open-area amendment as its own commit and moved
the three that carry a number with it; this sentence records what the sweep
found at `cfab558` and is left standing rather than restated, because the
anchor is the whole of what makes it readable. **This is the first window in
the series in which an entry was filed *and* the four places did not split**,
and the mechanism is the one §5's preamble names: `9f0096c`/#574 was a commit
whose only job was to file ADR 0074's entry, so it had nothing else to think
about and moved all four together. The observation now has two instances
rather than one, and it is still an observation: the split has never been
tested against an implementing change since the rule was restated, because no
implementing change has filed an entry since #485.

**The previous anchor's findings, kept as a record. The paragraphs below are
that pass's, including its own four-place sweep, which found all four agreeing
at five.**

**Two entries had drifted, and one is the telemetry bullet in §5 for the second
consecutive anchor.** Its `src/main.ts` anchors moved as before -- uniformly two
lines through the import and doc-comment region, and 92 at the consent mount,
which is the file's entire growth in this window -- and they are corrected in
place below, in both directions. **The movement is not the finding.** The
parenthesis reading *"the consent prompt is not mounted either
(`src/main.ts:185-188`, and `:2598` ... both gate on `telemetry.enabled`)"*
named two ranges, and at `82ae630` **neither of them was a gate**. `:185-188`
was doc-comment prose four lines above the `const crashReporter =
telemetry.enabled === false` expression, which was at `:194-197`; and `:2598`
was a doc comment about `AutosaveScheduler` -- unrelated code, seventy-two lines
above the `if (telemetry.enabled && appRoot !== null)` at `:2670`. That second
number is the *mount span's* value from the anchor before last, left behind when
the mount was renumbered and the gate beside it was not. So this citation did
not go stale in this window: it was already naming the wrong code on the tree
that wrote it, which is the class the header calls a claim already false when
the window opened, found now for the third consecutive anchor. Both are
re-derived by symbol here -- `src/main.ts:196-199` and `src/main.ts:2762` -- and
the one anchor in that bullet which has still never moved,
`src/ui/telemetry-consent-prompt.ts:8`, is the argument for citing by symbol
rather than by line, made for the fifth time by the same bullet.

**The second drift is the command union in §5, and it is an ordinary one.** It
counted **thirteen** members and put the `simulationCommandSchema` declaration
at `src/simulation/protocol/commands.ts:493`. #533 added `DismissStaff`, so the
count is **fourteen** and the declaration is at `:542`;
`grep -c "type: z.literal" src/simulation/protocol/commands.ts` returns 14. The
fourteenth landed with its producer in the same change, so `AWAITING_PRODUCER`
in `tests/foundation/unconsumed-command-contract.test.ts` is still empty --
that declaration has moved from `:204` to `:224` and its gate comment from
`:230` to `:250`, both re-derived by opening the file.

**Four intersecting citations survived unchanged.** ADR 0025's withdrawn
`3.9px` is still absent from every ADR, every `.css` file and all of `src/`;
`src/ui/hud/messages.ts` and `src/ui/hud/projection.ts` still say ADR 0017 is
Accepted and still name no currency; and `docs/HUD_PROJECTIONS.md` gap 13 still
opens *"Object placement exists, and `minQuantity` is counted"*. **The entry
that retired its line number in favour of the quotation is the one that needed
no work at this anchor** -- gap 13 has moved to `:879` and nobody had to notice
-- which is recommendation 1 at the foot of §6 paying for the second time.

**The two live `verified at` claims were both re-run rather than carried.**
Neither `supabase/migrations/` nor `.github/workflows/` appears anywhere in this
window's 80 files. The migrations directory still holds twenty-three files; the
retention grep still returns exactly one hit and it is still the comment rather
than a mechanism; and all six SQL anchors (`:45`, `:71-73`, `:91`, `:150`,
`:178`, `:188`) and all four workflow anchors (`:33`, `:34`, `:41`, `:65`) were
opened and still land.

**The four places that count §2 were swept and all four agree at five** -- this
header's paragraph, the title (which states a subject and no count, and is
therefore the only one that cannot rot this way), §2's own heading *"## 2. Five
entries"*, and §5's preamble's *"FIVE at `07add3e`"*. No decision was filed or
accepted in this window, so there was nothing to split them. An agreeing sweep
is a weaker result than a catching one and is recorded because the paragraph
naming the four places asks for it either way.

**The recommendation this series has now made six times running is a scheduled
read rather than a warning band, and it has now failed to be taken six times.**
This window says something the last five could not. The previous pass was
dispatched early and on purpose, with headroom, exactly as the recommendation
asks -- and it still counted on the wrong tree, because **dispatching early does
nothing about what gets re-read.** The delta method covers the citations; the
counts in the header are not citations, nothing in the method reaches them, and
no amount of scheduling would have.

**The previous anchor's account, kept.** It read: *"Re-anchored at `main` @
`82ae630` (**v0.0.195**) by the delta method this
header describes, from `85c1c29` (v0.0.187). **Dispatched at eight of the ten
releases the budget allows, with four pull requests already green and waiting**
-- merging them would have reached ten and the release after that would have
been eleven, so this pass is the first in the series dispatched *because a queue
was about to spend the budget* rather than on a schedule or at the bound."* Its
window was the largest this file has measured, 70 files and eight merges, its
delta intersection was ten of 41 and it re-read eight entries, and it reported
**one** drifted entry -- the telemetry bullet -- and seven survivors. That
tally stands as it was written: the second drift found here, the command union,
was created by #533 *inside this* window and was not available to it, and the
count error above is in the header rather than in §§3-6 and so is outside what
its intersection could reach.

**The anchor before that, kept -- v0.0.187.** It read: *"Re-anchored at `main` @
`85c1c29` (**v0.0.187**) by the delta method this
header describes, from `4ace2da` (v0.0.177)."* **This is the first re-anchor
dispatched at the bound rather than with headroom**, and the distinction is
the finding rather than the arithmetic: ten of the ten releases the budget
allows, so
`tests/foundation/adr-status-queue-anchor-contract.test.ts` passes at this
tree and the *next* release commit breaks it. The three passes before this
one were each dispatched at seven of ten and each recorded that a scheduled
read, not a warning band, is what the series needs; **that recommendation has
now failed to be taken four times running**, and this window is the evidence
that "dispatch early while green" is not self-sustaining either — two of the
three early dispatches were followed by a window that spent the whole budget.
`85c1c29` is `origin/main`'s tip at the time of writing and is itself the
**v0.0.187 release commit** — named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: this release commit is
cut *after* the last merge in the window (#541, `89da98f`), contains every
sentence below, and is the exact tree every citation here was re-derived from.
One commit in the window, `b73ea41` (#521), is the previous anchor's own
re-anchoring pass — it wrote the paragraph this one now supersedes and is not
separately re-read as new drift, because its content *is* the previous
anchor's account, already kept below. **Recorded because a reader will find it
in `git log` and wonder**: that pass declared its anchor `4ace2da`, which is
*earlier* than `b73ea41`, the commit that wrote it. That is this file's
standing convention rather than a defect — the anchor names the tree the
reading was taken against, and the branch merges afterwards — but it means the
window this pass measures, `4ace2da..85c1c29`, contains the previous pass's own
writing commit, exactly as the last three windows did.

**The previous anchor's account, kept.** It read: *"Re-anchored at `main` @
`4ace2da` (**v0.0.177**) by the delta method this
header describes, from `33510df` (v0.0.170). This is the second consecutive
re-anchor dispatched deliberately with the gate green and headroom to
spare — seven of the ten releases the budget allows, the identical margin
the previous anchor was dispatched at — rather than in response to a fail or
right at the bound; the previous anchor's own recommendation was a scheduled
read rather than a warning band, and this pass is that recommendation taken a
third time. `4ace2da` is `origin/main`'s tip at the time of writing and is
itself the **v0.0.177 release commit** — named deliberately rather than the
merge commit beneath it, for the reason every previous anchor gives: this
release commit is cut *after* the last merge in the window (#519, `f43e98b`),
contains every sentence below, and is the exact tree every citation here was
re-derived from. **Two release bumps for one merge, recorded because a reader
will find it in `git log` and wonder**: `v0.0.176` (`6ae2cb6`) and `v0.0.177`
(`4ace2da`) are consecutive commits with no merge between them, both
immediately after #519 on `git log --first-parent`. The version workflow ran
twice for one merge rather than once; this header already treats a release
bump as a commit that "starts no CI run" and is not guaranteed 1:1 with a
merge, so the release count below is read from the tag on the tip rather than
from counting bump commits, and is unaffected either way. One commit in the
window, `d61df4e` (#510), is the previous anchor's own re-anchoring pass — it
wrote the paragraph this one now supersedes and is not separately re-read as
new drift, because its content *is* the previous anchor's account, already
kept below."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`33510df` (**v0.0.170**) by the delta method this header describes, from
`01974e5` (v0.0.163). This is the first re-anchor dispatched deliberately with
the gate green and headroom to spare — seven of the ten releases the budget
allows — rather than in response to a fail or right at the bound; the
previous anchor's own recommendation was a scheduled read rather than a
warning band, and this pass is that recommendation taken a second time.
`33510df` is `origin/main`'s tip at the time of writing and is itself the
v0.0.170 release commit — named deliberately rather than the merge commit
beneath it, for the reason every previous anchor gives: this release commit
is cut after the last merge in the window (#509, `795ba81`), contains every
sentence below, and is the exact tree every citation here was re-derived
from. One commit in the window, `15a8df6` (#501), is the previous anchor's
own re-anchoring pass — it wrote the paragraph this one now supersedes and is
not separately re-read as new drift, because its content is the previous
anchor's account, already kept below."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`01974e5` (**v0.0.163**) by the delta method this header describes, from
`07add3e` (v0.0.152). This is the first re-anchor the gate itself refused to
pass: eleven releases since the previous anchor against a budget of ten,
failing `tests/foundation/adr-status-queue-anchor-contract.test.ts` with "11
releases of history that no entry in that file has been read against" — the
exact failure mode the previous three anchors were each dispatched to
pre-empt and the fourth did not arrive in time to. `01974e5` is `origin/main`'s
tip at the time of writing and is itself the v0.0.163 release commit — named
deliberately rather than the merge commit beneath it, for the reason the
previous anchor gives: this release commit is cut after the last merge in the
window (#500, `1f3b227`), contains every sentence below, and is the exact tree
every citation here was re-derived from."*

**The anchor before that one, kept.** It read: *"Re-anchored at `main` @
`07add3e` (**v0.0.152**) by the delta method this header describes, from
`c00b641` (v0.0.143). This is the first re-anchor taken while the gate was
green — 0.0.152 against an anchor at v0.0.143 is nine of the ten releases the
budget allows, so one more release would sit exactly on the bound and two
would break it — and it was dispatched deliberately for that reason rather
than because anything had gone red. The previous pass ended by recording that
what finds the real errors here is not a diff and that nothing schedules the
read; this pass is that recommendation taken once, and it is evidence about it
rather than about the constant. `07add3e` is `origin/main`'s tip at the time
of writing. It is the v0.0.152 release commit, which this header elsewhere
warns against naming — but the warning is about a release commit cut before
the branches it warrants merged, and this one is cut after the last merge in
the window (#486, `3989bb6`), contains every sentence below, and is the exact
tree every citation here was re-derived from. Naming `3989bb6` instead would
have spent a release of budget on arrival for nothing."* **And the recommendation
it was evidence for did not get taken**: nothing scheduled the next read, and
the budget was spent by release bumps rather than by anyone choosing to wait —
v0.0.162 sat exactly at ten of ten, one bump before the fail, and nothing ran
the gate there either, because as this header has recorded twice before every
merge spends a release whether or not anyone reads this file and the release
commit that spends it starts no CI run. So this re-anchor is the failure mode
the previous three anchors were each dispatched to pre-empt, arriving anyway.
The header's own recommendation — a scheduled read, not a warning band,
because a band still ties the read to a counter and the counter was never
what was wrong — is now evidence against "once" being enough: it was tried
once, the very next window crossed the budget regardless, and nothing about
that outcome is a property of the constant.

`git diff --name-only c00b641..07add3e` reports **122 files**; **fourteen
intersect the declared set** — `package.json`, `docs/HUD_PROJECTIONS.md`,
`docs/adr/README.md`, ADRs **0022**, **0029** and **0054**,
`src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/rendering/world/environment-art.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/prisoners/release.ts`,
`src/simulation/worker/state-machine.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/integration/object-placement-loop.test.ts` — with **no migration**.
`docs/adr/STATUS-QUEUE.md` itself changed twice in the window and is not in its
own set, which is the fact the sweep above exists to cover. **Nine releases
carrying nine merged pull requests**: #480, #475, #476, #481, #482, #483, #484,
#485 and #486, read off `git log --oneline --first-parent c00b641..07add3e`.

**The brief this pass was given named the `.assetsignore` deployment gate as
part of this window's content, and it is not**: `git log -S'.assetsignore'`
returns exactly one commit, `a532032` (#474), which is in the *previous* window
and which §4 already records. The same cheap check that has corrected the brief
at each of the last two anchors corrected it again. The rest of the brief's list
holds — ADRs 0059 (#485), 0061 (#484), 0062 (#482) and 0063 (#486) all landed
here, as did the source-comment extension to
`tests/foundation/documentation-links-contract.test.ts` (#483), and that last
one **discharges a handover §5 had repeated for eleven releases**.

**The previous anchor's delta note, kept as a record.** It read: *"`git diff
--name-only bb3a01e..c00b641`
reports **82 files**; **eight intersect the declared set as it stood before this
commit extended it** — `package.json`, `docs/DEPLOYMENT.md`,
`docs/adr/README.md`, `src/main.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/construction/definition.ts`, `src/simulation/protocol/types.ts`
and `src/ui/hud/hud.css` — with **no ADR in the declared set touched** and **no
migration**. **Three more intersect the omissions this pass derived from the
document itself**: `docs/AGENT_WORKFLOW.md` and ADRs **0042** and **0048**, so
eleven files were read rather than eight. Eleven releases carrying **eleven**
merged pull requests: #463, #464, #465, #466, #467, #468, #469, #471, #472, #473
and #474, read off `git log --oneline --first-parent bb3a01e..c00b641`.
`c00b641` is `origin/main`'s tip at the time of writing and is a merged commit,
not a branch tip; #475 and #476 were open and unmerged when this reading was
taken and are **not** in it."* Both of those merged in the window above.

**The previous anchor's delta note, kept rather than deleted, because the two
windows are the same length and the intersections differ by a factor of three.**
It read: *"`git diff --name-only 54418b6..bb3a01e` reports **337 files**;
**twenty-nine intersect the declared set below** — seventeen named files, twelve
ADRs (0002, 0008, 0010, 0012, 0013, 0015, 0017, 0022, 0025, 0026, 0028, 0029)
and **no new migration**. Eleven releases carrying **eleven** merged pull
requests: #447, #450, #452, #453, #454, #455, #458, #459, #460, #461, #462."*
This window landed almost entirely in `src/simulation/`, `src/ui/` and `tests/`,
where §§3-6 cite little. **The brief this pass was given named #455, #458, #459
and #462 as its content: all four are in the *previous* window**, and
`git log --first-parent` is the cheap check that says so — the same check the
previous pass recorded for the same reason.

**What this delta did to §§3-6, and which check found which, because the three
checks still do not find the same things.** Ten corrections and one discharge,
split by source:

**From the fourteen-file intersection**, seven, and this is the reverse of the
previous pass: **six of the seven are code anchors, and the counts they carry
all held.** `src/simulation/worker/state-machine.ts` moved five at once —
the `WorkerState` union (`:33-39` → `:34-40`), the four `transition()` sites
(`:664`, `:799`, `:834`, `:1110` → `:671`, `:860`, `:895`, `:1171`) and the two
handshake receivers (`:681`, `:711` → `:697`, `:727`) — while the count stayed
four, the four target states stayed the same, `'ready'` stayed unreachable and
`protocol/handshake` still returns **nine** hits in `src/` split exactly 4/2/3.
`src/simulation/prisoners/intake-system.ts` moved two (`:403`, `:409` →
`:442`, `:448`, #484's contraband-at-intake stage);
`src/simulation/prisoners/release.ts` moved one (`:156` → `:194`);
`src/persistence/save-schema.ts` moved one (`:1164` → `:1182`); and ADR 0022's
*"÷ 12.2 is 23.9"* moved one (`:582` → `:588`, #481). The seventh is not a
number: `docs/adr/README.md` gained four `Proposed` rows, which falsified the
*"thirteen"* figure in §3, in §5's first bullet and in §6's `income.ts` bullet
(**seventeen**, in all three places) and moved §5's *"one of the thirteen has a
§2 row"* to **two of seventeen**.

**From the same intersection, one claim withdrawn and one handover discharged**,
both in §5's `environment-art.ts` bullet and both caused by #483. That bullet
said the documentation-links gate *"rejects a rooted path that is not on disk,
with no allowlist"* and *"reads `docs/`, `README.md` and `.github/` and not
`src/` comments, which is why the comment shipped"*, and it closed *"Whether the
gate should scan `src/` comments is a decision, not an edit."* **The decision was
taken and the edit made**: the gate now runs the rooted-path check over comments
in `src/`, `tests/`, `tooling/`, `scripts/` and `benchmarks/`, it does carry an
allowlist keyed on the path/citer pair, and the dead name in
`src/rendering/world/environment-art.ts:24` is corrected — the comment names
`tests/unit/environment-art.test.ts` and records the old name below it. So the
handover is closed rather than repeated for a twelfth release.

**From the four-place queue sweep**, one, and no diff could have reached it:
§2's heading has said *"Five entries"* since #485 while this header's opening
paragraph and §5's preamble both still said four. **Same drift, same two places,
nine releases after the identical one #467 caused** — which makes the header's
prediction confirmed rather than merely stated.

**From deriving the set against the document**, nothing missing and one addition
required by this pass's own corrections. Both scans were re-run; the results and
the commands are under *"How to extend this anchor cheaply"* below. The
bare-number scan surfaced 0030, 0038, 0039, 0040, 0041, 0055 and 0058, and
**every one of them is a number inside a claim about `docs/adr/README.md`'s
next-free line rather than a citation of an ADR document**, so none is a member;
that file is already in the set. The four ADRs this pass's corrected counts now
name — **0059, 0061, 0062, 0063** — are added below in this commit, which is the
rule the subsection states.

**What the pass is structurally blind to, stated because the arithmetic above
reads like coverage.** The intersection is fourteen files out of 122, and a
delta pass can only find a claim that a file in the set falsified *during* the
window. It cannot see a claim already false when the window opened, and it
cannot see a file contradicting itself — which is the class two of this pass's
findings belong to. It also cannot see anything in §§3-6 that rests on a file
the set does not name, which is why the derivation is run first and not last.

**Every rooted `file:line` in §§3-6 was re-derived mechanically at `07add3e`**
— extract each backticked `path:N` span, resolve it, open the file, print the
line — over **sixty** rooted anchors plus the bare `:N` continuations §6
enumerates. **Nine moved, all nine in files the intersection had already named,
and every count they carry held.** The untouched half was spot-read rather than
rested on and produced nothing this time, which is the first pass at which it
has not.

**The previous anchor's account, kept as a record. The three sub-paragraphs
below are that pass's, verbatim.** It read: *"Six corrections,
split by source:

**From the eleven-file intersection**, four. `docs/adr/README.md` gained four
ADR rows, which falsified three claims in one go — the *"nine `Proposed`"*
figure in §3, in §5's first bullet and in §6's `income.ts` bullet (**thirteen**,
in all three places); §5's *"not one of them has a §2 row"* (**withdrawn**, and
it goes the other way for once: ADR 0056 arrived with its row); and §5's *"Four
became thirteen"* (sixteen). It also moved that file's **Next free number** line,
which falsified §5's *"That file now states **0038** as next free"* — it states
0058 now, and `git show bb3a01e:docs/adr/README.md` states **0053**, so that
*correction* was **already false on the tree it was written against**.
`src/main.ts` and `docs/DEPLOYMENT.md` moved three code anchors:
`:2494-2499` → `:2506-2511`, `:2494` → `:2506`, and the six-row deployment
table `:145-152` → `:198-205`.

**From the four-place queue sweep**, one, and no diff could have reached it:
§5's preamble said *"§2 holds three entries"* while §2's own heading has said
four since #467. That is the header's predicted drift, caught by the check the
header prescribes.

**From deriving the set against the document**, one: the list itself said
`services/telemetry/**` is *"thirteen modules"* and it is **fifteen**, and has
been since before the previous anchor.* Re-counted at `07add3e`:
`git ls-files src/services/telemetry` still returns fifteen.

**And that pass's closing sentence did not survive nine releases**, which is
worth recording where it stands rather than only in §6. It read: *"this is the
first pass at which the counts, not the numbers, were the damage"*. At
`07add3e` the numbers are the damage again — nine of them — and the counts are
the half that held: thirteen commands, eighteen `HudIntent` members, nine
handshake hits split 4/2/3, four `.css` files, 39 object ids in two files, 27
amendment sections across 16 ADRs, twenty-three migrations and fifteen telemetry
modules were all re-derived and none moved. Only the `Proposed` tally did. **So
the two passes are opposite cases and neither is the general rule**, and the
durable statement is the one recommendation 1 already makes: a code anchor is
checked by grep and a prose count is not, so the first is worth carrying and the
second is worth deriving.

The previous pass's paragraph, kept: every other rooted `file:line` in §§3-6 was
re-derived mechanically and
**landed** — including the four `transition()` sites in
`src/simulation/worker/state-machine.ts`, which had moved at each of the three
previous anchors and did not move here. **So this is the first pass at which the
counts, not the numbers, were the damage**, which is the reverse of every
previous pass and is what §6's recommendation 1 was for. It is also the third
consecutive pass to find a claim that was already false when its window opened,
and this time two of them were.

**The previous delta, `54418b6..bb3a01e`, touched a great deal that §§3-6 depend
on, and the sentence this header warns about would have been false.** Reading the intersection withdrew
**three** claims outright, overtook **four** more as done-elsewhere, retired
**fourteen** prose citations in favour of quoted sentences, and re-anchored every
code citation in §§3-6 against `bb3a01e`. What was withdrawn: §5's *"the telemetry layer is
inert"*, §6's *"no ADR in the directory is `Proposed`"* (nine are), and §5's
*"exactly one file, and for exactly one reason"* about object ids outside
`src/content/`.

**And the set was still incomplete, which is the finding *this* pass exists to
report — the second consecutive pass to find it, by a wider derivation than the
last one used.** The previous pass extracted every backticked *path* in §§3-6.
That misses an ADR cited as a bare number, which is how §§3-6 usually cite one,
so this pass extracted every backticked path **and** every bare `00NN` token in
§§3-6 and diffed both against the list. It found **twenty-two** members the list
had never named: eleven files — `AGENTS.md`, `docs/AGENT_WORKFLOW.md`,
`docs/research/README.md`, `src/persistence/save-schema.ts`, `src/ui/tokens.css`,
`src/ui/brand.css`, `src/ui/primitives/primitives.css`,
`tests/foundation/adr-numbering-contract.test.ts`,
`tests/foundation/adr-status-queue-anchor-contract.test.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/unit/environment-art.test.ts` — and eleven ADRs: **0007**, **0014**,
**0032**, **0033**, **0042**, **0043**, **0047**, **0048**, **0049**, **0051**
and **0052**. Nine of those eleven ADRs are the very documents §5's first bullet
and §6's `income.ts` bullet count, so the pass that wrote those bullets cited
nine ADRs and listed none of them. **Three of the twenty-two changed in this
window** — `docs/AGENT_WORKFLOW.md`, ADR 0042 and ADR 0048 — and reading them is
why the four quoted `docs/AGENT_WORKFLOW.md` sentences in §§3-6 could be
confirmed still verbatim and why 0042's and 0048's statuses could be reported as
unmoved rather than assumed. **And one entry in the list was wrong rather than
missing**: it says `services/telemetry/**` is *"thirteen modules"*. It is
**fifteen**, and `git ls-tree bb3a01e` returns fifteen too, so that count was
wrong when it was written and not overtaken. A dependency set is a claim like any
other and rots the same way.

**Also not in the set, and left out deliberately rather than missed:** ADR
**0020**, which changed in this window and which §2 cites (ADR 0056 amends its
Ordered Command Queue). The set's stated scope is §§3-6 and nothing in §§3-6
cites 0020, so adding it would widen the rule rather than complete the list.
Recorded here because the next reader will find it in the diff and wonder.

**The previous pass's finding, kept:** the enumerated set did not cover the
`54418b6..bb3a01e` delta either. §§3-6 cite **fourteen** files the set did not list,
and **nine of them changed in this window**: `src/main.ts`, the thirteen modules
under `src/services/telemetry/`,
`src/persistence/session/session-controller.ts`,
`src/simulation/protocol/transferables.ts`, `src/ui/hud/hud.css`,
`tests/integration/object-placement-loop.test.ts`,
`tests/unit/actor-identity.test.ts`, and ADRs **0003** and **0006**. The largest
falsification in this pass is in two of them, and the intersection would never
have put either in front of a reader. So the delta note is not merely a claim
that has to be checkable — **on a stale set it is checkable and wrong**, which is
a worse failure than not writing one. The set is completed below and the rule
that keeps it complete is restated where it binds.

**What the previous pass found, and the shape it found it in**, kept because the
ratio is the argument for the rewrite §6 closes with. Every one of the seven
falsified citations was a *line number*, and not one of the sentences those
numbers point at had changed: the command union still discriminates thirteen,
`state-machine.ts` still makes exactly four `transition()` calls and still
targets `'ready'` from none of them, and `protocol/handshake` still has exactly
nine occurrences in `src/`, all of them the receiver or the schema. That was the
third consecutive pass to report the same ratio, and this file had by then said
three times that **a `file:line` into a file under active edit is its least
durable citation and a quoted sentence is its most.** §6's closing paragraph
carries the proposal that followed.

**The fourth pass stopped saying it and started doing it.** Where an entry in
§§3-6 cites *prose*, this re-anchor re-cites it by section title and quoted
sentence and drops the number; where it cites *code*, the number stays and is
re-anchored to `bb3a01e`, because grep checks a code anchor and nobody re-reads a
prose one. That is recommendation 1 at the foot of §6, applied rather than
re-proposed, and it is why this pass corrects fewer numbers than the last three
while opening more files. The one class deliberately left as numbers is a table
row, which a quotation cannot name uniquely.

The one claim of substance *that* delta falsified was §4's, and it was the one
this file had singled out as *not* having moved: `.github/workflows/migrate-database.yml`
and `docs/DEPLOYMENT.md` were both edited by #423 at `4f738ae` (v0.0.116), which
ends the "twenty-one releases without moving" that §4 recorded as its outcome.
The constraint §4 watches is intact — every mechanism citation was re-read and
still lands — but the sentence asserting the *absence* of movement is exactly the
shape this corpus keeps finding rots first, and it rotted five releases after it
was written.

Two claims the delta *could* have falsified and did not, carried forward and
re-checked at this anchor: `AWAITING_PRODUCER` is still empty
(`tests/foundation/unconsumed-command-contract.test.ts:204`, whose whole body is
a comment beginning *"**Empty, and that is a first.**"*), and `minQuantity` is
still unchecked (`src/simulation/rooms/requirements.ts:19` and
`src/simulation/presentation/room-projection.ts:74` both still say so). Both
files are in the set; both were read rather than assumed.

**Why that anchor moved twice in one day, and it was not carelessness.** Every
merge triggers a `Version` bump in a commit of its own that starts no CI run, so
nine merges spent nine releases of budget without any of them running this gate.
The budget was crossed by release bumps, not by unread history — but the fix is
the same either way, because the releases are real and the entries had genuinely
not been read against them.

**Observed at `07add3e`, and it is the one thing this pass can say about #449
that the previous four could not: the gate was green.** It stood at nine of ten
with two releases of headroom, and this re-anchor was dispatched anyway. That
makes this the first data point in the series taken outside the failure mode —
every earlier pass ran because the gate had already blocked every branch in the
repository — and what it measured is that **the read still found ten
corrections, a withdrawn claim and a discharged handover.** Two of the eleven
were unreachable by any diff. So the read was not made cheap by being early;
what being early bought was that nobody else was blocked while it happened.
**That is evidence for the scheduled-read shape of answer and against the
warning-band shape**, because a band still ties the read to the counter and the
counter is not what was wrong — but it is evidence, not a decision, and the
decision is the owner's. **Nothing here changes the unit or the constant.**

**And the unit itself got a second clean measurement.** #449's weakest claim is
*"that 169 commits is the right measure of 'unread history' for this file"*.
Three consecutive windows have now been run by the header's own method:
`54418b6..bb3a01e` was eleven releases, 209 commits, 337 files, twenty-nine in
the set; `bb3a01e..c00b641` was eleven releases, 22 commits, 82 files, eight;
`c00b641..07add3e` is **nine releases, 22 commits, 122 files, fourteen in the
set**. So across three adjacent windows a release bought 19, 2 and 2.4 commits
and 30.6, 7.5 and 13.6 files. **The release count and the quantity a re-read has
to spend are still different quantities**, and the third window says something
the second could not: a window with the *same* commit count as its predecessor
produced **half again as much** to read, because what matters is which files the
commits touched and not how many there were. A budget denominated in releases
cannot see that, and neither can one denominated in commits.

**Observed at the previous anchor and recorded rather than acted on, because the
constant is not an editor's to move (issue #449).** The gate went from green to
blocking **every branch in the repository** with nothing in between for the
second consecutive time: it is measured against `package.json`, every merge cuts
a release, and the release commit starts no CI run — so the first run that sees
11 is a run on somebody else's unrelated branch. There is no state between "in
budget" and "everyone is red", and nothing schedules the read that would keep it
from arriving. Two shapes of answer exist and both are the owner's: a visible
band below the hard bound, or a scheduled read that does not wait for the gate.
**Neither is a change to the number**, which is what the budget is for.

**And this anchor is evidence about the unit, which is the open half of #449.**
That issue's weakest claim, in its own words, is *"that 169 commits is the right
measure of 'unread history' for this file"*, and it names the test:
*"running the header's own delta method and finding the intersection is
genuinely small"*. Two consecutive windows of **exactly eleven releases each**
have now been run by that method: `54418b6..bb3a01e` was **209** commits, 337
files, **twenty-nine** in the set; `bb3a01e..c00b641` was **22** commits, 82
files, **eight**. So a release bought nine times as much history in one window
as in the next, measured on adjacent windows of the same declared length, which
is #449's point demonstrated rather than argued. The intersection **is**
genuinely small in the second — eleven
files read, exactly what #449 asked to see. **And it still missed everything
that mattered.** The four real errors this pass corrected were a paragraph
disagreeing with a heading in the same file, a correction that was false on the
tree it was written against, a count in three places, and a dependency list that
had never been complete — **none of them reachable from any diff of any size**,
because none of them is a change to a file. That is a finding about the unit and
not a proposal: the quantity a budget can measure and the quantity a re-read has
to spend are different quantities, and this window is the clean case where the
first was small and the second was not.

**This anchor is the opposite case and it is worth naming, because the same gate
fired for the opposite reason.** Eleven releases carried eleven merged pull
requests, every one of them real work: six owner decisions settled as ADRs
0042-0047 with a live privacy defect fixed (#447), riots (#450), a rendered
staffing warning (#452), recurring wages and arrears (#455), a sentence that ends
(#458), a prisoner roster and a Regime panel (#459), a command answered while the
clock is paused (#460) and a renderer that reads the shipped source art (#462).
The budget was spent on **history nobody had read**, which is what it is for.
Three of those eleven — #447, #450 and #452 — were missing from the brief this
pass was given, and #447 alone carries the two largest falsifications below; the
count came off `git log --first-parent`, which is the cheap check that finds
them.

**Something the last anchor got wrong, recorded because it is structural rather
than careless.** This line named `54418b6`, which is the **v0.0.121 release
commit** — and `git log --oneline -- docs/adr/STATUS-QUEUE.md` shows eight
commits editing §§2, 5 and 6 *after* it, all eight inside #447 — `513cdfc`,
`4297c73`, `ab33903`, `906077e`, `374065b`, `674266e`, `002e118`, `ceaa265`,
which is the whole of `git log 54418b6..bb3a01e -- docs/adr/STATUS-QUEUE.md`. So the
declared anchor was once again **older than parts of the document it warranted**,
which is the exact defect
`tests/foundation/adr-status-queue-anchor-contract.test.ts` was written for and
which no assertion in it can see: the sha is well-formed, the version is in
budget, and the file is still ahead of its own anchor. An anchor should name the
tree the reading was done against, and a release commit cut before the branch
merged is not that tree. `bb3a01e` is `origin/main`'s tip at the time of writing
and contains every sentence below.

The older warrant, kept because it is still the correct description of the
method: **the warrant is stated
precisely because it is not the same warrant the last two anchors carried**:
§§3-6 were read in full at `83c3121`, and the delta `83c3121..dbe271f` was read
against them by the method under *"How to extend this anchor cheaply"* below. So
every claim below has been read from disk at `83c3121` or later, and every claim
whose evidence the delta touched has been read at `dbe271f`. Entries cite symbols
rather than line numbers where a citation would otherwise drift on the next edit
(the precedent is #309) — and the two anchors' worth of line numbers that drifted
anyway are the argument for doing it more.

**This line said `4e3976d` (v0.0.65) for twelve releases, and the file carried a
second, older anchor underneath it.** Two commits after that re-anchor — #331
and #335 — edited §5 without moving this line, so the file's declared anchor was
older than parts of the file itself. Meanwhile §§3-5 said "re-verified at
`4ed571f`" in five places, and `4ed571f` is **v0.0.58**, seven releases older
again. A reader had two dates to reconcile and no way to tell which entry had
been checked when, which is the failure mode this whole file exists to prevent.
Both anchors are now the same commit, every "re-verified at" below names it, and
`tests/foundation/adr-status-queue-anchor-contract.test.ts` asserts that they
stay one commit and that the version this line names does not fall far behind
`package.json`. That test cannot tell whether a sentence here is true — nothing
mechanical can — but it can tell that the file has stopped being re-read, which
is what actually went wrong.

**And it happened again, which is why that test exists rather than a promise.**
The line above said `cddaebb` (v0.0.77) for eleven releases. Two commits in that
window edited this file — #356, which accepted ADR 0029 and emptied §2, and #367,
which put ADR 0031 in it — and **neither touched §§3-6 or moved the anchor**, so
the declared anchor was once more older than parts of the document it warranted.
This is the first re-anchor the gate asked for rather than a human noticing: it
went red at v0.0.88 with *"11 releases of history that no entry in that file has
been read against"*. §§3-6 were then re-read entry by entry against `83c3121`,
which is the work the budget stands for and not the moving of this line. What
that reading found is recorded where it belongs, and it is not a formality: **six
claims in §§3-6 were withdrawn as false**, three counts in prose were wrong, and
ten `file:line` citations no longer landed where they said. The largest is the §5
entry on ADR 0027, which said that ADR's subject was *"unreachable in any session
a player can start"* — measured here, two prisoners share one cell through four
commands a player sends, so the entry is withdrawn and replaced by the
measurement that refutes it. Two more sentences still turned on ADR 0029 being
unapproved and now name ADR 0031.

**And a third time, ten releases later, on the same day.** That re-read landed at
v0.0.96 and named `83c3121` (v0.0.88) — the release commit its branch was cut
from, which was already eight releases old when the branch merged. **An anchor
moved to a commit that is already old spends most of its budget on arrival**, and
this one spent eight of ten before anyone could read it: the gate stood at exactly
10 with the next release commit — which `.github/workflows/version.yml` produces
after every merge and which starts no CI run — guaranteed to break it. So this
re-anchor is not a second full re-read. It is the **delta** `83c3121..dbe271f`,
read against the dependency set below, and that is the practice this file is
adopting rather than a shortcut taken once.

### How to extend this anchor cheaply, and what it costs to be allowed to

**§§3-6 do not depend on the tree at large. They depend on an enumerable set of
files**, and every claim in them cites one.

**That sentence was true and the list under it was not, and the difference cost
this pass its largest finding.** The list below had **fourteen** omissions on
2026-08-28 — files §§3-6 already cited and the set never named — and nine of them
changed in the `54418b6..bb3a01e` window. They are marked **(added 2026-08-28,
already cited)** where they now sit. The rule at the foot of this subsection was
never broken by a single entry; it was broken by the entries that predate the
rule, and nothing re-reads a list for citations that were already in the file
when it was written. **So the maintenance rule is not enough on its own, and the
check that is: derive the list from the document rather than trusting it** —
extract every backticked path in §§3-6 and diff it against this list. That is one
command and it is what found these fourteen.

**That derivation was itself incomplete, and 2026-08-28's second pass found
twenty-two more by widening it.** A backticked-path scan cannot see an ADR cited
as a bare number, and a bare number is how §§3-6 cite an ADR nine times out of
ten — so the nine `Proposed` ADRs that §5's first bullet and §6's `income.ts`
bullet are *about* were cited without one of them being listed here. **The check
is therefore two scans, not one**: every backticked path **and** every bare
`00NN` token in §§3-6, both diffed against this list. Both are one command each.
The twenty-two are marked **(added 2026-08-28, second pass, already cited)**
below, and the list also carried one entry that was *wrong* rather than missing —
`services/telemetry/**` was described as thirteen modules and has been fifteen
since before the previous anchor.

**Both scans were re-run at `07add3e` and, for the first time, neither found a
member the list had never named.** That is a result and is reported as one
rather than skipped. The commands, so a reader can re-run them: §§3-6 are
`sed -n '1198,2842p' docs/adr/STATUS-QUEUE.md` at `07add3e`; the path scan is
every backticked span in that text with a `/` in it, `:N`/`:N-M` stripped, minus
the directory prefixes and the grep tokens (`protocol/handshake`,
`hud/build-queue`, `services/challenges`, `simulation/status-counts`) that carry
a slash without being paths; the number scan is every `\b00\d\d\b` token. The
path scan returned **89** distinct spans and the number scan **46** tokens.

**What the two scans surfaced that is not a member, recorded because the next
reader will re-derive them and wonder.** From the path scan: `dist/.assetsignore`,
which §4 cites twice — it is a **build output**, produced by the client build and
absent from a checkout, so it cannot be a member of a set whose whole use is
`git diff --name-only`; the sentences citing it are about `docs/DEPLOYMENT.md`
and `#474`, both of which are members. And `docs/adr/STATUS-QUEUE.md` itself,
which is deliberately not in its own set and which the four-place sweep covers
instead. From the number scan: **0030, 0038, 0039, 0040, 0041, 0055** and
**0058**, every one of them a number appearing inside a claim about
`docs/adr/README.md`'s **Next free number** line rather than a citation of an
ADR document. `docs/adr/README.md` is already a member, so the claims those
numbers sit in are covered; the ADRs are not cited and are not added. **A scan
that returns a token is not the same as a citation that creates a dependency**,
and saying which is which is the part of this check that is not mechanical.

**And the sentence that classification licenses — *"neither scan returned a
member the list has never named"* — was written at seven consecutive anchors
and was false at the last two of them.** At `eb1f040` the path scan returns
**78** distinct backticked spans ending in a known extension, **62** of them
files on disk, and one of the 62 is
`docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md`, which §5
has cited since `0637ab1` and which this list had never named until now. The
same span is in the scan's output on the `0637ab1` and `104d078` trees,
re-measured here rather than inferred. The number scan is clean at `eb1f040`
— **65** tokens, **61** naming an ADR that exists, residue 0030, 0055, 0058
and 0072, unchanged. **The check works and the reporting of it did not**,
which is the distinction to carry forward: this subsection's rule asks for the
scan to be *run*, and running it has never been the failing half.

The set, in full:

- `package.json` and `supabase/migrations/**` (§3);
  `.github/workflows/migrate-database.yml`, `docs/DEPLOYMENT.md` and
  `wrangler.jsonc` (§4). `supabase/tests/003_data_api_grants.test.sql` was added
  on 2026-08-27, when §2's third entry began citing the role sweep it holds.
- `docs/CLOUD_SAVE.md`, `docs/TRUSTED_SERVICES.md`, `docs/HUD_PROJECTIONS.md`,
  `README.md`, `docs/adr/README.md` and
  `docs/research/2026-08-25-economy-rate.md` — **and, added 2026-08-28, second
  pass, already cited**: `AGENTS.md` (§5's `environment-art.ts` entry rests on
  its boundary 6), `docs/AGENT_WORKFLOW.md` (§§3, 5 and 6 quote its §4 four
  times, and it **changed in this window**; all four quotations were re-read and
  are still verbatim) and `docs/research/README.md` (§6's *"deliberately left"*
  bullet rests on the rule it states). **Added at `eb1f040`, by the derivation
  scan rather than by the commit that created the citation**:
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` — §5's
  first bullet cites its §8 for the two §2 entries handed over in it. **The
  citation is two anchors older than this membership.** It entered §§3-6 in the
  `0637ab1` pass's own commit, and that pass, and `104d078` after it, each
  reported that neither derivation scan had returned a member the list had never
  named. The scan returned this one on both trees; what failed was reading its
  output, not running it. Recorded here rather than added quietly, because a
  file joining the set silently is the case this subsection's rule is written
  against and a file joining it *twice unnoticed* is a worse one.
- ADRs **0002, 0008, 0009, 0010, 0012, 0013, 0015, 0016, 0017, 0022, 0023, 0025,
  0026, 0027, 0028, 0029, 0031** — and, **added 2026-08-28, already cited**,
  **0003** and **0006** (§5's handshake entry is about both, and both changed in
  this delta), **0024** (the same entry names its deleted implementation note).
  Added 2026-08-28 because entries rewritten at this anchor now cite them:
  **0044**, **0045**, **0046** and **0050**. **Added 2026-08-28, second pass,
  already cited**: **0007** (§5's fourth case is about its amendment), **0014**
  (§6's `README.md` bullet asserts its status), **0032** (§5's first bullet
  rests on its precedent), **0033** (§5 and §6 both make claims about it), and
  the seven `Proposed` documents §5's first bullet and §6's `income.ts` bullet
  count without listing — **0042**, **0043**, **0047**, **0048**, **0049**,
  **0051** and **0052**. Added at the previous anchor because the corrected counts
  then named them: **0053**, **0054**, **0056** and **0057**. **Added at this
  anchor, for the same reason and by the same rule**: **0059**, **0061**,
  **0062** and **0063** — §5's first bullet and §6's `income.ts` bullet now
  enumerate seventeen `Proposed` documents and these are the four that joined,
  and 0059 additionally has a §2 row. 0022, 0029 and 0054 changed in this
  window; all three were opened, 0022's *"÷ 12.2 is 23.9"* line moved from
  `:582` to `:588`, and 0029's and 0054's statuses were re-read and are
  unmoved. **Added at this anchor, for the same reason and by the same rule**:
  **0064**, **0065**, **0066** and **0067** — §3's opening, §5's first bullet
  and §6's `income.ts` bullet now enumerate twenty-one `Proposed` documents and
  these are the four that joined; none of the four has a §2 row. 0029 changed
  in this window too — #491 appended a dated amendment measuring two new
  counters ADR 0041 made countable — and its Status line, `:5`, is unmoved:
  still `Accepted, 2026-08-26`. **Added at this anchor, for the same reason and
  by the same rule**: **0068** — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate twenty-two `Proposed` documents and this is
  the one that joined; it has no §2 row. 0015, 0026 and 0050 changed in this
  window too — #505's entity-retirement work amended ADR 0026 (question 1
  answered), corrected ADR 0015's now-false "ids repeat" claim in place, and
  updated a cross-reference in ADR 0050; all three were opened and re-read. **Added at this anchor, for the same reason and by the same rule**:
  **0069** — §3's opening, §5's first bullet and §6's `income.ts` bullet now
  enumerate **twenty-three** `Proposed` documents and this is the one that
  joined; it has no §2 row either, which is the sixth consecutive time and is
  the finding the sweep above reports. (**That sentence was false when it was
  written, and stayed false for three anchors.** 0069 did join the set and the
  membership rule was applied correctly; what is wrong is the claim about the
  three sections, which all still read *twenty-two* at `85c1c29`, at
  `82ae630`, at `e1813b7` and until this commit. The header's own count moved
  and the three sections' did not, and this maintenance sentence asserted the
  move on their behalf. Corrected in place at this anchor rather than
  overwritten, because a sentence claiming a sweep that did not happen is a
  worse defect than the missed sweep and is the only trace of it.) It is read here only for its `Status`
  line, `Proposed, 2026-08-29. Not self-approved.` **No other member joins at
  this anchor**: both derivation scans were re-run over §§3-6 — every
  backticked path and every bare `00NN` token — and neither returned a member
  the list had never named, which is the third anchor running at which that is
  true and is reported as a result rather than skipped. The path scan returned
  **67** distinct spans and the number scan **55** tokens; those totals are
  **not** comparable with the 89 and 46 the `07add3e` pass recorded, because
  this pass filtered backticked spans to those ending in a known file
  extension rather than stripping directory prefixes by hand, and §§3-6 have
  grown since. What is comparable is the residue, and it is unchanged: the
  path scan's only non-members are `docs/adr/STATUS-QUEUE.md`, deliberately
  outside its own set, and two **grep commands** that carry a slash without
  being paths (`grep -rn "services/telemetry" src/ --include=*.ts` and the
  amendment-heading count over `docs/adr/*.md`); the number scan's only
  non-members are the same seven this subsection already names — **0030,
  0038, 0039, 0040, 0041, 0055** and **0058** — every one still a number
  inside a claim about `docs/adr/README.md`'s **Next free number** line rather
  than a citation of an ADR document. **Added at `cfab558`, for the same
  reason and by the same rule**: **0070**, **0071**, **0073** and **0074** —
  §3's opening, §5's first bullet and §6's `income.ts` bullet now enumerate
  **twenty-seven** `Proposed` documents (this time checked in all three places
  by opening them, which is what the sentence three paragraphs above claimed
  and did not do) and these are the four that joined; 0074 additionally has a
  §2 row, filed by #574 rather than by the commit that wrote the ADR. Each is
  read here only for its `Status` line. **0072 is not a member and is not
  missing**: no such document exists on disk, because the number is held for
  the events-persistence decision. **No other member joins at this anchor**:
  both derivation scans were re-run over §§3-6 — every backticked path and
  every bare `00NN` token — and neither returned a member the list had never
  named, which is the fourth anchor running at which that is true. The path
  scan returned **79** distinct existing spans, of which 18 are bare directory
  prefixes and 61 are files; its only non-member file is
  `docs/adr/STATUS-QUEUE.md`, deliberately outside its own set, and its only
  other residue is the same handful of grep and `git show` commands that carry
  a slash without being paths. The number scan returned **56** tokens, whose
  only non-members are the seven next-free numbers named above. Those totals
  are **not** comparable with the 67 and 55 recorded at `85c1c29` or the 89
  and 46 recorded at `07add3e`, because each pass has filtered the spans
  differently and none of the three states its filter in the sentence that
  gives the number; the residue is what is comparable, and it is unchanged.
  **Added at `53e1405`, for the same reason and by the same rule**: **0075**,
  **0076** and **0077** — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate **thirty** `Proposed` documents and these
  are the three that joined; none of the three has a §2 row, and the header's
  window note decides each of them separately rather than treating them as one
  case. Each is read here only for its `Status` line, and all three read
  `**Proposed, 2026-08-29. Not self-approved.**` at this anchor — re-read on
  disk rather than taken from the index, because **PR #606 is open to move two
  of them to `Accepted`** and a member read off a branch would be a member read
  off a tree this file is not anchored to. **0072 is still not a member and
  still not missing**, for the fifth anchor running: no such document exists on
  disk, the number being held for the events-persistence decision. **No other
  member joins at this anchor**: both derivation scans were re-run over §§3-6 —
  every backticked path and every bare `00NN` token — and neither returned a
  member the list has never named, which is the fifth anchor running at which
  that is true. The path scan returned **79** distinct existing spans, of which
  18 are bare directory prefixes and 61 are files; its only non-member file is
  `docs/adr/STATUS-QUEUE.md`, deliberately outside its own set. **The number
  scan returned 65 tokens and its residue grew by one**: **0078**, which is the
  index's new **Next free number** and therefore the same class as the seven
  this subsection already names — 0030, 0038, 0039, 0040, 0041, 0055 and 0058
  — a number inside a claim about that line rather than a citation of an ADR
  document. It is written down rather than passed over, because the residue
  being *unchanged* has been this subsection's reported result for four
  anchors and this is the first time it has moved; the rule that classifies it
  is unchanged, and a reader re-deriving the list should expect eight
  next-free tokens now rather than seven. Those totals are **not** comparable
  with the 67/55 at `85c1c29` or the 89/46 at `07add3e`, for the reason every
  reading in this sequence gives: each pass filters the spans differently and
  none states its filter in the sentence that gives the number.

  **Added at `0637ab1`, for the same reason and by the same rule**: **0078**
  (what keeps a prisoner safe) — §3's opening, §5's first bullet and §6's
  `income.ts` bullet now enumerate **twenty-nine** `Proposed` documents and
  this is the one that joined; it has no §2 row. It is read here only for its
  `Status` line, `**Proposed, 2026-08-29. Not self-approved.**` **0075 and
  0076 do not leave the set**, and that is the rule rather than an oversight:
  membership is created by §§3-6 citing a document, and both are now cited
  *more* heavily than before — §2's foot records why their handed-over entries
  were never filed, and §3, §5 and §6 each record their departure from the
  `Proposed` count. A document that stops being `Proposed` stops being counted
  and does not stop being a dependency. **0072 is still not a member and still
  not missing**, for the sixth anchor running. **No other member joins**: both
  derivation scans were re-run over §§3-6 — every backticked path and every
  bare `00NN` token — and neither returned a member the list has never named,
  which is the sixth anchor running at which that is true. The number scan's
  residue is unchanged at the eight next-free tokens the paragraph above
  names: 0030, 0038, 0039, 0040, 0041, 0055, 0058 and 0078 — except that
  **0078 has now left that residue by becoming a real citation**, so a reader
  re-deriving the list should expect seven next-free tokens again rather than
  eight. That is the first time a token has moved *out* of this residue, and
  it moved because the number stopped being a prediction and became a
  document.

  **Added at `898a16a`, for the same reason and by the same rule**: **0079**
  (a sentence long enough to be a history, #659) — §3's opening, §5's first
  bullet and §6's `income.ts` bullet enumerate **thirty** `Proposed`
  documents and this is the one that joined; it has no §2 row. It is read here
  only for its `Status` line, `**Proposed, 2026-08-30. Not self-approved.**`
  **The three sections enumerate thirty because this same commit moved them**,
  and that is stated rather than left ambiguous: they read *twenty-nine*
  before it, the value each was checked at is written into this pass's header,
  and this sentence is the one whose ancestors were false at three consecutive
  anchors for claiming a sweep somebody else was supposed to have done.
  **0079 is also the first member to join this list in the same commit that
  creates the citation making it one, in this sequence's recent history**, and
  it is the opposite of what the previous anchor found: that pass added
  `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` two
  anchors after its citation landed, because two passes read a clean residue
  out of a scan output that contained it. Consequently **the derivation scan
  run over §§3-6 at this anchor does not return 0079** — the citation did not
  exist when the scan ran — and the next pass's scan will. That ordering is
  recorded so the next reader does not take the confirmation for a discovery.
  **0072 is still not a member and still not missing** — no such document
  exists on disk, the number being held for the events-persistence decision;
  the consecutive-anchor figure this clause used to carry is dropped for the
  reason §3's opening now gives. **No other member joins**: both derivation scans were re-run over
  §§3-6 — every backticked path and every bare `00NN` token — and neither
  returned a member the list has never named. The path scan returned **79**
  distinct spans ending in a known extension, **62** of them files on disk,
  **59** of those named members and the other three the documented
  exemptions (`docs/adr/STATUS-QUEUE.md`, outside its own set;
  `src/ui/primitives/icon.ts` and one file under `supabase/migrations/`,
  both reaching the set through a directory glob); its residue is **17**
  `git` and `grep` command lines, every one of which was read rather than
  matched against the previous anchor's list, and they are enumerated in this
  pass's header for that reason. The number scan returned **65** tokens,
  **61** naming an ADR that exists, residue **0030, 0055, 0058** and
  **0072** — unchanged for a third anchor over the anchor tree. **This
  commit's own edits then add two**, and they are written down rather than
  left for the next pass to find: **0079** stops being a residue token by
  becoming a member, and **0080**, the index's new **Next free number**, joins
  the residue in its place — the same movement `53e1405` recorded for 0078.
  The path scan's residue rises from 17 to 19 in the same way, both additions
  being `git` command lines this pass adds to §5.
  **The 78-versus-79 discrepancy the previous two passes could not reconcile
  is settled here and it is a property of the filter, not of the text**: one
  backticked span in §6's `income.ts` bullet crosses a line break, so a span
  pattern that excludes newlines returns 78 spans and a 16-line residue while
  one that tolerates them returns 79 and 17. Measured both ways on both
  trees. The count of *existing* spans, **62**, is identical under either
  filter and across both trees, and `diff` over the two scans' outputs
  between `eb1f040` and `898a16a` is empty in both directions.
- Files under `src/` — sixteen until 2026-08-28, when the omissions were counted:
  `ui/hud/messages.ts`, `ui/hud/projection.ts`,
  `ui/hud/hud.ts`, `ui/hud/build-panel.ts`, `content/procurement-catalog.ts`,
  `content/room-catalog.ts`, `simulation/economy/income.ts`,
  `simulation/rooms/zoning.ts`, `simulation/rooms/topology.ts`,
  `simulation/worker/state-machine.ts`, `simulation/protocol/commands.ts`,
  `simulation/protocol/types.ts`, `simulation/construction/definition.ts`,
  `simulation/prisoners/intake-system.ts`,
  `services/challenges/verification.ts`, `persistence/cloud/sync-engine.ts`
  (added 2026-08-27 with §2's new entry, in the same commit, which is what the
  paragraph below requires) — **and, added 2026-08-28, already cited**:
  `main.ts`, `services/telemetry/**` (**fifteen** modules; §5's ADR 0010 entry is
  a claim about the whole directory. **This read "thirteen" and was wrong when it
  was written** — `git ls-tree bb3a01e src/services/telemetry/` returns fifteen
  too, so it was never overtaken, and nothing in the directory changed in this
  window), `persistence/session/session-controller.ts`,
  `simulation/protocol/transferables.ts`, `ui/hud/hud.css`,
  `simulation/presentation/room-projection.ts` and `simulation/rooms/requirements.ts`.
  Added 2026-08-28 because entries rewritten at this anchor now cite them:
  `ui/telemetry-consent-prompt.ts`, `simulation/prisoners/release.ts` and
  `rendering/world/environment-art.ts`. **Added 2026-08-28, second pass, already
  cited**: `persistence/save-schema.ts` (§5's ADR 0009 entry cites `:1164` by
  line), and the three `.css` files §5's 900x600 entry counts —
  `ui/tokens.css`, `ui/brand.css` and `ui/primitives/primitives.css` — together
  with `ui/primitives/**`, which §5's `ui-hud-messages.test.ts` citation is a
  claim about. **Missing until this anchor, found by this pass's derivation
  rather than added when the citing sentence landed**: `entity/entity-store.ts`
  — #505 added the sentence citing it (`src/simulation/entity/entity-store.ts`
  retiring a slot at generation 4,095) to §5's ADR 0026 entry in the same
  commit that answered question 1, and did not add the file here, which is
  exactly the omission this subsection's own rule exists to prevent. No `:N` is
  cited, so no line-drift risk was hidden by the gap, but the rule is about the
  citation existing, not about what it risks.
- Under `tests/`: `foundation/adr-status-reference-contract.test.ts`,
  `foundation/unconsumed-command-contract.test.ts`,
  `unit/ui-hud-messages.test.ts`, `unit/objects-room-capacity.test.ts`,
  `unit/entity-generation-wrap.test.ts`,
  `unit/prisoners-intake-system.test.ts` — **and, added 2026-08-28, already
  cited**: `integration/object-placement-loop.test.ts`,
  `unit/actor-identity.test.ts`, `unit/ui-hud-build-panel.test.ts` and
  `unit/ui-simulation-zoning.test.ts` — **and, added 2026-08-28, second pass,
  already cited**: `foundation/adr-numbering-contract.test.ts`,
  `foundation/adr-status-queue-anchor-contract.test.ts`,
  `foundation/documentation-links-contract.test.ts` and
  `unit/environment-art.test.ts`. The last is the one §5's `environment-art.ts`
  handover turns on, and the first three are the gates §6 describes: §§3-6 make
  claims about what each of them asserts, so each is a dependency in exactly the
  sense this list means.

**So extending the anchor is `git diff --name-only <anchor>..HEAD` intersected
with that set, and then reading only the intersection.** Run for
`83c3121..dbe271f`: **53 files changed, 15 of them in the set** — three docs, six
ADRs and `docs/adr/README.md`, `package.json`, two new migrations, and **three of
the twenty-one files under `src/` and `tests/`**. Reading fifteen files is not
reading eighty citations, and that difference is what makes an anchor extensible
instead of a thing nobody has time to move.

**The delta note for `0637ab1`, stated so a reader can re-run it.** The diff is
`git diff --name-only 53e1405..0637ab1`, **89 files**, of which **19 are
members**: `docs/DEPLOYMENT.md`, `docs/HUD_PROJECTIONS.md`,
`docs/adr/README.md`, `docs/research/README.md`, `package.json`,
`src/content/room-catalog.ts`, `src/simulation/economy/income.ts`,
`src/simulation/protocol/types.ts`, `src/simulation/rooms/zoning.ts`,
`src/simulation/worker/state-machine.ts`, `src/ui/hud/messages.ts`,
`src/ui/hud/projection.ts`, `tests/unit/ui-hud-messages.test.ts`, and ADRs
**0003, 0025, 0042, 0071, 0075** and **0076**. Nothing under
`supabase/migrations/`, `src/services/telemetry/**` or `src/ui/primitives/**`
changed, so those three glob members contributed none.

**The one measured claim in §§3-6 that both its files moved under, re-run
rather than assumed.** §5's handshake entry rests on `grep -rn
"protocol/handshake" src/ --include=*.ts`, and both `types.ts` and
`state-machine.ts` are in this delta. **The substance holds exactly: still
nine hits, still split 4 / 2 / 3**, and all nine are still a `case` label, a
handler signature or a reply kind — receiver, union or schema, never a sender.
**Six of the nine line numbers moved**, and two of them are worth naming
because the previous two anchors recorded them as *unmoved*:
`transferables.ts` read `:41` and `:50` and now reads **`:39` and `:55`** —
the pair moved in **opposite directions**, which no uniform-offset assumption
would have caught. `state-machine.ts` read `:698`, `:728`, `:737` and now
reads **`:794`, `:824`, `:833`**, a uniform +96. `types.ts` alone is unmoved
at `:12`, `:23`, `:223`, `:442`.

**ADR 0003's independent copy of the same measurement is now stale in its
anchors and is left alone**, deliberately. `docs/adr/0003-simulation-worker-protocol.md:533`
names `types.ts:7`, `:18`, `:206`, `:425`; `transferables.ts:41`, `:50`;
`state-machine.ts:607`, `:637`, `:646` — every one of the nine has moved. Its
substance holds for the same reason this file's does, and it says so in its
own §535. It is a member of the dependency set, but §§3-6 make no claim about
those particular line numbers, so correcting them is ADR 0003's own job and is
handed over rather than done here.

**The delta note for the `07add3e` anchor, kept below.** The diff
is `git diff --name-only c00b641..07add3e`, **122 files**. Intersected with the
set as it stood *before* this commit extended it, it is **fourteen**:
`package.json`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`, ADRs **0022**,
**0029** and **0054**, `src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/rendering/world/environment-art.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/prisoners/release.ts`,
`src/simulation/worker/state-machine.ts`,
`tests/foundation/documentation-links-contract.test.ts` and
`tests/integration/object-placement-loop.test.ts`. **No file under
`supabase/migrations/` changed** — the directory still holds twenty-three, so
§3's table needed no re-derivation and its two absences hold. **Intersected with
the four members this commit adds — ADRs 0059, 0061, 0062 and 0063 — it is four
more**, and all four are documents this pass reads only for their `Status`
line. Eighteen files read.

**What the fourteen cost, because a small intersection is not a small
consequence and this file has now said so three times.** Nine `file:line`
citations moved and they are concentrated in one file:
`src/simulation/worker/state-machine.ts` alone moved five (the `WorkerState`
union and the four `transition()` sites, plus the two handshake receivers, of
which the union and the four transitions are the five distinct spans §5 cites),
`src/simulation/prisoners/intake-system.ts` two,
`src/simulation/prisoners/release.ts` one, `src/persistence/save-schema.ts` one
and ADR 0022 one. `docs/adr/README.md` gained four `Proposed` rows and moved its
**Next free number** line from 0058 to **0064**. **Four declared members changed
without moving a single citation**, which is worth naming because two of them
have now done it twice running:
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at `:9` after a **third** consecutive
window of edits to that file; `docs/HUD_PROJECTIONS.md` moved gap 13 from
`:754` to `:766` and cost nothing, because that citation was retired in favour
of its quoted sentence one anchor ago; `tests/integration/object-placement-loop.test.ts`
still carries the title §5 quotes and still calls `wallRoomPerimeter` three
times; and `tests/foundation/documentation-links-contract.test.ts` changed in a
way that **discharges** a §5 handover rather than breaking a citation.

**The delta note for this anchor, `07add3e..01974e5`, stated so a reader can
re-run it.** The diff is `git diff --name-only 07add3e..01974e5`, **85 files**
— the smallest window measured so far, across eleven releases carrying **ten**
merged pull requests: #488, #489, #490, #491, #494, #495, #496, #497, #499 and
#500, read off `git log --oneline --first-parent 07add3e..01974e5`. **Today
alone — 2026-08-28 — landed 0066 and 0067**, and the brief this pass was
handed said a third, 0068, landed too; it did not. `docs/adr/README.md`'s own
**Next free number** paragraph is explicit: 0068 is *reserved* for issue
#493's still-unmerged branch and is "not this ADR's to take, or anyone else's
until that branch's draft returns and is numbered in this file." Corrected
here because the brief said it and the index says otherwise — the same class
of correction this section has made twice before about a brief's contents.

Intersected with the set as it stood *before* this commit extended it, it is
**ten**: `package.json` is not among them — it changed every release, as it
always does, and is read for its version rather than diffed — but
`docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`, `docs/adr/0029-concurrent-room-use-claims.md`,
`docs/research/README.md`, `src/main.ts`, `src/persistence/save-schema.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/economy/income.ts`,
`src/simulation/prisoners/intake-system.ts` and
`src/simulation/rooms/zoning.ts` are. **No file under `supabase/migrations/`
changed** — the directory still holds twenty-three, so §3's table needed no
re-derivation and its two absences hold. **Intersected with the four members
this commit adds — ADRs 0064, 0065, 0066 and 0067 — it is four more**, and all
four are documents this pass reads only for their `Status` line. Fourteen
files read.

**What the ten cost.** Two `file:line` citations moved:
`src/simulation/prisoners/intake-system.ts`'s `findBestAvailable`/`#79` pair,
`:448`/`:442` → `:474`/`:468` (#497's assault-sanction work is the only commit
touching that file in this window); and `src/persistence/save-schema.ts`'s
`masterSeedSchema` comment, `:1182` → `:1198` (the same commit). Two more moved
inside `src/main.ts` and were retired to a range rather than a bare number
already, so the correction is recorded above rather than repeated here:
`:2506-2511` → `:2545-2550` and `:2506` → `:2545`, both from #500's
`generateMasterSeed` function landing 39 lines above them. `docs/HUD_PROJECTIONS.md`
moved gap 13 again, `:766` → `:793`, and cost nothing — retired to its quoted
sentence two anchors ago. `docs/adr/README.md` gained four `Proposed` rows and
moved its **Next free number** line four times in sequence, 0064 → 0065 →
0066 → 0067 → 0068 (recorded above). **Five declared members changed without
moving a single citation, and this is the most of any window so far:**
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at the same lines after a **fourth**
consecutive window of edits to that file (recorded above); `src/simulation/economy/income.ts`
gained 240 lines and still restates no `Proposed` count (recorded above, and
the strongest instance of that finding yet, because this is the first time
the file itself changed while being re-read); `src/simulation/rooms/zoning.ts`
gained 141 lines and its two live citations, `:116-117` and `:125`, are
untouched; `docs/adr/0029-concurrent-room-use-claims.md` gained a dated
amendment (#491) below every line this file cites, so its Status-line citation
at `:5` is untouched; and `docs/research/README.md` gained one table row,
which the *"deliberately left"* bullet's citation does not depend on the
contents of.

**The four-place queue sweep for this anchor, run again and finding nothing to
find** — the first window in the series with nothing filed at all, not merely
nothing filed with a row. §2 gained **zero** entries in the seven releases to
`4ace2da`, and for the first time that is not because a `Proposed` ADR arrived
without one: **no commit in the window adds a `Proposed` ADR**, so the rule
this section states — "any commit that adds an outstanding ADR adds an entry
here" — had nothing to be obeyed or abandoned against. The heading, the title,
the header paragraph and §5's preamble all still read "five" / name the same
five entries, in agreement, for the **fifth** consecutive anchor now — three
of those five anchors (`07add3e`, `01974e5`, this one) have found the four
places already agreeing, which is the longest run of agreement this file has
recorded. **Both halves of the question this task was asked to check, stated
separately because a quiet mechanism is not the same finding as a quiet
window:** the four-place split itself has not recurred in three anchors
running, and the abandonment rate is unmeasurable this window rather than
holding or improving, because there was no arrival to abandon a row for. The
streak resumes the moment the next `Proposed` ADR lands with no row, and
nothing here predicts which way that goes.

**The four-place queue sweep for this anchor, and the two halves come apart
for the first time.** The four places agree: the title states a subject and no
count, the header paragraph reads *"§2 holds **five entries**"*, §2's own
heading reads *"## 2. Five entries: …"*, and §5's preamble reads *"**FIVE at
`07add3e`**"* — the **sixth** consecutive anchor at which they agree, and the
longest run of agreement this file has recorded. **That is the weaker half of
the result, and it is weaker than the run length makes it look.** Three of
those six anchors, including the immediately previous one, were windows in
which §2 gained no entry, so the mechanism that splits the four places — an
entry filed into §2 and its heading, with the two prose counts left behind —
was never exercised. A count that cannot drift because nothing writes to it is
not evidence that the sweep is working.

**This window did exercise it, and the answer is the other half: no entry was
filed at all.** ADR 0069 landed in this window (#541), `Proposed, 2026-08-29.
Not self-approved.`, with its code merged and live — precisely the shape §2's
own rule names, *"any commit that adds an outstanding ADR adds an entry
here"*. No §2 entry was added for it. `grep -n '0069' docs/adr/STATUS-QUEUE.md`
before this commit returned three hits, every one of them a claim about
`docs/adr/README.md`'s **Next free number** line and not one of them a citation
of the document — the same distinction the derivation subsection below draws
between a scan token and a citation. So the two questions this sweep asks have
**different answers for the first time**: the four places did not split, *and*
the rule they exist to protect was abandoned again. Reporting them as one
result would have read as "the sweep found nothing", which is false in the
half that matters. The four places agreeing is a fact about five entries that
nobody touched; the rule being obeyed is a fact about the sixth that nobody
wrote.

**The delta note for this anchor, `4ace2da..85c1c29`, stated so a reader can
re-run it.** The diff is `git diff --name-only 4ace2da..85c1c29`, **65 files**,
across ten releases (`v0.0.177` at the base is excluded, as every anchor's
convention states) carrying **ten** merged pull requests: #520, #521, #522,
#526, #527, #530, #534, #536, #539 and #541, read off `git log --oneline
--first-parent 4ace2da..85c1c29` (excluding the ten release-bump commits).
`b73ea41`/#521 is the previous anchor's own writing commit and is accounted for
above rather than re-read as new drift. **Ten of ten releases: this window
spent the entire budget**, and the gate passes at this tree only because
`toBeLessThanOrEqual(10)` is inclusive — the next release commit, which
`.github/workflows/version.yml` produces after every merge and which starts no
CI run, takes it to eleven and turns `main` red. That is the third time this
series has arrived at the bound and the first time it has been re-anchored
*on* it rather than past it.

Intersected with the set as it stood *before* this commit extended it, it is
**seventeen** — `package.json` is not among them, by the same convention as
every anchor before this one, and `docs/adr/STATUS-QUEUE.md` is not a member of
its own set, also by convention. They are `AGENTS.md`,
`docs/AGENT_WORKFLOW.md`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`,
`docs/research/README.md`, `src/main.ts`,
`src/simulation/construction/definition.ts`,
`src/simulation/presentation/room-projection.ts`,
`src/simulation/prisoners/intake-system.ts`,
`src/simulation/protocol/commands.ts`, `src/ui/hud/build-panel.ts`,
`src/ui/hud/hud.ts`, `src/ui/primitives/async-action.ts`,
`src/ui/primitives/dom.ts`, `src/ui/primitives/focus-handoff.ts`,
`tests/integration/object-placement-loop.test.ts` and
`tests/unit/ui-hud-build-panel.test.ts` — the last three under `src/ui/`
by way of the `ui/primitives/**` member the list carries rather than by name.
**No file under `supabase/migrations/` changed** — the directory still holds
twenty-three, so §3's table needed no re-derivation. **One new ADR joins the
set**: **0069**, by the same rule as 0068, 0064-0067 and 0059-0063 before it —
§3's opening, §5's first bullet and §6's `income.ts` bullet now enumerate
twenty-three `Proposed` documents and this is the one that joined. Eighteen
files read. **Seventeen is more than three times the previous window's five**,
on a window only three releases longer, which is the same non-proportionality
between window length and intersection size this file has now recorded twice.

**What the seventeen cost: fourteen `file:line` citations across four files,
and one quoted sentence — the first quotation this file has lost.** Set out
below by file, because the concentration is the finding.

**`src/main.ts` moved eight cited spans, the most any single file has moved in
this series.** #541's sentence-drawing work and #534's door-edge work together
added five lines high in the import block and 53 more before the consent
mount: the three telemetry imports `:82-84` → **`:87-89`**; the pipeline-and-
listeners block `:154-195` → **`:159-200`**; the `crashReporter` gate
`:180-183` → **`:185-188`** (**this entry said "unmoved" and it is now moved**;
the word is corrected rather than the sentence deleted); the consent mount
`:2545-2550` → **`:2598-2603`** and its gate `:2545` → **`:2598`**; the
challenges comment `:102` → **`:107`**; and `import type { CancelScheduledPump }`
`:84` → **`:89`**. **One of the eight is a claim rather than an anchor and is
corrected as one**: §5's ADR 0009 entry says *"`src/main.ts:86` is now `import
'./styles.css';`"*, and at this anchor `:86` is `import { createTelemetryConsentPrompt }
from './ui/telemetry-consent-prompt';` — `import './styles.css';` is at **`:91`**.
That sentence was itself written as a correction of an earlier wrong anchor,
which makes it the fourth consecutive pass at which a correction has rotted no
slower than the claim it corrected, exactly as §4 of `docs/AGENT_WORKFLOW.md`
says.

**`src/ui/hud/hud.ts` moved four, and none of them moved in this window.**
`export type HudIntent =` `:271` → **`:296`**, the union's close `:541` →
**`:566`**, `HudUnavailableNotice` `:555` → **`:580`**, `arm-build-tool`
`:404-409` → **`:429-434`**, `arm-room-tool` `:537-542` → **`:561-566`** and
`cancel-build-order` `:446` → **`:471`**. `git show <sha>:src/ui/hud/hud.ts`
across the anchor chain puts every one of them at the old value through
`01974e5` and at the new value from `33510df` onward, so **`8dc2540` (#498)
moved them, two anchors ago** — inside the `01974e5..33510df` window, where
`src/ui/hud/hud.ts` was a declared member that the diff reported as changed.
**Two consecutive anchor passes therefore had this file in their intersection
and did not re-derive these six anchors.** This is the class the header calls a
claim already false when the window opened, found for the third consecutive
anchor, and it is the sharpest instance yet because the file was *not*
untouched — it was in the intersection both times and was read for something
else. The count itself holds: `HudIntent` still declares **eighteen** members,
re-counted as `grep -c "readonly kind: '"` between `export type HudIntent =`
and `HudUnavailableNotice`, unchanged at `4ace2da` and here.

**`src/simulation/prisoners/intake-system.ts` moved two, and this is the fifth
anchor to move the same pair.** `findBestAvailable` `:474` → **`:530`** and its
`#79` comment `:468` → **`:524`**, from #541 inserting the sentence draw above
them at the `classification` stage. **Fifth anchor, fifth pair of numbers, and
the expression has still not changed**: `findBestAvailable` is still handed a
`rateCellSharing` closure and is still the only allocator. A citation that has
been re-pointed at five consecutive anchors without the sentence it supports
changing a word is the argument for the symbol-over-line rule this file keeps
making and keeps not applying here.

**`src/simulation/protocol/commands.ts` moved one.** `simulationCommandSchema`
`:467` → **`:493`**, from #536's and #541's insertions above it. The count is
unmoved: it still discriminates **thirteen**, re-counted rather than trusted —
`grep -c "type: z.literal"` returns 13 at `4ace2da` and 13 here — and the
thirteen are the same thirteen the entry enumerates.

**And the one that is not a line number, which is the result worth having.**
§5's *"Two Accepted ADRs still say object placement does not exist"* entry
retired its `docs/HUD_PROJECTIONS.md` gap-13 citation from a line number to a
quotation three anchors ago, on the stated ground that *"a quoted sentence is
the most"* durable citation and the number had moved three times without the
sentence changing a word. **The sentence has now changed.** That entry quotes
gap 13 as opening *"Object placement exists, and `minQuantity` is still
unchecked"*; at this anchor it opens **"Object placement exists, and
`minQuantity` is counted"**, changed by #530 (issue #528), which closed the
second half of the gap. The quotation is corrected in place with the old
wording kept beside it. **This is the first time a quoted-sentence citation in
this file has gone false**, and it is recorded as a limit on the rule rather
than as an argument against it: the rule is that a quotation rots *slower*, not
that it cannot rot, and the thing that falsifies one is a real change to the
subject rather than an edit anywhere above it. Both halves of gap 13 are now
closed, so the two ADRs that cite it — 0023 and 0027 — are further from the
world than they were, not closer, and the handover to amend them stands.

**Ten declared members changed and cost nothing, and two of them are the rule
working rather than luck.** `AGENTS.md` gained #539's *"Nothing may exist only
in the container"* rule, inserted into *"The parts of it that are rules rather
than advice"* and therefore **below** the numbered *"Architectural
boundaries"* list that §5's `environment-art.ts` entry rests on: boundary 6 is
unmoved. `docs/AGENT_WORKFLOW.md` gained 48 lines in one hunk at its §2, which
pushed §4 down bodily — and **all four of the §§3, 5 and 6 quotations of that
§4 were re-read and are still verbatim**, because they are quotations and not
line numbers. That is the same rule that failed for gap 13 above, working here
for the reason it usually does, and the two cases belong together.
`docs/research/README.md` gained one table row and corrected another; §6's
*"deliberately left"* bullet rests on the rule the file states and not on the
table, and the rule is untouched. `docs/adr/README.md` gained 0069's row and
moved **Next free number** 0069 → 0070 (recorded above); every citation this
file makes into it by number sits in a preserved record of a superseded claim
rather than in a live one, and those are left as they stand.
`src/simulation/construction/definition.ts` still returns **33** for
`grep -c placesObjectId`, unchanged at `4ace2da` and here.
`src/simulation/presentation/room-projection.ts` still reads an over-capacity
room as full — *"over-capacity room therefore reads as full at 100 %"* — at
`:190`. `src/ui/hud/build-panel.ts` still says *"7.8px is the entire budget"*.
`tests/integration/object-placement-loop.test.ts` still carries the title §5
quotes, *"a player buys a plank, places a bed in a cell they zoned, and a
prisoner lives in it"*, and still calls `wallRoomPerimeter` three times. The
three `src/ui/primitives/` files changed under #522's and #527's focus and
description work, and the claim that rests on them — that
`tests/unit/ui-hud-messages.test.ts`'s *"imports nothing from the simulation"*
covers every file under `src/ui/hud/**` and `src/ui/primitives/**` — was
re-read at the assertion and still holds over `[...hudFiles, ...primitiveFiles]`.
`tests/unit/ui-hud-build-panel.test.ts` changed and still defers to that test
by name.

**Forty-eight of the sixty-five changed files are outside the set and outside
it correctly** — checked by reading the ten PRs' subjects and touched files
against the citations in §§3-6 rather than assumed. The determinism suites,
`src/simulation/prisoners/sentence.ts` and `classification.ts`, the browser
specs, `scripts/wip-sweep.sh`, `docs/INPUT.md`, `docs/NAVIGATION.md` and
`docs/TESTING.md` are the bulk of them, and §§3-6 make no claim about any.

**Also re-derived at this anchor, and reported as a result rather than
skipped**: every rooted `path:N` span in §§3-6 was extracted mechanically,
opened and printed, as the last three passes each did. Beyond the fourteen
corrected above, the scan surfaced one span whose value is right and whose
framing is worth a reader's caution — `tests/unit/ui-hud-messages.test.ts:218-224`
is stated *"at `bb3a01e`"* and is still exactly true of `bb3a01e`; that
assertion is at `:223` here, and the file is in neither this window's diff nor
the last two, so the difference is dated rather than false. It is left as
written because a dated claim about a named tree is a record, not a live
citation — the distinction this file's own single-anchor gate turns on.

**The previous anchor's delta note, kept as a record.** It read: *"**The delta
note for that anchor, `33510df..4ace2da`, stated so a reader can
re-run it.** The diff is `git diff --name-only v0.0.170..origin/main`,
**28 files**, across seven releases (`v0.0.170` at the base is excluded, as
every anchor's convention states) carrying **six** merged pull requests: #511,
#512, #513, #515, #518 and #519, read off
`git log --oneline --first-parent v0.0.170..origin/main` (excluding the seven
release-bump commits and `d61df4e`/#510, the previous anchor's own writing
commit, already accounted for above — that commit touches
`docs/adr/STATUS-QUEUE.md` alone, confirmed by `git show --stat`, so it is
correctly the only file in the raw diff this note does not treat as this
window's content). Intersected with the set as it stood *before* this commit
extended it — and nothing needs to extend it, see below — it is **five**:
`package.json` is not among them, by the same convention as every anchor
before this one, and `docs/adr/STATUS-QUEUE.md` is not a member of its own
set, also by convention — but `docs/CLOUD_SAVE.md`,
`docs/adr/0022-room-zoning-surface.md`,
`docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md`,
`docs/adr/README.md` and `src/simulation/protocol/types.ts` are. **No file
under `supabase/migrations/` changed** — the directory still holds
twenty-three, so §3's table needed no re-derivation. **No new ADR joins the
set**, because none was added — the first window since this convention began
at which that sentence is simply true rather than "zero this time, still
watching." Five files read.

**Twenty-three of the twenty-eight changed files are outside the set and
outside it correctly** — checked by reading every one of the six PRs' subjects
and touched files against every citation in §§3-6 rather than assumed, and
nothing found: the pointer-gesture recovery (#519) and the run-length-codec
fold (#518, which also corrected `docs/PERSISTENCE.md` and two line citations
inside ADR 0022 and ADR 0040's own bodies — neither line is one this file
cites) touch rendering, presentation and persistence-doc surfaces §§3-6 make
no claim about; the tick-cost re-measurement (#513, which left
`scripts/report-tick-system-cost.mjs` behind) and the duplicate-build-order
refusal (#515, which also found `ObjectPlacementService.remove` never
cancelling its finished construction order) touch construction and economy
surfaces this file is likewise silent on.

**What the five cost: nothing, and every one of the five was opened rather
than assumed.** `src/simulation/protocol/types.ts` gained 28 lines from #515's
new `build.duplicate-order` reason, all of it inside and below the
`REFUSAL_REASONS` doc comment starting at line 803 — below every anchor this
file cites (`:12`, `:23`, `:173`, `:223`, `:442`), and `grep -c
"protocol/handshake"` still returns **nine**, still split 4/2/3, confirmed by
re-running it rather than trusting the arithmetic. `docs/adr/README.md`'s own
edit (#511) corrected its "every ADR is Accepted" prose but touched no line
this file cites by number — all of this file's own citations into it are
either historical (already retired to quotation) or the Proposed-count/Next-
free-number reading already re-derived above, which is unchanged at
twenty-two rows and `0069`. `docs/adr/0022-room-zoning-surface.md` and
`docs/adr/0044-what-happens-to-a-service-tier-nothing-calls.md` were each
corrected by #518 and #512 respectively, in their own bodies, at lines
neither of this file's own citations names (this file cites ADR 0022's
*"÷ 12.2 is 23.9"* line, re-verified still at `:588`, and ADR 0044's title
only, by name). `docs/CLOUD_SAVE.md` gained nine lines from #512's account-
reducer correction, at `:201-218`, above the capacity table this file quotes
rather than lines (`:1659-1661`, moved by the insertion and re-verified,
quoted here rather than numbered for exactly the reason §6's recommendation 1
gives).

**What no diff could have found, and this pass's one real correction.** §6's
`income.ts` bullet had been contradicting itself for at least two anchors: the
paragraph correctly stating "nine readings… across seven anchors… twenty-two"
was immediately followed, unheaded, by the leftover tail of an already-
superseded **six-reading, "it is thirteen"** paragraph — a duplicate of the
same title/§2 defect this file's own header records finding twice before, in
the one bullet a delta pass is least likely to open because none of its five
changed files touches it. Found and corrected in place below, in §6, by the
check the header prescribes for exactly this class: reading the file's own
paragraphs against each other. Recorded here because the sweep that found it
is not the four-place sweep above it, and conflating the two would understate
how many independent checks this anchor actually ran.

**The four-place queue sweep for the `01974e5` anchor, kept as a record.** It
found nothing that window — not because the mechanism improved, but because
nothing was filed to drift. §2 gained **zero** entries in that window: all four
Proposed ADRs that landed then (0064, 0065, 0066, 0067) were, like fifteen
before them, decisions with no queue row. So the heading, the title, that
paragraph and §5's preamble all still read "five" / name the same five
entries, in agreement, for the third consecutive anchor at that time — but
unlike the two anchors before it (#467's fourth entry and #485's fifth, each
of which moved §2's heading and the header paragraph while leaving §5's
preamble behind for nine releases), the split this file had found twice did not
recur, because there was no third filing for it to lag behind. The abandonment
continued at a higher rate than ever — four more in that window, none obeying
the rule — while the drift this file specifically watches for stayed dormant."*

**The anchor before that one's delta note, kept as a record.** The diff was
`git diff --name-only 01974e5..origin/main` (`origin/main` there meaning
`33510df`, the previous anchor's own tip),
**61 files**, across seven releases carrying **six** merged pull requests:
#498, #502, #504, #505, #508 and #509, read off
`git log --oneline --first-parent 01974e5..origin/main` (excluding the release
commits and `15a8df6`/#501, the previous anchor's own writing commit, already
accounted for above). Intersected with the set as it stood *before* this
commit extended it, it is **fourteen**: `package.json` is not among them, by
the same convention as every anchor before this one — but
`docs/HUD_PROJECTIONS.md`, `docs/adr/0015-actor-identity-allocation.md`,
`docs/adr/0026-entity-id-lifetime.md`, `docs/adr/0050-when-a-sentence-ends.md`,
`docs/adr/README.md`, `docs/research/README.md`,
`src/simulation/protocol/types.ts`, `src/simulation/worker/state-machine.ts`,
`src/ui/hud/hud.ts`, `src/ui/hud/messages.ts`, `src/ui/hud/projection.ts`,
`tests/unit/actor-identity.test.ts`, `tests/unit/entity-generation-wrap.test.ts`
and `tests/unit/ui-hud-messages.test.ts` are. **No file under
`supabase/migrations/` changed** — the directory still holds twenty-three, so
§3's table needed no re-derivation. **Intersected with the one member this
commit adds — ADR 0068 — it is one more**, read for its `Status` line and,
because it is new rather than merely re-read, for its full text. Fifteen
files read. **Forty-seven of the sixty-one changed files are outside the set
and outside it correctly** — guard rendering (#502, ADR 0040 slice 2), the
client-side room-enclosure classifier (#498, ADR 0068's own implementation),
the Regime roster's discharge wording (#508), the status strip's incident-kind
badge (#509) and the rejected canteen-walk hypothesis (#504, a new
`docs/research/` entry with no ADR and no code change to any file §§3-6 cite)
all touch rendering, presentation and roster surfaces §§3-6 make no claim
about; checked by grepping each PR's subject and touched files against every
citation in §§3-6 rather than assumed, and nothing found.

**What the fourteen cost.** Three ADRs were corrected in place rather than
moved by a diff: #505 answered ADR 0026 question 1 (entity-generation-wrap.test.ts
and prisoners-intake-system.test.ts's `DEFECT`-pinning became fixed-behaviour
pinning, RED/GREEN by hand, recorded in the same commit) and, in the same
commit, corrected ADR 0015's now-false "ids repeat" claim and cross-referenced
it from ADR 0050 — all read and confirmed still true on disk, and one §6
bullet describing the old `entity-generation-wrap.test.ts` comment was stale
and is corrected above. Nine `file:line` citations moved, all in one cluster:
`src/simulation/worker/state-machine.ts`'s four `transition()` sites (a uniform
+1, from #505's one-line insertion above `EntityStore.destroy`'s call site)
and its three handshake-receiver anchors (the same +1); `src/simulation/protocol/types.ts`'s
four handshake-schema anchors and its `protocolVersion` literal (a uniform +5,
from #498's and #502's insertions ahead of the schema). `src/ui/hud/hud.ts`
moved four anchors by a uniform +25 (`HudIntent`'s open, close,
`HudUnavailableNotice` and the `arm-build-tool`/`arm-room-tool`/`cancel-build-order`
member positions) while its **eighteen**-member count, three-room-member count
and `HudRoomGesture`'s `:154` all held; `tests/unit/ui-hud-messages.test.ts`
moved one anchor by +5 (new test above it). **Four declared members changed
without moving a single citation this pass depends on**:
`docs/HUD_PROJECTIONS.md` (gap 13's wording, quoted rather than lined, still
verbatim), `docs/adr/README.md` (gained a `0068` row and moved **Next free
number** from 0068 to 0069 — recorded above), `docs/research/README.md` (gained one
table row, the guards research entry, which the *"deliberately left"* bullet's
citation does not depend on the contents of), and
`src/simulation/worker/state-machine.ts`'s `WorkerState` union specifically,
one of five anchors into that same file — it stayed at `:34-40` despite the
file changing around it and despite its other four anchors (the
`transition()` sites and the handshake receivers) all moving. `package.json`
changed too, as it does every release, and is read for its version rather
than diffed, per this note's own opening convention. **One correction this
pass made was to itself**: an
intermediate draft of the Proposed-ADR retally wrongly counted ADR 0022 as a
twenty-third `Proposed` document by trusting a bare `grep -l '^\*\*Proposed'`
hit, which was actually its nested amendment's `### Status of this amendment`
marker and not the ADR's own `## Status` line (`Accepted, 2026-08-25 — as
amended`, matching the index); caught before landing rather than after, by
reading the heading above the hit — the exact discipline this task's own
brief named as the trap and the reason to name it here rather than silently
fix it.

**The four-place queue sweep for the `33510df` anchor, kept as a record.** It
found nothing new that window either — not because the mechanism improved,
but because nothing was filed to drift. §2 gained **zero** entries in that
window: the one Proposed ADR that landed (0068) is, like nineteen before it,
a decision with no queue row. So
the heading, the title, the header paragraph and §5's preamble all still read
"five" / name the same five entries, in agreement, for the fourth consecutive
anchor now. The abandonment continues — one more decision with no row, seven
releases after the last one — while the specific four-place drift this file
watches for stayed dormant for a second consecutive anchor: twenty became
twenty-two (recorded above) in the same window that produced zero four-place
splits. **Both halves of the question this pass was asked to check, stated
together because they cut opposite ways**: the four-place split itself has not
recurred in two anchors running, but the rule the split is a symptom of — "any
commit that adds an outstanding ADR adds an entry here" — was abandoned once
more, for the sixth time since it was restated, at the same rate as every
anchor since `01974e5`. The mechanism is quiet because nothing has been filed
to disagree about, not because the underlying practice improved.

**The previous anchor's delta note, kept as a record.** The diff was
`git diff --name-only bb3a01e..c00b641`, **82 files**. Intersected with the set
as it stood *before* this commit extended it, it is **eight**: `package.json`,
`docs/DEPLOYMENT.md`, `docs/adr/README.md`, `src/main.ts`,
`src/persistence/session/session-controller.ts`,
`src/simulation/construction/definition.ts`, `src/simulation/protocol/types.ts`
and `src/ui/hud/hud.css`. **No ADR in the declared set changed**, and **no file
under `supabase/migrations/` changed** — the directory still holds twenty-three
— which is why §3's table needed no re-derivation and why its two absences hold.
Intersected with the twenty-two members this commit adds, it is **three** more:
`docs/AGENT_WORKFLOW.md`, ADR 0042 and ADR 0048. Eleven files read.

**What the eight and the three actually cost, because a small intersection is
not a small consequence and this file has said so twice.** `docs/DEPLOYMENT.md`
gained 54 lines in #474 and moved §4's deployment table from `:145-152` to
`:198-205`; `src/main.ts` moved §5's telemetry-consent anchors from
`:2494-2499`/`:2494` to `:2506-2511`/`:2506`; `docs/adr/README.md` gained four
ADR rows and moved its **Next free number** line from 0053 to 0058, which
falsified a *correction* §5 had written one anchor earlier. The other five
declared members changed without moving a single citation:
`src/persistence/session/session-controller.ts` still declares
`DEFAULT_AUTOSAVE_INTERVAL_MS = 30_000` at `:9`,
`src/simulation/protocol/types.ts` still declares
`protocolVersion: z.literal(...)` at `:168`,
`src/simulation/construction/definition.ts` still carries nineteen `object.*`
literals on `BUILDABLE_REGISTRY` rows, `src/ui/hud/hud.css` is still one of four
`.css` files under `src/ui/`, and `package.json` is the version this line names.

**The members the diff reports as untouched were spot-read at `07add3e` too,
and for the first time in four passes they produced nothing.** Every rooted
`file:line` in §§3-6 was re-derived mechanically and every anchor into a file
the diff reports as untouched lands: `commands.ts:467` (still thirteen),
`hud.ts:271`, `:404-409`, `:446`, `:537-542`, `:541` and `:555` (still
eighteen), all eight `zoning.ts` anchors, `topology.ts:72` and `:99`,
`types.ts:168`, `main.ts:82-84`, `:84`, `:86`, `:102`, `:154-195`, `:180-183`
and `:2506-2511`, `verification.ts:136` and `:324`,
`requirements.ts:19`, `room-projection.ts:74`, `room-catalog.ts:68-165`, `:69`
and `:70`, the six `entity-generation-wrap.test.ts` anchors,
`prisoners-intake-system.test.ts:230` and `:529`,
`unconsumed-command-contract.test.ts:204` and `:230` (`AWAITING_PRODUCER` still
empty), `ui-hud-messages.test.ts:218-224`, `environment-art.test.ts:248` and
`:256`, the four `adr-status-reference-contract.test.ts` floors,
`docs/DEPLOYMENT.md:198-205`, `:221` and `:253`, `docs/TRUSTED_SERVICES.md:604`,
`:607` and `:610`, `README.md:59`, `wrangler.jsonc:12` and `:20`, the four
`.github/workflows/migrate-database.yml` anchors, the six into
`20260823100000_bound_free_tier_capacity.sql`, and every ADR-body anchor
including `0003-…md:535`, whose quoted handshake split was re-measured and is
still 4/2/3. **Three passes running found something here and this one did not**,
which is a real result and not a skipped check: the class is not extinct, it is
that the citations this pass would have caught were caught by the two before it.

**The previous anchor's account of the same check, kept.** It read: because the
last two passes each found a citation that was already wrong before their window
opened and no diff could have raised either, that pass re-derived **every**
rooted `file:line` in §§3-6 mechanically — extract each backticked `path:N`
span, open the file, print the line — and the untouched half held completely:
the four `transition()` sites in `src/simulation/worker/state-machine.ts` are
still `:664`, `:799`, `:834` and `:1110` after moving at each of the three
previous anchors; `simulationCommandSchema` is still at
`src/simulation/protocol/commands.ts:467` and still discriminates thirteen;
`HudIntent` still declares eighteen members between `src/ui/hud/hud.ts:271` and
`:541`; `protocol/handshake` still returns nine hits in `src/`, split 4/2/3
exactly as ADR 0003 records. **The one thing the untouched half did surface** is
that ADR 0022's own note citing `hud.ts:153` for `HudRoomGesture` lands one line
short — it is at `:154`, and it was at `:154` at `bb3a01e` too, so that is a
drift inside ADR 0022 that predates this window. Correcting an ADR body is not
this file's edit; it is handed over here.

**That handover was taken and is discharged.** #481 corrected ADR 0022 in its
own commit: the ADR now reads *"`hud.ts:154` now declares **`HudRoomGesture`**"*,
and `src/ui/hud/hud.ts:154` is `export type HudRoomGesture =`. Re-read at
`07add3e`. **One handover raised at the previous anchor and closed nine releases
later, by the party entitled to make the edit** — recorded because this file has
raised more handovers than it has seen closed, and the ratio is the thing worth
watching.

**The previous anchor's delta note, kept as a record.** The diff was
`git diff --name-only 54418b6..bb3a01e`, **337 files**. Intersected with the set
as it stood *before* this commit extended it, it is **twenty-nine**: the
seventeen named files `package.json`, `docs/DEPLOYMENT.md`, `docs/CLOUD_SAVE.md`,
`docs/TRUSTED_SERVICES.md`, `docs/HUD_PROJECTIONS.md`, `docs/adr/README.md`,
`src/ui/hud/messages.ts`, `src/ui/hud/hud.ts`,
`src/content/procurement-catalog.ts`, `src/simulation/rooms/zoning.ts`,
`src/simulation/worker/state-machine.ts`, `src/simulation/protocol/commands.ts`,
`src/simulation/protocol/types.ts`, `src/simulation/construction/definition.ts`,
`src/simulation/prisoners/intake-system.ts`, `tests/unit/ui-hud-messages.test.ts`
and `tests/unit/prisoners-intake-system.test.ts`; plus ADRs 0002, 0008, 0010,
0012, 0013, 0015, 0017, 0022, 0025, 0026, 0028 and 0029. **No file under
`supabase/migrations/` changed**, which is why §3's table needed no re-derivation
and why its two absences hold. `wrangler.jsonc`,
`.github/workflows/migrate-database.yml`, `README.md`,
`src/content/room-catalog.ts`, `src/simulation/rooms/topology.ts`,
`src/simulation/economy/income.ts`, `src/ui/hud/projection.ts`,
`src/ui/hud/build-panel.ts`, `src/services/challenges/verification.ts`,
`src/persistence/cloud/sync-engine.ts`, `docs/research/2026-08-25-economy-rate.md`,
`tests/foundation/adr-status-reference-contract.test.ts`,
`tests/foundation/unconsumed-command-contract.test.ts`,
`tests/unit/objects-room-capacity.test.ts`,
`tests/unit/entity-generation-wrap.test.ts` and ADRs 0009, 0016, 0023, 0027 and
0031 are the members `git diff` reports as untouched; the `file:line` citations
into them were spot-checked anyway rather than rested on the diff, because the
last pass recorded that resting on it is how two of six came apart.

**And then the intersection was checked for completeness against the document
itself, which is the step the method was missing.** Every backticked path in
§§3-6 was extracted and diffed against the list; the fourteen omissions are named
in the header above, nine of them changed, and reading those nine is where the
telemetry finding came from. **At this anchor the same check was run again with
bare `00NN` tokens added to it and found twenty-two more**, eleven of them ADRs
— including nine that §5's and §6's own bullets enumerate by number. So the
completeness check has now run twice and found omissions twice, and the second
run found more than the first: **a set derived by one pattern is only complete
with respect to that pattern**, which is the same failure one level up. Both
scans are stated in the subsection above so the next reader runs both. **A delta pass is only as sound as its set**, and
nothing in the arithmetic tells you the set is wrong — the intersection of a real
diff with an incomplete list is a real, small, reassuring number.

**What this is not licence to do.** A delta note is a claim and it needs an
entry's standard: *"the delta touched nothing §§3-6 depend on"* is a sentence
somebody has to be able to check, so it must name the diff it ran and the set it
intersected, and it is false the moment the set is stale — an entry that starts
citing a file not listed above has to add it here in the same commit, exactly as
landing a change means updating its entry. **And a small intersection is not a
small consequence.** Three files under `src/`/`tests/` moved in this delta and
they falsified **three claims**, one of them a claim the previous re-read had
written eight releases earlier. The cheap step is finding *what to read*. Nothing
here licenses deciding that nothing needs reading.

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: the gates
over `docs/adr/` check statuses against documents — the index against the ADR,
and every sentence in the corpus against the ADR — and none of them checks a
status against code. It is a habit, not an assertion.

The one thing that *is* now asserted is narrower and is the failure that
actually happened: the anchor line above stopped moving.
`tests/foundation/adr-status-queue-anchor-contract.test.ts` requires this file
to declare exactly one anchor commit, requires every live "verified at" below to
name that same commit, and fails when the version the anchor names falls more
than ten releases behind `package.json`. It proves nothing about whether a
sentence here is true — moving the anchor without re-reading anything passes it
— so it is a bound on unreviewed history and not a substitute for the habit.

---

## 1. What was decided, and when — all thirteen

Every flip happened on **2026-08-25**, in three commits, each flip as the pair
the suite requires: the `Status` line in the ADR and that ADR's row in
`docs/adr/README.md`.

### The six retroactive approvals (#308)

The entries this file was originally written for. Each was a decision the code
had already been built on while the document still said it was awaiting
approval.

| ADR | Was | Is |
| --- | --- | --- |
| [0012](./0012-derived-identifier-reproducibility.md) | Proposed | **Accepted** |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Proposed — pending human approval | **Accepted for §§1-4; §§5-6 remain Proposed** |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Proposed | **Accepted** |
| [0015](./0015-actor-identity-allocation.md) | Proposed | **Accepted** |
| [0016](./0016-migration-delivery-mechanism.md) | Proposed — pending human approval | **Accepted**, retroactively |
| [0021](./0021-http-response-security-headers.md) | Proposed — pending human approval | **Accepted** |

Two of those status lines say more than a bare keyword, because a bare
replacement would have left a true status next to a stale sentence. **0012**
records the remedy #295 landed (`nextGlobalId` is a local of
`recomputeGlobalTopology`, so ids are handed out from 1 in canonical sorted order
on every recompute) and names the residue that was still open in code. That
residue — `chunkTopologies` was never evicted — has since closed too, in #324,
so §5 no longer carries it and what remains open there is the world-streaming
policy rather than the eviction. **0015** says 0012 is
Accepted, because the same commit falsified its old "Extends ADR 0012, which is
Proposed".

### The three room decisions (#314)

The three entries this file carried as *genuine open decisions* — shipped
against not at all, or only in part.

| ADR | Was | Is |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Proposed — pending human approval; amended 2026-08-25 | **Accepted, 2026-08-25 — as amended** (Decision §1 superseded by that amendment) |
| [0023](./0023-room-occupancy-authority.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as amended**; *not* superseded by 0028 |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |

What was signed for **0022** is the amendment (the Rooms tab, shipped in #312),
not the Decision text, which is left verbatim as the historical record. **0023**
was kept accepted rather than superseded so that its authored *nominal* fallback
stays available if object placement proves too large — and because it was kept
alive it could not be left stating something false, so it carries a dated
amendment recording that a capacity-only fallback is a **no-op**: the capability
half of `findAvailable`/`findBestAvailable` is what refuses a zoned cell, and a
nominal capacity of 2 would leave every arrival accruing
`accommodationBacklogTicks` exactly as `capacity: 0` does. **0028** got the
status line and nothing else: editing its phases in the commit that approved
them would have been the approval deciding something the owner did not.

### The four in this commit

| ADR | Was | Is |
| --- | --- | --- |
| [0024](./0024-protocol-fault-recoverability.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0025](./0025-guard-hiring-surface.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0026](./0026-entity-id-lifetime.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the framing and the tripwire; its three questions stay open** |
| [0027](./0027-cell-sharing-assessment.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the mechanism; its three questions stay open** |

**0024 dragged the one thing in the corpus that had to move with a status, and
that was the point of it.** Accepting it deleted the implementation note in
`docs/adr/0006-simulation-worker-adapter.md` ("a protocol decode error no longer
reaches state 5") and narrowed ADR 0006 state 5's clause to an unhandled
exception, with a one-sentence cross-reference to 0024 for where a decode error
goes instead. That note existed precisely so an Accepted ADR would not be amended
on a Proposed one's authority; the acceptance supplied the authority and the note
had nothing left to record. Nothing else in the corpus depended on it —
re-verified by grep at this commit: the only other references to it were 0024's
own Status and Follow-up, both rewritten in the same commit, and the two
remaining notes of that shape (`0006`'s states 1-2 and `0003`'s decision 4)
belong to the handshake gap in §5 and are untouched. `main` needed no change in
`src/` to comply with 0024, because the code that proposed it already
implemented it.

**0025 sets no wage figure and settles nothing wider than its surface.** The
approval covers three separable things — the Staff panel in the Security tab's
rail slot, a one-off charge read from `wageBand.minPerDay` in the treasury's
minor units, and a producer offering `staff-role.guard` against a command that
accepts any *declared* role. Prices stay with issue #29, per ADR 0017 decision 5.
All **seven** items in that ADR's *What this decision does not settle* remain
open and were deliberately not touched: payroll, where in a band an individual
sits, dismissal and refunds, undoability, which roles the surface offers, whether
the panel lists who is hired, and whether the arrival tile must be owned, in
bounds or reachable.

**0026 and 0027 are accepted as framings, not as answers**, and their status
lines say so rather than leaving a reader to discover it. 0026 approves that its
three questions are one decision, that the defect is pinned in the suite as a
labelled tripwire rather than fixed quietly, and that #31 is where the answers
get taken; options A, B and C and question 3's three shapes are exactly as open
as before. 0027 approves the mechanism that landed — the rating seam on
`findBestAvailable`, one term, occupants sorted ascending by entity id, advisory
and stateless — and leaves its three questions open. **The owner was told when
approving 0027 that its subject was "unreachable in any session a player can
start"**: that a zoned room derives capacity zero while nothing is placed in it,
so nobody shares a cell and the decision's effects are not observable until a
shipped session can place an object into a zoned room. **That is recorded here as
what was said, because it was wrong** — and wrong already on the day it was said,
not overtaken since. 0028's phase 1 had shipped, a player can place a bed, and
§5's rewritten ADR 0027 entry carries the measurement: two prisoners housed in
one `room.cell` instance through commands only a player sends. What the approval
does leave open is narrower and is in §5 — the *rating* between two eligible
cells is exercised nowhere, because no shipped session yet furnishes two.

---

## 2. Eight entries: #382's two rulings in ADR 0008 §2, 2026-08-27's scope clause for its §3, the Worker that lands with telemetry ingest, ADR 0056's price for keeping a player's orders in order, ADR 0059's price for making them walk, ADR 0074's price for reading a restored room's rectangle, ADR 0071's open-area amendment, and ADR 0077's price for asking whether the edge in front of an actor is still standing

**This heading has now read "empty", "exactly one entry: ADR 0029", "empty
again", one entry, two, one, empty for the third time, one again, and — on
2026-08-27 — three** —
0031, 0032, 0033 and 0007's amendment were all accepted on 2026-08-26. Two of those four
never appeared here at all, which is the failure recorded at the foot of this
section, and the churn in this heading is the point rather than noise: it is the
only place a reader can see how fast this corpus moves. **Two of the three
entries it holds are amendments rather than new documents**. Counting from this
section's own record that 0007's was the first amendment ever to have a row here,
the amendments queued in this file are 0007's — by its author's own instinct —
and ADR 0008's two, both queued by the ruling recorded in
`docs/adr/README.md`. An amendment is queued here for the
same reason a new ADR is: it decides something the sections above it do not, and
nothing else in the corpus would tell the owner that a decision is waiting.
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR is invisible to every mechanical gate there is;
this row is the only thing that says it exists. 0029 was accepted on 2026-08-26 and
its entry was deleted, which is what this section's own rule prescribed — the
entry said *"this entry is deleted"* as part of the exact recipe for accepting
it, and following that recipe is the whole point of writing one.

The rule this section states — *"any commit that adds an outstanding ADR adds an
entry here in the same commit, giving the evidence, what settling it commits the
project to, and the exact line that would replace the status"* — is followed by
0031, and the account of why the queue was emptied is kept below unchanged,
because it is the argument for why one row is worth reading.

**The rule's trigger is unchanged by the 2026-08-27 ruling, and that is the
ruling's main point.** `docs/adr/README.md`'s *"An amendment to an accepted ADR"*
section settles what this file filed in §5 as the owner's question — whether
*"applies an accepted decision"* and *"amends an accepted decision"* can be told
apart by anything a reader can check. They cannot, so **the answer is not to
widen this rule to cover amendments as a class**: exactly one of the seventeen
post-hoc additions in `docs/adr/` ever had a row here, and widening a rule this
section already calls *"unsatisfiable under concurrency"* would have condemned
sixteen of them on the day it landed. What the ruling requires instead is form —
an amendment is a dated `Amendment`/`Addendum` section that says in its own
opening whether it was approved — so that *outstanding*, which is and stays the
trigger, is something a reader can see rather than reconstruct. The entry below
is the one case where nobody could see it.

What the round trip is worth recording for: 0029 arrived on the same branch as
its implementing code, and **it sat `Proposed` on `main` for a day while that
code was already shipping.** That is precisely the fragile case this section
names, met in practice rather than in theory. The queue did its job — the row was
the reason anyone knew a decision was outstanding — but the gap between the code
landing and the status moving is the cost, and it is not zero.

The account of why the queue was emptied the first time is kept below unchanged,
because it is still the argument for why one row is worth reading.

### ADR 0008 §2's two rulings (#382) — awaiting approval

**What is waiting.** Two rulings #382 wrote into
[ADR 0008](./0008-trusted-service-boundary.md) §2 on 2026-08-26 as decided, with
no approval caveat and — until 2026-08-27 — no heading, no date in the document
structure and no row here. ADR 0008 is `Accepted` and **stays** `Accepted`; that
keyword is not what is in question and no status moves either way on this. Both
rulings now sit under dated `#### Amendment, 2026-08-26 (#382, …)` headings in §2,
each with an opening paragraph saying that the only warrant behind it is #382's
judgement.

1. **A Data API role holds exactly the DML privileges its zone needs on a table,
   and nothing else** (issue #280 finding F14). Its own words for the general
   part: *"The rule this settles for every future table is that a new relation in
   `public` starts closed, and its migration opens exactly what it means to
   open."*
2. **Authority over a row is not authority over the record of when it was
   written** (issue #194). It narrows §2's *"Prison simulation state, saves,
   settings — Z0/Z1 (client-authoritative, RLS-scoped)"* row by ruling a
   `created_at`/`updated_at` column out of a row's *content*: the timestamp's
   authority is Z2 even on a table whose payload is Z0's.

**The evidence, and it is not in dispute.** Both are executed in SQL, not merely
written down. `20260826120000_revoke_ambient_table_privileges.sql` revokes
`REFERENCES`, `TRIGGER` and `MAINTAIN` and the `ALTER DEFAULT PRIVILEGES` entries
that handed them back; `20260826130000_server_stamp_updated_at.sql` stamps
`updated_at` from a `BEFORE INSERT OR UPDATE` trigger on `prisons`, `profiles`
and `user_settings` and keeps the column out of every client grant. So the
question is not whether the code matches the rulings — it does — but whether the
rulings are the project's or one pull request's.

**What approving commits the project to.** Ruling 1 binds every migration written
from now on: a new relation in `public` starts with a null ACL and its own
migration opens exactly the privileges it needs, which is a per-table cost paid
forever in exchange for the class of ambient-privilege defect that produced #163,
#280 F14 and F15. Ruling 2 says a client never writes a server timestamp, and
pre-commits the alternative: *"If a client-side edit time is ever needed for
reconciliation it gets its own column, named for what it is (`client_edited_at`)"*
— so approving it also closes off the cheaper option of reusing `updated_at` for
that.

**The exact edit that accepts them.** In
[ADR 0008](./0008-trusted-service-boundary.md) §2, both `#### Amendment` headings
gain `— approved <date>` and their opening paragraphs lose the sentence saying
nobody has approved them, replaced by who approved what; the two rulings'
own paragraphs are not touched, because they are the text being approved. The
`0008` row in [`README.md`](./README.md) is unaffected — its status keyword is
`Accepted` either way. **And this entry is deleted**, which is the recipe this
section prescribes and the thing following it is for.

**If the answer is no**, the two rulings do not simply get struck: the two
migrations above have shipped, so rejecting either is a decision to write a
migration that reverses it, and the ADR text becomes the record of a rule that
was tried. Say which of the two, because they are independent — ruling 1 is about
grants on future tables, ruling 2 about one column's authority — and #382 argued
them separately.

**Why this is one entry rather than two.** They landed in one pull request, on one
reading of §2's zone taxonomy, and the governance question they raised is common
to both. The substance is separable and the answer may differ per ruling; the row
is shared because the thing the owner has not seen is the same thing twice.

### ADR 0008 §3's scope clause (2026-08-27) — the reading is the owner's, the wording is not

**What is waiting, and it is narrower than the entry above.** The owner **has**
decided the substance: the amendment of 2026-08-26 recorded that §3's scope was
unstated and put two readings to them — bind §3 by *runtime* (§1's zone list) or
by *authority* (§2's table) — and they chose **by authority**. The amendment
dated 2026-08-27 at the foot of
[ADR 0008](./0008-trusted-service-boundary.md) writes that choice down. ADR 0008
is `Accepted` and **stays** `Accepted`; no status moves, and the `0008` row in
[`README.md`](./README.md) is unaffected.

**So why a row at all.** Two reasons, and the first is the one this section's
own text gives: *"an amendment inside an accepted ADR is invisible to every
mechanical gate there is; this row is the only thing that says it exists."* The
second is that a choice between two readings does not approve the consequences
drawn from it, and this amendment draws several the owner has not seen. Those
are what is outstanding:

1. **The clause's wording is the editor's.** The owner's draft, quoted in the
   2026-08-26 amendment, was *"every mutation path over Z2-authoritative
   state"*. What landed is *"every mutation path over state that §2's authority
   table assigns to Z2, and only those"*, plus a decide-versus-touch test. The
   amendment argues both changes; neither was put to the owner.
2. **`create_save_version` falls outside §3, and the argument for it is the
   weakest joint.** The pointer columns `current_revision` and
   `current_version_id` are out of every client grant and
   `src/persistence/cloud/sync-engine.ts` orders reconciliation by one of them,
   which is close to what §2's 2026-08-26 ruling calls the server's own
   statement. The amendment distinguishes them — the pointer is caller-proposed
   and server-validated, a timestamp is server-computed — and says in terms that
   a reader who disagrees should add a §2 row rather than re-argue the
   paragraph. That is a real fork.
3. **A new threat row, T13**, for flood, forgery and retention evasion against
   an unauthenticated ingest. It is an addition to an accepted threat model.
4. **An obligation the clause creates rather than removes:** a telemetry
   retention or deletion job is *inside* §3, because deciding what is kept is
   the half §2 assigns to Z2. So is the `service_role` column `UPDATE` that
   writes a challenge verdict, which §1's runtime list would not obviously have
   caught.

**What approving commits the project to.** That §3's six steps are demanded of
entitlements, payment facts, challenge submissions and challenge verdicts, and
are **not** demanded of cloud saves, prison creation or telemetry ingest; and
that any future path claiming either answer names a §2 row first, adding one in
the same commit if none covers it.

**What it does not buy, and the amendment says so in its own part 6.** §3 step
1's only enforcement is the pgTAP suites. They sweep database roles by literal
name — `anon`, `authenticated`, `service_role` — so a dedicated Worker role would
be unswept, and a Worker calling a `SECURITY DEFINER` function with a server key
is indistinguishable from any other holder of that key to PostgreSQL. **Nothing
red appears if this boundary is later got wrong.**

**If the answer is no on any of the four**, the clause itself still stands —
the reading was the owner's — and what changes is the consequence. Say which
number, because they are independent.

**The exact edit that accepts them.** The 2026-08-27 `## Amendment` heading in
[ADR 0008](./0008-trusted-service-boundary.md) gains `— approved <date>`, and
its opening paragraph's second half — the one saying the wording and the
consequences are the editor's and open — is replaced by who approved what. The
clause, the table and T13 are not touched, because they are the text being
approved. **And this entry is deleted.**

### The first server-side entry point (2026-08-27) — the order is decided, the pre-merge approval is not

**What is not waiting.** The owner has decided the *order*: telemetry ingest
needs a `main` in `wrangler.jsonc`, they were offered "separate staging from
production first" or "add the Worker together with the ingest", and they chose
the second — one deliberate change, with what lands on `lockstate.io` written
down and approved before it merges. That choice is recorded in
[`docs/DEPLOYMENT.md`](../DEPLOYMENT.md), "The first server entry point lands
with the ingest, not before", which is where a person looks before touching what
serves the live site.

**Why it is nonetheless in this file.** Because the condition attached to the
choice is a **future approval that nothing will ask for**. `lockstate.io` is
served by `lockstate-staging`; the `staging` job publishes on every merge to
`main` whose CI concludes `success`; and the gate on that row is a CI conclusion,
not an approval. So the merge that adds `main` is the act that puts executing
code on the public site, and no workflow will pause to ask. This row is the
standing reminder that the approval is owed, and it is deleted by the change that
obtains it.

**What the owner is being asked for, and when.** Not now — at the pull request
that adds `main`. Nine items, listed in full in that `docs/DEPLOYMENT.md`
section and summarised here so this row is readable on its own: the commit and
the fact that merging it publishes; which requests the handler claims and that
everything else still falls through to Static Assets; what the Worker may hold;
what it must not — **never a `service_role` key**, because that role may call
`record_entitlement_event`, so a public Worker holding it would hold the
paid-entitlement write path; server-side validation, bounding, and a
server-decided occurrence time and weight; whether `public/_headers` changes;
rollback; the wrangler trap; and ADR 0002's amendment.

**The credential is the sharp one, and it is unswept either way.**
`supabase/tests/003_data_api_grants.test.sql` pins the privilege surface of
`anon`, `authenticated` and `service_role`, each named as a literal. A dedicated
least-privilege role for the Worker — which is the mitigation — is seen by none
of it unless that suite's role list is extended in the same change. Extending a
pinned list is what adding a role looks like here.

**Whether ADR 0002 needs amending now: no, and the reason is which sentence goes
false.** Its rejected alternative *"Add a Worker server entry point now"* is
**honoured** rather than overturned — it was rejected because *"a placeholder
server would add routing and security surface without product value"*, and a
Worker that arrives carrying the ingest is not a placeholder. What goes false is
the Decision bullet *"Deploy the current application as an assets-only Worker
with no application-server entry point"*, and it goes false in the commit that
adds `main`, not on the day the decision to do it was recorded. Amending it today
would put the document ahead of the code. **If the owner disagrees and wants ADR
0002 amended now, that is the one part of this row that is a decision rather
than a reminder.**

**And this entry is deleted** by the pull request that adds `main`, in the same
commit — which is this file's standing rule that landing the change an entry
describes means updating the entry with it.

### ADR 0056 (2026-08-28) — the fix is decided, the second of simulated time it costs a player is not

**Filed by the change that implements it, which is what §2's rule asks for.**
`agent/437-undo-inversion` adds
[ADR 0056](./0056-keeping-a-players-orders-in-the-order-they-gave-them.md)
alongside the code it decides, so this row arrives in the same commit rather
than being reconstructed later.

**The evidence.** Issue #437 is reproduced on `6f671d5`, driving the shipped
`SimulationCommandSender` against the shipped `SimulationWorkerStateMachine`
with a real `Kernel`, `FixedStepClock` and `ConstructionSystem`. A player who
places a wall, presses play, places a second wall, pauses inside the twenty-tick
lead and presses Undo has **the first wall cancelled and the second one built**
— because `projectExecuteTick` collapses backwards on a pause, so the Undo
carries a higher `sequence` at a lower `executeAtTick` and dispatches first.
Re-run with the transaction id per gesture that the shipped HUD actually mints,
the outcome is one step worse than the issue reports: both undo and redo stacks
end empty, so the wrongly cancelled wall cannot be recovered by any gesture.
The defect survived [ADR 0051](./0051-what-a-player-sees-for-an-order-given-while-the-clock-is-paused.md)
with every reported value unchanged but by a different route, which was measured
rather than assumed: that ADR (#460) replaced the very dispatch mechanism #437
names, so "the mechanism has changed" was treated as a reason to re-measure and
not as a reason to assume the issue was stale.

**What settling it commits the project to.** Two things, and only the second is
a judgement call.

1. *That the ordering fix is right.* It is the remedy
   [ADR 0020](./0020-deterministic-kernel.md)'s own closing section names and
   leaves open, it refuses nothing, it touches no simulation code, and the
   determinism scenario's state hash does not move.
2. *That the price is acceptable.* An order given during a pause that began
   **within one second of the previous order** now takes effect on the first
   step after play rather than immediately — which narrows ADR 0051's promise
   that "`Undo` takes back the thing the player just did instead of nothing".
   The window is bounded by one command lead and by nothing else; outside it
   ADR 0051 is untouched. ADR 0056's open question 1 names the alternative that
   would keep immediacy — rebasing pending commands down to the current tick
   when the player pauses — and does not take it.

**A third thing the owner should see even though it is not being decided here.**
ADR 0056 records that grounds 2 and 3 of ADR 0020's *"Decision, 2026-08-27"*
are overtaken by this change: they are costs of refusing an `executeAtTick`
*below* the highest queued, and the shipped sender no longer submits one, so the
kernel-side guard that decision rejected is now inert rather than expensive
against the front door. **Ground 1 is untouched and is what the decision rests
on.** #437 puts a kernel-side refusal out of scope and this branch does not
re-open it; the note exists so the next reader of that section knows two of its
four numbers describe a front door that has changed.

**The exact line that would replace the status**, in
`docs/adr/0056-keeping-a-players-orders-in-the-order-they-gave-them.md`:

```
**Accepted, <date>.**
```

replacing `**Proposed, 2026-08-28.** Not self-approved.`, with the matching
`Proposed, 2026-08-28 — …` prefix in that ADR's
[`README.md`](./README.md) row changed to `Accepted, <date> — …`, **and this
entry deleted in the same commit**, which is this section's standing recipe.

### ADR 0059 (2026-08-28) — the walk is decided, the day it eats is not

**What is waiting.**
[ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md), `Proposed`,
landed with its implementation on `agent/414-delta-channel`. It answers
[ADR 0040](./0040-the-shape-of-the-render-delta-channel.md) open question 1: an
actor that has a resolved route walks it, one tile per two kernel ticks, with
sub-tile progress in a transient store no save carries.

**The evidence, and it is measured rather than argued.** The render delta
channel has been live at a 100 ms ceiling since ADR 0040 slice 1, and actors
still teleported, because `ActionSystem.continueTravelling` wrote the
destination anchor in the statement that resolved the route — a position that
changed twice per errand. Mutating that line back reproduces the defect exactly:
30 tiles in one tick against the 1 the guard now requires.

**What approving commits the project to**, and each of these is a cost rather
than a benefit:

1. **A walking speed of ten tiles a second, chosen against a 2,400-tick day.**
   It is bounded below by starvation, measured twice as the speed was raised:
   one prison starved its prisoner at 2.5 tiles/s, and a second, larger one
   starved at 5, because a journey outlasted the 100-tick regime block that had
   sent them on it. It is bounded above by looking like sliding — 640 px/s at
   1× zoom is hurried. **The day length is the parameter that forced both
   raises**, and ADR 0059 open question 1 hands that back.
2. **A prisoner spends 18–28% of the day in transit** where they spent 3.5%.
   Twenty-five integration assertions were re-measured for it.
3. **[ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)'s
   exact-equality result does not survive it.** Six prisoners no longer bottom
   out at identical hunger, because six cells at six distances give six
   different days; the spread is bounded at three levels and no longer tracks
   scan position, which is what #434 was about, and the assertion says so
   rather than being deleted.
4. **A refusal at a room's door reconsiders on the spot**, which mitigates
   [ADR 0029](./0029-concurrent-room-use-claims.md)'s wasted trip without taking
   the reservation-with-expiry that ADR's own revisit condition prescribes. Two
   mechanisms for one race is how the next defect gets written, so if open
   question 2 is ever answered, that line goes.
5. **A save taken mid-journey restores the prisoner idle on the tile they had
   reached.** That rule is not new; how often it is reached is, and one riot
   fixture's live and restored arms now spend a 400-tick window 24 ticks apart
   in what they get through while doing the same things.

**The exact line that would replace the status.** In
[`0059-how-an-actor-gets-from-one-tile-to-the-next.md`](./0059-how-an-actor-gets-from-one-tile-to-the-next.md),
`**Proposed, 2026-08-28.**` becomes `**Accepted, <date> — <by whom, and what
was read>.**`, with the matching `Proposed, 2026-08-28 — …` prefix in that ADR's
[`README.md`](./README.md) row changed to `Accepted, <date> — …`, **and this
entry deleted in the same commit**, which is this section's standing recipe.

### ADR 0074 (2026-08-29) — the recovery is decided, whether a legacy prison should silently change under a player is not

**What is waiting.**
[ADR 0074](./0074-what-a-restored-room-that-recorded-no-rectangle-is.md),
`Proposed`, arrived with the change that implements it (#571,
`agent/559-v4-room-bounds`). A restored room instance that recorded no rectangle
recovers one from the zoning plane the same payload already carries, rather than
keeping [ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md)'s
unbounded answer. It **amends ADR 0071 decision 2**, whose sentence still
describes the code correctly but whose *example* — "a V4 save" — was wrong.

**The evidence, and it is measured rather than argued.** `94adf1c` (v0.0.61, a
shipped build at `SAVE_SCHEMA_VERSION` 4) was checked out and *its own* path run
to produce `tests/fixtures/persistence/save-v4-yard.json`; every byte including
the checksum is what a V4 build wrote. Through the real restore path an 8×8 yard
answers **`Infinity`** where the same yard zoned by this build answers **4**. So
#554's balance change does not reach a restored prison, and nothing on screen
says so.

**That measurement was taken before the recovery landed, and it is kept
because it is why the decision exists — but it is not true of `main` and has
not been since `d0af2d7` (#571).** Through the same restore path at
`53e1405` a restored 8×8 yard answers **4**, the number the live zoning gives,
and `tests/migrations/save-v4-room-bounds.test.ts` pins it: *"restores a yard
bounded by the ground the save says it covers, not an unbounded one"* asserts
`expect(ceiling).toBe(YARD_PLACES)` and, beside it,
`expect(ceiling, 'issue #559 is that this was Infinity, so the claim gate
never refused').not.toBe(Number.POSITIVE_INFINITY)`. Run at this anchor:
`./node_modules/.bin/vitest run tests/migrations/save-v4-room-bounds.test.ts`
-> `Test Files 1 passed (1) / Tests 9 passed (9)`. **Both sentences stand. The
paragraph above is the evidence the decision was taken on and the paragraph
here is the state of `main`**, and overwriting the first would delete the only
statement of what the bug was.

**Why this correction was owed, and why no gate could have asked for it.**
[Issue #608](https://github.com/matmaxalez/lockstate/issues/608) raised it from
an independent re-audit against `23edabc` (v0.0.213) and made the argument
against itself first: read in context the `Infinity` sentence sits under *"The
evidence, and it is measured rather than argued"*, and the paragraph after it
opens *"Refusing it costs #559 staying open"*, so the passage is the case
**for** the change and the sentence is a record of what was found. **That
reading does not save it, and this file's own introduction is what settles
it**: *an entry's evidence is a claim about `main`, so landing the change an
entry describes means updating that entry in the same commit.* #571 landed the
recovery and did not update the entry, so a reader trusting the contract this
file states was misled — the exact class this file exists to catch, occurring
inside the file itself. The audit was right on the substance and slightly
overstated in form, and both halves are recorded because *"a false claim"* and
*"a true record the file's own rules require to be updated"* are different
defects with different fixes.

**And the gap in scope is the more useful half.** The `cfab558` re-anchor
(#583) re-read §§3-6 against its diff window and swept §2's four counters.
**§2's entry *content* was in neither scope**, and no delta could have raised
it: `docs/adr/0074-…md` did not change in that window, this file's §2 is not
covered by the §§3-6 derivation, and the sentence that went false is prose in
a section the method never opens. So this is the same structural blindness the
header records twice already — a delta pass cannot see a claim falsified
outside its enumerated set — arriving in the one section the method excludes
by construction. **The scope question is left open for the owner rather than
decided here**: whether re-anchoring should read every §2 entry whose subject
has since landed is a change to what a re-anchor costs, and #608 asks it in
those terms. What is decided is the instance, in both directions, above.

**Two entries carry evidence of the same shape and were deliberately not
checked, which is stated rather than left for the next reader to discover.**
ADR 0056's row opens **"The evidence."** and reproduces #437 on `6f671d5`;
ADR 0059's opens **"The evidence, and it is measured rather than argued."**
and gives a 100 ms render-delta ceiling and a 24-tick fixture divergence.
Both are present-tense measurements on named trees, exactly like ADR 0074's,
and **neither was re-run at this anchor** — their subjects are outside this
window and outside §§3-6, and this pass's scope is the delta plus the seven
counts plus the one entry #608 names. **That is a gap, not a verdict**: it is
not a claim that either has gone false, and the only way to find out is to run
them. Named here so that whoever decides #608's scope question has the size of
the job in front of them rather than having to re-derive it.

**Refusing it costs #559 staying open**, and the alternatives on the table are
both worse. A migration provably cannot reach the case: restore that payload,
run it, capture it, and the new envelope declares version 5 and decodes with
`migrated: false` while **still carrying the boundless row** — so the class of
save needing repair was never "V4 saves", and a repair inside
`migrateSaveEnvelopeV4ToV5` would have been offered such a save exactly once.
The other alternative is a guessed finite capacity, which invents a number.

**What approving commits the project to**, and this is the cost rather than the
benefit:

1. **One widening.** A restored legacy room gains object attribution and
   instance-scoped removal it did not have. Both move it *toward* what a room
   zoned in this build already does, which is the argument for them — but they
   are still behaviour a player's existing prison did not have yesterday, and
   ADR 0074 decision 6 deliberately ships **no player-facing string** saying so,
   on the ground that copy describing a "repair" would be a promise about a
   save's history nothing in the tree can substantiate. **Whether a legacy
   prison should change under a player without being told is the part that is
   the owner's**, not the arithmetic.
2. **A recovery recomputed on every load.** Nothing is written to any file, so
   rejecting this later costs a revert and no player's prison — which is the
   whole reason it was built this way (ADR 0033's shape rather than ADR 0030's,
   for the reason [#391](https://github.com/matmaxalez/lockstate/pull/391)
   established, reached here on its own measurement rather than by deference).
3. **A row the plane cannot support keeps ADR 0071's unbounded answer**, pinned
   by a test so nobody later turns the residue into a silent guess.

**The exact line that would replace the status.** In
[`0074-what-a-restored-room-that-recorded-no-rectangle-is.md`](./0074-what-a-restored-room-that-recorded-no-rectangle-is.md),
`**Proposed, 2026-08-29. Not self-approved.**` becomes `**Accepted, <date> —
<by whom, and what was read>.**`, with the matching `Proposed, 2026-08-29 — …`
prefix in that ADR's [`README.md`](./README.md) row changed to
`Accepted, <date> — …`, **and this entry deleted in the same commit**, which is
this section's standing recipe. **ADR 0071's own text is a second, separate
debt** and is not discharged by accepting this one: its index row and its
decision 2 still name "a V4 save" as the unbounded case, and whether that gets a
marked amendment is the owner's call.

### ADR 0071's open-area amendment (2026-08-29) — the scoping is the owner's, the document it scopes is still `Proposed`

**What is waiting.** A dated amendment section in
[ADR 0071](./0071-what-bounds-a-room-whose-activity-consumes-no-object.md),
*"Amendment, 2026-08-29: floor-area capacity applies only to a room type tagged
as an open area (issue #585)"*, arrived with the change that implements it
(#585, `agent/585-occupied-place`). Capacity derived from a room's own ground
now binds only a room type explicitly tagged in `src/content/room-catalog.ts` —
`room.yard`, `room.holding-cell`, `room.delivery-bay` — and every other room
type answers **0** for an action that consumes no object, whatever its
rectangle and whether or not it has one.

**Two things are outstanding, and neither of them is the ruling.** The ruling
is the owner's, recorded on
[issue #585](https://github.com/matmaxalez/lockstate/issues/585) on 2026-08-29
in the owner's own words, and the amendment says so in its own opening as
[`README.md`](./README.md)'s *"An amendment to an accepted ADR"* section
requires. What a reader cannot see without this row is:

1. **ADR 0071 itself is still `Proposed, 2026-08-29. Not self-approved.`** This
   section's rule exists for exactly this: an amendment inside a document is
   invisible to `adr-numbering-contract.test.ts`, which counts documents by
   their `Status` line. So a reader meeting decision 1 has to be told both that
   it is proposed and that it is already narrower than it reads — and neither
   fact is reachable from the index row, which still describes the unscoped
   rule at length.
2. **The debt ADR 0074's entry named is still open.** That entry records that
   *"ADR 0071's own text is a second, separate debt … its index row and its
   decision 2 still name 'a V4 save' as the unbounded case, and whether that
   gets a marked amendment is the owner's call."* This amendment does **not**
   discharge it. It touches decision 2 only for the untagged case; "a V4 save"
   is still there and still wrong, in the ADR and in its README row.

**The evidence, and part of it is a correction to the ruling's own premise.**
Measured at `05640b6` (v0.0.210):

- **The decision being amended is ADR 0071's, not ADR 0017 decision 5**, which
  the ruling names. ADR 0017 decision 5 reads, in full: *"This ADR decides no
  prices and no balance values. #29 puts final pricing and balance out of scope
  and nothing here changes that."*
- **A bedless `cell` has never had floor-area capacity in this tree**, so floor
  area was not the cause of the exploit #585 measured. `residentCapacity` is
  the summed `footprint.width` of the `'sleep-surface'` objects standing in the
  room (`src/simulation/objects/room-capacity.ts:176-201`, ADR 0028 decision 2)
  and reads no rectangle; the rule this amendment scopes is the
  *concurrent-use* ceiling, whose three production callers
  (`src/simulation/prisoners/action-system.ts:820`, `:1067`, `:1082`) all pass a
  capability and all sit behind a `room-catalog-id` target, so only
  `action.yard-recreation` on `room.yard` can reach it.
- **The exploit was residency's and is fixed by the other half of #585.** Three
  prisoners assigned above one standing bed earned **900 minor units a day
  before and 300 after**, against a control's unchanged 300, measured through
  the real command router.

**So this amendment changes nothing a player can currently reach**, and that is
the argument for it rather than against it: `room.yard` is tagged, every
ceiling in the game is what it was, and not one number in ADR 0071 moves. What
it buys is that the door cannot open later — the next action naming no
capability, on any room type, cannot conjure a place out of a bedless cell's
floor, and cannot do it by omission either, because an absent tag means "not an
open area".

**What approving commits the project to**, and this is the cost rather than the
benefit:

1. **A per-room-type authoring obligation, paid forever.** Every room type
   added from now on is not an open area unless somebody says so. The only
   guard is `tests/unit/content-catalogs.test.ts`, which pins the tagged set as
   a whole rather than as three memberships, so a *fourth* room quietly
   acquiring the tag fails.
2. **A generality given up.** Decision 1 used to be a statement about rooms and
   is now a statement about three of them. A future room whose activity really
   is people on open ground gets nothing until it is tagged, and it will look
   like the pre-#326 defect when it does — a room that exists and admits
   nobody.
3. **The owner's own stated cost:** *"this is a change to a decision, not to an
   implementation, and every reader of [the ADR] who learned decision 5 in its
   general form now has to learn the exception."*

**Refusing it costs nothing a player would notice and leaves the door open.**
The tag, `RoomInstance.openArea`, the two registration sites and the domain
test in `openGroundCapacityOf` revert together; nothing is persisted, so no
save carries it and no prison changes under anybody.

**The exact line that would replace the status.** There is no status of this
amendment's own to move — that is the point of
[`README.md`](./README.md)'s ruling 3. Approving it means ADR 0071's own
`**Proposed, 2026-08-29. Not self-approved.**` becoming `**Accepted, <date> —
<by whom, and what was read>.**`, with the matching `Proposed, 2026-08-29 — …`
prefix in its [`README.md`](./README.md) row changed to `Accepted, <date> — …`
**and a clause added to that row recording that the document is amended**, on
the model of 0022's and 0023's rows — **and this entry deleted in the same
commit**, which is this section's standing recipe. Point 2 above is *not*
discharged by that and outlives it.

### ADR 0077 (2026-08-29) — the rule is decided, whether a lockdown may strand a walker is not

**What is waiting.** [ADR 0077](./0077-when-a-route-stops-being-valid.md), *"When
a route stops being valid"*, is `Proposed, 2026-08-29. Not self-approved.` It
landed at `827201e` (#581) with the change that implements it, and **with no row
here** — the omission [#615](https://github.com/matmaxalez/lockstate/issues/615)
records, and this entry discharges.

**The evidence, which is a reproduction rather than a reading.** SIM-001 from the
2026-08-29 audit pass rated *"active locomotion routes are not invalidated by
later topology changes"* HIGH/HIGH; the independent red-team pass reached the
same code as RED-002 and **declined to call it a defect**, because it had not
shown a legitimate present-day player sequence that leaves a walk alive across
the construction transition. Neither audit executed anything.
`tests/integration/wall-built-mid-walk.test.ts` is the producer-side proof the
second one refused to assume, through the real `PlaceBuildOrder` path on seed
`0x0b1ec7`:

| tick | what happened |
| --- | --- |
| 1,621 | the wall is standing, and the prisoner is **thirteen tiles short of it** |
| 1,657 | the prisoner crosses the walled edge — thirty-six ticks later |
| 1,663 | it finishes inside a cell nothing in the prison can reach |

The thirteen tiles are the point: the fixture is shaped so the window is
**measured rather than assumed**, which is the difference between "walked through
a wall" and "crossed on the tick it appeared".

**What settling it commits the project to.** Six decisions, and three of them
commit to something a later change cannot quietly undo.

1. **A required predicate on `LocomotionStore` (decision 5).** Not an optional
   one with a permissive default — a default of *"always allowed"* is precisely
   the state the audited tree was in. Making it required turned five call sites
   into compile errors, and `tests/helpers/open-ground.ts` is the named answer
   for fixtures that build no geometry. **This is the mechanism by which ADR 0059
   open question 4 — do guards walk — cannot reintroduce SIM-001 by omission**,
   so accepting it commits every future locomotion caller to answering the
   question at the compiler rather than at review.
2. **A standing gate on the cadence, not on the wall clock.** *"Once per tile
   crossed, not once per tick"* is a count, so unlike the microseconds beside it
   it survives a shared runner, which is why `docs/BENCHMARKING.md` refuses a
   wall-clock threshold and this decision still gets a gate.
   `benchmarks/scenarios/actor-render-publication.mjs` pins
   `canCrossCallsPerWalkerPerPublication` at exactly `1`. Both gates were watched
   failing: moving the predicate into the per-tick loop takes `canCrossCalls` to
   334 against 167 at smoke and 3,334 against 1,667 at full. **Accepting this
   commits to keeping that pin**, and the pin is what a later refactor would
   break silently.
3. **One passability ordering, one place (decision 4).** `canStep` in
   `local-search.ts` stops holding a second copy and goes through `edgeStanding`.
   The *policies* still differ legitimately; the ordering is now written once.

**The decision inside it that is written down as reversible, and the reason this
row exists rather than only the ADR.** Decision 6 puts doors inside the rule, so
a door **locked under a walker** — which is exactly what a riot lockdown does via
`setControlState(sectorId, 'lockdown')` (ADR 0057) — now stops that walker, where
before the walk continued through it. **The ADR states its own evidence for this
as negative and does not dress it up**: `riot-regime-loop`,
`incident-consequence-loop` and `incident-events-loop` all pass unchanged, and
**no test was written that watches a prisoner meet a door locked mid-walk,
because none existed to extend and building one was not reached.** The narrower
alternative is one line and is written out in the ADR so nobody has to re-derive
it under pressure: return `true` for `standing.kind === 'door'` instead of
consulting `checkDoorAccess`, keeping the whole SIM-001 fix, at the cost of a
lockdown that does not confine anybody already walking for the length of one
journey.

That is the part of this ADR an owner would want to have seen before it is
settled, and it is a playability judgement rather than a correctness one.

**What it does not cost, stated because the expensive alternative was the
tempting one.** No save-format change, no migration, no persisted field on a
walk — option C, the route validity token, would have been an
[ADR 0038](./0038-what-makes-a-save-compatible.md) question and a
`SAVE_SCHEMA_VERSION` conversation, and was rejected for that among two other
counts. **No determinism fingerprint moves**: no system added or reordered, no
RNG stream added or drawn from differently, the predicate a pure function of
world state. **No player-facing string** is added or changed. The one visible
consequence is recorded rather than hidden — an actor refused an edge steps back
up to half a tile, and the look-ahead that removes even that is named, costed at
double the predicate calls, and deliberately not taken.

**The number is provisional and the document pre-commits to renumbering.** ADR
0077's own preamble records that the assigner's branch sweep and the drafting
agent's `max + 1` off disk **disagreed** — disk said 0075, the sweep across every
remote head said 0077, because 0075 and 0076 sat unmerged on
`agent/econ-hardlock-and-recycling` and 0072 is held and unwritten. Both answers
are in the document on purpose. Since then 0075 and 0076 have merged and are
Accepted, so the sweep's answer is now visible on disk too and the collision it
avoided can be checked by anybody.

**The exact line that would replace the status:** `**Accepted, <date> — <by whom,
and what was read>.**` in
[`0077-when-a-route-stops-being-valid.md`](./0077-when-a-route-stops-being-valid.md)
and the matching change to its [`README.md`](./README.md) row, **naming whether
decision 6 is taken whole or in its narrower form**, because those are different
games and the ADR says so. **Delete this entry in the same commit.**

### ADR 0031 — accepted 2026-08-26, and the entry is deleted

Following this section's own recipe: the decision was settled, the accepted count
moved by one, and the entry it replaced is gone rather than annotated. What is
kept is the one thing the entry could not have predicted, because a reader of
0031 needs it and the deleted entry is where they would have looked for it.

**It was accepted with a condition, not plainly.** Open question 4 of that ADR
("is the catalogue the right donor?") is promoted to *blocking*: the catalogue
needs a surface of its own before more rows arrive. The entry deleted here argued
the trade on a `BUILDABLE_REGISTRY` of two rows; the amendment at the foot of the
ADR re-argued it at four and reported three of four behind a scroll at 900x600;
ADR 0028 phase 4 then landed **twenty-one**. At the row height and list box that
ADR measured, that is one row of twenty-one visible — derived from its own two
figures, not re-measured, and labelled as derived in its Status.

The generalisable part, and the reason this closure is longer than "deleted": a
queue entry states the price of a decision *at the moment it is written*, and
nothing re-reads it when a later change multiplies that price. This one was
multiplied twice by an unrelated ADR's phases, between being written and being
approved. **A queue entry whose argument rests on a count should name the count
and where it lives**, so that the next reader can check it in one command rather
than trusting the number. This entry did not, and the acceptance had to
reconstruct it.
### ADR 0007's amendment — accepted 2026-08-26, and the entry is deleted

Following the exact edit this entry itself prescribed: the amendment's heading
lost `(awaiting approval)`, the sentence saying it was unapproved is gone, and
this entry is deleted. **No `Status` line moved and no row in
[`README.md`](./README.md) changed**, because 0007 was Accepted throughout and an
amendment to it does not touch that — which is precisely why this row was the
only record that a decision was outstanding.

What is kept, because deleting it would leave nothing behind: the approval is now
recorded **only in the amendment's own opening paragraph**. Every mechanical
check in this repository counts documents by their `Status` line, so from this
commit onward there is no gate, no index row and no queue entry that could tell
anyone this decision was ever pending, or that it was decided. That is the
structural gap this entry existed to cover, and closing the entry re-opens it.

The generalisable part, since this is the second time in one day the same shape
has cost something: **a decision that changes no `Status` line has no home in
this corpus.** 0032 and 0033 were both approved without ever getting an entry
here because the file was held by other work; this amendment got one and it
worked exactly as designed. The difference was not diligence, it was contention —
so the fix is a queue two commits can append to without conflicting, not more
care.

### Four ADRs have now been accepted without ever appearing in this queue

0032, 0033, **0034 and 0035**. All four the same way, and the rule has now failed
more often than it has worked, so the count is the finding rather than any one
instance.

0034 and 0035 were written in the same hour by two agents, each told this file was
out of scope because a third was rewriting it. Both did exactly what 0032's
precedent prescribes — debt recorded in the ADR's own Status, entry quoted
verbatim in the pull request — and both were then accepted before anyone was free
to write the entry. **The entries were never wrong, never disputed and never
written.**

What the four cases together show, which no single one did: the rule's cost is
paid by whoever holds the file, and its benefit accrues to a reader who may never
arrive. A rule with that shape is not obeyed less carefully over time — it is
obeyed until the first collision and then routed around, correctly, by people
doing the right thing. **The fix is structural and it is now overdue**: one file
per entry in a directory, so two commits can add two entries without touching each
other, and so "the file is held" stops being a reason.

The section that follows records 0032's case in the detail it was written with,
and is kept as the first instance rather than folded into this count.

### ADR 0032 was accepted without ever appearing in this queue

Recorded because it is this section's own rule failing, and the rule is worth
more than the appearance of a clean record.

[ADR 0032](./0032-incident-consequences-and-classification-review.md) — what an
incident costs the prisoner who was in it — arrived with its implementing change
on 2026-08-26 and was accepted the same day. **It never had an entry here.** Its
author could not add one: this file was held by concurrent work, so the
instruction they were given put it out of scope. They did the next best thing —
recorded the debt in the ADR's own Status, recorded it again in
[`README.md`](./README.md), and quoted the entry they would have written in the
pull request — and the debt was then paid by nobody, because the acceptance
arrived before the file was free.

Two things follow, and neither is "try harder".

**The rule as written is unsatisfiable under concurrency.** *"Any commit that adds
an outstanding ADR adds an entry here in the same commit"* assumes one writer.
With two changes in flight, one of them must either edit a file another is
rewriting or break the rule; the author chose to break it visibly, which was the
right call and should not be held against them. If this rule is to survive, the
queue needs to be something two commits can append to without conflicting — a
file per entry in a directory, most likely — or the rule needs to say what to do
when the file is held.

**An ADR can be approved faster than its queue entry can be written.** This
section is addressed to the owner and exists so a pending decision is visible;
0032 was visible enough to be decided without it. That is not evidence the queue
is unnecessary — 0031 sat for a day *with* an entry — but it is evidence that the
queue is not the only path, and a rule whose violation costs nothing observable
will be violated again.

### ADR 0075 and ADR 0076 — accepted 2026-08-29, and their entries were written and never filed

**Six, not four.** The heading above counted 0032, 0033, 0034 and 0035 and is
left standing, because what it counted is exactly right and the shape it named
is what happened again. These two are recorded separately rather than folded
into that count, because **they are a different failure and the difference is
the finding**.

The four above were *never written*. These two were written in full — argued,
evidenced, with the exact status line each acceptance would need — and handed
over as text in
`docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` §8, under a
heading that says so, with a stated reason:

> any count written here is wrong by one whichever way the two branches land, in
> all four places at once, and the merge conflicts in exactly the four
> paragraphs whose value is the record of how they came apart

That is this section's own *"unsatisfiable under concurrency"* diagnosis, applied
correctly by an author who could see it coming. They did the thing #571 had just
proved works: leave the file alone, hand the entry to a separate filing commit
that can read the true count off the merged tree. **The handover was right, the
reasoning was right, and the entries still never reached this file** — because
[#606](https://github.com/matmaxalez/lockstate/pull/606) accepted both on
2026-08-29 before the filing commit ran.

**So the entries are not filed here, and that is a decision rather than the
omission repeating.** Both were written ending in this section's standing recipe
— *"Delete this entry in the same commit"* — and both ADRs are now
`**Accepted, 2026-08-29, by the repository owner.**` Filing them in order to
delete them in the same commit would put two rows in this file that describe
decisions nobody is waiting on, which is the opposite of what §2 is for. The
full text of both survives in the research document, which is where a reader
who wants to know what the acceptance was weighing should be sent.

**What the pair costs, which the four above did not.** 0032's case established
that an ADR can be approved faster than its queue entry can be written. These
two establish something narrower and worse: **an entry can be written, correct,
complete, and deliberately routed around a known concurrency defect, and still
not arrive.** Diligence was not the missing ingredient in any of the six. The
window between "the entry exists as text" and "the entry is in the file" is
owned by nobody, and every instance so far has been lost inside it.

**And the acceptance route is worth reading beside this.** #606 records, in both
ADRs, that the owner's acceptance was given **against a summary of each ADR's
subject and its stated cost, as one of eight decisions, not against the full
text**. A §2 row is the artefact that would ordinarily carry that summary. Both
rows existed and neither was in front of anybody. That is not an argument that
the acceptance was wrong — 0075's and 0076's substance had already been ruled on
— but it is the clearest case yet of what this section is for, met by not being
there.

The fix named four cases ago is unchanged and is now overdue by two more: **one
file per entry in a directory**, so that a filing commit cannot be beaten to the
finish by an acceptance, and so that "the file is held" and "the count will be
wrong whichever way the branches land" both stop being reasons.

### Why the queue was emptied, and what that bought

**Before 0029, no ADR in `docs/adr/` was `Proposed`.** Twenty-seven documents,
twenty-seven `Accepted` statuses — several with a qualifier the document itself carries, which
is the honest form for a decision accepted in part (0013 §§1-4, 0026's framing,
0027's mechanism). Verified by reading each document's own status line and its
index row, not by trusting a table.

Two things follow, and the second matters more than the first.

**The count is zero rather than untracked.** The previous revision of this file
had to record that its own premise did not hold: the three room flips were
expected to empty the queue and left four behind. This one closes that, and it is
worth saying why the four were missed. **0025, 0026 and 0027 had never had an
entry in this file at all.** Each arrived with the change that wrote it — 0025
alongside the hiring surface it designs (#302), 0026 and 0027 as a pair in #299 —
rather than being drafted against `main` and left for review, so a file written
for the *retroactive-approval* problem never picked them up. That was a real gap
in this file's coverage, not a small one: three of the four remaining Proposed
ADRs were invisible to the only document that was supposed to be tracking them.
The gap is closed by the queue being empty, and the way to keep it closed is
stated below.

**The next `Proposed` ADR is a signal on its own.** While there were four or
eight, a new one was one of a crowd and nothing distinguished "awaiting a
decision" from "nobody has looked at this in a fortnight". From now on a
`Proposed` row in `docs/adr/README.md` is the only one, so it reads as a request
addressed to the owner rather than as background. That is the property this
exercise was for, and it is fragile in exactly one way: an ADR that arrives with
its own implementing change, as 0025, 0026 and 0027 did, is `Proposed` on `main`
from the moment it merges and can sit there unnoticed. **The rule that keeps this
true is therefore mechanical about the trigger rather than about the queue: any
commit that adds a `Proposed` ADR adds an entry here in the same commit**, giving
the evidence, what settling it commits the project to, and the exact line that
would replace the status. There was nothing to inherit — the queue was empty, so
the next entry would be the whole of it. **That next entry is ADR 0029, above,
and it arrived in exactly the predicted shape: with its own implementing change.**

`docs/adr/README.md` and the root `README.md` were both corrected in this commit
to stop claiming a queue; §6 records what was corrected and what was left.

---

## 3. Still outstanding: ADR 0013 §§5-6

**This section opened *"The one genuinely open decision left in the corpus"* and
that is false at `bb3a01e`.** It was true at `54418b6`, when no document in
`docs/adr/` was `Proposed`; nine were at `bb3a01e` (0042, 0043, 0046-0052, all
arrived in that delta, all listed in §5's first bullet). **Thirteen are at
`c00b641`** — 0053, 0054, 0056 and 0057 arrived in the eleven releases since —
and the sentence saying nine is left above rather than overwritten, because a
count that has now been zero, nine and thirteen across twenty-two releases is
this section's own evidence for stating a subject instead of a tally.
**Seventeen at `07add3e`**, nine releases later again — 0059, 0061, 0062 and
0063 — so the count has been zero, nine, thirteen and seventeen across
thirty-one releases and the sentence saying thirteen is corrected in place
beside the ones saying nine and one, for the same reason. **Twenty-one at
`01974e5`**, eleven releases later again — 0064, 0065, 0066 and 0067 — so the
count has been zero, nine, thirteen, seventeen and twenty-one across
forty-two releases, and the sentence saying seventeen is corrected in place
beside the rest, for the same reason. **Twenty-two at this anchor**, seven
releases later — 0068 alone, the client-side room-enclosure classification ADR
(#498) — so the count has been zero, nine, thirteen, seventeen, twenty-one and
twenty-two across forty-nine releases, and the sentence saying twenty-one is
corrected in place beside the rest, for the same reason. Counted on disk at
this anchor exactly as the header counts it — the first non-blank line under
each document's `## Status` heading: `0042`, `0043`, `0046`, `0047`, `0048`,
`0049`, `0050`, `0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`,
`0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068` — twenty-two, none of
0064-0067 accepted in the interval, all four still `Proposed` on disk, plus
0068 joining them.

**Twenty-seven at `cfab558`, and the sentence above spent four anchors saying
twenty-two while the header said otherwise.** Five more have arrived since
`4ace2da` — **0069** (how long a prisoner is held for, #541), **0070** (the
staff-dismissal ADR, #533), **0071** (what bounds a room whose activity
consumes no object), **0073** (who orders a contraband search) and **0074**
(what a restored room that recorded no rectangle is, #571) — so the count has
been zero, nine, thirteen, seventeen, twenty-one, twenty-two and twenty-seven
across **eighty-seven** releases — the span is measured from `54418b6`
(v0.0.121), where the zero was read, to `cfab558` (v0.0.208), which is the
same base the *"forty-nine releases"* above is measured from. The sentence saying twenty-two is corrected in
place beside the ones saying twenty-one, seventeen, thirteen, nine and one,
for the same reason every earlier one was.

**The lag is the finding rather than the arithmetic, and it is dated.**
Twenty-two was correct on the tree it was written against, `4ace2da`
(v0.0.177); it went false when 0069 landed at **#541**, inside the
`4ace2da..85c1c29` window. Three re-anchors have passed since, each moving
the header's copy of this number and none moving this one — and the
`85c1c29` pass wrote into the derivation subsection above that *"§3's
opening, §5's first bullet and §6's `income.ts` bullet now enumerate
**twenty-three** `Proposed` documents"*, which was **false on the tree that
wrote it**: all three said twenty-two. So this is the same shape as the four
places that count §2, in a different set of places, and nothing in this file
had named it. A next editor who greps for a count in this file should expect
**seven** places rather than four: the four that count §2, and these three
that count `Proposed`.

Counted on disk at `cfab558` by the method every reading in this sequence has
used — the first non-blank line under each document's own status statement,
`## Status` heading or `- Status:` bullet alike, 0064 and 0067 still being the
two in bullet form: `0042`, `0043`, `0046`, `0047`, `0048`, `0049`, `0050`,
`0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`,
`0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`,
`0073`, `0074` — twenty-seven. `0022` is still checked and still excluded, by
the nested-amendment reading recorded below. `docs/adr/README.md` agrees:
twenty-seven rows opening `Proposed` out of 68, and **Next free number:
0075**. **0072 is not on disk at all** — it is held for the events-persistence
decision, which the index's own next-free paragraph states — so a reader
re-deriving this list should expect a gap there and not a miscount. **`0022` was checked and is not a member of this tally at
all**, despite a bare `grep -l '^\*\*Proposed'` over `docs/adr/` matching its
file: that hit is `### Status of this amendment` — a dated amendment's own
approval marker, nested below the ADR's top-level `## Status` heading, which
for 0022 reads `**Accepted, 2026-08-25 — as amended...**` and has read that
since before this tally began. `docs/adr/README.md`'s row for 0022 agrees:
`Accepted, 2026-08-25 — as amended`. This is the grep trap this pass was
warned about, caught by reading the heading a hit sits under rather than the
hit alone, and it is recorded here because the same shape of hit could as
easily have added a document that belongs. What is
still true, and is why the section keeps its subject rather than being folded
into that bullet, is narrower and is the durable half: **0013 §§5-6 is the only
open decision in the corpus whose two halves are *partly enforced in a live
database*, and the only one this file has ever had to track by reading SQL.**
The seventeen are ordinary `Proposed` documents with index rows; this one is a
split status inside an `Accepted` one, which no index row can show.

**Thirty at `53e1405`**, seven releases later — **0075** (what a prison that
cannot afford its first bed is owed, #580), **0076** (what happens to a
resident whose bed is taken away, #580) and **0077** (when a route stops being
valid, #581) — so the count has been zero, nine, thirteen, seventeen,
twenty-one, twenty-two, twenty-seven and thirty across **ninety-four**
releases, measured from the same base as the eighty-seven above, `54418b6`
(v0.0.121), to `53e1405` (v0.0.215). The sentence saying twenty-seven is
corrected in place beside the ones saying twenty-two, twenty-one, seventeen,
thirteen, nine and one, for the same reason every earlier one was.

**And this time the correction was not a lag.** The `cfab558` pass moved this
sentence, §5's first bullet and §6's `income.ts` bullet together, after four
anchors in which only the header moved — so all three were read here at
**twenty-seven** before being moved to thirty, which is the first time in this
sequence that a re-anchor has found the three sections already agreeing with
the header rather than four anchors behind it. That is the sweep the previous
anchor named paying, and it is worth recording because the previous anchor's
own account of the same defect notes that *a sentence claiming they were
opened is indistinguishable, to every gate in this repository, from having
opened them.* All three were opened at this anchor, and the value found in
each before the edit is written here so the claim is falsifiable:
`git show 53e1405:docs/adr/STATUS-QUEUE.md` returns twenty-seven in all three
places — this sentence's opening, §5's first bullet's *"TWENTY-SEVEN at
`cfab558`"* and §6's *"it is twenty-seven"*. **The obvious command is the
wrong one and is worth naming**: `git show cfab558:docs/adr/STATUS-QUEUE.md`
returns twenty-**two** in all three, because an anchor names the tree a pass
*read* and not the commit that pass *wrote*. That pass's writing commit is
`d47edfd`/#583, which landed six commits later, and confusing the two is how a
count comes to be taken on one tree and written about another — the failure
this sequence has now recorded twice.

Counted on disk at `53e1405` by the method every reading in this sequence has
used — the first non-blank line under each document's own status statement,
`## Status` heading or `- Status:` bullet alike, 0064 and 0067 still being the
two in bullet form: `0042`, `0043`, `0046`, `0047`, `0048`, `0049`, `0050`,
`0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`, `0062`,
`0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`,
`0073`, `0074`, `0075`, `0076`, `0077` — thirty. `0022` is still checked and
still excluded, by the nested-amendment reading recorded below.
`docs/adr/README.md` agrees: thirty rows opening `Proposed` out of 71, and
**Next free number: 0078**. **0072 is still not on disk at all** — it remains
held for the events-persistence decision — so the gap a re-deriving reader
finds there is still deliberate and is still not a miscount.

**Thirty is TWENTY-NINE at `0637ab1`, and this is the first time in the whole
sequence that the count has FALLEN.** Every previous reading moved it up or
held it: nine, one, one, none, nine, thirteen, seventeen, twenty-one,
twenty-two, twenty-seven, thirty. The set changed by three documents in one
window and netted minus one:

- **0075 and 0076 left**, both to `**Accepted, 2026-08-29, by the repository
  owner.**` at `f0b98aa`/#606. They are the first documents to leave this count
  by being *decided* rather than by being renumbered.
- **0078 joined** (what keeps a prisoner safe), `**Proposed, 2026-08-29. Not
  self-approved.**`, at `19482be`/#612.

So the enumeration is now `0042`, `0043`, `0046`, `0047`, `0048`, `0049`,
`0050`, `0051`, `0052`, `0053`, `0054`, `0056`, `0057`, `0059`, `0061`,
`0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`,
`0071`, `0073`, `0074`, `0077`, `0078` — **twenty-nine**, plus 0013's split
and with 0022 still excluded. `docs/adr/README.md` agrees: **twenty-nine**
rows opening `Proposed`, counted independently with
`grep -cE '^\|.*\| *\*{0,2}Proposed' docs/adr/README.md`, which returns 29
here and 30 at `53e1405`. **0072 is still not on disk**, for the sixth anchor
running.

**Twenty-nine is THIRTY again at `898a16a`**, ten releases later, and the
count returns to a value it held two anchors ago. **That is the second time
this sequence has returned to a value it already held, not the first** — the
run opens `nine, one, one, none, nine`, so `nine` recurred at the fifth
reading, and a first draft of this sentence claimed novelty it did not have
until the earlier run was read back. **0079** joined (a sentence long enough to be a
history, #659, landed at `9a25700`), `**Proposed, 2026-08-30. Not
self-approved.**`, and nothing left. So the enumeration is now `0042`, `0043`,
`0046`, `0047`, `0048`, `0049`, `0050`, `0051`, `0052`, `0053`, `0054`,
`0056`, `0057`, `0059`, `0061`, `0062`, `0063`, `0064`, `0065`, `0066`,
`0067`, `0068`, `0069`, `0070`, `0071`, `0073`, `0074`, `0077`, `0078`,
`0079` — **thirty**, plus 0013's split and with 0022 still excluded, counted
on disk by the method every reading in this sequence has used: twenty-eight
under a `## Status` heading and two (0064, 0067) under a `- Status:` bullet.
`docs/adr/README.md` agrees: **thirty** rows opening `Proposed`, counted
independently, and **Next free number: 0080**. **The value returning is not
the same fact as the value never having moved**, and the difference matters to
this sentence's subject: thirty at `53e1405` was 0075, 0076 and 0077 arriving
together, and thirty here is that set minus the two the owner accepted, plus
0078 and 0079. The number is a poor summary of its own membership, which is
this section's standing argument for stating a subject rather than a tally.
**0072 is still not on disk**, and it remains held for the events-persistence
decision. How many consecutive anchors that has now been true for is *not*
restated here: the last two anchors did not restate it either, so continuing
the count from the last number written would be arithmetic over a gap, and a
streak figure nobody re-derives is the shape of sentence §4 of
`docs/AGENT_WORKFLOW.md` warns rots first.

**A miscount this pass made and caught, recorded because the next reader will
make it.** A first scan of this set returned **thirty-one** at `53e1405`,
disagreeing with the anchor that wrote thirty, and the disagreement was
briefly taken for a defect in that anchor. It was not: the scan counted
**0013**, whose status is `Accepted for §§1-4 … §§5-6 remain Proposed`, and
the convention this sequence has always used counts 0013 **separately** —
`docs/adr/README.md` says so in terms, *"twenty-two `Proposed` rows plus
0013's split §§5-6"*. The anchor was right and the scan was wrong. **A
mechanical re-derivation of a count whose convention is stated in prose will
disagree with the prose, and the prose is what defines the number**; that is
worth one paragraph because this file's whole method is mechanical
re-derivation, and this is the case where it does not settle anything on its
own.

A count in a section's opening sentence is the shape this file's own title
rotted twice on, and it has now done it here. Stated as a subject above rather
than as a tally.

0013 is **Accepted for §§1-4
only**, and that is not a formality: two of its six decisions are enforced in the
database and two are explicitly absent.

| ADR section | state | evidence |
| --- | --- | --- |
| §1 five free slots, enforced by the database | **shipped, accepted** | `base_save_slot_capacity()`, `account_save_slot_capacity(uuid)` |
| §2 a trigger, with an RPC as the front door | **shipped, accepted** | `enforce_prison_slot_capacity()` and its trigger |
| §3 over-capacity degrades read-only | **shipped, accepted** | the exception's `hint` |
| §4 4 MiB per-save payload bound | **shipped, accepted** | `max_save_payload_bytes()` — `as $$ select 4194304 $$;` |
| §5 256 MiB total per account | **absent, still Proposed** | no total-bytes function, trigger or column anywhere in `supabase/migrations/` |
| §6 20 revisions retained per prison | **absent, still Proposed** | no retention or pruning logic anywhere in `supabase/migrations/` |

Functions in that table live in
`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`, and every row
of that table was re-read against the file at this commit: `:45` and `:91`,
`:150` with its trigger at `:188`, the exception's `hint` at `:178`, and
`:71-73`'s `as $$ select 4194304 $$;`. Both
absences were re-verified at `898a16a`, unchanged since the previous anchor,
the one before it, the one before that, the one before that, and the one
before that — the directory has not moved across any of those windows and
still holds twenty-three files, counted again here (`ls
supabase/migrations/*.sql | wc -l` returns 23) — by grepping the
whole `supabase/migrations/` tree for a total-bytes, retention or pruning
mechanism (`total_bytes`, `retention`, `prune`, `268435456`, `max_revisions`).
**That grep returns one hit and the hit is not a mechanism**, which is worth
recording because the next reader will run the same command and have to make
the same judgement: `20260826130000_server_stamp_updated_at.sql:68` is a
comment reading *"The real exposure is a *future* reader: a retention or
cleanup job keyed …"* — a hypothetical this repository has not built, inside
the preserved reasoning of a different decision. A grep hit is not a claim,
and this file's own derivation subsection draws the same distinction for
`00NN` tokens.
**That grep
is no longer clean and the finding is unchanged**: it returns exactly one
hit, `20260826130000_server_stamp_updated_at.sql:68`, which is *prose* — a
comment naming a future retention job as the reason that migration bounds what it
bounds. A reader re-running the grep should expect it and not mistake a sentence
about a mechanism for the mechanism. There is
none, and the single hit for *"retention"* is a forward reference discussed below
rather than a mechanism.

**Unmoved at `07add3e`, and this is the cheap half of the pass — for the third
consecutive anchor.** No file under `supabase/migrations/` appears in
`git diff --name-only c00b641..07add3e` either, the directory still holds
twenty-three, and the six anchors into
`20260823100000_bound_free_tier_capacity.sql` above were each opened rather than
rested on the diff: `:45` and `:91` are the two capacity functions, `:71-73` is
`as $$ select 4194304 $$;`, `:150` is `enforce_prison_slot_capacity()`, `:178` is
the exception's `hint` and `:188` is the trigger. `DEFAULT_AUTOSAVE_INTERVAL_MS`
is still `30_000` and still at `:9` — worth saying because
`src/persistence/session/session-controller.ts` changed again in this window
(#486's refused-restore work, 65 lines) without touching the constant, having
changed in the previous window too (#468's save-import fix, 13 lines) and gained
91 lines in the one before that (#403's refused-generation work) equally without
touching it. **That is a citation that has now survived three consecutive edits
to its own file**, which is what a code anchor is supposed to do and is the
counter-example to this file's usual finding. It is also the counter-example to
this pass's own result: nine anchors moved here and this one did not, and the
difference is that a constant declared at the head of a module is not pushed
down by work below it.

**Four consecutive edits now, re-read at `01974e5`.** The file gained 94 lines
in the `07add3e..01974e5` window (#496's refusal-supersede work and #500's
per-prison `masterSeed`, mostly), still without moving the constant: it is
declared at `:10` (the doc comment above it starts at `:9`, which is the
line this entry has always cited), still reads `30_000`. A constant at the
head of a module surviving a fourth consecutive edit to the file around it is
the same property restated, not a new one.

**One sentence in this section points at nothing, and no diff could have said
so.** It reads *"the release count said 'eighteen' for twelve releases and now
reads thirty"* — but no release count remains anywhere in this section for
*"thirty"* to be. The sentence it corrected was
`git diff 4ed571f..main -- supabase/migrations/` *"is empty across all eighteen
releases"*, which `83c3121` carried and which a later rewrite deleted outright,
taking the referent with it and leaving the correction behind. **A correction
outliving the claim it corrected is the same rot as a claim outliving the code**,
and §4 of `docs/AGENT_WORKFLOW.md` says as much: a correction is no more durable
than the claim it corrected. It is kept, marked, and the missing half is supplied
here: the number that was eighteen and then thirty is the count of releases across
which that diff had been empty, and it is now meaningless because the diff has not
been empty since #382.

**The claim underneath that one moved at the previous anchor, and it was the first
time this section had had to change for a reason other than nobody deciding
anything.**
This entry said the directory *"holds the same twenty-one files it held at
`4ed571f`"* and that `git diff 4ed571f..main -- supabase/migrations/` *"is
empty"*. It holds **twenty-three**, and that diff is no longer empty: **#382
added two** — `20260826120000_revoke_ambient_table_privileges.sql` and
`20260826130000_server_stamp_updated_at.sql`. Neither touches capacity. The
base migration this section's whole table cites is byte-identical (`git diff
83c3121..main` over `20260823100000_bound_free_tier_capacity.sql` is empty), so
every row above still stands; what changed is a sentence this entry used as a
shortcut for "nothing here has moved", which is exactly the kind of sentence that
stops being true without anybody deciding to make it false. **And the release
count said "eighteen" for twelve releases and now reads thirty** — a release
count in prose is a claim about `main` that goes stale on every merge, so it is
the number to check first and the reason the anchor above has a test.

**One thing in #382 bears on §6 without deciding it, and is the reason the
retention grep is no longer silent.** `20260826130000_server_stamp_updated_at.sql:68-76`
argues that the exposure of a client-writable `updated_at` is *"a **future**
reader: a retention or cleanup job keyed on `updated_at` (docs/CLOUD_SAVE.md
names 'cleanup of abandoned anonymous accounts' as open work, ADR 0013 sections
5-6)"*, and closes it now *"because the column becomes load-bearing in the commit
that first reads it, not in the commit that first writes it"*. So whichever
retention policy §6 eventually gets, **the column it would key on is now
server-authoritative** — a constraint the decision inherits rather than an answer
to it. §6 is still undecided and still unimplemented.

**§5 — 256 MiB per account.** Undecided and unimplemented. The ADR's own §5
records that it depends on the revision-depth decision below and on the
JSONB-versus-Storage question, so it cannot be settled ahead of §6.

**§6 — 20 revisions per prison.** Undecided and unimplemented, and the number
*is* the decision. The arithmetic that originally justified it is wrong: 20
revisions at `DEFAULT_AUTOSAVE_INTERVAL_MS`
(`src/persistence/session/session-controller.ts:9`, `30_000`, re-read at this
anchor) is **ten minutes**, not *"roughly a day of ordinary autosaving"* — and §6
computes 2,880 rows a day from that same constant five lines earlier, so a day of
ordinary autosaving is 2,880 revisions, **144× the proposed number**. The ADR
already records this and withdraws the justification while deliberately leaving
the figure at 20, because moving it is the owner's call (issue #274, Q2). So what
is open is not the discovery but the policy: keep 20 and accept that "restore an
earlier generation" means the last ten minutes of autosaving, or keep "roughly a
day" as the requirement and raise the number. **Settle that before accepting
§6.**

Accepting §§1-4 deliberately did **not** approve 256 MiB or 20 revisions.

---

## 4. The live risk to watch: ADR 0016 §2 is binding and nothing enforces it

This is the one thing the flips *added* to the risk surface, and it belongs at
the top of any future audit. None of the seven flips after #308 touches
deployment, SQL or a live hosted mechanism, so nothing here moved with them.

Accepting 0016 makes its §2 a **binding constraint**: production is a separate
Supabase project with a distinct project ref, and the Supabase GitHub integration
is never reconfigured to point at it. The ADR says plainly why that is fragile:

> Recorded as a constraint precisely because nothing enforces it mechanically.

The mechanism it constrains is live and irreversible. Migrations reach the hosted
Supabase staging project *"automatically, on every merge to `main`"* with gating
*"none"* (`docs/DEPLOYMENT.md`, "Automated deployment"), rollback is not
automated, and the trigger is the merge rather than the diff — PR #87 touched no
file under `supabase/migrations/` and nine migrations were applied anyway. The
evidence is in that same section: the six-row table (`docs/DEPLOYMENT.md:198-205`
— a table row is the one thing a quotation cannot name uniquely, so this stays a
number), the paragraph beginning *"`migrate-database.yml` has three runs in its
entire history"* for the 71-second window, and the one beginning *"Read that row
as 'on every merge', not 'when migration files change'"* for #87 itself. All
three re-read at this anchor.

**Those last two were `:160` and `:162` here and are now `:164` and `:166`, and
the table was `:143-147` and is now `:145-152`** — `docs/DEPLOYMENT.md` gained 99
lines in the `54418b6..bb3a01e` delta. The previous anchor had already corrected the same two from
`:159` and `:161`. **That was the third consecutive anchor at which the same two
numbers moved and the two sentences did not**, so they are re-cited by their
opening words above and the numbers are retired; the sentences have survived
every edit and the numbers have survived none.

**Make it five, and at this anchor the whole section cost nothing.**
`docs/DEPLOYMENT.md` does not appear in `git diff --name-only c00b641..07add3e`
at all, so for the first time across four windows **neither half of this
section's evidence moved**: the six-row table is still `:198-205`, the two
paragraphs are still `:217` and `:219`, the section title *"What currently
serves lockstate.io"* still begins at `:253`, and the ADR 0016 paragraph §6
cites is still at `:221`. All five were re-read at `07add3e` rather than rested
on the diff. **That is worth recording precisely because it weakens a sentence
below**: this section says the asymmetry is that the workflow holds still while
*"the half that keeps moving is the prose describing a dashboard nothing here
can read"*. In this window the prose did not move either. The asymmetry is a
description of three windows out of four, not a property.

**The previous anchor's account, kept.** *"Make it four, and this time the
retirement paid for itself."* The two
paragraphs were `:217` and `:219` at `c00b641` and needed no correction at all,
because they are cited by their opening words. **The table is the one citation
in this section that a quotation cannot replace, and it is the only one that
broke**: `:143-147`, then `:145-152`, and `:198-205` now. `docs/DEPLOYMENT.md`
gained **54 lines** in this delta — #474, which gates the `dist/.assetsignore`
exclusion that keeps the generated Wrangler config off the public origin, and
which inserts its new section *above* everything this entry cites. The section
title *"What currently serves lockstate.io"*, which §5's ADR 0002 entry cites,
moved from `:200` to `:253` in the same edit and likewise needed nothing. That
is recommendation 1 at the foot of §6 producing a measurable result rather than
being restated: **three of the four citations into the fastest-moving document
in the set survived an edit that moved every line of them.**

The half of the decision that *is* in this repository stays verified at `898a16a`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` (`:34`) with no
`push:`, requires a typed `confirm_project_ref` (`:41`), and its apply job is
environment-gated (`:65`) — all three re-read at this anchor and all three still
land, on a file `git diff` reports as untouched since `54418b6`. The `on:` key
at `:33` has `workflow_dispatch:` as its only child, re-read here rather than
inferred from the absence of a `push:` match, and `grep -c '^\s*push:'` over
the file returns **0**, which is the absence stated as a command rather than as
a reading.

**This entry used to say that nothing here had moved, and that has been false
since v0.0.116.** It read: *"`git diff cddaebb..main` over that file is still empty, and so is
`git diff 83c3121..main` — neither this workflow nor `docs/DEPLOYMENT.md` appears
in either delta, so nothing in this section has moved across twenty-one
releases."* Both files were edited by **#423 at `4f738ae` (v0.0.116)**, which
closed the deploy gate: `.github/workflows/migrate-database.yml` gained five
lines and `docs/DEPLOYMENT.md` thirteen. So the run of untouched releases ended
five releases after the sentence claiming it was written. **`docs/DEPLOYMENT.md`
has moved again in the eleven releases to `bb3a01e`** — 99 lines, from #447's
staging-deploy and first-server-entry-point work — and
`.github/workflows/migrate-database.yml` has not. **And again in the eleven to
`c00b641`** — 54 lines, from #474 — while the workflow still has not, so the
asymmetry held across three consecutive windows and twenty-two releases.
**It did not hold in the nine releases to `07add3e`, where neither file
changed.** The point of
this section survives that: the workflow is the half a gate can hold, and the
half that *has* kept moving — in three windows of four — is the prose describing
a dashboard nothing here can read. Stated in the past tense from here on,
because *"the half that keeps moving"* was a standing property asserted from
three readings and is the shape §4 of `docs/AGENT_WORKFLOW.md` says rots first.
**Nor in the eleven releases to `01974e5`**: neither `docs/DEPLOYMENT.md` nor
`.github/workflows/migrate-database.yml` is in `git diff --name-only
07add3e..01974e5`, so this is the second window running at which this
section's whole evidence was re-read rather than re-derived, and it cost
nothing again.
**What #474
added is not about migrations and does not touch this section's mechanism** — it
is a build-output check on the `.assetsignore` the client build emits, read at
the `c00b641` anchor rather than inferred from its title — and the two migration
rows of the table above are word-for-word what they were at `bb3a01e`, and at
`07add3e`. (**The brief for the `07add3e` pass named that gate as content of
*its* window and it is not**: `git log -S'.assetsignore'` returns one commit,
`a532032` (#474), which is in the window above. Recorded here because this entry
is where a reader will look for it.)

**What did and did not follow from that.** The mechanism this section watches is
unchanged — every citation above was re-read rather than assumed, and #423
tightened the *frontend* deploy gate without touching the migration path. What
the edit falsified is only the sentence asserting the absence of movement, which
is the shape this corpus keeps finding rots first: adding the thing an absence
denies never touches the sentence denying it. Recording the outcome was right;
stating it as a standing property rather than as a reading at a named commit was
what made it rot. Rewritten above as a reading at this anchor. The one thing that *did* move nearby is #382's two new
migrations, and they reach a hosted database by exactly the mechanism this
section is about — which is the risk being live rather than the constraint being
broken.

So the constraint is approved architecture whose only defence is a sentence in a
document. Repointing the integration is a two-click change in a dashboard; it
would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 5. Where an accepted decision and the code disagree

Everything below describes a mechanism `main` does not exercise, or documents
that disagree with each other. **None is a status defect.** This paragraph used
to say that "with the queue empty that is the whole of what this section can be:
either a decision is accepted and the code has not caught up, which is a code or
wiring gap, or two documents state different numbers, which is a docs-truth job".
That premise is withdrawn all the same, and with it the claim that those two
shapes are exhaustive: there are two more, described below. **And the queue is
not empty now** — §2 holds three entries: the two rulings #382 wrote into ADR 0008
§2, the 2026-08-27 amendment scoping that ADR's §3, and the preconditions on the
first server-side entry point — so the "with the queue empty" opening no longer
describes the file either. **Still three at `bb3a01e`**: no entry was added or
deleted in the eleven releases, and this is one of the four places the header
names as counting the queue, swept here for that reason.

**EIGHT at #615, and the third consecutive anchor at which no place lagged —
but the mechanism was a debt being paid rather than a rule being followed.** ADR
0077's entry was filed by a commit whose only job was the filing, so the header's
opening paragraph, §2's own heading and this preamble moved together for the
third time running. **The observation now has three instances and is still not a
rule**, and the reason it is still not one is sharper than it was: every one of
the three was a *separate filing commit*, and the split this file keeps
recording has never once been tested against an implementing change since the
rule was restated. #581 was the chance to test it and did not — it landed ADR
0077 and filed nothing, which is the omission
[#615](https://github.com/matmaxalez/lockstate/issues/615) exists for. So the
three-instance run is evidence that a filing commit does its job, and no
evidence at all that the four places have stopped coming apart.

**And the count moved by one where it could have moved by three.** #615 also
named ADR 0075's and 0076's entries as outstanding — written in full, handed
over as text, never filed. They are not filed here, because #606 accepted both
on 2026-08-29 before this commit ran, and both entries' own recipes end *"Delete
this entry in the same commit"*. Filing them in order to delete them in the same
commit would be theatre. They are recorded at the foot of §2 instead, where this
file already keeps the ADRs that were accepted without ever appearing in the
queue.

**SEVEN at #585, and the second consecutive anchor at which no place lagged.**
ADR 0071's open-area amendment (the owner's ruling of 2026-08-29 on issue #585)
was filed by a commit whose only job was the filing, which is the mechanism the
paragraph below names — so the header's opening paragraph, §2's own heading and
this preamble moved together for the second time running. **The observation now
has two instances and is still not a rule**, and the reason is unchanged and
worth repeating rather than quietly dropping: the split has never been tested
against an implementing change since the rule was restated, because no
implementing change has filed an entry since #485. #585 does not test it either
— its implementing work is in the two commits before the filing, and the filing
commit touches this file and nothing else, on purpose and because this
paragraph told it to.

**SIX at #571, and for the first time in this sequence no place lagged.** ADR
0074's entry was **handed over rather than filed by the change that wrote the
ADR** — `agent/559-v4-room-bounds` left this file alone on the ADR 0032/0033/0059
precedent and put the entry verbatim in its pull request — so the filing was a
separate commit by a separate hand, and that hand moved §2's heading, the
header's opening paragraph and this preamble together. **That is the mechanism
of the split named, from the other side.** Every previous drift here happened
because the commit filing the entry was the ADR's *own* commit, whose author was
thinking about the decision and not about three prose counts elsewhere in a
4,000-line file. A separate filing commit has nothing else to think about. It is
one observation and not a rule — the next entry filed by an implementing change
will test whether the split returns — but it is the first thing this file has
learned about *why* the four places come apart rather than merely that they do.

**FIVE at `07add3e`, and this paragraph was the one place in the file that did
not know it — for the second consecutive anchor, by the identical mechanism.**
#485 added §2's fifth entry — ADR 0059's price for making an actor walk — and
moved §2's own heading with it. It did not move this one, and it did not move
the header's opening paragraph either. So for nine releases §2's heading said
*"## 2. Five entries"* while this preamble said *"FOUR at `c00b641`"* and the
header said *"§2 holds **four entries**"*, all in the same document. **The
header predicted this split in terms, was confirmed by #467, and has now been
confirmed a second time by #485 with the same two places lagging and the same
one place correct.** Both are corrected in place. The sentence saying four is
left standing below, because the record of the drift is the whole value of
naming the four places.

**FOUR at `c00b641`, and this paragraph was the one place in the file that did
not know it.** #467 added §2's fourth entry — ADR 0056's price for keeping a
player's orders in the order they gave them — and moved the title paragraph and
§2's own heading with it. It did not move this one. So for eleven releases the
header said *"§2 holds **four entries**"*, §2's heading said *"## 2. Four
entries"*, and this preamble said *"§2 holds three entries"*, all in the same
document. **That is exactly the fourth-place drift the header predicts in
terms**, and it was found by the check the header prescribes — reading the
file's own headings against each other — and by nothing else:
`docs/adr/STATUS-QUEUE.md` is not in the dependency set, every file ADR 0056's
entry cites *is*, and no diff of any of them would ever have said that one
paragraph in this file disagreed with another. The sentence saying three is left
above rather than overwritten, because the drift is the record. What did change is not
the count of entries but the count of decisions they are supposed to be tracking,
and that is the first bullet below.

**Corrected at this anchor, and it is the sharper defect of the two.** The
paragraph above then read *"**The queue is not empty** — §2 holds **two**
entries"*, while §2's own heading three hundred lines above says **"The queue is
empty"** and its subsections record both entries as deleted on acceptance. **One
file, two sections, flatly opposite.** The two entries were ADR 0031 and ADR
0007's amendment, both accepted on 2026-08-26; §2 was updated and this paragraph
was not. Nothing mechanical could catch it — the gates over `docs/adr/` compare a
status word to a document, never a document to itself.

**Third: the code has run ahead of a decision nobody has approved.** #367 shipped
the `hud/build-queue` read model, the per-order cancel control and the Build
panel's one-row catalogue floor **before** ADR 0031 was approved. **This entry
said `docs/adr/0031-build-queue-cancellation-surface.md:5` "still reads
`**Proposed — pending human approval.** Not accepted.`" — it reads "Accepted,
2026-08-26 — with open question 4 promoted to blocking", and has since `e560656`
(#389).** That is not a defect — §2 exists to make exactly that visible, and the
ADR arrived in the same commit as the code, which is the rule §2 states — but a
section written on the assumption that an unapproved decision cannot have an
implementation would mis-file it.

**Fourth, and newer: a decision is waiting inside a document whose `Status` line
will never move.** #380 queued an **amendment** to ADR 0007, which is Accepted and
stays Accepted, on the argument §2 now states — that
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR *"is invisible to every mechanical gate there
is; this row is the only thing that says it exists"*. Its heading carried the
approval state instead — this entry quoted it as *"## Amendment, 2026-08-26
(awaiting approval)"*, and on acceptance the heading became *"## Amendment,
accepted 2026-08-26: the shared plan is the plan `findRoute` computes…"*, so the
quote is history rather than a live citation and is kept as one. Nothing in §§3-6
could have held that: every entry here is keyed to an ADR's status or to code, and
this is neither. It is also why a README sentence counting outstanding *rows* is
not a contradiction of §2's count — the README counts rows in its own table, and
an amendment has no row. **This shape is no longer only a fourth case: it is a
class with a rule.** `docs/adr/README.md`'s *"An amendment to an accepted ADR"*
section, decided 2026-08-27, is what §2's live entry rests on, and this paragraph
is the first instance it was written from.

**This entry has now cited the README wrongly twice, by line both times.** It
read `docs/adr/README.md:108`'s *"One row is outstanding: 0031"* when the
sentence was neither at that line nor about that ADR; corrected to *"One row is
outstanding: 0033"*, which the README has since **withdrawn**, because 0033 was
accepted on 2026-08-26. A line number is the part of a citation that rots first
and the part a reader checks last. **Cited by quotation rather than by line from
here on**, which is what this file's own §6 concluded and kept not doing.

The entries below are recorded so that
reading this file does not leave the impression that the corpus was audited in
one direction.

- **NEW at the previous anchor — nine ADRs are `Proposed` on `main` and not one
  of them has a §2 row.** At `54418b6` the directory held no `Proposed` document at all;
  at `bb3a01e` it holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051 and
  0052**, plus 0013's standing §§5-6 split. Every one of them arrived in that
  delta, each with its own implementing change, each declining to self-approve —
  *"Proposed. Not accepted, and deliberately not self-approved"* is the wording
  most of them carry — and §2's rule is *"any commit that adds an outstanding ADR
  adds an entry here in the same commit"*.

  **SEVENTEEN at `07add3e`, and the ratio moved with the count.** Four more
  arrived in the nine releases since — **0059** (how an actor gets from one tile
  to the next), **0061** (what the prison produces on its own), **0062** (who
  gets the room when more prisoners want it than it seats) and **0063** (what a
  refused restore says and whose fault it is) — so the directory holds **0042,
  0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059,
  0061, 0062 and 0063**, plus 0013's split. **Two of the seventeen have a §2
  row**: ADR 0056's, filed by #467, and ADR 0059's, filed by #485 in the same
  commit as the ADR. So the ratio is **two of seventeen**, and in this window
  the rule was obeyed once and abandoned three times — 0061, 0062 and 0063
  arrived with no row. Counted on disk by reading the first non-blank line under
  each `## Status` heading; `docs/adr/README.md` reports the same seventeen,
  checked row against document. **Fifteen decisions are outstanding with no
  entry giving the owner the evidence, what settling one commits the project to,
  or the line that would replace the status.** That is what §2 exists to
  provide, and the structural finding below is unchanged by the arithmetic
  moving: it stays in §5 rather than §2 because writing fifteen entries is a
  change to §2, and §2 is not what a re-anchor is for. **ADR 0054 is
  `Proposed, not self-approved` while its code is merged and live** — that is
  the ordinary shape here rather than an error, and it is named because a reader
  counting seventeen open decisions should not read them as seventeen unshipped
  ones.

  **TWENTY-ONE at `01974e5`, and the ratio moved against the count for the first
  time.** Four more arrived in the eleven releases since — **0064** (what an
  unmet need costs a prison), **0065** (what happens to a save this build cannot
  read), **0066** (what a navigation tick may cost) and **0067** (what an
  assault costs its instigator) — so the directory holds **0042, 0043, 0046,
  0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061, 0062,
  0063, 0064, 0065, 0066 and 0067**, plus 0013's split. §2 gained no entry in
  this window at all — its own heading is still *"Five entries"*, unmoved since
  #485 — so the ratio is **two of twenty-one**, and every one of the four new
  arrivals is a fourth abandonment rather than a fifth obedience. Counted on
  disk by reading the first non-blank line under each `## Status` heading;
  `docs/adr/README.md` reports the same twenty-one, checked row against
  document. **Nineteen decisions are now outstanding with no entry giving the
  owner the evidence, what settling one commits the project to, or the line
  that would replace the status** — up from fifteen, and still filed here
  rather than in §2 for the same reason: writing nineteen entries is a change
  to §2 and §2 is not what a re-anchor is for. **ADR 0054 remains `Proposed,
  not self-approved` while its code is merged and live**, unchanged from the
  previous anchor and named again for the same reason.

  **TWENTY-TWO at this anchor, and the ratio moved against the count for the
  second time running.** One more arrived in the seven releases since —
  **0068** (classifying a pending room's enclosure on the client, #498) — so
  the directory holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052,
  0053, 0054, 0056, 0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067 and
  0068**, plus 0013's split. §2 gained no entry in this window either — its
  heading is still *"Five entries"*, unmoved since #485, four anchors ago now
  — so the ratio is **two of twenty-two**, and 0068 is a fifth consecutive
  abandonment rather than a third obedience. Counted on disk by reading the
  first non-blank line under each `## Status` heading (`0022` checked and
  excluded: it carries a nested amendment's own `Proposed` marker under
  `### Status of this amendment`, not its own `## Status`, which reads
  `Accepted, 2026-08-25 — as amended`, and `docs/adr/README.md`'s row agrees —
  the grep trap this pass was warned about, caught rather than repeated);
  `docs/adr/README.md` reports the same twenty-two, checked row against
  document. **Twenty decisions are now outstanding with no entry giving the
  owner the evidence, what settling one commits the project to, or the line
  that would replace the status** — up from nineteen, and still filed here
  rather than in §2 for the same reason. **ADR 0054 remains `Proposed, not
  self-approved` while its code is merged and live**, unchanged across three
  anchors now and named again for the same reason.

  **TWENTY-SEVEN at `cfab558`, and the ratio moved *with* the count for the
  first time since `07add3e`.** Five more arrived in the thirty-one releases
  since the paragraph above was written — **0069** (how long a prisoner is
  held for, #541), **0070** (dismissing a staff member, #533), **0071** (what
  bounds a room whose activity consumes no object), **0073** (who orders a
  contraband search) and **0074** (what a restored room that recorded no
  rectangle is, #571) — so the directory holds **0042, 0043, 0046, 0047, 0048,
  0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061, 0062, 0063,
  0064, 0065, 0066, 0067, 0068, 0069, 0070, 0071, 0073 and 0074**, plus 0013's
  split. **0072 is held rather than missing** — the index's next-free
  paragraph reserves it for the events-persistence decision — so the gap in
  that list is deliberate. §2 gained **one** entry across those five arrivals,
  0074's, and its heading now reads *"## 2. Six entries"*: so the ratio is
  **three of twenty-seven**, and **the abandonment streak is broken** at nine
  — 0064, 0065, 0066, 0067, 0068, 0069, 0071, 0073 and 0070 all arrived with
  no row, and 0074 arrived with one. Counted on disk at `cfab558` by reading
  the first non-blank line under each document's own status statement, `##
  Status` heading or `- Status:` bullet alike (`0022` still checked and still
  excluded, by the nested-amendment reading recorded above);
  `docs/adr/README.md` reports the same twenty-seven, checked row against
  document, out of 68 rows. **Twenty-four decisions are now outstanding with
  no entry giving the owner the evidence, what settling one commits the
  project to, or the line that would replace the status** — up from twenty,
  and still filed here rather than in §2 for the same reason: writing
  twenty-four entries is a change to §2 and §2 is not what a re-anchor is for.
  **ADR 0054 remains `Proposed, not self-approved` while its code is merged
  and live**, re-read on disk at this anchor rather than carried, and now
  unchanged across five anchors.

  **THIRTY at `53e1405`, and the ratio moved against the count again.** Three
  more arrived in the seven releases since — **0075** (what a prison that
  cannot afford its first bed is owed) and **0076** (what happens to a
  resident whose bed is taken away), both at `092991e`/#580, and **0077**
  (when a route stops being valid) at `827201e`/#581 — so the directory holds
  **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056,
  0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070,
  0071, 0073, 0074, 0075, 0076 and 0077**, plus 0013's split. **0072 is still
  held rather than missing.** §2 gained no entry in this window — its heading
  still reads *"## 2. Six entries"*, unmoved since `9f0096c`/#574 — so the
  ratio is **three of thirty**, and the streak the previous anchor recorded as
  broken has **resumed at three**: 0075, 0076 and 0077 all arrived with no
  row. Counted on disk at `53e1405` by reading the first non-blank line under
  each document's own status statement, `## Status` heading or `- Status:`
  bullet alike (`0022` still checked and still excluded, by the
  nested-amendment reading recorded above); `docs/adr/README.md` reports the
  same thirty, checked row against document, out of 71 rows. **Twenty-seven
  decisions are now outstanding with no entry giving the owner the evidence,
  what settling one commits the project to, or the line that would replace the
  status** — up from twenty-four, and still filed here rather than in §2 for
  the same reason: writing twenty-seven entries is a change to §2 and §2 is
  not what a re-anchor is for.

  **TWENTY-NINE at `0637ab1`, and for the first time in this sequence the
  count fell and the ratio improved at the same time.** Two documents left the
  set by being decided — **0075** and **0076**, both `**Accepted, 2026-08-29,
  by the repository owner.**` at `f0b98aa`/#606 — and one joined, **0078**
  (what keeps a prisoner safe) at `19482be`/#612. So the directory holds
  **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056,
  0057, 0059, 0061, 0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070,
  0071, 0073, 0074, 0077 and 0078**, plus 0013's split. **0072 is still held
  rather than missing.** §2 gained an entry in this window — ADR 0077's, filed
  by `671910f`/#618 in a commit whose only job was the filing — so the ratio
  is **four of twenty-nine** (0056, 0059, 0074 and 0077), against three of
  thirty at the previous anchor. **Twenty-five decisions are now outstanding
  with no entry**, down from twenty-seven, and that fall is the first this
  bullet has ever recorded.

  **THIRTY at `898a16a`, ten releases later, and the fall did not continue.**
  One document joined and none left: **0079** (a sentence long enough to be a
  history), `**Proposed, 2026-08-30. Not self-approved.**`, landed by #659 at
  `9a25700` with **no §2 row**. So the directory holds **0042, 0043, 0046,
  0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054, 0056, 0057, 0059, 0061,
  0062, 0063, 0064, 0065, 0066, 0067, 0068, 0069, 0070, 0071, 0073, 0074,
  0077, 0078 and 0079**, plus 0013's split; **0072 is still held rather than
  missing**. §2 gained no entry in this window, so the ratio is **four of
  thirty** — the same four, 0056, 0059, 0074 and 0077 — and **twenty-six
  decisions are now outstanding with no entry**, up from twenty-five.
  Counted on disk at `898a16a` by the method every reading in this sequence
  has used, `## Status` heading or `- Status:` bullet alike, 0064 and 0067
  still the only two in bullet form and 0022 still checked and still excluded;
  `docs/adr/README.md` reports the same thirty, checked row against document.

  **0079 is the second consecutive arrival with no §2 row, after 0078, and the
  two are not the same case.** 0078 arrived inside a window this bullet was
  measuring and its absent row was recorded as this bullet records any other;
  0079 arrived alongside a pull request
  that the previous anchor had already named as unmergeable-from-disk, and the
  previous anchor wrote down in advance what its landing would cost — *"If
  #659 merges before this does, the count is thirty and four places need
  it."* It did, and they did. **A prediction that names its own arithmetic is
  the cheapest thing this file has ever paid for a count**, and it is worth
  one sentence because every other reading in this sequence has had to
  discover its number rather than confirm one.

  **The streak the previous anchor recorded as resumed is broken, and by the
  weaker of the two possible mechanisms.** 0075, 0076 and 0077 all arrived
  with no row; of the three, 0077 got one, and the other two never did —
  their rows were written in full, handed over as text, and overtaken by their
  own acceptance, which §2's foot now records as a case distinct from the four
  ADRs that were accepted without a row ever being written. So the ratio
  improved partly because a row was filed and partly because two documents
  left the denominator, and only the first of those is the rule working.

  Counted on disk at `0637ab1` by the method every reading in this sequence
  has used — the first non-blank line under each document's own status
  statement, `## Status` heading or `- Status:` bullet alike, 0064 and 0067
  still the only two in bullet form, 0022 still checked and still excluded.
  `docs/adr/README.md` reports the same twenty-nine, checked row against
  document. **0013 is counted separately and always has been**, which a
  mechanical re-scan of this set will get wrong; §3's opening now records that
  case, because this pass made the mistake before catching it.

  **The three that resumed the streak are not one case, and the header
  decides each of them separately.** 0075's and 0076's entries exist, in full,
  in `docs/research/2026-08-29-a-prison-that-cannot-buy-its-first-bed.md` §8,
  handed over on a stated concurrency conflict that is live again against PR
  #610; 0077's exist nowhere. **So one of the three is a skip and two are
  handovers**, and this bullet has never before had to distinguish them —
  every previous member of the streak was a plain skip. That distinction is
  the useful part, because a handover is discharged by the integrator and a
  skip is not discharged by anybody.

  **ADR 0054 remains `Proposed, not self-approved` while its code is merged
  and live**, re-read on disk at this anchor rather than carried, and now
  unchanged across six anchors.

  **How 0074 got its row is the part worth reading, because it is not
  obedience to the rule as stated.** §2's rule is *"any commit that adds an
  outstanding ADR adds an entry here in the same commit"*, and #571 — the
  commit that added ADR 0074 — did not. It left this file alone on the ADR
  0032/0033/0059 precedent and put the entry verbatim in its pull request
  body; `9f0096c` (#574), three merges later, filed it. So the streak breaks
  on a **handover honoured**, not on the rule being obeyed, and the
  distinction matters because the handover is the thing
  `docs/AGENT_WORKFLOW.md`'s *"Handovers between parallel agents"* says falls
  through the gap. It did not this time. That is one instance and not a
  pattern, and the preamble above records the other half of it: the same
  separate-hand filing is why all four §2 counts moved together.

  **And the paragraph above was four anchors stale when this one was
  written.** *"TWENTY-TWO at this anchor"* was correct at `4ace2da`
  (v0.0.177) and went false when 0069 landed at **#541**, inside the
  `4ace2da..85c1c29` window. The three anchors between then and now each
  moved the header's copy of this count and none moved this one, and the
  `85c1c29` pass asserted in the derivation subsection that this bullet *"now
  enumerate[s] **twenty-three** `Proposed` documents"* while it enumerated
  twenty-two. Left standing above rather than overwritten, because a count
  that lagged for four anchors inside the one bullet whose entire subject is
  counts lagging is the record.

  **THIRTEEN at `c00b641`, and the second half of that heading is no longer
  true.** Four more arrived in the eleven releases since — **0053** (who may
  stand a security post), **0054** (what a prisoner's day is made of when the
  prison is empty), **0056** (keeping a player's orders in the order they gave
  them) and **0057** (what a riot does to a prisoner's day) — so the directory
  holds **0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051, 0052, 0053, 0054,
  0056 and 0057**, plus 0013's split. **One of the thirteen has a §2 row**: #467
  filed ADR 0056's, in the same commit as the ADR, and recorded that it was the
  first row filed since the rule was restated. So *"not one of them has a §2
  row"* is withdrawn — true when written, false now — and what replaces it is a
  ratio rather than an absence: **one of thirteen**. Counted on disk by reading
  the first non-blank line under each `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads; `docs/adr/README.md` reports
  the same thirteen, checked row against document.

  **This is recorded and not decided, and it is emphatically not an accusation.**
  Each of the nine did the thing 0032's precedent prescribes: the debt is in the
  ADR's own Status, the index row is there, and `docs/adr/README.md` reports each
  one as `Proposed`, so nothing is hidden from a reader who opens the index. What
  is missing is the thing §2 exists to give the owner — the evidence, what
  settling it commits the project to, and the exact line that would replace the
  status — for nine decisions at once. **Twelve at `c00b641`**, and the one
  exception is worth naming precisely because it shows the rule is satisfiable
  by one writer and not by eleven: ADR 0056 arrived with its row, in its own
  commit, exactly as the rule says. **Fifteen at `07add3e`, and the exceptions
  are now two**, 0056 and 0059, which is the first time this ratio has improved
  in absolute terms rather than only proportionally. **Nineteen at `01974e5`,
  and the exceptions are still two.** 0064, 0065, 0066 and 0067 all arrived
  with no row, so for the first time the count of exceptions did not move at
  all while the count of decisions did — the improvement recorded at the
  previous anchor did not continue and did not reverse, it simply stopped.
  **Twenty at this anchor, and the exceptions are still two, for the second
  consecutive window.** 0068 arrived with no row either, so the pattern that
  started at `01974e5` has now held for two anchors running: the count of
  outstanding decisions keeps climbing and the count with a §2 row stays at
  two — 0056 and 0059, both filed before either of the last two anchors, and
  nothing since.

  **Twenty-four at `cfab558`, and the exceptions are three — the first time
  this number has moved since `07add3e`.** Five more decisions arrived in the
  thirty-one releases since (0069, 0070, 0071, 0073, 0074) and one of the five
  got a row, so the gap between decisions and entries widened by four while
  the count of entries moved for the first time in four anchors. The three are
  0056, 0059 and 0074. The sentence saying twenty is left above rather than
  overwritten, for the reason every earlier restatement of this number is.

  **What it is evidence *of* is the structural finding §2 already made and has
  now been handed at nine times the scale.** §2 says the rule is *"unsatisfiable
  under concurrency"*, that it *"has now failed more often than it has worked"*
  at four instances, and that the fix is *"one file per entry in a directory, so
  two commits can add two entries without touching each other"*. Four became
  thirteen in eleven releases. **Thirteen became sixteen in the eleven after
  that**: 0053, 0054 and 0057 arrived with no row and 0056 arrived with one, in
  a window whose entire content was eleven merged pull requests. **Sixteen
  became nineteen in the nine after that**: 0061, 0062 and 0063 arrived with no
  row and 0059 arrived with one, in a window of nine merged pull requests.
  **Nineteen became twenty-three in the eleven after that**: 0064, 0065, 0066
  and 0067 all arrived with no row and none arrived with one — the first
  window in this series with zero exceptions among its arrivals. A rule that is obeyed for one writer and abandoned
  for eleven parallel merges is not a discipline problem, and the count is the
  finding rather than any one omission. **The decision the owner is owed here is
  whether §2 becomes a directory or stops being a rule**; writing nine entries
  into a single 90 KB file that three agents are editing concurrently would
  reproduce exactly the contention this file has twice diagnosed.

  It stays in §5 rather than §2 because §5 is where this file records what it
  found and could not fix: **writing the nine — twelve at `c00b641`, fifteen at
  `07add3e` — entries is
  a change to §2, and §2 is not what this re-anchor was for.** It is filed here so the next reader of §§3-6
  does not conclude, from §6's *"no ADR in the directory is `Proposed`"*, that
  there is nothing to look at.

- **ADR 0023 and ADR 0028 are Accepted and now partly implemented, on the
  schedule 0028 set.** This entry read "Accepted and unimplemented", re-verified
  at `4ed571f` on three grounds: that `RoomZoningService` registered every
  instance with `capacity: 0` and `objectCapabilities: []`, that no room
  definition carries a capacity field, and that no `'object.*'` id appeared as a
  literal under `src/` outside `src/content/`. The first and third have since
  moved. `RoomZoningService` no longer hardcodes the zero — it resolves a
  derived figure through a collaborator: an optional fourth constructor
  parameter `capacity`, declared at `src/simulation/rooms/zoning.ts:428` and
  called as `this.capacity?.resolveInstance(instanceId)` at `:607`. **Those two
  numbers have now been wrong at eight successive anchors** — `:330`/`:444`, then
  `:345`/`:459`, then `:398`/`:567` after #447's enclosure refusal moved them
  again — which is why
  the entry names the parameter and the call expression, and why the numbers
  beside them are an aid rather than the citation. (**This sentence said
  "three" and the run is longer than that.** `:398`/`:567` were correct from
  `bb3a01e` through `07add3e`; **`7d81040` (#499) moved them inside the
  `07add3e..01974e5` window**, and they were then carried unchanged through
  `01974e5`, `33510df`, `4ace2da`, `85c1c29`, `82ae630` and `e1813b7` — six
  anchors, none of which re-derived them, and the `01974e5` pass had this file
  in its intersection and re-read two *other* citations in it. Nothing in the
  `e1813b7..cfab558` window moved them: `git show <sha>` puts them at `:428`
  and `:607` on every one of those six trees. So this is a claim already false
  when the window opened, found by opening the file rather than by any diff.)
  The zeroes `register` writes
  are still in the tree (**`:600-602`**, which read `:560-562` over the same
  six anchors) and the comment above them still says they
  are *"never as the final answer"* (**`:596`**, which read `:556`) — and two object ids are now built
  by construction
  definitions (`placesObjectId: 'object.bed'` on `BUILDABLE_REGISTRY`'s
  `bed-wooden` row and `'object.toilet'` on its `toilet-brick` row,
  `src/simulation/construction/definition.ts`; cited by symbol rather than by
  line, because the two line numbers this entry used to give have already
  drifted once), so something does place, build and read an object. What has **not** moved is the second ground
  and the observable outcome: no room definition authors a capacity, and an
  empty zoned room still derives zero, which is why ADR 0027's tripwire below
  is still green rather than fired — but *"the observable outcome"* no longer
  survives as stated, because a **furnished** room is reachable through the
  shipped path and the rewritten ADR 0027 entry below carries the measurement.
  **Five of 0028's six phases have now landed in whole or in part. This sentence
  said "four" and then enumerated five** — 1, 2, 3, 5 and 6 — so it was refuted
  by its own list on the day it landed. That is the third hand count in this
  section to be off by one, and the reason none of them is worth keeping in
  prose. Phases 1-2
  landed in #320, #321 and #323; **phase 3** (removal, and the
  objects-removed-while-occupied path) landed in **#328**, so a standing object
  can be deleted and an order that has not been built can be cancelled and
  refunded; **phase 5**'s Rooms-tab readout landed *in half* in **#336**, which
  ships the per-room "what is this room missing" verdict but not the
  "over capacity" state the projection still cannot say
  (`room-projection.ts` reads an over-capacity room as full at 100%); and
  **phase 6**'s counting landed in #323 under ADR 0029, which **is no longer
  awaiting approval**: #356 accepted it on 2026-08-26
  (`docs/adr/0029-concurrent-room-use-claims.md:5`, *"**Accepted,
  2026-08-26.**"*, plus its index row), so phase 6 now rests on an Accepted
  decision. **This sentence went on to say "and the queue's one pending entry is
  ADR 0031 instead", which is withdrawn** — 0031 was accepted on 2026-08-26 and
  §2's one entry is now ADR 0008 §2's two rulings. A phase's footing does not
  depend on what else is in the queue, so the clause was decoration that could
  only rot; what it was for is the sentence before it. Phase 4 — the
  rest of the object catalogue — is
  untouched at `dbe271f`: exactly two `'object.*'` ids appeared as literals
  under `src/` outside `src/content/`, both on `BUILDABLE_REGISTRY` rows.
  **ADR 0028 phase 4 (#384) took that to nineteen**, still all on
  `BUILDABLE_REGISTRY` rows and still all in
  `src/simulation/construction/definition.ts` — measured by
  `grep -rno "'object\.[a-z-]*'" src/ --include=*.ts | grep -v '^src/content/'`.

  **FALSIFIED at `bb3a01e`, and this time it is the shape and not the number.**
  That same grep now returns **39** hits in **two** files: nineteen in
  `src/simulation/construction/definition.ts`, all still `placesObjectId` on
  `BUILDABLE_REGISTRY` rows, and **twenty in
  `src/rendering/world/environment-art.ts`**, which #462 added to key artwork by
  the identifiers the simulation already uses. So the sentence this entry twice
  corrected the *number* of — *"object ids still appear outside `src/content/` in
  exactly one file and for exactly one reason"* — is now wrong in the half it
  claimed was durable. It is not a boundary violation: `environment-art.ts` is a
  data module by `AGENTS.md` boundary 6 and its own header says so, and
  `tests/unit/environment-art.test.ts` fails if its lists and the
  registries disagree in either direction — *"accounts for every catalogued
  object exactly once"* (`:248`) and *"accounts for every terrain exactly once"*
  (`:256`).

  **Handed over, because it is not this file's to fix: that module's own header
  cites a test that does not exist.** `src/rendering/world/environment-art.ts:24`
  names a suite `environment-art-coverage.test.ts` under `tests/unit/` and says
  it *"fails if the lists and the registries disagree in either direction"*.
  **There is no such file**; the suite is `tests/unit/environment-art.test.ts`.
  (The wrong name is written here without its directory on purpose:
  `tests/foundation/documentation-links-contract.test.ts` rejects a rooted path
  that is not on disk, with no allowlist, and it rejected this paragraph twice
  before the quotation was broken — which is how the defect was found in the
  first place. That gate reads `docs/`, `README.md` and `.github/` and not `src/`
  comments, which is why the comment shipped and why quoting it into a document
  is what caught it.) **Still open at `c00b641`**: `environment-art.ts:24` still
  names the file that does not exist, `tests/unit/environment-art.test.ts` still
  carries both assertions (`:248` and `:256`), and neither file changed in this
  window — so this handover is eleven releases old and is repeated rather than
  assumed. The claim
  the comment makes is true of the file it means. **Whether the gate should scan
  `src/` comments is a decision, not an edit**, and it is the same class as the
  four blind spots listed above.

  **DISCHARGED at `07add3e`, and the decision above was taken rather than left.**
  #483 did both halves in one change. The comment is corrected —
  `src/rendering/world/environment-art.ts:24` now names
  `tests/unit/environment-art.test.ts`, the suite that exists, and the line below
  it records *"This named `environment-art-coverage.test.ts` until 2026-08-28"*,
  which is the bare-filename form that gate's own docblock prescribes for a name
  meant to be dead. And the gate itself was widened: it now runs the rooted-path
  check over comments in `src/`, `tests/`, `tooling/`, `scripts/` and
  `benchmarks/` — measured at `3bfb799` over 705 files — and the three citations
  that did not resolve were fixed with it.

  **Two clauses in the paragraph above are therefore false and are withdrawn
  rather than edited away.** *"That gate reads `docs/`, `README.md` and
  `.github/` and not `src/` comments, which is why the comment shipped"* — it
  reads `src/` comments now, and this exact defect is the case its third
  `describe` block was written for. And *"rejects a rooted path that is not on
  disk, with no allowlist"* — there is an allowlist, keyed on the path/citer
  pair, with three honesty tests over the allowlist itself. **The reason for
  writing the dead name without its directory is unchanged and is now stronger**,
  because the check reaches further than it did.

  **What this cost, and what it is evidence of.** The handover was raised at
  `bb3a01e`, repeated at `c00b641`, and closed at `07add3e` — eleven releases
  open, nine more to close, by a party this file cannot compel. That is the
  second §5 item in two anchors discharged by somebody else's commit rather than
  by an editor of this file, which is what §5 is supposed to produce and rarely
  does.

  What the entry was watching for was
  object ids leaking into *logic*; a second data module is a second reason, which
  is the thing the sentence denied. **An absence held for two corrections of the
  count and died on the first change that added a reason** — which is what §4 of
  `docs/AGENT_WORKFLOW.md` predicts about a sentence phrased as *"exactly one"*. One
  thing phase 1 promised is now true and was **not** delivered by any phase:
  `door-wooden` builds a real door, and since **#334** the crossing is pinned at
  the two sites that decide it rather than only at the one the issue named. It could not be an object placement — a door
  is a fact about a tile edge — so it is edge geometry plus a `DoorRegistry`
  row, it contributes nothing to either derived capacity, and 0028 carries an
  amendment saying so. Nothing about the eight decisions moved with it. A
  **second** amendment (#326) does move one rule inside decision 2: the
  concurrent-use ceiling is now scoped to the capability being asked for, rather
  than summing `footprint.width` over every object in the room. Measured before
  the change at `9d0a125`, on the real gate: a canteen holding four toilets and a
  storage rack admitted 19 diners to tables that seat 6, and an empty 8x8 yard
  admitted nobody while the same yard holding one loading-dock door admitted
  three. Decision 2's other lines, the other seven decisions and the phase order
  are untouched, and the amendment corrects that ADR's own worked example --
  under capability scoping its canteen seats 6, because `object.bench` declares
  `'seating'` and `'recreation'` and not `'dining'`. The empty zoned room above
  still derives zero for every capability, so ADR 0027's tripwire below is
  unaffected: what changed is that an action naming **no** capability now has no
  object-derived ceiling at all, which is `room.yard` and nothing else. A
  **third** amendment (#348) touches no decision at all: it corrects the
  *measurement* under decision 4, which said "every order advances every
  scheduled tick, so a hundred objects take the same wall-clock time as one".
  Construction now runs one order at a time, so a twelve-wall perimeter finishes
  at tick 730 rather than 70 while a single wall still finishes at 70. Decision
  4's own ruling — that a labour cap is #26's to make, and that furniture must
  not be the one buildable that waits — is untouched and is satisfied rather
  than contradicted, because the queue applies to every buildable alike.
- **FALSIFIED — ADR 0027's subject is reachable, and two prisoners already share
  one cell.** This entry read *"ADR 0027's subject is unreachable, so its effects
  are not observable"*, and it argued that *"the rating seam that was approved is
  live, and it is inert"*. **Measured against `83c3121` and it is not inert.**
  Four commands, all of them ones a player sends, through the real kernel and the
  real decoder: `PurchaseMaterials` for four planks, `ZoneRoom` for the 2×3
  rectangle at (4,6) that `room.cell`'s `minimum-size` requirement accepts
  (`src/content/room-catalog.ts:70`, unmoved), and `PlaceObject` twice —
  `definitionId: 'bed-wooden'` at (4,6) and at (5,6), the two 1×2 footprints that
  fit side by side inside it. Nothing refused (`refusals.count` 0), both orders
  completed, and the instance the registry then holds is

  > `residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities:
  > ['sleep-surface'], concurrentUseCapacityByCapability: [['sleep-surface', 2]]`

  Two `AdmitPrisoner` commands later, `getAccommodation` returns `room.cell:4:6`
  for **both** arrivals and `occupancyOf('room.cell:4:6')` is **2**. That is
  ADR 0027's subject — co-occupancy of one cell, and both placements went through
  the approved seam: `IntakeSystem` allocates through
  `RoomInstanceRegistry.findBestAvailable` and nothing else
  (`src/simulation/prisoners/intake-system.ts:530`, whose own comment at `:524`
  names #79 and the rating; this entry read `:348` and `:342`, then `:409` and
  `:403`, then `:448` and `:442` at `07add3e`, then `:474` and `:468` at
  `01974e5`, held through `4ace2da`, and #541's sentence draw — inserted into
  the same `classification` stage, above them — is what moved both again).
  **Fifth anchor, fifth pair of numbers, and the expression has still not
  changed**:
  `findBestAvailable` is still handed a `rateCellSharing` closure and is still
  the only allocator. It is happening in a session a player can start.

  **The four commands are now five, and the measurement as written no longer
  reproduces.** ADR 0045 landed in #447 and `zone` refuses an open perimeter:
  `room.cell` authors an `enclosed` requirement (`src/content/room-catalog.ts:69`),
  `not-enclosed` is the eighth refusal reason
  (`src/simulation/rooms/zoning.ts:217`), and the comment on the check says so in
  terms — *"An `enclosed` definition against an `open` rectangle is now
  `not-enclosed` and never reaches here"* (`src/simulation/rooms/zoning.ts:255-256`).
  The independent evidence is that
  `tests/integration/object-placement-loop.test.ts` — the case this entry leans
  on — had to be given three `wallRoomPerimeter(...)` calls in the same delta to
  keep passing. **The conclusion survives and the reproduction does not**: a
  player still reaches co-occupancy, because walls are a buildable and building
  them is something a player does, but the sequence recorded above now needs a
  walled perimeter before the `ZoneRoom`, and anyone re-running it verbatim will
  get a `not-enclosed` refusal and read it as the finding having evaporated.
  Recorded rather than re-measured: **the measurement is not re-taken here,
  because re-taking it is a code change to a test and this file changes no code.**
  What is checked is that every input to it still exists and that the one new
  refusal is the only thing between them.

  **The three things this entry got right, and why they did not add up to its
  conclusion.** `findBestAvailable` does return `undefined` for `room.cell` with
  and without the `sleep-surface` filter *in a prison whose cell is empty*; a
  zoned room with nothing in it does derive zero
  (`tests/unit/objects-room-capacity.test.ts`, *"is zero for a room with nothing
  in it"*); and the case at `tests/unit/prisoners-intake-system.test.ts:230` —
  cited as `:229` here, one line out at `bb3a01e` — does still
  pass. **That case was retitled by #371 and this entry's quotation of it is
  stale**: it read *"houses nobody at all through the shipped session path"* and
  now reads *"houses nobody through the shipped session path **while the cell is
  unfurnished**, because capacity comes from the objects standing in it"*. The
  narrowing is the right resolution and is better than the *"must not be
  re-baselined"* this entry demanded — every assertion still holds, and the title
  now says which world it is true of. What the entry did was generalise from that
  tripwire to the whole tree. It cannot carry that weight: it zones two rooms and places
  nothing, so it says nothing whatever about a prison with a bed in it, and
  `tests/integration/object-placement-loop.test.ts` — *"a player buys a plank,
  places a bed in a cell they zoned, and a prisoner lives in it"* — had been on
  `main` since phase 1 saying the opposite. **This entry was therefore already
  false when it was written**, not falsified by the eleven releases: across
  `cddaebb..main` every diff under `src/simulation/objects/` and
  `src/simulation/rooms/` is a comment correction and not one executable line
  moved, so the placement path behaved on 2026-08-26 exactly as it does now. It
  is the exact failure the anchor gate is a proxy for, found by re-reading rather
  than by any assertion, and it is why *"moving the anchor without re-reading
  anything passes it"* is written at the top of this file.

  **Somebody else found it first, one release after the anchor this entry was
  written against, and that is the strongest argument for the delta note above.**
  #371 — *"ADR 0028 shipped, and the tripwire written to announce it could not
  fire"* — landed at v0.0.89 and measured the same fact independently: seed 11,
  two `bed-wooden` in one zoned 3×3 `room.cell`, `residentCapacity: 2`, two
  `AdmitPrisoner` accepted with no refusal, `occupancyOf('room.cell:3:3')` **2**,
  `completedCount: 2`, `failedCount: 0`. Different seed, different rectangle,
  different anchor tile, same conclusion — which is a stronger result than either
  measurement alone, and is recorded here rather than replaced because two
  independent routes to a fact are worth keeping. But the re-read that produced
  the entry above was cut from `83c3121`, **one commit before #371 merged**, so it
  rediscovered at length a thing already on `main` and already written into the
  ADR. That cost is what the delta note exists to avoid.

  **ADR 0027 now carries it in its own body**, which is where it belongs and where
  a reader should go first: `docs/adr/0027-cell-sharing-assessment.md:14-32`,
  *"Update, 2026-08-26 — the subject is now reachable, and this ADR named the
  day"*, with the preconditions kept verbatim below it *"because every design
  argument below them was made under them"*. The index row moved with it — the
  `0027` row in `docs/adr/README.md` now reads *"its subject became reachable
  when 0028 shipped (measured 2026-08-26)"* where it read *"unreachable until
  0028 ships"*. (Cited as `:97` here; the row is at `:158` at `bb3a01e` **and
  still at `:158` at `c00b641`**, because the four rows the index gained in this
  window — 0053, 0054, 0056, 0057 — all sort below it. `:97` is now a sentence
  about queue entries — the index gained twelve ADR rows in the previous delta
  and four in this one, so a row number in that file is the least durable
  citation in the corpus after `docs/CLOUD_SAVE.md`'s, and this one surviving a
  window is luck rather than a property.)

  **And #371 adds one live gap this entry did not have.** `rateCellSharing` *"is
  deciding real allocations in a live session for the first time, and nothing
  exercises it through that path — every test of it still registers its instances
  by hand"* (`docs/adr/0027-…md:27-30`). That is sharper than this entry's own
  closing observation and it supersedes it: the point is not only that no session
  furnishes two cells, it is that the rating function is now load-bearing in
  production with **no** test reaching it through a command. ADR 0027 files it as
  a coverage question rather than resolving it, and it stays here as the thing to
  watch.

  **What is left of it, restated as what is true.** The retitled case is green
  and correct. ADR 0027's status qualifier is still the right shape — its three
  questions stay open and are now *load-bearing rather than hypothetical*, which
  is how the ADR's own Update puts it. What is worth watching is the coverage gap
  #371 names above, and, narrower, that nothing in a shipped session yet chooses
  **between** two eligible cells on the strength of a rating: every measurement
  here and in #371 lands in the only cell there is. The notice for that would be
  a session with two furnished cells and a prisoner sent to the emptier one.
  Nothing here is awaiting a decision, which is why it stays in §5.
- **PARTLY FALSIFIED — ADR 0026's question 2 is answered, and question 1 is
  reachable for the first time.** This entry read *"ADR 0026's three questions are
  open under an Accepted ADR, and the only thing holding them is a set of tests
  that assert the wrong answer on purpose"*, and it closed *"the release path is
  where all three questions become load-bearing on the same day"*. **The release
  path landed** — [ADR 0050](./0050-when-a-sentence-ends.md), merged as #458 —
  and it did not do all three at once.

  The tripwire half stands and was re-read on a file `git diff` reports as
  untouched: `tests/unit/entity-generation-wrap.test.ts`, five `DEFECT`-labelled
  cases at `:96`, `:163`, `:178`, `:190` and `:204`, the wrap-period pin at
  `:124`, and one case in `tests/unit/prisoners-intake-system.test.ts` (the
  re-intake comment, `:529` — this entry's companion in §6 cited `:494`). What is
  no longer true is *three*:

  - **Question 2 is answered**, as option C plus the accounting option C asked
    for. `EntityStore.destroy` now has a call site in `src/`
    (`src/simulation/prisoners/release.ts:194` — this read `:156`; #484's
    escape-attempt path and #485's locomotion clearing both added surfaces above
    it) and prisoner indices are recycled
    in an ordinary session. ADR 0026 carries this itself, dated, in an amendment
    that deliberately contradicts rather than rewrites the paragraph it
    supersedes: *"Question 2 is answered, as option C plus the accounting option C
    asked for."*
  - **Question 1 is not answered and is now reachable**, which is the reverse of
    the situation the ADR was written in — the ADR's own words. Nothing was
    decided; what changed is the exposure.
  - **Question 3 is not answered and the release path creates no re-intake
    caller**, so the one case in `prisoners-intake-system.test.ts` is still the
    only thing holding it.

  Still not a status defect and still the entry to read before #31. **What this
  entry got wrong was the shape of the prediction, not the substance**: it
  expected one day on which three questions went live together, and what happened
  is one answered, one made reachable and one untouched — which is why the
  sentence is kept above rather than deleted.

  **The rest of this entry is FALSIFIED, and by the best possible thing: somebody
  measured the tripwire.** It said *"nothing else in the suite observes any of it:
  mutating the wrap period from `& 0xFFF` to `& 0xF` leaves the suite green except
  one case in `actor-identity.test.ts`"*. **#373 closed both halves of that**, and
  found the gap was worse than this entry described.

  - The wrap period **is now pinned in that file**, in its own case
    (`tests/unit/entity-generation-wrap.test.ts:124`, *"rejects a stale handle for
    every one of the 4,095 recycles before the wrap, and only wraps at 4,096"*).
    So the `& 0xF` mutation no longer leaves this file green, and the pin no
    longer rests on `actor-identity.test.ts` alone.
  - **Why that mattered more than coverage**, and this is the part worth keeping:
    `actor-identity.test.ts`'s pin *"is the one ADR 0026 names as the cost of
    option A"*, so the sole guard on the counter **was scheduled to be
    re-baselined by one of the options this file exists to gate** — the gate would
    have been dismantled by the decision it was guarding.
  - **And the generation check was not exercised at all.** Every
    `isAlive(stale) === false` was asserted between a `destroy` and the following
    `spawn`, with the slot on the free list, so `alive[index] !== 1` satisfied it
    and the generation comparison was never reached. Measured: removing the
    generation term from `isAlive` — #110's fix, the exact guard whose failure at
    the wrap is that file's subject — **left all 190 test files and 2,229 tests
    green**. The assertions now run with the slot occupied.

  ADR 0026 carries this itself, as an addendum that changes no decision
  (`docs/adr/0026-entity-id-lifetime.md`, *"Addendum, 2026-08-26 (#169): the
  tripwire's own coverage, measured"*). **No `src/` change**: none of options A,
  B or C was taken, so the three questions are exactly as open as before — what
  moved is that the tripwire now detects what it claims to.

  **Question 1 is answered too now, 2026-08-29 (#169).** This entry's own
  "Question 1 is not answered and is now reachable" is superseded, not
  rewritten: option A is taken alongside the already-shipped option C.
  `EntityStore.destroy` (`src/simulation/entity/entity-store.ts`) retires a
  slot that dies at generation 4,095 instead of recycling it, so the tripwire
  this entry describes was re-baselined rather than merely re-read — every
  `DEFECT`-labelled case in `entity-generation-wrap.test.ts` and the wrap-period
  pin in `actor-identity.test.ts` now assert the fixed behaviour, confirmed RED
  against the pre-fix `destroy()` and GREEN restored by hand. ADR 0026 carries
  the decision itself, dated, in *"Amendment, 2026-08-29 (#169): question 1 is
  answered — option A taken, alongside the already-shipped option C"*. Only
  question 3 (`submitIntake` re-intake) is now open of the three this file has
  been tracking since #167.
- **ADR 0012 — a retained topology is now evicted; the streaming policy is what
  is left.** This entry read "`chunkTopologies` is never evicted", re-verified at
  `4ed571f` on the ground that no `delete` existed on that map. **#324 closed
  it**: `update()` drops the retained topology of every chunk the world no longer
  reports as loaded — `evictUnloadedTopologies()`, called from `update()` at
  `src/simulation/rooms/topology.ts:72`, whose `this.chunkTopologies.delete(key)`
  is still exactly at `:99` where this entry last cited it — so the walk sees only loaded
  chunks and an id is no longer a function of chunk *load* history either.
  `GlobalTopologyId` therefore meets ADR 0012's category 2 outright rather than
  only with respect to *recompute* history. What this section still carries is
  the ruling the ADR reserves and #324 deliberately did not take: whether an
  unloaded chunk should be *representable* in a topology at all, and if so from
  what persisted geometry. That is a decision, not a code gap — which is why it
  belongs here and the eviction no longer does.
- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'` is
  a member of the `WorkerState` union (`src/simulation/worker/state-machine.ts:34-40`,
  unmoved at this anchor despite the file changing — #502's guard-rendering work
  and #505's entity-retirement work both landed above line 34)
  and no `transition()` call targets it; `grep -n "this.transition(" src/simulation/worker/state-machine.ts`
  is the enumeration and it returns exactly four, reaching `'faulted'`,
  `'paused'`, `'paused'`/`'running'` and `'shutting-down'` — **`:672`, `:861`,
  `:896` and `:1172` at `01974e5..origin/main` (this anchor)**, having read
  `:671`, `:860`, `:895` and `:1171` at `07add3e`, `:664`, `:799`,
  `:834` and `:1110` at `bb3a01e` and `c00b641`. **Those four anchors have now moved at
  five of six anchors, and every previous set but the last was wrong.** They first read
  `:566`, `:601`, `:825`; those were corrected to `:584`, `:619`, `:843` with `:455` declared
  unchanged; at `83d9616` all four were wrong again and read `:590`, `:725`,
  `:760`, `:984`; #452's staffing warning and #455's payroll moved every
  one of them again; #486's restore-refusal work moved all four once
  more; and this anchor's #505 (entity retirement, one line added above `EntityStore.destroy`'s
  call site inside `PrisonerDischargeSystem`'s reach, felt here as a uniform
  +1) moved all four a sixth time, by exactly one line each — the smallest
  move recorded yet, and still not zero. The count and the four target states have held throughout
  six readings, which is the whole argument: **the grep above is what the next
  reader should run, and the numbers beside it are there to be checked, not
  trusted.** Nothing in `src/` sends a `protocol/handshake` at
  all — re-read at this anchor, all nine occurrences are the receiver
  (`state-machine.ts:698` and `:728` at this anchor; `:697` and `:727` at
  `07add3e`; `:472` and `:502`, then `:681` and `:711` before that), the
  transferables switch, the kind list or the
  schema. **Re-counted at this anchor and still nine, still split 4/2/3, and
  every one of the four in `types.ts` moved** — `types.ts:12`, `:23`, `:223`,
  `:442` (read `:7`, `:18`, `:218`, `:437` at `07add3e`; #498's client-side room-enclosure
  work and #502's actor-render payload both inserted content ahead of these
  declarations, for a uniform +5); `transferables.ts:41` and `:50`
  (unmoved); `state-machine.ts:698`, `:728` and `:737` (read `:697`, `:727` and
  `:736` at `07add3e`, a uniform +1 for the same reason the `transition()` sites
  moved). **ADR 0003 now carries the same measurement independently**, at
  `docs/adr/0003-simulation-worker-protocol.md:535`: *"grepping `protocol/handshake`
  across `src/` still returns four hits in `types.ts`, two in `transferables.ts`
  and three in `state-machine.ts`, all receivers or declarations"* — nine, split
  exactly as counted here, arrived at by a different reader, and that sentence
  carries no line numbers so this anchor's moves do not touch it. Two independent
  routes to the same fact are worth keeping, as #371's were below. So ADR 0006's state 2 describes a state the machine cannot
  occupy and ADR 0003 decision 4's version negotiation runs for nobody. Version
  compatibility still fails closed, by a different route: the decoder's
  `protocolVersion: z.literal(...)` in `src/simulation/protocol/types.ts:173`
  (read `:168` at `07add3e`, the same +5 as the other three `types.ts` anchors
  above). This is
  issue #118 item 1 and issue #274's A2, and both ADRs carry an implementation
  note for it — the two notes of that shape the corpus still holds, now that
  0024's has been deleted. The fix is in the code, and the open decision is
  whether to send the handshake or delete `'ready'` (issue #274, Q4).
- **FALSIFIED — ADR 0010's telemetry layer is wired, and the half of this entry
  that was a *code* claim is gone.** This entry was re-verified at `54418b6` and
  read: *"the telemetry layer is inert,
  nothing outside `src/services/telemetry/` imports it, by grepping the whole of
  `src/` for that path — every hit is inside the
  directory itself — so consent is never asked for and `record()` is never
  called. The prohibition half of the ADR holds; the sentence 'telemetry is fed
  from the main thread's orchestration layer' does not."*

  **Re-run at `bb3a01e`, the same grep is not clean and the conclusion inverts.**
  `grep -rn "services/telemetry" src/ --include=*.ts` outside the directory
  returns `src/main.ts:103-105` (`createTelemetryPipeline`, `createCrashReporter`,
  and a `CancelScheduledPump` type import) and
  `src/ui/telemetry-consent-prompt.ts:8`. **The first of those read `:98-100`
  until `53e1405`**, and is corrected here rather than overwritten for the
  reason this bullet keeps every previous value: the sequence is the argument.
  `src/main.ts:163-204` builds the
  pipeline as the first thing after `GAME_VERSION` and registers `error` and
  `unhandledrejection` listeners that call `crashReporter.reportUnhandledError`;
  `src/main.ts:2869-2874` mounts the consent prompt (**this read `:2494-2499`;
  #468's save-import work moved it twelve lines and it was re-anchored to
  `:2506-2511` at `c00b641`, then held through `07add3e`, then #500's
  `generateMasterSeed` function — inserted above it for the determinism reason
  its own doc comment gives — pushed it down 39 lines more to `:2545-2550`,
  then #534's door-edge work and #541's sentence draw pushed it 53 further to
  `:2598-2603`, then it moved **76 more** to `:2674-2679` — the largest single
  jump in the run — because #546's requirements work and #551's event channel
  both landed above it; then **92 more**, to `:2766-2771`, which was the whole
  of what `src/main.ts` gained in that window; at `53e1405` **71 more**, to
  `:2837-2842`, which is again the file's entire net growth in the window
  (`git diff --numstat cfab558..origin/main -- src/main.ts` is `72 1`, and
  `git log --first-parent cfab558..origin/main -- src/main.ts` names
  `2a00f98`/#579 as the only commit that touched it); and at `898a16a`
  **32 more**, to `:2869-2874`, which is once more the file's entire net
  growth in the window (`git diff --numstat eb1f040..898a16a -- src/main.ts`
  is `53 21`, and the two commits that touched it are `9a25700`/#659 and
  `c93109a`/#669)**). **The import span
  moved for the fourth consecutive anchor**, having held across the four before
  that: `:82-84`, then `:87-89`, then `:96-98`, then `:98-100` — two lines
  down, because #533's dismissal work added an import to the block above it, and
  **`:103-105` at `53e1405`**, five lines down, because #579's interface-scale
  work added an import block above it in turn. **The two halves of this bullet
  have now moved by different amounts in the same window**, which they had not
  done before: five lines at the top of the file and seventy-one at the bottom,
  because #579 added code both above the imports and above the mount. A single
  shift figure would have been wrong for one of them, which is why every anchor
  here is opened rather than offset.
  **The run of four ends at `898a16a` and the different-amounts finding does
  not**: the import span, `:163`, `:179` and `:201-204` are all **unmoved**,
  while the mount and its gate moved by the whole of the file's net **+32**,
  because #659's and #669's `+53/-21` falls entirely between `:204` and
  `:2833`. So the two halves moved by different amounts for the second
  consecutive anchor, from a window in which one of the two amounts is zero.
  `src/ui/telemetry-consent-prompt.ts:8` is the one anchor in this bullet that
  has **still** never moved, on a file no window has touched — six anchors now,
  five of which have moved and the sixth being the only one cited by symbol.
  **Two hits this sentence has never named, recorded because the next reader
  will run the grep and count six**: `src/main.ts:179` (this read `:172`, then
  `:174`, and is five lines further down again at `53e1405`; two
  lines down with the rest) and `src/ui/telemetry-consent-prompt.ts:17` are
  prose inside doc comments, not imports. **The count in this sentence was `four` until this anchor and it was
  right then**; the import span gaining a third line (`CancelScheduledPump`) is
  what makes it six, and the `src/main.ts` prose hit moved with the rest, from
  `:163` to `:172`. The two named here are still the only two that are prose. They were there at `bb3a01e` too, so the sentence has always been
  about the import sites rather than about the raw hit count; it is left saying
  what it means and the difference is written down here instead.
  So **the sentence this entry
  said did not hold is the one that now does** — telemetry is fed from the main
  thread's orchestration layer, off the tick and frame paths — and the sentence
  this entry asserted is the one that is false.

  **What is still true is narrower and rests on something else entirely, which is
  why this is a rewrite and not a strike.** No build of this repository sends
  anything, because the transport's destination comes from deployment
  configuration, nothing sets it, and with it absent the pipeline constructs
  *nothing* — so the consent prompt is not mounted either
  (`src/main.ts:201-204`, and `:2865` — both gate on `telemetry.enabled`).
  **The second of those read `:2833` until this anchor** and moved by the net
  **+32** `src/main.ts` took from `9a25700`/#659 and `c93109a`/#669, while the
  first did not move at all, because every line of that change lands below
  `:204` and above `:2833`.
  **This parenthesis read `:196-199` and `:2762` until `53e1405`**; both were
  correct at `cfab558` — they are the pair that anchor re-derived by symbol,
  after two consecutive anchors of naming the wrong code — and both moved with
  the rest of the file at #579, the first by five lines and the second by
  seventy-one. **That is the first time in this bullet's history that these two
  numbers went stale by ordinary drift rather than by having been wrong when
  they were written**, and it is the evidence that re-deriving them by symbol
  worked: a citation that is right on the tree that writes it moves cleanly
  afterwards, while one that is not accumulates a second error every time
  somebody offsets it.
  **Both numbers in this parenthesis read differently until this anchor, and
  neither of them named a gate.** It read *"(`src/main.ts:185-188`, and `:2598`
  — this read `:2494`, then `:2506` at `c00b641`/`07add3e`, then `:2545` — both
  gate on `telemetry.enabled`)"*, and opening `82ae630` says what those two
  lines actually held there: `:185-188` was doc-comment prose — *"for the same
  reason: `vitest.config.ts` runs in `node` with no jsdom"* — four lines above
  the `const crashReporter = telemetry.enabled === false` expression at
  `:194-197`; and `:2598` was a doc comment about `AutosaveScheduler`, seventy-two
  lines above the `if (telemetry.enabled && appRoot !== null)` at `:2670`, and
  is the *mount span's* opening value from one anchor earlier, left behind when
  the mount was renumbered and the gate beside it was not. **So this is not a
  citation that went stale in the last window; it was naming the wrong code on
  the tree that wrote it**, which is the class `docs/AGENT_WORKFLOW.md` §3 calls
  a claim false the day it is written, and which this file's own header calls
  the thing a delta pass is structurally blind to. Both are re-derived by symbol
  above. **The word "unmoved" stood on the first of those two
  anchors and is withdrawn rather than deleted**: `:180-183` was the
  `crashReporter` gate at `4ace2da`, and the drift recorded here is what became
  of it. A citation described as unmoved
  is the one a reader is least likely to re-check, which is the argument for
  not writing the word at all — and this correction is the same argument made
  the harder way, because the citation nobody re-checked had stopped being about
  its own subject two anchors before anyone noticed. That is
  [ADR 0044](./0044-what-happens-to-a-service-tier-nothing-calls.md)'s rule
  obeyed, not inertness: the old claim was *"nobody wired it"* and the new fact
  is *"it is wired and switched off by the absence of a destination"*. The two
  look the same from a `record()` count and are opposite in what they say about
  the decision.

  **ADR 0010 carries all of this in its own body and got there first**, dated, in
  both directions — *"That feed did not exist between 2026-08-24 and 2026-08-27,
  and what this paragraph used to say about the present is what
  [ADR 0046](./0046-shipping-the-telemetry-pipeline.md) proposes to replace"* —
  and it records that the consent surface landed alone before any producer
  existed, so the sentence about the first `record()` call *"had no referent until
  2026-08-27"*. Nothing here is awaiting a decision that is not already §2's:
  standing the ingest up needs the first server-side entry point, and ADR 0046 is
  `Proposed`. What this entry is for now is the record that a §§3-6 claim about
  an absence survived three anchors and died in one delta, in two files
  (`src/main.ts` and `src/services/telemetry/**`) that **this file's enumerated
  set did not list** until the same commit that wrote this paragraph.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are unmet.**
  `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts:136` and `:324`, both re-read at this
  anchor on a file `git diff` reports as untouched) exist; no replay
  runner implements the port, no endpoint exists, and nothing outside
  `src/services/` imports the layer. **This status is the most accurate in the corpus** — it says "gated", and
  the gates are genuinely shut. Listed as a model, not a defect.

  **Two corrections at `bb3a01e`, both to the same clause.** It said *"the single
  mention elsewhere (`src/main.ts:86`) is a comment naming the file, not an
  import"*. `src/main.ts:86` was then `import './styles.css';` — a real import, of
  nothing to do with challenges, so the anchor no longer supported the sentence it
  was given for. The comment moved to `src/main.ts:102`, where it read
  *"`src/services/challenges/verification.ts`, against a challenge definition's
  …"*. (**Written here as `import type { CancelScheduledPump }` in the first
  draft of this correction and caught by re-deriving every anchor mechanically
  before commit** — that line was `:84`. Recorded because it is the same off-by-two
  the entry is about, committed while correcting it.)

  **Every number in the paragraph above has now moved, and the correction rotted
  no slower than the claim it corrected.** At `85c1c29`: `src/main.ts:86` is
  `import { createTelemetryConsentPrompt } from './ui/telemetry-consent-prompt';`,
  `import './styles.css';` is at **`:91`**, the challenges comment is at
  **`:107`**, and `import type { CancelScheduledPump }` is at **`:89`** — all
  five lines down, from #541 adding one import above them. The three sentences
  are put into the past tense against `bb3a01e` rather than renumbered, because
  the useful content is the *shape* of the error and not the values: this is a
  correction of a correction of an anchor, three deep, and the only one of the
  four spans that has ever stayed put is the one cited by symbol. §4 of
  `docs/AGENT_WORKFLOW.md` says a correction is no more durable than the claim
  it corrected; this is the fourth consecutive anchor at which that has been
  demonstrated inside this file's own text, which stops being an anecdote and
  starts being the measured base rate. And **there are two mentions
  now, not one**: `src/persistence/save-schema.ts:1214` names
  `masterSeedSchema` *"from `services/challenges`"* in a comment explaining why it
  does **not** import it (this read `:1164`, then `:1182` at `07add3e` after
  #486's refused-restore work added eighteen lines above it, then `:1198` after
  #497's assault-sanction work added sixteen more, and **`:1214` at `cfab558`**
  after #571's V4 bounds-recovery work added sixteen more again; re-read at
  each, and the sentence itself is unmoved by any of the three changes: it is
  about a schema-module boundary, not about which value production supplies.
  **Five values for one unchanged comment** — that is the symbol-over-line rule
  at the foot of §6 arguing for itself in a single citation). Both
  are comments, so the finding holds; the word
  *"single"* is the part that rotted, which is the shape §4 of
  `docs/AGENT_WORKFLOW.md` says rots first.
- **The 900×600 budget had three figures in the corpus and now has two, because
  ADR 0025 withdrew the third.** This entry used to be headed *"ADR 0022's
  pre-correction 900×600 budget disagrees with `src/ui/hud/build-panel.ts`"*,
  which overstated it in one direction and understated it in another, so it was
  rewritten rather than re-verified; the heading then read *"three figures in the
  corpus, and only one of them is live"*, and the third was withdrawn at
  `bb3a01e`. Both wordings are kept because the second was the finding that got
  the third figure withdrawn.

  **Overstated:** there is no live disagreement between the ADR and the file.
  `src/ui/hud/build-panel.ts` has said *"7.8px is the entire budget"* since
  before `4ed571f`, and ADR 0022's table reads `| 900×600 | 12.2 | 7.8 |` with a
  `Now` column measured to 0.05px (7.81). Both name the same corrected figure.
  `11.8` survives in that file only as the reading it explicitly records as
  superseded, and ADR 0022 already devotes a bolded paragraph to the `11.8`/`12.2`
  split and to why it declines to resolve it — so the entry's closing claim that
  the disagreement *"has survived unnoticed"* was the one sentence here that was
  plainly false. It was noticed, in writing, in the document itself.

  **Understated, and CLOSED at `bb3a01e` — the ADR withdrew the figure.** This
  entry read: *"the third figure has no source. ADR 0025 says its inherited budget
  is 'the 3.9px at 900×600 that ADR 0022 and `hud.css` both record'. Re-verified
  at `54418b6` by grepping the whole tree: **`3.9` appears in no ADR but 0025 —
  `docs/adr/0025-guard-hiring-surface.md:70` and `:182` — in no `.css` file, and
  nowhere in `src/`.** … it is a docs-truth task inside an accepted ADR and it
  belongs in a change of its own."*

  **That change is #447**, and the ADR now says it in its own body rather than
  only here: *"The headroom figure this paragraph used to state, 3.9px, is
  withdrawn rather than replaced. It was attributed to ADR 0022 and
  `src/ui/hud/hud.css`, and neither records it: `3.9` appears in no other ADR, in
  no `.css` file and nowhere in `src/`."* It also states what the two sources do
  record at 900×600 — 7.81px — says why no replacement is put in its place
  (*"picking a replacement would be inventing a measurement rather than inheriting
  one"*), and offers a labelled guess at the number's origin: 11.8 − 7.81 = 3.99,
  *"a figure for the space that turned out **not** to exist"*. **Left verbatim was
  the right call and it is now discharged by the party entitled to make it**,
  which is the outcome this entry asked for.

  **Two corrections to the entry itself, both found by re-reading rather than by
  the delta.** Its anchors `:70` and `:182` no longer name the figure — the
  withdrawal is at `docs/adr/0025-guard-hiring-surface.md:74-76` — and it said
  *"there are five `.css` files under `src/ui/`"*. **There are four**, and
  `git ls-tree -r 54418b6 -- src/ui` returns four as well, so that count was wrong
  when it was written and not overtaken: `hud.css`, `tokens.css`,
  `primitives.css`, `brand.css`, with no `3.9` in any of them. The caveat about
  `grep '3\.9'` also hitting ADR 0022's *"÷ 12.2 is 23.9"* still holds and that
  line has moved from `:562` to `:582`, and **to `:588` at `07add3e`** after #481
  corrected that ADR's `HudRoomGesture` anchor. So the residue of this entry is one live
  fact — **the 900×600 budget now has two figures in the corpus, 7.81 live and
  11.8/12.2 recorded as superseded, and no third** — and one lesson, that the
  entry's own hand count of `.css` files was the least reliable thing in it.

  **And at `53e1405` the sentence this entry quotes as the discharge has gone
  partly false, in the one clause nobody was watching.** ADR 0025's withdrawal
  reads *"`3.9` appears in no other ADR, in no `.css` file and nowhere in
  `src/`"*. The last clause stopped being true at **`2a00f98`** (#579,
  v0.0.212): `src/ui/primitives/icon.ts:68` now holds `'M15.8 16.1h3.9'`, the
  fourth stroke of the `ui-scale` glyph the interface-scale work added.
  `git show cfab558:src/ui/primitives/icon.ts` returns no `3.9` at all, and
  `git log -S 'h3.9' -- src/ui/primitives/icon.ts` names that one commit, so
  the date is derived rather than inferred from the window.

  **The sentence's point survives and its grep does not, and the distinction
  is the whole of the finding.** No `.css` file records the figure — there are
  still **four** under `src/ui/`, re-derived at this anchor by
  `git ls-tree -r HEAD -- src/ui`, so the count this entry once got wrong is
  right now and stays right — no other ADR records it, and nothing in `src/`
  records it *as a measurement*. What changed is that a reader running the raw
  grep the sentence invites gets a hit, and has to work out unaided that SVG
  path data in an icon is not a headroom figure. **That is precisely the move
  this entry already made once**, for `grep '3\.9'` also matching ADR 0022's
  *"÷ 12.2 is 23.9"*, and the caveat it wrote for that case is the shape the
  new one needs: name the hit, say why it is not the thing, and let the next
  reader stop.

  **The fix is ADR 0025's and is handed over rather than made here**, because
  this commit's surface is `docs/adr/STATUS-QUEUE.md` alone and an accepted
  ADR's body is amended in its own commit — the rule §5 applies to every other
  entry. What it is owed is one clause, corrected in both directions: the
  measurement claim kept, and beside it the path-data hit named with its
  commit. **The class, not the instance**: a sentence of the form *"X appears
  nowhere in `src/`"* is the absence-claim `docs/AGENT_WORKFLOW.md` §4 says
  rots first, and it is falsified by any file that happens to contain the
  characters for an unrelated reason. Two of the three clauses in this one are
  bounded (ADRs and `.css` files are small, enumerable sets); the third is
  bounded by nothing, and it is the one that broke.
- **ADR 0022 was written against v0.0.30, its structural citations had drifted,
  and at `bb3a01e` the ADR has corrected them itself.** This entry read *"its
  structural citations have drifted"* and left the body verbatim on the ground
  that a body is amended in its own commit. **#447 was that commit.** ADR 0022 now
  dates the historical claim instead of asserting it — *"That was true of `main`
  when this document was written, at v0.0.30: `HudIntent` declared seven members
  and none of them was a room"* — and adds *"Both halves of that sentence have
  since been overtaken, and the anchor it carried is now actively misleading"*,
  with the eighteen-member count, the three room-related members and the note
  that `hud.ts:153` *"now declares `HudRoomGesture`"*, so a reader following the
  old anchor lands on a type that is about nothing else. It says in terms that it
  is correcting this rather than leaving it *"as `STATUS-QUEUE.md` recorded
  them, because that entry said this belonged in a change of its own and this is
  that change"*. **That is the second entry in this section discharged by the
  document it was about, in the same pull request as the first**, and it is what
  §5 is for.

  What is left is the measurement, re-taken at this anchor. `HudIntent`
  declares **nineteen** members at `cfab558`, counted as
  `grep -c "readonly kind: '"` between `export type HudIntent =` and the
  union's close — three of them room-related (`zone-room`, `unzone-room`,
  `arm-room-tool`), which is the half of this sentence that did not move.
  (**This read "eighteen" and had been false for one anchor.** The nineteenth
  is `dismiss-staff`, added by **#533 at `a8a446e`**, which is in the
  `82ae630..e1813b7` window — `git show 82ae630:src/ui/hud/hud.ts` has no such
  member and `git show e1813b7:…` does. The pass that anchored at `e1813b7`
  had that pull request in front of it and **recounted the command union from
  it in its own header**, thirteen to fourteen, while leaving this union — which
  the same change extended — at eighteen. Two unions, one commit, one
  recounted. Corrected here rather than overwritten, because the entry's whole
  subject is a hand count that drifted and this is that happening to the
  correction, for the fourth time in this entry.);
  (**This entry said "sixteen" and gave the range as `:270-491`.** The count was
  wrong by two and the range short by 62 lines, and both were wrong **when
  written**: counting the same way at the previous anchor `8d29aa6` also gives
  eighteen, and the set has not changed since. That is worth recording where it
  happened, because this entry's entire subject is somebody else's drifted hand
  count and its stated moral is that a count in prose is the least durable
  citation this corpus has. It then made the same mistake in the sentence saying
  so — which is the argument for the rule §6 now closes with, and the reason the
  count above is stated with the boundary that lets a reader re-derive it rather
  than on its own.)

  **The union's own line numbers, since they are cited three times below.** At
  `bb3a01e` `export type HudIntent =` is at `src/ui/hud/hud.ts:271` and the union
  closes at `:541`; `HudUnavailableNotice` begins at `:555`. Every one of those is
  one greater than it was at `54418b6`, so the range this entry gave as
  `:270-553` is now `:271-554` and ADR 0022's own freshly-written `:270-540` is
  now `:271-541` — **a corrected anchor that drifted inside the same eleven
  releases that corrected it**, which is the sharpest available argument for
  recommendation 1 at the foot of §6 and is recorded here for that reason rather
  than to condemn the correction.
  **`AWAITING_PRODUCER` is now empty**, which is more than this entry's old
  claim that `ZoneRoom` is not in it: #312 gave `ZoneRoom` a producer and #367
  gave the last one, `CancelBuildOrder`, its own
  (`tests/foundation/unconsumed-command-contract.test.ts`, whose
  `AWAITING_PRODUCER` declaration at `:224` has a body that is nothing but a
  comment beginning *"**Empty, and that is a first.**"*, and whose gate comment at
  `:250` calls an empty list *"not a state to defend"* but *"the state this gate
  exists to bring about"*, and which fails in both directions — **these read
  `:204` and `:230` until this anchor**, moved twenty lines by the twenty-line
  account of `DismissStaff` that #533 added to the declaration's own comment,
  and the list is still empty); the `onIntent`
  switch in `src/main.ts` has moved; and its
  citation of *"`tests/unit/ui-hud-messages.test.ts:196-200` asserts it by
  scanning for the import"* now lands eight lines short — #339 removed the
  single-file, comment-blind copy of that check from
  `tests/unit/ui-hud-build-panel.test.ts`, and the surviving assertion, which
  covers every file under `src/ui/hud/**` and `src/ui/primitives/**` over
  comment-stripped source, is `it('imports nothing from the simulation', …)`,
  `:218-224` at `bb3a01e`. The ADR names the right test and
  the property it names is strictly stronger than it was; only the line range
  drifted.

  **This entry's own anchor into that gate was wrong before the delta opened, not
  by it.** It read `:173-203` for the `AWAITING_PRODUCER` declaration, and
  `git show 54418b6:tests/foundation/unconsumed-command-contract.test.ts` puts the
  declaration at `:204` and the quoted comment at `:230` on that tree too — the
  file is in the delta's *untouched* set, so no diff was ever going to raise it
  and only opening it did. That is the class the header calls a claim already
  false when the window opened, found here for the second consecutive anchor.
  `:204-210`, by contrast, was exact at `54418b6`, and fourteen lines of a new
  status-strip case moved it to `:218-224`.

  **This entry said "thirteen", then "fifteen", and neither was right for long.**
  It was fourteen at `ac03d8f`, the commit that wrote "thirteen"; `remove-object`
  (#328) made it fifteen; and `cancel-build-order` (#367) has now made it
  **sixteen** — so a sentence written to record somebody else's drifted count has
  itself been wrong at three successive readings. The two members the original
  hand count missed are `arm-build-tool` (**`src/ui/hud/hud.ts:444-449` at
  `cfab558`**, which read `:404-409` from `bb3a01e` until #498 moved it and
  then `:429-434` through `85c1c29`) and
  `arm-room-tool` (**`:598-603`**, which read `:537-542` and then `:561-566`
  over the same spans), the
  only two declared across several lines rather
  than on one, which is exactly the shape a hand count skips. The sixteenth,
  though, is on a single line (**`:486`**, `cancel-build-order`, which read
  `:446` and then `:471`) and was missed for
  the ordinary reason: nobody recounted. **All three were stale before this
  window opened rather than by it**: `:429-434`, `:561-566` and `:471` are the
  `4ace2da`/`85c1c29` values, one line out from `82ae630`, and `arm-room-tool`
  was **twenty-three lines out at `e1813b7`** — moved by #533, the same commit
  that added the nineteenth member. Re-derived by symbol at `cfab558` and
  recorded with every value the three have carried, because the list of values
  is the argument and the current one is only the last of them.

  **Make it four readings, and the fourth was a self-contradiction rather than a
  drift.** *"Sixteen"* stood in this paragraph while the paragraph above it in the
  same entry said **eighteen**: `ab33903` corrected the first count and did not
  sweep the second, and `cancel-material-purchase` and `release-guard` are the two
  members the difference is made of. **This entry disagreed with itself for eleven
  releases about a count whose entire subject is counts disagreeing.** No diff
  would have said so; reading the entry's own paragraphs against each other did,
  which is the check §4 of `docs/AGENT_WORKFLOW.md` names and the same one that
  caught this file's title twice. The two anchors above moved with it —
  `arm-build-tool` read `:403-408` and `arm-room-tool` `:486-491`, and
  `git show 54418b6:src/ui/hud/hud.ts` puts `arm-room-tool` at `:536` on **that**
  tree, so that one was fifty lines out before the delta opened rather than by
  it. Nothing in
  the ADR turns on the figure; what it demonstrates is that a count in prose is
  the least durable citation this corpus has, and it is the reason the entries
  around it cite symbols instead. None of it
  touches the decision, but a reader following a `file:line` out of that ADR
  should expect to land near rather than on.
- **ADR 0027's command-surface count has drifted the same way**, new as of this
  commit and worth recording because it is one clause inside a question that
  stays open. Its question 2 says the entire command surface is seven members and
  *"not one of them concerns a prisoner"*. **This entry answered "nine", and the
  correction has itself drifted twice** — which is the entry's own point turned
  back on it, and the reason the anchor above now has a test. Nine was right at
  `4ed571f`; `PlaceObject` (#320) made it ten before the v0.0.65 re-anchor, which
  did not re-count; `RemoveObject` (#328) has since made it eleven. Re-verified at
  `83c3121` and it is **still eleven** — the one count in this section that has
  held across the eleven releases to `dbe271f`, because #367 wired an existing
  member rather than adding one. **It no longer holds at that count.**
  `simulationCommandSchema`, declared
  `export const simulationCommandSchema = z.discriminatedUnion('type', [` in
  `src/simulation/protocol/commands.ts` (**`:542` at this anchor**; this entry
  cited `:437`, then `:465`, then `:467`, then `:493`, and all four were
  overtaken — `:467` held from `bb3a01e` through `4ace2da` and #536's and #541's
  insertions above it moved it 26 lines, and #533's `DismissStaff` schema moved
  it 49 more), discriminates
  **fourteen**, matching the fourteen hits of
  `grep -c "type: z.literal" src/simulation/protocol/commands.ts`: #392
  added `CancelMaterialPurchase` and #394 added `ReleaseGuardAssignment`, both
  with producers in the same change, so `AWAITING_PRODUCER` stayed empty while
  the count moved. `AdmitPrisoner` (#306) still concerns a prisoner. **Re-counted
  at `bb3a01e` and it was thirteen then**, which was the only count in §5 to
  survive that delta unchanged: `commands.ts` was edited in it (#460's
  paused-clock work) and added no member. **Thirteen is fourteen at this
  anchor**: #533 added `DismissStaff`, the command that made a *departure*
  reachable where `ReleaseGuardAssignment` had only released a claim, and it
  landed with its producer in the same change — so `AWAITING_PRODUCER` stayed
  empty while the count moved, for the third time in this entry's history. The
  fourteen are `PlaceBuildOrder`, `CancelBuildOrder`,
  `ZoneRoom`, `UnzoneRoom`, `PurchaseMaterials`, `CancelMaterialPurchase`,
  `AdmitPrisoner`, `HireStaff`, `PlaceObject`, `RemoveObject`,
  `ReleaseGuardAssignment`, **`DismissStaff`**, `Undo` and `Redo` — enumerated
  rather than tallied, because this entry's whole subject is a tally that
  rotted, and **the enumeration is what made this drift cheap to correct**: the
  list said which thirteen, so finding the fourteenth was a set difference and
  not a re-count. The
  load-bearing half of the argument is
  unaffected — there is still no player input to *placement*, and an override
  still needs a new command type, its codec case, a handler branch and a decision
  about whether intake blocks — so the body was left verbatim rather than
  rewritten by the commit that accepted it, exactly as 0022's drift was.

- **Two Accepted ADRs still say object placement does not exist**, which is the
  same drift as 0022's and 0027's structural citations and is recorded the same
  way. `docs/adr/0023-room-occupancy-authority.md` says step 1 of its resolver is
  *"unimplementable today … object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3"*, and
  `docs/adr/0027-cell-sharing-assessment.md` says a freshly zoned room is
  registered with `capacity: 0` *"because object placement does not exist"*. ADR
  0028 phase 1 falsified the premise in both. The document they both cite has
  already moved — gap 13 opened *"Object placement exists, and `minQuantity`
  is still unchecked"* in `docs/HUD_PROJECTIONS.md`, which is how it should be
  cited: that number has been `:553`, then `:639`, and was `:754` at `bb3a01e`,
  three anchors and three readings of a sentence that had never changed a word,
  so the number was retired there and the quotation kept.

  **And then the quotation itself went false, which had not happened before in
  this file.** At `85c1c29` gap 13 opens **"Object placement exists, and
  `minQuantity` is counted"** — #530 (issue #528) closed the second half of the
  gap, and its own body now says so in terms: *"both halves of this gap are now
  closed, the second at #528"*, with the superseded paragraph kept beneath it in
  the same marked-rather-than-overwritten style this file uses. The quotation is
  corrected above and the old wording left standing beside it. **This is worth
  more than the correction.** §4 of `docs/AGENT_WORKFLOW.md` ranks a quoted
  sentence as the most durable citation available here, and this entry retired a
  line number *to* a quotation three anchors ago on exactly that ground. The
  ranking survives — the number moved three times in the span the sentence
  survived once — but "most durable" is not "cannot rot", and the thing that
  falsifies a quotation is the only thing that should: a real change to the
  subject, rather than an edit anywhere above it. A quotation fails **loudly**,
  because the words are gone and no grep finds them, where a line number fails
  **silently** by landing on a plausible neighbour. That asymmetry is the actual
  argument for the rule, and it is stronger than the durability claim this entry
  had been making for it. **The consequence for the two ADRs is the opposite of
  a discharge**: both halves of gap 13 are now closed, so
  `docs/adr/0023-room-occupancy-authority.md` and
  `docs/adr/0027-cell-sharing-assessment.md` are further from the world than
  when this entry was written, not closer, and the handover to amend them
  stands and has grown — so the two ADRs are the
  last places in the corpus asserting the old world, and a reader who follows
  either citation lands on a page contradicting the sentence that sent them. The
  two sentences are still there and were re-read here:
  `docs/adr/0023-room-occupancy-authority.md:308-309` — **which read
  `:204-205`, and which this entry described as *"unmoved"* until this
  anchor.** #654 moved it **104 lines** while converting that ADR's own
  `file:line` citations into verbatim quotations, so the drift arrived in the
  window from the commit that exists to stop drift of exactly this shape; the
  sentence there is unchanged and now reads *"Step 1 is unimplementable today
  and this ADR does not pretend otherwise: object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3."* It is quoted here, rather than only
  re-anchored, so that the next move of it costs nothing — and
  `docs/adr/0027-cell-sharing-assessment.md:81` — **which this entry cited as
  `:55`**, before #371 added that ADR's 2026-08-26 Update above it. The Update is
  now the first thing a reader of 0027 meets, so the contradiction is at least
  signposted inside the document rather than only here.

  **The second half of this entry is withdrawn as false.** It read: *"Neither
  conclusion moves, which is why the bodies are left verbatim: 0023's step 1 is
  now reachable but still resolves to zero for an empty room, so branches 2 and 3
  remain the ones a shipped session takes, and 0027's co-occupancy is still
  unreachable."* Both halves are refuted by the measurement in the ADR 0027 entry
  above. 0023's resolver orders its branches *"1. If any placed object in the room
  supplies occupancy, aggregate those objects' capabilities"*, then the authored
  nominal figure, then `0`
  (`docs/adr/0023-room-occupancy-authority.md:300-307`, which read `:196-203`
  until #654 moved it 104 lines; **the quoted branch survived the move and
  only the range beside it broke**, which is recommendation 1 at the foot of
  §6 producing a measurable result again, this time inside the window that
  produced the counter-example) — and a cell holding two
  beds resolves through **branch 1** to a `residentCapacity` of 2 in a session a
  player can start. Branch 3 is what an *empty* room takes; branch 2 is
  unreachable in either world, because no room definition authors a nominal
  figure — the eighteen definitions at `src/content/room-catalog.ts:68-165`
  declare `requirements` and nothing else, and the string `capacity` does not
  occur in that file at all (re-counted and re-grepped after #376 added an
  import-time cross-catalogue check to the head of that file, which moved every
  definition down by two lines and changed nothing else this entry rests on). And 0027's co-occupancy is reachable:
  two prisoners hold `room.cell:4:6`. So what is false in those two ADRs is the
  stated **cause** — object placement does exist — and their **conclusions have
  moved too**; the bodies are still left verbatim, but on the narrower ground
  that a body is amended in its own commit and by whoever takes the decision, not
  because the sentences after the false clause survived. The same phrase in
  `docs/research/` stays untouched for the reason that directory's README gives.

- **ANSWERED 2026-08-27 — two dated rulings were written into ADR 0008's Accepted
  body with no queue row, on the same day #380 argued that such a thing needs
  one.** The governance question this entry filed as the owner's is decided and
  the rule is `docs/adr/README.md`'s *"An amendment to an accepted ADR: what form
  it takes, and when it needs a queue row"*; **the two rulings' own substance is
  still the owner's and is now in §2 as this file's one live entry.** The entry
  below is kept as written, because it is the argument the ruling answers and
  because this file's practice is to quote what it corrects rather than overwrite
  it. What the ruling settled, in four lines:

  1. **No.** *"Applies"* and *"amends"* are not distinguishable by anything a
     reader can check — the test would be *"does the ADR as it stood already
     entail this?"*, a re-derivation from the old text, and an ADR exists to
     spare the next reader exactly that. So **no rule turns on the difference.**
  2. **The queue rule is therefore not widened to cover amendments as a class.**
     Counted on disk: seventeen post-hoc additions live in `docs/adr/`, and
     **exactly one of them ever had a row here** — 0007's second amendment.
     Widening the rule would have condemned sixteen on the day it landed, and
     this section already calls that rule *"unsatisfiable under concurrency"*.
  3. **What is required instead is form, and the corpus already keeps it**:
     fifteen `Amendment`/`Addendum` sections across nine ADRs, fourteen of them
     already dated in the heading. **Both figures were exact at `54418b6` — the
     same grep run against that tree still returns 15 across 9 — and both are
     now wrong: at `bb3a01e` it is 27 sections across 16 ADRs**
     (`grep -rc "^#\{2,4\} \(Amendment\|Addendum\)" docs/adr/*.md`), because
     #447 alone added amendments to ten ADRs. The ruling does not turn on the
     tally; the *"seventeen post-hoc additions"* and *"ten covered / seven not"*
     figures in item 2 and item 4 below rest on a hand count whose method this
     entry never states, so they cannot be re-derived here and are **not**
     re-asserted at this anchor. `docs/adr/README.md` ruling 3 still states them
     verbatim, which means the corpus now carries a stale seventeen in two
     places; correcting the README is not this file's edit to make and is handed
     over here. **Still open at `07add3e`**, re-read rather than assumed:
     `docs/adr/README.md` ruling 3 still says *"Ten of the 17 post-hoc additions
     on disk are covered today"* and ruling 4 still says *"Condemns **16 of the
     17** post-hoc additions on disk"*, while the mechanically derivable figure
     — 27 `Amendment`/`Addendum` sections across 16 ADRs — is unchanged from
     `c00b641`. The seventeen is a hand count whose method is not stated
     anywhere, so it can neither be re-derived nor corrected from here. **Two
     anchors open. This is the one §5/§6 handover that has not moved**, in
     contrast to the two discharged in this window. The two exceptions were ADR 0008's rulings,
     which had no section at all — the only unsectioned dated rulings in the
     directory — and ADR 0033's undated heading. ADR 0008's are corrected in the
     same commit as this entry, text untouched.
  4. **The trigger stays *outstanding*.** An amendment says in its own opening
     whether it was approved; one that says nothing reads as outstanding without
     anyone having to reconstruct who wrote it. Ten of the seventeen are covered
     that way today; the seven that are not are named in
     `docs/adr/README.md` ruling 3, and five of them are a backlog this decision
     does not condemn.

  **Also corrected: this entry's closing citation.** It said *"Two ADR numbers
  are unused — `docs/adr/README.md:102-106` records **0032** as next free and
  0030 as 'held by an unmerged branch'"*. That file now states **0038** as next
  free, and 0030 is still held. The point the clause was making survives —
  nothing here was blocked on a number — but the line-range citation did not, on a
  file this same entry is a claim about and which this same commit edits. That is
  the argument for citing by quoted phrase rather than by line, which is what the
  rest of §5 already does and what the entries above it were rewritten to do.

  **And the correction above was itself false on the day it was written, which is
  the third time this file has caught that inside its own text.** *"That file now
  states **0038** as next free"* was written at `bb3a01e`, and
  `git show bb3a01e:docs/adr/README.md` states **0053** — 0038 is what the
  *previous* anchor's tree said, carried forward without re-reading. At
  `c00b641` the line reads **0058**, and it now says in its own words that it is
  *"a ceiling over a gap rather than the next gap — read the table"*, because
  0055 and 0058 are held by parallel drafts and 0056 and 0057 were assigned
  ahead of their drafts. So the durable statement is not a number at all: **the
  next-free line is a ceiling, the table is the record, and this entry should
  never have restated either.** 0030 is still held, which is the one half of the
  original clause that has survived four anchors. The point the clause was
  making — that nothing here was blocked on a number — survives all of it.

  **And the line reads 0064 at `07add3e`**, nine releases after it read 0058 —
  0059, 0061, 0062 and 0063 all landed, and only 0063 moved the line, because
  the contract is `max + 1` and the other three were below the maximum already
  on disk. The number is recorded once more only to date it: **0032, 0038, 0041,
  0053, 0058, 0064 — six readings of one line across five anchors**, which is
  the same six-item proof §6's `income.ts` bullet carries and is why the durable
  statement above is not a number.

  **And the line reads 0068 at `01974e5`**, eleven releases after it read
  0064 — 0065, 0066 and 0067 all landed, and this time all three moved the
  line, one after another, because each was the new maximum the moment it
  landed (`docs/adr/README.md`'s own paragraph walks through why: 0064 was
  unmerged when 0065's draft returned, so 0065 declined a number the way 0064
  had; 0066 declined for a reason that turned out not to hold, and landed as
  the number a guess would have taken anyway; 0067 moved the line to 0068,
  which that paragraph then had to correct in place — it had reserved 0067 for
  a different, still-unmerged branch, #493's, and the reservation moved to
  0068 instead). The number is recorded once more only to date it: **0032,
  0038, 0041, 0053, 0058, 0064, 0068 — seven readings of one line across six
  anchors**, one fewer than §6's `income.ts` bullet now carries (eight,
  because that sentence was already falsified once more before this file
  existed) — a different sentence in a different file, tracked separately; the
  two have moved together by coincidence of timing rather than by any rule
  tying them.

  The entry as filed, unchanged:

  This is for the owner rather than a defect this file can settle, and it is here
  because nothing else would surface it. #382 added both to
  `docs/adr/0008-trusted-service-boundary.md` §2: *"**Generalised, 2026-08-26
  (issue #280 finding F14): a Data API role holds exactly the DML privileges its
  zone needs on a table, and nothing else**"*, which states *"the rule this
  settles for every future table"*; and *"**Authority over a row is not authority
  over the record of when it was written.** Decided 2026-08-26 for issue #194"*,
  which narrows §2's *"saves, settings — Z0/Z1 (client-authoritative)"* row by
  ruling a timestamp column out of "content". Both are written as decided. Neither
  carries an approval caveat, and **neither has a §2 row**.

  **The tension is with a rule that landed hours earlier, not with a rule this
  file invented.** #380 queued its ADR 0007 amendment on the argument §2 now
  states — that an amendment inside an Accepted ADR is invisible to
  `adr-numbering-contract.test.ts`, so *"this row is the only thing that says it
  exists"* — and it declined to self-approve, marking its heading *"(awaiting
  approval)"*. #382 took the other view for the same shape of edit. Its stated
  reason is that these are *applications* of ADR 0008 §2's existing zone taxonomy
  rather than new decisions: *"Recorded as a rule in ADR 0008 section 2 rather
  than only in a migration, because the question is asked again by every table
  that gets a timestamp."*

  **That reading may well be right**, and §2's rule triggers on an *outstanding*
  decision, so a ruling that is not outstanding needs no row by the letter of it.
  What is missing is the line between the two, because #380's argument does not
  draw one: both edits add prose to an Accepted ADR that changes what the ADR
  requires of future work. **The question for the owner is whether "applies an
  accepted decision" and "amends an accepted decision" are distinguishable by
  anything a reader can check**, and if not, whether the queue rule should cover
  both. Recorded, not decided; ADR 0008's `Status` is `Accepted` and no status is
  wrong either way. Numbers were free at the time — the index's **Next free
  number** line said so, and still records 0030 as *"held by an unmerged
  branch"* — so nothing here was blocked on a number. **This entry cited
  `docs/adr/README.md:102-106` and said that range "records **0032** as next
  free". Both halves are stale:** the index has since passed 0038, 0039 and 0040
  and now states 0041, and `:102-106` is prose about how a neighbouring
  paragraph is worded for a test, not the next-free line at all. Cited by name
  rather than by line and number, because this is the third correction of the
  same shape in this file.

Also not here as a decision: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:12` for `lockstate-staging`, `:20` for `lockstate`, both
re-read at `bb3a01e` on a file the delta did not touch) while
`docs/DEPLOYMENT.md`'s section **"What currently serves lockstate.io"** records
that `lockstate.io` is in fact served by `lockstate-staging` and that the Worker
`lockstate` is *"a Worker that has never been deployed"*. That is a live
operational trap. **This entry called it "a missing warning in the ADR body" and
that is false** — the warning is not missing.
`docs/adr/0002-cloudflare-static-assets.md:31-42` carries it in the ADR's own
body, under the heading *"Operational note, 2026-08-24: what is configured here
is not what is deployed"*: `:31` says *"Neither describes what is currently
serving traffic"*, `:33` quotes the deployment document, and `:42` states *"This
note records the discrepancy; it does not resolve it"* and assigns the open
decision to issue #274, Q9.

**Both of this entry's `docs/DEPLOYMENT.md` numbers are retired rather than
repaired, and ADR 0002 is the reason.** They read `:167` and `:172`. At `bb3a01e`
that section began at `:200` and at `c00b641` it begins at `:253`, which is the
retirement earning its keep for a second window: the section title is the
citation and it needed no repair when #474 pushed the whole document down 54
lines. `:167` is a blank line and **`:172` lands inside
"What can publish the staging Worker"** — a neighbouring section about which
credentials let CI publish staging, which says nothing about what holds the
domain. That is precisely the failure ADR 0002 spent a paragraph on in this same
delta, about its own former anchors into the same file: *"the three anchors did
not merely drift by a few lines — they landed on a neighbouring subject that
reads plausibly … **this is the one citation in this corpus where following the
wrong paragraph can cost the live domain**"*. A reader sent to `:172`, finding a
section about publishing staging and no trap warning, could conclude the trap had
been resolved and dispatch the `production` job. **So this entry made the same
mistake ADR 0002 was correcting, in the same file, while quoting the ADR that
corrects it** — and the fix is the one ADR 0002 took: the section title and the
quoted sentence, no number. The ADR's `:38` moved to `:42` in the same delta,
which is its own small argument. That note landed in #284, long before either of this file's last two
anchors, so the sentence was wrong when it was written and not overtaken —
another entry that a re-read catches and no gate can. What remains true is the
part that matters: it is not a wrong status, and the deployment document carries
the trap.

Also not here as a decision, and **new at this pass: ADR 0003 has no amendment
for the `zoning` sibling of `simulation/status-counts`.** The ADR gained an
amendment when `refusal` was added to that payload (*"Amendment, 2026-08-24:
`simulation/status-counts` also carries the last refusal"*), and a second
optional sibling was added by #312 with no matching amendment and no mention of
the word anywhere in the document. Two sentences in the body then described the
payload as the counts plus `tick`, `schemaVersion` and a refusal; both are
corrected in place at this pass, and both now point here. What is *not* an
editor's call is whether the ADR should carry a third amendment stating the
`zoning` shape and its compatibility argument the way the refusal one does, or
whether the corrected sentences are enough -- that is the owner's, and it is the
only thing this entry asks for. **It is not a wrong status and not a code gap:**
`zoningNoticeSchema` is declared, `.strict()`, optional, produced by the worker
and decoded on the main thread, with `tests/unit/ui-simulation-zoning.test.ts`
driving the notice through a real `simulation/status-counts` message; the
document is what is
behind the code, in the same way and for the same reason that
`src/simulation/protocol/transferables.ts`'s comment said "Eleven integers" for
two days after the twelfth landed (#444).

---

## 6. Stale status references: cleared, and now asserted

Flipping a status does not update every document that *reports* that status.
Each approval was scoped to the status lines and their index rows, so the
references this section used to list were deliberately left alone and recorded
here as known rather than missed. **They have since been corrected, in one
change of their own, and the class is now under a test.** What is left below is
the account of what moved, what could not move and why, and what the test can
and cannot see — because the residue is the part a future reader needs.

### The gate

`tests/foundation/adr-status-reference-contract.test.ts` reads every ADR's own
status statement and every sentence in `src/`, `tests/`, `docs/`, `README.md`
and `.github/` that predicates a status of an ADR, and fails when the two
disagree. It is the layer between the index check and this file:
`adr-numbering-contract.test.ts` compares a document to a table, this file
compares a decision to an implementation, and the new test compares a *sentence*
to a document.

Three properties it was built to have, stated here because a `toEqual([])`
gate that lacks them reads exactly like compliance:

- **Non-vacuous.** It asserts floors — more than 300 corpus files walked
  (`tests/foundation/adr-status-reference-contract.test.ts:427`) and more than 15
  status claims actually parsed and compared (`:431`; 33 on the tree that landed
  it), plus more than 20 ADRs found on disk (`:405`) — so a scanner that read
  nothing, or a claim pattern that stopped matching prose, fails instead of
  passing quietly. All three floors re-read at this commit. Its positive control
  runs the checker against text whose verdict is known, in both directions.
- **It bites.** Proved by reintroducing `"ADR 0017 is still Proposed"` into
  `src/ui/hud/messages.ts` and watching it fail with that file and that
  sentence named.
- **It does not fire on history.** Past tense is not matched, so *"while this
  ADR was `Proposed` it said…"* is left alone; an ADR's `Amendment` sections are
  skipped, which is what lets ADR 0022's *Status of this amendment* keep its
  `**Proposed.**`; and `docs/research/` is exempt for the reason that directory's
  README gives.

**What it cannot catch**, and this is the honest boundary rather than a
formality: a claim that names no ADR. `src/simulation/economy/income.ts` said *"a
ninth `Proposed` document in `docs/adr/`"* — false, and about the *count* rather
than about any one ADR, with no number in it for a subject. The same goes for a
`##` heading with no subject (ADR 0012's `## Decision (proposed)`) and for a
table cell whose ADR is cited only in the sentence introducing the table. All
three shapes existed in this corpus and all three were corrected by hand.

**A fourth blind spot, found since and not previously recorded here: it cannot
tell an assertion from a denial.** #356 hit it while accepting ADR 0029 — the
gate correctly caught two sentences still calling 0029 `Proposed`, and then
caught a third that was *true*, *"No row is `Proposed`."* It matches on the
status word rather than parsing the claim, so a sentence saying that **no** ADR
holds a status trips it exactly as a false one would. The wording was changed to
"every row is accepted", which is true and leaves the gate meaningful, and the
constraint is written down where it binds — `docs/adr/README.md`, the note
opening *"A note on how this paragraph is worded, because it matters to a
test"*, `:103-110` at `bb3a01e` — rather than left for the next person to
rediscover by failing the suite. (**This entry cited `:44-52`, which at
`bb3a01e` is a paragraph about prose tallies rotting beside a table** — a
plausible neighbour on the same subject, which is the worse kind of drift, so
the quotation is the citation from here on.) Teaching the scanner to read negation is the
alternative and is not obviously worth it. **It belongs in this list**, because
it is the same class as the three above: a claim the scanner's shape cannot
evaluate, which a reader has to hold instead.

The test exempts itself, because its header and its positive control quote false
claims on purpose — **and it exempts this file**, for the same reason and by
name (`tests/foundation/adr-status-reference-contract.test.ts:147-150`, alongside
`docs/research/`). Worth stating rather than leaving implicit: every quoted
sentence in §6 below is a false claim reproduced on purpose, so no gate is
reading them and nothing but a human re-reading this file keeps them honest.

### Corrected, with what each said and what is true

**Comments calling an Accepted ADR proposed.** Older than the thirteen flips and
never recorded before this round:

- `src/ui/hud/messages.ts` — *"ADR 0017 is still Proposed"*. 0017 has been
  Accepted since `a786b64`, with all three answers. Now says it is Accepted and
  names no currency either, which is what the label rests on.
- `src/ui/hud/projection.ts` — *"ADR 0017 is Proposed."* Same correction; the
  chip still prints minor units, for the same reason.
- `src/content/procurement-catalog.ts` — ADR 0017 answers #96's three questions
  *"**as recommendations pending approval**"*, and *"ADR 0017's recommendation on
  the buffer question"*, and *"When the owner takes ADR 0017's answers, this
  table is where a real economy starts"*. They are its decisions 6, 7 and 8 and
  they are accepted. The placeholder argument is unaffected and it needed the
  better reason it now carries: **decision 5** reserves prices to issue #29, so
  every figure here is provisional with nothing left to approve.
- `tests/unit/entity-generation-wrap.test.ts` — *"ADR 0026 states all three at
  Proposed"*. 0026 is Accepted as the framing and the tripwire, and leaves all
  three open, which is what the file needed to say. The tests are untouched.
  **Corrected, 2026-08-29 (#169, #505): the comment this bullet describes no
  longer exists, and the fact it stated no longer holds.** #505 rewrote the
  file "from `DEFECT`-pinning to fixed-behaviour pinning" — its own commit's
  words — replacing the paragraph this bullet quoted with one headed *"The
  decision taken (#169, ADR 0026 question 1, option A)"* (`:31`), which cites
  no `Proposed` status at all. And the fact side is falsified independently of
  the wording: ADR 0026's three questions are no longer all open. Question 2
  (recycling) was answered as option C before this anchor; question 1
  (exhaustion) is answered now, as option A, dated in ADR 0026's own
  *"Amendment, 2026-08-29 (#169)"*; only question 3 (`submitIntake` re-intake)
  remains, which is exactly what the next bullet already says about
  `prisoners-intake-system.test.ts`. So this bullet's subject — a stale
  comment calling an Accepted ADR `Proposed` — is retired rather than merely
  re-read: the class of defect it recorded is gone from this file, not moved.
- `tests/unit/prisoners-intake-system.test.ts` — *"it is stated at Proposed
  in ADR 0026 rather than settled here"*, on the re-intake case. Now names it as
  0026's question 3, left open by an Accepted ADR: *"it is ADR 0026's question 3
  — left open by that ADR, which is Accepted as the framing and not as an answer
  — rather than settled here"*, `:529` at `bb3a01e`. (Cited as `:465`, then
  `:494`, and now `:529`; #373 added a case pinning the determinism half of the
  same question and #458's discharge work moved it again. **Three anchors, three
  numbers, one unchanged sentence** — so the quotation above is the citation and
  the number is the aid.)
- `src/simulation/economy/income.ts` — *"a ninth `Proposed` document in
  `docs/adr/`"*. **This entry then said "there is exactly one, and it is 0029",
  which was falsified when 0029 was accepted on 2026-08-26 (#356); the
  replacement said the one `Proposed` document was ADR 0031, and that was
  falsified the same day at `e560656` (#389) when 0031 was accepted too. At the
  `54418b6` anchor no ADR in the directory was `Proposed`.**

  **FALSIFIED at `bb3a01e`, and by nine documents at once.** `docs/adr/` now holds
  nine `Proposed` ADRs — 0042, 0043, 0046, 0047, 0048, 0049, 0050, 0051 and 0052 —
  every one of them arrived in this delta. Derived by reading the first non-blank
  line under each document's `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads. **So the same sentence has now
  rotted four times in this file: nine, then one (0029), then one (0031), then
  none, and now nine again** — and the fourth correction was written eleven
  releases before the count went back to where the original comment had it. That
  is the strongest case this file has for the rule below it: *a count of documents
  in a status is something the index already computes, so prose should not restate
  it*. This paragraph restates it once more only because saying "the count moved
  again" without the number would be useless, and the number is dated and derived
  rather than remembered. The live consequence is in §5's first bullet: nine
  outstanding decisions, no §2 rows.

  **FALSIFIED a third time at `07add3e`, in the same direction again, nine
  releases later: it is seventeen.** 0059, 0061, 0062 and 0063 joined the
  thirteen, derived the same way — the first non-blank line under each
  document's `## Status` heading, which is what
  `adr-status-reference-contract.test.ts` reads, cross-checked against
  `docs/adr/README.md` row by row. **So the count has now been nine, one, one,
  none, nine, thirteen and seventeen — seven readings of one sentence in one
  file, across five anchors.** The live consequence in §5's first bullet has
  moved with it: seventeen outstanding decisions, **two** §2 rows. Each
  restatement was correct on the day it was made, which is the argument rather
  than an excuse for making a seventh: *a count of documents in a status is
  something the index already computes, so prose should not restate it*.
  `income.ts` itself still carries no count at all, re-read at this anchor on a
  file `git diff` reports as untouched — **which is the point**: the sentence
  that keeps rotting is this file's own record of the correction, not the
  correction.

  **FALSIFIED an eighth time at `01974e5`, in the same direction, eleven
  releases later: it is twenty-one.** 0064, 0065, 0066 and 0067 joined the
  seventeen, derived the same way. **So the count has now been nine, one, one,
  none, nine, thirteen, seventeen and twenty-one — eight readings of one
  sentence in one file, across six anchors.** The live consequence in §5's
  first bullet has moved with it: twenty-one outstanding decisions, still
  **two** §2 rows. `income.ts` gained 240 lines in this window — #488's needs-
  grant work, the only commit touching this file in the window to this anchor
  — which makes this the first of the eight readings where
  the file itself changed rather than being re-read on an untouched tree, and
  it **still carries no count**, re-verified by grep rather than assumed. That
  is the strongest confirmation yet of the rule this bullet exists to argue
  for: a count of documents in a status is something the index already
  computes, so prose should not restate it — and a file that changed
  substantially and still restates nothing cannot be accused of having simply
  not been touched.

  **FALSIFIED a ninth time at this anchor, in the same direction, seven
  releases later: it is twenty-two.** 0068 joined the twenty-one. **So the
  count has now been nine, one, one, none, nine, thirteen, seventeen,
  twenty-one and twenty-two — nine readings of one sentence in one file,
  across seven anchors.** The live consequence in §5's first bullet has moved
  with it: twenty-two outstanding decisions, still **two** §2 rows.
  `income.ts` is untouched in this window — not among the sixty-one files the
  diff reports — so this reading is on the same tree as the previous one, and
  it still carries no count, re-verified by grep rather than assumed.

  **FALSIFIED a tenth time, at `cfab558`, in the same direction, thirty-one
  releases later: it is twenty-seven.** 0069, 0070, 0071, 0073 and 0074 joined
  the twenty-two, derived the same way. **So the count has now been nine, one,
  one, none, nine, thirteen, seventeen, twenty-one, twenty-two and
  twenty-seven — ten readings of one sentence in one file, across eight
  anchors.** The live consequence in §5's first bullet has moved with it:
  twenty-seven outstanding decisions and **three** §2 rows, the first time
  that second number has moved since `07add3e`. `income.ts` is untouched in
  this window too — not among the fifty-three files the diff reports — and it
  still carries no count, re-grepped rather than assumed.

  **FALSIFIED an eleventh time, at `53e1405`, in the same direction, seven
  releases later: it is thirty.** 0075, 0076 and 0077 joined the twenty-seven,
  derived the same way. **So the count has now been nine, one, one, none,
  nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven and thirty —
  eleven readings of one sentence in one file, across nine anchors.** The live
  consequence in §5's first bullet has moved with it: thirty outstanding
  decisions and still **three** §2 rows. `income.ts` is untouched in this
  window too — not among the fifty-eight files the diff reports — and it still
  carries no count, re-grepped rather than assumed (`grep -n "Proposed"
  src/simulation/economy/income.ts` returns nothing at `53e1405`).

  **FALSIFIED a twelfth time, at `0637ab1`, and for the first time DOWNWARD:
  it is twenty-nine.** 0075 and 0076 left the set by being accepted at
  `f0b98aa`/#606 and 0078 joined at `19482be`/#612, derived the same way. **So
  the count has now been nine, one, one, none, nine, thirteen, seventeen,
  twenty-one, twenty-two, twenty-seven, thirty and twenty-nine — twelve
  readings of one sentence in one file, across ten anchors, and eleven of the
  twelve moved it up or held it.** The live consequence in §5's first bullet
  has moved with it, in both terms and in opposite directions for the first
  time: twenty-nine outstanding decisions and **four** §2 rows.

  **FALSIFIED a thirteenth time, at `898a16a`, ten releases later: it is
  thirty.** 0079 joined the twenty-nine at `9a25700`/#659 and nothing left,
  derived the same way. **So the count has now been nine, one, one, none,
  nine, thirteen, seventeen, twenty-one, twenty-two, twenty-seven, thirty,
  twenty-nine and thirty — thirteen readings of one sentence in one file,
  across eleven anchors, and the second time the run has returned to a value
  it already held: `nine` recurred at the fifth reading, after `one`, `one`
  and `none`.** The live consequence in §5's first bullet has
  moved with it in one term only: thirty outstanding decisions and still
  **four** §2 rows.

  **`income.ts` did NOT change in this window, which ends a run of three
  anchors at which it had**, so the absence is inherited rather than
  re-established: it is not among the 45 files the diff reports, and `grep -c
  "Proposed" src/simulation/economy/income.ts` returns **0** at `898a16a`,
  re-grepped rather than assumed but against a file nothing touched. That is
  the weaker of the two results and is reported as such, for the same reason
  the `0637ab1` reading gave for the stronger one: a grep over an edited file
  rests on nothing, and a grep over an untouched one rests on the file not
  having moved.

  **`income.ts` DID change in this window, which breaks a run of four anchors
  at which it had not** — it is among the 89 files the diff reports, edited by
  #599's coverage-provisions-safety work. So the absence is re-established
  rather than inherited: `grep -c "Proposed" src/simulation/economy/income.ts`
  returns **0** at `0637ab1`, run against the edited file. That matters more
  than the four inherited readings before it, because those rested on the file
  not having moved and this one does not rest on anything.

  **And this reading is the first in the run that was not also a lag**, which
  is worth one sentence because the two paragraphs below are entirely about
  the lag. The tenth reading was moved into this bullet by the `cfab558` pass
  in the same commit that moved the header's copy; this eleventh one found the
  two agreeing and moved them together again. Two consecutive anchors at which
  the three `Proposed` counts and the header agree is not yet a habit, and the
  mechanism that broke them — a pass asserting a sweep it had not run — is not
  prevented by anything mechanical, only by opening the three places. They
  were opened.

  **And the ninth reading stood here for three anchors after it stopped being
  true, which is the sharpest thing this bullet has ever had to say about its
  own subject.** *"It is twenty-two"* was correct at `4ace2da` (v0.0.177) and
  went false when 0069 landed at **#541**; three re-anchors passed, each
  moving the header's copy of the number, and none moved this one. The
  `85c1c29` pass went further and asserted, in the derivation subsection near
  the top of this file, that this bullet *"now enumerate[s] **twenty-three**
  `Proposed` documents"* — a claim about a sentence three thousand lines away
  that was false on the tree it was written against, and that no diff of any
  window could have raised, because nothing in this bullet had changed. **This
  is the argument this bullet exists to make, arriving from inside the
  bullet:** a count of documents in a status is something the index already
  computes, and prose that restates it goes stale in a place nobody is
  looking. The reading is left standing above rather than overwritten.

  **Found at this anchor (`4ace2da`), and it is the same class of defect as
  the title/§2 split recorded near the top of this file: this bullet had been
  contradicting itself, not diffably, since at least `01974e5`.** Immediately
  after the "ninth time… twenty-two" paragraph above, the text continued,
  unheaded, as the tail of a **sixth-time** reading it had already
  superseded: *"it is thirteen[…] So the count has now been nine, one, one,
  none, nine and thirteen — six readings of one sentence in one file[…]
  thirteen outstanding decisions, **one** §2 row."* Three later insertions —
  seventeen (`07add3e`), twenty-one (`01974e5`), twenty-two (`33510df`) — had
  each prepended a new paragraph above it without removing the one each
  superseded, so the bullet stated two different reading-counts (six and
  nine) and two different tallies (thirteen and twenty-two) for the same
  sentence in the same breath. Found by the check this file's own header
  prescribes — reading its paragraphs against each other, which no diff of
  any window would have raised, because no line in the superseded tail had
  changed since it was written. **Corrected by removing the superseded tail
  rather than by prepending a tenth paragraph**, since the count it restated
  is already given, correctly, above.

  One fact in the removed tail is not recorded anywhere else in this file and
  is kept: ADR 0031's acceptance (§1, `e560656`) dropped two stale line
  citations this entry had carried — `docs/adr/README.md:100` as "the single
  `Proposed` row" and `0031-build-queue-cancellation-surface.md:5` as its
  status line — rather than re-pointing them, because both sentences they had
  supported were gone by then. **The other half of this entry was already
  fixed before this change**: the *"ADR 0023 open, ADR 0028 proposed"*
  parenthesis is no longer in the file, which ADR 0028's phase 1 rewrote along
  with the measurement around it.
- `src/simulation/rooms/zoning.ts` — ADR 0012 *"is still `Proposed`"*, plus
  *"ADR 0012 has to be settled first"* in the move-or-resize clause. 0012 is
  Accepted, so what a future resize would force is its **taxonomy being applied
  to this id**, not the ADR being settled. The reasoning is unaffected: a
  room-instance id still needs neither category answer. (Re-read at `bb3a01e`:
  the corrected comment is at `:116-117` and the move-or-resize clause at `:125`;
  the second-pass list below cited `:106` and `:115`, and #447's enclosure
  refusal moved both. **ADR 0012's own Decision has since been corrected too**,
  by `e1d9f5e` in this delta, which stopped it denying the determinism fix its
  Status recorded — so the two halves of that ADR no longer contradict each
  other, which is what this bullet's sibling below reserved.)

**The single-ADR stale statuses this section used to list:**

- `docs/DEPLOYMENT.md`, the paragraph beginning *"The reasoning that put
  migrations in their own workflow"* — ADR 0016 *"is **Proposed, not
  accepted**"*. Now records it as Accepted, retroactively for the §1 mechanism,
  and says what the acceptance makes binding: §2, with nothing enforcing it
  mechanically. That is §4 of this file, and the deployment document is where a
  reader meets it. (Cited as `:163`, corrected to `:164`, `:168` at `bb3a01e`,
  and **`:221` at `c00b641`** after #474 pushed the document down 54 lines.
  **Fourth anchor, fourth number, and the sentence has still not changed a
  word** — so it is cited by its opening words, which is recommendation 1 at
  the foot of this section applied to the citation that has cost the most, and
  which is why this anchor required no correction here at all: the number above
  is a record of four readings, not the citation.)
- `docs/adr/0016-migration-delivery-mechanism.md:173` — quoted that sentence
  verbatim, so the two moved together, as this section said they would have to.
- `docs/adr/0012-derived-identifier-reproducibility.md` — the self-contradiction,
  and the most visible entry this section ever held. `## Decision (proposed)`,
  *"which is why this ADR is proposed rather than applied"* and Consequences
  clause (a) *"The status above stays Proposed"* all sat under a status line
  reading `Accepted`. Clause (a) now records that the category-2 reading **was**
  taken; clause (b) — `chunkTopologies` is never evicted — was true when this
  entry was written and #324 has since falsified it, so the clause now records
  the eviction as closed and reserves only the world-streaming ruling. A fourth
  sentence went with them, not previously
  listed: the path-request-id clause said its question was *"left open for
  whoever accepts this ADR"*, and the acceptance did not take it either.
- `docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:151` — the Status
  table row and the §4 heading both marked 4 MiB `PROPOSED`; `:19-21` asked a
  reviewer for *three* numbers. (The heading citation read `:150` here and `:150`
  is a blank line; the heading is `### 4. Per-save payload bound — **ACCEPTED:
  4 MiB (4,194,304 bytes)**`.) §4 is Accepted, the heading and the row say so,
  and the ask is now two — 20 revisions (§6) and 256 MiB (§5). One more in the
  same document, not previously listed: §4's headroom bullet asked that *"the
  approval asked for in the Status table above should be given or withheld
  against these figures"*, which is a request that has been answered; it now
  says these are the figures §4's bound stands on.
- `docs/adr/0015-actor-identity-allocation.md:153-156` — *"Accepting 0015
  without 0012 leaves the taxonomy it argues in still Proposed"*, describing a
  case that cannot arise. Both were accepted in the same commit, so item 1 of
  *What this asks a human to accept* is discharged and says so: *"**Both were
  accepted in the same commit**, so the taxonomy this ADR argues in is settled
  and the case this item guarded against — 0015 accepted while 0012 was not —
  cannot arise."* (This entry cited `:145-146`,
  which is now a passage about the name pool; the discharge is eight lines
  further down.)
- `README.md:59` — ADR-0014's *"`Status` is `Proposed` … the decision has not
  been approved"*. Now Accepted, and the pipeline the repository implements is
  the approved one rather than a proposal it happens to match.
- `docs/CLOUD_SAVE.md` (*"the ADR is `Proposed`, not…"*) and its capacity table's
  4 MiB row. The prose states the split — *"partly accepted and partly still
  proposed -- **that ADR is `Accepted` for its §§1-4 and its §§5-6 remain
  `Proposed`**"* — and the row reads *"**Accepted** as ADR 0013 §4. Implemented,
  in one function."* **The two rows below it were true and stayed true** —
  *"20 retained revisions per prison | ADR 0013 §6, **still Proposed. Not
  implemented** — needs a pruner"* and *"256 MiB of payload per account | ADR 0013
  §5, **still Proposed. Not implemented**"* — and they gained their ADR section
  numbers so that a reader (and the gate) can tell a §-scoped
  `Proposed` from a claim about the whole document. Two further mentions,
  *"unbounded within a bounded slot (ADR 0013 §5–§6)"* and *"see ADR 0013
  §5–§7"*, were already §-scoped and are untouched.

  **All five numbers have now drifted twice, in two consecutive anchors, and
  nothing else in this file has done that.** They read `:1184`, `:1200`,
  `:1201-1202`, `:1239`, `:1250` at `cddaebb`; were corrected to `:1268-1269`,
  `:1285`, `:1286-1287`, `:1324`, `:1336` at `83c3121` after that file gained 85
  lines (#350, #353); and are corrected again here after it gained **361 more**
  (#368 and #382's cloud-save work). The sentences have never changed. **The
  numbers are the wrong citation for this document** — it is the fastest-growing
  file in the dependency set, and the next re-read should expect to correct these
  five again unless somebody re-cites them by heading or quoted phrase, which is
  the remedy this file keeps recommending elsewhere and has not applied here.
- `docs/TRUSTED_SERVICES.md` — *"the 4 MiB per-save figure is proposed,
  not accepted"*, and *"ADR 0013 is in `Proposed` status"*. Both corrected — the
  bullet now reads *"**The 4 MiB per-save figure is accepted** — ADR 0013 §4"*
  (`:604` at `bb3a01e`) — and the two numbers that genuinely remain open are
  named as §§5-6 (`:607`) and the churn lever as §7 (`:610`). This entry cited
  `:577`, which was a bullet about `public.create_prison()`, and the citation was
  wrong when it was written rather than overtaken; it then read `:592-598`, which
  was exact at `54418b6` and is twelve lines short at `bb3a01e`.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
  Now `Accepted`, and the comment says the constraint is binding with nothing
  enforcing it mechanically, which is the sentence that made the flip worth
  landing here at all.

**Which of the citations above survived, since a list of corrections is only
worth reading if it says which parts of itself were checked.** Two passes are
recorded, because they were checked differently and a reader should know which.

**At `83c3121`, a full re-read of every sentence in this subsection.** Nine
citations had moved and were corrected then: 0013's §4 heading, 0015's discharge,
five in `docs/CLOUD_SAVE.md`, one in `docs/TRUSTED_SERVICES.md`, and one factual
claim — which `Proposed` ADR the `income.ts` count referred to.

**At `dbe271f`, the delta only**, by the method the header describes: intersect
`git diff --name-only 83c3121..dbe271f` with the dependency set, then read the
intersection. Of the files this subsection cites, **three changed** —
`docs/CLOUD_SAVE.md`, `tests/unit/prisoners-intake-system.test.ts` and
`tests/unit/entity-generation-wrap.test.ts` — and two of them moved a citation,
both corrected above. The other seven code and test comments are in files
`git diff` reports as untouched, so they hold as corrected without re-reading:
`messages.ts:28`, `projection.ts:211`, `procurement-catalog.ts:13` and `:23`,
`entity-generation-wrap.test.ts:37` (verified anyway, since the file changed),
`income.ts` and `zoning.ts:106`/`:115`. Six `file:line` citations are in
untouched files and still land where they say: `docs/DEPLOYMENT.md:163`,
`docs/adr/0016-migration-delivery-mechanism.md:173`,
`docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:19-21`, `README.md:59`,
and `.github/workflows/migrate-database.yml:20`. **`docs/TRUSTED_SERVICES.md`
gained six lines and its `:592-598` citation was re-read rather than assumed —
it still lands**, which is the one case where "the file changed" and "the
citation moved" came apart.

**At `54418b6` two of those six are no longer in untouched files, and they came
apart in opposite directions** — which is worth recording because the sentence
above rests each of the six on the file having not changed, not on anyone having
looked. #423 edited both. `docs/DEPLOYMENT.md:163` **moved to `:164`**: it now
lands on the blank line above the paragraph it names. `.github/workflows/migrate-database.yml:20`
**still lands**, re-read rather than assumed, as `docs/TRUSTED_SERVICES.md` was.
The other four — `0016:173`, `0013:15` and `:19-21`, `README.md:59` — are still
in files `git diff 8d29aa6..HEAD` reports as untouched, and were spot-checked
anyway: all four land.

That is the whole cost of the second pass, and the ratio across both is the
argument for the practice this file keeps recommending and keeps failing to
follow: **a `file:line` into a document under active edit is the least durable
citation here, and a quoted sentence is the most.** Across both passes this
subsection needed fifteen corrections — eight line citations at `83c3121`, six
more at `dbe271f`, and exactly **one** correction of substance, the ADR the
`income.ts` count referred to. **Fourteen of fifteen were numbers**, and not one
of the sentences those numbers point at has changed.

**The third pass, at `54418b6`, made it twenty-three across three: twenty-one
line citations and two corrections of substance.** Seven numbers moved here — the
command union's, three of the four `transition()` sites, and three in
`docs/DEPLOYMENT.md` — and again not one of the sentences behind them had
changed. The count is still thirteen, the transitions are still four, `'ready'`
is still unreachable.

**The fourth pass, at `bb3a01e`, stopped counting and started rewriting, so the
running total above is discontinued rather than extended.** A retired citation is
not a corrected one and the two cannot be added together, so a fourth number in
that series would compare unlike things — which is the same defect the series was
recording. What this pass did instead, stated so it can be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically before this
  commit was written** — extract each backticked `path:N` span, open the file,
  print the line. That is the whole check, it takes seconds, and **it caught
  three errors this pass had just introduced**: `src/main.ts:86` written as an
  import it is not, `docs/adr/README.md:44-52` for a constraint that has moved to
  `:103-110`, and `docs/adr/README.md:97` for an index row now at `:158`. A
  correction is exactly as liable to be wrong as the claim it corrects, and this
  is the third consecutive pass to prove it inside its own text.
- **Fourteen prose citations were retired rather than renumbered**, replaced by a
  section title and a quoted sentence: three into `docs/DEPLOYMENT.md` (the
  71-second window, #87, and the ADR 0016 paragraph, which has now been `:163`,
  `:164` and `:168` across three anchors without a word changing), the two in
  §5's ADR 0002 entry, five in `docs/CLOUD_SAVE.md`, the
  `docs/TRUSTED_SERVICES.md` range, `docs/HUD_PROJECTIONS.md`'s gap 13 (`:553`,
  `:639`, `:754` — three anchors, one sentence) and the two
  `docs/adr/README.md` anchors above.
- **Every code anchor was re-numbered against `bb3a01e`**, because grep checks a
  code anchor and `src/` moves for reasons that change meaning: four
  `transition()` sites, two handshake receivers, six in `zoning.ts` across §5 and
  §6, two in `intake-system.ts`, two in `prisoners-intake-system.test.ts`, four
  in `hud.ts`, one in `main.ts`, two in `unconsumed-command-contract.test.ts`,
  and `ui-hud-messages.test.ts:218-224`. Enumerated rather than totalled, for the
  reason this whole subsection exists.
- **Two of them were wrong at `54418b6`, before this delta opened**: the
  `AWAITING_PRODUCER` declaration (`:173-203` for a thing at `:204`) and
  `arm-room-tool` (`:486-491` for a thing at `:536`). Both are in files
  `git diff 54418b6..bb3a01e` reports as **untouched**, so the delta method could
  not have raised either. Only opening them did, and that is the argument for
  spot-reading the untouched half rather than resting on the diff — which the
  third pass had already learned once and which this makes twice.
- **Three claims of substance were withdrawn and four were discharged
  elsewhere**, all named in §§3-5 with what they used to say. The withdrawals are
  §5's *"the telemetry layer is inert"*, §6's *"no ADR in the directory is
  `Proposed`"* and §5's *"exactly one file and for exactly one reason"* about
  object ids. The discharges are ADR 0025's 3.9px withdrawal, ADR 0022's own
  count-and-anchor correction, ADR 0026's question 2, and ADR 0012's Decision no
  longer denying its Status — **four entries closed by the documents they were
  about, all inside one pull request**, which is what §5 is supposed to produce
  and had not before.

**The sixth pass, at `07add3e`, is the first taken while the gate was green, and
it is the reverse of the fifth in every respect that matters.** Stated so it can
be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically again** — the
  same extract-resolve-open-print check, over sixty rooted anchors plus the bare
  `:N` continuations enumerated above — and **nine moved**, all of them code:
  `state-machine.ts`'s `WorkerState` union (`:33-39` → `:34-40`), its four
  `transition()` sites (`:664`, `:799`, `:834`, `:1110` → `:671`, `:860`,
  `:895`, `:1171`) and its two handshake receivers (`:681`, `:711` → `:697`,
  `:727`); `intake-system.ts:403` and `:409` → `:442` and `:448`;
  `release.ts:156` → `:194`; `save-schema.ts:1164` → `:1182`; and ADR 0022's
  *"÷ 12.2 is 23.9"* line `:582` → `:588`. Every other anchor lands, including
  every one into a file the diff reports as untouched.
- **Every count in §§3-6 was re-derived and exactly one moved.** Unmoved:
  `simulationCommandSchema` still discriminates **thirteen**, `HudIntent` still
  declares **eighteen**, `protocol/handshake` still returns **nine** hits split
  4/2/3, the `.css` files under `src/ui/` are still **four**, the object ids
  outside `src/content/` are still **39** in **two** files (19 and 20), the
  `Amendment`/`Addendum` sections are still **27 across 16 ADRs**,
  `supabase/migrations/` still holds **twenty-three**, `src/services/telemetry/`
  still holds **fifteen**, `room-catalog.ts` still authors **eighteen**
  definitions with the string `capacity` occurring **zero** times in it, and
  `AWAITING_PRODUCER` is still empty. Moved: the `Proposed` documents, thirteen
  to **seventeen**, in the three places that state it. §2's entries also went
  three to four to **five**, but that is the sweep's finding rather than a
  count re-derived from disk.
- **What the pass found that no diff could have.** §2's heading has said *"Five
  entries"* since #485 while the header's opening paragraph and §5's preamble
  both still said four — **the identical split #467 caused nine releases
  earlier, in the identical two places**, which turns the header's prediction
  from a stated risk into a measured regularity. Nothing else in this pass came
  from the "already false when the window opened" class, which breaks a run of
  three consecutive anchors that each found one.
- **One claim withdrawn, one handover discharged, both by #483.** §5's
  `environment-art.ts` bullet said the documentation-links gate does not read
  `src/` comments and has no allowlist; both are now false, the dead
  `environment-art-coverage.test.ts` name it handed over is corrected in the
  source, and the decision it filed as *"a decision, not an edit"* was taken.
- **The fifth pass's closing sentence did not survive.** It read *"this is the
  first pass at which the counts, not the numbers, were the damage"*. At this
  anchor the numbers are the damage again and the counts held. **Two adjacent
  passes, opposite results, same method** — so neither is the general rule, and
  the durable statement is recommendation 1 itself: a code anchor is checked by
  grep in one command and is worth carrying; a prose count is checked by nobody
  and is worth deriving instead of restating.
- **What this pass is blind to, stated because a list of findings reads like
  coverage.** The delta half of it read fourteen files out of 122 and cannot see
  a claim that was already false when the window opened. The sweep half reads
  four sentences. The derivation half checks that the set names what §§3-6 cite,
  not that what §§3-6 say about them is true. **Nothing here read §§1-2, and
  nothing here re-measured a single behavioural claim** — every measurement in
  §5 is carried forward on the strength of its inputs still existing, which is
  what §5's ADR 0027 entry says about itself in terms.

**The fifth pass, at `c00b641`, was the first at which the rewrite paid and the
numbers were not the damage.** Stated so it can be checked:

- **Every rooted `file:line` in §§3-6 was re-derived mechanically again** — the
  same extract-open-print check — and **exactly three moved**:
  `docs/DEPLOYMENT.md`'s six-row deployment table (`:145-152` → `:198-205`) and
  two anchors into `src/main.ts` (`:2494-2499` → `:2506-2511`, `:2494` →
  `:2506`). Everything else lands. That includes the four `transition()` sites
  in `state-machine.ts`, which had moved at *each* of the three previous
  anchors and are still `:664`, `:799`, `:834` and `:1110`; the two handshake
  receivers at `:681` and `:711`; `commands.ts:467`; `hud.ts:271`, `:404-409`,
  `:446`, `:537-542`, `:541` and `:555`; `zoning.ts:116-117`, `:125`, `:217`,
  `:255-256`, `:398`, `:556`, `:560-562` and `:567`; `intake-system.ts:403` and
  `:409`; `topology.ts:72` and `:99`; `release.ts:156`; `types.ts:168`;
  `session-controller.ts:9`; `save-schema.ts:1164`; `main.ts:82-84`, `:86`,
  `:102`, `:154-195` and `:180-183`;
  `prisoners-intake-system.test.ts:230` and `:529`;
  `entity-generation-wrap.test.ts:96`, `:124`, `:163`, `:178`, `:190` and
  `:204`; `unconsumed-command-contract.test.ts:204` and `:230`;
  `ui-hud-messages.test.ts:218-224`; `environment-art.test.ts:248` and `:256`;
  `adr-status-reference-contract.test.ts:147-150`, `:405`, `:427` and `:431`;
  `docs/adr/README.md:103-110` and `:158`; `docs/TRUSTED_SERVICES.md:604`,
  `:607` and `:610`; `docs/adr/0013-…md:15`, `:19-21` and `:151`;
  `docs/adr/0015-…md:153-156`; `docs/adr/0023-…md:196-203` and `:204-205`;
  `docs/adr/0025-…md:74-76`; `docs/adr/0027-…md:14-32` and `:81`;
  `docs/adr/0002-…md:31-42`; `README.md:59`; `wrangler.jsonc:12` and `:20`;
  `.github/workflows/migrate-database.yml:20`, `:34`, `:41` and `:65`; and the
  six anchors into `20260823100000_bound_free_tier_capacity.sql`.
- **Every count in §§3-6 was re-derived and two of them moved.** Unmoved:
  `simulationCommandSchema` still discriminates **thirteen**, `HudIntent` still
  declares **eighteen**, `protocol/handshake` still returns **nine** hits split
  4/2/3, the `.css` files under `src/ui/` are still **four**, the object ids
  outside `src/content/` are still **39** in **two** files (19 and 20), the
  `Amendment`/`Addendum` sections are still **27 across 16 ADRs**, and
  `supabase/migrations/` still holds **twenty-three**. Moved: the `Proposed`
  documents, nine to **thirteen**, and §2's entries, three to **four** in one of
  the two places that state it.
- **What the pass actually found was three self-contradictions and a stale set,
  not drift.** §5's preamble disagreed with §2's own heading about how many
  entries §2 holds; §5's *"That file now states 0038 as next free"* was false on
  the tree it was written against; and the dependency list called
  `services/telemetry/**` thirteen modules when it has been fifteen throughout.
  **None of the three is reachable by any diff**, and two of them are the
  header's *"already false when the window opened"* class, found for the third
  consecutive anchor. The one that is a genuine window falsification — §5's
  preamble — is also the one the header's four-place sweep exists to catch, and
  it was caught by that sweep and by nothing else.
- **Nothing was withdrawn as false in the way the previous four passes
  withdrew.** One clause was: §5's *"not one of them has a §2 row"*, and it went
  the other way — a rule this file records as abandoned was obeyed once, by
  #467.

**The two paragraphs above about the second and third passes are left as they
were, and two of their numbers no longer land.** `docs/DEPLOYMENT.md:163` is a
blank line at `bb3a01e` and `:164` is the row above the ADR 0016 paragraph. **At
`c00b641` both land somewhere else again** — `:163` is still blank and `:164` is
now a sentence about an ordering correction — which changes nothing: they are
records of what a past pass checked on a past tree, not live citations, and
rewriting them would destroy the record — the same exemption `§6`'s gate grants
past-tense status claims.

**So the diagnosis has been made five times and acted on once, and the once is
the fourth pass.** The evidence that it worked is in the fifth: three of the
four citations into `docs/DEPLOYMENT.md` — the fastest-moving document in the
set, which gained 54 more lines in this window — needed no repair, because they
are quotations. The one that broke is the one a quotation cannot express. The proposal below is what was acted on; it is left standing
because only its first item is done, and items 2 and 3 are still the owner's:

1. **Stop citing a bare `file:line` into a document under active edit.** Every
   correction in this subsection across three passes has been a number pointing
   at an unchanged sentence. A citation of the form *"`docs/DEPLOYMENT.md`, the
   paragraph beginning 'The reasoning that put migrations'"* survives every edit
   that does not change the sentence, which is all of them so far. Code citations
   are different and should stay `file:line`: they are checked by grep, not read
   by eye, and `src/` moves for reasons that do change meaning.
2. **This one is assertable, unlike the rest of this file.** A test can extract
   each quoted sentence from this document and require it to appear verbatim in
   the file named. That catches the drift that actually happens — a quote going
   stale — and it cannot be satisfied by moving a number without reading
   anything, which is the honest boundary
   `tests/foundation/adr-status-queue-anchor-contract.test.ts` names about
   itself.
3. **The cost is a one-off rewrite of the citations in §§3-6** and a rule that
   new entries quote rather than count lines. The benefit is that the delta pass
   this header describes stops spending most of its budget on numbers.

The separate structural change this file has also diagnosed and not made — one
file per entry in a directory, so two commits can add two entries without
touching each other — is a different problem (contention on a single 90 KB file)
with a different fix, and is not addressed by the above.

### Cannot be edited at all

- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql` —
  *"PROPOSED, PENDING HUMAN APPROVAL (ADR 0013)"* above the 4 MiB function that
  is now Accepted as §4, and the same framing twice more in the file's header
  (`:19`, `:25`). **Re-verified at this commit: all three are still there and
  were not touched.** Applied migrations are immutable, so this can only be
  corrected by a **new** migration superseding the function, or left as a
  historical artefact. Leaving it is the recommendation — it is a comment, not
  behaviour. The gate does not scan `supabase/`, deliberately: it could only
  ever report something nobody is allowed to fix.

### Deliberately left, and to stay left

- `docs/research/2026-08-25-economy-rate.md:443` and `:630` — call ADR 0023
  *"Proposed, not accepted"* and *"(Proposed …)"*. These are **dated research
  records** and the repository treats them as records: they were true on
  2026-08-25 when the memo was written, the memo says what it was measuring and
  when, and **editing a research record to match a later decision would make it
  stop being one.** `docs/research/README.md` states the rule. Both stay, and
  the gate exempts that directory for exactly this reason rather than by
  oversight.

ADR 0017 is the precedent for how the editable ones were cleared: when it was
accepted its body was rewritten to say what it had said *while* it was
`Proposed`, rather than leaving present-tense drafting language in place. 0022's
`## Status` section uses the narrower half of the same move, pointing forward at
the amendment it was accepted *as* instead of rewriting the passage that records
it.

---

## How to act on a future entry, mechanically

Each flip is **two lines, in one commit**, and the suite enforces the pairing:

1. the `Status` line in the ADR itself, and
2. that ADR's row in the `docs/adr/README.md` table.

`tests/foundation/adr-numbering-contract.test.ts` (*"reports each ADR with the
status that ADR itself holds"*) fails if you move one and not the other, so a
half-done flip cannot merge. **A third file now fails too, and it is the one
that will bite:** `tests/foundation/adr-status-reference-contract.test.ts` reads
every sentence in `src/`, `tests/`, `docs/`, `README.md` and `.github/` that
predicates a status of an ADR, so a flip whose *reporting* sentences are left
behind cannot merge either. §6 records what it sees and what it does not. The parser reads the **first keyword** of each side
— `Accepted`, `Proposed`, `Superseded`, `Deprecated` — and requires the two to
agree, which is why 0013's split status opens with `Accepted` on both sides and
qualifies only afterwards, and why 0022's, 0023's, 0026's and 0027's qualified
statuses all open with `Accepted` before saying what they are qualified by. It
reads the first non-blank line under the `## Status` **section heading** only, so
a `###` subsection cannot be mistaken for the document's status — which is what
lets 0022's *Status of this amendment* keep its historical `**Proposed.**` while
the document is Accepted.

Three things that are *not* mechanical, and all three were needed by the thirteen
flips above.

**A status section is not only a keyword.** 0022's said "nothing in `src/`
implements it yet", 0024's named a reversal that would leave ADR 0006 unamended,
0025's said "it is not accepted until they say so", and 0026's and 0027's asked a
reviewer to settle questions the approval does not settle. Each had to move with
the keyword or the file would have contradicted itself in its first paragraph.

**An ADR kept alive rather than superseded must be true.** 0023 was accepted
precisely so its fallback stays available, which is why the false framing around
that fallback could not be left standing.

**Accepting an ADR can oblige an edit elsewhere, and only the ADR knows.** 0024
named the implementation note in ADR 0006 that had to be deleted with it, and
that note was the only one of its kind in the corpus — the six retroactive
approvals and the three room flips dragged nothing. Nothing mechanical would have
found it: the obligation was written in prose, in the document being accepted,
which is the argument for reading an ADR's Follow-up section before flipping its
status rather than after.
