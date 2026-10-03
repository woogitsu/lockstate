import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
interface Box {
  rect: { height: number };
  paddingTop: string; paddingBottom: string; borderTop: string; borderBottom: string; marginBottom: string;
}
interface Snapshot { uiScale: string; boxes: { selector: string; nodes: Box[] }[] }
const sourcePath = 'docs/research/2026-10-03-ci2010-ui-source2-diagnosis/native-comparison/toolbox-fullhd-200-angled-controls.json';
const bytes = readFileSync(sourcePath);
const snapshot = JSON.parse(bytes.toString('utf8')) as Snapshot;
function box(selector: string): Box {
  const node = snapshot.boxes.find(group => group.selector === selector)?.nodes[0];
  if (!node) throw new Error(`Missing original recorded public box: ${selector}`);
  return node;
}
const scale = Number(snapshot.uiScale);
if (scale !== 2) throw new Error('This bound uses the recorded actual FullHD200 case only');
const corner = box('.hud__corner').rect.height;
const surface = box('.hud-minimap__surface');
const paddingBorderFloor = [surface.paddingTop, surface.paddingBottom, surface.borderTop, surface.borderBottom]
  .map(Number.parseFloat).reduce((sum, value) => sum + value, 0);
const renderer = box('.camera-review-toolbox select').rect.height;
const pan = box('.hud-camera-pan');
const pose = box('.hud-camera-pose');
const panBlock = pan.rect.height + Number.parseFloat(pan.marginBottom);
const poseBlock = pose.rect.height + Number.parseFloat(pose.marginBottom);
// Existing authored cap and 44px scaled target. Arithmetic on recorded chrome,
// not a CSS flex-layout simulator.
const cap = 6 * 44 * scale;
const minimapMaximumRelief = surface.rect.height - paddingBorderFloor;
const worldRequired = corner + renderer + panBlock - minimapMaximumRelief;
const angledRequired = worldRequired + poseBlock;
const result = {
  nativeSnapshot: sourcePath,
  nativeSnapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  restoredCornerWithCompleteActualEmptyRow: corner, originalCornerCap: cap,
  renderer, panBlock, poseBlock, surface: surface.rect.height, paddingBorderFloor, minimapMaximumRelief,
  worldMinimumRetainingExistingPaddingAndCompleteRow: worldRequired,
  angledMinimumRetainingExistingPaddingAndCompleteRow: angledRequired,
  worldDeficit: worldRequired - cap, angledDeficit: angledRequired - cap,
  productionSourceChanges: false, browserRun: false,
  decision: 'No independent full-row repair inside the existing 528px cap while all current camera rows remain there; owner camera layout choice required.',
};
writeFileSync('docs/research/2026-10-03-minimap-zero-list-existing-rule-audit/corner-bound.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
