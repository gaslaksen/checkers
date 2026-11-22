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

// The player's Game Center account, in the app: their name and picture, for
// the versus screen. Signing in starts as soon as the app opens, the way
// Game Center expects, so it's usually done before anyone needs it. The
// website has no Game Center, so there nobody is signed in. The native side
// is ios/App/App/GameCenterPlugin.swift.
const GameCenter = (() => {
  let you = null; // { name, photo } once signed in

  const plugin = nativePlugin('GameCenter');
  if (plugin) {
    plugin.signIn()
      .then((info) => {
        if (info && info.signedIn && info.name) you = { name: info.name, photo: info.photo || null };
      })
      .catch(() => {}); // not signed in: play on without a name
  }

  return { player: () => you };
})();

// A player as sent by someone else's device: only a name, and a picture only
// if it's an image we made (see GameCenterPlugin.swift). Anything else, and
// they're shown without one.
function trustedPlayer(player) {
  if (!player || typeof player.name !== 'string' || !player.name.trim()) return null;
  const photo = typeof player.photo === 'string' && player.photo.length < 100000
    && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(player.photo) ? player.photo : null;
  return { name: player.name.trim().slice(0, 30), photo };
}
