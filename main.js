// UI: main menu, board rendering, abilities, click handling, and driving the bot.

(() => {
  const BOT_COLOR = BLACK; // the human plays red (bottom, moves first)
  const BOT_DELAY = 500; // ms before the bot starts its turn
  const HOP_DELAY = 350; // ms between steps of a bot turn (ability, hops)

  const ABILITY_INFO = {
    sidestep: {
      name: 'Sidestep', icon: '↔️',
      help: 'Move a piece two squares sideways. This is your move.',
      pick: 'Pick a piece to move sideways.', dest: 'Pick where it goes.',
    },
    retreat: {
      name: 'Retreat', icon: '↩️',
      help: 'Move a regular piece one square diagonally backward. This is your move.',
      pick: 'Pick a piece to move backward.', dest: 'Pick where it goes.',
    },
    extraStep: {
      name: 'Extra Step', icon: '👣',
      help: 'Move a piece forward twice. This is your move.',
      pick: 'Pick a piece to move twice.', dest: 'Pick where it ends up.',
    },
    shield: {
      name: 'Shield', icon: '🛡️',
      help: "One of your pieces can't be captured or targeted until your next turn. Then make your move.",
      pick: 'Pick one of your pieces to shield.',
    },
    freeze: {
      name: 'Freeze', icon: '❄️',
      help: "An enemy piece can't move on its next turn. Then make your move.",
      pick: 'Pick an enemy piece to freeze.',
    },
    push: {
      name: 'Push', icon: '✋',
      help: 'Shove an enemy piece next to one of yours one square away. Then make your move.',
      pick: 'Pick an enemy piece next to one of yours.', dest: 'Pick where to push it.',
    },
    swap: {
      name: 'Swap', icon: '🔄',
      help: 'Swap one of your pieces with the nearest enemy piece, in front or behind. Then make your move.',
      pick: 'Pick one of your pieces to swap.', dest: 'Pick the nearest enemy piece to swap with.',
    },
    crown: {
      name: 'Crown', icon: '👑',
      help: 'Instantly make one of your pieces a king. Then make your move.',
      pick: 'Pick a piece to crown.',
    },
    revive: {
      name: 'Revive', icon: '✨',
      help: 'Bring back a captured piece on your back row. Then make your move.',
      pick: 'Pick an empty square on your back row.',
    },
  };
  const TIER_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic' };

  const game = new CheckersGame();

  const menuEl = document.getElementById('menu');
  const menuDifficultyEl = document.getElementById('menu-difficulty');
  const menuPages = {
    main: document.getElementById('menu-main'),
    difficulty: document.getElementById('menu-difficulty'),
    multiplayer: document.getElementById('menu-multiplayer'),
    online: document.getElementById('menu-online'),
    create: document.getElementById('menu-create'),
    join: document.getElementById('menu-join'),
  };
  const codeDisplayEl = document.getElementById('code-display');
  const codeInputEl = document.getElementById('code-input');
  const createStatusEl = document.getElementById('create-status');
  const joinStatusEl = document.getElementById('join-status');
  const gameEl = document.getElementById('game');
  const squaresEl = document.getElementById('squares');
  const piecesEl = document.getElementById('pieces');
  const statusEls = document.querySelectorAll('.status');
  const toastsEl = document.getElementById('toasts');
  const panelEls = { [RED]: document.getElementById('panel-red'), [BLACK]: document.getElementById('panel-black') };
  const resultEl = document.getElementById('result');
  const confirmEl = document.getElementById('confirm');

  const squareEls = [];
  const pieceEls = new Map(); // piece id -> element
  let mode = 'local'; // 'local' (two players, one device) | 'bot' | 'online'
  let botLevel = 'normal'; // 'easy' | 'normal' | 'hard'
  let myColor = RED; // online: the color this device plays
  let isHost = false; // online: the host owns the game state
  let netSession = 0; // bumped when leaving a connection so stale callbacks do nothing
  let pendingIntent = false; // online guest: waiting to hear back about a move
  let connectionLost = false; // online: the other player is gone
  let toastBuffer = null; // online host: messages to pass on to the guest
  let soundBuffer = null; // online host: sounds to pass on to the guest
  let netAction = null; // online host: the ability used, so the guest can show it
  let flipped = false; // draw the board from black's side
  let session = 0; // bumped on new game / menu so stale bot timers do nothing
  let selected = null; // [r, c] of the piece picked for a normal move
  let activeAbility = null; // ability being aimed, if any
  let abilityPick = null; // [r, c] picked first, for two-click abilities
  let lastPath = []; // squares visited by the most recent move, for highlighting
  let zCounter = 1;

  const CROWN_SVG =
    '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M3 18.5h18L19.6 8l-4.6 4.2L12 5l-3 7.2L4.4 8z"/></svg>';

  const label = (color) => color[0].toUpperCase() + color.slice(1);
  const isAt = (pos, r, c) => !!pos && pos[0] === r && pos[1] === c;
  const isBotTurn = () => mode === 'bot' && !game.over && game.turn === BOT_COLOR;
  const isGuest = () => mode === 'online' && !isHost;
  const tierOf = (ability) => ABILITIES[ability].tier;

  // Whose moves this device makes.
  function isHuman(color) {
    if (mode === 'bot') return color !== BOT_COLOR;
    if (mode === 'online') return color === myColor;
    return true; // both players share the device
  }

  // Can this device act right now?
  const canAct = () => !game.over && isHuman(game.turn) && !pendingIntent && !connectionLost;

  // ---------- Setup ----------

  // Black's side plays with the board turned around, so their pieces are
  // nearest to them. Squares keep their real coordinates either way.
  function buildSquares() {
    squaresEl.innerHTML = '';
    squareEls.length = 0;
    for (let r = 0; r < SIZE; r++) squareEls.push([]);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const r = flipped ? SIZE - 1 - i : i;
        const c = flipped ? SIZE - 1 - j : j;
        const sq = document.createElement('div');
        sq.className = 'square ' + (isDark(r, c) ? 'dark' : 'light');
        sq.dataset.r = r;
        sq.dataset.c = c;
        squaresEl.appendChild(sq);
        squareEls[r][c] = sq;
      }
    }
  }
  buildSquares();

  squaresEl.addEventListener('click', (e) => {
    const sq = e.target.closest('.square');
    if (sq) onSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
  });

  for (const panel of Object.values(panelEls)) {
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.ability');
      if (btn && !btn.disabled) toggleAbility(btn.dataset.ability);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!confirmEl.hidden) confirmEl.hidden = true;
    else if (activeAbility) toggleAbility(activeAbility);
  });

  // Closing the tab tells the other player right away, instead of leaving them
  // waiting for a move that isn't coming.
  window.addEventListener('pagehide', () => Net.sayGoodbye());

  document.getElementById('play-bot').addEventListener('click', () => showMenuPage('difficulty'));
  document.getElementById('open-multiplayer').addEventListener('click', () => showMenuPage('multiplayer'));
  document.getElementById('play-local').addEventListener('click', () => startGame('local'));
  document.getElementById('open-online').addEventListener('click', () => showMenuPage('online'));
  document.getElementById('create-game').addEventListener('click', createOnlineGame);
  document.getElementById('open-join').addEventListener('click', () => {
    showMenuPage('join');
    joinStatusEl.textContent = '';
    codeInputEl.value = '';
    codeInputEl.focus();
  });
  document.getElementById('join-game').addEventListener('click', joinOnlineGame);
  codeInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinOnlineGame();
  });
  for (const btn of document.querySelectorAll('[data-back]')) {
    btn.addEventListener('click', () => {
      leaveOnline();
      showMenuPage(btn.dataset.back);
    });
  }
  for (const btn of document.querySelectorAll('.to-menu')) btn.addEventListener('click', askLeaveGame);
  for (const btn of document.querySelectorAll('.sound-toggle')) {
    btn.addEventListener('click', () => {
      Sound.setEnabled(!Sound.isEnabled());
      renderSoundButtons();
    });
  }
  // Menu buttons and the like get a quiet tick.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.menu-btn, .menu-back, .to-menu, #join-game')) Sound.play('click');
  });
  document.getElementById('confirm-yes').addEventListener('click', () => {
    confirmEl.hidden = true;
    showMenu();
  });
  document.getElementById('confirm-no').addEventListener('click', () => {
    confirmEl.hidden = true;
  });
  document.getElementById('play-again').addEventListener('click', playAgain);
  document.getElementById('result-menu').addEventListener('click', showMenu);
  document.getElementById('view-board').addEventListener('click', hideResult);
  for (const btn of menuDifficultyEl.querySelectorAll('[data-level]')) {
    btn.addEventListener('click', () => startGame('bot', btn.dataset.level));
  }

  // ---------- Screens ----------

  function showMenuPage(page) {
    for (const [name, el] of Object.entries(menuPages)) el.hidden = name !== page;
  }

  function startGame(newMode, level) {
    mode = newMode;
    if (level) botLevel = level;
    if (mode !== 'online') {
      myColor = RED;
      isHost = false;
    }
    session++;
    pendingIntent = false;
    game.reset();
    selected = null;
    activeAbility = null;
    abilityPick = null;
    lastPath = [];
    piecesEl.innerHTML = '';
    toastsEl.innerHTML = '';
    pieceEls.clear();
    hideResult();
    // Online, the player on black sees the board from their own side.
    const shouldFlip = mode === 'online' && myColor === BLACK;
    if (shouldFlip !== flipped) {
      flipped = shouldFlip;
      buildSquares();
    }
    // Two players on one device: the top half is turned around for the player
    // sitting opposite, and each side gets its own status bar and Menu button.
    gameEl.classList.toggle('hotseat', mode === 'local');
    gameEl.classList.toggle('solo-view', mode !== 'local');
    menuEl.hidden = true;
    gameEl.hidden = false;
    render();
  }

  function playAgain() {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'restart' });
      return;
    }
    startGame(mode);
    if (mode === 'online') Net.send({ type: 'start', state: game.snapshot() });
  }

  // Tapping Menu mid-game asks first, so a stray tap doesn't end the game.
  function askLeaveGame() {
    if (game.over || connectionLost) {
      showMenu();
      return;
    }
    document.getElementById('confirm-sub').textContent = mode === 'online'
      ? 'This game will end for you and your friend.'
      : 'This game will be lost.';
    confirmEl.hidden = false;
    document.getElementById('confirm-no').focus();
  }

  function showMenu() {
    session++;
    confirmEl.hidden = true;
    leaveOnline();
    hideResult();
    showMenuPage('main');
    gameEl.hidden = true;
    menuEl.hidden = false;
  }

  // ---------- Online play ----------

  function leaveOnline() {
    netSession++;
    connectionLost = false;
    Net.sayGoodbye();
    Net.disconnect();
  }

  // Handlers for one connection; `token` guards against a stale one.
  function netEvents(token, asHost) {
    return {
      open: () => {
        if (token !== netSession) return;
        if (!asHost) return; // the guest waits for the host's first state
        isHost = true;
        myColor = RED;
        startGame('online');
        Net.send({ type: 'start', state: game.snapshot() });
      },
      message: (msg) => {
        if (token === netSession) onNetMessage(msg, asHost);
      },
      closed: () => {
        if (token !== netSession) return;
        onDisconnected();
      },
    };
  }

  async function createOnlineGame() {
    leaveOnline();
    const token = netSession;
    showMenuPage('create');
    codeDisplayEl.textContent = '····';
    setNote(createStatusEl, 'Getting a code…');
    try {
      const code = await Net.host(netEvents(token, true));
      if (token !== netSession) return;
      codeDisplayEl.textContent = code;
      setNote(createStatusEl, 'Waiting for your friend to join…');
    } catch (e) {
      if (token !== netSession) return;
      setNote(createStatusEl, "Couldn't reach the matchmaking service. Check your internet and try again.", true);
    }
  }

  async function joinOnlineGame() {
    const code = Net.normalizeCode(codeInputEl.value);
    if (code.length !== Net.CODE_LENGTH) {
      setNote(joinStatusEl, `A code is ${Net.CODE_LENGTH} letters and numbers.`, true);
      return;
    }
    leaveOnline();
    const token = netSession;
    setNote(joinStatusEl, 'Connecting…');
    try {
      await Net.join(code, netEvents(token, false));
      if (token !== netSession) return;
      isHost = false;
      myColor = BLACK;
      setNote(joinStatusEl, 'Connected — waiting for the game to start…');
    } catch (e) {
      if (token !== netSession) return;
      const message = e && e.message === 'no-game'
        ? "No game with that code. Check it and try again."
        : "Couldn't connect. Check your internet and try again.";
      setNote(joinStatusEl, message, true);
    }
  }

  function onNetMessage(msg, asHost) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'full') {
      setNote(joinStatusEl, 'That game already has two players.', true);
      leaveOnline();
      showMenuPage('online');
      return;
    }
    if (asHost) {
      if (msg.type === 'intent') applyGuestIntent(msg);
      return;
    }
    // Guest: the host owns the game, so just show what it sends.
    if (msg.type === 'start') {
      mode = 'online';
      startGame('online');
      game.restore(msg.state);
      render();
      return;
    }
    if (msg.type === 'state') {
      game.restore(msg.state);
      pendingIntent = false;
      activeAbility = null;
      abilityPick = null;
      lastPath = msg.path || lastPath;
      selected = game.chainPiece && isHuman(game.turn) ? game.chainPiece : null;
      render();
      if (msg.action) abilityEffect(msg.action);
      for (const name of msg.sounds || []) Sound.play(name);
      for (const event of msg.events || []) toast(event.text, event.tier);
      if (game.over) showResultSoon();
    }
  }

  // The host checks and applies whatever the guest asked to do.
  function applyGuestIntent(msg) {
    if (msg.kind === 'restart') {
      startGame('online');
      Net.send({ type: 'start', state: game.snapshot() });
      return;
    }
    if (game.over || game.turn === myColor) return; // not their turn
    startTurnEvents();
    if (msg.kind === 'move') {
      const move = game.legalMoves().find((m) => isAt(m.from, ...msg.from) && isAt(m.to, ...msg.to));
      if (move) {
        const result = applyHop(move);
        render();
        if (!result.continues) afterTurn(result.skipped);
      }
    } else if (msg.kind === 'ability') {
      useAbility(msg.action);
    } else if (msg.kind === 'endTurn' && game.chainPiece) {
      const skipped = game.endTurn();
      render();
      afterTurn(skipped);
    }
    broadcast();
  }

  // Host: send the guest the new state, plus what to show and play.
  function broadcast() {
    if (mode !== 'online' || !isHost) return;
    Net.send({
      type: 'state',
      state: game.snapshot(),
      events: toastBuffer || [],
      sounds: soundBuffer || [],
      action: netAction,
      path: lastPath,
    });
    toastBuffer = null;
    soundBuffer = null;
    netAction = null;
  }

  function onDisconnected() {
    if (mode !== 'online' || connectionLost) return;
    const wasPlaying = !gameEl.hidden;
    netSession++;
    Net.disconnect();
    if (!wasPlaying) {
      setNote(createStatusEl, 'Your friend disconnected.', true);
      return;
    }
    // Mid-game there's no way to carry on, so say so and offer the menu.
    connectionLost = true;
    render();
    showDisconnected();
  }

  function showDisconnected() {
    document.getElementById('result-tokens').innerHTML = '';
    document.getElementById('result-title').textContent = 'Disconnected';
    document.getElementById('result-sub').textContent =
      'Your friend left the game or lost their connection.';
    document.getElementById('play-again').hidden = true;
    resultEl.classList.add('lost');
    resultEl.hidden = false;
    document.getElementById('result-menu').focus();
  }

  function setNote(el, text, isError = false) {
    el.textContent = text;
    el.classList.toggle('error', isError);
  }

  // ---------- Input ----------

  function onSquareClick(r, c) {
    if (!canAct()) return;
    if (activeAbility) {
      onAbilityClick(r, c);
      return;
    }
    const moves = game.legalMoves();

    if (selected) {
      const move = moves.find((m) => isAt(m.from, ...selected) && isAt(m.to, r, c));
      if (move) {
        requestMove(move);
        return;
      }
    }

    // Mid multi-jump, clicking anywhere other than a jump target ends the turn.
    if (game.chainPiece) {
      requestEndTurn();
      return;
    }

    const canMove = moves.some((m) => isAt(m.from, r, c));
    selected = canMove && !isAt(selected, r, c) ? [r, c] : null;
    if (selected) Sound.play('select');
    render();
  }

  function toggleAbility(ability) {
    activeAbility = activeAbility === ability ? null : ability;
    abilityPick = null;
    selected = null;
    render();
  }

  function onAbilityClick(r, c) {
    const actions = game.abilityActions(activeAbility);
    if (abilityPick) {
      const action = actions.find((a) => isAt(a.select, ...abilityPick) && isAt(a.dest, r, c));
      if (action) {
        requestAbility(action);
        return;
      }
    }
    const picked = actions.filter((a) => isAt(a.select, r, c));
    if (picked.length && !picked[0].dest) {
      requestAbility(picked[0]);
      return;
    }
    abilityPick = picked.length && !isAt(abilityPick, r, c) ? [r, c] : null;
    render();
  }

  // ---------- Your moves ----------
  // Online, the guest asks the host to make the move and waits for the answer.
  // Everywhere else the move happens right here.

  function requestMove(move) {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'move', from: move.from, to: move.to });
      pendingIntent = true;
      render();
      return;
    }
    startTurnEvents();
    const result = applyHop(move);
    selected = result.continues ? move.to : null;
    render();
    if (!result.continues) afterTurn(result.skipped);
    broadcast();
  }

  function requestAbility(action) {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'ability', action });
      pendingIntent = true;
      activeAbility = null;
      abilityPick = null;
      render();
      return;
    }
    startTurnEvents();
    useAbility(action);
    broadcast();
  }

  function requestEndTurn() {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'endTurn' });
      pendingIntent = true;
      selected = null;
      render();
      return;
    }
    startTurnEvents();
    const skipped = game.endTurn();
    selected = null;
    render();
    afterTurn(skipped);
    broadcast();
  }

  // Host: start collecting what to pass on with the next state.
  function startTurnEvents() {
    if (mode !== 'online' || !isHost) return;
    toastBuffer = [];
    soundBuffer = [];
    netAction = null;
  }

  // ---------- Game actions (shared by the human and the bot) ----------

  function applyHop(move) {
    const result = game.move(move);
    sfx(result.captured ? 'capture' : 'move');
    if (result.promoted) sfx('crown');
    raise(result.piece);
    lastPath = lastPath.length && isAt(lastPath[lastPath.length - 1], ...move.from)
      ? [...lastPath, move.to]
      : [move.from, move.to];
    if (result.reward) rewardToast(result.reward, '');
    if (result.comeback) rewardToast(result.comeback, ' (comeback)');
    return result;
  }

  function rewardToast({ color, ability, tier }, note) {
    if (ability) sfx(`reward${capitalize(tier)}`);
    if (!ability) {
      toast(`${label(color)}'s ${TIER_NAME[tier]} slots are full — reward lost`, tier);
      return;
    }
    const info = ABILITY_INFO[ability];
    toast(`${label(color)} earned ${info.icon} ${info.name}${note}`, tier);
  }

  function useAbility(action) {
    const color = game.turn;
    const result = game.useAbility(action);
    sfx(soundFor(action.ability));
    if (result.promoted) sfx('crown');
    activeAbility = null;
    abilityPick = null;
    selected = null;
    raise(result.piece);
    if (action.dest) lastPath = [action.select, action.dest];
    flash(action.dest || action.select);
    // Online, both sides get told — otherwise your friend sees pieces move for
    // no visible reason.
    if (!isHuman(color) || mode === 'online') {
      const info = ABILITY_INFO[action.ability];
      toast(`${label(color)} used ${info.icon} ${info.name}`, tierOf(action.ability));
    }
    render();
    abilityEffect(action);
    if (mode === 'online' && isHost) netAction = action; // so the guest can animate it too
    if (game.turn !== color || game.over) afterTurn(result.skipped);
    return result;
  }

  // Called whenever a turn ends.
  function afterTurn(skipped) {
    if (skipped) toast(`${label(skipped)} is frozen — turn skipped`, 'rare');
    const movesLeft = DRAW_AFTER - game.quietTurns;
    if (!game.over && (movesLeft === 20 || movesLeft === 10)) {
      toast(`No progress — draw in ${movesLeft} moves`, 'common');
    }
    if (game.over) showResultSoon();
    scheduleBot();
  }

  // Give the last move a moment to animate before covering the board.
  function showResultSoon() {
    const mySession = session;
    setTimeout(() => {
      if (mySession === session && game.over) showResult();
    }, 700);
  }

  function raise(piece) {
    const el = pieceEls.get(piece.id);
    if (el) el.style.zIndex = ++zCounter;
  }

  // ---------- Bot ----------

  function scheduleBot() {
    if (!isBotTurn()) return;
    const mySession = session;
    // Short wait so the player's move renders before the bot starts thinking;
    // time spent thinking counts toward BOT_DELAY.
    setTimeout(() => {
      if (mySession !== session) return;
      const started = Date.now();
      const { action, hops } = Bot.chooseTurn(game, botLevel);
      const steps = action ? [{ action }, ...hops] : hops;
      const wait = Math.max(0, BOT_DELAY - (Date.now() - started));
      setTimeout(() => {
        if (mySession === session) playBotSteps(steps, mySession);
      }, wait);
    }, 50);
  }

  // Plays the bot's turn one step at a time so each part is visible.
  function playBotSteps(steps, mySession) {
    const [step, ...rest] = steps;
    if (step.action) {
      useAbility(step.action);
    } else {
      const result = applyHop(step);
      const done = !rest.length;
      const skipped = done && result.continues ? game.endTurn() : result.skipped; // bot chose to stop jumping
      render();
      if (done) afterTurn(skipped);
    }
    if (rest.length) {
      setTimeout(() => {
        if (mySession === session) playBotSteps(rest, mySession);
      }, HOP_DELAY);
    }
  }

  // ---------- Rendering ----------

  function render() {
    const myTurn = canAct();
    const moves = myTurn && !activeAbility ? game.legalMoves() : [];
    const targets = selected ? moves.filter((m) => isAt(m.from, ...selected)) : [];
    const abilityActions = myTurn && activeAbility ? game.abilityActions(activeAbility) : [];
    const pickable = abilityPick ? [] : abilityActions.map((a) => a.select);
    const abilityTargets = abilityPick
      ? abilityActions.filter((a) => isAt(a.select, ...abilityPick)).map((a) => a.dest)
      : [];
    const lifted = selected || abilityPick;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const sq = squareEls[r][c];
        const isTarget = targets.some((m) => isAt(m.to, r, c)) || abilityTargets.some((p) => isAt(p, r, c));
        // A target with a piece on it (Swap) gets a ring, since a dot would be hidden.
        const isPickable = pickable.some((p) => isAt(p, r, c)) || (isTarget && !!game.board[r][c]);
        sq.classList.toggle('selected', isAt(lifted, r, c));
        sq.classList.toggle('target', isTarget);
        sq.classList.toggle('pickable', isPickable);
        sq.classList.toggle('last-move', lastPath.some((p) => isAt(p, r, c)));
        sq.classList.toggle('clickable', isTarget || isPickable || moves.some((m) => isAt(m.from, r, c)));
      }
    }

    const seen = new Set();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const piece = game.board[r][c];
        if (!piece) continue;
        seen.add(piece.id);

        let el = pieceEls.get(piece.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'piece ' + piece.color;
          el.innerHTML = '<div class="disc">' + CROWN_SVG + '</div>';
          piecesEl.appendChild(el);
          pieceEls.set(piece.id, el);
        }
        const [dr, dc] = flipped ? [SIZE - 1 - r, SIZE - 1 - c] : [r, c];
        el.style.transform = `translate(${dc * 100}%, ${dr * 100}%)`;
        el.classList.toggle('king', piece.king);
        el.classList.toggle('selected', isAt(lifted, r, c));
        el.classList.toggle('shielded', !!piece.shield);
        el.classList.toggle('frozen', !!piece.frozen);
      }
    }

    // Fade out captured pieces, then remove them.
    for (const [id, el] of pieceEls) {
      if (seen.has(id)) continue;
      pieceEls.delete(id);
      el.classList.add('captured');
      setTimeout(() => el.remove(), 300);
    }

    renderStatus();
    renderSoundButtons();
    renderPanel(RED);
    renderPanel(BLACK);
  }

  function renderSoundButtons() {
    const on = Sound.isEnabled();
    for (const btn of document.querySelectorAll('.sound-toggle')) {
      btn.textContent = on ? '🔊' : '🔇';
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function renderStatus() {
    const color = game.drawn ? 'draw' : game.winner || game.turn;
    let text = `${label(game.turn)} to move`;
    if (game.winner) text = `${label(game.winner)} wins!`;
    else if (game.drawn) text = 'Draw!';
    const html = `<span class="swatch ${color}"></span><span>${text}</span>`;
    for (const el of statusEls) el.innerHTML = html;
  }

  function renderPanel(color) {
    const panel = panelEls[color];
    const myTurn = !game.over && game.turn === color;
    const controllable = myTurn && isHuman(color);
    panel.classList.toggle('active', myTurn);

    let name = label(color);
    if (mode === 'bot') name = isHuman(color) ? 'You' : `Bot · ${label(botLevel)}`;
    else if (mode === 'online') name = `${color === myColor ? 'You' : 'Friend'} · ${label(color)}`;

    // Reward track: one pip per step in the current cycle.
    const step = game.track[color];
    const done = step % REWARD_TRACK.length;
    const nextTier = rewardTier(step + 1);
    const nextFull = game.tierCount(color, nextTier) >= TIER_LIMITS[nextTier];
    const pips = REWARD_TRACK.map(
      (tier, i) => `<span class="pip tier-${tier}${i < done ? ' filled' : ''}"></span>`
    ).join('');

    const held = ABILITY_IDS.filter((id) => game.inventory[color][id] > 0);
    const buttons = held.map((id) => {
      const info = ABILITY_INFO[id];
      const usable = controllable && game.abilityActions(id).length > 0;
      return `<button type="button" class="ability tier-${tierOf(id)}${activeAbility === id ? ' active' : ''}"
        data-ability="${id}" title="${info.help}" ${usable ? '' : 'disabled'}>
        <span aria-hidden="true">${info.icon}</span><span class="name">${info.name}</span>
        <span class="count">${game.inventory[color][id]}</span></button>`;
    });

    let hint = '';
    if (controllable && activeAbility) {
      const info = ABILITY_INFO[activeAbility];
      const prompt = abilityPick ? info.dest : info.pick;
      hint = `${prompt} Select the ability again to cancel.
        <span class="hint-help">${info.help}</span>`;
    } else if (controllable && game.abilityUsed) {
      hint = 'Now make your move.';
    }

    const comeback = game.comeback[color];
    const trackHelp =
      'Every jump earns an ability: ' +
      REWARD_TRACK.map((t) => TIER_NAME[t]).join(', ') + ', then it repeats. ' +
      `You can hold ${TIER_LIMITS.common} Common, ${TIER_LIMITS.rare} Rare and ${TIER_LIMITS.epic} Epic.`;
    const comebackHelp =
      'Goes up when you lose a piece and down when you jump one. ' +
      `At ${COMEBACK_EVERY}, you get the next reward on your track.`;

    panel.innerHTML = `
      <div class="panel-head">
        <span class="swatch ${color}"></span><span class="panel-name">${name}</span>
        <span class="comeback" title="${comebackHelp}">Comeback ${comeback}/${COMEBACK_EVERY}</span>
        <div class="track" title="${trackHelp}">
          ${pips}<span class="track-next">Next: <span class="tier-${nextTier}">${TIER_NAME[nextTier]}</span>${nextFull ? ' (full)' : ''}</span>
        </div>
      </div>
      <div class="abilities">${buttons.join('') || '<span class="empty">Jump pieces to earn abilities</span>'}</div>
      ${hint ? `<div class="panel-hint">${hint}</div>` : ''}`;
  }

  // ---------- End-of-game screen ----------

  function showResult() {
    const { winner } = game;
    let title;
    let sub;
    let lost = false;
    if (game.drawn) {
      title = 'Draw!';
      sub = '40 moves each without a capture or new king.';
    } else if (mode === 'bot') {
      lost = winner === BOT_COLOR;
      title = lost ? 'Bot wins!' : 'You win!';
      sub = lost ? `The ${label(botLevel)} bot got you this time.` : `You beat the ${label(botLevel)} bot!`;
    } else if (mode === 'online') {
      lost = winner !== myColor;
      title = lost ? 'Friend wins!' : 'You win!';
      sub = lost ? 'Better luck in the rematch.' : 'Nicely played.';
    } else {
      const loser = opponent(winner);
      let piecesLeft = 0;
      game.forEachPiece(loser, () => piecesLeft++);
      title = `${label(winner)} wins!`;
      sub = piecesLeft ? `${label(loser)} has no moves left.` : `Every ${label(loser)} piece was captured.`;
    }

    const colors = game.drawn ? [RED, BLACK] : [winner];
    document.getElementById('result-tokens').innerHTML = colors
      .map((c) => `<div class="token ${c} king"><div class="disc">${CROWN_SVG}</div></div>`)
      .join('');
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-sub').textContent = sub;
    document.getElementById('play-again').hidden = false;
    resultEl.classList.toggle('lost', lost);
    resultEl.hidden = false;
    Sound.play(game.drawn ? 'draw' : lost ? 'lose' : 'win');
    if (!lost && !game.drawn) launchConfetti();
    document.getElementById('play-again').focus();
  }

  function hideResult() {
    resultEl.hidden = true;
    document.getElementById('confetti').innerHTML = '';
  }

  function launchConfetti() {
    const colors = ['#f4cf5e', '#cf3a2e', '#5aa9ff', '#c084fc', '#ebe7df'];
    const el = document.getElementById('confetti');
    el.innerHTML = '';
    for (let i = 0; i < 90; i++) {
      const bit = document.createElement('span');
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.animationDuration = `${2.5 + Math.random() * 2.5}s`;
      bit.style.animationDelay = `${Math.random() * 1.5}s`;
      el.appendChild(bit);
    }
  }

  // ---------- Ability effects ----------

  const DISPLAY_MS = 130; // one step of a two-step slide
  const capitalize = (s) => s[0].toUpperCase() + s.slice(1);
  const soundFor = (ability) => {
    const name = `ability${capitalize(ability)}`;
    return Sound.names.includes(name) ? name : 'ability';
  };

  const transformFor = ([r, c]) => {
    const [dr, dc] = flipped ? [SIZE - 1 - r, SIZE - 1 - c] : [r, c];
    return `translate(${dc * 100}%, ${dr * 100}%)`;
  };

  const elementAt = ([r, c]) => {
    const piece = game.board[r][c];
    return piece ? pieceEls.get(piece.id) : null;
  };

  const discOf = (el) => el && el.querySelector('.disc');

  function animate(el, keyframes, options) {
    const disc = discOf(el);
    if (disc && disc.animate) disc.animate(keyframes, options);
  }

  // Slides a piece through each square in turn instead of straight to the end.
  function slidePath(el, path) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = transformFor(path[0]);
    void el.offsetWidth; // let the browser see the starting point
    el.style.transition = `transform ${DISPLAY_MS}ms ease-in`;
    el.style.transform = transformFor(path[1]);
    setTimeout(() => {
      el.style.transition = `transform ${DISPLAY_MS}ms ease-out`;
      el.style.transform = transformFor(path[2]);
    }, DISPLAY_MS);
    setTimeout(() => {
      el.style.transition = '';
    }, DISPLAY_MS * 2 + 40);
  }

  // Blinks a piece out where it was and back in where it's going.
  function teleport(el, from, to) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = transformFor(from);
    void el.offsetWidth;
    animate(el, [
      { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
      { opacity: 0, transform: 'scale(0.2)', filter: 'brightness(2.4)', offset: 0.42 },
      { opacity: 0, transform: 'scale(0.2)', filter: 'brightness(2.4)', offset: 0.58 },
      { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
    ], { duration: 420, easing: 'ease-in-out' });
    setTimeout(() => {
      el.style.transform = transformFor(to);
    }, 210);
    setTimeout(() => {
      el.style.transition = '';
    }, 450);
  }

  // The empty square an Extra Step passes through: one diagonal step from
  // where it started, and one more to where it ends up.
  function middleSquare([sr, sc], [dr, dc]) {
    for (const [mr, mc] of [[sr - 1, sc - 1], [sr - 1, sc + 1], [sr + 1, sc - 1], [sr + 1, sc + 1]]) {
      const reachesEnd = Math.abs(mr - dr) === 1 && Math.abs(mc - dc) === 1;
      if (reachesEnd && game.isEmpty(mr, mc)) return [mr, mc];
    }
    return null;
  }

  // Runs the animation for an ability. Works out which pieces are involved
  // from the board as it is now, so it runs the same for both players online.
  function abilityEffect(action) {
    const { ability, select, dest } = action;
    const moved = dest ? elementAt(dest) : elementAt(select);
    switch (ability) {
      case 'sidestep':
        animate(moved, [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(1.18, 0.85)', offset: 0.35 },
          { transform: 'scale(1, 1)' },
        ], { duration: 280, easing: 'ease-out' });
        break;

      case 'retreat':
        animate(moved, [
          { transform: 'rotate(0) translateY(0)' },
          { transform: 'rotate(-14deg) translateY(-8%)', offset: 0.4 },
          { transform: 'rotate(0) translateY(0)' },
        ], { duration: 320, easing: 'ease-out' });
        break;

      case 'extraStep': {
        const mid = middleSquare(select, dest);
        if (mid) slidePath(moved, [select, mid, dest]);
        animate(moved, [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(0.92, 1.1)', offset: 0.25 },
          { transform: 'scale(1.1, 0.9)', offset: 0.6 },
          { transform: 'scale(1, 1)' },
        ], { duration: DISPLAY_MS * 2 + 60, easing: 'ease-in-out' });
        break;
      }

      case 'swap':
        teleport(moved, select, dest);
        teleport(elementAt(select), dest, select);
        break;

      case 'push':
        if (moved) {
          moved.style.transition = 'transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1.4)';
          setTimeout(() => { moved.style.transition = ''; }, 220);
        }
        animate(moved, [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(0.84, 1.14)', offset: 0.3 },
          { transform: 'scale(1, 1)' },
        ], { duration: 300, easing: 'ease-out' });
        break;

      case 'shield':
        animate(moved, [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.25)', filter: 'brightness(1.5)', offset: 0.4 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ], { duration: 460, easing: 'ease-out' });
        break;

      case 'freeze':
        animate(moved, [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6%)', offset: 0.2 },
          { transform: 'translateX(6%)', offset: 0.4 },
          { transform: 'translateX(-3%)', offset: 0.65 },
          { transform: 'translateX(0)' },
        ], { duration: 420, easing: 'ease-out' });
        break;

      case 'crown':
        animate(moved, [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.3)', filter: 'brightness(2)', offset: 0.35 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ], { duration: 520, easing: 'ease-out' });
        break;

      case 'revive':
        animate(moved, [
          { opacity: 0, transform: 'scale(0.2)', filter: 'brightness(2.2)' },
          { opacity: 1, transform: 'scale(1.18)', filter: 'brightness(1.5)', offset: 0.65 },
          { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
        ], { duration: 520, easing: 'ease-out' });
        break;
    }
  }

  // ---------- Effects ----------

  // Plays a sound, and remembers it for the other device when hosting online.
  function sfx(name) {
    if (soundBuffer) soundBuffer.push(name);
    Sound.play(name);
  }

  function toast(text, tier) {
    if (toastBuffer) toastBuffer.push({ text, tier }); // passed on to the other device
    const el = document.createElement('div');
    el.className = `toast tier-${tier}`;
    el.innerHTML = `<span class="text">${text}</span>`;
    toastsEl.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function flash([r, c]) {
    const sq = squareEls[r][c];
    sq.classList.remove('flash');
    void sq.offsetWidth; // restart the animation
    sq.classList.add('flash');
  }
})();
