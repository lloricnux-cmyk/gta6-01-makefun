// The game's rules and state, with no drawing and no browser in it: the player on
// foot and in cars, traffic, pedestrians, police and the wanted level, the three
// missions and the story, combat, particles, the camera and the clock. step()
// advances one fixed step and returns what happened as bit flags, so the caller can
// react (sounds, announcements) without the world knowing about screens or audio.
// Nothing here allocates after createWorld returns, apart from the small particle
// pool churn, which the cap keeps bounded.
import { CAR, MISSIONS, PALETTE, PEDS, PLAYER, POLICE, TRAFFIC, VIEW, WORLD } from './config.js';
import { angleDiff, clamp, distance, randomInt, randomPick } from './random.js';
import { PLACES, buildCity, buildingAt, collideBuildings, nearestRoad, onRoad } from './city.js';

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
    smokeTimer: 0, dead: false,
  };
}

function makePed(kind, x, y, color) {
  return {
    kind, x, y, angle: 0, speed: 0, color,
    health: kind === 'thug' ? 60 : 30,
    axis: 'y', dir: 1, line: x, along: y,
    state: 'walk', stateTimer: 0, fireTimer: 0, punchTimer: 0,
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
    thugsLeft: 0,
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
    ped.speed = PEDS.minSpeed + random() * (PEDS.maxSpeed - PEDS.minSpeed);
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

  function spawnThugs() {
    const spots = [
      { x: PLACES.warehouse.x - 60, y: PLACES.warehouse.y - 40 },
      { x: PLACES.warehouse.x + 40, y: PLACES.warehouse.y - 70 },
      { x: PLACES.warehouse.x - 30, y: PLACES.warehouse.y + 60 },
      { x: PLACES.warehouse.x + 80, y: PLACES.warehouse.y + 30 },
      { x: PLACES.warehouse.x, y: PLACES.warehouse.y - 110 },
    ];
    for (const spot of spots) {
      const thug = makePed('thug', spot.x, spot.y, PALETTE.thug);
      thug.state = 'guard';
      state.peds.push(thug);
    }
    state.thugsLeft = spots.length;
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
    state.thugsLeft = 0;
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
    state.cars.push(comet);
    state.comet = comet;
  }

  function missionComplete() {
    const mission = MISSIONS[state.missionIndex];
    player.cash += mission.reward;
    state.cash = player.cash;
    pendingEvents |= EVENT_MISSION;
    showBanner(`MISSION PASSED  ·  +$${mission.reward}`, 3.2);
    state.missionIndex += 1;
    state.missionStep = 0;
    if (state.missionIndex === 1) {
      player.armed = true;
      player.ammo = PLAYER.startAmmo;
      setMissionText(MISSIONS[1].brief);
      setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
      showToast('Mara gave you a pistol. Watch the cops.', 4);
    } else if (state.missionIndex === 2) {
      setMissionText(MISSIONS[2].brief);
      setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
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
          spawnThugs();
          setMissionText(`Clear the warehouse — ${state.thugsLeft} Los Diablos thugs left.`);
          showToast('THEY ARE ARMED. GOOD LUCK.', 3);
        }
      } else if (state.missionStep === 1) {
        setMissionText(`Clear the warehouse — ${state.thugsLeft} Los Diablos thugs left.`);
        if (state.thugsLeft <= 0) {
          state.missionStep = 2;
          state.pickups.push({ x: PLACES.warehouse.x, y: PLACES.warehouse.y, kind: 'cash', amount: 0, active: true });
          setMissionText('Warehouse clear. Grab the cash, then get back to Mara.');
          setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
        }
      } else if (state.missionStep === 2) {
        const cash = state.pickups.find((p) => p.active && p.kind === 'cash');
        if (!cash) {
          state.missionStep = 3;
          setMissionText('Cash in hand. Get back to Mara at the Starfish Club.');
          setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
        }
      } else if (state.missionStep === 3) {
        if (distance(px, py, PLACES.club.x, PLACES.club.y) < 80) missionComplete();
      }
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

  function updatePlayer(dt, input) {
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.fireTimer > 0) player.fireTimer -= dt;
    if (player.regenTimer > 0) player.regenTimer -= dt;
    else if (player.health < PLAYER.health && state.wanted === 0) {
      player.health = Math.min(PLAYER.health, player.health + 2 * dt);
    }
    const car = player.inCar;
    if (car) {
      // Driving.
      const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
      if (input.up) car.speed += CAR.accel * dt;
      if (input.down) {
        if (car.speed > 10) car.speed -= CAR.brake * dt;
        else car.speed -= CAR.accel * 0.55 * dt;
      }
      car.speed -= car.speed * 0.45 * dt;
      if (input.handbrake) car.speed -= car.speed * 2.2 * dt;
      car.speed = clamp(car.speed, -CAR.reverseMax, car.maxSpeed);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      const steerFactor = clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed < 0 ? -1 : 1);
      car.angle += steer * CAR.steerRate * steerFactor * dt;
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
      let hitSomething = false;
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
            hitSomething = true;
          }
        }
      }
      return EVENT_PUNCH;
    }
    if (input.shootHeld && player.armed && player.ammo > 0 && player.fireTimer <= 0) {
      player.fireTimer = PLAYER.fireInterval;
      player.ammo -= 1;
      return shootAt(player.x, player.y, input.aimX, input.aimY, PLAYER.shootDamage, true);
    }
    return 0;
  }

  function updateTrafficCar(dt, car) {
    if (car.kind !== 'traffic') return;
    // Slow for a car ahead in the same lane.
    let targetSpeed = TRAFFIC.maxSpeed;
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      if (other.axis !== car.axis || other.line !== car.line || other.dir !== car.dir) continue;
      const ahead = car.axis === 'y' ? (other.y - car.y) * car.dir : (other.x - car.x) * car.dir;
      if (ahead > 0 && ahead < 90) {
        targetSpeed = 0;
        break;
      }
      if (ahead > 0 && ahead < 170) targetSpeed = Math.min(targetSpeed, 70);
    }
    car.speed += clamp(targetSpeed - car.speed, -220 * dt, 240 * dt);
    // Advance along the road.
    const along = car.axis === 'y' ? car.y : car.x;
    const crossRoads = car.axis === 'y' ? WORLD.roadsY : WORLD.roadsX;
    let turned = false;
    for (const cross of crossRoads) {
      const d = (cross - along) * car.dir;
      if (d > 0 && d < Math.abs(car.speed) * dt + 6 && random() < TRAFFIC.turnChance) {
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
        turned = true;
        break;
      }
    }
    if (!turned) {
      if (car.axis === 'y') {
        car.y += car.dir * car.speed * dt;
        car.x = car.line + (car.dir === 1 ? 16 : -16);
        if (car.y < 60) { car.y = 60; car.dir = 1; car.angle = Math.PI / 2; }
        if (car.y > WORLD.beachY - 100) { car.y = WORLD.beachY - 100; car.dir = -1; car.angle = -Math.PI / 2; }
      } else {
        car.x += car.dir * car.speed * dt;
        car.y = car.line + (car.dir === 1 ? 16 : -16);
        if (car.x < 60) { car.x = 60; car.dir = 1; car.angle = 0; }
        if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.dir = -1; car.angle = Math.PI; }
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
    if (ped.kind === 'thug' && state.missionIndex === 2 && state.missionStep === 1) {
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
    let speed = ped.speed;
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
      else if (car.kind === 'parked' || car.kind === 'sports') {
        // Parked cars sit still; their speed decays if they were rolling.
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
        if (pickup.kind === 'cash') showToast('CASH GRABBED', 2);
        else if (pickup.kind === 'ammo') {
          player.ammo += 30;
          showToast('+30 AMMO', 2);
        } else if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + 40);
          showToast('+40 HEALTH', 2);
        }
      }
    }
    state.pickups = state.pickups.filter((p) => p.active);
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
    state.timeOfDay = (state.timeOfDay + dt / 360) % 1;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.toastTimer > 0) state.toastTimer -= dt;

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
    if (player.inCar) {
      player.inCar.kind = 'parked';
      player.inCar = null;
    }
    player.x = PLACES.hospital.x;
    player.y = PLACES.hospital.y + 60;
    player.angle = -Math.PI / 2;
    state.camera.x = player.x;
    state.camera.y = player.y;
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
      setMission(index, stepIndex) {
        state.missionIndex = index;
        state.missionStep = stepIndex;
        if (index === 1) {
          setMissionText(MISSIONS[1].brief);
          setMissionTarget(PLACES.beachLot.x, PLACES.beachLot.y, PLACES.beachLot.label);
        } else if (index === 2) {
          setMissionText(MISSIONS[2].brief);
          setMissionTarget(PLACES.warehouse.x, PLACES.warehouse.y, PLACES.warehouse.label);
        }
      },
      spawnPolice(n) {
        for (let i = 0; i < n; i += 1) {
          const car = spawnPoliceCar();
          if (car) state.cars.push(car);
        }
      },
    },
  };
}
