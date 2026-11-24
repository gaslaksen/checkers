// Remove Ads: offered only when the App Store has it, remembered once bought,
// and found again by Restore or when the app opens.

const assert = require('assert');
const path = require('path');

const { Store } = require(path.join(__dirname, '..', 'store.js'));
globalThis.Store = Store;
const { createShop, REMOVE_ADS } = require(path.join(__dirname, '..', 'shop.js'));

// A pretend Purchases plugin. `owned` is what the phone already has,
// `restored` what the App Store finds, and `buyResult` how the sheet ends.
function fakePlugin({ price = '$2.99', owned = [], restored = [], buyResult = 'purchased', fail = {} } = {}) {
  const listeners = {};
  const answer = (name, value) => async () => {
    if (fail[name]) throw new Error(`${name} failed`);
    return value;
  };
  return {
    listeners,
    addListener: (event, fn) => { listeners[event] = fn; },
    product: answer('product', price ? { id: REMOVE_ADS, price } : {}),
    owned: answer('owned', { ids: owned }),
    restore: answer('restore', { ids: restored }),
    buy: answer('buy', { result: buyResult }),
  };
}

async function openShop(options) {
  Store.clear();
  const plugin = fakePlugin(options);
  const shop = createShop(plugin);
  await shop.start();
  return { shop, plugin };
}

module.exports = {
  async 'the website has nothing to sell'() {
    Store.clear();
    const shop = createShop(null);
    await shop.start();
    assert.strictEqual(shop.canBuy(), false);
    assert.strictEqual(shop.canRestore(), false);
  },

  async 'offered at the App Store price, and gone once bought'() {
    const { shop } = await openShop();
    assert.strictEqual(shop.canBuy(), true);
    assert.strictEqual(shop.price(), '$2.99');
    assert.strictEqual(await shop.buy(), 'purchased');
    assert.strictEqual(Store.get('removeAds'), true);
    assert.strictEqual(shop.canBuy(), false);
    assert.strictEqual(shop.canRestore(), true);
  },

  async 'cancelling, waiting or failing changes nothing'() {
    for (const options of [{ buyResult: 'cancelled' }, { buyResult: 'pending' }, { fail: { buy: true } }]) {
      const { shop } = await openShop(options);
      const result = await shop.buy();
      assert.strictEqual(result, options.buyResult || 'failed');
      assert.strictEqual(Store.get('removeAds'), false, result);
    }
  },

  async 'not offered when the App Store cannot find it'() {
    for (const options of [{ price: null }, { fail: { product: true } }]) {
      const { shop } = await openShop(options);
      assert.strictEqual(shop.canBuy(), false);
      assert.strictEqual(shop.canRestore(), false);
    }
  },

  async 'already bought on this phone, it is noticed when the app opens'() {
    const { shop } = await openShop({ owned: [REMOVE_ADS] });
    assert.strictEqual(Store.get('removeAds'), true);
    assert.strictEqual(shop.canBuy(), false);
  },

  async 'a purchase approved later still counts'() {
    const { shop, plugin } = await openShop({ buyResult: 'pending' });
    let told = 0;
    shop.onChange(() => told++);
    await shop.buy();
    plugin.listeners.owned({ id: REMOVE_ADS });
    assert.strictEqual(Store.get('removeAds'), true);
    assert.strictEqual(told, 1, 'Settings redraws');
  },

  async 'restore finds it, or says there was nothing'() {
    let { shop } = await openShop({ restored: [REMOVE_ADS] });
    assert.strictEqual(await shop.restore(), 'restored');
    assert.strictEqual(Store.get('removeAds'), true);

    ({ shop } = await openShop({ restored: [] }));
    assert.strictEqual(await shop.restore(), 'nothing');
    assert.strictEqual(Store.get('removeAds'), false);

    ({ shop } = await openShop({ fail: { restore: true } }));
    assert.strictEqual(await shop.restore(), 'failed');
    Store.clear();
  },
};
