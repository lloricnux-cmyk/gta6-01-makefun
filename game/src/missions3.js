// Mission seven: The Storm Run. A storm is rolling in off the bay, and Dex
// in the orange Comet wants $5,000 for beating Rico across the whole city:
// five checkpoints from the Beach Road to the Starfish Club, in the wet,
// while the lightning comes down. The checkpoints sit on road crossings and
// consecutive ones share a road, so a rival that drives straight stays on
// the asphalt — the same rule the street race's rivals follow.
//
// The world owns the mission slot machine (index, step, target, text) and
// the weather; this module owns what the seventh mission means, one step at
// a time. The api it takes is the world's own helpers, handed in as an
// object so this file never has to reach into the world's closures.
import { MISSIONS, STORM_RUN, WORLD } from './config.js';
import { clamp } from './random.js';

/** The start line: the Beach Lot, where Rico rolls in with a car and the
 * storm comes down. */
const STORM_START = { x: 2480, y: 2000, label: 'Beach Lot' };

/** The run itself: five stops from the Beach Road to the club, each on a road
 * crossing, each leg sharing a road with the next so the rival's straight
 * lines never cut through a building, and every turn a ninety-degree one —
 * the course never doubles back on itself, so nobody has to U-turn at speed.
 * The last leg is a long straight north up the downtown boulevard to the
 * club's door, so a driver who brakes for the corner still gets a clean run
 * at the flag. The Beach Lot itself is the start line, not a checkpoint —
 * the run begins the moment Rico rolls in. */
const STORM_POINTS = [
  { x: 2480, y: 1840, label: 'Beach Road' },
  { x: 240, y: 1840, label: 'The Docks' },
  { x: 240, y: 1520, label: 'West Row' },
  { x: 1520, y: 1520, label: 'Downtown' },
  { x: 1520, y: 760, label: 'Starfish Club' },
];

/** A run that has not started yet: idle, no rival on the road. */
export function createStormRun() {
  return { phase: 'idle', index: 0, timer: 0, rival: null };
}

/** Dex, in the orange Comet: an ordinary car shape with a checkpoint to
 * chase. The world never moves it — this module drives it, the way the
 * street race drives its rivals. */
function makeStormRival(x, y) {
  return {
    kind: 'racer',
    x,
    y,
    angle: 0,
    speed: 0,
    color: '#ff5a3c',
    health: 200,
    maxSpeed: STORM_RUN.rivalSpeed,
    length: 52,
    width: 26,
    hitTimer: 0,
    dead: false,
    targetIndex: 0,
    finished: false,
  };
}

/** Steer one rival at its next checkpoint: turn toward it, build speed, and
 * stay inside the city. Straight lines only — the checkpoints share roads,
 * so straight is on the asphalt — and Dex brakes for a sharp corner the way
 * a real driver would, instead of sliding through the buildings. */
function driveRival(dt, rival, target) {
  const want = Math.atan2(target.y - rival.y, target.x - rival.x);
  let diff = want - rival.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rival.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
  const targetSpeed = Math.abs(diff) > 0.6 ? 200 : rival.maxSpeed;
  if (rival.speed < targetSpeed) rival.speed = Math.min(targetSpeed, rival.speed + 300 * dt);
  else rival.speed = Math.max(targetSpeed, rival.speed - 400 * dt);
  rival.x += Math.cos(rival.angle) * rival.speed * dt;
  rival.y += Math.sin(rival.angle) * rival.speed * dt;
  rival.x = clamp(rival.x, 40, WORLD.width - 40);
  rival.y = clamp(rival.y, 40, WORLD.height - 40);
}

/** The run begins: the sky turns to storm, Dex pulls up beside Rico, and
 * the clock starts. */
function startStormRun(api) {
  const { state } = api;
  const run = state.stormRun;
  run.phase = 'running';
  run.index = 0;
  run.timer = STORM_RUN.timeLimit;
  state.missionStep = 1;
  api.setWeather('storm');
  const rival = makeStormRival(STORM_START.x - 50, STORM_START.y + 30);
  run.rival = rival;
  state.cars.push(rival);
  api.setMissionTarget(STORM_POINTS[0].x, STORM_POINTS[0].y, STORM_POINTS[0].label);
  api.setMissionText(`Storm Run — checkpoint 1/${STORM_POINTS.length} · ${STORM_RUN.timeLimit}s · Dex 1/${STORM_POINTS.length}`);
  api.showToast('THE STORM RUN — BEAT DEX TO THE CLUB', 3);
}

/** The run is over without a win: Dex drives off, the crew regroups at the
 * Beach Lot, and the mission waits to be run again. */
function failStormRun(api, message) {
  const { state } = api;
  cancelStormRun(state);
  state.missionStep = 0;
  api.setMissionText(MISSIONS[6].brief);
  api.setMissionTarget(STORM_START.x, STORM_START.y, STORM_START.label);
  api.showToast(message, 3);
}

/** Rico took the last checkpoint first: the rival drives off, the win goes
 * on the ledger, and the story pays out. */
function winStormRun(api) {
  const { state } = api;
  const run = state.stormRun;
  if (run.rival) run.rival.dead = true;
  run.rival = null;
  run.phase = 'done';
  state.stats.stormsWon += 1;
  state.weather.stormsWon += 1;
  api.showToast('YOU BEAT DEX IN THE STORM', 3);
  api.missionComplete();
}

/** Call the run off: the rival drives off and the flag is back up. A wasted
 * or busted Rico loses the run the same way he loses a fare. */
export function cancelStormRun(state) {
  const run = state.stormRun;
  if (!run) return;
  if (run.rival) run.rival.dead = true;
  run.rival = null;
  run.phase = 'idle';
  run.index = 0;
  run.timer = 0;
}

/** Mission 7, one step at a time. The world calls this from its mission
 * update when the mission index is 6, with an api of its own helpers. */
export function updateStormRun(dt, api) {
  const { state, player } = api;
  const run = state.stormRun;
  if (!run) return;
  if (run.phase === 'idle') {
    if (state.missionStep === 0 && player.inCar
      && api.distance(player.x, player.y, STORM_START.x, STORM_START.y) < STORM_RUN.triggerRadius) {
      startStormRun(api);
    }
    return;
  }
  // Running: the clock, the rival, and the checkpoints.
  run.timer -= dt;
  const rival = run.rival;
  if (rival && !rival.finished) {
    driveRival(dt, rival, STORM_POINTS[rival.targetIndex]);
    const point = STORM_POINTS[rival.targetIndex];
    if (api.distance(rival.x, rival.y, point.x, point.y) < STORM_RUN.checkpointRadius) {
      rival.targetIndex += 1;
      if (rival.targetIndex >= STORM_POINTS.length) rival.finished = true;
    }
  }
  if (rival && rival.finished) {
    failStormRun(api, 'DEX BEAT YOU IN THE STORM — RUN IT AGAIN');
    return;
  }
  const point = STORM_POINTS[run.index];
  if (api.distance(player.x, player.y, point.x, point.y) < STORM_RUN.checkpointRadius) {
    run.index += 1;
    if (run.index >= STORM_POINTS.length) {
      winStormRun(api);
      return;
    }
    api.setMissionTarget(STORM_POINTS[run.index].x, STORM_POINTS[run.index].y, STORM_POINTS[run.index].label);
    api.showToast(`CHECKPOINT ${run.index}/${STORM_POINTS.length}`, 1.5);
  }
  api.setMissionText(`Storm Run — checkpoint ${run.index + 1}/${STORM_POINTS.length} · ${Math.max(0, Math.ceil(run.timer))}s · Dex ${rival ? rival.targetIndex + 1 : 1}/${STORM_POINTS.length}`);
  if (run.timer <= 0) failStormRun(api, 'THE STORM OUTRAN YOU — RUN IT AGAIN');
}

/** The briefing lines the phone shows for the last mission, so the player
 * can read what is coming before it starts. */
export function stormRunBrief() {
  return [
    'M7 · The Storm Run — $5,000',
    'A storm is rolling in off the bay.',
    'Bring a car to the Beach Lot and race',
    'Dex through five checkpoints home.',
  ];
}
