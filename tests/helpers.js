// Shared setup for the tests. The game files are plain scripts that expect
// their constants to be global, which is how the browser loads them.

const path = require('path');
const engine = require(path.join(__dirname, '..', 'game.js'));
Object.assign(globalThis, engine);
const { Bot } = require(path.join(__dirname, '..', 'bot.js'));

const { CheckersGame, RED, BLACK } = engine;

let nextId = 1000;

// A game with an empty board, for setting up a position by hand.
function emptyGame() {
  const game = new CheckersGame();
  game.board = game.board.map((row) => row.map(() => null));
  return game;
}

const put = (game, r, c, color, extra = {}) =>
  (game.board[r][c] = { id: nextId++, color, king: false, ...extra });

// Where `ability` can be used from `from`, as "r,c" strings, for easy comparing.
const destinations = (game, ability, from) =>
  game.abilityActions(ability)
    .filter((a) => !from || (a.select[0] === from[0] && a.select[1] === from[1]))
    .map((a) => (a.dest || a.select).join(','))
    .sort();

const pieceCount = (game, color) => {
  let n = 0;
  game.forEachPiece(color, () => n++);
  return n;
};

// Plays one whole turn for the bot, rewards included, the way the game does.
function botTurn(game, level) {
  while (game.pendingReward(game.turn)) {
    const choice = Bot.chooseReward(game, game.turn);
    if (!game.chooseReward(game.turn, choice.ability, choice.replace || null)) {
      throw new Error('bot made a choice the rules rejected');
    }
  }
  if (game.over) return;
  const { action, hops } = Bot.chooseTurn(game, level);
  if (action && !game.useAbility(action)) throw new Error('bot used an ability illegally');
  hops.forEach((hop, i) => {
    const result = game.move(hop);
    if (!result) throw new Error('bot played an illegal move');
    if (i === hops.length - 1 && result.continues) game.endTurn();
  });
}

module.exports = { engine, Bot, CheckersGame, RED, BLACK, emptyGame, put, destinations, pieceCount, botTurn };
