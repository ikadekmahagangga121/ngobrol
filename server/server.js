'use strict';

const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { db } = require('./src/db');
const auth = require('./src/auth');
const { attachChat, isOnline } = require('./src/chat');
const { halaman } = require('./src/halaman');

const PORT = Number(process.env.PORT) || 8080;

const app = express();
// Batasi ukuran body: pesan chat paling besar 2000 karakter, jadi 16 KB cukup.
app.use(express.json({ limit: '16kb' }));

// CORS longgar: semua client (Android/PC/CMD/web) diizinkan — server ini untuk LAN.
// Sekaligus header pengaman standar agar browser tidak "menebak-nebak" isi file.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// --- API HTTP ---
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'chat-app', at: Date.now() }));

// Halaman kecil di browser: alamat server + perintah siap salin.
app.get('/', (req, res) => {
  const asal = `${req.protocol}://${req.get('host')}`;
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.type('text/html; charset=utf-8').send(halaman(asal, ''));
});

// Klien terminal — bisa diunduh PC lain / HP (Termux) lewat jaringan ini.
app.get('/cli.js', (req, res) => res.type('text/plain; charset=utf-8').sendFile(path.join(__dirname, 'cli.js')));

app.post('/api/register', (req, res) => { auth.register(req, res).catch(nextError(res)); });
app.post('/api/login', (req, res) => { auth.login(req, res).catch(nextError(res)); });
app.post('/api/logout', auth.logout);
app.post('/api/change-password', (req, res) => { auth.changePassword(req, res).catch(nextError(res)); });

app.get('/api/me', (req, res) => {
  const user = auth.userByToken(tokenOf(req));
  if (!user) return res.status(401).json({ error: 'Belum login.' });
  res.json({ user });
});

app.get('/api/users', (req, res) => {
  const user = auth.userByToken(tokenOf(req));
  if (!user) return res.status(401).json({ error: 'Belum login.' });
  const users = db.prepare('SELECT id, username FROM users ORDER BY username COLLATE NOCASE').all()
    .map((r) => ({ id: Number(r.id), username: r.username, online: isOnline(Number(r.id)) }));
  res.json({ users });
});

// Riwayat chat. ?with=<userId> = private message, tanpa = room grup.
app.get('/api/messages', (req, res) => {
  const user = auth.userByToken(tokenOf(req));
  if (!user) return res.status(401).json({ error: 'Belum login.' });

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const peer = req.query.with === undefined ? null : Number(req.query.with);

  let rows;
  if (peer === null) {
    rows = db.prepare(`
      SELECT m.id, m.sender_id, m.text, m.created_at, u.username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.recipient_id IS NULL AND m.id < ?
      ORDER BY m.id DESC LIMIT ?
    `).all(before, limit);
  } else {
    if (!Number.isInteger(peer)) return res.status(400).json({ error: 'Parameter with tidak valid.' });
    rows = db.prepare(`
      SELECT m.id, m.sender_id, m.recipient_id, m.text, m.created_at, u.username
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
        AND m.id < ?
      ORDER BY m.id DESC LIMIT ?
    `).all(user.id, peer, peer, user.id, before, limit);
  }

  const messages = rows.reverse().map((r) => ({
    id: Number(r.id),
    from: { id: Number(r.sender_id), username: r.username },
    to: r.recipient_id === null || r.recipient_id === undefined ? null : Number(r.recipient_id),
    text: r.text,
    at: Number(r.created_at),
  }));
  res.json({ messages });
});

function tokenOf(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}
function nextError(res) {
  return (err) => { console.error(err); res.status(500).json({ error: 'Kesalahan server.' }); };
}

app.use((req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// --- Jalankan server ---
const server = http.createServer(app);
attachChat(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ================================================');
  console.log('   💬 Chat Server berjalan!');
  console.log('  ================================================');
  console.log(`   Port        : ${PORT}`);
  console.log(`   Database    : ${require('./src/db').dbFile}`);
  console.log('');
  console.log('   Alamat untuk client (pilih satu, sesuai jaringanmu):');
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`     → http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('   (Android/PC/cmd lain harus 1 jaringan WiFi yang sama)');
  console.log('  ================================================');
  console.log('');
});
