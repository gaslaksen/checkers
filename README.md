# Chaos Checkers

Checkers where jumping pieces earns you abilities.

**Play:** https://gaslaksen.github.io/checkers/

## Modes

- **Play vs Bot** — Easy, Normal or Hard.
- **Multiplayer → Same Device** — two players take turns on one screen. The top
  half of the screen is turned around for the player sitting opposite.
- **Multiplayer → Play Online** — one player creates a game and gets a 4-letter
  code; the other joins with it. The two browsers connect directly to each
  other, so there's no server and nothing to install. Quick emoji reactions
  included.

**How to Play** on the menu explains the rules and every ability, and
**Settings** turns the sound on or off. The game installs to a phone home
screen and works offline against the bot.

## Rules

Standard American checkers, except **jumping is optional** — you never have to
capture, and you can stop a multi-jump whenever you like.

Every jump earns an ability — you pick one of two. Rewards follow a track that
repeats:

| Jump | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Reward | Common | Common | Rare | Common | Epic |

Losing pieces fills a **comeback meter**; jumping a piece empties it by one. At
2, you get the next reward on your track, so falling behind isn't hopeless. You
can hold at most 3 Common, 2 Rare and 1 Epic — when a tier is full, a new
ability can be swapped for one you hold, or turned down.

### Abilities

| Tier | Ability | What it does |
|---|---|---|
| Common | Sidestep | Two squares sideways. This is your move. |
| Common | Retreat | A regular piece moves one square diagonally back. This is your move. |
| Common | Extra Step | A piece steps forward twice. This is your move. |
| Common | Push | Shove an enemy piece next to one of yours one square away. |
| Rare | Shield | Your piece can't be captured or targeted until your next turn. |
| Rare | Freeze | An enemy piece can't move on its next turn. |
| Rare | Swap | Trade places with the nearest enemy piece. |
| Rare | Split Move | Move a piece one square, then make your move with it or another. |
| Epic | Crown | Make one of your pieces a king instantly. |
| Epic | Revive | Put a captured piece back on your back row. |

One ability per turn, used at the start of it. Sidestep, Retreat and Extra Step
are your move for the turn; after any of the others, you still move.

A game is a draw after 40 moves each with no capture, no new king and no Revive.

## Files

Plain HTML, CSS and JavaScript — no build step for the website. Open
`index.html` to play locally (online play needs the https address above).

- `game.js` — the rules, with no reference to the page
- `bot.js` — the computer opponent
- `net.js` — online play
- `main.js` — screens, board and input
- `sound.js` — sound effects, synthesized in code
- `store.js` — settings and results remembered between visits
- `platform.js` — whether it's running in the iPhone app, and haptics and Game Center there
- `ads.js` — when the app may show an ad (the website never does)
- `vendor/peerjs.min.js` — PeerJS 1.5.5, served from here rather than a CDN
- `sw.js`, `manifest.json` — offline support and home-screen install

## iPhone app

The same files, bundled with [Capacitor](https://capacitorjs.com) into
`ios/`. Building it needs Node and Xcode.

```
npm install
npm run ios
```

That copies `index.html` and everything it links to into `www/`, syncs it
into the Xcode project and opens Xcode, where you pick a simulator or phone
and press Run. Run `npm run build` and `npx cap sync ios` after changing any
web file. `scripts/draw-icons.html` draws the app icon and launch image.

Game Center signs players in when the app opens, through a small plugin in
the Xcode project (`GameCenterPlugin.swift`, registered in
`MainViewController.swift`). Their name and picture show on the versus
screen at the start of an online game. It only works once the app exists
in App Store Connect with Game Center turned on; until then, and on the
website, players are shown as You and Friend.

## Tests

```
node tests/run.js
```

No dependencies — they run the rules engine and the bot directly and take
about ten seconds. They cover the checkers rules, every ability, earning,
choosing and rerolling rewards, the draw rule, the state copy that online
play relies on, that the three bot difficulties stay in order, saving
settings, and how often ads may show.
