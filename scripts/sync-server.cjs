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

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function viewerPage(tournamentId, joinToken) {
  const safeTournamentId = escapeHtml(tournamentId);
  const safeJoinToken = escapeHtml(joinToken || '');
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Dee's Place Tournament Viewer</title>
<style>
body{margin:0;background:#020602;color:#f7fbff;font-family:Arial,sans-serif}
main{max-width:980px;margin:0 auto;padding:18px}
.top{border:1px solid #5fea28;border-radius:10px;padding:14px;margin-bottom:14px;background:#061206}
h1{margin:0 0 6px;font-size:24px}
.muted{color:#b8cbb8;font-size:13px}
.status{color:#5fea28;font-weight:900}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.card{border:1px solid #254225;border-radius:8px;background:#000;padding:12px}
.title{font-weight:900;color:#5fea28;margin-bottom:8px}
.row{border-top:1px solid #263326;padding:8px 0;font-size:14px}
.winner{color:#e0aa45;font-weight:900}
</style>
</head>
<body>
<main>
<section class="top">
<h1 id="name">Dee's Place Tournament</h1>
<div class="muted">Live view-only bracket</div>
<div id="status" class="status">Connecting...</div>
</section>
<section class="grid">
<div class="card"><div class="title">Players</div><div id="players"></div></div>
<div class="card"><div class="title">Matches</div><div id="matches"></div></div>
<div class="card"><div class="title">Winner</div><div id="winner" class="winner">Not confirmed yet</div></div>
</section>
</main>
<script>
const tournamentId=${JSON.stringify(tournamentId)};
const joinToken=${JSON.stringify(joinToken || '')};
let reconnectTimer=null;
function byId(list,id){return (list||[]).find(item=>item.id===id)}
function draw(t){
 document.getElementById('name').textContent=t.name||'Dee\\'s Place Tournament';
 document.getElementById('players').innerHTML=(t.players||[]).slice().sort((a,b)=>a.seed-b.seed).map(p=>'<div class="row">'+p.seed+'. '+escape(p.name)+'</div>').join('')||'<div class="muted">No players yet.</div>';
 document.getElementById('matches').innerHTML=(t.results||[]).map(r=>'<div class="row">Match '+escape(r.matchId)+': <span class="winner">'+escape(byId(t.players,r.winnerId)?.name||'Winner')+'</span></div>').join('')||'<div class="muted">No completed matches yet.</div>';
 document.getElementById('winner').textContent=t.settings?.confirmedWinnerName||'Not confirmed yet';
}
function escape(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function connect(){
 const protocol=location.protocol==='https:'?'wss:':'ws:';
 const socket=new WebSocket(protocol+'//'+location.host);
 socket.onopen=()=>{document.getElementById('status').textContent='Live';socket.send(JSON.stringify({type:'subscribe',tournamentId,joinToken}))};
 socket.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.tournament)draw(message.tournament)}catch{}};
 socket.onerror=()=>{document.getElementById('status').textContent='Offline'};
 socket.onclose=()=>{document.getElementById('status').textContent='Reconnecting...';clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,2000)};
}
connect();
</script>
</body>
</html>`;
}

const httpServer = http.createServer((request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const viewMatch = url.pathname.match(/^\/view\/([^/]+)$/);
  if (viewMatch) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(viewerPage(decodeURIComponent(viewMatch[1]), url.searchParams.get('join')));
    return;
  }
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
