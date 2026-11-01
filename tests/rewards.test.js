// Earning abilities: the track, the comeback meter, and choosing.

const assert = require('assert');
const { engine, RED, BLACK, CheckersGame, emptyGame, put } = require('./helpers');
const { rewardTier, TIER_LIMITS } = engine;

// Red jumps one black piece; returns the game and what the move reported.
function oneJump(setUp = () => {}) {
  const game = emptyGame();
  put(game, 5, 2, RED);
  put(game, 4, 3, BLACK);
  put(game, 0, 7, BLACK);
  setUp(game);
  const result = game.move({ from: [5, 2], to: [3, 4] });
  return { game, result };
}

module.exports = {
  'the track runs Common, Common, Rare, Common, Epic and repeats'() {
    assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map(rewardTier),
      ['common', 'common', 'rare', 'common', 'epic', 'common']);
  },

  'a jump offers two different abilities of the right tier'() {
    const { game, result } = oneJump();
    assert.strictEqual(result.reward.tier, 'common');
    assert.strictEqual(result.reward.options.length, 2);
    assert.notStrictEqual(result.reward.options[0], result.reward.options[1]);
    assert.strictEqual(game.pendingReward(RED).tier, 'common');
  },

  'you must choose before making your next move'() {
    const { game } = oneJump();
    game.move(game.legalMoves()[0]); // black replies
    assert.deepStrictEqual(game.legalMoves(), [], 'red is held up');
    assert.strictEqual(game.abilityActions('sidestep').length, 0);
    const pick = game.pendingReward(RED).options[0];
    assert.strictEqual(game.chooseReward(RED, pick).ability, pick);
    assert(game.legalMoves().length > 0);
  },

  'a multi-jump is never interrupted by the choice'() {
    const game = emptyGame();
    put(game, 7, 0, RED);
    put(game, 6, 1, BLACK);
    put(game, 4, 3, BLACK);
    put(game, 0, 7, BLACK);
    assert(game.move({ from: [7, 0], to: [5, 2] }).continues);
    assert(game.legalMoves().length > 0, 'it can keep jumping');
    game.move({ from: [5, 2], to: [3, 4] });
    assert.strictEqual(game.pending[RED].length, 2, 'both choices are queued');
  },

  'a reward can be turned down'() {
    const { game } = oneJump();
    assert.strictEqual(game.chooseReward(RED, null).ability, null);
    assert.strictEqual(Object.values(game.inventory[RED]).reduce((a, b) => a + b, 0), 0);
    assert.strictEqual(game.pendingReward(RED), null);
  },

  'a full tier must be swapped into, or passed on'() {
    const { game } = oneJump((g) => {
      g.inventory[RED].crown = 1; // the one epic slot
      g.track[RED] = 4; // so this jump offers an epic
    });
    const offer = game.pendingReward(RED);
    assert.strictEqual(offer.tier, 'epic');
    const wanted = offer.options.find((a) => a !== 'crown') || offer.options[0];
    assert.strictEqual(game.chooseReward(RED, wanted), null, 'it needs to know what to replace');
    assert.strictEqual(game.chooseReward(RED, wanted, 'shield'), null, 'and you must hold it');
    const swapped = game.chooseReward(RED, wanted, 'crown');
    assert.strictEqual(swapped.replaced, 'crown');
    assert.strictEqual(game.inventory[RED][wanted], 1);
  },

  'holding limits are three Common, two Rare, one Epic'() {
    assert.deepStrictEqual(TIER_LIMITS, { common: 3, rare: 2, epic: 1 });
  },

  'losing two pieces earns a reward, and jumping empties the meter'() {
    const { game, result } = oneJump();
    assert.strictEqual(game.comeback[BLACK], 1, 'black lost one');
    assert.strictEqual(game.comeback[RED], 0, 'red jumped, so stays empty');
    assert.strictEqual(result.comeback, null, 'not yet');

    const second = emptyGame();
    put(second, 5, 2, RED);
    put(second, 4, 3, BLACK);
    put(second, 0, 7, BLACK);
    second.comeback[BLACK] = 1;
    second.track[BLACK] = 2; // black's next track step is a Rare
    const jumped = second.move({ from: [5, 2], to: [3, 4] });
    assert.strictEqual(jumped.comeback.color, BLACK);
    assert.strictEqual(jumped.comeback.tier, 'rare', 'a comeback follows your own track');
    assert.strictEqual(second.comeback[BLACK], 0, 'the meter resets');
  },

  'the comeback meter never goes below zero'() {
    const { game } = oneJump();
    assert.strictEqual(game.comeback[RED], 0);
  },

  'choices survive being sent to another device, and clones are independent'() {
    const { game } = oneJump();
    const copy = new CheckersGame();
    copy.restore(game.snapshot());
    assert.deepStrictEqual(copy.pendingReward(RED), game.pendingReward(RED));

    const clone = game.clone();
    clone.chooseReward(RED, clone.pendingReward(RED).options[0]);
    assert.strictEqual(game.pending[RED].length, 1, 'the original is untouched');
  },
};
