// The game's rules and state, with no drawing and no browser in it: the player on
// foot and in cars, traffic, pedestrians, police and the wanted level, the four
// missions and the story, combat, particles, the camera and the clock. step()
// advances one fixed step and returns what happened as bit flags, so the caller can
// react (sounds, announcements) without the world knowing about screens or audio.
//
// Traffic deadlock, fixed here: a driver that waits behind a stopped car first
// tries to overtake it (pull into the other lane and go around), and if it is
// still stuck it forces a turn at the next crossing instead of queuing forever.
// Nothing here allocates after createWorld returns, apart from the small particle
// pool churn, which the cap keeps bounded.
import { CAR, DAY_LENGTH, LAST_STAND, MISSIONS, PALETTE, PEDS, PLAYER, POLICE, TRAFFIC, VIEW, WORLD } from './config.js';
import { angleDiff, clamp, distance, randomInt, randomPick, shuffle } from './random.js';
import { PLACES, buildCity, buildingAt, collideBuildings, districtAt, nearestRoad, onRoad } from './city.js';
import { cancelRace, cancelTaxi, createPackages, createRace, createTaxi, updatePackages, updateRace, updateTaxi } from './side.js';
import { createWeaponState, fireWeapon, giveWeapon, syncAmmo } from './weapons.js';
import { clampSpecialSpeed, parkSpecialVehicles, steerRateOf } from './vehicles.js';
import { createAmbient, updateAmbient } from './ambient.js';
import { spawnBankThugs, updateMissions56 } from './missions2.js';
import { cancelStormRun, createStormRun, updateStormRun } from './missions3.js';
import { createWeather, setWeatherKind, updateWeather, wetGripFactor } from './weather.js';

export const EVENT_SHOT = 1;
export const EVENT_PUNCH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_WASTED = 16;
export const EVENT_BUSTED = 32;
export const EVENT_EXPLOSION = 64;
export const EVENT_CRIME = 128;
export const EVENT_ENTER_CAR = 256;
export const EVENT_HIT = 512;
export const EVENT_HORN = 1024;

const MAX_PARTICLES = 220;
const MAX_POLICE_CARS = 5;

/** How far from a road's centre line pedestrians walk: on the sidewalk, clear of the lanes. */
const SIDEWALK_OFFSET = WORLD.roadHalf + 18;

function makeCar(kind, x, y, angle, color) {
  return {
    kind, x, y, angle, speed: 0, color,
    health: CAR.health, maxSpeed: CAR.maxSpeed,
    axis: 'y', dir: 1, line: x, lane: 16,
    occupied: kind === 'traffic',
    driverFled: kind !== 'traffic',
    ramTimer: 0,
    hitTimer: 0,
    smokeTimer: 0,
    // Traffic flow: how long this driver has waited behind a stopped car, and
    // whether it is currently overtaking (see updateTrafficCar).
    waitTimer: 0,
    overtake: false,
    overtakeTimer: 0,
    overtakeFrom: 0,
    forceTurn: false,
    hornBoost: 0,
    dead: false,
  };
}

function makePed(kind, x, y, color) {
  return {
    kind, x, y, angle: 0, speed: 0, color,
    health: kind === 'thug' ? 60 : 30,
    axis: 'y', dir: 1, line: x, along: y,
    state: 'walk', stateTimer: 0, fireTimer: 0, punchTimer: 0,
    // Variety: joggers move faster, strollers dawdle, some wear hats.
    pace: 'walk', size: 9, hat: false,
    dead: false,
  };
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    time: 0,
    timeOfDay: 0.32,
    cash: 150,
    missionIndex: 0,
    missionStep: 0,
    missionText: MISSIONS[0].brief,
    missionTarget: { x: PLACES.docks.x, y: PLACES.docks.y, label: PLACES.docks.label },
    missionBanner: '',
    bannerTimer: 0,
    toast: '',
    toastTimer: 0,
    wanted: 0,
    crimeTimer: 0,
    // How hot the player is right now, 0..1: stars plus how close the nearest
    // police car is. The HUD draws it as a heat bar under the stars.
    heat: 0,
    thugsLeft: 0,
    // Mission 4's getaway clock; 0 means no clock is running.
    missionTimer: 0,
    maraRiding: false,
    // Mission 5's vault hold, in seconds: how long Rico has stood in the
    // vault room without stepping out.
    missionHold: 0,
    // The side of the city that pays between missions: the taxi, the race,
    // the hidden packages, and the ledger the phone shows.
    stats: { cashEarned: 0, faresDone: 0, racesWon: 0, bestRace: null, packagesFound: 0, stormsWon: 0 },
    taxi: createTaxi(),
    race: createRace(),
    packages: [],
    // The sky overhead, and the storm race it feeds: the weather rolls on
    // its own clock, and mission seven races through it.
    weather: createWeather(random),
    stormRun: createStormRun(),
    ambient: null,
    district: 'Downtown',
    elapsed: 0,
    carsDriven: 0,
    pedsHit: 0,
    camera: { x: 0, y: 0, zoom: 1 },
    player: null,
    cars: [],
    peds: [],
    particles: [],
    pickups: [],
  };
  const player = {
    x: PLACES.club.x, y: PLACES.club.y + 60, angle: -Math.PI / 2,
    health: PLAYER.health, cash: 150, armed: false, ammo: 0,
    inCar: null, punchTimer: 0, fireTimer: 0, bustTimer: 0,
    regenTimer: 0, dead: false,
    // The armoury: which gun is in hand, which guns are owned, and each
    // gun's own ammo. The pistol starts owned with a full box; the shotgun
    // and the SMG are found as pickups.
    ...createWeaponState(),
  };
  state.player = player;
  state.city = city;
  // Events raised by helpers that do not return them (missions, pickups).
  let pendingEvents = 0;

  function addParticle(x, y, vx, vy, life, size, color, kind) {
    if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
    state.particles.push({ x, y, vx, vy, life, maxLife: life, size, color, kind });
  }

  function burst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.6);
      addParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + random() * 0.5), size, color, 'spark');
    }
  }

  function explode(x, y) {
    burst(x, y, '#ff9d2d', 26, 260, 0.7, 5);
    burst(x, y, '#e5534b', 18, 180, 0.9, 6);
    for (let i = 0; i < 10; i += 1) {
      addParticle(x + (random() - 0.5) * 30, y + (random() - 0.5) * 30, (random() - 0.5) * 30, -40 - random() * 40, 1.6, 9, '#555', 'smoke');
    }
  }

  function showToast(text, seconds) {
    state.toast = text;
    state.toastTimer = seconds;
  }

  function showBanner(text, seconds) {
    state.missionBanner = text;
    state.bannerTimer = seconds;
  }

  function setMissionTarget(x, y, label) {
    state.missionTarget = { x, y, label };
  }

  function setMissionText(text) {
    state.missionText = text;
  }

  function addCrime(stars) {
    if (state.wanted < 5) state.wanted = Math.min(5, state.wanted + stars);
    state.crimeTimer = 0;
  }

  function spawnTrafficCar(nearX, nearY) {
    const axis = random() < 0.5 ? 'y' : 'x';
    const line = axis === 'y' ? randomPick(random, WORLD.roadsX) : randomPick(random, WORLD.roadsY);
    const dir = random() < 0.5 ? 1 : -1;
    const along = axis === 'y'
      ? 120 + random() * (WORLD.height - 360)
      : 120 + random() * (WORLD.width - 360);
    const x = axis === 'y' ? line + (dir === 1 ? 16 : -16) : along;
    const y = axis === 'y' ? along : line + (dir === 1 ? 16 : -16);
    if (nearX !== undefined && distance(x, y, nearX, nearY) < 260) return null;
    const car = makeCar('traffic', x, y, axis === 'y' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI), randomPick(random, PALETTE.carColors));
    car.axis = axis;
    car.dir = dir;
    car.line = line;
    car.lane = dir === 1 ? 16 : -16;
    car.speed = TRAFFIC.minSpeed + random() * (TRAFFIC.maxSpeed - TRAFFIC.minSpeed);
    return car;
  }

  function spawnParkedCar() {
    const axis = random() < 0.5 ? 'y' : 'x';
    const line = axis === 'y' ? randomPick(random, WORLD.roadsX) : randomPick(random, WORLD.roadsY);
    const dir = random() < 0.5 ? 1 : -1;
    const along = axis === 'y'
      ? 200 + random() * (WORLD.height - 560)
      : 200 + random() * (WORLD.width - 560);
    const x = axis === 'y' ? line + (dir === 1 ? 26 : -26) : along;
    const y = axis === 'y' ? along : line + (dir === 1 ? 26 : -26);
    if (y > WORLD.beachY - 60) return null;
    const car = makeCar('parked', x, y, axis === 'y' ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI), randomPick(random, PALETTE.carColors));
    car.axis = axis;
    car.dir = dir;
    car.line = line;
    car.lane = dir === 1 ? 26 : -26;
    return car;
  }

  function spawnPed(nearX, nearY) {
    const axis = random() < 0.5 ? 'y' : 'x';
    const line = axis === 'y' ? randomPick(random, WORLD.roadsX) : randomPick(random, WORLD.roadsY);
    const dir = random() < 0.5 ? 1 : -1;
    const along = axis === 'y'
      ? 120 + random() * (WORLD.height - 420)
      : 120 + random() * (WORLD.width - 420);
    const offset = SIDEWALK_OFFSET;
    const x = axis === 'y' ? line + (dir === 1 ? offset : -offset) : along;
    const y = axis === 'y' ? along : line + (dir === 1 ? offset : -offset);
    if (y > WORLD.beachY - 20) return null;
    if (nearX !== undefined && distance(x, y, nearX, nearY) < 200) return null;
    const ped = makePed('ped', x, y, randomPick(random, ['#e5534b', '#4fc3f7', '#f2c94c', '#58c96b', '#e8e8e8', '#d97b2f']));
    ped.axis = axis;
    ped.dir = dir;
    ped.line = line;
    // One in eight pedestrians is a jogger, one in five a stroller; the rest
    // walk. Size and hats vary too, so the crowd does not read as clones.
    const roll = random();
    if (roll < 0.125) {
      ped.pace = 'jog';
      ped.speed = PEDS.jogSpeed * (0.9 + random() * 0.2);
    } else if (roll < 0.325) {
      ped.pace = 'stroll';
      ped.speed = PEDS.minSpeed * 0.7;
    } else {
      ped.speed = PEDS.minSpeed + random() * (PEDS.maxSpeed - PEDS.minSpeed);
    }
    ped.size = 8 + random() * 5;
    ped.hat = random() < 0.22;
    return ped;
  }

  function spawnPoliceCar() {
    // On a road 500-750 units from the player, off-screen if possible.
    for (let tries = 0; tries < 8; tries += 1) {
      const car = spawnTrafficCar();
      if (!car) continue;
      const d = distance(car.x, car.y, player.x, player.y);
      if (d > 480 && d < 900) {
        car.kind = 'police';
        car.color = PALETTE.copCar;
        car.maxSpeed = POLICE.chaseSpeed;
        car.speed = 300;
        return car;
      }
    }
    return null;
  }

  /** Spawn armed thugs around a point: the warehouse crew and the club hit. */
  function spawnThugsAt(cx, cy, spots) {
    const chosen = shuffle(random, spots);
    for (const spot of chosen) {
      const thug = makePed('thug', cx + spot.x, cy + spot.y, PALETTE.thug);
      thug.state = 'guard';
      state.peds.push(thug);
    }
    state.thugsLeft = spots.length;
  }

  function spawnWarehouseThugs() {
    spawnThugsAt(PLACES.warehouse.x, PLACES.warehouse.y, [
      { x: -60, y: -40 },
      { x: 40, y: -70 },
      { x: -30, y: 60 },
      { x: 80, y: 30 },
      { x: 0, y: -110 },
    ]);
  }

  function spawnClubThugs() {
    spawnThugsAt(PLACES.club.x, PLACES.club.y, [
      { x: -140, y: -60 },
      { x: 150, y: -40 },
      { x: -120, y: 120 },
      { x: 160, y: 110 },
      { x: -40, y: -170 },
      { x: 60, y: 170 },
    ]);
  }

  function reset() {
    player.x = PLACES.club.x;
    player.y = PLACES.club.y + 60;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.cash = 150;
    player.armed = false;
    player.ammo = 0;
    player.inCar = null;
    player.punchTimer = 0;
    player.fireTimer = 0;
    player.bustTimer = 0;
    player.dead = false;
    // A fresh armoury: fists, then a pistol with a full box once Mara hands
    // it over; the shotgun and the SMG are found again each visit.
    const freshArms = createWeaponState();
    player.weapon = freshArms.weapon;
    player.owned = freshArms.owned;
    player.ammoByWeapon = freshArms.ammoByWeapon;
    player.shotCount = 0;
    state.cash = 150;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionText = MISSIONS[0].brief;
    state.missionTarget = { x: PLACES.docks.x, y: PLACES.docks.y, label: PLACES.docks.label };
    state.missionBanner = '';
    state.bannerTimer = 0;
    state.toast = '';
    state.toastTimer = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.heat = 0;
    state.thugsLeft = 0;
    state.missionTimer = 0;
    state.maraRiding = false;
    state.missionHold = 0;
    // A fresh side of the city: the ledger starts at zero, the taxi is
    // waiting for its first request, the race flag is up, the packages are
    // hidden again, and the fishermen are back on their piers.
    state.stats = { cashEarned: 0, faresDone: 0, racesWon: 0, bestRace: null, packagesFound: 0, stormsWon: 0 };
    state.taxi = createTaxi();
    state.race = createRace();
    state.packages = createPackages(random);
    // A fresh sky and a fresh storm race, so a reset world always starts
    // under the same clear sky the first build did.
    state.weather = createWeather(random);
    state.stormRun = createStormRun();
    state.ambient = createAmbient(city);
    state.district = 'Downtown';
    state.elapsed = 0;
    state.cars = [];
    state.peds = [];
    state.particles = [];
    state.pickups = [];
    state.camera.x = player.x;
    state.camera.y = player.y;
    state.camera.zoom = 1;
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const car = spawnTrafficCar(player.x, player.y);
      if (car) state.cars.push(car);
    }
    for (let i = 0; i < 9; i += 1) {
      const car = spawnParkedCar();
      if (car) state.cars.push(car);
    }
    for (let i = 0; i < PEDS.count; i += 1) {
      const ped = spawnPed(player.x, player.y);
      if (ped) state.peds.push(ped);
    }
    // The Comet GT: the red sports car mission 2 needs, parked at the beach lot.
    const comet = makeCar('sports', PLACES.beachLot.x, PLACES.beachLot.y, Math.PI / 2, PALETTE.sports);
    comet.maxSpeed = CAR.sportsMaxSpeed;
    comet.axis = 'y';
    comet.line = PLACES.beachLot.x;
    comet.lane = 16;
    state.cars.push(comet);
    state.comet = comet;
    // A few pickups to find while exploring: health at the hospital, ammo at
    // the docks and the warehouse, cash tucked into the park — and the two
    // extra guns: the shotgun at the docks, the SMG at the warehouse.
    state.pickups.push(
      { x: PLACES.hospital.x, y: PLACES.hospital.y + 90, kind: 'health', amount: 0, active: true },
      { x: PLACES.docks.x + 60, y: PLACES.docks.y + 40, kind: 'ammo', amount: 0, active: true },
      { x: PLACES.warehouse.x + 120, y: PLACES.warehouse.y, kind: 'ammo', amount: 0, active: true },
      { x: PLACES.park.x, y: PLACES.park.y + 60, kind: 'cash', amount: 0, active: true },
      { x: PLACES.docks.x - 60, y: PLACES.docks.y + 80, kind: 'shotgun', amount: 0, active: true },
      { x: PLACES.warehouse.x - 120, y: PLACES.warehouse.y + 40, kind: 'smg', amount: 0, active: true },
    );
    // The special rides: three bikes and two trucks, parked around the city.
    parkSpecialVehicles(random, state);
  }

  function missionComplete() {
    const mission = MISSIONS[state.missionIndex];
    player.cash += mission.reward;
    state.cash = player.cash;
    state.stats.cashEarned += mission.reward;
    pendingEvents |= EVENT_MISSION;
    showBanner(`MISSION PASSED  ·  +$${mission.reward}`, 3.2);
    state.missionIndex += 1;
    state.missionStep = 0;
    state.missionTimer = 0;
    state.missionHold = 0;
    state.maraRiding = false;
    if (state.missionIndex === 1) {
      player.armed = true;
      player.ammoByWeapon.pistol = PLAYER.startAmmo;
      syncAmmo(player);
      setMissionText(MISSIONS[1].brief);
      setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
      showToast('Mara gave you a pistol. Watch the cops.', 4);
    } else if (state.missionIndex === 2) {
      setMissionText(MISSIONS[2].brief);
      setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
    } else if (state.missionIndex === 3) {
      setMissionText(MISSIONS[3].brief);
      setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
      showToast('Los Diablos are coming for the club. Get there.', 4);
    } else if (state.missionIndex === 4) {
      setMissionText(MISSIONS[4].brief);
      setMissionTarget(PLACES.bank.x, PLACES.bank.y, PLACES.bank.label);
      showToast('The bank job is next. Solmar Trust, north-east.', 4);
    } else if (state.missionIndex === 5) {
      setMissionText(MISSIONS[5].brief);
      setMissionTarget(PLACES.docks.x, PLACES.docks.y, PLACES.docks.label);
      showToast('One last stand at the docks. End it, Rico.', 4);
    } else if (state.missionIndex === 6) {
      setMissionText(MISSIONS[6].brief);
      setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
      showToast('A storm is coming. Bring a car to the Beach Lot.', 4);
    } else {
      setMissionText('Solmar Bay is yours. Free roam — earn cash, dodge the law, live large.');
      setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
      showToast('All missions complete. Respect +100.', 4);
    }
  }

  function updateMission(dt) {
    const px = player.x;
    const py = player.y;
    if (state.missionIndex === 0) {
      if (state.missionStep === 0) {
        if (distance(px, py, PLACES.docks.x, PLACES.docks.y) < 70) {
          state.missionStep = 1;
          setMissionText('Package secured. Deliver it to Mara at the Starfish Club.');
          setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
          showToast('PACKAGE SECURED', 2.5);
        }
      } else if (distance(px, py, PLACES.club.x, PLACES.club.y) < 80) {
        missionComplete();
      }
    } else if (state.missionIndex === 1) {
      if (state.missionStep === 0 && player.inCar === state.comet) {
        state.missionStep = 1;
        addCrime(2);
        setMissionText('The cops are onto you! Lose them and deliver the Comet GT to the chop shop.');
        setMissionTarget(PLACES.chopShop.x, PLACES.chopShop.y, PLACES.chopShop.label);
        showToast('WANTED — LOSE THE COPS', 3);
      } else if (state.missionStep === 1 && player.inCar === state.comet
        && distance(px, py, PLACES.chopShop.x, PLACES.chopShop.y) < 90) {
        player.inCar = null;
        state.comet.dead = true;
        missionComplete();
      } else if (state.missionStep === 1 && player.inCar !== state.comet && state.comet.dead) {
        // Forgiving: the Comet is re-parked at the beach lot if it was destroyed.
        const comet = makeCar('sports', PLACES.beachLot.x, PLACES.beachLot.y, Math.PI / 2, PALETTE.sports);
        comet.maxSpeed = CAR.sportsMaxSpeed;
        comet.axis = 'y';
        comet.line = PLACES.beachLot.x;
        comet.lane = 16;
        state.cars.push(comet);
        state.comet = comet;
        state.missionStep = 0;
        setMissionText(MISSIONS[1].brief);
        setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
      }
    } else if (state.missionIndex === 2) {
      if (state.missionStep === 0) {
        if (distance(px, py, PLACES.warehouse.x, PLACES.warehouse.y) < 240) {
          state.missionStep = 1;
          spawnWarehouseThugs();
          setMissionText(`Clear the warehouse — ${state.thugsLeft} Los Diablos thugs left.`);
          showToast('THEY ARE ARMED. GOOD LUCK.', 3);
        }
      } else if (state.missionStep === 1) {
        setMissionText(`Clear the warehouse — ${state.thugsLeft} Los Diablos thugs left.`);
        if (state.thugsLeft <= 0) {
          state.missionStep = 2;
          state.pickups.push({ x: PLACES.warehouse.x, y: PLACES.warehouse.y, kind: 'cash', amount: 0, active: true, missionCash: true });
          setMissionText('Warehouse clear. Grab the cash, then get back to Mara.');
          setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
        }
      } else if (state.missionStep === 2) {
        const cash = state.pickups.find((p) => p.active && p.missionCash);
        if (!cash) {
          state.missionStep = 3;
          setMissionText('Cash in hand. Get back to Mara at the Starfish Club.');
          setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
        }
      } else if (state.missionStep === 3) {
        if (distance(px, py, PLACES.club.x, PLACES.club.y) < 80) missionComplete();
      }
    } else if (state.missionIndex === 3) {
      // M4 · Last Stand: reach the club, hold it against a wave of thugs, then
      // drive Mara to the marina before the getaway clock runs out.
      if (state.missionStep === 0) {
        if (distance(px, py, PLACES.club.x, PLACES.club.y) < LAST_STAND.triggerRadius) {
          state.missionStep = 1;
          spawnClubThugs();
          setMissionText(`Hold the Starfish — ${state.thugsLeft} Los Diablos thugs left.`);
          showToast('THEY ARE HERE. HOLD THE CLUB.', 3);
        }
      } else if (state.missionStep === 1) {
        setMissionText(`Hold the Starfish — ${state.thugsLeft} Los Diablos thugs left.`);
        if (state.thugsLeft <= 0) {
          state.missionStep = 2;
          state.maraRiding = true;
          state.missionTimer = LAST_STAND.getawaySeconds;
          setMissionText(`Mara is with you. Get to The Marina — ${Math.ceil(state.missionTimer)}s!`);
          setMissionTarget(PLACES.marina.x, PLACES.marina.y, PLACES.marina.label);
          showToast('MARA IS IN. DRIVE!', 3);
        }
      } else if (state.missionStep === 2) {
        state.missionTimer -= dt;
        setMissionText(`Mara is with you. Get to The Marina — ${Math.max(0, Math.ceil(state.missionTimer))}s!`);
        if (distance(px, py, PLACES.marina.x, PLACES.marina.y) < 90) {
          missionComplete();
        } else if (state.missionTimer <= 0) {
          // Too slow: the crew regroups and hits the club again.
          state.missionStep = 0;
          state.maraRiding = false;
          state.missionTimer = 0;
          setMissionText(MISSIONS[3].brief);
          setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
          showToast('TOO SLOW — THEY ARE COMING BACK', 3);
        }
      }
    } else if (state.missionIndex === 4 || state.missionIndex === 5) {
      // M5 · The Bank Job and M6 · King of the Bay live in their own module:
      // the world hands it its own helpers and lets it drive the steps.
      updateMissions56(dt, {
        state,
        player,
        random,
        distance,
        addCrime,
        showToast,
        showBanner,
        setMissionText,
        setMissionTarget,
        missionComplete,
        spawnThugsAt,
      });
    } else if (state.missionIndex === 6) {
      // M7 · The Storm Run lives in its own module too, with one extra
      // helper: the weather, so the race can call the storm down.
      updateStormRun(dt, {
        state,
        player,
        random,
        distance,
        addCrime,
        showToast,
        showBanner,
        setMissionText,
        setMissionTarget,
        missionComplete,
        spawnThugsAt,
        setWeather(kind) {
          setWeatherKind(state.weather, kind, random);
        },
      });
    }
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = distance(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    player.inCar = car;
    car.kind = 'player';
    car.occupied = true;
    car.health = Math.max(car.health, 140);
    if (car.driverFled === false) {
      // Carjacked from traffic: the driver bails and runs.
      car.driverFled = true;
      const driver = makePed('ped', car.x + 30, car.y, '#e8e8e8');
      driver.state = 'flee';
      driver.stateTimer = 4;
      driver.angle = Math.atan2(driver.y - player.y, driver.x - player.x);
      state.peds.push(driver);
      addCrime(1);
      showToast('CARJACKED — WITNESSED', 2);
    }
    state.carsDriven += 1;
    return EVENT_ENTER_CAR;
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = Math.min(car.speed, 60);
    player.inCar = null;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
  }

  function shootAt(shooterX, shooterY, aimX, aimY, damage, isPlayer) {
    const angle = Math.atan2(aimY - shooterY, aimX - shooterX);
    const range = 560;
    // Muzzle flash.
    addParticle(shooterX + Math.cos(angle) * 20, shooterY + Math.sin(angle) * 20, 0, 0, 0.08, 7, '#ffe9a3', 'flash');
    let hitX = shooterX + Math.cos(angle) * range;
    let hitY = shooterY + Math.sin(angle) * range;
    let hitPed = null;
    let bestD = range;
    const targets = isPlayer ? state.peds : [player];
    for (const target of targets) {
      if (target.dead) continue;
      if (target === player && player.inCar) continue;
      const tx = target.x;
      const ty = target.y;
      const dx = tx - shooterX;
      const dy = ty - shooterY;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      if (along < 0 || along > range) continue;
      const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
      if (perp < 16 && along < bestD) {
        bestD = along;
        hitPed = target;
      }
    }
    if (hitPed) {
      hitX = hitPed.x;
      hitY = hitPed.y;
      hitPed.health -= damage;
      burst(hitX, hitY, '#e5534b', 6, 120, 0.4, 3);
      if (hitPed.health <= 0) {
        hitPed.dead = true;
        if (hitPed.kind === 'thug') {
          state.thugsLeft = Math.max(0, state.thugsLeft - 1);
        } else if (hitPed.kind === 'cop') {
          addCrime(2);
          showToast('COP DOWN — WANTED UP', 2.5);
        } else if (isPlayer) {
          addCrime(1);
        }
      }
    } else {
      // Check cars along the ray for a hit.
      for (const car of state.cars) {
        if (car.dead || car === player.inCar) continue;
        const dx = car.x - shooterX;
        const dy = car.y - shooterY;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (along < 0 || along > range) continue;
        const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        if (perp < 22 && along < bestD) {
          bestD = along;
          hitX = car.x;
          hitY = car.y;
          car.health -= damage;
          burst(hitX, hitY, '#ffd23d', 5, 140, 0.35, 3);
          if (car.health <= 0) destroyCar(car);
        }
      }
    }
    // Tracer.
    const steps = Math.floor(bestD / 26);
    for (let i = 1; i < steps; i += 1) {
      addParticle(shooterX + Math.cos(angle) * i * 26, shooterY + Math.sin(angle) * i * 26, 0, 0, 0.07, 2, '#fff2b0', 'flash');
    }
    return EVENT_SHOT;
  }

  function destroyCar(car) {
    if (car.dead) return EVENT_EXPLOSION;
    car.dead = true;
    explode(car.x, car.y);
    if (player.inCar === car) {
      player.inCar = null;
      player.x = car.x + 40;
      player.y = car.y + 40;
      player.health -= 30;
      player.angle = car.angle;
    }
    return EVENT_EXPLOSION;
  }

  /** The horn: traffic ahead of the player's car speeds up and clears a lane,
   * nearby pedestrians scatter. Returns EVENT_HORN for the sound. */
  function honk() {
    const car = player.inCar;
    if (!car) return 0;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const other of state.cars) {
      if (other === car || other.dead || other.kind !== 'traffic') continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * fx + dy * fy;
      const perp = Math.abs(-dx * fy + dy * fx);
      if (along > 0 && along < 260 && perp < 60) other.hornBoost = 1.5;
    }
    for (const ped of state.peds) {
      if (ped.dead) continue;
      if (distance(ped.x, ped.y, car.x, car.y) < 150) {
        ped.state = 'flee';
        ped.stateTimer = 2;
        ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
      }
    }
    return EVENT_HORN;
  }

  function updatePlayer(dt, input) {
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (player.regenTimer > 0) player.regenTimer -= dt;
    else if (player.health < PLAYER.health && state.wanted === 0) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }
    const car = player.inCar;
    if (car) {
      // Driving. A bike accelerates harder and turns sharper than a car, a
      // truck the opposite: the car carries its own numbers, so the same
      // code drives all three without a special case for each.
      const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
      const accel = car.accel || CAR.accel;
      const steerRate = steerRateOf(car);
      // Wet roads take grip away: the brakes bite less and the steering
      // goes soft, so a storm drive needs an earlier brake and a lighter hand.
      const wet = wetGripFactor(state.weather);
      if (input.up) car.speed += accel * dt;
      if (input.down) {
        if (car.speed > 10) car.speed -= CAR.brake * dt * (0.55 + 0.45 * wet);
        else car.speed -= accel * 0.55 * dt;
      }
      car.speed -= car.speed * 0.45 * dt;
      if (input.handbrake) car.speed -= car.speed * 2.2 * dt;
      clampSpecialSpeed(car);
      car.speed = clamp(car.speed, -CAR.reverseMax, car.maxSpeed);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const steerFactor = clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed < 0 ? -1 : 1);
      car.angle += steer * steerRate * steerFactor * wet * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(nx, 40, WORLD.width - 40);
      car.y = clamp(ny, 40, WORLD.height - 40);
      // Buildings stop cars hard; damage only once per scrape, not every frame.
      car.hitTimer -= dt;
      const hitBuilding = collideBuildings(city.buildings, car, 24);
      if (hitBuilding && Math.abs(car.speed) > 60 && car.hitTimer <= 0) {
        car.hitTimer = 0.6;
        car.health -= Math.abs(car.speed) * 0.03;
        burst(car.x, car.y, '#ffd23d', 6, 150, 0.4, 3);
        car.speed *= -0.25;
      } else if (hitBuilding) {
        car.speed *= 0.5;
      }
      // Ocean blocks cars.
      if (car.y > WORLD.oceanY - 20) {
        car.y = WORLD.oceanY - 20;
        car.speed *= 0.4;
      }
      // Dust and smoke.
      if (Math.abs(car.speed) > 200 && random() < 0.5) {
        addParticle(car.x - forward.x * 26, car.y - forward.y * 26, -forward.x * 40, -forward.y * 40, 0.5, 4, '#b9b3a4', 'dust');
      }
      if (car.health < 45) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = 0.12;
          addParticle(car.x, car.y - 10, (random() - 0.5) * 20, -50, 1.1, 8, '#444', 'smoke');
        }
      }
      if (car.health <= 0) return destroyCar(car);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      if (input.enterPressed) exitCar();
      if (input.hornPressed) return honk();
      return 0;
    }

    // On foot.
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    const moving = mx !== 0 || my !== 0;
    if (moving) {
      const len = Math.sqrt(mx * mx + my * my);
      mx /= len;
      my /= len;
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      player.x = clamp(player.x + mx * speed * dt, 20, WORLD.width - 20);
      player.y = clamp(player.y + my * speed * dt, 20, WORLD.oceanY - 8);
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    } else {
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    }
    collideBuildings(city.buildings, player, PLAYER.radius);
    if (input.enterPressed) {
      const near = nearestCar(player.x, player.y, 58);
      if (near) return enterCar(near);
    }
    if (input.punchPressed && player.punchTimer <= 0) {
      player.punchTimer = 0.45;
      for (const ped of state.peds) {
        if (ped.dead || ped.state === 'down') continue;
        const d = distance(player.x, player.y, ped.x, ped.y);
        if (d < PLAYER.punchRange) {
          const a = Math.atan2(ped.y - player.y, ped.x - player.x);
          if (Math.abs(angleDiff(player.angle, a)) < PLAYER.punchArc) {
            ped.health -= PLAYER.punchDamage;
            burst(ped.x, ped.y, '#fff2b0', 5, 120, 0.3, 3);
            if (ped.health <= 0) {
              ped.dead = true;
              if (ped.kind === 'thug') state.thugsLeft = Math.max(0, state.thugsLeft - 1);
              else if (ped.kind === 'cop') addCrime(2);
              else addCrime(1);
            } else if (ped.kind === 'ped') {
              ped.state = 'flee';
              ped.stateTimer = 3;
            }
          }
        }
      }
      return EVENT_PUNCH;
    }
    if (input.shootHeld && player.armed && player.fireTimer <= 0) {
      // The gun in hand decides the shot: one straight pistol round, a fan
      // of six shotgun pellets, or a fast SMG stream. The module spends the
      // ammo, sets the next interval, and fires each pellet through the
      // world's own raycast.
      return fireWeapon(player, input.aimX, input.aimY, (ax, ay, damage) => shootAt(player.x, player.y, ax, ay, damage, true));
    }
    return 0;
  }

  /**
   * One traffic car. The car ahead is found by real position, not by road line,
   * so a car in the other lane never blocks this one — and a driver that has
   * waited too long pulls out and overtakes instead of joining a queue.
   */
  function updateTrafficCar(dt, car) {
    if (car.hornBoost > 0) car.hornBoost -= dt;
    const fx = car.axis === 'y' ? 0 : car.dir;
    const fy = car.axis === 'y' ? car.dir : 0;
    let blocked = false;
    let targetSpeed = TRAFFIC.maxSpeed * (car.hornBoost > 0 ? 1.25 : 1);
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * fx + dy * fy;
      if (along <= 0) continue;
      const perp = Math.abs(-dx * fy + dy * fx);
      if (perp > 30) continue;
      if (along < TRAFFIC.stopGap) {
        blocked = true;
        targetSpeed = 0;
        break;
      }
      if (along < TRAFFIC.lookAhead) targetSpeed = Math.min(targetSpeed, 70);
    }
    // Waiting: count it, then act on it.
    if (blocked && car.speed < 8) {
      car.waitTimer += dt;
    } else {
      car.waitTimer = Math.max(0, car.waitTimer - dt * 2);
    }
    if (!car.overtake && car.waitTimer > TRAFFIC.overtakeAfter) {
      car.overtake = true;
      car.overtakeTimer = 0;
      // Where the overtake started along the road: the car stays in the far
      // lane until it is well past the blockage, not just until the car ahead
      // leaves its narrow look-ahead band (which it does the moment it pulls
      // out — ending the overtake while still behind the blockage).
      car.overtakeFrom = car.axis === 'y' ? car.y : car.x;
    }
    if (car.overtake) {
      car.overtakeTimer += dt;
      // Overtaking ignores the car ahead and aims for the far lane.
      targetSpeed = TRAFFIC.maxSpeed;
      const alongNow = car.axis === 'y' ? car.y : car.x;
      const passed = Math.abs(alongNow - car.overtakeFrom) > 220;
      if (car.overtakeTimer > 5 || passed) {
        car.overtake = false;
        car.waitTimer = 0;
      }
    }
    if (car.waitTimer > TRAFFIC.impatientAfter) car.forceTurn = true;
    car.speed += clamp(targetSpeed - car.speed, -220 * dt, 240 * dt);
    // Ease the lane offset toward its target: the home lane, or the far lane
    // while overtaking. The snap in the old code is what made queues look rigid.
    const homeLane = car.dir === 1 ? 16 : -16;
    const targetLane = car.overtake ? -homeLane : homeLane;
    car.lane += clamp(targetLane - car.lane, -90 * dt, 90 * dt);
    // Advance along the road.
    const along = car.axis === 'y' ? car.y : car.x;
    const crossRoads = car.axis === 'y' ? WORLD.roadsY : WORLD.roadsX;
    let turned = false;
    for (const cross of crossRoads) {
      const d = (cross - along) * car.dir;
      if (d > 0 && d < Math.abs(car.speed) * dt + 6 && (car.forceTurn || random() < TRAFFIC.turnChance)) {
        const newDir = random() < 0.5 ? 1 : -1;
        const newAxis = car.axis === 'y' ? 'x' : 'y';
        if (newAxis === 'x') {
          car.y = cross + (newDir === 1 ? 16 : -16);
          car.axis = 'x';
          car.line = cross;
          car.dir = newDir;
          car.angle = newDir === 1 ? 0 : Math.PI;
        } else {
          car.x = cross + (newDir === 1 ? 16 : -16);
          car.axis = 'y';
          car.line = cross;
          car.dir = newDir;
          car.angle = newDir === 1 ? Math.PI / 2 : -Math.PI / 2;
        }
        car.lane = newDir === 1 ? 16 : -16;
        car.forceTurn = false;
        car.waitTimer = 0;
        turned = true;
        break;
      }
    }
    if (!turned) {
      if (car.axis === 'y') {
        car.y += car.dir * car.speed * dt;
        car.x = car.line + car.lane;
        if (car.y < 60) { car.y = 60; car.dir = 1; car.angle = Math.PI / 2; car.lane = 16; }
        if (car.y > WORLD.beachY - 100) { car.y = WORLD.beachY - 100; car.dir = -1; car.angle = -Math.PI / 2; car.lane = -16; }
      } else {
        car.x += car.dir * car.speed * dt;
        car.y = car.line + car.lane;
        if (car.x < 60) { car.x = 60; car.dir = 1; car.angle = 0; car.lane = 16; }
        if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.dir = -1; car.angle = Math.PI; car.lane = -16; }
      }
    }
  }

  function updatePoliceCar(dt, car) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const desired = Math.atan2(dy, dx);
    const diff = angleDiff(car.angle, desired);
    car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    const targetSpeed = dist > 120 ? POLICE.chaseSpeed : 260;
    car.speed += clamp(targetSpeed - car.speed, -400 * dt, 320 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 40, WORLD.width - 40);
    car.y = clamp(car.y, 40, WORLD.height - 40);
    collideBuildings(city.buildings, car, 24);
    if (car.y > WORLD.oceanY - 20) car.y = WORLD.oceanY - 20;
    // Ram the player's car, with a long cooldown, and the ram hurts the
    // police car too: a cop that is too battered gives up and rejoins traffic.
    if (player.inCar && dist < 58) {
      car.ramTimer -= dt;
      if (car.ramTimer <= 0) {
        car.ramTimer = 2.0;
        player.inCar.health -= 2;
        car.health -= 3;
        burst(car.x, car.y, '#ffd23d', 4, 120, 0.35, 3);
        if (car.health < 35) {
          car.kind = 'traffic';
          car.color = randomPick(random, PALETTE.carColors);
          car.maxSpeed = CAR.maxSpeed;
          car.axis = nearestRoad(car.x, car.y).axis;
          car.line = nearestRoad(car.x, car.y).line;
          car.dir = 1;
          car.speed = 140;
        }
      }
      player.inCar.speed *= 0.995;
    }
    // On foot: a cop gets out and chases.
    if (!player.inCar && dist < 220 && dist > 40) {
      const cop = makePed('cop', car.x + 20, car.y, PALETTE.cop);
      cop.state = 'chase';
      state.peds.push(cop);
      car.kind = 'traffic';
      car.axis = nearestRoad(car.x, car.y).axis;
      car.line = nearestRoad(car.x, car.y).line;
      car.dir = 1;
      car.speed = 140;
      car.color = randomPick(random, PALETTE.carColors);
    }
  }

  /** Is a thug fight in progress right now (warehouse, club defence, bank
   * hold-up or the docks' last stand)? The thugs only shoot when one is. */
  function combatActive() {
    return (state.missionIndex === 2 && state.missionStep === 1)
      || (state.missionIndex === 3 && state.missionStep === 1)
      || (state.missionIndex === 4 && state.missionStep === 1)
      || (state.missionIndex === 5 && state.missionStep === 1);
  }

  function updatePed(dt, ped) {
    if (ped.dead) return;
    if (ped.state === 'down') {
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) {
        ped.state = 'flee';
        ped.stateTimer = 3;
      }
      return;
    }
    if (ped.state === 'idle') {
      // A stroller stopped to look around; stand still until the timer ends.
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) ped.state = 'walk';
      return;
    }
    if (ped.state === 'wait') {
      // A taxi passenger waiting at the kerb: stand still until the fare is
      // collected or cancelled, then walk off.
      ped.stateTimer -= dt;
      if (ped.stateTimer <= 0) ped.state = 'walk';
      return;
    }
    if (ped.kind === 'thug' && combatActive()) {
      const d = distance(ped.x, ped.y, player.x, player.y);
      if (d < 420) {
        ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
        if (d > 200) {
          ped.x += Math.cos(ped.angle) * 90 * dt;
          ped.y += Math.sin(ped.angle) * 90 * dt;
        }
        ped.fireTimer -= dt;
        if (ped.fireTimer <= 0 && d < 320) {
          ped.fireTimer = 1.1 + random() * 0.6;
          if (random() < 0.55) {
            player.health -= 7;
            player.regenTimer = 4;
            burst(player.x, player.y, '#e5534b', 4, 100, 0.3, 3);
          }
          shootAt(ped.x, ped.y, player.x + (random() - 0.5) * 30, player.y + (random() - 0.5) * 30, 0, false);
        }
        return;
      }
    }
    if (ped.kind === 'cop' && ped.state === 'chase') {
      const d = distance(ped.x, ped.y, player.x, player.y);
      if (player.inCar || d > 700) {
        ped.state = 'walk';
        return;
      }
      ped.angle = Math.atan2(player.y - ped.y, player.x - ped.x);
      const speed = 210;
      ped.x += Math.cos(ped.angle) * speed * dt;
      ped.y += Math.sin(ped.angle) * speed * dt;
      collideBuildings(city.buildings, ped, 10);
      if (d < 30) {
        ped.punchTimer -= dt;
        if (ped.punchTimer <= 0) {
          ped.punchTimer = 0.8;
          player.health -= 8;
          player.regenTimer = 4;
        }
        player.bustTimer += dt;
      } else {
        player.bustTimer = Math.max(0, player.bustTimer - dt);
      }
      return;
    }
    // A fast car bearing down makes pedestrians run for it, off the road.
    if (ped.state !== 'flee') {
      for (const car of state.cars) {
        if (car.dead || Math.abs(car.speed) < 80) continue;
        const d = distance(ped.x, ped.y, car.x, car.y);
        if (d < 110) {
          ped.state = 'flee';
          ped.stateTimer = 2;
          ped.angle = Math.atan2(ped.y - car.y, ped.x - car.x);
          break;
        }
      }
    }
    if (ped.state === 'flee') {
      ped.stateTimer -= dt;
      const fleeSpeed = ped.speed * 2.6;
      ped.x = clamp(ped.x + Math.cos(ped.angle) * fleeSpeed * dt, 20, WORLD.width - 20);
      ped.y = clamp(ped.y + Math.sin(ped.angle) * fleeSpeed * dt, 20, WORLD.beachY - 10);
      collideBuildings(city.buildings, ped, 10);
      if (ped.stateTimer <= 0) {
        ped.state = 'walk';
        const road = nearestRoad(ped.x, ped.y);
        ped.axis = road.axis;
        ped.line = road.line;
        ped.dir = 1;
      }
      return;
    }
    // Ordinary walking: along a sidewalk, turning at intersections.
    // Joggers keep their pace; strollers dawdle and stop to look around.
    let speed = ped.speed;
    if (ped.pace === 'stroll' && random() < 0.002) {
      ped.stateTimer = 1.5;
      ped.state = 'idle';
    }
    const crossRoads = ped.axis === 'y' ? WORLD.roadsY : WORLD.roadsX;
    const along = ped.axis === 'y' ? ped.y : ped.x;
    for (const cross of crossRoads) {
      const d = (cross - along) * ped.dir;
      if (d > 0 && d < speed * dt + 4) {
        if (ped.state === 'flee' || random() < 0.35) {
          const newDir = random() < 0.5 ? 1 : -1;
          const offset = SIDEWALK_OFFSET;
          if (ped.axis === 'y') {
            ped.axis = 'x';
            ped.line = cross;
            ped.dir = newDir;
            ped.y = cross + (newDir === 1 ? offset : -offset);
          } else {
            ped.axis = 'y';
            ped.line = cross;
            ped.dir = newDir;
            ped.x = cross + (newDir === 1 ? offset : -offset);
          }
        }
        break;
      }
    }
    if (ped.axis === 'y') {
      ped.y += ped.dir * speed * dt;
      ped.x = ped.line + (ped.dir === 1 ? SIDEWALK_OFFSET : -(SIDEWALK_OFFSET));
      ped.angle = ped.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      if (ped.y < 60) { ped.y = 60; ped.dir = 1; }
      if (ped.y > WORLD.beachY - 10) { ped.y = WORLD.beachY - 10; ped.dir = -1; }
    } else {
      ped.x += ped.dir * speed * dt;
      ped.y = ped.line + (ped.dir === 1 ? SIDEWALK_OFFSET : -(SIDEWALK_OFFSET));
      ped.angle = ped.dir === 1 ? 0 : Math.PI;
      if (ped.x < 60) { ped.x = 60; ped.dir = 1; }
      if (ped.x > WORLD.width - 60) { ped.x = WORLD.width - 60; ped.dir = -1; }
    }
  }

  function updateCars(dt) {
    // Player car vs traffic cars: bump and damage.
    const pc = player.inCar;
    for (const car of state.cars) {
      if (car.dead) continue;
      if (car.kind === 'traffic') updateTrafficCar(dt, car);
      else if (car.kind === 'police') updatePoliceCar(dt, car);
      else if (car.kind === 'parked' || car.kind === 'sports' || car.kind === 'bike' || car.kind === 'truck') {
        // Parked cars sit still; their speed decays if they were rolling.
        // Bikes and trucks park the same way — the race rivals are the only
        // cars this loop does not move, and the race module drives those.
        car.speed *= 0.9;
      }
      if (pc && car !== pc && !car.dead) {
        const d = distance(pc.x, pc.y, car.x, car.y);
        if (d < 48 && d > 0.01) {
          const push = (48 - d) / 2;
          const nx = (pc.x - car.x) / d;
          const ny = (pc.y - car.y) / d;
          pc.x += nx * push;
          pc.y += ny * push;
          car.x -= nx * push;
          car.y -= ny * push;
          const impact = Math.abs(pc.speed - car.speed);
          if (impact > 200 && pc.hitTimer <= 0) {
            pc.hitTimer = 0.5;
            pc.health -= impact * 0.008;
            car.health -= impact * 0.008;
            burst(pc.x, pc.y, '#ffd23d', 5, 130, 0.35, 3);
            pc.speed *= 0.7;
          }
        }
      }
    }
    // Cars that were destroyed are removed; traffic is topped back up.
    state.cars = state.cars.filter((car) => !car.dead);
    let trafficCount = 0;
    for (const car of state.cars) if (car.kind === 'traffic') trafficCount += 1;
    if (trafficCount < TRAFFIC.count - 6 && state.cars.length < 55 && random() < 0.05) {
      const car = spawnTrafficCar(player.x, player.y);
      if (car) state.cars.push(car);
    }
    // Police presence matches the wanted level.
    let policeCount = 0;
    for (const car of state.cars) if (car.kind === 'police') policeCount += 1;
    if (state.wanted > 0 && policeCount < Math.min(state.wanted, MAX_POLICE_CARS) && state.cars.length < 70) {
      const car = spawnPoliceCar();
      if (car) state.cars.push(car);
    }
    if (state.wanted === 0) {
      for (const car of state.cars) {
        if (car.kind === 'police') car.kind = 'traffic';
      }
    }
  }

  function updatePeds(dt) {
    let events = 0;
    // A car hitting a pedestrian knocks them down and is a crime.
    for (const ped of state.peds) {
      if (ped.dead || ped.state === 'down') continue;
      for (const car of state.cars) {
        if (car.dead || car.kind === 'police' || Math.abs(car.speed) < 60) continue;
        if (distance(ped.x, ped.y, car.x, car.y) < 24) {
          ped.state = 'down';
          ped.stateTimer = 3;
          burst(ped.x, ped.y, '#fff2b0', 6, 130, 0.4, 3);
          if (car === player.inCar) {
            state.pedsHit += 1;
            addCrime(1);
            events |= EVENT_CRIME;
            showToast('PEDESTRIAN HIT — WANTED UP', 2);
          }
          break;
        }
      }
    }
    for (const ped of state.peds) updatePed(dt, ped);
    state.peds = state.peds.filter((ped) => !ped.dead);
    // Keep the streets busy, but cap the crowd.
    let count = 0;
    for (const ped of state.peds) if (ped.kind === 'ped') count += 1;
    if (count < PEDS.count - 10 && state.peds.length < 60 && random() < 0.06) {
      const ped = spawnPed(player.x, player.y);
      if (ped) state.peds.push(ped);
    }
    return events;
  }

  function updateParticles(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      if (p.kind === 'smoke') p.y -= 20 * dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);
  }

  function updatePickups(dt) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      if (distance(player.x, player.y, pickup.x, pickup.y) < 44) {
        pickup.active = false;
        pendingEvents |= EVENT_PICKUP;
        if (pickup.kind === 'cash') {
          player.cash += 100;
          state.cash = player.cash;
          showToast('STASH FOUND — +$100', 2);
        } else if (pickup.kind === 'ammo') {
          player.ammoByWeapon.pistol += 30;
          if (player.weapon === 'pistol') syncAmmo(player);
          showToast('+30 PISTOL AMMO', 2);
        } else if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + 40);
          showToast('+40 HEALTH', 2);
        } else if (pickup.kind === 'shotgun' || pickup.kind === 'smg') {
          // A new gun: it joins the armoury, loads up, and goes straight
          // into Rico's hands.
          giveWeapon(player, pickup.kind);
          showToast(pickup.kind === 'shotgun' ? 'SHOTGUN FOUND — 1/2/3 TO SWITCH' : 'SMG FOUND — 1/2/3 TO SWITCH', 3);
        }
      }
    }
    state.pickups = state.pickups.filter((p) => p.active);
  }

  /** How hot the player is: stars plus the nearest police car's distance. */
  function updateHeat() {
    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      nearest = Math.min(nearest, distance(car.x, car.y, player.x, player.y));
    }
    const proximity = nearest === Infinity ? 0 : clamp(1 - nearest / POLICE.heatRange, 0, 1);
    const target = state.wanted === 0 ? 0 : clamp(state.wanted / 5 * 0.7 + proximity * 0.5, 0, 1);
    state.heat += (target - state.heat) * 0.06;
  }

  function updateCamera(dt) {
    const targetZoom = player.inCar ? 0.82 : 1;
    state.camera.zoom += (targetZoom - state.camera.zoom) * Math.min(1, dt * 2);
    const z = state.camera.zoom;
    const halfW = (VIEW.width / 2) / z;
    const halfH = (VIEW.height / 2) / z;
    const tx = clamp(player.x, halfW, WORLD.width - halfW);
    const ty = clamp(player.y, halfH, WORLD.height - halfH);
    state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
  }

  /** One fixed step. `input` carries the held keys, one-shot presses and the aim point. */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.time += dt;
    state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;

    // The sky rolls on whether Rico is playing or not, so the title screen
    // lives under the same weather the game does — and a strike on the title
    // still flashes, even though nobody hears it there.
    events |= updateWeather(dt, state.weather, random);

    // Wanted level decays when the player stays clean.
    if (state.wanted > 0) {
      state.crimeTimer += dt;
      if (state.crimeTimer > POLICE.decaySeconds) {
        state.wanted -= 1;
        state.crimeTimer = 0;
        if (state.wanted === 0) showToast('YOU LOST THE COPS', 2.5);
      }
    }

    if (!harmless) {
      events |= updatePlayer(dt, input);
      updateMission(dt);
      // The side of the city that pays: a taxi fare, a street race, and the
      // hidden packages, all running alongside the story.
      const sideApi = { random, showToast, showBanner };
      events |= updateTaxi(dt, state, sideApi);
      events |= updateRace(dt, state, sideApi);
      events |= updatePackages(dt, state, sideApi);
      events |= pendingEvents;
      pendingEvents = 0;
      if (player.health <= 0) {
        player.health = 0;
        return EVENT_WASTED;
      }
      if (player.bustTimer >= POLICE.bustSeconds) {
        return EVENT_BUSTED;
      }
    }
    updateCars(dt);
    events |= updatePeds(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateHeat();
    updateAmbient(dt, state, state.ambient);
    state.district = districtAt(player.x, player.y);
    updateCamera(dt);
    return events;
  }

  function respawn(reason) {
    const lost = Math.min(player.cash, reason === 'busted' ? 200 : 150);
    player.cash -= lost;
    state.cash = player.cash;
    player.health = PLAYER.health;
    player.bustTimer = 0;
    state.wanted = 0;
    state.crimeTimer = 0;
    state.heat = 0;
    state.missionTimer = 0;
    state.maraRiding = false;
    if (player.inCar) {
      player.inCar.kind = 'parked';
      player.inCar = null;
    }
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y + 60;
    player.angle = -Math.PI / 2;
    state.camera.x = player.x;
    state.camera.y = player.y;
    // A wasted or busted Rico loses his fare and his race along with his
    // cash: the passenger walks off, the rivals drive away, and the flag is
    // back up for the next attempt.
    cancelTaxi(state, random);
    cancelRace(state);
    cancelStormRun(state);
    showToast(reason === 'busted' ? `BUSTED — you lost $${lost}` : `WASTED — you lost $${lost}`, 3);
  }

  reset();
  return {
    state,
    city,
    reset,
    step,
    respawn,
    addCrime,
    showToast,
    showBanner,
    spawnPoliceCar,
    nearestCar,
    honk,
    // Helpers the screenshot scenes use to stage a lively frame.
    debug: {
      placePlayerInCar(car, x, y, angle) {
        player.inCar = car;
        car.kind = 'player';
        car.health = Math.max(car.health, 140);
        car.x = x;
        car.y = y;
        car.angle = angle;
        car.speed = 260;
        player.x = x;
        player.y = y;
        player.angle = angle;
        state.camera.x = x;
        state.camera.y = y;
      },
      setWanted(stars) {
        state.wanted = stars;
        state.crimeTimer = 0;
      },
      setTimeOfDay(t) {
        state.timeOfDay = t;
      },
      setWeather(kind) {
        setWeatherKind(state.weather, kind, random);
      },
      setMission(index, stepIndex) {
        state.missionIndex = index;
        state.missionStep = stepIndex;
        if (index === 1) {
          setMissionText(MISSIONS[1].brief);
          setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
        } else if (index === 2) {
          setMissionText(MISSIONS[2].brief);
          setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
        } else if (index === 3) {
          setMissionText(MISSIONS[3].brief);
          setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
        } else if (index === 4) {
          setMissionText(MISSIONS[4].brief);
          setMissionTarget(PLACES.bank.x, PLACES.bank.y, PLACES.bank.label);
        } else if (index === 5) {
          setMissionText(MISSIONS[5].brief);
          setMissionTarget(PLACES.docks.x, PLACES.docks.y, PLACES.docks.label);
        } else if (index === 6) {
          setMissionText(MISSIONS[6].brief);
          setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
        }
      },
      spawnPolice(n) {
        for (let i = 0; i < n; i += 1) {
          const car = spawnPoliceCar();
          if (car) state.cars.push(car);
        }
      },
      spawnClubThugs() {
        spawnClubThugs();
      },
      spawnBankThugs() {
        spawnBankThugs({
          state, player, random, distance, addCrime, showToast, showBanner,
          setMissionText, setMissionTarget, missionComplete, spawnThugsAt,
        });
      },
    },
  };
}
