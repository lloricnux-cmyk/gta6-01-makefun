// The side of Solmar Bay that pays between missions: taxi fares, street
// races, and twenty hidden packages. None of it is the story; all of it is
// money, and all of it runs while the missions run, so a player who is
// between jobs — or avoiding the cops — always has something to do.
//
// A taxi fare starts as a request while Rico is driving: pick the passenger
// up, drop them off before the clock runs out, and the fare is cash. A street
// race starts at the downtown boulevard: a countdown, six checkpoints around
// the block, and two rival drivers who want the prize as much as Rico does.
// The packages are twenty gold parcels tucked into quiet corners — park
// edges, the beach, the docks, the marina — fifty dollars each, and the HUD
// counts them down.
//
// The world owns the player, the cars and the pedestrians; this module owns
// the three activities' state and their rules, and hands back event flags so
// the caller can play the sounds.
import { FONT, PACKAGES, PALETTE, RACE, TAXI, WORLD } from './config.js';
import { PLACES, buildPackageSpots } from './city.js';
import { distance, randomPick } from './random.js';

export const EVENT_TAXI = 2048;
export const EVENT_RACE = 4096;
export const EVENT_PACKAGE = 8192;

/** A fresh taxi: no fare, waiting for a request. */
export function createTaxi() {
  return {
    phase: 'idle',
    timer: TAXI.requestDelayMin,
    px: 0,
    py: 0,
    dx: 0,
    dy: 0,
    fare: 0,
    passenger: null,
  };
}

/** A fresh race: no race running, no best time yet. */
export function createRace() {
  return {
    phase: 'idle',
    timer: 0,
    countdown: 0,
    index: 0,
    lastBeep: -1,
    rivals: [],
    best: null,
  };
}

/** The twenty hidden packages, from the city's shuffled hiding spots. */
export function createPackages(random) {
  return buildPackageSpots(random).map((spot) => ({
    x: spot.x,
    y: spot.y,
    found: false,
  }));
}

/** A point on a road, between minD and maxD from a spot, with the seeded
 * generator. Taxi pickups and drop-offs both come from here, so a fare never
 * asks Rico to drive into a building or the ocean. */
function roadPoint(random, nearX, nearY, minD, maxD) {
  for (let tries = 0; tries < 14; tries += 1) {
    const axis = random() < 0.5 ? 'y' : 'x';
    const line = axis === 'y' ? randomPick(random, WORLD.roadsX) : randomPick(random, WORLD.roadsY);
    const along = axis === 'y'
      ? 140 + random() * (WORLD.height - 400)
      : 140 + random() * (WORLD.width - 400);
    const x = axis === 'y' ? line : along;
    const y = axis === 'y' ? along : line;
    if (y > WORLD.beachY - 40) continue;
    const d = distance(x, y, nearX, nearY);
    if (d >= minD && d <= maxD) return { x, y };
  }
  return { x: PLACES.club.x, y: PLACES.club.y };
}

/** The passenger who waits at a pickup: a plain pedestrian who stands still
 * until the fare is collected or cancelled, then walks off. */
function makeWaitingPed(x, y, color) {
  return {
    kind: 'ped',
    x,
    y,
    angle: 0,
    speed: 0,
    color,
    health: 30,
    axis: 'y',
    dir: 1,
    line: x,
    along: y,
    state: 'wait',
    stateTimer: 60,
    fireTimer: 0,
    punchTimer: 0,
    pace: 'walk',
    size: 9,
    hat: false,
    dead: false,
  };
}

/** Cancel a fare: the passenger walks off, the marker goes away, and the
 * next request starts its timer. Called when the clock runs out, when Rico
 * gets out of the car, or when he is wasted or busted. */
export function cancelTaxi(state, random) {
  const taxi = state.taxi;
  if (taxi.passenger) {
    taxi.passenger.state = 'walk';
    taxi.passenger.stateTimer = 0;
    taxi.passenger = null;
  }
  taxi.phase = 'idle';
  taxi.timer = TAXI.requestDelayMin + random() * (TAXI.requestDelayMax - TAXI.requestDelayMin);
}

/** One step of the taxi. Fares only come while Rico is driving; the request
 * appears, he drives to the pickup, the passenger boards, and the clock for
 * the drop-off is set from the trip's length. */
export function updateTaxi(dt, state, api) {
  const taxi = state.taxi;
  const player = state.player;
  if (taxi.phase === 'idle') {
    if (!player.inCar) {
      taxi.timer = TAXI.requestDelayMin;
      return 0;
    }
    taxi.timer -= dt;
    if (taxi.timer > 0) return 0;
    const spot = roadPoint(api.random, player.x, player.y, 350, 700);
    taxi.px = spot.x;
    taxi.py = spot.y;
    taxi.phase = 'toPickup';
    const ped = makeWaitingPed(spot.x + 24, spot.y + 10, randomPick(api.random, ['#e5534b', '#4fc3f7', '#f2c94c', '#58c96b']));
    state.peds.push(ped);
    taxi.passenger = ped;
    api.showToast('TAXI FARE — PICK UP THE PASSENGER', 3);
    return EVENT_TAXI;
  }
  if (!player.inCar) {
    api.showToast('FARE LOST — YOU LEFT THE CAR', 2);
    cancelTaxi(state, api.random);
    return 0;
  }
  if (taxi.phase === 'toPickup') {
    if (distance(player.x, player.y, taxi.px, taxi.py) < TAXI.pickupRadius) {
      if (taxi.passenger) {
        taxi.passenger.dead = true;
        taxi.passenger = null;
      }
      const drop = roadPoint(api.random, taxi.px, taxi.py, 500, 950);
      taxi.dx = drop.x;
      taxi.dy = drop.y;
      const trip = distance(taxi.px, taxi.py, taxi.dx, taxi.dy);
      taxi.fare = Math.round((TAXI.fareMin + (trip / 950) * (TAXI.fareMax - TAXI.fareMin)) / 10) * 10;
      taxi.timer = TAXI.baseTime + trip / TAXI.timePerUnit;
      taxi.phase = 'toDropoff';
      api.showToast(`PASSENGER ABOARD — $${taxi.fare} IF YOU MAKE IT IN TIME`, 3);
      return EVENT_TAXI;
    }
    return 0;
  }
  // toDropoff: the clock runs, and the fare is paid on arrival.
  taxi.timer -= dt;
  if (taxi.timer <= 0) {
    api.showToast('FARE LOST — TOO SLOW', 2);
    cancelTaxi(state, api.random);
    return 0;
  }
  if (distance(player.x, player.y, taxi.dx, taxi.dy) < TAXI.dropoffRadius) {
    const fare = taxi.fare;
    player.cash += fare;
    state.cash = player.cash;
    state.stats.cashEarned += fare;
    state.stats.faresDone += 1;
    api.showToast(`FARE PAID — +$${fare}`, 2.5);
    cancelTaxi(state, api.random);
    return EVENT_TAXI;
  }
  return 0;
}

/** A rival driver: an ordinary car shape with a checkpoint to chase. Rivals
 * steer straight at their next checkpoint — the checkpoints all sit on road
 * crossings, and consecutive ones share a road, so a rival that drives
 * straight stays on the asphalt. */
function makeRival(x, y, angle, color) {
  return {
    kind: 'racer',
    x,
    y,
    angle,
    speed: 0,
    color,
    health: 200,
    maxSpeed: RACE.rivalSpeed,
    accel: 320,
    length: 52,
    width: 26,
    steerRate: 2.2,
    axis: 'y',
    dir: 1,
    line: x,
    lane: 16,
    occupied: true,
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
    targetIndex: 1,
    finished: false,
  };
}

/** Cancel a race: the rivals drive off (they are removed), the checkpoints
 * go away, and the start flag is back up. A cooldown keeps the finish line
 * from entering the winner straight into another race. */
export function cancelRace(state) {
  const race = state.race;
  for (const rival of race.rivals) rival.dead = true;
  race.rivals = [];
  race.phase = 'idle';
  race.timer = RACE.cooldown;
  race.index = 0;
  race.countdown = 0;
  race.lastBeep = -1;
}

/** Steer one rival at its next checkpoint. */
function updateRival(dt, rival) {
  const points = RACE.checkpoints;
  if (rival.finished) return;
  const target = points[rival.targetIndex];
  const desired = Math.atan2(target.y - rival.y, target.x - rival.x);
  let diff = desired - rival.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rival.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
  rival.speed += Math.min(RACE.rivalSpeed - rival.speed, 320 * dt);
  rival.x += Math.cos(rival.angle) * rival.speed * dt;
  rival.y += Math.sin(rival.angle) * rival.speed * dt;
  rival.x = Math.max(40, Math.min(WORLD.width - 40, rival.x));
  rival.y = Math.max(40, Math.min(WORLD.height - 40, rival.y));
  if (distance(rival.x, rival.y, target.x, target.y) < RACE.checkpointRadius) {
    rival.targetIndex += 1;
    if (rival.targetIndex >= points.length) rival.finished = true;
  }
}

/** One step of the street race. Driving into the start flag begins the
 * countdown; the checkpoints light up in order; the first car — Rico or a
 * rival — through the last one takes the prize. */
export function updateRace(dt, state, api) {
  const race = state.race;
  const player = state.player;
  const points = RACE.checkpoints;
  if (race.phase === 'idle') {
    // The cooldown after a race ticks down here; the flag only takes a
    // driver once it reaches zero.
    race.timer = Math.max(0, race.timer - dt);
    if (race.timer <= 0 && player.inCar && distance(player.x, player.y, PLACES.raceStart.x, PLACES.raceStart.y) < 90) {
      race.phase = 'countdown';
      race.countdown = RACE.countdownSeconds;
      race.lastBeep = -1;
      race.index = 0;
      const colors = ['#ff8c2d', '#d94f3d'];
      for (let i = 0; i < 2; i += 1) {
        const rival = makeRival(
          PLACES.raceStart.x - 70 - i * 60,
          PLACES.raceStart.y + 40,
          0,
          colors[i],
        );
        state.cars.push(rival);
        race.rivals.push(rival);
      }
      api.showToast('RACE STARTING — GET READY', 2.5);
      return EVENT_RACE;
    }
    return 0;
  }
  if (!player.inCar) {
    api.showToast('RACE LOST — YOU LEFT THE CAR', 2);
    cancelRace(state);
    return 0;
  }
  if (race.phase === 'countdown') {
    race.countdown -= dt;
    const second = Math.ceil(race.countdown);
    if (second !== race.lastBeep && second > 0) {
      race.lastBeep = second;
      return EVENT_RACE;
    }
    if (race.countdown <= 0) {
      race.phase = 'running';
      race.timer = 0;
      race.index = 1;
      api.showToast('GO!', 1);
      return EVENT_RACE;
    }
    return 0;
  }
  // Running: the clock, the checkpoints, the rivals.
  race.timer += dt;
  for (const rival of race.rivals) updateRival(dt, rival);
  const won = race.rivals.some((rival) => rival.finished);
  if (won) {
    api.showToast('RIVAL WON THE RACE', 3);
    cancelRace(state);
    return EVENT_RACE;
  }
  const target = points[race.index];
  if (target && distance(player.x, player.y, target.x, target.y) < RACE.checkpointRadius) {
    race.index += 1;
    if (race.index >= points.length) {
      const time = race.timer;
      player.cash += RACE.reward;
      state.cash = player.cash;
      state.stats.cashEarned += RACE.reward;
      state.stats.racesWon += 1;
      if (race.best === null || time < race.best) race.best = time;
      api.showToast(`YOU WON THE RACE — +$${RACE.reward} IN ${time.toFixed(1)}s`, 3);
      api.showBanner(`RACE WON  ·  +$${RACE.reward}`, 3);
      cancelRace(state);
      return EVENT_RACE;
    }
    api.showToast(`CHECKPOINT ${race.index}/${points.length - 1}`, 1.5);
    return EVENT_RACE;
  }
  return 0;
}

/** One step of the packages: walk or drive over one and it is found. */
export function updatePackages(dt, state, api) {
  const player = state.player;
  let events = 0;
  for (const pack of state.packages) {
    if (pack.found) continue;
    if (distance(player.x, player.y, pack.x, pack.y) < PACKAGES.radius) {
      pack.found = true;
      player.cash += PACKAGES.reward;
      state.cash = player.cash;
      state.stats.cashEarned += PACKAGES.reward;
      state.stats.packagesFound += 1;
      api.showToast(`PACKAGE FOUND — +$${PACKAGES.reward} (${state.stats.packagesFound}/${PACKAGES.count})`, 2.5);
      events |= EVENT_PACKAGE;
    }
  }
  return events;
}

/** How many packages are left to find. The HUD shows the count. */
export function packagesLeft(state) {
  let left = 0;
  for (const pack of state.packages) if (!pack.found) left += 1;
  return left;
}

/** Draw the side activities: taxi markers, race checkpoints and the start
 * flag, and the gold parcels still waiting to be found. */
export function drawSide(ctx, state) {
  const taxi = state.taxi;
  const race = state.race;
  // Taxi: a pulsing yellow ring at the pickup, green at the drop-off.
  if (taxi.phase === 'toPickup' || taxi.phase === 'toDropoff') {
    const x = taxi.phase === 'toPickup' ? taxi.px : taxi.dx;
    const y = taxi.phase === 'toPickup' ? taxi.py : taxi.dy;
    const color = taxi.phase === 'toPickup' ? PALETTE.taxi : PALETTE.green;
    const pulse = 1 + Math.sin(state.time * 5) * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#10141c';
    ctx.fillText(taxi.phase === 'toPickup' ? 'T' : 'D', x, y + 4.5);
    if (taxi.phase === 'toDropoff') {
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillStyle = PALETTE.taxi;
      ctx.fillText(`${Math.max(0, Math.ceil(taxi.timer))}s`, x, y - 44);
    }
  }
  // Race: the start flag when idle, numbered checkpoints while running.
  if (race.phase === 'idle') {
    const s = PLACES.raceStart;
    ctx.fillStyle = PALETTE.race;
    ctx.fillRect(s.x - 2, s.y - 34, 3, 34);
    ctx.beginPath();
    ctx.moveTo(s.x + 1, s.y - 34);
    ctx.lineTo(s.x + 22, s.y - 27);
    ctx.lineTo(s.x + 1, s.y - 20);
    ctx.closePath();
    ctx.fill();
  } else if (race.phase === 'running' || race.phase === 'countdown') {
    const points = RACE.checkpoints;
    for (let i = 1; i < points.length; i += 1) {
      const point = points[i];
      const isNext = i === race.index;
      ctx.strokeStyle = isNext ? PALETTE.race : 'rgba(255,255,255,0.45)';
      ctx.lineWidth = isNext ? 4 : 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isNext ? 26 + Math.sin(state.time * 6) * 4 : 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isNext ? PALETTE.race : 'rgba(255,255,255,0.7)';
      ctx.fillText(String(i), point.x, point.y);
    }
  }
  // Packages: small gold parcels, bobbing, until they are found.
  for (const pack of state.packages) {
    if (pack.found) continue;
    const bob = Math.sin(state.time * 4 + pack.x * 0.01) * 3;
    ctx.fillStyle = PALETTE.packageGold;
    ctx.fillRect(pack.x - 8, pack.y - 8 + bob, 16, 16);
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(pack.x - 8, pack.y - 8 + bob, 16, 16);
    ctx.beginPath();
    ctx.moveTo(pack.x, pack.y - 8 + bob);
    ctx.lineTo(pack.x, pack.y + 8 + bob);
    ctx.stroke();
  }
}
