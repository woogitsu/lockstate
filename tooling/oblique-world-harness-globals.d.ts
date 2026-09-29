export {};

declare global {
  interface Window {
    lockstateObliqueWorldHarness: import('../tests/browser/oblique-world-harness').ObliqueWorldHarness;
  }
}
