import Phaser from 'phaser';
import { selectObliqueModuleFrame, type ObliqueModuleCatalog } from '../rendering/assets/oblique-module-catalog';
import { fetchObliqueModuleSet } from '../rendering/assets/oblique-module-registry';
import { registerObliqueModuleTextures } from '../rendering/phaser/oblique-module-textures';

const state = { yawRadians: 0, elevationRadians: Math.PI / 4 };
const status = document.getElementById('angle-status')!;
const controls = document.getElementById('angle-controls')!;

class PreviewScene extends Phaser.Scene {
  private catalogs?: Map<string, ObliqueModuleCatalog>;
  private assetId = 'wall.interior.module.full';
  private inspection?: Phaser.GameObjects.Image;
  private native?: Phaser.GameObjects.Image;

  constructor() { super('oblique-art-preview'); }

  async create(): Promise<void> {
    try {
      this.catalogs = await fetchObliqueModuleSet();
      for (const catalog of this.catalogs.values()) await registerObliqueModuleTextures(this, catalog);
      const initialCatalog = this.catalogs.get(this.assetId);
      if (!initialCatalog) throw new Error(`Missing preview module ${this.assetId}`);
      const initial = selectObliqueModuleFrame(initialCatalog, state);
      this.inspection = this.add.image(610, 585, initial.image).setScale(3);
      this.native = this.add.image(1370, 585, initial.image);
      const moduleRow = document.createElement('div');
      moduleRow.textContent = 'module: ';
      for (const assetId of this.catalogs.keys()) {
        const button = document.createElement('button');
        button.textContent = assetId;
        button.dataset.assetId = assetId;
        button.style.margin = '4px';
        button.onclick = () => { this.assetId = assetId; this.showSelectedFrame(); };
        moduleRow.append(button);
      }
      controls.append(moduleRow);
      for (const [axis, angles] of [['yaw', initialCatalog.yawDegrees], ['elevation', initialCatalog.elevationDegrees]] as const) {
        const row = document.createElement('div');
        row.textContent = `${axis}: `;
        for (const angle of angles) {
          const button = document.createElement('button');
          button.textContent = `${angle}°`;
          button.dataset.axis = axis;
          button.dataset.angle = String(angle);
          button.style.margin = '4px';
          button.onclick = () => {
            state[axis === 'yaw' ? 'yawRadians' : 'elevationRadians'] = angle * Math.PI / 180;
            this.showSelectedFrame();
          };
          row.append(button);
        }
        controls.append(row);
      }
      this.showSelectedFrame();
    } catch (error) {
      status.textContent = `Preview load failed: ${String(error)}`;
      throw error;
    }
  }

  private showSelectedFrame(): void {
    if (!this.catalogs || !this.inspection || !this.native) return;
    const catalog = this.catalogs.get(this.assetId);
    if (!catalog) throw new Error(`Missing preview module ${this.assetId}`);
    const frame = selectObliqueModuleFrame(catalog, state);
    this.inspection.setTexture(frame.image);
    this.native.setTexture(frame.image);
    status.textContent = `${this.assetId} · yaw ${frame.yawDegrees}° · elevation ${frame.elevationDegrees}° · ${frame.image}`;
    document.body.dataset.loadedFrame = frame.image;
    document.body.dataset.loadedAsset = this.assetId;
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'preview-root', width: 1920, height: 1080,
  backgroundColor: '#344048', scene: [PreviewScene] });
