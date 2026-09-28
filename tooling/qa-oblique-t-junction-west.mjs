/** Temporary Full HD comparison driven by the actual world projector. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = 'http://127.0.0.1:5208';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const results = [];
  for (const side of ['west-t']) {
    for (const yaw of [-90, -45, 0, 45, 90]) {
      const result = await page.evaluate(async ({ side, yaw }) => {
        const [{ SparseWorld }, { WorldRenderView }, { projectObliqueWorldFrame }, { groundToScreen }] = await Promise.all([
          import(new URL('/src/simulation/world/sparse-world.ts', window.location.origin).pathname),
          import(new URL('/src/rendering/world/world-view.ts', window.location.origin).pathname),
          import(new URL('/src/rendering/camera/oblique-world-projection.ts', window.location.origin).pathname),
          import(new URL('/src/rendering/camera/oblique-projection.ts', window.location.origin).pathname),
        ]);
        const world = new SparseWorld(8);
        world.load({ x: 0, y: 0 });
        for (const x of [1, 2]) world.setTopEdge({ x, y: 2 }, 1);
        for (const y of [1, 2]) {
          world.setLeftEdge({ x: 3, y }, 1);
        }
        const frame = {
          revision: 1, world: WorldRenderView.fromSnapshot(world.snapshot()),
          structures: [], actors: [], rooms: [], roomConditions: [],
        };
        const pose = {
          target: { x: 192, y: 128 }, viewport: { width: 960, height: 1080 },
          zoom: 2, yawRadians: yaw * Math.PI / 180, elevationRadians: Math.PI / 4,
        };
        const projection = projectObliqueWorldFrame(frame, pose);
        const selected = projection.raised.filter((item) => item.kind !== 'actor' &&
          (item.kind === 'north-edge' || item.kind === 'west-edge'));
        const replaced = ['north-edge:2:2', 'west-edge:3:1', 'west-edge:3:2'];
        if (selected.length !== 4 || replaced.some((id) => !selected.some((item) => item.id === id))) {
          throw new Error(`Real projection lacks expected ${side} edges`);
        }
        const registry = await (await fetch('/game-content/oblique-module-registry.v1.json')).json();
        const lookup = new Map(registry.entries.map((entry) => [entry.assetId, entry.manifest]));
        lookup.set('wall.interior.junction.t.west.full', '/game-content/oblique-wall-junction-t-west-full.v1.json');
        lookup.set('wall.interior.corner.inner.north-east.full', '/game-content/oblique-wall-corner-north-east-full.v1.json');
        lookup.set('wall.interior.corner.inner.south-east.full', '/game-content/oblique-wall-corner-south-east-full.v1.json');
        const assetIds = [...new Set([...selected.map((item) => item.artAssetId),
          'wall.interior.junction.t.west.full', 'wall.interior.corner.inner.north-east.full',
          'wall.interior.corner.inner.south-east.full'])];
        const catalogs = new Map();
        for (const id of assetIds) catalogs.set(id, await (await fetch(lookup.get(id))).json());
        const imageFor = (id) => {
          const catalog = catalogs.get(id);
          const nearest = [...catalog.yawDegrees].sort((a, b) =>
            Math.abs(((yaw - a + 540) % 360) - 180) - Math.abs(((yaw - b + 540) % 360) - 180))[0];
          return catalog.frames.find((entry) => entry.yawDegrees === nearest && entry.elevationDegrees === 45).image;
        };
        const urls = [...new Set(assetIds.map(imageFor))];
        const images = new Map();
        await Promise.all(urls.map(async (url) => {
          const image = new Image(); image.src = url; await image.decode(); images.set(url, image);
        }));
        document.body.replaceChildren(); document.body.style.margin = '0';
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
        document.body.append(canvas);
        const ctx = canvas.getContext('2d');
        if (ctx === null) throw new Error('The browser did not provide a 2D canvas context.');
        const paint = (after, offset) => {
          ctx.fillStyle = '#344048'; ctx.fillRect(offset, 0, 960, 1080);
          ctx.save(); ctx.translate(offset, 0);
          for (const tile of projection.ground) {
            if (tile.tileX < 0 || tile.tileX > 5 || tile.tileY < 0 || tile.tileY > 5) continue;
            ctx.beginPath(); tile.quad.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
            ctx.closePath(); ctx.fillStyle = (tile.tileX + tile.tileY) % 2 ? '#676f71' : '#70797b'; ctx.fill();
          }
          const draw = (id, anchor) => {
            const catalog = catalogs.get(id), image = images.get(imageFor(id));
            const [px, py] = catalog.pivotPx;
            ctx.drawImage(image, anchor.x - px * pose.zoom, anchor.y - py * pose.zoom,
              catalog.resolutionPx[0] * pose.zoom, catalog.resolutionPx[1] * pose.zoom);
          };
          for (const item of selected.filter((item) => !replaced.includes(item.id))) {
            const anchor = {
              x: item.footprint.reduce((sum, point) => sum + point.x, 0) / 4,
              y: item.footprint.reduce((sum, point) => sum + point.y, 0) / 4,
            };
            draw(item.artAssetId, anchor);
          }
          const anchor = groundToScreen({ x: 192 + 0.11 * 64, y: 128 + 0.11 * 64 }, pose);
          if (after) draw('wall.interior.junction.t.west.full', anchor);
          else {
            draw('wall.interior.corner.inner.north-east.full', anchor);
            draw('wall.interior.corner.inner.south-east.full', anchor);
          }
          ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif';
          ctx.fillText(`${side} | yaw ${yaw}° | ${after ? 'single T junction' : 'two colliding corners'}`, 24, 48);
          ctx.restore();
        };
        paint(false, 0); paint(true, 960);
        return { projected: selected.map((item) => item.id), replaced, loaded: urls.length };
      }, { side, yaw });
      const path = join(tmpdir(), `lockstate-t-junction-${side}-yaw${yaw}.png`);
      await page.screenshot({ path });
      results.push({ side, yaw, path, ...result });
    }
  }
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
