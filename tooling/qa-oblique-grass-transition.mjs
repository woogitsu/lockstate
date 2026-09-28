/** Full HD candidate comparison at a dirt-to-grass tile boundary. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5196';
const withBlender = process.env.LOCKSTATE_SHOW_GRASS_ART !== '0';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    const result = await page.evaluate(async ({ yaw, withBlender }) => {
      const dirt = await (await fetch('/game-content/oblique-floor-terrain-dirt.v1.json')).json();
      const grass = await (await fetch('/game-content/oblique-floor-terrain-grass.v1.json')).json();
      const dirtFrame = dirt.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
      const grassFrame = grass.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
      if (!dirtFrame || !grassFrame) throw new Error(`Missing terrain pose ${yaw}/45`);
      const dirtImage = new Image();
      dirtImage.src = dirtFrame.image;
      const grassImage = new Image();
      grassImage.src = grassFrame.image;
      await Promise.all([dirtImage.decode(), grassImage.decode()]);
      document.body.replaceChildren();
      document.body.style.margin = '0';
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      if (ctx === null) throw new Error('The browser did not provide a 2D canvas context.');
      ctx.fillStyle = '#344048';
      ctx.fillRect(0, 0, 1920, 1080);
      const rad = yaw * Math.PI / 180;
      const project = (x, y) => ({
        x: 960 + (Math.cos(rad) * x + Math.sin(rad) * y) * 64,
        y: 540 - (-Math.sin(rad) * x + Math.cos(rad) * y) * Math.sin(Math.PI / 4) * 64,
      });
      for (let x = -14; x < 14; x += 1) {
        for (let y = -14; y < 14; y += 1) {
          const center = project(x + 0.5, y + 0.5);
          const isGrass = x >= 0 && y >= -5 && y < 6;
          if (!isGrass) ctx.drawImage(dirtImage, center.x - 256, center.y - 256);
          else if (withBlender) ctx.drawImage(grassImage, center.x - 256, center.y - 256);
          else {
            const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
            ctx.beginPath();
            corners.forEach(([cx, cy], index) => {
              const point = project(cx, cy);
              if (index === 0) ctx.moveTo(point.x, point.y);
              else ctx.lineTo(point.x, point.y);
            });
            ctx.closePath();
            ctx.fillStyle = (x + y) % 2 ? '#435f36' : '#47643a';
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = '#eef4f4';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Dirt-to-grass seam | yaw ${yaw}° | elevation 45° | 64 px/tile | ${withBlender ? 'Blender grass' : 'flat grass'}`, 32, 46);
      return { dirt: dirtFrame.image, grass: grassFrame.image, tiles: 784 };
    }, { yaw, withBlender });
    const path = join(tmpdir(), `lockstate-oblique-grass-seam-${withBlender ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, ...result });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
