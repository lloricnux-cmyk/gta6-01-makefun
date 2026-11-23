// The end of the story: missions five and six. Mara's jobs escalate —
// after the last stand at the club she wants the Solmar Trust vault, and
// after the bank job Los Diablos make their final play at the docks, and
// Rico has to end it.
//
// M5 · The Bank Job: drive to the bank, walk in and hold the vault room
// while the alarm brings the guards, grab the cash, then lose the cops and
// bring it home to Mara. M6 · King of the Bay: the docks, eight thugs, the
// stash, and a drive back to the club that decides who owns the city.
//
// The world owns the mission slot machine (index, step, target, text) and
// the thug spawner; this module owns what steps four and five of the story
// mean, one step at a time. The api it takes is the world's own helpers,
// handed in as an object so this file never has to reach into the world's
// closures.
import { BANK_JOB, TURF_WAR } from './config.js';
import { PLACES } from './city.js';

/** Spawn the bank's guards: three thugs around the vault. The world hands
 * in its own spawner, so the thugs are the same kind the warehouse and the
 * club throw at Rico. */
export function spawnBankThugs(api) {
  api.spawnThugsAt(PLACES.bank.x, PLACES.bank.y, [
    { x: -60, y: -40 },
    { x: 50, y: -60 },
    { x: 0, y: 70 },
  ]);
}

/** Spawn the docks' last stand: eight thugs across the yard. */
export function spawnDockThugs(api) {
  api.spawnThugsAt(PLACES.docks.x, PLACES.docks.y, [
    { x: -90, y: -60 },
    { x: 90, y: -70 },
    { x: -40, y: 80 },
    { x: 60, y: 90 },
    { x: -130, y: 20 },
    { x: 130, y: 10 },
    { x: 0, y: -120 },
    { x: 20, y: 130 },
  ]);
}

/** The vault hold, in seconds: how long Rico has stood inside the vault
 * room without leaving. It drains when he steps out, so the hold is a real
 * hold, not a visit. */
function holdProgress(state, dt, inside) {
  if (inside) state.missionHold = Math.min(BANK_JOB.holdSeconds, state.missionHold + dt);
  else state.missionHold = Math.max(0, state.missionHold - dt * 2);
  return state.missionHold;
}

/** Mission 5, one step at a time. Returns nothing; the api carries the
 * world's own setters, so the text, the target and the payout all land in
 * the same place the first four missions put theirs. */
function updateBankJob(dt, api) {
  const { state, player } = api;
  const px = player.x;
  const py = player.y;
  if (state.missionStep === 0) {
    if (api.distance(px, py, PLACES.bank.x, PLACES.bank.y) < BANK_JOB.triggerRadius) {
      state.missionStep = 1;
      state.missionHold = 0;
      spawnBankThugs(api);
      api.addCrime(2);
      api.setMissionText(`Hold the vault room — ${Math.ceil(BANK_JOB.holdSeconds - state.missionHold)}s to crack it.`);
      api.showToast('THE ALARM IS UP — HOLD THE VAULT', 3);
    }
  } else if (state.missionStep === 1) {
    const inside = api.distance(px, py, PLACES.bank.x, PLACES.bank.y) < BANK_JOB.vaultRadius;
    const held = holdProgress(state, dt, inside);
    const left = Math.max(0, BANK_JOB.holdSeconds - held);
    api.setMissionText(`Hold the vault room — ${left.toFixed(1)}s to crack it.`);
    if (held >= BANK_JOB.holdSeconds) {
      state.missionStep = 2;
      state.pickups.push({
        x: PLACES.bank.x, y: PLACES.bank.y, kind: 'cash', amount: 0, active: true, missionCash: true,
      });
      api.setMissionText('Vault cracked. Grab the cash, then lose the cops.');
      api.setMissionTarget(PLACES.bank.x, PLACES.bank.y, PLACES.bank.label);
      api.showToast('VAULT OPEN — GRAB IT', 2.5);
    }
  } else if (state.missionStep === 2) {
    const cash = state.pickups.find((p) => p.active && p.missionCash);
    if (!cash) {
      state.missionStep = 3;
      api.setMissionText('Cash in hand. Lose the cops, then get back to Mara.');
      api.setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
    }
  } else if (state.missionStep === 3) {
    if (state.wanted === 0) {
      api.setMissionText('Clean. Get back to Mara at the Starfish Club.');
      if (api.distance(px, py, PLACES.club.x, PLACES.club.y) < 80) api.missionComplete();
    } else {
      api.setMissionText(`Lose the cops first — ${state.wanted} star${state.wanted > 1 ? 's' : ''} on you.`);
    }
  }
}

/** Mission 6, one step at a time: the docks, eight thugs, the stash, and
 * the drive home that ends the story. */
function updateTurfWar(dt, api) {
  const { state, player } = api;
  const px = player.x;
  const py = player.y;
  if (state.missionStep === 0) {
    if (api.distance(px, py, PLACES.docks.x, PLACES.docks.y) < TURF_WAR.triggerRadius) {
      state.missionStep = 1;
      spawnDockThugs(api);
      api.addCrime(1);
      api.setMissionText(`Wipe them out — ${state.thugsLeft} Los Diablos thugs left.`);
      api.showToast('THE LAST OF THEM. END IT.', 3);
    }
  } else if (state.missionStep === 1) {
    api.setMissionText(`Wipe them out — ${state.thugsLeft} Los Diablos thugs left.`);
    if (state.thugsLeft <= 0) {
      state.missionStep = 2;
      state.pickups.push({
        x: PLACES.docks.x, y: PLACES.docks.y, kind: 'cash', amount: 0, active: true, missionCash: true,
      });
      api.setMissionText('Docks clear. Take the stash, then get back to Mara.');
      api.setMissionTarget(PLACES.docks.x, PLACES.docks.y, PLACES.docks.label);
    }
  } else if (state.missionStep === 2) {
    const cash = state.pickups.find((p) => p.active && p.missionCash);
    if (!cash) {
      state.missionStep = 3;
      api.setMissionText('Stash in hand. Get back to Mara at the Starfish Club.');
      api.setMissionTarget(PLACES.club.x, PLACES.club.y, PLACES.club.label);
    }
  } else if (state.missionStep === 3) {
    if (api.distance(px, py, PLACES.club.x, PLACES.club.y) < 80) api.missionComplete();
  }
}

/** The story's last two missions. The world calls this from its mission
 * update when the mission index is 4 or 5, with an api of its own helpers. */
export function updateMissions56(dt, api) {
  if (api.state.missionIndex === 4) updateBankJob(dt, api);
  else if (api.state.missionIndex === 5) updateTurfWar(dt, api);
}

/** The briefing lines the phone shows for the two late missions, so the
 * player can read what is coming before it starts. */
export function mission56Brief(index) {
  if (index === 4) {
    return [
      'M5 · The Bank Job — $6,000',
      'Hold the Solmar Trust vault while the',
      'alarm brings the guards. Grab the cash,',
      'lose the cops, bring it home to Mara.',
    ];
  }
  return [
    'M6 · King of the Bay — $8,000',
    'Eight Los Diablos hold the docks.',
    'Wipe them out, take the stash, and',
    'come home king of Solmar Bay.',
  ];
}
