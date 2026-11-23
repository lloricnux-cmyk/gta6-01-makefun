// All sound is synthesised with WebAudio: no audio files, no network. The
// engine is a filtered sawtooth whose pitch follows the car's speed, the siren
// is a two-tone square wave while the player is wanted, and gunshots, punches,
// pickups, explosions and the mission jingle are short envelopes of noise or
// sine tones. New here: a two-tone car horn (H), a police-dispatch blip when a
// star is added, and a mute toggle (M) that silences everything until pressed
// again. The context is created lazily on the first user gesture; every call is
// guarded, so a browser without audio never breaks the game.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let masterGain = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(masterGain);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(masterGain);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function tone(freq, dur, type, gain, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const osc = c.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain || 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      osc.stop(c.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  function noise(dur, gain, filterFreq) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const len = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const g = c.createGain();
      g.gain.value = gain || 0.25;
      src.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      src.start();
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  return {
    unlock: resume,
    /** True while the mute toggle is on. The HUD hint shows the state. */
    isMuted() {
      return muted;
    },
    /** M toggles all sound, engine and siren included. */
    toggleMute() {
      muted = !muted;
      if (masterGain && ctx) {
        try {
          masterGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
        } catch {
          // Ignore audio errors.
        }
      }
      return muted;
    },
    /** Call every frame: engine follows speed, siren follows the wanted level. */
    update(dt, speed, wanted) {
      const c = ctx;
      if (!c || !engineGain) return;
      try {
        const target = speed > 20 ? 0.05 + Math.min(0.1, Math.abs(speed) / 9000) : 0;
        engineGain.gain.setTargetAtTime(target, c.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 0.22, c.currentTime, 0.08);
        if (wanted > 0) {
          sirenTimer += dt;
          const high = Math.floor(sirenTimer * 1.6) % 2 === 0;
          sirenOsc.frequency.setTargetAtTime(high ? 880 : 620, c.currentTime, 0.05);
          sirenGain.gain.setTargetAtTime(0.035, c.currentTime, 0.1);
        } else {
          sirenGain.gain.setTargetAtTime(0, c.currentTime, 0.1);
        }
      } catch {
        // Ignore audio errors.
      }
    },
    shot() {
      noise(0.12, 0.3, 2400);
      tone(180, 0.08, 'square', 0.12, 60);
    },
    punch() {
      tone(140, 0.12, 'sine', 0.25, 50);
      noise(0.06, 0.12, 500);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.15);
      setTimeout(() => tone(990, 0.12, 'sine', 0.15), 80);
    },
    explosion() {
      noise(0.7, 0.4, 500);
      tone(90, 0.6, 'sine', 0.3, 30);
    },
    mission() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => setTimeout(() => tone(freq, 0.22, 'triangle', 0.18), i * 110));
    },
    wasted() {
      const notes = [392, 330, 262, 196];
      notes.forEach((freq, i) => setTimeout(() => tone(freq, 0.3, 'sawtooth', 0.1), i * 160));
    },
    /** Two-tone car horn: a low and a high note together, short and punchy. */
    horn() {
      tone(370, 0.32, 'square', 0.12);
      tone(466, 0.32, 'square', 0.1);
    },
    /** Police dispatch blip when the wanted level rises: two short beeps. */
    dispatch() {
      tone(880, 0.09, 'square', 0.09);
      setTimeout(() => tone(660, 0.12, 'square', 0.09), 110);
    },
    /** Shotgun: a fat, low blast — more noise and more body than the pistol. */
    /** Thunder: a low rumble that rolls in a beat after the lightning. */
    thunder() {
      noise(0.9, 0.3, 240);
      tone(65, 0.9, 'sine', 0.22, 28);
    },
    shotgun() {
      noise(0.28, 0.42, 900);
      tone(120, 0.22, 'square', 0.2, 40);
    },
    /** SMG: a short, sharp crack, higher and thinner than the pistol. */
    smg() {
      noise(0.06, 0.22, 3200);
      tone(240, 0.05, 'square', 0.08, 90);
    },
    /** Taxi chime: two warm notes when a fare is offered or paid. */
    taxi() {
      tone(784, 0.12, 'triangle', 0.16);
      setTimeout(() => tone(1047, 0.16, 'triangle', 0.16), 110);
    },
    /** Race beep: a countdown tick, and a higher one for the green light. */
    raceBeep(go) {
      tone(go ? 1047 : 659, go ? 0.3 : 0.12, 'square', 0.12);
    },
    /** Package blip: a bright little sparkle when a hidden parcel is found. */
    packageBlip() {
      const notes = [880, 1175, 1568];
      notes.forEach((freq, i) => setTimeout(() => tone(freq, 0.1, 'sine', 0.14), i * 60));
    },
    /** Phone click: a soft tap when the phone opens or closes. */
    phoneClick() {
      tone(520, 0.06, 'sine', 0.1);
    },
  };
}
