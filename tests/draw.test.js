// The draw rule: 40 moves each with no capture, no new king and no revive.

const assert = require('assert');
const { engine, RED, BLACK, emptyGame, put } = require('./helpers');
const { DRAW_AFTER } = engine;

// Two lone kings, far apart, shuffling back and forth.
function kingsOnly() {
  const game = emptyGame();
  put(game, 7, 0, RED, { king: true });
  put(game, 0, 7, BLACK, { king: true });
  return game;
}

function shuffle(game, turns) {
  for (let i = 0; i < turns && !game.over; i++) {
    const move = game.legalMoves().find((m) => !m.capture && game.board[m.from[0]][m.from[1]].king);
    game.move(move);
  }
}

module.exports = {
  'kings shuffling for 40 moves each is a draw'() {
    const game = kingsOnly();
    shuffle(game, DRAW_AFTER - 1);
    assert(!game.over, 'not drawn a turn early');
    shuffle(game, 1);
    assert(game.drawn && !game.winner && game.over);
    assert.deepStrictEqual(game.legalMoves(), []);
  },

  'a capture resets the count'() {
    const game = emptyGame();
    put(game, 5, 2, RED);
    put(game, 4, 3, BLACK);
    put(game, 0, 7, BLACK);
    game.quietTurns = 70;
    game.move({ from: [5, 2], to: [3, 4] });
    assert.strictEqual(game.quietTurns, 0);
  },

  'moving a regular piece does not reset the count'() {
    const game = kingsOnly();
    put(game, 6, 5, RED);
    shuffle(game, 50);
    assert.strictEqual(game.quietTurns, 50);
    game.move({ from: [6, 5], to: [5, 4] });
    assert.strictEqual(game.quietTurns, 51, 'otherwise you could stall forever');
  },

  'a new king resets the count'() {
    const game = kingsOnly();
    put(game, 6, 5, RED);
    shuffle(game, 30);
    game.inventory[RED].crown = 1;
    game.useAbility({ ability: 'crown', select: [6, 5] });
    game.move(game.legalMoves()[0]);
    assert.strictEqual(game.quietTurns, 0);
  },

  'shield and retreat do not count as progress'() {
    const game = kingsOnly();
    shuffle(game, 30);
    game.inventory[RED].shield = 1;
    const mine = game.legalMoves()[0].from;
    game.useAbility({ ability: 'shield', select: mine });
    shuffle(game, 1);
    assert.strictEqual(game.quietTurns, 31);

    const retreating = emptyGame();
    put(retreating, 7, 0, RED, { king: true });
    put(retreating, 0, 7, BLACK, { king: true });
    put(retreating, 4, 3, RED);
    retreating.inventory[RED].retreat = 1;
    retreating.useAbility({ ability: 'retreat', select: [4, 3], dest: [5, 2] });
    assert.strictEqual(retreating.quietTurns, 1);
  },

  'the count survives cloning'() {
    const game = kingsOnly();
    shuffle(game, 12);
    assert.strictEqual(game.clone().quietTurns, 12);
  },
};
