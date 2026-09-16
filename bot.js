// Computer opponent: picks a whole turn using a minimax search with
// alpha-beta pruning. Difficulty controls how far it looks ahead, how often it
// settles for a worse move, and whether it uses abilities.

const Bot = (() => {
  // maxDepth: turns to look ahead. tolerance: picks randomly among moves this
  // close to the best. slipChance/slipTolerance: how often it settles for a
  // merely decent move, and how far from the best that can be.
  // randomChance: how often it plays a completely random move.
  const LEVELS = {
    // Only looks at its own move, sometimes plays at random, never uses abilities.
    easy: { maxDepth: 1, tolerance: 40, randomChance: 0.3, abilities: false },
    // Looks two turns ahead, often settles for a decent move, and now and then
    // plays a random one.
    normal: {
      maxDepth: 2, tolerance: 5, slipChance: 0.35, slipTolerance: 50, randomChance: 0.08, abilities: true,
    },
    // Searches as deep as it can within the time limit.
    hard: { maxDepth: 20, tolerance: 0, abilities: true, timeLimit: 700 },
  };

  const MAN = 100;
  const KING = 160;
  const WIN = 100000;
  // What holding an unused ability is worth, so the bot only spends one when
  // doing so gains more than that.
  const TIER_VALUE = { common: 15, rare: 30, epic: 50 };
  // Points per square closer a king is to the nearest enemy piece, when ahead.
  const CHASE = 5;
  // With abilities there can be hundreds of first moves; after a shallow
  // search only the most promising ones are searched deeper.
  const ROOT_KEEP = 40;
  const TIMEOUT = Symbol('timeout');

  let deadline = Infinity;
  let nodes = 0;

  const captureCount = (hops) => hops.reduce((n, h) => n + (h.capture ? 1 : 0), 0);

  // Every way the side to move can play a normal turn, as { hops, state }, with
  // captures first (better pruning). Multi-jumps may stop after any hop, so
  // each stopping point is its own option.
  function turns(game) {
    const out = [];
    collectTurns(game, [], out);
    return out.sort((a, b) => captureCount(b.hops) - captureCount(a.hops));
  }

  function collectTurns(game, prefix, out) {
    for (const move of game.legalMoves()) {
      const next = game.clone();
      const result = next.move(move);
      const hops = [...prefix, move];
      if (!result.continues) {
        out.push({ hops, state: next });
        continue;
      }
      const stopped = next.clone();
      stopped.endTurn();
      out.push({ hops, state: stopped });
      collectTurns(next, hops, out);
    }
  }

  // Options for the bot's actual turn: normal turns, plus (if allowed) each
  // ability use — a movement ability alone, or a pre-move ability followed by
  // each possible normal turn. A bot that doesn't use abilities still falls
  // back to a movement ability when it has no normal move at all.
  function rootOptions(game, useAbilities) {
    const options = turns(game).map((t) => ({ action: null, ...t }));
    if (!useAbilities && options.length) return options;

    const ids = useAbilities ? ABILITY_IDS : ABILITY_IDS.filter((id) => ABILITIES[id].kind === 'move');
    for (const id of ids) {
      for (const action of game.abilityActions(id)) {
        const g = game.clone();
        g.useAbility(action);
        if (g.turn !== game.turn || g.over || ABILITIES[id].kind === 'move') {
          options.push({ action, hops: [], state: g });
          continue;
        }
        for (const t of turns(g)) options.push({ action, ...t });
      }
    }
    return options;
  }

  // Static score of a position from `color`'s point of view.
  function evaluate(game, color) {
    let score = 0;
    const material = { [RED]: 0, [BLACK]: 0 };
    const kings = { [RED]: [], [BLACK]: [] };
    const all = { [RED]: [], [BLACK]: [] };
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const piece = game.board[r][c];
        if (!piece) continue;
        let value;
        if (piece.king) {
          value = KING;
          kings[piece.color].push([r, c]);
        } else {
          const advanced = piece.color === RED ? SIZE - 1 - r : r;
          value = MAN + advanced * 3;
          if (advanced === 0) value += 4; // guarding the back row
        }
        material[piece.color] += piece.king ? KING : MAN;
        all[piece.color].push([r, c]);
        if (r >= 2 && r <= 5 && c >= 2 && c <= 5) value += 4; // center control
        score += piece.color === color ? value : -value;
      }
    }
    score += finishBonus(color, material, kings, all) - finishBonus(opponent(color), material, kings, all);

    const enemy = opponent(color);
    for (const id of ABILITY_IDS) {
      const held = game.inventory[color][id] - game.inventory[enemy][id];
      score += held * TIER_VALUE[ABILITIES[id].tier];
    }
    return score;
  }

  // Helps the side that's ahead actually finish the game: it's rewarded for
  // trading pieces off (a lead matters more with fewer pieces left) and for
  // moving its kings close to the enemy's remaining pieces, instead of
  // shuffling around until the game is drawn.
  function finishBonus(color, material, kings, all) {
    const enemy = opponent(color);
    const lead = material[color] - material[enemy];
    if (lead < MAN / 2 || !all[enemy].length) return 0;

    const pieces = all[RED].length + all[BLACK].length;
    let bonus = Math.round((lead * (24 - pieces)) / 24);
    for (const [kr, kc] of kings[color]) {
      // Diagonal moves a king needs to reach the nearest enemy piece.
      let nearest = SIZE;
      for (const [er, ec] of all[enemy]) {
        nearest = Math.min(nearest, Math.max(Math.abs(kr - er), Math.abs(kc - ec)));
      }
      bonus += (SIZE - nearest) * CHASE;
    }
    return bonus;
  }

  // Score of `child` from the point of view of whoever moves in `parent`.
  // Usually the turn alternates, but a frozen player can have their turn skipped.
  function scoreFor(parent, child, depth, alpha, beta) {
    return child.turn === parent.turn
      ? negamax(child, depth, alpha, beta)
      : -negamax(child, depth, -beta, -alpha);
  }

  // Deeper in the search, only normal moves are considered (abilities already
  // in play, like shields and freezes, still apply).
  function negamax(game, depth, alpha, beta) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) throw TIMEOUT;

    // When a game ends, the side left to move is the loser. Scaling by depth
    // makes the bot prefer faster wins and slower losses.
    if (game.drawn) return 0;
    if (game.winner) return -(WIN + depth);
    if (depth === 0) return evaluate(game, game.turn);

    const options = turns(game);
    if (!options.length) return evaluate(game, game.turn); // only ability moves left

    let best = -Infinity;
    for (const t of options) {
      const score = scoreFor(game, t.state, depth - 1, alpha, beta);
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Scores each root option at a fixed depth. Options that can't come within
  // `tolerance` of the best are cut off early: their score is only an upper
  // bound, kept strictly below the cutoff so they're never mistaken for a
  // candidate. (Scores are integers.)
  function scoreOptions(game, options, depth, tolerance) {
    let best = -Infinity;
    return options.map((o) => {
      const floor = best - tolerance - 1;
      const score = scoreFor(game, o.state, depth - 1, floor, Infinity);
      if (score > best) best = score;
      return { ...o, score };
    });
  }

  // Returns the bot's turn as { action, hops }: an optional ability action to
  // use first, then the normal hops to play.
  function chooseTurn(game, level = 'normal') {
    const cfg = LEVELS[level] || LEVELS.normal;
    let options = rootOptions(game, cfg.abilities);
    const pick = (o) => ({ action: o.action, hops: o.hops });
    if (options.length === 1 || Math.random() < (cfg.randomChance || 0)) {
      return pick(options[Math.floor(Math.random() * options.length)]);
    }
    const tolerance = Math.random() < (cfg.slipChance || 0) ? cfg.slipTolerance : cfg.tolerance;

    // Iterative deepening: search 1 turn ahead, then 2, ... keeping the last
    // depth that finished before the time limit.
    deadline = cfg.timeLimit ? Date.now() + cfg.timeLimit : Infinity;
    let scored = null;
    for (let depth = 1; depth <= cfg.maxDepth; depth++) {
      try {
        scored = scoreOptions(game, options, depth, tolerance);
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
      options = [...scored].sort((a, b) => b.score - a.score); // best first next time
      if (depth === 2 && options.length > ROOT_KEEP) {
        options = options.slice(0, ROOT_KEEP);
        scored = options;
      }
      if (Math.abs(options[0].score) >= WIN) break; // found a forced win or loss
    }
    deadline = Infinity;
    if (!scored) return pick(options[0]);

    const best = Math.max(...scored.map((o) => o.score));
    const good = scored.filter((o) => o.score >= best - tolerance);
    return pick(good[Math.floor(Math.random() * good.length)]);
  }

  return { chooseTurn, LEVELS };
})();

if (typeof module !== 'undefined') module.exports = { Bot };
