import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

// Read-only source proof. Run from the repository root; never starts a browser.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const postcss = viteRequire('postcss');
const base = '9f709f293c47228166a09f550ef9867006d7bec6';
const files = ['src/ui/tokens.css', 'src/ui/hud/hud.css', 'src/ui/primitives/primitives.css', 'src/ui/brand.css', 'src/styles.css'];
const old = file => cp.execFileSync('git', ['show', `${base}:${file}`], { maxBuffer: 4 * 1024 * 1024 }).toString('utf8');
const source = file => fs.readFileSync(file, 'utf8');
// Git blobs use LF; Windows checkout CRLF has identical CSS semantics.
const ast = text => postcss.parse(text.replaceAll('\r\n', '\n'));
const newRole = name => name === '--surface-commandbar' || name.startsWith('--command-');
const paintProperties = new Set(['color', 'background', 'background-color', 'border-color', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color']);
const localPaintRoles = new Set(['--text-heading', '--text-body', '--text-subtle', '--text-muted', '--surface-control', '--surface-overlay', '--surface-active', '--border', '--border-hairline', '--accent', '--accent-deep', '--accent-soft', '--accent-contrast', '--badge-neutral-fg', '--badge-neutral-bg']);

function geometry(node) {
  if (node.type === 'comment') return undefined;
  if (node.type === 'decl') {
    // Custom roles removed here are explicitly colour-only below. No font,
    // size, opacity, border shorthand, spacing, overflow or transform is removed.
    if (paintProperties.has(node.prop) || newRole(node.prop) || (localPaintRoles.has(node.prop) && /^var\(--command-[a-z-]+\)$/.test(node.value))) return undefined;
    return ['decl', node.prop, node.value, Boolean(node.important)];
  }
  const children = (node.nodes ?? []).map(geometry).filter(Boolean);
  if (children.length === 0) return undefined;
  if (node.type === 'rule') return ['rule', node.selector, children];
  if (node.type === 'atrule') return ['at', node.name, node.params, children];
  return ['root', children];
}
const preservation = files.map(file => {
  const before = ast(old(file)), after = ast(source(file));
  assert.deepEqual(geometry(after), geometry(before), `${file}: actual AST nonpaint declarations changed`);
  // Count retained actual declaration records, not comments or a line estimate.
  function records(shape) { if (shape?.[0] === 'decl') return 1; return Array.isArray(shape) ? shape.reduce((n, child) => n + (Array.isArray(child) ? records(child) : 0), 0) : 0; }
  const nonpaintDeclarations = records(geometry(before));
  return { file, nonpaintDeclarations, preserved: true };
});

const tokenAst = ast(source(files[0]));
function customDeclarations(root, withoutNew = false) {
  const out = [];
  root.walkDecls(decl => {
    if (!decl.prop.startsWith('--') || (withoutNew && newRole(decl.prop))) return;
    const parents = []; for (let p = decl.parent; p && p.type !== 'root'; p = p.parent) parents.unshift(p.type === 'rule' ? p.selector : `@${p.name} ${p.params}`);
    out.push([parents, decl.prop, decl.value, Boolean(decl.important)]);
  });
  return out;
}
assert.deepEqual(customDeclarations(tokenAst, true), customDeclarations(ast(old(files[0]))), 'An original raw/semantic/dimension/status token changed');

function tokens(theme) {
  const map = new Map();
  tokenAst.walkRules(rule => {
    if (rule.parent.type !== 'root') return;
    const selectors = rule.selectors;
    if (!(selectors.includes(':root') || selectors.includes(`:root[data-theme='${theme}']`))) return;
    for (const node of rule.nodes ?? []) if (node.type === 'decl' && node.prop.startsWith('--')) map.set(node.prop, node.value);
  });
  return map;
}
function colour(token, map, stack = new Set()) {
  assert(!stack.has(token), `Cyclic colour ${token}`); stack.add(token);
  const value = map.get(token); assert(value, `Missing actual colour role ${token}`);
  const alias = /^var\((--[a-z\d-]+)\)$/.exec(value);
  if (alias) return colour(alias[1], map, stack);
  if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16) / 255).concat(1);
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/.exec(value);
  assert(rgba, `New role does not resolve to an existing actual ramp colour: ${token}=${value}`);
  return [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255, Number(rgba[4] ?? 1)];
}
const blend = (fg, bg) => fg.slice(0, 3).map((part, i) => part * fg[3] + bg[i] * (1 - fg[3])).concat(1);
function luminance(rgb) { return rgb.slice(0, 3).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((n, c, i) => n + c * [.2126, .7152, .0722][i], 0); }
const ratio = (fg, bg) => { const a = luminance(fg), b = luminance(bg); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };

const hudAst = ast(source(files[1]));
let command;
hudAst.walkRules(rule => { if (rule.selectors.includes('.hud-strip__clock') && rule.nodes.some(node => node.prop === '--text-body' && node.value === 'var(--command-text-body)')) command = rule; });
assert(command, 'The actual command-island inverse consumer is absent');
assert.deepEqual(command.selectors, ['.hud-strip__brand', '.hud-strip__clock', '.hud-strip__transport', '.hud-strip__history', '.hud-strip .hud-layout__button']);
assert.equal(command.parent.type, 'atrule');
assert.equal(command.parent.params, '(min-width: 1920px) and (min-height: 1080px)');
const scopedRoles = new Map(command.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
const contrast = [];
for (const theme of ['light', 'dark']) {
  const global = tokens(theme), scoped = new Map([...global, ...scopedRoles]);
  // Each new custom alias resolves to an existing ramp colour. Global original
  // aliases remain unchanged; only the actual command islands override them.
  for (const [name] of global) if (newRole(name)) colour(name, global);
  const bar = colour('--surface-commandbar', global);
  const pairs = [
    ...['--text-heading', '--text-body', '--text-subtle', '--text-muted'].map(fg => ({ fg, bg: '--surface-commandbar', background: bar, required: 4.5 })),
    ...['--surface-control', '--surface-overlay', '--surface-active'].map(bg => ({ fg: '--text-subtle', bg, background: colour(bg, scoped), required: 4.5 })),
    { fg: '--badge-neutral-fg', bg: '--badge-neutral-bg over commandbar', background: blend(colour('--badge-neutral-bg', scoped), bar), required: 4.5 },
    { fg: '--accent-contrast', bg: '--accent-deep', background: colour('--accent-deep', scoped), required: 4.5 },
    { fg: '--accent-contrast', bg: '--accent', background: colour('--accent', scoped), required: 4.5 },
    { fg: '--accent', bg: '--accent-soft', background: colour('--accent-soft', scoped), required: 4.5 },
    { fg: '--accent', bg: '--surface-commandbar', background: bar, required: 3 },
  ];
  for (const pair of pairs) {
    const measured = ratio(colour(pair.fg, scoped), pair.background);
    contrast.push({ theme, foreground: pair.fg, background: pair.bg, ratio: measured, required: pair.required });
    assert(measured >= pair.required, `${theme} ${pair.fg} on ${pair.bg}: actual source contrast ${measured.toFixed(4)} < ${pair.required}`);
  }
  for (const bg of ['--surface-panel', '--surface-raised']) {
    const measured = ratio(colour('--text-body', global), colour(bg, global));
    contrast.push({ theme, foreground: 'resting secondary --text-body', background: bg, ratio: measured, required: 4.5 });
    assert(measured >= 4.5, `Resting secondary text no longer readable in ${theme}`);
  }
}
const quiet = ast(source(files[2])).nodes.find(node => node.type === 'rule' && node.selector.includes('.save-panel__button:not(:hover)'));
assert(quiet, 'Quiet resting-secondary producer absent');
for (const selector of quiet.selectors) for (const state of [':not(:hover)', ':not(:active)', ':not(:focus-visible)', ':not(:disabled)', ":not([aria-disabled='true'])"]) assert(selector.includes(state), `Resting rule intrudes on ${state}`);
assert(quiet.selectors.find(s => s.startsWith('.ui-action')).includes(":not([data-tone='primary'])"));
assert(quiet.selectors.find(s => s.startsWith('.ui-icon-button')).includes(":not([aria-pressed='true'])"));
const changedSources = cp.execFileSync('git', ['diff', '--name-only', base, '--', 'src']).toString('utf8').trim().split('\n').filter(Boolean).sort();
assert.deepEqual(changedSources, files.slice(0, 3).sort(), 'Source scope grew beyond the three paint files');
const screenshot = 'docs/research/2026-10-03-approved-camera-view-disclosure/native/original-modern-pl/006-actual-ui100-active-status-all-camera.png';
const result = { base, kind: 'read-only actual-source AST and contrast proof, not native geometry', changedSources, preservation,
  allOriginalTokensPreserved: true, contrast, minimumTextContrast: Math.min(...contrast.filter(row => row.required === 4.5).map(row => row.ratio)),
  originalReferenceScreenshot: { path: screenshot, sha256: createHash('sha256').update(fs.readFileSync(screenshot)).digest('hex'), visibleBuild: '94b923a', newDraftAcceptance: false },
  browserExecuted: false, buildExecuted: false, visualAcceptance: 'pending' };
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (process.argv[2]) fs.writeFileSync(process.argv[2], serialized);
process.stdout.write(serialized);
