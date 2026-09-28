/** Full HD candidate comparison for the default dirt shown by the live app. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5196';
const withBlender = process.env.LOCKSTATE_SHOW_DIRT_ART !== '0';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    const result = await page.evaluate(async ({ yaw, withBlender }) => {
      const catalog = await (await fetch('/game-content/oblique-floor-terrain-dirt.v1.json')).json();
      const frame = catalog.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
      if (!frame) throw new Error(`Missing dirt pose ${yaw}/45`);
      const image = new Image();
      image.src = frame.image;
      await image.decode();
      document.body.replaceChildren();
      document.body.style.margin = '0';
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      document.body.append(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D canvas context unavailable');
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
          if (withBlender) ctx.drawImage(image, center.x - catalog.pivotPx[0], center.y - catalog.pivotPx[1]);
          else {
            const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
            ctx.beginPath();
            corners.forEach(([cx, cy], index) => {
              const point = project(cx, cy);
              if (index === 0) ctx.moveTo(point.x, point.y);
              else ctx.lineTo(point.x, point.y);
            });
            ctx.closePath();
            ctx.fillStyle = (x + y) % 2 ? '#66533f' : '#6a5744';
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = '#eef4f4';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Default dirt | yaw ${yaw}° | elevation 45° | 64 px/tile | ${withBlender ? 'Blender candidate' : 'flat live palette'}`, 32, 46);
      return { image: frame.image, tiles: 784 };
    }, { yaw, withBlender });
    const path = join(tmpdir(), `lockstate-oblique-dirt-${withBlender ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, ...result });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
