// Keyboard and pointer input. Held keys give movement and driving; one-shot
// presses (start, enter a car, punch, pause, horn, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost or
// counted twice. The mouse position is tracked in screen pixels and converted
// to world coordinates by the caller, who knows the camera.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_CONTINUE = 16;
export const ACTION_HORN = 32;
export const ACTION_MUTE = 64;
export const ACTION_PHONE = 128;
export const ACTION_WEAPON_1 = 256;
export const ACTION_WEAPON_2 = 512;
export const ACTION_WEAPON_3 = 1024;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Enter', 'Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const CONTINUE = new Set(['KeyC']);
const HORN = new Set(['KeyH']);
const MUTE = new Set(['KeyM']);
const PHONE = new Set(['Tab']);
const WEAPON_1 = new Set(['Digit1']);
const WEAPON_2 = new Set(['Digit2']);
const WEAPON_3 = new Set(['Digit3']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, run: false, handbrake: false };
  let actions = 0;
  let mouseDown = false;
  let mouseX = 0;
  let mouseY = 0;

  function press(code) {
    if (UP.has(code)) held.up = true;
    else if (DOWN.has(code)) held.down = true;
    else if (LEFT.has(code)) held.left = true;
    else if (RIGHT.has(code)) held.right = true;
    else if (RUN.has(code)) held.run = true;
    else if (code === 'Space') held.handbrake = true;
    if (CONFIRM.has(code) && !held.repeat) actions |= ACTION_CONFIRM;
    if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    if (ENTER_CAR.has(code)) actions |= ACTION_ENTER;
    if (CONTINUE.has(code)) actions |= ACTION_CONTINUE;
    if (HORN.has(code)) actions |= ACTION_HORN;
    if (MUTE.has(code)) actions |= ACTION_MUTE;
    if (PHONE.has(code)) actions |= ACTION_PHONE;
    if (WEAPON_1.has(code)) actions |= ACTION_WEAPON_1;
    if (WEAPON_2.has(code)) actions |= ACTION_WEAPON_2;
    if (WEAPON_3.has(code)) actions |= ACTION_WEAPON_3;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (UP.has(event.code)) held.up = true;
      else if (DOWN.has(event.code)) held.down = true;
      else if (LEFT.has(event.code)) held.left = true;
      else if (RIGHT.has(event.code)) held.right = true;
      return;
    }
    press(event.code);
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || CONFIRM.has(event.code) || PAUSE.has(event.code) || ENTER_CAR.has(event.code) || CONTINUE.has(event.code)
      || HORN.has(event.code) || MUTE.has(event.code) || RUN.has(event.code)
      || PHONE.has(event.code) || WEAPON_1.has(event.code) || WEAPON_2.has(event.code) || WEAPON_3.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (RUN.has(event.code)) held.run = false;
    else if (event.code === 'Space') held.handbrake = false;
  });
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.run = held.handbrake = false;
    mouseDown = false;
  });
  target.addEventListener('pointerdown', (event) => {
    mouseDown = true;
    mouseX = event.clientX;
    mouseY = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });
  window.addEventListener('pointermove', (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
  });

  return {
    held,
    mouse() {
      return { down: mouseDown, x: mouseX, y: mouseY };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Punch is Space held down; the world rate-limits it. */
    punchHeld() {
      return held.handbrake;
    },
  };
}
