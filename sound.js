// Sound effects, built in code with the Web Audio API — no audio files.
// A checker landing on a board is a short wooden knock: a low thump that dies
// away fast, plus a click of noise for the clatter of the piece itself.

const Sound = (() => {
  const STORAGE_KEY = 'superCheckersSound';
  const VOLUME = 0.5;

  let ctx = null;
  let enabled = true;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch (e) {
    // Private browsing can refuse storage; sound just won't be remembered.
  }

  // Browsers only allow audio after the player interacts with the page, so the
  // audio context is created on the first sound and resumed if it was paused.
  function context() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function gainNode(c, at, peak, duration, attack = 0.002) {
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(peak * VOLUME, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    gain.connect(c.destination);
    return gain;
  }

  // A pitched note. `slideTo` bends the pitch over the note's life.
  function tone(c, at, { freq, slideTo, type = 'sine', peak = 0.5, duration = 0.2, attack = 0.002 }) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
    osc.connect(gainNode(c, at, peak, duration, attack));
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  // A burst of filtered noise — the click or scrape part of a sound.
  function noise(c, at, { peak = 0.3, duration = 0.05, filter = 2000, type = 'lowpass' } = {}) {
    const frames = Math.ceil(c.sampleRate * duration);
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

    const source = c.createBufferSource();
    source.buffer = buffer;
    const band = c.createBiquadFilter();
    band.type = type;
    band.frequency.value = filter;
    source.connect(band);
    band.connect(gainNode(c, at, peak, duration));
    source.start(at);
  }

  // Wood on wood: the sound every piece makes when it lands.
  function knock(c, at, { pitch = 170, peak = 0.7, click = 0.35 } = {}) {
    tone(c, at, { freq: pitch, slideTo: pitch * 0.55, type: 'sine', peak, duration: 0.13 });
    tone(c, at, { freq: pitch * 4.5, slideTo: pitch * 2.5, type: 'triangle', peak: peak * 0.25, duration: 0.06 });
    noise(c, at, { peak: click, duration: 0.045, filter: 2600, type: 'bandpass' });
  }

  const SOUNDS = {
    // A piece being set down.
    move: (c, at) => knock(c, at),

    // Landing, plus the captured piece being knocked out of the way.
    capture: (c, at) => {
      knock(c, at, { pitch: 190, peak: 0.75, click: 0.4 });
      knock(c, at + 0.075, { pitch: 120, peak: 0.45, click: 0.28 });
    },

    // Picking up a piece.
    select: (c, at) => {
      tone(c, at, { freq: 620, type: 'sine', peak: 0.16, duration: 0.05 });
    },

    // Menu buttons.
    click: (c, at) => {
      tone(c, at, { freq: 420, slideTo: 620, type: 'triangle', peak: 0.2, duration: 0.06 });
    },

    // A piece becomes a king: a little rising flourish over the knock.
    crown: (c, at) => {
      knock(c, at, { pitch: 200, peak: 0.5 });
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        tone(c, at + 0.05 + i * 0.075, { freq, type: 'triangle', peak: 0.3, duration: 0.18 });
      });
    },

    // Earning an ability — higher and brighter for the better tiers.
    rewardCommon: (c, at) => tone(c, at, { freq: 880, type: 'sine', peak: 0.28, duration: 0.18 }),
    rewardRare: (c, at) => {
      tone(c, at, { freq: 880, type: 'sine', peak: 0.28, duration: 0.16 });
      tone(c, at + 0.09, { freq: 1174.7, type: 'sine', peak: 0.26, duration: 0.2 });
    },
    rewardEpic: (c, at) => {
      [880, 1174.7, 1567.98].forEach((freq, i) => {
        tone(c, at + i * 0.08, { freq, type: 'triangle', peak: 0.3, duration: 0.24 });
      });
    },

    // Using an ability: a soft sweep, so it doesn't sound like a normal move.
    ability: (c, at) => {
      tone(c, at, { freq: 330, slideTo: 990, type: 'sine', peak: 0.3, duration: 0.22, attack: 0.02 });
      noise(c, at, { peak: 0.12, duration: 0.18, filter: 1400, type: 'highpass' });
    },

    win: (c, at) => {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(c, at + i * 0.13, { freq, type: 'triangle', peak: 0.35, duration: 0.34 });
      });
    },

    lose: (c, at) => {
      [392, 329.63, 261.63].forEach((freq, i) => {
        tone(c, at + i * 0.16, { freq, type: 'sine', peak: 0.32, duration: 0.4 });
      });
    },

    draw: (c, at) => {
      tone(c, at, { freq: 440, type: 'sine', peak: 0.3, duration: 0.3 });
      tone(c, at + 0.16, { freq: 440, type: 'sine', peak: 0.26, duration: 0.36 });
    },
  };

  // `target` lets tests render a sound offline instead of playing it.
  function play(name, target) {
    const sound = SOUNDS[name];
    if (!sound) return;
    if (target) {
      sound(target, 0);
      return;
    }
    if (!enabled) return;
    const c = context();
    if (!c) return;
    try {
      sound(c, c.currentTime + 0.001);
    } catch (e) {
      // A sound failing is never worth interrupting the game for.
    }
  }

  function setEnabled(on) {
    enabled = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch (e) {
      // Not remembered, but still applies for this session.
    }
    if (on) play('click');
  }

  return { play, setEnabled, isEnabled: () => enabled, names: Object.keys(SOUNDS) };
})();

if (typeof module !== 'undefined') module.exports = { Sound };
