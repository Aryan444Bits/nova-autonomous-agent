// Simple relay server: browser captures speech via Web Speech API and streams to terminal via WebSocket
require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { handleCommand } = require('./commandExecutor');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Command API: accepts { text }
app.post('/api/command', async (req, res) => {
  try {
    const text = (req.body && req.body.text) || '';
    const result = await handleCommand(text);
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, action: 'error', message: e.message || String(e) });
  }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data && typeof data.text === 'string') {
        if (data.type === 'final') {
          process.stdout.write(`\nFinal: ${data.text}\n`);
        }
        else if (data.type === 'partial') {
          process.stdout.write(`\rPartial: ${data.text}        `);
        } 
        else if (data.type === 'text-command') {
          process.stdout.write(`\nText Command: ${data.text}\n`);
        }
      }
    } catch (e) {
      console.error('Bad message:', e.message);
    }
  });
  ws.on('close', () => console.log('Client disconnected'));
});

server.listen(PORT, () => {
  console.log(`\nOpen http://localhost:${PORT} in Chrome or Edge`);
  console.log('Click Start and allow mic access; transcripts will print here.');
  console.log('Voice commands endpoint ready at POST /api/command');
});
