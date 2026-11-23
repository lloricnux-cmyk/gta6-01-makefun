// Solmar Bay, a gta6-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and the
// program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// The game is an original top-down open-world crime game: Rico Vega returns to
// the fictional city of Solmar Bay and works four missions for Mara Solano while
// the Solmar Bay police keep score. On foot and by car, with traffic and
// pedestrians, car stealing, a five-star wanted level with a heat meter, police
// pursuits, combat, a HUD with a minimap, a start screen, a pause menu with a
// "How to play" recap, and a localStorage save. Every name, place, character,
// story beat and sound is original; nothing comes from Rockstar Games.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Before it writes anything, the program checks the entry against the gate's
// own caps and refuses to hand in a broken one (missing index.html, the wrong
// number of screenshots, a screenshot over the size cap). The checks only read;
// the bytes it writes are the same every run.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countGameFiles(dir, base) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files += 1;
      const sub = countGameFiles(path, base);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(path).size;
      const rel = path.slice(base.length + 1);
      if (Buffer.byteLength(rel, 'utf8') > LIMITS.game_path_max_bytes) {
        throw new Error(`game path over the cap: ${rel}`);
      }
    } else {
      throw new Error(`game/ holds a non-file, non-directory entry: ${path}`);
    }
  }
  return { files, bytes };
}

function checkEntry() {
  const gameDir = join(here, 'game');
  const index = join(gameDir, 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new Error('game/index.html is missing: the entry has no game to play');
  }
  const counted = countGameFiles(gameDir, gameDir);
  if (counted.files > LIMITS.game_max_files) {
    throw new Error(`game/ holds ${counted.files} files, over the ${LIMITS.game_max_files} cap`);
  }
  if (counted.bytes > LIMITS.game_max_bytes) {
    throw new Error(`game/ is ${counted.bytes} bytes, over the ${LIMITS.game_max_bytes} cap`);
  }
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing: the entry needs 3 or 4 screenshots');
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < 3 || shots.length > LIMITS.screenshots.max) {
    throw new Error(`screenshots/ holds ${shots.length} images; the gate wants 3 or 4`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > LIMITS.screenshots.max_bytes) {
      throw new Error(`screenshots/${name} is ${size} bytes, over the ${LIMITS.screenshots.max_bytes} cap`);
    }
  }
  return { gameFiles: counted.files, gameBytes: counted.bytes, shots: shots.length };
}

const checked = checkEntry();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, LIMITS));

console.log(
  `Solmar Bay handed in: ${checked.gameFiles} game files (${checked.gameBytes} bytes), `
  + `${checked.shots} screenshots, dossier written to ${join(out, 'dossier.json')}`,
);
