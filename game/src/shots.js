// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by a
// simple autopilot (drive straight down the boulevard, steering back to the road
// centre), so the frame is what a short game really looks like and the same seed
// always gives the same frame. The start scene is the title over a live city;
// play is a drive through downtown in the red Comet GT — the hero car, not a
// random traffic car — with a one-star wanted level; chase is a three-star
// police pursuit with a smoking car; mission is mission 4's last stand at the
// Starfish Club, thugs closing in at golden hour.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { angleDiff } from './random.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 9;
const CHASE_SECONDS = 8;
const MISSION_SECONDS = 1;

/** No input at all: the world just lives. */
function idleInput() {
  return {
    up: false, down: false, left: false, right: false, run: false, handbrake: false,
    enterPressed: false, punchPressed: false, shootHeld: false, aimX: 0, aimY: 0,
    hornPressed: false,
  };
}

/** The autopilot's route through downtown: road-centre waypoints it steers
 * between, so a shot drive tours the city instead of running to the beach. */
const ROUTE = [
  { x: 1520, y: 1520 },
  { x: 2160, y: 1520 },
  { x: 2160, y: 880 },
  { x: 880, y: 880 },
  { x: 880, y: 1520 },
  { x: 1520, y: 1520 },
];
let routeIndex = 0;

/** Drive along the route, steering toward the next waypoint, and brake for
 * traffic ahead instead of ramming it. Blocked ahead, it swings around the
 * car in front instead of reversing into the car behind it — reversing is
 * what used to let a police car shove the hero car backwards off the road. */
function driveInput(world) {
  const car = world.state.player.inCar;
  const input = idleInput();
  if (!car) return input;
  let wp = ROUTE[routeIndex];
  if (Math.hypot(wp.x - car.x, wp.y - car.y) < 70) {
    routeIndex = (routeIndex + 1) % ROUTE.length;
    wp = ROUTE[routeIndex];
  }
  // Is anything stopped in front of us? Brake early, and swing around it.
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let blocked = false;
  let blockAlong = 0;
  for (const other of world.state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    const perp = Math.abs(-dx * fy + dy * fx);
    if (along > 0 && along < 260 && perp < 34) {
      blocked = true;
      blockAlong = along;
      break;
    }
  }
  let desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  if (blocked) {
    // Aim at a point past the blocker, offset into the far lane, so the car
    // pulls out and goes around instead of stopping behind it.
    const sideX = -Math.sin(desired) * 70;
    const sideY = Math.cos(desired) * 70;
    desired = Math.atan2(wp.y + sideY - car.y, wp.x + sideX - car.x);
  }
  const diff = angleDiff(car.angle, desired);
  input.left = diff < -0.08;
  input.right = diff > 0.08;
  // Keep the speed down so there is room to brake and to turn. Never reverse:
  // holding reverse is what let the police shove the car off the road.
  input.up = car.speed < 300;
  if (blocked && blockAlong < 90 && car.speed > 40) {
    input.up = false;
    input.down = true;
  }
  return input;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best cash to show.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'play') {
    world.reset();
    routeIndex = 0;
    world.debug.setTimeOfDay(0.72);
    // The hero car: Rico drives the red Comet GT itself, so the frame shows
    // the sports car the story is about, not a random teal sedan.
    const comet = state.comet;
    world.debug.placePlayerInCar(comet, 1520, 1080, Math.PI / 2);
    world.debug.setWanted(1);
    world.debug.spawnPolice(1);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, driveInput(world), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'chase') {
    world.reset();
    routeIndex = 0;
    world.debug.setTimeOfDay(0.5);
    const comet = state.comet;
    world.debug.placePlayerInCar(comet, 1520, 1300, Math.PI / 2);
    comet.health = 100;
    world.debug.setWanted(3);
    world.debug.spawnPolice(3);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      world.step(STEP, driveInput(world), false);
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'mission') {
    world.reset();
    world.debug.setTimeOfDay(0.72);
    // Mission 4, mid-fight: Rico on foot outside the Starfish Club, pistol
    // out, Los Diablos thugs closing in from every side.
    world.debug.setMission(3, 1);
    world.debug.spawnClubThugs();
    state.player.armed = true;
    state.player.ammo = 60;
    state.player.x = 1520;
    state.player.y = 830;
    state.player.angle = -Math.PI / 2;
    state.camera.x = 1520;
    state.camera.y = 860;
    world.showBanner('MISSION 4 · LAST STAND', 3.2);
    world.showToast('Hold the Starfish — 6 thugs left.', 4);
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      world.step(STEP, idleInput(), true);
    }
    return { screen: SCREEN_PLAY, best: 3700 };
  }
  // Default: the title over a living city.
  world.reset();
  world.debug.setTimeOfDay(0.3);
  for (let i = 0; i < START_SECONDS / STEP; i += 1) {
    world.step(STEP, idleInput(), true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
