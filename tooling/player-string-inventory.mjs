#!/usr/bin/env node
// Generates `docs/PLAYER_STRINGS.md`: every player-visible sentence this game
// can show, with the value it currently ships and the coordinate it lives at.
//
// ## Why this exists, and what it is repairing
//
// `AGENTS.md`'s partial release of reservation 4 (2026-09-04) hands the CHOICE
// OF WORDS to agents and keeps the requirement that a sentence be TRUE with the
// owner. What we owe them in exchange is written into that release: every
// string authored under it is recorded "so the harmonising pass is one reading
// rather than an excavation".
//
// **The record was an excavation.** Measured on 2026-09-09 while re-anchoring
// `docs/adr/STATUS-QUEUE.md`: every coordinate that file gives for such a
// string was wrong at both ends of the window -- `:1917`, `:2273`, `:1026` and
// `:1100`, four of four -- and one of the four quoted a sentence the game had
// stopped showing. `hud.security.coverage-met-hint` was recorded as *"Only free
// guards answer incidents."* while the shipped value had been *"Incidents and
// searches need free guards."* since `377f17f6` (#941) and `f466d022` (#989),
// both of which predate every anchor window that could have reported it.
//
// So a findability record ages in two independent ways -- the coordinate
// drifts, and the string itself is edited by a later change that has no reason
// to look at the record -- and only the second makes it actively misleading to
// the person it was written for. A hand-maintained record cannot survive
// either. A generated one cannot suffer either.
//
// ## The shape, and why it is this shape
//
// The house pattern for a generated artefact, from
// `tooling/build-source-art-catalog.mjs` and the two art-catalog contracts:
// a generator with pure exported functions, a `pnpm` script that invokes it,
// and a `tests/foundation/` contract that regenerates and compares. Issue #141
// named the failure that pattern exists to prevent -- a generator invoked by
// nothing, "the shape that silently goes stale" -- and
// `tests/foundation/player-string-inventory-contract.test.ts` is what keeps
// this one from becoming that.
//
// ## Why a strict scanner rather than a regex, and rather than the TS AST
//
// 16 of the 433 authored keys put their value on the following line, and
// nothing stops a future one being a concatenation. A regex that reads
// `'key': 'value',` silently drops those, and **dropping a row from a
// findability record is the exact defect this file exists to end**.
//
// The obvious answer is the TypeScript compiler API, and it is not available:
// this repository is on `typescript@7`, whose npm package ships the Go port and
// exposes only `version` and `versionMajorMinor` to JavaScript -- measured, not
// assumed (`node -e "import('typescript').then(m => console.log(Object.keys(m.default)))"`).
//
// So the scanner below reads the object literal directly, and it **throws on
// anything it does not recognise** rather than skipping it. That is the whole
// design: a parser that silently skips is how a record loses a row, and a row
// this record loses is a sentence the owner never sees.
//
// **It is not trusted on its own.** `tests/foundation/player-string-inventory-contract.test.ts`
// imports `defaultLocaleEnCatalog` -- the map the game itself loads, built by
// `buildLocalizationCatalog`, which is `new Map(Object.entries(entries))` and
// passes values through verbatim -- and asserts every key and value this
// scanner produces is identical to the runtime one. The scanner supplies the
// coordinates; the running game supplies the truth they are checked against.
//
// ## What this can and cannot assert
//
// **It cannot tell whether a sentence is TRUE of the code that renders it.**
// Nothing mechanical can; that is a human opening the code, and it is the half
// of reservation 4 the owner never released. What it guarantees is narrower and
// is the half that actually rotted: **the key, the value and the coordinate in
// this record are the ones in the tree.** The argument for a sentence's truth
// belongs in a docblock beside the code that raises it --
// `hud.alert.event.construction.undo-refused-newer-action` is the worked
// example, arguing each of its three clauses at the code that decides it.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCALE_SOURCE_PATH = 'src/content/default-locale-en.ts';
export const INVENTORY_PATH = 'docs/PLAYER_STRINGS.md';
/** The object literal the authored sentences live in. Derived enum messages are generated from enums, not authored, and are not listed. */
const AUTHORED_DECLARATION = 'authoredMessages';

/** Advance past whitespace, `//` line comments and block comments. */
function skipTrivia(text, index) {
  let i = index;
  for (;;) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) throw new Error(`Unterminated block comment at offset ${String(i)}`);
      i = end + 2;
      continue;
    }
    return i;
  }
}

/** Read one single- or double-quoted literal, honouring escapes. Returns the decoded text and the offset after the closing quote. */
function readStringLiteral(text, index) {
  const quote = text[index];
  if (quote !== "'" && quote !== '"') throw new Error(`Expected a string literal at offset ${String(index)}, found ${JSON.stringify(text.slice(index, index + 20))}`);
  let out = '';
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) throw new Error(`Unterminated escape at offset ${String(i)}`);
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
      i += 2;
      continue;
    }
    if (ch === quote) return { value: out, next: i + 1 };
    out += ch;
    i += 1;
  }
  throw new Error(`Unterminated string literal starting at offset ${String(index)}`);
}

/** Find the body of `const <name> ... = {` … `}`, by brace counting that respects strings and comments. */
function findObjectBody(text, declarationName) {
  const declaration = new RegExp(`\\bconst\\s+${declarationName}\\b`).exec(text);
  if (declaration === null) throw new Error(`No \`const ${declarationName}\` declaration in ${LOCALE_SOURCE_PATH}`);
  const open = text.indexOf('{', declaration.index);
  if (open === -1) throw new Error(`No object literal after \`const ${declarationName}\``);
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const before = i;
    i = skipTrivia(text, i);
    if (i !== before) continue;
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i = readStringLiteral(text, i).next;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: open + 1, end: i };
    }
    i += 1;
  }
  throw new Error(`Unbalanced braces in \`const ${declarationName}\``);
}

function lineOfOffset(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * The CLDR plural categories a form object may be keyed on, in the order a
 * reader wants them: ascending, with the fraction category last.
 *
 * Written out rather than accepted by pattern, for the same reason the scanner
 * throws rather than skips: `{ oneu: '...' }` is a typo that would otherwise
 * become a form nothing selects, in a record whose whole job is that the owner
 * can read what ships.
 */
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/**
 * Read a `{ one: '...', other: '...' }` value: the shape a key takes once it
 * carries plural forms (`LocalizationPluralForms`, `src/content/localization.ts`).
 *
 * Keys may be bare identifiers or quoted; values are string literals, with the
 * same `+` concatenation the flat path already allows. Anything else throws,
 * exactly as the flat path does.
 */
function readPluralForms(text, index) {
  if (text[index] !== '{') throw new Error(`Expected a plural form object at offset ${String(index)}`);
  const forms = {};
  let i = skipTrivia(text, index + 1);
  for (;;) {
    if (text[i] === '}') return { value: forms, next: i + 1 };
    if (text[i] === ',') {
      i = skipTrivia(text, i + 1);
      continue;
    }

    let name;
    if (text[i] === "'" || text[i] === '"') {
      const quoted = readStringLiteral(text, i);
      name = quoted.value;
      i = quoted.next;
    } else {
      const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(text.slice(i));
      if (match === null) throw new Error(`Expected a plural category name at offset ${String(i)}, found ${JSON.stringify(text.slice(i, i + 20))}`);
      name = match[0];
      i += name.length;
    }
    if (!PLURAL_CATEGORIES.includes(name)) throw new Error(`Unknown plural category "${name}" at offset ${String(i)}`);

    i = skipTrivia(text, i);
    if (text[i] !== ':') throw new Error(`Expected ':' after plural category "${name}" at offset ${String(i)}`);
    i = skipTrivia(text, i + 1);

    let value = '';
    for (;;) {
      const literal = readStringLiteral(text, i);
      value += literal.value;
      i = skipTrivia(text, literal.next);
      if (text[i] !== '+') break;
      i = skipTrivia(text, i + 1);
    }
    forms[name] = value;
  }
}

/**
 * One table cell for a plural entry: every form, labelled, in category order.
 *
 * Both forms are printed rather than only `other`, because the record exists
 * so the owner can read *what ships* -- and what ships for a migrated key is
 * the set, not one member of it. The separator is a middle dot, which
 * `escapeCell` does not have to touch.
 */
function renderFormsCell(forms) {
  return PLURAL_CATEGORIES.filter((category) => forms[category] !== undefined)
    .map((category) => `${category}: ${forms[category]}`)
    .join(' · ');
}

/**
 * Every authored player-visible string, in source order, with the 1-based line
 * its KEY sits on -- the line a reader jumps to, not the line the value happens
 * to wrap onto.
 *
 * Throws on any property shape it does not recognise. That is deliberate: see
 * the header. A findability record that silently omits a sentence is the defect
 * this file exists to end, so an unparsable property must stop the build rather
 * than vanish from the table.
 */
export function extractAuthoredStrings(sourceText) {
  const { start, end } = findObjectBody(sourceText, AUTHORED_DECLARATION);
  const entries = [];
  let i = start;

  for (;;) {
    i = skipTrivia(sourceText, i);
    if (i >= end) break;
    if (sourceText[i] === ',') {
      i += 1;
      continue;
    }

    const keyOffset = i;
    const key = readStringLiteral(sourceText, i);
    i = skipTrivia(sourceText, key.next);
    if (sourceText[i] !== ':') throw new Error(`Expected ':' after key "${key.value}" at offset ${String(i)}`);
    i = skipTrivia(sourceText, i + 1);

    if (sourceText[i] === '{') {
      const forms = readPluralForms(sourceText, i);
      i = forms.next;
      entries.push({
        key: key.value,
        value: renderFormsCell(forms.value),
        forms: forms.value,
        line: lineOfOffset(sourceText, keyOffset),
      });
      continue;
    }

    let value = '';
    for (;;) {
      const literal = readStringLiteral(sourceText, i);
      value += literal.value;
      i = skipTrivia(sourceText, literal.next);
      if (sourceText[i] !== '+') break;
      i = skipTrivia(sourceText, i + 1);
    }

    entries.push({ key: key.value, value, line: lineOfOffset(sourceText, keyOffset) });
  }

  return { entries };
}

/** Markdown-table-safe: a pipe would split the cell, a newline would end the row. */
function escapeCell(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderInventory({ entries }) {
  const lines = [];
  lines.push('# Every sentence this game can show a player');
  lines.push('');
  lines.push('**Generated. Do not edit by hand.** Run `pnpm content:player-strings` after changing');
  lines.push(`\`${LOCALE_SOURCE_PATH}\`; \`tests/foundation/player-string-inventory-contract.test.ts\``);
  lines.push('fails if this file and that one disagree.');
  lines.push('');
  lines.push("## What this is for");
  lines.push('');
  lines.push("`AGENTS.md`'s partial release of reservation 4 gives the choice of words to agents and");
  lines.push('keeps the requirement that a sentence be **true** with the owner, in exchange for every');
  lines.push('authored string being recorded so that harmonising the wording is *"one reading rather');
  lines.push('than an excavation"*. This file is that reading.');
  lines.push('');
  lines.push('**It replaces a hand-maintained record that had failed.** On 2026-09-09 every coordinate');
  lines.push('`docs/adr/STATUS-QUEUE.md` gave for such a string was wrong — four of four — and one of');
  lines.push('them quoted a sentence the game had stopped showing months of releases earlier. Both');
  lines.push('failures are impossible here: the key, the value and the coordinate below are read out');
  lines.push('of the tree every time this file is regenerated, and a stale copy fails CI.');
  lines.push('');
  lines.push('**What it does not tell you is whether a sentence is _true_ of the code that raises it.**');
  lines.push('Nothing mechanical can. That argument belongs in a docblock beside that code —');
  lines.push('`hud.alert.event.construction.undo-refused-newer-action` is the worked example, arguing');
  lines.push('each of its three clauses at the code that decides it.');
  lines.push('');
  lines.push(`## The ${String(entries.length)} authored sentences`);
  lines.push('');
  lines.push(`Source: \`${LOCALE_SOURCE_PATH}\`, in the order they are declared.`);
  lines.push('');
  lines.push('| Key | Ships today | At |');
  lines.push('| --- | --- | --- |');
  for (const entry of entries) {
    lines.push(`| \`${escapeCell(entry.key)}\` | ${escapeCell(entry.value)} | \`${LOCALE_SOURCE_PATH}:${String(entry.line)}\` |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildInventory(sourceText) {
  return renderInventory(extractAuthoredStrings(sourceText));
}

function main() {
  const sourceText = readFileSync(join(REPOSITORY_ROOT, LOCALE_SOURCE_PATH), 'utf8');
  const rendered = buildInventory(sourceText);
  writeFileSync(join(REPOSITORY_ROOT, INVENTORY_PATH), `${rendered}\n`);
  const { entries } = extractAuthoredStrings(sourceText);
  process.stdout.write(`Wrote ${INVENTORY_PATH}: ${String(entries.length)} authored sentences\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
