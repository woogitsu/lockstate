import Phaser from 'phaser';
import { fetchObliqueModuleCatalog, selectObliqueModuleFrame, type ObliqueModuleCatalog } from '../rendering/assets/oblique-module-catalog';
import { registerObliqueModuleTextures } from '../rendering/phaser/oblique-module-textures';

const state = { yawRadians: 0, elevationRadians: Math.PI / 4 };
const status = document.getElementById('angle-status')!;
const controls = document.getElementById('angle-controls')!;

class PreviewScene extends Phaser.Scene {
  private catalog?: ObliqueModuleCatalog;
  private inspection?: Phaser.GameObjects.Image;
  private native?: Phaser.GameObjects.Image;

  constructor() { super('oblique-art-preview'); }

  async create(): Promise<void> {
    try {
      this.catalog = await fetchObliqueModuleCatalog();
      await registerObliqueModuleTextures(this, this.catalog);
      const initial = selectObliqueModuleFrame(this.catalog, state);
      this.inspection = this.add.image(610, 585, initial.image).setScale(3);
      this.native = this.add.image(1370, 585, initial.image);
      for (const [axis, angles] of [['yaw', this.catalog.yawDegrees], ['elevation', this.catalog.elevationDegrees]] as const) {
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
    if (!this.catalog || !this.inspection || !this.native) return;
    const frame = selectObliqueModuleFrame(this.catalog, state);
    this.inspection.setTexture(frame.image);
    this.native.setTexture(frame.image);
    status.textContent = `yaw ${frame.yawDegrees}° · elevation ${frame.elevationDegrees}° · ${frame.image}`;
    document.body.dataset.loadedFrame = frame.image;
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'preview-root', width: 1920, height: 1080,
  backgroundColor: '#344048', scene: [PreviewScene] });
