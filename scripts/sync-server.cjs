const ws = require('ws');
const http = require('http');
const WebSocketServer = ws.WebSocketServer || ws.Server;

const port = Number(process.env.PORT || process.env.SYNC_PORT || 8787);
const tournaments = new Map();
const subscribers = new Map();
const access = new WeakMap();

function send(socket, message) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function subscribersFor(tournamentId) {
  if (!subscribers.has(tournamentId)) {
    subscribers.set(tournamentId, new Set());
  }
  return subscribers.get(tournamentId);
}

const httpServer = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end("Dee's Place live sync server OK");
});

const server = new WebSocketServer({ server: httpServer });

server.on('connection', socket => {
  let currentTournamentId = null;
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', raw => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (message.type === 'subscribe' && message.tournamentId) {
      currentTournamentId = message.tournamentId;
      const snapshot = tournaments.get(currentTournamentId);
      if (snapshot?.settings?.joinToken && message.joinToken !== snapshot.settings.joinToken) {
        send(socket, { type: 'error', tournamentId: currentTournamentId, message: 'Invalid join code' });
        return;
      }
      access.set(socket, message.joinToken || snapshot?.settings?.joinToken || '');
      subscribersFor(currentTournamentId).add(socket);
      if (snapshot) {
        send(socket, { type: 'snapshot', tournamentId: currentTournamentId, tournament: snapshot });
      }
      return;
    }

    if (message.type === 'publish' && message.tournamentId && message.tournament) {
      const existing = tournaments.get(message.tournamentId);
      const expectedToken = existing?.settings?.joinToken;
      const incomingToken = message.joinToken || message.tournament.settings?.joinToken || access.get(socket);
      if (expectedToken && incomingToken !== expectedToken) {
        send(socket, { type: 'error', tournamentId: message.tournamentId, message: 'Invalid join code' });
        return;
      }
      tournaments.set(message.tournamentId, message.tournament);
      access.set(socket, message.tournament.settings?.joinToken || incomingToken || '');
      subscribersFor(message.tournamentId).add(socket);
      const nextToken = message.tournament.settings?.joinToken || incomingToken || '';
      for (const peer of subscribersFor(message.tournamentId)) {
        if (peer !== socket && (!nextToken || access.get(peer) === nextToken)) {
          send(peer, { type: 'update', tournamentId: message.tournamentId, tournament: message.tournament });
        }
      }
    }
  });

  socket.on('close', () => {
    if (currentTournamentId) {
      subscribersFor(currentTournamentId).delete(socket);
    }
  });
});

const heartbeat = setInterval(() => {
  for (const socket of server.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

server.on('close', () => clearInterval(heartbeat));

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Dee's Place live sync server running on ws://0.0.0.0:${port}`);
});
