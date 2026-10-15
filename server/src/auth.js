'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { pastikanKursor } = require('./terkirim');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ------------------------------------------------------- pengaturan keamanan
// Semuanya bisa diubah lewat environment variable tanpa menyentuh kode.
const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 12; // 10 = bawaan, 12 = 4x lebih sulit ditebak
const LOGIN_MAKS = Number(process.env.LOGIN_MAKS) || 10; // percobaan login gagal per 15 menit
const REGISTER_MAKS = Number(process.env.REGISTER_MAKS) || 10; // akun baru per jam per IP
const SESSION_HARI = Number(process.env.SESSION_HARI) || 90; // masa berlaku token login

// bcrypt hanya memakai 72 karakter pertama, jadi dibatasi sejak awal
// supaya pengguna tidak menyangka sandinya tersimpan utuh.
const MAX_PASSWORD = 72;

const JENDELA_LOGIN_MS = 15 * 60 * 1000;
const JENDELA_REGISTER_MS = 60 * 60 * 1000;
const MASA_TOKEN_MS = SESSION_HARI * 24 * 60 * 60 * 1000;

// Hash palsu untuk menyamakan waktu respons: kalau username tidak ada, server
// tetap menghitung hash agar penyerang tidak bisa menebak "username ini ada
// atau tidak" dari kecepatan jawaban.
const HASH_PALSU = bcrypt.hashSync('kata-sandi-palsu-tidak-nyata', BCRYPT_COST);

// Bersihkan sesi yang sudah kedaluwarsa (sekali saat server mulai).
db.prepare('DELETE FROM sessions WHERE created_at < ?').run(Date.now() - MASA_TOKEN_MS);

// ------------------------------------------------------------- pembatasan

const attempts = new Map(); // ip -> { count, resetAt }
const registrations = new Map(); // ip -> { count, resetAt }

/** Tambah hitungan; true kalau sudah melewati batas. */
function catat(map, key, maks, ms) {
  const now = Date.now();
  const a = map.get(key);
  if (!a || now > a.resetAt) {
    map.set(key, { count: 1, resetAt: now + ms });
    return false;
  }
  a.count += 1;
  return a.count > maks;
}

/** true kalau kunci ini sedang kena batas. */
function penuh(map, key, maks, ms) {
  const a = map.get(key);
  return !!a && Date.now() <= a.resetAt && a.count >= maks;
}

// ------------------------------------------------------------------ helper

function publicUser(row) {
  return { id: row.id, username: row.username };
}

function sandiValid(pw) {
  return typeof pw === 'string' && pw.length >= 6 && pw.length <= MAX_PASSWORD;
}

function pesanSandi() {
  return `Kata sandi minimal 6 dan maksimal ${MAX_PASSWORD} karakter.`;
}

function tokenOf(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now());
  return token;
}

// ---------------------------------------------------------------- API auth

async function register(req, res) {
  const ip = req.ip || 'lokal';
  if (penuh(registrations, ip, REGISTER_MAKS, JENDELA_REGISTER_MS)) {
    return res.status(429).json({ error: 'Terlalu banyak akun dibuat dari jaringan ini. Coba lagi 1 jam lagi.' });
  }
  catat(registrations, ip, REGISTER_MAKS, JENDELA_REGISTER_MS);

  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Nama pengguna harus 3-20 karakter (huruf, angka, atau underscore).' });
  }
  if (!sandiValid(password)) {
    return res.status(400).json({ error: pesanSandi() });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Nama pengguna sudah dipakai.' });

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, hash, Date.now());
  const user = { id: Number(info.lastInsertRowid), username };
  pastikanKursor(user.id); // pengguna baru tidak dibanjiri pesan lama
  const token = createSession(user.id);
  res.status(201).json({ token, user });
}

async function login(req, res) {
  const ip = req.ip || 'lokal';
  if (penuh(attempts, ip, LOGIN_MAKS, JENDELA_LOGIN_MS)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Tunggu 15 menit lagi.' });
  }

  const { username, password } = req.body || {};
  const pw = String(password || '').slice(0, MAX_PASSWORD);
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));

  let ok = false;
  if (row) {
    ok = await bcrypt.compare(pw, row.password_hash);
  } else {
    bcrypt.compareSync(pw, HASH_PALSU); // samakan waktu respons
  }

  if (!ok) {
    catat(attempts, ip, LOGIN_MAKS, JENDELA_LOGIN_MS);
    return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
  }
  attempts.delete(ip);
  pastikanKursor(row.id); // pengguna lama (sebelum fitur ini) mulai dari sekarang

  // Kalau hash lama dibuat dengan biaya bcrypt lebih rendah, perbarui diam-diam
  // supaya lama-lama semua sandi memakai biaya terkuat.
  try {
    if (bcrypt.getRounds(row.password_hash) < BCRYPT_COST) {
      const baru = await bcrypt.hash(pw, BCRYPT_COST);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(baru, row.id);
    }
  } catch { /* format hash bukan bcrypt — biarkan apa adanya */ }

  const token = createSession(row.id);
  res.json({ token, user: publicUser(row) });
}

/** Ganti kata sandi. Semua perangkat lain otomatis keluar. */
async function changePassword(req, res) {
  const token = tokenOf(req);
  const user = userByToken(token);
  if (!user) return res.status(401).json({ error: 'Belum login.' });

  const { oldPassword, newPassword } = req.body || {};
  if (!sandiValid(newPassword)) {
    return res.status(400).json({ error: pesanSandi() });
  }

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const ok = await bcrypt.compare(String(oldPassword || '').slice(0, MAX_PASSWORD), row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Kata sandi lama salah.' });

  const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  // Buang sesi perangkat lain — perangkat yang mengganti sandi tetap masuk.
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(user.id, token);

  res.json({ ok: true });
}

/** Cari user dari token (untuk HTTP & WebSocket). Token kedaluwarsa ditolak. */
function userByToken(token) {
  if (typeof token !== 'string' || token.length !== 64) return null;
  const row = db.prepare(`
    SELECT u.id, u.username FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.created_at >= ?
  `).get(token, Date.now() - MASA_TOKEN_MS);
  return row ? publicUser(row) : null;
}

function logout(req, res) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenOf(req));
  res.json({ ok: true });
}

module.exports = {
  register,
  login,
  logout,
  changePassword,
  userByToken,
  tokenOf,
  BCRYPT_COST,
  MAX_PASSWORD,
};
