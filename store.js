// What the game remembers between visits: your settings, how many games
// you've played, and a few numbers kept for later (pacing ads, a purchase,
// your record against the bot).
//
// Reads are instant, from memory. Every write goes to memory and, when the
// browser allows it, to localStorage — private browsing and blocked storage
// throw, and then the game simply forgets when you leave. In the app, iOS can
// clear a web view's localStorage when the phone runs low on space, so writes
// are copied to the native Preferences plugin too, and load() reads them back.

const Store = (() => {
  const PREFIX = 'superCheckers.';
  const DEFAULTS = {
    sound: true, // the one setting so far
    gamesPlayed: 0, // finished games, any mode; ads pace themselves by it
    lastAdAt: 0, // gamesPlayed when the last between-games ad was shown
    removeAds: false, // bought once: no more between-games ads
    stats: {}, // bot level -> { wins, losses, draws }
  };

  const memory = {};
  const written = new Set(); // keys changed since starting, so load() won't undo them

  // A fresh copy, so changing what you were given can't change what's saved.
  const copy = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);

  // Only a real browser's storage. (Node has a localStorage of its own that
  // doesn't work without extra setup, and the tests don't need one.)
  function webStorage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (e) {
      return null; // some browsers throw just for asking when storage is blocked
    }
  }

  // Both are found once, when the page opens.
  const storage = webStorage();
  const native = typeof nativePlugin === 'function' ? nativePlugin('Preferences') : null;

  // Saved values are JSON; anything that doesn't parse is treated as unset.
  function parse(text) {
    if (text == null) return undefined;
    try {
      return JSON.parse(text);
    } catch (e) {
      return undefined;
    }
  }

  // Whatever this browser kept from last time, read once at startup.
  function readWebStorage() {
    if (!storage) return;
    for (const key of Object.keys(DEFAULTS)) {
      try {
        const value = parse(storage.getItem(PREFIX + key));
        if (value !== undefined) memory[key] = value;
      } catch (e) {
        return;
      }
    }
  }

  function get(key) {
    return copy(key in memory ? memory[key] : DEFAULTS[key]);
  }

  function set(key, value) {
    memory[key] = copy(value);
    written.add(key);
    const text = JSON.stringify(value);
    try {
      storage?.setItem(PREFIX + key, text);
    } catch (e) {
      // Full or blocked: it's still remembered until the page closes.
    }
    native?.set({ key: PREFIX + key, value: text }).catch(() => {});
  }

  const update = (key, change) => set(key, change(get(key)));

  // In the app, the Preferences copy is the one to trust. It loads in the
  // background; anything changed before it arrives keeps the newer value.
  async function load() {
    if (!native) return;
    await Promise.all(Object.keys(DEFAULTS).map(async (key) => {
      try {
        const value = parse((await native.get({ key: PREFIX + key })).value);
        if (value !== undefined && !written.has(key)) memory[key] = value;
      } catch (e) {
        // Leave whatever we had.
      }
    }));
  }

  // Forget everything — for the tests, and a "reset" button one day.
  function clear() {
    for (const key of Object.keys(DEFAULTS)) {
      delete memory[key];
      try {
        storage?.removeItem(PREFIX + key);
      } catch (e) {
        // Nothing saved to remove.
      }
      native?.remove({ key: PREFIX + key }).catch(() => {});
    }
    written.clear();
  }

  // ---------- The things the game records ----------

  const countGame = () => update('gamesPlayed', (n) => n + 1);

  // `outcome` is 'win', 'loss' or 'draw', from the player's side.
  function recordBotGame(level, outcome) {
    const field = { win: 'wins', loss: 'losses', draw: 'draws' }[outcome];
    if (!field) return;
    update('stats', (stats) => {
      const record = stats[level] || { wins: 0, losses: 0, draws: 0 };
      record[field]++;
      return { ...stats, [level]: record };
    });
  }

  readWebStorage();
  const ready = load();

  return { get, set, update, clear, ready, countGame, recordBotGame, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = { Store };
