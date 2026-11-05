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
    shape: document.getElementById('menu-shape'),
    glitch: document.getElementById('menu-glitch'),
    tooeasy: document.getElementById('menu-tooeasy'),
    multiplayer: document.getElementById('menu-multiplayer'),
    online: document.getElementById('menu-online'),
    create: document.getElementById('menu-create'),
    join: document.getElementById('menu-join'),
  };
  const codeDisplayEl = document.getElementById('code-display');
  const codeInputEl = document.getElementById('code-input');
  // Not a game code. Typed into the join box, it opens something else.
  const SECRET_CODE = 'RNDY';
  const createStatusEl = document.getElementById('create-status');
  const joinStatusEl = document.getElementById('join-status');
  const gameEl = document.getElementById('game');
  const squaresEl = document.getElementById('squares');
  const piecesEl = document.getElementById('pieces');
  const statusEls = document.querySelectorAll('.status');
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
  let message = null; // the message showing in both panels right now
  let messageId = 0;
  const messageQueue = [];
  let soundBuffer = null; // online host: sounds to pass on to the guest
  let netAction = null; // online host: the ability used, so the guest can show it
  let netActor = null; // online host: whose action this was
  let flipped = false; // draw the board from black's side
  let boardShape = 'full'; // which board this game is played on
  let builtShape = null; // the shape the squares on screen were built for
  let shapesOn = false; // the board chooser, once you've found it
  let pendingLevel = null; // the difficulty picked, while you choose a board
  let session = 0; // bumped on new game / menu so stale bot timers do nothing
  let selected = null; // [r, c] of the piece picked for a normal move
  let activeAbility = null; // ability being aimed, if any
  let abilityPick = null; // [r, c] picked first, for two-click abilities
  let lastPath = []; // squares visited by the most recent move, for highlighting
  let zCounter = 1;
  let botMad = false; // the Too Easy Bot has stopped pretending
  let angerPending = false; // he's snapped, but you haven't been told yet
  let takenFromBot = 0; // his pieces you've captured
  let sinceCheat = 1; // his turns since the last one, so he never cheats twice over

  const CROWN_SVG =
    '<svg class="crown" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M3 18.5h18L19.6 8l-4.6 4.2L12 5l-3 7.2L4.4 8z"/></svg>';

  const isRandy = () => mode === 'bot' && botLevel === 'randy';
  const isTooEasy = () => mode === 'bot' && botLevel === 'tooeasy';
  // In the secret modes the bot brings its own colour and you play black.
  const BOT_SKIN = { randy: 'Purple', tooeasy: 'Yellow' };
  const label = (value) => {
    const skin = mode === 'bot' ? BOT_SKIN[botLevel] : null;
    if (skin && value === BLACK) return skin;
    if (skin && value === RED) return 'Black';
    return value[0].toUpperCase() + value.slice(1);
  };
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
  const canAct = () =>
    !game.over && isHuman(game.turn) && !pendingIntent && !connectionLost && !game.pendingReward(game.turn)
    && !(mode === 'local' && game.pendingReward(opponent(game.turn))); // the other player is still choosing

  // ---------- Setup ----------

  // Black's side plays with the board turned around, so their pieces are
  // nearest to them. Squares keep their real coordinates either way.
  // The squares on screen have to match the board being played: the side
  // it's seen from online, and which squares exist at all.
  function syncBoardFrame() {
    const shouldFlip = mode === 'online' && myColor === BLACK;
    if (shouldFlip === flipped && builtShape === game.shape) return;
    flipped = shouldFlip;
    builtShape = game.shape;
    buildSquares();
  }

  function buildSquares() {
    squaresEl.innerHTML = '';
    squareEls.length = 0;
    for (let r = 0; r < SIZE; r++) squareEls.push([]);
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        const r = flipped ? SIZE - 1 - i : i;
        const c = flipped ? SIZE - 1 - j : j;
        const sq = document.createElement('div');
        // Shapes other than Classic leave holes where there's no square.
        const kind = !game.mask[r][c] ? 'void' : isDark(r, c) ? 'dark' : 'light';
        sq.className = 'square ' + kind;
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
      const help = e.target.closest('.slot.help');
      if (help) {
        showGuide();
        return;
      }
      const btn = e.target.closest('.slot[data-ability]');
      if (btn && !btn.disabled) toggleAbility(btn.dataset.ability);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!guideEl.hidden) guideEl.hidden = true;
    else if (!confirmEl.hidden) confirmEl.hidden = true;
    else if (activeAbility) toggleAbility(activeAbility);
  });

  // Closing the tab tells the other player right away, instead of leaving them
  // waiting for a move that isn't coming.
  window.addEventListener('pagehide', () => Net.sayGoodbye());

  // Coming back to the game after switching away: audio needs a nudge from a
  // real interaction, or the rest of the game plays silently.
  for (const event of ['pointerdown', 'keydown']) {
    document.addEventListener(event, () => Sound.resume(), { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) Sound.resume();
  });

  document.getElementById('play-bot').addEventListener('click', () => showMenuPage('difficulty'));
  document.getElementById('how-to-play').addEventListener('click', showGuide);
  document.getElementById('play-tooeasy').addEventListener('click', () => {
    screenFlash('tint-gold');
    startGame('bot', 'tooeasy');
  });
  document.getElementById('play-randy').addEventListener('click', () => {
    screenFlash();
    startGame('bot', 'randy');
  });
  document.getElementById('share-code').addEventListener('click', shareCode);
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
    btn.addEventListener('click', () => {
      if (!shapesOn) {
        startGame('bot', btn.dataset.level);
        return;
      }
      pendingLevel = btn.dataset.level;
      showShapeMenu();
    });
  }

  // ---------- The board chooser ----------

  // Tap the two checkers above the title while you're picking a difficulty
  // and the black one takes the red one — and the king's crown with it. Do
  // that and you get to choose what shape the board is.
  const tokensEl = document.getElementById('menu-tokens');

  tokensEl.addEventListener('click', () => {
    if (menuPages.difficulty.hidden) return; // only on the bot menu
    shapesOn = !shapesOn;
    knockTokens();
    menuDifficultyEl.classList.toggle('reversed', shapesOn); // hardest first
  });

  function knockTokens() {
    const black = tokensEl.querySelector('.token.black');
    const red = tokensEl.querySelector('.token.red');
    const hitter = shapesOn ? black : red;
    const hit = shapesOn ? red : black;
    const way = hitter === black ? 1 : -1;
    hitter.animate([
      { transform: 'translateX(0)' },
      { transform: `translateX(${way * 34}px)`, offset: 0.4 },
      { transform: 'translateX(0)' },
    ], { duration: 460, easing: 'ease-in-out' });
    hit.animate([
      { transform: 'translateX(0) rotate(0)' },
      { transform: `translateX(${way * 26}px) rotate(${way * 26}deg)`, offset: 0.55 },
      { transform: 'translateX(0) rotate(0)' },
    ], { duration: 520, easing: 'ease-out' });
    // The crown and the places change hands halfway through the knock.
    setTimeout(() => {
      Sound.play('capture');
      black.classList.toggle('king', shapesOn);
      red.classList.toggle('king', !shapesOn);
      tokensEl.classList.toggle('swapped', shapesOn);
    }, 190);
  }

  function showShapeMenu() {
    document.getElementById('shape-list').innerHTML = SHAPE_IDS.map((id) => {
      const mask = shapeMask(id);
      const cells = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          cells.push(`<span class="${!mask[r][c] ? 'off' : isDark(r, c) ? 'dark' : 'light'}"></span>`);
        }
      }
      return `<button type="button" class="shape-btn" data-shape="${id}">
        <span class="shape-grid" aria-hidden="true">${cells.join('')}</span>
        <span class="shape-text"><b>${SHAPES[id].name}</b>
        <small>${SHAPES[id].pieces} each</small></span></button>`;
    }).join('');
    showMenuPage('shape');
  }

  document.getElementById('shape-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-shape]');
    if (btn) startGame('bot', pendingLevel, btn.dataset.shape);
  });

  // ---------- Screens ----------

  // The display tearing for half a second. `tint` swaps the colours it tears
  // in — each secret door flashes in its own.
  function screenFlash(tint = null) {
    const flash = document.getElementById('screen-flash');
    flash.className = tint ? `screen-flash ${tint}` : 'screen-flash';
    flash.hidden = true;
    void flash.offsetWidth; // restart the animation
    flash.hidden = false;
    setTimeout(() => { flash.hidden = true; }, 640);
  }

  function showMenuPage(page) {
    for (const [name, el] of Object.entries(menuPages)) el.hidden = name !== page;
  }

  function startGame(newMode, level, shape = 'full') {
    mode = newMode;
    if (level) botLevel = level;
    boardShape = mode === 'bot' ? shape : 'full'; // shapes are a bot thing
    if (mode !== 'online') {
      myColor = RED;
      isHost = false;
    }
    session++;
    pendingIntent = false;
    game.reset(boardShape);
    selected = null;
    activeAbility = null;
    abilityPick = null;
    lastPath = [];
    piecesEl.innerHTML = '';
    pieceEls.clear();
    message = null;
    messageQueue.length = 0;
    hideResult();
    hideAnnounce();
    syncBoardFrame();
    // Two players on one device: the top half is turned around for the player
    // sitting opposite, and each side gets its own status bar and Menu button.
    gameEl.classList.toggle('hotseat', mode === 'local');
    gameEl.classList.toggle('solo-view', mode !== 'local');
    gameEl.classList.toggle('online', mode === 'online');
    gameEl.classList.toggle('vs-bot', mode === 'bot');
    document.body.classList.toggle('randy-mode', isRandy());
    document.body.classList.toggle('tooeasy-mode', isTooEasy());
    document.body.classList.remove('mad');
    botMad = false;
    angerPending = false;
    takenFromBot = 0;
    sinceCheat = 1;
    menuEl.hidden = true;
    gameEl.hidden = false;
    render();
  }

  function playAgain() {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'restart' });
      return;
    }
    startGame(mode, null, boardShape); // same board again
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
    document.body.classList.remove('randy-mode', 'tooeasy-mode', 'mad');
    confirmEl.hidden = true;
    reactionsEl.hidden = true;
    hideReward();
    hideAnnounce();
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
    if (code === SECRET_CODE) {
      // There is no game at the other end of this one.
      codeInputEl.value = '';
      setNote(joinStatusEl, '');
      screenFlash();
      Sound.play('glitch');
      showMenuPage('glitch');
      return;
    }
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

  // Hands the code and a link to whatever the phone or browser offers —
  // messages, mail, or just the clipboard.
  async function shareCode() {
    const code = codeDisplayEl.textContent.trim();
    if (!/^[A-Z0-9]+$/.test(code)) return;
    const url = location.href.split('?')[0].split('#')[0];
    const text = `Play Super Checkers with me — join with code ${code}: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Super Checkers', text, url });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote(createStatusEl, 'Copied — paste it to your friend.');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // they closed the share sheet
      setNote(createStatusEl, `Couldn't share automatically — your code is ${code}.`, true);
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
    if (msg.type === 'react') {
      showReaction(opponent(myColor), msg.emoji);
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
      // Your own sounds already played here when you made the move.
      if (msg.by !== myColor) for (const name of msg.sounds || []) Sound.play(name);
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
    startTurnEvents(opponent(myColor));
    if (msg.kind === 'move') {
      const move = game.legalMoves().find((m) => isAt(m.from, ...msg.from) && isAt(m.to, ...msg.to));
      if (move) {
        const result = applyHop(move);
        render();
        if (!result.continues) afterTurn(result.skipped);
      }
    } else if (msg.kind === 'ability') {
      useAbility(msg.action);
    } else if (msg.kind === 'reward') {
      applyReward(opponent(myColor), msg.ability, msg.replace || null);
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
      by: netActor,
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
      const piece = game.board[move.from[0]][move.from[1]];
      Sound.play(move.capture ? 'capture' : 'move');
      if (piece && !piece.king && move.to[0] === (myColor === RED ? 0 : SIZE - 1)) Sound.play('crown');
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
      Sound.play(soundFor(action.ability));
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
  function startTurnEvents(actor = myColor) {
    if (mode !== 'online' || !isHost) return;
    toastBuffer = [];
    soundBuffer = [];
    netAction = null;
    netActor = actor;
  }

  // ---------- Game actions (shared by the human and the bot) ----------

  function applyHop(move) {
    const mover = game.turn;
    const result = game.move(move);
    lastActor = mover;
    if (result.captured) turnCaptures++;
    if (result.captured && isTooEasy() && result.captured.color === BOT_COLOR) takenFromBot++;
    if (result.promoted) turnPromoted = true;
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

  // A jump earns a choice, made at the start of that player's next turn.
  function rewardToast({ color, tier }, note) {
    sfx(`reward${capitalize(tier)}`);
    const a = tier === 'epic' ? 'an' : 'a';
    toast(`${label(color)} earned ${a} ${TIER_NAME[tier]} ability${note}`, tier);
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
    botReactToTurn();
    checkAnger();
    turnCaptures = 0;
    turnPromoted = false;
    if (skipped) toast(`${label(skipped)} is frozen — turn skipped`, 'rare');
    const movesLeft = DRAW_AFTER - game.quietTurns;
    if (!game.over && (movesLeft === 20 || movesLeft === 10)) {
      toast(`No progress — draw in ${movesLeft} moves`, 'common');
    }
    if (game.over) {
      const botLost = mode === 'bot' && game.winner !== BOT_COLOR;
      if (mode === 'bot' && !game.drawn) botReact(botLost ? 'lost' : 'won', { always: true });
      showResultSoon(mode === 'bot' && !game.drawn ? 1600 : 700);
    }
    scheduleBot();
  }

  // Give the last move a moment to animate — and the bot a moment to react —
  // before covering the board.
  function showResultSoon(delay = 700) {
    const mySession = session;
    setTimeout(() => {
      if (mySession === session && game.over) showResult();
    }, delay);
  }

  function raise(piece) {
    const el = pieceEls.get(piece.id);
    if (el) el.style.zIndex = ++zCounter;
  }

  // ---------- Bot ----------

  function scheduleBot() {
    if (!isBotTurn()) return;
    if (game.pendingReward(opponent(BOT_COLOR))) return; // wait: you're still choosing
    const mySession = session;
    // Short wait so the player's move renders before the bot starts thinking;
    // time spent thinking counts toward BOT_DELAY.
    setTimeout(() => {
      if (mySession !== session) return;
      // Take any reward it has earned first — it can't move until it has.
      while (game.pendingReward(BOT_COLOR)) {
        const choice = Bot.chooseReward(game, BOT_COLOR, botLevel);
        if (!applyReward(BOT_COLOR, choice.ability, choice.replace || null)) break;
      }
      if (game.over || !isBotTurn()) return;
      // Once he's angry, about half his turns aren't turns at all.
      if (botMad && sinceCheat > 0 && Math.random() < CHEAT_CHANCE && cheatTurn(mySession)) {
        sinceCheat = 0;
        return;
      }
      sinceCheat++;
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

  // ---------- The Too Easy Bot ----------

  // He is an Easy bot and nothing more, until you take enough off him. Then
  // he stops bothering with the rules. He can still be beaten: everything he
  // blows up fills your comeback meter, he never touches a shielded piece,
  // he never takes your last one, and he still thinks like an Easy bot.

  const MAD_AFTER = 4; // of his pieces, before he snaps
  const CHEAT_CHANCE = 0.55; // of his turns, once he has

  // How the end screen talks about whichever bot you were playing. The
  // secret two have names, so "the Tooeasy bot" won't do.
  function botResultLine(lost) {
    if (isTooEasy()) {
      if (lost) return botMad ? 'It cheated, and it still counts.' : 'The Too Easy Bot got you this time.';
      return botMad ? 'You beat the Too Easy Bot — cheating and all!' : 'You beat the Too Easy Bot!';
    }
    if (isRandy()) return lost ? 'Randy got you this time, and has no idea how.' : 'You beat Randy!';
    return lost ? `The ${label(botLevel)} Bot got you this time.` : `You beat the ${label(botLevel)} Bot!`;
  }

  const botName = () => {
    if (isTooEasy()) return botMad ? 'TOO EASY BOT' : 'Too Easy Bot';
    return `Bot · ${label(botLevel)}`;
  };

  function checkAnger() {
    if (!isTooEasy() || botMad || angerPending || game.over || takenFromBot < MAD_AFTER) return;
    angerPending = true;
    // The fourth piece is usually one you jumped, so you're busy claiming the
    // reward for it. Wait until that's out of the way — a message behind the
    // chooser is a message you never saw.
    const mySession = session;
    const reveal = (waited) => {
      if (mySession !== session || game.over) return;
      if (dialogOpen() && waited < 30000) {
        setTimeout(() => reveal(waited + 250), 250);
        return;
      }
      angerPending = false;
      botMad = true;
      document.body.classList.add('mad');
      screenFlash('tint-gold');
      sfx('glitch');
      announce('The Too Easy Bot is getting mad');
      render();
    };
    setTimeout(() => reveal(0), 400);
  }

  // One of his turns, spent cheating. Returns false if he can't think of
  // anything, in which case he plays a normal turn after all.
  function cheatTurn(mySession) {
    const cheats = [];
    if (explodeTarget()) cheats.push(cheatExplode);
    if (illegalMove()) cheats.push(cheatIllegal);
    if (borrowable().length) cheats.push(cheatBorrow);
    if (!cheats.length) return false;
    cheats[Math.floor(Math.random() * cheats.length)](mySession);
    return true;
  }

  // Which of your pieces he'd blow up. Not a shielded one, and never your
  // last — that would be a win, and he hasn't earned one.
  function explodeTarget() {
    const men = [];
    const kings = [];
    game.forEachPiece(RED, (p, r, c) => {
      if (!p.shield) (p.king ? kings : men).push([r, c]);
    });
    const targets = kings.length ? kings : men; // your best piece first
    const total = men.length + kings.length;
    if (!targets.length || total <= 1) return null;
    return targets[Math.floor(Math.random() * targets.length)];
  }

  function cheatExplode(mySession) {
    const at = explodeTarget();
    if (!at) return;
    const [r, c] = at;
    const el = pieceEls.get(game.board[r][c].id);
    toast('Too Easy Bot blew up your piece', 'epic');
    sfx('explode');
    flash(at);
    animate(el, [
      { transform: 'scale(1)', filter: 'brightness(1)' },
      { transform: 'scale(1.7)', filter: 'brightness(3)', offset: 0.3 },
      { transform: 'scale(0.1)', filter: 'brightness(0.4)' },
    ], { duration: 420, easing: 'ease-out' });

    game.board[r][c] = null;
    game.lost[RED]++;
    game.madeProgress = true; // a piece left the board, so this isn't a stall
    // You still get the credit for losing it.
    if (++game.comeback[RED] >= COMEBACK_EVERY) {
      game.comeback[RED] = 0;
      rewardToast(game.advanceTrack(RED), ' (comeback)');
    }
    botReact('cheated', { always: true });
    // Let the blast finish before the board moves on.
    setTimeout(() => {
      if (mySession !== session) return;
      const skipped = game.passTurn();
      render();
      afterTurn(skipped);
    }, 420);
  }

  // Somewhere one of his pieces has no business going: sideways, backwards,
  // two squares at once. Dark squares only — he cheats, he isn't blind.
  function illegalMove() {
    const legal = new Set(game.movesFor(BOT_COLOR).map((m) => `${m.from}>${m.to}`));
    const options = [];
    game.forEachPiece(BOT_COLOR, (p, r, c) => {
      if (p.frozen) return;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const to = [r + dr, c + dc];
          if ((!dr && !dc) || !game.isEmpty(...to) || !isDark(...to)) continue;
          if (!p.king && to[0] === kingRow(BOT_COLOR)) continue; // no free crowns
          if (legal.has(`${[r, c]}>${to}`)) continue;
          options.push({ from: [r, c], to });
        }
      }
    });
    return options.length ? options[Math.floor(Math.random() * options.length)] : null;
  }

  function cheatIllegal() {
    const move = illegalMove();
    if (!move) return;
    const [fr, fc] = move.from;
    const [tr, tc] = move.to;
    toast('Too Easy Bot moved there. Somehow.', 'rare');
    sfx('glitch');
    game.board[tr][tc] = game.board[fr][fc];
    game.board[fr][fc] = null;
    lastPath = [move.from, move.to];
    flash(move.to);
    const skipped = game.passTurn();
    render();
    afterTurn(skipped);
  }

  // Powers he doesn't have. Granting one and letting the rules apply it keeps
  // the board honest even when he isn't.
  function borrowable() {
    const out = [];
    for (const id of ABILITY_IDS) {
      if (game.inventory[BOT_COLOR][id]) continue; // that one's really his
      game.inventory[BOT_COLOR][id] = 1;
      const actions = game.abilityActions(id);
      game.inventory[BOT_COLOR][id] = 0;
      if (actions.length) out.push(id);
    }
    return out;
  }

  function cheatBorrow(mySession) {
    const options = borrowable();
    if (!options.length) return;
    const ability = options[Math.floor(Math.random() * options.length)];
    game.inventory[BOT_COLOR][ability] = 1; // just for a moment
    const actions = game.abilityActions(ability);
    toast(`Too Easy Bot doesn't have ${ABILITY_INFO[ability].name}`, 'epic');
    sfx('glitch');
    useAbility(actions[Math.floor(Math.random() * actions.length)]);
    game.inventory[BOT_COLOR][ability] = 0; // in case the rules gave it back
    // That was only half a turn: he still gets to move.
    if (game.over || game.turn !== BOT_COLOR) return;
    setTimeout(() => {
      if (mySession !== session) return;
      const { hops } = Bot.chooseTurn(game, botLevel);
      if (hops.length) playBotSteps(hops, mySession);
    }, HOP_DELAY);
  }

  // ---------- Rendering ----------

  function render() {
    syncBoardFrame(); // an online guest can be sent a board of another shape
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
    maybeShowReward();
    renderPanel(RED);
    renderPanel(BLACK);
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
    if (mode === 'bot') name = isHuman(color) ? 'You' : botName();
    else if (mode === 'online') name = `${color === myColor ? 'You' : 'Friend'} · ${label(color)}`;

    // Reward track: one pip per step in the current cycle.
    const step = game.track[color];
    const done = step % REWARD_TRACK.length;
    const nextTier = rewardTier(step + 1);
    const nextFull = game.tierCount(color, nextTier) >= TIER_LIMITS[nextTier];
    const pips = REWARD_TRACK.map(
      (tier, i) => `<span class="pip tier-${tier}${i < done ? ' filled' : ''}"></span>`
    ).join('');

    // One slot per ability you can hold: three Common, two Rare, one Epic.
    // Empty slots stay visible, so the row is always the same size and the
    // limits are obvious without reading anything.
    const slots = [];
    for (const tier of ['common', 'rare', 'epic']) {
      const mine = ABILITY_IDS.filter((id) => tierOf(id) === tier)
        .flatMap((id) => Array(game.inventory[color][id]).fill(id));
      for (let i = 0; i < TIER_LIMITS[tier]; i++) slots.push({ tier, ability: mine[i] || null });
    }

    const buttons = slots.map(({ tier, ability }) => {
      if (!ability) {
        return `<span class="slot empty tier-${tier}" title="Empty ${TIER_NAME[tier]} slot"></span>`;
      }
      const info = ABILITY_INFO[ability];
      const usable = controllable && game.abilityActions(ability).length > 0;
      return `<button type="button" class="slot tier-${tier}${activeAbility === ability ? ' active' : ''}"
        data-ability="${ability}" title="${info.name}: ${info.help}" ${usable ? '' : 'disabled'}>
        <span class="slot-icon" aria-hidden="true">${info.icon}</span>
        <span class="slot-name">${info.name}</span></button>`;
    });

    let hint = '';
    if (controllable && activeAbility) {
      const info = ABILITY_INFO[activeAbility];
      // Short enough for one line — the guide explains what each ability does.
      hint = `${info.name}: ${abilityPick ? info.dest : info.pick}`;
    } else if (controllable && game.abilityUsed) {
      hint = 'Now make your move.';
    }

    // One reserved line per panel: the hint while aiming an ability, otherwise
    // whatever just happened. Reserved so the board never shifts.
    const line = hint
      ? `<span class="panel-hint">${hint}</span>`
      : message
        ? `<span class="panel-message tier-${message.tier}" data-msg="${message.id}">${message.text}</span>`
        : '';

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
      <div class="abilities">${buttons.join('')}
        <button type="button" class="slot help" title="What do these do?" aria-label="Ability guide">?</button>
      </div>
      <div class="panel-line">${line}</div>`;
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
      sub = botResultLine(lost);
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

  // ---------- Installing to the home screen ----------

  const installBtn = document.getElementById('install-app');
  let installPrompt = null;

  // Chrome and friends offer this; iOS doesn't, so there the guide explains
  // the Share → Add to Home Screen route instead.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installBtn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // Offline play just won't be available; the game still works.
      });
    });
  }

  // ---------- Quick reactions ----------

  const reactionsEl = document.getElementById('reactions');

  for (const btn of document.querySelectorAll('.react-toggle')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!reactionsEl.hidden) {
        reactionsEl.hidden = true;
        return;
      }
      // Open it next to whichever button was tapped.
      const box = btn.getBoundingClientRect();
      reactionsEl.hidden = false;
      const menu = reactionsEl.getBoundingClientRect();
      const below = box.bottom + 8 + menu.height < innerHeight;
      reactionsEl.style.top = `${below ? box.bottom + 8 : box.top - menu.height - 8}px`;
      reactionsEl.style.left = `${Math.max(8, Math.min(box.right - menu.width, innerWidth - menu.width - 8))}px`;
    });
  }

  reactionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-react]');
    if (!btn) return;
    reactionsEl.hidden = true;
    showReaction(myColor, btn.dataset.react);
    if (mode === 'online') Net.send({ type: 'react', emoji: btn.dataset.react });
  });

  document.addEventListener('click', (e) => {
    if (!reactionsEl.hidden && !e.target.closest('.reactions, .react-toggle')) reactionsEl.hidden = true;
  });

  // Floats an emoji up from that player's panel.
  function showReaction(color, emoji) {
    if (typeof emoji !== 'string' || emoji.length > 8) return;
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = emoji;
    panelEls[color].appendChild(el);
    Sound.play('click');
    setTimeout(() => el.remove(), 1700);
  }

  // ---------- The bot reacting ----------

  // Sparse on purpose: a bot that reacts to everything is annoying.
  const BOT_REACTIONS = {
    bigTurn: ['🎉', '😂', '👍'],      // it took two or more of your pieces
    cheated: ['😂', '👍'],            // the Too Easy Bot, enjoying itself
    crowned: ['🎉', '👍'],
    youHitBack: ['😮', '🤔'],         // you took two or more of its pieces
    youTookOne: ['🤔', '😮'],
    won: ['🎉', '👍'],
    lost: ['😅', '👍'],
  };
  const REACT_CHANCE = { easy: 0.5, normal: 0.35, hard: 0.25, randy: 1, tooeasy: 0.5 };
  const REACT_COOLDOWN = 8000;
  const ALL_REACTIONS = ['👍', '😂', '😮', '😅', '🎉', '🤔'];

  let lastBotReaction = 0;
  let turnCaptures = 0; // pieces taken during the turn being played
  let turnPromoted = false;
  let lastActor = null;

  function botReact(kind, { always = false } = {}) {
    if (mode !== 'bot' || game.drawn) return;
    const now = Date.now();
    if (!always) {
      if (now - lastBotReaction < REACT_COOLDOWN) return;
      if (Math.random() > (botMad ? 0.8 : REACT_CHANCE[botLevel] ?? 0.3)) return;
    }
    const pool = kind === 'randy' ? ALL_REACTIONS : BOT_REACTIONS[kind];
    lastBotReaction = now;
    const emoji = pool[Math.floor(Math.random() * pool.length)];
    const mySession = session;
    // A beat later, so it lands after the move it's reacting to — and not
    // while a full-screen dialog is covering the board, where you'd miss it.
    const show = (waited) => {
      if (mySession !== session) return;
      if (dialogOpen() && waited < 20000) {
        setTimeout(() => show(waited + 300), 300);
        return;
      }
      showReaction(BOT_COLOR, emoji);
    };
    setTimeout(() => show(0), 500 + Math.random() * 500);
  }

  const dialogOpen = () =>
    !rewardEl.hidden || !resultEl.hidden || !confirmEl.hidden || !guideEl.hidden;

  // Called when a turn ends, with the counts from that turn.
  function botReactToTurn() {
    if (mode !== 'bot') return;
    if (botLevel === 'randy') { // reacts to everything and nothing
      if (Math.random() < 0.6) botReact('randy', { always: true });
      return;
    }
    if (lastActor === BOT_COLOR) {
      if (turnCaptures >= 2) botReact('bigTurn');
      else if (turnPromoted) botReact('crowned');
    } else if (turnCaptures >= 2) {
      botReact('youHitBack');
    } else if (turnCaptures === 1) {
      botReact('youTookOne');
    }
  }

  // ---------- Choosing a reward ----------

  const rewardEl = document.getElementById('reward');
  let rewardPick = null; // the ability chosen, while deciding what it replaces
  let rewardColor = null; // who is choosing
  let rewardKey = null; // the offer on screen, so it isn't rebuilt needlessly
  // A beat before the chooser covers the board, so whatever earned it — your
  // own jump, or the Too Easy Bot blowing a piece up — is seen first.
  const REWARD_DELAY = 1000;
  let rewardWaitKey = null; // the offer being waited on
  let rewardTimer = null;

  document.getElementById('reward-skip').addEventListener('click', () => sendReward(null));
  document.getElementById('reward-options').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ability]');
    if (btn) pickReward(btn.dataset.ability);
  });
  document.getElementById('reward-held').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ability]');
    if (btn) sendReward(rewardPick, btn.dataset.ability);
  });

  const optionButton = (id) => {
    const info = ABILITY_INFO[id];
    return `<button type="button" class="reward-option tier-${tierOf(id)}" data-ability="${id}">
      <span class="icon" aria-hidden="true">${info.icon}</span>
      <span class="name">${info.name}</span>
      <span class="what">${info.help}</span></button>`;
  };

  // Shows the choice when one is waiting for whoever is playing on this device.
  // Whoever on this device has a reward waiting — usually the player who just
  // jumped, so they choose straight away instead of waiting for their opponent.
  function rewardChooser() {
    if (connectionLost || game.over) return null; // the jump that wins needs no reward
    for (const color of [lastActor, game.turn, opponent(game.turn)]) {
      if (color && isHuman(color) && game.pendingReward(color)) return color;
    }
    return null;
  }

  function hideReward() {
    clearTimeout(rewardTimer);
    rewardTimer = null;
    rewardWaitKey = null;
    rewardKey = null;
    rewardPick = null;
    rewardEl.hidden = true;
  }

  function maybeShowReward() {
    const color = rewardChooser();
    const offer = color && game.pendingReward(color);
    if (!offer) {
      hideReward();
      return;
    }
    // Already showing this same offer? Leave it alone — rebuilding would
    // undo a half-made choice when the other player's move arrives.
    const key = `${color}:${offer.tier}:${offer.options.join(',')}`;
    if (!rewardEl.hidden && rewardKey === key) return;
    // A new offer waits a second, then renders again and falls through here.
    if (rewardWaitKey !== key) {
      rewardWaitKey = key;
      clearTimeout(rewardTimer);
      const mySession = session;
      rewardTimer = setTimeout(() => {
        rewardTimer = null;
        if (mySession === session) render();
      }, REWARD_DELAY);
    }
    if (rewardTimer) return;
    rewardKey = key;
    rewardPick = null;
    rewardColor = color;
    // On one device, turn it around for whoever is sitting opposite.
    rewardEl.classList.toggle('flip', mode === 'local' && color === BLACK);
    const full = game.tierCount(offer.color, offer.tier) >= TIER_LIMITS[offer.tier];
    document.getElementById('reward-sub').textContent = full
      ? `Your ${TIER_NAME[offer.tier]} slots are full — take one of these in place of one you hold, or keep what you have.`
      : `You earned ${offer.tier === 'epic' ? 'an' : 'a'} ${TIER_NAME[offer.tier]} ability. Pick one.`;
    document.getElementById('reward-options').innerHTML = offer.options.map(optionButton).join('');
    document.getElementById('reward-swap').hidden = true;
    document.getElementById('reward-skip').textContent = full ? 'Keep what I have' : 'No thanks';
    rewardEl.hidden = false;
  }

  function pickReward(ability) {
    const offer = game.pendingReward(rewardColor);
    if (!offer) return;
    if (game.tierCount(offer.color, offer.tier) < TIER_LIMITS[offer.tier]) {
      sendReward(ability);
      return;
    }
    // That tier is full, so something has to go.
    rewardPick = ability;
    const held = ABILITY_IDS.filter((id) => tierOf(id) === offer.tier && game.inventory[offer.color][id] > 0);
    document.getElementById('reward-held').innerHTML = held.map(optionButton).join('');
    document.getElementById('reward-swap').hidden = false;
  }

  function sendReward(ability, replace = null) {
    if (isGuest()) {
      Net.send({ type: 'intent', kind: 'reward', ability, replace });
      const offer = game.pendingReward(myColor);
      if (ability && offer) Sound.play(`reward${capitalize(offer.tier)}`);
      rewardEl.hidden = true;
      pendingIntent = true;
      return;
    }
    startTurnEvents(rewardColor);
    applyReward(rewardColor, ability, replace);
    broadcast();
    scheduleBot(); // the bot was waiting for this
  }

  // Applies a choice and says what happened, wherever it came from.
  function applyReward(color, ability, replace) {
    const result = game.chooseReward(color, ability, replace);
    if (!result) return false;
    rewardEl.hidden = true;
    if (result.ability) {
      const info = ABILITY_INFO[result.ability];
      sfx(`reward${capitalize(result.tier)}`);
      const swapped = result.replaced ? ` instead of ${ABILITY_INFO[result.replaced].name}` : '';
      toast(`${label(color)} took ${info.icon} ${info.name}${swapped}`, result.tier);
    } else {
      toast(`${label(color)} passed on a ${TIER_NAME[result.tier]} ability`, result.tier);
    }
    render();
    return true;
  }

  // ---------- Ability guide ----------

  const guideEl = document.getElementById('guide');
  document.getElementById('guide-close').addEventListener('click', () => { guideEl.hidden = true; });

  // The smiley in the rules is a door, but only while you're in the menu —
  // during a game it's just a smiley.
  document.getElementById('guide-body').addEventListener('click', (e) => {
    if (!e.target.closest('.guide-smiley') || !gameEl.hidden) return;
    guideEl.hidden = true;
    screenFlash('tint-gold');
    Sound.play('glitch');
    showMenuPage('tooeasy');
  });

  const RULES = [
    'Red moves first. Tap one of your pieces, then a highlighted square.',
    'Jumping is optional — you never have to capture, and you can stop a multi-jump whenever you like.',
    'Reach the far row and your piece becomes a king, which can also move backwards.',
    'You win by capturing every enemy piece, or leaving your opponent with no move.',
    `It's a draw after 40 moves each with no capture and no new king.`,
    `You can send an emote too — tap the <span class="guide-smiley" role="img" aria-label="smiley face">🙂</span> at the top of the screen.`,
    'Playing online: one of you creates a game and shares the code, the other taps Join Game and types it in — like RNDY.',
    'To keep it on your phone: Android — Install from the menu; iPhone — Share, then Add to Home Screen.',
  ];

  function showGuide() {
    const rows = ['common', 'rare', 'epic'].map((tier) => {
      const list = ABILITY_IDS.filter((id) => tierOf(id) === tier).map((id) => {
        const info = ABILITY_INFO[id];
        return `<li><span class="guide-icon" aria-hidden="true">${info.icon}</span>
          <span><b>${info.name}</b> — ${info.help}</span></li>`;
      }).join('');
      return `<h3 class="guide-tier tier-${tier}">${TIER_NAME[tier]}
        <small>hold up to ${TIER_LIMITS[tier]}</small></h3><ul class="guide-list">${list}</ul>`;
    }).join('');

    document.getElementById('guide-body').innerHTML = `
      <h3 class="guide-tier">The game</h3>
      <ul class="guide-list plain">${RULES.map((r) => `<li>${r}</li>`).join('')}</ul>
      <h3 class="guide-tier">Abilities</h3>
      <p class="guide-intro">Every piece you jump earns a random ability:
        ${REWARD_TRACK.map((t) => TIER_NAME[t]).join(', ')}, then it repeats.
        Lose ${COMEBACK_EVERY} pieces and you get the next one anyway.
        You pick one of two, and you can use one ability per turn, at the start of your turn.</p>
      ${rows}`;
    guideEl.hidden = false;
    document.getElementById('guide-close').focus();
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

  // Messages appear in both players' panels rather than over the board, so
  // they never hide the pieces and each player reads their own copy the right
  // way up. They queue, so a burst of them doesn't overwrite itself.
  const MESSAGE_MS = 1700;

  function toast(text, tier) {
    if (toastBuffer) toastBuffer.push({ text, tier }); // passed on to the other device
    messageQueue.push({ text, tier, id: ++messageId });
    if (!message) nextMessage();
  }

  function nextMessage() {
    message = messageQueue.shift() || null;
    renderPanel(RED);
    renderPanel(BLACK);
    if (!message) return;
    const mine = message.id;
    setTimeout(() => {
      if (message && message.id === mine) nextMessage();
    }, MESSAGE_MS);
  }

  // Big, centred, and gone again. For the one thing you mustn't miss.
  let announceId = 0;

  const hideAnnounce = () => {
    announceId++;
    document.getElementById('announce').hidden = true;
  };

  function announce(text, ms = 2400) {
    const el = document.getElementById('announce');
    el.textContent = text;
    el.classList.remove('show');
    el.hidden = false;
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
    const mine = ++announceId;
    setTimeout(() => {
      if (mine === announceId) el.hidden = true;
    }, ms);
  }

  function flash([r, c]) {
    const sq = squareEls[r][c];
    sq.classList.remove('flash');
    void sq.offsetWidth; // restart the animation
    sq.classList.add('flash');
  }
})();
