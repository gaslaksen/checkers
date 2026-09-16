// Super Checkers rules engine: American checkers (jumping optional) plus
// abilities earned by jumping. Pure game state and rules — no DOM.

const SIZE = 8;
const RED = 'red';
const BLACK = 'black';

// Tier of the ability earned on each jump; repeats after the last entry.
const REWARD_TRACK = ['common', 'common', 'rare', 'common', 'epic'];
// Most abilities of each tier a player can hold; rewards beyond that are lost.
const TIER_LIMITS = { common: 3, rare: 2, epic: 1 };
// Losing a piece fills your comeback meter by one; jumping a piece empties it
// by one. When it reaches this, you get the next reward on your track.
const COMEBACK_EVERY = 2;
// The game is a draw after this many turns in a row (40 each) without
// progress: no capture, no piece crowned, no Revive.
const DRAW_AFTER = 80;

// kind 'move': the ability is your move for the turn.
// kind 'pre': used before your move — you still move afterwards.
const ABILITIES = {
  sidestep: { tier: 'common', kind: 'move' },
  retreat: { tier: 'common', kind: 'move' },
  extraStep: { tier: 'common', kind: 'move' },
  shield: { tier: 'rare', kind: 'pre' },
  freeze: { tier: 'rare', kind: 'pre' },
  push: { tier: 'rare', kind: 'pre' },
  swap: { tier: 'rare', kind: 'pre' },
  crown: { tier: 'epic', kind: 'pre' },
  revive: { tier: 'epic', kind: 'pre' },
};
const ABILITY_IDS = Object.keys(ABILITIES);
const MOVE_ABILITIES = ABILITY_IDS.filter((id) => ABILITIES[id].kind === 'move');
const POOLS = {};
for (const id of ABILITY_IDS) (POOLS[ABILITIES[id].tier] ||= []).push(id);

const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const isDark = (r, c) => (r + c) % 2 === 1;
const opponent = (color) => (color === RED ? BLACK : RED);
const samePos = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
const forward = (color) => (color === RED ? -1 : 1);
const kingRow = (color) => (color === RED ? 0 : SIZE - 1);
const backRow = (color) => (color === RED ? SIZE - 1 : 0);
const emptyInventory = () => Object.fromEntries(ABILITY_IDS.map((id) => [id, 0]));

// Tier of the nth reward on a player's track (1-based).
const rewardTier = (step) => REWARD_TRACK[(step - 1) % REWARD_TRACK.length];

class CheckersGame {
  constructor() {
    this.rng = Math.random;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    let id = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!isDark(r, c)) continue;
        if (r < 3) this.board[r][c] = { id: id++, color: BLACK, king: false };
        else if (r > 4) this.board[r][c] = { id: id++, color: RED, king: false };
      }
    }
    this.nextId = id;
    this.turn = RED;
    this.chainPiece = null; // [r, c] of the piece mid multi-jump, if any
    this.abilityUsed = false; // a 'pre' ability was used this turn
    this.winner = null;
    this.drawn = false;
    this.quietTurns = 0; // turns in a row without progress (see DRAW_AFTER)
    this.madeProgress = false; // progress happened during the current turn
    this.track = { [RED]: 0, [BLACK]: 0 }; // rewards taken from the track (jumps + comebacks)
    this.comeback = { [RED]: 0, [BLACK]: 0 }; // comeback meter (see COMEBACK_EVERY)
    this.lost = { [RED]: 0, [BLACK]: 0 }; // captured pieces that Revive can bring back
    this.inventory = { [RED]: emptyInventory(), [BLACK]: emptyInventory() };
  }

  clone() {
    const g = Object.create(CheckersGame.prototype);
    g.rng = this.rng;
    g.board = this.board.map((row) => row.map((p) => p && { ...p }));
    g.nextId = this.nextId;
    g.turn = this.turn;
    g.chainPiece = this.chainPiece && [...this.chainPiece];
    g.abilityUsed = this.abilityUsed;
    g.winner = this.winner;
    g.drawn = this.drawn;
    g.quietTurns = this.quietTurns;
    g.madeProgress = this.madeProgress;
    g.track = { ...this.track };
    g.comeback = { ...this.comeback };
    g.lost = { ...this.lost };
    g.inventory = { [RED]: { ...this.inventory[RED] }, [BLACK]: { ...this.inventory[BLACK] } };
    return g;
  }

  // Everything that makes up a game, as plain data that can be sent to
  // another device and loaded with restore().
  snapshot() {
    return JSON.parse(JSON.stringify({
      board: this.board,
      nextId: this.nextId,
      turn: this.turn,
      chainPiece: this.chainPiece,
      abilityUsed: this.abilityUsed,
      winner: this.winner,
      drawn: this.drawn,
      quietTurns: this.quietTurns,
      madeProgress: this.madeProgress,
      track: this.track,
      comeback: this.comeback,
      lost: this.lost,
      inventory: this.inventory,
    }));
  }

  restore(state) {
    Object.assign(this, JSON.parse(JSON.stringify(state)));
  }

  // The game has ended, with a winner or a draw.
  get over() {
    return !!this.winner || this.drawn;
  }

  forEachPiece(color, fn) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const piece = this.board[r][c];
        if (piece && piece.color === color) fn(piece, r, c);
      }
    }
  }

  isEmpty(r, c) {
    return inBounds(r, c) && !this.board[r][c];
  }

  directions(piece) {
    if (piece.king) return DIAGONALS;
    const dr = forward(piece.color);
    return [[dr, -1], [dr, 1]];
  }

  // ---------- Normal moves ----------

  // All single-hop moves for the piece at (r, c), split into jumps and plain steps.
  // Frozen pieces can't move; shielded pieces can't be jumped.
  pieceMoves(r, c) {
    const piece = this.board[r][c];
    const jumps = [];
    const steps = [];
    if (!piece || piece.frozen) return { jumps, steps };

    for (const [dr, dc] of this.directions(piece)) {
      const r1 = r + dr;
      const c1 = c + dc;
      if (!inBounds(r1, c1)) continue;
      const neighbor = this.board[r1][c1];
      if (!neighbor) {
        steps.push({ from: [r, c], to: [r1, c1], capture: null });
        continue;
      }
      if (neighbor.color === piece.color || neighbor.shield) continue;
      if (this.isEmpty(r1 + dr, c1 + dc)) {
        jumps.push({ from: [r, c], to: [r1 + dr, c1 + dc], capture: [r1, c1] });
      }
    }
    return { jumps, steps };
  }

  // Legal moves for a color, ignoring any multi-jump in progress.
  // Captures are optional.
  movesFor(color) {
    const moves = [];
    this.forEachPiece(color, (piece, r, c) => {
      const m = this.pieceMoves(r, c);
      moves.push(...m.jumps, ...m.steps);
    });
    return moves;
  }

  // Legal moves for the side to move right now.
  legalMoves() {
    if (this.over) return [];
    if (this.chainPiece) {
      const [r, c] = this.chainPiece;
      return this.pieceMoves(r, c).jumps;
    }
    return this.movesFor(this.turn);
  }

  // Apply one hop. Returns a result describing what happened, or null if illegal.
  move({ from, to }) {
    const legal = this.legalMoves().find((m) => samePos(m.from, from) && samePos(m.to, to));
    if (!legal) return null;

    const [fr, fc] = legal.from;
    const [tr, tc] = legal.to;
    const piece = this.board[fr][fc];
    this.board[fr][fc] = null;
    this.board[tr][tc] = piece;

    let captured = null;
    let reward = null;
    let comeback = null;
    if (legal.capture) {
      this.madeProgress = true;
      const [cr, cc] = legal.capture;
      captured = this.board[cr][cc];
      this.board[cr][cc] = null;
      this.lost[captured.color]++;
      reward = this.advanceTrack(piece.color);
      this.comeback[piece.color] = Math.max(0, this.comeback[piece.color] - 1);
      if (++this.comeback[captured.color] >= COMEBACK_EVERY) {
        this.comeback[captured.color] = 0;
        comeback = this.advanceTrack(captured.color);
      }
    }

    let promoted = false;
    if (!piece.king && tr === kingRow(piece.color)) {
      piece.king = true;
      promoted = true;
      this.madeProgress = true;
    }

    // A capturing piece may keep jumping if it can (or stop via endTurn) —
    // unless it was just crowned, which ends the turn.
    const continues = !!captured && !promoted && this.pieceMoves(tr, tc).jumps.length > 0;
    let skipped = null;
    if (continues) this.chainPiece = [tr, tc];
    else skipped = this.passTurn();

    return { move: legal, piece, captured, promoted, continues, reward, comeback, skipped };
  }

  // Stop a multi-jump early and hand the turn over. Returns the color whose
  // turn was skipped, if any (see passTurn).
  endTurn() {
    return this.chainPiece ? this.passTurn() : null;
  }

  // How many abilities of `tier` a player is holding.
  tierCount(color, tier) {
    return POOLS[tier].reduce((n, id) => n + this.inventory[color][id], 0);
  }

  // Take the next reward on `color`'s track.
  advanceTrack(color) {
    this.track[color]++;
    return this.grantReward(color, rewardTier(this.track[color]));
  }

  // Give `color` a random ability of `tier`. Returns { color, ability, tier },
  // with ability null if they can't hold any more of that tier (it's lost).
  grantReward(color, tier) {
    if (this.tierCount(color, tier) >= TIER_LIMITS[tier]) return { color, ability: null, tier };
    const pool = POOLS[tier];
    const ability = pool[Math.floor(this.rng() * pool.length)];
    this.inventory[color][ability]++;
    return { color, ability, tier };
  }

  // ---------- Abilities ----------

  // Every way the side to move can use `ability` right now. Each action has a
  // `select` square (clicked first) and, for two-click abilities, a `dest`.
  // Abilities can only be used at the start of a turn, one per turn.
  abilityActions(ability) {
    const color = this.turn;
    if (this.over || this.chainPiece || this.abilityUsed) return [];
    if (!this.inventory[color][ability]) return [];
    return this.actionsFor(color, ability);
  }

  // Squares of the enemy pieces closest to (r, c) that Swap can trade with,
  // measured in king steps. Ties are all returned.
  nearestEnemies(r, c, color) {
    const enemy = opponent(color);
    let best = SIZE;
    let found = [];
    this.forEachPiece(enemy, (piece, er, ec) => {
      if (piece.shield) return; // shielded pieces can't be targeted
      if (!piece.king && r === kingRow(enemy)) return; // would land on its crowning row
      const distance = Math.max(Math.abs(er - r), Math.abs(ec - c));
      if (distance > best) return;
      if (distance < best) {
        best = distance;
        found = [];
      }
      found.push([er, ec]);
    });
    return found;
  }

  actionsFor(color, ability) {
    const out = [];
    const add = (select, dest = null) => out.push({ ability, select, dest });
    const enemy = opponent(color);

    if (ability === 'revive') {
      if (this.lost[color] > 0) {
        const r = backRow(color);
        for (let c = 0; c < SIZE; c++) if (isDark(r, c) && this.isEmpty(r, c)) add([r, c]);
      }
      return out;
    }

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = this.board[r][c];
        if (!p) continue;
        const own = p.color === color;

        switch (ability) {
          case 'sidestep':
            if (own && !p.frozen) {
              for (const dc of [-2, 2]) if (this.isEmpty(r, c + dc)) add([r, c], [r, c + dc]);
            }
            break;

          case 'retreat':
            if (own && !p.frozen && !p.king) {
              const dr = -forward(color);
              for (const dc of [-1, 1]) if (this.isEmpty(r + dr, c + dc)) add([r, c], [r + dr, c + dc]);
            }
            break;

          case 'extraStep':
            // Two steps in the piece's normal directions. Crowning stops a
            // piece, so a regular piece can't pass through its king row.
            if (own && !p.frozen) {
              const seen = new Set();
              for (const [dr1, dc1] of this.directions(p)) {
                const r1 = r + dr1;
                const c1 = c + dc1;
                if (!this.isEmpty(r1, c1)) continue;
                if (!p.king && r1 === kingRow(color)) continue;
                for (const [dr2, dc2] of this.directions(p)) {
                  const r2 = r1 + dr2;
                  const c2 = c1 + dc2;
                  const key = r2 * SIZE + c2;
                  if (!this.isEmpty(r2, c2) || seen.has(key)) continue;
                  seen.add(key);
                  add([r, c], [r2, c2]);
                }
              }
            }
            break;

          case 'shield':
            if (own && !p.shield) add([r, c]);
            break;

          case 'freeze':
            if (!own && !p.shield && !p.frozen) add([r, c]);
            break;

          case 'push':
            // Shove an enemy piece one square directly away from an adjacent
            // piece of yours. A regular piece can't be pushed onto the row
            // where it would be crowned.
            if (!own && !p.shield) {
              for (const [dr, dc] of DIAGONALS) {
                const pusher = inBounds(r - dr, c - dc) && this.board[r - dr][c - dc];
                if (!pusher || pusher.color !== color) continue;
                if (!this.isEmpty(r + dr, c + dc)) continue;
                if (!p.king && r + dr === kingRow(enemy)) continue;
                add([r, c], [r + dr, c + dc]);
              }
            }
            break;

          case 'swap':
            // Trade places with the nearest enemy piece in any direction,
            // in front or behind. If several are equally close, any of them
            // can be picked. A regular enemy piece can't be sent to the row
            // where it would be crowned.
            if (own && !p.frozen) {
              for (const [tr, tc] of this.nearestEnemies(r, c, color)) add([r, c], [tr, tc]);
            }
            break;

          case 'crown':
            if (own && !p.king) add([r, c]);
            break;
        }
      }
    }
    return out;
  }

  // Apply an ability action. Returns a result, or null if illegal.
  useAbility({ ability, select, dest }) {
    const legal = this.abilityActions(ability).find(
      (a) => samePos(a.select, select) && (a.dest ? samePos(a.dest, dest) : !dest)
    );
    if (!legal) return null;

    const color = this.turn;
    this.inventory[color][ability]--;
    const [sr, sc] = legal.select;
    let piece = this.board[sr][sc];
    let promoted = false;

    switch (ability) {
      case 'sidestep':
      case 'retreat':
      case 'extraStep':
      case 'push': {
        const [dr, dc] = legal.dest;
        this.board[sr][sc] = null;
        this.board[dr][dc] = piece;
        if (ability === 'extraStep' && !piece.king && dr === kingRow(color)) {
          piece.king = true;
          promoted = true;
          this.madeProgress = true;
        }
        break;
      }
      case 'swap': {
        const [dr, dc] = legal.dest;
        this.board[sr][sc] = this.board[dr][dc];
        this.board[dr][dc] = piece;
        if (!piece.king && dr === kingRow(color)) {
          piece.king = true;
          promoted = true;
          this.madeProgress = true;
        }
        break;
      }
      case 'shield':
        piece.shield = true;
        break;
      case 'freeze':
        piece.frozen = true;
        break;
      case 'crown':
        piece.king = true;
        this.madeProgress = true;
        break;
      case 'revive':
        piece = { id: this.nextId++, color, king: false };
        this.board[sr][sc] = piece;
        this.lost[color]--;
        this.madeProgress = true;
        break;
    }

    let skipped = null;
    if (ABILITIES[ability].kind === 'move') {
      skipped = this.passTurn();
    } else {
      this.abilityUsed = true;
      // Nothing left to move? Then the turn is over.
      if (this.movesFor(color).length === 0) skipped = this.passTurn();
    }
    return { action: legal, piece, promoted, skipped };
  }

  // ---------- Turns ----------

  // Can `color` do anything on their turn (a normal move or a movement ability)?
  canAct(color) {
    if (this.movesFor(color).length > 0) return true;
    return MOVE_ABILITIES.some(
      (id) => this.inventory[color][id] > 0 && this.actionsFor(color, id).length > 0
    );
  }

  // Hand the turn to the other player. Freezes wear off at the end of the
  // frozen player's turn; shields wear off when their owner's turn starts.
  // A player who can't act loses — unless it's only because of frozen pieces,
  // in which case they skip the turn. Returns the skipped color, if any.
  // Too many turns in a row without progress ends the game in a draw.
  passTurn() {
    this.quietTurns = this.madeProgress ? 0 : this.quietTurns + 1;
    this.madeProgress = false;
    this.chainPiece = null;
    this.abilityUsed = false;
    this.forEachPiece(this.turn, (p) => { p.frozen = false; });
    this.turn = opponent(this.turn);
    this.forEachPiece(this.turn, (p) => { p.shield = false; });

    if (this.canAct(this.turn)) {
      if (this.quietTurns >= DRAW_AFTER) this.drawn = true;
      return null;
    }
    let frozen = false;
    this.forEachPiece(this.turn, (p) => { frozen ||= !!p.frozen; });
    if (!frozen) {
      this.winner = opponent(this.turn);
      return null;
    }
    const skipped = this.turn;
    this.passTurn();
    return skipped;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    CheckersGame, SIZE, RED, BLACK, ABILITIES, ABILITY_IDS, REWARD_TRACK,
    TIER_LIMITS, COMEBACK_EVERY, DRAW_AFTER, isDark, opponent, rewardTier,
  };
}
