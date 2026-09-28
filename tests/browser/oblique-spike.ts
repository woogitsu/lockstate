import Phaser from 'phaser';
import { changeObliquePoseAtScreenPoint, groundToScreen, screenToGround, type ObliqueCameraState } from '../../src/rendering/camera/oblique-projection';
import { obliqueDepthForAnchor, projectedTileQuad, projectedWallPrism } from '../../src/rendering/camera/oblique-geometry';
import { TILE_SIZE_PX, worldToTile } from '../../src/rendering/tile-metrics';
import type { Point } from '../../src/rendering/camera/coordinates';

export interface ObliqueSpikeHarness {
  ready(): Promise<void>;
  setPose(yawDegrees: number, elevationDegrees: number): Promise<void>;
  screenPointForTile(tileX: number, tileY: number): Point;
  selection(): { tileX: number; tileY: number } | undefined;
  pose(): { yawDegrees: number; elevationDegrees: number };
}

declare global {
  interface Window {
    lockstateObliqueSpike: ObliqueSpikeHarness;
  }
}

/** A disposable real-Phaser cell spike; this is not the production WorldScene. */
class ObliqueSpikeScene extends Phaser.Scene {
  public booted: Promise<void>;
  private resolveBooted!: () => void;
  private graphics!: Phaser.GameObjects.Graphics;
  private cameraPose!: ObliqueCameraState;
  private selected: { tileX: number; tileY: number } | undefined;

  public constructor() {
    super({ key: 'oblique-spike' });
    this.booted = new Promise<void>((resolve) => { this.resolveBooted = resolve; });
  }

  public create(): void {
    this.graphics = this.add.graphics().setScrollFactor(0);
    this.cameraPose = {
      target: { x: 2 * TILE_SIZE_PX, y: 2 * TILE_SIZE_PX },
      viewport: { width: this.cameras.main.width, height: this.cameras.main.height },
      zoom: 2.2,
      yawRadians: 0,
      elevationRadians: Math.PI / 4,
    };
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const ground = screenToGround({ x: pointer.x, y: pointer.y }, this.cameraPose);
      this.selected = { tileX: worldToTile(ground.x), tileY: worldToTile(ground.y) };
      this.draw();
    });
    this.draw();
    this.resolveBooted();
  }

  public get picked(): { tileX: number; tileY: number } | undefined { return this.selected; }
  public get poseState(): ObliqueCameraState { return this.cameraPose; }

  public async setPose(yawDegrees: number, elevationDegrees: number): Promise<void> {
    this.cameraPose = changeObliquePoseAtScreenPoint(
      { ...this.cameraPose, viewport: { width: this.cameras.main.width, height: this.cameras.main.height } },
      { x: this.cameras.main.width / 2, y: this.cameras.main.height / 2 },
      yawDegrees * Math.PI / 180,
      elevationDegrees * Math.PI / 180,
    );
    this.draw();
    await new Promise<void>((resolve) => { this.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve()); });
  }

  private fillPolygon(points: readonly Point[], color: number): void {
    const graphics = this.graphics;
    graphics.fillStyle(color, 1);
    graphics.beginPath();
    graphics.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.closePath();
    graphics.fillPath();
  }

  private drawWall(tileX: number, tileY: number, short: boolean): void {
    const wall = projectedWallPrism(tileX, tileY, short ? 0.52 : 2.5, this.cameraPose);
    const base = wall.footprint;
    const top = wall.top;
    for (let side = 0; side < 4; side += 1) {
      const next = (side + 1) % 4;
      this.fillPolygon([base[side]!, base[next]!, top[next]!, top[side]!], short ? 0x9c765d : 0x765344);
    }
    this.fillPolygon(top, short ? 0xd5b993 : 0xc3b5a0);
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    for (let y = -2; y <= 6; y += 1) {
      for (let x = -2; x <= 6; x += 1) {
        const selected = this.selected?.tileX === x && this.selected.tileY === y;
        const insideCell = x >= 0 && x <= 3 && y >= 0 && y <= 3;
        this.fillPolygon(projectedTileQuad(x, y, this.cameraPose), selected ? 0xd5b35d : insideCell ? 0xaaa392 : 0x6d6d67);
      }
    }

    const walls: Array<{ x: number; y: number }> = [];
    for (let x = -1; x <= 4; x += 1) {
      walls.push({ x, y: -1 });
      if (x !== 2) walls.push({ x, y: 4 });
    }
    for (let y = 0; y <= 3; y += 1) {
      walls.push({ x: -1, y });
      walls.push({ x: 4, y });
    }
    const roomCentre = { x: 2 * TILE_SIZE_PX, y: 2 * TILE_SIZE_PX };
    const roomDepth = obliqueDepthForAnchor(roomCentre, this.cameraPose.yawRadians);
    const drawable = [
      ...walls.map(({ x, y }) => ({
        kind: 'wall' as const,
        x, y,
        depth: obliqueDepthForAnchor({ x: (x + 0.5) * TILE_SIZE_PX, y: (y + 0.5) * TILE_SIZE_PX }, this.cameraPose.yawRadians),
      })),
      { kind: 'actor' as const, x: 1, y: 1, depth: obliqueDepthForAnchor({ x: 1.5 * TILE_SIZE_PX, y: 1.5 * TILE_SIZE_PX }, this.cameraPose.yawRadians) },
    ].sort((a, b) => a.depth - b.depth);
    for (const item of drawable) {
      if (item.kind === 'wall') {
        this.drawWall(item.x, item.y, item.depth > roomDepth);
      } else {
        const foot = groundToScreen({ x: 1.5 * TILE_SIZE_PX, y: 1.5 * TILE_SIZE_PX }, this.cameraPose);
        const head = groundToScreen({ x: 1.5 * TILE_SIZE_PX, y: 1.5 * TILE_SIZE_PX, z: 48 }, this.cameraPose);
        g.lineStyle(22, 0xde8545, 1);
        g.lineBetween(head.x, head.y + 12, foot.x, foot.y);
        g.fillStyle(0xffbb78, 1);
        g.fillCircle(head.x, head.y, 13);
      }
    }
  }
}

const scene = new ObliqueSpikeScene();
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'oblique-spike-root',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#252523',
  scene: [scene],
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, roundPixels: false, pixelArt: false },
});

window.lockstateObliqueSpike = {
  ready: () => scene.booted,
  setPose: (yaw, elevation) => scene.setPose(yaw, elevation),
  screenPointForTile: (x, y) => groundToScreen({ x: (x + 0.5) * TILE_SIZE_PX, y: (y + 0.5) * TILE_SIZE_PX }, scene.poseState),
  selection: () => scene.picked,
  pose: () => ({ yawDegrees: scene.poseState.yawRadians * 180 / Math.PI, elevationDegrees: scene.poseState.elevationRadians * 180 / Math.PI }),
};
