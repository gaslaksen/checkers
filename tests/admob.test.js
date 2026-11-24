// The AdMob connection: questions asked in the right order, ads fetched in
// the background and retried, and the game kept waiting until an ad closes.

const assert = require('assert');
const path = require('path');

const { Store } = require(path.join(__dirname, '..', 'store.js'));
globalThis.Store = Store;
const { createAdMob, ADMOB_TEST_UNITS } = require(path.join(__dirname, '..', 'admob.js'));

const tick = () => new Promise((resolve) => setImmediate(resolve));

// A pretend AdMob plugin. It records every call, and the test decides how
// each one goes: `consent`, `tracking` and `fail` set the answers, and
// `fire(event)` plays a native event as if the ad had done something.
function fakePlugin({ consent = {}, tracking = 'notDetermined', fail = {} } = {}) {
  const calls = [];
  const listeners = {};
  const plugin = {
    calls,
    listeners,
    fire(event, data) {
      (listeners[event] || []).slice().forEach((fn) => fn(data));
    },
    addListener(event, fn) {
      (listeners[event] ||= []).push(fn);
      return { remove: () => { listeners[event] = listeners[event].filter((f) => f !== fn); } };
    },
  };
  const method = (name, answer) => {
    plugin[name] = async (options) => {
      calls.push(name);
      if (fail[name]) {
        fail[name]--;
        throw new Error(`${name} failed`);
      }
      return typeof answer === 'function' ? answer(options) : answer;
    };
  };
  method('requestConsentInfo', { status: 'NOT_REQUIRED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED', ...consent });
  method('showConsentForm', { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' });
  method('trackingAuthorizationStatus', { status: tracking });
  method('requestTrackingAuthorization', undefined);
  method('initialize', undefined);
  method('setApplicationMuted', undefined);
  method('prepareInterstitial', (o) => ({ adUnitId: o.adId }));
  method('prepareRewardVideoAd', (o) => ({ adUnitId: o.adId }));
  method('showInterstitial', undefined);
  method('showRewardVideoAd', { type: 'reroll', amount: 1 });
  method('showPrivacyOptionsForm', undefined);
  return plugin;
}

// Waits recorded instead of slept through.
function fakeTimer() {
  const waits = [];
  return { waits, wait: async (ms) => { waits.push(ms); } };
}

async function warmedUp(plugin, options = {}) {
  const timer = fakeTimer();
  const admob = createAdMob(plugin, { testing: true, wait: timer.wait, ...options });
  await admob.warmUp();
  await tick();
  return { admob, timer };
}

module.exports = {
  async 'consent first, then the tracking question, then ads'() {
    const plugin = fakePlugin({ consent: { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false } });
    const { admob } = await warmedUp(plugin);
    assert.deepStrictEqual(plugin.calls.slice(0, 6), [
      'requestConsentInfo', 'showConsentForm', 'trackingAuthorizationStatus',
      'requestTrackingAuthorization', 'initialize', 'setApplicationMuted',
    ]);
    assert(plugin.calls.includes('prepareInterstitial') && plugin.calls.includes('prepareRewardVideoAd'));
    assert(admob.ready('interstitial') && admob.ready('rewarded'));
    assert.strictEqual(admob.needsPrivacyChoices(), true, 'Settings offers the form again');
  },

  async 'no consent, no ads, and no tracking question'() {
    const plugin = fakePlugin({ consent: { status: 'REQUIRED', isConsentFormAvailable: false, canRequestAds: false } });
    const { admob } = await warmedUp(plugin);
    assert.deepStrictEqual(plugin.calls, ['requestConsentInfo']);
    assert.strictEqual(admob.ready('interstitial'), false);
  },

  async 'the tracking question is asked once, and never after Remove Ads'() {
    let plugin = fakePlugin({ tracking: 'denied' });
    await warmedUp(plugin);
    assert(!plugin.calls.includes('requestTrackingAuthorization'), 'already answered');

    plugin = fakePlugin();
    await warmedUp(plugin, { askTracking: () => false });
    assert(!plugin.calls.includes('trackingAuthorizationStatus'));
    assert(plugin.calls.includes('initialize'), 'rewarded ads still come');
  },

  async 'warming up happens once, and again only if it failed'() {
    const plugin = fakePlugin({ fail: { requestConsentInfo: 1 } });
    const timer = fakeTimer();
    const admob = createAdMob(plugin, { testing: true, wait: timer.wait });
    await admob.warmUp();
    assert.strictEqual(admob.ready('interstitial'), false);
    await admob.warmUp();
    await admob.warmUp();
    await tick();
    assert.strictEqual(plugin.calls.filter((c) => c === 'requestConsentInfo').length, 2);
    assert.strictEqual(plugin.calls.filter((c) => c === 'initialize').length, 1);
  },

  async 'development builds use test ads; release builds without real units use none'() {
    let seen = [];
    let plugin = fakePlugin();
    plugin.prepareInterstitial = async (o) => { seen.push(o); };
    await warmedUp(plugin);
    assert.strictEqual(seen[0].adId, ADMOB_TEST_UNITS.interstitial);
    assert.strictEqual(seen[0].isTesting, true);

    seen = [];
    plugin = fakePlugin();
    plugin.prepareInterstitial = async (o) => { seen.push(o); };
    const { admob } = await warmedUp(plugin, { testing: false });
    assert.deepStrictEqual(seen, [], 'the real unit IDs are still blank');
    assert.strictEqual(admob.ready('interstitial'), false);
  },

  async 'an ad that will not load is tried again, waiting longer each time'() {
    const plugin = fakePlugin({ fail: { prepareInterstitial: 3 } });
    const { admob, timer } = await warmedUp(plugin);
    await tick();
    assert.deepStrictEqual(timer.waits, [30000, 60000, 120000]);
    assert.strictEqual(admob.ready('interstitial'), true);
  },

  async 'the game waits until the between-games ad is closed'() {
    const plugin = fakePlugin();
    const { admob } = await warmedUp(plugin);
    let closed = null;
    admob.show('interstitial').then((seen) => { closed = seen; });
    await tick();
    assert.strictEqual(closed, null, 'still showing');
    assert.strictEqual(admob.ready('interstitial'), false, 'each ad shows once');
    plugin.fire('interstitialAdDismissed');
    await tick();
    assert.strictEqual(closed, true);
    assert.strictEqual(admob.ready('interstitial'), true, 'the next one is fetched');
    assert.deepStrictEqual(plugin.listeners.interstitialAdDismissed, [], 'listeners tidied up');
  },

  async 'an ad that fails to show lets the game carry on'() {
    const plugin = fakePlugin({ fail: { showInterstitial: 1 } });
    const { admob } = await warmedUp(plugin);
    assert.strictEqual(await admob.show('interstitial'), false);
  },

  async 'a rewarded ad pays out only if watched, and only once closed'() {
    let plugin = fakePlugin();
    let { admob } = await warmedUp(plugin);
    let result = null;
    admob.show('rewarded').then((earned) => { result = earned; });
    await tick();
    assert.strictEqual(result, null, 'reward earned, but the ad is still open');
    plugin.fire('onRewardedVideoAdDismissed');
    await tick();
    assert.strictEqual(result, true);

    plugin = fakePlugin({ fail: { showRewardVideoAd: 1 } }); // closed before the end
    ({ admob } = await warmedUp(plugin));
    assert.strictEqual(await admob.show('rewarded'), false);
  },

  async 'nothing to show before warming up'() {
    const admob = createAdMob(fakePlugin(), { testing: true, wait: fakeTimer().wait });
    assert.strictEqual(admob.ready('rewarded'), false);
    assert.strictEqual(await admob.show('rewarded'), false);
  },

  async 'ads follow the game sound setting'() {
    const plugin = fakePlugin();
    const mutes = [];
    plugin.setApplicationMuted = async (o) => { mutes.push(o.muted); };
    const admob = createAdMob(plugin, { testing: true, wait: fakeTimer().wait });
    admob.setMuted(true); // before warming up: remembered for later
    await admob.warmUp();
    admob.setMuted(false);
    assert.deepStrictEqual(mutes, [true, false]);
  },
};
