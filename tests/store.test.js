// Remembering things between visits: localStorage when it works, memory when
// it doesn't, and the app's Preferences plugin when there is one.

const assert = require('assert');
const path = require('path');

const STORE = path.join(__dirname, '..', 'store.js');

// A Store loaded fresh, as if the page had just opened with these globals.
function freshStore({ window, nativePlugin } = {}) {
  const saved = { window: globalThis.window, nativePlugin: globalThis.nativePlugin };
  globalThis.window = window;
  globalThis.nativePlugin = nativePlugin;
  delete require.cache[require.resolve(STORE)];
  try {
    return require(STORE).Store;
  } finally {
    globalThis.window = saved.window;
    globalThis.nativePlugin = saved.nativePlugin;
  }
}

function fakeLocalStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

// Something shaped like Capacitor's Preferences plugin.
function fakePreferences(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: async ({ key }) => ({ value: key in data ? data[key] : null }),
    set: async ({ key, value }) => { data[key] = value; },
    remove: async ({ key }) => { delete data[key]; },
  };
}

module.exports = {
  'with no storage at all it still remembers, in memory'() {
    const Store = freshStore();
    assert.strictEqual(Store.get('sound'), true, 'the default');
    Store.set('sound', false);
    assert.strictEqual(Store.get('sound'), false);
  },

  'storage that throws is the same as none'() {
    const broken = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('quota'); },
      removeItem() { throw new Error('blocked'); },
    };
    const Store = freshStore({ window: { localStorage: broken } });
    Store.set('gamesPlayed', 3);
    assert.strictEqual(Store.get('gamesPlayed'), 3);
    Store.clear();
    assert.strictEqual(Store.get('gamesPlayed'), 0);
  },

  'a browser that blocks even asking for storage still works'() {
    const window = {};
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
    const Store = freshStore({ window });
    Store.set('removeAds', true);
    assert.strictEqual(Store.get('removeAds'), true);
  },

  'what was saved last time is there next time'() {
    const storage = fakeLocalStorage();
    freshStore({ window: { localStorage: storage } }).set('sound', false);
    const later = freshStore({ window: { localStorage: storage } });
    assert.strictEqual(later.get('sound'), false);
  },

  'a saved value that is not valid JSON counts as unset'() {
    const storage = fakeLocalStorage({ 'superCheckers.gamesPlayed': '{oops' });
    assert.strictEqual(freshStore({ window: { localStorage: storage } }).get('gamesPlayed'), 0);
  },

  'changing what get() returned does not change what is saved'() {
    const Store = freshStore();
    Store.recordBotGame('hard', 'win');
    const stats = Store.get('stats');
    stats.hard.wins = 99;
    assert.strictEqual(Store.get('stats').hard.wins, 1);
  },

  'games and results are counted'() {
    const Store = freshStore();
    Store.countGame();
    Store.countGame();
    Store.recordBotGame('easy', 'win');
    Store.recordBotGame('easy', 'loss');
    Store.recordBotGame('easy', 'win');
    Store.recordBotGame('hard', 'draw');
    Store.recordBotGame('hard', 'nonsense');
    assert.strictEqual(Store.get('gamesPlayed'), 2);
    assert.deepStrictEqual(Store.get('stats'), {
      easy: { wins: 2, losses: 1, draws: 0 },
      hard: { wins: 0, losses: 0, draws: 1 },
    });
  },

  async 'in the app, Preferences is written to and read back'() {
    const prefs = fakePreferences({ 'superCheckers.sound': 'false', 'superCheckers.gamesPlayed': '7' });
    const Store = freshStore({ nativePlugin: (name) => (name === 'Preferences' ? prefs : null) });
    Store.set('gamesPlayed', 8); // changed before loading finished: keeps the newer value
    await Store.ready;
    assert.strictEqual(Store.get('sound'), false);
    assert.strictEqual(Store.get('gamesPlayed'), 8);
    assert.strictEqual(prefs.data['superCheckers.gamesPlayed'], '8');
  },
};
