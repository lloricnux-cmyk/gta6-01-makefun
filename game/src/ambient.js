// The city's quiet life: fishermen on the marina piers, street vendors on
// the sidewalks, and lamps that pool light on the roads after dark. None of
// it is a mission and none of it fights the player; it is there so the city
// feels lived in at any hour, and so the night looks different from the day
// in more than a darker veil.
//
// The fishermen cast and reel on their own slow clock, each on his own
// phase, so the piers are never still. The vendors stand by their carts all
// day. The lamps are built with the city and lit by the renderer when the
// sun goes down. Everything here is deterministic: the phases come from the
// seeded generator at reset, and the motion comes from the world's own clock,
// so the same seed shows the same scene.
import { FONT, PALETTE } from './config.js';

/** How a fisherman moves: cast, wait, reel, rest, in a slow loop driven by
 * the world's clock and his own phase, so three fishermen never move in
 * step. */
const FISH_CYCLE = 14;

/** Build the ambient life from the city the world already built: fishermen
 * at the end of each pier, vendors at the stalls the city placed, lamps
 * along the roads. */
export function createAmbient(city) {
  return {
    fishermen: (city.fishing || []).map((spot) => ({
      x: spot.x,
      y: spot.y,
      phase: spot.phase || 0,
    })),
    vendors: (city.stalls || []).map((stall) => ({
      x: stall.x,
      y: stall.y,
      goods: stall.goods,
      label: stall.label,
    })),
    lamps: city.lamps || [],
  };
}

/** Where a fisherman is in his cycle, 0..1: the first quarter is the cast,
 * the middle half is the wait, the last quarter is the reel. */
export function fishermanCycle(state, fisherman) {
  const t = ((state.time + fisherman.phase) % FISH_CYCLE) / FISH_CYCLE;
  if (t < 0.15) return { stage: 'cast', progress: t / 0.15 };
  if (t < 0.7) return { stage: 'wait', progress: (t - 0.15) / 0.55 };
  return { stage: 'reel', progress: (t - 0.7) / 0.3 };
}

/** The ambient life has no simulation of its own to step — the fishermen
 * move on the world's clock and the vendors stand still — so this update is
 * a hook for later life: it keeps the fishermen from standing in the ocean
 * when the tide line is drawn, and it is where a future catch would land. */
export function updateAmbient(dt, state, ambient) {
  // Nothing to step: the fishermen and vendors are drawn from state.time.
  // The function exists so the world has one place to call for ambient life,
  // and so a catch, a gull, or a closing stall has somewhere to live.
  return 0;
}

/** How deep into the night the clock is, 0..1 — the same curve the
 * renderer uses for its veil, so the lamps light up exactly when the dark
 * does. */
function nightFactor(timeOfDay) {
  const day = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const light = Math.max(0, Math.min(1, day * 1.6 + 0.25));
  return Math.max(0, Math.min(1, (0.45 - light) / 0.45));
}

/** Draw a fisherman: a khaki figure at the pier's end, a rod angled over
 * the water, and a line that swings out on the cast and comes back on the
 * reel. The rod's angle comes from his cycle, so he fishes even when the
 * player is three districts away. */
function drawFisherman(ctx, state, fisherman) {
  const cycle = fishermanCycle(state, fisherman);
  const rodAngle = cycle.stage === 'cast'
    ? -0.9 + cycle.progress * 0.7
    : cycle.stage === 'reel'
      ? -0.2 - cycle.progress * 0.5
      : -0.35 + Math.sin(state.time * 0.8 + fisherman.phase) * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(fisherman.x + 2, fisherman.y + 3, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.fisherman;
  ctx.beginPath();
  ctx.arc(fisherman.x, fisherman.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(fisherman.x, fisherman.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8d3c8';
  ctx.beginPath();
  ctx.arc(fisherman.x, fisherman.y - 1, 5.5, Math.PI, 0);
  ctx.fill();
  // Rod and line.
  const tipX = fisherman.x + Math.cos(rodAngle - Math.PI / 2) * 34;
  const tipY = fisherman.y + Math.sin(rodAngle - Math.PI / 2) * 34;
  ctx.strokeStyle = '#3a2f22';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fisherman.x, fisherman.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  const lineEnd = cycle.stage === 'wait' ? 26 : 12;
  ctx.lineTo(tipX + 6, tipY + lineEnd);
  ctx.stroke();
  if (cycle.stage === 'reel' && cycle.progress > 0.7) {
    ctx.fillStyle = '#c9cdd4';
    ctx.beginPath();
    ctx.arc(tipX + 6, tipY + lineEnd, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw a vendor: a cart with an awning in the stall's colour, and a small
 * label naming what they sell, so the sidewalks have shops that never move. */
function drawVendor(ctx, state, vendor) {
  const bob = Math.sin(state.time * 1.2 + vendor.x * 0.01) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(vendor.x - 14, vendor.y + 8, 32, 8);
  // Cart.
  ctx.fillStyle = PALETTE.vendorCart;
  ctx.fillRect(vendor.x - 16, vendor.y - 4 + bob, 34, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(vendor.x - 16, vendor.y - 4 + bob, 34, 4);
  // Awning.
  ctx.fillStyle = PALETTE.vendorAwning;
  ctx.beginPath();
  ctx.moveTo(vendor.x - 20, vendor.y - 4 + bob);
  ctx.lineTo(vendor.x + 22, vendor.y - 4 + bob);
  ctx.lineTo(vendor.x + 16, vendor.y - 16 + bob);
  ctx.lineTo(vendor.x - 14, vendor.y - 16 + bob);
  ctx.closePath();
  ctx.fill();
  // Goods on the cart: fruit is round and orange, snacks are small squares,
  // flowers are pink dots.
  if (vendor.goods === 'fruit') {
    ctx.fillStyle = '#ff8c2d';
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(vendor.x - 10 + i * 8, vendor.y + 2 + bob, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (vendor.goods === 'snacks') {
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(vendor.x - 11, vendor.y - 1 + bob, 6, 6);
    ctx.fillRect(vendor.x - 2, vendor.y - 1 + bob, 6, 6);
    ctx.fillRect(vendor.x + 7, vendor.y - 1 + bob, 6, 6);
  } else {
    ctx.fillStyle = '#e58bb1';
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(vendor.x - 11 + i * 7, vendor.y + 1 + bob, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The vendor themself, behind the cart.
  ctx.fillStyle = '#7a4ac9';
  ctx.beginPath();
  ctx.arc(vendor.x + 1, vendor.y - 20 + bob, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(vendor.x + 1, vendor.y - 20 + bob, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(245,242,234,0.85)';
  ctx.fillText(vendor.label, vendor.x + 1, vendor.y - 32 + bob);
}

/** Draw a lamp: a pole, and after dark a pool of warm light on the road
 * around it. The pools are drawn under the night veil's darkening, so they
 * read as light in the dark rather than as paint on the road. */
function drawLamp(ctx, state, lamp, night) {
  ctx.fillStyle = '#2b2f36';
  ctx.fillRect(lamp.x - 2, lamp.y - 14, 4, 14);
  ctx.fillStyle = '#c9cdd4';
  ctx.beginPath();
  ctx.arc(lamp.x, lamp.y - 16, 4, 0, Math.PI * 2);
  ctx.fill();
  if (night > 0.15) {
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, 46);
    glow.addColorStop(0, `rgba(255, 220, 130, ${(0.5 * night).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255, 220, 130, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 46, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw all the ambient life: lamps first (their glow sits on the road),
 * then vendors, then fishermen, so the people stand on top of their world. */
export function drawAmbient(ctx, state, ambient) {
  if (!ambient) return;
  const night = nightFactor(state.timeOfDay);
  for (const lamp of ambient.lamps) {
    if (lamp.x < state.camera.x - 900 || lamp.x > state.camera.x + 900) continue;
    if (lamp.y < state.camera.y - 600 || lamp.y > state.camera.y + 600) continue;
    drawLamp(ctx, state, lamp, night);
  }
  for (const vendor of ambient.vendors) drawVendor(ctx, state, vendor);
  for (const fisherman of ambient.fishermen) drawFisherman(ctx, state, fisherman);
}
