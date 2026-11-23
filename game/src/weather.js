// Solmar Bay weather: the sky over the city has a mind of its own. Four
// states — clear, cloudy, rain, storm — roll over on a seeded clock, so the
// same seed always plays the same sky and a staged screenshot always shows
// the same weather. Rain soaks the roads (less grip, longer braking), a storm
// throws lightning, and the thunder rolls in a beat behind each strike. The
// world steps it, the renderer draws it, and mission seven races through it.
import { WORLD } from './config.js';
import { clamp, lerp } from './random.js';

/** Raised when lightning strikes: the main loop turns it into thunder. */
export const EVENT_THUNDER = 16384;

/** The sky's states in the order they roll through: a storm always breaks
 * back down through rain and cloud before the sun comes out again. */
export const SKY_CYCLE = ['clear', 'cloudy', 'rain', 'storm', 'rain', 'cloudy'];

/** What each sky means: how slick the roads get, how hard it rains, how
 * dark the city turns, and how long the sky holds before it rolls on. */
const SKY = {
  clear: { label: 'CLEAR', grip: 1, drops: 0, dim: 0, hold: [45, 75] },
  cloudy: { label: 'CLOUDY', grip: 0.95, drops: 0, dim: 0.12, hold: [25, 40] },
  rain: { label: 'RAIN', grip: 0.8, drops: 90, dim: 0.22, hold: [30, 50] },
  storm: { label: 'STORM', grip: 0.68, drops: 160, dim: 0.34, hold: [25, 40] },
};

/** A fresh sky: clear, with a seeded clock until the first cloud rolls in
 * and seeded puddle spots waiting on the asphalt for the rain. */
export function createWeather(random) {
  const puddles = [];
  for (let i = 0; i < 18; i += 1) {
    const vertical = random() < 0.5;
    const roads = vertical ? WORLD.roadsX : WORLD.roadsY;
    const line = roads[Math.floor(random() * roads.length)];
    const along = 160 + random() * (vertical ? WORLD.height - 320 : WORLD.width - 320);
    puddles.push({
      x: vertical ? line + (random() - 0.5) * 30 : along,
      y: vertical ? along : line + (random() - 0.5) * 30,
      r: 14 + random() * 22,
    });
  }
  return {
    kind: 'clear',
    cycle: 0,
    strength: 0,
    timer: 50 + random() * 25,
    flash: 0,
    strikeIn: 8 + random() * 6,
    puddles,
    stormsWon: 0,
  };
}

/** Step the sky: the clock rolls the cycle on, the strength fades toward
 * what the current sky wants, lightning decays, and a storm throws a strike
 * every few seconds. Returns events — EVENT_THUNDER when one lands. */
export function updateWeather(dt, weather, random) {
  weather.timer -= dt;
  if (weather.timer <= 0) {
    weather.cycle = (weather.cycle + 1) % SKY_CYCLE.length;
    weather.kind = SKY_CYCLE[weather.cycle];
    const hold = SKY[weather.kind].hold;
    weather.timer = hold[0] + random() * (hold[1] - hold[0]);
    if (weather.kind === 'storm') weather.strikeIn = 2 + random() * 3;
  }
  const target = weather.kind === 'clear' ? 0 : weather.kind === 'cloudy' ? 0.5 : 1;
  weather.strength = clamp(weather.strength + (target - weather.strength) * dt * 0.5, 0, 1);
  weather.flash = Math.max(0, weather.flash - dt * 2.2);
  let events = 0;
  if (weather.kind === 'storm' && weather.strength > 0.5) {
    weather.strikeIn -= dt;
    if (weather.strikeIn <= 0) {
      weather.flash = 1;
      weather.strikeIn = 5 + random() * 7;
      events |= EVENT_THUNDER;
    }
  }
  return events;
}

/** Force a sky — a mission that needs a storm, or a screenshot staged in
 * one. The sky settles in at once and holds for a full spell. */
export function setWeatherKind(weather, kind, random) {
  weather.kind = kind;
  weather.cycle = SKY_CYCLE.indexOf(kind);
  weather.strength = kind === 'clear' ? 0 : kind === 'cloudy' ? 0.5 : 1;
  const hold = SKY[kind].hold;
  weather.timer = hold[0] + random() * (hold[1] - hold[0]);
  weather.flash = 0;
  weather.strikeIn = 2 + random() * 3;
}

/** How much steering and braking the wet road leaves: 1 on dry asphalt,
 * down to 0.68 in a storm, easing in as the rain settles. */
export function wetGripFactor(weather) {
  if (!weather) return 1;
  return lerp(1, SKY[weather.kind].grip, weather.strength);
}

/** The word the HUD and the phone show for the sky overhead. */
export function weatherLabel(weather) {
  if (!weather) return 'CLEAR';
  return SKY[weather.kind].label;
}

/** How many rain streaks the renderer draws this frame. */
export function rainDropCount(weather) {
  if (!weather) return 0;
  return Math.round(SKY[weather.kind].drops * weather.strength);
}

/** How dark the storm makes the city: a grey veil over everything. */
export function skyDim(weather) {
  if (!weather) return 0;
  return SKY[weather.kind].dim * weather.strength;
}
