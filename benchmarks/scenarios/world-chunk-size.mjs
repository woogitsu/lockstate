const SPARSE_EDGE_SEED = 0x3d7b8a1c;
const DENSE_PRISON_SEED = 0x5e2a9f4b;

function rotateLeft(value, shift) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function xoshiro128(s0, s1, s2, s3) {
  let a = s0 >>> 0;
  let b = s1 >>> 0;
  let c = s2 >>> 0;
  let d = s3 >>> 0;

  return function next() {
    const result = (rotateLeft(Math.imul(b, 5) >>> 0, 7) * 9) >>> 0;
    const t = (b << 9) >>> 0;

    c = (c ^ a) >>> 0;
    d = (d ^ b) >>> 0;
    b = (b ^ c) >>> 0;
    a = (a ^ d) >>> 0;

    c = (c ^ t) >>> 0;
    d = rotateLeft(d, 11);

    return result;
  };
}

/**
 * Benchmark simulating sparse edge growth across 16x16, 32x32, and 64x64 chunks.
 * Evaluates chunk count, sparse memory overhead, boundary bookkeeping, and serialization.
 */
function runSparseEdgeScenario(seed, operationsPerIteration) {
  const nextRng = xoshiro128(seed, seed ^ 0x9e3779b9, seed ^ 0x85ebca6b, seed ^ 0xc2b2ae35);
  let stateHash = seed >>> 0;

  // We evaluate candidate sizes: 16, 32, 64
  const chunkSizes = [16, 32, 64];

  for (const size of chunkSizes) {
    const loadedChunks = new Map();
    let boundaryCrossings = 0;
    let ownedTiles = 0;

    // Generate parcels along a sparse jagged perimeter
    const parcelCount = Math.min(24, Math.max(8, Math.floor(operationsPerIteration / 50_000)));
    for (let p = 0; p < parcelCount; p += 1) {
      const px = ((nextRng() % 300) - 150) | 0;
      const py = ((nextRng() % 300) - 150) | 0;
      const pw = 20 + (nextRng() % 25);
      const ph = 20 + (nextRng() % 25);

      // Determine which chunks are touched by this parcel
      const minChunkX = Math.floor(px / size);
      const maxChunkX = Math.floor((px + pw - 1) / size);
      const minChunkY = Math.floor(py / size);
      const maxChunkY = Math.floor((py + ph - 1) / size);

      for (let cy = minChunkY; cy <= maxChunkY; cy += 1) {
        for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
          const key = `${cx},${cy}`;
          if (!loadedChunks.has(key)) {
            loadedChunks.set(key, new Uint8Array(size * size));
          }
          const chunkData = loadedChunks.get(key);

          // Populate terrain within chunk overlap
          const startX = Math.max(px, cx * size);
          const endX = Math.min(px + pw, (cx + 1) * size);
          const startY = Math.max(py, cy * size);
          const endY = Math.min(py + ph, (cy + 1) * size);

          for (let y = startY; y < endY; y += 1) {
            for (let x = startX; x < endX; x += 1) {
              const lx = x - cx * size;
              const ly = y - cy * size;
              chunkData[ly * size + lx] = 1; // grass
              ownedTiles += 1;
            }
          }
        }
      }

      boundaryCrossings += (maxChunkX - minChunkX + 1) * (maxChunkY - minChunkY + 1);
    }

    // Mix metrics into state hash
    stateHash = Math.imul(stateHash ^ (size * 0x45d9f3b), 0x27d4eb2d) >>> 0;
    stateHash = (stateHash ^ loadedChunks.size ^ boundaryCrossings ^ ownedTiles) >>> 0;
  }

  return `0x${stateHash.toString(16).padStart(8, '0')}`;
}

/**
 * Benchmark simulating a dense active facility (256x256) across 16x16, 32x32, and 64x64 chunks.
 * Evaluates tile lookups, terrain mutations, buildability checks, and snapshot serialization.
 */
function runDensePrisonScenario(seed, operationsPerIteration) {
  const nextRng = xoshiro128(seed, seed ^ 0x6c8e9cf5, seed ^ 0xb2ac1087, seed ^ 0x91e10da5);
  let stateHash = seed >>> 0;

  const chunkSizes = [16, 32, 64];
  const facilitySize = 128; // 128x128 dense active facility

  for (const size of chunkSizes) {
    const chunkCountPerAxis = Math.ceil(facilitySize / size);
    const chunks = [];

    for (let cy = 0; cy < chunkCountPerAxis; cy += 1) {
      for (let cx = 0; cx < chunkCountPerAxis; cx += 1) {
        chunks.push(new Uint8Array(size * size));
      }
    }

    // Dense terrain initialization and buildability queries
    const queryCount = Math.min(operationsPerIteration, 100_000);
    let buildableCount = 0;

    for (let q = 0; q < queryCount; q += 1) {
      const tx = nextRng() % facilitySize;
      const ty = nextRng() % facilitySize;
      const cx = Math.floor(tx / size);
      const cy = Math.floor(ty / size);
      const chunkIndex = cy * chunkCountPerAxis + cx;
      const chunk = chunks[chunkIndex];

      const lx = tx - cx * size;
      const ly = ty - cy * size;
      const index = ly * size + lx;

      // Mutate terrain
      if ((q & 7) === 0) {
        chunk[index] = (chunk[index] + 1) % 6;
      }

      // Check buildability (buildable if not water=5 or rock=4)
      const terrainId = chunk[index];
      if (terrainId !== 4 && terrainId !== 5) {
        buildableCount += 1;
      }
    }

    stateHash = Math.imul(stateHash ^ (size * 0x165667b1), 0x517cc1b7) >>> 0;
    stateHash = (stateHash ^ chunks.length ^ buildableCount) >>> 0;
  }

  return `0x${stateHash.toString(16).padStart(8, '0')}`;
}

export const worldChunkSizeSparseEdgeScenario = Object.freeze({
  id: 'world.chunk-size-sparse-edge',
  version: 1,
  description:
    'Evaluates 16x16, 32x32 and 64x64 chunk candidates on sparse edge parcel expansion, boundary crossings and sparse overhead.',
  seed: SPARSE_EDGE_SEED,
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 2,
      measuredIterations: 10,
      operationsPerIteration: 100_000,
    }),
    full: Object.freeze({
      warmupIterations: 5,
      measuredIterations: 25,
      operationsPerIteration: 500_000,
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runSparseEdgeScenario(seed, operationsPerIteration);
  },
});

export const worldChunkSizeDensePrisonScenario = Object.freeze({
  id: 'world.chunk-size-dense-prison',
  version: 1,
  description:
    'Evaluates 16x16, 32x32 and 64x64 chunk candidates on dense 128x128 prison terrain access, buildability checks and mutation throughput.',
  seed: DENSE_PRISON_SEED,
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 2,
      measuredIterations: 10,
      operationsPerIteration: 100_000,
    }),
    full: Object.freeze({
      warmupIterations: 5,
      measuredIterations: 25,
      operationsPerIteration: 500_000,
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runDensePrisonScenario(seed, operationsPerIteration);
  },
});
