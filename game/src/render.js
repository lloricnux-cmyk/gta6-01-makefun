// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. The camera follows the player with a zoom that opens
// up while driving. Everything is canvas shapes and text: no images, no network.
// The sun's angle comes from the world's clock, so shadows and the warm evening
// tint move as the day passes.
import { PALETTE, VIEW, WORLD } from './config.js';
import { parkRect } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MINIMAP = { x: 24, y: VIEW.height - 24 - 150, w: 200, h: 150 };

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function outlineText(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.lineWidth = Math.max(3, size / 7);
    context.strokeStyle = 'rgba(0,0,0,0.75)';
    context.strokeText(value, x, y);
    context.fillStyle = color;
    context.fillText(value, x, y);
  }

  function sunAngle(state) {
    return state.timeOfDay * Math.PI * 2;
  }

  function daylight(state) {
    // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
    const t = state.timeOfDay;
    const day = Math.sin((t - 0.25) * Math.PI * 2);
    return Math.max(0, Math.min(1, day * 1.6 + 0.25));
  }

  function drawGround(state, vis) {
    const ctx = context;
    // Base grass.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vis.x0, vis.y0, vis.x1 - vis.x0, vis.y1 - vis.y0);
    // City blocks: concrete pads between roads.
    ctx.fillStyle = PALETTE.block;
    const half = WORLD.roadHalf + WORLD.sidewalk;
    for (let ix = 0; ix < WORLD.roadsX.length - 1; ix += 1) {
      for (let iy = 0; iy < WORLD.roadsY.length - 1; iy += 1) {
        const x0 = WORLD.roadsX[ix] + half;
        const y0 = WORLD.roadsY[iy] + half;
        const x1 = WORLD.roadsX[ix + 1] - half;
        const y1 = WORLD.roadsY[iy + 1] - half;
        if (y0 >= WORLD.beachY) continue;
        if (x1 < vis.x0 || x0 > vis.x1 || y1 < vis.y0 || y0 > vis.y1) continue;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // Park.
    const park = parkRect();
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(park.x, park.y, park.w, park.h);
    // Beach and ocean.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vis.x0, WORLD.beachY, vis.x1 - vis.x0, WORLD.oceanY - WORLD.beachY);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(vis.x0, WORLD.oceanY, vis.x1 - vis.x0, WORLD.height - WORLD.oceanY);
    ctx.fillStyle = PALETTE.oceanDeep;
    for (let x = Math.floor(vis.x0 / 90) * 90; x < vis.x1; x += 90) {
      const wave = Math.sin(state.time * 1.4 + x * 0.05) * 6;
      ctx.fillRect(x, WORLD.oceanY + 30 + wave, 46, 5);
      ctx.fillRect(x + 30, WORLD.oceanY + 90 - wave, 40, 5);
    }
    // Harbor water, west edge.
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(0, vis.y0, WORLD.harborX, vis.y1 - vis.y0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(WORLD.harborX, vis.y0, 14, vis.y1 - vis.y0);
  }

  function drawRoads(state, vis) {
    const ctx = context;
    const half = WORLD.roadHalf;
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of WORLD.roadsX) {
      ctx.fillRect(rx - half - WORLD.sidewalk, vis.y0, (half + WORLD.sidewalk) * 2, vis.y1 - vis.y0);
    }
    for (const ry of WORLD.roadsY) {
      ctx.fillRect(vis.x0, ry - half - WORLD.sidewalk, vis.x1 - vis.x0, (half + WORLD.sidewalk) * 2);
    }
    ctx.fillStyle = PALETTE.asphalt;
    for (const rx of WORLD.roadsX) {
      ctx.fillRect(rx - half, vis.y0, half * 2, vis.y1 - vis.y0);
    }
    for (const ry of WORLD.roadsY) {
      ctx.fillRect(vis.x0, ry - half, vis.x1 - vis.x0, half * 2);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of WORLD.roadsX) {
      for (let y = Math.floor(vis.y0 / 56) * 56; y < vis.y1; y += 56) {
        if (y < WORLD.beachY) ctx.fillRect(rx - 2, y, 4, 26);
      }
    }
    for (const ry of WORLD.roadsY) {
      for (let x = Math.floor(vis.x0 / 56) * 56; x < vis.x1; x += 56) {
        ctx.fillRect(x, ry - 2, 26, 4);
      }
    }
    // Crosswalks at every crossing.
    ctx.fillStyle = 'rgba(240,240,235,0.85)';
    for (const rx of WORLD.roadsX) {
      for (const ry of WORLD.roadsY) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(rx - half + 6, ry - 14 + i * 8, 10, 4);
          ctx.fillRect(rx + half - 16, ry - 14 + i * 8, 10, 4);
        }
      }
    }
  }

  function drawBuildings(state, vis) {
    const ctx = context;
    const sun = sunAngle(state);
    const sx = Math.cos(sun);
    const sy = Math.sin(sun);
    const day = daylight(state);
    for (const b of state.city.buildings) {
      if (b.x > vis.x1 || b.x + b.w < vis.x0 || b.y > vis.y1 || b.y + b.h < vis.y0) continue;
      // Shadow falls away from the sun, longer when the sun is low.
      const shLen = b.height * (1.1 - day * 0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + sx * shLen, b.y + sy * shLen, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      if (b.roof) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, b.w * 0.24, b.h * 0.22);
        ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, b.w * 0.2, b.h * 0.18);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }
    // Trees.
    for (const t of state.city.trees) {
      if (t.x < vis.x0 || t.x > vis.x1 || t.y < vis.y0 || t.y > vis.y1) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(t.x + 5, t.y + 6, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.palm ? PALETTE.treeLight : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCarShape(car, state) {
    const ctx = context;
    const len = 52;
    const wid = 26;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(ctx, -len / 2 + 3, -wid / 2 + 4, len, wid, 8);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -len / 2, -wid / 2, len, wid, 8);
    ctx.fill();
    // Roof and glass.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    rr(ctx, -10, -wid / 2 + 3, 20, wid - 6, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,16,28,0.85)';
    ctx.fillRect(8, -wid / 2 + 4, 8, wid - 8);
    ctx.fillRect(-20, -wid / 2 + 4, 6, wid - 8);
    // Headlights and taillights.
    ctx.fillStyle = '#fff6c9';
    ctx.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 5);
    ctx.fillRect(len / 2 - 3, wid / 2 - 8, 3, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-len / 2, -wid / 2 + 3, 3, 5);
    ctx.fillRect(-len / 2, wid / 2 - 8, 3, 5);
    if (car.kind === 'police') {
      const flash = Math.floor(state.time * 6) % 2 === 0;
      ctx.fillStyle = flash ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
      ctx.fillRect(-4, -wid / 2 + 2, 8, 6);
      ctx.fillStyle = flash ? PALETTE.policeLightBlue : PALETTE.policeLightRed;
      ctx.fillRect(-4, wid / 2 - 8, 8, 6);
      ctx.fillStyle = '#10141c';
      ctx.fillRect(-2, -wid / 2 + 2, 4, wid - 4);
    }
    if (car.kind === 'sports') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-len / 2 - 2, -wid / 2 + 2, 5, wid - 4);
    }
    ctx.restore();
  }

  function drawPedShape(ped) {
    const ctx = context;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(ped.x + 2, ped.y + 3, 9, 0, Math.PI * 2);
    ctx.fill();
    if (ped.state === 'down') {
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 7, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.kind === 'cop') {
      ctx.fillStyle = '#16233d';
      ctx.beginPath();
      ctx.arc(ped.x, ped.y - 1, 5.5, Math.PI, 0);
      ctx.fill();
    }
    if (ped.kind === 'thug') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ped.x, ped.y);
      ctx.lineTo(ped.x + Math.cos(ped.angle) * 16, ped.y + Math.sin(ped.angle) * 16);
      ctx.stroke();
    }
  }

  function drawPlayerShape(state) {
    const ctx = context;
    const player = state.player;
    if (player.inCar) return;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(player.x + 2, player.y + 3, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b98d';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    // Facing tick, and the gun when armed.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(player.x, player.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBeacon(state) {
    const ctx = context;
    const target = state.missionTarget;
    if (!target || state.missionIndex >= 3) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    const bob = Math.sin(state.time * 3) * 6;
    ctx.fillStyle = 'rgba(242,201,76,0.12)';
    ctx.fillRect(target.x - 14, target.y - 260, 28, 260);
    ctx.strokeStyle = PALETTE.beacon;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.beacon;
    ctx.beginPath();
    ctx.moveTo(target.x, target.y - 66 + bob);
    ctx.lineTo(target.x + 12, target.y - 48 + bob);
    ctx.lineTo(target.x, target.y - 30 + bob);
    ctx.lineTo(target.x - 12, target.y - 48 + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawParticles(state) {
    const ctx = context;
    for (const p of state.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - alpha * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state) {
    const ctx = context;
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      const bob = Math.sin(state.time * 5) * 3;
      ctx.fillStyle = pickup.kind === 'cash' ? PALETTE.gold : pickup.kind === 'ammo' ? '#7ec8ff' : PALETTE.green;
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y + bob, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#10141c';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pickup.kind === 'cash' ? '$' : pickup.kind === 'ammo' ? 'A' : '+', pickup.x, pickup.y + bob + 0.5);
    }
  }

  function drawLighting(state) {
    const ctx = context;
    const day = daylight(state);
    // Night falls: a cool blue veil. Golden hour: a warm wash.
    if (day < 0.55) {
      ctx.fillStyle = `rgba(8, 16, 44, ${(0.55 - day) * 0.55})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    } else if (state.timeOfDay > 0.68 && state.timeOfDay < 0.82) {
      ctx.fillStyle = 'rgba(255, 150, 60, 0.10)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  function drawStar(cx, cy, r, filled) {
    const ctx = context;
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawMinimap(state) {
    const ctx = context;
    const scale = MINIMAP.w / WORLD.width;
    const mx = MINIMAP.x;
    const my = MINIMAP.y;
    ctx.fillStyle = 'rgba(10,16,28,0.85)';
    rr(ctx, mx - 6, my - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(ctx, mx, my, MINIMAP.w, MINIMAP.h, 4);
    ctx.clip();
    ctx.fillStyle = '#4a7a44';
    ctx.fillRect(mx, my, MINIMAP.w, MINIMAP.h);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(mx, my + WORLD.beachY * scale, MINIMAP.w, (WORLD.oceanY - WORLD.beachY) * scale);
    ctx.fillStyle = PALETTE.ocean;
    ctx.fillRect(mx, my + WORLD.oceanY * scale, MINIMAP.w, MINIMAP.h - WORLD.oceanY * scale);
    const park = parkRect();
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(mx + park.x * scale, my + park.y * scale, park.w * scale, park.h * scale);
    ctx.strokeStyle = '#c9cdd4';
    ctx.lineWidth = 2;
    for (const rx of WORLD.roadsX) {
      ctx.beginPath();
      ctx.moveTo(mx + rx * scale, my);
      ctx.lineTo(mx + rx * scale, my + MINIMAP.h);
      ctx.stroke();
    }
    for (const ry of WORLD.roadsY) {
      ctx.beginPath();
      ctx.moveTo(mx, my + ry * scale);
      ctx.lineTo(mx + MINIMAP.w, my + ry * scale);
      ctx.stroke();
    }
    // Mission target.
    const target = state.missionTarget;
    if (target && state.missionIndex < 3) {
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      ctx.fillStyle = PALETTE.beacon;
      ctx.beginPath();
      ctx.arc(mx + target.x * scale, my + target.y * scale, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police.
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
      ctx.beginPath();
      ctx.arc(mx + car.x * scale, my + car.y * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const player = state.player;
    ctx.save();
    ctx.translate(mx + player.x * scale, my + player.y * scale);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    rr(ctx, mx - 6, my - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    ctx.stroke();
    text('SOLMAR BAY', mx, my - 12, 13, PALETTE.muted, 'left', 'bold ');
  }

  function drawHud(state, ui) {
    const ctx = context;
    const player = state.player;
    // Cash and health, top left.
    outlineText(`$${player.cash.toLocaleString('en-US')}`, 24, 44, 30, '#fff', 'left', 'bold ');
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rr(ctx, 24, 56, 190, 14, 7);
    ctx.fill();
    const hp = Math.max(0, player.health / 100);
    ctx.fillStyle = hp > 0.5 ? PALETTE.green : hp > 0.25 ? PALETTE.gold : PALETTE.red;
    if (hp > 0) {
      rr(ctx, 26, 58, 186 * hp, 10, 5);
      ctx.fill();
    }
    // Wanted stars, top right: drawn as shapes, never glyphs, so an empty
    // star is unmistakably empty in every font.
    const starR = 17;
    const starGap = 36;
    const starY = 34;
    for (let i = 0; i < 5; i += 1) {
      const sx = VIEW.width - 24 - (4 - i) * starGap - starR;
      drawStar(sx, starY, starR, i < state.wanted);
    }
    if (state.wanted > 0) {
      outlineText('WANTED', VIEW.width - 24, 72, 15, '#ff6b5e', 'right', 'bold ');
    }
    // Mission objective, top centre.
    const mission = state.missionIndex < 3 ? `MISSION ${state.missionIndex + 1}/3` : 'FREE ROAM';
    outlineText(mission, VIEW.width / 2, 36, 15, PALETTE.gold, 'center', 'bold ');
    outlineText(state.missionText, VIEW.width / 2, 62, 17, '#fff', 'center');
    if (state.missionTarget && state.missionIndex < 3) {
      const d = Math.round(Math.hypot(player.x - state.missionTarget.x, player.y - state.missionTarget.y));
      outlineText(`${state.missionTarget.label} · ${d}m`, VIEW.width / 2, 86, 14, PALETTE.muted, 'center');
    }
    // Speed and weapon, bottom right.
    if (player.inCar) {
      const mph = Math.round(Math.abs(player.inCar.speed) * 0.12);
      outlineText(`${mph}`, VIEW.width - 24, VIEW.height - 64, 44, '#fff', 'right', 'bold ');
      outlineText('MPH', VIEW.width - 24, VIEW.height - 40, 15, PALETTE.muted, 'right', 'bold ');
      const hpCar = Math.max(0, player.inCar.health);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      rr(ctx, VIEW.width - 214, VIEW.height - 30, 190, 10, 5);
      ctx.fill();
      ctx.fillStyle = hpCar > 50 ? '#cfd6de' : PALETTE.red;
      if (hpCar > 0) {
        rr(ctx, VIEW.width - 212, VIEW.height - 28, 186 * (hpCar / 100), 6, 3);
        ctx.fill();
      }
    } else {
      outlineText(player.armed ? `PISTOL · ${player.ammo}` : 'FISTS', VIEW.width - 24, VIEW.height - 40, 22, '#fff', 'right', 'bold ');
    }
    // Toast, centre.
    if (state.toastTimer > 0) {
      outlineText(state.toast, VIEW.width / 2, 150, 24, PALETTE.gold, 'center', 'bold ');
    }
    // Mission passed banner.
    if (state.bannerTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 250, VIEW.width, 74);
      outlineText(state.missionBanner, VIEW.width / 2, 300, 34, PALETTE.gold, 'center', 'bold ');
    }
    // Controls hint.
    text('WASD move · E enter car · Click shoot · Space punch · Shift run · P pause', VIEW.width / 2, VIEW.height - 12, 13, 'rgba(255,255,255,0.6)', 'center');
  }

  function drawPanel(title, lines, prompt, accent) {
    const ctx = context;
    const width = 660;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 74;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    ctx.fillStyle = PALETTE.panel;
    rr(ctx, x, y, width, height, 12);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.gold;
    ctx.lineWidth = 3;
    rr(ctx, x, y, width, height, 12);
    ctx.stroke();
    text(title, VIEW.width / 2, y + 72, 52, accent || PALETTE.gold, 'center', 'bold ');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 126 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 21, PALETTE.text, 'center', 'bold ');
  }

  function drawTitle(state, ui) {
    // Dim the city a little so the title reads.
    context.fillStyle = 'rgba(6,10,20,0.45)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    outlineText('SOLMAR BAY', VIEW.width / 2, 168, 92, PALETTE.gold, 'center', 'bold ');
    outlineText('A SOLMAR BAY STORY', VIEW.width / 2, 208, 24, '#fff', 'center', 'bold ');
    text('Rico Vega is out of prison and back in Solmar Bay. Mara Solano has work for him —', VIEW.width / 2, 268, 19, PALETTE.muted, 'center');
    text('packages to move, cars to steal, scores to settle. The city is yours. The law is not.', VIEW.width / 2, 294, 19, PALETTE.muted, 'center');
    text('WASD / arrows — move & drive      E — enter / steal a car      Mouse — aim, click — shoot', VIEW.width / 2, 352, 18, PALETTE.text, 'center');
    text('Space — punch      Shift — run      P — pause      Missions pay cash. Cops cost it.', VIEW.width / 2, 380, 18, PALETTE.text, 'center');
    text('3 missions · traffic & pedestrians · wanted level & police · save keeps your cash', VIEW.width / 2, 424, 17, PALETTE.muted, 'center');
    const prompt = ui.hasSave
      ? `ENTER — start story      C — continue ($${ui.saveCash}, mission ${ui.saveMission}/3)`
      : 'ENTER or click — start story';
    outlineText(prompt, VIEW.width / 2, 500, 24, PALETTE.gold, 'center', 'bold ');
    if (ui.best > 0) text(`Best cash: $${ui.best.toLocaleString('en-US')}`, VIEW.width / 2, 544, 17, PALETTE.muted, 'center');
    text('An original game. No Rockstar content — Solmar Bay, its people and its story are all our own.', VIEW.width / 2, 690, 13, 'rgba(255,255,255,0.45)', 'center');
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(state, screen, ui) {
    const ctx = context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cam = state.camera;
    const s = view.scale * cam.zoom;
    const cx = view.x + (VIEW.width * view.scale) / 2;
    const cy = view.y + (VIEW.height * view.scale) / 2;
    ctx.setTransform(s, 0, 0, s, cx - cam.x * s, cy - cam.y * s);
    const vis = {
      x0: cam.x - VIEW.width / (2 * cam.zoom) - 40,
      x1: cam.x + VIEW.width / (2 * cam.zoom) + 40,
      y0: cam.y - VIEW.height / (2 * cam.zoom) - 40,
      y1: cam.y + VIEW.height / (2 * cam.zoom) + 40,
    };
    drawGround(state, vis);
    drawRoads(state, vis);
    drawBuildings(state, vis);
    drawPickups(state);
    drawBeacon(state);
    // Cars and pedestrians, lowest y first so nearer things overlap.
    const drawables = [];
    for (const car of state.cars) if (!car.dead) drawables.push({ y: car.y, draw: () => drawCarShape(car, state) });
    for (const ped of state.peds) if (!ped.dead) drawables.push({ y: ped.y, draw: () => drawPedShape(ped) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();
    drawPlayerShape(state);
    drawParticles(state);
    // Back to screen space for lighting and the HUD.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawLighting(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
      return;
    }
    drawHud(state, ui);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for you.', 'WASD move · E car · Click shoot · Space punch'], 'P — resume', '#fff');
    } else if (screen === SCREEN_WASTED) {
      drawPanel('WASTED', [`You lost $${ui.lost}.`, 'Mara is not impressed.'], 'ENTER — wake up at Solmar General', PALETTE.red);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', [`You lost $${ui.lost}.`, 'The Solmar Bay PD thanks you for your cooperation.'], 'ENTER — walk out of the station', '#7ec8ff');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
