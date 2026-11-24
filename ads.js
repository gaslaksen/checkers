// Ads, for the app. The website has none: with no ad network plugged in,
// every call here does nothing and reports nothing available, so the game
// can ask at the right moments without caring where it's running.
//
// In the app, an ad network (AdMob, later) is handed over with Ads.use(),
// and this module decides when it may show anything:
// - Between games only, when the player leaves the result screen. Never in
//   their first few games, at most one every few games, and never again once
//   they've bought Remove Ads.
// - Rewarded ads only when the player asks for one, in exchange for a small
//   favour like a reroll. Those stay available after Remove Ads, since
//   they're always the player's choice.

const Ads = (() => {
  const FREE_GAMES = 3; // no between-games ad until a player has finished more than this
  const GAMES_BETWEEN = 3; // finished games from one between-games ad to the next

  // What an ad network provides: whether an ad of a kind is loaded and
  // ready, and a way to show one that resolves to true once it's been seen
  // through (for a rewarded ad, watched to the end).
  //   { ready(kind) -> boolean, show(kind, reason) -> Promise<boolean>,
  //     warmUp() -> Promise }
  // warmUp is optional: it's called between games once the free games are
  // used up, so any questions the network must ask first (like Apple's
  // "Allow tracking?") come then, and not the moment the app opens.
  let network = null;
  let showing = false; // one at a time, however fast the taps come

  function use(adNetwork) {
    network = adNetwork;
  }

  // 'interstitial' (between games) or 'rewarded'.
  function available(kind) {
    if (!network || showing) return false;
    if (kind === 'interstitial' && Store.get('removeAds')) return false;
    if (kind !== 'interstitial' && kind !== 'rewarded') return false;
    try {
      return !!network.ready(kind);
    } catch (e) {
      return false;
    }
  }

  // Due going by games played, whether or not an ad is ready to show.
  function betweenGamesDue() {
    const played = Store.get('gamesPlayed');
    return played > FREE_GAMES && played - Store.get('lastAdAt') >= GAMES_BETWEEN;
  }

  async function show(kind, reason) {
    showing = true;
    try {
      return (await network.show(kind, reason)) === true;
    } catch (e) {
      return false; // an ad failing is never the player's problem
    } finally {
      showing = false;
    }
  }

  // Call only between games. Resolves once any ad is gone, straight away
  // if there wasn't one.
  async function betweenGames() {
    if (network?.warmUp && Store.get('gamesPlayed') >= FREE_GAMES) {
      try {
        await network.warmUp();
      } catch (e) {
        // No ads this time, then.
      }
    }
    if (!betweenGamesDue() || !available('interstitial')) return false;
    // Counted even if the ad fails, so a bad connection can't make it pester.
    Store.set('lastAdAt', Store.get('gamesPlayed'));
    return show('interstitial');
  }

  // Offers a rewarded ad. True only if the player earned the reward.
  async function rewarded(reason) {
    if (!available('rewarded')) return false;
    return show('rewarded', reason);
  }

  return { use, available, betweenGames, rewarded, FREE_GAMES, GAMES_BETWEEN };
})();

if (typeof module !== 'undefined') module.exports = { Ads };
