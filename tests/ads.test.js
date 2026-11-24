// When ads may show. On the web there's no ad network, so never; with one,
// the pacing rules decide.

const assert = require('assert');
const path = require('path');

const { Store } = require(path.join(__dirname, '..', 'store.js'));
globalThis.Store = Store; // as the browser has it
const { Ads } = require(path.join(__dirname, '..', 'ads.js'));

// A pretend ad network that counts what it was asked to show.
function fakeNetwork({ ready = true, result = true } = {}) {
  const shown = [];
  return {
    shown,
    ready: () => ready,
    show: async (kind, reason) => {
      shown.push(reason ? `${kind}:${reason}` : kind);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

// Plays `n` games, leaving the result screen after each; returns which
// games (1-based) were followed by an ad.
async function playGames(n) {
  const after = [];
  for (let i = 1; i <= n; i++) {
    Store.countGame();
    if (await Ads.betweenGames()) after.push(i);
  }
  return after;
}

function fresh(network = null) {
  Store.clear();
  Ads.use(network);
}

module.exports = {
  async 'on the web nothing is available and nothing shows'() {
    fresh();
    assert.strictEqual(Ads.available('interstitial'), false);
    assert.strictEqual(Ads.available('rewarded'), false);
    assert.deepStrictEqual(await playGames(12), []);
    assert.strictEqual(await Ads.rewarded('reroll'), false);
  },

  async 'between-games ads skip the first few games, then come every few'() {
    const network = fakeNetwork();
    fresh(network);
    const after = await playGames(12);
    assert(after[0] > Ads.FREE_GAMES, `first ad after game ${after[0]}`);
    for (let i = 1; i < after.length; i++) {
      assert(after[i] - after[i - 1] >= 2, `ads after games ${after}`);
      assert(after[i] - after[i - 1] <= 3, `ads after games ${after}`);
    }
    assert.deepStrictEqual(network.shown, after.map(() => 'interstitial'));
  },

  async 'the pacing carries over between visits'() {
    fresh(fakeNetwork());
    const before = await playGames(Ads.FREE_GAMES + 1);
    assert.strictEqual(before.length, 1);
    // A new visit: same saved numbers, so no ad straight away.
    assert.deepStrictEqual(await playGames(1), []);
  },

  async 'a failed ad still counts, so it does not ask again next game'() {
    const network = fakeNetwork({ result: new Error('no fill') });
    fresh(network);
    await playGames(Ads.FREE_GAMES + 2);
    assert.strictEqual(network.shown.length, 1);
  },

  async 'Remove Ads stops between-games ads but not the ones you ask for'() {
    const network = fakeNetwork();
    fresh(network);
    Store.set('removeAds', true);
    assert.deepStrictEqual(await playGames(12), []);
    assert.strictEqual(Ads.available('rewarded'), true);
    assert.strictEqual(await Ads.rewarded('reroll'), true);
    assert.deepStrictEqual(network.shown, ['rewarded:reroll']);
  },

  async 'a rewarded ad pays out only when it was seen through'() {
    fresh(fakeNetwork({ result: false }));
    assert.strictEqual(await Ads.rewarded('reroll'), false, 'closed early');
    fresh(fakeNetwork({ result: new Error('network') }));
    assert.strictEqual(await Ads.rewarded('reroll'), false, 'failed');
    fresh(fakeNetwork({ result: true }));
    assert.strictEqual(await Ads.rewarded('reroll'), true);
  },

  async 'nothing is available while an ad is loading or already showing'() {
    fresh(fakeNetwork({ ready: false }));
    assert.strictEqual(Ads.available('rewarded'), false);
    assert.strictEqual(await Ads.rewarded('reroll'), false);

    let finish;
    const network = { ready: () => true, show: () => new Promise((resolve) => { finish = resolve; }) };
    fresh(network);
    const first = Ads.rewarded('reroll');
    assert.strictEqual(Ads.available('rewarded'), false, 'one at a time');
    assert.strictEqual(await Ads.rewarded('reroll'), false);
    finish(true);
    assert.strictEqual(await first, true);
    assert.strictEqual(Ads.available('rewarded'), true);
    fresh();
  },

  async 'the network warms up between games once the free games are over'() {
    const network = fakeNetwork();
    let warmUps = 0;
    network.warmUp = async () => { warmUps++; };
    fresh(network);
    await playGames(Ads.FREE_GAMES - 1);
    assert.strictEqual(warmUps, 0, 'nothing asked during the free games');
    await playGames(1);
    assert.strictEqual(warmUps, 1);
    network.warmUp = async () => { throw new Error('offline'); };
    await playGames(1); // a failed warm-up doesn't stop the game
    fresh();
  },

  'only the kinds it knows about'() {
    fresh(fakeNetwork());
    assert.strictEqual(Ads.available('banner'), false);
    fresh();
  },
};
