// Online play: connects two browsers directly with WebRTC, using PeerJS's free
// public service only to introduce them. Nothing about the game goes through a
// server of ours — there isn't one.
//
// The player who creates the game is the host: they own the real game state,
// apply every move, and send the result to the guest. The guest sends what it
// wants to do and draws whatever comes back, so the two devices can't disagree.

const Net = (() => {
  // No 0/O or 1/I — they're too easy to misread when someone reads a code aloud.
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CODE_LENGTH = 4;
  // The public service is shared with everyone, so ids need a prefix of our own.
  const PREFIX = 'superch-';
  const CONNECT_TIMEOUT = 20000;

  let peer = null;
  let conn = null;
  let handlers = {};

  const randomCode = () =>
    Array.from({ length: CODE_LENGTH }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    ).join('');

  const normalizeCode = (code) => (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  const isConnected = () => !!conn && conn.open;

  function send(message) {
    if (isConnected()) conn.send(message);
  }

  function attach(connection) {
    conn = connection;
    const dropped = () => handlers.closed && handlers.closed();
    conn.on('data', (message) => {
      // The other side closing its tab is the quickest way to find out.
      if (message && message.type === 'bye') {
        dropped();
        return;
      }
      handlers.message && handlers.message(message);
    });
    conn.on('close', dropped);
    conn.on('error', dropped);
    // A browser that vanishes without saying goodbye shows up here instead.
    const watchIce = () => {
      const pc = conn.peerConnection;
      if (!pc) return;
      pc.addEventListener('iceconnectionstatechange', () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) dropped();
      });
    };
    if (conn.open) {
      handlers.open && handlers.open();
      watchIce();
    } else {
      conn.on('open', () => {
        handlers.open && handlers.open();
        watchIce();
      });
    }
  }

  // Creates a game and returns its code. The guest joins with that code.
  function host(events) {
    return new Promise((resolve, reject) => {
      handlers = events;
      const code = randomCode();
      peer = new Peer(PREFIX + code, { debug: 0 });
      const timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT);

      peer.on('open', () => {
        clearTimeout(timer);
        resolve(code);
      });
      peer.on('connection', (connection) => {
        // One game per code: anyone arriving later is turned away.
        if (isConnected()) {
          connection.on('open', () => {
            connection.send({ type: 'full' });
            setTimeout(() => connection.close(), 200);
          });
          return;
        }
        attach(connection);
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        // That code is already taken — try again with a different one.
        if (err.type === 'unavailable-id') {
          peer.destroy();
          host(events).then(resolve, reject);
          return;
        }
        if (isConnected()) handlers.closed && handlers.closed();
        else reject(err);
      });
    });
  }

  // Joins the game with the given code.
  function join(rawCode, events) {
    return new Promise((resolve, reject) => {
      handlers = events;
      const code = normalizeCode(rawCode);
      if (code.length !== CODE_LENGTH) {
        reject(new Error('bad-code'));
        return;
      }
      peer = new Peer(null, { debug: 0 });
      const timer = setTimeout(() => reject(new Error('timeout')), CONNECT_TIMEOUT);

      peer.on('open', () => {
        const connection = peer.connect(PREFIX + code, { reliable: true });
        connection.on('open', () => {
          clearTimeout(timer);
          attach(connection);
          resolve(code);
        });
      });
      peer.on('error', (err) => {
        clearTimeout(timer);
        // No game with that code (nobody is listening on that id).
        if (err.type === 'peer-unavailable') {
          reject(new Error('no-game'));
          return;
        }
        if (isConnected()) handlers.closed && handlers.closed();
        else reject(err);
      });
    });
  }

  // Tell the other side we're going, before the tab closes.
  function sayGoodbye() {
    if (isConnected()) conn.send({ type: 'bye' });
  }

  function disconnect() {
    handlers = {};
    if (conn) conn.close();
    if (peer) peer.destroy();
    conn = null;
    peer = null;
  }

  return { host, join, send, sayGoodbye, disconnect, isConnected, normalizeCode, CODE_LENGTH };
})();

if (typeof module !== 'undefined') module.exports = { Net };
