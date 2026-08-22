const ENTITY_SOA_SEED = 0x82f1b4a3;

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

class EntityStore {
  constructor(capacity) {
    this.capacity = capacity;
    this.generations = new Uint16Array(capacity);
    this.freeIndices = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.freeCount = 0;
    this.nextAvailableIndex = 0;
    this.maxActiveIndex = -1;
  }

  spawn() {
    let index;
    if (this.freeCount > 0) {
      this.freeCount--;
      index = this.freeIndices[this.freeCount];
    } else {
      index = this.nextAvailableIndex++;
    }

    if (index > this.maxActiveIndex) {
      this.maxActiveIndex = index;
    }

    this.alive[index] = 1;
    const generation = this.generations[index];
    return (index & 0x000fffff) | ((generation << 20) & 0xfff00000);
  }

  destroy(id) {
    const index = id & 0x000fffff;
    this.generations[index] = (this.generations[index] + 1) & 0xfff;
    this.alive[index] = 0;
    this.freeIndices[this.freeCount++] = index;
  }
}

class ComponentBitset {
  constructor(capacity) {
    this.masks = new Uint32Array(capacity);
  }
  add(index, compId) {
    this.masks[index] |= 1 << compId;
  }
  hasAll(index, mask) {
    return (this.masks[index] & mask) === mask;
  }
}

function runEntitySoaScenario(seed, operationsPerIteration) {
  // operationsPerIteration maps to number of entities for this scenario
  const nextRng = xoshiro128(seed, seed ^ 0x6c8e9cf5, seed ^ 0xb2ac1087, seed ^ 0x91e10da5);
  
  const entitiesCount = operationsPerIteration;
  const store = new EntityStore(entitiesCount * 2);
  const bitset = new ComponentBitset(entitiesCount * 2);
  const transformX = new Float32Array(entitiesCount * 2);
  const transformY = new Float32Array(entitiesCount * 2);
  
  const activeIds = [];

  // Spawn phase
  for (let i = 0; i < entitiesCount; i++) {
    const id = store.spawn();
    const index = id & 0x000fffff;
    bitset.add(index, 0); // Component 0 = Transform
    transformX[index] = (nextRng() % 1000) / 10.0;
    transformY[index] = (nextRng() % 1000) / 10.0;
    activeIds.push(id);
  }

  let stateHash = seed >>> 0;
  const ticks = 10;
  const queryMask = 1; // Component 0
  
  for (let t = 0; t < ticks; t++) {
    let tickSum = 0;
    const maxActive = store.maxActiveIndex;

    // Deterministic query & update
    for (let index = 0; index <= maxActive; index++) {
      if (store.alive[index] === 1 && bitset.hasAll(index, queryMask)) {
        // Move system
        transformX[index] += 1.0;
        transformY[index] += 1.0;
        
        tickSum = (tickSum + (transformX[index] * 10 | 0) + (transformY[index] * 10 | 0)) >>> 0;
      }
    }

    // Deterministic destroy and spawn
    const destroyCount = Math.floor(entitiesCount * 0.05); // 5% churn per tick
    for (let i = 0; i < destroyCount; i++) {
      const activeIdx = nextRng() % activeIds.length;
      const idToDestroy = activeIds[activeIdx];
      if (idToDestroy !== undefined) {
        store.destroy(idToDestroy);
        activeIds[activeIdx] = undefined; // leave hole for simplicity
      }
    }

    for (let i = 0; i < destroyCount; i++) {
      const id = store.spawn();
      const index = id & 0x000fffff;
      bitset.add(index, 0);
      transformX[index] = (nextRng() % 1000) / 10.0;
      transformY[index] = (nextRng() % 1000) / 10.0;
      activeIds.push(id);
    }
    
    // cleanup undefined holes every tick to keep random index selection stable
    let writeIdx = 0;
    for (let i = 0; i < activeIds.length; i++) {
      if (activeIds[i] !== undefined) {
        activeIds[writeIdx++] = activeIds[i];
      }
    }
    activeIds.length = writeIdx;

    stateHash = Math.imul(stateHash ^ tickSum, 0x517cc1b7) >>> 0;
  }

  return `0x${stateHash.toString(16).padStart(8, '0')}`;
}

export const entitySoaScenario = Object.freeze({
  id: 'entity.soa.benchmark',
  version: 1,
  description:
    'Evaluates the hand-rolled Structure-of-Arrays (SoA) Entity Component System throughput for spawn, destroy, and deterministic iterations.',
  seed: ENTITY_SOA_SEED,
  profiles: Object.freeze({
    smoke: Object.freeze({
      warmupIterations: 2,
      measuredIterations: 10,
      operationsPerIteration: 250, // 250 entities
    }),
    full: Object.freeze({
      warmupIterations: 5,
      measuredIterations: 25,
      operationsPerIteration: 5000, // 5000 entities
    }),
  }),
  run({ seed, operationsPerIteration }) {
    return runEntitySoaScenario(seed, operationsPerIteration);
  },
});
