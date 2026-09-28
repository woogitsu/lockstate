/** Compare the south-east cell joint with straight segments versus the Blender corner. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5196';
const useCorner = process.env.LOCKSTATE_USE_SE_CORNER !== '0';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    const result = await page.evaluate(async ({ angle, useCorner }) => {
      const registry = await (await fetch('/game-content/oblique-module-registry.v1.json')).json();
      const catalogs = new Map();
      for (const entry of registry.entries) catalogs.set(entry.assetId, await (await fetch(entry.manifest)).json());
      const floor = [];
      for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
        floor.push({ id: 'floor.cell.sealed-concrete', x, y });
      }
      for (const y of [-1, 0, 1]) floor.push({ id: 'floor.linoleum.institutional', x: -2, y });
      const cutaway = angle > 0;
      const raised = [
        ...[-1, 0, 1].map((x) => ({ id: 'wall.interior.module.full', x, y: 1 })),
        ...(useCorner ? [-1, 0] : [-1, 0, 1]).map((x) => ({ id: cutaway ? 'wall.interior.module.cutaway' : 'wall.interior.module.full', x, y: -1 })),
        ...(useCorner ? [0, 1] : [-1, 0, 1]).map((y) => ({ id: cutaway ? 'wall.interior.module.west.cutaway' : 'wall.interior.module.west.full', x: 1, y })),
        ...(useCorner ? [{ id: `wall.interior.corner.inner.south-east.${cutaway ? 'cutaway' : 'full'}`, x: 1, y: -1 }] : []),
        ...[-1, 1].map((y) => ({ id: cutaway ? 'wall.interior.module.west.cutaway' : 'wall.interior.module.west.full', x: -1, y })),
        { id: 'door.interior.open.west.full', x: -1, y: 0 },
        { id: 'furniture.cell.bed.single.variants', x: 0.65, y: 0.65 },
        { id: 'actor.prisoner.base', x: 0, y: -0.45 },
        { id: 'actor.guard.base', x: -2, y: 0 },
      ];
      const elevation = 45;
      const select = (id) => {
        const catalog = catalogs.get(id);
        const distance = (yaw) => Math.abs(((angle - yaw + 540) % 360) - 180);
        const nearest = [...catalog.yawDegrees].sort((a, b) => distance(a) - distance(b))[0];
        return catalog.frames.find((frame) => frame.yawDegrees === nearest && frame.elevationDegrees === elevation).image;
      };
      const used = [...floor, ...raised].map((item) => select(item.id));
      const images = new Map();
      await Promise.all([...new Set(used)].map(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        images.set(url, image);
      }));
      document.body.replaceChildren();
      document.body.style.margin = '0';
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#344048';
      ctx.fillRect(0, 0, 1920, 1080);
      const rad = angle * Math.PI / 180;
      const depth = ({ x, y }) => -Math.sin(rad) * x + Math.cos(rad) * y;
      const project = ({ x, y }, zoom, centerX, centerY) => ({
        x: centerX + (Math.cos(rad) * x + Math.sin(rad) * y) * 64 * zoom,
        y: centerY - depth({ x, y }) * Math.sin(Math.PI / 4) * 64 * zoom,
      });
      const paint = (items, zoom, centerX, centerY) => {
        for (const item of items) {
          const url = select(item.id);
          const image = images.get(url);
          const at = project(item, zoom, centerX, centerY);
          ctx.drawImage(image, at.x - 256 * zoom, at.y - 256 * zoom, 512 * zoom, 512 * zoom);
        }
      };
      paint(floor.slice().sort((a, b) => depth(b) - depth(a)), 2, 720, 600);
      paint(raised.slice().sort((a, b) => depth(b) - depth(a)), 2, 720, 600);
      ctx.fillStyle = '#d7e4e9';
      ctx.font = '24px sans-serif';
      ctx.fillText(`South-east cell joint | yaw ${angle}° | elevation 45° | 2× inspection`, 35, 50);
      paint(floor.slice().sort((a, b) => depth(b) - depth(a)), 1, 1530, 585);
      paint(raised.slice().sort((a, b) => depth(b) - depth(a)), 1, 1530, 585);
      ctx.font = '18px sans-serif';
      ctx.fillText('Native 64 px/tile', 1430, 365);
      return { modules: used.length, uniqueImages: images.size };
    }, { angle: yaw, useCorner });
    const path = join(tmpdir(), `lockstate-oblique-se-corner-${useCorner ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, ...result });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
