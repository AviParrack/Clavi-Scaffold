const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ─── Static files ───
app.use(express.static(__dirname));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// ─── Track active terminals ───
const terminals = new Map();

// ─── Track all WebSocket clients for broadcasting ───
const clients = new Set();

// ─── Data refresh state ───
let refreshInProgress = false;

function broadcastDataRefresh() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sessions-data.json'), 'utf-8'));
    const msg = JSON.stringify({ type: 'data-refresh', sessions: data });
    for (const client of clients) {
      try { client.send(msg); } catch (e) { /* ignore dead sockets */ }
    }
  } catch (e) {
    console.error('[refresh] failed to read/broadcast sessions-data.json:', e.message);
  }
}

function runRefresh(callback) {
  if (refreshInProgress) {
    if (callback) callback(null, false);
    return;
  }
  refreshInProgress = true;
  console.log('[refresh] running generate-session-data.py...');

  execFile('python', ['generate-session-data.py'], { cwd: __dirname, timeout: 30000 }, (err, stdout, stderr) => {
    refreshInProgress = false;
    if (err) {
      console.error('[refresh] error:', err.message);
      if (callback) callback(err, false);
      return;
    }
    console.log('[refresh] complete');
    broadcastDataRefresh();
    if (callback) callback(null, true);
  });
}

// ─── REST: refresh data ───
app.post('/refresh-data', (req, res) => {
  if (refreshInProgress) {
    return res.json({ ok: true, queued: false });
  }
  // Return immediately — data arrives via WebSocket broadcast
  res.json({ ok: true });
  runRefresh();
});

// ─── WebSocket: terminal PTY ───
wss.on('connection', (ws, req) => {
  clients.add(ws);

  const url = new URL(req.url, 'http://localhost');
  const sessionId = url.searchParams.get('sessionId');
  const projectPath = url.searchParams.get('projectPath');
  console.log(`[ws] new connection — sessionId=${sessionId}, projectPath=${projectPath}`);

  // Always spawn claude --resume from the session's project directory
  // On Windows, node-pty needs the full path or .exe extension
  const shell = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const args = sessionId ? ['--resume', sessionId] : [];
  let cwd = process.cwd();
  if (projectPath) {
    try {
      if (fs.statSync(projectPath).isDirectory()) {
        cwd = projectPath;
      }
    } catch (e) { /* path doesn't exist, use default */ }
  }

  // Spawn PTY
  let term;
  try {
    term = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
  } catch (err) {
    console.error('[pty] spawn error:', err.message);
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
    return;
  }

  const termId = term.pid;
  terminals.set(termId, term);
  console.log(`[pty] spawned pid=${termId} shell=${shell} cwd=${cwd}`);

  // PTY → WebSocket
  term.onData((data) => {
    try {
      ws.send(JSON.stringify({ type: 'output', data }));
    } catch (e) { /* ws closed */ }
  });

  term.onExit(({ exitCode }) => {
    console.log(`[pty] pid=${termId} exited code=${exitCode}`);
    try {
      ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    } catch (e) { /* ws closed */ }
    terminals.delete(termId);
  });

  // WebSocket → PTY
  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'input') {
        term.write(parsed.data);
      } else if (parsed.type === 'resize') {
        term.resize(parsed.cols, parsed.rows);
      }
    } catch (e) {
      term.write(msg.toString());
    }
  });

  ws.on('close', () => {
    console.log(`[ws] closed — killing pid=${termId}`);
    clients.delete(ws);
    term.kill();
    terminals.delete(termId);
    // Trigger data refresh on terminal close
    runRefresh();
  });
});

// ─── Graceful shutdown ───
function shutdown() {
  console.log('[server] shutting down, killing all PTY processes...');
  for (const [pid, term] of terminals) {
    try { term.kill(); } catch (e) { /* ignore */ }
  }
  terminals.clear();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Start ───
const PORT = process.env.PORT || 8092;
server.listen(PORT, () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT}/session-dashboard.html`);
});
