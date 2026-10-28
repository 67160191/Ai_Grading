/**
 * Simple deterministic Mulberry32 Pseudo-Random Number Generator (PRNG)
 * @param {number} seed
 * @returns {() => number} returns float in range [0, 1)
 */
export function createSeededRandom(seed) {
  let s = Math.floor(Math.abs(seed)) || 123456789;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffle an array with a seed using Fisher-Yates algorithm.
 * Returns a new shuffled array without mutating the input array.
 * @param {Array} array
 * @param {number} seed
 * @returns {Array}
 */
export function seededShuffle(array, seed) {
  if (!Array.isArray(array) || array.length <= 1) return array ? [...array] : [];
  const rng = createSeededRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

