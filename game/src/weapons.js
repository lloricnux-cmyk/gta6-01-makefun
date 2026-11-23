// The armoury: three guns, one at a time. Rico starts with fists; Mara hands
// him a pistol after the first mission, and the shotgun and the SMG are found
// as pickups — the shotgun at the docks, the SMG at the warehouse. Each gun
// keeps its own ammo, so switching back to a gun you fed earlier finds it
// loaded, and each gun fires its own way: the pistol is one straight shot,
// the shotgun is six pellets in a fan, the SMG is a fast, loose stream.
//
// The world owns the raycast (shootAt) and the fire timer; this module owns
// which gun is in hand, how much ammo it has, and what a trigger pull turns
// into. The HUD reads the current gun's name and ammo from the player.
import { WEAPONS } from './config.js';

export const WEAPON_ORDER = ['pistol', 'shotgun', 'smg'];

/** The weapon state a fresh player carries: fists, then a pistol with a full
 * box of shells once Mara hands it over. The shotgun and the SMG start
 * unowned, with no ammo, until their pickups are found. */
export function createWeaponState() {
  return {
    weapon: 'pistol',
    owned: { pistol: true, shotgun: false, smg: false },
    ammoByWeapon: { pistol: 60, shotgun: 0, smg: 0 },
  };
}

/** The tuning for the gun in hand, from the config table. */
export function currentWeaponSpec(player) {
  return WEAPONS[player.weapon] || WEAPONS.pistol;
}

/** The display name of the gun in hand, for the HUD. */
export function weaponName(player) {
  return currentWeaponSpec(player).name;
}

/** Keep the player's single ammo number in step with the gun in hand: the
 * HUD and the save both read player.ammo, so it always mirrors the current
 * gun's own count. */
export function syncAmmo(player) {
  player.ammo = player.ammoByWeapon[player.weapon] || 0;
}

/** Hand a gun to the player: mark it owned, add its ammo, and switch to it.
 * A pickup calls this; the world never has to know which gun it was. */
export function giveWeapon(player, name, ammo) {
  const spec = WEAPONS[name];
  if (!spec) return false;
  player.owned[name] = true;
  player.ammoByWeapon[name] = (player.ammoByWeapon[name] || 0) + (ammo || spec.pickupAmmo);
  player.weapon = name;
  player.armed = true;
  syncAmmo(player);
  return true;
}

/** Switch to another owned gun. The number keys call this; an unowned gun
 * refuses, and the HUD says so through the toast the caller shows. */
export function switchWeapon(player, name) {
  if (!WEAPONS[name]) return false;
  if (!player.owned[name]) return false;
  if (player.weapon === name) return false;
  player.weapon = name;
  syncAmmo(player);
  return true;
}

/** The next owned gun after the one in hand, for a single cycle key. */
export function nextWeapon(player) {
  const owned = WEAPON_ORDER.filter((name) => player.owned[name]);
  if (owned.length <= 1) return player.weapon;
  const at = owned.indexOf(player.weapon);
  return owned[(at + 1) % owned.length];
}

/**
 * One trigger pull. The caller checks that the player is armed and that the
 * fire timer has run out, then this spends one round, sets the next interval,
 * and fires each pellet through the world's raycast. A shotgun fans six
 * pellets across its spread; the other guns fire one straight pellet. The
 * aim point for a pellet is the aim point rotated by its spread offset, so
 * the fan opens around the crosshair instead of around the player.
 *
 * `shoot` is the world's raycast: shoot(aimX, aimY, damage) fires one pellet
 * from the player toward that point and returns its event flag.
 */
export function fireWeapon(player, aimX, aimY, shoot) {
  const spec = currentWeaponSpec(player);
  const ammo = player.ammoByWeapon[player.weapon] || 0;
  if (ammo <= 0) return 0;
  player.ammoByWeapon[player.weapon] = ammo - 1;
  player.fireTimer = spec.interval;
  syncAmmo(player);
  // The SMG's loose stream jitters from a counter, not from Math.random, so
  // a replay of the same seed with the same inputs is the same game.
  player.shotCount = (player.shotCount || 0) + 1;
  const base = Math.atan2(aimY - player.y, aimX - player.x);
  const reach = spec.range;
  let events = 0;
  for (let i = 0; i < spec.pellets; i += 1) {
    // Spread the pellets evenly across the fan, the middle one dead on. The
    // single-pellet guns jitter a little, from the shot counter.
    const offset = spec.pellets === 1
      ? (spec.spread > 0
        ? ((((player.shotCount * 2654435761) >>> 0) / 4294967296) - 0.5) * spec.spread
        : 0)
      : ((i / (spec.pellets - 1)) - 0.5) * spec.spread;
    const angle = base + offset;
    const pelletX = player.x + Math.cos(angle) * reach;
    const pelletY = player.y + Math.sin(angle) * reach;
    events |= shoot(pelletX, pelletY, spec.damage);
  }
  return events;
}

/** How many rounds the player carries in total, across all owned guns. The
 * phone's stats screen shows it beside the gun in hand. */
export function totalAmmo(player) {
  let total = 0;
  for (const name of WEAPON_ORDER) total += player.ammoByWeapon[name] || 0;
  return total;
}

/** A short line for the pause menu's weapon list: which guns are owned, and
 * how much ammo each one holds. */
export function weaponListLines(player) {
  return WEAPON_ORDER.map((name) => {
    const spec = WEAPONS[name];
    const owned = player.owned[name];
    const ammo = player.ammoByWeapon[name] || 0;
    const marker = player.weapon === name ? '▶ ' : '   ';
    return owned
      ? `${marker}${spec.name} — ${ammo} rounds`
      : `${marker}${spec.name} — not found yet`;
  });
}
