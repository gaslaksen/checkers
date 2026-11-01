// The basic checkers rules, without abilities.

const assert = require('assert');
const { CheckersGame, RED, BLACK, emptyGame, put, pieceCount } = require('./helpers');

module.exports = {
  'opening position has 7 moves for red'() {
    const game = new CheckersGame();
    assert.strictEqual(game.legalMoves().length, 7);
    assert.strictEqual(game.turn, RED);
    assert.strictEqual(pieceCount(game, RED), 12);
    assert.strictEqual(pieceCount(game, BLACK), 12);
  },

  'jumping is optional'() {
    const game = emptyGame();
    put(game, 5, 0, RED);
    put(game, 5, 4, RED);
    put(game, 4, 1, BLACK);
    put(game, 0, 7, BLACK);
    const moves = game.legalMoves();
    assert(moves.some((m) => m.capture), 'the jump is offered');
    assert(moves.some((m) => !m.capture), 'so are plain moves');
    assert(game.move({ from: [5, 4], to: [4, 5] }), 'a plain move is allowed');
    assert.strictEqual(game.turn, BLACK);
  },

  'a multi-jump keeps the same player on turn'() {
    const game = emptyGame();
    put(game, 7, 0, RED);
    put(game, 6, 1, BLACK);
    put(game, 4, 3, BLACK);
    put(game, 0, 7, BLACK);
    const first = game.move({ from: [7, 0], to: [5, 2] });
    assert(first.continues);
    assert.strictEqual(game.turn, RED);
    assert.strictEqual(game.move({ from: [0, 7], to: [1, 6] }), null, 'no other piece may move');
    const second = game.move({ from: [5, 2], to: [3, 4] });
    assert(!second.continues);
    assert.strictEqual(game.turn, BLACK);
  },

  'a multi-jump can be stopped early'() {
    const game = emptyGame();
    put(game, 7, 0, RED);
    put(game, 6, 1, BLACK);
    put(game, 4, 3, BLACK);
    put(game, 0, 7, BLACK);
    assert(game.move({ from: [7, 0], to: [5, 2] }).continues);
    game.endTurn();
    assert.strictEqual(game.turn, BLACK);
    assert.strictEqual(game.chainPiece, null);
  },

  'being crowned ends the turn, even with another jump available'() {
    const game = emptyGame();
    put(game, 2, 1, RED);
    put(game, 1, 2, BLACK);
    put(game, 1, 4, BLACK);
    put(game, 7, 0, BLACK);
    const result = game.move({ from: [2, 1], to: [0, 3] });
    assert(result.promoted && !result.continues);
    assert.strictEqual(game.turn, BLACK);
  },

  'kings move backwards'() {
    const game = emptyGame();
    put(game, 4, 3, RED, { king: true });
    put(game, 0, 7, BLACK);
    const moves = game.legalMoves().map((m) => m.to.join(','));
    assert.deepStrictEqual(moves.sort(), ['3,2', '3,4', '5,2', '5,4']);
  },

  'capturing the last piece wins'() {
    const game = emptyGame();
    put(game, 5, 2, RED);
    put(game, 4, 3, BLACK);
    game.move({ from: [5, 2], to: [3, 4] });
    assert.strictEqual(game.winner, RED);
  },

  'a player with no moves loses'() {
    const game = emptyGame();
    put(game, 0, 1, BLACK);
    put(game, 1, 0, RED);
    put(game, 1, 2, RED);
    put(game, 2, 3, RED);
    put(game, 5, 4, RED);
    game.move({ from: [5, 4], to: [4, 3] });
    assert.strictEqual(game.winner, RED);
  },
};
