// Every tuning number and colour in one place. Solmar Bay is a top-down open world
// 3200 x 2400 world units: a road grid, a beach and ocean to the south, docks to the
// west, a marina to the south-east, a park and a downtown core. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window and the camera
// follows the player.
//
// The day runs on a 6-minute clock (timeOfDay 0..1): 0.25 is sunrise, 0.5 is noon,
// 0.75 is sunset. The renderer reads the same clock for its golden-hour wash and
// its night veil, so the light and the clock can never disagree.
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** One full day, in seconds of play. */
export const DAY_LENGTH = 360;

export const WORLD = {
  width: 3200,
  height: 2400,
  roadHalf: 34,
  sidewalk: 16,
  // Road centre lines. Blocks sit between neighbouring lines.
  roadsX: [240, 560, 880, 1200, 1520, 1840, 2160, 2480, 2800],
  roadsY: [240, 560, 880, 1200, 1520, 1840],
  beachY: 2060,
  oceanY: 2240,
  harborX: 120,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  runSpeed: 305,
  health: 100,
  punchDamage: 20,
  punchRange: 46,
  punchArc: 1.1,
  shootDamage: 34,
  fireInterval: 0.24,
  startAmmo: 60,
};

export const CAR = {
  length: 52,
  width: 26,
  accel: 300,
  brake: 520,
  maxSpeed: 520,
  sportsMaxSpeed: 660,
  reverseMax: 180,
  steerRate: 2.6,
  grip: 3.2,
  health: 100,
};

/** The two special rides parked around the city: a fast, fragile motorbike and
 * a slow, tough delivery truck. Each has its own length, width, acceleration,
 * top speed and health; the world reads them off the car itself. */
export const VEHICLES = {
  bike: {
    kind: 'bike',
    length: 34,
    width: 14,
    accel: 430,
    maxSpeed: 720,
    reverseMax: 140,
    health: 60,
    steerRate: 3.4,
    color: '#2fd9c9',
  },
  truck: {
    kind: 'truck',
    length: 72,
    width: 30,
    accel: 200,
    maxSpeed: 380,
    reverseMax: 120,
    health: 220,
    steerRate: 1.9,
    color: '#8a6d4b',
  },
};

/** Weapon tuning. The pistol is Rico's starting gun; the shotgun and the SMG
 * are found as pickups — the shotgun at the docks, the SMG at the warehouse. */
export const WEAPONS = {
  pistol: {
    name: 'PISTOL',
    damage: 34,
    interval: 0.24,
    pellets: 1,
    spread: 0,
    range: 560,
    pickupAmmo: 30,
  },
  shotgun: {
    name: 'SHOTGUN',
    damage: 16,
    interval: 0.9,
    pellets: 6,
    spread: 0.35,
    range: 320,
    pickupAmmo: 12,
  },
  smg: {
    name: 'SMG',
    damage: 14,
    interval: 0.09,
    pellets: 1,
    spread: 0.06,
    range: 420,
    pickupAmmo: 60,
  },
};

/** Taxi fares: the passenger's patience, the fare band, and how the clock is
 * set from the trip's length. Fares only come while Rico is driving. */
export const TAXI = {
  fareMin: 80,
  fareMax: 200,
  pickupRadius: 60,
  dropoffRadius: 70,
  requestDelayMin: 8,
  requestDelayMax: 15,
  baseTime: 20,
  timePerUnit: 240,
};

/** The street race: a downtown loop, a countdown, and the prize for winning. */
export const RACE = {
  reward: 600,
  countdownSeconds: 3,
  checkpointRadius: 70,
  rivalSpeed: 430,
  // The cooldown after a race ends: the finish line is also the start
  // line, so without a pause the winner would be entered in the next race
  // before they could drive away.
  cooldown: 10,
  checkpoints: [
    { x: 1520, y: 1520 },
    { x: 2160, y: 1520 },
    { x: 2160, y: 880 },
    { x: 880, y: 880 },
    { x: 880, y: 1520 },
    { x: 1520, y: 1520 },
  ],
};

/** The hidden packages: twenty gold parcels tucked around the city, $50 each. */
export const PACKAGES = {
  count: 20,
  reward: 50,
  radius: 40,
};

export const TRAFFIC = {
  count: 28,
  minSpeed: 110,
  maxSpeed: 185,
  turnChance: 0.3,
  /** Seconds stuck behind a stopped car before a driver tries to overtake it. */
  overtakeAfter: 2.0,
  /** Seconds stuck before a driver gives up waiting and forces a turn. */
  impatientAfter: 6.0,
  /** How far ahead a driver watches for a car to slow for, in world units. */
  lookAhead: 170,
  /** How close a car ahead must be to make a driver stop, in world units. */
  stopGap: 90,
};
export const PEDS = { count: 46, minSpeed: 34, maxSpeed: 62, jogSpeed: 118 };

export const POLICE = {
  maxCars: 5,
  chaseSpeed: 585,
  ramDamage: 6,
  bustSeconds: 1.6,
  // Seconds without a crime before one star drops off.
  decaySeconds: 24,
  /** How far a police car can be and still count as "on your tail" for the heat meter. */
  heatRange: 520,
};

/** The seven-mission story. The first three are Rico's jobs for Mara Solano; the
 * fourth is the crew's last stand at her club, then a timed run to the marina;
 * the fifth is a bank job with a hold-up and a getaway; the sixth is the turf
 * war that decides who owns Solmar Bay; the seventh is a storm race against
 * Dex, from the Beach Lot to the club, while the lightning comes down. */
export const MISSIONS = [
  {
    id: 'pickup',
    name: 'M1 · The Pickup',
    brief: 'Mara needs a package from the docks. Go get it, then bring it to the Starfish Club.',
    reward: 500,
  },
  {
    id: 'hotwheels',
    name: 'M2 · Hot Wheels',
    brief: 'Steal the red Comet GT from the beach lot, lose the cops, deliver it to the chop shop.',
    reward: 1200,
  },
  {
    id: 'thehit',
    name: 'M3 · The Hit',
    brief: 'Los Diablos hold the warehouse on the west side. Clear them out, grab the cash, get back to Mara.',
    reward: 2500,
  },
  {
    id: 'laststand',
    name: 'M4 · Last Stand',
    brief: 'Los Diablos are hitting the Starfish Club. Hold the line, then get Mara to the marina before the cops lock the city down.',
    reward: 4000,
  },
  {
    id: 'bankjob',
    name: 'M5 · The Bank Job',
    brief: 'Mara wants the Solmar Trust vault. Hold the vault room, grab the cash, lose the cops, get back to her.',
    reward: 6000,
  },
  {
    id: 'king',
    name: 'M6 · King of the Bay',
    brief: 'Los Diablos are making their last stand at the docks. Wipe them out, take the stash, and come home king.',
    reward: 8000,
  },
  {
    id: 'stormrun',
    name: 'M7 · The Storm Run',
    brief: 'A storm is rolling in off the bay. Bring a car to the Beach Lot and race Dex through five checkpoints to the Starfish Club. $5,000 to the winner.',
    reward: 5000,
  },
];

/** Mission 4's numbers: the defence wave, and the getaway clock. */
export const LAST_STAND = {
  thugs: 6,
  getawaySeconds: 75,
  triggerRadius: 240,
};

/** Mission 5's numbers: the vault hold, and the thugs who guard the bank. */
export const BANK_JOB = {
  thugs: 3,
  holdSeconds: 3,
  triggerRadius: 240,
  vaultRadius: 60,
};

/** Mission 6's numbers: the turf war at the docks. */
export const TURF_WAR = {
  thugs: 8,
  triggerRadius: 240,
};

/** Mission 7's numbers: a storm race across the whole city. The trigger is
 * the Beach Lot, the clock is the whole run, and Dex drives the orange Comet
 * at a pace a good driver in a fast car can beat — barely. */
export const STORM_RUN = {
  triggerRadius: 240,
  timeLimit: 100,
  rivalSpeed: 280,
  checkpointRadius: 90,
};

export const PALETTE = {
  backdrop: '#0d1420',
  grass: '#69a95c',
  grassDark: '#5c9a50',
  park: '#74b968',
  sand: '#e0c98f',
  ocean: '#2f7fb8',
  oceanDeep: '#256a9e',
  asphalt: '#464c56',
  asphaltDark: '#3d434d',
  lane: '#f2d95c',
  sidewalk: '#a8adb6',
  block: '#9399a3',
  building: ['#c96f4a', '#4a7fc9', '#c9a44a', '#7a4ac9', '#4ac9a0', '#c94a6e', '#8a6d4b', '#5b7a8c'],
  buildingDowntown: ['#54627a', '#6b5578', '#7a6a52', '#44586b', '#6b4a52'],
  roof: '#d8d3c8',
  tree: '#2f7a3d',
  treeLight: '#4da34d',
  pier: '#8a6d4b',
  pierDark: '#6b543a',
  player: '#f2c94c',
  playerShirt: '#e5534b',
  cop: '#2f5fd0',
  copCar: '#eef1f5',
  thug: '#7a2f8c',
  carColors: ['#d94f3d', '#3d7ad9', '#e8b93d', '#3da35a', '#8c3dd9', '#e8e8e8', '#2b2b2b', '#d97b2f', '#2fd9c9'],
  sports: '#d92038',
  policeLightRed: '#ff2d2d',
  policeLightBlue: '#2d6bff',
  text: '#f5f2ea',
  muted: '#c9c4b8',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#58c96b',
  panel: 'rgba(12, 18, 30, 0.82)',
  panelSolid: '#101827',
  beacon: '#f2c94c',
  heatCool: '#58c96b',
  heatWarm: '#f2c94c',
  heatHot: '#e5534b',
  headlight: 'rgba(255, 240, 180, 0.20)',
  // The weather: rain streaks, lightning white, and the glint of puddles on
  // wet asphalt.
  rain: 'rgba(180, 210, 240, 0.35)',
  lightning: '#fdf6c9',
  puddle: 'rgba(190, 220, 245, 0.35)',
  // The side activities: taxi yellow, race orange, package gold, the bike's
  // teal and the truck's brown, the phone's dark panel, vendor awnings and
  // the fishermen's khaki.
  taxi: '#ffd23d',
  race: '#ff8c2d',
  packageGold: '#ffd700',
  bike: '#2fd9c9',
  truck: '#8a6d4b',
  phonePanel: '#0d1526',
  vendorAwning: '#e5534b',
  vendorCart: '#7a5a3a',
  fisherman: '#5b7a8c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, mission progress, best) is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
