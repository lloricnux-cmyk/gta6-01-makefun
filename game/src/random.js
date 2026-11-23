// A small seeded random number generator (mulberry32): the same seed gives the same
// city, traffic and screenshot scenes, which is what makes the shots repeatable.
// Everything in the game that needs chance goes through one of these helpers, so a
// replay of the same seed with the same inputs is a replay of the same game.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [min, max] from the seeded generator. */
export function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** A random float in [min, max) from the seeded generator. */
export function randomRange(random, min, max) {
  return min + random() * (max - min);
}

/** Pick one element of an array with the seeded generator. */
export function randomPick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/**
 * Pick one element of an array of [value, weight] pairs, weighted by the second
 * item. Used where some outcomes should be common and others rare — a jogger
 * among walkers, a tall building among low ones.
 */
export function weightedPick(random, pairs) {
  let total = 0;
  for (const [, weight] of pairs) total += weight;
  let roll = random() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/** Shuffle a copy of an array in place order, with the seeded generator. */
export function shuffle(random, array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Turn a short string into a stable 32-bit seed, for named scenes and tests. */
export function hashSeed(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between two numbers, t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function distance(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Pick n distinct elements of an array, in shuffled order, with the seeded
 * generator. Used where the city needs a spread of spots — package hides,
 * taxi stands, race rivals — without ever picking the same one twice. */
export function pickN(random, array, n) {
  const shuffled = shuffle(random, array);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Move an angle toward a target by at most `maxStep` radians, taking the
 * shortest way around. A steering helper for anything that chases a point —
 * race rivals, the getaway driver, a thug closing in. */
export function angleLerp(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

/** A random sign, +1 or -1, from the seeded generator. */
export function randSign(random) {
  return random() < 0.5 ? -1 : 1;
}

/** A random point inside a rectangle, from the seeded generator. */
export function randomPointInRect(random, x0, y0, x1, y1) {
  return {
    x: x0 + random() * (x1 - x0),
    y: y0 + random() * (y1 - y0),
  };
}

/** The bearing from one point to another, in radians. */
export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
