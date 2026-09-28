/** Full HD candidate comparison for four direction-aware dirt/grass overlays. */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.env.LOCKSTATE_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5196';
const withEdge = process.env.LOCKSTATE_SHOW_EDGE_ART !== '0';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(`${origin}/art-angle-preview.html`, { waitUntil: 'networkidle' });
  const captures = [];
  for (const yaw of [-90, -45, 0, 45, 90]) {
    const result = await page.evaluate(async ({ yaw, withEdge }) => {
      const dirt = await (await fetch('/game-content/oblique-floor-terrain-dirt.v1.json')).json();
      const grass = await (await fetch('/game-content/oblique-floor-terrain-grass.v1.json')).json();
      const dirtFrame = dirt.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
      const grassFrame = grass.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
      if (!dirtFrame || !grassFrame) throw new Error(`Missing terrain pose ${yaw}/45`);
      const dirtImage = new Image();
      dirtImage.src = dirtFrame.image;
      const grassImage = new Image();
      grassImage.src = grassFrame.image;
      const edgeImages = new Map();
      for (const direction of ['north', 'east', 'south', 'west']) {
        const edge = await (await fetch(`/game-content/oblique-floor-dirt-grass-edge-${direction}.v1.json`)).json();
        const pose = edge.frames.find((entry) => entry.yawDegrees === yaw && entry.elevationDegrees === 45);
        if (!pose) throw new Error(`Missing ${direction} edge pose ${yaw}/45`);
        const image = new Image();
        image.src = pose.image;
        edgeImages.set(direction, { image, pivot: edge.pivotPx });
      }
      await Promise.all([dirtImage.decode(), grassImage.decode(),
        ...[...edgeImages.values()].map(({ image }) => image.decode())]);
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
          const isGrass = x >= -5 && x <= 5 && y >= -5 && y <= 5;
          if (!isGrass) ctx.drawImage(dirtImage, center.x - dirt.pivotPx[0], center.y - dirt.pivotPx[1]);
          else ctx.drawImage(grassImage, center.x - grass.pivotPx[0], center.y - grass.pivotPx[1]);
        }
      }
      if (withEdge) {
        for (let x = -5; x <= 5; x += 1) {
          for (let y = -5; y <= 5; y += 1) {
            const center = project(x + 0.5, y + 0.5);
            const directions = [];
            if (y === -5) directions.push('north');
            if (x === 5) directions.push('east');
            if (y === 5) directions.push('south');
            if (x === -5) directions.push('west');
            for (const direction of directions) {
              const edge = edgeImages.get(direction);
              ctx.drawImage(edge.image, center.x - edge.pivot[0], center.y - edge.pivot[1]);
            }
          }
        }
      }
      ctx.fillStyle = '#eef4f4';
      ctx.font = '24px sans-serif';
      ctx.fillText(`Dirt-to-grass edge | yaw ${yaw}° | elevation 45° | 64 px/tile | ${withEdge ? 'directional edge' : 'hard boundary'}`, 32, 46);
      return { dirt: dirtFrame.image, grass: grassFrame.image, tiles: 784 };
    }, { yaw, withEdge });
    const path = join(tmpdir(), `lockstate-oblique-dirt-grass-edge-${withEdge ? 'after' : 'before'}-yaw${yaw}.png`);
    await page.screenshot({ path });
    captures.push({ yaw, path, ...result });
  }
  console.log(JSON.stringify({ viewport: '1920x1080', captures }, null, 2));
} finally {
  await browser.close();
}
