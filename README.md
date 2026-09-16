# Super Checkers

Checkers where jumping pieces earns you abilities.

**Play:** https://gaslaksen.github.io/checkers/

## Modes

- **Play vs Bot** — Easy, Normal or Hard.
- **Multiplayer → Same Device** — two players take turns on one screen. The top
  half of the screen is turned around for the player sitting opposite.
- **Multiplayer → Play Online** — one player creates a game and gets a 4-letter
  code; the other joins with it. The two browsers connect directly to each
  other, so there's no server and nothing to install.

## Rules

Standard American checkers, except **jumping is optional** — you never have to
capture, and you can stop a multi-jump whenever you like.

Every jump earns a random ability. Rewards follow a track that repeats:

| Jump | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Reward | Common | Common | Rare | Common | Epic |

Losing pieces fills a **comeback meter**; jumping a piece empties it by one. At
2, you get the next reward on your track, so falling behind isn't hopeless. You
can hold at most 3 Common, 2 Rare and 1 Epic.

### Abilities

| Tier | Ability | What it does |
|---|---|---|
| Common | Sidestep | Two squares sideways. This is your move. |
| Common | Retreat | A regular piece moves one square diagonally back. This is your move. |
| Common | Extra Step | A piece steps forward twice. This is your move. |
| Rare | Shield | Your piece can't be captured or targeted until your next turn. |
| Rare | Freeze | An enemy piece can't move on its next turn. |
| Rare | Push | Shove an enemy piece next to one of yours one square away. |
| Rare | Swap | Trade places with the nearest enemy piece. |
| Epic | Crown | Make one of your pieces a king instantly. |
| Epic | Revive | Put a captured piece back on your back row. |

One ability per turn, used at the start of it. The Common ones are your move for
the turn; after any of the others, you still move.

A game is a draw after 40 moves each with no capture, no new king and no Revive.

## Files

Plain HTML, CSS and JavaScript — no build step. Open `index.html` to play
locally (online play needs the https address above).

- `game.js` — the rules, with no reference to the page
- `bot.js` — the computer opponent
- `net.js` — online play
- `main.js` — screens, board and input
