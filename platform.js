// Where the game is running: a web page, or the iPhone app. The app is the
// same files bundled inside a native shell (Capacitor), which puts
// `window.Capacitor` on the page before any of our scripts run.

const IS_APP = typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

// The app's native plugins, when they're installed. On the web there are
// none, so everything that uses them quietly does nothing.
const nativePlugin = (name) => (IS_APP && window.Capacitor.Plugins?.[name]) || null;

if (typeof module !== 'undefined') module.exports = { IS_APP, nativePlugin };
