'use strict';

const { WebSocketServer } = require('ws');
const { db } = require('./db');
const { userByToken } = require('./auth');
const { kursor, simpanKursor } = require('./terkirim');

const MAX_TEXT = 2000;

// Penangkal spam: maksimal 15 pesan per 5 detik untuk tiap user (bisa diatur
// lewat MAKS_KIRIM). Pesan beruntun di atas batas ini ditolak dengan pesan
// ramah, bukan disimpan, supaya riwayat tidak dibanjiri.
const MAKS_KIRIM = Number(process.env.MAKS_KIRIM) || 15;
const JENDELA_KIRIM_MS = 5000;
const kirimTerakhir = new Map(); // userId -> [timestamp, ...]

function terlaluCepat(userId) {
  const now = Date.now();
  const arr = (kirimTerakhir.get(userId) || []).filter((t) => now - t < JENDELA_KIRIM_MS);
  if (arr.length >= MAKS_KIRIM) {
    kirimTerakhir.set(userId, arr);
    return true;
  }
  arr.push(now);
  kirimTerakhir.set(userId, arr);
  return false;
}

function tolak(ws, pesan) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'error', error: pesan }));
}

/** userId -> Set<ws> (bisa login di banyak perangkat sekaligus) */
const online = new Map();

function addClient(userId, ws) {
  if (!online.has(userId)) online.set(userId, new Set());
  online.get(userId).add(ws);
}
function removeClient(userId, ws) {
  const set = online.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) online.delete(userId);
}
function isOnline(userId) {
  return online.has(userId);
}
function sendTo(userId, payload) {
  const set = online.get(userId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}
function broadcast(payload, exceptWs) {
  const data = JSON.stringify(payload);
  for (const set of online.values()) {
    for (const ws of set) {
      if (ws !== exceptWs && ws.readyState === ws.OPEN) ws.send(data);
    }
  }
}

function saveMessage(senderId, recipientId, text) {
  const info = db.prepare('INSERT INTO messages (sender_id, recipient_id, text, created_at) VALUES (?, ?, ?, ?)')
    .run(senderId, recipientId ?? null, text, Date.now());
  return Number(info.lastInsertRowid);
}

function presencePayload(userId, username, status) {
  return { type: 'presence', user: { id: userId, username }, status }; // status: 'online' | 'offline'
}

// ------------------------------------------------- pesan yang tertinggal
// Kalau penerima sedang offline, pesannya tetap disimpan. Begitu dia online
// lagi, semua pesan yang belum pernah sampai dikirim ulang ke dia.

const MAKS_CATCHUP = 300;

function barisJadiPesan(r) {
  const dari = { id: Number(r.sender_id), username: r.username };
  if (r.recipient_id === null || r.recipient_id === undefined) {
    return { type: 'group', id: Number(r.id), from: dari, text: r.text, at: Number(r.created_at) };
  }
  return {
    type: 'pm',
    id: Number(r.id),
    from: dari,
    to: Number(r.recipient_id),
    text: r.text,
    at: Number(r.created_at),
  };
}

/** Kirim semua pesan relevan yang belum pernah sampai ke pengguna ini. */
function catchUp(ws, user) {
  const sejak = kursor(user.id);
  const rows = db.prepare(`
    SELECT m.id, m.sender_id, m.recipient_id, m.text, m.created_at, u.username
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.id > ? AND (m.recipient_id IS NULL OR m.recipient_id = ? OR m.sender_id = ?)
    ORDER BY m.id DESC LIMIT ?
  `).all(sejak, user.id, user.id, MAKS_CATCHUP).reverse();

  for (const r of rows) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(barisJadiPesan(r)));
  }
  // Tandai sudah sampai supaya tidak dikirim dua kali saat sambung ulang.
  simpanKursor(user.id);
  return rows.length;
}

function handleMessage(ws, user, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== 'object') return;

  const text = typeof msg.text === 'string' ? msg.text.trim() : '';

  switch (msg.type) {
    case 'group': {
      if (!text) return;
      if (text.length > MAX_TEXT) return tolak(ws, `Pesan terlalu panjang (maksimal ${MAX_TEXT} karakter).`);
      if (terlaluCepat(user.id)) return tolak(ws, 'Terlalu banyak pesan sekaligus. Tunggu beberapa detik.');
      const id = saveMessage(user.id, null, text);
      const payload = {
        type: 'group', id, from: user, text, at: Date.now(),
      };
      // kirim ke semua (termasuk pengirim, agar sinkron antar perangkat)
      broadcast(payload);
      break;
    }
    case 'pm': {
      const to = Number(msg.to);
      if (!Number.isInteger(to) || to === user.id) return;
      if (!text) return;
      if (text.length > MAX_TEXT) return tolak(ws, `Pesan terlalu panjang (maksimal ${MAX_TEXT} karakter).`);
      if (terlaluCepat(user.id)) return tolak(ws, 'Terlalu banyak pesan sekaligus. Tunggu beberapa detik.');
      const target = db.prepare('SELECT id FROM users WHERE id = ?').get(to);
      if (!target) {
        return ws.send(JSON.stringify({ type: 'error', error: 'User tujuan tidak ditemukan.' }));
      }
      const id = saveMessage(user.id, to, text);
      const payload = { type: 'pm', id, from: user, to, text, at: Date.now() };
      sendTo(to, payload);
      sendTo(user.id, payload); // echo ke semua perangkat si pengirim
      break;
    }
    case 'typing': {
      // msg.to undefined = sedang mengetik di room grup
      const to = msg.to === undefined || msg.to === null ? null : Number(msg.to);
      const payload = { type: 'typing', from: user, to };
      if (to === null) broadcast(payload, ws);
      else sendTo(to, payload);
      break;
    }
    default:
      ws.send(JSON.stringify({ type: 'error', error: 'Tipe pesan tidak dikenal.' }));
  }
}

function attachChat(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const user = userByToken(url.searchParams.get('token'));
    if (!user) {
      ws.close(4001, 'Token tidak valid');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const firstJoin = !isOnline(user.id);
    addClient(user.id, ws);
    if (firstJoin) broadcast(presencePayload(user.id, user.username, 'online'));

    // Kirim daftar user + status online saat pertama terhubung
    const users = db.prepare('SELECT id, username FROM users ORDER BY username COLLATE NOCASE').all()
      .map((r) => ({ id: Number(r.id), username: r.username, online: isOnline(Number(r.id)) }));
    ws.send(JSON.stringify({ type: 'hello', user, users }));

    // Pesan yang tertinggal selagi dia offline (kalau ada).
    ws.on('message', (raw) => handleMessage(ws, user, raw.toString()));
    ws.on('close', () => {
      removeClient(user.id, ws);
      if (!isOnline(user.id)) {
        // Semua perangkat sudah putus: apa pun yang terjadi sampai detik ini
        // dianggap sudah sampai, jadi tidak dikirim ulang nanti.
        simpanKursor(user.id);
        broadcast(presencePayload(user.id, user.username, 'offline'));
      }
    });
    ws.on('error', () => {});

    // Terakhir: kirim pesan yang tertinggal. Dibungkus try supaya gangguan di
    // sini tidak sampai menghalangi pesan berikutnya.
    try {
      catchUp(ws, user);
    } catch (e) {
      console.error('Gagal mengirim pesan tertinggal:', e.message);
    }
  });

  // Heartbeat: buang koneksi mati (HP sleep, jaringan putus, dll.)
  const interval = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(interval));

  return { isOnline };
}

module.exports = { attachChat, isOnline, catchUp };
