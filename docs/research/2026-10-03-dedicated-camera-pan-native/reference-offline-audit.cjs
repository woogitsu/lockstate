// Offline reference arithmetic only; this launches no browser and claims no native acceptance.
const fs = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const source = fs.readFileSync('tests/browser/dedicated-camera-pan-player.spec.ts', 'utf8');
const functions = ['centre', 'expectedGroundStep', 'worldCursorOrigin'];
const selected = functions.map(name => {
  const found = [...source.matchAll(new RegExp('^function '+name+'\\([^]*?^}', 'gm'))];
  if (found.length !== 1) throw new Error(`Reference function ${name} must be unique`);
  return found[0][0];
});
const js = stripTypeScriptTypes(selected.join('\n'));
const assert = require('node:assert/strict');
const expect = actual => ({ toBeCloseTo(expected, precision) { assert.ok(Math.abs(actual - expected) < 0.5 * 10 ** -precision, `${actual} vs ${expected}`); } });
const reference = new Function('expect', js + '\nreturn { centre, expectedGroundStep, worldCursorOrigin };')(expect);
const result = [];
const width = 1920, height = 1080, span = 32 * 64;
for (const mode of ['world', 'oblique']) for (const zoom of [0.5, 1.25, 3]) for (const ratio of [1, 2]) for (const direction of ['right', 'left', 'down', 'up']) {
  const yaw = mode === 'world' ? 0 : -Math.PI / 4;
  const elevation = mode === 'world' ? Math.PI / 2 : Math.PI / 4;
  const logicalWidth = width * ratio, logicalHeight = height * ratio;
  const c = Math.cos(yaw), s = Math.sin(yaw), h = Math.sin(elevation);
  // Independently construct public ground AABB by intersecting all four
  // viewport corners with a ground plane, using dot-product camera axes.
  const corners = [[-logicalWidth/2,-logicalHeight/2], [logicalWidth/2,-logicalHeight/2],
    [logicalWidth/2,logicalHeight/2], [-logicalWidth/2,logicalHeight/2]].map(([x,y]) => ({
      x: 1024 + (c*x + s*y/h)/zoom, y: 1024 + (-s*x + c*y/h)/zoom,
    }));
  const left = Math.min(...corners.map(p => p.x)), top = Math.min(...corners.map(p => p.y));
  const right = Math.max(...corners.map(p => p.x)), bottom = Math.max(...corners.map(p => p.y));
  // Arithmetic stress includes unclamped synthetic AABBs; native fixture
  // rejects clipping and chooses tighter zoom before physical measurements.
  const measured = { percent: { left: left/span*100, top: top/span*100, width: (right-left)/span*100, height: (bottom-top)/span*100 },
    canvas: { width: logicalWidth, height: logicalHeight, left: 13, top: 17, widthCss: width, heightCss: height }, map: { width: 32, height: 32 } };
  const step = reference.expectedGroundStep(mode, direction, measured);
  const projected = { x: zoom*(c*step.x-s*step.y)/ratio, y: zoom*h*(s*step.x+c*step.y)/ratio };
  const wanted = { x: direction === 'right' ? 128 : direction === 'left' ? -128 : 0, y: direction === 'down' ? 128 : direction === 'up' ? -128 : 0 };
  assert.ok(Math.abs(projected.x-wanted.x) < 1e-9); assert.ok(Math.abs(projected.y-wanted.y) < 1e-9);
  if (mode === 'world') {
    // Viewport offset and camera zoom must not be lost by cursor-origin reference.
    const cursor = { x: 13+width/2+4.25*64*zoom/ratio, y: 17+height/2-3.75*64*zoom/ratio };
    assert.deepEqual(reference.worldCursorOrigin(measured,cursor), {x:20,y:12});
  }
  result.push({ mode, zoom, logicalCssRatio: ratio, direction, step, projected, wanted });
}
fs.writeFileSync('docs/research/2026-10-03-dedicated-camera-pan-native/reference-offline-results.json', JSON.stringify({kind:'reference arithmetic only, not native acceptance', passed:result.length, cases:result},null,2));
console.log(`${result.length} independent reference arithmetic cases passed; no browser or production mutation`);
