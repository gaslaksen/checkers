// Boards that aren't the usual rectangle.

const assert = require('assert');
const { engine, CheckersGame, RED, BLACK, pieceCount, botTurn } = require('./helpers');

const { SHAPES, SHAPE_IDS, SIZE, isDark, shapeMask } = engine;

const squares = (game, fn) => {
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) fn(r, c);
};

module.exports = {
  'every shape looks the same after a half turn'() {
    // Otherwise one player starts with more squares than the other.
    for (const id of SHAPE_IDS) {
      const mask = shapeMask(id);
      squares(new CheckersGame(), (r, c) => {
        assert.strictEqual(mask[r][c], mask[SIZE - 1 - r][SIZE - 1 - c],
          `${id} is lopsided at ${r},${c}`);
      });
    }
  },

  'both sides start with the same army, as the shape says'() {
    for (const id of SHAPE_IDS) {
      const game = new CheckersGame();
      game.reset(id);
      assert.strictEqual(pieceCount(game, RED), SHAPES[id].pieces, `${id} red`);
      assert.strictEqual(pieceCount(game, BLACK), SHAPES[id].pieces, `${id} black`);
    }
  },

  'no piece starts on a hole, or on a light square'() {
    for (const id of SHAPE_IDS) {
      const game = new CheckersGame();
      game.reset(id);
      squares(game, (r, c) => {
        if (!game.board[r][c]) return;
        assert(game.mask[r][c], `${id} has a piece in a hole at ${r},${c}`);
        assert(isDark(r, c), `${id} has a piece on a light square at ${r},${c}`);
      });
    }
  },

  'every shape has somewhere to start and somewhere to be crowned'() {
    for (const id of SHAPE_IDS) {
      const game = new CheckersGame();
      game.reset(id);
      assert(game.legalMoves().length > 0, `${id} starts with no moves`);
      for (const row of [0, SIZE - 1]) {
        const reachable = [...Array(SIZE).keys()].some((c) => game.mask[row][c] && isDark(row, c));
        assert(reachable, `${id} has no king row at row ${row}`);
      }
    }
  },

  'moves never land in a hole'() {
    const game = new CheckersGame();
    game.reset('x');
    for (let turn = 0; turn < 40 && !game.over; turn++) {
      for (const move of game.legalMoves()) {
        const [r, c] = move.to;
        assert(game.mask[r][c], `a move lands in a hole at ${r},${c}`);
      }
      botTurn(game, 'easy');
    }
  },

  'a game on every shape runs to an end'() {
    for (const id of SHAPE_IDS) {
      const game = new CheckersGame();
      game.reset(id);
      let turns = 0;
      while (!game.over && turns < 400) {
        botTurn(game, 'easy');
        turns++;
      }
      assert(game.over, `${id} never finished`);
    }
  },

  'the shape survives being sent to another device'() {
    const game = new CheckersGame();
    game.reset('diamond');
    const copy = new CheckersGame();
    copy.restore(JSON.parse(JSON.stringify(game.snapshot())));
    assert.strictEqual(copy.shape, 'diamond');
    squares(game, (r, c) => assert.strictEqual(copy.mask[r][c], game.mask[r][c]));
    assert.strictEqual(copy.legalMoves().length, game.legalMoves().length);
  },

  'a clone keeps the shape'() {
    const game = new CheckersGame();
    game.reset('plus');
    const clone = game.clone();
    assert.strictEqual(clone.shape, 'plus');
    assert.strictEqual(clone.isEmpty(0, 1), game.isEmpty(0, 1));
    assert.strictEqual(clone.onBoard(0, 1), false); // a hole in the Plus
  },
};
