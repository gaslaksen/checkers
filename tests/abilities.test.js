// What each ability can and can't do.

const assert = require('assert');
const { RED, BLACK, emptyGame, put, destinations } = require('./helpers');

// A position where red holds one of `ability` and it's red's turn.
function withAbility(ability, setUp) {
  const game = emptyGame();
  setUp(game);
  game.inventory[RED][ability] = 1;
  return game;
}

module.exports = {
  'an ability you do not hold cannot be used'() {
    const game = emptyGame();
    put(game, 5, 2, RED);
    put(game, 0, 7, BLACK);
    assert.strictEqual(game.abilityActions('sidestep').length, 0);
  },

  'sidestep moves two squares sideways and is the whole move'() {
    const game = withAbility('sidestep', (g) => {
      put(g, 5, 2, RED);
      put(g, 5, 4, RED); // blocks the other side
      put(g, 0, 7, BLACK);
    });
    assert.deepStrictEqual(destinations(game, 'sidestep', [5, 2]), ['5,0']);
    assert(game.useAbility({ ability: 'sidestep', select: [5, 2], dest: [5, 0] }));
    assert.strictEqual(game.turn, BLACK);
    assert.strictEqual(game.inventory[RED].sidestep, 0);
  },

  'retreat is for regular pieces only'() {
    const game = withAbility('retreat', (g) => {
      put(g, 4, 3, RED);
      put(g, 4, 5, RED, { king: true });
      put(g, 0, 7, BLACK);
    });
    assert.deepStrictEqual(destinations(game, 'retreat'), ['5,2', '5,4']);
  },

  'extra step crowns on arrival but cannot pass through the king row'() {
    const game = withAbility('extraStep', (g) => {
      put(g, 2, 3, RED);
      put(g, 7, 0, BLACK);
    });
    assert.deepStrictEqual(destinations(game, 'extraStep'), ['0,1', '0,3', '0,5']);
    const result = game.useAbility({ ability: 'extraStep', select: [2, 3], dest: [0, 5] });
    assert(result.promoted && game.board[0][5].king);

    const blocked = withAbility('extraStep', (g) => {
      put(g, 1, 2, RED);
      put(g, 7, 0, BLACK);
    });
    assert.deepStrictEqual(destinations(blocked, 'extraStep'), [], 'the first step would crown it');
  },

  'a shielded piece cannot be jumped, and the shield lasts one turn'() {
    const game = withAbility('shield', (g) => {
      put(g, 5, 2, RED);
      put(g, 6, 5, RED);
      put(g, 4, 1, BLACK);
    });
    assert(game.useAbility({ ability: 'shield', select: [5, 2] }));
    assert.strictEqual(game.turn, RED, 'you still move afterwards');
    assert.strictEqual(game.abilityActions('shield').length, 0, 'one ability per turn');
    game.move({ from: [6, 5], to: [5, 6] });
    assert(!game.legalMoves().some((m) => m.capture), 'black cannot jump it');
    game.move({ from: [4, 1], to: [5, 0] });
    assert.strictEqual(game.board[5][2].shield, false, 'it wears off');
  },

  'freeze stops a piece for one turn and skips a turn it would strand'() {
    const game = withAbility('freeze', (g) => {
      put(g, 5, 2, RED);
      put(g, 2, 1, BLACK);
      put(g, 2, 5, BLACK);
    });
    game.useAbility({ ability: 'freeze', select: [2, 1] });
    game.move({ from: [5, 2], to: [4, 3] });
    assert(!game.legalMoves().some((m) => m.from[0] === 2 && m.from[1] === 1));
    game.move({ from: [2, 5], to: [3, 6] });
    assert.strictEqual(game.board[2][1].frozen, false);

    const stranded = withAbility('freeze', (g) => {
      put(g, 5, 2, RED);
      put(g, 5, 6, RED);
      put(g, 2, 1, BLACK);
    });
    stranded.useAbility({ ability: 'freeze', select: [2, 1] });
    const result = stranded.move({ from: [5, 6], to: [4, 7] });
    assert.strictEqual(result.skipped, BLACK);
    assert.strictEqual(stranded.winner, null, 'frozen is not the same as beaten');
  },

  'freeze and swap cannot target a shielded piece'() {
    const frozen = withAbility('freeze', (g) => {
      put(g, 5, 2, RED);
      put(g, 2, 1, BLACK, { shield: true });
    });
    assert.strictEqual(frozen.abilityActions('freeze').length, 0);

    const swap = withAbility('swap', (g) => {
      put(g, 4, 3, RED);
      put(g, 3, 2, BLACK, { shield: true });
      put(g, 0, 1, BLACK);
    });
    assert.deepStrictEqual(destinations(swap, 'swap', [4, 3]), ['0,1'], 'it looks past the shielded one');
  },

  'push shoves a piece away, never onto its crowning row'() {
    const game = withAbility('push', (g) => {
      put(g, 5, 2, RED);
      put(g, 4, 3, BLACK);
      put(g, 0, 7, BLACK);
    });
    assert.deepStrictEqual(destinations(game, 'push'), ['3,4']);
    game.useAbility({ ability: 'push', select: [4, 3], dest: [3, 4] });
    assert.strictEqual(game.board[3][4].color, BLACK);
    assert.strictEqual(game.turn, RED);

    const wouldCrown = withAbility('push', (g) => {
      put(g, 5, 2, RED);
      put(g, 6, 3, BLACK);
      put(g, 0, 7, BLACK);
    });
    assert.strictEqual(wouldCrown.abilityActions('push').length, 0);
  },

  'swap trades with the nearest enemy piece in any direction'() {
    const game = withAbility('swap', (g) => {
      put(g, 4, 3, RED);
      put(g, 3, 2, BLACK); // nearest
      put(g, 3, 6, BLACK);
      put(g, 0, 1, BLACK);
      put(g, 7, 0, BLACK, { king: true });
    });
    assert.deepStrictEqual(destinations(game, 'swap', [4, 3]), ['3,2']);
    const mine = game.board[4][3];
    const theirs = game.board[3][2];
    game.useAbility({ ability: 'swap', select: [4, 3], dest: [3, 2] });
    assert.strictEqual(game.board[3][2], mine);
    assert.strictEqual(game.board[4][3], theirs);
  },

  'swap offers every piece tied for nearest'() {
    const game = withAbility('swap', (g) => {
      put(g, 4, 3, RED);
      put(g, 3, 2, BLACK);
      put(g, 3, 4, BLACK);
      put(g, 5, 2, BLACK);
      put(g, 1, 6, BLACK);
    });
    assert.deepStrictEqual(destinations(game, 'swap', [4, 3]), ['3,2', '3,4', '5,2']);
  },

  'crown makes a king and leaves you your move'() {
    const game = withAbility('crown', (g) => {
      put(g, 5, 2, RED);
      put(g, 0, 7, BLACK);
    });
    game.useAbility({ ability: 'crown', select: [5, 2] });
    assert(game.board[5][2].king);
    assert.strictEqual(game.turn, RED);
    assert(game.move({ from: [5, 2], to: [6, 3] }), 'it can move backwards now');
  },

  'revive needs a lost piece and an empty back-row square'() {
    const game = withAbility('revive', (g) => {
      put(g, 5, 2, RED);
      put(g, 7, 0, RED);
      put(g, 0, 7, BLACK);
    });
    assert.strictEqual(game.abilityActions('revive').length, 0, 'nothing to bring back yet');
    game.lost[RED] = 1;
    assert.deepStrictEqual(destinations(game, 'revive'), ['7,2', '7,4', '7,6']);
    game.useAbility({ ability: 'revive', select: [7, 4] });
    assert.strictEqual(game.board[7][4].color, RED);
    assert.strictEqual(game.lost[RED], 0);
  },

  'abilities cannot be used in the middle of a multi-jump'() {
    const game = withAbility('crown', (g) => {
      put(g, 7, 0, RED);
      put(g, 6, 1, BLACK);
      put(g, 4, 3, BLACK);
      put(g, 0, 7, BLACK);
    });
    game.move({ from: [7, 0], to: [5, 2] });
    assert.strictEqual(game.abilityActions('crown').length, 0);
  },

  'a boxed-in player with a movement ability has not lost'() {
    const game = emptyGame();
    put(game, 0, 1, BLACK);
    put(game, 1, 0, RED);
    put(game, 1, 2, RED);
    put(game, 2, 3, RED);
    put(game, 5, 4, RED);
    game.inventory[BLACK].sidestep = 1;
    game.move({ from: [5, 4], to: [4, 3] });
    assert.strictEqual(game.winner, null);
    assert.strictEqual(game.turn, BLACK);
  },
};
