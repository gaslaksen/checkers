// Google AdMob, the ad network the app uses. This file only fetches and shows
// ads; when they may show is up to Ads (ads.js). The website has no AdMob,
// so there this does nothing and Ads never has an ad to show.
//
// Before the first ad, two questions may come up, once each:
// - Google's consent form, only where the law requires one (like the EU and
//   the UK). Anyone it applies to can change their answer from Settings.
// - Apple's "Allow tracking?", unless the player bought Remove Ads.
// They wait until the free games are over, so a new player isn't asked
// anything about ads before they've seen any. Ads aren't requested until
// both have been answered.

// Ad unit IDs from the AdMob console (Apps → Chaos Checkers → Ad units).
// Until they're filled in, a release build shows no ads at all. Development
// builds always use Google's test ads, which are safe to tap: tapping your
// own real ads can get an AdMob account closed.
const ADMOB_UNITS = {
  interstitial: '',
  rewarded: '',
};
const ADMOB_TEST_UNITS = {
  interstitial: 'ca-app-pub-3940256099942544/4411468910',
  rewarded: 'ca-app-pub-3940256099942544/1712485313',
};

// An ad network for Ads.use(), made from the AdMob plugin.
//   plugin: window.Capacitor.Plugins.AdMob, or a stand-in for the tests
//   testing: use Google's test ads
//   askTracking(): whether to ask Apple's tracking question
//   wait(ms): a timer, which the tests replace
function createAdMob(plugin, {
  testing = false,
  askTracking = () => true,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const units = testing ? ADMOB_TEST_UNITS : ADMOB_UNITS;
  const loaded = { interstitial: false, rewarded: false };
  const loading = { interstitial: false, rewarded: false };
  const failures = { interstitial: 0, rewarded: 0 };
  let started = null; // the warm-up, once it's begun
  let canRequest = false;
  let privacyChoices = false; // Settings needs to offer the consent form again
  let muted = false;

  // A listener that can be taken off again, whichever way the bridge hands
  // it back (straight away or as a promise).
  function listen(event, handler) {
    const handle = Promise.resolve(plugin.addListener(event, handler));
    return () => handle.then((h) => h?.remove?.()).catch(() => {});
  }

  function warmUp() {
    if (!started) {
      started = begin().catch(() => {
        started = null; // try again next time
      });
    }
    return started;
  }

  async function begin() {
    let consent = await plugin.requestConsentInfo();
    if (consent.status === 'REQUIRED' && consent.isConsentFormAvailable) {
      consent = await plugin.showConsentForm();
    }
    privacyChoices = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    canRequest = !!consent.canRequestAds;
    if (!canRequest) return;

    if (askTracking()) {
      const { status } = await plugin.trackingAuthorizationStatus();
      if (status === 'notDetermined') await plugin.requestTrackingAuthorization();
    }

    await plugin.initialize({
      initializeForTesting: testing,
      maxAdContentRating: 'General', // the app is rated for everyone
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    plugin.setApplicationMuted?.({ muted })?.catch?.(() => {});
    load('interstitial');
    load('rewarded');
  }

  // Fetches the next ad of a kind in the background. If there's none to be
  // had (no connection, nothing to show), it tries again later, waiting
  // longer each time, up to ten minutes.
  async function load(kind) {
    if (!canRequest || !units[kind] || loaded[kind] || loading[kind]) return;
    loading[kind] = true;
    try {
      const options = { adId: units[kind], isTesting: testing };
      if (kind === 'interstitial') await plugin.prepareInterstitial(options);
      else await plugin.prepareRewardVideoAd(options);
      loaded[kind] = true;
      failures[kind] = 0;
    } catch (e) {
      failures[kind]++;
      loading[kind] = false;
      await wait(Math.min(30000 * 2 ** (failures[kind] - 1), 600000));
      return load(kind);
    }
    loading[kind] = false;
  }

  const ready = (kind) => loaded[kind];

  // Resolves once the ad is closed: true if it was seen (for a rewarded ad,
  // if the reward was earned). The game waits for this, so it never carries
  // on underneath an ad.
  function show(kind) {
    if (!loaded[kind]) return Promise.resolve(false);
    loaded[kind] = false; // each ad shows once; the next one loads after
    const events = kind === 'interstitial'
      ? { dismissed: 'interstitialAdDismissed', failed: 'interstitialAdFailedToShow' }
      : { dismissed: 'onRewardedVideoAdDismissed', failed: 'onRewardedVideoAdFailedToShow', reward: 'onRewardedVideoAdReward' };

    return new Promise((resolve) => {
      let earned = false;
      let done = false;
      const stops = [];
      const finish = (result) => {
        if (done) return;
        done = true;
        stops.forEach((stop) => stop());
        resolve(result);
        load(kind);
      };
      stops.push(listen(events.dismissed, () => finish(kind === 'interstitial' || earned)));
      stops.push(listen(events.failed, () => finish(false)));
      if (events.reward) stops.push(listen(events.reward, () => { earned = true; }));

      if (kind === 'interstitial') {
        plugin.showInterstitial().catch(() => finish(false));
      } else {
        // This resolves the moment the reward's earned, which can be before
        // the ad is closed, and fails if it's closed early.
        plugin.showRewardVideoAd().then(() => { earned = true; }, () => finish(false));
      }
    });
  }

  // Ads stay quiet when the game's sound is off.
  function setMuted(on) {
    muted = on;
    if (started) plugin.setApplicationMuted?.({ muted })?.catch?.(() => {});
  }

  const needsPrivacyChoices = () => privacyChoices;

  async function showPrivacyChoices() {
    try {
      await plugin.showPrivacyOptionsForm();
    } catch (e) {
      // The form couldn't open (offline, say). Nothing changed.
    }
  }

  return { ready, show, warmUp, setMuted, needsPrivacyChoices, showPrivacyChoices };
}

// In the app, AdMob is handed to Ads. Someone who's already past the free
// games gets ads warmed up straight away; for everyone else Ads warms them
// up when the time comes.
const AdMob = (() => {
  const plugin = typeof nativePlugin === 'function' ? nativePlugin('AdMob') : null;
  if (!plugin) return null;
  const network = createAdMob(plugin, {
    testing: !!window.Capacitor.DEBUG, // a build from Xcode, not the App Store
    askTracking: () => !Store.get('removeAds'),
  });
  Ads.use(network);
  Store.ready.then(() => {
    network.setMuted(!Store.get('sound'));
    if (Store.get('gamesPlayed') >= Ads.FREE_GAMES) network.warmUp();
  });
  return network;
})();

if (typeof module !== 'undefined') module.exports = { createAdMob, ADMOB_UNITS, ADMOB_TEST_UNITS };
