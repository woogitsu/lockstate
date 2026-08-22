import Phaser from 'phaser';
import './styles.css';

class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public create(): void {
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#101317');

    this.add
      .text(width / 2, height / 2 - 24, 'LOCKSTATE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#f1f4f7',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 24, 'Production foundation initialized', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#a9b2bb',
      })
      .setOrigin(0.5);
  }
}

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#101317',
  scene: [BootScene],
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    pixelArt: false,
  },
};

new Phaser.Game(gameConfig);
