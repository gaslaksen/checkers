// Things to buy, in the app. So far there's one: Remove Ads, bought once,
// which stops the between-games ads for good (the ones you ask for, like a
// reroll, stay available). The website sells nothing: there's no
// Purchases plugin there, so nothing is ever offered.
//
// Apple handles the paying. The native side is
// ios/App/App/PurchasesPlugin.swift; the product is set up in App Store
// Connect under the same ID as REMOVE_ADS below.

const REMOVE_ADS = 'com.supercheckers.game.removeads';

// plugin: window.Capacitor.Plugins.Purchases, or a stand-in for the tests.
function createShop(plugin) {
  let price = null; // like "$2.99", once the App Store has said
  const watchers = [];

  const changed = () => watchers.forEach((fn) => fn());

  // Anything Apple says the player owns is theirs, however it arrived.
  function own(ids) {
    if (!ids?.includes(REMOVE_ADS) || Store.get('removeAds')) return;
    Store.set('removeAds', true);
    changed();
  }

  async function start() {
    if (!plugin) return;
    try {
      plugin.addListener('owned', ({ id }) => own([id]));
    } catch (e) {
      // Then purchases finishing later show up on the next start instead.
    }
    try {
      own((await plugin.owned()).ids);
    } catch (e) {
      // Remembered from last time, if it was bought.
    }
    try {
      price = (await plugin.product({ id: REMOVE_ADS })).price || null;
    } catch (e) {
      price = null; // offline, or not set up yet: nothing to offer this time
    }
    changed();
  }

  // Whether Remove Ads can be bought right now (found in the App Store, and
  // not already bought).
  const canBuy = () => !!price && !Store.get('removeAds');
  const canRestore = () => !!price;

  // Resolves to 'purchased', 'pending' (waiting for a parent to approve),
  // 'cancelled', or 'failed'.
  async function buy() {
    try {
      const { result } = await plugin.buy({ id: REMOVE_ADS });
      if (result === 'purchased') own([REMOVE_ADS]);
      return result;
    } catch (e) {
      return 'failed';
    }
  }

  // Resolves to 'restored', 'nothing' (this Apple ID never bought it), or
  // 'failed'.
  async function restore() {
    try {
      const { ids } = await plugin.restore();
      own(ids);
      return ids.includes(REMOVE_ADS) ? 'restored' : 'nothing';
    } catch (e) {
      return 'failed';
    }
  }

  return {
    start,
    canBuy,
    canRestore,
    buy,
    restore,
    price: () => price,
    onChange: (fn) => watchers.push(fn),
  };
}

const Shop = createShop(typeof nativePlugin === 'function' ? nativePlugin('Purchases') : null);
Shop.start();

if (typeof module !== 'undefined') module.exports = { createShop, REMOVE_ADS };
