const http = require('http');

const text = process.argv.slice(2).join(' ') || 'open notepad';

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/command',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      try { console.log(JSON.parse(body)); }
      catch { console.log(body); }
    });
  }
);

req.on('error', (e) => {
  console.error('Request failed:', e.message);
});

req.end(JSON.stringify({ text }));
