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

  function noiseBuffer(c, duration) {
    const frames = Math.ceil(c.sampleRate * duration);
    const buffer = c.createBuffer(1, frames, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // A burst of filtered noise — the click or scrape part of a sound.
  function noise(c, at, { peak = 0.3, duration = 0.05, filter = 2000, type = 'lowpass' } = {}) {
    const source = c.createBufferSource();
    source.buffer = noiseBuffer(c, duration);
    const band = c.createBiquadFilter();
    band.type = type;
    band.frequency.value = filter;
    source.connect(band);
    band.connect(gainNode(c, at, peak, duration));
    source.start(at);
  }

  // Noise whose filter sweeps — the sound of something moving past you.
  function swish(c, at, { from = 600, to = 2200, duration = 0.16, peak = 0.22 } = {}) {
    const source = c.createBufferSource();
    source.buffer = noiseBuffer(c, duration);
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.8;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + duration);
    source.connect(band);
    band.connect(gainNode(c, at, peak, duration, 0.03));
    source.start(at);
  }

  // A checker landing on a wooden board: a sharp click of contact, then a few
  // fixed resonances that die away within about a twentieth of a second.
  // (Sliding a low tone downward instead would give you a bass drum.)
  const PARTIALS = [[1, 1, 0.085], [1.63, 0.5, 0.07], [2.41, 0.28, 0.05], [3.74, 0.14, 0.035]];

  function knock(c, at, { pitch = 620, peak = 0.55, click = 0.4 } = {}) {
    // The contact itself: a very short tick, no pitch of its own.
    noise(c, at, { peak: click, duration: 0.008, filter: 2200, type: 'bandpass' });
    noise(c, at, { peak: click * 0.4, duration: 0.02, filter: 5000, type: 'highpass' });
    // The piece and the board ringing — spaced unevenly, the way wood does.
    for (const [mult, amp, duration] of PARTIALS) {
      tone(c, at, { freq: pitch * mult, type: 'sine', peak: peak * amp, duration, attack: 0.001 });
    }
    // Just enough body to feel solid, gone before it can sound like a drum.
    tone(c, at, { freq: 175, type: 'sine', peak: peak * 0.22, duration: 0.05, attack: 0.001 });
  }

  // Real pieces never sound identical twice.
  const vary = (base, amount = 0.07) => base * (1 + (Math.random() * 2 - 1) * amount);

  const SOUNDS = {
    // A piece being set down.
    move: (c, at) => knock(c, at, { pitch: vary(620) }),

    // Landing, plus the captured piece knocked aside a moment later.
    capture: (c, at) => {
      knock(c, at, { pitch: vary(670), peak: 0.6, click: 0.45 });
      knock(c, at + 0.075, { pitch: vary(500), peak: 0.4, click: 0.3 });
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
      knock(c, at, { pitch: vary(580), peak: 0.55 });
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

    // Using an ability: a soft sweep, for anything without its own sound.
    ability: (c, at) => {
      tone(c, at, { freq: 330, slideTo: 990, type: 'sine', peak: 0.3, duration: 0.22, attack: 0.02 });
      noise(c, at, { peak: 0.12, duration: 0.18, filter: 1400, type: 'highpass' });
    },

    // Sliding sideways: a scrape, then the piece settling.
    abilitySidestep: (c, at) => {
      swish(c, at, { from: 700, to: 1800, duration: 0.15, peak: 0.2 });
      knock(c, at + 0.13, { pitch: vary(640), peak: 0.5 });
    },

    // Backing up: the same scrape, running the other way.
    abilityRetreat: (c, at) => {
      swish(c, at, { from: 1700, to: 650, duration: 0.16, peak: 0.2 });
      knock(c, at + 0.14, { pitch: vary(560), peak: 0.5 });
    },

    // Two steps: two taps, the second a touch brighter.
    abilityExtraStep: (c, at) => {
      swish(c, at, { from: 800, to: 1500, duration: 0.1, peak: 0.13 });
      knock(c, at + 0.02, { pitch: vary(600), peak: 0.45, click: 0.3 });
      knock(c, at + 0.16, { pitch: vary(680), peak: 0.5, click: 0.35 });
    },

    // A bubble swelling into place.
    abilityShield: (c, at) => {
      tone(c, at, { freq: 392, slideTo: 784, type: 'sine', peak: 0.3, duration: 0.42, attack: 0.06 });
      tone(c, at + 0.06, { freq: 587.33, type: 'triangle', peak: 0.18, duration: 0.36, attack: 0.08 });
      noise(c, at, { peak: 0.1, duration: 0.4, filter: 900, type: 'highpass' });
    },

    // Frost: a glassy note falling, with a crackle.
    abilityFreeze: (c, at) => {
      tone(c, at, { freq: 2093, slideTo: 784, type: 'triangle', peak: 0.26, duration: 0.38 });
      tone(c, at + 0.04, { freq: 1567.98, slideTo: 659.25, type: 'sine', peak: 0.16, duration: 0.34 });
      for (let i = 0; i < 5; i++) {
        noise(c, at + 0.05 + i * 0.05, { peak: 0.1, duration: 0.03, filter: 5200, type: 'highpass' });
      }
    },

    // A shove: heavier and duller than a normal landing.
    abilityPush: (c, at) => {
      swish(c, at, { from: 900, to: 400, duration: 0.12, peak: 0.2 });
      knock(c, at + 0.05, { pitch: vary(380), peak: 0.6, click: 0.3 });
    },

    // Two pieces blinking out and back in somewhere else.
    abilitySwap: (c, at) => {
      tone(c, at, { freq: 420, slideTo: 1900, type: 'triangle', peak: 0.26, duration: 0.11 });
      noise(c, at + 0.02, { peak: 0.1, duration: 0.08, filter: 3000, type: 'highpass' });
      tone(c, at + 0.2, { freq: 1900, slideTo: 460, type: 'triangle', peak: 0.26, duration: 0.13 });
      noise(c, at + 0.2, { peak: 0.1, duration: 0.08, filter: 3000, type: 'highpass' });
    },

    // A piece coming back: rising sparkle, no knock.
    abilityRevive: (c, at) => {
      [523.25, 783.99, 1046.5].forEach((freq, i) => {
        tone(c, at + i * 0.07, { freq, type: 'triangle', peak: 0.26, duration: 0.3, attack: 0.01 });
      });
      noise(c, at + 0.12, { peak: 0.08, duration: 0.3, filter: 4000, type: 'highpass' });
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
