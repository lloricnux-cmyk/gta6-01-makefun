// Solmar Bay itself: the road grid, the blocks and buildings in it, the park, the
// beach and ocean, the docks, the marina piers, and the named places the story
// uses. Everything is generated once from the seeded random generator, so the
// same seed builds the same city every time. All art is drawn from these
// rectangles at render time; there are no images and no network requests.
import { PALETTE, WORLD } from './config.js';
import { clamp, randomInt, randomPick, weightedPick } from './random.js';

export const PLACES = {
  // Starfish Club (Mara's place), on the downtown boulevard.
  club: { x: 1520, y: 760, label: 'Starfish Club' },
  // The docks, west side.
  docks: { x: 240, y: 1840, label: 'The Docks' },
  // Beach parking lot with the red Comet GT.
  beachLot: { x: 2480, y: 2000, label: 'Beach Lot' },
  // Chop shop, north-east.
  chopShop: { x: 2800, y: 240, label: 'Chop Shop' },
  // Los Diablos warehouse, west side.
  warehouse: { x: 560, y: 1520, label: 'Warehouse' },
  // Hospital, for respawns.
  hospital: { x: 880, y: 560, label: 'Solmar General' },
  // The park block.
  park: { x: 1040, y: 1040, label: 'Palm Park' },
  // The marina, south-east, where mission 4 ends.
  marina: { x: 2800, y: 2020, label: 'The Marina' },
  // Solmar Trust, the bank mission 5 hits, on the north-east boulevard.
  bank: { x: 2160, y: 560, label: 'Solmar Trust' },
  // The street race starts on the downtown boulevard.
  raceStart: { x: 1520, y: 1520, label: 'Race Start' },
};

/** The named districts, for the HUD's "you are here" line. */
export const DISTRICTS = [
  { name: 'Harbor', x0: 0, y0: 0, x1: 400, y1: WORLD.height },
  { name: 'Downtown', x0: 1200, y0: 560, x1: 2160, y1: 1520 },
  { name: 'Palm Park', x0: 880, y0: 880, x1: 1200, y1: 1200 },
  { name: 'Beachfront', x0: 0, y0: WORLD.beachY, x1: WORLD.width, y1: WORLD.height },
  { name: 'Northside', x0: 0, y0: 0, x1: WORLD.width, y1: 560 },
  { name: 'Old Town', x0: 0, y0: 0, x1: WORLD.width, y1: WORLD.height },
];

/** Which district a point is in. Checked in order, so the small ones win. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solmar Bay';
}

/** Is this block the park? The park sits between the 880/1200 roads, both ways. */
function isParkBlock(ix, iy) {
  return WORLD.roadsX[ix] === 880 && WORLD.roadsY[iy] === 880;
}

/** Is this block downtown (tall buildings)? The core around the 1520/1200 crossing. */
function isDowntown(ix, iy) {
  const x = WORLD.roadsX[ix];
  const y = WORLD.roadsY[iy];
  return x >= 1200 && x <= 2160 && y >= 560 && y <= 1520;
}

/** Build the city: buildings per block, trees, and the marina piers. */
export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const piers = [];
  const lamps = [];
  const stalls = [];
  const fishing = [];
  const half = WORLD.roadHalf + WORLD.sidewalk;
  for (let ix = 0; ix < WORLD.roadsX.length - 1; ix += 1) {
    for (let iy = 0; iy < WORLD.roadsY.length - 1; iy += 1) {
      const x0 = WORLD.roadsX[ix] + half;
      const y0 = WORLD.roadsY[iy] + half;
      const x1 = WORLD.roadsX[ix + 1] - half;
      const y1 = WORLD.roadsY[iy + 1] - half;
      if (y0 >= WORLD.beachY) continue;
      if (isParkBlock(ix, iy)) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({
            x: x0 + 20 + random() * (x1 - x0 - 40),
            y: y0 + 20 + random() * (y1 - y0 - 40),
            r: 9 + random() * 7,
          });
        }
        continue;
      }
      const downtown = isDowntown(ix, iy);
      // Downtown gets one tall tower or two; the suburbs get a scatter of low
      // shops and houses, so the skyline reads as a real city, not a grid of boxes.
      const count = downtown
        ? weightedPick(random, [[1, 3], [2, 1]])
        : randomInt(random, 2, 4);
      for (let b = 0; b < count; b += 1) {
        const w = 60 + random() * 110;
        const h = 50 + random() * 90;
        const x = x0 + 8 + random() * Math.max(1, x1 - x0 - w - 16);
        const y = y0 + 8 + random() * Math.max(1, y1 - y0 - h - 16);
        const color = downtown
          ? randomPick(random, PALETTE.buildingDowntown)
          : randomPick(random, PALETTE.building);
        buildings.push({
          x,
          y,
          w,
          h,
          color,
          height: downtown ? 26 + random() * 34 : 8 + random() * 16,
          roof: random() < 0.5,
        });
      }
      if (random() < 0.5) {
        trees.push({
          x: x0 + 12 + random() * (x1 - x0 - 24),
          y: y0 + 12 + random() * (y1 - y0 - 24),
          r: 8 + random() * 5,
        });
      }
    }
  }
  // The strip between the last road and the beach: low buildings, so the
  // southern fringe is a neighbourhood, not empty grass.
  {
    const y0 = WORLD.roadsY[WORLD.roadsY.length - 1] + half;
    const y1 = WORLD.beachY - 10;
    for (let ix = 0; ix < WORLD.roadsX.length - 1; ix += 1) {
      const x0 = WORLD.roadsX[ix] + half;
      const x1 = WORLD.roadsX[ix + 1] - half;
      const count = 2 + Math.floor(random() * 2);
      for (let b = 0; b < count; b += 1) {
        const w = 60 + random() * 90;
        const h = 40 + random() * 60;
        const x = x0 + 8 + random() * Math.max(1, x1 - x0 - w - 16);
        const y = y0 + 8 + random() * Math.max(1, y1 - y0 - h - 16);
        buildings.push({
          x, y, w, h,
          color: randomPick(random, PALETTE.building),
          height: 6 + random() * 10,
          roof: random() < 0.5,
        });
      }
    }
  }
  // Palm trees along the beach.
  for (let x = 160; x < WORLD.width - 100; x += 90 + random() * 60) {
    trees.push({ x, y: WORLD.beachY + 30 + random() * 50, r: 10, palm: true });
  }
  // The marina: three wooden piers reaching into the ocean off the beach lot,
  // with a couple of moored boats drawn as hulls at render time.
  for (let i = 0; i < 3; i += 1) {
    const px = 2560 + i * 170;
    piers.push({ x: px, y: WORLD.oceanY - 10, w: 26, h: 150 });
    // A fisherman stands at the end of each pier, rod over the water.
    fishing.push({ x: px + 13, y: WORLD.oceanY + 128, phase: random() * Math.PI * 2 });
  }
  // Street lamps along the roads: one at every other crossing, so the night
  // has pools of light instead of one flat veil. The renderer lights them
  // after dark; the list is built once, here, from the seeded generator.
  for (let ix = 0; ix < WORLD.roadsX.length; ix += 1) {
    for (let iy = 0; iy < WORLD.roadsY.length; iy += 1) {
      if ((ix + iy) % 2 !== 0) continue;
      if (WORLD.roadsY[iy] >= WORLD.beachY) continue;
      lamps.push({
        x: WORLD.roadsX[ix] + WORLD.roadHalf + WORLD.sidewalk + 4,
        y: WORLD.roadsY[iy] - WORLD.roadHalf - WORLD.sidewalk - 4,
      });
    }
  }
  // Street vendors: a fruit cart at the park, a snack cart on the beach, and
  // a flower stall by the marina. They stand still all day; the renderer
  // draws their carts and awnings, and they give the sidewalks a reason to
  // be busy beyond the walking crowd.
  stalls.push(
    { x: 1000, y: 1000, goods: 'fruit', label: 'Fruit Cart' },
    { x: 1200, y: 2120, goods: 'snacks', label: 'Snack Cart' },
    { x: 2620, y: 1980, goods: 'flowers', label: 'Flower Stall' },
  );
  return { buildings, trees, piers, lamps, stalls, fishing };
}

/**
 * Where the twenty hidden packages are tucked: a hand-picked list of quiet
 * corners — park edges, the beach, the docks, the marina, alleys behind the
 * downtown towers — shuffled with the seeded generator so the same seed hides
 * them in the same places every time.
 */
export function buildPackageSpots(random) {
  const candidates = [
    { x: 920, y: 920 }, { x: 1160, y: 920 }, { x: 920, y: 1160 }, { x: 1160, y: 1160 },
    { x: 300, y: 2100 }, { x: 700, y: 2140 }, { x: 1500, y: 2100 }, { x: 2100, y: 2130 },
    { x: 2700, y: 2100 }, { x: 300, y: 1900 }, { x: 260, y: 1700 }, { x: 480, y: 1900 },
    { x: 2600, y: 1900 }, { x: 2900, y: 1900 }, { x: 600, y: 600 }, { x: 1300, y: 300 },
    { x: 2000, y: 300 }, { x: 2600, y: 600 }, { x: 300, y: 900 }, { x: 600, y: 1200 },
    { x: 2500, y: 1200 }, { x: 1300, y: 1700 }, { x: 2000, y: 1700 }, { x: 900, y: 1900 },
    { x: 1700, y: 600 }, { x: 2400, y: 900 }, { x: 400, y: 300 }, { x: 2900, y: 1200 },
  ];
  const picked = [];
  const order = [];
  for (let i = 0; i < candidates.length; i += 1) order.push(i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (let i = 0; i < 20; i += 1) picked.push(candidates[order[i]]);
  return picked;
}

/** The nearest road centre line to a point, and which axis it runs on. */
export function nearestRoad(x, y) {
  let bestX = WORLD.roadsX[0];
  let bestXd = Infinity;
  for (const rx of WORLD.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestXd) {
      bestXd = d;
      bestX = rx;
    }
  }
  let bestY = WORLD.roadsY[0];
  let bestYd = Infinity;
  for (const ry of WORLD.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestYd) {
      bestYd = d;
      bestY = ry;
    }
  }
  return bestXd < bestYd ? { axis: 'y', line: bestX } : { axis: 'x', line: bestY };
}

/** Is a point on a road (asphalt), not on a block? */
export function onRoad(x, y) {
  if (y >= WORLD.beachY) return false;
  for (const rx of WORLD.roadsX) if (Math.abs(x - rx) <= WORLD.roadHalf) return true;
  for (const ry of WORLD.roadsY) if (Math.abs(y - ry) <= WORLD.roadHalf) return true;
  return false;
}

/** Is a point inside any building? Returns the building or null. */
export function buildingAt(buildings, x, y) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps; returns true if it hit one. */
export function collideBuildings(buildings, body, radius) {
  let hit = false;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = clamp(body.x, b.x, b.x + b.w);
    const cy = clamp(body.y, b.y, b.y + b.h);
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        body.x = cx + (dx / d) * radius;
        body.y = cy + (dy / d) * radius;
      } else {
        body.x = b.x - radius;
      }
    }
  }
  return hit;
}

/** The park rectangle, for the renderer. */
export function parkRect() {
  const half = WORLD.roadHalf + WORLD.sidewalk;
  return {
    x: 880 + half,
    y: 880 + half,
    w: 1200 - 880 - half * 2,
    h: 1200 - 880 - half * 2,
  };
}
