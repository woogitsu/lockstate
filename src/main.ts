import Phaser from 'phaser';
import {
  DEFAULT_KEYBOARD_BINDINGS,
  KeyboardInputAdapter,
  TouchGestureTracker,
} from './input';
import {
  tileRangeInBounds,
  visibleWorldBounds,
  zoomAtScreenPoint,
} from './rendering/camera';
import './styles.css';

class BootScene extends Phaser.Scene {
  private readonly keyboard = new KeyboardInputAdapter(
    DEFAULT_KEYBOARD_BINDINGS,
    () => ['world'],
  );
  private grid?: Phaser.GameObjects.Graphics;
  private lastGridSignature?: string;
  private readonly touchGestures = new TouchGestureTracker();
  private panPointerId: number | undefined;
  private lastPanScreenPoint: { readonly x: number; readonly y: number } | undefined;

  public constructor() {
    super('BootScene');
  }

  public create(): void {
    this.cameras.main.setBackgroundColor('#101317');
    this.grid = this.add.graphics();

    const keyDown = (event: KeyboardEvent): void => {
      this.keyboard.keyDown(event);
    };
    const keyUp = (event: KeyboardEvent): void => {
      this.keyboard.keyUp(event);
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
        const camera = this.cameras.main;
        const next = zoomAtScreenPoint(
          { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
          { x: pointer.x, y: pointer.y },
          camera.zoom * (deltaY > 0 ? 0.9 : 1.1),
          { min: 0.5, max: 3 },
        );
        camera.setZoom(next.zoom);
        camera.setScroll(next.scroll.x, next.scroll.y);
      },
    );

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        this.touchGestures.begin({ id: pointer.id, x: pointer.x, y: pointer.y });
        return;
      }
      if (pointer.button !== 1) return;
      this.panPointerId = pointer.id;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.wasTouch) {
        const gesture = this.touchGestures.move({ id: pointer.id, x: pointer.x, y: pointer.y });
        if (gesture?.kind === 'pan') {
          const camera = this.cameras.main;
          camera.scrollX -= gesture.deltaX / camera.zoom;
          camera.scrollY -= gesture.deltaY / camera.zoom;
        } else if (gesture?.kind === 'pinch') {
          const camera = this.cameras.main;
          const next = zoomAtScreenPoint(
            { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
            { x: gesture.centerX, y: gesture.centerY },
            camera.zoom * gesture.scale,
            { min: 0.5, max: 3 },
          );
          camera.setZoom(next.zoom);
          camera.setScroll(next.scroll.x, next.scroll.y);
        }
        return;
      }
      if (this.panPointerId !== pointer.id || this.lastPanScreenPoint === undefined) return;
      const camera = this.cameras.main;
      camera.scrollX -= (pointer.x - this.lastPanScreenPoint.x) / camera.zoom;
      camera.scrollY -= (pointer.y - this.lastPanScreenPoint.y) / camera.zoom;
      this.lastPanScreenPoint = { x: pointer.x, y: pointer.y };
    });
    const finishPointer = (pointer: Phaser.Input.Pointer): void => {
      if (pointer.wasTouch) {
        this.touchGestures.end(pointer.id);
        return;
      }
      if (this.panPointerId !== pointer.id) return;
      this.panPointerId = undefined;
      this.lastPanScreenPoint = undefined;
    };
    this.input.on('pointerup', finishPointer);
    this.input.on('pointerupoutside', finishPointer);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    });
    this.drawVisibleGrid();
  }

  public override update(_time: number, delta: number): void {
    const camera = this.cameras.main;
    const speed = 0.7 * delta / camera.zoom;
    const horizontal = Number(this.keyboard.isActive('camera.right')) - Number(this.keyboard.isActive('camera.left'));
    const vertical = Number(this.keyboard.isActive('camera.down')) - Number(this.keyboard.isActive('camera.up'));
    if (horizontal !== 0 || vertical !== 0) {
      camera.scrollX += horizontal * speed;
      camera.scrollY += vertical * speed;
    }
    this.drawVisibleGrid();
  }

  private drawVisibleGrid(): void {
    if (this.grid === undefined) return;
    const camera = this.cameras.main;
    const viewport = { width: camera.width, height: camera.height };
    const range = tileRangeInBounds(visibleWorldBounds(
      { scroll: { x: camera.scrollX, y: camera.scrollY }, zoom: camera.zoom },
      viewport,
    ));
    const signature = `${range.minX}:${range.maxX}:${range.minY}:${range.maxY}:${camera.zoom.toFixed(2)}`;
    if (signature === this.lastGridSignature) return;
    this.lastGridSignature = signature;
    this.grid.clear();
    this.grid.lineStyle(1 / camera.zoom, 0x2a333d, 0.8);
    for (let x = range.minX; x <= range.maxX; x += 1) {
      this.grid.lineBetween(x, range.minY, x, range.maxY);
    }
    for (let y = range.minY; y <= range.maxY; y += 1) {
      this.grid.lineBetween(range.minX, y, range.maxX, y);
    }
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
