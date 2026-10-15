// ChatRoom — satu Durable Object (instance "main") yang menyimpan:
//   * database SQLite (users, sessions, messages)  → riwayat chat permanen
//   * semua koneksi WebSocket                      → pesan realtime
//
// API-nya dibuat sama persis dengan server Node lokal, jadi aplikasi Android,
// klien CMD, dan Termux tidak perlu diubah sama sekali.

import { json, hashPassword, verifyPassword, randomToken, AMAN } from './util.js';

// Batas keamanan — sengaja disamakan dengan server Node lokal supaya
// perilakunya identik di semua tempat.
const MAX_TEXT = 2000;
const MAX_PASSWORD = 72; // PBKDF2 sebenarnya tak terbatas, tapi disamakan dengan bcrypt
const LOGIN_MAKS = 10; // percobaan login gagal per IP tiap 15 menit
const REGISTER_MAKS = 10; // akun baru per IP tiap jam
const KIRIM_MAKS = 15; // pesan per 5 detik untuk tiap user
const JENDELA_KIRIM_MS = 5000;
const SESSION_HARI = 90; // masa berlaku token login
const MASA_TOKEN_MS = SESSION_HARI * 24 * 60 * 60 * 1000;

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const dec = new TextDecoder();

/** Penghitung sederhana: berapa kali sebuah kunci dipakai dalam jendela waktu. */
class Jendela {
  constructor(maks, ms) {
    this.maks = maks;
    this.ms = ms;
    this.m = new Map();
  }
  /** true kalau kunci ini sudah melewati batas (jangan dilayani). */
  penuh(key) {
    const a = this.m.get(key);
    return !!a && Date.now() <= a.resetAt && a.count >= this.maks;
  }
  /** Tambah hitungan; true kalau sudah melewati batas. */
  catat(key) {
    const now = Date.now();
    let a = this.m.get(key);
    if (!a || now > a.resetAt) {
      a = { count: 0, resetAt: now + this.ms };
      this.m.set(key, a);
    }
    a.count += 1;
    return a.count > this.maks;
  }
  hapus(key) {
    this.m.delete(key);
  }
}

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    // Penangkal brute-force & spam.
    this.loginAttempts = new Jendela(LOGIN_MAKS, 15 * 60 * 1000);
    this.registrasi = new Jendela(REGISTER_MAKS, 60 * 60 * 1000);
    this.kirim = new Jendela(KIRIM_MAKS, JENDELA_KIRIM_MS);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  // ------------------------------------------------------------- database

  migrate() {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS users (
         id            INTEGER PRIMARY KEY AUTOINCREMENT,
         username      TEXT    UNIQUE NOT NULL COLLATE NOCASE,
         password_hash TEXT    NOT NULL,
         created_at    INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS sessions (
         token      TEXT    PRIMARY KEY,
         user_id    INTEGER NOT NULL,
         created_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS messages (
         id           INTEGER PRIMARY KEY AUTOINCREMENT,
         sender_id    INTEGER NOT NULL,
         recipient_id INTEGER,              -- NULL = pesan room grup "Umum"
         text         TEXT    NOT NULL,
         created_at   INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, id)`,
      `CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_id, recipient_id)`,
      // Sampai pesan nomor berapa yang sudah "sampai" ke tiap pengguna —
      // untuk mengirim ulang pesan yang tertinggal saat dia kembali online.
      `CREATE TABLE IF NOT EXISTS delivered (
         user_id  INTEGER PRIMARY KEY,
         last_id  INTEGER NOT NULL DEFAULT 0
       )`,
    ];
    for (const s of stmts) this.sql.exec(s);
    // Buang sesi yang sudah kedaluwarsa (token berlaku SESSION_HARI hari).
    this.sql.exec('DELETE FROM sessions WHERE created_at < ?', Date.now() - MASA_TOKEN_MS);
  }

  all(sql, ...params) {
    return [...this.sql.exec(sql, ...params)];
  }

  one(sql, ...params) {
    return this.all(sql, ...params)[0] ?? null;
  }

  // ------------------------------------------------ pesan yang tertinggal

  /** Id pesan terakhir di seluruh database (0 kalau belum ada pesan). */
  idTerakhir() {
    const row = this.one('SELECT IFNULL(MAX(id), 0) AS m FROM messages');
    return row ? Number(row.m) : 0;
  }

  /** Id pesan terakhir yang sudah sampai ke pengguna ini. */
  kursor(userId) {
    const row = this.one('SELECT last_id FROM delivered WHERE user_id = ?', userId);
    return row ? Number(row.last_id) : 0;
  }

  /** Tandai: semua pesan sampai id tertentu sudah sampai ke pengguna ini. */
  simpanKursor(userId, sampai) {
    this.sql.exec(
      'INSERT OR REPLACE INTO delivered (user_id, last_id) VALUES (?, ?)',
      userId, sampai === undefined ? this.idTerakhir() : sampai,
    );
  }

  /**
   * Buat penanda untuk pengguna yang belum punya (saat daftar & login) supaya
   * pengguna baru tidak dibanjiri pesan lama — riwayat tetap bisa dibuka.
   */
  pastikanKursor(userId) {
    this.sql.exec(
      'INSERT OR IGNORE INTO delivered (user_id, last_id) VALUES (?, ?)',
      userId, this.idTerakhir(),
    );
  }

  /** Kirim semua pesan relevan yang belum pernah sampai ke pengguna ini. */
  catchUp(server, user) {
    const sejak = this.kursor(user.id);
    const rows = this.all(
      `SELECT m.id AS id, m.sender_id AS sender_id, m.recipient_id AS recipient_id,
              m.text AS text, m.created_at AS created_at, u.username AS username
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.id > ? AND (m.recipient_id IS NULL OR m.recipient_id = ? OR m.sender_id = ?)
        ORDER BY m.id DESC LIMIT 300`,
      sejak, user.id, user.id,
    ).reverse();

    for (const r of rows) {
      const dari = { id: Number(r.sender_id), username: r.username };
      const payload = r.recipient_id === null || r.recipient_id === undefined
        ? { type: 'group', id: Number(r.id), from: dari, text: r.text, at: Number(r.created_at) }
        : {
          type: 'pm',
          id: Number(r.id),
          from: dari,
          to: Number(r.recipient_id),
          text: r.text,
          at: Number(r.created_at),
        };
      try { server.send(JSON.stringify(payload)); } catch { /* socket sudah mati */ }
    }
    this.simpanKursor(user.id);
    return rows.length;
  }

  // ---------------------------------------------------------------- socket

  sockets() {
    return this.ctx.getWebSockets();
  }

  onlineIds() {
    const ids = new Set();
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.user) ids.add(att.user.id);
    }
    return ids;
  }

  isOnline(userId) {
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.user && att.user.id === userId) return true;
    }
    return false;
  }

  usersList() {
    const online = this.onlineIds();
    return this.all('SELECT id, username FROM users ORDER BY username COLLATE NOCASE')
      .map((r) => ({ id: Number(r.id), username: r.username, online: online.has(Number(r.id)) }));
  }

  sendTo(userId, payload) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets()) {
      const att = ws.deserializeAttachment();
      if (att && att.user && att.user.id === userId) {
        try { ws.send(data); } catch { /* socket sudah mati */ }
      }
    }
  }

  broadcast(payload, exceptWs) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets()) {
      if (ws === exceptWs) continue;
      try { ws.send(data); } catch { /* socket sudah mati */ }
    }
  }

  presence(user, status) {
    return { type: 'presence', user: { id: user.id, username: user.username }, status };
  }

  /** Kirim pesan kesalahan ke satu socket (tanpa memutus koneksi). */
  tolak(ws, pesan) {
    try { ws.send(JSON.stringify({ type: 'error', error: pesan })); } catch { /* socket sudah mati */ }
  }

  // ------------------------------------------------------------------ auth

  tokenOf(request) {
    return String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  }

  userByToken(token) {
    if (typeof token !== 'string' || token.length !== 64) return null;
    const row = this.one(
      `SELECT u.id AS id, u.username AS username
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.created_at >= ?`,
      token, Date.now() - MASA_TOKEN_MS,
    );
    return row ? { id: Number(row.id), username: row.username } : null;
  }

  currentUser(request) {
    return this.userByToken(this.tokenOf(request));
  }

  // ------------------------------------------------------------ percobaan

  /** IP pengunjung (dipakai untuk membatasi percobaan login / pendaftaran). */
  ipOf(request) {
    return request.headers.get('CF-Connecting-IP') || 'lokal';
  }

  // -------------------------------------------------------------- HTTP API

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade(url);
    }

    switch (url.pathname) {
      case '/api/register': return this.register(request);
      case '/api/login': return this.login(request);
      case '/api/logout': return this.logout(request);
      case '/api/change-password': return this.changePassword(request);
      case '/api/me': return this.me(request);
      case '/api/users': return this.users(request);
      case '/api/messages': return this.messages(request, url);
      default: return json({ error: 'Endpoint tidak ditemukan.' }, 404);
    }
  }

  async body(request) {
    try { return await request.json(); } catch { return null; }
  }

  async register(request) {
    const ip = this.ipOf(request);
    if (this.registrasi.penuh(ip)) {
      return json({ error: 'Terlalu banyak akun dibuat dari jaringan ini. Coba lagi 1 jam lagi.' }, 429);
    }
    this.registrasi.catat(ip);

    const b = await this.body(request);
    if (!b) return json({ error: 'Data tidak valid.' }, 400);

    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';

    if (!USERNAME_RE.test(username)) {
      return json({ error: 'Nama pengguna harus 3-20 karakter (huruf, angka, atau underscore).' }, 400);
    }
    if (password.length < 6 || password.length > MAX_PASSWORD) {
      return json({ error: `Kata sandi minimal 6 dan maksimal ${MAX_PASSWORD} karakter.` }, 400);
    }
    if (this.one('SELECT id FROM users WHERE username = ?', username)) {
      return json({ error: 'Nama pengguna sudah dipakai.' }, 409);
    }

    const hash = await hashPassword(password);
    let row;
    try {
      row = this.one(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?) RETURNING id',
        username, hash, Date.now(),
      );
    } catch (e) {
      if (String(e && e.message || '').toUpperCase().includes('UNIQUE')) {
        return json({ error: 'Nama pengguna sudah dipakai.' }, 409);
      }
      throw e;
    }

    const user = { id: Number(row.id), username };
    const token = randomToken();
    this.sql.exec(
      'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
      token, user.id, Date.now(),
    );
    this.pastikanKursor(user.id); // pengguna baru tidak dibanjiri pesan lama
    return json({ token, user }, 201);
  }

  async login(request) {
    const ip = this.ipOf(request);
    if (this.loginAttempts.penuh(ip)) {
      return json({ error: 'Terlalu banyak percobaan. Tunggu 15 menit lagi.' }, 429);
    }

    const b = await this.body(request);
    if (!b) return json({ error: 'Data tidak valid.' }, 400);

    const row = this.one('SELECT * FROM users WHERE username = ?', String(b.username || ''));
    const pw = String(b.password || '').slice(0, MAX_PASSWORD);
    const ok = row ? await verifyPassword(pw, row.password_hash) : false;
    if (!ok) {
      this.loginAttempts.catat(ip);
      return json({ error: 'Nama pengguna atau kata sandi salah.' }, 401);
    }
    this.loginAttempts.hapus(ip);

    const user = { id: Number(row.id), username: row.username };
    this.pastikanKursor(user.id); // pengguna lama mulai dari sekarang
    const token = randomToken();
    this.sql.exec(
      'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
      token, user.id, Date.now(),
    );
    return json({ token, user });
  }

  async logout(request) {
    const token = this.tokenOf(request);
    if (token) this.sql.exec('DELETE FROM sessions WHERE token = ?', token);
    return json({ ok: true });
  }

  /** Ganti kata sandi. Semua perangkat lain otomatis keluar. */
  async changePassword(request) {
    const user = this.currentUser(request);
    if (!user) return json({ error: 'Belum login.' }, 401);

    const b = await this.body(request);
    if (!b) return json({ error: 'Data tidak valid.' }, 400);

    const oldPassword = String(b.oldPassword || '').slice(0, MAX_PASSWORD);
    const newPassword = typeof b.newPassword === 'string' ? b.newPassword : '';
    if (newPassword.length < 6 || newPassword.length > MAX_PASSWORD) {
      return json({ error: `Kata sandi minimal 6 dan maksimal ${MAX_PASSWORD} karakter.` }, 400);
    }

    const row = this.one('SELECT * FROM users WHERE id = ?', user.id);
    if (!row) return json({ error: 'Belum login.' }, 401);
    if (!await verifyPassword(oldPassword, row.password_hash)) {
      return json({ error: 'Kata sandi lama salah.' }, 401);
    }

    const hash = await hashPassword(newPassword);
    this.sql.exec('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id);
    // Buang sesi perangkat lain — perangkat yang mengganti sandi tetap masuk.
    this.sql.exec('DELETE FROM sessions WHERE user_id = ? AND token != ?', user.id, this.tokenOf(request));
    return json({ ok: true });
  }

  async me(request) {
    const user = this.currentUser(request);
    if (!user) return json({ error: 'Belum login.' }, 401);
    return json({ user });
  }

  async users(request) {
    const user = this.currentUser(request);
    if (!user) return json({ error: 'Belum login.' }, 401);
    return json({ users: this.usersList() });
  }

  // Riwayat chat. ?with=<userId> = private message, tanpa = room grup.
  async messages(request, url) {
    const user = this.currentUser(request);
    if (!user) return json({ error: 'Belum login.' }, 401);

    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
    const denganParam = url.searchParams.get('with');

    let rows;
    if (denganParam === null) {
      rows = this.all(
        `SELECT m.id AS id, m.sender_id AS sender_id, m.text AS text,
                m.created_at AS created_at, u.username AS username
           FROM messages m JOIN users u ON u.id = m.sender_id
          WHERE m.recipient_id IS NULL AND m.id < ?
          ORDER BY m.id DESC LIMIT ?`,
        before, limit,
      );
    } else {
      const peer = Number(denganParam);
      if (!Number.isInteger(peer)) return json({ error: 'Parameter with tidak valid.' }, 400);
      rows = this.all(
        `SELECT m.id AS id, m.sender_id AS sender_id, m.recipient_id AS recipient_id,
                m.text AS text, m.created_at AS created_at, u.username AS username
           FROM messages m JOIN users u ON u.id = m.sender_id
          WHERE ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
            AND m.id < ?
          ORDER BY m.id DESC LIMIT ?`,
        user.id, peer, peer, user.id, before, limit,
      );
    }

    const messages = rows.reverse().map((r) => ({
      id: Number(r.id),
      from: { id: Number(r.sender_id), username: r.username },
      to: r.recipient_id === null || r.recipient_id === undefined ? null : Number(r.recipient_id),
      text: r.text,
      at: Number(r.created_at),
    }));
    return json({ messages });
  }

  // --------------------------------------------------------------- WebSocket

  handleUpgrade(url) {
    const user = this.userByToken(url.searchParams.get('token'));
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation: koneksi tetap hidup walau Durable Object "tidur"
    // (hemat, dan tetap gratis).
    this.ctx.acceptWebSocket(server);

    if (!user) {
      server.close(4001, 'Token tidak valid');
      return new Response(null, { status: 101, webSocket: client });
    }

    this.joinSocket(server, user);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sambut socket baru: kirim daftar user + umumkan kehadiran + pesan tertinggal. */
  joinSocket(server, user) {
    const sudahOnline = this.isOnline(user.id);
    server.serializeAttachment({ user });
    server.send(JSON.stringify({ type: 'hello', user, users: this.usersList() }));
    if (!sudahOnline) this.broadcast(this.presence(user, 'online'), server);
    // Pesan yang dikirim selagi dia offline (kalau ada). Dibungkus try supaya
    // gangguan di sini tidak menggagalkan sambungan yang baru dibuka.
    try {
      this.catchUp(server, user);
    } catch (e) {
      console.error('Gagal mengirim pesan tertinggal:', e && e.message);
    }
  }

  async webSocketMessage(ws, message) {
    const att = ws.deserializeAttachment();
    if (!att || !att.user) return;
    const user = att.user;

    let msg;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : dec.decode(message));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const text = typeof msg.text === 'string' ? msg.text.trim() : '';
    const now = Date.now();

    switch (msg.type) {
      case 'group': {
        if (!text) return;
        if (text.length > MAX_TEXT) return this.tolak(ws, `Pesan terlalu panjang (maksimal ${MAX_TEXT} karakter).`);
        if (this.kirim.catat(user.id)) return this.tolak(ws, 'Terlalu banyak pesan sekaligus. Tunggu beberapa detik.');
        const row = this.one(
          'INSERT INTO messages (sender_id, recipient_id, text, created_at) VALUES (?, ?, ?, ?) RETURNING id',
          user.id, null, text, now,
        );
        // Kirim ke semua (termasuk pengirim, agar sinkron antar perangkat).
        this.broadcast({
          type: 'group',
          id: Number(row.id),
          from: { id: user.id, username: user.username },
          text,
          at: now,
        });
        break;
      }

      case 'pm': {
        const to = Number(msg.to);
        if (!Number.isInteger(to) || to === user.id) return;
        if (!text) return;
        if (text.length > MAX_TEXT) return this.tolak(ws, `Pesan terlalu panjang (maksimal ${MAX_TEXT} karakter).`);
        if (this.kirim.catat(user.id)) return this.tolak(ws, 'Terlalu banyak pesan sekaligus. Tunggu beberapa detik.');

        const target = this.one('SELECT id FROM users WHERE id = ?', to);
        if (!target) {
          ws.send(JSON.stringify({ type: 'error', error: 'User tujuan tidak ditemukan.' }));
          return;
        }

        const row = this.one(
          'INSERT INTO messages (sender_id, recipient_id, text, created_at) VALUES (?, ?, ?, ?) RETURNING id',
          user.id, to, text, now,
        );
        const payload = {
          type: 'pm',
          id: Number(row.id),
          from: { id: user.id, username: user.username },
          to,
          text,
          at: now,
        };
        this.sendTo(to, payload);
        this.sendTo(user.id, payload); // echo ke semua perangkat si pengirim
        break;
      }

      case 'typing': {
        // msg.to null/kosong = sedang mengetik di room grup
        const to = msg.to === undefined || msg.to === null ? null : Number(msg.to);
        const payload = { type: 'typing', from: { id: user.id, username: user.username }, to };
        if (to === null) this.broadcast(payload, ws);
        else this.sendTo(to, payload);
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', error: 'Tipe pesan tidak dikenal.' }));
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att || !att.user) return;
    const user = att.user;

    // Masih ada perangkat lain milik user yang sama? Kalau tidak, tandai offline
    // dan catat bahwa semua pesan sampai detik ini sudah sampai (tidak dikirim
    // ulang saat dia sambung lagi nanti).
    const masihOnline = this.sockets().some((other) => {
      if (other === ws) return false;
      const b = other.deserializeAttachment();
      return b && b.user && b.user.id === user.id;
    });
    if (!masihOnline) {
      this.simpanKursor(user.id);
      this.broadcast(this.presence(user, 'offline'));
    }
  }

  async webSocketError(ws) {
    // Diikuti webSocketClose; tidak perlu apa-apa.
  }
}
