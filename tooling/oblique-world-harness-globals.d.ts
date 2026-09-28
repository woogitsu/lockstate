export {};

declare global {
  interface Window {
    lockstateObliqueWorldHarness: {
      ready(): Promise<void>;
      pointAtTile(x: number, y: number): { x: number; y: number };
      setPose(yawDegrees: number, elevationDegrees: number): void;
      cutawayWallIds(): string[];
      artTextureKeys(): string[];
    };
  }
}
