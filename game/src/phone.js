// Rico's phone: the Tab key opens it over the game, and the world keeps
// running behind it — or rather, it does not: the loop stops stepping while
// the phone is open, so the player can read in peace and the cops wait.
//
// The phone has two pages in one panel: the story so far, and the numbers.
// The story lists all six missions with their state — done, current, or
// locked — and the reward each one pays. The numbers are the run's own
// ledger: cash earned, fares driven, races won, the best race time, the
// packages found, and the guns owned. Everything it shows comes from the
// world's state, so it can never disagree with the game.
//
// It draws itself with raw canvas calls, like the rest of the HUD, and the
// renderer calls it when the main loop says the phone is open.
import { FONT, MISSIONS, PACKAGES, PALETTE, VIEW } from './config.js';
import { weaponListLines } from './weapons.js';

const PHONE_W = 460;
const PHONE_H = 660;

/** A rounded rectangle path, like the renderer's own helper: the canvas
 * roundRect method is new enough that an older browser would throw on it. */
function phoneRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** The state word for one mission: done, current, or locked. */
export function missionState(state, index) {
  if (index < state.missionIndex) return 'done';
  if (index === state.missionIndex) return 'current';
  return 'locked';
}

/** The stats the phone shows, as label/value pairs, straight from the
 * world's own counters. */
export function phoneStats(state) {
  const stats = state.stats || {};
  const best = state.race && state.race.best !== null && state.race.best !== undefined
    ? `${state.race.best.toFixed(1)}s`
    : '—';
  return [
    ['Cash earned', `$${(stats.cashEarned || 0).toLocaleString('en-US')}`],
    ['Missions done', `${Math.min(state.missionIndex, MISSIONS.length)}/${MISSIONS.length}`],
    ['Packages found', `${stats.packagesFound || 0}/${PACKAGES.count}`],
    ['Taxi fares', String(stats.faresDone || 0)],
    ['Races won', String(stats.racesWon || 0)],
    ['Best race time', best],
    ['Cars driven', String(state.carsDriven || 0)],
    ['Pedestrians hit', String(state.pedsHit || 0)],
  ];
}

/** Draw one mission row: a tick, a chevron or a lock, the name, and the
 * reward. Done missions are green, the current one is gold, locked ones
 * are dimmed. */
function drawMissionRow(ctx, state, index, y) {
  const mission = MISSIONS[index];
  const status = missionState(state, index);
  const mark = status === 'done' ? '✓' : status === 'current' ? '▶' : '·';
  const color = status === 'done' ? PALETTE.green : status === 'current' ? PALETTE.gold : PALETTE.muted;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(mark, 24, y);
  ctx.fillStyle = status === 'locked' ? 'rgba(201,196,184,0.6)' : PALETTE.text;
  ctx.fillText(mission.name, 52, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = status === 'locked' ? 'rgba(201,196,184,0.6)' : PALETTE.gold;
  ctx.fillText(`$${mission.reward.toLocaleString('en-US')}`, PHONE_W - 24, y);
}

/** Draw one stats row: the label on the left, the value on the right. */
function drawStatRow(ctx, label, value, y) {
  ctx.font = `16px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(label, 24, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(value, PHONE_W - 24, y);
}

/** Draw the phone: a dark panel in the middle of the screen, the story on
 * top, the ledger in the middle, the guns at the bottom, and the key that
 * closes it. The panel is drawn in screen space, after the HUD, so it sits
 * over the game rather than in it. */
export function drawPhone(ctx, state) {
  const x = (VIEW.width - PHONE_W) / 2;
  // Near the top, not centred: the panel is tall, and starting at y=20
  // covers the HUD's mission line behind it instead of letting it peek out
  // above the panel's edge.
  const y = 20;
  ctx.save();
  ctx.translate(x, y);
  // The panel: dark, rounded, gold-edged, with a notch at the top like a
  // phone's speaker slot.
  ctx.fillStyle = PALETTE.phonePanel;
  phoneRect(ctx, 0, 0, PHONE_W, PHONE_H, 18);
  ctx.fill();
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 3;
  phoneRect(ctx, 0, 0, PHONE_W, PHONE_H, 18);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  phoneRect(ctx, PHONE_W / 2 - 40, 12, 80, 8, 4);
  ctx.fill();
  // Title and cash.
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText("RICO'S PHONE", 24, 56);
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(`$${state.player.cash.toLocaleString('en-US')}`, PHONE_W - 24, 56);
  // The story.
  ctx.textAlign = 'left';
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('THE STORY', 24, 92);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(24, 100);
  ctx.lineTo(PHONE_W - 24, 100);
  ctx.stroke();
  for (let i = 0; i < MISSIONS.length; i += 1) {
    drawMissionRow(ctx, state, i, 122 + i * 26);
  }
  // The ledger.
  const ledgerY = 122 + MISSIONS.length * 26 + 12;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('THE LEDGER', 24, ledgerY);
  ctx.beginPath();
  ctx.moveTo(24, ledgerY + 10);
  ctx.lineTo(PHONE_W - 24, ledgerY + 10);
  ctx.stroke();
  const stats = phoneStats(state);
  for (let i = 0; i < stats.length; i += 1) {
    drawStatRow(ctx, stats[i][0], stats[i][1], ledgerY + 32 + i * 21);
  }
  // The guns.
  const gunsY = ledgerY + 32 + stats.length * 21 + 10;
  ctx.font = `bold 14px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('THE GUNS', 24, gunsY);
  ctx.beginPath();
  ctx.moveTo(24, gunsY + 10);
  ctx.lineTo(PHONE_W - 24, gunsY + 10);
  ctx.stroke();
  const guns = weaponListLines(state.player);
  for (let i = 0; i < guns.length; i += 1) {
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(guns[i], 24, gunsY + 30 + i * 20);
  }
  // Footer.
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('TAB — close the phone', PHONE_W / 2, PHONE_H - 18);
  ctx.restore();
}
