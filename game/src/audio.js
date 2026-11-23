// All sound is synthesised with WebAudio: no audio files, no network. The
// engine is a filtered sawtooth whose pitch follows the car's speed, the siren
// is a two-tone square wave while the player is wanted, and gunshots, punches,
// pickups, explosions and the mission jingle are short envelopes of noise or
// sine tones. The context is created lazily on the first user gesture; every
// call is guarded, so a browser without audio never breaks the game.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      ctx = new AudioContext();
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
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
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
    if (!c) return;
    try {
      const osc = c.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gain || 0.15, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  function noise(dur, gain, filterFreq) {
    const c = ensure();
    if (!c) return;
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
      g.connect(c.destination);
      src.start();
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  return {
    unlock: resume,
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
  };
}
