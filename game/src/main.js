// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play, paused,
// wasted and busted. Cash and mission progress save to localStorage, so a visit
// can continue where the last one ended. One-shot actions (horn, mute, pause)
// are taken from the input queue once per frame and never replayed.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_ENTER_CAR, EVENT_EXPLOSION, EVENT_HORN, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_ENTER, ACTION_HORN, ACTION_MUTE, ACTION_PAUSE, ACTION_PHONE, ACTION_WEAPON_1, ACTION_WEAPON_2, ACTION_WEAPON_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { EVENT_PACKAGE, EVENT_RACE, EVENT_TAXI } from './side.js';
import { switchWeapon, weaponName } from './weapons.js';
import { EVENT_THUNDER } from './weather.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The story has seven missions; a save from an older build clamps to them. */
const MISSION_COUNT = 7;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
window.__world = world;
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.mission !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const save = { cash: world.state.player.cash, mission: world.state.missionIndex };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    const best = Math.max(readBest(), save.cash);
    window.localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Apply a save to a fresh world: cash, mission progress and Mara's pistol. */
function applySave(save) {
  const player = world.state.player;
  player.cash = save.cash;
  world.state.cash = save.cash;
  const mission = Math.max(0, Math.min(MISSION_COUNT, save.mission));
  if (mission >= 1) {
    player.armed = true;
    player.ammoByWeapon.pistol = 60;
    player.weapon = 'pistol';
    player.owned.pistol = true;
    player.ammo = 60;
  }
  if (mission >= 1 && mission < MISSION_COUNT) world.debug.setMission(mission, 0);
  else if (mission >= MISSION_COUNT) {
    world.state.missionIndex = MISSION_COUNT;
    world.state.missionText = 'Solmar Bay is yours. Free roam — earn cash, dodge the law, live large.';
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, { best: scene.best, hasSave: false, saveCash: 0, saveMission: 0, lost: 0 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let overReason = 'wasted';
  let lost = 0;
  let best = readBest();
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let missionSeen = world.state.missionIndex;
  let wantedSeen = world.state.wanted;
  let muted = false;
  // Rico's phone: open over the game, the world waiting behind it.
  let phoneOpen = false;

  function ui() {
    return {
      best,
      hasSave: !!save,
      saveCash: save ? save.cash : 0,
      saveMission: save ? save.mission : 0,
      lost,
      phoneOpen,
    };
  }

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(useSave) {
    world.reset();
    if (useSave && save) applySave(save);
    missionSeen = world.state.missionIndex;
    wantedSeen = world.state.wanted;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Solmar Bay. Follow the yellow marker.');
  }

  function endGame(reason) {
    overReason = reason;
    lost = reason === 'busted' ? Math.min(world.state.player.cash, 200) : Math.min(world.state.player.cash, 150);
    screen = reason === 'busted' ? SCREEN_BUSTED : SCREEN_WASTED;
    audio.wasted();
    writeSave();
    announce(reason === 'busted' ? 'Busted by the Solmar Bay police.' : 'Wasted.');
  }

  function aimWorld() {
    const mouse = input.mouse();
    const ratio = window.devicePixelRatio || 1;
    const logicalX = (mouse.x * ratio - renderer.view.x) / renderer.view.scale;
    const logicalY = (mouse.y * ratio - renderer.view.y) / renderer.view.scale;
    const cam = world.state.camera;
    return {
      x: cam.x + (logicalX - VIEW.width / 2) / cam.zoom,
      y: cam.y + (logicalY - VIEW.height / 2) / cam.zoom,
    };
  }

  function step(frameActions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {
        up: false, down: false, left: false, right: false, run: false, handbrake: false,
        enterPressed: false, punchPressed: false, shootHeld: false, aimX: 0, aimY: 0,
        hornPressed: false,
      }, true);
      return;
    }
    const held = input.held;
    const aim = aimWorld();
    // One-shot presses are taken once per frame and spent on the first step.
    const enterPressed = !!(frameActions & ACTION_ENTER);
    const hornPressed = !!(frameActions & ACTION_HORN);
    frameActions &= ~(ACTION_ENTER | ACTION_HORN);
    const events = world.step(STEP, {
      up: held.up, down: held.down, left: held.left, right: held.right,
      run: held.run, handbrake: held.handbrake,
      enterPressed,
      hornPressed,
      punchPressed: input.punchHeld(),
      shootHeld: input.mouse().down,
      aimX: aim.x, aimY: aim.y,
    }, false);
    if (events & EVENT_SHOT) {
      // Each gun sounds like itself: the shotgun booms, the SMG cracks, the
      // pistol pops the way it always has.
      const gun = world.state.player.weapon;
      if (gun === 'shotgun') audio.shotgun();
      else if (gun === 'smg') audio.smg();
      else audio.shot();
    }
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_ENTER_CAR) audio.pickup();
    if (events & EVENT_HORN) audio.horn();
    if (events & EVENT_TAXI) audio.taxi();
    if (events & EVENT_RACE) audio.raceBeep(false);
    if (events & EVENT_PACKAGE) audio.packageBlip();
    if (events & EVENT_THUNDER) audio.thunder();
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
      save = readSave();
      best = readBest();
    }
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
    if (world.state.missionIndex !== missionSeen) missionSeen = world.state.missionIndex;
    // A new star earns a dispatch blip, so the player hears the heat rise.
    if (world.state.wanted > wantedSeen) audio.dispatch();
    wantedSeen = world.state.wanted;
    const speed = world.state.player.inCar ? world.state.player.inCar.speed : 0;
    audio.update(STEP, speed, world.state.wanted);
  }

  function handleActions(actions) {
    audio.unlock();
    if (actions & ACTION_MUTE) {
      muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE && save) startGame(true);
      else if (actions & ACTION_CONFIRM) startGame(false);
    } else if (screen === SCREEN_WASTED || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        world.respawn(overReason);
        save = readSave();
        screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PHONE) {
        phoneOpen = !phoneOpen;
        audio.phoneClick();
        announce(phoneOpen ? 'Phone open. Missions, ledger, guns.' : 'Phone closed.');
      } else if (!phoneOpen && (actions & ACTION_WEAPON_1)) {
        if (switchWeapon(world.state.player, 'pistol')) announce('Pistol in hand.');
      } else if (!phoneOpen && (actions & ACTION_WEAPON_2)) {
        if (switchWeapon(world.state.player, 'shotgun')) announce('Shotgun in hand.');
        else announce('Shotgun not found yet — check the docks.');
      } else if (!phoneOpen && (actions & ACTION_WEAPON_3)) {
        if (switchWeapon(world.state.player, 'smg')) announce('SMG in hand.');
        else announce('SMG not found yet — check the warehouse.');
      } else if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused. How to play is on screen.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    // The phone holds the world still while it is open: the city waits
    // behind the panel, and the loop only draws.
    if ((screen === SCREEN_TITLE || screen === SCREEN_PLAY) && !phoneOpen) {
      let frameActions = actions;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(frameActions);
        frameActions = 0;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, ui());
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solmar Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
