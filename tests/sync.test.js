// Online play copies the whole game to the other device after every action.
// These check the copy always behaves exactly like the original.

const assert = require('assert');
const { CheckersGame, engine, Bot } = require('./helpers');
const { ABILITY_IDS } = engine;

module.exports = {
  'a mirrored game always agrees with the original'() {
    for (let round = 0; round < 8; round++) {
      const host = new CheckersGame();
      const guest = new CheckersGame();
      let plies = 0;
      while (!host.over && plies < 200) {
        while (host.pendingReward(host.turn)) {
          const choice = Bot.chooseReward(host, host.turn);
          host.chooseReward(host.turn, choice.ability, choice.replace || null);
        }
        if (host.over) break;
        const moves = host.legalMoves();
        if (moves.length) {
          host.move(moves[Math.floor(Math.random() * moves.length)]);
        } else {
          const usable = ABILITY_IDS.filter((id) => host.abilityActions(id).length);
          if (!usable.length) break;
          host.useAbility(host.abilityActions(usable[0])[0]);
        }

        guest.restore(host.snapshot());
        assert.deepStrictEqual(guest.snapshot(), host.snapshot(), 'same state');
        assert.strictEqual(guest.legalMoves().length, host.legalMoves().length, 'same moves');
        for (const id of ABILITY_IDS) {
          assert.strictEqual(guest.abilityActions(id).length, host.abilityActions(id).length, `same options for ${id}`);
        }
        plies++;
      }
    }
  },

  'a clone cannot change the original'() {
    const game = new CheckersGame();
    const clone = game.clone();
    clone.inventory.red.crown = 5;
    clone.board[5][0].shield = true;
    clone.pending.red.push({ color: 'red', tier: 'epic', options: ['crown', 'revive'] });
    assert.strictEqual(game.inventory.red.crown, 0);
    assert(!game.board[5][0].shield);
    assert.strictEqual(game.pending.red.length, 0);
  },
};
