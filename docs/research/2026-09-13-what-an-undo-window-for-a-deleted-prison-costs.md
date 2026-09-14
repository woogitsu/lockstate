# What an undo window for a deleted prison would cost (#1142)

The owner ruled on 2026-09-13, from an option labelled *"Potwierdzenie plus
cofnięcie przez okno czasowe"*, that deleting a prison gets **a confirmation
and an undo window after it**. The confirmation shipped on
`agent/1142-delete-confirmation`. This record prices the other half, and
recommends against building it the way it is usually built.

Every claim below was opened. `file:line` cites code on the tree at
`aab912e3` (v0.0.599); prose is quoted. Nothing here was implemented — the
brief for the confirmation said not to author the undo mechanism
speculatively, and this is the reason that instruction was right.

## 1. What a deletion is today

`PrisonSaveRepository.delete(prisonId)`
(`src/persistence/local/repository.ts:467-476`) reads the slot, deletes every
generation in `generationIds`, then deletes the metadata record — all inside
one `readwrite` transaction, unconditionally. `SessionController.deletePrison`
(`src/persistence/session/session-controller.ts:1053`) wraps it with a hold on
the autosave schedule and closes the live session when the prison being
deleted is the one being played; since #582 `closeSession` also stops the
simulation host, so a confirmed deletion tears the worker down too.

Storage is IndexedDB, `lockstate-saves`, **`DATABASE_VERSION = 1`**, two object
stores: `prisons` keyed on `prisonId`, and `generations` under the out-of-line
key `` `${prisonId}:${generationId}` `` (`src/persistence/local/indexeddb-store.ts:3-6,
`:19-34`). The retention window is **three generations** by default
(`repository.ts:428`).

There is **no restore path**. `importSave` writes one generation into a slot
that already exists, through `writeGeneration`, which allocates a fresh
revision and applies retention (`repository.ts:1137`, `:529`); `create()`
stamps `createdAt` from the clock (`:448-459`). So rebuilding a deleted prison
out of the existing API would give it a new creation date and would walk its
generation window back in one at a time, evicting as it went. Restoring a
prison as it was needs a repository method nobody has written.

## 2. Option A — defer the deletion until the window expires

The panel would say *deleted*, start a timer, and call `delete()` when it
fires. Three costs, and the third is the one that decides it.

**It is a false sentence for the length of the window.** Constitution article
5 (*"Każde zdanie jest prawdziwe"*) and `AGENTS.md`'s fourth reservation both
forbid it directly: nothing has been deleted, and the panel says it has. The
brief that commissioned this named the same failure.

**A reload inside the window resurrects the prison.** Nothing schedules work
across a page load, so the timer dies with the tab and the record stays for
ever — the player is told a prison is gone and finds it on the list next time
they open the game. That is worse than the defect #1142 reports, because it is
silent.

**Hiding it needs a field on the slot record, and the slot schema is
`.strict()`.** `prisonSlotMetadataSchema`
(`src/persistence/local/slot-metadata-schema.ts:96`) rejects unknown keys, and
`PrisonSaveRepository.list()` refuses the **whole list** when one record fails
validation rather than skipping it (`repository.ts:433-440`, and the comment
above it says so). So a tombstone field written by a new build makes every
older build read the player's entire prison list as unreadable — they would
see `save.status.list-unreadable` and no prisons at all. `docs/PERSISTENCE.md`'s
*"Adding an optional field without a version bump"* rule does **not** cover
this: that rule is about the save **payload**, whose decoder tolerates absence,
and its first condition is *"absent means what the older build already did"* —
which is true of a payload field and false of a record an older build refuses
outright.

## 3. Option B — delete now, hold the copy in memory

Honest about what happened, and loses the undo silently on a reload — the
mirror of option A's defect, with the failure on the safer side: the player is
told the truth and then cannot act on it.

The copy is the slot record plus up to three generation payloads. Sizes
measured elsewhere in this repository: a minimal envelope is **1,566 bytes**
(`docs/PERSISTENCE.md`, the chunk-capacity table around `:320`), a
representative one is **~390 KB** canonical JSON (`:1785`), and issue #102
measured a **3.7 MB** save. So a held copy is between about 5 KB and 11 MB,
on the main thread, for the length of the window. That is affordable; it is
not the objection.

The objection is that it buys an undo the player cannot rely on, and a control
that works except when it does not is the shape article 3 warns about:
*"Cofanie może obiecywać zwrot tylko wtedy, gdy system rzeczywiście go
realizuje"* — undo may promise a return only where the system actually
delivers one. It would also need the restore method §1 says does not exist,
since putting three generations back is not three calls to `importSave`.

## 4. Option C — delete now, hold the copy in IndexedDB

The only option that survives a reload, and the only one that is a
**persistent format change**. A third object store (or a reserved key range in
`generations`) means `DATABASE_VERSION` 1 → 2 and an `onupgradeneeded` branch,
which is `AGENTS.md` architectural boundary 7 verbatim: *"Every persistent
format must have a version and migration strategy before release."* It also
needs decisions nothing in this repository has taken: how long a held copy
lives across sessions, who deletes it and when, what happens when the quota
that the deletion was made to free is still held by the copy, and whether a
held copy is counted in the cloud slot ladder once cloud save is wired.

**That is an ADR, not an implementation decision**, and `AGENTS.md` is explicit
that an agent proposes one rather than deciding architecture inside
implementation code.

## 5. Option D — the undo that needs no new storage

Export the prison before deleting it. `exportActive()` and the Export control
already serialise a save to a file the player keeps, and `importSave` already
reads one back (`src/ui/save-panel.ts`'s Export/Import pair, #287). A
confirmation that offers *"export this prison first"* beside *"delete
permanently"* gives a real, durable, reload-proof recovery path using two
mechanisms that ship today, with no format change, no timer and no sentence
that is false while it is displayed.

It is not what was ruled, and it is not free: it is the player's copy rather
than the game's, it is one press more, and it only covers the **current**
generation rather than the window. It is listed because it is the only option
in this document that could be built under the standing mandate without an ADR
first, and because the owner should be told it exists before being asked to
decide about the other three.

## 6. Recommendation

**Do not build the undo window in the tree that carries the confirmation.**
The confirmation closes #1142's reported defect on its own: a prison can no
longer be destroyed by one press, and the sentence a player reads before
confirming — *"Every saved copy of this prison goes, and this cannot be
undone."* — is true of this tree as it stands.

Of the four, **option C is the only one that keeps the promise the ruling
makes**, and it needs an ADR before a line of it is written, because it is a
persistent format change and a set of retention decisions. Options A and B
should be recorded as rejected rather than left as cheaper-looking
alternatives: A ships a false sentence and resurrects prisons across a reload,
and B ships an undo that vanishes without telling anybody.

**And whichever lands, one string has to change in the same commit.** The
clause *"and this cannot be undone"* in `save.delete.confirm`
(`src/content/default-locale-en.ts`) is true today and is the first thing an
undo window makes false. It is called out here, and in that key's own comment,
so the harmonising pass has it in writing.

## Weakest claim

**The size figures in §3 are inherited, not re-measured here.** The 1,566-byte,
~390 KB and 3.7 MB numbers are read out of `docs/PERSISTENCE.md` and issue
#102, and no envelope was encoded on this tree to check them. They are used
only to argue that a held copy is affordable, which is the half of §3 that does
**not** carry the recommendation — the argument that decides against option B
is about reliability, not bytes. What would change the assessment: a save an
order of magnitude larger than #102's 3.7 MB, which would make even the
in-memory option a decision about main-thread memory rather than about honesty.

**And the ruling's own wording is read here as requiring durability.** *"Okno
czasowe"* (a time window) does not by itself say whether the undo must survive
a reload; §§2-4 assume it must, because an undo that a refresh silently removes
is the failure article 3 names. If the owner means a window that is understood
to last only as long as the page does, **option B becomes viable and the ADR is
not needed** — that is the one question whose answer moves the recommendation,
and it is the owner's to answer rather than ours to assume.
