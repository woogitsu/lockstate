# How agents work in this repository

`AGENTS.md` is the operating contract: *what* an agent may and may not do. This
document is the operating *method*: how work is picked up, split across several
agents, verified and handed on. Where the two disagree, `AGENTS.md` wins.

Everything below was paid for by a failure in this repository. Nothing here is
taste.

---

## 1. Continuous work, not one-shot sessions

Lockstate is worked on in long sessions that outlive any single turn. A
scheduled routine fires hourly into the working session and tells it to continue
in order. That routine is the reason a session does not need to be told again
what it was doing.

**What the routine asks for, in order:**

1. **Collect what has landed.** Read finished agents' reports, *verify their
   load-bearing claims* rather than accepting them, merge their work, update the
   task list.
2. **Do not interrupt agents still running.** Work on something disjoint, or end
   the turn with one sentence of state.
3. **If nothing is in flight, take the next item.** Task list first, then the
   standing continuation issue, then audit findings.
4. **Check the gates every time:** CI on `main`, CI on open pull requests, and
   whether the `STATUS-QUEUE` anchor is approaching its staleness budget. A red
   `main` or a merge conflict is work *now*, not "waiting on review".
5. **Do not merge and do not open a pull request without the owner asking.**
6. **If there is genuinely nothing to do, say so in one sentence and stop.** Do
   not invent work, and do not restate findings already recorded.

**A routine is not a licence to act unattended on anything irreversible.** It
resumes work already in scope. Merging, deploying, deleting branches and
anything touching a hosted service remain the owner's call, exactly as
`AGENTS.md` says.

---

## 2. Working as several agents

Parallel agents work well here, and the failures have never come from the count.
They came from a shared tree and from shared ADR *numbers*.

**The rules that make it work:**

- **Every implementing agent gets its own git worktree as its first action.**
  Agents that share a checkout collide; agents in worktrees do not.
- **Serialise within a feature area, parallelise across unrelated ones.** Two
  agents in the persistence layer will conflict on more than files — they will
  conflict on the design. Two agents in `benchmarks/` and `.github/workflows/`
  will not.
- **Name each agent's surface, and the other agents' surfaces, explicitly in its
  brief.** An agent that does not know what is out of bounds will wander into it
  reasonably.
- **Investigating agents should be read-only on the repository** and write to
  their own scratchpad. Most decision work needs no repository write at all.
- **The scratchpad root is shared.** Give every agent its own subdirectory and
  tell it to scope its globs there or to the repository. A probe that globbed the
  scratchpad root once collected other agents' files and reported a file count
  that was not this repository's.
- **Assign ADR numbers centrally, after the drafts come back.** Two agents took
  `0034` within an hour, each having correctly enumerated the open pull requests
  first — the number is not reserved until it is in `docs/adr/README.md`. Have
  drafts carry a placeholder and pre-commit, in the ADR text, to being
  renumbered.
- **Never `git add -A`, and never leave a scratch file under `tests/`.** A stray
  probe has broken `pnpm verify` collection more than once.

---

## 3. The method every agent is held to

- **A green suite is not a guarded suite.** A test proves nothing until the
  production code has been mutated and that test watched going red. Run the new
  test against the unfixed code first; keep both outputs; report both.
- **Never write a fixture that supplies both sides of a comparison.** An expected
  value computed by the code under test holds for any implementation.
  `docs/TESTING.md` lists the forms this takes here.
- **Never report a result you did not obtain.** Run it, paste it. Open every
  `file:line` you cite. This project has paid hours for confident false findings,
  including audit reports citing line numbers for code nobody opened.
- **Where a document and the code disagree, the code is right and the document
  rotted** — and establish *when* it became false (`git log -S`,
  `git merge-base --is-ancestor`), not merely that it is. A claim can be false
  the day it is written.
- **Do not lower a pinned floor, weaken an assertion, raise a timeout to hide a
  race, or skip a test.** Extending a pinned list is fine; that is what adding a
  system looks like here.
- **Propose an ADR rather than deciding architecture inside implementation code,
  and never self-approve one** outside a recorded delegation from the owner.
- **Correcting the brief you were given is welcome and expected.** An agent
  reporting "already fixed, here are the numbers" is doing the job. If an
  assignment turns out to be done, wrong or overtaken, say so with numbers and
  stop rather than inventing work around it.
- **Fix the class, not the instance**, and report the sweep even where only one
  instance is fixed.
- **Look one module over before designing.** More than once the correct fix was
  already written elsewhere in this repository and simply not applied.
- **Name your weakest claim and say what would change your mind.**
  `docs/research/README.md` requires it, and it is why that directory is
  trustworthy.

---

## 4. Writing sentences that do not rot

This repository's most common defect is a document disagreeing with the code, so
a document about method should say how to write one that lasts.

- **A sentence asserting an absence or a count rots first** — "every", "none",
  "the only", "no X does Y", "there are seven". Adding the thing it denies never
  touches the sentence denying it. Prefer a sentence that states a subject over
  one that states a tally.
- **A correction is no more durable than the claim it corrected.** One paragraph
  in `docs/adr/README.md` was corrected and then broke again in the opposite
  direction one commit later. Mark both directions rather than overwriting.
- **A `file:line` into a document under active edit is the least durable
  citation here; a quoted sentence is the most.** Repeated passes over
  `STATUS-QUEUE.md` have found that nearly every correction needed was a line
  number pointing at a sentence that had not changed. Cite code by `file:line`,
  because grep checks it; cite prose by quoting it.
- **A delta pass is blind to a claim that was already false when its window
  opened**, and to a document contradicting itself. Reading a file's own
  headings against each other is a different check from any diff, it takes a
  minute, and it has caught what diffs could not.

---

## 5. Reporting

Deliver **a set of proposals the owner can say yes or no to**, not a count of
closed tickets. Each proposal carries: the decision in one sentence; what the
code does today, with `file:line`; the options with their real costs; the
recommendation and why; and what would change your mind.

Where a fix needs no decision, make it — with red-then-green evidence — and keep
it separate from the proposals.

State what you did **not** reach. A partial pass reported honestly is worth more
than a complete-sounding one, and an empty category backed by the numbers that
establish it is a real result.
