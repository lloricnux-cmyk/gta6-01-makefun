// The two extra rides: motorbikes and delivery trucks. Both are ordinary cars
// as far as the world is concerned — they sit in state.cars, they can be
// stolen, driven, crashed and destroyed — but each carries its own shape and
// handling, so a bike feels nothing like a truck.
//
// A bike is narrow and quick: it accelerates hard, tops out faster than any
// car in the city, and folds at the first solid hit. A truck is the opposite:
// slow off the line and slow at the top, but it shrugs off collisions that
// would total a sedan, and it pushes traffic out of its way. Both are parked
// around the city at reset, never in traffic, so the player finds them by
// exploring rather than by waiting for one to drive past.
import { PALETTE, VEHICLES, WORLD } from './config.js';
import { clamp, randomPick } from './random.js';

/** The shape of a car object, as the world makes them. A special vehicle is
 * the same shape with its own length, width, acceleration and health, so the
 * driving, collision and police code never has to know which kind it holds. */
export function makeSpecialCar(kind, x, y, angle, random) {
  const spec = VEHICLES[kind];
  return {
    kind,
    x,
    y,
    angle,
    speed: 0,
    color: spec.color,
    health: spec.health,
    maxSpeed: spec.maxSpeed,
    accel: spec.accel,
    length: spec.length,
    width: spec.width,
    steerRate: spec.steerRate,
    axis: 'y',
    dir: 1,
    line: x,
    lane: 16,
    occupied: false,
    driverFled: true,
    ramTimer: 0,
    hitTimer: 0,
    smokeTimer: 0,
    waitTimer: 0,
    overtake: false,
    overtakeTimer: 0,
    overtakeFrom: 0,
    forceTurn: false,
    hornBoost: 0,
    dead: false,
  };
}

/** Where a special vehicle parks: on a roadside, clear of the lanes, facing
 * along the road it sits beside. A bike tucks against the kerb; a truck takes
 * the wider verge. The spots are picked with the seeded generator, so the
 * same seed parks the same rides in the same places. */
function parkSpot(random, wide) {
  const axis = random() < 0.5 ? 'y' : 'x';
  const line = axis === 'y' ? randomPick(random, WORLD.roadsX) : randomPick(random, WORLD.roadsY);
  const dir = random() < 0.5 ? 1 : -1;
  const along = axis === 'y'
    ? 200 + random() * (WORLD.height - 560)
    : 200 + random() * (WORLD.width - 560);
  const off = wide ? 30 : 26;
  const x = axis === 'y' ? line + (dir === 1 ? off : -off) : along;
  const y = axis === 'y' ? along : line + (dir === 1 ? off : -off);
  const angle = axis === 'y' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI);
  return { x, y, angle, axis, line, dir };
}

/** Park the specials: three bikes and two trucks, scattered across the city.
 * Called from the world's reset, after the ordinary parked cars. */
export function parkSpecialVehicles(random, state) {
  const spots = [];
  for (let i = 0; i < 3; i += 1) {
    const spot = parkSpot(random, false);
    if (spot.y > WORLD.beachY - 60) continue;
    const bike = makeSpecialCar('bike', spot.x, spot.y, spot.angle, random);
    bike.axis = spot.axis;
    bike.line = spot.line;
    bike.dir = spot.dir;
    bike.lane = spot.dir === 1 ? 26 : -26;
    state.cars.push(bike);
    spots.push(bike);
  }
  for (let i = 0; i < 2; i += 1) {
    const spot = parkSpot(random, true);
    if (spot.y > WORLD.beachY - 60) continue;
    const truck = makeSpecialCar('truck', spot.x, spot.y, spot.angle, random);
    truck.axis = spot.axis;
    truck.line = spot.line;
    truck.dir = spot.dir;
    truck.lane = spot.dir === 1 ? 30 : -30;
    state.cars.push(truck);
    spots.push(truck);
  }
  return spots;
}

/** The steering a special vehicle answers with: bikes turn sharper than cars,
 * trucks turn lazier. The world reads this off the car when it drives. */
export function steerRateOf(car) {
  if (car.kind === 'bike' || car.kind === 'truck') return car.steerRate || 2.6;
  return 2.6;
}

/** The collision radius a special vehicle presents: half its length, so a
 * truck is harder to push around than a bike. Ordinary cars keep the old 24. */
export function collisionRadiusOf(car) {
  if (car.kind === 'bike') return 18;
  if (car.kind === 'truck') return 34;
  return 24;
}

/** Draw a bike: two wheels, a narrow frame, a rider's lean. Drawn in the
 * car's own angle, like every other car shape in the game. */
function drawBike(ctx, car, time) {
  const len = 34;
  const wid = 14;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(3, 4, len / 2, wid / 2 + 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wheels.
  ctx.fillStyle = '#16181c';
  ctx.beginPath();
  ctx.arc(-len / 2 + 4, 0, 6, 0, Math.PI * 2);
  ctx.arc(len / 2 - 4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  // Frame and tank.
  ctx.fillStyle = car.color;
  ctx.fillRect(-len / 2 + 2, -wid / 2 + 2, len - 4, wid - 4);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-4, -wid / 2 + 3, 10, wid - 6);
  // Headlight.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(len / 2 - 2, -3, 3, 6);
  ctx.restore();
}

/** Draw a truck: a long cargo box with a cab up front, in the company's
 * brown, with a pale stripe along the box so it reads at a glance. */
function drawTruck(ctx, car, time) {
  const len = 72;
  const wid = 30;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
  // Cargo box.
  ctx.fillStyle = car.color;
  ctx.fillRect(-len / 2, -wid / 2, len - 18, wid);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-len / 2 + 4, -wid / 2 + 4, len - 26, 5);
  ctx.fillRect(-len / 2 + 4, wid / 2 - 9, len - 26, 5);
  // Cab.
  ctx.fillStyle = '#d8d3c8';
  ctx.fillRect(len / 2 - 18, -wid / 2, 18, wid);
  ctx.fillStyle = 'rgba(10,16,28,0.85)';
  ctx.fillRect(len / 2 - 14, -wid / 2 + 4, 8, wid - 8);
  // Headlights and taillights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 5);
  ctx.fillRect(len / 2 - 3, wid / 2 - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
  ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
  ctx.restore();
}

/** Draw a special vehicle. The renderer calls this for bikes and trucks and
 * keeps its own car shape for everything else. */
export function drawVehicleShape(ctx, car, state) {
  if (car.kind === 'bike') drawBike(ctx, car, state.time);
  else if (car.kind === 'truck') drawTruck(ctx, car, state.time);
}

/** A one-line label for the HUD's speed readout: what the player is driving. */
export function vehicleLabel(car) {
  if (!car) return '';
  if (car.kind === 'bike') return 'BIKE';
  if (car.kind === 'truck') return 'TRUCK';
  if (car.kind === 'sports') return 'COMET GT';
  if (car.kind === 'police') return 'POLICE';
  return 'CAR';
}

/** How much a special vehicle is worth as a target: bikes are worth less to
 * steal quietly, trucks are worth more, because the truck shrugs off a chase.
 * The world does not use this yet; the phone's stats screen shows it. */
export function vehicleValue(kind) {
  if (kind === 'bike') return 150;
  if (kind === 'truck') return 400;
  if (kind === 'sports') return 1200;
  return 100;
}

/** Clamp a special vehicle's speed to its own limits, not the car's. Used by
 * the driving code so a bike can outrun a sedan and a truck cannot. */
export function clampSpecialSpeed(car) {
  const spec = VEHICLES[car.kind];
  if (!spec) return;
  car.speed = clamp(car.speed, -spec.reverseMax, spec.maxSpeed);
}
