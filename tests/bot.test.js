// The computer opponent. These play real games, so they're the slow ones.

const assert = require('assert');
const { Bot, CheckersGame, RED, BLACK, emptyGame, put, botTurn } = require('./helpers');

// Plays a game between two levels. Returns the winner's level, or null.
function playGame(redLevel, blackLevel, maxPlies = 300) {
  const game = new CheckersGame();
  let plies = 0;
  let slowestMs = 0;
  while (!game.over && plies < maxPlies) {
    const level = game.turn === RED ? redLevel : blackLevel;
    const started = Date.now();
    botTurn(game, level);
    slowestMs = Math.max(slowestMs, Date.now() - started);
    plies++;
  }
  const winner = game.drawn || !game.winner ? null : (game.winner === RED ? redLevel : blackLevel);
  return { winner, plies, slowestMs, game };
}

function series(a, b, games) {
  const score = { [a]: 0, [b]: 0, draw: 0 };
  let slowestMs = 0;
  for (let i = 0; i < games; i++) {
    // alternate colours so neither level always moves first
    const result = i % 2 ? playGame(a, b) : playGame(b, a);
    score[result.winner || 'draw']++;
    slowestMs = Math.max(slowestMs, result.slowestMs);
  }
  return { score, slowestMs };
}

module.exports = {
  'bots play legal games to a finish'() {
    const { game, plies } = playGame('normal', 'easy');
    assert(game.over, `game ended (${plies} turns)`);
  },

  'normal beats easy'() {
    const { score } = series('normal', 'easy', 6);
    assert(score.normal >= 4, `normal won ${score.normal} of 6`);
  },

  'hard beats normal'() {
    const { score } = series('hard', 'normal', 4);
    assert(score.hard >= 3, `hard won ${score.hard} of 4`);
  },

  'the hard bot answers quickly enough'() {
    const { slowestMs } = series('hard', 'normal', 2);
    assert(slowestMs < 1500, `slowest turn was ${slowestMs}ms`);
  },

  'the easy bot uses abilities'() {
    let used = 0;
    for (let i = 0; i < 3 && !used; i++) {
      const game = new CheckersGame();
      let plies = 0;
      while (!game.over && plies < 200) {
        const before = JSON.stringify(game.inventory);
        botTurn(game, 'easy');
        if (game.abilityUsed || before !== JSON.stringify(game.inventory)) used++;
        plies++;
      }
    }
    assert(used > 0, 'an easy bot spent at least one ability');
  },

  'the bot skips a reward that would do nothing'() {
    const game = emptyGame();
    put(game, 5, 2, BLACK);
    put(game, 0, 7, RED);
    game.pending[BLACK].push({ color: BLACK, tier: 'epic', options: ['crown', 'revive'] });
    assert.strictEqual(Bot.chooseReward(game, BLACK).ability, 'crown', 'nothing has been captured yet');

    game.lost[BLACK] = 3;
    game.board[5][2].king = true; // every piece is already a king
    game.pending[BLACK] = [{ color: BLACK, tier: 'epic', options: ['crown', 'revive'] }];
    assert.strictEqual(Bot.chooseReward(game, BLACK).ability, 'revive', 'crowning a king is pointless');
  },

  'the bot keeps what it has rather than take a worse swap'() {
    const game = emptyGame();
    put(game, 5, 2, BLACK);
    put(game, 0, 7, RED);
    game.inventory[BLACK].crown = 1; // its epic slot is full of the best epic
    game.pending[BLACK].push({ color: BLACK, tier: 'epic', options: ['revive', 'crown'] });
    assert.strictEqual(Bot.chooseReward(game, BLACK).ability, null);
  },
};
