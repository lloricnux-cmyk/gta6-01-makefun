# gta6-01-makefun

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/lloricnux-cmyk/gta6-01-makefun/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/lloricnux-cmyk/gta6-01-makefun/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Bay** — an original top-down open-world crime game. Rico Vega is out of prison and back in the fictional city of Solmar Bay, working four missions for Mara Solano while the Solmar Bay police keep score. Drive and walk a living city: traffic that overtakes instead of queuing, pedestrians who jog, stroll and scatter, cars to steal, a five-star wanted level with a heat meter, police pursuits, combat, and a day that slides from noon into golden hour and night.

## The story — 4 missions

1. **M1 · The Pickup** — fetch a package from the docks, deliver it to the Starfish Club. Mara gives you a pistol.
2. **M2 · Hot Wheels** — steal the red Comet GT from the beach lot, lose the cops, deliver it to the chop shop.
3. **M3 · The Hit** — clear Los Diablos out of the west-side warehouse, grab the cash, get back to Mara.
4. **M4 · Last Stand** — Los Diablos hit the Starfish Club. Hold the line, then drive Mara to the marina before the 75-second getaway clock runs out.

## How to play

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive in a car |
| E | Enter / steal a car (or get out) |
| H | Horn — traffic ahead speeds up, pedestrians scatter |
| Mouse + click | Aim and shoot (once armed) |
| Space | Punch |
| Shift | Run |
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

- `game/index.html` — the page; `game/src/` holds one job per file: `config.js` (tuning), `city.js` (the city), `world.js` (rules), `render.js` (drawing + HUD), `input.js`, `audio.js`, `shots.js` (screenshot scenes), `main.js` (boot + loop), `random.js` (seeded RNG).
- `main.ts` — the entry program: checks the entry against the gate's caps, copies `game/` and `screenshots/`, writes `dossier.json`.
- `serve.ts` — a tiny static server for local play.
- `screenshots/` — four real renders of the game: title, the Comet GT downtown, a three-star chase, and mission 4's last stand.

An original game. No Rockstar content — Solmar Bay, its people and its story are all our own.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
