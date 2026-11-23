# gta6-01-makefun

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lloricnux-cmyk/gta6-01-makefun/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lloricnux-cmyk/gta6-01-makefun/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — an original top-down open-world crime game. Rico Vega is out of prison and back in the fictional city of Solmar Bay, working seven missions for Mara Solano while the Solmar Bay police keep score. Drive and walk a living city: traffic that overtakes instead of queuing, pedestrians who jog, stroll and scatter, cars to steal, a five-star wanted level with a heat meter, police pursuits, combat with three guns, a sky that rolls from clear to storm — rain slicks the roads and lightning comes down — and a day that slides from noon into golden hour and night. Between missions the city pays: taxi fares, street races, twenty hidden packages, and bikes and trucks to find.

## The story — 7 missions

1. **M1 · The Pickup** — fetch a package from the docks, deliver it to the Starfish Club. Mara gives you a pistol.
2. **M2 · Hot Wheels** — steal the red Comet GT from the beach lot, lose the cops, deliver it to the chop shop.
3. **M3 · The Hit** — clear Los Diablos out of the west-side warehouse, grab the cash, get back to Mara.
4. **M4 · Last Stand** — Los Diablos hit the Starfish Club. Hold the line, then drive Mara to the marina before the 75-second getaway clock runs out.
5. **M5 · The Bank Job** — hold the Solmar Trust vault room while the alarm brings the guards, grab the cash, lose the cops, get back to Mara.
6. **M6 · King of the Bay** — eight Los Diablos hold the docks. Wipe them out, take the stash, and come home king.
7. **M7 · The Storm Run** — a storm rolls in off the bay. Bring a car to the Beach Lot and race Dex through five checkpoints to the Starfish Club, $5,000 to the winner — in the wet, under the lightning.

## The city that pays

- **Taxi fares** — drive and a passenger flags you down. Pick them up, drop them off before the clock runs out, and the fare is cash.
- **Street races** — drive into the flag on the downtown boulevard. Six checkpoints, two rivals, $600 to the winner.
- **20 hidden packages** — gold parcels tucked into park corners, the beach, the docks and the marina. $50 each, and the HUD counts them.
- **Bikes & trucks** — three motorbikes (fast, fragile) and two delivery trucks (slow, tough) parked around the city, each with its own handling.
- **Three guns** — pistol, shotgun (found at the docks), SMG (found at the warehouse). Each keeps its own ammo; switch with 1 / 2 / 3.
- **Rico's phone (Tab)** — the story so far, the ledger (cash earned, fares, races, best race time, packages), and the guns owned.
- **Weather** — the sky rolls clear → cloudy → rain → storm on a seeded clock. Rain slicks the roads (softer steering, longer braking), storms throw lightning with thunder a beat behind, and puddles glint on the asphalt. The HUD shows the sky; the phone's ledger counts storm runs won.
- **Quiet life** — fishermen on the marina piers, street vendors at the park, the beach and the marina, and lamps that pool light on the roads after dark.

## How to play

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| E | Enter / steal a car (or get out) |
| H | Horn — traffic ahead speeds up, pedestrians scatter |
| Mouse + click | Aim and shoot (once armed) |
| Space | Punch |
| Shift | Run |
| Tab | Phone — missions, ledger, guns |
| 1 / 2 / 3 | Switch gun (pistol, shotgun, SMG) |
| P / Esc | Pause — the pause menu is also the "How to play" recap |
| M | Mute / unmute sound |

Follow the yellow beacon and the minimap blip. Stars are your wanted level; the **HEAT** bar under them shows how close the cops are — lay low and it cools off. Cash and mission progress save in your browser, so a visit continues where the last one ended.

## Run it

```sh
node serve.ts        # play at http://localhost:8080
node main.ts         # hand the entry in (writes /output, or $MAKEFUN_OUTPUT_DIR)
```

No build step, no libraries, no network: `game/` is plain static files (HTML + ES modules + canvas + WebAudio), and every sound is synthesised in code.

## Files

- `game/index.html` — the page; `game/src/` holds one job per file: `config.js` (tuning), `city.js` (the city), `world.js` (rules), `render.js` (drawing + HUD), `input.js`, `audio.js`, `shots.js` (screenshot scenes), `main.js` (boot + loop), `random.js` (seeded RNG), `side.js` (taxi, races, packages), `missions2.js` (missions 5–6), `missions3.js` (mission 7, the Storm Run), `weather.js` (clear/cloudy/rain/storm, wet roads, lightning), `vehicles.js` (bikes & trucks), `weapons.js` (the armoury), `ambient.js` (fishermen, vendors, lamps), `phone.js` (Rico's phone).
- `main.ts` — the entry program: checks the entry against the gate's caps, copies `game/` and `screenshots/`, writes `dossier.json`.
- `serve.ts` — a tiny static server for local play (with a `/healthz` check).
- `screenshots/` — four real renders of the game: title, the Comet GT downtown, a three-star chase, and mission 5's bank job.

An original game. No Rockstar content — Solmar Bay, its people and its story are all our own.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
