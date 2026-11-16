// Where the game is running: a web page, or the iPhone app. The app is the
// same files bundled inside a native shell (Capacitor), which puts
// `window.Capacitor` on the page before any of our scripts run.

const IS_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

// The app's native plugins, when they're installed. On the web there are
// none, so everything that uses them quietly does nothing.
const nativePlugin = (name) => (IS_APP && window.Capacitor.Plugins?.[name]) || null;

// A tap you can feel, in the app: a light one for a move, a firmer one for
// a capture, and a little flourish for a new king. Named after the sound
// that goes with it, so the game can ask for both at once.
const Haptics = (() => {
  const FEELS = {
    move: (h) => h.impact({ style: 'LIGHT' }),
    capture: (h) => h.impact({ style: 'MEDIUM' }),
    crown: (h) => h.notification({ type: 'SUCCESS' }),
  };

  function feel(name) {
    const haptics = nativePlugin('Haptics');
    if (!haptics || !FEELS[name]) return;
    // A buzz that fails is never worth interrupting the game for.
    Promise.resolve().then(() => FEELS[name](haptics)).catch(() => {});
  }

  return { feel };
})();

if (typeof module !== 'undefined') module.exports = { IS_APP, nativePlugin, Haptics };
