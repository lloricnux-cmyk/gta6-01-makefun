// Solmar Bay itself: the road grid, the blocks and buildings in it, the park, the
// beach and ocean, the docks, and the named places the story uses. Everything is
// generated once from the seeded random generator, so the same seed builds the
// same city every time. All art is drawn from these rectangles at render time;
// there are no images and no network requests.
import { PALETTE, WORLD } from './config.js';
import { clamp, randomInt, randomPick } from './random.js';

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
};

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

/** Build the city: buildings per block, trees, and the landmark rectangles. */
export function buildCity(random) {
  const buildings = [];
  const trees = [];
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
      const count = downtown ? 1 + Math.floor(random() * 2) : 2 + Math.floor(random() * 3);
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
  return { buildings, trees };
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
