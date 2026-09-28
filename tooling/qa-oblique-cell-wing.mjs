/** Full HD module composition: four cells, a corridor and a shower room. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5187';
const showerArt = process.env.LOCKSTATE_SHOW_SHOWER !== '0';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    const result = await page.evaluate(async ({ yaw, showerArt }) => {
      const registry = await (await fetch('/game-content/oblique-module-registry.v1.json')).json();
      const catalogs = new Map();
      for (const entry of registry.entries) catalogs.set(entry.assetId, await (await fetch(entry.manifest)).json());
      const floor = [];
      for (let x = -6; x <= 8; x += 1) {
        floor.push({ id: 'floor.linoleum.institutional', x, y: -1 });
        for (let y = 0; y <= 2; y += 1) {
          floor.push({ id: x >= 6 && showerArt ? 'floor.shower.ceramic' : 'floor.cell.sealed-concrete', x, y });
        }
      }
      const cutaway = yaw < 0;
      const raised = [];
      for (const [index, cellCenter] of [-5, -2, 1, 4].entries()) {
        raised.push({ id: 'furniture.cell.bed.single.variants', x: cellCenter + 0.4, y: 1.35 });
        raised.push({ id: 'door.interior.open.full', x: cellCenter, y: -0.5 });
        if (index === 0 || index === 3) raised.push({ id: 'actor.prisoner.base', x: cellCenter - 0.45, y: 0.55 });
      }
      raised.push({ id: 'actor.guard.base', x: -1, y: -1 });
      raised.push({ id: 'actor.prisoner.base', x: 8, y: 1 });
      for (let x = -6; x <= 8; x += 1) {
        raised.push({ id: 'wall.interior.module.full', x, y: 2.5 });
      }
      for (const x of [-6.5, -3.5, -0.5, 2.5, 5.5, 8.5]) {
        raised.push({ id: cutaway ? 'wall.interior.module.cutaway' : 'wall.interior.module.west.full', x, y: 1.25 });
      }
      if (showerArt) raised.push({ id: 'fixture.shower.head', x: 8, y: 2 });
      const elevation = 45;
      const select = (id) => {
        const catalog = catalogs.get(id);
        if (!catalog) throw new Error(`Missing oblique module ${id}`);
        const distance = (angle) => Math.abs(((yaw - angle + 540) % 360) - 180);
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
      const rad = yaw * Math.PI / 180;
      const depth = ({ x, y }) => -Math.sin(rad) * x + Math.cos(rad) * y;
      const project = ({ x, y }) => ({
        x: 960 + (Math.cos(rad) * x + Math.sin(rad) * y) * 64,
        y: 580 - depth({ x, y }) * Math.sin(Math.PI / 4) * 64,
      });
      const paint = (items) => {
        for (const item of items.sort((a, b) => depth(b) - depth(a))) {
          const at = project(item);
          ctx.drawImage(images.get(select(item.id)), at.x - 256, at.y - 256);
        }
      };
      paint(floor);
      paint(raised);
      ctx.fillStyle = '#d7e4e9';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Four cells + corridor + shower | yaw ${yaw}° | elevation 45° | native 64 px/tile`, 34, 48);
      return { modules: used.length, uniqueImages: images.size };
    }, { yaw, showerArt });
    const path = join(tmpdir(), `lockstate-oblique-cell-wing-${showerArt ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, ...result });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
